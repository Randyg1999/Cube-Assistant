// ============================================================================
// 4x4 reduced-cube finisher.
// Requires solved centers + 12 paired wing edges, then:
//   1) bridge the physical 4x4 into a virtual 3x3 state,
//   2) correct 4x4 OLL / PLL parity when the virtual state is impossible,
//   3) reuse Cube Assistant's existing beginner 3x3 solver,
//   4) emit teaching-oriented per-move annotations.
// ============================================================================
(function (root, factory) {
  if (typeof module === 'object' && module.exports) {
    module.exports = factory(
      require('../4x4-engine.js'), require('../cube-engine.js'), require('../cube-solver.js'),
      require('../core/cube-math.js'), require('./solve-wings-4x4.js')
    );
  } else {
    root.FourByFourReducedSolver = factory(
      root.FourByFourEngine, root.CubeEngine, root.CubeSolver, root.CubeMath, root.FourByFourWingSolver
    );
  }
})(typeof self !== 'undefined' ? self : this, function (E4, E, S, CubeMath, WingSolver) {
  if (!E4 || !E || !S || !CubeMath || !WingSolver) throw new Error('4x4 reduced solver dependencies are missing.');

  const OUTER_BASES=['U','D','R','L','F','B'];
  const OUTER_MOVES=OUTER_BASES.flatMap(b=>[b,b+"'",b+'2']);
  // Rotation-free OLL parity algorithm (inner-R / inner-L notation translated
  // to Cube Assistant's 2R / 2L notation). This flips the reduced UF edge.
  const OLL_PARITY=['2R2','B2','U2','2L','U2',"2R'",'U2','2R','U2','F2','2R','F2',"2L'",'B2','2R2'];
  // Standard 4x4 PLL parity correction. It toggles the reduced permutation
  // parity and leaves the puzzle reducible to an ordinary 3x3 state.
  const PLL_PARITY=['2R2','U2','2R2','Uw2','2R2','Uw2'];

  function inverseMove(move){
    if(move.endsWith('2')) return move;
    return move.endsWith("'") ? move.slice(0,-1) : move+"'";
  }
  function inverseSeq(seq){ return seq.slice().reverse().map(inverseMove); }
  function colorKey4(c){ return E4.cubieColorSet(c).slice().sort().join(','); }

  function rotations24(){
    const gens=[CubeMath.rotMatrix('x',90),CubeMath.rotMatrix('y',90),CubeMath.rotMatrix('z',90)];
    const q=[CubeMath.IDENTITY], out=[], seen=new Set();
    while(q.length){
      const m=q.shift(), k=m.flat().join(',');
      if(seen.has(k)) continue;
      seen.add(k); out.push(m);
      for(const g of gens) q.push(CubeMath.matMulMat(g,m));
    }
    return out;
  }
  const ROTATIONS=rotations24();

  function worldColorMap4(c){
    const m={};
    for(const face of E4.FACES){
      const col=E4.currentColorAt(c,E4.FACE_KEY[face]);
      if(col) m[col]=face;
    }
    return m;
  }

  function edgeSlotKey(pos){
    if(pos.map(Math.abs).filter(v=>v===3).length!==2) return null;
    return pos.map(v=>Math.abs(v)===3?Math.sign(v)*3:0).join(',');
  }

  function reduced3x3(state4){
    if(!WingSolver.centersSolved(state4)) throw new Error('The six 4x4 centers must be solved before reduction.');
    if(!WingSolver.allWingsPaired(state4)) throw new Error('All 12 wing pairs must be complete before reduction.');

    // The virtual 3x3 must use the same layout the 4x4 center and wing solvers
    // build toward (white down, yellow up, green front, orange right), not the
    // displayed white-up default, or its fixed centers would disagree with the
    // real 4x4 centers.
    const solved3=E.createSolvedState(E.WHITE_DOWN_SCHEME);
    const protoById=Object.fromEntries(solved3.cubies.map(c=>[c.id,c]));
    const result=[];

    // Fixed 3x3 centers represent the solved 2x2 center blocks.
    for(const c of solved3.cubies){
      if(E.cubieColorSet(c).length===1){
        result.push({pos:c.pos.slice(),ori:c.ori.map(r=>r.slice()),stickers:{...c.stickers},id:c.id});
      }
    }

    const sources=[];
    for(const c of state4.cubies) if(E4.pieceKind(c)==='corner') sources.push(c);
    const wingSlots=new Map();
    for(const c of state4.cubies){
      if(E4.pieceKind(c)!=='wing') continue;
      const slot=edgeSlotKey(c.pos);
      if(slot && !wingSlots.has(slot)) wingSlots.set(slot,c);
    }
    for(const c of wingSlots.values()) sources.push(c);

    for(const source of sources){
      const id=colorKey4(source);
      const proto=protoById[id];
      if(!proto) throw new Error('Could not map reduced piece '+id+' into the 3x3 model.');
      const worldColors=worldColorMap4(source);
      const pos=source.pos.map(v=>v===3?1:v===-3?-1:0);
      let ori=null;
      for(const rotation of ROTATIONS){
        let ok=true;
        for(const [localKey,color] of Object.entries(proto.stickers)){
          if(color==null) continue;
          const vec=CubeMath.matMulVec(rotation,E.LOCAL_VEC[localKey]).map(Math.round);
          const worldKey=E.KEY_TO_FACE[CubeMath.vecKey(vec)];
          const face=Object.keys(E.FACE_KEY).find(f=>E.FACE_KEY[f]===worldKey);
          if(worldColors[color]!==face){ ok=false; break; }
        }
        if(ok){ ori=rotation; break; }
      }
      if(!ori) throw new Error('Could not determine reduced orientation for '+id+'.');
      result.push({pos,ori:ori.map(r=>r.slice()),stickers:{...proto.stickers},id:proto.id});
    }
    if(result.length!==26) throw new Error('Reduced bridge produced '+result.length+' pieces instead of 26.');
    return {cubies:result};
  }

  function errorTypes(state3){ return new Set(E.verifyPieceComposition(state3).errors.map(e=>e.type)); }

  function setupSequences(maxDepth=2){
    const out=[[]], frontier=[[]];
    for(let depth=1;depth<=maxDepth;depth++){
      const next=[];
      for(const seq of frontier){
        const last=seq.length?seq[seq.length-1][0]:null;
        for(const m of OUTER_MOVES){
          if(last && m[0]===last) continue;
          const n=seq.concat(m); out.push(n); next.push(n);
        }
      }
      frontier.splice(0,frontier.length,...next);
    }
    return out;
  }
  const OLL_SETUPS=setupSequences(2);

  function findOllParityCorrection(state4){
    for(const setup of OLL_SETUPS){
      const test=E4.cloneState(state4);
      const seq=setup.concat(OLL_PARITY,inverseSeq(setup));
      E4.applyMoves(test,seq);
      if(!WingSolver.centersSolved(test) || !WingSolver.allWingsPaired(test)) continue;
      const types=errorTypes(reduced3x3(test));
      if(!types.has('edge-flip')) return seq;
    }
    throw new Error('OLL parity was detected, but no protected UF setup was found.');
  }

  function optimizeOuterMoves(moves){
    const stack=[];
    const amount=m=>m.endsWith('2')?2:m.endsWith("'")?3:1;
    function base(m){ return m.replace(/[2']$/,''); }
    function fromAmount(b,a){ a%=4; return a===0?null:a===1?b:a===2?b+'2':b+"'"; }
    for(const m of moves){
      const p=stack[stack.length-1];
      if(p && base(p)===base(m)){
        stack.pop(); const n=fromAmount(base(m),amount(p)+amount(m)); if(n) stack.push(n);
      }else stack.push(m);
    }
    return stack;
  }

  function isDaisyComplete(s){
    const white=E.centerColor(s,'D');
    const slots=[[0,1,1],[1,1,0],[0,1,-1],[-1,1,0]];
    return slots.every(pos=>{const c=s.cubies.find(x=>x.pos.join(',')===pos.join(',')); return c&&E.currentColorAt(c,E.FACE_KEY.U)===white;});
  }
  function whiteCrossComplete(s){ return S.crossPieceDefs(s).every(p=>S.pieceMatchesTarget(s,p.colorSet,p.targetMap)); }
  function whiteCornersComplete(s){ return S.f1CornerDefs(s).every(p=>S.pieceMatchesTarget(s,p.colorSet,p.targetMap)); }
  function secondLayerComplete(s){ return S.f2EdgeDefs(s).every(p=>S.pieceMatchesTarget(s,p.colorSet,p.targetMap)); }
  function yellowCrossComplete(s){
    const yellow=E.centerColor(s,'U');
    return S.llEdgeDefs(s).every(p=>{const c=E.findCubieByColors(s,p.colorSet); return c&&E.currentColorAt(c,E.FACE_KEY.U)===yellow;});
  }
  function yellowCornersPlaced(s){
    return S.llCornerDefs(s).every(p=>E.findCubieByColors(s,p.colorSet)?.pos.join(',')===p.slot.join(','));
  }
  function yellowFaceComplete(s){
    const yellow=E.centerColor(s,'U');
    return s.cubies.filter(c=>c.pos[1]===1 && E.cubieColorSet(c).length>1)
      .every(c=>E.currentColorAt(c,E.FACE_KEY.U)===yellow);
  }

  function annotateBeginnerMoves(start3,moves){
    const s=E.cloneState(start3), notes=[];
    for(const m of moves){
      let note;
      if(!isDaisyComplete(s)) note='Building the Yellow Daisy';
      else if(!whiteCrossComplete(s)) note='Turning the Yellow Daisy into the White Cross';
      else if(!whiteCornersComplete(s)) note='Completing the White first-layer corners';
      else if(!secondLayerComplete(s)) note='Solving the middle-layer edge pairs';
      else if(!yellowCrossComplete(s)) note='Building the Yellow Cross';
      else if(!yellowCornersPlaced(s)) note='Positioning the Yellow last-layer corners';
      else if(!yellowFaceComplete(s)) note='Orienting the Yellow corners to complete the Yellow face';
      else note='Positioning the final edge pairs to finish the cube';
      notes.push(note); E.applyMove(s,m);
    }
    return notes;
  }

  function solveReduced(state4){
    const scratch4=E4.cloneState(state4), moves=[], annotations=[], stages=[];
    let reduced=reduced3x3(scratch4);
    let types=errorTypes(reduced);

    if(types.has('edge-flip')){
      const seq=findOllParityCorrection(scratch4), start=moves.length;
      E4.applyMoves(scratch4,seq); moves.push(...seq);
      annotations.push(...seq.map(()=> 'OLL parity detected — correcting the single impossible flipped reduced edge'));
      stages.push({name:'OLL Parity',start,end:moves.length});
      reduced=reduced3x3(scratch4); types=errorTypes(reduced);
    }
    if(types.has('parity')){
      const start=moves.length;
      E4.applyMoves(scratch4,PLL_PARITY); moves.push(...PLL_PARITY);
      annotations.push(...PLL_PARITY.map(()=> 'PLL parity detected — correcting the impossible reduced edge permutation'));
      stages.push({name:'PLL Parity',start,end:moves.length});
      reduced=reduced3x3(scratch4); types=errorTypes(reduced);
    }
    const verification=E.verifyPieceComposition(reduced);
    if(!verification.valid) throw new Error('Reduced 3x3 state is still invalid after parity correction: '+verification.errors.map(e=>e.message||e.type).join(' '));

    const start3=E.cloneState(reduced);
    const work=E.cloneState(reduced), cross=[];
    S.solveDaisyCross(work,cross);
    const corners=S.solveFirstLayer(work);
    if(corners.failed) throw new Error('3x3 first-layer solver stopped: '+corners.error);
    const second=S.solveSecondLayer(corners.state);
    if(second.failed) throw new Error('3x3 middle-layer solver stopped: '+second.error);
    const last=S.solveLastLayer(second.state);
    if(last.failed) throw new Error('3x3 last-layer solver stopped: '+last.error);

    const beginner=optimizeOuterMoves(cross).concat(
      optimizeOuterMoves(corners.moves), optimizeOuterMoves(second.moves), optimizeOuterMoves(last.moves)
    );
    // Generate narration from actual reduced-state milestones after optimization.
    const beginnerNotes=annotateBeginnerMoves(start3,beginner);
    const start=moves.length;
    moves.push(...beginner); annotations.push(...beginnerNotes);
    stages.push({name:'Beginner 3x3 Finish',start,end:moves.length});

    E4.applyMoves(scratch4,beginner);
    if(!E4.isSolved(scratch4)) throw new Error('Reduced 3x3 plan completed, but the physical 4x4 is not solved.');
    return {moves,annotations,stages,ollParity:stages.some(s=>s.name==='OLL Parity'),pllParity:stages.some(s=>s.name==='PLL Parity')};
  }

  return {OLL_PARITY,PLL_PARITY,reduced3x3,solveReduced};
});
