# Changelog

Versions are jsDelivr release tags. The live site only moves when the version in
the Webflow custom code is updated by hand.

Note: jsDelivr strips the leading `v` from semver tags. Tag `v1.0.1` is served
at `@1.0.1`.

## v1.14.1 — 2026-10-23

### Added

- **Key events sent directly.** An Order click also sends `shop_order`, a Call click
  also sends `shop_call` (both with `shop_name`), next to the usual `shop_click`.
  GA4's no-code "Create an event" only triggers on `page_view` and `form_submit`, so
  it can't derive these from `shop_click`'s `link_type`; both are registered in GA4
  "with code" and marked as key events.

### Unchanged

- `shop-card.js`, `map-embed.js`, `map-embed.css`: same as v1.14.0.

## v1.14.0 — 2026-10-23

### Added

- **GA4 click tracking.** New `src/analytics/analytics.js`, loaded site-wide: one
  capture-phase listener for `click` and middle-click that sends `shop_click`
  (`link_type`, `shop_name`) or `destination_click` (`link_type`, `destination_name`)
  when a `[data-track-link]` inside a `[data-track-card]` is clicked. Does nothing
  while `window.gtag` is missing, so it sends nothing before consent.
- `shop-card.js` marks every card it builds: `data-track-card` (shop / destination)
  and `data-track-name` on the card, `data-track-link` on each filled button
  (directions, call, website, order; the destination link is `explore`). Map popups,
  guide popovers and region lists all get them.
- `webflow/site-analytics.html`: gtag behind Finsweet (`type="fs-cc"`,
  `fs-cc-categories="analytics"`), with `debug_mode` on `*.webflow.io` only so
  staging stays out of reports; plus the footer tag for `analytics.js`.

### Unchanged

- `map-embed.js` and `map-embed.css`. Card markup and behaviour are the same apart
  from the new attributes.

## v1.13.0 — 2026-10-15

### Added

- **Order button when a shop has no website.** The shop template can hold a second
  link button marked `data-map-slot="order"`, filled from `data-order-link` (bound to
  **Order Link**). It shows only when `data-website` is empty; with a website, Visit
  Site shows and the order button is removed; with neither, both are removed. Same
  http(s)-only check as the other links.
- Shop lists and the map's hidden shop items take `data-order-link` (14 attributes).

### Unchanged

- `map-embed.js` and `map-embed.css` are the same as v1.11.0. A template without the
  order button behaves exactly as v1.12.0.

## Rollout, no release — 2026-10-13

No code change; the site still loads `@1.12.0`.

- **Fall and Spring Guides** load `shop-card.js@1.12.0` and place
  `shop-card-template_component`. Their Nearby Beef Shops chips are
  `data-shop-card="source"` items with 11 bound attributes (no `data-lat`/`data-lng`)
  and sr-only description/address. The old per-chip popovers (Fall 34, Spring 53) and
  each page's inline popover script are gone. Fall page HTML 167.5 KB → 144.0 KB.
- **Destinations Template** shop cards restyled in Webflow to the template design
  (static markup, no script): Region / Town, address row, template tags, and
  Directions / Call Now / Visit Site in place of Order Now. Page head hides buttons
  whose CMS link is empty.
- Site head comment names `shop-card-template_component` (was `card-templates_component`).
- README: where cards come from per page, optional lat/lng, binding through the MCP,
  "Inline cards (Destinations Template)".

## v1.12.0 — 2026-10-12

### Added

- **Cards show tags on pages without a map.** `shop-card.js` also reads tag icons and
  names from a hidden Shop Tags list marked `data-shop-card="tag"` (with `data-slug`)
  inside the card templates component. The map's filter chips still count; the first
  element per slug wins.
- **`data-shop-card-premium`** on the shop template sets the premium seal (`all`,
  `cms`, `none`) for every page. It wins over the map's `data-map-premium`.
- README: "Adding cards to a page" checklist.

### Unchanged

- `map-embed.js` and `map-embed.css` are the same as v1.11.0.

## v1.11.0 — 2026-10-12

### Removed

