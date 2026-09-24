// 2x2 verifier adapter. Kept puzzle-specific even though the proven checks live in CubeEngine.
const CubeVerifier2x2 = { verify(state) { return E.verifyPieceComposition2x2(state); } };
