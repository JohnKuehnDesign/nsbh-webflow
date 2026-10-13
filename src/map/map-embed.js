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
//   [data-map-element="suggest"]       Dropdown wrapper under the input, hidden until used (optional)
//   [data-map-element="suggest-list"]  The listbox inside it, filled by the script (optional)
//   [data-map-template="suggestion"]   Sample rows to clone: data-map-suggest="place|shop"
//                                      with data-map-slot="name|label|address" (optional)
//
// Configuration — see CONFIG_SCHEMA below. Resolution order, first match wins:
//   1. data-map-* attribute on the viewport element   (set in Designer, per page)
//   2. window.NSBH_MAP_CONFIG object                  (set in page head code)
//   3. built-in default                               (matches the original hard-coded value)
//
// Design decisions:
//   - Popups use the shared card from shop-card.js (load it first); without it
//     they show the place's name only.
//   - Zero build step: dependencies are loaded dynamically from esm.sh.

let maplibregl;
let distance;

const MAPLIBRE_URL = 'https://esm.sh/maplibre-gl@4.7.1';
const TURF_DISTANCE_URL = 'https://esm.sh/@turf/distance@7.1.0';

const NOMINATIM_URL = 'https://nominatim.openstreetmap.org/search';
const NOMINATIM_REVERSE_URL = 'https://nominatim.openstreetmap.org/reverse';

// Where focus goes back to when a card that was opened from the keyboard closes.
const popupFocus = { returnTo: null, quiet: false };

// Read while the script first runs: it is how the region shapes file (next to this
// one on the CDN) is found without a hard-coded version.
const SCRIPT_URL = document.currentScript?.src || '';

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
  // Where each Shop Tag's page lives; the tag's slug is added to the end. Those
  // pages list the shops that carry the tag (see "Shop tags" below).
  'tag-page-path':    { key: 'tagPagePath',     parse: asString, default: '/shop-tags/' },
  'geocode-viewbox':  { key: 'geocodeViewbox',  parse: asString, default: '-73.5,44.5,-68.5,41.0' },
  'geocode-country':  { key: 'geocodeCountry',  parse: asString, default: 'us' },
  'searching-text':   { key: 'searchingText',   parse: asString, default: 'Searching…' },
  'empty-text':       { key: 'emptyText',       parse: asString, default: 'No Beefs here. 😞' },
  'item-noun':        { key: 'itemNoun',        parse: asString, default: 'shop' },
  // Shown in [data-map-element="locate-status"] after "use my location" (GPS).
  // A typed address shows what was typed instead.
  'location-label':   { key: 'locationLabel',   parse: asString, default: 'Your location' },

  // Region overlay (see "Region boundaries" below): the pressed region is tinted
  // with this colour. Opacity 0 turns the overlay off. The shapes file defaults to
  // regions.geojson beside this script; set region-shapes only to point elsewhere.
  'region-color':     { key: 'regionColor',     parse: asString, default: '#35798c' },
  'region-opacity':   { key: 'regionOpacity',   parse: asNumber, default: 0.2 },
  'region-shapes':    { key: 'regionShapes',    parse: asString, default: null },

  // Marker appearance. These are written to the viewport as CSS custom
  // properties, so the stylesheet stays the single source of truth for how they
  // are used — see map-embed.css.
  'marker-image':        { key: 'markerImage',       parse: asString, default: null },
  'marker-size':         { key: 'markerSize',        parse: asString, default: null },
  'marker-color':        { key: 'markerColor',       parse: asString, default: null },
  'marker-active-scale': { key: 'markerActiveScale', parse: asString, default: null },

  // Popup content.
  'premium':          { key: 'premiumSeal',     parse: asString, default: 'all' },
  // MapLibre moves focus into the popup on open, which lands on the first link
  // and paints a focus ring on it for mouse users. Off by default; set true to
  // restore the keyboard-friendly behaviour.
  'popup-focus':      { key: 'popupFocus',      parse: asBool,   default: false },
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

    // A present-but-empty attribute is taken as written. Parsers that can't make
    // sense of an empty string return undefined and fall through.
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
  initRegionShapes(config);
  initStatusElements();
  wireButtonLinks();
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
    wireEscapeToClose(mapEl, markers);
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
function fitDuration(animate) {
  const reduceMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  return animate && !reduceMotion ? 800 : 0;
}

function fitToBounds(map, bounds, config, animate = false) {
  map.fitBounds(bounds, { padding: config.fitPadding, duration: fitDuration(animate), maxZoom: config.fitMaxZoom });
}

