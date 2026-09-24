// ---------- Guided solve (3x3) ----------
// Planning only. Playback — state machine, HUD, Next/Auto-Play/Back, speed,
// error box, stale handling — comes from js/cube/solve-playback.js.
//
// Each method branch below is unchanged solving logic. What was removed is the
// identical twelve-line "install this plan into the HUD" epilogue that each
// branch repeated.

// Exact shortest-path search performed before Kociemba. Change this one
// value to lower the cutoff; the exact-search module splits the work
// automatically between the live cube and solved cube.
const EXACT_SEARCH_DEPTH = 8;

// Builds the flat move list plus a per-move stage label from a solver that
// returns named stages. optimizeMoves is applied within each stage only: it can
// merge turns across a stage boundary, which would attach a wrong stage label.
function stagesToPlan3x3(resultStages) {
  const moves = [];
  const stages = [];
  for (const stage of (resultStages || [])) {
    const stageMoves = optimizeMoves(stage.moves || []);
    for (const move of stageMoves) {
      moves.push(move);
      stages.push({ name: stage.name });
    }
  }
  return { moves, stages };
}

async function planSolve3x3(hud) {
  const verification = E.verifyPieceComposition(cubeState);
  if (!verification.valid) {
    throw new Error('This isn\u2019t a valid cube state yet \u2014 use Verify Cube to see exactly what\u2019s wrong.');
  }

  // Sticker clicks change colors but not the ori matrices, and some solvers
  // (CFOP's cross search, for one) match pieces by id/pos/ori. Every method
  // below plans from a copy rebuilt from the visible colors, which is identical
  // piece for piece to the same state reached by real moves. Only planning uses
  // it; playback turns the live cube, which shows exactly the same colors.
  const normalized = E.normalizeFromStickers3x3(cubeState);
  if (normalized.errors.length) throw new Error(normalized.errors[0].message);
  const planState = normalized.state;

  // White-first human methods (Beginner, CFOP) build their first layer on the
  // bottom, but the cube rests white-up in the standard orientation. They plan
  // on a copy turned over (white down, yellow up, green front — the frame they
  // were written and validated in) and their moves are translated back to the
  // real cube. The held orientation turns over to match, which is exactly what a
  // cuber does after scrambling, so the move names shown are the ones for the
  // cube as you are now holding it. Their debug lines are in that same frame.
  function planWhiteDown(solver) {
    const result = solver.solve(E.flipToWhiteDown(planState));
    const stages = (result.stages || []).map(stage => ({
      ...stage,
      moves: (stage.moves || []).map(E.moveFromWhiteDown),
    }));
    const turned = setHoldingOrientation('G', 'Y');
    const note = turned
      ? ['Turned the cube over: white is now on the bottom, yellow on top, green still in front (a z2). Hold your cube the same way.']
      : [];
    return { plan: stagesToPlan3x3(stages), debug: note.concat(result.debug || []) };
  }

  const solveMethod = document.getElementById('solveMethodSelect').value;
  const debugField = els3x3.cornerDebug;
  const debugDetails = els3x3.cornerDebugDetails;

  // Standard Beginner is a dedicated 3x3 module. It does not call the CFOP or
  // Kociemba solvers, and the dispatcher does not share solving phases between
  // methods.
  if (solveMethod === 'standard') {
    const beginner = window.CubeSolver3x3Beginner;
    if (!beginner) throw new Error('The Standard Beginner solver file is not loaded.');
    hud.hudStep.textContent = 'Computing Beginner solve\u2026';
    hud.hudDesc.textContent = 'White Cross \u2192 White Corners \u2192 Second Layer \u2192 Last Layer.';

    const { plan, debug } = planWhiteDown(beginner);
    if (debugField) {
      debugField.textContent = ['Standard Beginner', 'Moves: ' + plan.moves.length]
        .concat(debug).join('\n');
    }
    if (debugDetails) debugDetails.open = true;
    return { ...plan, incomplete: false };
  }

  // CFOP path: Cross -> F2L pairs -> OLL -> PLL using the dedicated
  // human-oriented CFOP solver. It returns stage labels for the HUD.
  if (solveMethod === 'cfop') {
    const cfop = window.CubeSolver3x3CFOP;
    if (!cfop) throw new Error('The CFOP solver file is not loaded.');
    hud.hudStep.textContent = 'Computing CFOP solve\u2026';
    hud.hudDesc.textContent = 'Building Cross, F2L, OLL and PLL stages.';
    hud.progressFill.style.width = '0%';

    const { plan, debug } = planWhiteDown(cfop);
    if (debugField) {
      debugField.textContent = ['CFOP (human speedsolve structure)', 'Moves: ' + plan.moves.length]
        .concat(debug).join('\n');
    }
    if (debugDetails) debugDetails.open = true;
    return { ...plan, incomplete: false };
  }

  // Kociemba / two-phase path, with a bidirectional exact search first.
  if (solveMethod === 'kociemba') {
    const search = window.CubeSolver3x3Search;
    const bridge = window.CubeSolverBridge;
    if (!search || !bridge) throw new Error('The Kociemba solver files are not loaded.');

    if (!search.isReady()) {
      hud.hudStep.textContent = 'Preparing Kociemba tables\u2026';
      hud.hudDesc.textContent = 'Building the two-phase lookup tables. This only happens once per page load.';
      await search.prepare((label, index, total) => {
        hud.hudStep.textContent = 'Preparing Kociemba tables \u2014 ' + (index + 1) + ' of ' + total;
        hud.hudDesc.textContent = label;
        hud.progressFill.style.width = Math.round(index / total * 100) + '%';
      });
    }

    hud.hudStep.textContent = `Checking exact solutions \u2264 ${EXACT_SEARCH_DEPTH} moves\u2026`;
    hud.hudDesc.textContent = 'Trying a bidirectional shortest-path search before Kociemba.';
    hud.progressFill.style.width = '0%';

    const exactSolver = window.CubeSolver3x3Exact;
    const exact = exactSolver ? exactSolver.find(planState, EXACT_SEARCH_DEPTH) : { found: false };

    if (exact.found) {
      const moves = exact.moves.slice();
      const stages = moves.map(() => ({ name: 'Exact Short Solve' }));
      if (debugField) {
        debugField.textContent = [
          `Exact shortest path (depth \u2264 ${EXACT_SEARCH_DEPTH})`,
          'Moves: ' + moves.length,
          'Exact pre-search: ' + Number(exact.ms || 0).toFixed(1) + ' ms',
          'Pre-search nodes: ' + (exact.nodes ?? '?'),
          'Kociemba handoff: not needed',
        ].join('\n');
      }
      if (debugDetails) debugDetails.open = true;
      return { moves, stages, incomplete: false };
    }

    hud.hudStep.textContent = 'Computing Kociemba solve\u2026';
    hud.hudDesc.textContent = `No solution within ${EXACT_SEARCH_DEPTH} moves; handing off to the two-phase solver.`;
    const result = bridge.solveFewestMoves(planState, {
      timeLimitMs: 1200,
      targetLength: 21,
      maxPhase1: 12,
    });
    if (result.error) throw new Error(result.error);

    const moves = optimizeMoves(result.moves || []);
    const boundary = Math.min(result.phaseBoundary ?? moves.length, moves.length);
    const stages = moves.map((_, i) => ({
      name: i < boundary ? 'Kociemba \u2014 Phase 1' : 'Kociemba \u2014 Phase 2',
    }));

    if (debugField) {
      const stats = result.stats || {};
      debugField.textContent = [
        'Kociemba Two-Phase',
        'Moves: ' + moves.length,
        `Exact pre-search: no solution \u2264 ${EXACT_SEARCH_DEPTH} (` + Number(exact.ms || 0).toFixed(1) + ' ms)',
        'Phase boundary: ' + boundary,
        'Kociemba search time: ' + (stats.ms ?? '?') + ' ms',
        'Kociemba nodes searched: ' + (stats.nodes ?? '?'),
      ].join('\n');
    }
    if (debugDetails) debugDetails.open = true;
    return { moves, stages, incomplete: false };
  }

  throw new Error('Unknown 3x3 solve method: ' + solveMethod);
}

