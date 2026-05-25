"""Playwright 浏览器端到端测试 — WechatAI Formatter

启动 Flask 服务器，用 Chromium 浏览器测试所有 UI 交互和 API 调用。
运行方式: pytest tests/test_browser_e2e.py --headed  (可选 --headed 看浏览器)
"""

import json
import re
import time
import threading
import pytest
from unittest.mock import patch, MagicMock
from pathlib import Path

from playwright.sync_api import Page, expect

# ── Flask 服务器夹具 ──────────────────────────────────────────────────

FLASK_PORT = 15432  # 避免与开发端口冲突
BASE_URL = f"http://127.0.0.1:{FLASK_PORT}"


@pytest.fixture(scope="session")
def flask_server():
    """启动 Flask 测试服务器（整个 session 只启动一次）"""
    import sys
    sys.path.insert(0, ".")
    from app import app

    # Mock 外部依赖，避免真实 API 调用
    def mock_call_llm(system_prompt, user_prompt):
        if "摘要" in system_prompt or "摘要" in user_prompt:
            return "这是一篇关于人工智能技术发展的深度文章，探讨了最新趋势和应用场景。"
        if "润色" in system_prompt:
            return "[润色后] " + user_prompt[:100] + "..."
        if "排版助手" in system_prompt or "Markdown" in system_prompt:
            return "## 优化标题\n\n这是LLM优化后的段落内容。\n\n- 列表项一\n- 列表项二"
        if "keyword" in system_prompt.lower() or "visual" in system_prompt.lower():
            return "technology, AI, modern, clean, professional"
        return "[已润色] " + user_prompt[:200]

    import io

    def mock_generate_cover(title, full_text):
        png_data = (
            b'\x89PNG\r\n\x1a\n\x00\x00\x00\rIHDR\x00\x00\x00\x01\x00\x00\x00\x01'
            b'\x08\x02\x00\x00\x00\x90wS\xde\x00\x00\x00\x0cIDATx\x9cc\xf8\x0f'
            b'\x00\x00\x01\x01\x00\x05\x18\xd8N\x00\x00\x00\x00IEND\xaeB`\x82'
        )
        return png_data

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
    time.sleep(1.5)  # 等待服务器启动
    yield app
    for p in patches:
        p.stop()


@pytest.fixture(scope="session")
def browser_context(browser, flask_server):
    context = browser.new_context(viewport={"width": 1400, "height": 900})
    yield context
    context.close()


# ── 测试用例 ──────────────────────────────────────────────────────────


class TestPageLoad:
    """页面加载与基本元素"""

    def test_homepage_loads(self, browser_context):
        page = browser_context.new_page()
        page.goto(BASE_URL)
        expect(page.locator(".logo")).to_have_text("WechatAI Formatter")
        page.close()

    def test_theme_selector_populated(self, browser_context):
        page = browser_context.new_page()
        page.goto(BASE_URL)
        selector = page.locator("#theme-select")
        # 等待主题加载
        selector.wait_for(state="visible", timeout=5000)
        options = selector.locator("option")
        count = options.count()
        assert count > 50, f"应有 50+ 主题，实际 {count}"
        page.close()

    def test_input_area_exists(self, browser_context):
        page = browser_context.new_page()
        page.goto(BASE_URL)
        textarea = page.locator("#input-area")
        expect(textarea).to_be_visible()
        page.close()


class TestRendering:
    """排版渲染功能"""

    def test_render_text(self, browser_context):
        page = browser_context.new_page()
        page.goto(BASE_URL)
        # 输入文本
        textarea = page.locator("#input-area")
        textarea.fill("人工智能概述\n\n人工智能就是让机器具备类似人类的思维能力。\n\n一、发展历程\n\n近年来AI飞速发展。")
        # 等待渲染完成（loading 指示器消失）
        page.wait_for_timeout(2000)
        # 检查预览 iframe 有内容
        iframe = page.frame_locator("#preview-frame")
        content = iframe.locator("body").inner_html()
        assert len(content) > 0, "预览区应有渲染内容"
        page.close()

    def test_theme_switch(self, browser_context):
        page = browser_context.new_page()
        page.goto(BASE_URL)
        textarea = page.locator("#input-area")
        textarea.fill("测试主题切换\n\n这是段落内容。")
        page.wait_for_timeout(1500)

        # 切换主题
        selector = page.locator("#theme-select")
        selector.select_option(index=5)
        page.wait_for_timeout(1500)

        iframe = page.frame_locator("#preview-frame")
        content = iframe.locator("body").inner_html()
        assert len(content) > 0, "切换主题后预览应有内容"
        page.close()


