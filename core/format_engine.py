#!/usr/bin/env python3
"""微信公众号文章排版工具

将 Markdown 文件转为微信公众号兼容的内联样式 HTML。
微信编辑器不支持 <style> 标签、CSS class 和 JS，
所以所有样式必须用 style="..." 内联写在每个标签上。

用法:
    python3 format.py --input article.md --theme elegant [--vault-root /path] [--output /path]
    python3 format.py --input article.md --format plain  # 纯 HTML 输出（无微信兼容处理）
"""

import json
import os
import re
import shutil
import sys
import uuid
from pathlib import Path

import markdown

# ── 脚注占位符（UUID 防冲突）──────────────────────────────────────────
_FN_PREFIX = f"__FN_{uuid.uuid4().hex[:8]}_"
FOOTNOTE_PLACEHOLDERS = {
    "footnote_sup": f"{_FN_PREFIX}SUP__",
    "footnote_section": f"{_FN_PREFIX}SECTION__",
    "footnote_title": f"{_FN_PREFIX}TITLE__",
    "footnote_item": f"{_FN_PREFIX}ITEM__",
}

# ── Callout 类型颜色映射（语义色，不依赖主题）──────────────────────────
CALLOUT_TYPE_COLORS = {
    "tip":       {"border": "#10b981", "bg": "rgba(16,185,129,0.06)", "icon": "\U0001f4a1"},
    "note":      {"border": "#3b82f6", "bg": "rgba(59,130,246,0.06)", "icon": "\U0001f4dd"},
    "important": {"border": "#8b5cf6", "bg": "rgba(139,92,246,0.06)", "icon": "\u26a1"},
    "warning":   {"border": "#f59e0b", "bg": "rgba(245,158,11,0.06)", "icon": "\u26a0\ufe0f"},
    "caution":   {"border": "#ef4444", "bg": "rgba(239,68,68,0.06)",  "icon": "\U0001f534"},
    "callout":   None,  # 默认用主题色，不覆盖
}

# Gallery 核心主题列表（按用途分类，不存在的会跳过）
GALLERY_THEMES = [
    # 卡片系列（3，暖光/清新/静谧）— 新增，置顶展示
    "warm-card", "fresh-card", "ocean-card",
    # 深度长文（4）
    "newspaper", "magazine", "ink", "coffee-house",
    # 科技产品（4）
    "bytedance", "github", "sspai", "midnight",
    # 文艺随笔（4）
    "terracotta", "mint-fresh", "sunset-amber", "lavender-dream",
    # 活力动态（4）
    "sports", "bauhaus", "chinese", "wechat-native",
    # 模板布局（4，每种布局1个代表）
    "minimal-gray", "bold-navy", "bold-green", "bold-blue",
]

# Gallery 示例文章（写死，不用用户文章）
GALLERY_DEMO_MARKDOWN = """\
## 主要功能

在数字化时代，**内容创作**变得越来越重要。一款好的排版工具，能让你的文章在众多内容中**脱颖而出**。

> 好的排版不只是视觉享受，更是对读者的尊重。

### 核心亮点

- 完整的 Markdown 语法支持
- 精美的主题样式
- 一键复制到微信发布

1. 撰写你的内容
2. 选择喜欢的风格
3. 一键复制粘贴

---

### 代码示例

`inline code` 也是支持的。

```python
def hello():
    print("Hello, World!")
```

| 功能 | 状态 |
|------|------|
| 实时预览 | 已支持 |
| 主题选择 | 已支持 |

> [!tip] 小技巧
> 选择适合你文章风格的主题，效果更佳。
"""

# ── 路径 ────────────────────────────────────────────────────────────────
SCRIPT_DIR = Path(__file__).parent
SKILL_DIR = SCRIPT_DIR.parent  # 项目根目录
THEMES_DIR = SKILL_DIR / "assets" / "themes"
TEMPLATE_DIR = SKILL_DIR / "templates"

try:
    with open(SKILL_DIR / "config.json", encoding="utf-8") as f:
        CONFIG = json.load(f)
    OUTPUT_DIR = Path(CONFIG["output_dir"])
    VAULT_ROOT = Path(CONFIG["vault_root"])
    DEFAULT_THEME = CONFIG["settings"]["default_theme"]
    AUTO_OPEN = CONFIG["settings"]["auto_open_browser"]
except FileNotFoundError:
    CONFIG = {}
    OUTPUT_DIR = Path("output")
    VAULT_ROOT = Path(".")
    DEFAULT_THEME = "bold-blue"
    AUTO_OPEN = False


# ── 主题加载 ────────────────────────────────────────────────────────────
def load_theme(theme_name: str) -> dict:
    """加载主题。支持三种格式：
    1. 传统主题名: 'terracotta' → themes/terracotta.json
    2. 矩阵组合名: 'accent-ocean' → layouts/accent.json + palettes/ocean.json 合并
    3. 如果都找不到，报错
    """
    # 1. 先尝试传统主题
    theme_path = THEMES_DIR / f"{theme_name}.json"
    if theme_path.exists():
        with open(theme_path, encoding="utf-8") as f:
            return json.load(f)

    # 2. 尝试矩阵组合
    if "-" in theme_name:
        layout_name, palette_name = theme_name.split("-", 1)
        layout_path = THEMES_DIR / "layouts" / f"{layout_name}.json"
        palette_path = THEMES_DIR / "palettes" / f"{palette_name}.json"
        if layout_path.exists() and palette_path.exists():
            return merge_layout_palette(layout_path, palette_path)

    # 3. 报错
    available = [p.stem for p in THEMES_DIR.glob("*.json")]
    # 加上矩阵组合
    layouts = [p.stem for p in (THEMES_DIR / "layouts").glob("*.json")] if (THEMES_DIR / "layouts").exists() else []
    palettes = [p.stem for p in (THEMES_DIR / "palettes").glob("*.json")] if (THEMES_DIR / "palettes").exists() else []
    if layouts and palettes:
        available.append(f"矩阵组合: {','.join(layouts)} × {','.join(palettes)}")
    print(f"错误: 主题 '{theme_name}' 不存在。\n可用: {', '.join(available)}")
    sys.exit(1)


def merge_layout_palette(layout_path: Path, palette_path: Path) -> dict:
    """合并布局模板和色板，替换占位符"""
    with open(layout_path, encoding="utf-8") as f:
        layout = json.load(f)
    with open(palette_path, encoding="utf-8") as f:
        palette = json.load(f)

    # 构建替换映射
    replacements = {
        "{{accent}}": palette["accent"],
        "{{accent_light}}": palette["accent_light"],
        "{{primary}}": palette["primary"],
        "{{background}}": palette["background"],
        "{{blockquote_bg}}": palette["blockquote_bg"],
        "{{code_bg}}": palette["code_bg"],
        "{{hr_color}}": palette["hr_color"],
        "{{footnote_bg}}": palette["footnote_bg"],
        "{{table_border}}": palette["table_border"],
        "{{dark_accent}}": palette["dark_accent"],
    }

    # 计算派生色
    accent_hex = palette["accent"]
    accent_light_hex = palette["accent_light"]
    # 10% 透明度
    replacements["{{accent_10}}"] = f"rgba({int(accent_hex[1:3],16)},{int(accent_hex[3:5],16)},{int(accent_hex[5:7],16)},0.1)"
    # 30% 透明度
    replacements["{{accent_light_30}}"] = f"rgba({int(accent_light_hex[1:3],16)},{int(accent_light_hex[3:5],16)},{int(accent_light_hex[5:7],16)},0.3)"

    # 把整个 layout JSON 转成字符串，做全局替换，再转回
    layout_str = json.dumps(layout, ensure_ascii=False)
    for placeholder, value in replacements.items():
        layout_str = layout_str.replace(placeholder, value)

    result = json.loads(layout_str)
    result["name"] = f"{layout['name']} · {palette['name']}"
    result["description"] = f"{layout['name']}布局 + {palette['name']}配色"

    # 补充 colors 字段（某些地方可能读取）
    result["colors"] = {
        "primary": palette["primary"],
        "accent": palette["accent"],
        "background": palette["background"],
        "blockquote_bg": palette["blockquote_bg"],
        "code_bg": palette["code_bg"],
        "hr_color": palette["hr_color"],
        "footnote_bg": palette["footnote_bg"],
    }

    return result


# ── 工具函数 ────────────────────────────────────────────────────────────
def count_words(text: str) -> int:
    """统计中文文章字数（中文字符 + 英文单词）"""
    clean = re.sub(r"[#*`\[\]()!>|{}_~\-]", "", text)
    clean = re.sub(r"\n+", "\n", clean)
    chinese = len(re.findall(r"[\u4e00-\u9fff]", clean))
    english = len(re.findall(r"[a-zA-Z]+", clean))
    return chinese + english


def extract_title(content: str, filepath: Path) -> str:
    """从内容或文件名提取标题"""
    # 从 frontmatter 提取
    fm = re.match(r"^---\n(.*?)\n---", content, re.DOTALL)
    if fm:
        for line in fm.group(1).split("\n"):
            if line.startswith("title:"):
                return line.split(":", 1)[1].strip().strip('"').strip("'")
    # 从 H1 提取
    h1 = re.search(r"^#\s+(.+)$", content, re.MULTILINE)
    if h1:
        return h1.group(1).strip()
    # 从文件名提取
    name = filepath.stem
    name = re.sub(r"^\d{4}-\d{2}-\d{2}-?", "", name)
    name = re.sub(r"-(公众号|小红书|微博)$", "", name)
    return name or filepath.stem


def strip_frontmatter(content: str) -> str:
    """去掉 YAML frontmatter"""
    return re.sub(r"^---\n.*?\n---\n*", "", content, flags=re.DOTALL)


def fix_cjk_spacing(text: str) -> str:
    """中英文/中数字之间自动加空格（跳过代码块、行内代码、URL、链接）"""
    lines = text.split("\n")
    result = []
    in_code_block = False

    for line in lines:
        stripped = line.strip()
        if stripped.startswith("```"):
            in_code_block = not in_code_block
            result.append(line)
            continue
        if in_code_block:
            result.append(line)
            continue

        # 保护不应修改的片段
        protected = []
        def _protect(m):
            protected.append(m.group(0))
            return f"\x00P{len(protected)-1}\x00"

        line = re.sub(r"`[^`]+`", _protect, line)            # 行内代码
        line = re.sub(r"https?://\S+", _protect, line)       # URL
        line = re.sub(r"!\[[^\]]*\]\([^)]*\)", _protect, line)  # 图片
        line = re.sub(r"\[[^\]]*\]\([^)]*\)", _protect, line)   # 链接

        cjk = r"[\u4e00-\u9fff\u3400-\u4dbf\uf900-\ufaff]"
        latin = r"[a-zA-Z0-9]"
        line = re.sub(f"({cjk})({latin})", r"\1 \2", line)
        line = re.sub(f"({latin})({cjk})", r"\1 \2", line)

        for i, p in enumerate(protected):
            line = line.replace(f"\x00P{i}\x00", p)
        result.append(line)

    return "\n".join(result)


def fix_cjk_bold_punctuation(text: str) -> str:
    """把中文标点移到加粗/斜体标记外面

    **文字，** → **文字**，
    *文字。*  → *文字*。
    """
    cjk_punct = r"[，。！？、；：""''（）【】《》…—]"
    # **text+标点** → **text**+标点
    text = re.sub(rf"\*\*([^*]+?)({cjk_punct}+)\*\*", r"**\1**\2", text)
    # *text+标点* → *text*+标点（不匹配 **）
    text = re.sub(rf"(?<!\*)\*(?!\*)([^*]+?)({cjk_punct}+)\*(?!\*)", r"*\1*\2", text)
    return text


