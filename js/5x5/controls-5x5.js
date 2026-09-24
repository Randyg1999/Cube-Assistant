// ---------- 5x5 manual move grid ----------
// Built from the engine's own generated move lists rather than a hand-written
// label table, so it stays correct by construction. Buttons are grouped outer,
// wide, inner slice, middle.

(function () {
  const E5 = window.FiveByFiveEngine;
  const els = sidebarElements('5x5', ['moveGrid', 'swatchLegend', 'resetColorsBtn', 'verifyBtn', 'verifyResult']);
  const grid = els.moveGrid;
  if (!E5 || !grid) return;

  // Base names only (no ' or 2 variants) in a readable order, then each gets
  // its three buttons the same way the other cubes present them.
  const BASE_ORDER = ['U','D','R','L','F','B'];
  const labels = [];

  for (const face of BASE_ORDER) labels.push(face, face + "'", face + '2');
  for (const face of BASE_ORDER) labels.push(face + 'w', face + "w'", face + 'w2');
  for (const face of BASE_ORDER) labels.push('2' + face, '2' + face + "'", '2' + face + '2');
  for (const slice of ['M','E','S']) labels.push(slice, slice + "'", slice + '2');

  // Guard against the label list and the generated move table drifting apart.
  const missing = labels.filter(name => !E5.MOVES[name]);
  if (missing.length) {
    throw new Error('5x5 move grid lists moves the engine does not define: ' + missing.join(', '));
  }

  populateMoveGrid(grid, labels, {
    describeMove,
    // The 5x5 has fixed centres, so a held-orientation remap would be possible,
    // but displayMove only understands single-letter outer faces. Until that is
    // generalized, 5x5 buttons are shown in engine notation.
    toInternalMove: move => move,
    hints: true,
  });

  // ---------- colour palette ----------
  // Built through the shared swatch builder, so the 5x5 gets the count badges,
  // the Holding Orientation click behaviour and live role labels like every
  // other cube.
  CYCLE_ORDER.forEach(code => buildPaletteSwatch('5x5', code, FACE_ROLE_2X2[code], els.swatchLegend));
  replaceResetButtonWithPresetSelect('resetColorsBtn5x5');

  // No verifier yet. Say so rather than leaving a button that does nothing.
  els.verifyBtn.addEventListener('click', () => {
    renderVerifyResult(CubeVerifier5x5.verify(cubeState), els.verifyResult);
  });
})();
