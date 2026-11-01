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

# ── 可选字体（按需加载，不写进 cover-fonts.css）──────────────────────────
# 挑款原则：**风格必须真的不一样**。同是黑体、只差字重的不要——用户看不出区别，
# 只会觉得列表很长。每款都要能一句话说清「什么时候该用它」。
#
# key 即前端 TEXT_FONTS 的 id，产物 = <key>.woff2。
# 授权均为 SIL OFL 1.1；OFL 义务要求随包分发授权全文。
#
# 得意黑 smiley-sans-oblique.woff2 是 2026-10-25 手动放的（1.1MB，源站已换路径），
# 这里登记只为「清单完整」，构建时跳过（ttf 为 None）。
OPTIONAL = {
    "wenkai": {
        "family": "LXGW WenKai",
        "ttf": "https://cdn.jsdelivr.net/gh/lxgw/LxgwWenKai-Lite@1.530/fonts/TTF/LXGWWenKaiLite-Regular.ttf",
        "license": ("OFL-lxgw-wenkai.txt",
                    "https://cdn.jsdelivr.net/gh/lxgw/LxgwWenKai-Lite@1.530/OFL.txt"),
        "note": "手写楷体，温润有书卷气",
    },
    "zcool-kuaile": {
        "family": "ZCOOL KuaiLe",
        "ttf": "https://cdn.jsdelivr.net/gh/google/fonts@main/ofl/zcoolkuaile/ZCOOLKuaiLe-Regular.ttf",
        "license": ("OFL-zcool-kuaile.txt",
                    "https://cdn.jsdelivr.net/gh/google/fonts@main/ofl/zcoolkuaile/OFL.txt"),
        "note": "圆润活泼，日常/美食/萌宠",
    },
    "zcool-xiaowei": {
        "family": "ZCOOL XiaoWei",
        "ttf": "https://cdn.jsdelivr.net/gh/google/fonts@main/ofl/zcoolxiaowei/ZCOOLXiaoWei-Regular.ttf",
        "license": ("OFL-zcool-xiaowei.txt",
                    "https://cdn.jsdelivr.net/gh/google/fonts@main/ofl/zcoolxiaowei/OFL.txt"),
        "note": "清秀细宋，文艺/书评/穿搭",
    },
    "mashanzheng": {
        "family": "Ma Shan Zheng",
        "ttf": "https://cdn.jsdelivr.net/gh/google/fonts@main/ofl/mashanzheng/MaShanZheng-Regular.ttf",
        "license": ("OFL-mashanzheng.txt",
                    "https://cdn.jsdelivr.net/gh/google/fonts@main/ofl/mashanzheng/OFL.txt"),
        "note": "毛笔书法，国风/节气/茶",
    },
    "longcang": {
        "family": "Long Cang",
        "ttf": "https://cdn.jsdelivr.net/gh/google/fonts@main/ofl/longcang/LongCang-Regular.ttf",
        "license": ("OFL-longcang.txt",
                    "https://cdn.jsdelivr.net/gh/google/fonts@main/ofl/longcang/OFL.txt"),
        "note": "手写随性，日记/vlog 字幕感",
    },
    "zhimangxing": {
        "family": "Zhi Mang Xing",
        "ttf": "https://cdn.jsdelivr.net/gh/google/fonts@main/ofl/zhimangxing/ZhiMangXing-Regular.ttf",
        "license": ("OFL-zhimangxing.txt",
                    "https://cdn.jsdelivr.net/gh/google/fonts@main/ofl/zhimangxing/OFL.txt"),
        "note": "行草连笔，书法/诗句",
    },
    "smiley": {
        "family": "Smiley Sans",
        "ttf": None,
        "license": None,
        "note": "窄斜胶囊，小红书封面常用",
    },
}

# TTF 缓存：14MB 的霞鹜文楷重复下载太浪费，本地有就复用
SRC_CACHE = ROOT / "output" / "fonts-src"


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


def build_optional(force: bool, only: set) -> None:
    """构建可选字体子集。产物 <key>.woff2，由 textmode.js 选中时注入。"""
    text = build_charset()
    SRC_CACHE.mkdir(parents=True, exist_ok=True)
    built = 0
    for key, meta in OPTIONAL.items():
        if only and key not in only:
            continue
        if not meta["ttf"]:
            print(f"  跳过 {key}（产物已入库，无固定源地址）")
            continue
        dst = OUT_DIR / f"{key}.woff2"
        if dst.exists() and not force:
            print(f"  跳过 {key}.woff2（已存在，--force 可重建）")
            continue

        lic = meta.get("license")
        if lic:
            name, url = lic
            target = OUT_DIR / name
            if not target.exists():
                try:
                    target.write_bytes(fetch(url))
                    print(f"  许可 → {name}")
                except Exception as e:      # 授权地址偶尔会改，别为它中断字体构建
                    print(f"  ⚠ 许可下载失败（{name}）：{e}")

        src = SRC_CACHE / Path(meta["ttf"]).name
        if not src.exists():
            print(f"  下载 {key} …", end=" ", flush=True)
            src.write_bytes(fetch(meta["ttf"], timeout=180))
        make_subset(src, dst, text)
        print(f"  {key:<15} → {dst.stat().st_size / 1024:7.1f} KB  ({meta['note']})")
        built += 1
    if built:
        total = sum(f.stat().st_size for f in OUT_DIR.glob("*.woff2"))
        print(f"可选字体 {built} 款完成；cover 目录 woff2 合计 {total / 1024 / 1024:.2f}MB")


def main() -> None:
    import sys

    force = "--force" in sys.argv
    only: set = set()
    for arg in sys.argv[1:]:
        if arg.startswith("--only="):
            only = {x.strip() for x in arg.split("=", 1)[1].split(",") if x.strip()}
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

    # ── 可选字体：故意不写进本文件（按需加载）─────────────────────────
    # 得意黑 Smiley Sans v2.0.1：atelierAnchor 出品，SIL OFL 1.1，WOFF2 1.1MB。
    # ⚠️ 不写进 cover-fonts.css：它是**可选**字体，写进来会让所有用户进封面页就
    #    下载 1.1MB（2026-10-25 苏哥指出应该选中才加载）。
    #    实际由 pwa/src/cover/textmode.js 在「选中得意黑」时按需注入 @font-face。
    # 授权全文 pwa/public/fonts/cover/OFL-smiley-sans.txt 随包分发（OFL 义务）。
    (ROOT / "pwa" / "public" / "fonts" / "cover-fonts.css").write_text("\n".join(css) + "\n", encoding="utf-8")
    print("CSS → pwa/public/fonts/cover-fonts.css")
    total = sum(p.stat().st_size for p in OUT_DIR.glob("*.woff2"))
    print(f"完成：{total / 1024 / 1024:.2f}MB / 4 个字重")

    if "--skip-optional" not in sys.argv:
        print("\n可选字体（按需加载，不进 cover-fonts.css）：")
        build_optional(force, only)


if __name__ == "__main__":
    main()
