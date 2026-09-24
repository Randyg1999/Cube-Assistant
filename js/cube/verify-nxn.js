// ---------- NxN cube verification ----------
// createNxNVerifier(engine) returns a verifier for that cube size, in the shape
// verify-ui.js renders: { valid, summary?, errors: [{type, kind?, colors?, ...}] }.
//
// WHAT IS CHECKED
//   1. Sticker counts       every colour appears exactly N*N times
//   2. Piece census         8 corners, 12*(N-2) edge pieces, 6*(N-2)^2 centres
//   3. Corner colour sets    each of the 8 valid corner triples, once each
//   4. Edge colour sets      each of the 12 adjacent colour pairs, (N-2) times
//   5. Centre distribution   (N-2)^2 centres of each colour
//   6. Corner orientation    total twist is a multiple of 3
//
// WHY THAT SET
// Corners only ever move under outer turns, so they behave exactly as on a 3x3
// and their total twist is conserved mod 3. Corner *permutation* is NOT
// constrained on cubes above 3x3: pieces sharing a colour set (wings, centres)
// are visually interchangeable, so an odd permutation of them can absorb any
// corner parity. That is the same reasoning behind the 4x4 verifier checking
// corner twist and nothing else beyond composition, and it is why OLL and PLL
// parity are legal states to solve rather than invalid input to reject.
//
// LIMITS, STATED PLAINLY
// For even cubes I believe composition plus corner twist is the complete
// reachability condition, but I have not proved it. For ODD cubes it is
// definitely incomplete: a 5x5 also has middle edges that behave like 3x3
// edges, carrying a flip-parity invariant and a permutation-parity tie to the
// corners. Neither is checked here. So this verifier catches every miscount and
// impossible piece, and on an odd cube may still accept a state no sequence of
// turns can produce. It never rejects a legal state.

