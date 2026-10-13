#!/usr/bin/env python3
"""浏览器启动工具 — 单真源（2026-10-13）

封面渲染（归藏引擎）与有头测试套件共用同一策略：
优先系统 Edge / Chrome（Chromium 同内核，零下载——Windows 基本自带 Edge），
最后回退 Playwright 自带 Chromium（需 `playwright install chromium`）。

背景：此前多处写死 p.chromium.launch()，未装 bundled Chromium 的机器上
封面无法生成、有头套件无法运行；start-app.bat 还曾因自动下载 183MB
Chromium 失败卡死整个启动（2026-10-13）。BLCaptain（Node 侧）走另一条
链：CHROMIUM_PATH 环境变量，见 core/blcaptain_bridge.py。
"""


def launch_browser(p, **kwargs):
    """按序选择可用浏览器内核并启动。

    Args:
        p: sync_playwright() 实例（使用其 .chromium 入口）
        **kwargs: 透传给 launch()（如 headless / slow_mo / args）

    Raises:
        RuntimeError: 全部候选均不可用时，附带各候选的失败原因。
    """
    errors = []
    for channel in ("msedge", "chrome"):
        try:
            return p.chromium.launch(channel=channel, **kwargs)
        except Exception as e:  # 逐个候选尝试，全部失败才抛错
            errors.append(f"{channel}: {e}")
    try:
        return p.chromium.launch(**kwargs)
    except Exception as e:
        errors.append(f"playwright-bundled: {e}")
    raise RuntimeError(
        "未找到可用的浏览器内核（系统 Edge / Chrome / Playwright 自带 Chromium 均不可用）。"
        "请安装 Microsoft Edge 或 Google Chrome 后重试。\n  " + "\n  ".join(errors)
    )