- **The list-item popup fallback.** Popups come only from the shared card in
  `shop-card.js`; without it the popup shows the place's name. Gone with it:
  `data-map-popup-omit`, `data-map-omit="popup"`, `data-map-popup-actions`,
  `data-map-directions-label`, `data-map-order-label`, and the generated
  Directions / Order Now buttons with their `--map-action-*` variables.
- **List sync.** Hovering or clicking a hidden list item no longer drives the map,
  and opening a dot no longer scrolls its list item into view. The list it served
  is hidden. The open dot still gets `.is-active`.

### Changed

- Page head code: removed the CSS rules for `.map-item_show-modal`,
  `.cms-map-popup-card .map-item_wrapper` and the active list item outline.

## v1.10.0 — 2026-10-12

### Added

- **`src/shop-card/shop-card.js`**, the shop card on its own. It builds a card from
  the `[data-map-template="shop|destination"]` template, fills the tags row and the
  distance flag, and opens cards from list links. It loads before `map-embed.js` on
  the map page and alone on other pages. API: `window.NSBHShopCard`.
- **Region lists use the template card.** A Collection Item marked
  `data-shop-card="source"` and carrying the shop's data attributes, with its link
  marked `data-shop-card-open`, opens one shared popover built from the template:
  hover beside the link on desktop, full screen on tap below 992px. The 163 hidden
  per-shop popovers and the inline footer script (Block 2b) go away; on staging that
  is about 5,000 fewer elements and about 280 KB less HTML.
- Keyboard: the list popover opens on Enter with focus in the card; Escape returns
  focus to the link. The card is a named `role="dialog"`.
- The list cards show the distance flag once a place is set on the map.

### Changed

- `map-embed.js` no longer builds cards, loads tag pages or measures card
  distances itself; it calls `shop-card.js`. Without it the popup falls back to a
  clone of the list item, as before templates existed.
- The visitor's place is handed to the card with `setOrigin`. Card distances use a
  built-in haversine (same result as Turf); Turf still runs the radius search.

## v1.9.0 — 2026-10-11

### Added

- **Region boundary overlay.** Pressing a region tints its shape on the map (Harbor
  Blue, `#35798c`, 20% opacity, with a thin outline) and fits the camera to the shape
  instead of to its dots. The tint sits under the map's labels; pressing the region
  again, Clear (`region-clear`) or choosing a region in the search suggestions all go
  through the same path. Only the pressed region is drawn.
- `src/map/regions.geojson` (62 KB, about 15 KB gzipped): the five region shapes, keyed
  by region slug. It is fetched on the first press, or when a region button is hovered
  or focused, so nothing is added to first paint. If the file cannot load, the region
  fit falls back to the dots as before.
- Config: `data-map-region-color` (default `#35798c`), `data-map-region-opacity`
  (default `0.2`; `0` turns the overlay off), `data-map-region-shapes` (default: the
  file beside the script).
- `tools/regions/` rebuilds the shapes from MassGIS town boundaries and the town to
  region list taken from the Towns CMS collection.

## v1.8.1 — 2026-10-11

### Added

- **The GPS button names the place.** After it sets the pin, one Nominatim reverse
  lookup replaces "Your location" in `locate-status` with "Town, ST" (the ZIP when there
  is no town). If the lookup fails or is slow, the plain label stays.

## v1.8.0 — 2026-10-11

### Changed

- **The address field beside Use my location no longer refocuses the map.** It, and the
  GPS button, now set the visitor's own place only: a pin on the map, the
  `locate-status` text and a distance flag on the cards. The camera stays put and the
  radius search is not run. Clear (`locate-clear`) forgets the place only; it no longer
  clears the search bar's results.
- The status for a location lookup now shows in `locate-status`, not `search-status`.

### Added

- **Location pin:** a clone of `[data-map-template="location"]` is drawn at the place
  (a plain dot when the template is missing).
- **Distance flag on cards:** `data-map-slot="distance"` / `"distance-text"` in the shop
  and destination templates, e.g. "4.2 miles away", hidden until a place is set.

## v1.7.5 — 2026-10-11

### Fixed

- **Escape closes a card opened with a mouse click.** A click leaves focus on the page,
  not the dot, so the key never reached the card. Escape on the map or the bare page
  now closes the open card; Escape in a field or the suggestions is unchanged.

