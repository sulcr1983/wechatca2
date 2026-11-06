#!/usr/bin/env python3
"""从 public/themes/*.json 生成长图文主题配方索引（生成物，勿手改）。

跑法：.venv/Scripts/python.exe scripts/gen_longform_theme_index.py
输出：docs/prototypes/xhs/longform-art/themes-index.js

⚠️ 单一真源：配色 / 字号 / 字体族 / 装饰线全部来自主题 JSON，本脚本只做
   「公众号 15px 正文 → 长图文 1080×1440 画布」的几何映射，不自造色值。
   ⚠️ 生成物不进 PWA 构建链，只给原型用；改主题后重跑本脚本。
"""
import json
import pathlib
import re

ROOT = pathlib.Path(__file__).resolve().parents[1]
SRC = ROOT / "public" / "themes"
OUT = ROOT / "docs" / "prototypes" / "xhs" / "longform-art" / "themes-index.js"

# 公众号正文基准 15px → 长图文正文 30px（2×，与 V3 12 套同量级）
SCALE = 2.0
MIN_BODY, MAX_BODY = 28, 36   # 产品门禁 ≥28px 硬下限


def px(v, default):
    m = re.search(r"([\d.]+)px", str(v or ""))
    return float(m.group(1)) if m else default


def num(v, default):
    try:
        return float(str(v).strip())
    except (ValueError, AttributeError):
        return default


def real_font(v):
    """把主题里的 font_family 映射成本地字体栈（禁外链、禁 Google Fonts）。

    ⚠️ 判断顺序要紧：'sans-serif' 里也含 'serif' 子串，
       先判 serif 会把 40 套无衬线主题误映射成衬线（实测踩过）。
    """
    s = str(v or "").lower()
    if "mono" in s or "jetbrains" in s or "fira" in s:
        return "var(--mono)"
    if "sans-serif" in s or "-apple-system" in s or "helvetica" in s or "pingfang sc" in s:
        return "var(--sans)"
    if "serif" in s or "georgia" in s or "times" in s or "songti" in s or "noto serif" in s:
        return "var(--serif)"
    return "var(--serif)"   # 119 套未写 font_family → 回落衬线（文艺长文默认）


def light_hex(c):
    """粗略判明暗，用于暗底主题的页眉线对比。"""
    m = re.match(r"#([0-9a-fA-F]{6})", str(c or ""))
    if not m:
        return True
    r, g, b = (int(m.group(1)[i:i + 2], 16) for i in (0, 2, 4))
    return (r * 299 + g * 587 + b * 114) / 1000 > 140


# ── 格局签名：只抓「结构」，不含任何颜色 ──────────────────────────
# 用户反馈「183 的很多都是换个颜色，格局没变化」→ 同签名合并，只留代表。
# ⚠️ 数值型差异要分档，否则 titleSize 每个主题都不同，去不了重（实测会剩 100+）。

def band(v, cuts, labels):
    """把连续值归入离散档位。cuts 是升序阈值。"""
    for c, l in zip(cuts, labels):
        if v <= c:
            return l
    return labels[-1]


def layout_signature(d):
    """从主题 JSON 直接算格局签名（与生成器映射同源）。"""
    st = d.get("styles", {}) or {}
    p, h1, h2, bq = (st.get(k, {}) or {} for k in ("p", "h1", "h2", "blockquote"))
    body_band = band(px(p.get("font_size"), 15), [15, 16], ["S", "M", "L"])
    title_band = band(px(h1.get("font_size"), 22), [20, 24, 28], ["s", "m", "l", "xl"])
    lh_band = band(num(p.get("line_height"), 1.9), [1.85, 2.0], ["tight", "mid", "loose"])
    rule = ""
    if h1.get("border_bottom"):
        rule = "double" if "double" in str(h1["border_bottom"]) else "bottom"
    elif h1.get("border_left"):
        rule = "left"
    elif h1.get("border_top"):
        rule = "top"
    elif h1.get("background") or h1.get("background_color"):
        rule = "block"
    bg = (d.get("colors", {}) or {}).get("background") \
        or (st.get("wrapper", {}) or {}).get("background_color") or "#ffffff"
    return "|".join([
        body_band, title_band, lh_band,
        real_font(p.get("font_family")), real_font(h1.get("font_family") or p.get("font_family")),
        p.get("text_align", "justify"), h1.get("text_align", "left"),
        rule, "q" if bq.get("border_left") else "-",
        str(h2.get("font_weight", "500")),
        "dark" if not light_hex(bg) else "light",
        d.get("kind", "theme"),
    ])


def family_of(r):
    """给代表一个可读的族名（UI 分组用）。按标题语法 + 字族 + 明暗。"""
    rule = r["titleRule"] or "无线"
    rule_cn = {"bottom": "细线刊头", "double": "双线刊头", "left": "左竖线",
               "top": "顶线", "block": "色块标题", "": "无线"}.get(rule, rule)
    font_cn = {"var(--serif)": "衬线", "var(--sans)": "无衬线", "var(--mono)": "等宽"} \
        .get(r["titleFont"], "衬线")
    if r["dark"]:
        return f"暗底 · {font_cn}"
    return f"{font_cn} · {rule_cn}"


def layout_name(r):
    """格局名（不是商品名）：让用户看到「这是什么版式」而不是某个主题名。"""
    align_cn = {"center": "居中", "left": "左起", "right": "右起", "justify": "两端"} \
        .get(r["titleAlign"], "左起")
    rule_cn = {"bottom": "细线", "double": "双线", "left": "左竖线",
               "top": "顶线", "block": "色块", "": "素排"}.get(r["titleRule"] or "", "素排")
    size_cn = "大标" if r["titleSize"] > 92 else ("中标" if r["titleSize"] > 76 else "小标")
    return f"{align_cn}{rule_cn} · {size_cn}"


