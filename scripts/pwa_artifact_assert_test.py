#!/usr/bin/env python3
"""产物级断言门禁（2026-10-30）—— 专治「有反应 ≠ 产物正确」。

为什么单独建一个套件，而不是加进现有 pwa_*_test.py：
  现有套件大量断言停在「按钮可用 / toast 出现 / 元素存在」。
  典型：pwa_headed_full_e2e.py:530 对「复制到公众号」只检查 #toast 可见，
  **从不读剪贴板内容** —— 而复制富文本是本产品的核心交付动作。
  这个套件只做一件事：**验证最终产物**。

三个断言（都是此前从未被自动化覆盖的）：
  P1 剪贴板：点「复制到公众号」后，真的读回 text/html，且含内联样式与正文
  P2 下载文件：导出 Markdown / HTML / 长图，读**真实文件字节**，PNG 读 IHDR 宽高
  P3 清除数据：点「清除本地数据」后，localStorage 里**不得残留任何 supersu.* 键**

判据纪律（2026-10-30 踩过的坑，写进代码避免重犯）：
  · 测渲染前必须先回到「复制按钮禁用」的确定态，否则 wait_for_function(启用) 瞬间返回
  · 长图高度没有「必须 >400px」这种规矩（短文 375px 就是对的）→ 只校验宽度与「非空白」
  · 剪贴板必须显式授权，否则一级路径失败、测出的「成功」是兜底路径的假象

用法：
    .venv/Scripts/python.exe scripts/pwa_artifact_assert_test.py
    .venv/Scripts/python.exe scripts/pwa_artifact_assert_test.py --port 8091

产物：output/artifact-assert/（下载文件 + 截图 + report.json）
退出码：0 全通过 / 1 有 FAIL
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
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
DIST = ROOT / "pwa" / "dist"
OUT = ROOT / "output" / "artifact-assert"
sys.path.insert(0, str(ROOT))

results: list[tuple[str, bool, str]] = []

TEXT = """周末去海边，我把手机调成了飞行模式

出发前一晚我还在改稿，凌晨两点关电脑，第二天六点的车。

为什么要跑那么远

城市里的安静是借来的。图书馆四点半闭馆，咖啡馆九点打烊。

