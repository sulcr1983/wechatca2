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
LIVE_DOCS = ["README.md", "AGENTS.md", "HANDOFF.md", "CLOSURE.md"]

# 历史快照：允许保留旧数字，但必须有「已过期」声明
# ⚠️ CHANGELOG.md 不在此列：它是**版本变更记录**，本身就是历史性质，
#    每个版本的旧数字是正确内容，不是「过期」（2026-10-25 修正误判）。
# 历史快照：允许保留旧数字，但开头必须有「已过期 / 已归档」声明。
# 2026-10-29：不再硬编码清单——`docs/archive/**/*.md` 全量自动发现。
# 理由：硬编码清单必漏（当天新归档 8 份，清单只写了 5 份，另外 3 份就没人管了）。
ARCHIVE_DIR = "docs/archive"


def snapshot_docs() -> list[str]:
    """所有归档文档（相对仓库根的路径）"""
    root = ROOT / ARCHIVE_DIR
    if not root.exists():
        return []
    return [p.relative_to(ROOT).as_posix() for p in sorted(root.rglob("*.md"))]

# 明确不检查的（纯历史/生成物/第三方）
SKIP = {"STATE.md", "LICENSE", "THIRD_PARTY_NOTICES.md"}

# 根目录允许出现的 .md（2026-10-29 文档合并后定版）
# 为什么要机检：交接/收尾类文档会自然繁殖——每轮多写一份「HANDOVER-日期.md」，
# 半年后根目录躺着 4 份互相矛盾的交接说明，谁也不知道哪份是真的（这就是当时的状况）。
ROOT_MD_ALLOWED = {
    "README.md",            # 对外说明
    "AGENTS.md",            # 工程规则唯一真源
    "STATE.md",             # 当前状态（生成物）
    "HANDOFF.md",           # 交接（只讲怎么上手、坑在哪）
    "CLOSURE.md",           # 收尾台账（一行一轮）
    "ARCHIVE.md",           # 封存记录
    "CHANGELOG.md",         # 版本更新日志（生成物）
    "THIRD_PARTY_NOTICES.md",  # 第三方许可证
    "claude.md",            # Claude Code 入口（@AGENTS.md 导入）
}

# 会被判定为「手写当前状态」的模式。
# ⚠️ 设计要点（2026-10-25 两轮调整）：
#   只抓**断言现状**的写法，不抓以下三类（都是合法用法，抓了就是误报）：
#     1. 说明「徽标应该长什么样」的规则示例（含「统一显示 / 格式 / 示例」）
#     2. 历史叙述里的旧值（含「实际 / 当时 / 旧 / 曾」）
#     3. 表格里明确标注日期的历史行
PATTERNS = [
    (re.compile(r"build\s*\d{2,4}(?!\d)"), "构建号（build N）"),
    # ⚠️ 必须排除十六进制颜色：#10b981 里的 b981 会被当成构建号（实测 2026-10-29 误报）
    (re.compile(r"(?<![#0-9a-eg-z])`?b\d{2,4}`?(?![0-9a-fA-F])"), "构建号（bN）"),
    (re.compile(r"HEAD\s*`?[0-9a-f]{7,40}`?"), "HEAD 提交号"),
    (re.compile(r"\b\d{1,3}/\d{1,3}\s*(通过|全绿)"), "测试计数（N/N 通过）"),
]

# 出现这些词 → 视为「规则示例 / 历史叙述」，不算违规
ALLOW_CONTEXT = re.compile(
    r"统一显示|统一为|格式为|示例|例如|实际|当时|旧值|曾经|历史|已过期|不代表现状"
    r"|→\s*\d|改为|修正|原写|写成")

EXPIRED_MARK = re.compile(r"已过期|历史快照|历史记录|不代表现状|已标注过期|已标注|已归档")

# ── E 段落：主题族名 / 套数与代码一致 ──────────────────────────────────
# 2026-10-29 踩过的坑：族名从「卷宗/庙会」改成「公文/节庆」、只挂 1 套的 frost 族
# 被删掉之后，README 与 AGENTS 里还写着「8 族 83 色调」「卷宗 / 庙会」。
# 用户读文档再对照 UI，就会判定「主题丢了」。这几条规则把那类漂移变成机检。
FACT_DOCS = ["README.md", "AGENTS.md", "docs/overview.md"]
# 已退役的族名 → 现名。文档里再当现状写就是错
RETIRED_FAMILY = {"卷宗": "公文", "庙会": "节庆"}
# 历史叙述豁免（和 A 段的 ALLOW_CONTEXT 同一个思路，但这里要更宽一点）
HISTORY_CONTEXT = re.compile(
    r"历史|原称|旧名|曾叫|改名|改为|→|已于|早期|当时|旧值|曾经|退役|2026-09|2026-10")
FAMILY_COUNT_RE = re.compile(r"(\d+)\s*族")
# 只抓「总数」写法：加粗的总数，或「N 套主题」；不抓 45/119 这类分项拆解
THEME_TOTAL_RE = re.compile(r"\*\*\s*(\d{2,3})\s*套\s*\*\*|(\d{2,3})\s*套主题")


