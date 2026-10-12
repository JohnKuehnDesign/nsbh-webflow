// NSBH shop card — one designed card, filled from data attributes, used everywhere a
// shop card appears (the map popup, the region lists, and later the guide and
// destination pages).
//
// Hosted on GitHub, served to Webflow via jsDelivr as a classic deferred script. On
// the map page it loads BEFORE map-embed.js; elsewhere it loads on its own:
//   <script defer src="https://cdn.jsdelivr.net/gh/JohnKuehnDesign/nsbh-webflow@vX.Y.Z/src/shop-card/shop-card.js"></script>
//
// Expects on the page (set in Webflow Designer):
//   [data-map-template="shop|destination"]  One designed card per type, outside every
//                                         Collection List and hidden on the live page.
//     [data-map-card]                     The element that gets cloned (the panel)
//     [data-map-slot="..."]               Fields to fill: name, region, town,
//                                         separator, description, address, premium,
//                                         tags, tag, tag-icon, tag-name, directions,
//                                         call, website, image, link, distance,
//                                         distance-text, nearby. An empty value
//                                         removes the slot.
//   Shop data: an element carrying the shop's data-* attributes: data-id (slug),
//   data-name, data-display-name, data-region-name, data-town-name, data-address,
//   data-description, data-phone, data-website, data-google-map-link,
//   data-directions-link, data-lat, data-lng. The map's hidden items
//   [data-map-element="item"] carry them; a list item that does is marked
//   [data-shop-card="source"].
//   [data-shop-card-open]                A link or button that opens a shop's card in a
//                                         popover: on hover (desktop), on click or Enter
//                                         (any size), full screen on tablet and below.
//                                         Its data is the [data-shop-card="source"] item
//                                         it sits in; or set the value to a slug to use
//                                         another element's data.
//   [data-map-element="tag"] with data-slug  Tag chips. Their icon and name are reused
//                                         in the card's tags row. Without chips the
//                                         row stays hidden.
//
// Public API, for map-embed.js: window.NSBHShopCard
//   build(source, options)       -> the filled card element, or null without a template
//   popupHtml(source, options)   -> card HTML with the distance flag in front (map popup)
//   fillTags(root, shopId, options)    fills the tags row inside root (async)
//   loadTags(options)            -> Promise of { byTag, byShop } (tag slug <-> shop ids)
//   fillDistance(root, point)    shows or hides the "X miles away" flag inside root
//   setOrigin(point | null)      the visitor's place, { lat, lng }; refreshes an open card
//   findSource(id)               -> the data element for a shop slug
//
// Options (all optional): premium ('all' | 'cms' | 'none'), tagPagePath. When left
// out they come from data-map-premium / data-map-tag-page-path on the map div if the
// page has one, then from the defaults below.

