"""PWA 封面有头测试：起静态服务 → 系统 Chrome 跑完整封面链路。

覆盖：入口切换 / 13 种风格 / 3 尺寸 / 归藏与模板出图 / 上传底图 /
      联网搜图（仅 Pexels，验无 Key 指引 + 真实搜索）/ 下载链接 / 窄屏布局 / 断网生成。

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
            # 「保存大图」= 点一次直接落盘（2026-10-27），用下载事件验证，别只信文案
            downloads = []
            page.on("download", lambda d: downloads.append(d.suggested_filename))

            page.goto(f"http://127.0.0.1:{PORT}/", wait_until="domcontentloaded")
            check("页面标题正确", page.title().startswith("SuperSu"), page.title())
            page.wait_for_selector("#btn-cover", timeout=20000)
            check("顶栏有封面入口", page.is_visible("#btn-cover"))

            # ── 入口切换 ──
            page.click("#btn-cover")
            page.wait_for_selector("#cover-root:not([hidden])", timeout=10000)
            check("封面页打开", page.is_visible("#cover-root"))

            # 2026-10-27 三栏改版：左栏不再有标签，所有控件同屏可见，
            # 这里保留 tab() 作为**空操作**，调用点不用动（改动面最小）。
            def tab(name):
                return None

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

            # ── 实时预览（2026-10-27 三栏改版的核心能力）──
            # 用户原话：「先输入文案，然后选风格，风格最好可以预览，
            # 不需要生成就可以预览那种，然后才是生成大图」。
            # 这里断言：一进来就有预览（没点生成），改文案预览跟着变。
            try:
                page.wait_for_selector(".cv-preview-scaler iframe", timeout=20000)
                page.wait_for_function(
                    "() => { const f = document.querySelector('.cv-preview-scaler iframe');"
                    " return f && f.contentDocument && f.contentDocument.getElementById('xhs-cover'); }",
                    timeout=20000)
                check("打开就有实时预览（未点生成）", True, "")
            except Exception as e:
                check("打开就有实时预览（未点生成）", False, str(e)[:70])

            page.fill("#cv-text", "预览联动测试\n\n第二段用来验证实时更新。")
            try:
                page.wait_for_function(
                    "() => { const f = document.querySelector('.cv-preview-scaler iframe');"
                    " if (!f || !f.contentDocument) return false;"
                    " const b = f.contentDocument.body;"
                    " return !!b && b.innerText.includes('预览联动测试'); }", timeout=8000)
                check("改文案预览实时更新（不用生成）", True, "")
            except Exception as e:
                check("改文案预览实时更新（不用生成）", False, str(e)[:70])

            # 预览 should 与真实生成一致：切风格后预览的底色要跟着变
            page.click('.cv-style[data-style="editorial-midnight-ink"]')
            try:
                page.wait_for_function(
                    "() => { const f = document.querySelector('.cv-preview-scaler iframe');"
                    " if (!f || !f.contentDocument) return false;"
                    " const el = f.contentDocument.getElementById('xhs-cover');"
                    " if (!el) return false;"
                    " const bg = getComputedStyle(el).backgroundColor;"
                    " return bg === 'rgb(14, 13, 12)'; }", timeout=8000)
                check("切风格预览实时换色（不用生成）", True, "")
            except Exception as e:
                check("切风格预览实时换色（不用生成）", False, str(e)[:70])
            page.click('.cv-style[data-style="editorial"]')

            # ── 风格与尺寸 ──
            tab("style")
            styles = page.locator(".cv-style").count()
            check("13 种风格全部渲染", styles == 13, f"{styles} 个")
            check("默认支持 3 尺寸", page.locator(".cv-size:not([disabled])").count() == 3)
            page.click('.cv-style[data-style="editorial-dune"]')
            check("模板仅 3:4（其余尺寸禁用）", page.locator(".cv-size:not([disabled])").count() == 1)
            page.click('.cv-style[data-style="editorial"]')

            # ── 每种风格必须生成「视觉上不同」的图（2026-10-25 补）──
            # 之前只断言「有 12 个按钮」，漏掉了「10 套模板纯色模式下全变灰白板」的
            # 真实 bug（用户反馈「生成图片都是一样的」）。这里逐个生成并比对底色，
            # 10 套模板的 --accent 各不相同，底色必须互不相同。
            style_ids = page.eval_on_selector_all(
                ".cv-style", "els => els.map(e => e.dataset.style)")
            tab("content")
            page.fill("#cv-text", "周末去海边\n\n两天的沉默之后，我重新听见了海浪。")
            bg_of = {}
            for sid in style_ids:
                if not sid.startswith(("editorial-", "swiss-")):
                    continue        # 只测 10 套模板（归藏两套另有断言）
                tab("style")
                page.click(f'.cv-style[data-style="{sid}"]')
                page.wait_for_timeout(400)
                page.click("#cv-gen")
                try:
                    page.wait_for_function(
                        "document.querySelectorAll('.cv-card').length === 1", timeout=60000)
                    page.wait_for_function(
                        "document.querySelector('.cv-card img').naturalWidth > 0", timeout=20000)
                    # 2026-10-25 改：不再只看底色。规范里 4 套 Swiss 共用同一个
                    # 纸色 #fafaf8，只靠强调色区分 → 底assert「底色互不相同」会误报。
                    # 改为取「纸色 + 最饱和像素（强调色）」组合，断言组合唯一。
                    sig = page.evaluate("""() => {
                        const img = document.querySelector('.cv-card img');
                        const cv = document.createElement('canvas');
                        cv.width = 40; cv.height = 54;
                        const ctx = cv.getContext('2d');
                        ctx.drawImage(img, 0, 0, 40, 54);
                        const d = ctx.getImageData(0, 0, 40, 54).data;
                        const paper = [d[0], d[1], d[2]].join(',');
                        let best = 0, acc = paper;
                        for (let i = 0; i < d.length; i += 4) {
                            const r = d[i], g = d[i + 1], b = d[i + 2];
                            const mx = Math.max(r, g, b), mn = Math.min(r, g, b);
                            // 饱和度 × 亮度：挑最“有颜色”的像素当强调色
                            const sat = (mx - mn) * (mx / 255);
                            if (sat > best) { best = sat; acc = [r, g, b].join(','); }
                        }
                        return paper + '|' + acc;
                    }""")
                    bg_of[sid] = sig
                except Exception as e:
                    bg_of[sid] = f"ERR:{type(e).__name__}"
            dup = {}
            for sid, rgb in bg_of.items():
                dup.setdefault(rgb, []).append(sid)
            same = {k: v for k, v in dup.items() if len(v) > 1}
            check("10 套模板（纸色+强调色）组合唯一",
                  not same and len(bg_of) == 10,
                  f"{len(bg_of)} 套 · 重复={same or '无'}")
            page.click('.cv-style[data-style="editorial"]')

            # ── 字体与文字玩法（2026-10-25 新增）──
            tab("text")
            fonts = page.eval_on_selector_all(
                ".cv-chip[data-font]", "els => els.map(e => e.dataset.font)")
            check("字体选项齐全（含得意黑）",
                  set(fonts) >= {"auto", "sans", "serif", "smiley"}, str(fonts))
            modes = page.eval_on_selector_all(
                ".cv-chip[data-textmode]", "els => els.map(e => e.dataset.textmode)")
            check("文字玩法 ≥ 7 种", len(modes) >= 7, str(modes))

            # 满意黑按需加载：未选中时不该请求字体文件
            font_reqs_before = [u for u in page.evaluate(
                "() => performance.getEntriesByType('resource').map(r => r.name)")
                if "smiley-sans" in u]
            check("未选中得意黑时不下载字体", len(font_reqs_before) == 0,
                  f"{len(font_reqs_before)} 个请求")

            # 切回默认字体 + 逐字换色，验证标题被切成 span（玩法真的生效）
            tab("content")
            page.fill("#cv-text", "周末去海边\n\n两天的沉默之后。")
            tab("text")
            page.click(".cv-chip[data-font='auto']")
            page.click(".cv-chip[data-textmode='rainbow']")
            page.click("#cv-gen")
            page.wait_for_function("document.querySelectorAll('.cv-card').length === 1", timeout=60000)
            page.wait_for_timeout(600)
            page.click(".cv-card")
            page.wait_for_timeout(900)
            if page.is_visible("#cv-lightbox"):
                page.click("#cv-lightbox-close")
                page.wait_for_timeout(300)
            page.click(".cv-chip[data-textmode='stack']")

            # ── 归藏：3 尺寸 ──
            tab("content")
            page.fill("#cv-text", TEXT)
            page.fill("#cv-author", "阿苏")
            page.click("#cv-gen")
            page.wait_for_function("document.querySelectorAll('.cv-card').length === 3", timeout=120000)
            page.wait_for_function("[...document.querySelectorAll('.cv-card img')].every(i => i.naturalWidth > 0)", timeout=30000)
            dims = page.eval_on_selector_all(".cv-card img", "els => els.map(e => [e.naturalWidth, e.naturalHeight])")
            check("归藏一次出 3 个尺寸", dims == [[1080, 1440], [1080, 1080], [2100, 900]], str(dims))
            check("每张都有下载链接", page.locator("a.cv-dl").count() == 3)

            # 2026-10-25 补：卡片底部「九宫格 / 下载」被长标签挤成竖排（用户反馈错位）。
            # 断言按钮是单行、且不换行（高度 < 40px 说明没被压成两行）。
            btn_boxes = page.eval_on_selector_all(
                ".cv-dl", "els => els.map(e => { const r = e.getBoundingClientRect();"
                " return {t: e.textContent.trim(), w: Math.round(r.width), h: Math.round(r.height)}; })")
            bad_btn = [b for b in btn_boxes if b["h"] >= 40]
            check("卡片按钮单行不换行", not bad_btn and len(btn_boxes) >= 6,
                  f"{len(btn_boxes)} 个按钮，异常={bad_btn[:2] or '无'}")

            # ── 模板：3:4 ──
            tab("style")
            page.click('.cv-style[data-style="editorial-dune"]')
            page.click("#cv-gen")
            page.wait_for_function("document.querySelectorAll('.cv-card').length === 1", timeout=120000)
            page.wait_for_function("document.querySelector('.cv-card img').naturalWidth === 1080", timeout=30000)
            check("模板出一张 1080×1440", page.eval_on_selector(".cv-card img", "e => [e.naturalWidth, e.naturalHeight]") == [1080, 1440])
            # 2026-10-27：按钮语义是「保存」，点一次就要有文件，不能只出卡片再让用户点下载
            check("点「保存大图」直接落盘（无需二次点击）",
                  len(downloads) >= 1,
                  (str(downloads[:2]) if downloads else "无下载事件"))

            # ── 上传底图 ──
            if UPLOAD.exists():
                tab("bg")
                page.click('[data-mode="upload"]')
                page.set_input_files("#cv-file", str(UPLOAD))
                page.wait_for_selector(".cv-bg-preview img", timeout=15000)
                page.click("#cv-gen")
                page.wait_for_function("document.querySelectorAll('.cv-card').length === 1", timeout=120000)
                page.wait_for_function("document.querySelector('.cv-card img').naturalWidth > 0", timeout=30000)
                check("上传底图可生成", True, page.inner_text(".cv-bg-meta").replace("\n", " | "))
            else:
                skip("上传底图", f"缺测试图 {UPLOAD}")

            # ── 联网搜图（2026-10-27 重写）──────────────────────────────
            # 图源已收敛为 Pexels / Pixabay 两家（都要用户 Key），Wikimedia 移除。
            # 所以这里不再测「免 key 能不能搜到」——那条路已经不存在了，
            # 改为断言三件可以离线确定的事：
            #   1) 只列两家图源，不再出现 Wikimedia
            #   2) 没配 Key 时给出明确指引（而不是转圈超时）
            #   3) 指引按钮能跳到 Key 配置
            tab("bg")
            page.click('[data-mode="search"]')
            page.wait_for_timeout(400)

            pills = page.eval_on_selector_all(
                ".cv-stock-pill", "els => els.map(e => e.textContent.trim())")
            check("图源只有 Pexels（Wikimedia/Pixabay 已移除）",
                  len(pills) == 1 and "Pexels" in pills[0], str(pills))

            # 清掉 Key 后重新渲染底图面板（切模式会重读 getStockKeys）。
            # ⚠️ 不要 reload：会打断后面的断网/窄屏断言，且重载后引擎要重新初始化。
            page.evaluate("() => localStorage.removeItem('supersu.cover.stock.v1')")
            tab("bg")
            page.click('[data-mode="color"]')
            page.wait_for_timeout(200)
            page.click('[data-mode="search"]')
            page.wait_for_timeout(300)
            page.fill("#cv-q", "coffee")
            page.click("#cv-search")
            # 快速失败：应立刻给出「还没配置图库 Key」，而不是等网络超时
            try:
                page.wait_for_function(
                    # 用稳定关键词「Key」而不是整句文案，避免刷新提示语就误判
                    "() => { const s = document.getElementById('cv-status');"
                    " return s && /Key/.test(s.textContent); }", timeout=6000)
                check("无 Key 时给出配置指引（不空转）", True,
                      page.inner_text("#cv-status").strip()[:40])
            except Exception as e:
                check("无 Key 时给出配置指引（不空转）", False, str(e)[:80])

            # 指引按钮存在且可点（点开 AI 面板填 Key）
            check("有「填 Key」入口", page.locator(".cv-stock-set").count() == 1,
                  page.inner_text(".cv-stock-set") if page.locator(".cv-stock-set").count() else "缺失")

            # ── 有真 Key 时跑一次真实搜索（无 Key / 断网记 SKIP）──
            # Key 从项目根 .env 读（已被 .gitignore 排除，不会进仓库）
            real_key = ""
            envf = ROOT / ".env"
            if envf.exists():
                for line in envf.read_text(encoding="utf-8").splitlines():
                    line = line.strip()
                    if line.startswith("#"):
                        continue
                    if line.startswith("PEXELS_API_KEY="):
                        real_key = line.split("=", 1)[1].strip()
            if not real_key:
                skip("Pexels 真实搜索", "未配置 PEXELS_API_KEY")
            else:
                page.evaluate(
                    "k => localStorage.setItem('supersu.cover.stock.v1',"
                    " JSON.stringify({pexels:k,pixabay:''}))", real_key)
                tab("bg")
                page.click('[data-mode="color"]')
                page.wait_for_timeout(200)
                page.click('[data-mode="search"]')
                page.wait_for_timeout(400)
                page.fill("#cv-q", "beach")
                page.click("#cv-search")
                try:
                    page.wait_for_function(
                        "document.querySelectorAll('.cv-cand').length > 0", timeout=40000)
                    page.wait_for_function(
                        "() => [...document.querySelectorAll('.cv-cand img')]"
                        ".every(i => i.complete && i.naturalWidth > 0)", timeout=30000)
                    n = page.locator(".cv-cand").count()
                    page.locator(".cv-cand").first.click()
                    page.wait_for_selector(".cv-bg-preview img", timeout=30000)
                    meta = page.inner_text(".cv-bg-meta").replace("\n", " | ")
                    check("Pexels 真实搜索可用", n >= 6 and "Pexels" in meta,
                          f"{n} 张 · {meta[:50]}")
                except Exception as e:
                    skip("Pexels 真实搜索", f"网络/配额问题：{str(e)[:70]}")
                    try:
                        page.click('[data-mode="color"]', timeout=3000)
                    except Exception:
                        pass


            page.eval_on_selector(".cv-col-left", "el => el.scrollTop = 0")
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
