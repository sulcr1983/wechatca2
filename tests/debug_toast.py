"""调试 Toast 显示"""
import time
import sys
from pathlib import Path
sys.path.insert(0, str(Path(__file__).parent.parent))
from playwright.sync_api import sync_playwright

with sync_playwright() as p:
    browser = p.chromium.launch(headless=False)
    page = browser.new_context(viewport={"width": 1440, "height": 900}).new_page()

    page.goto("http://127.0.0.1:5000")
    page.wait_for_selector("#input-area", timeout=15000)
    time.sleep(2)

    # 直接调用 showToast
    page.evaluate("showToast('测试 Toast 消息', 'error')")
    time.sleep(1)

    # 检查 toast 元素状态
    toast = page.query_selector("#toast")
    print(f"Toast element exists: {toast is not None}")
    if toast:
        print(f"Toast text: {toast.inner_text()!r}")
        print(f"Toast class: {toast.evaluate('el => el.className')!r}")
        print(f"Toast display: {toast.evaluate('el => getComputedStyle(el).display')!r}")
        print(f"Toast visibility: {toast.evaluate('el => getComputedStyle(el).visibility')!r}")
        print(f"Toast opacity: {toast.evaluate('el => getComputedStyle(el).opacity')!r}")
        print(f"Toast z-index: {toast.evaluate('el => getComputedStyle(el).zIndex')!r}")

    time.sleep(3)
    browser.close()
