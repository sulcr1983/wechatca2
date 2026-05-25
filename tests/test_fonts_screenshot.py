"""测试字体恢复效果 - 截图对比"""
import time
import sys
from pathlib import Path
sys.path.insert(0, str(Path(__file__).parent.parent))
from playwright.sync_api import sync_playwright

BASE_URL = "http://127.0.0.1:5000"
SHOTS_DIR = Path(__file__).parent / "font_test"
SHOTS_DIR.mkdir(parents=True, exist_ok=True)

test_text = """人工智能改变生活

人工智能正在深刻改变我们的日常生活。从智能手机到智能家居，AI技术无处不在。

一、智能家居

智能家居系统可以自动调节温度、照明和安全监控。通过语音助手，用户可以轻松控制家中设备。

二、健康医疗

AI在医疗领域的应用包括疾病诊断、药物研发和个性化治疗方案。深度学习算法能够分析医学影像，辅助医生做出更准确的判断。

三、交通出行

自动驾驶技术是AI在交通领域的重要应用。通过传感器和算法，车辆可以感知环境并做出驾驶决策。

总之，人工智能正在让我们的生活变得更加便捷和高效。"""

# 测试不同字体的主题
themes = [
    ("newspaper", "报纸_Georgia衬线体"),
    ("vogue", "Vogue_Georgia衬线体"),
    ("terminal-green", "终端_Courier等宽"),
    ("chinese", "中国风_宋体"),
    ("bold-blue", "醒目蓝_默认无衬线"),
]

with sync_playwright() as p:
    browser = p.chromium.launch(headless=False)
    page = browser.new_context(viewport={"width": 1440, "height": 900}).new_page()

    page.goto(BASE_URL)
    page.wait_for_selector("#input-area", timeout=15000)
    time.sleep(2)

    # 输入文章
    page.fill("#input-area", test_text)
    time.sleep(3)

    for theme_id, name in themes:
        page.select_option("#theme-select", theme_id)
        time.sleep(2)
        page.screenshot(path=str(SHOTS_DIR / f"{theme_id}.png"))
        print(f"  Screenshot: {theme_id}.png ({name})")

    browser.close()
    print(f"\n截图已保存到: {SHOTS_DIR}")
