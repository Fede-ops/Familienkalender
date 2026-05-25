#!/usr/bin/env python3
import cairosvg
import os

OUT_DIR = "/home/user/Familienkalender/icons-preview"
os.makedirs(OUT_DIR, exist_ok=True)

W = 512
R = 90  # corner radius

COLORS = {
    "fede": "#4A90D9",
    "pita": "#30D158",
    "bebos": "#FF9F0A",
    "santi": "#FF6B6B",
    "purple": "#BF5AF2",
}

def render(name, svg_body):
    """Wrap svg_body with a clipped 512x512 canvas and render to PNG."""
    svg = f"""<?xml version="1.0" encoding="UTF-8"?>
<svg xmlns="http://www.w3.org/2000/svg" xmlns:xlink="http://www.w3.org/1999/xlink"
     width="{W}" height="{W}" viewBox="0 0 {W} {W}">
  <defs>
    <clipPath id="rr">
      <rect width="{W}" height="{W}" rx="{R}" ry="{R}"/>
    </clipPath>
  </defs>
  <g clip-path="url(#rr)">
{svg_body}
  </g>
</svg>"""
    path = os.path.join(OUT_DIR, name)
    cairosvg.svg2png(bytestring=svg.encode(), output_width=W, output_height=W, write_to=path)
    print(f"Created: {name}")


# ── K1 — Grid ─────────────────────────────────────────────────────────────────
def make_k1():
    body = """
  <!-- background gradient -->
  <defs>
    <linearGradient id="bg1" x1="0" y1="0" x2="0" y2="1">
      <stop offset="0%" stop-color="#0D1117"/>
      <stop offset="100%" stop-color="#1A1A2E"/>
    </linearGradient>
  </defs>
  <rect width="512" height="512" fill="url(#bg1)"/>

  <!-- FK text top-center -->
  <text x="256" y="82" text-anchor="middle" font-family="SF Pro Display, Helvetica Neue, Arial, sans-serif"
        font-size="28" font-weight="600" fill="#8A8FA8" letter-spacing="4">FK</text>

  <!-- Calendar grid: 5 cols × 5 rows, cells 68×56, gap 8, start x=72, y=120 -->
  <!-- total width = 5*68+4*8 = 372, centered: (512-372)/2=70  -->
  <!-- total height = 5*56+4*8 = 312 -->
"""
    # grid parameters
    cols, rows = 5, 5
    cw, ch = 68, 56
    gap = 8
    grid_w = cols * cw + (cols - 1) * gap
    grid_h = rows * ch + (rows - 1) * gap
    sx = (512 - grid_w) // 2
    sy = 120
    cr = 10  # cell corner radius

    cells = ""
    highlight_col, highlight_row = 2, 2  # 0-indexed, center cell

    for row in range(rows):
        for col in range(cols):
            x = sx + col * (cw + gap)
            y = sy + row * (ch + gap)
            if col == highlight_col and row == highlight_row:
                fill = "#4A90D9"
                opacity = "1"
            else:
                fill = "#FFFFFF"
                opacity = "0.08"
            cells += f'  <rect x="{x}" y="{y}" width="{cw}" height="{ch}" rx="{cr}" ry="{cr}" fill="{fill}" fill-opacity="{opacity}"/>\n'

    body += cells
    render("icon-k1.png", body)


# ── K2 — Kreis ────────────────────────────────────────────────────────────────
def make_k2():
    import math
    cx, cy, r_outer = 256, 256, 190
    stroke_w = 14
    gap_deg = 8  # degrees gap between arcs
    num_arcs = 7
    arc_span = (360 - num_arcs * gap_deg) / num_arcs
    colors = ["#4A90D9", "#30D158", "#FF9F0A", "#FF6B6B", "#BF5AF2", "#4A90D9", "#30D158"]

    def arc_path(cx, cy, r, start_deg, span_deg):
        start = math.radians(start_deg - 90)
        end = math.radians(start_deg + span_deg - 90)
        x1 = cx + r * math.cos(start)
        y1 = cy + r * math.sin(start)
        x2 = cx + r * math.cos(end)
        y2 = cy + r * math.sin(end)
        large = 1 if span_deg > 180 else 0
        return f"M {x1:.2f} {y1:.2f} A {r} {r} 0 {large} 1 {x2:.2f} {y2:.2f}"

    arcs = ""
    for i in range(num_arcs):
        start = i * (arc_span + gap_deg)
        path = arc_path(cx, cy, r_outer, start, arc_span)
        arcs += f'  <path d="{path}" stroke="{colors[i]}" stroke-width="{stroke_w}" stroke-linecap="round" fill="none"/>\n'

    body = f"""
  <rect width="512" height="512" fill="#111111"/>
  {arcs}
  <!-- "25" in center -->
  <text x="256" y="292" text-anchor="middle" font-family="SF Pro Display, Helvetica Neue, Arial, sans-serif"
        font-size="100" font-weight="700" fill="#FFFFFF"
        dominant-baseline="auto">25</text>
"""
    render("icon-k2.png", body)


