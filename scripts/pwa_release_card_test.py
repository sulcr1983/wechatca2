#!/usr/bin/env python
"""更新面板「发布小票」验证（线上 PWA，有头）

页面地址加 `#upd-demo` 会直接展示更新卡（不影响正常更新流程），
用它验证：版本徽标 / 日期 / 三条亮点（带分类标签）/ 条数 / 查看全部。
"""
import sys

from playwright.sync_api import sync_playwright

try:
    sys.stdout.reconfigure(encoding="utf-8", errors="replace")
except Exception:
    pass

URL = "https://supersu.ccwu.cc/#upd-demo"
results = []


def check(name, ok, detail=""):
    results.append((name, ok, detail))
    print(f"[{'PASS' if ok else 'FAIL'}] {name}" + (f" — {detail}" if detail else ""))


with sync_playwright() as p:
    browser = p.chromium.launch(channel="chrome", headless=False, args=["--window-size=1440,900"])
    ctx = browser.new_context(viewport={"width": 1440, "height": 900})
    page = ctx.new_page()
    errors = []
    page.on("pageerror", lambda e: errors.append(str(e)[:160]))

    page.goto(URL, wait_until="domcontentloaded", timeout=60000)
    page.wait_for_function(
        "() => { const c = document.getElementById('upd-card'); return c && !c.hidden; }",
        timeout=30000,
    )
    card = page.evaluate("""() => ({
      badge: document.getElementById('upd-badge')?.textContent || '',
      date: document.getElementById('upd-date')?.textContent || '',
      title: document.getElementById('upd-card-text')?.textContent || '',
      items: [...document.querySelectorAll('#upd-list li')].map((l) => l.textContent.trim()),
      tags: [...document.querySelectorAll('#upd-list .upd-tag')].map((t) => t.textContent.trim()),
    })""")
    print("  卡片内容:", card)

    check("发布小票有版本徽标", card["badge"].startswith("v"), card["badge"])
    check("列出亮点并带分类标签",
          len(card["items"]) >= 2 and all(t in ("新功能", "优化", "修复") for t in card["tags"]),
          f"{len(card['items'])} 条 / {card['tags']}")
    check("标题给出更新条数", "条更新" in card["title"], card["title"])
    check("有日期", len(card["date"]) >= 8, card["date"])

    page.screenshot(path="E:/test/wechatca2/output/pwa_release_card.png")
    page.click("#upd-all")
    page.wait_for_timeout(900)
    opened = page.evaluate("() => { const e = document.getElementById('cl-panel'); return !!e && !e.hidden; }")
    check("「查看全部」打开更新记录面板", opened)
    check("页面无 JS 未捕获异常", not errors, str(errors[:2]))
    browser.close()

failed = [r for r in results if not r[1]]
print("\n" + "=" * 52)
print(f"发布小票：{len(results) - len(failed)}/{len(results)} 通过")
for n, _, d in failed:
    print("  FAIL:", n, d)
sys.exit(1 if failed else 0)
