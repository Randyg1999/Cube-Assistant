// ---------- 2x2 Shortest Move Solve (complete optimal-policy lookup) ----------
// Owned entirely by the 2x2. This module is used by the 2x2 "Shortest Move
// Solve" method and by nothing else; no other puzzle and no other method reads
// from it. It previously lived at the bottom of the 3x3's solve file, which
// meant a 3x3 edit could break 2x2 solving.
//
// Reads the packed database in js/data/policy-2x2.js (window
// TWO_BY_TWO_OPTIMAL_POLICY_B64) and walks it one optimal move at a time.
// Every state is normalized against a fixed reference corner first, so the
// table covers rotationally distinct states only.
//
// Exposes: window.CubeSolver2x2Optimal.solve(state) -> array of move names.

(function (root) {

const CANONICAL_MOVES = ['U', 'U2', "U'", 'R', 'R2', "R'", 'F', 'F2', "F'"];

const POSITIONS = [
  [ 1, 1, 1], [-1, 1, 1], [-1, 1,-1], [ 1, 1,-1],
  [ 1,-1, 1], [-1,-1, 1], [-1,-1,-1], [ 1,-1,-1]
];

const SLOT_FACE_VECTORS = [
  [[0,1,0],[1,0,0],[0,0,1]],   [[0,1,0],[0,0,1],[-1,0,0]],
  [[0,1,0],[-1,0,0],[0,0,-1]], [[0,1,0],[0,0,-1],[1,0,0]],
  [[0,-1,0],[0,0,1],[1,0,0]],  [[0,-1,0],[-1,0,0],[0,0,1]],
  [[0,-1,0],[0,0,-1],[-1,0,0]],[[0,-1,0],[1,0,0],[0,0,-1]]
];

const FACE_FROM_VECTOR = {
  '0,1,0':'U', '0,-1,0':'D', '1,0,0':'R', '-1,0,0':'L', '0,0,1':'F', '0,0,-1':'B'
};

const PACKED_POLICY_BYTES = 1837080; // 3,674,160 states, two nibbles per byte

let policyBytes = null;
let rotations = null;
let identityById = null;

function determinant(m){
  return m[0][0]*(m[1][1]*m[2][2]-m[1][2]*m[2][1])
    -m[0][1]*(m[1][0]*m[2][2]-m[1][2]*m[2][0])
    +m[0][2]*(m[1][0]*m[2][1]-m[1][1]*m[2][0]);
}
function transpose(m){
  return [[m[0][0],m[1][0],m[2][0]],[m[0][1],m[1][1],m[2][1]],[m[0][2],m[1][2],m[2][2]]];
}
function vecKey(v){ return v.join(','); }
function sameVec(a,b){ return a[0]===b[0]&&a[1]===b[1]&&a[2]===b[2]; }

function buildRotations(){
  if(rotations) return rotations;
  const permutations=[[0,1,2],[0,2,1],[1,0,2],[1,2,0],[2,0,1],[2,1,0]];
  const built=[];
  for(const p of permutations) for(const sx of [-1,1]) for(const sy of [-1,1]) for(const sz of [-1,1]){
    const signs=[sx,sy,sz];
    const m=[[0,0,0],[0,0,0],[0,0,0]];
    for(let row=0;row<3;row++) m[row][p[row]]=signs[row];
    if(determinant(m)===1) built.push(m);
  }
  if(built.length!==24) throw new Error('Could not construct the 24 cube orientations.');
  rotations=built;
  return rotations;
}

function packedPolicy(){
  // policy-2x2.js is a plain classic script. Read the global the same way the
  // original in-solve-3x3 code did (bare identifier, which resolves across
  // classic scripts) and fall back to the window property, so this works
  // whichever way that generated file declares it.
  if(typeof TWO_BY_TWO_OPTIMAL_POLICY_B64!=='undefined' && TWO_BY_TWO_OPTIMAL_POLICY_B64) return TWO_BY_TWO_OPTIMAL_POLICY_B64;
  return root.TWO_BY_TWO_OPTIMAL_POLICY_B64;
}

function loadPolicy(){
  if(policyBytes) return policyBytes;
  const packed = packedPolicy();
  if(typeof packed!=='string' || !packed.length){
    throw new Error('The 2x2 optimal-policy database (js/data/policy-2x2.js) is not loaded. Select Beginner Solve, or restore that file.');
  }
  const binary=atob(packed);
  const bytes=new Uint8Array(binary.length);
  for(let i=0;i<binary.length;i++) bytes[i]=binary.charCodeAt(i);
  if(bytes.length!==PACKED_POLICY_BYTES) throw new Error('The 2x2 optimal-policy database has the wrong size.');
  policyBytes=bytes;
  console.info('2x2 complete optimal policy loaded:',bytes.length,'packed bytes for 3,674,160 states.');
  return bytes;
}

function policyMove(index){
  const b=loadPolicy()[index>>1];
  return (index&1) ? ((b>>4)&15) : (b&15);
}

function rankPermutation(cp){
  const slots=[0,1,2,3,4,5,7];
  const identityRank={0:0,1:1,2:2,3:3,4:4,5:5,7:6};
  const a=slots.map(slot=>identityRank[cp[slot]]);
  let rank=0;
  for(let i=0;i<7;i++){
    let less=0;
    for(let j=i+1;j<7;j++) if(a[j]<a[i]) less++;
    rank=rank*(7-i)+less;
  }
  return rank;
}

function rankOrientation(co){
  let rank=0;
  for(const slot of [0,1,2,3,4,5]) rank=rank*3+co[slot];
  return rank;
}

function ensureIdentityMap(E){
  if(identityById) return identityById;
  const solved=E.createSolvedState2x2();
  const map={};
  for(const cubie of solved.cubies){
    const slot=POSITIONS.findIndex(p=>sameVec(p,cubie.pos));
    map[cubie.id]=slot;
  }
  identityById=map;
  return map;
}

function canonicalState(E,state){
  const byId=ensureIdentityMap(E);
  const referenceId=Object.keys(byId).find(id=>byId[id]===6);
  const reference=state.cubies.find(c=>c.id===referenceId);
  if(!reference) throw new Error('The fixed reference corner could not be identified.');
  let rotation=null;
  for(const candidate of buildRotations()){
    if(!sameVec(E.matMulVec(candidate,reference.pos),POSITIONS[6])) continue;
    const oriented=E.matMulMat(candidate,reference.ori);
    if(sameVec(E.matMulVec(oriented,[-1,0,0]),[-1,0,0]) &&
       sameVec(E.matMulVec(oriented,[0,-1,0]),[0,-1,0]) &&
       sameVec(E.matMulVec(oriented,[0,0,-1]),[0,0,-1])){
      rotation=candidate; break;
    }
  }
  if(!rotation) throw new Error('The 2x2 state could not be normalized to a fixed reference corner.');

  const cp=new Array(8), co=new Array(8);
  for(const cubie of state.cubies){
    const identity=byId[cubie.id];
    if(identity===undefined) throw new Error('An unknown corner identity was found.');
    const position=E.matMulVec(rotation,cubie.pos);
    const slot=POSITIONS.findIndex(p=>sameVec(p,position));
    if(slot<0) throw new Error('A corner is not in a valid 2x2 slot.');
    cp[slot]=identity;
    const oriented=E.matMulMat(rotation,cubie.ori);
    const udLocal=[0,POSITIONS[identity][1]>0?1:-1,0];
    const udWorld=E.matMulVec(oriented,udLocal);
    const orientation=SLOT_FACE_VECTORS[slot].findIndex(v=>sameVec(v,udWorld));
    if(orientation<0) throw new Error('A corner has an invalid orientation.');
    co[slot]=orientation;
  }
  if(cp[6]!==6 || co[6]!==0) throw new Error('2x2 normalization did not preserve the reference corner.');
  const index=rankPermutation(cp)*729+rankOrientation(co);
  return {index,rotation};
}

function mapCanonicalMove(E,move,rotation){
  const normal={U:[0,1,0],R:[1,0,0],F:[0,0,1]}[move[0]];
  const actualNormal=E.matMulVec(transpose(rotation),normal);
  const actualFace=FACE_FROM_VECTOR[vecKey(actualNormal)];
  if(!actualFace) throw new Error('Could not map an optimal move back to the displayed cube.');
  return actualFace+move.slice(1);
}

function solve(state){
  const E = root.CubeEngine;
  if(!E) throw new Error('The cube engine is not loaded.');
  loadPolicy();
  // Orientation below is read from each cubie's ori matrix, which sticker
  // clicks don't update. Work on a copy rebuilt from the visible colors so a
  // hand-entered cube reads the same as one reached by real moves.
  if(typeof E.normalizeFromStickers2x2!=='function') throw new Error('The cube engine is missing 2x2 sticker normalization.');
  const normalized=E.normalizeFromStickers2x2(state);
  if(normalized.errors.length) throw new Error(normalized.errors[0].message);
  const scratch=normalized.state;
  const moves=[];
  for(let step=0;step<12;step++){
    const canonical=canonicalState(E,scratch);
    if(canonical.index===0) return moves;
    const code=policyMove(canonical.index);
    if(code>8) throw new Error('The optimal-policy table contains no move for this state.');
    const actualMove=mapCanonicalMove(E,CANONICAL_MOVES[code],canonical.rotation);
    moves.push(actualMove);
    E.applyMove(scratch,actualMove);
  }
  throw new Error('The optimal 2x2 solution exceeded the proven 11-move maximum.');
}

root.CubeSolver2x2Optimal = { solve };

})(typeof self !== 'undefined' ? self : this);
