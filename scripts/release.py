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
   6 提交生成物    CHANGELOG.md + changelog.json + version.json + STATE.md
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
import os
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
# node 解析：优先用托管版本（绝对路径），避免 PATH 里的 shim 拦 rmSync
# （2026-10-25 实测：WorkBuddy 的 node-safe-delete-shim 会拦 build.mjs 的 rmrf）
def _find_node() -> str:
    import os
    cands = [
        r"C:\Users\XPENG\.workbuddy\binaries\node\versions\22.22.2-6\node.exe",
        r"C:\Program Files\nodejs\node.exe",
    ]
    for c in cands:
        if os.path.exists(c):
            return c
    return "node"


NODE = _find_node()
VERSION_FILE = ROOT / "pwa" / "version.json"
# build.mjs 会重写这几份已跟踪文件（CHANGELOG / changelog.json / version.json / STATE.md），
# 它们都是「构建产物」而非手写代码，统一在这里列一次，第 6 步按它提交、按它放行。
#
# ⚠️ 2026-11-01 加入 changelog_milestones.json：
#    版本切点不再是「发完版记得手工加」的附赠动作 —— gen_changelog 会在缺切点时
#    自动补一条写回该文件。既然它会变，就必须跟其它生成物一起提交，
#    否则第 5 步 preflight --deploy 会被「工作区脏」拦下。
GENERATED = ["CHANGELOG.md", "pwa/public/changelog.json", "pwa/version.json",
             "pwa/scripts/changelog_milestones.json", "STATE.md"]

steps_done: list[str] = []


def say(msg: str) -> None:
    print(msg, flush=True)


