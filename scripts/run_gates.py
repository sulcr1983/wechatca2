#!/usr/bin/env python3
"""一键全量门禁（PWA 专用）：按序跑门禁套件，任一失败即停。

⚠️ 本门禁**只测 PWA**，不测已弃用的本地 Flask 版（app.py / templates/index.html）。
   2026-10-25 苏哥定调：我们要做的是 PWA，不是本地 Flask。
   原 A/B 段（test_e2e / api_e2e / test_integration / 3 个本地有头套件）会反复
   起 127.0.0.1:5000 并弹多个 Chrome 窗口，已全部移出，需要时手动单独跑。

用法：
    .venv/Scripts/python.exe scripts/run_gates.py            # 标准（PWA 全量，约 6 分钟）
    .venv/Scripts/python.exe scripts/run_gates.py --quick    # 最快核心信号（约 3 分钟）
    .venv/Scripts/python.exe scripts/run_gates.py --ui       # 追加有头 UI 全量（164套模板/8版式，约 20 分钟）
    .venv/Scripts/python.exe scripts/run_gates.py --full     # 追加离线/轻量套件
    .venv/Scripts/python.exe scripts/run_gates.py --full --ui # 全都要（最慢）

分段设计：
  A PWA 核心段   AI 预设 / AI 排版 / 模板库审计 / 导出 / 九宫格 / 封面 / 自动更新
                 / 发布小票 / 版式矩阵 / output 清理预检
  B 有头 UI 段   --ui 才跑：有头全量（164 套模板 × 3 类夹具 + 8 版式 + 段落开关 + 按钮）
                 + 真实 AI（真调 DeepSeek）
  C 扩展段       --full 才跑：断网可用性 / 首屏不阻塞 / 轻量预览 / 模板体验 / 外链图 / 线上全量

目标说明：
  - 浏览器类测试（有头/无头）**默认打线上服务器** https://supersu.ccwu.cc/
    —— 真 SW、真部署、真 CDN，比本地 dist 更有意义
  - 纯渲染层测试（版式矩阵、主题生成审计）在进程内直接跑，不开浏览器、不开端口
  - 任何套件都不起 127.0.0.1:5000（那是已弃用本地 Flask 版）

排除说明：
  本地 Flask 版套件（手动跑，不进 PWA 门禁）：
      python tests/test_e2e.py            端到端 74（test_client）
      python tests/test_api_e2e.py        后端 API 29（需起 5000）
      python tests/test_integration.py    前后端联动 35（需起 5000）
      python tests/test_headed_full_e2e.py / test_headed_wechat_copy.py
      python tests/test_headed_userflow.py / test_headed_audit_fixes.py
  pwa_incremental_test  需要「部署一次 → 换文件 → 再部署」两次部署之间跑，手动执行
  auto_update           靠改写本地探针 sw.js 触发更新，属「本地探针机制测试」，
                        已移到 --full；单独跑 8/8，门禁内偶发 6/7（待重构）
  test_headed_pm_audit  审计套件（失败=发现问题），不是门禁，不纳入

产物：output/gate-run/run-<时间戳>.log + 终端汇总表。
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

# (名称, 命令, 说明)
SUITES_A = [   # PWA 核心（不开浏览器、不开端口，最快最有信号）
    ("ai_preset",      [PY, "scripts/pwa_ai_preset_test.py"],     "AI 平台预设 21"),
    ("ai_format",      [PY, "scripts/pwa_ai_format_test.py"],     "AI 排版 27"),
    ("theme_drawer",   [PY, "scripts/pwa_theme_drawer_test.py"],  "模板库全量审计 59"),
    ("export",         [PY, "scripts/pwa_export_test.py"],        "导出四件套 12"),
    ("nine",           [PY, "scripts/pwa_nine_test.py"],          "九宫格切图 15"),
    ("cover",          [PY, "scripts/pwa_cover_test.py"],         "封面 16（1 SKIP 网络）"),
    # auto_update 2026-10-25 移到 --full：它靠改写本地探针 sw.js 触发更新，
    # 本质是「本地探针机制测试」，与门禁「打线上」的定位不同；且偶发 6/7（单独跑 8/8）。
    # 待重构后再回 A 段。
    ("release_card",   [PY, "scripts/pwa_release_card_test.py"],  "发布小票 9（打线上）"),
    ("layout_compat",  [PY, "scripts/pwa_layout_compat_test.py"], "版式兼容矩阵 100"),
    ("clean_output",   [PY, "scripts/clean_output.py", "--days", "7"],
                       "output 清理预检（只预览不删）"),
]

SUITES_UI = [  # --ui 才跑：有头 UI 全量（较慢，默认打线上）
    ("headed_ui",      [PY, "scripts/pwa_headed_full_e2e.py"],
                       "有头全量 51（164套×3夹具 + 8版式 + 3开关 + 按钮 + AI mock）"),
    ("real_ai",        [PY, "scripts/pwa_real_ai_test.py"],
                       "真实 AI 17（真调 DeepSeek，需 .env 有 Key）"),
]

SUITES_FULL = [  # --full 才跑：更慢或依赖外部
    ("auto_update",    [PY, "scripts/pwa_auto_update_test.py"],   "静默自动更新 8（本地探针）"),
    ("offline",        [PY, "scripts/pwa_offline_test.py"],       "断网可用性 10"),
    ("s1s3",           [PY, "scripts/pwa_s1s3_test.py"],          "首屏不阻塞 + AI 链路 9"),
    ("light_preview",  [PY, "scripts/pwa_light_preview_test.py"], "轻量即时预览 6"),
    ("template_ux",    [PY, "scripts/pwa_template_ux_test.py"],   "模板库体验 5"),
    ("image_localize", [PY, "scripts/pwa_image_localize_test.py"], "外链图本地化 12"),
    ("online_e2e",     [PY, "scripts/pwa_online_e2e.py"],         "线上全量 97"),
]

QUICK = {"ai_preset", "ai_format", "layout_compat"}


def port_busy(port: int) -> bool:
    with socket.socket() as s:
        s.settimeout(0.4)
        return s.connect_ex(("127.0.0.1", port)) == 0


def now() -> str:
    return dt.datetime.now().strftime("%H:%M:%S")


def run_suite(name: str, cmd: list, desc: str, log) -> tuple[bool, float, str]:
    log.write(f"\n{'=' * 64}\n[{now()}] {name} — {desc}\n  $ {' '.join(str(c) for c in cmd)}\n")
    log.flush()
    t0 = time.time()
    env = dict(os.environ)
    try:
        r = subprocess.run(cmd, cwd=ROOT, env=env, stdout=subprocess.PIPE,
                           stderr=subprocess.STDOUT, text=True, encoding="utf-8",
                           errors="replace", timeout=1800)
        out = r.stdout or ""
        ok = r.returncode == 0
        tail = out.strip().splitlines()[-1] if out.strip() else "(无输出)"
    except subprocess.TimeoutExpired:
        out, ok, tail = "", False, "超时（>1800s）"
    dur = time.time() - t0
    log.write(out[-20000:] + f"\n[{now()}] {name} → {'PASS' if ok else 'FAIL'}（{dur:.0f}s）\n")
    log.flush()
    print(f"  {'PASS' if ok else 'FAIL'}  {name:<14} {dur:>6.0f}s  {desc}", flush=True)
    return ok, dur, tail


def main() -> int:
    ap = argparse.ArgumentParser()
    ap.add_argument("--full", action="store_true", help="追加离线/轻量/线上套件")
    ap.add_argument("--ui", action="store_true",
                    help="追加有头 UI 全量（约 20 分钟，打线上；需网络）")
    ap.add_argument("--quick", action="store_true", help="只跑最快核心信号")
    args = ap.parse_args()

    if not (ROOT / "pwa" / "dist" / "index.html").exists():
        print("ERROR: pwa/dist 不存在，先跑 node pwa/scripts/build.mjs", file=sys.stderr)
        return 2

    # 明确拒绝本地 Flask 版端口占用（避免误以为是 PWA 测试）
    if port_busy(5000):
        print("提示：5000 端口有服务在跑（本地 Flask 版）。本门禁不测它，不受影响。",
              flush=True)

    OUT.mkdir(parents=True, exist_ok=True)
    stamp = dt.datetime.now().strftime("%Y%m%d-%H%M%S")
    log_path = OUT / f"run-{stamp}.log"
    log = log_path.open("w", encoding="utf-8")

    if args.quick:
        suites_a = [s for s in SUITES_A if s[0] in QUICK]
        suites_ui: list = []
        suites_full: list = []
        mode = "quick"
    else:
        suites_a = SUITES_A
        suites_ui = SUITES_UI if args.ui else []
        suites_full = SUITES_FULL if args.full else []
        mode = "ui" if args.ui else ("full" if args.full else "standard")

    print(f"🛡️  PWA 门禁（{mode}）→ 日志 {log_path}", flush=True)
    print("   目标：浏览器类测试打线上 https://supersu.ccwu.cc/；不起本地 Flask 服务",
          flush=True)
    log.write(f"# gate run {stamp} mode={mode}（PWA only）\n")

    results: list[tuple[str, bool, float]] = []
    stopped_at = None

    def run_all(items) -> bool:
        nonlocal stopped_at
        for name, cmd, desc in items:
            ok, dur, _ = run_suite(name, cmd, desc, log)
            results.append((name, ok, dur))
            if not ok:
                stopped_at = name
                return False
        return True

    # ── A 段：PWA 核心 ──
    print("── A 段 · PWA 核心 ──", flush=True)
    if not run_all(suites_a):
        _cleanup_stray()
        return summarize(results, stopped_at, log, log_path)

    # ── B 段：有头 UI 全量（--ui）──
    if suites_ui and not stopped_at:
        print("── B 段 · 有头 UI 全量（--ui，打线上）──", flush=True)
        if not run_all(suites_ui):
            _cleanup_stray()
            return summarize(results, stopped_at, log, log_path)

    # ── C 段：扩展套件（--full）──
    if suites_full and not stopped_at:
        print("── C 段 · 扩展套件（--full）──", flush=True)
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
    passed = sum(1 for _, ok, _ in results if ok)
    total = len(results)
    print(f"\n{'─' * 64}", flush=True)
    for name, ok, dur in results:
        print(f"  {'✅' if ok else '❌'}  {name:<14} {dur:>6.0f}s", flush=True)
    if stopped_at:
        remaining = [n for n, _, _ in (SUITES_A + SUITES_UI + SUITES_FULL)
                     if n not in {r[0] for r in results}]
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
