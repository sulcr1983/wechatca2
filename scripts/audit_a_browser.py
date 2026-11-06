#!/usr/bin/env python3
"""A 模块浏览器审计（只读，不改产品）

检查的是**产物**，不是控件：
  · copy   ：3 主题 × 3 版式，读剪贴板 text/html（内联样式 / 图片 data URI / 危险标签）
  · kits   ：19 套整篇设计逐套应用 + 锁定态检查 + 逐套截图（目视证据）
  · edges  ：空输入、超长文、断网、AI 门控、清除数据前后

输出：output/audit-2026-11-06/a/browser.json
      output/audit-2026-11-06/a/clip-*.html
      output/audit-2026-11-06/a/kits/<id>.png

用法：
    .venv/Scripts/python.exe scripts/audit_a_browser.py --section copy
    .venv/Scripts/python.exe scripts/audit_a_browser.py --section kits
    .venv/Scripts/python.exe scripts/audit_a_browser.py --section edges
"""
from __future__ import annotations

import argparse
import functools
import http.server
import json
import re
import socketserver
import sys
import threading
import time
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
DIST = ROOT / "pwa" / "dist"
OUT = ROOT / "output" / "audit-2026-11-06" / "a"
sys.path.insert(0, str(ROOT))

MARKER = "审计样本甲乙"
RENDER_TIMEOUT = 45_000


class Quiet(http.server.SimpleHTTPRequestHandler):
    def log_message(self, *args):  # noqa: D401 - 静默
        pass


def start_server():
    httpd = socketserver.ThreadingTCPServer(
        ("127.0.0.1", 0), functools.partial(Quiet, directory=str(DIST)))
    httpd.daemon_threads = True
    threading.Thread(target=httpd.serve_forever, daemon=True).start()
    return httpd, httpd.server_address[1]


def body_html(port: int, image: bool = True, img_query: str = "") -> str:
    img = (f"\n![审计图](http://127.0.0.1:{port}/icons/icon-192.png{img_query})\n"
           if image else "")
    return f"""{MARKER}

这是复制链路的审计正文，包含 **加粗** 和 `代码`。
{img}
## 小节一

- 第一项内容
- 第二项内容

> 引用里的句子也要保留。

## 小节二

结尾标记：审计结束。"""


def ensure_drawer(page):
    if not page.locator("#drawer").is_visible():
        page.click("#btn-themes")
        page.wait_for_selector("#drawer", state="visible", timeout=10_000)


def select_theme(page, tid: str, layout: str | None = None) -> None:
    print(f"    select {tid} / {layout or 'default'}", flush=True)
    ensure_drawer(page)
    mode = "kit" if tid.startswith("mg-") else "palette"
    page.click(f'#drawer-mode-tabs .mode-tab[data-mode="{mode}"]')
    page.fill("#drawer-search", "")
    page.fill("#drawer-search", tid)
    card = f'#drawer-grid .d-card[data-id="{tid}"]'
    page.wait_for_selector(card, timeout=20_000)
    page.click(card)
    if layout is not None and mode == "palette":
        chip = f'#drawer-layouts .dl-chip[data-layout="{layout}"]'
        page.wait_for_selector(chip, timeout=10_000)
        page.click(chip)
        page.wait_for_timeout(250)
    page.click("#btn-drawer-close")
    page.wait_for_selector("#drawer", state="hidden", timeout=10_000)


def wait_render(page, prev: str | None = None, timeout: int | None = None,
                must_contain: str | None = None) -> bool:
    """轮询 srcdoc（不用 wait_for_function：参数序列化在长字符串上容易失配）"""
    timeout = timeout or RENDER_TIMEOUT
    end = time.time() + timeout / 1000
    last = ""
    while time.time() < end:
        try:
            s = page.get_attribute("#preview", "srcdoc") or ""
        except Exception:
            s = ""
        last = s
        if MARKER in s and s != prev and (must_contain is None or must_contain in s):
            return True
        page.wait_for_timeout(500)
    print(f"      render timeout: len={len(last)} marker={MARKER in last} changed={last != prev}",
          flush=True)
    try:
        (OUT / "render-timeout.html").write_text(last, encoding="utf-8")
        print(f"      input={page.input_value('#input')[:60]!r}", flush=True)
    except Exception:
        pass
    return False


