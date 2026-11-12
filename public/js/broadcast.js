import { $, $$, api, toast, esc, copy, modal, ballChip, download } from './core.js';
import { qrSvg } from './qr.js';
import { subscribe } from './rt.js';
import { openSummary } from './summary-ui.js';
import { GROUPS, FX_LIST, slotOf } from './themes.js';

export async function renderBroadcast(root, id, ctx) {
  ctx.shell('/studio', '<div id="bc"><div class="panel"><div class="skel blk"></div></div></div>');
  let M = null, tab = 'studio', duration = 0, busy = false, timer = 0; const base = location.origin;
  const B = () => $('#bc');
  async function refresh(repaint = true) { try { M = await api('GET', `/api/matches/${id}`); if (repaint) paint(); } catch (e) { toast(e.message, true); } }
  async function act(body, msg) { if (busy) return; busy = true; try { const r = await api('POST', `/api/broadcast/${id}`, body); if (msg) toast(msg); await refresh(); return r; } catch (e) { toast(e.message, true); } finally { busy = false; } }
  const url = (panel, q = '') => `${base}/o/?t=${M.links.token}&p=${panel}${q}`;

  function paint() {
    if (!M) return; if (!M.perms.broadcast) { B().innerHTML = '<div class="panel">You do not have broadcast permission for this match.</div>'; return; }
    const d = M.doc, vm = M.vm;
    const head = `<div class="sc-top"><a class="mono" href="#/studio">&larr; Matches</a><b style="font:800 22px var(--f-d)">${esc(d.name)}</b><span class="tag ${d.status === 'live' ? 'live' : 'lime'}">${d.status}</span><div style="flex:1"></div><a class="btn sm ghost" href="#/match/${id}/score">Scoring console</a></div>
      <div class="tabs">${[['studio', 'Control room'], ['fx', 'Celebrations'], ['sponsors', 'Sponsors'], ['links', 'Links & access']].map(([k, l]) => `<button class="${tab === k ? 'on' : ''}" data-tab="${k}">${l}</button>`).join('')}</div><div id="tabbody"></div>`;
    if (!$('#tabbody')) B().innerHTML = head; else { const o = $('.sc-top b'); if (o) o.textContent = d.name; $$('[data-tab]').forEach(b => b.classList.toggle('on', b.dataset.tab === tab)); }
    $$('[data-tab]').forEach(b => b.onclick = () => { tab = b.dataset.tab; $('#tabbody').innerHTML = ''; paint(); });
    ({ studio, fx, sponsors, links })[tab]();
  }

  // ---------- control room: click a switch and it goes on air immediately ----------
  const aliveSlot = (s) => s && s.g && (!s.until || s.until > Date.now());
  const isOn = (g, params) => { const sl = (M.doc.slots || {})[slotOf(g)]; return aliveSlot(sl) && sl.g === g && (g !== 'sponsor' || (sl.params?.i || 0) === (params?.i || 0)); };
  const row = (g, label, params) => `<button class="sw2 ${isOn(g, params) ? 'on' : ''}" data-t="${g}" ${params ? `data-i="${params.i}"` : ''} aria-pressed="${isOn(g, params)}"><span class="trk"></span><span>${esc(label)}</span><em>ON AIR</em></button>`;
  async function toggle(g, params) {
    const slot = slotOf(g); M.doc.slots ||= {}; const cur = M.doc.slots[slot], on = isOn(g, params);
    M.doc.slots[slot] = on ? null : { g, params: params || {}, id: (cur?.id || 0) + 1, until: duration ? Date.now() + duration * 1000 : 0 }; paint(); // instant feedback
    try { const r = await api('POST', `/api/broadcast/${id}`, { action: 'toggle', graphic: g, params, duration }); if (r.view) { M = r.view; paint(); } } catch (e) { toast(e.message, true); await refresh(); }
  }
  function studio() {
    const d = M.doc, vm = M.vm, tb = $('#tabbody'), st = d.settings || {}, tk = st.ticker !== false, s = vm.score || {};
    if (!$('#mons')) {
      tb.innerHTML = `<div class="bc2"><div><div id="mons"><div class="mon pg"><span class="lab">ON AIR</span><iframe id="ifg" src="/o/?t=${M.links.token}&p=all&bg=checker" title="on air"></iframe></div></div><div class="panel" style="margin-top:12px" id="strip"></div><div class="panel" style="margin-top:12px" id="fxp"></div></div><div id="ctl"></div></div>`;
      const fit = () => $$('.mon').forEach(m => { const f = m.querySelector('iframe'); f.style.transform = `scale(${m.clientWidth / 1920})`; }); new ResizeObserver(fit).observe($('#mons')); fit();
    }
    const live = ['inline', 'lower', 'full'].map(k => (d.slots || {})[k]).filter(aliveSlot).map(x => x.g);
    $('#strip').innerHTML = `<div class="grid g4"><div><span class="mono">Score</span><div style="font:800 34px var(--f-d)">${esc(vm.bat ? vm.teams[vm.bat].short : '-')} ${s.runs ?? 0}/${s.wkts ?? 0}</div></div><div><span class="mono">Overs</span><div style="font:800 34px var(--f-d)">${esc(s.overs ?? '0.0')}</div></div><div style="grid-column:span 2"><span class="mono">On air now</span><div style="font:800 24px var(--f-d);color:var(--red)">${[tk ? 'SCOREBOARD' : '', ...live.map(x => x.toUpperCase())].filter(Boolean).join('  +  ') || 'NOTHING'}</div></div></div><div class="over" style="margin-top:10px">${vm.lastSix.map(ballChip).join('')}</div>`;
    $('#fxp').innerHTML = `<h4 class="mono">Celebrations (plays inside the scoreboard)</h4><div class="fxrow">${['four', 'six', 'wicket', 'noball', 'fifty', 'century'].map(v => `<button class="btn ${v === 'wicket' ? 'red' : v === 'six' ? '' : 'chalk'}" data-fx="${v}">${v === 'century' ? 'HUNDRED' : v === 'noball' ? 'NO BALL' : v.toUpperCase()}</button>`).join('')}</div><div class="actions" style="margin-top:10px"><button class="btn sm ghost" data-replay>Replay last</button><button class="btn sm ghost" data-clear>Clear everything</button></div>
      ${(d.pending || []).length ? `<h4 class="mono" style="margin:14px 0 6px;color:var(--org)">Waiting for approval</h4>${d.pending.map(e => `<div class="ev"><b>${esc(e.fx.toUpperCase())}</b><span style="flex:1">${esc(e.payload.batterName || e.payload.bowlerName || '')}</span><button class="btn sm" data-ap="${e.seq}">Show</button><button class="btn sm ghost" data-dm="${e.seq}">x</button></div>`).join('')}` : ''}`;
    const sponsors = d.sponsors || [], cu = st.custom || {};
    $('#ctl').innerHTML = `<div class="panel">
      <button class="sw2 master ${tk ? 'on' : ''}" data-tick aria-pressed="${tk}"><span class="trk"></span><span style="font:800 22px var(--f-d);letter-spacing:.05em">MAIN SCOREBOARD</span><em>${tk ? 'ON AIR' : ''}</em></button>
      <div class="grp" style="margin-top:14px"><h4>${GROUPS[0].title} <small>${GROUPS[0].note}</small></h4><div class="swgrid">${GROUPS[0].items.map(([k, l]) => row(k, l)).join('')}</div>
        <div class="grid g2" style="margin-top:6px"><label class="f"><span>Custom text 1 (e.g. tournament)</span><input id="cu1" value="${esc(cu.left || '')}" placeholder="${esc(vm.match.tournament || 'Tournament name')}"></label><label class="f"><span>Custom text 2 (e.g. location)</span><input id="cu2" value="${esc(cu.right || '')}" placeholder="${esc(vm.match.venue || 'Venue')}"></label></div><button class="btn sm ghost" style="margin-top:8px" data-cusave>Save custom text</button></div>
      <div class="grp"><h4>${GROUPS[1].title} <small>${GROUPS[1].note}</small></h4><div class="swgrid">${GROUPS[1].items.map(([k, l]) => row(k, l)).join('')}${sponsors.map((sp, i) => row('sponsor', 'Sponsor: ' + sp.name, { i })).join('')}</div>${sponsors.length ? '' : '<p class="mono" style="margin:4px 0 0">Add sponsors in the Sponsors tab to show them here.</p>'}</div>
      <div class="grp"><h4>${GROUPS[2].title} <small>${GROUPS[2].note}</small></h4><div class="swgrid">${GROUPS[2].items.map(([k, l]) => row(k, l)).join('')}</div></div>
      <div class="grp"><h4>Options</h4><h4 class="mono" style="margin:8px 0 6px">Auto-hide timed graphics after</h4><div class="chips">${[[0, 'Manual'], [6, '6 s'], [10, '10 s'], [15, '15 s']].map(([v, l]) => `<span class="chip ${duration === v ? 'on' : ''}" data-dur="${v}">${l}</span>`).join('')}</div>
        <h4 class="mono" style="margin:12px 0 6px">Scoreboard position</h4><div class="chips">${['bottom', 'top'].map(v => `<span class="chip ${st.position === v ? 'on' : ''}" data-pos="${v}">${v}</span>`).join('')}</div>
        <h4 class="mono" style="margin:12px 0 6px">Theme</h4><div class="chips">${['arena', 'pulse', 'mohua'].map(v => `<span class="chip ${st.theme === v ? 'on' : ''}" data-th="${v}">${v.toUpperCase()}</span>`).join('')}</div>
        <button class="sw2 ${st.sound ? 'on' : ''}" style="margin-top:12px" data-snd><span class="trk"></span><span>Transition and celebration sounds</span><em>ON</em></button></div></div>`;
    $$('[data-t]').forEach(b => b.onclick = () => toggle(b.dataset.t, b.dataset.i !== undefined ? { i: +b.dataset.i } : undefined));
    $('[data-tick]').onclick = () => { M.doc.settings.ticker = !tk; paint(); act({ action: 'ticker', on: !tk }); };
    $('[data-cusave]').onclick = () => act({ action: 'settings', patch: { custom: { left: $('#cu1').value, right: $('#cu2').value } } }, 'Saved');
    $$('[data-dur]').forEach(c => c.onclick = () => { duration = +c.dataset.dur; paint(); }); $$('[data-pos]').forEach(c => c.onclick = () => act({ action: 'settings', patch: { position: c.dataset.pos } })); $$('[data-th]').forEach(c => c.onclick = () => act({ action: 'settings', patch: { theme: c.dataset.th } }));
    $('[data-snd]').onclick = () => act({ action: 'settings', patch: { sound: !st.sound } });
    $$('[data-fx]').forEach(c => c.onclick = () => act({ action: 'fx', fx: c.dataset.fx })); $('[data-replay]').onclick = () => act({ action: 'replay' }, 'Replaying'); $('[data-clear]').onclick = () => act({ action: 'clear' }, 'Cleared');
    $$('[data-ap]').forEach(c => c.onclick = () => act({ action: 'approve', seq: +c.dataset.ap })); $$('[data-dm]').forEach(c => c.onclick = () => act({ action: 'dismiss', seq: +c.dataset.dm }));
  }

  // ---------- celebrations ----------
  function fx() {
    const st = M.doc.settings, c = st.celebrations;
    $('#tabbody').innerHTML = `<div class="grid g2"><div class="panel"><h3>Automatic celebrations</h3><p style="color:var(--dim);font-size:14px">Animations fire only when the scorer records the matching delivery. A refresh, reconnect or undo never replays them.</p>
      ${FX_LIST.map(([k, l]) => `<label class="sw"><input type="checkbox" data-c="${k}" ${c[k] ? 'checked' : ''}> ${l}</label>`).join('')}</div>
      <div class="panel"><h3>Behaviour</h3><h4 class="mono" style="margin:6px 0">Mode</h4><div class="chips"><span class="chip ${st.mode === 'auto' ? 'on' : ''}" data-m="auto">Automatic</span><span class="chip ${st.mode === 'approve' ? 'on' : ''}" data-m="approve">Operator approves each</span></div>
      <label class="f" style="margin-top:16px"><span>Animation length: ${(st.duration / 1000).toFixed(1)} s</span><input type="range" id="dur" min="1500" max="8000" step="100" value="${st.duration}"></label>
      <label class="sw" style="margin-top:12px"><input type="checkbox" id="snd" ${st.sound ? 'checked' : ''}> Sound effects (browser source audio)</label>
      <label class="f" style="margin-top:12px"><span>Overlay scale: ${st.scale}x</span><input type="range" id="scl" min="0.5" max="1.5" step="0.05" value="${st.scale}"></label>
      <label class="f" style="margin-top:12px"><span>Safe margin: ${st.safe}px</span><input type="range" id="sf" min="0" max="160" step="4" value="${st.safe}"></label></div></div>`;
    $$('[data-c]').forEach(i => i.onchange = () => act({ action: 'settings', patch: { celebrations: { [i.dataset.c]: i.checked } } })); $$('[data-m]').forEach(i => i.onclick = () => act({ action: 'settings', patch: { mode: i.dataset.m } }));
    $('#dur').onchange = (e) => act({ action: 'settings', patch: { duration: +e.target.value } }); $('#snd').onchange = (e) => act({ action: 'settings', patch: { sound: e.target.checked } });
    $('#scl').onchange = (e) => act({ action: 'settings', patch: { scale: +e.target.value } }); $('#sf').onchange = (e) => act({ action: 'settings', patch: { safe: +e.target.value } });
  }

  // ---------- sponsors ----------
  async function sponsors() {
    const all = (await api('GET', '/api/data')).sponsors, chosen = M.doc.sponsors || [];
    $('#tabbody').innerHTML = `<div class="grid g2"><div class="panel"><h3>Sponsors for this match</h3>${all.map(s => `<label class="sw"><input type="checkbox" data-s="${s.id}" ${chosen.some(c => c.name === s.name) ? 'checked' : ''}> ${esc(s.name)} <span class="mono">${esc(s.message)}</span></label>`).join('') || '<p class="mono">Add sponsors from the Sponsors page first.</p>'}<button class="btn sm" style="margin-top:10px" data-save>Save selection</button></div>
      <div class="panel"><h3>Show on air</h3>${chosen.map((s, i) => `<div class="ev"><b style="flex:1">${esc(s.name)}</b><button class="btn sm ghost" data-st="${i}">Stage</button><button class="btn sm" data-sh="${i}">Show</button></div>`).join('') || '<p class="mono">No sponsors selected.</p>'}</div></div>`;
    $('[data-save]')?.addEventListener('click', () => act({ action: 'settings', patch: { sponsors: $$('[data-s]:checked').map(i => { const s = all.find(x => x.id === i.dataset.s); return { name: s.name, message: s.message, logo: s.logo }; }) } }, 'Saved'));
    $$('[data-st]').forEach(b => b.onclick = () => act({ action: 'stage', graphic: 'sponsor', params: { i: +b.dataset.st } }, 'Staged')); $$('[data-sh]').forEach(b => b.onclick = () => act({ action: 'show', graphic: 'sponsor', params: { i: +b.dataset.sh }, duration: 10 }, 'On air'));
  }

  // ---------- links ----------
  function links() {
    const L = [['all', 'Everything (recommended)', 'One browser source: scoreboard + graphics + celebrations, controlled from this room'], ['scoreboard', 'Main scoreboard only'], ['celebrations', 'Celebrations only'], ['batting', 'Batting scorecard'], ['bowling', 'Bowling scorecard'], ['lineups', 'Both playing XIs'], ['points', 'Points table'], ['result', 'Match result'], ['summary', 'Match summary'], ['batterCard', 'Batter card'], ['bowlerCard', 'Bowler card'], ['potm', 'Player of the Match'], ['sponsor', 'Sponsor strip']];
    const d = M.doc;
    $('#tabbody').innerHTML = `<div class="grid g2"><div class="panel"><h3>Overlay URLs</h3><p style="color:var(--dim);font-size:14px">Add as a Browser Source in OBS, vMix, PRISM, Streamlabs or Wirecast. Width 1920, height 1080. Transparent background is automatic. Treat these links like passwords.</p>
      ${L.map(([k, l]) => `<div class="linkrow"><span>${l}</span><code>${esc(url(k))}</code><button class="btn sm ghost" data-cp="${esc(url(k))}">Copy</button></div>`).join('')}
      <div class="actions" style="margin-top:14px"><button class="btn red sm" data-rot>Revoke and create new links</button></div></div>
      <div><div class="panel"><h3>Share</h3><div style="display:flex;gap:16px;align-items:center;margin-bottom:10px"><div style="width:130px;height:130px;background:#fff;flex:none">${qrSvg(`${base}/m/?id=${id}`, { margin: 1 })}</div><span class="mono">Scan to open the public scoreboard. Show the QR on air from Graphics &rarr; Branding.</span></div><div class="linkrow"><span>Public scoreboard</span><code>${base}/m/?id=${id}</code><button class="btn sm ghost" data-cp="${base}/m/?id=${id}">Copy</button></div><label class="sw" style="margin-top:8px"><input type="checkbox" id="pub" ${d.public ? 'checked' : ''}> Public page is on</label>${d.tournamentId ? `<div class="linkrow"><span>Tournament page</span><code>${base}/t/?id=${d.tournamentId}</code><button class="btn sm ghost" data-cp="${base}/t/?id=${d.tournamentId}">Copy</button></div>` : ''}</div>
      <div class="panel" style="margin-top:16px"><h3>Export</h3><div class="actions"><button class="btn" data-simg>Match summary picture</button><button class="btn sm ghost" data-ex="csv">Deliveries CSV</button><button class="btn sm ghost" data-ex="json">Full match JSON</button><a class="btn sm ghost" target="_blank" href="/m/?id=${id}&print=1">Printable scorecard</a></div></div>
      <div class="panel" style="margin-top:16px"><h3>Access</h3><p style="color:var(--dim);font-size:14px">Invite a registered user. Scoring and broadcast are separate permissions.</p>${(d.members || []).map(m => `<div class="ev"><b style="flex:1">${esc(m.email)}</b>${m.score ? '<span class="tag ok">score</span>' : ''}${m.broadcast ? '<span class="tag lime">broadcast</span>' : ''}</div>`).join('')}
      ${M.perms.owner ? `<div class="grid" style="margin-top:10px"><input id="inv" type="email" placeholder="email@example.com"><label class="sw"><input type="checkbox" id="ps"> Can update score</label><label class="sw"><input type="checkbox" id="pb" checked> Can control broadcast</label><button class="btn sm" data-inv>Invite</button></div>` : ''}</div></div></div>`;
    $$('[data-cp]').forEach(b => b.onclick = () => copy(b.dataset.cp));
    $('[data-simg]')?.addEventListener('click', () => openSummary(M.vm, `${base}/m/?id=${id}`));
    $$('[data-ex]').forEach(b => b.onclick = () => download(`/api/matches/${id}/export?format=${b.dataset.ex}`, `${id}.${b.dataset.ex}`).catch(e => toast(e.message, true)));
    $('[data-rot]')?.addEventListener('click', async () => { if (!confirm('Old links stop working immediately. Continue?')) return; try { await api('POST', `/api/matches/${id}/token/rotate`); toast('New links created'); await refresh(); } catch (e) { toast(e.message, true); } });
    $('#pub')?.addEventListener('change', async (e) => { try { await api('POST', `/api/matches/${id}/finish`, { public: e.target.checked }); toast('Saved'); } catch (er) { toast(er.message, true); } });
    $('[data-inv]')?.addEventListener('click', async () => { try { await api('POST', `/api/matches/${id}/members`, { email: $('#inv').value, score: $('#ps').checked, broadcast: $('#pb').checked }); toast('Invited'); await refresh(); } catch (e) { toast(e.message, true); } });
  }

  await refresh(); const rtS = subscribe(M?.rt, () => { if (!busy && !$('.veil') && document.activeElement?.tagName !== 'INPUT') refresh(true); });
  let tk = 0; timer = setInterval(() => { tk++; if (!busy && !$('.veil') && document.activeElement?.tagName !== 'INPUT' && (!rtS.connected() || tk % 4 === 0)) refresh(true); }, 2000); ctx.cleanup = () => { clearInterval(timer); rtS.close(); };
}
