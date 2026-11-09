import { $, $$, api, toast, esc, copy, sk, modal, formModal, confirmBox, fmtDate, ICON } from './core.js';
import { renderScore } from './score.js';
import { renderBroadcast } from './broadcast.js';
import { mountStage } from './stage.js';
import { panel } from './themes.js';
import { sampleVM } from './demo.js';

const S = { user: null, data: null, warn: null };
const root = $('#app'); let cleanup = null;
const NAV = [['#/', 'Overview', 'home'], ['#/tournaments', 'Tournaments', 'cup'], ['#/matches', 'Matches', 'bat'], ['#/teams', 'Teams', 'team'], ['#/players', 'Players', 'user'],
  ['#/live', 'Live scoring', 'bat'], ['#/studio', 'Broadcast studio', 'tv'], ['#/overlays', 'Overlays', 'tv'], ['#/sponsors', 'Sponsors', 'star'], ['#/stats', 'Statistics', 'chart'], ['#/settings', 'Settings', 'gear']];
const MOBILE = [['#/', 'Home', 'home'], ['#/matches', 'Matches', 'bat'], ['#/live', 'Score', 'bat'], ['#/studio', 'Studio', 'tv'], ['#/more', 'More', 'gear']];
const LOGO = '<svg viewBox="0 0 32 32"><g stroke="#d3ff3a" stroke-width="3" stroke-linecap="square"><path d="M8 6v22M16 6v22M24 6v22"/></g><path d="M5 7h22" stroke="#f1eee3" stroke-width="3"/></svg>';

async function load() { S.data = await api('GET', '/api/data'); return S.data; }
const team = (id) => S.data.teams.find(t => t.id === id);
const crest = (t) => t?.logo ? `<img class="crestimg" src="${esc(t.logo)}" alt="">` : `<span class="crestimg" style="background:${esc(t?.color || '#333')};color:${esc(t?.color2 || '#fff')}">${esc((t?.short || '?').slice(0, 3))}</span>`;

function shell(path, inner) {
  const on = (h) => (h === '#/' ? path === '' || path === '/' : path.startsWith(h.slice(1)));
  root.innerHTML = `<div class="shell"><aside class="side"><a class="logo" href="#/">${LOGO}CREASE</a>${NAV.map(([h, l, i]) => `<a class="item ${on(h) ? 'on' : ''}" href="${h}">${ICON[i]}${l}</a>`).join('')}<div class="sp"></div>
    <div class="me"><b>${esc(S.user.name)}</b><span class="mono">${esc(S.user.email)}</span><br><a href="#" data-logout class="mono" style="color:var(--lime)">Sign out</a></div></aside>
    <main class="main">${S.mail && S.user.verified === false ? `<div class="banner-s">Please verify your email address. <button class="btn sm" data-resend>Resend link</button></div>` : ''}${S.warn ? `<div class="banner-s">${esc(S.warn)}</div>` : ''}${inner}</main></div>
    <nav class="bnav">${MOBILE.map(([h, l, i]) => `<a class="${on(h) ? 'on' : ''}" href="${h}">${ICON[i]}${l}</a>`).join('')}</nav>`;
  $('[data-resend]')?.addEventListener('click', async () => { try { await api('POST', '/api/auth/resend'); toast('Verification email sent'); } catch (e) { toast(e.message, true); } });
  $('[data-logout]')?.addEventListener('click', async (e) => { e.preventDefault(); await api('POST', '/api/auth/logout'); S.user = null; location.hash = '#/login'; route(); });
}
const head = (title, right = '') => `<div class="ph"><h1>${title}</h1><div class="sp"></div>${right}</div>`;
const statusTag = (s) => `<span class="tag ${s === 'live' ? 'live' : s === 'complete' ? 'ok' : s === 'break' ? 'lime' : ''}">${s === 'setup' ? 'Not started' : s}</span>`;

