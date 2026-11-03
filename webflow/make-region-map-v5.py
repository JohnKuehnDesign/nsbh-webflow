"""Build region-map-v5.svg (R2 Regions section) from region-map-v4.svg.

v5 is the map only: the title block and the in-map legend move into Webflow
HTML beside it. Run from the repo root: python3 webflow/make-region-map-v5.py
"""
import re
from pathlib import Path

SRC = Path("webflow/region-map-v4.svg")
OUT = Path("webflow/region-map-v5.svg")

# Map + ocean + Boston extents from getBBox() on v4, plus a little air.
VIEWBOX = "124 138 4531 4395"
TOWN_STROKE = 7  # about 1px at the R2 map size (~690px wide)


def drop_group(svg, cls):
    """Remove the first <g class="cls" ...>...</g>, matching nested <g>."""
    start = re.search(r'<g class="%s"[^>]*>' % re.escape(cls), svg)
    if not start:
        raise SystemExit("group not found: " + cls)
    depth, i = 0, start.start()
    for tag in re.finditer(r"<g\b[^>]*?(/?)>|</g>", svg[i:]):
        if tag.group(0).startswith("</g"):
            depth -= 1
        elif not tag.group(1):
            depth += 1
        if depth == 0:
            return svg[:i] + svg[i + tag.end():]
    raise SystemExit("unbalanced group: " + cls)


svg = SRC.read_text()

svg = drop_group(svg, "rm-title-block")
svg = drop_group(svg, "rm-legend")

# Region names come off the map (the legend names them); BOSTON stays.
svg = re.sub(r'<text[^>]*class="rm-label" aria-hidden="true">[^<]*</text>\s*', "", svg)

svg = re.sub(r'viewBox="[^"]*"', 'viewBox="%s"' % VIEWBOX, svg, count=1)
svg = svg.replace(
    'aria-label="The Regions: map of the five Beef Country regions. Each region and each legend entry links to its page."',
    'aria-label="Map of the five Beef Country regions. Each region links to its page."',
)

# White town outlines, as in Figma (were the region colour).
svg = re.sub(
    r"(\.rm-region--[\w-]+ \.rm-town \* \{ fill: [^;]+; )stroke: [^;]+; stroke-width: 3;",
    r"\1stroke: #fff; stroke-width: %d;" % TOWN_STROKE,
    svg,
)

# Sit on the R2 Ground colour; dimmed regions fade toward it.
svg = svg.replace(
    "--rm-bg: var(--_primitives---white-mix--h-lemon-chiffon-80, #fefdf9);",
    "--rm-bg: var(--_primitives---white-mix--h-deep-atlantic-95, #f3f5f5);",
)

# BOSTON label in the Eyebrow style.
svg = svg.replace(
    "</style>",
    ".rm-boston-label { font-family: var(--rm-font-map); font-weight: 700; "
    "letter-spacing: .14em; fill: var(--rm-ink); }\n</style>",
    1,
)
svg = re.sub(
    r'<text x="2069" y="3950.2" font-size="70" text-anchor="middle" class="rm-label">BOSTON</text>',
    '<text x="2069" y="3950.2" font-size="84" text-anchor="middle" class="rm-boston-label">BOSTON</text>',
    svg,
)

OUT.write_text(svg)
print("wrote", OUT, len(svg), "bytes")
