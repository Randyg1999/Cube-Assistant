// ============================================================================
// solver3x3-bridge.js — converts a CubeEngine state into the 54-character
// URFDLB facelet string that solver3x3-search.js expects, and back.
//
// Load AFTER js/3x3/solver3x3-search.js and after the CubeEngine <script> block.
//
//   window.CubeSolverBridge
//     .toFacelets(engineState)          -> 54-char string, or throws
//     .solveFewestMoves(engineState, o) -> { moves, phaseBoundary, stats } | { error }
//     .selfTest()                       -> { passed, failures } — runs 200 random
//                                          scrambles through engine -> solver ->
//                                          engine and checks each one solves
//
// Why this file exists separately: solver3x3-search.js knows nothing about the
// app's cubie/rotation-matrix representation, and the app's engine knows nothing
// about Kociemba coordinates. Keeping the translation in one small place means
// neither side has to change if the other does.
//
// The FACELET_MAP table below was generated from an independent 3D geometric
// model, not written by hand — each entry is the cubie coordinate and outward
// face direction of one sticker, in standard URFDLB order.
// ============================================================================

(function (root, factory) {
  if (typeof module === 'object' && module.exports) module.exports = factory();
  else root.CubeSolverBridge = factory();
})(typeof self !== 'undefined' ? self : this, function () {
  'use strict';

  // [x, y, z, worldFaceKey] for each of the 54 facelets, in URFDLB order.
  var FACELET_MAP = [
    /* U */ [-1,1,-1,'+y'],[0,1,-1,'+y'],[1,1,-1,'+y'],[-1,1,0,'+y'],[0,1,0,'+y'],[1,1,0,'+y'],[-1,1,1,'+y'],[0,1,1,'+y'],[1,1,1,'+y'],
    /* R */ [1,1,1,'+x'],[1,1,0,'+x'],[1,1,-1,'+x'],[1,0,1,'+x'],[1,0,0,'+x'],[1,0,-1,'+x'],[1,-1,1,'+x'],[1,-1,0,'+x'],[1,-1,-1,'+x'],
    /* F */ [-1,1,1,'+z'],[0,1,1,'+z'],[1,1,1,'+z'],[-1,0,1,'+z'],[0,0,1,'+z'],[1,0,1,'+z'],[-1,-1,1,'+z'],[0,-1,1,'+z'],[1,-1,1,'+z'],
    /* D */ [-1,-1,1,'-y'],[0,-1,1,'-y'],[1,-1,1,'-y'],[-1,-1,0,'-y'],[0,-1,0,'-y'],[1,-1,0,'-y'],[-1,-1,-1,'-y'],[0,-1,-1,'-y'],[1,-1,-1,'-y'],
    /* L */ [-1,1,-1,'-x'],[-1,1,0,'-x'],[-1,1,1,'-x'],[-1,0,-1,'-x'],[-1,0,0,'-x'],[-1,0,1,'-x'],[-1,-1,-1,'-x'],[-1,-1,0,'-x'],[-1,-1,1,'-x'],
    /* B */ [1,1,-1,'-z'],[0,1,-1,'-z'],[-1,1,-1,'-z'],[1,0,-1,'-z'],[0,0,-1,'-z'],[-1,0,-1,'-z'],[1,-1,-1,'-z'],[0,-1,-1,'-z'],[-1,-1,-1,'-z']
  ];

  var FACE_ORDER = ['U', 'R', 'F', 'D', 'L', 'B'];

  function engine() {
    var E = (typeof window !== 'undefined' ? window.CubeEngine : null);
    if (!E) throw new Error('CubeEngine is not loaded.');
    return E;
  }

  // Build the colour -> face-letter map from the cube's own centres, so this
  // works with a recoloured palette and with any Set Front / Set Top choice.
  function centreMap(E, state) {
    var map = {}, i, col, seen = {};
    for (i = 0; i < 6; i++) {
      col = E.centerColor(state, FACE_ORDER[i]);
      if (col == null) throw new Error('Centre of face ' + FACE_ORDER[i] + ' has no colour.');
      if (seen[col]) throw new Error('Two centres share the colour "' + col + '" — the cube can\'t be read.');
      seen[col] = true;
      map[col] = FACE_ORDER[i];
    }
    return map;
  }

  function toFacelets(state, E) {
    E = E || engine();
    var map = centreMap(E, state);
    var byPos = {}, i, c;
    for (i = 0; i < state.cubies.length; i++) {
      c = state.cubies[i];
      byPos[c.pos[0] + ',' + c.pos[1] + ',' + c.pos[2]] = c;
    }
    var out = '', m, cub, col;
    for (i = 0; i < 54; i++) {
      m = FACELET_MAP[i];
      cub = byPos[m[0] + ',' + m[1] + ',' + m[2]];
      if (!cub) throw new Error('No cubie at ' + m.slice(0, 3).join(',') + '.');
      col = E.currentColorAt(cub, m[3]);
      if (col == null) throw new Error('Sticker ' + i + ' has no colour.');
      if (!map[col]) throw new Error('Sticker colour "' + col + '" does not match any centre.');
      out += map[col];
    }
    return out;
  }

  function solveFewestMoves(state, opts) {
    var S = (typeof window !== 'undefined' ? window.CubeSolver3x3Search : null);
    if (!S) return { error: 'solver3x3-search.js is not loaded.' };
    var facelets;
    try { facelets = toFacelets(state); }
    catch (e) { return { error: e.message }; }
    return S.solve(facelets, opts || {});
  }

  // End-to-end check inside the app's own engine: scramble with the engine,
  // read it out, solve, play the solution back through the engine, confirm solved.
  function selfTest(n) {
    n = n || 200;
    var E = engine();
    var S = window.CubeSolver3x3Search;
    var failures = [], i, j, scramble, state, res;
    for (i = 0; i < n; i++) {
      state = E.createSolvedState();
      scramble = E.randomScramble(25);
      E.applyMoves(state, scramble);
      res = solveFewestMoves(state, { timeLimitMs: 600 });
      if (res.error) { failures.push({ scramble: scramble.join(' '), error: res.error }); continue; }
      for (j = 0; j < res.moves.length; j++) E.applyMove(state, res.moves[j]);
      if (!E.isSolved(state)) {
        failures.push({ scramble: scramble.join(' '), solution: res.moves.join(' '), error: 'did not solve' });
      }
    }
    return { passed: n - failures.length, of: n, failures: failures };
  }

  return {
    toFacelets: toFacelets,
    solveFewestMoves: solveFewestMoves,
    selfTest: selfTest,
    FACELET_MAP: FACELET_MAP
  };
});