// ---------- auth ----------
function authView(mode) {
  root.innerHTML = `<div class="auth"><div class="art"><div class="logo" style="margin-bottom:30px">${LOGO}CREASE</div><h1>Every ball.<br><em>On air.</em></h1><p style="max-width:420px;color:var(--dim)">Score the match, run the broadcast graphics, share one link with OBS, vMix or PRISM.</p></div>
  <form id="af"><h2>${mode === 'login' ? 'Sign in' : 'Create account'}</h2>${mode === 'register' ? '<label class="f"><span>Your name</span><input id="n" required></label>' : ''}
  <label class="f"><span>Email</span><input id="e" type="email" required autocomplete="email"></label><label class="f"><span>Password</span><input id="p" type="password" minlength="8" required autocomplete="${mode === 'login' ? 'current-password' : 'new-password'}"></label>
  <button class="btn">${mode === 'login' ? 'Sign in' : 'Create account'}</button>${mode === 'login' ? '<a class="mono" href="#/forgot">Forgot password?</a>' : ''}<a class="mono" href="#/${mode === 'login' ? 'register' : 'login'}">${mode === 'login' ? 'New here? Create an account' : 'Have an account? Sign in'}</a></form></div>`;
  $('#af').onsubmit = async (e) => { e.preventDefault(); const b = $('button', e.target); b.disabled = true;
    try { const r = await api('POST', '/api/auth/' + mode, { email: $('#e').value, password: $('#p').value, name: $('#n')?.value }); S.user = r.user; location.hash = '#/'; route(); }
    catch (er) { toast(er.message, true); b.disabled = false; } };
}

function mailView(mode, token) {
  const f = { forgot: ['Reset password', '<label class="f"><span>Email</span><input id="e" type="email" required></label>', 'Send reset link'], reset: ['Choose a new password', '<label class="f"><span>New password</span><input id="p" type="password" minlength="8" required></label>', 'Save password'], verify: ['Verifying your email', '', 'Continue'] }[mode];
  root.innerHTML = `<div class="auth"><div class="art"><div class="logo" style="margin-bottom:30px">${LOGO}CREASE</div><h1>Every ball.<br><em>On air.</em></h1></div><form id="af"><h2>${f[0]}</h2>${f[1]}<div id="msg" class="mono"></div>${mode === 'verify' ? '' : `<button class="btn">${f[2]}</button>`}<a class="mono" href="#/login">Back to sign in</a></form></div>`;
  const msg = (x, bad) => { $('#msg').textContent = x; $('#msg').style.color = bad ? 'var(--red)' : 'var(--lime)'; };
  if (mode === 'verify') { api('POST', '/api/auth/verify', { token }).then(() => { msg('Email verified. You can sign in.'); }).catch(e => msg(e.message, true)); return; }
  $('#af').onsubmit = async (e) => { e.preventDefault(); const b = $('button', e.target); b.disabled = true;
    try { if (mode === 'forgot') { const r = await api('POST', '/api/auth/forgot', { email: $('#e').value }); msg('If that email has an account, a reset link is on its way.'); if (r.devLink) msg('Dev mode link: ' + r.devLink); }
      else { await api('POST', '/api/auth/reset', { token, password: $('#p').value }); msg('Password changed. Redirecting...'); setTimeout(() => { location.hash = '#/login'; }, 1200); } }
    catch (er) { msg(er.message, true); } b.disabled = false; };
}

// ---------- overview ----------
async function overview() {
  shell('/', head('Overview') + `<div class="grid g4">${sk(4)}</div>`); await load(); const d = S.data, ms = d.matches;
  const c = (s) => ms.filter(m => m.status === s).length;
  shell('/', head('Overview', '<a class="btn" href="#/matches?new=1">+ New match</a>') + `
   <div class="grid g4"><div class="panel stat"><span class="mono">Total matches</span><b>${ms.length}</b></div><div class="panel stat live"><span class="mono">Live now</span><b>${c('live')}</b></div><div class="panel stat"><span class="mono">Upcoming</span><b>${c('setup') + c('break')}</b></div><div class="panel stat"><span class="mono">Completed</span><b>${c('complete')}</b></div>
   <div class="panel stat"><span class="mono">Tournaments</span><b>${d.tournaments.length}</b></div><div class="panel stat"><span class="mono">Teams</span><b>${d.teams.length}</b></div><div class="panel stat"><span class="mono">Players</span><b>${d.players.length}</b></div><div class="panel stat"><span class="mono">Sponsors</span><b>${d.sponsors.length}</b></div></div>
   <div class="actions" style="margin:18px 0"><a class="btn ghost" href="#/tournaments?new=1">Create tournament</a><a class="btn ghost" href="#/teams?new=1">Add team</a><a class="btn ghost" href="#/players?new=1">Add player</a>${ms.find(m => m.status === 'live') ? `<a class="btn" href="#/match/${ms.find(m => m.status === 'live').id}/score">Resume live scoring</a>` : ''}</div>
   <h2 style="font-size:30px;margin:26px 0 12px">Recent matches</h2><div class="grid">${matchCards(ms.slice(0, 6)) || '<div class="panel">No matches yet. Add two teams with players, then create a match.</div>'}</div>`);
}
function matchCards(ms) {
  return ms.map(m => `<div class="mcard ${m.status === 'live' ? 'live' : ''}"><div><h4>${esc(m.a)} vs ${esc(m.b)} ${statusTag(m.status)}</h4><div class="sc">${esc(m.name)} • ${fmtDate(m.date)}${m.score.length ? ' • ' + m.score.join(' | ') : ''}${m.result ? ' • ' + esc(m.result) : ''}</div></div>
   <div class="actions">${m.status === 'setup' ? `<a class="btn sm" href="#/match/${m.id}/setup">Set up</a>` : `<a class="btn sm" href="#/match/${m.id}/score">Score</a>`}<a class="btn sm ghost" href="#/match/${m.id}/broadcast">Studio</a>${m.public ? `<a class="btn sm ghost" target="_blank" href="/m/${m.id}">Public</a>` : ''}</div></div>`).join('');
}

