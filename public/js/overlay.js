// Browser-source overlay runtime. Read-only: renders server state, plays each celebration once.
import { panel, fx, slotOf } from './themes.js';
import { subscribe } from './rt.js';
const parts = location.pathname.split('/').filter(Boolean); // o, token, panel (legacy path form)
const q = new URLSearchParams(location.search);
const token = q.get('t') || parts[1], PANEL = (q.get('p') || parts[2] || 'all').toLowerCase();
if (q.get('bg') === 'checker') document.body.classList.add('checker');
const ALIAS = { fullscreen: 'all', ticker: 'scoreboard', info: 'custom', matchinfo: 'custom', player: 'batterCard', lineup: 'lineupA', lineupa: 'lineupA', lineupb: 'lineupB', batterCard: 'batterCard', bowlerCard: 'bowlerCard', celebrations: 'celebrations', scoreboard: 'scoreboard', all: 'all' };
const stage = document.querySelector('.stage'), tick = document.querySelector('.tick'), gfx = document.querySelector('.gfx'), lower = document.querySelector('.lowerslot'), fxl = document.querySelector('.fxl');
const PANEL_KEY = ALIAS[PANEL] || ALIAS[PANEL.toLowerCase()] || PANEL;
let S = null, ver = null, lastSeq = null, serverNow = Date.now(), tickShown = false, lastInl = '', booting = true, dead = false;

// ---------- layout ----------
function applyScale() {
  const st = S?.settings || {}, user = parseFloat(q.get('scale')) || st.scale || 1, safe = q.get('safe') ?? st.safe ?? 40;
  const s = Math.min(innerWidth / 1920, innerHeight / 1080) * user;
  stage.style.transform = `translate(${(innerWidth - 1920 * s) / 2}px,${(innerHeight - 1080 * s) / 2}px) scale(${s})`;
  stage.style.setProperty('--safe', safe + 'px'); stage.classList.toggle('tier-c', innerWidth < 1100);
}
addEventListener('resize', applyScale);
const theme = () => q.get('theme') || S?.settings?.theme || 'arena';
function setTheme() { const pos = (q.get('pos') || S?.settings?.position) === 'top'; stage.className = `stage ${theme()} ${pos ? 'pos-top' : ''} ${stage.classList.contains('tier-c') ? 'tier-c' : ''}`; }
const alive = (sl) => sl && sl.g && (!sl.until || serverNow < sl.until);

// ---------- sound design: soft whoosh + tonal blip that matches each graphic transition ----------
let AC; const ac = () => (AC ||= new (window.AudioContext || window.webkitAudioContext)());
function whoosh(up) {
  try {
    const c = ac(), t = c.currentTime, len = 0.46, buf = c.createBuffer(1, Math.floor(c.sampleRate * len), c.sampleRate), d = buf.getChannelData(0);
    for (let i = 0; i < d.length; i++) d[i] = (Math.random() * 2 - 1) * (1 - i / d.length);
    const src = c.createBufferSource(); src.buffer = buf; const bp = c.createBiquadFilter(); bp.type = 'bandpass'; bp.Q.value = 1.1;
    bp.frequency.setValueAtTime(up ? 300 : 3200, t); bp.frequency.exponentialRampToValueAtTime(up ? 3200 : 300, t + len * 0.9);
    const g = c.createGain(); g.gain.setValueAtTime(0.0001, t); g.gain.exponentialRampToValueAtTime(0.2, t + 0.08); g.gain.exponentialRampToValueAtTime(0.0001, t + len);
    src.connect(bp); bp.connect(g); g.connect(c.destination); src.start(t);
    const o = c.createOscillator(), og = c.createGain(); o.type = 'sine'; o.frequency.setValueAtTime(up ? 660 : 990, t + 0.05); o.frequency.exponentialRampToValueAtTime(up ? 1320 : 495, t + 0.28);
    og.gain.setValueAtTime(0.0001, t + 0.05); og.gain.exponentialRampToValueAtTime(0.09, t + 0.1); og.gain.exponentialRampToValueAtTime(0.0001, t + 0.34); o.connect(og); og.connect(c.destination); o.start(t + 0.05); o.stop(t + 0.36);
  } catch {}
}
function blips(freqs, dur = 0.07, vol = 0.12, type = 'triangle') {
  try { const c = ac(); freqs.forEach((f, i) => { const o = c.createOscillator(), g = c.createGain(), t = c.currentTime + i * dur; o.type = type; o.frequency.value = f; o.connect(g); g.connect(c.destination);
    g.gain.setValueAtTime(0.0001, t); g.gain.exponentialRampToValueAtTime(vol, t + 0.015); g.gain.exponentialRampToValueAtTime(0.0001, t + dur * 1.8); o.start(t); o.stop(t + dur * 1.9); }); } catch {}
}
const SND = { four: [523, 659, 784], six: [523, 659, 784, 1046, 1318], wicket: [196, 147, 110], fifty: [523, 784, 1046], century: [523, 659, 784, 1046, 1318], hattrick: [392, 523, 659, 784], noball: [330, 330], wide: [440], maiden: [392, 523] };
function sfx(kind) {
  if (booting || !S?.settings?.sound) return;
  if (kind === 'in') whoosh(true); else if (kind === 'out') whoosh(false); else if (kind === 'swap') blips([880, 1175], 0.06, 0.1);
  else if (SND[kind]) blips(SND[kind], kind === 'wicket' ? 0.14 : 0.09, 0.14, kind === 'wicket' ? 'sawtooth' : 'triangle');
}

