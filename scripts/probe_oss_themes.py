#!/usr/bin/env python
"""开源主题「配方反推」抽样验证（方案 B1）

只读对方 JSON 的参数（不复制文件），按 docs/plan-oss-reference.md §11.3 的规则
反推出 8 个语义参数，交给我们的 build_theme() 重新生成，再并排渲染对比。

用法：
    python scripts/probe_oss_themes.py
产出：
    output/probe_oss/report.html        并排对比页
    output/probe_oss/params.md          反推出的参数表
    output/probe_oss/theirs|ours/*.json 两边的主题（临时，仅用于渲染）
"""
import json
import os
import re
import sys
import urllib.request

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
sys.path.insert(0, os.path.join(ROOT, "scripts"))
sys.path.insert(0, ROOT)

from build_themes import build_theme                     # noqa: E402
from core.format_engine import convert_markdown_to_wechat_html  # noqa: E402

try:
    sys.stdout.reconfigure(encoding="utf-8", errors="replace")
except Exception:
    pass

RAW = "https://raw.githubusercontent.com/xiaohuailabs/xiaohu-wechat-format/main/themes/%s.json"
OUT = os.path.join(ROOT, "output", "probe_oss")

# 覆盖不同 layout / 明暗 / 字体，最有代表性
PICKS = [
    "apple-gradient",   # card + 渐变标题
    "academic-paper",   # 衬线 / 杂志
    "bauhaus",          # 几何强对比
    "dark-ocean",       # 深色
    "hero-azure",       # hero 首屏
    "timeline-green",   # timeline
    "notion-doc",       # 极简文档
    "rice-paper-ink",   # 宣纸 + 宋体
    "swiss-grid",       # 网格排版
    "terminal-matrix",  # 终端等宽
]

SAMPLE = """# 这套主题值不值得留

开头一段，先说清楚这次要验证什么：能不能只借参数，自己生成一套气质接近的主题。

## 结构一：列表与强调

- 第一个要点，写满一行看看换行和行距
- 第二个要点，带 **加粗强调**
- 第三个要点，带 `行内代码`

## 结构二：引用与代码

> 引用一句话，看引用块的气色和左边距。

```python
def hello():
    print("hi")
```

结尾一段。看看段间距、字距、留白，整体是不是那个味道。
"""


def lum(hexc):
    """0~1 亮度（用于判断深浅底）"""
    h = (hexc or "#FFFFFF").lstrip("#")
    if len(h) == 3:
        h = "".join(c * 2 for c in h)
    try:
        r, g, b = int(h[0:2], 16), int(h[2:4], 16), int(h[4:6], 16)
    except ValueError:
        return 1.0
    return (0.2126 * r + 0.7152 * g + 0.0722 * b) / 255


def fetch(name):
    with urllib.request.urlopen(RAW % name, timeout=40) as r:
        return json.loads(r.read().decode("utf-8"))


def derive(name, d):
    """按 §11.3 反推 8 个语义参数"""
    st = d.get("styles") or {}
    co = d.get("colors") or {}
    wrap = st.get("wrapper") or {}
    p = st.get("p") or {}
    h2 = st.get("h2") or {}

    bg = wrap.get("background_color") or co.get("background") or "#FFFFFF"
    ink = p.get("color") or co.get("primary") or "#222222"
    accent = co.get("accent") or h2.get("background_color") or ink
    fam = str(p.get("font_family") or "") + " " + str(wrap.get("font_family") or "")
    font = "serif" if re.search(r"serif|songti|宋|kaiti|楷|noto serif", fam, re.I) else "sans"
    mono = bool(re.search(r"mono|menlo|courier|consolas", fam, re.I))

    layout = (d.get("layout") or "").strip()
    L = lum(bg)
    if L < 0.3:
        arch = "night"
    elif layout == "card":
        arch = "card"
    elif mono:
        arch = "technical"
    elif font == "serif" and L < 0.98:
        arch = "paper"
    elif font == "serif":
        arch = "magazine"
    else:
        arch = "plain"

    return {
        "id": "probe-" + name,
        "name": d.get("name") or name,
        "font": font,
        "arch": arch,
        "bg": bg,
        "ink": ink,
        "accent": accent,
        "desc": (d.get("description") or "")[:40],
    }, {"layout": layout, "lum": round(L, 3), "mono": mono}


