#!/usr/bin/env python3
"""一键全量门禁（TST-3）：按序跑门禁套件，任一失败即停。

用法：
    .venv/Scripts/python.exe scripts/run_gates.py            # 标准门禁（本地，不联网）
    .venv/Scripts/python.exe scripts/run_gates.py --full     # 追加离线/轻量/线上套件
    .venv/Scripts/python.exe scripts/run_gates.py --quick    # 最快核心信号（约 3 分钟）

分段设计（顺序不能乱）：
  A 无服务段  test_e2e（Flask test_client）+ 4 个自起服务套件——它们自带 5000 占用检查，
             所以本段要求 5000 空闲；本段不自己起服务
  B 服务段    自己起 app.py（5000）→ test_integration + test_headed_userflow → finally 停掉
  C PWA 段    各专项脚本自起端口；release_card 默认打线上，这里改打本地 dist
             （runner 起静态服务 + 传 SUPERSU_URL），保证门禁不依赖部署状态

排除说明：
  pwa_incremental_test  需要「部署一次 → 换文件 → 再部署」两次部署之间跑，手动执行
  pwa_online_e2e        打线上站点，仅 --full 时纳入（依赖网络与线上版本）
  test_headed_pm_audit  审计套件（失败=发现问题），不是门禁，不纳入

产物：output/gate-run/run-<时间戳>.log + 终端汇总表。
"""

from __future__ import annotations

import argparse
import datetime as dt
import http.server
import functools
import os
import socket
import socketserver
import subprocess
import sys
import threading
import time
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
OUT = ROOT / "output" / "gate-run"
PY = ROOT / ".venv" / "Scripts" / "python.exe"
if not PY.exists():
    PY = Path(sys.executable)

# (名称, 命令, 说明)
SUITES_A = [
    ("e2e",            [PY, "tests/test_e2e.py"],                 "端到端 74（test_client，不开端口）"),
    ("api_e2e",        [PY, "tests/test_api_e2e.py"],             "后端 API 29（自起服务，5000 须空闲）"),
    ("headed_full",    [PY, "tests/test_headed_full_e2e.py"],     "有头全按钮 33（自起服务）"),
    ("headed_copy",    [PY, "tests/test_headed_wechat_copy.py"],  "有头复制/推送 12（自起服务）"),
    ("audit_fixes",    [PY, "tests/test_headed_audit_fixes.py"],  "审计修复专项 18（自起服务）"),
]
SUITES_B = [   # 需要 5000 有服务（runner 自己起停）
    ("integration",    [PY, "tests/test_integration.py"],         "前后端联动 35"),
    ("userflow",       [PY, "tests/test_headed_userflow.py"],     "有头用户流程 7"),
]
SUITES_C = [   # PWA 专项（各自起端口；dist 须存在）
    ("ai_preset",      [PY, "scripts/pwa_ai_preset_test.py"],     "AI 平台预设 21"),
    ("ai_format",      [PY, "scripts/pwa_ai_format_test.py"],     "AI 排版 27"),
    ("theme_drawer",   [PY, "scripts/pwa_theme_drawer_test.py"],  "模板库全量审计 43"),
    ("export",         [PY, "scripts/pwa_export_test.py"],        "导出四件套 12"),
    ("nine",           [PY, "scripts/pwa_nine_test.py"],          "九宫格切图 15"),
    ("cover",          [PY, "scripts/pwa_cover_test.py"],         "封面 16 项（1 SKIP 网络）"),
    ("auto_update",    [PY, "scripts/pwa_auto_update_test.py"],   "静默自动更新 8"),
    ("release_card",   [PY, "scripts/pwa_release_card_test.py"],  "发布小票 9（打本地 dist）"),
]
SUITES_FULL = [  # 仅 --full：更慢或依赖外部
    ("offline",        [PY, "scripts/pwa_offline_test.py"],       "断网可用性 10"),
    ("s1s3",           [PY, "scripts/pwa_s1s3_test.py"],          "首屏不阻塞 + AI 链路 9"),
    ("light_preview",  [PY, "scripts/pwa_light_preview_test.py"], "轻量即时预览 6"),
    ("template_ux",    [PY, "scripts/pwa_template_ux_test.py"],   "模板库体验 5"),
    ("image_localize", [PY, "scripts/pwa_image_localize_test.py"], "外链图本地化 12"),
    ("online_e2e",     [PY, "scripts/pwa_online_e2e.py"],         "线上全量 97（打线上站点）"),
]
QUICK = {"e2e", "api_e2e", "ai_preset", "ai_format"}

STATIC_PORT = 8899


def port_busy(port: int) -> bool:
    with socket.socket() as s:
        s.settimeout(0.4)
        return s.connect_ex(("127.0.0.1", port)) == 0


def now() -> str:
    return dt.datetime.now().strftime("%H:%M:%S")


def run_suite(name: str, cmd: list, desc: str, log, env_extra: dict | None = None) -> tuple[bool, float, str]:
    log.write(f"\n{'=' * 64}\n[{now()}] {name} — {desc}\n  $ {' '.join(str(c) for c in cmd)}\n")
    log.flush()
    t0 = time.time()
    env = dict(os.environ)
    if env_extra:
        env.update(env_extra)
    try:
        r = subprocess.run(cmd, cwd=ROOT, env=env, stdout=subprocess.PIPE,
                           stderr=subprocess.STDOUT, text=True, encoding="utf-8",
                           errors="replace", timeout=900)
        out = r.stdout or ""
        ok = r.returncode == 0
        tail = out.strip().splitlines()[-1] if out.strip() else "(无输出)"
    except subprocess.TimeoutExpired:
        out, ok, tail = "", False, "超时（>900s）"
    dur = time.time() - t0
    log.write(out[-20000:] + f"\n[{now()}] {name} → {'PASS' if ok else 'FAIL'}（{dur:.0f}s）\n")
    log.flush()
    print(f"  {'PASS' if ok else 'FAIL'}  {name:<14} {dur:>6.0f}s  {desc}", flush=True)
    return ok, dur, tail


