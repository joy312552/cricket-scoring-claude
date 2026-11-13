// Broadcast sound design, synthesized with WebAudio (no audio files): layered whooshes, impacts, crowd swells, brass stabs.
let AC, MASTER, REV;
function ctx() {
  if (!AC) {
    AC = new (window.AudioContext || window.webkitAudioContext)();
    const comp = AC.createDynamicsCompressor(); comp.threshold.value = -16; comp.knee.value = 20; comp.ratio.value = 5; comp.attack.value = 0.004; comp.release.value = 0.22;
    const out = AC.createGain(); out.gain.value = 0.9; comp.connect(out); out.connect(AC.destination); MASTER = comp;
    const n = Math.floor(AC.sampleRate * 1.8), ir = AC.createBuffer(2, n, AC.sampleRate);
    for (let c = 0; c < 2; c++) { const d = ir.getChannelData(c); for (let i = 0; i < n; i++) d[i] = (Math.random() * 2 - 1) * Math.pow(1 - i / n, 3); }
    REV = AC.createConvolver(); REV.buffer = ir; const rg = AC.createGain(); rg.gain.value = 0.28; REV.connect(rg); rg.connect(MASTER);
  }
  if (AC.state === 'suspended') AC.resume(); return AC;
}
const cache = {};
function noise(c, sec, pink = true) { const k = sec + (pink ? 'p' : 'w'); if (cache[k]) return cache[k]; const n = Math.floor(c.sampleRate * sec), b = c.createBuffer(1, n, c.sampleRate), d = b.getChannelData(0);
  let b0 = 0, b1 = 0, b2 = 0; for (let i = 0; i < n; i++) { const w = Math.random() * 2 - 1; if (pink) { b0 = 0.99765 * b0 + w * 0.099046; b1 = 0.963 * b1 + w * 0.2965164; b2 = 0.57 * b2 + w * 1.0526913; d[i] = (b0 + b1 + b2 + w * 0.1848) * 0.25; } else d[i] = w; } return (cache[k] = b); }
const wire = (node, wet = 0.3) => { node.connect(MASTER); const w = AC.createGain(); w.gain.value = wet; node.connect(w); w.connect(REV); };
const env = (g, t, a, peak, d) => { g.gain.setValueAtTime(0.0001, t); g.gain.exponentialRampToValueAtTime(peak, t + a); g.gain.exponentialRampToValueAtTime(0.0001, t + a + d); };

function swoosh(t, { up = true, dur = 0.5, peak = 0.34, lo = 260, hi = 4200 } = {}) {
  const c = AC, s = c.createBufferSource(); s.buffer = noise(c, 1.2); const bp = c.createBiquadFilter(); bp.type = 'bandpass'; bp.Q.value = 0.8;
  bp.frequency.setValueAtTime(up ? lo : hi, t); bp.frequency.exponentialRampToValueAtTime(up ? hi : lo, t + dur * 0.92);
  const lp = c.createBiquadFilter(); lp.type = 'lowpass'; lp.frequency.value = 7000; const g = c.createGain(); env(g, t, dur * (up ? 0.7 : 0.3), peak, dur * (up ? 0.3 : 0.7));
  s.connect(bp); bp.connect(lp); lp.connect(g); wire(g, 0.35); s.start(t, Math.random() * 0.4, dur + 0.1);
  const b = c.createBufferSource(); b.buffer = noise(c, 1.2); const l2 = c.createBiquadFilter(); l2.type = 'lowpass'; l2.frequency.setValueAtTime(up ? 120 : 900, t); l2.frequency.exponentialRampToValueAtTime(up ? 900 : 120, t + dur);
  const g2 = c.createGain(); env(g2, t, dur * (up ? 0.75 : 0.25), peak * 0.9, dur * (up ? 0.25 : 0.75)); b.connect(l2); l2.connect(g2); wire(g2, 0.2); b.start(t, 0.3, dur + 0.1);
}
function thump(t, { f0 = 150, f1 = 42, dur = 0.32, peak = 0.55 } = {}) {
  const c = AC, o = c.createOscillator(), g = c.createGain(); o.type = 'sine'; o.frequency.setValueAtTime(f0, t); o.frequency.exponentialRampToValueAtTime(f1, t + dur * 0.8); env(g, t, 0.004, peak, dur); o.connect(g); wire(g, 0.25); o.start(t); o.stop(t + dur + 0.05);
  click(t, { f: 1800, peak: peak * 0.5 });
}
function click(t, { f = 3200, peak = 0.14 } = {}) { const c = AC, s = c.createBufferSource(); s.buffer = noise(c, 0.2, false); const hp = c.createBiquadFilter(); hp.type = 'highpass'; hp.frequency.value = f; const g = c.createGain(); env(g, t, 0.001, peak, 0.03); s.connect(hp); hp.connect(g); wire(g, 0.15); s.start(t, 0, 0.06); }
function tone(t, f, { dur = 0.3, type = 'triangle', peak = 0.14, lp = 5000, wet = 0.35 } = {}) {
  const c = AC, o = c.createOscillator(), g = c.createGain(), l = c.createBiquadFilter(); o.type = type; o.frequency.value = f; l.type = 'lowpass'; l.frequency.value = lp; env(g, t, 0.012, peak, dur); o.connect(l); l.connect(g); wire(g, wet); o.start(t); o.stop(t + dur + 0.1);
}
function brass(t, notes, { peak = 0.12, dur = 0.7 } = {}) {
  const c = AC; notes.forEach((f, i) => [-6, 0, 7].forEach((det) => { const o = c.createOscillator(), g = c.createGain(), l = c.createBiquadFilter(); o.type = 'sawtooth'; o.frequency.value = f; o.detune.value = det; l.type = 'lowpass'; l.Q.value = 2;
    const st = t + i * 0.09; l.frequency.setValueAtTime(500, st); l.frequency.exponentialRampToValueAtTime(3200, st + 0.18); l.frequency.exponentialRampToValueAtTime(1200, st + dur);
    env(g, st, 0.05, peak / 3, dur); o.connect(l); l.connect(g); wire(g, 0.4); o.start(st); o.stop(st + dur + 0.1); })); }
