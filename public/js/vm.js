// Builds the theme-independent view model that every overlay, preview and public page renders.
const overStr = (lb, bpo) => `${Math.floor(lb / bpo)}.${lb % bpo}`;
const ROLE = { batter: 'BAT', bowler: 'BOWL', allrounder: 'AR', keeper: 'WK' };

export function names(doc) {
  const m = {};
  for (const s of ['A', 'B']) for (const p of doc.sides[s].players) m[p.id] = p;
  return m;
}
const dismissText = (b, N) => {
  if (b.retiredHurt && !b.out) return 'retired hurt';
  if (!b.out) return 'not out';
  const bw = b.out.bowler ? N[b.out.bowler]?.name : null, f = b.out.fielder ? N[b.out.fielder]?.name : null;
  switch (b.out.kind) {
    case 'bowled': return `b ${bw}`;
    case 'caught': return `c ${f || 'sub'} b ${bw}`;
    case 'caughtAndBowled': return `c & b ${bw}`;
    case 'lbw': return `lbw b ${bw}`;
    case 'stumped': return `st ${f || ''} b ${bw}`;
    case 'hitWicket': return `hit wkt b ${bw}`;
    case 'runOut': return `run out${f ? ` (${f})` : ''}`;
    case 'retiredOut': return 'retired out';
    case 'timedOut': return 'timed out';
    case 'obstructing': return 'obstructing the field';
    case 'hitBallTwice': return 'hit the ball twice';
    default: return 'out';
  }
};
const sr = (r, b) => (b ? +((r * 100) / b).toFixed(1) : 0);

export function inningsCard(doc, inn) {
  const N = names(doc), st = inn.state, bpo = st.rules.ballsPerOver, bat = inn.side, bowl = bat === 'A' ? 'B' : 'A';
  const batRows = Object.entries(st.batters).map(([id, b]) => ({ id, name: N[id]?.name || id, runs: b.runs, balls: b.balls, fours: b.fours, sixes: b.sixes,
    sr: sr(b.runs, b.balls), out: dismissText(b, N), isOut: !!b.out, strike: id === st.striker, atCrease: id === st.striker || id === st.nonStriker }));
  const yet = st.battingXI.filter(id => !st.batters[id]).map(id => N[id]?.name || id);
  const bowlRows = Object.entries(st.bowlers).map(([id, b]) => ({ id, name: N[id]?.name || id, o: overStr(b.legalBalls, bpo), m: b.maidens, r: b.runs,
    w: b.wickets, econ: b.legalBalls ? +((b.runs * bpo) / b.legalBalls).toFixed(2) : 0, wd: b.wides, nb: b.noBalls, dots: b.dots }));
  const e = st.extras, extra = e.wide + e.noball + e.bye + e.legbye + e.penalty;
  return { side: bat, team: doc.sides[bat].team.short, teamName: doc.sides[bat].team.name, bowlTeam: doc.sides[bowl].team.short,
    runs: st.runs, wkts: st.wickets, overs: overStr(st.legalBalls, bpo), bat: batRows, yetToBat: yet, bowl: bowlRows,
    extras: { total: extra, text: `${extra} (wd ${e.wide}, nb ${e.noball}, b ${e.bye}, lb ${e.legbye}, pen ${e.penalty})` },
    fow: st.fow.map(f => ({ w: f.wicket, runs: f.runs, name: N[f.batter]?.name || f.batter, at: f.at })), status: st.status };
}

