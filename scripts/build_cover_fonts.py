#!/usr/bin/env python3
"""生成 PWA 小红书封面用中文字体子集（可复现）。

为什么单独做子集：
- 封面模板需要 Noto Serif SC / Noto Sans SC；完整 CJK 字体 10~15MB/字重，不能进 dist。
- 只保留 GB2312 一级常用字（3755）+ ASCII + 常用标点，四个字重合计约 2.4MB。
- 生成物在 `pwa/public/fonts/cover/`，由 `pwa/scripts/build.mjs` 随 fonts 目录拷进 dist。

用法：
    .venv/Scripts/python.exe scripts/build_cover_fonts.py

依赖（仅生成资产时需要，运行时不需要）：
    pip install fonttools brotli
"""

from __future__ import annotations

import re
import string
import tempfile
import urllib.request
from pathlib import Path

from fontTools import subset

ROOT = Path(__file__).resolve().parent.parent
OUT_DIR = ROOT / "pwa" / "public" / "fonts" / "cover"
OUT_DIR.mkdir(parents=True, exist_ok=True)

# Google Fonts CSS API：普通浏览器 UA 会返回单个 TTF（而不是按 unicode-range 切片的 woff2）
CSS_API = "https://fonts.googleapis.com/css2?family={family}:wght@{weight}"
# 注意：完整 Chrome UA 会让 Google Fonts 返回 101 个 unicode-range 分片；
# 简单 UA 才返回单个完整 TTF（方便一次性子集化）。
UA = "Mozilla/5.0"

FAMILIES = {
    "Noto Serif SC": {
        "slug": "noto-serif-sc",
        "ofl": "https://raw.githubusercontent.com/google/fonts/main/ofl/notoserifsc/OFL.txt",
    },
    "Noto Sans SC": {
        "slug": "noto-sans-sc",
        "ofl": "https://raw.githubusercontent.com/google/fonts/main/ofl/notosanssc/OFL.txt",
    },
}
WEIGHTS = (400, 700)


def build_charset() -> str:
    """GB2312 一级汉字 + ASCII 可打印字符 + 常用中文/排版符号。"""
    chars: set[str] = {c for c in string.printable if c >= " "}
    # GB2312 一级汉字：B0-D7 区（3755 字）
    for b1 in range(0xB0, 0xD8):
        for b2 in range(0xA1, 0xFF):
            try:
                chars.add(bytes([b1, b2]).decode("gb2312"))
            except Exception:
                pass
    chars.update(
        "　、。〃〈〉《》「」『』【】〔〕〖〗—–…‘’“”·×÷±°‰′″€£¥©®™"
        "←↑→↓↔↕■□▲△▼▽◆◇○●★☆♦♣♥♠✓✔✕✖"
    )
    return "".join(sorted(chars))


def fetch(url: str, timeout: int = 120) -> bytes:
    req = urllib.request.Request(url, headers={"User-Agent": UA})
    with urllib.request.urlopen(req, timeout=timeout) as r:
        return r.read()


def font_url(family: str, weight: int) -> str:
    css = fetch(CSS_API.format(family=family.replace(" ", "+"), weight=weight)).decode("utf-8")
    m = re.search(r"url\((https://[^)]+\.ttf)\)", css)
    if not m:
        raise RuntimeError(f"没能从 Google Fonts 解析到 {family} {weight} 的 TTF URL")
    return m.group(1)


def make_subset(src: Path, dst: Path, text: str) -> None:
    opts = subset.Options()
    opts.flavor = "woff2"
    opts.layout_features = ["*"]
    opts.hinting = False
    opts.name_IDs = ["*"]
    opts.name_languages = ["*"]
    font = subset.load_font(str(src), opts)
    try:
        sub = subset.Subsetter(options=opts)
        sub.populate(text=text)
        sub.subset(font)
        subset.save_font(font, str(dst), opts)
    finally:
        # Windows 上不 close 会占着临时 TTF，TemporaryDirectory 清理时报 WinError 32
        font.close()


def main() -> None:
    import sys

    force = "--force" in sys.argv
    text = build_charset()
    print(f"字符集：{len(text)} 个字符")

    with tempfile.TemporaryDirectory(prefix="cover-fonts-") as td:
        tmp = Path(td)
        for family, meta in FAMILIES.items():
            slug = meta["slug"]
            # 许可文件：与字体一起下载，缺失才写
            ofl = OUT_DIR / f"OFL-{slug}.txt"
            if not ofl.exists():
                ofl.write_bytes(fetch(meta["ofl"]))
                print(f"许可 → {ofl.name}")
            for weight in WEIGHTS:
                dst = OUT_DIR / f"{slug}-{weight}.woff2"
                if dst.exists() and not force:
                    print(f"跳过 {dst.name}（已存在，--force 可重建）")
                    continue
                url = font_url(family, weight)
                src = tmp / f"{slug}-{weight}.ttf"
                print(f"下载 {family} {weight} …", end=" ", flush=True)
                src.write_bytes(fetch(url))
                make_subset(src, dst, text)
                print(f"→ {dst.name} {dst.stat().st_size / 1024:.0f}KB")

    css = [
        "/* 封面中文字体子集（GB2312 一级 + ASCII + 常用标点）",
        " * 由 scripts/build_cover_fonts.py 生成，勿手改。",
        " * Noto Serif SC / Noto Sans SC：SIL OFL 1.1，见 OFL-noto-*.txt。",
        " * 只进封面页，不参与首屏字体预缓存（见 pwa/src/cover.js 的按需加载）。",
        " */",
    ]
    for family, meta in FAMILIES.items():
        slug = meta["slug"]
        for weight in WEIGHTS:
            css.append(
                "@font-face{"
                f"font-family:'{family}';font-style:normal;font-weight:{weight};"
                "font-display:block;"
                f"src:url(./cover/{slug}-{weight}.woff2) format('woff2');"
                "}"
            )
    (ROOT / "pwa" / "public" / "fonts" / "cover-fonts.css").write_text("\n".join(css) + "\n", encoding="utf-8")
    print("CSS → pwa/public/fonts/cover-fonts.css")
    total = sum(p.stat().st_size for p in OUT_DIR.glob("*.woff2"))
    print(f"完成：{total / 1024 / 1024:.2f}MB / 4 个字重")


if __name__ == "__main__":
    main()