function fitToMarkers(map, items, config, animate = false) {
  if (!items.length) return;
  const duration = fitDuration(animate);
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
    popup.on('open', () => {
      shopCard()?.fillTags(popup.getElement(), it.id, { tagPagePath: config.tagPagePath });
      shopCard()?.fillDistance(popup.getElement(), it);
      // Escape inside the card closes it.
      popup.getElement()?.addEventListener('keydown', (e) => {
        if (e.key === 'Escape') { e.stopPropagation(); popup.remove(); }
      });
    });
    popup.on('close', () => {
      const back = popupFocus.returnTo;
      popupFocus.returnTo = null;
      if (back && back.isConnected) {
        // Focus coming back is not a reason to reopen the search suggestions.
        popupFocus.quiet = true;
        back.focus({ preventScroll: true });
        popupFocus.quiet = false;
      }
    });

    const marker = new maplibregl.Marker({ element: markerEl, anchor: 'center' })
      .setLngLat([it.lng, it.lat])
      .setPopup(popup)
      .addTo(map);

    // MapLibre labels every marker "Map marker" when it is added, replacing the
    // name set above, so the place's own name is applied last.
    markerEl.setAttribute('aria-label', label);
    // 160-odd dots would otherwise sit between the search and the settings panel.
    // They stay clickable; keyboard visitors reach shops through the search and the
    // list below the map.
    markerEl.tabIndex = -1;

    byId.set(it.id, { marker, markerEl, popup, item: it });
  }

  for (const entry of byId.values()) {
    entry.markerEl.addEventListener('click', (e) => {
      e.stopPropagation();
      // A click with no pointer behind it (detail 0) came from the keyboard or an
      // assistive tool: move focus into the card, and back to the dot on close.
      const byKeyboard = e.detail === 0;
      entry.popup.options.focusAfterOpen = byKeyboard || config.popupFocus;
      setActive({ markers: byId, activeId: entry.item.id });
      focusMarker(map, byId, entry, config);
      if (byKeyboard && entry.popup.isOpen()) popupFocus.returnTo = entry.markerEl;
    });
    entry.markerEl.addEventListener('keydown', (e) => {
      if (e.key === 'Escape' && entry.popup.isOpen()) entry.popup.remove();
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

// The card itself is built by shop-card.js (window.NSBHShopCard), which loads before
// this file: it clones the [data-map-template="shop|destination"] card and fills it
// from the hidden Collection Item's data attributes. The same builder serves the
// region lists and other pages, so the card is designed once.
const shopCard = () => window.NSBHShopCard || null;

// The popup is the shared card from shop-card.js. Without it (or without a
// template on the page) the popup shows the place's name only.
function buildPopupHtml(listItemEl, config) {
  const html = shopCard()?.popupHtml(listItemEl, { premium: config.premiumSeal, tagPagePath: config.tagPagePath });
  if (html) return html;
  const name = document.createElement('div');
  name.className = 'cms-map-popup-card';
  name.textContent = listItemEl.dataset.displayName || listItemEl.dataset.name || '';
  return name.outerHTML;
}

// The open card's dot gets .is-active (drawn larger by map-embed.css).
function setActive({ markers, activeId }) {
  for (const { markerEl, item } of markers.values()) {
    markerEl.classList.toggle('is-active', item.id === activeId);
  }
}

// --- closing a card with Escape ---------------------------------------------
//
// A click on a dot leaves focus on the page, not the dot, so a key listener on the
// dot or the card is not enough. Escape on the map or the bare page closes whichever
// card is open. Escape elsewhere (a field, the suggestions) is left alone.
function wireEscapeToClose(mapEl, markers) {
  document.addEventListener('keydown', (e) => {
    if (e.key !== 'Escape' || e.defaultPrevented) return;
    const t = e.target;
    if (t !== document.body && t !== document.documentElement && !mapEl.contains(t)) return;
    for (const { popup } of markers.values()) {
      if (popup.isOpen()) { popup.remove(); break; }
    }
  });
}

// --- action links ---------------------------------------------------------
//
// Search, Clear, Use my location and Reset are links in Designer but act as
// buttons: say so to assistive tech, and let Space press them as a button does.
function wireButtonLinks() {
  const names = ['search-submit', 'search-clear', 'region-clear', 'tag-clear', 'locate-clear', 'locate', 'radius-reset'];
  for (const name of names) {
    for (const el of document.querySelectorAll(`[data-map-element="${name}"]`)) {
      if (el.tagName !== 'A') continue;
      if (!el.hasAttribute('role')) el.setAttribute('role', 'button');
      if (!el.hasAttribute('href') && !el.hasAttribute('tabindex')) el.tabIndex = 0;
      el.addEventListener('keydown', (e) => {
        if (e.key === ' ') { e.preventDefault(); el.click(); }
      });
    }
  }
}

// --- search suggestions ---------------------------------------------------
//
// One combobox over the search input: regions, then towns, then shops matched on
// name or address. The look is Designer's. A [data-map-template="suggestion"] block
// holds sample rows marked data-map-suggest="place" (name + label) and "shop"
// (name + address), their fields marked data-map-slot. The live list is
// [data-map-element="suggest-list"] inside [data-map-element="suggest"], which the
// script shows and hides with the hidden attribute. The row highlighted from the
// keyboard gets an is-active class (style it as a combo on the row class).
// Without the template or the list, search stays address-only.

const SUGGEST_MIN_CHARS = 2;
const SUGGEST_MAX = { region: 5, town: 5, shop: 25 };

// Case, accents and apostrophes fold away ("Sal's" -> "sals"); anything else that
// is not a letter or digit becomes one space.
const foldText = (s) => String(s || '')
  .normalize('NFD').replace(/[̀-ͯ]/g, '')
  .toLowerCase().replace(/['’`]/g, '')
  .replace(/[^a-z0-9]+/g, ' ').trim();

function wireSuggestions({ input, items, markers, map, status, config }) {
  const dropdown = document.querySelector('[data-map-element="suggest"]');
  const list = document.querySelector('[data-map-element="suggest-list"]');
  const tmplRoot = document.querySelector('[data-map-template="suggestion"]');
  const placeTmpl = tmplRoot?.querySelector('[data-map-suggest="place"]');
  const shopTmpl = tmplRoot?.querySelector('[data-map-suggest="shop"]');
  if (!input || !dropdown || !list || !placeTmpl || !shopTmpl) return null;

  const labels = {
    region: tmplRoot.dataset.labelRegion || 'Region',
    town: tmplRoot.dataset.labelTown || 'Town',
  };
  const listId = list.id || 'map-search-suggestions';

  // What can be suggested, indexed once at boot.
  const shops = items.filter((it) => !isDestination(it));
  const shopsByTown = new Map();
  for (const it of shops) {
    const town = it.el.dataset.town;
    if (!town) continue;
    if (!shopsByTown.has(town)) shopsByTown.set(town, []);
    shopsByTown.get(town).push(it);
  }
  const regions = [];
  for (const btn of document.querySelectorAll('[data-map-element="region"]')) {
    const slug = btn.dataset.slug;
    const name = btn.textContent.trim();
    if (slug && name) regions.push({ kind: 'region', slug, name, nameKey: foldText(name) });
  }
  const towns = [];
  const seenTowns = new Set();
  for (const el of document.querySelectorAll('[data-map-element="town"]')) {
    const slug = el.dataset.slug;
    const name = el.dataset.name;
    // A town with no shop would be a dead end.
    if (!slug || !name || seenTowns.has(slug) || !shopsByTown.has(slug)) continue;
    seenTowns.add(slug);
    towns.push({ kind: 'town', slug, name, nameKey: foldText(name) });
  }
  const shopEntries = shops.map((item) => {
    const d = item.el.dataset;
    const name = d.displayName || d.name || '';
    const nameKey = foldText(`${name} ${d.name || ''}`);
    return {
      kind: 'shop', item, name, address: d.address || '', nameKey, key: `${nameKey} ${foldText(d.address)}`,
      titles: [foldText(name), foldText(d.name)],
    };
  });

  // Every word typed must appear; names that start with the query come first.
  const find = (pool, q, tokens, cap) => {
    const hits = [];
    for (const e of pool) {
      if (!tokens.every((t) => (e.key || e.nameKey).includes(t))) continue;
      const score = e.nameKey.startsWith(q) ? 0 : tokens.every((t) => e.nameKey.includes(t)) ? 1 : 2;
      hits.push({ e, score });
    }
    hits.sort((a, b) => a.score - b.score || a.e.name.localeCompare(b.e.name));
    return { total: hits.length, best: hits.length ? hits[0].score : 3, rows: hits.slice(0, cap).map((h) => h.e) };
  };
  const compute = (q) => {
    const tokens = q.split(' ');
    const r = find(regions, q, tokens, SUGGEST_MAX.region);
    const t = find(towns, q, tokens, SUGGEST_MAX.town);
    const sh = find(shopEntries, q, tokens, SUGGEST_MAX.shop);
    return { rows: [...r.rows, ...t.rows, ...sh.rows], placeCount: r.rows.length + t.rows.length, shopTotal: sh.total, shopBest: sh.best };
  };

  // Screen readers hear how many suggestions there are.
  const live = document.createElement('div');
  live.setAttribute('role', 'status');
  live.setAttribute('aria-live', 'polite');
  Object.assign(live.style, { position: 'absolute', width: '1px', height: '1px', overflow: 'hidden', clip: 'rect(0 0 0 0)', whiteSpace: 'nowrap' });
  dropdown.parentElement.appendChild(live);

  let rows = [];
  let activeIdx = -1;

  const highlight = (i) => {
    const options = list.children;
    if (options[activeIdx]) {
      options[activeIdx].classList.remove('is-active');
      options[activeIdx].setAttribute('aria-selected', 'false');
    }
    activeIdx = i;
    const next = options[i];
    if (next) {
      next.classList.add('is-active');
      next.setAttribute('aria-selected', 'true');
      input.setAttribute('aria-activedescendant', next.id);
      next.scrollIntoView({ block: 'nearest' });
    } else {
      input.removeAttribute('aria-activedescendant');
    }
  };

  const setOpen = (on) => {
    dropdown.hidden = !on;
    input.setAttribute('aria-expanded', String(on));
    if (!on) highlight(-1);
  };

  const makeRow = (entry, i) => {
    const row = (entry.kind === 'shop' ? shopTmpl : placeTmpl).cloneNode(true);
    row.classList.remove('is-active');
    row.id = `${listId}-option-${i}`;
    row.setAttribute('role', 'option');
    row.setAttribute('aria-selected', 'false');
    row.dataset.index = String(i);
    const fill = (slot, text) => {
      const el = row.querySelector(`[data-map-slot="${slot}"]`);
      if (!el) return;
      if (text) el.textContent = text; else el.remove();
    };
    fill('name', entry.name);
    if (entry.kind === 'shop') fill('address', entry.address);
    else fill('label', labels[entry.kind]);
    return row;
  };

  const update = () => {
    const q = foldText(input.value);
    if (q.length < SUGGEST_MIN_CHARS) {
      rows = [];
      list.replaceChildren();
      setOpen(false);
      live.textContent = '';
      return;
    }
    rows = compute(q).rows;
    list.replaceChildren(...rows.map(makeRow));
    highlight(-1);
    setOpen(rows.length > 0);
    live.textContent = rows.length
      ? `${rows.length} suggestion${rows.length === 1 ? '' : 's'}`
      : 'No suggestions. Press Enter to search by address.';
  };

  const choose = (entry) => {
    input.value = entry.name;
    setOpen(false);
    const noun = config.itemNoun;
    if (entry.kind === 'shop') {
      const found = markers.get(entry.item.id);
      if (!found) return;
      setActive({ markers, activeId: entry.item.id });
      // Focus moves into the card so its links are reachable, and Escape or the
      // close button brings focus back to the search. A dot that is already open
      // stays open; focusMarker would close it.
      found.popup.options.focusAfterOpen = true;
      if (!found.popup.isOpen()) focusMarker(map, markers, found, config);
      else found.popup.getElement()?.querySelector('button, a[href]')?.focus();
      popupFocus.returnTo = input;
      return;
    }
    closeAllPopups(markers);
    const inPlace = entry.kind === 'region'
      ? shops.filter((it) => it.el.dataset.region === entry.slug)
      : shopsByTown.get(entry.slug) || [];
    const button = entry.kind === 'region'
      ? Array.from(document.querySelectorAll('[data-map-element="region"]')).find((b) => b.dataset.slug === entry.slug)
      : null;
    // A region goes through its own button so the pressed state stays in step.
    if (button && layerState.region !== entry.slug) button.click();
    else if (entry.kind === 'region' && regionShapes.bounds.has(entry.slug)) fitToBounds(map, regionShapes.bounds.get(entry.slug), config, true);
    else fitToMarkers(map, inPlace, config, true);
    setStatus(status, `${inPlace.length} ${noun}${inPlace.length === 1 ? '' : 's'} in ${entry.name}.`);
  };

  // Enter picks the highlighted row. With none highlighted it decides what was
  // meant: a region or town typed in full, or the start of exactly one place name,
  // is picked; shops matched on NAME open (one) or keep the list open (several);
  // anything else, including text that only matches shop addresses ("Boston", a
  // ZIP), goes to the address search.
  const enter = () => {
    if (!dropdown.hidden && activeIdx >= 0) { choose(rows[activeIdx]); return true; }
    const q = foldText(input.value);
    if (q.length < SUGGEST_MIN_CHARS) return false;
    const places = [...regions, ...towns];
    const exact = places.find((e) => e.nameKey === q);
    if (exact) { choose(exact); return true; }
    const starts = places.filter((e) => e.nameKey.startsWith(q));
    if (starts.length === 1) { choose(starts[0]); return true; }
    // A shop name typed in full wins even when longer names contain it.
    const named = shopEntries.filter((e) => e.titles.includes(q));
    if (named.length === 1) { choose(named[0]); return true; }
    const r = compute(q);
    if (r.shopTotal && r.shopBest <= 1) {
      if (r.shopTotal === 1) choose(r.rows.find((e) => e.kind === 'shop'));
      else update();
      return true;
    }
    return false;
  };

  input.addEventListener('input', update);
  input.addEventListener('focus', () => { if (!popupFocus.quiet) update(); });
  input.addEventListener('blur', () => setOpen(false));
  input.addEventListener('keydown', (e) => {
    if (e.key === 'Escape') {
      if (!dropdown.hidden) { e.preventDefault(); setOpen(false); }
      return;
    }
    if (e.key !== 'ArrowDown' && e.key !== 'ArrowUp') return;
    if (dropdown.hidden) update();
    if (!rows.length) return;
    e.preventDefault();
    const step = e.key === 'ArrowDown' ? 1 : -1;
    highlight((activeIdx + step + rows.length) % rows.length);
  });
  // Pressing a row must not take focus from the input, or the blur closes the list
  // before the click lands.
  list.addEventListener('mousedown', (e) => e.preventDefault());
  list.addEventListener('click', (e) => {
    const row = e.target.closest('[role="option"]');
    if (row && rows[Number(row.dataset.index)]) choose(rows[Number(row.dataset.index)]);
  });

  setOpen(false);
  return { enter, close: () => setOpen(false) };
}

// --- geo search ----------------------------------------------------------

function wireGeoSearch(items, markers, map, config) {
  const input  = document.querySelector('[data-map-element="search-input"]');
  const submit = document.querySelector('[data-map-element="search-submit"]');
  const clear  = document.querySelector('[data-map-element="search-clear"]');
  const status = document.querySelector('[data-map-element="search-status"]');
  if (!input && !submit) return; // no search UI on page; skip.

  const suggest = wireSuggestions({ input, items, markers, map, status, config });

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
  // Suggestions get first say; an address nothing suggests is geocoded.
  const submitSearch = () => {
    if (suggest?.enter()) return;
    suggest?.close();
    runSearch();
  };

  submit?.addEventListener('click', (e) => { e.preventDefault(); submitSearch(); });
  input?.addEventListener('keydown', (e) => { if (e.key === 'Enter') { e.preventDefault(); submitSearch(); } });
  clear?.addEventListener('click', (e) => {
    e.preventDefault();
    if (input) input.value = '';
    suggest?.close();
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
//   locate-clear      forgets the visitor's place (pin, status, distances)
// Either way of setting a place draws the pin, writes locate-status and adds a
// distance flag to the cards; neither moves the camera or runs the radius search.
//   tag               buttons with data-slug (the Shop Tag's slug); click toggles
//                     highlighting shops that carry every chosen tag
//   tag-clear         drops every chosen tag
// Tags are explained under "Shop tags" below.

// --- shop tags --------------------------------------------------------------
//
// Which shops carry which tag is read by shop-card.js (loadTags), from each Shop
// Tag's own page; see the notes there. Here the chips only choose which tags to
// highlight on the map.
const tagState = {
  selected: new Set(),  // tag slugs currently highlighted
  statusSet: false,     // true while the status line shows the "no match" text
};

const tagChips = () => Array.from(document.querySelectorAll('[data-map-element="tag"]'));

// Dims the shop dots that do not carry every chosen tag. Destinations have no tags
// and are left as they are.
async function applyTagHighlight({ markers, status, config }) {
  const chosen = [...tagState.selected];
  const lookup = chosen.length ? await shopCard()?.loadTags({ tagPagePath: config.tagPagePath }) : null;
  // A chip pressed or cleared while the lookup was loading wins.
  const now = [...tagState.selected];
  const on = now.length > 0;
  let matches = 0;
  for (const { markerEl, item } of markers.values()) {
    if (isDestination(item)) continue;
    const hit = on && !!lookup && now.every((slug) => lookup.byTag.get(slug)?.has(item.id));
    markerEl.classList.toggle('is-tag-match', hit);
    if (hit) matches += 1;
  }
  if (on && !matches) { setStatus(status, config.emptyText); tagState.statusSet = true; }
  else if (tagState.statusSet) {
    // Only take the text back if a radius search has not replaced it meanwhile.
    if (status && status.textContent === config.emptyText) setStatus(status, '');
    tagState.statusSet = false;
  }
}

// The place a radius is measured from: the search bar only. "Use my location" is a
// separate thing (see locationState) and never moves the camera or filters.
const searchState = { from: null, label: '' };
const layerState = { showDestinations: true, region: null };

// Two text elements are written to, and each keeps the text it has in Designer:
//   search-status  empty on the published page (its Designer text is a styling
//                  placeholder); filled with search results.
//   locate-status  "Not set" until a place is chosen with "use my location".
// point is the visitor's own place ({ lat, lng }) from the GPS button or the address
// field beside it; pin is the map marker drawn there. It only feeds the pin, the
// status text and the distance flag on the cards.
const locationState = { el: null, fallback: '', point: null, label: '', pin: null, request: 0 };

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

// Text in locate-status: a message while working or on a problem, the place once it
// is set, and the Designer text ("Not set") when nothing is chosen.
function setLocateStatus(text) {
  if (locationState.el) locationState.el.textContent = text;
}

function showLocation() {
  setLocateStatus(locationState.point ? locationState.label : locationState.fallback);
}

// The marker for the visitor's place. It is a clone of [data-map-template="location"]
// (the look is Designer's); without the template a plain dot from the stylesheet is
// used. Clicks pass through it so it never hides a shop dot.
function buildLocationPinEl() {
  const tpl = document.querySelector('[data-map-template="location"]');
  const el = tpl ? tpl.cloneNode(true) : document.createElement('div');
  el.removeAttribute('data-map-template');
  el.removeAttribute('id');
  el.classList.add('cms-map-location-pin');
  if (!tpl) {
    el.setAttribute('role', 'img');
    el.setAttribute('aria-label', 'Your search location');
  }
  el.style.pointerEvents = 'none';
  return el;
}

function placeLocationPin(map, point) {
  if (locationState.pin) {
    locationState.pin.setLngLat([point.lng, point.lat]);
    return;
  }
  locationState.pin = new maplibregl.Marker({ element: buildLocationPinEl(), anchor: 'center' })
    .setLngLat([point.lng, point.lat])
    .addTo(map);
}

// The "4.2 miles away" flag on an open card. shop-card.js holds the visitor's place
// (setOrigin) and writes the flag, so the region list cards show it too.
function refreshDistances(markers) {
  for (const { popup, item } of markers.values()) {
    if (popup.isOpen()) shopCard()?.fillDistance(popup.getElement(), item);
  }
}

// The visitor's place from the GPS button or the address field. It draws the pin,
// writes the status and shows distances on the cards. It does not move the camera and
// takes no part in the radius search.
function setUserLocation(ctx, point, label) {
  locationState.point = point;
  locationState.label = label;
  shopCard()?.setOrigin(point);
  placeLocationPin(ctx.map, point);
  showLocation();
  refreshDistances(ctx.markers);
}

function clearUserLocation(ctx) {
  locationState.request += 1; // a lookup still in flight must not set a place afterwards
  locationState.point = null;
  locationState.label = '';
  shopCard()?.setOrigin(null);
  if (locationState.pin) { locationState.pin.remove(); locationState.pin = null; }
  showLocation();
  refreshDistances(ctx.markers);
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

function applyOrigin(ctx, from, label) {
  searchState.from = from;
  searchState.label = label;
  applyRadiusFilter({ ...ctx, from, miles: readRadius(ctx.config), label });
}

// A new radius measures again from the place already chosen.
function reapplyOrigin(ctx) {
  if (searchState.from) applyOrigin(ctx, searchState.from, searchState.label);
}

function clearOrigin(ctx) {
  searchState.from = null;
  searchState.label = '';
  resetFilter(ctx);
}

// --- region boundaries -----------------------------------------------------
//
// Pressing a region tints its shape on the map and fits the camera to it. The
// shapes (regions.geojson, five features keyed by region slug, built by
// tools/regions/build-regions.sh) are fetched on the first press, or when a region
// button is hovered or focused, so nothing is added to first paint. The tint sits
// under the map's labels. It is decoration only: dots, search and filters are
// unchanged, and if the file cannot load the region fit falls back to the dots.
const REGION_SOURCE = 'nsbh-regions';
const REGION_LAYERS = ['nsbh-region-fill', 'nsbh-region-line'];
const REGION_WAIT_MS = 600;
const regionShapes = { url: null, promise: null, bounds: new Map() };

function initRegionShapes(config) {
  regionShapes.url = config.regionShapes
    || (SCRIPT_URL ? new URL('regions.geojson', SCRIPT_URL).href : null);
}

// [[west, south], [east, north]] of a (Multi)Polygon.
function geometryBounds(geometry) {
  let w = Infinity, s = Infinity, e = -Infinity, n = -Infinity;
  const walk = (c) => {
    if (typeof c[0] === 'number') {
      w = Math.min(w, c[0]); e = Math.max(e, c[0]);
      s = Math.min(s, c[1]); n = Math.max(n, c[1]);
    } else for (const part of c) walk(part);
  };
  walk(geometry.coordinates);
  return [[w, s], [e, n]];
}

function loadRegionShapes() {
  if (regionShapes.promise) return regionShapes.promise;
  if (!regionShapes.url) return Promise.resolve(null);
  regionShapes.promise = fetch(regionShapes.url)
    .then((res) => { if (!res.ok) throw new Error(`HTTP ${res.status}`); return res.json(); })
    .then((geo) => {
      for (const f of geo.features) regionShapes.bounds.set(f.properties.region, geometryBounds(f.geometry));
      return geo;
    })
    .catch((err) => {
      console.warn('[cms-map] region shapes unavailable, using the dots to fit regions', err);
      regionShapes.promise = null; // a later press may try again
      return null;
    });
  return regionShapes.promise;
}

function addRegionLayers(map, geo, config) {
  if (map.getSource(REGION_SOURCE)) return;
  // Under the first label layer: tinted land and roads, readable names on top.
  const beforeId = map.getStyle().layers.find((l) => l.type === 'symbol')?.id;
  const none = ['==', ['get', 'region'], ''];
  map.addSource(REGION_SOURCE, { type: 'geojson', data: geo });
  map.addLayer({
    id: REGION_LAYERS[0], type: 'fill', source: REGION_SOURCE, filter: none,
    paint: { 'fill-color': config.regionColor, 'fill-opacity': config.regionOpacity },
  }, beforeId);
  map.addLayer({
    id: REGION_LAYERS[1], type: 'line', source: REGION_SOURCE, filter: none,
    layout: { 'line-join': 'round' },
    paint: {
      'line-color': config.regionColor,
      'line-opacity': Math.min(1, config.regionOpacity * 3),
      'line-width': 1.5,
    },
  }, beforeId);
}

// Shows one region's shape (null hides it). Resolves to the shape's bounds for the
// camera, or null when there is nothing to fit to: no shape, overlay off, or the
// visitor pressed something else while the file was loading.
function showRegionShape(map, config, slug) {
  const setFilter = (value) => {
    for (const id of REGION_LAYERS) if (map.getLayer(id)) map.setFilter(id, ['==', ['get', 'region'], value]);
  };
  if (!slug) { setFilter(''); return Promise.resolve(null); }
  if (!(config.regionOpacity > 0)) return Promise.resolve(null);
  return loadRegionShapes().then((geo) => {
    if (!geo || layerState.region !== slug) return null;
    addRegionLayers(map, geo, config);
    setFilter(slug);
    return regionShapes.bounds.get(slug) || null;
  });
}

// A toggle button keeps aria-pressed for assistive tech and gets an is-active class
// for Designer: style the pressed look on a combo class named is-active.
function setPressed(el, on) {
  el.setAttribute('aria-pressed', String(on));
  el.classList.toggle('is-active', on);
}

function wireSettingsControls(items, markers, map, config) {
  const status = document.querySelector('[data-map-element="search-status"]');
  const ctx = { items, markers, map, status, config };
  const eligible = () => items.filter((it) => layerState.showDestinations || !isDestination(it));

  // Regions: one at a time; pressing the active one again goes back to everything.
  const regionButtons = Array.from(document.querySelectorAll('[data-map-element="region"]'));
  // Start unpressed whatever classes Designer left on the buttons (a combo applied to
  // preview the pressed look would otherwise show on every button until first click).
  for (const b of regionButtons) setPressed(b, false);
  const selectRegion = (slug) => {
    layerState.region = slug;
    for (const b of regionButtons) setPressed(b, b.dataset.slug === slug);
    closeAllPopups(markers);
    const pool = eligible();
    const inRegion = slug ? pool.filter((it) => it.el.dataset.region === slug) : pool;
    const fitDots = () => fitToMarkers(map, inRegion.length ? inRegion : pool, config, true);
    const shape = showRegionShape(map, config, slug);
    if (!slug) { fitDots(); return; }
    // Fit to the shape once it is in; if it is slow, fit to the dots rather than
    // leave the camera standing still (the tint then appears without a second move).
    let waited = false;
    const timer = new Promise((resolve) => setTimeout(() => { waited = true; resolve(null); }, REGION_WAIT_MS));
    Promise.race([shape, timer]).then((bounds) => {
      if (layerState.region !== slug) return;
      if (bounds && !waited) fitToBounds(map, bounds, config, true);
      else fitDots();
    });
  };
  for (const btn of regionButtons) {
    // Start the (small) shapes download as soon as a press looks likely.
    btn.addEventListener('pointerenter', loadRegionShapes, { once: true });
    btn.addEventListener('focus', loadRegionShapes, { once: true });
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

  // Tags: chips toggle; a shop must carry every chosen tag to stay bright. Clear
  // drops them all. The tag pages load on the first press.
  const chips = tagChips();
  for (const c of chips) setPressed(c, false);
  const syncChips = () => {
    for (const c of chips) setPressed(c, tagState.selected.has(c.dataset.slug));
  };
  for (const chip of chips) {
    chip.addEventListener('click', (e) => {
      e.preventDefault();
      const slug = chip.dataset.slug;
      if (!slug) return;
      if (tagState.selected.has(slug)) tagState.selected.delete(slug); else tagState.selected.add(slug);
      syncChips();
      applyTagHighlight(ctx);
    });
  }
  document.querySelector('[data-map-element="tag-clear"]')?.addEventListener('click', (e) => {
    e.preventDefault();
    tagState.selected.clear();
    syncChips();
    applyTagHighlight(ctx);
  });

  // Location: the browser is asked only when the visitor presses the button. The
  // place it finds, or the address typed beside it, becomes the visitor's location:
  // a pin on the map, the status text, a distance on each card. The camera stays put
  // and the radius search is left alone.
  const locateInput = document.querySelector('[data-map-element="locate-input"]');

  document.querySelector('[data-map-element="locate"]')?.addEventListener('click', (e) => {
    e.preventDefault();
    if (!navigator.geolocation) { setLocateStatus('Location is not available in this browser.'); return; }
    const request = ++locationState.request;
    setLocateStatus(config.searchingText);
    navigator.geolocation.getCurrentPosition(
      (pos) => {
        if (request !== locationState.request) return;
        if (locateInput) locateInput.value = '';
        const point = { lat: pos.coords.latitude, lng: pos.coords.longitude };
        setUserLocation(ctx, point, config.locationLabel);
        nameUserLocation(point, request);
      },
      () => {
        if (request === locationState.request) setLocateStatus('Could not get your location. Enter an address instead.');
      },
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
    const request = ++locationState.request;
    setLocateStatus(config.searchingText);
    try {
      const hit = await geocodeQuery(query, config);
      if (request !== locationState.request) return;
      if (!hit) { setLocateStatus(`No match for “${query}”.`); return; }
      setUserLocation(ctx, hit, query);
    } catch (err) {
      console.error('[cms-map] locate failed', err);
      if (request === locationState.request) setLocateStatus('Lookup failed. Try again.');
    }
  });

  // Clear forgets the visitor's place only; the search bar and its results stay.
  document.querySelector('[data-map-element="locate-clear"]')?.addEventListener('click', (e) => {
    e.preventDefault();
    if (locateInput) locateInput.value = '';
    clearUserLocation(ctx);
  });
}

// GPS gives numbers, not a name. One reverse lookup (made only after the visitor
// presses the button) turns them into "Town, ST", or the ZIP when there is no town.
// The place is already set by then, so a slow or failed lookup only leaves the plain
// label; a newer place or Clear while it was out wins.
async function nameUserLocation(point, request) {
  try {
    const label = await reverseLabel(point);
    if (!label || request !== locationState.request || locationState.point !== point) return;
    locationState.label = label;
    showLocation();
  } catch (err) {
    console.warn('[cms-map] reverse lookup failed', err);
  }
}

async function reverseLabel({ lat, lng }) {
  const params = new URLSearchParams({
    lat: String(lat), lon: String(lng), format: 'json', addressdetails: '1', zoom: '12',
  });
  const res = await fetch(`${NOMINATIM_REVERSE_URL}?${params}`, { headers: { 'Accept': 'application/json' } });
  if (!res.ok) throw new Error(`Nominatim HTTP ${res.status}`);
  const a = (await res.json()).address;
  if (!a) return null;
  const town = a.city || a.town || a.village || a.hamlet || a.suburb || a.municipality;
  const state = String(a['ISO3166-2-lvl4'] || '').replace(/^[A-Z]{2}-/, '') || a.state;
  if (town) return state ? `${town}, ${state}` : town;
  return a.postcode || null;
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
