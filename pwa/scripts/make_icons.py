# -*- coding: utf-8 -*-
"""生成 PWA 图标（可复现、幂等、无随机性）。

视觉沿用「暖纸工作室」的本地版 logo：朱砂色圆角方块 + 白色中文「版」字。

    python pwa/scripts/make_icons.py

输出到 pwa/public/icons/：
    icon-192.png            192x192  圆角方块，字高约画布 52%
    icon-512.png            512x512  同上（矢量感一致）
    icon-512-maskable.png   512x512  满铺朱砂，字高 40%，四周 >=20% 安全边距
    apple-touch-icon.png    180x180  圆角方块
    favicon-32.png           32x32   圆角方块，用粗体保证小尺寸笔画不糊

实现要点：
  * 4x 超采样后用 Image.LANCZOS 缩到目标尺寸，边缘干净；
  * 字号用二分搜索逼近目标字高，再用 font.getbbox() 的墨迹框精确居中
    （不靠目测偏移、不用 anchor 猜基线）；
  * 找不到中文字体时**不静默降级**：打印警告，改画几何标记「≡」。
"""

from __future__ import annotations

import os
import sys

from PIL import Image, ImageDraw, ImageFont

# ---------------------------------------------------------------- 常量

BASE = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))  # -> pwa/
OUT_DIR = os.path.join(BASE, "public", "icons")

VERMILION = (0xAF, 0x3E, 0x2B, 255)  # 朱砂 #AF3E2B
WHITE = (0xFF, 0xFF, 0xFF, 255)

GLYPH = "版"
SUPERSAMPLE = 4
CORNER_RATIO = 0.22  # 圆角半径 / 边长
GLYPH_RATIO = 0.52  # 常规图标：字高 / 画布
GLYPH_RATIO_MASKABLE = 0.40  # maskable：留出 >=20% 安全边距

# 常规图标候选（按优先级）
FONT_CANDIDATES = [
    r"C:\Windows\Fonts\msyh.ttc",  # 微软雅黑 Regular
    r"C:\Windows\Fonts\msyhbd.ttc",  # 微软雅黑 Bold
    r"C:\Windows\Fonts\simhei.ttf",  # 黑体
    r"C:\Windows\Fonts\simsun.ttc",  # 宋体
]
# 小尺寸（<=48px）优先粗体，避免 LANCZOS 缩小后笔画发灰
FONT_CANDIDATES_SMALL = [
    r"C:\Windows\Fonts\msyhbd.ttc",
    r"C:\Windows\Fonts\simhei.ttf",
] + FONT_CANDIDATES


# ---------------------------------------------------------------- 字体


def pick_font_path(small: bool) -> str | None:
    """返回第一个真实存在的字体文件路径；都不存在则返回 None。"""
    for path in FONT_CANDIDATES_SMALL if small else FONT_CANDIDATES:
        if os.path.isfile(path):
            return path
    return None


def load_font(path: str, size: int) -> ImageFont.FreeTypeFont:
    # .ttc 是字体集合，index=0 取第一个字面（微软雅黑即常规体）
    return ImageFont.truetype(path, size, index=0)


def ink_box(font: ImageFont.FreeTypeFont) -> tuple[int, int, int, int]:
    """字形墨迹框（以 (0,0) 为绘制原点）。"""
    box = font.getbbox(GLYPH)
    if box is None or box[2] <= box[0] or box[3] <= box[1]:
        raise ValueError("字体无法渲染「版」，墨迹框为空")
    return box


def fit_font(path: str, target_px: int) -> ImageFont.FreeTypeFont:
    """二分搜索字号，使「版」的墨迹高度最接近 target_px（像素）。"""
    lo, hi = 4, max(8, target_px * 3)
    best = None
    best_err = None
    while lo <= hi:
        mid = (lo + hi) // 2
        font = load_font(path, mid)
        x0, y0, x1, y1 = ink_box(font)
        h = y1 - y0
        err = abs(h - target_px)
        if best_err is None or err < best_err:
            best, best_err = font, err
        if h < target_px:
            lo = mid + 1
        elif h > target_px:
            hi = mid - 1
        else:
            break
    assert best is not None
    return best


# ---------------------------------------------------------------- 绘制


