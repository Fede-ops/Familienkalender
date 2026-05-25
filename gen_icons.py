#!/usr/bin/env python3
"""Generate 9 dark iOS-style app icons for Familienkalender PWA."""

import os
import cairosvg

OUTPUT_DIR = "/home/user/Familienkalender/icons-preview"
os.makedirs(OUTPUT_DIR, exist_ok=True)

# Family colors
FEDE   = "#4A90D9"   # blue
PITA   = "#30D158"   # green
BEBOS  = "#FF9F0A"   # orange
SANTI  = "#FF6B6B"   # red/pink
PURPLE = "#BF5AF2"

def save(name, svg_str):
    path = os.path.join(OUTPUT_DIR, name)
    cairosvg.svg2png(
        bytestring=svg_str.encode("utf-8"),
        output_width=512,
        output_height=512,
        write_to=path,
    )
    print(f"Created: {name}")

def rounded_frame(content, bg):
    """Wrap SVG content in a 512×512 rounded-corner frame."""
    return f"""<svg xmlns="http://www.w3.org/2000/svg" width="512" height="512" viewBox="0 0 512 512">
  <defs>
    <clipPath id="ios-clip">
      <rect width="512" height="512" rx="90" ry="90"/>
    </clipPath>
    {bg}
  </defs>
  <g clip-path="url(#ios-clip)">
    <rect width="512" height="512" fill="url(#bg)"/>
    {content}
  </g>
</svg>"""

# ─── GROUP 1 — KALENDER ────────────────────────────────────────────────────────

# icon-k1.png — "Grid"
def make_k1():
    bg = """<linearGradient id="bg" x1="0" y1="0" x2="0" y2="1">
      <stop offset="0%" stop-color="#0D1117"/>
      <stop offset="100%" stop-color="#1A1A2E"/>
    </linearGradient>"""
    # Calendar grid: 5 cols × 5 rows, centered
    # Cell size 56px, gap 8px → total width=5*56+4*8=312, height same
    cell_w, cell_h, gap = 56, 56, 8
    cols, rows = 5, 5
    total_w = cols * cell_w + (cols - 1) * gap
    total_h = rows * cell_h + (rows - 1) * gap
    ox = (512 - total_w) / 2
    oy = (512 - total_h) / 2 + 16  # slight downward offset for FK text

    cells = []
    for r in range(rows):
        for c in range(cols):
            x = ox + c * (cell_w + gap)
            y = oy + r * (cell_h + gap)
            # Highlight one cell (row 1, col 2) in blue
            if r == 1 and c == 2:
                fill = FEDE
                opacity = "1"
            else:
                fill = "#FFFFFF"
                opacity = "0.08"
            cells.append(
                f'<rect x="{x:.1f}" y="{y:.1f}" width="{cell_w}" height="{cell_h}" '
                f'rx="10" ry="10" fill="{fill}" opacity="{opacity}"/>'
            )
    # Tiny "FK" top-center
    fk = f'<text x="256" y="68" text-anchor="middle" font-family="SF Pro Display, Helvetica Neue, sans-serif" ' \
         f'font-size="28" font-weight="700" fill="#8899BB" letter-spacing="4">FK</text>'

    content = "\n    ".join(cells) + "\n    " + fk
    return rounded_frame(content, bg)


