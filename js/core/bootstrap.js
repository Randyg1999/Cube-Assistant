// Three and its two addons arrive as globals from lib/three.bundle.js.
// These classic external scripts are deliberately compatible with file://.
const THREE = window.THREE;
const { OrbitControls, RoundedBoxGeometry } = window;
if (!THREE) {
  document.body.innerHTML = '<div style="padding:24px;font-family:system-ui;color:#e2a099">' +
    'lib/three.bundle.js did not load. Restore it from backup, or rebuild it with ' +
    'esbuild from three 0.185.1 (see docs/OFFLINE-LIB.txt), then reopen this file.</div>';
  throw new Error('three.bundle.js missing');
}

const E = window.CubeEngine;
const E4 = window.FourByFourEngine;
const S = window.CubeSolver;
const P = window.PyraminxEngine;
const MG = window.MegaminxEngine;
const E5 = window.FiveByFiveEngine;
const E6 = window.SixBySixEngine;

// Large precomputed policy tables live outside the application source.
const TWO_BY_TWO_OPTIMAL_POLICY_B64 = window.TWO_BY_TWO_OPTIMAL_POLICY_B64 || '';
const PYRAMINX_OPTIMAL_POLICY_RLE_B64 = window.PYRAMINX_OPTIMAL_POLICY_RLE_B64 || '';


// Shared method selector; declared explicitly rather than relying on DOM id globals.
const solveMethodSelect = document.getElementById('solveMethodSelect');
