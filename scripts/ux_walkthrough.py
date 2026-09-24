"""
UX 走查脚本：用有头浏览器按「真实用户路径」走一遍 SuperSu，逐步截图 + 抓取界面文案。

用法（需先启动服务）：
    .venv/Scripts/python.exe scripts/ux_walkthrough.py

产物：
    docs/ux-audit/shots/*.jpg    逐步骤截图
    docs/ux-audit/walkthrough.json   抓取到的文案 / 状态 / 控制台错误
"""

import os
import json
from playwright.sync_api import sync_playwright

BASE = "http://127.0.0.1:5000"
ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
OUT = os.path.join(ROOT, "docs", "ux-audit", "shots")
os.makedirs(OUT, exist_ok=True)

# 模拟真实用户：从 Word / 记事本复制过来的一篇纯文本文章（无任何 Markdown 标记）
SAMPLE_ARTICLE = """为什么越来越多人开始"断亲"

最近有个词很火，叫断亲。
说的是年轻人主动减少和亲戚之间的来往，不再勉强维系那些让自己不舒服的关系。

有人觉得这是冷漠，但真正的理由往往没那么简单。

三个真实的理由：
第一，无效的客套太消耗人。每年过年被追问工资、对象、房子，回答一次累一次。
第二，关系里只有索取没有支持。需要帮忙时找不到人，需要表演时一个不落。
第三，物理距离拉开了共同话题。一年见一次，能聊的只剩回忆。

断亲不是恨，是止损。
把有限的精力留给真正互相惦记的人，这不是冷漠，是诚实。

写在最后：
任何关系都要经得起"我能不能做自己"这个检验。
如果一段关系里你只能演，那它迟早会断。"""

SAMPLE_SOCIAL = """3个让家里立刻变整洁的小动作
不用大扫除，每天10分钟就够"""


def shot(page, name):
    page.screenshot(path=os.path.join(OUT, name + ".jpg"), type="jpeg", quality=65)
    print("SHOT:", name)


def safe(info, label, fn):
    """每一步都容错，保证走查能跑完并落盘结果。"""
    try:
        fn()
    except Exception as e:
        info.setdefault("warnings", []).append(f"{label}: {type(e).__name__}: {str(e)[:160]}")
        print("WARN:", label, "->", str(e)[:120])


