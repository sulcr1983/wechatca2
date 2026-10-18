#!/usr/bin/env python
"""PWA 断网测试（PWA-3.1 验收）：有头系统 Chrome 实测线上站离线可用性。
流程：
  1. 打开 https://supersu.ccwu.cc/（首次联网，引擎 11MB + 主题 JSON 入缓存）
  2. 等排版引擎就绪（#engine-badge 强信号）+ Service Worker 注册完成
  3. 联网渲染一次（真实用户路径：主题 JSON 才会被 fetch）
  4. 打印 SW 缓存清单（证据）
  5. 切断网络 → 刷新 → 验证：外壳/引擎/草稿恢复渲染全走缓存
  6. 离线重新输入 → 验证渲染；离线切换一个没用过的主题 → 再验证渲染
  7. 截图存证 → 恢复网络
通过标准：离线刷新后页面可用、引擎就绪、输入能出预览、离线切主题能出预览。
"""
import sys
from playwright.sync_api import sync_playwright

URL = "https://supersu.ccwu.cc/"
SHOT = "E:/test/wechatca2/output/pwa_offline_verify.png"
TEST_TEXT = "# 断网测试文章\n\n这是断网状态下输入的文字，如果能排出样式，说明离线缓存全链路可用。\n\n## 小节\n\n- 缓存要点一\n- 缓存要点二"
TEST_TEXT2 = "# 第二轮离线输入\n\n换一段文字，确认离线渲染不是草稿恢复的假象。\n\n## 再来一节\n\n1. 第一项\n2. 第二项"

results = []
def check(name, ok, detail=""):
    results.append((name, ok, detail))
    print(("PASS" if ok else "FAIL"), name, detail)

READY_JS = "() => document.querySelector('#engine-badge')?.dataset.state === 'ready'"
PREVIEW_LEN_JS = "() => (document.querySelector('#preview')?.srcdoc || '').length"

with sync_playwright() as p:
    browser = p.chromium.launch(
        channel="chrome", headless=False,
        args=["--window-size=1280,900"],
    )
    ctx = browser.new_context(viewport={"width": 1280, "height": 900})
    page = ctx.new_page()
    page.goto(URL, wait_until="domcontentloaded", timeout=60000)

    # 1. 等引擎就绪（首次下载约 11MB）——强信号，不靠 body 文本
    page.wait_for_function(READY_JS, timeout=180000)
    check("联网首访-引擎就绪", True)

    # 2. 等 SW 注册并拿到 controller
    page.wait_for_function(
        "() => navigator.serviceWorker && navigator.serviceWorker.controller",
        timeout=60000,
    )
    check("ServiceWorker 已控制页面", True)

    # 2.5 刷新一次：首访时 SW 还没接管，Worker 里的 Pyodide 请求会绕过 SW
    #     （只落到浏览器 HTTP 缓存）。刷新后整页（含 Worker）才真正受 SW 控制。
    page.reload(wait_until="domcontentloaded", timeout=60000)
    page.wait_for_function(READY_JS, timeout=180000)
    check("刷新后引擎就绪（全链路受 SW 控制）", True)

    # 3. 联网渲染一次（主题 JSON 才会进缓存）
    page.fill("#input", TEST_TEXT)
    page.wait_for_function(f"{PREVIEW_LEN_JS} > 1000", timeout=30000)
    check("联网首访-渲染成功", True)

    # 4. 缓存清单（证据）
    caches_info = page.evaluate(
        "async () => { const names = await caches.keys(); const out = {};"
        " for (const n of names) { const c = await caches.open(n);"
        " const keys = await c.keys(); out[n] = keys.length; } return out; }"
    )
    print("SW 缓存清单:", caches_info)
    total = sum(caches_info.values())
    check("缓存条目数 > 150（含 164 主题 JSON 预缓存）", total > 150, f"共 {total} 条")
    runtime = {k: v for k, v in caches_info.items() if k.startswith("supersu-store-runtime")}
    check("Pyodide 运行时进了 SW 缓存（离线不依赖 HTTP 缓存）",
          sum(runtime.values()) >= 5, str(runtime))

    # 5. 断网 → 刷新
    ctx.set_offline(True)
    page.reload(wait_until="domcontentloaded", timeout=60000)
    page.wait_for_function(READY_JS, timeout=120000)
    check("离线刷新-引擎就绪(走缓存)", True)
    # 草稿恢复后会自动渲染一次：预览有内容才算数
    page.wait_for_function(f"{PREVIEW_LEN_JS} > 1000", timeout=30000)
    check("离线刷新-草稿恢复并渲染", True)

    # 6a. 离线重新输入（排除草稿恢复的假象）
    page.fill("#input", "")
    page.fill("#input", TEST_TEXT2)
    page.wait_for_function(
        "() => { const f = document.getElementById('preview');"
        " const d = f && f.contentDocument;"
        " return !!(d && d.body && d.body.innerText.includes('第二轮离线输入')); }",
        timeout=30000,
    )
    check("离线输入-预览渲染（含本轮新文字）", True)

    # 6b. 离线切换一个当前没用过的主题（主题 JSON 必须已在 install 时预缓存）
    switched = page.evaluate(
        "() => { const caps = [...document.querySelectorAll('#style-caps .cap')];"
        " const cur = caps.find(c => c.getAttribute('aria-pressed') === 'true');"
        " const other = caps.find(c => c !== cur);"
        " if (!other) return null; other.click(); return { from: cur?.dataset.id, to: other.dataset.id }; }"
    )
    page.wait_for_function(f"{PREVIEW_LEN_JS} > 1000", timeout=30000)
    badge = page.evaluate(
        "() => document.querySelector('#engine-badge')?.dataset.state"
    )
    check("离线切换主题-渲染正常", badge == "ready", f"{switched} | badge={badge}")
    page.screenshot(path=SHOT, full_page=False)
    print("截图:", SHOT)

    # 7. 恢复网络
    ctx.set_offline(False)
    browser.close()

failed = [r for r in results if not r[1]]
print("\n" + "=" * 40)
print(f"断网测试：{len(results) - len(failed)}/{len(results)} 通过")
if failed:
    for name, _, detail in failed:
        print("FAIL:", name, detail)
    sys.exit(1)
print("全部通过：断网刷新后应用完整可用")
