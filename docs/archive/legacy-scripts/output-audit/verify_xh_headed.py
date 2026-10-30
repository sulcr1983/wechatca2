#!/usr/bin/env python3
"""有头模式：对若干 xh- 外部主题截图，确认视觉风格确实彼此不同、且能正常渲染。

依赖：项目 .venv 已装 playwright + chromium。
"""
import pathlib
from playwright.sync_api import sync_playwright

ROOT = pathlib.Path(__file__).resolve().parent.parent.parent
SHOTS = ROOT / "output" / "e2e_audit" / "xh_shots"
SHOTS.mkdir(parents=True, exist_ok=True)

SAMPLE = """# 超级标题
## 副标题一节
正文段落，包含**加粗**、*斜体*与 `代码片段`。
> 这是一段引用，用来检验 blockquote 的左边框与底色。
## 清单
- 第一点
- 第二点
  - 嵌套子点
## 对比表格
| 项目 | 数值 | 备注 |
| --- | --- | --- |
| A | 10 | 示例 |
| B | 20 | 示例 |
## 代码块
```python
def add(a, b):
    return a + b
```
"""

TARGETS = ["xh-brutalism-raw", "xh-swiss-grid", "xh-memphis", "xh-vaporwave"]


def main():
    with sync_playwright() as p:
        browser = p.chromium.launch(headless=False)
        page = browser.new_page(viewport={"width": 1280, "height": 900})
        errors = []
        page.on("console", lambda m: errors.append(m.text) if m.type == "error" else None)
        page.on("pageerror", lambda e: errors.append(str(e)))

        page.goto("http://127.0.0.1:5000", wait_until="networkidle")
        page.wait_for_selector("#tpl-strip .tpl-card", timeout=15000)
        # 输入示例文本，触发首次渲染
        page.fill("#input-area", SAMPLE)
        page.wait_for_timeout(600)

        for tid in TARGETS:
            card = page.locator(f".tpl-card[data-tpl='{tid}']")
            card.scroll_into_view_if_needed()
            card.click()
            page.wait_for_timeout(900)  # 等渲染 + iframe 更新
            # 截图预览 iframe
            try:
                page.locator("#preview-frame").screenshot(
                    path=str(SHOTS / f"{tid}.png")
                )
                print(f"✓ 截图 {tid}")
            except Exception as e:
                print(f"✗ 截图失败 {tid}: {e}")
        # 整页截图（含顶栏模板选择区）方便看布局
        page.screenshot(path=str(SHOTS / "_full_page.png"))
        browser.close()

        real_errors = [e for e in errors if "ERR_CONNECTION_CLOSED" not in e]
        print(f"\n控制台错误（已过滤外部图）：{len(real_errors)}")
        for e in real_errors[:10]:
            print("  !", e)
        print(f"截图目录: {SHOTS}")


if __name__ == "__main__":
    main()