# icon-k2.png — "Kreis"
def make_k2():
    bg = '<linearGradient id="bg"><stop offset="0%" stop-color="#111111"/></linearGradient>'
    # 7 arc segments arranged in a circle
    # Center 256,256, outer radius 180, stroke width 14
    import math
    cx, cy = 256, 256
    r_outer = 178
    stroke_w = 16
    gap_deg = 6  # degrees gap between segments
    seg_deg = (360 - 7 * gap_deg) / 7
    colors = [FEDE, PITA, BEBOS, SANTI, PURPLE, "#FFFFFF", "#AAAAAA"]
    arcs = []
    for i, color in enumerate(colors):
        start = i * (seg_deg + gap_deg) - 90  # start from top
        end = start + seg_deg
        # Convert to radians
        s_rad = math.radians(start)
        e_rad = math.radians(end)
        x1 = cx + r_outer * math.cos(s_rad)
        y1 = cy + r_outer * math.sin(s_rad)
        x2 = cx + r_outer * math.cos(e_rad)
        y2 = cy + r_outer * math.sin(e_rad)
        large = 1 if seg_deg > 180 else 0
        arcs.append(
            f'<path d="M {x1:.2f} {y1:.2f} A {r_outer} {r_outer} 0 {large} 1 {x2:.2f} {y2:.2f}" '
            f'stroke="{color}" stroke-width="{stroke_w}" fill="none" stroke-linecap="round"/>'
        )
    # "25" in center
    number = (
        f'<text x="{cx}" y="{cy+24}" text-anchor="middle" '
        f'font-family="SF Pro Display, Helvetica Neue, sans-serif" '
        f'font-size="96" font-weight="800" fill="#FFFFFF">'
        f'25</text>'
    )
    content = "\n    ".join(arcs) + "\n    " + number
    return rounded_frame(content, bg)


# icon-k3.png — "Wellen"
def make_k3():
    bg = """<linearGradient id="bg" x1="0" y1="0" x2="0" y2="1">
      <stop offset="0%" stop-color="#0D0D1A"/>
      <stop offset="100%" stop-color="#12122A"/>
    </linearGradient>"""
    import math
    # Horizontal wave lines suggesting a calendar grid
    # 7 wave lines evenly spaced, light blue/white
    lines = []
    num_lines = 7
    y_start = 90
    y_end = 420
    spacing = (y_end - y_start) / (num_lines - 1)
    for i in range(num_lines):
        y = y_start + i * spacing
        amplitude = 6 - i * 0.4  # slightly decreasing amplitude
        # Generate wave path with ~5 oscillations across 512px
        freq = 5
        points = []
        steps = 64
        for s in range(steps + 1):
            x = 32 + (512 - 64) * s / steps
            wave_y = y + amplitude * math.sin(2 * math.pi * freq * s / steps + i * 0.5)
            points.append(f"{x:.1f},{wave_y:.1f}")
        opacity = 0.55 + i * 0.03
        stroke_w = 1.5 + (i == 3) * 0.5  # middle line slightly thicker
        color = "#A0C8FF" if i % 2 == 0 else "#D0E8FF"
        lines.append(
            f'<polyline points="{" ".join(points)}" '
            f'stroke="{color}" stroke-width="{stroke_w:.1f}" fill="none" opacity="{opacity:.2f}"/>'
        )
    # Vertical grid lines (faint)
    v_lines = []
    for col in range(6):
        x = 64 + col * (512 - 128) / 5
        v_lines.append(
            f'<line x1="{x:.1f}" y1="80" x2="{x:.1f}" y2="430" '
            f'stroke="#4060A0" stroke-width="0.8" opacity="0.25"/>'
        )
    # "FK" text glowing center
    fk = (
        f'<text x="256" y="270" text-anchor="middle" '
        f'font-family="SF Pro Display, Helvetica Neue, sans-serif" '
        f'font-size="64" font-weight="800" fill="#7AB8FF" opacity="0.85" '
        f'letter-spacing="8">FK</text>'
    )
    content = "\n    ".join(v_lines + lines) + "\n    " + fk
    return rounded_frame(content, bg)


# ─── GROUP 2 — FAMILIE ─────────────────────────────────────────────────────────

