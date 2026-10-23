// NSBH consent — opt-out analytics consent: one banner, one category (analytics).
//
// Hosted on GitHub, served to Webflow via jsDelivr as a classic script that is
// NOT async or deferred, at the top of Site settings → Custom code → Head code:
//   <script src="https://cdn.jsdelivr.net/gh/JohnKuehnDesign/nsbh-webflow@X.Y.Z/src/consent/consent.js"></script>
// It has to run before the GA snippet below it (webflow/site-analytics.html), so a
// visitor who declined never loads gtag at all.
//
// Whether analytics is on (first match wins):
//   1. The visitor's own choice, saved in localStorage under 'nsbh-consent'.
//   2. Global Privacy Control (navigator.globalPrivacyControl): off, and the banner
//      isn't shown. The visitor can still turn it on from Cookie Settings.
//   3. Otherwise on (opt-out), with the banner shown on every page until they choose.
//
// Script API (window.nsbhConsent):
//   on(fn)                 Calls fn(granted) right away with the current state, then
//                          again on every change. Each tool hooks in here: the GA
//                          snippet loads or disables gtag; PostHog, when it goes in,
//                          calls posthog.opt_in_capturing() / opt_out_capturing().
//   granted()              The current state, true or false.
//   set(granted)           Save a choice, as the banner buttons do.
//   open() / close()       Show or hide the banner.
//   clearCookies(pattern)  Expire every cookie whose name matches the RegExp, on this
//                          host and each parent domain (GA sets _ga on the top one).
//
// Page hooks (custom attributes in Designer; the banner is one site-wide component):
//   [data-consent="banner"]   The banner. Hidden by this script until it's needed,
//                             so it can stay visible in Designer. Gets role="region"
//                             and aria-label="Cookie notice" unless it has its own.
//   [data-consent="accept"]   "Got it": analytics on.
//   [data-consent="decline"]  "Decline": analytics off, now and on later pages.
//   [data-consent="close"]    Optional: hides the banner without choosing.
//   [data-consent="open"]     Reopens the banner (the footer "Cookie Settings" link).
//   [data-consent="status"]   Optional text that says the current state once there is
//                             one to report: hidden on a first visit. Wording from
//                             data-consent-on / -off / -gpc on the element, or the
//                             defaults below.
//   Once there's a saved choice (or GPC), the matching button gets an is-current class:
//   style it as a combo class in Designer (keep a hidden keeper element so clean-up
//   doesn't remove it).

(function () {
  const KEY = 'nsbh-consent';
  const TEXT = {
    on: 'Analytics is on.',
    off: 'Analytics is off.',
    gpc: 'Analytics is off because your browser sends a privacy signal (Global Privacy Control).',
  };

  function load() {
    try {
      const v = localStorage.getItem(KEY);
      return v === 'granted' || v === 'denied' ? v : null;
    } catch (e) {
      return null;
    }
  }

  function save(v) {
    try { localStorage.setItem(KEY, v); } catch (e) { /* the choice lasts for this page only */ }
  }

  const gpc = navigator.globalPrivacyControl === true;
  let choice = load();
  let granted = choice ? choice === 'granted' : !gpc;
  const listeners = [];

  // The banner stays hidden until the script opens it: no flash for visitors who
  // already chose, and Designer still shows it because this rule only exists live.
  const style = document.createElement('style');
  style.textContent = '[data-consent="banner"]:not([data-consent-open]){display:none!important}';
  document.head.appendChild(style);

  function on(fn) {
    listeners.push(fn);
    fn(granted);
  }

  function set(value) {
    choice = value ? 'granted' : 'denied';
    save(choice);
    const changed = value !== granted;
    granted = value;
    if (changed) listeners.forEach((fn) => fn(granted));
    render();
  }

  function clearCookies(pattern) {
    const parts = location.hostname.split('.');
    const domains = [''];
    for (let i = 0; i < parts.length - 1; i++) domains.push('; domain=.' + parts.slice(i).join('.'));
    for (const c of document.cookie.split(';')) {
      const name = c.split('=')[0].trim();
      if (!pattern.test(name)) continue;
      for (const d of domains) {
        document.cookie = name + '=; expires=Thu, 01 Jan 1970 00:00:00 GMT; path=/' + d;
      }
    }
  }

  // --- banner ----------------------------------------------------------------

  let opener = null;

  function banners() {
    return document.querySelectorAll('[data-consent="banner"]');
  }

  function render() {
    for (const el of document.querySelectorAll('[data-consent="status"]')) {
      const known = choice || gpc;
      el.style.display = known ? '' : 'none';
      const key = granted ? 'on' : !choice && gpc ? 'gpc' : 'off';
      el.textContent = el.getAttribute('data-consent-' + key) || TEXT[key];
    }
    for (const el of document.querySelectorAll('[data-consent="accept"], [data-consent="decline"]')) {
      const isAccept = el.getAttribute('data-consent') === 'accept';
      el.classList.toggle('is-current', !!(choice || gpc) && isAccept === granted);
    }
  }

  function open(from) {
    opener = from || null;
    render();
    banners().forEach((b) => b.setAttribute('data-consent-open', ''));
    // Opened from Cookie Settings: move focus in, so keyboard users land on the choice.
    const first = opener && document.querySelector('[data-consent="banner"] [data-consent="accept"]');
    if (first) first.focus();
  }

  function close() {
    banners().forEach((b) => b.removeAttribute('data-consent-open'));
    if (opener && document.contains(opener)) opener.focus();
    opener = null;
  }

  function wire() {
    for (const b of banners()) {
      if (!b.hasAttribute('role')) b.setAttribute('role', 'region');
      if (!b.hasAttribute('aria-label') && !b.hasAttribute('aria-labelledby')) b.setAttribute('aria-label', 'Cookie notice');
    }
    // Links in Designer that act as buttons: say so to assistive tech, and let Space
    // press them as a button does (same as the map's action links).
    for (const el of document.querySelectorAll('[data-consent="accept"], [data-consent="decline"], [data-consent="close"], [data-consent="open"]')) {
      if (el.tagName !== 'A') continue;
      if (!el.hasAttribute('role')) el.setAttribute('role', 'button');
      if (!el.hasAttribute('href') && !el.hasAttribute('tabindex')) el.tabIndex = 0;
      el.addEventListener('keydown', (e) => {
        if (e.key === ' ') { e.preventDefault(); el.click(); }
      });
    }
    document.addEventListener('click', (e) => {
      const el = e.target.closest && e.target.closest('[data-consent]');
      if (!el) return;
      const action = el.getAttribute('data-consent');
      if (action === 'banner' || action === 'status') return;
      e.preventDefault();
      if (action === 'accept') { set(true); close(); }
      else if (action === 'decline') { set(false); close(); }
      else if (action === 'close') close();
      else if (action === 'open') open(el);
    });
    document.addEventListener('keydown', (e) => {
      if (e.key === 'Escape' && opener) close();
    });
    render();
    if (!choice && !gpc) open();
  }

  window.nsbhConsent = { on, granted: () => granted, set, open: () => open(), close, clearCookies };

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', wire);
  else wire();
})();
