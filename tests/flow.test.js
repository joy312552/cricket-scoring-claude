import { test } from 'node:test'; import assert from 'node:assert/strict';
import { useMemoryStore } from '../lib/store.js'; useMemoryStore();
import { handle } from '../lib/api.js';
import { panel, fx, ticker, GRAPHIC_LIST, FX_LIST } from '../public/js/themes.js';

let cookie = '';
const call = async (method, url, body) => {
  const r = await handle({ method, url, headers: { cookie }, body: body || {}, ip: 't' });
  const sc = r.headers['Set-Cookie']; if (sc) cookie = sc.split(';')[0];
  return r;
};
const ok = async (m, u, b) => { const r = await call(m, u, b); assert.equal(r.status, 200, `${m} ${u} -> ${r.status} ${JSON.stringify(r.body)}`); return r.body; };

test('full workflow: register -> teams -> match -> score -> undo -> broadcast -> overlay -> result', async () => {
  await ok('POST', '/api/auth/register', { email: 'a@b.co', password: 'password1', name: 'Tester' });
  assert.equal((await call('POST', '/api/auth/register', { email: 'a@b.co', password: 'password1' })).status, 409);
  const ta = await ok('PUT', '/api/c/teams', { name: 'Mymensingh Kings', short: 'MYK', color: '#12803a' });
  const tb = await ok('PUT', '/api/c/teams', { name: 'Dhaka Titans', short: 'DHT', color: '#1d3fbf' });
  const pa = [], pb = [];
  for (let i = 1; i <= 11; i++) { pa.push((await ok('PUT', '/api/c/players', { name: `Kings P${i}`, role: i === 11 ? 'bowler' : 'batter', teamIds: [ta.id] })).id);
    pb.push((await ok('PUT', '/api/c/players', { name: `Titans P${i}`, role: 'bowler', teamIds: [tb.id] })).id); }
  const tr = await ok('PUT', '/api/c/tournaments', { name: 'Test Cup', teamIds: [ta.id, tb.id], overs: 2 });
  const { id } = await ok('POST', '/api/matches', { teamA: ta.id, teamB: tb.id, tournamentId: tr.id, format: 'Custom', overs: 2, venue: 'Ground' });
  await ok('POST', `/api/matches/${id}/setup`, { xi: { A: pa, B: pb }, toss: { winner: 'A', decision: 'bat' }, open: { striker: pa[0], nonStriker: pa[1], bowler: pb[10] } });
  let n = 0; const cmd = (c) => ok('POST', `/api/matches/${id}/cmd`, { command_id: 'c' + ++n, cmd: c });
  await cmd({ t: 'ball', runsBat: 4 }); await cmd({ t: 'ball', runsBat: 6 });
  // duplicate command id is idempotent
  const dup = await ok('POST', `/api/matches/${id}/cmd`, { command_id: 'c2', cmd: { t: 'ball', runsBat: 6 } }); assert.equal(dup.dup, true);
  let m = await ok('GET', `/api/matches/${id}`); assert.equal(m.vm.score.runs, 10);
  const tok = m.links.token;
  let ov = await ok('GET', `/api/overlay/${tok}`); assert.deepEqual(ov.events.map(e => e.fx), ['four', 'six']); assert.equal(ov.vm.score.runs, 10);
  assert.equal((await ok('GET', `/api/overlay/${tok}?since=${ov.v}`)).same, true);
  // undo removes the six; overlay state corrects but history of events is untouched (no replays)
  await ok('POST', `/api/matches/${id}/undo`); m = await ok('GET', `/api/matches/${id}`); assert.equal(m.vm.score.runs, 4);
  ov = await ok('GET', `/api/overlay/${tok}`); assert.equal(ov.events.length, 2);
  // wicket needs incoming batter
  const bad = await call('POST', `/api/matches/${id}/cmd`, { command_id: 'x1', cmd: { t: 'ball', runsBat: 0, wicket: { kind: 'bowled' } } }); assert.equal(bad.status, 422);
  await cmd({ t: 'ball', runsBat: 0, wicket: { kind: 'bowled', incoming: pa[2] } });
  assert.equal((await ok('GET', `/api/overlay/${tok}`)).events.at(-1).fx, 'wicket');
  // broadcast preview/program separation + persistence
  await ok('POST', `/api/broadcast/${id}`, { action: 'stage', graphic: 'bowling' });
  await ok('POST', `/api/broadcast/${id}`, { action: 'show', graphic: 'batting' });
  ov = await ok('GET', `/api/overlay/${tok}`); assert.equal(ov.program.graphic, 'batting'); assert.equal(ov.preview.graphic, 'bowling');
  await ok('POST', `/api/broadcast/${id}`, { action: 'take' }); assert.equal((await ok('GET', `/api/overlay/${tok}`)).program.graphic, 'bowling');
  // approve mode holds celebrations
  await ok('POST', `/api/broadcast/${id}`, { action: 'settings', patch: { mode: 'approve' } });
  await cmd({ t: 'ball', runsBat: 6 }); ov = await ok('GET', `/api/overlay/${tok}`); assert.equal(ov.pending, 1);
  await ok('POST', `/api/broadcast/${id}`, { action: 'settings', patch: { mode: 'auto' } });
  // finish innings 1 (2 overs): bowl out overs with singles
  while (true) { const s = (await ok('GET', `/api/matches/${id}`)); if (s.doc.status !== 'live') break;
    if (s.vm.score.ballsLeft % 6 === 0 && s.doc.innings[0].state.bowler === null) { const prev = s.doc.innings[0].state.prevBowler; await cmd({ t: 'bowler', id: pb[prev === pb[9] ? 8 : 9] }); }
    await cmd({ t: 'ball', runsBat: 1 }); }
  m = await ok('GET', `/api/matches/${id}`); assert.equal(m.doc.status, 'break'); const target = m.doc.innings[0].state.runs + 1;
  await ok('POST', `/api/matches/${id}/innings`, { open: { striker: pb[0], nonStriker: pb[1], bowler: pa[10] } });
  m = await ok('GET', `/api/matches/${id}`); assert.equal(m.vm.score.target, target);
  while (true) { const s = (await ok('GET', `/api/matches/${id}`)); if (s.doc.status !== 'live') break;
    const st = s.doc.innings[1].state; if (st.bowler === null) await cmd({ t: 'bowler', id: pa[st.prevBowler === pa[9] ? 8 : 9] });
    await cmd({ t: 'ball', runsBat: 0 }); }
  m = await ok('GET', `/api/matches/${id}`); assert.equal(m.doc.status, 'complete'); assert.match(m.doc.result.text, /Mymensingh Kings won by \d+ runs/);
  const pub = await ok('GET', `/api/public/matches/${id}`); assert.equal(pub.vm.result.kind, 'won'); assert.equal(pub.vm.cards.length, 2);
  // every graphic renders for both themes, mid-match and finished, without throwing
  const pv = (await ok('GET', `/api/overlay/${tok}?panel=points`)).vm;
  for (const th of ['arena', 'pulse']) {
    for (const [, items] of GRAPHIC_LIST) for (const [k] of items) { const h = panel(th, k, pv); assert.equal(typeof h, 'string', k); }
    for (const [k] of FX_LIST) assert.ok(fx(th, k, { batterName: 'X', stat: { runs: 50, balls: 30 }, kind: 'caught', bowlerName: 'Y', fielderName: 'Z', runs: 10, wickets: 1, team: 'MYK' }, pv).includes('fx'), k);
    assert.ok(ticker(th, pv).length > 100);
  }
  assert.ok(panel('arena', 'result', pv).includes('won by'));
  assert.ok(panel('pulse', 'points', pv).includes('MYK'));
  const t = await ok('GET', `/api/public/tournaments/${tr.id}`); assert.equal(t.table[0].team, 'MYK'); assert.equal(t.table[0].pts, 2);
  // security: no cookie => cannot read private data / score; revoked token dies
  const saved = cookie; cookie = '';
  assert.equal((await call('POST', `/api/matches/${id}/cmd`, { cmd: { t: 'ball', runsBat: 1 } })).status, 401);
  assert.equal((await call('GET', `/api/matches/${id}`)).status, 401);
  assert.equal((await call('GET', '/api/overlay/not-a-token')).status, 404);
  cookie = saved; const rot = await ok('POST', `/api/matches/${id}/token/rotate`);
  assert.notEqual(rot.token, tok); assert.equal((await call('GET', `/api/overlay/${rot.token}`)).status, 200);
  await new Promise(r => setTimeout(r, 0));
});

