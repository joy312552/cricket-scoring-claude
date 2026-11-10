// Branded match-summary picture (1080x1350, ideal for Instagram/Facebook/WhatsApp). Pure canvas, no libraries.
const W = 1080, H = 1350, LIME = '#d3ff3a', CHALK = '#f1eee3';
const F = (w, s, fam = 'Big Shoulders Display') => `${w} ${s}px "${fam}", "Arial Narrow", Arial, "Noto Sans Bengali", sans-serif`;

export function drawSummary(ctx, vm, o = {}) {
  const host = o.host || 'crease.live', imgs = o.imgs || {};
  const txt = (t, x, y, { s = 32, w = 800, c = '#fff', a = 'left', fam, max } = {}) => {
    t = String(t ?? ''); let size = s; ctx.font = F(w, size, fam); ctx.fillStyle = c; ctx.textAlign = a; ctx.textBaseline = 'alphabetic';
    if (max) while (ctx.measureText(t).width > max && size > 12) { size -= 2; ctx.font = F(w, size, fam); }
    ctx.fillText(t, x, y);
  };
  const rect = (x, y, w, h, c) => { ctx.fillStyle = c; ctx.fillRect(x, y, w, h); };
  const notch = (x, y, w, h, n, c) => { ctx.beginPath(); ctx.moveTo(x, y); ctx.lineTo(x + w - n, y); ctx.lineTo(x + w, y + n); ctx.lineTo(x + w, y + h); ctx.lineTo(x + n, y + h); ctx.lineTo(x, y + h - n); ctx.closePath(); ctx.fillStyle = c; ctx.fill(); };
  const shield = (cx, y, w, h) => { const x = cx - w / 2; ctx.beginPath(); ctx.moveTo(cx, y); ctx.lineTo(x + w, y + h * .12); ctx.lineTo(x + w, y + h * .64); ctx.lineTo(cx, y + h); ctx.lineTo(x, y + h * .64); ctx.lineTo(x, y + h * .12); ctx.closePath(); };

  // ---- background ----
  rect(0, 0, W, H, '#0b0f0d');
  const g = ctx.createRadialGradient(540, -120, 40, 540, -120, 1150); g.addColorStop(0, '#217a42'); g.addColorStop(.45, '#0f2a1a'); g.addColorStop(1, '#0b0f0d'); ctx.fillStyle = g; ctx.fillRect(0, 0, W, H);
  for (let i = 0; i < 9; i++) rect(i * 130, 0, 65, H, 'rgba(255,255,255,0.018)');
  ctx.strokeStyle = 'rgba(241,238,227,0.14)'; ctx.lineWidth = 4; ctx.beginPath(); ctx.moveTo(0, 1210); ctx.lineTo(W, 1210); ctx.moveTo(0, 1222); ctx.lineTo(W, 1222); ctx.stroke();

  // ---- brand header ----
  for (let i = 0; i < 3; i++) rect(60 + i * 22, 52, 9, 62, LIME); rect(54, 52, 70, 7, CHALK);
  txt('CREASE', 146, 108, { s: 74, w: 900, c: CHALK });
  txt((vm.match.tournament || 'MATCH CENTRE').toUpperCase(), W - 60, 84, { s: 30, w: 700, c: LIME, a: 'right', fam: 'Familjen Grotesk', max: 520 });
  txt(`${vm.match.format || ''}${vm.match.number ? '  ·  MATCH ' + vm.match.number : ''}`.toUpperCase(), W - 60, 116, { s: 24, w: 500, c: 'rgba(241,238,227,.7)', a: 'right', fam: 'DM Mono' });
  txt('MATCH SUMMARY', 60, 186, { s: 30, w: 700, c: LIME, fam: 'DM Mono' }); rect(300, 175, W - 360, 3, 'rgba(211,255,58,.5)');

  // ---- result banner ----
  const res = vm.result && vm.result.text ? vm.result.text : (vm.match.status === 'live' ? 'MATCH IN PROGRESS' : vm.match.toss || 'MATCH SUMMARY');
  notch(60, 214, W - 120, 110, 24, LIME); txt(res.toUpperCase(), W / 2, 288, { s: 70, w: 900, c: '#0b0f0d', a: 'center', max: W - 180 });

  // ---- teams ----
  const cards = vm.cards || [];
  ['A', 'B'].forEach((sd, i) => {
    const t = vm.teams[sd], c = cards.find(x => x.side === sd), cx = i === 0 ? 300 : 780;
    shield(cx, 366, 120, 138); ctx.fillStyle = t.color || '#1b6b3a'; ctx.fill();
    if (imgs[sd]) { ctx.save(); shield(cx, 366, 120, 138); ctx.clip(); ctx.drawImage(imgs[sd], cx - 60, 366, 120, 138); ctx.restore(); }
    else txt((t.short || '').slice(0, 3), cx, 450, { s: 54, w: 900, c: t.color2 || '#fff', a: 'center' });
    txt(t.name, cx, 552, { s: 40, w: 800, c: CHALK, a: 'center', max: 440 });
    txt(c ? `${c.runs}/${c.wkts}` : '-', cx, 668, { s: 128, w: 900, c: '#fff', a: 'center' });
    txt(c ? `${c.overs} OVERS` : 'YET TO BAT', cx, 712, { s: 26, w: 500, c: 'rgba(241,238,227,.7)', a: 'center', fam: 'DM Mono' });
  });
  txt('VS', W / 2, 450, { s: 44, w: 900, c: 'rgba(241,238,227,.35)', a: 'center' }); rect(W / 2 - 1, 520, 2, 220, 'rgba(241,238,227,.15)');

  // ---- performers ----
  cards.slice(0, 2).forEach((c, i) => {
    const x = i === 0 ? 60 : 560, w = 460; let y = 776;
    notch(x, y - 38, w, 48, 12, 'rgba(255,255,255,.07)'); txt(`${c.team}  BATTING`, x + 16, y - 4, { s: 30, w: 800, c: LIME });
    y += 30; c.bat.slice().sort((a, b) => b.runs - a.runs).slice(0, 3).forEach(b => { txt(b.name, x + 6, y + 30, { s: 30, w: 700, c: CHALK, fam: 'Familjen Grotesk', max: 290 }); txt(`${b.runs}${b.isOut ? '' : '*'}`, x + w - 110, y + 32, { s: 40, w: 900, c: '#fff', a: 'right' }); txt(`(${b.balls})`, x + w - 4, y + 30, { s: 26, w: 500, c: 'rgba(241,238,227,.65)', a: 'right', fam: 'DM Mono' }); y += 58; });
    y += 22; notch(x, y - 36, w, 44, 12, 'rgba(255,255,255,.07)'); txt(`${c.bowlTeam}  BOWLING`, x + 16, y - 4, { s: 28, w: 800, c: '#ffb347' });
    y += 30; c.bowl.slice().sort((a, b) => b.w - a.w || a.r - b.r).slice(0, 2).forEach(b => { txt(b.name, x + 6, y + 30, { s: 30, w: 700, c: CHALK, fam: 'Familjen Grotesk', max: 270 }); txt(`${b.w}/${b.r}`, x + w - 110, y + 32, { s: 40, w: 900, c: '#fff', a: 'right' }); txt(`(${b.o})`, x + w - 4, y + 30, { s: 26, w: 500, c: 'rgba(241,238,227,.65)', a: 'right', fam: 'DM Mono' }); y += 58; });
  });

  // ---- player of the match ----
  if (vm.potm && vm.potm.name) { notch(60, 1090, W - 120, 92, 18, '#d8b45f'); txt('PLAYER OF THE MATCH', 90, 1128, { s: 24, w: 600, c: '#3a2a05', fam: 'DM Mono' }); txt(vm.potm.name.toUpperCase(), 90, 1170, { s: 52, w: 900, c: '#0b0f0d', max: 560 }); if (vm.potm.line) txt(vm.potm.line, W - 90, 1160, { s: 30, w: 700, c: '#3a2a05', a: 'right', fam: 'Familjen Grotesk', max: 340 }); }
  else if (vm.match.venue) txt(vm.match.venue, W / 2, 1150, { s: 30, w: 600, c: 'rgba(241,238,227,.7)', a: 'center', fam: 'Familjen Grotesk', max: W - 140 });

  // ---- footer branding ----
  txt('SCORED LIVE ON CREASE', 60, 1286, { s: 36, w: 900, c: LIME });
  txt('Ball-by-ball scoring · TV-style overlays', 60, 1322, { s: 24, w: 500, c: 'rgba(241,238,227,.7)', fam: 'Familjen Grotesk' });
  txt(host, W - 60, 1306, { s: 34, w: 700, c: CHALK, a: 'right', fam: 'DM Mono', max: 480 });
}