# ── K3 — Wellen ───────────────────────────────────────────────────────────────
def make_k3():
    # Horizontal sine-like wave lines that form a calendar grid pattern
    # Using SVG path with smooth bezier curves for waves
    import math

    lines = ""
    num_lines = 12
    for i in range(num_lines):
        y_base = 80 + i * 32
        amplitude = 6
        freq = 5  # number of waves across width
        # Build a smooth wave using cubic bezier
        pts = []
        steps = 100
        for s in range(steps + 1):
            x = s * 512 / steps
            y = y_base + amplitude * math.sin(2 * math.pi * freq * s / steps)
            pts.append((x, y))
        # Convert to path
        d = f"M {pts[0][0]:.1f} {pts[0][1]:.1f}"
        for p in pts[1:]:
            d += f" L {p[0]:.1f} {p[1]:.1f}"

        alpha = 0.15 if i % 1 == 0 else 0.08
        color = "#A0B8E0" if i % 3 != 0 else "#FFFFFF"
        lines += f'  <path d="{d}" stroke="{color}" stroke-width="1.2" fill="none" stroke-opacity="{alpha}"/>\n'

    # Vertical column lines
    for col in range(8):
        x = 40 + col * 64
        lines += f'  <line x1="{x}" y1="70" x2="{x}" y2="450" stroke="#A0B8E0" stroke-width="1" stroke-opacity="0.12"/>\n'

    body = f"""
  <defs>
    <linearGradient id="bg3" x1="0" y1="0" x2="0.4" y2="1">
      <stop offset="0%" stop-color="#0D0D1A"/>
      <stop offset="100%" stop-color="#12103A"/>
    </linearGradient>
  </defs>
  <rect width="512" height="512" fill="url(#bg3)"/>
  {lines}
  <!-- FK monogram center -->
  <text x="256" y="290" text-anchor="middle" font-family="SF Pro Display, Helvetica Neue, Arial, sans-serif"
        font-size="96" font-weight="700" fill="#FFFFFF" fill-opacity="0.92"
        letter-spacing="-2">FK</text>
  <!-- subtle tagline -->
  <text x="256" y="340" text-anchor="middle" font-family="SF Pro Display, Helvetica Neue, Arial, sans-serif"
        font-size="22" font-weight="400" fill="#8899CC" fill-opacity="0.7"
        letter-spacing="6">KALENDER</text>
"""
    render("icon-k3.png", body)


# ── F1 — Vier ─────────────────────────────────────────────────────────────────
def make_f1():
    dot_r = 68
    positions = [(168, 180), (344, 180), (168, 340), (344, 340)]
    colors_list = [COLORS["fede"], COLORS["pita"], COLORS["bebos"], COLORS["santi"]]

    dots = ""
    for (x, y), c in zip(positions, colors_list):
        # glow filter via blur
        dots += f"""
  <circle cx="{x}" cy="{y}" r="{dot_r + 28}" fill="{c}" fill-opacity="0.12"/>
  <circle cx="{x}" cy="{y}" r="{dot_r + 14}" fill="{c}" fill-opacity="0.18"/>
  <circle cx="{x}" cy="{y}" r="{dot_r}" fill="{c}" fill-opacity="0.95"/>
"""

    # faint calendar grid lines behind
    grid = ""
    for col in range(7):
        x = 32 + col * 75
        grid += f'  <line x1="{x}" y1="80" x2="{x}" y2="440" stroke="#FFFFFF" stroke-width="0.8" stroke-opacity="0.04"/>\n'
    for row in range(6):
        y = 80 + row * 72
        grid += f'  <line x1="32" y1="{y}" x2="480" y2="{y}" stroke="#FFFFFF" stroke-width="0.8" stroke-opacity="0.04"/>\n'

    body = f"""
  <rect width="512" height="512" fill="#0F0F0F"/>
  {grid}
  {dots}
"""
    render("icon-f1.png", body)