def read_clip(page) -> dict:
    try:
        return page.evaluate("""async () => {
            try {
                const items = await navigator.clipboard.read();
                const types = items.map(i => i.types).flat();
                let html = '', text = '';
                for (const it of items) {
                    if (it.types.includes('text/html')) {
                        const b = await it.getType('text/html'); html = await b.text();
                    }
                    if (it.types.includes('text/plain')) {
                        const b = await it.getType('text/plain'); text = await b.text();
                    }
                }
                return { ok: true, types, html, text };
            } catch (e) { return { ok: false, err: String(e) }; }
        }""")
    except Exception as e:  # noqa: BLE001
        return {"ok": False, "err": f"{type(e).__name__}: {e}"}


def copy_and_measure(page, label: str, end_marker: str = "审计结束") -> dict:
    page.wait_for_function(
        "() => { const b = document.getElementById('btn-copy'); return b && !b.disabled; }",
        timeout=90_000)
    # 先清空剪贴板：否则可能读到上一次复制的旧内容，把「没写成」误判成「写成了」
    page.evaluate("""async () => {
        try { await navigator.clipboard.writeText(''); } catch (e) { /* 无权限时忽略 */ }
    }""")
    page.click("#btn-copy")
    res = {"ok": False, "err": "clipboard empty"}
    for _ in range(24):
        page.wait_for_timeout(250)
        res = read_clip(page)
        if res.get("ok") and (res.get("html") or res.get("text")):
            break
    html = res.get("html") or ""
    imgs = re.findall(r'<img[^>]+src="([^"]+)"', html, re.I)
    rec = {
        "label": label,
        "clipboard_ok": bool(res.get("ok")),
        "types": res.get("types"),
        "err": res.get("err"),
        "html_len": len(html),
        "text_len": len(res.get("text") or ""),
        "has_marker": MARKER in html,
        "has_end": end_marker in html,
        "inline_style_attrs": len(re.findall(r'style="', html)),
        "class_attrs": len(re.findall(r'class="', html)),
        "h1": len(re.findall(r"<h1\b", html, re.I)),
        "h2": len(re.findall(r"<h2\b", html, re.I)),
        "img": len(imgs),
        "img_data_uri": sum(1 for s in imgs if s.startswith("data:")),
        "img_http": sum(1 for s in imgs if s.startswith("http")),
        "script": bool(re.search(r"<script\b", html, re.I)),
        "handler": bool(re.search(r"\son\w+\s*=", html, re.I)),
        "js_url": "javascript:" in html.lower(),
        "stylesheet_link": bool(re.search(r'<link[^>]+stylesheet', html, re.I)),
    }
    OUT.mkdir(parents=True, exist_ok=True)
    (OUT / f"clip-{label}.html").write_text(html, encoding="utf-8")
    return rec


def section_copy(page, port: int, results: dict) -> None:
    combos = [
        ("aurora", ""), ("aurora", "rhythm"), ("aurora", "hero"),
        ("su-minimal-azure", ""), ("su-minimal-azure", "outline"), ("su-minimal-azure", "magazine"),
        ("su-dusk-amber", ""), ("su-dusk-amber", "cardflow"), ("su-dusk-amber", "timeline"),
    ]
    rows = []
    for tid, layout in combos:
        prev = page.get_attribute("#preview", "srcdoc") or ""
        try:
            select_theme(page, tid, layout)
        except Exception as e:  # noqa: BLE001
            rows.append({"theme": tid, "layout": layout or "default",
                         "error": f"select: {type(e).__name__}: {e}"})
            continue
        ok = wait_render(page, prev)
        row = {"theme": tid, "layout": layout or "default", "rendered": ok}
        if ok:
            row.update(copy_and_measure(page, f"{tid}-{layout or 'default'}"))
        rows.append(row)
        print("  copy", tid, layout or "default", "rendered", ok, flush=True)
    results["copy"] = rows


def open_settings(page) -> None:
    page.click("#btn-more")
    page.wait_for_selector('#menu button[data-act="settings"]', timeout=5_000)
    page.click('#menu button[data-act="settings"]')
    page.wait_for_selector("#settings-dlg", state="visible", timeout=5_000)


def close_settings(page) -> None:
    page.click("#btn-settings-close")
    page.wait_for_selector("#settings-dlg", state="hidden", timeout=5_000)


