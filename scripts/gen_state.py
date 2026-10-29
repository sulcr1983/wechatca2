#!/usr/bin/env python3
"""生成 STATE.md —— 项目单一状态源（P1，2026-10-25）

解决的问题：
  6 份文档同时充当「当前状态」，各自写版本号 / 构建号 / 测试计数，
  手维护必然漂移（2026-10-25 实测：同一时刻存在 162 / 119 / b741 / b147 / 190 / 197
  六个不同版本号，每份都自称最新）。

做法：
  - 本脚本从**真实来源**采集数据，生成 STATE.md
  - STATE.md 顶部写明「**机器生成，禁止手改**」，改了就下次生成被覆盖
  - 其他文档只能「指向」STATE.md，不许自己写具体数字

数据来源（都是可验证的，不是人手填的）：
  - 版本号        pwa/version.json
  - 构建号        pwa/dist/version.json（构建时注入的 git 提交数）
  - HEAD           git rev-parse / rev-list --count
  - 线上版本        https://supersu.ccwu.cc/version.json（可选，网络失败则标 N/A）
  - 测试计数       最近一次门禁日志 output/gate-run/ 里的 summary 行
  - 主题数量        public/themes/*.json 实际文件数

用法：
    python scripts/gen_state.py              # 生成 STATE.md
    python scripts/gen_state.py --no-online  # 不联网（离线环境）
    python scripts/gen_state.py --check      # 只校验 STATE.md 是否过期（CI 用，过期退出 1）
"""

from __future__ import annotations

import argparse
import datetime as dt
import json
import re
import subprocess
import sys
import urllib.error
import urllib.request
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
STATE = ROOT / "STATE.md"
DIST = ROOT / "pwa" / "dist"
ONLINE_URL = "https://supersu.ccwu.cc/version.json"

HEADER = """<!-- ⚠️ 本文件由 scripts/gen_state.py 自动生成，禁止手改。
     手改会在下次生成时被覆盖；要改内容请改脚本或数据源。 -->

# STATE — 项目单一状态源

> **本文件是「当前状态」的唯一真源。** 其他文档（README / AGENTS / HANDOFF / CLOSURE …）
> 只允许**指向**本文件，不允许自己写版本号、构建号、测试计数。
>
> 生成时间：{generated}
> 生成命令：`python scripts/gen_state.py`

"""


def git(*args: str) -> str:
    try:
        r = subprocess.run(["git", *args], cwd=ROOT, capture_output=True,
                           text=True, encoding="utf-8", errors="replace")
        return (r.stdout or "").strip()
    except OSError:
        return ""


def read_json(p: Path) -> dict:
    try:
        return json.loads(p.read_text(encoding="utf-8"))
    except Exception:
        return {}


def local_version() -> tuple[str, str]:
    v = read_json(ROOT / "pwa" / "version.json").get("version", "?")
    b = read_json(DIST / "version.json").get("build")
    return v, ("?" if b is None else str(b))


def online_version(allow_net: bool) -> tuple[str, str, str]:
    """返回 (version, build, 备注)"""
    if not allow_net:
        return "—", "—", "已跳过（--no-online）"
    req = urllib.request.Request(ONLINE_URL, headers={
        "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) SuperSu-GenState/1.0",
        "Accept": "application/json",
    })
    try:
        with urllib.request.urlopen(req, timeout=15) as r:
            d = json.loads(r.read().decode("utf-8"))
        return str(d.get("version", "?")), str(d.get("build", "?")), ""
    except (urllib.error.URLError, OSError, ValueError) as e:
        return "N/A", "N/A", f"取不到（{type(e).__name__}）"


def theme_count() -> int:
    d = ROOT / "public" / "themes"
    if not d.exists():
        return 0
    return len([p for p in d.glob("*.json") if p.stem not in ("index", "manifest")])


