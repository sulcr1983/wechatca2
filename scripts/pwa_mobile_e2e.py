#!/usr/bin/env python
"""PWA 移动端视口 E2E（390×844，iPhone 14 尺寸）

为什么单独有这一支：
  桌面端是三栏/抽屉，手机上布局完全换了一套（底部「内容/预览」页签、
  主题条只在预览页签可见、封面页退化成单栏），
  很多问题（横向滚动、按钮被挤没、预览排到结果后面）只在窄屏才暴露。

移动端实测的界面事实（2026-10-27 探查，写进注释免得下次又猜）：
  · 顶栏：小红书标题图生成 / 导出▾ / AI / ⋯          （⋯ 里只有草稿·数据·更新·关于）
  · 底部页签：内容 | 预览
  · 主题条 .style-bar 已提到 .stage 层（2026-10-27），两个页签都常驻可见
  · 主题弹层 id 是 #drawer（不是 theme-drawer）

用法：
  python scripts/pwa_mobile_e2e.py              # 打线上 https://supersu.ccwu.cc/
  python scripts/pwa_mobile_e2e.py --local      # 打本地 pwa/dist
"""
import sys
import threading
import functools
import http.server
import socketserver
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent.parent))

from playwright.sync_api import sync_playwright          # noqa: E402
from core.browser_utils import launch_browser            # noqa: E402
from core.pwa_test_utils import wait_engine_ready        # noqa: E402

ROOT = Path(__file__).resolve().parent.parent
DIST = ROOT / "pwa" / "dist"
SHOTS = ROOT / "output" / "mobile-e2e"
VP = {"width": 390, "height": 844}

TEXT = ("周末去海边\n\n两天的沉默之后，我重新听见了海浪、风声，还有自己。"
        "城市里的声音太密，密到让人忘了什么叫安静。\n\n"
        "出发前的那点犹豫\n\n行李收了一半又放下，总觉得有事情没做完。")

results = []


def check(name, ok, expect="", actual=""):
    results.append((name, ok))
    print(f"  [{'PASS' if ok else 'FAIL'}] {name}"
          + (f"  |  预期 {expect}  实际 {actual}" if expect or actual else ""))


class Quiet(http.server.SimpleHTTPRequestHandler):
    def log_message(self, *a):
        pass


def serve():
    srv = socketserver.ThreadingTCPServer(
        ("127.0.0.1", 8481), functools.partial(Quiet, directory=str(DIST)))
    srv.daemon_threads = True
    threading.Thread(target=srv.serve_forever, daemon=True).start()
    return srv


def no_hscroll(page):
    return not page.evaluate("() => document.documentElement.scrollWidth > window.innerWidth + 2")