def convert_wikilinks(text: str, vault_root: Path, output_dir: Path) -> str:
    """把 Obsidian ![[image.jpg]] 转为 <img> 标签，复制图片到输出目录"""
    images_dir = output_dir / "images"
    # 搜索路径：vault 目录（如需额外图片目录，在 config.json 的 image_search_paths 中配置）
    search_roots = [vault_root]
    # 支持自定义图片搜索目录
    config_path = SKILL_DIR / "config.json"
    if config_path.exists():
        import json as _json
        try:
            _cfg = _json.load(open(config_path, encoding="utf-8"))
            for p in _cfg.get("image_search_paths", []):
                search_roots.append(Path(p).expanduser())
        except Exception:
            pass

    def replace_img(match):
        filename = match.group(1).strip()
        # 处理带尺寸的 wikilink: ![[image.jpg|300]]
        if "|" in filename:
            filename = filename.split("|")[0].strip()
        # 在多个目录中搜索图片（followlinks=True 跟随符号链接）
        for search_root in search_roots:
            if not search_root.exists():
                continue
            for root, dirs, files in os.walk(search_root, followlinks=False):
                if filename in files:
                    img_path = Path(root) / filename
                    images_dir.mkdir(parents=True, exist_ok=True)
                    dest = images_dir / filename
                    if not dest.exists():
                        shutil.copy2(img_path, dest)
                    # 返回占位标记，后面注入样式时处理
                    return f'<section data-role="img-wrapper"><img src="images/{filename}" alt="{filename}"></section>'
        return f'<span style="color:#999;">[图片: {filename}]</span>'

    return re.sub(r"!\[\[([^\]]+)\]\]", replace_img, text)


def copy_markdown_images(text: str, input_dir: Path, output_dir: Path) -> str:
    """处理标准 Markdown 图片 ![alt](path)，把本地相对路径图片复制到输出目录"""
    images_dir = output_dir / "images"

    def replace_md_img(match):
        alt = match.group(1)
        src = match.group(2).strip()
        # 跳过外链（http/https）
        if src.startswith(("http://", "https://")):
            return match.group(0)
        # 解析相对路径，基于输入文件所在目录
        img_path = (input_dir / src).resolve()
        if img_path.exists():
            images_dir.mkdir(parents=True, exist_ok=True)
            dest = images_dir / img_path.name
            if not dest.exists():
                shutil.copy2(img_path, dest)
            # 统一改为 images/filename 路径
            return f'![{alt}](images/{img_path.name})'
        return match.group(0)

    return re.sub(r"!\[([^\]]*)\]\(([^)]+)\)", replace_md_img, text)


def extract_links_as_footnotes(html: str) -> tuple[str, str]:
    """提取外部链接转为脚注格式

    返回: (处理后的 HTML, 脚注 HTML)
    """
    footnotes = []
    counter = [0]
    ph_sup = FOOTNOTE_PLACEHOLDERS["footnote_sup"]
    ph_section = FOOTNOTE_PLACEHOLDERS["footnote_section"]
    ph_title = FOOTNOTE_PLACEHOLDERS["footnote_title"]
    ph_item = FOOTNOTE_PLACEHOLDERS["footnote_item"]

    def replace_link(match):
        full = match.group(0)
        href = match.group(1)
        text = match.group(2)

        # 跳过锚点链接和非 http 链接
        if not href.startswith("http"):
            return full

        counter[0] += 1
        idx = counter[0]
        footnotes.append((idx, text, href))
        # 正文中加上标注
        return f'{text}<sup style="{ph_sup}">[{idx}]</sup>'

    processed = re.sub(r'<a[^>]*href="([^"]*)"[^>]*>(.*?)</a>', replace_link, html)

    if not footnotes:
        return processed, ""

    # 生成脚注区
    fn_html = f'<section style="{ph_section}">\n'
    fn_html += f'<p style="{ph_title}">参考链接</p>\n'
    for idx, text, href in footnotes:
        fn_html += f'<p style="{ph_item}">[{idx}] {text}: {href}</p>\n'
    fn_html += "</section>"

    return processed, fn_html


def process_callouts(text: str) -> str:
    """处理 Obsidian callout 语法: > [!callout] 内容"""
    lines = text.split("\n")
    result = []
    i = 0
    while i < len(lines):
        # 检查是否是 callout 开始
        callout_match = re.match(r"^>\s*\[!([\w]+)\]\s*(.*)", lines[i])
        if callout_match:
            callout_type = callout_match.group(1)
            title = callout_match.group(2).strip()
            content_lines = []
            i += 1
            # 收集 callout 内容行
            while i < len(lines) and lines[i].startswith(">"):
                content_lines.append(lines[i][1:].strip())
                i += 1
            content = "\n".join(content_lines)
            # 用特殊标记包裹
            if title:
                result.append(f'<div class="callout" data-type="{callout_type}">')
                result.append(f'<p class="callout-title">{title}</p>')
            else:
                result.append(f'<div class="callout" data-type="{callout_type}">')
            result.append(f'<p class="callout-content">{content}</p>')
            result.append("</div>")
        else:
            result.append(lines[i])
            i += 1
    return "\n".join(result)


def process_manual_footnotes(text: str) -> str:
    """处理手写脚注 [^N] 语法

    1. 找出所有 [^N]: 内容 定义行，收集并删除
    2. 把正文中的 [^N] 替换为上标
    3. 在文末追加脚注区 HTML
    """
    ph_sup = FOOTNOTE_PLACEHOLDERS["footnote_sup"]
    ph_section = FOOTNOTE_PLACEHOLDERS["footnote_section"]
    ph_title = FOOTNOTE_PLACEHOLDERS["footnote_title"]
    ph_item = FOOTNOTE_PLACEHOLDERS["footnote_item"]

    # 1. 提取并删除脚注定义行
    footnote_defs = {}
    def collect_def(match):
        idx = match.group(1)
        content = match.group(2).strip()
        footnote_defs[idx] = content
        return ""  # 删除该行

    text = re.sub(r"^\[\^(\d+)\]:\s*(.+)$", collect_def, text, flags=re.MULTILINE)

    if not footnote_defs:
        return text

    # 清理可能残留的空行
    text = re.sub(r"\n{3,}", "\n\n", text)

    # 2. 替换正文中的 [^N] 为上标
    def replace_ref(match):
        idx = match.group(1)
        return f'<sup class="manual-footnote" style="{ph_sup}">[{idx}]</sup>'

    text = re.sub(r"\[\^(\d+)\]", replace_ref, text)

    # 3. 生成脚注区 HTML
    fn_html = f'\n<section style="{ph_section}">\n'
    fn_html += f'<p style="{ph_title}">注释</p>\n'
    for idx in sorted(footnote_defs.keys(), key=int):
        fn_html += f'<p style="{ph_item}">[{idx}] {footnote_defs[idx]}</p>\n'
    fn_html += "</section>\n"

    text = text.rstrip() + "\n" + fn_html

    return text


def process_fenced_containers(text: str) -> str:
    """处理 :::type[title] ... ::: 围栏容器语法（支持嵌套）

    支持的容器：
    - :::dialogue[标题] — 对话气泡
    - :::gallery[标题]  — 横向滚动图片画廊
    - :::longimage[标题] — 长图滚动展示
    - :::stat — 关键数字展示
    - :::timeline[标题] — 时间线
    - :::steps[标题] — 步骤流程
    - :::compare[A vs B] — 对比卡片
    - :::quote[人名] — 人物引言
    - :::eyebrow[小标签] — 小标签（强调色小字，拉开字距）
    - :::summary[标题] — 要点总结卡
    - :::cta[标题] — 行动引导卡
    - :::cards[标题] — 卡片组（内部用 ### 小标题分卡）
    """
    container_re = re.compile(
        r"^:::(dialogue|gallery|longimage|stat|timeline|steps|compare|quote"
        r"|eyebrow|summary|cta|cards)"
        r"(?:\[([^\]]*)\])?\s*$"
    )

    lines = text.split("\n")
    result = []
    i = 0
    while i < len(lines):
        container_match = container_re.match(lines[i])
        if container_match:
            container_type = container_match.group(1)
            container_title = (container_match.group(2) or "").strip()
            start = i
            content_lines = []
            i += 1
            # 收集容器内容直到遇到匹配的 :::（支持嵌套计数）
            depth = 1
            while i < len(lines) and depth > 0:
                if container_re.match(lines[i]):
                    depth += 1
                    content_lines.append(lines[i])
                elif lines[i].strip() == ":::":
                    depth -= 1
                    if depth > 0:
                        content_lines.append(lines[i])
                else:
                    content_lines.append(lines[i])
                i += 1

            if depth > 0:
                # 少了收尾 ::: —— 容器不成立，整段当普通文本原样输出。
                # 绝不把后面的正文当成容器内容吞掉（会静默丢正文）。
                result.extend(lines[start:i])
                continue

            # 递归处理内部容器
            inner_text = "\n".join(content_lines)
            inner_text = process_fenced_containers(inner_text)
            inner_lines = inner_text.split("\n")

            if container_type == "dialogue":
                result.append(_build_dialogue_html(container_title, inner_lines))
            elif container_type == "gallery":
                # 先转 markdown 再包裹
                inner_html = md_to_html(inner_text)
                result.append(
                    f'<section data-container="gallery">'
                    f'<p data-container="gallery-title">{container_title}</p>'
                    f'<section data-container="gallery-scroll">'
                    f'{inner_html}'
                    f'</section></section>'
                )
            elif container_type == "longimage":
                inner_html = md_to_html(inner_text)
                result.append(
                    f'<section data-container="longimage">'
                    f'<p data-container="longimage-title">{container_title}</p>'
                    f'<section data-container="longimage-scroll">'
                    f'{inner_html}'
                    f'</section></section>'
                )
            elif container_type == "stat":
                result.append(_build_stat_html(inner_lines))
            elif container_type == "timeline":
                result.append(_build_timeline_html(container_title, inner_lines))
            elif container_type == "steps":
                result.append(_build_steps_html(container_title, inner_lines))
            elif container_type == "compare":
                result.append(_build_compare_html(container_title, inner_lines))
            elif container_type == "quote":
                result.append(_build_quote_html(container_title, inner_lines))
            elif container_type == "eyebrow":
                result.append(_build_eyebrow_html(container_title or inner_text.strip()))
            elif container_type == "summary":
                result.append(_build_note_card_html("summary", container_title, inner_lines))
            elif container_type == "cta":
                result.append(_build_note_card_html("cta", container_title, inner_lines))
            elif container_type == "cards":
                result.append(_build_cards_html(container_title, inner_lines))
        else:
            result.append(lines[i])
            i += 1
    return "\n".join(result)


def _build_stat_html(lines: list[str]) -> str:
    """构建关键数字容器 HTML"""
    non_empty = [l.strip() for l in lines if l.strip()]
    number = non_empty[0] if len(non_empty) > 0 else ""
    label = non_empty[1] if len(non_empty) > 1 else ""
    return (
        f'<section data-container="stat">'
        f'<p data-container="stat-number">{number}</p>'
        f'<p data-container="stat-label">{label}</p>'
        f'</section>'
    )


def _build_timeline_html(title: str, lines: list[str]) -> str:
    """构建时间线容器 HTML"""
    html = '<section data-container="timeline">'
    if title:
        html += f'<p data-container="timeline-title">{title}</p>'
    for line in lines:
        line = line.strip()
        if not line:
            continue
        # 匹配 时间: 内容 或 时间：内容
        m = re.match(r"^(.+?)\s*[：:]\s*(.+)$", line)
        if m:
            time_text = m.group(1).strip()
            content = m.group(2).strip()
            html += (
                f'<section data-container="timeline-item">'
                f'<span data-container="timeline-time">{time_text}</span>'
                f'<span data-container="timeline-dot">\u25cf</span>'
                f'<span data-container="timeline-content">{content}</span>'
                f'</section>'
            )
    html += '</section>'
    return html


