#!/usr/bin/env python3
"""移动端排版体检（375px 微信阅读环境）

公众号文章绝大多数在手机上阅读：可视宽度只有 375px（正文区约 343px），
且微信里页面不能横向滚动 —— 一个没留白的色块标题、一条长 URL、一张 5 列表格，
就足以把版面撑坏。本脚本把「手机上会难看」的排版参数固化成可复跑的检查。

两层：
  静态层（默认，秒级）：扫 public/themes/*.json 的参数与渲染结果字符串。
  浏览器层（--browser，约 1-2 分钟）：真实引擎渲染 → Chrome 量宽/量折行。

用法：
    python scripts/audit_mobile_typography.py               # 静态层
    python scripts/audit_mobile_typography.py --browser     # 静态 + 浏览器
    python scripts/audit_mobile_typography.py --theme su-feast-azure --browser
    python scripts/audit_mobile_typography.py --json        # 机器可读

退出码：0 全部通过；1 存在 FAIL（可直接当门禁用）。
"""
from __future__ import annotations

import argparse
import io
import json
import re
import sys
from pathlib import Path

BASE = Path(__file__).resolve().parent.parent
sys.path.insert(0, str(BASE))

from core.format_engine import convert_markdown_to_wechat_html  # noqa: E402

THEMES = BASE / "public" / "themes"
OUT = BASE / "output" / "mobile-audit"

# 手机端判据（依据见 docs/mobile-typography.md）
MIN_BODY_FONT = 15.0
MAX_BODY_FONT = 17.0
MIN_LINE_HEIGHT = 1.6
MAX_LINE_HEIGHT = 2.1
MAX_BODY_LETTER_SPACING_EM = 0.08
MIN_SIDE_PADDING = 12.0
MAX_CELL_PADDING = 16.0
CONTENT_WIDTH = 343  # 375 - wrapper 16*2

# 浏览器层样例：长标题 + 长 URL + 5 列表格 + 长代码行
SAMPLE_MD = """# 关于二〇二六年度产品线调整与渠道路径重排的完整说明

正文一段，用来占位。访问 https://example.com/very/long/path/that/never/breaks/and/keeps/going 查看详情。

## 产业链上游材料与零部件供应格局

正文。

```python
def calculate_ebitda_margin(revenue, cogs, opex, depreciation, amortization, tax_rate):  # 长代码行
    return (revenue - cogs - opex - depreciation - amortization) / revenue
```

| 公司 | 2025 收入 | 2026E 收入 | 毛利率 | 备注 |
|---|---|---|---|---|
| 北方华创 | 298.4 亿元 | 372.1 亿元 | 43.2% | 刻蚀与薄膜沉积双轮驱动 |
| 中微公司 | 90.7 亿元 | 118.3 亿元 | 45.6% | 介质刻蚀市占率提升 |

### 关键假设与统计口径

正文。
"""


def _px(v) -> float | None:
    m = re.match(r"^(-?[\d.]+)px$", str(v or "").strip())
    return float(m.group(1)) if m else None


def _num(v) -> float | None:
    m = re.match(r"^(-?[\d.]+)$", str(v or "").strip())
    return float(m.group(1)) if m else None


def _side_padding(pad: str, fallback: float = 0.0) -> float | None:
    parts = str(pad or "").split()
    if not parts:
        return fallback
    try:
        vals = [float(p.replace("px", "")) for p in parts]
    except ValueError:
        return None
    if len(vals) == 1:
        return vals[0]
    if len(vals) >= 4:
        return min(vals[1], vals[3])
    return min(vals[1], vals[1] if len(vals) == 2 else vals[1])


