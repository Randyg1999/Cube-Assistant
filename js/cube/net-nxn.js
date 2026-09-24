// ---------- Shared live 2D net for every NxN cube ----------
// One net for all cube sizes. Cells are derived from the puzzle's declared
// coordinate set, so a 5x5 or 6x6 needs no new table, no new markup and no new
// CSS — only a registry entry.
//
// Replaces three hand-written implementations (NET_FACE_CELLS_2X2, _3X3 and the
// 4x4's) that each had their own DOM grid, update function and signature cache.
//
// The whole widget lives in the top-right of the 3D viewport rather than in the
// sidebar. Collapsed it is a small "2D View" button; expanded it is the net with
// a close control. The three per-sidebar checkboxes it replaced are gone, which
// is what freed the sidebar space.
//
// Unfolding is the standard cross the CSS lays out:
//        U
//    L   F   R   B
//        D
// Face rows run top to bottom, cells left to right, as that face appears when
// the net is folded back up. The rule that fixes every orientation is that
// touching edges in the net must be touching stickers on the cube: U's bottom
// row is the row adjacent to F, D's top row is the row adjacent to F, and so on.

const NET_FACE_ORDER = ['U', 'L', 'F', 'R', 'B', 'D'];

const netElement = document.getElementById('cubeNet');
let netExpanded = false;
let netBuiltForSize = null;
let lastNetSignature = '';
let netFaceElements = null;

// The frame the user is holding the puzzle in, as three world vectors. Falls
// back to the canonical frame before controls-orientation.js has loaded.
function netHeldFrame() {
  if (typeof faceShowing !== 'function' || typeof FACE_VECTORS === 'undefined') return null;
  const frontFace = faceShowing(heldFrontColor);
  const topFace = faceShowing(heldTopColor);
  if (!frontFace || !topFace) return null;
  const f = FACE_VECTORS[frontFace];
  const u = FACE_VECTORS[topFace];
  return { f, u, r: holdingCrossVector(u, f) };
}

function netWorldKey(normal) {
  const axes = ['x', 'y', 'z'];
  for (let i = 0; i < 3; i++) if (normal[i] !== 0) return (normal[i] > 0 ? '+' : '-') + axes[i];
  return null;
}

// Cell coordinates for each face of the unfolded cross, expressed in the frame
// the puzzle is being held in rather than in fixed world axes.
//
// Each face gets an outward normal n plus two in-plane axes: a runs left to
// right across the face, b runs top to bottom. Those are chosen so that edges
// touching in the net are stickers touching on the cube — U's bottom row is the
// row against F, D's top row is the row against F, and so on.
function netCellsFor(coords) {
  const asc = coords.slice().sort((x, y) => x - y);
  const high = asc[asc.length - 1];
  const frame = netHeldFrame() || { f: [0, 0, 1], u: [0, 1, 0], r: [1, 0, 0] };
  const neg = v => v.map(x => -x);

  const axesFor = {
    U: { n: frame.u,       a: frame.r,      b: frame.f },
    D: { n: neg(frame.u),  a: frame.r,      b: neg(frame.f) },
    F: { n: frame.f,       a: frame.r,      b: neg(frame.u) },
    B: { n: neg(frame.f),  a: neg(frame.r), b: neg(frame.u) },
    R: { n: frame.r,       a: neg(frame.f), b: neg(frame.u) },
    L: { n: neg(frame.r),  a: frame.f,      b: neg(frame.u) },
  };

  const out = {};
  for (const face of NET_FACE_ORDER) {
    const { n, a, b } = axesFor[face];
    const cells = [];
    for (const down of asc) {
      for (const across of asc) {
        cells.push([0, 1, 2].map(i => n[i] * high + a[i] * across + b[i] * down));
      }
    }
    out[face] = { cells, worldKey: netWorldKey(n) };
  }
  return out;
}

// Builds the collapsed pill and the expanded panel once per cube size. Rebuilt
// only when the size changes, not on every update.
function buildNetDom(size) {
  const pill = document.createElement('button');
  pill.type = 'button';
  pill.className = 'net-pill';
  pill.textContent = '2D View';
  pill.setAttribute('aria-expanded', 'false');
  pill.addEventListener('click', () => setNetExpanded(true));

  const panel = document.createElement('div');
  panel.className = 'net-panel';

  const close = document.createElement('button');
  close.type = 'button';
  close.className = 'net-close';
  close.innerHTML = '&times;';
  close.title = 'Collapse the 2D view';
  close.setAttribute('aria-label', 'Collapse the 2D view');
  close.addEventListener('click', () => setNetExpanded(false));

  const grid = document.createElement('div');
  grid.className = 'net-grid';
  grid.style.setProperty('--net-n', String(size));
  // Face box grows with the cube so a 6x6 sticker stays readable without the
  // whole net swallowing the viewport corner.
  grid.style.setProperty('--net-face-size', (56 + 9 * size) + 'px');
  grid.style.setProperty('--net-face-size-sm', (36 + 7 * size) + 'px');
  grid.style.setProperty('--net-cell-gap', size <= 3 ? '3px' : '2px');

  netFaceElements = {};
  for (const face of NET_FACE_ORDER) {
    const faceEl = document.createElement('div');
    faceEl.className = 'net-face';
    faceEl.dataset.face = face;
    grid.appendChild(faceEl);
    netFaceElements[face] = faceEl;
  }

  panel.append(close, grid);
  netElement.replaceChildren(pill, panel);
  netBuiltForSize = size;
  lastNetSignature = '';
}

function setNetExpanded(expanded) {
  netExpanded = expanded;
  netElement?.classList.toggle('expanded', expanded);
  netElement?.querySelector('.net-pill')?.setAttribute('aria-expanded', String(expanded));
  if (expanded) updateNet(true);
}

function updateNet(force = false) {
  if (!netElement) return;

  // Non-NxN puzzles have their own renderers and no cubie grid to unfold, so
  // the whole widget goes away rather than showing an empty frame.
  const entry = (typeof PUZZLES !== 'undefined') ? PUZZLES[puzzleType] : null;
  const applies = Boolean(entry?.isNxN);
  netElement.classList.toggle('available', applies);
  if (!applies) return;

  if (netBuiltForSize !== entry.size) buildNetDom(entry.size);
  netElement.classList.toggle('expanded', netExpanded);
  if (!netExpanded || !cubeState?.cubies) return;

  const engine = cubeEngineForType();
  const cells = netCellsFor(entry.coords);
  const faces = {};
  for (const face of NET_FACE_ORDER) {
    const { cells: positions, worldKey } = cells[face];
    faces[face] = positions.map(pos => {
      const cubie = cubeState.cubies.find(c =>
        c.pos[0] === pos[0] && c.pos[1] === pos[1] && c.pos[2] === pos[2]
      );
      return cubie ? engine.currentColorAt(cubie, worldKey) : null;
    });
  }

  const signature = JSON.stringify(faces);
  if (!force && signature === lastNetSignature) return;
  lastNetSignature = signature;

  for (const [face, codes] of Object.entries(faces)) {
    const faceEl = netFaceElements?.[face];
    if (!faceEl) continue;
    faceEl.replaceChildren(...codes.map(code => {
      const cell = document.createElement('div');
      cell.className = 'net-sticker';
      cell.style.background = code && HEX[code] ? HEX[code] : '#555';
      cell.title = `${face}: ${code || 'unknown'}`;
      return cell;
    }));
  }
}
