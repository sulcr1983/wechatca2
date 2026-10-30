#!/usr/bin/env python
"""模板库体验修复验证（线上 PWA，有头）

1) 缩略图真的能看见（占位层不再盖住图片）
2) 抽屉打开时不遮挡预览（让位布局），且选模板不关闭，可连续对比
3) 预览里的「写留言 / 赞 / 在看」已移除
4) 版本号随构建自动变化（不再是写死的 1.0.0）
"""
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


with sync_playwright() as p:
    browser = p.chromium.launch(channel="chrome", headless=False, args=["--window-size=1440,900"])
    ctx = browser.new_context(viewport={"width": 1440, "height": 900})
    page = ctx.new_page()
    page.goto(URL, wait_until="domcontentloaded", timeout=60000)
    page.wait_for_function("() => typeof window.__supersuIsIdle === 'function'", timeout=30000)

    # 4) 版本号（build.mjs 写的是 build，旧断言读已不存在的 commits —— 2026-10-24 修正）
    ver = page.evaluate("async () => (await (await fetch('./version.json', {cache:'no-store'})).json())")
    build_no = ver.get("build") or ver.get("commits") or 0
    check("版本号由构建自动生成", str(ver.get("version", "")).count(".") == 2 and build_no > 0,
          f"v{ver.get('version')} · build {build_no}")

    # 3) 模拟底栏已移除
    wxbar = page.locator(".wx-bar").count()
    check("预览里的「写留言/赞/在看」已移除", wxbar == 0, f".wx-bar={wxbar}")

    # 1) 缩略图
    page.click("#btn-themes")
    # ⚠️ 别用固定等待：慢环境（刚部署后 SW 更新 / 冷缓存）抽屉渲染 + 图片懒加载
    #    可能超过 2.5s，2026-10-27 门禁里就出现过 n=0 的假失败（单跑 9/9 正常）。
    #    改成等「真有缩略图且已解码」再测。
    try:
        page.wait_for_function(
            "() => { const i = document.querySelector('#drawer-grid .d-thumb');"
            " return !!i && i.naturalWidth > 0; }", timeout=20000)
    except Exception:
        pass
    page.wait_for_timeout(300)
    thumbs = page.evaluate("""() => {
      const imgs = [...document.querySelectorAll('#drawer-grid .d-thumb')].slice(0, 9);
      const loaded = imgs.filter(i => i.naturalWidth > 0).length;
      const z = imgs.length ? getComputedStyle(imgs[0]).zIndex : '';
      let hit = '';
      if (imgs.length) {
        const r = imgs[0].getBoundingClientRect();
        const el = document.elementFromPoint(r.left + r.width / 2, r.top + r.height / 2);
        hit = el ? el.tagName + '.' + (el.className || '') : '';
      }
      return { n: imgs.length, loaded, z, hit };
    }""")
    check("缩略图可见（占位层不再盖住图片）",
          thumbs["loaded"] >= 3 and thumbs["z"] == "1" and thumbs["hit"].startswith("IMG"),
          str(thumbs))

    # 2) 不重叠 + 不关闭
    geo = page.evaluate("""() => {
      const d = document.getElementById('drawer').getBoundingClientRect();
      const s = document.getElementById('pane-preview').getBoundingClientRect();
      return { drawerLeft: Math.round(d.left), stageRight: Math.round(s.right),
               browsing: document.body.classList.contains('browsing'),
               editHidden: getComputedStyle(document.querySelector('.pane-edit')).display };
    }""")
    check("抽屉打开时与预览不重叠（让位布局）",
          geo["browsing"] and geo["drawerLeft"] >= geo["stageRight"] - 1,
          f"drawer.left={geo['drawerLeft']} stage.right={geo['stageRight']} 编辑器={geo['editHidden']}")

    before = page.evaluate("() => document.querySelector('#style-caps .cap[aria-pressed=\"true\"]')?.dataset.id")
    # 刚部署后 SW 可能自动重载并重置抽屉，这里先确保抽屉处于打开且有卡片
    if page.locator("#drawer").is_hidden() or page.locator("#drawer-grid .d-card").count() == 0:
        page.click("#btn-themes")
        page.wait_for_selector("#drawer-grid .d-card", timeout=15000)
        page.wait_for_timeout(600)
    # 真实路径：全部视图点族代表卡进族视图 → 点一个色调换色（抽屉应保持打开）
    if page.locator("#drawer-grid .d-family-card").count():
        page.locator("#drawer-grid .d-family-card").first.click()
        page.wait_for_timeout(500)
        page.locator("#drawer-grid .d-tone").nth(1).click()
    else:
        page.locator("#drawer-grid .d-card").nth(1).click()
    page.wait_for_timeout(1200)
    after = page.evaluate("() => document.querySelector('#style-caps .cap[aria-pressed=\"true\"]')?.dataset.id")
    still_open = page.evaluate("() => !document.getElementById('drawer').hidden")
    check("选模板后抽屉保持打开、可连续对比", still_open and before != after,
          f"{before} → {after}")

    page.screenshot(path="E:/test/wechatca2/output/pwa_template_ux.png")
    browser.close()

failed = [r for r in results if not r[1]]
print("\n" + "=" * 52)
print(f"模板库体验：{len(results) - len(failed)}/{len(results)} 通过")
for n, _, d in failed:
    print("  FAIL:", n, d)
sys.exit(1 if failed else 0)