export function buildVM(doc, extra = {}) {
  const N = names(doc), T = s => doc.sides[s].team;
  const teamOut = s => ({ name: T(s).name, short: T(s).short, color: T(s).color, color2: T(s).color2, logo: T(s).logo || '' });
  const vm = {
    now: Date.now(),
    match: { id: doc.id, name: doc.name, number: doc.number, venue: doc.venue, date: doc.date, tournament: doc.tournamentName || '', format: doc.format,
      overs: doc.rules.oversLimit, status: doc.status, toss: doc.toss ? `${T(doc.toss.winner).name} won the toss and chose to ${doc.toss.decision}` : '',
      officials: doc.officials || [], bpo: doc.rules.ballsPerOver },
    teams: { A: teamOut('A'), B: teamOut('B') }, innings: doc.status === 'setup' ? 0 : doc.cur + 1, bat: null, score: null, firstInn: null,
    batters: [], bowler: null, thisOver: [], lastSix: [], partnership: { runs: 0, balls: 0 }, fow: [], cards: [], card: null,
    xi: { A: [], B: [] }, result: doc.result || null, potm: null, sponsors: doc.sponsors || [], points: extra.points || null, topScorer: null, topBowler: null,
  };
  for (const s of ['A', 'B']) vm.xi[s] = (doc.xi?.[s] || []).map(id => ({ name: N[id]?.name, role: ROLE[N[id]?.role] || '', jersey: N[id]?.jersey || '',
    cap: doc.captain?.[s] === id, wk: doc.keeper?.[s] === id }));
  if (doc.potm) vm.potm = { name: N[doc.potm]?.name, team: doc.sides.A.players.some(p => p.id === doc.potm) ? T('A').name : T('B').name, line: doc.potmLine || '' };
  vm.cards = doc.innings.map(i => inningsCard(doc, i));
  if (doc.innings.length) {
    const inn = doc.innings[doc.cur], st = inn.state, bpo = st.rules.ballsPerOver, total = st.rules.oversLimit * bpo, left = Math.max(0, total - st.legalBalls);
    vm.bat = inn.side; vm.card = vm.cards[doc.cur];
    const req = st.target != null ? Math.max(0, st.target - st.runs) : null;
    vm.score = { runs: st.runs, wkts: st.wickets, overs: overStr(st.legalBalls, bpo), crr: st.legalBalls ? +((st.runs * bpo) / st.legalBalls).toFixed(2) : 0,
      target: st.target, need: req, ballsLeft: left, rrr: req != null && left > 0 ? +((req * bpo) / left).toFixed(2) : null, freeHit: !!st.freeHit,
      oversLimit: st.rules.oversLimit, complete: st.status === 'complete', reason: st.endReason };
    if (doc.cur === 1 || (doc.innings.length > 1)) { const f = doc.innings[0].state; vm.firstInn = { short: T(doc.innings[0].side).short, runs: f.runs, wkts: f.wickets, overs: overStr(f.legalBalls, f.rules.ballsPerOver) }; }
    vm.batters = vm.card.bat.filter(b => b.atCrease && !b.isOut).sort((a, b) => (b.strike ? 1 : 0) - (a.strike ? 1 : 0));
    const bw = st.bowler || st.prevBowler; const br = vm.card.bowl.find(b => b.id === bw); vm.bowler = br ? { ...br, current: !!st.bowler } : null;
    const curOverNo = Math.floor(st.legalBalls / bpo);
    const startIdx = st.balls.findIndex(b => b.over === curOverNo && true);
    vm.thisOver = st.balls.filter(b => b.over === (st.bowler ? curOverNo : curOverNo - 1)).map(b => b.sym);
    vm.lastSix = st.balls.slice(-6).map(b => b.sym); void startIdx;
    vm.partnership = { ...st.partnership };
    vm.fow = vm.card.fow;
    const topB = [...vm.card.bat].sort((a, b) => b.runs - a.runs)[0]; if (topB && topB.runs > 0) vm.topScorer = topB;
    const topW = [...vm.card.bowl].sort((a, b) => b.w - a.w || a.r - b.r)[0]; if (topW) vm.topBowler = topW;
  }
  return vm;
}

// ---- tournament table ----
export function pointsTable(teams, matches, rules = { win: 2, tie: 1, nr: 1 }) {
  const t = {}; for (const x of teams) t[x.id] = { id: x.id, team: x.short || x.name, name: x.name, p: 0, w: 0, l: 0, t: 0, nr: 0, pts: 0, rf: 0, of: 0, ra: 0, oa: 0 };
  for (const d of matches) {
    if (d.status !== 'complete' || !d.result || d.innings.length < 2) continue;
    const a = d.sides.A.team.id, b = d.sides.B.team.id; if (!t[a] || !t[b]) continue;
    t[a].p++; t[b].p++;
    const winnerSide = d.result.winner;
    if (d.result.kind === 'tie') { t[a].t++; t[b].t++; t[a].pts += rules.tie; t[b].pts += rules.tie; }
    else if (d.result.kind === 'noResult') { t[a].pts += rules.nr; t[b].pts += rules.nr; }
    else if (winnerSide) { const w = winnerSide === 'A' ? a : b, l = winnerSide === 'A' ? b : a; t[w].w++; t[l].l++; t[w].pts += rules.win; }
    if (d.result.kind === 'noResult') continue;
    for (const inn of d.innings.slice(0, 2)) {
      const s = inn.state, bpo = s.rules.ballsPerOver, quota = s.rules.oversLimit;
      const ov = s.endReason === 'allOut' ? quota : s.legalBalls / bpo; // all-out counts full quota
      const bt = inn.side === 'A' ? a : b, bo = inn.side === 'A' ? b : a;
      t[bt].rf += s.runs; t[bt].of += ov; t[bo].ra += s.runs; t[bo].oa += ov;
    }
  }
  return Object.values(t).map(x => ({ ...x, nrr: +(((x.of ? x.rf / x.of : 0) - (x.oa ? x.ra / x.oa : 0))).toFixed(3) }))
    .sort((x, y) => y.pts - x.pts || y.nrr - x.nrr || y.w - x.w);
}
