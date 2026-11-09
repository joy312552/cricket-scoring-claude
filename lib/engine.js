// Pure cricket scoring engine. No React, no Supabase, no I/O.
// Authoritative model: an append-only command log per innings. State is ALWAYS
// derivable by folding the log (rebuild), so undo/edit/revert can never drift.

                        
                                                   
                                           
                                            
                                                                
                                                                   
                   
                                   
 
export const defaultRules = (over                 = {})        => ({
  oversLimit: 20, ballsPerOver: 6, playersPerSide: 11, wideRuns: 1, noBallRuns: 1,
  freeHit: true, maxOversPerBowler: null, ...over,
});

                                                             
// wide: runs = additional runs run (penalty is separate). noball: runs = byes/leg-byes run
// off the no-ball (bat runs go in runsBat). bye/legbye: runs = runs run.
                                                        
                                                                                              
                                                                             
                         
                  
                                                      
                                                                   
                   
                                                                                   
 
                     
                                                                  
                                  
                               
                 
                                                                                                        
                        

                                                                                     
                                                                                                   
                                                                                               
                                                                
                                                                                                 
                                                    
                                                                                 
                        
                                                         
                                                    
                                                                                         
                                                                                                      
                                                                      
                                                           
                                                         
                                          
                                                                                                       
 
                                                                                                            
                                                                                            
                                        
// No seq here: the persistence layer assigns the monotonic event_seq in the same DB transaction.
                                                                                  
export class RuleError extends Error { code        ;
  constructor(code        , msg         ) { super(msg ?? code); this.code = code; } }

                                                                                      
                                                                               

const blankBat = ()          => ({ runs: 0, balls: 0, fours: 0, sixes: 0, out: null });
const blankBowl = ()           => ({ legalBalls: 0, runs: 0, wickets: 0, maidens: 0, wides: 0, noBalls: 0, dots: 0, consec: 0 });
const CREDITED              = ['bowled', 'caught', 'caughtAndBowled', 'lbw', 'stumped', 'hitWicket'];
const ON_FREE_HIT              = ['runOut', 'hitBallTwice', 'obstructing'];
const ON_WIDE              = ['runOut', 'stumped', 'hitWicket', 'obstructing'];
const ON_NOBALL              = ['runOut', 'hitBallTwice', 'obstructing'];

export function newInnings(i             )        {
  const batters                          = {};
  batters[i.striker] = blankBat(); batters[i.nonStriker] = blankBat();
  const bowlers                           = {}; bowlers[i.bowler] = blankBowl();
  return { rules: i.rules, battingXI: i.battingXI, bowlingXI: i.bowlingXI, runs: 0, wickets: 0, legalBalls: 0,
    extras: { wide: 0, noball: 0, bye: 0, legbye: 0, penalty: 0 }, striker: i.striker, nonStriker: i.nonStriker,
    bowler: i.bowler, prevBowler: null, batters, bowlers, fow: [], partnership: { runs: 0, balls: 0 },
    freeHit: false, overRuns: 0, overSplit: false, balls: [], target: i.target ?? null,
    status: 'live', endReason: null };
}

const swap = (s       ) => { const t = s.striker; s.striker = s.nonStriker; s.nonStriker = t; };
const overStr = (legal        , bpo        ) => `${Math.floor(legal / bpo)}.${legal % bpo}`;
const need = (c         , code        ) => { if (c) throw new RuleError(code); };