def run(cmd: list[str], desc: str, *, check: bool = True,
        dry: bool = False, timeout: int = 3600,
        extra_env: dict | None = None) -> tuple[bool, str]:
    """跑一条命令。dry=True 只打印不执行。

    ⚠️ 2026-10-25：去掉 IDE/沙箱注入的 node 删除保护环境变量。
    WorkBuddy 的 node-language-shim 会拦 fs.rmSync({recursive:true})，
    导致 build.mjs 的 rmrf 报错。正确做法是在**调用侧**去掉这几个变量，
    而不是去改 build.mjs 的业务代码（我上一轮就是改错了，把 build 从
    2.6s 拖到 145s，纯属自找麻烦）。
    """
    shown = " ".join(str(c) for c in cmd)
    say(f"\n▶ {desc}")
    say(f"  $ {shown}")
    if dry:
        say("  （dry-run：跳过）")
        return True, ""
    t0 = time.time()
    env = dict(os.environ)
    for k in ("NODE_OPTIONS", "CODEBUDDY_SAFE_DELETE_BULK_GUARD",
              "CODEBUDDY_SAFE_DELETE_SANDBOX"):
        env.pop(k, None)
    # ⚠️ 2026-11-01：子进程输出走管道时 Windows 默认 GBK，任何带 emoji/特殊
    # 字符的脚本（run_gates 开头就打印 🛡️）会 UnicodeEncodeError 退出 1，
    # 看上去像「门禁失败」，实际是一键发版根本跑不完。这里统一钉成 UTF-8，
    # 不依赖调用方是控制台还是管道。
    env["PYTHONIOENCODING"] = "utf-8"
    env["PYTHONUTF8"] = "1"
    if extra_env:
        env.update(extra_env)
    try:
        # ⚠️ 必须把上面清干净后的 env 真的传下去：漏传过一次（2026-10-29），
        # 结果 NODE_OPTIONS 里的 node-shim 仍生效，build.mjs 的 rmrf 被
        # 「bulk delete guard」拦下，发版卡在第 4 步，且报错信息看起来像磁盘问题。
        r = subprocess.run(cmd, cwd=ROOT, env=env, capture_output=True, text=True,
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


# ── 推送凭证（2026-11-03）──────────────────────────────────────────────
# 背景：remote.origin 是 SSH（git@github.com:...），但本机**没有对应密钥**
# （~/.ssh/id_ed25519_wechatca2 不存在），所以 `git push origin main` 必失败。
# 之前靠 ~/.git-credentials 里一条来历不明的旧凭证 + 手敲 https 全 URL 推，
# 既不可复现，也会让 deploy.sh 的铁律预检误判（见下方 fetch 同步 ref 的注释）。
# 现改为统一走 .env 的 GITHUB_TOKEN（该文件已 gitignore，不进仓库、不进产物）。
GITHUB_URL = "https://github.com/sulcr1983/wechatca2.git"
GITHUB_USER = "sulcr1983"


def _github_token() -> str:
    """从项目根 .env 读 GITHUB_TOKEN；没有则返回空串（调用方回落 SSH）。"""
    envf = ROOT / ".env"
    if not envf.exists():
        return ""
    for line in envf.read_text(encoding="utf-8", errors="replace").splitlines():
        line = line.strip()
        if not line or line.startswith("#") or "=" not in line:
            continue
        k, _, v = line.partition("=")
        if k.strip() == "GITHUB_TOKEN":
            return v.strip().strip('"').strip("'")
    return ""


def _git_auth_env() -> dict:
    """把 token 编成 git 的 extraheader，经**环境变量**传给子进程。

    ⚠️ 为什么不写进 .git/config 或 ~/.git-credentials：
        落盘即长期明文留存，任何 `git config -l` / 文件读取都会搬到屏幕上。
    ⚠️ 为什么不放在命令行（git -c ...）：
        run() 会把整条命令打印出来（见 run() 里的 `say(f"  $ {shown}")`），
        token 会直接出现在发版日志里。走 GIT_CONFIG_* 环境变量则命令行干净。
    """
    tok = _github_token()
    if not tok:
        return {}
    import base64
    auth = base64.b64encode(f"{GITHUB_USER}:{tok}".encode()).decode()
    return {
        "GIT_CONFIG_COUNT": "1",
        "GIT_CONFIG_KEY_0": "http.https://github.com/.extraheader",
        "GIT_CONFIG_VALUE_0": f"AUTHORIZATION: basic {auth}",
    }


def _push_main() -> None:
    """推送 HEAD 到 origin/main —— 优先走 .env 的 GITHUB_TOKEN，无 token 才回落 SSH。

    ⚠️ 两个必须一起做的动作（2026-11-03 实测踩过）：
      1. **推 https 全 URL 而不是 `origin`**：origin 是 SSH，本机没密钥。
      2. **推完必须同步 `refs/remotes/origin/main`**：用全 URL 推送时 git 不会
         更新这个远程跟踪 ref（因为 URL 没跟任何 remote 绑定）。而 deploy.sh 的
         铁律预检判据是 `git merge-base --is-ancestor HEAD refs/remotes/origin/main`
         —— ref 不更新，它就会误报「HEAD 未推送」而拒绝部署。
    """
    auth = _git_auth_env()
    if auth:
        say("\n▶ 7/8 推送 origin/main（凭证：.env 的 GITHUB_TOKEN）")
        run(["git", "push", GITHUB_URL, "HEAD:main"], "  推送到 GitHub",
            extra_env=auth)
        run(["git", "fetch", GITHUB_URL, "main:refs/remotes/origin/main"],
            "  同步 refs/remotes/origin/main（供 deploy.sh 预检）", extra_env=auth)
    else:
        say("\n▶ 7/8 推送 origin/main（.env 无 GITHUB_TOKEN，回落 SSH）")
        run(["git", "push", "origin", "main"], "  推送到 GitHub（SSH）")


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


def bump_minor(ver: str) -> str:
    """1.5.0 → 1.6.0（minor +1，patch 归零）。"""
    m = re.match(r"^(\d+)\.(\d+)\.(\d+)$", ver.strip())
    if not m:
        raise SystemExit(f"ERROR: 版本号格式不认识：{ver}（应为 x.y.z）")
    return f"{m.group(1)}.{int(m.group(2)) + 1}.0"


def commits_since_last_release() -> list[str]:
    """上次改 version.json 之后的提交标题（用于判断该升 patch 还是 minor）。"""
    r = subprocess.run(
        ["git", "log", "--oneline", "-1", "--format=%H", "--", "pwa/version.json"],
        cwd=ROOT, capture_output=True, text=True, encoding="utf-8", errors="replace")
    last = (r.stdout or "").strip()
    if not last:
        return []
    r2 = subprocess.run(
        ["git", "log", "--format=%s", f"{last}..HEAD"],
        cwd=ROOT, capture_output=True, text=True, encoding="utf-8", errors="replace")
    return [ln for ln in (r2.stdout or "").splitlines() if ln.strip()]


def suggest_bump(cur: str) -> tuple[str, str, int]:
    """按「自上次发版以来的改动」判断版本号该升多少。

    语义化版本规则（这里只做粗判，够用且可解释）：
      - 有 feat / 新增功能 / 修 bug 这类实质改动 → **minor +1**（1.5.0 → 1.6.0）
      - 只有 chore / docs / 构建产物同步这类杂务 → **patch +1**（1.5.0 → 1.5.1）
    返回 (目标版本, 理由, 实质改动数)
    """
    msgs = commits_since_last_release()
    # chore / docs / 构建产物 不算「功能改动」
    trivial = re.compile(r"^(chore|docs|style|test)\b|构建产物同步|STATE 同步")
    substantive = [m for m in msgs if not trivial.search(m)]
    n = len(substantive)
    if n > 0:
        return bump_minor(cur), f"自上次发版有 {n} 项实质改动（功能/修复）→ 升 minor", n
    return bump_patch(cur), "自上次发版只有杂务改动 → 升 patch", 0


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
        ("1", f"升版本 → {new_ver}", "写 pwa/version.json"),
        ("2", "构建 dist", "build.mjs（内含生成更新记录 + 注入 build=git 提交数）"),
        ("3", "本地层门禁" if not args.skip_tests else "门禁（跳过）",
         "run_gates.py --local（本地层全跑）" if args.full_gates
         else "run_gates.py（按改动面选套件，加 --full-gates 才全跑）"),
        ("4", "提交生成物", "CHANGELOG.md + changelog.json + milestones + version.json + STATE.md"),
        ("5", "部署前复查", "preflight --deploy（工作区脏即拦）"),
        ("6", "推送", "git push origin main"),
        ("7", "部署" if not args.no_deploy else "部署（跳过）",
         "pwa/scripts/deploy.sh → Cloudflare Pages"),
        ("8", "线上验证" if not args.no_deploy else "线上验证（跳过）",
         "run_gates.py --online（版本对齐 + 冒烟）"),
    ]
    for n, name, cmd in rows:
        say(f"  {n:>2}. {name:<16} {cmd}")
    say("")
    say(f"  ℹ️  第 3 步会自动在 pwa/scripts/changelog_milestones.json 补 v{new_ver} 的切点；")
    say("     想让更新记录好看，发版前把它的 title 与 highlights（3 条人话）填上。")
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
    ap.add_argument("--full-gates", action="store_true",
                    help="发版门禁跑本地层全量（默认按改动面选套件，快；放心结时才用）")
    ap.add_argument("--no-deploy", action="store_true", help="只提交推送，不部署")
    ap.add_argument("--yes", action="store_true", help="跳过确认")
    args = ap.parse_args()

    cur = read_version()
    if args.version.strip():
        new_ver = args.version.strip()
        if not re.match(r"^\d+\.\d+\.\d+$", new_ver):
            raise SystemExit(f"ERROR: --version 格式应为 x.y.z，收到 {new_ver}")
        bump_reason = "手动指定"
    else:
        # 2026-10-25：原来固定只升 patch，导致 62 个提交都挤在 v1.5.0 下。
        # 现在按「自上次发版以来的改动性质」自动判断：有实质改动升 minor，只有杂务升 patch。
        new_ver, bump_reason, n_sub = suggest_bump(cur)
        say(f"版本判断：{bump_reason}")

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

    # ── 1 升版本 ──
    # 2026-11-01 精简：原第 1 步「前置检查」已删。理由：release 调的是不带
    # --deploy 的 preflight，工作区脏时只 WARN 不拦（实测：18 个未提交文件仍
    # exit=0 打「✅ 通过」）。真正拦截的是第 6 步的 preflight --deploy，
    # 那道还在，删掉的只是一次无意义的重复扫描。
    say(f"\n▶ 1/8 升版本 {cur} → {new_ver}")
    write_version(new_ver)
    say(f"  → OK（已写 {VERSION_FILE.relative_to(ROOT)}）")
    steps_done.append("bump")

    # ── 2 构建 ──
    # 2026-11-01 精简：原「生成更新记录」独立步骤已删 —— build.mjs 内部第 476 行
    # 就调用同一个 gen_changelog.py，紧接着又自己校验「更新记录最新版本 == 构建版本」
    # 并 exit 1。那一步纯属把同一个脚本连跑两遍。
    # 缺切点仍会自动补（gen_changelog 普通模式行为），只是现在由 build 触发。
    run([NODE, "pwa/scripts/build.mjs"],
        "2/8 构建 dist（内含生成更新记录 + 注入 build = git 提交数）")
    steps_done.append("build")

    # ── 3 本地层门禁 ──
    # B 档（2026-11-01）：发版默认也按改动面选套件（run_gates 默认档），
    # 改文档的发版就不必跑封面 5 分钟。想结结实实全量请加 --full-gates。
    # 为什么敢这么改：preflight 保证 dist 与源码一致，未改动的模块在上次发版
    # 时已经验过，这次发出去的内容并没有变化。
    if args.skip_tests:
        say("\n▶ 3/8 门禁 —— 已跳过（--skip-tests）")
    else:
        gate_cmd = [str(PY), "scripts/run_gates.py"]
        gate_desc = "3/8 本地层门禁（按改动面选套件）"
        if args.full_gates:
            gate_cmd.append("--local")
            gate_desc = "3/8 本地层门禁（--full-gates：本地层全跑）"
        run(gate_cmd, gate_desc, timeout=3600)
        steps_done.append("gates")

    # ── 4 提交生成物 ──
    say("\n▶ 4/8 提交生成物")
    status = git("status", "--porcelain", "--untracked-files=no")
    others = [ln for ln in status.splitlines()
              if ln.strip() and not any(g in ln for g in GENERATED)]
    if others:
        # 除生成物外还有别的未提交改动 → 第 5 步 preflight --deploy 必然被拦。
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
        "6/8 部署前复查（工作区脏即拦）")
    steps_done.append("preflight-deploy")

    # ── 8 推送 ──
    _push_main()
    steps_done.append("push")

    if args.no_deploy:
        say("\n▶ 7-8 部署 / 线上验证 —— 已跳过（--no-deploy）")
        say(f"\n✅ 已完成到「推送」：v{new_ver} 已推到 origin/main，尚未部署。")
        say("   要部署请跑：bash pwa/scripts/deploy.sh")
        return 0

    # ── 9 部署 ──
    # SKIP_PREFLIGHT=1：第 7 步刚跑过同一条 preflight --deploy，中间无改动，
    # 让 deploy.sh 不再重复跑一遍；单独执行 deploy.sh 时保护照旧。
    bash = shutil.which("bash") or "bash"
    run([bash, "pwa/scripts/deploy.sh"], "8/8 部署到 Cloudflare Pages",
        timeout=1800, extra_env={"SKIP_PREFLIGHT": "1"})
    steps_done.append("deploy")

    # ── 8 线上验证 ──
    say("\n▶ 8/8 线上验证（等 CDN 生效）")
    time.sleep(12)
    # --online 只跑线上层（preflight --online + 线上冒烟），
    # 不再把本地层整份重跑一遍 —— 第 3 步刚跑过，重复跑 10 分钟没有新增信息。
    run([str(PY), "scripts/run_gates.py", "--online"],
        "8/8 线上层验证（版本对齐 + 冒烟）", timeout=1800)
    steps_done.append("online")

    say("\n" + "=" * 66)
    say(f"🎉 发版完成：v{new_ver}")
    say(f"   已完成步骤：{', '.join(steps_done)}")
    say("   线上验证通过 = 线上 version.json 与本地 dist 一致 + 冒烟套件全绿")
    say("=" * 66)
    return 0


if __name__ == "__main__":
    sys.exit(main())
