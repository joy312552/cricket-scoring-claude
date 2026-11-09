import { qrSvg } from './qr.js';
// Theme engine: pure functions (view-model in, HTML string out). No data fetching, no scoring logic.
export const THEMES = { arena: { key: 'arena', name: 'ARENA', tag: 'Premium international broadcast' }, pulse: { key: 'pulse', name: 'PULSE', tag: 'Modern dynamic sports tech' } };
export const GRAPHIC_LIST = [
  ['Live score', [['scoreboard', 'Main scoreboard'], ['compact', 'Compact score bug'], ['over', 'Current over'], ['target', 'Target / chase'], ['fow', 'Fall of wickets']]],
  ['Batting', [['batting', 'Batting scorecard'], ['batterCard', 'Batter card'], ['partnership', 'Partnership'], ['topScorer', 'Top scorer']]],
  ['Bowling', [['bowling', 'Bowling scorecard'], ['bowlerCard', 'Bowler card'], ['topBowler', 'Top wicket taker']]],
  ['Match', [['preview', 'Match preview'], ['toss', 'Toss result'], ['lineupA', 'Playing XI: Team A'], ['lineupB', 'Playing XI: Team B'], ['matchinfo', 'Venue & info'], ['officials', 'Match officials']]],
  ['Breaks', [['inningsBreak', 'Innings break'], ['drinks', 'Drinks break'], ['rain', 'Rain delay'], ['resume', 'Match resumption']]],
  ['Result', [['result', 'Match result'], ['potm', 'Player of the Match'], ['summary', 'Match summary']]],
  ['Tournament', [['points', 'Points table'], ['champion', 'Tournament champion']]],
  ['Branding', [['sponsor', 'Sponsor panel'], ['qr', 'QR code: follow live']]],
];
export const FX_LIST = [['four', 'FOUR'], ['six', 'SIX'], ['wicket', 'WICKET'], ['fifty', 'FIFTY'], ['century', 'HUNDRED'], ['hattrick', 'HAT-TRICK'], ['noball', 'NO BALL'], ['wide', 'WIDE'], ['maiden', 'MAIDEN']];