export function step(prev       , cmd         )                                          {
  need(prev.status === 'complete' && cmd.t !== 'swap' ? true : false, 'INNINGS_COMPLETE');
  const s        = structuredClone(prev);
  const ev                = [];
  const bpo = s.rules.ballsPerOver;

  if (cmd.t === 'swap') { swap(s); return { state: s, events: ev }; }
  if (cmd.t === 'dead') return { state: s, events: ev }; // dead ball: logged, nothing counted

  if (cmd.t === 'bowler') {
    need(!s.bowlingXI.includes(cmd.id), 'UNKNOWN_BOWLER');
    need(s.bowler === null && cmd.id === s.prevBowler, 'BOWLER_CANNOT_BOWL_CONSECUTIVE_OVERS');
    const lim = s.rules.maxOversPerBowler;
    need(lim !== null && (s.bowlers[cmd.id]?.legalBalls ?? 0) >= lim * bpo, 'BOWLER_OVER_LIMIT');
    if (s.bowler !== null) s.overSplit = true;
    s.bowler = cmd.id; s.bowlers[cmd.id] ??= blankBowl();
    return { state: s, events: ev };
  }

  if (cmd.t === 'endInnings') { s.status = 'complete'; s.endReason = 'declared';
    ev.push({ type: 'INNINGS_COMPLETED', payload: { runs: s.runs, wickets: s.wickets, reason: 'declared' } });
    return { state: s, events: ev }; }

  if (cmd.t === 'penalty') {
    need(!Number.isInteger(cmd.runs) || cmd.runs < 1, 'BAD_PENALTY');
    s.runs += cmd.runs; s.extras.penalty += cmd.runs; s.partnership.runs += cmd.runs;
    return finish(s, ev, null);
  }

  if (cmd.t === 'retire') {
    const who = cmd.who === 'striker' ? s.striker : s.nonStriker;
    need(!who, 'NO_BATTER');
    if (cmd.kind === 'hurt') s.batters[who ].retiredHurt = true;
    else { s.batters[who ].out = { kind: cmd.kind === 'out' ? 'retiredOut' : 'timedOut', bowler: null };
      s.wickets++; s.fow.push({ wicket: s.wickets, runs: s.runs, batter: who , at: overStr(s.legalBalls, bpo) });
      s.partnership = { runs: 0, balls: 0 }; }
    const allOut = cmd.kind !== 'hurt' && s.wickets >= s.rules.playersPerSide - 1;
    place(s, cmd.who, cmd.incoming, allOut);
    ev.push({ type: 'BATTER_RETIRED', payload: { batter: who, kind: cmd.kind } });
    return finish(s, ev, null);
  }

  // ---- ball ----
  need(!s.bowler, 'NEED_BOWLER');
  need(!Number.isInteger(cmd.runsBat) || cmd.runsBat < 0 || cmd.runsBat > 7, 'BAD_RUNS');
  const ex = cmd.extra;
  if (ex) { need(!Number.isInteger(ex.runs) || ex.runs < 0 || ex.runs > 7, 'BAD_EXTRA_RUNS');
    need((ex.type === 'wide' || ex.type === 'bye' || ex.type === 'legbye') && cmd.runsBat !== 0, 'BAT_RUNS_NOT_ALLOWED');
    need((ex.type === 'bye' || ex.type === 'legbye') && ex.runs < 1, 'BYES_NEED_RUNS'); }
  const legal = !ex || ex.type === 'bye' || ex.type === 'legbye';
  const wasFreeHit = s.freeHit;
  const striker = s.striker , bowlerId = s.bowler ;
  const bat = s.batters[striker], bowl = s.bowlers[bowlerId];

  let extraTotal = 0, bowlerExtra = 0;
  if (ex?.type === 'wide') { extraTotal = s.rules.wideRuns + ex.runs; bowlerExtra = extraTotal; s.extras.wide += extraTotal; bowl.wides += extraTotal; }
  if (ex?.type === 'noball') { extraTotal = s.rules.noBallRuns + ex.runs; bowlerExtra = s.rules.noBallRuns;
    s.extras.noball += s.rules.noBallRuns; s.extras.bye += ex.runs; bowl.noBalls++; }
  if (ex?.type === 'bye') { extraTotal = ex.runs; s.extras.bye += ex.runs; }
  if (ex?.type === 'legbye') { extraTotal = ex.runs; s.extras.legbye += ex.runs; }
  const physical = cmd.runsBat + (ex?.runs ?? 0);
  const ballRuns = cmd.runsBat + extraTotal;
  const bowlerCharge = cmd.runsBat + bowlerExtra;

  if (ex?.type !== 'wide') bat.balls++;
  const before = bat.runs;
  bat.runs += cmd.runsBat;
  const boundary = cmd.runsBat === 4 || cmd.runsBat === 6;
  if (boundary) { if (cmd.runsBat === 4) bat.fours++; else bat.sixes++; }
  s.runs += ballRuns; s.partnership.runs += ballRuns;
  if (legal) { s.legalBalls++; s.partnership.balls++; bowl.legalBalls++; }
  bowl.runs += bowlerCharge; s.overRuns += bowlerCharge;
  if (legal && bowlerCharge === 0) bowl.dots++;
  s.freeHit = (ex?.type === 'noball' && s.rules.freeHit) || (wasFreeHit && !legal);
  if (physical % 2 === 1) swap(s);

  let credited = false, wicketTaken = false;
  if (cmd.wicket) {
    const w = cmd.wicket;
    const allowed = wasFreeHit ? ON_FREE_HIT : ex?.type === 'wide' ? ON_WIDE : ex?.type === 'noball' ? ON_NOBALL : null;
    need(allowed !== null && !allowed.includes(w.kind), 'INVALID_DISMISSAL_FOR_DELIVERY');
    need(['retiredOut', 'timedOut'].includes(w.kind), 'USE_RETIRE_COMMAND');
    need(w.out === 'nonStriker' && !['runOut', 'obstructing'].includes(w.kind), 'ONLY_RUNOUT_FOR_NONSTRIKER');
    need(w.kind === 'caughtAndBowled' && !w.fielder === false && w.fielder !== bowlerId, 'CAB_FIELDER_IS_BOWLER');
    // identify the person out BEFORE the running swap was applied
    const preStriker = physical % 2 === 1 ? s.nonStriker  : s.striker ;
    const preNon = physical % 2 === 1 ? s.striker  : s.nonStriker ;
    const outId = w.out === 'nonStriker' ? preNon : preStriker;
    credited = CREDITED.includes(w.kind);
    s.batters[outId].out = { kind: w.kind, bowler: credited ? bowlerId : null, fielder: w.kind === 'caughtAndBowled' ? bowlerId : w.fielder };
    s.wickets++; wicketTaken = true;
    s.fow.push({ wicket: s.wickets, runs: s.runs, batter: outId, at: overStr(s.legalBalls, bpo) });
    s.partnership = { runs: 0, balls: 0 };
    if (credited) bowl.wickets++;
    if (w.crossed && (w.kind === 'caught' || w.kind === 'caughtAndBowled')) swap(s);
    const end                           = s.striker === outId ? 'striker' : 'nonStriker';
    place(s, end, w.incoming, s.wickets >= s.rules.playersPerSide - 1);
    ev.push({ type: 'WICKET_TAKEN', payload: { batter: outId, kind: w.kind, bowler: credited ? bowlerId : null,
      fielder: w.fielder ?? null, runs: s.runs, wickets: s.wickets, freeHit: wasFreeHit } });
  }
  if (legal) bowl.consec = credited ? bowl.consec + 1 : 0;
  else if (credited) bowl.consec++;
  if (credited && bowl.consec === 3) ev.push({ type: 'HAT_TRICK', payload: { bowler: bowlerId } });

  const sym = cmd.wicket ? 'W' : ex ? ({ wide: 'Wd', noball: 'Nb', bye: 'B', legbye: 'Lb' }         )[ex.type] + (ballRuns > (ex.type === 'wide' ? 1 : ex.type === 'noball' ? 1 : 0) ? ballRuns : '') : String(cmd.runsBat);
  s.balls.push({ over: Math.floor((s.legalBalls - (legal ? 1 : 0)) / bpo), ball: ((s.legalBalls - (legal ? 1 : 0)) % bpo) + 1,
    legal, sym, runs: ballRuns, bowler: bowlerId, striker, wicket: wicketTaken });

  const snap = { runs: s.runs, wickets: s.wickets, over: overStr(s.legalBalls, bpo) };
  if (cmd.runsBat === 4 && !ex?.type?.match(/^(wide|bye|legbye)$/)) ev.push({ type: 'FOUR_SCORED', payload: { batter: striker, ...snap } });
  if (cmd.runsBat === 6 && !ex?.type?.match(/^(wide|bye|legbye)$/)) ev.push({ type: 'SIX_SCORED', payload: { batter: striker, ...snap } });
  if (ex?.type === 'noball') ev.push({ type: 'NO_BALL', payload: { ...snap, freeHit: s.freeHit } });
  if (ex?.type === 'wide') ev.push({ type: 'WIDE', payload: snap });
  if (before < 50 && bat.runs >= 50 && bat.runs < 100) ev.push({ type: 'FIFTY_REACHED', payload: { batter: striker, runs: bat.runs, balls: bat.balls } });
  if (before < 100 && bat.runs >= 100) ev.push({ type: 'CENTURY_REACHED', payload: { batter: striker, runs: bat.runs, balls: bat.balls } });

  if (legal && s.legalBalls % bpo === 0) {
    swap(s);
    if (s.overRuns === 0 && !s.overSplit) { bowl.maidens++; ev.push({ type: 'MAIDEN_OVER', payload: { bowler: bowlerId } }); }
    ev.push({ type: 'OVER_COMPLETED', payload: { over: s.legalBalls / bpo, bowler: bowlerId, runs: s.runs, wickets: s.wickets } });
    s.prevBowler = bowlerId; s.bowler = null; s.overRuns = 0; s.overSplit = false;
  }
  return finish(s, ev, null);
}

