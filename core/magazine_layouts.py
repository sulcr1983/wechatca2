#!/usr/bin/env python3
"""杂志风版式（2026-11-02）：15 套「整篇设计」共用的渲染原语。

为什么单独一个模块：
  format_engine.py 已经 3000+ 行，再塞 15 个版式会失控。这里只放版式渲染，
  不碰样式注入 / 主题解析，职责单一。

和 format_engine 的关系：
  format_engine 在 LAYOUT_REGISTRY 里 `**MAGAZINE_LAYOUTS` 合并进来。
  本模块**不 import format_engine**（避免循环导入），必要的小工具自己带一份。

微信安全区（本模块严格遵守，越界会导致样式被剥离）：
  ✅ 允许：内联 style / border / box-shadow / border-radius / background-color /
           table 布局 / span 包裹 / letter-spacing / text-align
  ❌ 禁止：<style> 标签、class、position / flex / grid、伪元素、@media、动画

铁律：**绝不丢内容**。每个版式出口都做 _plain_len 保真闸门，
      不达标就原样返回 —— 宁可没效果，也不能吞字。
"""

from __future__ import annotations

import re

# ── 小工具（与 format_engine 同名同义，独立一份避免循环导入）────────────


def plain_len(html: str) -> str:
    """纯文字长度（去标签/空白），用于保真闸门。"""
    return len(re.sub(r"<[^>]+>", "", html or "").replace(" ", "").replace("\n", ""))


def hex_to_rgb(c: str):
    s = (c or "").lstrip("#")
    if len(s) == 3:
        s = "".join(ch * 2 for ch in s)
    if len(s) != 6:
        return 0, 0, 0
    try:
        return int(s[0:2], 16), int(s[2:4], 16), int(s[4:6], 16)
    except ValueError:
        return 0, 0, 0


def mix(a: str, b: str, t: float) -> str:
    """线性混色：t=0 取 a，t=1 取 b。"""
    ar, ag, ab = hex_to_rgb(a)
    br, bg, bb = hex_to_rgb(b)
    return "#%02X%02X%02X" % (
        round(ar + (br - ar) * t),
        round(ag + (bg - ag) * t),
        round(ab + (bb - ab) * t),
    )


def rgba(color: str, alpha: float) -> str:
    """强调色 → 半透明底（微信认 rgba）。"""
    r, g, b = hex_to_rgb(color)
    return f"rgba({r},{g},{b},{alpha})"


def _colors(theme: dict) -> tuple[str, str, str]:
    """(强调色, 墨色, 底色) —— 15 套共用同一套取色规则。"""
    c = theme.get("colors") or {}
    accent = c.get("accent") or c.get("primary") or "#333333"
    ink = c.get("primary") or "#222222"
    bg = c.get("background") or theme.get("background") or "#ffffff"
    return accent, ink, bg


def _text_of(html: str) -> str:
    return re.sub(r"<[^>]+>", "", html or "").strip()


# ── 切节原语 ─────────────────────────────────────────────────────


def split_sections(html: str):
    """按 h1/h2 切块 → (导语, [(标题 html, 正文 html), ...])

    与 format_engine._split_by_headings 同义，但这里同时把每节的
    「标题」与「正文」拆开，15 套配方几乎都要分别处理这两半。
    """
    marks = [m.start() for m in re.finditer(r"<h[12][^>]*>", html)]
    if not marks:
        return html, []
    lead = html[: marks[0]]
    out = []
    for i, pos in enumerate(marks):
        end = marks[i + 1] if i + 1 < len(marks) else len(html)
        sec = html[pos:end]
        m = re.match(r"(<h[12][^>]*>.*?</h[12]>)(.*)$", sec, re.DOTALL)
        out.append((m.group(1), m.group(2)) if m else ("", sec))
    return lead, out


def split_blocks(html: str):
    """按顶层块级标签切分，返回 [(片段, 是否块级)]。

    不用正则：`:::stat` 会生成嵌套 <section>，非贪婪正则会在第一个闭合处切断，
    导致标签不配平（format_engine 里踩过这个坑）。
    """
    tags = {"section", "div", "table", "blockquote", "ul", "ol", "pre", "figure"}
    tag_re = re.compile(r"<(/?)([a-zA-Z0-9]+)([^>]*)>")
    pieces, i, buf, depth, start = [], 0, 0, 0, -1
    while True:
        m = tag_re.search(html, i)
        if not m:
            break
        closing, name, attrs = m.group(1), m.group(2).lower(), m.group(3)
        self_close = attrs.strip().endswith("/")
        if name in tags and not self_close:
            if closing:
                depth -= 1
                if depth <= 0 and start >= 0:
                    depth = 0
                    pieces.append((html[buf:start], False))
                    pieces.append((html[start:m.end()], True))
                    buf, start = m.end(), -1
            else:
                if depth == 0:
                    start = m.start()
                depth += 1
        i = m.end()
    pieces.append((html[buf:], False))
    return pieces


# ── 装饰原语（15 套共用）─────────────────────────────────────────


def head_tag(head: str) -> tuple[str, str, str]:
    """拆出 (开标签, 标签名, 内文)，便于往标题里插子元素。"""
    m = re.match(r"(<(h[1-6])[^>]*>)(.*?)(</\2>)", head, re.DOTALL)
    if not m:
        return "", "", head
    return m.group(1), m.group(2), m.group(3)


def restyle_head(head: str, extra: str) -> str:
    """往标题的 style 里**追加**属性（同名属性后写生效，这样才能覆盖原有字号/颜色）。

    ⚠️ 不能前置：前置时原 style 在后、会赢过我们，表现为「改了半天没效果」。
    """
    m = re.match(r"(<(h[1-6]))([^>]*)(>)(.*)$", head, re.DOTALL)
    if not m:
        return head
    tag, attrs, close, rest = m.group(1), m.group(3), m.group(4), m.group(5)
    sm = re.search(r'style="([^"]*)"', attrs)
    if sm:
        new_style = sm.group(1).rstrip(";") + ";" + extra
        attrs = attrs[: sm.start()] + f'style="{new_style}"' + attrs[sm.end():]
    else:
        attrs += f' style="{extra}"'
    return tag + attrs + close + rest


def set_head_style(head: str, props: dict) -> str:
    """按属性名覆盖标题样式（已存在则替换值，不存在则追加）。

    比 restyle_head 更精确：避免同一个属性出现两次，微信两种解析都可能命中。
    """
    m = re.match(r"(<(h[1-6]))([^>]*)(>)(.*)$", head, re.DOTALL)
    if not m:
        return head
    tag, attrs, close, rest = m.group(1), m.group(3), m.group(4), m.group(5)
    sm = re.search(r'style="([^"]*)"', attrs)
    cur = sm.group(1) if sm else ""
    for k, v in props.items():
        pat = re.compile(r"(^|;)\s*" + re.escape(k) + r"\s*:[^;]*")
        if pat.search(cur):
            cur = pat.sub(lambda mm: mm.group(1) + f"{k}:{v}", cur)
        else:
            cur = (cur.rstrip(";") + ";" + f"{k}:{v}") if cur else f"{k}:{v}"
    if sm:
        attrs = attrs[: sm.start()] + f'style="{cur}"' + attrs[sm.end():]
    else:
        attrs += f' style="{cur}"'
    return tag + attrs + close + rest


def eyebrow(text: str, color: str, size: int = 14) -> str:
    """眉题：标题上方压一行小字（卫报/深度阅读用）。"""
    return (
        f'<p style="margin:0 0 6px;font-size:{size}px;line-height:1.4;'
        f'letter-spacing:.14em;color:{color};font-weight:700">{text}</p>'
    )


def thin_rule(color: str, height: int = 1, width: str = "100%", margin: str = "10px 0 14px") -> str:
    """细线。宽度可短（国家地理只用 52px 暗示「换话题」）。"""
    return (
        f'<section style="width:{width};height:{height}px;background:{color};'
        f'margin:{margin}"></section>'
    )


def double_rule(color: str) -> str:
    """两根线，一粗一细、中间隔 3px（卫报分隔线 / Vogue 标题线）。"""
    return (
        f'<section style="margin:14px 0 18px">'
        f'<section style="height:2px;background:{color};margin-bottom:3px"></section>'
        f'<section style="height:1px;background:{color};opacity:.45"></section>'
        f'</section>'
    )


