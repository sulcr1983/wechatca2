# -*- coding: utf-8 -*-
"""线上实测：把主题切到预览里，量**浏览器算出来的**标题 / 正文对比度。

本地门禁 `scripts/theme_contrast_audit.py` 量的是引擎产出的样式（解析层面）；
这个脚本量的是真实渲染结果（合成层面）。两者口径必须一致，不一致就说明
「测试用一套标准、渲染用另一套」，那门禁绿了也没意义。

用法：
    python scripts/theme_contrast_online.py                # 只跑 v1.8.4 改过色的 15 套
    python scripts/theme_contrast_online.py aurora sakura  # 指定几套
    python scripts/theme_contrast_online.py --all          # 全量 164 套（约 11 分钟）

只读，独立 playwright profile（不会碰用户自己开着的 Chrome），也不关任何浏览器。

三个坑（第一版全踩了，改之前先看）：
1. 就绪判定：app.js 里 engineReady 是模块内变量，页面上唯一可观测的信号是
   `#boot` 被加上 `gone` class（`$('boot').classList.add('gone')`）。
2. 底色不能只看元素自己的 background：主题把底色画在包一层的 div 上，
   元素自己 transparent。第一版落到 `body` 的 backgroundColor 上，
   而 body 是透明的 → 解析成黑色 → 正文对比度全被算成 1.2~1.8 的假失败。
   现在沿祖先链找第一个真正画了底色的层（渐变取色标，纯色按 alpha 合成）。
3. 渐变色标必须按 alpha 合成，不能直接用原始 RGB：`rgba(200,160,98,0.35)`
   压在白底上其实是米色，直接用 (200,160,98) 算会把 focus-gold 的金色标题
   算成 1.29 的假失败。另外 `background-size: 100% 1px` 那种只画上下两条
   细线的，文字不压在它上面，不算底色（引擎护栏也是这个口径）。
"""
import sys
from pathlib import Path

from playwright.sync_api import sync_playwright

sys.stdout.reconfigure(encoding="utf-8", errors="replace")
ROOT = Path(__file__).resolve().parents[1]
OUT = ROOT / "output" / "contrast-online"
OUT.mkdir(parents=True, exist_ok=True)
URL = "https://supersu.ccwu.cc/"

HEADING_MIN, BODY_MIN = 3.0, 4.5

TEXT = """# 产品需求文档 PRD V1.0

本文说明这一版要解决的问题、边界和验收口径。

## 一、产品概述

这是一个测试段落，用来验证默认版式下的标题与正文是否都看得清。

### 1.1 细节补充

三级标题也要看得清，否则层级就白做了。

## 二、MVP 范围与边界

第二阶段主要面向中小团队，先做最小闭环，不做协作与权限。
"""

# v1.8.4 护栏实际改到颜色的全部主题（改前/改后 HTML diff 得出），默认只跑这 15 套
CHANGED_IN_1_8_4 = [
    "aurora", "autumn-leaf", "bauhaus", "bold-green", "bytedance",
    "focus-gold", "fresh-card", "midnight", "sakura", "sports",
    "su-feast-bamboo", "su-feast-gold", "su-feast-teal", "sunset-blend", "warm-card",
]


def pick_themes() -> list[str]:
    args = [a for a in sys.argv[1:] if not a.startswith("-")]
    if "--all" in sys.argv:
        return sorted(p.stem for p in (ROOT / "public" / "themes").glob("*.json"))
    return args or CHANGED_IN_1_8_4


THEMES = pick_themes()

MEASURE = """() => {
  const f = document.querySelector('#preview');
  const d = f && (f.contentDocument || f.contentWindow.document);
  if (!d) return null;

  const parse = (v) => {
    const m = /rgba?\\((\\d+),\\s*(\\d+),\\s*(\\d+)(?:[,\\s\\/]+([\\d.]+%?))?\\)/
      .exec(v || '');
    if (!m) return null;
    let a = m[4] === undefined ? 1 : (m[4].endsWith('%') ? +m[4].slice(0, -1) / 100 : +m[4]);
    return { c: [+m[1], +m[2], +m[3]], a };
  };
  const over = (fg, bg, a) => fg.map((v, i) => Math.round(v * a + bg[i] * (1 - a)));
  const WHITE = [255, 255, 255];

  // 从元素往上走，收集「真正画了底色」的层（近 → 远），遇到不透明层就停
  // 只有 `background-size: … 1px` 这种装饰细线不算底色（文字不压在线上）
  const isHairline = (size) => {
    if (!size) return false;
    return size.split(',').every((p) => {
      const m = /([\\d.]+)(px|%)\\s+([\\d.]+)(px|%)/.exec(p.trim());
      return m && m[4] === 'px' && +m[3] <= 3;
    });
  };
  const layers = (el) => {
    const out = [];
    let n = el;
    while (n && n.nodeType === 1) {
      const cs = getComputedStyle(n);
      const img = cs.backgroundImage || 'none';
      if (img !== 'none' && !isHairline(cs.backgroundSize)) {
        const stops = (img.match(/rgba?\\([^)]*\\)/g) || [])
          .map(parse).filter((s) => s && s.a > 0.01);
        if (stops.length) out.push({ grad: stops });
      }
      const c = parse(cs.backgroundColor);
      if (c && c.a > 0.01) {
        out.push({ solid: c.c, a: c.a });
        if (c.a >= 0.99) break;
      }
      n = n.parentElement;
    }
    return out;
  };

  // 从最深处往近处合成，得到「这一层下面是什么颜色」
  const baseUnder = (ls, from) => {
    let base = WHITE;
    for (let i = ls.length - 1; i >= from; i--) {
      const l = ls[i];
      if (l.grad) { base = l.grad[0].c; break; }
      base = l.a >= 0.99 ? l.solid : over(l.solid, base, l.a);
      if (l.a >= 0.99) break;
    }
    return base;
  };

  // 文字实际压着的候选底色：最近的渐变取每个色标（按 alpha 合成到下层），
  // 纯色按 alpha 逐层合成
  const bgCandidates = (el) => {
    const ls = layers(el);
    if (!ls.length) return [WHITE];
    const first = ls[0];
    if (first.grad) {
      const base = baseUnder(ls, 1);
      return first.grad.map((s) => (s.a >= 0.99 ? s.c : over(s.c, base, s.a)));
    }
    const base = baseUnder(ls, 1);
    return [first.a >= 0.99 ? first.solid : over(first.solid, base, first.a)];
  };

  const grab = (sel) => {
    const el = d.querySelector(sel);
    if (!el) return null;
    const cs = getComputedStyle(el);
    const col = parse(cs.color);
    if (!col) return null;
    return {
      color: col.c,
      bgs: bgCandidates(el),
      text: (el.textContent || '').trim().slice(0, 14),
      size: cs.fontSize,
    };
  };
  return { h1: grab('h1'), h2: grab('h2'), h3: grab('h3'), p: grab('p') };
}"""


