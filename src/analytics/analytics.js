// NSBH analytics — GA4 click events for shop and destination card buttons.
//
// Hosted on GitHub, served to Webflow via jsDelivr as a classic deferred script,
// site-wide (Site settings → Custom code → Footer code):
//   <script defer src="https://cdn.jsdelivr.net/gh/JohnKuehnDesign/nsbh-webflow@X.Y.Z/src/analytics/analytics.js"></script>
//
// Sends nothing by itself. gtag comes from the consent-gated snippet in
// webflow/site-analytics.html, so until the visitor accepts analytics cookies
// window.gtag doesn't exist and clicks are ignored.
//
// Expects on the page:
//   [data-track-card="shop|destination"]  The card. data-track-name is the shop or
//                                         destination name. shop-card.js sets both
//                                         on every card it builds; static cards
//                                         (Destinations Template) carry them as
//                                         custom attributes bound in Designer.
//   [data-track-link="..."]               Each button inside the card: website, call,
//                                         order, directions (shops); explore,
//                                         website (destinations).
//
// Events (register each parameter as an event-scoped custom dimension in GA4):
//   shop_click         link_type, shop_name
//   destination_click  link_type, destination_name
//
// link_type comes from which button was clicked, never from its URL, so Visit Site
// and Order Now stay distinct even if a shop shows both later.

(function () {
  const EVENTS = {
    shop: { name: 'shop_click', param: 'shop_name' },
    destination: { name: 'destination_click', param: 'destination_name' },
  };

  function track(e) {
    if (typeof window.gtag !== 'function') return;
    // Middle-click opens a new tab; any other auxclick (right-click) isn't a visit.
    if (e.type === 'auxclick' && e.button !== 1) return;
    const link = e.target.closest && e.target.closest('[data-track-link]');
    const card = link && link.closest('[data-track-card]');
    const event = card && EVENTS[card.getAttribute('data-track-card')];
    if (!event) return;
    window.gtag('event', event.name, {
      link_type: link.getAttribute('data-track-link'),
      [event.param]: (card.getAttribute('data-track-name') || '').trim() || '(not set)',
    });
  }

  // Capture phase, so the event is queued before any card or popover handler runs.
  document.addEventListener('click', track, true);
  document.addEventListener('auxclick', track, true);
})();
