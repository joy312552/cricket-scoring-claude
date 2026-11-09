// Browser-source overlay runtime. Read-only: renders server state, plays each celebration once.
import { panel, fx } from './themes.js';
const parts = location.pathname.split('/').filter(Boolean); // o, token, panel
const token = parts[1], PANEL = (parts[2] || 'all').toLowerCase();
const q = new URLSearchParams(location.search);
const PREVIEW = q.get('mode') === 'preview';
if (q.get('bg') === 'checker') document.body.classList.add('checker');
const ALIAS = { fullscreen: 'all', ticker: 'scoreboard', info: 'matchinfo', player: 'batterCard', lineup: 'lineupA', lineupa: 'lineupA', lineupb: 'lineupB', batterCard: 'batterCard', bowlerCard: 'bowlerCard' };
const stage = document.querySelector('.stage'), tick = document.querySelector('.tick'), gfx = document.querySelector('.gfx'), fxl = document.querySelector('.fxl');
const PANEL_KEY = ['all', 'celebrations'].includes(PANEL) ? PANEL : (ALIAS[PANEL] || PANEL);
let S = null, ver = null, lastSeq = null, serverNow = Date.now(), tickShown = false, progId = -1, progShown = null, progTimer = 0, soloShown = false, dead = false;

function applyScale() {
  const st = S?.settings || {}, user = parseFloat(q.get('scale')) || st.scale || 1, safe = q.get('safe') ?? st.safe ?? 40;
  const s = Math.min(innerWidth / 1920, innerHeight / 1080) * user;
  stage.style.transform = `translate(${(innerWidth - 1920 * s) / 2}px,${(innerHeight - 1080 * s) / 2}px) scale(${s})`;
  stage.style.setProperty('--safe', safe + 'px');
  stage.classList.toggle('tier-c', innerWidth < 1100);
}
addEventListener('resize', applyScale);

function theme() { return q.get('theme') || S?.settings?.theme || 'arena'; }
function setTheme() { const t = theme(), pos = (q.get('pos') || S?.settings?.position) === 'top';
  stage.className = `stage ${t} ${pos ? 'pos-top' : ''} ${stage.classList.contains('tier-c') ? 'tier-c' : ''}`; }

function renderTicker() {
  const want = (PANEL_KEY === 'all' || PANEL_KEY === 'scoreboard') && (PREVIEW || PANEL_KEY === 'scoreboard' || S.settings.ticker) && S.vm.innings > 0;
  if (!want) { tick.innerHTML = ''; tickShown = false; return; }
  tick.innerHTML = `<div>${panel(theme(), 'scoreboard', S.vm)}</div>`;
  if (!tickShown) { const r = tick.firstElementChild.firstElementChild; r && r.classList.add('in'); tickShown = true; }
}
function showCard(html, animateIn) {
  gfx.innerHTML = html; const r = gfx.firstElementChild; if (r && animateIn) r.classList.add('in');
}
function renderProgram() {
  if (PANEL_KEY === 'celebrations' || PANEL_KEY === 'scoreboard') { gfx.innerHTML = ''; return; }
  const th = theme();
  if (PANEL_KEY !== 'all') { // dedicated single-panel URL: always on
    const key = PANEL_KEY === 'sponsor' ? 'sponsor' : PANEL_KEY; showCard(panel(th, key, S.vm, {}), !soloShown); soloShown = true; return;
  }
  const g = PREVIEW ? S.preview : S.program, now = serverNow;
  const live = g && g.graphic && (PREVIEW || !S.program.until || now < S.program.until);
  const id = PREVIEW ? g.graphic + JSON.stringify(g.params) : S.program.id;
  clearTimeout(progTimer);
  if (!live) { if (progShown) { const r = gfx.firstElementChild; if (r) { r.classList.remove('in'); r.classList.add('out'); setTimeout(() => { if (!progShown) gfx.innerHTML = ''; }, 520); } progShown = null; } progId = id; return; }
  if (id !== progId || !progShown) { progId = id; progShown = g.graphic; showCard(panel(th, g.graphic, S.vm, g.params || {}), true); }
  else showCard(panel(th, g.graphic, S.vm, g.params || {}), false); // data refresh: no re-animation
  if (!PREVIEW && S.program.until) progTimer = setTimeout(() => renderProgram(), Math.max(50, S.program.until - serverNow + 30));
}

