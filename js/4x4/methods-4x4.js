// ---------- 4x4 solve methods ----------
// The 4x4 owns this list. Note that the 4x4's guided solve is currently driven
// by its own staged buttons in the sidebar (Compute Centers / Wing Pairs /
// 3x3 Finish) rather than by the shared Method dropdown; this entry exists so
// the dropdown reports the method in use and so the 4x4 is registered the same
// way as every other puzzle.

window.PuzzleMethods4x4 = {
  list: [
    { value: '4x4Reduction', label: 'Beginner Reduction' }
  ],
  default: '4x4Reduction'
};
