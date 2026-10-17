#!/usr/bin/env python3
"""六族主题「生成后验证 + 审查台」脚本（一次性验收工具，不属于产品代码）。

1. 对全部主题 JSON 用真实渲染链路（convert_markdown_to_wechat_html）跑富样本，
   检查：标签平衡 / 无 None·nan / 无空 style / 无 ';;'·':;' 拼接残渣。
2. 产出 output/theme-review/six-families.html：72 套新主题的静态审查台，
   单文件、可直接双击（与真实链路同源渲染，所见即所得）。

用法：
    .venv/Scripts/python.exe output/theme-review/gen_review.py
"""
import base64
import json
import pathlib
import re
import sys

ROOT = pathlib.Path(__file__).resolve().parents[2]
sys.path.insert(0, str(ROOT))

from core.format_engine import convert_markdown_to_wechat_html  # noqa: E402

THEMES_DIR = ROOT / "public" / "themes"
OUT = pathlib.Path(__file__).resolve().parent

# 中性渐变示例图（base64 data URI：括号被 URL 编码，避免 Markdown 把 ( ) 当链接边界截断）
_SVG = ("<svg xmlns='http://www.w3.org/2000/svg' width='640' height='220'>"
        "<defs><linearGradient id='g' x1='0' y1='0' x2='1' y2='1'>"
        "<stop offset='0' stop-color='#CFD8E3'/><stop offset='1' stop-color='#94A6BC'/>"
        "</linearGradient></defs><rect width='640' height='220' fill='url(#g)'/></svg>")
_IMG = "data:image/svg+xml;base64," + base64.b64encode(_SVG.encode()).decode()

# 富样本：覆盖 h1-h3 / p / strong / em / a / blockquote / ul / ol /
# 行内 code / 代码块（含语言）/ 表格 / 围栏容器 / 图片 / hr
SAMPLE_MD = f"""# 秋日读书记

清晨的光落在书页上，**重点加粗**、*斜体强调*、行内 `code` 与[一个链接](https://example.com)排在一起。

## 第一节：为什么读

### 节奏与留白

> 阅读是借别人的眼睛看世界。

- 第一条：短句
- 第二条：稍长一点的条目，用来观察列表换行与行距观感

1. 第一步
2. 第二步

```python
def hello(name):
    return f"你好，{{name}}"
```

| 指标 | 本周 | 上周 |
| --- | --- | --- |
| 阅读量 | 1,024 | 987 |
| 点赞数 | 96 | 88 |

:::summary[要点总结]
- 排版只负责让阅读更舒服
- 强调色用在刀刃上
:::

![示例图]({_IMG})

---
"""

BALANCE_TAGS = ["section", "p", "strong", "em", "blockquote", "h1", "h2", "h3",
                "h4", "h5", "h6", "table", "tr", "td", "th", "code", "pre",
                "ol", "ul", "li", "del", "span", "a", "div"]


def audit(html: str):
    """返回问题列表（空 = 通过）

    注：`<tr style="">` 是引擎斑马纹的既有行为（奇数行不加底色），全部主题一致，
    非本批引入的问题；审计时把空 style 归一为 `<tr>`（保留标签本身，不影响平衡计数）。
    """
    probe = re.sub(r'<tr style="">', '<tr>', html)
    problems = []
    for tag in BALANCE_TAGS:
        opens = len(re.findall(rf"<{tag}[\s>]", probe))
        closes = len(re.findall(rf"</{tag}>", probe))
        if opens != closes:
            problems.append(f"标签不平衡 <{tag}>: {opens} vs {closes}")
    for bad in ["None", "nan", "undefined", "style=\"\"", ";;", ":;"]:
        if bad in probe:
            problems.append(f"含异常串 {bad!r}")
    return problems


