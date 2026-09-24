// ---------- Manual move grid ----------
const MOVE_LABELS = [
  'U', "U'", 'U2', 'D', "D'", 'D2',
  'R', "R'", 'R2', 'L', "L'", 'L2',
  'F', "F'", 'F2', 'B', "B'", 'B2',
  'M', "M'", 'M2', 'E', "E'", 'E2', 'S', "S'", 'S2'
];
populateMoveGrid(moveGrid, MOVE_LABELS, {
  describeMove,
  toInternalMove: internalMoveForDisplay,
  hints: true,
});

// ---------- Scramble / Reset ----------
// One implementation for every puzzle. Both helpers work entirely through the
// registry in js/app/puzzle-switching.js — engine, state factory, visual
// builder, stop hook and UI reset all come from the puzzle's own entry — so
// nothing here assumes a cube, let alone an NxN one. A future non-cube puzzle
// wires up by adding scrambleLength to its registry entry and pointing its
// buttons at these two functions.
//
// PUZZLES is defined in a script that loads after this one, which is fine:
// these run on click, never at load.
function scramblePuzzle(type) {
  const puzzle = PUZZLES[type];
  if (!puzzle) throw new Error('Unknown puzzle type: ' + type);
  if (animating || moveQueue.length) return;
  if (puzzle.canInteract && !puzzle.canInteract()) return;
  queueMoves(puzzle.engine.randomScramble(puzzle.scrambleLength));
  puzzle.resetUI();
}

function resetPuzzleToSolved(type) {
  const puzzle = PUZZLES[type];
  if (!puzzle) throw new Error('Unknown puzzle type: ' + type);
  puzzle.stop();             // always give the user a clean way out of any loop mode
  cubeState = puzzle.createState();
  moveQueue.length = 0;
  animating = false;
  puzzle.buildVisual();      // rebuilds meshMap against the new cubie objects
  puzzle.resetUI();
  updateCubeStateLine();
}

// Wire Scramble and Reset for every generated sidebar. Driven by the template's
// element maps rather than named buttons, so a new cube size needs no change
// here — it inherits both the moment its sidebar descriptor exists.
for (const puzzleId of Object.keys(window.SidebarElements)) {
  const els = window.SidebarElements[puzzleId];
  els.scrambleBtn.addEventListener('click', () => scramblePuzzle(puzzleId));
  els.resetBtn.addEventListener('click', () => resetPuzzleToSolved(puzzleId));
}

// ---------- 2x2 Manual move grid ----------
// No M/E/S — a 2x2 has no middle layer to slice. No held-orientation remap either
// (that depends on reading a fixed center's color, and a 2x2 has none), so these
// buttons queue the raw engine move directly.
const moveGrid2x2 = document.getElementById('moveGrid2x2');
const MOVE_LABELS_2X2 = [
  'U', "U'", 'U2', 'D', "D'", 'D2',
  'R', "R'", 'R2', 'L', "L'", 'L2',
  'F', "F'", 'F2', 'B', "B'", 'B2',
];
populateMoveGrid(moveGrid2x2, MOVE_LABELS_2X2, { describeMove, hints: true });

// ---------- 2x2 Scramble / Reset ----------
// Wired by the generic loop above.

// ---------- 4x4 Manual move grid ----------
const moveGrid4x4 = document.getElementById('moveGrid4x4');
const MOVE_LABELS_4X4 = [
  'U', "U'", 'U2', 'D', "D'", 'D2',
  'R', "R'", 'R2', 'L', "L'", 'L2',
  'F', "F'", 'F2', 'B', "B'", 'B2',
  'Uw', "Uw'", 'Uw2', 'Dw', "Dw'", 'Dw2',
  'Rw', "Rw'", 'Rw2', 'Lw', "Lw'", 'Lw2',
  'Fw', "Fw'", 'Fw2', 'Bw', "Bw'", 'Bw2',
  '2U', "2U'", '2U2', '2D', "2D'", '2D2',
  '2R', "2R'", '2R2', '2L', "2L'", '2L2',
  '2F', "2F'", '2F2', '2B', "2B'", '2B2',
];
if (moveGrid4x4) populateMoveGrid(moveGrid4x4, MOVE_LABELS_4X4, { describeMove, hints: true });

// 4x4 Scramble / Reset are wired by the generic loop above.



