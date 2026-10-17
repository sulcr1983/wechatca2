"""截图验证公众号页布局修复：限高滚动 + 更大预览/手机框。"""
import time
from playwright.sync_api import sync_playwright

BASE = "http://127.0.0.1:5000"
with sync_playwright() as p:
    b = p.chromium.launch(headless=True)
    pg = b.new_page(viewport={"width": 1280, "height": 860})
    pg.goto(BASE, wait_until="networkidle", timeout=30000)
    pg.wait_for_selector("#tpl-list .tpl-item", timeout=10000)
    n = pg.locator("#tpl-list .tpl-item").count()
    # 选一个主题触发渲染
    pg.locator("#tpl-list .tpl-item").nth(5).click()
    time.sleep(0.8)
    # 校验模板列表确实可滚动（内容高度 > 可视高度）
    info = pg.evaluate(
        "(()=>{const el=document.getElementById('tpl-list');"
        "return {scrollH:el.scrollHeight, clientH:el.clientHeight, "
        "canScroll:el.scrollHeight>el.clientHeight+4}})()")
    pg.screenshot(path="output/e2e_audit/shots/layout_desktop.png")
    # 手机预览
    pg.click('[data-preview="phone"]')
    time.sleep(0.6)
    phone = pg.evaluate(
        "(()=>{const f=document.getElementById('preview-frame');"
        "return {w:f.offsetWidth, h:f.offsetHeight}})()")
    pg.screenshot(path="output/e2e_audit/shots/layout_phone.png")
    b.close()
    print(f"themes={n} tpl_list={info} phone_frame={phone}")
