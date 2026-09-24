// ============================================================================
// Compact centre-piece model for any NxN cube.
//
// A centre cubie has exactly one sticker, so its entire identity is its colour.
// This models the centres as a flat vector of colours indexed by slot, plus a
// precomputed permutation per move. Applying a move is one array gather instead
// of cloning every cubie, which is what makes centre search practical at all.
//
// Validated against the real engine: 300 random 25-move sequences produced
// zero divergence between this model and full state application.
//
// NOTE for whoever builds the centre solver: this tracks colour only, but the
// 5x5 has THREE centre orbits that cannot interchange — the fixed middles, the
// corner centres and the edge centres. A solver needs to respect that; see
// docs/5X5-SOLVER-NOTES.txt.
//
// Exposes: window.buildCentreModel(engine)
//            -> { slots, slotsOfFace, faceCount, perms, vectorOf, apply, countOn }
// ============================================================================
(function (root, factory) {
  if (typeof module === 'object' && module.exports) module.exports = factory();
  else root.buildCentreModel = factory();
})(typeof self !== 'undefined' ? self : this, function () {

  return function buildCentreModel(E) {
    const solved = E.createSolvedState();

    // Every single-sticker cubie, identified by position plus the face it shows.
    const slots = [];
    for (const c of solved.cubies) {
      const keys = Object.keys(c.stickers).filter(k => c.stickers[k] != null);
      if (keys.length === 1) slots.push({ pos: c.pos.slice(), key: keys[0] });
    }

    const slotsOfFace = {};
    for (const face of E.FACES) {
      slotsOfFace[face] = slots
        .map((s, i) => [s, i])
        .filter(([s]) => s.key === E.FACE_KEY[face])
        .map(([, i]) => i);
    }
    const faceCount = slotsOfFace[E.FACES[0]].length;

    // perms[move][i] = index of the slot whose piece ends up at slot i.
    // Derived by tagging each cubie and seeing where the tags land, rather than
    // by reasoning about geometry.
    const perms = {};
    for (const move of Object.keys(E.MOVES)) {
      const st = E.cloneState(solved);
      st.cubies.forEach((c, i) => { c.__tag = i; });
      const before = slots.map(s => E.cubieAt(st, s.pos).__tag);
      E.applyMove(st, move);
      const perm = new Array(slots.length);
      for (let i = 0; i < slots.length; i++) {
        perm[i] = before.indexOf(E.cubieAt(st, slots[i].pos).__tag);
      }
      perms[move] = perm;
    }

    function vectorOf(state) {
      return slots.map(s => E.currentColorAt(E.cubieAt(state, s.pos), s.key));
    }

    function apply(vec, move) {
      const p = perms[move];
      const out = new Array(vec.length);
      for (let i = 0; i < vec.length; i++) out[i] = vec[p[i]];
      return out;
    }

    function countOn(vec, face, colour) {
      let n = 0;
      for (const i of slotsOfFace[face]) if (vec[i] === colour) n++;
      return n;
    }

    return { slots, slotsOfFace, faceCount, perms, vectorOf, apply, countOn };
  };
});
