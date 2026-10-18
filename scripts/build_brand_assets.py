#!/usr/bin/env python
# -*- coding: utf-8 -*-
"""品牌资产生成器：docs/brand/logo-source.png → 两版共用的 logo 与 PWA 图标。

为什么必须有这一步（不能直接把源图丢给页面用）：
  · 源图是成品导出图，圆角方块外的四角是黑底（外侧还带 1px 黑边）；
    直接拿去当 favicon / 桌面图标，四角会露出黑块。
  · UI 徽标要的是「方图 + CSS 圆角」；安卓 maskable 图标要的是「满幅方图 + 中心 80% 安全区」，
    两种用途对留白的要求不同，必须分别导出。

产物（都是生成物，勿手改；换源图后重跑本脚本）：
  public/brand/        logo-64.png / logo-256.png / favicon-32.png   ← 本地版 & PWA 共用
  pwa/public/icons/    icon-192 / icon-512 / icon-512-maskable / apple-touch-icon / favicon-32

用法： python scripts/build_brand_assets.py
"""
import os

from PIL import Image, ImageChops

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
SRC = os.path.join(ROOT, 'docs', 'brand', 'logo-source.png')
BRAND = os.path.join(ROOT, 'public', 'brand')
ICONS = os.path.join(ROOT, 'pwa', 'public', 'icons')

# maskable 安全区：安卓遮罩只保证中心 80% 圆内的内容可见。
# 缩到 75% 后实测 S 主体外接矩形对角线约 362px，小于安全圆直径 410px。
MASKABLE_SCALE = 0.75


def square_source():
    """把圆角外的黑底统一填成方块底色，得到满幅正方形图（圆角交给 CSS / 系统遮罩自己处理）"""
    im = Image.open(SRC).convert('RGB')
    w, h = im.size
    if w != h:
        raise SystemExit(f'源图必须是正方形，当前 {w}x{h}')

    bg = im.getpixel((w // 2, 2))     # 方块内底色（近白）

    # 为什么不用「按几何圆角去裁」：源图的圆角是 iOS 式 squircle（连续圆角），
    # 正圆角几何会在边缘留一圈没盖住的暗像素，缩到 32/64px 时肉眼可见。
    # 改按颜色判：亮度上限 V ≤ 215 且彩度（max−min）≤ 40 的像素
    #   = 圆角外的黑底 + 它的抗锯齿过渡环（源图黑底不是纯黑，实际是 1~5 的近似黑）
    # 一律填成方块底色。S 主体是红/奶油色（彩度 ≈ 118）、方块内是近白（V ≈ 254），都不会被误伤。
    # ⚠️ 不能用 HSV 的 S 通道判彩度：纯黑/近黑（max 极小、min=0）时 S 会退化成 255，
    #    黑底会整片漏填。彩度用 V×S/255 反算才对（HSV 定义：S = 彩度 / V）。
    _, S, V = im.convert('HSV').split()
    chroma = ImageChops.multiply(V, S)
    outside = ImageChops.multiply(
        V.point(lambda v: 255 if v <= 215 else 0),
        chroma.point(lambda c: 255 if c <= 40 else 0),
    )
    im.paste(bg, mask=outside)
    return im, bg


def save(im, path, size):
    os.makedirs(os.path.dirname(path), exist_ok=True)
    im.resize((size, size), Image.LANCZOS).save(path)
    print('  OK %-46s %dpx' % (os.path.relpath(path, ROOT).replace('\\', '/'), size))


def main():
    sq, bg = square_source()
    print('品牌资产：')

    # 1) UI 徽标（本地版走 /assets/brand/，PWA 构建时拷进 dist/brand/）
    save(sq, os.path.join(BRAND, 'logo-64.png'), 64)
    save(sq, os.path.join(BRAND, 'logo-256.png'), 256)
    save(sq, os.path.join(BRAND, 'favicon-32.png'), 32)

    # 2) PWA 安装图标：满幅正方形（iOS / 安卓会自己加圆角遮罩）
    save(sq, os.path.join(ICONS, 'icon-192.png'), 192)
    save(sq, os.path.join(ICONS, 'icon-512.png'), 512)
    save(sq, os.path.join(ICONS, 'apple-touch-icon.png'), 180)
    save(sq, os.path.join(ICONS, 'favicon-32.png'), 32)

    # 3) maskable：底色满幅打底 + 内容缩到 75% 居中，避免圆形/异形遮罩裁到 S
    side = int(512 * MASKABLE_SCALE)
    canvas = Image.new('RGB', (512, 512), bg)
    canvas.paste(sq.resize((side, side), Image.LANCZOS), ((512 - side) // 2, (512 - side) // 2))
    save(canvas, os.path.join(ICONS, 'icon-512-maskable.png'), 512)


if __name__ == '__main__':
    main()
