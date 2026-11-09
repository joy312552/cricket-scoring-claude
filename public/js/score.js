import { $, $$, api, toast, esc, modal, confirmBox, ballChip, qGet, qPut, download } from './core.js';
import { dispatch, RuleError } from './engine.js';
import { buildVM } from './vm.js';

const KIND = [['bowled', 'Bowled'], ['caught', 'Caught'], ['caughtAndBowled', 'Caught & bowled'], ['lbw', 'LBW'], ['runOut', 'Run out'], ['stumped', 'Stumped'], ['hitWicket', 'Hit wicket'], ['obstructing', 'Obstructing'], ['hitBallTwice', 'Hit ball twice']];
const ALLOW = { freehit: ['runOut', 'hitBallTwice', 'obstructing'], wide: ['runOut', 'stumped', 'hitWicket', 'obstructing'], noball: ['runOut', 'hitBallTwice', 'obstructing'] };

export async function renderScore(root, id, ctx) {
  ctx.shell('/live', '<div id="con"><div class="panel"><div class="skel blk"></div></div></div>');
  let M = null, busy = false, editing = false, sync = 'busy', timer = 0, queue = [], flushing = false, conflict = '';
  const con = () => $('#con');
  const P = (side, i) => M.doc.sides[side].players.find(p => p.id === i)?.name || i;
  const nameOf = (i) => P('A', i) === i ? P('B', i) : P('A', i);
  const inn = () => M.doc.innings[M.doc.cur], st = () => inn().state;
  async function refresh(quiet) {
    if (queue.length && quiet) return flush();
    try { M = await api('GET', `/api/matches/${id}`); sync = 'ok'; } catch (e) { if (e.offline) sync = 'bad'; else { toast(e.message, true); if (e.status === 401 || e.status === 403) return; } }
    if (M) { if (M.doc.status === 'setup') { location.hash = `#/match/${id}/setup`; return; } if (!quiet || (!$('.veil') && !['INPUT', 'SELECT', 'TEXTAREA'].includes(document.activeElement?.tagName))) draw(); }
  }
  function localApply(cmd) {
    const i = inn(); const r = dispatch({ init: i.init, log: i.log }, cmd); i.log = r.session.log; i.state = r.state;
    if (i.state.status === 'complete') M.doc.status = M.doc.cur % 2 === 0 ? 'break' : 'complete';
    M.vm = buildVM(M.doc);
  }
  async function enqueue(cmd, command_id = crypto.randomUUID()) {
    try { localApply(cmd); } catch (e) { toast(e instanceof RuleError ? e.code.replaceAll('_', ' ').toLowerCase() : 'Cannot record that offline', true); return; }
    queue.push({ command_id, cmd }); await qPut(id, queue); sync = 'bad'; navigator.vibrate?.(14); draw();
  }
  async function flush() {
    if (flushing || !queue.length || conflict) return; flushing = true; sync = 'busy'; paintSync();
    while (queue.length) {
      const it = queue[0];
      try { await api('POST', `/api/matches/${id}/cmd`, { command_id: it.command_id, cmd: it.cmd }); queue.shift(); await qPut(id, queue); }
      catch (e) { if (e.offline) { sync = 'bad'; break; } conflict = e.message || 'Could not sync'; break; }
    }
    flushing = false; if (!queue.length && !conflict) { sync = 'ok'; await refresh(); } else draw();
  }
  async function send(cmd, opts = {}) {
    if (busy) return;
    if (!editing && (queue.length || sync === 'bad')) return enqueue(cmd);
    busy = true; sync = 'busy'; paintSync();
    try {
      if (editing) { await api('POST', `/api/matches/${id}/edit`, { cmd }); editing = false; toast('Last ball corrected'); }
      else { const r = await api('POST', `/api/matches/${id}/cmd`, { command_id: opts.command_id || crypto.randomUUID(), cmd, takeover: opts.takeover }); if (r.dup) toast('Already recorded'); }
      navigator.vibrate?.(14); busy = false; await refresh();
    } catch (e) {
      busy = false;
      if (e.offline && !editing) { sync = 'bad'; return enqueue(cmd, opts.command_id); }
      if (e.code === 'LEASE' && await confirmBox(e.message)) return send(cmd, { takeover: true });
      if (e.code === 'NEED_BOWLER') { await refresh(); return openBowler(); }
      sync = e.offline ? 'bad' : 'ok'; toast(e.message, true); paintSync();
    }
  }
  const paintSync = () => { const s = $('.sync'); if (s) { s.className = 'sync ' + sync; s.textContent = queue.length ? `Queued ${queue.length}` : sync === 'ok' ? 'Online' : sync === 'busy' ? 'Syncing' : 'Offline'; } };

  function sheet(title, body, onOk, okLabel = 'Record') {
    const m = modal(`<h3>${title}</h3>${body}<div class="row"><button class="btn ghost" data-x>Cancel</button>${onOk ? `<button class="btn" data-ok>${okLabel}</button>` : ''}</div>`);
    $('[data-x]', m.el).onclick = m.close; if (onOk) $('[data-ok]', m.el).onclick = () => onOk(m); return m;
  }
  const chips = (arr, cur, key) => `<div class="chips">${arr.map(([v, l]) => `<span class="chip ${String(cur) === String(v) ? 'on' : ''}" data-${key}="${esc(v)}">${esc(l)}</span>`).join('')}</div>`;
  const sel = (label, key, opts, cur) => `<label class="f"><span>${label}</span><select data-k="${key}">${opts}</select></label>`;
  const playerOpts = (ids, side, cur, extra = '') => extra + ids.map(i => `<option value="${i}" ${cur === i ? 'selected' : ''}>${esc(P(side, i))}</option>`).join('');

  function openBowler() {
    const s = st(), bowl = inn().side === 'A' ? 'B' : 'A', lim = s.rules.maxOversPerBowler, bpo = s.rules.ballsPerOver;
    const m = sheet('Select bowler', `<div class="sheetgrid">${s.bowlingXI.map(i => { const b = s.bowlers[i]; const blocked = (s.bowler === null && i === s.prevBowler) || (lim && b && b.legalBalls >= lim * bpo);
      return `<span class="chip" style="${blocked ? 'opacity:.35;pointer-events:none' : ''}" data-b="${i}">${esc(P(bowl, i))}<br><small class="mono">${b ? `${Math.floor(b.legalBalls / bpo)}.${b.legalBalls % bpo}-${b.runs}-${b.wickets}` : 'new'}</small></span>`; }).join('')}</div>`, null);
    $$('[data-b]', m.el).forEach(c => c.onclick = () => { m.close(); send({ t: 'bowler', id: c.dataset.b }); });
  }
  function openExtras() {
    const X = { type: 'wide', r: 0, mode: 'bat' };
    const body = () => `<div class="mono" style="margin-bottom:6px">Extra</div>${chips([['wide', 'Wide'], ['noball', 'No ball'], ['bye', 'Bye'], ['legbye', 'Leg bye']], X.type, 't')}
      ${X.type === 'noball' ? `<div class="mono" style="margin:14px 0 6px">Runs are</div>${chips([['bat', 'Off the bat'], ['bye', 'Byes']], X.mode, 'mo')}` : ''}
      <div class="mono" style="margin:14px 0 6px">${X.type === 'wide' ? 'Extra runs run (besides the wide)' : 'Runs'}</div>${chips([0, 1, 2, 3, 4, 5, 6].filter(n => !(['bye', 'legbye'].includes(X.type) && n === 0)).map(n => [n, n]), X.r, 'r')}`;
    const m = sheet('Extras', `<div id="xb">${body()}</div>`, () => {
      let cmd; if (X.type === 'noball') cmd = X.mode === 'bat' ? { t: 'ball', runsBat: X.r, extra: { type: 'noball', runs: 0 } } : { t: 'ball', runsBat: 0, extra: { type: 'noball', runs: X.r } };
      else { const r = ['bye', 'legbye'].includes(X.type) ? Math.max(1, X.r) : X.r; cmd = { t: 'ball', runsBat: 0, extra: { type: X.type, runs: r } }; }
      m.close(); send(cmd); });
    const wire = () => { $$('[data-t]', m.el).forEach(c => c.onclick = () => { X.type = c.dataset.t; if (['bye', 'legbye'].includes(X.type) && X.r === 0) X.r = 1; $('#xb', m.el).innerHTML = body(); wire(); });
      $$('[data-mo]', m.el).forEach(c => c.onclick = () => { X.mode = c.dataset.mo; $('#xb', m.el).innerHTML = body(); wire(); }); $$('[data-r]', m.el).forEach(c => c.onclick = () => { X.r = +c.dataset.r; $('#xb', m.el).innerHTML = body(); wire(); }); };
    wire();
  }
  function openWicket() {
    const s = st(), bat = inn().side, bowl = bat === 'A' ? 'B' : 'A', allOut = s.wickets + 1 >= s.rules.playersPerSide - 1;
    const W = { deliv: 'normal', kind: 'bowled', out: 'striker', fielder: '', runs: 0, crossed: false, incoming: '' };
    const yet = s.battingXI.filter(i => !s.batters[i]);
    const body = () => { const allowed = s.freeHit ? ALLOW.freehit : W.deliv === 'wide' ? ALLOW.wide : W.deliv === 'noball' ? ALLOW.noball : null; if (allowed && !allowed.includes(W.kind)) W.kind = allowed[0];
      return `<div class="mono" style="margin-bottom:6px">Delivery</div>${chips([['normal', 'Normal'], ['wide', 'Wide'], ['noball', 'No ball']], W.deliv, 'dv')}
      <div class="mono" style="margin:14px 0 6px">How out${s.freeHit ? ' (free hit: limited)' : ''}</div><div class="chips">${KIND.map(([k, l]) => `<span class="chip ${W.kind === k ? 'on' : ''}" style="${allowed && !allowed.includes(k) ? 'opacity:.3;pointer-events:none' : ''}" data-k2="${k}">${l}</span>`).join('')}</div>
      ${['runOut', 'obstructing'].includes(W.kind) ? `<div class="mono" style="margin:14px 0 6px">Who is out</div>${chips([['striker', P(bat, s.striker)], ['nonStriker', P(bat, s.nonStriker)]], W.out, 'ou')}` : ''}
      ${['caught', 'stumped', 'runOut'].includes(W.kind) ? sel('Fielder', 'fielder', playerOpts(s.bowlingXI, bowl, W.fielder, '<option value="">Substitute / unknown</option>')) : ''}
      ${W.kind === 'runOut' ? `<div class="mono" style="margin:14px 0 6px">Runs completed</div>${chips([0, 1, 2, 3].map(n => [n, n]), W.runs, 'ru')}` : ''}
      ${W.kind === 'caught' ? `<label class="sw"><input type="checkbox" data-cr ${W.crossed ? 'checked' : ''}> Batters had crossed before the catch</label>` : ''}
      ${allOut ? '<p class="mono" style="margin-top:12px">This wicket ends the innings.</p>' : sel('Incoming batter', 'incoming', playerOpts(yet, bat, W.incoming))}`; };
    const m = sheet('Wicket', `<div id="wb">${body()}</div>`, () => {
      const incoming = allOut ? undefined : $('[data-k=incoming]', m.el)?.value; const fielder = $('[data-k=fielder]', m.el)?.value || undefined;
      const wk = { kind: W.kind, out: W.out, incoming, fielder, crossed: W.crossed }; const runs = W.kind === 'runOut' ? W.runs : 0;
      const cmd = W.deliv === 'wide' ? { t: 'ball', runsBat: 0, extra: { type: 'wide', runs }, wicket: wk } : W.deliv === 'noball' ? { t: 'ball', runsBat: runs, extra: { type: 'noball', runs: 0 }, wicket: wk } : { t: 'ball', runsBat: runs, wicket: wk };
      m.close(); send(cmd); }, 'Confirm wicket');
    const wire = () => { const redraw = () => { W.fielder = $('[data-k=fielder]', m.el)?.value ?? W.fielder; W.incoming = $('[data-k=incoming]', m.el)?.value ?? W.incoming; $('#wb', m.el).innerHTML = body(); wire(); };
      $$('[data-dv]', m.el).forEach(c => c.onclick = () => { W.deliv = c.dataset.dv; redraw(); }); $$('[data-k2]', m.el).forEach(c => c.onclick = () => { W.kind = c.dataset.k2; redraw(); });
      $$('[data-ou]', m.el).forEach(c => c.onclick = () => { W.out = c.dataset.ou; redraw(); }); $$('[data-ru]', m.el).forEach(c => c.onclick = () => { W.runs = +c.dataset.ru; redraw(); }); $('[data-cr]', m.el)?.addEventListener('change', e => { W.crossed = e.target.checked; }); };
    wire();
  }
  function openRetire() {
    const s = st(), bat = inn().side, yet = s.battingXI.filter(i => !s.batters[i]); const R = { who: 'striker', kind: 'hurt' };
    const m = sheet('Retire batter', `${chips([['striker', P(bat, s.striker)], ['nonStriker', P(bat, s.nonStriker)]], R.who, 'w')}<div style="height:12px"></div>${chips([['hurt', 'Retired hurt'], ['out', 'Retired out'], ['timedOut', 'Timed out']], R.kind, 'kd')}<div style="height:12px"></div>${sel('Incoming batter', 'incoming', playerOpts(yet, bat, ''))}`, () => { const inc = $('[data-k=incoming]', m.el).value; m.close(); send({ t: 'retire', who: R.who, kind: R.kind, incoming: inc || undefined }); }, 'Confirm');
    $$('[data-w]', m.el).forEach(c => c.onclick = () => { R.who = c.dataset.w; $$('[data-w]', m.el).forEach(x => x.classList.toggle('on', x === c)); }); $$('[data-kd]', m.el).forEach(c => c.onclick = () => { R.kind = c.dataset.kd; $$('[data-kd]', m.el).forEach(x => x.classList.toggle('on', x === c)); });
  }
  function openPenalty() { const m = sheet('Penalty runs', `<label class="f"><span>Runs awarded to the batting team</span><input type="number" id="pr" value="5" min="1" max="10"></label>`, () => { const r = +$('#pr', m.el).value; m.close(); send({ t: 'penalty', runs: r }); }); }

  function startInnings2() {
    const d = M.doc, n = d.innings.length, last = d.innings[n - 1], so = n >= 2, bat = n % 2 === 1 ? (last.side === 'A' ? 'B' : 'A') : last.side, bowl = bat === 'A' ? 'B' : 'A';
    const target = n % 2 === 1 ? last.state.runs + 1 : null;
    const pool = d.xi[bat];
    const body = so ? `<p>Super Over: choose <b>3 batters</b>. ${target ? `${esc(d.sides[bat].team.name)} need <b>${target}</b> to win.` : `${esc(d.sides[bat].team.name)} bat first.`}</p><div class="pick" id="sob">${pool.map(i => `<label><input type="checkbox" value="${i}"> ${esc(P(bat, i))}</label>`).join('')}</div><div class="grid" style="margin-top:12px"><label class="f"><span>Striker</span><select data-k="o1"></select></label><label class="f"><span>Non-striker</span><select data-k="o2"></select></label><label class="f"><span>Bowler (${esc(d.sides[bowl].team.name)})</span><select data-k="o3">${playerOpts(d.xi[bowl], bowl, '')}</select></label></div>`
      : `<p>${esc(d.sides[bat].team.name)} need <b>${target}</b> to win.</p><div class="grid">${sel('Striker', 'o1', playerOpts(pool, bat, ''))}${sel('Non-striker', 'o2', playerOpts(pool, bat, pool[1]))}${sel('Opening bowler', 'o3', playerOpts(d.xi[bowl], bowl, ''))}</div>`;
    const m = sheet(so ? 'Super Over innings' : 'Start 2nd innings', body, async () => {
      const open = { striker: $('[data-k=o1]', m.el).value, nonStriker: $('[data-k=o2]', m.el).value, bowler: $('[data-k=o3]', m.el).value };
      if (so) open.batters = $$('#sob input:checked', m.el).map(x => x.value);
      try { await api('POST', `/api/matches/${id}/innings`, { open }); m.close(); await refresh(); } catch (e) { toast(e.message, true); } }, 'Start innings');
    if (so) { const fill = () => { const ids = $$('#sob input:checked', m.el).map(x => x.value), o = ids.map(i => `<option value="${i}">${esc(P(bat, i))}</option>`).join(''); $('[data-k=o1]', m.el).innerHTML = o; $('[data-k=o2]', m.el).innerHTML = o; if (ids[1]) $('[data-k=o2]', m.el).value = ids[1]; }; $$('#sob input', m.el).forEach(x => x.onchange = fill); }
  }
  function openRevise() {
    const s = st(); const m = sheet('Revised target (DLS)', `<p style="color:var(--dim);font-size:14px">Enter the target and overs from your DLS calculation. This is recorded in the audit trail.</p><div class="grid g2"><label class="f"><span>Revised target</span><input type="number" id="rt" value="${s.target ?? ''}" min="1"></label><label class="f"><span>Overs available</span><input type="number" id="ro" value="${s.rules.oversLimit}" min="1"></label></div>`,
      async () => { try { await api('POST', `/api/matches/${id}/revise`, { target: +$('#rt', m.el).value, overs: +$('#ro', m.el).value }); m.close(); toast('Target revised'); await refresh(); } catch (e) { toast(e.message, true); } }, 'Apply');
  }
  async function finishMenu() {
    const m = sheet('Finish match', `<div class="chips"><span class="chip" data-f="abandoned">Abandoned</span><span class="chip" data-f="noResult">No result</span></div>`, null);
    $$('[data-f]', m.el).forEach(c => c.onclick = async () => { if (!await confirmBox('Mark the match as ' + c.textContent + '?')) return; m.close(); try { await api('POST', `/api/matches/${id}/finish`, { kind: c.dataset.f }); await refresh(); } catch (e) { toast(e.message, true); } });
  }

  function draw() {
    const d = M.doc, vm = M.vm, s = vm.score || {}, T = vm.teams[vm.bat || 'A'], live = d.status === 'live', i = d.innings[d.cur];
    const recent = i ? i.state.balls.slice(-10).reverse() : [];
    const need = live && i.state.bowler === null;
    con().innerHTML = `
     <div class="sc-top"><a class="mono" href="#/live">&larr; Matches</a><b style="font:800 22px var(--f-d)">${esc(d.name)}</b><span class="tag ${live ? 'live' : d.status === 'complete' ? 'ok' : 'lime'}">${d.status === 'break' ? 'Innings break' : d.status}</span>
      <span class="sync ${queue.length ? 'busy' : sync}">${queue.length ? `Queued ${queue.length}` : sync === 'ok' ? 'Online' : sync === 'busy' ? 'Syncing' : 'Offline'}</span><div style="flex:1"></div>
      <a class="btn sm ghost" href="#/match/${id}/broadcast">Broadcast studio</a>${d.public ? `<a class="btn sm ghost" target="_blank" href="/m/${id}">Public page</a>` : ''}<button class="btn sm ghost" data-exp>Export CSV</button><button class="btn sm ghost" data-fin>Finish</button></div>
     ${queue.length ? `<div class="banner-s">${conflict ? `Sync stopped: ${esc(conflict)}.` : `${queue.length} entr${queue.length === 1 ? 'y is' : 'ies are'} saved on this device and will sync when you are back online.`} <button class="btn sm" data-retry>Retry</button> <button class="btn sm red" data-discard>Discard queued</button></div>` : ''}
     ${editing ? `<div class="banner-s">Editing the last ball. The next delivery you record replaces it. <button class="btn sm ghost" data-ce>Cancel</button></div>` : ''}
     ${d.status === 'break' ? `<div class="panel" style="margin-bottom:14px"><h3>${d.innings.length >= 2 ? 'Super Over' : 'Innings break'}</h3><p>${esc(vm.cards[d.innings.length - 1].teamName)} scored <b>${vm.cards[d.innings.length - 1].runs}/${vm.cards[d.innings.length - 1].wkts}</b> in ${vm.cards[d.innings.length - 1].overs} overs.</p><div class="actions"><button class="btn" data-i2>${d.innings.length >= 2 ? 'Start Super Over innings' : 'Start 2nd innings'}</button><button class="btn ghost" data-undo>Undo last ball</button></div></div>` : ''}
     ${d.status === 'complete' ? `<div class="panel" style="margin-bottom:14px"><h3>${esc(d.result?.text || 'Match complete')}</h3><div class="actions">${d.result?.kind === 'tie' ? '<button class="btn red" data-so>Play a Super Over</button>' : ''}<select id="potm" style="max-width:260px"><option value="">Player of the Match...</option>${['A', 'B'].map(sd => d.xi[sd].map(p => `<option value="${p}" ${d.potm === p ? 'selected' : ''}>${esc(P(sd, p))}</option>`).join('')).join('')}</select><input id="potml" placeholder="e.g. 78 off 41 balls" style="max-width:260px" value="${esc(d.potmLine || '')}"><button class="btn sm" data-potm>Save</button><a class="btn sm ghost" href="#/match/${id}/broadcast">Show result on air</a><button class="btn sm ghost" data-undo>Undo last ball</button></div></div>` : ''}
     ${need ? `<div class="banner-s">Over complete. <button class="btn sm" data-bowler>Select next bowler</button></div>` : ''}
     <div class="console">
      <div class="panel"><h3>Match</h3><div class="kv"><span>Format</span><b>${esc(d.format)}, ${d.rules.oversLimit} ov</b>${s.target != null ? `<span>Target</span><b>${s.target}</b><span>Need</span><b>${s.need} from ${s.ballsLeft}</b><span>Required rate</span><b>${s.rrr ?? '-'}</b>` : ''}<span>Run rate</span><b>${s.crr ?? 0}</b><span>Partnership</span><b>${vm.partnership.runs} (${vm.partnership.balls})</b><span>Extras</span><b>${vm.card?.extras.total ?? 0}</b></div>
        <div class="mono" style="margin:14px 0 6px">Last six</div><div class="over">${(vm.lastSix.length ? vm.lastSix : ['-']).map(ballChip).join('')}</div>
        <div class="mono" style="margin:14px 0 6px">Fall of wickets</div><div style="font-size:14px;color:var(--dim)">${vm.fow.length ? vm.fow.map(f => `${f.w}-${f.runs} (${esc(f.name)}, ${f.at})`).join('<br>') : 'None yet'}</div>
        ${s.freeHit ? '<div class="tag live" style="margin-top:12px">FREE HIT</div>' : ''}</div>
      <div class="mid"><div class="bigscore"><span class="tm" style="color:${esc(T.color === '#ffffff' ? '#fff' : '#d3ff3a')}">${esc(T.short)}</span><b>${s.runs ?? 0}<i>/${s.wkts ?? 0}</i></b><span class="ov">${esc(s.overs ?? '0.0')} / ${s.oversLimit ?? d.rules.oversLimit} ov</span>${s.target != null ? `<span class="chase">Need ${s.need}<br>from ${s.ballsLeft}</span>` : vm.firstInn ? '' : ''}</div>
       <div class="keypad" ${live ? '' : 'style="opacity:.35;pointer-events:none"'}>${[0, 1, 2, 3].map(n => `<button data-r="${n}">${n}</button>`).join('')}<button class="r4" data-r="4">4</button><button class="r6" data-r="6">6</button><button class="wk" data-w>WICKET</button>
        <button class="ex" data-ex>Wide / No ball / Byes</button><button class="ex" data-r="5" style="font-size:30px">5</button><button class="ac undo" data-undo>Undo</button><button class="ac ${editing ? 'on' : ''}" data-edit>Edit last</button>
        <button class="ac" data-swap>Swap strike</button><button class="ac" data-pen>Penalty</button><button class="ac" data-dead>Dead ball</button>${d.cur % 2 === 1 ? '<button class="ac" data-rev>Revised target</button>' : ''}<button class="ac" data-bowler>Change bowler</button><button class="ac" data-ret>Retire</button><button class="ac" data-endinn style="grid-column:span 2">End innings</button></div></div>
      <div class="panel"><h3>At the crease</h3>${vm.batters.map(b => `<div class="bat ${b.strike ? 'on' : ''}"><b class="nm">${esc(b.name)}</b><b>${b.runs} <small>(${b.balls})</small></b><small>${b.fours}x4 ${b.sixes}x6 SR ${b.sr}</small></div>`).join('') || '<span class="mono">No batters</span>'}
        <h3 style="margin-top:18px">Bowler</h3>${vm.bowler ? `<div class="bat"><b class="nm">${esc(vm.bowler.name)}</b><b>${vm.bowler.w}-${vm.bowler.r}</b><small>${vm.bowler.o} ov, ${vm.bowler.m} mdn, eco ${vm.bowler.econ}</small></div>` : '<span class="mono">Select bowler</span>'}
        <div class="mono" style="margin:14px 0 6px">This over</div><div class="over">${(vm.thisOver.length ? vm.thisOver : ['-']).map(ballChip).join('')}</div></div></div>
     <div class="panel" style="margin-top:16px"><h3>Recent deliveries</h3><div class="scroll"><table class="t"><tbody>${recent.map(b => `<tr><td class="mono">${b.over}.${b.ball}</td><td>${esc(nameOf(b.bowler))} to ${esc(nameOf(b.striker))}</td><td>${ballChip(b.sym)}</td><td class="r">${b.legal ? '' : '<span class="mono">not counted</span>'}</td></tr>`).join('') || '<tr><td>No deliveries yet</td></tr>'}</tbody></table></div></div>`;
    wire();
  }
  function wire() {
    const c = con(); $$('[data-r]', c).forEach(b => b.onclick = () => send({ t: 'ball', runsBat: +b.dataset.r })); $('[data-w]', c)?.addEventListener('click', openWicket); $('[data-ex]', c)?.addEventListener('click', openExtras);
    $$('[data-undo]', c).forEach(b => b.onclick = async () => { if (busy) return; if (queue.length) return toast('Undo needs a connection. Wait for the queue to sync.', true); try { await api('POST', `/api/matches/${id}/undo`); toast('Undone'); await refresh(); } catch (e) { toast(e.message, true); } });
    $('[data-edit]', c)?.addEventListener('click', () => { if (!inn().state.balls.length) return toast('No delivery to edit', true); editing = !editing; draw(); toast(editing ? 'Record the corrected delivery' : 'Edit cancelled'); });
    $('[data-ce]', c)?.addEventListener('click', () => { editing = false; draw(); }); $('[data-swap]', c)?.addEventListener('click', () => send({ t: 'swap' })); $('[data-pen]', c)?.addEventListener('click', openPenalty);
    $$('[data-bowler]', c).forEach(b => b.onclick = openBowler); $('[data-ret]', c)?.addEventListener('click', openRetire); $('[data-i2]', c)?.addEventListener('click', startInnings2); $('[data-fin]', c)?.addEventListener('click', finishMenu);
    $('[data-dead]', c)?.addEventListener('click', () => send({ t: 'dead' })); $('[data-rev]', c)?.addEventListener('click', openRevise);
    $('[data-so]', c)?.addEventListener('click', async () => { try { await api('POST', `/api/matches/${id}/superover`); await refresh(); } catch (e) { toast(e.message, true); } });
    $('[data-exp]', c)?.addEventListener('click', () => download(`/api/matches/${id}/export?format=csv`, `${id}.csv`).catch(e => toast(e.message, true)));
    $('[data-retry]', c)?.addEventListener('click', () => { conflict = ''; flush(); });
    $('[data-discard]', c)?.addEventListener('click', async () => { if (!await confirmBox('Delete the entries that have not synced? The server scorecard will be shown instead.')) return; queue = []; conflict = ''; await qPut(id, []); await refresh(); });
    $('[data-endinn]', c)?.addEventListener('click', async () => { if (await confirmBox('End this innings now (declare / close)?')) send({ t: 'endInnings' }); });
    $('[data-potm]', c)?.addEventListener('click', async () => { try { await api('POST', `/api/matches/${id}/finish`, { potm: $('#potm').value, potmLine: $('#potml').value }); toast('Saved'); await refresh(); } catch (e) { toast(e.message, true); } });
  }
  queue = await qGet(id); await refresh(); if (queue.length && M) { for (const it of queue) { try { localApply(it.cmd); } catch {} } draw(); flush(); }
  addEventListener('online', () => { sync = 'busy'; flush(); });
  if (M && M.doc.status === 'live' && st().bowler === null && st().legalBalls === 0) openBowler();
  timer = setInterval(() => { if (!busy && !$('.veil')) { if (queue.length) flush(); else refresh(true); } }, 2500); ctx.cleanup = () => clearInterval(timer);
}
