#!/usr/bin/env python3
"""文档一致性校验（P1，2026-10-25）

解决的问题：
  文档里的版本号 / 构建号 / 测试计数靠手写，必然漂移。
  2026-10-25 实测：同一时刻 6 份文档写着 162 / 119 / b741 / b147 / 190 / 197
  六个不同版本号，每份都自称最新。

校验规则（三类）：
  A 禁止手写具体数字（活文档）
     活文档里不许出现 "build 162" / "b190" / "37/37" 这类具体值 ——
     应改为指向 STATE.md。**例外**：明确标注「历史快照 / 已过期」的文档可以写。
  B 活文档必须指向 STATE.md
     检查关键活文档里是否有指向 STATE.md 的句子。
  C STATE.md 必须是最新的
     调 gen_state.py --check，过期即报错。

用法：
    python scripts/doc_sync_check.py           # 校验（有问题退出 1）
    python scripts/doc_sync_check.py --verbose # 列出每份文档的判定
"""

from __future__ import annotations

import argparse
import re
import subprocess
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
PY = ROOT / ".venv" / "Scripts" / "python.exe"
if not PY.exists():
    PY = Path(sys.executable)

# 活文档：不允许手写**当前状态**的数字，必须指向 STATE.md
LIVE_DOCS = ["README.md", "AGENTS.md", "HANDOFF-2026-10-25.md"]

# 历史快照：允许保留旧数字，但必须有「已过期」声明
# ⚠️ CHANGELOG.md 不在此列：它是**版本变更记录**，本身就是历史性质，
#    每个版本的旧数字是正确内容，不是「过期」（2026-10-25 修正误判）。
SNAPSHOT_DOCS = ["HANDOFF.md", "HANDOVER.md", "CLOSURE.md"]

# 明确不检查的（纯历史/生成物/第三方）
SKIP = {"STATE.md", "LICENSE", "THIRD_PARTY_NOTICES.md"}

# 会被判定为「手写当前状态」的模式。
# ⚠️ 设计要点（2026-10-25 两轮调整）：
#   只抓**断言现状**的写法，不抓以下三类（都是合法用法，抓了就是误报）：
#     1. 说明「徽标应该长什么样」的规则示例（含「统一显示 / 格式 / 示例」）
#     2. 历史叙述里的旧值（含「实际 / 当时 / 旧 / 曾」）
#     3. 表格里明确标注日期的历史行
PATTERNS = [
    (re.compile(r"build\s*\d{2,4}(?!\d)"), "构建号（build N）"),
    (re.compile(r"`?b\d{2,4}`?(?!\d)"), "构建号（bN）"),
    (re.compile(r"HEAD\s*`?[0-9a-f]{7,40}`?"), "HEAD 提交号"),
    (re.compile(r"\b\d{1,3}/\d{1,3}\s*(通过|全绿)"), "测试计数（N/N 通过）"),
]

# 出现这些词 → 视为「规则示例 / 历史叙述」，不算违规
ALLOW_CONTEXT = re.compile(
    r"统一显示|统一为|格式为|示例|例如|实际|当时|旧值|曾经|历史|已过期|不代表现状"
    r"|→\s*\d|改为|修正|原写|写成")

EXPIRED_MARK = re.compile(r"已过期|历史快照|历史记录|不代表现状|已标注过期|已标注")


def run(cmd: list[str]) -> tuple[int, str]:
    try:
        r = subprocess.run(cmd, cwd=ROOT, capture_output=True, text=True,
                           encoding="utf-8", errors="replace", timeout=120)
        return r.returncode, (r.stdout or "") + (r.stderr or "")
    except Exception as e:
        return 1, str(e)


def scan(path: Path) -> list[tuple[int, str, str]]:
    """返回 [(行号, 行内容, 命中类型)]"""
    try:
        text = path.read_text(encoding="utf-8", errors="replace")
    except Exception:
        return []
    hits = []
    for i, line in enumerate(text.splitlines(), 1):
        # 跳过代码块里的命令行示例（含 python/node/git 的整行）
        s = line.strip()
        if s.startswith(("$", "python ", "node ", "git ", "npx ", ".venv")):
            continue
        # 跳过「规则示例 / 历史叙述」上下文（见 ALLOW_CONTEXT 注释）
        if ALLOW_CONTEXT.search(line):
            continue
        for pat, label in PATTERNS:
            if pat.search(line):
                hits.append((i, s[:110], label))
                break
    return hits


def main() -> int:
    try:
        sys.stdout.reconfigure(encoding="utf-8", errors="replace")
    except Exception:
        pass

    ap = argparse.ArgumentParser()
    ap.add_argument("--verbose", action="store_true")
    args = ap.parse_args()

    problems: list[str] = []

    print("文档一致性校验\n" + "=" * 60)

    # ── A 活文档不许手写数字 ──
    print("\n[A] 活文档禁止手写具体数字（应指向 STATE.md）")
    for name in LIVE_DOCS:
        p = ROOT / name
        if not p.exists():
            if args.verbose:
                print(f"  -- {name}（不存在，跳过）")
            continue
        hits = scan(p)
        if hits:
            problems.append(f"{name} 有 {len(hits)} 处手写数字")
            print(f"  ⛔ {name}：{len(hits)} 处")
            for ln, txt, label in hits[:6]:
                print(f"       第 {ln} 行 [{label}]  {txt}")
            if len(hits) > 6:
                print(f"       …… 还有 {len(hits) - 6} 处")
        else:
            print(f"  OK {name}")

    # ── B 活文档必须指向 STATE.md ──
    print("\n[B] 活文档必须指向 STATE.md")
    for name in LIVE_DOCS:
        p = ROOT / name
        if not p.exists():
            continue
        try:
            txt = p.read_text(encoding="utf-8", errors="replace")
        except Exception:
            continue
        if "STATE.md" in txt:
            print(f"  OK {name}")
        else:
            problems.append(f"{name} 未指向 STATE.md")
            print(f"  ⛔ {name}：未提到 STATE.md")

    # ── C 历史快照必须有过期声明 ──
    print("\n[C] 历史快照必须有「已过期」声明")
    for name in SNAPSHOT_DOCS:
        p = ROOT / name
        if not p.exists():
            continue
        try:
            head = "\n".join(p.read_text(encoding="utf-8", errors="replace").splitlines()[:25])
        except Exception:
            continue
        if EXPIRED_MARK.search(head):
            print(f"  OK {name}")
        else:
            problems.append(f"{name} 缺过期声明")
            print(f"  ⛔ {name}：开头 25 行内没有「已过期/历史快照」声明")

    # ── D STATE.md 新鲜度 ──
    print("\n[D] STATE.md 是否与实际一致")
    rc, out = run([str(PY), "scripts/gen_state.py", "--check"])
    if rc == 0:
        print("  OK STATE.md 与实际一致")
    else:
        problems.append("STATE.md 已过期")
        print("  ⛔ STATE.md 已过期")
        for line in out.strip().splitlines()[:8]:
            print("     " + line)

    print("\n" + "=" * 60)
    if problems:
        print(f"⛔ 发现 {len(problems)} 个文档一致性问题：")
        for x in problems:
            print(f"   · {x}")
        print("\n修复建议：")
        print("  1. 活文档里的具体数字 → 改为「见 STATE.md」")
        print("  2. 历史快照 → 开头加「⚠️ 已过期，现行状态见 STATE.md」")
        print("  3. STATE.md 过期 → python scripts/gen_state.py")
        return 1
    print("✅ 文档一致性检查全部通过")
    return 0


if __name__ == "__main__":
    sys.exit(main())