// ---------- CRUD lists ----------
const FIELDS = {
  teams: [{ k: 'name', label: 'Team name', req: true }, { k: 'short', label: 'Short name (3 letters)' }, { k: 'logo', label: 'Logo', type: 'image' }, { k: 'color', label: 'Primary colour', type: 'color', def: '#1b6b3a' }, { k: 'color2', label: 'Secondary colour', type: 'color', def: '#ffffff' }, { k: 'ground', label: 'Home ground' }, { k: 'manager', label: 'Team manager' }, { k: 'desc', label: 'Description', type: 'textarea' }],
  tournaments: () => [{ k: 'name', label: 'Tournament name', req: true }, { k: 'logo', label: 'Logo', type: 'image' }, { k: 'organizer', label: 'Organizer' }, { k: 'venue', label: 'Venue' }, { k: 'start', label: 'Start date', type: 'date' }, { k: 'end', label: 'End date', type: 'date' },
    { k: 'format', label: 'Format', type: 'select', options: [['league', 'League'], ['roundrobin', 'Round robin'], ['knockout', 'Knockout'], ['group', 'Group stage + knockout'], ['custom', 'Custom']] }, { k: 'overs', label: 'Overs per innings', type: 'number', def: 20 },
    { k: 'teamIds', label: 'Participating teams', type: 'multi', options: S.data.teams.map(t => [t.id, t.name]) }, { k: 'desc', label: 'Description / rules', type: 'textarea' }, { k: 'public', label: 'Public tournament page', type: 'checkbox', def: true }],
  players: () => [{ k: 'name', label: 'Full name', req: true }, { k: 'photo', label: 'Photo', type: 'image' }, { k: 'jersey', label: 'Jersey number' }, { k: 'role', label: 'Role', type: 'select', options: [['batter', 'Batter'], ['bowler', 'Bowler'], ['allrounder', 'All-rounder'], ['keeper', 'Wicketkeeper']] },
    { k: 'bat', label: 'Batting style' }, { k: 'bowl', label: 'Bowling style' }, { k: 'dob', label: 'Date of birth (optional)', type: 'date' }, { k: 'teamIds', label: 'Teams', type: 'multi', options: S.data.teams.map(t => [t.id, t.name]) }],
  sponsors: [{ k: 'name', label: 'Sponsor name', req: true }, { k: 'logo', label: 'Logo', type: 'image' }, { k: 'message', label: 'Message line' }],
};
async function edit(coll, item) {
  const f = typeof FIELDS[coll] === 'function' ? FIELDS[coll]() : FIELDS[coll];
  const v = await formModal({ title: item ? 'Edit' : 'Add', fields: f, values: item || {} }); if (!v) return false;
  try { await api('PUT', `/api/c/${coll}`, { ...v, id: item?.id }); toast('Saved'); return true; } catch (e) { toast(e.message, true); return false; }
}
async function crud(coll, title, rowFn, cols) {
  shell('/' + coll, head(title) + `<div class="grid">${sk(3)}</div>`); await load();
  const draw = () => {
    const list = S.data[coll];
    shell('/' + coll, head(title, `<button class="btn" data-add>+ Add</button>`) + (list.length ? `<div class="panel scroll"><table class="t"><thead><tr>${cols.map(c => `<th>${c}</th>`).join('')}<th></th></tr></thead><tbody>${list.map(x => `<tr>${rowFn(x)}<td class="r"><button class="btn sm ghost" data-e="${x.id}">Edit</button> <button class="btn sm ghost" data-d="${x.id}">Delete</button></td></tr>`).join('')}</tbody></table></div>` : `<div class="panel">Nothing here yet.</div>`));
    $('[data-add]').onclick = async () => { if (await edit(coll)) { await load(); draw(); } };
    $$('[data-e]').forEach(b => b.onclick = async () => { if (await edit(coll, list.find(x => x.id === b.dataset.e))) { await load(); draw(); } });
    $$('[data-d]').forEach(b => b.onclick = async () => { if (await confirmBox('Delete this item? Existing matches keep their own copy.')) { await api('DELETE', `/api/c/${coll}/${b.dataset.d}`); await load(); draw(); } });
  };
  draw(); if (location.hash.includes('new=1')) { history.replaceState(null, '', '#/' + coll); $('[data-add]').click(); }
}
const teamsView = () => crud('teams', 'Teams', t => `<td>${crest(t)} <b>${esc(t.name)}</b></td><td>${esc(t.short)}</td><td>${esc(t.ground)}</td><td>${S.data.players.filter(p => (p.teamIds || []).includes(t.id)).length}</td>`, ['Team', 'Short', 'Ground', 'Players']);
const playersView = () => crud('players', 'Players', p => `<td><b>${esc(p.name)}</b> <span class="mono">${esc(p.jersey ? '#' + p.jersey : '')}</span></td><td>${esc(p.role)}</td><td>${(p.teamIds || []).map(i => esc(team(i)?.short || '')).join(', ')}</td><td>${esc(p.bat)}</td>`, ['Player', 'Role', 'Teams', 'Batting']);
const sponsorsView = () => crud('sponsors', 'Sponsors', s => `<td>${s.logo ? `<img src="${esc(s.logo)}" height="30">` : ''} <b>${esc(s.name)}</b></td><td>${esc(s.message)}</td>`, ['Sponsor', 'Message']);
const tournamentsView = () => crud('tournaments', 'Tournaments', t => `<td><b>${esc(t.name)}</b></td><td>${esc(t.format)}</td><td>${t.overs} ov</td><td>${(t.teamIds || []).length} teams</td><td><a class="mono" style="color:var(--lime)" target="_blank" href="/t/${t.id}">Public page</a></td>`, ['Tournament', 'Format', 'Overs', 'Teams', 'Link']);