## v1.7.4 — 2026-10-11

### Fixed

- **Closing a card with Escape no longer reopens the search suggestions** when focus
  returns to the search input.

## v1.7.3 — 2026-10-11

### Fixed

- **The suggestion list closes after an address search** (it stayed open over the map).
- **A shop name typed in full wins on Enter** even when longer names contain it
  ("110 Roast Beef" no longer ties with "Route 110 Roast Beef").

### Accessibility

- **Map dots leave the tab order** (they stay clickable). Tab now goes search, map,
  settings instead of through every dot. Shops are reachable by keyboard through the
  search suggestions and the list below the map.
- **Cards opened from the keyboard** (the search, or Enter on a dot with a screen
  reader) take focus, so Directions, Call and Visit are reachable. Escape or the
  close button closes the card and returns focus to the search or the dot.
- **Search, Clear, Use my location and Reset links** get `role="button"` and respond to
  Space as well as Enter.

## v1.7.2 — 2026-10-11

### Changed

- **Enter no longer picks a place on a partial match.** Typing "Boston" used to pick
  Greater Boston. A region or town is now picked only when typed in full or when the
  text starts exactly one place name; text that only matches shop addresses (a town
  outside the CMS, a ZIP) goes to the address search. Shops matched on name still
  open (one) or keep the list open (several). This replaces the digit rule.
- **Up to 25 shop suggestions** (was 5), scrolling inside the list.

## v1.7.1 — 2026-10-11

### Fixed

- **Shops with a number in the name** ("110 Roast Beef") now act as suggestions on
  Enter. Text with a digit still goes to the address search, unless a region, town
  or shop name matches it.

## v1.7.0 — 2026-10-11

### Added

- **Search suggestions.** The search input is now a combobox: regions, then towns
  that have shops, then shops matched on name or address (five of each at most),
  with keyboard support and a screen-reader count. A region press goes through the
  region button, a town fits its shops, a shop opens its card. Enter with no row
  highlighted picks a place hit, opens a lone shop hit, keeps several shop hits in
  the list, and sends no hits, or any text with a digit, to the address search as
  before. Needs the `suggest`, `suggest-list` and `suggestion` template markup from
  the README; without it search stays address-only.

## v1.6.19 — 2026-10-11

### Changed

- **Shops outside a tag choice no longer get `is-tag-dim`.** The class was set on every
  non-matching dot but carried no style, so it is gone. Highlight is unchanged
  (`is-tag-match`); the class can come back with a rule if dimming is wanted later.

## v1.6.18 — 2026-10-11

### Added

- **Tag names on the shop card.** Put `data-map-slot="tag-name"` on the text element
  inside the card's `data-map-slot="tag"` element; each tag shows its own name from
  the matching panel chip. With no tag-name element the tags stay icon-only and carry
  the name as an accessible label and hover title instead.

## v1.6.17 — 2026-10-11

### Fixed

- **Chips start unpressed.** On load every region button and tag chip is set to
  not-pressed, so an `is-active` combo left on a button in Designer (to preview the
  pressed look) no longer shows on every button until the first click.

## v1.6.16 — 2026-10-11

### Added

- **`is-active` on pressed chips.** Tag chips and region buttons get an `is-active`
  class together with `aria-pressed`, so the pressed look is a Designer combo class
  (`map-UI_chip-button` + `is-active`). The code no longer paints a redwood background
  on pressed chips.

### Changed

- **Highlight glow is mint.** Matching dots get a very light green ring
  (`--map-marker-highlight-ring`, `#e6faef`) and a mint glow (`--map-marker-highlight`,
  `#7ddfae`).
- **An open card sits above every dot.** `.maplibregl-popup` has `z-index: 2`, above
  highlighted dots (`z-index: 1`).

### Fixed

- **Card tag icons no longer depend on a class name.** The icon is the SVG the chip
  holds, whatever its wrapper is called, so renaming `shop-tag_svg-embed` in Designer
  no longer empties the card's tags.

## v1.6.15 — 2026-10-11

### Changed