# ── F2 — Ringe ────────────────────────────────────────────────────────────────
def make_f2():
    # Four overlapping circles 2×2, transparent strokes
    r = 110
    offset = 70  # overlap offset from center
    positions = [
        (256 - offset, 210 - offset + 20),
        (256 + offset, 210 - offset + 20),
        (256 - offset, 210 + offset + 20),
        (256 + offset, 210 + offset + 20),
    ]
    colors_list = [COLORS["fede"], COLORS["pita"], COLORS["bebos"], COLORS["santi"]]

    rings = ""
    for (x, y), c in zip(positions, colors_list):
        rings += f'  <circle cx="{x}" cy="{y}" r="{r}" fill="{c}" fill-opacity="0.20" stroke="{c}" stroke-width="3" stroke-opacity="0.85"/>\n'

    body = f"""
  <rect width="512" height="512" fill="#111111"/>
  {rings}
  <!-- Calendar baseline -->
  <line x1="60" y1="410" x2="452" y2="410" stroke="#FFFFFF" stroke-width="1.5" stroke-opacity="0.25"/>
  <!-- Day tick marks -->
"""
    for d in range(7):
        x = 80 + d * 56
        body += f'  <line x1="{x}" y1="403" x2="{x}" y2="417" stroke="#FFFFFF" stroke-width="1.5" stroke-opacity="0.3"/>\n'
    body += '  <text x="256" y="450" text-anchor="middle" font-family="SF Pro Display, Helvetica Neue, Arial, sans-serif" font-size="18" fill="#AAAAAA" fill-opacity="0.5" letter-spacing="8">M T W T F S S</text>\n'

    render("icon-f2.png", body)


# ── F3 — Haus ─────────────────────────────────────────────────────────────────
def make_f3():
    # Simple house outline, small calendar inside, stars in sky
    import random
    random.seed(42)

    stars = ""
    for _ in range(40):
        sx = random.randint(30, 480)
        sy = random.randint(30, 220)
        sr = random.uniform(1.0, 2.5)
        op = random.uniform(0.3, 0.9)
        stars += f'  <circle cx="{sx}" cy="{sy}" r="{sr:.1f}" fill="#FFFFFF" fill-opacity="{op:.2f}"/>\n'

    # House shape: roof triangle + body rect
    # Body: x=130, y=280, w=252, h=180
    # Roof: triangle from (256,130) to (90,290) to (422,290)
    house = """
  <!-- house body -->
  <rect x="142" y="280" width="228" height="175" rx="6" fill="none" stroke="#FFFFFF" stroke-width="3" stroke-opacity="0.85"/>
  <!-- roof -->
  <polyline points="100,290 256,128 412,290" fill="none" stroke="#FFFFFF" stroke-width="3" stroke-linejoin="round" stroke-opacity="0.85"/>
  <!-- chimney -->
  <rect x="330" y="162" width="28" height="60" rx="3" fill="none" stroke="#FFFFFF" stroke-width="2.5" stroke-opacity="0.7"/>
"""

    # Mini calendar inside house
    mini_cx, mini_cy = 256, 345
    mini_w, mini_h = 110, 85
    mini_sx = mini_cx - mini_w // 2
    mini_sy = mini_cy - mini_h // 2
    mini = f"""
  <!-- mini calendar frame -->
  <rect x="{mini_sx}" y="{mini_sy}" width="{mini_w}" height="{mini_h}" rx="8"
        fill="#FFFFFF" fill-opacity="0.06" stroke="#FFFFFF" stroke-width="1.5" stroke-opacity="0.4"/>
  <!-- calendar header line -->
  <line x1="{mini_sx}" y1="{mini_sy+22}" x2="{mini_sx+mini_w}" y2="{mini_sy+22}"
        stroke="#4A90D9" stroke-width="2" stroke-opacity="0.7"/>
  <!-- calendar dots 3x3 -->
"""
    for row in range(3):
        for col in range(4):
            dx = mini_sx + 14 + col * 24
            dy = mini_sy + 36 + row * 18
            c = [COLORS["fede"], COLORS["pita"], COLORS["bebos"], COLORS["santi"]][col % 4]
            mini += f'  <circle cx="{dx}" cy="{dy}" r="4" fill="{c}" fill-opacity="0.8"/>\n'

    body = f"""
  <defs>
    <linearGradient id="bg_f3" x1="0" y1="0" x2="0" y2="1">
      <stop offset="0%" stop-color="#0A0E1A"/>
      <stop offset="60%" stop-color="#0D1220"/>
      <stop offset="100%" stop-color="#0A0E1A"/>
    </linearGradient>
  </defs>
  <rect width="512" height="512" fill="url(#bg_f3)"/>
  {stars}
  {house}
  {mini}
"""
    render("icon-f3.png", body)