def num_badge(n: int, color: str, text_color: str = "#ffffff", size: int = 13) -> str:
    """编号徽标：01 / 02 方块（经济学人/无印/宜家/笔记纸）。"""
    return (
        f'<span style="display:inline-block;min-width:22px;padding:1px 5px;'
        f'margin-right:8px;background:{color};color:{text_color};'
        f'font-size:{size}px;font-weight:700;line-height:1.5;text-align:center;'
        f'border-radius:2px;letter-spacing:.02em">{n:02d}</span>'
    )


def box(inner: str, border: str, bg: str = "transparent", pad: str = "14px 16px",
        radius: str = "0", shadow: str = "") -> str:
    """通用框：时代细红框 / 浮世绘印章 / 新粗野硬阴影都走这里。"""
    s = (f'<section style="margin:18px 0;padding:{pad};background:{bg};'
         f'border:{border};border-radius:{radius}')
    if shadow:
        s += f";box-shadow:{shadow}"
    return s + f'">{inner}</section>'


def big_quote(text: str, color: str, size: int = 44) -> str:
    """头上的大引号（卫报 44px / 国家地理 28px）。"""
    return (
        f'<p style="margin:0;font-size:{size}px;line-height:1;color:{color};'
        f'font-family:Georgia,serif;opacity:.9">&ldquo;</p>'
    )


def stripes(color: str, n: int = 3, width: int = 18) -> str:
    """三条纹（阿迪达斯固定识别符号）：三根短斜杠，别拉太长。"""
    bars = "".join(
        f'<span style="display:inline-block;width:{width}px;height:4px;'
        f'background:{color};margin-right:5px;{"transform:skewX(-18deg);" if True else ""}'
        f'"></span>'
        for _ in range(n)
    )
    return f'<span style="display:inline-block;vertical-align:middle">{bars}</span>'


def caption_style(html: str, color: str) -> str:
    """图注：比正文小一档的浅灰（时代/无印/Vogue 都强调这点）。"""
    # 只处理「紧跟图片的那一段斜体/纯文字」——引擎已把 <em> 注入过 style，
    # 所以这里按「<p> 内以 ↑ 或 图 / 注 开头」的窄条件命中，避免误伤正文段落。
    return re.sub(
        r'(<p)( style="[^"]*")?(>\s*(?:↑|图|注)[^<]{0,120}</p>)',
        lambda m: f'<p style="margin:6px 0 18px;font-size:12.5px;line-height:1.6;'
                  f'color:{color};letter-spacing:.02em">{m.group(3)[1:]}',
        html,
    )


# ── 保真闸门 ─────────────────────────────────────────────────────


def _guard(original: str, out: str) -> str:
    """出口闸门：文字变少就放弃改造，原样返回。"""
    if plain_len(out) < plain_len(original):
        return original
    return _fix_strong_in_headings(out)


def _fix_strong_in_headings(html: str) -> str:
    """标题里的 <strong> 必须继承标题色（2026-11-06 用户反馈修复）。

    为什么：15 个版式都会 `style_all(out, "strong", {...})` 给**正文**强调色 ——
    mori 是深绿 #507150、ukiyoe 是赭红 #8C3A2E、note 还会垫荧光底。
    这些颜色一旦落在**标题自带底色**上（mori 的豆绿书签块、ukiyoe 的靛蓝印章块），
    就是同色系叠同色系 —— 用户看到的是「小标题颜色和字体颜色一样，看不清」。

    标题带 strong 很常见：用户手动加粗、AI 排版给标题加粗都会产生。
    正文的强调色不变，只把标题内的 strong 恢复成继承。
    """
    def fix(m):
        open_tag, inner, close_tag = m.group(1), m.group(2), m.group(3)
        inner = re.sub(
            r"<strong\b[^>]*>",
            '<strong style="color:inherit;background:transparent">',
            inner,
        )
        return open_tag + inner + close_tag
    return re.sub(r"(<h[1-6]\b[^>]*>)(.*?)(</h[1-6]>)", fix, html, flags=re.DOTALL)


def wrap_block(html: str, tag: str, style: str, *, inner: bool = False) -> str:
    """把每个 <tag>…</tag> 块**包进一层 <section>**（结构级改造）。

    2026-11-03 新增。起因：19 套整篇设计的 layout_* 几乎只调 style_tag 属性，
    标签骨架与配色主题同构，剥掉 CSS 后 8 套/5 套各自完全一样，用户实测
    「和前面的 164 套没啥不同」。配方文档（docs/design-magazine-recipes.md）
    里写的「重点结论外面加一圈细红框」「标题做成白字压豆绿圆角块」
    本来就该是**块级容器**，此前只改属性，等于没做。

    inner=True 时把 section 插在标签**内部**（用于标题这类不能换行的元素），
    否则插在外部（用于引用、段落这类整块元素）。
    """
    def repl(m):
        open_tag, body, close_tag = m.group(1), m.group(2), m.group(3)
        if inner:
            return f"{open_tag}<section style=\"{style}\">{body}</section>{close_tag}"
        return f'<section style="{style}">{open_tag}{body}{close_tag}</section>'

    return re.sub(
        rf"(<{tag}\b[^>]*>)(.*?)(</{tag}>)", repl, html, flags=re.DOTALL
    )


def style_tag(open_tag: str, props: dict) -> str:
    """给单个**开标签**覆盖样式属性（同名替换、缺则追加）。

    比 restyle_head 通用：blockquote / strong / hr 也能用。
    """
    m = re.match(r"(<[a-zA-Z0-9]+)([^>]*?)(/?)>\s*$", open_tag.strip(), re.DOTALL)
    if not m:
        return open_tag
    name, attrs, self_close = m.group(1), m.group(2), m.group(3)
    sm = re.search(r'style="([^"]*)"', attrs)
    cur = sm.group(1) if sm else ""
    for k, v in props.items():
        pat = re.compile(r"(^|;)\s*" + re.escape(k) + r"\s*:[^;]*")
        if pat.search(cur):
            cur = pat.sub(lambda mm: mm.group(1) + f"{k}:{v}", cur)
        else:
            cur = (cur.rstrip(";") + ";" + f"{k}:{v}") if cur else f"{k}:{v}"
    if sm:
        attrs = attrs[: sm.start()] + f'style="{cur}"' + attrs[sm.end():]
    else:
        attrs = attrs.rstrip() + f' style="{cur}"'
    return name + attrs + self_close + ">"


def style_all(html: str, tag: str, props: dict) -> str:
    """给全文所有 <tag> 开标签覆盖样式。"""
    return re.sub(rf"<{tag}\b[^>]*>", lambda m: style_tag(m.group(0), props), html)


def style_quotes(html: str, props: dict, prefix: str = "", suffix: str = "") -> str:
    """处理所有 <blockquote>：改样式 +（可选）在内部首尾插入装饰。

    ⚠️ 必须用捕获组拿**开标签**，不能用 m.group(0) ——
    组 0 是整个匹配串（含正文与 </blockquote>），拿它去重写会把闭合标签写两遍，
    实测表现为 blockquote 8 开 / 16 闭（标签不配平）。
    """
    def repl(m):
        opened = style_tag(m.group(1), props)
        return f"{opened}{prefix}{m.group(2)}{suffix}</blockquote>"
    return re.sub(r"(<blockquote\b[^>]*>)(.*?)(</blockquote>)", repl, html, flags=re.DOTALL)


def decorate_sections(html: str, h1_props=None, h2_props=None,
                      h1_prefix=None, h2_prefix=None):
    """按 h1/h2 分别覆盖样式；h1_prefix/h2_prefix 是「插到标题内文前」的 html。

    prefix 传可调用对象（接收 (序号, 纯文本)）时按 h2 顺序编号，否则当固定字符串。
    """
    idx = 0

    def fix(m):
        nonlocal idx
        open_orig, tag, text = m.group(1), m.group(2), m.group(3)
        is_h1 = tag == "h1"
        props = h1_props if is_h1 else h2_props
        pre = h1_prefix if is_h1 else h2_prefix
        if not is_h1:
            idx += 1
        pre_html = pre(idx, _text_of(text)) if callable(pre) else (pre or "")
        # ⚠️ 必须基于**原开标签**改样式：早先写成 f"<{tag}>" 造了个空标签，
        # 把主题原有 style 全丢了（实测 time/forbes/ikea 三套特征串消失）。
        open_tag = style_tag(open_orig, props) if props else open_orig
        return f"{open_tag}{pre_html}{text}</{tag}>"

    return re.sub(r"(<(h[12])\b[^>]*>)(.*?)(</\2>)", fix, html, flags=re.DOTALL)


