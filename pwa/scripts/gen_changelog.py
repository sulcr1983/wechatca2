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
                    }
                )
            groups.append({"type": group_key, "label": GROUP_LABELS[group_key], "items": out_items})
            counts[group_key] = len(out_items)
        releases.append(
            {
                "version": milestone["version"],
                "date": milestone["date"],
                "title": milestone["title"],
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


def self_check(payload: dict, kept: list[dict], raw_total: int, filtered: list[dict]) -> bool:
    print("=" * 60)
    print(f"版本数：{len(payload['releases'])}")
    print(f"git 原始 commit 数：{raw_total}，过滤噪音：{len(filtered)}，入库：{payload['totalCommits']}")
    if filtered:
        for commit in filtered:
            print(f"  - 过滤 {commit['hash']} {commit['date']} {commit['subject']}")
    print("-" * 60)
    for release in payload["releases"]:
        print(f"  {release['version']:<7} {release['date']}  {len(sum((g['items'] for g in release['groups']), [])):>3} 条  {release['title']}")
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

    ok = counted == reloaded["totalCommits"] and all(r["groups"] for r in reloaded["releases"])
    print("自检：" + ("通过" if ok else "未通过"))
    print("=" * 60)
    return ok


def main() -> int:
    parser = argparse.ArgumentParser(description="从 git 历史生成 changelog.json 与 CHANGELOG.md")
    parser.add_argument("--check", action="store_true", help="只做解析与自检，不写文件")
    args = parser.parse_args()

    milestones = load_milestones()
    commits = parse_commits(git_log())
    kept = [c for c in commits if not NOISE_RE.match(c["subject"])]
    filtered = [c for c in commits if NOISE_RE.match(c["subject"])]

    payload, _ = build_payload(kept, milestones)
    if not args.check:
        write_files(payload)
    return 0 if self_check(payload, kept, len(commits), filtered) else 1


if __name__ == "__main__":
    sys.exit(main())
