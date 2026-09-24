// 3x3 verifier adapter. Future puzzles get their own verifier module.
const CubeVerifier3x3 = { verify(state) { return E.verifyPieceComposition(state); } };
