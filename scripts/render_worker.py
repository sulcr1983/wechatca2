#!/usr/bin/env python3
"""Guizang-style Social Card Render Worker

Uses Playwright to render HTML poster boards and export PNGs at exact
dimensions matching guizang-social-card-skill specifications:

  - XHS (3:4)      1080 x 1440  — id="xhs-cover"
  - Square (1:1)   1080 x 1080  — id="wechat-square"
  - Wide (21:9)    2100 x  900  — id="wechat-wide"

Each poster is screenshotted by its unique ID, so content can differ per ratio.
"""

import os
import re
import sys
import json
import time
import logging
import argparse
from pathlib import Path
from playwright.sync_api import sync_playwright, TimeoutError as PwTimeout

logging.basicConfig(
    level=logging.INFO,
    format="%(asctime)s [%(levelname)s] %(message)s",
    handlers=[logging.StreamHandler(sys.stdout)],
)
logger = logging.getLogger("render_worker")

# 出口尺寸（归藏规范）
BOARD_SPECS = {
    "xhs":    {"width": 1080, "height": 1440, "selector": "#xhs-cover"},
    "square": {"width": 1080, "height": 1080, "selector": "#wechat-square"},
    "wide":   {"width": 2100, "height":  900, "selector": "#wechat-wide"},
}

# ── 工具函数 ─────────────────────────────────────────────────
def _short_title(title: str) -> str:
    """从长标题提取 4-10 字短标题，用于 1:1 方图"""
    # 去掉标点，取前 10 字
    short = re.sub(r'[，,。、！!？?：:；;""''「」【】\s]', '', title)
    if len(short) > 10:
        short = short[:8] + "…"
    return short or title[:6]

def _template_replace(html: str, data: dict) -> str:
    """替换 {{KEY}} 占位符"""
    for key, val in data.items():
        html = html.replace("{{" + key + "}}", str(val))
    return html

def _find_chrome() -> str | None:
    candidates = [
        os.environ.get("CHROME_PATH", ""),
        r"C:\Program Files\Google\Chrome\Application\chrome.exe",
        r"C:\Program Files (x86)\Google\Chrome\Application\chrome.exe",
    ]
    for cp in candidates:
        if cp and os.path.isfile(cp):
            return cp
    return None

# ── 渲染引擎 ─────────────────────────────────────────────────
def screenshot_poster_by_id(
    html_file_path: str,
    output_path: str,
    selector: str,
    board_width: int,
    board_height: int,
    device_scale_factor: float = 1.0,
    timeout: int = 30000,
):
    """加载 HTML 文件，按 CSS selector 截图指定 poster"""
    with sync_playwright() as pw:
        chrome = _find_chrome()
        launch_opts = {"headless": True}
        if chrome:
            launch_opts["executable_path"] = chrome

        browser = pw.chromium.launch(**launch_opts)
        context = browser.new_context(
            viewport={"width": board_width, "height": board_height},
            device_scale_factor=device_scale_factor,
        )
        page = context.new_page()

        file_url = Path(html_file_path).as_uri()
        page.goto(file_url, wait_until="networkidle", timeout=timeout)
        page.wait_for_load_state("networkidle")

        # 等待 WebGL canvas / 字体
        try:
            page.wait_for_selector(selector, timeout=5000)
        except PwTimeout:
            pass
        time.sleep(0.8)

        el = page.query_selector(selector)
        if el:
            el.screenshot(path=output_path)
        else:
            # fallback: 截整个页面
            page.screenshot(path=output_path, full_page=False)

        browser.close()

    logger.info("Saved %s (%dx%d)", output_path, board_width, board_height)
    return output_path