# icon-f1.png — "Vier"
def make_f1():
    bg = '<linearGradient id="bg"><stop offset="0%" stop-color="#0F0F0F"/></linearGradient>'
    # Faint calendar gridlines behind
    grid_lines = []
    for i in range(6):
        x = 80 + i * (352 / 5)
        grid_lines.append(
            f'<line x1="{x:.1f}" y1="96" x2="{x:.1f}" y2="416" '
            f'stroke="#FFFFFF" stroke-width="0.6" opacity="0.07"/>'
        )
    for j in range(6):
        y = 96 + j * (320 / 5)
        grid_lines.append(
            f'<line x1="80" y1="{y:.1f}" x2="432" y2="{y:.1f}" '
            f'stroke="#FFFFFF" stroke-width="0.6" opacity="0.07"/>'
        )
    # Four colored dots 2×2, centered, with glows
    dot_r = 58
    spacing = 148
    cx, cy = 256, 262
    positions = [
        (cx - spacing/2, cy - spacing/2, FEDE),
        (cx + spacing/2, cy - spacing/2, PITA),
        (cx - spacing/2, cy + spacing/2, BEBOS),
        (cx + spacing/2, cy + spacing/2, SANTI),
    ]
    glows = []
    dots = []
    for x, y, color in positions:
        # Glow (larger blurred circle via filter)
        glows.append(
            f'<circle cx="{x:.1f}" cy="{y:.1f}" r="{dot_r + 24}" fill="{color}" opacity="0.18"/>'
        )
        dots.append(
            f'<circle cx="{x:.1f}" cy="{y:.1f}" r="{dot_r}" fill="{color}" opacity="0.92"/>'
        )
    content = (
        "\n    ".join(grid_lines) +
        "\n    " + "\n    ".join(glows) +
        "\n    " + "\n    ".join(dots)
    )
    return rounded_frame(content, bg)


# icon-f2.png — "Ringe"
def make_f2():
    bg = '<linearGradient id="bg"><stop offset="0%" stop-color="#111111"/></linearGradient>'
    # Four overlapping circles Venn-style 2×2
    r = 110
    offset = 68
    cx, cy = 256, 238
    circles_data = [
        (cx - offset, cy - offset, FEDE),
        (cx + offset, cy - offset, PITA),
        (cx - offset, cy + offset, BEBOS),
        (cx + offset, cy + offset, SANTI),
    ]
    fills = []
    strokes = []
    for x, y, color in circles_data:
        fills.append(
            f'<circle cx="{x}" cy="{y}" r="{r}" fill="{color}" opacity="0.22"/>'
        )
        strokes.append(
            f'<circle cx="{x}" cy="{y}" r="{r}" fill="none" stroke="{color}" stroke-width="2.5" opacity="0.75"/>'
        )
    # Calendar horizontal line at bottom 1/3
    cal_line = (
        f'<line x1="72" y1="390" x2="440" y2="390" '
        f'stroke="#FFFFFF" stroke-width="1.5" opacity="0.25"/>'
    )
    # Small tick marks for days
    ticks = []
    for d in range(7):
        tx = 96 + d * 52
        ticks.append(
            f'<line x1="{tx}" y1="390" x2="{tx}" y2="400" '
            f'stroke="#FFFFFF" stroke-width="1.5" opacity="0.3"/>'
        )
    content = (
        "\n    ".join(fills) +
        "\n    " + "\n    ".join(strokes) +
        "\n    " + cal_line +
        "\n    " + "\n    ".join(ticks)
    )
    return rounded_frame(content, bg)


