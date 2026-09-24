// 5x5 verifier — the shared NxN checks bound to this cube's engine.
//
// Note the limit documented in js/cube/verify-nxn.js: on an odd cube this
// checks composition and corner twist, but not the middle-edge flip parity or
// the corner/edge permutation parity tie that a 5x5 also carries. It will
// catch every miscount and impossible piece, and will never reject a legal
// state, but it can still accept one that is unreachable. Those two invariants
// belong here when the 5x5 solver lands.
window.CubeVerifier5x5 = createNxNVerifier(window.FiveByFiveEngine);