// ---------- scoreboard bar (always on) with inline sections ----------
function inlineKey() {
  if (PANEL_KEY === 'all' || PANEL_KEY === 'scoreboard') return alive(S.slots?.inline) ? S.slots.inline.g : '';
  return slotOf(PANEL_KEY) === 'inline' ? PANEL_KEY : '';
}
function renderTicker() {
  const barPanel = ['all', 'scoreboard'].includes(PANEL_KEY) || slotOf(PANEL_KEY) === 'inline';
  const want = barPanel && (PANEL_KEY !== 'all' || S.settings.ticker !== false);
  if (!want) { tick.innerHTML = ''; tickShown = false; return; }
  const inl = inlineKey(), changed = inl !== lastInl, swap = changed ? (inl ? true : 'back') : false;
  tick.innerHTML = `<div>${panel(theme(), 'scoreboard', S.vm, { inl, swap })}</div>`;
  if (!tickShown) { tick.firstElementChild.firstElementChild?.classList.add('in'); tickShown = true; sfx('in'); }
  else if (changed) sfx('swap');
  lastInl = inl;
}

// ---------- lower third + full panel slots with professional in/out transitions ----------
const SL = { lower: { el: lower, sig: '', shown: false, busy: false, timer: 0 }, full: { el: gfx, sig: '', shown: false, busy: false, timer: 0 } };
function renderSlot(name) {
  const st = SL[name], sl = S.slots?.[name]; clearTimeout(st.timer);
  let key = null, params = {}, on = alive(sl);
  if (on) { key = sl.g; params = sl.params || {}; }
  if (!['all', 'celebrations', 'scoreboard'].includes(PANEL_KEY) && slotOf(PANEL_KEY) === name) { key = PANEL_KEY; params = {}; on = true; } // dedicated single-panel URL: always on
  else if (PANEL_KEY !== 'all') { on = false; }
  const root = () => st.el.firstElementChild;
  const html = () => panel(theme(), key, S.vm, params);
  if (!on) { if (st.shown && root()) { const r = root(); r.classList.remove('in'); r.classList.add('out'); sfx('out'); st.shown = false; st.sig = ''; setTimeout(() => { if (!st.shown) st.el.innerHTML = ''; }, 520); } return; }
  const sig = `${sl ? sl.id : 0}:${key}:${JSON.stringify(params)}`;
  if (sig !== st.sig) {
    const show = () => { st.sig = sig; st.shown = true; st.busy = false; st.el.innerHTML = html(); root()?.classList.add('in'); sfx('in'); };
    if (st.shown && root()) { st.busy = true; const r = root(); r.classList.remove('in'); r.classList.add('out'); setTimeout(show, 380); } else show();
  } else if (!st.busy) st.el.innerHTML = html(); // data refresh: no re-animation
  if (sl && sl.until) st.timer = setTimeout(() => S && renderSlot(name), Math.max(50, sl.until - serverNow + 30));
}

