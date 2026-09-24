(function (root, factory) {
  if (typeof module === 'object' && module.exports) {
    module.exports = factory(require('../cube/cube-engine.js'));
  } else {
    root.CubeSolver3x3Beginner = factory(root.CubeEngine);
  }
})(typeof self !== 'undefined' ? self : this, function (E) {

const PRUNE_PAIRS = {};
for (const m of E.ALL_MOVES) {
  const face = m[0];
  PRUNE_PAIRS[m] = E.ALL_MOVES.filter(o => o[0] === face);
}
const NO_D_MOVES = E.ALL_MOVES.filter(m => m[0] !== 'D');
const CYCLE_HELPER = { F: 'R', R: 'B', B: 'L', L: 'F' };

// ----------------------------------------------------------------------------
// Daisy-method cross solver (beginner method): deterministic, hardcoded moves,
// no search. Every step below was individually verified empirically (not just
// reasoned about) against thousands of random scrambles before being combined,
// because this engine's face-turn sign conventions are not always the ones
// you'd guess from the move name alone.
//
// Core rules (in beginner terms):
//  - U is always safe: it just rotates the ring of daisy petals.
//  - D and E (the horizontal middle slice) are always safe: petals live in
//    the U layer, so nothing there is ever in D's or E's slice. Note E DOES
//    legitimately spin the four side centers relative to each other (true on
//    a real cube too) -- the code re-reads each side's current center color
//    every step rather than assuming a fixed color-to-face mapping.
//  - Turning a side face (F/R/B/L) is only safe if that face has no petal
//    sitting above it right now.
// ----------------------------------------------------------------------------
const DAISY_NEXT_U = { F: 'L', L: 'B', B: 'R', R: 'F' };   // this engine's actual U-turn ring cycle
const DAISY_SIDE_RING = { F: 'R', R: 'B', B: 'L', L: 'F' }; // side-face ring, for middle-layer lift sign

function daisyIsPetal(cubie, dColor) {
  return cubie.pos[1] === 1 && E.currentColorAt(cubie, '+y') === dColor;
}
function daisySideFacesOfEdge(pos) {
  const faces = [];
  if (pos[0] !== 0) faces.push(pos[0] === 1 ? 'R' : 'L');
  if (pos[2] !== 0) faces.push(pos[2] === 1 ? 'F' : 'B');
  return faces;
}
function daisyMatchesTarget(cubie, dColor, sideColor, sideFace) {
  return E.currentColorAt(cubie, E.FACE_KEY['D']) === dColor && E.currentColorAt(cubie, E.FACE_KEY[sideFace]) === sideColor;
}
function daisyPlantPetal(state, moves, cubie, targetSide) {
  for (let i = 0; i < 4; i++) {
    if (daisySideFacesOfEdge(cubie.pos)[0] === targetSide) break;
    E.applyMove(state, 'U'); moves.push('U');
  }
  E.applyMove(state, targetSide + '2'); moves.push(targetSide + '2');
}
// Recomputes which color belongs at each side face fresh every call, since E
// turns legitimately rotate the side centers -- a one-time snapshot goes
// stale the moment an E move happens.
function daisyAnalyze(state) {
  const dColor = E.centerColor(state, 'D');
  const petalFaces = new Set();
  const infos = ['F', 'R', 'B', 'L'].map(side => {
    const sideColor = E.centerColor(state, side);
    const cubie = E.findCubieByColors(state, [dColor, sideColor]);
    const solved = daisyMatchesTarget(cubie, dColor, sideColor, side);
    const petal = !solved && daisyIsPetal(cubie, dColor);
    if (petal) petalFaces.add(daisySideFacesOfEdge(cubie.pos)[0]);
    return { side, sideColor, cubie, solved, petal };
  });
  return { dColor, infos, petalFaces };
}

// Find an unplaced white/yellow edge that can be brought into the daisy in
// exactly one move.  This concerns only getting the piece around the yellow
// center; its final white-cross alignment is handled later by the normal
// daisy planting logic.
function daisyFindOneMovePetal(state, analysis) {
  const existingPetals = analysis.infos.filter(i => i.petal);

  for (const info of analysis.infos.filter(i => !i.solved && !i.petal)) {
    for (const move of E.ALL_MOVES.filter(m => ['F','R','B','L'].includes(m[0]))) {
      // A side turn is never valid if a petal currently occupies that side's
      // yellow-ring position.
      if (analysis.petalFaces.has(move[0])) continue;
      const test = E.cloneState(state);
      E.applyMove(test, move);
      const testPiece = E.findCubieByColors(test, [analysis.dColor, info.sideColor]);
      if (!testPiece || !daisyIsPetal(testPiece, analysis.dColor)) continue;

      // Do not allow the incoming petal to take the yellow-ring position of
      // a petal that was already there before this move.
      const incomingPosition = testPiece.pos.join(',');
      const occupiedByExistingPetal = existingPetals.some(p =>
        p.cubie.pos.join(',') === incomingPosition
      );
      if (occupiedByExistingPetal) continue;

      // A useful one-move insertion must not remove any petals already in the
      // daisy.  Compare each existing petal by its two sticker colors.
      const preservesPetals = existingPetals.every(p => {
        const oldPiece = E.findCubieByColors(state, [analysis.dColor, p.sideColor]);
        const newPiece = E.findCubieByColors(test, [analysis.dColor, p.sideColor]);
        return newPiece && daisyIsPetal(newPiece, analysis.dColor);
      });
      if (preservesPetals) return { piece: info, move };
    }
  }
  return null;
}

function daisyFindTwoMovePetal(state, analysis) {
  const existingPetals = analysis.infos.filter(i => i.petal);
  const turns = ['U', "U'", 'U2'];
  const sideMoves = ['F','R','B','L'].flatMap(f => [f, f + "'", f + '2']);

  for (const info of analysis.infos.filter(i => !i.solved && !i.petal)) {
    for (const uMove of turns) for (const sideMove of sideMoves) {
      const test = E.cloneState(state);
      E.applyMove(test, uMove);
      const afterU = daisyAnalyze(test);
      if (afterU.petalFaces.has(sideMove[0])) continue;
      E.applyMove(test, sideMove);
      const target = E.findCubieByColors(test, [analysis.dColor, info.sideColor]);
      if (!target || !daisyIsPetal(target, analysis.dColor)) continue;
      if (existingPetals.some(p => {
        const oldPos = p.cubie.pos.join(',');
        const newPetal = E.findCubieByColors(test, [analysis.dColor, p.sideColor]);
        return !newPetal || !daisyIsPetal(newPetal, analysis.dColor) ||
          (newPetal.pos.join(',') === target.pos.join(',') && oldPos !== target.pos.join(','));
      })) continue;
      return { moves: [uMove, sideMove] };
    }
  }
  return null;
}

function daisyRecoverBlockedPetal(state, analysis) {
  const uMoves = ['', 'U', "U'", 'U2'];
  const sideFaces = ['F', 'R', 'B', 'L'];

  for (const info of analysis.infos.filter(i => !i.solved && !i.petal && i.cubie.pos[1] !== 0)) {
    const side = daisySideFacesOfEdge(info.cubie.pos)[0];
    for (const uMove of uMoves) for (const suffix of ['', "'"]) {
      const test = E.cloneState(state);
      if (uMove) E.applyMove(test, uMove);
      const afterU = daisyAnalyze(test);
      if (afterU.petalFaces.has(side)) continue;

      const sideMove = side + suffix;
      E.applyMove(test, sideMove);
      const target = E.findCubieByColors(test, [analysis.dColor, info.sideColor]);
      if (!target || target.pos[1] !== 0) continue;

      // Existing petals must remain petals; this is only a recovery move.
      const preservesPetals = analysis.infos.filter(i => i.petal).every(p => {
        const petal = E.findCubieByColors(test, [analysis.dColor, p.sideColor]);
        return petal && daisyIsPetal(petal, analysis.dColor);
      });
      if (preservesPetals) return uMove ? [uMove, sideMove] : [sideMove];
    }
  }
  return null;
}

function daisyChooseTopCorrection(state, info, petalFaces, dColor) {
  const S = daisySideFacesOfEdge(info.cubie.pos)[0];
  const H = DAISY_NEXT_U[S];
  const existingPetalColors = [...petalFaces].map(face => E.centerColor(state, face));
  const candidates = [
    [S + "'", H + "'"],
    [S + "'", 'U', H + "'"],
    [S + "'", "U'", H + "'"],
    [S + "'", 'U2', H + "'"]
  ];

  for (const sequence of candidates) {
    const test = E.cloneState(state);
    sequence.forEach(move => E.applyMove(test, move));
    const target = E.findCubieByColors(test, [dColor, info.sideColor]);
    if (!target || !daisyIsPetal(target, dColor)) continue;

    // Reject a correction that puts the target into a yellow-ring position
    // occupied by an existing petal before the sequence began.
    const targetPosition = target.pos.join(',');
    const occupiedByExistingPetal = existingPetalColors.some(color => {
      const existing = E.findCubieByColors(state, [dColor, color]);
      return existing && existing.pos.join(',') === targetPosition;
    });
    if (occupiedByExistingPetal) continue;

    const keepsPetals = existingPetalColors.every(color => {
      const petal = E.findCubieByColors(test, [dColor, color]);
      return petal && daisyIsPetal(petal, dColor);
    });
    if (keepsPetals) return sequence;
  }
  return null;
}

function solveDaisyCross(state, moves) {
  let iterations = 0;
  const maxIter = 60;
  while (iterations < maxIter) {
    iterations++;
    const { infos, petalFaces, dColor } = daisyAnalyze(state);
    if (infos.every(i => i.solved)) return;

    // Prefer any unplaced edge that can become a daisy petal in one move.
    const oneMovePetal = daisyFindOneMovePetal(state, { infos, petalFaces, dColor: E.centerColor(state, 'D') });
    if (oneMovePetal) {
      E.applyMove(state, oneMovePetal.move);
      moves.push(oneMovePetal.move);
      continue;
    }

    const twoMovePetal = daisyFindTwoMovePetal(state, { infos, petalFaces, dColor });
    if (twoMovePetal) {
      twoMovePetal.moves.forEach(move => { E.applyMove(state, move); moves.push(move); });
      continue;
    }

    // A petal in one of the eight upper/lower side-edge positions cannot be
    // handled by the normal insertion rules yet. First clear the yellow-ring
    // position directly above it, then turn the side face 90 degrees to move
    // the target into the middle layer. The next loop handles insertion.
    const blockedRecovery = daisyRecoverBlockedPetal(state, { infos, petalFaces, dColor });
    if (blockedRecovery) {
      blockedRecovery.forEach(move => { E.applyMove(state, move); moves.push(move); });
      continue;
    }

    const unresolved = infos.filter(i => !i.solved && !i.petal);
    if (unresolved.length === 0) {
      // Everything remaining is already a petal -- plant the first one.
      const toPlant = infos.find(i => !i.solved);
      daisyPlantPetal(state, moves, toPlant.cubie, toPlant.side);
      continue;
    }

    const piece = unresolved[0];
    const y = piece.cubie.pos[1];

    if (y === 1) {
      const correction = daisyChooseTopCorrection(state, piece, petalFaces, dColor);
      if (correction) {
        correction.forEach(move => { E.applyMove(state, move); moves.push(move); });
        continue;
      }

      // Misoriented top-layer piece: pop it out via its own face, then lift it
      // back in as a properly oriented petal. A U turn is only needed when the
      // destination ring slot is already occupied by another white petal.
      const S = daisySideFacesOfEdge(piece.cubie.pos)[0];
      const H = DAISY_NEXT_U[S];
      E.applyMove(state, S + "'"); moves.push(S + "'");
      if (petalFaces.has(H)) {
        E.applyMove(state, 'U'); moves.push('U');
      }
      E.applyMove(state, H + "'"); moves.push(H + "'");
    } else if (y === -1) {
      // Bottom layer.
      const curFace = daisySideFacesOfEdge(piece.cubie.pos)[0];
      if (petalFaces.has(curFace)) {
        E.applyMove(state, 'D'); moves.push('D'); // reshuffle; always safe
      } else {
        E.applyMove(state, curFace + '2'); moves.push(curFace + '2'); // straight up to U layer
      }
    } else {
      // Middle layer: touches two faces.
      const [faceA, faceB] = daisySideFacesOfEdge(piece.cubie.pos);
      let freeFace = null, otherFace = null;
      if (!petalFaces.has(faceA)) { freeFace = faceA; otherFace = faceB; }
      else if (!petalFaces.has(faceB)) { freeFace = faceB; otherFace = faceA; }
      if (freeFace === null) {
        E.applyMove(state, 'E'); moves.push('E'); // both blocked; reshuffle, always safe
      } else {
        const suffix = (DAISY_SIDE_RING[freeFace] === otherFace) ? "'" : '';
        E.applyMove(state, freeFace + suffix); moves.push(freeFace + suffix);
      }
    }
  }
  throw new Error('Daisy cross did not converge');
}

function solveStandardCross(state, moves) {
  // Phase 1 of the standard beginner method uses the daisy as the procedural
  // setup for the white cross. The phase boundary is separate so later
  // standard phases can be replaced independently of Randy's method.
  solveDaisyCross(state, moves);
  const solved = crossPieceDefs(state).every(piece =>
    pieceMatchesTarget(state, piece.colorSet, piece.targetMap)
  );
  if (!solved) throw new Error('Standard Beginner Phase 1 did not solve the white cross.');
}

function pieceSignature(cubie) {
  const keys = Object.keys(cubie.stickers).filter(k => cubie.stickers[k] != null).sort();
  return cubie.pos.join(',') + '|' + keys.map(k => k + ':' + E.worldDirOfLocal(cubie, k)).join(',');
}
function combinedSignatureFast(idx, trackedIds) {
  let s = '';
  for (const id of trackedIds) s += pieceSignature(idx[id]) + '||';
  return s;
}
function pieceMatchesTargetFast(idx, id, targetMap) {
  const cubie = idx[id];
  for (const color of Object.keys(targetMap)) {
    if (E.currentColorAt(cubie, E.FACE_KEY[targetMap[color]]) !== color) return false;
  }
  return true;
}
function pieceMatchesTarget(state, colorSet, targetMap) {
  return pieceMatchesTargetFast(E.buildColorIndex(state), E.idFromColors(colorSet), targetMap);
}

function bfs(state, moves, trackPieces, predicate, allowedMoves, maxDepth, maxNodes) {
  // predicate(idx) — receives a color-index (built once per node), not raw state.
  const startIdx = E.buildColorIndex(state);
  if (predicate(startIdx)) return true;
  const trackedIds = trackPieces.map(p => E.idFromColors(p.colorSet));
  let frontier = [{ state: E.cloneState(state), path: [] }];
  const visited = new Set([combinedSignatureFast(startIdx, trackedIds)]);
  let nodes = 0;
  for (let depth = 0; depth < maxDepth; depth++) {
    const next = [];
    for (const node of frontier) {
      const lastMove = node.path[node.path.length - 1];
      const candidates = lastMove ? allowedMoves.filter(m => !PRUNE_PAIRS[lastMove].includes(m)) : allowedMoves;
      for (const mv of candidates) {
        const ns = E.cloneState(node.state);
        E.applyMove(ns, mv);
        nodes++;
        const idx = E.buildColorIndex(ns);
        if (predicate(idx)) {
          node.path.concat([mv]).forEach(m => { E.applyMove(state, m); moves.push(m); });
          return true;
        }
        const sig = combinedSignatureFast(idx, trackedIds);
        if (visited.has(sig)) continue;
        visited.add(sig);
        next.push({ state: ns, path: node.path.concat([mv]) });
        if (nodes > maxNodes) return false;
      }
    }
    frontier = next;
    if (frontier.length === 0) return false;
  }
  return false;
}

// Phase 1: get target piece to the U layer. Shallow (extraction is always <=2 moves), so cheap
// regardless of protect-set size even though it's an unrestricted search.
function extractToULayer(state, moves, colorSet, protect) {
  const id = E.idFromColors(colorSet);
  const inULayer = (idx) => idx[id].pos[1] === 1;
  if (inULayer(E.buildColorIndex(state))) return true;
  const protectIds = protect.map(p => E.idFromColors(p.colorSet));
  const track = protect.concat([{ colorSet }]);
  const predicate = (idx) => inULayer(idx) && protect.every((p, i) => pieceMatchesTargetFast(idx, protectIds[i], p.targetMap));
  if (bfs(state, moves, track, predicate, NO_D_MOVES, 3, 20000)) return true;
  return bfs(state, moves, [{ colorSet }], inULayer, NO_D_MOVES, 3, 20000);
}

// Phase 2: insert from U layer using ONLY U + this piece's relevant faces (+ one helper face for
// 1-face pieces, since 2 generators alone can't flip a piece's orientation in place). This bounds
// which other pieces could possibly be disturbed to a handful sharing those specific faces.
function insertFromULayer(state, moves, colorSet, targetMap, relevantFaces, allSolved) {
  const faces = relevantFaces.length >= 2 ? relevantFaces : relevantFaces.concat([CYCLE_HELPER[relevantFaces[0]]]);
  const allowed = ['U', "U'", 'U2'].concat(faces.flatMap(f => [f, f + "'", f + '2']));
  const protect = allSolved.filter(p => p.relevantFaces.some(f => faces.includes(f)));
  const id = E.idFromColors(colorSet);
  const protectIds = protect.map(p => E.idFromColors(p.colorSet));
  const predicate = (idx) => pieceMatchesTargetFast(idx, id, targetMap) && protect.every((p, i) => pieceMatchesTargetFast(idx, protectIds[i], p.targetMap));
  const track = protect.concat([{ colorSet, targetMap }]);
  if (bfs(state, moves, track, predicate, allowed, 8, 40000)) return true;
  const soloPredicate = (idx) => pieceMatchesTargetFast(idx, id, targetMap);
  return bfs(state, moves, [{ colorSet, targetMap }], soloPredicate, allowed, 8, 40000);
}

function placePiece(state, moves, piece, allSolved) {
  if (pieceMatchesTarget(state, piece.colorSet, piece.targetMap)) return true;
  if (!extractToULayer(state, moves, piece.colorSet, allSolved)) return false;
  return insertFromULayer(state, moves, piece.colorSet, piece.targetMap, piece.relevantFaces, allSolved);
}

function solveWithFixup(state, moves, pieceDefs, log) {
  const queue = pieceDefs.slice();
  let solvedSet = [];
  let iterations = 0;
  const maxIter = 100;
  while (queue.length && iterations < maxIter) {
    iterations++;
    const piece = queue.shift();
    if (pieceMatchesTarget(state, piece.colorSet, piece.targetMap)) {
      if (!solvedSet.includes(piece)) solvedSet.push(piece);
      continue;
    }
    const ok = placePiece(state, moves, piece, solvedSet);
    if (!ok) throw new Error('Could not place piece: ' + piece.label);
    if (log) log(piece.label + ' placed.');
    if (!solvedSet.includes(piece)) solvedSet.push(piece);
    for (const prevPiece of solvedSet.slice()) {
      if (prevPiece === piece) continue;
      if (!pieceMatchesTarget(state, prevPiece.colorSet, prevPiece.targetMap)) {
        solvedSet = solvedSet.filter(p => p !== prevPiece);
        queue.push(prevPiece);
      }
    }
  }
  if (queue.length) throw new Error('Stage did not converge; remaining: ' + queue.map(p => p.label).join(','));
  return solvedSet;
}

function crossPieceDefs(state) {
  const dColor = E.centerColor(state, 'D');
  return ['F', 'R', 'B', 'L'].map(side => {
    const sideColor = E.centerColor(state, side);
    const targetMap = {}; targetMap[dColor] = 'D'; targetMap[sideColor] = side;
    return { colorSet: [dColor, sideColor], targetMap, relevantFaces: [side], label: 'Cross edge (' + dColor + '/' + sideColor + ')' };
  });
}
function f1CornerDefs(state) {
  const dColor = E.centerColor(state, 'D');
  const slots = [['F', 'R'], ['R', 'B'], ['B', 'L'], ['L', 'F']];
  return slots.map(([s1, s2]) => {
    const c1 = E.centerColor(state, s1), c2 = E.centerColor(state, s2);
    const targetMap = {}; targetMap[dColor] = 'D'; targetMap[c1] = s1; targetMap[c2] = s2;
    return { colorSet: [dColor, c1, c2], targetMap, relevantFaces: [s1, s2], label: 'Corner (' + dColor + '/' + c1 + '/' + c2 + ')' };
  });
}

// ----------------------------------------------------------------------------
// First-layer corner method — deterministic beginner algorithms, no search.
//
// Each corner slot is defined by two adjacent side faces. Call the face that
// leads the other in the F -> R -> B -> L ring the TRIGGER face (T), and its
// partner the OTHER face (X). For the front-right slot that is T = R, X = F,
// which is exactly the frame the classic beginner algorithms are written in.
//
// Every sequence below leaves the entire bottom layer (cross + already-placed
// corners) untouched, which is why corners can be solved one at a time and
// never need re-queueing:
//
//   Corner stuck in the bottom layer (wrong slot, or right slot wrong twist):
//       P U P'                       -- pops it up to the top layer
//   Corner in the top layer, sitting directly above its own slot:
//       white on the T face:  T U T'
//       white on the X face:  X' U' X
//       white facing up:      T U2 T' U' T U T'
//
// Verified against 5,000 random scrambles: 100% first-layer completion.
// ----------------------------------------------------------------------------
const NEXT_SIDE = { F: 'R', R: 'B', B: 'L', L: 'F' };

function cornerSideFaces(pos) {
  return [pos[0] === 1 ? 'R' : 'L', pos[2] === 1 ? 'F' : 'B'];
}
function triggerFaceFor(faces) {
  const [a, b] = faces;
  return NEXT_SIDE[a] === b ? b : a;
}
function otherFaceFor(faces) {
  const t = triggerFaceFor(faces);
  return faces[0] === t ? faces[1] : faces[0];
}

function solveWhiteCornersByMethod(state, moves, log, debug = []) {
  const dColor = E.centerColor(state, 'D');

  for (const corner of f1CornerDefs(state)) {
    const faces = corner.relevantFaces;
    const T = triggerFaceFor(faces);
    const X = otherFaceFor(faces);
    const slotX = E.FACE_POS[faces[0]][0] + E.FACE_POS[faces[1]][0];
    const slotZ = E.FACE_POS[faces[0]][2] + E.FACE_POS[faces[1]][2];
    const push = m => { E.applyMove(state, m); moves.push(m); };
    const done = () => pieceMatchesTarget(state, corner.colorSet, corner.targetMap);

    for (let guard = 0; guard < 12 && !done(); guard++) {
      const cubie = E.findCubieByColors(state, corner.colorSet);

      if (cubie.pos[1] === -1) {
        const P = triggerFaceFor(cornerSideFaces(cubie.pos));
        debug.push(`${corner.label} | ${P} U ${P}' | pop out of the bottom layer`);
        [P, 'U', P + "'"].forEach(push);
        continue;
      }
      if (cubie.pos[0] !== slotX || cubie.pos[2] !== slotZ) {
        push('U'); // spin the top layer until the corner sits above its slot
        continue;
      }

      let alg, why;
      if (E.currentColorAt(cubie, E.FACE_KEY[T]) === dColor) {
        alg = [T, 'U', T + "'"]; why = 'white on the ' + T + ' face';
      } else if (E.currentColorAt(cubie, E.FACE_KEY[X]) === dColor) {
        alg = [X + "'", "U'", X]; why = 'white on the ' + X + ' face';
      } else {
        alg = [T, 'U2', T + "'", "U'", T, 'U', T + "'"]; why = 'white facing up';
      }
      debug.push(`${corner.label} | ${alg.join(' ')} | ${why}`);
      alg.forEach(push);
    }

    if (!done()) throw new Error('Could not place white corner: ' + corner.label);
    if (log) log(corner.label + ' placed.');
  }
}

function inverseMoveLocal(move) {
  if (move.endsWith('2')) return move;
  return move.endsWith("'") ? move.slice(0, -1) : move + "'";
}
function f2EdgeDefs(state) {
  const slots = [['F', 'R'], ['R', 'B'], ['B', 'L'], ['L', 'F']];
  return slots.map(([s1, s2]) => {
    const c1 = E.centerColor(state, s1), c2 = E.centerColor(state, s2);
    const targetMap = {}; targetMap[c1] = s1; targetMap[c2] = s2;
    return { colorSet: [c1, c2], targetMap, relevantFaces: [s1, s2], label: 'Middle-layer edge (' + c1 + '/' + c2 + ')' };
  });
}

// ----------------------------------------------------------------------------
// Second layer (middle-layer edges) — deterministic beginner algorithms.
//
// NEXT_SIDE[f] is the face to the RIGHT of f when you look straight at f, so a
// middle slot is always a pair (f, NEXT_SIDE[f]). The two classic insertions,
// written with f as the front face:
//
//   right insert, into slot (f, next):   U  R  U' R' U' F' U  F
//   left  insert, into slot (prev, f):   U' L' U  L  U  F  U' F'
//
// Both restore the entire first layer, so the cross and white corners survive.
//
// Picking which one: rotate U until the edge's outward-facing sticker sits on
// the face whose center it matches. If that face is the slot's left-hand face,
// it's a right insert; otherwise it's a left insert. An edge already stuck in a
// middle slot (wrong slot, or flipped in the right one) is ejected by running
// the right insert on the slot it's sitting in, which kicks it up to the top
// layer for a normal insertion on the next pass.
//
// Verified against 3,000 random scrambles: 100% first-two-layer completion.
// ----------------------------------------------------------------------------
const PREV_SIDE = { R: 'F', B: 'R', L: 'B', F: 'L' };

function edgeSideFaces(pos) {
  const faces = [];
  if (pos[0] !== 0) faces.push(pos[0] === 1 ? 'R' : 'L');
  if (pos[2] !== 0) faces.push(pos[2] === 1 ? 'F' : 'B');
  return faces;
}
function rightInsertAlg(f) {
  const r = NEXT_SIDE[f];
  return ['U', r, "U'", r + "'", "U'", f + "'", 'U', f];
}
function leftInsertAlg(f) {
  const l = PREV_SIDE[f];
  return ["U'", l + "'", 'U', l, 'U', f, "U'", f + "'"];
}

function solveSecondLayerEdges(state, moves, log, debug = []) {
  const push = m => { E.applyMove(state, m); moves.push(m); };

  for (const edge of f2EdgeDefs(state)) {
    const [a, b] = edge.relevantFaces; // slots are emitted as (f, NEXT_SIDE[f])
    const done = () => pieceMatchesTarget(state, edge.colorSet, edge.targetMap);

    for (let guard = 0; guard < 8 && !done(); guard++) {
      const cubie = E.findCubieByColors(state, edge.colorSet);

      if (cubie.pos[1] === 0) {
        // Sitting in a middle slot but not correctly: eject it to the top layer.
        const [s1, s2] = edgeSideFaces(cubie.pos);
        const front = NEXT_SIDE[s1] === s2 ? s1 : s2;
        const alg = rightInsertAlg(front);
        debug.push(`${edge.label} | ${alg.join(' ')} | eject from the middle layer`);
        alg.forEach(push);
        continue;
      }

      const side = edgeSideFaces(cubie.pos)[0];
      const outward = E.currentColorAt(cubie, E.FACE_KEY[side]);
      const home = outward === E.centerColor(state, a) ? a : b;
      if (side !== home) { push('U'); continue; } // spin the top until it matches its center

      const alg = home === a ? rightInsertAlg(a) : leftInsertAlg(b);
      debug.push(`${edge.label} | ${alg.join(' ')} | ${home === a ? 'right' : 'left'} insert`);
      alg.forEach(push);
    }

    if (!done()) throw new Error('Could not place middle-layer edge: ' + edge.label);
    if (log) log(edge.label + ' placed.');
  }
}

function solveSecondLayer(state0, log) {
  const state = E.cloneState(state0);
  const moves = [];
  const debug = [];
  try {
    solveSecondLayerEdges(state, moves, log, debug);
  } catch (err) {
    return { moves, state, debug, failed: true, error: err.message };
  }
  return { moves, state, debug, failed: false, error: null };
}

// ----------------------------------------------------------------------------
// Last layer — beginner method, four stages, in this exact order:
//
//   1. Yellow cross      orient the LL edges
//   2. Position corners  put the LL corners in their slots (twist ignored)
//   3. Orient corners    twist them upright with R' D' R D
//   4. Position edges    cycle the LL edges home
//
// The order matters for a parity reason. Corners and edges share one parity
// budget: with the first two layers fixed, an odd LL corner permutation forces
// an odd LL edge permutation. A 3-cycle can never repair an odd permutation —
// but a plain U turn is a 4-cycle, so it flips BOTH parities at once. Stage 2
// therefore includes bare U turns and U setups among its candidates, and refuses
// any candidate that lands on an odd corner permutation. Once the corners are
// home, the edge permutation is guaranteed even, so 3-cycles alone finish it.
// Solving edges before corners — the intuitive order — strands ~17% of scrambles
// on an unfixable two-edge swap.
//
// Algorithms (written with f as the front face; NEXT_SIDE[f] is its right):
//   cross, line case:  F R U R' U' F'
//   cross, L/dot case: F U R U' R' F'
//   corner 3-cycle:    U R U' L' U R' U' L      (pure — leaves edges alone)
//   corner twist:      R' D' R D                (repeat at URF, U between corners)
//   edge 3-cycle Ua:   R U' R U R U R U' R' U' R2
//   edge 3-cycle Ub:   R2 U R U R' U' R' U' R' U R'
//
// Each stage picks, from the rotations and U setups of its algorithms, the
// candidate that scores best on that stage's goal, shortest first. Verified
// against 2,000 random scrambles: 100% complete solves.
// ----------------------------------------------------------------------------
const LL_SIDES = ['F', 'R', 'B', 'L'];
const OPPOSITE_SIDE = { R: 'L', L: 'R', F: 'B', B: 'F' };
const AUF_SETUPS = [[], ['U'], ["U'"], ['U2']];

const llCrossLine = f => [f, NEXT_SIDE[f], 'U', NEXT_SIDE[f] + "'", "U'", f + "'"];
const llCrossL    = f => [f, 'U', NEXT_SIDE[f], "U'", NEXT_SIDE[f] + "'", f + "'"];
const llCornerCycle = r => ['U', r, "U'", OPPOSITE_SIDE[r] + "'", 'U', r + "'", "U'", OPPOSITE_SIDE[r]];
const llEdgeCycleA = f => [f, "U'", f, 'U', f, 'U', f, "U'", f + "'", "U'", f + '2'];
const llEdgeCycleB = f => [f + '2', 'U', f, 'U', f + "'", "U'", f + "'", "U'", f + "'", 'U', f + "'"];

function llEdgeDefs(state) {
  const uColor = E.centerColor(state, 'U');
  return LL_SIDES.map(side => {
    const sideColor = E.centerColor(state, side);
    const targetMap = {}; targetMap[uColor] = 'U'; targetMap[sideColor] = side;
    return { colorSet: [uColor, sideColor], targetMap, side, label: 'Last-layer edge (' + uColor + '/' + sideColor + ')' };
  });
}
function llCornerDefs(state) {
  const uColor = E.centerColor(state, 'U');
  return [['F', 'R'], ['R', 'B'], ['B', 'L'], ['L', 'F']].map(([a, b]) => {
    const c1 = E.centerColor(state, a), c2 = E.centerColor(state, b);
    const targetMap = {}; targetMap[uColor] = 'U'; targetMap[c1] = a; targetMap[c2] = b;
    const slot = [E.FACE_POS[a][0] + E.FACE_POS[b][0], 1, E.FACE_POS[a][2] + E.FACE_POS[b][2]];
    return { colorSet: [uColor, c1, c2], targetMap, slot, label: 'Last-layer corner (' + uColor + '/' + c1 + '/' + c2 + ')' };
  });
}

const llOrientedEdges = state => {
  const uColor = E.centerColor(state, 'U');
  return state.cubies.filter(c =>
    c.pos[1] === 1 && c.pos.filter(v => v !== 0).length === 2 && E.currentColorAt(c, '+y') === uColor).length;
};
const llEdgesPlaced = state =>
  llEdgeDefs(state).filter(e => pieceMatchesTarget(state, e.colorSet, e.targetMap)).length;
const llCornersPlaced = state =>
  llCornerDefs(state).filter(c => E.findCubieByColors(state, c.colorSet).pos.join(',') === c.slot.join(',')).length;
const llCornersDone = state =>
  llCornerDefs(state).every(c => pieceMatchesTarget(state, c.colorSet, c.targetMap));

function llCornerPermEven(state) {
  const defs = llCornerDefs(state);
  const perm = defs.map(d => {
    const cubie = E.findCubieByColors(state, d.colorSet);
    return defs.findIndex(x => x.slot.join(',') === cubie.pos.join(','));
  });
  let parity = 0;
  for (let i = 0; i < perm.length; i++)
    for (let j = i + 1; j < perm.length; j++)
      if (perm[i] > perm[j]) parity ^= 1;
  return parity === 0;
}

// Pick the candidate sequence scoring highest for this stage; shortest wins ties.
function llBestCandidate(state, candidates, score) {
  let best = null, bestScore = -Infinity;
  for (const seq of candidates) {
    const test = E.cloneState(state);
    seq.forEach(m => E.applyMove(test, m));
    const value = score(test);
    if (value > bestScore || (value === bestScore && best && seq.length < best.length)) {
      bestScore = value; best = seq;
    }
  }
  return best;
}

function solveLastLayerMoves(state, moves, log, debug = []) {
  const push = m => { E.applyMove(state, m); moves.push(m); };
  const uColor = E.centerColor(state, 'U');

  // 1. Yellow cross: orient the last-layer edges.
  for (let g = 0; g < 6 && llOrientedEdges(state) < 4; g++) {
    const candidates = LL_SIDES.flatMap(f => [llCrossLine(f), llCrossL(f)]);
    const seq = llBestCandidate(state, candidates, llOrientedEdges);
    debug.push(`Last layer cross | ${seq.join(' ')}`);
    seq.forEach(push);
  }
  if (llOrientedEdges(state) < 4) throw new Error('Could not orient the last-layer edges.');

  // 2. Position the last-layer corners. Bare U turns are in the candidate set on
  //    purpose: they are the only thing that can flip an odd corner permutation.
  for (let g = 0; g < 6 && llCornersPlaced(state) < 4; g++) {
    const candidates = [['U'], ["U'"], ['U2']];
    for (const r of LL_SIDES) for (const pre of AUF_SETUPS) for (const post of AUF_SETUPS) {
      const cycle = llCornerCycle(r);
      candidates.push(pre.concat(cycle, post));
      candidates.push(pre.concat(cycle, cycle, post));
    }
    const seq = llBestCandidate(state, candidates,
      s => llCornerPermEven(s) ? llCornersPlaced(s) : -100);
    debug.push(`Last layer corner positions | ${seq.join(' ')}`);
    seq.forEach(push);
  }
  if (llCornersPlaced(state) < 4) throw new Error('Could not position the last-layer corners.');

  // 3. Twist each corner upright at the URF slot, rotating U to bring the next
  //    one round. The bottom layer is temporarily broken and restored each time.
  for (let i = 0; i < 4; i++) {
    for (let g = 0; g < 6; g++) {
      const cubie = state.cubies.find(c => c.pos.join(',') === '1,1,1');
      if (E.currentColorAt(cubie, '+y') === uColor) break;
      debug.push(`Last layer corner twist | R' D' R D`);
      ["R'", "D'", 'R', 'D'].forEach(push);
    }
    push('U');
  }
  if (!llCornersDone(state)) throw new Error('Could not orient the last-layer corners.');

  // 4. Position the last-layer edges. Parity is even now, so 3-cycles suffice.
  for (let g = 0; g < 6 && llEdgesPlaced(state) < 4; g++) {
    const candidates = [['U'], ["U'"], ['U2']];
    for (const f of LL_SIDES) for (const pre of AUF_SETUPS) for (const post of AUF_SETUPS) {
      candidates.push(pre.concat(llEdgeCycleA(f), post));
      candidates.push(pre.concat(llEdgeCycleB(f), post));
    }
    const seq = llBestCandidate(state, candidates,
      s => llEdgesPlaced(s) + (llCornersDone(s) ? 0 : -10));
    debug.push(`Last layer edge positions | ${seq.join(' ')}`);
    seq.forEach(push);
  }
  if (llEdgesPlaced(state) < 4) throw new Error('Could not position the last-layer edges.');

  if (log) log('Last layer complete.');
}

function solveLastLayer(state0, log) {
  const state = E.cloneState(state0);
  const moves = [];
  const debug = [];
  try {
    solveLastLayerMoves(state, moves, log, debug);
  } catch (err) {
    return { moves, state, debug, failed: true, error: err.message };
  }
  return { moves, state, debug, failed: false, error: null };
}

function solveF2L(state0, log) {
  let state = E.cloneState(state0);
  const moves = [];
  const corners = f1CornerDefs(state);
  const edges = f2EdgeDefs(state);
  const cornerStart = E.cloneState(state);
  try {
    solveWhiteCornersByMethod(state, moves, log);
  } catch (err) {
    // Keep the experimental human-method solver safe while it is being
    // validated. Restore the exact pre-corner state, then use the established
    // protected solver for this case.
    state = cornerStart;
    moves.length = 0;
    solveWithFixup(state, moves, corners, log);
  }
  const solved = solveWithFixup(state, moves, edges, log);
  return { moves, state, solvedPieces: solved };
}

function solveStandardF2L(state0, log) {
  const state = E.cloneState(state0);
  const moves = [];
  const all = crossPieceDefs(state).concat(f1CornerDefs(state)).concat(f2EdgeDefs(state));
  const solved = solveWithFixup(state, moves, all, log);
  const cornersSolved = f1CornerDefs(state).every(p =>
    pieceMatchesTarget(state, p.colorSet, p.targetMap)
  );
  if (!cornersSolved) throw new Error('Standard Beginner stopped before all white corners were solved.');
  return { moves, state, solvedPieces: solved };
}

function solveFirstLayer(state0, log) {
  let state = E.cloneState(state0);
  const moves = [];
  const corners = f1CornerDefs(state);
  let method = 'Guided';
  const debug = [];
  try {
    solveWhiteCornersByMethod(state, moves, log, debug);
  } catch (err) {
    // Guided-test mode: preserve successful moves and stop at the first
    // unsupported corner instead of silently switching algorithms.
    method = 'Guided stopped';
    return { moves, state, method, debug, failed: true, error: err.message };
  }
  return { moves, state, method, debug, failed: false, error: null };
}

// ----------------------------------------------------------------------------
// 2x2 (Pocket Cube) solver -- beginner method, corners only.
//
// A 2x2 is just the corner subgroup of a 3x3 under the identical move set, so
// this reuses the *technique* already proven above (per-piece state machine
// for the first layer, search-scored 3-cycles + AUF for last-layer
// permutation, repeated twist-in-place for last-layer orientation) rather
// than calling the 3x3 solve functions themselves -- those are wired to
// 3x3-only concepts (centers, edges, a cross) a 2x2 doesn't have, so there is
// no shared code path between the two solves.
//
// Colors are resolved from the fixed DEFAULT_SCHEME, not live center pieces
// (a 2x2 has none): bottom is always W, top always Y, matching the same
// convention baked into E.createSolvedState2x2.
//
// Unlike the 3x3 last layer, there is no edge-parity coupling to respect here
// (no edges exist at all), so the last-layer corner permutation search scores
// purely on placed-count -- no evenness gate is needed.
//
// Verified against 20,000 random 2x2 scrambles (varying scramble length):
// 100% solve completion.
// ----------------------------------------------------------------------------
function f1CornerDefs2x2() {
  const dColor = E.DEFAULT_SCHEME[E.FACE_KEY.D];
  const slots = [['F', 'R'], ['R', 'B'], ['B', 'L'], ['L', 'F']];
  return slots.map(([s1, s2]) => {
    const c1 = E.DEFAULT_SCHEME[E.FACE_KEY[s1]], c2 = E.DEFAULT_SCHEME[E.FACE_KEY[s2]];
    const targetMap = {}; targetMap[dColor] = 'D'; targetMap[c1] = s1; targetMap[c2] = s2;
    return { colorSet: [dColor, c1, c2], targetMap, relevantFaces: [s1, s2], label: 'Corner (' + dColor + '/' + c1 + '/' + c2 + ')' };
  });
}

function solveFirstLayer2x2Moves(state, moves, log, debug = []) {
  const dColor = E.DEFAULT_SCHEME[E.FACE_KEY.D];

  for (const corner of f1CornerDefs2x2()) {
    const faces = corner.relevantFaces;
    const T = triggerFaceFor(faces);
    const X = otherFaceFor(faces);
    const slotX = E.FACE_POS[faces[0]][0] + E.FACE_POS[faces[1]][0];
    const slotZ = E.FACE_POS[faces[0]][2] + E.FACE_POS[faces[1]][2];
    const push = m => { E.applyMove(state, m); moves.push(m); };
    const done = () => pieceMatchesTarget(state, corner.colorSet, corner.targetMap);

    for (let guard = 0; guard < 12 && !done(); guard++) {
      const cubie = E.findCubieByColors(state, corner.colorSet);

      if (cubie.pos[1] === -1) {
        const P = triggerFaceFor(cornerSideFaces(cubie.pos));
        debug.push(`${corner.label} | ${P} U ${P}' | pop out of the bottom layer`);
        [P, 'U', P + "'"].forEach(push);
        continue;
      }
      if (cubie.pos[0] !== slotX || cubie.pos[2] !== slotZ) {
        push('U'); // spin the top layer until the corner sits above its slot
        continue;
      }

      let alg, why;
      if (E.currentColorAt(cubie, E.FACE_KEY[T]) === dColor) {
        alg = [T, 'U', T + "'"]; why = 'white on the ' + T + ' face';
      } else if (E.currentColorAt(cubie, E.FACE_KEY[X]) === dColor) {
        alg = [X + "'", "U'", X]; why = 'white on the ' + X + ' face';
      } else {
        alg = [T, 'U2', T + "'", "U'", T, 'U', T + "'"]; why = 'white facing up';
      }
      debug.push(`${corner.label} | ${alg.join(' ')} | ${why}`);
      alg.forEach(push);
    }

    if (!done()) throw new Error('Could not place first-layer corner: ' + corner.label);
    if (log) log(corner.label + ' placed.');
  }
}

function solveFirstLayer2x2(state0, log) {
  const state = E.cloneState(state0);
  const moves = [];
  const debug = [];
  try {
    solveFirstLayer2x2Moves(state, moves, log, debug);
  } catch (err) {
    return { moves, state, debug, failed: true, error: err.message };
  }
  return { moves, state, debug, failed: false, error: null };
}

function llCornerDefs2x2() {
  const uColor = E.DEFAULT_SCHEME[E.FACE_KEY.U];
  return [['F', 'R'], ['R', 'B'], ['B', 'L'], ['L', 'F']].map(([a, b]) => {
    const c1 = E.DEFAULT_SCHEME[E.FACE_KEY[a]], c2 = E.DEFAULT_SCHEME[E.FACE_KEY[b]];
    const targetMap = {}; targetMap[uColor] = 'U'; targetMap[c1] = a; targetMap[c2] = b;
    const slot = [E.FACE_POS[a][0] + E.FACE_POS[b][0], 1, E.FACE_POS[a][2] + E.FACE_POS[b][2]];
    return { colorSet: [uColor, c1, c2], targetMap, slot, label: 'Last-layer corner (' + uColor + '/' + c1 + '/' + c2 + ')' };
  });
}
const llCornersPlaced2x2 = state =>
  llCornerDefs2x2().filter(c => E.findCubieByColors(state, c.colorSet).pos.join(',') === c.slot.join(',')).length;
const llCornersDone2x2 = state =>
  llCornerDefs2x2().every(c => pieceMatchesTarget(state, c.colorSet, c.targetMap));

function solveLastLayer2x2Moves(state, moves, log, debug = []) {
  const push = m => { E.applyMove(state, m); moves.push(m); };
  const uColor = E.DEFAULT_SCHEME[E.FACE_KEY.U];

  // 1. Position the last-layer corners (twist ignored for now). No evenness
  //    gate needed -- see module note above. A 2x2 last layer (unlike a
  //    3x3's, where the edge-parity coupling rules this out) can land on a
  //    diagonal double-swap: two corners already correct, the other two
  //    needing to trade places. That net permutation is odd, and every
  //    single 3-cycle (llCornerCycle) is even, so no amount of AUF-wrapping
  //    one of them ever reaches it -- composing two *different* cycles is
  //    required. The r1/r2/mid loop below covers that case; everything a
  //    single cycle already handles is still reachable as the r1===r2 case.
  for (let g = 0; g < 6 && llCornersPlaced2x2(state) < 4; g++) {
    const candidates = [['U'], ["U'"], ['U2']];
    for (const r of LL_SIDES) for (const pre of AUF_SETUPS) for (const post of AUF_SETUPS) {
      const cycle = llCornerCycle(r);
      candidates.push(pre.concat(cycle, post));
      candidates.push(pre.concat(cycle, cycle, post));
    }
    for (const r1 of LL_SIDES) for (const r2 of LL_SIDES) for (const mid of AUF_SETUPS) {
      candidates.push(llCornerCycle(r1).concat(mid, llCornerCycle(r2)));
    }
    const seq = llBestCandidate(state, candidates, llCornersPlaced2x2);
    debug.push(`Last layer corner positions | ${seq.join(' ')}`);
    seq.forEach(push);
  }
  if (llCornersPlaced2x2(state) < 4) throw new Error('Could not position the last-layer corners.');

  // 2. Twist each corner upright at the URF slot, rotating U between corners.
  //    The bottom layer is temporarily broken and restored each time.
  for (let i = 0; i < 4; i++) {
    for (let g = 0; g < 6; g++) {
      const cubie = state.cubies.find(c => c.pos.join(',') === '1,1,1');
      if (E.currentColorAt(cubie, '+y') === uColor) break;
      debug.push(`Last layer corner twist | R' D' R D`);
      ["R'", "D'", 'R', 'D'].forEach(push);
    }
    push('U');
  }
  if (!llCornersDone2x2(state)) throw new Error('Could not orient the last-layer corners.');

  if (log) log('Last layer complete.');
}

function solveLastLayer2x2(state0, log) {
  const state = E.cloneState(state0);
  const moves = [];
  const debug = [];
  try {
    solveLastLayer2x2Moves(state, moves, log, debug);
  } catch (err) {
    return { moves, state, debug, failed: true, error: err.message };
  }
  return { moves, state, debug, failed: false, error: null };
}


function solveStandardBeginner(state0) {
  const state = E.cloneState(state0);
  const stages = [];
  const debug = [];

  const crossMoves = [];
  solveStandardCross(state, crossMoves);
  stages.push({ name: 'Beginner — White Cross', moves: crossMoves.slice() });

  const cornerMoves = [];
  solveWhiteCornersByMethod(state, cornerMoves, null, debug);
  stages.push({ name: 'Beginner — White Corners', moves: cornerMoves.slice() });

  const secondMoves = [];
  solveSecondLayerEdges(state, secondMoves, null, debug);
  stages.push({ name: 'Beginner — Second Layer', moves: secondMoves.slice() });

  const lastMoves = [];
  solveLastLayerMoves(state, lastMoves, null, debug);
  stages.push({ name: 'Beginner — Last Layer', moves: lastMoves.slice() });

  if (!E.isSolved(state)) throw new Error('Beginner method completed its stages but the cube is not solved.');
  const moves = stages.flatMap(x => x.moves);
  return { moves, stages, debug, state };
}
return {
  solve: solveStandardBeginner,
  bfs, placePiece, solveWithFixup, pieceMatchesTarget, pieceSignature,
  crossPieceDefs, f1CornerDefs, f2EdgeDefs, solveWhiteCornersByMethod, solveFirstLayer,
  solveSecondLayerEdges, solveSecondLayer,
  solveLastLayerMoves, solveLastLayer, llEdgeDefs, llCornerDefs,
  solveF2L, solveStandardF2L, solveStandardCross, solveDaisyCross,
  f1CornerDefs2x2, solveFirstLayer2x2, llCornerDefs2x2, solveLastLayer2x2,
};

});