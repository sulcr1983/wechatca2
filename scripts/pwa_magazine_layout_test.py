#!/usr/bin/env python3
"""报刊版式入口专项测试（2026-11-03）

解决的问题：
  2026-11-03 把版式入口从 8 项扩到 15 项（新增 7 个报刊版式）。
  这些版式早就存在于 `core/magazine_layouts.py`，但**从来没有过独立入口**，
  所以从未被「自由组合配色」这个场景验证过。要守的四件事：

  A 入口与引擎一致：UI 表里的每个 id 都必须真被引擎认（否则点了没反应）
  B 配色跟随：换主题后产物不能残留品牌色（否则「用时代版式配我的蓝」会毁）
  C 保真：改造后不丢字（引擎有 `_guard`，但闸门本身也可能失效）
  D 结构合法：标签配平、无残留标记、无 None

⚠️ 判据来源不是偏好，是实测：
  · 函数体里有非中性写死色 → 换任何主题都留品牌色 → 不该给入口
  · 6 套（mori/ukiyoe/note/ikea/brutal/deepread）因此**刻意不进**入口表，
    它们只走 kit。本测试同时断言「它们不在入口表里」，
    防止以后有人「好心」把它们加进去。

用法：
    .venv/Scripts/python.exe scripts/pwa_magazine_layout_test.py
    .venv/Scripts/python.exe scripts/pwa_magazine_layout_test.py --verbose
"""
from __future__ import annotations

import json
import re
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
sys.path.insert(0, str(ROOT))

from core.format_engine import convert_markdown_to_wechat_html  # noqa: E402

APP_JS = ROOT / "pwa" / "src" / "app.js"
THEMES = ROOT / "public" / "themes"

# 入口表里应该出现的 7 个报刊版式（顺序与 UI 一致）
EXPECT_MAG = ["time", "guardian", "economist", "natgeo", "vogue", "forbes", "adidas"]

# 刻意不进入口表的 6 套（品牌色锁死）
EXPECT_LOCKED = ["mori", "ukiyoe", "note", "ikea", "brutal", "deepread"]

# 三套 accent 差异极大的主题，用来测「配色是否跟着走」
PROBE_THEMES = ["su-biz-azure", "su-stamp-crimson", "su-feast-gold"]

SAMPLE = """# 主标题

第一段正文，含数字 12.5% 与强调**重点**，还有一个[链接](https://example.com)。

## 第一节

第二段正文。引用如下。

> 引用句，观察引用块配色。

- 列表项一
- 列表项二

### 三级小标题

结尾段落，观察强调色与分隔线。
"""

HEX6 = re.compile(r"#[0-9A-Fa-f]{6}\b")
NEUTRAL_SPREAD = 14


def is_neutral(h: str) -> bool:
    s = h.lstrip("#").upper()
    if len(s) == 3:
        s = "".join(c * 2 for c in s)
    if len(s) != 6:
        return True
    r, g, b = int(s[0:2], 16), int(s[2:4], 16), int(s[4:6], 16)
    return max(r, g, b) - min(r, g, b) <= NEUTRAL_SPREAD


def ui_layout_ids() -> list[str]:
    """从 app.js 的 LAYOUT_OPTIONS 里取出 id（不执行 JS，只做静态解析）"""
    src = APP_JS.read_text(encoding="utf-8")
    m = re.search(r"const LAYOUT_OPTIONS = \[(.*?)\n\];", src, re.S)
    if not m:
        raise SystemExit("⛔ 找不到 LAYOUT_OPTIONS 定义（app.js 结构变了？）")
    return re.findall(r"\['([^']*)',\s*'([^']*)'\]", m.group(1)) and [
        x[0] for x in re.findall(r"\['([^']*)',\s*'([^']*)'\]", m.group(1))
    ]


def ui_labels() -> dict[str, str]:
    src = APP_JS.read_text(encoding="utf-8")
    m = re.search(r"const LAYOUT_OPTIONS = \[(.*?)\n\];", src, re.S)
    pairs = re.findall(r"\['([^']*)',\s*'([^']*)'\]", m.group(1))
    return {a: b for a, b in pairs}


def render(md: str, theme_id: str, layout: str) -> str:
    th = json.loads((THEMES / f"{theme_id}.json").read_text(encoding="utf-8"))
    th["layout"] = layout
    tmp = ROOT / "output" / "_mag_layout_probe.json"
    tmp.parent.mkdir(parents=True, exist_ok=True)
    tmp.write_text(json.dumps(th, ensure_ascii=False), encoding="utf-8")
    try:
        return convert_markdown_to_wechat_html(md, str(tmp))
    finally:
        tmp.unlink(missing_ok=True)


def plain(html: str) -> str:
    return re.sub(r"<[^>]+>", "", html or "").replace(" ", "").replace("\n", "")


def balanced(html: str) -> bool:
    for tag in ("section", "p", "blockquote", "span", "div", "h1", "h2", "h3",
                "strong", "em", "table", "ul", "ol", "li"):
        o = len(re.findall(rf"<{tag}\b", html))
        c = len(re.findall(rf"</{tag}>", html))
        if o != c:
            return False
    return True


def residue(html: str) -> list[str]:
    bad = []
    for pat, label in ((r":::", "::: 容器标记"), (r"~~", "~~ 删除线残留"),
                       (r"```", "``` 代码围栏残留"), (r"\bNone\b", "None")):
        if re.search(pat, html):
            bad.append(label)
    return bad


