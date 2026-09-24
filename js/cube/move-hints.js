// ---------- Move hint arrows ----------
// Hovering (or keyboard-focusing) a manual move button overlays an arrow on
// every sticker of the layer that move turns, pointing the way that sticker is
// about to travel. Bigger turns get a double-headed arrow: 180 degrees on a
// cube, 144 degrees (the "2" moves) on a Megaminx.
//
// For a sticker at point p on a layer turning about unit axis a with sign s,
// the sticker's velocity is s * (a x p); the arrow is that vector laid flat on
// the sticker. A sticker sitting on the axis (the center of the turning face)
// only spins in place and gets no arrow.
//
// Each puzzle type has an adapter that answers one question for a move: the
// rotation axis, its sign, whether it is the bigger turn, and where each
// affected sticker sits and faces. Everything is expressed in cubeVisualGroup's
// local space, the space the turn animations rotate in. Adapters read the same
// data their puzzle's own animator uses, so an arrow cannot disagree with the
// turn it previews:
//   NxN (2x2-6x6)  engine.MOVES axis / layer(s) / deg, as animateCubeMove
//   Pyraminx       pyraminxMoveParts(), as animatePyraminxMove
//   Megaminx       MegaminxEngine.parseMove + piecesOnFace, as animateMegaminxMove
// The Pyraminx and Megaminx read each sticker's center and facing from its
// rendered geometry, so the arrows stay right after any number of turns.
//
// Wired per move grid via populateMoveGrid's `hints` option.
//
// The arrows live in their own scene-level group that copies cubeVisualGroup's
// transform every frame they are shown, rather than inside cubeVisualGroup.
// That keeps them out of clearPuzzleVisuals(), which disposes everything in the
// puzzle group, so the shared arrow geometry is never disposed underneath us.
//
// Loads after js/app/puzzle-switching.js (uses cubeTypeSelect).
(function () {
  const LIFT_OUTLINE = 0.006;   // above the sticker surface
  const LIFT_FILL = 0.010;      // above the outline
  const OUTLINE_SCALE = 1.28;

  function rect(x0, x1, h) {
    const s = new THREE.Shape();
    s.moveTo(x0, -h); s.lineTo(x1, -h); s.lineTo(x1, h); s.lineTo(x0, h); s.closePath();
    return s;
  }
  function head(x0, x1, h) {
    const s = new THREE.Shape();
    s.moveTo(x0, -h); s.lineTo(x1, 0); s.lineTo(x0, h); s.closePath();
    return s;
  }

  // Built in the XY plane pointing +X, roughly centered on the origin. Sized to
  // sit inside one cube sticker with margin; adapters scale it for smaller ones.
  const GEOMETRY = {
    single: new THREE.ShapeGeometry([rect(-0.25, 0.04, 0.055), head(0.02, 0.25, 0.15)]),
    double: new THREE.ShapeGeometry([rect(-0.25, -0.03, 0.055), head(-0.07, 0.10, 0.15), head(0.08, 0.25, 0.15)]),
  };
  const FILL = new THREE.MeshBasicMaterial({
    color: 0x8a8d93, side: THREE.DoubleSide,
    polygonOffset: true, polygonOffsetFactor: -6, polygonOffsetUnits: -6,
  });
  const OUTLINE = new THREE.MeshBasicMaterial({
    color: 0x111418, side: THREE.DoubleSide,
    polygonOffset: true, polygonOffsetFactor: -4, polygonOffsetUnits: -4,
  });

  const hintGroup = new THREE.Group();
  hintGroup.name = 'MoveHintArrows';
  scene.add(hintGroup);

  let hovered = null;     // { getMove } while a hinted button is hovered/focused
  let drawn = false;
  let rafId = 0;

  function clear() {
    while (hintGroup.children.length) hintGroup.remove(hintGroup.children[0]);
    drawn = false;
  }

  function addArrow(point, normal, quaternion, double, scale, lift) {
    const geometry = double ? GEOMETRY.double : GEOMETRY.single;

    const outline = new THREE.Mesh(geometry, OUTLINE);
    outline.position.copy(point).addScaledVector(normal, lift + LIFT_OUTLINE);
    outline.quaternion.copy(quaternion);
    outline.scale.setScalar(OUTLINE_SCALE * scale);
    outline.renderOrder = 10;

    const fill = new THREE.Mesh(geometry, FILL);
    fill.position.copy(point).addScaledVector(normal, lift + LIFT_FILL);
    fill.quaternion.copy(quaternion);
    fill.scale.setScalar(scale);
    fill.renderOrder = 11;

    // Hints are display only: never a raycast target for sticker clicks/drags.
    outline.raycast = fill.raycast = function () {};
    hintGroup.add(outline, fill);
  }

  // ---------- Sticker frame from rendered geometry ----------
  // Center and outward facing of a flat sticker mesh, in cubeVisualGroup's
  // local space. The facing comes from the first triangle of the sticker's own
  // geometry; the puzzles are centered on the origin, so "outward" is the side
  // facing away from it.
  const groupInverse = new THREE.Matrix4();
  const relative = new THREE.Matrix4();

  function beginGeometryFrames() {
    cubeVisualGroup.updateMatrixWorld(true);
    groupInverse.copy(cubeVisualGroup.matrixWorld).invert();
  }

  function stickerFrame(mesh) {
    const pos = mesh.geometry.getAttribute('position');
    const index = mesh.geometry.getIndex();
    const at = i => new THREE.Vector3().fromBufferAttribute(pos, i);
    const a = at(index ? index.getX(0) : 0);
    const b = at(index ? index.getX(1) : 1);
    const c = at(index ? index.getX(2) : 2);
    const n = b.clone().sub(a).cross(c.clone().sub(a)).normalize();
    const p = new THREE.Vector3();
    for (let i = 0; i < pos.count; i++) p.add(at(i));
    p.multiplyScalar(1 / pos.count);

    relative.copy(groupInverse).multiply(mesh.matrixWorld);
    p.applyMatrix4(relative);
    n.transformDirection(relative);
    if (n.dot(p) < 0) n.negate();
    return { p, n };
  }

  // ---------- Adapters ----------
  // Each returns null (nothing to show) or
  //   { axis: unit Vector3, sign: +1|-1, double: bool, scale, lift, stickers: [{p, n}] }

  function planNxN(move) {
    const engine = cubeEngineForType();
    const name = engine.normalizeMoveName ? engine.normalizeMoveName(move) : move;
    const mv = engine.MOVES[name];
    if (!mv || !mv.deg) return null;

    const ai = { x: 0, y: 1, z: 2 }[mv.axis];
    const layers = new Set(mv.layers || [mv.layer]);
    const half = CUBIE_SIZE / 2;
    const stickers = [];
    for (const cubie of cubeState.cubies) {
      if (!layers.has(cubie.pos[ai])) continue;
      const mesh = meshMap.get(cubie);
      if (!mesh) continue;
      for (const [localKey, color] of Object.entries(cubie.stickers)) {
        if (color == null) continue;
        const n = new THREE.Vector3(...engine.LOCAL_VEC[engine.worldDirOfLocal(cubie, localKey)]);
        stickers.push({ p: mesh.position.clone().addScaledVector(n, half), n });
      }
    }
    return {
      axis: new THREE.Vector3(ai === 0 ? 1 : 0, ai === 1 ? 1 : 0, ai === 2 ? 1 : 0),
      sign: Math.sign(mv.deg),
      double: Math.abs(mv.deg) === 180,
      scale: 1,
      lift: 0,
      stickers,
    };
  }

  // Pyraminx turns are always 120 degrees, so there is no double-arrow case.
  // animatePyraminxMove turns by (prime ? +1 : -1) * 120 degrees about the
  // vertex axis. Its stickers are small triangles, so the arrow is scaled down.
  function planPyraminx(move) {
    if (typeof pyraminxMoveParts !== 'function') return null;
    let parts;
    try { parts = pyraminxMoveParts(move); } catch (_) { return null; }
    const affected = new Set(parts.affected);
    beginGeometryFrames();
    const stickers = pyraminxStickerMeshes
      .filter(mesh => affected.has(mesh.parent))
      .map(stickerFrame);
    return {
      axis: parts.axis.clone().normalize(),
      sign: parts.prime ? 1 : -1,
      double: false,
      scale: 0.6,
      lift: 0,
      stickers,
    };
  }

  // Megaminx "2" moves are 144 degrees and get the double arrow. Its stickers
  // are beveled caps standing slightly proud of the plastic, so the arrow gets
  // a little extra lift to sit on top of them.
  function planMegaminx(move) {
    const engine = window.MegaminxEngine;
    if (!engine) return null;
    const mv = engine.parseMove(move);
    if (!mv || !mv.deg) return null;
    const affected = new Set(engine.piecesOnFace(cubeState, mv.face));
    beginGeometryFrames();
    const stickers = megaminxStickerMeshes
      .filter(mesh => affected.has(mesh.userData.piece))
      .map(stickerFrame);
    return {
      axis: new THREE.Vector3(...engine.FACE_NORMALS[mv.face]).normalize(),
      sign: Math.sign(mv.deg),
      double: Math.abs(mv.deg) === 144,
      scale: 0.7,
      lift: 0.006,
      stickers,
    };
  }

  function planFor(move) {
    if (typeof isNxNPuzzle === 'function' && isNxNPuzzle()) return planNxN(move);
    if (puzzleType === 'pyraminx') return planPyraminx(move);
    if (puzzleType === 'megaminx') return planMegaminx(move);
    return null;
  }

  function draw(move) {
    clear();
    drawn = true;   // even if there is nothing to show, don't retry every frame
    const plan = planFor(move);
    if (!plan) return;

    for (const { p, n } of plan.stickers) {
      const t = plan.axis.clone().cross(p).multiplyScalar(plan.sign);
      t.addScaledVector(n, -t.dot(n));
      if (t.lengthSq() < 1e-6) continue;       // on the axis: spins in place
      t.normalize();
      const b = n.clone().cross(t);            // t, b, n is right-handed
      const q = new THREE.Quaternion().setFromRotationMatrix(new THREE.Matrix4().makeBasis(t, b, n));
      addArrow(p, n, q, plan.double, plan.scale, plan.lift);
    }
  }

  // Runs only while a hinted button is hovered or focused. Hides the arrows
  // during any turn and redraws them on the layer's new stickers afterwards;
  // the displayed-to-internal move mapping is re-read on each redraw because a
  // slice turn can change how the 3x3's held orientation maps a button.
  function frame() {
    rafId = 0;
    if (!hovered) return;
    const busy = animating || moveQueue.length > 0;
    if (busy) {
      if (drawn) clear();
    } else if (!drawn) {
      draw(hovered.getMove());
    }
    hintGroup.position.copy(cubeVisualGroup.position);
    hintGroup.quaternion.copy(cubeVisualGroup.quaternion);
    hintGroup.scale.copy(cubeVisualGroup.scale);
    rafId = requestAnimationFrame(frame);
  }

  function show(getMove) {
    hovered = { getMove };
    clear();
    if (!rafId) rafId = requestAnimationFrame(frame);
  }

  function hide() {
    hovered = null;
    clear();
    if (rafId) { cancelAnimationFrame(rafId); rafId = 0; }
  }

  // A puzzle switch hides the hovered grid without a pointerleave.
  cubeTypeSelect.addEventListener('change', hide);

  window.MoveHints = { show, hide };
})();
