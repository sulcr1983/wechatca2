#!/usr/bin/env python3
"""发布 / 门禁前置检查（P0，2026-10-25）

解决三个反复踩的坑：
  1) 「改了引擎忘了 build，门禁测的是旧 dist 却全绿」
  2) 「工作区脏着去部署，deploy.sh 直接中止」
  3) 「线上 build 与本地 dist 不一致，测了半天测的是旧版本」

三项检查：
  A 构建新鲜度（**阻断**）
     dist/version.json 的 build（= 构建时 git 提交数）必须 >=
     「最近一次改动会被烤进 dist 的路径」那个提交的提交数。
     只要 pwa/src、core、public/themes 等变了而没重建，就会出现
     dist.build < required → 直接失败，并给出重建命令。

  B 工作区干净（默认只警告；--deploy 时阻断）
     已跟踪文件有未提交改动 → 部署必被 deploy.sh 拦下，提前说清楚。
     门禁日常跑不阻断（开发中本来就脏），只在 --deploy 严格。

  C 线上版本对齐（只在 --online 时检查）
     线上 version.json 的 version/build 必须与本地 dist 完全一致。
     用于「部署后验证」：不一致说明部署没生效或没部署。

用法：
    python scripts/preflight.py                 # 门禁前检查（A 阻断，B 警告）
    python scripts/preflight.py --deploy        # 部署前检查（A+B 都阻断）
    python scripts/preflight.py --online        # 部署后验证（A+B+C）
"""
from __future__ import annotations

import argparse
import json
import subprocess
import sys
import urllib.error
import urllib.request
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
DIST = ROOT / "pwa" / "dist"
ONLINE_VERSION_URL = "https://supersu.ccwu.cc/version.json"

# 只要这些路径有改动，build.mjs 就会把它们烤进 dist，必须重建。
# ⚠️ 不要写整个 core/：build.mjs 只拷 format_engine.py + preprocessor.py，
#    core/pwa_test_utils.py 这类测试工具改了不需要重建（否则误报，2026-10-25 实测）。
CODE_PATHS = [
    "pwa/src",
    "pwa/index.html",
    "pwa/public",
    "pwa/scripts/build.mjs",
    "pwa/version.json",
    "core/format_engine.py",
    "core/preprocessor.py",
    "public/themes",
    "public/brand",
]

OK = "  OK   "
WARN = "  WARN "
FAIL = "  FAIL "


def git(*args: str) -> str:
    try:
        r = subprocess.run(["git", *args], cwd=ROOT, capture_output=True,
                           text=True, encoding="utf-8", errors="replace")
    except OSError:
        return ""
    return (r.stdout or "").strip()


def read_dist() -> tuple[str, int] | tuple[None, None]:
    p = DIST / "version.json"
    if not (DIST / "index.html").exists() or not p.exists():
        return None, None
    try:
        d = json.loads(p.read_text(encoding="utf-8"))
    except Exception:
        return None, None
    ver = d.get("version")
    build = d.get("build")
    if not isinstance(build, int):
        return ver, None
    return ver, build


def check_dist_exists() -> bool:
    if (DIST / "index.html").exists() and (DIST / "version.json").exists():
        print(f"{OK} dist 存在（{DIST}）")
        return True
    print(f"{FAIL} pwa/dist 不存在或缺少 version.json")
    print("         修复：node pwa/scripts/build.mjs")
    return False