def section_kits(page, results: dict) -> None:
    kits_dir = OUT / "kits"
    kits_dir.mkdir(parents=True, exist_ok=True)
    ids = sorted(p.stem for p in (ROOT / "public" / "themes").glob("mg-*.json"))
    rows = []
    for tid in ids:
        prev = page.get_attribute("#preview", "srcdoc") or ""
        try:
            select_theme(page, tid)
        except Exception as e:  # noqa: BLE001
            rows.append({"kit": tid, "error": f"select: {type(e).__name__}: {e}"})
            continue
        rendered = wait_render(page, prev)
        # 抽屉仍开着：读锁定态
        ensure_drawer(page)
        lock = {
            "dl_chips": page.locator("#drawer-layouts .dl-chip").count(),
            "dl_locked_text": (page.inner_text("#drawer-layouts .dl-locked")
                               if page.locator("#drawer-layouts .dl-locked").count() else ""),
            "kit_note_visible": page.locator("#kit-note").is_visible(),
            "kit_note_text": page.inner_text("#kit-note")[:200] if page.locator("#kit-note").count() else "",
        }
        page.click("#btn-drawer-close")
        page.wait_for_selector("#drawer", state="hidden", timeout=10_000)
        # 截图（预览区）
        shot = kits_dir / f"{tid}.png"
        try:
            page.locator("#preview-wrap").screenshot(path=str(shot))
        except Exception:  # noqa: BLE001
            page.locator("#preview").screenshot(path=str(shot))
        # 设置弹窗：背景是否真禁用（E-1 复现）
        open_settings(page)
        bg_total = page.locator("#set-grid-bg .bg-card").count()
        bg_disabled = page.locator("#set-grid-bg .bg-card[disabled]").count()
        note = page.inner_text("#set-bg-note")
        bg_before = page.evaluate("() => localStorage.getItem('supersu.pwa.pagebg')")
        clicked = False
        if bg_disabled == 0 and bg_total:
            try:
                page.locator("#set-grid-bg .bg-card").nth(1).click()
                clicked = True
                page.wait_for_timeout(200)
            except Exception:  # noqa: BLE001
                pass
        bg_after = page.evaluate("() => localStorage.getItem('supersu.pwa.pagebg')")
        close_settings(page)
        rows.append({"kit": tid, "rendered": rendered, "screenshot": str(shot.relative_to(ROOT)),
                     "lock": lock, "bg_total": bg_total, "bg_disabled": bg_disabled,
                     "bg_note": note, "bg_clicked": clicked,
                     "bg_before": bg_before, "bg_after": bg_after})
        print("  kit", tid, "rendered", rendered, "bg_disabled", bg_disabled, flush=True)
    results["kits"] = rows


def section_edges(page, context, port: int, results: dict, errors: list[str]) -> None:
    OUT.mkdir(parents=True, exist_ok=True)
    edges: dict = {}

    # 空输入
    page.fill("#input", "")
    page.wait_for_timeout(800)
    edges["empty"] = {
        "preview_empty_visible": page.locator("#preview-empty").is_visible(),
        "copy_disabled": page.locator("#btn-copy").is_disabled(),
        "parse_bar_text": page.inner_text("#parse-body")[:120],
    }

    # 超长文
    prev = page.get_attribute("#preview", "srcdoc") or ""
    page.fill("#input", body_html(port, image=False))
    wait_render(page, prev, 60_000)
    paras = "\n\n".join(f"第 {i} 段：这是用于压力测试的正文，确认长文不会被截断。" for i in range(1, 401))
    long_text = f"{MARKER}\n\n{long_text_head()}\n\n{paras}\n\n长文结尾标记。"
    t0 = time.time()
    prev = page.get_attribute("#preview", "srcdoc") or ""
    page.fill("#input", long_text)
    ok_long = wait_render(page, prev, 120_000, must_contain="长文结尾标记")
    elapsed = round(time.time() - t0, 1)
    long_clip = {}
    if ok_long:
        long_clip = copy_and_measure(page, "long", "长文结尾标记")
    edges["long"] = {
        "chars": len(long_text), "render_ok": ok_long, "render_seconds": elapsed,
        "clipboard_has_end": bool(long_clip.get("has_end")),
        "clipboard_html_len": long_clip.get("html_len"),
    }

    # 断网：用**未缓存过**的 URL（带唯一查询串），确保走真实失败路径
    unique = f"?audit={int(time.time() * 1000)}"
    prev = page.get_attribute("#preview", "srcdoc") or ""
    page.fill("#input", body_html(port, image=True, img_query=unique))
    img_ready = wait_render(page, prev, 60_000, must_contain=unique)
    context.set_offline(True)
    page.wait_for_timeout(500)
    offline_clip = copy_and_measure(page, "offline")
    toast = page.inner_text("#toast") if page.locator("#toast").count() else ""
    edges["offline"] = {
        "image_rendered_before_offline": img_ready,
        "clipboard_ok": offline_clip.get("clipboard_ok"),
        "img": offline_clip.get("img"),
        "img_data_uri": offline_clip.get("img_data_uri"),
        "img_http": offline_clip.get("img_http"),
        "toast": toast[:200],
    }
    context.set_offline(False)

    # 图片失败路径：404（在线，确保不是缓存/离线问题）
    missing = (body_html(port, image=False)
               .replace("## 小节一", f"![缺失图](http://127.0.0.1:{port}/icons/audit-missing.png)\n\n## 小节一"))
    prev = page.get_attribute("#preview", "srcdoc") or ""
    page.fill("#input", missing)
    wait_render(page, prev, 60_000, must_contain="audit-missing.png")
    fail_clip = copy_and_measure(page, "imagefail")
    fail_toast = page.inner_text("#toast") if page.locator("#toast").count() else ""
    edges["image_fail"] = {
        "clipboard_ok": fail_clip.get("clipboard_ok"),
        "img": fail_clip.get("img"),
        "img_data_uri": fail_clip.get("img_data_uri"),
        "img_http": fail_clip.get("img_http"),
        "toast": fail_toast[:240],
    }

    # AI 门控（未配置时入口不应显形 / 不应自动请求）
    edges["ai_gate"] = {
        "row_hidden": page.locator("#btn-ai-format-row").evaluate("el => el.hidden"),
        "ai_btn_visible": page.locator("#btn-ai").is_visible(),
    }

    # 清除数据：键数量前后
    before_keys = page.evaluate("() => Object.keys(localStorage).filter(k => k.startsWith('supersu.'))")
    edges["storage_keys"] = {"count": len(before_keys), "keys": sorted(before_keys)}

    edges["page_errors"] = errors[-20:]
    results["edges"] = edges


