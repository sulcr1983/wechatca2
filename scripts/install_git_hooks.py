#!/usr/bin/env python3
"""git pre-push 钩子安装器 + 检查逻辑（P2，2026-10-25）

解决的问题：
  所有纪律都靠「人想起来跑」，于是每轮都要为同一件事交一次学费：
  - 换行符被编辑器/脚本改掉 → diff 变成整文件全删全加
  - 误把 dist（构建产物）提交进去
  - 脏着推送 → 部署被拦

做法：
  装一个 git pre-push 钩子，推送前自动跑三项检查（都可精确判定，不误报）：
    A 换行符漂移   .bat/.cmd 必须 CRLF、.sh 必须 LF（依 .gitattributes 约定）
    B 禁提交 dist  pwa/dist/ 与 dist/ 是构建产物，不应进 git
    C 文档一致性  调 doc_sync_check.py（数字与实际不符则拦）
  **不检查「工作区脏」**：推送前本来就该有未提交改动（比如刚改完还没提交），
  那条纪律交给 deploy.sh 和 preflight --deploy 管，钩子只管「推上去的东西对不对」。

用法：
    python scripts/install_git_hooks.py           # 安装（覆盖同名钩子前会备份）
    python scripts/install_git_hooks.py --uninstall
    python scripts/install_git_hooks.py --status  # 看当前装了哪些

设计原则：
  - 钩子本身也是 Python，跨平台（不依赖 bash，Windows 上也能跑）
  - 检查失败给出**具体文件 + 怎么修**，不只是一句 FAIL
  - 可跳过（`git push --no-verify`），但会提示「已跳过检查」
"""

from __future__ import annotations

import argparse
import shutil
import stat
import subprocess
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
HOOKS = ROOT / ".git" / "hooks"
HOOK_NAME = "pre-push"
PY = ROOT / ".venv" / "Scripts" / "python.exe"
if not PY.exists():
    PY = Path(sys.executable)

# 钩子脚本内容：调用本文件的 --run 模式
HOOK_BODY = """#!/bin/sh
# 自动生成（scripts/install_git_hooks.py）。要改检查逻辑请改那个脚本，别改这里。
# 临时跳过：git push --no-verify
exec "{py}" "{self}" --run
"""


def check_newlines() -> list[str]:
    """A 换行符漂移：按 .gitattributes 约定检查已跟踪文件"""
    problems: list[str] = []
    # 从 .gitattributes 读规则（单一真源）
    ga = ROOT / ".gitattributes"
    rules: list[tuple[str, str]] = []
    if ga.exists():
        for line in ga.read_text(encoding="utf-8", errors="replace").splitlines():
            line = line.strip()
            if not line or line.startswith("#"):
                continue
            parts = line.split()
            if len(parts) >= 3 and "eol=" in parts[-1]:
                rules.append((parts[0], parts[-1].split("=")[1]))
    if not rules:
        rules = [("*.bat", "crlf"), ("*.cmd", "crlf"), ("*.sh", "lf")]

    # 取已跟踪文件（只查工作区里存在的）
    r = subprocess.run(["git", "ls-files"], cwd=ROOT, capture_output=True,
                       text=True, encoding="utf-8", errors="replace")
    files = [f for f in (r.stdout or "").splitlines() if f.strip()]

    for pat, want in rules:
        suffix = pat.lstrip("*")
        for rel in files:
            if not rel.endswith(suffix):
                continue
            p = ROOT / rel
            if not p.exists():
                continue
            try:
                b = p.read_bytes()
            except Exception:
                continue
            has_crlf = b"\r\n" in b
            if want == "crlf" and not has_crlf and b:
                problems.append(f"{rel}：应为 CRLF，实际是 LF")
            elif want == "lf" and has_crlf:
                problems.append(f"{rel}：应为 LF，实际含 CRLF")
    return problems


def check_dist() -> list[str]:
    """B 构建产物不该进 git"""
    problems: list[str] = []
    r = subprocess.run(["git", "ls-files", "--cached"], cwd=ROOT, capture_output=True,
                       text=True, encoding="utf-8", errors="replace")
    tracked = (r.stdout or "").splitlines()
    bad = [f for f in tracked if f.startswith(("pwa/dist/", "dist/"))]
    if bad:
        problems.append(f"dist 构建产物被跟踪（{len(bad)} 个文件），应从 git 移除：")
        for f in bad[:5]:
            problems.append(f"   {f}")
        problems.append("   修复：git rm -r --cached pwa/dist")
    return problems


