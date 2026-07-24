#!/usr/bin/env python3
"""Generate social card thumbnails from guizang seed templates.

Uses Playwright to render the actual Editorial/Swiss templates at a
smaller scale, producing faithful thumbnails that match the final output.
"""

import os
import sys
import logging
from pathlib import Path
from playwright.sync_api import sync_playwright

logging.basicConfig(level=logging.INFO, format="%(asctime)s [%(levelname)s] %(message)s")
logger = logging.getLogger("gen_thumbnails")

THUMB_DIR = Path(__file__).resolve().parent.parent / "public" / "social-thumb"
COVER_DIR = Path(__file__).resolve().parent.parent / "public" / "cover-templates"

THUMB_W = 360
THUMB_H = 480


def _find_chrome() -> str | None:
    """查找可用的 Chrome 可执行文件"""
    candidates = [
        os.environ.get("CHROME_PATH", ""),
        r"C:\Program Files\Google\Chrome\Application\chrome.exe",
        r"C:\Program Files (x86)\Google\Chrome\Application\chrome.exe",
    ]
    for cp in candidates:
        if cp and os.path.isfile(cp):
            return cp
    return None


def generate_thumb(template_dir: Path, name: str, out_path: str) -> bool:
    """从归藏 cover-template 目录生成缩略图"""
    index_html = template_dir / "index.html"
    if not index_html.exists():
        logger.warning("Template not found: %s", index_html)
        return False

    with sync_playwright() as pw:
        chrome = _find_chrome()
        launch_opts = {"headless": True}
        if chrome:
            launch_opts["executable_path"] = chrome

        browser = pw.chromium.launch(**launch_opts)
        context = browser.new_context(
            viewport={"width": THUMB_W, "height": THUMB_H},
            device_scale_factor=1.0,
        )
        page = context.new_page()

        # 用 file:// URL 加载，保证所有资源（图片/WebGL/CSS）正确解析
        file_url = index_html.as_uri()
        page.goto(file_url, wait_until="networkidle", timeout=30000)
        page.wait_for_load_state("networkidle")

        try:
            page.wait_for_selector(".poster", timeout=5000)
        except Exception:
            pass

        page.screenshot(path=out_path, full_page=False)
        browser.close()

    logger.info("Generated thumbnail: %s", out_path)
    return True


def main():
    THUMB_DIR.mkdir(parents=True, exist_ok=True)

    # 自动发现 assets/cover-templates/ 下所有模板目录
    if not COVER_DIR.exists():
        logger.error("Cover templates directory not found: %s", COVER_DIR)
        sys.exit(1)

    template_dirs = sorted(d for d in COVER_DIR.iterdir() if d.is_dir() and (d / "index.html").exists())
    ok = 0
    for td in template_dirs:
        name = td.name
        out_path = THUMB_DIR / f"{name}.png"
        if generate_thumb(td, name, str(out_path)):
            ok += 1

    logger.info("Generated %d/%d thumbnails in %s", ok, len(template_dirs), THUMB_DIR)


if __name__ == "__main__":
    main()