# icon-f3.png — "Haus"
def make_f3():
    bg = """<linearGradient id="bg" x1="0" y1="0" x2="0" y2="1">
      <stop offset="0%" stop-color="#0A0E1A"/>
      <stop offset="100%" stop-color="#0D1528"/>
    </linearGradient>"""
    # Stars/dots in sky
    import random, math
    random.seed(42)
    stars = []
    for _ in range(38):
        sx = random.randint(30, 482)
        sy = random.randint(28, 210)
        sr = random.uniform(1.0, 2.8)
        so = random.uniform(0.4, 1.0)
        stars.append(
            f'<circle cx="{sx}" cy="{sy}" r="{sr:.1f}" fill="#FFFFFF" opacity="{so:.2f}"/>'
        )
    # House outline (white, minimal)
    # Roof: triangle peak at (256, 148), base at (128, 258) and (384, 258)
    # Walls: rect from (128,258) to (384, 400)
    # Door: centered bottom
    house = """
    <g stroke="#FFFFFF" stroke-width="3" fill="none" stroke-linejoin="round" stroke-linecap="round">
      <!-- Roof -->
      <polyline points="110,268 256,140 402,268" stroke-width="3.5"/>
      <!-- Walls -->
      <rect x="130" y="266" width="252" height="162" rx="4"/>
      <!-- Door -->
      <rect x="218" y="336" width="76" height="92" rx="8" fill="#FFFFFF" fill-opacity="0.08"/>
    </g>"""
    # Mini calendar inside house
    cal = """
    <g opacity="0.75">
      <!-- Calendar grid 3x3 tiny inside house -->"""
    cell_s = 20
    cgap = 5
    co_x = 256 - (3 * cell_s + 2 * cgap) / 2
    co_y = 282
    cal_cells = []
    for rr in range(3):
        for cc in range(3):
            xx = co_x + cc * (cell_s + cgap)
            yy = co_y + rr * (cell_s + cgap)
            if rr == 1 and cc == 1:
                fc = FEDE; fo = "0.9"
            else:
                fc = "#FFFFFF"; fo = "0.12"
            cal_cells.append(
                f'<rect x="{xx:.1f}" y="{yy:.1f}" width="{cell_s}" height="{cell_s}" '
                f'rx="3" fill="{fc}" opacity="{fo}"/>'
            )
    cal_part = "\n      ".join(cal_cells)

    content = (
        "\n    ".join(stars) +
        house +
        "\n    " + cal_part
    )
    return rounded_frame(content, bg)


# ─── GROUP 3 — ÜBERRASCHUNG ────────────────────────────────────────────────────

# icon-s1.png — "Galaxis"
def make_s1():
    bg = """<radialGradient id="bg" cx="50%" cy="50%" r="70%">
      <stop offset="0%" stop-color="#1A0A2E"/>
      <stop offset="60%" stop-color="#0D0820"/>
      <stop offset="100%" stop-color="#030308"/>
    </radialGradient>"""
    import random, math
    random.seed(7)
    # Galaxy dust (scattered faint circles)
    dust = []
    for _ in range(60):
        dx = random.randint(20, 492)
        dy = random.randint(20, 492)
        dr = random.uniform(0.6, 1.8)
        do = random.uniform(0.15, 0.5)
        dust.append(f'<circle cx="{dx}" cy="{dy}" r="{dr:.1f}" fill="#AAAAFF" opacity="{do:.2f}"/>')
    # Calendar dot grid 5 cols × 7 rows
    cols, rows = 5, 7
    dot_r_base = 7
    total_w = 320; total_h = 380
    ox = (512 - total_w) / 2
    oy = (512 - total_h) / 2
    col_sp = total_w / (cols - 1)
    row_sp = total_h / (rows - 1)
    colors_cycle = [FEDE, PITA, BEBOS, SANTI, PURPLE, "#FFFFFF", "#CCCCFF"]
    dots = []
    for r in range(rows):
        for c in range(cols):
            x = ox + c * col_sp
            y = oy + r * row_sp
            # Vary size/brightness
            size_boost = random.uniform(0.7, 1.8)
            dr = dot_r_base * size_boost
            color = colors_cycle[(r * cols + c) % len(colors_cycle)]
            opacity = random.uniform(0.5, 1.0)
            # Glow
            dots.append(
                f'<circle cx="{x:.1f}" cy="{y:.1f}" r="{dr*2.2:.1f}" fill="{color}" opacity="{opacity*0.2:.2f}"/>'
            )
            dots.append(
                f'<circle cx="{x:.1f}" cy="{y:.1f}" r="{dr:.1f}" fill="{color}" opacity="{opacity:.2f}"/>'
            )
    content = "\n    ".join(dust + dots)
    return rounded_frame(content, bg)