// ---------- matches ----------
async function matchesView() {
  shell('/matches', head('Matches') + sk(3)); await load(); const d = S.data;
  const draw = () => shell('/matches', head('Matches', '<button class="btn" data-new>+ New match</button>') + `<div class="grid">${matchCards(d.matches) || '<div class="panel">No matches yet.</div>'}</div>`);
  draw(); const newMatch = async () => {
    if (d.teams.length < 2) return toast('Create two teams first', true);
    const FM = ['T20', 'T10', 'T5', 'T30', 'ODI', 'The Hundred', 'Tape', 'Tennis', 'Custom'];
    const v = await formModal({ title: 'Create match', submit: 'Create', fields: [{ k: 'tournamentId', label: 'Tournament (optional)', type: 'select', options: [['', 'Friendly / no tournament'], ...d.tournaments.map(t => [t.id, t.name])] },
      { k: 'teamA', label: 'Team A', type: 'select', options: d.teams.map(t => [t.id, t.name]) }, { k: 'teamB', label: 'Team B', type: 'select', options: d.teams.map(t => [t.id, t.name]), def: d.teams[1].id },
      { k: 'format', label: 'Format', type: 'select', options: FM.map(f => [f, f]) }, { k: 'overs', label: 'Overs per innings (blank = format default)', type: 'number' }, { k: 'ballsPerOver', label: 'Balls per over', type: 'number', def: 6 },
      { k: 'maxOversPerBowler', label: 'Max overs per bowler (blank = none)', type: 'number' }, { k: 'venue', label: 'Venue' }, { k: 'date', label: 'Date and time', type: 'datetime-local', def: new Date(Date.now() - new Date().getTimezoneOffset() * 6e4).toISOString().slice(0, 16) },
      { k: 'number', label: 'Match number' }, { k: 'officialsText', label: 'Officials (comma separated)' }, { k: 'freeHit', label: 'Free hit after no-ball', type: 'checkbox', def: true }, { k: 'public', label: 'Public scoreboard page', type: 'checkbox', def: true }] });
    if (!v) return; if (v.teamA === v.teamB) return toast('Pick two different teams', true);
    try { const r = await api('POST', '/api/matches', { ...v, overs: v.overs || undefined, maxOversPerBowler: v.maxOversPerBowler || undefined, officials: (v.officialsText || '').split(',').map(x => x.trim()).filter(Boolean) }); location.hash = `#/match/${r.id}/setup`; }
    catch (e) { toast(e.message, true); } };
  $('[data-new]').onclick = newMatch; if (location.hash.includes('new=1')) { history.replaceState(null, '', '#/matches'); newMatch(); }
}

