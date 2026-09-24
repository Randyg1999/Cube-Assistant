// Dedicated 3x3 CFOP solver. It deliberately does not call window.CubeSolver
// or the Beginner/Kociemba solvers. Shared dependency: CubeEngine only.
(function(root, factory){
  if (typeof module === 'object' && module.exports) module.exports = factory(require('../cube/cube-engine.js'));
  else root.CubeSolver3x3CFOP = factory(root.CubeEngine);
})(typeof self !== 'undefined' ? self : this, function(E){
  'use strict';

  const FACE_TURNS = ['U',"U'",'U2','D',"D'",'D2','R',"R'",'R2','L',"L'",'L2','F',"F'",'F2','B',"B'",'B2'];
  const SIDES = ['F','R','B','L'];
  const NEXT = {F:'R',R:'B',B:'L',L:'F'};
  const PREV = {R:'F',B:'R',L:'B',F:'L'};
  const AUF = [[],['U'],["U'"],['U2']];

  function inv(m){ if(m.endsWith('2')) return m; return m.endsWith("'") ? m.slice(0,-1) : m+"'"; }
  function inverseSeq(seq){ return seq.slice().reverse().map(inv); }
  function optimize(moves){
    const out=[]; const val={'':1,"'":3,'2':2}; const suf={1:'',2:'2',3:"'"};
    for(const m of moves){
      const f=m[0], a=val[m.slice(1)]; const p=out[out.length-1];
      if(p && p[0]===f){ const n=(val[p.slice(1)]+a)%4; out.pop(); if(n) out.push(f+suf[n]); }
      else out.push(m);
    }
    return out;
  }
  function apply(state, seq){ for(const m of seq) E.applyMove(state,m); }
  function id(colors){ return E.idFromColors(colors); }
  function pieceSolved(state, def){
    const c=E.findCubieByColors(state,def.colorSet);
    for(const [color,face] of Object.entries(def.targetMap)) if(E.currentColorAt(c,E.FACE_KEY[face])!==color) return false;
    return true;
  }
  function allSolved(state, defs){ return defs.every(d=>pieceSolved(state,d)); }
  function sig(state, ids){
    const by=Object.fromEntries(state.cubies.map(c=>[c.id,c]));
    return ids.map(k=>{const c=by[k]; return k+':'+c.pos.join(',')+':'+c.ori.flat().join(',');}).join('|');
  }

  function crossDefs(state){
    const d=E.centerColor(state,'D');
    return SIDES.map(s=>{const c=E.centerColor(state,s), t={}; t[d]='D'; t[c]=s; return {colorSet:[d,c],targetMap:t,label:'Cross '+d+'/'+c};});
  }
  function pairDefs(state){
    const d=E.centerColor(state,'D');
    return [['F','R'],['R','B'],['B','L'],['L','F']].map(([a,b])=>{
      const ca=E.centerColor(state,a), cb=E.centerColor(state,b);
      const ct={}; ct[d]='D'; ct[ca]=a; ct[cb]=b;
      const et={}; et[ca]=a; et[cb]=b;
      return {slot:a+b, corner:{colorSet:[d,ca,cb],targetMap:ct}, edge:{colorSet:[ca,cb],targetMap:et}};
    });
  }

  function trackedSignature(state, defs){ return sig(state, defs.map(d=>id(d.colorSet))); }

  // The solved cube this search aims for: the standard solved state turned to
  // whichever of the 24 whole-cube orientations matches this cube's centers.
  // It must be the same solved cube, rotated, not one rebuilt from the center
  // colors: signatures compare orientation matrices, which only line up when the
  // pieces share the engine's home sticker layout. This keeps CFOP correct in any
  // orientation — in particular the white-down copy solve-3x3.js hands it, while
  // the engine's default solved state rests white-up.
  let rotations24Cache=null;
  function rotations24(){
    if(rotations24Cache) return rotations24Cache;
    const gens=[E.rotMatrix('x',90),E.rotMatrix('y',90),E.rotMatrix('z',90)];
    const q=[[[1,0,0],[0,1,0],[0,0,1]]], out=[], seen=new Set();
    while(q.length){
      const m=q.shift(), k=m.flat().join(',');
      if(seen.has(k)) continue;
      seen.add(k); out.push(m);
      for(const g of gens) q.push(E.matMulMat(g,m));
    }
    return rotations24Cache=out;
  }
  function solvedGoalFor(state){
    const base=E.createSolvedState();
    for(const R of rotations24()){
      const g=E.cloneState(base);
      for(const c of g.cubies){ c.pos=E.matMulVec(R,c.pos).map(Math.round); c.ori=E.matMulMat(R,c.ori); }
      if(E.FACES.every(f=>E.centerColor(g,f)===E.centerColor(state,f))) return g;
    }
    throw new Error('CFOP could not match this cube\u2019s centers to a solved orientation.');
  }

  // Bidirectional reduced-piece search. Only tracked CFOP pieces are part of the
  // signature, so the search stays small while still returning an exact sequence
  // that places those pieces in their solved locations/orientations.
  function bidirSolve(state, defs, allowed, maxDepth){
    const goal=solvedGoalFor(state);
    const startSig=trackedSignature(state,defs), goalSig=trackedSignature(goal,defs);
    if(startSig===goalSig) return [];

    function build(rootState, depthLimit){
      const map=new Map();
      const q=[{s:E.cloneState(rootState),path:[],last:''}]; let qi=0;
      map.set(trackedSignature(rootState,defs), []);
      while(qi<q.length){
        const n=q[qi++]; if(n.path.length>=depthLimit) continue;
        for(const m of allowed){
          if(n.last && n.last===m[0]) continue;
          const ns=E.cloneState(n.s); E.applyMove(ns,m); const path=n.path.concat(m);
          const k=trackedSignature(ns,defs); if(map.has(k)) continue;
          map.set(k,path); q.push({s:ns,path,last:m[0]});
        }
      }
      return map;
    }

    const backDepth=Math.floor(maxDepth/2);
    const fwdDepth=maxDepth-backDepth;
    const back=build(goal,backDepth);
    const q=[{s:E.cloneState(state),path:[],last:''}]; let qi=0;
    const seen=new Set([startSig]);
    while(qi<q.length){
      const n=q[qi++];
      const k=trackedSignature(n.s,defs);
      if(back.has(k)) return optimize(n.path.concat(inverseSeq(back.get(k))));
      if(n.path.length>=fwdDepth) continue;
      for(const m of allowed){
        if(n.last && n.last===m[0]) continue;
        const ns=E.cloneState(n.s); E.applyMove(ns,m); const path=n.path.concat(m);
        const sk=trackedSignature(ns,defs); if(seen.has(sk)) continue; seen.add(sk);
        if(back.has(sk)) return optimize(path.concat(inverseSeq(back.get(sk))));
        q.push({s:ns,path,last:m[0]});
      }
    }
    return null;
  }

  // Direct cross: no daisy and no Beginner solver. Search only the four white
  // cross edges and return a short direct cross sequence.
  function solveCross(state){
    const defs=crossDefs(state);
    for(const depth of [6,7,8]){
      const p=bidirSolve(state,defs,FACE_TURNS,depth);
      if(p){ apply(state,p); return p; }
    }
    throw new Error('CFOP cross search did not converge.');
  }

  // Standard CFOP F2L algorithm bank (front-right canonical slot). Rather
  // than sharing Beginner logic, CFOP tests the standard pair algorithms against
  // the live pair and picks the shortest one that solves the pair while preserving
  // the cross and any already-solved F2L slots.
  const F2L_ALGS=[
    "U R U' R'", "F' U' F", "F R' F' R", "R U R'",
    "U' R U R' U2 R U' R'", "U' R U2 R' U2 R U' R'",
    "U F' U' F U2 F' U F", "U' R U' R' U F' U' F",
    "U' R U2 R' U F' U' F", "U' R U R' U R U R'",
    "U R U' R' U' R U R' U' R U R'", "U' R U' R' U R U R'",
    "R' D' R U' R' D R U R U' R'", "R U2 R' U' R U R'",
    "R U' R' U2 F' U' F", "R' F R F' R U' R' U R U' R'",
    "U R U2 R' U R U' R'", "U2 R U R' U R U' R'",
    "U' R U' R2 F R F' R U' R'", "F' L' U2 L F",
    "R U R' U2 R U R' U' R U R'", "F U R U' R' F' R U' R'",
    "U' R' F R F' R U R'", "R U' R' U R U' R'",
    "R' F R F' U R U' R'", "U R U' R' F R' F' R",
    "R U R' U' F R' F' R", "R U R' U' R U R'",
    "U' R U2 R' U2 R U R'", "U' R' F R F' R U' R'",
    "U' R U' R' U2 R U' R'", "R U R' U' R U R' U' R U R'",
    "U' R U2 R' U R U R'", "U F' U' F U' R U R'",
    "R U' R' U' R U R' U2 R U' R'", "F' L' U2 L F R U R'",
    "R2 U2 F R2 F' U2 R' U R'", "R U' R' U R U2 R' U R U' R'",
    "R U' R' F' L' U2 L F"
  ].map(x=>x.split(/\s+/));

  function rotateAlgToSlot(alg, quarterTurns){
    const ring=['F','R','B','L'];
    return alg.map(m=>{
      const f=m[0]; if(!ring.includes(f)) return m;
      const nf=ring[(ring.indexOf(f)+quarterTurns)%4]; return nf+m.slice(1);
    });
  }
  function slotQuarter(slot){ return {FR:0,RB:1,BL:2,LF:3}[slot]; }
  const EXTRACT=[];
  for(const f of SIDES){
    EXTRACT.push([f,'U',f+"'"],[f,"U'",f+"'"],[f+"'",'U',f],[f+"'","U'",f]);
  }
  function candidateF2LSequences(pair){
    const q=slotQuarter(pair.slot), out=[];
    for(const pre of AUF){
      for(const a of F2L_ALGS) out.push(optimize(pre.concat(rotateAlgToSlot(a,q))));
    }
    // If one/both pieces are trapped in a wrong F2L slot, a single human trigger
    // extracts them before applying a normal F2L case.
    for(const ex of EXTRACT) for(const pre of AUF) for(const a of F2L_ALGS)
      out.push(optimize(ex.concat(pre,rotateAlgToSlot(a,q))));
    return out.sort((a,b)=>a.length-b.length);
  }
  function solvePair(state,pair,protectedPairs,cross){
    const defs=cross.concat(...protectedPairs.map(p=>[p.corner,p.edge]),pair.corner,pair.edge);
    if(allSolved(state,defs)) return [];
    for(const seq of candidateF2LSequences(pair)){
      const test=E.cloneState(state); apply(test,seq);
      if(allSolved(test,defs)){ apply(state,seq); return seq; }
    }
    // Rare awkward states can need two extraction triggers before they reduce
    // to one of the canonical 41 F2L cases. Keep this as a bounded human-pattern
    // fallback rather than invoking another solve method.
    const q=slotQuarter(pair.slot);
    let best=null;
    for(const ex1 of EXTRACT) for(const ex2 of EXTRACT) for(const pre of AUF) for(const a of F2L_ALGS){
      const seq=optimize(ex1.concat(ex2,pre,rotateAlgToSlot(a,q)));
      if(best && seq.length>=best.length) continue;
      const test=E.cloneState(state); apply(test,seq);
      if(allSolved(test,defs)) best=seq;
    }
    if(best){ apply(state,best); return best; }
    throw new Error('CFOP F2L case bank did not match pair '+pair.slot+'.');
  }

  function topEdge(c){ return c.pos[1]===1 && ((c.pos[0]===0)!==(c.pos[2]===0)); }
  function topCorner(c){ return c.pos[1]===1 && Math.abs(c.pos[0])===1 && Math.abs(c.pos[2])===1; }
  function topEdgesOriented(state){ const u=E.centerColor(state,'U'); return state.cubies.filter(topEdge).every(c=>E.currentColorAt(c,E.FACE_KEY.U)===u); }
  function topCornersOriented(state){ const u=E.centerColor(state,'U'); return state.cubies.filter(topCorner).every(c=>E.currentColorAt(c,E.FACE_KEY.U)===u); }
  function ollDone(s){ return topEdgesOriented(s)&&topCornersOriented(s); }
  function llCornerDefs(state){
    const u=E.centerColor(state,'U');
    return [['F','R'],['R','B'],['B','L'],['L','F']].map(([a,b])=>{const ca=E.centerColor(state,a),cb=E.centerColor(state,b),t={};t[u]='U';t[ca]=a;t[cb]=b;return{colorSet:[u,ca,cb],targetMap:t};});
  }
  function llEdgeDefs(state){
    const u=E.centerColor(state,'U'); return SIDES.map(s=>{const c=E.centerColor(state,s),t={};t[u]='U';t[c]=s;return{colorSet:[u,c],targetMap:t};});
  }
  function pllCornersDone(s){ return allSolved(s,llCornerDefs(s)); }
  function pllEdgesDone(s){ return allSolved(s,llEdgeDefs(s)); }

  // Full CFOP last-layer notation support. The app's logical engine natively
  // understands outer face turns plus M/E/S slices, so standard wide turns and
  // whole-cube rotations are expanded here instead of leaking another solver's
  // notation/logic into CFOP.
  function cleanToken(tok){
    tok=tok.replace(/[()\[\]]/g,'').trim();
    if(!tok) return '';
    // U2' and R2' are the same physical turn as U2/R2.
    tok=tok.replace(/2'$/, '2');
    return tok;
  }
  function tokenSuffix(tok){ return tok.endsWith('2')?'2':tok.endsWith("'")?"'":''; }
  function baseToken(tok){ const s=tokenSuffix(tok); return s?tok.slice(0,-s.length):tok; }
  function withSuffix(base,suf){ return base+(suf||''); }
  function inverseSuffix(suf){ return suf==='2'?'2':suf==="'"?'':"'"; }
  function expandNotationToken(raw){
    const tok=cleanToken(raw); if(!tok) return [];
    const suf=tokenSuffix(tok), base=baseToken(tok);
    const wide={
      r:['R',"M'"], l:['L','M'], u:['U',"E'"], d:['D','E'], f:['F','S'], b:['B',"S'"]
    };
    const rot={
      x:['R',"M'","L'"], y:['U',"E'","D'"], z:['F','S',"B'"]
    };
    const compose=(parts,s)=>{
      if(s==='2') return parts.concat(parts);
      if(s==="'") return inverseSeq(parts);
      return parts.slice();
    };
    if(wide[base]) return optimize(compose(wide[base],suf));
    if(rot[base]) return optimize(compose(rot[base],suf));
    // Native outer/slice move.
    if(/^[UDRLFBMES]$/.test(base)) return [withSuffix(base,suf)];
    throw new Error('Unsupported CFOP notation token: '+raw);
  }
  function parseAlg(s){
    const raw=s.trim().split(/\s+/).filter(Boolean), out=[];
    for(const t of raw) out.push(...expandNotationToken(t));
    return optimize(out);
  }

  // Full 57-case OLL bank. Algorithms are standard CFOP algorithms; recognition
  // is state-based, so the solver is free to use any AUF before the algorithm.
  // Lower-case wide turns are expanded above into outer + slice turns.
  const FULL_OLL=[
    ['OLL 1', "R U2 R2 F R F' U2 R' F R F'"],
    ['OLL 2', "L F L' U2 R U2 R' U2 L F' L'"],
    ['OLL 3', "r' R2 U R' U r U2 r' U M'"],
    ['OLL 4', "l L2 U' L U' l' U2 l U' M'"],
    ['OLL 5', "l' U2 L U L' U l"],
    ['OLL 6', "r U2 R' U' R U' r'"],
    ['OLL 7', "r U R' U R U2 r'"],
    ['OLL 8', "l' U' L U' L' U2 l"],
    ['OLL 9', "R U R' U' R' F R2 U R' U' F'"],
    ['OLL 10', "r R2 U2 R U R' U R U R r'"],
    ['OLL 11', "S' U2 R U R' U R U2 R' S"],
    ['OLL 12', "M' R' U' R U' R' U2 R U' R r'"],
    ['OLL 13', "F U R U' R2 F' R U R U' R'"],
    ['OLL 14', "R' F R U R' F' R F U' F'"],
    ['OLL 15', "l' U' l L' U' L U l' U l"],
    ['OLL 16', "r U r' R U R' U' r U' r'"],
    ['OLL 17', "F R' F' R2 r' U R U' R' U' M'"],
    ['OLL 18', "r U R' U R U2 r2 U' R U' R' U2 r"],
    ['OLL 19', "r' R U R U R' U' M' R' F R F'"],
    ['OLL 20', "r U R' U' M2 U R U' R' U' M'"],
    ['OLL 21', "R U R' U R U' R' U R U2 R'"],
    ['OLL 22', "R U2 R2 U' R2 U' R2 U2 R"],
    ['OLL 23', "R2 D R' U2 R D' R' U2 R'"],
    ['OLL 24', "r U R' U' r' F R F'"],
    ['OLL 25', "F R' F' r U R U' r'"],
    ['OLL 26', "R U2 R' U' R U' R'"],
    ['OLL 27', "R U R' U R U2 R'"],
    ['OLL 28', "r U R' U' r' R U R U' R'"],
    ['OLL 29', "l D l' U l D' l2 U l U' l' U' l"],
    ['OLL 30', "r' D' r U' r' D r2 U' r' U r U r'"],
    ['OLL 31', "R' U' F U R U' R' F' R"],
    ['OLL 32', "L U F' U' L' U L F L'"],
    ['OLL 33', "R U R' U' R' F R F'"],
    ['OLL 34', "f R f' U' r' U' R U M'"],
    ['OLL 35', "R U2 R2 F R F' R U2 R'"],
    ['OLL 36', "L' U' L U' L' U L U L F' L' F"],
    ['OLL 37', "F R' F' R U R U' R'"],
    ['OLL 38', "R U R' U R U' R' U' R' F R F'"],
    ['OLL 39', "f' L F L' U' L' U L S"],
    ['OLL 40', "f R' F' R U R U' R' S'"],
    ['OLL 41', "R U R' U R U2 R' F R U R' U' F'"],
    ['OLL 42', "R' F R F' R' F R F' R U R' U' R U R'"],
    ['OLL 43', "R' U' F' U F R"],
    ['OLL 44', "F U R U' R' F'"],
    ['OLL 45', "F R U R' U' F'"],
    ['OLL 46', "R' U' R' F R F' U R"],
    ['OLL 47', "F R' F' R U2 R U' R' U R U2 R'"],
    ['OLL 48', "F R U R' U' R U R' U' F'"],
    ['OLL 49', "r U' r2 U r2 U r2 U' r"],
    ['OLL 50', "l' U l2 U' l2 U' l2 U l'"],
    ['OLL 51', "F U R U' R' U R U' R' F'"],
    ['OLL 52', "R' F' U' F U' R U R' U R"],
    ['OLL 53', "l' U' L U' L' U L U' L' U2 l"],
    ['OLL 54', "r U R' U R U' R' U R U2 r'"],
    ['OLL 55', "R' F U R U' R2 F' R2 U R' U' R"],
    ['OLL 56', "r U r' U R U' R' U R U' M' U' r'"],
    ['OLL 57', "R U R' U' M' U R U' r'"],
  ].map(([name,a])=>({name,m:parseAlg(a)}));

  // Full 21-case PLL bank. M/E/S and whole-cube rotations are expanded by
  // parseAlg so the runtime remains self-contained inside this CFOP module.
  const FULL_PLL=[
    ['Aa', "R' F R' B2 R F' R' B2 R2"],
    ['Ab', "R' B' R U' R D R' U R D' R2 B R"],
    ['E',  "R' U' R' D' R U' R' D R U R' D' R U R' D R2"],
    ['F',  "R' U R U' R2 F' U' F U R F R' F' R2"],
    ['Ga', "R2 U R' U R' U' R U' R2 U' D R' U R D'"],
    ['Gb', "R' U' R U D' R2 U R' U R U' R U' R2 D"],
    ['Gc', "R2 U' R U' R U R' U R2 U D' R U' R' D"],
    ['Gd', "R U R' U' D R2 U' R U' R' U R' U R2 D'"],
    ['H',  "M2 U M2 U2 M2 U M2"],
    ['Ja', "L' U' L F L' U' L U L F' L2 U L"],
    ['Jb', "R U R' F' R U R' U' R' F R2 U' R'"],
    ['Na', "F' R U R' U' R' F R2 F U' R' U' R U F' R'"],
    ['Nb', "R' U R U' R' F' U' F R U R' F R' F' R U' R"],
    ['Ra', "R U' R' U' R U R D R' U' R D' R' U2 R'"],
    ['Rb', "R' U2 R U2 R' F R U R' U' R' F' R2"],
    ['T',  "R U R' U' R' F R2 U' R' U' R U R' F'"],
    ['Ua', "M2 U M U2 M' U M2"],
    ['Ub', "M2 U' M U2 M' U' M2"],
    ['V',  "R' U R' U' R D' R' D R' U D' R2 U' R2 D R2"],
    ['Y',  "F R' F R2 U' R' U' R U R' F' R U R' U' F'"],
    ['Z',  "M' U M2 U M2 U M' U2 M2"],
  ].map(([name,a])=>({name,m:parseAlg(a)}));

  function findOneOLL(state){
    if(ollDone(state)) return {moves:[],name:'skip'};
    let best=null;
    for(const pre of AUF) for(const a of FULL_OLL){
      const seq=optimize(pre.concat(a.m)); const t=E.cloneState(state); apply(t,seq);
      if(ollDone(t) && (!best || seq.length<best.moves.length)) best={moves:seq,name:a.name};
    }
    return best;
  }
  function findOnePLL(state){
    // A PLL can already be solved up to AUF. Check that before forcing one of
    // the 21 algorithms; U/U'/U2-only finishes are common legitimate cases.
    for(const a of AUF){
      const t=E.cloneState(state); apply(t,a);
      if(E.isSolved(t)) return {moves:a.slice(),name:a.length ? 'AUF only' : 'skip'};
    }
    let best=null;
    for(const pre of AUF) for(const a of FULL_PLL) for(const post of AUF){
      const seq=optimize(pre.concat(a.m,post)); const t=E.cloneState(state); apply(t,seq);
      if(E.isSolved(t) && (!best || seq.length<best.moves.length)) best={moves:seq,name:a.name};
    }
    return best;
  }

  function conjugates(entries){
    const out=[]; for(const e of entries) for(const a of AUF){ out.push({name:e.name,m:a.concat(e.m,inverseSeq(a))}); } return out;
  }
  function macroPlan(state0, entries, goal, maxDepth){
    if(goal(state0)) return {moves:[],names:[]};
    const cand=conjugates(entries); let frontier=[{s:E.cloneState(state0),moves:[],names:[]}];
    const ids=state0.cubies.filter(c=>c.pos[1]===1).map(c=>c.id).sort();
    const seen=new Set([sig(state0,ids)]);
    for(let d=1;d<=maxDepth;d++){
      const next=[];
      for(const n of frontier) for(const c of cand){
        const ns=E.cloneState(n.s); apply(ns,c.m); const moves=optimize(n.moves.concat(c.m));
        if(goal(ns)) return {moves,names:n.names.concat(c.name)};
        const k=sig(ns,ids); if(seen.has(k)) continue; seen.add(k); next.push({s:ns,moves,names:n.names.concat(c.name)});
      }
      frontier=next;
    }
    return null;
  }

  function solve(state0){
    const state=E.cloneState(state0), stages=[], debug=[];
    function add(name,moves,detail){ const m=optimize(moves); if(m.length) stages.push({name,moves:m}); if(detail) debug.push(name+' | '+detail+' | '+m.join(' ')); }

    const cross=solveCross(state); add('CFOP — Cross',cross,'direct cross search');
    const crossTargets=crossDefs(state), pairs=pairDefs(state), donePairs=[], remaining=pairs.slice();
    let pairNumber=0;
    while(remaining.length){
      let best=null;
      for(let i=0;i<remaining.length;i++){
        const pair=remaining[i];
        try{
          const test=E.cloneState(state);
          const path=solvePair(test,pair,donePairs,crossTargets);
          if(!best || path.length<best.path.length) best={i,pair,path};
        }catch(_e){}
      }
      if(!best) throw new Error('CFOP F2L could not match any remaining pair to the standard case bank.');
      apply(state,best.path); pairNumber++; donePairs.push(best.pair); remaining.splice(best.i,1);
      add('CFOP — F2L Pair '+pairNumber,best.path,best.pair.slot);
    }
    if(!allSolved(state,crossTargets.concat(...pairs.map(p=>[p.corner,p.edge])))) throw new Error('CFOP F2L integrity check failed.');

    // Full one-look OLL/PLL. Every valid F2L state must match exactly one OLL
    // family (up to AUF), then exactly one PLL family (up to AUF). No stacked
    // two-look fallback is used here; if coverage is incomplete we fail loudly.
    let one=findOneOLL(state);
    if(!one) throw new Error('CFOP full OLL bank did not recognize this last-layer orientation.');
    apply(state,one.moves); add('CFOP — OLL',one.moves,one.name);

    one=findOnePLL(state);
    if(!one) throw new Error('CFOP full PLL bank did not recognize this last-layer permutation.');
    apply(state,one.moves); add('CFOP — PLL',one.moves,one.name);

    if(!E.isSolved(state)){
      let found=null; for(const a of AUF){const t=E.cloneState(state);apply(t,a);if(E.isSolved(t)){found=a;break;}}
      if(found){apply(state,found);add('CFOP — AUF',found,'final alignment');}
    }
    if(!E.isSolved(state)) throw new Error('CFOP completed all stages but cube is not solved.');
    const moves=stages.flatMap(s=>s.moves); return {moves,stages,debug,state};
  }

  return {solve,FULL_OLL,FULL_PLL};
});