# ── S1 — Galaxis ──────────────────────────────────────────────────────────────
def make_s1():
    import random, math
    random.seed(7)

    # Background galaxy gradient
    bg = """
  <defs>
    <radialGradient id="galaxy" cx="50%" cy="50%" r="70%">
      <stop offset="0%" stop-color="#1A0A2E"/>
      <stop offset="40%" stop-color="#0D0818"/>
      <stop offset="100%" stop-color="#050508"/>
    </radialGradient>
  </defs>
  <rect width="512" height="512" fill="url(#galaxy)"/>
"""
    # Nebula smear
    bg += '  <ellipse cx="280" cy="240" rx="200" ry="130" fill="#4A2080" fill-opacity="0.12"/>\n'
    bg += '  <ellipse cx="180" cy="300" rx="150" ry="100" fill="#204080" fill-opacity="0.10"/>\n'

    # Random background stars
    bg_stars = ""
    for _ in range(80):
        sx = random.randint(0, 512)
        sy = random.randint(0, 512)
        sr = random.uniform(0.5, 1.5)
        op = random.uniform(0.1, 0.4)
        bg_stars += f'  <circle cx="{sx}" cy="{sy}" r="{sr:.1f}" fill="#FFFFFF" fill-opacity="{op:.2f}"/>\n'

    # Calendar dot grid: 5 cols × 7 rows
    cols, rows = 5, 7
    grid_w = 320
    grid_h = 350
    sx = (512 - grid_w) // 2
    sy = (512 - grid_h) // 2
    col_gap = grid_w // (cols - 1)
    row_gap = grid_h // (rows - 1)

    dot_colors_flat = [
        COLORS["fede"], COLORS["pita"], COLORS["bebos"], COLORS["santi"], COLORS["purple"],
        "#FFFFFF", "#FFFFFF", COLORS["fede"], COLORS["pita"], COLORS["bebos"],
        COLORS["santi"], COLORS["purple"], "#FFFFFF", "#FFFFFF", COLORS["fede"],
        COLORS["pita"], COLORS["bebos"], COLORS["santi"], COLORS["purple"], "#FFFFFF",
        "#FFFFFF", COLORS["fede"], COLORS["pita"], COLORS["bebos"], COLORS["santi"],
        COLORS["purple"], "#FFFFFF", "#FFFFFF", COLORS["fede"], COLORS["pita"],
        COLORS["bebos"], COLORS["santi"], COLORS["purple"], "#FFFFFF", COLORS["fede"],
    ]

    dots = ""
    idx = 0
    for row in range(rows):
        for col in range(cols):
            x = sx + col * col_gap
            y = sy + row * row_gap
            c = dot_colors_flat[idx % len(dot_colors_flat)]
            # Vary size and brightness
            is_special = (idx % 7 == 0)
            r = random.uniform(4.5, 7.5) if is_special else random.uniform(2.5, 4.5)
            op = random.uniform(0.7, 1.0) if is_special else random.uniform(0.4, 0.8)
            if is_special:
                # glow
                dots += f'  <circle cx="{x}" cy="{y}" r="{r*2.5:.1f}" fill="{c}" fill-opacity="0.15"/>\n'
            dots += f'  <circle cx="{x}" cy="{y}" r="{r:.1f}" fill="{c}" fill-opacity="{op:.2f}"/>\n'
            idx += 1

    body = bg + bg_stars + dots
    render("icon-s1.png", body)


