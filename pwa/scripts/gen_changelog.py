#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""从 git 历史生成更新日志（零第三方依赖，仅标准库）。

产物：
  - pwa/public/changelog.json  前端消费
  - CHANGELOG.md               人读（Keep a Changelog 格式）

规则：
  - commit 解析遵循 Conventional Commits，未知类型兜底为 other，不丢条目；
  - 分类遵循 Keep a Changelog：Added/Changed/Deprecated/Removed/Fixed/Security；
  - 版本切分由同目录 changelog_milestones.json 决定（从新到旧，until 为右闭边界）。

用法：
  python pwa/scripts/gen_changelog.py
  python pwa/scripts/gen_changelog.py --check   # 只自检、不写文件
"""

from __future__ import annotations

import argparse
import json
import re
import subprocess
import sys
from datetime import datetime, timedelta, timezone
from pathlib import Path

ROOT = Path(__file__).resolve().parents[2]
MILESTONES_FILE = Path(__file__).resolve().with_name("changelog_milestones.json")
JSON_OUT = ROOT / "pwa" / "public" / "changelog.json"
MD_OUT = ROOT / "CHANGELOG.md"

# %x1f = 单元分隔符，%x1e = 记录分隔符，避免正文里的常规分隔符干扰解析
FIELD_SEP = "\x1f"
RECORD_SEP = "\x1e"
GIT_PRETTY = "--pretty=format:%H%x1f%ad%x1f%s%x1f%b%x1e"

# 2026-11-03：补 revert / security —— 否则它们被兜底成 other，TYPE_TO_GROUP 里的
# 「移除 / 安全」映射永远不生效（实测 33 个版本里这两组出现 0 次）。
TYPE_WHITELIST = {"feat", "fix", "docs", "chore", "test", "refactor", "perf",
                  "style", "revert", "security"}

# 内部改动：默认折叠进「开发者细节」，不占用用户的第一屏
# （refactor / perf 保留在正文 —— 它们对用户有体感，比如"排版更快了"）
DEV_TYPES = {"test", "chore", "docs", "style", "build", "ci"}

# 工程类 scope：即便 type 是 feat/fix，也属于开发者细节，不该进用户主视图。
# 2026-11-03 新增：原判定只看 type，导致 `fix(test)` / `feat(gate)` / `fix(deploy)`
# 全被当成用户可见 —— 实测用户可见的 172 条里有 44 条（26%）是 E2E/夹具/.env 这类黑话。
DEV_SCOPES = {
    "test", "gate", "release", "deploy", "build", "state", "changelog", "csp",
    "plan", "review", "proto", "prototype", "handoff", "tasks", "tools",
    "diagnosis", "online", "docs", "ci", "deps", "lint", "fmt",
}


GROUP_ORDER = ["added", "changed", "deprecated", "removed", "fixed", "security", "other"]
GROUP_LABELS = {
    "added": "新增",
    "changed": "调整",
    "deprecated": "弃用",
    "removed": "移除",
    "fixed": "修复",
    "security": "安全",
    "other": "其他",
}
TYPE_TO_GROUP = {
    "feat": "added",
    "fix": "fixed",
    "perf": "changed",
    "docs": "changed",
    "refactor": "changed",
    "style": "changed",
    "revert": "removed",      # 2026-11-03 新增：撤销/移除功能归「移除」而非「其他」
    "security": "security",   # 2026-11-03 新增：安全修复有独立分组
    "test": "other",
    "chore": "other",
    "other": "other",
}

# 噪音：发布提交、合并、回滚
# 2026-11-03 补两种漏网写法：`release:`（无 scope）、`chore(release` 无右括号。
# 实测 7ce5cc3「release: v1.8.1 —— …」原本漏进 1.8.1 卡片主视图。
# ⚠️ 故意**不**过滤 revert：`cd0668d 彻底移除公众号推送与编辑器贴图功能` 是用户可见的
#    真实改动，revert 已通过 TYPE_TO_GROUP 归入「移除」分组（不是噪音）。
NOISE_RE = re.compile(r"^(chore\(release[):]|Merge |Revert |release[:(])")
# type(scope)!: subject —— type 允许 fix+test 这类复合写法，便于仍然剥掉前缀
CONVENTIONAL_RE = re.compile(
    r"^(?P<type>[A-Za-z][A-Za-z0-9+_-]*)(?:\((?P<scope>[^)]*)\))?!?:\s*(?P<subject>.+)$"
)

CST = timezone(timedelta(hours=8))


def git_log() -> str:
    """读取全量非合并历史（只读操作）。"""
    # --date=iso-strict 带上时刻（2026-10-18T19:10:59+08:00）：
    # 同一个日期里要切多个版本时，只有「时刻」能区分先后。
    cmd = ["git", "-C", str(ROOT), "log", "--no-merges", "--date=iso-strict", GIT_PRETTY]
    proc = subprocess.run(cmd, capture_output=True, text=True, encoding="utf-8", errors="replace")
    if proc.returncode != 0:
        raise SystemExit(f"git log 执行失败：{proc.stderr.strip()}")
    return proc.stdout


def parse_commits(raw: str) -> list[dict]:
    commits = []
    for record in raw.split(RECORD_SEP):
        record = record.strip("\r\n")
        if not record:
            continue
        parts = record.split(FIELD_SEP)
        if len(parts) < 4:
            continue
        full_hash, date, subject, body = parts[0], parts[1], parts[2], FIELD_SEP.join(parts[3:])
        subject = subject.strip()

        ctype, scope, text = "other", "", subject
        matched = CONVENTIONAL_RE.match(subject)
        if matched:
            raw_type = matched.group("type").lower()
            scope = (matched.group("scope") or "").strip()
            text = matched.group("subject").strip()
            if raw_type in TYPE_WHITELIST:
                ctype = raw_type
            elif raw_type.startswith("cleanup"):
                # cleanup 不在白名单，归入 other，但前缀已剥掉，人读更顺
                text = matched.group("subject").strip()
        commits.append(
            {
                "full_hash": full_hash,
                "hash": full_hash[:7],
                "date": date,
                "subject": subject,
                "body": body,
                "type": ctype,
                "scope": scope,
                "text": text,
                "breaking": ("BREAKING CHANGE:" in body) or ("BREAKING-CHANGE:" in body),
            }
        )
    return commits


def load_milestones() -> list[dict]:
    """读手工切点表。

    2026-11-03 起语义变化：**边界（until）只对 0.x 有效**（Flask 期历史，version.json 里
    不存在）；1.0.0 及以后的边界由 `auto_milestones()` 从 git 历史推导。本文件对 1.x 的
    作用退化为**文案表**（title / highlights），`until` 可以省略。

    所以这里不再强制要求每条都有 `until`，也不再用它排序（顺序由调用方决定）。
    """
    with MILESTONES_FILE.open("r", encoding="utf-8") as fh:
        milestones = json.load(fh)
    # 跳过 `_note` 之类的说明项（不是版本记录）
    milestones = [m for m in milestones if isinstance(m, dict) and not str(m.get("version", "")).startswith("_")]
    milestones = [m for m in milestones if "_note" not in m]
    if not milestones:
        raise SystemExit("changelog_milestones.json 为空")
    versions = [m["version"] for m in milestones]
    if len(set(versions)) != len(versions):
        raise SystemExit(f"版本号重复：{versions}")
    return milestones


def load_version() -> str:
    """pwa/version.json 的语义化版本 —— 更新记录必须覆盖到这个版本。"""
    version_file = ROOT / "pwa" / "version.json"
    try:
        return str(json.loads(version_file.read_text(encoding="utf-8")).get("version") or "")
    except (OSError, ValueError) as e:
        raise SystemExit(f"读不了 pwa/version.json（{type(e).__name__}: {e}）")


# ── 自动版本边界（2026-11-03 引入，取代手工切点）────────────────────────
#
# 为什么改：`changelog_milestones.json` 是**二手台账**，靠人手维护，必然腐烂
# （实测 33 个版本里 11 个是凭空造的：0.x 是 Flask 期遗留，1.1.0/1.2.0/1.14.0 是 PWA 期虚构）。
# 而 `pwa/version.json` 的 **git 历史本身就是版本真源** —— 每次 bump 都是一个精确到秒的
# 时间锚点，零人工、不会漏、不会错。
#
# 实测效果：1.17.0 卡片从 77 条降到 10 条，多出的 67 条变成语义正确的「未发版」桶；
# 凭空缺失的 1.16.0 自动出现（6 条）；幽灵版本 1.14.0 自动消失；370 条一条不丢。
#
# ⚠️ 分界必须干净：`0.x` 用手工切点（Flask 期历史，version.json 里不存在），
#    `1.0.0` 起全自动。混用会翻车（实测：1.2.0 空桶、1.1.0/1.3.0 顺序错乱）。
AUTO_BOUNDARY = "1.0.0"   # 这个版本起（含）全部自动推导

UNRELEASED = "__unreleased__"   # 未发版桶的保留键


def _version_of_commit(commit: str) -> str:
    """读某个提交里的 pwa/version.json 的 version 字段。"""
    try:
        blob = subprocess.run(
            ["git", "-C", str(ROOT), "show", f"{commit}:pwa/version.json"],
            capture_output=True, text=True, encoding="utf-8", errors="replace")
        if blob.returncode != 0:
            return ""
        return str(json.loads(blob.stdout).get("version") or "")
    except (OSError, ValueError):
        return ""


def _deploy_markers() -> dict[str, str]:
    """找出每个版本「部署完成」的时刻，用于确定最新版本的上界。

    为什么需要：`chore(release): v1.17.0` 是发版的**开始**（10:47），而真实发版窗口
    会延续一段时间（移除推送 11:10、重建 dist 12:12、部署确认 12:16）。
    只用 bump 时刻当边界，这些**已经随该版本上线**的提交会被误判成「未发版」。
    实测 1.17.0：bump 10:47 → 部署完成 12:16，中间 5 个提交都属于它。

    识别方式：`chore(state): vX.Y.Z 已部署 / 已上线 / 线上已同步 / 已同步`。
    同一版本有多次部署标记时取**最晚**的那个（最后一次部署才是终点）。
    找不到就返回空，退回 bump 时刻（保守：无法证明已发布的内容算未发版）。
    """
    pat = re.compile(r"(已部署|已上线|线上已同步|已同步)")
    ver = re.compile(r"(\d+\.\d+\.\d+)")
    try:
        out = subprocess.run(
            ["git", "-C", str(ROOT), "log", "--date=iso-strict", "--format=%ad|%s"],
            capture_output=True, text=True, encoding="utf-8", errors="replace").stdout
    except OSError:
        return {}
    marks: dict[str, str] = {}
    for line in (out or "").strip().split("\n"):
        if "|" not in line:
            continue
        stamp, subject = line.split("|", 1)
        if not pat.search(subject):
            continue
        m = ver.search(subject)
        if not m:
            continue
        ts = stamp.strip()[:19].replace(" ", "T")
        v = m.group(1)
        if v not in marks or ts > marks[v]:
            marks[v] = ts
    return marks


def auto_milestones(manual: list[dict]) -> list[dict]:
    """从 `version.json` 的 git 历史推导版本边界，并与 0.x 手工切点合并。

    边界定义（每个版本的 `until` = 右闭上界）：
      - 历史版本：**下一个版本的 bump 时刻**（发版即 bump，天然边界）
      - 最新版本：**自己的部署完成标记**；找不到标记则退回自己的 bump 时刻
        （退回情况下后续提交进「未发版」桶——无法证明已发布的内容，宁可不归）

    返回按 until 升序排列的 milestone 列表，字段与手工切点兼容，并带
    `from_git: True` 标记，便于上层区分来源与渲染。
    """
    # 1) git 历史里的版本时间线
    # ⚠️ 用 %ad（author date）而不是 %ci，与 parse_commits() 的 --date=iso-strict 口径一致，
    #    否则 rebase/cherry-pick 后 author 与 commit 时刻不同会出现错桶。
    try:
        log = subprocess.run(
            ["git", "-C", str(ROOT), "log", "--date=iso-strict",
             "--format=%H|%ad", "--", "pwa/version.json"],
            capture_output=True, text=True, encoding="utf-8", errors="replace")
        if log.returncode != 0:
            raise SystemExit(f"git log 执行失败：{log.stderr.strip()}")
    except OSError as e:
        raise SystemExit(f"git 不可用（{type(e).__name__}）：无法推导版本边界")

    derived: list[dict] = []
    for line in (log.stdout or "").strip().split("\n"):
        if not line.strip():
            continue
        commit, stamp = line.split("|", 1)
        version = _version_of_commit(commit)
        if not version:
            continue
        # 归一成 iso-strict 的 T 分隔写法，与 assign_release() 的比较口径一致
        # （曾经的坑：%ci 给的是空格分隔，与 T 分隔做字符串比较会全部失配 → 版本全空）
        ts = stamp.strip()[:19].replace(" ", "T")
        derived.append({
            "version": version,
            "bump": ts,
            "date": ts[:10],
            "from_git": True,
        })

    if not derived:
        raise SystemExit(
            "无法从 pwa/version.json 的 git 历史推导版本边界（0 条）——"
            "检查仓库是否被浅克隆，或 version.json 是否从未提交")

    derived.sort(key=lambda m: m["bump"])

    # 1.5) 计算每个版本的上界 until：**优先用该版本的部署完成标记，没有则退回自己的 bump 时刻**。
    #   为什么不是「下一个版本的 bump」：bump 是发版的**开始**，紧随其后的提交（移除推送、
    #   重建 dist…）会随同一次部署上线，属于本版本。用下一个 bump 当上界会把这些切给下一版，
    #   造成「本版只剩几个构建提交、内容被切碎」（实测 1.17.0 会从 15 条掉到 5 条）。
    #   没有部署标记的版本退回 bump 时刻：其窗口 = (上界的上界, 自己的 bump]，即经典语义。
    marks = _deploy_markers()
    for m in derived:
        m["until"] = marks.get(m["version"], m["bump"])

    # 1.2) ★ 处理「版本已 bump 但尚未提交」——release.py 的构建步骤正是这个状态：
    #      先 write_version() 改工作区，再跑 build（内部调本脚本），最后才 commit。
    #      若不特殊处理，新版本在 git 历史里不存在 → 构建直接失败。
    #      做法：把工作区版本补一个**临时边界**，上界取 max(now, HEAD 时刻, 上一版 until + 1s)，
    #      于是它的窗口 = (上一版 until, now]，正好把「攒到现在还没发版」的提交全部归拢。
    #      发版提交完成后，下一轮会从 git 历史（及其部署标记）重新推导，自动收敛。
    #      ⚠️ 必须在算完各版 until 之后再追加，否则读到尚未赋值的 until 会崩（实测过）。
    cur_ver = load_version()
    if cur_ver and not any(m["version"] == cur_ver for m in derived):
        now = datetime.now(CST).replace(tzinfo=None, microsecond=0).strftime("%Y-%m-%dT%H:%M:%S")
        head_time = _head_commit_time()
        head_ts = (head_time or datetime.min).strftime("%Y-%m-%dT%H:%M:%S")
        prev_until = derived[-1]["until"] if derived else ""
        until = max(now, head_ts, prev_until)
        if prev_until and until == prev_until:
            # 时钟回拨或同秒：加 1 秒保证严格递增
            base = _parse_local_ts(prev_until)
            until = (base + timedelta(seconds=1)).strftime("%Y-%m-%dT%H:%M:%S")
        derived.append({
            "version": cur_ver,
            "bump": until,
            "until": until,
            "date": until[:10],
            "from_git": True,
            "pending": True,   # 留痕：这条边界来自工作区版本，尚未提交
        })

    # 单调性保护：until 必须严格递增，否则 assign_release 会乱序命中
    for i in range(1, len(derived)):
        if derived[i]["until"] <= derived[i - 1]["until"]:
            derived[i]["until"] = derived[i]["bump"] if derived[i]["bump"] > derived[i - 1]["until"] \
                else derived[i - 1]["until"]

    # 2) 只保留 1.0.0 之前的手工切点（0.x），1.0.0 起一律用 git 推导边界的**时刻**
    kept_manual = [m for m in manual if _lt_version(m["version"], AUTO_BOUNDARY)]
    for m in kept_manual:
        m["from_git"] = False

    # 3) 合并：git 推导提供**边界时刻**，手工记录提供**文案**（title / highlights）。
    #    ⚠️ 不能直接丢弃手工记录 —— 否则手写的 title 与亮点全丢（实测：1.17.0 的
    #    「安全响应头与数据备份 · 标题左对齐 · 移除推送」与 4 条亮点会变成空）。
    manual_by_version = {m["version"]: m for m in manual}
    merged: list[dict] = []
    for m in derived:
        src = manual_by_version.get(m["version"])
        if src:
            m["title"] = src.get("title", "")
            m["highlights"] = src.get("highlights") or []
        merged.append(m)
    seen = {m["version"] for m in merged}
    merged += [m for m in kept_manual if m["version"] not in seen]
    merged.sort(key=lambda m: m["until"])
    return merged


def _lt_version(a: str, b: str) -> bool:
    """粗粒度版本比较（只看 x.y.z 数值），用于判断是否早于分界版本。"""
    pa = [int(x) if x.isdigit() else 0 for x in str(a).split(".")[:3]]
    pb = [int(x) if x.isdigit() else 0 for x in str(b).split(".")[:3]]
    while len(pa) < 3:
        pa.append(0)
    while len(pb) < 3:
        pb.append(0)
    return tuple(pa) < tuple(pb)



def _parse_local_ts(value: str) -> datetime:
    """把 '2026-10-31T23:59:59' 之类的本地时刻解析成 datetime（忽略时区后缀）。"""
    text = str(value)[:19].replace(" ", "T")
    return datetime.strptime(text, "%Y-%m-%dT%H:%M:%S")


def _head_commit_time() -> datetime | None:
    """HEAD 提交的提交时间（本地时区），用来保证新切点不会漏掉已经存在的提交。"""
    try:
        r = subprocess.run(
            ["git", "-C", str(ROOT), "log", "-1", "--date=iso-strict", "--format=%cd"],
            capture_output=True, text=True, encoding="utf-8", errors="replace")
    except OSError:
        return None
    if r.returncode != 0 or not (r.stdout or "").strip():
        return None
    try:
        return _parse_local_ts(r.stdout.strip())
    except ValueError:
        return None


def auto_highlights(items: list[dict]) -> list[str]:
    """没有手写亮点时，从用户可见的条目里挑 3 条当作亮点。

    只取非 dev（test/chore/docs + 工程 scope）的条目，原文即 commit 标题，
    不编造文案 —— 有手写 highlights 时永远优先用人工那三条。

    2026-11-03（方案 B）：**不强制**发版时手写亮点。理由是上一轮事故（62 条挤进 1.17.0）
    恰恰源于「漏了一个人工动作」，再引入一个人工门槛等于重蹈覆辙。
    """
    picked: list[str] = []
    for commit in items:
        if commit["type"] in DEV_TYPES:
            continue
        text = commit["text"]
        if text and text not in picked:
            picked.append(text)
        if len(picked) >= 3:
            break
    return picked


def assign_release(commit_date: str, milestones: list[dict]) -> dict | None:
    """取 until 覆盖该时刻的最早（最接近）那个版本；**超出所有切点返回 None**。

    commit_date 为 iso-strict（如 2026-10-18T19:10:59+08:00），milestone 的 until
    为本地时刻（如 2026-10-18T18:00:00）。两边都截到「秒」再比，
    忽略时区后缀差异，也不受秒以下精度影响。

    ⚠️ 2026-11-03 行为变更：原来越界会兜到 milestones[-1]（最新版本），
    导致「三天没发版 → 62 个提交全被塞进 1.17.0 卡片」的事故（卡片 77 条、跨 4 天、
    自相矛盾）。现在返回 None，由调用方放进独立的「未发版」桶 ——
    结构上不可能再让已发版的卡片膨胀。
    """
    key = str(commit_date)[:19]
    for milestone in milestones:
        if key <= str(milestone["until"])[:19]:
            return milestone
    return None


def _build_groups(items: list[dict]) -> tuple[list[dict], dict]:
    """把一批提交转成前端消费的 groups/counts 结构。"""
    groups, counts = [], {}
    for group_key in GROUP_ORDER:
        group_items = [c for c in items if TYPE_TO_GROUP[c["type"]] == group_key]
        if not group_items:
            continue
        out_items = []
        for commit in group_items:
            text = commit["text"]
            if commit["type"] == "perf":
                text = f"性能：{text}"
            out_items.append(
                {
                    "text": text,
                    "scope": commit["scope"],
                    "hash": commit["hash"],
                    "date": commit["date"],
                    "breaking": commit["breaking"],
                    # 内部改动（test/chore/docs/style + 工程 scope）：前端默认折叠
                    "dev": commit["type"] in DEV_TYPES or commit["scope"] in DEV_SCOPES,
                }
            )
        groups.append({"type": group_key, "label": GROUP_LABELS[group_key], "items": out_items})
        counts[group_key] = len(out_items)
    return groups, counts


def build_payload(commits: list[dict], milestones: list[dict]) -> tuple[dict, dict]:
    buckets: dict[str, list[dict]] = {m["version"]: [] for m in milestones}
    buckets[UNRELEASED] = []
    for commit in commits:
        target = assign_release(commit["date"], milestones)
        buckets[target["version"] if target else UNRELEASED].append(commit)

    releases = []
    for milestone in reversed(milestones):  # 输出从新到旧
        items = sorted(buckets[milestone["version"]], key=lambda c: c["date"], reverse=True)
        # 空版本隐藏：自动推导出的版本若一条提交都没有（如 1.16.1，bump 间隔 10 分钟零提交），
        # 不渲染空卡片。⚠️ 但**工作区版本（pending）永不隐藏** —— 否则 release.py 发版时
        # 「更新记录最新版本 == version.json」的构建断言会误判失败。
        if not items and milestone.get("from_git") and not milestone.get("pending"):
            continue
        groups, counts = _build_groups(items)
        # 手写亮点优先；没有手写时从真实条目挑 3 条兜底（方案 B：不强制人工写）
        highlights = milestone.get("highlights") or []
        if not highlights:
            highlights = auto_highlights(items)
        releases.append(
            {
                "version": milestone["version"],
                "date": milestone["date"],
                "title": milestone.get("title", ""),
                # 亮点：手写优先，否则自动挑 3 条 —— 保证每版都有「人话」
                "highlights": highlights,
                "autoCut": not bool(milestone.get("from_git")),
                "fromGit": bool(milestone.get("from_git")),
                "counts": counts,
                "groups": groups,
            }
        )

    # 未发版桶：默认不进 releases（用户主视图看不到），单独放一个字段。
    # 它存在的意义：让「攒了几天没发版」这件事可见，而不是悄悄塞进上一版卡片。
    unreleased_items = sorted(buckets[UNRELEASED], key=lambda c: c["date"], reverse=True)
    unreleased = None
    if unreleased_items:
        u_groups, u_counts = _build_groups(unreleased_items)
        visible = sum(1 for g in u_groups for it in g["items"] if not it["dev"])
        unreleased = {
            "count": len(unreleased_items),
            "visibleCount": visible,
            "groups": u_groups,
            "counts": u_counts,
            "highlights": auto_highlights(unreleased_items),
        }

    payload = {
        "version": releases[0]["version"] if releases else "",
        "generatedAt": datetime.now(CST).isoformat(timespec="seconds"),
        "totalCommits": sum(1 for r in releases for g in r["groups"] for _ in g["items"])
                       + (unreleased["count"] if unreleased else 0),
        "releases": releases,
        # 未发版桶：前端默认折叠；null 表示没有未发版内容
        "unreleased": unreleased,
    }
    return payload, buckets



def render_markdown(payload: dict) -> str:
    lines = [
        "# 更新日志",
        "",
        "> 本文件由 `pwa/scripts/gen_changelog.py` 从 git 历史自动生成，请勿手改。",
        "> 格式遵循 [Keep a Changelog](https://keepachangelog.com/zh-CN/1.1.0/)，"
        "版本号遵循 [语义化版本](https://semver.org/lang/zh-CN/)。",
        "> 版本边界自动取自 `pwa/version.json` 的 git 历史（2026-11-03 起），无需手工维护切点。",
        "",
    ]

    # 未发版区块（对应 Keep a Changelog 的 [Unreleased]）——排在最新版本之前
    u = payload.get("unreleased")
    if u:
        lines.append("## [未发版]")
        lines.append("")
        lines.append(f"> 已在仓库、尚未发版：共 {u['count']} 条（用户可见 {u['visibleCount']} 条）。")
        lines.append("> 下次发版时这些内容会自动归入新版本卡片。")
        lines.append("")
        u_hl = u.get("highlights") or []
        if u_hl:
            lines.append("**本期亮点**")
            lines.append("")
            for h in u_hl:
                lines.append(f"- {h}")
            lines.append("")
        for group in u["groups"]:
            lines.append(f"### {group['label']}")
            for item in group["items"]:
                suffix = "（不兼容变更）" if item["breaking"] else ""
                lines.append(f"- {item['text']}{suffix} ({item['hash']})")
            lines.append("")

    for release in payload["releases"]:
        lines.append(f"## [{release['version']}] - {release['date']}")
        lines.append("")
        if release["title"]:
            lines.append(f"{release['title']}")
            lines.append("")
        if release.get("highlights"):
            lines.append("**本次亮点**")
            lines.append("")
            for h in release["highlights"]:
                lines.append(f"- {h}")
            lines.append("")
        for group in release["groups"]:
            lines.append(f"### {group['label']}")
            for item in group["items"]:
                suffix = "（不兼容变更）" if item["breaking"] else ""
                hashed = f" ({item['hash']})"
                lines.append(f"- {item['text']}{suffix}{hashed}")
            lines.append("")
    return "\n".join(lines).rstrip() + "\n"


def write_files(payload: dict) -> None:
    JSON_OUT.parent.mkdir(parents=True, exist_ok=True)
    with JSON_OUT.open("w", encoding="utf-8", newline="\n") as fh:
        json.dump(payload, fh, ensure_ascii=False, indent=2)
        fh.write("\n")
    with MD_OUT.open("w", encoding="utf-8", newline="\n") as fh:
        fh.write(render_markdown(payload))


def self_check(payload: dict, kept: list[dict], raw_total: int, filtered: list[dict],
               expect_version: str = "") -> bool:
    print("=" * 60)
    print(f"版本数：{len(payload['releases'])}")
    print(f"git 原始 commit 数：{raw_total}，过滤噪音：{len(filtered)}，入库：{payload['totalCommits']}")
    if filtered:
        for commit in filtered:
            print(f"  - 过滤 {commit['hash']} {commit['date']} {commit['subject']}")
    print("-" * 60)
    for release in payload["releases"]:
        n = sum(len(g["items"]) for g in release["groups"])
        vis = sum(1 for g in release["groups"] for it in g["items"] if not it["dev"])
        src = "git" if release.get("fromGit") else "手工"
        print(f"  {release['version']:<7} {release['date']}  {n:>3} 条（可见 {vis}）  [{src}] {release['title']}")
    u = payload.get("unreleased")
    if u:
        print(f"  ★ 未发版：{u['count']} 条（用户可见 {u['visibleCount']}）")

    with JSON_OUT.open("r", encoding="utf-8") as fh:
        reloaded = json.load(fh)
    counted = sum(len(g["items"]) for r in reloaded["releases"] for g in r["groups"])
    counted += (u["count"] if u else 0)
    print("-" * 60)
    print(f"changelog.json 可解析：是；条目合计 {counted}，totalCommits {reloaded['totalCommits']}")

    if kept:
        newest, oldest = kept[0], kept[-1]  # git log 顺序：新 → 旧
        print(f"最早条目：{oldest['date']} {oldest['subject']} ({oldest['hash']})")
        print(f"最晚条目：{newest['date']} {newest['subject']} ({newest['hash']})")
    md_lines = len(MD_OUT.read_text(encoding="utf-8").splitlines()) if MD_OUT.exists() else 0
    print(f"CHANGELOG.md 行数：{md_lines}")

    problems: list[str] = []
    if counted != reloaded["totalCommits"]:
        problems.append(f"条目合计 {counted} ≠ totalCommits {reloaded['totalCommits']}")
    # 手工切点的空版本才算问题；自动推导的空版本已被隐藏（如 1.16.1，bump 间隔零提交）
    empty = [r["version"] for r in reloaded["releases"]
             if not r["groups"] and not r.get("fromGit")]
    if empty:
        problems.append(f"这些手工切点版本没有任何条目（切点有误）：{', '.join(empty)}")

    # ★ 2026-11-01 事故防线：更新记录的最新版本必须等于 pwa/version.json 的版本。
    latest = reloaded["releases"][0]["version"] if reloaded["releases"] else ""
    print(f"最新版本：更新记录 v{latest} / version.json v{expect_version or '?'}")
    if expect_version and latest != expect_version:
        problems.append(
            f"更新记录最新版本 v{latest} ≠ pwa/version.json v{expect_version}"
            f"（version.json 尚未提交到 git，版本边界推导不到它）")

    # ★ 2026-11-03 新增：卡片内容不得越界到卡片日期之后（防「三天堆一版」复发）。
    # 自动推导下结构上已不可能，但手工切点仍可能写错，保留这道防线。
    for r in reloaded["releases"]:
        dates = [it["date"][:10] for g in r["groups"] for it in g["items"]]
        if dates and max(dates) > r["date"]:
            problems.append(
                f"v{r['version']} 卡片日期 {r['date']}，但含 {max(dates)} 的条目（卡片越界）")

    if problems:
        for p in problems:
            print(f"  ⛔ {p}")
    print("自检：" + ("通过" if not problems else "未通过"))
    print("=" * 60)
    return not problems


def main() -> int:
    parser = argparse.ArgumentParser(description="从 git 历史生成 changelog.json 与 CHANGELOG.md")
    parser.add_argument("--check", action="store_true", help="只做解析与自检，不写文件")
    parser.add_argument("--no-auto-cut", action="store_true",
                        help="版本号不在切点表里时不自动补切点，直接失败（CI 严格模式）")
    args = parser.parse_args()

    version = load_version()
    milestones = load_milestones()
    # 2026-11-03：版本边界改为从 pwa/version.json 的 git 历史自动推导（0.x 仍用手工切点）。
    # 不再需要「缺切点就自动补一条」——没有切点可漏。
    milestones = auto_milestones(milestones)
    if not any(m["version"] == version for m in milestones):
        print(f"⛔ pwa/version.json = v{version}，但 git 历史里推导不到这个版本。")
        print("   可能原因：version.json 还没提交（工作区改动）。先提交再生成。")
        return 1

    commits = parse_commits(git_log())
    kept = [c for c in commits if not NOISE_RE.match(c["subject"])]
    filtered = [c for c in commits if NOISE_RE.match(c["subject"])]

    payload, _ = build_payload(kept, milestones)
    if not args.check:
        write_files(payload)
    return 0 if self_check(payload, kept, len(commits), filtered, version) else 1


if __name__ == "__main__":
    sys.exit(main())