def main():
    local = "--local" in sys.argv
    SHOTS.mkdir(parents=True, exist_ok=True)
    srv = serve() if local else None
    url = "http://127.0.0.1:8481/" if local else "https://supersu.ccwu.cc/"
    print(f"移动端 E2E → {url}（{VP['width']}×{VP['height']}）")

    try:
        with sync_playwright() as p:
            br = launch_browser(p, headless=True, args=["--no-proxy-server"])
            ctx = br.new_context(viewport=VP, is_mobile=True, has_touch=True,
                                 device_scale_factor=2)
            page = ctx.new_page()
            errs = []
            page.on("pageerror", lambda e: errs.append(str(e)))
            page.on("console", lambda m: errs.append(m.text)
                    if m.type == "error" and "Failed to load" not in (m.text or "") else None)

            # ══ 公众号排版页 · 内容页签 ══
            print("\n── 公众号排版页（内容页签）──")
            page.goto(url, wait_until="domcontentloaded", timeout=60000)
            check("首屏可输入（不等引擎）", page.is_visible("#input"))
            check("无横向滚动", no_hscroll(page))
            wait_engine_ready(page)
            page.wait_for_timeout(800)
            check("引擎就绪", True)

            page.fill("#input", TEXT)
            page.wait_for_timeout(1800)
            check("排版权可用（复制按钮已解锁）",
                  page.evaluate("() => !document.getElementById('btn-copy').disabled"))
            check("无横向滚动（有正文后）", no_hscroll(page))
            check("底部页签为 内容/预览",
                  page.locator(".tabs button").count() == 2,
                  "2 个", f"{page.locator('.tabs button').count()} 个")

            # 2026-10-27 改进：主题条提到 .stage 层后，内容页签也能直接换主题
            #（原来它嵌在预览页签里，内容页签下高度为 0，换主题必须先切页签）
            bar_edit = page.evaluate("""() => { const b = document.querySelector('.style-bar');
                if (!b) return null; const r = b.getBoundingClientRect();
                return { h: Math.round(r.height), w: Math.round(r.width) }; }""")
            check("主题条在内容页签也可见（免切页签）",
                  bool(bar_edit) and bar_edit["h"] > 30 and bar_edit["w"] > 200,
                  "高>30 宽>200", str(bar_edit))
            page.screenshot(path=str(SHOTS / "wechat-1-edit.png"))

            # ══ 公众号排版页 · 预览页签 ══
            print("\n── 公众号排版页（预览页签）──")
            page.click(".tabs button:nth-child(2)")
            page.wait_for_timeout(900)
            bar = page.evaluate("""() => { const b = document.querySelector('.style-bar');
                if (!b) return null; const r = b.getBoundingClientRect();
                return { h: Math.round(r.height), w: Math.round(r.width) }; }""")
            check("主题条在预览页签可见", bool(bar) and bar["h"] > 30 and bar["w"] > 200,
                  "高>30 宽>200", str(bar))

            # 用「样式指纹」而不是 html 长度：换主题多数只改颜色/字号，
            # 结构完全一样 → 长度可能一模一样（第一版就误判成「没变化」）。
            SIG = """() => { const f = document.getElementById('preview');
                if (!f || !f.contentDocument) return '';
                const d = f.contentDocument;
                const h = d.querySelector('h1,h2,p') || d.body;
                const s = h ? getComputedStyle(h) : null;
                return s ? [s.color, s.fontSize, s.fontFamily,
                            getComputedStyle(d.body).backgroundColor].join('|') : ''; }"""
            before = page.evaluate(SIG)
            page.click("#btn-themes")
            page.wait_for_timeout(700)
            check("「全部风格」能打开风格库", page.is_visible("#drawer"))
            page.screenshot(path=str(SHOTS / "wechat-2-drawer.png"))

            page.fill("#drawer-search", "墨")
            page.wait_for_timeout(600)
            items = page.locator("#drawer-grid .d-card")
            n = items.count()
            check("风格库能按名字搜到", n >= 1, "≥1", f"{n} 个")
            # 取最后一个（避开很可能就是当前主题的第一个）
            if n >= 1:
                items.nth(n - 1).click()
                page.wait_for_timeout(1600)
            after = page.evaluate(SIG)
            check("换主题后渲染有变化", bool(after) and before != after,
                  "样式指纹不同", f"{before[:40]} → {after[:40]}")
            check("无横向滚动（预览页签）", no_hscroll(page))
            page.screenshot(path=str(SHOTS / "wechat-3-preview.png"))

            # 2026-10-27 新行为：窄屏选完主题自动收起抽屉并切到预览
            #（桌面端仍保持「不关抽屉、连点对比」，因为预览就在左边）
            check("选完主题自动收起抽屉", not page.is_visible("#drawer"))
            check("选完主题自动切到预览页签",
                  page.get_attribute("#stage", "data-tab") == "preview",
                  "preview", page.get_attribute("#stage", "data-tab"))

            # 关闭按钮仍然可用：重新打开再关一次
            page.click("#btn-themes")
            page.wait_for_timeout(600)
            page.click("#btn-drawer-close")
            page.wait_for_timeout(600)
            check("风格库可关闭（× 按钮）", not page.is_visible("#drawer"))

            # ══ 小红书封面页 ══
            print("\n── 小红书封面页 ──")
            page.click("#btn-cover")
            page.wait_for_timeout(1000)
            check("进入封面页", page.is_visible("#cover-root"))
            check("无横向滚动（封面页）", no_hscroll(page))

            page.fill("#cv-text", TEXT)
            page.wait_for_timeout(1800)
            try:
                page.wait_for_function(
                    "() => { const f = document.querySelector('.cv-preview-scaler iframe');"
                    " return f && f.contentDocument && f.contentDocument.getElementById('xhs-cover'); }",
                    timeout=20000)
                check("实时预览存在（未生成）", True)
            except Exception as e:
                check("实时预览存在（未生成）", False, "", str(e)[:60])

            order = page.evaluate("""() => {
                const q = (s) => { const e = document.querySelector(s);
                    return e ? e.getBoundingClientRect().top : -1; };
                return { pv: q('.cv-preview-box'), txt: q('#cv-text'),
                         sty: q('#cv-styles'), res: q('#cv-empty') };
            }""")
            check("单栏顺序 预览→文案→风格→结果",
                  order["pv"] < order["txt"] < order["sty"] < order["res"], "递增",
                  f"{int(order['pv'])}<{int(order['txt'])}<{int(order['sty'])}<{int(order['res'])}")
            page.screenshot(path=str(SHOTS / "cover-1-mobile.png"))

            page.evaluate("() => document.querySelector('.cv-style[data-style=\"editorial-midnight-ink\"]').click()")
            try:
                page.wait_for_function(
                    "() => { const f = document.querySelector('.cv-preview-scaler iframe');"
                    " if (!f || !f.contentDocument) return false;"
                    " const el = f.contentDocument.getElementById('xhs-cover');"
                    " return el && getComputedStyle(el).backgroundColor === 'rgb(14, 13, 12)'; }",
                    timeout=12000)
                check("切风格预览实时换色", True)
            except Exception as e:
                check("切风格预览实时换色", False, "", str(e)[:60])

            page.evaluate("() => document.querySelector('.cv-style[data-style=\"editorial\"]').click()")
            page.wait_for_timeout(600)
            page.click("#cv-gen")
            try:
                page.wait_for_function(
                    "() => document.querySelectorAll('.cv-card img').length > 0 &&"
                    " [...document.querySelectorAll('.cv-card img')].every(i => i.naturalWidth > 0)",
                    timeout=120000)
                n = page.locator(".cv-card").count()
                check("移动端可生成", n >= 1, "≥1", f"{n} 张")
                check("有下载链接", page.locator("a.cv-dl").count() >= 1,
                      "≥1", page.locator("a.cv-dl").count())
            except Exception as e:
                check("移动端可生成", False, "", str(e)[:60])
            check("无横向滚动（生成后）", no_hscroll(page))
            page.screenshot(path=str(SHOTS / "cover-2-result.png"))

            check("全程无 JS 报错", not errs, "", errs[:2] if errs else "0 报错")
            br.close()
    finally:
        if srv:
            srv.shutdown()

    bad = [n for n, ok in results if not ok]
    print("\n" + "=" * 56)
    print(f"移动端 E2E：{len(results) - len(bad)}/{len(results)} 通过")
    if bad:
        print("  失败：", bad)
    return 1 if bad else 0


if __name__ == "__main__":
    raise SystemExit(main())