# ── S2 — Mondphasen ───────────────────────────────────────────────────────────
def make_s2():
    # 7 moon phases: new, waxing crescent, first quarter, waxing gibbous,
    #                full, waning gibbous, last quarter-ish sequence
    # Render using SVG circles and clip masks

    moon_r = 30
    total_moons = 7
    spacing = 512 / (total_moons + 1)
    moon_y = 230

    # Phase params: (lit_side, coverage 0.0=new 1.0=full, side: +1=right lit, -1=left lit)
    # We'll draw: dark circle + lit crescent using overlapping circles technique
    phases = [
        ("new",         0.0,  1),
        ("crescent",    0.25, 1),
        ("quarter",     0.5,  1),
        ("gibbous",     0.75, 1),
        ("full",        1.0,  1),
        ("gibbous",     0.75,-1),
        ("quarter",     0.5, -1),
    ]

    moons_svg = ""
    for i, (name, coverage, side) in enumerate(phases):
        cx = spacing * (i + 1)
        cy = moon_y

        # Dark base circle
        moons_svg += f'  <circle cx="{cx:.1f}" cy="{cy}" r="{moon_r}" fill="#1A1A1A" stroke="#555555" stroke-width="1.5"/>\n'

        if coverage == 0.0:
            # new moon — just dark
            pass
        elif coverage == 1.0:
            # full moon
            moons_svg += f'  <circle cx="{cx:.1f}" cy="{cy}" r="{moon_r}" fill="#E8E8D8"/>\n'
        else:
            # Lit portion using clipPath
            uid = f"m{i}"
            # The lit ellipse x-radius varies with coverage
            # For right-lit: lit area is right side
            if coverage <= 0.5:
                # crescent: small ellipse on right/left
                ew = moon_r * (coverage * 2)  # 0..r
                if side == 1:
                    moons_svg += f'''  <defs>
    <clipPath id="cp_{uid}"><circle cx="{cx:.1f}" cy="{cy}" r="{moon_r}"/></clipPath>
  </defs>
  <g clip-path="url(#cp_{uid})">
    <ellipse cx="{cx + moon_r - ew:.1f}" cy="{cy}" rx="{ew:.1f}" ry="{moon_r}" fill="#E8E8D8"/>
  </g>\n'''
                else:
                    moons_svg += f'''  <defs>
    <clipPath id="cp_{uid}"><circle cx="{cx:.1f}" cy="{cy}" r="{moon_r}"/></clipPath>
  </defs>
  <g clip-path="url(#cp_{uid})">
    <ellipse cx="{cx - moon_r + ew:.1f}" cy="{cy}" rx="{ew:.1f}" ry="{moon_r}" fill="#E8E8D8"/>
  </g>\n'''
            else:
                # gibbous: almost full, small dark ellipse on one side
                dw = moon_r * ((1 - coverage) * 2)
                if side == 1:
                    # light on right: dark sliver on left
                    moons_svg += f'''  <defs>
    <clipPath id="cp_{uid}"><circle cx="{cx:.1f}" cy="{cy}" r="{moon_r}"/></clipPath>
  </defs>
  <g clip-path="url(#cp_{uid})">
    <circle cx="{cx:.1f}" cy="{cy}" r="{moon_r}" fill="#E8E8D8"/>
    <ellipse cx="{cx - moon_r + dw:.1f}" cy="{cy}" rx="{dw:.1f}" ry="{moon_r}" fill="#1A1A1A"/>
  </g>\n'''
                else:
                    moons_svg += f'''  <defs>
    <clipPath id="cp_{uid}"><circle cx="{cx:.1f}" cy="{cy}" r="{moon_r}"/></clipPath>
  </defs>
  <g clip-path="url(#cp_{uid})">
    <circle cx="{cx:.1f}" cy="{cy}" r="{moon_r}" fill="#E8E8D8"/>
    <ellipse cx="{cx + moon_r - dw:.1f}" cy="{cy}" rx="{dw:.1f}" ry="{moon_r}" fill="#1A1A1A"/>
  </g>\n'''

    body = f"""
  <rect width="512" height="512" fill="#000000"/>
  {moons_svg}
  <!-- separator line -->
  <line x1="60" y1="310" x2="452" y2="310" stroke="#FFFFFF" stroke-width="1" stroke-opacity="0.2"/>
  <!-- year text -->
  <text x="256" y="360" text-anchor="middle"
        font-family="SF Pro Display, Helvetica Neue, Arial, sans-serif"
        font-size="24" font-weight="300" fill="#888888" letter-spacing="8">2026</text>
  <!-- days of week -->
  <text x="256" y="160" text-anchor="middle"
        font-family="SF Pro Display, Helvetica Neue, Arial, sans-serif"
        font-size="16" font-weight="400" fill="#666666" letter-spacing="10">M T W T F S S</text>
"""
    render("icon-s2.png", body)


