// ---------- Guided solve (2x2) ----------
// Planning only. Playback — state machine, HUD, Next/Auto-Play/Back, speed,
// error box, stale handling — comes from js/cube/solve-playback.js.
//
// Methods are declared in js/2x2/methods-2x2.js and dispatched here; each one
// owns its own solver and shares no solving code with any other method or
// puzzle. Beginner Solve is the two-stage instructional method; Shortest Move
// Solve calls js/2x2/solver2x2-optimal.js.
//
// Display uses raw move names throughout, same as the 2x2 manual move grid: no
// held-orientation remap, since that depends on reading a fixed center's color
// and a 2x2 has none.

function planSolve2x2() {
  const verification = E.verifyPieceComposition2x2(cubeState);
  if (!verification.valid) {
    throw new Error('This isn\u2019t a valid cube state yet \u2014 use Verify Cube above to see exactly what\u2019s wrong.');
  }

  const solveMethod = solveMethodSelect.value;
  const debugField = els2x2.cornerDebug;
  const debugDetails = els2x2.cornerDebugDetails;
  const moves = [];
  const stages = [];
  let incomplete = false;
  let warning = null;

  if (solveMethod === '2x2Optimal') {
    const optimal = window.CubeSolver2x2Optimal;
    if (!optimal) throw new Error('The 2x2 Shortest Move solver file is not loaded.');
    const solved = optimal.solve(cubeState);
    solved.forEach(move => { moves.push(move); stages.push({ name: 'Shortest Move Solve' }); });
    if (debugField) {
      debugField.textContent = 'Complete optimal-policy lookup: ' + moves.length +
        ' move' + (moves.length === 1 ? '' : 's') + '. The 2x2 maximum is 11 moves.';
    }
    if (debugDetails) debugDetails.open = false;

  } else if (solveMethod === '2x2Beginner') {
    const flResult = S.solveFirstLayer2x2(cubeState);
    const llResult = flResult.failed
      ? { moves: [], debug: [], failed: false, error: null }
      : S.solveLastLayer2x2(flResult.state);

    const debugLines = (flResult.debug || []).concat(llResult.debug || []);
    if (debugField) debugField.textContent = debugLines.length ? debugLines.join('\n') : 'No guided steps were needed.';
    if (debugDetails) debugDetails.open = true;

    const firstSolution = optimizeMoves(flResult.moves);
    const lastSolution = optimizeMoves(llResult.moves);
    firstSolution.forEach(move => { moves.push(move); stages.push({ name: 'First Layer' }); });
    lastSolution.forEach(move => { moves.push(move); stages.push({ name: 'Last Layer' }); });

    incomplete = Boolean(flResult.failed || llResult.failed);
    if (flResult.failed) {
      warning = 'Guided first-layer logic stopped: ' + flResult.error + '. The available moves are ready up to this point.';
    } else if (llResult.failed) {
      warning = 'Guided last-layer logic stopped: ' + llResult.error + '. The available moves are ready up to this point.';
    }

  } else {
    throw new Error('Unknown 2x2 solve method: ' + solveMethod);
  }

  return { moves, stages, incomplete, warning };
}

const els2x2 = sidebarElements('2x2', [
  'solveSection', 'hudStep', 'hudMove', 'hudDesc', 'progressFill',
  'nextMoveBtn', 'autoPlayBtn', 'backMoveBtn',
  'speedSlider', 'speedValue', 'cornerDebug', 'cornerDebugDetails', 'moveGrid',
]);

const solvePlayback2x2 = createSolvePlayback({
  section: els2x2.solveSection,
  hudStep: els2x2.hudStep,
  hudMove: els2x2.hudMove,
  hudDesc: els2x2.hudDesc,
  progressFill: els2x2.progressFill,
  nextBtn: els2x2.nextMoveBtn,   // doubles as Compute
  autoBtn: els2x2.autoPlayBtn,
  backBtn: els2x2.backMoveBtn,
  speedSlider: els2x2.speedSlider,
  speedValue: els2x2.speedValue,
  plan: planSolve2x2,
  describe: move => describeMove(move) || '',
  inverse: inverseMove,
  idleDesc: 'Press "Compute Solution" to work out the moves for your scrambled cube.',
  solvedDesc: 'This cube is already solved.',
  doneDesc: 'The cube is solved.',
});

// Kept as a named wrapper: the puzzle registry and the shared reset path call it.
function resetSolveUI2x2(resetHud = true) {
  solvePlayback2x2.reset(resetHud);
}

// A manual turn either matches the displayed step, in which case the guide just
// advances, or it invalidates the computed path.
els2x2.moveGrid.addEventListener('click', event => {
  if (puzzleType !== '2x2') return;
  const button = event.target.closest('button');
  if (!button) return;
  if (!solvePlayback2x2.noteExternalMove(button.textContent.trim())) {
    solvePlayback2x2.markStale('The cube was moved outside the displayed solve step.');
  }
});

// A method change invalidates a previously computed path.
solveMethodSelect?.addEventListener('change', () => {
  if (puzzleType !== '2x2') return;
  solvePlayback2x2.markStale('The 2\u00d72 solve method changed.');
});
