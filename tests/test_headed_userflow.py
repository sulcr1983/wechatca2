"""
有头浏览器（headed）用户流程 E2E 测试
=================================================
按真实用户操作顺序驱动前端，验证完整链路：
  1. 公众号页：输入文案 → 选择主题 → 自动渲染 → 预览出现
  2. 小红书页：切换 → 输入文案 → 选风格模板 → 生成封面 → 结果卡片出现

使用 Playwright 真实 Chromium（headless=False，可见窗口），非 API、非 test_client。
运行前需：pip 装好 playwright 且 `playwright install chromium`，以及后台服务在 5000 端口。

运行：
  python tests/test_headed_userflow.py
"""
import sys
import time
from playwright.sync_api import sync_playwright

BASE = "http://127.0.0.1:5000"
results = []          # (名称, 是否通过, 详情)
console_errors = []   # 页面 JS 报错


def check(name, ok, detail=""):
    results.append((name, ok, detail))
    mark = "PASS" if ok else "FAIL"
    print(f"[{mark}] {name}" + (f" — {detail}" if detail else ""))


def run():
    with sync_playwright() as p:
        # 有头浏览器：headless=False + slow_mo 让动作可见
        browser = p.chromium.launch(headless=False, slow_mo=250,
                                    args=["--disable-dev-shm-usage"])
        page = browser.new_page(viewport={"width": 1440, "height": 900})
        page.on("console", lambda m: console_errors.append(m.text)
                if m.type == "error" else None)
        page.on("pageerror", lambda e: console_errors.append(f"PAGEERROR: {e}"))

        # ---------- 阶段 0：打开首页 ----------
        page.goto(BASE, wait_until="networkidle", timeout=30000)
        check("首页加载 / #page-wechat 可见",
              page.is_visible("#page-wechat", timeout=10000))

        # ---------- 阶段 1：公众号渲染 ----------
        page.wait_for_selector("#input-area", timeout=10000)
        page.fill("#input-area",
                  "# 阳光星盘系统\n"
                  "今天上线了一个超好用的内容排版工具，支持一键生成公众号文章。\n"
                  "它还能自动产出小红书封面，省时又省心。")
        check("公众号文案已输入", True)

        # 等待主题加载，点击第一个主题触发渲染
        page.wait_for_selector("#tpl-list .tpl-item", timeout=10000)
        tpl_count = page.locator("#tpl-list .tpl-item").count()
        check("主题列表已加载", tpl_count > 0, f"{tpl_count} 套主题")
        page.locator("#tpl-list .tpl-item").first.click()

        # 等待预览 iframe 出现内容（自动渲染带 400ms 防抖）
        try:
            page.wait_for_function(
                """() => {
                    const f = document.getElementById('preview-frame');
                    return f && f.style.display !== 'none'
                        && f.contentDocument
                        && f.contentDocument.body
                        && f.contentDocument.body.innerText.trim().length > 0;
                }""",
                timeout=15000,
            )
            pv_txt = page.evaluate(
                "document.getElementById('preview-frame').contentDocument.body.innerText.trim().length")
            check("渲染预览成功（iframe 有内容）", True, f"预览正文 {pv_txt} 字")
        except Exception as e:
            check("渲染预览成功（iframe 有内容）", False, str(e)[:160])

        page.screenshot(path="output/headed_wechat.png")
        print("  -> 截图 output/headed_wechat.png")

        # ---------- 阶段 2：小红书封面生成 ----------
        page.click('.tab-btn[data-page="social"]', timeout=10000)
        page.wait_for_selector("#page-social.active", timeout=10000)
        check("切换到小红书页 #page-social", True)

        page.wait_for_selector("#social-text", timeout=10000)
        page.fill("#social-text",
                  "# 用AI点亮内容创作\n"
                  "阳光星盘系统：一键排版 + 自动封面，让创作回归内容本身。")
        # 等待风格模板网格出现并选择第一个
        page.wait_for_selector("#social-tpl-grid .tpl-mini", timeout=10000)
        style_count = page.locator("#social-tpl-grid .tpl-mini").count()
        check("小红书风格模板已加载", style_count > 0, f"{style_count} 个风格")
        page.locator("#social-tpl-grid .tpl-mini").first.click()

        # 点击生成封面
        page.click("#btn-generate-cover", timeout=10000)

        # 等待结果卡片出现
        try:
            page.wait_for_selector("#results-list .result-card", timeout=60000)
            n = page.locator("#results-list .result-card").count()
            check("小红书封面生成成功（结果卡片出现）", n > 0, f"{n} 张卡片")
        except Exception as e:
            check("小红书封面生成成功（结果卡片出现）", False, str(e)[:160])

        page.screenshot(path="output/headed_social.png")
        print("  -> 截图 output/headed_social.png")

        browser.close()

    # ---------- 汇总 ----------
    print("\n" + "=" * 50)
    passed = sum(1 for _, ok, _ in results if ok)
    total = len(results)
    print(f"有头浏览器用户流程测试：{passed}/{total} 通过")
    if console_errors:
        print(f"\n⚠️ 页面 JS 报错 {len(console_errors)} 条：")
        for e in console_errors[:10]:
            print("   -", e[:160])
    else:
        print("✅ 页面无 JS 控制台报错")
    print("=" * 50)
    return 0 if passed == total and not console_errors else 1


if __name__ == "__main__":
    sys.exit(run())
