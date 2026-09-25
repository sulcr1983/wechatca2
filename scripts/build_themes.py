#!/usr/bin/env python3
"""SuperSu 原创排版主题生成器（自 2026-09-25 起，public/themes/ 的 47 套设计主题真源）。

背景：此前 public/themes/ 下的 47 套设计主题是早期从某个外部仓库机械适配而来的，
其命名 / 描述 / 样式数值均沿用外部原值，而该仓库**无 LICENSE**（= 保留所有权利）。
本项目已定开源（= 分发），存在真实授权风险，故整体废弃重写。

现在的做法：本文件 + theme_specs.py **只描述设计意图**（底色 / 墨色 / 强调色 / 字体气质 +
排版原型 + 布局），字号标尺、间距、圆角、描边、列表、代码块、暗色适配全部由本文件的设计系统推导。
因此产出的每个数值都是本项目自己标尺的产物，不沿用任何外部数值；命名与描述亦为本项目自拟。

用法：
    python scripts/build_themes.py            # 生成到 public/themes/
    python scripts/build_themes.py --dry-run  # 只打印将写出的文件，不落盘
"""
import argparse
import json
import pathlib
import sys

ROOT = pathlib.Path(__file__).resolve().parent.parent
THEMES_DIR = ROOT / "public" / "themes"
sys.path.insert(0, str(ROOT))

# 交替色带的可见性规则只有一份真源，在引擎里（core/format_engine.py）。
# 这里直接复用它，保证「写进 JSON 的色带值」与「引擎兜底推导的色带值」永远一致。
from core.format_engine import _resolve_band_bg  # noqa: E402

# ── 字体栈（自研三档：无衬线 / 衬线 / 楷体）──────────────────────────────
FONTS = {
    "sans": "-apple-system, BlinkMacSystemFont, 'PingFang SC', 'Helvetica Neue', Arial, sans-serif",
    "serif": "'Songti SC', 'Noto Serif SC', 'Source Han Serif SC', Georgia, serif",
    "kai": "'Kaiti SC', 'STKaiti', 'KaiTi', 'Songti SC', serif",
    "mono": "'SF Mono', Menlo, Consolas, 'Courier New', monospace",
}


def _rgb(hex_color: str):
    h = hex_color.lstrip("#")
    return int(h[0:2], 16), int(h[2:4], 16), int(h[4:6], 16)


def tint(hex_color: str, alpha: float) -> str:
    """强调色透明度变体，用于浅底 / 描边，避免到处写死灰色"""
    r, g, b = _rgb(hex_color)
    return f"rgba({r},{g},{b},{alpha})"


def mix(a: str, b: str, t: float) -> str:
    """线性混色：t=0 取 a，t=1 取 b"""
    ar, ag, ab = _rgb(a)
    br, bg, bb = _rgb(b)
    return "#%02X%02X%02X" % (
        round(ar + (br - ar) * t),
        round(ag + (bg - ag) * t),
        round(ab + (bb - ab) * t),
    )


# ── 设计系统：字号标尺 ──────────────────────────────────────────────────
# 所有主题共用同一条标尺（基准 16px），只在原型间调整基线与行高，
# 这样 47 套彼此协调，不会出现某套标题突然过大过小。
SCALE = {
    "h1": 25, "h2": 20, "h3": 17, "h4": 16, "h5": 15, "h6": 14,
    "p": 16, "small": 13, "code": 13.5,
}


