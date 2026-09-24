// ---------- NxN sidebar template ----------
// Builds the 2x2, 3x3 and 4x4 sidebars from one template so a new cube size is
// a descriptor rather than sixty lines of copied markup. Replaces three
// hand-written blocks that differed mostly by id suffix.
//
// This file must load BEFORE every script that looks these elements up, which
// means before js/core/bootstrap.js.
//
// STEP ONE of the sidebar work: the generated ids are byte-identical to the
// ones the markup used, so no consumer changes. Step two moves to scoped
// lookup so the ids stop being global; until then, do not rename anything here.
//
// The Pyraminx and Megaminx sidebars stay as hand-written markup. They share
// almost nothing with the cubes, and forcing them through this template would
// make it more complicated than what it replaces.

(function () {

// Every cube declares only what differs. Shape follows the 3x3, which is the
// reference layout; other cubes drop what does not apply to them.
const NXN_SIDEBARS = [
  {
    suffix: '',
    sidebarId: 'sidebar3x3',
    visible: true,
    paletteNote: 'Centers are fixed \u2014 they never move on a real cube.',
    orientation: true,            // needs fixed centres, so odd cubes only
    solver: true,
    learn: 'Resets the cube to solved, then repeats the algorithm continuously (at the Guided Solve speed below) so you can watch what it does each time.',
    solveTitle: 'Guided Solve \u2014 Full Solve',
    computeButton: false,         // Next Move doubles as Compute
    speedMax: 2,
    stateLine: true,
    scan: true,
    idleDesc: 'Press "Compute Solution" to work out the moves for your scrambled cube.',
    roadmap: 'The Standard Beginner method solves the cube <b>end to end</b> \u2014 cross, white corners, middle-layer edges and the last layer \u2014 using deterministic beginner algorithms. CFOP and Kociemba Two-Phase are separate solvers selected from the Method menu.',
  },
  {
    suffix: '2x2',
    sidebarId: 'sidebar2x2',
    visible: false,
    orientation: true,            // every NxN gets one; see faceReferenceColor
    solver: true,
    paletteNote: 'No fixed centers on a 2x2 \u2014 every sticker can move.',
    learn: 'Resets the cube to solved, then repeats the algorithm continuously so you can watch what it does each time.',
    solveTitle: 'Guided Solve \u2014 Full Solve',
    computeButton: false,
    speedMax: 2,
    stateLine: false,
    scan: false,
    idleDesc: 'Press "Compute Solution" to work out the moves for your scrambled cube.',
    roadmap: 'Choose <b>Beginner Solve</b> for the two-stage instructional method: First Layer, then Last Layer. Choose <b>Shortest Move Solve</b> for a complete optimal-policy lookup covering every rotationally distinct 2x2 state, with a proven maximum of 11 moves.',
  },
  {
    suffix: '4x4',
    sidebarId: 'sidebar4x4',
    visible: false,
    orientation: true,
    solver: true,
    paletteNote: 'All 24 center pieces move on a 4x4 \u2014 there are no fixed centers.',
    movesNote: 'Outer turns use R/L/U/D/F/B. Wide turns use Rw/Lw/Uw/Dw/Fw/Bw. Inner slices use 2R/2L/2U/2D/2F/2B.',
    learn: null,                  // no algorithm library for the 4x4 yet
    solveTitle: 'Guided Solve \u2014 Reduction',
    computeButton: true,          // dedicated Compute Solution button
    speedMax: 3,                  // a 270-move reduction wants a faster top end
    stateLine: false,
    scan: false,
    idleDesc: 'Press "Compute Solution" to plan the full reduction: centers, wing pairing, parity, and the beginner 3\u00d73 finish.',
    roadmap: 'Solver path: <b>Centers \u2192 pair wings \u2192 reduced 3x3 \u2192 OLL/PLL parity when required.</b> All stages are planned in one pass from the current state.',
  },
  {
    suffix: '5x5',
    sidebarId: 'sidebar5x5',
    visible: false,
    paletteNote: 'Centres are fixed on a 5x5, like a 3x3 \u2014 the corner, edge and centre pieces around them all move.',
    orientation: true,            // odd cube, so it has fixed centres
    solver: false,                // geometry and turning only, for now
    movesNote: 'Outer turns use R/L/U/D/F/B. Wide turns use Rw/Lw/Uw/Dw/Fw/Bw. Inner slices use 2R/2L/2U/2D/2F/2B. M/E/S turn the true middle layer.',
    learn: null,
    solveTitle: 'Guided Solve',
    computeButton: false,
    speedMax: 3,
    stateLine: false,
    scan: false,
    idleDesc: '',
    roadmap: 'Geometry, colour entry, turning and scramble are active. There is no 5x5 solver yet \u2014 reduction (centres \u2192 pair edges \u2192 solve as a 3x3) is the next stage. Being an odd cube it has fixed centres to build against and no parity cases.',
  },
  {
    suffix: '6x6',
    sidebarId: 'sidebar6x6',
    visible: false,
    paletteNote: 'No fixed centres on a 6x6 \u2014 all 96 centre pieces move, like a 4x4.',
    orientation: true,            // even cube, but holding orientation still applies
    solver: false,
    movesNote: 'Outer turns use R/L/U/D/F/B. Wide turns use Rw (two layers) and 3Rw (three). Inner slices use 2R and 3R. No M/E/S \u2014 an even cube has no middle layer.',
    learn: null,
    solveTitle: 'Guided Solve',
    computeButton: false,
    speedMax: 3,
    stateLine: false,
    scan: false,
    idleDesc: '',
    roadmap: 'Geometry, colour entry, turning and scramble are active. There is no 6x6 solver yet. It is the expensive one: oblique centres come in mirror-image pairs that x-centre techniques cannot handle, and it inherits both OLL and PLL parity from the even family.',
  },
];

const FIELD_STYLE = "flex:1;resize:vertical;font-family:'IBM Plex Mono',monospace;font-size:10px;background:var(--panel-2);color:var(--text);border:1px solid var(--border);border-radius:6px;padding:7px;";
const SELECT_STYLE = 'flex:1;background:var(--panel-2);color:var(--text);border:1px solid var(--border);border-radius:5px;padding:6px;font-size:12px;';
const DEBUG_STYLE = "white-space:pre-wrap;max-height:180px;overflow:auto;font-family:'IBM Plex Mono',monospace;font-size:10px;color:var(--text);";

function paletteSection(cube, id) {
  // The 3x3 keeps id="editSection" on this block. Nothing reads it, but the
  // name is long-standing and harmless to preserve.
  const sectionId = cube.suffix === '' ? ' id="editSection"' : '';
  return `
      <div class="section"${sectionId}>
        <div class="section-title">Color Palette</div>
        <div class="swatches" id="${id('swatchLegend')}"></div>
        <button class="btn" id="${id('resetColorsBtn')}">Default Colors</button>
        <div class="status-line">${cube.paletteNote}</div>
        <button class="btn primary" id="${id('verifyBtn')}">Verify Cube</button>
        <div id="${id('verifyResult')}"></div>
      </div>`;
}

// Pulled out of the Color Palette section so collapsing the palette no longer
// takes the orientation controls with it. Suffixed like everything else, since
// every odd cube gets one and unsuffixed ids would collide.
function orientationSection(id) {
  return `
      <div class="section">
        <div class="section-title">Holding Orientation</div>
        <div class="orientation-control">
          <div class="row">
            <button class="btn active" id="${id('setFrontBtn')}">Set Front</button>
            <button class="btn" id="${id('setTopBtn')}">Set Top</button>
          </div>
          <div class="status-line" id="${id('orientationStatus')}">Click a colour swatch above to set the Front face.</div>
        </div>
      </div>`;
}

function movesSection(cube, id) {
  const note = cube.movesNote ? `\n        <div class="status-line">${cube.movesNote}</div>` : '';
  return `
      <div class="section">
        <div class="section-title">Manual Moves</div>${note}
        <div class="move-grid" id="${id('moveGrid')}"></div>
      </div>`;
}

function learnSection(cube, id) {
  if (!cube.learn) return '';
  // The 3x3 block keeps id="learnSection"; the 2x2's never had one.
  const sectionId = cube.suffix === '' ? ' id="learnSection"' : '';
  return `
      <div class="section"${sectionId} data-collapsed="true">
        <div class="section-title">Learn an Algorithm</div>
        <div class="row">
          <select id="${id('algSelect')}" style="${SELECT_STYLE}"></select>
        </div>
        <div class="status-line" id="${id('algDesc')}"></div>
        <div class="row">
          <button class="btn primary" id="${id('algPlayBtn')}">Start Loop</button>
          <button class="btn" id="${id('algStopBtn')}" disabled>Stop</button>
        </div>
        <div class="hint">${cube.learn}</div>
      </div>`;
}

function stateLineBlock(cube, id) {
  if (!cube.stateLine) return '';
  return `
        <div class="status-line">Cube state line \u2014 copy this into chat to share the exact current state.</div>
        <div class="row">
          <textarea id="cubeStateLine" readonly rows="3" style="${FIELD_STYLE}"></textarea>
          <button class="btn" id="copyStateBtn" style="flex:0 0 82px;">Copy<br>State</button>
        </div>
        <div class="row">
          <textarea id="loadStateLine" rows="3" placeholder="Paste an RCS1 state line here..." style="${FIELD_STYLE}"></textarea>
          <button class="btn" id="loadStateBtn" style="flex:0 0 82px;">Load<br>State</button>
        </div>`;
}

function scanBlock(cube) {
  if (!cube.scan) return '';
  return `
        <div class="row">
          <button class="btn primary" id="scanCubeBtn">Scan a Physical Cube with your Camera</button>
        </div>`;
}

function solveSection(cube, id) {
  // A cube with no solver still needs Scramble and Reset, but showing a HUD and
  // playback controls that cannot do anything would be worse than showing
  // nothing. Those cubes get the buttons and an explanation.
  if (!cube.solver) {
    return `
      <div class="section" id="${id('solveSection')}">
        <div class="section-title">${cube.solveTitle}</div>
        <div class="row">
          <button class="btn" id="${id('scrambleBtn')}">Scramble</button>
          <button class="btn danger" id="${id('resetBtn')}">Reset to Solved</button>
        </div>
        <div class="roadmap">${cube.roadmap}</div>
      </div>`;
  }

  // Cubes with a dedicated Compute button start with the playback controls
  // disabled; cubes where Next doubles as Compute do not.
  const off = cube.computeButton ? ' disabled' : '';
  const computeBtn = cube.computeButton
    ? `\n          <button class="btn primary" id="${id('solveBtn')}">Compute Solution</button>`
    : '';

  return `
      <div class="section" id="${id('solveSection')}">
        <div class="section-title">${cube.solveTitle}</div>
        <div class="row">
          <button class="btn" id="${id('scrambleBtn')}">Scramble</button>
          <button class="btn danger" id="${id('resetBtn')}">Reset to Solved</button>
        </div>
        <div class="hud">
          <div class="hud-step" id="${id('hudStep')}">Ready</div>
          <div class="hud-move" id="${id('hudMove')}">&mdash;</div>
          <div class="hud-desc" id="${id('hudDesc')}">${cube.idleDesc}</div>
          <div class="progress-bar"><div class="progress-fill" id="${id('progressFill')}" style="width:0%;"></div></div>
        </div>
        <div class="row">${computeBtn}
          <button class="btn primary" id="${id('nextMoveBtn')}"${off}>Next Move</button>
          <button class="btn" id="${id('autoPlayBtn')}"${off}>Auto-Play</button>
          <button class="btn" id="${id('backMoveBtn')}"${off}>Back</button>
        </div>
        <div class="speed-control">
          <div class="speed-label">
            <span>Solve Speed</span>
            <span class="speed-value" id="${id('speedValue')}">1.0&times;</span>
          </div>
          <input id="${id('speedSlider')}" type="range" min="0.25" max="${cube.speedMax}" step="0.25" value="1" aria-label="Solve animation speed">
        </div>${stateLineBlock(cube, id)}${scanBlock(cube)}
        <details id="${id('cornerDebugDetails')}" style="font-size:11px;color:var(--muted);">
          <summary>Guided step diagnostics</summary>
          <pre id="${id('cornerDebug')}" style="${DEBUG_STYLE}"></pre>
        </details>
        <div class="roadmap">${cube.roadmap}</div>
      </div>`;
}

// Base names the template emits, so the element map can be collected without
// each consumer re-deriving id strings. Conditional ones are added per cube.
const ALWAYS_EMITTED = [
  'swatchLegend', 'resetColorsBtn', 'verifyBtn', 'verifyResult',
  'moveGrid', 'solveSection', 'scrambleBtn', 'resetBtn',
];

const SOLVER_EMITTED = [
  'hudStep', 'hudMove', 'hudDesc', 'progressFill',
  'nextMoveBtn', 'autoPlayBtn', 'backMoveBtn',
  'speedSlider', 'speedValue', 'cornerDebugDetails', 'cornerDebug',
];

function collectElements(root, cube) {
  const id = base => base + cube.suffix;
  const names = ALWAYS_EMITTED.slice();
  if (cube.orientation) names.push('setFrontBtn', 'setTopBtn', 'orientationStatus');
  if (cube.solver) names.push(...SOLVER_EMITTED);
  if (cube.computeButton) names.push('solveBtn');
  if (cube.learn) names.push('algSelect', 'algDesc', 'algPlayBtn', 'algStopBtn');

  const map = {};
  for (const name of names) {
    const found = root.querySelector('#' + id(name));
    // The template just wrote this markup, so a miss means the emitter and this
    // list have drifted apart. Fail loudly rather than hand back undefined and
    // let a consumer silently no-op, which is how a diagnostics panel once got
    // written to an element that did not exist.
    if (!found) throw new Error(`Sidebar template emitted no #${id(name)} for ${cube.sidebarId}.`);
    map[name] = found;
  }
  return Object.freeze(map);
}

function buildSidebar(cube) {
  const id = base => base + cube.suffix;
  const el = document.createElement('div');
  el.className = 'sidebar';
  el.id = cube.sidebarId;
  if (!cube.visible) el.style.display = 'none';
  el.innerHTML = [
    paletteSection(cube, id),
    cube.orientation ? orientationSection(id) : '',
    movesSection(cube, id),
    learnSection(cube, id),
    solveSection(cube, id),
  ].join('\n');
  return el;
}

const layout = document.querySelector('.layout');
if (!layout) throw new Error('Sidebar template could not find .layout.');

// Insert after the viewport, before the hand-written Pyraminx and Megaminx
// sidebars, so DOM order matches the previous markup.
const viewport = document.getElementById('viewport');
let anchor = viewport;
const elementsByPuzzle = {};
for (const cube of NXN_SIDEBARS) {
  const built = buildSidebar(cube);
  anchor.after(built);
  anchor = built;
  elementsByPuzzle[cube.suffix || '3x3'] = collectElements(built, cube);
}

// Per-puzzle element maps, so consumers never rebuild id strings themselves.
// Keyed by puzzle id: '3x3', '2x2', '4x4'.
window.SidebarElements = Object.freeze(elementsByPuzzle);

// Fetch a puzzle's elements, asserting the ones the caller depends on. Passing
// the names you use turns a template/consumer mismatch into a load-time error
// instead of a control that quietly does nothing.
window.sidebarElements = function (puzzleId, required = []) {
  const map = window.SidebarElements[puzzleId];
  if (!map) throw new Error('No generated sidebar for puzzle: ' + puzzleId);
  for (const name of required) {
    if (!map[name]) throw new Error(`Sidebar ${puzzleId} has no element named ${name}.`);
  }
  return map;
};

})();
