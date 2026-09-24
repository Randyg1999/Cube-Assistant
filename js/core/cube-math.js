// ============================================================================
// Shared cube math primitives — pure JS, no DOM/Three.js dependency.
// Kept separate so future NxN engines can reuse the same proven rotations.
// ============================================================================
(function (root, factory) {
  if (typeof module === 'object' && module.exports) module.exports = factory();
  else root.CubeMath = factory();
})(typeof self !== 'undefined' ? self : this, function () {
  const IDENTITY = [[1,0,0],[0,1,0],[0,0,1]];

  function matMulVec(m, v) {
    return [
      m[0][0]*v[0] + m[0][1]*v[1] + m[0][2]*v[2],
      m[1][0]*v[0] + m[1][1]*v[1] + m[1][2]*v[2],
      m[2][0]*v[0] + m[2][1]*v[1] + m[2][2]*v[2],
    ];
  }

  function matMulMat(a, b) {
    const r = [[0,0,0],[0,0,0],[0,0,0]];
    for (let i=0;i<3;i++) for (let j=0;j<3;j++) {
      let s=0;
      for (let k=0;k<3;k++) s += a[i][k]*b[k][j];
      r[i][j]=s;
    }
    return r;
  }

  function axisIndex(axis){ return axis==='x'?0:axis==='y'?1:2; }

  function rotMatrix(axis, deg){
    const d = ((deg % 360) + 360) % 360;
    let c, s;
    if (d===0){c=1;s=0;} else if(d===90){c=0;s=1;} else if(d===180){c=-1;s=0;} else {c=0;s=-1;}
    if (axis==='x') return [[1,0,0],[0,c,-s],[0,s,c]];
    if (axis==='y') return [[c,0,s],[0,1,0],[-s,0,c]];
    return [[c,-s,0],[s,c,0],[0,0,1]];
  }

  function vecKey(v){ return v[0]+','+v[1]+','+v[2]; }

  return { IDENTITY, matMulVec, matMulMat, axisIndex, rotMatrix, vecKey };
});