def _build_steps_html(title: str, lines: list[str]) -> str:
    """构建步骤流程容器 HTML"""
    html = '<section data-container="steps">'
    if title:
        html += f'<p data-container="steps-title">{title}</p>'
    step_num = 0
    for line in lines:
        line = line.strip()
        if not line:
            continue
        step_num += 1
        html += (
            f'<section data-container="steps-item">'
            f'<span data-container="steps-number">{step_num}</span>'
            f'<span data-container="steps-content">{line}</span>'
            f'</section>'
        )
    html += '</section>'
    return html


def _build_compare_html(title: str, lines: list[str]) -> str:
    """构建对比卡片容器 HTML

    标题格式: A vs B，提取 A 和 B 作为两列表头
    每行格式: 左内容 | 右内容
    """
    # 从标题中提取两列名
    left_name = ""
    right_name = ""
    if " vs " in title:
        parts = title.split(" vs ", 1)
        left_name = parts[0].strip()
        right_name = parts[1].strip()
    elif " VS " in title:
        parts = title.split(" VS ", 1)
        left_name = parts[0].strip()
        right_name = parts[1].strip()

    html = '<section data-container="compare">'
    # 表头
    if left_name or right_name:
        html += (
            f'<section data-container="compare-header">'
            f'<span data-container="compare-header-left">{left_name}</span>'
            f'<span data-container="compare-header-right">{right_name}</span>'
            f'</section>'
        )
    # 内容行
    for line in lines:
        line = line.strip()
        if not line:
            continue
        if "|" in line:
            parts = line.split("|", 1)
            left = parts[0].strip()
            right = parts[1].strip()
        else:
            left = line
            right = ""
        html += (
            f'<section data-container="compare-row">'
            f'<span data-container="compare-left">{left}</span>'
            f'<span data-container="compare-right">{right}</span>'
            f'</section>'
        )
    html += '</section>'
    return html


def _build_quote_html(author: str, lines: list[str]) -> str:
    """构建人物引言容器 HTML"""
    # 用 <br> 连接多行内容
    content_html = "<br>".join(l.strip() for l in lines if l.strip())
    return (
        f'<section data-container="quote-card">'
        f'<p data-container="quote-mark">\u275d</p>'
        f'<p data-container="quote-text">{content_html}</p>'
        f'<p data-container="quote-author">\u2014 {author}</p>'
        f'</section>'
    )


def _build_dialogue_html(title: str, lines: list[str]) -> str:
    """将对话行解析为结构化 HTML

    每行格式: 说话人: 内容 或 说话人：内容（中英文冒号都支持）
    """
    bubbles = []
    speakers_seen = []  # 记录出现顺序，用于左右判断

    for line in lines:
        line = line.strip()
        if not line:
            continue
        # 匹配 说话人: 内容 或 说话人：内容
        m = re.match(r"^(.+?)\s*[：:]\s*(.+)$", line)
        if m:
            speaker = m.group(1).strip()
            text = m.group(2).strip()
            if speaker not in speakers_seen:
                speakers_seen.append(speaker)
            # 根据说话人在列表中的索引决定左右（偶数索引=左，奇数索引=右）
            side = "left" if speakers_seen.index(speaker) % 2 == 0 else "right"
            bubbles.append(
                f'<section data-container="dialogue-bubble" data-side="{side}">'
                f'<p data-container="dialogue-speaker">{speaker}</p>'
                f'<p data-container="dialogue-text">{text}</p>'
                f'</section>'
            )

    return (
        f'<section data-container="dialogue">'
        f'<p data-container="dialogue-title">{title}</p>'
        f'{"".join(bubbles)}'
        f'</section>'
    )


def _build_eyebrow_html(text: str) -> str:
    """小标签（eyebrow）：强调色小字，用于给下方区块起一个短标签"""
    return (
        f'<section data-container="eyebrow">'
        f'<p data-container="eyebrow-text">{text}</p>'
        f'</section>'
    )


def _build_note_card_html(kind: str, title: str, lines: list[str]) -> str:
    """要点卡（summary）/ 行动引导卡（cta）：标题 + 一段正文"""
    body = "<br>".join(l.strip() for l in lines if l.strip())
    html = f'<section data-container="{kind}">'
    if title:
        html += f'<p data-container="{kind}-title">{title}</p>'
    html += f'<p data-container="{kind}-body">{body}</p></section>'
    return html


def _build_cards_html(title: str, lines: list[str]) -> str:
    """卡片组：内部用 ### 小标题分卡，小标题到下一个 ### 之间为卡片正文"""
    cards = []
    cur_title, body = None, []
    for line in lines:
        m = re.match(r"^\s*#{3,6}\s+(.*)$", line)
        if m:
            if cur_title is not None:
                cards.append((cur_title, " ".join(x.strip() for x in body if x.strip())))
            cur_title, body = m.group(1).strip(), []
        else:
            body.append(line)
    if cur_title is not None:
        cards.append((cur_title, " ".join(x.strip() for x in body if x.strip())))

    html = '<section data-container="cards">'
    if title:
        html += f'<p data-container="cards-title">{title}</p>'
    for card_title, card_body in cards:
        html += (
            f'<section data-container="cards-item">'
            f'<p data-container="cards-item-title">{card_title}</p>'
            f'<p data-container="cards-item-body">{card_body}</p>'
            f'</section>'
        )
    html += '</section>'
    return html


def md_to_html(content: str) -> str:
    """Markdown 转 HTML"""
    html = markdown.markdown(
        content,
        extensions=["tables", "fenced_code", "nl2br"],
    )
    return html


# ── 核心：内联样式注入 ──────────────────────────────────────────────────
def build_style_string(props: dict) -> str:
    """把主题 JSON 的属性字典转成 CSS style 字符串

    JSON key 下划线 → CSS 连字符: font_size → font-size
    """
    parts = []
    for key, val in props.items():
        css_key = key.replace("_", "-")
        parts.append(f"{css_key}:{val}")
    return ";".join(parts)


def _auto_dark_mode(theme: dict) -> dict:
    """自动补全深色模式配置

    对于主题 dark_mode 中未声明的常见标签，根据其亮色样式自动生成深色模式颜色。
    """
    dark_mode = dict(theme.get("dark_mode", {}))
    styles = theme.get("styles", {})

    # 需要自动补全的标签及其深色模式默认色
    auto_tags = {
        "p":              {"color": "#c8c8c8"},
        "strong":         {"color": "#e0a060"},  # 保持强调感
        "em":             {"color": "#a0a0a0"},
        "h3":             {"color": "#d0d0d0"},
        "h4":             {"color": "#c8c8c8"},
        "h5":             {"color": "#b0b0b0"},
        "h6":             {"color": "#999999"},
        "td":             {"color": "#c0c0c0", "bgcolor": "#1e1e1e"},
        "list_item_text": {"color": "#c8c8c8"},
        "footnote_item":  {"color": "#888888"},
        "footnote_title": {"color": "#888888"},
        "callout_content": {"color": "#c0c0c0"},
    }

    for tag, defaults in auto_tags.items():
        if tag in dark_mode:
            continue  # 主题已显式声明，不覆盖
        if tag not in styles:
            continue  # 主题不使用此标签
        # 检查亮色模式的颜色，只在有明确浅色系颜色时才添加深色覆盖
        tag_styles = styles[tag]
        has_color = any(k in tag_styles for k in ("color", "background", "background_color"))
        if has_color:
            dark_mode[tag] = defaults

    return dark_mode


def inject_dark_mode_attrs(html: str, dark_mode: dict, style_map: dict) -> str:
    """为微信深色模式添加 data-darkmode-* 属性

    通过匹配元素的 style 字符串来定位目标元素，
    然后添加对应的深色模式颜色覆盖。
    """
    for tag_key, dark_cfg in dark_mode.items():
        if tag_key not in style_map:
            continue
        style_str = style_map[tag_key]
        if not style_str:
            continue
        attrs = []
        if "bgcolor" in dark_cfg:
            attrs.append(f'data-darkmode-bgcolor="{dark_cfg["bgcolor"]}"')
        if "color" in dark_cfg:
            attrs.append(f'data-darkmode-color="{dark_cfg["color"]}"')
        if not attrs:
            continue
        dark_attr_str = " ".join(attrs)
        html = html.replace(
            f'style="{style_str}"',
            f'style="{style_str}" {dark_attr_str}',
        )
    return html


# ── 语法高亮调色板（深底 / 亮底各一套）──────────────────────────────────
# 同一套颜色在另一种底色上会低对比（实测亮底 #569CD6 关键字对比度仅约 2.2:1，发灰读不清），
# 故按主题 pre 的背景明暗切换。亮底取自 VS Code Light+ 系。
_SYNTAX_DARK = {
    "decorator": "#c586c0", "comment": "#6a9955", "string": "#ce9178",
    "number": "#b5cea8", "keyword": "#569cd6", "builtin": "#4ec9b0",
}
_SYNTAX_LIGHT = {
    "decorator": "#8250df", "comment": "#008000", "string": "#a31515",
    "number": "#098658", "keyword": "#0550ae", "builtin": "#267f99",
}


def _is_light_bg(bg: str) -> bool:
    """判断 CSS 背景色是否为亮色，用于挑语法高亮调色板。

    支持 #RGB / #RRGGBB / rgb() / rgba()；解析不了按深色处理（沿用历史行为，不改变未知主题外观）。
    """
    if not bg:
        return False
    bg = bg.strip()
    try:
        if bg.startswith("#"):
            h = bg[1:]
            if len(h) == 3:
                h = "".join(ch * 2 for ch in h)
            r, g, b = int(h[0:2], 16), int(h[2:4], 16), int(h[4:6], 16)
        else:
            m = re.match(r"rgba?\(\s*([\d.]+)[,\s]+([\d.]+)[,\s]+([\d.]+)", bg)
            if not m:
                return False
            r, g, b = float(m.group(1)), float(m.group(2)), float(m.group(3))
    except (ValueError, IndexError):
        return False
    return (0.299 * r + 0.587 * g + 0.114 * b) / 255 > 0.6


