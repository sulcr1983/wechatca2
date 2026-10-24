#!/usr/bin/env python3
"""PWA 测试公共工具（2026-10-25）

把「等引擎就绪」这类反复踩坑的逻辑收成一处，避免每个测试各写一遍、各踩一遍。

核心坑（都实测过）：
  1. **引擎只在有内容时才 ready** —— 空编辑器永远停在 loading，是产品行为。
     所以等 ready 之前必须先 fill 内容。
  2. **首次访问慢** —— Pyodide 运行时约 40MB（wasm + stdlib），线上首访 30-40 秒；
     之后靠 Service Worker 缓存才快。测试超时必须给足，且要容忍首访。
  3. **ready 徽标可能不出现但渲染已完成** —— 用「复制按钮可用」作等价信号兜底。

用法：
    from core.pwa_test_utils import wait_engine_ready, SAMPLE_TEXT
    wait_engine_ready(page, url)
"""

from __future__ import annotations

# 通用短样例：有标题 + 两段，够触发精确渲染
SAMPLE_TEXT = "周末去海边\n\n两天的沉默之后，我重新听见了海浪、风声，还有自己。"


def wait_engine_ready(page, timeout: int = 180_000, fill: bool = True) -> bool:
    """等 PWA 精确排版引擎就绪。

    Args:
        page: Playwright Page（已 goto 到 PWA）
        timeout: 总超时（毫秒）。线上首访 Pyodide 约 40MB，默认给 3 分钟
        fill: 是否自动填入样例文本（**必须为 True**，否则引擎不会 ready）

    Returns:
        True = 就绪（引擎徽标 ready 或复制按钮可用）
    """
    if fill:
        try:
            if not page.input_value("#input"):
                page.fill("#input", SAMPLE_TEXT)
        except Exception:
            pass

    # ① 首选：引擎徽标 ready
    try:
        page.wait_for_selector("#engine-badge[data-state='ready']", timeout=timeout)
        return True
    except Exception:
        pass

    # ② 兜底：复制按钮可用（= 精确渲染已产出）
    try:
        page.wait_for_function(
            "() => { const b = document.getElementById('btn-copy'); return b && !b.disabled; }",
            timeout=30_000)
        return True
    except Exception:
        return False


def engine_state(page) -> dict:
    """读引擎徽标状态，供断言/日志用"""
    try:
        return page.evaluate("""() => {
            const b = document.getElementById('engine-badge');
            const t = document.getElementById('engine-text');
            const c = document.getElementById('btn-copy');
            return {state: b ? b.dataset.state : null,
                    text: t ? t.textContent : null,
                    copyEnabled: c ? !c.disabled : null};
        }""")
    except Exception:
        return {"state": None, "text": None, "copyEnabled": None}
