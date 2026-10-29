"""164 套主题的标题 / 正文对比度门禁（只读，不改任何文件）。

为什么需要它
------------
2026-10-29 之前有 14 套主题的标题对比度低于 3.0：白字压在浅绿 / 浅金 / 浅青
标题条上，或浅金 / 浅粉字压在米白页面底上。这些是主题 JSON 里的死数据，用户
还能在「自定义配色」里自选颜色，所以修法不是逐套改 JSON，而是排版引擎在注入
内联样式时兜底（`core/format_engine.py` 的 `_readable_heading_props`）。

本脚本就是那道兜底的验收：**直接调引擎里的同一个函数**，不另写一套颜色数学，
避免「测试用一套标准、渲染用另一套」——那样测试全绿用户还是看不清。

判定口径（WCAG 2.1 AA）
  · 标题 h1–h6   ≥ 3.0（大字号）
  · 正文 p       ≥ 4.5（小字号）

用法：
  .venv/Scripts/python.exe scripts/theme_contrast_audit.py           # 表格报告
  .venv/Scripts/python.exe scripts/theme_contrast_audit.py --quiet    # 只报结论
退出码：0 全达标 / 1 有不达标
"""
from __future__ import annotations

import argparse
import glob
import json
import os
import re
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent.parent))

from core.format_engine import (  # noqa: E402
    _blend_over,
    _contrast_ratio,
    _parse_color,
    _readable_heading_props,
    _COLOR_TOKEN_RE,
    inject_inline_styles,
    md_to_html,
)

ROOT = Path(__file__).resolve().parent.parent
THEMES = ROOT / "public" / "themes"

HEADING_MIN = 3.0
BODY_MIN = 4.5

# 六种标题都要出现，否则 h4–h6 的配色永远不会被检查到
MD = """# 产品需求文档 PRD V1.0

本文说明这一版要解决的问题、边界和验收口径，读完这段你应该知道要不要继续看。

## 一、产品概述

这是一个测试段落，用来验证默认版式下不会自动插入目录，也不会被切成卡片。

### 1.1 背景

第二阶段主要面向中小团队，先做最小闭环，不做协作与权限。

#### 1.1.1 现状

每个项目至少显示三条，超出折叠，不打断阅读节奏。

##### 细节

上线后每周复盘一次。

###### 备注

数值以线上为准。
"""


def _stops(bg_value: str, page_rgb):
    """把 background 声明解析成肉眼看到的底色列表（兼容渐变与半透明）"""
    toks = _COLOR_TOKEN_RE.findall(bg_value or "")
    out = []
    for t in toks:
        c = _parse_color(t)
        if c:
            out.append(_blend_over(c, page_rgb))
    return out


def _decl(style: str, key: str) -> str:
    """取某条 CSS 声明（`(?:^|;)` 锚定，避免 color 命中 background-color）"""
    m = re.search(rf"(?:^|;)\s*{re.escape(key)}\s*:\s*([^;]+)", style or "")
    return m.group(1).strip() if m else ""


def audit_theme(path: str) -> list[tuple[str, str, float]]:
    """返回该主题所有不达标的 (tag, 颜色, 对比度)"""
    theme = json.loads(Path(path).read_text(encoding="utf-8"))
    page = _parse_color((theme.get("colors") or {}).get("background") or "#ffffff")
    page_rgb = page[:3] if page else (255, 255, 255)
    page_hex = "#%02x%02x%02x" % page_rgb

    bad = []
    for tag in ("h1", "h2", "h3", "h4", "h5", "h6"):
        props = (theme.get("styles") or {}).get(tag)
        if not isinstance(props, dict):
            continue
        # 引擎真正会用的那份 props（护栏已生效）
        fixed = _readable_heading_props(props, page_hex)
        fg = _parse_color(str(fixed.get("color") or ""))
        if not fg:
            continue
        bg = fixed.get("background") or fixed.get("background_color") or ""
        stops = _stops(str(bg), page_rgb) or [page_rgb]
        worst = min(_contrast_ratio(fg[:3], s) for s in stops)
        if worst < HEADING_MIN:
            bad.append((tag, str(fixed.get("color")), round(worst, 2)))

    # 正文用真实渲染产物量：p 的底色可能来自容器，不能只看 styles
    html = inject_inline_styles(md_to_html(MD), theme)
    for chunk in html.split("<p style=\"")[1:]:
        style = chunk.split("\"", 1)[0]
        fg = _parse_color(_decl(style, "color"))
        if not fg:
            continue
        # 正文自己的底色优先，没有再回落到页面底色
        stops = _stops(_decl(style, "background") or _decl(style, "background-color"), page_rgb)
        worst = min(_contrast_ratio(fg[:3], s) for s in (stops or [page_rgb]))
        if worst < BODY_MIN:
            bad.append(("p", str(fg), round(worst, 2)))
            break
    return bad


def main() -> int:
    ap = argparse.ArgumentParser()
    ap.add_argument("--quiet", action="store_true", help="只输出结论")
    args = ap.parse_args()

    files = sorted(glob.glob(str(THEMES / "*.json")))
    files = [f for f in files if os.path.basename(f) != "index.json"]
    rows, failed = [], 0
    for f in files:
        tid = os.path.basename(f)[:-5]
        bad = audit_theme(f)
        if bad:
            failed += 1
            rows.append((tid, bad))

    if not args.quiet:
        print(f"对比度门禁：{len(files)} 套主题（标题 ≥{HEADING_MIN} / 正文 ≥{BODY_MIN}）")
        print("-" * 78)
        for tid, bad in rows:
            print(f"  {tid:<24}" + "；".join(f"{t} {c} = {v}" for t, c, v in bad))
        if not rows:
            print("  （全部达标）")
        print("-" * 78)

    if failed:
        print(f"FAIL：{failed}/{len(files)} 套存在低对比文字（见上表）")
        return 1
    print(f"PASS：{len(files)}/{len(files)} 套标题与正文对比度全部达标")
    return 0


if __name__ == "__main__":
    sys.exit(main())