def static_checks(theme_id: str, theme: dict, html: str) -> list[dict]:
    """单个主题的静态体检项。返回 [{'id','level','detail'}]"""
    styles = theme.get("styles") or {}
    issues: list[dict] = []

    def add(cid: str, level: str, detail: str) -> None:
        issues.append({"id": cid, "level": level, "detail": detail})

    p = styles.get("p") or {}
    fs = _px(p.get("font_size"))
    if fs and not (MIN_BODY_FONT <= fs <= MAX_BODY_FONT):
        add("M1 正文字号", "FAIL" if fs < MIN_BODY_FONT else "WARN", f"{fs:g}px（建议 15–17px）")

    lh_raw = p.get("line_height")
    lh = _num(lh_raw)
    if lh is None and _px(lh_raw) and fs:
        lh = _px(lh_raw) / fs
    if lh and not (MIN_LINE_HEIGHT <= lh <= MAX_LINE_HEIGHT):
        add("M2 正文行高", "WARN", f"{lh:g}（建议 1.6–2.1）")

    ls = str(p.get("letter_spacing") or "")
    if ls.endswith("em") and float(ls[:-2]) > MAX_BODY_LETTER_SPACING_EM:
        add("M3 正文字距", "WARN", f"{ls}（正文超过 0.08em 会显得松散）")

    wrapper = styles.get("wrapper") or {}
    sp = _side_padding(wrapper.get("padding"))
    if sp is not None and sp < MIN_SIDE_PADDING:
        add("M4 页面左右留白", "FAIL", f"{sp:g}px（建议 ≥12px，微信默认 16px）")

    # 固定宽度：手机上任何 > 内容宽的元素都会溢出
    for tag, props in styles.items():
        if not isinstance(props, dict):
            continue
        for key in ("width", "min_width"):
            w = _px(props.get(key))
            if w and w > CONTENT_WIDTH + 2:
                add("M5 固定宽度", "FAIL", f"{tag}.{key}={w:g}px > {CONTENT_WIDTH}px")

    # 色块标题必须左对齐（居中的色块标题一折行就呈锯齿）
    # ⚠️ M6/M7/M8/M9 一律看「渲染结果」而不是主题 JSON —— 引擎会在归一阶段
    #    改对齐与内边距，看 JSON 会误报（JSON 永远是设计者的原始声明）。
    h1 = styles.get("h1") or {}
    banner = bool(h1.get("background") or h1.get("background_color"))
    if banner and str(theme.get("heading_align") or "left").lower() != "design":
        centered = re.findall(r"<h[1-6]\s[^>]*text-align:center", html)
        if centered:
            add("M6 色块标题对齐", "FAIL",
                f"{len(centered)} 个标题仍居中（应用 normalize_heading_align）")
        m = re.search(r"<h1\s[^>]*style=\"([^\"]*)\"", html)
        if m:
            pad_raw = re.search(r"padding:([^;]+)", m.group(1))
            pad = _side_padding(pad_raw.group(1)) if pad_raw else None
            if pad is not None and pad < MIN_SIDE_PADDING + 4:
                add("M7 标题左内边距", "WARN", f"{pad:g}px，与正文 16px 栅格不齐")

    # 正文必须可断行（长 URL / 长英文串）
    if "<p " in html and "word-break:break-word" not in html:
        add("M8 长串断行", "FAIL", "正文缺 overflow-wrap/word-break，长 URL 会撑破版面")

    # 表格单元格横向内边距（看渲染结果：引擎会把 >16px 压回 16px）
    for tag in ("td", "th"):
        m = re.search(rf"<{tag}\s[^>]*style=\"([^\"]*)\"", html)
        if not m:
            continue
        pad_raw = re.search(r"padding:([^;]+)", m.group(1))
        sp_cell = _side_padding(pad_raw.group(1)) if pad_raw else None
        if sp_cell is not None and sp_cell > MAX_CELL_PADDING:
            add("M9 单元格内边距", "WARN",
                f"{tag} {sp_cell:g}px > {MAX_CELL_PADDING:g}px（5 列表格会溢出）")
    return issues


def _measure(page, html: str) -> dict:
    """在 375px 视口里量一套主题：页面宽度 / 标题折行 / 表格宽度"""
    page.evaluate("h=>{document.getElementById('c').innerHTML=h}", html)
    return page.evaluate("""() => {
      const c=document.getElementById('c');
      const heads=[...c.querySelectorAll('h1,h2,h3')].map(e=>{
        const cs=getComputedStyle(e), r=e.getBoundingClientRect();
        const inner=r.height-parseFloat(cs.paddingTop)-parseFloat(cs.paddingBottom);
        const lh=parseFloat(cs.lineHeight)||parseFloat(cs.fontSize)*1.3;
        return {tag:e.tagName, lines:Math.round(inner/lh), align:cs.textAlign};
      });
      const tbl=c.querySelector('table');
      return {docW: document.documentElement.scrollWidth, heads,
              tblW: tbl?Math.round(tbl.getBoundingClientRect().width):0};
    }""")


