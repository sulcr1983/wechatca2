"""
用户流程截图测试 — 模拟真实用户操作，每步截图
运行: pytest tests/test_user_flow_screenshots.py -v --headed
"""

import json
import time
import threading
import pytest
from unittest.mock import patch, MagicMock
from pathlib import Path

from playwright.sync_api import Page, expect

FLASK_PORT = 15433
BASE_URL = f"http://127.0.0.1:{FLASK_PORT}"
SCREENSHOT_DIR = Path(__file__).parent / "screenshots"

# 模拟数据
SAMPLE_ARTICLE = """人工智能改变生活

人工智能正在深刻改变我们的日常生活。从智能手机到智能家居，AI技术无处不在。

一、智能家居

智能家居系统可以自动调节温度、照明和安全监控。通过语音助手，用户可以轻松控制家中设备。

二、健康医疗

AI在医疗领域的应用包括疾病诊断、药物研发和个性化治疗方案。深度学习算法能够分析医学影像，辅助医生做出更准确的判断。

三、交通出行

自动驾驶技术是AI在交通领域的重要应用。通过传感器和算法，车辆可以感知环境并做出驾驶决策。

总之，人工智能正在让我们的生活变得更加便捷和高效。"""


def mock_call_llm(system_prompt, user_prompt):
    if "摘要" in system_prompt or "摘要" in user_prompt:
        return "人工智能正在深刻改变我们的日常生活，从智能家居到健康医疗，再到交通出行，AI技术无处不在，让生活变得更加便捷和高效。"
    if "润色" in system_prompt:
        return "人工智能正在深刻改变我们的日常生活。从智能手机到智能家居，AI技术已经渗透到我们生活的方方面面。\n\n一、智能家居\n\n智能家居系统可以自动调节温度、照明和安全监控。通过语音助手，用户可以轻松控制家中设备，享受科技带来的便利。\n\n二、健康医疗\n\nAI在医疗领域的应用日益广泛，包括疾病诊断、药物研发和个性化治疗方案。深度学习算法能够精准分析医学影像，为医生提供可靠的辅助判断。\n\n三、交通出行\n\n自动驾驶技术是AI在交通领域的重要突破。通过多传感器融合和智能算法，车辆可以实时感知环境并做出安全驾驶决策。\n\n展望未来，人工智能将继续推动社会进步，为人类创造更美好的生活。"
    if "排版助手" in system_prompt or "Markdown" in system_prompt:
        return "## 人工智能改变生活\n\n人工智能正在深刻改变我们的日常生活。从智能手机到智能家居，AI技术无处不在。\n\n### 一、智能家居\n\n智能家居系统可以自动调节温度、照明和安全监控。\n\n### 二、健康医疗\n\nAI在医疗领域的应用包括疾病诊断、药物研发和个性化治疗方案。\n\n### 三、交通出行\n\n自动驾驶技术是AI在交通领域的重要应用。\n\n**总之**，人工智能正在让我们的生活变得更加便捷和高效。"
    if "keyword" in system_prompt.lower() or "visual" in system_prompt.lower():
        return "technology, AI, modern, futuristic, blue, clean, professional"
    return "[已润色] " + user_prompt[:200]


def mock_generate_cover(title, full_text):
    # 1x1 透明 PNG
    return (
        b'\x89PNG\r\n\x1a\n\x00\x00\x00\rIHDR\x00\x00\x00\x01\x00\x00\x00\x01'
        b'\x08\x02\x00\x00\x00\x90wS\xde\x00\x00\x00\x0cIDATx\x9cc\xf8\x0f'
        b'\x00\x00\x01\x01\x00\x05\x18\xd8N\x00\x00\x00\x00IEND\xaeB`\x82'
    )


@pytest.fixture(scope="session")
def flask_server():
    import sys
    sys.path.insert(0, ".")
    from app import app

    patches = [
        patch("app.call_llm", mock_call_llm),
        patch("core.ai_client.call_llm", mock_call_llm),
        patch("core.image_gen.call_llm", mock_call_llm),
        patch("core.image_gen.generate_cover", mock_generate_cover),
        patch("app.generate_cover", mock_generate_cover),
    ]
    for p in patches:
        p.start()

    app.config["TESTING"] = True
    server_thread = threading.Thread(
        target=lambda: app.run(host="127.0.0.1", port=FLASK_PORT, debug=False, threaded=True, use_reloader=False),
        daemon=True,
    )
    server_thread.start()
    time.sleep(1.5)
    yield app
    for p in patches:
        p.stop()


@pytest.fixture(scope="session")
def browser_context(browser, flask_server):
    context = browser.new_context(viewport={"width": 1440, "height": 900})
    yield context
    context.close()


def take_screenshot(page: Page, name: str):
    """截图并保存"""
    SCREENSHOT_DIR.mkdir(parents=True, exist_ok=True)
    path = SCREENSHOT_DIR / f"{name}.png"
    page.screenshot(path=str(path), full_page=False)
    print(f"📸 截图已保存: {path}")
    return path


