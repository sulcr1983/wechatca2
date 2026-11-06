#!/usr/bin/env python3
"""只读基线探针（审计用，不改产品）

采集四层事实并落盘 JSON：
  1) git：HEAD / 提交数 / 分支 / 工作区 / 与 origin/main 的领先落后
  2) 构建：pwa/dist/version.json + 源码↔dist 逐文件哈希
  3) 线上：version.json + 关键文件哈希（--online 时才联网）
  4) 口径：主题数量/kit/su-* / 结构签名 / 门禁套件分层计数 / STATE 是否漏报

设计约束：
  · 只读：除 --out 指定的 JSON 外不写任何文件
  · 仅标准库；本机 Clash 会拦 localhost/外网，故默认禁用代理
  · 线上请求带 UA（Cloudflare 对无 UA 返回 403）
  · 行号会漂移，脚本只认内容与路径

用法：
    .venv/Scripts/python.exe scripts/audit_baseline.py
    .venv/Scripts/python.exe scripts/audit_baseline.py --online
"""
from __future__ import annotations

import argparse
import hashlib
import json
import re
import subprocess
import sys
import urllib.request
from collections import Counter, defaultdict
from datetime import datetime
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
DIST = ROOT / "pwa" / "dist"
ONLINE_BASE = "https://supersu.ccwu.cc"
KEY_FILES = [
    "src/app.js", "src/style.css", "src/cover/index.js", "src/cover/cards.js",
    "src/cover/title-page.js", "src/cover/longform-page.js", "src/ai.js",
    "src/bridge.js", "src/engine.worker.js", "src/export.js", "src/nine.js",
    "py/format_engine.py", "py/preprocessor.py", "py/magazine_layouts.py",
    "index.html", "sw.js", "changelog.json", "themes/index.json",
]
STAMPED = {"src/update/index.js"}  # 构建时注入版本号，允许与源码不同

# Cloudflare 会在 HTML 响应里自动注入 Web Analytics beacon（不在 dist 文件里）。
# 对账时必须剔除这一行，否则会把「CDN 注入」误判成「部署漂移」。
CF_INJECT_MARK = b"static.cloudflareinsights.com"


def norm_html(body: bytes) -> bytes:
    return b"\n".join(ln for ln in body.splitlines() if CF_INJECT_MARK not in ln)


def sh(*args: str) -> tuple[int, str]:
    r = subprocess.run(["git", *args], cwd=ROOT, capture_output=True,
                       text=True, encoding="utf-8", errors="replace")
    return r.returncode, (r.stdout or "").strip()


def sha256(path: Path) -> str:
    h = hashlib.sha256()
    with path.open("rb") as f:
        for chunk in iter(lambda: f.read(1 << 20), b""):
            h.update(chunk)
    return h.hexdigest()


def git_state() -> dict:
    code, head = sh("rev-parse", "HEAD")
    _, count = sh("rev-list", "--count", "HEAD")
    _, branch = sh("rev-parse", "--abbrev-ref", "HEAD")
    _, status = sh("status", "--porcelain", "-uall")
    _, ahead = sh("rev-list", "--count", "origin/main..HEAD")
    _, behind = sh("rev-list", "--count", "HEAD..origin/main")
    return {
        "head": head, "commits": int(count or 0), "branch": branch,
        "dirty": [ln for ln in status.splitlines() if ln and not ln.startswith("warning:")],
        "ahead_origin_main": int(ahead or 0), "behind_origin_main": int(behind or 0),
    }


def dist_version() -> dict:
    p = DIST / "version.json"
    return json.loads(p.read_text(encoding="utf-8")) if p.exists() else {}


def http_get(url: str, timeout: int = 25) -> bytes:
    opener = urllib.request.build_opener(urllib.request.ProxyHandler({}))
    req = urllib.request.Request(url, headers={"User-Agent": "Mozilla/5.0 (audit)"})
    with opener.open(req, timeout=timeout) as r:
        return r.read()


def compare_trees() -> dict:
    """源码 ↔ dist 逐文件哈希；返回差异清单。"""
    pairs = [
        ("pwa/src", DIST / "src"),
        ("public/themes", DIST / "themes"),
    ]
    out: dict = {"differences": [], "stamped": [], "checked": 0}
    for src_rel, dist_dir in pairs:
        src_dir = ROOT / src_rel
        for p in sorted(src_dir.rglob("*")):
            if not p.is_file():
                continue
            rel = p.relative_to(src_dir).as_posix()
            q = dist_dir / rel
            if src_rel == "public/themes":
                key = f"themes/{rel}"
            else:
                key = f"src/{rel}"
            if key in STAMPED:
                out["stamped"].append(key)
                continue
            out["checked"] += 1
            if not q.exists():
                out["differences"].append({"file": key, "issue": "missing_in_dist"})
            elif sha256(p) != sha256(q):
                out["differences"].append({"file": key, "issue": "content_diff"})
    for name in ("format_engine.py", "preprocessor.py", "magazine_layouts.py"):
        out["checked"] += 1
        a, b = ROOT / "core" / name, DIST / "py" / name
        if not b.exists():
            out["differences"].append({"file": f"py/{name}", "issue": "missing_in_dist"})
        elif sha256(a) != sha256(b):
            out["differences"].append({"file": f"py/{name}", "issue": "content_diff"})
    return out


