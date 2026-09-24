// ---------- Puzzle registry + switching ----------
// Engines, renderers, solvers and specialized sidebars remain puzzle-specific.
// The registry supplies the small lifecycle surface shared by the application.
//
// Solve methods are NOT declared here. Each puzzle owns its own list in its own
// folder (js/<puzzle>/methods-<puzzle>.js) and the registry only reads it, so
// adding or changing a method never means editing this file or the HTML.
//
// NxN cubes also declare size and coords here. Everything shared — the cubie
// renderer, the mechanical core, state-line parsing, engine lookup — reads
// those fields rather than testing puzzle names, so adding a 5x5 or 6x6 means
// adding an entry below plus that cube's own folder.
//
// Coordinate convention: odd cubes use consecutive integers centered on 0 at
// positionScale 1.0; even cubes use odd integers at positionScale 0.5. Both
// give the same world spacing of 1.0 per layer. 5x5 would be [-2,-1,0,1,2] at
// 1.0; 6x6 would be [-5,-3,-1,1,3,5] at 0.5.
const cubeTypeSelect = document.getElementById('cubeTypeSelect');
const sidebar3x3 = document.getElementById('sidebar3x3');
const sidebar2x2 = document.getElementById('sidebar2x2');
const sidebar4x4 = document.getElementById('sidebar4x4');
const sidebar5x5 = document.getElementById('sidebar5x5');
const sidebar6x6 = document.getElementById('sidebar6x6');
const sidebarPyraminx = document.getElementById('sidebarPyraminx');
const sidebarMegaminx = document.getElementById('sidebarMegaminx');
const methodControl = document.getElementById('methodControl');


// Reads the puzzle's own methods-<puzzle>.js declaration. A missing or empty
// declaration hides the Method control rather than leaving a stale list on
// screen, and a puzzle whose declaration is absent is a load-order error worth
// failing loudly on.
function methodsForPuzzle(type){
  const declarations = {
    '3x3': window.PuzzleMethods3x3,
    '2x2': window.PuzzleMethods2x2,
    '4x4': window.PuzzleMethods4x4,
    '5x5': window.PuzzleMethods5x5,
    '6x6': window.PuzzleMethods6x6,
    'pyraminx': window.PuzzleMethodsPyraminx,
    'megaminx': window.PuzzleMethodsMegaminx
  };
  const declared = declarations[type];
  if (!declared) throw new Error('No solve-method declaration loaded for puzzle: ' + type);
  return { list: declared.list || [], default: declared.default || null };
}

function configureMethodMenuForPuzzle(type){
  const puzzle=PUZZLES[type];
  if(!puzzle) return;
  const methods=puzzle.methods;
  const current=solveMethodSelect.value;
  solveMethodSelect.replaceChildren(...methods.map(method => {
    const option=document.createElement('option');
    option.value=method.value; option.textContent=method.label;
    return option;
  }));
  // Only carry a selection across a puzzle switch if the new puzzle actually
  // offers that method. Method values are puzzle-specific, so this is normally
  // a fall back to the puzzle's own default.
  const preferred=methods.find(method=>method.value===current)?.value || puzzle.defaultMethod || methods[0]?.value;
  if(preferred) solveMethodSelect.value=preferred;
  methodControl.style.display=methods.length ? 'flex' : 'none';
}

function stopSharedPuzzleActivity() {
  // Invalidate any requestAnimationFrame callback already in flight.
  animationGeneration++;
  moveQueue.length = 0;
  animating = false;
  onQueueDrained = null;

  // Auto-play state now lives inside each puzzle's playback controller
  // (js/cube/solve-playback.js), so stopping it goes through reset() rather
  // than reaching into per-puzzle timer variables.
  if (typeof solvePlayback3x3 !== 'undefined') solvePlayback3x3.reset(false);
  if (typeof solvePlayback2x2 !== 'undefined') solvePlayback2x2.reset(false);
  if (typeof solvePlayback4x4 !== 'undefined') solvePlayback4x4.reset(false);
  if (typeof pyraminxAutoPlaying !== 'undefined') pyraminxAutoPlaying = false;
  if (typeof pyraminxAutoTimer !== 'undefined') clearTimeout(pyraminxAutoTimer);
}

function resetCubeState(createState) {
  cubeState = createState();
}

// ---------- Camera framing ----------
// Orbit limits are global on the controls object, so whichever puzzle set them
// last used to win: building the Megaminx left its limits in place after a
// switch back to a cube. Each puzzle now declares its own and they are applied
// on every switch.
//
// Every puzzle also starts fully zoomed out, at maxDistance. The zoom range
// itself is unchanged — this only sets where the camera begins.
const DEFAULT_CAMERA = { min: 4, max: 14 };