// The 3x3's preset dropdown is created in controls-orientation.js alongside
// every other cube's, so there is one place that knows about palettes.

// Classic is the startup palette for every cube puzzle.
applyColorPreset('classic');

// ---------- Learn an Algorithm ----------
// Resets to solved, then repeats a short algorithm on loop (with a pause between
// reps) so the user can watch what it does to the cube each time.
const ALGORITHMS = {
  sexy: {
    label: "Sexy Move — R U R' U'",
    moves: "R U R' U'",
    desc: "The single most common trigger in cubing — it shows up inside dozens of longer algorithms. " +
      "It only disturbs a handful of pieces near the top-right corner. Applied six times in a row, the cube " +
      "returns to fully solved, which is a nice way to see the cube's underlying structure in action."
  },
  sledgehammer: {
    label: "Sledgehammer — R' F R F'",
    moves: "R' F R F'",
    desc: "The sexy move's mirror-image cousin on a different pair of faces — another basic trigger that " +
      "shows up constantly once you move past beginner algorithms. Same idea as the sexy move: a small, " +
      "self-contained disturbance that returns to solved after six repetitions."
  },
  sune: {
    label: "Sune — R U R' U R U2 R'",
    moves: "R U R' U R U2 R'",
    desc: "One of the most recognizable last-layer algorithms in cubing — it's built to fix the twist of the " +
      "top corners. Like any OLL algorithm, it only guarantees final orientation, not position, so watch " +
      "several corners and edges shuffle around along with the twisting. Six repetitions bring the cube back " +
      "to fully solved."
  },
  antisune: {
    label: "Anti-Sune — R' U' R U' R' U2 R",
    moves: "R' U' R U' R' U2 R",
    desc: "The mirror image of Sune, twisting corners the opposite way. Cubers usually learn the two as a " +
      "pair, since recognizing one instantly tells you the other. Like Sune, six repetitions bring the cube " +
      "back to solved."
  },
  tperm: {
    label: "T-Perm — R U R' U' R' F R2 U' R' U' R U R' F'",
    moves: "R U R' U' R' F R2 U' R' U' R U R' F'",
    desc: "The classic first PLL algorithm most cubers learn by name. It swaps two edges and two corners at " +
      "the same time while leaving every piece's orientation untouched — a clean demo of pure permutation. " +
      "Since it's just two swaps, applying it twice returns the cube to solved."
  },
  uperm: {
    label: "U-Perm — M2 U M U2 M' U M2",
    moves: "M2 U M U2 M' U M2",
    desc: "Cycles exactly three top-layer edges and touches nothing else — the simplest possible permutation " +
      "demo, and a good contrast to T-Perm's mixed corner-and-edge swap. As a pure 3-cycle, three repetitions " +
      "bring it back to solved."
  },
};

const algSelect = document.getElementById('algSelect');
const algDesc = document.getElementById('algDesc');
const algPlayBtn = document.getElementById('algPlayBtn');
const algStopBtn = document.getElementById('algStopBtn');

Object.entries(ALGORITHMS).forEach(([key, alg]) => {
  const opt = document.createElement('option');
  opt.value = key;
  opt.textContent = alg.label;
  algSelect.appendChild(opt);
});
function updateAlgDesc(){ algDesc.textContent = ALGORITHMS[algSelect.value].desc; }
algSelect.addEventListener('change', updateAlgDesc);
updateAlgDesc();

const ALG_CONTROL_IDS = ['scrambleBtn', 'nextMoveBtn', 'autoPlayBtn', 'backMoveBtn', 'loadStateBtn'];

function setLearnModeActive(active){
  algLooping = active;
  algPlayBtn.disabled = active;
  algStopBtn.disabled = !active;
  algSelect.disabled = active;
  ALG_CONTROL_IDS.forEach(id => { document.getElementById(id).disabled = active; });
  moveGrid.querySelectorAll('button').forEach(b => { b.disabled = active; });
}

function stopAlgLoop(){
  if (!algLooping) return;
  algStopRequested = true;
  setLearnModeActive(false);
}

function playAlgOnce(moves, onDone){
  onQueueDrained = onDone;
  queueMoves(moves.map(internalMoveForDisplay));
}