# icon-s2.png — "Mondphasen"
def make_s2():
    bg = '<linearGradient id="bg"><stop offset="0%" stop-color="#000000"/></linearGradient>'
    # 7 moon phases in a row
    # Phases: new, waxing crescent, first quarter, waxing gibbous, full, waning gibbous, last quarter
    # Represented as SVG clipping of circles
    r = 30
    spacing = 64
    start_x = 256 - 3 * spacing
    y = 230
    moons = []
    for i in range(7):
        cx = start_x + i * spacing
        # Phase ranges from 0 (new) to 6 (waning crescent, back toward new)
        # Use simple geometric approach
        if i == 0:
            # New moon: dark circle with thin white outline
            moons.append(f'<circle cx="{cx}" cy="{y}" r="{r}" fill="#111" stroke="#FFFFFF" stroke-width="1.5" opacity="0.7"/>')
        elif i == 4:
            # Full moon
            moons.append(f'<circle cx="{cx}" cy="{y}" r="{r}" fill="#FFFFFF" opacity="0.92"/>')
        else:
            # Build phase using two overlapping circles
            # Phase: i/6 → 0=new, 4=full
            # We draw the lit side
            phase = i / 6  # 0..1
            # Draw base dark circle
            moons.append(f'<circle cx="{cx}" cy="{y}" r="{r}" fill="#1A1A2A"/>')
            if i < 4:
                # Waxing: lit on right
                # Outer circle (bright) on right, dark ellipse on left
                moons.append(f'<clipPath id="mc{i}"><circle cx="{cx}" cy="{y}" r="{r}"/></clipPath>')
                # Bright half
                moons.append(f'<rect x="{cx}" y="{y-r}" width="{r}" height="{r*2}" fill="#DDDDDD" opacity="0.88" clip-path="url(#mc{i})"/>')
                # Dark ellipse covering part of bright
                ellipse_rx = r * abs(1 - 2 * (i / 4))
                side = cx - ellipse_rx if i > 0 else cx
                moons.append(
                    f'<ellipse cx="{cx}" cy="{y}" rx="{ellipse_rx:.1f}" ry="{r}" fill="#1A1A2A" opacity="0.92" clip-path="url(#mc{i})"/>'
                )
            else:
                # Waning: lit on left
                j = i - 4  # 1,2
                moons.append(f'<clipPath id="mc{i}"><circle cx="{cx}" cy="{y}" r="{r}"/></clipPath>')
                moons.append(f'<rect x="{cx-r}" y="{y-r}" width="{r}" height="{r*2}" fill="#DDDDDD" opacity="0.88" clip-path="url(#mc{i})"/>')
                ellipse_rx = r * (j / 2)
                moons.append(
                    f'<ellipse cx="{cx}" cy="{y}" rx="{ellipse_rx:.1f}" ry="{r}" fill="#1A1A2A" opacity="0.92" clip-path="url(#mc{i})"/>'
                )
            # Outline
            moons.append(f'<circle cx="{cx}" cy="{y}" r="{r}" fill="none" stroke="#FFFFFF" stroke-width="1.2" opacity="0.4"/>')

    # Horizontal separator line
    sep = f'<line x1="64" y1="300" x2="448" y2="300" stroke="#444444" stroke-width="1"/>'
    # Year text
    year = (
        f'<text x="256" y="340" text-anchor="middle" '
        f'font-family="SF Pro Display, Helvetica Neue, sans-serif" '
        f'font-size="22" font-weight="400" fill="#555555" letter-spacing="6">'
        f'2026</text>'
    )
    # Label "Mondphasen" subtitle
    label = (
        f'<text x="256" y="165" text-anchor="middle" '
        f'font-family="SF Pro Display, Helvetica Neue, sans-serif" '
        f'font-size="18" font-weight="300" fill="#444444" letter-spacing="3">'
        f'MONDPHASEN</text>'
    )
    content = (
        "\n    ".join(moons) +
        "\n    " + sep +
        "\n    " + year +
        "\n    " + label
    )
    return rounded_frame(content, bg)


