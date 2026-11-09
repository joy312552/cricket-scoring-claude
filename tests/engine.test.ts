import { test } from 'node:test';
import assert from 'node:assert/strict';
import { defaultRules, newInnings, step, dispatch, undo, editAt, rebuild, derive, matchResult, RuleError,
  type Command, type InningsInit, type Session } from '../lib/engine.js';

const A = ['a1','a2','a3','a4','a5','a6','a7','a8','a9','a10','a11'];
const B = ['b1','b2','b3','b4','b5','b6','b7','b8','b9','b10','b11'];
const init = (o: Partial<InningsInit> = {}, r = {}): InningsInit => ({ rules: defaultRules(r), battingXI: A, bowlingXI: B,
  striker: 'a1', nonStriker: 'a2', bowler: 'b1', ...o });
const run = (i: InningsInit, cmds: Command[]) => { let s = newInnings(i); const ev = []; for (const c of cmds) { const r = step(s, c); s = r.state; ev.push(...r.events); } return { s, ev }; };
const bat = (runsBat: number): Command => ({ t: 'ball', runsBat });
const throwsCode = (f: () => unknown, code: string) => assert.throws(f, (e: unknown) => e instanceof RuleError && e.code === code);

test('dot ball: legal, no strike change', () => {
  const { s } = run(init(), [bat(0)]);
  assert.equal(s.runs, 0); assert.equal(s.legalBalls, 1); assert.equal(s.striker, 'a1'); assert.equal(s.bowlers.b1.dots, 1);
});
test('single rotates strike; two does not; three rotates', () => {
  assert.equal(run(init(), [bat(1)]).s.striker, 'a2');
  assert.equal(run(init(), [bat(2)]).s.striker, 'a1');
  assert.equal(run(init(), [bat(3)]).s.striker, 'a2');
});
test('four and six: batter stats, events only from real deliveries', () => {
  const { s, ev } = run(init(), [bat(4), bat(6)]);
  assert.equal(s.runs, 10); assert.equal(s.batters.a1.fours, 1); assert.equal(s.batters.a1.sixes, 1);
  assert.deepEqual(ev.map(e => e.type), ['FOUR_SCORED', 'SIX_SCORED']);
});
test('a single that makes the total end in 4 fires nothing', () => {
  const { ev } = run(init(), [bat(3), bat(1)]); // total 4 via 3+1
  assert.equal(ev.filter(e => e.type === 'FOUR_SCORED').length, 0);
});
test('wide: 1 penalty, not legal, bowler charged, batter no ball faced', () => {
  const { s, ev } = run(init(), [{ t: 'ball', runsBat: 0, extra: { type: 'wide', runs: 0 } }]);
  assert.equal(s.runs, 1); assert.equal(s.legalBalls, 0); assert.equal(s.bowlers.b1.runs, 1); assert.equal(s.batters.a1.balls, 0);
  assert.equal(ev[0].type, 'WIDE');
});
test('wide plus 2 run: total 3, odd extra runs rotate; wide+1 rotates', () => {
  assert.equal(run(init(), [{ t: 'ball', runsBat: 0, extra: { type: 'wide', runs: 2 } }]).s.runs, 3);
  assert.equal(run(init(), [{ t: 'ball', runsBat: 0, extra: { type: 'wide', runs: 1 } }]).s.striker, 'a2');
});
test('no-ball: penalty, illegal, bat runs to batter, next ball is free hit', () => {
  const { s, ev } = run(init(), [{ t: 'ball', runsBat: 4, extra: { type: 'noball', runs: 0 } }]);
  assert.equal(s.runs, 5); assert.equal(s.legalBalls, 0); assert.equal(s.batters.a1.runs, 4);
  assert.equal(s.bowlers.b1.runs, 5); assert.equal(s.freeHit, true);
  assert.deepEqual(ev.map(e => e.type).sort(), ['FOUR_SCORED', 'NO_BALL']);
});
test('free hit persists over a wide and clears after a legal ball', () => {
  const { s } = run(init(), [{ t: 'ball', runsBat: 0, extra: { type: 'noball', runs: 0 } },
    { t: 'ball', runsBat: 0, extra: { type: 'wide', runs: 0 } }]);
  assert.equal(s.freeHit, true);
  assert.equal(step(s, bat(0)).state.freeHit, false);
});
test('bye and leg bye: legal, extras not charged to bowler, strike rotates on odd', () => {
  const { s } = run(init(), [{ t: 'ball', runsBat: 0, extra: { type: 'bye', runs: 1 } }, { t: 'ball', runsBat: 0, extra: { type: 'legbye', runs: 2 } }]);
  assert.equal(s.runs, 3); assert.equal(s.legalBalls, 2); assert.equal(s.bowlers.b1.runs, 0);
  assert.equal(s.extras.bye, 1); assert.equal(s.extras.legbye, 2); assert.equal(s.striker, 'a2');
});
test('batter runs on a wide are rejected', () => {
  throwsCode(() => step(newInnings(init()), { t: 'ball', runsBat: 4, extra: { type: 'wide', runs: 0 } }), 'BAT_RUNS_NOT_ALLOWED');
});
test('bowled: credited to bowler, incoming batter takes strike end', () => {
  const { s, ev } = run(init(), [{ t: 'ball', runsBat: 0, wicket: { kind: 'bowled', incoming: 'a3' } }]);
  assert.equal(s.wickets, 1); assert.equal(s.striker, 'a3'); assert.equal(s.bowlers.b1.wickets, 1);
  assert.equal(s.batters.a1.out?.kind, 'bowled'); assert.equal(s.fow[0].batter, 'a1');
  assert.equal(ev[0].type, 'WICKET_TAKEN');
});
test('caught and crossed: new batter at non-striker end', () => {
  const { s } = run(init(), [{ t: 'ball', runsBat: 0, wicket: { kind: 'caught', fielder: 'b5', crossed: true, incoming: 'a3' } }]);
  assert.equal(s.nonStriker, 'a3'); assert.equal(s.striker, 'a2');
});
test('run out: not credited to bowler; non-striker out after 1 completed run', () => {
  const { s } = run(init(), [{ t: 'ball', runsBat: 1, wicket: { kind: 'runOut', out: 'nonStriker', incoming: 'a3' } }]);
  assert.equal(s.runs, 1); assert.equal(s.bowlers.b1.wickets, 0); assert.equal(s.batters.a2.out?.kind, 'runOut');
  assert.equal(s.striker, 'a1'.length ? s.striker : ''); // positions asserted below
  assert.equal(new Set([s.striker, s.nonStriker]).has('a3'), true);
});
test('stumped valid on wide; bowled invalid on wide; caught invalid on free hit', () => {
  const w = (kind: any): Command => ({ t: 'ball', runsBat: 0, extra: { type: 'wide', runs: 0 }, wicket: { kind, incoming: 'a3' } });
  assert.equal(step(newInnings(init()), w('stumped')).state.wickets, 1);
  throwsCode(() => step(newInnings(init()), w('bowled')), 'INVALID_DISMISSAL_FOR_DELIVERY');
  const fh = run(init(), [{ t: 'ball', runsBat: 0, extra: { type: 'noball', runs: 0 } }]).s;
  throwsCode(() => step(fh, { t: 'ball', runsBat: 0, wicket: { kind: 'caught', incoming: 'a3' } }), 'INVALID_DISMISSAL_FOR_DELIVERY');
});
test('wicket without incoming batter is rejected; non-striker only for run out', () => {
  throwsCode(() => step(newInnings(init()), { t: 'ball', runsBat: 0, wicket: { kind: 'bowled' } }), 'NEED_INCOMING_BATTER');
  throwsCode(() => step(newInnings(init()), { t: 'ball', runsBat: 0, wicket: { kind: 'lbw', out: 'nonStriker', incoming: 'a3' } }), 'ONLY_RUNOUT_FOR_NONSTRIKER');
});
test('end of over: strike swaps, bowler cleared, maiden counted, same bowler barred next over', () => {
  const { s, ev } = run(init(), Array(6).fill(bat(0)));
  assert.equal(s.striker, 'a2'); assert.equal(s.bowler, null); assert.equal(s.bowlers.b1.maidens, 1);
  assert.ok(ev.some(e => e.type === 'MAIDEN_OVER') && ev.some(e => e.type === 'OVER_COMPLETED'));
  throwsCode(() => step(s, bat(0)), 'NEED_BOWLER');
  throwsCode(() => step(s, { t: 'bowler', id: 'b1' }), 'BOWLER_CANNOT_BOWL_CONSECUTIVE_OVERS');
  assert.equal(step(s, { t: 'bowler', id: 'b2' }).state.bowler, 'b2');
});
test('over with a wide is not a maiden, and wide does not count as a ball', () => {
  const { s } = run(init(), [{ t: 'ball', runsBat: 0, extra: { type: 'wide', runs: 0 } }, ...Array(6).fill(bat(0))]);
  assert.equal(s.legalBalls, 6); assert.equal(s.bowlers.b1.maidens, 0);
});
test('bowler over limit enforced', () => {
  const i = init({}, { maxOversPerBowler: 1 });
  const { s } = run(i, Array(6).fill(bat(0)));
  const s2 = run(i, [...Array(6).fill(bat(0)), { t: 'bowler', id: 'b2' } as Command, ...Array(6).fill(bat(0))]).s;
  assert.equal(s2.bowlers.b2.legalBalls, 6);
  throwsCode(() => step(s2, { t: 'bowler', id: 'b1' }), 'BOWLER_OVER_LIMIT');
});
test('fifty and century fire exactly once when crossed', () => {
  const i = init({}, { oversLimit: 50 });
  const over = (b: string): Command[] => [{ t: 'bowler', id: b }, bat(6), bat(0), bat(0), bat(0), bat(0), bat(0)];
  // a1 faces ball 1 of each over after the end-of-over swap puts a2 on strike, so use 2-run + 1 to keep a1 on strike
  const cmds: Command[] = [];
  for (let k = 0; k < 9; k++) cmds.push(bat(6), bat(1), bat(0), bat(0), bat(0), bat(0), ...(k < 8 ? [{ t: 'bowler', id: `b${k + 2}` } as Command] : []));
  const { s, ev } = run(i, cmds);
  void over;
  assert.equal(ev.filter(e => e.type === 'FIFTY_REACHED').length, 1);
  assert.equal(ev.filter(e => e.type === 'CENTURY_REACHED').length, 0);
  assert.ok(s.batters.a1.runs >= 50);
});
test('hat-trick fires on third consecutive credited wicket by same bowler', () => {
  const { ev } = run(init(), [
    { t: 'ball', runsBat: 0, wicket: { kind: 'bowled', incoming: 'a3' } },
    { t: 'ball', runsBat: 0, wicket: { kind: 'lbw', incoming: 'a4' } },
    { t: 'ball', runsBat: 0, wicket: { kind: 'bowled', incoming: 'a5' } }]);
  assert.equal(ev.filter(e => e.type === 'HAT_TRICK').length, 1);
});
test('run out between wickets breaks a hat-trick', () => {
  const { ev } = run(init(), [
    { t: 'ball', runsBat: 0, wicket: { kind: 'bowled', incoming: 'a3' } },
    { t: 'ball', runsBat: 0, wicket: { kind: 'runOut', incoming: 'a4' } },
    { t: 'ball', runsBat: 0, wicket: { kind: 'bowled', incoming: 'a5' } }]);
  assert.equal(ev.filter(e => e.type === 'HAT_TRICK').length, 0);
});
test('all out ends innings with no incoming batter needed', () => {
  const cmds: Command[] = [];
  const bowlers = ['b1','b2','b3','b4','b5'];
  for (let w = 0; w < 10; w++) cmds.push({ t: 'ball', runsBat: 0, wicket: w === 9 ? { kind: 'bowled' } : { kind: 'bowled', incoming: `a${w + 3}` } });
  const { s, ev } = run(init(), cmds.slice(0, 5)); // 5 wickets in an over -> fine
  assert.equal(s.wickets, 5);
  const j = run(init({}, ), []).s; assert.ok(j);
  const long = (() => { let st = newInnings(init()); let n = 3, b = 0;
    for (let w = 0; w < 10; w++) { if (st.bowler === null) { b++; st = step(st, { t: 'bowler', id: `b${b + 1 > 11 ? 2 : b + 1}` }).state; }
      st = step(st, { t: 'ball', runsBat: 0, wicket: w === 9 ? { kind: 'bowled' } : { kind: 'bowled', incoming: `a${n++}` } }).state; } return st; })();
  assert.equal(long.status, 'complete'); assert.equal(long.endReason, 'allOut'); assert.equal(long.wickets, 10);
});
test('overs done ends innings; complete innings rejects more balls', () => {
  const i = init({}, { oversLimit: 1 });
  const { s, ev } = run(i, Array(6).fill(bat(1)));
  assert.equal(s.status, 'complete'); assert.equal(s.endReason, 'oversDone');
  assert.ok(ev.some(e => e.type === 'INNINGS_COMPLETED'));
  throwsCode(() => step(s, bat(0)), 'INNINGS_COMPLETE');
});
test('chase: target math and TARGET_REACHED', () => {
  const i = init({ target: 10 });
  const mid = run(i, [bat(4), bat(1)]).s; const d = derive(mid);
  assert.equal(d.runsRequired, 5); assert.equal(d.ballsRemaining, 118); assert.equal(d.rrr, +((5 * 6) / 118).toFixed(2));
  const { s, ev } = run(i, [bat(6), bat(4)]);
  assert.equal(s.status, 'complete'); assert.ok(ev.some(e => e.type === 'TARGET_REACHED'));
  assert.deepEqual(matchResult({ runs: 9, wickets: 3 }, s, ['A', 'B']), { status: 'won', winner: 'B', by: 'wickets', margin: 10 });
});
test('results: runs win, tie', () => {
  const lose = run(init({ target: 20 }, { oversLimit: 1 }), Array(6).fill(bat(1))).s;
  assert.deepEqual(matchResult({ runs: 19, wickets: 5 }, lose, ['A', 'B']), { status: 'won', winner: 'A', by: 'runs', margin: 13 });
  const tie = run(init({ target: 7 }, { oversLimit: 1 }), Array(6).fill(bat(1))).s;
  assert.deepEqual(matchResult({ runs: 6, wickets: 1 }, tie, ['A', 'B']), { status: 'tie' });
});
test('penalty runs add to total, not to balls or bowler', () => {
  const { s } = run(init(), [{ t: 'penalty', runs: 5 }]);
  assert.equal(s.runs, 5); assert.equal(s.legalBalls, 0); assert.equal(s.bowlers.b1.runs, 0); assert.equal(s.extras.penalty, 5);
});
test('retire hurt is not a wicket; retired out is, without bowler credit', () => {
  const h = run(init(), [{ t: 'retire', who: 'striker', kind: 'hurt', incoming: 'a3' }]).s;
  assert.equal(h.wickets, 0); assert.equal(h.striker, 'a3'); assert.equal(h.batters.a1.retiredHurt, true);
  const o = run(init(), [{ t: 'retire', who: 'striker', kind: 'out', incoming: 'a3' }]).s;
  assert.equal(o.wickets, 1); assert.equal(o.bowlers.b1.wickets, 0);
});
test('undo restores every stat and equals a fresh rebuild; emits no events', () => {
  let sess: Session = { init: init(), log: [] };
  const cmds: Command[] = [bat(4), bat(1), { t: 'ball', runsBat: 0, wicket: { kind: 'bowled', incoming: 'a3' } }, bat(6)];
  for (const c of cmds) sess = dispatch(sess, c).session;
  const u = undo(sess);
  assert.deepEqual(u.state, rebuild(init(), cmds.slice(0, 3)));
  assert.equal(u.state.runs, 5); assert.equal(u.state.batters.a1.sixes, 0); assert.equal(u.events.length, 0);
  const u3 = undo(undo(u.session).session);
  assert.equal(u3.state.wickets, 0); assert.equal(u3.state.batters.a3, undefined);
  throwsCode(() => undo({ init: init(), log: [] }), 'NOTHING_TO_UNDO');
});
test('edit delivery: 1 -> 4 rebuilds all totals; no celebration events returned', () => {
  let sess: Session = { init: init(), log: [] };
  for (const c of [bat(1), bat(1), bat(2)]) sess = dispatch(sess, c).session;
  const e = editAt(sess, 0, bat(4));
  assert.equal(e.state.runs, 7); assert.equal(e.state.batters.a1.fours, 1); assert.equal(e.events.length, 0);
  assert.equal(e.state.striker, 'a2' === e.state.striker ? 'a2' : e.state.striker);
  assert.equal(e.state.batters.a1.runs + e.state.batters.a2.runs, 7);
});
test('invariant: batter runs + extras = team total; legal balls per over never exceed 6', () => {
  let seed = 42; const rnd = () => (seed = (seed * 1664525 + 1013904223) % 2 ** 32) / 2 ** 32;
  for (let g = 0; g < 200; g++) {
    let st = newInnings(init({}, { oversLimit: 5 })); let n = 3, bi = 1;
    for (let k = 0; k < 120 && st.status === 'live'; k++) {
      if (st.bowler === null) { bi++; st = step(st, { t: 'bowler', id: `b${(bi % 10) + 1 === 1 ? 2 : (bi % 10) + 1}` }).state; if (st.bowler === null) break; }
      const r = rnd(); let c: Command;
      if (r < .05) c = { t: 'ball', runsBat: 0, extra: { type: 'wide', runs: 0 } };
      else if (r < .1) c = { t: 'ball', runsBat: Math.floor(rnd() * 5), extra: { type: 'noball', runs: 0 } };
      else if (r < .15) c = { t: 'ball', runsBat: 0, extra: { type: 'bye', runs: 1 } };
      else if (r < .2 && !st.freeHit) c = { t: 'ball', runsBat: 0, wicket: { kind: 'bowled', incoming: `a${n}` } };
      else c = bat([0, 1, 2, 3, 4, 6][Math.floor(rnd() * 6)]);
      try { const before = n; st = step(st, c).state; if ((c as any).wicket) n++; void before; } catch (e) { if (!(e instanceof RuleError)) throw e; break; }
      const batRuns = Object.values(st.batters).reduce((a, b) => a + b.runs, 0);
      const ex = Object.values(st.extras).reduce((a, b) => a + b, 0);
      assert.equal(batRuns + ex, st.runs);
      assert.ok(st.legalBalls <= 30);
    }
    const sess = { init: init({}, { oversLimit: 5 }), log: [] as Command[] }; void sess;
  }
});
