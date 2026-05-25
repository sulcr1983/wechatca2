"""测试服务器 IP 显示"""
import time
import sys
from pathlib import Path
sys.path.insert(0, str(Path(__file__).parent.parent))
from playwright.sync_api import sync_playwright

with sync_playwright() as p:
    browser = p.chromium.launch(headless=False)
    page = browser.new_context(viewport={"width": 1440, "height": 900}).new_page()

    page.goto("http://127.0.0.1:5000", wait_until="networkidle")
    page.reload(wait_until="networkidle")
    page.wait_for_selector("#input-area", timeout=15000)
    time.sleep(2)

    # 检查 HTML 中是否有 server-ip-display
    html = page.content()
    print(f"Has server-ip-display: {'server-ip-display' in html}")

    # 打开设置
    page.click("#btn-settings")
    time.sleep(3)

    # 检查 IP 显示
    ip_text = page.evaluate("""
        () => {
            const el = document.getElementById('server-ip-display');
            return el ? el.textContent : 'ELEMENT_NOT_FOUND';
        }
    """)
    print(f"Server IP displayed: {ip_text!r}")

    # 截图
    page.screenshot(path=str(Path(__file__).parent / "server_ip_display.png"))
    print("Screenshot saved: server_ip_display.png")

    browser.close()
