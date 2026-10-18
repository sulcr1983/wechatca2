#!/usr/bin/env python
"""首访时间线 & 传输量分解（回答「到底慢在哪」）

记录：导航开始 → 首屏可输入 → 主题就绪 → 引擎就绪 → 首次排版完成，
以及每个阶段的传输字节。输出 output/pwa_payload/timeline.json
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
PROFILE = os.path.join(OUT, "profile_timeline")

MARKS_JS = """() => {
  const paint = performance.getEntriesByType('paint');
  const fcp = (paint.find(p => p.name === 'first-contentful-paint') || {}).startTime || 0;
  const nav = performance.getEntriesByType('navigation')[0] || {};
  return {
    now: Math.round(performance.now()),
    domContentLoaded: Math.round(nav.domContentLoadedEventEnd || 0),
    loadEvent: Math.round(nav.loadEventEnd || 0),
    fcp: Math.round(fcp),
    themesReady: !!document.querySelector('#style-caps .cap'),
    engineReady: document.querySelector('#engine-badge')?.dataset.state === 'ready',
    previewLen: (document.getElementById('preview')?.srcdoc || '').length,
    inputVisible: !!document.getElementById('input')?.offsetParent,
  };
}"""

BYTES_JS = """() => {
  const es = performance.getEntriesByType('resource');
  const g = {};
  for (const e of es) {
    let k = 'same-origin';
    try { const u = new URL(e.name); k = u.pathname.startsWith('/runtime/') ? 'pyodide-runtime'
          : u.pathname.startsWith('/themes/') ? 'themes'
          : u.pathname.startsWith('/fonts/') ? 'fonts'
          : u.pathname.startsWith('/src/') ? 'app-code' : 'shell/other'; } catch (err) {}
    g[k] = g[k] || { n: 0, kb: 0 };
    g[k].n += 1;
    g[k].kb += Math.round((e.transferSize || 0) / 1024);
  }
  return g;
}"""


def run():
    os.makedirs(OUT, exist_ok=True)
    shutil.rmtree(PROFILE, ignore_errors=True)
    out = {}

    with sync_playwright() as p:
        ctx = p.chromium.launch_persistent_context(
            PROFILE, channel="chrome", headless=False,
            viewport={"width": 1280, "height": 900}, args=["--window-size=1280,900"])
        page = ctx.pages[0] if ctx.pages else ctx.new_page()
        page.goto(URL, wait_until="domcontentloaded", timeout=90000)

        marks = {}
        last = None
        for _ in range(600):
            s = page.evaluate(MARKS_JS)
            key = (s["themesReady"], s["engineReady"], s["previewLen"] > 1000)
            if key != last:
                marks[str(key)] = s
                last = key
            if s["engineReady"] and s["previewLen"] > 1000:
                break
            page.wait_for_timeout(120)
        out["final"] = page.evaluate(MARKS_JS)
        out["marks"] = marks
        out["bytes"] = page.evaluate(BYTES_JS)
        ctx.close()

    print("里程碑（毫秒，相对导航开始）：")
    print(f"  FCP 首屏绘制        {out['final']['fcp']}")
    print(f"  DOMContentLoaded   {out['final']['domContentLoaded']}")
    print(f"  首屏可输入          {out['final'].get('inputVisible')}  ~0（静态 HTML 即刻可输入）")
    for k, s in out["marks"].items():
        print(f"  state={k:<20} now={s['now']:>6}  themes={s['themesReady']} engine={s['engineReady']} preview={s['previewLen']}")
    print("\n分项传输（KB）：")
    for k, v in sorted(out["bytes"].items(), key=lambda x: -x[1]["kb"]):
        print(f"  {k:<18}{v['kb']:>7}KB  {v['n']:>3} 个")

    with open(os.path.join(OUT, "timeline.json"), "w", encoding="utf-8") as f:
        json.dump(out, f, ensure_ascii=False, indent=2)
    print("\n原始数据:", os.path.join(OUT, "timeline.json"))


if __name__ == "__main__":
    run()