class TestPhonePreview:
    """手机预览模式"""

    def test_phone_preview_toggle(self, browser_context):
        page = browser_context.new_page()
        page.goto(BASE_URL)
        textarea = page.locator("#input-area")
        textarea.fill("手机预览测试\n\n测试内容。")
        page.wait_for_timeout(1500)

        # 点击手机预览按钮
        page.locator("#btn-phone-preview").click()
        phone_frame = page.locator("#phone-frame")
        expect(phone_frame).to_have_class(re.compile(r"visible"))

        # 切回完整预览
        page.locator("#btn-full-preview").click()
        page.close()


class TestAIPolish:
    """AI 润色功能"""

    def test_polish_modal_opens(self, browser_context):
        page = browser_context.new_page()
        page.goto(BASE_URL)
        textarea = page.locator("#input-area")
        textarea.fill("首先，我们需要明确，其次要深入理解这个概念。")

        # 打开润色弹窗
        page.locator("#btn-polish").click()
        modal = page.locator("#polish-modal")
        expect(modal).to_be_visible()

        # 检查原文已填入
        original = page.locator("#polish-original")
        assert original.input_value() != "", "原文应已填入"
        page.close()

    def test_polish_execution(self, browser_context):
        page = browser_context.new_page()
        page.goto(BASE_URL)
        textarea = page.locator("#input-area")
        textarea.fill("首先，我们需要明确，其次要深入理解这个概念。")

        page.locator("#btn-polish").click()
        page.wait_for_timeout(500)

        # 点击开始润色
        page.locator("#btn-start-polish").click()
        # 等待润色完成
        page.wait_for_timeout(3000)

        result = page.locator("#polish-result")
        value = result.input_value()
        assert len(value) > 0, "润色结果不应为空"
        page.close()


class TestPushModal:
    """推送弹窗功能"""

    def test_push_modal_opens(self, browser_context):
        page = browser_context.new_page()
        page.goto(BASE_URL)
        textarea = page.locator("#input-area")
        textarea.fill("推送测试文章\n\n这是内容。")
        page.wait_for_timeout(1500)

        page.locator("#btn-push").click()
        modal = page.locator("#push-modal")
        expect(modal).to_be_visible()
        page.close()

    def test_summary_generation(self, browser_context):
        page = browser_context.new_page()
        page.goto(BASE_URL)
        textarea = page.locator("#input-area")
        textarea.fill("人工智能技术在近年来取得突破性进展，深度学习、自然语言处理等领域的创新不断涌现。")
        page.wait_for_timeout(1500)

        page.locator("#btn-push").click()
        page.wait_for_timeout(500)

        # 点击生成摘要
        page.locator("#btn-gen-summary").click()
        page.wait_for_timeout(3000)

        summary = page.locator("#push-summary")
        value = summary.input_value()
        assert len(value) > 0, "摘要不应为空"
        page.close()

    def test_cover_image_generation(self, browser_context):
        page = browser_context.new_page()
        page.goto(BASE_URL)
        textarea = page.locator("#input-area")
        textarea.fill("封面图测试文章\n\n这是内容。")
        page.wait_for_timeout(1500)

        page.locator("#btn-push").click()
        page.wait_for_timeout(500)

        # 点击生成标题图
        page.locator("#btn-gen-cover").click()
        page.wait_for_timeout(3000)

        # 检查封面图 URL 已设置
        cover_img = page.locator("#cover-preview")
        src = cover_img.get_attribute("src")
        assert src and "/temp_covers/" in src, f"封面图 URL 应包含 /temp_covers/，实际: {src}"
        page.close()


class TestAccountManagement:
    """公众号管理"""

    def test_add_account(self, browser_context):
        page = browser_context.new_page()
        page.goto(BASE_URL)

        # 打开推送弹窗 → 管理公众号
        page.locator("#input-area").fill("测试")
        page.wait_for_timeout(1000)
        page.locator("#btn-push").click()
        page.wait_for_timeout(500)
        page.locator("#btn-manage-accounts").click()

        # 填写公众号信息
        modal = page.locator("#account-mgmt-modal")
        expect(modal).to_be_visible()

        page.locator("#acct-nickname").fill("测试公众号")
        page.locator("#acct-appid").fill("wx_test_123")
        page.locator("#acct-appsecret").fill("test_secret_456")
        page.locator("#btn-add-account").click()

        page.wait_for_timeout(1000)

        # 检查列表中出现新账号
        account_list = page.locator("#account-list .account-item")
        count = account_list.count()
        assert count >= 1, "应至少有一个公众号"
        page.close()


class TestCopyButton:
    """复制功能"""

    def test_copy_button_exists(self, browser_context):
        page = browser_context.new_page()
        page.goto(BASE_URL)
        btn = page.locator("#btn-copy")
        expect(btn).to_be_visible()
        page.close()


class TestHistoryModal:
    """历史记录弹窗"""

    def test_history_modal_opens(self, browser_context):
        page = browser_context.new_page()
        page.goto(BASE_URL)
        page.locator("#btn-history").click()
        modal = page.locator("#history-modal")
        expect(modal).to_be_visible()
        page.close()
