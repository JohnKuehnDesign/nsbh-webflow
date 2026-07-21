# Changelog

Versions are jsDelivr release tags. The live site only moves when the version in
the Webflow custom code is updated by hand.

Note: jsDelivr strips the leading `v` from semver tags. Tag `v1.0.1` is served
at `@1.0.1`.

## v1.4.0 — 2026-07-21

### Added

- **`data-map-focus-offset`** — pixels to drop the focused pin below the map's
  vertical centre when flying to it from a list click, so a tall popup card has
  room above instead of running past the bottom of the frame. Defaults to `0`,
  which keeps the previous dead-centre behaviour.

  Sizing it: a card needs about `card height + 18px popup offset + padding` of
  space above the pin, and a centred pin only has half the map height. On this
  site (320px map, 134–168px cards) a centred pin has 160px against the ~190px a
  tall card wants — hence the clipping. `70` clears it on both the mobile and
  desktop map heights.

### Known, not addressed

- Clicking a marker directly doesn't recentre the map, so a pin near the top or
  bottom edge can still open a clipped card. Popups already anchor-flip to sit
  above or below the pin depending on room, but neither side fits when the pin is
  hard against an edge. Fixing it means panning the popup into view on open,
  which risks fighting MapLibre's own anchor recalculation — deferred until it
  actually bites.

## v1.3.0 — 2026-07-20

### Added

- **Pin image from a Webflow element.** An Image element tagged
  `data-map-element="marker-image"` (Display: None) has its `src` read on load
  and used as the marker icon, then stays hidden. Lets the pin be set from the
  Asset Manager with no URL-pasting. The `data-map-marker-image` attribute and
  `NSBH_MAP_CONFIG.markerImage` still take priority.

### Fixed

- **Mobile horizontal scroll.** The map's flex-item ancestor had the default
  `min-width: auto`, so it refused to shrink below the map canvas's pixel width
  and pushed the page wider than the phone screen. The component stylesheet now
  sets `min-width: 0; max-width: 100%` on the viewport, and the head-code block
  adds `min-width: 0` to the site's `.map_panel` flex ancestor. `map.resize()` is
  also called once on load as insurance for containers whose width settles after
  init.

## v1.2.0 — 2026-07-20

### Added

- **`data-map-cooperative-gestures`.** Requires a modifier to zoom or pan the
  map — two fingers on touch, ctrl/⌘+scroll on desktop — so a plain scroll or
  one-finger drag passes through to the page instead of being captured. This is
  the fix for a map embedded mid-page; `data-map-scroll-zoom="false"` only
  covered the desktop wheel and did nothing for one-finger touch.

### Changed

- Cooperative gestures and `scroll-zoom="false"` don't compose: the former gates
  the scroll-zoom handler behind a modifier and needs it enabled, the latter
  disables it. When both are set, cooperative gestures wins — scroll-zoom is
  forced back on and a warning is logged — so the gesture hint never tells users
  to ctrl+scroll while nothing happens.

## v1.1.0 — 2026-07-20

### Added

- **Marker styling as attributes.** `data-map-marker-image`, `-size`, `-color`
  and `-active-scale` on the map div write the matching CSS custom properties
  inline. Webflow's style panel has no field for setting a custom property, so
  the variables alone weren't reachable from Designer. A bare URL is wrapped in
  `url("…")`; a complete CSS value is passed through.
- **Directions and Order Now links in the popup.** Built from CMS fields bound
  as data attributes on the Collection Item: `data-google-map-link` with
  `data-directions-link` as the fallback, and `data-website` for Order Now. Both
  open in a new tab with `rel="noopener noreferrer"`. A link is dropped when its
  field is empty; the whole bar is dropped when both are.
  Only `http(s)` URLs are accepted — CMS fields are free text and a
  `javascript:` URL would execute on click. Rejected values log a warning.
- **Popup omissions.** `data-map-popup-omit` takes a CSS selector, defaulting to
  `.map_town-name` so the town no longer repeats above the address that already
  contains it. Elements can also be tagged `data-map-omit="popup"` directly,
  which survives class renames. An invalid selector warns instead of throwing.
- `data-map-popup-actions="false"`, `data-map-directions-label` and
  `data-map-order-label`.

### Changed

- A present-but-empty config attribute is now honored as written rather than
  treated as unset, so blanking `data-map-popup-omit` in Designer omits nothing
  instead of silently reverting to the default.
- Corrected the marker icon URL in the stylesheet. It pointed at an older
  upload of `PhMapPinFill.svg` copied from a stale local snippet; it now matches
  the asset the live page uses.

## v1.0.1 — 2026-07-20

No code change. `v1.0.0` is unusable: files were requested from the CDN within
seconds of the tag being pushed, before jsDelivr had built its file index for
that version, and the resulting 404s were negative-cached. `map-embed.js`
resolved but `map-embed.css` and `README.md` did not. Re-tagged to get a clean
version namespace.

Lesson for future releases: after pushing a tag, wait a minute or two before
requesting any URL at that version. A premature request poisons the cache.

## v1.0.0 — 2026-07-20

First GitHub-hosted release. Behavior on the page is unchanged from the Webflow
asset-hosted version it replaces.

### Changed

- Moved hosting from a Webflow asset `.txt` upload to GitHub + jsDelivr, pinned
  to a release tag. Previously each edit produced a new asset URL that had to be
  pasted back into the footer code; the URL is now stable within a version.
- Extracted every hard-coded value into a config layer: `data-map-*` attributes
  on the map div, with a `window.NSBH_MAP_CONFIG` fallback. Defaults reproduce
  the previous behavior exactly. See README for the full table.
- Split the CSS. The repo stylesheet now covers only the runtime-injected marker
  and popup DOM; site-side styles moved into the Webflow head-code block where
  they can be edited without a release.
- Marker and popup appearance now driven by CSS variables so Webflow classes can
  override them.

### Added

- `data-map-filter-mode="filter"` — hides non-matching markers and list items on
  a radius search. The previous behavior (re-fit the map, hide nothing) is kept
  as the default, `highlight`.
- `data-map-scroll-zoom="false"` — stops the map capturing page scroll.
- `data-map-nav-control="none"` — hides the zoom buttons.

### Fixed

- Removed the `User-Agent` header from the live geocoding request. Browsers
  forbid scripts from setting it on `fetch`, so it never left the page — the
  previous README's claim of UA-policy compliance for the live search was wrong.
  The Node backfill script, which can set it, is unaffected.
- Documented that radius search did not actually filter anything in the shipped
  version, contradicting the old README.
- `fitToMarkers` now returns early on an empty item list instead of building an
  empty bounds object.