# ── 核心：生成多版式 HTML + 按 ID 渲染 ──────────────────────
def render_social_cards(
    text: str,
    output_dir: str,
    style: str = "editorial",
    title: str = "",
    device_scale_factor: float = 1.0,
    images: dict | None = None,  # {"xhs": "/abs/path.jpg", "square": "/abs/path.png", "wide": "/abs/path.jpg"}
):
    os.makedirs(output_dir, exist_ok=True)

    project_root = Path(__file__).resolve().parent.parent
    cover_templates_dir = project_root / "public" / "cover-templates"

    # 1. 匹配模板目录
    available = sorted(d for d in cover_templates_dir.iterdir() if d.is_dir())
    matched = [d for d in available if d.name.startswith(style)]
    if not matched:
        matched = available[:1]
    if not matched:
        raise FileNotFoundError(f"No cover templates in {cover_templates_dir}")

    template_dir = matched[0]
    theme = template_dir.name  # e.g. "editorial-dune"

    # 2. 解析文本
    lines = [l.strip() for l in text.splitlines() if l.strip()]
    long_title = title or (lines[0] if lines else "封面标题")
    short_title = _short_title(long_title)

    # 引语：取非首行的文本
    body_lines = lines[1:] if len(lines) > 1 else []
    lead = " · ".join(body_lines[:3]) if body_lines else ""

    # 3. 构建多版式 HTML
    #    从模板中提取 CSS 和资源，构造包含 xhs / square / wide 三个 poster 的 HTML
    template_html = (template_dir / "index.html").read_text(encoding="utf-8")
    if not template_html:
        raise FileNotFoundError(f"Empty template: {template_dir / 'index.html'}")

    # 提取 <style>...</style> 和必要的 JS
    style_match = re.search(r'<style>(.*?)</style>', template_html, re.DOTALL)
    css = style_match.group(1) if style_match else ""

    # 提取字体链接
    font_links = re.findall(r'<link[^>]+fonts\.googleapis\.com[^>]+>', template_html)
    fonts_html = "\n".join(font_links)

    # 提取 WebGL JS (如果存在)
    webgl_match = re.search(r'<script[^>]*magazine-bg[^>]*>.*?</script>', template_html, re.DOTALL)
    webgl_js = webgl_match.group(0) if webgl_match else ""

    # 替换模板中的图片路径（从 cover-templates 的图片路径 → 实际 assets/images/ 路径）
    cover_img_match = re.search(r'<img[^>]+class="cover-img"[^>]+src="([^"]+)"', template_html)
    cover_img_src = cover_img_match.group(1) if cover_img_match else "../../images/01-old-photos.jpg"

    # 从模板目录解析图片路径到项目根
    template_images_dir = project_root / "public" / "images"
    cover_img_name = Path(cover_img_src).name  # e.g. "05-swing.jpg"
    cover_img_path = template_images_dir / cover_img_name
    if not cover_img_path.exists():
        # fallback to first available image
        available_imgs = sorted(template_images_dir.glob("*.jpg"))
        cover_img_path = available_imgs[0] if available_imgs else None

    cover_img_abs = cover_img_path.resolve().as_uri() if cover_img_path else ""

    # 解析用户指定图片，覆盖默认封面图
    def _resolve_img(key):
        if images and key in images:
            p = images[key]
            if os.path.isfile(p):
                return Path(p).resolve().as_uri()
        return ""

    xhs_img = _resolve_img("xhs") or cover_img_abs
    square_img = _resolve_img("square")
    wide_img = _resolve_img("wide") or cover_img_abs

    # 提取模板的背景色/主题 token
    theme_data = re.search(r'\[data-theme="([^"]+)"\]', template_html)
    theme_name = theme_data.group(1) if theme_data else "dune"

    # 4. 组装多版式 HTML
    multi_html = f"""<!doctype html>
<html lang="zh-CN" data-theme="{theme_name}">
<head>
<meta charset="utf-8">
<title>{long_title} — SuperSu</title>
<meta name="viewport" content="width=device-width,initial-scale=1">
{fonts_html}
<style>
*,*::before,*::after {{ box-sizing: border-box; }}
html, body {{ margin: 0; padding: 0; }}
body {{
  background: #1a1a1a;
  font-family: "Noto Serif SC", "Songti SC", serif;
  -webkit-font-smoothing: antialiased;
  padding: 48px 32px;
}}
.sheet {{
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 48px;
}}
{css}

/* ── 补充: square / wide 的独立样式 ── */
.poster.square {{
  width: 1080px; height: 1080px;
  background: var(--paper, #f0e6d2);
  color: var(--ink, #1f1a14);
  position: relative; overflow: hidden; isolation: isolate;
}}
.poster.wide {{
  width: 2100px; height: 900px;
  background: var(--paper, #f0e6d2);
  color: var(--ink, #1f1a14);
  position: relative; overflow: hidden; isolation: isolate;
}}
.poster.square .content {{ padding: 88px; width: 100%; height: 100%; position: relative; z-index: 2; }}
.poster.wide .content   {{ padding: 80px 120px; width: 100%; height: 100%; position: relative; z-index: 2; }}

/* Square 专用：大标题居中 */
.square-title {{
  font-family: "Noto Serif SC", serif;
  font-weight: 500;
  font-size: 88px;
  line-height: 1.15;
  letter-spacing: .04em;
  text-align: center;
  color: var(--ink, #1f1a14);
}}
/* Wide 专用：横版布局 */
.wide-layout {{
  display: grid;
  grid-template-columns: 1fr 1fr;
  gap: 80px;
  height: 100%;
  align-items: center;
}}
.wide-title {{
  font-family: "Noto Serif SC", serif;
  font-weight: 500;
  font-size: 96px;
  line-height: 1.10;
  letter-spacing: .03em;
  color: var(--ink, #1f1a14);
}}
.wide-sub {{
  font-family: "Noto Serif SC", serif;
  font-size: 32px;
  line-height: 1.45;
  color: var(--muted, #6f6557);
  margin-top: 24px;
}}
.wide-img {{
  width: 100%;
  height: 100%;
  object-fit: cover;
  border-radius: 4px;
}}

/* 补充覆盖：所有标题在暗图叠加层上可用 */
.poster .h-display, .square-title, .wide-title {{
  color: rgba(255,255,255,.94) !important;
}}
</style>
</head>
<body>
<main class="sheet">

  <!-- ===== XHS 3:4 Cover ===== -->
  <section class="poster xhs" id="xhs-cover">
    {f'<img class="cover-img" src="{xhs_img}" alt="cover">' if xhs_img else ''}
    <div class="img-overlay" style="position:absolute;inset:0;z-index:1;background:linear-gradient(180deg,rgba(0,0,0,.3) 0%,rgba(0,0,0,.5) 55%,rgba(0,0,0,.7) 100%);pointer-events:none;"></div>
    <div class="grain" style="position:absolute;inset:0;z-index:3;pointer-events:none;opacity:.25;mix-blend-mode:multiply;background-image:radial-gradient(rgba(0,0,0,.045) 1px,transparent 1px);background-size:3px 3px;"></div>
    <div class="inner-content stack gap-3" style="position:relative;z-index:4;display:flex;flex-direction:column;height:100%;justify-content:flex-end;padding:96px 88px;">
      <div class="issue-row" style="display:flex;align-items:center;gap:12px;font-family:monospace;font-size:20px;letter-spacing:.22em;color:rgba(255,255,255,.75);text-shadow:0 1px 3px rgba(0,0,0,.3);">
        <span>Vol. 01</span><span class="dot" style="width:5px;height:5px;border-radius:50%;background:rgba(255,255,255,.4);display:inline-block;"></span><span>{time.strftime('%Y.%m')}</span>
      </div>
      <div style="margin-top:40px;">
        <p class="kicker" style="font-family:monospace;font-size:21px;letter-spacing:.22em;color:rgba(255,255,255,.85);margin:0 0 24px;text-shadow:0 1px 3px rgba(0,0,0,.3);">封面 · Cover</p>
        <h1 class="h-display" style="font-weight:500;font-size:108px;line-height:1.10;letter-spacing:.04em;margin:0 0 20px;color:rgba(255,255,255,.95);text-shadow:0 2px 8px rgba(0,0,0,.3);">{long_title}</h1>
        <div class="accent-rule" style="width:48px;height:3px;background:var(--accent,#8f7650);margin-bottom:20px;opacity:.8;"></div>
        <p class="lead" style="font-size:28px;line-height:1.55;color:rgba(255,255,255,.85);margin:0;max-width:640px;text-shadow:0 1px 4px rgba(0,0,0,.3);">{lead}</p>
      </div>
      <div class="issue-strip" style="display:flex;align-items:center;gap:16px;font-family:monospace;font-size:17px;letter-spacing:.2em;color:rgba(255,255,255,.55);border-top:1px solid rgba(255,255,255,.25);padding-top:16px;margin-top:40px;">
        <span>SuperSu</span><span>·</span><span>小红书 3:4</span>
      </div>
    </div>
  </section>

  <!-- ===== WeChat 1:1 Square ===== -->
  <section class="poster square" id="wechat-square">
    <div class="grain"></div>
    <div class="content" style="display:flex;flex-direction:column;align-items:center;justify-content:center;text-align:center;">
      <p style="font-family:monospace;font-size:18px;letter-spacing:.2em;color:var(--muted,#6f6557);margin:0 0 32px;">公众号封面 · 1:1</p>
      <h1 class="square-title">{short_title}</h1>
      <div style="width:48px;height:3px;background:var(--accent,#8f7650);margin:32px auto 0;"></div>
      <p style="font-family:monospace;font-size:16px;letter-spacing:.15em;color:var(--muted,#6f6557);margin-top:40px;">SuperSu</p>
    </div>
  </section>

  <!-- ===== WeChat 21:9 Wide ===== -->
  <section class="poster wide" id="wechat-wide">
    <div class="grain"></div>
    <div class="content">
      <div class="wide-layout">
        <div>
          <p style="font-family:monospace;font-size:16px;letter-spacing:.2em;color:var(--muted,#6f6557);margin:0 0 20px;">公众号封面 · 21:9</p>
          <h1 class="wide-title">{long_title}</h1>
          <p class="wide-sub">{lead}</p>
          <div style="width:48px;height:3px;background:var(--accent,#8f7650);margin-top:28px;"></div>
        </div>
        <div>
          {f'<img class="wide-img" src="{wide_img}" alt="cover">' if wide_img else '<div class="wide-img" style="background:var(--paper-2,#ded0b7);display:flex;align-items:center;justify-content:center;color:var(--muted);">封面配图</div>'}
        </div>
      </div>
      <div style="position:absolute;bottom:40px;left:120px;right:120px;display:flex;align-items:center;gap:16px;font-family:monospace;font-size:15px;letter-spacing:.2em;color:var(--muted);border-top:1px solid var(--line,#ccc);padding-top:14px;">
        <span>SuperSu</span><span>·</span><span style="margin-left:auto;">微信 21:9</span>
      </div>
    </div>
  </section>

</main>
{webgl_js}
</body>
</html>"""

    # 5. 写出临时 HTML
    temp_html = template_dir / "_render_multi.html"
    temp_html.write_text(multi_html, encoding="utf-8")

    # 6. 单浏览器会话渲染所有版式
    results = {}
    try:
        with sync_playwright() as pw:
            chrome = _find_chrome()
            launch_opts = {"headless": True}
            if chrome:
                launch_opts["executable_path"] = chrome
            browser = pw.chromium.launch(**launch_opts)
            file_url = temp_html.as_uri()

            for board_type, spec in BOARD_SPECS.items():
                out_path = os.path.join(output_dir, f"{board_type}-01.png")
                context = browser.new_context(
                    viewport={"width": spec["width"], "height": spec["height"]},
                    device_scale_factor=device_scale_factor,
                )
                page = context.new_page()
                page.goto(file_url, wait_until="networkidle", timeout=30000)
                page.wait_for_load_state("networkidle")

                try:
                    page.wait_for_selector(spec["selector"], timeout=5000)
                except PwTimeout:
                    pass
                time.sleep(0.6)

                el = page.query_selector(spec["selector"])
                if el:
                    el.screenshot(path=out_path)
                else:
                    page.screenshot(path=out_path, full_page=False)

                logger.info("Saved %s (%dx%d)", out_path, spec["width"], spec["height"])
                results[board_type] = out_path
                context.close()

            browser.close()
    finally:
        if temp_html.exists():
            temp_html.unlink()

    # 返回格式与前端约定一致
    base = os.path.dirname(results["xhs"])
    return {
        "xhs": [results["xhs"]],
        "square": results["square"],
        "wide": results["wide"],
    }


def main():
    parser = argparse.ArgumentParser(description="Guizang-style social card renderer")
    parser.add_argument("text", help="Input text file (.txt)")
    parser.add_argument("-o", "--output", default="output/social", help="Output directory")
    parser.add_argument("-s", "--style", default="editorial",
                        choices=["editorial", "swiss"],
                        help="Template style prefix")
    parser.add_argument("-t", "--title", default="", help="Card title")
    parser.add_argument("--scale", type=float, default=1.0, help="Device scale factor (default 1.0)")
    args = parser.parse_args()

    if not os.path.exists(args.text):
        logger.error("Text file not found: %s", args.text)
        sys.exit(1)

    text = Path(args.text).read_text(encoding="utf-8")
    logger.info("Rendering %s cards from %s", args.style, args.text)
    result = render_social_cards(text, args.output, args.style, args.title, args.scale)

    print(f"\nRendered {len(result['xhs'])} XHS + 1 square + 1 wide")
    for p in result["xhs"]:
        print(f"  {p}")
    print(f"  {result['square']}")
    print(f"  {result['wide']}")


if __name__ == "__main__":
    main()
