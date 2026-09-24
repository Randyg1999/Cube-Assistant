// ---------- Viewport tools ----------
// Buttons that sit on the 3D view in the top-right tool column, under the
// 2D View. The layout (stacking, shifting when the net expands) is pure CSS in
// #viewportTools; this file only wires behavior.
//
// None of these buttons carries its own logic. Each one presses the active
// puzzle's matching sidebar button, so it behaves exactly like that button on
// every puzzle — including the Pyraminx and Megaminx, whose handlers have
// their own UI handling — and needs no change when a puzzle's handler does.
// Each also mirrors its sidebar button's disabled state, so it greys out
// whenever the sidebar one does (for example while an algorithm loop plays).
//
// Adding another tool: add its button to #viewportTools in the HTML and one
// entry to VIEWPORT_TOOLS below.
(function () {
  const VIEWPORT_TOOLS = [
    {
      buttonId: 'viewportScrambleBtn',
      // Key in window.SidebarElements for the generated sidebars (2x2-6x6).
      generatedKey: 'scrambleBtn',
      // Ids in the hand-written sidebars.
      handWritten: { pyraminx: 'scrambleBtnPyraminx', megaminx: 'scrambleBtnMegaminx' },
    },
    {
      buttonId: 'viewportResetBtn',
      generatedKey: 'resetBtn',
      handWritten: { pyraminx: 'resetBtnPyraminx', megaminx: 'resetBtnMegaminx' },
    },
  ];

  function sidebarButton(tool, type = puzzleType) {
    const generated = window.SidebarElements?.[type]?.[tool.generatedKey];
    if (generated) return generated;
    const id = tool.handWritten[type];
    return id ? document.getElementById(id) : null;
  }

  const wired = [];
  for (const tool of VIEWPORT_TOOLS) {
    const btn = document.getElementById(tool.buttonId);
    if (!btn) continue;

    const sync = () => {
      const target = sidebarButton(tool);
      btn.hidden = !target;               // a puzzle without this action shows nothing
      btn.disabled = !target || target.disabled;
    };

    btn.addEventListener('click', () => {
      const target = sidebarButton(tool);
      if (target && !target.disabled) target.click();
    });

    // Follow the disabled state of every puzzle's matching sidebar button.
    const watched = [
      ...Object.values(window.SidebarElements || {}).map(els => els[tool.generatedKey]),
      ...Object.values(tool.handWritten).map(id => document.getElementById(id)),
    ].filter(Boolean);
    const observer = new MutationObserver(sync);
    for (const b of watched) observer.observe(b, { attributes: true, attributeFilter: ['disabled'] });

    wired.push(sync);
  }

  // Re-check on puzzle switches. This script loads after puzzle-switching.js,
  // so its change listener runs after the switch has happened.
  const syncAll = () => wired.forEach(sync => sync());
  cubeTypeSelect.addEventListener('change', syncAll);
  syncAll();
})();
