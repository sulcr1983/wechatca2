#!/usr/bin/env python3
"""19 套「整篇设计」(mg-*) 对齐夹具 —— 回答「能不能完整实现文字自动对齐」。

⚠️ 断言依据是**各套原有设计规范**，不是我的偏好：
   docs/design-magazine-recipes.md §2.1–2.15 逐套配方
   只有浮世绘（§2.7）明写「两端对齐」；卫报/经济学人/宜家/深度阅读写的是「左对齐」；
   其余 14 套规范未提对齐 → 保持引擎默认 left。

为什么不能只测「当前配置对不对」（A1a/A1b 的致命缺陷）
  19 套 themes JSON 的 styles.p.text_align 全是 "left"，而引擎默认也是 left，
   所以「其余 18 套必须是 left」这条断言**删光代码依然全绿** —— 摆设的是测试本身。
   真正有分辨力的是 A1c：把 justify **强制注入**进每套产物，看浏览器里右缘是否真的齐。
   那测的是「19 套的 DOM 结构能不能两端对齐」，即用户问的那个「能不能」。

断言清单（12 条 × 19 套）
  静态层（秒级，可当门禁）
    A1a  浮世绘产物必须含 text-align:justify
    A1b  其余 18 套产物不得含 text-align:justify
    A2   不丢字：纯文字长度 ≥ 原输入 95%
    A3   标签配平（section/p/blockquote/span/div）
    A4   无残留标记（::: / ~~ / ``` / None）
    A5   结构齐全（夹具里的 h1 / h2 / blockquote 都还在）
    A6   对齐契约与产物逐套相符
    A7   禁写属性：仅 <p> 开标签不含 text-justify / hanging-punctuation /
         text-autospace / line-break（其余元素有 3 处合法的 text-align:center，不在此列）
    A10  改造必须真的发生：注入探针后产物 ≠ 未注入产物
         （守 _guard 静默返回原文——一旦触发，A2–A9 全在「没改过的产物」上跑、全绿）
  浏览器层（--browser，Playwright 375px 实测）
    A1c  能力断言：强制注入 justify 后，非末行右缘 ≤ 1.5px（核心）
    A8   justify 套右缘 ≤ 1.5px 且左对齐套右缘 > 0；页面无横向溢出
    A9   逐字不撑散：行内相邻字符间距 max ≤ 1px

用法
    .venv/Scripts/python.exe scripts/kit_alignment_fixture.py             # 静态层
    .venv/Scripts/python.exe scripts/kit_alignment_fixture.py --browser    # 静态 + 浏览器
    .venv/Scripts/python.exe scripts/kit_alignment_fixture.py --kit mg-ukiyoe
    .venv/Scripts/python.exe scripts/kit_alignment_fixture.py --json out.json
"""
from __future__ import annotations

import argparse
import json
import re
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
sys.path.insert(0, str(ROOT))

from core.format_engine import convert_markdown_to_wechat_html  # noqa: E402
from core.preprocessor import preprocess  # noqa: E402

THEMES = ROOT / "public" / "themes"

# ── 各套对齐契约：值 + 规范出处 ──────────────────────────────────────
# 出处一律指 docs/design-magazine-recipes.md；未写对齐的套保持引擎默认。
SPEC: dict[str, tuple[str, str]] = {
    "mg-ukiyoe": ("justify", "recipes §2.7「正文…两端对齐」"),
    "mg-guardian": ("left", "recipes §2.2 无对齐要求，左对齐到底"),
    "mg-economist": ("left", "recipes §2.4「小标题左对齐」"),
    "mg-ikea": ("left", "recipes §2.14「大标题左对齐」"),
    "mg-deepread": ("left", "recipes §2.15「主标题左对齐」"),
}
DEFAULT_ALIGN = "left"  # 其余 14 套规范未指定 → 引擎默认

# ── 夹具：一份覆盖 p / li / blockquote / strong / 中英混排 ────────────
FIXTURE = """# 周末去了趟海边，这次终于什么也没做

两天里我没看手机，也没带相机。风很大，但很舒服。回程路上一直在想：人为什么要那么赶？这个问题我问了自己三次。

## 第一天：什么也没做

- 坐在礁石上看了很久的海，海水的颜色从浅绿变成深蓝
- 傍晚去镇上吃饭，点了三个菜，花了一百二十八元，老板笑着说 come back tomorrow
- 回民宿的路上遇到一只很胖的橘猫

## 第二天：五点起床看日出

> 后来我才发现，那天唯一拍下的照片，是手机彻底没电之前随手按的一张。

这段话里混了 English words 和中文，还有「引号」和（括号），以及 **加粗重点**，用来验证 strong 不被破坏。
"""

