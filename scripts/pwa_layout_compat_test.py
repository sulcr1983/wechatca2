#!/usr/bin/env python3
"""A+B+C 版式/段落样式 · 双态夹具兼容性测试（2026-10-24）

目的：回答「我们这个改动对大部分真实文章都兼容吗」。
做法：一组覆盖典型结构的夹具 × 全部版式 × 无AI/有AI 两态，逐格断言。

夹具覆盖（真实公众号里最常见的几种）：
  short     短文（一段话，无小标题）
  standard  标准长文（标题 + 多小标题 + 多段）
  quotes    多引语（带中文引号）
  numbers   多数据（「4 小时」「80%」「12 万」等）
  lists     列表密集（有序/无序/嵌套）
  code      代码块（技术号）
  table     表格（对比型文章）
  images    图片（含图注）
  container ::: 容器（stat/steps/cards/summary/cta）
  mixed     混合（全都有）

两态：
  no-ai   纯本地预处理 + 渲染（preprocess + format_engine）
  ai      AI 结构识别（/api/ai-format）→ 再渲染；AI 不可用时走本地兜底（本机实测就是这个路径）

断言（每格）：
  1. 不丢字        纯文字长度 ≥ 输入纯文字 95%（允许标点/空白差异）
  2. 不破结构      标签闭合平衡（section/div/p 开闭配平）
  3. 无残留标记    输出里不出现 ::: / ~~ / 未解析的 ``` 
  4. 无空输出      HTML 长度 > 0 且含正文首句
  5. 版式特征      该版式的标志性特征出现（目录/双栏/卡片/强调条）

用法：
    .venv/Scripts/python.exe scripts/pwa_layout_compat_test.py            # 全量
    .venv/Scripts/python.exe scripts/pwa_layout_compat_test.py --quick    # 只 standard 夹具
"""

from __future__ import annotations

import argparse
import json
import re
import sys
import urllib.error
import urllib.request
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
sys.path.insert(0, str(ROOT))

from core.preprocessor import preprocess                    # noqa: E402
from core.format_engine import (                            # noqa: E402
    md_to_html, inject_inline_styles, _plain_len,
    process_fenced_containers, process_callouts, _split_top_blocks,
)

THEMES = ROOT / "public" / "themes"
LAYOUTS = ["", "rhythm", "cardflow", "outline", "magazine"]

# ── 夹具 ────────────────────────────────────────────────────────────────
FIXTURES = {
    "short": """今天下午去了海边，风很大，但很舒服。回程路上一直在想，人为什么要那么赶。""",

    "standard": """# 周末去海边

两天的沉默之后，我重新听见了海浪、风声，还有自己。城市里的声音太密，密到让人忘了什么叫安静。

## 出发前的那点犹豫

行李收了一半又放下，总觉得有事情没做完。后来想明白了：事情永远做不完，但海不会等人。

## 到了之后

下午四点，光从侧面打过来，沙滩是温的。我脱了鞋走了很久，脚底的沙子一层层塌下去。

## 回程路上

车窗外的海一点点变小，最后只剩一条线。我睡着了，醒来时已经到家。""",

    "quotes": """# 那些让我改变的话

他说：“真正让人疲惫的不是工作，是那些没被允许停下来的时刻。”

后来我又遇到一个人，她讲：“你以为的稳定，可能只是没有勇气改变。”

“别急，慢慢来。”这句话我记了很多年。""",

    "numbers": """# 一年读了 52 本书

去年我一共读了 52 本书，平均每周一本。

其中 12 本读了两遍以上，8 本中途放弃。

每天固定读 40 分钟，一年下来是 240 小时。

阅读速度大约每小时 30 页，一年累计约 15000 页。""",

    "lists": """# 我的晨间流程

每天起床后按这个顺序来：

1. 喝一杯温水
2. 拉伸十分钟
3. 写三行日记
4. 看一眼今天要做的事

需要准备的东西：

- 水杯
- 瑜伽垫
- 笔记本
  - 一支笔
  - 一张便签""",

    "code": """# 用 Python 处理 CSV

先装依赖：

```python
import csv
with open('data.csv') as f:
    rows = list(csv.DictReader(f))
print(len(rows))
```

然后按字段分组统计即可。""",

    "table": """# 三种方案对比

| 方案 | 成本 | 速度 | 适合场景 |
|---|---|---|---|
| 方案 A | 低 | 慢 | 小项目 |
| 方案 B | 中 | 快 | 中等规模 |
| 方案 C | 高 | 很快 | 大规模 |

结论：先上方案 B，跑起来再优化。""",

    "images": """# 周末随手拍

![海边的下午](./x.jpg)

光从侧面打过来，沙滩是温的。

![远处的风筝](./y.jpg)

有人在远处放风筝，线绷得很紧。""",

    "container": """# 本周复盘

:::stat
4 小时
这周专注时间总计
:::

:::steps
- 早上先做最重要的一件事
- 下午集中处理沟通
- 晚上留一小时读书
:::

:::summary[本周要点]
专注时间比上周多了 40%
读完两本书
:::

:::cta[下周计划]
把早起时间再提前半小时
:::""",

    "mixed": """# 一篇什么都有

开场先来一段，说点背景。这段不短，用来测试段落处理。

## 数据部分

4 小时 专注时间。

80% 的时间在做一件事。

## 引语部分

他说：“慢一点，反而更快。”

## 列表部分

- 第一点
- 第二点
- 第三点

## 代码部分

```bash
git status
git add .
```

## 表格部分

| 项目 | 数量 |
|---|---|
| 书 | 12 |
| 文章 | 30 |

## 收尾

最后一段，正常收尾，不再有特殊结构。""",
}

