// ============================================================================
// NxN cube kinematics — one engine factory for any cube size.
// Pure JS, no DOM or Three.js dependency.
//
// createNxNEngine(N) returns an engine with the same surface the hand-written
// engines expose, so the renderer, controls and registry treat it identically.
//
// WHY THIS EXISTS
// cube-engine.js (2x2/3x3) and engine-4x4.js duplicate roughly 60% of their
// code: the 24-orientation generator, the solved check, the corner-reachability
// loop, sticker assignment, and every state/geometry helper. Writing 5x5 and
// 6x6 the same way would make four copies. This is that shared body written
// once, generalized over N.
//
// The axis that matters is ODD vs EVEN, not N:
//   odd  cubes have fixed centers, a true middle slice (M/E/S), and centre
//        coordinates that include 0
//   even cubes have no fixed centers and no middle slice
// Everything else follows from N.
//
// NOT INCLUDED: verification. Odd and even cubes check genuinely different
// invariants, and each cube's verifier lives in its own folder. See
// docs/NXN-ROADMAP.txt under "Engine strategy".
//
// The existing 2x2/3x3 and 4x4 engines are deliberately NOT migrated onto this.
// They carry every working solver in the project and there is no test harness
// to prove an extraction preserved behavior.
// ============================================================================

(function (root, factory) {
  if (typeof module === 'object' && module.exports) {
    module.exports = factory(require('../core/cube-math.js'));
  } else {
    root.createNxNEngine = factory(root.CubeMath);
  }
})(typeof self !== 'undefined' ? self : this, function (CubeMath) {
  if (!CubeMath) throw new Error('CubeMath is required before the NxN engine.');
  const { matMulVec, matMulMat, axisIndex, rotMatrix, vecKey } = CubeMath;

  const LOCAL_VEC = {'+x':[1,0,0],'-x':[-1,0,0],'+y':[0,1,0],'-y':[0,-1,0],'+z':[0,0,1],'-z':[0,0,-1]};
  const KEY_TO_FACE = {};
  Object.entries(LOCAL_VEC).forEach(([k, v]) => { KEY_TO_FACE[vecKey(v)] = k; });

  const FACE_KEY = {U:'+y', D:'-y', R:'+x', L:'-x', F:'+z', B:'-z'};
  const FACES = ['U','D','R','L','F','B'];

  // Same convention as cube-engine.js: a turn of the +axis face is clockwise as
  // seen from outside that face, which is -90 degrees about that axis; the
  // -axis face is the mirror. Every generated layer inherits its side's sign.
  const FACE_DEF = {
    R: {axis:'x', sign: 1}, L: {axis:'x', sign:-1},
    U: {axis:'y', sign: 1}, D: {axis:'y', sign:-1},
    F: {axis:'z', sign: 1}, B: {axis:'z', sign:-1},
  };

  // Middle slices follow their outer-face companion, per standard notation:
  // M follows L, E follows D, S follows F.
  const MIDDLE_DEF = {
    M: { axis:'x', follows:'L' },
    E: { axis:'y', follows:'D' },
    S: { axis:'z', follows:'F' },
  };

  // Standard Western scheme in the WCA scrambling orientation (Regulation 4d1):
  // white top, green front, red right. Same as cube-engine.js.
  const DEFAULT_SCHEME = {'+x':'R', '-x':'O', '+y':'W', '-y':'Y', '+z':'G', '-z':'B'};

  // Coordinates for an N-cube, one per layer, low to high.
  //   odd  N: consecutive integers centred on 0   (3x3 -> -1,0,1)
  //   even N: odd integers, so all math stays integer (4x4 -> -3,-1,1,3)
  // Both give a world spacing of 1.0 per layer once positionScale is applied.
  // This matches the conventions the existing engines already use, so the
  // renderer needs no special case.
  function coordsFor(N) {
    const odd = N % 2 === 1;
    const coords = [];
    for (let i = 0; i < N; i++) {
      coords.push(odd ? i - (N - 1) / 2 : 2 * i - (N - 1));
    }
    return coords;
  }

  function createNxNEngine(N) {
    if (!Number.isInteger(N) || N < 2) throw new Error('Cube size must be an integer of at least 2.');

    const COORDS = coordsFor(N);
    const ODD = N % 2 === 1;
    const MIN = COORDS[0];
    const MAX = COORDS[N - 1];
    const POSITION_SCALE = ODD ? 1.0 : 0.5;

    // Depth 1 is the outer layer on that side; depth 2 the slice behind it.
    function coordAtDepth(sign, depth) {
      return sign > 0 ? COORDS[N - depth] : COORDS[depth - 1];
    }

    // ---------- move table ----------
    const MOVES = {};
    const OUTER_MOVES = [];
    const WIDE_MOVES = [];
    const SLICE_MOVES = [];
    const ROTATION_MOVES = [];

    function addMove(name, axis, layers, baseDeg, bucket, extra) {
      MOVES[name]        = Object.assign({ axis, layers, deg:  baseDeg }, extra);
      MOVES[name + "'"]  = Object.assign({ axis, layers, deg: -baseDeg }, extra);
      MOVES[name + '2']  = Object.assign({ axis, layers, deg: 180 }, extra);
      bucket.push(name, name + "'", name + '2');
    }

    for (const [face, def] of Object.entries(FACE_DEF)) {
      const baseDeg = def.sign === 1 ? -90 : 90;

      // Outer face.
      addMove(face, def.axis, [coordAtDepth(def.sign, 1)], baseDeg, OUTER_MOVES);

      // Wide turns: the outer layer plus the ones behind it. A 4x4 and 5x5 get
      // Xw (two layers); a 6x6 also gets 3Xw (three).
      for (let width = 2; width <= Math.floor(N / 2); width++) {
        const layers = [];
        for (let d = 1; d <= width; d++) layers.push(coordAtDepth(def.sign, d));
        const name = (width === 2 ? '' : String(width)) + face + 'w';
        addMove(name, def.axis, layers, baseDeg, WIDE_MOVES);
      }

      // Inner slices, named by depth: 2R is the slice behind R, 3R behind that.
      // On an odd cube the true middle is M/E/S instead, so it stops short.
      const deepest = ODD ? (N - 1) / 2 : N / 2;
      for (let depth = 2; depth <= deepest; depth++) {
        addMove(String(depth) + face, def.axis, [coordAtDepth(def.sign, depth)], baseDeg, SLICE_MOVES);
      }
    }

    // Middle slices exist only on odd cubes, where a layer sits at coordinate 0.
    if (ODD) {
      for (const [name, def] of Object.entries(MIDDLE_DEF)) {
        const baseDeg = MOVES[def.follows].deg;
        addMove(name, def.axis, [0], baseDeg, SLICE_MOVES);
      }
    }

    // Whole-cube rotations. Every layer at once, so the cube is no less solved
    // afterwards, but every piece ends up somewhere new. They are real state
    // changes, not a view transform: in an algorithm like "Rw U2 x Rw U2 ..."
    // the second Rw refers to a different physical layer because the cube
    // turned in between.
    //
    // Present so that published algorithms can be entered verbatim rather than
    // rewritten into fixed notation. Whether a given solver emits them is that
    // solver's choice: a human teaching method should, an optimal search
    // should not, since rotations do not count in standard move metrics.
    //
    // x follows R, y follows U, z follows F, per standard notation.
    for (const [name, follows] of [['x', 'R'], ['y', 'U'], ['z', 'F']]) {
      addMove(name, FACE_DEF[follows].axis, COORDS.slice(), MOVES[follows].deg,
              ROTATION_MOVES, { rotation: true });
    }

    // Scramble vocabulary: outer and inner slices. Wide turns are excluded
    // because every wide turn equals a combination of these, so including them
    // would bias a random scramble rather than broaden it. Rotations are
    // excluded because they do not change the puzzle at all.
    const ALL_MOVES = OUTER_MOVES.concat(SLICE_MOVES.filter(m => !'MES'.includes(m[0])));

    // ---------- state ----------
    // Interior cubies are never visible and never needed: a cubie is part of the
    // puzzle only if at least one coordinate sits on an outer face.
    function onSurface(x, y, z) {
      return x === MIN || x === MAX || y === MIN || y === MAX || z === MIN || z === MAX;
    }

    function createSolvedState(scheme) {
      scheme = scheme || DEFAULT_SCHEME;
      const cubies = [];
      for (const x of COORDS) for (const y of COORDS) for (const z of COORDS) {
        if (!onSurface(x, y, z)) continue;
        const stickers = {
          '+x': x === MAX ? scheme['+x'] : null,
          '-x': x === MIN ? scheme['-x'] : null,
          '+y': y === MAX ? scheme['+y'] : null,
          '-y': y === MIN ? scheme['-y'] : null,
          '+z': z === MAX ? scheme['+z'] : null,
          '-z': z === MIN ? scheme['-z'] : null,
        };
        cubies.push({
          pos: [x, y, z],
          ori: [[1,0,0],[0,1,0],[0,0,1]],
          stickers,
          // Above 3x3 many pieces share a colour set (wings, centres), so the
          // solved position is appended to keep ids unique. Everything that
          // needs the colours alone uses cubieColorSet().
          id: N <= 3
            ? Object.values(stickers).filter(v => v != null).sort().join(',')
            : Object.values(stickers).filter(v => v != null).sort().join(',') + '@' + x + ',' + y + ',' + z,
        });
      }
      return { cubies };
    }

    function cloneState(state) {
      return {
        cubies: state.cubies.map(c => ({
          pos: c.pos.slice(),
          ori: c.ori.map(r => r.slice()),
          stickers: Object.assign({}, c.stickers),
          id: c.id,
        })),
      };
    }

    function applyMove(state, moveName) {
      const mv = MOVES[moveName];
      if (!mv) throw new Error('Unknown move: ' + moveName);
      const R = rotMatrix(mv.axis, mv.deg);
      const ai = axisIndex(mv.axis);
      for (const c of state.cubies) {
        if (mv.layers.includes(c.pos[ai])) {
          c.pos = matMulVec(R, c.pos).map(Math.round);
          c.ori = matMulMat(R, c.ori);
        }
      }
    }

    function applyMoves(state, moves) { for (const m of moves) applyMove(state, m); }

    function applyAlgString(state, alg) {
      const moves = alg.trim().split(/\s+/).filter(Boolean);
      applyMoves(state, moves);
      return moves;
    }

    // ---------- reading the cube ----------
    function worldDirOfLocal(cubie, localKey) {
      return KEY_TO_FACE[vecKey(matMulVec(cubie.ori, LOCAL_VEC[localKey]))];
    }

    function currentColorAt(cubie, worldFaceKey) {
      for (const localKey of Object.keys(cubie.stickers)) {
        const color = cubie.stickers[localKey];
        if (color == null) continue;
        if (worldDirOfLocal(cubie, localKey) === worldFaceKey) return color;
      }
      return null;
    }

    function cubieColorSet(cubie) {
      return Object.values(cubie.stickers).filter(v => v != null);
    }

    function colorCounts(state) {
      const counts = {};
      for (const c of state.cubies) for (const color of cubieColorSet(c)) {
        counts[color] = (counts[color] || 0) + 1;
      }
      return counts;
    }

    function cubieAt(state, pos) {
      return state.cubies.find(c => c.pos[0] === pos[0] && c.pos[1] === pos[1] && c.pos[2] === pos[2]);
    }

    // Only meaningful on odd cubes, where the centre of each face never moves.
    function centerColor(state, face) {
      if (!ODD) return null;
      const key = FACE_KEY[face];
      const pos = [0, 0, 0];
      pos[axisIndex(key[1])] = key[0] === '+' ? MAX : MIN;
      const c = cubieAt(state, pos);
      return c ? currentColorAt(c, key) : null;
    }

    function isSolved(state) {
      // Odd cubes have a fixed centre to compare against. Even cubes do not, so
      // solved means every face shows one colour and no colour appears twice.
      if (ODD) {
        for (const face of FACES) {
          const target = centerColor(state, face);
          for (const c of state.cubies) {
            const shown = currentColorAt(c, FACE_KEY[face]);
            if (shown != null && shown !== target) return false;
          }
        }
        return true;
      }

      const seen = new Set();
      for (const face of FACES) {
        let target = null;
        for (const c of state.cubies) {
          const shown = currentColorAt(c, FACE_KEY[face]);
          if (shown == null) continue;
          if (target === null) target = shown;
          else if (shown !== target) return false;
        }
        if (target === null || seen.has(target)) return false;
        seen.add(target);
      }
      return true;
    }

    // ---------- drag turning ----------
    // Given an axis and the coordinate of the layer the user grabbed, name the
    // move that turns exactly that layer. Used by click-drag turning.
    function moveForLayer(axis, layerCoord) {
      for (const [name, mv] of Object.entries(MOVES)) {
        if (name.endsWith("'") || name.endsWith('2')) continue;
        if (mv.axis !== axis) continue;
        if (mv.layers.length === 1 && mv.layers[0] === layerCoord) return name;
      }
      return null;
    }

    function randomScramble(length) {
      const moves = [];
      let lastAxis = null;
      while (moves.length < length) {
        const candidate = ALL_MOVES[Math.floor(Math.random() * ALL_MOVES.length)];
        const axis = MOVES[candidate].axis;
        if (axis === lastAxis) continue;   // avoid same-axis runs that cancel
        moves.push(candidate);
        lastAxis = axis;
      }
      return moves;
    }

    return {
      SIZE: N, ODD, COORDS, POSITION_SCALE,
      MOVES, ALL_MOVES, OUTER_MOVES, WIDE_MOVES, SLICE_MOVES, ROTATION_MOVES,
      LOCAL_VEC, KEY_TO_FACE, FACE_KEY, FACES, DEFAULT_SCHEME,
      createSolvedState, cloneState,
      applyMove, applyMoves, applyAlgString,
      worldDirOfLocal, currentColorAt, cubieColorSet, colorCounts,
      cubieAt, centerColor, isSolved,
      moveForLayer, randomScramble,
    };
  }

  return createNxNEngine;
});
