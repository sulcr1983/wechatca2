#!/usr/bin/env python3
"""一键发版（P0，2026-10-25）

把原来要手动走 5 步、还有顺序坑的发布流程，收成一条命令。

⚠️ 原流程的坑（2026-10-25 实测）：
   build.mjs 会重写两个**已跟踪文件**（CHANGELOG.md / pwa/public/changelog.json），
   而 deploy.sh 要求工作区干净。所以顺序必须是：
       build → 提交这两个生成物 → preflight --deploy → deploy
   先提交后 build 会立刻把工作区弄脏、部署被拦。

流程（每一步失败即停，不会带着问题往下走）：
   1 前置检查      preflight（dist 新鲜度 / 工作区）
   2 升版本        pwa/version.json 的 patch +1（可用 --version 指定）
   3 生成更新记录  pwa/scripts/gen_changelog.py
   4 构建          node pwa/scripts/build.mjs（注入 build = git 提交数）
   5 本地层门禁    run_gates.py（测当前代码，不联网）
   6 提交生成物    CHANGELOG.md + changelog.json + version.json
   7 部署前复查    preflight --deploy（工作区脏即拦）
   8 推送          git push origin main
   9 部署          pwa/scripts/deploy.sh
  10 线上验证      run_gates.py --online（版本对齐 + 线上冒烟）

用法：
    python scripts/release.py --dry-run          # 只演练，不执行（强烈建议先跑这个）
    python scripts/release.py                    # 正式发版（patch +1）
    python scripts/release.py --version 1.6.0    # 指定版本
    python scripts/release.py --skip-tests       # 跳过门禁（仅紧急热修，需 --yes）
    python scripts/release.py --no-deploy        # 只到「提交 + 推送」，不部署

设计原则：
  - **默认 --dry-run**：不加 --yes 且非 dry-run 时会先列计划并要求确认
  - 每步都打印命令与结果，失败立刻停并告诉你卡在哪、怎么修
  - 不碰凭证（凭证由 deploy.sh 自己从外部 .env 读，本脚本不接触）
"""

from __future__ import annotations

import argparse
import json
import re
import shutil
import subprocess
import sys
import time
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
PY = ROOT / ".venv" / "Scripts" / "python.exe"
if not PY.exists():
    PY = Path(sys.executable)
NODE = "node"
VERSION_FILE = ROOT / "pwa" / "version.json"
GENERATED = ["CHANGELOG.md", "pwa/public/changelog.json", "pwa/version.json"]

steps_done: list[str] = []


def say(msg: str) -> None:
    print(msg, flush=True)


def run(cmd: list[str], desc: str, *, check: bool = True,
        dry: bool = False, timeout: int = 3600) -> tuple[bool, str]:
    """跑一条命令。dry=True 只打印不执行。"""
    shown = " ".join(str(c) for c in cmd)
    say(f"\n▶ {desc}")
    say(f"  $ {shown}")
    if dry:
        say("  （dry-run：跳过）")
        return True, ""
    t0 = time.time()
    try:
        r = subprocess.run(cmd, cwd=ROOT, capture_output=True, text=True,
                           encoding="utf-8", errors="replace", timeout=timeout)
        out = (r.stdout or "") + (r.stderr or "")
        ok = r.returncode == 0
    except subprocess.TimeoutExpired:
        out, ok = f"超时（>{timeout}s）", False
    dur = time.time() - t0
    tail = "\n".join(out.strip().splitlines()[-12:])
    if tail:
        say("  " + tail.replace("\n", "\n  "))
    say(f"  → {'OK' if ok else 'FAIL'}（{dur:.0f}s）")
    if check and not ok:
        raise SystemExit(f"\n⛔ 在「{desc}」处停止。修复后重跑即可（已完成的步骤不会重复副作用）。")
    return ok, out


def git(*args: str) -> str:
    r = subprocess.run(["git", *args], cwd=ROOT, capture_output=True,
                       text=True, encoding="utf-8", errors="replace")
    return (r.stdout or "").strip()


