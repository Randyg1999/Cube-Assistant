// ---------- Shared move-notation helpers ----------
// Notation algebra only: cancelling redundant turns and inverting a move.
// These contain no solving logic and belong to no method — they are the same
// arithmetic on move names whichever solver produced the list.
//
// Deliberately shared rather than copied into each method: duplicating move
// algebra invites two copies drifting apart, and a bug here is a notation bug,
// not a method bug. Solving logic is never allowed in this file.
//
// Scope: single-letter face notation with an optional ' or 2 suffix
// (3x3 and 2x2). The 4x4's wide and inner-slice notation (Rw, 2R) is NOT
// handled here and must not be passed in.

function optimizeMoves(moves) {
  const stack = [];
  const amounts = { '': 1, "'": 3, '2': 2 };
  const suffixes = ['', "'", '2'];

  for (const move of moves) {
    const face = move[0];
    const suffix = move.slice(1);
    const amount = amounts[suffix];
    const previous = stack[stack.length - 1];

    if (previous && previous[0] === face) {
      const combined = (amounts[previous.slice(1)] + amount) % 4;
      stack.pop();
      if (combined !== 0) stack.push(face + suffixes[combined === 3 ? 1 : combined === 2 ? 2 : 0]);
    } else {
      stack.push(move);
    }
  }
  return stack;
}

function inverseMove(moveName) {
  if (moveName.endsWith("2")) return moveName;
  return moveName.endsWith("'") ? moveName.slice(0, -1) : moveName + "'";
}