# ── 断言 ────────────────────────────────────────────────────────────────

LAYOUT_SIGNATURE = {
    "": None,
    "rhythm": ("强调条", lambda h: "width:4px" in h),
    "cardflow": ("分段卡", lambda h: "border-radius:12px" in h),
    "outline": ("目录", lambda h: "本文目录" in h),
    "magazine": ("双栏", lambda h: "<table" in h),
}


def balanced(html: str) -> tuple[bool, str]:
    """检查 section/p/div 开闭是否配平（微信里标签不配平会整段错位）"""
    for tag in ("section", "p", "div", "table", "tr", "td"):
        opens = len(re.findall(rf"<{tag}\b", html))
        closes = len(re.findall(rf"</{tag}>", html))
        if opens != closes:
            return False, f"{tag} {opens}/{closes}"
    return True, ""


def residue(html: str) -> str:
    """输出里不该残留的标记"""
    bad = []
    if ":::" in re.sub(r"<[^>]+>", "", html):
        bad.append(":::")
    if "~~" in html:
        bad.append("~~")
    if "```" in html:
        bad.append("```")
    return ",".join(bad)


def plain_len_text(html: str) -> int:
    """纯可见文字长度。

    ⚠️ 不能用 format_engine 的 _plain_len：它按 `<[^>]+>` 剥标签，
    遇到 data-container="stat" 这类属性里的引号会误判，导致统计偏小。
    这里用更稳的方式：先移除 script/style，再剥标签，最后去空白。
    """
    s = re.sub(r"<(script|style)[^>]*>.*?</\1>", "", html, flags=re.DOTALL | re.I)
    s = re.sub(r"<[^>]*>", "", s)
    s = re.sub(r"&nbsp;|&#160;", " ", s)
    return len(re.sub(r"\s+", "", s))


def has_headings(md: str) -> bool:
    """该文是否有足够的小标题支撑「目录/分栏」这类结构版式。

    注意：只有 1 个 h2 的清单/代码类文章，目录与双栏都无从展开，
    属于合理降级；这里用「至少 2 个 h2」作为可展开的判据。
    """
    h = md_to_html(md)
    return len(re.findall(r"<h2[^>]*>", h)) >= 2


def paragraphs_per_section_max(md: str) -> int:
    """各小节里「连续纯段落」的最大数量（判断 magazine 双栏能否展开）。

    magazine 的分栏逻辑是「同一节内**连续**的段落分成左右两列」，
    块级元素（引用块 / stat 卡 / 列表 / 图片）会打断连续区。
    ⚠️ 判据必须按引擎的真实切分口径算：用 _split_top_blocks 切顶层块，
       逐块累加纯段落数，遇到块级元素就断 —— 不能简单数 <p> 总数，
       否则「1 段 + 块 + 1 段」会被误算成 2 段（2026-10-25 实测踩到）。
    """
    h = md_to_html(process_callouts(process_fenced_containers(preprocess(md))))
    best = 0
    for sec in re.split(r"(?=<h2)", h)[1:]:
        m = re.match(r"(<h[12][^>]*>.*?</h[12]>)(.*)$", sec, re.DOTALL)
        body = m.group(2) if m else sec
        run = 0
        for piece, is_block in _split_top_blocks(body):
            if not piece.strip():
                continue
            if is_block:
                best = max(best, run)
                run = 0
                continue
            run += len(re.findall(r"<p[^>]*>", piece))
        best = max(best, run)
    return best


