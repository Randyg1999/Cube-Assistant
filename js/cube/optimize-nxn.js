// ---------- Move-sequence optimizer for wide/inner NxN notation ----------
// js/core/move-utils.js only understands single-letter face notation, so it
// cannot be used on a 4x4 and larger: it has no idea what Rw or 2R mean and
// would cancel moves that act on different layers. This module handles the full
// notation and is the one to use for any cube above 3x3.
//
// Notation understood: an optional layer depth, a face letter, an optional w
// for a wide turn, and an optional ' or 2.
//     R   R'   R2   Rw   Rw'   Rw2   2R   2R'   2R2   3Rw2
// The depth prefix is parsed as a number rather than a literal "2", so 5x5 and
// 6x6 notation (3U, 3Rw) works without change.
//
// Two reductions, both exact:
//
//   1. Same layer, same axis  -> amounts add mod 4. R R' vanishes, R R becomes
//      R2, R2 R2 vanishes.
//
//   2. Same axis, any layers  -> every turn about one axis commutes with every
//      other turn about that axis, whatever layers they touch. So a run of
//      consecutive same-axis moves can be regrouped by layer and summed. That
//      is what recovers waste at the seam between two solver stages, where one
//      stage's tail and the next stage's setup often turn the same axis.
//
// Nothing here reorders across a change of axis, so the result is always
// provably equivalent to the input.

(function (root) {

const MOVE_PATTERN = /^(\d*)([UDRLFB])(w?)(2|')?$/;
const ROTATION_PATTERN = /^([xyz])(2|')?$/;
const AXIS_OF = { U: 'y', D: 'y', R: 'x', L: 'x', F: 'z', B: 'z' };
const AMOUNT_OF = { '': 1, "'": 3, '2': 2 };
const SUFFIX_OF = { 1: '', 2: '2', 3: "'" };

function parseMove(move) {
  const match = MOVE_PATTERN.exec(move);
  if (!match) return null;
  const [, depth, face, wide, suffix] = match;
  return {
    // Layer identity: depth + face + wide. R, Rw and 2R are three different
    // layer sets and must never cancel against each other.
    family: depth + face + wide,
    axis: AXIS_OF[face],
    amount: AMOUNT_OF[suffix || ''],
  };
}

function formatMove(family, amount) {
  return family + SUFFIX_OF[amount];
}

// One pass. Returns null when nothing changed, so the caller can stop.
function optimizePass(moves, stages) {
  const parsed = moves.map(parseMove);
  // An unrecognized token means the caller passed notation this module does not
  // model. Returning the input untouched is safer than guessing at it.
  if (parsed.some(entry => entry === null)) return null;

  const outMoves = [];
  const outStages = [];
  let changed = false;
  let i = 0;

  while (i < moves.length) {
    const axis = parsed[i].axis;
    let end = i;
    while (end < moves.length && parsed[end].axis === axis) end++;

    // Collect the run, summing per layer and remembering where each layer first
    // appeared so the output order stays stable and readable.
    const order = [];
    const totals = new Map();
    const labels = new Map();
    for (let k = i; k < end; k++) {
      const { family, amount } = parsed[k];
      if (!totals.has(family)) {
        order.push(family);
        totals.set(family, 0);
        labels.set(family, stages ? stages[k] : null);
      }
      totals.set(family, (totals.get(family) + amount) % 4);
    }

    for (const family of order) {
      const amount = totals.get(family);
      if (amount === 0) { changed = true; continue; }   // fully cancelled
      outMoves.push(formatMove(family, amount));
      if (stages) outStages.push(labels.get(family));
    }
    if (outMoves.length !== end || order.length !== end - i) changed = true;

    i = end;
  }

  if (outMoves.length !== moves.length) changed = true;
  return changed ? { moves: outMoves, stages: stages ? outStages : null } : null;
}

// Runs passes until stable: removing a run can bring two previously separated
// same-axis runs together, which then cancel further.
//
// Whole-cube rotations are barriers. A rotation relabels every face, so R before
// an x and R after it are different physical layers and must never be merged.
// The sequence is split at each rotation and the segments optimised separately,
// which is safe and still recovers everything worth recovering. Without this the
// unparseable token made the whole pass a no-op, silently disabling optimisation
// for any sequence containing a rotation.
function optimize(moves, stages = null) {
  const outMoves = [];
  const outStages = stages ? [] : null;

  let segMoves = [];
  let segStages = stages ? [] : null;

  const flush = () => {
    if (!segMoves.length) return;
    const done = optimizeSegment(segMoves, segStages);
    outMoves.push(...done.moves);
    if (outStages) outStages.push(...done.stages);
    segMoves = [];
    segStages = stages ? [] : null;
  };

  for (let i = 0; i < moves.length; i++) {
    if (ROTATION_PATTERN.test(moves[i])) {
      flush();
      outMoves.push(moves[i]);
      if (outStages) outStages.push(stages[i]);
      continue;
    }
    segMoves.push(moves[i]);
    if (segStages) segStages.push(stages[i]);
  }
  flush();

  return { moves: outMoves, stages: outStages };
}

function optimizeSegment(moves, stages) {
  let currentMoves = moves.slice();
  let currentStages = stages ? stages.slice() : null;

  for (let guard = 0; guard < 24; guard++) {
    const result = optimizePass(currentMoves, currentStages);
    if (!result) break;
    currentMoves = result.moves;
    currentStages = result.stages;
  }

  return { moves: currentMoves, stages: currentStages };
}

root.NxNOptimizer = { optimize, parseMove, formatMove };

})(typeof self !== 'undefined' ? self : this);
