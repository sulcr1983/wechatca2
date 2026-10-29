#!/usr/bin/env python3
"""独立质量诊断 E2E（2026-10-30）—— 不复用项目门禁断言，只做「用户视角」的真实验证。

设计动机（为什么要另写一套，而不是直接跑现有门禁）：
  现有门禁的断言大量停留在「有反馈 / 按钮可用 / toast 可见」这一层。
  例如 pwa_headed_full_e2e.py 对「复制到公众号」只检查 #toast 是否出现，
  **从不读取剪贴板里的实际内容**。而「复制到公众号」是本产品的核心交付动作，
  富文本是否真的带样式写进剪贴板，直接决定用户粘进公众号后台后是否还需要重排。

本脚本只验证「最终产物」，不验证「按钮有没有反应」：
  A. 剪贴板：真的读回 text/html，检查是否含内联样式、是否含正文文字
  B. 导出：真的抓下载文件，检查字节数/PNG 尺寸/内容关键字
  C. 持久化：刷新后草稿/主题/收藏是否还在，内容是否被截断或替换
  D. 清除本地数据：确认「清除本地数据」是否真的清干净（含 Key）
  E. 边界：超长文本 / 特殊字符 / 空输入
  F. 控制台：全程收集 JS 报错与失败请求

运行方式（与项目现有套件一致：系统 Chrome + 自起静态服务）：
    .venv/Scripts/python.exe scripts/qa_independent_e2e.py
    .venv/Scripts/python.exe scripts/qa_independent_e2e.py --url https://supersu-pwa.pages.dev/
    .venv/Scripts/python.exe scripts/qa_independent_e2e.py --port 8071

产物：output/qa-independent/（截图 + report.json）
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
OUT = ROOT / "output" / "qa-independent"
sys.path.insert(0, str(ROOT))

results: list[dict] = []
shot_no = 0

TEXT_BASIC = """周末去海边，我把手机调成了飞行模式

出发前一晚我还在改稿，凌晨两点关电脑，第二天六点的车。

为什么要跑那么远

城市里的安静是借来的。图书馆四点半闭馆，咖啡馆九点打烊。

