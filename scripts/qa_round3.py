#!/usr/bin/env python3
"""第三轮定点复核（2026-10-30）：把「疑似」和「我测错了」分开。

要复核的三项，都来自 qa_round2 的可疑结果：
  V1  R5b：移动端 btn-copy「不可点」—— 极可能是我没先切到预览页签
      （移动端默认在「内容」页签，预览面板整体 hidden，bounding_box 当然是 null）
  V2  R7：更新面板只显示「更新记录」四个字 —— 可能是渲染没等够，也可能是真空壳
  V3  R3 的导出超时 —— 确认 2.5 万字导长图到底是「被上限保护拦住（符合设计）」
      还是「卡死/无响应（真缺陷）」

用法：
    .venv/Scripts/python.exe scripts/qa_round3.py --port 8074
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
import time
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
DIST = ROOT / "pwa" / "dist"
OUT = ROOT / "output" / "qa-round3"
sys.path.insert(0, str(ROOT))


class _H(http.server.SimpleHTTPRequestHandler):
    def log_message(self, *a):
        pass


def port_busy(p):
    with socket.socket() as s:
        s.settimeout(0.4)
        return s.connect_ex(("127.0.0.1", p)) == 0


SHORT = """周末去海边，我把手机调成了飞行模式

出发前一晚我还在改稿，凌晨两点关电脑。

为什么要跑那么远

城市里的安静是借来的。