algPlayBtn.addEventListener('click', () => {
  if (animating || moveQueue.length || algLooping) return;
  const alg = ALGORITHMS[algSelect.value];
  const moves = alg.moves.trim().split(/\s+/);

  algStopRequested = false;
  setLearnModeActive(true);

  // Same reset-to-solved procedure as the Reset to Solved button, so the loop
  // always starts from a clean, easy-to-read state. setLearnModeActive(true)
  // has already been called, and resetPuzzleToSolved calls the puzzle's stop()
  // hook — which is stopAlgLoop — so re-arm the mode flags afterwards.
  resetPuzzleToSolved('3x3');
  algStopRequested = false;
  setLearnModeActive(true);

  function rep(){
    if (algStopRequested) return;
    playAlgOnce(moves, () => {
      if (algStopRequested) return;
      setTimeout(rep, 650 / solveSpeed); // pause between reps so it's easy to watch
    });
  }
  rep();
});

algStopBtn.addEventListener('click', stopAlgLoop);

// ---------- 2x2 Learn an Algorithm ----------
// Same idea as the 3x3 trainer, but its own algorithm set: only R/U/F triggers that
// still make sense with no edges. T-Perm and U-Perm (both edge-dependent, and U-Perm
// uses M-slice moves that don't exist on a 2x2) are left out. Repeat-counts were
// re-verified against the 2x2 engine rather than assumed to carry over from 3x3 —
// they happen to match (corners behave the same with or without edges present), but
// that was checked, not assumed.
const ALGORITHMS_2X2 = {
  sexy: {
    label: "Sexy Move — R U R' U'",
    moves: "R U R' U'",
    desc: "The single most common trigger in cubing. On a 2x2 it only involves corners, so it's an even " +
      "cleaner way to see it in action than on a 3x3. Six repetitions bring the cube back to fully solved."
  },
  sledgehammer: {
    label: "Sledgehammer — R' F R F'",
    moves: "R' F R F'",
    desc: "The sexy move's mirror-image cousin on a different pair of faces. Same idea: a small, self-contained " +
      "disturbance that returns to solved after six repetitions."
  },
  sune: {
    label: "Sune — R U R' U R U2 R'",
    moves: "R U R' U R U2 R'",
    desc: "A classic corner-twisting algorithm. Watch several corners shuffle position along with the twisting " +
      "— it doesn't preserve where pieces end up, only their final orientation. Six repetitions return the " +
      "cube to solved."
  },
  antisune: {
    label: "Anti-Sune — R' U' R U' R' U2 R",
    moves: "R' U' R U' R' U2 R",
    desc: "The mirror image of Sune, twisting corners the opposite way. Cubers usually learn the two as a " +
      "pair. Like Sune, six repetitions bring the cube back to solved."
  },
};

const algSelect2x2 = document.getElementById('algSelect2x2');
const algDesc2x2 = document.getElementById('algDesc2x2');
const algPlayBtn2x2 = document.getElementById('algPlayBtn2x2');
const algStopBtn2x2 = document.getElementById('algStopBtn2x2');

Object.entries(ALGORITHMS_2X2).forEach(([key, alg]) => {
  const opt = document.createElement('option');
  opt.value = key;
  opt.textContent = alg.label;
  algSelect2x2.appendChild(opt);
});
function updateAlgDesc2x2(){ algDesc2x2.textContent = ALGORITHMS_2X2[algSelect2x2.value].desc; }
algSelect2x2.addEventListener('change', updateAlgDesc2x2);
updateAlgDesc2x2();

const ALG_CONTROL_IDS_2X2 = ['scrambleBtn2x2'];

function setLearnModeActive2x2(active){
  algLooping2x2 = active;
  algPlayBtn2x2.disabled = active;
  algStopBtn2x2.disabled = !active;
  algSelect2x2.disabled = active;
  ALG_CONTROL_IDS_2X2.forEach(id => { document.getElementById(id).disabled = active; });
  moveGrid2x2.querySelectorAll('button').forEach(b => { b.disabled = active; });
}

function stopAlgLoop2x2(){
  if (!algLooping2x2) return;
  algStopRequested2x2 = true;
  setLearnModeActive2x2(false);
}

function playAlgOnce2x2(moves, onDone){
  onQueueDrained = onDone;
  queueMoves(moves); // no held-orientation remap on 2x2 — queue moves as written
}

