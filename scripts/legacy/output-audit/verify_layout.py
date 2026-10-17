"""验证公众号页重构后的布局：
- 顶部模板条显示 53 张色卡（横向滚动）
- 点击色卡 → 预览渲染
- 内联搜索筛选
- 下方双区：输入框 + 预览（手机框 390x760）
- 无 console / page error
"""
import sys
from playwright.sync_api import sync_playwright

BASE = "http://127.0.0.1:5000"
errors = []

def main():
    with sync_playwright() as p:
        browser = p.chromium.launch(headless=False)
        page = browser.new_page(viewport={"width": 1280, "height": 860})
        page.on("console", lambda m: errors.append(f"console:{m.type}:{m.text}") if m.type in ("error",) else None)
        page.on("pageerror", lambda e: errors.append(f"pageerror:{e}"))

        page.goto(BASE, wait_until="networkidle")
        page.wait_for_selector("#tpl-strip .tpl-card", timeout=10000)

        # 1) 模板色卡数量
        cards = page.query_selector_all("#tpl-strip .tpl-card")
        n = len(cards)

        # 2) 顶部模板条是否横向可滚动（宽度超出视口）
        strip_box = page.eval_on_selector("#tpl-strip", "el => ({sw: el.scrollWidth, cw: el.clientWidth, sh: el.scrollHeight, ch: el.clientHeight})")
        # 3) 模板条高度（应紧凑，固定高度，不撑开页面）
        bar_h = page.eval_on_selector(".tpl-bar", "el => el.getBoundingClientRect().height")

        # 4) 下方双区：wechat-body 为 2 列网格
        cols = page.eval_on_selector(".wechat-body", "el => getComputedStyle(el).gridTemplateColumns")

        # 5) 点击第 6 个模板 → 预览渲染
        cards[5].click()
        page.wait_for_selector("#preview-frame[src]", timeout=8000)
        preview_src = page.eval_on_selector("#preview-frame", "el => el.getAttribute('src') || ''")
        # 6) 手机预览框尺寸
        page.click('[data-preview="phone"]')
        page.wait_for_timeout(300)
        phone = page.eval_on_selector("#preview-frame", "el => ({w: el.getBoundingClientRect().width, h: el.getBoundingClientRect().height})")

        # 7) 内联搜索筛选
        page.fill("#tpl-search", "极光")
        page.wait_for_timeout(200)
        filtered = page.query_selector_all("#tpl-strip .tpl-card")
        nf = len(filtered)
        page.fill("#tpl-search", "")
        page.wait_for_timeout(200)
        restored = len(page.query_selector_all("#tpl-strip .tpl-card"))

        # 截图
        page.click('[data-preview="html"]')
        page.wait_for_timeout(200)
        page.screenshot(path="output/e2e_audit/shots/layout_new_desktop.png")
        page.set_viewport_size({"width": 390, "height": 844})
        page.wait_for_timeout(200)
        page.screenshot(path="output/e2e_audit/shots/layout_new_mobile.png")

        browser.close()

        print("=== 布局验证结果 ===")
        print(f"模板色卡总数        : {n}")
        print(f"模板条高度(px)      : {bar_h:.1f}")
        print(f"strip scroll/client : sw={strip_box['sw']} cw={strip_box['cw']} (横向可滚动={strip_box['sw']>strip_box['cw']})")
        print(f"wechat-body 列      : {cols}")
        print(f"预览已渲染(src非空) : {bool(preview_src)}")
        print(f"手机框尺寸(px)      : {phone['w']:.0f} x {phone['h']:.0f}")
        print(f"搜索'极光'后卡片数  : {nf} (应 < {n})")
        print(f"清空搜索后卡片数    : {restored} (应={n})")
        print(f"console/page 错误   : {len(errors)} -> {errors}")
        ok = (n >= 50 and strip_box['sw'] > strip_box['cw'] and len(cols.split()) == 2 and bool(preview_src)
              and phone['w'] >= 360 and phone['h'] >= 700 and nf < n and restored == n and len(errors) == 0)
        print("RESULT:", "PASS" if ok else "FAIL")
        return 0 if ok else 1

if __name__ == "__main__":
    sys.exit(main())
