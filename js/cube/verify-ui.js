// ---------- Verify Cube ----------
// Generalized to accept a target container so the 2x2 sidebar's Verify button can
// reuse the exact same rendering/error-description logic as the 3x3 one.
const COLOR_NAME = { W: 'white', Y: 'yellow', R: 'red', O: 'orange', G: 'green', B: 'blue' };
const verifyResult = document.getElementById('verifyResult');
const verifyResult2x2 = document.getElementById('verifyResult2x2');
const verifyResult4x4 = document.getElementById('verifyResult4x4');

function clearVerifyResult(target = verifyResult) { target.innerHTML = ''; }
function clearVerifyResult2x2() { clearVerifyResult(verifyResult2x2); }
function clearVerifyResult4x4() { clearVerifyResult(verifyResult4x4); }

function swatchRow(colors) {
  const row = document.createElement('span');
  row.className = 'verify-swatch-row';
  colors.forEach(c => {
    const sw = document.createElement('span');
    sw.className = 'verify-swatch';
    sw.style.background = HEX[c];
    row.appendChild(sw);
  });
  return row;
}

function describeError(err) {
  if (err.message) return err.message;
  if (err.type === 'centers' || err.type === 'corner-twist' || err.type === 'edge-flip' || err.type === 'parity' || err.type === 'internal') return err.message;
  const names = (err.colors || []).map(c => COLOR_NAME[c] || c).join('/');
  if (err.type === 'missing') return `Missing ${err.kind}: ${names}`;
  if (err.type === 'duplicate') return `${err.count}\u00d7 duplicate ${err.kind}: ${names} (should be exactly 1)`;
  if (err.type === 'impossible') return `Impossible ${err.kind}: ${names} \u2014 those colors can't be on the same piece on a real cube`;
  return `${err.kind}: ${names}`;
}

function renderVerifyResult(result, target = verifyResult) {
  clearVerifyResult(target);
  if (result.valid) {
    const ok = document.createElement('div');
    ok.className = 'verify-ok';
    ok.textContent = '\u2713 ' + (result.summary || 'Every piece is present exactly once. This is a valid cube.');
    target.appendChild(ok);
    return;
  }
  const wrap = document.createElement('div');
  wrap.className = 'verify-errors';
  result.errors.forEach(err => {
    const item = document.createElement('div');
    item.className = 'verify-err-item';
    const tag = document.createElement('span');
    tag.className = 'tag';
    tag.textContent = err.type;
    item.appendChild(tag);
    if (err.colors) item.appendChild(swatchRow(err.colors));
    const text = document.createElement('span');
    text.textContent = describeError(err);
    item.appendChild(text);
    wrap.appendChild(item);
  });
  target.appendChild(wrap);
}

document.getElementById('verifyBtn').addEventListener('click', () => {
  renderVerifyResult(PUZZLES['3x3'].verifier.verify(cubeState));
});
document.getElementById('verifyBtn2x2').addEventListener('click', () => {
  renderVerifyResult(PUZZLES['2x2'].verifier.verify(cubeState), verifyResult2x2);
});


document.getElementById('verifyBtn4x4')?.addEventListener('click', () => {
  renderVerifyResult(PUZZLES['4x4'].verifier.verify(cubeState), verifyResult4x4);
});
