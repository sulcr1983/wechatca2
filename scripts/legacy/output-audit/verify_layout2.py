"""验证：新增主题可渲染 + 顶部色卡条改为换行网格 + 收起/展开 + 双区 + 手机框 + 无错误"""
import sys, json
from playwright.sync_api import sync_playwright

BASE = "http://127.0.0.1:5000"
errors = []

def main():
    # 1) 后端：随机抽取若干"生成主题"跑真实 /api/render，确保不 500
    import urllib.request
    themes = json.loads(urllib.request.urlopen(BASE + "/api/themes").read())
    gen_ids = [t["id"] for t in themes if "-" in t["id"]]  # 生成主题都带 base-palette 连字符
    sample = gen_ids[:6] + gen_ids[len(gen_ids)//2:len(gen_ids)//2+6]
    render_ok = 0
    for tid in sample:
        req = urllib.request.Request(BASE + "/api/render",
            data=json.dumps({"raw_text": "# 标题\n正文测试 **加粗**\n> 引用\n- 列表项", "theme_id": tid}).encode(),
            headers={"Content-Type": "application/json"}, method="POST")
        try:
            with urllib.request.urlopen(req, timeout=10) as r:
                d = json.loads(r.read())
                if r.status == 200 and d.get("html"):
                    render_ok += 1
                else:
                    errors.append(f"render-bad:{tid}")
        except Exception as e:
            errors.append(f"render-err:{tid}:{e}")

    with sync_playwright() as p:
        browser = p.chromium.launch(headless=False)
        page = browser.new_page(viewport={"width": 1280, "height": 860})
        page.on("console", lambda m: errors.append(f"console:{m.type}:{m.text}") if m.type == "error" else None)
        page.on("pageerror", lambda e: errors.append(f"pageerror:{e}"))
        page.goto(BASE, wait_until="networkidle")
        page.wait_for_selector("#tpl-strip .tpl-card", timeout=10000)

        cards = page.query_selector_all("#tpl-strip .tpl-card")
        n = len(cards)
        # 换行网格 + 限高：scrollHeight 应 > clientHeight（纵向可滚动），且 overflow-x 不出现横向滚动条
        strip_box = page.eval_on_selector("#tpl-strip", "el => ({sh: el.scrollHeight, ch: el.clientHeight, sw: el.scrollWidth, cw: el.clientWidth, mh: parseInt(getComputedStyle(el).maxHeight)})")
        # 双区
        cols = page.eval_on_selector(".wechat-body", "el => getComputedStyle(el).gridTemplateColumns")
        # 选一个生成主题渲染
        page.fill("#tpl-search", "海蓝")
        page.wait_for_timeout(150)
        filt = page.query_selector_all("#tpl-strip .tpl-card")
        if filt:
            filt[0].click()
        page.wait_for_selector("#preview-frame[src]", timeout=8000)
        pv = page.eval_on_selector("#preview-frame", "el => el.getAttribute('src') || ''")
        page.fill("#tpl-search", "")
        page.wait_for_timeout(150)
        # 收起前 body 高度
        body_h_before = page.eval_on_selector(".wechat-body", "el => el.getBoundingClientRect().height")
        bar_h_before = page.eval_on_selector(".tpl-bar", "el => el.getBoundingClientRect().height")
        # 收起
        page.click("#tpl-toggle")
        page.wait_for_timeout(200)
        strip_hidden = page.eval_on_selector("#tpl-strip", "el => getComputedStyle(el).display === 'none'")
        body_h_after = page.eval_on_selector(".wechat-body", "el => el.getBoundingClientRect().height")
        # 展开回去
        page.click("#tpl-toggle")
        page.wait_for_timeout(150)
        # 手机框
        page.click('[data-preview="phone"]')
        page.wait_for_timeout(200)
        phone = page.eval_on_selector("#preview-frame", "el => ({w: el.getBoundingClientRect().width, h: el.getBoundingClientRect().height})")
        # 截图
        page.click('[data-preview="html"]'); page.wait_for_timeout(150)
        page.screenshot(path="output/e2e_audit/shots/layout_v2_desktop.png")
        browser.close()

        print("=== 验证结果 ===")
        print(f"主题总数(后端)      : {len(themes)} (生成 {len(gen_ids)})")
        print(f"生成主题渲染 OK     : {render_ok}/{len(sample)}")
        print(f"色卡总数(前端)      : {n}")
        print(f"strip 限高纵向滚动  : sh={strip_box['sh']} ch={strip_box['ch']} (可纵向滚动={strip_box['sh']>strip_box['ch']}), 无横向溢出={strip_box['sw']<=strip_box['cw']+2}")
        print(f"wechat-body 列      : {cols}")
        print(f"生成主题预览渲染    : {bool(pv)}")
        print(f"收起前 bar/body 高  : {bar_h_before:.0f} / {body_h_before:.0f}")
        print(f"收起后 strip 隐藏   : {strip_hidden}")
        print(f"收起后 body 高      : {body_h_after:.0f} (增长={body_h_after>body_h_before})")
        print(f"手机框尺寸          : {phone['w']:.0f} x {phone['h']:.0f}")
        print(f"错误数              : {len(errors)} -> {errors[:5]}")
        ok = (len(themes) >= 100 and render_ok == len(sample) and n >= 100
              and strip_box['sh'] > strip_box['ch'] and strip_box['sw'] <= strip_box['cw'] + 2
              and len(cols.split()) == 2 and bool(pv) and strip_hidden
              and body_h_after > body_h_before and phone['w'] >= 360 and phone['h'] >= 700
              and len(errors) == 0)
        print("RESULT:", "PASS" if ok else "FAIL")
        return 0 if ok else 1

if __name__ == "__main__":
    sys.exit(main())
