#!/usr/bin/env python3
"""A 模块静态产物审计（只读，不改产品）

对 183 套主题 × 3 类夹具做引擎级渲染，检查的是**产物**而不是控件：
  · 正文是否保留（逐句子串比对，空白归一）
  · 标签是否配平、是否有空 style / None / 残渣
  · 是否残留 <script> / on* 事件 / javascript: 协议
  · 19 套 kit 是否真的走 locked_layout
  · 15 个版式入口下 <h2> 语义是否保留（复现 W-8）

输出：output/audit-2026-11-06/a/static.json
用法：
    .venv/Scripts/python.exe scripts/audit_a_static.py
    .venv/Scripts/python.exe scripts/audit_a_static.py --limit 10   # 冒烟
"""
from __future__ import annotations

import argparse
import json
import re
import sys
from html.parser import HTMLParser
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
sys.path.insert(0, str(ROOT))

from core.format_engine import convert_markdown_to_wechat_html  # noqa: E402

THEMES = ROOT / "public" / "themes"
OUT = ROOT / "output" / "audit-2026-11-06" / "a"
VOID = {"br", "img", "hr", "meta", "link", "input", "source", "area", "base", "col", "embed", "track", "wbr"}

FIXTURES = {
    "short": """周末去海边

两天的沉默之后，我重新听见了海浪、风声，还有自己。

风把云推着走，我把脚步放慢。""",
    "standard": """把一件事做深

很多人以为效率来自工具，其实效率来自取舍。

## 一、先做减法

- 关掉不必要的提醒
- 把同类任务放在一起
- 每天只保留三个重点

> 真正的专注，不是做更多，而是少做一点。

## 二、再做加法

1. 给重要的事留出整块时间
2. 给突发的事留出缓冲
3. 给复盘留出固定位置

最后，把结果写下来，下周再看一遍。""",
    "complex": """复杂输入压力测试

这是一段普通正文，里面包含 **加粗**、*斜体*、`行内代码` 和一个 [外链](https://example.com/a?b=1)。

## 表格与代码

| 项目 | 说明 | 负责人 |
|---|---|---|
| 排版 | 微信内联 HTML | 阿苏 |
| 封面 | 3:4 竖图 | 阿苏 |

```python
def hello(name: str) -> str:
    return f"hi {name}"
```

### 列表与引用

- 第一层
  - 第二层
  - 第二层第二项
- 回到第一层

> 引用里的 **重点** 也要保留。

:::tips[小提示]
容器里的文字不能丢。
:::

最后一句用于确认结尾没有被截断。""",
}

PROBES = {
    "short": ["周末去海边", "两天的沉默之后，我重新听见了海浪、风声，还有自己", "风把云推着走，我把脚步放慢"],
    "standard": ["把一件事做深", "很多人以为效率来自工具，其实效率来自取舍",
                 "关掉不必要的提醒", "把同类任务放在一起", "每天只保留三个重点",
                 "真正的专注，不是做更多，而是少做一点", "给重要的事留出整块时间",
                 "给突发的事留出缓冲", "给复盘留出固定位置", "最后，把结果写下来，下周再看一遍"],
    "complex": ["复杂输入压力测试", "这是一段普通正文", "表格与代码", "微信内联 HTML",
                "封面", "3:4 竖图", "def hello", "return", "第一层", "第二层第二项",
                "引用里的", "重点", "容器里的文字不能丢", "最后一句用于确认结尾没有被截断"],
}

LAYOUTS = ["", "rhythm", "cardflow", "outline", "magazine", "hero", "card", "timeline",
           "time", "guardian", "economist", "natgeo", "vogue", "forbes", "adidas"]


class _Text(HTMLParser):
    def __init__(self) -> None:
        super().__init__(convert_charrefs=True)
        self.buf: list[str] = []
        self.skip = 0

    def handle_starttag(self, tag, attrs):
        if tag in ("style", "script"):
            self.skip += 1

    def handle_endtag(self, tag):
        if tag in ("style", "script") and self.skip:
            self.skip -= 1

    def handle_data(self, data):
        if not self.skip:
            self.buf.append(data)


def visible_text(html: str) -> str:
    p = _Text()
    p.feed(html)
    return "".join(p.buf)


def norm(s: str) -> str:
    return re.sub(r"\s+", "", s.replace("\u00a0", " "))


def tag_balance(html: str) -> dict:
    stack: list[str] = []
    bad: list[str] = []
    counts: dict[str, int] = {}

    class P(HTMLParser):
        def handle_starttag(self, tag, attrs):
            counts[tag] = counts.get(tag, 0) + 1
            if tag not in VOID:
                stack.append(tag)

        def handle_startendtag(self, tag, attrs):
            counts[tag] = counts.get(tag, 0) + 1

        def handle_endtag(self, tag):
            if tag in VOID:
                return
            if stack and stack[-1] == tag:
                stack.pop()
            else:
                bad.append(f"unexpected </{tag}>")

    P().feed(html)
    return {"balanced": not stack and not bad,
            "unclosed": stack[:10], "errors": bad[:10],
            "h2": counts.get("h2", 0), "h1": counts.get("h1", 0)}