algPlayBtn2x2.addEventListener('click', () => {
  if (animating || moveQueue.length || algLooping2x2) return;
  const alg = ALGORITHMS_2X2[algSelect2x2.value];
  const moves = alg.moves.trim().split(/\s+/);

  algStopRequested2x2 = false;
  setLearnModeActive2x2(true);

  const fresh = E.createSolvedState2x2();
  cubeState.cubies.forEach((c, i) => {
    const f = fresh.cubies[i];
    c.pos = f.pos; c.ori = f.ori; c.stickers = f.stickers; c.id = f.id;
    refreshMaterials(c);
  });
  moveQueue.length = 0;
  animating = false;
  syncAllMeshes();
  clearVerifyResult2x2();
  resetSolveUI2x2();
  updateCubeStateLine();

  function rep(){
    if (algStopRequested2x2) return;
    playAlgOnce2x2(moves, () => {
      if (algStopRequested2x2) return;
      setTimeout(rep, 650 / solveSpeed);
    });
  }
  rep();
});

algStopBtn2x2.addEventListener('click', stopAlgLoop2x2);

// ---------- Click-to-edit colors ----------
const raycaster = new THREE.Raycaster();
const mouseNDC = new THREE.Vector2();
let downPos = null;
let layerDrag = null;
let pyraminxDrag = null;

function pyraminxHitAtPointer(e) {
  const rect = renderer.domElement.getBoundingClientRect();
  mouseNDC.x = ((e.clientX - rect.left) / rect.width) * 2 - 1;
  mouseNDC.y = -((e.clientY - rect.top) / rect.height) * 2 + 1;
  raycaster.setFromCamera(mouseNDC, camera);
  return raycaster.intersectObjects(pyraminxStickerMeshes, false)[0] || null;
}

function hitAtPointer(e) {
  const rect = renderer.domElement.getBoundingClientRect();
  mouseNDC.x = ((e.clientX - rect.left) / rect.width) * 2 - 1;
  mouseNDC.y = -((e.clientY - rect.top) / rect.height) * 2 + 1;
  raycaster.setFromCamera(mouseNDC, camera);
  return raycaster.intersectObjects(cubieMeshes, false)[0] || null;
}

function screenPoint(vector) {
  const projected = vector.clone().project(camera);
  const rect = renderer.domElement.getBoundingClientRect();
  return [(projected.x + 1) * rect.width / 2, (1 - projected.y) * rect.height / 2];
}

const AXIS_UNIT = { x: [1, 0, 0], y: [0, 1, 0], z: [0, 0, 1] };
const MIDDLE_MOVE_FOR_AXIS = { x: 'M', y: 'E', z: 'S' };

function pointerPointOnPlane(e, planePoint, planeNormal) {
  const rect = renderer.domElement.getBoundingClientRect();
  mouseNDC.x = ((e.clientX - rect.left) / rect.width) * 2 - 1;
  mouseNDC.y = -((e.clientY - rect.top) / rect.height) * 2 + 1;
  raycaster.setFromCamera(mouseNDC, camera);
  const plane = new THREE.Plane().setFromNormalAndCoplanarPoint(
    planeNormal.clone().normalize(),
    planePoint
  );
  return raycaster.ray.intersectPlane(plane, new THREE.Vector3());
}

