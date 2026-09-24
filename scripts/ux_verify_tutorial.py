"""教程验收（按页触发）：公众号页默认安静；小红书页首次进入给一次指引

用法（需先启动服务）：
    .venv/Scripts/python.exe scripts/ux_verify_tutorial.py
"""

import os
from playwright.sync_api import sync_playwright

BASE = "http://127.0.0.1:5000"
ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
OUT = os.path.join(ROOT, "docs", "ux-audit", "shots", "after")
os.makedirs(OUT, exist_ok=True)

res = []


def check(name, cond, detail=""):
    res.append((name, bool(cond), detail))
    print(("  PASS " if cond else "  FAIL ") + name + (f"  [{detail}]" if detail else ""))


def shot(page, name):
    page.screenshot(path=os.path.join(OUT, name + ".jpg"), type="jpeg", quality=70)
    print("  SHOT:", name)


def close_tutorial(page):
    btn = page.query_selector(".tutorial-modal .secondary")
    if btn:
        btn.click()
        page.wait_for_timeout(500)


def main():
    with sync_playwright() as p:
        browser = p.chromium.launch(headless=False, args=["--no-proxy-server"])
        ctx = browser.new_context(viewport={"width": 1440, "height": 900})
        page = ctx.new_page()
        errs = []
        page.on("console", lambda m: errs.append(m.text) if m.type == "error" else None)
        page.on("pageerror", lambda e: errs.append(str(e)))

        page.goto(BASE, wait_until="networkidle")
        page.wait_for_timeout(1800)

        print("— 公众号页：默认安静 —")
        check("公众号页默认不弹教程", page.eval_on_selector_all(".tutorial-modal", "els=>els.length") == 0)

        print("— 顶栏「教程」按当前页打开 —")
        page.click("#btn-tutorial")
        page.wait_for_timeout(900)
        t = page.eval_on_selector(".tutorial-modal", "el=>el.innerText") if page.query_selector(".tutorial-modal") else ""
        check("公众号页点教程 → 出现公众号教程", "公众号排版怎么用" in t, t[:30])
        check("公众号教程讲清 3 步", "粘贴" in t and "主题" in t and "复制" in t)
        check("公众号教程不含配图说明（不打扰）", "Pexels" not in t)
        shot(page, "tutorial-wechat")
        close_tutorial(page)

        print("— 切到小红书页：首次给一次指引 —")
        page.click('.tab-btn[data-page="social"]')
        page.wait_for_timeout(1400)
        check("切到小红书页自动弹教程", page.eval_on_selector_all(".tutorial-modal", "els=>els.length") >= 1)
        t2 = page.eval_on_selector(".tutorial-modal", "el=>el.innerText") if page.query_selector(".tutorial-modal") else ""
        check("小红书教程讲清 3 步", "发到哪" in t2 and "样式" in t2 and "生成封面" in t2)
        check("小红书教程说明配图来源与 Pexels 注册", "Pexels" in t2 and "pexels.com/api" in t2)
        check("小红书教程说明不会硬塞本地图", "明确提示" in t2 or "不会硬塞" in t2)
        check("小红书教程展示本机效果示例", page.eval_on_selector_all(".tutorial-modal img", "els=>els.length") >= 1)
        shot(page, "tutorial-social")
        close_tutorial(page)

        print("— 看过一次后不再打扰 —")
        page.reload(wait_until="networkidle")
        page.wait_for_timeout(1500)
        page.click('.tab-btn[data-page="social"]')
        page.wait_for_timeout(1300)
        check("看过后再切小红书页不再弹", page.eval_on_selector_all(".tutorial-modal", "els=>els.length") == 0)

        print("— 底图区「图和文案对不上」入口仍在 —")
        check("底图区有说明入口", page.query_selector("#lnk-bg-help") is not None)
        page.click("#lnk-bg-help")
        page.wait_for_timeout(900)
        check("点入口可重开小红书教程", page.eval_on_selector_all(".tutorial-modal", "els=>els.length") >= 1)
        close_tutorial(page)

        check("全程 0 控制台报错", len(errs) == 0, errs[:3])
        ctx.close()
        browser.close()

    print("\n=== 汇总 ===")
    fails = [r for r in res if not r[1]]
    print(f"{len(res) - len(fails)}/{len(res)} 通过")
    for n, _, d in fails:
        print("  FAIL:", n, d)


if __name__ == "__main__":
    main()