const els3x3 = sidebarElements('3x3', [
  'solveSection', 'hudStep', 'hudMove', 'hudDesc', 'progressFill',
  'nextMoveBtn', 'autoPlayBtn', 'backMoveBtn',
  'speedSlider', 'speedValue', 'cornerDebug', 'cornerDebugDetails', 'moveGrid',
]);

const solvePlayback3x3 = createSolvePlayback({
  section: els3x3.solveSection,
  hudStep: els3x3.hudStep,
  hudMove: els3x3.hudMove,
  hudDesc: els3x3.hudDesc,
  progressFill: els3x3.progressFill,
  nextBtn: els3x3.nextMoveBtn,   // doubles as Compute
  autoBtn: els3x3.autoPlayBtn,
  backBtn: els3x3.backMoveBtn,
  speedSlider: els3x3.speedSlider,
  speedValue: els3x3.speedValue,
  plan: planSolve3x3,
  displayMove: move => displayMove(move),
  describe: move => describeMove(move) || '',
  inverse: inverseMove,
  idleDesc: 'Press "Compute Solution" to work out the moves for your scrambled cube.',
  solvedDesc: 'This cube is already solved.',
  doneDesc: 'The cube is solved.',
});

// Kept as a named wrapper: the puzzle registry, the state loader and the shared
// reset path all call it.
function resetSolveUI(resetHud = true) {
  solvePlayback3x3.reset(resetHud);
}

