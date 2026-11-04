// NSBH places index — region filter and "Show more destinations" for the R2 Destinations Index
// (Webflow, group R2), used on Things to Do (/destinations).
//
// Hosted on GitHub, served to Webflow via jsDelivr. It is loaded by the hidden embed
// inside the Destinations Index component:
//   <script src="https://cdn.jsdelivr.net/gh/JohnKuehnDesign/nsbh-webflow@X.Y.Z/src/places/places.js" defer></script>
// Safe to load more than once (each section is wired once).
//
// How it works:
//   - The page's Destinations Collection List sits in the component's Cards slot with
//     Webflow pagination on (12 per page). Webflow renders page 1 and a Next link.
//   - The script hides Webflow's pagination, then quietly fetches the remaining pages
//     (following each Next link) and adds their items to the list, hidden. Once every
//     page is in, the count ("30 destinations") and status ("Showing 12 of 30") appear.
//   - "Show more destinations" reveals the next 12 matching places and moves focus to the
//     first new card, so keyboard users land on what was added.
//   - A region chip (desktop and tablet) or the region select (phone) filters the whole
//     list, including places not shown yet, and resets to the first 12. The choice is
//     kept in the URL as ?region=<slug>, so a link to /destinations?region=cape-ann
//     opens filtered.
//   - Without the script, page 1 (12 places) still shows and links normally.
//
// Page hooks (custom attributes, set in Webflow):
//   [data-places]               The section (section_places).
//   [data-places-filter="…"]    A chip button: "all" or a region slug. Inside the filter embed.
//   [data-places-select]        The phone <select>; option values as the chips.
//   [data-places-count]         "30 destinations" text (hidden until every page is in).
//   [data-places-more]          The wrapper around the "Show more destinations" R2 Button.
//   [data-places-status]        "Showing 12 of 30" text (aria-live).
//   [data-region]               On each card's link (destination-card_link), bound to
//                               Region > Slug in the Collection List.
//   data-page-size on the section overrides the 12-per-step default.

