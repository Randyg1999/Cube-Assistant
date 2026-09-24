// ---------- Shared NxN cubie rendering ----------
// One visual style for every NxN cube. 2x2 through 6x6 all build from this
// file: same rounded-box body, same sticker materials, same mechanical core.
// This is the look the 3x3 had; it is now the standard rather than a
// per-puzzle choice.
//
// Nothing here is puzzle-specific. Adding a new cube size must not require
// touching this file — sizes come from the cube's own state, not from a list
// of puzzle names.

// Whether the active puzzle renders as NxN cubies at all. Read from the puzzle
// registry rather than a list of names, so a new cube size needs no edit here.
// Falls back to true before the registry loads, because the app boots on a cube.
function isNxNPuzzle(type = puzzleType) {
  if (typeof PUZZLES === 'undefined') return true;
  return Boolean(PUZZLES[type]?.isNxN);
}

// One geometry shared by every cubie of every cube. Built once and never
// disposed — clearPuzzleVisuals() treats it as persistent.
const CUBIE_GEOMETRY = new RoundedBoxGeometry(
  CUBIE_SIZE, CUBIE_SIZE, CUBIE_SIZE, BEVEL_SEGMENTS, BEVEL_RADIUS
);

// Six materials per cubie in LOCAL_FACE_ORDER: a colored sticker where the
// cubie carries one, bare plastic everywhere else.
function materialsFor(cubie) {
  return LOCAL_FACE_ORDER.map(key => {
    const c = cubie.stickers[key];
    if (c) {
      return makeCubeStickerMaterial(HEX[c], {
        roughness: 0.45,
        metalness: 0.04,
      });
    }
    return new THREE.MeshStandardMaterial({
      color: PLASTIC,
      roughness: 0.7,
      metalness: 0.04,
    });
  });
}

// ---------- Visual-only mechanical core ----------
// Fills the hollow center so the seams between cubies do not show empty space
// through the puzzle. Deliberately not part of cubeState, meshMap, move
// selection, verification, or solver logic, and never a raycast target.
//
// Built as a unit sphere and scaled per cube, so a 5x5 or 6x6 needs no new
// geometry. The radius rule is: outermost cubie layer offset + 0.25. On the
// 3x3 that reproduces the original 1.25 exactly.
const CORE_RADIUS_MARGIN = 0.25;

const cubeCore = new THREE.Mesh(
  new THREE.SphereGeometry(1, 48, 32),
  new THREE.MeshStandardMaterial({
    color: 0x141414,
    roughness: 0.58,
    metalness: 0.08,
  })
);
cubeCore.name = 'NxNMechanicalCore';
cubeCore.position.set(0, 0, 0);
cubeCore.castShadow = true;
cubeCore.receiveShadow = true;
cubeCore.raycast = function () {};
scene.add(cubeCore);

// Outermost cubie layer, in world units. Prefers the puzzle registry's declared
// coordinate set and falls back to measuring the live state.
function outermostLayerOffset(state = cubeState) {
  const declared = (typeof PUZZLES !== 'undefined') ? PUZZLES[puzzleType]?.coords : null;
  if (declared?.length) {
    return Math.max(...declared.map(Math.abs)) * POS_SCALE;
  }
  if (!state?.cubies?.length) return 0;
  let maxCoord = 0;
  for (const cubie of state.cubies) {
    for (const value of cubie.pos) {
      const magnitude = Math.abs(value);
      if (magnitude > maxCoord) maxCoord = magnitude;
    }
  }
  return maxCoord * POS_SCALE;
}

function updateCubeCore() {
  const applies = isNxNPuzzle();
  cubeCore.visible = applies;
  if (!applies) return;
  const radius = outermostLayerOffset() + CORE_RADIUS_MARGIN;
  cubeCore.scale.setScalar(radius);
}
