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

    def enter_family(pg, fam, wait=320):
        """族视图里家族 chip 会隐藏（切族交给版式条），测试先回到「全部」再用 chip 进入"""
        if pg.locator(f"#drawer-filters .fchip[data-fam='{fam}']").count() == 0:
            pg.click("#drawer-filters .fchip[data-fam='all']")
            pg.wait_for_timeout(250)
        pg.click(f"#drawer-filters .fchip[data-fam='{fam}']")
        pg.wait_for_timeout(wait)

    def style_sig(pg):
        # 2026-10-24：加入节点数与标签名，否则「目录导航」这类只改结构的版式
        # 因为颜色/字体没变而被误判为「无变化」
        return pg.evaluate("""() => {
            const d = document.getElementById('preview').contentDocument;
            if (!d) return '';
            const els = [...d.querySelectorAll('*')];
            const shape = els.length + ':' + els.slice(0, 300).map(e => e.tagName).join(',');
            const styles = els.slice(0, 500).map(e => {
                const s = getComputedStyle(e);
                return s.color + '/' + s.borderColor + '/' + s.backgroundColor + '/'
                    + s.boxShadow + '/' + s.fontFamily;
            }).join(';');
            return shape + '|' + styles;
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
            # 族视图里家族 chip 会隐藏，当前族由「版式」条的选中态表示
            fam_now = page.locator('.d-axis[aria-pressed="true"]').get_attribute("data-fam")
            check("点族代表卡进入该族视图", fam_now not in (None, "all", "fav")
                  and page.locator(".d-tone").count() > 0, f"版式={fam_now}")

            # ② 8 个家族逐一：点数 → 状态 / 胶囊 / toast / 富文本预览差异
            applied = 0
            no_visual = []
            for fam, expected in FAMILIES.items():
                enter_family(page, fam, 320)
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

            # ③b 搜索空态必须有出口（U-8，2026-10-24）：不能是死空白
            page.fill("#drawer-search", "zzz不存在的主题zzz")
            page.wait_for_timeout(250)
            check("搜索无结果时出现空态提示", page.locator(".drawer-empty").count() == 1,
                  f"{page.locator('.drawer-empty').count()} 个")
            acts = page.locator(".drawer-empty [data-empty-act]")
            check("空态提供两个出口（清除搜索/看最近）", acts.count() == 2,
                  f"{acts.count()} 个")
            # 出口一：清除搜索 → 回到正常网格
            page.locator(".drawer-empty [data-empty-act='clear']").click()
            page.wait_for_timeout(250)
            check("「清除搜索」回到正常视图",
                  page.locator(".drawer-empty").count() == 0
                  and page.locator(".d-card").count() > 0
                  and page.input_value("#drawer-search") == "",
                  f"cards={page.locator('.d-card').count()}")
            # 出口二：看最近使用的 → 离开空态（有最近列表或回落全部视图）
            page.fill("#drawer-search", "zzz不存在的主题zzz")
            page.wait_for_timeout(200)
            page.locator(".drawer-empty [data-empty-act='recent']").click()
            page.wait_for_timeout(300)
            check("「看最近使用的」离开空态",
                  page.locator(".drawer-empty").count() == 0
                  and page.locator(".d-card").count() > 0,
                  f"cards={page.locator('.d-card').count()}")

            # ④ 纯文字：同族换色必须有 toast 反馈（预览可能无变化，反馈兜底）
            page.click("#btn-drawer-close")
            page.wait_for_timeout(250)
            page.fill("#input", PLAIN)
            page.wait_for_timeout(1000)
            page.click("#btn-themes")
            page.wait_for_timeout(300)
            enter_family(page, 'minimal', 300)
            t2 = tone_ids(page)[2]
            page.locator(f".d-tone[data-id='{t2}']").click()
            page.wait_for_timeout(500)
            check("纯文字换色有明确反馈（toast）",
                  name_by_id[t2] in page.inner_text("#toast") and page.is_visible("#toast"),
                  page.inner_text("#toast")[:40])

            # ④b 纯文字：每族换色必须真的改变预览（色调可见化，2026-10-24）
            for fam, expected in FAMILIES.items():
                if expected < 2:
                    continue
                enter_family(page, fam, 300)
                ids = tone_ids(page)
                page.locator(f".d-tone[data-id='{ids[0]}']").click()
                page.wait_for_timeout(800)
                s1 = style_sig(page)
                page.locator(f".d-tone[data-id='{ids[1]}']").click()
                page.wait_for_timeout(800)
                s2 = style_sig(page)
                check(f"纯文字下 {fam} 换色可见", s1 != s2,
                      f"{ids[0]} → {ids[1]}")

            # ④c 版式 × 色调二维选择器（2026-10-24）：换版式保留同名色调
            enter_family(page, 'minimal', 320)
            axes = page.locator(".d-axis").count()
            check("族视图出现版式条（8 个）", axes == 8, f"{axes} 个")
            page.locator(".d-tone[data-id='su-minimal-bamboo']").click()
            page.wait_for_timeout(650)
            page.click(".d-axis[data-fam='biz']")
            page.wait_for_timeout(750)
            check("换版式保留色调（素页·竹青 → 卷宗·竹青）", active(page) == "su-biz-bamboo",
                  f"{active(page)}")
            page.click(".d-axis[data-fam='letter']")
            page.wait_for_timeout(750)
            check("继续换版式仍保留竹青", active(page) == "su-letter-bamboo", f"{active(page)}")
            page.locator(".d-tone[data-id='su-letter-blush']").click()
            page.wait_for_timeout(650)
            page.click(".d-axis[data-fam='night']")
            page.wait_for_timeout(750)
            check("换色后再换版式（夜航·粉黛）", active(page) == "su-night-blush", f"{active(page)}")
            page.click(".d-axis[data-fam='dusk']")
            page.wait_for_timeout(750)
            dusk_id = active(page) or ""
            check("目标族无同名色调时回落且不报错", dusk_id.startswith("su-dusk-"),
                  f"{dusk_id} · axis={page.locator('.d-axis[aria-pressed=\"true\"]').get_attribute('data-fam')}")

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

            # ⑤ 自定义配色（最小版，2026-10-24）：改色必须真的改变渲染 + 存本机
            page.click("#btn-drawer-close")
            page.wait_for_timeout(250)
            page.fill("#input", RICH)
            page.wait_for_timeout(900)
            page.click("#btn-themes")
            page.wait_for_timeout(350)
            check("抽屉底部有三个取色器",
                  page.locator("#drawer-custom input[type='color']").count() == 3,
                  f"{page.locator('#drawer-custom input[type=color]').count()} 个")
            sig_before = style_sig(page)
            # 背景改成醒目色（原生 input 用 JS 赋值 + 触发 input 事件）
            page.evaluate("""() => {
                const el = document.getElementById('dc-bg');
                el.value = '#101820'; el.dispatchEvent(new Event('input', {bubbles: true}));
            }""")
            page.wait_for_timeout(1200)
            sig_after = style_sig(page)
            check("改底色立即改变渲染", sig_before != sig_after,
                  "变化" if sig_before != sig_after else "无变化")
            check("自定义配色已存本机",
                  bool(page.evaluate("() => localStorage.getItem('supersu.pwa.custom')")),
                  page.evaluate("() => localStorage.getItem('supersu.pwa.custom')") or "")
            check("胶囊条显示「自定义配色」",
                  "自定义配色" in page.inner_text("#style-caps"),
                  page.inner_text("#style-caps")[:40])
            # 恢复：回到默认主题，自定义配置清掉
            page.click("#dc-reset")
            page.wait_for_timeout(900)
            check("「恢复」清掉自定义配色",
                  page.evaluate("() => localStorage.getItem('supersu.pwa.custom')") is None,
                  "")

            # ⑥ 版式层（B 方案）+ 段落样式开关（C 方案），2026-10-24
            page.click("#btn-themes")
            page.wait_for_timeout(400)
            chips = page.locator(".dl-chip")
            check("版式层有 8 个选项", chips.count() == 8, f"{chips.count()} 个")
            new_lays = ["图文节奏", "卡片流", "目录导航", "杂志分栏"]
            check("版式层含 4 种新版式",
                  all(page.locator(f".dl-chip:has-text('{n}')").count() == 1 for n in new_lays), "")
            page.click(".dl-chip:has-text('卡片流')")
            page.wait_for_timeout(1500)
            check("切「卡片流」版式生效",
                  page.locator(".dl-chip:has-text('卡片流')").get_attribute("aria-pressed") == "true", "")
            sig_card = style_sig(page)
            page.click(".dl-chip:has-text('目录导航')")
            page.wait_for_timeout(1500)
            check("切「目录导航」后预览结构变化", style_sig(page) != sig_card, "")
            check("段落样式有 3 个开关",
                  page.locator("#drawer-blocks input[type='checkbox']").count() == 3,
                  f"{page.locator('#drawer-blocks input').count()} 个")
            page.click("#btn-drawer-close")
            page.wait_for_timeout(300)
            page.fill("#input", RICH + '\n\n他说：“真正让人疲惫的不是工作，是那些没被允许停下来的时刻。”\n')
            page.wait_for_timeout(1300)
            page.click("#btn-themes")
            page.wait_for_timeout(400)
            before_blk = page.evaluate("() => document.getElementById('preview').contentDocument.querySelectorAll('[data-block]').length")
            page.check("#db-quote")
            page.wait_for_timeout(1600)
            after_blk = page.evaluate("() => document.getElementById('preview').contentDocument.querySelectorAll('[data-block]').length")
            check("开「金句」后正文出现色块", after_blk > before_blk, f"{before_blk} → {after_blk}")
            check("段落样式已存本机",
                  bool(page.evaluate("() => localStorage.getItem('supersu.pwa.blocks')")), "")

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
