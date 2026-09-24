// ============================================================================
// Rubik's Cube logical engine — pure JS, no DOM/Three.js dependency.
// Works in Node (for testing) and in the browser (for the app).
// ============================================================================

(function (root, factory) {
  if (typeof module === 'object' && module.exports) {
    module.exports = factory(require('../core/cube-math.js'));
  } else {
    root.CubeEngine = factory(root.CubeMath);
  }
})(typeof self !== 'undefined' ? self : this, function (CubeMath) {
  if (!CubeMath) throw new Error('CubeMath is required before CubeEngine.');
  const { IDENTITY, matMulVec, matMulMat, axisIndex, rotMatrix, vecKey } = CubeMath;

  // Move table. layer=+1 clockwise => -90deg; layer=-1 clockwise => +90deg (derived from
  // "clockwise as viewed from outside that face" convention). Prime flips sign, 2 = 180.
  const FACE_DEF = {
    R: {axis:'x', layer: 1}, L: {axis:'x', layer:-1},
    U: {axis:'y', layer: 1}, D: {axis:'y', layer:-1},
    F: {axis:'z', layer: 1}, B: {axis:'z', layer:-1},
  };
  const MOVES = {};
  Object.entries(FACE_DEF).forEach(([face, def]) => {
    const baseDeg = def.layer === 1 ? -90 : 90;
    MOVES[face]        = { axis: def.axis, layer: def.layer, deg: baseDeg };
    MOVES[face+"'"]     = { axis: def.axis, layer: def.layer, deg: -baseDeg };
    MOVES[face+"2"]     = { axis: def.axis, layer: def.layer, deg: 180 };
  });
  const ALL_MOVES = Object.keys(MOVES);

  // Middle-slice moves (M, E, S) — deliberately added to MOVES *after* ALL_MOVES is captured
  // above, so the solver's search space (which is built from ALL_MOVES) is unaffected. These
  // exist so the engine can execute/animate a middle-layer turn when driven interactively
  // (click-drag, manual buttons). Each follows the rotation direction of its outer-face
  // companion, per standard cube notation: M follows L, E follows D, S follows F.
  const MIDDLE_FACE_DEF = {
    M: { axis: 'x', layer: 0, follows: 'L' },
    E: { axis: 'y', layer: 0, follows: 'D' },
    S: { axis: 'z', layer: 0, follows: 'F' },
  };
  Object.entries(MIDDLE_FACE_DEF).forEach(([face, def]) => {
    const baseDeg = MOVES[def.follows].deg;
    MOVES[face]     = { axis: def.axis, layer: def.layer, deg: baseDeg };
    MOVES[face+"'"] = { axis: def.axis, layer: def.layer, deg: -baseDeg };
    MOVES[face+"2"] = { axis: def.axis, layer: def.layer, deg: 180 };
  });

  const LOCAL_VEC = {'+x':[1,0,0],'-x':[-1,0,0],'+y':[0,1,0],'-y':[0,-1,0],'+z':[0,0,1],'-z':[0,0,-1]};
  const KEY_TO_FACE = {};
  Object.entries(LOCAL_VEC).forEach(([k,v]) => { KEY_TO_FACE[vecKey(v)] = k; });

  const FACE_KEY = {U:'+y', D:'-y', R:'+x', L:'-x', F:'+z', B:'-z'};
  const FACE_POS = {U:[0,1,0], D:[0,-1,0], R:[1,0,0], L:[-1,0,0], F:[0,0,1], B:[0,0,-1]};
  const FACES = ['U','D','R','L','F','B'];

  // Default color scheme (short codes): the standard Western scheme in the WCA
  // scrambling orientation (Regulation 4d1) — white on top, green in front,
  // red on the right. Opposites: white/yellow, green/blue, red/orange.
  const DEFAULT_SCHEME = {'+x':'R', '-x':'O', '+y':'W', '-y':'Y', '+z':'G', '-z':'B'};

  // The same scheme turned over (a z2 rotation): white on the bottom, yellow on
  // top, green still in front. This is how a cube is held to solve with the
  // usual white-first methods, and it is the frame the human-method solvers
  // (2x2 Beginner, 3x3 Beginner and CFOP, the 4x4 reduction) are written and
  // validated in. Solvers target it; the displayed cube rests in DEFAULT_SCHEME.
  const WHITE_DOWN_SCHEME = {'+x':'O', '-x':'R', '+y':'Y', '-y':'W', '+z':'G', '-z':'B'};

  function createSolvedState(scheme){
    scheme = scheme || DEFAULT_SCHEME;
    const cubies = [];
    for (let x=-1;x<=1;x++) for (let y=-1;y<=1;y++) for (let z=-1;z<=1;z++){
      if (x===0 && y===0 && z===0) continue;
      const stickers = {
        '+x': x=== 1 ? scheme['+x'] : null,
        '-x': x===-1 ? scheme['-x'] : null,
        '+y': y=== 1 ? scheme['+y'] : null,
        '-y': y===-1 ? scheme['-y'] : null,
        '+z': z=== 1 ? scheme['+z'] : null,
        '-z': z===-1 ? scheme['-z'] : null,
      };
      cubies.push({ pos:[x,y,z], ori: [[1,0,0],[0,1,0],[0,0,1]], stickers, id: Object.values(stickers).filter(v=>v!=null).sort().join(',') });
    }
    return { cubies };
  }

  // A 2x2 is just the 8 corners of a 3x3 — no centers, no edges, no fixed color
  // reference. Reuses the exact same sticker-assignment logic as createSolvedState,
  // just over the {-1,1} coordinate domain instead of {-1,0,1}, so there's no risk
  // of it drifting from the 3x3 scheme/geometry conventions.
  function createSolvedState2x2(scheme){
    scheme = scheme || DEFAULT_SCHEME;
    const cubies = [];
    for (const x of [-1,1]) for (const y of [-1,1]) for (const z of [-1,1]){
      const stickers = {
        '+x': x=== 1 ? scheme['+x'] : null,
        '-x': x===-1 ? scheme['-x'] : null,
        '+y': y=== 1 ? scheme['+y'] : null,
        '-y': y===-1 ? scheme['-y'] : null,
        '+z': z=== 1 ? scheme['+z'] : null,
        '-z': z===-1 ? scheme['-z'] : null,
      };
      cubies.push({ pos:[x,y,z], ori: [[1,0,0],[0,1,0],[0,0,1]], stickers, id: Object.values(stickers).filter(v=>v!=null).sort().join(',') });
    }
    return { cubies };
  }

  function buildColorIndex(state){
    const idx = {};
    for (const c of state.cubies) idx[c.id] = c;
    return idx;
  }

  function cloneState(state){
    return {
      cubies: state.cubies.map(c => ({
        pos: c.pos.slice(),
        ori: c.ori.map(r=>r.slice()),
        stickers: Object.assign({}, c.stickers),
        id: c.id,
      }))
    };
  }

  function idFromColors(colors){ return colors.slice().sort().join(','); }
  function findCubieById(state, id){
    for (const c of state.cubies) if (c.id === id) return c;
    return undefined;
  }

  function applyMove(state, moveName){
    const mv = MOVES[moveName];
    if (!mv) throw new Error('Unknown move: '+moveName);
    const R = rotMatrix(mv.axis, mv.deg);
    const ai = axisIndex(mv.axis);
    for (const c of state.cubies){
      if (c.pos[ai] === mv.layer){
        c.pos = matMulVec(R, c.pos).map(Math.round);
        c.ori = matMulMat(R, c.ori);
      }
    }
  }

  function applyMoves(state, moves){
    for (const m of moves) applyMove(state, m);
  }

  function applyAlgString(state, alg){
    const moves = alg.trim().split(/\s+/).filter(Boolean);
    applyMoves(state, moves);
    return moves;
  }

  // ---------- White-down solving frame (3x3) ----------
  // A 3x3's centers never move, so a white-first solver can only build on the
  // bottom if the cube is turned over. flipToWhiteDown returns a copy rotated
  // 180 degrees about the front axis (z2): white center on D, yellow on U, green
  // still F. A move planned on that copy maps back to the real cube by
  // moveFromWhiteDown: U<->D and R<->L swap names with the same direction, F and
  // B and S are unchanged, and M and E reverse (their axes flip under z2).
  // Verified: 5,000 random sequences over all 27 move types reproduce the same
  // physical result.
  const Z2 = rotMatrix('z', 180);
  function flipToWhiteDown(state){
    const copy = cloneState(state);
    for (const c of copy.cubies){
      c.pos = matMulVec(Z2, c.pos).map(Math.round);
      c.ori = matMulMat(Z2, c.ori);
    }
    return copy;
  }
  const Z2_FACE = { U:'D', D:'U', R:'L', L:'R', F:'F', B:'B', S:'S' };
  function moveFromWhiteDown(move){
    const face = move[0], suffix = move.slice(1);
    if (Z2_FACE[face]) return Z2_FACE[face] + suffix;
    if (face === 'M' || face === 'E') return face + (suffix === "'" ? '' : suffix === '2' ? '2' : "'");
    throw new Error('No white-down translation for move: ' + move);
  }

  function worldDirOfLocal(cubie, localKey){
    const v = matMulVec(cubie.ori, LOCAL_VEC[localKey]);
    return KEY_TO_FACE[vecKey(v)];
  }

  function currentColorAt(cubie, worldFaceKey){
    for (const localKey of Object.keys(cubie.stickers)){
      const color = cubie.stickers[localKey];
      if (color == null) continue;
      if (worldDirOfLocal(cubie, localKey) === worldFaceKey) return color;
    }
    return null;
  }

  function cubieColorSet(cubie){
    return Object.values(cubie.stickers).filter(v => v != null);
  }

  function findCubieByColors(state, colors){
    const target = colors.slice().sort().join(',');
    return state.cubies.find(c => cubieColorSet(c).slice().sort().join(',') === target);
  }

  function centerColor(state, face){
    const p = FACE_POS[face];
    const c = state.cubies.find(cu => cu.pos[0]===p[0] && cu.pos[1]===p[1] && cu.pos[2]===p[2]);
    return currentColorAt(c, FACE_KEY[face]);
  }

  function isSolved(state){
    for (const face of FACES){
      const col = centerColor(state, face);
      for (const c of state.cubies){
        const cc = currentColorAt(c, FACE_KEY[face]);
        if (cc != null && cc !== col) return false;
      }
    }
    return true;
  }

  // 2x2 has no center pieces to read a "this face's color" reference from, so
  // solved is checked directly: every face must show one uniform color, and no
  // two faces can show the same color.
  function isSolved2x2(state){
    const seen = new Set();
    for (const face of FACES){
      const key = FACE_KEY[face];
      const colorsOnFace = new Set();
      for (const c of state.cubies){
        const cc = currentColorAt(c, key);
        if (cc != null) colorsOnFace.add(cc);
      }
      if (colorsOnFace.size !== 1) return false;
      const col = [...colorsOnFace][0];
      if (seen.has(col)) return false;
      seen.add(col);
    }
    return true;
  }

  function colorCounts(state){
    const counts = {};
    for (const c of state.cubies){
      for (const v of Object.values(c.stickers)){
        if (v == null) continue;
        counts[v] = (counts[v]||0) + 1;
      }
    }
    return counts;
  }

  function validateState(state, expectedPerColor){
    expectedPerColor = expectedPerColor || 9;
    const counts = colorCounts(state);
    const colors = Object.keys(counts);
    const errors = [];
    if (colors.length !== 6) errors.push('Expected exactly 6 distinct colors, found ' + colors.length + '.');
    for (const [color, n] of Object.entries(counts)){
      if (n !== expectedPerColor) errors.push('Color "'+color+'" appears '+n+' times (expected '+expectedPerColor+').');
    }
    return { valid: errors.length === 0, errors };
  }

  function randomScramble(n){
    n = n || 25;
    const moves = [];
    let lastFace = null;
    const faces = Object.keys(FACE_DEF);
    for (let i=0;i<n;i++){
      let face;
      do { face = faces[Math.floor(Math.random()*faces.length)]; } while (face === lastFace);
      lastFace = face;
      const suffix = ['', "'", '2'][Math.floor(Math.random()*3)];
      moves.push(face+suffix);
    }
    return moves;
  }

  const CORNER_SLOTS_3X3 = [
    { name:'URF', pos:[ 1, 1, 1], faces:['U','R','F'] },
    { name:'UFL', pos:[-1, 1, 1], faces:['U','F','L'] },
    { name:'ULB', pos:[-1, 1,-1], faces:['U','L','B'] },
    { name:'UBR', pos:[ 1, 1,-1], faces:['U','B','R'] },
    { name:'DFR', pos:[ 1,-1, 1], faces:['D','F','R'] },
    { name:'DLF', pos:[-1,-1, 1], faces:['D','L','F'] },
    { name:'DBL', pos:[-1,-1,-1], faces:['D','B','L'] },
    { name:'DRB', pos:[ 1,-1,-1], faces:['D','R','B'] },
  ];

  const EDGE_SLOTS_3X3 = [
    { name:'UR', pos:[ 1, 1, 0], faces:['U','R'] },
    { name:'UF', pos:[ 0, 1, 1], faces:['U','F'] },
    { name:'UL', pos:[-1, 1, 0], faces:['U','L'] },
    { name:'UB', pos:[ 0, 1,-1], faces:['U','B'] },
    { name:'DR', pos:[ 1,-1, 0], faces:['D','R'] },
    { name:'DF', pos:[ 0,-1, 1], faces:['D','F'] },
    { name:'DL', pos:[-1,-1, 0], faces:['D','L'] },
    { name:'DB', pos:[ 0,-1,-1], faces:['D','B'] },
    { name:'FR', pos:[ 1, 0, 1], faces:['F','R'] },
    { name:'FL', pos:[-1, 0, 1], faces:['F','L'] },
    { name:'BL', pos:[-1, 0,-1], faces:['B','L'] },
    { name:'BR', pos:[ 1, 0,-1], faces:['B','R'] },
  ];

  function samePos(a,b){ return a[0]===b[0] && a[1]===b[1] && a[2]===b[2]; }
  function pieceKey(colors){ return colors.slice().sort().join(','); }
  function cubieAt(state,pos){ return state.cubies.find(c => samePos(c.pos,pos)); }
  function colorsAtFaces(cubie,faces){ return faces.map(face => currentColorAt(cubie,FACE_KEY[face])); }
  function permutationParity(permutation){
    let parity=0;
    for(let i=0;i<permutation.length;i++){
      for(let j=i+1;j<permutation.length;j++){
        if(permutation[i]>permutation[j]) parity^=1;
      }
    }
    return parity;
  }

  // Full physical reachability checks for a 3x3 after piece composition has passed.
  // Cubie orientation is decoded from ordered facelets using the standard cubie
  // coordinate convention. Legal face turns preserve:
  //   corner orientation sum = 0 (mod 3)
  //   edge orientation sum   = 0 (mod 2)
  //   corner permutation parity === edge permutation parity
  function verifyReachability3x3(state,centers){
    const cornerByKey=new Map();
    const edgeByKey=new Map();
    CORNER_SLOTS_3X3.forEach((slot,index) => {
      cornerByKey.set(pieceKey(slot.faces.map(face=>centers[face])), { index, slot });
    });
    EDGE_SLOTS_3X3.forEach((slot,index) => {
      edgeByKey.set(pieceKey(slot.faces.map(face=>centers[face])), { index, slot });
    });

    let cornerOrientationSum=0;
    let edgeOrientationSum=0;
    const cornerPermutation=[];
    const edgePermutation=[];

    for(const slot of CORNER_SLOTS_3X3){
      const cubie=cubieAt(state,slot.pos);
      if(!cubie) return [{ type:'internal', message:'A corner position is missing from the cube state.' }];
      const colors=colorsAtFaces(cubie,slot.faces);
      const piece=cornerByKey.get(pieceKey(colors));
      if(!piece) return [{ type:'internal', message:'Could not identify a corner while checking physical reachability.' }];
      const homeColors=piece.slot.faces.map(face=>centers[face]);
      const orientation=colors.findIndex(color=>color===homeColors[0]);
      if(orientation<0) return [{ type:'internal', message:'Could not determine a corner orientation.' }];
      cornerOrientationSum+=orientation;
      cornerPermutation.push(piece.index);
    }

    for(const slot of EDGE_SLOTS_3X3){
      const cubie=cubieAt(state,slot.pos);
      if(!cubie) return [{ type:'internal', message:'An edge position is missing from the cube state.' }];
      const colors=colorsAtFaces(cubie,slot.faces);
      const piece=edgeByKey.get(pieceKey(colors));
      if(!piece) return [{ type:'internal', message:'Could not identify an edge while checking physical reachability.' }];
      const homeColors=piece.slot.faces.map(face=>centers[face]);
      edgeOrientationSum += colors[0]===homeColors[0] ? 0 : 1;
      edgePermutation.push(piece.index);
    }

    const errors=[];
    const cornerTwist=cornerOrientationSum%3;
    const edgeFlip=edgeOrientationSum%2;
    const cornerParity=permutationParity(cornerPermutation);
    const edgeParity=permutationParity(edgePermutation);

    if(cornerTwist!==0){
      errors.push({
        type:'corner-twist', kind:'corner',
        message:'Corner orientation is impossible: the total corner twist is not divisible by 3. This usually means one corner is twisted in place.'
      });
    }
    if(edgeFlip!==0){
      errors.push({
        type:'edge-flip', kind:'edge',
        message:'Edge orientation is impossible: the cube has an odd number of flipped edges. A single flipped edge cannot occur through legal turns.'
      });
    }
    if(cornerParity!==edgeParity){
      errors.push({
        type:'parity', kind:'pieces',
        message:'Permutation parity is impossible: the corner and edge permutations do not match. This commonly appears as two pieces swapped by themselves.'
      });
    }
    return errors;
  }

  function verifyPieceComposition(state){
    const centers = {};
    for (const face of FACES) centers[face] = centerColor(state, face);
    const distinctCenters = new Set(Object.values(centers));
    if (distinctCenters.size !== 6){
      return { valid:false, errors:[{ type:'centers', message:'Center colors must all be different from each other.' }] };
    }
    const oppositeOf = {};
    const facePairs = [['U','D'],['R','L'],['F','B']];
    for (const [a,b] of facePairs){ oppositeOf[centers[a]] = centers[b]; oppositeOf[centers[b]] = centers[a]; }
    const allColors = Object.values(centers);

    const validEdgeKeys = new Set();
    for (let i=0;i<allColors.length;i++) for (let j=i+1;j<allColors.length;j++){
      const a=allColors[i], b=allColors[j];
      if (oppositeOf[a] !== b) validEdgeKeys.add([a,b].sort().join(','));
    }
    const pairColors = facePairs.map(([a,b])=>[centers[a],centers[b]]);
    const validCornerKeys = new Set();
    for (const c1 of pairColors[0]) for (const c2 of pairColors[1]) for (const c3 of pairColors[2]){
      validCornerKeys.add([c1,c2,c3].sort().join(','));
    }

    const edgeCounts = {}, cornerCounts = {};
    for (const cubie of state.cubies){
      const nonzero = cubie.pos.filter(v=>v!==0).length;
      if (nonzero !== 2 && nonzero !== 3) continue; // skip centers
      const key = cubieColorSet(cubie).slice().sort().join(',');
      if (nonzero === 2) edgeCounts[key] = (edgeCounts[key]||0)+1;
      else cornerCounts[key] = (cornerCounts[key]||0)+1;
    }

    const errors = [];
    for (const key of validEdgeKeys){
      const n = edgeCounts[key]||0;
      if (n===0) errors.push({ type:'missing', kind:'edge', colors:key.split(',') });
      else if (n>1) errors.push({ type:'duplicate', kind:'edge', colors:key.split(','), count:n });
    }
    for (const key of Object.keys(edgeCounts)){
      if (!validEdgeKeys.has(key)) errors.push({ type:'impossible', kind:'edge', colors:key.split(','), count:edgeCounts[key] });
    }
    for (const key of validCornerKeys){
      const n = cornerCounts[key]||0;
      if (n===0) errors.push({ type:'missing', kind:'corner', colors:key.split(',') });
      else if (n>1) errors.push({ type:'duplicate', kind:'corner', colors:key.split(','), count:n });
    }
    for (const key of Object.keys(cornerCounts)){
      if (!validCornerKeys.has(key)) errors.push({ type:'impossible', kind:'corner', colors:key.split(','), count:cornerCounts[key] });
    }

    // Orientation/parity math only has meaning once every physical piece has
    // been identified exactly once, so do not pile secondary errors on top of
    // a basic color-entry/composition problem.
    if(errors.length===0) errors.push(...normalizeFromStickers3x3(state).errors);
    if(errors.length===0) errors.push(...verifyReachability3x3(state,centers));

    return {
      valid: errors.length===0,
      errors,
      summary: errors.length===0 ? 'Every piece is present exactly once and the state is physically reachable on a real 3x3 cube.' : undefined,
    };
  }

  function matrixKey(m){ return m.flat().join(','); }
  function multiplyMatrices(a,b){ return matMulMat(a,b); }

  // A 2x2 has no fixed centers, so a physically identical cube may be presented in
  // any of the 24 whole-cube orientations. Generate those orientations once and use
  // them as candidate face-color references for corner-orientation validation.
  const TWO_BY_TWO_ORIENTATION_SCHEMES = (() => {
    const generators=[rotMatrix('x',90),rotMatrix('y',90),rotMatrix('z',90)];
    const queue=[IDENTITY];
    const rotations=[];
    const seen=new Set();
    while(queue.length){
      const m=queue.shift();
      const key=matrixKey(m);
      if(seen.has(key)) continue;
      seen.add(key);
      rotations.push(m);
      for(const g of generators) queue.push(multiplyMatrices(g,m));
    }

    const faceForKey=Object.fromEntries(Object.entries(FACE_KEY).map(([face,key])=>[key,face]));
    return rotations.map(rotation => {
      const scheme={};
      for(const [localKey,color] of Object.entries(DEFAULT_SCHEME)){
        const rotated=matMulVec(rotation,LOCAL_VEC[localKey]).map(Math.round);
        const rotatedKey=KEY_TO_FACE[vecKey(rotated)];
        scheme[faceForKey[rotatedKey]]=color;
      }
      return scheme;
    });
  })();

  function verifyReachability2x2(state){
    for(const centers of TWO_BY_TWO_ORIENTATION_SCHEMES){
      const cornerByKey=new Map();
      CORNER_SLOTS_3X3.forEach((slot,index) => {
        cornerByKey.set(pieceKey(slot.faces.map(face=>centers[face])), { index, slot });
      });

      let orientationSum=0;
      let candidateValid=true;
      for(const slot of CORNER_SLOTS_3X3){
        const cubie=cubieAt(state,slot.pos);
        if(!cubie){ candidateValid=false; break; }
        const colors=colorsAtFaces(cubie,slot.faces);
        const piece=cornerByKey.get(pieceKey(colors));
        if(!piece){ candidateValid=false; break; }
        const homeColors=piece.slot.faces.map(face=>centers[face]);
        const orientation=colors.findIndex(color=>color===homeColors[0]);
        if(orientation<0){ candidateValid=false; break; }
        orientationSum+=orientation;
      }
      if(candidateValid && orientationSum%3===0) return [];
    }

    return [{
      type:'corner-twist', kind:'corner',
      message:'Corner orientation is impossible: the 2x2 cannot be matched to any legal whole-cube orientation. This usually means one corner is twisted in place.'
    }];
  }

  // ---------- Sticker normalization (2x2 and 3x3) ----------
  // Clicking a sticker changes its color and rebuilds the cubie's id, but leaves
  // pos/ori alone. Anything that reads orientation from the ori matrix (the 2x2
  // Shortest Move lookup, CFOP's cross search, the RCS1 state line) then sees a
  // model that doesn't match the visible cube. This rebuilds a consistent copy
  // from what is actually showing: for each corner or edge, identify the piece
  // from its colors, give it its home sticker layout, and set ori to the
  // rotation that carries those home stickers onto the faces where the colors
  // are visible. An edge fixes two columns of that rotation; the third is their
  // cross product. Centers are never editable and are left alone. The visible
  // cube is unchanged; only its internal description is made consistent. On a
  // 3x3 the result is identical, piece for piece, to the same state reached by
  // real moves.
  //
  // Returns a NEW state; the input is never modified. A corner whose colors run
  // in mirror-image order (no proper rotation exists) is reported as an error —
  // no physical piece looks like that. Edges can't be mirrored.
  function determinant3(m){
    return m[0][0]*(m[1][1]*m[2][2]-m[1][2]*m[2][1])
      -m[0][1]*(m[1][0]*m[2][2]-m[1][2]*m[2][0])
      +m[0][2]*(m[1][0]*m[2][1]-m[1][1]*m[2][0]);
  }

  function homeStickersOf(solved){
    const byId = {};
    for (const c of solved.cubies) byId[c.id] = c.stickers;
    return byId;
  }
  const HOME_STICKERS_2X2 = homeStickersOf(createSolvedState2x2());
  const HOME_STICKERS_3X3 = homeStickersOf(createSolvedState());

  function normalizeFromStickers(state, homeById){
    const next = cloneState(state);
    const errors = [];
    for (const cubie of next.cubies){
      const worldOfColor = {};
      let stickerCount = 0;
      for (const [localKey, color] of Object.entries(cubie.stickers)){
        if (color == null) continue;
        stickerCount++;
        worldOfColor[color] = worldDirOfLocal(cubie, localKey);
      }
      if (stickerCount < 2) continue; // centers never change
      const colors = Object.keys(worldOfColor);
      const id = idFromColors(colors);
      const home = homeById[id];
      if (colors.length !== stickerCount || !home){
        errors.push({ type:'internal', kind: stickerCount === 3 ? 'corner' : 'edge', colors,
          message:'A piece could not be identified from its sticker colors. Use Verify Cube to find it.' });
        continue;
      }
      const m = [[0,0,0],[0,0,0],[0,0,0]];
      const filled = [false,false,false];
      for (const [homeKey, color] of Object.entries(home)){
        if (color == null) continue;
        const target = LOCAL_VEC[worldOfColor[color]];
        const column = axisIndex(homeKey[1]);
        const sign = homeKey[0] === '+' ? 1 : -1;
        for (let row = 0; row < 3; row++) m[row][column] = sign * target[row];
        filled[column] = true;
      }
      const missing = filled.indexOf(false);
      if (missing >= 0){
        const a = (missing + 1) % 3, b = (missing + 2) % 3;
        const ca = [m[0][a], m[1][a], m[2][a]], cb = [m[0][b], m[1][b], m[2][b]];
        const cross = [ca[1]*cb[2]-ca[2]*cb[1], ca[2]*cb[0]-ca[0]*cb[2], ca[0]*cb[1]-ca[1]*cb[0]];
        for (let row = 0; row < 3; row++) m[row][missing] = cross[row];
      }
      if (determinant3(m) !== 1){
        errors.push({ type:'corner-mirror', kind:'corner', colors,
          message:'This corner\u2019s colors run in an order no real piece has \u2014 two of its stickers are probably swapped.' });
        continue;
      }
      cubie.ori = m;
      cubie.stickers = Object.assign({}, home);
      cubie.id = id;
    }
    return { state: next, errors };
  }
  function normalizeFromStickers2x2(state){ return normalizeFromStickers(state, HOME_STICKERS_2X2); }
  function normalizeFromStickers3x3(state){ return normalizeFromStickers(state, HOME_STICKERS_3X3); }

  // 2x2 equivalent: no centers to read the color scheme from, so the opposite-color
  // pairing is taken from the fixed official scheme (W/Y, R/O, G/B) instead of live
  // pieces — consistent with how 3x3 centers work today, since they're never editable
  // and always show the DEFAULT_SCHEME color anyway.
  function verifyPieceComposition2x2(state){
    const facePairs = [['U','D'],['R','L'],['F','B']];
    const schemeColor = {
      U: DEFAULT_SCHEME['+y'], D: DEFAULT_SCHEME['-y'],
      R: DEFAULT_SCHEME['+x'], L: DEFAULT_SCHEME['-x'],
      F: DEFAULT_SCHEME['+z'], B: DEFAULT_SCHEME['-z'],
    };
    const pairColors = facePairs.map(([a,b])=>[schemeColor[a],schemeColor[b]]);
    const validCornerKeys = new Set();
    for (const c1 of pairColors[0]) for (const c2 of pairColors[1]) for (const c3 of pairColors[2]){
      validCornerKeys.add([c1,c2,c3].sort().join(','));
    }
    const cornerCounts = {};
    for (const cubie of state.cubies){
      const key = cubieColorSet(cubie).slice().sort().join(',');
      cornerCounts[key] = (cornerCounts[key]||0)+1;
    }
    const errors = [];
    for (const key of validCornerKeys){
      const n = cornerCounts[key]||0;
      if (n===0) errors.push({ type:'missing', kind:'corner', colors:key.split(',') });
      else if (n>1) errors.push({ type:'duplicate', kind:'corner', colors:key.split(','), count:n });
    }
    for (const key of Object.keys(cornerCounts)){
      if (!validCornerKeys.has(key)) errors.push({ type:'impossible', kind:'corner', colors:key.split(','), count:cornerCounts[key] });
    }
    // Twist math only reads which face each piece's first home color is on, so
    // it can't see a corner whose colors are in mirror-image order. The
    // normalization pass can, since no proper rotation produces one.
    if(errors.length===0) errors.push(...normalizeFromStickers2x2(state).errors);
    if(errors.length===0) errors.push(...verifyReachability2x2(state));
    return {
      valid: errors.length===0,
      errors,
      summary: errors.length===0 ? 'Every corner is present exactly once and the state is physically reachable on a real 2x2 cube.' : undefined,
    };
  }

  return {
    MOVES, ALL_MOVES, FACES, FACE_KEY, FACE_POS, LOCAL_VEC, KEY_TO_FACE, DEFAULT_SCHEME, WHITE_DOWN_SCHEME,
    createSolvedState, createSolvedState2x2, cloneState, applyMove, applyMoves, applyAlgString,
    flipToWhiteDown, moveFromWhiteDown,
    worldDirOfLocal, currentColorAt, cubieColorSet, findCubieByColors, centerColor,
    isSolved, isSolved2x2, colorCounts, validateState, randomScramble, rotMatrix, matMulVec, matMulMat,
    buildColorIndex, idFromColors, findCubieById, verifyPieceComposition, verifyPieceComposition2x2,
    normalizeFromStickers2x2, normalizeFromStickers3x3,
  };
});