function place(s       , end                          , incoming                    , allOut         ) {
  if (allOut) { s[end] = null; return; }
  need(!incoming, 'NEED_INCOMING_BATTER');
  need(!s.battingXI.includes(incoming ), 'UNKNOWN_BATTER');
  need(!!s.batters[incoming ], 'BATTER_ALREADY_BATTED');
  s.batters[incoming ] = blankBat(); s[end] = incoming ;
}

function finish(s       , ev               , _x      ) {
  if (s.status === 'live') {
    if (s.target !== null && s.runs >= s.target) { s.status = 'complete'; s.endReason = 'targetReached';
      ev.push({ type: 'TARGET_REACHED', payload: { runs: s.runs, wickets: s.wickets } }); }
    else if (s.wickets >= s.rules.playersPerSide - 1) { s.status = 'complete'; s.endReason = 'allOut'; }
    else if (s.legalBalls >= s.rules.oversLimit * s.rules.ballsPerOver) { s.status = 'complete'; s.endReason = 'oversDone'; }
    if (s.status === 'complete') ev.push({ type: 'INNINGS_COMPLETED', payload: { runs: s.runs, wickets: s.wickets, reason: s.endReason } });
  }
  return { state: s, events: ev };
}

// ---- Session: command log is the source of truth ----
                                                              
