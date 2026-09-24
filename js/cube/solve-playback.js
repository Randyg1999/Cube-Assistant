// ---------- Shared guided-solve playback ----------
// One state machine and one set of playback controls for every puzzle. Each
// puzzle supplies its own planner; nothing puzzle-specific lives here.
//
// This replaces three hand-written copies that had drifted apart: the 3x3 had a
// stale state, an error box and per-move stage labels; the 2x2 had most of it;
// the 4x4 had none of them. Consolidating means every puzzle gets the full
// behavior, and a new cube size inherits it for free.
//
// States: idle -> ready -> done, plus stale when the cube or method changes
// underneath a computed solution. The previous move list is deliberately kept
// in memory when stale so it stays available for diagnostics, but it cannot be
// stepped through until recomputed.
//
// The compute control is either a dedicated button (computeBtn) or the Next
// button doing double duty when no separate one exists, which is how the 3x3
// and 2x2 have always worked.

function createSolvePlayback(config) {
  const {
    section,                       // container, used to place the error box
    hudStep, hudMove, hudDesc, progressFill,
    nextBtn, autoBtn, backBtn,
    computeBtn = null,             // null means nextBtn doubles as compute
    speedSlider = null, speedValue = null,
    plan,                          // async () => { moves, stages, incomplete }
    displayMove = m => m,
    describe = () => '',
    inverse,                       // (move) => move
    idleDesc = 'Press "Compute Solution" to plan a solution.',
    computeLabel = 'Compute Solution',
    solvedDesc = 'This puzzle is already solved.',
    doneDesc = 'Solved.',
    autoDelayMs = 700,
  } = config;

  let state = 'idle';              // idle | ready | done | stale
  let moves = [];
  let stages = [];
  let index = 0;
  let incomplete = false;
  let autoPlaying = false;
  let autoTimer = null;

  // ---------- helpers ----------
  const stageName = i => {
    const entry = stages[i];
    if (!entry) return 'Solving';
    return typeof entry === 'string' ? entry : entry.name;
  };
  const stepLabel = i => stageName(i) + ' \u2014 move ' + (i + 1) + ' of ' + moves.length;

  function clearError() {
    section?.querySelector('.error-box')?.remove();
  }
  function showError(message) {
    if (!section) return;
    clearError();
    const box = document.createElement('div');
    box.className = 'error-box';
    box.textContent = message;
    section.insertBefore(box, section.querySelector('.roadmap'));
  }

  function stopAuto() {
    autoPlaying = false;
    clearTimeout(autoTimer);
    autoTimer = null;
    autoBtn.textContent = 'Auto-Play';
  }

  function setComputeAffordance(enabled) {
    if (computeBtn) {
      computeBtn.disabled = !enabled;
      computeBtn.textContent = computeLabel;
    } else {
      nextBtn.textContent = computeLabel;
      nextBtn.disabled = !enabled;
    }
  }

  // ---------- public: reset ----------
  function reset(resetHud = true) {
    stopAuto();
    state = 'idle';
    moves = [];
    stages = [];
    index = 0;
    incomplete = false;
    setComputeAffordance(true);
    if (computeBtn) nextBtn.disabled = true;
    autoBtn.disabled = true;
    backBtn.disabled = true;
    clearError();
    if (resetHud) {
      hudStep.textContent = 'Ready';
      hudMove.textContent = '\u2014';
      hudDesc.textContent = idleDesc;
      progressFill.style.width = '0%';
    }
  }

  // ---------- public: invalidate ----------
  // Keeps the computed list for diagnostics but makes it impossible to keep
  // following a path that no longer matches the live puzzle.
  function markStale(reason) {
    if (state === 'idle' && moves.length === 0) return;
    state = 'stale';
    stopAuto();
    setComputeAffordance(true);
    if (computeBtn) nextBtn.disabled = true;
    autoBtn.disabled = true;
    backBtn.disabled = true;
    hudStep.textContent = 'Solution changed';
    hudDesc.textContent = reason +
      ' The previous solution is retained, but recompute from the current state before continuing.';
  }

  // ---------- HUD ----------
  function showCurrent() {
    backBtn.disabled = index <= 0;
    progressFill.style.width = (index / moves.length * 100) + '%';

    if (index < moves.length) {
      state = 'ready';
      const shown = displayMove(moves[index]);
      hudStep.textContent = stepLabel(index);
      hudMove.textContent = shown;
      const detail = describe(shown);
      hudDesc.textContent = detail ? detail + ' Then tap Next Move.' : 'Then tap Next Move.';
      nextBtn.textContent = 'Next Move';
      nextBtn.disabled = false;
      autoBtn.disabled = false;
      return;
    }

    state = 'done';
    hudStep.textContent = incomplete
      ? stageName(stages.length - 1) + ' \u2014 stopped'
      : 'Solve complete \u2014 ' + moves.length + ' moves';
    hudMove.textContent = '\u2713';
    hudDesc.textContent = incomplete
      ? 'Guided logic stopped here. The state line shows the exact point of failure.'
      : doneDesc;
    nextBtn.disabled = true;
    autoBtn.disabled = true;
    backBtn.disabled = false;
    stopAuto();
  }

  // ---------- compute ----------
  async function compute() {
    if (animating || moveQueue.length) return;
    clearError();
    setComputeAffordance(false);
    hudStep.textContent = 'Computing\u2026';
    hudMove.textContent = '\u2026';

    try {
      const result = await plan({ hudStep, hudMove, hudDesc, progressFill });
      moves = result.moves || [];
      stages = result.stages || [];
      incomplete = Boolean(result.incomplete);
      index = 0;

      setComputeAffordance(true);

      if (!moves.length) {
        state = 'done';
        // A planner can legitimately return nothing because the puzzle is solved,
        // or because its guided logic stopped before finding any move at all.
        hudStep.textContent = incomplete ? 'Guided logic stopped' : 'Solved';
        hudMove.textContent = '\u2713';
        hudDesc.textContent = incomplete
          ? 'No guided moves were available from this state. Inspect the puzzle.'
          : solvedDesc;
        progressFill.style.width = '100%';
        nextBtn.disabled = true;
        autoBtn.disabled = true;
        backBtn.disabled = true;
        if (result.warning) showError(result.warning);
        return;
      }

      state = 'ready';
      showCurrent();
      // A partial plan is still worth playing, but say so rather than letting it
      // look like a complete solve.
      if (result.warning) showError(result.warning);
    } catch (err) {
      // Keep the failure visible. Falling back to the normal Ready display made
      // a solver failure look like nothing had happened.
      stopAuto();
      state = 'idle';
      moves = [];
      stages = [];
      index = 0;
      hudStep.textContent = 'Solve failed';
      hudMove.textContent = '!';
      hudDesc.textContent = err?.message || String(err);
      progressFill.style.width = '0%';
      setComputeAffordance(true);
      if (computeBtn) nextBtn.disabled = true;
      autoBtn.disabled = true;
      backBtn.disabled = true;
      showError('Could not find a solution: ' + (err?.message || String(err)));
      console.error('Solve failed:', err);
    }
  }

  // ---------- stepping ----------
  function playNext() {
    if (state !== 'ready' || index >= moves.length || animating || moveQueue.length) return;
    queueMove(moves[index]);
    index++;
    showCurrent();
  }

  function playBack() {
    if (index <= 0 || animating || moveQueue.length) return;
    stopAuto();
    queueMove(inverse(moves[index - 1]));
    index--;
    state = 'ready';
    showCurrent();
  }

  function autoStep() {
    if (!autoPlaying || state !== 'ready') return;
    if (animating || moveQueue.length) {
      autoTimer = setTimeout(autoStep, 50);
      return;
    }
    playNext();
    if (state === 'ready') autoTimer = setTimeout(autoStep, autoDelayMs / Math.max(solveSpeed, 0.25));
  }

  // Advance the guide without queuing anything, for when the user performs the
  // displayed move themselves via the move grid or a sticker drag. The
  // comparison is in display notation, because that is what the user acted on:
  // the 3x3 remaps moves for the held orientation, so the engine move and the
  // move shown on screen are not always the same string.
  // Returns false when it does not match, leaving the caller to decide (the
  // cube puzzles mark the solution stale).
  function noteExternalMove(shownMove) {
    if (state !== 'ready' || index >= moves.length) return false;
    if (displayMove(moves[index]) !== shownMove) return false;
    index++;
    showCurrent();
    return true;
  }

  // ---------- wiring ----------
  if (computeBtn) {
    computeBtn.addEventListener('click', compute);
    nextBtn.addEventListener('click', playNext);
  } else {
    nextBtn.addEventListener('click', () => {
      if (state === 'idle' || state === 'stale') compute();
      else if (state === 'ready') playNext();
    });
  }

  backBtn.addEventListener('click', playBack);

  autoBtn.addEventListener('click', () => {
    if (state !== 'ready') return;
    autoPlaying = !autoPlaying;
    autoBtn.textContent = autoPlaying ? 'Pause' : 'Auto-Play';
    if (autoPlaying) autoStep();
  });

  if (speedSlider) {
    speedSlider.addEventListener('input', () => {
      solveSpeed = Number(speedSlider.value);
      if (speedValue) {
        speedValue.textContent = solveSpeed.toFixed(2).replace(/0$/, '').replace(/\.$/, '') + '\u00d7';
      }
    });
  }

  reset(false);

  return {
    reset,
    markStale,
    noteExternalMove,
    compute,
    getState: () => state,
    getMoves: () => moves.slice(),
    getIndex: () => index,
  };
}
