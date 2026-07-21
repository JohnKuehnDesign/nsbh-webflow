# nsbh-webflow

Custom code for the [North Shore Beef Hub](https://nsbh.webflow.io) Webflow site.

Hosted here and served to Webflow through [jsDelivr](https://www.jsdelivr.com/),
pinned to a release tag. Nothing on the live site changes until the version
number in the Webflow custom code is bumped by hand.

## What's in here

| Path | Purpose |
|---|---|
| `src/map/map-embed.js`   | The CMS map component — markers, list sync, geo-search |
| `src/map/map-embed.css`  | Minimal styles for the runtime-injected marker and popup DOM |
| `webflow/head-code.html` | Copy-paste block for Page Settings → Inside `<head>` |
| `webflow/footer-code.html` | Copy-paste block for Page Settings → Before `</body>` |

This repo is public because jsDelivr only serves public repos — and because the
JavaScript is already public regardless, served to every visitor of the site.
**It contains no secrets and must never contain any.** The map works without an
API key by design (OpenFreeMap tiles, Nominatim geocoding). If a keyed service is
ever added, the key goes in a proxy, not in this repo.

Client data (CMS exports, address CSVs) stays out — see `.gitignore`.

---

## The map component

An open-source equivalent of Jetboost's store locator, built on the NSBH
**Shops** CMS collection.

| Piece | Library | Notes |
|---|---|---|
| Map rendering | [MapLibre GL JS](https://maplibre.org/) `4.7.x` | Open-source fork of Mapbox GL JS v1 |
| Tiles | [OpenFreeMap](https://openfreemap.org/) "liberty" | Free OSM vector tiles, no API key |
| Geo math | [`@turf/distance`](https://turfjs.org/docs/#distance) `7.x` | Haversine distance in miles |
| Geocoding | [Nominatim](https://nominatim.org/) (OSM) | Free, no key, ~1 req/sec |

Dependencies load at runtime from esm.sh via dynamic `import()`. No build step —
the file you edit here is the file the browser runs.

### Page hooks

Set as custom attributes in Webflow Designer. The script finds everything through
these, so no IDs or classes are load-bearing.

| Attribute | On | Required |
|---|---|---|
| `data-map-element="viewport"` | The map div | Yes |
| `data-map-element="item"` | Each Collection Item | Yes |
| `data-id` / `data-lat` / `data-lng` | Each Collection Item, bound to Slug / Latitude / Longitude | Yes |
| `data-google-map-link` | Each Collection Item, bound to **Google Business Map Link** | Optional |
| `data-directions-link` | Each Collection Item, bound to **Directions Link** | Optional |
| `data-website` | Each Collection Item, bound to **Website** | Optional |
| `data-map-element="search-input"` | Address / zip text input | Optional |
| `data-map-element="search-radius"` | `<select>` of miles (5/10/25/50/100) | Optional |
| `data-map-element="search-submit"` | Search button | Optional |
| `data-map-element="search-clear"` | Clear button | Optional |
| `data-map-element="search-status"` | Text block for the result summary | Optional |

The search UI is skipped entirely if neither input nor submit is present.

**Note on the 157 shops:** Webflow caps a Collection List at 100 items, so the
page uses two lists (Show 100 / Skip 0, and Show 100 / Skip 100), both filtered
to `Longitude is set`, pagination off. Both serve double duty as the visible list
and the map's data source. `collectItems()` de-duplicates by `data-id` as a
safety net.

### Configuration

Every value below can be set three ways. First match wins:

1. **`data-map-*` attribute on the viewport div** — set in Designer's element
   settings panel, per page. This is the normal way.
2. **`window.NSBH_MAP_CONFIG`** in page head code — for values that are awkward
   as a string, or to set several at once.
3. **Built-in default** — reproduces the original hard-coded behavior.

| Attribute | Config key | Default | What it does |
|---|---|---|---|
| `data-map-center` | `center` | `-70.95,42.55` | Initial center, as `lng,lat` |
| `data-map-zoom` | `zoom` | `9` | Initial zoom |
| `data-map-style` | `style` | OpenFreeMap liberty | Tile style URL |
| `data-map-fit-on-load` | `fitOnLoad` | `true` | Auto-fit to all markers on load |
| `data-map-fit-padding` | `fitPadding` | `48` | Padding in px when fitting bounds |
| `data-map-fit-max-zoom` | `fitMaxZoom` | `13` | Zoom ceiling when fitting bounds |
| `data-map-single-zoom` | `singleZoom` | `12` | Zoom used when only one shop exists |
| `data-map-focus-zoom` | `focusZoom` | `12` | Minimum zoom when a list item is clicked |
| `data-map-scroll-zoom` | `scrollZoom` | `true` | Mouse wheel zooms the map. Set `false` to stop the map capturing page scroll |
| `data-map-cooperative-gestures` | `cooperativeGestures` | `false` | Require a modifier to zoom: two fingers on touch, ctrl/⌘+scroll on desktop. A plain scroll passes through to the page. See below |
| `data-map-nav-control` | `navControl` | `top-right` | Zoom buttons corner, or `none` |
| `data-map-popup-max-width` | `popupMaxWidth` | `320px` | Popup max width |
| `data-map-popup-offset` | `popupOffset` | `18` | Popup offset from the pin, in px |
| `data-map-search-radius` | `searchRadius` | `25` | Fallback radius in miles if no radius `<select>` |
| `data-map-filter-mode` | `filterMode` | `highlight` | `highlight` re-fits the map to matches; `filter` hides non-matches |
| `data-map-geocode-viewbox` | `geocodeViewbox` | `-73.5,44.5,-68.5,41.0` | Geocoder bias box (New England) |
| `data-map-geocode-country` | `geocodeCountry` | `us` | Geocoder country restriction |
| `data-map-searching-text` | `searchingText` | `Searching…` | Status while geocoding |
| `data-map-empty-text` | `emptyText` | `No Beefs here. 😞` | Status when nothing is in range |
| `data-map-item-noun` | `itemNoun` | `shop` | Noun in the result count. Pluralized with `s` |
| `data-map-marker-image` | `markerImage` | stylesheet default | Marker icon. A bare URL, or any CSS image value |
| `data-map-marker-size` | `markerSize` | `2rem` | Marker width and height |
| `data-map-marker-color` | `markerColor` | `--_primitives---colors--h-redwood` | Marker `color` |
| `data-map-marker-active-scale` | `markerActiveScale` | `1.15` | Scale on hover / active |
| `data-map-popup-omit` | `popupOmit` | `.map_town-name` | CSS selector for elements to drop from the popup |
| `data-map-popup-actions` | `popupActions` | `true` | Render the Directions / Order Now links |
| `data-map-directions-label` | `directionsLabel` | `Directions` | Directions link text |
| `data-map-order-label` | `orderLabel` | `Order Now` | Order link text |

An unparseable attribute logs a warning and falls through to the next source
rather than breaking the map.

#### Scroll and zoom behavior

Three related controls, in order of how aggressive they are:

- **Default** — a mouse wheel or trackpad scroll over the map zooms it. On a long
  page this traps the reader's scroll.
- **`data-map-scroll-zoom="false"`** — the wheel never zooms. Drag-pan and the
  +/− buttons still work. Good for desktop, but it does nothing for touch: a
  one-finger drag on a phone still pans the map instead of scrolling the page.
- **`data-map-cooperative-gestures="true"`** — the recommended fix for a
  page-embedded map. A plain scroll (desktop) or one-finger drag (touch) passes
  through to the page; the map only zooms/pans when the reader uses ctrl/⌘+scroll
  or two fingers. MapLibre shows a short "use two fingers" / "use ctrl to zoom"
  hint over the map while a plain gesture is in progress.

Use **one** of the last two, not both. Cooperative gestures already blocks a
plain scroll, and it needs the scroll-zoom handler enabled to gate it behind the
modifier — so if you set both, the component forces scroll-zoom back on and logs
a warning. For a map inside a scrolling page, prefer cooperative gestures alone.

#### About `filterMode`

The default `highlight` is what the site has always done: a radius search
reports a count and re-fits the map, but every marker and list item stays
visible. Setting `filter` hides the non-matching ones outright (via an
`.is-hidden` class), which is what most people expect a radius filter to do.
Switch by adding `data-map-filter-mode="filter"` to the map div.

### The popup

The popup is a clone of the Collection Item, so a card designed once in Webflow
works in both the list and the map. Two things differ in the popup.

**Omitted elements.** The town name is dropped, because the address below it
already contains the town. Controlled by `data-map-popup-omit`, which takes a
CSS selector and defaults to `.map_town-name`. Set it to something else to drop
different elements, or blank it to drop nothing. A blank attribute is honored as
written — it is not treated as unset.

For anything long-lived, prefer tagging the element itself with
`data-map-omit="popup"` in Designer. That survives class renames; the selector
does not.

**Action links.** Two links are appended to the popup, built from CMS fields
bound as data attributes on the Collection Item:

| Link | Source | Fallback |
|---|---|---|
| Directions | `data-google-map-link` (Google Business Map Link) | `data-directions-link` (Directions Link) |
| Order Now | `data-website` (Website) | none |

Both open in a new tab with `rel="noopener noreferrer"`. A link is omitted
entirely when its field is empty, and the whole action bar is omitted when both
are. Only `http://` and `https://` URLs are accepted — CMS fields are free text,
and a `javascript:` URL in a popup would execute on click. Rejected values are
logged as a warning.

Label text is set with `data-map-directions-label` and `data-map-order-label`.
Set `data-map-popup-actions="false"` to turn the whole feature off.

### Styling

Split deliberately:

- **This repo** styles only what Webflow can't reach — the marker `<button>` and
  the MapLibre popup shell, both injected into the DOM at runtime.
- **`webflow/head-code.html`** holds the site-side styles. They're there instead
  of here so you can change them without cutting a release, and each rule is a
  candidate to move onto a real Webflow class as the section gets rebuilt.

Marker and popup appearance is driven by CSS variables on the viewport element:

| Variable | Default |
|---|---|
| `--map-marker-size` | `2rem` |
| `--map-marker-image` | The Webflow-hosted `PhMapPinFill.svg` asset |
| `--map-marker-color` | `--_primitives---colors--h-redwood` |
| `--map-marker-active-scale` | `1.15` |
| `--map-popup-radius` | `12px` |
| `--map-popup-shadow` | `0 10px 30px rgba(0,0,0,.18)` |
| `--map-popup-padding` | `12px 14px` |
| `--map-action-gap` | `8px` |
| `--map-action-margin-top` | `12px` |
| `--map-action-padding` | `8px 12px` |
| `--map-action-radius` | `8px` |
| `--map-action-font-size` | `0.875rem` |
| `--map-action-font-weight` | `700` |
| `--map-action-directions-bg` / `-color` | redwood / `#fff` |
| `--map-action-order-bg` / `-color` / `-border` | transparent / redwood / `1px solid currentColor` |

The four marker variables also have `data-map-marker-*` attribute equivalents,
because Webflow's style panel has no field for setting a custom property. Set
the pin icon in Designer with:

```
data-map-marker-image = https://your-asset-url/pin.svg
```

The attribute writes the variable inline on the map div, so it wins over the
stylesheet. A bare URL is wrapped in `url("…")` for you; a full CSS value
(`url(…)`, `none`, a gradient) is passed through untouched.

Popup content is a clone of the Collection Item's own HTML, so a card styled once
in Designer works in both the list and the popup.

---

## Making a change

1. Edit the file in `src/map/`.
2. Commit and push to `main`.
3. Tag a release: `git tag v1.1.0 && git push origin v1.1.0`.
4. In Webflow, update the version in **both** `head-code.html` and
   `footer-code.html` blocks — they must match.
5. Publish to staging (`nsbh.webflow.io`) and test before the custom domain.

Pushing to `main` alone changes nothing on the live site. Only step 4 deploys.

**The URL drops the `v`.** The git tag is `v1.1.0`, but jsDelivr strips the
leading `v` from semver tags, so the CDN path is `@1.1.0`. Using `@v1.1.0`
returns a 404. A new tag can take a few minutes to become available on the CDN.

### Testing checklist

- Map centers on the North Shore with ~137 markers
- Hover a list item → its marker grows; hover a marker → the list item highlights
- Click a list item → map flies to it, popup opens, other popups close
- Search `01906` at `25 mi` → status reports a count, map re-fits
- Clear → status empties, map re-fits to everything

---

## Geocoding new shops

The one-off backfill script (`geocode-backfill.mjs`) and the Shops CSVs live
outside this repo, in `Production/NSBH/webflow-map/` — they're local tooling
against client data, not part of what ships to the browser.

Of the original 157 rows, 137 geocoded cleanly. Four failed on parenthetical
route numbers and unit suffixes and need coordinates entered by hand in Designer.

---

## Nominatim notes

- **Rate limit:** ~1 req/sec. Live search is user-initiated, so it stays well
  under in practice.
- **User-Agent:** Nominatim's policy asks for a descriptive UA, but browsers
  forbid scripts from setting that header on `fetch` — it's dropped silently. The
  `Referer` header (the site domain) is what actually identifies this traffic.
  The backfill script, running in Node, *does* send a real UA.
- **If traffic grows:** proxy through a Cloudflare Worker with short-TTL caching
  and a proper UA, then point `NOMINATIM_URL` at the worker.

## Deliberately not included

- **Marker clustering** — 137 markers render fine. Revisit past ~500.
- **Category filters** — the CMS has `Region` and `Shop Tags`; wiring a filter UI
  to the `.is-hidden` class is a small follow-up.
- **Per-category marker icons**, favorites, sort, pagination.