export function rebuild(init             , log           )        {
  let st = newInnings(init); for (const c of log) st = step(st, c).state; return st;
}
export function dispatch(sess         , cmd         ) {
  const cur = rebuild(sess.init, sess.log);
  const r = step(cur, cmd);
  return { session: { init: sess.init, log: [...sess.log, cmd] }, state: r.state, events: r.events };
}
// Corrections return NO celebratory events: replayed history must never re-fire graphics.
export function undo(sess         ) {
  need(sess.log.length === 0, 'NOTHING_TO_UNDO');
  const log = sess.log.slice(0, -1);
  return { session: { init: sess.init, log }, state: rebuild(sess.init, log), events: []                  };
}
export function editAt(sess         , index        , cmd         ) {
  need(index < 0 || index >= sess.log.length, 'BAD_INDEX');
  const log = sess.log.map((c, i) => (i === index ? cmd : c));
  return { session: { init: sess.init, log }, state: rebuild(sess.init, log), events: []                  }; // throws if later commands become invalid
}

// ---- Derived view ----
export function derive(s       ) {
  const bpo = s.rules.ballsPerOver, total = s.rules.oversLimit * bpo, left = Math.max(0, total - s.legalBalls);
  const crr = s.legalBalls ? (s.runs * bpo) / s.legalBalls : 0;
  const required = s.target !== null ? Math.max(0, s.target - s.runs) : null;
  return { score: `${s.runs}/${s.wickets}`, overs: overStr(s.legalBalls, bpo), crr: +crr.toFixed(2),
    ballsRemaining: left, runsRequired: required,
    rrr: required !== null && left > 0 ? +((required * bpo) / left).toFixed(2) : null,
    lastSix: s.balls.slice(-6).map(b => b.sym),
    economy: (id        ) => { const b = s.bowlers[id]; return b && b.legalBalls ? +((b.runs * bpo) / b.legalBalls).toFixed(2) : 0; },
    strikeRate: (id        ) => { const b = s.batters[id]; return b && b.balls ? +((b.runs * 100) / b.balls).toFixed(2) : 0; } };
}

export function matchResult(first                                   , second       , names                  , playersPerSide = 11) {
  if (second.status !== 'complete') return { status: 'inProgress'          };
  if (second.runs > first.runs) return { status: 'won'         , winner: names[1], by: 'wickets', margin: playersPerSide - 1 - second.wickets };
  if (second.runs === first.runs) return { status: 'tie'          };
  return { status: 'won'         , winner: names[0], by: 'runs', margin: first.runs - second.runs };
}
