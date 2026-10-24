#!/usr/bin/env python3
"""测试进程/窗口清理（2026-10-25）

背景：反复跑有头测试后，会积累一堆 Chrome 窗口和残留 python 进程。
根因有两类：
  1. 测试脚本异常退出时没执行 browser.close()（如 pwa_cover_test 的 finally 只关了 httpd）
  2. 门禁被 Ctrl+C / 中断时，子进程来不及收尾

本脚本提供：
  - kill_stray_browsers()  杀掉 Playwright 拉起的 Chrome（靠独立 user-data-dir 识别，
                           绝不碰用户自己开的 Chrome）
  - kill_test_python()     杀掉本项目的测试 python 进程（靠命令行含脚本名识别）
  - cleanup_all()          两件一起做

⚠️ 安全边界：
  - **只杀 Playwright/测试拉起的**，用 --user-data-dir 或命令行含本项目测试脚本名识别
  - **绝不杀用户日常 Chrome**（没有 user-data-dir 参数的一律跳过）
  - 绝不 kill 当前进程自己

用法：
    python scripts/kill_test_processes.py            # 预览：列出会杀什么，不动手
    python scripts/kill_test_processes.py --apply    # 真杀
    python scripts/kill_test_processes.py --apply --quiet
"""

from __future__ import annotations

import argparse
import os
import subprocess
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent

# 本项目测试脚本的特征词（命令行里出现即认定为本项目测试进程）
TEST_MARKERS = (
    "pwa_headed_full_e2e", "pwa_real_ai_test", "pwa_ai_format_test",
    "pwa_ai_preset_test", "pwa_theme_drawer_test", "pwa_export_test",
    "pwa_nine_test", "pwa_cover_test", "pwa_auto_update_test",
    "pwa_layout_compat_test", "pwa_offline_test", "pwa_s1s3_test",
    "pwa_light_preview_test", "pwa_template_ux_test", "pwa_image_localize_test",
    "pwa_online_e2e", "pwa_release_card_test", "run_gates.py", "test_all.py",
    "test_headed_", "test_integration.py", "test_api_e2e.py",
)


def _run(cmd: list[str]) -> str:
    try:
        r = subprocess.run(cmd, capture_output=True, text=True, timeout=30,
                           encoding="utf-8", errors="replace")
        return r.stdout or ""
    except Exception:
        return ""


def list_chrome() -> list[tuple[int, str]]:
    """返回 [(pid, cmdline)]，只含 Playwright 拉起的（有独立 user-data-dir）"""
    out = _run(["powershell", "-NoProfile", "-Command",
                "Get-CimInstance Win32_Process -Filter \"name='chrome.exe'\" | "
                "Select-Object ProcessId,CommandLine | ConvertTo-Csv -NoTypeInformation"])
    rows = []
    for line in out.splitlines()[1:]:
        parts = [p.strip('"') for p in line.split('","')]
        if len(parts) < 2:
            continue
        try:
            pid = int(parts[0].strip('"'))
        except ValueError:
            continue
        cmd = parts[1]
        # 只认带 user-data-dir 的（Playwright 一定用临时 profile；用户日常 Chrome 没有）
        if "user-data-dir" in cmd.lower():
            rows.append((pid, cmd[:160]))
    return rows


def list_python() -> list[tuple[int, str]]:
    """返回 [(pid, cmdline)]，只含本项目测试 python 进程"""
    me = os.getpid()
    out = _run(["powershell", "-NoProfile", "-Command",
                "Get-CimInstance Win32_Process -Filter \"name='python.exe'\" | "
                "Select-Object ProcessId,CommandLine | ConvertTo-Csv -NoTypeInformation"])
    rows = []
    for line in out.splitlines()[1:]:
        parts = [p.strip('"') for p in line.split('","')]
        if len(parts) < 2:
            continue
        try:
            pid = int(parts[0].strip('"'))
        except ValueError:
            continue
        if pid == me:
            continue
        cmd = parts[1]
        if any(m in cmd for m in TEST_MARKERS):
            rows.append((pid, cmd[:160]))
    return rows


def kill(pid: int) -> bool:
    try:
        subprocess.run(["taskkill", "/F", "/PID", str(pid)],
                       capture_output=True, timeout=15)
        return True
    except Exception:
        return False


def main() -> int:
    try:
        sys.stdout.reconfigure(encoding="utf-8", errors="replace")
    except Exception:
        pass

    ap = argparse.ArgumentParser()
    ap.add_argument("--apply", action="store_true", help="真杀（默认只预览）")
    ap.add_argument("--quiet", action="store_true")
    ap.add_argument("--browsers-only", action="store_true", help="只清浏览器窗口")
    ap.add_argument("--python-only", action="store_true", help="只清测试 python 进程")
    args = ap.parse_args()

    browsers = [] if args.python_only else list_chrome()
    pythons = [] if args.browsers_only else list_python()

    if not args.quiet:
        print(f"测试浏览器窗口（Playwright 独立 profile）：{len(browsers)} 个")
        for pid, cmd in browsers:
            print(f"  - PID {pid}  {cmd[:100]}")
        print(f"\n本项目测试 python 进程：{len(pythons)} 个")
        for pid, cmd in pythons:
            print(f"  - PID {pid}  {cmd[:100]}")

    total = len(browsers) + len(pythons)
    if total == 0:
        print("\n✅ 没有需要清理的进程")
        return 0

    if not args.apply:
        print(f"\n[预览模式] 共 {total} 个待清理。要真杀请加 --apply")
        return 0

    ok = 0
    for pid, _ in browsers + pythons:
        if kill(pid):
            ok += 1
    print(f"\n✅ 已清理 {ok}/{total} 个进程")
    return 0 if ok == total else 1


if __name__ == "__main__":
    sys.exit(main())