# ── S3 — Kristall ─────────────────────────────────────────────────────────────
def make_s3():
    import math

    # Gem shape: octagon-like with triangular facets
    # Center of gem
    cx, cy = 256, 256
    # Outer points of gem (top crown + bottom pavilion)
    # Crown: top point + 4 girdle points; Pavilion: culet at bottom + girdle

    # Girdle points (middle ring, 6 points)
    girdle_r = 170
    girdle_y_offset = 20  # slightly below center
    num_girdle = 6
    girdle_pts = []
    for i in range(num_girdle):
        angle = math.radians(i * 60 - 90)
        gx = cx + girdle_r * math.cos(angle)
        gy = cy + girdle_y_offset + girdle_r * 0.45 * math.sin(angle)
        girdle_pts.append((gx, gy))

    # Top crown points
    crown_r = 100
    num_crown = 6
    crown_y = cy - 90
    crown_pts = []
    for i in range(num_crown):
        angle = math.radians(i * 60 - 60)
        kx = cx + crown_r * math.cos(angle)
        ky = crown_y + crown_r * 0.4 * math.sin(angle)
        crown_pts.append((kx, ky))

    top_apex = (cx, cy - 195)
    bottom_apex = (cx, cy + 195)

    colors_facets = [
        COLORS["fede"], COLORS["pita"], COLORS["bebos"],
        COLORS["santi"], COLORS["purple"], COLORS["fede"],
        COLORS["pita"], COLORS["bebos"], COLORS["santi"],
        COLORS["purple"], COLORS["fede"], COLORS["pita"],
    ]

    def pt(p): return f"{p[0]:.1f},{p[1]:.1f}"
    def poly(pts, fill, opacity, stroke_op=0.6):
        pts_str = " ".join(pt(p) for p in pts)
        return f'  <polygon points="{pts_str}" fill="{fill}" fill-opacity="{opacity}" stroke="#FFFFFF" stroke-width="1.5" stroke-opacity="{stroke_op}"/>\n'

    facets = ""
    # Crown facets: triangles from top_apex to consecutive crown_pts pairs
    for i in range(num_crown):
        p1 = crown_pts[i]
        p2 = crown_pts[(i + 1) % num_crown]
        c = colors_facets[i % len(colors_facets)]
        facets += poly([top_apex, p1, p2], c, 0.35)

    # Middle band facets: crown_pts to girdle_pts
    for i in range(num_girdle):
        cp1 = crown_pts[i % num_crown]
        cp2 = crown_pts[(i + 1) % num_crown]
        gp1 = girdle_pts[i]
        gp2 = girdle_pts[(i + 1) % num_girdle]
        c = colors_facets[(i + 2) % len(colors_facets)]
        facets += poly([cp1, cp2, gp2, gp1], c, 0.28)

    # Pavilion facets: triangles from bottom_apex to consecutive girdle_pts pairs
    for i in range(num_girdle):
        p1 = girdle_pts[i]
        p2 = girdle_pts[(i + 1) % num_girdle]
        c = colors_facets[(i + 4) % len(colors_facets)]
        facets += poly([bottom_apex, p1, p2], c, 0.40)

    # Table (top flat hexagon)
    table_r = 80
    table_y = cy - 115
    table_pts = []
    for i in range(6):
        angle = math.radians(i * 60 - 90)
        tx = cx + table_r * math.cos(angle)
        ty = table_y + table_r * 0.35 * math.sin(angle)
        table_pts.append((tx, ty))
    facets += poly(table_pts, "#FFFFFF", 0.12, 0.5)

    body = f"""
  <rect width="512" height="512" fill="#111111"/>
  {facets}
"""
    render("icon-s3.png", body)


# ── Run all ────────────────────────────────────────────────────────────────────
make_k1()
make_k2()
make_k3()
make_f1()
make_f2()
make_f3()
make_s1()
make_s2()
make_s3()

print("\nAll 9 icons created successfully.")