def read_version() -> str:
    try:
        return json.loads(VERSION_FILE.read_text(encoding="utf-8")).get("version", "0.0.0")
    except Exception:
        return "0.0.0"


def bump_patch(ver: str) -> str:
    m = re.match(r"^(\d+)\.(\d+)\.(\d+)$", ver.strip())
    if not m:
        raise SystemExit(f"ERROR: 版本号格式不认识：{ver}（应为 x.y.z）")
    return f"{m.group(1)}.{m.group(2)}.{int(m.group(3)) + 1}"


def write_version(ver: str) -> None:
    d = json.loads(VERSION_FILE.read_text(encoding="utf-8"))
    d["version"] = ver
    VERSION_FILE.write_text(json.dumps(d, ensure_ascii=False, indent=2) + "\n",
                            encoding="utf-8")


def plan(args, new_ver: str) -> None:
    say("=" * 66)
    say(f"发版计划    当前版本 {read_version()}  →  目标版本 {new_ver}")
    say("=" * 66)
    rows = [
        ("1", "前置检查", "preflight（dist 新鲜度 / 工作区）"),
        ("2", f"升版本 → {new_ver}", "写 pwa/version.json"),
        ("3", "生成更新记录", "pwa/scripts/gen_changelog.py"),
        ("4", "构建 dist", "node pwa/scripts/build.mjs（注入 build=git 提交数）"),
        ("5", "本地层门禁" if not args.skip_tests else "门禁（跳过）",
         "run_gates.py（测当前代码）"),
        ("6", "提交生成物", "CHANGELOG.md + changelog.json + version.json"),
        ("7", "部署前复查", "preflight --deploy（工作区脏即拦）"),
        ("8", "推送", "git push origin main"),
        ("9", "部署" if not args.no_deploy else "部署（跳过）",
         "pwa/scripts/deploy.sh → Cloudflare Pages"),
        ("10", "线上验证" if not args.no_deploy else "线上验证（跳过）",
         "run_gates.py --online（版本对齐 + 冒烟）"),
    ]
    for n, name, cmd in rows:
        say(f"  {n:>2}. {name:<16} {cmd}")
    say("")
    if args.skip_tests:
        say("  ⚠️  已指定 --skip-tests：门禁不跑，风险自负。")
    if args.no_deploy:
        say("  ℹ️  已指定 --no-deploy：只提交 + 推送，不部署。")
    say("")


