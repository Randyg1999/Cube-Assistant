// ============================================================================
// 4x4 Rubik's Cube logical engine — pure JS, no DOM/Three.js dependency.
// Physical visible-piece model: 8 corners, 24 wings, 24 centers.
// Coordinates use {-3,-1,1,3}; this keeps all move math integer-only.
// ============================================================================
(function (root, factory) {
  if (typeof module === 'object' && module.exports) {
    module.exports = factory(require('../core/cube-math.js'));
  } else {
    root.FourByFourEngine = factory(root.CubeMath);
  }
})(typeof self !== 'undefined' ? self : this, function (CubeMath) {
  if (!CubeMath) throw new Error('CubeMath is required before FourByFourEngine.');
  const { IDENTITY, matMulVec, matMulMat, axisIndex, rotMatrix, vecKey } = CubeMath;

  const COORDS = [-3,-1,1,3];
  const LOCAL_VEC = {'+x':[1,0,0],'-x':[-1,0,0],'+y':[0,1,0],'-y':[0,-1,0],'+z':[0,0,1],'-z':[0,0,-1]};
  const KEY_TO_FACE = {};
  Object.entries(LOCAL_VEC).forEach(([k,v]) => { KEY_TO_FACE[vecKey(v)] = k; });
  const FACE_KEY = {U:'+y', D:'-y', R:'+x', L:'-x', F:'+z', B:'-z'};
  const FACES = ['U','D','R','L','F','B'];
  // Standard Western scheme in the WCA scrambling orientation: white top, green
  // front, red right. The 4x4 solvers (centers, wings, reduction) deliberately
  // target the white-down layout instead — see CubeEngine.WHITE_DOWN_SCHEME.
  const DEFAULT_SCHEME = {'+x':'R', '-x':'O', '+y':'W', '-y':'Y', '+z':'G', '-z':'B'};

  const OUTER = {
    R:{axis:'x',layers:[3],sign:1}, L:{axis:'x',layers:[-3],sign:-1},
    U:{axis:'y',layers:[3],sign:1}, D:{axis:'y',layers:[-3],sign:-1},
    F:{axis:'z',layers:[3],sign:1}, B:{axis:'z',layers:[-3],sign:-1},
  };
  const INNER = {
    '2R':{axis:'x',layers:[1],follows:'R'}, '2L':{axis:'x',layers:[-1],follows:'L'},
    '2U':{axis:'y',layers:[1],follows:'U'}, '2D':{axis:'y',layers:[-1],follows:'D'},
    '2F':{axis:'z',layers:[1],follows:'F'}, '2B':{axis:'z',layers:[-1],follows:'B'},
  };
  const WIDE = {
    Rw:{axis:'x',layers:[3,1],follows:'R'}, Lw:{axis:'x',layers:[-3,-1],follows:'L'},
    Uw:{axis:'y',layers:[3,1],follows:'U'}, Dw:{axis:'y',layers:[-3,-1],follows:'D'},
    Fw:{axis:'z',layers:[3,1],follows:'F'}, Bw:{axis:'z',layers:[-3,-1],follows:'B'},
  };

  const MOVES = {};
  function addFamily(name, def, baseDeg) {
    MOVES[name] = {axis:def.axis, layers:def.layers.slice(), deg:baseDeg};
    MOVES[name+"'"] = {axis:def.axis, layers:def.layers.slice(), deg:-baseDeg};
    MOVES[name+'2'] = {axis:def.axis, layers:def.layers.slice(), deg:180};
  }
  for (const [name,def] of Object.entries(OUTER)) addFamily(name, def, def.sign===1 ? -90 : 90);
  for (const [name,def] of Object.entries(INNER)) addFamily(name, def, MOVES[def.follows].deg);
  for (const [name,def] of Object.entries(WIDE)) addFamily(name, def, MOVES[def.follows].deg);
  const ALL_MOVES = Object.keys(MOVES);

  // Common lowercase wide-turn aliases, accepted but not emitted by the UI.
  const LOWER_ALIAS = {r:'Rw',l:'Lw',u:'Uw',d:'Dw',f:'Fw',b:'Bw'};
  for (const [lower,wide] of Object.entries(LOWER_ALIAS)) {
    for (const suffix of ['',"'",'2']) MOVES[lower+suffix] = MOVES[wide+suffix];
  }

  function homeId(x,y,z){ return `4:${x},${y},${z}`; }
  function createSolvedState(scheme) {
    scheme = scheme || DEFAULT_SCHEME;
    const cubies=[];
    for (const x of COORDS) for (const y of COORDS) for (const z of COORDS) {
      if (Math.abs(x)!==3 && Math.abs(y)!==3 && Math.abs(z)!==3) continue; // hidden 2x2 core
      const stickers={
        '+x':x===3?scheme['+x']:null, '-x':x===-3?scheme['-x']:null,
        '+y':y===3?scheme['+y']:null, '-y':y===-3?scheme['-y']:null,
        '+z':z===3?scheme['+z']:null, '-z':z===-3?scheme['-z']:null,
      };
      cubies.push({pos:[x,y,z], ori:IDENTITY.map(r=>r.slice()), stickers, id:homeId(x,y,z), home:[x,y,z]});
    }
    return {cubies, size:4};
  }

  function cloneState(state) {
    return {size:4,cubies:state.cubies.map(c=>({
      pos:c.pos.slice(), ori:c.ori.map(r=>r.slice()), stickers:{...c.stickers}, id:c.id, home:c.home?.slice?.() || null,
    }))};
  }

  function normalizeMoveName(name){
    if (!name) return name;
    const first=name[0];
    if (LOWER_ALIAS[first]) return LOWER_ALIAS[first]+name.slice(1);
    return name;
  }
  function applyMove(state, moveName) {
    moveName=normalizeMoveName(moveName);
    const mv=MOVES[moveName];
    if(!mv) throw new Error('Unknown 4x4 move: '+moveName);
    const R=rotMatrix(mv.axis,mv.deg);
    const ai=axisIndex(mv.axis);
    const layers=new Set(mv.layers);
    for(const c of state.cubies){
      if(!layers.has(c.pos[ai])) continue;
      c.pos=matMulVec(R,c.pos).map(Math.round);
      c.ori=matMulMat(R,c.ori);
    }
  }
  function applyMoves(state,moves){ for(const m of moves) applyMove(state,m); }
  function applyAlgString(state,alg){ const moves=alg.trim().split(/\s+/).filter(Boolean); applyMoves(state,moves); return moves; }

  function worldDirOfLocal(cubie,localKey){
    return KEY_TO_FACE[vecKey(matMulVec(cubie.ori,LOCAL_VEC[localKey]).map(Math.round))];
  }
  function currentColorAt(cubie,worldFaceKey){
    for(const [localKey,color] of Object.entries(cubie.stickers)){
      if(color==null) continue;
      if(worldDirOfLocal(cubie,localKey)===worldFaceKey) return color;
    }
    return null;
  }
  function cubieColorSet(cubie){ return Object.values(cubie.stickers).filter(v=>v!=null); }
  function colorCounts(state){
    const counts={};
    for(const c of state.cubies) for(const v of Object.values(c.stickers)) if(v!=null) counts[v]=(counts[v]||0)+1;
    return counts;
  }
  function pieceKind(c){
    const n=cubieColorSet(c).length;
    return n===3?'corner':n===2?'wing':n===1?'center':'invalid';
  }
  function isSolved(state){
    const seen=new Set();
    for(const face of FACES){
      const key=FACE_KEY[face];
      const colors=new Set();
      for(const c of state.cubies){ const col=currentColorAt(c,key); if(col!=null) colors.add(col); }
      if(colors.size!==1) return false;
      const col=[...colors][0]; if(seen.has(col)) return false; seen.add(col);
    }
    return seen.size===6;
  }

  function randomScramble(n){
    n=n||40;
    const bases=['U','D','R','L','F','B','Uw','Dw','Rw','Lw','Fw','Bw'];
    const suffixes=['',"'",'2'];
    const out=[]; let lastAxis=null;
    const axisOf=m=>MOVES[m].axis;
    for(let i=0;i<n;i++){
      let base;
      do{ base=bases[Math.floor(Math.random()*bases.length)]; }while(axisOf(base)===lastAxis);
      lastAxis=axisOf(base);
      out.push(base+suffixes[Math.floor(Math.random()*suffixes.length)]);
    }
    return out;
  }

  function moveForLayer(axis,coord){
    const map={
      x:{3:'R',1:'2R','-1':'2L','-3':'L'},
      y:{3:'U',1:'2U','-1':'2D','-3':'D'},
      z:{3:'F',1:'2F','-1':'2B','-3':'B'},
    };
    return map[axis]?.[coord] || null;
  }

  const keyOfColors=colors=>colors.slice().sort().join(',');
  const SOLVED=createSolvedState();
  const LEGAL_CORNERS=new Map(), LEGAL_WINGS=new Map();
  for(const c of SOLVED.cubies){
    const colors=cubieColorSet(c), kind=pieceKind(c), key=keyOfColors(colors);
    if(kind==='corner') LEGAL_CORNERS.set(key,(LEGAL_CORNERS.get(key)||0)+1);
    if(kind==='wing') LEGAL_WINGS.set(key,(LEGAL_WINGS.get(key)||0)+1);
  }

  function orientationSchemes(){
    const gens=[rotMatrix('x',90),rotMatrix('y',90),rotMatrix('z',90)], q=[IDENTITY], rots=[], seen=new Set();
    while(q.length){ const m=q.shift(), k=m.flat().join(','); if(seen.has(k)) continue; seen.add(k); rots.push(m); for(const g of gens) q.push(matMulMat(g,m)); }
    return rots.map(rot=>{
      const scheme={};
      for(const [local,color] of Object.entries(DEFAULT_SCHEME)){
        const dir=matMulVec(rot,LOCAL_VEC[local]).map(Math.round); const key=KEY_TO_FACE[vecKey(dir)];
        const face=Object.keys(FACE_KEY).find(f=>FACE_KEY[f]===key); scheme[face]=color;
      }
      return scheme;
    });
  }
  const ORIENTATION_SCHEMES=orientationSchemes();
  const CORNER_SLOTS = [
    { name:'URF', pos:[ 3, 3, 3], faces:['U','R','F'] },
    { name:'UFL', pos:[-3, 3, 3], faces:['U','F','L'] },
    { name:'ULB', pos:[-3, 3,-3], faces:['U','L','B'] },
    { name:'UBR', pos:[ 3, 3,-3], faces:['U','B','R'] },
    { name:'DFR', pos:[ 3,-3, 3], faces:['D','F','R'] },
    { name:'DLF', pos:[-3,-3, 3], faces:['D','L','F'] },
    { name:'DBL', pos:[-3,-3,-3], faces:['D','B','L'] },
    { name:'DRB', pos:[ 3,-3,-3], faces:['D','R','B'] },
  ];
  function cubieAt(state,pos){ return state.cubies.find(c=>c.pos[0]===pos[0]&&c.pos[1]===pos[1]&&c.pos[2]===pos[2]); }
  function cornerOrientationReachable(state){
    for(const centers of ORIENTATION_SCHEMES){
      const cornerByKey=new Map();
      CORNER_SLOTS.forEach((slot,index)=>cornerByKey.set(keyOfColors(slot.faces.map(face=>centers[face])),{index,slot}));
      let orientationSum=0, candidateValid=true;
      for(const slot of CORNER_SLOTS){
        const cubie=cubieAt(state,slot.pos); if(!cubie){candidateValid=false;break;}
        const colors=slot.faces.map(face=>currentColorAt(cubie,FACE_KEY[face]));
        const piece=cornerByKey.get(keyOfColors(colors)); if(!piece){candidateValid=false;break;}
        const homeColors=piece.slot.faces.map(face=>centers[face]);
        const orientation=colors.findIndex(color=>color===homeColors[0]);
        if(orientation<0){candidateValid=false;break;}
        orientationSum+=orientation;
      }
      if(candidateValid && orientationSum%3===0) return true;
    }
    return false;
  }

  function verifyState(state){
    const errors=[];
    if(!state?.cubies || state.cubies.length!==56){
      return {valid:false,errors:[{type:'internal',message:`Expected 56 visible 4x4 pieces, found ${state?.cubies?.length ?? 0}.`}]};
    }
    const counts=colorCounts(state);
    for(const code of ['W','Y','R','O','G','B']){
      const n=counts[code]||0; if(n!==16) errors.push({type:'count',kind:'stickers',colors:[code],message:`${code} appears ${n} times (expected 16).`});
    }
    for(const code of Object.keys(counts)) if(!['W','Y','R','O','G','B'].includes(code)) errors.push({type:'count',kind:'stickers',colors:[code],message:`Unknown color code ${code}.`});

    const centers={}, corners={}, wings={};
    for(const c of state.cubies){
      const colors=cubieColorSet(c), kind=pieceKind(c), key=keyOfColors(colors);
      if(kind==='center') centers[colors[0]]=(centers[colors[0]]||0)+1;
      else if(kind==='corner') corners[key]=(corners[key]||0)+1;
      else if(kind==='wing') wings[key]=(wings[key]||0)+1;
      else errors.push({type:'internal',message:'A 4x4 piece has an invalid sticker count.'});
    }
    for(const code of ['W','Y','R','O','G','B']) if((centers[code]||0)!==4) errors.push({type:'centers',message:`Center color ${code} has ${centers[code]||0} pieces (expected 4).`});
    for(const [key,expected] of LEGAL_CORNERS){
      const n=corners[key]||0; if(n===0) errors.push({type:'missing',kind:'corner',colors:key.split(',')}); else if(n>expected) errors.push({type:'duplicate',kind:'corner',colors:key.split(','),count:n});
    }
    for(const key of Object.keys(corners)) if(!LEGAL_CORNERS.has(key)) errors.push({type:'impossible',kind:'corner',colors:key.split(',')});
    for(const [key,expected] of LEGAL_WINGS){
      const n=wings[key]||0; if(n<expected) errors.push({type:'missing',kind:'wing',colors:key.split(',')}); else if(n>expected) errors.push({type:'duplicate',kind:'wing',colors:key.split(','),count:n});
    }
    for(const key of Object.keys(wings)) if(!LEGAL_WINGS.has(key)) errors.push({type:'impossible',kind:'wing',colors:key.split(',')});
    if(errors.length===0 && !cornerOrientationReachable(state)) errors.push({type:'corner-twist',kind:'corner',message:'Corner orientation is impossible: the eight corner twists do not satisfy the physical 4x4 corner-orientation invariant.'});

    return {valid:errors.length===0,errors,summary:errors.length===0?'All 96 stickers, 24 centers, 24 wings, and 8 corners have valid composition; corner orientation is physically reachable.':undefined};
  }

  return {COORDS,MOVES,ALL_MOVES,FACES,FACE_KEY,LOCAL_VEC,KEY_TO_FACE,DEFAULT_SCHEME,
    createSolvedState,cloneState,applyMove,applyMoves,applyAlgString,worldDirOfLocal,currentColorAt,cubieColorSet,
    colorCounts,pieceKind,isSolved,randomScramble,moveForLayer,verifyState,normalizeMoveName};
});