def _basic_syntax_highlight(code_html: str, light: bool = False) -> str:
    """增强语法高亮：注释、字符串、关键字、数字、装饰器、类型

    ⚠️ 各步是**串行正则**，后一步会看到前一步插入的 `<span style="color:#xxx">`。
    若不隔离，字符串规则会命中**前一步自己的 style 属性值**（如 f-string 先高亮出
    `style="color:#ce9178"`，字符串规则再把这个属性值当字符串包一层），把标签拆成
    肉眼可见的碎片，如 `<span style="color:#ce9178">"color:#ce9178"</span>`。
    故每步产出的片段都存在占位符后面，最后统一还原。

    light=True 时改用亮底调色板（主题 pre 背景为亮色时）。
    """
    palette = _SYNTAX_LIGHT if light else _SYNTAX_DARK
    pending = []

    def _keep(fragment: str) -> str:
        pending.append(fragment)
        return f"\x00H{len(pending) - 1}\x00"

    def _hl(m, color, tail_group=None):
        """把匹配内容包成高亮 span 并藏进占位符；tail_group 用于注释行尾的 <br>"""
        tail = m.group(tail_group) if tail_group else ""
        return _keep(f'<span style="color:{color}">{m.group(1)}</span>') + tail

    # 装饰器 @xxx
    code_html = re.sub(
        r'(@\w+)',
        lambda m: _hl(m, palette["decorator"]),
        code_html
    )
    # 单行注释 // ... 和 # ...（排除 URL 中的 ://）
    code_html = re.sub(
        r'(?<!:)(//.*?)(<br>|$)',
        lambda m: _hl(m, palette["comment"], tail_group=2),
        code_html
    )
    code_html = re.sub(
        r'(#[^{].*?)(<br>|$)',
        lambda m: _hl(m, palette["comment"], tail_group=2),
        code_html
    )
    # f-string: f"..." / f'...'（Python）
    code_html = re.sub(
        r'(f&quot;.*?&quot;|f&#x27;.*?&#x27;|f"[^"<]*?"|f\'[^\'<]*?\')',
        lambda m: _hl(m, palette["string"]),
        code_html
    )
    # 模板字符串 `...`（JS）
    code_html = re.sub(
        r'(`[^`<]*?`)',
        lambda m: _hl(m, palette["string"]),
        code_html
    )
    # 字符串（双引号和单引号，HTML 转义形式）
    code_html = re.sub(
        r'(&quot;.*?&quot;|&#x27;.*?&#x27;|"[^"<]*?"|\'[^\'<]*?\')',
        lambda m: _hl(m, palette["string"]),
        code_html
    )
    # 数字（整数和浮点数）
    code_html = re.sub(
        r'(?<![a-zA-Z0-9_])(\d+\.?\d*)',
        lambda m: _hl(m, palette["number"]),
        code_html
    )
    # 常见关键字
    keywords = [
        'function', 'const', 'let', 'var', 'return', 'if', 'else', 'for', 'while',
        'import', 'from', 'export', 'class', 'def', 'print', 'async', 'await',
        'try', 'catch', 'throw', 'new', 'this', 'true', 'false', 'null', 'None',
        'True', 'False', 'elif', 'except', 'finally', 'with', 'as', 'in', 'not',
        'and', 'or', 'is', 'lambda', 'yield', 'pass', 'break', 'continue',
        'do', 'switch', 'case', 'default', 'typeof', 'instanceof', 'void',
        'struct', 'enum', 'impl', 'trait', 'pub', 'fn', 'mut', 'self', 'Self',
        'type', 'interface', 'extends', 'implements', 'abstract', 'static',
        'raise', 'del', 'global', 'nonlocal', 'assert',
    ]
    for kw in keywords:
        code_html = re.sub(
            rf'(?<![a-zA-Z0-9_])({kw})(?![a-zA-Z0-9_])',
            lambda m: _hl(m, palette["keyword"]),
            code_html
        )
    # 内置类型/函数
    builtins = [
        'int', 'str', 'float', 'bool', 'list', 'dict', 'set', 'tuple',
        'len', 'range', 'enumerate', 'zip', 'map', 'filter', 'sorted',
        'String', 'Number', 'Boolean', 'Array', 'Object', 'Promise',
        'console', 'document', 'window', 'Math', 'JSON', 'Date',
    ]
    for bt in builtins:
        code_html = re.sub(
            rf'(?<![a-zA-Z0-9_])({bt})(?![a-zA-Z0-9_])',
            lambda m: _hl(m, palette["builtin"]),
            code_html
        )

    for i, fragment in enumerate(pending):
        code_html = code_html.replace(f"\x00H{i}\x00", fragment)
    return code_html


def _hex_to_rgb(hex_color: str) -> tuple[int, int, int]:
    """将 #RRGGBB 转为 (r, g, b) 元组"""
    h = hex_color.lstrip("#")
    return int(h[0:2], 16), int(h[2:4], 16), int(h[4:6], 16)


def _mix_hex(a: str, b: str, t: float) -> str:
    """线性混色：t=0 取 a，t=1 取 b。用于按主题强调色派生色带底色"""
    ar, ag, ab = _hex_to_rgb(a)
    br, bg, bb = _hex_to_rgb(b)
    return "#%02X%02X%02X" % (
        round(ar + (br - ar) * t),
        round(ag + (bg - ag) * t),
        round(ab + (bb - ab) * t),
    )


def _color_distance(a: str, b: str) -> int:
    """两色通道差绝对值之和，用于判断色带是否能被看出来（越小越看不出）"""
    try:
        return sum(abs(x - y) for x, y in zip(_hex_to_rgb(a), _hex_to_rgb(b)))
    except (ValueError, IndexError):
        return 999


def _inject_container_styles(html: str, theme: dict) -> str:
    """为围栏容器注入内联样式

    取色：一律从 theme.colors 派生（accent / blockquote_bg / primary / background），
    使 92 套主题下容器跟随各自色系，而不是全部长成同一套灰白。
    布局尺寸仍为内置常量，主题只影响颜色。
    """
    colors = theme.get("colors", {})
    accent_hex = colors.get("accent", "#07C160")
    r, g, b = _hex_to_rgb(accent_hex)
    right_bubble_bg = f"rgba({r},{g},{b},0.08)"
    # 容器表面色 / 文字色 / 弱化文字色 / 描边色 / 页面底色
    surface_tint = f"rgba({r},{g},{b},0.04)"
    text_color = colors.get("primary", "#333333")
    muted_color = colors.get("hr_color") or accent_hex
    border_color = f"rgba({r},{g},{b},0.16)"
    page_bg = colors.get("background", "#ffffff")

    # ── dialogue 容器 ──
    dialogue_container = f"margin:20px 0;padding:16px;background:{surface_tint};border-radius:12px"
    dialogue_title = f"text-align:center;font-size:14px;color:{muted_color};margin-bottom:12px"
    dialogue_speaker = f"font-size:12px;color:{muted_color};margin-bottom:4px"
    dialogue_text = f"font-size:15px;color:{text_color};line-height:1.6;margin:0"
    left_bubble = f"max-width:80%;background:{page_bg};border-radius:0 12px 12px 12px;padding:10px 14px;margin:8px 20% 8px 0;box-shadow:0 1px 2px rgba(0,0,0,0.05)"
    right_bubble = f"max-width:80%;background:{right_bubble_bg};border-radius:12px 0 12px 12px;padding:10px 14px;margin:8px 0 8px 20%;box-shadow:0 1px 2px rgba(0,0,0,0.05)"

    html = html.replace(
        '<section data-container="dialogue">',
        f'<section data-container="dialogue" style="{dialogue_container}">'
    )
    html = html.replace(
        '<p data-container="dialogue-title">',
        f'<p data-container="dialogue-title" style="{dialogue_title}">'
    )
    html = re.sub(
        r'<section data-container="dialogue-bubble" data-side="left">',
        f'<section data-container="dialogue-bubble" data-side="left" style="{left_bubble}">',
        html,
    )
    html = re.sub(
        r'<section data-container="dialogue-bubble" data-side="right">',
        f'<section data-container="dialogue-bubble" data-side="right" style="{right_bubble}">',
        html,
    )
    html = html.replace(
        '<p data-container="dialogue-speaker">',
        f'<p data-container="dialogue-speaker" style="{dialogue_speaker}">'
    )
    html = html.replace(
        '<p data-container="dialogue-text">',
        f'<p data-container="dialogue-text" style="{dialogue_text}">'
    )

    # ── gallery 容器 ──
    gallery_container = "margin:20px 0"
    gallery_title = f"text-align:center;font-size:14px;color:{muted_color};margin-bottom:12px"
    gallery_scroll = "display:flex;overflow-x:auto;gap:8px;padding:4px 0;-webkit-overflow-scrolling:touch"
    gallery_img = "height:200px;width:auto;border-radius:8px;flex-shrink:0"

    html = html.replace(
        '<section data-container="gallery">',
        f'<section data-container="gallery" style="{gallery_container}">'
    )
    html = html.replace(
        '<p data-container="gallery-title">',
        f'<p data-container="gallery-title" style="{gallery_title}">'
    )
    html = html.replace(
        '<section data-container="gallery-scroll">',
        f'<section data-container="gallery-scroll" style="{gallery_scroll}">'
    )
    # gallery 内部图片需要特殊样式（覆盖默认 img 样式）
    html = re.sub(
        r'(<section data-container="gallery-scroll"[^>]*>)(.*?)(</section>)',
        lambda m: m.group(1) + re.sub(
            r'<img ',
            f'<img style="{gallery_img}" ',
            m.group(2)
        ) + m.group(3),
        html,
        flags=re.DOTALL,
    )

    # ── longimage 容器 ──
    longimage_container = "margin:20px 0"
    longimage_title = f"text-align:center;font-size:14px;color:{muted_color};margin-bottom:12px"
    longimage_scroll = f"max-height:400px;overflow-y:auto;border-radius:8px;border:1px solid {border_color}"
    longimage_img = "width:100%;display:block"

    html = html.replace(
        '<section data-container="longimage">',
        f'<section data-container="longimage" style="{longimage_container}">'
    )
    html = html.replace(
        '<p data-container="longimage-title">',
        f'<p data-container="longimage-title" style="{longimage_title}">'
    )
    html = html.replace(
        '<section data-container="longimage-scroll">',
        f'<section data-container="longimage-scroll" style="{longimage_scroll}">'
    )
    # longimage 内部图片样式
    html = re.sub(
        r'(<section data-container="longimage-scroll"[^>]*>)(.*?)(</section>)',
        lambda m: m.group(1) + re.sub(
            r'<img ',
            f'<img style="{longimage_img}" ',
            m.group(2)
        ) + m.group(3),
        html,
        flags=re.DOTALL,
    )

    # ── stat 容器（关键数字）──
    accent_04 = f"rgba({r},{g},{b},0.04)"
    stat_container = f"text-align:center;padding:24px 16px;margin:20px 0;background:{accent_04};border-radius:12px"
    stat_number = f"font-size:48px;font-weight:800;color:{accent_hex};line-height:1.2;margin:0 0 4px 0"
    stat_label = f"font-size:14px;color:{muted_color};margin:0"

    html = html.replace(
        '<section data-container="stat">',
        f'<section data-container="stat" style="{stat_container}">'
    )
    html = html.replace(
        '<p data-container="stat-number">',
        f'<p data-container="stat-number" style="{stat_number}">'
    )
    html = html.replace(
        '<p data-container="stat-label">',
        f'<p data-container="stat-label" style="{stat_label}">'
    )

    # ── timeline 容器（时间线）──
    accent_20 = f"rgba({r},{g},{b},0.2)"
    timeline_container = "margin:20px 0;padding:16px"
    timeline_title = f"text-align:center;font-size:14px;color:{muted_color};margin-bottom:16px"
    timeline_item = "display:flex;margin-bottom:12px"
    timeline_time = f"min-width:80px;font-size:14px;font-weight:700;color:{accent_hex};text-align:right;padding-right:16px"
    timeline_dot = f"color:{accent_hex};font-size:12px;flex-shrink:0;margin-top:2px;line-height:1"
    timeline_content = f"font-size:15px;color:{text_color};line-height:1.6;padding-bottom:16px;border-left:2px solid {accent_20};padding-left:12px;margin-left:5px"

    html = html.replace(
        '<section data-container="timeline">',
        f'<section data-container="timeline" style="{timeline_container}">'
    )
    html = html.replace(
        '<p data-container="timeline-title">',
        f'<p data-container="timeline-title" style="{timeline_title}">'
    )
    html = html.replace(
        '<section data-container="timeline-item">',
        f'<section data-container="timeline-item" style="{timeline_item}">'
    )
    html = html.replace(
        '<span data-container="timeline-time">',
        f'<span data-container="timeline-time" style="{timeline_time}">'
    )
    html = html.replace(
        '<span data-container="timeline-dot">',
        f'<span data-container="timeline-dot" style="{timeline_dot}">'
    )
    html = html.replace(
        '<span data-container="timeline-content">',
        f'<span data-container="timeline-content" style="{timeline_content}">'
    )

    # ── steps 容器（步骤流程）──
    steps_container = "margin:20px 0;padding:16px"
    steps_title = f"text-align:center;font-size:14px;color:{muted_color};margin-bottom:16px"
    steps_item = "display:flex;align-items:flex-start;margin-bottom:12px"
    steps_number = f"display:inline-flex;width:28px;height:28px;border-radius:50%;background:{accent_hex};color:#fff;font-size:14px;font-weight:700;align-items:center;justify-content:center;flex-shrink:0;margin-right:12px;line-height:1"
    steps_content = f"font-size:15px;color:{text_color};line-height:1.6;padding-top:3px"

    html = html.replace(
        '<section data-container="steps">',
        f'<section data-container="steps" style="{steps_container}">'
    )
    html = html.replace(
        '<p data-container="steps-title">',
        f'<p data-container="steps-title" style="{steps_title}">'
    )
    html = html.replace(
        '<section data-container="steps-item">',
        f'<section data-container="steps-item" style="{steps_item}">'
    )
    html = html.replace(
        '<span data-container="steps-number">',
        f'<span data-container="steps-number" style="{steps_number}">'
    )
    html = html.replace(
        '<span data-container="steps-content">',
        f'<span data-container="steps-content" style="{steps_content}">'
    )

    # ── compare 容器（对比卡片）──
    compare_container = "margin:20px 0;padding:16px"
    compare_header = "display:flex;margin-bottom:8px"
    compare_header_cell = f"flex:1;text-align:center;font-weight:700;color:{accent_hex};padding:8px"
    compare_row = f"display:flex;border-top:1px solid {border_color};padding:8px 0"
    compare_left = f"flex:1;text-align:center;font-size:14px;color:{muted_color};padding:8px"
    compare_right = f"flex:1;text-align:center;font-size:14px;color:{text_color};padding:8px;font-weight:600"

    html = html.replace(
        '<section data-container="compare">',
        f'<section data-container="compare" style="{compare_container}">'
    )
    html = html.replace(
        '<section data-container="compare-header">',
        f'<section data-container="compare-header" style="{compare_header}">'
    )
    html = html.replace(
        '<span data-container="compare-header-left">',
        f'<span data-container="compare-header-left" style="{compare_header_cell}">'
    )
    html = html.replace(
        '<span data-container="compare-header-right">',
        f'<span data-container="compare-header-right" style="{compare_header_cell}">'
    )
    html = html.replace(
        '<section data-container="compare-row">',
        f'<section data-container="compare-row" style="{compare_row}">'
    )
    html = html.replace(
        '<span data-container="compare-left">',
        f'<span data-container="compare-left" style="{compare_left}">'
    )
    html = html.replace(
        '<span data-container="compare-right">',
        f'<span data-container="compare-right" style="{compare_right}">'
    )

    # ── quote-card 容器（人物引言）──
    accent_03 = f"rgba({r},{g},{b},0.03)"
    accent_15 = f"rgba({r},{g},{b},0.15)"
    quote_container = f"margin:24px 0;padding:20px 24px;background:{accent_03};border-radius:12px;border-left:3px solid {accent_hex}"
    quote_mark = f"font-size:36px;color:{accent_15};margin:0;line-height:1"
    quote_text = f"font-size:17px;color:{text_color};line-height:1.8;margin:8px 0 12px;font-style:italic"
    quote_author = f"font-size:13px;color:{muted_color};text-align:right;margin:0"

    html = html.replace(
        '<section data-container="quote-card">',
        f'<section data-container="quote-card" style="{quote_container}">'
    )
    html = html.replace(
        '<p data-container="quote-mark">',
        f'<p data-container="quote-mark" style="{quote_mark}">'
    )
    html = html.replace(
        '<p data-container="quote-text">',
        f'<p data-container="quote-text" style="{quote_text}">'
    )
    html = html.replace(
        '<p data-container="quote-author">',
        f'<p data-container="quote-author" style="{quote_author}">'
    )

    # ── eyebrow 小标签 ──
    eyebrow_container = "margin:18px 0 6px"
    eyebrow_text = f"font-size:12px;font-weight:700;letter-spacing:2px;color:{accent_hex};margin:0"

    html = html.replace(
        '<section data-container="eyebrow">',
        f'<section data-container="eyebrow" style="{eyebrow_container}">'
    )
    html = html.replace(
        '<p data-container="eyebrow-text">',
        f'<p data-container="eyebrow-text" style="{eyebrow_text}">'
    )

    # ── summary 要点卡 / cta 行动引导卡 ──
    accent_06 = f"rgba({r},{g},{b},0.06)"
    note_cards = {
        "summary": (
            f"margin:24px 0;padding:20px;background:{accent_06};"
            f"border-left:3px solid {accent_hex};border-radius:0 10px 10px 0",
            f"font-size:15px;font-weight:700;color:{accent_hex};margin:0 0 10px",
            f"font-size:16px;color:{text_color};line-height:1.9;margin:0",
        ),
        "cta": (
            f"margin:28px 0;padding:26px 22px;background:{accent_hex};"
            f"border-radius:12px;text-align:center",
            "font-size:16px;font-weight:700;color:#ffffff;margin:0 0 10px",
            "font-size:15px;color:rgba(255,255,255,0.9);line-height:1.8;margin:0",
        ),
    }
    for kind, (box_s, title_s, body_s) in note_cards.items():
        html = html.replace(
            f'<section data-container="{kind}">',
            f'<section data-container="{kind}" style="{box_s}">'
        )
        html = html.replace(
            f'<p data-container="{kind}-title">',
            f'<p data-container="{kind}-title" style="{title_s}">'
        )
        html = html.replace(
            f'<p data-container="{kind}-body">',
            f'<p data-container="{kind}-body" style="{body_s}">'
        )

    # ── cards 卡片组（窄屏自动折行）──
    cards_container = "display:flex;flex-wrap:wrap;gap:10px;margin:20px 0"
    cards_title = (
        f"width:100%;font-size:12px;font-weight:700;letter-spacing:2px;"
        f"color:{accent_hex};margin:0"
    )
    cards_item = (
        f"flex:1 1 30%;min-width:0;padding:14px;background:{surface_tint};"
        f"border:1px solid {border_color};border-radius:10px"
    )
    cards_item_title = f"font-size:15px;font-weight:700;color:{accent_hex};margin:0 0 6px"
    cards_item_body = f"font-size:13px;color:{text_color};line-height:1.7;margin:0"

    for key, s in (
        ("cards", cards_container),
        ("cards-title", cards_title),
        ("cards-item", cards_item),
        ("cards-item-title", cards_item_title),
        ("cards-item-body", cards_item_body),
    ):
        html = html.replace(
            f'<section data-container="{key}">',
            f'<section data-container="{key}" style="{s}">'
        ).replace(
            f'<p data-container="{key}">',
            f'<p data-container="{key}" style="{s}">'
        )

    return html


