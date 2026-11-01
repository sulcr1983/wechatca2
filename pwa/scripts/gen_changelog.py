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

TYPE_WHITELIST = {"feat", "fix", "docs", "chore", "test", "refactor", "perf", "style"}

# 内部改动：默认折叠进「开发者细节」，不占用用户的第一屏
# （refactor / perf 保留在正文 —— 它们对用户有体感，比如"排版更快了"）
DEV_TYPES = {"test", "chore", "docs", "style", "build", "ci"}

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
    "test": "other",
    "chore": "other",
    "other": "other",
}

# 噪音：发布提交、合并、回滚
NOISE_RE = re.compile(r"^(chore\(release\)|Merge |Revert )")
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
    with MILESTONES_FILE.open("r", encoding="utf-8") as fh:
        milestones = json.load(fh)
    if not milestones:
        raise SystemExit("changelog_milestones.json 为空")
    # 配置按从新到旧书写；内部按时间升序做归属判断
    milestones = sorted(milestones, key=lambda m: m["until"])
    versions = [m["version"] for m in milestones]
    if len(set(versions)) != len(versions):
        raise SystemExit(f"版本号重复：{versions}")
    return milestones


def write_milestones(milestones: list[dict]) -> None:
    """按「从新到旧」写回配置文件（与人工书写习惯一致）。"""
    ordered = sorted(milestones, key=lambda m: m["until"], reverse=True)
    with MILESTONES_FILE.open("w", encoding="utf-8", newline="\n") as fh:
        json.dump(ordered, fh, ensure_ascii=False, indent=2)
        fh.write("\n")


def load_version() -> str:
    """pwa/version.json 的语义化版本 —— 更新记录必须覆盖到这个版本。"""
    version_file = ROOT / "pwa" / "version.json"
    try:
        return str(json.loads(version_file.read_text(encoding="utf-8")).get("version") or "")
    except (OSError, ValueError) as e:
        raise SystemExit(f"读不了 pwa/version.json（{type(e).__name__}: {e}）")


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


def ensure_milestone(milestones: list[dict], version: str) -> tuple[list[dict], dict | None]:
    """保证 version.json 的版本在切点表里；缺了就追加一条「自动切点」。

    2026-11-01 事故：1.14.0 之后连续三次发版（1.16.0 / 1.16.1 / 1.17.0）都忘了
    手工加切点，于是所有改动都被塞进 1.14.0，用户打开更新记录看不到新内容。
    现在由脚本兜住：版本号变了但切点没加 → 自动补一条，不再依赖人记得。

    返回 (milestones, 新增的 milestone 或 None)。
    """
    if not version:
        return milestones, None
    if any(m["version"] == version for m in milestones):
        return milestones, None

    prev = milestones[-1] if milestones else None
    now = datetime.now(CST).replace(tzinfo=None, microsecond=0)
    head = _head_commit_time()
    candidates = [now] + ([head] if head else [])
    if prev:
        # 新切点必须晚于上一条的 until，否则排序后会乱序 / 覆盖
        try:
            candidates.append(_parse_local_ts(prev["until"]) + timedelta(seconds=1))
        except (KeyError, ValueError):
            pass
    until = max(candidates)
    milestone = {
        "version": version,
        "date": now.strftime("%Y-%m-%d"),
        "title": "",
        "until": until.strftime("%Y-%m-%dT%H:%M:%S"),
        # 自动补的切点做标记：以后人工补 title / highlights 时能看出来是兜底产物
        "auto": True,
    }
    return milestones + [milestone], milestone


