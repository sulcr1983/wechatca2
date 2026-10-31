#!/usr/bin/env python3
"""PWA 预处理模式专项测试（2026-10-31 · AGENTS §3 遗留收口）。

功能：引擎四模式（auto/conservative/longform/tutorial）暴露到排版页解析条。
验证到**产物层**：读 #preview 的 srcdoc 真实 HTML 断言标题/列表真的变了，
不是只看「选择器存在」。

用法：
    .venv/Scripts/python.exe scripts/pwa_ppmode_test.py
    .venv/Scripts/python.exe scripts/pwa_ppmode_test.py --port 8079

产物：output/ppmode-check/（截图）
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
OUT = ROOT / "output" / "ppmode-check"
sys.path.insert(0, str(ROOT))

from playwright.sync_api import sync_playwright  # noqa: E402
from core.browser_utils import launch_browser  # noqa: E402

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


# 教程夹具：标签行 + 中文序数（preprocessor _TUTORIAL_LABEL_RE / _CN_ORDINAL_RE 白名单）
TUTORIAL_TEXT = """三分钟学会煮一碗好吃的面
准备工作
面粉、鸡蛋、青菜、生抽
第一步：烧一锅水，水开下面
第二步：面浮起后加半碗凉水
第三步：盛出后调味拌匀
注意事项
火不要太大，容易糊底"""

# 长散文夹具：>3 段、无显式结构、含「标签：内容」行（auto 应判 longform 并补小标题）
LONGFORM_TEXT = """第一段开场白，聊聊最近的生活状态和一些想法，写得像正文的样子。

核心观点：碎片时间不是用来填充的，而是用来留白的，留白才有思考的空间。

第二段展开上面的观点，说说为什么留白重要，以及自己实践之后的感受。

常见误区：把碎片时间塞满课程和资讯，结果更焦虑了，输入多消化少等于没输入。

第三段给出替代方案，建议每天留出二十分钟什么都不做，让大脑自己整理信息。

实践方法：晚上散步时不戴耳机，走路就想事情，想到什么回家记两笔就好。