def _wrap_card_sections(html: str, card_cfg: dict) -> str:
    """把 HTML 按 h1/h2 切分成卡片 section。card_cfg 来自主题 JSON 的 'card' 字段。"""
    card_style = (
        f'max-width:800px;width:100%;padding:25px;box-sizing:border-box;'
        f'background-color:{card_cfg["card_bg"]};'
        f'background-image:{card_cfg["card_texture"]};'
        f'background-size:{card_cfg["card_texture_size"]};'
        f'border:{card_cfg["card_border"]};'
        f'box-shadow:{card_cfg["card_shadow"]};'
        f'border-radius:{card_cfg["card_radius"]}'
    )

    # 用 h1 和 h2 作为分割点（保留 h 标签在新段的开头）
    parts = re.split(r'(?=<h[12]\s)', html)
    if not parts:
        return html

    cards = []
    for part in parts:
        part = part.strip()
        if not part:
            continue
        cards.append(f'<section style="{card_style}">{part}</section>')

    return ''.join(cards)


# ── hero 布局（深色首屏 / 大序号 / 交替色带 / 引文穿插 / 卡片组）────────────
# 10 套 su-dusk-* 的描述统一为「深色首屏+大序号+交替色带+引文穿插」但未写布尔开关，
# 4 套特化主题（su-ribbon / su-countdown / su-deepwater / su-countdown 系）写了显式开关。
# 故：缺省值取「描述所声明的」，显式开关优先。
HERO_DEFAULTS = {
    "dark_header": True,
    "dark_footer": False,
    "numbered": True,
    "pull_quotes": True,
    "alt_bg_enabled": True,
    "cards": False,
}

# 深色区块内的文字色（dark_bg 上的通用可读色）
_DARK_TEXT = "#ffffff"
_DARK_TEXT_SOFT = "rgba(255,255,255,0.82)"


def _hero_flag(hero: dict, key: str) -> bool:
    """读取 hero 开关：显式值优先，未声明时用描述所对应的缺省值"""
    val = hero.get(key)
    return HERO_DEFAULTS[key] if val is None else bool(val)


def _recolor_block(block: str, color: str) -> str:
    """把块内标题/正文的文字色统一改成 color（用于深色首屏、深色尾屏）"""
    def repl(m):
        tag, attrs = m.group(1), m.group(2)
        if "style=" not in attrs:
            return m.group(0)
        if re.search(r'color:[^;"]+', attrs):
            attrs = re.sub(r'color:[^;"]+', f"color:{color}", attrs)
        else:
            attrs = re.sub(r'(style=")([^"]*)(")', rf'\1\2;color:{color}\3', attrs, count=1)
        return f"<{tag}{attrs}>"
    return re.sub(r"<(h[1-6]|p|strong|em|span)([^>]*)>", repl, block)


def _heading_style_parts(attrs: str) -> tuple[str, str, str]:
    """从 h2 的 style 属性里取出字号/字重/颜色，供重排后沿用"""
    def pick(key, default):
        m = re.search(rf'{key}:([^;"]+)', attrs)
        return m.group(1) if m else default
    return pick("font-size", "20px"), pick("font-weight", "700"), pick("color", "#1a1a1a")


def _rewrite_h2_as_row(block: str, badge: str, badge_style: str) -> str:
    """把区块开头的 <h2> 改写成「徽标 + 标题」的 flex 行（大序号 / 时间线节点共用）"""
    m = re.match(r'\s*<h2([^>]*)>(.*?)</h2>', block, re.DOTALL)
    if not m:
        return block
    font_size, font_weight, color = _heading_style_parts(m.group(1))
    row = (
        f'<section style="display:flex;align-items:baseline;margin-bottom:16px">'
        f'<span style="{badge_style}">{badge}</span>'
        f'<span style="font-size:{font_size};font-weight:{font_weight};'
        f'color:{color};line-height:1.3">{m.group(2)}</span>'
        f'</section>'
    )
    return row + block[m.end():]


def _apply_h2_border(block: str, border: str) -> str:
    """给区块开头的 h2 追加左边框强调条（hero.h2_border）"""
    m = re.match(r'\s*(<h2)([^>]*)>', block)
    if not m:
        return block
    attrs = m.group(2)
    if "style=" in attrs:
        attrs = re.sub(
            r'(style=")([^"]*)(")',
            rf'\1\2;border-left:{border};padding-left:10px\3',
            attrs, count=1,
        )
    return m.group(1) + attrs + ">" + block[m.end():]


def _restyle_pull_quotes(block: str, accent: str) -> str:
    """引文穿插：把区块内的 blockquote 提为更醒目的拉引（大字号 + 强调色左边条）

    整块重建，替掉主题给的引用底色/边框，避免两层叠色。引文内的行内标记（strong/em）保留。
    """
    def repl(m):
        inner = m.group(1)
        text = " ".join(
            p.strip() for p in re.findall(r"<p[^>]*>(.*?)</p>", inner, re.DOTALL)
        ).strip() or inner.strip()
        return (
            f'<blockquote style="border-left:4px solid {accent};background:transparent;'
            f'padding:6px 0 6px 20px;margin-top:24px;margin-bottom:24px;font-size:17px;'
            f'color:{accent};line-height:1.8;font-style:normal">'
            f'<p style="margin:0;font-size:17px;color:{accent};line-height:1.8;'
            f'font-style:normal;background:transparent">{text}</p></blockquote>'
        )

    return re.sub(r"<blockquote[^>]*>(.*?)</blockquote>", repl, block, flags=re.DOTALL)