// ----- celebrations: queue, one at a time, each event_seq exactly once -----
const queue = []; let playing = false;
function tone(freqs, dur = 0.14) { try { const c = (tone.c ||= new (window.AudioContext || window.webkitAudioContext)()); freqs.forEach((f, i) => { const o = c.createOscillator(), g = c.createGain(); o.frequency.value = f; o.type = 'triangle'; o.connect(g); g.connect(c.destination);
  const t = c.currentTime + i * dur; g.gain.setValueAtTime(0.0001, t); g.gain.exponentialRampToValueAtTime(0.25, t + 0.02); g.gain.exponentialRampToValueAtTime(0.0001, t + dur * 1.6); o.start(t); o.stop(t + dur * 1.7); }); } catch {} }
const SND = { four: [523, 659], six: [523, 659, 784, 1046], wicket: [196, 147], fifty: [523, 784], century: [523, 659, 784, 1046], hattrick: [392, 523, 659] };
async function pump() {
  if (playing) return; playing = true;
  while (queue.length) {
    const e = queue.shift(), d = S.settings.duration || 3600; fxl.innerHTML = fx(theme(), e.fx, e.payload || {}, S.vm);
    const el = fxl.firstElementChild; if (!el) continue; el.style.setProperty('--d', d + 'ms'); if (S.settings.sound && SND[e.fx]) tone(SND[e.fx]);
    await new Promise(r => { el._done = r; setTimeout(r, d); }); fxl.innerHTML = '';
  }
  playing = false;
}
function ingest(events, latest) {
  if (PREVIEW || PANEL_KEY === 'scoreboard' || (PANEL_KEY !== 'all' && PANEL_KEY !== 'celebrations')) { lastSeq = latest; return; }
  if (lastSeq === null) { lastSeq = latest; return; } // first load / refresh: never replay history
  for (const e of events) {
    if (e.seq <= lastSeq) continue;
    if (e.fx === 'clear') { queue.length = 0; fxl.querySelector('.fx')?._done?.(); continue; }
    if (serverNow - e.ts > 12000) continue; // stale after a long disconnect: drop, don't surprise the audience
    queue.push(e);
  }
  lastSeq = Math.max(lastSeq, latest); pump();
}
addEventListener('message', (ev) => { // dashboard preview only
  if (ev.origin !== location.origin || !S || ev.data?.type !== 'play') return;
  const b = S.vm.batters[0]; queue.push({ fx: ev.data.fx, payload: { batterName: b?.name || 'Batter Name', stat: b ? { runs: b.runs, balls: b.balls } : { runs: 52, balls: 31 }, runs: S.vm.score?.runs, wickets: S.vm.score?.wkts, team: S.vm.teams[S.vm.bat || 'A'].short, kind: 'bowled', bowlerName: S.vm.bowler?.name || 'Bowler' } }); pump();
});

function render() { setTheme(); applyScale(); renderTicker(); renderProgram(); }
async function poll() {
  let wait = 900;
  try {
    const r = await fetch(`/api/overlay/${encodeURIComponent(token)}?since=${ver ?? ''}&panel=${encodeURIComponent(PANEL_KEY)}`, { cache: 'no-store' });
    if (r.status === 404) { dead = true; S = null; tick.innerHTML = ''; gfx.innerHTML = ''; fxl.innerHTML = ''; wait = 5000; }
    else if (r.ok) { const j = await r.json(); serverNow = j.now || Date.now(); dead = false;
      if (!j.same) { ver = j.v; S = j; serverNow = j.vm.now; S.vm.match.publicUrl = `${location.origin}/m/${S.vm.match.id}`; render(); ingest(j.events, j.latestSeq); }
      else if (S && progShown && S.program.until && serverNow >= S.program.until) renderProgram(); }
    else wait = 2500;
  } catch { wait = 2500; } // keep showing last known state, no error UI
  setTimeout(poll, wait);
}
poll();