def build_ours(spec, src, meta):
    theme = build_theme(spec)
    # layout / card 是引擎配置参数（不是代码/文件），先沿用，验证视觉是否接近
    if meta["layout"] in ("card", "hero", "timeline"):
        theme["layout"] = meta["layout"]
        if src.get("card"):
            theme["card"] = src["card"]
    return theme


def main():
    for sub in ("theirs", "ours"):
        os.makedirs(os.path.join(OUT, sub), exist_ok=True)

    rows, params = [], []
    for name in PICKS:
        try:
            src = fetch(name)
        except Exception as e:
            print(f"跳过 {name}: {e}")
            continue
        spec, meta = derive(name, src)
        ours = build_ours(spec, src, meta)

        tdir = os.path.join(OUT, "theirs", name + ".json")
        odir = os.path.join(OUT, "ours", name + ".json")
        with open(tdir, "w", encoding="utf-8") as f:
            json.dump(src, f, ensure_ascii=False, indent=2)
        with open(odir, "w", encoding="utf-8") as f:
            json.dump(ours, f, ensure_ascii=False, indent=2)

        try:
            h_theirs = convert_markdown_to_wechat_html(SAMPLE, tdir)
            h_ours = convert_markdown_to_wechat_html(SAMPLE, odir)
        except Exception as e:
            print(f"渲染失败 {name}: {e}")
            continue

        rows.append((name, spec, meta, h_theirs, h_ours))
        params.append((name, spec, meta))
        print(f"✓ {name:<18} arch={spec['arch']:<9} font={spec['font']:<5} "
              f"bg={spec['bg']} ink={spec['ink']} accent={spec['accent']}")

    # 参数表
    with open(os.path.join(OUT, "params.md"), "w", encoding="utf-8") as f:
        f.write("# 反推参数表（抽样 10 套）\n\n")
        f.write("| 对方主题 | 我们的 arch | font | bg | ink | accent | layout | 亮度 |\n")
        f.write("|---|---|---|---|---|---|---|---|\n")
        for name, s, m in params:
            f.write(f"| {name} | {s['arch']} | {s['font']} | `{s['bg']}` | `{s['ink']}` | "
                    f"`{s['accent']}` | {m['layout'] or '—'} | {m['lum']} |\n")

    # 对比页
    parts = ["""<!DOCTYPE html><html><head><meta charset="utf-8">
<style>
body{margin:0;background:#ECEAE4;font-family:-apple-system,"Microsoft YaHei",sans-serif}
.row{display:flex;gap:0;border-bottom:1px solid #D8D4CA}
.cell{flex:1;min-width:0;background:#fff}
.cell+.cell{border-left:1px solid #D8D4CA}
.tag{padding:8px 14px;font-size:12px;color:#6b6459;background:#F7F4EE;display:flex;gap:10px;align-items:center}
.tag b{color:#2A2721;font-size:12px}
.tag code{font-size:11px;color:#8a8377}
.stage{padding:0}
.stage .wx{margin:0 auto;max-width:420px}
h2.sec{margin:0;padding:14px;font-size:13px;background:#2A2721;color:#fff}
</style></head><body>"""]
    for name, spec, meta, h_theirs, h_ours in rows:
        parts.append(f'<div class="row"><div class="cell">'
                     f'<div class="tag"><b>原版</b> {name}</div>'
                     f'<div class="stage"><div class="wx">{h_theirs}</div></div></div>')
        parts.append(f'<div class="cell">'
                     f'<div class="tag"><b>我们生成</b> {name} · arch={spec["arch"]} · font={spec["font"]}'
                     f' <code>{spec["bg"]} / {spec["ink"]} / {spec["accent"]}</code></div>'
                     f'<div class="stage"><div class="wx">{h_ours}</div></div></div></div>')
    parts.append("</body></html>")
    with open(os.path.join(OUT, "report.html"), "w", encoding="utf-8") as f:
        f.write("".join(parts))
    print(f"\n对比页: {os.path.join(OUT, 'report.html')}")
    print(f"参数表: {os.path.join(OUT, 'params.md')}")


if __name__ == "__main__":
    main()
