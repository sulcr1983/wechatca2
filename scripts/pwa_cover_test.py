"""PWA 封面有头测试：起静态服务 → 系统 Chrome 跑完整封面链路。

覆盖：入口切换 / 12 种风格 / 3 尺寸 / 归藏与模板出图 / 上传底图 /
      Wikimedia 搜图（网络不可达记 SKIP）/ 下载链接 / 窄屏布局 / 断网生成。

用法：.venv/Scripts/python.exe scripts/pwa_cover_test.py
前置：node pwa/scripts/build.mjs 已产出 pwa/dist/
产出：控制台报告 + output/pwa-cover-test*.png
"""

import http.server
import sys
import threading
import time
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
DIST = ROOT / "pwa" / "dist"
OUT = ROOT / "output"
PORT = 8090

sys.path.insert(0, str(ROOT))

TEXT = "周末去海边，我把手机调成了飞行模式\n两天的沉默之后，我重新听见了海浪、风声，还有自己。"
UPLOAD = ROOT / "docs" / "brand" / "logo-source.png"

results = []


def check(name, ok, detail=""):
    results.append((name, bool(ok), detail))
    print(("  PASS  " if ok else "  FAIL  ") + name + (f"  — {detail}" if detail else ""), flush=True)


def skip(name, detail=""):
    results.append((name, None, detail))
    print("  SKIP  " + name + (f"  — {detail}" if detail else ""), flush=True)


def serve():
    class Handler(http.server.SimpleHTTPRequestHandler):
        def __init__(self, *a, **kw):
            super().__init__(*a, directory=str(DIST), **kw)

        def log_message(self, *a):
            pass

    httpd = http.server.ThreadingHTTPServer(("127.0.0.1", PORT), Handler)
    httpd.daemon_threads = True
    httpd.request_queue_size = 256
    threading.Thread(target=httpd.serve_forever, daemon=True).start()
    time.sleep(0.4)
    return httpd


