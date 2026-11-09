import { $, $$, api, toast, esc, copy, modal, ballChip, download } from './core.js';
import { qrSvg } from './qr.js';
import { GRAPHIC_LIST, FX_LIST } from './themes.js';

export async function renderBroadcast(root, id, ctx) {
  ctx.shell('/studio', '<div id="bc"><div class="panel"><div class="skel blk"></div></div></div>');
  let M = null, tab = 'studio', duration = 0, busy = false, timer = 0; const base = location.origin;
  const B = () => $('#bc');
  async function refresh(repaint = true) { try { M = await api('GET', `/api/matches/${id}`); if (repaint) paint(); } catch (e) { toast(e.message, true); } }
  async function act(body, msg) { if (busy) return; busy = true; try { const r = await api('POST', `/api/broadcast/${id}`, body); if (msg) toast(msg); await refresh(); return r; } catch (e) { toast(e.message, true); } finally { busy = false; } }
  const url = (panel, q = '') => `${base}/o/${M.links.token}/${panel}${q}`;

  function paint() {
    if (!M) return; if (!M.perms.broadcast) { B().innerHTML = '<div class="panel">You do not have broadcast permission for this match.</div>'; return; }
    const d = M.doc, vm = M.vm;
    const head = `<div class="sc-top"><a class="mono" href="#/studio">&larr; Matches</a><b style="font:800 22px var(--f-d)">${esc(d.name)}</b><span class="tag ${d.status === 'live' ? 'live' : 'lime'}">${d.status}</span><div style="flex:1"></div><a class="btn sm ghost" href="#/match/${id}/score">Scoring console</a></div>
      <div class="tabs">${[['studio', 'Control room'], ['fx', 'Celebrations'], ['sponsors', 'Sponsors'], ['links', 'Links & access']].map(([k, l]) => `<button class="${tab === k ? 'on' : ''}" data-tab="${k}">${l}</button>`).join('')}</div><div id="tabbody"></div>`;
    if (!$('#tabbody')) B().innerHTML = head; else { const o = $('.sc-top b'); if (o) o.textContent = d.name; $$('[data-tab]').forEach(b => b.classList.toggle('on', b.dataset.tab === tab)); }
    $$('[data-tab]').forEach(b => b.onclick = () => { tab = b.dataset.tab; $('#tabbody').innerHTML = ''; paint(); });
    ({ studio, fx, sponsors, links })[tab]();
  }

  // ---------- control room ----------
  function studio() {
    const d = M.doc, vm = M.vm, pg = d.program, pv = d.preview, tb = $('#tabbody');
    if (!$('#mons')) {
      tb.innerHTML = `<div class="bc"><div class="panel glist" id="gl"></div><div class="center"><div class="monpair" id="mons"><div class="mon pv"><span class="lab">PREVIEW</span><iframe id="ifp" src="/o/${M.links.token}/all?mode=preview&bg=checker" title="preview"></iframe></div><div class="mon pg"><span class="lab">ON AIR</span><iframe id="ifg" src="/o/${M.links.token}/all?bg=checker" title="program"></iframe></div></div><div class="panel" style="margin-top:12px" id="strip"></div></div><div class="panel" id="rt"></div></div>`;
      const fit = () => $$('.mon').forEach(m => { const f = m.querySelector('iframe'); f.style.transform = `scale(${m.clientWidth / 1920})`; }); new ResizeObserver(fit).observe($('#mons')); fit();
    }
    $('#gl').innerHTML = `<h3>Graphics</h3>` + GRAPHIC_LIST.map(([cat, items]) => `<h4>${cat}</h4>` + items.map(([k, l]) => `<button class="${pv?.graphic === k ? 'stg' : ''} ${pg.graphic === k ? 'air' : ''}" data-g="${k}"><span>${l}</span><span class="mono">${pg.graphic === k ? 'ON AIR' : pv?.graphic === k ? 'STAGED' : ''}</span></button>`).join('')).join('');
    $$('[data-g]').forEach(b => b.onclick = () => act({ action: 'stage', graphic: b.dataset.g }));
    const s = vm.score || {};
    $('#strip').innerHTML = `<div class="grid g4"><div><span class="mono">Score</span><div style="font:800 34px var(--f-d)">${esc(vm.bat ? vm.teams[vm.bat].short : '-')} ${s.runs ?? 0}/${s.wkts ?? 0}</div></div><div><span class="mono">Overs</span><div style="font:800 34px var(--f-d)">${esc(s.overs ?? '0.0')}</div></div><div><span class="mono">On air</span><div style="font:800 24px var(--f-d);color:var(--red)">${pg.graphic ? esc(pg.graphic).toUpperCase() : 'SCOREBOARD ONLY'}</div></div><div><span class="mono">Staged</span><div style="font:800 24px var(--f-d);color:var(--org)">${esc(pv?.graphic || '-').toUpperCase()}</div></div></div>
      <div class="over" style="margin-top:10px">${vm.lastSix.map(ballChip).join('')}</div>`;
    const st = d.settings;
    $('#rt').innerHTML = `<button class="btn red takebtn" data-take>TAKE TO AIR</button><div class="rowb"><button class="btn ghost" data-hide>Hide graphic</button><button class="btn ghost" data-clear>Clear all</button><button class="btn ghost" data-replay>Replay last</button><button class="btn ghost" data-tick>${st.ticker ? 'Hide' : 'Show'} scoreboard</button></div>
      <h4 class="mono" style="margin:18px 0 6px">Auto-hide after</h4><div class="chips">${[[0, 'Manual'], [6, '6 s'], [10, '10 s'], [15, '15 s']].map(([v, l]) => `<span class="chip ${duration === v ? 'on' : ''}" data-dur="${v}">${l}</span>`).join('')}</div>
      <h4 class="mono" style="margin:18px 0 6px">Scoreboard position</h4><div class="chips">${['bottom', 'top'].map(v => `<span class="chip ${st.position === v ? 'on' : ''}" data-pos="${v}">${v}</span>`).join('')}</div>
      <h4 class="mono" style="margin:18px 0 6px">Theme</h4><div class="chips">${['arena', 'pulse'].map(v => `<span class="chip ${st.theme === v ? 'on' : ''}" data-th="${v}">${v.toUpperCase()}</span>`).join('')}</div>
      <h4 class="mono" style="margin:18px 0 6px">Trigger celebration (on air)</h4><div class="chips">${['four', 'six', 'wicket'].map(v => `<span class="chip" data-fx="${v}">${v.toUpperCase()}</span>`).join('')}</div>
      <h4 class="mono" style="margin:18px 0 6px">Test in preview only</h4><div class="chips">${FX_LIST.slice(0, 6).map(([v, l]) => `<span class="chip" data-test="${v}">${l}</span>`).join('')}</div>
      ${d.pending.length ? `<h4 class="mono" style="margin:18px 0 6px;color:var(--org)">Waiting for approval</h4>${d.pending.map(e => `<div class="ev"><b>${esc(e.fx.toUpperCase())}</b><span style="flex:1">${esc(e.payload.batterName || e.payload.bowlerName || '')}</span><button class="btn sm" data-ap="${e.seq}">Show</button><button class="btn sm ghost" data-dm="${e.seq}">x</button></div>`).join('')}` : ''}`;
    $('[data-take]').onclick = () => act({ action: 'take', duration }, 'Graphic is on air'); $('[data-hide]').onclick = () => act({ action: 'hide' }); $('[data-clear]').onclick = () => act({ action: 'clear' }, 'Cleared');
    $('[data-replay]').onclick = () => act({ action: 'replay' }, 'Replaying'); $('[data-tick]').onclick = () => act({ action: 'ticker', on: !st.ticker });
    $$('[data-dur]').forEach(c => c.onclick = () => { duration = +c.dataset.dur; paint(); }); $$('[data-pos]').forEach(c => c.onclick = () => act({ action: 'settings', patch: { position: c.dataset.pos } })); $$('[data-th]').forEach(c => c.onclick = () => act({ action: 'settings', patch: { theme: c.dataset.th } }));
    $$('[data-fx]').forEach(c => c.onclick = () => act({ action: 'fx', fx: c.dataset.fx })); $$('[data-test]').forEach(c => c.onclick = () => $('#ifp')?.contentWindow.postMessage({ type: 'play', fx: c.dataset.test }, location.origin));
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
    const L = [['all', 'Everything (recommended)', 'One browser source: scoreboard + graphics + celebrations, controlled from this room'], ['scoreboard', 'Main scoreboard'], ['celebrations', 'Celebrations only'], ['batting', 'Batting scorecard'], ['bowling', 'Bowling scorecard'], ['over', 'Current over'], ['partnership', 'Partnership'], ['lineupA', 'Playing XI: Team A'], ['lineupB', 'Playing XI: Team B'], ['matchinfo', 'Match information'], ['summary', 'Match summary'], ['points', 'Points table'], ['sponsor', 'Sponsor panel']];
    const d = M.doc;
    $('#tabbody').innerHTML = `<div class="grid g2"><div class="panel"><h3>Overlay URLs</h3><p style="color:var(--dim);font-size:14px">Add as a Browser Source in OBS, vMix, PRISM, Streamlabs or Wirecast. Width 1920, height 1080. Transparent background is automatic. Treat these links like passwords.</p>
      ${L.map(([k, l]) => `<div class="linkrow"><span>${l}</span><code>${esc(url(k))}</code><button class="btn sm ghost" data-cp="${esc(url(k))}">Copy</button></div>`).join('')}
      <div class="actions" style="margin-top:14px"><button class="btn red sm" data-rot>Revoke and create new links</button></div></div>
      <div><div class="panel"><h3>Share</h3><div style="display:flex;gap:16px;align-items:center;margin-bottom:10px"><div style="width:130px;height:130px;background:#fff;flex:none">${qrSvg(`${base}/m/${id}`, { margin: 1 })}</div><span class="mono">Scan to open the public scoreboard. Show the QR on air from Graphics &rarr; Branding.</span></div><div class="linkrow"><span>Public scoreboard</span><code>${base}/m/${id}</code><button class="btn sm ghost" data-cp="${base}/m/${id}">Copy</button></div><label class="sw" style="margin-top:8px"><input type="checkbox" id="pub" ${d.public ? 'checked' : ''}> Public page is on</label>${d.tournamentId ? `<div class="linkrow"><span>Tournament page</span><code>${base}/t/${d.tournamentId}</code><button class="btn sm ghost" data-cp="${base}/t/${d.tournamentId}">Copy</button></div>` : ''}</div>
      <div class="panel" style="margin-top:16px"><h3>Export</h3><div class="actions"><button class="btn sm ghost" data-ex="csv">Deliveries CSV</button><button class="btn sm ghost" data-ex="json">Full match JSON</button><a class="btn sm ghost" target="_blank" href="/m/${id}?print=1">Printable scorecard</a></div></div>
      <div class="panel" style="margin-top:16px"><h3>Access</h3><p style="color:var(--dim);font-size:14px">Invite a registered user. Scoring and broadcast are separate permissions.</p>${(d.members || []).map(m => `<div class="ev"><b style="flex:1">${esc(m.email)}</b>${m.score ? '<span class="tag ok">score</span>' : ''}${m.broadcast ? '<span class="tag lime">broadcast</span>' : ''}</div>`).join('')}
      ${M.perms.owner ? `<div class="grid" style="margin-top:10px"><input id="inv" type="email" placeholder="email@example.com"><label class="sw"><input type="checkbox" id="ps"> Can update score</label><label class="sw"><input type="checkbox" id="pb" checked> Can control broadcast</label><button class="btn sm" data-inv>Invite</button></div>` : ''}</div></div></div>`;
    $$('[data-cp]').forEach(b => b.onclick = () => copy(b.dataset.cp));
    $$('[data-ex]').forEach(b => b.onclick = () => download(`/api/matches/${id}/export?format=${b.dataset.ex}`, `${id}.${b.dataset.ex}`).catch(e => toast(e.message, true)));
    $('[data-rot]')?.addEventListener('click', async () => { if (!confirm('Old links stop working immediately. Continue?')) return; try { await api('POST', `/api/matches/${id}/token/rotate`); toast('New links created'); await refresh(); } catch (e) { toast(e.message, true); } });
    $('#pub')?.addEventListener('change', async (e) => { try { await api('POST', `/api/matches/${id}/finish`, { public: e.target.checked }); toast('Saved'); } catch (er) { toast(er.message, true); } });
    $('[data-inv]')?.addEventListener('click', async () => { try { await api('POST', `/api/matches/${id}/members`, { email: $('#inv').value, score: $('#ps').checked, broadcast: $('#pb').checked }); toast('Invited'); await refresh(); } catch (e) { toast(e.message, true); } });
  }

  await refresh(); timer = setInterval(() => { if (!busy && !$('.veil') && document.activeElement?.tagName !== 'INPUT') refresh(true); }, 2500); ctx.cleanup = () => clearInterval(timer);
}