def _split_hero_head(html: str) -> tuple[str, str]:
    """拆出首屏内容与剩余正文。

    优先取开头的 <h1> 及其后紧随的段落；预处理会把 ≤12 字的短标题标成 ##，
    此时退回取首个 <h2> 标题行 + 其后紧随段落作首屏，让「暗色首屏」在真实输入下也能生效。
    其余内容原样回正文，不吞掉正文。
    """
    m = re.match(r'\s*<h1[^>]*>.*?</h1>', html, re.DOTALL)
    if m:
        end, promote = m.end(), False
    else:
        m = re.match(r'\s*<h2[^>]*>.*?</h2>', html, re.DOTALL)
        if not m:
            return "", html
        end, promote = m.end(), True

    # 标题后紧随的段落并入首屏（到第一个非 <p> 标签为止）
    tail = re.match(r'(?:\s*<p[^>]*>.*?</p>)+', html[end:], re.DOTALL)
    if tail:
        end += tail.end()

    head = html[:end]
    if promote:
        # 首屏里它承担的是文章主标题，字号提到 h1 级别
        head = re.sub(r'font-size:[^;"]+', "font-size:26px", head, count=1)
        head = re.sub(r'font-weight:[^;"]+', "font-weight:800", head, count=1)
    return head, html[end:]


# 交替色带的可见门槛：与页面底色的通道差绝对值之和。
# 低于此值肉眼分不出「这条带子」，等于色带特性没生效。
_BAND_MIN_DISTANCE = 45


def _resolve_band_bg(hero: dict, theme: dict) -> str:
    """定交替色带的底色：主题自带值若与页面底色对比不足，改用强调色派生的可见色带。

    ⚠️ 曾有 13 套 hero 主题的 alt_bg 是 #fafafa / #f7f7f8 这类与白底只差几阶的灰，
    肉眼看不出「交替色带」，等于该特性没生效。这里按 _BAND_MIN_DISTANCE 判定，
    不够就逐步加深 accent 占比；低饱和强调色（藕紫/卡其等）加深后仍不够时，
    再压一点墨色补足明度差。产出的色带带主题色系，比纯灰好看。
    """
    colors = theme.get("colors", {})
    page_bg = colors.get("background", "#ffffff")
    accent = hero.get("accent", "#333333")
    ink = colors.get("primary", "#333333")

    declared = hero.get("alt_bg")
    if declared and _color_distance(declared, page_bg) >= _BAND_MIN_DISTANCE:
        return declared

    for t in (0.12, 0.16, 0.20, 0.24):
        cand = _mix_hex(page_bg, accent, t)
        if _color_distance(cand, page_bg) >= _BAND_MIN_DISTANCE:
            return cand
    return _mix_hex(_mix_hex(page_bg, accent, 0.20), ink, 0.06)


def _wrap_hero_sections(html: str, hero: dict, theme: dict) -> str:
    """hero 布局：按 h2 切分区块，套用 hero 字段里的各开关。

    开关全部来自主题 JSON，不在本函数里发明配色；未声明的开关用 HERO_DEFAULTS。
    """
    accent = hero.get("accent", "#333333")
    dark_bg = hero.get("dark_bg", "#1E293B")
    alt_bg = _resolve_band_bg(hero, theme)
    number_color = hero.get("number_color", "rgba(0,0,0,0.08)")
    h2_border = hero.get("h2_border")

    dark_header = _hero_flag(hero, "dark_header")
    dark_footer = _hero_flag(hero, "dark_footer")
    numbered = _hero_flag(hero, "numbered")
    pull_quotes = _hero_flag(hero, "pull_quotes")
    alt_bg_enabled = _hero_flag(hero, "alt_bg_enabled")
    cards = _hero_flag(hero, "cards")

    # cards 模式的卡面与阴影也从主题派生（见下方 elif cards 分支的说明）
    _colors = theme.get("colors", {})
    _page_bg = _colors.get("background", "#ffffff")
    _ink = _colors.get("primary", "#333333")
    try:
        card_bg = _mix_hex(_page_bg, _ink, 0.07)
        tint_shadow = f"rgba({','.join(str(c) for c in _hex_to_rgb(_ink))},0.10)"
    except (ValueError, IndexError):
        card_bg, tint_shadow = "#FFFFFF", "rgba(0,0,0,0.10)"

    head, body_html = _split_hero_head(html)
    parts = [p for p in re.split(r"(?=<h2\s)", body_html) if p.strip()]

    blocks = []
    if head:
        if dark_header:
            head = _recolor_block(head, _DARK_TEXT)
            blocks.append(
                f'<section style="padding:40px 24px;background-color:{dark_bg};'
                f'color:{_DARK_TEXT}">{head}</section>'
            )
        else:
            blocks.append(f'<section style="padding:8px 0">{head}</section>')

    rest = parts

    total = len(rest)
    for idx, block in enumerate(rest):
        is_last = idx == total - 1
        is_dark = dark_footer and is_last

        if pull_quotes:
            block = _restyle_pull_quotes(block, accent)
        if h2_border and not numbered:
            block = _apply_h2_border(block, h2_border)
        if is_dark:
            block = _recolor_block(block, _DARK_TEXT)
        if numbered:
            badge_style = (
                f"font-size:40px;font-weight:800;line-height:1;margin-right:12px;"
                f"color:{_DARK_TEXT_SOFT if is_dark else number_color}"
            )
            block = _rewrite_h2_as_row(block, f"{idx + 1:02d}", badge_style)

        if is_dark:
            style = f"padding:32px 24px;background-color:{dark_bg};color:{_DARK_TEXT}"
        elif cards:
            # ⚠️ 卡面不能写死白色：暗底主题（如 su-deepwater）的正文色是浅色，
            # 白卡上会变成「浅字白底」几乎不可读。改为按页面底色向墨色靠 7% 派生——
            # 暗底得到亮一档的卡、亮底得到暗一档的卡，一个公式两个方向都成立。
            style = (
                f"margin-bottom:16px;padding:20px 18px;background-color:{card_bg};"
                f"border-radius:10px;box-shadow:0 4px 14px {tint_shadow}"
            )
        elif alt_bg_enabled and idx % 2 == 0:
            style = f"padding:24px 20px;background-color:{alt_bg}"
        else:
            style = "padding:24px 20px"
        blocks.append(f'<section style="{style}">{block}</section>')

    return "".join(blocks)


def _wrap_timeline_sections(html: str, cfg: dict, style_map: dict) -> str:
    """时间线布局：每个 h2 区块左侧加竖线 + 节点圆点"""
    accent = cfg.get("accent", "#333333")
    line_color = cfg.get("line_color", accent)

    head, body_html = _split_hero_head(html)
    parts = [p for p in re.split(r"(?=<h2\s)", body_html) if p.strip()]

    blocks = []
    if head:
        blocks.append(f'<section style="padding:8px 0 20px">{head}</section>')
    rest = parts

    for block in rest:
        badge_style = f"font-size:14px;line-height:1;margin-right:10px;color:{accent}"
        block = _rewrite_h2_as_row(block, "\u25cf", badge_style)
        blocks.append(
            f'<section style="padding:4px 0 4px 18px;border-left:2px solid {line_color};'
            f'margin-bottom:22px">{block}</section>'
        )

    return "".join(blocks)


def inject_inline_styles(html: str, theme: dict, skip_wrapper: bool = False) -> str:
    """为每个 HTML 标签注入内联 style 属性"""
    styles = theme["styles"]

    # 构建各标签的 style 字符串
    style_map = {}
    for tag_key, props in styles.items():
        style_map[tag_key] = build_style_string(props)

    # === 1. 处理列表（微信特殊处理：ul/ol → section 模拟，支持嵌套）===
    html = convert_lists_to_sections(html, style_map)

    # === 2. 处理 callout 块 ===
    html = convert_callouts(html, style_map)

    # === 3. 处理 blockquote 内部的 p 标签 ===
    def style_blockquote(match):
        bq_content = match.group(1)
        # blockquote 内部的 p 标签用 blockquote_p 样式
        if "blockquote_p" in style_map:
            bq_content = re.sub(
                r"<p>",
                f'<p style="{style_map["blockquote_p"]}">',
                bq_content,
            )
        bq_style = style_map.get("blockquote", "")
        return f'<blockquote style="{bq_style}">{bq_content}</blockquote>'

    html = re.sub(r"<blockquote>(.*?)</blockquote>", style_blockquote, html, flags=re.DOTALL)

    # === 4. 处理 pre > code（必须在单独的 code 之前）===
    def style_pre(match):
        pre_content = match.group(1)
        pre_style = style_map.get("pre", "")
        pre_code_style = style_map.get("pre_code", "")
        code_block_style = style_map.get("code_block", "")
        code_header_style = style_map.get("code_header", "")
        # 保护空格：公众号编辑器会压缩连续空格，用 &nbsp; 替换
        def protect_spaces(text):
            parts = re.split(r'(<[^>]+>)', text)
            for i, part in enumerate(parts):
                if not part.startswith('<'):
                    part = part.replace(' ', '&nbsp;')
                parts[i] = part
            return ''.join(parts)
        pre_content = protect_spaces(pre_content)
        # 公众号编辑器会吃掉 pre 里的 \n，必须转成 <br> 才能保留换行
        pre_content = pre_content.replace("\n", "<br>")
        # 先把 <code ...> 开标签摘出来，别让它进高亮器。
        # ⚠️ 高亮是基于正则的：若把标签一起喂进去，`class` 会命中关键字、
        # `"language-python"` 会命中字符串，标签被拆碎；随后 <code[^>]*> 替换
        # 又会吞掉一个 <span，最终代码块开头会多出一行肉眼可见的
        # `class="language-python">`。
        code_open = re.search(r"<code[^>]*>", pre_content)
        has_language = bool(code_open and 'class="language-' in code_open.group(0))
        if code_open:
            pre_content = pre_content[:code_open.start()] + pre_content[code_open.end():]
        # 语法高亮：仅对有语言标记的代码块启用（避免破坏 URL 等纯文本内容）。
        # 调色板按主题 pre 的背景明暗挑——亮底主题用深色调色板会发灰读不清。
        if has_language:
            _bg = re.search(r"background(?:-color)?:\s*([^;\"]+)", pre_style)
            pre_content = _basic_syntax_highlight(
                pre_content, light=_is_light_bg(_bg.group(1) if _bg else "")
            )
        # 补回内联样式版的 code 开标签
        pre_content = f'<code style="{pre_code_style}">' + pre_content
        # Mac 风格工具栏（红黄绿三圆点）
        dot_base = "display:inline-block;width:12px;height:12px;border-radius:50%;margin-right:8px"
        mac_header = (
            f'<section style="{code_header_style}">'
            f'<span style="{dot_base};background:#FF5F56"></span>'
            f'<span style="{dot_base};background:#FFBD2E"></span>'
            f'<span style="{dot_base};background:#27C93F"></span>'
            f'</section>'
        )
        return (
            f'<section style="{code_block_style}">'
            f'{mac_header}'
            f'<pre style="{pre_style}">{pre_content}</pre>'
            f'</section>'
        )

    html = re.sub(r"<pre>(.*?)</pre>", style_pre, html, flags=re.DOTALL)

    # === 5. 普通标签注入样式 ===
    simple_tags = ["h1", "h2", "h3", "h4", "h5", "h6", "p", "strong", "em", "a", "img", "hr", "code", "table", "th", "td"]
    for tag in simple_tags:
        if tag not in style_map:
            continue
        s = style_map[tag]
        if tag == "hr":
            html = re.sub(r"<hr\s*/?>", f'<hr style="{s}">', html)
        elif tag == "img":
            # 响应式图片：为非容器内的图片添加 width:100% 确保适配
            img_style = s
            if "width" not in img_style:
                img_style += ";width:100%"
            html = re.sub(r'<img(?!\s+style) ', f'<img style="{img_style}" ', html)
            # 已有 style 的图片（容器内）不覆盖
        elif tag == "code":
            # 只处理不在 pre 内的 code（pre 内的已经处理过了）
            html = re.sub(r'<code(?!\s+style)>', f'<code style="{s}">', html)
        else:
            # 已经是容器内层元素（data-container=）的交给 _inject_container_styles 处理，
            # 这里不能抢先生成 style，否则容器专属样式的精确匹配会失配、永远注入不上。
            def _add_style(m, _tag=tag, _s=s):
                attrs = m.group(1) or ""
                if "style=" in attrs or "data-container=" in attrs:
                    return m.group(0)
                return f'<{_tag} style="{_s}"{attrs}>'
            html = re.sub(rf"<{tag}((?:\s[^>]*)?)>", _add_style, html)

    # === 5.1 删除线样式 ===
    html = re.sub(r'<del>', '<del style="text-decoration:line-through;color:#999">', html)

    # === 5.2 标题内的 strong/em 继承标题颜色，不要用强调色 ===
    for htag in ['h1', 'h2', 'h3', 'h4', 'h5', 'h6']:
        def fix_heading_strong(match):
            heading_html = match.group(0)
            heading_html = re.sub(
                r'<strong style="([^"]*?)color:[^;]+([^"]*?)">',
                r'<strong style="\1color:inherit\2">',
                heading_html
            )
            heading_html = re.sub(
                r'<em style="([^"]*?)color:[^;]+([^"]*?)">',
                r'<em style="\1color:inherit\2">',
                heading_html
            )
            return heading_html
        html = re.sub(rf'<{htag}\s[^>]*>.*?</{htag}>', fix_heading_strong, html, flags=re.DOTALL)

    # === 5.3 表格斑马纹 ===
    def add_zebra_stripes(match):
        table_html = match.group(0)
        rows = re.findall(r'<tr>(.*?)</tr>', table_html, re.DOTALL)
        result = table_html
        for i, row_content in enumerate(rows):
            old = f'<tr>{row_content}</tr>'
            if i == 0:
                continue  # 表头行跳过（th 已有样式）
            bg = 'background:#f9f9f9;' if i % 2 == 0 else ''
            new = f'<tr style="{bg}">{row_content}</tr>'
            result = result.replace(old, new, 1)
        return result
    html = re.sub(r'<table[^>]*>.*?</table>', add_zebra_stripes, html, flags=re.DOTALL)

    # === 5.5 处理围栏容器内联样式 ===
    html = _inject_container_styles(html, theme)

    # === 6. 处理脚注占位符样式（使用 UUID 安全占位符）===
    for key, placeholder in FOOTNOTE_PLACEHOLDERS.items():
        if key in style_map:
            html = html.replace(placeholder, style_map[key])

    # === 7. 处理图片包裹容器 ===
    if "img_wrapper" in style_map:
        html = re.sub(
            r'<section data-role="img-wrapper">',
            f'<section data-role="img-wrapper" style="{style_map["img_wrapper"]}">',
            html,
        )

    # === 8. 布局分发（按 theme.layout 决定区块怎么切/包）===
    _layout = theme.get("layout")
    if _layout == "card" and "card" in theme:
        html = _wrap_card_sections(html, theme["card"])
    elif _layout == "hero" and "hero" in theme:
        html = _wrap_hero_sections(html, theme["hero"], theme)
    elif _layout == "timeline" and "timeline" in theme:
        html = _wrap_timeline_sections(html, theme["timeline"], style_map)

    # === 8.1 处理 wrapper（整体背景色，用于 dark/retro 等主题）===
    if "wrapper" in style_map and not skip_wrapper:
        if theme.get("layout") == "card":
            # 卡片主题：wrapper 用 flex 列布局 + 卡片间距
            card_bg = theme["card"]["bg"]
            wrapper_s = f'padding:40px 10px;background-color:{card_bg};display:flex;flex-direction:column;align-items:center;gap:40px'
            html = f'<section style="{wrapper_s}">{html}</section>'
        else:
            html = f'<section style="{style_map["wrapper"]}">{html}</section>'

    # === 9. 注入微信深色模式属性（自动补全缺失标签）===
    dark_mode = _auto_dark_mode(theme)
    if dark_mode:
        html = inject_dark_mode_attrs(html, dark_mode, style_map)

    return html


