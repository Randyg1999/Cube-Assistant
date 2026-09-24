// ---------- Color legend ----------
// Colors (HEX) are shared across both sidebars — editing a swatch in one place
// should stay in sync everywhere, since it's a display preference, not something
// tied to which cube type is active.
const allPaletteInputs = []; // {code, input} across the 3x3, 2x2 and 4x4 legends
const allPaletteCounts = []; // {code, badge} — live sticker-count readouts
const colorPresetSelects = [];
window.CUBE_APPEARANCE_MODE = window.CUBE_APPEARANCE_MODE || 'standard';

const COLOR_PRESETS = {
  classic: {
    label: "Classic Rubik's",
    appearance: 'standard',
    colors: { W:'#ffffff', Y:'#ffd500', R:'#b71234', O:'#ff5800', G:'#009b48', B:'#0046ad' }
  },
  highContrast: {
    label: 'High Contrast',
    appearance: 'standard',
    colors: { W:'#ffffff', Y:'#ffe600', R:'#d50000', O:'#ff6d00', G:'#00a83b', B:'#003cff' }
  },
  pastel: {
    label: 'True Pastel',
    appearance: 'standard',
    colors: { W:'#fffaf2', Y:'#f7eca3', R:'#f4a8b8', O:'#f7c8a4', G:'#b8e6c1', B:'#b9cdf8' }
  },
  mirror: {
    label: 'Mirror',
    appearance: 'mirror',
    colors: { W:'#e7e8ec', Y:'#d8bc63', R:'#c88a96', O:'#cb9363', G:'#88b49a', B:'#8198cb' }
  }
};

function setCubeAppearanceMode(mode = 'standard') {
  window.CUBE_APPEARANCE_MODE = mode;
}

function syncPresetSelects(value) {
  colorPresetSelects.forEach(select => { select.value = value; });
}

// ---------- Live sticker-count readout ----------
// Each swatch carries a bold count of how many stickers of that color are
// currently on the cube. Black means the count is right, red means it is not.
// This is the same information Verify gives, available at a glance while you
// are still entering colors.
//
// The expected count is N squared, taken from the puzzle registry, so a 5x5
// wants 25 and a 6x6 wants 36 with no change here.
function makeSwatchCountBadge(code) {
  const badge = document.createElement('div');
  badge.className = 'swatch-count';
  allPaletteCounts.push({ code, badge });
  return badge;
}

// Wraps a color input so the count can sit centered on top of it regardless of
// the input's rendered size.
function makeSwatchWell(input, code) {
  const well = document.createElement('div');
  well.className = 'swatch-well';
  well.append(input, makeSwatchCountBadge(code));
  return well;
}

function updateSwatchCounts() {
  if (!allPaletteCounts.length) return;
  const entry = (typeof PUZZLES !== 'undefined') ? PUZZLES[puzzleType] : null;
  if (!entry?.isNxN || !cubeState?.cubies) return;

  const expected = entry.size * entry.size;
  const counts = cubeEngineForType().colorCounts(cubeState);

  for (const { code, badge } of allPaletteCounts) {
    const n = counts[code] || 0;
    badge.textContent = String(n);
    badge.classList.toggle('bad', n !== expected);
    badge.title = n === expected
      ? `${n} stickers — correct for a ${entry.size}x${entry.size}`
      : `${n} stickers — a ${entry.size}x${entry.size} needs ${expected}`;
  }
}

function setColorAndSync(code, hexValue){
  HEX[code] = hexValue;
  allPaletteInputs.forEach(p => {
    if (p.code === code){ p.input.value = hexValue; p.input.style.backgroundColor = hexValue; }
  });
  syncPresetSelects('custom');
  cubeState.cubies.forEach(refreshMaterials);
  updateNet(true);
}