def check_docs() -> list[str]:
    """C 文档一致性"""
    script = ROOT / "scripts" / "doc_sync_check.py"
    if not script.exists():
        return []
    try:
        r = subprocess.run([str(PY), str(script)], cwd=ROOT, capture_output=True,
                           text=True, encoding="utf-8", errors="replace", timeout=120)
    except Exception:
        return []
    if r.returncode == 0:
        return []
    # 只取问题摘要行，避免刷屏
    lines = [ln.strip() for ln in (r.stdout or "").splitlines()
             if ln.strip().startswith("·")]
    return ["文档一致性检查未通过："] + lines[:8] + ["   修复：python scripts/doc_sync_check.py"]


def run_checks() -> int:
    try:
        sys.stdout.reconfigure(encoding="utf-8", errors="replace")
    except Exception:
        pass

    print("=" * 58)
    print("pre-push 检查（跳过检查：git push --no-verify）")
    print("=" * 58)

    groups = [("A 换行符", check_newlines()),
              ("B 构建产物", check_dist()),
              ("C 文档一致性", check_docs())]

    total = 0
    for label, probs in groups:
        if probs:
            total += len(probs)
            print(f"\n⛔ {label}：")
            for x in probs:
                print(f"   {x}")
        else:
            print(f"OK {label}")

    if total:
        print("\n" + "=" * 58)
        print(f"⛔ 推送被拦：{total} 个问题需先修（见上）")
        print("   确实要强推：git push --no-verify")
        return 1
    print("\n✅ pre-push 检查全部通过")
    return 0


def install() -> int:
    if not HOOKS.exists():
        print(f"ERROR: 找不到 {HOOKS}（不是 git 仓库？）", file=sys.stderr)
        return 2
    target = HOOKS / HOOK_NAME
    if target.exists():
        bak = HOOKS / f"{HOOK_NAME}.bak"
        shutil.copy2(target, bak)
        print(f"已备份原钩子到 {bak.name}")
    target.write_text(HOOK_BODY.format(py=PY.as_posix(),
                                       self=(ROOT / "scripts" / "install_git_hooks.py").as_posix()),
                      encoding="utf-8", newline="\n")
    # 加可执行位（Windows 上 git 仍认 sh 脚本）
    try:
        target.chmod(target.stat().st_mode | stat.S_IEXEC | stat.S_IXGRP | stat.S_IXOTH)
    except Exception:
        pass
    print(f"✅ 已安装 {target.relative_to(ROOT)}")
    print("   推送前会自动检查：换行符 / 构建产物 / 文档一致性")
    return 0


def uninstall() -> int:
    target = HOOKS / HOOK_NAME
    if not target.exists():
        print("未安装 pre-push 钩子")
        return 0
    target.unlink()
    print("✅ 已移除 pre-push 钩子")
    bak = HOOKS / f"{HOOK_NAME}.bak"
    if bak.exists():
        print(f"（备份仍在 {bak.name}，需要可手动恢复）")
    return 0


def status() -> int:
    target = HOOKS / HOOK_NAME
    if target.exists():
        print(f"✅ pre-push 已安装（{target}）")
        print("   跳过：git push --no-verify")
    else:
        print("⛔ pre-push 未安装")
        print("   安装：python scripts/install_git_hooks.py")
    return 0


def main() -> int:
    try:
        sys.stdout.reconfigure(encoding="utf-8", errors="replace")
    except Exception:
        pass

    ap = argparse.ArgumentParser()
    ap.add_argument("--run", action="store_true", help="（钩子内部用）执行检查")
    ap.add_argument("--uninstall", action="store_true")
    ap.add_argument("--status", action="store_true")
    args = ap.parse_args()

    if args.run:
        return run_checks()
    if args.uninstall:
        return uninstall()
    if args.status:
        return status()
    return install()


if __name__ == "__main__":
    sys.exit(main())
