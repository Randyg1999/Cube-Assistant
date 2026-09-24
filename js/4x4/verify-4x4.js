// 4x4 verifier adapter. The engine checks sticker counts, physical piece
// composition, legal center/wing color families, and the corner-twist invariant.
const CubeVerifier4x4 = { verify(state) { return FourByFourEngine.verifyState(state); } };
