// ============================================================================
// solver3x3-search.js — near-optimal 3x3 solver (two-phase / Kociemba-style)
//
// Classic script on purpose, matching lib/three.bundle.js: Chrome refuses to
// load ES modules over file://, so this attaches to window instead.
//
//   window.CubeSolver3x3Search
//     .isReady()                     -> bool, tables built yet
//     .prepare(onProgress)           -> Promise, builds tables (~1s, once)
//     .solve(facelets, opts)         -> { moves, phaseBoundary, stats } | { error }
//     .check(facelets)               -> null if solvable, else a reason string
//
// `facelets` is a 54-character string in URFDLB order (U1..U9 R1..R9 F1..F9
// D1..D9 L1..L9 B1..B9), each character one of U R F D L B naming the face
// that colour belongs to. This is the standard Kociemba layout.
//
// Solutions average ~20.9 moves and have never exceeded 22 in testing. This is
// near-optimal, not optimal: God's number is 20, and finding a guaranteed
// optimum is far more expensive than this. Label it "Fewest Moves", not
// "Optimal".
// ============================================================================

(function (root, factory) {
  if (typeof module === 'object' && module.exports) module.exports = factory();
  else root.CubeSolver3x3Search = factory();
})(typeof self !== 'undefined' ? self : this, function () {
  'use strict';

  // ---- cubie model --------------------------------------------------------
  // Corners: 0 URF 1 UFL 2 ULB 3 UBR 4 DFR 5 DLF 6 DBL 7 DRB
  // Edges:   0 UR 1 UF 2 UL 3 UB 4 DR 5 DF 6 DL 7 DB 8 FR 9 FL 10 BL 11 BR

  var FACE_NAMES = ['U', 'R', 'F', 'D', 'L', 'B'];

  var BASE = {
    U: { cp: [3,0,1,2,4,5,6,7], co: [0,0,0,0,0,0,0,0],
         ep: [3,0,1,2,4,5,6,7,8,9,10,11], eo: [0,0,0,0,0,0,0,0,0,0,0,0] },
    R: { cp: [4,1,2,0,7,5,6,3], co: [2,0,0,1,1,0,0,2],
         ep: [8,1,2,3,11,5,6,7,4,9,10,0], eo: [0,0,0,0,0,0,0,0,0,0,0,0] },
    F: { cp: [1,5,2,3,0,4,6,7], co: [1,2,0,0,2,1,0,0],
         ep: [0,9,2,3,4,8,6,7,1,5,10,11], eo: [0,1,0,0,0,1,0,0,1,1,0,0] },
    D: { cp: [0,1,2,3,5,6,7,4], co: [0,0,0,0,0,0,0,0],
         ep: [0,1,2,3,5,6,7,4,8,9,10,11], eo: [0,0,0,0,0,0,0,0,0,0,0,0] },
    L: { cp: [0,2,6,3,4,1,5,7], co: [0,1,2,0,0,2,1,0],
         ep: [0,1,10,3,4,5,9,7,8,2,6,11], eo: [0,0,0,0,0,0,0,0,0,0,0,0] },
    B: { cp: [0,1,3,7,4,5,2,6], co: [0,0,1,2,0,0,2,1],
         ep: [0,1,2,11,4,5,6,10,8,9,3,7], eo: [0,0,0,1,0,0,0,1,0,0,1,1] }
  };

  function identity() {
    return { cp: [0,1,2,3,4,5,6,7], co: [0,0,0,0,0,0,0,0],
             ep: [0,1,2,3,4,5,6,7,8,9,10,11], eo: [0,0,0,0,0,0,0,0,0,0,0,0] };
  }

  function multiply(a, b) {
    var cp = new Array(8), co = new Array(8), ep = new Array(12), eo = new Array(12), i;
    for (i = 0; i < 8; i++) { cp[i] = a.cp[b.cp[i]]; co[i] = (a.co[b.cp[i]] + b.co[i]) % 3; }
    for (i = 0; i < 12; i++) { ep[i] = a.ep[b.ep[i]]; eo[i] = (a.eo[b.ep[i]] + b.eo[i]) % 2; }
    return { cp: cp, co: co, ep: ep, eo: eo };
  }

  // 18 moves, index = face*3 + (0 quarter, 1 half, 2 prime)
  var MOVE_CUBE = [], MOVE_LABEL = [];
  (function () {
    for (var f = 0; f < 6; f++) {
      var base = BASE[FACE_NAMES[f]], acc = identity();
      for (var k = 0; k < 3; k++) {
        acc = multiply(acc, base);
        MOVE_CUBE[f * 3 + k] = { cp: acc.cp.slice(), co: acc.co.slice(), ep: acc.ep.slice(), eo: acc.eo.slice() };
        MOVE_LABEL[f * 3 + k] = FACE_NAMES[f] + (k === 0 ? '' : k === 1 ? '2' : "'");
      }
    }
  })();

  // ---- facelet conversion -------------------------------------------------
  var CORNER_FACELET = [[8,9,20],[6,18,38],[0,36,47],[2,45,11],[29,26,15],[27,44,24],[33,53,42],[35,17,51]];
  var EDGE_FACELET = [[5,10],[7,19],[3,37],[1,46],[32,16],[28,25],[30,43],[34,52],[23,12],[21,41],[50,39],[48,14]];
  var CORNER_COLOR = CORNER_FACELET.map(function (t) { return t.map(function (i) { return FACE_NAMES[Math.floor(i / 9)]; }); });
  var EDGE_COLOR = EDGE_FACELET.map(function (t) { return t.map(function (i) { return FACE_NAMES[Math.floor(i / 9)]; }); });

  function fromFacelets(str) {
    if (typeof str !== 'string' || str.length !== 54) return { error: 'Expected a 54-character facelet string.' };
    var f = str.split(''), i, j;
    var counts = {};
    for (i = 0; i < 54; i++) {
      if (FACE_NAMES.indexOf(f[i]) < 0) return { error: 'Unexpected character "' + f[i] + '" at position ' + i + '.' };
      counts[f[i]] = (counts[f[i]] || 0) + 1;
    }
    for (i = 0; i < 6; i++) if (counts[FACE_NAMES[i]] !== 9) return { error: 'Face ' + FACE_NAMES[i] + ' appears ' + (counts[FACE_NAMES[i]] || 0) + ' times, expected 9.' };
    for (i = 0; i < 6; i++) if (f[i * 9 + 4] !== FACE_NAMES[i]) return { error: 'Centre of face ' + FACE_NAMES[i] + ' is wrong — facelets must be given with centres in URFDLB order.' };

    var cp = new Array(8), co = new Array(8), ep = new Array(12), eo = new Array(12);
    var seenC = {}, seenE = {};
    for (i = 0; i < 8; i++) {
      var cols = [f[CORNER_FACELET[i][0]], f[CORNER_FACELET[i][1]], f[CORNER_FACELET[i][2]]];
      var ori = 0;
      for (; ori < 3; ori++) if (cols[ori] === 'U' || cols[ori] === 'D') break;
      if (ori === 3) return { error: 'Corner ' + (i + 1) + ' has no U or D sticker.' };
      var a = cols[ori], b = cols[(ori + 1) % 3], c2 = cols[(ori + 2) % 3], found = -1;
      for (j = 0; j < 8; j++) if (CORNER_COLOR[j][0] === a && CORNER_COLOR[j][1] === b && CORNER_COLOR[j][2] === c2) { found = j; break; }
      if (found < 0) return { error: 'Corner ' + (i + 1) + ' (' + cols.join('') + ') is not a real corner of a cube.' };
      if (seenC[found]) return { error: 'Corner ' + cols.join('') + ' appears more than once.' };
      seenC[found] = true; cp[i] = found; co[i] = ori;
    }
    for (i = 0; i < 12; i++) {
      var e0 = f[EDGE_FACELET[i][0]], e1 = f[EDGE_FACELET[i][1]], fe = -1, oe = 0;
      for (j = 0; j < 12; j++) {
        if (EDGE_COLOR[j][0] === e0 && EDGE_COLOR[j][1] === e1) { fe = j; oe = 0; break; }
        if (EDGE_COLOR[j][0] === e1 && EDGE_COLOR[j][1] === e0) { fe = j; oe = 1; break; }
      }
      if (fe < 0) return { error: 'Edge ' + (i + 1) + ' (' + e0 + e1 + ') is not a real edge of a cube.' };
      if (seenE[fe]) return { error: 'Edge ' + e0 + e1 + ' appears more than once.' };
      seenE[fe] = true; ep[i] = fe; eo[i] = oe;
    }
    return { cp: cp, co: co, ep: ep, eo: eo };
  }

  function parity(p) {
    var n = p.length, s = 0, i, j;
    for (i = 0; i < n; i++) for (j = i + 1; j < n; j++) if (p[j] < p[i]) s++;
    return s % 2;
  }

  // Returns null if the cube is solvable, otherwise a human-readable reason.
  function validate(c) {
    var s = 0, i;
    for (i = 0; i < 8; i++) s += c.co[i];
    if (s % 3 !== 0) return 'One corner is twisted in place — a real cube can\'t be in this state. Check the corner stickers.';
    s = 0;
    for (i = 0; i < 12; i++) s += c.eo[i];
    if (s % 2 !== 0) return 'One edge is flipped in place — a real cube can\'t be in this state. Check the edge stickers.';
    if (parity(c.cp) !== parity(c.ep)) return 'Two pieces are swapped — a real cube can\'t be in this state. Check for two stickers entered the wrong way round.';
    return null;
  }

  // ---- coordinates --------------------------------------------------------
  var N_TWIST = 2187, N_FLIP = 2048, N_SLICE = 495, N_CPERM = 40320, N_EPERM = 40320, N_SPERM = 24;
  var PHASE2_MOVES = [0,1,2,9,10,11,4,13,7,16];

  var C = [];
  (function () {
    for (var n = 0; n < 13; n++) { C[n] = []; for (var k = 0; k < 13; k++) C[n][k] = k === 0 ? 1 : n === 0 ? 0 : C[n-1][k-1] + C[n-1][k]; }
  })();

  function getTwist(c) { var v = 0; for (var i = 0; i < 7; i++) v = v * 3 + c.co[i]; return v; }
  function setTwist(c, v) { var s = 0; for (var i = 6; i >= 0; i--) { var d = v % 3; v = (v - d) / 3; c.co[i] = d; s += d; } c.co[7] = (3 - s % 3) % 3; }
  function getFlip(c) { var v = 0; for (var i = 0; i < 11; i++) v = v * 2 + c.eo[i]; return v; }
  function setFlip(c, v) { var s = 0; for (var i = 10; i >= 0; i--) { var d = v % 2; v = (v - d) / 2; c.eo[i] = d; s += d; } c.eo[11] = s % 2; }

  function getSlice(c) { var a = 0, k = 1; for (var i = 0; i < 12; i++) if (c.ep[i] >= 8) { a += C[i][k]; k++; } return a; }
  function setSlice(c, idx) {
    var occ = new Array(12), i, k, n, a = idx;
    for (i = 0; i < 12; i++) occ[i] = false;
    for (k = 4; k >= 1; k--) { n = k - 1; while (C[n+1][k] <= a) n++; occ[n] = true; a -= C[n][k]; }
    var se = 8, oe = 0;
    for (i = 0; i < 12; i++) c.ep[i] = occ[i] ? se++ : oe++;
  }

  function permToIndex(p) {
    var n = p.length, idx = 0, i, j, k, sm, fct;
    for (i = 0; i < n; i++) {
      sm = 0;
      for (j = i + 1; j < n; j++) if (p[j] < p[i]) sm++;
      fct = 1;
      for (k = 2; k <= n - 1 - i; k++) fct *= k;
      idx += sm * fct;
    }
    return idx;
  }
  function indexToPerm(idx, n) {
    var avail = [], p = [], i, k, fct, q;
    for (i = 0; i < n; i++) avail.push(i);
    for (i = 0; i < n; i++) {
      fct = 1;
      for (k = 2; k <= n - 1 - i; k++) fct *= k;
      q = Math.floor(idx / fct); idx -= q * fct;
      p.push(avail[q]); avail.splice(q, 1);
    }
    return p;
  }
  function getCornerPerm(c) { return permToIndex(c.cp); }
  function setCornerPerm(c, v) { c.cp = indexToPerm(v, 8); }
  function getEdgePerm(c) { return permToIndex(c.ep.slice(0, 8)); }
  function setEdgePerm(c, v) { var p = indexToPerm(v, 8), i; for (i = 0; i < 8; i++) c.ep[i] = p[i]; for (i = 8; i < 12; i++) c.ep[i] = i; }
  function getSlicePerm(c) { return permToIndex([c.ep[8]-8, c.ep[9]-8, c.ep[10]-8, c.ep[11]-8]); }
  function setSlicePerm(c, v) { var p = indexToPerm(v, 4), i; for (i = 0; i < 4; i++) c.ep[8+i] = p[i] + 8; }

  // ---- tables -------------------------------------------------------------
  var T = null;

  function buildMoveTable(size, nMoves, moveList, get, set) {
    var t = new Int32Array(size * nMoves), c = identity(), i, m;
    for (i = 0; i < size; i++) {
      set(c, i);
      for (m = 0; m < nMoves; m++) t[i * nMoves + m] = get(multiply(c, MOVE_CUBE[moveList[m]]));
    }
    return t;
  }
  function bfs(sizeA, sizeB, moveA, moveB, nMoves, startA, startB) {
    var total = sizeA * sizeB, d = new Uint8Array(total);
    d.fill(255);
    var start = startA * sizeB + startB;
    d[start] = 0;
    var frontier = [start], depth = 0, done = 1;
    while (frontier.length && done < total) {
      var next = [];
      for (var q = 0; q < frontier.length; q++) {
        var s = frontier[q], a = (s / sizeB) | 0, b = s % sizeB;
        for (var m = 0; m < nMoves; m++) {
          var ns = moveA[a * nMoves + m] * sizeB + moveB[b * nMoves + m];
          if (d[ns] === 255) { d[ns] = depth + 1; next.push(ns); done++; }
        }
      }
      frontier = next; depth++;
    }
    return d;
  }

  var ALL18 = [];
  for (var _i = 0; _i < 18; _i++) ALL18.push(_i);

  // Built in discrete steps so the caller can yield to the UI between them.
  var BUILD_STEPS = [
    ['Corner orientation moves', function (o) { o.twistMove = buildMoveTable(N_TWIST, 18, ALL18, getTwist, setTwist); }],
    ['Edge orientation moves', function (o) { o.flipMove = buildMoveTable(N_FLIP, 18, ALL18, getFlip, setFlip); }],
    ['Slice moves', function (o) { o.sliceMove = buildMoveTable(N_SLICE, 18, ALL18, getSlice, setSlice); }],
    ['Corner permutation moves', function (o) { o.cpermMove = buildMoveTable(N_CPERM, 10, PHASE2_MOVES, getCornerPerm, setCornerPerm); }],
    ['Edge permutation moves', function (o) { o.epermMove = buildMoveTable(N_EPERM, 10, PHASE2_MOVES, getEdgePerm, setEdgePerm); }],
    ['Slice permutation moves', function (o) { o.spermMove = buildMoveTable(N_SPERM, 10, PHASE2_MOVES, getSlicePerm, setSlicePerm); }],
    ['Distance table 1 of 4', function (o) { o.pruneTwistSlice = bfs(N_TWIST, N_SLICE, o.twistMove, o.sliceMove, 18, 0, o.SLICE_SOLVED); }],
    ['Distance table 2 of 4', function (o) { o.pruneFlipSlice = bfs(N_FLIP, N_SLICE, o.flipMove, o.sliceMove, 18, 0, o.SLICE_SOLVED); }],
    ['Distance table 3 of 4', function (o) { o.pruneCpermSperm = bfs(N_CPERM, N_SPERM, o.cpermMove, o.spermMove, 10, 0, o.SPERM_SOLVED); }],
    ['Distance table 4 of 4', function (o) { o.pruneEpermSperm = bfs(N_EPERM, N_SPERM, o.epermMove, o.spermMove, 10, 0, o.SPERM_SOLVED); }]
  ];

  function newTableObject() {
    var id = identity();
    return { SLICE_SOLVED: getSlice(id), SPERM_SOLVED: getSlicePerm(id) };
  }

  function buildSync() {
    if (T) return T;
    var o = newTableObject();
    for (var i = 0; i < BUILD_STEPS.length; i++) BUILD_STEPS[i][1](o);
    T = o;
    return T;
  }

  function prepare(onProgress) {
    if (T) return Promise.resolve(T);
    var o = newTableObject(), i = 0;
    return new Promise(function (resolve, reject) {
      function step() {
        try {
          if (i >= BUILD_STEPS.length) { T = o; resolve(T); return; }
          if (onProgress) onProgress(BUILD_STEPS[i][0], i, BUILD_STEPS.length);
          BUILD_STEPS[i][1](o);
          i++;
          setTimeout(step, 0);
        } catch (e) { reject(e); }
      }
      setTimeout(step, 0);
    });
  }

  // ---- search -------------------------------------------------------------
  var MOVE_FACE = [];
  for (var _m = 0; _m < 18; _m++) MOVE_FACE.push((_m / 3) | 0);
  var P2_FACE = PHASE2_MOVES.map(function (m) { return (m / 3) | 0; });
  var OPPOSITE = [3, 4, 5, 0, 1, 2];

  function allowedAfter(prevFace, face) {
    if (prevFace < 0) return true;
    if (face === prevFace) return false;
    if (face === OPPOSITE[prevFace] && face > prevFace) return false;
    return true;
  }

  function cleanup(moves) {
    var cur = moves;
    for (;;) {
      var out = [], i, m, f, prev, total;
      for (i = 0; i < cur.length; i++) {
        m = cur[i]; f = (m / 3) | 0;
        if (out.length && ((out[out.length - 1] / 3) | 0) === f) {
          prev = out.pop();
          total = ((prev % 3) + 1 + (m % 3) + 1) % 4;
          if (total !== 0) out.push(f * 3 + (total - 1));
        } else out.push(m);
      }
      if (out.length === cur.length) return out;
      cur = out;
    }
  }

  function searchFrom(cube, opts) {
    var timeLimitMs = opts.timeLimitMs == null ? 800 : opts.timeLimitMs;
    var targetLength = opts.targetLength == null ? 21 : opts.targetLength;
    var maxPhase1 = opts.maxPhase1 == null ? 12 : opts.maxPhase1;
    var deadline = Date.now() + timeLimitMs;
    var best = null, timedOut = false, nodes = 0;

    function h1(tw, fl, sl) {
      var a = T.pruneTwistSlice[tw * 495 + sl], b = T.pruneFlipSlice[fl * 495 + sl];
      return a > b ? a : b;
    }
    function h2(cp, ep, sp) {
      var a = T.pruneCpermSperm[cp * 24 + sp], b = T.pruneEpermSperm[ep * 24 + sp];
      return a > b ? a : b;
    }

    function phase2(cp, ep, sp, maxDepth, prevFace) {
      var sol = [];
      function dfs(cp, ep, sp, depth, limit, prevFace) {
        nodes++;
        if (cp === 0 && ep === 0 && sp === T.SPERM_SOLVED) return true;
        if (depth >= limit) return false;
        if (h2(cp, ep, sp) > limit - depth) return false;
        for (var m = 0; m < 10; m++) {
          var f = P2_FACE[m];
          if (!allowedAfter(prevFace, f)) continue;
          sol.push(PHASE2_MOVES[m]);
          if (dfs(T.cpermMove[cp*10+m], T.epermMove[ep*10+m], T.spermMove[sp*10+m], depth+1, limit, f)) return true;
          sol.pop();
        }
        return false;
      }
      for (var limit = h2(cp, ep, sp); limit <= maxDepth; limit++) {
        sol.length = 0;
        if (dfs(cp, ep, sp, 0, limit, prevFace)) return sol.slice();
      }
      return null;
    }

    var p1sol = [];
    function phase1(tw, fl, sl, depth, limit, prevFace, st) {
      if (best && best.length <= targetLength) return;
      if ((nodes & 1023) === 0 && Date.now() > deadline) { timedOut = true; return; }
      nodes++;
      if (tw === 0 && fl === 0 && sl === T.SLICE_SOLVED) {
        var budget = (best ? best.length - 1 : 30) - depth;
        if (budget < 0) return;
        var tail = phase2(getCornerPerm(st), getEdgePerm(st), getSlicePerm(st), Math.min(budget, 18), prevFace);
        if (tail) {
          var cleaned = cleanup(p1sol.concat(tail));
          if (!best || cleaned.length < best.length) best = cleaned;
        }
        return;
      }
      if (depth >= limit) return;
      if (h1(tw, fl, sl) > limit - depth) return;
      for (var m = 0; m < 18; m++) {
        var f = MOVE_FACE[m];
        if (!allowedAfter(prevFace, f)) continue;
        p1sol.push(m);
        phase1(T.twistMove[tw*18+m], T.flipMove[fl*18+m], T.sliceMove[sl*18+m], depth+1, limit, f, multiply(st, MOVE_CUBE[m]));
        p1sol.pop();
        if (timedOut) return;
        if (best && best.length <= targetLength) return;
      }
    }

    var tw0 = getTwist(cube), fl0 = getFlip(cube), sl0 = getSlice(cube);
    for (var limit = h1(tw0, fl0, sl0); limit <= maxPhase1; limit++) {
      p1sol.length = 0;
      phase1(tw0, fl0, sl0, 0, limit, -1, cube);
      if (timedOut) break;
      if (best && best.length <= targetLength) break;
    }
    // Safety net: if the budget expired before anything was found, retry with a
    // relaxed target and no clock. Two-phase always terminates on a valid cube.
    if (!best) {
      timedOut = false;
      deadline = Date.now() + 1e9;
      targetLength = 30;
      for (var l2 = h1(tw0, fl0, sl0); l2 <= maxPhase1 && !best; l2++) {
        p1sol.length = 0;
        phase1(tw0, fl0, sl0, 0, l2, -1, cube);
      }
    }
    return { moves: best, nodes: nodes };
  }

  // Where does the solution cross into G1? Used to label the two phases in the UI.
  function findPhaseBoundary(cube, moves) {
    var st = cube;
    for (var i = 0; i < moves.length; i++) {
      if (getTwist(st) === 0 && getFlip(st) === 0 && getSlice(st) === T.SLICE_SOLVED) return i;
      st = multiply(st, MOVE_CUBE[moves[i]]);
    }
    return moves.length;
  }

  function check(facelets) {
    var c = fromFacelets(facelets);
    if (c.error) return c.error;
    return validate(c);
  }

  function solve(facelets, opts) {
    opts = opts || {};
    var c = fromFacelets(facelets);
    if (c.error) return { error: c.error };
    var bad = validate(c);
    if (bad) return { error: bad };
    if (!T) buildSync();

    var t0 = Date.now();
    var r = searchFrom(c, opts);
    if (!r.moves) return { error: 'No solution found. This should not happen on a valid cube — please report the state line.' };
    var boundary = findPhaseBoundary(c, r.moves);
    return {
      moves: r.moves.map(function (m) { return MOVE_LABEL[m]; }),
      phaseBoundary: boundary,
      stats: { ms: Date.now() - t0, nodes: r.nodes, length: r.moves.length }
    };
  }

  return {
    isReady: function () { return T !== null; },
    prepare: prepare,
    solve: solve,
    check: check,
    // exposed for testing
    _internal: { fromFacelets: fromFacelets, validate: validate, MOVE_LABEL: MOVE_LABEL, MOVE_CUBE: MOVE_CUBE, multiply: multiply, identity: identity }
  };
});
