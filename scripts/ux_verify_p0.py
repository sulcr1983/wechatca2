"""第一批（P0）改动的有头浏览器验收：U-1 / U-3 / U-4 / U-5 / U-6

用法（需先启动服务，且浏览器需绕开本机代理）：
    .venv/Scripts/python.exe scripts/ux_verify_p0.py
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


def main():
    with sync_playwright() as p:
        browser = p.chromium.launch(headless=False, args=["--no-proxy-server"])
        ctx = browser.new_context(viewport={"width": 1440, "height": 900})
        page = ctx.new_page()
        errs = []
        page.on("console", lambda m: errs.append(m.text) if m.type == "error" else None)
        page.on("pageerror", lambda e: errs.append(str(e)))

        page.goto(BASE, wait_until="networkidle")
        page.wait_for_timeout(1500)

        print("— U-5 示例按需 —")
        check("输入框初始为空（不再预置整篇示例）",
              page.eval_on_selector("#input-area", "el=>el.value") == "")
        page.click("#btn-demo")
        page.wait_for_timeout(700)
        check("点「看示例」后填入示例",
              len(page.eval_on_selector("#input-area", "el=>el.value")) > 20)
        check("按钮文案变为「清空」",
              page.eval_on_selector("#btn-demo", "el=>el.textContent").strip() == "清空")
        shot(page, "ui-demo-filled")
        page.click("#btn-demo")
        page.wait_for_timeout(500)
        check("再点「清空」后输入框为空",
              page.eval_on_selector("#input-area", "el=>el.value") == "")

        print("— U-6 两个主动作同级 —")
        check("复制按钮为主按钮样式",
              "btn-primary" in page.eval_on_selector("#btn-copy", "el=>el.className"))
        check("推送按钮为主按钮样式",
              "btn-primary" in page.eval_on_selector("#btn-push", "el=>el.className"))

        print("— U-5 记住上次主题 —")
        cards = page.query_selector_all(".tpl-card")
        before = None
        if len(cards) > 4:
            cards[4].click()
            page.wait_for_timeout(900)
        before = page.evaluate("() => activeTpl")
        page.reload(wait_until="networkidle")
        page.wait_for_timeout(1500)
        after = page.evaluate("() => activeTpl")
        check("重新打开仍是上次选的主题", before == after and bool(before), f"{before} -> {after}")

        print("— U-6 未配置推送给引导 —")
        page.fill("#input-area", "测试内容\n第二行")
        page.wait_for_timeout(1600)
        page.click("#btn-push")
        page.wait_for_timeout(1300)
        toast = page.eval_on_selector("#toast-el", "el=>el.textContent").strip()
        modal_n = page.eval_on_selector_all(".modal", "els=>els.length")
        shot(page, "ui-push-guide")
        check("未配置公众号时给出绑定引导",
              ("绑定" in toast) or modal_n > 0, f"toast={toast!r} modal={modal_n}")
        page.keyboard.press("Escape")
        page.wait_for_timeout(400)
        page.reload(wait_until="networkidle")
        page.wait_for_timeout(1300)

        print("— U-1 预览卡不再露出 <br> —")
        page.click('.tab-btn[data-page="social"]')
        page.wait_for_timeout(1300)
        # 首次进入小红书页会弹一次「使用教程」（产品行为，属预期）；
        # 测试须先关掉弹窗，否则遮罩会挡住后续点击造成假失败。
        page.evaluate("document.querySelectorAll('.modal').forEach(m=>m.remove())")
        page.wait_for_timeout(150)
        page.fill("#social-text", "3个让家里立刻变整洁的小动作\n不用大扫除，每天10分钟就够")
        page.wait_for_timeout(700)
        minis = page.query_selector_all(".tpl-mini")
        if minis:
            minis[0].click()
        page.wait_for_timeout(900)
        desc = page.eval_on_selector("#spv-desc", "el=>el.textContent")
        check("预览卡文字不含字面 <br>", "<br>" not in desc, repr(desc[:60]))
        shot(page, "ui-preview-card")

        print("— U-3 生成中：置灰 + 真实阶段 —")
        page.click("#btn-generate-cover")
        page.wait_for_timeout(1300)
        disabled = page.eval_on_selector("#btn-generate-cover", "el=>el.disabled")
        btext = page.eval_on_selector("#btn-generate-cover", "el=>el.textContent").strip()
        stage = page.eval_on_selector("#results-empty", "el=>el.textContent").strip()
        shot(page, "ui-generating")
        check("生成中按钮置灰（防重复点）", disabled)
        check("按钮文案变为生成中", "生成中" in btext, btext)
        check("显示真实阶段文案", ("正在" in stage), stage)

        print("— 等待生成完成 + U-4 署名 —")
        try:
            page.wait_for_selector(".result-card", timeout=180000)
            page.wait_for_timeout(1600)
        except Exception as e:
            print("  ! 等待结果超时:", str(e)[:80])
        shot(page, "ui-result")
        credit = page.eval_on_selector("#bg-credit", "el=>el.textContent").strip()
        btn_after = page.eval_on_selector("#btn-generate-cover", "el=>el.textContent").strip()
        check("署名如实说明来源（不再写死“自动联网搜索”）",
              ("没找到" in credit) or ("联网找到" in credit), credit[:70])
        check("生成结束后按钮恢复", btn_after == "生成封面", btn_after)
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
