# Changelog

Versions are jsDelivr release tags. The live site only moves when the version in
the Webflow custom code is updated by hand.

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