def check_freshness() -> bool:
    """dist 是否包含「最近一次代码改动」。"""
    ver, dist_build = read_dist()
    if dist_build is None:
        print(f"{FAIL} 无法读取 dist/version.json 的 build 字段")
        print("         修复：node pwa/scripts/build.mjs")
        return False

    last_sha = git("log", "-1", "--format=%H", "--", *CODE_PATHS)
    if not last_sha:
        print(f"{WARN} git 历史里找不到代码路径的提交（浅克隆？）—— 跳过新鲜度判断")
        return True

    required_raw = git("rev-list", "--count", last_sha)
    head_raw = git("rev-list", "--count", "HEAD")
    if not required_raw.isdigit() or not head_raw.isdigit():
        print(f"{WARN} 无法计算提交数（非 git 环境？）—— 跳过新鲜度判断")
        return True

    required = int(required_raw)
    head = int(head_raw)
    last_subject = git("log", "-1", "--format=%h %s", last_sha)

    if dist_build < required:
        print(f"{FAIL} dist 已过期：dist.build={dist_build} < 需要的 {required}")
        print(f"         最近一次代码提交：{last_subject}")
        print(f"         当前 HEAD 提交数：{head}")
        print("         修复：node pwa/scripts/build.mjs")
        return False

    behind = head - dist_build
    extra = "" if behind <= 0 else f"（落后 HEAD {behind} 个提交，但均未改动代码路径）"
    print(f"{OK} dist 新鲜：dist.build={dist_build} >= 需要的 {required}{extra}")
    return True


def check_clean(strict: bool) -> bool:
    out = git("status", "--porcelain", "--untracked-files=no")
    if not out:
        print(f"{OK} 已跟踪文件干净")
        return True
    files = [ln.strip() for ln in out.splitlines() if ln.strip()]
    shown = "\n".join(f"           {f}" for f in files[:10])
    more = "" if len(files) <= 10 else f"\n           …… 还有 {len(files) - 10} 个"
    msg = (f"已跟踪文件有未提交改动（{len(files)} 个），deploy.sh 的硬预检会中止部署：\n"
           f"{shown}{more}")
    if strict:
        print(f"{FAIL} {msg}")
        print("         修复：先提交或还原这些文件，再部署")
        return False
    print(f"{WARN} {msg}")
    print("         提示：日常门禁不阻断；部署前请加 --deploy 复查")
    return True


def check_online() -> bool:
    local_ver, local_build = read_dist()
    # ⚠️ Cloudflare 会拦 urllib 默认 UA（实测 403），必须带浏览器 UA
    req = urllib.request.Request(ONLINE_VERSION_URL, headers={
        "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) SuperSu-Preflight/1.0",
        "Accept": "application/json",
    })
    try:
        with urllib.request.urlopen(req, timeout=15) as r:
            remote = json.loads(r.read().decode("utf-8"))
    except (urllib.error.URLError, OSError, ValueError) as e:
        print(f"{FAIL} 取不到线上 version.json（{type(e).__name__}: {e}）")
        return False
    r_ver, r_build = remote.get("version"), remote.get("build")
    if r_ver == local_ver and r_build == local_build:
        print(f"{OK} 线上与本地 dist 一致：v{r_ver} · b{r_build}")
        return True
    print(f"{FAIL} 线上与本地 dist 不一致：")
    print(f"         线上：v{r_ver} · b{r_build}   本地 dist：v{local_ver} · b{local_build}")
    print("         含义：要么还没部署，要么部署未生效（SW 缓存 / 构建未重跑）")
    return False


def main() -> int:
    try:
        sys.stdout.reconfigure(encoding="utf-8", errors="replace")
    except Exception:
        pass

    ap = argparse.ArgumentParser()
    ap.add_argument("--deploy", action="store_true", help="部署前严格检查（工作区脏即失败）")
    ap.add_argument("--online", action="store_true", help="额外校验线上 version.json 与本地 dist 一致")
    args = ap.parse_args()

    print(f"前置检查：{ROOT}")
    results = [check_dist_exists(), check_freshness(), check_clean(args.deploy)]
    if args.online:
        results.append(check_online())

    if all(results):
        print("\n✅ 前置检查通过")
        return 0
    print("\n⛔ 前置检查未通过（见上方 FAIL 项）")
    return 1


if __name__ == "__main__":
    sys.exit(main())
