// Branded match-summary picture (1080x1350, ideal for Instagram/Facebook/WhatsApp). Pure canvas, no libraries.
const W = 1080, H = 1350, LIME = '#d3ff3a', CHALK = '#f1eee3';
const F = (w, s, fam = 'Big Shoulders Display') => `${w} ${s}px "${fam}", "Arial Narrow", Arial, "Noto Sans Bengali", sans-serif`;

export function drawSummary(ctx, vm, o = {}) {
  const host = o.host || 'crease.live', imgs = o.imgs || {}, PU = '#2c1558', PU2 = '#7134ea', DK = '#1b0c3d', CY = '#18cde8', YE = '#ffc90f';
  const txt = (t, x, y, { s = 32, w = 800, c = '#fff', a = 'left', fam, max } = {}) => {
    t = String(t ?? ''); let size = s; ctx.font = F(w, size, fam); ctx.fillStyle = c; ctx.textAlign = a; ctx.textBaseline = 'alphabetic';
    if (max) while (ctx.measureText(t).width > max && size > 12) { size -= 2; ctx.font = F(w, size, fam); }
    ctx.fillText(t, x, y);
  };
  const rect = (x, y, w, h, c) => { ctx.fillStyle = c; ctx.fillRect(x, y, w, h); };
  const shield = (cx, y, w, h) => { const x = cx - w / 2; ctx.beginPath(); ctx.moveTo(cx, y); ctx.lineTo(x + w, y + h * .12); ctx.lineTo(x + w, y + h * .64); ctx.lineTo(cx, y + h); ctx.lineTo(x, y + h * .64); ctx.lineTo(x, y + h * .12); ctx.closePath(); };
  const blob = (cx, cy, rx, ry, rot, c) => { ctx.save(); ctx.translate(cx, cy); ctx.rotate(rot); ctx.beginPath(); ctx.ellipse(0, 0, rx, ry, 0, 0, Math.PI * 2); ctx.fillStyle = c; ctx.fill(); ctx.restore(); };

  // ---- stadium-style backdrop ----
  const sky = ctx.createLinearGradient(0, 0, 0, 760); sky.addColorStop(0, '#1d57c4'); sky.addColorStop(1, '#8fc3ff'); ctx.fillStyle = sky; ctx.fillRect(0, 0, W, 760);
  const grass = ctx.createLinearGradient(0, 700, 0, H); grass.addColorStop(0, '#2f9e44'); grass.addColorStop(1, '#1b6b2c'); ctx.fillStyle = grass; ctx.fillRect(0, 700, W, H - 700);
  for (let i = 0; i < 12; i++) rect(i * 90, 700, 45, H - 700, 'rgba(255,255,255,0.06)');
  rect(0, 560, W, 150, 'rgba(14,25,60,.55)'); for (let i = 0; i < 24; i++) rect(i * 46, 600 + (i % 3) * 14, 30, 8, 'rgba(255,255,255,.10)');
  rect(0, 0, W, H, 'rgba(15,10,40,.28)');
  blob(-40, 420, 200, 620, 0.35, PU2); blob(W + 30, 520, 190, 680, -0.3, PU2);

  // ---- brand header ----
  for (let i = 0; i < 3; i++) rect(60 + i * 22, 42, 9, 56, LIME); rect(54, 42, 70, 7, CHALK);
  txt('CREASE', 146, 94, { s: 68, w: 900, c: '#fff' });
  txt((vm.match.tournament || 'MATCH CENTRE').toUpperCase(), W - 60, 78, { s: 28, w: 700, c: '#fff16a', a: 'right', fam: 'Familjen Grotesk', max: 520 });

  // ---- main purple panel ----
  const PX = 50, PW = W - 100; rect(PX, 124, PW, 1040, PU);
  txt('MATCH SUMMARY', PX + 36, 196, { s: 66, w: 900, c: '#fff' });
  rect(PX, 214, PW, 50, PU2); txt(`${vm.match.tournament || vm.match.name}${vm.match.number ? ' | MATCH NO.' + vm.match.number : ''}`.toUpperCase(), PX + 36, 250, { s: 27, w: 700, c: '#fff16a', fam: 'Familjen Grotesk', max: PW - 72 });
  const cards = vm.cards || []; let y = 276;
  const rows = (arr, x, w, col, isBat) => { for (let i = 0; i < 3; i++) { const r = arr[i], ry = y + i * 56; rect(x, ry, w, 54, 'rgba(255,255,255,.04)');
    if (r) { rect(x, ry, w - 170, 54, col); txt(r.name.toUpperCase(), x + 14, ry + 38, { s: 28, w: 800, c: '#101010', fam: 'Familjen Grotesk', max: w - 200 }); rect(x + w - 170, ry, 170, 54, DK);
      txt(isBat ? `${r.runs}${r.isOut ? '' : '*'}` : `${r.w}-${r.r}`, x + w - 98, ry + 39, { s: 32, w: 900, c: '#fff', a: 'center' }); txt(isBat ? r.balls : r.o, x + w - 34, ry + 38, { s: 24, w: 700, c: 'rgba(255,255,255,.8)', a: 'center', fam: 'DM Mono' }); }
    rect(x, ry + 53, w, 1, 'rgba(255,255,255,.2)'); } };
  cards.slice(0, 2).forEach((c) => {
    const t = vm.teams[c.side], col = c.side === 'A' ? CY : YE; rect(PX, y, PW, 76, col);
    shield(PX + 58, y + 6, 54, 62); ctx.fillStyle = t.color || '#444'; ctx.fill();
    if (imgs[c.side]) { ctx.save(); shield(PX + 58, y + 6, 54, 62); ctx.clip(); ctx.drawImage(imgs[c.side], PX + 31, y + 6, 54, 62); ctx.restore(); } else txt((t.short || '').slice(0, 3), PX + 58, y + 50, { s: 24, w: 900, c: t.color2 || '#fff', a: 'center' });
    txt(c.teamName.toUpperCase(), PX + 108, y + 52, { s: 44, w: 900, c: '#101010', max: 470 }); txt(`OVERS ${c.overs}`, PX + PW - 250, y + 50, { s: 26, w: 500, c: '#101010', a: 'right', fam: 'DM Mono' }); txt(`${c.runs}-${c.wkts}`, PX + PW - 24, y + 56, { s: 62, w: 900, c: '#101010', a: 'right' });
    y += 80; const half = (PW - 12) / 2;
    rows(c.bat.slice().sort((a, b) => b.runs - a.runs).slice(0, 3), PX, half, col, true); rows(c.bowl.slice().sort((a, b) => b.w - a.w || a.r - b.r).slice(0, 3), PX + half + 12, half, col, false); y += 190;
  });
  const res = vm.result && vm.result.text ? vm.result.text : (vm.match.status === 'live' ? 'MATCH IN PROGRESS' : vm.match.toss || 'MATCH SUMMARY');
  rect(PX, y + 6, PW, 84, PU2); txt(res.toUpperCase(), W / 2, y + 62, { s: 46, w: 800, c: '#fff', a: 'center', max: PW - 60 });
  if (vm.potm && vm.potm.name) { rect(PX, y + 98, PW, 80, '#ffc90f'); txt('PLAYER OF THE MATCH', PX + 28, y + 128, { s: 20, w: 600, c: '#3a2a05', fam: 'DM Mono' }); txt(vm.potm.name.toUpperCase(), PX + 28, y + 164, { s: 40, w: 900, c: '#101010', max: 560 }); if (vm.potm.line) txt(vm.potm.line, PX + PW - 28, y + 156, { s: 28, w: 700, c: '#3a2a05', a: 'right', fam: 'Familjen Grotesk', max: 340 }); }

  // ---- footer branding ----
  rect(0, 1196, W, 154, 'rgba(10,6,28,.82)');
  for (let i = 0; i < 3; i++) rect(60 + i * 18, 1228, 8, 46, LIME); rect(55, 1228, 58, 6, CHALK);
  txt('SCORED LIVE ON CREASE', 140, 1268, { s: 44, w: 900, c: LIME });
  txt('Ball-by-ball scoring · TV-style overlays · live scorecards', 60, 1316, { s: 24, w: 500, c: 'rgba(241,238,227,.85)', fam: 'Familjen Grotesk' });
  txt(host, W - 60, 1316, { s: 32, w: 700, c: CHALK, a: 'right', fam: 'DM Mono', max: 480 });
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
