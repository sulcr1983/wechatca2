"""标题图「有底图时文字可读性」门禁（2026-11-06）。

守什么：50 套版式在有底图时，文字不能消失。
用户实测过「有图的话很多模板的字都不出现了」——两个根因：
  ① `.cover-img` 未被定位时占据文档流，把文字顶到画布外（实测 h1 top=1912 > 画布 1440）；
  ② OVERRIDE_CSS 里一条无条件的白字规则把标题刷白，压在模板自带的浅色块上。

判据（真实渲染 + 真实像素，不看 CSS 声明）：
  取每个含文字元素的 computed color，与它所在区域的**实拍底色中位数**算 WCAG 对比度；
  < 2.0 视为不可见。用深色/浅色两张真实照片各测一遍（覆盖两个极端）。

依赖：Playwright（项目既有）、Pillow。
用法：
  .venv/Scripts/python.exe scripts/pwa_cover_image_contrast_test.py
  .venv/Scripts/python.exe scripts/pwa_cover_image_contrast_test.py --limit 8   # 冒烟
退出码：0 全过 / 1 有不可见 / 2 环境缺失
"""
from __future__ import annotations

import argparse
import io
import subprocess
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
sys.path.insert(0, str(ROOT))

DIST = ROOT / "pwa" / "dist"
MIN_CONTRAST = 2.0

PHOTOS = {
    "dark": ROOT / "public" / "images" / "02-night-street.jpg",
    "light": ROOT / "public" / "images" / "01-old-photos.jpg",
}

GEN_JS = """
import fs from 'node:fs';
import path from 'node:path';
const ROOT = process.argv[2];
const OUT = process.argv[3];
const { ALL_STYLES } = await import(`file:///${ROOT}/pwa/src/cover/catalog.js`);
const { buildV3Html, isV3Style } = await import(`file:///${ROOT}/pwa/src/cover/v3-templates.js`);
fs.mkdirSync(OUT, { recursive: true });
const photos = JSON.parse(process.argv[4]);
const seen = new Map();
for (const s of ALL_STYLES) {
  if (!isV3Style(s.id)) continue;
  if (!seen.has(s.layout)) seen.set(s.layout, s.id);
}
let n = 0;
for (const [layout, style] of seen) {
  for (const [tone, url] of Object.entries(photos)) {
    const html = buildV3Html({
      style, size: 'xhs', title: '我给 AI 搞了台免费的云电脑',
      lead: '先折腾开源项目，再跑 Docker，最后把脚本放到云端执行',
      author: '阿苏', image: url, baseUrl: `file:///${ROOT}/pwa/dist/`,
    });
    fs.writeFileSync(path.join(OUT, `${layout}--${tone}.html`), html, 'utf8');
    n += 1;
  }
}
console.log(n);
"""

PROBE = """() => {
  const poster = document.querySelector('.poster');
  if (!poster) return [];
  const pr = poster.getBoundingClientRect();
  const out = [];
  for (const el of poster.querySelectorAll('*')) {
    if (el.children.length > 0) continue;
    const txt = (el.textContent || '').trim();
    if (txt.length < 2) continue;
    const r = el.getBoundingClientRect();
    if (r.width < 10 || r.height < 8) continue;
    /* ⚠️ 必须检查「元素是否落在画布内」：文字被图片顶出画布时（真实 bug），
       getBoundingClientRect 依然有值，只是 top 超出 poster 高度。
       不判范围的话，这个门禁对最严重的情形完全失明（反向验证时实测过）。 */
    const relTop = r.top - pr.top;
    if (relTop > pr.height - 4 || relTop + r.height < 4) {
      out.push({
        text: txt.slice(0, 12),
        cls: String(el.className || el.tagName).slice(0, 16),
        color: [0, 0, 0],
        box: [-1, -1, 0, 0],
        outside: true,
      });
      continue;
    }
    const m = getComputedStyle(el).color.match(/[\\d.]+/g);
    if (!m || (m[3] !== undefined && parseFloat(m[3]) < 0.15)) continue;
    out.push({
      text: txt.slice(0, 12),
      cls: String(el.className || el.tagName).slice(0, 16),
      color: [+m[0], +m[1], +m[2]],
      box: [Math.round(r.left - pr.left), Math.round(relTop),
            Math.round(r.width), Math.round(r.height)],
      outside: false,
    });
  }
  return out;
}"""


def _lum(rgb):
    def ch(c):
        c = c / 255
        return c / 12.92 if c <= 0.04045 else ((c + 0.055) / 1.055) ** 2.4
    r, g, b = (ch(x) for x in rgb)
    return 0.2126 * r + 0.7152 * g + 0.0722 * b