- 第一天下午到的，风很大
- 第二天退潮，捡了半袋碎贝壳
"""


def rec(cid: str, name: str, status: str, detail: str = "", shot: str = "") -> None:
    """status: PASS / FAIL / BLOCKED / NOTRUN"""
    results.append({"id": cid, "name": name, "status": status,
                    "detail": str(detail)[:500], "shot": shot})
    icon = {"PASS": "  PASS  ", "FAIL": "  FAIL  ", "BLOCKED": " BLOCK ",
            "NOTRUN": " NOTRUN "}.get(status, status)
    print(icon + f"[{cid}] " + name + (f"  | {detail}" if detail else ""), flush=True)


class _Handler(http.server.SimpleHTTPRequestHandler):
    def log_message(self, *a):
        pass


def port_busy(port: int) -> bool:
    with socket.socket() as s:
        s.settimeout(0.4)
        return s.connect_ex(("127.0.0.1", port)) == 0


def png_size(data: bytes) -> tuple[int, int] | None:
    """从 PNG 字节里读 IHDR 宽高（不依赖 PIL）。"""
    if len(data) < 24 or data[:8] != b"\x89PNG\r\n\x1a\n":
        return None
    if data[12:16] != b"IHDR":
        return None
    w, h = struct.unpack(">II", data[16:24])
    return w, h


def main() -> int:
    try:
        sys.stdout.reconfigure(encoding="utf-8", errors="replace")
    except Exception:
        pass

    ap = argparse.ArgumentParser()
    ap.add_argument("--url", default="", help="测线上地址；留空则自起本地 dist 服务")
    ap.add_argument("--port", type=int, default=8071)
    ap.add_argument("--slow", type=float, default=1.0, help="等待倍数（弱网/线上调大）")
    args = ap.parse_args()

    OUT.mkdir(parents=True, exist_ok=True)

    srv = None
    thread = None
    if args.url:
        url = args.url
    else:
        if port_busy(args.port):
            print(f"ERROR: 端口 {args.port} 被占用 —— 换 --port", file=sys.stderr)
            return 2
        handler = functools.partial(_Handler, directory=str(DIST))
        srv = socketserver.ThreadingTCPServer(("127.0.0.1", args.port), handler)
        srv.daemon_threads = True
        thread = threading.Thread(target=srv.serve_forever, daemon=True)
        thread.start()
        url = f"http://127.0.0.1:{args.port}/"

    print(f"目标：{url}\n产物：{OUT}\n", flush=True)

    from playwright.sync_api import sync_playwright
    from core.browser_utils import launch_browser
    from core.pwa_test_utils import wait_engine_ready

    W = args.slow

    def snap(page, name: str) -> str:
        global shot_no
        shot_no += 1
        p = OUT / f"{shot_no:02d}-{name}.png"
        try:
            page.screenshot(path=str(p))
        except Exception:
            return ""
        return str(p.relative_to(ROOT))

    def toast_text(page) -> str:
        try:
            return page.inner_text("#toast").strip() if page.is_visible("#toast") else ""
        except Exception:
            return ""

    console: list[str] = []
    failed_req: list[str] = []

    try:
        with sync_playwright() as p:
            browser = launch_browser(p, headless=True)
            ctx = browser.new_context(
                viewport={"width": 1440, "height": 900},
                # 剪贴板权限：不授权的话 copyRich 的一级路径必然失败，
                # 测出来的「复制成功」就是假的（会落到 execCommand 兜底）
                permissions=["clipboard-read", "clipboard-write"],
                accept_downloads=True,
            )
            page = ctx.new_page()
            page.on("console", lambda m: console.append(f"{m.type}: {m.text}")
                    if m.type in ("error", "warning") else None)
            page.on("pageerror", lambda e: console.append(f"pageerror: {e}"))
            page.on("requestfailed",
                    lambda r: failed_req.append(f"{r.url} :: {r.failure}"))

            # ── A. 基础渲染 ────────────────────────────────────────
            page.goto(url, wait_until="domcontentloaded", timeout=120_000)
            page.fill("#input", TEXT_BASIC)
            ok = wait_engine_ready(page, timeout=int(180_000 * W), fill=False)
            rec("E2E-01", "引擎加载并就绪（#engine-badge=ready 或复制可用）",
                "PASS" if ok else "FAIL",
                page.evaluate("() => document.getElementById('engine-text')?.textContent || ''"),
                snap(page, "engine-ready"))
            if not ok:
                rec("E2E-02", "精确排版产出预览 HTML", "BLOCKED", "引擎未就绪，后续阻断")

            page.wait_for_timeout(int(1200 * W))
            html_len = page.evaluate(
                "(() => { const f=document.getElementById('preview');"
                "return f && f.contentDocument ? f.contentDocument.body.innerHTML.length : 0; })()")
            rec("E2E-02", "精确排版产出预览 HTML（iframe 内有实际内容）",
                "PASS" if html_len > 200 else "FAIL", f"innerHTML {html_len} 字符",
                snap(page, "rendered"))

            # 预览里是否真的套了主题内联样式（而不是裸 HTML）
            inline_styled = page.evaluate(
                "(() => { const f=document.getElementById('preview');"
                "if(!f||!f.contentDocument) return 0;"
                "return Array.from(f.contentDocument.querySelectorAll('[style]')).length; })()")
            rec("E2E-03", "预览元素带内联样式（公众号粘贴依赖这个）",
                "PASS" if inline_styled > 5 else "FAIL", f"{inline_styled} 个带 style 的元素")

            # 标题是否真的进了 h1
            h1 = page.evaluate(
                "(() => { const f=document.getElementById('preview');"
                "return f&&f.contentDocument ? (f.contentDocument.querySelector('h1')?.textContent||'') : ''; })()")
            rec("E2E-04", "首行被识别为大标题（h1 文本正确）",
                "PASS" if "周末去海边" in h1 else "FAIL", f"h1='{h1[:40]}'")

            # ── B. 剪贴板真实内容 ──────────────────────────────────
            page.click("#btn-copy")
            page.wait_for_timeout(int(900 * W))
            clip = page.evaluate("""async () => {
                try {
                    const items = await navigator.clipboard.read();
                    const out = [];
                    for (const it of items) {
                        out.push({ types: it.types });
                    }
                    return { ok: true, items: out };
                } catch (e) { return { ok: false, err: String(e) }; }
            }""")
            rec("E2E-05", "复制后剪贴板可读且含 text/html",
                "PASS" if clip.get("ok") and any("text/html" in i["types"]
                                                 for i in clip.get("items", [])) else "FAIL",
                json.dumps(clip, ensure_ascii=False)[:200])

            clip_html = page.evaluate("""async () => {
                try {
                    const items = await navigator.clipboard.read();
                    for (const it of items) {
                        if (it.types.includes('text/html')) {
                            const b = await it.getType('text/html');
                            return await b.text();
                        }
                    }
                    return '';
                } catch (e) { return 'ERR:' + String(e); }
            }""")
            has_inline = 'style="' in clip_html
            has_text = "周末去海边" in clip_html
            rec("E2E-06", "剪贴板 HTML 含内联样式（公众号粘贴后不掉样式）",
                "PASS" if has_inline else "FAIL", f"{len(clip_html)} 字符, style={has_inline}")
            rec("E2E-07", "剪贴板 HTML 含正文文字（不是空壳）",
                "PASS" if has_text else "FAIL", f"含标题={has_text}")
            (OUT / "clipboard.html").write_text(clip_html, encoding="utf-8")

            rec("E2E-08", "复制后有用户可见反馈", "PASS" if toast_text(page) else "FAIL",
                toast_text(page))

            # ── C. 持久化：刷新后草稿是否保留 ──────────────────────
            page.reload(wait_until="domcontentloaded", timeout=120_000)
            page.wait_for_timeout(int(1500 * W))
            val_after = page.input_value("#input")
            same = val_after.strip() == TEXT_BASIC.strip()
            rec("E2E-09", "刷新后草稿内容完整保留（无截断/重复）",
                "PASS" if same else "FAIL",
                f"原 {len(TEXT_BASIC.strip())} 字 / 现 {len(val_after.strip())} 字",
                snap(page, "after-reload"))
            if not same:
                rec("E2E-09b", "草稿差异定位", "FAIL",
                    f"现文前 60 字='{val_after[:60]}'")

            # ── D. 主题切换持久化 ──────────────────────────────────
            ok2 = wait_engine_ready(page, timeout=int(180_000 * W), fill=False)
            page.wait_for_timeout(int(1000 * W))
            before_theme = page.evaluate(
                "document.querySelector('.cap[aria-pressed=\"true\"]')?.dataset.id || ''")
            # 点第二个色卡换主题
            caps = page.locator(".style-caps .cap")
            n_caps = caps.count()
            rec("E2E-10", "风格胶囊条有可用主题", "PASS" if n_caps >= 5 else "FAIL",
                f"{n_caps} 个色卡")
            if n_caps >= 2:
                caps.nth(1).click()
                page.wait_for_timeout(int(1600 * W))
                after_theme = page.evaluate(
                    "document.querySelector('.cap[aria-pressed=\"true\"]')?.dataset.id || ''")
                rec("E2E-11", "点击色卡切换主题生效",
                    "PASS" if after_theme and after_theme != before_theme else "FAIL",
                    f"{before_theme} → {after_theme}", snap(page, "theme-switched"))

                page.reload(wait_until="domcontentloaded", timeout=120_000)
                page.wait_for_timeout(int(1200 * W))
                persisted = page.evaluate(
                    "document.querySelector('.cap[aria-pressed=\"true\"]')?.dataset.id || ''")
                rec("E2E-12", "刷新后主题选择被记住",
                    "PASS" if persisted == after_theme else "FAIL",
                    f"期望 {after_theme} / 实际 {persisted}")

            # ── E. 导出产物真实性 ─────────────────────────────────
            wait_engine_ready(page, timeout=int(180_000 * W), fill=False)
            page.wait_for_timeout(int(1000 * W))

            # Markdown
            page.click("#btn-export")
            page.wait_for_timeout(300)
            try:
                with page.expect_download(timeout=int(60_000 * W)) as dl:
                    page.click("#menu-export button[data-exp='md']")
                d = dl.value
                path = OUT / ("dl-" + (d.suggested_filename or "x.md"))
                d.save_as(str(path))
                body = path.read_text(encoding="utf-8", errors="replace")
                rec("E2E-13", "导出 Markdown：文件真实落盘且含正文",
                    "PASS" if path.stat().st_size > 100 and "周末去海边" in body else "FAIL",
                    f"{d.suggested_filename} / {path.stat().st_size}B", snap(page, "export-md"))
            except Exception as e:
                rec("E2E-13", "导出 Markdown", "FAIL", f"异常：{e}")
                page.keyboard.press("Escape")

            # HTML
            page.click("#btn-export")
            page.wait_for_timeout(300)
            try:
                with page.expect_download(timeout=int(60_000 * W)) as dl:
                    page.click("#menu-export button[data-exp='html']")
                d = dl.value
                path = OUT / ("dl-" + (d.suggested_filename or "x.html"))
                d.save_as(str(path))
                h = path.read_text(encoding="utf-8", errors="replace")
                okh = (path.stat().st_size > 500 and "周末去海边" in h
                       and "<!DOCTYPE html>" in h)
                rec("E2E-14", "导出 HTML：自包含文档且含正文与内联样式",
                    "PASS" if okh else "FAIL",
                    f"{d.suggested_filename} / {path.stat().st_size}B / style={'style=\"' in h}",
                    snap(page, "export-html"))
            except Exception as e:
                rec("E2E-14", "导出 HTML", "FAIL", f"异常：{e}")
                page.keyboard.press("Escape")

            # 长图 PNG
            page.click("#btn-export")
            page.wait_for_timeout(300)
            try:
                with page.expect_download(timeout=int(120_000 * W)) as dl:
                    page.click("#menu-export button[data-exp='long']")
                d = dl.value
                path = OUT / ("dl-" + (d.suggested_filename or "x.png"))
                d.save_as(str(path))
                data = path.read_bytes()
                dim = png_size(data)
                okp = bool(dim) and dim[0] == 1080 and dim[1] > 400
                rec("E2E-15", "导出长图 PNG：真实 PNG 且宽度 1080、高度合理",
                    "PASS" if okp else "FAIL",
                    f"{d.suggested_filename} / {len(data)}B / 尺寸={dim}",
                    snap(page, "export-long"))
            except Exception as e:
                rec("E2E-15", "导出长图 PNG", "FAIL", f"异常：{e}")
                page.keyboard.press("Escape")

            # ── F. 边界：超长文本 ─────────────────────────────────
            long_text = ("这是一个用于压力测试的段落，包含中文标点，以及英文 mixed content 混排。" * 8 + "\n\n") * 60
            page.fill("#input", long_text)
            page.wait_for_timeout(int(400 * W))
            t0 = time.time()
            try:
                page.wait_for_function(
                    "() => !document.getElementById('btn-copy').disabled",
                    timeout=int(90_000 * W))
                elapsed = time.time() - t0
                hlen = page.evaluate(
                    "(() => { const f=document.getElementById('preview');"
                    "return f&&f.contentDocument ? f.contentDocument.body.innerHTML.length : 0; })()")
                rec("E2E-16", f"超长文本（约 {len(long_text)} 字）能排版完成",
                    "PASS" if hlen > 1000 else "FAIL",
                    f"耗时 {elapsed:.1f}s / 预览 {hlen} 字符")
            except Exception as e:
                rec("E2E-16", "超长文本排版", "FAIL", f"超时或失败：{str(e)[:150]}")

            # ── G. 边界：特殊字符 ─────────────────────────────────
            special = '标题 <script>alert(1)</script> & "引号" \'单引号\'\n\n正文含 <b>标签</b> 与 & 符号，还有 emoji 🎉'
            page.fill("#input", special)
            page.wait_for_timeout(int(1400 * W))
            prev = page.evaluate(
                "(() => { const f=document.getElementById('preview');"
                "return f&&f.contentDocument ? f.contentDocument.body.innerHTML : ''; })()")
            # 关键：script 不能真的被执行/存活成标签
            has_script_tag = "<script>" in prev.lower()
            rec("E2E-17", "特殊字符不破坏预览（HTML 被转义，未注入 script）",
                "PASS" if prev and not has_script_tag else "FAIL",
                f"预览 {len(prev)} 字符 / 存活 script 标签={has_script_tag}",
                snap(page, "special-chars"))

            # ── H. 空输入 ─────────────────────────────────────────
            page.fill("#input", "")
            page.wait_for_timeout(int(600 * W))
            empty_ok = page.evaluate(
                "(() => ({copy: document.getElementById('btn-copy').disabled,"
                " empty: !document.getElementById('preview-empty').hidden}))()")
            rec("E2E-18", "清空后回到空态且复制按钮禁用",
                "PASS" if empty_ok.get("copy") and empty_ok.get("empty") else "FAIL",
                json.dumps(empty_ok), snap(page, "empty"))

            # ── I. 清除本地数据是否真的清干净 ─────────────────────
            # 先写入一组「用户敏感」数据：AI Key + 图库 Key
            page.evaluate("""() => {
                localStorage.setItem('supersu.ai', JSON.stringify(
                    {baseUrl:'https://api.deepseek.com/v1', model:'deepseek-chat', key:'sk-QA-TEST-KEY'}));
                localStorage.setItem('supersu.cover.stock.v1', JSON.stringify({pexels:'QA-PEXELS-KEY'}));
            }""")
            keys_before = page.evaluate("() => Object.keys(localStorage)")
            page.click("#btn-more")
            page.wait_for_timeout(300)
            page.once("dialog", lambda d: d.accept())
            page.click("#menu button[data-act='clear-all']")
            page.wait_for_timeout(int(1200 * W))
            keys_after = page.evaluate("() => Object.keys(localStorage)")
            leaked = [k for k in keys_after if "ai" in k or "stock" in k]
            leaked_vals = page.evaluate("""() => {
                const out = {};
                for (const k of Object.keys(localStorage)) {
                    const v = localStorage.getItem(k) || '';
                    if (v.includes('QA-TEST-KEY') || v.includes('QA-PEXELS-KEY')) out[k] = v.slice(0,80);
                }
                return out;
            }""")
            rec("E2E-19", "「清除本地数据」后 AI Key / 图库 Key 是否被清除",
                "PASS" if not leaked_vals else "FAIL",
                f"清除前 {len(keys_before)} 键 → 清除后 {len(keys_after)} 键；残留敏感键={list(leaked_vals)}",
                snap(page, "clear-all"))

            # ── J. 控制台健康度 ───────────────────────────────────
            real_errs = [c for c in console if c.startswith("pageerror") or c.startswith("error")]
            # 过滤与本次测试无关的、外部资源噪音
            noise = ("favicon", "net::ERR_", "Failed to load resource")
            real_errs = [c for c in real_errs if not any(n in c for n in noise)]
            rec("E2E-20", "全程无未处理 JS 报错", "PASS" if not real_errs else "FAIL",
                "; ".join(real_errs[:3])[:300])

            bad_req = [r for r in failed_req if "/runtime/" not in r]
            rec("E2E-21", "无异常失败的同源请求", "PASS" if not bad_req else "FAIL",
                "; ".join(bad_req[:3])[:300])

            browser.close()
    except Exception as e:
        rec("E2E-XX", "测试执行异常", "BLOCKED", f"{type(e).__name__}: {e}")
    finally:
        if srv:
            srv.shutdown()
            srv.server_close()

    # ── 汇总 ──────────────────────────────────────────────────
    n_pass = sum(1 for r in results if r["status"] == "PASS")
    n_fail = sum(1 for r in results if r["status"] == "FAIL")
    n_block = sum(1 for r in results if r["status"] == "BLOCKED")
    n_skip = sum(1 for r in results if r["status"] == "NOTRUN")
    print("\n" + "=" * 62)
    print(f"独立诊断 E2E：{n_pass} PASS / {n_fail} FAIL / {n_block} BLOCKED / {n_skip} NOTRUN")
    (OUT / "report.json").write_text(
        json.dumps({"url": url, "results": results,
                    "summary": {"pass": n_pass, "fail": n_fail,
                                "blocked": n_block, "notrun": n_skip}},
                   ensure_ascii=False, indent=2), encoding="utf-8")
    print(f"报告：{(OUT / 'report.json').relative_to(ROOT)}")
    return 0 if n_fail == 0 else 1


if __name__ == "__main__":
    sys.exit(main())