// ---------- match setup ----------
async function setupView(id) {
  shell('/matches', head('Match setup') + sk(2)); let m; try { m = await api('GET', `/api/matches/${id}`); } catch (e) { return toast(e.message, true); }
  if (m.doc.status !== 'setup') { location.hash = `#/match/${id}/score`; return; }
  const doc = m.doc, sel = { A: new Set(), B: new Set() }, T = { w: 'A', d: 'bat', o1: '', o2: '', o3: '', capA: '', capB: '', wkA: '', wkB: '' };
  const draw = () => {
    const nm = (s) => doc.sides[s].team.name, pn = (s, i) => esc(doc.sides[s].players.find(p => p.id === i)?.name);
    const opt = (s, cur) => [...sel[s]].map(i => `<option value="${i}" ${cur === i ? 'selected' : ''}>${pn(s, i)}</option>`).join('');
    const none = (s, cur) => `<option value="">None</option>${opt(s, cur)}`;
    const batS = (T.d === 'bat') === (T.w === 'A') ? 'A' : 'B', bowS = batS === 'A' ? 'B' : 'A';
    const side = (s) => { const sd = doc.sides[s]; return `<div class="panel"><h3>${esc(sd.team.name)}: playing XI <span class="tag">${sel[s].size} selected</span></h3>
      <div class="pick" data-side="${s}">${sd.players.map(p => `<label><input type="checkbox" value="${p.id}" ${sel[s].has(p.id) ? 'checked' : ''}> ${esc(p.name)}<small>${esc(p.role)}</small></label>`).join('') || '<em class="mono">No players yet. Add some below.</em>'}</div>
      <div style="display:flex;gap:8px;margin-top:10px"><input data-qn="${s}" placeholder="Quick add player name"><select data-qr="${s}" style="width:130px"><option value="batter">Batter</option><option value="bowler">Bowler</option><option value="allrounder">All-rounder</option><option value="keeper">Keeper</option></select><button class="btn sm" data-qa="${s}">Add</button></div>
      <div class="grid g2" style="margin-top:12px"><label class="f"><span>Captain</span><select data-k="cap${s}">${none(s, T['cap' + s])}</select></label><label class="f"><span>Wicketkeeper</span><select data-k="wk${s}">${none(s, T['wk' + s])}</select></label></div></div>`; };
    shell('/matches', head(esc(doc.name), `<a class="btn ghost" href="#/matches">Back</a>`) + `<div class="grid g2">${side('A')}${side('B')}</div>
      <div class="panel" style="margin-top:16px"><h3>Toss</h3><div class="chips"><span class="chip ${T.w === 'A' ? 'on' : ''}" data-tw="A">${esc(nm('A'))} won</span><span class="chip ${T.w === 'B' ? 'on' : ''}" data-tw="B">${esc(nm('B'))} won</span>
      <span class="chip ${T.d === 'bat' ? 'on' : ''}" data-td="bat">Elected to bat</span><span class="chip ${T.d === 'bowl' ? 'on' : ''}" data-td="bowl">Elected to bowl</span></div>
      <h3 style="margin-top:18px">Openers <span class="tag">${esc(nm(batS))} batting</span></h3><div class="grid g3"><label class="f"><span>Striker</span><select data-k="o1">${opt(batS, T.o1)}</select></label><label class="f"><span>Non-striker</span><select data-k="o2">${opt(batS, T.o2)}</select></label><label class="f"><span>Opening bowler (${esc(nm(bowS))})</span><select data-k="o3">${opt(bowS, T.o3)}</select></label></div>
      <div style="display:flex;justify-content:flex-end;margin-top:18px"><button class="btn" id="go">Start match</button></div></div>`);
    $$('[data-k]').forEach(s => { T[s.dataset.k] = s.value; s.onchange = () => { T[s.dataset.k] = s.value; }; });
    $$('[data-tw]').forEach(c => c.onclick = () => { T.w = c.dataset.tw; T.o1 = T.o2 = T.o3 = ''; draw(); });
    $$('[data-td]').forEach(c => c.onclick = () => { T.d = c.dataset.td; T.o1 = T.o2 = T.o3 = ''; draw(); });
    $$('.pick[data-side] input').forEach(i => i.onchange = () => { const s = i.closest('.pick').dataset.side; i.checked ? sel[s].add(i.value) : sel[s].delete(i.value); T.o1 = T.o2 = T.o3 = ''; draw(); });
    $$('[data-qa]').forEach(b => b.onclick = async () => { const s = b.dataset.qa, name = $(`[data-qn=${s}]`).value.trim(); if (!name) return; try { const p = await api('POST', `/api/matches/${id}/players`, { side: s, name, role: $(`[data-qr=${s}]`).value }); doc.sides[s].players.push({ id: p.id, name, role: p.role }); sel[s].add(p.id); draw(); } catch (e) { toast(e.message, true); } });
    $('#go').onclick = async () => {
      try { await api('POST', `/api/matches/${id}/setup`, { xi: { A: [...sel.A], B: [...sel.B] }, captain: { A: T.capA, B: T.capB }, keeper: { A: T.wkA, B: T.wkB }, toss: { winner: T.w, decision: T.d }, open: { striker: T.o1, nonStriker: T.o2, bowler: T.o3 } }); toast('Match started'); location.hash = `#/match/${id}/score`; }
      catch (e) { toast(e.message, true); } };
  }; draw();
}