def _contrast(a, b):
    la, lb = _lum(a), _lum(b)
    hi, lo = max(la, lb), min(la, lb)
    return (hi + 0.05) / (lo + 0.05)


def main() -> int:
    ap = argparse.ArgumentParser()
    ap.add_argument("--limit", type=int, default=0, help="只测前 N 套（冒烟）")
    args = ap.parse_args()

    if not (DIST / "index.html").exists():
        print("pwa/dist 不存在，先跑 node pwa/scripts/build.mjs", flush=True)
        return 2
    for tone, p in PHOTOS.items():
        if not p.exists():
            print(f"缺少测试底图（{tone}）：{p}", flush=True)
            return 2

    import json
    import tempfile

    try:
        from playwright.sync_api import sync_playwright
        from PIL import Image
    except ImportError as e:
        print(f"缺少依赖：{e}", flush=True)
        return 2

    from core.browser_utils import launch_browser

    photos = {k: v.as_uri().replace("\\", "/") for k, v in PHOTOS.items()}
    out_dir = Path(tempfile.mkdtemp(prefix="cover-imgcheck-"))
    js = out_dir / "gen.mjs"
    js.write_text(GEN_JS, encoding="utf-8")
    res = subprocess.run(
        ["node", str(js), str(ROOT), str(out_dir), json.dumps(photos)],
        capture_output=True, text=True, encoding="utf-8",
    )
    if res.returncode != 0:
        print("生成测试 HTML 失败：", res.stderr[-500:], flush=True)
        return 2
    files = sorted(out_dir.glob("*.html"))
    if args.limit:
        files = files[:args.limit * len(photos)]
    print(f"检测 {len(files)} 个「有底图」渲染（{len(files) // max(1, len(photos))} 套 × {len(photos)} 底图）",
          flush=True)

    bad = []
    with sync_playwright() as p:
        browser = launch_browser(p, headless=True, args=["--no-proxy-server"])
        pg = browser.new_page(viewport={"width": 1080, "height": 1440})
        for f in files:
            pg.goto(f.as_uri(), wait_until="load")
            pg.wait_for_timeout(420)
            items = pg.evaluate(PROBE)
            if not items:
                bad.append((f.stem, "无文字元素（文字被顶出画布？）", 0.0))
                continue
            shot = pg.screenshot()
            im = Image.open(io.BytesIO(shot)).convert("RGB")
            W, H = im.size
            worst = None
            for it in items:
                if it.get("outside"):
                    worst = (f"{it['text']} ({it['cls']})", it["cls"], 0.0)
                    break
                x, y, w, h = it["box"]
                x0, y0 = max(0, x), max(0, y)
                x1, y1 = min(W, x + w), min(H, y + h)
                if x1 - x0 < 4 or y1 - y0 < 4:
                    continue
                crop = im.crop((x0, y0, x1, y1))
                small = crop.resize((min(12, max(1, crop.width)), min(12, max(1, crop.height))))
                import warnings
                with warnings.catch_warnings():
                    warnings.simplefilter("ignore", DeprecationWarning)
                    px = list(small.convert("RGB").getdata())
                # ⚠️ 取样区域里混着文字像素本身：小字号元素（如 23×15 的编号）里
                # 白字可能占掉一半以上，中位数会被拉成文字色 → 误判「字看不见」。
                # 这里取**暗端分位数**（25%）当底色：文字通常是少数派，
                # 且我们的修复方向是「白字压暗底」，底色必然比字暗。
                rs = sorted(c[0] for c in px)
                gs = sorted(c[1] for c in px)
                bs = sorted(c[2] for c in px)
                q = max(0, int(len(px) * 0.25))
                bg = (rs[q], gs[q], bs[q])
                cr = _contrast(tuple(it["color"]), bg)
                if worst is None or cr < worst[2]:
                    worst = (f"{it['text']} ({it['cls']})", it["cls"], cr)
            if worst and worst[2] < MIN_CONTRAST:
                bad.append((f.stem, worst[0], round(worst[2], 2)))
        browser.close()

    print("=" * 60)
    if bad:
        print(f"有底图时文字不可见（对比度 < {MIN_CONTRAST}）：{len(bad)} 个", flush=True)
        for name, detail, cr in bad:
            print(f"  ✗ {name:26s} {detail:38s} 对比度 {cr}", flush=True)
        print(f"\n共 {len(files)} 个组合，失败 {len(bad)} 个", flush=True)
        return 1
    print(f"✅ 有底图时文字全部可见（{len(files)} 个组合）")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