def main() -> int:
    try:
        sys.stdout.reconfigure(encoding="utf-8", errors="replace")
    except Exception:
        pass

    ap = argparse.ArgumentParser()
    ap.add_argument("--version", default="", help="指定版本号（默认 patch +1）")
    ap.add_argument("--dry-run", action="store_true", help="只演练不执行（建议先跑）")
    ap.add_argument("--skip-tests", action="store_true", help="跳过门禁（紧急热修才用）")
    ap.add_argument("--no-deploy", action="store_true", help="只提交推送，不部署")
    ap.add_argument("--yes", action="store_true", help="跳过确认")
    args = ap.parse_args()

    cur = read_version()
    new_ver = args.version.strip() or bump_patch(cur)
    if args.version and not re.match(r"^\d+\.\d+\.\d+$", new_ver):
        raise SystemExit(f"ERROR: --version 格式应为 x.y.z，收到 {new_ver}")

    plan(args, new_ver)
    if args.dry_run:
        say("dry-run 结束：以上是即将执行的步骤，未做任何改动。")
        say("确认无误后去掉 --dry-run 正式执行。")
        return 0

    if not args.yes:
        say("确认执行？(y/N) ", )
        try:
            if input().strip().lower() not in ("y", "yes"):
                say("已取消。")
                return 1
        except (EOFError, KeyboardInterrupt):
            say("\n已取消。")
            return 1

    # ── 1 前置检查 ──
    run([str(PY), "scripts/preflight.py"], "1/10 前置检查（dist 新鲜度 / 工作区）")
    steps_done.append("preflight")

    # ── 2 升版本 ──
    say(f"\n▶ 2/10 升版本 {cur} → {new_ver}")
    write_version(new_ver)
    say(f"  → OK（已写 {VERSION_FILE.relative_to(ROOT)}）")
    steps_done.append("bump")

    # ── 3 生成更新记录 ──
    run([str(PY), "pwa/scripts/gen_changelog.py"], "3/10 生成更新记录（CHANGELOG.md + changelog.json）")
    steps_done.append("changelog")

    # ── 4 构建 ──
    run([NODE, "pwa/scripts/build.mjs"], "4/10 构建 dist（注入 build = git 提交数）")
    steps_done.append("build")

    # ── 5 本地层门禁 ──
    if args.skip_tests:
        say("\n▶ 5/10 门禁 —— 已跳过（--skip-tests）")
    else:
        run([str(PY), "scripts/run_gates.py"], "5/10 本地层门禁（测当前代码）", timeout=3600)
        steps_done.append("gates")

    # ── 6 提交生成物 ──
    say("\n▶ 6/10 提交生成物")
    status = git("status", "--porcelain", "--untracked-files=no")
    others = [ln for ln in status.splitlines()
              if ln.strip() and not any(g in ln for g in GENERATED)]
    if others:
        # 除生成物外还有别的未提交改动 → 第 7 步 preflight --deploy 必然被拦。
        # 提前说清楚「是哪些文件」，不要让人误以为是发版脚本的锅。
        say("  ⛔ 除生成物外还有未提交改动，部署前检查会被拦：")
        for ln in others[:10]:
            say(f"     {ln}")
        raise SystemExit("\n⛔ 在「提交生成物」处停止：请先提交或还原上面这些文件，再重跑发版。")

    dirty_generated = [ln for ln in status.splitlines()
                       if any(g in ln for g in GENERATED)]
    if not dirty_generated and not status:
        say("  （无改动，跳过提交）")
    else:
        run(["git", "add", *GENERATED], "  暂存生成物")
        msg = (f"chore(release): v{new_ver}\n\n"
               f"一键发版（scripts/release.py）：升版本 → 生成更新记录 → 构建 → "
               f"本地层门禁 → 部署。")
        run(["git", "commit", "-m", msg], "  提交")
    steps_done.append("commit")

    # ── 7 部署前复查 ──
    run([str(PY), "scripts/preflight.py", "--deploy"],
        "7/10 部署前复查（工作区脏即拦）")
    steps_done.append("preflight-deploy")

    # ── 8 推送 ──
    run(["git", "push", "origin", "main"], "8/10 推送 origin/main")
    steps_done.append("push")

    if args.no_deploy:
        say("\n▶ 9-10 部署 / 线上验证 —— 已跳过（--no-deploy）")
        say(f"\n✅ 已完成到「推送」：v{new_ver} 已推到 origin/main，尚未部署。")
        say("   要部署请跑：bash pwa/scripts/deploy.sh")
        return 0

    # ── 9 部署 ──
    bash = shutil.which("bash") or "bash"
    run([bash, "pwa/scripts/deploy.sh"], "9/10 部署到 Cloudflare Pages", timeout=1800)
    steps_done.append("deploy")

    # ── 10 线上验证 ──
    say("\n▶ 10/10 线上验证（等 CDN 生效）")
    time.sleep(12)
    run([str(PY), "scripts/run_gates.py", "--online"],
        "10/10 线上层验证（版本对齐 + 冒烟）", timeout=3600)
    steps_done.append("online")

    say("\n" + "=" * 66)
    say(f"🎉 发版完成：v{new_ver}")
    say(f"   已完成步骤：{', '.join(steps_done)}")
    say("   线上验证通过 = 线上 version.json 与本地 dist 一致 + 冒烟套件全绿")
    say("=" * 66)
    return 0


if __name__ == "__main__":
    sys.exit(main())