FORBIDDEN = ("text-justify", "hanging-punctuation", "text-autospace", "line-break")


# ── 静态工具 ─────────────────────────────────────────────────────────
def plain_len(html: str) -> int:
    """纯文字长度（剥标签、去空白）。不能用 format_engine 的 _plain_len：
    它按 `<[^>]+>` 剥，遇到 &nbsp; 与实体不等价。"""
    s = re.sub(r"<(script|style)[^>]*>.*?</\1>", "", html, flags=re.S | re.I)
    s = re.sub(r"<[^>]*>", "", s)
    s = s.replace("&nbsp;", " ").replace("&#160;", " ").replace("&amp;", "&")
    return len(re.sub(r"\s+", "", s))


def balanced(html: str) -> tuple[bool, str]:
    for tag in ("section", "p", "blockquote", "span", "div"):
        o = len(re.findall(rf"<{tag}\b", html))
        c = len(re.findall(rf"</{tag}>", html))
        if o != c:
            return False, f"{tag} 开{o}/闭{c}"
    return True, ""


def residue(html: str) -> str:
    text = re.sub(r"<[^>]+>", "", html)
    bad = [tok for tok in (":::", "~~", "```", "None") if tok in text or tok in html]
    return ",".join(bad)


def body_align(html: str) -> str:
    """正文（第一个 <p>）的 text-align；缺省 = start（引擎默认，视觉等同 left）。"""
    m = re.search(r"<p[^>]*style=\"([^\"]*)\"", html)
    if not m:
        return "start"
    a = re.search(r"text-align:\s*([a-z-]+)", m.group(1))
    return a.group(1) if a else "start"


def norm_align(v: str) -> str:
    return {"start": "left", "": "left"}.get(v, v)


def forbidden_in_p(html: str) -> str:
    """A7：只查 <p> 开标签。其余元素存在 3 处合法的 text-align:center 装饰。"""
    hits = []
    for m in re.finditer(r"<p\b[^>]*>", html):
        for attr in FORBIDDEN:
            if attr in m.group(0):
                hits.append(attr)
    return ",".join(sorted(set(hits)))


def inject_justify(html: str) -> str:
    """把 text-align:justify 注入到每个 <p> 的 style **末尾**。
    必须追加在末尾：原有 text-align:left 在前面，追加才能覆盖。
    返回到产物；用于 A1c（能力断言）与 A10（改造发生）探针。"""
    def repl(m: re.Match[str]) -> str:
        whole = m.group(0)
        if "style=\"" in whole:
            return re.sub(r"(style=\")([^\"]*)(\")",
                          lambda s: f"{s.group(1)}{s.group(2)};text-align:justify{s.group(3)}",
                          whole, count=1)
        return whole.replace("<p", '<p style="text-align:justify"', 1)

    return re.sub(r"<p\b[^>]*>", repl, html)


# ── 浏览器测量 ───────────────────────────────────────────────────────
MEASURE = r"""
() => {
  const ps = [...document.querySelectorAll('#c p')];
  let maxNonLast = 0, lines = 0;
  for (const el of ps) {
    const b = el.getBoundingClientRect();
    const cs = getComputedStyle(el);
    const lh = parseFloat(cs.lineHeight) || parseFloat(cs.fontSize) * 1.6 || 24;
    const tol = lh * 0.5;   // 行内 rect 的 top 会有亚像素抖动，必须聚类而不是取整
    const r = document.createRange();
    r.selectNodeContents(el);
    const rects = [...r.getClientRects()].filter(x => x.width > 1);

    // 按 top 聚类成「视觉行」。
    // ⚠️ 不能用 Math.round(top) 分组：实测 mg-brutal/mg-economist 会出现
    //    top=925 与 926 被拆成两个"行"，于是末行的碎片被当成非末行，
    //    报出 290px 的假失败（2026-11-03 实测踩到）。
    const sorted = rects.slice().sort((x, y) => x.top - y.top);
    const groups = [];
    for (const g of sorted) {
      const last = groups[groups.length - 1];
      if (last && Math.abs(g.top - last.top0) <= tol) {
        last.items.push(g);
      } else {
        groups.push({ top0: g.top, items: [g] });
      }
    }

    lines += groups.length;
    // 只测「非末行」：末行本来就短，测它没有意义
    for (let i = 0; i < groups.length - 1; i++) {
      const lastR = Math.max(...groups[i].items.map(g => g.right));
      maxNonLast = Math.max(maxNonLast, b.right - lastR);
    }
  }
  return {
    maxNonLast: +maxNonLast.toFixed(2),
    lines,
    overflowX: Math.max(0, document.documentElement.scrollWidth - window.innerWidth),
  };
}
"""