function applyPuzzleCamera(entry) {
  const settings = entry.camera || DEFAULT_CAMERA;
  controls.minDistance = settings.min;
  controls.maxDistance = settings.max;

  // A puzzle may declare its own opening view: a look-at point and a viewing
  // direction. This is where those live, not in the puzzle's builder, because
  // builders also run on Reset to Solved and a reset must not move the camera.
  if (settings.target) controls.target.set(...settings.target);

  // Otherwise keep whatever viewing angle the user is already on; only change
  // how far out the camera sits. Falls back to a sensible three-quarter view if
  // the camera is somehow sitting exactly on the target.
  const direction = settings.direction
    ? new THREE.Vector3(...settings.direction)
    : camera.position.clone().sub(controls.target);
  if (direction.lengthSq() < 1e-6) direction.set(0.55, 0.52, 0.66);
  direction.normalize();

  camera.position.copy(controls.target).addScaledVector(direction, settings.max);
  controls.update();
}

const PUZZLES = {
  '3x3': {
    id:'3x3', name:'3×3 Cube', sidebar:sidebar3x3, engine:E,
    createState:()=>E.createSolvedState(), positionScale:1.0,
    isNxN:true, size:3, coords:[-1,0,1],
    label:'3x3',
    scrambleLength:20,
    camera:{ min:4, max:14 },
    buildVisual:buildCube, animateMove:animateCubeMove, verifier:CubeVerifier3x3,
    methods:methodsForPuzzle('3x3').list,
    defaultMethod:methodsForPuzzle('3x3').default,
    hint:'drag to rotate view · click a sticker to set its color · centers are fixed',
    stop(){ stopAlgLoop(); },
    resetUI(){ clearVerifyResult(); resetSolveUI(); updateCubeStateLine(); updateNet(true); },
  },
  '2x2': {
    id:'2x2', name:'2×2 Cube', sidebar:sidebar2x2, engine:E,
    createState:()=>E.createSolvedState2x2(), positionScale:0.5,
    isNxN:true, size:2, coords:[-1,1],
    label:'2x2',
    scrambleLength:15,   // fewer pieces, fewer moves needed to mix well
    camera:{ min:4, max:14 },
    canInteract:()=>!algLooping2x2,
    buildVisual:buildCube, animateMove:animateCubeMove, verifier:CubeVerifier2x2,
    methods:methodsForPuzzle('2x2').list,
    defaultMethod:methodsForPuzzle('2x2').default,
    hint:'drag to rotate view · click a sticker to set its color · no fixed centers',
    stop(){ stopAlgLoop2x2(); },
    resetUI(){ clearVerifyResult2x2(); resetSolveUI2x2(); updateNet(true); },
  },
  '4x4': {
    id:'4x4', name:'4×4 Cube', sidebar:sidebar4x4, engine:E4,
    createState:()=>E4.createSolvedState(), positionScale:0.5,
    isNxN:true, size:4, coords:[-3,-1,1,3],
    label:'4x4',
    scrambleLength:40,
    camera:{ min:4, max:14 },
    buildVisual:buildCube, animateMove:animateCubeMove, verifier:CubeVerifier4x4,
    methods:methodsForPuzzle('4x4').list,
    defaultMethod:methodsForPuzzle('4x4').default,
    hint:'drag a sticker to turn its exact layer · wide and inner-slice buttons are available in the sidebar',
    stop(){},
    resetUI(){
      clearVerifyResult4x4();
      resetCenterSolveUI4x4();
      updateNet(true);
    },
  },
  '5x5': {
    id:'5x5', name:'5×5 Cube', sidebar:sidebar5x5, engine:E5,
    createState:()=>E5.createSolvedState(), positionScale:E5.POSITION_SCALE,
    isNxN:true, size:5, coords:E5.COORDS,
    label:'5x5',
    scrambleLength:60,
    camera:{ min:4, max:16 },
    buildVisual:buildCube, animateMove:animateCubeMove, verifier:CubeVerifier5x5,
    methods:methodsForPuzzle('5x5').list,
    defaultMethod:methodsForPuzzle('5x5').default,
    hint:'drag a sticker to turn its exact layer · wide, inner-slice and middle turns are in the sidebar',
    stop(){},
    // No solver, so there is no playback to reset — just the net and counts.
    resetUI(){ updateNet(true); },
  },

  '6x6': {
    id:'6x6', name:'6\u00d76 Cube', sidebar:sidebar6x6, engine:E6,
    createState:()=>E6.createSolvedState(), positionScale:E6.POSITION_SCALE,
    isNxN:true, size:6, coords:E6.COORDS,
    label:'6x6',
    scrambleLength:80,
    camera:{ min:5, max:18 },
    buildVisual:buildCube, animateMove:animateCubeMove, verifier:CubeVerifier6x6,
    methods:methodsForPuzzle('6x6').list,
    defaultMethod:methodsForPuzzle('6x6').default,
    hint:'drag a sticker to turn its exact layer \u00b7 wide and inner-slice turns are in the sidebar',
    stop(){},
    resetUI(){ updateNet(true); },
  },

  'megaminx': {
    id:'megaminx', name:'Megaminx', sidebar:sidebarMegaminx, engine:MG,
    createState:()=>MG.createSolvedState(), positionScale:1.0,
    isNxN:false,
    label:'Megaminx',
    camera:{ min:4.8, max:15, direction:[5.4,4.7,6.4] },
    buildVisual:buildMegaminx, animateMove:animateMegaminxMove, verifier:null,
    methods:methodsForPuzzle('megaminx').list,
    defaultMethod:methodsForPuzzle('megaminx').default,
    hint:'drag a sticker to turn that face · drag the background to rotate the view',
    stop(){}, resetUI(){ updateMegaminxStatus(); },
  },
  'pyraminx': {
    id:'pyraminx', name:'Pyraminx', sidebar:sidebarPyraminx, engine:P,
    createState:()=>P.createSolvedState(), positionScale:1.0,
    isNxN:false,
    label:'Pyraminx',
    camera:{ min:4, max:14, direction:[4.4,3.25,5.8], target:[0,0.15,0] },
    buildVisual:buildPyraminx, animateMove:animatePyraminxMove, verifier:null,
    methods:methodsForPuzzle('pyraminx').list,
    defaultMethod:methodsForPuzzle('pyraminx').default,
    hint:'drag to rotate view · use the Pyraminx move buttons to turn layers',
    stop(){}, resetUI(){ updatePyraminxHUD('—'); },
  },
};