export const esc = (s) => String(s ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const crest = (t, s = 64) => `<i class="crest" style="--s:${s}px;--c:${esc(t.color)};--c2:${esc(t.color2)}">${t.logo ? `<img src="${esc(t.logo)}" alt="">` : `<b>${esc((t.short || '').slice(0, 3))}</b>`}</i>`;
const chip = (s) => { const c = s === 'W' ? 'w' : s === '4' ? 'f' : s === '6' ? 's' : /^(Wd|Nb)/.test(s) ? 'x' : s === '0' ? 'd' : ''; return `<u class="ball ${c}">${esc(s)}</u>`; };
const chips = (a, n = 6) => (a.length ? a : []).slice(-n).map(chip).join('') || '<em class="none">new over</em>';
const T = (vm, s) => vm.teams[s || vm.bat || 'A'];
const sc = (vm) => vm.score || { runs: 0, wkts: 0, overs: '0.0', crr: 0 };
export function dtext(p) {
  const b = p.bowlerName || '', f = p.fielderName || '';
  return ({ bowled: `b ${b}`, caught: `c ${f || 'sub'} b ${b}`, caughtAndBowled: `c & b ${b}`, lbw: `lbw b ${b}`, stumped: `st ${f} b ${b}`, hitWicket: `hit wicket b ${b}`,
    runOut: `run out${f ? ` (${f})` : ''}`, obstructing: 'obstructing the field', hitBallTwice: 'hit the ball twice', timedOut: 'timed out', retiredOut: 'retired out' })[p.kind] || 'out';
}
const chase = (vm) => { const s = sc(vm); return s.target != null ? `${T(vm).short} need ${s.need} run${s.need === 1 ? '' : 's'} from ${s.ballsLeft} ball${s.ballsLeft === 1 ? '' : 's'}` : ''; };
const info = (vm) => chase(vm) || [vm.match.tournament, vm.match.venue].filter(Boolean).join('  •  ') || vm.match.name;

// ================= TICKERS =================
function tickerArena(vm) {
  const s = sc(vm), t = T(vm), bw = vm.bowler;
  const bats = vm.batters.slice(0, 2).map(b => `<div class="r${b.strike ? ' on' : ''}"><span>${b.strike ? '▶' : ''}</span><em>${esc(b.name)}</em><b>${b.runs}</b><small>${b.balls}</small></div>`).join('') || '<div class="r"><em>Awaiting batters</em></div>';
  const right = s.target != null ? `<div class="k"><small>TARGET</small><b>${s.target}</b></div><div class="k"><small>RRR</small><b>${s.rrr ?? '-'}</b></div>`
    : `<div class="k"><small>CRR</small><b>${s.crr.toFixed(2)}</b></div>${vm.firstInn ? '' : `<div class="k"><small>OVERS</small><b>${vm.match.overs}</b></div>`}`;
  return `<div class="ar-tick"><div class="ar-main">
    <div class="ar-team" style="--c:${esc(t.color)};--c2:${esc(t.color2)}">${crest(t, 74)}<b>${esc(t.short)}</b></div>
    <div class="ar-score"><b>${s.runs}</b><i>-</i><b class="w">${s.wkts}</b><small>${esc(s.overs)} <span>OV</span></small></div>
    <div class="ar-bats">${bats}</div>
    <div class="ar-bowl"><div class="nm">${bw ? esc(bw.name) : 'Select bowler'}</div><div class="fg">${bw ? `${bw.w}-${bw.r} <small>(${bw.o})</small>` : ''}</div><div class="ov">${chips(vm.thisOver)}</div></div>
    <div class="ar-kv">${right}</div></div>
    <div class="ar-foot"><span class="lbl">${vm.innings === 2 ? '2ND INNINGS' : vm.innings === 1 ? '1ST INNINGS' : 'LIVE'}</span><span class="tx">${esc(info(vm))}</span>${s.freeHit ? '<span class="fh">FREE HIT</span>' : ''}</div></div>`;
}
function tickerPulse(vm) {
  const s = sc(vm), t = T(vm), bw = vm.bowler;
  const bats = vm.batters.slice(0, 2).map(b => `<div class="${b.strike ? 'on' : ''}"><em>${esc(b.name)}</em><b>${b.runs}</b><small>${b.balls}</small></div>`).join('');
  return `<div class="pu-tick">
    <div class="pu-top"><span class="tm" style="--c:${esc(t.color)};--c2:${esc(t.color2)}">${crest(t, 46)}<b>${esc(t.short)}</b></span>
      <span class="sc">${s.runs}<i>/${s.wkts}</i></span><span class="ov">${esc(s.overs)}<small>OVERS</small></span>
      <span class="rt">${s.target != null ? `<small>NEED</small>${s.need}` : `<small>CRR</small>${s.crr.toFixed(2)}`}</span></div>
    <div class="pu-mid"><div class="bt">${bats}</div><div class="bw"><em>${bw ? esc(bw.name) : '-'}</em><b>${bw ? `${bw.w}-${bw.r}` : ''}</b><small>${bw ? bw.o : ''}</small></div></div>
    <div class="pu-bot"><div class="balls">${chips(vm.thisOver)}</div><span class="inf">${s.freeHit ? '<b class="fh">FREE HIT</b> ' : ''}${esc(info(vm))}</span></div></div>`;
}
export const ticker = (theme, vm) => (theme === 'pulse' ? tickerPulse(vm) : tickerArena(vm));

// ================= PANELS =================
const head = (title, right = '') => `<header><h2>${esc(title)}</h2><span>${right}</span></header>`;
const wrap = (key, vm, title, body, right = '') => `<section class="card g-${key}">${head(title, right)}<div class="cb">${body}</div></section>`;
const battingTable = (c) => `<table><thead><tr><th class="l">BATTER</th><th class="l">DISMISSAL</th><th>R</th><th>B</th><th>4s</th><th>6s</th><th>SR</th></tr></thead><tbody>${c.bat.map(b =>
  `<tr class="${b.strike ? 'on' : ''}"><td class="l">${esc(b.name)}${b.strike ? ' *' : ''}</td><td class="l dm">${esc(b.out)}</td><td class="n">${b.runs}</td><td>${b.balls}</td><td>${b.fours}</td><td>${b.sixes}</td><td>${b.sr}</td></tr>`).join('')}</tbody></table>
  <div class="ft"><span>Extras ${esc(c.extras.text)}</span><b>${c.runs}/${c.wkts} (${c.overs} ov)</b></div>${c.yetToBat.length ? `<div class="yb">Yet to bat: ${esc(c.yetToBat.join(', '))}</div>` : ''}`;
const bowlingTable = (c) => `<table><thead><tr><th class="l">BOWLER</th><th>O</th><th>M</th><th>R</th><th>W</th><th>ECO</th></tr></thead><tbody>${c.bowl.map(b =>
  `<tr><td class="l">${esc(b.name)}</td><td>${b.o}</td><td>${b.m}</td><td>${b.r}</td><td class="n">${b.w}</td><td>${b.econ}</td></tr>`).join('')}</tbody></table>`;
const list = (xi) => `<ol class="xi">${xi.map((p, i) => `<li><i>${i + 1}</i><b>${esc(p.name)}</b>${p.cap ? '<u>C</u>' : ''}${p.wk ? '<u>WK</u>' : ''}<small>${esc(p.role)}</small></li>`).join('')}</ol>`;
const cur = (vm) => vm.card || vm.cards[0];
const banner = (cls, big, small) => `<section class="card banner g-${cls}"><div class="bn"><small>${esc(small)}</small><h1>${esc(big)}</h1></div></section>`;

export function panel(theme, key, vm, params = {}) {
  const t = T(vm), s = sc(vm), c = cur(vm), m = vm.match;
  switch (key) {
    case 'scoreboard': return ticker(theme, vm);
    case 'compact': return `<div class="compact"><span class="tm" style="--c:${esc(t.color)}">${esc(t.short)}</span><b>${s.runs}/${s.wkts}</b><small>${esc(s.overs)}</small></div>`;
    case 'batting': return c ? wrap(key, vm, `${c.teamName} Batting`, battingTable(c), `${c.runs}/${c.wkts}`) : '';
    case 'bowling': return c ? wrap(key, vm, `${c.bowlTeam} Bowling`, bowlingTable(c), `${c.runs}/${c.wkts}`) : '';
    case 'fow': return c ? wrap(key, vm, 'Fall of wickets', c.fow.length ? `<ul class="fw">${c.fow.map(f => `<li><b>${f.w}</b><span>${f.runs}</span><em>${esc(f.name)}</em><small>${esc(f.at)} ov</small></li>`).join('')}</ul>` : '<p class="mt">No wickets yet</p>') : '';
    case 'over': return wrap(key, vm, `Over ${Math.floor(parseFloat(s.overs)) + (vm.bowler && vm.bowler.current ? 1 : 0)}`, `<div class="bigballs">${chips(vm.thisOver, 8)}</div><div class="lst"><small>LAST SIX</small>${chips(vm.lastSix)}</div>`, esc(vm.bowler?.name || ''));
    case 'target': return s.target != null ? wrap(key, vm, 'Chase', `<div class="tg"><div><small>TARGET</small><b>${s.target}</b></div><div><small>NEED</small><b>${s.need}</b></div><div><small>BALLS</small><b>${s.ballsLeft}</b></div><div><small>RRR</small><b>${s.rrr ?? '-'}</b></div></div>`, esc(t.name))
      : wrap(key, vm, 'Projected', `<div class="tg"><div><small>SCORE</small><b>${s.runs}/${s.wkts}</b></div><div><small>CRR</small><b>${s.crr}</b></div><div><small>OVERS</small><b>${esc(s.overs)}</b></div></div>`);
    case 'partnership': { const b = vm.batters; return wrap(key, vm, 'Partnership', `<div class="pt"><div class="p1"><em>${esc(b[0]?.name || '')}</em><b>${b[0]?.runs ?? 0}</b><small>${b[0]?.balls ?? 0} balls</small></div><div class="pm"><small>PARTNERSHIP</small><b>${vm.partnership.runs}</b><small>${vm.partnership.balls} balls</small></div><div class="p2"><em>${esc(b[1]?.name || '')}</em><b>${b[1]?.runs ?? 0}</b><small>${b[1]?.balls ?? 0} balls</small></div></div>`); }
    case 'batterCard': { const b = vm.batters[0]; return b ? wrap(key, vm, 'On strike', `<div class="pc"><h3>${esc(b.name)}</h3><div class="st"><div><small>RUNS</small><b>${b.runs}</b></div><div><small>BALLS</small><b>${b.balls}</b></div><div><small>4s</small><b>${b.fours}</b></div><div><small>6s</small><b>${b.sixes}</b></div><div><small>SR</small><b>${b.sr}</b></div></div></div>`, esc(t.name)) : ''; }
    case 'bowlerCard': { const b = vm.bowler; return b ? wrap(key, vm, 'Bowling', `<div class="pc"><h3>${esc(b.name)}</h3><div class="st"><div><small>OVERS</small><b>${b.o}</b></div><div><small>MAIDENS</small><b>${b.m}</b></div><div><small>RUNS</small><b>${b.r}</b></div><div><small>WKTS</small><b>${b.w}</b></div><div><small>ECO</small><b>${b.econ}</b></div></div></div>`) : ''; }
    case 'topScorer': return vm.topScorer ? wrap(key, vm, 'Top scorer', `<div class="pc"><h3>${esc(vm.topScorer.name)}</h3><div class="st"><div><small>RUNS</small><b>${vm.topScorer.runs}</b></div><div><small>BALLS</small><b>${vm.topScorer.balls}</b></div><div><small>4s/6s</small><b>${vm.topScorer.fours}/${vm.topScorer.sixes}</b></div><div><small>SR</small><b>${vm.topScorer.sr}</b></div></div></div>`, esc(t.name)) : '';
    case 'topBowler': return vm.topBowler ? wrap(key, vm, 'Top wicket taker', `<div class="pc"><h3>${esc(vm.topBowler.name)}</h3><div class="st"><div><small>FIGURES</small><b>${vm.topBowler.w}-${vm.topBowler.r}</b></div><div><small>OVERS</small><b>${vm.topBowler.o}</b></div><div><small>ECO</small><b>${vm.topBowler.econ}</b></div></div></div>`) : '';
    case 'preview': return `<section class="card g-preview"><div class="pv"><div>${crest(vm.teams.A, 150)}<h3>${esc(vm.teams.A.name)}</h3></div><div class="vs"><small>${esc(m.tournament)}</small><b>VS</b><small>${esc(m.format)} • ${esc(m.venue)}</small></div><div>${crest(vm.teams.B, 150)}<h3>${esc(vm.teams.B.name)}</h3></div></div></section>`;
    case 'toss': return banner('toss', m.toss || 'Toss pending', 'TOSS');
    case 'lineupA': case 'lineupB': { const side = key === 'lineupA' ? 'A' : 'B'; return wrap(key, vm, `${vm.teams[side].name}  Playing XI`, list(vm.xi[side]), crest(vm.teams[side], 44)); }
    case 'matchinfo': return wrap(key, vm, m.tournament || 'Match', `<div class="inf2"><div class="tt">${crest(vm.teams.A, 90)}<b>${esc(vm.teams.A.short)}</b><i>vs</i><b>${esc(vm.teams.B.short)}</b>${crest(vm.teams.B, 90)}</div><p>${esc(m.venue)}</p><p>${esc(m.format)}  •  ${m.overs} overs${m.number ? '  •  Match ' + esc(m.number) : ''}</p><p>${esc((m.date || '').replace('T', '  '))}</p></div>`);
    case 'officials': return wrap(key, vm, 'Match officials', m.officials.length ? `<ul class="off">${m.officials.map(o => `<li>${esc(o)}</li>`).join('')}</ul>` : '<p class="mt">Not announced</p>');
    case 'inningsBreak': { const f = vm.cards[0]; return f ? wrap(key, vm, 'Innings break', `<div class="ib"><div class="a">${crest(vm.teams[f.side], 120)}<b>${f.runs}/${f.wkts}</b><small>${esc(f.overs)} overs</small></div><div class="b"><small>TARGET</small><b>${f.runs + 1}</b><span>${esc(vm.teams[f.side === 'A' ? 'B' : 'A'].name)} need ${f.runs + 1} to win</span></div></div>`) : ''; }
    case 'result': { const r = vm.result; return banner('result', r ? r.text : 'Match in progress', 'RESULT') .replace('</div></section>', `<div class="rs">${vm.cards.map(x => `<span>${esc(x.team)} <b>${x.runs}/${x.wkts}</b> (${x.overs})</span>`).join('')}</div></div></section>`); }
    case 'potm': return vm.potm ? banner('potm', vm.potm.name, 'PLAYER OF THE MATCH').replace('</div></section>', `<p>${esc(vm.potm.team)}${vm.potm.line ? ' • ' + esc(vm.potm.line) : ''}</p></div></section>`) : banner('potm', 'To be announced', 'PLAYER OF THE MATCH');
    case 'summary': return vm.cards.length ? `<section class="card g-summary">${head('Match summary', esc(vm.result?.text || ''))}<div class="cb sm">${vm.cards.map(x => `<div><h4>${esc(x.teamName)} <b>${x.runs}/${x.wkts}</b> <small>${esc(x.overs)} ov</small></h4>${x.bat.slice().sort((a, b) => b.runs - a.runs).slice(0, 3).map(b => `<p><em>${esc(b.name)}</em><b>${b.runs}</b><small>(${b.balls})</small></p>`).join('')}<hr>${x.bowl.slice().sort((a, b) => b.w - a.w || a.r - b.r).slice(0, 3).map(b => `<p><em>${esc(b.name)}</em><b>${b.w}-${b.r}</b><small>(${b.o})</small></p>`).join('')}</div>`).join('')}</div></section>` : '';
    case 'points': return vm.points ? wrap(key, vm, 'Points table', `<table><thead><tr><th class="l">TEAM</th><th>P</th><th>W</th><th>L</th><th>T</th><th>NRR</th><th>PTS</th></tr></thead><tbody>${vm.points.map((r, i) => `<tr><td class="l"><i>${i + 1}</i>${esc(r.team)}</td><td>${r.p}</td><td>${r.w}</td><td>${r.l}</td><td>${r.t}</td><td>${r.nrr > 0 ? '+' : ''}${r.nrr.toFixed(3)}</td><td class="n">${r.pts}</td></tr>`).join('')}</tbody></table>`, esc(m.tournament)) : wrap(key, vm, 'Points table', '<p class="mt">This match is not part of a tournament</p>');
    case 'champion': { const w = vm.points?.[0]; return banner('champion', w ? w.name : 'Champion', 'TOURNAMENT CHAMPION'); }
    case 'sponsor': { const sp = vm.sponsors[params.i || 0]; return sp ? `<section class="card g-sponsor"><div class="spn">${sp.logo ? `<img src="${esc(sp.logo)}" alt="">` : ''}<div><small>PROUDLY SUPPORTED BY</small><h3>${esc(sp.name)}</h3><p>${esc(sp.message)}</p></div></div></section>` : '<section class="card g-sponsor"><div class="spn"><div><small>SPONSOR</small><h3>Add sponsors in Broadcast settings</h3></div></div></section>'; }
    case 'qr': return `<section class="card g-qr"><div class="qrw"><div class="qrs">${qrSvg(m.publicUrl || 'https://example.com', { fg: '#0a0f0c', bg: '#ffffff', margin: 2 })}</div><div><small>FOLLOW LIVE</small><h3>Scan for the live scorecard</h3><p>${esc(m.name)}</p></div></div></section>`;
    case 'drinks': return banner('drinks', 'DRINKS BREAK', 'PLAY RESUMES SHORTLY');
    case 'rain': return banner('rain', 'RAIN DELAY', 'PLAY SUSPENDED');
    case 'resume': return banner('resume', 'PLAY RESUMES', 'MATCH RESUMPTION');
    default: return '';
  }
}

// ================= CELEBRATIONS =================
export function fx(theme, kind, p, vm) {
  if (kind === 'hattrick') p = { ...p, batterName: p.bowlerName, stat: null };
  const t = T(vm), sc2 = `${esc(p.team || t.short)} ${p.runs ?? sc(vm).runs}/${p.wickets ?? sc(vm).wkts}`;
  const who = p.batterName ? `<div class="who">${esc(p.batterName)}${p.stat ? ` <b>${p.stat.runs}</b> <small>(${p.stat.balls})</small>` : ''}</div>` : '';
  const P = theme === 'pulse' ? 'pu' : 'ar';
  const rays = '<span class="rays"></span>', parts = Array.from({ length: 18 }, (_, i) => `<s style="--a:${i * 20}deg;--d:${(i % 5) * 40}ms"></s>`).join('');
  const base = (cls, big, small, extra = '') => `<div class="fx ${P}-fx ${P}-${cls}"><div class="fxbg"></div>${extra}<div class="plate"><small>${esc(small)}</small><h1>${esc(big)}</h1>${who}<div class="sc">${sc2}</div></div></div>`;
  switch (kind) {
    case 'four': return base('four', 'FOUR', 'BOUNDARY', '<span class="sweep"></span>');
    case 'six': return base('six', 'SIX', 'MAXIMUM', rays + `<span class="ring"></span><span class="burst">${parts}</span>`);
    case 'wicket': return `<div class="fx ${P}-fx ${P}-wicket"><div class="fxbg"></div><span class="curtain l"></span><span class="curtain r"></span><div class="plate"><small>WICKET</small><h1>${esc(p.batterName || 'OUT')}</h1>
      <div class="dm">${esc(dtext(p))}</div>${p.stat ? `<div class="who"><b>${p.stat.runs}</b> <small>(${p.stat.balls})</small></div>` : ''}<div class="sc">${sc2}</div></div></div>`;
    case 'fifty': return base('mile', 'FIFTY', 'MILESTONE', '<span class="sweep"></span>');
    case 'century': return base('mile ' + P + '-ton', 'HUNDRED', 'CENTURY', rays + '<span class="sweep"></span>');
    case 'hattrick': return base('mile', 'HAT-TRICK', 'THREE IN THREE', rays);
    case 'noball': return `<div class="fx ${P}-fx ${P}-flag"><div class="plate"><h1>NO BALL</h1><small>FREE HIT NEXT</small></div></div>`;
    case 'wide': return `<div class="fx ${P}-fx ${P}-flag"><div class="plate"><h1>WIDE</h1></div></div>`;
    case 'maiden': return `<div class="fx ${P}-fx ${P}-flag"><div class="plate"><small>${esc(p.bowlerName || '')}</small><h1>MAIDEN OVER</h1></div></div>`;
    default: return '';
  }
}
