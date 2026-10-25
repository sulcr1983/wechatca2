#!/usr/bin/env python3
"""生成 PWA 封面页空态示例图（U-9，2026-10-24）。

用 PWA 自己的封面管线（modern-screenshot，无后端）渲染 3 个代表性风格的成品，
转 JPG 存 pwa/public/samples/，构建时进 dist；封面面板空态展示它们，
点一张 = 选中该风格 + 光标落到文案框（首屏就知道成品长什么样、怎么开始）。

换示例：改下面 SAMPLES 列表重跑本脚本即可（需先 build 过一次 dist）。

用法：
    .venv/Scripts/python.exe scripts/gen_cover_samples.py
"""

from __future__ import annotations

import argparse
import functools
import http.server
import io
import socket
import socketserver
import sys
import threading
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
DIST = ROOT / "pwa" / "dist"
OUT = ROOT / "pwa" / "public" / "samples"
sys.path.insert(0, str(ROOT))

# (风格 id, 文案) —— 覆盖三个观感：归藏杂志 / 暖纸模板 / 暗底模板
SAMPLES = [
    ("editorial", "把生活过成一首慢诗\n\n不赶路，只感受"),
    ("editorial-dune", "周末去海边\n\n放空一下，咸咸的风"),
    ("editorial-midnight-ink", "深夜书房\n\n一盏灯，一杯茶，一段安静时光"),
]


def port_busy(port: int) -> bool:
    with socket.socket() as s:
        s.settimeout(0.4)
        return s.connect_ex(("127.0.0.1", port)) == 0


def main() -> int:
    try:
        sys.stdout.reconfigure(encoding="utf-8", errors="replace")
    except Exception:
        pass

    ap = argparse.ArgumentParser()
    ap.add_argument("--port", type=int, default=8095)
    args = ap.parse_args()

    if not (DIST / "index.html").exists():
        print("ERROR: pwa/dist 不存在，先跑 node pwa/scripts/build.mjs", file=sys.stderr)
        return 2
    if port_busy(args.port):
        print(f"ERROR: 端口 {args.port} 被占用 —— 换 --port", file=sys.stderr)
        return 2

    from playwright.sync_api import sync_playwright
    from core.browser_utils import launch_browser
    from PIL import Image

    OUT.mkdir(parents=True, exist_ok=True)
    srv = socketserver.ThreadingTCPServer(("127.0.0.1", args.port),
                                          functools.partial(http.server.SimpleHTTPRequestHandler,
                                                            directory=str(DIST)))
    srv.daemon_threads = True
    threading.Thread(target=srv.serve_forever, daemon=True).start()
    url = f"http://127.0.0.1:{args.port}/"

    ok = True
    try:
        with sync_playwright() as p:
            browser = launch_browser(p, headless=True, args=["--no-proxy-server"])
            ctx = browser.new_context(viewport={"width": 1360, "height": 900})
            page = ctx.new_page()
            page.goto(url, wait_until="domcontentloaded", timeout=60000)
            page.wait_for_selector("#btn-cover", timeout=30000)
            page.click("#btn-cover")
            page.wait_for_selector("#cover-root:not([hidden])", timeout=15000)

            for style_id, text in SAMPLES:
                # 2026-10-25 改版：左栏分成 4 个标签，非当前标签内的控件是 hidden，
                # 直接 fill/click 会超时。操作前先切到对应标签。
                page.click(".cv-tab[data-tab='content']")
                page.wait_for_timeout(120)
                page.fill("#cv-text", text)
                page.wait_for_timeout(150)
                page.click(".cv-tab[data-tab='style']")
                page.wait_for_timeout(120)
                page.locator(f".cv-style[data-style='{style_id}']").click()
                page.wait_for_timeout(150)
                page.click("#cv-gen")
                page.wait_for_function(
                    "document.querySelectorAll('.cv-card img').length >= 1"
                    " && document.querySelector('.cv-card img').naturalWidth > 0",
                    timeout=120000)
                page.wait_for_timeout(400)
                with page.expect_download() as dl_info:
                    page.locator("a.cv-dl").first.click()
                png = dl_info.value.path()
                img = Image.open(png).convert("RGB")
                buf = io.BytesIO()
                img.save(buf, "JPEG", quality=85, optimize=True)
                target = OUT / f"cover-sample-{style_id}.jpg"
                target.write_bytes(buf.getvalue())
                print(f"  ✓ {target.name}  {img.width}x{img.height}  {len(buf.getvalue())//1024}KB")
    except Exception as e:
        print(f"ERROR: {e}", file=sys.stderr)
        ok = False
    finally:
        try:
            browser.close()
        except Exception:
            pass
        srv.shutdown()

    print("完成：3 张示例已入 pwa/public/samples/（记得跑 node pwa/scripts/build.mjs 进 dist）" if ok
          else "失败：未生成完整示例")
    return 0 if ok else 1


if __name__ == "__main__":
    sys.exit(main())
