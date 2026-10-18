#!/usr/bin/env python
"""PWA 首次/刷新/离线 传输量实测（回答问题：是不是每次刷新都重下 11MB）

用法：python scripts/pwa_payload_probe.py
产出：output/pwa_payload/probe.json + 控制台表格
"""
import json
import os
import shutil
import sys

from playwright.sync_api import sync_playwright

try:
    sys.stdout.reconfigure(encoding="utf-8", errors="replace")
except Exception:
    pass

URL = "https://supersu.ccwu.cc/"
OUT = os.path.join(os.path.dirname(os.path.dirname(os.path.abspath(__file__))), "output", "pwa_payload")
PROFILE = os.path.join(OUT, "profile")

PERF_JS = """() => {
  const es = performance.getEntriesByType('resource');
  const byHost = {};
  let total = 0;
  for (const e of es) {
    const t = e.transferSize || 0;
    total += t;
    let host = 'same-origin';
    try { host = new URL(e.name).host; } catch (err) {}
    if (!byHost[host]) byHost[host] = { count: 0, bytes: 0 };
    byHost[host].count += 1;
    byHost[host].bytes += t;
  }
  const top = es.filter(e => (e.transferSize || 0) > 0)
    .sort((a, b) => b.transferSize - a.transferSize).slice(0, 8)
    .map(e => ({ url: e.name.replace('https://', '').slice(0, 80), kb: Math.round(e.transferSize / 1024) }));
  return { totalKB: Math.round(total / 1024), count: es.length, byHost, top };
}"""

READY_JS = "() => document.querySelector('#engine-badge')?.dataset.state === 'ready'"


def run():
    os.makedirs(OUT, exist_ok=True)
    shutil.rmtree(PROFILE, ignore_errors=True)
    report = {}

    with sync_playwright() as p:
        ctx = p.chromium.launch_persistent_context(
            PROFILE, channel="chrome", headless=False,
            viewport={"width": 1280, "height": 900}, args=["--window-size=1280,900"])
        page = ctx.pages[0] if ctx.pages else ctx.new_page()

        # 1) 首次访问（空 profile）
        t0 = page.evaluate("() => performance.now()")
        page.goto(URL, wait_until="domcontentloaded", timeout=90000)
        page.wait_for_function(READY_JS, timeout=240000)
        page.wait_for_timeout(1500)
        first = page.evaluate(PERF_JS)
        report["first_visit"] = first

        # 2) 等 SW 接管后刷新一次（模拟用户第二次打开）
        page.wait_for_function("() => navigator.serviceWorker && navigator.serviceWorker.controller", timeout=90000)
        page.reload(wait_until="domcontentloaded", timeout=90000)
        page.wait_for_function(READY_JS, timeout=240000)
        page.wait_for_timeout(1500)
        report["second_visit"] = page.evaluate(PERF_JS)

        # 3) 再刷一次（纯缓存命中）
        page.reload(wait_until="domcontentloaded", timeout=90000)
        page.wait_for_function(READY_JS, timeout=240000)
        page.wait_for_timeout(1500)
        report["third_visit"] = page.evaluate(PERF_JS)

        # 4) 断网刷新
        ctx.set_offline(True)
        page.reload(wait_until="domcontentloaded", timeout=90000)
        page.wait_for_function(READY_JS, timeout=120000)
        page.wait_for_timeout(1500)
        report["offline_visit"] = page.evaluate(PERF_JS)
        ctx.set_offline(False)

        caches = page.evaluate("""async () => { const ns = await caches.keys(); const o = {};
          for (const n of ns) { const c = await caches.open(n); const ks = await c.keys();
            let bytes = 0; for (const k of ks) { const r = await c.match(k); if (r) bytes += (await r.clone().blob()).size; }
            o[n] = { count: ks.length, MB: +(bytes / 1048576).toFixed(2) }; } return o; }""")
        report["caches"] = caches
        ctx.close()

    print(f"{'场景':<14}{'总传输':>10}{'请求数':>8}")
    for k in ["first_visit", "second_visit", "third_visit", "offline_visit"]:
        r = report[k]
        print(f"{k:<14}{r['totalKB'] / 1024:>8.2f}MB{r['count']:>8}")
    print("\n缓存占用：")
    for n, v in report["caches"].items():
        print(f"  {n}: {v['count']} 条 / {v['MB']}MB")
    print("\n首访 Top 下载：")
    for it in report["first_visit"]["top"]:
        print(f"  {it['kb']:>6}KB  {it['url']}")

    with open(os.path.join(OUT, "probe.json"), "w", encoding="utf-8") as f:
        json.dump(report, f, ensure_ascii=False, indent=2)
    print("\n原始数据:", os.path.join(OUT, "probe.json"))


if __name__ == "__main__":
    run()
