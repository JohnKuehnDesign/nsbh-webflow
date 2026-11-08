// NSBH guide menu — the floating section menu on the seasonal guides, tablet and phone.
// Figma: "Desktop + phone" 9657:1285 (Phone · closed / Phone · open).
//
// Hosted on GitHub, served to Webflow via jsDelivr. Add to each guide page's
// Page settings → Before </body> (next to shop-card.js):
//   <script defer src="https://cdn.jsdelivr.net/gh/JohnKuehnDesign/nsbh-webflow@X.Y.Z/src/guide-menu/guide-menu.js"></script>
// It loads guide-menu.css from the same folder and version by itself. Safe to load
// twice (the second copy does nothing).
//
// What it does (991px and below; nothing on desktop):
//   - Builds a fixed dropdown from the page's "In this guide" contents nav: one row per
//     link (number, label, arrow), in the same order, pointing at the same anchors.
//   - Hidden until the first section reaches the top of the screen; hidden again once
//     the last section has scrolled past. In between, the closed bar shows the section
//     the reader is in ("03 Orchards and Farms") with a chevron.
//   - The chevron button opens the list over a scrim, current section highlighted.
//     A row scrolls to its section (smooth unless Reduce Motion is on) and closes the
//     list; Escape, the scrim, or the button again closes it too. Focus returns to the
//     button on Escape and moves to the section after a jump.
//   - Sits 0.75rem below the top of the window, or below the R2 Nav pill bar while
//     that bar is showing, and follows it as it slides.
//
// Page hooks (custom attributes, set in Webflow):
//   [data-guide-menu="source"]   The contents nav (nav.guide-contents_component). If
//                                it's missing, the script falls back to that class.
//   Inside each link it reads .guide-contents_number and .guide-contents_label, or
//   [data-guide-menu="number"] / [data-guide-menu="label"] if those are set instead.
//   Every link's href is #<section id>; links whose section isn't on the page are
//   skipped.
//   [data-nav-r2="bar"]          The R2 Nav pill bar (already set). Optional.
//
// Classes it creates (styled in guide-menu.css): guide-menu, guide-menu_scrim,
// guide-menu_box, guide-menu_toggle, guide-menu_current, guide-menu_current-number,
// guide-menu_current-label, guide-menu_heading, guide-menu_chevron, guide-menu_panel,
// guide-menu_list, guide-menu_link, guide-menu_number, guide-menu_label,
// guide-menu_arrow. States: is-shown, is-open on .guide-menu; is-current on a link.

