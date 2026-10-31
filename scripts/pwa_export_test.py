#!/usr/bin/env python3
"""PWA 导出专项测试（方案 B1 · 出口三件套）：长图 PNG / HTML 文件 / Markdown。

设计原则：
- **有头**：系统 Chrome（core.browser_utils.launch_browser），与其它 PWA 套件一致。
- **自起静态服务**：服务 pwa/dist（构建产物），不依赖外部站点；端口被占直接 ABORT。
- **真的下载文件**：用 Playwright 的 expect_download 抓真实下载，校验内容/尺寸，不是只点按钮。

用法：
    .venv/Scripts/python.exe scripts/pwa_export_test.py
    .venv/Scripts/python.exe scripts/pwa_export_test.py --port 8087

产物：output/export-check/（下载文件 + 截图）
"""

from __future__ import annotations

import argparse
import functools
import http.server
import socket
import socketserver
import struct
import sys
import threading
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
DIST = ROOT / "pwa" / "dist"
OUT = ROOT / "output" / "export-check"
sys.path.insert(0, str(ROOT))

results: list[tuple[str, bool, str]] = []


def check(name: str, ok: bool, detail: str = "") -> None:
    results.append((name, bool(ok), detail))
    print(("  PASS  " if ok else "  FAIL  ") + name + (f"  | {detail}" if detail else ""), flush=True)


class _Handler(http.server.SimpleHTTPRequestHandler):
    def log_message(self, *args):  # 静默
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
    ap.add_argument("--port", type=int, default=8087)
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

    errors: list[str] = []
    try:
        with sync_playwright() as p:
            browser = launch_browser(p, headless=True, args=["--no-proxy-server"])
            ctx = browser.new_context(viewport={"width": 1360, "height": 900}, accept_downloads=True)
            page = ctx.new_page()
            page.on("pageerror", lambda e: errors.append(str(e)))
            # 网络层 404 是「坏图」用例故意造的，浏览器会记一条 console error；只滤这一种，JS 异常照旧算失败
            page.on("console", lambda m: errors.append(m.text)
                    if m.type == "error" and not m.text.startswith("Failed to load resource") else None)

            page.goto(url, wait_until="domcontentloaded", timeout=60000)
            # 等引擎就绪（必须先有内容；线上首访 Pyodide ~40MB，给足超时）
            wait_engine_ready(page)
            page.click("#btn-demo")   # 看示例：写入 297 字样例
            page.wait_for_function("() => !document.getElementById('btn-copy').disabled", timeout=60000)

            check("导出入口存在", page.is_visible("#btn-export"))
            page.click("#btn-export")
            page.wait_for_timeout(250)
            # 可见项恒为 4（长图/HTML/MD/ZIP）；第 5 项「推送草稿箱」是高级功能，
            # 只有配置公众号推送后才解锁（2026-10-31 门控），未配置必须保持隐藏
            items = page.locator("#menu-export button[data-exp]:visible").count()
            check("导出菜单可见项 4（推送项未解锁）", items == 4, f"{items} 项")
            check("推送项存在但默认隐藏", page.locator("#btn-push").count() == 1 and page.is_hidden("#btn-push"))
            page.keyboard.press("Escape")
            page.wait_for_timeout(150)
            check("Esc 关闭导出菜单", page.is_hidden("#menu-export"))

            def grab(sel: str, ext: str):
                with page.expect_download(timeout=120000) as di:
                    page.click("#btn-export")
                    page.wait_for_timeout(220)
                    page.click(sel)
                d = di.value
                path = OUT / f"out.{ext}"
                d.save_as(str(path))
                return path, d.suggested_filename

            # ① Markdown
            md_path, md_name = grab("button[data-exp='md']", "md")
            md = md_path.read_text(encoding="utf-8")
            check("Markdown 导出成功", md_path.stat().st_size > 100 and "周末去海边" in md,
                  f"{md_name} · {md_path.stat().st_size} B")

            # ② HTML
            html_path, html_name = grab("button[data-exp='html']", "html")
            h = html_path.read_text(encoding="utf-8")
            check("HTML 导出且自包含",
                  "<!DOCTYPE html>" in h and 'class="supersu-doc"' in h and "周末去海边" in h,
                  f"{html_name} · {html_path.stat().st_size} B")

            # ③ 长图
            png_path, png_name = grab("button[data-exp='long']", "png")
            raw = png_path.read_bytes()
            is_png = raw[:8] == b"\x89PNG\r\n\x1a\n"
            w = hgt = 0
            if is_png:
                w, hgt = struct.unpack(">II", raw[16:24])
            check("长图是真 PNG 且定宽 1080",
                  is_png and w == 1080 and 200 < hgt < 20000,
                  f"{png_name} · {len(raw) // 1024} KB · {w}x{hgt}")

            # ④ 批量导出图片（B2 #20）：无图 → 明确提示；有图 → ZIP 内真实图片
            page.click("#btn-export")
            page.wait_for_timeout(220)
            page.click("button[data-exp='images']")
            page.wait_for_function(
                "() => document.getElementById('toast').textContent.includes('没有图片')", timeout=20000)
            check("无图时明确提示", "正文里没有图片" in page.inner_text("#toast"),
                  page.inner_text("#toast")[:80])

            good = f"{url}brand/logo-64.png"
            bad = f"{url}missing.png"
            page.fill("#input", f"# 批量图片测试\n\n![好图]({good})\n\n![坏图]({bad})\n\n正文。\n")
            page.wait_for_function(
                "() => !document.getElementById('img-tip').hidden", timeout=60000)

            with page.expect_download(timeout=120000) as di_img:
                page.click("#btn-export")
                page.wait_for_timeout(220)
                page.click("button[data-exp='images']")
            z = di_img.value
            zpath = OUT / "images.zip"
            z.save_as(str(zpath))
            check("图片 ZIP 下载成功", zpath.stat().st_size > 100 and z.suggested_filename.endswith(".zip"),
                  f"{z.suggested_filename} · {zpath.stat().st_size} B")

            import zipfile

            with zipfile.ZipFile(zpath) as zf:
                names = zf.namelist()
                raw = zf.read(names[0]) if names else b""
            check("ZIP 内含取到的图（失败图被跳过）",
                  len(names) == 1 and names[0] == "img-01.png" and raw[:8] == b"\x89PNG\r\n\x1a\n",
                  f"{names} · {len(raw)} B")

            page.wait_for_function(
                "() => document.getElementById('toast').textContent.includes('跳过')", timeout=20000)
            t = page.inner_text("#toast")
            check("跳过的图说明原因", "404" in t and "跳过" in t, t[:100])

            # 移动端：多一个顶栏按钮后不能出现横向溢出
            m = ctx.new_page()
            m.set_viewport_size({"width": 390, "height": 844})
            m.goto(url, wait_until="domcontentloaded", timeout=60000)
            m.wait_for_timeout(1200)
            sw, iw = m.evaluate("() => [document.documentElement.scrollWidth, window.innerWidth]")
            check("移动端顶栏无横向溢出", sw <= iw, f"scrollWidth={sw} / innerWidth={iw}")

            check("无 JS 控制台报错", not errors, errors[0][:120] if errors else "")
            browser.close()
    finally:
        srv.shutdown()

    passed = sum(1 for _, ok, _ in results if ok)
    total = len(results)
    print("\n" + "=" * 56)
    print(f"PWA 导出专项：{passed}/{total} 通过")
    print(f"产物：{OUT}")
    return 0 if passed == total else 1


if __name__ == "__main__":
    raise SystemExit(main())
