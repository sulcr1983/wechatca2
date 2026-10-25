#!/usr/bin/env python3
"""PWA AI 智能排版专项（C 阶段：AI 结构增强 + 本地兜底契约）。

钉死本地版 /api/ai-format 的降级契约在 PWA 同样成立：
- AI 未配置 / HTTP 失败 / 返回非 JSON / 结构为空 → **一律本地规则兜底**，按钮永远给结果
- 兜底必须说明原因（不静默）
- AI 成功时只插入结构标记，正文一行不许少

全部用路由 mock，不联网、不依赖真实 Key。

用法：
    .venv/Scripts/python.exe scripts/pwa_ai_format_test.py
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
ONLINE_URL = "https://supersu.ccwu.cc/"
OUT = ROOT / "output" / "ai-format"
sys.path.insert(0, str(ROOT))

SAMPLE = (
    "周末去海边\n\n"
    "出发前一晚我还在改稿，心里没底。\n\n"
    "第一件事是把手机调成飞行模式。\n\n"
    "第二件事是只带一本书。\n"
)
SAMPLE_RICH = (
    "周末去海边\n\n"
    "出发前一晚我还在改稿，心里没底。这一夜我反复删了又写，窗外一直下雨，楼下便利店的灯亮到很晚。\n\n"
    "第一件事是把手机调成飞行模式；第二件事是只带一本书。\n\n"
    "预算：800 元\n\n"
    "路线：地铁 2 号线\n"
)
RICH = {
    "title": 0,
    "sections": [{"heading": "出发前的准备", "start": 1, "end": 4}],
    "lists": [],
    "bold": [],
    "splits": [{"p": 1, "cuts": ["这一夜我反复"]}],
    "merges": [],
    "tables": [{"start": 3, "end": 4, "delim": "："}],
    "callouts": [{"start": 1, "end": 1, "type": "summary", "title": "开场"}],
    "hrs": [{"after": 4}],
    "pullquotes": [{"p": 1, "text": "出发前一晚我还在改稿，心里没底。"}],
}
PLAN = RICH   # 主体用例直接用富 plan（六项全含）

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
    ap.add_argument("--port", type=int, default=8097)
    ap.add_argument("--local", action="store_true",
                    help="测本地 dist（默认测线上服务器）")
    ap.add_argument("--url", default="", help="自定义目标地址")
    args = ap.parse_args()

    use_local = args.local
    if use_local:
        if not (DIST / "index.html").exists():
            print("ERROR: pwa/dist 不存在，先跑 node pwa/scripts/build.mjs", file=sys.stderr)
            return 2
        if port_busy(args.port):
            print(f"ERROR: 端口 {args.port} 被占用 —— 换 --port", file=sys.stderr)
            return 2

    OUT.mkdir(parents=True, exist_ok=True)
    srv = None
    if use_local:
        srv = socketserver.ThreadingTCPServer(("127.0.0.1", args.port),
                                              functools.partial(_Handler, directory=str(DIST)))
        srv.daemon_threads = True
        srv.request_queue_size = 64
        threading.Thread(target=srv.serve_forever, daemon=True).start()
        url = f"http://127.0.0.1:{args.port}/"
        print(f"目标：{url}（本地 dist）")
    else:
        url = args.url or ONLINE_URL
        print(f"目标：{url}（线上服务器）")

    from playwright.sync_api import sync_playwright
    from core.browser_utils import launch_browser
    from core.pwa_test_utils import wait_engine_ready

    errors: list[str] = []
    state = {"mode": "ok"}   # ok / badjson / http500 / empty

    try:
        with sync_playwright() as p:
            browser = launch_browser(p, headless=True, args=["--no-proxy-server"])
            ctx = browser.new_context(viewport={"width": 1360, "height": 900})
            page = ctx.new_page()
            page.on("pageerror", lambda e: errors.append(str(e)))
            page.on("console", lambda m: errors.append(m.text)
                    if m.type == "error" and not m.text.startswith("Failed to load resource") else None)

            def fulfill(route):
                mode = state["mode"]
                if mode == "http500":
                    route.fulfill(status=500, content_type="application/json",
                                  body=json.dumps({"error": {"message": "mock 上游故障"}}))
                    return
                # 按 system prompt 区分：结构规划 / 主题推荐 / 连接测试
                try:
                    msgs = json.loads(route.request.post_data or "{}").get("messages", [])
                except Exception:
                    msgs = []
                sys0 = (msgs[0].get("content") or "") if msgs else ""
                if "排版结构" in sys0:   # 用稳定关键词，不绑死「规划器/编辑」具体措辞
                    content = {
                        "ok": json.dumps(PLAN, ensure_ascii=False),
                        "badjson": "这段不是 JSON",
                        "empty": "{}",
                    }[mode]
                else:
                    content = "ok"
                route.fulfill(status=200, content_type="application/json",
                              body=json.dumps({"choices": [{"message": {"content": content}}]}))

            page.route("**/v1/chat/completions", fulfill)
            page.goto(url, wait_until="domcontentloaded", timeout=60000)
            # 等引擎就绪（必须先有内容；线上首访 Pyodide ~40MB，给足超时）
            wait_engine_ready(page)

            def open_ai():
                if page.is_hidden("#ai-sheet"):
                    page.click("#btn-ai")
                page.wait_for_selector("#ai-sheet:not([hidden])", timeout=10000)

            def format_now():
                open_ai()
                page.click("#ai-format")
                page.wait_for_function(
                    "() => !document.getElementById('ai-format').disabled", timeout=60000)
                page.wait_for_timeout(600)
                if page.is_visible("#ai-sheet"):
                    page.click("#ai-close")   # 面板挡住右侧抽屉/风格条，验完即关
                    page.wait_for_timeout(200)

            def editor():
                return page.input_value("#input")

            # ① 未配置 AI：必须本地兜底，且说明原因
            page.fill("#input", SAMPLE)
            page.wait_for_timeout(900)
            format_now()
            text1 = editor()
            check("未配置 AI 时按钮仍给结果（本地兜底）", "# 周末去海边" in text1, text1.split("\n")[0][:40])
            say1 = page.inner_text("#ai-out") if page.is_visible("#ai-out") else page.inner_text("#toast")
            check("未配置 AI 时说明原因", "还没配置 AI" in say1 or "还没配置" in page.inner_text("#toast"),
                  say1[:80])

            # 配置 mock（同源，避免 CORS 预检）
            page.evaluate(
                """(base) => localStorage.setItem('supersu.ai', JSON.stringify(
                    {baseUrl: base, model: 'mock', key: 'k'}))""",
                f"{url}v1",
            )

            # ② AI 合法结构：只插入标记，正文不丢字
            page.fill("#input", SAMPLE_RICH)
            page.wait_for_timeout(900)
            state["mode"] = "ok"
            format_now()
            text2 = editor()
            check("AI 结构生效（出现小节标题）", "## 出发前的准备" in text2, text2.split("\n")[:4])
            flat2 = text2.replace("\n", "")
            kept = all(seg in flat2 for seg in [
                "出发前一晚我还在改稿", "窗外一直下雨", "第一件事是把手机调成飞行模式",
                "800 元", "地铁 2 号线",
            ])
            check("AI 结构后正文不丢字", kept, f"{len(text2)} 字符")
            check("完成提示含结构统计", "智能排版完成" in page.inner_text("#toast"),
                  page.inner_text("#toast")[:60])

            # ③ AI 返回非 JSON → 本地兜底 + 原因
            page.fill("#input", SAMPLE_RICH)
            page.wait_for_timeout(900)
            state["mode"] = "badjson"
            format_now()
            text3 = editor()
            said3 = page.inner_text("#toast")
            check("非 JSON 时本地兜底", "# 周末去海边" in text3 and "## 出发前的准备" not in text3,
                  text3.split("\n")[0][:40])
            check("非 JSON 时说明原因", "合法 JSON" in said3 or "已用本地规则" in said3, said3[:80])

            # ④ AI 5xx → 本地兜底 + 原因
            page.fill("#input", SAMPLE_RICH)
            page.wait_for_timeout(900)
            state["mode"] = "http500"
            format_now()
            said4 = page.inner_text("#toast")
            check("HTTP 500 时本地兜底并报原因", "# 周末去海边" in editor() and "500" in said4, said4[:80])

            # ⑤ AI 返回空结构 {} → 视为不可用，本地兜底
            page.fill("#input", SAMPLE_RICH)
            page.wait_for_timeout(900)
            state["mode"] = "empty"
            format_now()
            said5 = page.inner_text("#toast")
            check("空结构视为不可用并兜底", ("结构为空" in said5 or "已用本地规则" in said5)
                  and "# 周末去海边" in editor(), said5[:80])

            # ⑥ 空编辑器：明确提示，不调用 AI
            page.fill("#input", "")
            page.wait_for_timeout(500)
            open_ai()
            calls = {"n": 0}
            page.on("request", lambda r: calls.__setitem__("n", calls["n"] + 1)
                    if "/v1/chat/completions" in r.url else None)
            page.click("#ai-format")
            page.wait_for_timeout(400)
            check("空内容给明确提示", "先在编辑器里写点内容" in page.inner_text("#toast"),
                  page.inner_text("#toast")[:60])

            page.screenshot(path=str(OUT / "ai-format.png"))

            # ⑦ AI 能力门控：未测试通过前，AI 入口必须全部隐藏
            check("未就绪时解析条 AI 排版入口隐藏", page.is_hidden("#btn-ai-format-row"))
            check("AI 推荐主题已下线（不再有抽屉推荐区）",
                  page.locator("#drawer-ai").count() == 0 and page.locator("#btn-ai-reco").count() == 0)
            check("未就绪时 body 无 ai-ready", "ai-ready" not in (page.get_attribute("body", "class") or ""))

            # ⑧ 走真实 UI：填配置 → 测试连接成功 → AI 入口显形
            if page.is_visible("#ai-sheet"):
                page.click("#ai-close"); page.wait_for_timeout(200)
            page.click("#btn-ai")
            page.wait_for_selector("#ai-sheet:not([hidden])", timeout=10000)
            page.fill("#ai-base", f"{url}v1")
            page.fill("#ai-model", "mock")
            page.fill("#ai-key", "k")
            page.click("#ai-test")
            page.wait_for_function("() => document.body.classList.contains('ai-ready')", timeout=20000)
            page.click("#ai-close")
            check("测试通过后解析条 AI 排版显形", page.is_visible("#btn-ai-format-row"))
            # 抽屉打开时编辑区会让位隐藏，所以先写内容再开抽屉
            page.fill("#input", SAMPLE)
            page.wait_for_timeout(900)
            page.click("#btn-themes")
            page.wait_for_timeout(500)
            check("测试通过后抽屉无 AI 推荐区（已下线）", page.locator("#drawer-ai").count() == 0)

            # ⑨ 六项结构升级：富 plan 真跑一遍（常驻 AI 排版入口）
            page.click("#btn-drawer-close")
            page.wait_for_timeout(200)
            page.fill("#input", SAMPLE_RICH)
            page.wait_for_timeout(900)
            state["mode"] = "ok"
            page.click("#btn-ai-format-row")
            page.wait_for_function(
                "() => !document.getElementById('btn-ai-format-row').disabled", timeout=60000)
            page.wait_for_timeout(700)
            md = page.input_value("#input")
            check("小节标题生效", "## 出发前的准备" in md, md.split("\n")[:3])
            check("拆段生效（这一夜另起一段）", "\n\n这一夜我反复" in md, md[:60].replace("\n", "⏎"))
            check("表格生效", "| 项目 | 内容 |" in md and "| 预算 | 800 元 |" in md, "")
            tail = md.split(":::summary[开场]")[1] if ":::summary[开场]" in md else ""
            check("提示框生效", ":::summary[开场]" in md and ":::" in tail, "")
            check("分隔线生效", "\n\n---" in md, "")
            check("金句块生效", "> 出发前一晚我还在改稿，心里没底。" in md, "")
            flat = md.replace("\n", "")
            kept = all(seg in flat for seg in [
                "出发前一晚我还在改稿", "窗外一直下雨", "第一件事是把手机调成飞行模式",
                "800 元", "地铁 2 号线",
            ])
            check("六项操作后正文不丢字", kept, f"{len(md)} 字符")

            # ⑩ 撤销回到排版前
            page.click("#btn-ai")
            page.wait_for_selector("#ai-sheet:not([hidden])", timeout=10000)
            check("有可撤销的 AI 排版", page.is_visible("#ai-undo"))
            page.click("#ai-undo")
            page.wait_for_timeout(500)
            check("撤销恢复原文", page.input_value("#input").strip() == SAMPLE_RICH.strip(),
                  page.input_value("#input")[:40])
            check("撤销后按钮收起", page.is_hidden("#ai-undo"))

            # ⑪ 改配置 → 已验证失效，AI 入口收起（面板此时已打开）
            page.fill("#ai-model", "mock-v2")
            page.click("#ai-save")
            page.wait_for_timeout(400)
            page.click("#ai-close")
            check("改配置后 AI 入口收回",
                  not page.evaluate("() => document.body.classList.contains('ai-ready')")
                  and page.is_hidden("#btn-ai-format-row"), "")

            check("无 JS 控制台报错", not errors, errors[0][:140] if errors else "")
            browser.close()
    finally:
        if srv:
            srv.shutdown()

    passed = sum(1 for _, ok, _ in results if ok)
    total = len(results)
    print("\n" + "=" * 56)
    print(f"AI 智能排版专项：{passed}/{total} 通过")
    print(f"产物：{OUT}")
    return 0 if passed == total else 1


if __name__ == "__main__":
    raise SystemExit(main())