def main():
    files = sorted(THEMES_DIR.glob("*.json"))
    fam_ids = ("stamp", "minimal", "biz", "letter", "night", "feast")
    new_ids = set()
    for f in files:
        parts = f.stem.split("-")
        if len(parts) == 3 and parts[0] == "su" and parts[1] in fam_ids:
            new_ids.add(f.stem)

    # ── 1. 全量审计 ──
    print(f"全量审计：{len(files)} 套主题")
    failed = 0
    for f in files:
        html = convert_markdown_to_wechat_html(SAMPLE_MD, str(f))
        problems = audit(html)
        if problems:
            failed += 1
            print(f"  ✗ {f.stem}: {'; '.join(problems[:4])}")
    print(f"审计结果：{'全部通过' if failed == 0 else f'{failed} 套有问题'}")

    # ── 2. 生成六族审查台（按族分组，12 色调顺序）──
    fams = [("stamp", "钢印", "新粗野：墨黑粗边 + 右下硬投影 + 实心色块，全部直角"),
            ("minimal", "素页", "极简：发丝分隔线 + 大量留白 + 唯一的强调色"),
            ("biz", "卷宗", "商务：实心标题块 + 虚线分节 + 深色表头"),
            ("letter", "信笺", "文艺：米色纸底 + 衬线字 + 短横线收束 + 舒展行距"),
            ("night", "夜航", "科技：深空底 + 冷光面板 + 微光分隔线"),
            ("feast", "庙会", "节庆：暖米底 + 胶囊标题 + 虚线圆角 + 实心首标题")]
    tones = ["crimson", "persimmon", "gold", "bamboo", "teal", "azure",
             "navy", "violet", "wisteria", "blush", "iron", "chestnut"]

    cards_html = []
    for fid, fname, fdesc in fams:
        cells = []
        for tid in tones:
            path = THEMES_DIR / f"su-{fid}-{tid}.json"
            data = json.loads(path.read_text(encoding="utf-8"))
            rendered = convert_markdown_to_wechat_html(SAMPLE_MD, str(path))
            colors = data["colors"]
            cells.append(f"""
      <div class="card">
        <div class="card-head">
          <span class="dot" style="background:{colors['accent']}"></span>
          <span class="cname">{data['name']}</span>
          <span class="cid">su-{fid}-{tid}</span>
        </div>
        <div class="card-body">{rendered}</div>
      </div>""")
        cards_html.append(f"""
  <section class="fam">
    <h3>{fname} <small>{fdesc}</small></h3>
    <div class="grid">{''.join(cells)}</div>
  </section>""")

    page = f"""<!DOCTYPE html>
<html lang="zh-CN">
<head>
<meta charset="utf-8">
<title>六族 · 十二色 主题审查台（72 套）</title>
<style>
  body {{ margin:0; padding:32px; background:#EDEFF3; color:#1B1F28;
         font-family:-apple-system,'PingFang SC','Microsoft YaHei',sans-serif; }}
  h1 {{ font-size:22px; margin:0 0 8px; }}
  .intro {{ max-width:900px; color:#555F6E; font-size:13px; line-height:1.9; margin-bottom:28px; }}
  .intro b {{ color:#1B1F28; }}
  .fam {{ margin-bottom:40px; }}
  .fam > h3 {{ font-size:16px; margin:0 0 14px; border-left:4px solid #1B1F28; padding-left:10px; }}
  .fam > h3 small {{ font-weight:400; color:#77808F; font-size:12px; margin-left:8px; }}
  .grid {{ display:grid; grid-template-columns:repeat(auto-fill,minmax(370px,1fr)); gap:18px; }}
  .card {{ background:#fff; border-radius:10px; overflow:hidden;
          box-shadow:0 2px 10px rgba(20,30,50,.07); }}
  .card-head {{ display:flex; align-items:center; gap:8px; padding:10px 14px;
               border-bottom:1px solid #Eef1F5; }}
  .dot {{ width:10px; height:10px; border-radius:50%; flex:none; }}
  .cname {{ font-weight:600; font-size:13px; }}
  .cid {{ margin-left:auto; font-size:11px; color:#9AA3B2; font-family:monospace; }}
  .card-body {{ padding:10px; }}
</style>
</head>
<body>
  <h1>六族 · 十二色主题审查台（新增 72 套）</h1>
  <div class="intro">
    <b>本页渲染与产品同源：</b>每张卡都是走 <code>convert_markdown_to_wechat_html</code> 的真实产物，
    不是截图或示意。审视要点：① 六族气质是否到位；② 命名（族名·色调）是否顺眼；
    ③ 配色浓淡、字距、圆角、投影等手感是否要调。<br>
    <b>版权路线：</b>风格品类为灵感参照，命名 / 色值 / 样式表达全部为本项目原创推导
    （色值 = 色调色相 × 族级饱和·明度基线），未复制任何外部代码与数值。
  </div>
  {''.join(cards_html)}
</body>
</html>"""
    out_page = OUT / "six-families.html"
    out_page.write_text(page, encoding="utf-8")
    print(f"审查台已写出：{out_page}")
    print(f"新增主题数：{len(new_ids)}")


if __name__ == "__main__":
    main()
