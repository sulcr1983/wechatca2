#!/usr/bin/env python3
"""output/ 清理脚本（U-15，2026-10-24）

output/ 里全是**可再生**的测试产物与截图（渲染结果、E2E 截图、审计报告）。
长期累积会到几十上百 MB。本脚本按「保留最近 N 天」清理，默认只预览不动手。

安全边界（重要）：
  - **只处理 output/ 内部**，绝不触碰 output/ 之外任何路径
  - data/、public/、pwa/dist/ 一律不碰（前者是用户数据，后者是部署产物）
  - 默认 --dry-run（只打印不删）；要真删必须显式 --apply
  - 保留 .gitkeep 与最近 gate-run 日志（排查用）

用法：
    python scripts/clean_output.py                  # 预览：默认保留 7 天内
    python scripts/clean_output.py --days 3         # 预览：保留 3 天内
    python scripts/clean_output.py --apply --days 7 # 真删
    python scripts/clean_output.py --apply --days 0 # 清空（只留 .gitkeep 与最新一次 gate 日志）
"""

from __future__ import annotations

import argparse
import sys
import time
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
OUT = ROOT / "output"

# 永不删除的项（相对 output/）
KEEP_NAMES = {".gitkeep"}
KEEP_PREFIXES = ("gate-run/",)   # 门禁日志保留最近一份，其余按时间清


def human(n: int) -> str:
    for unit in ("B", "KB", "MB", "GB"):
        if n < 1024:
            return f"{n:.1f}{unit}"
        n /= 1024
    return f"{n:.1f}TB"


def collect(days: float) -> tuple[list[Path], int, int]:
    """返回 (待删文件列表, 待删总字节, 保留总字节)"""
    cutoff = time.time() - days * 86400
    doomed: list[Path] = []
    free_b = 0
    keep_b = 0

    if not OUT.exists():
        return [], 0, 0

    for p in OUT.rglob("*"):
        if not p.is_file():
            continue
        rel = p.relative_to(OUT).as_posix()
        if p.name in KEEP_NAMES:
            keep_b += p.stat().st_size
            continue
        try:
            mtime = p.stat().st_mtime
        except OSError:
            continue
        if days <= 0 or mtime < cutoff:
            doomed.append(p)
            free_b += p.stat().st_size
        else:
            keep_b += p.stat().st_size

    # 门禁日志：无论多新，只保留最新 1 份（避免 --days 很大时仍堆一堆）
    gate_logs = sorted((OUT / "gate-run").glob("*.log"), key=lambda x: x.stat().st_mtime, reverse=True) \
        if (OUT / "gate-run").exists() else []
    for old in gate_logs[1:]:
        if old not in doomed:
            doomed.append(old)
            free_b += old.stat().st_size
            keep_b -= old.stat().st_size

    return doomed, free_b, max(keep_b, 0)


def prune_empty_dirs() -> int:
    """删完文件后清掉空目录（保留 output/ 本身）"""
    n = 0
    for d in sorted((p for p in OUT.rglob("*") if p.is_dir()), key=lambda x: len(x.parts), reverse=True):
        try:
            if not any(d.iterdir()):
                d.rmdir()
                n += 1
        except OSError:
            pass
    return n


def main() -> int:
    try:
        sys.stdout.reconfigure(encoding="utf-8", errors="replace")
    except Exception:
        pass

    ap = argparse.ArgumentParser()
    ap.add_argument("--days", type=float, default=7, help="保留最近 N 天（0 = 全清）")
    ap.add_argument("--apply", action="store_true", help="真删（默认只预览）")
    ap.add_argument("--quiet", action="store_true", help="只输出汇总")
    args = ap.parse_args()

    if not OUT.exists():
        print("output/ 不存在，无需清理")
        return 0

    total_before = sum(p.stat().st_size for p in OUT.rglob("*") if p.is_file())
    doomed, free_b, keep_b = collect(args.days)

    if not args.quiet:
        print(f"output/ 当前：{len([p for p in OUT.rglob('*') if p.is_file()])} 文件 / {human(total_before)}")
        print(f"清理策略：保留最近 {args.days:g} 天" if args.days > 0 else "清理策略：全部清空")
        print(f"待删：{len(doomed)} 个文件 / {human(free_b)}")
        if doomed and len(doomed) <= 40:
            for p in doomed:
                print(f"  - {p.relative_to(OUT).as_posix()}")
        elif doomed:
            for p in doomed[:20]:
                print(f"  - {p.relative_to(OUT).as_posix()}")
            print(f"  … 另 {len(doomed) - 20} 个")

    if not args.apply:
        print(f"\n[预览模式] 未删除任何文件。要真删请加 --apply")
        print(f"预计清理后：{human(total_before - free_b)}")
        return 0

    failed = 0
    for p in doomed:
        try:
            p.unlink()
        except OSError as e:
            failed += 1
            print(f"  删除失败 {p}: {e}", file=sys.stderr)
    dirs = prune_empty_dirs()

    total_after = sum(p.stat().st_size for p in OUT.rglob("*") if p.is_file()) if OUT.exists() else 0
    print(f"\n✅ 已删除 {len(doomed) - failed} 个文件，释放 {human(free_b)}"
          + (f"，清理空目录 {dirs} 个" if dirs else ""))
    print(f"output/ 现在：{human(total_after)}（清理前 {human(total_before)}）")
    if failed:
        print(f"⚠️ {failed} 个文件删除失败", file=sys.stderr)
        return 1
    return 0


if __name__ == "__main__":
    sys.exit(main())
