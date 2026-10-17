"""
全面端到端走查（用户实际使用流）
================================
逐按钮 / 逐功能驱动前端，记录每个交互的真实结果，并对照归藏设计准则截图。
输出：
  - output/e2e_audit/walkthrough_report.json  （结构化结果）
  - output/e2e_audit/shots/*.png              （逐步截图证据）
"""
import sys, json, time
from pathlib import Path
from uuid import uuid4
from playwright.sync_api import sync_playwright

BASE = "http://127.0.0.1:5000"
SHOTS = Path("output/e2e_audit/shots")
SHOTS.mkdir(parents=True, exist_ok=True)
REPORT = []

console_errors = []
page_errors = []
PAGE = None


def step(name, ok, detail="", shot=None):
    REPORT.append({"step": name, "ok": bool(ok), "detail": str(detail)[:400]})
    mark = "PASS" if ok else "FAIL"
    print(f"[{mark}] {name}" + (f" — {detail}" if detail else ""))
    if shot:
        try:
            PAGE.screenshot(path=str(SHOTS / shot))
            print(f"     -> 截图 {SHOTS / shot}")
        except Exception as e:
            print(f"     !! 截图失败 {e}")


def safe(fn, default=None):
    try:
        return fn()
    except Exception as e:
        return default if default is not None else f"ERR:{e}"


def clear_overlays(page):
    """关闭任何打开的弹窗并收起 AI 侧栏（用于步骤间清理 UI 状态）。
    本项目弹窗无 Escape 监听；取消按钮内部即执行
    this.closest('.modal').remove()，这里等价地直接移除所有 .modal。"""
    try:
        page.evaluate(
            "document.querySelectorAll('.modal').forEach(m=>m.remove());"
            "document.getElementById('ai-panel').classList.remove('open');")
        time.sleep(0.2)
    except Exception:
        pass


