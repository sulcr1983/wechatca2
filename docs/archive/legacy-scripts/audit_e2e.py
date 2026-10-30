# -*- coding: utf-8 -*-
"""
有头浏览器（headed）全面 E2E 审计脚本
================================================
遍历 SuperSu 前端「公众号排版」与「小红书封面」两个页面的每一个按钮/筛选器，
逐一点击并验证实际输出；对关键页面与弹窗截图（PM 视角审视用）。

安全策略：
- 跳过破坏性 / 外部副作用动作：confirmPush（真实推送微信）、addAccount、
  deleteAccount、saveAiConfig、testAiConfig（外部 LLM 联网）。
- AI 生成类（btn-ai-format / btn-polish / genCover / genSummary）仅验证 UI 打开
  与错误态，不注入真实密钥、不产生外部费用。

运行：.venv/Scripts/python.exe output/e2e_audit/audit_e2e.py
依赖：playwright + chromium 已安装；Flask 服务在 5000 端口后台运行。
"""
import os
import sys
import json
import time

from playwright.sync_api import sync_playwright

BASE = "http://127.0.0.1:5000"
HERE = os.path.dirname(os.path.abspath(__file__))
OUT = os.path.join(HERE, "shots")
os.makedirs(OUT, exist_ok=True)

report = {"actions": [], "console_errors": [], "page_errors": []}
console_errors = []


def log(name, ok, detail=""):
    report["actions"].append({"name": name, "ok": bool(ok), "detail": detail})
    print(f"[{'PASS' if ok else 'FAIL'}] {name}" + (f" — {detail}" if detail else ""))


def shot(page, name):
    path = os.path.join(OUT, name)
    try:
        page.screenshot(path=path, full_page=False)
    except Exception as e:
        print("  shot err:", e)
    return path


def safe_click(page, locator, name, shot_name=None, timeout=6000):
    """点击并（可选）截图；失败不影响后续。"""
    try:
        el = page.locator(locator).first
        if not el.is_visible(timeout=3000):
            log(name, False, "不可见/不存在")
            return False
        el.click(timeout=timeout)
        if shot_name:
            page.wait_for_timeout(450)
            shot(page, shot_name)
        log(name, True)
        return True
    except Exception as e:
        log(name, False, str(e)[:200])
        return False


def close_modals(page):
    # 1) 优先按 Escape
    try:
        page.keyboard.press("Escape")
    except Exception:
        pass
    page.wait_for_timeout(250)
    # 2) 点击可见的「取消/关闭」类按钮（绝不点 .primary，避免确认推送/保存等副作用）
    for sel in [".modal [onclick*='remove()']", ".modal .secondary"]:
        try:
            btns = page.locator(sel)
            n = btns.count()
            for j in range(n):
                b = btns.nth(j)
                if b.is_visible(timeout=500):
                    try:
                        b.click(timeout=1500, force=True)
                    except Exception:
                        pass
                    page.wait_for_timeout(150)
        except Exception:
            pass
    # 3) 兜底：JS 直接移除所有残留 modal/overlay，确保不遮挡后续点击
    try:
        page.evaluate(
            "document.querySelectorAll('.modal,.overlay').forEach(e=>e.remove());"
            "document.body.style.overflow='';"
            "const mr=document.getElementById('modal-root'); if(mr) mr.innerHTML='';"
        )
    except Exception:
        pass
    page.wait_for_timeout(200)


def close_ai_panel(page):
    # 收起 AI 工具侧栏，避免遮挡
    try:
        page.evaluate(
            "const t=document.getElementById('ai-toggle');"
            "if(t && t.classList.contains('open')) t.click();"
        )
    except Exception:
        pass
    page.wait_for_timeout(150)


