"""按当前渲染结果重生成 10 套模板的缩略图（public/social-thumb/*.png）。

背景（2026-10-25）：缩略图是 10-24 用「深底 + 真实照片」时代截的图。
后来改成「纯色纸底 + 墨字」模式，缩略图没跟着更新 →
用户在左侧看到的是黑底带照片的旧图，点进去生成的是浅纸封面，完全对不上。

做法：本地起 dist、逐套生成 3:4 封面，在浏览器里压到 300×400 存 PNG。
只跑一次，产物入库（构建流程不依赖 Playwright）。

用法：.venv/Scripts/python.exe scripts/gen_cover_thumbs.py
"""
import base64
import functools
import http.server
import socketserver
import sys
import threading
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
sys.path.insert(0, str(ROOT))

from playwright.sync_api import sync_playwright  # noqa: E402

from core.browser_utils import launch_browser  # noqa: E402
from core.pwa_test_utils import wait_engine_ready  # noqa: E402

DIST = ROOT / "pwa" / "dist"
OUT = ROOT / "public" / "social-thumb"
PORT = 8231

STYLES = [
    "editorial-ink-classic", "editorial-dune", "editorial-kraft-paper",
    "editorial-forest-ink", "editorial-indigo-porcelain", "editorial-midnight-ink",
    "swiss-ikb", "swiss-lemon-green", "swiss-lemon-yellow", "swiss-safety-orange",
]

TEXT = "周末去海边\n\n两天的沉默之后，我重新听见了海浪。"


class Quiet(http.server.SimpleHTTPRequestHandler):
    def log_message(self, *a):
        pass


def main() -> int:
    if not DIST.exists():
        print("dist 不存在，先跑 pwa/scripts/build.mjs")
        return 1
    OUT.mkdir(parents=True, exist_ok=True)

    srv = socketserver.ThreadingTCPServer(
        ("127.0.0.1", PORT), functools.partial(Quiet, directory=str(DIST)))
    srv.daemon_threads = True
    threading.Thread(target=srv.serve_forever, daemon=True).start()

    ok = 0
    try:
        with sync_playwright() as p:
            b = launch_browser(p, headless=True, args=["--no-proxy-server"])
            pg = b.new_context(viewport={"width": 1400, "height": 950}).new_page()
            pg.goto(f"http://127.0.0.1:{PORT}/", wait_until="domcontentloaded", timeout=60000)
            wait_engine_ready(pg)
            pg.wait_for_timeout(1200)
            pg.click("#btn-cover")
            pg.wait_for_timeout(1200)
            pg.fill("#cv-text", TEXT)
            pg.fill("#cv-author", "阿苏")

            for sid in STYLES:
                pg.wait_for_timeout(220)
                pg.click(f".cv-style[data-style='{sid}']")
                pg.wait_for_timeout(320)
                pg.click("#cv-gen")
                try:
                    pg.wait_for_function(
                        "document.querySelectorAll('.cv-card').length === 1", timeout=60000)
                    pg.wait_for_timeout(650)
                    # 在页面里把生成图压到 300×400（缩略图统一用这个尺寸）
                    data_url = pg.evaluate(
                        """() => {
                            const img = document.querySelector('.cv-card img');
                            const cv = document.createElement('canvas');
                            cv.width = 300; cv.height = 400;
                            const c = cv.getContext('2d');
                            c.imageSmoothingQuality = 'high';
                            c.drawImage(img, 0, 0, 300, 400);
                            return cv.toDataURL('image/png');
                        }""")
                    raw = base64.b64decode(data_url.split(",", 1)[1])
                    dst = OUT / f"{sid}.png"
                    dst.write_bytes(raw)
                    print(f"  ✅ {sid:<28} {len(raw) / 1024:.0f}KB")
                    ok += 1
                except Exception as e:  # noqa: BLE001
                    print(f"  ⛔ {sid:<28} {type(e).__name__}: {e}")
            b.close()
    finally:
        srv.shutdown()

    print(f"\n完成 {ok}/{len(STYLES)}")
    return 0 if ok == len(STYLES) else 1


if __name__ == "__main__":
    raise SystemExit(main())