def theme_stats() -> dict:
    files = sorted((ROOT / "public" / "themes").glob("*.json"))
    kit = su = layout = 0
    groups: dict[str, list[str]] = defaultdict(list)
    for p in files:
        d = json.loads(p.read_text(encoding="utf-8"))
        if d.get("kind") == "kit":
            kit += 1
            continue
        if p.name.startswith("su-"):
            su += 1
        if d.get("layout"):
            layout += 1
        sig = json.dumps(d.get("styles", {}), ensure_ascii=False, sort_keys=True)
        sig = re.sub(r"#[0-9a-fA-F]{3,8}", "#", sig)
        sig = re.sub(r"rgba?\([^)]*\)", "rgb()", sig)
        groups[sig].append(p.stem)
    sizes = Counter(len(v) for v in groups.values())
    return {
        "total": len(files), "kit": kit, "non_kit": len(files) - kit,
        "su_prefix": su, "layout_non_empty": layout,
        "structure_signatures": len(groups),
        "signature_size_histogram": dict(sorted(sizes.items())),
        "groups_ge_10": [{"size": len(v), "first": sorted(v)[:3]} for v in groups.values() if len(v) >= 10],
        "themes_in_groups_ge_10": sum(len(v) for v in groups.values() if len(v) >= 10),
    }


def suite_stats() -> dict:
    src = (ROOT / "scripts" / "run_gates.py").read_text(encoding="utf-8").splitlines()
    actual: dict[str, list[str]] = {}
    layer = ""
    for line in src:
        m = re.match(r"^(SUITES_\w+)\s*=", line.strip())
        if m:
            layer = m.group(1).replace("SUITES_", "").lower()
            actual.setdefault(layer, [])
            continue
        if line.startswith("ALL_SUITES"):
            break
        m2 = re.match(r'^\s*\("(\w+)",', line)
        if m2 and layer:
            actual[layer].append(m2.group(1))
    # STATE.md 的分层清单
    state_path = ROOT / "STATE.md"
    state_layers: dict[str, list[str]] = {}
    if state_path.exists():
        cur = ""
        for line in state_path.read_text(encoding="utf-8").splitlines():
            m = re.match(r"^\*\*(.+?)\*\*", line.strip())
            if m and ("层" in m.group(1)):
                cur = m.group(1)
                state_layers[cur] = []
            m2 = re.match(r"^\|\s*`(\w+)`\s*\|", line.strip())
            if m2 and cur:
                state_layers[cur].append(m2.group(1))
    return {
        "actual_counts": {k: len(v) for k, v in actual.items()},
        "actual_total": sum(len(v) for v in actual.values()),
        "actual_names": actual,
        "state_counts": {k: len(v) for k, v in state_layers.items()},
        "state_names": state_layers,
    }


def main() -> int:
    ap = argparse.ArgumentParser()
    ap.add_argument("--online", action="store_true", help="同时核对线上哈希")
    ap.add_argument("--out", default=str(ROOT / "output" / "audit-2026-11-06" / "baseline" / "baseline.json"))
    args = ap.parse_args()

    data: dict = {
        "generatedAt": datetime.now().strftime("%Y-%m-%d %H:%M:%S"),
        "git": git_state(),
        "dist": {"version": dist_version(), "tree": compare_trees()},
        "themes": theme_stats(),
        "suites": suite_stats(),
    }

    if args.online:
        try:
            data["online"] = json.loads(http_get(f"{ONLINE_BASE}/version.json"))
            online_hashes = {}
            for rel in KEY_FILES:
                local = DIST / rel
                try:
                    body = http_get(f"{ONLINE_BASE}/{rel}")
                except Exception as e:  # noqa: BLE001 - 证据采集，记录原因即可
                    online_hashes[rel] = {"error": f"{type(e).__name__}: {e}"}
                    continue
                online_hashes[rel] = {
                    "local": sha256(local) if local.exists() else None,
                    "online": hashlib.sha256(body).hexdigest(),
                }
                if rel.endswith(".html") and local.exists():
                    local_body = local.read_bytes()
                    online_hashes[rel]["match_normalized"] = (
                        hashlib.sha256(norm_html(local_body)).hexdigest()
                        == hashlib.sha256(norm_html(body)).hexdigest()
                    )
                    online_hashes[rel]["cdn_injected"] = CF_INJECT_MARK in body
            data["online"]["hashes"] = online_hashes
        except Exception as e:  # noqa: BLE001
            data["online"] = {"error": f"{type(e).__name__}: {e}"}

    out = Path(args.out)
    out.parent.mkdir(parents=True, exist_ok=True)
    out.write_text(json.dumps(data, ensure_ascii=False, indent=2), encoding="utf-8")

    # 控制台摘要
    g, t, s = data["git"], data["themes"], data["suites"]
    print(f"HEAD {g['head'][:9]} · {g['commits']} commits · {g['branch']} · ahead {g['ahead_origin_main']}")
    print(f"dirty {len(g['dirty'])} 项")
    print(f"dist v{data['dist']['version'].get('version')} b{data['dist']['version'].get('build')}")
    print(f"源码↔dist：检查 {data['dist']['tree']['checked']} 文件，差异 {len(data['dist']['tree']['differences'])}，"
          f"版本注入 {len(data['dist']['tree']['stamped'])}")
    print(f"主题 {t['total']} = kit {t['kit']} + 非 kit {t['non_kit']}；su-* {t['su_prefix']}；"
          f"结构签名 {t['structure_signatures']}；≥10 同签名 {t['themes_in_groups_ge_10']} 套")
    print(f"门禁实际 {s['actual_counts']} = {s['actual_total']}；STATE 记录 {s['state_counts']}")
    if "online" in data and "version" in data["online"]:
        same = sum(1 for v in data["online"].get("hashes", {}).values()
                   if isinstance(v, dict) and (v.get("local") == v.get("online")
                                               or v.get("match_normalized")))
        total = len(data["online"].get("hashes", {}))
        print(f"线上 v{data['online']['version']} b{data['online'].get('build')}；哈希一致 {same}/{total}")
    print(f"→ {out}")
    return 0


if __name__ == "__main__":
    sys.exit(main())
