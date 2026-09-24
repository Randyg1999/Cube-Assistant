// ---------- Render loop ----------
// updateNet() is called every frame but is cheap when there is nothing to do:
// it returns immediately unless the 2D view is expanded, and even then it
// rebuilds stickers only when the computed face signature actually changes.
function tick() {
  controls.update();
  updateNet();
  renderer.render(scene, camera);
  requestAnimationFrame(tick);
}
tick();