(function () {
  if (window.NSBHShopCard) return;

  const DEFAULTS = { premium: 'all', tagPagePath: '/shop-tags/' };
  const DESKTOP = window.matchMedia('(min-width: 992px)');

  function options(opts = {}) {
    const viewport = document.querySelector('[data-map-element="viewport"]');
    return {
      premium: opts.premium || viewport?.getAttribute('data-map-premium') || DEFAULTS.premium,
      tagPagePath: opts.tagPagePath || viewport?.getAttribute('data-map-tag-page-path') || DEFAULTS.tagPagePath,
    };
  }

  // --- building a card --------------------------------------------------------

  const SLOT_TEXT = {
    shop:        { name: (d) => d.displayName || d.name, region: (d) => d.regionName, town: (d) => d.townName,
                   description: (d) => d.description, address: (d) => d.address },
    destination: { name: (d) => d.name, region: (d) => d.regionName, description: (d) => d.description },
  };

  const kindOf = (source) => (source.dataset.mapKind === 'destination' ? 'destination' : 'shop');
  const templateOf = (kind) => document.querySelector(`[data-map-template="${kind}"]`);

  // Clones the template card and fills its slots from the source element's data-*
  // attributes. The close button stays in the clone (the popover uses it; the map
  // removes it because MapLibre draws its own).
  function build(source, opts) {
    if (!source) return null;
    const o = options(opts);
    const kind = kindOf(source);
    const tpl = templateOf(kind);
    const from = tpl && (tpl.querySelector('[data-map-card]') || tpl.firstElementChild);
    if (!from) return null;

    const card = from.cloneNode(true);
    card.removeAttribute('id');
    const d = source.dataset;

    // Text slots. An empty value removes the slot so no placeholder text is left.
    for (const [slot, read] of Object.entries(SLOT_TEXT[kind])) {
      for (const el of card.querySelectorAll(`[data-map-slot="${slot}"]`)) {
        const value = (read(d) || '').trim();
        if (value) el.textContent = value; else el.remove();
      }
    }

    // The region/town divider only makes sense when both are present.
    if (!d.regionName || !d.townName) {
      for (const el of card.querySelectorAll('[data-map-slot="separator"]')) el.remove();
    }

    if (kind === 'shop') {
      fillLink(card, 'directions', safeUrl(d.googleMapLink) || safeUrl(d.directionsLink));
      fillLink(card, 'website', safeUrl(d.website));
      const digits = (d.phone || '').replace(/[^\d+]/g, '');
      fillLink(card, 'call', digits ? `tel:${digits}` : null, false);
    } else {
      fillLink(card, 'link', d.id ? `/destinations/${encodeURIComponent(d.id)}` : null, false);
      fillImage(card, source);
    }

    // Premium seal:
    //   all  (default) show the seal on every shop card, whatever the CMS says
    //   cms  only on shops marked Premium (the source then holds a
    //        [data-map-field="premium"] element, present only for those shops)
    //   none never show it
    if (kind === 'shop') {
      const show = o.premium === 'all' || (o.premium === 'cms' && source.querySelector('[data-map-field="premium"]'));
      if (!show) for (const el of card.querySelectorAll('[data-map-slot="premium"]')) el.remove();
    }

    // Tags are filled in when the card opens (see fillTags), because which shops
    // carry a tag is read from the tag pages. The row stays hidden and empty until
    // then; its first tag element becomes the pattern for the rest.
    for (const el of card.querySelectorAll('[data-map-slot="tags"]')) {
      const proto = el.querySelector('[data-map-slot="tag"]');
      if (kind !== 'shop' || !d.id || !proto) { el.remove(); continue; }
      tags.proto = tags.proto || proto.outerHTML;
      el.replaceChildren();
      el.hidden = true;
      el.setAttribute('data-map-tags', d.id);
    }
    // Nearby shops have no data source yet and are dropped rather than left as
    // template placeholders.
    for (const el of card.querySelectorAll('[data-map-slot="nearby"]')) el.remove();
    markDistanceFlag(card);
    for (const el of card.querySelectorAll('[data-map-slot]')) el.removeAttribute('data-map-slot');

    return card;
  }

  // In the shop template the distance flag sits beside the card, inside its popover
  // wrapper, not inside the card that gets cloned. This returns a ready copy of it.
  function distanceFlag(kind, card) {
    if (card.querySelector('[data-map-distance]')) return null;
    const source = templateOf(kind)?.querySelector('[data-map-slot="distance"]');
    if (!source) return null;
    const flag = source.cloneNode(true);
    flag.removeAttribute('id');
    markDistanceFlag(flag);
    for (const el of [flag, ...flag.querySelectorAll('[data-map-slot]')]) el.removeAttribute('data-map-slot');
    return flag;
  }

  // The map popup: no close button (MapLibre draws one), the flag in front of the
  // card (the popup's content box positions it on the card's top edge).
  function popupHtml(source, opts) {
    const card = build(source, opts);
    if (!card) return null;
    card.classList.add('cms-map-popup-card');
    for (const el of card.querySelectorAll('[data-shop-popover-close], [data-shop-popover-backdrop]')) el.remove();
    const flag = distanceFlag(kindOf(source), card);
    return (flag ? flag.outerHTML : '') + card.outerHTML;
  }

  // The flag's slots turn into data-map-distance (the flag, hidden until there is a
  // place) and data-map-distance-text (the element holding the words, optional).
  function markDistanceFlag(root) {
    const within = (slot) => [root, ...root.querySelectorAll('*')].filter((el) => el.getAttribute('data-map-slot') === slot);
    for (const el of within('distance')) {
      el.setAttribute('data-map-distance', '');
      el.hidden = true;
    }
    for (const el of within('distance-text')) el.setAttribute('data-map-distance-text', '');
  }

  // An image field cannot bind to an attribute, so the source carries an
  // <img data-map-field="image"> bound to it instead. Its src goes onto the
  // template's image slot; with no image, the slot and its now-empty wrapper are
  // removed so the card has no blank band.
  function fillImage(card, source) {
    const img0 = source.querySelector('img[data-map-field="image"]');
    let src = img0 && (img0.getAttribute('src') || '').trim();
    // An empty CMS image falls back to the asset the element was created with.
    // Webflow flags that case with w-dyn-bind-empty; data-map-placeholder (the
    // fallback asset's id) is a second check in case the class is ever dropped.
    const placeholder = img0 && img0.dataset.mapPlaceholder;
    if (img0 && img0.classList.contains('w-dyn-bind-empty')) src = '';
    else if (src && placeholder && src.includes(placeholder)) src = '';
    for (const img of card.querySelectorAll('[data-map-slot="image"]')) {
      const wrapper = img.parentElement && img.parentElement !== card ? img.parentElement : null;
      if (src) {
        img.setAttribute('src', src);
        img.setAttribute('alt', img0.getAttribute('alt') || '');
        img.removeAttribute('srcset');
        img.removeAttribute('sizes');
        img.setAttribute('loading', 'lazy');
      } else {
        img.remove();
        if (wrapper && !wrapper.children.length) wrapper.remove();
      }
    }
  }

  // Sets a slot link's href, or removes the link when there is nowhere to go.
  function fillLink(card, slot, href, external = true) {
    for (const a of card.querySelectorAll(`[data-map-slot="${slot}"]`)) {
      a.style.removeProperty('display');
      if (!href) { a.remove(); continue; }
      a.setAttribute('href', href);
      if (external) { a.target = '_blank'; a.rel = 'noopener noreferrer'; }
    }
  }

  // Only http(s) links are allowed through — CMS fields are free text, and a
  // javascript: URL in a card would run on click.
  function safeUrl(raw) {
    const url = String(raw || '').trim();
    if (!url) return null;
    if (!/^https?:\/\//i.test(url)) {
      console.warn(`[shop-card] ignoring non-http(s) link: "${url.slice(0, 60)}"`);
      return null;
    }
    return url;
  }

  // The shop data for a list link: the Collection Item it sits in, when that item
  // carries the data ([data-shop-card="source"]); otherwise the element elsewhere on
  // the page with the slug in data-shop-card-open.
  function sourceFor(trigger) {
    return trigger.closest('[data-shop-card="source"]') || findSource(trigger.getAttribute('data-shop-card-open'));
  }

  function findSource(id) {
    if (!id) return null;
    const v = CSS.escape(id);
    return document.querySelector(`[data-shop-card="source"][data-id="${v}"], [data-map-element="item"][data-id="${v}"]`);
  }

  // --- tags ---------------------------------------------------------------------
  //
  // A multi-reference field (a shop's tags) cannot be bound to an attribute, and a
  // Collection List of Shop Tags knows nothing about shops. The way round it: each
  // Shop Tag's own page lists the shops that carry it (a hidden Shops list filtered
  // "Shop Tags contains the current Shop Tag", every item marked
  // [data-map-element="tag-shop"] with data-id = the shop slug). The tag chips give
  // the slugs; their pages are fetched once, the first time tags are needed, and
  // flipped into a shop -> tags lookup.
  const tags = {
    proto: null,          // outerHTML of the template tag element in the shop card
    ready: null,          // Promise for the loaded lookup, or null before the first use
    byTag: new Map(),     // tag slug -> Set of shop ids
    byShop: new Map(),    // shop id  -> [tag slug, ...] in chip order
  };

  const tagChips = () => Array.from(document.querySelectorAll('[data-map-element="tag"]'));

  // A tag whose page cannot be read is skipped with a warning; if any failed, the
  // next use tries again.
  function loadTags(opts) {
    if (tags.ready) return tags.ready;
    const { tagPagePath } = options(opts);
    const slugs = [...new Set(tagChips().map((c) => c.dataset.slug).filter(Boolean))];
    let failed = false;
    tags.ready = Promise.all(slugs.map(async (slug) => {
      try {
        const url = new URL(tagPagePath + encodeURIComponent(slug), window.location.origin);
        const res = await fetch(url, { headers: { Accept: 'text/html' } });
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
        const doc = new DOMParser().parseFromString(await res.text(), 'text/html');
        const ids = new Set();
        for (const el of doc.querySelectorAll('[data-map-element="tag-shop"]')) {
          if (el.dataset.id) ids.add(el.dataset.id);
        }
        tags.byTag.set(slug, ids);
      } catch (err) {
        failed = true;
        console.warn(`[shop-card] could not read the shops for tag "${slug}"`, err);
      }
    })).then(() => {
      tags.byShop.clear();
      for (const slug of slugs) {
        for (const id of tags.byTag.get(slug) || []) {
          if (!tags.byShop.has(id)) tags.byShop.set(id, []);
          tags.byShop.get(id).push(slug);
        }
      }
      const lookup = { byTag: tags.byTag, byShop: tags.byShop };
      if (failed) tags.ready = null;
      return lookup;
    });
    return tags.ready;
  }

  // Adds one tag element per tag the shop carries to the card's tags row. The icon
  // and the name come from the chip with the same slug, so nothing is duplicated in
  // the card template. With no tags, or no chips, the row stays hidden.
  async function fillTags(root, shopId, opts) {
    if (!root || !tags.proto) return;
    await loadTags(opts);
    const box = root.querySelector(`[data-map-tags="${CSS.escape(shopId)}"]`);
    if (!box || box.children.length) return;
    const chips = new Map(tagChips().map((c) => [c.dataset.slug, c]));
    const tpl = document.createElement('template');
    for (const slug of tags.byShop.get(shopId) || []) {
      const chip = chips.get(slug);
      if (!chip) continue;
      tpl.innerHTML = tags.proto;
      const tag = tpl.content.firstElementChild;
      const name = chip.textContent.trim();
      // The icon is whatever SVG the chip holds, so renaming its wrapper class in
      // Designer cannot break this.
      const icon = chip.querySelector('svg');
      const slot = tag.querySelector('[data-map-slot="tag-icon"]');
      if (slot && icon) slot.innerHTML = icon.outerHTML;
      // A card with a visible [data-map-slot="tag-name"] shows the name as text; an
      // icon-only card names each tag for assistive tech and as a hover title.
      const label = tag.querySelector('[data-map-slot="tag-name"]');
      if (label) {
        label.textContent = name;
      } else {
        tag.setAttribute('role', 'img');
        tag.setAttribute('aria-label', name);
        tag.title = name;
      }
      for (const el of tag.querySelectorAll('[data-map-slot]')) el.removeAttribute('data-map-slot');
      tag.removeAttribute('data-map-slot');
      box.append(tag);
    }
    box.hidden = !box.children.length;
  }

  // --- distance -----------------------------------------------------------------

  let origin = null; // the visitor's place, { lat, lng }, set by the map

  // Straight-line miles (haversine, same Earth radius as Turf).
  function miles(a, b) {
    const rad = Math.PI / 180;
    const dLat = (b.lat - a.lat) * rad;
    const dLng = (b.lng - a.lng) * rad;
    const h = Math.sin(dLat / 2) ** 2 + Math.cos(a.lat * rad) * Math.cos(b.lat * rad) * Math.sin(dLng / 2) ** 2;
    return 2 * 3958.761 * Math.asin(Math.sqrt(h));
  }

  function distanceText(point) {
    const rounded = Math.round(miles(origin, point) * 10) / 10;
    if (rounded < 0.1) return 'Less than 0.1 miles away';
    return `${rounded.toFixed(1)} ${rounded === 1 ? 'mile' : 'miles'} away`;
  }

  // Fills (or hides) the distance flag inside root. point is the shop's { lat, lng }.
  function fillDistance(root, point) {
    if (!root) return;
    const ok = origin && point && Number.isFinite(+point.lat) && Number.isFinite(+point.lng);
    for (const flag of root.querySelectorAll('[data-map-distance]')) {
      if (!ok) { flag.hidden = true; continue; }
      const target = flag.querySelector('[data-map-distance-text]') || flag;
      target.textContent = distanceText({ lat: +point.lat, lng: +point.lng });
      flag.hidden = false;
    }
  }

  function setOrigin(point) {
    origin = point ? { lat: +point.lat, lng: +point.lng } : null;
    if (pop.open) refreshFlag();
  }

  // --- popover for list links ------------------------------------------------------
  //
  // One shared popover for every [data-shop-card-open] link on the page, built from
  // the template's own popover wrapper (.shop-popover > flag + panel). The card is
  // built fresh each time it opens, so the lists only carry the link. Desktop: opens
  // on hover beside the link, and on click or Enter. Tablet and below: opens full
  // screen on tap, over a backdrop, with the close button.
  const pop = { shell: null, panel: null, trigger: null, source: null, open: false, timer: 0, locked: false, overflow: '' };

  function ensureShell() {
    if (pop.shell) return pop.shell;
    const wrapper = templateOf('shop')?.querySelector('[data-shop-popover]');
    const shell = wrapper ? wrapper.cloneNode(false) : document.createElement('div');
    shell.removeAttribute('id');
    shell.classList.remove('is-preview');
    if (!wrapper) shell.className = 'shop-popover';
    shell.setAttribute('data-shop-popover', '');
    shell.setAttribute('data-shop-card-popover', '');
    const backdrop = document.createElement('div');
    backdrop.className = 'shop-popover_backdrop';
    backdrop.setAttribute('data-shop-popover-backdrop', '');
    shell.append(backdrop);
    document.body.append(shell);
    pop.shell = shell;
    return shell;
  }

  function fillShell(trigger, source) {
    const shell = ensureShell();
    pop.panel?.remove();
    const panel = build(source);
    if (!panel) return null;
    panel.classList.remove('is-preview');
    panel.id = 'shop-card-popover';
    panel.setAttribute('role', 'dialog');
    panel.tabIndex = -1;
    const name = panel.querySelector('h1, h2, h3, h4, h5, h6');
    if (name) {
      name.id = 'shop-card-popover-name';
      panel.setAttribute('aria-labelledby', name.id);
    }
    // The flag goes inside the panel, which is the positioned element here, so it
    // sits on the panel's top edge wherever the panel is placed.
    const flag = distanceFlag('shop', panel);
    if (flag) panel.prepend(flag);
    shell.append(panel);
    pop.panel = panel;
    trigger.setAttribute('aria-controls', panel.id);
    return panel;
  }

  function refreshFlag() {
    const p = pop.panel;
    if (!p || !pop.source) return;
    fillDistance(p, { lat: pop.source.dataset.lat, lng: pop.source.dataset.lng });
    // The flag hangs above the panel; on desktop the panel clips its overflow (it
    // scrolls when taller than the window), so the flag needs it visible.
    const flagShown = p.querySelector('[data-map-distance]:not([hidden])');
    p.style.overflow = flagShown ? 'visible' : '';
  }

  // Desktop: beside the link, its left edge overlapping the link by half a rem,
  // kept inside the window with room for the flag above.
  function place() {
    const { panel, trigger } = pop;
    panel.style.position = 'fixed';
    panel.style.transform = 'none';
    panel.style.top = '0px';
    panel.style.left = '0px';
    const t = trigger.getBoundingClientRect();
    const r = panel.getBoundingClientRect();
    const rem = parseFloat(getComputedStyle(document.documentElement).fontSize) || 16;
    const flag = panel.querySelector('[data-map-distance]:not([hidden])');
    const pad = 12;
    const top0 = pad + (flag ? flag.offsetHeight : 0);
    let left = t.right - 0.5 * rem;
    let top = t.top;
    if (left + r.width > window.innerWidth - pad) left = Math.max(pad, window.innerWidth - pad - r.width);
    if (top + r.height > window.innerHeight - pad) top = Math.max(top0, window.innerHeight - pad - r.height);
    panel.style.left = `${Math.max(pad, left)}px`;
    panel.style.top = `${Math.max(top0, top)}px`;
  }

  function open(trigger, { focus = false } = {}) {
    window.clearTimeout(pop.timer);
    if (pop.open && pop.trigger === trigger) return;
    const source = sourceFor(trigger);
    if (!source) {
      console.warn('[shop-card] no shop data for this link', trigger);
      return;
    }
    close({ restoreFocus: false });
    if (!fillShell(trigger, source)) return;
    pop.trigger = trigger;
    pop.source = source;
    pop.open = true;
    pop.shell.classList.add('is-open');
    trigger.setAttribute('aria-expanded', 'true');
    refreshFlag();
    fillTags(pop.panel, source.dataset.id).then(() => { if (pop.open && DESKTOP.matches) place(); });

    if (DESKTOP.matches) {
      place();
      pop.panel.removeAttribute('aria-modal');
    } else {
      pop.panel.setAttribute('aria-modal', 'true');
      pop.overflow = document.body.style.overflow;
      pop.locked = true;
      document.body.style.overflow = 'hidden';
      focus = true;
    }
    if (focus) {
      const closeBtn = pop.panel.querySelector('[data-shop-popover-close]');
      (closeBtn && closeBtn.offsetParent ? closeBtn : pop.panel).focus({ preventScroll: true });
    }
  }

  function close({ restoreFocus = true } = {}) {
    window.clearTimeout(pop.timer);
    if (!pop.open) return;
    const { trigger, panel } = pop;
    const hadFocus = panel && panel.contains(document.activeElement);
    pop.shell.classList.remove('is-open');
    panel?.remove();
    if (pop.locked) document.body.style.overflow = pop.overflow;
    pop.locked = false;
    trigger?.setAttribute('aria-expanded', 'false');
    pop.panel = null;
    pop.trigger = null;
    pop.source = null;
    pop.open = false;
    if (restoreFocus && hadFocus && trigger?.isConnected) trigger.focus({ preventScroll: true });
  }

  const scheduleClose = () => {
    window.clearTimeout(pop.timer);
    pop.timer = window.setTimeout(() => close({ restoreFocus: false }), 220);
  };

  const triggerOf = (el) => (el && el.closest ? el.closest('[data-shop-card-open]') : null);
  const inPanel = (el) => !!(el && pop.panel && pop.panel.contains(el));

  function initPopovers() {
    const triggers = document.querySelectorAll('[data-shop-card-open]');
    for (const t of triggers) {
      t.setAttribute('aria-haspopup', 'dialog');
      t.setAttribute('aria-expanded', 'false');
    }

    document.addEventListener('pointerover', (e) => {
      if (!DESKTOP.matches || e.pointerType === 'touch') return;
      const t = triggerOf(e.target);
      if (t) open(t);
      else if (inPanel(e.target)) window.clearTimeout(pop.timer);
    });

    document.addEventListener('pointerout', (e) => {
      if (!DESKTOP.matches || !pop.open || e.pointerType === 'touch') return;
      const from = triggerOf(e.target) || (inPanel(e.target) ? pop.panel : null);
      if (!from) return;
      const to = e.relatedTarget;
      if (to && (inPanel(to) || triggerOf(to) === pop.trigger)) return;
      scheduleClose();
    });

    document.addEventListener('click', (e) => {
      if (!e.target.closest) return;
      if (e.target.closest('[data-shop-card-popover] [data-shop-popover-close]')) {
        e.preventDefault();
        close();
        return;
      }
      if (e.target.closest('[data-shop-card-popover] [data-shop-popover-backdrop]')) {
        close();
        return;
      }
      const t = triggerOf(e.target);
      if (!t) {
        if (pop.open && DESKTOP.matches && !inPanel(e.target)) close({ restoreFocus: false });
        return;
      }
      e.preventDefault();
      // A click with no pointer behind it (detail 0) came from the keyboard: the
      // card opens with focus inside it, and Escape brings focus back.
      const byKeyboard = e.detail === 0;
      if (pop.open && pop.trigger === t) {
        // A mouse click on a link whose card is already open from hovering leaves it be.
        if (byKeyboard || !DESKTOP.matches) close();
        return;
      }
      open(t, { focus: byKeyboard });
    });

    document.addEventListener('keydown', (e) => {
      if (e.key === 'Escape' && pop.open) close();
    });

    // Tabbing out of the card on desktop closes it.
    document.addEventListener('focusin', (e) => {
      if (!pop.open || !DESKTOP.matches) return;
      if (inPanel(e.target) || e.target === pop.trigger) return;
      close({ restoreFocus: false });
    });

    window.addEventListener('resize', () => close({ restoreFocus: false }));
    window.addEventListener('scroll', (e) => {
      if (!pop.open || !DESKTOP.matches) return;
      if (inPanel(e.target)) return;
      close({ restoreFocus: false });
    }, true);
  }

  window.NSBHShopCard = { build, popupHtml, fillTags, loadTags, fillDistance, setOrigin, findSource };

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', initPopovers, { once: true });
  } else {
    initPopovers();
  }
})();