最后一段收个尾，强调工具和方法都是次要的，关键是给自己留出安静的时间。"""

SHORT_TEXT = "周末去了趟海边，风很大，人也很少。\n\n回来之后心情好多了。"


def srcdoc(page) -> str:
    return page.evaluate("() => document.getElementById('preview').srcdoc") or ""


def wait_rendered(page, marker: str, timeout: int = 60000) -> None:
    """等预览 srcdoc 出现指定标记（本轮渲染完成的产物级信号）。"""
    page.wait_for_function(
        "(m) => (document.getElementById('preview')?.srcdoc || '').includes(m)",
        arg=marker, timeout=timeout,
    )


def main() -> int:
    try:
        sys.stdout.reconfigure(encoding="utf-8", errors="replace")
    except Exception:
        pass

    ap = argparse.ArgumentParser()
    ap.add_argument("--port", type=int, default=8079)
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
    threading.Thread(target=srv.serve_forever, daemon=True).start()
    url = f"http://127.0.0.1:{args.port}/"

    with sync_playwright() as p:
        browser = launch_browser(p, headless=True, args=["--no-proxy-server"])
        page = browser.new_page(viewport={"width": 1440, "height": 960})
        js_errors: list[str] = []
        page.on("pageerror", lambda e: js_errors.append(str(e)))

        page.goto(url, wait_until="domcontentloaded", timeout=60000)

        # 等 Pyodide 引擎就绪：引擎未就绪时渲染走 JS 轻量预览（无 h2/list 版式块），
        # 若不等就绪就断言，会读到轻量预览产物而误判。
        page.wait_for_selector('#engine-badge[data-state="ready"]', timeout=90000)

        # ── 1. 选择器存在 + 四选项 + 默认 auto ──
        sel = page.locator("#pp-mode")
        sel.wait_for(timeout=20000)
        opts = page.evaluate("() => [...document.querySelectorAll('#pp-mode option')].map(o => o.value)")
        check("选择器存在且默认 auto", page.evaluate("() => document.getElementById('pp-mode').value") == "auto")
        check("四选项齐备（auto/conservative/longform/tutorial）",
              opts == ["auto", "conservative", "longform", "tutorial"], f"实际 {opts}")

        # ── 2. 教程模式：标签行 → ## 小标题；中文序数 → 列表（产物层）──
        # 先选模式再填内容：确保捕获的是「教程渲染」，而非更早的 auto 渲染
        # （auto 对这篇会判 conservative，不产 h2；选错时机会读到旧产物而误判）
        page.select_option("#pp-mode", "tutorial")
        page.fill("#input", TUTORIAL_TEXT)
        wait_rendered(page, "准备工作")   # 教程渲染完成信号：h2 小标题已进预览
        html = srcdoc(page)
        import re
        check("教程模式：标签行变 h2 小标题",
              bool(re.search(r"<h2[^>]*>[^<]*准备工作", html)) and bool(re.search(r"<h2[^>]*>[\s\S]*?注意事项", html)),
              f"h2 命中 {bool(re.search(r'<h2[^>]*>[^<]*准备工作', html))}/{bool(re.search(r'<h2[^>]*>[\\s\\S]*?注意事项', html))}")
        # 引擎把列表渲染成带 • 的版式块（<section> + <span>•</span>），不是 <li>，
        # 故断言产物为「• 子弹 + 步骤正文」而非 <li> 标签。
        list_ok = ('烧一锅水' in html) and bool(re.search(r'>•</span>', html))
        check("教程模式：中文序数转列表项（带 • 版式块）", list_ok)

        # ── 3. 智能识别：长散文 → 判定反馈 chip「已按长文分层识别」──
        page.select_option("#pp-mode", "auto")
        page.fill("#input", LONGFORM_TEXT)
        page.wait_for_selector("#pp-effective", timeout=60000)
        chip = page.locator("#pp-effective").inner_text()
        check("智能识别：长散文反馈「已按长文分层识别」", "长文分层" in chip, chip)
        wait_rendered(page, "核心观点</h3>")   # 等到 longform 渲染的 h3（不是 conservative 段落里的「核心观点」字样）
        html = srcdoc(page)
        check("智能识别（longform）：标签提升为 h3 小标题",
              bool(re.search(r"<h3[^>]*>[^<]*核心观点", html)))

        # ── 4. 智能识别：短文走保守整理 → 不给判定提示（噪音控制）──
        page.fill("#input", SHORT_TEXT)
        page.wait_for_timeout(2500)   # 防抖 400ms + 渲染
        check("智能识别：短文不显示判定 chip", page.locator("#pp-effective").count() == 0)
        page.screenshot(path=str(OUT / "auto-short.png"))

        # ── 5. 显式保守 vs 长文分层：同一篇散文小标题有/无 ──
        page.fill("#input", LONGFORM_TEXT)
        page.select_option("#pp-mode", "conservative")
        wait_rendered(page, "碎片时间")
        html_cons = srcdoc(page)
        page.select_option("#pp-mode", "longform")
        wait_rendered(page, "核心观点</h3>")   # 等到 longform 渲染（conservative 段落里也有「核心观点」字样，不能只等字样）
        html_long = srcdoc(page)
        import re as _re
        cons_h3 = bool(_re.search(r"<h3[^>]*>[^<]*核心观点", html_cons))
        long_h3 = bool(_re.search(r"<h3[^>]*>[^<]*核心观点", html_long))
        check("显式保守整理：不主动加小标题", not cons_h3)
        check("显式长文分层：标签提升为小标题", long_h3)

        # ── 6. 持久化：选教程 → 刷新仍为教程 ──
        page.select_option("#pp-mode", "tutorial")
        page.wait_for_timeout(600)
        page.reload(wait_until="domcontentloaded")
        page.wait_for_selector("#pp-mode", timeout=20000)
        check("选择持久化：刷新后仍是教程步骤",
              page.evaluate("() => document.getElementById('pp-mode').value") == "tutorial")
        page.screenshot(path=str(OUT / "tutorial-selected.png"), full_page=False)

        # ── 7. 渲染零 JS 异常 ──
        check("全程零 JS 异常", len(js_errors) == 0, "; ".join(js_errors[:3]))

        browser.close()
    srv.shutdown()

    n_pass = sum(1 for _, ok, _ in results if ok)
    print(f"\n通过 {n_pass}/{len(results)}")
    return 0 if n_pass == len(results) else 1


if __name__ == "__main__":
    sys.exit(main())
