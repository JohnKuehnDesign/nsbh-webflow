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
//   [data-map-element="search-radius"] <select> of miles      (optional; values 5/10/25/50/100)
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
  'popup-max-width':  { key: 'popupMaxWidth',   parse: asString, default: '320px' },
  'popup-offset':     { key: 'popupOffset',     parse: asNumber, default: 18 },
  'search-radius':    { key: 'searchRadius',    parse: asNumber, default: 25 },
  'filter-mode':      { key: 'filterMode',      parse: asString, default: 'highlight' },
  'geocode-viewbox':  { key: 'geocodeViewbox',  parse: asString, default: '-73.5,44.5,-68.5,41.0' },
  'geocode-country':  { key: 'geocodeCountry',  parse: asString, default: 'us' },
  'searching-text':   { key: 'searchingText',   parse: asString, default: 'Searching…' },
  'empty-text':       { key: 'emptyText',       parse: asString, default: 'No Beefs here. 😞' },
  'item-noun':        { key: 'itemNoun',        parse: asString, default: 'shop' },

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
    if (items.length && config.fitOnLoad) fitToMarkers(map, items, config);
  });
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

function fitToMarkers(map, items, config) {
  if (!items.length) return;
  if (items.length === 1) {
    map.easeTo({ center: [items[0].lng, items[0].lat], zoom: config.singleZoom, duration: 0 });
    return;
  }
  const bounds = new maplibregl.LngLatBounds();
  for (const it of items) bounds.extend([it.lng, it.lat]);
  map.fitBounds(bounds, { padding: config.fitPadding, duration: 0, maxZoom: config.fitMaxZoom });
}

function addMarkers(map, items, config) {
  const byId = new Map();
  for (const it of items) {
    const markerEl = document.createElement('button');
    markerEl.type = 'button';
    markerEl.className = 'cms-map-marker';
    markerEl.setAttribute('aria-label', it.el.textContent.trim().split('\n')[0] || 'Location');

    const popup = new maplibregl.Popup({
      offset: config.popupOffset,
      closeButton: true,
      maxWidth: config.popupMaxWidth,
      focusAfterOpen: config.popupFocus,
    }).setHTML(buildPopupHtml(it.el, config));

    const marker = new maplibregl.Marker({ element: markerEl, anchor: 'bottom' })
      .setLngLat([it.lng, it.lat])
      .setPopup(popup)
      .addTo(map);

    byId.set(it.id, { marker, markerEl, popup, item: it });
  }

  for (const entry of byId.values()) {
    entry.markerEl.addEventListener('click', (e) => {
      e.stopPropagation();
      setActive({ items, markers: byId, activeId: entry.item.id, scrollList: true });
      openExclusive(byId, entry.marker);
    });
  }

  return byId;
}

function openExclusive(markers, targetMarker) {
  const isAlreadyOpen = targetMarker.getPopup().isOpen();
  for (const { marker } of markers.values()) {
    if (marker.getPopup().isOpen()) marker.getPopup().remove();
  }
  if (!isAlreadyOpen) targetMarker.togglePopup();
}

// The popup is a clone of the list item, so a card designed once in Webflow
// works in both places. Two things differ in the popup: some elements are
// dropped (the town name, which the address already contains), and the action
// links are appended.
function buildPopupHtml(listItemEl, config) {
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
  for (const { markerEl, item, marker } of markers.values()) {
    const onEnter = () => setActive({ items, markers, activeId: item.id, scrollList: false });
    const onLeave = () => setActive({ items, markers, activeId: null, scrollList: false });
    item.el.addEventListener('mouseenter', onEnter);
    item.el.addEventListener('mouseleave', onLeave);
    item.el.addEventListener('focusin', onEnter);
    item.el.addEventListener('click', (e) => {
      if (e.target.closest('a, button')) return; // let real links/buttons through
      setActive({ items, markers, activeId: item.id, scrollList: false });
      // offset [x, y]: a positive y lands the pin that many pixels BELOW the
      // container's centre, leaving headroom for the popup card above it.
      map.flyTo({
        center: marker.getLngLat(),
        zoom: Math.max(map.getZoom(), config.focusZoom),
        offset: [0, config.focusOffset],
        speed: 1.1,
      });
      openExclusive(markers, marker);
    });
  }
}

// --- geo search ----------------------------------------------------------

function wireGeoSearch(items, markers, map, config) {
  const input  = document.querySelector('[data-map-element="search-input"]');
  const submit = document.querySelector('[data-map-element="search-submit"]');
  const clear  = document.querySelector('[data-map-element="search-clear"]');
  const radius = document.querySelector('[data-map-element="search-radius"]');
  const status = document.querySelector('[data-map-element="search-status"]');
  if (!input && !submit) return; // no search UI on page; skip.

  const runSearch = async () => {
    const query = (input?.value || '').trim();
    if (!query) return;
    setStatus(status, config.searchingText);
    try {
      const hit = await geocodeQuery(query, config);
      if (!hit) { setStatus(status, `No match for “${query}”.`); return; }
      const miles = radius ? parseFloat(radius.value) : config.searchRadius;
      applyRadiusFilter({ items, markers, map, from: hit, miles, status, label: query, config });
    } catch (err) {
      console.error('[cms-map] geo-search failed', err);
      setStatus(status, 'Search failed. Try again.');
    }
  };

  submit?.addEventListener('click', (e) => { e.preventDefault(); runSearch(); });
  input?.addEventListener('keydown', (e) => { if (e.key === 'Enter') { e.preventDefault(); runSearch(); } });
  radius?.addEventListener('change', () => { if ((input?.value || '').trim()) runSearch(); });
  clear?.addEventListener('click', (e) => {
    e.preventDefault();
    if (input) input.value = '';
    for (const { marker } of markers.values()) {
      if (marker.getPopup().isOpen()) marker.getPopup().remove();
    }
    resetFilter({ items, markers, map, status, config });
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
  for (const it of items) {
    const d = distance(origin, [it.lng, it.lat], { units: 'miles' });
    if (d <= miles) keep.add(it.id);
  }

  const noun = config.itemNoun;
  setStatus(status, keep.size
    ? `${keep.size} ${noun}${keep.size === 1 ? '' : 's'} within ${miles} mi of ${label.split(',')[0]}.`
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
  fitToMarkers(map, items, config);
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