def lum(c):
    def f(x):
        x /= 255.0
        return x / 12.92 if x <= 0.03928 else ((x + 0.055) / 1.055) ** 2.4
    r, g, b = (f(v) for v in c)
    return 0.2126 * r + 0.7152 * g + 0.0722 * b


def ratio(a, b):
    la, lb = lum(a), lum(b)
    return round((max(la, lb) + 0.05) / (min(la, lb) + 0.05), 2)


def worst_of(info):
    if not info or not info.get("color"):
        return None
    return min(ratio(info["color"], b) for b in info["bgs"])


def main():
    fails = []
    done = 0
    with sync_playwright() as p:
        browser = p.chromium.launch(
            channel="chrome", headless=False, args=["--window-size=1280,960"])
        ctx = browser.new_context(viewport={"width": 1280, "height": 960})
        page = ctx.new_page()
        errs = []
        page.on("pageerror", lambda e: errs.append(str(e)[:160]))
        page.goto(URL, wait_until="domcontentloaded", timeout=60000)
        page.wait_for_selector("#input", timeout=60000)
        page.fill("#input", TEXT)
        page.wait_for_function(
            "() => { const b = document.getElementById('boot');"
            " return !b || b.classList.contains('gone'); }", timeout=180000)
        print(f"引擎就绪 ✅  {URL}  共 {len(THEMES)} 套")

        for tid in THEMES:
            try:
                got = measure_one(page, tid, fails)
            except Exception as exc:                     # noqa: BLE001
                # 浏览器被外部关掉之类：不掩盖，如实报出来并停下（已测的依然有效）
                print(f"!! {tid} 中断：{type(exc).__name__}: {str(exc)[:120]}")
                fails.append((tid, "浏览器中断"))
                break
            if got is None:
                continue
            done += 1
            cells = [f"{tid:<16}"]
            for tag in ("h1", "h2", "h3", "p"):
                cells.append(f"{tag}={got[tag] if got[tag] is not None else '—'}")
            print("  ".join(cells))
            page.screenshot(path=str(OUT / f"{tid}.png"))

        print("JS 错误:", errs or "无")
        browser.close()

    print("-" * 62)
    if fails:
        print("不达标:", fails)
        return 1
    print(f"PASS：线上实测 {done} 套，标题 ≥{HEADING_MIN}、正文 ≥{BODY_MIN}")
    print("截图目录:", OUT)
    return 0


def measure_one(page, tid: str, fails: list) -> dict | None:
    """切到某主题 → 量 h1/h2/h3/正文 → 关抽屉。返回 {tag: 最差对比度}"""
    page.click("#btn-themes")
    page.wait_for_selector("#drawer:not([hidden])", timeout=15000)
    page.fill("#drawer-search", tid)
    page.wait_for_timeout(200)
    card = page.locator(f".d-card[data-id='{tid}']")
    if card.count() == 0:
        print(f"!! {tid} 搜不到")
        fails.append((tid, "搜不到"))
        page.click("#btn-drawer-close")
        return None
    card.first.click()
    page.wait_for_timeout(2500)              # 等重渲染（worker 里有队列）
    m = page.evaluate(MEASURE)
    page.click("#btn-drawer-close")
    page.wait_for_timeout(400)
    if not m:
        fails.append((tid, "预览 iframe 取不到"))
        return None

    got = {tag: worst_of(m.get(tag)) for tag in ("h1", "h2", "h3", "p")}
    for tag in ("h1", "h2", "h3"):
        v = got[tag]
        if v is not None and v < HEADING_MIN:
            fails.append((tid, f"{tag} 对比度 {v} < {HEADING_MIN}"))
    if got["p"] is not None and got["p"] < BODY_MIN:
        fails.append((tid, f"正文对比度 {got['p']} < {BODY_MIN}"))
    return got


if __name__ == "__main__":
    sys.exit(main())
