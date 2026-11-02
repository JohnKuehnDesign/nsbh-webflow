// NSBH nav — scroll and menu behavior for the R2 Nav component (Webflow group R2).
//
// Hosted on GitHub, served to Webflow via jsDelivr, in Site settings → Custom code →
// Footer code:
//   <script src="https://cdn.jsdelivr.net/gh/JohnKuehnDesign/nsbh-webflow@X.Y.Z/src/nav/nav.js" defer></script>
// It replaces the old logo-shrink inline script, which targeted .navbar_logo-link and
// has done nothing since the class became navbar_logo-link 2.
//
// What it does:
//   - The top bar (seal + glass links) is absolute over the hero and scrolls away with
//     it; this script never touches it.
//   - The pill bar is fixed and hidden. Scrolling up once the visitor is past the hero
//     shows it (is-visible); scrolling down, or back up into the hero, hides it. It
//     stays shown while it holds keyboard focus (:focus-visible), so a keyboard user's
//     focus is never hidden; mouse and touch focus don't count.
//   - With Reduce Motion on, the pill fades instead of sliding.
//   - The menu buttons (top bar and pill, tablet and phone) open the full-screen menu
//     (is-open). Escape, the close button, a menu link, or widening the window to
//     desktop closes it. Page scroll is locked and focus stays inside while it's open.
//
// Page hooks (custom attributes inside the Nav component, set in Designer):
//   [data-nav-r2="bar"]    The pill bar. Gets is-visible.
//   [data-nav-r2="open"]   Menu buttons. aria-expanded is kept in sync.
//   [data-nav-r2="menu"]   The menu. Gets is-open.
//   [data-nav-r2="close"]  The menu's close button.
//
// Where the hero ends: the bottom of the first .section_hero-r2 on the page. Pages
// without one use twice the top bar's height.
//
// One Nav per page. On the COMPONENTS page, with two demo instances, only the first
// one is wired.

(function () {
  var bar = document.querySelector('[data-nav-r2="bar"]');
  var menu = document.querySelector('[data-nav-r2="menu"]');
  var openers = Array.prototype.slice.call(document.querySelectorAll('[data-nav-r2="open"]'));
  var closer = menu ? menu.querySelector('[data-nav-r2="close"]') : null;
  var desktop = window.matchMedia('(min-width: 992px)');

  var MIN_SCROLL = 6; // px moved before a direction counts, so tiny jitters don't flicker the bar

  // ---- Pill bar ----------------------------------------------------------------

  var heroEnd = 0;
  var lastY = window.scrollY;
  var ticking = false;

  function measureHeroEnd() {
    var hero = document.querySelector('.section_hero-r2');
    if (hero) {
      heroEnd = hero.getBoundingClientRect().bottom + window.scrollY;
      return;
    }
    var top = document.querySelector('.nav-r2_top');
    heroEnd = (top ? top.offsetHeight : 164) * 2;
  }

  // Keyboard focus only: Chrome also focuses links and buttons on click, and that
  // shouldn't hold the pill open for mouse and touch visitors.
  function hasKeyboardFocus() {
    var el = document.activeElement;
    if (!el || !bar.contains(el)) return false;
    try { return el.matches(':focus-visible'); } catch (e) { return true; }
  }

  function updateBar() {
    ticking = false;
    var y = window.scrollY;
    var moved = y - lastY;
    if (Math.abs(moved) < MIN_SCROLL) return;
    lastY = y;
    if (hasKeyboardFocus()) return;
    bar.classList.toggle('is-visible', moved < 0 && y > heroEnd);
  }

  if (bar) {
    // Reduce Motion: drop the slide, keep the fade. Inline, so the Webflow class keeps
    // its full transition for everyone else.
    if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) {
      bar.style.transitionProperty = 'opacity, visibility';
    }
    measureHeroEnd();
    window.addEventListener('load', measureHeroEnd);
    window.addEventListener('resize', measureHeroEnd);
    window.addEventListener('scroll', function () {
      if (ticking) return;
      ticking = true;
      window.requestAnimationFrame(updateBar);
    }, { passive: true });
  }

  // ---- Menu --------------------------------------------------------------------

  if (!menu || !openers.length) return;

  var returnFocus = null;

  function focusables() {
    return Array.prototype.filter.call(
      menu.querySelectorAll('a[href], button:not([disabled])'),
      function (el) { return el.offsetParent !== null; }
    );
  }

  function setOpen(open) {
    menu.classList.toggle('is-open', open);
    openers.forEach(function (btn) { btn.setAttribute('aria-expanded', String(open)); });
    document.documentElement.style.overflow = open ? 'hidden' : '';
    if (open) {
      returnFocus = document.activeElement;
      (closer || focusables()[0] || menu).focus();
    } else if (returnFocus) {
      returnFocus.focus();
      returnFocus = null;
    }
  }

  function isOpen() {
    return menu.classList.contains('is-open');
  }

  openers.forEach(function (btn) {
    btn.addEventListener('click', function () { setOpen(true); });
  });

  if (closer) closer.addEventListener('click', function () { setOpen(false); });

  // A menu link closes the menu, so a same-page link doesn't leave it covering the page.
  menu.addEventListener('click', function (e) {
    if (e.target.closest('a[href]')) setOpen(false);
  });

  document.addEventListener('keydown', function (e) {
    if (!isOpen()) return;
    if (e.key === 'Escape') {
      setOpen(false);
      return;
    }
    if (e.key !== 'Tab') return;
    var items = focusables();
    if (!items.length) return;
    var first = items[0];
    var last = items[items.length - 1];
    if (e.shiftKey && document.activeElement === first) {
      e.preventDefault();
      last.focus();
    } else if (!e.shiftKey && document.activeElement === last) {
      e.preventDefault();
      first.focus();
    }
  });

  desktop.addEventListener('change', function (e) {
    if (e.matches && isOpen()) setOpen(false);
  });
})();