# ── 排版原型：决定圆角 / 描边 / 阴影 / 列表 / 代码块 / 标题气质 ───────────
ARCHETYPES = {
    # 通栏素排：无装饰，靠字号与间距区分层级
    "plain": dict(
        radius=6,
        h_weight=700, h_border=False, letter=0.2, code_radius=6, code_header=False,
    ),
    # 杂志感：大留白 + 细分隔线 + 衬线气质
    "magazine": dict(
        radius=4,
        h_weight=800, h_border=True, letter=0.1, code_radius=4, code_header=False,
    ),
    # 编辑部：干净无装饰，把视觉让给 hero 布局的色带与序号
    "editorial": dict(
        radius=10,
        h_weight=800, h_border=False, letter=0.2, code_radius=8, code_header=True,
    ),
    # 卡纸：大圆角 + 轻阴影，信息分层明显
    "card": dict(
        radius=12,
        h_weight=800, h_border=False, letter=0.2, code_radius=10, code_header=True,
    ),
    # 暗底沉浸：低对比描边，强调色发光
    "dark": dict(
        radius=10,
        h_weight=700, h_border=False, letter=0.3, code_radius=8, code_header=True,
    ),
    # 粗野主义：直角 + 粗黑边 + 硬阴影
    "brutal": dict(
        radius=0,
        h_weight=900, h_border=False, letter=0.6, code_radius=0, code_header=True,
    ),
    # 纸感手记：暖底 + 细描边 + 手写感列表
    "paper": dict(
        radius=8,
        h_weight=700, h_border=True, letter=0.3, code_radius=6, code_header=False,
    ),
    # 工程制图：方角 + 细线框 + 等宽
    "technical": dict(
        radius=2,
        h_weight=700, h_border=True, letter=0.2, code_radius=2, code_header=True,
    ),
    # 活泼：大圆角 + 彩色列表点 + 胶囊标题
    "playful": dict(
        radius=14,
        h_weight=800, h_border=False, letter=0.4, code_radius=12, code_header=True,
    ),
}