CHAR_GAPS = r"""
() => {
  // 逐字测量：justify 若把字撑散，相邻字符之间会出现可见空隙。
  // 用 Range 逐字符取 rect（不依赖 span —— 19 套列表根本没有 <li>/<ul>）。
  let maxGap = 0;
  const p = document.querySelector('#c p');
  if (!p) return {maxGap: 0, chars: 0};
  const walker = document.createTreeWalker(p, NodeFilter.SHOW_TEXT);
  let node, chars = 0;
  while ((node = walker.nextNode())) {
    const t = node.textContent || '';
    for (let i = 0; i < t.length - 1; i++) {
      if (/\s/.test(t[i]) || /\s/.test(t[i + 1])) continue;
      const r1 = document.createRange();
      r1.setStart(node, i); r1.setEnd(node, i + 1);
      const r2 = document.createRange();
      r2.setStart(node, i + 1); r2.setEnd(node, i + 2);
      const b1 = r1.getBoundingClientRect(), b2 = r2.getBoundingClientRect();
      if (Math.round(b1.top) !== Math.round(b2.top)) continue;
      maxGap = Math.max(maxGap, b2.left - b1.right);
      chars++;
    }
  }
  return {maxGap: +maxGap.toFixed(2), chars};
}
"""

# ⚠️ 不能用 str.format()：CSS 里的花括号会被当成占位符（KeyError: 'margin'）。
_PAGE_HEAD = (
    "<!DOCTYPE html><html><head><meta charset='utf-8'><style>"
    "html,body{margin:0;padding:0;}"
    "body{width:375px;font-family:'Microsoft YaHei',sans-serif;}"
    "#c{width:343px;margin:0 auto;}"
    "</style></head><body><div id='c'>"
)
_PAGE_TAIL = "</div></body></html>"


def build_page(html: str) -> str:
    return _PAGE_HEAD + html + _PAGE_TAIL


# ── 断言 ─────────────────────────────────────────────────────────────
def static_checks(stem: str, html: str, baseline_len: int) -> list[tuple[str, bool, str]]:
    want, why = SPEC.get(stem, (DEFAULT_ALIGN, "规范未指定 → 引擎默认"))
    got = norm_align(body_align(html))
    has_justify = bool(re.search(r"text-align:\s*justify", html))

    checks: list[tuple[str, bool, str]] = []

    # A1a / A1b：按契约分开计，避免「18 套恒真」混进得分
    if want == "justify":
        checks.append(("A1a-浮世绘必须justify", has_justify, f"{why}"))
    else:
        checks.append(("A1b-其余套不得justify", not has_justify, f"{why}"))

    # A2 不丢字
    ratio = plain_len(html) / max(baseline_len, 1)
    checks.append(("A2-保真≥95%", ratio >= 0.95, f"{ratio:.1%}"))

    # A3 配平
    ok, msg = balanced(html)
    checks.append(("A3-标签配平", ok, msg or "OK"))

    # A4 无残留
    res = residue(html)
    checks.append(("A4-无残留", not res, res or "OK"))

    # A5 结构齐全
    has = ("<h1" in html, "<h2" in html, "<blockquote" in html)
    checks.append(("A5-结构齐全", all(has), f"h1/h2/blockquote={has}"))

    # A6 契约一致
    checks.append(("A6-对齐契约", got == want, f"want={want} got={got}"))

    # A7 禁写属性（仅 <p>）
    bad = forbidden_in_p(html)
    checks.append(("A7-禁写属性", not bad, bad or "OK"))

    # A10 改造必须真的发生
    injected = inject_justify(html)
    changed = injected != html
    checks.append(("A10-改造发生", changed,
                   "注入后产物有变化" if changed else "⚠️ 注入无效果，_guard 可能静默返回原文"))

    return checks


