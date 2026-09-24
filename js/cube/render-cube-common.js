// ---------- Shared cube renderer lifecycle ----------
// The cubie geometry in js/cube/render-cubie.js is built once and reused by
// every cube, so it must survive a puzzle switch. Everything else a build
// creates is owned by that build and disposed with it.
function isPersistentCubeGeometry(geometry) {
  return geometry === CUBIE_GEOMETRY;
}

function isPersistentCubeMaterial() {
  return false;
}

function disposeRemovedPuzzleTree(root, disposedGeometries, disposedMaterials) {
  root.traverse(object => {
    if (!object.isMesh) return;

    const geometry = object.geometry;
    if (geometry && !isPersistentCubeGeometry(geometry) && !disposedGeometries.has(geometry)) {
      geometry.dispose();
      disposedGeometries.add(geometry);
    }

    const materials = Array.isArray(object.material) ? object.material : [object.material];
    for (const material of materials) {
      if (!material || isPersistentCubeMaterial(material) || disposedMaterials.has(material)) continue;
      material.dispose();
      disposedMaterials.add(material);
    }
  });
}

function clearPuzzleVisuals() {
  // Removing an Object3D from a scene does not release its WebGL resources.
  // Dispose resources owned by the outgoing puzzle, preserving the shared
  // cubie geometry used by every future build.
  const disposedGeometries = new Set();
  const disposedMaterials = new Set();

  while (cubeVisualGroup.children.length) {
    const child = cubeVisualGroup.children[0];
    cubeVisualGroup.remove(child);
    disposeRemovedPuzzleTree(child, disposedGeometries, disposedMaterials);
  }

  cubieMeshes.length = 0;
  meshMap.clear();
}

function buildCube() {
  // Safe to call more than once (for example, while switching puzzles).
  // Every NxN cube builds the same way: one rounded-box mesh per cubie with
  // the shared sticker materials. Cube size comes from cubeState, so a new
  // size needs no change here.
  clearPuzzleVisuals();
  for (const cubie of cubeState.cubies) {
    const mesh = new THREE.Mesh(CUBIE_GEOMETRY, materialsFor(cubie));
    mesh.userData.cubie = cubie;
    cubeVisualGroup.add(mesh);
    meshMap.set(cubie, mesh);
    cubieMeshes.push(mesh);
  }

  updateCubeCore();
  syncAllMeshes();
}


function quatFromOri(ori) {
  const m = new THREE.Matrix4();
  m.set(
    ori[0][0], ori[0][1], ori[0][2], 0,
    ori[1][0], ori[1][1], ori[1][2], 0,
    ori[2][0], ori[2][1], ori[2][2], 0,
    0, 0, 0, 1
  );
  return new THREE.Quaternion().setFromRotationMatrix(m);
}

function syncMeshExact(cubie) {
  const mesh = meshMap.get(cubie);
  mesh.position.set(cubie.pos[0] * SPACING * POS_SCALE, cubie.pos[1] * SPACING * POS_SCALE, cubie.pos[2] * SPACING * POS_SCALE);
  mesh.quaternion.copy(quatFromOri(cubie.ori));
}
function syncAllMeshes() {
  cubeState.cubies.forEach(syncMeshExact);
  // Covers the paths that rebuild or reset the cube without writing a new state
  // line (Reset to Solved, puzzle switch, initial build).
  if (typeof updateSwatchCounts === 'function') updateSwatchCounts();
}

function refreshMaterials(cubie) {
  const mesh = meshMap.get(cubie);
  const mats = materialsFor(cubie);
  mesh.material.forEach(m => m.dispose());
  mesh.material = mats;
}

buildCube();
updateCubeStateLine();

// ---------- Move animation ----------
const AXIS_INDEX = { x: 0, y: 1, z: 2 };
let animating = false;
const moveQueue = [];
let onQueueDrained = null;
let solveSpeed = 1;
let animationGeneration = 0;

function easeInOut(t) { return t < 0.5 ? 2 * t * t : 1 - Math.pow(-2 * t + 2, 2) / 2; }

function animateCubeMove(moveName, done) {
  const generation = animationGeneration;
  const engine = cubeEngineForType();
  const normalizedMove = engine.normalizeMoveName ? engine.normalizeMoveName(moveName) : moveName;
  const mv = engine.MOVES[normalizedMove];
  if (!mv) throw new Error('Unknown move for ' + puzzleType + ': ' + moveName);
  const ai = AXIS_INDEX[mv.axis];
  const layers = mv.layers || [mv.layer];
  const layerSet = new Set(layers);
  const layerCubies = cubeState.cubies.filter(c => layerSet.has(c.pos[ai]));
  const axisVec = new THREE.Vector3(mv.axis === 'x' ? 1 : 0, mv.axis === 'y' ? 1 : 0, mv.axis === 'z' ? 1 : 0);
  const group = new THREE.Group();
  cubeVisualGroup.add(group);
  layerCubies.forEach(c => group.attach(meshMap.get(c)));

  const endQuat = new THREE.Quaternion().setFromAxisAngle(axisVec, THREE.MathUtils.degToRad(mv.deg));
  // A whole-cube rotation moves every piece at once, so at face-turn speed it
  // reads as a visual bang with nothing to follow. Slowing it lets the eye
  // track a reference sticker round and makes it read as reorienting the cube
  // rather than as a turn you missed.
  const duration = (mv.rotation ? 420 : 190) / solveSpeed;
  const start = performance.now();

  function step(now) {
    if (generation !== animationGeneration) return;
    const t = Math.min(1, (now - start) / duration);
    const q = new THREE.Quaternion().slerpQuaternions(new THREE.Quaternion(), endQuat, easeInOut(t));
    group.quaternion.copy(q);
    if (t < 1) {
      requestAnimationFrame(step);
    } else {
      engine.applyMove(cubeState, normalizedMove);
      updateCubeStateLine();
      updateNet();
      layerCubies.forEach(c => cubeVisualGroup.attach(meshMap.get(c)));
      cubeVisualGroup.remove(group);
      layerCubies.forEach(syncMeshExact);
      done && done();
    }
  }
  requestAnimationFrame(step);
}

function animateMove(moveName, done) {
  if (!activePuzzle || typeof activePuzzle.animateMove !== 'function') {
    throw new Error('No active puzzle move animator is registered.');
  }
  activePuzzle.animateMove(moveName, done);
}

function queueMove(moveName) {
  moveQueue.push(moveName);
  pump();
}
function queueMoves(list) { list.forEach(queueMove); }
function pump() {
  if (animating || moveQueue.length === 0) {
    if (!animating && moveQueue.length === 0 && onQueueDrained) { const cb = onQueueDrained; onQueueDrained = null; cb(); }
    return;
  }
  animating = true;
  const m = moveQueue.shift();
  animateMove(m, () => { animating = false; pump(); });
}