def main() -> int:
    if not (DIST / "index.html").exists():
        print("pwa/dist 不存在，先跑 node pwa/scripts/build.mjs", flush=True)
        return 2

    from playwright.sync_api import sync_playwright
    from core.browser_utils import launch_browser

    httpd = serve()
    _browser = None   # 2026-10-25：提到外层，保证异常时也能关掉（原写法会残留窗口）
    try:
        with sync_playwright() as p:
            browser = launch_browser(p, headless=False, args=["--no-proxy-server", "--window-size=1440,960"])
            _browser = browser
            page = browser.new_page(viewport={"width": 1440, "height": 960})
            errors = []
            page.on("console", lambda m: errors.append(m.type + ":" + m.text) if m.type == "error" else None)
            page.on("pageerror", lambda e: errors.append("pageerror:" + str(e)))

            page.goto(f"http://127.0.0.1:{PORT}/", wait_until="domcontentloaded")
            check("页面标题正确", page.title().startswith("SuperSu"), page.title())
            page.wait_for_selector("#btn-cover", timeout=20000)
            check("顶栏有封面入口", page.is_visible("#btn-cover"))

            # ── 入口切换 ──
            page.click("#btn-cover")
            page.wait_for_selector("#cover-root:not([hidden])", timeout=10000)
            check("封面页打开", page.is_visible("#cover-root"))
            check("排版页隐藏", page.is_hidden("#stage"))
            # 2026-10-25：按钮文案改为「公众号排版」（原「排版」，用户要求说清返回哪一页）
            check("按钮变为「公众号排版」", page.inner_text("#btn-cover").strip() == "公众号排版")

            # ── 空态示例成品（U-9，2026-10-24）──
            samples = page.locator("#cv-samples .cv-sample")
            check("空态展示 3 张示例成品", samples.count() == 3, f"{samples.count()} 张")
            check("示例图真实加载（非破图）",
                  page.evaluate(
                      "() => [...document.querySelectorAll('#cv-samples img')].every(i => i.naturalWidth > 0)"),
                  "")
            # 点示例 → 选中对应风格（editorial 恰为默认风格，不干扰后续尺寸断言）
            page.locator(".cv-sample[data-style='editorial']").click()
            page.wait_for_timeout(250)
            check("点示例选中该风格",
                  page.locator(".cv-style[data-style='editorial']").get_attribute("aria-pressed") == "true",
                  "")

            # ── 风格与尺寸 ──
            styles = page.locator(".cv-style").count()
            check("12 种风格全部渲染", styles == 12, f"{styles} 个")
            check("默认支持 3 尺寸", page.locator(".cv-size:not([disabled])").count() == 3)
            page.click('[data-style="editorial-dune"]')
            check("模板仅 3:4（其余尺寸禁用）", page.locator(".cv-size:not([disabled])").count() == 1)
            page.click('[data-style="editorial"]')

            # ── 归藏：3 尺寸 ──
            page.fill("#cv-text", TEXT)
            page.fill("#cv-author", "阿苏")
            page.click("#cv-gen")
            page.wait_for_function("document.querySelectorAll('.cv-card').length === 3", timeout=120000)
            page.wait_for_function("[...document.querySelectorAll('.cv-card img')].every(i => i.naturalWidth > 0)", timeout=30000)
            dims = page.eval_on_selector_all(".cv-card img", "els => els.map(e => [e.naturalWidth, e.naturalHeight])")
            check("归藏一次出 3 个尺寸", dims == [[1080, 1440], [1080, 1080], [2100, 900]], str(dims))
            check("每张都有下载链接", page.locator("a.cv-dl").count() == 3)

            # ── 模板：3:4 ──
            page.click('[data-style="editorial-dune"]')
            page.click("#cv-gen")
            page.wait_for_function("document.querySelectorAll('.cv-card').length === 1", timeout=120000)
            page.wait_for_function("document.querySelector('.cv-card img').naturalWidth === 1080", timeout=30000)
            check("模板出一张 1080×1440", page.eval_on_selector(".cv-card img", "e => [e.naturalWidth, e.naturalHeight]") == [1080, 1440])

            # ── 上传底图 ──
            if UPLOAD.exists():
                page.click('[data-mode="upload"]')
                page.set_input_files("#cv-file", str(UPLOAD))
                page.wait_for_selector(".cv-bg-preview img", timeout=15000)
                page.click("#cv-gen")
                page.wait_for_function("document.querySelectorAll('.cv-card').length === 1", timeout=120000)
                page.wait_for_function("document.querySelector('.cv-card img').naturalWidth > 0", timeout=30000)
                check("上传底图可生成", True, page.inner_text(".cv-bg-meta").replace("\n", " | "))
            else:
                skip("上传底图", f"缺测试图 {UPLOAD}")

            # ── Wikimedia 搜图（网络失败记 SKIP，不算失败）──
            page.click('[data-mode="search"]')
            page.fill("#cv-q", "coffee")
            page.click("#cv-search")
            try:
                page.wait_for_function("document.querySelectorAll('.cv-cand').length > 0", timeout=40000)
                cands = page.locator(".cv-cand").count()
                page.locator(".cv-cand").first.click()
                page.wait_for_function(
                    "document.querySelector('.cv-bg-meta') && document.querySelector('.cv-bg-meta').textContent.includes('Wikimedia')",
                    timeout=60000,
                )
                page.click("#cv-gen")
                page.wait_for_function("document.querySelectorAll('.cv-card').length === 1", timeout=120000)
                page.wait_for_function("document.querySelector('.cv-card img').naturalWidth > 0", timeout=30000)
                check("Wikimedia 搜图可选作底图并生成", True, f"{cands} 个候选")
            except Exception as e:
                skip("Wikimedia 搜图", f"网络不可达或超时：{str(e)[:80]}")

            page.eval_on_selector(".cv-panel", "el => el.scrollTop = 0")
            page.screenshot(path=str(OUT / "pwa-cover-test.png"))

            # ── 窄屏 ──
            page.set_viewport_size({"width": 390, "height": 844})
            page.wait_for_timeout(400)
            check("窄屏封面页可用", page.is_visible("#cover-root") and page.is_visible("#cv-gen"))
            page.screenshot(path=str(OUT / "pwa-cover-test-mobile.png"), full_page=True)
            page.set_viewport_size({"width": 1440, "height": 960})

            # ── 断网：预缓存过的封面仍可生成 ──
            page.evaluate("navigator.serviceWorker.ready.then(() => true)")
            before_offline_errors = len(errors)
            page.context.set_offline(True)
            try:
                page.reload(wait_until="domcontentloaded", timeout=30000)
                page.wait_for_selector("#btn-cover", timeout=20000)
                if page.is_hidden("#cover-root"):
                    page.click("#btn-cover")
                    page.wait_for_selector("#cover-root:not([hidden])", timeout=10000)
                page.fill("#cv-text", TEXT)
                page.click("#cv-gen")
                page.wait_for_function("document.querySelectorAll('.cv-card').length === 1", timeout=120000)
                page.wait_for_function("document.querySelector('.cv-card img').naturalWidth > 0", timeout=30000)
                check("断网后封面仍可生成（缓存命中）", True)
            except Exception as e:
                check("断网后封面仍可生成（缓存命中）", False, str(e)[:120])
            finally:
                page.context.set_offline(False)

            offline_errors = errors[before_offline_errors:]
            # 「断网」用例自己会制造网络错误（Playwright set_offline 在本地 dist 下
            # 报的是 504 (Offline)，不是 ERR_INTERNET_DISCONNECTED）——这三类属预期，不算 JS 异常。
            # ⚠️ 只放行这三条精确特征，不放行全部 Failed to load resource（真 404 仍要红）。
            real_errors = [e for e in errors
                           if "Failed to fetch" not in e
                           and "net::ERR_INTERNET_DISCONNECTED" not in e
                           and "504 (Offline)" not in e]
            check("无 JS 控制台报错", not real_errors, "; ".join(real_errors[:3]))
            if offline_errors:
                print(f"  （断网阶段另有 {len(offline_errors)} 条网络错误，已归入预期）", flush=True)

            browser.close()
            _browser = None
    finally:
        # 兜底：正常路径已关则 _browser 为 None；异常路径在这里补关，避免窗口残留
        if _browser is not None:
            try:
                _browser.close()
            except Exception:
                pass
        httpd.shutdown()

    passed = sum(1 for _, ok, _ in results if ok is True)
    failed = [r for r in results if r[1] is False]
    skipped = sum(1 for _, ok, _ in results if ok is None)
    print("\n" + "=" * 56)
    print(f"PWA 封面有头测试：{passed}/{passed + len(failed)} 通过" + (f"（{skipped} 项 SKIP）" if skipped else ""))
    print("=" * 56)
    for name, _, detail in failed:
        print(f"  ✗ {name}  {detail}")
    return 0 if not failed else 1


if __name__ == "__main__":
    raise SystemExit(main())
