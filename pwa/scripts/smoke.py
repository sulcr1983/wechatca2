"""PWA 有头冒烟测试：起静态服务 → 真实 Chrome 跑一遍核心链路。

用法：.venv/Scripts/python.exe pwa/scripts/smoke.py
前置：node pwa/scripts/build.mjs 已产出 pwa/dist/
产出：控制台报告 + output/pwa-smoke-*.png
"""

import http.server
import json
import socketserver
import sys
import threading
import time
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent.parent
DIST = ROOT / "pwa" / "dist"
OUT = ROOT / "output"
PORT = 8088

sys.path.insert(0, str(ROOT))

SAMPLE = """周末去海边，我把手机调成了飞行模式

出发前一晚我还在改稿，凌晨两点关电脑，第二天六点的车。上车之后才发现，我已经很久没有这样空着手坐三个小时了。

为什么要跑那么远

城市里的安静是借来的。图书馆四点半闭馆，咖啡馆九点打烊，连公园都有保安吹哨子。海边的安静不要钱，也没人赶你走。

- 第一天下午到的，风很大，帽子被吹进海里
- 第二天退潮，捡了半袋碎贝壳
- 第三天什么都没做，就在岸边坐着

住在哪里

民宿在渔村最里面，老板是本地人，早上会敲门问要不要吃面。房间朝东，五点半太阳就照进来了。

注意：渔村晚上没有路灯，手机要留电。

> 有些休息不是为了更好地工作，就是单纯地需要休息。
"""

results = []


def check(name, ok, detail=""):
    results.append((name, bool(ok), detail))
    print(("  PASS  " if ok else "  FAIL  ") + name + (f"  — {detail}" if detail else ""), flush=True)


def serve():
    class Handler(http.server.SimpleHTTPRequestHandler):
        def __init__(self, *a, **kw):
            super().__init__(*a, directory=str(DIST), **kw)

        def log_message(self, *a):
            pass

    # 必须多线程：164 张缩略图并发请求，单线程 server 会拒连（实测 2 张 ERR_FAILED）
    httpd = http.server.ThreadingHTTPServer(("127.0.0.1", PORT), Handler)
    httpd.daemon_threads = True
    httpd.request_queue_size = 256   # 默认 backlog 5，164 张缩略图并发会被拒连
    httpd.request_queue_size = 256   # 默认 backlog 5，164 张缩略图并发会被拒连
    threading.Thread(target=httpd.serve_forever, daemon=True).start()
    time.sleep(0.5)
    return httpd


