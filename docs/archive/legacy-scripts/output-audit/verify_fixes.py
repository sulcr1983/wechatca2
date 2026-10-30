"""验证本轮 E2E 修复（A1/A2/A3/A4/Flag1/Flag3/Flag5/Flag6/Flag4 接线）。

真实浏览器驱动，逐项断言；输出 JSON 报告 + 截图到 output/e2e_audit/shots/。
依赖：venv(managed) 的 playwright + PIL。
"""
import json, sys
from pathlib import Path

from PIL import Image
from playwright.sync_api import sync_playwright

BASE = Path(__file__).resolve().parent
SHOTS = BASE / "shots"
SHOTS.mkdir(parents=True, exist_ok=True)
IMG_DIR = BASE / "test_imgs"
IMG_DIR.mkdir(parents=True, exist_ok=True)
HOST = "http://127.0.0.1:5000"

correct_png = IMG_DIR / "cover_xhs_1080x1440.png"
wrong_png = IMG_DIR / "wrong_100x100.png"
if not correct_png.exists():
    Image.new("RGB", (1080, 1440), (200, 120, 40)).save(correct_png)
if not wrong_png.exists():
    Image.new("RGB", (100, 100), (40, 120, 200)).save(wrong_png)

REPORT = {"steps": [], "console_errors": [], "page_errors": []}

def step(name, ok, detail=""):
    REPORT["steps"].append({"step": name, "ok": ok, "detail": detail})
    print(("PASS " if ok else "FAIL ") + name + ((" — " + detail) if detail else ""))

def close_modals(page):
    page.evaluate("document.querySelectorAll('.modal').forEach(m=>m.remove()); const p=document.getElementById('ai-panel'); if(p) p.classList.remove('open');")

def switch(page, page_name):
    page.click(f'.tab-btn[data-page="{page_name}"]')
    page.wait_for_timeout(150)

def render_content(page):
    """先渲染内容，使 lastHtml 非空（推送/封面按钮依赖它）。"""
    switch(page, "wechat")
    page.fill("#input-area", "# 测试标题\n这是一段用于推送测试的文案内容。\n#星盘工具")
    first = page.query_selector("#tpl-list .tpl-item")
    if first:
        first.click()
    page.wait_for_timeout(400)