- 第一天下午到的，风很大
- 第二天退潮，捡了半袋碎贝壳
"""


def main() -> int:
    try:
        sys.stdout.reconfigure(encoding="utf-8", errors="replace")
    except Exception:
        pass
    ap = argparse.ArgumentParser()
    ap.add_argument("--port", type=int, default=8074)
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
    from core.pwa_test_utils import wait_engine_ready

    out = {}

    try:
        with sync_playwright() as p:
            b = launch_browser(p, headless=True)

            # ══ V1：移动端 btn-copy 在「预览」页签下是否可点 ═════════
            m = b.new_context(viewport={"width": 375, "height": 667}, is_mobile=True,
                              has_touch=True, device_scale_factor=2)
            mp = m.new_page()
            mp.goto(url, wait_until="domcontentloaded", timeout=120_000)
            mp.fill("#input", SHORT)
            wait_engine_ready(mp, timeout=180_000, fill=False)
            mp.wait_for_timeout(1500)

            tab0 = mp.evaluate("() => document.getElementById('stage').dataset.tab")
            box_edit = None
            try:
                bb = mp.locator("#btn-copy").bounding_box()
                box_edit = bb
            except Exception:
                box_edit = "err"
            print(f"[V1] 初始页签={tab0} / btn-copy 在内容页签下的 bounding_box={box_edit}", flush=True)

            # 切到预览页签后再量
            mp.click("#tabs button[data-tab='preview']")
            mp.wait_for_timeout(900)
            tab1 = mp.evaluate("() => document.getElementById('stage').dataset.tab")
            bb2 = mp.locator("#btn-copy").bounding_box()
            visible = mp.is_visible("#btn-copy")
            print(f"[V1] 切到预览页签={tab1} / visible={visible} / box={bb2}", flush=True)
            out["V1"] = {"tab_before": tab0, "box_before": str(box_edit),
                         "tab_after": tab1, "visible": visible, "box_after": bb2}

            # 真的点一下，看能否复制
            clip_ok = None
            try:
                mp.click("#btn-copy")
                mp.wait_for_timeout(1000)
                clip_ok = mp.evaluate("""async () => {
                    try {
                        const items = await navigator.clipboard.read();
                        for (const it of items) {
                            if (it.types.includes('text/html')) {
                                const b = await it.getType('text/html');
                                const t = await b.text();
                                return {len: t.length, hasText: t.includes('周末去海边')};
                            }
                        }
                        return {len: 0, hasText: false};
                    } catch (e) { return {err: String(e)}; }
                }""")
            except Exception as e:
                clip_ok = {"err": str(e)[:120]}
            print(f"[V1] 移动端点击复制结果={clip_ok}", flush=True)
            out["V1"]["clip"] = clip_ok
            mp.screenshot(path=str(OUT / "mobile-preview-tab.png"))
            m.close()

            # ══ V2：更新面板到底有没有内容 ════════════════════════════
            c = b.new_context(viewport={"width": 1440, "height": 900})
            cp = c.new_page()
            cp.goto(url, wait_until="domcontentloaded", timeout=120_000)
            cp.fill("#input", SHORT)
            wait_engine_ready(cp, timeout=180_000, fill=False)
            cp.wait_for_timeout(1200)

            cp.click("#btn-more")
            cp.wait_for_timeout(300)
            cp.click("#menu button[data-act='update']")
            # 给足时间：更新面板要 fetch changelog.json 并渲染
            for wait_ms in (1500, 3000, 5000):
                cp.wait_for_timeout(wait_ms)
                dom = cp.evaluate("""() => {
                    const r = document.getElementById('update-root');
                    if (!r) return {missing: true};
                    return {
                      textLen: (r.innerText||'').length,
                      text: (r.innerText||'').slice(0, 200),
                      childCount: r.children.length,
                      htmlLen: r.innerHTML.length,
                      visiblePanels: Array.from(r.querySelectorAll('*'))
                        .filter(e => e.offsetParent !== null).length
                    };
                }""")
                print(f"[V2] 等 {wait_ms}ms 后 update-root：{json.dumps(dom, ensure_ascii=False)}", flush=True)
                if dom.get("textLen", 0) > 60:
                    break
            out["V2"] = dom
            cp.screenshot(path=str(OUT / "update-panel.png"), full_page=False)

            # 检查是否有专门的更新面板入口（可能是浮动按钮）
            btn_update = cp.evaluate("""() => {
                const b = document.getElementById('btn-update');
                return b ? {exists:true, visible: b.offsetParent !== null,
                            text: b.textContent.trim()} : {exists:false};
            }""")
            print(f"[V2] #btn-update = {json.dumps(btn_update, ensure_ascii=False)}", flush=True)
            out["V2_btn"] = btn_update

            # ══ V3：2.5 万字导长图 —— 上限保护 or 卡死 ═══════════════
            cp.keyboard.press("Escape")
            cp.wait_for_timeout(600)
            LONG = ("这是一段用于压力测试的中文内容，包含标点、数字 12345 与 English words 混排。\n\n") * 500
            cp.fill("#input", LONG)
            n = len(LONG)
            t0 = time.time()
            try:
                cp.wait_for_function("() => !document.getElementById('btn-copy').disabled",
                                     timeout=180_000)
                print(f"[V3] {n} 字排版完成，耗时 {time.time()-t0:.1f}s", flush=True)
            except Exception as e:
                print(f"[V3] 排版失败：{e}", flush=True)

            # 直接调 export.js 测高度，绕过点击下载（避免下载对话框干扰）
            cp.click("#btn-export")
            cp.wait_for_timeout(400)
            t1 = time.time()
            got_download = False
            try:
                with cp.expect_download(timeout=60_000) as dl:
                    cp.click("#menu-export button[data-exp='long']")
                d = dl.value
                f = OUT / ("long-" + (d.suggested_filename or "x.png"))
                d.save_as(str(f))
                got_download = True
                print(f"[V3] 长图导出成功 {f.stat().st_size}B 耗时 {time.time()-t1:.1f}s", flush=True)
                out["V3"] = {"result": "downloaded", "bytes": f.stat().st_size,
                             "secs": round(time.time() - t1, 1)}
            except Exception as e:
                tmsg = cp.inner_text("#toast") if cp.is_visible("#toast") else ""
                print(f"[V3] 未拿到下载：{str(e)[:100]} / toast='{tmsg}' / 耗时 {time.time()-t1:.1f}s",
                      flush=True)
                out["V3"] = {"result": "no_download", "toast": tmsg,
                             "secs": round(time.time() - t1, 1)}
            c.close()
            b.close()
    finally:
        srv.shutdown()
        srv.server_close()

    (OUT / "verify.json").write_text(json.dumps(out, ensure_ascii=False, indent=2),
                                     encoding="utf-8")
    print(f"\n明细：{(OUT / 'verify.json').relative_to(ROOT)}")
    return 0


if __name__ == "__main__":
    sys.exit(main())
