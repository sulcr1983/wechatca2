#!/usr/bin/env python3
"""真实 AI 态有头测试（不打 mock，真调 DeepSeek）（2026-10-24）

背景：
  PWA 是纯静态站，AI 走**浏览器端 BYOK**（localStorage `supersu.ai`）。
  所以真实 AI 测试必须在浏览器里填入真实 Key，让页面自己请求 LLM。
  Key 从项目 `.env` 读取（DEEPSEEK_API_KEY / DEEPSEEK_BASE_URL / DEEPSEEK_MODEL）。

与前两个脚本的分工：
  - pwa_headed_full_e2e.py    : 全量功能（模板×夹具×按钮×AI 门控），AI 用 mock
  - pwa_layout_compat_test.py : 版式兼容矩阵（纯渲染层）
  - **本脚本**                : 真实 LLM 端到端 —— 验证真模型输出能否被引擎吃下

断言重点（真实模型输出不可控，所以只断言「不坏」）：
  1. 测试连接能通过（真 Key 有效）
  2. AI 排版能返回结果（不是兜底）
  3. 正文零丢失（AI 只加标记不改字）
  4. 产物能渲染：标签配平、无残留标记
  5. 产物在 4 种新版式下都不崩
  6. 段落色块能叠加

用法：
    .venv/Scripts/python.exe scripts/pwa_real_ai_test.py
    .venv/Scripts/python.exe scripts/pwa_real_ai_test.py --local   # 测本地 dist
    .venv/Scripts/python.exe scripts/pwa_real_ai_test.py --keep-config  # 不还原浏览器配置
"""

from __future__ import annotations

import argparse
import functools
import http.server
import json
import os
import shutil
import socket
import socketserver
import sys
import threading
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
OUT = ROOT / "output" / "real-ai"
ONLINE_URL = "https://supersu.ccwu.cc/"
sys.path.insert(0, str(ROOT))

results: list[dict] = []


def check(name: str, ok: bool, before=None, after=None, shot: str = "") -> None:
    results.append({"name": name, "ok": bool(ok),
                    "before": "" if before is None else str(before)[:200],
                    "after": "" if after is None else str(after)[:200], "shot": shot})
    print(("  PASS  " if ok else "  FAIL  ") + name
          + (f"  | {before} → {after}" if before is not None or after is not None else "")
          + (f"  [{shot}]" if shot else ""), flush=True)


def skip(name: str, detail: str = "") -> None:
    results.append({"name": name, "ok": None, "before": "", "after": detail, "shot": ""})
    print("  SKIP  " + name + (f"  — {detail}" if detail else ""), flush=True)


PROBE = r"""() => {
  const d = document.getElementById('preview');
  if (!d) return null;
  let doc = null;
  try { doc = d.contentDocument; } catch (e) { doc = null; }
  if (!doc || !doc.body) return null;
  const txt = (doc.body.innerText || '').replace(/\s+/g, '');
  const html = doc.body.innerHTML || '';
  const cnt = (t) => (html.match(new RegExp('<' + t + '\\b', 'g')) || []).length;
  const close = (t) => (html.match(new RegExp('</' + t + '>', 'g')) || []).length;
  const balance = {};
  for (const t of ['section', 'p', 'div', 'table', 'tr', 'td', 'ul', 'ol', 'li']) {
    const o = cnt(t), c = close(t);
    if (o !== c) balance[t] = o + '/' + c;
  }
  return {
    len: txt.length, text: txt.slice(0, 400), htmlLen: html.length, balance,
    blocks: doc.querySelectorAll('[data-block]').length,
    hasTOC: txt.includes('本文目录'),
    hasTable: cnt('table') > 0,
    hasCards: (html.match(/border-radius:12px/g) || []).length,
    hasAccentBar: html.includes('width:4px'),
  };
}"""


def probe(page, retries: int = 6, wait: int = 250):
    for _ in range(retries):
        try:
            pr = page.evaluate(PROBE)
            if pr:
                return pr
        except Exception:
            pass
        page.wait_for_timeout(wait)
    return None