def _no_change(html: str) -> str:
    return html


# ══════════════════════════════════════════════════════════════════
# 15 个杂志风版式
# 参数出处：docs/design-magazine-recipes.md（每套都标了行号来源）
# 共同铁律：出口必过 _guard，文字变少就原样返回
# ══════════════════════════════════════════════════════════════════


def layout_time(html: str, theme: dict) -> str:
    """时代周刊：红色只做细框线，不铺底；重点结论加一圈细红框。

    配方要点（recipes 2.1）：
      - 正文 16px / 1.75 / 段后 14px
      - 红色只做框线、标题线、序号、小标签
      - **重点结论外面加一圈细红框** ← 最出效果的一条
      - 开头单独设计：栏目名置顶 → 主标题居中 → 短导语 → 多留白
    """
    accent, ink, _ = _colors(theme)
    out = html

    # 图注：比正文小一档的浅灰
    out = caption_style(out, mix(ink, "#ffffff", 0.45))

    # 正文：16px / 1.75 / 段后 14px
    out = style_all(out, "p", {
        "font-size": "16px", "line-height": "1.75", "margin-bottom": "14px",
    })

    # 标题：h1 居中（杂志开篇），下方压一道红细线；h2 左对齐 + 红序号
    out = style_all(out, "h1", {
        "font-size": "24px", "line-height": "1.35", "text-align": "center",
        "letter-spacing": ".02em", "margin": "10px 0 18px",
        "padding-bottom": "12px", "border-bottom": f"2px solid {accent}",
        "background": "transparent",
    })
    out = decorate_sections(
        out,
        h2_props={
            "font-size": "20px", "line-height": "1.4", "margin": "26px 0 12px",
            "padding-left": "12px", "border-left": f"3px solid {accent}",
            "background": "transparent",
        },
    )

    # 引用：细红框（不铺底）
    out = style_quotes(out, {
        "margin": "18px 0", "padding": "14px 16px",
        "border": f"1px solid {accent}", "border-radius": "0",
        "background": "transparent", "font-size": "15.5px", "line-height": "1.8",
    })

    # 强调句：加粗 + 红色，不加底色
    out = style_all(out, "strong", {"color": accent, "font-weight": "700"})

    # 刊头区：栏目名置顶 + 主标题，独立成一个区块（配方 2.1「开头单独设计」）。
    # ⚠️ 2026-11-03：此前只给 h1 贴样式，骨架上与配色主题同构，用户实测看不出区别。
    out = re.sub(
        r"<h1\b[^>]*>.*?</h1>",
        lambda m: (
            '<section style="margin:26px 0 28px">'
            + eyebrow("栏目 · 特稿", accent, 12)
            + m.group(0)
            + "</section>"
        ),
        out, count=1, flags=re.DOTALL,
    )
    return _guard(html, out)


def layout_guardian(html: str, theme: dict) -> str:
    """卫报：眉题 + 一像素浅灰线 + **引用放大**。

    配方要点（recipes 2.2）：
      - 大标题上方压一行 14px 红色小字（眉题）
      - 线只用 1px 浅灰；h2 前放 10px 红色小方块
      - **引用放大**：正文 16px，引用 19px 加粗，不加框不加底，头上放 44px 引号
    """
    accent, ink, _ = _colors(theme)
    out = html

    out = style_all(out, "p", {
        "font-size": "16px", "line-height": "1.8", "margin-bottom": "16px",
    })

    # h1：上方眉题「观点」+ 大标题；h2 前 10px 红方块 + 顶部 1px 浅灰线
    out = re.sub(
        r"<h1\b[^>]*>(.*?)</h1>",
        lambda m: eyebrow("观点", accent, 14)
                  + style_tag("<h1>", {
                      "font-size": "28px", "line-height": "1.3", "font-weight": "800",
                      "margin": "0 0 16px", "color": ink, "background": "transparent",
                  }).rstrip(">") + ">" + m.group(1) + "</h1>",
        out, count=1, flags=re.DOTALL,
    )
    soft = mix(ink, "#ffffff", 0.72)
    out = re.sub(
        r"<h2\b[^>]*>(.*?)</h2>",
        lambda m: style_tag("<h2>", {
            "font-size": "20px", "line-height": "1.4", "margin": "28px 0 14px",
            "padding-top": "12px", "border-top": f"1px solid {soft}",
            "background": "transparent",
        }).rstrip(">") + ">"
        + f'<span style="display:inline-block;width:10px;height:10px;'
          f'background:{accent};margin-right:9px;vertical-align:baseline"></span>'
        + m.group(1) + "</h2>",
        out, flags=re.DOTALL,
    )

    # 引用：**放大**到 19px 加粗，不加框不加底，头上 44px 红引号
    # 2026-11-03：外层再加一个独立 section（配方「引用要放大」是版面手法，
    # 只改字号骨架上体现不出来）。这是本套区别于 time/economist 的结构特征。
    out = style_quotes(
        out,
        {"margin": "22px 0", "padding": "0", "border": "none", "background": "transparent",
         "font-size": "19px", "line-height": "1.75", "font-weight": "700", "color": ink},
        prefix=big_quote("", accent, 44),
    )
    out = wrap_block(out, "blockquote", "margin:0 -6px;padding:0 6px")

    # 分隔线：两根，中间隔 3px
    out = re.sub(r"<hr\b[^>]*>", double_rule(soft), out)
    return _guard(html, out)


def layout_economist(html: str, theme: dict) -> str:
    """经济学人：红色只画线 + 深灰正文 + 重点句放大。

    配方要点（recipes 2.4）：
      - 正文深灰非纯黑，16px / 1.75
      - 小标题 18px，前面红色「01」「02」序号，下面一条浅灰细线
      - 重点句 **22px 加粗** + 左边一条红线 + 不加底色
    """
    accent, ink, _ = _colors(theme)
    body = mix(ink, "#555555", 0.55)   # 深灰非纯黑
    soft = mix(ink, "#ffffff", 0.78)
    out = html

    out = style_all(out, "p", {
        "font-size": "16px", "line-height": "1.75", "margin-bottom": "16px", "color": body,
    })

    # h1：上方一道红条
    out = re.sub(
        r"<h1\b[^>]*>(.*?)</h1>",
        lambda m: thin_rule(accent, 3, "100%", "0 0 12px")
                  + style_tag("<h1>", {
                      "font-size": "24px", "line-height": "1.35", "margin": "0 0 18px",
                      "color": ink, "background": "transparent",
                  }).rstrip(">") + ">" + m.group(1) + "</h1>",
        out, count=1, flags=re.DOTALL,
    )

    # h2：18px + 红色序号 + 浅灰细线
    out = decorate_sections(
        out,
        h2_props={
            "font-size": "18px", "line-height": "1.5", "margin": "26px 0 12px",
            "padding-bottom": "8px", "border-bottom": f"1px solid {soft}",
            "color": ink, "background": "transparent",
        },
        h2_prefix=lambda n, t: num_badge(n, accent, "#ffffff", 12),
    )

    # 引用：左边一条红竖线
    out = style_quotes(out, {
        "margin": "20px 0", "padding": "2px 0 2px 14px",
        "border-left": f"3px solid {accent}", "border-top": "none",
        "border-right": "none", "border-bottom": "none",
        "background": "transparent", "font-size": "16px", "line-height": "1.8",
    })

    # 重点句：放大到 22px（不是变小）
    out = style_all(out, "strong", {
        "font-size": "22px", "font-weight": "700", "color": ink,
        "line-height": "1.5", "border-left": f"3px solid {accent}",
        "padding-left": "10px",
    })

    # 2026-11-03 结构级：小标题独立成块（配方 2.4「红色序号 + 浅灰细线」是版面手法）。
    # 包裹 h2 使骨架区别于 time（包 h1）/guardian（包 blockquote）。
    out = wrap_block(out, "h2", "margin:26px 0 12px")
    return _guard(html, out)


