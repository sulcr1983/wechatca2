#!/usr/bin/env python3
"""
归藏风格封面生成器 — Guizang Social Card Renderer
==================================================
按照归藏SKILL.md工作流：
1. Intake → 收集目标平台和比例
2. Extract Story → 提取文案故事
3. Choose Style → 选择Editorial/Swiss风格
4. Plan Pages → 规划版面布局
5. Build & Render → 构建并渲染封面
6. Deliver → 交付结果

设计风格：
- Editorial: 杂志排版风格，Serif字体，经典优雅
- Swiss: 瑞士设计风格，Sans-serif字体，现代极简
"""

import os
import re
import time
import json
import logging
from pathlib import Path
from playwright.sync_api import sync_playwright

logger = logging.getLogger(__name__)

# ── 归藏设计系统 ──────────────────────────────────────────

# 颜色系统
GZ_COLORS = {
    "editorial": {
        "paper": "#0d0c0b",
        "ink": "#e8dcc8",
        "muted": "#6b6560",
        "accent": "#c4956a",
        "bg": "#141210",
        "border": "rgba(255,255,255,.06)",
    },
    "swiss": {
        "paper": "#0a0a0a",
        "ink": "#f5f5f5",
        "muted": "#737373",
        "accent": "#3b82f6",
        "bg": "#111111",
        "border": "rgba(255,255,255,.08)",
    }
}

# 字体系统
GZ_FONTS = {
    "editorial": {
        "family": '"Noto Serif SC", "Songti SC", Georgia, serif',
        "title_size": "96px",
        "title_weight": "500",
        "title_line": "1.10",
        "body_size": "28px",
        "body_line": "1.55",
        "meta_size": "20px",
        "meta_letter": ".22em",
    },
    "swiss": {
        "family": '"Noto Sans SC", "PingFang SC", system-ui, sans-serif',
        "title_size": "104px",
        "title_weight": "700",
        "title_line": "1.05",
        "body_size": "32px",
        "body_line": "1.45",
        "meta_size": "22px",
        "meta_letter": ".15em",
    }
}

# ── 标题处理 ──────────────────────────────────────────────

def _short_title(long_title: str) -> str:
    """提取短标题（≤10字）"""
    if len(long_title) <= 10:
        return long_title
    # 尝试按标点分割
    for sep in ["，", "。", "！", "？", "、", ";", "、"]:
        if sep in long_title:
            short = long_title.split(sep)[0]
            if len(short) <= 10:
                return short
    return long_title[:10]

def _extract_story(text: str):
    """提取故事：标题 + 引语"""
    lines = [l.strip() for l in text.splitlines() if l.strip()]
    if not lines:
        return "封面标题", ""
    
    long_title = lines[0]
    body_lines = lines[1:] if len(lines) > 1 else []
    lead = " · ".join(body_lines[:3]) if body_lines else ""
    
    return long_title, lead

# ── HTML模板生成 ──────────────────────────────────────────

