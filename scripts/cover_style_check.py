#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""封面风格规范校验器（Cover Style Spec Checker）。

把 references/style-system.md 里的散文规范，变成可执行的硬约束。
用途：扩模板前后各跑一次，确保「数量涨了，质量没掉」。

用法
----
    python scripts/cover_style_check.py            # 扫全部现有资产 + 原型
    python scripts/cover_style_check.py --strict   # 有任何 FAIL 就退出码 1（接门禁用）
    python scripts/cover_style_check.py --src pwa  # 只扫 PWA 现有实现
    python scripts/cover_style_check.py --src proto # 只扫 cover-lab 原型

校验分两类，脚本只做 AUTO 类，HUMAN 类会列出来提醒人工过：
  AUTO  —— 字重 / 字距 / 字号 / 字体配对 / 对比度 / 违禁 CSS 模式
  HUMAN —— 选图质感（quiet-zone + light test）、主体避让、缩略图观感

规范真源：docs/cover-style-spec.md
"""

from __future__ import annotations

import argparse
import re
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
TPL_JS = ROOT / "pwa" / "src" / "cover" / "templates.js"
LAB_HTML = ROOT / "docs" / "prototypes" / "cover-lab.html"


# ---------------------------------------------------------------- 色彩

def hex2rgb(h: str) -> tuple[int, int, int]:
    h = h.strip().lstrip("#")
    if len(h) == 3:
        h = "".join(c * 2 for c in h)
    return int(h[0:2], 16), int(h[2:4], 16), int(h[4:6], 16)


def rel_lum(h: str) -> float:
    def lin(c: int) -> float:
        s = c / 255
        return s / 12.92 if s <= 0.03928 else ((s + 0.055) / 1.055) ** 2.4
    r, g, b = (lin(c) for c in hex2rgb(h))
    return 0.2126 * r + 0.7152 * g + 0.0722 * b


def contrast(a: str, b: str) -> float:
    l1, l2 = rel_lum(a), rel_lum(b)
    hi, lo = max(l1, l2), min(l1, l2)
    return (hi + 0.05) / (lo + 0.05)


# ---------------------------------------------------------------- 阈值
# 数值依据见 docs/cover-style-spec.md §4–§5；改这里等于改规范。

TH = {
    "title_vs_paper": 7.0,    # 标题对纸底：AAA 大字号
    "body_vs_paper": 4.5,     # 正文对纸底：AA
    "accent_vs_paper": 3.0,   # 强调色对纸底：非文字元素最低线
    "title_size": (84, 132),  # 1080×1440 画布
    # 纯文字大字版（bigtype）单列一档：它的卖点就是「字号压满、不用底图」，
    # 用信息密度型封面的 84–132 去卡它等于否定这个版式的存在理由（2026-10-29）。
    "title_size_text": (96, 160),
    "body_size": (26, 42),
    "ratio": (2.6, 4.4),      # 标题字号 / 正文字号
}

# 视觉体系的排版姿态（不可越界）
STANCE = {
    "editorial": {
        "weight": (500, 500),        # "the larger, the lighter" —— 固定 500
        "tracking": (0.030, 0.040),  # 正字距
        "serif_ok": True,
        "body_weight": (400, 400),
    },
    "swiss": {
        "weight": (200, 400),
        "tracking": (-0.010, 0.010),
        "serif_ok": False,
        "body_weight": (400, 500),
    },
}

SERIF_HINTS = ("serif", "Songti", "STSong", "SimSun", "Playfair", "Georgia")


def is_serif_family(fam: str) -> bool:
    """判断 font-family 是否以衬线为主。

    注意 'sans-serif' 里也含 'serif'，必须先摘掉再找，否则 Swiss 会被误判。
    """
    low = fam.lower().replace("sans-serif", "").replace("sans serif", "")
    return any(h.lower() in low for h in SERIF_HINTS)


# ---------------------------------------------------------------- 解析

def _grab_block(src: str, name: str) -> str:
    m = re.search(rf"const {name}\s*=\s*\{{(.*?)\n\}};", src, re.S)
    if not m:
        raise SystemExit(f"[解析失败] 找不到 {name}，templates.js 结构可能变了")
    return m.group(1)


def parse_gz() -> dict:
    """从 templates.js 抽 GZ_COLORS / GZ_FONTS。"""
    src = TPL_JS.read_text(encoding="utf-8")

    colors: dict[str, dict[str, str]] = {}
    for sm in re.finditer(r"(\w+):\s*\{([^}]*)\}", _grab_block(src, "GZ_COLORS")):
        style, body = sm.group(1), sm.group(2)
        colors[style] = dict(re.findall(r"(\w+):\s*'(#[0-9a-fA-F]{3,8})'", body))

    fonts: dict[str, dict] = {}
    for sm in re.finditer(r"(\w+):\s*\{([^}]*)\}", _grab_block(src, "GZ_FONTS")):
        style, body = sm.group(1), sm.group(2)
        kv: dict[str, object] = {}
        for km in re.finditer(r"(\w+):\s*('[^']*'|\"[^\"]*\"|[\d.]+)", body):
            k, v = km.group(1), km.group(2)
            kv[k] = v.strip("'\"") if v[0] in "'\"" else float(v)
        fonts[style] = kv

    return {"colors": colors, "fonts": fonts}


def parse_lab() -> dict:
    """从 cover-lab.html 抽主题色与版式排版参数。"""
    src = LAB_HTML.read_text(encoding="utf-8")

    themes: dict[str, dict[str, str]] = {}
    for m in re.finditer(
        r'data-theme="(\w+)"\]\{\s*--bg:(#[0-9a-fA-F]{3,8});\s*--fg:(#[0-9a-fA-F]{3,8});'
        r'\s*--accent:(#[0-9a-fA-F]{3,8});\s*--muted:(#[0-9a-fA-F]{3,8})',
        src,
    ):
        themes[m.group(1)] = {"bg": m.group(2), "fg": m.group(3),
                              "accent": m.group(4), "muted": m.group(5)}

    layouts: dict[str, dict] = {}
    for m in re.finditer(
        r'data-layout="(\w+)"\]\{([^}]*)\}', src
    ):
        name, body = m.group(1), m.group(2)
        w = re.search(r"--w-title:\s*(\d+)", body)
        tr = re.search(r"--tr-title:\s*(-?[\d.]+)em", body)
        if w:
            layouts[name] = {
                "weight": float(w.group(1)),
                "tracking": float(tr.group(1)) if tr else None,
            }

    # 版式的标题基准字号
    base: dict[str, dict[str, int]] = {}
    bm = re.search(r"const BASE_TITLE = \{(.*?)\n\};", src, re.S)
    if bm:
        for sm in re.finditer(r"(\w+):\s*\{([^}]*)\}", bm.group(1)):
            size_set, body = sm.group(1), sm.group(2)
            base[size_set] = {k: int(v) for k, v in re.findall(r"(\w+):(\d+)", body)}

    return {"themes": themes, "layouts": layouts, "base": base}


# ---------------------------------------------------------------- 判定

class Row:
    __slots__ = ("where", "item", "value", "verdict", "note")

    def __init__(self, where, item, value, verdict, note=""):
        self.where, self.item, self.value = where, item, value
        self.verdict, self.note = verdict, note


def _in(v: float, rng: tuple[float, float], tol: float = 0.0) -> bool:
    return rng[0] - tol <= v <= rng[1] + tol


def check_gz(gz: dict) -> list[Row]:
    rows: list[Row] = []
    for style, col in gz["colors"].items():
        f = gz["fonts"].get(style, {})
        where = f"PWA/{style}"

        paper, ink = col.get("paper"), col.get("ink")
        muted, accent = col.get("muted"), col.get("accent")

        for key, (label, fg, th) in {
            "title": ("标题", ink, TH["title_vs_paper"]),
            "body": ("正文", muted, TH["body_vs_paper"]),
            "accent": ("强调色", accent, TH["accent_vs_paper"]),
        }.items():
            if paper and fg:
                v = contrast(paper, fg)
                rows.append(Row(where, f"{label}对比度", f"{v:.2f}:1",
                                "PASS" if v >= th else "FAIL", f"下限 {th}"))

        if style in STANCE:
            st = STANCE[style]
            w = f.get("titleWeight")
            if w is not None:
                rows.append(Row(where, "标题字重", str(int(w)),
                                "PASS" if _in(w, st["weight"]) else "FAIL",
                                f"应 {st['weight'][0]}–{st['weight'][1]}"))

            tr = f.get("titleTracking")
            if isinstance(tr, str) and tr.endswith("em"):
                tv = float(tr[:-2])
                rows.append(Row(where, "标题字距", f"{tv:+.3f}em",
                                "PASS" if _in(tv, st["tracking"], 0.001) else "FAIL",
                                f"应 {st['tracking'][0]:+.3f}–{st['tracking'][1]:+.3f}em"))

            fam = str(f.get("family", ""))
            is_serif = is_serif_family(fam)
            rows.append(Row(where, "字体配对",
                            "衬线" if is_serif else "无衬线",
                            "PASS" if is_serif == st["serif_ok"] else "FAIL",
                            f"{style} 应为{'衬线' if st['serif_ok'] else '无衬线'}"))

        ts, bs = f.get("titleSize"), f.get("bodySize")
        if isinstance(ts, (int, float)):
            rng = TH["title_size_text"] if style == "bigtype" else TH["title_size"]
            ok = _in(ts, rng)
            rows.append(Row(where, "标题字号", f"{int(ts)}px",
                            "PASS" if ok else "FAIL",
                            f"应 {rng[0]}–{rng[1]}px"))
        if isinstance(bs, (int, float)):
            ok = _in(bs, TH["body_size"])
            rows.append(Row(where, "正文字号", f"{int(bs)}px",
                            "PASS" if ok else "FAIL",
                            f"应 {TH['body_size'][0]}–{TH['body_size'][1]}px"))
        if isinstance(ts, (int, float)) and isinstance(bs, (int, float)) and bs:
            r = ts / bs
            ok = _in(r, TH["ratio"], 0.1)
            rows.append(Row(where, "标题/正文比", f"{r:.2f}",
                            "PASS" if ok else "WARN",
                            f"建议 {TH['ratio'][0]}–{TH['ratio'][1]}"))
    return rows


def check_lab(lab: dict) -> list[Row]:
    rows: list[Row] = []
    for name, c in lab["themes"].items():
        where = f"原型/{name}"
        for label, fg, th in (
            ("标题", c["fg"], TH["title_vs_paper"]),
            ("正文(--muted)", c["muted"], TH["body_vs_paper"]),
            ("强调色", c["accent"], TH["accent_vs_paper"]),
        ):
            v = contrast(c["bg"], fg)
            rows.append(Row(where, f"{label}对比度", f"{v:.2f}:1",
                            "PASS" if v >= th else "FAIL", f"下限 {th}"))

    for name, p in lab["layouts"].items():
        where = f"原型版式/{name}"
        w = p.get("weight")
        if w is not None:
            # 原型不分体系，统一按 editorial 姿态衡量（项目主体系）
            ok = _in(w, STANCE["editorial"]["weight"], 100)
            rows.append(Row(where, "标题字重", str(int(w)),
                            "PASS" if ok else "FAIL",
                            "project 主体系应 500（±100 仅作提示）"))
        tr = p.get("tracking")
        if tr is not None:
            ok = _in(tr, STANCE["editorial"]["tracking"], 0.005)
            rows.append(Row(where, "标题字距", f"{tr:+.3f}em",
                            "PASS" if ok else "FAIL",
                            "应 +.030–+.040em"))
    return rows


# 违禁 CSS 模式（spec §6.4）。只收误报率极低的两条，
# 宁可漏检也不要天天喊狼来了。
BANNED_CSS = [
    (re.compile(r"mix-blend-mode\s*:\s*difference"),
     "mix-blend-mode:difference 会毁肤色"),
    # 2026-10-29 修误报：原来只查「inset:0 + 180deg + rgba(0,0,0」，
    # 把「按规范做好的局部淡遮罩」也判成 FAIL（它也是 inset:0 + 180deg）。
    # spec §6.4 真正禁的是「纯黑」与「均匀全画布」，所以改为两条精确判据：
    #   ① 遮罩用了纯黑 rgba(0,0,0,...) —— spec §6.3 第 2 条硬约束（须取图片色调）
    #   ② 峰值 alpha > 0.40 —— spec §6.3 第 3 条硬约束（0.15–0.30 才合格）
    (re.compile(r"linear-gradient\(\s*180deg[^}]{0,400}?rgba\(\s*0\s*,\s*0\s*,\s*0\s*,",
                re.S),
     "遮罩用纯黑（spec §6.3 第 2 条：须取图片固有色调）"),
]

# 遮罩峰值 alpha 上限（spec §6.3 第 3 条：0.15–0.30；>0.40 必须回 Step 1 换图）
OVERLAY_PEAK_MAX = 0.40
OVERLAY_RE = re.compile(r"linear-gradient\(\s*180deg((?:[^}])*?)\)\s*;", re.S)
ALPHA_RE = re.compile(r"rgba\(\s*\d+\s*,\s*\d+\s*,\s*\d+\s*,\s*(\d*\.?\d+)\s*\)")


def check_banned_css() -> list[Row]:
    """扫封面相关 CSS/HTML 里的违禁遮罩写法。"""
    rows: list[Row] = []
    targets = [
        *(sorted((ROOT / "public" / "cover-templates").glob("*/index.html"))),
        ROOT / "pwa" / "src" / "cover" / "cover.css",
        LAB_HTML,
    ]
    for f in targets:
        if not f.exists():
            continue
        try:
            src = f.read_text(encoding="utf-8", errors="ignore")
        except OSError:
            continue
        rel = f.relative_to(ROOT).as_posix()
        for pat, why in BANNED_CSS:
            m = pat.search(src)
            rows.append(Row(rel, "违禁遮罩写法",
                            "命中" if m else "无",
                            "FAIL" if m else "PASS", why))
        # 遮罩峰值 alpha：取页面里所有 180deg 渐变里最大的 alpha 值
        peak = 0.0
        for gm in OVERLAY_RE.finditer(src):
            for am in ALPHA_RE.finditer(gm.group(1)):
                peak = max(peak, float(am.group(1)))
        if peak > 0:
            ok = peak <= OVERLAY_PEAK_MAX
            rows.append(Row(rel, "遮罩峰值", f"{peak:.2f}",
                            "PASS" if ok else "FAIL",
                            f"上限 {OVERLAY_PEAK_MAX}（spec §6.3：0.15–0.30 合格，"
                            f">0.40 须回 Step 1 换图）"))
    return rows


# ---------------------------------------------------------------- 输出

def render(rows: list[Row]) -> int:
    fails = [r for r in rows if r.verdict == "FAIL"]
    warns = [r for r in rows if r.verdict == "WARN"]

    cur = None
    for r in rows:
        if r.where != cur:
            cur = r.where
            print(f"\n  {cur}")
        mark = {"PASS": "  ok ", "WARN": " warn", "FAIL": " FAIL"}[r.verdict]
        print(f"    {mark}  {r.item:<16} {r.value:<12} {r.note}")

    print("\n" + "─" * 62)
    print(f"  合计 {len(rows)} 项：通过 {len(rows)-len(fails)-len(warns)}"
          f" · 警告 {len(warns)} · 失败 {len(fails)}")
    if fails:
        print("\n  失败项汇总：")
        for r in fails:
            print(f"    ✗ {r.where} · {r.item} = {r.value}（{r.note}）")

    print("\n  以下三项机器查不了，必须人看（见 spec §6）：")
    print("    · 选图：quiet-zone ≥30% 低细节带 + light test（氛围光）")
    print("    · 避让：标题不跨人脸/手/产品；标题 ≤40% 画布")
    print("    · 缩略图：缩到 360px 宽，标题仍可读")
    return 1 if fails else 0


def main() -> None:
    try:
        sys.stdout.reconfigure(encoding="utf-8")
    except Exception:
        pass

    ap = argparse.ArgumentParser(description="封面风格规范校验")
    ap.add_argument("--src", choices=["all", "pwa", "proto"], default="all")
    ap.add_argument("--strict", action="store_true", help="有 FAIL 则退出码 1")
    args = ap.parse_args()

    print("封面风格规范校验 · docs/cover-style-spec.md")
    rows: list[Row] = []
    if args.src in ("all", "pwa"):
        rows += check_gz(parse_gz())
    if args.src in ("all", "proto"):
        rows += check_lab(parse_lab())
    if args.src == "all":
        rows += check_banned_css()

    code = render(rows)
    sys.exit(code if args.strict else 0)


if __name__ == "__main__":
    main()