// Geometric layer drag, used by every cube from 4x4 up.
//
// Works by treating the sticker as a physical surface: intersect the release
// pointer's camera ray with the plane of the sticker to get the drag direction
// in 3D, rather than guessing between projected candidate rotations. That makes
// it size-independent, which the 2x2/3x3 path below is not — that one matches
// candidate faces against the 3x3 engine's single-coordinate layers and cannot
// name an inner slice at all.
function moveFromGeometricLayerDrag(drag, e) {
  const engine = cubeEngineForType();
  const clickedWorldFace = engine.worldDirOfLocal(drag.cubie, drag.localKey);
  const localFaceNormal = new THREE.Vector3(...engine.LOCAL_VEC[clickedWorldFace]);
  const groupWorldQuaternion = cubeVisualGroup.getWorldQuaternion(new THREE.Quaternion());
  const faceNormalWorld = localFaceNormal.clone().applyQuaternion(groupWorldQuaternion).normalize();

  const endPoint = pointerPointOnPlane(e, drag.worldPoint, faceNormalWorld);
  if (!endPoint) return null;

  const dragWorld = endPoint.clone().sub(drag.worldPoint);
  // Numerical camera/plane intersection can leave a tiny normal component.
  dragWorld.addScaledVector(faceNormalWorld, -dragWorld.dot(faceNormalWorld));
  if (dragWorld.lengthSq() < 1e-8) return null;
  dragWorld.normalize();

  // On a physical face, rotation axis = face normal x finger travel.
  // Example: front face (+Z), drag right (+X) => +Y axis (a row turn).
  const desiredAxisWorld = faceNormalWorld.clone().cross(dragWorld).normalize();
  const invGroupQuaternion = groupWorldQuaternion.clone().invert();
  const desiredAxisLocal = desiredAxisWorld.clone().applyQuaternion(invGroupQuaternion).normalize();

  const components = {
    x: Math.abs(desiredAxisLocal.x),
    y: Math.abs(desiredAxisLocal.y),
    z: Math.abs(desiredAxisLocal.z),
  };
  const axis = Object.keys(components).reduce((a, b) => components[b] > components[a] ? b : a);
  const axisIndex = {x:0, y:1, z:2}[axis];
  const coord = drag.cubie.pos[axisIndex];
  const base = engine.moveForLayer(axis, coord);
  if (!base) return null;

  // Having selected the exact layer geometrically, choose only its direction.
  // Compare the actual 3D tangent produced by base vs prime against the drag.
  const puzzleOrigin = cubeVisualGroup.localToWorld(new THREE.Vector3(0, 0, 0));
  const axisWorld = new THREE.Vector3(...AXIS_UNIT[axis])
    .applyQuaternion(groupWorldQuaternion)
    .normalize();
  const relative = drag.worldPoint.clone().sub(puzzleOrigin);
  let bestMove = null;
  let bestScore = -Infinity;

  for (const candidate of [base, base + "'"]) {
    const mv = engine.MOVES[candidate];
    const predictedPoint = relative.clone()
      .applyAxisAngle(axisWorld, THREE.MathUtils.degToRad(mv.deg * 0.22))
      .add(puzzleOrigin);
    const predictedDrag = predictedPoint.sub(drag.worldPoint);
    predictedDrag.addScaledVector(faceNormalWorld, -predictedDrag.dot(faceNormalWorld));
    if (predictedDrag.lengthSq() < 1e-8) continue;
    predictedDrag.normalize();
    const score = predictedDrag.dot(dragWorld);
    if (score > bestScore) {
      bestScore = score;
      bestMove = candidate;
    }
  }
  return bestMove;
}

function moveFromLayerDrag(drag, e) {
  // Any cube with inner slices needs the geometric handler. The screen-projection
  // path below only understands outer faces and the 3x3 middle slice.
  if ((PUZZLES[puzzleType]?.size ?? 3) >= 4) return moveFromGeometricLayerDrag(drag, e);

  const worldPosition = drag.worldPoint.clone();
  const startScreen = drag.screenStart;
  const rawDelta = new THREE.Vector2(e.clientX - drag.start[0], e.clientY - drag.start[1]);
  if (rawDelta.lengthSq() < 1e-8) return null;
  const pointerDelta = rawDelta.normalize();
  const axisIndexes = { x: 0, y: 1, z: 2 };

  // Existing 2x2 / 3x3 behavior is intentionally preserved.  The surface the
  // user grabbed constrains the turn to the two axes lying in that face, then
  // screen projection chooses between those candidates.
  const engine = cubeEngineForType();
  const clickedWorldFace = engine.worldDirOfLocal(drag.cubie, drag.localKey);
  const clickedNormal = engine.LOCAL_VEC[clickedWorldFace];
  const normalAxis = clickedNormal[0] !== 0 ? 'x' : clickedNormal[1] !== 0 ? 'y' : 'z';
  const allowedAxes = ['x', 'y', 'z'].filter(axis => axis !== normalAxis);

  const candidates = [];
  for (const axis of allowedAxes) {
    const coord = drag.cubie.pos[axisIndexes[axis]];

    if (coord === 0) {
      const middle = MIDDLE_MOVE_FOR_AXIS[axis];
      if (middle && E.MOVES[middle]) candidates.push(middle, middle + "'");
      continue;
    }

    const face = Object.keys(FACE_VECTORS).find(faceName => {
      const move = E.MOVES[faceName];
      return move && move.axis === axis && move.layer === coord;
    });
    if (face) candidates.push(face, face + "'");
  }

  if (!candidates.length) return null;

  let bestMove = candidates[0];
  let bestScore = -Infinity;
  candidates.forEach(candidate => {
    const mv = engine.MOVES[candidate];
    const axis = new THREE.Vector3(...AXIS_UNIT[mv.axis])
      .applyQuaternion(cubeVisualGroup.quaternion)
      .normalize();
    const testPosition = worldPosition.clone().applyAxisAngle(
      axis,
      THREE.MathUtils.degToRad(mv.deg * 0.35)
    );
    const testScreen = screenPoint(testPosition);
    const predicted = new THREE.Vector2(
      testScreen[0] - startScreen[0],
      testScreen[1] - startScreen[1]
    );
    if (predicted.lengthSq() < 1e-8) return;
    predicted.normalize();
    const score = predicted.dot(pointerDelta);
    if (score > bestScore) {
      bestScore = score;
      bestMove = candidate;
    }
  });
  return bestMove;
}