def latest_gate() -> tuple[str, str, str]:
    """最近一次门禁的 (时间, 结果, 日志名)"""
    d = ROOT / "output" / "gate-run"
    if not d.exists():
        return "—", "—", "无记录"
    logs = sorted(d.glob("run-*.log"), key=lambda p: p.stat().st_mtime, reverse=True)
    if not logs:
        return "—", "—", "无记录"
    p = logs[0]
    txt = ""
    try:
        txt = p.read_text(encoding="utf-8", errors="replace")
    except Exception:
        pass
    m = re.search(r"# summary (\d+)/(\d+) stopped_at=(\S+)", txt)
    res = f"{m.group(1)}/{m.group(2)}" if m else "?"
    if m and m.group(3) not in ("None", "none"):
        res += f"（在 {m.group(3)} 停）"
    stamp = dt.datetime.fromtimestamp(p.stat().st_mtime).strftime("%Y-%m-%d %H:%M")
    return stamp, res, p.name


def suite_inventory() -> list[tuple[str, str, str]]:
    """从 run_gates.py 读套件清单（唯一真源），返回 (层, 名称, 说明)"""
    p = ROOT / "scripts" / "run_gates.py"
    if not p.exists():
        return []
    try:
        src = p.read_text(encoding="utf-8")
    except Exception:
        return []
    rows: list[tuple[str, str, str]] = []
    layer = ""
    for line in src.splitlines():
        m = re.match(r"^(SUITES_\w+)\s*=", line.strip())
        if m:
            layer = {"SUITES_LOCAL": "本地层（默认）",
                     "SUITES_ONLINE": "线上层（--online）",
                     "SUITES_UI": "有头层（--ui）",
                     "SUITES_FULL": "扩展层（--full）"}.get(m.group(1), m.group(1))
            continue
        m2 = re.match(r'^\s*\("(\w+)",\s*\[.*?\],\s*"([^"]+)"', line)
        if m2 and layer:
            rows.append((layer, m2.group(1), m2.group(2)))
    return rows


def build_state(allow_net: bool) -> str:
    lv, lb = local_version()
    ov, ob, onote = online_version(allow_net)
    head = git("rev-parse", "--short", "HEAD")
    count = git("rev-list", "--count", "HEAD")
    branch = git("rev-parse", "--abbrev-ref", "HEAD")
    dirty = git("status", "--porcelain", "--untracked-files=no")
    gtime, gres, glog = latest_gate()

    out = [HEADER.format(generated=dt.datetime.now().strftime("%Y-%m-%d %H:%M"))]

    # ── 版本与部署 ──
    out.append("## 版本与部署\n\n")
    out.append("| 项 | 值 |\n|---|---|\n")
    out.append(f"| 版本号 | **v{lv}** |\n")
    out.append(f"| 本地 dist 构建号 | **b{lb}** |\n")
    sync = ""
    if ov not in ("N/A", "—") and ob not in ("N/A", "—"):
        if ov == lv and ob == lb:
            sync = "✅ 已同步"
        else:
            sync = f"⚠️ **线上落后**（线上 b{ob}，本地 b{lb}，尚未部署）"
    out.append(f"| 线上构建号 | b{ob} {onote} |\n")
    out.append(f"| 部署状态 | {sync or '—'} |\n")
    out.append(f"| 分支 | `{branch}` |\n")
    out.append(f"| HEAD | `{head}`（共 {count} 个提交）|\n")
    out.append(f"| 工作区 | {'⚠️ 有未提交改动' if dirty else '✅ 干净'} |\n\n")

    # ── 产品规模 ──
    out.append("## 产品规模\n\n")
    out.append("| 项 | 值 |\n|---|---|\n")
    out.append(f"| 主题数 | {theme_count()} 套 |\n")
    out.append("| 版式 | 8 种（默认 / 图文节奏 / 卡片流 / 目录导航 / 杂志分栏 / 首屏 / 卡片组 / 时间线）|\n")
    out.append("| 段落样式 | 3 种（金句 / 数据 / 提示，按内容自动识别）|\n")
    out.append("| 主产品 | PWA `https://supersu.ccwu.cc` |\n")
    out.append("| 本地 Flask 版 | 已弃用（保留参考，不进任何门禁）|\n\n")

    # ── 最近门禁 ──
    out.append("## 最近一次门禁\n\n")
    out.append(f"- 时间：{gtime}\n")
    out.append(f"- 结果：**{gres}**\n")
    out.append(f"- 日志：`output/gate-run/{glog}`\n\n")

    # ── 门禁套件清单 ──
    rows = suite_inventory()
    if rows:
        out.append("## 门禁套件（从 `scripts/run_gates.py` 自动读取）\n\n")
        cur = ""
        for layer, name, desc in rows:
            if layer != cur:
                cur = layer
                out.append(f"\n**{layer}**\n\n| 套件 | 覆盖 |\n|---|---|\n")
            out.append(f"| `{name}` | {desc} |\n")
        out.append("\n")

    # ── 怎么跑 ──
    out.append("""## 怎么跑

```bash
# 改过 pwa/src / core 引擎 / themes → 必须先重建
node pwa/scripts/build.mjs

# 前置检查（dist 新鲜度 / 工作区）
python scripts/preflight.py

# 门禁
python scripts/run_gates.py              # 本地层（默认，测当前代码）
python scripts/run_gates.py --ui         # + 有头全量（164 套模板 / 8 版式）
python scripts/run_gates.py --online     # + 线上层（部署后验证）

# 一键全测（推荐日常用）
python scripts/test_all.py --list

# 发版（一条命令走完 10 步）
python scripts/release.py --dry-run      # 先演练
python scripts/release.py                # 正式发版
```

## 文档约定

- **本文件（STATE.md）是当前状态唯一真源**，由脚本生成，禁止手改
- 其他文档只允许指向本文件，不允许自己写版本号 / 构建号 / 测试计数
- 过程性记录、旧交接、逐项验收 → `docs/archive/`，每份开头必须带「已归档 / 已过期」声明条
  （`doc_sync_check.py` 的 [C] 段自动全量检查）；根目录 `.md` 有白名单，[G] 段拦截新增
- 校验：`python scripts/doc_sync_check.py`
""")
    return "".join(out)


