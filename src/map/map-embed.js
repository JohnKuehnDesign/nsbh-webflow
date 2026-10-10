// NSBH CMS Map — open-source Jetboost equivalent.
//
// Hosted on GitHub, served to Webflow via jsDelivr as a classic deferred script:
//   <script defer src="https://cdn.jsdelivr.net/gh/JohnKuehnDesign/nsbh-webflow@vX.Y.Z/src/map/map-embed.js"></script>
//
// Expects on the page (data-map-element hooks, set in Webflow Designer):
//   [data-map-element="viewport"]      The map container div — also carries config attributes
//   [data-map-element="item"]          Collection List items (inside the list)
//     data-id, data-lat, data-lng      bound to CMS Slug / Latitude / Longitude fields
//   [data-map-element="search-input"]  Address / zip input    (optional)
//   [data-map-element="search-radius"] <select> of miles      (optional; one or several, kept in step)
//   [data-map-element="search-submit"] Submit button          (optional)
//   [data-map-element="search-clear"]  Clear button           (optional)
//   [data-map-element="search-status"] Text container for result summary (optional)
//
// Configuration — see CONFIG_SCHEMA below. Resolution order, first match wins:
//   1. data-map-* attribute on the viewport element   (set in Designer, per page)
//   2. window.NSBH_MAP_CONFIG object                  (set in page head code)
//   3. built-in default                               (matches the original hard-coded value)
//
// Design decisions:
//   - Popups reuse the corresponding list item's own HTML (no duplicate templating).
//   - Two-way sync: list hover/click <-> marker state, via a shared .is-active class.
//   - Zero build step: dependencies are loaded dynamically from esm.sh.

let maplibregl;
let distance;

const MAPLIBRE_URL = 'https://esm.sh/maplibre-gl@4.7.1';
const TURF_DISTANCE_URL = 'https://esm.sh/@turf/distance@7.1.0';

const NOMINATIM_URL = 'https://nominatim.openstreetmap.org/search';

// --- config --------------------------------------------------------------

// Each entry: attribute suffix -> { key, parse, default }.
// The Designer attribute is `data-map-<suffix>`; the head-config key is `<key>`.
// Defaults reproduce the original hard-coded behavior exactly.
const CONFIG_SCHEMA = {
  'center':           { key: 'center',          parse: asLngLat, default: [-70.95, 42.55] },
  'zoom':             { key: 'zoom',            parse: asNumber, default: 9 },
  'style':            { key: 'style',           parse: asString, default: 'https://tiles.openfreemap.org/styles/liberty' },
  'fit-on-load':      { key: 'fitOnLoad',       parse: asBool,   default: true },
  'fit-padding':      { key: 'fitPadding',      parse: asNumber, default: 48 },
  'fit-max-zoom':     { key: 'fitMaxZoom',      parse: asNumber, default: 13 },
  'single-zoom':      { key: 'singleZoom',      parse: asNumber, default: 12 },
  'focus-zoom':       { key: 'focusZoom',       parse: asNumber, default: 12 },
  // Pixels to drop the focused pin below the map's vertical centre, so a tall
  // popup has room above it. 0 centres the pin (the old behaviour).
  'focus-offset':     { key: 'focusOffset',     parse: asNumber, default: 0 },
  'scroll-zoom':      { key: 'scrollZoom',      parse: asBool,   default: true },
  'cooperative-gestures': { key: 'cooperativeGestures', parse: asBool, default: false },
  'nav-control':      { key: 'navControl',      parse: asString, default: 'top-right' },
  // The card takes its own designed width (the shop panel caps itself at 30rem).
  // The percentage is of the map, not the screen, and 2.5rem leaves 1.25rem each
  // side: room for the close circle that overhangs the card's corner by 1rem.
  'popup-max-width':  { key: 'popupMaxWidth',   parse: asString, default: 'min(30rem, calc(100% - 2.5rem))' },
  'popup-offset':     { key: 'popupOffset',     parse: asNumber, default: 14 },
  'search-radius':    { key: 'searchRadius',    parse: asNumber, default: 25 },
  'filter-mode':      { key: 'filterMode',      parse: asString, default: 'highlight' },
  'geocode-viewbox':  { key: 'geocodeViewbox',  parse: asString, default: '-73.5,44.5,-68.5,41.0' },
  'geocode-country':  { key: 'geocodeCountry',  parse: asString, default: 'us' },
  'searching-text':   { key: 'searchingText',   parse: asString, default: 'Searching…' },
  'empty-text':       { key: 'emptyText',       parse: asString, default: 'No Beefs here. 😞' },
  'item-noun':        { key: 'itemNoun',        parse: asString, default: 'shop' },
  // Shown in [data-map-element="locate-status"] after "use my location" (GPS).
  // A typed address shows what was typed instead.
  'location-label':   { key: 'locationLabel',   parse: asString, default: 'Your location' },

  // Marker appearance. These are written to the viewport as CSS custom
  // properties, so the stylesheet stays the single source of truth for how they
  // are used — see map-embed.css.
  'marker-image':        { key: 'markerImage',       parse: asString, default: null },
  'marker-size':         { key: 'markerSize',        parse: asString, default: null },
  'marker-color':        { key: 'markerColor',       parse: asString, default: null },
  'marker-active-scale': { key: 'markerActiveScale', parse: asString, default: null },

  // Popup content.
  'popup-omit':       { key: 'popupOmit',       parse: asString, default: '.map_town-name' },
  'popup-actions':    { key: 'popupActions',    parse: asBool,   default: true },
  'premium':          { key: 'premiumSeal',     parse: asString, default: 'all' },
  // MapLibre moves focus into the popup on open, which lands on the first link
  // and paints a focus ring on it for mouse users. Off by default; set true to
  // restore the keyboard-friendly behaviour.
  'popup-focus':      { key: 'popupFocus',      parse: asBool,   default: false },
  'directions-label': { key: 'directionsLabel', parse: asString, default: 'Directions' },
  'order-label':      { key: 'orderLabel',      parse: asString, default: 'Order Now' },
};