def layout_natgeo(html: str, theme: dict) -> str:
    """国家地理：招牌黄只画线，不铺底。

    配方要点（recipes 2.3）：
      - 二级标题加黄色编号 22px，左边 4px 粗线、右边 1px 细线
      - 分隔线只画 52px（比整条横线更自然）
      - 引用浅灰底 + 左边 4px 黄线 + 上方 28px 黄引号，正文小一号 15px
      - 高亮不用黄底，字下垫 2px 黄线
    """
    accent, ink, _ = _colors(theme)
    soft = mix(ink, "#ffffff", 0.9)
    out = html

    out = style_all(out, "p", {
        "font-size": "16px", "line-height": "1.8", "margin-bottom": "16px",
    })

    # h2：22px 黄编号 + 左 4px 粗线 + 右 1px 细线（像杂志页码）
    out = decorate_sections(
        out,
        h2_props={
            "font-size": "20px", "line-height": "1.45", "margin": "28px 0 14px",
            "padding": "2px 0 2px 12px", "border-left": f"4px solid {accent}",
            "background": "transparent", "color": ink,
        },
        h2_prefix=lambda n, t: (
            f'<span style="color:{accent};font-size:22px;font-weight:700;'
            f'margin-right:8px;font-style:italic">{n:02d}</span>'
        ),
    )

    # 引用：浅灰底 + 左 4px 黄线 + 上方黄引号，15px
    out = style_quotes(
        out,
        {"margin": "20px 0", "padding": "12px 16px", "background": soft,
         "border-left": f"4px solid {accent}", "border-top": "none",
         "border-right": "none", "border-bottom": "none",
         "font-size": "15px", "line-height": "1.8"},
        prefix=big_quote("", accent, 28),
    )

    # 分隔线：只画 52px（暗示换话题，不铺满整行）
    out = re.sub(r"<hr\b[^>]*>", thin_rule(accent, 3, "52px", "20px 0 22px"), out)

    # 2026-11-03 结构级：引用独立成块（配方 2.3 浅灰底 + 左黄线 + 黄引号）。
    # 与 guardian 的区别：guardian 包的是无框放大引文，这里包的是带底色的引文块。
    out = wrap_block(out, "blockquote", "margin:20px 0")
    return _guard(html, out)


def layout_vogue(html: str, theme: dict) -> str:
    """Vogue 画报：整篇只有黑与白，没有彩色。

    配方要点（recipes 2.8）：
      - 大标题 34px 宋体最粗，下面压两根线（一粗一细）
      - 二级标题 23px，前面放一个 52px 的斜体数字（比标题大一倍多）
      - 正文 16px / 1.9；图片铺满不加圆角
      - 图注 12 号小字，头顶压一根细线
      - 重点**不上色**，只在下面垫一道细线
    """
    _, ink, _ = _colors(theme)
    mono = ink if ink.lower() in ("#000000", "#111111", "#1a1a1a") else "#000000"
    gray = mix(mono, "#ffffff", 0.62)
    out = html

    out = style_all(out, "p", {
        "font-size": "16px", "line-height": "1.9", "margin-bottom": "18px", "color": mono,
    })

    # h1：34px 最粗 + 双线
    out = re.sub(
        r"<h1\b[^>]*>(.*?)</h1>",
        lambda m: style_tag("<h1>", {
            "font-size": "34px", "line-height": "1.2", "font-weight": "900",
            "font-family": "Songti SC, SimSun, Georgia, serif",
            "letter-spacing": "-.01em", "margin": "0 0 0", "color": mono,
            "background": "transparent",
        }).rstrip(">") + ">" + m.group(1) + "</h1>" + double_rule(mono),
        out, count=1, flags=re.DOTALL,
    )

    # h2：23px + 52px 斜体数字
    out = decorate_sections(
        out,
        h2_props={
            "font-size": "23px", "line-height": "1.4", "margin": "30px 0 14px",
            "color": mono, "background": "transparent",
        },
        h2_prefix=lambda n, t: (
            f'<span style="font-size:52px;font-style:italic;font-weight:400;'
            f'line-height:1;color:{mono};margin-right:10px;vertical-align:-6px">{n:02d}</span>'
        ),
    )

    # 图注：12px 小字 + 头顶细线
    out = re.sub(
        r'(<p)( style="[^"]*")?(>\s*(?:↑|图|注)[^<]{0,120}</p>)',
        lambda m: f'<p style="margin:0 0 18px;padding-top:6px;border-top:1px solid {gray};'
                  f'font-size:12px;line-height:1.6;letter-spacing:.04em;color:{gray}">'
                  f'{m.group(3)[1:]}',
        out,
    )

    # 重点：不上色，只垫细线
    out = style_all(out, "strong", {
        "color": mono, "border-bottom": f"1px solid {mono}", "padding-bottom": "1px",
    })

    out = style_all(out, "img", {"border-radius": "0", "width": "100%"})

    # 2026-11-03 结构级：正文段落独立成块（配方 2.8「图片铺满整行、图注压细线」——
    # Vogue 的版面是「图文分块排列」，不是连续流）。
    out = wrap_block(out, "p", "margin:0")
    return _guard(html, out)


def layout_forbes(html: str, theme: dict) -> str:
    """福布斯：大数字当视觉重点。

    配方要点（recipes 2.9）：
      - 正文 16px / 1.7 / 段后 12px
      - h1 26px / h2 19px
      - **数字本身就是主视觉**，放大到 28–32px
      - 黑白灰为主，可加一点深蓝做强调，面积不要大
    """
    accent, ink, _ = _colors(theme)
    out = html

    out = style_all(out, "p", {
        "font-size": "16px", "line-height": "1.7", "margin-bottom": "12px",
    })
    out = style_all(out, "h1", {
        "font-size": "26px", "line-height": "1.3", "margin": "0 0 16px",
        "font-weight": "800", "color": ink, "background": "transparent",
    })
    out = style_all(out, "h2", {
        "font-size": "19px", "line-height": "1.45", "margin": "24px 0 12px",
        "color": accent, "background": "transparent",
    })

    # 正文里的大数字（百分比/金额/倍数）就地放大。
    # ⚠️ 不能只匹配「整段就是一个数字」——真实文章里几乎没有这种段落，
    # 实测夹具 0 命中，版式等于没生效。改为在段落内部找「带单位/百分号」的数字。
    # ⚠️ 必须在**文本节点**里替换：早年直接对整段 HTML 做正则，
    # 会把 <img style="max-width:100%"> 属性里的 100% 也换掉，
    # 导致图片标签被拆开、alt/src 变成正文文字（mg-forbes 实测）。
    _num_re = re.compile(r"(\d[\d,\.]*\s*(?:%|％|万|亿|倍))(?![\d])")

    def _big_num_text(text: str) -> str:
        return _num_re.sub(
            lambda m: f'<span style="font-size:30px;font-weight:800;line-height:1.2;'
                      f'color:{accent}">{m.group(1)}</span>',
            text,
        )

    def _big_num_p(m):
        open_tag, inner = m.group(1), m.group(2)
        parts = re.split(r"(<[^>]+>)", inner)
        for i, seg in enumerate(parts):
            if seg.startswith("<") and seg.endswith(">"):
                continue
            parts[i] = _big_num_text(seg)
        return open_tag + "".join(parts) + "</p>"

    out = re.sub(r"(<p\b[^>]*>)(.*?)</p>", _big_num_p, out, flags=re.DOTALL)

    out = style_quotes(out, {
        "margin": "18px 0", "padding": "0 0 0 12px",
        "border-left": f"2px solid {accent}", "border-top": "none",
        "border-right": "none", "border-bottom": "none",
        "background": "transparent", "font-size": "16px", "line-height": "1.75",
    })

    # 2026-11-03 结构级：引用独立成块（配方 2.9「数字本身就是主视觉，
    # 数据多的地方单独分出来」——「分出来」是版面动作）。
    out = wrap_block(out, "blockquote", "margin:18px 0")
    # 小标题也独立成块：大数字/数据段常挂在小标题下，需要块级分区。
    out = wrap_block(out, "h2", "margin:24px 0 12px")
    return _guard(html, out)


