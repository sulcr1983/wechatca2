#!/usr/bin/env python
"""更新面板「发布小票」验证（线上 PWA，有头）

页面地址加 `#upd-demo` 会直接展示更新卡（不影响正常更新流程），
用它验证：版本徽标 / 日期 / 三条亮点（带分类标签）/ 条数 / 查看全部。
"""
import os
import re
import sys

from playwright.sync_api import sync_playwright

try:
    sys.stdout.reconfigure(encoding="utf-8", errors="replace")
except Exception:
    pass

# 默认打线上；本地预览可传 SUPERSU_URL=http://127.0.0.1:8899
URL = (os.environ.get("SUPERSU_URL") or "https://supersu.ccwu.cc").rstrip("/") + "/#upd-demo"
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

    # 用户报障（2026-10-24）：版本号一直一样。徽标必须同时带语义化版本与构建号，
    # 构建号 = git 提交数，每次部署都会变，才能看出「这次真更新了」。
    badge_re = re.compile(r"^v\d+\.\d+\.\d+ · b\d+$")
    check("版本徽标 = v版本 · b构建号", bool(badge_re.match(card["badge"])), card["badge"])

    ver = page.evaluate("fetch('./version.json', {cache:'no-store'}).then(r => r.json())")
    check("徽标版本与 version.json 一致", card["badge"].startswith(f"v{ver.get('version')}"),
          f"{card['badge']} vs {ver}")

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

    pill = page.evaluate("() => document.getElementById('cl-version-pill')?.textContent || ''")
    check("更新记录面板徽标带构建号", bool(badge_re.match(pill)), pill)

    check("页面无 JS 未捕获异常", not errors, str(errors[:2]))
    browser.close()

failed = [r for r in results if not r[1]]
print("\n" + "=" * 52)
print(f"发布小票：{len(results) - len(failed)}/{len(results)} 通过")
for n, _, d in failed:
    print("  FAIL:", n, d)
sys.exit(1 if failed else 0)
