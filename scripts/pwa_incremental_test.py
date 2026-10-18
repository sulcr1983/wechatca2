#!/usr/bin/env python
"""PWA 增量更新实测（两阶段）
==============================================================
阶段 1（部署当前版本后跑）：记录 BUILD_ID、缓存清单、Pyodide 条目、主题传输量。
阶段 2（改一个文件重新部署后跑）：与阶段 1 对比，验证
  · BUILD_ID 变了（说明这次确实是新版本）
  · shell 缓存换了名字，但 runtime 缓存（Pyodide 11MB）原样保留
  · themes 的 transferSize 接近 0（说明没变的数据一个字节都没重下）

用法：
  python scripts/pwa_incremental_test.py --phase 1
  # 改一个文件 → node pwa/scripts/build.mjs → bash pwa/scripts/deploy.sh
  python scripts/pwa_incremental_test.py --phase 2
"""
import argparse
import json
import os
import sys

from playwright.sync_api import sync_playwright

try:
    if (sys.stdout.encoding or "").lower() not in ("utf-8", "utf8"):
        sys.stdout.reconfigure(encoding="utf-8", errors="replace")
except Exception:
    pass

URL = "https://supersu.ccwu.cc/"
OUT = os.path.join(os.path.dirname(os.path.dirname(os.path.abspath(__file__))),
                   "output", "pwa_incremental")
SNAP = os.path.join(OUT, "snapshot1.json")
PROFILE = os.path.join(OUT, "profile")

results = []


def check(name, ok, detail=""):
    results.append((name, ok, detail))
    print(f"[{'PASS' if ok else 'FAIL'}] {name}" + (f" — {detail}" if detail else ""))


SNAPSHOT_JS = """async () => {
  const names = await caches.keys();
  const info = {};
  for (const n of names) {
    const c = await caches.open(n);
    const keys = await c.keys();
    info[n] = {
      count: keys.length,
      runtime: keys.filter(r => r.url.includes('jsdelivr') || r.url.includes('/runtime/pyodide/')).map(r => r.url),
      hashed: keys.filter(r => /\\?h=/.test(r.url)).length,
    };
  }
  const res = await fetch('./sw.js?ts=' + Date.now(), { cache: 'no-store' });
  const txt = await res.text();
  const m = txt.match(/BUILD_ID = '([^']+)'/);
  return { caches: info, buildId: m ? m[1] : '', cacheNames: names };
}"""

THEME_PERF_JS = """() => {
  const es = performance.getEntriesByType('resource').filter(e => /\\/themes\\//.test(e.name));
  const transferred = es.filter(e => (e.transferSize || 0) > 0);
  return {
    total: es.length,
    transferred: transferred.length,
    bytes: es.reduce((s, e) => s + (e.transferSize || 0), 0),
    swServed: es.filter(e => (e.workerStart || 0) > 0).length,
    samples: transferred.slice(0, 5).map(e => ({ n: e.name.split('/').pop(), t: e.transferSize })),
  };
}"""


def collect(page):
    # 首次访问时 SW 还没接管页面，Worker 里的 Pyodide 请求会绕过 SW → 不进缓存。
    # 必须等 controller 就绪后刷新一次，让整页（含 Worker）都受 SW 控制。
    page.wait_for_function(
        "() => navigator.serviceWorker && navigator.serviceWorker.controller",
        timeout=90000,
    )
    page.reload(wait_until="domcontentloaded", timeout=60000)
    page.wait_for_function(
        "() => document.querySelector('#engine-badge')?.dataset.state === 'ready'",
        timeout=180000,
    )
    page.wait_for_timeout(2500)   # 给 install 的增量预取一点时间
    snap = page.evaluate(SNAPSHOT_JS)
    perf = page.evaluate(THEME_PERF_JS)
    snap["themes"] = perf
    return snap


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--phase", choices=["1", "2"], required=True)
    ap.add_argument("--clean", action="store_true", help="阶段1 先清空 profile（避免旧缓存躺赢）")
    args = ap.parse_args()
    os.makedirs(OUT, exist_ok=True)
    if args.phase == "1" and args.clean:
        import shutil
        shutil.rmtree(PROFILE, ignore_errors=True)
        print("已清空持久化 profile")

    with sync_playwright() as p:
        # 必须用持久化 profile：Cache Storage 跟着 profile 走，
        # 两种阶段用同一个目录才能证明「runtime 缓存跨版本保留」。
        ctx = p.chromium.launch_persistent_context(
            PROFILE, channel="chrome", headless=False,
            viewport={"width": 1280, "height": 900},
            args=["--window-size=1280,900"],
        )
        page = ctx.pages[0] if ctx.pages else ctx.new_page()
        page.goto(URL, wait_until="domcontentloaded", timeout=60000)
        snap = collect(page)
        ctx.close()

    runtime = {k: v for k, v in snap["caches"].items() if k.startswith("supersu-store-runtime")}
    runtime_entries = sum(len(v["runtime"]) for v in runtime.values())
    print(f"BUILD_ID={snap['buildId']}  caches={list(snap['caches'].keys())}"
          f"  runtime={runtime_entries}  themes={snap['themes']}")

    if args.phase == "1":
        with open(SNAP, "w", encoding="utf-8") as f:
            json.dump(snap, f, ensure_ascii=False, indent=2)
        check("阶段1：快照已保存", bool(snap["buildId"]), SNAP)
        check("阶段1：Pyodide 运行时已缓存", runtime_entries >= 5, f"{runtime_entries} 条")
        check("阶段1：主题用了哈希键", sum(v.get("hashed", 0) for k, v in snap["caches"].items() if k.startswith("supersu-store-data")) > 100,
              f"hash 键 {sum(v.get('hashed', 0) for k, v in snap['caches'].items() if k.startswith('supersu-store-data'))} 个")
    else:
        if not os.path.exists(SNAP):
            print("ERROR: 先跑 --phase 1")
            return 2
        with open(SNAP, encoding="utf-8") as f:
            before = json.load(f)

        check("阶段2：BUILD_ID 已变化（确实发布了新版本）",
              snap["buildId"] and snap["buildId"] != before["buildId"],
              f"{before['buildId']} → {snap['buildId']}")
        check("阶段2：runtime 缓存跨版本保留", runtime_entries >= 5, f"{runtime_entries} 条")
        before_runtime = {k for k, v in before["caches"].items() if k.startswith("supersu-store-runtime")}
        check("阶段2：runtime 缓存名没变", set(runtime.keys()) == before_runtime,
              f"{before_runtime} → {set(runtime.keys())}")
        shell_now = {n for n in snap["cacheNames"] if n.startswith("supersu-shell-")}
        check("阶段2：新 shell 缓存已落地", f"supersu-shell-{snap['buildId']}" in shell_now,
              f"{sorted(shell_now)}")
        check("阶段2：主题请求确实由 SW 应答（不是 HTTP 304 假绿）",
              snap["themes"]["total"] > 0 and snap["themes"]["swServed"] == snap["themes"]["total"],
              f"total={snap['themes']['total']} swServed={snap['themes']['swServed']}")
        check("阶段2：主题没有重新下载（transferSize≈0）",
              snap["themes"]["bytes"] < 100_000 and snap["themes"]["transferred"] <= 3,
              f"传输 {snap['themes']['bytes']} 字节 / {snap['themes']['transferred']} 个文件")

    print("\n" + "=" * 52)
    failed = [r for r in results if not r[1]]
    print(f"增量实测（阶段{args.phase}）：{len(results) - len(failed)}/{len(results)} 通过")
    return 1 if failed else 0


if __name__ == "__main__":
    sys.exit(main())
