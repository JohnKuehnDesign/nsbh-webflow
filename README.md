# nsbh-webflow

Custom code for the [North Shore Beef Hub](https://nsbh.webflow.io) Webflow site.

Hosted here and served to Webflow through [jsDelivr](https://www.jsdelivr.com/),
pinned to a release tag. Nothing on the live site changes until the version
number in the Webflow custom code is bumped by hand.

## What's in here

| Path | Purpose |
|---|---|
| `src/shop-card/shop-card.js` | The shop card: builds a card from the template, fills tags and distance, and opens it from list links. Loads before the map |
| `src/map/map-embed.js`   | The CMS map component — markers, search, settings panel, region shapes |
| `src/map/map-embed.css`  | Minimal styles for the runtime-injected marker and popup DOM |
| `webflow/head-code.html` | Copy-paste block for Page Settings → Inside `<head>` |
| `webflow/footer-code.html` | Copy-paste block for Page Settings → Before `</body>` |
| `src/consent/consent.js` | Opt-out analytics consent: the cookie banner, Decline, Cookie Settings, Global Privacy Control. Site-wide, top of head code |
| `src/analytics/analytics.js` | GA4 click events for shop card buttons (`shop_click` + key events). Site-wide; sends nothing while analytics is off |
| `webflow/site-analytics.html` | Copy-paste blocks for Site settings → Custom code: `consent.js` + gtag (head) and `analytics.js` (footer) |
| `src/nav/nav.js` | The R2 Nav: pill bar on scroll up, phone and tablet menu. Site-wide |
| `webflow/site-nav.html` | Copy-paste line for Site settings → Custom code → Footer code: `nav.js` |
| `src/seasonal/seasonal.js` | The R2 Seasonal Guides: opens the current season on scroll-in, hover/focus on desktop, chevron toggles on tablet and phone. Loaded by an embed inside the component |
| `src/places/places.js` | The R2 Destinations Index on Things to Do: region filter (chips, phone select, `?region=`), "Show more destinations", count and status. Loaded by an embed inside the component |
| `src/faq/faq.js` | The R2 Guide FAQ on the Log post template: turns the FAQ Rich Text (H3 questions) into a `<details>` accordion, first open. Loaded by an embed inside the component |
| `src/guide-menu/guide-menu.js` + `.css` | Seasonal guides, tablet and phone: the floating section menu. Built from the "In this guide" contents nav, shows from the first numbered section to the end of the last, tracks the current section, sits below the R2 Nav pill. Loads its own CSS. Page footer code on each guide |

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
| `data-map-element="marker-image"` | A hidden Image element whose `src` becomes the pin icon | Optional |
| `data-map-element="item"` | Each Collection Item | Yes |
| `data-id` / `data-lat` / `data-lng` | Each Collection Item, bound to Slug / Latitude / Longitude | Yes |
| `data-google-map-link` | Each Collection Item, bound to **Google Business Map Link** | Optional |
| `data-directions-link` | Each Collection Item, bound to **Directions Link** | Optional |
| `data-website` | Each Collection Item, bound to **Website** | Optional |
| `data-order-link` | Each Collection Item, bound to **Order Link** | Optional |
| `data-map-element="search-input"` | Address / zip text input | Optional |
| `data-map-element="search-radius"` | `<select>` of miles (5/10/25/50/100) | Optional |
| `data-map-element="search-submit"` | Search button | Optional |
| `data-map-element="search-clear"` | Clear button | Optional |
| `data-map-element="search-status"` | Text block for the result summary | Optional |
| `data-map-element="suggest"` | Wrapper under the input for the suggestions, carrying the `hidden` attribute | Optional |
| `data-map-element="suggest-list"` | The `role="listbox"` inside it, filled by the script | Optional |
| `data-map-template="suggestion"` | Sample rows the script clones (see below) | Optional |

The search UI is skipped entirely if neither input nor submit is present.

### Search suggestions

Typing two or more characters in the search input lists, in this order, regions,
towns that have shops, then shops matched on name or address (up to five regions,
five towns and 25 shops; the list scrolls). Case, accents and apostrophes are
ignored (`Sal's` finds `sals`), and every word typed must appear. Choosing a row:

- **Region:** the same as pressing its region button, so the pressed state follows.
- **Town:** the camera fits that town's shops.
- **Shop:** the dot's card opens and the map centres on it.

Arrow keys move the highlight and Escape closes the list. Enter picks the
highlighted row. With none highlighted: a region or town typed in full, or the start
of exactly one place name, is picked; one shop matched on its name opens, several
keep the list open; anything else, including text that only matches shop addresses
(a town outside the CMS, a ZIP), goes to the address search and its radius.

### Your location: pin and distance

The Use my location button and the address field beside it set the visitor's own
place. Neither moves the camera or runs the radius search; the search bar does that.

- **GPS button** (`data-map-element="locate"`, a `<button type="button">` with the icon
  embed inside) asks the browser, on click only. **Address field**
  (`locate-input`): Enter looks the text up (address, town or ZIP).
- **Pin:** a clone of `[data-map-template="location"]` (Designer's `my-location_pin`)
  is placed at the spot. Without that block a plain dot from the stylesheet is used.
  A second place moves the pin; Clear (`locate-clear`) removes it.
- **Status:** `locate-status` shows what was typed. For GPS it shows
  `data-map-location-label` at once, then "Town, ST" (or the ZIP when there is no town)
  from one Nominatim reverse lookup; if that fails the label stays. Its Designer text
  ("Not set") shows when nothing is chosen.
- **Distance flag:** a card template element marked `data-map-slot="distance"` (with
  an optional `data-map-slot="distance-text"` inside it for the words) is hidden until
  a place is set, then reads "4.2 miles away" (straight line). It is filled each time a
  card opens, and updated on a card that is already open. In the shop template the flag
  can sit beside the card inside the popover wrapper; the script puts it in front of
  the card in the popup. The look and position are Designer's (`position: absolute`
  with `bottom: 100%` sits it on the card's top edge at any height). The Shops by
  region list shows no distance.

### Keyboard and screen readers

- Tab order is search, map, settings panel. The dots are clickable but not tab
  stops; shops are reached through the search suggestions and the list below the map.
- Choosing a shop from the suggestions, or pressing Enter on a dot, moves focus into
  the card. Escape or the close button closes it and returns focus to the search or
  the dot.
- Links that act as buttons (`search-submit`, `search-clear`, `region-clear`,
  `tag-clear`, `locate-clear`, `locate`, `radius-reset`) get `role="button"` and
  respond to Space.
- Give every control an accessible name in Designer with `aria-label`: the destinations
  switch, the radius select, the address input and each Clear link (they would
  otherwise all read as "Clear"). Put `role="group"` and an `aria-label` on the region
  and tag chip lists.

The look is built in Designer. Put the `data-map-template="suggestion"` block in the
card templates section, with one row marked `data-map-suggest="place"` (slots
`name` and `label`) and one marked `data-map-suggest="shop"` (slots `name` and
`address`). The row highlighted from the keyboard gets an `is-active` class. Set
`data-label-region` / `data-label-town` on the template block to change the words
"Region" and "Town". The input should carry `role="combobox"`,
`aria-autocomplete="list"`, `aria-controls` (the list's id) and `aria-expanded="false"`.
Without the template or the list the search is address-only, as before.

**Note on the 157 shops:** Webflow caps a Collection List at 100 items, so the
page uses two lists (Show 100 / Skip 0, and Show 100 / Skip 100), both filtered
to `Longitude is set`, pagination off. Both serve double duty as the visible list
and the map's data source. `collectItems()` de-duplicates by `data-id` as a
safety net.

### Tags: highlight and card tags

A shop's tags are a multi-reference, which cannot be bound to an attribute, so the
shop-to-tag link comes from each **Shop Tag's own page**.

| Attribute | On |
|---|---|
| `data-map-element="tag"` + `data-slug` (bound to the tag's slug) | Each chip in the panel's Highlight list (a `<button>`) |
| `data-map-element="tag-clear"` | The Highlight Clear link |
| `data-map-element="tag-shop"` + `data-id` (bound to the shop slug) | Each item of the hidden Shops list(s) on the **Shop Tags template page** |
| `data-map-slot="tags"` / `"tag"` / `"tag-icon"` / `"tag-name"` | The card template's tags row, one tag, its icon embed, and its name text |

On the Shop Tags template page, the hidden Shops list is filtered "Shop Tags contains
the current Shop Tag". Collection Lists stop at 100 items, so a tag that can pass 100
shops gets a second list set to start at item 101, with the same attributes. The
template page must be **published**, and should carry
`<meta name="robots" content="noindex, follow">` and be excluded from the sitemap.

On the first chip press or popup open the script fetches `/shop-tags/<slug>` for each
chip (`data-map-tag-page-path` changes the prefix) and caches the shop ids. Pressing
chips gives shops with **every** chosen tag a light-green ring and mint glow
(`--map-marker-highlight`, `--map-marker-highlight-ring`); other dots are left as they
are. The chips toggle `aria-pressed` and an `is-active` class: style the pressed look in
Designer on a combo class named `is-active` (keep a hidden keeper element carrying the
combo so clean-up does not remove it).

### Region boundaries

Pressing a region (a `data-map-element="region"` button) tints that region's shape
and fits the camera to it. Only the pressed region is drawn, under the map labels,
with a thin outline. It is decoration: dots, search and filters are unchanged.

- **Shapes:** `src/map/regions.geojson`, five features keyed by region slug, loaded
  from beside the script on the first press (or on hover/focus of a region button).
  If it cannot load, the region fit uses the dots instead.
- **Look:** `data-map-region-color` (default Harbor Blue `#35798c`) and
  `data-map-region-opacity` (default `0.2`; `0` turns the overlay off). The outline
  uses the same colour at three times the opacity.
- **Rebuilding:** `tools/regions/build-regions.sh` merges MassGIS town boundaries
  (generalized-coast version) into regions using `tools/regions/town_region.csv`
  (taken from the Towns CMS collection). Boston and East Boston are left out on
  purpose. Brookline and Lincoln are not CMS towns; they are listed under Greater
  Boston so it has no hole. When a town changes region in the CMS, edit the CSV and
  rebuild.

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
| `data-map-focus-offset` | `focusOffset` | `0` | Pixels to drop the focused pin below centre, giving the popup headroom above it. See below |
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
| `data-map-location-label` | `locationLabel` | `Your location` | Text shown in `locate-status` right after "use my location" (GPS), until the town name comes back. A typed address shows what was typed |
| `data-map-region-color` | `regionColor` | `#35798c` | Colour of the pressed region's tint and outline (Harbor Blue) |
| `data-map-region-opacity` | `regionOpacity` | `0.2` | Tint opacity; the outline is three times this. `0` turns the overlay off |
| `data-map-region-shapes` | `regionShapes` | `regions.geojson` beside the script | Only to point at a different shapes file |
| `data-map-tag-page-path` | `tagPagePath` | `/shop-tags/` | Path prefix of each Shop Tag's page; the tag's slug is added to the end |
| `data-map-marker-image` | `markerImage` | stylesheet default | Marker icon. A bare URL, or any CSS image value |
| `data-map-marker-size` | `markerSize` | `2rem` | Marker width and height |
| `data-map-marker-color` | `markerColor` | `--_primitives---colors--h-redwood` | Marker `color` |
| `data-map-marker-active-scale` | `markerActiveScale` | `1.15` | Scale on hover / active |
| `data-map-popup-focus` | `popupFocus` | `false` | Move focus into the popup on open. Off, because it lands a focus ring on the first link; `true` restores the keyboard behaviour |

An unparseable attribute logs a warning and falls through to the next source
rather than breaking the map.

#### Giving the popup headroom (`focusOffset`)

Clicking a list item flies the map so the pin sits dead centre. The popup opens
off the pin, so on a short map a tall card runs past the frame and the buttons at
its bottom get clipped.

`data-map-focus-offset` lands the pin that many pixels *below* centre instead,
leaving room for the card above it. Pick it from the card height rather than by
eye: a card needs roughly `card height + 18px popup offset + a little padding`
of space above the pin, and a centred pin only has half the map height.

Measured on this site — map 320px tall, cards 134–168px — a centred pin has
160px of headroom against the ~190px a tall card wants, hence the clipping.
**70** puts the pin at 230px, comfortably clearing the tallest card, and still
works on the 420px desktop map. Raise it if cards get taller.

Note this only affects the fly-to from a list click. Clicking a marker directly
doesn't recentre the map, so a pin near the very top or bottom edge can still
show a clipped card.

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

The popup is the shared card from `shop-card.js` (see "The shop card" below),
built from the `[data-map-template]` cards on the page. Without `shop-card.js` or
a template, the popup shows the place's name only. Earlier versions copied the
hidden Collection Item instead, with options to drop elements and to add
Directions / Order Now buttons; those were removed in v1.11.0.

### Styling

Split deliberately:

- **This repo** styles only what Webflow can't reach — the marker `<button>` and
  the MapLibre popup shell, both injected into the DOM at runtime. It does
  **not** style the popup card: that's a copy of the template card and
  carries your Designer classes, so anything set here would out-specify them.
  The one exception is resetting MapLibre's font on the map container, which
  otherwise leaks its own Helvetica/12px into the cloned card.
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
| `--map-popup-bg` | `transparent` |
| `--map-popup-radius` | `0` |
| `--map-popup-shadow` | `none` |
| `--map-popup-padding` | `0` |
| `--map-popup-close-size` | `32px` |
| `--map-popup-close-font-size` | `24px` |
| `--map-popup-close-inset` | `4px` |
| `--map-popup-close-hover-bg` | `rgba(0,0,0,.06)` |

The popup shell is deliberately chrome-less: the card inside is a copy of the
template card and already has a background, radius and shadow from Designer, so
a styled shell reads as a second edge around it. Set the `--map-popup-*` values
above if a card ever has no styling of its own.

The four marker variables also have `data-map-marker-*` attribute equivalents,
because Webflow's style panel has no field for setting a custom property. Set
the pin icon in Designer with:

```
data-map-marker-image = https://your-asset-url/pin.svg
```

The attribute writes the variable inline on the map div, so it wins over the
stylesheet. A bare URL is wrapped in `url("…")` for you; a full CSS value
(`url(…)`, `none`, a gradient) is passed through untouched.

#### Setting the pin image from the Asset Manager

Pasting an asset URL is fiddly. For a fully Designer-native pin, drop an **Image**
element anywhere in the map section, pick the icon from the Asset Manager, set it
to **Display: None**, and give it the attribute:

```
data-map-element = marker-image
```

On load the script reads that image's `src`, uses it as the marker, and keeps
the element hidden. Swapping the pin is then just swapping the image in Designer —
no code, no URL. Priority: `data-map-marker-image` (or head config) wins if set,
otherwise the element, otherwise the stylesheet default.

Popup content is a copy of the template card, so a card styled once in Designer
works in the map popup and in every list that opens cards.

---

## The shop card

`src/shop-card/shop-card.js` builds every shop card on the site from one designed
template, so a card change is made once, in Designer, on the template. It has no map
code and no dependencies, and loads on its own on pages without a map. On the map
page it loads **before** `map-embed.js`, which uses it for the popup.

Where cards come from today:

| Page | Cards | How |
|---|---|---|
| The Map | Map popups and the Shops by region popovers | `shop-card.js`, both footer scripts |
| Fall Guide, Spring Guide | Nearby Beef Shops chips | `shop-card.js` (checklist below) |
| Destinations Template | Nearby Beef Shops cards | Static Webflow markup, no script (see "Inline cards" below) |
| Regions Template | The region's shop cards | Static Webflow markup, no script |
| Blog Posts Template (Log post) | Related Beef Shops cards | Static Webflow markup, no script |

**Why some pages need the script and some don't.** It comes down to whether the
card already exists in the published HTML or has to be built when someone clicks.

- **Built on demand (needs `shop-card.js`): The Map, Fall Guide, Spring Guide.**
  These pages carry only a list of links plus hidden per-shop data
  (`data-shop-card="source"` items) and **one** hidden card template. On click or
  hover the script fills the template with that shop's data, then does what static
  HTML can't: places the card beside the link on desktop (right if it fits, else left,
  else below) or as a modal on phone/tablet, handles Escape and focus return, fetches
  the shop's tags from the Shop Tag pages (a multi-reference can't be bound to an
  attribute), adds the distance flag once a location is set, and feeds the map's pin
  popups. One shared card keeps 163 shops (or 53 guide chips) from each shipping a
  full card in the HTML.
- **Static (no script): Destinations, Regions and Log post templates.** Each card is
  a real Collection List item with every field bound in Designer, so Webflow writes
  the finished card at publish time. The little logic they need is handled without
  JavaScript: two attribute-only rules in each template's page head code hide links
  bound to an empty field (`href="#"`) and hide Order now when Visit site has a real
  link; tags are a nested Shop Tags Collection List; the Premium seal's visibility is
  bound to Premium?; and `analytics.js` (site-wide) tracks clicks from the
  `data-track-*` attributes bound on the card, the same as script-built cards.

### Adding cards to a page (checklist)

1. **Place `shop-card-template_component`** (Components panel, group "shop-cards")
   once, anywhere on the page. It holds the shop template and a hidden Shop Tags list
   for the tags row. Edit the shop card design inside the component; every page
   updates. (The destination template is map-only and lives on the map page, in the
   "Map templates" block.)
2. **Load the script** in the page's Before `</body>` code (skip on the map page, where
   it is already loaded before `map-embed.js`):
   `<script defer src="https://cdn.jsdelivr.net/gh/JohnKuehnDesign/nsbh-webflow@X.Y.Z/src/shop-card/shop-card.js"></script>`
3. **Mark the list:** on each Collection Item, `data-shop-card="source"` plus the 14
   data attributes in the table below; on its link, `data-shop-card-open`; the
   description and address as text with the `sr-only` class, outside the link.
4. **Publish and check:** hover a link on desktop, tap one on a phone, and Tab + Enter
   then Escape from the keyboard.

The component root carries `data-shop-card="templates"`, hidden by one site-wide
head rule: `[data-shop-card="templates"] { display: none; }`.

**The template.** `[data-map-template="shop"]` inside `shop-card-template_component`: the panel
marked `data-map-card`, its fields marked `data-map-slot` (see the head code's
attribute map). Optional: `data-shop-card-premium="all|cms|none"` on it sets the
premium seal for every page (default `all`; the map's `data-map-premium` is only a
fallback).

**Tags.** The tags row takes each tag's icon and name from the hidden Shop Tags list
in the component (items marked `data-shop-card="tag"` with `data-slug`), or from the
map's filter chips. Which shops carry a tag still comes from the tag pages.

**Shop lists.** A list of shops that should open cards (the region lists on the map
page and the guide chips):

| Attribute | On |
|---|---|
| `data-shop-card="source"` | The Collection Item |
| `data-id` (Slug), `data-name`, `data-display-name`, `data-region-name`, `data-town-name`, `data-address`, `data-description`, `data-phone`, `data-website`, `data-order-link`, `data-google-map-link`, `data-directions-link`, `data-lat`, `data-lng` | The Collection Item, each bound to its CMS field (reference fields through their sub-field, e.g. Region > Name) |
| `data-shop-card-open` | The link inside the item. No value needed: the card uses the item it sits in. A slug as the value uses another element's data instead |

`data-lat` and `data-lng` only feed the distance flag, which needs a place set on the
map, so pages without a map can leave them off (the guides do). `data-directions-link`
is empty for almost every shop; the Directions button falls back to
`data-google-map-link` (bound to Google Business Map Link).

**Visit Site or Order.** The template holds both a Visit Site button
(`data-map-slot="website"`) and an order button (`data-map-slot="order"`). A shop with
a Website shows Visit Site only. A shop with no Website but an Order Link shows the
order button instead. With neither, both are removed. A template without the order
button behaves as before v1.13.0.

Binding the attributes: in Designer, or through the Webflow MCP's element settings
tool (`set_settings` with a CMS binding on the `attributes` key). Its `get_settings`
(`all_raw_settings`) shows which field each attribute is bound to; the plain attribute
read shows a bound value as `null`. In nested lists (one per guide section), bind one
list, then paste its Collection List Wrapper into the other sections and check each
list's source.

The item holds no popover. One shared popover is built on demand from the
template's own `.shop-popover` wrapper and added to the end of the page:

- Desktop (992px and up): opens on hover beside the link and stays open while the
  pointer moves into it; also opens on click or Enter, with focus moved into the card.
  Escape, tabbing out, scrolling or resizing closes it.
- Tablet and below: opens full screen on tap over the backdrop, with focus on the
  close button and the page scroll locked.
- The link gets `aria-haspopup="dialog"`, `aria-expanded` and `aria-controls`; the
  card is `role="dialog"`, named by its heading.
- The distance flag shows once the visitor sets a place on the map, and the tags
  row fills from the tag pages, as in the map popup.

**For screen readers and search.** The card text is no longer in the page HTML, so
each list item keeps the description and address as text with the `sr-only` class
(visually hidden, still read and indexed). Keep them outside the link, so tabbing
through the list reads only shop names.

**API** (`window.NSBHShopCard`): `build`, `popupHtml`, `fillTags`, `loadTags`,
`fillDistance`, `setOrigin`, `findSource`. Notes are at the top of the file.

### Inline cards (Destinations, Regions and Log post templates)

These pages show shops as cards in the page, not popovers, so they use no script (see
"Why some pages need the script" above). Each template's Collection Item copies the
component's `shop-card-r2_*` classes and order, with the `is-inline` combo on
`_card` (border, radius, `height: 100%`), `_layout` (`flex-grow: 1`) and `_actions`
(`margin-top: auto`) for equal-height cards with the buttons at the bottom:

1. `_seal` (visibility bound to Premium?) with `_seal-image` (Lion submark)
2. `_eyebrow` > `_eyebrow-group` (Region / Name, `_eyebrow-sep` "/"), then Town / Name
3. `_title` > `_name` (H3, Display Name) + `_address`
4. `_note` (Short Description)
5. `_tags` > nested Shop Tags list > `_tag` (icon in `map-UI_svg-embed` + Name)
6. `_actions` > `_links` (Directions → Google Business Map Link, Call now → Phone
   Number, as `_link`), then Visit site → Website and Order now → Order Link (both
   `_button`). Order now must sit **directly after** Visit site.

Attributes: the card carries `data-track-card="shop"`, `data-track-id` (Slug) and
`data-track-name` (Name); each link carries `data-track-link`
(`directions`/`call`/`website`/`order`); Visit site and Order now also carry
`data-shop-link` (`website`/`order`).

Each template's page head code has the same two rules, attribute selectors only so a
class rename can't break them:

```html
<style>[data-track-card="shop"] a[href="#"]{display:none}</style>
<style>[data-track-card="shop"] a[data-shop-link="website"]:not([href="#"]) + a[data-shop-link="order"]{display:none}</style>
```

**A design change to the shop card has to be made in four places:** the component
(`shop-card-template_component`, which covers The Map and the guides) and, by hand,
the three inline copies (Destinations, Regions, Log post). The `shop-card-r2_*`
classes are shared, so a class style change reaches all of them at once; a change to
structure, bindings, attributes or copy does not. The same goes for a new Shop Tag:
it shows on inline cards automatically (nested list), but script-built cards read
tags from the tag pages (see "Tags: highlight and card tags").

Known Designer-only gap: the head CSS doesn't run in the Designer, so there every
inline card shows both buttons and any empty links, and the tag icons show as tall
embed placeholders. Published pages are correct. Planned cleanup: conditional
visibility instead of the head CSS, and a fixed size on the icon embed.

---

## The nav

`src/nav/nav.js` drives the R2 **Nav** component (Webflow, group R2). The styling is
all Webflow classes; the script only adds and removes two combo classes:

- `is-visible` on the pill bar: scrolling up past the hero shows it, scrolling down
  or back into the hero hides it. Movements under 6px are ignored. It stays shown
  while it holds keyboard focus (`:focus-visible`; mouse and touch focus don't count).
  With Reduce Motion on, the pill fades instead of sliding.
- `is-open` on the phone and tablet menu: the menu buttons open it; the close button,
  Escape, a menu link or widening to desktop close it. While open, page scroll is
  locked, focus moves to the close button and stays inside, and it returns to the
  button that opened it.

The hero ends at the bottom of the first `.section_hero-r2`; pages without one use
twice the top bar's height.

### Page hooks

| Attribute | On |
|---|---|
| `data-nav-r2="bar"` | The pill bar (`nav-r2_bar`) |
| `data-nav-r2="open"` | Both menu buttons (top bar and pill) |
| `data-nav-r2="menu"` | The menu (`nav-r2_menu`, `#nav-r2-menu`) |
| `data-nav-r2="close"` | The menu's close button |

Classes can be renamed freely as long as these stay. One Nav per page.

`is-visible` and `is-open` are also on a hidden "Nav R2 class keeper" block on the
COMPONENTS page, so Style Manager Clean Up never deletes them. The Nav component's
description in Webflow says how to preview them in the Designer.

## The seasonal guides

`src/seasonal/seasonal.js` drives the R2 **Seasonal Guides** component (Webflow, group
R2; four **Seasonal Panel** instances live inside it). It only moves one combo class,
`is-open`, between panels. The open, closed and stacked styles are in the component's
own style embed, and the script tag is in its hidden embed, so any page with the
section gets both (no page or site code to add).

- Nothing is open on load. When the panel row is 35% on screen, the panel whose
  `data-season` matches the section's `data-current` (the **Current season** prop,
  case-insensitive) opens.
- Desktop (992px and up): hovering or tabbing into a panel opens it; leaving the row
  with the pointer goes back to the current season.
- Tablet and phone: panels stack; the chevron button on a Live panel opens it and
  closes the others, and closes it on a second press. `aria-expanded` follows.

### Page hooks

| Attribute | On |
|---|---|
| `data-seasonal` | The section (`section_seasonal-guides`), with `data-current` |
| `data-seasonal-panel` | Each panel (`seasonal-panel_component`), with `data-season` |
| `data-seasonal-toggle` | The chevron button in a Live panel |

## The places index

`src/places/places.js` drives the R2 **Destinations Index** component (Webflow, group
R2) on Things to Do (`/destinations`). The page's Destinations Collection List sits in
the component's Cards slot with Webflow pagination on (12 per page). The chips, the
phone select and their CSS are in the component's two visible embeds (source:
`webflow/places-index-embeds.html`); the script tag is in its hidden embed.

- Webflow renders page 1. The script hides Webflow's pagination and, once the page is
  idle, fetches the other pages by following each Next link, adding their items to
  the list hidden. Then the count ("30 destinations") and status ("Showing 12 of 30") appear.
- "Show more destinations" reveals the next 12 matching places and focuses the first new card.
- A chip (tablet and up) or the select (phone) filters the whole list by region and
  resets to the first 12. The choice is kept as `?region=<slug>`, so
  `/destinations?region=cape-ann` opens filtered.
- Without the script, page 1 still shows; the count and status keep their placeholder text.

To add a region, add a chip and an `<option>` in the controls embed with the region's
CMS slug.

### Page hooks

| Attribute | On |
|---|---|
| `data-places` | The section (`section_places`, id `places`) |
| `data-places-filter="all\|<slug>"` | Each chip button (controls embed) |
| `data-places-select` | The phone `<select>` (controls embed) |
| `data-places-count` | The count text |
| `data-places-more` | The div around the "Show more destinations" R2 Button |
| `data-places-status` | The status text (`aria-live="polite"`) |
| `data-region` | Each card's Link Block (`destination-card_link`), bound to Region > Slug |

## The guide FAQ

`src/faq/faq.js` drives the R2 **Guide FAQ** component (Webflow, group R2) on the Log
post template and For Shop Owners. On posts, the title comes from FAQ Heading (H2)
and the questions stay one editable Rich Text field: an H3 per question followed by
its answer paragraphs. **Use FAQ field** is on by default. For static pages, turn
it off and put a questions component in the **Questions** slot; that component's
root carries `data-faq-source`, with H3/answer siblings. **Shop Owner Questions**
holds the nine original Q&As and their inline links. Both sources use the same script
and styles. Base keeps the blog spacing; **Standalone** adds top spacing and the
Figma 480px/remaining desktop columns. The accordion CSS is in the component's style
embed (source: `webflow/guide-faq-styles.html`); the script tag is in its hidden embed.
The styles are scoped to `[data-faq]` because the old accordions also use
`faq_question`, `faq_icon`, and `faq_answer`. The style embed needs
`data-faq-code="true"` so its wrapper does not add a third flex child and extra gap.
Keep corrections scoped; do not change the legacy classes site-wide. The plus/minus
SVGs in `webflow/faq-icons/` are exact Figma exports embedded as data URLs.

- A leftover H2 at the top of the rich text (older posts) is removed; its text is used
  for the title only if the title field is empty.
- Each H3 and everything up to the next H3 becomes
  `<details class="faq_item"><summary class="faq_question">H3 + icon</summary><div class="faq_answer">…</div></details>`.
  The first item is open on load. Opening another question closes the previous
  answer in that FAQ section; closing the active question can leave all collapsed.
- Answers stay in the DOM, so the FAQPage JSON-LD (the post's FAQ Schema field) still
  matches the visible questions.
- Without the script the rich text shows as written.

### Page hooks

| Attribute | On |
|---|---|
| `data-faq` | The section (`section_faq`) |
| `data-faq-heading` | The H2 title under the eyebrow (bound to FAQ Heading (H2)) |
| `data-faq-source` | The Rich Text bound to FAQ Rich Text |

## Destination intro

`webflow/destination-intro-embeds.html` is the inline style/script source for the R2
Destination intro on the Destinations CMS template. It does not need a jsDelivr tag.

The **Destination Intro** CMS group has three rich-text fields:

- **About the Place:** paragraphs, links, and optional subheadings.
- **Plan Your Visit:** a bulleted list; begin each item with a **bold label**, followed by its value.
- **At a Glance:** a numbered list using the same bold-label convention.

The template requires these wrapper attributes (classes identify the Designer target only):

| Designer target | Attribute | Value |
|---|---|---|
| section_destination-intro | data-destination-intro | true |
| destination-intro_about-column | data-destination-section | about |
| destination-intro_visit | data-destination-section | visit |
| destination-intro_glance | data-destination-section | glance |

The Rich Text fields retain `data-destination-about`, `data-destination-list="visit"`,
and `data-destination-list="glance"`. Generated labels, values, and formatted rows
also use data attributes. The inline embed has `data-destination-code="true"`; scoped CSS hides only that wrapper
so it adds no flex gap. Do not infer the wrapper from `document.currentScript.parentElement`,
whose placement can differ in Designer Preview.
About uses the shared `text-rich-text` class; the intro embed does not override its
paragraph or heading typography. Verify these hooks in the published DOM; a local fixture
does not prove Webflow saved them.

The formatter wraps each first bold label and its remaining rich text for layout.
It supports any number of rows, preserves links and inline formatting, removes empty
list items, and hides empty sections. Ordered-list numbers follow the current order.
Unformatted content remains readable if the script does not run. The hero Category
Line and optional Website URL action are separate fields. Original Full Description
and Practical info are retained; the unused fixed-row draft fields are grouped apart.

The current Shopify Merch section is retained as a reference beside a static R2
Merch CTA. Shopify integration for the new CTA remains a follow-up across the pages
that use it. Destination/Regions shop cards wait for the final Map card pattern.

## Making a change

1. Edit the file in `src/`.
2. Commit and push.
3. Tag a release: `git tag v1.1.0 && git push origin v1.1.0`. Wait ~4 minutes
   before anything requests the new version (see the note below).
4. In Webflow, change the version in **every** place below. They must all match.
5. Publish to staging (`nsbh.webflow.io`) and test before the custom domain.

Pushing alone changes nothing on the live site. Only step 4 deploys.

**Where the version lives** (updated 2026-11-03):

| Where in Webflow | What it loads |
|---|---|
| Site settings → Custom code → Head code | `consent/consent.js` (every page) |
| Site settings → Custom code → Footer code | `analytics/analytics.js`, `nav/nav.js` (every page) |
| The Map page (`/beef-country-map`) → Page settings → Inside `<head>` | `map/map-embed.css` |
| The Map page → Page settings → Before `</body>` | `shop-card/shop-card.js`, `map/map-embed.js` |
| Fall Guide → Page settings → Before `</body>` | `shop-card/shop-card.js` |
| Spring Guide → Page settings → Before `</body>` | `shop-card/shop-card.js` |
| Seasonal Guides component → hidden embed | `seasonal/seasonal.js` (every page with the section) |
| Destinations Index component → hidden embed | `places/places.js` (Things to Do) |
| Guide FAQ component → hidden embed | `faq/faq.js` (Blog Posts template) |

The versions don't have to match: a file that didn't change in a release can stay on
the older tag (the CHANGELOG lists what changed). A page that starts loading `shop-card.js` (e.g. the Regions Template, once its cards are
rebuilt) joins this list. To check what staging actually loads, search each page's
source for `nsbh-webflow@`.

**Push the tag before changing the versions.** If a page requests `@X.Y.Z` before the
tag is on the CDN, jsDelivr caches the 404. Clear it per file with
`https://purge.jsdelivr.net/gh/JohnKuehnDesign/nsbh-webflow@X.Y.Z/<path>`.

**The URL drops the `v`.** The git tag is `v1.1.0`, but jsDelivr strips the
leading `v` from semver tags, so the CDN path is `@1.1.0`. Using `@v1.1.0`
returns a 404. A new tag can take a few minutes to become available on the CDN.

### Testing checklist

- Map centers on the North Shore with ~137 markers
- Hover a list item → its marker grows; hover a marker → the list item highlights
- Click a list item → map flies to it, popup opens, other popups close
- Search `01906` at `25 mi` → status reports a count, map re-fits
- Clear → status empties, map re-fits to everything
- Press a tag chip → shops with that tag get the green glow; Clear removes it
- Open a shop popup → its tags show with icon and name; a shop with no tags shows no tag row
- Open a destination popup → its short description shows

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
  under in practice. The GPS button adds one `/reverse` call per press, to name the
  place.
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