function pyraminxMoveCandidatesForPiece(piece) {
  if (!piece?.userData?.pyraminxPieceKey) return [];
  const key = piece.userData.pyraminxPieceKey;
  if (key.startsWith('tip:')) {
    const vertex = key.split(':')[1];
    return [vertex.toLowerCase(), vertex.toLowerCase() + "'"];
  }
  if (key.startsWith('center:')) {
    const vertex = key.split(':')[1];
    return [vertex, vertex + "'"];
  }
  if (key.startsWith('edge:')) {
    const slot = piece.userData.currentSlot;
    if (!slot || slot.length !== 2) return [];
    return [...slot].flatMap(vertex => [vertex, vertex + "'"]);
  }
  return [];
}

function moveFromPyraminxDrag(drag, e) {
  const candidates = pyraminxMoveCandidatesForPiece(drag.piece);
  if (!candidates.length) return null;

  const pointerDelta = new THREE.Vector2(
    e.clientX - drag.start[0],
    e.clientY - drag.start[1]
  ).normalize();
  const puzzleOrigin = cubeVisualGroup.localToWorld(new THREE.Vector3(0, 0, 0));
  let bestMove = null;
  let bestScore = -Infinity;

  for (const candidate of candidates) {
    const vertex = candidate[0].toUpperCase();
    const prime = candidate.endsWith("'");
    const worldAxis = pyraminxVertices[vertex].clone().normalize()
      .applyQuaternion(cubeVisualGroup.getWorldQuaternion(new THREE.Quaternion()))
      .normalize();
    const relative = drag.worldPoint.clone().sub(puzzleOrigin);
    const previewAngle = (prime ? 1 : -1) * Math.PI * 0.28;
    const predictedWorld = relative.applyAxisAngle(worldAxis, previewAngle).add(puzzleOrigin);
    const testScreen = screenPoint(predictedWorld);
    const predicted = new THREE.Vector2(
      testScreen[0] - drag.screenStart[0],
      testScreen[1] - drag.screenStart[1]
    );
    if (predicted.lengthSq() < 1e-8) continue;
    predicted.normalize();
    const score = predicted.dot(pointerDelta);
    if (score > bestScore) {
      bestScore = score;
      bestMove = candidate;
    }
  }
  return bestMove;
}