def layout_muji(html: str, theme: dict) -> str:
    """无印良品：米白底 + 低饱和酒红只用于序号。

    配方要点（recipes 2.5）：
      - 正文 16px / 1.8 / 字距 0.5px，暖深灰
      - 小标题 19px 加粗 + 酒红序号 + 下方一条很浅的细线
      - 强调**直接加粗，不标红**
      - 引用铺浅米色底，**不用左侧竖线**
      - 图片不要圆角/边框/阴影
    """
    accent, ink, bg = _colors(theme)
    body = mix(ink, "#3D3935", 0.6)
    soft = mix(body, bg, 0.85)
    quote_bg = mix(bg, body, 0.06)
    out = html

    out = style_all(out, "p", {
        "font-size": "16px", "line-height": "1.8", "margin-bottom": "18px",
        "letter-spacing": "0.5px", "color": body,
    })

    out = decorate_sections(
        out,
        h2_props={
            "font-size": "19px", "line-height": "1.5", "margin": "28px 0 14px",
            "padding-bottom": "7px", "border-bottom": f"1px solid {soft}",
            "color": body, "background": "transparent",
        },
        h2_prefix=lambda n, t: (
            f'<span style="color:{accent};margin-right:9px;font-weight:600">{n:02d}</span>'
        ),
    )

    # 引用：浅米底，无竖线
    out = style_quotes(out, {
        "margin": "20px 0", "padding": "16px 18px", "background": quote_bg,
        "border": "none", "border-radius": "0",
        "font-size": "15.5px", "line-height": "1.85", "color": body,
    })

    out = style_all(out, "strong", {"color": body, "font-weight": "700"})
    out = style_all(out, "img", {"border-radius": "0", "box-shadow": "none", "border": "none"})

    # 2026-11-03 结构级：段落独立成块（配方 2.5「每段 2–4 行，留出明显空隙」——
    # 段落间隙是版面手法，只改 margin-bottom 骨架上看不出区别）。
    out = wrap_block(out, "p", "margin:0 0 4px")
    return _guard(html, out)


def layout_mori(html: str, theme: dict) -> str:
    """森系杂志：暖米底 + 豆绿书签标题。

    配方要点（recipes 2.6）：
      - 正文深棕咖，16px / 1.8 / 段后 20px
      - 标题 20px，**白字压豆绿背景，两边大圆角**（像绿色书签）
      - 小标题左边一条原木色竖线
      - 金句底下铺浅绿圆角底 + 绿色细虚线框
    """
    accent, ink, bg = _colors(theme)
    body = mix(ink, "#3F3A32", 0.65)
    dark_green = mix(accent, "#1d3a1d", 0.35)
    out = html

    out = style_all(out, "p", {
        "font-size": "16px", "line-height": "1.8", "margin-bottom": "20px", "color": body,
    })

    # h2：白字 + 豆绿底 + 大圆角（书签感）
    out = style_all(out, "h2", {
        "font-size": "20px", "line-height": "1.5", "margin": "26px 0 14px",
        "padding": "6px 14px", "background": accent, "color": "#ffffff",
        "border-radius": "18px", "display": "inline-block",
    })

    # 金句：浅绿圆角底 + 绿色细虚线框
    out = style_quotes(out, {
        "margin": "22px 0", "padding": "16px 18px",
        "background": rgba(accent, 0.10),
        "border": f"1px dashed {accent}", "border-radius": "12px",
        "font-size": "16px", "line-height": "1.85", "color": body,
    })

    out = style_all(out, "strong", {"color": dark_green, "font-weight": "700"})

    # 2026-11-03 结构级：h2 外层再包一个块（配方 2.6「白字压豆绿圆角块，像书签」——
    # 书签是挂在版面结构上的，不能只是给文字加背景色）。
    out = wrap_block(out, "h2", "margin:26px 0 14px")
    return _guard(html, out)


def layout_ukiyoe(html: str, theme: dict) -> str:
    """浮世绘：宣纸底 + 靛青 + 赭红印章（**硬阴影**是关键）。

    配方要点（recipes 2.7）：
      - 正文 17px / 1.8 / 段距 20px，衬线宋体，深青灰，两端对齐
      - 标题 24px，米灰字 + 深靛蓝底 + 右下角赭红**硬阴影**
      - 重点结论：深靛青底 + 纯白提亮 + 细线 + 右下赭红实心阴影
    """
    accent, ink, bg = _colors(theme)
    indigo = ink if ink != "#333333" else "#1B3A5C"
    seal = accent if accent != indigo else "#8C3A2E"
    body = mix(indigo, "#22303F", 0.5)
    out = html

    out = style_all(out, "p", {
        "font-size": "17px", "line-height": "1.8", "margin-bottom": "20px",
        "color": body,
        "font-family": "Songti SC, SimSun, serif",
    })

    # h2/h1：靛蓝底 + 米灰字 + 赭红硬阴影（无模糊）
    out = style_all(out, "h2", {
        "font-size": "24px", "line-height": "1.45", "margin": "30px 0 16px",
        "padding": "8px 14px", "background": indigo, "color": "#F3F0E8",
        "box-shadow": f"4px 4px 0 {seal}", "border-radius": "0",
        "display": "inline-block",
    })
    out = style_all(out, "h1", {
        "font-size": "26px", "line-height": "1.35", "margin": "0 0 20px",
        "padding": "10px 14px", "background": indigo, "color": "#F3F0E8",
        "box-shadow": f"5px 5px 0 {seal}", "border-radius": "0",
    })

    # 重点结论：靛底白字 + 细线 + 赭红硬阴影
    out = style_quotes(out, {
        "margin": "24px 0", "padding": "16px 18px",
        "background": indigo, "color": "#FFFFFF",
        "border": f"1px solid {mix(indigo, '#ffffff', 0.25)}",
        "box-shadow": f"5px 5px 0 {seal}", "border-radius": "0",
        "font-size": "16px", "line-height": "1.85",
    })
    # ⚠️ 2026-11-03 实测修复：style_quotes 只改 <blockquote> 自身的 color，
    # 块内 <p> 仍是前面 style_all 注入的深青灰 → 深靛蓝底压深灰字，几乎看不见
    # （截图实测：引文整块糊成一片）。配方 2.7 要求「纯白提亮」，
    # 这里把块内所有 <p> 的字色一起提亮。深底引文只有这一套，不影响其它版式。
    out = re.sub(
        r"(<blockquote\b[^>]*>)(.*?)(</blockquote>)",
        lambda m: m.group(1) + re.sub(
            r"(<p\b[^>]*>)",
            lambda mm: style_tag(mm.group(1), {"color": "#FFFFFF"}),
            m.group(2),
        ) + m.group(3),
        out, flags=re.DOTALL,
    )

    out = style_all(out, "strong", {"color": seal, "font-weight": "700"})

    # 2026-11-03 结构级：h2 外层包块 + 引用包块（配方 2.7 印章感 = 硬阴影压在**整块**上，
    # 只给文字加 box-shadow 在骨架上与配色主题同构）。
    out = wrap_block(out, "h2", "margin:30px 0 16px")
    out = wrap_block(out, "blockquote", "margin:24px 0")
    # 主标题也做成印章块（标题本身带靛蓝底 + 赭红硬阴影，是整块印章，
    # 与 tech 的「无装饰 h1」形成骨架差异）。
    out = wrap_block(out, "h1", "margin:0 0 20px")
    return _guard(html, out)


