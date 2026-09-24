// ---------- 5x5 engine ----------
// The whole engine, built from the shared NxN kinematics core. Being odd, the
// 5x5 gets fixed centres, a true middle slice (M/E/S) and coordinates
// [-2,-1,0,1,2] at positionScale 1.0 — the same family as the 3x3.
//
// Move set generated for N=5:
//   outer   U D R L F B
//   wide    Uw Dw Rw Lw Fw Bw          (outer layer + the one behind it)
//   slices  2U 2D 2R 2L 2F 2B          (the layer behind each outer face)
//   middle  M E S                      (coordinate 0, odd cubes only)
//
// No solver yet. See docs/NXN-ROADMAP.txt.
(function (root) {
  if (typeof root.createNxNEngine !== 'function') {
    throw new Error('js/cube/nxn-kinematics.js must load before the 5x5 engine.');
  }
  root.FiveByFiveEngine = root.createNxNEngine(5);
})(typeof self !== 'undefined' ? self : this);