let activePuzzle = PUZZLES[puzzleType];
configureMethodMenuForPuzzle(puzzleType);

// The puzzle dropdown is listed in numeric order, so its first option is not
// the puzzle the app boots with. Set it explicitly rather than relying on the
// markup order matching the initial puzzleType.
cubeTypeSelect.value = puzzleType;

// The 2D View control lives in the viewport and is owned by js/cube/net-nxn.js,
// which loads before this registry exists. Show it now that it can tell which
// puzzle is active. Same for the palette sticker counts, which need the cube
// size from the registry to know what a correct count is.
if (typeof updateNet === 'function') updateNet(true);
if (typeof updateSwatchCounts === 'function') updateSwatchCounts();
applyPuzzleCamera(activePuzzle);

// ---------- Topbar context + viewport hint ----------
// Both driven by the registry. The hint was previously only applied inside
// switchPuzzle, so the value hardcoded in the markup showed until the first
// puzzle change. Setting it here covers the initial load too.
const topbarContext = document.getElementById('topbarContext');
const viewportHint = document.getElementById('viewportHint');

function updatePuzzleContext() {
  const entry = PUZZLES[puzzleType];
  if (!entry) return;

  if (viewportHint && entry.hint) viewportHint.textContent = entry.hint;

  if (topbarContext) {
    const methodLabel = entry.methods.find(m => m.value === solveMethodSelect.value)?.label;
    topbarContext.textContent = methodLabel
      ? `${entry.label} \u00b7 ${methodLabel}`
      : `${entry.label} \u00b7 no solver yet`;
  }
}

solveMethodSelect.addEventListener('change', updatePuzzleContext);
updatePuzzleContext();

function switchPuzzle(type) {
  if (type === puzzleType) return;
  const nextPuzzle = PUZZLES[type];
  if (!nextPuzzle) throw new Error('Unknown puzzle type: ' + type);

  activePuzzle?.stop?.();
  stopSharedPuzzleActivity();

  puzzleType = type;
  activePuzzle = nextPuzzle;
  resetCubeState(activePuzzle.createState);
  POS_SCALE = activePuzzle.positionScale;
  activePuzzle.buildVisual();
  // After buildVisual, so a builder that sets the camera itself does not win.
  applyPuzzleCamera(activePuzzle);
  // The shared mechanical core belongs to NxN cubes only; hide or resize it for
  // whatever we just switched to. The net rebuilds itself when the cube size
  // changes, and hides for non-NxN puzzles.
  if (typeof updateCubeCore === 'function') updateCubeCore();
  if (typeof updateNet === 'function') updateNet(true);
  configureMethodMenuForPuzzle(type);
  updatePuzzleContext();

  for (const puzzle of Object.values(PUZZLES)) {
    puzzle.sidebar.style.display = puzzle === activePuzzle ? '' : 'none';
  }

  // Clear both inactive and active puzzle displays so no stale result survives
  // a switch; then initialize the selected puzzle's own controls.
  clearVerifyResult();
  clearVerifyResult2x2();
  clearVerifyResult4x4();
  resetSolveUI();
  resetSolveUI2x2();
  activePuzzle.resetUI();
  updateNet(true);
  if (typeof updateMegaminxStatus === 'function' && puzzleType === 'megaminx') updateMegaminxStatus();
}

// Backward-compatible name while existing code and saved notes still refer to
// cube-type switching. New puzzle code should call switchPuzzle directly.
const switchCubeType = switchPuzzle;

cubeTypeSelect.addEventListener('change', () => switchPuzzle(cubeTypeSelect.value));