(function (root) {

function createNxNVerifier(engine) {
  const N = engine.SIZE;
  const PER_FACE = N * N;
  const INNER = N - 2;                 // pieces per edge, and centres per row
  const EDGE_PIECES = 12 * INNER;
  const CENTRE_PIECES = 6 * INNER * INNER;

  // Colour codes are fixed by the engine's default scheme; only their displayed
  // hex changes when a user edits a swatch. So opposites are constant.
  const scheme = engine.DEFAULT_SCHEME;
  const OPPOSITE = {
    [scheme['+x']]: scheme['-x'], [scheme['-x']]: scheme['+x'],
    [scheme['+y']]: scheme['-y'], [scheme['-y']]: scheme['+y'],
    [scheme['+z']]: scheme['-z'], [scheme['-z']]: scheme['+z'],
  };
  const COLORS = Object.keys(OPPOSITE);
  const UP = scheme['+y'];
  const DOWN = scheme['-y'];

  const key = colors => colors.slice().sort().join(',');

  // The 8 corner triples: one colour from each opposite pair.
  const VALID_CORNERS = new Set();
  for (const x of [scheme['+x'], scheme['-x']])
    for (const y of [scheme['+y'], scheme['-y']])
      for (const z of [scheme['+z'], scheme['-z']])
        VALID_CORNERS.add(key([x, y, z]));

  // The 12 adjacent colour pairs: any two colours that are not opposites.
  const VALID_EDGES = new Set();
  for (let i = 0; i < COLORS.length; i++)
    for (let j = i + 1; j < COLORS.length; j++)
      if (OPPOSITE[COLORS[i]] !== COLORS[j]) VALID_EDGES.add(key([COLORS[i], COLORS[j]]));

  // Twist of one corner, in thirds of a turn.
  //
  // A corner's three faces have a fixed cyclic order determined by the sign of
  // the product of its coordinates: (x,y,z) for one handedness, (x,z,y) for the
  // other. Twist is how far the sticker belonging on the U/D face has rotated
  // away from the y position within that cycle.
  function cornerTwist(cubie) {
    const signProduct = Math.sign(cubie.pos[0]) * Math.sign(cubie.pos[1]) * Math.sign(cubie.pos[2]);
    const cycle = signProduct > 0 ? ['x', 'y', 'z'] : ['x', 'z', 'y'];

    for (const localKey of Object.keys(cubie.stickers)) {
      const color = cubie.stickers[localKey];
      if (color !== UP && color !== DOWN) continue;
      const worldKey = engine.worldDirOfLocal(cubie, localKey);
      const axis = worldKey[1];
      return (cycle.indexOf(axis) - cycle.indexOf('y') + 3) % 3;
    }
    return null;   // no U/D colour on this corner — composition will report it
  }

  // Where a piece currently sits, in face terms, so a repair message can point
  // at it. Corners name three faces, edge pieces two, centres one.
  const FACE_NAME = { '+y':'Up', '-y':'Down', '+x':'Right', '-x':'Left', '+z':'Front', '-z':'Back' };
  const MAXC = engine.COORDS[N - 1];
  const MINC = engine.COORDS[0];

  function locationName(cubie) {
    const axes = ['x', 'y', 'z'];
    const faces = [];
    cubie.pos.forEach((value, i) => {
      if (value === MAXC) faces.push(FACE_NAME['+' + axes[i]]);
      else if (value === MINC) faces.push(FACE_NAME['-' + axes[i]]);
    });
    return faces.length ? faces.join('-') : 'inner';
  }

  function colorList(colors) {
    return colors.slice().sort().join('');
  }

  // How many stickers must change to turn one colour multiset into another.
  function repairCost(fromColors, toColors) {
    const pool = toColors.slice();
    let shared = 0;
    for (const color of fromColors) {
      const at = pool.indexOf(color);
      if (at >= 0) { pool.splice(at, 1); shared++; }
    }
    return fromColors.length - shared;
  }

  // Pair every surplus piece with a missing one so the total number of sticker
  // changes is as small as possible. Brute force: the cap below keeps the
  // permutation count trivial, and beyond that a repair list stops being
  // clearer than the raw errors anyway.
  const REPAIR_CAP = 6;

  function bestPairing(surplus, deficit) {
    const order = deficit.map((_, i) => i);
    let best = null;
    let bestCost = Infinity;

    const permute = (arr, k = 0) => {
      if (k === arr.length) {
        let cost = 0;
        for (let i = 0; i < arr.length; i++) {
          cost += repairCost(surplus[i].colors, deficit[arr[i]].colors);
        }
        if (cost < bestCost) { bestCost = cost; best = arr.slice(); }
        return;
      }
      for (let i = k; i < arr.length; i++) {
        [arr[k], arr[i]] = [arr[i], arr[k]];
        permute(arr, k + 1);
        [arr[k], arr[i]] = [arr[i], arr[k]];
      }
    };
    permute(order);
    return best;
  }

  // Collects, per piece kind, what the cube has too much of and too little of.
  function census(pieces, validKeys, expectedEach, kindName) {
    const byKey = new Map();
    const surplus = [];
    for (const c of pieces) {
      const colors = engine.cubieColorSet(c);
      const k = key(colors);
      if (!validKeys.has(k)) { surplus.push({ cubie: c, colors, kind: kindName }); continue; }
      const list = byKey.get(k) || [];
      list.push({ cubie: c, colors, kind: kindName });
      byKey.set(k, list);
    }
    const deficit = [];
    for (const k of validKeys) {
      const have = byKey.get(k) || [];
      // Extra copies beyond what the cube should have are surplus too.
      for (let i = expectedEach; i < have.length; i++) surplus.push(have[i]);
      for (let i = have.length; i < expectedEach; i++) {
        deficit.push({ colors: k.split(','), kind: kindName });
      }
    }
    return { surplus, deficit };
  }

  function verify(state) {
    const errors = [];

    // ---- sticker counts ----
    // Kept separate from the repair logic below: a count being wrong is a
    // symptom, and the repair messages explain the cause. These are only
    // reported when no clean repair could be worked out.
    const countErrors = [];
    const counts = engine.colorCounts(state);
    for (const color of COLORS) {
      const n = counts[color] || 0;
      if (n !== PER_FACE) {
        countErrors.push({
          type: n < PER_FACE ? 'missing' : 'duplicate',
          kind: 'sticker count',
          colors: [color],
          message: `${n} ${color} stickers \u2014 a ${N}x${N} needs exactly ${PER_FACE}`,
        });
      }
    }
    for (const color of Object.keys(counts)) {
      if (!OPPOSITE[color]) {
        errors.push({ type: 'impossible', kind: 'colour', colors: [color], message: `Unknown colour code: ${color}` });
      }
    }

    // ---- piece census ----
    const corners = [], edges = [], centres = [];
    for (const c of state.cubies) {
      const set = engine.cubieColorSet(c);
      if (set.length === 3) corners.push(c);
      else if (set.length === 2) edges.push(c);
      else if (set.length === 1) centres.push(c);
    }
    if (corners.length !== 8) {
      errors.push({ type: 'internal', message: `${corners.length} three-colour pieces \u2014 a cube has exactly 8 corners.` });
    }
    if (edges.length !== EDGE_PIECES) {
      errors.push({ type: 'internal', message: `${edges.length} two-colour pieces \u2014 a ${N}x${N} has ${EDGE_PIECES}.` });
    }
    if (centres.length !== CENTRE_PIECES) {
      errors.push({ type: 'internal', message: `${centres.length} single-colour pieces \u2014 a ${N}x${N} has ${CENTRE_PIECES}.` });
    }

    // ---- what is wrong, per piece kind ----
    const VALID_CENTRES = new Set(COLORS.map(c => key([c])));
    const cornerCensus = census(corners, VALID_CORNERS, 1, 'corner');
    const edgeCensus   = census(edges,   VALID_EDGES,   INNER, 'edge piece');
    const centreCensus = census(centres, VALID_CENTRES, INNER * INNER, 'centre');

    const surplus = [...cornerCensus.surplus, ...edgeCensus.surplus, ...centreCensus.surplus];
    const deficit = [...cornerCensus.deficit, ...edgeCensus.deficit, ...centreCensus.deficit];

    // Repairs are only meaningful when every surplus piece can be matched to a
    // missing one of the same kind. Otherwise the cube is wrong in a way a
    // sticker swap cannot describe, and the raw errors are more honest.
    const sameKindCounts = ['corner', 'edge piece', 'centre'].every(kind =>
      surplus.filter(s => s.kind === kind).length === deficit.filter(d => d.kind === kind).length);

    if (surplus.length && sameKindCounts && surplus.length <= REPAIR_CAP) {
      // Pair within each kind so a corner is never matched to a centre.
      for (const kind of ['corner', 'edge piece', 'centre']) {
        const from = surplus.filter(s => s.kind === kind);
        const to = deficit.filter(d => d.kind === kind);
        if (!from.length) continue;
        const pairing = bestPairing(from, to);
        pairing.forEach((toIndex, i) => {
          const source = from[i];
          const target = to[toIndex];
          errors.push({
            type: 'fix',
            kind,
            colors: target.colors,
            message: `Change the ${colorList(source.colors)} ${kind} at ${locationName(source.cubie)} to ${colorList(target.colors)}.`,
          });
        });
      }
      if (surplus.length > 1) {
        errors.push({
          type: 'note',
          message: 'More than one piece is wrong, so these pairings are one way to fix it rather than the only way.',
        });
      }
    } else if (surplus.length || deficit.length) {
      // Fall back to describing each problem on its own.
      errors.push(...countErrors);
      for (const s of surplus) {
        errors.push({ type: 'impossible', kind: s.kind, colors: s.colors });
      }
      for (const d of deficit) {
        errors.push({ type: 'missing', kind: d.kind, colors: d.colors });
      }
    }

    // ---- corner orientation ----
    // Only meaningful once the corners themselves are sound; twist of a piece
    // with the wrong colours is not a number worth reporting.
    if (!errors.some(e => e.kind === 'corner' || e.type === 'internal')) {
      let total = 0;
      let readable = true;
      for (const c of corners) {
        const twist = cornerTwist(c);
        if (twist === null) { readable = false; break; }
        total += twist;
      }
      if (readable && total % 3 !== 0) {
        errors.push({
          type: 'corner-twist',
          message: `Corner twist totals ${total}, which is not a multiple of 3. At least one corner is rotated in place \u2014 no sequence of turns can produce this.`,
        });
      }
    }

    if (errors.length) return { valid: false, errors };
    return {
      valid: true,
      errors: [],
      summary: `Valid ${N}x${N}: 8 corners, ${EDGE_PIECES} edge pieces and ${CENTRE_PIECES} centres all present, and corner twist is consistent.`,
    };
  }

  return { verify };
}

root.createNxNVerifier = createNxNVerifier;

})(typeof self !== 'undefined' ? self : this);
