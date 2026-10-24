#!/usr/bin/env python3
"""PWA 外链图本地化专项测试（方案 B2 · #6）。

范围（与产品承诺严格对齐）：
- 导出链路：外链图被抓取并内嵌成 data URI（HTML 文件里可校验）。
- 复制链路：公众号只认自家图床，**不承诺 data URI 可直贴**；UI 必须如实提示。
- 失败不静默：抓不到（404 / 跨域 / 超时）必须写原因，且保留原 URL。

确定性：
- 测试图用**同源**地址（服务 pwa/dist 的 /brand/logo-64.png），不依赖外网；
- 失败用同源 404（/missing.png），避免网络波动造成假失败。

用法：
    .venv/Scripts/python.exe scripts/pwa_image_localize_test.py
    .venv/Scripts/python.exe scripts/pwa_image_localize_test.py --port 8089

产物：output/image-check/
"""

from __future__ import annotations

import argparse
import functools
import http.server
import socket
import socketserver
import sys
import threading
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
DIST = ROOT / "pwa" / "dist"
OUT = ROOT / "output" / "image-check"
sys.path.insert(0, str(ROOT))

results: list[tuple[str, bool, str]] = []


def check(name: str, ok: bool, detail: str = "") -> None:
    results.append((name, bool(ok), detail))
    print(("  PASS  " if ok else "  FAIL  ") + name + (f"  | {detail}" if detail else ""), flush=True)


class _Handler(http.server.SimpleHTTPRequestHandler):
    def log_message(self, *args):
        pass


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
    ap.add_argument("--port", type=int, default=8089)
    args = ap.parse_args()

    if not (DIST / "index.html").exists():
        print("ERROR: pwa/dist 不存在，先跑 node pwa/scripts/build.mjs", file=sys.stderr)
        return 2
    if port_busy(args.port):
        print(f"ERROR: 端口 {args.port} 被占用 —— 换 --port 或先停掉占用进程", file=sys.stderr)
        return 2

    OUT.mkdir(parents=True, exist_ok=True)
    srv = socketserver.ThreadingTCPServer(("127.0.0.1", args.port), functools.partial(_Handler, directory=str(DIST)))
    srv.daemon_threads = True
    srv.request_queue_size = 64
    threading.Thread(target=srv.serve_forever, daemon=True).start()
    url = f"http://127.0.0.1:{args.port}/"

    from playwright.sync_api import sync_playwright
    from core.browser_utils import launch_browser
    from core.pwa_test_utils import wait_engine_ready

    page_errors: list[str] = []
    try:
        with sync_playwright() as p:
            browser = launch_browser(p, headless=True, args=["--no-proxy-server"])
            ctx = browser.new_context(viewport={"width": 1360, "height": 900}, accept_downloads=True)
            page = ctx.new_page()
            page.on("pageerror", lambda e: page_errors.append(str(e)))

            page.goto(url, wait_until="domcontentloaded", timeout=60000)
            # 等引擎就绪（必须先有内容；线上首访 Pyodide ~40MB，给足超时）
            wait_engine_ready(page)

            ok_img = f"{url}brand/logo-64.png"
            bad_img = f"{url}missing.png"
            text = f"# 外链图测试\n\n![正常图]({ok_img})\n\n![坏图]({bad_img})\n\n正文。\n"
            page.fill("#input", text)
            page.wait_for_selector("#img-tip:not([hidden])", timeout=60000)
            tip = page.inner_text("#img-tip-text")
            check("渲染后出现外链图提示条", "2 张外链图" in tip, tip[:120])
            check("提示条如实说明公众号直贴不显示", "公众号直贴不会显示" in tip, tip[:120])

            # ① 直接导出 HTML：应自动抓图并内嵌（导出链路真可用）
            with page.expect_download(timeout=120000) as di:
                page.click("#btn-export")
                page.wait_for_timeout(220)
                page.click("button[data-exp='html']")
            path = OUT / "with-images.html"
            di.value.save_as(str(path))
            html = path.read_text(encoding="utf-8")

            check("HTML 导出自动内嵌正常图", "data:image/png;base64" in html, f"{path.stat().st_size} B")
            check("抓取失败的图保留原 URL（不伪造占位）", bad_img in html)
            check("导出 HTML 未残留正常图的外链", ok_img not in html)

            page.wait_for_timeout(400)
            tip2 = page.inner_text("#img-tip-text")
            check("失败原因写进提示条（HTTP 404）", "HTTP 404" in tip2 and "仍有 1 张" in tip2, tip2[:140])

            # ② 手动点「本地化图片」（重试剩余）：失败仍明确报错
            if page.is_visible("#btn-localize"):
                page.click("#btn-localize")
                page.wait_for_timeout(800)
                tip3 = page.inner_text("#img-tip-text")
                check("重试失败仍给出原因", "404" in tip3, tip3[:140])
            else:
                check("重试按钮可用", False, "按钮不可见")

            # ③ 清空：提示条必须消失
            page.fill("#input", "")
            page.wait_for_timeout(900)
            check("清空内容后提示条隐藏", page.is_hidden("#img-tip"))

            # ④ 纯文字（无图）：不出现提示条
            page.fill("#input", "# 只有文字\n\n这是一段没有任何图片的正文。\n")
            page.wait_for_timeout(1200)
            check("无外链图时不打扰", page.is_hidden("#img-tip"))

            # ⑤ 移动端：提示条不能把页面撑出横向滚动
            page.set_viewport_size({"width": 390, "height": 844})
            page.fill("#input", text)
            page.wait_for_function(
                "() => !document.getElementById('img-tip').hidden",
                timeout=60000,
            )
            page.click("#tabs button[data-tab='preview']")   # 移动端预览独立成页
            page.wait_for_selector("#img-tip", state="visible", timeout=10000)
            sw, iw = page.evaluate("() => [document.documentElement.scrollWidth, window.innerWidth]")
            check("移动端提示条无横向溢出", sw <= iw, f"scrollWidth={sw} / innerWidth={iw}")

            check("无未捕获 JS 异常", not page_errors, page_errors[0][:120] if page_errors else "")
            browser.close()
    finally:
        srv.shutdown()

    passed = sum(1 for _, ok, _ in results if ok)
    total = len(results)
    print("\n" + "=" * 56)
    print(f"PWA 外链图本地化：{passed}/{total} 通过")
    print(f"产物：{OUT}")
    return 0 if passed == total else 1


if __name__ == "__main__":
    raise SystemExit(main())