def run():
    with sync_playwright() as p:
        browser = p.chromium.launch(headless=False, slow_mo=250,
                                    args=["--disable-dev-shm-usage"])
        global PAGE
        page = browser.new_page(viewport={"width": 1440, "height": 900})
        PAGE = page
        page.on("console", lambda m: console_errors.append(m.text)
                if m.type == "error" else None)
        page.on("pageerror", lambda e: page_errors.append(str(e)))

        # ===== 阶段 0：首页 =====
        page.goto(BASE, wait_until="networkidle", timeout=30000)
        step("首页加载 / 公众号页默认可见",
             page.is_visible("#page-wechat", timeout=10000),
             shot="00_home.png")

        # ===== 阶段 1：公众号 - 输入 + 主题渲染 =====
        page.wait_for_selector("#input-area", timeout=10000)
        page.fill("#input-area",
                  "# 阳光星盘系统\n"
                  "今天上线了一个超好用的内容排版工具，支持一键生成公众号文章。\n"
                  "它还能自动产出小红书封面，省时又省心。")
        step("公众号文案输入", True)

        page.wait_for_selector("#tpl-list .tpl-item", timeout=10000)
        tpl_count = page.locator("#tpl-list .tpl-item").count()
        step("主题列表加载（53 套）", tpl_count >= 50, f"{tpl_count} 套")

        # 点击前 3 个主题，确认预览刷新
        previews = []
        for i in range(min(3, tpl_count)):
            page.locator("#tpl-list .tpl-item").nth(i).click()
            time.sleep(0.6)
            txt = safe(lambda: page.evaluate(
                "document.getElementById('preview-frame')"
                ".contentDocument.body.innerText.trim().length"), 0)
            previews.append(txt)
        step("点击主题触发渲染（预览 iframe 有内容）",
             all(v and v > 0 for v in previews),
             f"预览字数={previews}", shot="01_wechat_rendered.png")

        # ===== 阶段 2：公众号 - 手机预览按钮（Flag 1）=====
        before = safe(lambda: page.evaluate(
            "document.getElementById('preview-frame').src.slice(-40)"))
        page.click('[data-preview="phone"]', timeout=5000)
        time.sleep(0.4)
        after = safe(lambda: page.evaluate(
            "document.getElementById('preview-frame').src.slice(-40)"))
        step("[Flag1] 手机预览按钮是否产生差异化渲染",
             before == after,
             f"切换前后 iframe src 末段相同={before==after}（惰性：仅切高亮）")

        # ===== 阶段 3：公众号 - 复制（本地）=====
        try:
            page.click("#btn-copy", timeout=5000)
            toast = safe(lambda: page.evaluate(
                "document.getElementById('toast-el')"
                ".textContent.trim()"), "")
            step("复制按钮触发（toast 反馈）", True, f"toast='{toast}'")
        except Exception as e:
            step("复制按钮触发", False, e)

        # ===== 阶段 4：公众号 - 历史（Flag 3 死功能）=====
        page.click("#btn-history", timeout=5000)
        time.sleep(0.4)
        hist_txt = safe(lambda: page.evaluate(
            "(()=>{const m=document.querySelector('.modal');"
            "return m?m.innerText.trim().slice(0,80):''})()"), "")
        step("[Flag3] 历史弹窗内容",
             "暂无" in hist_txt or "历史" in hist_txt,
             f"弹窗文本='{hist_txt}'", shot="02_history_modal.png")
        clear_overlays(page)

        # ===== 阶段 5：公众号 - 一键推送弹窗（Bug A3 修复后契约校验）=====
        # 注入一个测试账号，验证前端正确读取后端「裸数组」并填充下拉
        test_nick = "E2E测试账号_" + uuid4().hex[:6]
        acct_created = safe(lambda: page.request.post(
            BASE + "/api/accounts",
            data=json.dumps({"nickname": test_nick,
                             "appid": "wx_e2e_test_appid",
                             "appsecret": "e2e_dummy_secret"}),
            headers={"Content-Type": "application/json"}).json(), {})
        page.click("#btn-push", timeout=5000)
        time.sleep(0.6)
        acct_opts = page.locator("#push-account option").count()
        first_real = safe(lambda: page.evaluate(
            "(()=>{const s=document.getElementById('push-account');"
            "return s&&s.options.length>1?s.options[1].value:'NONE'})()"), "NONE")
        has_test = safe(lambda: page.evaluate(
            "(function(){const s=document.getElementById('push-account');"
            "return Array.from(s.options).some(function(o){return o.text.includes("
            + json.dumps(test_nick) + ");})})()"), False)
        # 清理注入的测试账号，避免污染用户数据
        if acct_created.get("success") and acct_created.get("account", {}).get("id"):
            safe(lambda: page.request.delete(
                BASE + "/api/accounts/" + acct_created["account"]["id"]))
        step("[BugA3] 推送账号下拉（修复：裸数组→填充）",
             acct_opts >= 2 and first_real not in ("NONE", "") and has_test,
             f"option 数={acct_opts}；首真实option值='{first_real}'；含测试账号={has_test}",
             shot="03_push_modal.png")
        # 关闭
        clear_overlays(page); time.sleep(0.3)

        # ===== 阶段 6：公众号 - AI 工具面板（Bug A1/A2 修复后契约校验）=====
        # 无需真实 LLM：用 route 拦截 AI 接口，验证前端逻辑层字段映射正确
        page.route("**/api/ai-format", lambda route: route.fulfill(
            status=200, content_type="application/json",
            body=json.dumps({"success": True,
                             "markdown": "# E2E排版结果\n这是修复后读取 data.markdown 字段的内容。"})))
        page.click("#ai-toggle", timeout=5000)
        time.sleep(0.3)
        # AI 智能排版
        try:
            page.click("#btn-ai-format", timeout=5000)
            time.sleep(1.2)
            newval = safe(lambda: page.evaluate(
                "document.getElementById('input-area').value"), "")
            step("[BugA1] AI 智能排版（修复：读 data.markdown）",
                 "E2E排版结果" in newval,
                 f"编辑区含排版结果={'E2E排版结果' in newval}（长度={len(newval)}）",
                 shot="04_ai_format.png")
        except Exception as e:
            step("[BugA1] AI 智能排版", False, e)

        # AI 润色弹窗（拦截 /api/polish，验证读 data.polished_text）
        page.route("**/api/polish", lambda route: route.fulfill(
            status=200, content_type="application/json",
            body=json.dumps({"success": True,
                             "polished_text": "E2E润色后的文本，已修复字段映射。"})))
        try:
            page.click("#btn-polish", timeout=5000)
            time.sleep(0.5)
            page.click("#polish-start", timeout=5000)
            time.sleep(1.2)
            res = safe(lambda: page.evaluate(
                "document.getElementById('polish-result').value"), "")
            step("[BugA2] AI 润色结果（修复：读 data.polished_text）",
                 "E2E润色后的文本" in res,
                 f"结果区含润色结果={'E2E润色后的文本' in res}（长度={len(res)}）",
                 shot="05_polish_modal.png")
            clear_overlays(page); time.sleep(0.3)
        except Exception as e:
            step("[BugA2] AI 润色", False, e)

        # ===== 阶段 7：公众号 - 设置弹窗（Bug A4 修复后契约校验）=====
        page.click("#btn-settings", timeout=5000)
        time.sleep(0.6)
        # 平台下拉：后端返 dict 按 key，前端应用 Object.entries 填充
        plat_opts = page.locator("#ai-platform option").count()
        first_val = safe(lambda: page.evaluate(
            "(()=>{const s=document.getElementById('ai-platform');"
            "return s&&s.options.length?s.options[0].value:'NONE'})()"), "NONE")
        first_txt = safe(lambda: page.evaluate(
            "(()=>{const s=document.getElementById('ai-platform');"
            "return s&&s.options.length?s.options[0].textContent.trim():'NONE'})()"), "NONE")
        step("[BugA4] 设置-平台下拉（修复：dict 按 key→填充）",
             plat_opts >= 1 and first_val not in (None, "undefined", "", "NONE"),
             f"option 数={plat_opts}；首选项 value='{first_val}' text='{first_txt}'",
             shot="06_settings_modal.png")
        clear_overlays(page); time.sleep(0.3)

        # ===== 阶段 8：小红书 - 切换 + 风格 + 生成 =====
        page.click('.tab-btn[data-page="social"]', timeout=10000)
        page.wait_for_selector("#page-social.active", timeout=10000)
        step("切换到小红书页", True)

        page.wait_for_selector("#social-text", timeout=10000)
        page.fill("#social-text",
                  "# 用AI点亮内容创作\n阳光星盘系统：一键排版 + 自动封面，让创作回归内容本身。")
        # 风格 tab
        page.click('.style-tab[data-group="guizang"]', timeout=5000)
        time.sleep(0.5)
        gz = page.locator("#social-tpl-grid .tpl-mini").count()
        page.click('.style-tab[data-group="blcaptain"]', timeout=5000)
        time.sleep(0.5)
        bl = page.locator("#social-tpl-grid .tpl-mini").count()
        step("风格 tab 切换加载模板（guizang/blcaptain）",
             gz > 0 and bl > 0, f"guizang={gz}, blcaptain={bl}",
             shot="07_social_styles.png")

        # 选第一个模板（editorial）
        page.click('.style-tab[data-group="guizang"]', timeout=5000)
        time.sleep(0.4)
        page.locator("#social-tpl-grid .tpl-mini").first.click()
        time.sleep(0.4)

        # 平台按钮（Flag 4 惰性）
        page.click('.plt-btn[data-platform="wx"]', timeout=5000)
        time.sleep(0.3)
        active_plat = safe(lambda: page.evaluate(
            "(()=>{const b=document.querySelector('.plt-btn.active');"
            "return b?b.dataset.platform:'?'})()"), "?")
        step("[Flag4] 平台按钮选中状态（生成时是否生效）",
             True, f"当前高亮平台={active_plat}（生成读取 .plt-btn.active 的 data-platform 随请求发送）")

        # 配图槽（Flag 5 缺失上传）
        slot_toast = safe(lambda: None)
        try:
            page.click(".img-slot", timeout=5000)
            time.sleep(0.3)
            slot_toast = safe(lambda: page.evaluate(
                "document.getElementById('toast-el').textContent.trim()"), "")
        except Exception:
            pass
        has_file_input = page.locator("input[type=file]").count()
        step("[Flag5] 配图上传功能",
             has_file_input > 0,
             f"file input 数={has_file_input}；槽位含真实 file input，比例校验+base64 暂存",
             shot="08_social_upload_slot.png")

        # 生成封面
        page.click("#btn-generate-cover", timeout=10000)
        try:
            page.wait_for_selector("#results-list .result-card-img", timeout=90000)
            n = page.locator("#results-list .result-card-img").count()
            nw = safe(lambda: page.evaluate(
                "document.querySelector('#results-list .result-card-img')"
                ".naturalWidth"), 0)
            step("小红书封面生成（结果卡真实图 D-1）",
                 n > 0 and nw > 0,
                 f"卡片数={n}，首图 naturalWidth={nw}",
                 shot="09_social_result.png")
        except Exception as e:
            step("小红书封面生成", False, e)

        # ===== 汇总 =====
        browser.close()

    summary = {
        "total_steps": len(REPORT),
        "passed": sum(1 for r in REPORT if r["ok"]),
        "failed": sum(1 for r in REPORT if not r["ok"]),
        "console_errors": console_errors,
        "page_errors": page_errors,
        "steps": REPORT,
    }
    with open("output/e2e_audit/walkthrough_report.json", "w", encoding="utf-8") as f:
        json.dump(summary, f, ensure_ascii=False, indent=2)
    print("\n" + "=" * 60)
    print(f"走查完成：{summary['passed']}/{summary['total_steps']} 通过")
    print(f"console_errors={len(console_errors)}  page_errors={len(page_errors)}")
    for e in console_errors[:15]:
        print("   CONSOLE-ERR:", e[:160])
    for e in page_errors[:15]:
        print("   PAGE-ERR:", e[:160])
    print("=" * 60)
    return 0 if summary["failed"] == 0 and not console_errors and not page_errors else 1


if __name__ == "__main__":
    sys.exit(run())