// ---------- pick-a-match pages ----------
async function pickMatch(path, title, verb, to, filter) {
  shell(path, head(title) + sk(2)); await load(); const ms = S.data.matches.filter(filter);
  shell(path, head(title) + `<div class="grid">${ms.map(m => `<div class="mcard ${m.status === 'live' ? 'live' : ''}"><div><h4>${esc(m.a)} vs ${esc(m.b)} ${statusTag(m.status)}</h4><div class="sc">${esc(m.name)}${m.score.length ? ' • ' + m.score.join(' | ') : ''}</div></div><a class="btn" href="#/match/${m.id}/${m.status === 'setup' ? 'setup' : to}">${m.status === 'setup' ? 'Set up' : verb}</a></div>`).join('') || '<div class="panel">No matches yet. <a href="#/matches?new=1" style="color:var(--lime)">Create one</a>.</div>'}</div>`);
}
async function overlaysView() {
  shell('/overlays', head('Overlay themes') + `<p style="color:var(--dim);max-width:720px">Every match gets its own secret browser-source link. Open a match in the Broadcast studio to copy URLs and switch theme. Below: both themes rendering a live sample.</p><div class="grid g2"><div><div id="ov1"></div><h3 style="margin-top:10px">ARENA</h3><span class="mono">Premium international broadcast</span></div><div><div id="ov2"></div><h3 style="margin-top:10px">PULSE</h3><span class="mono">Modern dynamic sports tech</span></div></div>`);
  const vm = sampleVM(); [['#ov1', 'arena'], ['#ov2', 'pulse']].forEach(([s, t]) => { const st = mountStage($(s), t); st.ticker(vm); st.graphic('batting', vm); });
}
async function statsView() {
  shell('/stats', head('Statistics') + sk(2)); const s = await api('GET', '/api/stats').catch(e => (toast(e.message, true), null)); if (!s) return;
  const tbl = (t, rows, cols) => `<div class="panel scroll"><h3>${t}</h3>${rows.length ? `<table class="t"><thead><tr><th>#</th><th>Player</th>${cols.map(c => `<th class="r">${c[0]}</th>`).join('')}</tr></thead><tbody>${rows.map((r, i) => `<tr><td>${i + 1}</td><td><b>${esc(r.name)}</b> <span class="mono">${esc(r.team)}</span></td>${cols.map(c => `<td class="r">${c[1](r)}</td>`).join('')}</tr>`).join('')}</tbody></table>` : '<span class="mono">No data yet</span>'}</div>`;
  shell('/stats', head('Statistics') + `<p class="mono">Computed live from the ball-by-ball ledger of ${s.matches} match(es)</p><div class="grid g2">${tbl('Most runs', s.runs, [['Runs', r => r.runs], ['Inns', r => r.inns], ['HS', r => r.hs], ['SR', r => r.balls ? (r.runs * 100 / r.balls).toFixed(1) : '-']])}${tbl('Most wickets', s.wickets, [['Wkts', r => r.wkts], ['Runs', r => r.runs], ['Mdns', r => r.maidens]])}${tbl('Most sixes', s.sixes, [['6s', r => r.sixes]])}${tbl('Most fours', s.fours, [['4s', r => r.fours]])}${tbl('Best strike rate (min 10 balls)', s.sr, [['SR', r => r.sr], ['Runs', r => r.runs]])}${tbl('Best economy (min 2 overs)', s.economy, [['Econ', r => r.econ], ['Wkts', r => r.wkts]])}</div>`);
}
function moreView() { shell('/more', head('More') + `<div class="grid">${NAV.map(([h, l, i]) => `<a class="mcard" href="${h}"><h4>${l}</h4>${ICON[i]}</a>`).join('')}</div><p><a href="#" data-logout class="mono" style="color:var(--lime)">Sign out</a></p>`); }
function settingsView() {
  shell('/settings', head('Settings') + `<div class="grid g2"><div class="panel"><h3>Account</h3><div class="kv"><span>Name</span><b>${esc(S.user.name)}</b><span>Email</span><b>${esc(S.user.email)}</b></div></div>
   <div class="panel"><h3>Security</h3><p style="color:var(--dim);font-size:14px">Forgot your password? Sign out and use <b>Forgot password</b> on the sign-in page.</p></div><div class="panel"><h3>Invite a scorer or operator</h3><p style="color:var(--dim);font-size:14px">Open a match, then use <b>Studio → Access</b>. Scoring and broadcast permissions are granted separately.</p></div></div>`);
}