function crowd(t, { dur = 2, peak = 0.3, claps = 22 } = {}) {
  const c = AC, s = c.createBufferSource(); s.buffer = noise(c, 3); const bp = c.createBiquadFilter(); bp.type = 'bandpass'; bp.frequency.value = 1100; bp.Q.value = 0.55; const g = c.createGain();
  g.gain.setValueAtTime(0.0001, t); g.gain.exponentialRampToValueAtTime(peak, t + dur * 0.22); g.gain.setValueAtTime(peak, t + dur * 0.55); g.gain.exponentialRampToValueAtTime(0.0001, t + dur); s.connect(bp); bp.connect(g); wire(g, 0.5); s.start(t, 0, dur + 0.1);
  for (let i = 0; i < claps; i++) { const ct = t + 0.1 + Math.random() * (dur * 0.85); const n = c.createBufferSource(); n.buffer = noise(c, 0.2, false); const hp = c.createBiquadFilter(); hp.type = 'bandpass'; hp.frequency.value = 1800 + Math.random() * 1400; hp.Q.value = 1.2; const cg = c.createGain(); env(cg, ct, 0.002, peak * 0.45, 0.05); n.connect(hp); hp.connect(cg); wire(cg, 0.4); n.start(ct, 0, 0.1); }
}
function roll(t, dur = 0.9) { for (let i = 0, x = 0; x < dur; i++) { click(t + x, { f: 900, peak: 0.1 + x / dur * 0.12 }); thump(t + x, { f0: 220, f1: 110, dur: 0.1, peak: 0.12 + x / dur * 0.1 }); x += 0.14 * Math.pow(0.9, i); } }

export function sfx(kind) {
  try {
    const c = ctx(), t = c.currentTime + 0.02;
    switch (kind) {
      case 'in': click(t); swoosh(t, { up: true, dur: 0.5 }); thump(t + 0.4, { peak: 0.3, f0: 120 }); tone(t + 0.42, 1568, { dur: 0.35, peak: 0.05, type: 'sine' }); break;
      case 'out': click(t); swoosh(t, { up: false, dur: 0.45, peak: 0.3 }); break;
      case 'swap': swoosh(t, { up: true, dur: 0.3, peak: 0.22, lo: 500, hi: 3200 }); click(t + 0.24, { f: 2600, peak: 0.12 }); tone(t + 0.26, 1175, { dur: 0.18, peak: 0.06, type: 'sine' }); break;
      case 'four': thump(t, { peak: 0.5 }); click(t, { f: 1500, peak: 0.35 }); crowd(t + 0.05, { dur: 2.0, peak: 0.26 }); tone(t + 0.12, 659, { dur: 0.3, peak: 0.12 }); tone(t + 0.22, 880, { dur: 0.4, peak: 0.13 }); break;
      case 'six': thump(t, { f0: 90, peak: 0.7, dur: 0.5 }); click(t, { f: 1200, peak: 0.4 }); crowd(t + 0.05, { dur: 3.0, peak: 0.34, claps: 34 }); brass(t + 0.12, [392, 523, 659], { peak: 0.14 }); break;
      case 'wicket': click(t, { f: 2200, peak: 0.45 }); click(t + 0.05, { f: 1600, peak: 0.3 }); thump(t, { f0: 90, f1: 32, dur: 0.7, peak: 0.75 }); tone(t + 0.1, 220, { dur: 0.7, type: 'sawtooth', peak: 0.1, lp: 900 }); tone(t + 0.35, 147, { dur: 0.9, type: 'sawtooth', peak: 0.1, lp: 700 }); crowd(t + 0.1, { dur: 1.4, peak: 0.16, claps: 0 }); break;
      case 'noball': [0, 0.28].forEach(o => { tone(t + o, 880, { dur: 0.2, type: 'square', peak: 0.07, lp: 2200 }); tone(t + o + 0.12, 660, { dur: 0.2, type: 'square', peak: 0.07, lp: 2200 }); }); break;
      case 'wide': tone(t, 440, { dur: 0.35, type: 'square', peak: 0.06, lp: 1800 }); break;
      case 'fifty': crowd(t, { dur: 2.2, peak: 0.26, claps: 30 }); [523, 659, 784, 1047].forEach((f, i) => tone(t + 0.1 + i * 0.1, f, { dur: 0.6, peak: 0.1 })); break;
      case 'century': crowd(t, { dur: 3.6, peak: 0.34, claps: 48 }); brass(t + 0.05, [392, 494, 587, 784], { peak: 0.16, dur: 1.2 }); thump(t, { f0: 100, peak: 0.55 }); break;
      case 'hattrick': roll(t, 0.9); thump(t + 0.95, { f0: 110, peak: 0.6, dur: 0.5 }); brass(t + 0.95, [330, 440, 554], { peak: 0.15 }); crowd(t + 1, { dur: 2, peak: 0.25 }); break;
      case 'maiden': tone(t, 784, { dur: 0.5, peak: 0.1 }); tone(t + 0.14, 1047, { dur: 0.6, peak: 0.1 }); break;
      default: break;
    }
  } catch { /* audio is optional */ }
}