function showError(msg) {
  const section = els3x3.solveSection;
  const existing = section.querySelector('.error-box');
  if (existing) existing.remove();
  const box = document.createElement('div');
  box.className = 'error-box';
  box.textContent = msg;
  section.insertBefore(box, section.querySelector('.roadmap'));
}

document.getElementById('loadStateBtn').addEventListener('click', () => {
  const source = document.getElementById('loadStateLine');
  try {
    const loaded = parseCubeStateLine(source.value.trim());
    const verification = E.verifyPieceComposition(loaded);
    if (!verification.valid) throw new Error('The state fails cube validation.');
    // Preserve the existing cubie object references used by meshMap; replace
    // their logical contents in place so the 3D meshes remain connected.
    const loadedById = Object.fromEntries(loaded.cubies.map(c => [c.id, c]));
    cubeState.cubies.forEach(c => {
      const from = loadedById[c.id];
      c.pos = from.pos.slice();
      c.ori = from.ori.map(row => row.slice());
      c.stickers = Object.assign({}, from.stickers);
      c.id = from.id;
    });
    syncAllMeshes();
    cubeState.cubies.forEach(refreshMaterials);
    moveQueue.length = 0;
    animating = false;
    onQueueDrained = null;
    resetSolveUI();
    updateCubeStateLine();
    renderVerifyResult(verification);
    source.value = '';
  } catch (err) {
    showError('Could not load state: ' + err.message);
  }
});

// Manual moves are allowed while a guided solution is visible. Performing
// exactly the displayed move advances the guide without queuing a duplicate;
// anything else makes the existing solution stale.
function handleManual3x3Move(displayedMove) {
  if (solvePlayback3x3.getState() === 'idle') return;
  if (solvePlayback3x3.noteExternalMove(displayedMove)) return;
  solvePlayback3x3.markStale('The cube was moved outside the displayed solve step.');
}

// Bridge used by sticker click-drag turns. Drag controls report the engine's
// internal move, so convert it to the same user-facing notation the HUD shows.
window.Cube3x3GuideDragMove = function (internalMove) {
  if (!internalMove) return;
  handleManual3x3Move(displayMove(internalMove));
};

// Method changes always invalidate a previously computed 3x3 path.
document.getElementById('solveMethodSelect')?.addEventListener('change', () => {
  if (puzzleType !== '3x3') return;
  solvePlayback3x3.markStale('The 3\u00d73 solve method changed.');
});

// The common move-grid code queues the physical move. This listener only keeps
// guided-solve state in sync with that user action.
els3x3.moveGrid.addEventListener('click', event => {
  if (puzzleType !== '3x3') return;
  const button = event.target.closest('button');
  if (!button) return;
  handleManual3x3Move(button.textContent.trim());
});