def build_theme(spec: dict) -> dict:
    """把一条设计意图展开成完整主题 JSON"""
    bg = spec["bg"]
    ink = spec["ink"]
    accent = spec["accent"]
    accent2 = spec.get("accent2", accent)
    border = mix(bg, ink, 0.14)
    muted = mix(ink, bg, 0.35)
    code_bg = spec.get("code_bg") or mix(bg, ink, 0.92)
    is_dark = spec.get("dark", False)

    font = FONTS[spec.get("font", "sans")]
    a = ARCHETYPES[spec.get("arch", "plain")]

    r = a["radius"]
    # ⚠️ 只给「值」，不带「键名」——build_style_string 会自动拼 `border-left:`，
    # 值里再带一次前缀会拼成 `border-left:border-left:4px solid ...`，浏览器判非法整条丢弃。
    h_border = a["h_border"]

    styles = {
        "wrapper": {"background_color": bg, "padding": "16px", "font_family": font},

        "h1": {
            "font_size": f"{SCALE['h1']}px", "font_weight": str(a["h_weight"]),
            "color": spec.get("heading") or ink, "text_align": "center",
            "line_height": "1.35", "letter_spacing": f"{a['letter']}em",
            "margin_top": "8px", "margin_bottom": "20px", "padding": "0",
        },
        "h2": {
            "font_size": f"{SCALE['h2']}px", "font_weight": str(a["h_weight"]),
            "color": spec.get("heading") or ink, "line_height": "1.35",
            "letter_spacing": f"{a['letter']}em",
            "margin_top": "32px", "margin_bottom": "14px",
            "padding": "0",
            **({"border_left": f"4px solid {accent}", "padding_left": "12px"} if h_border else {}),
        },
        "h3": {
            "font_size": f"{SCALE['h3']}px", "font_weight": "700",
            "color": accent, "line_height": "1.4",
            "margin_top": "26px", "margin_bottom": "10px", "padding": "0",
        },
        "h4": {"font_size": f"{SCALE['h4']}px", "font_weight": "700", "color": ink,
               "line_height": "1.4", "margin_top": "22px", "margin_bottom": "8px"},
        "h5": {"font_size": f"{SCALE['h5']}px", "font_weight": "600", "color": muted,
               "line_height": "1.4", "margin_top": "20px", "margin_bottom": "6px"},
        "h6": {"font_size": f"{SCALE['h6']}px", "font_weight": "600", "color": muted,
               "line_height": "1.4", "margin_top": "18px", "margin_bottom": "6px"},

        "p": {"font_size": f"{SCALE['p']}px", "color": ink, "line_height": "1.9",
              "letter_spacing": "0.4px", "text_align": "justify",
              "margin_top": "0", "margin_bottom": "20px"},

        "strong": {"font_weight": "700", "color": accent2},
        "em": {"font_style": "italic", "color": muted},
        "a": {"color": accent, "text_decoration": "none",
              "border_bottom": f"1px solid {tint(accent, 0.5)}"},

        "blockquote": {
            "border_left": f"3px solid {accent}", "background": tint(accent, 0.04),
            "color": muted, "font_size": "15px", "line_height": "1.8",
            "padding": "14px 18px", "margin_top": "22px", "margin_bottom": "22px",
            "border_radius": f"0 {r}px {r}px 0",
        },
        "blockquote_p": {
            "font_size": "15px", "color": muted, "line_height": "1.8",
            "margin_bottom": "0", "background": "transparent", "font_style": "normal",
        },

        "img": {"max_width": "100%", "display": "block", "border_radius": f"{r}px",
                "margin_top": "10px", "margin_bottom": "10px"},
        "img_wrapper": {"background": tint(ink, 0.03), "border_radius": f"{r}px",
                        "padding": "4px", "margin_top": "12px", "margin_bottom": "12px"},

        "hr": {"border": "none", "height": "1px", "background": border,
               "margin_top": "30px", "margin_bottom": "30px"},

        "code": {"background": tint(accent, 0.09), "color": accent2,
                 "padding": "3px 7px", "border_radius": "5px",
                 "font_size": "90%", "font_family": FONTS["mono"]},
        "code_block": {"background": code_bg, "border_radius": f"{a['code_radius']}px",
                       "margin_top": "22px", "margin_bottom": "22px", "overflow": "hidden"},
        "code_header": ({"display": "flex", "align_items": "center", "height": "36px",
                         "padding": "0 12px", "background": code_bg}
                        if a["code_header"] else
                        {"display": "none", "height": "0", "padding": "0"}),
        "pre": {"background": code_bg, "color": "#E6EAF0", "padding": "18px",
                "border_radius": "0", "overflow_x": "auto",
                "margin_top": "0", "margin_bottom": "0", "font_size": f"{SCALE['code']}px",
                "line_height": "1.6", "white_space": "pre-wrap",
                "word_wrap": "break-word", "word_break": "break-all"},
        "pre_code": {"background": "none", "padding": "0", "color": "#E6EAF0",
                     "font_size": f"{SCALE['code']}px", "font_family": FONTS["mono"]},

        "table": {"width": "100%", "border_collapse": "separate", "border_spacing": "0",
                  "border": f"1px solid {border}", "border_radius": f"{r}px",
                  "overflow": "hidden", "font_size": "14px",
                  "margin_top": "18px", "margin_bottom": "18px"},
        "th": {"background": tint(accent, 0.08), "color": accent2,
               "padding": "10px 14px", "text_align": "left",
               "font_weight": "700", "border_bottom": f"1px solid {border}"},
        "td": {"color": ink, "padding": "10px 14px", "font_size": "14px",
               "border_bottom": f"1px solid {border}"},

        "list_wrapper": {"margin_top": "16px", "margin_bottom": "16px"},
        "list_item_row": {"display": "flex", "align_items": "flex-start",
                          "margin_bottom": "9px"},
        "list_item_bullet": {"color": accent, "margin_right": "9px",
                             "font_weight": "bold", "font_size": "15px"},
        "ol_item_bullet": {"display": "inline-flex", "align_items": "center",
                           "justify_content": "center", "width": "22px", "height": "22px",
                           "min_width": "22px", "background": tint(accent, 0.12),
                           "color": accent2, "border_radius": "50%",
                           "font_size": "12px", "font_weight": "700",
                           "margin_right": "10px", "margin_top": "4px"},
        "list_item_text": {"font_size": f"{SCALE['p']}px", "color": ink,
                           "line_height": "1.9", "letter_spacing": "0.4px"},

        "footnote_section": {"margin_top": "30px", "padding_top": "16px",
                             "border_top": f"1px solid {border}"},
        "footnote_title": {"font_size": "13px", "font_weight": "700", "color": muted,
                           "letter_spacing": "0.1em", "margin_bottom": "12px"},
        "footnote_item": {"font_size": "12px", "color": muted, "line_height": "1.7",
                          "margin_bottom": "6px", "word_break": "break-all"},
        "footnote_sup": {"font_size": "11px", "color": accent, "vertical_align": "super",
                         "margin_left": "2px"},

        "callout": {"background": tint(accent, 0.05), "border_left": f"3px solid {accent}",
                    "border_radius": f"0 {r}px {r}px 0", "padding": "14px 18px",
                    "margin_top": "20px", "margin_bottom": "20px"},
        "callout_title": {"font_size": "15px", "font_weight": "700", "color": accent2,
                          "margin_bottom": "8px"},
        "callout_content": {"font_size": "15px", "color": ink, "line_height": "1.8"},
    }

    if is_dark:
        # 暗底主题：代码块要更深（mix 到 ink 会算出浅色块，压在暗底上很刺眼），
        # 文字保持浅色；表格/描边已按 ink 派生，方向本来就对。
        code_bg = spec.get("code_bg") or mix(bg, "#000000", 0.45)
        styles["code_block"]["background"] = code_bg
        styles["code_header"]["background"] = code_bg
        styles["pre"]["background"] = code_bg
        styles["pre"]["color"] = mix(ink, "#FFFFFF", 0.25)
        styles["pre_code"]["color"] = styles["pre"]["color"]
        theme_colors_code_bg = code_bg
    else:
        theme_colors_code_bg = code_bg

    theme = {
        "name": spec["name"],
        "description": spec["desc"],
        "colors": {
            "primary": ink,
            "accent": accent,
            "background": bg,
            "blockquote_bg": tint(accent, 0.04),
            "code_bg": theme_colors_code_bg,
            "hr_color": muted,
            "footnote_bg": tint(accent, 0.03),
        },
        "styles": styles,
    }

    layout = spec.get("layout")
    if layout == "card":
        theme["layout"] = "card"
        theme["card"] = {
            "bg": mix(bg, ink, 0.06),
            "card_bg": bg,
            "card_texture": "none",
            "card_texture_size": "auto",
            "card_border": f"1px solid {border}",
            "card_radius": "14px",
            "card_shadow": f"0 6px 20px {tint(ink, 0.08)}",
        }
    elif layout == "hero":
        theme["layout"] = "hero"
        hero = {
            "accent": accent,
            "accent_light": mix(accent, bg, 0.35),
            "accent_bg": tint(accent, 0.05),
            "accent_border": tint(accent, 0.25),
            "dark_bg": spec.get("hero_dark") or ink,
            "text_color": ink,
            "heading_color": spec.get("heading") or ink,
            "number_color": tint(accent, 0.16),
            **spec.get("hero_flags", {}),
        }
        # 色带底色交给引擎的可见性规则算，不在这里另定门槛
        hero["alt_bg"] = _resolve_band_bg(
            {"accent": accent, "alt_bg": spec.get("hero_alt")}, theme
        )
        theme["hero"] = hero
    elif layout == "timeline":
        theme["layout"] = "timeline"
        theme["timeline"] = {
            "accent": accent,
            "accent_light": mix(accent, bg, 0.6),
            "accent_bg": tint(accent, 0.05),
            "heading_color": ink,
            "line_color": accent,
        }

    return theme


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--dry-run", action="store_true")
    args = ap.parse_args()

    try:
        from theme_specs import SPECS  # 规格与生成逻辑分离，便于复核
    except ImportError:
        print("缺少 scripts/theme_specs.py（47 套原创主题规格），暂不可生成。")
        sys.exit(2)

    ids = [s["id"] for s in SPECS]
    dup = {i for i in ids if ids.count(i) > 1}
    if dup:
        print(f"错误：id 重复 {sorted(dup)}")
        sys.exit(1)

    built, overwritten = set(), []
    for spec in SPECS:
        theme = build_theme(spec)
        out = THEMES_DIR / f"{spec['id']}.json"
        # id 在 SPECS 里就归本脚本管理 → 一律覆盖。spec 是唯一真源，
        # 默认覆盖可避免「改了 spec 重跑却没生效」的静默坑（曾因跳过已存在文件踩到）。
        if out.exists():
            overwritten.append(spec["id"])
        built.add(spec["id"])
        if args.dry_run:
            print(f"  将写出 {out.name}  「{theme['name']}」  layout={theme.get('layout', '-')}")
        else:
            out.write_text(json.dumps(theme, ensure_ascii=False, indent=2), encoding="utf-8")

    print(f"\n{'预演' if args.dry_run else '生成'}完成：{len(built)} 套"
          f"（其中覆盖同 id 主题 {len(overwritten)} 套）")


if __name__ == "__main__":
    main()