// ---------- celebrations: queue, one at a time, played inside the scoreboard bar ----------
const queue = []; let playing = false;
async function pump() {
  if (playing) return; playing = true;
  while (queue.length) {
    const e = queue.shift(), d = S.settings.duration || 3200; fxl.innerHTML = fx(theme(), e.fx, e.payload || {}, S.vm);
    const el = fxl.firstElementChild; if (!el) continue; el.style.setProperty('--d', d + 'ms'); sfx(e.fx);
    await new Promise(r => { el._done = r; setTimeout(r, d); }); fxl.innerHTML = '';
  }
  playing = false;
}
function ingest(events, latest) {
  if (PANEL_KEY === 'scoreboard' || (PANEL_KEY !== 'all' && PANEL_KEY !== 'celebrations')) { lastSeq = latest; return; }
  if (lastSeq === null) { lastSeq = latest; return; } // first load / refresh: never replay history
  for (const e of events) {
    if (e.seq <= lastSeq) continue;
    if (e.fx === 'clear') { queue.length = 0; fxl.querySelector('.fx')?._done?.(); continue; }
    if (serverNow - e.ts > 12000) continue; // stale after a long disconnect: do not surprise the audience
    queue.push(e);
  }
  lastSeq = Math.max(lastSeq, latest); pump();
}
addEventListener('message', (ev) => { // dashboard monitor only: manual test of a celebration
  if (ev.origin !== location.origin || !S || ev.data?.type !== 'play') return;
  const b = S.vm.batters[0]; queue.push({ fx: ev.data.fx, payload: { batterName: b?.name || 'Batter Name', stat: b ? { runs: b.runs, balls: b.balls } : { runs: 52, balls: 31 }, runs: S.vm.score?.runs, wickets: S.vm.score?.wkts, team: S.vm.teams[S.vm.bat || 'A'].short, kind: 'bowled', bowlerName: S.vm.bowler?.name || 'Bowler' } }); pump();
});

function render() { setTheme(); applyScale(); S.vm.custom = S.settings.custom || {}; renderTicker(); renderSlot('lower'); renderSlot('full'); }
let timerId = 0, fetching = false, again = false, rtSub = null;
const schedule = (ms) => { clearTimeout(timerId); timerId = setTimeout(poll, ms); };
async function poll() {
  if (fetching) { again = true; return; } fetching = true; again = false; let wait = 900;
  try {
    const r = await fetch(`/api/overlay/${encodeURIComponent(token)}?since=${ver ?? ''}&panel=${encodeURIComponent(PANEL_KEY)}`, { cache: 'no-store' });
    if (r.status === 404) { dead = true; S = null; tick.innerHTML = ''; gfx.innerHTML = ''; lower.innerHTML = ''; fxl.innerHTML = ''; wait = 5000; }
    else if (r.ok) { const j = await r.json(); serverNow = j.now || Date.now(); dead = false;
      if (!j.same) { ver = j.v; S = j; serverNow = j.vm.now; S.vm.match.publicUrl = `${location.origin}/m/?id=${S.vm.match.id}`; render(); ingest(j.events, j.latestSeq); booting = false;
        if (j.rt && !rtSub) rtSub = subscribe(j.rt, (p) => { if (p && p.v !== undefined && ver !== null && p.v <= ver) return; schedule(0); }); }
      else if (S && (S.slots?.lower?.until || S.slots?.full?.until || S.slots?.inline?.until)) render(); // expire timed graphics
      wait = rtSub && rtSub.connected() ? 3000 : 900; }
    else wait = 2500;
  } catch { wait = 2500; } // keep showing last known state, no error UI
  fetching = false; schedule(again ? 0 : wait);
}
poll();
