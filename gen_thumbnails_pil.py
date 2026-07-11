#!/usr/bin/env python3
"""Generate placeholder thumbnails for social card templates using PIL.

When Playwright is unavailable, this script creates styled placeholder
thumbnails that match the guizang design system color palettes.
"""
import os
import sys
from pathlib import Path
from PIL import Image, ImageDraw, ImageFont

THUMB_DIR = Path(__file__).resolve().parent / "assets" / "social-thumb"
THUMB_W = 360
THUMB_H = 480

TEMPLATES = [
    {"name": "editorial-ikb",       "paper": "#f8f6f2", "accent": "#002fa7", "label": "EDITORIAL"},
    {"name": "editorial-dune",      "paper": "#f5f0e8", "accent": "#8b6914", "label": "EDITORIAL"},
    {"name": "editorial-ochre",     "paper": "#faf5eb", "accent": "#cc7722", "label": "EDITORIAL"},
    {"name": "swiss-ikb",           "paper": "#fafafa",  "accent": "#002fa7", "label": "SWISS"},
    {"name": "swiss-safety-orange", "paper": "#f8f8f5",  "accent": "#ff6600", "label": "SWISS"},
    {"name": "swiss-lemon-yellow",  "paper": "#fefcf5",  "accent": "#e5c100", "label": "SWISS"},
    {"name": "swiss-lemon-green",   "paper": "#f8fbf5",  "accent": "#66aa33", "label": "SWISS"},
    {"name": "swiss-ruby",          "paper": "#fcf7f7",  "accent": "#cc3333", "label": "SWISS"},
]

def try_font(size: int) -> ImageFont.FreeTypeFont | None:
    for p in [
        r"C:\Windows\Fonts\arial.ttf",
        r"C:\Windows\Fonts\consola.ttf",
    ]:
        try:
            return ImageFont.truetype(p, size)
        except Exception:
            pass
    return None

def hex_to_rgb(h: str) -> tuple[int, int, int]:
    h = h.lstrip("#")
    return tuple(int(h[i:i+2], 16) for i in (0, 2, 4))

def gen_thumb(t: dict) -> Image.Image:
    paper = hex_to_rgb(t["paper"])
    accent = hex_to_rgb(t["accent"])
    ink = (30, 30, 30)
    img = Image.new("RGB", (THUMB_W, THUMB_H), paper)
    draw = ImageDraw.Draw(img)

    # Background accent band
    band_h = 60
    y0 = 40
    draw.rectangle([0, y0, THUMB_W, y0 + band_h], fill=accent)

    # Top label
    f_label = try_font(14)
    draw.text((20, 16), t["label"], fill=ink, font=f_label)

    # Accent band text
    f_accent = try_font(20)
    accent_name = t["name"].replace("editorial-", "").replace("swiss-", "")
    draw.text((20, y0 + 16), accent_name.upper(), fill=paper, font=f_accent)

    # Bottom info
    f_info = try_font(12)
    info_text = f"VOL.001  {t['name']}"
    draw.text((20, THUMB_H - 50), info_text, fill=ink, font=f_info)

    # Decorative line
    draw.line([(20, THUMB_H - 70), (120, THUMB_H - 70)], fill=accent, width=2)

    return img

def main():
    THUMB_DIR.mkdir(parents=True, exist_ok=True)
    for t in TEMPLATES:
        img = gen_thumb(t)
        out = THUMB_DIR / f"{t['name']}.png"
        img.save(str(out))
        print(f"  {out.name}")
    print(f"\nGenerated {len(TEMPLATES)} thumbnails in {THUMB_DIR}")

if __name__ == "__main__":
    main()