const loadImg = (src) => new Promise((res) => { if (!src) return res(null); const i = new Image(); i.onload = () => res(i); i.onerror = () => res(null); i.src = src; });
export async function summaryCanvas(vm, host = location.host) {
  try { await Promise.all([document.fonts.load(F(900, 60)), document.fonts.load(F(700, 30, 'Familjen Grotesk')), document.fonts.load(F(500, 24, 'DM Mono'))]); } catch {}
  const imgs = { A: await loadImg(vm.teams.A.logo), B: await loadImg(vm.teams.B.logo) };
  const c = document.createElement('canvas'); c.width = W; c.height = H; drawSummary(c.getContext('2d'), vm, { host, imgs }); return c;
}
export const summaryBlob = async (vm) => { const c = await summaryCanvas(vm); return new Promise((res) => c.toBlob(res, 'image/png')); };
export async function downloadSummary(vm, name = 'match-summary') {
  const b = await summaryBlob(vm), u = URL.createObjectURL(b), a = document.createElement('a'); a.href = u; a.download = `${name}.png`; document.body.append(a); a.click(); a.remove(); setTimeout(() => URL.revokeObjectURL(u), 3000);
}
export async function shareSummary(vm, url, name = 'match-summary') {
  const b = await summaryBlob(vm), f = new File([b], `${name}.png`, { type: 'image/png' }), text = `${vm.result?.text || vm.match.name} | ${vm.teams.A.short} vs ${vm.teams.B.short}`;
  if (navigator.canShare && navigator.canShare({ files: [f] })) { await navigator.share({ files: [f], title: vm.match.name, text: `${text}\n${url}` }); return 'shared'; }
  await downloadSummary(vm, name); return 'downloaded';
}
