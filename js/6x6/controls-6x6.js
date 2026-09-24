// ---------- 6x6 manual move grid and palette ----------
// Grid labels are checked against the engine's generated move table, so a
// mismatch between what the buttons offer and what the engine defines is a
// load-time error rather than a dead button.

(function () {
  const E6 = window.SixBySixEngine;
  const els = sidebarElements('6x6', ['moveGrid', 'swatchLegend', 'resetColorsBtn', 'verifyBtn', 'verifyResult']);
  const grid = els.moveGrid;
  if (!E6 || !grid) return;

  const BASE_ORDER = ['U', 'D', 'R', 'L', 'F', 'B'];
  const labels = [];

  // Outer, then both wide widths, then both inner slices. No M/E/S: an even
  // cube has no layer at coordinate 0.
  for (const face of BASE_ORDER) labels.push(face, face + "'", face + '2');
  for (const face of BASE_ORDER) labels.push(face + 'w', face + "w'", face + 'w2');
  for (const face of BASE_ORDER) labels.push('3' + face + 'w', '3' + face + "w'", '3' + face + 'w2');
  for (const face of BASE_ORDER) labels.push('2' + face, '2' + face + "'", '2' + face + '2');
  for (const face of BASE_ORDER) labels.push('3' + face, '3' + face + "'", '3' + face + '2');

  const missing = labels.filter(name => !E6.MOVES[name]);
  if (missing.length) {
    throw new Error('6x6 move grid lists moves the engine does not define: ' + missing.join(', '));
  }

  populateMoveGrid(grid, labels, { describeMove, toInternalMove: move => move, hints: true });

  // ---------- colour palette ----------
  // Built through the shared swatch builder, so the 6x6 gets the count badges,
  // the Holding Orientation click behaviour and live role labels like every
  // other cube.
  CYCLE_ORDER.forEach(code => buildPaletteSwatch('6x6', code, FACE_ROLE_2X2[code], els.swatchLegend));
  replaceResetButtonWithPresetSelect('resetColorsBtn6x6');

  els.verifyBtn.addEventListener('click', () => {
    renderVerifyResult(CubeVerifier6x6.verify(cubeState), els.verifyResult);
  });
})();