class TestUserFlow:
    """模拟真实用户完整操作流程"""

    def test_flow_01_homepage(self, browser_context):
        """步骤1: 打开首页"""
        page = browser_context.new_page()
        page.goto(BASE_URL)
        page.wait_for_timeout(1000)
        take_screenshot(page, "01_homepage")
        page.close()

    def test_flow_02_input_text(self, browser_context):
        """步骤2: 输入文章内容"""
        page = browser_context.new_page()
        page.goto(BASE_URL)
        page.wait_for_timeout(1000)

        textarea = page.locator("#input-area")
        textarea.fill(SAMPLE_ARTICLE)
        page.wait_for_timeout(2000)  # 等待渲染

        take_screenshot(page, "02_input_text")
        page.close()

    def test_flow_03_switch_theme(self, browser_context):
        """步骤3: 切换主题"""
        page = browser_context.new_page()
        page.goto(BASE_URL)
        textarea = page.locator("#input-area")
        textarea.fill(SAMPLE_ARTICLE)
        page.wait_for_timeout(1500)

        # 切换几个主题
        selector = page.locator("#theme-select")
        selector.select_option(index=3)
        page.wait_for_timeout(1500)
        take_screenshot(page, "03_theme_switched")
        page.close()

    def test_flow_04_phone_preview(self, browser_context):
        """步骤4: 手机预览"""
        page = browser_context.new_page()
        page.goto(BASE_URL)
        textarea = page.locator("#input-area")
        textarea.fill(SAMPLE_ARTICLE)
        page.wait_for_timeout(1500)

        page.locator("#btn-phone-preview").click()
        page.wait_for_timeout(1000)
        take_screenshot(page, "04_phone_preview")
        page.close()

    def test_flow_05_ai_polish(self, browser_context):
        """步骤5: AI润色"""
        page = browser_context.new_page()
        page.goto(BASE_URL)
        textarea = page.locator("#input-area")
        textarea.fill(SAMPLE_ARTICLE)
        page.wait_for_timeout(1000)

        page.locator("#btn-polish").click()
        page.wait_for_timeout(500)
        take_screenshot(page, "05_polish_modal_open")

        page.locator("#btn-start-polish").click()
        page.wait_for_timeout(3000)
        take_screenshot(page, "06_polish_result")

        page.locator("#btn-apply-polish").click()
        page.wait_for_timeout(1000)
        take_screenshot(page, "07_after_apply_polish")
        page.close()

    def test_flow_06_push_modal(self, browser_context):
        """步骤6: 打开推送弹窗"""
        page = browser_context.new_page()
        page.goto(BASE_URL)
        textarea = page.locator("#input-area")
        textarea.fill(SAMPLE_ARTICLE)
        page.wait_for_timeout(1500)

        page.locator("#btn-push").click()
        page.wait_for_timeout(500)
        take_screenshot(page, "08_push_modal")
        page.close()

    def test_flow_07_generate_summary(self, browser_context):
        """步骤7: 生成摘要"""
        page = browser_context.new_page()
        page.goto(BASE_URL)
        textarea = page.locator("#input-area")
        textarea.fill(SAMPLE_ARTICLE)
        page.wait_for_timeout(1500)

        page.locator("#btn-push").click()
        page.wait_for_timeout(500)

        page.locator("#btn-gen-summary").click()
        page.wait_for_timeout(3000)
        take_screenshot(page, "09_summary_generated")
        page.close()

    def test_flow_08_generate_cover(self, browser_context):
        """步骤8: 生成标题图"""
        page = browser_context.new_page()
        page.goto(BASE_URL)
        textarea = page.locator("#input-area")
        textarea.fill(SAMPLE_ARTICLE)
        page.wait_for_timeout(1500)

        page.locator("#btn-push").click()
        page.wait_for_timeout(500)

        page.locator("#btn-gen-cover").click()
        page.wait_for_timeout(3000)
        take_screenshot(page, "10_cover_generated")
        page.close()

    def test_flow_09_account_mgmt(self, browser_context):
        """步骤9: 公众号管理"""
        page = browser_context.new_page()
        page.goto(BASE_URL)
        textarea = page.locator("#input-area")
        textarea.fill(SAMPLE_ARTICLE)
        page.wait_for_timeout(1000)

        page.locator("#btn-push").click()
        page.wait_for_timeout(500)
        page.locator("#btn-manage-accounts").click()
        page.wait_for_timeout(500)
        take_screenshot(page, "11_account_mgmt_empty")

        # 添加公众号
        page.locator("#acct-nickname").fill("So talk")
        page.locator("#acct-appid").fill("wxe2bd55ee50e1b7c5")
        page.locator("#acct-appsecret").fill("8bff1ee143028ae747c6376a30814c75")
        page.locator("#btn-add-account").click()
        page.wait_for_timeout(1000)
        take_screenshot(page, "12_account_added")
        page.close()

    def test_flow_10_settings(self, browser_context):
        """步骤10: 设置页面"""
        page = browser_context.new_page()
        page.goto(BASE_URL)
        page.wait_for_timeout(1000)

        page.locator("#btn-settings").click()
        page.wait_for_timeout(500)
        take_screenshot(page, "13_settings")
        page.close()

    def test_flow_11_history(self, browser_context):
        """步骤11: 历史记录"""
        page = browser_context.new_page()
        page.goto(BASE_URL)
        page.wait_for_timeout(1000)

        page.locator("#btn-history").click()
        page.wait_for_timeout(500)
        take_screenshot(page, "14_history_empty")
        page.close()

    def test_flow_12_full_workflow(self, browser_context):
        """步骤12: 完整工作流截图"""
        page = browser_context.new_page()
        page.goto(BASE_URL)
        page.wait_for_timeout(1000)

        # 输入文本
        textarea = page.locator("#input-area")
        textarea.fill(SAMPLE_ARTICLE)
        page.wait_for_timeout(2000)
        take_screenshot(page, "15_full_workflow_input")

        # 润色
        page.locator("#btn-polish").click()
        page.wait_for_timeout(500)
        page.locator("#btn-start-polish").click()
        page.wait_for_timeout(3000)
        page.locator("#btn-apply-polish").click()
        page.wait_for_timeout(1000)
        take_screenshot(page, "16_full_workflow_polished")

        # 推送
        page.locator("#btn-push").click()
        page.wait_for_timeout(500)
        take_screenshot(page, "17_full_workflow_push")
        page.close()
