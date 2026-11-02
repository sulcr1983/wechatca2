#!/usr/bin/env python3
"""反向验证：证明 kit_alignment_fixture 的断言能红，不是摆设。

一个 228/228 全绿的夹具，可能是「实现真好」，也可能是「断言恒真」。
唯一能区分两者的办法：故意注入故障，看对应断言是否变红。
红不了的断言 = 测试本身是摆设（这正是用户担心的「放上去就是摆设」）。

注入清单（每条都对应一条断言）
  M1  删掉 mg-ukiyoe 产物的 text-align:justify          → A1a / A6 必须红
  M2  给 mg-guardian 产物强加 justify                    → A1b / A6 必须红
  M3  删掉一个 </section>（标签不配平）                  → A3 必须红
  M4  在正文插入 ::: 残留                                → A4 必须红
  M5  吞掉两个 <p>（丢字）                               → A2 必须红
  M6  删掉 blockquote                                    → A5 必须红
  M7  往 <p> 里手写 text-justify                         → A7 必须红
  M8  让 inject_justify 变成 identity（模拟 _guard 静默吞改造）
      静态 → A10 必须红
      浏览器 → A1c 必须红（注入没效果，右缘自然不齐）

用法
    .venv/Scripts/python.exe scripts/kit_alignment_canred.py
    .venv/Scripts/python.exe scripts/kit_alignment_canred.py --browser
退出码 0 = 全部故障都被捕获；1 = 有故障没被捕获（夹具漏检）
"""
from __future__ import annotations

import argparse
import re
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
sys.path.insert(0, str(ROOT))

from core.format_engine import convert_markdown_to_wechat_html  # noqa: E402
from core.preprocessor import preprocess  # noqa: E402

import scripts.kit_alignment_fixture as fx  # noqa: E402

THEMES = ROOT / "public" / "themes"

# 断言名 → 在 results 里的前缀
A1A = "A1a"
A1B = "A1b"
A1C = "A1c"
A2 = "A2"
A3 = "A3"
A4 = "A4"
A5 = "A5"
A6 = "A6"
A7 = "A7"
A10 = "A10"


def render(stem: str) -> str:
    return convert_markdown_to_wechat_html(
        preprocess(fx.FIXTURE), str(THEMES / f"{stem}.json")
    )


def static_of(stem: str, html: str) -> dict[str, bool]:
    """跑静态断言，返回 {断言id前缀: ok}。"""
    out: dict[str, bool] = {}
    for name, ok, _d in fx.static_checks(stem, html, fx.plain_len(render("mg-time"))):
        out[name.split("-")[0]] = ok
    return out


# ── 故障注入 ─────────────────────────────────────────────────────────
def m1(h: str) -> str:
    """删掉 justify（模拟浮世绘版式被改回左对齐）。"""
    return re.sub(r"text-align:\s*justify;?", "", h)


def m2(h: str) -> str:
    """给 left 套强加 justify（模拟误把 18 套也改成两端对齐）。"""
    return re.sub(r"(<p[^>]*style=\")([^\"]*)(\")",
                  r"\1\2;text-align:justify\3", h, count=1)


def m3(h: str) -> str:
    """破坏标签配平。"""
    return h.replace("</section>", "", 1)


def m4(h: str) -> str:
    """插入未解析的残留标记。"""
    return h.replace("</p>", ":::</p>", 1)


def m5(h: str) -> str:
    """吞掉两个段落（丢字）。"""
    return re.sub(r"<p[^>]*>.*?</p>", "", h, count=2, flags=re.S)


def m6(h: str) -> str:
    """删掉引用块。"""
    return re.sub(r"<blockquote.*?</blockquote>", "", h, flags=re.S)


def m7(h: str) -> str:
    """往 <p> 里手写入禁写属性。"""
    return re.sub(r"(<p[^>]*style=\")([^\"]*)(\")",
                  r"\1\2;text-justify:inter-ideograph\3", h, count=1)


CASES: list[tuple[str, str, callable, set[str]]] = [
    ("M0-基线（不注入）", "mg-ukiyoe", lambda h: h, set()),
    ("M1-删掉justify", "mg-ukiyoe", m1, {A1A, A6}),
    ("M2-强加justify", "mg-guardian", m2, {A1B, A6}),
    ("M3-破配平", "mg-ukiyoe", m3, {A3}),
    ("M4-插残留", "mg-ukiyoe", m4, {A4}),
    ("M5-吞字", "mg-ukiyoe", m5, {A2}),
    ("M6-删引用", "mg-ukiyoe", m6, {A5}),
    ("M7-禁写属性", "mg-ukiyoe", m7, {A7}),
]