function applyColorPreset(presetKey){
  const preset = COLOR_PRESETS[presetKey];
  if (!preset) return;
  Object.assign(HEX, preset.colors);
  setCubeAppearanceMode(preset.appearance || 'standard');
  allPaletteInputs.forEach(({code, input}) => {
    input.value = HEX[code];
    input.style.backgroundColor = HEX[code];
  });
  syncPresetSelects(presetKey);
  cubeState.cubies.forEach(refreshMaterials);
  updateNet(true);
}

function replaceResetButtonWithPresetSelect(buttonId) {
  const button = document.getElementById(buttonId);
  if (!button) return null;

  const select = document.createElement('select');
  select.className = button.className;
  select.title = 'Choose a cube color / finish preset';
  select.setAttribute('aria-label', 'Cube color / finish preset');
  select.style.cursor = 'pointer';

  for (const [key, preset] of Object.entries(COLOR_PRESETS)) {
    const option = document.createElement('option');
    option.value = key;
    option.textContent = preset.label;
    select.appendChild(option);
  }
  const custom = document.createElement('option');
  custom.value = 'custom';
  custom.textContent = 'Custom';
  custom.disabled = true;
  select.appendChild(custom);

  select.addEventListener('change', () => applyColorPreset(select.value));
  button.replaceWith(select);
  colorPresetSelects.push(select);
  return select;
}

// Per-puzzle swatch labels, so the Holding Orientation roles update on
// whichever cube is showing rather than only on the 3x3.
const paletteLabelsByPuzzle = {};

// One swatch: the colour input, its count badge, its role label, and the click
// interception that lets a swatch answer "which face is Front?" while Set Front
// or Set Top is armed. Every NxN palette is built through this, so all of them
// behave the same way.
function buildPaletteSwatch(puzzleId, code, labelText, legend) {
  const wrap = document.createElement('div');
  wrap.className = 'swatch-item';

  const input = document.createElement('input');
  input.type = 'color';
  input.value = HEX[code];
  input.style.backgroundColor = HEX[code];
  input.title = `Choose the ${String(labelText).toLowerCase()} face color`;
  input.className = 'swatch';
  input.addEventListener('click', event => {
    if (orientationTarget) {
      // Swallow the click so the OS colour picker does not open: right now this
      // swatch means "this colour faces me", not "edit this colour".
      event.preventDefault();
      assignOrientation(code);
    }
  });
  input.addEventListener('input', () => setColorAndSync(code, input.value));

  const label = document.createElement('div');
  label.className = 'swatch-label';
  label.textContent = labelText;

  (paletteLabelsByPuzzle[puzzleId] ||= {})[code] = label;
  allPaletteInputs.push({ code, input });
  wrap.appendChild(makeSwatchWell(input, code));
  wrap.appendChild(label);
  legend.appendChild(wrap);
  return { input, label };
}

const swatchLegend = document.getElementById('swatchLegend');
Object.entries(FACE_LABELS).forEach(([face, labelText]) => {
  const code = E.centerColor(cubeState, face);
  const { input, label } = buildPaletteSwatch('3x3', code, labelText, swatchLegend);
  paletteInputs[code] = input;
  paletteLabels[code] = label;
});
replaceResetButtonWithPresetSelect('resetColorsBtn');

// Canonical face roles for cubes without fixed centres. These describe the
// solved reference orientation — the standard white-top, green-front scheme
// (see CubeEngine.DEFAULT_SCHEME); Holding Orientation rewrites them live.
const FACE_ROLE_2X2 = {
  W:'Up',
  Y:'Down',
  R:'Right',
  O:'Left',
  G:'Front',
  B:'Back'
};

// The same mapping the other way round: which colour belongs on each face in
// the canonical solved orientation. Used as the orientation reference for cubes
// with no fixed centre to read.
const ROLE_TO_FACE = { Up:'U', Down:'D', Left:'L', Right:'R', Front:'F', Back:'B' };
const FACE_DEFAULT_COLOR = {};
Object.entries(FACE_ROLE_2X2).forEach(([code, role]) => {
  FACE_DEFAULT_COLOR[ROLE_TO_FACE[role]] = code;
});

