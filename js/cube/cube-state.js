// ---------- Cube state + meshes ----------
let puzzleType = '3x3'; // Active puzzle registry key.
let cubeState = E.createSolvedState();

// The engine, cube size and coordinate set all come from the puzzle registry
// in js/app/puzzle-switching.js, which is loaded later. Look them up lazily so
// adding a cube size is a registry entry and never an edit here.
function activePuzzleEntry(type = puzzleType) {
  if (typeof PUZZLES === 'undefined') return null;
  return PUZZLES[type] || null;
}

function cubeEngineForType(type = puzzleType) {
  return activePuzzleEntry(type)?.engine || E;
}

// Cubie count is derived from the puzzle's own solved state rather than a
// literal, so this holds for 2x2 through 6x6 without change.
function createSolvedStateForType(type = puzzleType) {
  const entry = activePuzzleEntry(type);
  return entry ? entry.createState() : E.createSolvedState();
}

// Stable, self-contained state description for debugging and sharing.  It
// records every cubie's identity, position, and orientation, so it works for
// both generated scrambles and manually edited cubes.
function cubeStateLine(state = cubeState) {
  // The line records ori, not stickers, and sticker clicks don't update ori. On
  // a 2x2 or 3x3, serialize a copy rebuilt from the visible colors so a
  // hand-entered cube reloads exactly as it looks. Mid-edit (pieces not yet
  // valid) the copy can't be built, so the raw state is written as before.
  const normalize =
    puzzleType === '2x2' && state.cubies.length === 8 ? E.normalizeFromStickers2x2 :
    puzzleType === '3x3' && state.cubies.length === 26 ? E.normalizeFromStickers3x3 :
    null;
  if (normalize) {
    const normalized = normalize(state);
    if (!normalized.errors.length) state = normalized.state;
  }
  return 'RCS1|' + state.cubies.slice().sort((a, b) => a.id.localeCompare(b.id)).map(c =>
    c.id + ':' + c.pos.join(',') + ':' + c.ori.flat().join(',')
  ).join(';');
}

function updateCubeStateLine() {
  const field = document.getElementById('cubeStateLine');
  if (field) field.value = cubeStateLine();
  // Keep the at-a-glance sticker counts on the palette in step with any edit,
  // move or loaded state.
  if (typeof updateSwatchCounts === 'function') updateSwatchCounts();
}

function parseCubeStateLine(line, type = puzzleType) {
  if (!line || !line.startsWith('RCS1|')) throw new Error('State must begin with RCS1|.');
  const next = createSolvedStateForType(type);
  const byId = Object.fromEntries(next.cubies.map(c => [c.id, c]));
  const records = line.slice(5).trim().split(';').filter(Boolean);
  if (records.length !== next.cubies.length) {
    throw new Error('State does not contain all ' + next.cubies.length + ' cubies.');
  }
  for (const record of records) {
    const parts = record.split(':');
    if (parts.length !== 3 || !byId[parts[0]]) throw new Error('Invalid cubie record: ' + record);
    const pos = parts[1].split(',').map(Number);
    const ori = parts[2].split(',').map(Number);
    if (pos.length !== 3 || ori.length !== 9 || pos.some(Number.isNaN) || ori.some(Number.isNaN)) {
      throw new Error('Invalid position or orientation: ' + parts[0]);
    }
    byId[parts[0]].pos = pos;
    byId[parts[0]].ori = [ori.slice(0,3), ori.slice(3,6), ori.slice(6,9)];
  }
  return next;
}
const SPACING = 0.975;
// Cubie logical positions always use integer coords (-1/0/1 for 3x3, -1/1 for 2x2) so the
// engine/move math stays identical between cube types. POS_SCALE is purely a rendering knob:
// a 2x2 has no center layer, so its two layers of corners sit at logical +-1 with nothing
// between them. Halving the scale pulls them to +-0.5 world units apart -- the same physical
// gap adjacent cubies have on the 3x3 -- instead of leaving a whole empty cubie-width gap.
let POS_SCALE = 1.0;
const CUBIE_SIZE = 0.965;
const BEVEL_RADIUS = 0.055;
const BEVEL_SEGMENTS = 4;
const meshMap = new Map(); // cubie object -> visible root mesh/group
const cubieMeshes = [];    // raycast targets for cube interaction

