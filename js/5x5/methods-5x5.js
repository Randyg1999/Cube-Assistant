// ---------- 5x5 solve methods ----------
// No solver yet — geometry, entry, turning and scramble only. An empty list
// hides the Method dropdown rather than offering a control that does nothing,
// exactly as the Megaminx does.
//
// When a reduction solver lands it goes in js/5x5/ and gets an entry here.
// Being an odd cube, the 5x5 has fixed centres to build against and no parity
// cases, which is why it is the cheaper of the two remaining sizes.

window.PuzzleMethods5x5 = {
  list: [],
  default: null,
};