def render(md: str, theme: dict) -> str:
    """走与生产一致的完整链路（容器/提示框解析必须在 md_to_html 之前）"""
    text = process_fenced_containers(md)
    text = process_callouts(text)
    return inject_inline_styles(md_to_html(text), theme)


def ai_available() -> tuple[bool, str]:
    """探测 AI 排版接口是否可用（本机 app.py 在 5000 时）"""
    try:
        req = urllib.request.Request(
            "http://127.0.0.1:5000/api/ai-format",
            data=json.dumps({"text": "测试"}).encode(),
            headers={"Content-Type": "application/json"},
        )
        with urllib.request.urlopen(req, timeout=15) as r:
            j = json.loads(r.read())
            engine = j.get("engine", "?")
            # engine=local 说明未配置 Key，走的是本地兜底
            return engine != "local" and bool(j.get("markdown")), engine
    except Exception as e:
        return False, f"不可用：{type(e).__name__}"


# AI 真实会产出的结构化 Markdown 形态（DeepSeek 实测样本结构）：
# 拆段 + 加小标题 + 列表 + 表格 + 提示框 + 金句，正文一字不改。
# 用它来验证「AI 结构化之后的文本」在全部版式下是否兼容。
AI_STYLE_MD = {
    "short": """今天下午去了海边，风很大，但很舒服。

回程路上一直在想，人为什么要那么赶。""",

    "standard": """# 周末去海边

两天的沉默之后，我重新听见了海浪、风声，还有自己。

## 城市太密了

城市里的声音太密，密到让人忘了什么叫安静。

## 出发前的那点犹豫

行李收了一半又放下，总觉得有事情没做完。

> 事情永远做不完，但海不会等人。

## 到了之后

下午四点，光从侧面打过来，沙滩是温的。

:::stat
4 小时
在沙滩上没看一次手机
:::

## 回程路上

车窗外的海一点点变小，最后只剩一条线。""",

    "numbers": """# 一年读了 52 本书

去年我一共读了 **52 本**书，平均每周一本。

:::stat
52 本
全年阅读量
:::

## 精读与放弃

- 12 本读了两遍以上
- 8 本中途放弃

## 时间投入

每天固定读 40 分钟，一年下来是 240 小时。

| 项目 | 数量 |
|---|---|
| 书 | 52 |
| 小时 | 240 |""",
}


def ai_structure(text: str) -> str | None:
    """走 AI 排版接口拿结构化 Markdown；不可用返回 None"""
    try:
        req = urllib.request.Request(
            "http://127.0.0.1:5000/api/ai-format",
            data=json.dumps({"text": text}).encode(),
            headers={"Content-Type": "application/json"},
        )
        with urllib.request.urlopen(req, timeout=90) as r:
            j = json.loads(r.read())
            return j.get("markdown") or None
    except Exception:
        return None


