import { qrSvg } from './qr.js';
// Theme engine: pure functions (view-model in, HTML string out). No data fetching, no scoring logic.
export const THEMES = { arena: { key: 'arena', name: 'ARENA', tag: 'Premium international broadcast' }, pulse: { key: 'pulse', name: 'PULSE', tag: 'Modern dynamic sports tech' }, mohua: { key: 'mohua', name: 'MOHUA', tag: 'Royal purple, cyan and gold' } };
// Three independent slots, so game play stays visible:
//  inline = replaces the batting / bowling sections INSIDE the main scoreboard bar
//  lower  = compact lower-third strip above the scoreboard
//  full   = large centre panels (scorecards, tables, charts)
export const GROUPS = [
  { slot: 'inline', title: 'Scoreboard sections', note: 'Swap the batting / bowling area inside the main scoreboard', items: [['timeline', 'Timeline'], ['projected', 'Projected score'], ['target', 'Target / chase'], ['partnership', 'Partnership'], ['preview', 'Match preview'], ['toss', 'Toss result'], ['resultBar', 'Match result'], ['custom', 'Custom text']] },
  { slot: 'lower', title: 'Lower thirds', note: 'Compact strips above the scoreboard', items: [['batterCard', 'Batter card'], ['bowlerCard', 'Bowler card'], ['officials', 'Match officials'], ['drinks', 'Drinks break'], ['rain', 'Rain delay'], ['resume', 'Match resumption'], ['potm', 'Player of the Match'], ['champion', 'Tournament champions'], ['qr', 'QR: follow live']] },
  { slot: 'full', title: 'Full panels', note: 'Large panels in the centre of the screen', items: [['batting', 'Batting scorecard'], ['bowling', 'Bowling scorecard'], ['fow', 'Fall of wickets'], ['lineups', 'Both playing XIs'], ['lineupA', 'Playing XI: Team A'], ['lineupB', 'Playing XI: Team B'], ['inningsBreak', 'Innings break'], ['result', 'Result panel (centre)'], ['summary', 'Match summary'], ['points', 'Points table'], ['compareBar', 'Over comparison (bars)'], ['compareLine', 'Run progression (line)']] },
];
export const GRAPHIC_LIST = GROUPS.map(g => [g.title, g.items]).concat([['Sponsors', [['sponsor', 'Sponsor panel']]]]);
const INLINE = new Set(GROUPS[0].items.map(x => x[0])), LOWER = new Set([...GROUPS[1].items.map(x => x[0]), 'sponsor']);
export const slotOf = (k) => (INLINE.has(k) ? 'inline' : LOWER.has(k) ? 'lower' : 'full');
export const FX_LIST = [['four', 'FOUR'], ['six', 'SIX'], ['wicket', 'WICKET'], ['noball', 'NO BALL'], ['fifty', 'FIFTY'], ['century', 'HUNDRED'], ['hattrick', 'HAT-TRICK'], ['wide', 'WIDE'], ['maiden', 'MAIDEN']];

