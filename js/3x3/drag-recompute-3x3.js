// 3x3 guided-solve bridge for direct sticker drag turns.
// controls-shared.js owns the actual drag gesture. Its pointerup listener runs
// in the normal bubble phase. This capture-phase listener observes the same
// completed gesture just before controls-shared consumes/clears layerDrag.
(function () {
  const canvas = typeof renderer !== 'undefined' ? renderer?.domElement : null;
  if (!canvas) return;

  canvas.addEventListener('pointerup', (event) => {
    if (typeof puzzleType !== 'undefined' && puzzleType !== '3x3') return;
    if (typeof layerDrag === 'undefined' || !layerDrag?.moved) return;
    if (typeof animating !== 'undefined' && animating) return;
    if (typeof moveQueue !== 'undefined' && moveQueue.length) return;
    if (typeof moveFromLayerDrag !== 'function') return;

    const move = moveFromLayerDrag(layerDrag, event);
    if (!move) return;
    window.Cube3x3GuideDragMove?.(move);
  }, true);
})();