def _build_guizang_html(style: str, long_title: str, lead: str, 
                        xhs_img: str = "", square_img: str = "", wide_img: str = ""):
    """构建归藏风格的封面HTML"""
    
    colors = GZ_COLORS[style]
    fonts = GZ_FONTS[style]
    
    # 基础CSS
    base_css = f"""
    /* ── 归藏基础样式 ── */
    *,*::before,*::after {{ box-sizing: border-box; }}
    html, body {{ margin: 0; padding: 0; }}
    body {{
      background: {colors['bg']};
      font-family: {fonts['family']};
      -webkit-font-smoothing: antialiased;
      padding: 48px 32px;
      color: {colors['ink']};
    }}
    .sheet {{
      display: flex;
      flex-direction: column;
      align-items: center;
      gap: 48px;
    }}
    
    /* ── Poster 基础 ── */
    .poster {{
      position: relative;
      overflow: hidden;
      isolation: isolate;
      background: {colors['paper']};
      color: {colors['ink']};
    }}
    .poster .content {{
      position: relative;
      z-index: 2;
      height: 100%;
      display: flex;
      flex-direction: column;
    }}
    
    /* ── 装饰元素 ── */
    .grain {{
      position: absolute;
      inset: 0;
      z-index: 3;
      pointer-events: none;
      opacity: .04;
      background-image: url("data:image/svg+xml,%3Csvg viewBox='0 0 256 256' xmlns='http://www.w3.org/2000/svg'%3E%3Cfilter id='n'%3E%3CfeTurbulence type='fractalNoise' baseFrequency='0.9' numOctaves='4' stitchTiles='stitch'/%3E%3C/filter%3E%3Crect width='100%25' height='100%25' filter='url(%23n)' opacity='1'/%3E%3C/svg%3E");
    }}
    
    /* ── XHS 3:4 ── */
    .poster.xhs {{
      width: 1080px;
      height: 1440px;
    }}
    .poster.xhs .cover-img {{
      position: absolute;
      inset: 0;
      width: 100%;
      height: 100%;
      object-fit: cover;
      z-index: 0;
    }}
    .poster.xhs .img-overlay {{
      position: absolute;
      inset: 0;
      z-index: 1;
      pointer-events: none;
      /* D-2 修复：废除全画布纯黑渐变（image-overlay.md 铁律：禁止 uniform full-canvas falloff / pure black）。
         改为局部、图像色调(#0a0a0b)、峰值≤0.30 的底部 tint，文字区外完全透明。 */
      background: linear-gradient(180deg, rgba(10,10,11,0) 50%, rgba(10,10,11,0.30) 100%);
    }}
    .poster.xhs .content {{
      justify-content: flex-end;
      padding: 96px 88px;
    }}
    
    /* ── 排版层级 ── */
    .issue-row {{
      display: flex;
      align-items: center;
      gap: 12px;
      font-family: monospace;
      font-size: {fonts['meta_size']};
      letter-spacing: {fonts['meta_letter']};
      color: rgba(255,255,255,.75);
      text-shadow: 0 1px 3px rgba(0,0,0,.3);
    }}
    .issue-row .dot {{
      width: 5px;
      height: 5px;
      border-radius: 50%;
      background: rgba(255,255,255,.4);
    }}
    .kicker {{
      font-family: monospace;
      font-size: 21px;
      letter-spacing: .22em;
      color: rgba(255,255,255,.85);
      margin: 0 0 24px;
      text-shadow: 0 1px 3px rgba(0,0,0,.3);
    }}
    .poster .h-display {{
      font-weight: {fonts['title_weight']};
      font-size: {fonts['title_size']};
      line-height: {fonts['title_line']};
      letter-spacing: .04em;
      margin: 0 0 20px;
      color: rgba(255,255,255,.95);
      text-shadow: 0 2px 8px rgba(0,0,0,.3);
    }}
    .accent-rule {{
      width: 48px;
      height: 3px;
      background: {colors['accent']};
      margin-bottom: 20px;
      opacity: .8;
    }}
    .lead {{
      font-size: {fonts['body_size']};
      line-height: {fonts['body_line']};
      color: rgba(255,255,255,.85);
      margin: 0;
      max-width: 640px;
      text-shadow: 0 1px 4px rgba(0,0,0,.3);
    }}
    
    /* ── Square 1:1 ── */
    .poster.square {{
      width: 1080px;
      height: 1080px;
    }}
    .poster.square .img-overlay {{
      position: absolute;
      inset: 0;
      z-index: 1;
      pointer-events: none;
      /* D-2：局部、图像色调、峰值 0.30 的径向 tint，居中于标题区，外缘透明 */
      background: radial-gradient(72% 60% at 50% 50%, rgba(10,10,11,0.30) 0%, rgba(10,10,11,0) 100%);
    }}
    .poster.square .content {{
      padding: 88px;
      justify-content: center;
      align-items: center;
      text-align: center;
    }}
    .square-title {{
      font-weight: {fonts['title_weight']};
      font-size: 88px;
      line-height: 1.15;
      letter-spacing: .04em;
      color: rgba(255,255,255,.95);
      text-shadow: 0 2px 8px rgba(0,0,0,.3);
    }}
    
    /* ── Wide 21:9 ── */
    .poster.wide {{
      width: 2100px;
      height: 900px;
    }}
    .poster.wide .img-overlay {{
      position: absolute;
      inset: 0;
      z-index: 1;
      pointer-events: none;
      /* D-2：左侧单向局部 tint，仅护住左栏文字区，向右淡出 */
      background: linear-gradient(90deg, rgba(10,10,11,0.30) 0%, rgba(10,10,11,0) 60%);
    }}
    .poster.wide .content {{
      padding: 80px 120px;
      flex-direction: row;
      gap: 80px;
      align-items: center;
    }}
    .wide-layout {{
      display: grid;
      grid-template-columns: 1fr 1fr;
      gap: 80px;
      height: 100%;
      align-items: center;
      width: 100%;
    }}
    .wide-title {{
      font-weight: {fonts['title_weight']};
      font-size: 96px;
      line-height: 1.10;
      letter-spacing: .03em;
      color: rgba(255,255,255,.95);
      text-shadow: 0 2px 8px rgba(0,0,0,.3);
    }}
    .wide-img {{
      width: 100%;
      height: 100%;
      object-fit: cover;
      border-radius: 4px;
    }}
    """
    
    # 时间戳
    date_str = time.strftime('%Y.%m')
    
    # 构建HTML
    html = f"""<!doctype html>
<html lang="zh-CN">
<head>
<meta charset="utf-8">
<title>{long_title} — 归藏封面</title>
<link href="https://fonts.googleapis.com/css2?family=Noto+Serif+SC:wght@400;500;700&family=Noto+Sans+SC:wght@400;500;700&display=swap" rel="stylesheet">
<style>
{base_css}
</style>
</head>
<body>
<main class="sheet">

  <!-- ===== XHS 3:4 Cover ===== -->
  <section class="poster xhs" id="xhs-cover">
    {f'<img class="cover-img" src="{xhs_img}" alt="cover">' if xhs_img else ''}
    {f'<div class="img-overlay"></div>' if xhs_img else ''}
    <div class="grain"></div>
    <div class="content">
      <div class="issue-row">
        <span>Vol. 01</span>
        <span class="dot"></span>
        <span>{date_str}</span>
      </div>
      <div style="margin-top:40px;">
        <p class="kicker">封面 · Cover</p>
        <h1 class="h-display">{long_title}</h1>
        <div class="accent-rule"></div>
        {f'<p class="lead">{lead}</p>' if lead else ''}
      </div>
    </div>
  </section>

  <!-- ===== Square 1:1 Cover ===== -->
  <section class="poster square" id="square-cover">
    {f'<img class="cover-img" src="{square_img or xhs_img}" alt="cover">' if (square_img or xhs_img) else ''}
    {f'<div class="img-overlay"></div>' if (square_img or xhs_img) else ''}
    <div class="grain"></div>
    <div class="content">
      <h1 class="square-title">{long_title}</h1>
      {f'<p class="lead" style="margin-top:24px;text-align:center;">{lead}</p>' if lead else ''}
    </div>
  </section>

  <!-- ===== Wide 21:9 Cover ===== -->
  <section class="poster wide" id="wide-cover">
    {f'<img class="cover-img" src="{wide_img or xhs_img}" alt="cover">' if (wide_img or xhs_img) else ''}
    {f'<div class="img-overlay"></div>' if (wide_img or xhs_img) else ''}
    <div class="grain"></div>
    <div class="content">
      <div class="wide-layout">
        <div>
          <h1 class="wide-title">{long_title}</h1>
          {f'<p class="lead" style="margin-top:24px;">{lead}</p>' if lead else ''}
        </div>
        {f'<div><img class="wide-img" src="{wide_img or xhs_img}" alt="cover"></div>' if (wide_img or xhs_img) else ''}
      </div>
    </div>
  </section>

</main>
</body>
</html>"""
    
    return html