test('super over, revised target, dead ball, export, password reset', async () => {
  cookie = '';
  await ok('POST', '/api/auth/register', { email: 'so@b.co', password: 'password1', name: 'SO' });
  const ta = await ok('PUT', '/api/c/teams', { name: 'Alpha', short: 'ALP' }), tb = await ok('PUT', '/api/c/teams', { name: 'Beta', short: 'BET' });
  const pa = [], pb = [];
  for (let i = 1; i <= 11; i++) { pa.push((await ok('PUT', '/api/c/players', { name: `A${i}`, teamIds: [ta.id] })).id); pb.push((await ok('PUT', '/api/c/players', { name: `B${i}`, teamIds: [tb.id] })).id); }
  const { id } = await ok('POST', '/api/matches', { teamA: ta.id, teamB: tb.id, format: 'Custom', overs: 1 });
  await ok('POST', `/api/matches/${id}/setup`, { xi: { A: pa, B: pb }, toss: { winner: 'A', decision: 'bat' }, open: { striker: pa[0], nonStriker: pa[1], bowler: pb[10] } });
  let n = 0; const cmd = (c) => ok('POST', `/api/matches/${id}/cmd`, { command_id: 'k' + ++n, cmd: c });
  await cmd({ t: 'ball', runsBat: 1 }); await cmd({ t: 'ball', runsBat: 0, extra: { type: 'wide', runs: 0 } }); await cmd({ t: 'dead' });
  let m = await ok('GET', `/api/matches/${id}`); assert.equal(m.vm.score.runs, 2); assert.equal(m.doc.innings[0].state.legalBalls, 1); // dead ball counts nothing
  for (let i = 0; i < 5; i++) await cmd({ t: 'ball', runsBat: 1 });
  await ok('POST', `/api/matches/${id}/innings`, { open: { striker: pb[0], nonStriker: pb[1], bowler: pa[10] } });
  await ok('POST', `/api/matches/${id}/revise`, { target: 50, overs: 1 }); m = await ok('GET', `/api/matches/${id}`); assert.equal(m.vm.score.target, 50);
  await ok('POST', `/api/matches/${id}/revise`, { target: 8, overs: 1 });
  await cmd({ t: 'ball', runsBat: 0, extra: { type: 'wide', runs: 0 } });
  for (let i = 0; i < 6; i++) await cmd({ t: 'ball', runsBat: 1 });
  m = await ok('GET', `/api/matches/${id}`); assert.equal(m.doc.status, 'complete'); assert.equal(m.doc.result.kind, 'tie');
  // ---- Super Over: second-batting side (B) bats first, 3 batters, 1 over ----
  await ok('POST', `/api/matches/${id}/superover`);
  await ok('POST', `/api/matches/${id}/innings`, { open: { batters: [pb[0], pb[1], pb[2]], striker: pb[0], nonStriker: pb[1], bowler: pa[10] } });
  m = await ok('GET', `/api/matches/${id}`); assert.equal(m.doc.innings.length, 3); assert.equal(m.doc.innings[2].side, 'B'); assert.equal(m.doc.innings[2].state.rules.playersPerSide, 3);
  await cmd({ t: 'ball', runsBat: 6 }); await cmd({ t: 'ball', runsBat: 0, wicket: { kind: 'bowled', incoming: pb[2] } }); await cmd({ t: 'ball', runsBat: 0, wicket: { kind: 'bowled' } }); // 2 wickets = all out in a super over
  m = await ok('GET', `/api/matches/${id}`); assert.equal(m.doc.status, 'break');
  await ok('POST', `/api/matches/${id}/innings`, { open: { batters: [pa[0], pa[1], pa[2]], striker: pa[0], nonStriker: pa[1], bowler: pb[10] } });
  for (let i = 0; i < 5; i++) await cmd({ t: 'ball', runsBat: 1 }); await cmd({ t: 'ball', runsBat: 0 }); // A makes 5, B made 6
  m = await ok('GET', `/api/matches/${id}`); assert.equal(m.doc.status, 'complete'); assert.match(m.doc.result.text, /Beta won the Super Over/);
  // NRR and points ignore super-over innings
  // ---- export ----
  const csv = await call('GET', `/api/matches/${id}/export?format=csv`); assert.equal(csv.status, 200); assert.ok(csv.raw.startsWith('"innings"') && csv.raw.split('\n').length > 10);
  assert.equal(JSON.parse((await call('GET', `/api/matches/${id}/export`)).raw).match.match.id, id);
  // ---- password reset (dev mode returns the link instead of emailing) ----
  const f = await ok('POST', '/api/auth/forgot', { email: 'so@b.co' }); const tok = new URL(f.devLink.replace('#', '')).searchParams.get('t');
  await ok('POST', '/api/auth/reset', { token: tok, password: 'newpassword9' });
  assert.equal((await call('POST', '/api/auth/reset', { token: tok, password: 'another-pass1' })).status, 400); // single use
  assert.equal((await call('POST', '/api/auth/login', { email: 'so@b.co', password: 'password1' })).status, 401);
  await ok('POST', '/api/auth/login', { email: 'so@b.co', password: 'newpassword9' });
  const reg = await call('POST', '/api/auth/register', { email: 'x@y.co', password: 'password1' }); assert.equal(reg.status, 200);
});
