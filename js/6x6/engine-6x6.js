// ---------- 6x6 engine ----------
// Built from the shared NxN kinematics core. Being even, the 6x6 has no fixed
// centres and no middle slice, and uses coordinates [-5,-3,-1,1,3,5] at
// positionScale 0.5 — the same family as the 4x4.
//
// Move set generated for N=6:
//   outer   U D R L F B
//   wide    Uw ... Bw          two layers
//           3Uw ... 3Bw        three layers
//   slices  2U ... 2B          the layer behind each outer face
//           3U ... 3B          the layer behind that
//   no M/E/S: an even cube has no layer at coordinate 0
//
// No solver yet. The 6x6 is the expensive one to solve: oblique centres come in
// mirror-image pairs that x-centre techniques cannot handle, and it inherits
// both OLL and PLL parity from the even family. See docs/NXN-ROADMAP.txt.
(function (root) {
  if (typeof root.createNxNEngine !== 'function') {
    throw new Error('js/cube/nxn-kinematics.js must load before the 6x6 engine.');
  }
  root.SixBySixEngine = root.createNxNEngine(6);
})(typeof self !== 'undefined' ? self : this);