const swatchLegend2x2 = document.getElementById('swatchLegend2x2');
CYCLE_ORDER.forEach(code => buildPaletteSwatch('2x2', code, FACE_ROLE_2X2[code], swatchLegend2x2));
replaceResetButtonWithPresetSelect('resetColorsBtn2x2');

const swatchLegend4x4 = document.getElementById('swatchLegend4x4');
if (swatchLegend4x4) {
  CYCLE_ORDER.forEach(code => buildPaletteSwatch('4x4', code, FACE_ROLE_2X2[code], swatchLegend4x4));
  replaceResetButtonWithPresetSelect('resetColorsBtn4x4');
}

let orientationTarget = null;

// Holding orientation applies to every NxN cube, so the controls are looked up
// per puzzle rather than bound once to the 3x3's buttons.
function orientationEls() {
  const map = (typeof SidebarElements !== 'undefined') ? SidebarElements[puzzleType] : null;
  if (!map || !map.setFrontBtn) return null;
  return map;
}

// Colour of a face for orientation purposes.
//
// Only ODD cubes have a fixed centre piece to read. Oddness comes from the
// puzzle registry, not from an engine flag: the hand-written 2x2/3x3 and 4x4
// engines predate the NxN core and carry no such flag, so testing one sent
// even cubes into centerColor, which looks for a cubie at [1,0,0]. That cubie
// does not exist on a 2x2, and reading it threw.
//
// Even cubes fall back to the canonical face-to-colour mapping, which is the
// right reference there: with no centres, that mapping is fixed and cannot
// drift out of step with the puzzle.
function faceReferenceColor(face) {
  const entry = (typeof PUZZLES !== 'undefined') ? PUZZLES[puzzleType] : null;
  const size = entry?.size ?? 3;

  if (size % 2 === 1) {
    const engine = cubeEngineForType();
    if (typeof engine.centerColor === 'function') {
      const live = engine.centerColor(cubeState, face);
      if (live != null) return live;
    }
  }
  return FACE_DEFAULT_COLOR[face];
}

function faceShowing(color) {
  return Object.keys(FACE_VECTORS).find(face => faceReferenceColor(face) === color);
}

function sameVector(a, b) { return a[0] === b[0] && a[1] === b[1] && a[2] === b[2]; }
function oppositeVector(a, b) { return a[0] === -b[0] && a[1] === -b[1] && a[2] === -b[2]; }
function holdingCrossVector(a, b) { return [a[1]*b[2]-a[2]*b[1], a[2]*b[0]-a[0]*b[2], a[0]*b[1]-a[1]*b[0]]; }

// Shared move-notation helpers used by controls, 3x3 guided solve, and 2x2 guided solve.
function displayMove(moveName) {
  // Slice moves already use their standard notation. They do not map to a
  // single outer-face vector like U/D/R/L/F/B moves do.
  if ('MES'.includes(moveName[0])) return moveName;
  const frontFace = faceShowing(heldFrontColor);
  const topFace = faceShowing(heldTopColor);
  if (!frontFace || !topFace) return moveName;

  const front = FACE_VECTORS[frontFace];
  const top = FACE_VECTORS[topFace];
  const right = holdingCrossVector(top, front);
  const canonicalVector = FACE_VECTORS[moveName[0]];
  const userFaces = {
    F: front, B: front.map(v => -v), U: top, D: top.map(v => -v),
    R: right, L: right.map(v => -v)
  };
  const userFace = Object.keys(userFaces).find(face => sameVector(canonicalVector, userFaces[face]));
  return (userFace || moveName[0]) + moveName.slice(1);
}

