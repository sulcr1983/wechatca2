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

第二批（2026-10-13）「六族 · 十二色」：新增 6 套族级风格系统
（钢印 / 素页 / 卷宗 / 信笺 / 夜航 / 庙会）× 12 个色调 = 72 套。
族级视觉技法走 FAMILIES[*]["patch"]（对统一装配结果做元素级覆盖），
色调只声明色相，具体值按族各自的饱和/明度基线的推导，不沿用任何外部数值。
风格品类的灵感参照见 AGENTS.md §10（TypeZen，AGPL：仅品类观感参照，
未复制其代码 / CSS 数值 / 命名 / 文案）。
"""
import argparse
import colorsys
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
# 所有主题共用同一条标尺，只在原型间调整基线与行高，这样彼此协调。
# 2026-10-18（苏哥拍板）：**整体对齐业界调研比例**（交接文档 §4）——
#   四个来源（135编辑器 / 有一云 / 话媒盒子 / 吉加设计）一致口径：
#   正文 15–16px（15 最推荐）、h1 18–22、h2 16–18；13px 只属「注释/引用」层级。
#   故正文取 15px（业内最推荐值），各级标题按同等比例下探（h1 22 / h2 18 / h3 16 …）。
#   ⚠️ 只改这一处、重跑 `build_themes.py` 即 119 套 su-* 全量生效，可逆。
SCALE = {
    "h1": 22, "h2": 18, "h3": 16, "h4": 15, "h5": 14, "h6": 13,
    "p": 15, "small": 13, "code": 13.5,
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

# ── 第二批（2026-10-13）：六族原型骨架 ─────────────────────────────────
# 只放「骨架旋钮」（圆角 / 字重 / 字距 / 代码块气质），
# 族级视觉技法（粗边 / 硬投影 / 虚线 / 面板等）由下方 FAMILIES[*]["patch"] 追加。
# 既有 9 种原型与其 47 套初代主题的输出保持字节不变。
ARCHETYPES.update({
    # 钢印（新粗野）：直角 + 超粗标题 + 硬投影
    "stamp": dict(radius=0, h_weight=900, h_border=False, letter=0.15, code_radius=0, code_header=True),
    # 素页（极简）：小圆角 + 轻字重 + 大留白
    "minimal": dict(radius=3, h_weight=600, h_border=False, letter=0.30, code_radius=3, code_header=False),
    # 卷宗（商务）：小圆角 + 深色标题块
    "biz": dict(radius=3, h_weight=800, h_border=False, letter=0.15, code_radius=3, code_header=True),
    # 信笺（文艺）：大圆角 + 纸感底色 + 舒展行距
    "letter": dict(radius=10, h_weight=700, h_border=False, letter=0.25, code_radius=8, code_header=False),
    # 夜航（科技）：暗底 + 冷光面板
    "night": dict(radius=6, h_weight=700, h_border=False, letter=0.15, code_radius=6, code_header=True),
    # 庙会（节庆）：大圆角 + 虚线 + 胶囊标题
    "feast": dict(radius=12, h_weight=800, h_border=False, letter=0.25, code_radius=10, code_header=False),
})


# ── 第二批的十二色调：只声明色相与饱和 / 明度微调 ─────────────────────
# 颜色 = f(色调色相, 族级饱和基线, 族级明度基线)，全部由本项目的标尺推导。
FAMILY_TONES = {
    "crimson":   dict(hue=8),                        # 朱砂
    "persimmon": dict(hue=26),                       # 柿橙
    "gold":      dict(hue=43, sat_mul=0.95),         # 麦金
    "bamboo":    dict(hue=152, sat_mul=0.85),        # 竹青
    "teal":      dict(hue=174, sat_mul=0.90),        # 茶青
    "azure":     dict(hue=203),                      # 湖蓝
    "navy":      dict(hue=220, sat_mul=0.95),        # 藏蓝
    "violet":    dict(hue=266, sat_mul=0.95),        # 青莲
    "wisteria":  dict(hue=288, sat_mul=0.90),        # 紫藤
    "blush":     dict(hue=332, sat_mul=0.90),        # 粉黛
    "iron":      dict(hue=215, sat_mul=0.16, light_mul=0.95),  # 铁灰（低饱和中性）
    "chestnut":  dict(hue=24, sat_mul=0.72, light_mul=0.82),   # 栗棕（压暗的暖褐）
}


def _hue_color(hue_deg, sat, light, sat_mul=1.0, light_mul=1.0):
    """按色相 + 族级饱和 / 明度基线推导一个 hex 颜色（HSL → RGB）"""
    s = min(1.0, sat * sat_mul)
    l = min(1.0, light * light_mul)
    r, g, b = colorsys.hls_to_rgb((hue_deg % 360) / 360.0, l, s)
    return "#%02X%02X%02X" % (round(r * 255), round(g * 255), round(b * 255))


def _hue_shift(hex_color: str, delta_deg: float) -> str:
    """色相旋转（保持饱和 / 明度），用于推导「同族更暖一点」的辅助色"""
    r, g, b = [x / 255 for x in _rgb(hex_color)]
    h, l, s = colorsys.rgb_to_hls(r, g, b)
    r, g, b = colorsys.hls_to_rgb((h + delta_deg / 360.0) % 1.0, l, s)
    return "#%02X%02X%02X" % (round(r * 255), round(g * 255), round(b * 255))


def _patch_stamp(c):
    """钢印（新粗野）：墨黑粗边 + 右下硬投影 + 实心色块，全部直角"""
    ink, bg, accent = c["ink"], c["bg"], c["accent"]
    return {
        "h1": {"text_align": "left", "background": ink, "color": bg,
               "padding": "12px 16px", "letter_spacing": "0.12em",
               "box_shadow": f"6px 6px 0 {accent}"},
        "h2": {"display": "inline-block", "background": accent, "color": ink,
               "border": f"2px solid {ink}", "padding": "6px 14px",
               "box_shadow": f"4px 4px 0 {ink}", "letter_spacing": "0.15em"},
        "h3": {"color": ink, "border_bottom": f"3px solid {accent}",
               "padding_bottom": "6px", "display": "table",
               "letter_spacing": "0.1em"},
        "blockquote": {"border": f"2px solid {ink}", "border_radius": "0",
                       "box_shadow": f"4px 4px 0 {ink}", "background": tint(accent, 0.10)},
        "strong": {"font_weight": "800", "background": accent, "color": ink,
                   "padding": "0 4px", "border_bottom": f"2px solid {ink}"},
        "em": {"font_style": "italic", "color": ink,
               "text_decoration": f"underline 2px {accent}"},
        "a": {"color": ink, "background": tint(accent, 0.30), "padding": "0 2px",
              "font_weight": "700", "border_bottom": f"2px solid {ink}"},
        "img": {"border": f"2px solid {ink}", "border_radius": "0",
                "box_shadow": f"5px 5px 0 {accent}"},
        "hr": {"height": "4px", "background": ink},
        "list_item_bullet": {"color": ink, "font_weight": "900"},
        "ol_item_bullet": {"background": accent, "color": ink, "border_radius": "0",
                           "border": f"2px solid {ink}",
                           "box_shadow": f"2px 2px 0 {ink}"},
        "code": {"background": tint(accent, 0.16), "color": ink,
                 "border_radius": "0", "border": f"1px solid {ink}"},
        "code_block": {"border": f"2px solid {ink}", "border_radius": "0",
                       "box_shadow": f"5px 5px 0 {ink}"},
        "code_header": {"background": accent, "border_bottom": f"2px solid {ink}"},
        "table": {"border": f"2px solid {ink}", "border_radius": "0"},
        "th": {"background": accent, "color": ink, "border_bottom": f"2px solid {ink}"},
        "td": {"border_bottom": f"1px solid {tint(ink, 0.18)}"},
    }


def _patch_minimal(c):
    """素页（极简）：发丝分隔线 + 唯一强调色 + 透明引用"""
    ink, accent = c["ink"], c["accent"]
    return {
        "h1": {"font_size": "24px", "font_weight": "600", "color": ink,
               "letter_spacing": "0.30em", "margin_bottom": "26px",
               # 色调可见化（2026-10-24）：纯文字文章也必须能看出换色
               "border_bottom": f"2px solid {accent}", "padding_bottom": "10px"},
        "h2": {"font_weight": "600", "color": ink, "letter_spacing": "0.18em",
               "border_bottom": f"1px solid {mix(c['bg'], ink, 0.14)}",
               "padding_bottom": "10px"},
        "h3": {"color": ink, "font_weight": "600", "letter_spacing": "0.08em"},
        "p": {"color": ink, "line_height": "2.0", "margin_bottom": "22px"},
        "strong": {"font_weight": "700", "color": ink,
                   "border_bottom": f"1px solid {tint(accent, 0.55)}"},
        "a": {"color": accent, "border_bottom": f"1px solid {accent}"},
        "blockquote": {"border_left": f"2px solid {accent}", "background": "transparent",
                       "border_radius": "0", "padding": "2px 0 2px 16px"},
        "img": {"border_radius": "3px"},
        "hr": {"background": mix(c["bg"], ink, 0.12),
               "margin_top": "40px", "margin_bottom": "40px"},
        "list_item_bullet": {"color": accent, "font_size": "14px"},
        "ol_item_bullet": {"background": "none", "color": accent,
                           "border_radius": "0", "font_weight": "600"},
        "code": {"background": tint(ink, 0.05), "color": ink, "border_radius": "3px"},
        "code_block": {"background": tint(ink, 0.035), "border_radius": "3px",
                       "border": f"1px solid {tint(ink, 0.08)}"},
        "table": {"border": f"1px solid {mix(c['bg'], ink, 0.12)}", "border_radius": "3px"},
        "th": {"background": tint(ink, 0.03), "color": ink,
               "border_bottom": f"1px solid {mix(c['bg'], ink, 0.2)}"},
        "td": {"border_bottom": f"1px solid {tint(ink, 0.08)}"},
    }


def _patch_biz(c):
    """卷宗（商务）：实心标题块 + 虚线分节 + 深色表头"""
    ink, accent, accent2 = c["ink"], c["accent"], c["accent2"]
    return {
        "h1": {"text_align": "left", "color": ink, "letter_spacing": "0.06em",
               # 色调可见化（2026-10-24）：下划线由墨色改为本族强调色
               "border_bottom": f"2px solid {accent}", "padding_bottom": "12px",
               "margin_bottom": "26px"},
        "h2": {"display": "inline-block", "background": accent, "color": "#FFFFFF",
               "padding": "6px 16px", "border_radius": "3px",
               "letter_spacing": "0.1em"},
        "h3": {"color": ink, "border_bottom": f"1px dashed {tint(accent, 0.45)}",
               "padding_bottom": "6px", "letter_spacing": "0.05em"},
        "strong": {"color": accent2, "font_weight": "700"},
        "a": {"color": accent, "border_bottom": f"1px solid {accent}"},
        "blockquote": {"border_left": f"4px solid {accent}",
                       "background": mix(c["bg"], accent, 0.05),
                       "border_radius": "0 3px 3px 0",
                       "color": mix(ink, c["bg"], 0.25)},
        "img": {"border_radius": "3px", "border": f"1px solid {mix(c['bg'], ink, 0.12)}"},
        "hr": {"height": "2px", "background": mix(c["bg"], ink, 0.22)},
        "list_item_bullet": {"color": accent, "font_weight": "700"},
        "ol_item_bullet": {"background": tint(accent, 0.12), "color": accent2,
                           "border_radius": "2px", "font_weight": "700"},
        "code": {"background": tint(ink, 0.06), "color": accent2, "border_radius": "3px"},
        "code_block": {"border_radius": "3px", "border": f"1px solid {tint(ink, 0.10)}"},
        "table": {"border_radius": "3px", "border": f"1px solid {mix(c['bg'], ink, 0.14)}"},
        "th": {"background": ink, "color": "#FFFFFF", "border_bottom": "none"},
        "td": {"border_bottom": f"1px solid {tint(ink, 0.08)}"},
    }


def _patch_letter(c):
    """信笺（文艺）：米色纸底 + 短横线收束 + 柔和的唯一强调色"""
    ink, accent, accent2 = c["ink"], c["accent"], c["accent2"]
    return {
        "h1": {"font_size": "24px", "font_weight": "600", "letter_spacing": "0.30em",
               "margin_bottom": "24px",
               # 色调可见化（2026-10-24）：纯文字文章靠标题下划线体现本族强调色
               "border_bottom": f"2px solid {accent}", "padding_bottom": "10px"},
        "h2": {"color": ink, "font_weight": "700", "letter_spacing": "0.12em",
               "border_left": f"3px solid {tint(accent, 0.65)}", "padding_left": "12px"},
        "h3": {"color": mix(accent, ink, 0.25), "font_weight": "700"},
        "p": {"line_height": "2.0", "letter_spacing": "0.5px", "margin_bottom": "22px"},
        "strong": {"color": mix(accent, ink, 0.15), "font_weight": "700"},
        "a": {"color": accent, "border_bottom": f"1px dotted {tint(accent, 0.7)}"},
        "blockquote": {"border": f"1px solid {tint(accent, 0.18)}",
                       "background": tint(accent, 0.055), "border_radius": "10px"},
        "img": {"border_radius": "10px",
                "box_shadow": f"0 6px 18px {tint(ink, 0.10)}"},
        "hr": {"height": "3px", "width": "36px", "background": tint(accent, 0.5),
               "margin_left": "auto", "margin_right": "auto",
               "margin_top": "36px", "margin_bottom": "36px"},
        "list_item_bullet": {"color": tint(accent, 0.85)},
        "code": {"background": tint(accent, 0.10), "color": accent2},
        "code_block": {"border_radius": "10px",
                       "border": f"1px solid {tint(accent, 0.12)}"},
        "table": {"border_radius": "10px",
                  "border": f"1px solid {mix(c['bg'], ink, 0.10)}"},
        "th": {"background": tint(accent, 0.10), "color": accent2},
        "td": {"border_bottom": f"1px solid {tint(accent, 0.12)}"},
    }


def _patch_night(c):
    """夜航（科技）：深空底 + 冷光面板 + 微光分隔线"""
    ink, accent, accent2 = c["ink"], c["accent"], c["accent2"]
    panel = "#070D18"  # 比页面底色更深一档的代码面
    return {
        "h1": {"text_align": "left", "color": accent, "letter_spacing": "0.14em",
               "border_bottom": f"1px solid {tint(accent, 0.4)}",
               "padding_bottom": "12px"},
        "h2": {"color": "#FFFFFF", "background": tint(accent, 0.10),
               "border_left": f"4px solid {accent}", "border_radius": "0 6px 6px 0",
               "padding": "8px 14px", "letter_spacing": "0.06em"},
        "h3": {"color": accent2, "font_weight": "700"},
        "p": {"color": "#B9C6D6", "line_height": "1.9"},
        "strong": {"color": "#FFFFFF", "background": tint(accent, 0.16),
                   "padding": "0 3px", "border_radius": "3px"},
        "em": {"font_style": "normal", "color": accent2,
               "border_bottom": f"1px dashed {tint(accent, 0.5)}"},
        "a": {"color": accent2, "border_bottom": f"1px solid {tint(accent, 0.6)}"},
        "blockquote": {"border": f"1px solid {tint(accent, 0.35)}",
                       "background": tint(accent, 0.06), "border_radius": "6px",
                       "color": "#9FB0C4"},
        "img": {"border": f"1px solid {tint(accent, 0.35)}", "border_radius": "6px"},
        "hr": {"background": tint(accent, 0.35),
               "box_shadow": f"0 0 10px {tint(accent, 0.45)}"},
        "list_item_bullet": {"color": accent2, "font_family": FONTS["mono"]},
        "ol_item_bullet": {"background": tint(accent, 0.14), "color": accent2,
                           "border_radius": "2px", "font_family": FONTS["mono"]},
        "code": {"background": tint(accent, 0.14), "color": accent2},
        "code_block": {"background": panel,
                       "border": f"1px solid {tint(accent, 0.25)}"},
        "code_header": {"background": "#0E1626",
                        "border_bottom": f"1px solid {tint(accent, 0.2)}"},
        "pre": {"background": panel, "color": "#C7D5E6"},
        "pre_code": {"color": "#C7D5E6"},
        "table": {"border": f"1px solid {tint(ink, 0.14)}"},
        "th": {"background": tint(accent, 0.12), "color": accent2},
        "td": {"border_bottom": f"1px solid {tint(ink, 0.10)}"},
    }


def _patch_feast(c):
    """庙会（节庆）：暖米底 + 胶囊标题 + 虚线圆角 + 实心首标题"""
    ink, accent, accent2 = c["ink"], c["accent"], c["accent2"]
    return {
        "h1": {"background": accent, "color": "#FFFFFF", "text_align": "center",
               "padding": "12px", "border_radius": "12px",
               "letter_spacing": "0.2em",
               "box_shadow": f"0 4px 0 0 {mix(accent, ink, 0.35)}"},
        "h2": {"display": "inline-block", "background": tint(accent, 0.12),
               "color": mix(accent, ink, 0.35), "border": f"2px dashed {accent}",
               "border_radius": "100px", "padding": "5px 18px",
               "letter_spacing": "0.12em"},
        "h3": {"text_align": "center", "color": mix(accent, ink, 0.2)},
        "strong": {"background": tint(accent, 0.20), "color": ink,
                   "padding": "0 4px", "border_radius": "4px"},
        "em": {"color": accent2, "font_style": "italic"},
        "a": {"color": accent2, "border_bottom": f"2px solid {tint(accent, 0.5)}"},
        "blockquote": {"border": f"2px dashed {tint(accent, 0.55)}",
                       "background": tint(accent, 0.06), "border_radius": "10px",
                       "color": mix(ink, c["bg"], 0.2)},
        "img": {"border": f"3px solid {tint(accent, 0.35)}", "border_radius": "12px"},
        "hr": {"height": "0", "background": "none",
               "border_top": f"2px dashed {tint(accent, 0.45)}"},
        "list_item_bullet": {"color": accent2, "font_size": "16px"},
        "ol_item_bullet": {"background": tint(accent, 0.16), "color": accent2},
        "code": {"background": tint(accent, 0.12), "color": accent2},
        "code_block": {"background": "#FFFDF8", "border_radius": "10px",
                       "border": f"2px dashed {tint(accent, 0.35)}"},
        "table": {"border": f"1px solid {tint(accent, 0.3)}", "border_radius": "10px"},
        "th": {"background": tint(accent, 0.16), "color": mix(accent, ink, 0.4)},
        "td": {"border_bottom": f"1px solid {tint(accent, 0.15)}"},
    }


# ── 第二批的六族系统定义 ───────────────────────────────────────────────
# accent 值 = _hue_color(色调色相, 本族饱和基线, 本族明度基线)；accent2 为族内辅助色规则。
FAMILIES = {
    "stamp": dict(arch="stamp", dark=False, bg="#FFFFFF", ink="#111111", font="sans",
                  sat=0.85, light=0.55,
                  accent2=lambda accent, bg, ink: accent,
                  patch=_patch_stamp),
    "minimal": dict(arch="minimal", dark=False, bg="#FFFFFF", ink="#3C434D", font="sans",
                    sat=0.42, light=0.46,
                    accent2=lambda accent, bg, ink: accent,
                    patch=_patch_minimal),
    "biz": dict(arch="biz", dark=False, bg="#FFFFFF", ink="#1E2A38", font="sans",
                sat=0.62, light=0.38,
                accent2=lambda accent, bg, ink: mix(accent, "#000000", 0.18),
                patch=_patch_biz),
    "letter": dict(arch="letter", dark=False, bg="#FBF8F2", ink="#3A342C", font="serif",
                   sat=0.38, light=0.44,
                   accent2=lambda accent, bg, ink: mix(accent, ink, 0.35),
                   patch=_patch_letter),
    "night": dict(arch="night", dark=True, bg="#0B1220", ink="#D9E2EF", font="sans",
                  sat=0.80, light=0.60,
                  accent2=lambda accent, bg, ink: mix(accent, "#FFFFFF", 0.32),
                  patch=_patch_night),
    "feast": dict(arch="feast", dark=False, bg="#FFF7EC", ink="#3B2B1D", font="sans",
                  sat=0.72, light=0.52,
                  accent2=lambda accent, bg, ink: _hue_shift(accent, 14),
                  patch=_patch_feast),
}

# 族 → 专属版式（A 方案，2026-10-24）
# 目的：让「换族」不只是换颜色，而是换结构。对应关系取自各族的性格：
#   stamp  钢印 —— cardflow 卡片流：粗野风配硬边分块，每节独立成卡
#   minimal 素页 —— rhythm 图文节奏：极简不装饰，只靠留白制造呼吸
#   biz    卷宗 —— outline 目录导航：商务长文最需要结构感与目录
#   letter 信笺 —— magazine 杂志分栏：衬线 + 双栏，最像纸媒内页
#   night  夜航 —— cardflow 卡片流：深底上用浅色卡片分块，层次最清楚
#   feast  庙会 —— rhythm 图文节奏：节庆感靠标题强调条 + 宽松间距
FAMILY_LAYOUT = {
    "stamp": "cardflow",
    "minimal": "rhythm",
    "biz": "outline",
    "letter": "magazine",
    "night": "cardflow",
    "feast": "rhythm",
}

# 族 → 段落色块默认开关（C 方案）：哪些族默认开启哪种强调
FAMILY_BLOCKS = {
    "stamp": {"quote": True, "data": True, "tip": True},
    "minimal": {"quote": False, "data": True, "tip": False},
    "biz": {"quote": False, "data": True, "tip": True},
    "letter": {"quote": True, "data": False, "tip": False},
    "night": {"quote": True, "data": True, "tip": True},
    "feast": {"quote": True, "data": True, "tip": True},
}


def _apply_family(patch_fn, styles: dict, ctx: dict):
    """把族级技法补丁合并进统一装配出的 styles（元素级覆盖，未列出的键保持原样）"""
    for el, kv in patch_fn(ctx).items():
        styles.setdefault(el, {}).update(kv)


def build_theme(spec: dict) -> dict:
    """把一条设计意图展开成完整主题 JSON"""
    fam = FAMILIES.get(spec["family"]) if spec.get("family") else None
    if fam:
        # 第二批：颜色全部由「色调色相 × 族级基线」推导，spec 里不带具体色值
        tone = FAMILY_TONES[spec["tone"]]
        bg, ink = fam["bg"], fam["ink"]
        accent = _hue_color(tone["hue"], fam["sat"], fam["light"],
                            tone.get("sat_mul", 1.0), tone.get("light_mul", 1.0))
        accent2 = fam["accent2"](accent, bg, ink)
    else:
        bg = spec["bg"]
        ink = spec["ink"]
        accent = spec["accent"]
        accent2 = spec.get("accent2", accent)
    border = mix(bg, ink, 0.14)
    muted = mix(ink, bg, 0.35)
    code_bg = spec.get("code_bg") or mix(bg, ink, 0.92)
    is_dark = fam["dark"] if fam else spec.get("dark", False)

    font = FONTS[spec.get("font") or (fam["font"] if fam else "sans")]
    a = ARCHETYPES[fam["arch"] if fam else spec.get("arch", "plain")]

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

    # 第二批：族级技法补丁在统一装配（含暗色适配）之后做元素级覆盖
    if fam:
        _apply_family(fam["patch"], styles, {
            "bg": bg, "ink": ink, "accent": accent, "accent2": accent2,
            "muted": muted, "border": border,
        })

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
    # 族级默认版式（A 方案）：spec 显式指定优先，其次族默认
    if not layout and fam:
        layout = FAMILY_LAYOUT.get(spec.get("family"))
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
    elif layout in ("magazine", "rhythm", "cardflow", "outline"):
        # 新版式（B 方案）：引擎按 theme.colors 派生全部颜色，这里只登记 id
        theme["layout"] = layout

    # 段落色块开关（C 方案）：族级默认，spec 可覆盖
    blocks = spec.get("blocks")
    if blocks is None and fam:
        blocks = FAMILY_BLOCKS.get(spec.get("family"))
    if blocks and any(blocks.values()):
        theme["blocks"] = dict(blocks)

    return theme


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--dry-run", action="store_true")
    args = ap.parse_args()

    try:
        from theme_specs import SPECS  # 规格与生成逻辑分离，便于复核
    except ImportError:
        print("缺少 scripts/theme_specs.py（原创主题规格），暂不可生成。")
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
            # 显式 LF：仓库里主题 JSON 是 LF，Windows 默认 CRLF 会让 119 套全变「假改动」
            out.write_text(json.dumps(theme, ensure_ascii=False, indent=2), encoding="utf-8", newline="\n")

    print(f"\n{'预演' if args.dry_run else '生成'}完成：{len(built)} 套"
          f"（其中覆盖同 id 主题 {len(overwritten)} 套）")


if __name__ == "__main__":
    main()