def render(theme_path: Path, md: str) -> str:
    return convert_markdown_to_wechat_html(md, str(theme_path))


def main() -> int:
    ap = argparse.ArgumentParser()
    ap.add_argument("--limit", type=int, default=0, help="只跑前 N 套（冒烟）")
    args = ap.parse_args()
    OUT.mkdir(parents=True, exist_ok=True)
    tmp = OUT / "tmp-themes"
    tmp.mkdir(exist_ok=True)

    theme_files = sorted(THEMES.glob("*.json"))
    if args.limit:
        theme_files = theme_files[: args.limit]

    results: list[dict] = []
    failures = 0
    warnings = 0
    for i, tp in enumerate(theme_files, 1):
        try:
            meta = json.loads(tp.read_text(encoding="utf-8"))
        except Exception as e:  # noqa: BLE001
            results.append({"theme": tp.stem, "fatal": f"json: {e}"})
            failures += 1
            continue
        row = {"theme": tp.stem, "kind": meta.get("kind", "theme"),
               "locked_layout": meta.get("locked_layout"), "fixtures": {}}
        for name, md in FIXTURES.items():
            item: dict = {"probes_missing": [], "errors": []}
            try:
                html = render(tp, md)
            except Exception as e:  # noqa: BLE001
                item["errors"].append(f"render: {type(e).__name__}: {e}")
                row["fixtures"][name] = item
                failures += 1
                continue
            text = norm(visible_text(html))
            for probe in PROBES[name]:
                if norm(probe) not in text:
                    item["probes_missing"].append(probe)
            bal = tag_balance(html)
            item["tag_balance"] = bal
            item["empty_style"] = len(re.findall(r'style=""', html))
            item["none_text"] = "None" in visible_text(html)
            item["script"] = "<script" in html.lower()
            item["handler"] = bool(re.search(r"\son\w+\s*=", html, re.I))
            item["js_url"] = "javascript:" in html.lower()
            item["bytes"] = len(html.encode("utf-8"))
            hard = bool(item["probes_missing"] or not bal["balanced"] or item["script"]
                        or item["handler"] or item["js_url"])
            item["hard_fail"] = hard
            if hard:
                failures += 1
            elif item["empty_style"] or item["none_text"]:
                warnings += 1
            row["fixtures"][name] = item
        results.append(row)
        if i % 20 == 0:
            print(f"  … {i}/{len(theme_files)}", flush=True)

    # 版式 × <h2> 语义
    base = json.loads((THEMES / "su-minimal-azure.json").read_text(encoding="utf-8"))
    layout_rows = []
    for lid in LAYOUTS:
        data = {**base, "layout": lid}
        p = tmp / f"layout-{lid or 'default'}.json"
        p.write_text(json.dumps(data, ensure_ascii=False), encoding="utf-8")
        html = render(p, FIXTURES["standard"])
        bal = tag_balance(html)
        layout_rows.append({"layout": lid or "default", "h2": bal["h2"],
                            "h1": bal["h1"], "balanced": bal["balanced"],
                            "probes_ok": all(norm(x) in norm(visible_text(html))
                                             for x in PROBES["standard"])})

    # kit：全部 19 套走 locked_layout
    kit_rows = []
    for tp in sorted(THEMES.glob("mg-*.json")):
        meta = json.loads(tp.read_text(encoding="utf-8"))
        html = render(tp, FIXTURES["standard"])
        kit_rows.append({
            "theme": tp.stem, "locked_layout": meta.get("locked_layout"),
            "h1": tag_balance(html)["h1"], "h2": tag_balance(html)["h2"],
            "bytes": len(html.encode("utf-8")),
            "probes_ok": all(norm(x) in norm(visible_text(html)) for x in PROBES["standard"]),
            "balanced": tag_balance(html)["balanced"],
        })

    summary = {
        "themes_checked": len(theme_files),
        "themes_total": len(list(THEMES.glob("*.json"))),
        "failure_rows": failures,
        "warning_rows": warnings,
        "empty_style_themes": sorted({r["theme"] for r in results
                                      if any(f.get("empty_style") for f in r.get("fixtures", {}).values())}),
        "failing_themes": sorted({r["theme"] for r in results
                                  if r.get("fatal") or any(
                                      f.get("hard_fail") for f in r.get("fixtures", {}).values())}),
        "layout_h2": layout_rows,
        "kit_19": kit_rows,
    }
    (OUT / "static.json").write_text(json.dumps({"summary": summary, "themes": results},
                                                ensure_ascii=False, indent=2), encoding="utf-8")

    print(f"主题 {summary['themes_checked']}/{summary['themes_total']}，问题行 {failures}")
    print("有问题的主题：", ", ".join(summary["failing_themes"][:20]) or "无")
    print("版式 <h2>：", {r["layout"]: r["h2"] for r in layout_rows})
    print("kit 19：", "全部有产物" if all(k["bytes"] > 200 for k in kit_rows) else "有异常")
    print(f"→ {OUT / 'static.json'}")
    return 0


if __name__ == "__main__":
    sys.exit(main())
