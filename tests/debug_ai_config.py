"""调试 AI 配置加载问题"""
import time
import sys
from pathlib import Path
sys.path.insert(0, str(Path(__file__).parent.parent))
from playwright.sync_api import sync_playwright

with sync_playwright() as p:
    browser = p.chromium.launch(headless=False)
    page = browser.new_context(viewport={"width": 1440, "height": 900}).new_page()

    # 强制刷新，忽略缓存
    page.goto("http://127.0.0.1:5000", wait_until="networkidle")
    page.reload(wait_until="networkidle")
    page.wait_for_selector("#input-area", timeout=15000)
    time.sleep(2)

    # 检查 ai-config-status 元素是否存在
    exists = page.evaluate("document.getElementById('ai-config-status') !== null")
    print(f"ai-config-status exists after force reload: {exists}")

    # 检查 HTML 源码中是否有 ai-config-status 元素定义
    html = page.content()
    has_el = 'id="ai-config-status"' in html
    print(f"HTML has ai-config-status element: {has_el}")

    # 打开设置
    page.click("#btn-settings")
    page.wait_for_selector("#ai-platform-select", timeout=5000)
    time.sleep(2)

    exists = page.evaluate("document.getElementById('ai-config-status') !== null")
    print(f"ai-config-status exists after open: {exists}")

    browser.close()
