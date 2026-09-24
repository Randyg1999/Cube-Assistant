// ---------- Collapsible sidebar sections ----------
// Turns every .section in every sidebar into a collapsible card: the
// .section-title becomes a clickable header with a chevron, and everything else
// in the section moves into a body that hides when collapsed.
//
// Deliberately structural rather than per-sidebar. It finds sections by class,
// so it works for all five sidebars today and for any cube added later without
// a line of new code.
//
// Element ids are untouched. Children are moved into a wrapper div, not
// replaced or renamed, so every getElementById in the app still resolves.
//
// Add data-collapsed="true" to a section in the markup to have it start closed.

(function () {
  // Collapse state is keyed by the section's heading text so it survives the
  // sidebar swaps that happen on every puzzle switch. Kept in memory only:
  // localStorage is unreliable under file:// and this is not worth persisting.
  const collapseState = new Map();

  function enhanceSection(section) {
    if (section.dataset.collapsibleReady === '1') return;

    const title = section.querySelector(':scope > .section-title');
    if (!title) return; // nothing to use as a header — leave the section alone

    const label = title.textContent.trim();

    // Pull the title out before moving anything, or it ends up inside the body.
    title.remove();

    const header = document.createElement('button');
    header.type = 'button';
    header.className = 'section-header';

    const chevron = document.createElement('span');
    chevron.className = 'section-chevron';
    chevron.textContent = '\u25be';
    chevron.setAttribute('aria-hidden', 'true');

    header.append(title, chevron);

    const body = document.createElement('div');
    body.className = 'section-body';
    while (section.firstChild) body.appendChild(section.firstChild);

    section.append(header, body);

    const startCollapsed = collapseState.has(label)
      ? collapseState.get(label)
      : section.dataset.collapsed === 'true';

    function apply(collapsed) {
      section.classList.toggle('collapsed', collapsed);
      header.setAttribute('aria-expanded', String(!collapsed));
      collapseState.set(label, collapsed);
    }

    apply(startCollapsed);
    header.addEventListener('click', () => apply(!section.classList.contains('collapsed')));

    section.dataset.collapsibleReady = '1';
  }

  function enhanceAll() {
    document.querySelectorAll('.sidebar .section').forEach(enhanceSection);
  }

  enhanceAll();

  // Exposed so a future generated sidebar can re-run this after building itself.
  window.enhanceSidebarSections = enhanceAll;
})();