def main() -> int:
    ap = argparse.ArgumentParser()
    ap.add_argument("--full", action="store_true", help="追加离线/轻量/线上套件")
    ap.add_argument("--quick", action="store_true", help="只跑最快核心信号")
    args = ap.parse_args()

    if not (ROOT / "pwa" / "dist" / "index.html").exists():
        print("ERROR: pwa/dist 不存在，先跑 node pwa/scripts/build.mjs", file=sys.stderr)
        return 2

    OUT.mkdir(parents=True, exist_ok=True)
    stamp = dt.datetime.now().strftime("%Y%m%d-%H%M%S")
    log_path = OUT / f"run-{stamp}.log"
    log = log_path.open("w", encoding="utf-8")

    if args.quick:
        suites_a = [s for s in SUITES_A if s[0] in QUICK]
        suites_b: list = []
        suites_c = [s for s in SUITES_C if s[0] in QUICK]
        suites_full: list = []
        mode = "quick"
    else:
        suites_a, suites_b, suites_c = SUITES_A, SUITES_B, SUITES_C
        suites_full = SUITES_FULL if args.full else []
        mode = "full" if args.full else "standard"

    if port_busy(5000):
        print("ERROR: 端口 5000 已被占用——A 段自起服务套件会 [ABORT]。先停掉占用进程再跑。",
              file=sys.stderr)
        return 2

    print(f"🛡️  一键门禁（{mode}）→ 日志 {log_path}", flush=True)
    log.write(f"# gate run {stamp} mode={mode}\n")

    results: list[tuple[str, bool, float]] = []
    stopped_at = None

    def run_all(items, env_extra=None):
        nonlocal stopped_at
        for name, cmd, desc in items:
            ok, dur, _ = run_suite(name, cmd, desc, log, env_extra)
            results.append((name, ok, dur))
            if not ok:
                stopped_at = name
                return False
        return True

    # ── A 段：无服务 ──
    print("── A 段 · 无服务 ──", flush=True)
    if not run_all(suites_a):
        return summarize(results, stopped_at, log, log_path)

    # ── B 段：自起 app.py ──
    if suites_b:
        print("── B 段 · 自起 Flask 服务（5000） ──", flush=True)
        proc = subprocess.Popen([PY, "app.py"], cwd=ROOT,
                                stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL)
        try:
            for _ in range(60):
                if not port_busy(5000):
                    break
                time.sleep(0.5)
            else:
                print("ERROR: app.py 60s 内没起来", file=sys.stderr)
                proc.terminate()
                return summarize(results, "app.py 启动失败", log, log_path)
            if not run_all(suites_b):
                return summarize(results, stopped_at, log, log_path)
        finally:
            proc.terminate()
            try:
                proc.wait(timeout=10)
            except subprocess.TimeoutExpired:
                proc.kill()

    # ── C 段：PWA 专项（release_card 打本地 dist） ──
    print("── C 段 · PWA 专项 ──", flush=True)
    srv = socketserver.ThreadingTCPServer(("127.0.0.1", STATIC_PORT),
                                          functools.partial(http.server.SimpleHTTPRequestHandler,
                                                            directory=str(ROOT / "pwa" / "dist")))
    srv.daemon_threads = True
    threading.Thread(target=srv.serve_forever, daemon=True).start()
    try:
        for name, cmd, desc in suites_c:
            extra = {"SUPERSU_URL": f"http://127.0.0.1:{STATIC_PORT}"} if name == "release_card" else None
            ok, dur, _ = run_suite(name, cmd, desc, log, extra)
            results.append((name, ok, dur))
            if not ok:
                stopped_at = name
                break
        if not stopped_at and suites_full:
            print("── D 段 · 扩展套件（--full） ──", flush=True)
            run_all(suites_full)
    finally:
        srv.shutdown()

    return summarize(results, stopped_at, log, log_path)


def summarize(results, stopped_at, log, log_path) -> int:
    passed = sum(1 for _, ok, _ in results if ok)
    total = len(results)
    print(f"\n{'─' * 64}", flush=True)
    for name, ok, dur in results:
        print(f"  {'✅' if ok else '❌'}  {name:<14} {dur:>6.0f}s", flush=True)
    if stopped_at:
        remaining = [n for n, _, _ in (SUITES_A + SUITES_B + SUITES_C + SUITES_FULL) if n not in
                     {r[0] for r in results}]
        print(f"\n⛔ 在 {stopped_at} 处停止（失败即停）。未跑：{', '.join(remaining) or '无'}", flush=True)
    else:
        print(f"\n🎉 全部门禁通过：{passed}/{total}", flush=True)
    print(f"日志：{log_path}", flush=True)
    log.write(f"\n# summary {passed}/{total} stopped_at={stopped_at}\n")
    log.close()
    return 0 if passed == total else 1


if __name__ == "__main__":
    sys.exit(main())