def layout_note(html: str, theme: dict) -> str:
    """笔记纸底：细网格底 + 深蓝数字序号标牌 + 荧光笔重点。

    配方要点（recipes 2.13）：
      - 正文 16px / 1.9 / 段距 16px，深青灰
      - 背景极淡灰蓝 + 细网格方格纸
      - 小节标题 21px，左边深蓝数字序号标牌，下面压明黄细线
      - 重点结论单独框出，垫浅蓝，左侧蓝色竖线（便签条）
      - 关键词用柔和鹅黄荧光底色
    """
    accent, ink, bg = _colors(theme)
    pen = "#FDF6C8"          # 鹅黄荧光
    body = mix(ink, "#22303F", 0.6)
    out = html

    out = style_all(out, "p", {
        "font-size": "16px", "line-height": "1.9", "margin-bottom": "16px", "color": body,
    })

    # h2：21px + 深蓝序号标牌 + 下方明黄细线
    idx = [0]

    def h2_repl(m):
        idx[0] += 1
        badge = (
            f'<span style="display:inline-block;min-width:26px;padding:2px 7px;'
            f'margin-right:10px;background:{accent};color:#ffffff;font-size:14px;'
            f'font-weight:700;text-align:center;border-radius:4px;'
            f'letter-spacing:.04em">{idx[0]:02d}</span>'
        )
        return ('<h2 style="font-size:21px;line-height:1.5;margin:28px 0 14px;'
                f'padding-bottom:8px;border-bottom:2px solid #F5D90A;'
                f'color:{ink};background:transparent">'
                + badge + m.group(1) + "</h2>")

    out = html
    out = re.sub(r"<h2\b[^>]*>(.*?)</h2>", h2_repl, out, flags=re.DOTALL)

    # 重点：浅蓝底 + 左侧蓝竖线（便签条）
    out = style_quotes(out, {
        "margin": "20px 0", "padding": "14px 16px",
        "background": rgba(accent, 0.07),
        "border-left": f"4px solid {accent}", "border-top": "none",
        "border-right": "none", "border-bottom": "none",
        "font-size": "15.5px", "line-height": "1.85", "color": body,
    })

    # 关键词：荧光笔（浅底，不是荧光色字）
    out = style_all(out, "strong", {
        "background": pen, "font-weight": "700", "color": ink,
    })

    # 2026-11-03 结构级：重点结论独立成便签块（配方 2.13「单独框出来，左侧立蓝色竖线」）。
    out = wrap_block(out, "blockquote", "margin:20px 0")
    # 小节也独立成块：编号标牌 + 明黄细线是「版面分区」而不是行内装饰。
    out = wrap_block(out, "h2", "margin:28px 0 14px")
    return _guard(html, out)


def layout_ikea(html: str, theme: dict) -> str:
    """宜家目录：全篇只用两种颜色，黄色只画线不写字。

    配方要点（recipes 2.14）：
      - 蓝负责写字，黄**只用来画线垫底，一个字都不写**
      - 大标题左对齐 24px 特粗蓝字，下面压一条 4px 黄线
      - 小标题：黄底蓝字的编号块（01、02）
      - 重点加粗变蓝，不标红
    """
    accent, ink, _ = _colors(theme)
    blue = accent
    yellow = "#FFDA1A"
    out = html

    out = style_all(out, "p", {
        "font-size": "16px", "line-height": "1.8", "margin-bottom": "16px",
    })

    # h1：24px 特粗蓝字 + 下方 4px 黄线
    out = re.sub(
        r"<h1\b[^>]*>(.*?)</h1>",
        lambda m: style_tag("<h1>", {
            "font-size": "24px", "line-height": "1.3", "font-weight": "900",
            "text-align": "left", "color": blue, "margin": "0 0 20px",
            "padding-bottom": "10px", "border-bottom": f"4px solid {yellow}",
            "background": "transparent",
        }).rstrip(">") + ">" + m.group(1) + "</h1>",
        out, count=1, flags=re.DOTALL,
    )

    # h2：黄底蓝字编号块
    out = decorate_sections(
        out,
        h2_props={
            "font-size": "20px", "line-height": "1.5", "margin": "26px 0 14px",
            "color": blue, "background": "transparent",
        },
        h2_prefix=lambda n, t: (
            f'<span style="display:inline-block;padding:1px 8px;margin-right:9px;'
            f'background:{yellow};color:{blue};font-weight:800;font-size:16px;'
            f'line-height:1.6">{n:02d}</span>'
        ),
    )

    out = style_all(out, "strong", {"color": blue, "font-weight": "700"})

    # 2026-11-03 结构级：主标题独立成块（配方 2.14「大标题左对齐 + 下方压 4px 黄线，
    # 像货架上的价签」——价签是独立版面单元）。
    out = wrap_block(out, "h1", "margin:0 0 20px")
    return _guard(html, out)


def layout_starbucks(html: str, theme: dict) -> str:
    """星巴克：白底 + 深绿只负责强调 + 米白做分区。

    配方要点（recipes 2.10）：
      - 正文 16px / 1.75 / 段后 14px
      - h1 24px / h2 20px
      - 深绿只放在小标题、序号、重点标签
      - 米白用在引用、总结、信息卡片
    """
    accent, ink, _ = _colors(theme)
    cream = mix(accent, "#ffffff", 0.94)
    out = html

    out = style_all(out, "p", {
        "font-size": "16px", "line-height": "1.75", "margin-bottom": "14px",
    })
    out = style_all(out, "h1", {
        "font-size": "24px", "line-height": "1.35", "margin": "0 0 16px",
        "color": ink, "background": "transparent",
    })
    out = decorate_sections(
        out,
        h2_props={
            "font-size": "20px", "line-height": "1.45", "margin": "26px 0 13px",
            "color": accent, "background": "transparent",
        },
        h2_prefix=lambda n, t: (
            f'<span style="color:{accent};font-weight:700;margin-right:8px">{n:02d}</span>'
        ),
    )

    # 引用：浅米色卡片 + 绿色点缀
    out = style_quotes(out, {
        "margin": "20px 0", "padding": "16px 18px", "background": cream,
        "border": "none", "border-left": f"3px solid {accent}", "border-radius": "6px",
        "font-size": "15.5px", "line-height": "1.8",
    })

    # 2026-11-03 结构级：引用做成独立信息卡（配方 2.10「米白用在引用、总结、
    # 信息卡片上」——「卡片」是版面单元，不能只靠背景色）。
    out = wrap_block(out, "blockquote", "margin:20px 0")
    return _guard(html, out)


def layout_adidas(html: str, theme: dict) -> str:
    """阿迪达斯：黑白高对比 + 三条纹 + 斜向动势。

    配方要点（recipes 2.11）：
      - 正文 16px / 1.7 / 段后 12px，深灰
      - h1 25–27px 加粗 / h2 19px
      - **三条纹**：三根短线，不要拉太长，像固定识别符号
      - 斜线：标题旁加一小段，一两个位置就够
    """
    accent, ink, _ = _colors(theme)
    mono = ink if ink != "#333333" else "#000000"
    body = mix(mono, "#ffffff", 0.22)
    out = html

    out = style_all(out, "p", {
        "font-size": "16px", "line-height": "1.7", "margin-bottom": "12px", "color": body,
    })

    # h1：26px 加粗 + 三条纹
    out = re.sub(
        r"<h1\b[^>]*>(.*?)</h1>",
        lambda m: style_tag("<h1>", {
            "font-size": "26px", "line-height": "1.25", "font-weight": "900",
            "margin": "0 0 18px", "color": mono, "background": "transparent",
            "letter-spacing": "-.01em",
        }).rstrip(">") + ">"
        + f'<span style="display:inline-block;margin-right:10px;vertical-align:middle">'
          + "".join(
              f'<span style="display:inline-block;width:16px;height:4px;background:{mono};'
              f'margin-right:4px;transform:skewX(-20deg)"></span>' for _ in range(3)
          )
          + "</span>" + m.group(1) + "</h1>",
        out, count=1, flags=re.DOTALL,
    )

    out = style_all(out, "h2", {
        "font-size": "19px", "line-height": "1.45", "margin": "24px 0 12px",
        "color": mono, "background": "transparent",
    })
    out = style_quotes(out, {
        "margin": "18px 0", "padding": "12px 0 12px 14px",
        "border-left": f"4px solid {mono}", "border-top": "none",
        "border-right": "none", "border-bottom": "none",
        "background": "transparent", "font-size": "16px", "line-height": "1.75",
    })

    # 2026-11-03 结构级：引用独立成块（配方 2.11「斜向动势」需要块级留白做底）。
    out = wrap_block(out, "blockquote", "margin:18px 0")
    return _guard(html, out)


