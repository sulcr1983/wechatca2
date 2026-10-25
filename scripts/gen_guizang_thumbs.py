"""为归藏两套（editorial / swiss）生成真实缩略图。

背景：这两套在 catalog 里没有 thumb，界面上是用 swatch+accent 拼的斜切色块，
用户点之前看到的不是真实封面。补上真实预览图（2026-10-25）。

用法：.venv/Scripts/python.exe scripts/gen_guizang_thumbs.py
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
PORT = 8232
STYLES = ["editorial", "swiss"]
TEXT = "周末去海边\n\n两天的沉默之后，我重新听见了海浪。"


class Quiet(http.server.SimpleHTTPRequestHandler):
    def log_message(self, *a):
        pass


def main() -> int:
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
                pg.click(".cv-tab[data-tab='style']")
                pg.wait_for_timeout(220)
                pg.click(f"[data-style='{sid}']")
                pg.wait_for_timeout(320)
                pg.click("#cv-gen")
                try:
                    # 归藏一次出 3 个尺寸，取第一张（3:4）
                    pg.wait_for_function(
                        "document.querySelectorAll('.cv-card').length === 3", timeout=60000)
                    pg.wait_for_timeout(700)
                    # 缩略图在 UI 里是 132x78 的窄条（≈1.69:1）。若直接存 3:4 整图，
                    # object-fit:cover 只会露出中间一条，归藏的标题在版面下半部 →
                    # 看起来是一张空白纸。这里直接按 1.69:1 裁标题区（y 720~1360，
                    # 1080x640 正好 1.69），缩略图里就能看到标题。
                    data_url = pg.evaluate(
                        """() => {
                            const img = document.querySelector('.cv-card img');
                            const S = img.naturalWidth / 1080;   // 原图缩放比
                            const cv = document.createElement('canvas');
                            cv.width = 300; cv.height = 178;
                            const c = cv.getContext('2d');
                            c.imageSmoothingQuality = 'high';
                            c.drawImage(img, 0, 720 * S, 1080 * S, 640 * S, 0, 0, 300, 178);
                            return cv.toDataURL('image/png');
                        }""")
                    raw = base64.b64decode(data_url.split(",", 1)[1])
                    (OUT / f"{sid}.png").write_bytes(raw)
                    print(f"  ✅ {sid:<12} {len(raw) / 1024:.0f}KB")
                    ok += 1
                except Exception as e:  # noqa: BLE001
                    print(f"  ⛔ {sid:<12} {type(e).__name__}: {e}")
            b.close()
    finally:
        srv.shutdown()
    print(f"\n完成 {ok}/{len(STYLES)}")
    return 0 if ok == len(STYLES) else 1


if __name__ == "__main__":
    raise SystemExit(main())
