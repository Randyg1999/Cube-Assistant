// ---------- 3x3 solve methods ----------
// The 3x3 owns this list. js/app/puzzle-switching.js reads it to build the
// Method dropdown; js/3x3/solve-3x3.js dispatches on these exact values and
// throws on anything else. Adding or removing a 3x3 method means editing this
// file and the dispatcher in solve-3x3.js — nothing outside js/3x3/.
//
// Every method here is backed by its own solver module and shares no solving
// code with the other methods:
//   standard  -> js/3x3/solver3x3-beginner.js   (window.CubeSolver3x3Beginner)
//   cfop      -> js/3x3/solver3x3-cfop.js       (window.CubeSolver3x3CFOP)
//   kociemba  -> js/3x3/solver3x3-exact.js + solver3x3-search.js + -bridge.js

window.PuzzleMethods3x3 = {
  list: [
    { value: 'standard', label: 'Standard Beginner' },
    { value: 'cfop',     label: 'CFOP' },
    { value: 'kociemba', label: 'Kociemba Two-Phase' }
  ],
  default: 'standard'
};