# ── 渲染函数 ──────────────────────────────────────────────

def render_social_cards(
    text: str,
    output_dir: str,
    style: str = "editorial",
    title: str = "",
    device_scale_factor: float = 2.0,
    images: dict | None = None,
):
    """生成归藏风格的封面图片"""
    
    os.makedirs(output_dir, exist_ok=True)
    
    # 1. 提取故事
    long_title, lead = _extract_story(text)
    if title:
        long_title = title
    
    # 2. 解析图片
    def _resolve_img(key):
        if images and key in images:
            p = images[key]
            if os.path.isfile(p):
                return Path(p).resolve().as_uri()
        return ""
    
    xhs_img = _resolve_img("xhs")
    square_img = _resolve_img("square")
    wide_img = _resolve_img("wide")
    
    # 3. 构建HTML
    multi_html = _build_guizang_html(
        style=style,
        long_title=long_title,
        lead=lead,
        xhs_img=xhs_img,
        square_img=square_img,
        wide_img=wide_img,
    )
    
    # 4. 渲染为图片
    results = {}
    
    with sync_playwright() as p:
        browser = p.chromium.launch()
        page = browser.new_page()
        
        # 写入HTML
        page.set_content(multi_html, wait_until="networkidle")
        
        # 等待字体加载
        page.evaluate("document.fonts.ready")
        
        # 渲染XHS
        xhs_el = page.query_selector("#xhs-cover")
        if xhs_el:
            xhs_path = os.path.join(output_dir, "xhs-01.png")
            xhs_el.screenshot(path=xhs_path)
            results["xhs"] = xhs_path
            logger.info("Saved %s (1080x1440)", xhs_path)
        
        # 渲染Square
        square_el = page.query_selector("#square-cover")
        if square_el:
            square_path = os.path.join(output_dir, "square-01.png")
            square_el.screenshot(path=square_path)
            results["square"] = square_path
            logger.info("Saved %s (1080x1080)", square_path)
        
        # 渲染Wide
        wide_el = page.query_selector("#wide-cover")
        if wide_el:
            wide_path = os.path.join(output_dir, "wide-01.png")
            wide_el.screenshot(path=wide_path)
            results["wide"] = wide_path
            logger.info("Saved %s (2100x900)", wide_path)
        
        browser.close()
    
    return results

if __name__ == "__main__":
    # 测试
    result = render_social_cards(
        text="我今天完成了一个非常厉害的阳光星盘系统\n这是一个革命性的创新工具",
        output_dir="./test_output",
        style="editorial",
    )
    print(json.dumps(result, indent=2, ensure_ascii=False))