def long_text_head() -> str:
    return """## 第一节

这是一段用于压力测试的正文，包含 **加粗**、*斜体* 和 `代码`。

- 列表项一
- 列表项二
- 列表项三

> 引用块也要保留。"""


def main() -> int:
    ap = argparse.ArgumentParser()
    ap.add_argument("--section", choices=["copy", "kits", "edges", "all"], default="copy")
    ap.add_argument("--engine-timeout", type=int, default=240_000)
    ap.add_argument("--render-timeout", type=int, default=45_000)
    args = ap.parse_args()
    global RENDER_TIMEOUT
    RENDER_TIMEOUT = args.render_timeout

    OUT.mkdir(parents=True, exist_ok=True)
    httpd, port = start_server()
    results: dict = {"port": port, "generatedAt": time.strftime("%Y-%m-%d %H:%M:%S")}
    errors: list[str] = []

    from playwright.sync_api import sync_playwright
    from core.browser_utils import launch_browser
    from core.pwa_test_utils import wait_engine_ready

    with sync_playwright() as p:
        browser = launch_browser(p, headless=True,
                                 args=["--force-device-scale-factor=1", "--high-dpi-support=0"])
        context = browser.new_context(
            viewport={"width": 1440, "height": 900},
            permissions=["clipboard-read", "clipboard-write"],
            accept_downloads=True,
        )
        page = context.new_page()
        page.on("pageerror", lambda e: errors.append(str(e)[:300]))
        page.on("requestfailed", lambda r: errors.append(f"reqfail:{r.url[:120]} {r.failure}"))
        page.goto(f"http://127.0.0.1:{port}/", wait_until="domcontentloaded", timeout=120_000)
        page.fill("#input", body_html(port))
        ready = wait_engine_ready(page, timeout=240_000, fill=False)
        results["engine_ready"] = ready
        print("engine ready:", ready, flush=True)
        if not ready:
            results["errors"] = errors
            (OUT / "browser.json").write_text(json.dumps(results, ensure_ascii=False, indent=2),
                                             encoding="utf-8")
            browser.close()
            httpd.shutdown()
            return 2

        if args.section in ("copy", "all"):
            section_copy(page, port, results)
        if args.section in ("kits", "all"):
            section_kits(page, results)
        if args.section in ("edges", "all"):
            section_edges(page, context, port, results, errors)

        results["errors"] = errors[-30:]
        (OUT / "browser.json").write_text(json.dumps(results, ensure_ascii=False, indent=2),
                                         encoding="utf-8")
        browser.close()
    httpd.shutdown()
    print("→", OUT / "browser.json")
    if "copy" in results:
        for r in results["copy"]:
            print(" ", r.get("theme"), r.get("layout"), "render", r.get("rendered"),
                  "clip", r.get("clipboard_ok"), "marker", r.get("has_marker"),
                  "style", r.get("inline_style_attrs"), "img_data", r.get("img_data_uri"))
    if "kits" in results:
        bad = [r for r in results["kits"] if r.get("bg_disabled", 0) == 0]
        print(f"  kits: {len(results['kits'])} 套；背景未禁用 {len(bad)} 套")
    return 0


if __name__ == "__main__":
    sys.exit(main())