def main() -> int:
    try:
        sys.stdout.reconfigure(encoding="utf-8", errors="replace")
    except Exception:
        pass

    ap = argparse.ArgumentParser()
    ap.add_argument("--no-online", action="store_true", help="不联网取线上版本")
    ap.add_argument("--check", action="store_true", help="只校验是否过期，不写文件")
    args = ap.parse_args()

    content = build_state(not args.no_online)

    if args.check:
        if not STATE.exists():
            print("⛔ STATE.md 不存在 —— 先跑 python scripts/gen_state.py")
            return 1
        old = STATE.read_text(encoding="utf-8")
        # ⚠️ 只比对**本地可确定**的字段（版本号 / 本地 dist 构建号 / 主题数）。
        #    线上构建号**故意不比对**：build.mjs 生成 STATE 时用 --no-online（不联网），
        #    而校验时可能联网，两边必然不同 —— 比它只会造成永远红的假警报（2026-10-25 实测）。
        keys = ("| 版本号", "| 本地 dist 构建号", "| 主题数")
        diff = [k for k in keys
                if (k in old) != (k in content)
                or _line_of(old, k) != _line_of(content, k)]
        if diff:
            print("⛔ STATE.md 已过期，以下项与实际不符：")
            for k in diff:
                print(f"   {k.strip('| ')}")
                print(f"     文档：{_line_of(old, k)}")
                print(f"     实际：{_line_of(content, k)}")
            print("\n修复：python scripts/gen_state.py")
            return 1
        print("✅ STATE.md 与实际一致")
        return 0

    STATE.write_text(content, encoding="utf-8")
    print(f"✅ 已生成 {STATE.relative_to(ROOT)}")
    for line in content.splitlines():
        if line.startswith("| 版本号") or line.startswith("| 本地 dist") \
                or line.startswith("| 线上构建号") or line.startswith("| 部署状态"):
            print("   " + line)
    return 0


def _line_of(text: str, key: str) -> str:
    for line in text.splitlines():
        if line.startswith(key):
            return line.strip()
    return ""


if __name__ == "__main__":
    sys.exit(main())
