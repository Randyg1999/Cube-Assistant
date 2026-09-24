// ---------- Camera-scanner hand-off (opens cube_scanner_prototype.html in its own window) ----------
// A separate top-level window rather than an iframe: on file:// a cross-origin iframe is denied
// camera access (no prompt appears at all), but a top-level file:// document gets the camera the
// same way the standalone scanner does. The scanner posts an RCS1 line back via its opener when
// the user hits "Load into solver"; we feed it into the existing, validated Load State path.
(function(){
  const openBtn = document.getElementById('scanCubeBtn');
  let scanWin = null;
  if (openBtn) openBtn.addEventListener('click', () => {
    scanWin = window.open('cube_scanner_prototype.html', 'cubeScanner', 'width=1200,height=920');
  });
  window.addEventListener('message', e => {
    if (!e.data || e.data.type !== 'cubeScanner:load') return;
    if (scanWin && e.source !== scanWin) return; // only the window we opened
    const input = document.getElementById('loadStateLine');
    const btn = document.getElementById('loadStateBtn');
    if (input && btn){ input.value = e.data.rcs1; btn.click(); } // reuse the validated load path
    try { window.focus(); } catch(_){}
  });
})();
