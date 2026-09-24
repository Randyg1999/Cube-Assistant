// ---------- App state / mode ----------
const editSection = document.getElementById('editSection');
const solveSection = document.getElementById('solveSection');
const moveGrid = document.getElementById('moveGrid');

// Learn-mode state is declared up front because reset/switch handlers defined
// earlier in this file may call the stop helpers. Keeping these out of the
// temporal dead zone makes the split-file version robust during initialization.
let algLooping = false;
let algStopRequested = false;
let algLooping2x2 = false;
let algStopRequested2x2 = false;

// Learn-mode state is declared up front because reset/switch handlers defined
// earlier in this file may call the stop helpers. Keeping these out of the
// temporal dead zone makes the split-file version robust during initialization.

function populateMoveGrid(element, moves, options = {}) {
  element.replaceChildren();
  for (const move of moves) {
    const button = document.createElement('button');
    button.className = 'btn';
    button.textContent = options.displayMove ? options.displayMove(move) : move;
    const description = options.describeMove ? options.describeMove(move) : move;
    button.title = description;
    button.setAttribute('aria-label', description);
    button.addEventListener('click', () => { options.onMove?.(move); queueMove(options.toInternalMove ? options.toInternalMove(move) : move); });
    // Direction-arrow preview on the cube (js/cube/move-hints.js). The internal
    // move is resolved each time the arrows are drawn, not once here, so the
    // 3x3's held-orientation remap is always current.
    if (options.hints) {
      const internalMove = () => options.toInternalMove ? options.toInternalMove(move) : move;
      const on = () => { if (!button.disabled) window.MoveHints?.show(internalMove); };
      const off = () => window.MoveHints?.hide();
      button.addEventListener('pointerenter', e => { if (e.pointerType === 'mouse') on(); });
      button.addEventListener('pointerleave', off);
      button.addEventListener('focus', () => { if (button.matches(':focus-visible')) on(); });
      button.addEventListener('blur', off);
    }
    element.appendChild(button);
  }
}