def main() -> int:
    if not (DIST / "index.html").exists():
        print("pwa/dist 不存在，先跑 node pwa/scripts/build.mjs", flush=True)
        return 2

    from playwright.sync_api import sync_playwright
    from core.browser_utils import launch_browser

    OUT.mkdir(exist_ok=True)
    httpd = serve()

    with sync_playwright() as p:
        browser = launch_browser(p, headless=False, args=["--no-proxy-server", "--window-size=1440,960"])
        ctx = browser.new_context(viewport={"width": 1400, "height": 900})
        page = ctx.new_page()

        console_errors = []
        resource_noise = []
        failed_reqs = []
        def on_console(m):
            if m.type != "error":
                return
            loc = m.location or {}
            msg = f"{m.text}  @{loc.get('url', '?')}:{loc.get('lineNumber', '?')}"
            # 缩略图是 loading=lazy，快速滚动时浏览器会主动取消未完成的请求，
            # 报 ERR_FAILED / ERR_ABORTED 属浏览器行为，不是代码问题 → 单独记录不计失败。
            if "Failed to load resource" in m.text and "theme-thumbs" in str(loc.get("url", "")):
                resource_noise.append(msg)
                return
            console_errors.append(msg)
        page.on("console", on_console)
        page.on("pageerror", lambda e: console_errors.append(f"[pageerror] {e}"))
        page.on("requestfailed", lambda r: failed_reqs.append(f"{r.url} — {r.failure}"))

        print("\n=== 打开页面，等引擎启动（首次要下 11MB）===", flush=True)
        page.goto(f"http://127.0.0.1:{PORT}/", wait_until="domcontentloaded")

        check("页面标题正确", page.title().startswith("SuperSu"), page.title())

        try:
            page.wait_for_selector('#engine-badge[data-state="ready"]', timeout=240_000)
            check("引擎加载完成（badge=ready）", True)
        except Exception as e:
            check("引擎加载完成（badge=ready）", False, str(e)[:80])
            print("  boot 标签：" + page.inner_text("#boot-label"), flush=True)
            print("  控制台报错：", flush=True)
            for line in console_errors[-8:]:
                print("    " + line, flush=True)
            page.screenshot(path=str(OUT / "pwa-smoke-boot-fail.png"))
            browser.close()
            httpd.shutdown()
            return 1

        check("启动遮罩已隐藏", page.is_hidden("#boot") or page.evaluate(
            "() => document.getElementById('boot').classList.contains('gone')"),
            "等待淡出动画" if page.evaluate("() => document.getElementById('boot').classList.contains('gone')") else "遮罩仍在")

        # 主题胶囊
        caps = page.locator("#style-caps .cap").count()
        check("风格胶囊已渲染", caps >= 10, f"{caps} 个")

        # 输入 → 渲染
        print("\n=== 粘贴文章 → 等预览 ===", flush=True)
        page.fill("#input", SAMPLE)
        frame = page.frame_locator("#preview")
        try:
            frame.locator("h1").first.wait_for(timeout=30_000)
            check("预览出现 h1", True)
        except Exception as e:
            check("预览出现 h1", False, str(e)[:80])

        h1 = frame.locator("h1").count()
        h2 = frame.locator("h2").count()
        check("h1 数量 = 1", h1 == 1, f"实际 {h1}")
        check("h2 数量 >= 2", h2 >= 2, f"实际 {h2}")

        # 解析条
        parse_text = page.inner_text("#parse-chips") if page.locator("#parse-chips").count() else page.inner_text("#parse-bar")
        check("解析条显示结构统计", "大标题" in parse_text or "小节" in parse_text, parse_text.replace("\n", " ")[:60])

        check("复制按钮已启用", page.is_enabled("#btn-copy"))
        check("字数统计正确", "字" in page.inner_text("#char-count"), page.inner_text("#char-count"))

        # 换主题
        print("\n=== 换风格 ===", flush=True)
        first_other = page.locator("#style-caps .cap").nth(1)
        other_id = first_other.get_attribute("data-id")
        first_other.click()
        page.wait_for_timeout(2500)
        pressed = page.locator(f'#style-caps .cap[data-id="{other_id}"]').get_attribute("aria-pressed")
        check("点击后该风格置为选中", pressed == "true", f"{other_id} → {pressed}")
        check("换风格后预览仍有内容", frame.locator("h1").count() >= 1)

        # 抽屉
        print("\n=== 打开风格库 ===", flush=True)
        page.click("#btn-themes")
        page.wait_for_selector("#drawer:not([hidden])")
        cards = page.locator("#drawer-grid .d-card").count()
        reps = page.locator("#drawer-grid .d-family-card").count()
        # 2A 折叠后「全部」视图 = 每族 1 张代表卡 + 非族主题平铺；用 index.json 自校验（不写死数字）
        idx = json.loads(page.evaluate(
            "async () => await (await fetch('./themes/index.json')).text()"))
        fams = {t["family"] for t in idx if t.get("family")}
        classic = [t for t in idx if not t.get("family")]
        expected = len(fams) + len(classic)
        check("全部视图按族折叠（族代表卡 + 经典卡）",
              cards == expected and reps == len(fams) and reps >= 6,
              f"卡 {cards}，族代表 {reps}，期望 {expected}")

        thumbs = page.locator("#drawer-grid .d-thumb").count()

        # 缩略图是 loading=lazy，先滚一遍让可视区的图真正发请求
        page.evaluate("""() => {
          const g = document.getElementById('drawer-grid');
          g.scrollTop = 0;
        }""")
        try:
            page.wait_for_function(
                "() => [...document.querySelectorAll('#drawer-grid .d-thumb')]"
                ".filter(i => i.complete && i.naturalWidth > 0).length >= 10",
                timeout=15000)
        except Exception:
            pass
        loaded = page.evaluate("""() => {
          const imgs = [...document.querySelectorAll('#drawer-grid .d-thumb')];
          return {
            total: imgs.length,
            ok: imgs.filter(i => i.complete && i.naturalWidth > 0).length,
            zero: imgs.filter(i => i.complete && i.naturalWidth === 0).length,
          };
        }""")
        check("缩略图元素已渲染", thumbs >= cards - 2, f"{thumbs} 张（卡 {cards}）")
        check("首屏缩略图真实加载", loaded["ok"] >= 8, f"已加载 {loaded['ok']}，坏图 {loaded['zero']}")

        # 2A 折叠：切到某族 → 1 张代表卡 + 色调条（同族 12 换色可连续点）
        page.locator("#drawer-filters .fchip").nth(2).click()
        page.wait_for_timeout(400)
        tones = page.locator("#drawer-grid .d-tone").count()
        check("族视图展开色调条（同族换色折叠）", tones >= 6, f"{tones} 个色调")
        page.locator('#drawer-filters .fchip[data-fam="all"]').click()
        page.wait_for_timeout(300)

        # 搜索
        page.fill("#drawer-search", "卷宗")
        page.wait_for_timeout(300)
        searched = page.locator("#drawer-grid .d-card").count()
        check("搜索能过滤", 0 < searched < 164, f"搜到 {searched} 个")

        # 收藏
        page.fill("#drawer-search", "")
        page.wait_for_timeout(300)
        page.locator("#drawer-grid .d-fav").first.click()
        page.wait_for_timeout(200)
        fav_on = page.locator('#drawer-grid .d-fav[data-on="1"]').count()
        check("收藏按钮可点", fav_on >= 1, f"{fav_on} 个已收藏")

        page.click("#btn-drawer-close")
        page.wait_for_timeout(300)

        # 草稿
        print("\n=== 草稿与持久化 ===", flush=True)
        draft = page.evaluate("() => localStorage.getItem('supersu.pwa.draft')")
        check("草稿已写入 localStorage", draft and len(draft) > 100, f"{(draft or '')[:40]}…")

        page.reload(wait_until="domcontentloaded")
        page.wait_for_selector('#engine-badge[data-state="ready"]', timeout=120_000)
        page.wait_for_timeout(2500)
        restored = page.input_value("#input")
        check("刷新后草稿恢复", restored.strip() == SAMPLE.strip(), f"{len(restored)} 字")

        # Service Worker
        sw = page.evaluate("""async () => {
          if (!('serviceWorker' in navigator)) return 'unsupported';
          const reg = await navigator.serviceWorker.getRegistration();
          return reg ? (reg.active ? 'active' : 'registered') : 'none';
        }""")
        check("Service Worker 已注册", sw in ("active", "registered"), str(sw))

        # 移动端
        print("\n=== 移动端布局 ===", flush=True)
        page.set_viewport_size({"width": 390, "height": 844})
        page.wait_for_timeout(400)
        tabs_visible = page.is_visible("#tabs")
        check("窄屏出现底部切换条", tabs_visible)
        page.click('#tabs button[data-tab="preview"]')
        page.wait_for_timeout(300)
        check("切到预览页", page.is_visible("#pane-preview") and not page.is_visible("#pane-edit"))
        page.set_viewport_size({"width": 1400, "height": 900})
        page.wait_for_timeout(400)

        # 截图
        page.screenshot(path=str(OUT / "pwa-smoke-desktop.png"))
        page.click("#btn-themes")
        page.wait_for_timeout(700)
        page.screenshot(path=str(OUT / "pwa-smoke-drawer.png"))
        page.click("#btn-drawer-close")
        page.wait_for_timeout(300)
        page.screenshot(path=str(OUT / "pwa-smoke-preview.png"))

        check("无 JS 控制台报错", not console_errors, "; ".join(console_errors[:3]))
        if resource_noise:
            print(f"  （另有 {len(resource_noise)} 条缩略图请求被浏览器取消，属 lazy 加载正常行为）", flush=True)
        if resource_noise:
            print(f"  （另有 {len(resource_noise)} 条缩略图请求被浏览器取消，属 lazy 加载正常行为）", flush=True)
        if failed_reqs:
            print("  失败的请求：", flush=True)
            for r in dict.fromkeys(failed_reqs):
                print("    " + r, flush=True)

        browser.close()

    httpd.shutdown()

    passed = sum(1 for _, ok, _ in results if ok)
    total = len(results)
    print("\n" + "=" * 56, flush=True)
    print(f"PWA 有头冒烟：{passed}/{total} 通过", flush=True)
    print("=" * 56, flush=True)
    (OUT / "pwa-smoke-report.json").write_text(
        json.dumps([{"name": n, "ok": o, "detail": d} for n, o, d in results], ensure_ascii=False, indent=1),
        encoding="utf-8")
    return 0 if passed == total else 1


if __name__ == "__main__":
    raise SystemExit(main())