def browser_issues(theme_id: str, r: dict) -> list[dict]:
    """把测量结果翻成体检项（与 static_checks 同构）"""
    issues: list[dict] = []
    if r["docW"] > 376:
        issues.append({"id": "B1 页面横向撑破", "level": "FAIL",
                       "detail": f"内容宽 {r['docW']}px > 375px"})
    if r["tblW"] > CONTENT_WIDTH + 2:
        issues.append({"id": "B2 表格溢出", "level": "FAIL",
                       "detail": f"{r['tblW']}px > {CONTENT_WIDTH}px"})
    wrapped = [h for h in r["heads"] if h["lines"] >= 2 and h["align"] == "center"]
    if wrapped:
        # 刊头类（纯文字居中，如 vogue/社论/信笺）是刻意保留的设计语言，
        # 长标题折行只提示不判死；引擎已加 text-wrap:balance 让两行等长。
        issues.append({"id": "B3 居中标题折行", "level": "WARN",
                       "detail": f"{len(wrapped)} 个居中标题折成多行（刊头类设计取舍）"})
    return issues


def main() -> int:
    ap = argparse.ArgumentParser(description="移动端排版体检（375px 微信）")
    ap.add_argument("--browser", action="store_true", help="启用 Chrome 量宽（较慢）")
    ap.add_argument("--theme", help="只体检指定主题 id")
    ap.add_argument("--json", action="store_true", help="输出 JSON")
    args = ap.parse_args()

    OUT.mkdir(parents=True, exist_ok=True)
    files = sorted(THEMES.glob("*.json"))
    if args.theme:
        files = [f for f in files if f.stem == args.theme] or files

    report = []
    page = None
    pw_ctx = None
    if args.browser:
        from playwright.sync_api import sync_playwright
        pw_ctx = sync_playwright().start()
        browser = pw_ctx.chromium.launch(channel="chrome", headless=True)
        page = browser.new_page(viewport={"width": 375, "height": 900})
        probe = OUT / "_probe.html"
        probe.write_text(
            '<!doctype html><meta charset="utf-8">'
            '<style>html,body{margin:0}body{width:375px}</style><div id="c"></div>',
            encoding="utf-8",
        )
        page.goto(probe.as_uri())

    try:
        for f in files:
            theme = json.loads(f.read_text(encoding="utf-8"))
            html = convert_markdown_to_wechat_html(SAMPLE_MD, str(f))
            issues = static_checks(f.stem, theme, html)
            if page is not None:
                issues += browser_issues(f.stem, _measure(page, html))
            report.append({"theme": f.stem, "name": theme.get("name", ""), "issues": issues})
    finally:
        if page is not None:
            page.context.browser.close()
        if pw_ctx is not None:
            pw_ctx.stop()

    (OUT / "report.json").write_text(
        json.dumps(report, ensure_ascii=False, indent=1), encoding="utf-8")

    if args.json:
        print(json.dumps(report, ensure_ascii=False, indent=1))
    else:
        failed = [r for r in report if any(i["level"] == "FAIL" for i in r["issues"])]
        warned = [r for r in report if any(i["level"] == "WARN" for i in r["issues"])]
        print(f"体检主题：{len(report)} 套")
        print(f"FAIL：{len(failed)} 套 | 仅 WARN：{len(warned)} 套 | 干净：{len(report) - len(failed) - len(warned)} 套")
        for r in failed[:20]:
            print(f"\n✗ {r['theme']}（{r['name']}）")
            for i in r["issues"]:
                if i["level"] == "FAIL":
                    print(f"   - {i['id']}：{i['detail']}")
        if warned:
            print("\nWARN 汇总：")
            from collections import Counter
            cnt = Counter(i["id"] for r in warned for i in r["issues"] if i["level"] == "WARN")
            for k, v in cnt.most_common():
                print(f"   - {k}：{v} 套")
        print(f"\n报告：{OUT / 'report.json'}")

    has_fail = any(i["level"] == "FAIL" for r in report for i in r["issues"])
    return 1 if has_fail else 0


if __name__ == "__main__":
    raise SystemExit(main())
