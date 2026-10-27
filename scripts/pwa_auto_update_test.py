#!/usr/bin/env python
"""PWA「静默自动更新」专项验证（本地 dist，有头）

用户要求（2026-10-24）：
  后台检查到更新 → **自动完成升级**（不弹大卡片、不要用户点「立即更新」）
  → 升级完成后只在右下角弹小提示「已升级到 vX · bN」，几秒后自动消失。

验证手段（真 SW，不 mock）：
  1. 把 pwa/dist 拷到 output/auto-update-probe，起本地静态服务；
  2. 首次加载装好 SW，再 reload 让页面受控；
  3. **改写探针目录里的 sw.js（BUILD_ID）** → 浏览器视为新版本 → 自动应用并 reload；
  4. 断言：全程没有出现大卡片 `#upd-card`；reload 后出现 `#upd-done` 小提示，
     文案含「已升级到 v」；小提示点开更新记录；8 秒后自动消失。
"""
import functools
import http.server
import json
import re
import shutil
import tempfile
import socketserver
import sys
import threading
import time
from pathlib import Path

from playwright.sync_api import sync_playwright

try:
    sys.stdout.reconfigure(encoding="utf-8", errors="replace")
except Exception:
    pass

ROOT = Path(__file__).resolve().parents[1]
DIST = ROOT / "pwa" / "dist"
# 探针是整份 pwa/dist 的副本（约 22MB / 444 个文件）。
# 放系统临时目录，而不是 output/ —— 放 output 里既占仓库空间，
# 又因为"不能批量删"（见下方拷贝处注释）而只能一直留着。tempfile 由系统回收。
PROBE = Path(tempfile.gettempdir()) / "supersu-auto-update-probe"
SHOTS = ROOT / "output" / "auto-update"
results = []


def check(name, ok, detail=""):
    results.append((name, ok, detail))
    print(f"[{'PASS' if ok else 'FAIL'}] {name}" + (f" — {detail}" if detail else ""))


class QuietHandler(http.server.SimpleHTTPRequestHandler):
    def log_message(self, *args):   # 静默：测试输出只留断言
        pass


def start_server(directory):
    handler = functools.partial(QuietHandler, directory=str(directory))
    srv = socketserver.ThreadingTCPServer(("127.0.0.1", 0), handler)
    srv.daemon_threads = True
    port = srv.server_address[1]
    threading.Thread(target=srv.serve_forever, daemon=True).start()
    return srv, port



def main():
    if not (DIST / "index.html").exists():
        print("ERROR: pwa/dist 不存在，先跑 node pwa/scripts/build.mjs")
        return 2

    # ⚠️ 这里**故意不删**探针目录（2026-10-27）：
    #    探针是整份 pwa/dist（约 444 个文件），无论一次性 rmtree 还是逐个 unlink，
    #    都会撞上执行环境的「累计删除」保护（阈值 50）——表现为 8 项断言全 PASS、
    #    但进程退出码非 0，门禁把这一套判成 FAIL。
    #    改成覆盖式拷贝：不产生任何删除操作，且 dist 的新内容仍会盖旧内容。
    #    （残留的旧文件对探针无影响：预缓存清单来自 sw.js，每次都会被覆盖。）
    shutil.copytree(DIST, PROBE, dirs_exist_ok=True)
    SHOTS.mkdir(parents=True, exist_ok=True)

    srv, port = start_server(PROBE)
    url = f"http://127.0.0.1:{port}/"
    print(f"探针目录 {PROBE}\n服务地址 {url}")

    try:
        with sync_playwright() as p:
            browser = p.chromium.launch(channel="chrome", headless=False, args=["--window-size=1440,900"])
            ctx = browser.new_context(viewport={"width": 1440, "height": 900})
            page = ctx.new_page()
            errors = []
            page.on("pageerror", lambda e: errors.append(str(e)[:160]))

            # 1) 首次加载：装 SW（clients.claim 后 controller 出现）
            page.goto(url, wait_until="domcontentloaded", timeout=60000)
            page.wait_for_function("() => !!navigator.serviceWorker.controller", timeout=30000)
            page.reload(wait_until="domcontentloaded")
            page.wait_for_selector("#btn-update:not([hidden])", timeout=30000)

            # 2) 正常模式不应出现「发布小票」大卡片
            page.wait_for_timeout(5000)
            check("正常加载不弹大卡片", page.is_hidden("#upd-card"))
            page.screenshot(path=str(SHOTS / "01-no-card.png"))

            t0 = page.evaluate("() => performance.timeOrigin")

            # 3) 改写探针 sw.js（BUILD_ID）→ 模拟「服务器发了新版本」
            sw = PROBE / "sw.js"
            src = sw.read_text(encoding="utf-8")
            m = re.search(r"const BUILD_ID = '([0-9a-f]+)';", src)
            if not m:
                check("探针 sw.js 可改写", False, "没找到 BUILD_ID")
                browser.close()
                return 1
            src = src.replace(f"const BUILD_ID = '{m.group(1)}';",
                              f"const BUILD_ID = 'probe{int(time.time())}';", 1)
            sw.write_text(src, encoding="utf-8")
            print("  已改写探针 sw.js 的 BUILD_ID，等待自动更新…")

            # 4) 等自动应用 + reload：期间盯住大卡片是否出现
            deadline = time.time() + 90
            reloaded = False
            card_seen = False
            while time.time() < deadline:
                try:
                    if page.is_visible("#upd-card"):
                        card_seen = True
                except Exception:
                    pass
                try:
                    if page.evaluate("() => performance.timeOrigin") != t0:
                        reloaded = True
                        break
                except Exception:
                    pass
                page.wait_for_timeout(250)

            check("检测到更新后自动应用并刷新", reloaded)
            check("自动更新过程中没有弹大卡片", not card_seen)

            if reloaded:
                page.wait_for_selector("#upd-done:not([hidden])", timeout=15000)
                text = (page.text_content("#upd-done") or "").strip()
                check("右下角出现「已升级」小提示", True, text)
                check("小提示写明版本与构建号", bool(re.search(r"已升级到 v\d+\.\d+\.\d+ · b\d+", text)), text)
                page.screenshot(path=str(SHOTS / "02-upgraded-toast.png"))

                page.click("#upd-done")
                page.wait_for_timeout(500)
                check("点小提示打开更新记录", page.is_visible("#cl-panel"))
                page.click("#cl-close")
                page.wait_for_timeout(300)

                # 5) 小提示 8 秒后自动消失（再种一次标记，避免受上面点击影响）
                page.evaluate("() => localStorage.setItem('supersu.pwa.upgradedAt', String(Date.now()))")
                page.reload(wait_until="domcontentloaded")
                page.wait_for_selector("#upd-done:not([hidden])", timeout=15000)
                page.wait_for_timeout(9500)
                check("小提示 8 秒后自动消失", page.is_hidden("#upd-done"))

            ver = page.evaluate("() => fetch('./version.json', {cache:'no-store'}).then(r => r.json())")
            print("  version.json:", json.dumps(ver, ensure_ascii=False))
            check("页面无 JS 未捕获异常", not errors, str(errors[:2]))
            browser.close()
    finally:
        srv.shutdown()
        srv.server_close()
        # 收尾同样不删（见上：删 444 个文件会触发执行环境保护）

    failed = [r for r in results if not r[1]]
    print("\n" + "=" * 52)
    print(f"静默自动更新：{len(results) - len(failed)}/{len(results)} 通过")
    for n, _, d in failed:
        print("  FAIL:", n, d)
    return 1 if failed else 0


if __name__ == "__main__":
    sys.exit(main())