// CSS custom properties driven by config, so a Designer attribute can restyle
// the marker without touching this file.
const MARKER_STYLE_VARS = {
  markerImage:       '--map-marker-image',
  markerSize:        '--map-marker-size',
  markerColor:       '--map-marker-color',
  markerActiveScale: '--map-marker-active-scale',
};

function asString(raw) { return raw; }

function asNumber(raw) {
  const n = typeof raw === 'number' ? raw : parseFloat(raw);
  return Number.isFinite(n) ? n : undefined;
}

function asBool(raw) {
  if (typeof raw === 'boolean') return raw;
  const s = String(raw).trim().toLowerCase();
  if (s === 'true' || s === '1' || s === 'yes') return true;
  if (s === 'false' || s === '0' || s === 'no') return false;
  return undefined;
}

// Accepts "lng,lat" from an attribute or [lng, lat] from the head config.
function asLngLat(raw) {
  const parts = Array.isArray(raw) ? raw : String(raw).split(',');
  if (parts.length !== 2) return undefined;
  const lng = parseFloat(parts[0]);
  const lat = parseFloat(parts[1]);
  if (!Number.isFinite(lng) || !Number.isFinite(lat)) return undefined;
  return [lng, lat];
}

function readConfig(mapEl) {
  const head = window.NSBH_MAP_CONFIG || {};
  const config = {};

  for (const [suffix, spec] of Object.entries(CONFIG_SCHEMA)) {
    const attr = mapEl.getAttribute(`data-map-${suffix}`);
    let value;

    // A present-but-empty attribute is deliberate: blanking data-map-popup-omit
    // in Designer means "omit nothing", not "use the default". Parsers that
    // can't make sense of an empty string return undefined and fall through.
    if (attr !== null) {
      value = spec.parse(attr.trim());
      if (value === undefined) {
        console.warn(`[cms-map] ignoring unparseable data-map-${suffix}="${attr}"`);
      }
    }
    if (value === undefined && head[spec.key] !== undefined) {
      value = spec.parse(head[spec.key]);
      if (value === undefined) {
        console.warn(`[cms-map] ignoring unparseable NSBH_MAP_CONFIG.${spec.key}`, head[spec.key]);
      }
    }
    config[spec.key] = value === undefined ? spec.default : value;
  }

  return config;
}

// --- dependencies --------------------------------------------------------

async function loadDependencies() {
  if (maplibregl && distance) return;
  const [{ default: maplibreDefault }, { default: distanceDefault }] = await Promise.all([
    import(MAPLIBRE_URL),
    import(TURF_DISTANCE_URL),
  ]);
  maplibregl = maplibreDefault;
  distance = distanceDefault;
}

// --- boot ----------------------------------------------------------------

function boot() {
  const mapEl = document.querySelector('[data-map-element="viewport"]');
  if (!mapEl) return;

  const config = readConfig(mapEl);
  initStatusElements();
  wireSettingsPanel();
  resolveMarkerImageElement(config);
  applyMarkerStyles(mapEl, config);

  const items = collectItems();
  if (!items.length) {
    console.warn('[cms-map] No [data-map-element="item"] nodes with data-lat/data-lng found.');
  }

  // Cooperative gestures and scroll-zoom=false both stop a plain scroll from
  // zooming, but they don't compose: cooperative gestures gates the scroll-zoom
  // handler behind a modifier (ctrl/⌘ on desktop, a second finger on touch), so
  // it needs that handler enabled. Turning scroll-zoom off would leave the
  // gesture hint telling users to ctrl+scroll while nothing happens. When both
  // are set, cooperative gestures wins.
  let scrollZoom = config.scrollZoom;
  if (config.cooperativeGestures && !scrollZoom) {
    console.warn('[cms-map] data-map-cooperative-gestures overrides data-map-scroll-zoom="false" — cooperative gestures already block a plain scroll and need scroll-zoom enabled for the two-finger / ctrl+scroll gesture to work.');
    scrollZoom = true;
  }

  const map = new maplibregl.Map({
    container: mapEl,
    style: config.style,
    center: config.center,
    zoom: config.zoom,
    scrollZoom,
    cooperativeGestures: config.cooperativeGestures,
    attributionControl: { compact: true },
  });

  if (config.navControl !== 'none') {
    map.addControl(new maplibregl.NavigationControl({ showCompass: false }), config.navControl);
  }

  map.on('movestart', () => mapEl.classList.add('is-moving'));
  map.on('moveend',   () => mapEl.classList.remove('is-moving'));

  map.on('load', () => {
    // Defensive: if the container's final width settles after init (common when
    // the map is a flex child), match the canvas to it before fitting bounds.
    map.resize();
    const markers = addMarkers(map, items, config);
    wireListSync(items, markers, map, config);
    wireGeoSearch(items, markers, map, config);
    wireSettingsControls(items, markers, map, config);
    if (items.length && config.fitOnLoad) fitToMarkers(map, items, config);
  });
}