# 真实文章：有标题、多段、含数字/引语/提示，能触发 AI 全部结构能力
# 长文夹具（2026-10-27 新增）：段落里自带 3 个可分辨的小节，每节 ≥2 段。
# 为什么需要它：短文（单主题、无小标题）里 AI 按「宁缺勿滥」只给 1 个小节，
# 卡片流 / 目录导航 / 杂志分栏 本来就无事可做 —— 版本式断言会全挂，
# 但那是测试预期错，不是产品 bug。
ARTICLE_LONG = """一周复盘

这周过得很碎，先把事情摊开看一遍。

工作

周一开了三个会，真正推进的只有一件事。剩下的时间都花在对齐上，收效不大。周三把方案重写了一遍，反而更清楚。

产出两篇稿子。第二篇比第一篇顺，因为先列了提纲再写。

生活

跑步只跑了两次，都短。睡得比上周晚，这一点要改。周末没出门，把书架整理了一遍，扔掉了十几本不会再看的。

做饭三次。学会了用高压锅炖牛肉，四十分钟就烂。

复盘

最大的问题是把时间花在「看起来很忙」的事情上。下周只保留三件必须做完的事，其余全部往后排。

第二个问题是回复消息太及时，打断了自己。下次集中处理。"""

ARTICLE = """周末去海边

出发前一晚我还在改稿，心里没底。这一夜我反复删了又写，窗外一直下雨，楼下便利店的灯亮到很晚。行李收了一半又放下，总觉得有事情没做完。

后来想明白了：事情永远做不完，但海不会等人。

第一件事是把手机调成飞行模式。第二件事是只带一本书。

下午四点，光从侧面打过来，沙滩是温的。我脱了鞋走了很久，脚底的沙子一层层塌下去。

在沙滩上待了整整 4 小时，没看一次手机。

他说：“真正让人疲惫的不是工作，是那些没被允许停下来的时刻。”

提示：傍晚风会变凉，带一件外套。

回程路上，车窗外的海一点点变小，最后只剩一条线。我睡着了，醒来时已经到家。"""

