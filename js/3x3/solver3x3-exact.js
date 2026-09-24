// ============================================================================
// solver3x3-exact.js — exact shortest-path pre-search for near-solved 3x3s.
//
// Bidirectional BFS. For max depth N, the solved-side cache uses floor(N/2)
// and the live-cube search uses ceil(N/2). Thus depth 7 becomes 3 + 4.
// Any solution within N moves must cross those two search radii, so the best
// joined path is provably shortest within the configured depth.
// ============================================================================
(function(root, factory){
  if (typeof module === 'object' && module.exports) module.exports = factory();
  else root.CubeSolver3x3Exact = factory();
})(typeof self !== 'undefined' ? self : this, function(){
  'use strict';

  var MOVES = [
    'U', "U'", 'U2', 'D', "D'", 'D2',
    'R', "R'", 'R2', 'L', "L'", 'L2',
    'F', "F'", 'F2', 'B', "B'", 'B2'
  ];
  var solvedCaches = new Map();

  function getE(){
    var E = (typeof window !== 'undefined' ? window.CubeEngine : null);
    if (!E) throw new Error('CubeEngine is not loaded.');
    return E;
  }
  function getBridge(){
    var B = (typeof window !== 'undefined' ? window.CubeSolverBridge : null);
    if (!B) throw new Error('CubeSolverBridge is not loaded.');
    return B;
  }
  function inverseMove(m){
    if (m.endsWith('2')) return m;
    if (m.endsWith("'")) return m.slice(0,-1);
    return m + "'";
  }
  function faceOf(m){ return m[0]; }
  function clone(E, state){ return E.cloneState ? E.cloneState(state) : JSON.parse(JSON.stringify(state)); }
  function signature(B, state){ return B.toFacelets(state); }

  function buildSolvedRadius(radius){
    if (solvedCaches.has(radius)) return solvedCaches.get(radius);
    var E = getE(), B = getBridge();
    var start = E.createSolvedState();
    var sig0 = signature(B, start);
    var map = new Map();
    map.set(sig0, { depth: 0, pathToSolved: [] });
    var frontier = [{ state: start, depth: 0, lastFace: null, pathToSolved: [] }];
    var head = 0;

    while (head < frontier.length) {
      var node = frontier[head++];
      if (node.depth >= radius) continue;
      for (var i=0;i<MOVES.length;i++) {
        var mv = MOVES[i];
        if (faceOf(mv) === node.lastFace) continue;
        var child = clone(E, node.state);
        E.applyMove(child, mv);
        var sig = signature(B, child);
        if (map.has(sig)) continue;
        var pathToSolved = [inverseMove(mv)].concat(node.pathToSolved);
        map.set(sig, { depth: node.depth + 1, pathToSolved: pathToSolved });
        frontier.push({ state: child, depth: node.depth + 1, lastFace: faceOf(mv), pathToSolved: pathToSolved });
      }
    }
    solvedCaches.set(radius, map);
    return map;
  }

  function find(state, maxDepth){
    maxDepth = maxDepth == null ? 8 : maxDepth;
    if (maxDepth < 0 || maxDepth > 8) throw new Error('Exact pre-search currently supports depths 0 through 8.');

    var solvedRadius = Math.floor(maxDepth / 2);
    var liveRadius = Math.ceil(maxDepth / 2);
    var t0 = (typeof performance !== 'undefined' ? performance.now() : Date.now());
    var E = getE(), B = getBridge();
    var solvedMap = buildSolvedRadius(solvedRadius);
    var start = clone(E, state);
    var startSig = signature(B, start);
    var direct = solvedMap.get(startSig);
    if (direct && direct.depth <= maxDepth) {
      return { found: true, moves: direct.pathToSolved.slice(), depth: direct.depth, nodes: 1, ms: ((typeof performance !== 'undefined' ? performance.now() : Date.now()) - t0), solvedRadius: solvedRadius, liveRadius: liveRadius };
    }

    var seen = new Map();
    seen.set(startSig, []);
    var frontier = [{ state: start, path: [], lastFace: null }];
    var head = 0;
    var best = null;
    var nodes = 0;

    while (head < frontier.length) {
      var node = frontier[head++];
      nodes++;
      if (node.path.length >= liveRadius) continue;
      for (var i=0;i<MOVES.length;i++) {
        var mv = MOVES[i];
        if (faceOf(mv) === node.lastFace) continue;
        var child = clone(E, node.state);
        E.applyMove(child, mv);
        var path = node.path.concat(mv);
        var sig = signature(B, child);
        if (seen.has(sig)) continue;
        seen.set(sig, path);

        var other = solvedMap.get(sig);
        if (other) {
          var total = path.length + other.depth;
          if (total <= maxDepth && (!best || total < best.moves.length)) {
            best = { moves: path.concat(other.pathToSolved), depth: total };
          }
        }
        frontier.push({ state: child, path: path, lastFace: faceOf(mv) });
      }
    }

    var t1 = (typeof performance !== 'undefined' ? performance.now() : Date.now());
    if (!best) return { found: false, moves: [], depth: null, nodes: nodes, ms: t1 - t0, solvedRadius: solvedRadius, liveRadius: liveRadius };
    return { found: true, moves: best.moves, depth: best.depth, nodes: nodes, ms: t1 - t0, solvedRadius: solvedRadius, liveRadius: liveRadius };
  }

  return {
    find: find,
    warmup: function(maxDepth){ return buildSolvedRadius(Math.floor((maxDepth == null ? 8 : maxDepth) / 2)); },
    maxDepth: 8
  };
});
