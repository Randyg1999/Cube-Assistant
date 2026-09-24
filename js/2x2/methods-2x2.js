// ---------- 2x2 solve methods ----------
// The 2x2 owns this list. js/2x2/solve-2x2.js dispatches on these exact values
// and throws on anything else.
//
//   2x2Beginner -> S.solveFirstLayer2x2 / S.solveLastLayer2x2 in
//                  js/cube/cube-solver.js
//   2x2Optimal  -> js/2x2/solver2x2-optimal.js (window.CubeSolver2x2Optimal),
//                  reading js/data/policy-2x2.js

window.PuzzleMethods2x2 = {
  list: [
    { value: '2x2Beginner', label: 'Beginner Solve' },
    { value: '2x2Optimal',  label: 'Shortest Move Solve' }
  ],
  default: '2x2Beginner'
};
