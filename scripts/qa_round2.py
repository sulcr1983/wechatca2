#!/usr/bin/env python3
"""第二轮验证（2026-10-30）：确认 clearAll 缺陷的真实影响 + 补齐未覆盖场景。

本轮只测「第一轮没测到 / 测错了」的部分：
  R1  clearAll 之后刷新页面：AI 入口是否仍然开着（=用户以为清干净了其实没有）
  R2  clearAll 之后 AI 面板里的 Key 是否还在（用户视角的真实后果）
  R3  超长文本 2 万字（第一轮误判，这轮强制从空态开始并校验保留比）
  R4  离线可用性（断网后刷新，页面是否还能打开并排版）
  R5  移动端视口（375×667）关键控件是否可点、预览是否溢出
  R6  封面模块：无 Pexels Key 时的行为是否给出可操作提示
  R7  更新面板：检查更新是否给出真实结果

用法：
    .venv/Scripts/python.exe scripts/qa_round2.py --port 8073
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
OUT = ROOT / "output" / "qa-round2"
sys.path.insert(0, str(ROOT))

rows: list[dict] = []


def rec(cid, name, status, detail=""):
    rows.append({"id": cid, "name": name, "status": status, "detail": str(detail)[:500]})
    icon = {"PASS": "  PASS  ", "FAIL": "  FAIL  ", "BLOCKED": " BLOCK ",
            "NOTRUN": " NOTRUN "}.get(status, status)
    print(icon + f"[{cid}] " + name + (f"  | {detail}" if detail else ""), flush=True)


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
    ap.add_argument("--port", type=int, default=8073)
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

    try:
        with sync_playwright() as p:
            b = launch_browser(p, headless=True)

            # ══ R1/R2：clearAll 的真实后果 ═══════════════════════════
            ctx = b.new_context(viewport={"width": 1440, "height": 900},
                                permissions=["clipboard-read", "clipboard-write"])
            page = ctx.new_page()
            page.goto(url, wait_until="domcontentloaded", timeout=120_000)
            page.fill("#input", SHORT)
            wait_engine_ready(page, timeout=180_000, fill=False)
            page.wait_for_timeout(1200)

            # 模拟「用户已配置并测试通过 AI + 配了图库 Key」
            page.evaluate("""() => {
                localStorage.setItem('supersu.ai', JSON.stringify(
                  {baseUrl:'https://api.deepseek.com/v1', model:'deepseek-chat', key:'sk-REAL-LOOKING-KEY-ABCDEF'}));
                localStorage.setItem('supersu.ai.verified', JSON.stringify(
                  {baseUrl:'https://api.deepseek.com/v1', model:'deepseek-chat', ts:Date.now()}));
                localStorage.setItem('supersu.cover.stock.v1', JSON.stringify({pexels:'PEXELS-SECRET-KEY'}));
            }""")
            page.reload(wait_until="domcontentloaded")
            page.wait_for_timeout(1500)
            ai_before = page.evaluate("() => document.body.classList.contains('ai-ready')")
            rec("R1-前置", "配置后 AI 入口处于启用态（ai-ready）",
                "PASS" if ai_before else "FAIL", f"ai-ready={ai_before}")

            # 执行「清除本地数据」
            page.click("#btn-more")
            page.wait_for_timeout(300)
            page.once("dialog", lambda d: d.accept())
            page.click("#menu button[data-act='clear-all']")
            page.wait_for_timeout(1200)

            # 关键：刷新后看 AI 是否还活着
            page.reload(wait_until="domcontentloaded")
            page.wait_for_timeout(1800)
            ai_after = page.evaluate("() => document.body.classList.contains('ai-ready')")
            ai_key = page.evaluate(
                "() => { try { return JSON.parse(localStorage.getItem('supersu.ai')||'{}').key || ''; } catch { return ''; } }")
            stock_key = page.evaluate(
                "() => { try { return JSON.parse(localStorage.getItem('supersu.cover.stock.v1')||'{}').pexels || ''; } catch { return ''; } }")
            rec("R1", "清除本地数据后刷新：AI 入口应回到未启用",
                "PASS" if not ai_after else "FAIL",
                f"清除前 ai-ready={ai_before} → 清除后 ai-ready={ai_after}")
            rec("R2", "清除本地数据后 AI API Key 应从本机消失",
                "PASS" if not ai_key else "FAIL",
                f"残留 key='{ai_key[:20]}...'" if ai_key else "已清除")
            rec("R2b", "清除本地数据后 Pexels Key 应从本机消失",
                "PASS" if not stock_key else "FAIL",
                f"残留 pexels='{stock_key[:20]}...'" if stock_key else "已清除")

            # 打开 AI 面板确认用户能看到什么（真实后果）
            try:
                page.click("#btn-ai")
                page.wait_for_timeout(900)
                shown_key = page.input_value("#ai-key")
                shown_stock = page.input_value("#stock-pexels")
                stock_state = page.inner_text("#stock-state") if page.is_visible("#stock-state") else ""
                rec("R2c", "清除后打开 AI 面板：Key 输入框应清空",
                    "PASS" if not shown_key and not shown_stock else "FAIL",
                    f"AI Key 框='{shown_key[:16]}' / Pexels 框='{shown_stock[:16]}' / 状态='{stock_state}'")
                page.keyboard.press("Escape")
            except Exception as e:
                rec("R2c", "打开 AI 面板", "BLOCKED", str(e)[:120])

            # ══ R3：2 万字超长文本（严格从空态开始）═════════════════
            page.fill("#input", "")
            page.wait_for_timeout(900)
            if not page.evaluate("() => document.getElementById('btn-copy').disabled"):
                rec("R3-前置", "清空后按钮未禁用（无法保证测量起点）", "BLOCKED", "")
            LONG = ("这是一段用于压力测试的中文内容，包含标点、数字 12345 与 English words 混排。\n\n") * 500
            n = len(LONG)
            t0 = time.time()
            page.fill("#input", LONG)
            try:
                page.wait_for_function(
                    "() => !document.getElementById('btn-copy').disabled", timeout=180_000)
                dt = time.time() - t0
                page.wait_for_timeout(2000)
                got = page.evaluate("""() => {
                    const d = document.getElementById('preview')?.contentDocument;
                    if (!d) return null;
                    return {textLen: (d.body.innerText||'').length,
                            blocks: d.querySelectorAll('p,h1,h2,h3,li').length,
                            htmlLen: d.body.innerHTML.length};
                }""")
                ratio = (got["textLen"] / n) if got else 0
                rec("R3", f"超长文本 {n} 字：能排版且内容不丢",
                    "PASS" if got and ratio > 0.9 else "FAIL",
                    f"耗时 {dt:.1f}s / 保留比 {ratio:.3f} / 块数 {got['blocks'] if got else 0}")
                # 再导一次长图，看超长是否触发上限保护
                page.click("#btn-export")
                page.wait_for_timeout(300)
                try:
                    with page.expect_download(timeout=120_000) as dl:
                        page.click("#menu-export button[data-exp='long']")
                    d = dl.value
                    f = OUT / ("long2w-" + (d.suggested_filename or "x.png"))
                    d.save_as(str(f))
                    rec("R3b", f"超长文本导长图（应触发 20000px 上限保护或成功）",
                        "PASS", f"{f.stat().st_size}B / {d.suggested_filename}")
                except Exception as e:
                    t = page.inner_text("#toast") if page.is_visible("#toast") else ""
                    rec("R3b", "超长文本导长图（被上限保护拦截=符合设计）",
                        "PASS" if ("太长" in t or "上限" in t) else "FAIL", f"toast='{t[:100]}'")
            except Exception as e:
                rec("R3", f"超长文本 {n} 字排版", "FAIL", str(e)[:150])

            # ══ R4：离线可用性 ═══════════════════════════════════════
            page.fill("#input", SHORT)
            page.wait_for_timeout(1000)
            wait_engine_ready(page, timeout=120_000, fill=False)
            # 等 SW 接管并完成预缓存
            page.wait_for_timeout(3000)
            sw = page.evaluate("() => navigator.serviceWorker?.controller ? true : false")
            rec("R4-前置", "Service Worker 已接管页面", "PASS" if sw else "FAIL", f"controller={sw}")

            ctx.set_offline(True)
            try:
                page.reload(wait_until="domcontentloaded", timeout=60_000)
                page.wait_for_timeout(2500)
                title = page.title()
                has_input = page.locator("#input").count() > 0
                val = page.input_value("#input") if has_input else ""
                rec("R4", "断网后刷新：页面仍能打开且草稿仍在",
                    "PASS" if has_input and title else "FAIL",
                    f"title='{title}' / 草稿 {len(val)} 字")
                # 断网下能否继续排版
                page.fill("#input", SHORT + "\n\n断网追加的一段")
                ok = wait_engine_ready(page, timeout=90_000, fill=False)
                rec("R4b", "断网状态下仍能完成精确排版",
                    "PASS" if ok else "FAIL", "引擎就绪" if ok else "引擎未就绪")
            except Exception as e:
                rec("R4", "断网刷新", "FAIL", str(e)[:150])
            finally:
                ctx.set_offline(False)

            ctx.close()

            # ══ R5：移动端视口 ═══════════════════════════════════════
            m = b.new_context(viewport={"width": 375, "height": 667},
                              is_mobile=True, has_touch=True,
                              device_scale_factor=2, user_agent=(
                "Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) "
                "AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.0 Mobile/15E148 Safari/604.1"))
            mp = m.new_page()
            mp.goto(url, wait_until="domcontentloaded", timeout=120_000)
            mp.fill("#input", SHORT)
            wait_engine_ready(mp, timeout=180_000, fill=False)
            mp.wait_for_timeout(1500)

            # 横向溢出检查（移动端最常见的视觉问题）
            overflow = mp.evaluate("""() => {
                const de = document.documentElement;
                return {scrollW: de.scrollWidth, clientW: de.clientWidth,
                        overflowX: de.scrollWidth > de.clientWidth + 2};
            }""")
            rec("R5", "移动端 375px：页面无横向溢出",
                "PASS" if not overflow["overflowX"] else "FAIL",
                f"scrollW={overflow['scrollW']} clientW={overflow['clientW']}")

            # 关键按钮可点性
            clickable = {}
            for bid in ("btn-copy", "btn-themes", "btn-cover", "btn-export", "btn-more"):
                try:
                    el = mp.locator(f"#{bid}")
                    box = el.bounding_box()
                    clickable[bid] = bool(box and box["width"] > 24 and box["height"] > 24)
                except Exception:
                    clickable[bid] = False
            bad = [k for k, v in clickable.items() if not v]
            rec("R5b", "移动端关键按钮尺寸足够可点（>24px）",
                "PASS" if not bad else "FAIL", f"不可点：{bad}" if bad else "全部可点")

            # 底部 tabs 切换
            try:
                mp.click("#tabs button[data-tab='preview']")
                mp.wait_for_timeout(700)
                tab_ok = mp.evaluate("() => document.getElementById('stage').dataset.tab")
                rec("R5c", "移动端底部页签可切换", "PASS" if tab_ok == "preview" else "FAIL",
                    f"data-tab={tab_ok}")
            except Exception as e:
                rec("R5c", "移动端页签切换", "FAIL", str(e)[:100])

            # 移动端预览 iframe 内容是否可读（字号/宽度）
            try:
                mp.click("#tabs button[data-tab='preview']")
                mp.wait_for_timeout(900)
                inner = mp.evaluate("""() => {
                    const d = document.getElementById('preview')?.contentDocument;
                    if (!d) return null;
                    const h1 = d.querySelector('h1');
                    return {bodyW: d.body.clientWidth,
                            h1Size: h1 ? getComputedStyle(h1).fontSize : '',
                            innerW: d.documentElement.scrollWidth,
                            clientW: d.documentElement.clientWidth};
                }""")
                rec("R5d", "移动端预览内容宽度自适应（无内部横向溢出）",
                    "PASS" if inner and inner["innerW"] <= inner["clientW"] + 2 else "FAIL",
                    json.dumps(inner, ensure_ascii=False))
            except Exception as e:
                rec("R5d", "移动端预览检查", "FAIL", str(e)[:100])
            mp.screenshot(path=str(OUT / "mobile-375.png"))
            m.close()

            # ══ R6：封面模块（无 Pexels Key 时的行为）═════════════════
            c = b.new_context(viewport={"width": 1440, "height": 900})
            cp = c.new_page()
            cp.goto(url, wait_until="domcontentloaded", timeout=120_000)
            cp.fill("#input", SHORT)
            wait_engine_ready(cp, timeout=180_000, fill=False)
            cp.wait_for_timeout(1000)
            try:
                cp.click("#btn-cover")
                cp.wait_for_timeout(1200)
                opened = cp.evaluate("() => !document.getElementById('cover-root').hidden")
                rec("R6", "封面页可打开", "PASS" if opened else "FAIL", f"cover-root 可见={opened}")

                # 无 Key 时点搜图，应给出「去填 Key」的明确指引
                if cp.locator("#cv-q").count():
                    cp.fill("#cv-q", "海边")
                    cp.click("#cv-search")
                    cp.wait_for_timeout(2500)
                    st = cp.inner_text("#cv-status") if cp.locator("#cv-status").count() else ""
                    t = cp.inner_text("#toast") if cp.is_visible("#toast") else ""
                    msg = (st + " " + t).strip()
                    rec("R6b", "无 Pexels Key 搜图：给出可操作指引（不是静默失败）",
                        "PASS" if ("Key" in msg or "key" in msg) else "FAIL", msg[:160])

                # 纯色模式生成封面（不依赖网络，应能出图）
                try:
                    # 选纯色底图模式
                    if cp.locator("#cv-mode-solid").count():
                        cp.click("#cv-mode-solid")
                        cp.wait_for_timeout(600)
                    cp.fill("#cv-text", "周末去海边\n两天的沉默之后，我重新听见了海浪。")
                    cp.wait_for_timeout(800)
                    with cp.expect_download(timeout=120_000) as dl:
                        cp.click("#cv-gen")
                    d = dl.value
                    f = OUT / ("cover-" + (d.suggested_filename or "c.png"))
                    d.save_as(str(f))
                    data = f.read_bytes()
                    dim = None
                    if data[:8] == b"\x89PNG\r\n\x1a\n":
                        import struct as _s
                        dim = _s.unpack(">II", data[16:24])
                    rec("R6c", "纯色底图生成封面：真实 PNG 且尺寸为 1080×1440",
                        "PASS" if dim == (1080, 1440) else "FAIL",
                        f"{len(data)}B / 尺寸={dim}")
                except Exception as e:
                    rec("R6c", "生成封面", "FAIL", str(e)[:160])
            except Exception as e:
                rec("R6", "封面模块", "BLOCKED", str(e)[:150])

            # ══ R7：更新面板 ═════════════════════════════════════════
            try:
                cp.keyboard.press("Escape")
                cp.wait_for_timeout(500)
                cp.click("#btn-more")
                cp.wait_for_timeout(300)
                cp.click("#menu button[data-act='update']")
                cp.wait_for_timeout(2000)
                utxt = cp.inner_text("#update-root") if cp.locator("#update-root").count() else ""
                rec("R7", "「更新记录」能打开并显示真实内容",
                    "PASS" if len(utxt.strip()) > 20 else "FAIL", utxt[:120].replace("\n", " "))
                cp.screenshot(path=str(OUT / "update-panel.png"))
            except Exception as e:
                rec("R7", "更新记录", "FAIL", str(e)[:120])

            # ══ R8：主题抽屉全量可达 ═════════════════════════════════
            try:
                cp.keyboard.press("Escape")
                cp.wait_for_timeout(400)
                cp.click("#btn-themes")
                cp.wait_for_timeout(1200)
                total = cp.evaluate("() => document.querySelectorAll('.d-card').length")
                # 搜一个不存在的词，看空态
                cp.fill("#drawer-search", "不存在的主题zzz")
                cp.wait_for_timeout(700)
                empty_ok = cp.locator(".drawer-empty").count() > 0
                cp.fill("#drawer-search", "")
                cp.wait_for_timeout(700)
                rec("R8", "主题抽屉能列出主题且搜索空态有出口",
                    "PASS" if total > 0 and empty_ok else "FAIL",
                    f"卡片 {total} / 空态={empty_ok}")
                cp.screenshot(path=str(OUT / "drawer.png"))
            except Exception as e:
                rec("R8", "主题抽屉", "FAIL", str(e)[:120])

            c.close()
            b.close()
    finally:
        srv.shutdown()
        srv.server_close()

    n_pass = sum(1 for r in rows if r["status"] == "PASS")
    n_fail = sum(1 for r in rows if r["status"] == "FAIL")
    n_blk = sum(1 for r in rows if r["status"] == "BLOCKED")
    print("\n" + "=" * 62)
    print(f"第二轮：{n_pass} PASS / {n_fail} FAIL / {n_blk} BLOCKED")
    (OUT / "report.json").write_text(json.dumps(
        {"results": rows, "summary": {"pass": n_pass, "fail": n_fail, "blocked": n_blk}},
        ensure_ascii=False, indent=2), encoding="utf-8")
    print(f"报告：{(OUT / 'report.json').relative_to(ROOT)}")
    return 0 if n_fail == 0 else 1


if __name__ == "__main__":
    sys.exit(main())
