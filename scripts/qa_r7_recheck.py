#!/usr/bin/env python3
"""R7 正确复核（2026-10-30）：更新记录面板到底能不能用。

上一轮 qa_round2 的 R7 FAIL 已确认是测试写错：
  · 更新记录面板 #cl-layer 挂在 document.body，不在 #update-root
  · #update-root 里只有 ui.js 注入的静态模板（按钮 + 空卡片），
    读它的 innerText 当然只有「更新记录」4 个字
  · 面板要打开，必须先等 SW 接管 + #btn-update 去掉 hidden

本脚本按项目现有 pwa_update_panel_test.py 的正确姿势重做一遍，
只验证「用户点「更多 → 更新记录」能不能看到真实更新记录」。

用法：
    .venv/Scripts/python.exe scripts/qa_r7_recheck.py --port 8075
"""

from __future__ import annotations

import argparse
import functools
import http.server
import json
import socket
import socketserver
import sys
import threading
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
DIST = ROOT / "pwa" / "dist"
OUT = ROOT / "output" / "qa-r7"
sys.path.insert(0, str(ROOT))


class _H(http.server.SimpleHTTPRequestHandler):
    def log_message(self, *a):
        pass


def port_busy(p):
    with socket.socket() as s:
        s.settimeout(0.4)
        return s.connect_ex(("127.0.0.1", p)) == 0


def main() -> int:
    try:
        sys.stdout.reconfigure(encoding="utf-8", errors="replace")
    except Exception:
        pass
    ap = argparse.ArgumentParser()
    ap.add_argument("--port", type=int, default=8075)
    args = ap.parse_args()
    if port_busy(args.port):
        print(f"ERROR: 端口 {args.port} 被占用", file=sys.stderr)
        return 2

    OUT.mkdir(parents=True, exist_ok=True)
    srv = socketserver.ThreadingTCPServer(
        ("127.0.0.1", args.port), functools.partial(_H, directory=str(DIST)))
    srv.daemon_threads = True
    threading.Thread(target=srv.serve_forever, daemon=True).start()
    url = f"http://127.0.0.1:{args.port}/"

    from playwright.sync_api import sync_playwright
    from core.browser_utils import launch_browser

    info = {}
    try:
        with sync_playwright() as p:
            b = launch_browser(p, headless=True)
            ctx = b.new_context(viewport={"width": 1440, "height": 900})
            page = ctx.new_page()
            errs = []
            page.on("pageerror", lambda e: errs.append(str(e)[:200]))

            page.goto(url, wait_until="domcontentloaded", timeout=90_000)
            # 等 SW 接管（更新入口依赖它）
            try:
                page.wait_for_function("() => !!navigator.serviceWorker.controller", timeout=45_000)
                print("[R7] SW 已接管", flush=True)
            except Exception:
                print("[R7] SW 未接管（可能首次装），继续尝试", flush=True)
            page.reload(wait_until="domcontentloaded")
            try:
                page.wait_for_selector("#btn-update:not([hidden])", timeout=45_000)
                print("[R7] #btn-update 已显形", flush=True)
                info["btn_visible"] = True
            except Exception as e:
                print(f"[R7] #btn-update 未显形：{e}", flush=True)
                info["btn_visible"] = False

            # 直接点入口按钮（最接近用户的路径）
            opened = False
            if info["btn_visible"]:
                page.click("#btn-update")
                try:
                    page.wait_for_selector("#cl-panel:not([hidden])", timeout=15_000)
                    opened = True
                except Exception as e:
                    print(f"[R7] 面板未打开：{e}", flush=True)

            # 退一步：走「更多 → 更新记录」菜单路径
            if not opened:
                page.keyboard.press("Escape")
                page.wait_for_timeout(400)
                page.click("#btn-more")
                page.wait_for_timeout(300)
                page.click("#menu button[data-act='update']")
                page.wait_for_timeout(2500)
                try:
                    page.wait_for_selector("#cl-panel:not([hidden])", timeout=15_000)
                    opened = True
                except Exception:
                    pass

            info["panel_opened"] = opened
            if opened:
                page.wait_for_timeout(2000)
                content = page.evaluate("""() => {
                    const layer = document.getElementById('cl-layer');
                    const panel = document.getElementById('cl-panel');
                    const status = document.getElementById('cl-status');
                    return {
                      layerExists: !!layer,
                      panelVisible: panel ? panel.offsetParent !== null : false,
                      statusText: status ? status.textContent.trim().replace(/\\s+/g,' ') : '',
                      textLen: layer ? (layer.innerText||'').length : 0,
                      textHead: layer ? (layer.innerText||'').slice(0, 300) : '',
                      versionEntries: layer ? layer.querySelectorAll('.cl-ver, .cl-entry, [data-ver]').length : 0
                    };
                }""")
                info.update(content)
                print("[R7] 面板内容：", json.dumps(content, ensure_ascii=False)[:600], flush=True)
                page.screenshot(path=str(OUT / "panel.png"))
                page.click("#cl-close") if page.locator("#cl-close").count() else None
            info["errors"] = errs
            ctx.close()
            b.close()
    finally:
        srv.shutdown()
        srv.server_close()

    (OUT / "r7.json").write_text(json.dumps(info, ensure_ascii=False, indent=2), encoding="utf-8")
    print(f"\n明细：{(OUT / 'r7.json').relative_to(ROOT)}")
    return 0


if __name__ == "__main__":
    sys.exit(main())