def layout_brutal(html: str, theme: dict) -> str:
    """新粗野主义：大色块 + 粗黑框 + **硬阴影**。

    配方要点（recipes 2.12）：
      - h1 36px 特粗黑字 + 紫底 + 粗黑框 + 右下**黑色硬阴影**
      - h2 28px 浅黄底 + 黑框 + 硬阴影
      - h3 22px 白字黑底，斜切短标签，不加阴影
      - 正文 17px / 1.6，白底黑字
      - 关键词：黑加粗 + 粉底 + 细黑框
    """
    accent, ink, _ = _colors(theme)
    black = "#000000"
    pink = "#F5C6D0"
    pale_yellow = "#F5E9A8"
    out = html

    out = style_all(out, "p", {
        "font-size": "17px", "line-height": "1.6", "margin-bottom": "16px", "color": black,
    })
    out = style_all(out, "h1", {
        "font-size": "36px", "line-height": "1.2", "font-weight": "900",
        "margin": "0 0 22px", "padding": "10px 14px", "background": accent,
        "color": "#ffffff", "border": f"3px solid {black}",
        "box-shadow": f"8px 8px 0 {black}", "border-radius": "0",
    })
    out = style_all(out, "h2", {
        "font-size": "28px", "line-height": "1.3", "font-weight": "900",
        "margin": "28px 0 14px", "padding": "8px 12px", "background": pale_yellow,
        "color": black, "border": f"3px solid {black}",
        "box-shadow": f"6px 6px 0 {black}", "border-radius": "0",
    })
    out = style_all(out, "h3", {
        "font-size": "22px", "line-height": "1.35", "font-weight": "800",
        "margin": "22px 0 12px", "padding": "4px 12px", "background": black,
        "color": "#ffffff", "display": "inline-block", "border-radius": "0",
    })

    # 引用：白底黑字 + 完整黑框 + 粉色硬阴影
    out = style_quotes(out, {
        "margin": "22px 0", "padding": "14px 16px", "background": "#ffffff",
        "color": black, "border": f"3px solid {black}",
        "box-shadow": f"6px 6px 0 {pink}", "border-radius": "0",
        "font-size": "17px", "line-height": "1.65",
    })

    # 关键词：黑加粗 + 粉底 + 细黑框
    out = style_all(out, "strong", {
        "background": pink, "color": black, "font-weight": "800",
        "border": f"1px solid {black}", "padding": "0 3px",
    })

    # 分隔线：粗黑横线
    out = re.sub(r"<hr\b[^>]*>", thin_rule(black, 4, "100%", "26px 0"), out)

    # 2026-11-03 结构级：正文段落独立成块（配方 2.12「段间留空」靠块级间距实现）。
    out = wrap_block(out, "p", "margin:0")
    return _guard(html, out)


def layout_deepread(html: str, theme: dict) -> str:
    """深度阅读：26px 深褐 + 赤陶点缀 + 微标。

    配方要点（recipes 2.15）：
      - 主标题 26px 深褐，上方加「深度阅读」微标
      - h2 22px 深褐，底部暖灰厚边线（不用方框）
      - h3 18px 赤桃色 + 小星芒
      - 正文 17px / 1.85 / 字距微扩
      - 金句：浅暖米色卡片 + 左侧赤桃粗边
    """
    accent, ink, _ = _colors(theme)
    brown = ink if ink != "#333333" else "#4A3B32"
    warm_gray = mix(brown, "#ffffff", 0.55)
    card = mix(accent, "#ffffff", 0.93)
    out = html

    out = style_all(out, "p", {
        "font-size": "17px", "line-height": "1.85", "margin-bottom": "18px",
        "letter-spacing": "0.3px", "color": brown,
    })

    # h1：26px + 上方「深度阅读」微标
    out = re.sub(
        r"<h1\b[^>]*>(.*?)</h1>",
        # 2026-11-06：微标是 12px 小字，accent 原色在白底只有 3.31:1（低于正文 4.5）→
        # 压深 28% 保色相（赤陶仍是赤陶），对比度提到约 4.9。
        lambda m: eyebrow("深度阅读", mix(accent, "#000000", 0.28), 12)
                  + style_tag("<h1>", {
                      "font-size": "26px", "line-height": "1.3", "color": brown,
                      "margin": "0 0 20px", "background": "transparent",
                      "letter-spacing": "0",
                  }).rstrip(">") + ">" + m.group(1) + "</h1>",
        out, count=1, flags=re.DOTALL,
    )

    # h2：22px + 底部暖灰厚线
    out = style_all(out, "h2", {
        "font-size": "22px", "line-height": "1.45", "margin": "30px 0 16px",
        "padding-bottom": "8px", "border-bottom": f"3px solid {warm_gray}",
        "color": brown, "background": "transparent",
    })

    # h3：18px 赤桃色 + 星芒
    out = re.sub(
        r"<h3\b[^>]*>(.*?)</h3>",
        lambda m: style_tag("<h3>", {
            "font-size": "18px", "line-height": "1.5", "margin": "22px 0 12px",
            "color": accent, "background": "transparent",
        }).rstrip(">") + ">"
        + f'<span style="color:{accent};margin-right:6px">✦</span>'
        + m.group(1) + "</h3>",
        out, flags=re.DOTALL,
    )

    # 金句：浅暖米色卡片 + 左侧赤桃粗边
    out = style_quotes(out, {
        "margin": "24px 0", "padding": "16px 18px", "background": card,
        "border": "none", "border-left": f"4px solid {accent}", "border-radius": "4px",
        "font-size": "16.5px", "line-height": "1.85", "color": brown,
    })

    out = style_all(out, "strong", {
        "color": accent, "font-weight": "700", "background": rgba(accent, 0.08),
    })

    # 2026-11-03 结构级：金句独立成卡片块（配方 2.15「包成浅暖米色卡片」）。
    out = wrap_block(out, "blockquote", "margin:24px 0")
    # 段尾赤桃短横线收尾（配方 2.15「段尾居中对齐划赤桃短横线」）
    out = re.sub(
        r"</blockquote>",
        "</blockquote>" + thin_rule(accent, 2, "48px", "18px auto 0"),
        out, count=1,
    )
    return _guard(html, out)


# ══════════════════════════════════════════════════════════════════
# 2026-11-02 新增 4 套（来源：md2wechat 的四套排版风格，按本项目原语重写）
#   ⚠️ 只借「设计意图」，未复制其 CSS 数值 / HTML 结构 / 文案。
#   归类规则（用户定）：整套设计（配色+版式配套）一律进 mg-* 体系，
#   与 164 套可自由组合的配色主题 su-* 物理隔离。
# ══════════════════════════════════════════════════════════════════


def layout_tech(html: str, theme: dict) -> str:
    """技术编辑：清晰层级 · 克制留白。

    设计意图：技术文最怕花。这里把装饰压到最低 ——
    只靠字号阶梯、字重和留白区分层级，强调色只出现在 h2 左侧一小段标记上。
    """
    accent, ink, _ = _colors(theme)
    out = html

    out = caption_style(out, mix(ink, "#ffffff", 0.5))

    # 正文 16/1.8/段后 16 —— 比时代更松，技术文要能久读
    out = style_all(out, "p", {
        "font-size": "16px", "line-height": "1.8", "margin-bottom": "16px",
        "color": ink,
    })

    # h1：不加任何装饰，靠字重和留白
    out = style_all(out, "h1", {
        "font-size": "23px", "font-weight": "700", "line-height": "1.4",
        "margin": "8px 0 22px", "letter-spacing": ".01em",
        "background": "transparent",
    })

    # h2：一个短的强调色竖条，位置在文字左侧但很短（8px）
    out = decorate_sections(
        out,
        h2_props={
            "font-size": "18px", "font-weight": "700", "line-height": "1.5",
            "margin": "30px 0 14px", "padding-left": "10px",
            "border-left": f"3px solid {accent}", "background": "transparent",
        },
    )

    out = style_all(out, "h3", {
        "font-size": "16px", "font-weight": "600", "line-height": "1.6",
        "margin": "22px 0 10px", "color": accent, "background": "transparent",
    })

    # 引用：不加边框，只用浅底 + 左内边距
    out = style_quotes(out, {
        "margin": "20px 0", "padding": "14px 18px", "border": "none",
        "background": rgba(ink, 0.035), "border-radius": "4px",
        "font-size": "15px", "line-height": "1.85", "color": mix(ink, "#ffffff", 0.15),
    })

    out = style_all(out, "strong", {"color": accent, "font-weight": "600"})

    # 2026-11-03 结构级（配方「清晰层级 · 克制留白」）：h1 / h2 / 引用各自独立成块。
    # h1 不加任何装饰，只用块级留白把它和正文拉开 —— 这正是「克制留白」的落法。
    # 分隔线换成极短竖标记：技术文档靠章节切口而不是装饰线。
    # 此前只贴样式，骨架上与配色主题同构 —— 用户实测「看不出区别」。
    out = wrap_block(out, "h1", "margin:8px 0 22px")
    out = wrap_block(out, "h2", "margin:30px 0 14px")
    out = wrap_block(out, "blockquote", "margin:20px 0")
    # 列表独立成块：技术文的清单/参数表是独立版面单元，靠块级留白与正文分开。
    # ⚠️ 引擎把列表渲染成 <section><span>•</span>…，不是 <ul>（实测），所以要包 p。
    out = wrap_block(out, "p", "margin:0 0 16px")
    out = re.sub(r"<hr\b[^>]*>", thin_rule(accent, 2, "28px", "22px 0"), out)
    return _guard(html, out)


