#!/usr/bin/env python3
"""PWA 模板库全量审计：家族筛选 / 同族换色 / 全部 164 套逐个应用。

背景（2026-10-24 用户报障）：同族 12 套只改「强调色」，纯文字文章里预览几乎无变化，
用户误以为「点了没反应」。本套件把这条链路钉死：
- 每个家族、每个色调点下去都必须真的切换（activeId / 选中态 / 底部胶囊 / toast）
- 富文本下预览颜色必须出现变化（证明换色真的生效，不是假状态）
- 全部 164 套用搜索逐个点一遍，确认没有点不动的模板
- 移动端族视图不横向溢出

用法：
    .venv/Scripts/python.exe scripts/pwa_theme_drawer_test.py
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
OUT = ROOT / "output" / "theme-drawer"
sys.path.insert(0, str(ROOT))

FAMILIES = {
    "stamp": 12, "minimal": 12, "biz": 12, "letter": 12,
    "night": 12, "feast": 12, "dusk": 10, "frost": 1,
}
RICH = (
    "周末去海边\n\n两天的沉默之后，我重新听见了海浪。\n\n"
    "## 第一件事\n\n- 把手机调成飞行模式\n- 只带一本书\n\n> 沉默也是一种回答\n"
)
PLAIN = "周末去海边\n\n两天的沉默之后，我重新听见了海浪、风声，还有自己。\n"

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
    ap.add_argument("--port", type=int, default=8096)
    args = ap.parse_args()

    if not (DIST / "index.html").exists():
        print("ERROR: pwa/dist 不存在，先跑 node pwa/scripts/build.mjs", file=sys.stderr)
        return 2
    if port_busy(args.port):
        print(f"ERROR: 端口 {args.port} 被占用 —— 换 --port", file=sys.stderr)
        return 2

    index = json.loads((DIST / "themes" / "index.json").read_text(encoding="utf-8"))
    all_ids = [t["id"] for t in index]
    name_by_id = {t["id"]: t["name"] for t in index}

    OUT.mkdir(parents=True, exist_ok=True)
    srv = socketserver.ThreadingTCPServer(("127.0.0.1", args.port), functools.partial(_Handler, directory=str(DIST)))
    srv.daemon_threads = True
    srv.request_queue_size = 64
    threading.Thread(target=srv.serve_forever, daemon=True).start()
    url = f"http://127.0.0.1:{args.port}/"

    from playwright.sync_api import sync_playwright
    from core.browser_utils import launch_browser

    errors: list[str] = []

    def active(pg):
        return pg.evaluate("() => localStorage.getItem('supersu.pwa.theme')")

    def pressed(pg):
        return pg.evaluate(
            "() => { const el = document.querySelector('.d-tone[aria-pressed=\"true\"]');"
            " return el ? el.dataset.id : null }")

    def tone_ids(pg):
        return pg.evaluate("() => [...document.querySelectorAll('.d-tone')].map(e => e.dataset.id)")

    def style_sig(pg):
        return pg.evaluate("""() => {
            const d = document.getElementById('preview').contentDocument;
            if (!d) return '';
            return [...d.querySelectorAll('*')].slice(0, 500).map(e => {
                const s = getComputedStyle(e);
                return s.color + '/' + s.borderColor + '/' + s.backgroundColor + '/' + s.fontFamily;
            }).join(';');
        }""")

    try:
        with sync_playwright() as p:
            browser = launch_browser(p, headless=True, args=["--no-proxy-server"])
            ctx = browser.new_context(viewport={"width": 1440, "height": 900})
            page = ctx.new_page()
            page.on("pageerror", lambda e: errors.append(str(e)))
            page.on("console", lambda m: errors.append(m.text)
                    if m.type == "error" and not m.text.startswith("Failed to load resource") else None)

            page.goto(url, wait_until="domcontentloaded", timeout=60000)
            page.wait_for_selector("#engine-badge[data-state='ready']", timeout=120000)
            page.fill("#input", RICH)
            page.wait_for_timeout(1100)
            page.click("#btn-themes")
            page.wait_for_timeout(400)

            chips = page.locator("#drawer-filters .fchip").count()
            check("家族筛选条有 10 个 chip（全部/收藏/8 类）", chips == 10, f"{chips} 个")

            # ① 全部视图：族代表卡 → 进入族视图
            reps = page.locator(".d-family-card").count()
            check("全部视图有 8 张族代表卡", reps == 8, f"{reps} 张")
            page.locator(".d-family-card").first.click()
            page.wait_for_timeout(350)
            fam_now = page.locator('.fchip[aria-pressed="true"]').get_attribute("data-fam")
            check("点族代表卡进入该族视图", fam_now not in ("all", "fav") and page.locator(".d-tone").count() > 0,
                  f"chip={fam_now}")

            # ② 8 个家族逐一：点数 → 状态 / 胶囊 / toast / 富文本预览差异
            applied = 0
            no_visual = []
            for fam, expected in FAMILIES.items():
                page.click(f"#drawer-filters .fchip[data-fam='{fam}']")
                page.wait_for_timeout(320)
                ids = tone_ids(page)
                check(f"{fam} 族色点数 {expected}", len(ids) == expected, f"{len(ids)} 个")
                prev_sig = style_sig(page)
                fam_visual = True
                for tid in ids:
                    page.locator(f".d-tone[data-id='{tid}']").click()
                    page.wait_for_timeout(650)
                    ok_state = active(page) == tid and pressed(page) == tid
                    toast_txt = page.inner_text("#toast")
                    ok_toast = name_by_id.get(tid, tid) in toast_txt
                    if ok_state and ok_toast:
                        applied += 1
                    else:
                        check(f"{fam} 换色 {tid}", False,
                              f"active={active(page)} pressed={pressed(page)} toast={toast_txt[:40]}")
                    sig = style_sig(page)
                    if sig == prev_sig and expected > 1:
                        fam_visual = False
                    prev_sig = sig
                # 底部「风格胶囊」是渲染完成后才更新，这里单独等一次（每族最后一色）
                try:
                    page.wait_for_function(
                        f"() => document.querySelector('#style-caps .cap[aria-pressed=\"true\"]')?.dataset.id === '{ids[-1]}'",
                        timeout=15000)
                    check(f"{fam} 底部胶囊同步选中", True)
                except Exception as e:
                    check(f"{fam} 底部胶囊同步选中", False, str(e)[:80])
                if expected > 1:
                    check(f"{fam} 族内换色在预览里可见", fam_visual)
                    if not fam_visual:
                        no_visual.append(fam)

            check("八族全部色调可点可切换", applied == sum(FAMILIES.values()),
                  f"{applied}/{sum(FAMILIES.values())}")

            # ③ 全部 164 套：搜索逐个应用，确认没有点不动的模板
            bad = []
            page.click("#drawer-filters .fchip[data-fam='all']")
            page.wait_for_timeout(250)
            for tid in all_ids:
                page.fill("#drawer-search", tid)
                page.wait_for_timeout(90)
                card = page.locator(f".d-card[data-id='{tid}']")
                if card.count() == 0:
                    bad.append(f"{tid}:搜索无结果")
                    continue
                card.first.click()
                page.wait_for_timeout(120)
                if active(page) != tid:
                    bad.append(f"{tid}:未切换")
            check("全部 164 套模板逐个可应用", not bad,
                  f"{len(all_ids) - len(bad)}/{len(all_ids)}" + (f" · 失败 {bad[:3]}" if bad else ""))
            page.fill("#drawer-search", "")
            page.wait_for_timeout(200)

            # ④ 纯文字：同族换色必须有 toast 反馈（预览可能无变化，反馈兜底）
            page.click("#btn-drawer-close")
            page.wait_for_timeout(250)
            page.fill("#input", PLAIN)
            page.wait_for_timeout(1000)
            page.click("#btn-themes")
            page.wait_for_timeout(300)
            page.click("#drawer-filters .fchip[data-fam='minimal']")
            page.wait_for_timeout(300)
            t2 = tone_ids(page)[2]
            page.locator(f".d-tone[data-id='{t2}']").click()
            page.wait_for_timeout(500)
            check("纯文字换色有明确反馈（toast）",
                  name_by_id[t2] in page.inner_text("#toast") and page.is_visible("#toast"),
                  page.inner_text("#toast")[:40])

            # ⑤ 移动端：族视图色点条不把页面撑出横向滚动
            m = ctx.new_page()
            m.set_viewport_size({"width": 390, "height": 844})
            m.goto(url, wait_until="domcontentloaded", timeout=60000)
            m.fill("#input", RICH)
            m.wait_for_timeout(1200)
            m.click("#tabs button[data-tab='preview']")   # 风格条在预览页，移动端要先切过去
            m.wait_for_timeout(400)
            m.click("#btn-themes")
            m.wait_for_timeout(400)
            m.click("#drawer-filters .fchip[data-fam='letter']")
            m.wait_for_timeout(400)
            sw, iw = m.evaluate("() => [document.documentElement.scrollWidth, window.innerWidth]")
            check("移动端族视图无横向溢出", sw <= iw, f"scrollWidth={sw}/{iw}")

            page.screenshot(path=str(OUT / "drawer-family.png"))
            check("无 JS 控制台报错", not errors, errors[0][:140] if errors else "")
            browser.close()
    finally:
        srv.shutdown()

    passed = sum(1 for _, ok, _ in results if ok)
    total = len(results)
    print("\n" + "=" * 56)
    print(f"模板库全量审计：{passed}/{total} 通过")
    if no_visual:
        print(f"⚠️ 富文本下也无可见变化：{no_visual}")
    print(f"产物：{OUT}")
    return 0 if passed == total else 1


if __name__ == "__main__":
    raise SystemExit(main())