export const esc = (s) => String(s ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const crest = (t, s = 64) => `<i class="crest" style="--s:${s}px;--c:${esc(t.color)};--c2:${esc(t.color2)}">${t.logo ? `<img src="${esc(t.logo)}" alt="">` : `<b>${esc((t.short || '').slice(0, 3))}</b>`}</i>`;
const chip = (s) => { const c = s === 'W' ? 'w' : s === '4' ? 'f' : s === '6' ? 's' : /^(Wd|Nb)/.test(s) ? 'x' : s === '0' ? 'd' : ''; return `<u class="ball ${c}">${esc(s)}</u>`; };
const chips = (a, n = 6) => (a.length ? a : []).slice(-n).map(chip).join('') || '<em class="none">new over</em>';
const T = (vm, s) => vm.teams[s || vm.bat || 'A'];
const sc = (vm) => vm.score || { runs: 0, wkts: 0, overs: '0.0', crr: 0, oversLimit: vm.match.overs };
export function dtext(p) {
  const b = p.bowlerName || '', f = p.fielderName || '';
  return ({ bowled: `b ${b}`, caught: `c ${f || 'sub'} b ${b}`, caughtAndBowled: `c & b ${b}`, lbw: `lbw b ${b}`, stumped: `st ${f} b ${b}`, hitWicket: `hit wicket b ${b}`,
    runOut: `run out${f ? ` (${f})` : ''}`, obstructing: 'obstructing the field', hitBallTwice: 'hit the ball twice', timedOut: 'timed out', retiredOut: 'retired out' })[p.kind] || 'out';
}
const chase = (vm) => { const s = sc(vm); return s.target != null ? `${T(vm).short} need ${s.need} run${s.need === 1 ? '' : 's'} from ${s.ballsLeft} ball${s.ballsLeft === 1 ? '' : 's'}` : ''; };
const info = (vm) => chase(vm) || [vm.match.tournament, vm.match.venue].filter(Boolean).join('  •  ') || vm.match.name;

// ================= MAIN SCOREBOARD (one bar, three sections) =================
const num = (x, d = 2) => (x == null || Number.isNaN(x) ? '-' : Number(x).toFixed(d));
function subLine(vm) {
  const s = sc(vm), p = [];
  if (s.target != null) { p.push(`TARGET <b>${s.target}</b>`); p.push(`RRR <b>${s.rrr == null ? '-' : num(s.rrr)}</b>`); }
  p.push(`CRR <b>${num(s.crr)}</b>`); if (s.proj && s.target == null) p.push(`PROJECTED <b>${s.proj[0].score}</b>`);
  if (s.freeHit) p.push('<b class="fh">FREE HIT</b>');
  return p.map(x => `<span>${x}</span>`).join('');
}
const kv = (l, v) => `<div class="x-kv"><small>${l}</small><b>${v}</b></div>`;
// What each inline graphic puts in the left / right section (or the line under the score)
function inlineParts(vm, key, custom = {}) {
  const s = sc(vm), A = vm.teams.A, B = vm.teams.B, b = vm.batters;
  switch (key) {
    case 'timeline': return { r: `<div class="x-row"><div class="x-tl"><small>LAST 6 BALLS</small><div class="ov">${chips(vm.lastSix, 6)}</div></div>${kv('CRR', num(s.crr))}</div>`, sub: 'TIMELINE' };
    case 'projected': return { r: s.proj ? `<div class="x-row">${s.proj.map(p => kv(p.label.replace(/ RPO$/, ''), p.score)).join('')}</div>` : '<div class="x-tl"><small>PROJECTION AFTER FIRST BALL</small></div>', sub: 'PROJECTED SCORE' };
    case 'target': return { r: `<div class="x-row">${s.target != null ? `${kv('TO WIN', s.need)}<i class="x-sep"></i>${kv('BALLS', s.ballsLeft)}<i class="x-sep"></i>${kv('RRR', s.rrr == null ? '-' : num(s.rrr))}` : `${kv('CRR', num(s.crr))}${kv('OVERS', esc(s.overs))}`}</div>`, sub: s.target != null ? `TARGET: <b>${s.target}</b>` : 'FIRST INNINGS' };
    case 'partnership': return { l: `<div class="x-pt"><small>PARTNERSHIP</small><b>${vm.partnership.runs}</b><span>(${vm.partnership.balls})</span><em>${esc(b[0]?.name || '')}${b[1] ? ' &amp; ' + esc(b[1].name) : ''}</em></div>`, sub: 'PARTNERSHIP' };
    case 'preview': return { l: `<div class="x-tm"><b>${esc(A.name)}</b></div>`, r: `<div class="x-tm"><b>${esc(B.name)}</b></div>`, sub: esc(vm.match.tournament || 'MATCH PREVIEW') };
    case 'toss': return { l: `<div class="x-tm"><b>${esc(vm.match.toss ? vm.match.toss.split(' won the toss')[0] : 'Toss')}</b><small>WON THE TOSS</small></div>`, r: `<div class="x-tm"><b>${esc(vm.match.toss ? (vm.match.toss.split('chose to ')[1] || '').toUpperCase() : '')}</b><small>FIRST</small></div>`, sub: 'TOSS RESULT' };
    case 'custom': return { r: `<div class="x-tm two"><b>${esc(custom.left || vm.match.tournament || vm.match.name)}</b><b>${esc(custom.right || vm.match.venue || '')}</b></div>`, sub: '' };
    case 'resultBar': { const r = vm.result; return { l: `<div class="x-tm"><b>${esc(r ? r.text : 'MATCH IN PROGRESS')}</b></div>`, r: `<div class="x-tm two">${vm.cards.map(c => `<b>${esc(c.team)} ${c.runs}-${c.wkts} <small>(${esc(c.overs)})</small></b>`).join('')}</div>`, sub: r ? 'MATCH RESULT' : 'LIVE' }; }
    default: return {};
  }
}
function scoreboard(theme, vm, o = {}) {
  const s = sc(vm), bat = vm.bat || 'A', bowl = bat === 'A' ? 'B' : 'A', tb = vm.teams[bat], tw = vm.teams[bowl], bw = vm.bowler;
  const ix = o.inl ? inlineParts(vm, o.inl, vm.custom || {}) : {};
  const dl = vm.batters.slice(0, 2).map(b => `<div class="r${b.strike ? ' on' : ''}"><i>${b.strike ? '&#9656;&#9656;' : ''}</i><em>${esc(b.name)}</em><b>${b.runs}</b><small>${b.balls}</small></div>`).join('') || '<div class="r"><em>Awaiting batters</em></div>';
  const dr = `<div class="bw"><em>${bw ? esc(bw.name) : 'Select bowler'}</em><b>${bw ? `${bw.w}-${bw.r}` : ''}</b><small>${bw ? bw.o : ''}</small></div><div class="ov">${chips(vm.thisOver, 6)}</div>`;
  const swapL = o.swap && (ix.l || o.swap === 'back') ? ' swap' : '', swapR = o.swap && (ix.r || o.swap === 'back') ? ' swap' : '';
  const sub = ix.sub !== undefined ? ix.sub : subLine(vm);
  const ov = esc(s.overs), lim = s.oversLimit ?? vm.match.overs;
  return `<div class="sb th-${theme}${o.inl ? ' has-inl' : ''}"><div class="sb-l tm${bat}" style="--tc:${esc(tb.color)}"><i class="cr">${crest(tb, 86)}</i><div class="sbx${swapL}">${ix.l ?? dl}</div></div>
   <div class="sb-c"><div class="sb-top"><em>${esc(tb.short)}</em><b class="sc">${s.runs}<i>-</i>${s.wkts}</b><span class="ovs"><u>OVERS</u>${ov}<small>(${lim})</small></span></div><div class="sb-sub">${sub}</div></div>
   <div class="sb-r tm${bowl}" style="--tc:${esc(tw.color)}"><div class="sbx${swapR}">${ix.r ?? dr}</div><i class="cr">${crest(tw, 86)}</i></div></div>`;
}

const head = (title, right = '') => `<header><h2>${esc(title)}</h2><span>${right}</span></header>`;
const wrap = (key, vm, title, body, right = '', side) => `<section class="card g-${key} s${side || vm.bat || 'A'}">${head(title, right)}<div class="cb">${body}</div></section>`;
const battingTable = (c) => `<table><thead><tr><th class="l">BATTER</th><th class="l">DISMISSAL</th><th>R</th><th>B</th><th>4s</th><th>6s</th><th>SR</th></tr></thead><tbody>${c.bat.map(b =>
  `<tr class="${b.strike ? 'on' : ''}"><td class="l">${esc(b.name)}${b.strike ? ' *' : ''}</td><td class="l dm">${esc(b.out)}</td><td class="n">${b.runs}</td><td>${b.balls}</td><td>${b.fours}</td><td>${b.sixes}</td><td>${b.sr}</td></tr>`).join('')}</tbody></table>
  <div class="ft"><span>Extras ${esc(c.extras.text)}</span><b>${c.runs}/${c.wkts} (${c.overs} ov)</b></div>${c.yetToBat.length ? `<div class="yb">Yet to bat: ${esc(c.yetToBat.join(', '))}</div>` : ''}`;
const bowlingTable = (c) => `<table><thead><tr><th class="l">BOWLER</th><th>O</th><th>M</th><th>R</th><th>W</th><th>ECO</th></tr></thead><tbody>${c.bowl.map(b =>
  `<tr><td class="l">${esc(b.name)}</td><td>${b.o}</td><td>${b.m}</td><td>${b.r}</td><td class="n">${b.w}</td><td>${b.econ}</td></tr>`).join('')}</tbody></table>`;
const list = (xi) => `<ol class="xi">${xi.map((p, i) => `<li><i>${i + 1}</i><b>${esc(p.name)}</b>${p.cap ? '<u>C</u>' : ''}${p.wk ? '<u>WK</u>' : ''}<small>${esc(p.role)}</small></li>`).join('')}</ol>`;
const cur = (vm) => vm.card || vm.cards[0];
const banner = (cls, big, small) => `<section class="card banner g-${cls}"><div class="bn"><small>${esc(small)}</small><h1>${esc(big)}</h1></div></section>`;

// ================= PANELS =================
const lt = (key, vm, label, body, side) => `<section class="lt g-${key} s${side || vm.bat || 'A'}"><div class="lt-tag">${esc(label)}</div><div class="lt-body">${body}</div></section>`;
export function panel(theme, key, vm, params = {}) {
  const t = T(vm), s = sc(vm), c = cur(vm), m = vm.match;
  if (INLINE.has(key)) return scoreboard(theme, vm, { inl: key });
  switch (key) {
    case 'scoreboard': return scoreboard(theme, vm, params);
    case 'batterCard': { const b = vm.batters[0]; return b ? lt(key, vm, 'ON STRIKE', `<h3>${esc(b.name)}</h3><div class="st"><div><small>RUNS</small><b>${b.runs}</b></div><div><small>BALLS</small><b>${b.balls}</b></div><div><small>4s</small><b>${b.fours}</b></div><div><small>6s</small><b>${b.sixes}</b></div><div><small>SR</small><b>${b.sr}</b></div></div>`) : ''; }
    case 'bowlerCard': { const b = vm.bowler; return b ? lt(key, vm, 'BOWLING', `<h3>${esc(b.name)}</h3><div class="st"><div><small>OVERS</small><b>${b.o}</b></div><div><small>MAIDENS</small><b>${b.m}</b></div><div><small>RUNS</small><b>${b.r}</b></div><div><small>WKTS</small><b>${b.w}</b></div><div><small>ECO</small><b>${b.econ}</b></div></div>`, vm.bat === 'A' ? 'B' : 'A') : ''; }
    case 'officials': return lt(key, vm, 'MATCH OFFICIALS', m.officials.length ? `<div class="offs">${m.officials.map(o => `<span>${esc(o)}</span>`).join('')}</div>` : '<h3>Not announced</h3>');
    case 'drinks': return lt(key, vm, 'BREAK', '<h3>DRINKS BREAK</h3>');
    case 'rain': return lt(key, vm, 'PLAY SUSPENDED', '<h3>RAIN DELAY</h3>');
    case 'resume': return lt(key, vm, 'MATCH RESUMPTION', '<h3>PLAY RESUMES</h3>');
    case 'potm': return lt(key, vm, 'PLAYER OF THE MATCH', vm.potm ? `<h3>${esc(vm.potm.name)}</h3><p>${esc(vm.potm.team)}${vm.potm.line ? '  &bull;  ' + esc(vm.potm.line) : ''}</p>` : '<h3>To be announced</h3>');
    case 'champion': { const w = vm.points?.[0]; return lt(key, vm, 'TOURNAMENT CHAMPIONS', `<h3>${esc(w ? w.name : vm.result?.text || 'Champion')}</h3>`); }
    case 'sponsor': { const sp = vm.sponsors[params.i || 0]; return lt(key, vm, 'PROUDLY SUPPORTED BY', sp ? `<div class="spn">${sp.logo ? `<img src="${esc(sp.logo)}" alt="">` : ''}<h3>${esc(sp.name)}</h3><p>${esc(sp.message)}</p></div>` : '<h3>Add sponsors in the control room</h3>'); }
    case 'qr': return lt(key, vm, 'FOLLOW LIVE', `<div class="qrw"><div class="qrs">${qrSvg(m.publicUrl || 'https://example.com', { fg: '#0a0f0c', bg: '#ffffff', margin: 1 })}</div><h3>Scan for the live scorecard</h3></div>`);
    case 'batting': return c ? wrap(key, vm, `${c.teamName} Batting`, battingTable(c), `${c.runs}/${c.wkts}`, c.side) : '';
    case 'bowling': return c ? wrap(key, vm, `${c.bowlTeam} Bowling`, bowlingTable(c), `${c.runs}/${c.wkts}`, c.side === 'A' ? 'B' : 'A') : '';
    case 'fow': return c ? wrap(key, vm, 'Fall of wickets', c.fow.length ? `<ul class="fw">${c.fow.map(f => `<li><b>${f.w}</b><span>${f.runs}</span><em>${esc(f.name)}</em><small>${esc(f.at)} ov</small></li>`).join('')}</ul>` : '<p class="mt">No wickets yet</p>') : '';
    case 'lineupA': case 'lineupB': { const side = key === 'lineupA' ? 'A' : 'B'; return wrap(key, vm, `${vm.teams[side].name}  Playing XI`, list(vm.xi[side]), crest(vm.teams[side], 44), side); }
    case 'lineups': return `<section class="card g-lineups">${head('Playing XI', esc(m.tournament))}<div class="cb two"><div class="col sA"><h4>${esc(vm.teams.A.name)}</h4>${list(vm.xi.A)}</div><div class="col sB"><h4>${esc(vm.teams.B.name)}</h4>${list(vm.xi.B)}</div></div></section>`;
    case 'inningsBreak': { const f = vm.cards[0]; return f ? wrap(key, vm, 'Innings break', `<div class="ib"><div class="a">${crest(vm.teams[f.side], 120)}<b>${f.runs}/${f.wkts}</b><small>${esc(f.overs)} overs</small></div><div class="b"><small>TARGET</small><b>${f.runs + 1}</b><span>${esc(vm.teams[f.side === 'A' ? 'B' : 'A'].name)} need ${f.runs + 1} to win</span></div></div>`) : ''; }
    case 'result': { const r = vm.result; return banner('result', r ? r.text : 'Match in progress', 'RESULT').replace('</div></section>', `<div class="rs">${vm.cards.map(x => `<span>${esc(x.team)} <b>${x.runs}/${x.wkts}</b> (${x.overs})</span>`).join('')}</div></div></section>`); }
    case 'summary': { if (!vm.cards.length) return '';
      const pad = (arr) => arr.concat(Array(Math.max(0, 3 - arr.length)).fill('<div class="rw e"><em></em><b></b><small></small></div>')).join('');
      const blk = (c) => `<div class="sum-team s${c.side}"><strong>${esc(c.teamName)}</strong><span>OVERS ${esc(c.overs)}</span><b>${c.runs}-${c.wkts}</b></div><div class="sum-grid"><div>${pad(c.bat.slice().sort((a, b) => b.runs - a.runs).slice(0, 3).map(b => `<div class="rw"><em>${esc(b.name)}</em><b>${b.runs}${b.isOut ? '' : '*'}</b><small>${b.balls}</small></div>`))}</div><div>${pad(c.bowl.slice().sort((a, b) => b.w - a.w || a.r - b.r).slice(0, 3).map(b => `<div class="rw"><em>${esc(b.name)}</em><b>${b.w}-${b.r}</b><small>${esc(b.o)}</small></div>`))}</div></div>`;
      const sides = vm.cards.length > 1 ? vm.cards.map(c => c.side) : ['A', 'B'];
      return `<section class="card g-summary sum"><div class="sum-logos">${sides.map(sd => crest(vm.teams[sd], 190)).join('')}</div><div class="sum-main"><div class="sum-title">MATCH SUMMARY</div><div class="sum-sub">${esc(m.tournament || m.name)}${m.number ? ' | MATCH NO.' + esc(m.number) : ''}</div>${vm.cards.map(blk).join('')}<div class="sum-res">${esc(vm.result ? vm.result.text : 'MATCH IN PROGRESS')}</div></div></section>`; }
    case 'points': return vm.points ? wrap(key, vm, 'Points table', `<table><thead><tr><th class="l">TEAM</th><th>P</th><th>W</th><th>L</th><th>T</th><th>NRR</th><th>PTS</th></tr></thead><tbody>${vm.points.map((r, i) => `<tr><td class="l"><i>${i + 1}</i>${esc(r.team)}</td><td>${r.p}</td><td>${r.w}</td><td>${r.l}</td><td>${r.t}</td><td>${r.nrr > 0 ? '+' : ''}${r.nrr.toFixed(3)}</td><td class="n">${r.pts}</td></tr>`).join('')}</tbody></table>`, esc(m.tournament)) : wrap(key, vm, 'Points table', '<p class="mt">This match is not part of a tournament</p>');
    case 'compareBar': return wrap(key, vm, 'Over comparison', chart(vm, 'bar'));
    case 'compareLine': return wrap(key, vm, 'Run progression', chart(vm, 'line'));
    default: return '';
  }
}
export const ticker = (theme, vm, o) => scoreboard(theme, vm, o);

function chart(vm, kind) {
  const cs = vm.cards.slice(0, 2).filter(c => c.ovr && c.ovr.length); if (!cs.length) return '<p class="mt">The comparison appears after the first over</p>';
  const W = 1100, H = 380, L = 64, B = 46, T0 = 18, R = 18, maxO = Math.max(2, ...cs.map(c => c.ovr.length));
  const maxV = kind === 'bar' ? Math.max(4, ...cs.flatMap(c => c.ovr.map(o => o.r))) : Math.max(4, ...cs.map(c => c.ovr[c.ovr.length - 1].cum));
  const step = [1, 2, 4, 5, 10, 20, 25, 50, 100, 200].find(s => maxV / s <= 6) || 200, top = Math.ceil(maxV / step) * step, pw = W - L - R;
  const x = (i) => L + (kind === 'bar' ? (i + 0.5) * pw / maxO : (i * pw) / maxO), y = (v) => H - B - (v / top) * (H - B - T0);
  let g = ''; for (let v = 0; v <= top; v += step) g += `<line class="gl" x1="${L}" x2="${W - R}" y1="${y(v)}" y2="${y(v)}"/><text class="ax" x="${L - 10}" y="${y(v) + 7}" text-anchor="end">${v}</text>`;
  for (let i = 0; i < maxO; i++) g += `<text class="ax" x="${x(i)}" y="${H - 14}" text-anchor="middle">${kind === 'bar' ? i + 1 : i}</text>`;
  if (kind === 'line') g += `<text class="ax" x="${x(maxO)}" y="${H - 14}" text-anchor="middle">${maxO}</text>`;
  let d = '';
  cs.forEach((c, k) => {
    if (kind === 'bar') { const gw = pw / maxO, bw = Math.min(46, gw / (cs.length + 1)); c.ovr.forEach((o, i) => { const bx = x(i) - (cs.length * bw) / 2 + k * bw; d += `<rect class="bar s${c.side}" x="${bx}" y="${y(o.r)}" width="${bw - 3}" height="${H - B - y(o.r)}"/>`; if (o.w) d += `<circle class="wk" cx="${bx + (bw - 3) / 2}" cy="${y(o.r) - 12}" r="9"/><text class="wt" x="${bx + (bw - 3) / 2}" y="${y(o.r) - 8}" text-anchor="middle">W</text>`; }); }
    else { const pts = [[0, 0], ...c.ovr.map((o, i) => [i + 1, o.cum])]; d += `<polyline class="ln s${c.side}" fill="none" points="${pts.map(p => `${x(p[0])},${y(p[1])}`).join(' ')}"/>`; c.ovr.forEach((o, i) => { d += `<circle class="dot s${c.side}" cx="${x(i + 1)}" cy="${y(o.cum)}" r="6"/>`; if (o.w) d += `<text class="wt2" x="${x(i + 1)}" y="${y(o.cum) - 14}" text-anchor="middle">W</text>`; }); }
  });
  return `<svg class="chart" viewBox="0 0 ${W} ${H}" xmlns="http://www.w3.org/2000/svg">${g}${d}</svg><div class="cmp">${cs.map(c => `<span class="s${c.side}">${esc(c.team)} <b>${c.runs}-${c.wkts}</b> <small>${esc(c.overs)} OVERS</small></span>`).join('')}</div>`;
}
// ================= CELEBRATIONS: fill the whole scoreboard bar, just the event word =================
export function fx(theme, kind, p, vm) {
  const W = { four: 'FOUR', six: 'SIX', wicket: 'WICKET', fifty: 'FIFTY', century: 'HUNDRED', hattrick: 'HAT-TRICK', noball: 'NO BALL', wide: 'WIDE', maiden: 'MAIDEN OVER' }[kind]; if (!W) return '';
  const P = theme === 'pulse' ? 'pu' : theme === 'mohua' ? 'mh' : 'ar', n = W.length, fs = n <= 3 ? 150 : n <= 5 ? 128 : n <= 7 ? 110 : n <= 9 ? 96 : 80;
  const sparks = Array.from({ length: 22 }, (_, i) => `<s style="left:${(i * 47) % 100}%;top:${(i * 31) % 90}%;--d:${(i * 90) % 700}ms;--z:${0.6 + ((i * 13) % 10) / 10}"></s>`).join('');
  const stump = '<svg viewBox="0 0 120 100"><rect x="18" y="26" width="10" height="70"/><rect x="55" y="26" width="10" height="70"/><rect x="92" y="26" width="10" height="70"/><rect class="b1" x="14" y="14" width="30" height="8"/><rect class="b2" x="76" y="14" width="30" height="8"/></svg>';
  const deco = kind === 'four' ? '<div class="fb-deco chev"><i></i><i></i><i></i><i></i><i></i><i></i></div>'
    : kind === 'six' ? `<div class="fb-deco sparks">${sparks}</div><span class="fb-ring"></span>`
    : kind === 'wicket' ? `<div class="fb-deco stumps"><div class="l">${stump}</div><div class="r">${stump}</div></div>`
    : kind === 'noball' ? '<div class="fb-deco stripes"><i></i><i></i></div>'
    : `<div class="fb-deco sparks">${sparks}</div>`;
  const ghost = `${W}   `.repeat(10);
  return `<div class="fx fxbar ${P}-fx fx-${kind}"><div class="fb-bg"></div><div class="fb-ghost"><span>${ghost}</span></div>${deco}<span class="fb-shine"></span><div class="fb-word" style="font-size:${fs}px"><span>${W}</span></div></div>`;
}