def draw_rounded(size: int, radius_px: int, glyph_px: int, font_path: str | None) -> Image.Image:
    """圆角方块图标（四角透明）。size/glyph_px 均为最终尺寸，内部按 4x 绘制。"""
    s = size * SUPERSAMPLE
    img = Image.new("RGBA", (s, s), (0, 0, 0, 0))
    draw = ImageDraw.Draw(img)
    draw.rounded_rectangle(
        [(0, 0), (s - 1, s - 1)], radius=radius_px * SUPERSAMPLE, fill=VERMILION
    )
    paint_mark(draw, s, glyph_px * SUPERSAMPLE, font_path)
    return img.resize((size, size), Image.LANCZOS)


def draw_maskable(size: int, glyph_px: int, font_path: str | None) -> Image.Image:
    """满铺不透明底（maskable），字形缩小并居中。"""
    s = size * SUPERSAMPLE
    img = Image.new("RGBA", (s, s), VERMILION)
    draw = ImageDraw.Draw(img)
    paint_mark(draw, s, glyph_px * SUPERSAMPLE, font_path)
    return img.resize((size, size), Image.LANCZOS)


def paint_mark(draw: ImageDraw.ImageDraw, canvas: int, target_px: int, font_path: str | None) -> None:
    """在 canvas x canvas 的朱砂底上画居中的白色「版」（或兜底几何标记）。"""
    if font_path is None:
        paint_fallback(draw, canvas, target_px)
        return

    font = fit_font(font_path, target_px)
    x0, y0, x1, y1 = ink_box(font)
    # 用墨迹框反推左上角，使墨迹中心与画布中心重合
    x = (canvas - (x1 - x0)) / 2 - x0
    y = (canvas - (y1 - y0)) / 2 - y0
    draw.text((x, y), GLYPH, font=font, fill=WHITE)


def paint_fallback(draw: ImageDraw.ImageDraw, canvas: int, target_px: int) -> None:
    """没有任何中文字体时的兜底：三条白色横线组成「≡」。

    不静默降级成空白/方块——调用方已在 stderr 打印警告。
    """
    bar_h = max(2, round(target_px * 0.16))
    gap = max(2, round(target_px * 0.18))
    width = round(target_px * 0.86)
    total = bar_h * 3 + gap * 2
    left = (canvas - width) / 2
    top = (canvas - total) / 2
    draw.rounded_rectangle(
        [(left, top), (left + width, top + total)], radius=bar_h // 2, fill=WHITE
    )
    # 抠出两道缝，形成三横
    draw.rectangle(
        [(left, top + bar_h), (left + width, top + bar_h + gap)], fill=VERMILION
    )
    draw.rectangle(
        [(left, top + bar_h * 2 + gap), (left + width, top + bar_h * 2 + gap * 2)],
        fill=VERMILION,
    )


# ---------------------------------------------------------------- 任务表


def main() -> int:
    os.makedirs(OUT_DIR, exist_ok=True)

    normal_font = pick_font_path(small=False)
    small_font = pick_font_path(small=True)
    if normal_font is None:
        print(
            "[警告] 未找到任何中文字体，将改用几何标记「≡」代替「版」。",
            file=sys.stderr,
        )
    else:
        print("font (normal):", normal_font)

    jobs = [
        # (文件名, 最终尺寸, 模式, 字高)
        ("icon-192.png", 192, "rounded", round(192 * GLYPH_RATIO), normal_font),
        ("icon-512.png", 512, "rounded", round(512 * GLYPH_RATIO), normal_font),
        (
            "icon-512-maskable.png",
            512,
            "maskable",
            round(512 * GLYPH_RATIO_MASKABLE),
            normal_font,
        ),
        (
            "apple-touch-icon.png",
            180,
            "rounded",
            round(180 * GLYPH_RATIO),
            normal_font,
        ),
        ("favicon-32.png", 32, "rounded", round(32 * GLYPH_RATIO), small_font),
    ]

    for name, size, mode, glyph_px, font_path in jobs:
        radius = round(size * CORNER_RATIO)
        if mode == "maskable":
            img = draw_maskable(size, glyph_px, font_path)
        else:
            img = draw_rounded(size, radius, glyph_px, font_path)
        dst = os.path.join(OUT_DIR, name)
        img.save(dst, "PNG", optimize=True)
        print(
            "  + %-24s %3dx%-3d  radius=%-3d glyph=%2dpx  %6d bytes"
            % (name, size, size, radius if mode == "rounded" else 0,
               glyph_px, os.path.getsize(dst))
        )

    print("done ->", OUT_DIR)
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