def main():
    with sync_playwright() as p:
        # 优先有头模式；若环境无法弹出窗口则回退 headless（仍截图）
        try:
            browser = p.chromium.launch(
                headless=False, slow_mo=120, args=["--disable-dev-shm-usage"]
            )
            mode = "headed"
        except Exception as e:
            print("headed 启动失败，回退 headless：", e)
            browser = p.chromium.launch(
                headless=True, args=["--disable-dev-shm-usage"]
            )
            mode = "headless"
        print("浏览器模式：", mode)

        page = browser.new_page(viewport={"width": 1440, "height": 900})
        page.set_default_timeout(8000)  # 防止任何单步点击无限重试挂死
        page.on("console", lambda m: console_errors.append(m.text) if m.type == "error" else None)
        page.on("pageerror", lambda e: report["page_errors"].append(str(e)))

        # ---------- 阶段 0：首页 ----------
        page.goto(BASE, wait_until="networkidle", timeout=30000)
        page.wait_for_selector("#page-wechat", timeout=10000)
        shot(page, "01_wechat_initial.png")
        log("首页加载 / 公众号页可见", True)

        # ---------- 阶段 1：公众号排版 ----------
        page.wait_for_selector("#input-area", timeout=10000)
        page.fill(
            "#input-area",
            "# 阳光星盘系统\n今天上线了一个超好用的内容排版工具，支持一键生成公众号文章。\n它还能自动产出小红书封面，省时又省心。",
        )
        page.wait_for_timeout(700)
        shot(page, "02_wechat_input.png")

        # 主题列表（筛选器）：逐一点击，验证预览渲染
        page.wait_for_selector("#tpl-list .tpl-item", timeout=10000)
        tpl_count = page.locator("#tpl-list .tpl-item").count()
        log("主题列表已加载", tpl_count > 0, f"{tpl_count} 套主题")

        preview_lens = []
        for i in range(tpl_count):
            try:
                page.locator("#tpl-list .tpl-item").nth(i).click(timeout=4000)
                page.wait_for_timeout(450)
                txt = page.evaluate(
                    """() => { const f=document.getElementById('preview-frame');
                        if(!f||f.style.display==='none'||!f.contentDocument||!f.contentDocument.body) return 0;
                        return f.contentDocument.body.innerText.trim().length; }"""
                )
                preview_lens.append(txt)
                if i < 6:
                    shot(page, f"03_theme_{i}.png")
            except Exception:
                preview_lens.append(-1)
        nonempty = sum(1 for x in preview_lens if x and x > 0)
        log("每个主题点击后预览渲染", nonempty == tpl_count, f"{nonempty}/{tpl_count} 有内容")
        shot(page, "04_wechat_rendered.png")

        # AI 工具面板
        safe_click(page, "#ai-toggle", "打开 AI 工具面板", "05_ai_panel.png")
        safe_click(page, "#btn-ai-format", "点击 AI 智能排版卡片")
        page.wait_for_timeout(900)
        shot(page, "06_ai_format_modal.png")
        close_modals(page)
        safe_click(page, "#btn-polish", "点击 AI 润色卡片")
        page.wait_for_timeout(700)
        shot(page, "06b_polish_modal.png")
        close_modals(page)
        close_ai_panel(page)

        # 底部操作栏
        safe_click(page, "#btn-copy", "复制按钮")
        page.wait_for_timeout(400)
        safe_click(page, "#btn-history", "历史记录弹窗", "07_history_modal.png")
        close_modals(page)
        safe_click(page, "#btn-push", "一键推送弹窗", "08_push_modal.png")
        # 推送弹窗内的子控件（不确认推送）
        safe_click(page, "#push-account", "推送账号下拉（聚焦）")
        safe_click(page, "button[onclick*='genSummary']", "AI 生成摘要按钮（仅 UI）")
        page.wait_for_timeout(600)
        shot(page, "08b_push_modal_detail.png")
        close_modals(page)
        # 账号管理子弹窗（不添加/删除）
        safe_click(page, "button[onclick*='openAccountModal']", "管理账号按钮", "08c_account_modal.png")
        close_modals(page)
        close_modals(page)
        # 设置（AI 配置）
        safe_click(page, "#btn-settings", "设置按钮（AI 配置弹窗）", "09_settings_modal.png")
        close_modals(page)

        # ---------- 阶段 2：小红书封面 ----------
        page.click('.tab-btn[data-page="social"]', timeout=10000)
        page.wait_for_selector("#page-social.active", timeout=10000)
        shot(page, "10_social_initial.png")
        log("切换到小红书页", True)

        page.wait_for_selector("#social-text", timeout=10000)
        page.fill(
            "#social-text",
            "# 用AI点亮内容创作\n阳光星盘系统：一键排版 + 自动封面，让创作回归内容本身。",
        )
        page.wait_for_timeout(400)
        shot(page, "11_social_text.png")

        # 风格模板网格（筛选器）：逐一点击，验证预览更新
        page.wait_for_selector("#social-tpl-grid .tpl-mini", timeout=10000)
        style_count = page.locator("#social-tpl-grid .tpl-mini").count()
        log("风格模板已加载", style_count > 0, f"{style_count} 个风格")

        spv_updated = 0
        for i in range(style_count):
            try:
                page.locator("#social-tpl-grid .tpl-mini").nth(i).click(timeout=4000)
                page.wait_for_timeout(400)
                vis = page.evaluate(
                    """() => { const c=document.getElementById('spv-card');
                        return !!(c && c.style.display!=='none'); }"""
                )
                if vis:
                    spv_updated += 1
                if i < 6:
                    shot(page, f"12_style_{i}.png")
            except Exception:
                pass
        log("每个风格点击后预览更新", spv_updated == style_count, f"{spv_updated}/{style_count}")
        shot(page, "13_social_preview.png")

        # 上传位（img-slot，点击触发 toast）
        for i in range(3):
            safe_click(page, f"#page-social .img-slot >> nth={i}", f"上传位 {i+1}（toast）")
        page.wait_for_timeout(300)

        # 生成封面（已知可能 500，如实记录）
        safe_click(page, "#btn-generate-cover", "生成封面按钮")
        try:
            page.wait_for_selector("#results-list .result-card", timeout=60000)
            n = page.locator("#results-list .result-card").count()
            log("封面生成成功（结果卡片出现）", n > 0, f"{n} 张卡片")
            shot(page, "14_social_results.png")
            # 点击结果卡片打开大图查看
            page.locator("#results-list .result-card").first.click(timeout=5000)
            page.wait_for_timeout(700)
            shot(page, "15_social_result_large.png")
        except Exception as e:
            log("封面生成成功（结果卡片出现）", False, str(e)[:200])

        # ---------- 阶段 3：响应式（移动端视口） ----------
        page.set_viewport_size({"width": 390, "height": 844})
        page.wait_for_timeout(500)
        shot(page, "16_wechat_mobile.png")
        safe_click(page, '.tab-btn[data-page="social"]', "移动端切小红书")
        page.wait_for_timeout(500)
        shot(page, "17_social_mobile.png")
        page.set_viewport_size({"width": 1440, "height": 900})

        report["console_errors"] = console_errors
        report["mode"] = mode
        browser.close()

    # ---------- 汇总 ----------
    passed = sum(1 for a in report["actions"] if a["ok"])
    print("\n" + "=" * 55)
    print(f"浏览器模式：{mode}")
    print(f"交互动作验证：{passed}/{len(report['actions'])} 通过")
    print(f"页面 JS 报错：{len(report['console_errors'])} 条；pageerror：{len(report['page_errors'])} 条")
    for e in report["console_errors"][:20]:
        print("   CE:", e[:200])
    for e in report["page_errors"][:10]:
        print("   PE:", e[:200])
    print("=" * 55)
    with open(os.path.join(HERE, "report.json"), "w", encoding="utf-8") as f:
        json.dump(report, f, ensure_ascii=False, indent=2)
    print("截图目录：", OUT)
    print("报告：", os.path.join(HERE, "report.json"))
    return 0 if passed == len(report["actions"]) and not console_errors else 1


if __name__ == "__main__":
    sys.exit(main())
