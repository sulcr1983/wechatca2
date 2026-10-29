#!/usr/bin/env python3
"""深挖验证（2026-10-30）—— 针对独立 E2E 暴露的可疑点做二次确认。

为什么单独写：
  第一轮 qa_independent_e2e.py 的 E2E-15（长图高度 375）与 E2E-16（超长文本
  0.0s 就"通过"）都可能是我自己测试写错导致的假结果：
    · E2E-16 用了 wait_for_function(btn-copy 启用)，但按钮在上一轮就已是启用状态，
      条件瞬间满足 → 根本没等渲染完成就取长度 → 读到的是上一轮的旧预览。
  测试写错和产品有 Bug 必须区分清楚，否则会把假问题写进缺陷清单。

本脚本只做三件事，每条都强制「先回到确定状态」：
  1. 超长文本：先清空 → 确认按钮禁用 → 再填入 → 计时等真正渲染
  2. 长图高度：同一篇短文，分别看「长图导出高度」与「预览实际内容高度」
  3. 清除数据：逐键核对 localStorage 残留（含 AI / 图库 Key）

用法：
    .venv/Scripts/python.exe scripts/qa_deep_verify.py --port 8072
"""

from __future__ import annotations

import argparse
import functools
import http.server
import json
import socket
import socketserver
import struct
import sys
import threading
import time
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
DIST = ROOT / "pwa" / "dist"
OUT = ROOT / "output" / "qa-deep"
sys.path.insert(0, str(ROOT))


class _H(http.server.SimpleHTTPRequestHandler):
    def log_message(self, *a):
        pass


def port_busy(p: int) -> bool:
    with socket.socket() as s:
        s.settimeout(0.4)
        return s.connect_ex(("127.0.0.1", p)) == 0


def png_h(data: bytes):
    if data[:8] != b"\x89PNG\r\n\x1a\n" or data[12:16] != b"IHDR":
        return None
    return struct.unpack(">II", data[16:24])


SHORT = """周末去海边，我把手机调成了飞行模式

出发前一晚我还在改稿，凌晨两点关电脑，第二天六点的车。上车之后才发现，我已经很久没有这样空着手坐三个小时了。

为什么要跑那么远

城市里的安静是借来的。图书馆四点半闭馆，咖啡馆九点打烊，连公园都有保安吹哨子。海边的安静不要钱，也没人赶你走。

- 第一天下午到的，风很大，帽子被吹进海里
- 第二天退潮，捡了半袋碎贝壳
- 第三天什么都没做，就在岸边坐着

住在哪里

民宿在渔村最里面，老板是本地人，早上会敲门问要不要吃面。房间朝东，五点半太阳就照进来了。

注意：渔村晚上没有路灯，手机要留电。

> 有些休息不是为了更好地工作，就是单纯地需要休息。"""