// --- settings panel -------------------------------------------------------
//
// Above 991px the settings panel is a normal column beside the map and nothing
// here applies. At 991px and below it is a dialog: the opener button shows it,
// focus moves inside, Tab stays inside, Escape or the backdrop or the close
// button dismiss it, and focus returns to the opener. The panel is marked
// data-map-panel by this code, so with no JavaScript it just stays visible.
const PANEL_NARROW = '(max-width: 991px)';

function wireSettingsPanel() {
  const opener = document.querySelector('[data-map-element="quick-picks-open"]');
  const form = document.querySelector('[data-map-element="quick-picks"]');
  if (!opener || !form) return;

  const panel = form.closest('.w-form') || form.parentElement;
  panel.setAttribute('data-map-panel', '');
  if (!panel.id) panel.id = 'cms-map-settings-panel';

  const narrow = window.matchMedia(PANEL_NARROW);
  const label = opener.getAttribute('aria-label') || 'Search settings';

  const backdrop = document.createElement('div');
  backdrop.className = 'cms-map-panel-backdrop';
  backdrop.hidden = true;
  document.body.appendChild(backdrop);

  const closeBtn = document.createElement('button');
  closeBtn.type = 'button';
  closeBtn.className = 'cms-map-panel-close';
  closeBtn.setAttribute('aria-label', `Close ${label.toLowerCase()}`);
  closeBtn.textContent = '\u00d7';
  panel.insertBefore(closeBtn, panel.firstChild);

  opener.setAttribute('aria-haspopup', 'dialog');
  opener.setAttribute('aria-controls', panel.id);
  opener.setAttribute('aria-expanded', 'false');

  const isOpen = () => panel.classList.contains('is-open');

  const focusable = () => Array.from(panel.querySelectorAll(
    'a[href], button:not([disabled]), input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])'
  )).filter((el) => el.offsetParent !== null);

  function open() {
    if (!narrow.matches || isOpen()) return;
    panel.classList.add('is-open');
    panel.setAttribute('role', 'dialog');
    panel.setAttribute('aria-modal', 'true');
    panel.setAttribute('aria-label', label);
    backdrop.hidden = false;
    document.documentElement.classList.add('cms-map-panel-open');
    opener.setAttribute('aria-expanded', 'true');
    closeBtn.focus();
  }

  function close(returnFocus = true) {
    if (!isOpen()) return;
    panel.classList.remove('is-open');
    panel.removeAttribute('role');
    panel.removeAttribute('aria-modal');
    panel.removeAttribute('aria-label');
    backdrop.hidden = true;
    document.documentElement.classList.remove('cms-map-panel-open');
    opener.setAttribute('aria-expanded', 'false');
    if (returnFocus) opener.focus();
  }

  opener.addEventListener('click', () => (isOpen() ? close() : open()));
  closeBtn.addEventListener('click', () => close());
  backdrop.addEventListener('click', () => close());

  document.addEventListener('keydown', (e) => {
    if (!isOpen()) return;
    if (e.key === 'Escape') { e.preventDefault(); close(); return; }
    if (e.key !== 'Tab') return;
    const items = focusable();
    if (!items.length) return;
    const first = items[0];
    const last = items[items.length - 1];
    if (e.shiftKey && document.activeElement === first) { e.preventDefault(); last.focus(); }
    else if (!e.shiftKey && document.activeElement === last) { e.preventDefault(); first.focus(); }
  });

  // Growing past the breakpoint turns the dialog back into the desktop column.
  narrow.addEventListener('change', (e) => { if (!e.matches) close(false); });
}

// Designer-native pin image: drop an Image element in Webflow (pick the asset
// from the Asset Manager), set Display: None on it, and tag it
//   data-map-element="marker-image"
// The script reads its src and uses it as the marker, so the pin can be swapped
// in the Designer without touching code or pasting a URL. An explicit
// data-map-marker-image attribute (or NSBH_MAP_CONFIG.markerImage) still wins.
function resolveMarkerImageElement(config) {
  if (config.markerImage) return; // explicit attribute / head config takes priority
  const el = document.querySelector('[data-map-element="marker-image"]');
  if (!el) return;
  const src = el.currentSrc || el.src || el.getAttribute('src') || el.dataset.src || '';
  if (src) {
    config.markerImage = src;
  } else {
    console.warn('[cms-map] [data-map-element="marker-image"] has no src to read.');
  }
  el.style.display = 'none'; // it is a source, never shown on the page
}

// MapLibre appends markers and popups inside the viewport element, so custom
// properties set here are inherited by both.
function applyMarkerStyles(mapEl, config) {
  for (const [key, cssVar] of Object.entries(MARKER_STYLE_VARS)) {
    const value = config[key];
    if (value === null || value === undefined || value === '') continue;
    mapEl.style.setProperty(cssVar, key === 'markerImage' ? asCssImage(value) : value);
  }
}

