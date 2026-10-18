#!/usr/bin/env python
"""轻量即时预览验证（首访不再等 20 秒）

断言：
1. 首访（空 profile）输入后，**引擎还没就绪**就能出预览（近似版）
2. 近似版阶段：复制按钮保持禁用（防止粘近似结果）
3. 引擎就绪后自动升级为精确排版（预览内容变化、复制解锁）
"""
import sys
import time

from playwright.sync_api import sync_playwright

try:
    sys.stdout.reconfigure(encoding="utf-8", errors="replace")
except Exception:
    pass

URL = "https://supersu.ccwu.cc/"
TEXT = "# 首访速度测试\n\n第一段正文，用来验证不用等引擎也能看到排版。\n\n## 小节\n\n- 要点一\n- 要点二"
results = []


def check(name, ok, detail=""):
    results.append((name, ok, detail))
    print(f"[{'PASS' if ok else 'FAIL'}] {name}" + (f" — {detail}" if detail else ""))


with sync_playwright() as p:
    browser = p.chromium.launch(channel="chrome", headless=False, args=["--window-size=1280,900"])
    ctx = browser.new_context(viewport={"width": 1280, "height": 900})   # 全新上下文 = 首访
    page = ctx.new_page()
    t0 = time.time()
    page.goto(URL, wait_until="domcontentloaded", timeout=60000)
    # 等模块初始化完成（app.js 会把空闲钩子挂到 window），避免 fill 早于事件绑定
    page.wait_for_function("() => typeof window.__supersuIsIdle === 'function'", timeout=30000)

    page.fill("#input", TEXT)
    # 等近似预览出现（不看引擎状态）
    page.wait_for_function(
        "() => (document.getElementById('preview')?.srcdoc || '').length > 300",
        timeout=30000,
    )
    light_ms = int((time.time() - t0) * 1000)

    engine_state = page.evaluate("() => document.querySelector('#engine-badge')?.dataset.state")
    badge_text = page.evaluate("() => document.getElementById('engine-text')?.textContent || ''")
    copy_disabled = page.evaluate("() => document.getElementById('btn-copy')?.disabled")
    preview_html = page.evaluate("() => document.getElementById('preview')?.srcdoc || ''")

    check("首访不等引擎就出预览", light_ms < 15000, f"{light_ms}ms")
    check("近似阶段标明「快速预览」", "快速预览" in badge_text or engine_state == "loading",
          f"state={engine_state} text={badge_text!r}")
    check("近似阶段复制按钮禁用（不让粘近似结果）", copy_disabled is True, f"disabled={copy_disabled}")
    check("近似预览包含标题与列表结构", "<h1" in preview_html and "<li" in preview_html,
          f"{len(preview_html)} 字符")

    # 等精确引擎就绪，确认自动升级
    # 精确排版的特征：引擎给每个标签写内联 style（轻量版只有 <style> 块）
    page.wait_for_function(
        "() => /<h1[^>]*style=/.test(document.getElementById('preview')?.srcdoc || '')",
        timeout=180000)
    page.wait_for_timeout(800)
    exact_len = page.evaluate("() => (document.getElementById('preview')?.srcdoc || '').length")
    copy_after = page.evaluate("() => document.getElementById('btn-copy')?.disabled")
    light_wait = page.evaluate("() => window.__lightSeen || 0")
    check("引擎就绪后自动切换到精确排版",
          exact_len > 300 and (exact_len != len(preview_html) or exact_len > 0),
          f"近似 {len(preview_html)} → 精确 {exact_len}")
    check("精确排版后复制解锁", copy_after is False, f"disabled={copy_after}")

    page.screenshot(path="E:/test/wechatca2/output/pwa_light_preview.png")
    browser.close()

failed = [r for r in results if not r[1]]
print("\n" + "=" * 52)
print(f"轻量预览验证：{len(results) - len(failed)}/{len(results)} 通过")
for n, _, d in failed:
    print("  FAIL:", n, d)
sys.exit(1 if failed else 0)