// ---------- router ----------
async function route() {
  cleanup?.(); cleanup = null; const h = location.hash.replace(/^#/, '') || '/', path = h.split('?')[0], seg = path.split('/').filter(Boolean);
  if (!S.user) { const me = await api('GET', '/api/me').catch(() => ({})); S.user = me.user; S.warn = me.warning; S.mail = me.mail; }
  if (['forgot', 'reset', 'verify'].includes(seg[0])) return mailView(seg[0], new URLSearchParams(h.split('?')[1] || '').get('t'));
  if (!S.user) { if (seg[0] === 'register') return authView('register'); return authView('login'); }
  if (seg[0] === 'login' || seg[0] === 'register') { location.hash = '#/'; return; }
  const ctx = { shell, head, S, load, set cleanup(f) { cleanup = f; } };
  try {
    if (!seg.length) return overview();
    const [a, b, c] = seg;
    if (a === 'teams') return teamsView(); if (a === 'players') return playersView(); if (a === 'tournaments') return tournamentsView(); if (a === 'sponsors') return sponsorsView();
    if (a === 'matches') return matchesView(); if (a === 'stats') return statsView(); if (a === 'settings') return settingsView(); if (a === 'more') return moreView(); if (a === 'overlays') return overlaysView();
    if (a === 'live') return pickMatch('/live', 'Live scoring', 'Score', 'score', m => m.status !== 'complete');
    if (a === 'studio') return pickMatch('/studio', 'Broadcast studio', 'Open studio', 'broadcast', () => true);
    if (a === 'match' && c === 'setup') return setupView(b);
    if (a === 'match' && c === 'score') return renderScore(root, b, ctx);
    if (a === 'match' && c === 'broadcast') return renderBroadcast(root, b, ctx);
    overview();
  } catch (e) { if (e.status === 401) { S.user = null; return route(); } toast(e.message, true); }
}
addEventListener('hashchange', route); route();
