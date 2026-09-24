// ---------- Guided solve (4x4) ----------
// Planning only. All playback — state machine, HUD, Next/Auto-Play/Back, speed,
// error box, stale handling — comes from js/cube/solve-playback.js, shared with
// every other puzzle.
//
// One Compute Solution button plans the entire reduction in a single pass:
// centers, then wing pairing, then the reduced 3x3 finish including OLL/PLL
// parity. Each stage's solver has to see the cube as it will be when that stage
// starts, so the plan is built against a scratch clone advanced stage by stage.
// Each solver is handed its own clone, so it does not matter whether a solver
// mutates the state it is given.

function inverseMove4x4(move) {
  if (move.endsWith('2')) return move;
  return move.endsWith("'") ? move.slice(0, -1) : move + "'";
}

// Appends one stage's moves to the combined plan, padding annotations so every
// move has one and tagging each move with the stage it belongs to.
function appendStagePlan4x4(target, plan, stageLabel, defaultAnnotation) {
  const moves = plan.moves || [];
  const annotations = (plan.annotations || []).slice();
  while (annotations.length < moves.length) annotations.push(defaultAnnotation);
  for (let i = 0; i < moves.length; i++) {
    target.moves.push(moves[i]);
    target.stages.push({ name: stageLabel, annotation: annotations[i] });
  }
  return moves;
}

function planSolve4x4() {
  const validation = CubeVerifier4x4.verify(cubeState);
  if (!validation.valid) {
    renderVerifyResult(validation, verifyResult4x4);
    throw new Error('Verify the 4\u00d74 state before solving.');
  }

  const target = { moves: [], stages: [] };
  const scratch = E4.cloneState(cubeState);
  const methodParts = [];

  // Stage 1 — build the six 2x2 center blocks.
  const centerPlan = FourByFourCenterSolver.solveCenters(E4.cloneState(scratch));
  E4.applyMoves(scratch, appendStagePlan4x4(target, centerPlan, 'Centers', 'Human-style center construction'));
  methodParts.push(centerPlan.fallback
    ? 'U2 safety fallback centers'
    : (centerPlan.ordered ? 'Ordered bar planner' : 'Bar planner'));

  if (!FourByFourWingSolver.centersSolved(scratch)) {
    throw new Error('The center stage did not finish with all six centers solved; wing pairing cannot be planned from here.');
  }

  // Stage 2 — pair the twelve wing edges in the fixed teaching order.
  const wingPlan = FourByFourWingSolver.solveWings(E4.cloneState(scratch));
  E4.applyMoves(scratch, appendStagePlan4x4(target, wingPlan, 'Wing pairing', 'Pairing 4\u00d74 wings'));
  methodParts.push('fixed-order wing pairing');

  if (!FourByFourWingSolver.allWingsPaired(scratch)) {
    throw new Error('The wing stage did not finish with all twelve pairs complete; the 3\u00d73 finish cannot be planned from here.');
  }

  // Stage 3 — solve the reduced puzzle as a 3x3, handling parity.
  const reducedPlan = FourByFourReducedSolver.solveReduced(E4.cloneState(scratch));
  E4.applyMoves(scratch, appendStagePlan4x4(target, reducedPlan, '3\u00d73 finish', 'Beginner 3\u00d73 reduction finish'));
  const parity = [];
  if (reducedPlan.ollParity) parity.push('OLL parity');
  if (reducedPlan.pllParity) parity.push('PLL parity');
  methodParts.push('beginner 3\u00d73 finish' + (parity.length ? ' with ' + parity.join(' + ') : ''));

  // A plan that does not end solved is a planning bug, and playing it back
  // would leave the user worse off than when they started.
  if (!E4.isSolved(scratch)) {
    throw new Error('The planned solution did not end in a solved state. No moves were applied.');
  }

  // Cancellation pass. The three stages are planned independently, so waste
  // collects inside each stage and especially at the two seams, where one
  // stage's tail and the next stage's setup often turn the same axis.
  const raw = target.moves.length;
  const optimized = NxNOptimizer.optimize(target.moves, target.stages);

  // Never trust the optimizer over the planner: replay the optimized list and
  // confirm it still solves. If it does not, fall back to the unoptimized plan,
  // which was already verified above.
  let finalMoves = optimized.moves;
  let finalStages = optimized.stages;
  const check = E4.cloneState(cubeState);
  E4.applyMoves(check, finalMoves);
  if (!E4.isSolved(check)) {
    console.error('4x4 optimizer produced a non-solving sequence; using the unoptimized plan.');
    finalMoves = target.moves;
    finalStages = target.stages;
  } else if (finalMoves.length < raw) {
    methodParts.push('cancellation: ' + raw + ' \u2192 ' + finalMoves.length + ' moves');
  }

  clearVerifyResult4x4();
  const debugField = els4x4.cornerDebug;
  const debugDetails = els4x4.cornerDebugDetails;
  if (debugField) {
    debugField.textContent = [
      'Reduction plan',
      'Centers: ' + centerPlan.moves.length + ' moves',
      'Wing pairing: ' + wingPlan.moves.length + ' moves',
      '3\u00d73 finish: ' + reducedPlan.moves.length + ' moves',
      'Raw total: ' + raw,
      'After cancellation: ' + finalMoves.length +
        ' (' + (raw ? Math.round((1 - finalMoves.length / raw) * 100) : 0) + '% saved)',
      '',
      methodParts.join(' \u2192 '),
    ].join('\n');
  }
  if (debugDetails) debugDetails.open = true;

  return { moves: finalMoves, stages: finalStages, incomplete: false };
}

const els4x4 = sidebarElements('4x4', [
  'solveSection', 'hudStep', 'hudMove', 'hudDesc', 'progressFill',
  'solveBtn', 'nextMoveBtn', 'autoPlayBtn', 'backMoveBtn',
  'speedSlider', 'speedValue', 'cornerDebug', 'cornerDebugDetails', 'moveGrid',
]);

const solvePlayback4x4 = createSolvePlayback({
  section: els4x4.solveSection,
  hudStep: els4x4.hudStep,
  hudMove: els4x4.hudMove,
  hudDesc: els4x4.hudDesc,
  progressFill: els4x4.progressFill,
  computeBtn: els4x4.solveBtn,
  nextBtn: els4x4.nextMoveBtn,
  autoBtn: els4x4.autoPlayBtn,
  backBtn: els4x4.backMoveBtn,
  speedSlider: els4x4.speedSlider,
  speedValue: els4x4.speedValue,
  plan: planSolve4x4,
  describe: move => describeMove(move) || '',
  inverse: inverseMove4x4,
  idleDesc: 'Press "Compute Solution" to plan the full reduction: centers, wing pairing, parity, and the beginner 3\u00d73 finish.',
  solvedDesc: 'This 4\u00d74 is already solved.',
  doneDesc: 'Reduction complete: centers, paired wings, parity handling and the 3\u00d73 finish are all solved.',
  autoDelayMs: 620,
});

// The registry and the shared reset path still call this name.
function resetCenterSolveUI4x4(resetHud = true) {
  solvePlayback4x4.reset(resetHud);
}
window.resetCenterSolveUI4x4 = resetCenterSolveUI4x4;

// A manual turn invalidates a computed reduction, exactly as it does on the 3x3.
els4x4.moveGrid.addEventListener('click', () => {
  if (puzzleType !== '4x4') return;
  solvePlayback4x4.markStale('The cube was turned manually.');
});