def convert_lists_to_sections(html: str, style_map: dict, depth: int = 0) -> str:
    """把 ul/ol 列表转为 section 模拟（微信兼容），支持嵌套"""
    wrapper_style = style_map.get("list_wrapper", "")
    row_style = style_map.get("list_item_row", "")
    bullet_style = style_map.get("list_item_bullet", "")
    text_style = style_map.get("list_item_text", "")
    ol_bullet_style = style_map.get("ol_item_bullet", bullet_style)

    # 嵌套缩进
    indent = f"padding-left:{16 * depth}px;" if depth > 0 else ""

    def process_list_item(item_html: str, bullet: str, bullet_s: str) -> str:
        """处理单个 li，可能包含嵌套的 ul/ol"""
        # 检查是否有嵌套列表
        nested_ul = re.search(r'<ul>(.*?)</ul>', item_html, re.DOTALL)
        nested_ol = re.search(r'<ol>(.*?)</ol>', item_html, re.DOTALL)

        # 提取主文本（去掉嵌套列表和 p 标签）
        main_text = item_html
        if nested_ul:
            main_text = item_html[:nested_ul.start()]
        elif nested_ol:
            main_text = item_html[:nested_ol.start()]
        main_text = re.sub(r"</?p>", "", main_text).strip()

        # 当前项
        result = (
            f'<section style="{row_style}{indent}">'
            f'<span style="{bullet_s}">{bullet}</span>'
            f'<span style="{text_style}">{main_text}</span>'
            f"</section>"
        )

        # 递归处理嵌套列表
        if nested_ul:
            nested_html = f'<ul>{nested_ul.group(1)}</ul>'
            result += convert_lists_to_sections(nested_html, style_map, depth + 1)
        elif nested_ol:
            nested_html = f'<ol>{nested_ol.group(1)}</ol>'
            result += convert_lists_to_sections(nested_html, style_map, depth + 1)

        return result

    def replace_ul(match):
        items = re.findall(r"<li>(.*?)</li>", match.group(0), re.DOTALL)
        rows = []
        for item in items:
            rows.append(process_list_item(item, "•", bullet_style))
        wrap = f'{wrapper_style}{indent}' if indent else wrapper_style
        return f'<section style="{wrap}">{"".join(rows)}</section>'

    def replace_ol(match):
        items = re.findall(r"<li>(.*?)</li>", match.group(0), re.DOTALL)
        rows = []
        for idx, item in enumerate(items, 1):
            rows.append(process_list_item(item, str(idx), ol_bullet_style))
        wrap = f'{wrapper_style}{indent}' if indent else wrapper_style
        return f'<section style="{wrap}">{"".join(rows)}</section>'

    html = re.sub(r"<ul>.*?</ul>", replace_ul, html, flags=re.DOTALL)
    html = re.sub(r"<ol>.*?</ol>", replace_ol, html, flags=re.DOTALL)
    return html


def convert_callouts(html: str, style_map: dict) -> str:
    """转换 callout 块为带样式的 HTML（支持多类型颜色）"""
    callout_style = style_map.get("callout", "")
    title_style = style_map.get("callout_title", "")
    content_style = style_map.get("callout_content", "")

    def replace_callout(match):
        inner = match.group(1)
        data_type = match.group(0)
        # 提取 data-type
        type_match = re.search(r'data-type="(\w+)"', data_type)
        callout_type = type_match.group(1) if type_match else "callout"

        # 判断是否有类型专属颜色
        type_colors = CALLOUT_TYPE_COLORS.get(callout_type)

        # 构建 callout 容器样式（可能覆盖边框和背景色）
        final_callout_style = callout_style
        if type_colors is not None:
            # 覆盖 border-left 颜色和 background 颜色
            final_callout_style = re.sub(
                r'border-left:[^;]+', f'border-left:4px solid {type_colors["border"]}',
                final_callout_style
            )
            # 如果原样式有 background，替换；否则追加
            if 'background' in final_callout_style:
                final_callout_style = re.sub(
                    r'background[^;]*:[^;]+', f'background:{type_colors["bg"]}',
                    final_callout_style
                )
            else:
                final_callout_style += f';background:{type_colors["bg"]}'

        # 提取标题和内容
        title_match_inner = re.search(r'<p class="callout-title">(.*?)</p>', inner)
        content_match = re.search(r'<p class="callout-content">(.*?)</p>', inner, re.DOTALL)

        result = f'<section style="{final_callout_style}">'
        if title_match_inner and title_match_inner.group(1):
            title_text = title_match_inner.group(1)
            # 类型专属 icon 前缀 + 标题颜色跟随 callout 类型
            final_title_style = title_style
            if type_colors is not None:
                title_text = f'{type_colors["icon"]} {title_text}'
                final_title_style = re.sub(r'color:[^;]+', f'color:{type_colors["border"]}', final_title_style)
            result += f'<p style="{final_title_style}">{title_text}</p>'
        if content_match:
            result += f'<p style="{content_style}">{content_match.group(1)}</p>'
        result += "</section>"
        return result

    return re.sub(r'<div class="callout"[^>]*>(.*?)</div>', replace_callout, html, flags=re.DOTALL)


# ── 预览 HTML 生成 ──────────────────────────────────────────────────────
def generate_preview(article_html: str, footnote_html: str, theme: dict,
                     title: str, word_count: int, output_path: Path):
    """生成浏览器预览 HTML 文件"""
    template_path = TEMPLATE_DIR / "preview.html"
    template = template_path.read_text(encoding="utf-8")

    # 合并文章和脚注
    full_html = article_html
    if footnote_html:
        full_html += "\n" + footnote_html

    preview_html = (
        template
        .replace("{{TITLE}}", title)
        .replace("{{THEME_NAME}}", theme.get("name", ""))
        .replace("{{WORD_COUNT}}", f"{word_count:,}")
        .replace("{{ARTICLE_HTML}}", full_html)
    )

    output_path.parent.mkdir(parents=True, exist_ok=True)
    output_path.write_text(preview_html, encoding="utf-8")
    return output_path


def convert_image_captions(html: str) -> str:
    """将图片后紧跟的斜体段落转为图说样式"""
    caption_style = "text-align:center;font-size:13px;color:#999999;margin-top:-8px;margin-bottom:16px;font-style:normal"
    # 匹配 img wrapper (</section>) 后面紧跟的 <p><em>xxx</em></p>
    html = re.sub(
        r'(</section>\s*)<p[^>]*><em>(.*?)</em></p>',
        rf'\1<p style="{caption_style}">\2</p>',
        html
    )
    # 同时匹配 </p>（CDN/外链图片）后面的斜体图说
    html = re.sub(
        r'(</p>\s*)<p[^>]*><em>(.*?)</em></p>',
        rf'\1<p style="{caption_style}">\2</p>',
        html
    )
    return html


def truncate_html_preview(html: str, max_p_tags: int = 12) -> str:
    """截取 HTML 前 N 个 </p> 之前的内容作为预览"""
    count = 0
    pos = 0
    while count < max_p_tags:
        idx = html.find("</p>", pos)
        if idx == -1:
            break
        pos = idx + len("</p>")
        count += 1
    if pos > 0:
        return html[:pos]
    return html[:2000]


def _render_single_theme(tid, theme_data, gallery_html, gallery_footnote):
    """渲染单个主题（用于并行 gallery）"""
    rendered = inject_inline_styles(gallery_html, theme_data)
    rendered = convert_image_captions(rendered)
    if gallery_footnote:
        fn_rendered = inject_inline_styles(gallery_footnote, theme_data, skip_wrapper=True)
        rendered += "\n" + fn_rendered
    return tid, rendered


