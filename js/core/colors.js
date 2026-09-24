// ---------- Color scheme ----------
const OFFICIAL_HEX = { W:'#FFFFFF', Y:'#FFD500', R:'#C41E3A', O:'#FF5800', G:'#009E60', B:'#0051BA' };
const HEX = { ...OFFICIAL_HEX };
const PLASTIC = '#14161b';
const CYCLE_ORDER = ['W','Y','R','O','G','B'];
const LOCAL_FACE_ORDER = ['+x','-x','+y','-y','+z','-z']; // matches BoxGeometry material group order
const FACE_LABELS = { F:'Front', B:'Back', U:'Top', D:'Bottom', R:'Right', L:'Left' };
const paletteInputs = {};
const paletteLabels = {};
const FACE_VECTORS = { R:[1,0,0], L:[-1,0,0], U:[0,1,0], D:[0,-1,0], F:[0,0,1], B:[0,0,-1] };
// Default holding orientation: the WCA scrambling orientation, white on top and
// green in front. The 3x3 Beginner and CFOP solves turn this over to yellow top
// (white down) when they start, the way a cuber flips the cube after scrambling.
let heldFrontColor = 'G';
let heldTopColor = 'W';


function cubeAppearanceMode() {
  return window.CUBE_APPEARANCE_MODE || 'standard';
}

function makeCubeStickerMaterial(color, options = {}) {
  const mode = cubeAppearanceMode();
  const common = { color, ...options };
  if (mode === 'mirror') {
    return new THREE.MeshPhysicalMaterial({
      ...common,
      roughness: options.roughness ?? 0.12,
      metalness: options.metalness ?? 0.82,
      clearcoat: options.clearcoat ?? 1.0,
      clearcoatRoughness: options.clearcoatRoughness ?? 0.08,
      reflectivity: options.reflectivity ?? 1.0,
    });
  }
  return new THREE.MeshStandardMaterial({
    ...common,
    roughness: options.roughness ?? 0.42,
    metalness: options.metalness ?? 0.04,
  });
}

