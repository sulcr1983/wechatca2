#!/usr/bin/env python3
"""浏览器启动工具 — 单真源（2026-10-13，2026-10-18 改为 Chrome 优先）

封面渲染、有头测试套件、启动页三处共用同一策略：

1. **Chrome 优先**（用户明确要求）：装了 Chrome 就用 Chrome。
2. Edge 兜底（Windows 基本自带）。
3. 最后回退 Playwright 自带 Chromium（需 `playwright install chromium`）。

背景：
- 2026-10-13 此前多处写死 `p.chromium.launch()`，未装 bundled Chromium 的机器上
  封面无法生成、有头套件无法运行；start-app.bat 还曾因自动下载 183MB Chromium
  失败卡死整个启动。
- 2026-10-18 原顺序是 ("msedge", "chrome")，导致装了 Edge 的机器永远轮不到 Chrome；
  同时启动页 `webbrowser.open()` 走系统默认浏览器，被星愿浏览器（注册表
  `StartMenuInternet\\Chromium` + `UserChoice=ChromiumHTM`）抢占。两处一并改掉。
- BLCaptain（Node 侧）走另一条链：CHROMIUM_PATH 环境变量，候选来源是本模块。
  （注：注入方 `core/blcaptain_bridge.py` 只被已归档的本地 Flask 版调用，2026-10-29 已删除，
   PWA 封面在浏览器里渲染，不再走 Node。）
"""

import os
import subprocess
import webbrowser

# Chromium 内核浏览器的可执行文件候选（按探测优先级排列）
_CHROME_PATHS = (
    r"C:\Program Files\Google\Chrome\Application\chrome.exe",
    r"C:\Program Files (x86)\Google\Chrome\Application\chrome.exe",
    r"%LOCALAPPDATA%\Google\Chrome\Application\chrome.exe",
)
_EDGE_PATHS = (
    r"C:\Program Files (x86)\Microsoft\Edge\Application\msedge.exe",
    r"C:\Program Files\Microsoft\Edge\Application\msedge.exe",
)

# Playwright channel 探测顺序：Chrome 优先
BROWSER_CHANNELS = ("chrome", "msedge")


def _first_existing(paths) -> str | None:
    for raw in paths:
        path = os.path.expandvars(raw)
        if os.path.exists(path):
            return path
    return None


def find_chrome_executable() -> str | None:
    """返回系统 Chrome 的可执行文件路径，未安装返回 None。"""
    return _first_existing(_CHROME_PATHS)


def find_edge_executable() -> str | None:
    """返回系统 Edge 的可执行文件路径，未安装返回 None。"""
    return _first_existing(_EDGE_PATHS)


def find_system_browser() -> str | None:
    """返回系统 Chromium 内核浏览器路径（Chrome 优先，Edge 兜底）。"""
    return find_chrome_executable() or find_edge_executable()


def launch_browser(p, **kwargs):
    """按序选择可用浏览器内核并启动。

    Args:
        p: sync_playwright() 实例（使用其 .chromium 入口）
        **kwargs: 透传给 launch()（如 headless / slow_mo / args）

    Raises:
        RuntimeError: 全部候选均不可用时，附带各候选的失败原因。
    """
    errors = []
    for channel in BROWSER_CHANNELS:
        try:
            return p.chromium.launch(channel=channel, **kwargs)
        except Exception as e:  # 逐个候选尝试，全部失败才抛错
            errors.append(f"{channel}: {e}")
    try:
        return p.chromium.launch(**kwargs)
    except Exception as e:
        errors.append(f"playwright-bundled: {e}")
    raise RuntimeError(
        "未找到可用的浏览器内核（系统 Chrome / Edge / Playwright 自带 Chromium 均不可用）。"
        "请安装 Google Chrome 或 Microsoft Edge 后重试。\n  " + "\n  ".join(errors)
    )


def open_url(url: str) -> bool:
    """用 Chrome 打开网址；Chrome 缺失时退回系统默认浏览器。

    不用 webbrowser.open 是刻意的：它会走系统默认浏览器，而 Windows 上默认浏览器
    经常被第三方浏览器抢占（本机实测被星愿浏览器接管，ProgId=ChromiumHTM）。

    Returns:
        True 表示已交给浏览器进程；False 表示全部方式都失败。
    """
    chrome = find_chrome_executable()
    if chrome:
        try:
            subprocess.Popen([chrome, url], close_fds=True)
            return True
        except OSError:
            pass  # 路径失效等，退回默认浏览器
    try:
        return webbrowser.open(url)
    except Exception:
        return False
