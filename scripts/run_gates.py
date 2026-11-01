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
  本地 Flask 版套件——**已于 2026-10-28 随本地版封存**（整个 tests/ 移出工作区，
  见 ARCHIVE.md）。不要再照旧文档跑 `python tests/test_e2e.py`，那个文件已不存在。
  pwa_incremental_test  需要「部署一次 → 换文件 → 再部署」两次部署之间跑，手动执行
  test_headed_pm_audit  审计套件（失败=发现问题），不是门禁，不纳入

产物：output/gate-run/run-<时间戳>.log + 终端汇总表（含 target 列）。
"""

from __future__ import annotations

import argparse
import concurrent.futures
import fnmatch
import datetime as dt
import os
import socket
import subprocess
import sys
import threading
import time
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
OUT = ROOT / "output" / "gate-run"
PY = ROOT / ".venv" / "Scripts" / "python.exe"

# node 解析：优先用托管版本；模板单测不需要浏览器，用它最快
def _find_node():
    cands = [
        Path.home() / ".workbuddy" / "binaries" / "node" / "versions" / "22.22.2-6" / "node.exe",
        Path("C:/Program Files/nodejs/node.exe"),
    ]
    for c in cands:
        if c.exists():
            return c
    return "node"


NODE = _find_node()
if not PY.exists():
    PY = Path(sys.executable)

# (名称, 命令, 说明, target)
# target 含义：local = 本地 dist / in-process = 进程内直调 core / online = 线上服务器
SUITES_LOCAL = [  # 本地层（默认）：结果与当前工作区一一对应，断网可跑
    ("ai_preset",      [PY, "scripts/pwa_ai_preset_test.py", "--local"], "AI 平台预设 21", "local"),
    ("ai_format",      [PY, "scripts/pwa_ai_format_test.py", "--local"], "AI 排版 27", "local"),
    ("theme_drawer",   [PY, "scripts/pwa_theme_drawer_test.py", "--local"], "模板库全量审计 59（含 164 套逐个应用，重）", "local"),
    # 2026-11-02 新增：模板库**快速**版 —— 跳过「164 套逐个应用」那段（主要耗时来源），
    # 只验结构 + 族/色逻辑。前端改动默认跑这个，不跑上面那个全量版。
    ("theme_drawer_smoke", [PY, "scripts/pwa_theme_drawer_test.py", "--local", "--smoke"],
                       "模板库快速（结构+族/色，跳过 164 套遍历）", "local"),
    ("export",         [PY, "scripts/pwa_export_test.py"],        "导出四件套 12", "local"),
    ("nine",           [PY, "scripts/pwa_nine_test.py"],          "九宫格切图 15", "local"),
    ("cover",          [PY, "scripts/pwa_cover_test.py"],         "封面 30（含实时预览 3 项）", "local"),
    # 2026-11-02 新增：封面**快速**版 —— 只跑页面结构/入口/版式卡/配色点/尺寸门控，
    # 跳过逐版式真出图（占该套件 80% 耗时）。前端改动默认跑这个。
    ("cover_smoke",    [PY, "scripts/pwa_cover_test.py", "--smoke"],
                       "封面快速（结构+入口+版式卡，跳过逐版式出图）", "local"),
    # 2026-10-31 接入（design §9 门禁行）：长图文产物级断言 ——
    # 分页完整性（逐句落版）/ 内容字号 ≥28px / 填充率按 §6 分档 / 无溢出 / 导出真出图。
    # 原「末页 ≥75%」一刀切口径已作废（§6 实测：大字版式占高少是「大字」的代价）。
    ("longform",       [PY, "scripts/pwa_longform_test.py"],
                       "长图文产物级（分页/字号/填充分档/无溢出/导出）", "local"),
    # 2026-10-31 接入：预处理四模式（auto/conservative/longform/tutorial）——
    # 选择器/默认值/产物级断言（教程 h2+列表块、长文 h3、auto 判定反馈 chip、持久化）。
    ("ppmode",         [PY, "scripts/pwa_ppmode_test.py"],
                       "预处理四模式 11（产物级）", "local"),
    ("cover_tpl",      [str(NODE), "scripts/cover_tpl_unit.mjs"], "封面模板单测 35", "in-process"),
    # 2026-10-29 接入：封面风格规范校验（对比度/字号/字重字距/遮罩峰值）。
    # 此前这把尺子存在但没进门禁 → 10 套模板遮罩峰值 0.70（超规范 2.3 倍）躺了很久。
    # --src pwa = 只看在用的资产（public/cover-templates + pwa/src/cover）；
    # 原型（docs/prototypes，已废弃）不计入，避免历史遗留把门禁长期染红。
    ("cover_spec",     [PY, "scripts/cover_style_check.py", "--src", "pwa", "--strict"],
                       "封面规范（对比度/字号/遮罩峰值 24）", "in-process"),
    ("ai_plan",        [str(NODE), "scripts/ai_plan_unit.mjs"],   "AI 排版结构单测 20", "in-process"),
    ("theme_spec",     [PY, "scripts/audit_theme_spec.py"],       "模板配色审计（对照归藏规范）", "in-process"),
    ("theme_contrast", [PY, "scripts/theme_contrast_audit.py"],   "标题/正文对比度 164 套", "in-process"),
    ("layout_compat",  [PY, "scripts/pwa_layout_compat_test.py"], "版式兼容矩阵 100", "in-process"),
    ("update_panel",   [PY, "scripts/pwa_update_panel_test.py"],
                       "更新面板（检查更新 / 一键更新 / 本次更新条数 / 反馈入口）11", "local"),
    # 2026-10-30 接入：产物级断言（剪贴板真实内容 / 下载文件真实字节 / 清除后无残留）。
    # 此前这类断言全部缺失 —— 现有套件只查「按钮可用 / toast 出现」，
    # 导致「清除本地数据漏删 API Key」这个 P0 隐私缺陷长期躺在代码里没被任何门禁发现。
    ("artifact_assert", [PY, "scripts/pwa_artifact_assert_test.py"],
                       "产物级断言（剪贴板富文本 / 导出文件字节 / 清除无残留）14", "local"),
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

# 可以同时跑的套件：彼此端口/浏览器/临时目录互不干扰。
# 挑的是耗时最大的两个（实测 cover 约 280s、theme_drawer 约 170s，合计占本地层 75%）。
# ⚠️ 只放「起自己的静态服务 + 自己的 Playwright 实例」的套件；
#    端口已经改为系统分配（bind 0），所以并行不会撞端口。
PARALLEL_SAFE = {"cover", "theme_drawer"}


# ── 有头（E2E）套件：只在**真的改了前端**时才跑 ────────────────────
# 2026-11-02 用户定调：E2E 跑不跑由人决定，不默认全量；
# 有头测试只在动了前端（UI/样式/DOM）时才需要，改脚本、改文档、改引擎
# 都不该拉起 Chrome。
#
# 划分依据（不是拍脑袋，看各套件实际干什么）：
#   · 纯进程内/静态检查（ai_plan / theme_spec / cover_spec / theme_contrast /
#     cover_tpl / doc_sync / clean_output）→ 毫秒级，永远跑，不算有头。
#   · 需要起浏览器但测的是**非 UI**逻辑（AI 请求格式、导出字节、
#     九宫格切图像素、外链图本地化）→ 归 headless，前端一改就跟上。
#   · 重 E2E（逐套主题 164 / 逐版式出图 51）→ 最贵，默认**不跑**，
#     只有显式 --ui / --full-gates 才跑。
HEAVY_E2E = {"cover", "theme_drawer"}

# 判定「这次改动是否动了前端」——命中即视为前端改动，拉起有头浏览器
FRONTEND_PATHS = (
    "pwa/src/",
    "pwa/index.html",
    "pwa/public/themes/",
    "core/format_engine.py",      # 排版引擎，直接决定渲染结果
    "core/preprocessor.py",
    "public/themes/",
    "pwa/scripts/build.mjs",
)


# ── 按改动面选套件（2026-11-01）──────────────────────────────────
# 为什么：改一行 .md 和改排版引擎跑同一套 10 分钟门禁，这是设计错误。
# 用户明确要求「全量 E2E 只在我主动要的时候才做」，所以默认按改动选。
#
# 判据：只看**未提交改动**。已提交的改动必然已被 dist 构建覆盖（preflight 第 0 步
# 会拦住 dist 过期），所以「还没被测过的」就是工作区里那些。
#
# 安全策略（宁可多跑，不可漏测）：
#   ① 命中 CORE_ALWAYS → 本地层**全跑**（改这些等于改一切）
#   ② 命中规则 → 只跑对应套件
#   ③ 一条规则都没命中（不知道改了啥）→ 本地层全跑
#   ④ 工作区干净 → 跑最小核心信号，不空跑
CORE_ALWAYS = (
    "core/",                     # 排版引擎/预处理器：所有渲染相关
    "pwa/src/app.js",            # 主交互
    "pwa/src/style.css",
    "pwa/index.html",
    "pwa/public/themes/",         # 164 套主题数据
    "pwa/scripts/build.mjs",      # 构建脚本一变，dist 全变
    "pwa/public/sw.js",
)

# (路径前缀/glob, 套件集合)。用 fnmatch 匹配，前缀写 "dir/*"。
CHANGE_RULES = [
    ("pwa/src/cover/",        {"cover_smoke", "cover_tpl", "cover_spec"}),
    ("public/cover-templates/", {"cover_smoke", "cover_tpl", "cover_spec"}),
    ("pwa/public/cover-templates/", {"cover_smoke", "cover_tpl", "cover_spec"}),
    ("pwa/src/nine.js",       {"nine"}),
    ("pwa/src/export.js",     {"export", "artifact_assert"}),
    ("pwa/src/images.js",     {"image_localize"}),
    ("pwa/src/ai.js",         {"ai_preset", "ai_format"}),
    ("pwa/src/bridge.js",     {"ai_format", "layout_compat"}),
    ("pwa/src/engine.worker.js", {"longform", "ppmode", "layout_compat"}),
    ("pwa/src/light.js",      {"light_preview"}),
    ("pwa/src/update/",       {"update_panel", "auto_update"}),
    ("pwa/src/longform",      {"longform"}),
    ("pwa/src/cover.css",     {"cover_smoke"}),
    ("core/preprocessor.py",  {"ppmode", "longform", "ai_format", "layout_compat"}),
    ("pwa/scripts/changelog_milestones.json", {"update_panel", "doc_sync"}),
    ("pwa/public/changelog.json", {"update_panel"}),
    ("pwa/version.json",      {"update_panel"}),
    ("scripts/pwa_",          set()),      # 改测试脚本本身不用跑测试
    ("scripts/gen_changelog.py", {"doc_sync"}),
    ("docs/",                 {"doc_sync"}),
    ("AGENTS.md",             {"doc_sync"}),
    ("README.md",             {"doc_sync"}),
    ("CLOSURE.md",            {"doc_sync"}),
    ("HANDOFF.md",            {"doc_sync"}),
    ("STATE.md",              {"doc_sync"}),
]

# 工作区干净（没有未提交改动）时跑的最小集：几秒级，确认基本盘没坏
CLEAN_MIN = {"doc_sync", "clean_output"}


def changed_paths() -> list[str]:
    """工作区里未提交的改动路径（含未跟踪文件）。"""
    try:
        r = subprocess.run(["git", "status", "--porcelain", "--untracked-files=all"],
                           cwd=ROOT, capture_output=True, text=True,
                           encoding="utf-8", errors="replace")
    except OSError:
        return []
    paths = []
    for line in (r.stdout or "").splitlines():
        if len(line) < 4:
            continue
        p = line[3:].strip()
        if " -> " in p:                      # rename: 取新路径
            p = p.split(" -> ")[-1]
        paths.append(p.strip('"'))
    return paths


def is_frontend_change(paths: list[str]) -> bool:
    """这次改动是否动了前端（UI/样式/DOM/渲染引擎）。"""
    norm = [p.replace("\\", "/") for p in paths]
    return any(p.startswith(f) or p == f for p in norm for f in FRONTEND_PATHS)


def select_suites(paths: list[str]) -> tuple[set[str], str, bool]:
    """按改动路径决定跑哪些套件。

    返回 (套件名集合, 决策说明, 是否前端改动)。
    套件名集合为空 = 本地层全跑（但**仍会剔除 HEAVY_E2E**，见 main）。

    三条硬规则（2026-11-02 用户定调）：
      ① 重 E2E（cover / theme_drawer）**默认永不自动跑** —— 只认 --ui / --full-gates。
      ② 没动前端 → 一个浏览器都不拉，只跑进程内检查。
      ③ 动了前端 → 跑与该模块相关的有头套件（仍不含重 E2E）。
    """
    if not paths:
        return set(CLEAN_MIN), "工作区干净（无未提交改动）→ 只跑静态检查", False

    norm = [p.replace("\\", "/") for p in paths]
    frontend = is_frontend_change(paths)

    core_hit = [p for p in norm if any(p.startswith(c) or p == c for c in CORE_ALWAYS)]
    if core_hit:
        sample = ", ".join(core_hit[:3])
        more = "" if len(core_hit) <= 3 else f" 等 {len(core_hit)} 个"
        return (set(), f"命中核心路径（{sample}{more}）→ 本地层全跑"
                       f"（重 E2E 仍需 --full-gates）", frontend)

    picked: set[str] = set()
    matched_any = False
    for path in norm:
        for rule, suites in CHANGE_RULES:
            if path == rule or path.startswith(rule) or fnmatch.fnmatch(path, rule):
                matched_any = True
                picked |= suites
                break

    if not matched_any:
        return (set(), f"无法判断改动面（{len(norm)} 个文件）→ 本地层全跑"
                       f"（重 E2E 仍需 --full-gates）", frontend)

    if not picked:
        return set(CLEAN_MIN), "改动只在测试脚本本身 → 只跑静态检查", frontend

    picked |= {"doc_sync"}
    return picked, f"按改动面选中 {len(picked)} 个套件", frontend


def port_busy(port: int) -> bool:
    with socket.socket() as s:
        s.settimeout(0.4)
        return s.connect_ex(("127.0.0.1", port)) == 0


def now() -> str:
    return dt.datetime.now().strftime("%H:%M:%S")


# 并行跑套件时，日志文件与终端输出必须串行化，否则多行交错成一片糊
_LOG_LOCK = threading.Lock()


def run_step(name: str, cmd: list, desc: str, target: str, log, timeout: int = 1800):
    with _LOG_LOCK:
        log.write(f"\n{'=' * 64}\n[{now()}] {name} — {desc}（{target}）\n"
                  f"  $ {' '.join(str(c) for c in cmd)}\n")
        log.flush()
    t0 = time.time()
    env = dict(os.environ)
    # ⚠️ 2026-11-02：必须显式给**子进程**钉 UTF-8。
    # 父进程自己 reconfigure(stdout) 只影响父进程，不继承给子进程。
    # 而门禁是用管道接子进程输出的（stdout=PIPE），Windows 下子进程走到管道
    # 时仍是 GBK —— 任何打印 ✓ / ✅ / 🛡️ 的套件都会 UnicodeEncodeError 退出 1，
    # 看上去像「测试失败」。实测 longform / theme_spec / doc_sync 三项同时假红，
    # 单跑全过，就是这一个原因。
    env["PYTHONIOENCODING"] = "utf-8"
    env["PYTHONUTF8"] = "1"
    try:
        r = subprocess.run(cmd, cwd=ROOT, env=env, stdout=subprocess.PIPE,
                           stderr=subprocess.STDOUT, text=True, encoding="utf-8",
                           errors="replace", timeout=timeout)
        out = r.stdout or ""
        ok = r.returncode == 0
    except subprocess.TimeoutExpired:
        out, ok = "", False
    dur = time.time() - t0
    with _LOG_LOCK:
        log.write(out[-20000:] + f"\n[{now()}] {name} → {'PASS' if ok else 'FAIL'}（{dur:.0f}s）\n")
        log.flush()
        print(f"  {'PASS' if ok else 'FAIL'}  {name:<14} {dur:>6.0f}s  [{target}]  {desc}", flush=True)
    return ok, dur


def main() -> int:
    # ⚠️ 必须在任何 print 之前：门禁的输出常被别的脚本用管道接走
    # （release.py 的 run() 就是 capture_output=True）。Windows 下管道默认走
    # GBK，而本文件开头就要打印 🛡️ —— 2026-11-01 实测：release.py 调门禁
    # 必然 UnicodeEncodeError 退出 1，一键发版整个是坏的，且报错看起来像门禁失败。
    # 单跑没事（控制台是 UTF-8），所以这个坑一直没被发现。
    for stream in (sys.stdout, sys.stderr):
        try:
            stream.reconfigure(encoding="utf-8", errors="replace")
        except Exception:
            pass

    ap = argparse.ArgumentParser()
    ap.add_argument("--full", action="store_true", help="追加扩展套件")
    ap.add_argument("--ui", action="store_true",
                    help="追加有头 UI 全量（约 20 分钟，用本地 dist；需网络与真 Key）")
    ap.add_argument("--online", action="store_true",
                    help="只跑线上冒烟（打 https://supersu.ccwu.cc/，部署后验证用；不重跑本地层）")
    ap.add_argument("--quick", action="store_true", help="只跑最快核心信号")
    ap.add_argument("--local", action="store_true",
                    help="本地层全跑（不按改动选套件，也不含扩展层）——发版时用")
    ap.add_argument("--all", action="store_true",
                    help="全量 E2E（本地层 + 线上层 + 有头层 + 扩展层），只在明确需要时用")
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
        pick_note = "手动 --quick"
    elif args.local and not (args.all or args.full or args.ui or args.online):
        # --local = 本地层全跑（含重 E2E）。这是「我要结结实实全量」的显式意图，
        # 对应 release.py --full-gates。日常默认档已不含重 E2E。
        suites_local = SUITES_LOCAL
        suites_online = []
        suites_ui = []
        suites_full = []
        mode = "local-all"
        pick_note = "手动 --local：本地层全跑（含重 E2E）"
    elif args.online and not (args.all or args.full or args.ui):
        # --online 单独用 = 「部署后验证」：只跑线上层。
        # 原来它会先把本地层整份重跑一遍（约 10 分钟），而部署前刚跑过 ——
        # 纯重复。dist 是否新鲜仍由第 0 步 preflight 把关。
        suites_local = []
        suites_online = SUITES_ONLINE
        suites_ui = []
        suites_full = []
        mode = "online"
        pick_note = "只跑线上层（部署后验证，不重跑本地）"
    elif args.all or args.full or args.ui:
        # 显式要全量才全量：--all / --full / --ui 都算「用户主动要」
        suites_local = SUITES_LOCAL
        suites_online = SUITES_ONLINE if args.all else []
        suites_ui = SUITES_UI if (args.ui or args.all) else []
        suites_full = SUITES_FULL if (args.full or args.all) else []
        mode = "full" if args.all else "standard"
        if args.ui and not args.all:
            mode += "+ui"
        if args.full and not args.all:
            mode += "+full"
        pick_note = "手动指定全量层"
    else:
        # ★ 默认：按工作区实际改动面选套件。改文档就只跑文档检查，改封面才跑封面。
        #   全量 E2E 只在用户主动要（--all / --full / --ui）时才跑。
        chosen, pick_note, is_fe = select_suites(changed_paths())
        suites_local = [s for s in SUITES_LOCAL if not chosen or s[0] in chosen]
        # ★ 重 E2E 默认永不自动跑：cover / theme_drawer 只有 --ui / --full-gates 才跑。
        #   实测它们占本地层 75%（281s + 167s），是「小改动也要 10 分钟」的全部原因。
        dropped = [s[0] for s in suites_local if s[0] in HEAVY_E2E]
        if dropped:
            suites_local = [s for s in suites_local if s[0] not in HEAVY_E2E]
            pick_note += f"；已跳过重 E2E（{', '.join(dropped)}，加 --full-gates 才跑）"
        # ★ 没动前端就不拉浏览器：只留进程内/静态检查
        if not is_fe:
            static_only = {"doc_sync", "clean_output", "cover_tpl", "cover_spec",
                           "ai_plan", "theme_spec", "theme_contrast"}
            before = len(suites_local)
            suites_local = [s for s in suites_local if s[0] in static_only]
            if before != len(suites_local):
                pick_note += "；未动前端 → 不跑有头套件"
        suites_online = []
        suites_ui = []
        suites_full = []
        mode = "changed" if chosen else "all-local"

    print(f"🛡️  PWA 门禁（{mode}）→ 日志 {log_path}", flush=True)
    print(f"   套件选择：{pick_note}", flush=True)
    print(f"   本地层 {len(suites_local)} 个套件"
          + ("；全量 E2E 请显式加 --all" if mode != "full" else ""), flush=True)
    log.write(f"# gate run {stamp} mode={mode} pick={pick_note}\n")

    results: list[tuple[str, bool, float, str]] = []
    failed: list[str] = []

    def run_all(items, *, parallel_safe=()) -> bool:
        """跑一组套件。失败**不中断**，记下来继续跑后面的。

        2026-11-01 改：原来是「失败即停」。但套件之间没有依赖关系，停掉只会
        丢掉后面的信息 —— 实测一次抖动（端口 TIME_WAIT）就把剩下 12 个套件
        全跳过了，看日志的人还以为「只跑到第 8 个是正常的」。现在一次跑完，
        末尾统一汇总所有失败项。

        parallel_safe：可并行的套件名（彼此端口/资源不冲突）。
        用时最长的那两个（cover 约 280s、theme_drawer 约 170s）一起跑，
        本地层总时长从约 10 分钟降到约 5 分钟。
        """
        ordered: list[tuple[str, bool, float, str]] = []
        par = [it for it in items if it[0] in parallel_safe]
        ser = [it for it in items if it[0] not in parallel_safe]

        def one(item):
            name, cmd, desc, target = item
            ok, dur = run_step(name, cmd, desc, target, log)
            return (name, ok, dur, target)

        # 并行组先起，串行组同时按序跑（两者端口互不重叠）
        with concurrent.futures.ThreadPoolExecutor(max_workers=max(1, len(par))) as pool:
            futures = {pool.submit(one, it): it for it in par}
            for it in ser:
                ordered.append(one(it))
            for fut in concurrent.futures.as_completed(futures):
                ordered.append(fut.result())

        # 按清单原顺序归位，汇总表才不会因完成先后而抖动
        index = {it[0]: i for i, it in enumerate(items)}
        ordered.sort(key=lambda r: index.get(r[0], 0))
        for name, ok, dur, target in ordered:
            results.append((name, ok, dur, target))
            if not ok:
                failed.append(name)
        return not failed

    # ── 0 段：前置检查（dist 新鲜度 / 工作区 / 线上）──
    # 唯一保留「失败即停」的一段：dist 不新鲜时，后面所有套件测的都是旧代码，
    # 跑出来既慢又误导。
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
            return summarize(results, ["preflight"], log, log_path)

    # ── 1 段：本地层 ──
    if suites_local:
        print("── 1 段 · 本地层（测当前代码）──", flush=True)
        run_all(suites_local, parallel_safe=PARALLEL_SAFE)
    else:
        print("── 1 段 · 本地层 —— 本次跳过（--online 只验证线上）", flush=True)

    # ── 2 段：线上层（--online，部署后）──
    if suites_online:
        print("── 2 段 · 线上层（--online，打线上）──", flush=True)
        run_all(suites_online)

    # ── 3 段：有头层（--ui）──
    if suites_ui:
        print("── 3 段 · 有头层（--ui，本地 dist）──", flush=True)
        run_all(suites_ui)

    # ── 4 段：扩展层（--full）──
    if suites_full:
        print("── 4 段 · 扩展层（--full）──", flush=True)
        run_all(suites_full)

    _cleanup_stray()
    return summarize(results, failed, log, log_path)


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


def summarize(results, failed, log, log_path) -> int:
    passed = sum(1 for _, ok, _, _ in results if ok)
    total = len(results)
    print(f"\n{'─' * 72}", flush=True)
    print(f"  {'结果':<5} {'套件':<14} {'耗时':>7}  target", flush=True)
    for name, ok, dur, target in results:
        print(f"  {'✅' if ok else '❌':<5} {name:<14} {dur:>6.0f}s  {target}", flush=True)
    if failed:
        print(f"\n⛔ {len(failed)} 项失败（其余仍已跑完并计入结果）：", flush=True)
        for name in failed:
            print(f"     · {name}", flush=True)
        print(f"   完整输出见日志（每项失败原因都在对应小节里）", flush=True)
    else:
        print(f"\n🎉 全部门禁通过：{passed}/{total}", flush=True)
    print(f"日志：{log_path}", flush=True)
    log.write(f"\n# summary {passed}/{total} stopped_at={','.join(failed) or 'None'}\n")
    log.close()
    return 0 if not failed else 1


if __name__ == "__main__":
    sys.exit(main())
