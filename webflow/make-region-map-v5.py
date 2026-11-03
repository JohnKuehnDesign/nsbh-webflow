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
TOWN_LINE = "1px"  # screen width of the white town lines, at any map size


def group_end(svg, i):
    """Index just past the </g> that closes the <g> starting at i."""
    depth = 0
    for tag in re.finditer(r"<g\b[^>]*?(/?)>|</g>", svg[i:]):
        if tag.group(0).startswith("</g"):
            depth -= 1
        elif not tag.group(1):
            depth += 1
        if depth == 0:
            return i + tag.end()
    raise SystemExit("unbalanced group at %d" % i)


def drop_group(svg, cls):
    """Remove the first <g class="cls" ...>...</g>, matching nested <g>."""
    start = re.search(r'<g class="%s"[^>]*>' % re.escape(cls), svg)
    if not start:
        raise SystemExit("group not found: " + cls)
    return svg[:start.start()] + svg[group_end(svg, start.start()):]


def add_town_lines(svg):
    """After each region's town fills, add an outline-only copy of the towns.

    Neighbouring towns don't share exact edges in the source, so stroking each
    fill draws two offset lines with a sliver between them. Instead the fills
    keep a seam stroke in their own colour (closes the slivers, as in v4) and
    one line layer on top draws every town edge once, at a fixed screen width.
    """
    out, pos = [], 0
    for m in re.finditer(r'<g class="rm-shapes">', svg):
        end = group_end(svg, m.start())
        lines = svg[m.start():end].replace(
            '<g class="rm-shapes">', '<g class="rm-lines" aria-hidden="true">', 1
        ).replace('class="rm-town"', 'class="rm-town-line"')
        out += [svg[pos:end], lines]
        pos = end
    return "".join(out + [svg[pos:]])


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

# White town outlines, as in Figma: one line layer over the fills.
svg = add_town_lines(svg)
svg = svg.replace(
    "</style>",
    ".rm-lines * { fill: none; stroke: #fff; stroke-width: %s; "
    "vector-effect: non-scaling-stroke; stroke-linejoin: round; pointer-events: none; }\n</style>"
    % TOWN_LINE,
    1,
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
    # Smaller and nudged right, off the Greater Boston edge and a little into the water.
    '<text x="2180" y="3950.2" font-size="70" text-anchor="middle" class="rm-boston-label">BOSTON</text>',
    svg,
)

OUT.write_text(svg)
print("wrote", OUT, len(svg), "bytes")
