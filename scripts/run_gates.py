#!/usr/bin/env python3
"""一键全量门禁（PWA 专用）：按序跑门禁套件，任一失败即停。

⚠️ 本门禁**只测 PWA**，不测已弃用的本地 Flask 版（app.py / templates/index.html）。
   2026-10-25 苏哥定调：我们要做的是 PWA，不是本地 Flask。
   原 A/B 段（test_e2e / api_e2e / test_integration / 3 个本地有头套件）会反复
   起 127.0.0.1:5000 并弹多个 Chrome 窗口，已全部移出，需要时手动单独跑。

⚠️ 2026-10-25 P0 改造（两层 + 前置检查）：
   0 前置检查  scripts/preflight.py —— dist 是否包含最近一次代码改动（阻断）、
               工作区是否脏（只警告）、线上版本（仅 --online 时）
   1 本地层    **默认**：测本地 dist / 进程内源码，断网可跑，结果与当前工作区一一对应
   2 线上层    --online：打 https://supersu.ccwu.cc/，**部署后**验证真环境
   3 有头层    --ui：164 套模板 × 3 夹具 + 8 版式 + 按钮 + 真实 AI（用本地 dist）
   4 扩展层    --full：断网/首屏/轻量预览/模板体验/外链图/自动更新（较慢）

用法：
    .venv/Scripts/python.exe scripts/run_gates.py             # 本地层（默认，约 6 分钟）
    .venv/Scripts/python.exe scripts/run_gates.py --quick     # 最快核心信号（约 3 分钟）
    .venv/Scripts/python.exe scripts/run_gates.py --ui        # + 有头 UI 全量（约 20 分钟）
    .venv/Scripts/python.exe scripts/run_gates.py --full      # + 扩展套件
    .venv/Scripts/python.exe scripts/run_gates.py --online    # + 线上冒烟（部署后跑）
    .venv/Scripts/python.exe scripts/run_gates.py --full --ui --online   # 全都要

排除说明：
  本地 Flask 版套件（手动跑，不进 PWA 门禁）：
      python tests/test_e2e.py            端到端 74（test_client）
      python tests/test_api_e2e.py        后端 API 29（需起 5000）
      python tests/test_integration.py    前后端联动 35（需起 5000）
      python tests/test_headed_full_e2e.py / test_headed_wechat_copy.py
      python tests/test_headed_userflow.py / test_headed_audit_fixes.py
  pwa_incremental_test  需要「部署一次 → 换文件 → 再部署」两次部署之间跑，手动执行
  test_headed_pm_audit  审计套件（失败=发现问题），不是门禁，不纳入

产物：output/gate-run/run-<时间戳>.log + 终端汇总表（含 target 列）。
"""

from __future__ import annotations

import argparse
import datetime as dt
import os
import socket
import subprocess
import sys
import time
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
OUT = ROOT / "output" / "gate-run"
PY = ROOT / ".venv" / "Scripts" / "python.exe"
if not PY.exists():
    PY = Path(sys.executable)

# (名称, 命令, 说明, target)
# target 含义：local = 本地 dist / in-process = 进程内直调 core / online = 线上服务器
SUITES_LOCAL = [  # 本地层（默认）：结果与当前工作区一一对应，断网可跑
    ("ai_preset",      [PY, "scripts/pwa_ai_preset_test.py", "--local"], "AI 平台预设 21", "local"),
    ("ai_format",      [PY, "scripts/pwa_ai_format_test.py", "--local"], "AI 排版 27", "local"),
    ("theme_drawer",   [PY, "scripts/pwa_theme_drawer_test.py", "--local"], "模板库全量审计 59", "local"),
    ("export",         [PY, "scripts/pwa_export_test.py"],        "导出四件套 12", "local"),
    ("nine",           [PY, "scripts/pwa_nine_test.py"],          "九宫格切图 15", "local"),
    ("cover",          [PY, "scripts/pwa_cover_test.py"],         "封面 18（1 SKIP 网络）", "local"),
    ("layout_compat",  [PY, "scripts/pwa_layout_compat_test.py"], "版式兼容矩阵 100", "in-process"),
    ("doc_sync",       [PY, "scripts/doc_sync_check.py"],
                       "文档一致性（数字与实际对齐）", "in-process"),
    ("clean_output",   [PY, "scripts/clean_output.py", "--days", "7"],
                       "output 清理预检（只预览不删）", "in-process"),
]