def run_static() -> tuple[int, int, list[str]]:
    print("=" * 78)
    print("静态层反向验证")
    print("=" * 78)
    print(f"{'场景':<22}{'判定':<6}失败断言")
    print("-" * 78)

    ok_cnt = 0
    fails: list[str] = []
    for label, stem, mutate, expect_red in CASES:
        html = mutate(render(stem)) if label != "M0-基线（不注入）" else render(stem)
        res = static_of(stem, html)
        red = {k for k, v in res.items() if not v}

        if label.startswith("M0"):
            good = not red  # 基线必须全绿
            detail = "（基线应全绿）" if good else f"基线不该红: {sorted(red)}"
        else:
            # 必须红：期望集合里每一条都得真红
            missed = expect_red - red
            good = not missed
            detail = "✓ 已捕获 " + ",".join(sorted(red & expect_red)) if good \
                else f"❌ 漏检: {sorted(missed)}（实际红: {sorted(red)}）"

        ok_cnt += good
        if not good:
            fails.append(label)
        print(f"{label:<22}{'✅' if good else '❌':<6}{detail}")

    print("-" * 78)
    print(f"静态层 {ok_cnt}/{len(CASES)} 符合预期")
    return ok_cnt, len(CASES), fails


def m8_a10() -> tuple[bool, str]:
    """M8：让注入变成 identity，A10 必须红。

    A10 守的是 _guard 静默吞改造——一旦改造没发生，产物和「未注入」一样。
    """
    orig = fx.inject_justify
    try:
        fx.inject_justify = lambda h: h  # noqa: E731
        html = render("mg-ukiyoe")
        res = static_of("mg-ukiyoe", html)
        ok = res.get(A10, True)
        return (not ok), ("✅ A10 已变红" if not ok else "❌ A10 仍绿，守门失效")
    finally:
        fx.inject_justify = orig


def run_browser() -> tuple[int, int, list[str]]:
    from playwright.sync_api import sync_playwright
    from core.browser_utils import launch_browser

    print()
    print("=" * 78)
    print("浏览器层反向验证（A1c 能力断言）")
    print("=" * 78)

    ok_cnt = 0
    fails: list[str] = []
    total = 2

    pw = sync_playwright().start()
    br = launch_browser(pw, args=["--no-proxy-server"])
    page = br.new_page(viewport={"width": 375, "height": 900})
    page.set_default_timeout(20000)
    try:
        # ⚠️ 必须用**左对齐套**做反向验证。
        # mg-ukiyoe 原生就是 justify，不注入也齐 —— 用它对 A1c 做反向验证会
        # 「注入失效仍绿」，那是选错对象，不是夹具缺陷（2026-11-03 实测踩到）。
        # mg-guardian 是 left，不注入必然不齐，才能证明 A1c 有分辨力。
        PROBE_KIT = "mg-guardian"

        # B0 基线：正常注入 → A1c 必须绿（左对齐套注入后能齐，这才是「能做到」）
        html = render(PROBE_KIT)
        res = {n.split("-")[0]: ok for n, ok, _d in fx.browser_checks(PROBE_KIT, html, page)}
        good = res.get(A1C, False)
        print(f"{'B0-基线注入生效':<22}{'✅' if good else '❌':<6}"
              f"{PROBE_KIT}（原生 left）注入后 A1c 绿" if good
              else f"{PROBE_KIT} 注入后 A1c 红，基线有问题")
        ok_cnt += good
        if not good:
            fails.append("B0-基线")

        # B1 反向：注入变 identity → 左对齐套必然不齐 → A1c 必须红
        orig = fx.inject_justify
        try:
            fx.inject_justify = lambda h: h  # noqa: E731
            res2 = {n.split("-")[0]: ok
                    for n, ok, _d in fx.browser_checks(PROBE_KIT, html, page)}
        finally:
            fx.inject_justify = orig
        good2 = not res2.get(A1C, True)  # 必须红
        print(f"{'B1-注入失效':<22}{'✅' if good2 else '❌':<6}"
              f"A1c 已变红（能力断言有分辨力）" if good2
              else "❌ A1c 仍绿，测的是恒真属性")
        ok_cnt += good2
        if not good2:
            fails.append("B1-注入失效")
    finally:
        br.close()
        pw.stop()

    print("-" * 78)
    print(f"浏览器层 {ok_cnt}/{total} 符合预期")
    return ok_cnt, total, fails


def main() -> int:
    if hasattr(sys.stdout, "reconfigure"):
        sys.stdout.reconfigure(encoding="utf-8", errors="replace")

    ap = argparse.ArgumentParser()
    ap.add_argument("--browser", action="store_true", help="加浏览器层反向验证")
    args = ap.parse_args()

    s_ok, s_total, s_fails = run_static()

    # M8 静态部分（A10）
    a10_ok, a10_detail = m8_a10()
    print(f"{'M8-注入失效(A10)':<22}{'✅' if a10_ok else '❌':<6}{a10_detail}")
    s_total += 1
    s_ok += a10_ok
    if not a10_ok:
        s_fails.append("M8-A10")

    b_ok = b_total = 0
    b_fails: list[str] = []
    if args.browser:
        b_ok, b_total, b_fails = run_browser()

    print()
    print("=" * 78)
    total_ok, total = s_ok + b_ok, s_total + b_total
    all_fails = s_fails + b_fails
    if all_fails:
        print(f"❌ {total_ok}/{total} —— 夹具漏检：{all_fails}")
        print("   漏检意味着对应断言恒真，是摆设，必须修断言本身。")
        return 1
    print(f"✅ 全部故障都被捕获：{total_ok}/{total}")
    print("   夹具不是摆设 —— 每条断言都证明了自己能红。")
    if not args.browser:
        print("   ℹ️  A1c 的浏览器反向验证需加 --browser")
    return 0


if __name__ == "__main__":
    sys.exit(main())