def auto_highlights(items: list[dict]) -> list[str]:
    """自动切点没有手写亮点时，从用户可见的条目里挑 3 条当作亮点。

    只取非 dev（test/chore/docs 折叠项）且非发布噪音的条目，原文即 commit 标题，
    不编造文案 —— 有手写 highlights 时永远优先用人工那三条。
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


def assign_release(commit_date: str, milestones: list[dict]) -> dict:
    """取 until 覆盖该时刻的最早（最接近）那个版本；越界兜到最新版本。

    commit_date 为 iso-strict（如 2026-10-18T19:10:59+08:00），milestone 的 until
    为本地时刻（如 2026-10-18T18:00:00）。两边都截到「秒」再比，
    忽略时区后缀差异，也不受秒以下精度影响。
    """
    key = str(commit_date)[:19]
    for milestone in milestones:
        if key <= str(milestone["until"])[:19]:
            return milestone
    return milestones[-1]


def build_payload(commits: list[dict], milestones: list[dict]) -> tuple[dict, dict]:
    buckets = {m["version"]: [] for m in milestones}
    for commit in commits:
        buckets[assign_release(commit["date"], milestones)["version"]].append(commit)

    releases = []
    for milestone in reversed(milestones):  # 输出从新到旧
        items = sorted(buckets[milestone["version"]], key=lambda c: c["date"], reverse=True)
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
                        # 内部改动（test/chore/docs/style）：前端默认折叠，搜索时才展开
                        "dev": commit["type"] in DEV_TYPES,
                    }
                )
            groups.append({"type": group_key, "label": GROUP_LABELS[group_key], "items": out_items})
            counts[group_key] = len(out_items)
        # 手写亮点优先；自动补的切点没有手写亮点时，从真实条目里挑 3 条兜底，
        # 否则用户在更新记录里看到的是一个只有版本号、没有内容的空卡片。
        highlights = milestone.get("highlights") or []
        if not highlights and milestone.get("auto"):
            highlights = auto_highlights(items)
        releases.append(
            {
                "version": milestone["version"],
                "date": milestone["date"],
                "title": milestone["title"],
                # 发版时手写的 3 条「人话」亮点：更新记录与发布小票优先展示它们
                "highlights": highlights,
                # 切点是脚本兜底补的（没人工写 title/highlights）：留痕，便于事后补文案
                "autoCut": bool(milestone.get("auto")),
                "counts": counts,
                "groups": groups,
            }
        )

    payload = {
        "version": releases[0]["version"] if releases else "",
        "generatedAt": datetime.now(CST).isoformat(timespec="seconds"),
        "totalCommits": sum(1 for r in releases for g in r["groups"] for _ in g["items"]),
        "releases": releases,
    }
    return payload, buckets


def render_markdown(payload: dict) -> str:
    lines = [
        "# 更新日志",
        "",
        "> 本文件由 `pwa/scripts/gen_changelog.py` 从 git 历史自动生成，请勿手改。",
        "> 格式遵循 [Keep a Changelog](https://keepachangelog.com/zh-CN/1.1.0/)，"
        "版本号遵循 [语义化版本](https://semver.org/lang/zh-CN/)。",
        "",
    ]
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
        flag = "  [自动切点]" if release.get("autoCut") else ""
        print(f"  {release['version']:<7} {release['date']}  {len(sum((g['items'] for g in release['groups']), [])):>3} 条  {release['title']}{flag}")
        if not release["groups"]:
            print(f"    !! {release['version']} 没有任何条目，里程碑切分有误")

    with JSON_OUT.open("r", encoding="utf-8") as fh:
        reloaded = json.load(fh)
    counted = sum(len(g["items"]) for r in reloaded["releases"] for g in r["groups"])
    diff_note = "噪音过滤导致" if filtered else "无噪音，完全一致"
    print("-" * 60)
    print(f"changelog.json 可解析：是；条目合计 {counted}，totalCommits {reloaded['totalCommits']}，"
          f"差值 {counted - reloaded['totalCommits']}（{diff_note}）")

    if kept:
        newest, oldest = kept[0], kept[-1]  # git log 顺序：新 → 旧
        print(f"最早条目：{oldest['date']} {oldest['subject']} ({oldest['hash']})")
        print(f"最晚条目：{newest['date']} {newest['subject']} ({newest['hash']})")
    md_lines = len(MD_OUT.read_text(encoding="utf-8").splitlines()) if MD_OUT.exists() else 0
    print(f"CHANGELOG.md 行数：{md_lines}")

    problems: list[str] = []
    if counted != reloaded["totalCommits"]:
        problems.append(f"条目合计 {counted} ≠ totalCommits {reloaded['totalCommits']}")
    empty = [r["version"] for r in reloaded["releases"] if not r["groups"]]
    if empty:
        problems.append(f"这些版本没有任何条目（切点有误）：{', '.join(empty)}")

    # ★ 2026-11-01 事故防线：更新记录的最新版本必须等于 pwa/version.json 的版本。
    # 缺切点时所有新改动都会挤进旧版本卡片，用户打开更新记录看不到最新内容。
    latest = reloaded["releases"][0]["version"] if reloaded["releases"] else ""
    print(f"最新版本：更新记录 v{latest} / version.json v{expect_version or '?'}")
    if expect_version and latest != expect_version:
        problems.append(
            f"更新记录最新版本 v{latest} ≠ pwa/version.json v{expect_version}"
            f"（缺版本切点：在 changelog_milestones.json 补一条，或去掉 --no-auto-cut 让其自动补）")

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
    milestones, added = ensure_milestone(milestones, version)
    if added:
        # --check 与 --no-auto-cut 都是「严格模式」：只报警，不偷偷改配置
        if args.no_auto_cut or args.check:
            print("⛔ 更新记录缺版本切点：")
            print(f"   pwa/version.json = v{version}，但 changelog_milestones.json 里没有这个版本。")
            print("   后果：这个版本的所有改动都会被塞进上一版卡片，用户打开更新记录看不到最新内容。")
            print("   修复：补一条切点（version/date/title/until/highlights），或直接跑 "
                  "python pwa/scripts/gen_changelog.py 让其自动补切点。")
            return 1
        print(f"⚠️  pwa/version.json 是 v{version}，切点表里没有 —— 已自动补一条切点（date={added['date']}, until={added['until']}）")
        print("   建议事后补上 title 与 highlights（3 条人话），更新记录里才会好看。")
        write_milestones(milestones)

    commits = parse_commits(git_log())
    kept = [c for c in commits if not NOISE_RE.match(c["subject"])]
    filtered = [c for c in commits if NOISE_RE.match(c["subject"])]

    payload, _ = build_payload(kept, milestones)
    if not args.check:
        write_files(payload)
    return 0 if self_check(payload, kept, len(commits), filtered, version) else 1


if __name__ == "__main__":
    sys.exit(main())