def main():
    files = sorted(SRC.glob("*.json"))
    rows = []
    for f in files:
        d = json.loads(f.read_text(encoding="utf-8"))
        colors = d.get("colors", {}) or {}
        st = d.get("styles", {}) or {}
        p = st.get("p", {}) or {}
        h1 = st.get("h1", {}) or {}
        h2 = st.get("h2", {}) or {}
        bq = st.get("blockquote", {}) or {}

        paper = colors.get("background") or (st.get("wrapper", {}) or {}).get("background_color") or "#ffffff"
        ink = p.get("color") or colors.get("primary") or "#1f1a14"
        accent = colors.get("accent") or colors.get("hr_color") or ink
        muted = bq.get("color") or p.get("color") or ink

        body_px = px(p.get("font_size"), 15)
        body = max(MIN_BODY, min(MAX_BODY, round(body_px * SCALE)))
        lh = max(1.7, min(2.1, num(p.get("line_height"), 1.9)))
        tracking = p.get("letter_spacing") or ".01em"

        # h1 装饰语法 → 长图文的页眉/标题线
        title_rule = ""
        if h1.get("border_bottom"):
            title_rule = "double" if "double" in str(h1["border_bottom"]) else "bottom"
        elif h1.get("border_left"):
            title_rule = "left"
        elif h1.get("border_top"):
            title_rule = "top"
        elif h1.get("background") or h1.get("background_color"):
            title_rule = "block"

        rows.append({
            "id": f.stem,
            "name": d.get("name", f.stem),
            "desc": d.get("description", ""),
            "kind": d.get("kind", "theme"),
            "paper": paper,
            "ink": ink,
            "muted": muted,
            "accent": accent,
            "accentSoft": accent,
            "line": colors.get("hr_color") or accent,
            "dark": not light_hex(paper),
            "bodyFont": real_font(p.get("font_family")),
            "titleFont": real_font(h1.get("font_family") or p.get("font_family")),
            "bodySize": body,
            "titleSize": max(64, min(112, round(px(h1.get("font_size"), 22) * 3.6))),
            "lineHeight": lh,
            "tracking": tracking,
            "align": p.get("text_align", "justify"),
            "titleAlign": h1.get("text_align", "left"),
            "titleRule": title_rule,
            "quoteRule": "left" if bq.get("border_left") else "none",
            "h2Weight": h2.get("font_weight", "500"),
            "signature": layout_signature(d),
        })

    # ── 格局去重 ──────────────────────────────────────────────────
    # 用户反馈：「183 的很多都是换个颜色，格局没变化，这个要精简」。
    # 实测 183 套只有 53 种格局签名，最大一组 26 套完全相同。
    # 同一签名的只留一个代表，其余降为该代表的「配色变体」（不占模板卡位）。
    groups = {}
    for r in rows:
        groups.setdefault(r["signature"], []).append(r)
    representatives, variants = [], {}
    for sig, group in groups.items():
        # 代表挑选偏好：有 h1 装饰 > 有描述 > 名字短（更通用）；稳定可复现
        rep = sorted(group, key=lambda x: (
            0 if x["titleRule"] else 1,
            0 if x["desc"] else 1,
            len(x["name"]),
            x["id"],
        ))[0]
        rep = dict(rep)
        rep["variantCount"] = len(group)
        rep["family"] = family_of(rep)
        rep["layoutName"] = layout_name(rep)
        representatives.append(rep)
        variants[rep["id"]] = [
            {"id": r["id"], "name": r["name"], "paper": r["paper"],
             "ink": r["ink"], "muted": r["muted"], "accent": r["accent"],
             "accentSoft": r["accentSoft"], "line": r["line"], "dark": r["dark"]}
            for r in group if r["id"] != rep["id"]
        ]
    representatives.sort(key=lambda x: (0 if x["kind"] == "kit" else 1, x["family"], x["id"]))

    payload = json.dumps(representatives, ensure_ascii=False, separators=(",", ":"))
    vpayload = json.dumps(variants, ensure_ascii=False, separators=(",", ":"))
    OUT.parent.mkdir(parents=True, exist_ok=True)
    OUT.write_text(
        "/* 生成物 · 勿手改。真源 public/themes/*.json，重跑 scripts/gen_longform_theme_index.py */\n"
        "/* 公众号主题 → 长图文排印配方（几何映射：15px 正文 → 30px 画布正文）\n"
        " * ⚠️ 已按「格局签名」去重：同签名只留 1 个代表，其余配色降为代表的内部变体，\n"
        " *    不再各占一张模板卡（用户反馈「183 的很多都是换个颜色，格局没变化」）。 */\n"
        f"export const THEME_RECIPES = {payload};\n"
        f"export const THEME_VARIANTS = {vpayload};\n"
        f"export const THEME_COUNT = {len(representatives)};\n"
        f"export const THEME_SOURCE_COUNT = {len(rows)};\n"
        "export const themeById = (id) => THEME_RECIPES.find((t) => t.id === id) || THEME_RECIPES[0];\n"
        "export const variantsOf = (id) => THEME_VARIANTS[id] || [];\n",
        encoding="utf-8", newline="\n",
    )
    print(json.dumps({
        "source_themes": len(rows),
        "unique_layouts": len(representatives),
        "collapsed_color_only": len(rows) - len(representatives),
        "max_variants_in_group": max((len(v) for v in variants.values()), default=0),
        "families": sorted({r["family"] for r in representatives}),
        "out": str(OUT.relative_to(ROOT)),
        "bytes": OUT.stat().st_size,
    }, ensure_ascii=False, indent=2))


if __name__ == "__main__":
    main()