def browser_checks(stem: str, html: str, page) -> list[tuple[str, bool, str]]:
    want = SPEC.get(stem, (DEFAULT_ALIGN, ""))[0]
    out: list[tuple[str, bool, str]] = []

    # 1) 原产物（未注入）：A8
    page.set_content(build_page(html), wait_until="load")
    page.wait_for_timeout(30)
    m = page.evaluate(MEASURE)
    gaps = page.evaluate(CHAR_GAPS)

    if want == "justify":
        out.append(("A8-justify右缘齐", m["maxNonLast"] <= 1.5,
                    f"非末行右缘={m['maxNonLast']}px（应≤1.5）"))
    else:
        out.append(("A8-左对齐右缘不齐", m["maxNonLast"] > 0,
                    f"非末行右缘={m['maxNonLast']}px（应>0）"))
    out.append(("A9-逐字不撑散", gaps["maxGap"] <= 1.0,
                f"字间距max={gaps['maxGap']}px / 测了{gaps['chars']}对（应≤1.0）"))
    out.append(("A8b-无横向溢出", m["overflowX"] == 0, f"{m['overflowX']}px"))

    # 2) 强制注入 justify 后：A1c 能力断言（核心）
    inj = inject_justify(html)
    page.set_content(build_page(inj), wait_until="load")
    page.wait_for_timeout(30)
    mi = page.evaluate(MEASURE)
    out.append(("A1c-强制justify后能齐", mi["maxNonLast"] <= 1.5,
                f"注入后非末行右缘={mi['maxNonLast']}px（应≤1.5）"))
    return out


# ── 主流程 ───────────────────────────────────────────────────────────
def main() -> int:
    if hasattr(sys.stdout, "reconfigure"):
        sys.stdout.reconfigure(encoding="utf-8", errors="replace")

    ap = argparse.ArgumentParser()
    ap.add_argument("--browser", action="store_true", help="加浏览器层（A1c/A8/A9）")
    ap.add_argument("--kit", help="只测某套，如 mg-ukiyoe")
    ap.add_argument("--json", help="把明细写到指定文件")
    args = ap.parse_args()

    themes = sorted(THEMES.glob("mg-*.json"))
    if args.kit:
        themes = [t for t in themes if t.stem == args.kit]
        if not themes:
            print(f"⛔ 找不到主题 {args.kit}")
            return 2

    # 基线：用 mg-time 渲染同一夹具的纯文字长度（各套只改样式，不改文字）
    baseline_len = plain_len(
        convert_markdown_to_wechat_html(preprocess(FIXTURE), str(THEMES / "mg-time.json"))
    )

    results: list[tuple[str, str, bool, str]] = []
    page = None
    pw_ctx = browser = None

    if args.browser:
        try:
            from playwright.sync_api import sync_playwright
            from core.browser_utils import launch_browser

            pw_ctx = sync_playwright().start()
            browser = launch_browser(pw_ctx, args=["--no-proxy-server"])
            page = browser.new_page(viewport={"width": 375, "height": 900})
            page.set_default_timeout(20000)
        except Exception as exc:  # noqa: BLE001
            print(f"⛔ 浏览器启动失败：{exc}")
            return 2

    try:
        for f in themes:
            stem = f.stem
            try:
                html = convert_markdown_to_wechat_html(preprocess(FIXTURE), str(f))
            except Exception as exc:  # noqa: BLE001
                results.append((stem, "渲染", False, f"引擎异常：{exc}"))
                continue

            for name, ok, detail in static_checks(stem, html, baseline_len):
                results.append((stem, name, ok, detail))

            if page is not None:
                for name, ok, detail in browser_checks(stem, html, page):
                    results.append((stem, name, ok, detail))
    finally:
        if browser is not None:
            browser.close()
        if pw_ctx is not None:
            pw_ctx.stop()

    # ── 汇总 ──
    by_kit: dict[str, list[tuple[str, bool, str]]] = {}
    for stem, name, ok, detail in results:
        by_kit.setdefault(stem, []).append((name, ok, detail))

    print(f"{'kit':<22}{'结果':<6}明细")
    print("-" * 96)
    for stem, items in by_kit.items():
        bad = [(n, d) for n, ok, d in items if not ok]
        want, _ = SPEC.get(stem, (DEFAULT_ALIGN, ""))
        mark = "✅" if not bad else "❌"
        print(f"{stem:<22}{mark:<6}{'want=' + want if not bad else ''}")
        for n, d in bad:
            print(f"{'':<22}{'':<6}  ✗ {n}: {d}")

    total = len(results)
    passed = sum(1 for _s, _n, ok, _d in results if ok)
    print("-" * 96)
    per_kit = total // max(len(by_kit), 1)
    print(f"合计 {passed}/{total} 通过（{per_kit} 条断言 × {len(by_kit)} 套）")
    if not args.browser:
        print("ℹ️  A1c / A8 / A9 需 --browser；不加时总数会少 3×19")

    if args.json:
        Path(args.json).write_text(
            json.dumps([{"kit": s, "assert": n, "ok": o, "detail": d}
                        for s, n, o, d in results], ensure_ascii=False, indent=1),
            encoding="utf-8",
        )
        print(f"明细 -> {args.json}")

    return 0 if passed == total else 1


if __name__ == "__main__":
    sys.exit(main())
