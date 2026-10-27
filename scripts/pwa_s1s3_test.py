#!/usr/bin/env python
"""PWA S1/S3 线上有头验证
==============================================================
1) 首屏不阻塞：一进页面就能输入（不等引擎），启动提示是底部小条不是全屏遮罩
2) AI 面板：打开、保存配置（localStorage 本机）
3) AI 润色 / 智能排版 / 摘要：用 Playwright 拦截 chat/completions 返回 mock，
   不消耗真实 key，但完整走「前端 → 引擎 → 写回编辑器」链路
4) 自救开关 ?reset-sw：注销 SW、清本站缓存后正常重载

用法：python scripts/pwa_s1s3_test.py
"""
import json
import sys

from playwright.sync_api import sync_playwright

try:
    sys.stdout.reconfigure(encoding="utf-8", errors="replace")
except Exception:
    pass

URL = "https://supersu.ccwu.cc/"
results = []


def check(name, ok, detail=""):
    results.append((name, ok, detail))
    print(f"[{'PASS' if ok else 'FAIL'}] {name}" + (f" — {detail}" if detail else ""))


def mock_ai(route):
    body = route.request.post_data or ""
    # ⚠️ 别用「结构规划」这种会被改写的业务措辞做判定（2026-10-25 重写提示词时
    #    这词被删了，mock 从此永远落到 else 分支 → 排版不生效、这条用例静默挂掉）。
    #    改用系统提示词里稳定存在的身份句 + JSON 字段名双保险。
    is_plan = ("排版结构编辑" in body) or ('"sections"' in body and '"heading"' in body)
    if is_plan:
        content = json.dumps({
            "title": 0,
            "sections": [{"heading": "小节一", "start": 1, "end": 2}],
            "lists": [], "bold": [],
        }, ensure_ascii=False)
    elif "概括" in body:
        content = "这是一段模拟摘要：文章讲了三件事。"
    else:
        content = "这是模拟润色后的正文。"
    route.fulfill(status=200, content_type="application/json",
                  body=json.dumps({"choices": [{"message": {"content": content}}]},
                                  ensure_ascii=False))


TEXT = "原始标题\n\n第一段正文。\n\n第二段正文。"

with sync_playwright() as p:
    browser = p.chromium.launch(channel="chrome", headless=False, args=["--window-size=1280,900"])
    ctx = browser.new_context(viewport={"width": 1280, "height": 900})
    page = ctx.new_page()
    page.goto(URL, wait_until="domcontentloaded", timeout=60000)

    # 1) 首屏不阻塞：还没等引擎就绪就能输入
    input_ok = page.is_visible("#input")
    boot_box = page.evaluate("""() => { const b = document.getElementById('boot');
        if (!b) return null; const r = b.getBoundingClientRect();
        return { h: Math.round(r.height), w: Math.round(r.width),
                 pe: getComputedStyle(b).pointerEvents }; }""")
    page.fill("#input", "首屏即时输入测试")
    typed = page.input_value("#input")
    check("首屏不阻塞：引擎未就绪也能输入", input_ok and typed == "首屏即时输入测试")
    check("启动提示是底部小条（不是全屏遮罩）",
          bool(boot_box) and boot_box["h"] < 90 and boot_box["pe"] == "none", str(boot_box))

    page.wait_for_function("() => document.querySelector('#engine-badge')?.dataset.state === 'ready'",
                           timeout=240000)
    check("引擎最终就绪", True)

    # 2) AI 面板 + 保存配置
    page.click("#btn-ai")
    page.wait_for_timeout(400)
    sheet_open = page.is_visible("#ai-sheet")
    page.fill("#ai-base", "https://api.example.com/v1")
    page.fill("#ai-model", "mock-model")
    page.fill("#ai-key", "sk-mock-123")
    page.click("#ai-save")
    page.wait_for_timeout(300)
    cfg = page.evaluate("() => { try { return JSON.parse(localStorage.getItem('supersu.ai')||'null'); } catch(e){ return null; } }")
    check("AI 面板打开并保存配置到本机",
          sheet_open and cfg and cfg.get("model") == "mock-model" and cfg.get("key") == "sk-mock-123",
          str(cfg))

    # 3) 拦截 AI 接口，验证三条链路
    page.route("**/chat/completions", mock_ai)

    page.fill("#input", TEXT)
    page.wait_for_timeout(1200)
    page.click("#ai-polish")
    page.wait_for_function("() => document.getElementById('input').value.includes('模拟润色')", timeout=20000)
    check("AI 润色：结果写回编辑器", True,
          page.input_value("#input")[:20])

    page.fill("#input", TEXT)
    page.wait_for_timeout(1200)
    page.click("#ai-format")
    page.wait_for_function(
        "() => { const v = document.getElementById('input').value;"
        " return v.includes('## 小节一') && v.includes('第一段正文'); }", timeout=30000)
    md = page.input_value("#input")
    check("AI 智能排版：引擎套用结构且正文未改",
          "## 小节一" in md and "第一段正文" in md and "第二段正文" in md,
          md.replace("\n", " / ")[:60])

    page.click("#ai-summary")
    page.wait_for_function("() => { const o = document.getElementById('ai-out'); return o && !o.hidden && o.textContent.includes('模拟摘要'); }", timeout=20000)
    check("AI 摘要：结果显示在面板里", True)

    page.unroute("**/chat/completions")
    page.click("#ai-close")
    page.wait_for_timeout(300)
    check("AI 面板可关闭", not page.is_visible("#ai-sheet"))

    # 4) 自救开关
    page.goto(URL + "?reset-sw", wait_until="domcontentloaded", timeout=60000)
    page.wait_for_timeout(2500)
    left = page.evaluate("async () => (await caches.keys()).filter(k => k.startsWith('supersu-')).length")
    usable = page.is_visible("#input")
    check("?reset-sw 能清空本站缓存并正常重载", usable, f"残留缓存={left}")

    page.screenshot(path="E:/test/wechatca2/output/pwa_s1s3.png")
    browser.close()

failed = [r for r in results if not r[1]]
print("\n" + "=" * 52)
print(f"S1/S3 线上验证：{len(results) - len(failed)}/{len(results)} 通过")
for n, _, d in failed:
    print("  FAIL:", n, d)
sys.exit(1 if failed else 0)
