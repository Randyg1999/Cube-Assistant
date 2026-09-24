// ============================================================================
// 4x4 wing-pair solver — beginner reduction style.
//
// Strategy:
//   * Centers must already be solved.
//   * Pair edges in a fixed teaching order (UF, UR, UB, UL, FR, FL, BR, BL,
//     DF, DR, DB, DL).
//   * Reposition the target wings with OUTER turns only. Outer turns preserve
//     solved centers and never split an already paired edge.
//   * Apply one of a small set of standard slice/pair/restore triggers.
//   * Preserve every pair completed earlier in the teaching order.
//
// The trigger vocabulary follows common beginner 4x4 reduction techniques
// documented by J Perm / Ruwix. The planner itself (outer-turn setup search,
// state tests, fixed-order preservation, annotations) is Cube Assistant code.
// ============================================================================
(function (root, factory) {
  if (typeof module === 'object' && module.exports) module.exports = factory(require('../4x4-engine.js'));
  else root.FourByFourWingSolver = factory(root.FourByFourEngine);
})(typeof self !== 'undefined' ? self : this, function (E4) {
  if (!E4) throw new Error('FourByFourEngine is required before FourByFourWingSolver.');

  const COLOR_NAME={W:'White',Y:'Yellow',R:'Red',O:'Orange',G:'Green',B:'Blue'};
  const FACE_COLOR={U:'Y',D:'W',R:'O',L:'R',F:'G',B:'B'};
  const EDGE_ORDER=[
    ['UF','Y','G'], ['UR','Y','O'], ['UB','Y','B'], ['UL','Y','R'],
    ['FR','G','O'], ['FL','G','R'], ['BR','B','O'], ['BL','B','R'],
    ['DF','W','G'], ['DR','W','O'], ['DB','W','B'], ['DL','W','R'],
  ].map(([slot,a,b])=>({slot,a,b,key:[a,b].sort().join('')}));

  const OUTER_MOVES=['U','D','R','L','F','B'].flatMap(b=>[b,b+"'",b+'2']);

  // Standard beginner pairing triggers plus mirrored forms. The first four are
  // normal slice/pair/restore cases. The final two are useful when parking
  // space is scarce near the end of edge pairing.
  const PAIR_TRIGGERS=[
    {kind:'normal',moves:['Uw',"L'","U'",'L',"Uw'"]},
    {kind:'normal',moves:["Uw'",'R','U',"R'",'Uw']},
    {kind:'normal',moves:['Uw',"R'","U'",'R',"Uw'"]},
    {kind:'normal',moves:["Uw'",'L','U',"L'",'Uw']},
    {kind:'last',moves:['Dw','R',"F'",'U',"R'",'F',"Dw'"]},
    {kind:'last',moves:["Dw'","L'",'F',"U'",'L',"F'",'Dw']},
  ];

  function inverseMove(move){
    if(move.endsWith("'")) return move.slice(0,-1);
    if(move.endsWith('2')) return move;
    return move+"'";
  }
  function inverseSeq(seq){ return seq.slice().reverse().map(inverseMove); }
  function wingColorKey(c){ return E4.cubieColorSet(c).slice().sort().join(''); }
  function isWing(c){ return E4.pieceKind(c)==='wing'; }
  function isCenter(c){ return E4.pieceKind(c)==='center'; }

  function centersSolved(state){
    return state.cubies.filter(isCenter).every(c=>{
      const color=wingColorKey(c), [x,y,z]=c.pos;
      return (x===3&&color==='O')||(x===-3&&color==='R')||
             (y===3&&color==='Y')||(y===-3&&color==='W')||
             (z===3&&color==='G')||(z===-3&&color==='B');
    });
  }

  // Two wings belong to one reduced edge slot when exactly two coordinates are
  // on outer faces (±3); the remaining ±1 coordinate distinguishes the wings.
  function edgeSlotKey(pos){
    if(pos.map(Math.abs).filter(v=>v===3).length!==2) return null;
    return pos.map(v=>Math.abs(v)===3?Math.sign(v)*3:0).join(',');
  }
  function pairedColorSets(state){
    const bySlot=new Map();
    for(const c of state.cubies){
      if(!isWing(c)) continue;
      const slot=edgeSlotKey(c.pos);
      if(!bySlot.has(slot)) bySlot.set(slot,[]);
      bySlot.get(slot).push(wingColorKey(c));
    }
    const result=new Set();
    for(const arr of bySlot.values()) if(arr.length===2&&arr[0]===arr[1]) result.add(arr[0]);
    return result;
  }
  function allWingsPaired(state){ return pairedColorSets(state).size===12; }

  function pairName(edge){ return COLOR_NAME[edge.a]+' / '+COLOR_NAME[edge.b]; }

  function tryTrigger(state,trigger,targetKey,locked){
    const s=E4.cloneState(state);
    E4.applyMoves(s,trigger.moves);
    if(!centersSolved(s)) return null;
    const pairs=pairedColorSets(s);
    if(!pairs.has(targetKey)) return null;
    for(const key of locked) if(!pairs.has(key)) return null;
    return s;
  }

  function findPairAction(start,targetKey,locked,maxSetupDepth=4){
    // Breadth-first outer-turn setup. At every setup state, test every pairing
    // trigger. If it succeeds, undo the setup afterward so the teaching frame
    // returns to where it started while the newly created pair remains.
    let frontier=[{state:E4.cloneState(start),setup:[]}];
    for(let depth=0; depth<=maxSetupDepth; depth++){
      for(const node of frontier){
        for(const trigger of PAIR_TRIGGERS){
          const after=tryTrigger(node.state,trigger,targetKey,locked);
          if(!after) continue;
          const restore=inverseSeq(node.setup);
          const finalState=E4.cloneState(after);
          E4.applyMoves(finalState,restore);
          if(!centersSolved(finalState)) continue;
          const finalPairs=pairedColorSets(finalState);
          if(!finalPairs.has(targetKey)) continue;
          let preserves=true; for(const k of locked) if(!finalPairs.has(k)){preserves=false;break;}
          if(!preserves) continue;
          return {moves:node.setup.concat(trigger.moves,restore), setup:node.setup.slice(), trigger:trigger.moves.slice(), restore, kind:trigger.kind};
        }
      }
      if(depth===maxSetupDepth) break;
      const next=[];
      for(const node of frontier){
        const lastFace=node.setup.length?node.setup[node.setup.length-1][0]:null;
        for(const move of OUTER_MOVES){
          // Avoid immediately turning the same face again; X/X'/X2 variants
          // are already represented as a single move.
          if(lastFace && move[0]===lastFace) continue;
          const s=E4.cloneState(node.state); E4.applyMove(s,move);
          next.push({state:s,setup:node.setup.concat(move)});
        }
      }
      frontier=next;
    }
    return null;
  }

  function annotateAction(action,edge,pairNumber){
    const name=pairName(edge), out=[];
    for(let i=0;i<action.setup.length;i++){
      out.push(`Positioning ${name} wings for pair ${pairNumber} of 12`);
    }
    const trigLabel=action.kind==='last'
      ? `Pairing ${name} with the last-edges slice / restore case`
      : `Joining the ${name} wings in the working slice`;
    for(let i=0;i<action.trigger.length;i++) out.push(trigLabel);
    for(let i=0;i<action.restore.length;i++){
      out.push(`Restoring the working position while preserving solved centers and earlier pairs`);
    }
    return out;
  }

  function solveWings(state,options={}){
    if(!centersSolved(state)) throw new Error('Solve all six centers before pairing wings.');
    const scratch=E4.cloneState(state), moves=[], annotations=[], stages=[];
    const locked=new Set();
    const maxSetupDepth=options.maxSetupDepth ?? 4;

    for(let i=0;i<EDGE_ORDER.length;i++){
      const edge=EDGE_ORDER[i], currentPairs=pairedColorSets(scratch);
      if(currentPairs.has(edge.key)){
        locked.add(edge.key);
        stages.push({edge:edge.slot,name:pairName(edge),alreadyPaired:true,start:moves.length,end:moves.length});
        continue;
      }
      const action=findPairAction(scratch,edge.key,locked,maxSetupDepth);
      if(!action) throw new Error(`Could not find a protected pairing sequence for ${pairName(edge)} (${edge.slot}).`);
      const start=moves.length;
      const notes=annotateAction(action,edge,i+1);
      for(let j=0;j<action.moves.length;j++){
        E4.applyMove(scratch,action.moves[j]); moves.push(action.moves[j]); annotations.push(notes[j]);
      }
      const pairs=pairedColorSets(scratch);
      if(!pairs.has(edge.key)) throw new Error(`Wing planner failed to retain the ${pairName(edge)} pair.`);
      for(const key of locked) if(!pairs.has(key)) throw new Error('Wing planner disturbed a previously protected pair.');
      locked.add(edge.key);
      stages.push({edge:edge.slot,name:pairName(edge),alreadyPaired:false,start,end:moves.length,kind:action.kind});
    }

    if(!centersSolved(scratch)) throw new Error('Wing pairing ended with disturbed centers.');
    if(!allWingsPaired(scratch)) throw new Error(`Wing pairing ended with only ${pairedColorSets(scratch).size} of 12 pairs complete.`);
    return {moves,annotations,stages,paired:12,order:EDGE_ORDER.map(e=>e.slot)};
  }

  return {EDGE_ORDER,centersSolved,pairedColorSets,allWingsPaired,solveWings};
});