def generate_gallery(rendered_map: dict, theme_map: dict,
                     theme_ids: list, title: str, word_count: int,
                     output_dir: Path, recommended: list = None):
    """生成主题画廊页面（单预览区 + 切换按钮模式）"""
    if recommended is None:
        recommended = []
    template_path = TEMPLATE_DIR / "gallery.html"
    template = template_path.read_text(encoding="utf-8")

    default_theme = theme_ids[0] if theme_ids else ""

    # 生成 THEME_BUTTONS（带分组标签）
    GROUPS = [
        ("卡片系列", ["warm-card", "fresh-card", "ocean-card"]),
        ("深度长文", ["newspaper", "magazine", "ink", "coffee-house"]),
        ("科技产品", ["bytedance", "github", "sspai", "midnight"]),
        ("文艺随笔", ["terracotta", "mint-fresh", "sunset-amber", "lavender-dream"]),
        ("活力动态", ["sports", "bauhaus", "chinese", "wechat-native"]),
        ("模板布局", ["minimal-gray", "bold-navy", "bold-green", "bold-blue"]),
    ]
    buttons_html = ""
    btn_index = 0
    for group_name, group_ids in GROUPS:
        group_tids = [t for t in group_ids if t in theme_ids]
        if not group_tids:
            continue
        buttons_html += f'<div class="theme-group"><span class="group-label">{group_name}</span>'
        for tid in group_tids:
            theme = theme_map[tid]
            accent = theme.get("colors", {}).get("accent", "#333")
            active = " active" if btn_index == 0 else ""
            is_recommended = " recommended" if tid in recommended else ""
            name = theme.get("name", tid)
            rec_label = '<span class="rec-badge">推荐</span>' if tid in recommended else ""
            buttons_html += (
                f'<button class="theme-btn{active}{is_recommended}" data-theme="{tid}" '
                f"onclick=\"switchTheme('{tid}')\">"
                f'<span class="theme-dot" style="background:{accent}"></span>'
                f'{name}{rec_label}</button>'
            )
            btn_index += 1
        buttons_html += '</div>\n'

    # 生成 THEME_PREVIEWS
    previews_html = ""
    for i, tid in enumerate(theme_ids):
        display = "block" if i == 0 else "none"
        previews_html += (
            f'<div class="theme-preview" data-theme="{tid}" '
            f'style="display:{display}">{rendered_map[tid]}</div>\n'
        )

    gallery_html = (
        template
        .replace("{{TITLE}}", title)
        .replace("{{WORD_COUNT}}", f"{word_count:,}")
        .replace("{{THEME_BUTTONS}}", buttons_html)
        .replace("{{THEME_PREVIEWS}}", previews_html)
        .replace("{{DEFAULT_THEME}}", default_theme)
    )

    # 写入选中主题到临时文件（默认第一个）
    tmp_dir = Path("/tmp/wechat-format")
    tmp_dir.mkdir(parents=True, exist_ok=True)
    (tmp_dir / "selected-theme.txt").write_text(default_theme, encoding="utf-8")

    output_path = output_dir / "gallery.html"
    output_dir.mkdir(parents=True, exist_ok=True)
    output_path.write_text(gallery_html, encoding="utf-8")
    return output_path


def format_for_output(content: str, input_path: Path, theme: dict,
                      output_dir: Path, vault_root: Path,
                      output_format: str = "wechat") -> dict:
    """统一格式化入口，支持多种输出格式

    Args:
        output_format: "wechat" (默认，全套微信兼容处理)
                      "html" (标准 HTML，保留 class，不内联样式)
                      "plain" (纯文本 + 基本 HTML 结构)

    Returns:
        dict with keys: html, footnote_html, title, word_count
    """
    title = extract_title(content, input_path)
    word_count = count_words(content)

    # 通用预处理
    content = strip_frontmatter(content)
    content = fix_cjk_spacing(content)
    content = fix_cjk_bold_punctuation(content)
    content = process_callouts(content)
    content = process_manual_footnotes(content)
    content = process_fenced_containers(content)
    content = re.sub(r'~~(.+?)~~', r'<del>\1</del>', content)

    output_dir.mkdir(parents=True, exist_ok=True)
    content = convert_wikilinks(content, vault_root, output_dir)
    content = copy_markdown_images(content, input_path.parent, output_dir)

    html = md_to_html(content)

    if output_format == "plain":
        # 纯 HTML，不做脚注转换和样式注入
        return {
            "html": html,
            "footnote_html": "",
            "title": title,
            "word_count": word_count,
        }

    # 外链 → 脚注
    html, footnote_html = extract_links_as_footnotes(html)

    if output_format == "html":
        # 标准 HTML，脚注转换但不内联样式
        return {
            "html": html,
            "footnote_html": footnote_html,
            "title": title,
            "word_count": word_count,
        }

    # wechat: 全套微信兼容处理
    html = inject_inline_styles(html, theme)
    if footnote_html:
        footnote_html = inject_inline_styles(footnote_html, theme, skip_wrapper=True)
    html = convert_image_captions(html)
    if footnote_html:
        footnote_html = convert_image_captions(footnote_html)

    return {
        "html": html,
        "footnote_html": footnote_html,
        "title": title,
        "word_count": word_count,
    }


# ── 主流程 ──────────────────────────────────────────────────────────────
def main():
    import argparse
    import webbrowser
    from concurrent.futures import ThreadPoolExecutor, as_completed

    parser = argparse.ArgumentParser(description="微信公众号文章排版工具")
    parser.add_argument("--input", "-i", required=True, help="输入 Markdown 文件路径")
    parser.add_argument("--theme", "-t", default=DEFAULT_THEME, help=f"主题名称（默认: {DEFAULT_THEME}）")
    parser.add_argument("--vault-root", default=str(VAULT_ROOT), help="Obsidian Vault 根目录")
    parser.add_argument("--output", "-o", default=str(OUTPUT_DIR), help="输出目录")
    parser.add_argument("--no-open", action="store_true", help="不自动打开浏览器")
    parser.add_argument("--gallery", action="store_true", help="主题画廊模式：预览多个主题供选择")
    parser.add_argument("--recommend", nargs="*", default=[], help="推荐的主题ID列表（gallery中高亮显示）")
    parser.add_argument("--format", choices=["wechat", "html", "plain"], default="wechat",
                        help="输出格式: wechat(默认), html(标准HTML), plain(纯HTML)")
    args = parser.parse_args()

    input_path = Path(args.input)
    vault_root = Path(args.vault_root)
    output_base = Path(args.output)
    theme_name = args.theme

    # 每篇文章一个子目录: 公众号排版/2026-02-26-文章名/
    file_stem = re.sub(r"-(公众号|小红书|微博)$", "", input_path.stem)
    output_dir = output_base / file_stem

    # 验证输入文件
    if not input_path.exists():
        print(f"错误: 文件不存在 - {input_path}")
        sys.exit(1)

    # 加载主题
    theme = load_theme(theme_name)

    print(f"主题: {theme['name']} ({theme_name})")
    print(f"输入: {input_path}")

    # 读取文章
    content = input_path.read_text(encoding="utf-8")
    title = extract_title(content, input_path)
    word_count = count_words(content)
    print(f"标题: {title}")
    print(f"字数: {word_count:,}")

    # 非微信格式：简单输出
    if args.format != "wechat":
        result = format_for_output(content, input_path, theme, output_dir, vault_root, args.format)
        out_path = output_dir / f"article.{args.format}.html"
        out_path.parent.mkdir(parents=True, exist_ok=True)
        out_html = result["html"]
        if result["footnote_html"]:
            out_html += "\n" + result["footnote_html"]
        out_path.write_text(out_html, encoding="utf-8")
        print(f"\n输出: {out_path}")
        return

    # 处理流程
    content = strip_frontmatter(content)
    content = process_callouts(content)
    content = process_manual_footnotes(content)
    content = process_fenced_containers(content)
    content = re.sub(r'~~(.+?)~~', r'<del>\1</del>', content)

    output_dir.mkdir(parents=True, exist_ok=True)
    content = convert_wikilinks(content, vault_root, output_dir)
    content = copy_markdown_images(content, input_path.parent, output_dir)

    html = md_to_html(content)
    html, footnote_html = extract_links_as_footnotes(html)

    # ── Gallery 模式：并行渲染多主题 ──
    if args.gallery:
        gallery_html = html
        gallery_footnote = footnote_html

        theme_map = {}
        for tid in GALLERY_THEMES:
            tp = THEMES_DIR / f"{tid}.json"
            if tp.exists():
                with open(tp, encoding="utf-8") as f:
                    theme_map[tid] = json.load(f)

        gallery_theme_ids = [tid for tid in GALLERY_THEMES if tid in theme_map]

        if not gallery_theme_ids:
            print("错误: 没有找到任何可用的画廊主题")
            sys.exit(1)

        print(f"\n画廊模式: 并行渲染 {len(gallery_theme_ids)} 个主题...")
        rendered_map = {}

        # 并行渲染（线程池）
        with ThreadPoolExecutor(max_workers=min(8, len(gallery_theme_ids))) as executor:
            futures = {
                executor.submit(
                    _render_single_theme, tid, theme_map[tid],
                    gallery_html, gallery_footnote
                ): tid
                for tid in gallery_theme_ids
            }
            for future in as_completed(futures):
                tid, rendered = future.result()
                rendered_map[tid] = rendered
                print(f"  ✓ {theme_map[tid].get('name', tid)} ({tid})")

        gallery_path = generate_gallery(
            rendered_map, theme_map, gallery_theme_ids,
            title, word_count, output_dir,
            recommended=args.recommend
        )
        print(f"\n画廊页面: {gallery_path}")

        if AUTO_OPEN and not args.no_open:
            webbrowser.open(f"file://{gallery_path}")
            print("已在浏览器中打开画廊")

        print(f"\n完成! 选中主题后点「用这个风格排版」即可复制到剪贴板。")
        print(f"选中的主题 ID 会写入 /tmp/wechat-format/selected-theme.txt")
        return

    # ── 单主题模式 ──
    html = inject_inline_styles(html, theme)
    if footnote_html:
        footnote_html = inject_inline_styles(footnote_html, theme, skip_wrapper=True)

    html = convert_image_captions(html)
    if footnote_html:
        footnote_html = convert_image_captions(footnote_html)

    # 保存纯文章 HTML
    full_article = html
    if footnote_html:
        full_article += "\n" + footnote_html
    article_path = output_dir / "article.html"
    article_path.write_text(full_article, encoding="utf-8")

    # 保存预览 HTML
    preview_path = output_dir / "preview.html"
    generate_preview(html, footnote_html, theme, title, word_count, preview_path)
    print(f"\n排版成品: {preview_path}")

    if AUTO_OPEN and not args.no_open:
        webbrowser.open(f"file://{preview_path}")
        print("已在浏览器中打开预览")

    print("\n完成! 在浏览器中点击「复制到微信」按钮，然后粘贴到公众号后台即可。")


def convert_markdown_to_wechat_html(markdown_text: str, theme_path: str) -> str:
    """将 Markdown 文本转为微信公众号兼容的内联样式 HTML

    Args:
        markdown_text: Markdown 格式文本
        theme_path: 主题 JSON 文件的完整路径

    Returns:
        带内联样式的 HTML 字符串（微信兼容格式）
    """
    with open(theme_path, encoding="utf-8") as f:
        theme = json.load(f)

    text = fix_cjk_spacing(markdown_text)
    text = fix_cjk_bold_punctuation(text)
    text = process_callouts(text)
    text = process_manual_footnotes(text)
    text = process_fenced_containers(text)
    text = re.sub(r'~~(.+?)~~', r'<del>\1</del>', text)

    html = md_to_html(text)
    html = inject_inline_styles(html, theme)
    html = convert_image_captions(html)

    return html


if __name__ == "__main__":
    main()
