#!/usr/bin/env python
"""PWA 断网诊断 v2：修正选择器（iframe 是 #preview 不是 #preview-frame），
每步容错，结尾统一 dump 状态/失败请求/console。"""
import json
from playwright.sync_api import sync_playwright

URL = "https://supersu.ccwu.cc/"
TEST_TEXT = "# 断网测试文章\n\n这是断网状态下输入的文字，如果能排出样式，说明离线缓存全链路可用。\n\n## 小节\n\n- 缓存要点一\n- 缓存要点二"

failed_reqs = []
console_msgs = []

STATE_JS = (
    "() => ({"
    " badge: document.querySelector('#engine-badge')?.dataset.state,"
    " badgeText: document.querySelector('#engine-text')?.textContent,"
    " bootGone: document.querySelector('#boot')?.classList.contains('gone'),"
    " bootLabel: document.querySelector('#boot-label')?.textContent,"
    " toast: document.querySelector('#toast')?.textContent,"
    " toastShown: document.querySelector('#toast')?.classList.contains('show'),"
    " preview: (document.querySelector('#preview')?.srcdoc || '').length })"
)

def dump(tag):
    print(f"\n── {tag} ──")
    try:
        st = page.evaluate(STATE_JS)
        print(json.dumps(st, ensure_ascii=False, indent=2))
    except Exception as e:
        print("state eval 失败:", e)
    if failed_reqs:
        print("失败请求:")
        for f in failed_reqs:
            print("  FAIL:", f)
    else:
        print("失败请求: （无）")
    if console_msgs:
        print("console:")
        for m in console_msgs[:40]:
            print("  ", m)
    else:
        print("console: （无）")

with sync_playwright() as p:
    browser = p.chromium.launch(channel="chrome", headless=False, args=["--window-size=1280,900"])
    ctx = browser.new_context(viewport={"width": 1280, "height": 900})
    page = ctx.new_page()

    page.on("requestfailed", lambda r: failed_reqs.append(f"{r.url[:140]} | {r.failure}"))
    page.on("console", lambda m: console_msgs.append(f"[{m.type}] {m.text[:200]}"))
    page.on("pageerror", lambda e: console_msgs.append(f"[pageerror] {str(e)[:200]}"))

    # ── 联网首访 ──
    page.goto(URL, wait_until="domcontentloaded", timeout=60000)
    page.wait_for_function(
        "() => document.querySelector('#engine-badge')?.dataset.state === 'ready'",
        timeout=180000,
    )
    print("PASS 联网首访-引擎 ready")

    page.wait_for_function(
        "() => navigator.serviceWorker && navigator.serviceWorker.controller",
        timeout=60000,
    )
    print("PASS SW 已控制页面")

    # 首访渲染一次（真实用户路径：主题 JSON 才会进缓存）
    page.fill("#input", TEST_TEXT)
    try:
        page.wait_for_function(
            "() => (document.querySelector('#preview')?.srcdoc || '').length > 1000",
            timeout=30000,
        )
        print("PASS 联网首访-渲染成功")
    except Exception:
        print("FAIL 联网首访-渲染失败")
    dump("联网首访结束")

    # ── dump 缓存 ──
    caches = page.evaluate(
        "async () => { const names = await caches.keys(); const out = {};"
        " for (const n of names) { const c = await caches.open(n);"
        " const keys = await c.keys(); out[n] = keys.map(r => r.url); } return out; }"
    )
    print("\n── 缓存清单 ──")
    for name, urls in caches.items():
        print(f"{name}: {len(urls)} 条")
        for u in urls:
            print("   ", u[:140])
    print(f"总计 {sum(len(v) for v in caches.values())} 条")

    # ── 断网刷新 ──
    failed_reqs.clear(); console_msgs.clear()
    ctx.set_offline(True)
    page.reload(wait_until="domcontentloaded", timeout=60000)
    page.wait_for_timeout(10000)
    dump("离线刷新后")

    # ── 离线输入渲染 ──
    failed_reqs.clear(); console_msgs.clear()
    page.fill("#input", TEST_TEXT)
    page.wait_for_timeout(5000)
    dump("离线输入后")
    page.screenshot(path="E:/test/wechatca2/output/pwa_offline_diag.png")

    ctx.set_offline(False)
    browser.close()
print("\n诊断完成")