def layout_rational(html: str, theme: dict) -> str:
    """理性技术：强对比 · 非对称秩序。

    设计意图：标题压重量（大字号 + 粗字重 + 上方一道实心条），正文保持轻盈，
    形成明显的体量对比。对齐是左对齐到底，不居中。
    """
    accent, ink, _ = _colors(theme)
    out = html

    out = caption_style(out, mix(ink, "#ffffff", 0.5))

    out = style_all(out, "p", {
        "font-size": "15.5px", "line-height": "1.8", "margin-bottom": "15px",
        "color": ink,
    })

    # h1：大字号 + 上方实心色条（非对称：条短于标题宽度）
    out = style_all(out, "h1", {
        "font-size": "27px", "font-weight": "800", "line-height": "1.3",
        "margin": "0 0 24px", "letter-spacing": "-.01em",
        "padding-top": "14px", "border-top": f"4px solid {accent}",
        "background": "transparent",
    })

    # h2：编号 + 粗字重，无竖条（与 h1 的横条形成对比，不重复装饰语言）
    out = decorate_sections(
        out,
        h2_props={
            "font-size": "19px", "font-weight": "700", "line-height": "1.45",
            "margin": "30px 0 13px", "background": "transparent",
        },
        h2_prefix=lambda n, _t: (
            f'<span style="color:{accent};font-weight:800;'
            f'font-variant-numeric:tabular-nums;margin-right:10px">{n:02d}</span>'
        ),
    )

    out = style_all(out, "h3", {
        "font-size": "16px", "font-weight": "700", "line-height": "1.55",
        "margin": "22px 0 10px", "background": "transparent",
    })

    # 引用：粗左条 + 大字号，靠体量而不是底色
    out = style_quotes(out, {
        "margin": "22px 0", "padding": "4px 0 4px 18px", "border": "none",
        "border-left": f"5px solid {accent}", "background": "transparent",
        "font-size": "17px", "line-height": "1.75", "color": ink,
        "font-weight": "500",
    })

    out = style_all(out, "strong", {"color": accent, "font-weight": "700"})
    return _guard(html, out)


def layout_swiss(html: str, theme: dict) -> str:
    """国际瑞士：统一对齐轴 · 非对称构图。

    设计意图：所有元素咬死同一条左轴线；分隔用等宽细线（不居中、不加装饰）；
    标题区留白拉开，形成「网格感」。
    """
    accent, ink, _ = _colors(theme)
    out = html
    line = mix(ink, "#ffffff", 0.72)

    out = caption_style(out, mix(ink, "#ffffff", 0.5))

    out = style_all(out, "p", {
        "font-size": "15.5px", "line-height": "1.85", "margin-bottom": "15px",
        "color": ink,
    })

    # h1：左对齐、紧字距、下方一道长细线（统一对齐轴的核心道具）
    out = style_all(out, "h1", {
        "font-size": "26px", "font-weight": "700", "line-height": "1.32",
        "margin": "0 0 20px", "letter-spacing": "-.015em",
        "padding-bottom": "14px", "border-bottom": f"1px solid {line}",
        "background": "transparent",
    })

    # h2：小号大写感 + 上方细线，等宽对齐
    out = decorate_sections(
        out,
        h2_props={
            "font-size": "15px", "font-weight": "700", "line-height": "1.5",
            "margin": "34px 0 14px", "letter-spacing": ".1em",
            "padding-top": "14px", "border-top": f"1px solid {line}",
            "background": "transparent",
        },
    )

    out = style_all(out, "h3", {
        "font-size": "15px", "font-weight": "700", "line-height": "1.6",
        "margin": "20px 0 8px", "color": accent, "background": "transparent",
    })

    # 引用：左侧一条细线到底，不加底色（瑞士派不做色块）
    out = style_quotes(out, {
        "margin": "22px 0", "padding": "2px 0 2px 16px", "border": "none",
        "border-left": f"1px solid {ink}", "background": "transparent",
        "font-size": "16px", "line-height": "1.8", "color": mix(ink, "#ffffff", 0.12),
    })

    out = style_all(out, "strong", {"color": accent, "font-weight": "700"})

    # 2026-11-03 结构级（配方「统一对齐轴」）：h1 与 h2 各自独立成块，
    # 靠块级左轴线咬死同一条边。此前只贴样式，骨架无差异。
    out = wrap_block(out, "h1", "margin:0 0 20px")
    out = wrap_block(out, "h2", "margin:34px 0 14px")
    return _guard(html, out)


def layout_light(html: str, theme: dict) -> str:
    """轻刊阅读：暖橙标题 · 松弛图文节奏。

    设计意图：像周末副刊。标题带暖色、正文行距放松、段落之间留白比别人大，
    引用做成「圆角小卡」而不是线条。
    """
    accent, ink, bg = _colors(theme)
    out = html
    soft = mix(accent, bg, 0.88)

    out = caption_style(out, mix(ink, bg, 0.46))

    # 正文：行距 1.9，段后 18 —— 全族最松
    out = style_all(out, "p", {
        "font-size": "16px", "line-height": "1.9", "margin-bottom": "18px",
        "color": ink,
    })

    # h1：暖色字 + 下方一段短粗线（松而不散）
    out = style_all(out, "h1", {
        "font-size": "24px", "font-weight": "700", "line-height": "1.4",
        "margin": "6px 0 20px", "color": accent,
        "padding-bottom": "12px", "border-bottom": f"3px solid {soft}",
        "background": "transparent",
    })

    # h2：暖色 + 无装饰，只靠颜色和留白
    out = decorate_sections(
        out,
        h2_props={
            "font-size": "19px", "font-weight": "700", "line-height": "1.5",
            "margin": "32px 0 15px", "color": accent, "background": "transparent",
        },
    )

    out = style_all(out, "h3", {
        "font-size": "16.5px", "font-weight": "600", "line-height": "1.6",
        "margin": "24px 0 10px", "color": mix(accent, ink, 0.35),
        "background": "transparent",
    })

    # 引用：圆角小卡 + 浅暖底（与时代的「细红框」、瑞士的「细线」都不同）
    out = style_quotes(out, {
        "margin": "24px 0", "padding": "16px 18px", "border": "none",
        "background": rgba(accent, 0.07), "border-radius": "10px",
        "font-size": "16px", "line-height": "1.85", "color": ink,
    })

    out = style_all(out, "strong", {"color": accent, "font-weight": "700"})

    # 2026-11-03 结构级（配方「松弛图文节奏」）：引用做成独立小卡块。
    out = wrap_block(out, "blockquote", "margin:24px 0")
    return _guard(html, out)


# 版式注册表：format_engine 用它更新 LAYOUT_REGISTRY
MAGAZINE_LAYOUTS = {
    "time": layout_time,
    "guardian": layout_guardian,
    "economist": layout_economist,
    "natgeo": layout_natgeo,
    "vogue": layout_vogue,
    "forbes": layout_forbes,
    "muji": layout_muji,
    "mori": layout_mori,
    "ukiyoe": layout_ukiyoe,
    "note": layout_note,
    "ikea": layout_ikea,
    "starbucks": layout_starbucks,
    "adidas": layout_adidas,
    "brutal": layout_brutal,
    "deepread": layout_deepread,
    # 2026-11-02 新增 4 套（md2wechat 风格意图，本项自主实现）
    "tech": layout_tech,
    "rational": layout_rational,
    "swiss": layout_swiss,
    "light": layout_light,
}