def main() -> int:
    try:
        sys.stdout.reconfigure(encoding="utf-8", errors="replace")
    except Exception:
        pass
    ap = argparse.ArgumentParser()
    ap.add_argument("--port", type=int, default=8072)
    args = ap.parse_args()

    if port_busy(args.port):
        print(f"ERROR: 端口 {args.port} 被占用", file=sys.stderr)
        return 2

    OUT.mkdir(parents=True, exist_ok=True)
    handler = functools.partial(_H, directory=str(DIST))
    srv = socketserver.ThreadingTCPServer(("127.0.0.1", args.port), handler)
    srv.daemon_threads = True
    threading.Thread(target=srv.serve_forever, daemon=True).start()
    url = f"http://127.0.0.1:{args.port}/"

    from playwright.sync_api import sync_playwright
    from core.browser_utils import launch_browser
    from core.pwa_test_utils import wait_engine_ready

    findings = []

    def note(k, v):
        findings.append({"item": k, "value": str(v)[:400]})
        print(f"  · {k}: {v}", flush=True)

    try:
        with sync_playwright() as p:
            b = launch_browser(p, headless=True)
            ctx = b.new_context(viewport={"width": 1440, "height": 900},
                                permissions=["clipboard-read", "clipboard-write"],
                                accept_downloads=True)
            page = ctx.new_page()
            page.goto(url, wait_until="domcontentloaded", timeout=120_000)
            page.fill("#input", SHORT)
            wait_engine_ready(page, timeout=180_000, fill=False)
            page.wait_for_timeout(1500)

            # ── 1. 短文基准：预览内容真实高度 vs 长图导出高度 ──────────
            prev_h = page.evaluate("""() => {
                const f = document.getElementById('preview');
                const d = f && f.contentDocument;
                if (!d) return null;
                const el = d.querySelector('h1') ? d.body : d.body;
                return {
                  bodyScrollH: d.body.scrollHeight,
                  docH: d.documentElement.scrollHeight,
                  textLen: (d.body.innerText || '').length,
                  h1Count: d.querySelectorAll('h1').length,
                  blockCount: d.querySelectorAll('h1,h2,h3,p,li,blockquote').length
                };
            }""")
            note("短文预览结构", json.dumps(prev_h, ensure_ascii=False))

            page.click("#btn-export")
            page.wait_for_timeout(300)
            png_path = None
            try:
                with page.expect_download(timeout=90_000) as dl:
                    page.click("#menu-export button[data-exp='long']")
                d = dl.value
                png_path = OUT / ("long-" + (d.suggested_filename or "x.png"))
                d.save_as(str(png_path))
                data = png_path.read_bytes()
                dim = png_h(data)
                note("长图 PNG 尺寸", f"{dim} / {len(data)}B")
                note("长图提示 toast", page.inner_text("#toast") if page.is_visible("#toast") else "")
                # 关键判断：长图高度应显著大于预览高度（1080 宽 vs 手机宽度缩放）
                if dim and prev_h:
                    ratio = dim[1] / max(1, prev_h["bodyScrollH"])
                    note("长图高 / 预览高 比值", f"{ratio:.2f}（长图宽 1080，手机预览更窄→比值应 > 1）")
            except Exception as e:
                note("长图导出异常", e)

            # ── 2. 超长文本：强制从确定状态开始 ─────────────────────
            page.fill("#input", "")
            page.wait_for_timeout(800)
            dis0 = page.evaluate("() => document.getElementById('btn-copy').disabled")
            note("清空后复制按钮 disabled", dis0)

            LONG = ("这是一个用于压力测试的段落，包含中文标点，以及英文 mixed content 混排。"
                    "我们还要测试列表和引用是否能正确处理。\n\n") * 80
            n_chars = len(LONG)
            t0 = time.time()
            page.fill("#input", LONG)
            # 等按钮重新变为启用（说明这一轮渲染真的完成了）
            try:
                page.wait_for_function(
                    "() => !document.getElementById('btn-copy').disabled", timeout=180_000)
                dt = time.time() - t0
                page.wait_for_timeout(1500)
                after = page.evaluate("""() => {
                    const f = document.getElementById('preview');
                    const d = f && f.contentDocument;
                    return d ? {
                      textLen: (d.body.innerText || '').length,
                      blockCount: d.querySelectorAll('h1,h2,h3,p,li,blockquote').length,
                      htmlLen: d.body.innerHTML.length
                    } : null;
                }""")
                note(f"超长文本 {n_chars} 字排版耗时", f"{dt:.1f}s")
                note("超长文本渲染结果", json.dumps(after, ensure_ascii=False))
                # 输入 80 段 → 预览里 innerText 应接近输入字数（允许 ±20% 差异，因为去掉标点/空行）
                if after:
                    keep_ratio = after["textLen"] / n_chars
                    note("预览文字 / 输入字数 保留比", f"{keep_ratio:.3f}（接近 1 = 没丢内容）")
            except Exception as e:
                note("超长文本排版失败", str(e)[:200])

            # ── 3. 清除本地数据：逐键核对 ───────────────────────────
            page.fill("#input", "清除测试")
            page.evaluate("""() => {
                localStorage.setItem('supersu.ai', JSON.stringify(
                  {baseUrl:'https://api.deepseek.com/v1', model:'deepseek-chat', key:'sk-QA-KEY-123'}));
                localStorage.setItem('supersu.ai.verified', JSON.stringify(
                  {baseUrl:'https://api.deepseek.com/v1', model:'deepseek-chat', ts:1}));
                localStorage.setItem('supersu.cover.stock.v1', JSON.stringify({pexels:'QA-PEXELS'}));
                localStorage.setItem('supersu.cover.prefs.v1', JSON.stringify({style:'bigtype'}));
                localStorage.setItem('supersu.pwa.blocks', JSON.stringify({x:{quote:true}}));
                localStorage.setItem('supersu.pwa.layout', JSON.stringify({x:'card'}));
                localStorage.setItem('supersu.pwa.custom', JSON.stringify({bg:'#000'}));
            }""")
            page.wait_for_timeout(500)
            before = page.evaluate("() => Object.fromEntries(Object.entries(localStorage).map(([k,v])=>[k,(v||'').length]))")
            note("清除前 localStorage 键", json.dumps(before, ensure_ascii=False))

            page.click("#btn-more")
            page.wait_for_timeout(300)
            page.once("dialog", lambda d: d.accept())
            page.click("#menu button[data-act='clear-all']")
            page.wait_for_timeout(1500)

            after_keys = page.evaluate("() => Object.keys(localStorage)")
            after_vals = page.evaluate("""() => Object.fromEntries(
                Object.entries(localStorage).map(([k,v])=>[k, String(v).slice(0,60)]))""")
            note("清除后 localStorage 键", json.dumps(after_vals, ensure_ascii=False, indent=1))
            sensitive = {k: v for k, v in after_vals.items()
                         if 'sk-QA-KEY' in v or 'QA-PEXELS' in v}
            note("★ 残留的敏感数据（API Key）", json.dumps(sensitive, ensure_ascii=False) or "无")

            b.close()
    finally:
        srv.shutdown()
        srv.server_close()

    (OUT / "deep.json").write_text(json.dumps(findings, ensure_ascii=False, indent=2),
                                   encoding="utf-8")
    print(f"\n明细：{(OUT / 'deep.json').relative_to(ROOT)}")
    return 0


if __name__ == "__main__":
    sys.exit(main())
