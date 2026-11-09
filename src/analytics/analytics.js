// NSBH analytics — click events for shop card buttons, to GA4 and PostHog.
//
// Hosted on GitHub, served to Webflow via jsDelivr as a classic deferred script,
// site-wide (Site settings → Custom code → Footer code):
//   <script defer src="https://cdn.jsdelivr.net/gh/JohnKuehnDesign/nsbh-webflow@X.Y.Z/src/analytics/analytics.js"></script>
//
// Sends nothing by itself. gtag and PostHog come from the consent snippets in
// webflow/site-analytics.html (consent.js), so for a visitor who declined neither
// exists and clicks are ignored. One who declines mid-page is covered by
// ga-disable (GA4) and opt_out_capturing (PostHog).
//
// Expects on the page:
//   [data-track-card="shop"]              The card. data-track-id is its CMS slug
//                                         (the stable key: it doesn't change when the
//                                         name is edited); data-track-name is its Name.
//                                         shop-card.js sets all three on every card it
//                                         builds; static cards (Destinations Template)
//                                         carry them as custom attributes bound in
//                                         Designer.
//   [data-track-link="..."]               Each button inside the card: website, call,
//                                         order, directions.
//   Destination cards carry the same attributes (shop-card.js marks every card) but
//   send nothing: Explore goes to the Hub's own destination page, which GA4 already
//   counts as a page view with the map as its referrer.
//
// Events (register each parameter as an event-scoped custom dimension in GA4):
//   shop_click         link_type, shop_id, shop_name
//   shop_order         shop_id, shop_name  } sent alongside shop_click for Order,
//   shop_call          shop_id, shop_name  } Call and Visit Site; GA4 key events,
//   shop_website       shop_id, shop_name  } registered "with code"
// PostHog gets shop_click only, with the same properties: its insights filter
// on link_type, so it doesn't need the separate key events.
//
// link_type comes from which button was clicked, never from its URL, so Visit Site
// and Order Now stay distinct even if a shop shows both later.

(function () {
  const EVENTS = {
    shop: { name: 'shop_click', id: 'shop_id', param: 'shop_name' },
  };
  // Key events get their own event name: GA4 marks whole events as key events, and
  // its no-code event builder can't derive them from shop_click's link_type.
  const KEY_EVENTS = { order: 'shop_order', call: 'shop_call', website: 'shop_website' };

  function track(e) {
    const ga = typeof window.gtag === 'function';
    // posthog is undefined while analytics is off; once it has loaded, an opted-out
    // visitor is skipped. (Before it loads, the stub queues the call in order.)
    const ph = window.posthog;
    const toPostHog = !!ph && typeof ph.capture === 'function' &&
      !(ph.__loaded && ph.has_opted_out_capturing());
    if (!ga && !toPostHog) return;
    // Middle-click opens a new tab; any other auxclick (right-click) isn't a visit.
    if (e.type === 'auxclick' && e.button !== 1) return;
    const link = e.target.closest && e.target.closest('[data-track-link]');
    const card = link && link.closest('[data-track-card]');
    const event = card && EVENTS[card.getAttribute('data-track-card')];
    if (!event) return;
    const linkType = link.getAttribute('data-track-link');
    const who = {
      [event.id]: (card.getAttribute('data-track-id') || '').trim() || '(not set)',
      [event.param]: (card.getAttribute('data-track-name') || '').trim() || '(not set)',
    };
    if (ga) {
      window.gtag('event', event.name, { link_type: linkType, ...who });
      if (event.name === 'shop_click' && KEY_EVENTS[linkType]) {
        window.gtag('event', KEY_EVENTS[linkType], who);
      }
    }
    // Sent right away by beacon: the click may leave the page or open another app.
    if (toPostHog) {
      ph.capture(event.name, { link_type: linkType, ...who }, { send_instantly: true, transport: 'sendBeacon' });
    }
  }

  // Capture phase, so the event is queued before any card or popover handler runs.
  document.addEventListener('click', track, true);
  document.addEventListener('auxclick', track, true);
})();