renderer.domElement.addEventListener('pointerdown', (e) => {
  downPos = [e.clientX, e.clientY];
  if (puzzleType === 'pyraminx') {
    const hit = pyraminxHitAtPointer(e);
    if (!hit || animating || moveQueue.length) return;
    const piece = pyraminxPieceGroups.get(hit.object.userData.pyraminxPieceKey);
    if (!piece) return;
    const rect = renderer.domElement.getBoundingClientRect();
    pyraminxDrag = {
      sticker: hit.object,
      piece,
      worldPoint: hit.point.clone(),
      screenStart: [e.clientX - rect.left, e.clientY - rect.top],
      start: [e.clientX, e.clientY],
      moved: false
    };
    controls.enabled = false;
    renderer.domElement.setPointerCapture?.(e.pointerId);
    return;
  }
  const hit = hitAtPointer(e);
  if (!hit) return;
  const materialIndex = hit.face.materialIndex;
  const localKey = LOCAL_FACE_ORDER[materialIndex];
  const cubie = hit.object.userData.cubie;
  if (cubie.stickers[localKey] == null || cubie.pos.filter(v => v !== 0).length === 1) return;
  const rect = renderer.domElement.getBoundingClientRect();
  layerDrag = {
    cubie, localKey,
    worldPoint: hit.point.clone(),
    screenStart: [e.clientX - rect.left, e.clientY - rect.top],
    start: [e.clientX, e.clientY],
    moved: false
  };
  controls.enabled = false;
  renderer.domElement.setPointerCapture?.(e.pointerId);
});
renderer.domElement.addEventListener('pointermove', (e) => {
  if (pyraminxDrag) {
    const distance = Math.hypot(e.clientX - pyraminxDrag.start[0], e.clientY - pyraminxDrag.start[1]);
    if (distance >= 10) pyraminxDrag.moved = true;
    return;
  }
  if (!layerDrag) return;
  const distance = Math.hypot(e.clientX - layerDrag.start[0], e.clientY - layerDrag.start[1]);
  if (distance < 10) return;
  layerDrag.moved = true;
});
renderer.domElement.addEventListener('pointerup', (e) => {
  if (!downPos) return;
  const dist = Math.hypot(e.clientX - downPos[0], e.clientY - downPos[1]);
  const drag = layerDrag;
  const pyrDrag = pyraminxDrag;
  layerDrag = null;
  pyraminxDrag = null;
  downPos = null;
  controls.enabled = true;
  renderer.domElement.releasePointerCapture?.(e.pointerId);
  if (pyrDrag?.moved) {
    if (!animating && !moveQueue.length) {
      const move = moveFromPyraminxDrag(pyrDrag, e);
      if (move) {
        cancelPyraminxGuidedSolve('Drag turn made; press Start to create a new plan.');
        queueMove(move);
        pyraminxStickerInfo.textContent = `Drag turn: ${move}`;
      }
    }
    return;
  }
  if (drag?.moved) {
    if (!animating && !moveQueue.length) {
      const move = moveFromLayerDrag(drag, e);
      if (move) queueMove(move);
      if (puzzleType === '4x4') clearVerifyResult4x4(); else clearVerifyResult();
    }
    return;
  }
  if (dist > 6) return;

  if (puzzleType === 'pyraminx') {
    const sticker = pyrDrag?.sticker || pyraminxHitAtPointer(e)?.object;
    if (!sticker) return;
    recolorPyraminxSticker(sticker);
    return;
  }

  const hit = hitAtPointer(e);
  if (!hit) return;
  const materialIndex = hit.face.materialIndex;
  const localKey = LOCAL_FACE_ORDER[materialIndex];
  const cubie = hit.object.userData.cubie;
  if (cubie.stickers[localKey] == null) return; // plastic (hidden) face, not editable
  if (cubie.pos.filter(v => v !== 0).length === 1) return; // center piece — fixed, never editable
  const cur = cubie.stickers[localKey];
  const next = CYCLE_ORDER[(CYCLE_ORDER.indexOf(cur) + 1) % CYCLE_ORDER.length];
  cubie.stickers[localKey] = next;
  // Only the 2x2 and 3x3 derive piece identity from their colour set. On bigger
  // cubes many pieces share a set (wings, centres), so ids carry a position tag
  // and must not be rebuilt from colours.
  if ((PUZZLES[puzzleType]?.size ?? 3) <= 3) {
    cubie.id = Object.values(cubie.stickers).filter(v => v != null).sort().join(',');
  }
  refreshMaterials(cubie);
  updateCubeStateLine();
  updateNet(true);
  if (puzzleType === '4x4') clearVerifyResult4x4(); else clearVerifyResult();
});


// ---------- State copy ----------
document.getElementById('copyStateBtn').addEventListener('click', async () => {
  const field = document.getElementById('cubeStateLine');
  try {
    await navigator.clipboard.writeText(field.value);
    const btn = document.getElementById('copyStateBtn');
    const old = btn.innerHTML;
    btn.textContent = 'Copied';
    setTimeout(() => { btn.innerHTML = old; }, 1000);
  } catch (_) {
    field.select();
    document.execCommand('copy');
  }
});