with sync_playwright() as p:
    browser = p.chromium.launch(headless=False, slow_mo=200)
    page = browser.new_page(viewport={"width": 1280, "height": 900})
    page.on("console", lambda m: REPORT["console_errors"].append(m.text) if m.type == "error" else None)
    page.on("pageerror", lambda e: REPORT["page_errors"].append(str(e)))

    page.goto(HOST + "/", wait_until="networkidle")
    page.wait_for_selector("#input-area")
    step("首页加载", True)

    # ---- A3: 推送账号下拉（后端裸数组）----
    try:
        resp = page.request.post(HOST + "/api/accounts",
            data=json.dumps({"nickname": "测试号A3", "appid": "wx_A3_001", "appsecret": "x"}),
            headers={"Content-Type": "application/json"})
        acc = resp.json()
        acc_id = (acc.get("account") or {}).get("id")
        render_content(page)
        switch(page, "wechat")
        page.click("#btn-push")
        page.wait_for_selector("#push-account")
        opts = page.eval_on_selector_all("#push-account option", "els => els.map(o => ({v:o.value, t:o.textContent}))")
        match = [o for o in opts if o["v"] == acc_id]
        step("A3 推送账号下拉有真实选项", bool(match),
             f"选项数={len(opts)} 命中={match[0]['t'] if match else '无'}")
        if acc_id:
            page.request.delete(HOST + f"/api/accounts/{acc_id}")
        close_modals(page)
    except Exception as e:
        step("A3 推送账号下拉有真实选项", False, str(e))

    # ---- A4: 设置-平台下拉（后端 dict 按 key）----
    try:
        switch(page, "wechat")
        page.click("#btn-settings")
        page.wait_for_selector("#ai-platform")
        opts = page.eval_on_selector_all("#ai-platform option", "els => els.map(o => ({v:o.value, t:o.textContent}))")
        bad = [o for o in opts if o["v"] in ("undefined", "NONE", "")]
        step("A4 平台下拉有真实选项", len(opts) > 0 and not bad,
             f"选项数={len(opts)} 首选项={opts[0] if opts else '无'}")
        close_modals(page)
    except Exception as e:
        step("A4 平台下拉有真实选项", False, str(e))

    # ---- Flag5: 配图上传（真实文件选择 + 比例校验）----
    try:
        switch(page, "social")
        page.wait_for_selector("#img-slots")
        finputs = page.query_selector_all("#img-slots input[type=file]")
        step("Flag5 上传槽位含 file input", len(finputs) == 3, f"file input 数={len(finputs)}")

        xhs = page.locator("#img-slots input[type=file]").nth(0)
        xhs.set_input_files(str(wrong_png))
        page.wait_for_timeout(400)
        rejected = not page.eval_on_selector("#img-slots .img-slot[data-ratio=xhs]", "el => el.classList.contains('has-img')")
        step("Flag5 错误比例被拒绝", rejected, "100x100 未标记为 has-img")
        xhs.set_input_files(str(correct_png))
        page.wait_for_timeout(400)
        accepted = page.eval_on_selector("#img-slots .img-slot[data-ratio=xhs]", "el => el.classList.contains('has-img')")
        step("Flag5 正确比例被接受", accepted, "1080x1440 标记为 has-img")
    except Exception as e:
        step("Flag5 上传", False, str(e))

    # ---- Flag4 + 生成（带上传图，无需 LLM）----
    try:
        page.fill("#social-text", "# 测试标题\n这是一段用于生成封面的测试文案，验证上传图与平台选择是否生效。\n#星盘工具 #测试")
        page.click(".tpl-mini")
        page.wait_for_timeout(200)
        wx = page.query_selector('.plt-btn[data-platform="wx"]')
        if wx: wx.click()
        page.click("#btn-generate-cover")
        page.wait_for_selector("#results-list img", timeout=30000)
        cards = page.query_selector_all("#results-list .result-card")
        first_type = page.eval_on_selector("#results-list .result-card .result-card-label", "el => el.textContent") if cards else ""
        step("Flag5+Flag4 生成带上传图成功", len(cards) >= 1,
             f"结果卡数={len(cards)} 首卡类型={first_type}")
        page.screenshot(path=str(SHOTS / "vf_social_result.png"))
    except Exception as e:
        step("Flag5+Flag4 生成带上传图成功", False, str(e))

    # ---- Flag1: 手机预览产生差异化渲染 ----
    try:
        switch(page, "wechat")
        page.click('[data-preview="phone"]')
        has = page.eval_on_selector("#pv-content", "el => el.classList.contains('phone-frame')")
        step("Flag1 手机预览加 phone-frame 类", has, "pv-content.phone-frame=" + str(has))
        page.click('[data-preview="html"]')
        removed = not page.eval_on_selector("#pv-content", "el => el.classList.contains('phone-frame')")
        step("Flag1 切回 HTML 移除 phone-frame", removed, "")
    except Exception as e:
        step("Flag1 手机预览", False, str(e))

    # ---- Flag3: 历史弹窗数据驱动 ----
    try:
        page.click("#btn-history")
        page.wait_for_selector("#history-list")
        page.wait_for_timeout(400)
        txt = page.eval_on_selector("#history-list", "el => el.textContent.trim()")
        dynamic = txt != "加载中..." and ("暂无历史记录" in txt or "无标题" in txt or len(txt) > 0)
        step("Flag3 历史弹窗读取 /api/history", dynamic, f"内容='{txt[:30]}'")
        close_modals(page)
    except Exception as e:
        step("Flag3 历史弹窗", False, str(e))

    # ---- A1/A2 触发不抛 JS 错误（LLM 未配会 toast 失败，但字段映射路径执行）----
    try:
        page.click("#ai-toggle")  # 打开 AI 面板
        page.wait_for_timeout(200)
        err_before = len(REPORT["page_errors"])
        page.click("#btn-ai-format")
        page.wait_for_timeout(1500)
        page.click("#btn-polish")
        page.wait_for_selector("#polish-start")
        page.click("#polish-start")
        page.wait_for_timeout(1500)
        close_modals(page)
        step("A1/A2 点击无页面级 JS 错误", len(REPORT["page_errors"]) == err_before,
             f"page_errors={len(REPORT['page_errors'])}")
    except Exception as e:
        step("A1/A2 点击无页面级 JS 错误", False, str(e))

    # ---- Flag6: 推送封面图展示容器 ----
    try:
        render_content(page)
        switch(page, "wechat")
        page.click("#btn-push")
        page.wait_for_selector("#cover-preview", timeout=5000)
        exists = page.eval_on_selector("#cover-preview", "el => !!el")
        step("Flag6 推送封面预览容器存在(id=cover-preview)", exists, "")
        close_modals(page)
    except Exception as e:
        step("Flag6 推送封面预览容器", False, str(e))

    browser.close()

REPORT["console_errors"] = list(set(REPORT["console_errors"]))
passed = sum(1 for s in REPORT["steps"] if s["ok"])
failed = len(REPORT["steps"]) - passed
print(f"\n=== 汇总: {passed} 通过 / {failed} 失败 | console_errors={len(REPORT['console_errors'])} page_errors={len(REPORT['page_errors'])} ===")
out = BASE / "verify_fixes_report.json"
out.write_text(json.dumps(REPORT, ensure_ascii=False, indent=2), encoding="utf-8")
print("报告:", out)
sys.exit(0 if failed == 0 else 1)