def main() -> int:
    try:
        sys.stdout.reconfigure(encoding="utf-8", errors="replace")
    except Exception:
        pass

    ap = argparse.ArgumentParser()
    ap.add_argument("--quick", action="store_true")
    ap.add_argument("--theme", default="su-biz-iron")
    args = ap.parse_args()

    theme_path = THEMES / f"{args.theme}.json"
    if not theme_path.exists():
        print(f"ERROR: 主题不存在 {theme_path}", file=sys.stderr)
        return 2
    base_theme = json.loads(theme_path.read_text(encoding="utf-8"))

    fixtures = {"standard": FIXTURES["standard"]} if args.quick else FIXTURES
    ai_ok, ai_note = ai_available()
    print(f"AI 排版接口：{'可用' if ai_ok else '不可用'}（{ai_note}）")

    results = []
    print()
    print(f"{'夹具':<11}{'状态':<7}{'版式':<11}{'字数':>6}{'保真':>7}{'结构':>5}{'残留':>5}{'特征':>5}")
    print("-" * 62)

    for name, raw in fixtures.items():
        for state in ("no-ai", "ai"):
            if state == "ai":
                # AI 态来源（2026-10-24 补注）：
                #   PWA 是纯静态站，AI 走**浏览器端 BYOK**（localStorage `supersu.ai`），
                #   不读服务器 .env / data/ai_config.json（那是已弃用本地 Flask 版的）。
                #   因此本脚本无法直接调"服务端 AI 接口"；真实链路（含 AI 排版按钮、
                #   测试连接门控、上游 500 兜底）由 pwa_headed_full_e2e.py 的 E 阶段覆盖。
                #   这里用 AI 结构化样本代表 AI 产物形态，验证「AI 产物 × 全部版式」的兼容性。
                md = ai_structure(raw)
                if md is None:
                    md = AI_STYLE_MD.get(name) or preprocess(raw)
                    tag = "AI样本"
                else:
                    tag = "AI真实"
            else:
                md = preprocess(raw)
                tag = "本地"

            for lay in LAYOUTS:
                th = json.loads(json.dumps(base_theme))
                if lay:
                    th["layout"] = lay
                else:
                    th.pop("layout", None)
                # 段落样式全开，压测最坏情况
                th["blocks"] = {"quote": True, "data": True, "tip": True}

                html = render(md, th)
                # 基准必须取「本次实际输入 md」经完整预处理后的纯文字：
                # no-ai 与 ai 两态的输入文本不同，用原始夹具当基准会误判丢字
                md_processed = process_callouts(process_fenced_containers(preprocess(md)))
                plain_in = plain_len_text(md_to_html(md_processed))
                plain_out = plain_len_text(html)
                fidelity = plain_out / max(plain_in, 1)

                ok_bal, bal_msg = balanced(html)
                res = residue(html)
                sig = LAYOUT_SIGNATURE[lay]
                feat_ok = True if not sig else sig[1](html)
                # 结构版式（目录/分栏/卡片/强调条）需要小标题或分段才有意义。
                # 无小标题的短文自动降级为普通排版 —— 这是设计内的合理降级，不算失败。
                #
                # ⚠️ 2026-10-25 补：magazine 还需要「每节 ≥2 段」才能分出左右列。
                #    standard 夹具每节只有 1 段 → 引擎按设计整宽输出（不造假双栏），
                #    原逻辑只判断「有没有小标题」→ 误判为失败。这里把该情形也纳入合理降级。
                degraded = (not feat_ok) and (not has_headings(md)) and lay != ""
                if (not feat_ok) and lay == "magazine" and has_headings(md):
                    # 有小标题但「最长连续段落」不足 2 段 → 双栏无从展开（块级元素
                    # 会把段落打断，如引用块 / stat 卡 / 列表 / 图片），属设计内降级。
                    if paragraphs_per_section_max(md) < 2:
                        degraded = True
                    else:
                        # 段落够却仍没分栏 = 真问题，不能降级放行
                        pass

                good = fidelity >= 0.95 and ok_bal and not res and plain_out > 0 and (feat_ok or degraded)
                results.append((name, tag, lay or "默认", good, fidelity, ok_bal, res,
                                "降级" if degraded else ("OK" if feat_ok else "✗")))
                feat_label = "降级" if degraded else ("OK" if feat_ok else "✗")
                print(f"{name:<11}{tag:<7}{(lay or '默认'):<11}{plain_out:>6}"
                      f"{fidelity:>6.0%}{'OK' if ok_bal else '✗':>5}"
                      f"{('✗' + res) if res else 'OK':>5}"
                      f"{feat_label:>5}"
                      f"  {'✅' if good else '❌' + ('' if good else f' [{bal_msg}]')}")

    total = len(results)
    passed = sum(1 for r in results if r[3])
    print("-" * 62)
    print(f"兼容性矩阵：{passed}/{total} 通过（{passed / total:.1%}）")

    if passed < total:
        print("\n失败明细：")
        for name, tag, lay, good, fid, bal, res, feat in results:
            if not good:
                why = []
                if fid < 0.95:
                    why.append(f"丢字{fid:.0%}")
                if not bal:
                    why.append("结构失衡")
                if res:
                    why.append(f"残留{res}")
                if not feat:
                    why.append("版式特征缺失")
                print(f"  {name} / {tag} / {lay}: {'，'.join(why)}")

    out_dir = ROOT / "output" / "layout-compat"
    out_dir.mkdir(parents=True, exist_ok=True)
    (out_dir / "matrix.json").write_text(json.dumps(
        [{"fixture": r[0], "state": r[1], "layout": r[2], "pass": r[3],
          "fidelity": round(r[4], 3), "balanced": r[5], "residue": r[6],
          "signature": r[7]} for r in results],
        ensure_ascii=False, indent=2), encoding="utf-8")
    print(f"矩阵数据：{out_dir / 'matrix.json'}")
    return 0 if passed == total else 1


if __name__ == "__main__":
    sys.exit(main())
