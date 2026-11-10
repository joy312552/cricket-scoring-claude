import crypto from 'node:crypto';
import { getStore, Conflict, storeWarning } from './store.js';
import { defaultRules, newInnings, dispatch, undo, editAt, rebuild, matchResult, RuleError } from './engine.js';
import { buildVM, names, pointsTable } from './vm.js';

const IS_PROD = !!process.env.VERCEL;
const secret = () => {
  const s = process.env.SESSION_SECRET || (IS_PROD ? null : 'dev-only-secret-change-me');
  if (!s) throw httpErr(500, 'SESSION_SECRET is not set. See README step 3.');
  return s;
};
export const httpErr = (status, message, code) => Object.assign(new Error(message), { status, code });
const rid = (p) => p + crypto.randomBytes(6).toString('hex');
const b64u = (b) => Buffer.from(b).toString('base64url');
const hmac = (s) => crypto.createHmac('sha256', secret()).update(s).digest('base64url');
const sha = (s) => crypto.createHash('sha256').update(s).digest('hex');
const str = (v, n = 120) => (typeof v === 'string' ? v.trim().slice(0, n) : '');
const img = (v) => (typeof v === 'string' && v.startsWith('data:image/') && v.length < 90000 ? v : (typeof v === 'string' && /^https:\/\//.test(v) && v.length < 500 ? v : ''));
const color = (v, d) => (/^#[0-9a-fA-F]{6}$/.test(v || '') ? v : d);

// ---------- crypto helpers ----------
const key32 = () => crypto.createHash('sha256').update('tok:' + secret()).digest();
function enc(text) { const iv = crypto.randomBytes(12), c = crypto.createCipheriv('aes-256-gcm', key32(), iv);
  const e = Buffer.concat([c.update(text, 'utf8'), c.final()]); return b64u(Buffer.concat([iv, c.getAuthTag(), e])); }
function dec(t) { const b = Buffer.from(t, 'base64url'), d = crypto.createDecipheriv('aes-256-gcm', key32(), b.subarray(0, 12));
  d.setAuthTag(b.subarray(12, 28)); return Buffer.concat([d.update(b.subarray(28)), d.final()]).toString('utf8'); }
const hashPw = (pw, salt) => crypto.scryptSync(pw, salt, 32).toString('hex');
const mailOn = () => !!process.env.RESEND_API_KEY;
async function sendMail(to, subject, html) {
  if (!mailOn()) return false;
  try { const r = await fetch('https://api.resend.com/emails', { method: 'POST', headers: { Authorization: `Bearer ${process.env.RESEND_API_KEY}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({ from: process.env.EMAIL_FROM || 'CREASE <onboarding@resend.dev>', to: [to], subject, html }) }); return r.ok; } catch { return false; }
}
const originOf = (req) => process.env.APP_URL || `${req.headers['x-forwarded-proto'] || 'http'}://${req.headers['x-forwarded-host'] || req.headers.host}`;
async function issueToken(prefix, email, ttlMs) { const tk = b64u(crypto.randomBytes(32)); await S().put(`${prefix}:${sha(tk)}`, { email, exp: Date.now() + ttlMs }, null); return tk; }
async function takeToken(prefix, tk) { const k = `${prefix}:${sha(String(tk || ''))}`, r = await S().get(k); if (!r || r.value.exp < Date.now()) return null; await S().del(k); return r.value; }
async function sendVerify(req, email) {
  const tk = await issueToken('ver', email, 3 * 864e5), link = `${originOf(req)}/app/#/verify?t=${tk}`;
  const sent = await sendMail(email, 'Verify your CREASE account', `<p>Welcome to CREASE.</p><p><a href="${link}">Verify my email</a></p><p>The link works for 3 days.</p>`);
  return { sent, link: IS_PROD ? undefined : link };
}

// ---------- rate limit (per instance; best effort on serverless) ----------
const hits = new Map();
function limit(k, max, ms) { const n = Date.now(), a = (hits.get(k) || []).filter(t => n - t < ms); a.push(n); hits.set(k, a);
  if (a.length > max) throw httpErr(429, 'Too many attempts. Wait a minute and try again.'); }

// ---------- store helpers ----------
const S = () => getStore();
const sleep = (ms) => new Promise(r => setTimeout(r, ms));
// Realtime: after every committed match write, broadcast a tiny "version changed" ping on an unguessable channel.
// The ping carries only a number; clients then fetch the real state through the normal authorised endpoints.
const rtChannel = (id) => 'mx' + sha(id + ':' + secret()).slice(0, 28);
const rtInfo = (id) => (process.env.SUPABASE_URL && process.env.SUPABASE_ANON_KEY ? { url: String(process.env.SUPABASE_URL).trim().replace(/\/rest\/v1\/?$/, '').replace(/\/+$/, ''), key: String(process.env.SUPABASE_ANON_KEY).trim(), ch: rtChannel(id) } : null);
async function rtPing(id, v) {
  const url = process.env.SUPABASE_URL, key = process.env.SUPABASE_SERVICE_KEY; if (!url || !key || !process.env.SUPABASE_ANON_KEY) return;
  const k = key.trim().replace(/^['"]|['"]$/g, ''), h = { apikey: k, 'Content-Type': 'application/json' }; if (k.startsWith('eyJ')) h.Authorization = `Bearer ${k}`;
  try { await Promise.race([fetch(`${String(url).trim().replace(/\/rest\/v1\/?$/, '').replace(/\/+$/, '')}/realtime/v1/api/broadcast`, { method: 'POST', headers: h, body: JSON.stringify({ messages: [{ topic: rtChannel(id), event: 'ping', payload: { v }, private: false }] }) }), sleep(700)]); } catch {}
}
async function mutate(key, fn, init) {
  for (let i = 0; i < 6; i++) {
    let cur = await S().get(key); let ver = cur?.version ?? null; let val = cur ? cur.value : (init ? init() : null);
    if (val === null) throw httpErr(404, 'Not found');
    const out = await fn(val);
    try { const { version } = await S().put(key, val, ver); if (key.startsWith('match:')) await rtPing(val.id, version); return { out, version, value: val }; }
    catch (e) { if (!(e instanceof Conflict)) throw e; }
  }
  throw httpErr(409, 'Busy, please retry', 'CONFLICT');
}
const emptyData = () => ({ teams: [], players: [], tournaments: [], sponsors: [], matchIds: [], shared: [] });
const mutateData = (uid, fn) => mutate('data:' + uid, fn, emptyData);

// ---------- auth ----------
function sessionCookie(uid) {
  const exp = Date.now() + 30 * 864e5, p = `${uid}.${exp}`;
  return `crease_sid=${p}.${hmac(p)}; Path=/; HttpOnly; SameSite=Lax; Max-Age=${30 * 86400}${IS_PROD ? '; Secure' : ''}`;
}
const clearCookie = () => `crease_sid=; Path=/; HttpOnly; SameSite=Lax; Max-Age=0${IS_PROD ? '; Secure' : ''}`;
async function authUser(req) {
  const m = /(?:^|;\s*)crease_sid=([^;]+)/.exec(req.headers.cookie || ''); if (!m) return null;
  const [uid, exp, sig] = m[1].split('.'); if (!uid || !sig || Number(exp) < Date.now()) return null;
  const a = Buffer.from(sig), b = Buffer.from(hmac(`${uid}.${exp}`)); if (a.length !== b.length || !crypto.timingSafeEqual(a, b)) return null;
  const c = uidCache.get(uid); if (c && c.exp > Date.now()) return c.u;
  const u = await S().get('uid:' + uid); const out = u ? { id: uid, ...u.value } : null; if (out) uidCache.set(uid, { u: out, exp: Date.now() + 60000 }); return out;
}
const uidCache = new Map();
const need = (u) => { if (!u) throw httpErr(401, 'Please sign in'); return u; };

// ---------- permissions ----------
async function loadMatch(id) { const r = await S().get('match:' + id); if (!r) throw httpErr(404, 'Match not found'); return { doc: r.value, version: r.version }; }
function perm(doc, u, p) {
  if (!u) return false; if (doc.owner === u.id) return true;
  const m = (doc.members || []).find(x => x.uid === u.id); return !!(m && m[p]);
}
const need2 = (doc, u, p) => { if (!perm(doc, u, p)) throw httpErr(403, 'You do not have permission for this action'); };

// ---------- celebration plumbing ----------
const FX = { FOUR_SCORED: 'four', SIX_SCORED: 'six', WICKET_TAKEN: 'wicket', NO_BALL: 'noball', WIDE: 'wide', FIFTY_REACHED: 'fifty',
  CENTURY_REACHED: 'century', HAT_TRICK: 'hattrick', MAIDEN_OVER: 'maiden' };
export const defaultSettings = () => ({ theme: 'arena', mode: 'auto', duration: 3600, position: 'bottom', scale: 1, safe: 40, sound: false,
  celebrations: { four: true, six: true, wicket: true, noball: true, wide: false, fifty: true, century: true, hattrick: true, maiden: true },
  sponsorIds: [], ticker: true });
function pushEvents(doc, evs) {
  const N = names(doc), inn = doc.innings[doc.cur], st = inn?.state;
  for (const e of evs) {
    const k = FX[e.type]; if (!k) continue;
    const p = { ...e.payload };
    for (const f of ['batter', 'bowler', 'fielder']) if (p[f]) p[f + 'Name'] = N[p[f]]?.name || '';
    if (p.batter && st?.batters[p.batter]) { const b = st.batters[p.batter]; p.stat = { runs: b.runs, balls: b.balls, fours: b.fours, sixes: b.sixes }; }
    if (st) p.team = doc.sides[inn.side].team.short;
    const ev = { seq: ++doc.eventSeq, type: e.type, fx: k, payload: p, ts: Date.now() };
    if (!doc.settings.celebrations[k]) continue;
    if (doc.settings.mode === 'approve') { doc.pending.push(ev); doc.pending = doc.pending.slice(-20); }
    else { doc.overlay.push(ev); }
  }
  doc.overlay = doc.overlay.slice(-30);
}
const manualFx = (doc, fx, payload = {}) => { const ev = { seq: ++doc.eventSeq, type: 'MANUAL', fx, payload, ts: Date.now() }; doc.overlay.push(ev); doc.overlay = doc.overlay.slice(-30); return ev; };

// ---------- match helpers ----------
function sideOfBat(doc) { const w = doc.toss.winner, o = w === 'A' ? 'B' : 'A'; return doc.toss.decision === 'bat' ? w : o; }
function resultOf(doc, i = 0, j = 1, so = false) {
  const i1 = doc.innings[i], i2 = doc.innings[j], nm = [doc.sides[i1.side].team.name, doc.sides[i2.side].team.name];
  const r = matchResult({ runs: i1.state.runs, wickets: i1.state.wickets }, i2.state, nm, i2.state.rules.playersPerSide);
  if (r.status === 'tie') return { kind: 'tie', text: so ? 'Super Over tied' : 'Match tied' };
  if (r.status === 'won') { const side = r.winner === nm[1] ? i2.side : i1.side;
    if (so) return { kind: 'won', winner: side, by: 'superover', margin: 0, text: `${r.winner} won the Super Over` };
    return { kind: 'won', winner: side, by: r.by, margin: r.margin, text: `${r.winner} won by ${r.margin} ${r.by === 'runs' ? (r.margin === 1 ? 'run' : 'runs') : (r.margin === 1 ? 'wicket' : 'wickets')}` }; }
  return null;
}
function syncStatus(doc) {
  const inn = doc.innings[doc.cur]; if (!inn) return;
  if (inn.state.status === 'live') { if (['break', 'complete'].includes(doc.status) && !(doc.result && ['abandoned', 'noResult'].includes(doc.result.kind))) { doc.status = 'live'; doc.result = null; } return; }
  const n = doc.cur;
  if (n % 2 === 0) { doc.status = 'break'; return; }
  doc.status = 'complete'; doc.result = resultOf(doc, n - 1, n, n >= 3) || { kind: 'tie', text: n >= 3 ? 'Super Over tied' : 'Match tied' };
}
function startInnings(doc, side, open, so) {
  const bat = side, bowl = side === 'A' ? 'B' : 'A', n = doc.innings.length;
  const batXI = so ? [...new Set(open.batters || [])] : doc.xi[bat], bowlXI = doc.xi[bowl];
  if (so && (batXI.length !== 3 || !batXI.every(x => doc.xi[bat].includes(x)))) throw httpErr(422, 'Choose exactly 3 batters for the Super Over');
  const ok = (id, xi) => xi.includes(id);
  if (!ok(open.striker, batXI) || !ok(open.nonStriker, batXI) || open.striker === open.nonStriker || !ok(open.bowler, bowlXI)) throw httpErr(422, 'Choose two different openers from the batting side and a bowler from the bowling side');
  const rules = defaultRules({ ...doc.rules, playersPerSide: so ? 3 : batXI.length, ...(so ? { oversLimit: 1, maxOversPerBowler: null } : {}) });
  const init = { rules, battingXI: batXI, bowlingXI: bowlXI, striker: open.striker, nonStriker: open.nonStriker, bowler: open.bowler, target: n % 2 === 1 ? doc.innings[n - 1].state.runs + 1 : null };
  doc.innings.push({ side, init, log: [], state: newInnings(init), so: !!so }); doc.cur = doc.innings.length - 1; doc.status = 'live';
}
const nextSide = (doc) => { const n = doc.innings.length, last = doc.innings[n - 1]; return n % 2 === 1 ? (last.side === 'A' ? 'B' : 'A') : last.side; };
async function indexPublic(doc) {
  try { await mutate('pub:index', (ix) => { ix.items = ix.items.filter(x => x.id !== doc.id);
    if (doc.public) ix.items.unshift({ id: doc.id, name: doc.name, status: doc.status, a: doc.sides.A.team.short, b: doc.sides.B.team.short, ts: Date.now() }); ix.items = ix.items.slice(0, 100); }, () => ({ items: [] })); } catch {}
}
const summary = (d) => ({ id: d.id, name: d.name, status: d.status, owner: d.owner, public: d.public, date: d.date, tournamentId: d.tournamentId,
  a: d.sides.A.team.short, b: d.sides.B.team.short, score: d.innings.map(i => `${i.state.runs}/${i.state.wickets} (${Math.floor(i.state.legalBalls / i.state.rules.ballsPerOver)}.${i.state.legalBalls % i.state.rules.ballsPerOver})`), result: d.result?.text || '' });

async function tokenFor(doc) { return dec(doc.tokenEnc); }
async function newToken(doc, version) {
  if (doc.tokenHash) { const old = await S().get('tok:' + doc.tokenHash); if (old) await S().put('tok:' + doc.tokenHash, { ...old.value, revoked: true }, old.version).catch(() => {}); }
  const t = b64u(crypto.randomBytes(32)); const h = sha(t);
  await S().put('tok:' + h, { matchId: doc.id, revoked: false }, null);
  doc.tokenHash = h; doc.tokenEnc = enc(t); void version; return t;
}
const tokCache = new Map();
async function resolveToken(t) {
  const h = sha(String(t)); const c = tokCache.get(h); if (c && c.exp > Date.now()) return c.v;
  const r = await S().get('tok:' + h); const v = r && !r.value.revoked && (!r.value.expires || r.value.expires > Date.now()) ? r.value.matchId : null;
  tokCache.set(h, { v, exp: Date.now() + 15000 }); return v;
}

async function pointsFor(ownerUid, tournamentId) {
  const d = await S().get('data:' + ownerUid); if (!d) return null;
  const tr = d.value.tournaments.find(t => t.id === tournamentId); if (!tr) return null;
  const docs = []; for (const id of d.value.matchIds) { const r = await S().get('match:' + id); if (r && r.value.tournamentId === tournamentId) docs.push(r.value); }
  const teams = d.value.teams.filter(t => (tr.teamIds || []).includes(t.id));
  return { tournament: tr, table: pointsTable(teams, docs, tr.rules || undefined), matches: docs };
}

// =============== ROUTES ===============
const routes = [];
const R = (method, path, fn) => routes.push([method, new RegExp('^' + path.replace(/:(\w+)/g, '(?<$1>[^/]+)') + '/?$'), fn]);

R('POST', '/api/auth/register', async ({ req, body }) => {
  limit('reg:' + req.ip, 10, 60000);
  const email = str(body.email, 200).toLowerCase(), pw = String(body.password || ''), name = str(body.name, 80) || email.split('@')[0];
  if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email)) throw httpErr(422, 'Enter a valid email address');
  if (pw.length < 8) throw httpErr(422, 'Password must be at least 8 characters');
  const id = rid('u_'), salt = crypto.randomBytes(16).toString('hex');
  try { await S().put('user:' + email, { id, email, name, salt, hash: hashPw(pw, salt), created: Date.now(), verified: !mailOn() }, null); }
  catch (e) { if (e instanceof Conflict) throw httpErr(409, 'This email is already registered'); throw e; }
  await S().put('uid:' + id, { email, name }, null);
  const v = mailOn() ? await sendVerify(req, email) : null;
  return { status: 200, headers: { 'Set-Cookie': sessionCookie(id) }, body: { user: { id, email, name, verified: !mailOn() }, devLink: v?.link } };
});
R('POST', '/api/auth/login', async ({ req, body }) => {
  limit('login:' + req.ip, 12, 60000);
  const email = str(body.email, 200).toLowerCase(), u = await S().get('user:' + email);
  const ok = u && crypto.timingSafeEqual(Buffer.from(hashPw(String(body.password || ''), u.value.salt)), Buffer.from(u.value.hash));
  if (!ok) throw httpErr(401, 'Wrong email or password');
  if (process.env.REQUIRE_VERIFIED === '1' && mailOn() && u.value.verified === false) throw httpErr(403, 'Please verify your email first. Check your inbox.');
  return { status: 200, headers: { 'Set-Cookie': sessionCookie(u.value.id) }, body: { user: { id: u.value.id, email, name: u.value.name, verified: u.value.verified !== false } } };
});
R('POST', '/api/auth/logout', async () => ({ status: 200, headers: { 'Set-Cookie': clearCookie() }, body: { ok: true } }));
R('GET', '/api/health', async () => {
  const out = { sessionSecret: !!process.env.SESSION_SECRET, supabaseUrl: !!process.env.SUPABASE_URL, supabaseServiceKey: !!process.env.SUPABASE_SERVICE_KEY, store: S().kind, database: 'not checked' };
  try { await S().get('health-check'); out.database = 'ok (table kv is reachable)'; } catch (e) { out.database = String(e.message).slice(0, 240); }
  out.hint = !out.sessionSecret ? 'Add SESSION_SECRET in Vercel and redeploy.' : S().kind !== 'supabase' ? 'Add SUPABASE_URL and SUPABASE_SERVICE_KEY, then redeploy.' : out.database.startsWith('ok') ? 'Everything looks fine.'
    : /404|PGRST205|relation/.test(out.database) ? 'The table kv does not exist: run schema.sql in the Supabase SQL Editor.' : /401|403|Invalid API key|JWT/.test(out.database) ? 'The service key is wrong or is the anon key. Copy the service_role key.' : /fetch failed|ENOTFOUND/.test(out.database) ? 'SUPABASE_URL is wrong. Use https://PROJECT-ID.supabase.co with nothing after it.' : 'See the database message above.';
  return out;
});
R('GET', '/api/me', async ({ user }) => {
  let verified = true; if (user) { const u = await S().get('user:' + user.email); verified = u?.value.verified !== false; }
  return { user: user ? { id: user.id, email: user.email, name: user.name, verified } : null, warning: storeWarning(), mail: mailOn() };
});
R('POST', '/api/auth/forgot', async ({ req, body }) => {
  limit('forgot:' + req.ip, 5, 60000); const email = str(body.email, 200).toLowerCase();
  if (!mailOn() && IS_PROD) throw httpErr(503, 'Email is not set up on this site yet. The owner must add RESEND_API_KEY.');
  const u = await S().get('user:' + email); let devLink;
  if (u) { const tk = await issueToken('rst', email, 3600e3), link = `${originOf(req)}/app/#/reset?t=${tk}`;
    await sendMail(email, 'Reset your CREASE password', `<p>Reset your password:</p><p><a href="${link}">Choose a new password</a></p><p>The link works for 1 hour. If you did not ask for this, ignore this email.</p>`); if (!IS_PROD) devLink = link; }
  return { ok: true, devLink };
});
R('POST', '/api/auth/reset', async ({ req, body }) => {
  limit('reset:' + req.ip, 10, 60000); const pw = String(body.password || ''); if (pw.length < 8) throw httpErr(422, 'Password must be at least 8 characters');
  const tk = await takeToken('rst', body.token); if (!tk) throw httpErr(400, 'This reset link is invalid or has expired');
  await mutate('user:' + tk.email, (u) => { u.salt = crypto.randomBytes(16).toString('hex'); u.hash = hashPw(pw, u.salt); }); return { ok: true };
});
R('POST', '/api/auth/verify', async ({ body }) => {
  const tk = await takeToken('ver', body.token); if (!tk) throw httpErr(400, 'This verification link is invalid or has expired');
  await mutate('user:' + tk.email, (u) => { u.verified = true; }); return { ok: true };
});
R('POST', '/api/auth/resend', async ({ req, user }) => {
  need(user); limit('resend:' + user.id, 3, 60000); if (!mailOn()) throw httpErr(503, 'Email is not set up on this site yet.');
  const v = await sendVerify(req, user.email); return { ok: v.sent };
});

R('GET', '/api/data', async ({ user }) => {
  need(user); const d = (await S().get('data:' + user.id))?.value || emptyData();
  const rows = await Promise.all([...d.matchIds, ...d.shared].map(id => S().get('match:' + id))); const ms = rows.filter(Boolean).map(r => ({ ...summary(r.value), mine: r.value.owner === user.id }));
  ms.sort((a, b) => (b.date || '').localeCompare(a.date || ''));
  return { teams: d.teams, players: d.players, tournaments: d.tournaments, sponsors: d.sponsors, matches: ms };
});
const COLL = {
  teams: (b, old) => ({ name: str(b.name, 60), short: str(b.short, 5).toUpperCase(), color: color(b.color, '#1f7a3a'), color2: color(b.color2, '#ffffff'), ground: str(b.ground), manager: str(b.manager), desc: str(b.desc, 300), logo: b.logo === undefined ? old?.logo || '' : img(b.logo) }),
  players: (b, old) => ({ name: str(b.name, 60), jersey: str(b.jersey, 3), role: ['batter', 'bowler', 'allrounder', 'keeper'].includes(b.role) ? b.role : 'batter', bat: str(b.bat, 40), bowl: str(b.bowl, 40), dob: str(b.dob, 10), teamIds: Array.isArray(b.teamIds) ? b.teamIds.slice(0, 10).map(x => str(x, 30)) : [], photo: b.photo === undefined ? old?.photo || '' : img(b.photo) }),
  tournaments: (b, old) => ({ name: str(b.name, 80), organizer: str(b.organizer), venue: str(b.venue), start: str(b.start, 10), end: str(b.end, 10), format: ['league', 'knockout', 'group', 'roundrobin', 'custom'].includes(b.format) ? b.format : 'league', overs: Math.min(100, Math.max(1, Number(b.overs) || 20)), teamIds: Array.isArray(b.teamIds) ? b.teamIds.slice(0, 64).map(x => str(x, 30)) : [], desc: str(b.desc, 400),
    rules: { win: Number(b.rules?.win ?? 2), tie: Number(b.rules?.tie ?? 1), nr: Number(b.rules?.nr ?? 1) }, logo: b.logo === undefined ? old?.logo || '' : img(b.logo), public: b.public !== false }),
  sponsors: (b, old) => ({ name: str(b.name, 60), message: str(b.message, 120), logo: b.logo === undefined ? old?.logo || '' : img(b.logo) }),
};
R('PUT', '/api/c/:coll', async ({ user, params, body }) => {
  need(user); const f = COLL[params.coll]; if (!f) throw httpErr(404, 'Unknown collection');
  const item = body && typeof body === 'object' ? body : {};
  const { out } = await mutateData(user.id, (d) => {
    const arr = d[params.coll], old = item.id ? arr.find(x => x.id === item.id) : null;
    const clean = f(item, old); if (!clean.name) throw httpErr(422, 'Name is required');
    if (arr.length >= 500 && !old) throw httpErr(422, 'Limit reached');
    const rec = { ...(old || {}), ...clean, id: old?.id || rid(params.coll[0] + '_') };
    if (old) arr[arr.indexOf(old)] = rec; else arr.push(rec); return rec;
  });
  if (params.coll === 'tournaments') await S().put('trn:' + out.id, { uid: user.id }, null).catch(() => {});
  return out;
});
R('DELETE', '/api/c/:coll/:id', async ({ user, params }) => {
  need(user); if (!COLL[params.coll]) throw httpErr(404, 'Unknown collection');
  await mutateData(user.id, (d) => { d[params.coll] = d[params.coll].filter(x => x.id !== params.id); }); return { ok: true };
});

// ----- matches -----
R('POST', '/api/matches', async ({ user, body }) => {
  need(user);
  const d = (await S().get('data:' + user.id))?.value || emptyData();
  const ta = d.teams.find(t => t.id === body.teamA), tb = d.teams.find(t => t.id === body.teamB);
  if (!ta || !tb || ta.id === tb.id) throw httpErr(422, 'Pick two different teams');
  const tr = d.tournaments.find(t => t.id === body.tournamentId);
  const FORMATS = { T5: 5, T10: 10, T20: 20, T30: 30, ODI: 50, 'The Hundred': 16, Tape: 6, Tennis: 8, Custom: 20, Test: 90 };
  const format = FORMATS[body.format] ? body.format : 'T20';
  const overs = Math.min(200, Math.max(1, Number(body.overs) || FORMATS[format]));
  const bpo = format === 'The Hundred' ? 5 : Math.min(10, Math.max(1, Number(body.ballsPerOver) || 6));
  const side = (t) => ({ team: { id: t.id, name: t.name, short: t.short || t.name.slice(0, 3).toUpperCase(), color: t.color, color2: t.color2, logo: t.logo || '' },
    players: d.players.filter(p => (p.teamIds || []).includes(t.id)).map(p => ({ id: p.id, name: p.name, role: p.role, jersey: p.jersey, photo: '' })) });
  const id = rid('m_').slice(0, 14);
  const doc = { id, owner: user.id, name: str(body.name, 100) || `${ta.name} vs ${tb.name}`, number: str(body.number, 20), tournamentId: tr?.id || '', tournamentName: tr?.name || str(body.tournamentName, 80),
    venue: str(body.venue) || tr?.venue || ta.ground || '', date: str(body.date, 16) || new Date().toISOString().slice(0, 16), format, officials: Array.isArray(body.officials) ? body.officials.slice(0, 6).map(x => str(x, 60)).filter(Boolean) : [],
    rules: { oversLimit: overs, ballsPerOver: bpo, wideRuns: Math.max(0, Number(body.wideRuns ?? 1)), noBallRuns: Math.max(0, Number(body.noBallRuns ?? 1)), freeHit: body.freeHit !== false, maxOversPerBowler: body.maxOversPerBowler ? Number(body.maxOversPerBowler) : null },
    sides: { A: side(ta), B: side(tb) }, xi: { A: [], B: [] }, captain: {}, keeper: {}, toss: null, innings: [], cur: 0, status: 'setup', result: null, potm: null,
    public: body.public !== false, members: [], settings: defaultSettings(), sponsors: [], eventSeq: 0, overlay: [], pending: [], seen: [], lease: null,
    program: { id: 0, graphic: null, params: {}, until: 0 }, preview: { graphic: 'batting', params: {} }, created: Date.now() };
  await newToken(doc);
  await S().put('match:' + id, doc, null);
  await mutateData(user.id, (dd) => { dd.matchIds.unshift(id); });
  await indexPublic(doc);
  return { id };
});
const ownerView = async (doc, u) => ({ doc: { ...doc, tokenEnc: undefined, tokenHash: undefined, seen: undefined, innings: doc.innings.map(i => ({ side: i.side, so: !!i.so, init: i.init, log: i.log, state: i.state })) },
  rt: rtInfo(doc.id), vm: buildVM(doc), perms: { owner: doc.owner === u.id, score: perm(doc, u, 'score'), broadcast: perm(doc, u, 'broadcast') }, links: perm(doc, u, 'broadcast') ? { token: await tokenFor(doc) } : null });
R('GET', '/api/matches/:id', async ({ user, params }) => {
  need(user); const { doc, version } = await loadMatch(params.id); need2(doc, user, 'view');
  return { ...(await ownerView(doc, user)), v: version };
});
R('POST', '/api/matches/:id/players', async ({ user, params, body }) => {
  need(user); const { doc } = await loadMatch(params.id); if (doc.owner !== user.id) throw httpErr(403, 'Owner only');
  const side = body.side === 'B' ? 'B' : 'A', name = str(body.name, 60); if (!name) throw httpErr(422, 'Name required');
  const role = ['batter', 'bowler', 'allrounder', 'keeper'].includes(body.role) ? body.role : 'batter';
  const p = { id: rid('p_'), name, role, jersey: '', teamIds: [doc.sides[side].team.id], bat: '', bowl: '', dob: '', photo: '' };
  await mutateData(user.id, (d) => { d.players.push(p); });
  await mutate('match:' + doc.id, (m) => { m.sides[side].players.push({ id: p.id, name, role, jersey: '', photo: '' }); });
  return p;
});
R('POST', '/api/matches/:id/setup', async ({ user, params, body }) => {
  need(user);
  const { out, value } = await mutate('match:' + params.id, async (doc) => {
    need2(doc, user, 'edit'); if (doc.status !== 'setup') throw httpErr(409, 'Match already started');
    const ids = (s) => new Set(doc.sides[s].players.map(p => p.id));
    const xi = { A: [...new Set(body.xi?.A || [])], B: [...new Set(body.xi?.B || [])] };
    for (const s of ['A', 'B']) { if (xi[s].length < 2 || xi[s].length > 11) throw httpErr(422, `${doc.sides[s].team.name}: choose 2 to 11 players`); if (!xi[s].every(x => ids(s).has(x))) throw httpErr(422, 'Unknown player in XI'); }
    if (!['A', 'B'].includes(body.toss?.winner) || !['bat', 'bowl'].includes(body.toss?.decision)) throw httpErr(422, 'Complete the toss');
    doc.xi = xi; doc.toss = { winner: body.toss.winner, decision: body.toss.decision };
    for (const s of ['A', 'B']) { doc.captain[s] = xi[s].includes(body.captain?.[s]) ? body.captain[s] : null; doc.keeper[s] = xi[s].includes(body.keeper?.[s]) ? body.keeper[s] : null; }
    startInnings(doc, sideOfBat(doc), body.open || {}); return true;
  });
  await indexPublic(value); return { ok: out };
});
R('POST', '/api/matches/:id/cmd', async ({ user, params, body }) => {
  need(user);
  const { out, value, version } = await mutate('match:' + params.id, (doc) => {
    need2(doc, user, 'score');
    if (doc.seen.includes(body.command_id)) return { dup: true };
    if (doc.status !== 'live') throw httpErr(409, 'Match is not live');
    const now = Date.now(), L = doc.lease;
    if (L && L.uid !== user.id && L.until > now && !body.takeover) throw httpErr(409, `${L.name} is scoring this match. Take over to continue.`, 'LEASE');
    doc.lease = { uid: user.id, name: user.name, until: now + 45000 };
    const inn = doc.innings[doc.cur];
    try { const r = dispatch({ init: inn.init, log: inn.log }, body.cmd); inn.log = r.session.log; inn.state = r.state; pushEvents(doc, r.events); }
    catch (e) { if (e instanceof RuleError) throw httpErr(422, ruleMsg(e.code), e.code); throw e; }
    syncStatus(doc); if (body.command_id) { doc.seen.push(body.command_id); doc.seen = doc.seen.slice(-60); } return { ok: true };
  });
  return { ...out, view: { ...(await ownerView(value, user)), v: version } };
});
function ruleMsg(c) { return ({ NEED_BOWLER: 'Select the next bowler first', NEED_INCOMING_BATTER: 'Select the incoming batter', BOWLER_CANNOT_BOWL_CONSECUTIVE_OVERS: 'The same bowler cannot bowl consecutive overs',
  BOWLER_OVER_LIMIT: 'This bowler has reached the over limit', INVALID_DISMISSAL_FOR_DELIVERY: 'That dismissal is not allowed on this delivery (free hit / wide / no-ball)', BAT_RUNS_NOT_ALLOWED: 'Batter runs are not allowed on this extra',
  ONLY_RUNOUT_FOR_NONSTRIKER: 'Only a run out can dismiss the non-striker', INNINGS_COMPLETE: 'Innings is complete', BATTER_ALREADY_BATTED: 'That batter has already batted', BYES_NEED_RUNS: 'Enter the runs' })[c] || c; }
R('POST', '/api/matches/:id/undo', async ({ user, params }) => {
  need(user);
  await mutate('match:' + params.id, (doc) => {
    need2(doc, user, 'score'); const inn = doc.innings[doc.cur]; if (!inn || !inn.log.length) throw httpErr(422, 'Nothing to undo');
    const r = undo({ init: inn.init, log: inn.log }); inn.log = r.session.log; inn.state = r.state;
    doc.audit = [...(doc.audit || []).slice(-100), { t: Date.now(), by: user.name, a: 'undo' }]; syncStatus(doc);
  }); return { ok: true };
});
R('POST', '/api/matches/:id/edit', async ({ user, params, body }) => {
  need(user);
  await mutate('match:' + params.id, (doc) => {
    need2(doc, user, 'score'); const inn = doc.innings[doc.cur]; let idx = -1;
    inn.log.forEach((c, i) => { if (c.t === 'ball') idx = i; }); if (idx < 0) throw httpErr(422, 'No delivery to edit');
    try { const r = editAt({ init: inn.init, log: inn.log }, idx, body.cmd); inn.log = r.session.log; inn.state = r.state; }
    catch (e) { if (e instanceof RuleError) throw httpErr(422, 'Cannot apply that edit: ' + ruleMsg(e.code), e.code); throw e; }
    doc.audit = [...(doc.audit || []).slice(-100), { t: Date.now(), by: user.name, a: 'edit', idx }]; syncStatus(doc);
  }); return { ok: true };
});
R('POST', '/api/matches/:id/innings', async ({ user, params, body }) => {
  need(user);
  await mutate('match:' + params.id, (doc) => {
    need2(doc, user, 'score'); if (doc.status !== 'break') throw httpErr(409, 'Not at innings break');
    startInnings(doc, nextSide(doc), body.open || {}, doc.innings.length >= 2);
  }); return { ok: true };
});
R('POST', '/api/matches/:id/finish', async ({ user, params, body }) => {
  need(user);
  const { value } = await mutate('match:' + params.id, (doc) => {
    need2(doc, user, 'edit');
    if (['abandoned', 'noResult'].includes(body.kind)) { doc.result = { kind: body.kind, text: body.kind === 'abandoned' ? 'Match abandoned' : 'No result' }; doc.status = 'complete'; }
    else if (body.kind === 'manual' && ['A', 'B'].includes(body.winner)) { doc.result = { kind: 'won', winner: body.winner, text: str(body.text, 120) || `${doc.sides[body.winner].team.name} won` }; doc.status = 'complete'; }
    if (body.potm) { doc.potm = str(body.potm, 40); doc.potmLine = str(body.potmLine, 100); }
    if (body.public !== undefined) doc.public = !!body.public;
  }); await indexPublic(value); return { ok: true };
});
R('POST', '/api/matches/:id/members', async ({ user, params, body }) => {
  need(user); const email = str(body.email, 200).toLowerCase(); const u = await S().get('user:' + email); if (!u) throw httpErr(404, 'That person must register first');
  await mutate('match:' + params.id, (doc) => { if (doc.owner !== user.id) throw httpErr(403, 'Owner only');
    doc.members = (doc.members || []).filter(m => m.uid !== u.value.id); doc.members.push({ uid: u.value.id, email, score: !!body.score, broadcast: !!body.broadcast }); });
  await mutateData(u.value.id, (d) => { if (!d.shared.includes(params.id)) d.shared.push(params.id); }); return { ok: true };
});
R('POST', '/api/matches/:id/token/rotate', async ({ user, params }) => {
  need(user); let t;
  await mutate('match:' + params.id, async (doc) => { if (doc.owner !== user.id) throw httpErr(403, 'Owner only'); t = await newToken(doc); }); tokCache.clear(); return { token: t };
});
R('DELETE', '/api/matches/:id', async ({ user, params }) => {
  need(user); const { doc } = await loadMatch(params.id); if (doc.owner !== user.id) throw httpErr(403, 'Owner only');
  await S().del('match:' + params.id); await mutateData(user.id, (d) => { d.matchIds = d.matchIds.filter(x => x !== params.id); }); await indexPublic({ ...doc, public: false }); return { ok: true };
});

// ----- broadcast control -----
const GRAPHICS = new Set(['scoreboard', 'compact', 'batting', 'bowling', 'partnership', 'lineupA', 'lineupB', 'toss', 'matchinfo', 'target', 'over', 'fow', 'inningsBreak', 'result', 'potm', 'points',
  'sponsor', 'qr', 'timeline', 'projected', 'compareBar', 'compareLine', 'lineups', 'topScorer', 'topBowler', 'batterCard', 'bowlerCard', 'drinks', 'rain', 'resume', 'summary', 'officials', 'champion', 'preview']);
R('POST', '/api/broadcast/:id', async ({ user, params, body }) => {
  need(user); let res = {};
  await mutate('match:' + params.id, (doc) => {
    need2(doc, user, 'broadcast'); const a = body.action;
    const P = doc.program;
    const take = (g, p = {}) => { if (!GRAPHICS.has(g)) throw httpErr(422, 'Unknown graphic'); doc.program = { id: P.id + 1, graphic: g, params: p, until: body.duration ? Date.now() + Math.min(120, Number(body.duration)) * 1000 : 0 }; };
    if (a === 'stage') { if (!GRAPHICS.has(body.graphic)) throw httpErr(422, 'Unknown graphic'); doc.preview = { graphic: body.graphic, params: body.params || {} }; }
    else if (a === 'take') { if (!doc.preview?.graphic) throw httpErr(422, 'Nothing staged'); take(doc.preview.graphic, doc.preview.params); }
    else if (a === 'show') take(body.graphic, body.params || {});
    else if (a === 'hide') doc.program = { id: P.id + 1, graphic: null, params: {}, until: 0 };
    else if (a === 'clear') { doc.program = { id: P.id + 1, graphic: null, params: {}, until: 0 }; doc.overlay.push({ seq: ++doc.eventSeq, type: 'CLEAR', fx: 'clear', payload: {}, ts: Date.now() }); doc.pending = []; }
    else if (a === 'ticker') doc.settings.ticker = !!body.on;
    else if (a === 'fx') { if (!['four', 'six', 'wicket', 'fifty', 'century', 'hattrick', 'noball', 'wide', 'maiden'].includes(body.fx)) throw httpErr(422, 'Unknown effect'); const st = doc.innings[doc.cur]?.state;
      const N = names(doc); const b = st?.batters[st.striker]; res.ev = manualFx(doc, body.fx, { batterName: b ? N[st.striker]?.name : '', stat: b ? { runs: b.runs, balls: b.balls, fours: b.fours, sixes: b.sixes } : null, runs: st?.runs, wickets: st?.wickets, team: st ? doc.sides[doc.innings[doc.cur].side].team.short : '', bowlerName: st?.bowler ? N[st.bowler]?.name : '' }); }
    else if (a === 'replay') { const last = [...doc.overlay].reverse().find(e => e.fx !== 'clear'); if (!last) throw httpErr(422, 'No event to replay'); doc.overlay.push({ ...last, seq: ++doc.eventSeq, replay: true, ts: Date.now() }); }
    else if (a === 'approve') { const e = doc.pending.find(x => x.seq === body.seq); if (e) { doc.pending = doc.pending.filter(x => x !== e); doc.overlay.push({ ...e, seq: ++doc.eventSeq, ts: Date.now() }); } }
    else if (a === 'dismiss') doc.pending = doc.pending.filter(x => x.seq !== body.seq);
    else if (a === 'settings') {
      const p = body.patch || {}, s = doc.settings;
      if (['arena', 'pulse', 'mohua'].includes(p.theme)) s.theme = p.theme; if (['auto', 'approve'].includes(p.mode)) s.mode = p.mode;
      if (p.duration) s.duration = Math.min(10000, Math.max(1500, Number(p.duration))); if (['top', 'bottom'].includes(p.position)) s.position = p.position;
      if (p.scale) s.scale = Math.min(2, Math.max(0.5, Number(p.scale))); if (p.safe !== undefined) s.safe = Math.min(200, Math.max(0, Number(p.safe)));
      if (p.sound !== undefined) s.sound = !!p.sound;
      if (p.celebrations) for (const k of Object.keys(s.celebrations)) if (k in p.celebrations) s.celebrations[k] = !!p.celebrations[k];
      if (Array.isArray(p.sponsors)) doc.sponsors = p.sponsors.slice(0, 8).map(x => ({ name: str(x.name, 60), message: str(x.message, 120), logo: img(x.logo) }));
    } else if (a === 'potm') { doc.potm = str(body.player, 40); doc.potmLine = str(body.line, 100); }
    else throw httpErr(400, 'Unknown action');
  }); return { ok: true, ...res };
});

// ----- public + overlay -----
R('GET', '/api/public/live', async () => { const ix = (await S().get('pub:index'))?.value?.items || []; return { items: ix }; });
R('GET', '/api/public/matches/:id', async ({ params }) => {
  const { doc, version } = await loadMatch(params.id); if (!doc.public) throw httpErr(404, 'This match is private');
  const extra = doc.tournamentId ? { points: (await pointsFor(doc.owner, doc.tournamentId))?.table } : {};
  return { v: version, vm: buildVM(doc, extra), rt: rtInfo(doc.id) };
});
R('GET', '/api/public/tournaments/:id', async ({ params }) => {
  const t = await S().get('trn:' + params.id); if (!t) throw httpErr(404, 'Tournament not found');
  const p = await pointsFor(t.value.uid, params.id); if (!p || p.tournament.public === false) throw httpErr(404, 'Tournament not found');
  const tr = p.tournament; return { tournament: { id: tr.id, name: tr.name, organizer: tr.organizer, venue: tr.venue, start: tr.start, end: tr.end, desc: tr.desc, logo: tr.logo, format: tr.format },
    table: p.table, matches: p.matches.filter(m => m.public).map(summary) };
});
R('GET', '/api/overlay/:token', async ({ params, query }) => {
  const id = await resolveToken(params.token); if (!id) throw httpErr(404, 'Overlay link is invalid or has been revoked');
  const { doc, version } = await loadMatch(id);
  if (String(version) === query.since) return { same: true, now: Date.now() };
  const want = [doc.program.graphic, doc.preview?.graphic, query.panel].includes('points') && doc.tournamentId;
  const extra = want ? { points: (await pointsFor(doc.owner, doc.tournamentId))?.table } : {};
  const vm = buildVM(doc, extra);
  return { v: version, vm, program: doc.program, preview: doc.preview, settings: doc.settings, events: doc.overlay.slice(-12), latestSeq: doc.eventSeq, pending: doc.pending.length, rt: rtInfo(doc.id) };
});

R('GET', '/api/stats', async ({ user }) => {
  need(user); const d = (await S().get('data:' + user.id))?.value || emptyData(); const bat = {}, bowl = {}; let matches = 0;
  for (const id of [...d.matchIds, ...d.shared]) { const r = await S().get('match:' + id); if (!r) continue; const doc = r.value; if (!doc.innings.length) continue; matches++; const N = names(doc);
    for (const inn of doc.innings) { const s = inn.state, tm = doc.sides[inn.side].team.short, bt = doc.sides[inn.side === 'A' ? 'B' : 'A'].team.short;
      for (const [pid, b] of Object.entries(s.batters)) { const k = pid, x = bat[k] ||= { name: N[pid]?.name || pid, team: tm, runs: 0, balls: 0, fours: 0, sixes: 0, inns: 0, hs: 0, outs: 0 }; x.runs += b.runs; x.balls += b.balls; x.fours += b.fours; x.sixes += b.sixes; x.inns++; x.hs = Math.max(x.hs, b.runs); if (b.out) x.outs++; }
      for (const [pid, b] of Object.entries(s.bowlers)) { const x = bowl[pid] ||= { name: N[pid]?.name || pid, team: bt, wkts: 0, runs: 0, balls: 0, maidens: 0 }; x.wkts += b.wickets; x.runs += b.runs; x.balls += b.legalBalls; x.maidens += b.maidens; } } }
  const top = (o, f, n = 10) => Object.values(o).sort((a, b) => f(b) - f(a)).slice(0, n);
  return { matches, runs: top(bat, x => x.runs), sixes: top(bat, x => x.sixes), fours: top(bat, x => x.fours), sr: top(bat, x => (x.balls >= 10 ? x.runs / x.balls : 0)).map(x => ({ ...x, sr: +(x.runs * 100 / x.balls).toFixed(1) })),
    wickets: top(bowl, x => x.wkts), economy: Object.values(bowl).filter(x => x.balls >= 12).sort((a, b) => a.runs / a.balls - b.runs / b.balls).slice(0, 10).map(x => ({ ...x, econ: +(x.runs * 6 / x.balls).toFixed(2) })) };
});

R('POST', '/api/matches/:id/superover', async ({ user, params }) => {
  need(user);
  await mutate('match:' + params.id, (doc) => {
    need2(doc, user, 'score'); if (!(doc.status === 'complete' && doc.result?.kind === 'tie')) throw httpErr(409, 'A Super Over is only possible after a tie');
    doc.status = 'break'; doc.result = null; doc.audit = [...(doc.audit || []).slice(-100), { t: Date.now(), by: user.name, a: 'superover' }];
  }); return { ok: true };
});
R('POST', '/api/matches/:id/revise', async ({ user, params, body }) => { // manual DLS / revised target
  need(user);
  await mutate('match:' + params.id, (doc) => {
    need2(doc, user, 'score'); const inn = doc.innings[doc.cur];
    if (!inn || doc.cur % 2 !== 1) throw httpErr(422, 'A revised target applies to a chasing innings');
    const target = Math.floor(Number(body.target)), overs = body.overs ? Math.floor(Number(body.overs)) : inn.init.rules.oversLimit;
    if (!(target > 0) || !(overs > 0) || overs > 200) throw httpErr(422, 'Enter a valid target and overs');
    inn.init = { ...inn.init, target, rules: { ...inn.init.rules, oversLimit: overs } }; inn.state = rebuild(inn.init, inn.log);
    doc.audit = [...(doc.audit || []).slice(-100), { t: Date.now(), by: user.name, a: 'revise', target, overs }]; syncStatus(doc);
  }); return { ok: true };
});
R('GET', '/api/matches/:id/export', async ({ user, params, query }) => {
  need(user); const { doc } = await loadMatch(params.id); need2(doc, user, 'view'); const N = names(doc);
  if (query.format === 'csv') {
    const rows = [['innings', 'team', 'over', 'ball', 'counted', 'bowler', 'striker', 'result', 'runs', 'wicket']];
    doc.innings.forEach((inn, k) => inn.state.balls.forEach(b => rows.push([k + 1, doc.sides[inn.side].team.short, b.over, b.ball, b.legal ? 'yes' : 'no', N[b.bowler]?.name, N[b.striker]?.name, b.sym, b.runs, b.wicket ? 'W' : ''])));
    return { raw: rows.map(r => r.map(c => `"${String(c ?? '').replace(/"/g, '""')}"`).join(',')).join('\n'), type: 'text/csv; charset=utf-8', name: `${doc.id}-deliveries.csv` };
  }
  return { raw: JSON.stringify({ match: buildVM(doc), innings: doc.innings.map(i => ({ side: i.side, log: i.log })), audit: doc.audit || [] }, null, 1), type: 'application/json', name: `${doc.id}.json` };
});
R('GET', '/api/matches/:id/pending', async ({ user, params }) => { need(user); const { doc } = await loadMatch(params.id); need2(doc, user, 'broadcast'); return { pending: doc.pending }; });

export async function handle(req) {
  const url = new URL(req.url, 'http://x'); const path = url.pathname.replace(/\/+$/, '') || '/';
  try {
    const user = await authUser(req).catch(() => null);
    for (const [m, re, fn] of routes) {
      if (m !== req.method) continue; const mt = re.exec(path); if (!mt) continue;
      const r = await fn({ req, user, params: mt.groups || {}, query: Object.fromEntries(url.searchParams), body: req.body || {} });
      if (r && r.raw !== undefined) return { status: 200, headers: { 'Content-Type': r.type, 'Content-Disposition': `attachment; filename="${r.name}"` }, raw: r.raw };
      if (r && r.status && r.body !== undefined) return { status: r.status, headers: r.headers || {}, body: r.body };
      return { status: 200, headers: {}, body: r };
    }
    return { status: 404, headers: {}, body: { error: 'Not found' } };
  } catch (e) {
    if (e.status) return { status: e.status, headers: {}, body: { error: e.message, code: e.code } };
    console.error(e); const m = String(e.message || ''); return { status: 500, headers: {}, body: { error: m.startsWith('DB_') || m.includes('fetch failed') ? 'Database problem: ' + m.slice(0, 220) + '. Open /api/health for a checklist.' : 'Server error. Open /api/health for a checklist.' } };
  }
}