SUITES_ONLINE = [  # 线上层（--online）：部署后用真环境验证
    ("release_card",   [PY, "scripts/pwa_release_card_test.py"],  "发布小票 9（打线上）", "online"),
    ("online_e2e",     [PY, "scripts/pwa_online_e2e.py"],         "线上全量 97", "online"),
]

SUITES_UI = [  # 有头层（--ui）：较慢，用本地 dist 测当前代码
    ("headed_ui",      [PY, "scripts/pwa_headed_full_e2e.py", "--local"],
                       "有头全量 51（164套×3夹具 + 8版式 + 3开关 + 按钮 + AI mock）", "local"),
    ("real_ai",        [PY, "scripts/pwa_real_ai_test.py", "--local"],
                       "真实 AI 17（真调 DeepSeek，需 .env 有 Key）", "local"),
]

SUITES_FULL = [  # 扩展层（--full）：更慢或依赖外部
    ("auto_update",    [PY, "scripts/pwa_auto_update_test.py"],   "静默自动更新 8（本地探针）", "local"),
    ("offline",        [PY, "scripts/pwa_offline_test.py"],       "断网可用性 10", "online"),
    ("s1s3",           [PY, "scripts/pwa_s1s3_test.py"],          "首屏不阻塞 + AI 链路 9", "online"),
    ("light_preview",  [PY, "scripts/pwa_light_preview_test.py"], "轻量即时预览 6", "online"),
    ("template_ux",    [PY, "scripts/pwa_template_ux_test.py"],   "模板库体验 5", "online"),
    ("image_localize", [PY, "scripts/pwa_image_localize_test.py"], "外链图本地化 12", "local"),
]

ALL_SUITES = SUITES_LOCAL + SUITES_ONLINE + SUITES_UI + SUITES_FULL
QUICK = {"ai_preset", "ai_format", "layout_compat"}


def port_busy(port: int) -> bool:
    with socket.socket() as s:
        s.settimeout(0.4)
        return s.connect_ex(("127.0.0.1", port)) == 0


def now() -> str:
    return dt.datetime.now().strftime("%H:%M:%S")


def run_step(name: str, cmd: list, desc: str, target: str, log, timeout: int = 1800):
    log.write(f"\n{'=' * 64}\n[{now()}] {name} — {desc}（{target}）\n"
              f"  $ {' '.join(str(c) for c in cmd)}\n")
    log.flush()
    t0 = time.time()
    env = dict(os.environ)
    try:
        r = subprocess.run(cmd, cwd=ROOT, env=env, stdout=subprocess.PIPE,
                           stderr=subprocess.STDOUT, text=True, encoding="utf-8",
                           errors="replace", timeout=timeout)
        out = r.stdout or ""
        ok = r.returncode == 0
    except subprocess.TimeoutExpired:
        out, ok = "", False
    dur = time.time() - t0
    log.write(out[-20000:] + f"\n[{now()}] {name} → {'PASS' if ok else 'FAIL'}（{dur:.0f}s）\n")
    log.flush()
    print(f"  {'PASS' if ok else 'FAIL'}  {name:<14} {dur:>6.0f}s  [{target}]  {desc}", flush=True)
    return ok, dur