- 第一天下午到的，风很大
- 第二天退潮，捡了半袋碎贝壳
"""


def check(name: str, ok: bool, detail: str = "") -> None:
    results.append((name, bool(ok), detail))
    print(("  PASS  " if ok else "  FAIL  ") + name + (f"  | {detail}" if detail else ""),
          flush=True)


class _H(http.server.SimpleHTTPRequestHandler):
    def log_message(self, *a):
        pass


def port_busy(p: int) -> bool:
    with socket.socket() as s:
        s.settimeout(0.4)
        return s.connect_ex(("127.0.0.1", p)) == 0


def png_size(data: bytes):
    """读 PNG IHDR 宽高（不依赖 PIL）。"""
    if len(data) < 24 or data[:8] != b"\x89PNG\r\n\x1a\n" or data[12:16] != b"IHDR":
        return None
    return struct.unpack(">II", data[16:24])


def main() -> int:
    try:
        sys.stdout.reconfigure(encoding="utf-8", errors="replace")
    except Exception:
        pass
    ap = argparse.ArgumentParser()
    ap.add_argument("--port", type=int, default=8091)
    args = ap.parse_args()
    if port_busy(args.port):
        print(f"ERROR: 端口 {args.port} 被占用 —— 换 --port", file=sys.stderr)
        return 2

    OUT.mkdir(parents=True, exist_ok=True)
    srv = socketserver.ThreadingTCPServer(
        ("127.0.0.1", args.port), functools.partial(_H, directory=str(DIST)))
    srv.daemon_threads = True
    threading.Thread(target=srv.serve_forever, daemon=True).start()
    url = f"http://127.0.0.1:{args.port}/"
    print(f"目标：{url}\n产物：{OUT}\n", flush=True)

    from playwright.sync_api import sync_playwright
    from core.browser_utils import launch_browser
    from core.pwa_test_utils import wait_engine_ready

    try:
        with sync_playwright() as p:
            b = launch_browser(p, headless=True)
            ctx = b.new_context(
                viewport={"width": 1440, "height": 900},
                # 必须授权，否则 navigator.clipboard.write 走兜底路径
                permissions=["clipboard-read", "clipboard-write"],
                accept_downloads=True,
            )
            page = ctx.new_page()
            errs: list[str] = []
            page.on("pageerror", lambda e: errs.append(str(e)[:200]))

            page.goto(url, wait_until="domcontentloaded", timeout=120_000)
            page.fill("#input", TEXT)
            ready = wait_engine_ready(page, timeout=180_000, fill=False)
            page.wait_for_timeout(1500)

            # ── P1：剪贴板真实内容 ──────────────────────────────────
            if not ready:
                check("引擎就绪（剪贴板断言前置）", False, "引擎未就绪")
            else:
                page.click("#btn-copy")
                page.wait_for_timeout(900)

                clip = page.evaluate("""async () => {
                    try {
                        const items = await navigator.clipboard.read();
                        const types = items.map(i => i.types).flat();
                        let html = '';
                        for (const it of items) {
                            if (it.types.includes('text/html')) {
                                const blob = await it.getType('text/html');
                                html = await blob.text();
                            }
                        }
                        return { ok: true, types, html };
                    } catch (e) { return { ok: false, err: String(e) }; }
                }""")
                if not clip.get("ok"):
                    check("P1 剪贴板可读", False, clip.get("err", "")[:120])
                else:
                    types = clip.get("types", [])
                    html = clip.get("html", "")
                    check("P1a 剪贴板含 text/html 类型", "text/html" in types, str(types))
                    check("P1b 剪贴板 HTML 含内联样式（公众号粘贴不掉样式）",
                          'style="' in html, f"{len(html)} 字符")
                    check("P1c 剪贴板 HTML 含正文文字（不是空壳）",
                          "周末去海边" in html, f"含标题={'周末去海边' in html}")
                    (OUT / "clipboard.html").write_text(html, encoding="utf-8")

            # ── P2：导出文件真实字节 ───────────────────────────────
            page.wait_for_timeout(600)

            # Markdown
            try:
                page.click("#btn-export")
                page.wait_for_timeout(300)
                with page.expect_download(timeout=60_000) as dl:
                    page.click("#menu-export button[data-exp='md']")
                d = dl.value
                f = OUT / ("dl-" + (d.suggested_filename or "x.md"))
                d.save_as(str(f))
                body = f.read_text(encoding="utf-8", errors="replace")
                check("P2a 导出 Markdown：文件落盘且含正文",
                      f.stat().st_size > 100 and "周末去海边" in body,
                      f"{d.suggested_filename} / {f.stat().st_size}B")
            except Exception as e:
                check("P2a 导出 Markdown", False, str(e)[:150])
                page.keyboard.press("Escape")

            # HTML
            try:
                page.click("#btn-export")
                page.wait_for_timeout(300)
                with page.expect_download(timeout=60_000) as dl:
                    page.click("#menu-export button[data-exp='html']")
                d = dl.value
                f = OUT / ("dl-" + (d.suggested_filename or "x.html"))
                d.save_as(str(f))
                h = f.read_text(encoding="utf-8", errors="replace")
                check("P2b 导出 HTML：自包含 + 内联样式 + 正文",
                      f.stat().st_size > 500 and "<!DOCTYPE html>" in h
                      and "周末去海边" in h and 'style="' in h,
                      f"{d.suggested_filename} / {f.stat().st_size}B")
            except Exception as e:
                check("P2b 导出 HTML", False, str(e)[:150])
                page.keyboard.press("Escape")

            # 长图 PNG —— 只校验「宽度 1080 + 是有效 PNG + 高度合理（>0）」
            # ⚠️ 不要校验「高度 >400」：短文 375px 就是正确产物（2026-10-30 误判过）
            try:
                page.click("#btn-export")
                page.wait_for_timeout(300)
                with page.expect_download(timeout=120_000) as dl:
                    page.click("#menu-export button[data-exp='long']")
                d = dl.value
                f = OUT / ("dl-" + (d.suggested_filename or "x.png"))
                d.save_as(str(f))
                data = f.read_bytes()
                dim = png_size(data)
                check("P2c 导出长图：有效 PNG、宽度 1080、高度 >0",
                      bool(dim) and dim[0] == 1080 and dim[1] > 0,
                      f"{d.suggested_filename} / {len(data)}B / 尺寸={dim}")
            except Exception as e:
                check("P2c 导出长图", False, str(e)[:150])
                page.keyboard.press("Escape")

            # ── P3：清除本地数据后不得残留 ─────────────────────────
            page.evaluate("""() => {
                localStorage.setItem('supersu.ai', JSON.stringify(
                  {baseUrl:'https://api.deepseek.com/v1', model:'deepseek-chat', key:'sk-ARTIFACT-TEST'}));
                localStorage.setItem('supersu.ai.verified', JSON.stringify(
                  {baseUrl:'https://api.deepseek.com/v1', model:'deepseek-chat', ts:1}));
                localStorage.setItem('supersu.cover.stock.v1', JSON.stringify({pexels:'ARTIFACT-PEXELS'}));
                localStorage.setItem('supersu.cover.prefs.v1', JSON.stringify({style:'bigtype'}));
                localStorage.setItem('supersu.pwa.blocks', JSON.stringify({x:{quote:true}}));
                localStorage.setItem('supersu.pwa.layout', JSON.stringify({x:'card'}));
                localStorage.setItem('supersu.pwa.custom', JSON.stringify({bg:'#000'}));
            }""")
            page.wait_for_timeout(400)
            before = page.evaluate(
                "() => Object.keys(localStorage).filter(k => k.startsWith('supersu.')).sort()")

            page.click("#btn-more")
            page.wait_for_timeout(300)
            page.once("dialog", lambda d: d.accept())
            page.click("#menu button[data-act='clear-all']")
            page.wait_for_timeout(1500)

            after = page.evaluate(
                "() => Object.keys(localStorage).filter(k => k.startsWith('supersu.')).sort()")
            check("P3a 清除本地数据后无 supersu.* 残留",
                  len(after) == 0, f"清除前 {len(before)} 键 → 清除后 {len(after)} 键：{after}")

            # 敏感 Key 必须真的没了
            leaked = page.evaluate("""() => {
                const out = {};
                for (const k of Object.keys(localStorage)) {
                    const v = localStorage.getItem(k) || '';
                    if (v.includes('sk-ARTIFACT-TEST') || v.includes('ARTIFACT-PEXELS')) out[k] = 1;
                }
                return Object.keys(out);
            }""")
            check("P3b 清除后 API Key 未残留（隐私）", len(leaked) == 0,
                  f"残留={leaked}" if leaked else "已清除")

            # 刷新后 AI 入口应收起
            page.reload(wait_until="domcontentloaded")
            page.wait_for_timeout(1800)
            ai_on = page.evaluate("() => document.body.classList.contains('ai-ready')")
            check("P3c 清除后刷新：AI 入口已收起", not ai_on, f"ai-ready={ai_on}")

            check("全程无未处理 JS 报错", not errs, "; ".join(errs[:2])[:200])

            ctx.close()
            b.close()
    finally:
        srv.shutdown()
        srv.server_close()

    n_pass = sum(1 for _, ok, _ in results if ok)
    n_fail = len(results) - n_pass
    print("\n" + "=" * 58)
    print(f"产物级断言：{n_pass}/{len(results)} 通过")
    (OUT / "report.json").write_text(json.dumps(
        [{"name": n, "ok": ok, "detail": d} for n, ok, d in results],
        ensure_ascii=False, indent=2), encoding="utf-8")
    print(f"报告：{(OUT / 'report.json').relative_to(ROOT)}")
    return 0 if n_fail == 0 else 1


if __name__ == "__main__":
    sys.exit(main())