- **Tag highlight is a green ring and glow, not a fade.** Shops that carry every
  chosen tag get a green ring and glow (`--map-marker-highlight`, default `#2f9e5b`)
  and sit on top. Other dots are no longer faded; `is-tag-dim` is still set on them
  as a hook but has no style.

## v1.6.14 — 2026-10-11

### Added

- **Tag highlight.** The Highlight chips (`[data-map-element="tag"]`, each with
  `data-slug` bound to the Shop Tag's slug) toggle `aria-pressed`; shop dots that do
  not carry every chosen tag fade back (`is-tag-dim`). `tag-clear` drops them all.
  No match shows the empty-text status.
- **Tags in the shop popup.** The card's `data-map-slot="tags"` row is filled when the
  popup opens: one copy of its `data-map-slot="tag"` element per tag, with the icon
  and name copied from the chip with the same slug. Hidden when the shop has no tags.
- **Where the shop-to-tag link comes from.** A multi-reference cannot bind to an
  attribute, so each Shop Tag's page lists its shops in hidden Shops lists
  (`[data-map-element="tag-shop"]`, `data-id` = shop slug; a second list starting at
  item 101 covers tags with more than 100 shops). The script fetches those pages once,
  on first use, from `data-map-tag-page-path` (default `/shop-tags/`).

## v1.6.13 — 2026-10-10

### Added

- **"My Current Location" shows the place.** `[data-map-element="locate-status"]`
  keeps whatever text it has in Designer ("Not set") until a place is chosen with
  "use my location": the GPS button shows `data-map-location-label` (default
  "Your location") and a typed address shows what was typed. Locate Clear, or a new
  search from the search bar, puts "Not set" back.

### Changed

- **The results status can carry placeholder text in Designer.** On the published
  page `[data-map-element="search-status"]` starts empty and is filled with search
  results. The stylesheet hides it until the script has emptied it, so the
  placeholder never flashes.
- A new radius, Reset and Clear keep the "My Current Location" text in step with the
  place the radius is measured from.

## v1.6.12 — 2026-10-10

### Added

- **Regions Clear.** `[data-map-element="region-clear"]` deselects the region and
  flies the map back to the view of everything, matching the Clear links on
  Highlight and Use My Location.

## v1.6.11 — 2026-10-10

### Added

- **Region buttons work.** `[data-map-element="region"]` (with `data-slug`) flies the
  map to that region's dots and marks the button `aria-pressed`. Pressing the active
  one again returns to everything.
- **"Show Things To Do" switch works.** `[data-map-element="destinations-toggle"]`
  hides only the destination dots (open destination cards close with them). It is
  keyboard operable (Space or Enter). Searches and region fits leave destinations
  out while it is off, and the "N shops within…" count is shops only.
- **Use My Location.** `locate` asks the browser for a position only when pressed,
  `locate-input` looks up an address on Enter, and `locate-clear` forgets the place
  and shows everything again. Both fields measure the radius from the same place as
  the search bar.
- **Radius Reset.** `[data-map-element="radius-reset"]` puts the radius back to the
  default.
- Pressed and off states for the region buttons and the switch, driven by the ARIA
  attributes (Designer cannot style on them).

### Changed

- **The default radius is shown.** Every radius `<select>` starts on
  `data-map-search-radius` (set it to `10` on the map div) while the list keeps its
  ascending order. The search bar's select and the panel's select now move together,
  and changing the radius re-applies to the place already found instead of looking
  it up again.
- **An option with an empty value still works.** Its miles come from its label
  ("10 miles"), so it no longer reads as `NaN`.

## v1.6.10 — 2026-10-10

### Changed

- **Popup width is relative to the map, not the screen.** `data-map-popup-max-width`
  now defaults to `min(30rem, calc(100% - 2.5rem))`. On a phone the card leaves
  1.25rem on each side, enough for the close circle that overhangs its corner by
  1rem, so the circle is no longer clipped by the map edge.
- **Zoom buttons step aside on phones.** At 767px and below, the +/- control fades
  while a card is open (it collided with the card's close circle) and returns when
  the card closes. Pinch zooms on touch.

## v1.6.9 — 2026-10-10

### Added

- **Settings panel opens.** At 991px and below, the settings button
  (`data-map-element="quick-picks-open"`) opens the panel
  (`data-map-element="quick-picks"` form's `.w-form` wrapper) as a dialog:
  backdrop, a close button, focus moves in, Tab stays inside, Escape / backdrop /
  close dismiss it and focus returns to the opener, page scroll is locked while
  open, and `aria-expanded`, `aria-controls` and `role="dialog"` are kept in sync.
  Growing past 991px closes it and restores the desktop column. The panel is only
  hidden once JavaScript has tagged it, so it stays visible without JS.

### Changed

- **Popup cards use their own designed width.** `data-map-popup-max-width` now
  defaults to `min(30rem, calc(100vw - 3rem))` instead of 320px, so the three shop
  buttons (Directions, Call Now, Visit Site) sit on one row and only wrap under the
  tags when there is no room.

## v1.6.8 — 2026-10-10

### Added

- **Premium seal.** `data-map-premium` on the map div: `all` (default, the seal
  shows on every shop card), `cms` (only shops marked Premium; the hidden item
  holds a `[data-map-field="premium"]` element whose visibility is bound to the
  Premium switch, because a switch cannot bind to an attribute), or `none`.

### Changed

- Reference head-code block rewritten for the current design: removed the rules
  for list-item cards that the templates replaced (`.map-item_show-modal`, the
  popup card padding, the active list outline).

## v1.6.7 — 2026-10-10

### Fixed

- **Broken image on destinations with no Featured Image.** An empty CMS image falls
  back to the asset the hidden element was created with, and the script treated
  that as a real photo. Webflow marks the empty case with `w-dyn-bind-empty`, which
  the script now checks; `data-map-placeholder` (the fallback asset id) is a second
  check. With no image, the slot and its wrapper are removed.

## v1.6.6 — 2026-10-10

Includes everything in v1.6.5.

### Changed

- **Close button is a circle on the card's corner.** A white 32px circle centred on
  the card's top-right corner point, in the cut-out of the rounded corner, so it
  never overlaps anything inside the card (the premium badge). Variables:
  `--map-popup-close-inset` (default half the size, negative), `-bg`, `-shadow`,
  `-hover-bg`, `-radius`.

### Added

- **Destination images.** An image field cannot bind to an attribute, so the hidden
  destination item carries `<img data-map-field="image">` bound to Featured Image.
  Its `src` and alt go onto the template's `data-map-slot="image"`. With no image,
  the slot and its empty wrapper are removed.

## v1.6.5 — 2026-10-10

Includes everything in v1.6.4.

### Fixed

- **Caret hidden under the card's shadow.** MapLibre puts the popup tip before the
  card in the DOM and leaves it unpositioned, so the card and its large drop
  shadow painted over it. The tip is now positioned with `z-index: 2` and nudged
  up 1px to overlap the card edge. Its colour is `--map-popup-tip-color`
  (default white, matching the card).

## v1.6.4 — 2026-10-10

Includes everything in v1.6.3.

### Changed

- **Clicking a dot centres the card.** The map flies to the dot and the card
  opens centred in the map, with the dot just below it. The offset is measured
  from the real card height, so a taller card sits correctly without tuning, and
  the dot is kept inside the map on short maps. A non-zero
  `data-map-focus-offset` still overrides the measured value. Clicking the dot
  of an open card closes it and leaves the camera alone. Honors
  `prefers-reduced-motion` (no flight).
- **Card stays above the dot.** The popup anchor is fixed to the bottom, so the
  card no longer flips below the dot while the map is moving.
- List-row clicks use the same behavior.

## v1.6.3 — 2026-10-10

### Fixed

- **Close button hidden under the card.** The shop card has its own `z-index: 1`
  and painted over MapLibre's absolutely positioned close button, hiding it and
  swallowing the click. The button now has `z-index: 2`.
- **Dots announced as "Map marker".** MapLibre sets that label when a marker is
  added, replacing the place name. The name is now applied after the marker is
  added.

## v1.6.2 — 2026-10-10

Popups are built from static card templates instead of the list items.

### Added

- **Template cards.** `[data-map-template="shop"]` and `[data-map-template="destination"]`
  blocks hold one designed card each, marked `data-map-card`, with fields marked
  `data-map-slot`. The popup clones the card and fills the slots from data
  attributes on the hidden Collection Item (`data-name`, `data-display-name`,
  `data-region-name`, `data-town-name`, `data-description`, `data-address`,
  `data-phone`, `data-website`, `data-google-map-link`, `data-directions-link`).
  Empty values remove their slot. With no template on the page the old
  list-item clone still runs.
- **Marker names.** The marker's accessible name comes from `data-display-name` or
  `data-name`.

### Not yet filled

Tags, the premium seal, destination images and nearby shops have no data source on
the hidden items, so those slots are dropped from the popup.

## v1.6.1 — 2026-10-10

Shop-icon pins replaced by centered dots: Redwood for shops, Harbor Blue for
items with `data-map-kind="destination"`. Popup offset default 18 -> 14.

## v1.6.0 — 2026-07-21

Popup presentation fixes, all three visible in the card.

### Fixed

- **No focus ring on the Directions link when a popup opens.** MapLibre's
  `focusAfterOpen` is on by default and moves focus to the first focusable
  element, which is the first link in the card. Now off. Verified against a
  control: with it on, `document.activeElement` is the Directions anchor; with it
  off, focus stays on `body`.

  This is a mild accessibility trade — keyboard users are no longer moved into
  the popup on open. Set `data-map-popup-focus="true"` to restore it.

- **No more double edge around the card.** The popup shell drew its own white
  background, 12px radius and drop shadow, and the cloned card drew its own on
  top — two nested boxes. The shell is now chrome-less by default
  (`--map-popup-bg: transparent`, radius `0`, shadow `none`, padding `0`), so the
  card's Designer styling is the only edge. `overflow` on the shell also changed
  from `hidden` to `visible`, which was clipping the card's own drop shadow.

  Restore a styled shell by setting the `--map-popup-*` variables if a card ever
  has no styling of its own.

- **Bigger close button, sitting inside the card.** Was 16px in a 21×26px box at
  the very corner — which was out in the shell padding that no longer exists.
  Now 24px in a 32×32px target, inset 4px, with a hover background. Driven by
  `--map-popup-close-*` variables.

### Head-code block (re-paste required)

- Adds inner padding on the popup card (`.cms-map-popup-card .map-item_wrapper`),
  since the shell no longer supplies any. Scoped to the clone, so list rows keep
  their tighter spacing.

## v1.5.0 — 2026-07-21

Stops the component fighting the card styling set in Webflow. The popup is a
clone of the Collection Item and carries its Designer classes, but several rules
here out-specified them.

### Fixed

- **MapLibre's typography no longer leaks into the card.** MapLibre sets its own
  font stack on the map container; the popup lives inside it, so a cloned card
  inherited Helvetica Neue 12px instead of the site's type. The container's font
  is now reset to `inherit`, and MapLibre's own controls/attribution are pinned
  back to 12px so they stay the size the library expects.
- **The card root is no longer restyled.** `display: block`, `font: inherit`,
  `color: inherit` and the padding were all overriding Designer. The rule is
  gone; only a `max-width: 100%` image guard remains. Popup padding moved to
  `.maplibregl-popup-content`, so the card keeps whatever padding it has in
  Designer.

### Changed — head-code block (re-paste required)

- Dropped the rules that were overriding Designer: `font-weight: bold` on the
  popup, `text-decoration: none; color: inherit` on card links (this was what
  flattened the Directions / Order Now link styling), the card `max-width`, and
  the image margin/radius.
- **Popup-only content is now hidden in the list instead of revealed in the
  popup.** Previously `.map-item_show-modal` was Display: None in Designer and a
  head-code rule forced it back with its own flex/gap, dictating layout. Now the
  wrapper is styled freely in Designer and hidden only in the list copy via
  `[data-map-element="item"]:not(.cms-map-popup-card)` — the popup clone is the
  only copy carrying that class, so it goes untouched.

  **Action needed:** remove Display: None from `.map-item_show-modal` in
  Designer, or it stays hidden everywhere.

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