def theme_facts() -> tuple[int, int]:
    """现役事实：主题套数、族数

    ⚠️ 族**不在主题 JSON 里**：`public/themes/*.json` 没有 family 字段，
    族是按 id 前缀（`su-<族>-<色调>`）在 `pwa/scripts/build.mjs` 里派生的。
    所以这里读 FAMILIES 清单（唯一真源），不能数 JSON 字段——数不到会得出 0 族。
    """
    files = [p for p in (ROOT / "public" / "themes").glob("*.json")
             if p.name != "index.json"]
    fams: list[str] = []
    m = re.search(r"const FAMILIES\s*=\s*\[([^\]]*)\]",
                  (ROOT / "pwa" / "scripts" / "build.mjs").read_text(encoding="utf-8"))
    if m:
        fams = re.findall(r"['\"]([a-z]+)['\"]", m.group(1))
    return len(files), len(fams)


def check_facts() -> list[str]:
    """返回不符合现状的文档描述"""
    n_themes, n_fams = theme_facts()
    bad = []
    for name in FACT_DOCS:
        p = ROOT / name
        if not p.exists():
            continue
        for i, line in enumerate(p.read_text(encoding="utf-8", errors="replace").splitlines(), 1):
            if HISTORY_CONTEXT.search(line):
                continue
            for old, new in RETIRED_FAMILY.items():
                if old in line:
                    bad.append(f"{name}:{i} 用了退役族名「{old}」（现名「{new}」）")
            for m in FAMILY_COUNT_RE.finditer(line):
                if int(m.group(1)) != n_fams:
                    bad.append(f"{name}:{i} 写「{m.group(0)}」，实际 {n_fams} 族")
            for m in THEME_TOTAL_RE.finditer(line):
                got = int(m.group(1) or m.group(2))
                if got != n_themes:
                    bad.append(f"{name}:{i} 写「{m.group(0).strip()}」，实际 {n_themes} 套")
    return bad


def check_structure_counts() -> list[str]:
    """项目结构树里写的数量（脚本个数 / core 模块数）必须与实际一致

    这类漂移最阴：删一个文件、加一个脚本都不会报错，只有人肉数才发现。
    2026-10-29 就踩过——新增 `theme_contrast_online.py` 后 README 还写「工具脚本 59 个」。

    ⚠️ `__init__.py` 是包标记不是模块，数的时候要排掉（否则「只有这 4 个模块」会误报成 5）。
    """
    def n_py(d: str) -> int:
        return len([p for p in (ROOT / d).glob("*.py") if p.name != "__init__.py"])

    facts = {"工具脚本": n_py("scripts"), "core 模块": n_py("core")}
    checks = [
        (re.compile(r"工具脚本\s*(\d+)\s*个"), "工具脚本", "scripts/*.py"),
        (re.compile(r"只有这\s*(\d+)\s*个模块"), "core 模块", "core/*.py"),
    ]
    bad = []
    for name in FACT_DOCS:
        p = ROOT / name
        if not p.exists():
            continue
        for i, line in enumerate(p.read_text(encoding="utf-8", errors="replace").splitlines(), 1):
            for pat, key, where in checks:
                for m in pat.finditer(line):
                    if int(m.group(1)) != facts[key]:
                        bad.append(f"{name}:{i} 写「{m.group(0)}」，实际 {facts[key]}（数自 {where}）")
    return bad


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
    print("\n[C] 历史快照必须有「已过期」声明（自动发现 docs/archive/**/*.md）")
    for name in snapshot_docs():
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

    # ── E 族名 / 套数与代码一致 ──
    print("\n[E] 主题族名 / 套数 / 版本描述是否与代码一致")
    facts = check_facts()
    n_themes, n_fams = theme_facts()
    print(f"  事实：{n_themes} 套主题 / {n_fams} 个族（数自 public/themes/*.json）")
    if facts:
        problems.append(f"文档与主题事实不符 {len(facts)} 处")
        for f in facts[:10]:
            print(f"  ⛔ {f}")
        if len(facts) > 10:
            print(f"       …… 还有 {len(facts) - 10} 处")
    else:
        print("  OK README / AGENTS / overview 与代码一致")

    # ── F 项目结构树里的数量 ──
    print("\n[F] 项目结构树里的数量（脚本个数 / core 模块数）")
    struct = check_structure_counts()
    if struct:
        problems.append(f"结构树数量不符 {len(struct)} 处")
        for s in struct:
            print(f"  ⛔ {s}")
    else:
        print("  OK 与磁盘实际一致")

    # ── G 根目录不许再堆积交接/收尾类文档 ──
    print("\n[G] 根目录 .md 是否只有约定内那几份")
    extra = sorted({p.name for p in ROOT.glob("*.md")} - ROOT_MD_ALLOWED)
    if extra:
        problems.append(f"根目录多出 {len(extra)} 份 .md")
        for name in extra:
            print(f"  ⛔ {name}：不在约定清单里")
        print("     现役文档改在根目录现有那几份里；历史/过程记录 → docs/archive/")
    else:
        print(f"  OK 只有约定的 {len(ROOT_MD_ALLOWED)} 份")

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
