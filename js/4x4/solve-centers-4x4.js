// ============================================================================
// 4x4 center solver — deterministic U2-style buffer/target method.
//
// The center strategy and setup cases are adapted from Cameron LaBounty's
// MIT-licensed Rubiks-Cube-Solver (FourDimCube.pde), then translated into
// Cube Assistant's coordinate system and 2R/2L/2U/2D/2F/2B notation.
// See THIRD-PARTY-NOTICES.txt.
// ============================================================================
(function (root, factory) {
  if (typeof module === 'object' && module.exports) module.exports = factory(require('../4x4-engine.js'));
  else root.FourByFourCenterSolver = factory(root.FourByFourEngine);
})(typeof self !== 'undefined' ? self : this, function (E4) {
  if (!E4) throw new Error('FourByFourEngine is required before FourByFourCenterSolver.');

  const COLOR_TARGET = {
    O:{axis:'x',value:0}, R:{axis:'x',value:3},
    W:{axis:'y',value:0}, Y:{axis:'y',value:3},
    B:{axis:'z',value:0}, G:{axis:'z',value:3},
  };
  const TARGET_COLOR = {
    'x:0':'O','x:3':'R','y:0':'W','y:3':'Y','z:0':'B','z:3':'G'
  };

  function centerColor(c) {
    for (const v of Object.values(c.stickers)) if (v != null) return v;
    return null;
  }
  function isCenter(c) { return E4.pieceKind(c) === 'center'; }

  // Source solver coordinates are 0..3. Cube Assistant uses {-3,-1,1,3}
  // and its X axis is mirrored relative to that source model.
  function sourcePos(c) {
    return { x:(3-c.pos[0])/2, y:(c.pos[1]+3)/2, z:(c.pos[2]+3)/2 };
  }

  function desiredSourceFace(color) { return COLOR_TARGET[color] || null; }
  function centerSolved(c) {
    if (!isCenter(c)) return true;
    const target=desiredSourceFace(centerColor(c));
    if (!target) return false;
    const p=sourcePos(c);
    return p[target.axis] === target.value;
  }
  function centersSolved(state) { return centers(state).every(centerSolved); }

  function sourceBaseToMove(base, dir) {
    // dir is +1/-1 in the source implementation. Mapping includes the mirrored
    // source X coordinate and our standard face notation/direction convention.
    const map = {
      L:{plus:"R'",minus:'R'}, l:{plus:"2R'",minus:'2R'}, r:{plus:'2L',minus:"2L'"}, R:{plus:'L',minus:"L'"},
      U:{plus:'D',minus:"D'"}, u:{plus:'2D',minus:"2D'"}, d:{plus:"2U'",minus:'2U'}, D:{plus:"U'",minus:'U'},
      B:{plus:"B'",minus:'B'}, b:{plus:"2B'",minus:'2B'}, f:{plus:'2F',minus:"2F'"}, F:{plus:'F',minus:"F'"},
    };
    const entry=map[base];
    if (!entry) throw new Error('Unknown source center-solver move: '+base);
    return dir===1 ? entry.plus : entry.minus;
  }
  function sm(base,dir){ return sourceBaseToMove(base,dir); }
  function mapSourceSeq(seq){ return seq.map(([b,d])=>sm(b,d)); }
  function invertSourceSeq(seq){ return seq.slice().reverse().map(([b,d])=>[b,-d]); }

  function applyMapped(state, mapped, out) {
    for (const move of mapped) { E4.applyMove(state, move); out.push(move); }
  }
  function applySource(state, seq, out) { applyMapped(state, mapSourceSeq(seq), out); }

  function centers(state){ return state.cubies.filter(isCenter).slice().sort((a,b)=>{ const pa=sourcePos(a), pb=sourcePos(b); return (pa.x*16+pa.y*4+pa.z)-(pb.x*16+pb.y*4+pb.z); }); }
  function centerAtSource(state,x,y,z){
    return centers(state).find(c=>{const p=sourcePos(c); return p.x===x&&p.y===y&&p.z===z;}) || null;
  }
  function wrongOnFace(state, axis, value, expectedColor) {
    return centers(state).filter(c=>{
      const p=sourcePos(c); return p[axis]===value && centerColor(c)!==expectedColor;
    });
  }
  function anyUnsolvedCenter(state){ return centers(state).find(c=>!centerSolved(c)) || null; }

  // Return {setup, direct}. A normal case returns setup moves, then the caller
  // performs setup + U2 swap + inverse setup. A special case directly performs
  // a complete swap sequence and returns an empty setup, matching the source.
  function getCenterSetup(state, initialTarget, swapCount) {
    let target={...initialTarget};
    for (let guard=0; guard<32; guard++) {
      if (target.y===0) {
        const list=wrongOnFace(state,'y',0,'W');
        for (const c of list) {
          const p=sourcePos(c);
          if ((p.x===2&&p.z===1&&swapCount%2===1)||(p.x===1&&p.z===2&&swapCount%2===0)) {
            return {setup:[],direct:[['R',-1],['r',-1],['F',-1],['U',1],['r',1],['U',-1],['l',1],['U',1],['r',-1],['U',-1],['l',-1],['F',1],['R',1],['r',1],['U',1],['U',1]]};
          } else if (p.x===2&&p.z===2) {
            return {setup:[],direct:[['U',1],['U',1]]};
          } else if ((p.x===1&&p.z===2&&swapCount%2===1)||(p.x===2&&p.z===1&&swapCount%2===0)) {
            return {setup:[],direct:[['L',-1],['l',-1],['F',-1],['r',1],['U',1],['l',1],['U',-1],['r',-1],['U',1],['l',-1],['U',-1],['F',1],['L',1],['l',1],['U',1],['U',1]]};
          }
        }
      } else if (target.x===0) {
        const list=wrongOnFace(state,'x',0,'O');
        for (const c of list) { const p=sourcePos(c);
          if (p.y===1&&p.z===1) return {setup:[['r',1],['u',1],['r',-1]],direct:[]};
          if (p.y===1&&p.z===2) return {setup:[['u',1],['f',-1],['u',-1],['f',1]],direct:[]};
          if (p.y===2&&p.z===2) return {setup:[['r',-1],['d',-1],['r',1]],direct:[]};
          if (p.y===2&&p.z===1) return {setup:[['f',1],['d',-1],['d',-1],['f',-1]],direct:[]};
        }
      } else if (target.z===3) {
        const list=wrongOnFace(state,'z',3,'G');
        for (const c of list) { const p=sourcePos(c);
          if (p.y===1&&p.x===1) return {setup:[['r',1],['u',1],['u',1],['r',-1]],direct:[]};
          if (p.y===1&&p.x===2) return {setup:[['f',-1],['u',1],['f',1]],direct:[]};
          if (p.y===2&&p.x===2) return {setup:[['d',1],['r',-1],['d',-1],['r',1]],direct:[]};
          if (p.y===2&&p.x===1) return {setup:[['f',1],['d',-1],['f',-1]],direct:[]};
        }
      } else if (target.x===3) {
        const list=wrongOnFace(state,'x',3,'R');
        for (const c of list) { const p=sourcePos(c);
          if (p.y===1&&p.z===2) return {setup:[['r',1],['u',-1],['r',-1]],direct:[]};
          if (p.y===1&&p.z===1) return {setup:[['f',-1],['u',1],['u',1],['f',1]],direct:[]};
          if (p.y===2&&p.z===1) return {setup:[['r',-1],['d',1],['r',1]],direct:[]};
          if (p.y===2&&p.z===2) return {setup:[['d',1],['f',1],['d',-1],['f',-1]],direct:[]};
        }
      } else if (target.z===0) {
        const list=wrongOnFace(state,'z',0,'B');
        for (const c of list) { const p=sourcePos(c);
          if (p.y===1&&p.x===2) return {setup:[['u',1],['r',1],['u',-1],['r',-1]],direct:[]};
          if (p.y===1&&p.x===1) return {setup:[['f',-1],['u',-1],['f',1]],direct:[]};
          if (p.y===2&&p.x===1) return {setup:[['r',-1],['d',-1],['d',-1],['r',1]],direct:[]};
          if (p.y===2&&p.x===2) return {setup:[['f',1],['d',1],['f',-1]],direct:[]};
        }
      } else if (target.y===3) {
        const list=wrongOnFace(state,'y',3,'Y');
        for (const c of list) { const p=sourcePos(c); const direct=[];
          if (p.x===1&&p.z===2) direct.push(['D',-1]);
          else if (p.z===1&&p.x===2) direct.push(['D',1]);
          else if (p.z===1&&p.x===1) direct.push(['D',-1],['D',-1]);
          direct.push(['L',1],['l',1],['U',-1],['r',1],['r',1],['U',-1],['l',-1],['U',1],['r',1],['r',1],['U',-1],['l',1],['U',1],['U',1],['L',-1],['l',-1],['U',1],['U',1]);
          if (p.x===1&&p.z===2) direct.push(['D',1]);
          else if (p.z===1&&p.x===2) direct.push(['D',-1]);
          else if (p.z===1&&p.x===1) direct.push(['D',-1],['D',-1]);
          return {setup:[],direct};
        }
      }

      // Cycle break: point the setup search at the current face of any unsolved
      // center, exactly as the source implementation does.
      const c=anyUnsolvedCenter(state);
      if (!c) return {setup:[],direct:[]};
      target=sourcePos(c);
    }
    throw new Error('Center setup search exceeded its guard limit.');
  }

  function simplifyMoves(moves) {
    // Safe adjacent compression only: X X -> X2, X X X -> X', etc.
    const out=[];
    const parse=m=>{ if(m.endsWith("'")) return {base:m.slice(0,-1),q:3}; if(m.endsWith('2') && !(m.length===2 && m[0]==='2')) return {base:m.slice(0,-1),q:2}; return {base:m,q:1}; };
    for (const m of moves) {
      const cur=parse(m), last=out.length?parse(out[out.length-1]):null;
      if (last&&last.base===cur.base) {
        out.pop(); const q=(last.q+cur.q)%4;
        if (q===1) out.push(cur.base); else if(q===2) out.push(cur.base+'2'); else if(q===3) out.push(cur.base+"'");
      } else out.push(m);
    }
    return out;
  }

  function solveCentersBuffer(state, options={}) {
    const scratch=E4.cloneState(state);
    const moves=[];
    let swapCount=0;
    const maxSwaps=options.maxSwaps || 64;
    if (centersSolved(scratch)) return {moves:[],swapCount:0,solved:true};

    while (!centersSolved(scratch)) {
      if (swapCount>=maxSwaps) throw new Error('Center solver exceeded '+maxSwaps+' swaps.');
      const buffer=centerAtSource(scratch,1,0,1);
      if (!buffer) throw new Error('4x4 center buffer was not found.');
      const target=desiredSourceFace(centerColor(buffer));
      if (!target) throw new Error('Center buffer has an unknown color.');
      swapCount++;
      const targetCoords={x:-1,y:-1,z:-1}; targetCoords[target.axis]=target.value;
      const {setup,direct}=getCenterSetup(scratch,targetCoords,swapCount);
      if (direct.length) {
        applySource(scratch,direct,moves);
      } else if (setup.length) {
        applySource(scratch,setup,moves);
        applySource(scratch,[['U',1],['U',1]],moves);
        applySource(scratch,invertSourceSeq(setup),moves);
      } else {
        throw new Error('Center solver produced no move for an unsolved state.');
      }
    }
    if (swapCount%2===1) applySource(scratch,[['U',1],['U',1]],moves);
    if (!centersSolved(scratch)) throw new Error('Center solver ended without solved centers.');
    const simplified=simplifyMoves(moves);
    const verify=E4.cloneState(state); E4.applyMoves(verify,simplified);
    if (!centersSolved(verify)) throw new Error('Simplified center sequence failed verification.');
    return {moves:simplified,swapCount,solved:true};
  }



  // --------------------------------------------------------------------------
  // Human-style center planner
  // --------------------------------------------------------------------------
  // Rather than shooting one center at a time, this planner searches with the
  // same short wide-turn insertion triggers a human uses to make 1x2 bars.
  // The search is center-only: wings/corners may move freely because reduction
  // has not started pairing them yet. Wide turns count as one move in the HUD.

  const CENTER_POSITIONS=[];
  for(const x of E4.COORDS) for(const y of E4.COORDS) for(const z of E4.COORDS){
    if([x,y,z].filter(v=>Math.abs(v)===3).length===1) CENTER_POSITIONS.push([x,y,z]);
  }
  CENTER_POSITIONS.sort((a,b)=>a[0]-b[0]||a[1]-b[1]||a[2]-b[2]);
  const CENTER_INDEX=new Map(CENTER_POSITIONS.map((p,i)=>[p.join(','),i]));
  function goalColorAtPosition(p){
    if(p[0]===3) return 'O'; if(p[0]===-3) return 'R';
    if(p[1]===3) return 'Y'; if(p[1]===-3) return 'W';
    if(p[2]===3) return 'G'; return 'B';
  }
  const CENTER_GOAL=CENTER_POSITIONS.map(goalColorAtPosition);
  const CENTER_FACE_GROUPS={R:[],L:[],U:[],D:[],F:[],B:[]};
  CENTER_POSITIONS.forEach((p,i)=>{
    const f=p[0]===3?'R':p[0]===-3?'L':p[1]===3?'U':p[1]===-3?'D':p[2]===3?'F':'B';
    CENTER_FACE_GROUPS[f].push(i);
  });

  const CENTER_MOVE_BASES=['R','L','U','D','F','B','2R','2L','2U','2D','2F','2B','Rw','Lw','Uw','Dw','Fw','Bw'];
  const CENTER_SEARCH_MOVES=CENTER_MOVE_BASES.flatMap(b=>[b,b+"'",b+'2']);
  let centerMovePermutations=null;
  let centerMacroActions=null;

  function centerArrayFromState(state){
    const a=new Array(24);
    for(const c of state.cubies){
      if(!isCenter(c)) continue;
      const i=CENTER_INDEX.get(c.pos.join(','));
      a[i]=centerColor(c);
    }
    return a;
  }
  function centerKey(a){ return a.join(''); }
  function centerApplyPermutation(a,p){
    const b=new Array(24); for(let i=0;i<24;i++) b[i]=a[p[i]]; return b;
  }
  function inverseMoveName(m){
    if(m.endsWith("'")) return m.slice(0,-1);
    if(m.endsWith('2')) return m;
    return m+"'";
  }
  function ensureCenterMovePermutations(){
    if(centerMovePermutations) return centerMovePermutations;
    centerMovePermutations={};
    for(const move of CENTER_SEARCH_MOVES){
      const st=E4.createSolvedState(); E4.applyMove(st,move);
      const p=new Array(24);
      for(const c of st.cubies){
        if(!isCenter(c)) continue;
        p[CENTER_INDEX.get(c.pos.join(','))]=CENTER_INDEX.get(c.home.join(','));
      }
      centerMovePermutations[move]=p;
    }
    return centerMovePermutations;
  }
  function centerComposeSequence(seq){
    ensureCenterMovePermutations();
    let p=Array.from({length:24},(_,i)=>i);
    for(const move of seq){
      const q=centerMovePermutations[move], r=new Array(24);
      for(let i=0;i<24;i++) r[i]=p[q[i]];
      p=r;
    }
    return p;
  }
  function ensureCenterMacroActions(){
    if(centerMacroActions) return centerMacroActions;
    ensureCenterMovePermutations();
    const faceAxis={R:'x',L:'x',U:'y',D:'y',F:'z',B:'z'};
    const wide=['Rw','Lw','Uw','Dw','Fw','Bw'];
    const outer=['R','L','U','D','F','B'];
    const actions=[];

    // Rotated/mirrored forms of Aw B Aw' and Aw' B Aw. These are the core
    // 4x4 center-bar insertion triggers (e.g. Rw U Rw', Rw U2 Rw').
    for(const w of wide){
      const axis=faceAxis[w[0]];
      for(const o of outer){
        if(faceAxis[o]===axis) continue;
        for(const suffix of ['',"'",'2']){
          const mid=o+suffix;
          const a=[w,mid,inverseMoveName(w)];
          const wp=inverseMoveName(w);
          const b=[wp,mid,w];
          actions.push({seq:a,perm:centerComposeSequence(a),cost:3});
          actions.push({seq:b,perm:centerComposeSequence(b),cost:3});
        }
      }
    }
    // Single outer/wide turns are setup/storage moves between triggers.
    for(const m of CENTER_SEARCH_MOVES.filter(m=>!m.startsWith('2'))){
      actions.push({seq:[m],perm:centerMovePermutations[m],cost:1});
    }
    // Dedupe actions that have identical center effects, preferring the shorter.
    const unique=new Map();
    for(const action of actions){
      const k=action.perm.join(','); const prev=unique.get(k);
      if(!prev || action.cost<prev.cost) unique.set(k,action);
    }
    centerMacroActions=[...unique.values()];
    return centerMacroActions;
  }

  function centerHumanScore(a){
    let score=0;
    for(const ids of Object.values(CENTER_FACE_GROUPS)){
      let correct=0;
      for(const i of ids) if(a[i]===CENTER_GOAL[i]) correct++;
      score += correct*30;
      if(correct===4) score += 180;
      // Reward adjacent correctly-coloured pairs: this strongly biases the
      // planner toward making 1x2 bars instead of isolated center stickers.
      for(let i=0;i<4;i++) for(let j=i+1;j<4;j++){
        const p=CENTER_POSITIONS[ids[i]], q=CENTER_POSITIONS[ids[j]];
        const dist=Math.abs(p[0]-q[0])+Math.abs(p[1]-q[1])+Math.abs(p[2]-q[2]);
        if(dist===2 && a[ids[i]]===CENTER_GOAL[ids[i]] && a[ids[j]]===CENTER_GOAL[ids[j]]) score+=20;
      }
    }
    return score;
  }
  function centerArraySolved(a){
    for(let i=0;i<24;i++) if(a[i]!==CENTER_GOAL[i]) return false;
    return true;
  }
  function simplifyHumanMoves(moves){
    const out=[];
    const parse=m=>{
      if(m.endsWith("'")) return {base:m.slice(0,-1),q:3};
      if(m.endsWith('2') && !(m.length===2 && m[0]==='2')) return {base:m.slice(0,-1),q:2};
      return {base:m,q:1};
    };
    for(const m of moves){
      const cur=parse(m), last=out.length?parse(out[out.length-1]):null;
      if(last&&last.base===cur.base){
        out.pop(); const q=(last.q+cur.q)%4;
        if(q===1) out.push(cur.base); else if(q===2) out.push(cur.base+'2'); else if(q===3) out.push(cur.base+"'");
      } else out.push(m);
    }
    return out;
  }

  function solveCentersHuman(state, options={}){
    const actions=ensureCenterMacroActions();
    const start=centerArrayFromState(state);
    if(centerArraySolved(start)) return {moves:[],solved:true,method:'Human Bars',fallback:false};
    const width=options.beamWidth || 500;
    const maxDepth=options.maxMacroDepth || 18;
    let beam=[{a:start,path:[],cost:0,score:centerHumanScore(start),lastAxis:null}];

    for(let depth=1; depth<=maxDepth; depth++){
      const bestByState=new Map();
      for(const node of beam){
        for(const action of actions){
          // Avoid immediate repetitions of exactly the same macro effect.
          const b=centerApplyPermutation(node.a,action.perm);
          const k=centerKey(b);
          const cost=node.cost+action.cost;
          const score=centerHumanScore(b);
          const rank=score-cost*0.45;
          const previous=bestByState.get(k);
          if(!previous || rank>previous.rank){
            bestByState.set(k,{a:b,path:node.path.concat(action.seq),cost,score,rank});
          }
        }
      }
      const next=[...bestByState.values()].sort((a,b)=>b.rank-a.rank).slice(0,width);
      const hit=next.find(n=>centerArraySolved(n.a));
      if(hit){
        const moves=simplifyHumanMoves(hit.path);
        const verify=E4.cloneState(state); E4.applyMoves(verify,moves);
        if(centersSolved(verify)) return {moves,solved:true,method:'Human Bars',fallback:false,macroDepth:depth};
      }
      beam=next;
      if(!beam.length) break;
    }
    return null;
  }

  // --------------------------------------------------------------------------
  // Ordered human center planner + semantic annotations
  // --------------------------------------------------------------------------
  const CENTER_STAGE_ORDER=['U','D','F','B','R','L'];
  const CENTER_STAGE_COLOR={U:'Y',D:'W',F:'G',B:'B',R:'O',L:'R'};
  const CENTER_COLOR_NAME={Y:'Yellow',W:'White',G:'Green',B:'Blue',O:'Orange',R:'Red'};
  const CENTER_FACE_NAME={U:'top',D:'bottom',F:'front',B:'back',R:'right',L:'left'};

  function faceCorrectCount(a,face){
    let n=0; for(const i of CENTER_FACE_GROUPS[face]) if(a[i]===CENTER_GOAL[i]) n++; return n;
  }
  function faceAdjacentCorrectPairs(a,face){
    const ids=CENTER_FACE_GROUPS[face]; let n=0;
    for(let ii=0;ii<ids.length;ii++) for(let jj=ii+1;jj<ids.length;jj++){
      const i=ids[ii],j=ids[jj],p=CENTER_POSITIONS[i],q=CENTER_POSITIONS[j];
      const dist=Math.abs(p[0]-q[0])+Math.abs(p[1]-q[1])+Math.abs(p[2]-q[2]);
      if(dist===2 && a[i]===CENTER_GOAL[i] && a[j]===CENTER_GOAL[j]) n++;
    }
    return n;
  }
  function faceSolvedArray(a,face){ return faceCorrectCount(a,face)===4; }
  function lockedFacesSolved(a,locked){ return locked.every(f=>faceSolvedArray(a,f)); }

  function orderedStageRank(a,face,locked,cost){
    const target=faceCorrectCount(a,face);
    const bars=faceAdjacentCorrectPairs(a,face);
    let lockedCorrect=0,lockedSolved=0;
    for(const f of locked){
      const c=faceCorrectCount(a,f); lockedCorrect+=c; if(c===4) lockedSolved++;
    }
    // Solved earlier centers are strongly protected, but temporary disturbance
    // inside the search is allowed if the macro restores them by the stage goal.
    return target*155 + bars*32 + lockedCorrect*210 + lockedSolved*360 + centerHumanScore(a)*0.10 - cost*0.55;
  }

  function orderedStageSearch(start,face,locked,options={}){
    if(faceSolvedArray(start,face) && lockedFacesSolved(start,locked)) return {a:start,chunks:[],cost:0};
    const actions=ensureCenterMacroActions();
    const width=options.stageBeamWidth || 600;
    const maxDepth=options.stageMacroDepth || 10;
    let beam=[{a:start,chunks:[],cost:0,rank:orderedStageRank(start,face,locked,0)}];
    for(let depth=1;depth<=maxDepth;depth++){
      const bestByState=new Map();
      for(const node of beam){
        for(const action of actions){
          const b=centerApplyPermutation(node.a,action.perm);
          const k=centerKey(b),cost=node.cost+action.cost;
          const rank=orderedStageRank(b,face,locked,cost);
          const prev=bestByState.get(k);
          if(!prev||rank>prev.rank){
            bestByState.set(k,{a:b,chunks:node.chunks.concat([{seq:action.seq.slice(),before:node.a,after:b,face}]),cost,rank});
          }
        }
      }
      const next=[...bestByState.values()].sort((a,b)=>b.rank-a.rank).slice(0,width);
      const hit=next.find(n=>faceSolvedArray(n.a,face)&&lockedFacesSolved(n.a,locked));
      if(hit) return hit;
      beam=next; if(!beam.length) break;
    }
    return null;
  }

  function chunkTemporarilyDisturbsLocked(chunk,locked){
    if(!locked.length || chunk.seq.length<2) return false;
    ensureCenterMovePermutations();
    let a=chunk.before;
    for(let i=0;i<chunk.seq.length-1;i++){
      a=centerApplyPermutation(a,centerMovePermutations[chunk.seq[i]]);
      if(locked.some(f=>faceCorrectCount(a,f)<4)) return true;
    }
    return false;
  }

  function semanticDescriptionForChunk(chunk,locked){
    const face=chunk.face,color=CENTER_STAGE_COLOR[face],name=CENTER_COLOR_NAME[color];
    const beforeCount=faceCorrectCount(chunk.before,face),afterCount=faceCorrectCount(chunk.after,face);
    const beforeBars=faceAdjacentCorrectPairs(chunk.before,face),afterBars=faceAdjacentCorrectPairs(chunk.after,face);
    const disturbedLocked=chunkTemporarilyDisturbsLocked(chunk,locked);
    if(afterCount===4 && beforeCount<4){
      return locked.length
        ? `Matching both ${name.toLowerCase()} bars while preserving the solved centers`
        : `Matching both ${name.toLowerCase()} bars to complete the ${name.toLowerCase()} center`;
    }
    if(disturbedLocked){
      const prior=locked.length?CENTER_COLOR_NAME[CENTER_STAGE_COLOR[locked[locked.length-1]]].toLowerCase():'solved';
      return `Moving the ${name.toLowerCase()} work bar out of the way before restoring the ${prior} center`;
    }
    if(beforeBars===0 && afterBars>0) return `Building first ${name} bar`;
    if(beforeBars>0 && afterBars>beforeBars) return `Building second ${name} bar`;
    if(beforeCount>=2 && afterCount>=beforeCount) return `Positioning the second ${name.toLowerCase()} bar for the ${CENTER_FACE_NAME[face]} center`;
    if(afterCount>beforeCount) return `Adding ${name.toLowerCase()} center pieces to the ${CENTER_FACE_NAME[face]} face`;
    return `Repositioning pieces to continue the ${name.toLowerCase()} center without losing solved work`;
  }

  function flattenOrderedChunks(chunks){
    const moves=[],annotations=[];
    for(const item of chunks){
      const desc=item.description||'Solving centers';
      for(const m of item.seq){ moves.push(m); annotations.push(desc); }
    }
    return {moves,annotations};
  }

  function solveCentersHumanOrdered(state,options={}){
    let a=centerArrayFromState(state);
    if(centerArraySolved(a)) return {moves:[],annotations:[],solved:true,method:'Ordered Human Bars',fallback:false,ordered:true};
    const allChunks=[]; const locked=[];
    for(const face of CENTER_STAGE_ORDER){
      if(faceSolvedArray(a,face)){ locked.push(face); continue; }
      const hit=orderedStageSearch(a,face,locked,options);
      if(!hit) return null;
      for(const chunk of hit.chunks){
        chunk.description=semanticDescriptionForChunk(chunk,locked);
        allChunks.push(chunk);
      }
      a=hit.a;
      if(!faceSolvedArray(a,face)||!lockedFacesSolved(a,locked)) return null;
      locked.push(face);
    }
    const flat=flattenOrderedChunks(allChunks);
    const simplified=simplifyHumanMoves(flat.moves);
    // Keep annotations aligned. If adjacent simplification changed the sequence,
    // retain the unsimplified semantic sequence; readability matters more here
    // than shaving an occasional cancellation.
    const moves=(simplified.length===flat.moves.length)?simplified:flat.moves;
    const annotations=(moves===flat.moves)?flat.annotations:flat.annotations.slice(0,simplified.length);
    const verify=E4.cloneState(state); E4.applyMoves(verify,moves);
    if(!centersSolved(verify)) return null;
    return {moves,annotations,solved:true,method:'Ordered Human Bars',fallback:false,ordered:true};
  }

  function solveCenters(state, options={}){
    const ordered=solveCentersHumanOrdered(state,options);
    if(ordered) return ordered;
    const human=solveCentersHuman(state,options);
    if(human) return {...human,annotations:human.moves.map(()=>"Human-style center bar construction"),ordered:false};
    // Reliability safety net. This should be rare; keep the already-proven U2
    // planner available rather than ever returning a bad center solution.
    const fallback=solveCentersBuffer(state,options);
    return {...fallback,annotations:fallback.moves.map(()=>"Safety fallback: placing center pieces with the deterministic buffer method"),method:'U2 fallback',fallback:true,ordered:false};
  }

  return {solveCenters,solveCentersHumanOrdered,solveCentersHuman,solveCentersBuffer,centersSolved,centerSolved,sourceBaseToMove, _sourcePos:sourcePos};
});