// Accepts either a bare image URL or a ready-made CSS value (url(...),
// linear-gradient(...), none). Bare URLs get wrapped and quoted.
function asCssImage(value) {
  const v = value.trim();
  if (/^(url\(|none$|linear-gradient\(|radial-gradient\()/i.test(v)) return v;
  return `url("${v.replace(/"/g, '\\"')}")`;
}

function collectItems() {
  const nodes = document.querySelectorAll('[data-map-element="item"]');
  const items = [];
  const seen = new Set();
  for (const el of nodes) {
    const lat = parseFloat(el.dataset.lat);
    const lng = parseFloat(el.dataset.lng);
    if (!Number.isFinite(lat) || !Number.isFinite(lng)) continue;
    const id = el.dataset.id || `item-${items.length}`;
    if (seen.has(id)) continue;
    seen.add(id);
    items.push({ id, lat, lng, el });
  }
  return items;
}

// animate is for fits the visitor asks for (a region button); the first fit on
// load stays instant. Reduced-motion visitors always get the instant version.
function fitToMarkers(map, items, config, animate = false) {
  if (!items.length) return;
  const reduceMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  const duration = animate && !reduceMotion ? 800 : 0;
  if (items.length === 1) {
    map.easeTo({ center: [items[0].lng, items[0].lat], zoom: config.singleZoom, duration });
    return;
  }
  const bounds = new maplibregl.LngLatBounds();
  for (const it of items) bounds.extend([it.lng, it.lat]);
  map.fitBounds(bounds, { padding: config.fitPadding, duration, maxZoom: config.fitMaxZoom });
}

function addMarkers(map, items, config) {
  const byId = new Map();
  for (const it of items) {
    const markerEl = document.createElement('button');
    markerEl.type = 'button';
    markerEl.className = 'cms-map-marker';
    if (it.el.dataset.mapKind === 'destination') markerEl.classList.add('is-destination');
    const d = it.el.dataset;
    const label = d.displayName || d.name || it.el.textContent.trim().split('\n')[0] || 'Location';
    markerEl.setAttribute('aria-label', label);

    const popup = new maplibregl.Popup({
      offset: config.popupOffset,
      closeButton: true,
      // Fixed above the dot. With auto anchoring the card flips below the dot
      // while the map is still moving, which reads as a jump.
      anchor: 'bottom',
      maxWidth: config.popupMaxWidth,
      focusAfterOpen: config.popupFocus,
    }).setHTML(buildPopupHtml(it.el, config));

    const marker = new maplibregl.Marker({ element: markerEl, anchor: 'center' })
      .setLngLat([it.lng, it.lat])
      .setPopup(popup)
      .addTo(map);

    // MapLibre labels every marker "Map marker" when it is added, replacing the
    // name set above, so the place's own name is applied last.
    markerEl.setAttribute('aria-label', label);

    byId.set(it.id, { marker, markerEl, popup, item: it });
  }

  for (const entry of byId.values()) {
    entry.markerEl.addEventListener('click', (e) => {
      e.stopPropagation();
      setActive({ items, markers: byId, activeId: entry.item.id, scrollList: true });
      focusMarker(map, byId, entry, config);
    });
  }

  return byId;
}

// Opens the clicked dot's card and flies the map so the CARD sits centred in the
// map, with the dot just below it. The card is measured after it opens, so the
// offset follows the real card height instead of a fixed number. Clicking the
// dot of an open card closes it and leaves the camera alone. A non-zero
// data-map-focus-offset still overrides the measured value.
function focusMarker(map, markers, entry, config) {
  const wasOpen = entry.popup.isOpen();
  openExclusive(markers, entry.marker);
  if (wasOpen) return;

  const el = entry.popup.getElement();
  const cardHeight = el ? el.offsetHeight : 0;
  const mapHeight = map.getContainer().clientHeight;
  const measured = config.popupOffset + cardHeight / 2;
  // Keep the dot itself inside the map even when the card is tall.
  const y = config.focusOffset > 0 ? config.focusOffset : Math.max(0, Math.min(measured, mapHeight / 2 - 24));

  const reduceMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  map.flyTo({
    center: entry.marker.getLngLat(),
    zoom: Math.max(map.getZoom(), config.focusZoom),
    offset: [0, y],
    speed: 1.1,
    ...(reduceMotion ? { duration: 0 } : {}),
  });
}

function openExclusive(markers, targetMarker) {
  const isAlreadyOpen = targetMarker.getPopup().isOpen();
  for (const { marker } of markers.values()) {
    if (marker.getPopup().isOpen()) marker.getPopup().remove();
  }
  if (!isAlreadyOpen) targetMarker.togglePopup();
}

// Static card templates. Each [data-map-template="shop|destination"] block holds
// one designed card, marked with data-map-card, and its fields are marked with
// data-map-slot. The popup clones that card and fills the slots from the data
// attributes on the hidden Collection Item. Templates live outside every
// Collection List and stay visible in Designer.
const SLOT_TEXT = {
  shop:        { name: (d) => d.displayName || d.name, region: (d) => d.regionName, town: (d) => d.townName,
                 description: (d) => d.description, address: (d) => d.address },
  destination: { name: (d) => d.name, region: (d) => d.regionName, description: (d) => d.description },
};

function buildCardFromTemplate(item, config) {
  const kind = item.dataset.mapKind === 'destination' ? 'destination' : 'shop';
  const tpl = document.querySelector(`[data-map-template="${kind}"]`);
  const source = tpl && (tpl.querySelector('[data-map-card]') || tpl.firstElementChild);
  if (!source) return null;

  const card = source.cloneNode(true);
  card.classList.add('cms-map-popup-card');
  card.removeAttribute('id');
  const d = item.dataset;

  // MapLibre draws its own close button, and the card needs no popover chrome.
  for (const el of card.querySelectorAll('[data-shop-popover-close], [data-shop-popover-backdrop]')) el.remove();

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
  }

  if (kind === 'destination') fillImage(card, item);

  // Premium seal. data-map-premium on the map div picks the rule:
  //   all  (default) show the seal on every shop card, whatever the CMS says
  //   cms  only on shops marked Premium (the hidden item then holds a
  //        [data-map-field="premium"] element, present only for those shops)
  //   none never show it
  if (kind === 'shop') {
    const mode = config.premiumSeal;
    const show = mode === 'all' || (mode === 'cms' && item.querySelector('[data-map-field="premium"]'));
    if (!show) for (const el of card.querySelectorAll('[data-map-slot="premium"]')) el.remove();
  }

  // Slots with no data source yet (tags, nearby shops) are dropped from the clone
  // rather than shown as template placeholders.
  for (const slot of ['tags', 'nearby']) {
    for (const el of card.querySelectorAll(`[data-map-slot="${slot}"]`)) el.remove();
  }
  for (const el of card.querySelectorAll('[data-map-slot]')) el.removeAttribute('data-map-slot');

  return card;
}

// An image field cannot bind to an attribute, so the hidden Collection Item
// carries an <img data-map-field="image"> bound to it instead. Its src goes onto
// the template's image slot; with no image, the slot and its now-empty wrapper
// are removed so the card has no blank band.
function fillImage(card, item) {
  const source = item.querySelector('img[data-map-field="image"]');
  let src = source && (source.getAttribute('src') || '').trim();
  // An empty CMS image falls back to the asset the element was created with.
  // Webflow flags that case with w-dyn-bind-empty; data-map-placeholder (the
  // fallback asset's id) is a second check in case the class is ever dropped.
  const placeholder = source && source.dataset.mapPlaceholder;
  if (source && source.classList.contains('w-dyn-bind-empty')) src = '';
  else if (src && placeholder && src.includes(placeholder)) src = '';
  for (const img of card.querySelectorAll('[data-map-slot="image"]')) {
    const wrapper = img.parentElement && img.parentElement !== card ? img.parentElement : null;
    if (src) {
      img.setAttribute('src', src);
      img.setAttribute('alt', source.getAttribute('alt') || '');
      img.removeAttribute('srcset');
      img.removeAttribute('sizes');
      img.setAttribute('loading', 'lazy');
    } else {
      img.remove();
      if (wrapper && !wrapper.children.length) wrapper.remove();
    }
  }
}

// Sets a slot link's href, or removes the link when there is nowhere to go. The
// page's popover script hides empty-href links on the template itself, so any
// inline display it left behind is cleared on the clone.
function fillLink(card, slot, href, external = true) {
  for (const a of card.querySelectorAll(`[data-map-slot="${slot}"]`)) {
    a.style.removeProperty('display');
    if (!href) { a.remove(); continue; }
    a.setAttribute('href', href);
    if (external) { a.target = '_blank'; a.rel = 'noopener noreferrer'; }
  }
}

// The popup is a clone of a static template card when one exists, and of the
// list item otherwise (the earlier behaviour, kept as a fallback). In the
// fallback, some elements are dropped and the action links are appended.
function buildPopupHtml(listItemEl, config) {
  const card = buildCardFromTemplate(listItemEl, config);
  if (card) return card.outerHTML;

  const clone = listItemEl.cloneNode(true);
  clone.classList.add('cms-map-popup-card');

  // Strip webflow-only wrapper artifacts so the card reads cleanly in the popup.
  clone.removeAttribute('role');
  clone.removeAttribute('data-id');
  for (const attr of LINK_ATTRS) clone.removeAttribute(attr.attribute);

  removeOmitted(clone, config.popupOmit);

  if (config.popupActions) {
    const actions = buildActions(listItemEl, config);
    if (actions) clone.appendChild(actions);
  }

  return clone.outerHTML;
}

// Elements can be excluded from the popup two ways: a CSS selector in
// data-map-popup-omit, or data-map-omit="popup" on the element itself. The
// attribute survives class renames, so prefer it for anything long-lived.
function removeOmitted(clone, selector) {
  const selectors = ['[data-map-omit="popup"]'];
  if (selector && selector.trim()) selectors.push(selector.trim());

  for (const sel of selectors) {
    let matches;
    try {
      matches = clone.querySelectorAll(sel);
    } catch {
      console.warn(`[cms-map] data-map-popup-omit is not a valid CSS selector: "${sel}"`);
      continue;
    }
    for (const el of matches) el.remove();
  }
}

// Where each action's URL comes from, in priority order. Bound to CMS fields as
// data attributes on the Collection Item in Designer.
const LINK_ATTRS = [
  { attribute: 'data-google-map-link', dataset: 'googleMapLink' },
  { attribute: 'data-directions-link', dataset: 'directionsLink' },
  { attribute: 'data-website',         dataset: 'website' },
];

// Only http(s) links are allowed through — CMS fields are free text, and a
// javascript: URL in a popup would run on click.
function safeUrl(raw) {
  if (!raw) return null;
  const url = String(raw).trim();
  if (!url) return null;
  if (!/^https?:\/\//i.test(url)) {
    console.warn(`[cms-map] ignoring non-http(s) link: "${url.slice(0, 60)}"`);
    return null;
  }
  return url;
}

function buildActions(listItemEl, config) {
  const d = listItemEl.dataset;
  // Google Business listing wins; the plain directions link is the fallback.
  const directionsHref = safeUrl(d.googleMapLink) || safeUrl(d.directionsLink);
  const orderHref = safeUrl(d.website);
  if (!directionsHref && !orderHref) return null;

  const wrap = listItemEl.ownerDocument.createElement('div');
  wrap.className = 'cms-map-popup-actions';

  if (directionsHref) wrap.appendChild(buildAction(listItemEl, directionsHref, config.directionsLabel, 'is-directions'));
  if (orderHref) wrap.appendChild(buildAction(listItemEl, orderHref, config.orderLabel, 'is-order'));

  return wrap;
}

function buildAction(listItemEl, href, label, modifier) {
  const a = listItemEl.ownerDocument.createElement('a');
  a.className = `cms-map-popup-action ${modifier}`;
  a.href = href;
  a.target = '_blank';
  a.rel = 'noopener noreferrer';
  a.textContent = label;
  return a;
}

function setActive({ items, markers, activeId, scrollList }) {
  for (const { markerEl, item } of markers.values()) {
    const on = item.id === activeId;
    markerEl.classList.toggle('is-active', on);
    item.el.classList.toggle('is-active', on);
  }
  if (scrollList && activeId) {
    const entry = markers.get(activeId);
    if (entry) entry.item.el.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
  }
}

function wireListSync(items, markers, map, config) {
  for (const { item } of markers.values()) {
    const onEnter = () => setActive({ items, markers, activeId: item.id, scrollList: false });
    const onLeave = () => setActive({ items, markers, activeId: null, scrollList: false });
    item.el.addEventListener('mouseenter', onEnter);
    item.el.addEventListener('mouseleave', onLeave);
    item.el.addEventListener('focusin', onEnter);
    item.el.addEventListener('click', (e) => {
      if (e.target.closest('a, button')) return; // let real links/buttons through
      setActive({ items, markers, activeId: item.id, scrollList: false });
      focusMarker(map, markers, markers.get(item.id), config);
    });
  }
}

// --- geo search ----------------------------------------------------------

function wireGeoSearch(items, markers, map, config) {
  const input  = document.querySelector('[data-map-element="search-input"]');
  const submit = document.querySelector('[data-map-element="search-submit"]');
  const clear  = document.querySelector('[data-map-element="search-clear"]');
  const status = document.querySelector('[data-map-element="search-status"]');
  if (!input && !submit) return; // no search UI on page; skip.

  const runSearch = async () => {
    const query = (input?.value || '').trim();
    if (!query) return;
    setStatus(status, config.searchingText);
    try {
      const hit = await geocodeQuery(query, config);
      if (!hit) { setStatus(status, `No match for “${query}”.`); return; }
      applyOrigin({ items, markers, map, status, config }, hit, query);
    } catch (err) {
      console.error('[cms-map] geo-search failed', err);
      setStatus(status, 'Search failed. Try again.');
    }
  };

  submit?.addEventListener('click', (e) => { e.preventDefault(); runSearch(); });
  input?.addEventListener('keydown', (e) => { if (e.key === 'Enter') { e.preventDefault(); runSearch(); } });
  clear?.addEventListener('click', (e) => {
    e.preventDefault();
    if (input) input.value = '';
    closeAllPopups(markers);
    clearOrigin({ items, markers, map, status, config });
  });
}

// --- settings controls ----------------------------------------------------
//
// The panel's own controls, all optional and found by data-map-element:
//   region            buttons with data-slug; click flies to that region's dots
//   region-clear      deselects the region and shows the whole map again
//   destinations-toggle  role="switch" that shows or hides the destination dots
//   search-radius     <select>; each option's miles come from its value, or from
//                     its label when the value is empty ("10 miles")
//   radius-reset      puts the radius back to the configured default
//   locate            "use my location" button (asks the browser, on click only)
//   locate-input      address field, Enter looks it up
//   locate-clear      forgets the place and shows everything again
// Tag highlight is not wired yet (shop items carry no tag data).

// The place a radius is measured from, shared by the search bar and the panel.
// source is 'locate' when it came from "use my location" (the GPS button or the
// address field), 'search' when it came from the search bar.
const searchState = { from: null, label: '', source: null };
const layerState = { showDestinations: true, region: null };

// Two text elements are written to, and each keeps the text it has in Designer:
//   search-status  empty on the published page (its Designer text is a styling
//                  placeholder); filled with search results.
//   locate-status  "Not set" until a place is chosen with "use my location".
const locationState = { el: null, fallback: '' };

function initStatusElements() {
  const status = document.querySelector('[data-map-element="search-status"]');
  if (status) {
    status.textContent = '';
    // map-embed.css keeps the placeholder hidden until this point, so it never flashes.
    status.setAttribute('data-map-ready', '');
  }
  const location = document.querySelector('[data-map-element="locate-status"]');
  if (location) {
    locationState.el = location;
    locationState.fallback = location.textContent;
  }
}

function showLocation() {
  if (!locationState.el) return;
  const chosen = searchState.source === 'locate' && searchState.label;
  locationState.el.textContent = chosen ? searchState.label : locationState.fallback;
}

const isDestination = (it) => it.el.dataset.mapKind === 'destination';

function closeAllPopups(markers) {
  for (const { marker } of markers.values()) {
    if (marker.getPopup().isOpen()) marker.getPopup().remove();
  }
}

// Miles for one <option>. The value wins; an empty value falls back to the number
// in its label, so "10 miles" works however the option was entered in Designer.
function optionMiles(opt) {
  const fromValue = parseFloat(opt.value);
  return Number.isFinite(fromValue) ? fromValue : parseFloat(opt.textContent);
}

// The page may carry more than one radius <select> (the search bar and the
// settings panel). They all show the same radius: changing one moves the others.
const radiusState = { miles: null };
const radiusSelects = () => Array.from(document.querySelectorAll('[data-map-element="search-radius"]'));
const readRadius = (config) => (Number.isFinite(radiusState.miles) ? radiusState.miles : config.searchRadius);

// Selects the option for these miles in every radius <select>. The list keeps the
// order it has in Designer (ascending); only the selected option changes.
function setRadius(miles) {
  radiusState.miles = miles;
  for (const select of radiusSelects()) {
    const i = Array.from(select.options).findIndex((o) => optionMiles(o) === miles);
    if (i >= 0) select.selectedIndex = i;
  }
}

function applyOrigin(ctx, from, label, source = 'search') {
  searchState.from = from;
  searchState.label = label;
  searchState.source = source;
  showLocation();
  applyRadiusFilter({ ...ctx, from, miles: readRadius(ctx.config), label });
}

// A new radius measures again from the place already chosen.
function reapplyOrigin(ctx) {
  if (searchState.from) applyOrigin(ctx, searchState.from, searchState.label, searchState.source);
}

function clearOrigin(ctx) {
  searchState.from = null;
  searchState.label = '';
  searchState.source = null;
  showLocation();
  resetFilter(ctx);
}

function wireSettingsControls(items, markers, map, config) {
  const status = document.querySelector('[data-map-element="search-status"]');
  const ctx = { items, markers, map, status, config };
  const eligible = () => items.filter((it) => layerState.showDestinations || !isDestination(it));

  // Regions: one at a time; pressing the active one again goes back to everything.
  const regionButtons = Array.from(document.querySelectorAll('[data-map-element="region"]'));
  const selectRegion = (slug) => {
    layerState.region = slug;
    for (const b of regionButtons) b.setAttribute('aria-pressed', String(b.dataset.slug === slug));
    closeAllPopups(markers);
    const pool = eligible();
    const inRegion = slug ? pool.filter((it) => it.el.dataset.region === slug) : pool;
    fitToMarkers(map, inRegion.length ? inRegion : pool, config, true);
  };
  for (const btn of regionButtons) {
    btn.addEventListener('click', (e) => {
      e.preventDefault();
      selectRegion(layerState.region === btn.dataset.slug ? null : btn.dataset.slug);
    });
  }
  // Clear deselects the region and returns the map to the view of everything.
  document.querySelector('[data-map-element="region-clear"]')?.addEventListener('click', (e) => {
    e.preventDefault();
    selectRegion(null);
  });

  // Destinations: hides only the destination dots. Shops, search and regions go
  // on working; a region fit afterwards leaves destinations out while it is off.
  const toggle = document.querySelector('[data-map-element="destinations-toggle"]');
  if (toggle) {
    if (!toggle.hasAttribute('tabindex')) toggle.tabIndex = 0;
    const setShown = (on) => {
      layerState.showDestinations = on;
      toggle.setAttribute('aria-checked', String(on));
      for (const { marker, markerEl, item } of markers.values()) {
        if (!isDestination(item)) continue;
        markerEl.classList.toggle('is-layer-off', !on);
        if (!on && marker.getPopup().isOpen()) marker.getPopup().remove();
      }
    };
    setShown(toggle.getAttribute('aria-checked') !== 'false');
    toggle.addEventListener('click', (e) => { e.preventDefault(); setShown(!layerState.showDestinations); });
    toggle.addEventListener('keydown', (e) => {
      if (e.key === ' ' || e.key === 'Enter') { e.preventDefault(); setShown(!layerState.showDestinations); }
    });
  }

  // Radius: every select shows the configured default to begin with, a change in
  // one carries to the others and re-applies to the place already found (no second
  // geocoder request), and Reset puts the default back.
  setRadius(config.searchRadius);
  for (const select of radiusSelects()) {
    select.addEventListener('change', () => {
      const opt = select.options[select.selectedIndex];
      const miles = opt ? optionMiles(opt) : NaN;
      setRadius(Number.isFinite(miles) ? miles : config.searchRadius);
      reapplyOrigin(ctx);
    });
  }
  document.querySelector('[data-map-element="radius-reset"]')?.addEventListener('click', (e) => {
    e.preventDefault();
    setRadius(config.searchRadius);
    reapplyOrigin(ctx);
  });

  // Location: the browser is asked only when the visitor presses the button.
  const locateInput = document.querySelector('[data-map-element="locate-input"]');
  const searchInput = document.querySelector('[data-map-element="search-input"]');

  document.querySelector('[data-map-element="locate"]')?.addEventListener('click', (e) => {
    e.preventDefault();
    if (!navigator.geolocation) { setStatus(status, 'Location is not available in this browser.'); return; }
    setStatus(status, config.searchingText);
    navigator.geolocation.getCurrentPosition(
      (pos) => {
        if (locateInput) locateInput.value = '';
        applyOrigin(ctx, { lat: pos.coords.latitude, lng: pos.coords.longitude }, config.locationLabel, 'locate');
      },
      () => setStatus(status, 'Could not get your location. Enter an address instead.'),
      { enableHighAccuracy: false, timeout: 10000, maximumAge: 300000 },
    );
  });

  // The field sits inside a form, so Enter is caught before the browser (or
  // Webflow) can submit it.
  locateInput?.addEventListener('keydown', async (e) => {
    if (e.key !== 'Enter') return;
    e.preventDefault();
    const query = locateInput.value.trim();
    if (!query) return;
    setStatus(status, config.searchingText);
    try {
      const hit = await geocodeQuery(query, config);
      if (!hit) { setStatus(status, `No match for “${query}”.`); return; }
      applyOrigin(ctx, hit, query, 'locate');
    } catch (err) {
      console.error('[cms-map] locate failed', err);
      setStatus(status, 'Search failed. Try again.');
    }
  });

  document.querySelector('[data-map-element="locate-clear"]')?.addEventListener('click', (e) => {
    e.preventDefault();
    if (locateInput) locateInput.value = '';
    if (searchInput) searchInput.value = '';
    closeAllPopups(markers);
    clearOrigin(ctx);
  });
}

// Note: Nominatim's usage policy asks for a descriptive User-Agent, but browsers
// forbid scripts from setting that header on fetch — it is dropped silently. The
// Referer header (the site domain) is what actually identifies this traffic.
// If volume ever grows, proxy through a Cloudflare Worker that sets a real UA.
async function geocodeQuery(q, config) {
  const params = new URLSearchParams({
    q,
    format: 'json',
    limit: '1',
    countrycodes: config.geocodeCountry,
    viewbox: config.geocodeViewbox,
  });
  const res = await fetch(`${NOMINATIM_URL}?${params}`, { headers: { 'Accept': 'application/json' } });
  if (!res.ok) throw new Error(`Nominatim HTTP ${res.status}`);
  const json = await res.json();
  if (!Array.isArray(json) || !json.length) return null;
  return { lat: parseFloat(json[0].lat), lng: parseFloat(json[0].lon), label: json[0].display_name };
}

// filterMode 'highlight' (default): every marker and list item stays visible; the
//   map re-fits to the matches and the status line reports the count.
// filterMode 'filter': non-matching markers and list items are hidden outright.
function applyRadiusFilter({ items, markers, map, from, miles, status, label, config }) {
  const origin = [from.lng, from.lat];
  const keep = new Set();
  let shops = 0;
  for (const it of items) {
    // Destination dots that are switched off take no part in the search.
    if (isDestination(it) && !layerState.showDestinations) continue;
    const d = distance(origin, [it.lng, it.lat], { units: 'miles' });
    if (d <= miles) {
      keep.add(it.id);
      if (!isDestination(it)) shops += 1;
    }
  }

  const noun = config.itemNoun;
  setStatus(status, shops
    ? `${shops} ${noun}${shops === 1 ? '' : 's'} within ${miles} mi of ${label.split(',')[0]}.`
    : config.emptyText);

  if (config.filterMode === 'filter') setVisible({ markers, keep });

  if (keep.size) {
    const bounds = new maplibregl.LngLatBounds();
    bounds.extend(origin);
    for (const it of items) if (keep.has(it.id)) bounds.extend([it.lng, it.lat]);
    map.fitBounds(bounds, { padding: config.fitPadding, maxZoom: config.fitMaxZoom });
  } else {
    map.flyTo({ center: origin, zoom: 10 });
  }
}

// keep === null means "show everything".
function setVisible({ markers, keep }) {
  for (const { markerEl, item } of markers.values()) {
    const on = keep === null || keep.has(item.id);
    markerEl.classList.toggle('is-hidden', !on);
    item.el.classList.toggle('is-hidden', !on);
  }
}

function resetFilter({ items, markers, map, status, config }) {
  setStatus(status, '');
  if (config.filterMode === 'filter') setVisible({ markers, keep: null });
  fitToMarkers(map, items.filter((it) => layerState.showDestinations || !isDestination(it)), config);
}

function setStatus(el, text) { if (el) el.textContent = text; }

// --- bootstrap -----------------------------------------------------------

async function start() {
  try {
    await loadDependencies();
    boot();
  } catch (err) {
    console.error('[cms-map] failed to load dependencies', err);
  }
}

if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', start, { once: true });
} else {
  start();
}
