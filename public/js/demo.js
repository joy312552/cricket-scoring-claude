// Demo match for the homepage and theme gallery. Uses the SAME engine and view-model builder as production.
import { defaultRules, dispatch, newInnings } from './engine.js';
import { buildVM } from './vm.js';
const NA = ['Rafiq Ahmed', 'Tanvir Hasan', 'Imran Khan', 'Sabbir Mia', 'Nayeem Islam', 'Arif Hossain', 'Mahin Sarkar', 'Jubair Ali', 'Faruk Rahman', 'Shuvo Das', 'Kamal Uddin'];
const NB = ['Rakib Chowdhury', 'Shakil Anwar', 'Mehedi Rana', 'Zahid Karim', 'Sohel Parvez', 'Nur Alam', 'Emon Biswas', 'Tarek Aziz', 'Habib Ullah', 'Parvez Reza', 'Liton Paul'];
const mk = (pre, names, roles) => names.map((n, i) => ({ id: pre + i, name: n, role: roles[i] || 'batter', jersey: String(i + 7) }));
export function createDemo() {
  const pa = mk('a', NA, ['batter', 'batter', 'batter', 'keeper', 'allrounder', 'batter', 'allrounder', 'bowler', 'bowler', 'bowler', 'bowler']);
  const pb = mk('b', NB, ['batter', 'batter', 'keeper', 'batter', 'allrounder', 'allrounder', 'bowler', 'bowler', 'bowler', 'bowler', 'bowler']);
  const rules = defaultRules({ oversLimit: 20 });
  const init = { rules, battingXI: pa.map(p => p.id), bowlingXI: pb.map(p => p.id), striker: 'a0', nonStriker: 'a1', bowler: 'b10', target: null };
  const doc = { id: 'demo', name: 'Crease Cup 2026, Match 12', number: '12', venue: 'Shahid Stadium, Mymensingh', date: '2026-11-08T15:00', tournamentName: 'Crease Cup 2026', format: 'T20', rules,
    sides: { A: { team: { id: 'ta', name: 'Brahmaputra Blazers', short: 'BRB', color: '#127a3b', color2: '#ffffff', logo: '' }, players: pa }, B: { team: { id: 'tb', name: 'Padma Strikers', short: 'PDS', color: '#1d3fbf', color2: '#ffe27a', logo: '' }, players: pb } },
    xi: { A: init.battingXI, B: init.bowlingXI }, captain: { A: 'a0', B: 'b0' }, keeper: { A: 'a3', B: 'b2' }, toss: { winner: 'A', decision: 'bat' }, status: 'live', result: null, potm: null, officials: ['Umpire: M. Haque', 'Umpire: S. Dey', 'Referee: A. Karim'],
    sponsors: [{ name: 'Jamuna Telecom', message: 'Connecting every boundary', logo: '' }], innings: [{ side: 'A', init, log: [], state: newInnings(init) }], cur: 0 };
  let n = 0, nextBat = 2, bi = 0;
  const seq = [1, 0, 4, 0, 2, 1, 0, 6, 1, 'W', 0, 1, 4, 0, 1, 2, 0, 0, 6, 1, 4, 'W', 1, 0, 3, 1, 0, 4, 2, 0, 'W', 1, 6, 0, 0, 1, 1, 4, 'Wd', 2, 0, 1, 6, 'Nb4'];
  const api = {
    doc, vm: () => buildVM(doc),
    next() { // returns { events, cmd }
      const inn = doc.innings[0], st = inn.state; if (st.status === 'complete') return { events: [], cmd: null };
      if (st.bowler === null) { bi = (bi + 1) % 4; const bw = ['b10', 'b9', 'b8', 'b7'][bi]; const r = dispatch({ init: inn.init, log: inn.log }, { t: 'bowler', id: bw === st.prevBowler ? 'b6' : bw }); inn.log = r.session.log; inn.state = r.state; }
      const s = seq[n++ % seq.length]; let cmd;
      if (s === 'W') cmd = { t: 'ball', runsBat: 0, wicket: { kind: 'bowled', incoming: 'a' + (nextBat++) } };
      else if (s === 'Wd') cmd = { t: 'ball', runsBat: 0, extra: { type: 'wide', runs: 0 } };
      else if (s === 'Nb4') cmd = { t: 'ball', runsBat: 4, extra: { type: 'noball', runs: 0 } };
      else cmd = { t: 'ball', runsBat: s };
      if (cmd.wicket && nextBat > 10) cmd = { t: 'ball', runsBat: 1 };
      const r = dispatch({ init: inn.init, log: inn.log }, cmd); inn.log = r.session.log; inn.state = r.state;
      const N = Object.fromEntries([...pa, ...pb].map(p => [p.id, p.name]));
      const events = r.events.map(e => ({ ...e, fx: { FOUR_SCORED: 'four', SIX_SCORED: 'six', WICKET_TAKEN: 'wicket', NO_BALL: 'noball', WIDE: 'wide', FIFTY_REACHED: 'fifty', CENTURY_REACHED: 'century', HAT_TRICK: 'hattrick', MAIDEN_OVER: 'maiden' }[e.type],
        payload: { ...e.payload, batterName: N[e.payload.batter], bowlerName: N[e.payload.bowler], team: 'BRB', stat: e.payload.batter ? { ...st2(inn.state, e.payload.batter) } : null } })).filter(e => e.fx);
      return { events, cmd };
    },
  };
  const st2 = (st, id) => { const b = st.batters[id]; return b ? { runs: b.runs, balls: b.balls } : null; };
  return api;
}
export function sampleVM() {
  const d = createDemo(); for (let i = 0; i < 52; i++) d.next();
  const vm = d.vm();
  vm.points = [{ team: 'BRB', p: 5, w: 4, l: 1, t: 0, nrr: 0.842, pts: 8 }, { team: 'PDS', p: 5, w: 3, l: 2, t: 0, nrr: 0.31, pts: 6 }, { team: 'MYK', p: 5, w: 2, l: 3, t: 0, nrr: -0.12, pts: 4 }, { team: 'DHT', p: 5, w: 1, l: 4, t: 0, nrr: -1.02, pts: 2 }];
  vm.potm = { name: NA[0], team: 'Brahmaputra Blazers', line: '78 off 41 balls' }; vm.result = { kind: 'won', text: 'Brahmaputra Blazers won by 24 runs', winner: 'A' };
  return vm;
}
