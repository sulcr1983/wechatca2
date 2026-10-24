#!/usr/bin/env python3
"""PWA AI 平台预设专项（AI-PRESET：平台下拉 + 只填 Key）。

钉死 2026-10-24 用户需求：
- AI 面板提供平台下拉（DeepSeek / Moonshot / SiliconFlow / OpenAI + 自定义），
  选中即自动填好接口地址与默认模型，**用户只需要选平台 + 填 API Key**
- 模型预填后仍可手改；「自定义」清空自填
- 配置仍只存本机 localStorage `supersu.ai`；保存/测试连接/门控契约不变
  （配置一改即失效「测试通过」，AI 入口收起）
- ⚠️ 只预置允许浏览器直连的平台（智谱等 CORS 必失败，不能入列）

全部路由 mock，不联网、不依赖真实 Key。

用法：
    .venv/Scripts/python.exe scripts/pwa_ai_preset_test.py
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
OUT = ROOT / "output" / "ai-preset"
sys.path.insert(0, str(ROOT))

PRESETS = {
    "deepseek":    ("https://api.deepseek.com/v1",    "deepseek-chat"),
    "moonshot":    ("https://api.moonshot.cn/v1",     "moonshot-v1-8k"),
    "siliconflow": ("https://api.siliconflow.cn/v1",  "Qwen/Qwen2.5-7B-Instruct"),
    "openai":      ("https://api.openai.com/v1",      "gpt-4o-mini"),
}

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
    ap.add_argument("--port", type=int, default=8098)
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

    def toast_text(page):
        try:
            if page.is_visible("#toast"):
                return page.inner_text("#toast")
        except Exception:
            pass
        return ""

    def ls_cfg(page):
        return page.evaluate(
            "() => { try { return JSON.parse(localStorage.getItem('supersu.ai')||'null'); } catch(e){ return null; } }")

    def ls_verified(page):
        return page.evaluate(
            "() => { try { return JSON.parse(localStorage.getItem('supersu.ai.verified')||'null'); } catch(e){ return null; } }")

    try:
        with sync_playwright() as p:
            browser = launch_browser(p, headless=True, args=["--no-proxy-server"])
            ctx = browser.new_context(viewport={"width": 1360, "height": 900})
            page = ctx.new_page()
            page.on("pageerror", lambda e: errors.append(str(e)))
            page.on("console", lambda m: errors.append(m.text)
                    if m.type == "error" and not m.text.startswith("Failed to load resource") else None)

            # mock：DeepSeek 预填地址经 chat() 拼出 <base>/chat/completions，命中本路由
            def fulfill(route):
                route.fulfill(status=200, content_type="application/json",
                              body=json.dumps({"choices": [{"message": {"content": "ok"}}]}))
            page.route("**/v1/chat/completions", fulfill)

            page.goto(url, wait_until="domcontentloaded", timeout=60000)
            # 等引擎就绪：必须先有内容（空编辑器永远 loading）；
            # 线上首访 Pyodide ~40MB，给足 3 分钟
            wait_engine_ready(page)

            def open_ai():
                if page.is_hidden("#ai-sheet"):
                    page.click("#btn-ai")
                page.wait_for_selector("#ai-sheet:not([hidden])", timeout=10000)

            # ① 平台下拉：4 个预设 + 自定义，名称与单一真源一致
            open_ai()
            opts = page.eval_on_selector_all(
                "#ai-platform option", "els => els.map(e => ({v: e.value, t: e.textContent}))")
            vals = [o["v"] for o in opts]
            check("平台下拉含 4 预设 + 自定义",
                  vals == ["deepseek", "moonshot", "siliconflow", "openai", "custom"], str(vals))
            names_ok = any("DeepSeek" in o["t"] for o in opts) and any("自定义" in o["t"] for o in opts)
            check("预设名称可读（平台名 + 自定义入口）", names_ok,
                  " / ".join(o["t"] for o in opts))

            # ② 空配置首次打开：默认第一个平台，地址/模型预填好，只差 Key
            check("空配置默认选中 DeepSeek", page.input_value("#ai-platform") == "deepseek",
                  page.input_value("#ai-platform"))
            check("空配置已预填接口地址与模型",
                  page.input_value("#ai-base") == PRESETS["deepseek"][0]
                  and page.input_value("#ai-model") == PRESETS["deepseek"][1],
                  page.input_value("#ai-base") + " | " + page.input_value("#ai-model"))
            check("空配置不预填 Key（Key 永远用户自己填）", page.input_value("#ai-key") == "",
                  repr(page.input_value("#ai-key")))

            # ③ 切换平台 → 地址/模型换成该平台预填值
            for pid in ("moonshot", "siliconflow", "openai"):
                page.select_option("#ai-platform", pid)
                page.wait_for_timeout(120)
                base, model = page.input_value("#ai-base"), page.input_value("#ai-model")
                check(f"切到 {pid} 自动填好地址与模型", (base, model) == PRESETS[pid],
                      f"{base} | {model}")

            # ④ 预填的模型可手改，保存后保持手改值
            page.select_option("#ai-platform", "deepseek")
            page.wait_for_timeout(120)
            page.fill("#ai-model", "deepseek-reasoner")
            page.fill("#ai-key", "sk-preset-test")
            page.click("#ai-save")
            page.wait_for_timeout(300)
            cfg = ls_cfg(page) or {}
            check("手改模型 + 只填 Key 即可保存",
                  cfg.get("baseUrl") == PRESETS["deepseek"][0]
                  and cfg.get("model") == "deepseek-reasoner"
                  and cfg.get("key") == "sk-preset-test",
                  json.dumps({k: cfg.get(k) for k in ("baseUrl", "model", "key")}, ensure_ascii=False))

            # ⑤ 测试连接（mock 同源 200）→ 成功 + 门控放行
            page.click("#ai-test")
            page.wait_for_function(
                "() => !document.getElementById('ai-test').disabled", timeout=30000)
            page.wait_for_timeout(400)
            out_txt = page.inner_text("#ai-out") if page.is_visible("#ai-out") else ""
            check("只选平台 + 填 Key 即可测试连接通过", "连接成功" in out_txt, out_txt[:60])
            check("测试通过后 AI 排版入口显形",
                  page.is_visible("#btn-ai-format-row") and "ai-ready" in (page.evaluate(
                      "() => document.body.className") or ""),
                  page.evaluate("() => document.body.className"))

            # ⑥ 门控契约不变：改配置 → 保存 → 「测试通过」作废，AI 入口收起
            open_ai()
            page.fill("#ai-model", "deepseek-chat-v2")
            page.click("#ai-save")
            page.wait_for_timeout(300)
            check("配置一改即失效（verified 清除）", ls_verified(page) in (None, {}),
                  str(ls_verified(page)))
            check("配置变更后 AI 入口收起",
                  page.is_hidden("#btn-ai-format-row")
                  and "ai-ready" not in (page.evaluate("() => document.body.className") or ""),
                  page.evaluate("() => document.body.className"))

            # ⑦ 「自定义」→ 清空自填；空提交有提示且不写坏配置
            page.select_option("#ai-platform", "custom")
            page.wait_for_timeout(120)
            check("切到自定义清空地址与模型",
                  page.input_value("#ai-base") == "" and page.input_value("#ai-model") == "",
                  repr(page.input_value("#ai-base")))
            page.click("#ai-save")
            page.wait_for_timeout(300)
            check("空提交有明确提示（含三项说明）", "三项" in toast_text(page), toast_text(page)[:60])
            cfg2 = ls_cfg(page) or {}
            check("保存失败不写坏配置（仍是上次有效值）",
                  cfg2.get("model") == "deepseek-chat-v2" and cfg2.get("key") == "sk-preset-test",
                  json.dumps({k: cfg2.get(k) for k in ("model", "key")}, ensure_ascii=False))

            # ⑧ 旧配置回显（无 platform 字段的老数据）：按接口地址反查预设
            if page.is_visible("#ai-sheet"):
                page.click("#ai-close")
                page.wait_for_timeout(200)
            page.evaluate(
                """() => localStorage.setItem('supersu.ai', JSON.stringify(
                    {baseUrl: 'https://api.moonshot.cn/v1', model: 'moonshot-v1-8k', key: 'k-old'}))""")
            open_ai()
            check("旧配置按地址反查到 Moonshot", page.input_value("#ai-platform") == "moonshot",
                  page.input_value("#ai-platform"))
            check("旧配置字段原样回显（含 Key）",
                  page.input_value("#ai-base") == PRESETS["moonshot"][0]
                  and page.input_value("#ai-model") == PRESETS["moonshot"][1]
                  and page.input_value("#ai-key") == "k-old",
                  page.input_value("#ai-base"))

            # ⑨ 自定义地址（非预设）→ 回落「自定义」，不清空用户已填值
            if page.is_visible("#ai-sheet"):
                page.click("#ai-close")
                page.wait_for_timeout(200)
            page.evaluate(
                """() => localStorage.setItem('supersu.ai', JSON.stringify(
                    {baseUrl: 'https://my-gateway.example.com/v1', model: 'my-model', key: 'k3'}))""")
            open_ai()
            check("非预设地址回落自定义", page.input_value("#ai-platform") == "custom",
                  page.input_value("#ai-platform"))
            check("自定义配置原样回显",
                  page.input_value("#ai-base") == "https://my-gateway.example.com/v1",
                  page.input_value("#ai-base"))

            page.screenshot(path=str(OUT / "ai-preset.png"), full_page=False)
            check("全程 0 JS 报错", not errors, "; ".join(errors[:3]))
    finally:
        try:
            browser.close()
        except Exception:
            pass
        if srv:
            srv.shutdown()

    passed = sum(1 for _, ok, _ in results if ok)
    total = len(results)
    print(f"\n{passed}/{total}" + ("  全绿" if passed == total else "  ← 有失败项"))
    return 0 if passed == total else 1


if __name__ == "__main__":
    sys.exit(main())
