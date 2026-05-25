"""
完整用户流程截图测试 - 使用 Playwright
覆盖：首页、设置(AI+公众号)、模板切换、手机预览、AI润色、推送全流程
"""
import time
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).parent.parent))

from playwright.sync_api import sync_playwright

BASE_URL = "http://127.0.0.1:5000"
SHOTS_DIR = Path(__file__).parent / "full_flow_screenshots"
SHOTS_DIR.mkdir(parents=True, exist_ok=True)

TEST_ARTICLE = """人工智能改变生活

人工智能正在深刻改变我们的日常生活。从智能手机到智能家居，AI技术无处不在。

一、智能家居

智能家居系统可以自动调节温度、照明和安全监控。通过语音助手，用户可以轻松控制家中设备。

二、健康医疗

AI在医疗领域的应用包括疾病诊断、药物研发和个性化治疗方案。深度学习算法能够分析医学影像，辅助医生做出更准确的判断。

三、交通出行

自动驾驶技术是AI在交通领域的重要应用。通过传感器和算法，车辆可以感知环境并做出驾驶决策。

总之，人工智能正在让我们的生活变得更加便捷和高效。"""


def shot(page, name, full_page=False):
    path = SHOTS_DIR / f"{name}.png"
    page.screenshot(path=str(path), full_page=full_page)
    print(f"  Screenshot: {name}.png")


def run():
    with sync_playwright() as p:
        browser = p.chromium.launch(headless=False)
        context = browser.new_context(viewport={"width": 1440, "height": 900})
        page = context.new_page()

        print("[1/17] 打开首页")
        page.goto(BASE_URL)
        page.wait_for_selector("#input-area", timeout=15000)
        time.sleep(2)
        shot(page, "01_homepage")

        print("[2/17] 打开设置弹窗 - 公众号配置")
        page.click("#btn-settings")
        page.wait_for_selector("#settings-account-list", timeout=5000)
        time.sleep(2)
        shot(page, "02_settings_wechat_accounts")

        print("[3/17] 滚动查看AI配置")
        page.evaluate("document.querySelector('#settings-modal .modal-content').scrollTo(0, 9999)")
        time.sleep(1)
        shot(page, "03_settings_ai_config")

        print("[4/17] 关闭设置，输入文章")
        page.click("#settings-modal .close-modal")
        time.sleep(1)
        page.fill("#input-area", TEST_ARTICLE)
        time.sleep(4)
        shot(page, "04_input_and_render")

        print("[5/17] 切换5个模板")
        themes = ["bold-blue", "elegant-navy", "minimal-gray", "aurora", "autumn-leaf"]
        for i, theme in enumerate(themes, 1):
            page.select_option("#theme-select", theme)
            time.sleep(2)
            shot(page, f"05_theme_{i}_{theme}")

        print("[6/17] 手机预览")
        page.click("#btn-phone-preview")
        time.sleep(2)
        shot(page, "06_phone_preview")

        print("[7/17] 返回完整预览")
        page.click("#btn-full-preview")
        time.sleep(1)

        print("[8/17] AI润色弹窗")
        page.click("#btn-polish")
        time.sleep(1)
        shot(page, "07_polish_modal")

        print("[9/17] 开始润色")
        page.click("#btn-start-polish")
        time.sleep(10)
        shot(page, "08_polish_result")

        print("[10/17] 应用润色结果")
        page.click("#btn-apply-polish")
        time.sleep(2)
        shot(page, "09_after_polish")

        print("[11/17] 打开推送弹窗")
        page.click("#btn-push")
        time.sleep(1)
        page.wait_for_selector("#push-account-select", timeout=5000)
        shot(page, "10_push_modal")

        print("[12/17] 选择公众号")
        page.select_option("#push-account-select", "66ab3f175d7c")
        time.sleep(1)
        shot(page, "11_push_account_selected")

        print("[13/17] AI生成摘要")
        page.click("#btn-gen-summary")
        time.sleep(10)
        shot(page, "12_summary_generated")

        print("[14/17] AI生成标题图")
        page.click("#btn-gen-cover")
        time.sleep(15)
        shot(page, "13_cover_generated")

        print("[15/17] 推送预览")
        page.click("#btn-preview-full")
        time.sleep(2)
        # 切回主页面（预览是新窗口，需要处理）
        # 直接截图当前推送弹窗状态
        page.bring_to_front()
        shot(page, "14_push_preview")

        print("[16/17] 确认推送（会显示白名单错误）")
        page.click("#btn-confirm-push")
        time.sleep(1)
        shot(page, "15_push_error_whitelist")
        time.sleep(6)

        print("[17/17] 关闭推送弹窗，查看历史")
        page.click("#push-modal .close-modal")
        time.sleep(1)
        page.click("#btn-history")
        time.sleep(1)
        shot(page, "16_history")
        page.click("#history-modal .close-modal")
        time.sleep(1)

        print("[18] 复制功能")
        page.click("#btn-copy")
        time.sleep(1)
        shot(page, "17_copy_toast")

        browser.close()
        print(f"\n全部截图已保存到: {SHOTS_DIR}")


if __name__ == "__main__":
    run()