def main() -> int:
    ap = argparse.ArgumentParser()
    ap.add_argument("--full", action="store_true", help="追加扩展套件")
    ap.add_argument("--ui", action="store_true",
                    help="追加有头 UI 全量（约 20 分钟，用本地 dist；需网络与真 Key）")
    ap.add_argument("--online", action="store_true",
                    help="追加线上冒烟（打 https://supersu.ccwu.cc/，部署后跑）")
    ap.add_argument("--quick", action="store_true", help="只跑最快核心信号")
    ap.add_argument("--skip-preflight", action="store_true",
                    help="跳过前置检查（仅排障用，正常不要加）")
    args = ap.parse_args()

    if not (ROOT / "pwa" / "dist" / "index.html").exists():
        print("ERROR: pwa/dist 不存在，先跑 node pwa/scripts/build.mjs", file=sys.stderr)
        return 2

    # 5000 端口是已弃用本地 Flask 版；只提示，不阻止
    if port_busy(5000):
        print("提示：5000 端口有服务在跑（本地 Flask 版）。本门禁不测它，不受影响。",
              flush=True)

    OUT.mkdir(parents=True, exist_ok=True)
    stamp = dt.datetime.now().strftime("%Y%m%d-%H%M%S")
    log_path = OUT / f"run-{stamp}.log"
    log = log_path.open("w", encoding="utf-8")

    if args.quick:
        suites_local = [s for s in SUITES_LOCAL if s[0] in QUICK]
        suites_online: list = []
        suites_ui: list = []
        suites_full: list = []
        mode = "quick"
    else:
        suites_local = SUITES_LOCAL
        suites_online = SUITES_ONLINE if args.online else []
        suites_ui = SUITES_UI if args.ui else []
        suites_full = SUITES_FULL if args.full else []
        mode = "standard"
        if args.ui:
            mode += "+ui"
        if args.full:
            mode += "+full"
        if args.online:
            mode += "+online"

    print(f"🛡️  PWA 门禁（{mode}）→ 日志 {log_path}", flush=True)
    print("   默认层测本地 dist / 进程内源码；--online 才打线上", flush=True)
    log.write(f"# gate run {stamp} mode={mode}\n")

    results: list[tuple[str, bool, float, str]] = []
    stopped_at = None

    def run_all(items) -> bool:
        nonlocal stopped_at
        for name, cmd, desc, target in items:
            ok, dur = run_step(name, cmd, desc, target, log)
            results.append((name, ok, dur, target))
            if not ok:
                stopped_at = name
                return False
        return True

    # ── 0 段：前置检查（dist 新鲜度 / 工作区 / 线上）──
    if not args.skip_preflight:
        print("── 0 段 · 前置检查 ──", flush=True)
        pre_cmd = [str(PY), "scripts/preflight.py"]
        if args.online:
            pre_cmd.append("--online")
        ok, dur = run_step("preflight", pre_cmd, "dist 新鲜度 + 工作区 + 线上版本",
                           "in-process", log, timeout=120)
        results.append(("preflight", ok, dur, "in-process"))
        if not ok:
            _cleanup_stray()
            return summarize(results, "preflight", log, log_path)

    # ── 1 段：本地层 ──
    print("── 1 段 · 本地层（测当前代码）──", flush=True)
    if not run_all(suites_local):
        _cleanup_stray()
        return summarize(results, stopped_at, log, log_path)

    # ── 2 段：线上层（--online，部署后）──
    if suites_online and not stopped_at:
        print("── 2 段 · 线上层（--online，打线上）──", flush=True)
        if not run_all(suites_online):
            _cleanup_stray()
            return summarize(results, stopped_at, log, log_path)

    # ── 3 段：有头层（--ui）──
    if suites_ui and not stopped_at:
        print("── 3 段 · 有头层（--ui，本地 dist）──", flush=True)
        if not run_all(suites_ui):
            _cleanup_stray()
            return summarize(results, stopped_at, log, log_path)

    # ── 4 段：扩展层（--full）──
    if suites_full and not stopped_at:
        print("── 4 段 · 扩展层（--full）──", flush=True)
        run_all(suites_full)

    _cleanup_stray()
    return summarize(results, stopped_at, log, log_path)


def _cleanup_stray() -> None:
    """门禁结束时清掉残留的测试浏览器窗口（防止反复跑积累一堆 Chrome）。

    只清 Playwright 拉起的（有独立 user-data-dir），绝不碰用户自己开的 Chrome。
    """
    script = ROOT / "scripts" / "kill_test_processes.py"
    if not script.exists():
        return
    try:
        subprocess.run([str(PY), str(script), "--apply", "--browsers-only", "--quiet"],
                       cwd=ROOT, timeout=60, capture_output=True)
    except Exception:
        pass


def summarize(results, stopped_at, log, log_path) -> int:
    passed = sum(1 for _, ok, _, _ in results if ok)
    total = len(results)
    print(f"\n{'─' * 72}", flush=True)
    print(f"  {'结果':<5} {'套件':<14} {'耗时':>7}  target", flush=True)
    for name, ok, dur, target in results:
        print(f"  {'✅' if ok else '❌':<5} {name:<14} {dur:>6.0f}s  {target}", flush=True)
    if stopped_at:
        ran = {r[0] for r in results}
        remaining = [n for n, _, _, _ in ALL_SUITES if n not in ran]
        print(f"\n⛔ 在 {stopped_at} 处停止（失败即停）。未跑：{', '.join(remaining) or '无'}",
              flush=True)
    else:
        print(f"\n🎉 全部门禁通过：{passed}/{total}", flush=True)
    print(f"日志：{log_path}", flush=True)
    log.write(f"\n# summary {passed}/{total} stopped_at={stopped_at}\n")
    log.close()
    return 0 if passed == total else 1


if __name__ == "__main__":
    sys.exit(main())