(function () {
  var roots = document.querySelectorAll('[data-places]');

  Array.prototype.forEach.call(roots, function (root, rootIndex) {
    if (root.hasAttribute('data-places-ready')) return;
    root.setAttribute('data-places-ready', '');

    var list = root.querySelector('.w-dyn-items');
    if (!list) return;
    var wrapper = list.closest('.w-dyn-list') || list.parentElement;

    var step = parseInt(root.getAttribute('data-page-size'), 10) || 12;
    var items = Array.prototype.slice.call(list.children);
    var pager = wrapper.querySelector('.w-pagination-wrapper');
    var next = wrapper.querySelector('.w-pagination-next');
    var nextUrl = next ? next.href : null;
    if (pager) pager.hidden = true;

    var chips = Array.prototype.slice.call(root.querySelectorAll('[data-places-filter]'));
    var select = root.querySelector('[data-places-select]');
    var count = root.querySelector('[data-places-count]');
    var status = root.querySelector('[data-places-status]');
    // [data-places-more] is the wrapper around the R2 Button (an instance can't take
    // attributes), so the clickable is the link or button inside it.
    var moreWrap = root.querySelector('[data-places-more]');
    var more = moreWrap && (moreWrap.matches('a, button') ? moreWrap : moreWrap.querySelector('a, button'));

    var known = chips.map(function (c) { return c.getAttribute('data-places-filter'); });
    var filter = 'all';
    var shown = step;
    var complete = !nextUrl;
    var loading = null;

    if (count) count.style.visibility = 'hidden';
    if (status) status.style.visibility = 'hidden';
    if (more) {
      more.setAttribute('role', 'button');
      more.addEventListener('keydown', function (e) {
        if (e.key === ' ') { e.preventDefault(); more.click(); }
      });
    }

    function regionOf(item) {
      var el = item.querySelector('[data-region]');
      return el ? el.getAttribute('data-region') : '';
    }

    function matching() {
      if (filter === 'all') return items;
      return items.filter(function (item) { return regionOf(item) === filter; });
    }

    // Fetch the remaining pages one after another, following each page's Next link.
    function loadAll() {
      if (complete) return Promise.resolve();
      if (loading) return loading;
      list.setAttribute('aria-busy', 'true');
      loading = (function step(url) {
        return fetch(url, { credentials: 'same-origin' })
          .then(function (res) { return res.text(); })
          .then(function (html) {
            var doc = new DOMParser().parseFromString(html, 'text/html');
            var otherRoot = doc.querySelectorAll('[data-places]')[rootIndex];
            var otherList = otherRoot && otherRoot.querySelector('.w-dyn-items');
            if (!otherList) return null;
            Array.prototype.slice.call(otherList.children).forEach(function (item) {
              var node = document.importNode(item, true);
              node.hidden = true;
              list.appendChild(node);
              items.push(node);
            });
            var otherNext = otherRoot.querySelector('.w-pagination-next');
            return otherNext ? new URL(otherNext.getAttribute('href'), url).href : null;
          })
          .then(function (nextPage) { return nextPage ? step(nextPage) : null; });
      })(nextUrl)
        .catch(function () { /* keep what loaded; Show more still works on it */ })
        .then(function () {
          complete = true;
          list.removeAttribute('aria-busy');
        });
      return loading;
    }

    function render() {
      var match = matching();
      var visible = match.slice(0, shown);
      items.forEach(function (item) { item.hidden = visible.indexOf(item) === -1; });

      if (complete) {
        var n = match.length;
        if (count) {
          count.textContent = n + (n === 1 ? ' destination' : ' destinations');
          count.style.visibility = '';
        }
        if (status) {
          status.textContent = n ? 'Showing ' + visible.length + ' of ' + n : 'Nothing here yet. Try another region.';
          status.style.visibility = '';
        }
      }
      if (moreWrap) moreWrap.hidden = complete ? visible.length >= match.length : false;
    }

    function setFilter(value, fromUrl) {
      filter = known.indexOf(value) > -1 ? value : 'all';
      shown = step;
      chips.forEach(function (chip) {
        var on = chip.getAttribute('data-places-filter') === filter;
        chip.classList.toggle('is-active', on);
        chip.setAttribute('aria-pressed', on ? 'true' : 'false');
      });
      if (select) select.value = filter;
      if (!fromUrl && window.history && history.replaceState) {
        var url = new URL(window.location.href);
        if (filter === 'all') url.searchParams.delete('region');
        else url.searchParams.set('region', filter);
        history.replaceState(history.state, '', url.toString());
      }
      if (filter === 'all' || complete) render();
      else loadAll().then(render);
    }

    chips.forEach(function (chip) {
      chip.addEventListener('click', function () {
        setFilter(chip.getAttribute('data-places-filter'));
      });
    });
    if (select) {
      select.addEventListener('change', function () { setFilter(select.value); });
    }

    if (more) {
      more.addEventListener('click', function (e) {
        e.preventDefault();
        // The button is a link to #places; stop Webflow's same-page smooth scroll
        // (a delegated document click handler) from jumping back to the section top.
        e.stopPropagation();
        var before = matching().slice(0, shown);
        shown += step;
        loadAll().then(function () {
          render();
          var added = matching().slice(0, shown).filter(function (item) { return before.indexOf(item) === -1; });
          var target = added[0] && added[0].querySelector('a[href]');
          if (target) target.focus();
        });
      });
    }

    var fromUrl = new URL(window.location.href).searchParams.get('region');
    setFilter(fromUrl || 'all', true);

    // Fetch the rest once the page has settled, so the count and status fill in.
    function later() { loadAll().then(render); }
    if ('requestIdleCallback' in window) window.requestIdleCallback(later, { timeout: 2000 });
    else setTimeout(later, 1200);
  });
})();