function internalMoveForDisplay(moveName) {
  // Slice moves are already expressed in the engine's standard notation.
  if ('MES'.includes(moveName[0])) return moveName;
  const frontFace = faceShowing(heldFrontColor);
  const topFace = faceShowing(heldTopColor);
  if (!frontFace || !topFace) return moveName;

  const front = FACE_VECTORS[frontFace];
  const top = FACE_VECTORS[topFace];
  const right = holdingCrossVector(top, front);
  const userFaces = {
    F: front, B: front.map(v => -v), U: top, D: top.map(v => -v),
    R: right, L: right.map(v => -v)
  };
  const canonicalFace = Object.keys(FACE_VECTORS).find(face => sameVector(FACE_VECTORS[face], userFaces[moveName[0]]));
  return (canonicalFace || moveName[0]) + moveName.slice(1);
}

function describeMove(moveName) {
  const descriptions = {
    U: 'Rotate the top layer to the left.',
    "U'": 'Rotate the top layer to the right',
    U2: 'Rotate the top layer halfway around.',
    D: 'Rotate the bottom layer to the right.',
    "D'": 'Rotate the bottom layer to the left.',
    D2: 'Rotate the bottom layer halfway around.',
    R: 'Rotate the right layer upward.',
    "R'": 'Rotate the right layer downward.',
    R2: 'Rotate the right layer halfway around.',
    L: 'Rotate the left layer downward.',
    "L'": 'Rotate the left layer upward.',
    L2: 'Rotate the left layer halfway around.',
    F: 'Rotate the front layer clockwise.',
    "F'": 'Rotate the front layer counterclockwise.',
    F2: 'Rotate the front layer halfway around.',
    B: 'Rotate the back layer to the left.',
    "B'": 'Rotate the back layer to the right.',
    B2: 'Rotate the back layer halfway around.',
    M: 'Rotate the middle layer between R and L in the same direction as L.',
    "M'": 'Rotate the middle layer between R and L opposite the direction of L.',
    M2: 'Rotate the middle layer halfway around.',
    E: 'Rotate the equatorial layer between U and D in the same direction as D.',
    "E'": 'Rotate the equatorial layer between U and D opposite the direction of D.',
    E2: 'Rotate the equatorial layer halfway around.',
    S: 'Rotate the standing layer between F and B in the same direction as F.',
    "S'": 'Rotate the standing layer between F and B opposite the direction of F.',
    S2: 'Rotate the standing layer halfway around.'
  };
  if (descriptions[moveName]) return descriptions[moveName];
  const m = moveName.match(/^(2?[URFDLB]|[URFDLB]w)(2|'|)$/);
  if (m) {
    const base=m[1], suffix=m[2];
    const layer=base.startsWith('2') ? 'inner slice' : base.endsWith('w') ? 'two-layer wide turn' : 'outer layer';
    const amount=suffix==='2' ? ' halfway around' : suffix==="'" ? ' counterclockwise' : ' clockwise';
    return `Rotate the ${base.replace(/^2/,'').replace(/w$/,'')} ${layer}${amount}.`;
  }
  return 'Follow along on your physical cube.';
}

function validHoldingOrientation(front, top) {
  const frontFace = faceShowing(front);
  const topFace = faceShowing(top);
  return front !== top && frontFace && topFace && !oppositeVector(FACE_VECTORS[frontFace], FACE_VECTORS[topFace]);
}
function selectOrientationTarget(target) {
  orientationTarget = target;
  const els = orientationEls();
  if (!els) return;
  els.setFrontBtn.classList.toggle('active', target === 'front');
  els.setTopBtn.classList.toggle('active', target === 'top');
  els.orientationStatus.textContent = target
    ? 'Click a colour swatch above to set the ' + (target === 'front' ? 'Front' : 'Top') + ' face.'
    : 'Select Set Front or Set Top, then click a colour swatch above.';
}

function assignOrientation(color) {
  const els = orientationEls();
  const other = orientationTarget === 'front' ? heldTopColor : heldFrontColor;
  if (color === other) {
    if (els) els.orientationStatus.textContent = 'Front and Top must be different adjacent faces.';
    return;
  }
  const front = orientationTarget === 'front' ? color : heldFrontColor;
  const top = orientationTarget === 'top' ? color : heldTopColor;
  if (!validHoldingOrientation(front, top)) {
    if (els) els.orientationStatus.textContent = 'Front and Top cannot be opposite faces.';
    return;
  }
  heldFrontColor = front;
  heldTopColor = top;
  updatePaletteRoleLabels();
  updateCubeViewOrientation();
  refreshMoveTooltips();
  // The 2D net is drawn in the held frame too, so it has to be rebuilt.
  if (typeof updateNet === 'function') updateNet(true);
  selectOrientationTarget(null);
}

// Set the holding orientation from code rather than from the Set Front / Set
// Top buttons. Used by the 3x3 Beginner and CFOP solves to turn the cube over
// to white-down. Returns true if the orientation actually changed.
function setHoldingOrientation(front, top) {
  if (front === heldFrontColor && top === heldTopColor) return false;
  if (!validHoldingOrientation(front, top)) return false;
  heldFrontColor = front;
  heldTopColor = top;
  updatePaletteRoleLabels();
  updateCubeViewOrientation();
  refreshMoveTooltips();
  if (typeof updateNet === 'function') updateNet(true);
  return true;
}

// Wire every generated sidebar's pair of buttons to the same handlers. Only one
// sidebar is visible at a time, so a single orientation state is correct.
if (typeof SidebarElements !== 'undefined') {
  for (const map of Object.values(SidebarElements)) {
    if (!map.setFrontBtn) continue;
    map.setFrontBtn.addEventListener('click', () => selectOrientationTarget('front'));
    map.setTopBtn.addEventListener('click', () => selectOrientationTarget('top'));
  }
}

function updateCubeViewOrientation() {
  const frontFace = faceShowing(heldFrontColor);
  const topFace = faceShowing(heldTopColor);
  if (!frontFace || !topFace) return;

  const front = FACE_VECTORS[frontFace];
  const top = FACE_VECTORS[topFace];
  const right = holdingCrossVector(top, front);
  const orientation = new THREE.Matrix4().set(
    right[0], right[1], right[2], 0,
    top[0], top[1], top[2], 0,
    front[0], front[1], front[2], 0,
    0, 0, 0, 1
  );
  cubeVisualGroup.setRotationFromMatrix(orientation);
  // Only the puzzle is re-oriented. The camera is deliberately left alone so
  // the zoom level and viewing angle you have set survive a change of Front or
  // Top — it previously snapped back to a fixed position every time.
  controls.update();
}
function updatePaletteRoleLabels() {
  const frontFace = faceShowing(heldFrontColor);
  const topFace = faceShowing(heldTopColor);
  if (!frontFace || !topFace) return;
  const front = FACE_VECTORS[frontFace];
  const top = FACE_VECTORS[topFace];
  const right = holdingCrossVector(top, front);
  const userFaces = {
    F: front, B: front.map(v => -v), U: top, D: top.map(v => -v),
    R: right, L: right.map(v => -v)
  };
  const labels = paletteLabelsByPuzzle[puzzleType] || {};
  Object.keys(FACE_VECTORS).forEach(face => {
    const color = faceReferenceColor(face);
    const role = Object.keys(userFaces).find(candidate => sameVector(FACE_VECTORS[face], userFaces[candidate]));
    if (labels[color]) labels[color].textContent = FACE_LABELS[role] || role;
  });
}

// The move grid belongs to whichever sidebar is showing.
function refreshMoveTooltips() {
  const map = (typeof SidebarElements !== 'undefined') ? SidebarElements[puzzleType] : null;
  const grid = map?.moveGrid || moveGrid;
  if (!grid) return;
  grid.querySelectorAll('button').forEach(button => {
    const description = describeMove(button.textContent);
    button.title = description;
    button.setAttribute('aria-label', description);
  });
}
updatePaletteRoleLabels();
updateCubeViewOrientation();
updateSwatchCounts();

