#!/usr/bin/env python3
# The app icons (Settings › Look › App icon): each one as an SVG, 192 and 512
# px PNGs (the manifest) and an .icns (the Dock, lib/app-icon.ts), into
# web/public/icons/. Run it after changing a drawing; it needs ImageMagick
# (`magick`) and macOS's `iconutil`.
#   python3 scripts/icons.py
import math
import os
import shutil
import subprocess
import tempfile

OUT = os.path.join(os.path.dirname(__file__), "..", "web", "public", "icons")
BG, ORANGE, CREAM, GREEN, AMBER, GREY = "#16161a", "#e8825a", "#ffd9c2", "#4ade80", "#f5b544", "#5a5a66"


def mix(a, b, t):
    pa = [int(a[i:i + 2], 16) for i in (1, 3, 5)]
    pb = [int(b[i:i + 2], 16) for i in (1, 3, 5)]
    return "#%02x%02x%02x" % tuple(round(v + (pb[i] - v) * t) for i, v in enumerate(pa))


def tile(name, shapes):
    return (f'<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 512 512">\n  <!-- Agent Center: {name} -->\n'
            f'  <rect width="512" height="512" rx="114" fill="{BG}"/>\n' + "\n".join(f"  {s}" for s in shapes) + "\n</svg>\n")


def dot(x, y, r, fill, opacity=None):
    o = f' opacity="{opacity:.2f}"' if opacity is not None else ""
    return f'<circle cx="{x:.1f}" cy="{y:.1f}" r="{r:.1f}" fill="{fill}"{o}/>'


# A sphere of halftone dots, lit from the top left.
def halftone():
    out, radius, step = [], 176, 26
    for j in range(-7, 8):
        for i in range(-7, 8):
            x, y = i * step, j * step
            d = math.hypot(x, y) / radius
            if d > 1:
                continue
            light = max(0, 1 - math.hypot((x + 70) / radius, (y + 80) / radius) * 0.75)
            out.append(dot(256 + x, 256 + y, max(1.6, 11.5 * math.sqrt(1 - d * d) * (0.35 + 0.65 * light)), mix(ORANGE, CREAM, light)))
    return out


# The cards' orb in 3D: dots on a sphere, the near ones big and bright.
def sphere():
    pts, n, radius, lx, ly, lz = [], 420, 168, -0.5, -0.6, 0.62
    for k in range(n):
        y = 1 - 2 * (k + 0.5) / n
        r = math.sqrt(1 - y * y)
        th = k * 2.39996
        x, z = math.cos(th) * r, math.sin(th) * r
        if z >= 0:
            pts.append((x, y, z))
    out = []
    for x, y, z in sorted(pts, key=lambda p: p[2]):
        light = max(0, x * lx + y * ly + z * lz)
        out.append(dot(256 + x * radius, 256 + y * radius, 3 + 7 * z * (0.45 + 0.55 * light), mix(ORANGE, CREAM, light * light), 0.35 + 0.65 * z))
    return out


# A small halftone core with the sessions around it, one of them at work.
def orbit():
    out, radius, step = [], 86, 19
    for j in range(-4, 5):
        for i in range(-4, 5):
            x, y = i * step, j * step
            d = math.hypot(x, y) / radius
            if d > 1:
                continue
            light = max(0, 1 - math.hypot(x + 40, y + 40) / radius * 0.8)
            out.append(dot(256 + x, 256 + y, max(1.5, 8 * math.sqrt(1 - d * d) * (0.4 + 0.6 * light)), mix(ORANGE, CREAM, light)))
    for k in range(14):
        a = -math.pi / 2 + k * 2 * math.pi / 14
        out.append(dot(256 + math.cos(a) * 172, 256 + math.sin(a) * 172, 16 if k == 2 else 9, GREEN if k == 2 else GREY))
    return out


# The first icon: three columns of a board.
def bars():
    return ['<rect x="84" y="120" width="96" height="272" rx="20" fill="#f97316"/>',
            '<rect x="208" y="120" width="96" height="190" rx="20" fill="#fbbf24"/>',
            '<rect x="332" y="120" width="96" height="120" rx="20" fill="#4ade80"/>']


ICONS = {"halftone": ("a halftone sphere", halftone), "sphere": ("a sphere of dots", sphere), "orbit": ("sessions around a core", orbit), "bars": ("three columns", bars)}


def render(svg, png, size):
    subprocess.run(["magick", "-background", "none", "-density", "96", svg, "-resize", f"{size}x{size}", "-depth", "8", f"PNG32:{png}"], check=True)


def main():
    os.makedirs(OUT, exist_ok=True)
    for key, (name, draw) in ICONS.items():
        svg = os.path.join(OUT, f"{key}.svg")
        with open(svg, "w") as f:
            f.write(tile(name, draw()))
        render(svg, os.path.join(OUT, f"{key}-192.png"), 192)
        render(svg, os.path.join(OUT, f"{key}-512.png"), 512)
        with tempfile.TemporaryDirectory() as tmp:
            iconset = os.path.join(tmp, f"{key}.iconset")
            os.makedirs(iconset)
            for size in (16, 32, 128, 256, 512):
                render(svg, os.path.join(iconset, f"icon_{size}x{size}.png"), size)
                render(svg, os.path.join(iconset, f"icon_{size}x{size}@2x.png"), size * 2)
            subprocess.run(["iconutil", "-c", "icns", iconset, "-o", os.path.join(OUT, f"{key}.icns")], check=True)
        print(key)
    shutil.copy(os.path.join(OUT, "halftone.svg"), os.path.join(OUT, "..", "icon.svg"))


if __name__ == "__main__":
    main()