(function () {
  if (window.NSBHGuideMenu) return;
  window.NSBHGuideMenu = { version: '1.21.0' };

  var script = document.currentScript;

  function start() {
    var source = document.querySelector('[data-guide-menu="source"]') ||
      document.querySelector('.guide-contents_component');
    if (!source) return;

    var items = [];
    Array.prototype.forEach.call(source.querySelectorAll('a[href^="#"]'), function (a) {
      var id = decodeURIComponent(a.getAttribute('href').slice(1));
      var section = id && document.getElementById(id);
      if (!section) return;
      var num = a.querySelector('[data-guide-menu="number"], .guide-contents_number');
      var lab = a.querySelector('[data-guide-menu="label"], .guide-contents_label');
      items.push({
        id: id,
        section: section,
        number: num ? num.textContent.trim() : '',
        label: (lab || a).textContent.trim(),
      });
    });
    if (!items.length) return;

    loadCss();

    var small = window.matchMedia('(max-width: 991px)');
    var reduce = window.matchMedia('(prefers-reduced-motion: reduce)');
    var bar = document.querySelector('[data-nav-r2="bar"]');
    var GAP = 12; // px between the window top (or the pill bar) and the menu

    // ---- Build -------------------------------------------------------------
    var root = el('div', 'guide-menu');
    root.setAttribute('data-guide-menu', 'root');
    root.inert = true;

    var scrim = el('div', 'guide-menu_scrim');
    var box = el('div', 'guide-menu_box');

    var toggle = el('button', 'guide-menu_toggle');
    toggle.type = 'button';
    toggle.setAttribute('aria-expanded', 'false');
    toggle.setAttribute('aria-controls', 'guide-menu-panel');

    var current = el('span', 'guide-menu_current');
    var currentNumber = el('span', 'guide-menu_current-number');
    var currentLabel = el('span', 'guide-menu_current-label');
    current.appendChild(currentNumber);
    current.appendChild(currentLabel);
    current.setAttribute('aria-hidden', 'true');

    var heading = el('span', 'guide-menu_heading');
    heading.textContent = 'In this guide';
    heading.setAttribute('aria-hidden', 'true');

    toggle.appendChild(current);
    toggle.appendChild(heading);
    toggle.insertAdjacentHTML('beforeend',
      '<svg class="guide-menu_chevron" viewBox="0 0 14 14" width="14" height="14" fill="none" aria-hidden="true" focusable="false">' +
      '<path d="M2.5 5L7 9.5L11.5 5" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/></svg>');

    var panel = el('nav', 'guide-menu_panel');
    panel.id = 'guide-menu-panel';
    panel.setAttribute('aria-label', 'Guide sections');
    panel.hidden = true;

    var list = el('ol', 'guide-menu_list');
    items.forEach(function (item) {
      var li = document.createElement('li');
      var a = el('a', 'guide-menu_link');
      a.href = '#' + item.id;
      var n = el('span', 'guide-menu_number');
      n.textContent = item.number;
      var l = el('span', 'guide-menu_label');
      l.textContent = item.label;
      var arrow = el('span', 'guide-menu_arrow');
      arrow.textContent = '→';
      arrow.setAttribute('aria-hidden', 'true');
      a.appendChild(n);
      a.appendChild(l);
      a.appendChild(arrow);
      a.addEventListener('click', function (e) { jump(e, item); });
      li.appendChild(a);
      list.appendChild(li);
      item.link = a;
    });
    panel.appendChild(list);

    box.appendChild(toggle);
    box.appendChild(panel);
    root.appendChild(scrim);
    root.appendChild(box);
    document.body.appendChild(root);

    // ---- State -------------------------------------------------------------
    var shown = false;
    var open = false;
    var active = null;
    var top = 0;

    function barBottom() {
      if (!bar) return 0;
      var b = bar.getBoundingClientRect();
      return b.height ? Math.max(0, b.bottom) : 0;
    }

    function line() {
      // Where "the reader is" on screen: just under the closed menu.
      return top + GAP + toggle.offsetHeight + 16;
    }

    function update() {
      if (!small.matches) {
        if (open) setOpen(false);
        setShown(false);
        return;
      }
      top = barBottom();
      root.style.setProperty('--guide-menu-top', top + 'px');

      var y = line();
      var first = items[0].section.getBoundingClientRect();
      var last = items[items.length - 1].section.getBoundingClientRect();
      setShown(first.top <= y && last.bottom > y);

      var now = items[0];
      for (var i = 0; i < items.length; i++) {
        if (items[i].section.getBoundingClientRect().top <= y) now = items[i];
      }
      setActive(now);
    }

    function setShown(on) {
      if (on === shown) return;
      shown = on;
      root.classList.toggle('is-shown', on);
      root.inert = !on;
      if (!on && open) setOpen(false, document.activeElement && root.contains(document.activeElement));
    }

    function setActive(item) {
      if (item === active) return;
      if (active) {
        active.link.classList.remove('is-current');
        active.link.removeAttribute('aria-current');
      }
      active = item;
      item.link.classList.add('is-current');
      item.link.setAttribute('aria-current', 'location');
      currentNumber.textContent = item.number;
      currentLabel.textContent = item.label;
      toggle.setAttribute('aria-label',
        'In this guide. Current section: ' + (item.number ? item.number + ' ' : '') + item.label);
    }

    function setOpen(on, returnFocus) {
      open = on;
      root.classList.toggle('is-open', on);
      toggle.setAttribute('aria-expanded', on ? 'true' : 'false');
      panel.hidden = !on;
      if (on && active) {
        // Keep the current row in view when the list is taller than the screen.
        var r = active.link;
        if (r.offsetTop + r.offsetHeight > panel.clientHeight) panel.scrollTop = r.offsetTop - panel.clientHeight / 2;
        else panel.scrollTop = 0;
      }
      if (!on && returnFocus) toggle.focus();
    }

    function jump(e, item) {
      e.preventDefault();
      setOpen(false);
      var goingUp = item.section.getBoundingClientRect().top < 0;
      // Leave room for the closed menu, plus the pill bar, which slides in on a jump up.
      var room = GAP + toggle.offsetHeight + 8 + (goingUp && bar ? bar.offsetHeight : 0);
      var y = item.section.getBoundingClientRect().top + window.scrollY - room;
      window.scrollTo({ top: Math.max(0, y), behavior: reduce.matches ? 'auto' : 'smooth' });
      if (history.replaceState) history.replaceState(null, '', '#' + item.id);
      if (!item.section.hasAttribute('tabindex')) item.section.setAttribute('tabindex', '-1');
      item.section.focus({ preventScroll: true });
    }

    toggle.addEventListener('click', function () { setOpen(!open); });
    scrim.addEventListener('click', function () { setOpen(false); });
    document.addEventListener('keydown', function (e) {
      if (open && e.key === 'Escape') setOpen(false, true);
    });

    // ---- Scroll, resize, and the pill bar's slide --------------------------
    var queued = false;
    function queue() {
      if (queued) return;
      queued = true;
      requestAnimationFrame(function () { queued = false; update(); });
    }
    window.addEventListener('scroll', queue, { passive: true });
    window.addEventListener('resize', queue);
    if (small.addEventListener) small.addEventListener('change', queue);

    if (bar) {
      // Follow the bar frame by frame while it slides, so the menu moves with it.
      var following = false;
      var follow = function () {
        update();
        if (following) requestAnimationFrame(follow);
      };
      bar.addEventListener('transitionrun', function () {
        if (following) return;
        following = true;
        requestAnimationFrame(follow);
      });
      var stop = function () { following = false; queue(); };
      bar.addEventListener('transitionend', stop);
      bar.addEventListener('transitioncancel', stop);
    }

    update();
  }

  function el(tag, cls) {
    var node = document.createElement(tag);
    node.className = cls;
    return node;
  }

  function loadCss() {
    if (document.querySelector('link[data-guide-menu-css]')) return;
    var src = script && script.src;
    if (!src) return;
    var link = document.createElement('link');
    link.rel = 'stylesheet';
    link.href = src.replace(/\.js(\?.*)?$/, '.css');
    link.setAttribute('data-guide-menu-css', '');
    document.head.appendChild(link);
  }

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', start);
  else start();
})();
