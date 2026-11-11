// NSBH seasonal guides — open/close behavior for the R2 Seasonal Guides component
// (Webflow group R2: Seasonal Guides + Seasonal Panel).
//
// Hosted on GitHub, served to Webflow via jsDelivr. It is loaded by the hidden embed
// inside the Seasonal Guides component, so every page with that section gets it:
//   <script src="https://cdn.jsdelivr.net/gh/JohnKuehnDesign/nsbh-webflow@X.Y.Z/src/seasonal/seasonal.js" defer></script>
// Safe to load more than once (each section is wired once).
//
// What it does:
//   - Nothing is open when the page loads. When the section scrolls into view, the
//     current season's panel opens (is-open): the panel whose data-season matches the
//     section's data-current, case-insensitive ("Fall" matches "fall").
//   - Desktop (992px and up): hovering a panel, or tabbing into one, opens it instead.
//     Moving the pointer out of the row goes back to the current season.
//   - Tablet and phone: panels stack. Tapping a closed Live panel, or its chevron,
//     opens it (and closes the others); the chevron closes it. aria-expanded follows.
//   - The open, closed and stacked styles live in the component's style embed; this
//     script only moves is-open.
//
// Page hooks (custom attributes inside the components, set in Webflow):
//   [data-seasonal]         The section. data-current = the season to open on scroll-in.
//   [data-seasonal-panel]   Each panel. data-season = its season (bound to Season).
//   [data-seasonal-toggle]  The chevron button inside a Live panel (tablet and phone).

(function () {
  var sections = document.querySelectorAll('[data-seasonal]');
  var stacked = window.matchMedia('(max-width: 991px)');

  Array.prototype.forEach.call(sections, function (section) {
    if (section.hasAttribute('data-seasonal-ready')) return;
    section.setAttribute('data-seasonal-ready', '');

    var panels = Array.prototype.slice.call(section.querySelectorAll('[data-seasonal-panel]'));
    if (!panels.length) return;

    var wanted = (section.getAttribute('data-current') || '').trim().toLowerCase();
    var current = null;
    panels.forEach(function (panel) {
      if ((panel.getAttribute('data-season') || '').trim().toLowerCase() === wanted) current = panel;
    });

    function open(target) {
      panels.forEach(function (panel) {
        var on = panel === target;
        panel.classList.toggle('is-open', on);
        var toggle = panel.querySelector('[data-seasonal-toggle]');
        if (toggle) toggle.setAttribute('aria-expanded', on ? 'true' : 'false');
      });
    }

    // Open the current season once the panels are mostly on screen.
    var row = panels[0].parentElement;
    if ('IntersectionObserver' in window) {
      var seen = new IntersectionObserver(function (entries) {
        if (!entries.some(function (e) { return e.isIntersecting; })) return;
        seen.disconnect();
        if (!section.querySelector('[data-seasonal-panel].is-open')) open(current);
      }, { threshold: 0.35 });
      seen.observe(row);
    } else {
      open(current);
    }

    panels.forEach(function (panel) {
      panel.addEventListener('mouseenter', function () {
        if (!stacked.matches) open(panel);
      });
      panel.addEventListener('focusin', function () {
        if (!stacked.matches) open(panel);
      });

      var toggle = panel.querySelector('[data-seasonal-toggle]');
      if (toggle) {
        toggle.addEventListener('click', function () {
          open(panel.classList.contains('is-open') ? null : panel);
        });

        // Tablet and phone: tapping anywhere on a closed Live panel opens it too. An
        // open panel only closes from its chevron, so a stray tap while reading
        // doesn't collapse it. Coming Soon panels hide their chevron and stay put.
        panel.addEventListener('click', function (e) {
          if (!stacked.matches || panel.classList.contains('is-open')) return;
          if (toggle.offsetParent === null || e.target.closest('a, button')) return;
          open(panel);
        });
      }
    });

    row.addEventListener('mouseleave', function () {
      if (!stacked.matches) open(current);
    });
  });
})();