# 关键片段：AI 只许加标记，不许改写/删除
KEY_SEGS = ["出发前一晚我还在改稿", "窗外一直下雨", "沙滩是温的",
            "真正让人疲惫", "带一件外套", "车窗外的海一点点变小"]


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
    ap.add_argument("--local", action="store_true", help="测本地 dist（默认测线上）")
    ap.add_argument("--keep-config", action="store_true", help="跑完不还原浏览器 AI 配置")
    ap.add_argument("--port", type=int, default=8095)
    # 任意 OpenAI 兼容服务都能测（用户手上有多个 API，不止 DeepSeek）：
    #   --key/--base/--model 不传时回落到 .env 的 DEEPSEEK_*
    ap.add_argument("--key", default="", help="API Key（默认读 .env DEEPSEEK_API_KEY）")
    ap.add_argument("--base", default="", help="接口地址（默认读 .env DEEPSEEK_BASE_URL）")
    ap.add_argument("--model", default="", help="模型名（默认读 .env DEEPSEEK_MODEL）")
    args = ap.parse_args()

    # 读真实 Key（只在本进程内存里用，不落盘、不打印）
    from dotenv import load_dotenv
    load_dotenv(ROOT / ".env")
    key = (args.key or os.getenv("DEEPSEEK_API_KEY", "")).strip()
    base = (args.base or os.getenv("DEEPSEEK_BASE_URL", "").strip()
            or "https://api.deepseek.com/v1")
    model = (args.model or os.getenv("DEEPSEEK_MODEL", "")).strip() or "deepseek-chat"
    if not key:
        print("ERROR: .env 里没有 DEEPSEEK_API_KEY，无法做真实 AI 测试", file=sys.stderr)
        return 2
    print(f"真实 AI：{base} / {model} / key {key[:8]}…{key[-4:]}")

    dist = ROOT / "pwa" / "dist"
    srv = None
    if args.local:
        if not (dist / "index.html").exists():
            print("ERROR: pwa/dist 不存在，先 node pwa/scripts/build.mjs", file=sys.stderr)
            return 2
        if port_busy(args.port):
            print(f"ERROR: 端口 {args.port} 被占用", file=sys.stderr)
            return 2

        class Q(http.server.SimpleHTTPRequestHandler):
            def log_message(self, *a):
                pass

        srv = socketserver.ThreadingTCPServer(
            ("127.0.0.1", args.port), functools.partial(Q, directory=str(dist)))
        srv.daemon_threads = True
        threading.Thread(target=srv.serve_forever, daemon=True).start()
        url = f"http://127.0.0.1:{args.port}/"
    else:
        url = ONLINE_URL
    print(f"目标：{url}")

    if OUT.exists():
        shutil.rmtree(OUT)
    OUT.mkdir(parents=True, exist_ok=True)

    from playwright.sync_api import sync_playwright
    from core.browser_utils import launch_browser

    errors: list[str] = []
    try:
        with sync_playwright() as p:
            browser = launch_browser(p, headless=False,
                                     args=["--no-proxy-server", "--window-size=1440,960"])
            ctx = browser.new_context(viewport={"width": 1400, "height": 900})
            page = ctx.new_page()

            def _on_console(m):
                if m.type != "error":
                    return
                t = m.text or ""
                if t.startswith("Failed to load resource"):
                    return
                errors.append(t)
            page.on("console", _on_console)
            page.on("pageerror", lambda e: errors.append(str(e)))

            page.goto(url, wait_until="domcontentloaded", timeout=60000)
            page.wait_for_selector("#btn-themes", timeout=40000)
            page.fill("#input", ARTICLE)
            try:
                page.wait_for_function(
                    "() => !document.getElementById('btn-copy').disabled", timeout=120000)
                ready = True
            except Exception:
                ready = False
            check("引擎就绪", ready, "", "")
            if not ready:
                browser.close()
                return _finish()

            # ① 在浏览器里填真实 BYOK 配置（模拟用户在 AI 面板里填）
            page.evaluate("""(c) => localStorage.setItem('supersu.ai', JSON.stringify(c))""",
                          {"baseUrl": base, "model": model, "key": key})
            page.reload(wait_until="domcontentloaded")
            page.wait_for_selector("#btn-themes", timeout=40000)
            page.fill("#input", ARTICLE)
            try:
                page.wait_for_function(
                    "() => !document.getElementById('btn-copy').disabled", timeout=120000)
            except Exception:
                pass

            # ② 点「测试连接」→ 真请求 DeepSeek
            page.click("#btn-ai")
            page.wait_for_timeout(900)
            if page.locator("#ai-test").count() == 1:
                page.click("#ai-test")
                # 真网络请求，给足时间
                for _ in range(24):
                    page.wait_for_timeout(1000)
                    if page.evaluate("() => document.body.classList.contains('ai-ready')"):
                        break
            verified = page.evaluate("() => document.body.classList.contains('ai-ready')")
            check("真实 Key 测试连接通过", verified, "",
                  "AI 入口已放出" if verified else "未通过（Key 无效或网络不通）")
            page.screenshot(path=str(OUT / "01-ai-panel.png"))
            page.click("#ai-close")
            page.wait_for_timeout(700)

            if not verified:
                skip("AI 排版真实调用", "测试连接未通过，后续项无法验证")
                browser.close()
                return _finish()

            # ③ 点「AI 排版」→ 真请求
            btn = page.locator("#btn-ai-format-row")
            if btn.count() == 0 or not btn.is_visible():
                check("AI 排版按钮可见", False, "", "未找到")
                browser.close()
                return _finish()
            check("AI 排版按钮可见", True, "", "")

            before_text = page.input_value("#input")
            btn.click()
            # 真模型可能较慢，轮询直到内容变化或超时
            changed = False
            for _ in range(40):
                page.wait_for_timeout(1000)
                if page.input_value("#input") != before_text:
                    changed = True
                    break
            after_text = page.input_value("#input")
            check("AI 排版真实返回并改写结构", changed,
                  f"{len(before_text)}字", f"{len(after_text)}字")
            page.screenshot(path=str(OUT / "02-ai-formatted.png"))

            toast = page.inner_text("#toast") if page.is_visible("#toast") else ""
            check("AI 排版未走本地兜底", "本地" not in toast and "兜底" not in toast,
                  "", toast[:80] or "无提示")

            # ④ 正文零丢失
            flat = after_text.replace("\n", "").replace(" ", "")
            missing = [s for s in KEY_SEGS if s.replace(" ", "") not in flat]
            check("真实 AI 产物正文零丢失", not missing, "",
                  f"缺 {missing}" if missing else f"{len(KEY_SEGS)} 片段全在")

            # ⑤ 结构真的变了（AI 加了标题/列表/表格/引用等标记）
            marks = sum(after_text.count(m) for m in ("##", "- ", "|", ">", "::: "))
            check("真实 AI 产物含结构标记", marks >= 2, "", f"{marks} 处")

            # ⑥ 渲染不崩
            page.wait_for_timeout(2000)
            pr = probe(page)
            check("真实 AI 产物可渲染", bool(pr and pr["htmlLen"] > 200),
                  "", (pr or {}).get("htmlLen", 0))
            check("真实 AI 产物标签配平", bool(pr) and not pr["balance"], "",
                  (pr or {}).get("balance", "") or "配平")
            page.screenshot(path=str(OUT / "03-rendered.png"), full_page=False)

            # ⑦ × 4 种新版式 —— 验「兼容」，不验「必须出效果」
            #
            # ⚠️ 2026-10-27 修正：原来这里断言 hasAccentBar/hasCards/hasTOC/hasTable
            #    必须为真。但短文只有一个主题，AI 按提示词的「宁缺勿滥」只给 1 个小节，
            #    卡片流/目录/杂志分栏 没有可切的东西 → 全空。那是**引擎的正确行为**
            #    （不造假装饰），不是 bug。所以：
            #      短文 → 只验「不崩、不丢字、标签配平」
            #      长文（下方 ⑦b）→ 才验「AI 真切出小节」+「版式真出效果」
            page.click("#btn-themes")
            page.wait_for_timeout(400)
            base_text_len = page.evaluate(
                "() => { const f = document.getElementById('preview');"
                " return f && f.contentDocument ? f.contentDocument.body.innerText.replace(/\\s+/g,'').length : 0; }")
            lay_ok = {}
            for label in ("图文节奏", "卡片流", "目录导航", "杂志分栏"):
                page.click(f".dl-chip:has-text('{label}')")
                page.wait_for_timeout(1600)
                q = probe(page)
                txt_len = page.evaluate(
                    "() => { const f = document.getElementById('preview');"
                    " return f && f.contentDocument ? f.contentDocument.body.innerText.replace(/\\s+/g,'').length : 0; }")
                keep = (txt_len >= base_text_len * 0.95) if base_text_len else False
                ok = bool(q) and q["htmlLen"] > 200 and not q["balance"] and keep
                lay_ok[label] = ok
                check(f"真实 AI 产物 × 版式「{label}」兼容（不崩/不丢字）", ok, "",
                      f"html={q['htmlLen'] if q else '-'} 字数={txt_len}/{base_text_len} "
                      f"失衡={q['balance'] if q else '-'}")
            check("真实 AI 产物在 4 种新版式下全部兼容",
                  all(lay_ok.values()), "", f"{sum(lay_ok.values())}/4")

            # ⑦b 长文：验 AI 真能切小节，且版式真出效果
            saved_text = page.input_value("#input")   # 短文（AI 已排版），跑完长文要还原
            page.click(".dl-chip:has-text('默认')")
            page.wait_for_timeout(600)
            page.click("#btn-drawer-close")
            page.wait_for_timeout(300)
            page.fill("#input", ARTICLE_LONG)
            page.wait_for_timeout(1500)
            # ⚠️ #ai-format 在 AI 面板（#ai-sheet）里，此时面板是关的；
            #    行内那个 #btn-ai-format-row 才是随手可点的入口。
            inline = page.locator("#btn-ai-format-row")
            if inline.count() and inline.is_visible():
                inline.click()
            else:
                page.click("#btn-ai")
                page.wait_for_timeout(500)
                page.click("#ai-format")
            try:
                page.wait_for_function(
                    "() => /^##\\s/m.test(document.getElementById('input').value)", timeout=120000)
                heads = page.evaluate(
                    "() => (document.getElementById('input').value.match(/^##\\s/gm) || []).length")
                check("长文里 AI 能切出 ≥2 个小节", heads >= 2, "≥2", f"{heads} 个")
            except Exception as e:
                heads = 0
                check("长文里 AI 能切出 ≥2 个小节", False, "≥2", str(e)[:60])

            if heads >= 2:
                page.click("#btn-themes")
                page.wait_for_timeout(400)
                page.click(".dl-chip:has-text('目录导航')")
                page.wait_for_timeout(1800)
                q = probe(page)
                check("小节≥2 时「目录导航」真出目录", bool(q) and q["hasTOC"], "hasTOC=True",
                      f"hasTOC={q['hasTOC'] if q else '-'}")
                page.click(".dl-chip:has-text('卡片流')")
                page.wait_for_timeout(1800)
                q2 = probe(page)
                check("小节≥2 时「卡片流」真出卡片", bool(q2) and q2["hasCards"] > 0, "hasCards>0",
                      f"hasCards={q2['hasCards'] if q2 else '-'}")
                # 还原现场：⑧ 段落色块要在短文上跑，且它自己会点「默认」
                page.click("#btn-drawer-close")
                page.wait_for_timeout(300)
                page.fill("#input", saved_text)
                page.wait_for_timeout(1500)
                page.click("#btn-themes")
                page.wait_for_timeout(400)
                page.click(".dl-chip:has-text('默认')")
                page.wait_for_timeout(1200)

            # ⑧ 段落色块叠加
            page.click(".dl-chip:has-text('默认')")
            page.wait_for_timeout(1800)
            for k in ("quote", "data", "tip"):
                b = page.locator(f"#db-{k}")
                if b.count() and not b.is_checked():
                    b.check()
                    page.wait_for_timeout(900)
            page.wait_for_timeout(1500)
            q2 = probe(page)
            check("真实 AI 产物 × 段落色块", bool(q2 and q2["blocks"] > 0), "",
                  (q2 or {}).get("blocks", 0))
            page.screenshot(path=str(OUT / "04-blocks.png"), full_page=False)

            check("全程无 JS 报错（排除资源加载）", not errors, "",
                  errors[:1] if errors else "0 报错")

            # ⑨ 还原浏览器 AI 配置（不留真 Key 在 profile 里）
            if not args.keep_config:
                page.evaluate("""() => {
                    localStorage.removeItem('supersu.ai');
                    localStorage.removeItem('supersu.ai.verified');
                }""")
                check("已清理浏览器里的真实 Key", True, "", "已移除")

            browser.close()
    finally:
        if srv:
            srv.shutdown()

    return _finish()


def _finish() -> int:
    passed = sum(1 for r in results if r["ok"] is True)
    failed = sum(1 for r in results if r["ok"] is False)
    skipped = sum(1 for r in results if r["ok"] is None)
    print("\n" + "=" * 58)
    print(f"真实 AI 态测试：{passed}/{passed + failed} 通过"
          + (f"（{skipped} SKIP）" if skipped else ""))
    if failed:
        print("\n失败项：")
        for r in results:
            if r["ok"] is False:
                print(f"  · {r['name']}  {r['before']} → {r['after']}")
    OUT.mkdir(parents=True, exist_ok=True)
    (OUT / "report.json").write_text(json.dumps(results, ensure_ascii=False, indent=2),
                                     encoding="utf-8")
    print(f"报告：{OUT / 'report.json'}")
    return 0 if failed == 0 else 1


if __name__ == "__main__":
    sys.exit(main())