def main() -> int:
    verbose = "--verbose" in sys.argv
    fails: list[str] = []
    checks = 0

    ids = ui_layout_ids()
    labels = ui_labels()
    print("版式入口表：")
    print(f"  共 {len(ids)} 项 —— " + " / ".join(labels[i] for i in ids))
    print()

    # ── A 入口与引擎一致 ──
    print("[A] 入口 id 必须真被引擎认（点了要有反应）")
    for lay in EXPECT_MAG:
        checks += 1
        if lay not in ids:
            fails.append(f"A: 入口表缺 {lay}（应在报刊段）")
            print(f"  ✗ {lay} 不在入口表")
            continue
        base = render(SAMPLE, PROBE_THEMES[0], "")
        out = render(SAMPLE, PROBE_THEMES[0], lay)
        ok = out != base
        checks += 1
        if not ok:
            fails.append(f"A: {lay} 渲染后与默认版式完全相同（引擎没执行）")
        print(f"  {'✓' if ok else '✗'} {lay:10s}（{labels.get(lay,'')}）产物有变化")

    # 通用 8 项也要在
    for lay in ["", "rhythm", "cardflow", "outline", "magazine", "hero", "card", "timeline"]:
        checks += 1
        if lay not in ids:
            fails.append(f"A: 入口表丢了原有版式 {lay or '(默认)'}")

    # 锁死的 6 套**不许**进入口表
    print("\n[A2] 品牌锁死的 6 套必须不在入口表（它们只走 kit）")
    for lay in EXPECT_LOCKED:
        checks += 1
        if lay in ids:
            fails.append(f"A2: {lay} 进了入口表 —— 换主题会留品牌色，会毁版面")
            print(f"  ✗ {lay} 竟然在入口表里")
        elif verbose:
            print(f"  ✓ {lay} 不在入口表（正确）")

    # ── B 配色跟随 ──
    # 判据是**三套主题的交集**，不是「单套里出现过的非中性色」。
    # 理由：mix(accent, bg) 会派生出一堆中间色，它们本来就该随主题变；
    # 只有在**三套 accent 完全不同的主题下都出现同一个色**，才是写死的品牌色。
    #
    # ⚠️ 还要减去「默认版式」的基线：有些共有色是**全局**的（例如
    # `_auto_dark_mode()` 给 strong 的默认色 #e0a060），与版式无关。
    # 不减基线会把全局行为误判成「版式写死」。
    print("\n[B] 换主题后不得残留品牌色（判据：三套主题共有色 − 默认版式基线）")

    def common_colors(lay: str) -> set[str]:
        per_theme: list[set[str]] = []
        for tid in PROBE_THEMES:
            out = render(SAMPLE, tid, lay)
            per_theme.append({h.upper() for h in HEX6.findall(out) if not is_neutral(h)})
        return set.intersection(*per_theme)

    baseline = common_colors("")
    if baseline:
        print(f"  基线（默认版式也有的全局色）：{sorted(baseline)}")

    for lay in EXPECT_MAG:
        common = common_colors(lay) - baseline
        checks += 1
        if common:
            fails.append(f"B: {lay} 三套主题下共有色 {sorted(common)}（写死）")
            print(f"  ✗ {lay:10s} 共有 {sorted(common)}")
        else:
            print(f"  ✓ {lay:10s} 无版式特有的写死色（跟随主题）")

    # ── C 保真 ──
    print("\n[C] 不丢字（纯文字长度 ≥ 原输入 95%）")
    base_plain = len(plain(render(SAMPLE, PROBE_THEMES[0], "")))
    for lay in EXPECT_MAG:
        out = render(SAMPLE, PROBE_THEMES[0], lay)
        ratio = len(plain(out)) / max(base_plain, 1)
        checks += 1
        ok = ratio >= 0.95
        if not ok:
            fails.append(f"C: {lay} 丢字（保真 {ratio:.1%}）")
        print(f"  {'✓' if ok else '✗'} {lay:10s} 保真 {ratio:.1%}")

    # ── D 结构合法 ──
    print("\n[D] 标签配平 / 无残留标记")
    for lay in EXPECT_MAG:
        out = render(SAMPLE, PROBE_THEMES[0], lay)
        bal = balanced(out)
        res = residue(out)
        checks += 2
        if not bal:
            fails.append(f"D: {lay} 标签不配平")
        if res:
            fails.append(f"D: {lay} 有残留 {res}")
        print(f"  {'✓' if bal and not res else '✗'} {lay:10s} "
              f"{'配平' if bal else '不配平'}"
              f"{'' if not res else ' / 残留 ' + str(res)}")

    # ── E 无小标题也能生效（不靠结构切段）──
    print("\n[E] 没有小标题时也必须有效果（不能「点了没反应」）")
    NO_HEAD = "第一段正文，没有小标题。\n\n第二段正文。\n\n> 一句引用。\n"
    base_nh = render(NO_HEAD, PROBE_THEMES[0], "")
    for lay in EXPECT_MAG:
        out = render(NO_HEAD, PROBE_THEMES[0], lay)
        checks += 1
        ok = out != base_nh
        if not ok:
            fails.append(f"E: {lay} 无小标题时无效果")
        print(f"  {'✓' if ok else '✗'} {lay:10s} {'有变化' if ok else '无变化'}")

    print("\n" + "=" * 56)
    if fails:
        print(f"⛔ {len(fails)} 项失败（共 {checks} 项断言）：")
        for f in fails:
            print(f"   · {f}")
        return 1
    print(f"✅ 全部通过（{checks} 项断言）")
    return 0


if __name__ == "__main__":
    sys.exit(main())
