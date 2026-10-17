"""真实应用前端修复验证（D-1/D-4/D-3/W-1）— headless Chromium 驱动真实 UI。"""
from playwright.sync_api import sync_playwright
import json, urllib.request

BASE = "http://127.0.0.1:5000"
valid = set()
try:
    d = json.load(urllib.request.urlopen(BASE + "/api/social/styles"))
    valid = {x["id"] for x in d["guizang"] + d["blcaptain"]}
except Exception as e:
    print("styles fetch failed:", e)

out = {}
with sync_playwright() as p:
    b = p.chromium.launch(headless=True)
    errs = []
    pg = b.new_page(viewport={"width": 1440, "height": 900})
    pg.on("console", lambda m: errs.append(m.text) if m.type == "error" else None)
    pg.on("pageerror", lambda e: errs.append("PAGEERROR: " + str(e)))

    pg.goto(BASE, wait_until="load")
    pg.wait_for_timeout(800)

    # ── 切到小红书页，等风格网格（来自 /api/social/styles）──
    pg.click('.tab-btn[data-page="social"]')
    pg.wait_for_selector("#social-tpl-grid .tpl-mini", timeout=10000)
    styles = pg.eval_on_selector_all(
        "#social-tpl-grid .tpl-mini", "els=>els.map(e=>e.dataset.style)")
    out["social_style_ids"] = styles
    out["all_ids_are_backend_contract"] = all(s in valid for s in styles)

    # ── D-1：选风格 → 生成 → 结果卡真实 <img> 绑定 ──
    pg.locator("#social-tpl-grid .tpl-mini").first.click()
    pg.fill("#social-text", "# 用AI点亮内容创作\n阳光星盘系统：一键排版 + 自动封面")
    pg.click("#btn-generate-cover")
    pg.wait_for_selector("#results-list .result-card img", timeout=60000)
    pg.wait_for_function(
        "()=>{const i=[...document.querySelectorAll('#results-list .result-card img')];"
        "return i.length>0 && i.every(x=>x.naturalWidth>0);}", timeout=30000)
    out["result_imgs"] = pg.evaluate(
        "()=>[...document.querySelectorAll('#results-list .result-card img')]"
        ".map(i=>({nw:i.naturalWidth, src:i.src.slice(0,46)}))")
    out["d1_result_img_real"] = bool(out["result_imgs"]) and all(
        i["nw"] > 0 for i in out["result_imgs"])

    # ── D-4 区分度：editorial 与 swiss 为不同 id ──
    out["d4_distinct_ids_present"] = ("editorial" in styles) and ("swiss" in styles)

    # ── W-1：移动端公众号主题列表可见（非 display:none）──
    pg.click('.tab-btn[data-page="wechat"]')
    pg.set_viewport_size({"width": 390, "height": 844})
    pg.wait_for_timeout(400)
    out["w1_col_templates"] = pg.evaluate(
        """()=>{const el=document.querySelector('.col-templates');
        const cs=getComputedStyle(el); const r=el.getBoundingClientRect();
        return {display:cs.display, visible:r.width>0&&r.height>0&&cs.visibility!=='hidden'};}""")

    # ── D-3：移动端小红书预览/结果可见（非 display:none）──
    pg.click('.tab-btn[data-page="social"]')
    pg.wait_for_timeout(300)
    out["d3_social_visibility"] = pg.evaluate(
        """()=>['.social-preview','.social-results'].map(s=>{
        const el=document.querySelector(s); const cs=getComputedStyle(el);
        const r=el.getBoundingClientRect();
        return {sel:s, display:cs.display, visible:r.width>0&&r.height>0};});""")

    out["console_errors"] = errs
    b.close()

print(json.dumps(out, ensure_ascii=False, indent=2))
