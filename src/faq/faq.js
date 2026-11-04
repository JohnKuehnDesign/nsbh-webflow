// NSBH guide FAQ — turns the FAQ Rich Text into an accordion for the R2 Guide FAQ
// component (Webflow, group R2), used on the Log post template.
//
// Hosted on GitHub, served to Webflow via jsDelivr. It is loaded by the hidden embed
// inside the Guide FAQ component:
//   <script src="https://cdn.jsdelivr.net/gh/JohnKuehnDesign/nsbh-webflow@X.Y.Z/src/faq/faq.js" defer></script>
// Safe to load more than once (each section is wired once).
//
// The FAQ title is its own CMS field (FAQ Heading (H2)), bound to the H2 under the
// eyebrow. The questions stay one editable Rich Text field (an H3 per question with its
// answer paragraphs below). The script:
//   - drops a leftover H2 at the top of the rich text (older posts), using its text for
//     the title only if the title field is empty;
//   - wraps each H3 and everything up to the next H3 in <details class="faq_item">,
//     with the H3 inside <summary class="faq_question"> and the answer in .faq_answer;
//   - opens the first item (Figma 9759:243086).
// Answers stay in the DOM, so the FAQPage schema (FAQ Schema field) still matches.
// Without the script the rich text shows as written (H2, H3s, paragraphs).
//
// Page hooks (custom attributes inside the component):
//   [data-faq]          The section.
//   [data-faq-heading]  The H2 title under the eyebrow (bound to FAQ Heading (H2)).
//   [data-faq-source]   The Rich Text bound to FAQ Rich Text.

(function () {
  var sections = document.querySelectorAll('[data-faq]');

  Array.prototype.forEach.call(sections, function (section) {
    if (section.hasAttribute('data-faq-ready')) return;
    section.setAttribute('data-faq-ready', '');

    var source = section.querySelector('[data-faq-source]');
    if (!source) return;

    // The title comes from its own CMS field (FAQ Heading (H2)) into [data-faq-heading].
    // An older post may still start its FAQ with an H2: use it only if the field is
    // empty, and drop it from the list either way so the title never shows twice.
    var legacy = source.querySelector('h2');
    var heading = section.querySelector('[data-faq-heading]');
    if (legacy) {
      if (heading && !heading.textContent.trim()) heading.textContent = legacy.textContent.trim();
      legacy.parentNode.removeChild(legacy);
    }

    var nodes = Array.prototype.slice.call(source.childNodes);
    var list = document.createDocumentFragment();
    var answer = null;
    var count = 0;

    nodes.forEach(function (node) {
      var isQuestion = node.nodeType === 1 && node.tagName === 'H3';
      if (isQuestion) {
        var item = document.createElement('details');
        item.className = 'faq_item';
        if (count === 0) item.open = true;
        var summary = document.createElement('summary');
        summary.className = 'faq_question';
        node.classList.add('faq_question-text');
        summary.appendChild(node);
        var icon = document.createElement('span');
        icon.className = 'faq_icon';
        icon.setAttribute('aria-hidden', 'true');
        summary.appendChild(icon);
        answer = document.createElement('div');
        answer.className = 'faq_answer';
        item.appendChild(summary);
        item.appendChild(answer);
        list.appendChild(item);
        count++;
      } else if (answer) {
        answer.appendChild(node);
      } else if (node.nodeType === 1 && node.textContent.trim()) {
        list.appendChild(node); // anything before the first question stays as is
      }
    });

    if (!count) return;
    source.innerHTML = '';
    source.appendChild(list);
    section.classList.add('is-ready');
  });
})();
