// ============================================================================
// Identity-tracking centre model for any NxN cube.
//
// Supersedes centres-model-nxn.js, which tracked only COLOUR per slot. Colour
// supports counting ("how many are right"), and counting is what made four
// solver attempts stall: near the end of a face, the correct next move scores
// zero, because the slice that brings your piece in carries a good piece out.
//
// This model tracks IDENTITY — "which slot did the piece now at i start in" —
// which supports targeting a specific piece into a specific slot. That lets a
// solver lock individual slots and require only that locked slots stay correct,
// so a commutator passing through a state that looks no better is accepted.
//
// It also models the three centre ORBITS explicitly. On a 5x5 the fixed
// middles, the edge centres and the corner centres can never interchange; a
// solver that ignores this will try to route a corner centre into an edge slot.
//
// Validated: 200 random 25-move sequences, zero colour or orbit mismatches
// against full state application.
//
// Exposes: window.buildCentreIdentityModel(engine) ->
//   { slots, n, faceOfSlot, slotsOfFace, orbitOfSlot, colourOfSlot,
//     perms, apply, solvedState, stateFrom }
//
// state[i] = the home slot index of the piece currently occupying slot i.
// Slot i is correct when colourOfSlot[state[i]] === colourOfSlot[i].
// ============================================================================
(function (root, factory) {
  if (typeof module === 'object' && module.exports) module.exports = factory();
  else root.buildCentreIdentityModel = factory();
})(typeof self !== 'undefined' ? self : this, function () {

  return function buildCentreIdentityModel(E) {
    const N = E.SIZE;
    const solved = E.createSolvedState();

    const slots = [];
    for (const c of solved.cubies) {
      const keys = Object.keys(c.stickers).filter(k => c.stickers[k] != null);
      if (keys.length === 1) slots.push({ pos: c.pos.slice(), key: keys[0] });
    }
    const n = slots.length;

    const faceOfSlot = slots.map(s => E.FACES.find(f => E.FACE_KEY[f] === s.key));
    const slotsOfFace = {};
    for (const f of E.FACES) slotsOfFace[f] = slots.map((_, i) => i).filter(i => faceOfSlot[i] === f);

    const colourOfSlot = slots.map(s => E.currentColorAt(E.cubieAt(solved, s.pos), s.key));

    // Orbit key: the two in-face distances from the face's middle, sorted.
    // '0,0' fixed middle, '0,1' edge centre, '1,1' corner centre (5x5).
    const MAXC = E.COORDS[N - 1];
    const orbitOfSlot = slots.map(s => {
      const inFace = [0, 1, 2]
        .filter(ax => Math.abs(s.pos[ax]) !== MAXC)
        .map(ax => Math.abs(s.pos[ax]))
        .sort((a, b) => a - b);
      return inFace.join(',');
    });

    // perms[move][i] = index of the slot whose piece ends up at slot i.
    const perms = {};
    for (const move of Object.keys(E.MOVES)) {
      const st = E.cloneState(solved);
      st.cubies.forEach((c, i) => { c.__t = i; });
      const before = slots.map(s => E.cubieAt(st, s.pos).__t);
      E.applyMove(st, move);
      const p = new Array(n);
      for (let i = 0; i < n; i++) p[i] = before.indexOf(E.cubieAt(st, slots[i].pos).__t);
      perms[move] = p;
    }

    const solvedState = () => slots.map((_, i) => i);

    function apply(st, move) {
      const p = perms[move];
      const out = new Array(n);
      for (let i = 0; i < n; i++) out[i] = st[p[i]];
      return out;
    }

    // Map a live cube onto home slots. Pieces sharing a colour AND an orbit are
    // interchangeable, so assignment within each group is arbitrary.
    function stateFrom(cubeState) {
      const pool = {};
      slots.forEach((s, i) => {
        const k = colourOfSlot[i] + '|' + orbitOfSlot[i];
        (pool[k] || (pool[k] = [])).push(i);
      });
      const taken = {};
      for (const k in pool) taken[k] = pool[k].slice();
      return slots.map((s, i) => {
        const colour = E.currentColorAt(E.cubieAt(cubeState, s.pos), s.key);
        const k = colour + '|' + orbitOfSlot[i];
        const list = taken[k];
        if (!list || !list.length) throw new Error('No home slot available for ' + k);
        return list.shift();
      });
    }

    return { slots, n, faceOfSlot, slotsOfFace, orbitOfSlot, colourOfSlot,
             perms, apply, solvedState, stateFrom };
  };
});
