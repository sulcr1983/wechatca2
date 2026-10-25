#!/usr/bin/env python3
"""一键全测入口（2026-10-24）

给不熟悉一堆脚本参数的人用：选一个档位，自动跑对应套件，最后给一张汇总表。

档位（按耗时递增）：
  quick    ~3 分钟   核心信号：e2e + api_e2e + AI 预设/排版
  normal   ~8 分钟   标准门禁：quick + 有头全按钮 + 模板库 + 版式矩阵 + 导出/封面等
  ui       ~20 分钟  normal + **有头 UI 全量**（164 套模板 × 3 类夹具、8 版式、3 段落开关、全部按钮、AI mock 态）
  all      ~35 分钟  ui + 真实 AI（真调 DeepSeek）+ 离线/轻量/线上套件

设计原则：
  - **不重复实现**：全部委托给已有的 scripts/run_gates.py（唯一真源），本脚本只是菜单
  - 每个档位都明确告诉你「跑了什么、没跑什么、为什么」
  - 真实 AI 需要 .env 里的 Key，没有会明确提示而不是静默跳过

用法：
    python scripts/test_all.py              # 交互式选档位
    python scripts/test_all.py quick        # 直接跑某档
    python scripts/test_all.py ui --yes     # 跳过确认
    python scripts/test_all.py --list       # 只列档位不跑
"""

from __future__ import annotations

import argparse
import subprocess
import sys
import time
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
PY = ROOT / ".venv" / "Scripts" / "python.exe"
if not PY.exists():
    PY = Path(sys.executable)
GATES = ROOT / "scripts" / "run_gates.py"

TIERS = {
    "quick": {
        "args": ["--quick"],
        "mins": "约 3 分钟",
        "what": "前置检查 + AI 预设(21) + AI 排版(27) + 版式矩阵(100)（测本地 dist）",
        "skip": "模板全量 / 有头 UI / 真实 AI / 线上套件",
    },
    "normal": {
        "args": [],
        "mins": "约 6 分钟",
        "what": "quick 全部 + 模板库全量(59) + 导出(12) + 九宫格(15) + 封面(16) + output 预检\n"
                "        —— 全部测**本地 dist / 进程内源码**，断网可跑，结果与当前工作区一一对应",
        "skip": "有头 UI 全量 / 真实 AI / 线上套件（需要时用 ui / all）",
    },
    "ui": {
        "args": ["--ui"],
        "mins": "约 20 分钟",
        "what": "normal 全部 + **有头 UI 全量(51)**：164 套模板 × 3 类夹具 + 8 种版式\n"
                "        + 3 个段落样式开关 + 全部按钮 + AI mock 态\n"
                "        + **真实 AI(17)**（真调 DeepSeek，需 .env 有 Key）",
        "skip": "线上层（部署后单独跑 --online）",
    },
    "all": {
        "args": ["--full", "--ui", "--online"],
        "mins": "约 35 分钟",
        "what": "ui 全部 + 扩展套件（自动更新 / 断网 / 首屏 / 轻量预览 / 模板体验 / 外链图）\n"
                "        + **线上层**（发布小票 9 + 线上全量 97，打 https://supersu.ccwu.cc/）",
        "skip": "无（这是最全档）",
    },
}
ORDER = ["quick", "normal", "ui", "all"]


def has_ai_key() -> bool:
    env = ROOT / ".env"
    if not env.exists():
        return False
    try:
        txt = env.read_text(encoding="utf-8", errors="replace")
    except Exception:
        return False
    for line in txt.splitlines():
        line = line.strip()
        if line.startswith("DEEPSEEK_API_KEY=") and line.split("=", 1)[1].strip():
            return True
    return False


def show_list() -> None:
    print("可用档位（按耗时递增）：\n")
    for k in ORDER:
        t = TIERS[k]
        print(f"  {k:<8} {t['mins']}")
        # 多行内容逐行加缩进，避免第二行顶格
        for i, line in enumerate(t["what"].split("\n")):
            print(("           跑：" if i == 0 else "               ") + line.strip())
        for i, line in enumerate(t["skip"].split("\n")):
            print(("           不跑：" if i == 0 else "               ") + line.strip())
        print()
    print("真实 AI 需要 .env 里的 DEEPSEEK_API_KEY："
          + ("✅ 已配置" if has_ai_key() else "❌ 未配置（ui / all 档的真实 AI 会失败）"))


def pick() -> str:
    show_list()
    print("\n选哪个？（回车 = normal）", end=" ")
    try:
        ans = input().strip().lower()
    except (EOFError, KeyboardInterrupt):
        print()
        return "normal"
    return ans if ans in TIERS else "normal"


def main() -> int:
    try:
        sys.stdout.reconfigure(encoding="utf-8", errors="replace")
    except Exception:
        pass

    ap = argparse.ArgumentParser()
    ap.add_argument("tier", nargs="?", default="", choices=[""] + ORDER)
    ap.add_argument("--list", action="store_true", help="只列档位不跑")
    ap.add_argument("--yes", action="store_true", help="跳过确认")
    args = ap.parse_args()

    if args.list:
        show_list()
        return 0

    tier = args.tier or pick()
    t = TIERS[tier]

    print(f"\n{'=' * 62}")
    print(f"档位：{tier}（{t['mins']}）")
    print(f"会跑：{t['what']}")
    print(f"不跑：{t['skip']}")
    print(f"{'=' * 62}")

    if tier in ("ui", "all") and not has_ai_key():
        print("\n⚠️  .env 里没有 DEEPSEEK_API_KEY —— 真实 AI 那项会失败。")
        print("    要么先配置 Key，要么改用 normal 档（不含真实 AI）。")
        if not args.yes:
            print("\n继续？(y/N) ", end="")
            try:
                if input().strip().lower() not in ("y", "yes"):
                    print("已取消")
                    return 1
            except (EOFError, KeyboardInterrupt):
                print("\n已取消")
                return 1

    cmd = [str(PY), str(GATES)] + t["args"]
    print(f"\n$ {' '.join(cmd)}\n", flush=True)

    t0 = time.time()
    try:
        rc = subprocess.call(cmd, cwd=str(ROOT))
    except KeyboardInterrupt:
        print("\n已中断")
        return 130
    dur = time.time() - t0

    print(f"\n{'=' * 62}")
    print(f"{'✅ 全部通过' if rc == 0 else '❌ 有失败项'}   档位={tier}   耗时 {dur / 60:.1f} 分钟")
    print("详细日志：output/gate-run/ 里最新一份")
    if rc != 0:
        print("\n失败排查建议：")
        print("  1. 看 output/gate-run/ 最新日志里标 FAIL 的那段")
        print("  2. 单独重跑该套件（日志里会打印完整命令）")
        print("  3. 若是有头 UI（ui 档）失败，先确认系统 Chrome 可用、端口 809x 未被占用")
    print(f"{'=' * 62}")
    return rc


if __name__ == "__main__":
    sys.exit(main())