def main():
    info = {"steps": [], "warnings": [], "errors": []}

    with sync_playwright() as p:
        # --no-proxy-server：绕开本机 Clash 系统代理，否则访问 127.0.0.1 会被代理拦成 502
        browser = p.chromium.launch(headless=False, args=["--no-proxy-server"])
        ctx = browser.new_context(viewport={"width": 1440, "height": 900})
        page = ctx.new_page()
        page.on("console", lambda m: info["errors"].append("console:" + m.text) if m.type == "error" else None)
        page.on("pageerror", lambda e: info["errors"].append("pageerror:" + str(e)))

        page.goto(BASE, wait_until="networkidle")
        page.wait_for_timeout(1500)

        # ---------- 01 首屏（空状态）----------
        shot(page, "01-wechat-empty")
        info["topbar_tabs"] = page.eval_on_selector_all(".tab-btn", "els => els.map(e => e.innerText.trim())")
        info["input_placeholder"] = page.eval_on_selector("#input-area", "el => el.placeholder")
        info["buttons_wechat"] = page.eval_on_selector_all(
            "#page-wechat button", "els => els.filter(e=>e.offsetParent).map(e=>e.innerText.trim()).filter(Boolean)")
        info["tpl_count"] = page.eval_on_selector_all(".tpl-card", "els => els.length")
        info["preview_empty_html_len"] = page.eval_on_selector(
            "#preview-frame", "el => (el.getAttribute('srcdoc')||'').length")
        info["steps"].append("01 公众号页首屏（还没输入任何内容）")

        # ---------- 02 粘贴文章 -> 自动渲染 ----------
        def s02():
            page.fill("#input-area", SAMPLE_ARTICLE)
            page.wait_for_timeout(2600)
            shot(page, "02-wechat-rendered")
        safe(info, "02", s02)
        info["steps"].append("02 把一篇纯文本粘进去，看它自动排版成什么样")

        # ---------- 03 模板筛选 ----------
        def s03():
            page.fill("#tpl-search", "科技")
            page.wait_for_timeout(900)
            shot(page, "03-tpl-search")
            info["tpl_count_after_search"] = page.eval_on_selector_all(
                ".tpl-card", "els => els.filter(e=>e.offsetParent).length")
            page.fill("#tpl-search", "")
            page.wait_for_timeout(500)
        safe(info, "03", s03)
        info["steps"].append("03 在模板条搜索框输入「科技」筛选主题")

        # ---------- 04 换主题 ----------
        def s04():
            cards = page.query_selector_all(".tpl-card")
            if len(cards) > 3:
                cards[3].click()
                page.wait_for_timeout(1800)
                shot(page, "04-tpl-switched")
        safe(info, "04", s04)
        info["steps"].append("04 点第 4 个主题色卡，换一套风格")

        # ---------- 05 复制反馈 ----------
        def s05():
            page.click("#btn-copy")
            page.wait_for_timeout(1200)
            shot(page, "05-copy-feedback")
            info["toast_text"] = page.eval_on_selector_all(
                "#toast-el", "els => els.map(e => ({text: e.innerText.trim(), visible: !!(e.offsetWidth||e.offsetHeight), cls: e.className}))")
        safe(info, "05", s05)
        info["steps"].append("05 点「复制」，看有没有明确的成功提示")

        # ---------- 06 手机预览模式 ----------
        def s06():
            page.click('.pv-btn[data-preview="phone"]')
            page.wait_for_timeout(1200)
            shot(page, "06-preview-phone")
            page.click('.pv-btn[data-preview="html"]')
            page.wait_for_timeout(600)
        safe(info, "06", s06)
        info["steps"].append("06 切换「手机 / HTML」预览模式")

        # ---------- 07 AI 面板 ----------
        def s07():
            page.click("#ai-toggle")
            page.wait_for_timeout(1000)
            shot(page, "07-ai-panel")
            info["ai_panel_cards"] = page.eval_on_selector_all(
                ".ai-card", "els => els.map(e => e.innerText.trim().replace(/\\n+/g,' | '))")
            page.click("#ai-toggle")
            page.wait_for_timeout(600)
        safe(info, "07", s07)
        info["steps"].append("07 点开「AI 工具」面板，看里面几张卡分别叫什么")

        # ---------- 08 推送弹窗（只看表单，不点确认推送）----------
        def s08():
            page.click("#btn-push")
            page.wait_for_timeout(1500)
            shot(page, "08-push-modal")
            info["push_modal_fields"] = page.eval_on_selector_all(
                "#push-modal input, #push-modal textarea, #push-modal select",
                "els => els.map(e => ({tag: e.tagName, id: e.id, ph: e.placeholder||'', val: (e.value||'').slice(0,40)}))")
            page.keyboard.press("Escape")
            page.wait_for_timeout(600)
        safe(info, "08", s08)
        info["steps"].append("08 点「一键推送」看要填多少东西（只看不提交）")

        # ---------- 08b 重置页面（避免推送弹窗残留遮挡后续点击）----------
        def s08b():
            page.reload(wait_until="networkidle")
            page.wait_for_timeout(1500)
        safe(info, "08b", s08b)

        # ---------- 09 小红书页首屏 ----------
        def s09():
            page.click('.tab-btn[data-page="social"]', timeout=8000)
            page.wait_for_timeout(1600)
            shot(page, "09-social-empty")
            info["social_placeholder"] = page.eval_on_selector("#social-text", "el => el.placeholder")
            info["buttons_social"] = page.eval_on_selector_all(
                "#page-social button", "els => els.filter(e=>e.offsetParent).map(e=>e.innerText.trim()).filter(Boolean)")
            info["style_tabs"] = page.eval_on_selector_all(".style-tab", "els => els.map(e=>e.innerText.trim())")
            info["tpl_mini_count"] = page.eval_on_selector_all(".tpl-mini", "els => els.length")
        safe(info, "09", s09)
        info["steps"].append("09 切到小红书封面页，看首屏")

        # ---------- 10 填文案 + 选风格 ----------
        def s10():
            page.fill("#social-text", SAMPLE_SOCIAL)
            page.wait_for_timeout(700)
            minis = page.query_selector_all(".tpl-mini")
            if minis:
                minis[0].click()
            page.wait_for_timeout(700)
            shot(page, "10-social-filled")
            info["char_count"] = page.eval_on_selector("#social-char-count", "el => el.innerText.trim()")
        safe(info, "10", s10)
        info["steps"].append("10 填好文案、选好风格，准备生成")

        # ---------- 11 生成中（加载态）----------
        def s11():
            page.click("#btn-generate-cover")
            page.wait_for_timeout(2500)
            shot(page, "11-social-loading")
            info["gen_btn_text_while_loading"] = page.eval_on_selector("#btn-generate-cover", "el => el.innerText.trim()")
        safe(info, "11", s11)
        info["steps"].append("11 点「生成封面」后的等待过程，有没有加载提示")

        # ---------- 12 生成结果 ----------
        def s12():
            page.wait_for_selector(".result-card", timeout=150000)
            page.wait_for_timeout(1800)
            shot(page, "12-social-result")
            info["result_count"] = page.eval_on_selector_all(".result-card", "els => els.length")
            info["bg_credit"] = page.eval_on_selector_all("#bg-credit", "els => els.map(e=>e.innerText.trim())")
        safe(info, "12", s12)
        info["steps"].append("12 封面生成出来的结果长什么样")

        ctx.close()

        # ---------- 13/14 移动端 ----------
        m = browser.new_context(viewport={"width": 390, "height": 844}, is_mobile=True, has_touch=True)
        mp = m.new_page()
        mp.on("pageerror", lambda e: info["errors"].append("mobile pageerror:" + str(e)))
        mp.goto(BASE, wait_until="networkidle")
        mp.wait_for_timeout(1500)
        shot(mp, "13-mobile-wechat")
        info["mobile_overflow_wechat"] = mp.evaluate(
            "() => ({scrollW: document.documentElement.scrollWidth, clientW: document.documentElement.clientWidth})")
        mp.fill("#input-area", SAMPLE_ARTICLE)
        mp.wait_for_timeout(2200)
        shot(mp, "14-mobile-wechat-filled")
        info["steps"].append("13/14 手机尺寸（390px）下公众号页长什么样")

        def s15():
            mp.click('.tab-btn[data-page="social"]')
            mp.wait_for_timeout(1400)
            shot(mp, "15-mobile-social")
            info["mobile_overflow_social"] = mp.evaluate(
                "() => ({scrollW: document.documentElement.scrollWidth, clientW: document.documentElement.clientWidth})")
        safe(info, "15", s15)
        info["steps"].append("15 手机尺寸下小红书页长什么样")

        m.close()
        browser.close()

    with open(os.path.join(ROOT, "docs", "ux-audit", "walkthrough.json"), "w", encoding="utf-8") as f:
        json.dump(info, f, ensure_ascii=False, indent=2)

    print(json.dumps({k: v for k, v in info.items() if k != "steps"}, ensure_ascii=False, indent=2))


if __name__ == "__main__":
    main()