# icon-s3.png — "Kristall"
def make_s3():
    bg = '<linearGradient id="bg"><stop offset="0%" stop-color="#111111"/></linearGradient>'
    import math
    # Geometric gem/crystal: hexagonal shape divided into triangular facets
    # Center at 256, 256. Outer points of a hexagon + center divisions.
    cx, cy = 256, 262
    R = 190   # outer radius
    r_inner = 95  # inner ring
    facet_colors = [FEDE, PITA, BEBOS, SANTI, PURPLE, "#AAAADD"]
    # 6 outer points
    def pt(angle_deg, radius=R):
        a = math.radians(angle_deg)
        return (cx + radius * math.cos(a), cy + radius * math.sin(a))
    # Outer hexagon vertices at 0,60,120,180,240,300
    outer = [pt(i * 60 - 90) for i in range(6)]
    inner = [pt(i * 60 - 60, r_inner) for i in range(6)]  # rotated 30 deg
    # Top cap (flattened)
    top_y = cy - R - 30
    top_pts = [pt(i * 60 - 90 + 30, R * 0.35) for i in range(3)]
    # Build triangular facets
    facets = []
    # 6 outer facets (outer[i] → outer[i+1] → center)
    for i in range(6):
        o0 = outer[i]
        o1 = outer[(i + 1) % 6]
        ic = inner[i]
        color = facet_colors[i % len(facet_colors)]
        facets.append((o0, o1, ic, color, 0.35))
    # 6 inner facets (inner triangles to center)
    for i in range(6):
        ic0 = inner[i]
        ic1 = inner[(i + 1) % 6]
        center_pt = (cx, cy)
        color = facet_colors[(i + 2) % len(facet_colors)]
        facets.append((ic0, ic1, center_pt, color, 0.5))
    paths = []
    for p0, p1, p2, color, opacity in facets:
        d = f"M {p0[0]:.1f},{p0[1]:.1f} L {p1[0]:.1f},{p1[1]:.1f} L {p2[0]:.1f},{p2[1]:.1f} Z"
        paths.append(f'<path d="{d}" fill="{color}" opacity="{opacity}"/>')
        paths.append(f'<path d="{d}" fill="none" stroke="#FFFFFF" stroke-width="1.2" opacity="0.55"/>')
    # Outer hexagon border
    hex_pts = " ".join(f"{x:.1f},{y:.1f}" for x, y in outer)
    paths.append(f'<polygon points="{hex_pts}" fill="none" stroke="#FFFFFF" stroke-width="2.5" opacity="0.7"/>')
    # Highlight glint on top-left facet
    paths.append(
        f'<line x1="{outer[5][0]:.1f}" y1="{outer[5][1]:.1f}" '
        f'x2="{inner[5][0]:.1f}" y2="{inner[5][1]:.1f}" '
        f'stroke="#FFFFFF" stroke-width="2" opacity="0.6"/>'
    )
    content = "\n    ".join(paths)
    return rounded_frame(content, bg)


# ─── GENERATE ALL ──────────────────────────────────────────────────────────────

icons = {
    "icon-k1.png": make_k1,
    "icon-k2.png": make_k2,
    "icon-k3.png": make_k3,
    "icon-f1.png": make_f1,
    "icon-f2.png": make_f2,
    "icon-f3.png": make_f3,
    "icon-s1.png": make_s1,
    "icon-s2.png": make_s2,
    "icon-s3.png": make_s3,
}

for filename, maker in icons.items():
    try:
        svg = maker()
        save(filename, svg)
    except Exception as e:
        print(f"ERROR generating {filename}: {e}")
        import traceback; traceback.print_exc()

print("\nAll done.")
