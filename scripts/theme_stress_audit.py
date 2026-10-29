#!/usr/bin/env python3
"""模板应力审计：用《SuperSu_AI排版压力测试文档》量化结构识别与主题渲染。

用法：
    python scripts/theme_stress_audit.py                # 全跑，输出 output/stress_audit/
    python scripts/theme_stress_audit.py --only struct   # 只跑结构断言
    python scripts/theme_stress_audit.py --only dup      # 只跑主题重复度
    python scripts/theme_stress_audit.py --only render   # 只跑渲染审计

产物：
    output/stress_audit/report.json   机器可读全量结果
    output/stress_audit/report.md     人读报告
    output/stress_audit/preprocessed.md  预处理后的 Markdown（人工复核用）

设计原则：
    1. 断言只依赖「文档里写明的期望」，不做审美判断。
    2. 原文保真类断言（H 开头）为硬门禁：丢字/改字即 FAIL。
    3. 结构识别类断言（S 开头）记录实际行为，用于排优先级。
"""
from __future__ import annotations

import argparse
import json
import re
import sys
from pathlib import Path

BASE = Path(__file__).resolve().parent.parent
sys.path.insert(0, str(BASE))

from core.preprocessor import preprocess  # noqa: E402
from core.format_engine import convert_markdown_to_wechat_html  # noqa: E402

# 夹具实际位置在 scripts/fixtures/（2026-10-29 修正：原路径指向 tests/fixtures，
# 该目录并不存在 → `python scripts/theme_stress_audit.py` 一跑就 FileNotFoundError）
FIXTURE = BASE / "scripts" / "fixtures" / "txt-format-lab.txt"
if not FIXTURE.exists():  # 兼容历史位置
    FIXTURE = BASE / "tests" / "fixtures" / "txt-format-lab.txt"
OUT = BASE / "output" / "stress_audit"
THEMES = BASE / "public" / "themes"


def load_fixture() -> str:
    return FIXTURE.read_text(encoding="utf-8")


def lines_of(md: str) -> list[str]:
    return md.split("\n")


def count_headings(md: str) -> dict[str, int]:
    out = {"h1": 0, "h2": 0, "h3": 0, "h4": 0, "h5": 0, "h6": 0}
    for ln in lines_of(md):
        m = re.match(r"^(#{1,6})\s", ln)
        if m:
            out[f"h{len(m.group(1))}"] += 1
    return out


def has_line(md: str, pattern: str, regex: bool = False) -> bool:
    for ln in lines_of(md):
        if (re.search(pattern, ln) if regex else pattern in ln):
            return True
    return False


def count_lines(md: str, pattern: str, regex: bool = True) -> int:
    return sum(1 for ln in lines_of(md) if re.search(pattern, ln))


def md_slice(md: str, start: str, end: str | None = None) -> str:
    """截取两个标记之间的片段，避免跨章节误统计。"""
    i = md.find(start)
    if i < 0:
        return ""
    j = md.find(end, i + len(start)) if end else -1
    return md[i:j] if j > 0 else md[i:]


# ── 结构断言 ────────────────────────────────────────────────────────────────
# kind: "fidelity" = 原文保真（硬门禁）；"structure" = 结构识别
CHECKS: list[dict] = []


def check(cid: str, section: str, kind: str, desc: str):
    def deco(fn):
        CHECKS.append({"id": cid, "section": section, "kind": kind, "desc": desc, "fn": fn})
        return fn
    return deco


@check("H01", "01", "fidelity", "原文所有非空行都必须能在结果中找到（允许加标记，不允许丢字）")
def _(md: str, raw: str) -> tuple[bool, str]:
    def norm(s: str) -> str:
        return re.sub(r"[#>*`\-\s|]", "", s)
    md_norm = norm(md)
    missing = []
    for ln in raw.split("\n"):
        s = ln.strip()
        if not s:
            continue
        # 纯分隔线、围栏标记不参与
        if re.fullmatch(r"[=＝]{3,}", s) or s.startswith(("```", "~~~")):
            continue
        # 任务清单由规则转成 ☐/☑（S29 单独断言），比对时先剥掉原复选框标记
        s = re.sub(r"^[-*+]\s+\[[ xX]\]\s*", "", s)
        probe = norm(s)[:12]
        if probe and probe not in md_norm:
            missing.append(s[:40])
    return (not missing), f"缺失 {len(missing)} 行" + ("：" + " | ".join(missing[:5]) if missing else "")


@check("H02", "07", "fidelity", "围栏代码块内容必须逐字保留（含缩进与空行）")
def _(md: str, raw: str) -> tuple[bool, str]:
    # 取原文所有 ``` 围栏块，逐块比对是否原样出现在结果中
    blocks, cur, inside = [], [], False
    for ln in raw.split("\n"):
        if ln.strip().startswith("```"):
            if inside and cur:
                blocks.append(cur)
            cur, inside = [], not inside
            continue
        if inside:
            cur.append(ln)
    bad = 0
    for blk in blocks:
        seg = "\n".join(blk)
        if seg and seg not in md:
            bad += 1
    return bad == 0, f"{len(blocks)} 个围栏块中 {bad} 个内容被改写/丢缩进"


@check("H03", "11", "fidelity", "原文加粗 **...** 不得被项目符号规则破坏")
def _(md: str, raw: str) -> tuple[bool, str]:
    got = count_lines(md, r"^-\s+\*[^*]")
    return got == 0, f"发现 {got} 处 `- *...**` 式破坏"


@check("H04", "02", "fidelity", "关键数字/单位/货币/特殊符号不得丢失")
def _(md: str, raw: str) -> tuple[bool, str]:
    tokens = ["1,234,567", "98.6%", "$19.99", "€25", "35 °C", "1920 × 1080", "3:4", "9:16",
              "©", "®", "™", "§", "¶", "≤", "≥", "≠", "±", "÷", "√", "∑", "∞", "π"]
    missing = [t for t in tokens if t not in md]
    return (not missing), f"缺失 {len(missing)} 个：{missing}"


@check("H05", "09", "fidelity", "emoji 不得丢失")
def _(md: str, raw: str) -> tuple[bool, str]:
    emo = ["😀", "🎨", "🧪", "📌", "⚠️", "✅", "❌", "💡", "🚀", "❤️"]
    missing = [e for e in emo if e not in md]
    return (not missing), f"缺失 {len(missing)} 个：{missing}"


@check("H06", "15", "fidelity", "原始 HTML 片段不得被当成标题或被执行")
def _(md: str, raw: str) -> tuple[bool, str]:
    bad = count_lines(md, r"^#{1,6}\s*<")
    return bad == 0, f"{bad} 行 HTML 被标题化"


@check("S01", "01", "structure", "首行应成为文章主标题（h1）")
def _(md: str, raw: str) -> tuple[bool, str]:
    first = next((l for l in lines_of(md) if l.strip()), "")
    return first.startswith("# "), f"首行=「{first[:36]}」"


@check("S02", "01", "structure", "==== 分隔线不应产生「## =」之类假标题")
def _(md: str, raw: str) -> tuple[bool, str]:
    bad = count_lines(md, r"^#{1,6}\s*=*\s*$")
    return bad == 0, f"假标题 {bad} 个"


@check("S03", "01", "structure", "「01｜普通文本与标题层级」应为二级标题")
def _(md: str, raw: str) -> tuple[bool, str]:
    ok = has_line(md, r"^##\s*01｜", regex=True)
    return ok, "命中" if ok else "未识别"


@check("S04", "01", "structure", "「第一章：为什么要做这个工具」应为标题而非正文")
def _(md: str, raw: str) -> tuple[bool, str]:
    ok = has_line(md, r"^#{2,3}\s*第一章", regex=True)
    return ok, "命中" if ok else "未识别"


@check("S05", "01", "structure", "「1.1 先识别，再设计」应为三级标题")
def _(md: str, raw: str) -> tuple[bool, str]:
    ok = has_line(md, r"^###\s*1\.1\s", regex=True)
    return ok, "命中" if ok else "未识别"


@check("S06", "02", "structure", "显式 Markdown 的 h1~h4 层级必须原样保留")
def _(md: str, raw: str) -> tuple[bool, str]:
    need = [r"^#\s*一级标题", r"^##\s*二级标题", r"^###\s*三级标题", r"^####\s*四级标题"]
    miss = [p for p in need if not has_line(md, p, regex=True)]
    return (not miss), f"缺失 {len(miss)} 级"


@check("S07", "02", "structure", "加粗 / 斜体 / 删除线 / 行内代码 语法应保留")
def _(md: str, raw: str) -> tuple[bool, str]:
    need = ["**这句话需要加粗**", "*这几个字需要斜体*", "~~这部分表示删除线~~", "`inline_code()`"]
    miss = [n for n in need if n not in md]
    return (not miss), f"缺失 {len(miss)} 项：{miss}"


@check("S08", "04", "structure", "「- 」无序列表 4 项应完整保留")
def _(md: str, raw: str) -> tuple[bool, str]:
    n = sum(1 for l in lines_of(md) if re.match(r"^-\s*(识别文章主标题|识别章节标题|识别重点句|生成公众号兼容样式)$", l))
    return n == 4, f"识别 {n}/4"


@check("S09", "04", "structure", "「* 」星号列表应转成标准列表（而非标题）")
def _(md: str, raw: str) -> tuple[bool, str]:
    n = sum(1 for l in lines_of(md) if re.match(r"^[-*]\s*(苹果|香蕉|橙子)$", l))
    bad = count_lines(md, r"^#{1,6}\s*\*\s")
    return n == 3 and bad == 0, f"列表 {n}/3，误判标题 {bad}"


@check("S10", "04", "structure", "「+ 」加号列表应识别成列表")
def _(md: str, raw: str) -> tuple[bool, str]:
    n = sum(1 for l in lines_of(md) if re.match(r"^[-*+]\s*(简洁|清晰|易复制)$", l))
    return n == 3, f"识别 {n}/3"


@check("S11", "04", "structure", "标准有序列表 5 项必须是有序列表，不能变成 5 个标题")
def _(md: str, raw: str) -> tuple[bool, str]:
    seg = md_slice(md, "## 有序列表", "## 嵌套列表")
    as_heading = sum(1 for l in lines_of(seg) if re.match(r"^#{1,6}\s*\d+[.、]\s*(导入 TXT|识别结构|选择视觉风格|预览结果|复制到公众号)", l))
    as_list = sum(1 for l in lines_of(seg) if re.match(r"^(?:\d+[.)]|-)\s*(导入 TXT|识别结构|选择视觉风格|预览结果|复制到公众号)", l))
    return as_list == 5 and as_heading == 0, f"列表 {as_list}/5，误判标题 {as_heading}"


@check("S12", "04", "structure", "嵌套列表应保留二级缩进")
def _(md: str, raw: str) -> tuple[bool, str]:
    n = count_lines(md, r"^\s{1,}[-*]\s*(TXT 文件|Markdown 文本|粘贴的纯文本|网页预览|微信富文本|HTML 文件)")
    return n >= 3, f"保留缩进的子项 {n}/6"


@check("S13", "05", "structure", "Markdown 引用块（含作者署名行）应保留")
def _(md: str, raw: str) -> tuple[bool, str]:
    n = count_lines(md, r"^>\s*(好的排版应该服务于内容|—— 一条测试用引言)")
    n3 = count_lines(md, r"^>\s*第[一二三]行引用")
    return n >= 1 and n3 == 3, f"引用 {n}/2，多行引用 {n3}/3"


@check("S14", "05", "structure", "「提示：」「注意：」「风险：」应识别为提示块而非普通标题")
def _(md: str, raw: str) -> tuple[bool, str]:
    n = count_lines(md, r"^>\s*(提示|注意|风险)\s*[：:]")
    return n >= 3, f"识别 {n}/3"


@check("S15", "05", "structure", "脚注定义 [^1] / [^note] 应保留")
def _(md: str, raw: str) -> tuple[bool, str]:
    ok = "[^1]: 脚注一" in md and "[^note]: 脚注二" in md
    return ok, "保留" if ok else "丢失"


@check("S16", "06", "structure", "Markdown 表格（含对齐行）应保留")
def _(md: str, raw: str) -> tuple[bool, str]:
    ok = has_line(md, r"^\|.*功能.*优先级", regex=True) and has_line(md, r"^\|[-: ]+\|", regex=True)
    return ok, "保留" if ok else "丢失"


@check("S17", "06", "structure", "非标准竖线表格不应被误判为标题")
def _(md: str, raw: str) -> tuple[bool, str]:
    bad = count_lines(md, r"^#{1,6}\s*[^|]*\|")
    return bad == 0, f"误判 {bad} 行"


@check("S18", "07", "structure", "6 个围栏代码块（js/python/bash/json/yaml/text）应完整保留")
def _(md: str, raw: str) -> tuple[bool, str]:
    fences = count_lines(md, r"^```")
    langs = [l for l in lines_of(md) if re.match(r"^```(javascript|python|bash|json|yaml|text)$", l)]
    return fences % 2 == 0 and len(langs) == 6, f"围栏 {fences} 行 / 语言标记 {len(langs)}/6"


@check("S19", "08", "structure", "裸链接 / 邮箱 / 电话 / 图片语法应保留")
def _(md: str, raw: str) -> tuple[bool, str]:
    need = ["https://github.com/Lifa-su/md2wechat", "hello@example.com", "020-12345678",
            "![一张用于测试的示意图]"]
    miss = [n for n in need if n not in md]
    return (not miss), f"缺失 {len(miss)}：{miss}"


@check("S20", "09", "structure", "行内公式与独立公式块不得被标题化")
def _(md: str, raw: str) -> tuple[bool, str]:
    inline = "$E = mc^2$" in md
    bad = count_lines(md, r"^#{1,6}\s*\$\$")
    return inline and bad == 0, f"行内公式={inline}，公式块误判 {bad}"


@check("S21", "10", "structure", "诗词 4 行必须保留换行，不能合并成一段")
def _(md: str, raw: str) -> tuple[bool, str]:
    keep = ["床前明月光，", "疑是地上霜。", "举头望明月，", "低头思故乡。"]
    joined = [k for k in keep if k in md]
    merged = "床前明月光，疑是地上霜" in md
    return len(joined) == 4 and not merged, f"保留 {len(joined)}/4，合并={merged}"


@check("S22", "10", "structure", "诗词标题「静夜思」与作者「李白」应可区分层级")
def _(md: str, raw: str) -> tuple[bool, str]:
    title_head = has_line(md, r"^#{1,6}\s*静夜思", regex=True)
    author_marked = has_line(md, r"^(#{1,6}|>)\s*李白", regex=True)
    return title_head or author_marked, f"标题层级={title_head}，作者标记={author_marked}"


@check("S23", "12", "structure", "「【清单型】- [ ] 」任务清单应保留")
def _(md: str, raw: str) -> tuple[bool, str]:
    n = count_lines(md, r"^-\s*(?:\[[ xX]\]|☐|☑)")
    return n >= 6, f"识别 {n}/6"


@check("S24", "12", "structure", "问答型 Q：/A： 应可识别成结构")
def _(md: str, raw: str) -> tuple[bool, str]:
    n = count_lines(md, r"^(#{1,6}\s*|>\s*)?[QA][：:]")
    return n >= 2, f"识别 {n}/4"


@check("S25", "13", "structure", "箭头流程「A → B → C」应转成列表")
def _(md: str, raw: str) -> tuple[bool, str]:
    n = count_lines(md, r"^-\s*(导入 TXT|解析内容块|识别文章类型|选择主题|生成预览|复制到公众号)$")
    return n >= 5, f"识别 {n}/6"


@check("S26", "14", "structure", "反例：普通陈述句不得被当成标题")
def _(md: str, raw: str) -> tuple[bool, str]:
    bad = count_lines(md, r"^#{1,6}\s*(今天我想聊聊|这个项目的第二阶段|第一点是|这是一句带有|网址路径里)")
    return bad == 0, f"误判 {bad} 行"


@check("S27", "14", "structure", "反例：正文里的 npm run dev / true / 6-8 元不得被当成代码块")
def _(md: str, raw: str) -> tuple[bool, str]:
    # 检查这几行是否仍以普通正文出现（未落在 ``` 围栏内）
    in_fence, bad = False, 0
    for ln in lines_of(md):
        if ln.startswith("```"):
            in_fence = not in_fence
            continue
        if in_fence and re.search(r"(我今天运行了 npm run dev|这个配置的值是 true)", ln):
            bad += 1
    return bad == 0, f"误判代码 {bad} 行"


@check("S28", "16", "structure", "结尾 6 条「应该做到」应是有序列表")
def _(md: str, raw: str) -> tuple[bool, str]:
    seg = md_slice(md, "一个合格的转换工具", "—— TXT 自动排版测试文档结束")
    as_head = sum(1 for l in lines_of(seg) if re.match(r"^#{1,6}\s*\d+[.、]", l))
    as_list = sum(1 for l in lines_of(seg) if re.match(r"^(?:\d+[.)]|-)\s*(尽量识别|不擅自改写|对不确定|生成网页|粘贴失败|支持简洁)", l))
    return as_list == 6 and as_head == 0, f"列表 {as_list}/6，误判标题 {as_head}"


# ── 2026-10-19 格式兼容扩展（方案 B）新增断言 ───────────────────────────────
@check("S29", "12", "structure", "GFM 任务清单 - [ ] 应转成 ☐ 且原文文字不丢")
def _(md: str, raw: str) -> tuple[bool, str]:
    boxes = count_lines(md, r"^-\s*☐\s*\S")
    left = count_lines(md, r"^-\s*\[[ xX]\]")
    texts = ("标题无错别字", "原文没有丢失", "链接可用", "图片有说明",
             "手机上阅读正常", "复制到公众号后再次检查")
    miss = [t for t in texts if f"☐ {t}" not in md]
    return boxes >= 6 and left == 0 and not miss, f"☐ {boxes}/6，残留标记 {left}，缺失 {miss}"


@check("S30", "01", "structure", "全部「NN｜」章节标记都应成为二级标题（含带冒号的 06/12）")
def _(md: str, raw: str) -> tuple[bool, str]:
    total = sum(1 for ln in raw.split("\n") if re.match(r"^\d{1,2}\s*｜\s*\S", ln.strip()))
    hit = count_lines(md, r"^##\s*\d{1,2}\s*｜\s*\S")
    return hit == total and total >= 16, f"{hit}/{total}"


@check("S31", "04", "structure", "括号编号「（1）（2）」不得被误判为标题")
def _(md: str, raw: str) -> tuple[bool, str]:
    bad = count_lines(md, r"^#{1,6}\s*（\d+）")
    keep = sum(1 for t in ("（1）中文括号编号", "（2）继续下一项") if t in md)
    return bad == 0 and keep == 2, f"误判标题 {bad}，原文保留 {keep}/2"


@check("S32", "06", "structure", "无分隔行的竖线表应自动补表头分隔行（可渲染成表格）")
def _(md: str, raw: str) -> tuple[bool, str]:
    seg = md_slice(md, "简单的竖线分隔表格", "## 数据对比")
    rows = sum(1 for l in lines_of(seg) if "|" in l)
    seps = sum(1 for l in lines_of(seg) if re.match(r"^\|(-{3}\|)+$", l.strip()))
    return rows >= 5 and seps == 1, f"表行 {rows}，补的分隔行 {seps}"


@check("S33", "06", "structure", "空格对齐表应转成管道表")
def _(md: str, raw: str) -> tuple[bool, str]:
    head = has_line(md, r"^\|\s*指标\s*\|\s*方案 A\s*\|\s*方案 B\s*\|$", regex=True)
    n = count_lines(md, r"^\|\s*(指标|耗时|成本|稳定性)\s*\|")
    return head and n == 4, f"表头={head}，行 {n}/4"


@check("S34", "01", "structure", "方括号提示标签【提示】应识别为提示块（引用）")
def _(md: str, raw: str) -> tuple[bool, str]:
    ok = has_line(md, r"^>\s*【提示】方括号内容", regex=True)
    bad = count_lines(md, r"^#{1,6}\s*【提示】")
    return ok and bad == 0, f"命中={ok}，误判标题 {bad}"


# ── 主题重复度 ──────────────────────────────────────────────────────────────
def _hex_rgb(h: str):
    h = (h or "").strip().lstrip("#")
    if len(h) == 3:
        h = "".join(c * 2 for c in h)
    if len(h) != 6:
        return None
    try:
        return tuple(int(h[i:i + 2], 16) for i in (0, 2, 4))
    except ValueError:
        return None


def _lab(rgb):
    def f(c):
        c /= 255.0
        return c / 12.92 if c <= 0.04045 else ((c + 0.055) / 1.055) ** 2.4
    r, g, b = (f(x) for x in rgb)
    x = (r * 0.4124 + g * 0.3576 + b * 0.1805) / 0.95047
    y = (r * 0.2126 + g * 0.7152 + b * 0.0722) / 1.0
    z = (r * 0.0193 + g * 0.1192 + b * 0.9505) / 1.08883

    def g(t):
        return t ** (1 / 3) if t > 0.008856 else 7.787 * t + 16 / 116
    fx, fy, fz = g(x), g(y), g(z)
    return (116 * fy - 16, 500 * (fx - fy), 200 * (fy - fz))


def _de(a, b):
    la, lb = _lab(a), _lab(b)
    return sum((x - y) ** 2 for x, y in zip(la, lb)) ** 0.5


def _luminance(rgb):
    def f(c):
        c /= 255.0
        return c / 12.92 if c <= 0.04045 else ((c + 0.055) / 1.055) ** 2.4
    r, g, b = (f(x) for x in rgb)
    return 0.2126 * r + 0.7152 * g + 0.0722 * b


def contrast(fg: str, bg: str) -> float:
    a, b = _hex_rgb(fg), _hex_rgb(bg)
    if not a or not b:
        return 0.0
    l1, l2 = _luminance(a), _luminance(b)
    hi, lo = max(l1, l2), min(l1, l2)
    return (hi + 0.05) / (lo + 0.05)


def theme_skeleton(d: dict) -> dict:
    st, c = d.get("styles", {}), d.get("colors", {})

    def g(k, key="font_size", dflt=""):
        v = st.get(k)
        return str(v.get(key, dflt)) if isinstance(v, dict) else dflt
    return {
        "h1": g("h1"), "h2": g("h2"), "h3": g("h3"), "p": g("p"),
        "lh_p": g("p", "line_height"), "lh_h2": g("h2", "line_height"),
        "w_h1": g("h1", "font_weight"), "w_h2": g("h2", "font_weight"),
        "ff_p": g("p", "font_family"), "ff_h1": g("h1", "font_family"),
        "h2_bg": g("h2", "background_color"), "h2_border": g("h2", "border"),
        "bq_bg": g("blockquote", "background_color"), "align": g("h1", "text_align"),
        "radius": g("wrapper", "border_radius"),
        "bg": c.get("background"), "ink": c.get("primary"), "accent": c.get("accent"),
    }


def audit_dup() -> dict:
    files = sorted(THEMES.glob("*.json"))
    skel: dict[str, list] = {}
    items = []
    for f in files:
        d = json.loads(f.read_text(encoding="utf-8"))
        s = theme_skeleton(d)
        struct_key = json.dumps(
            {k: v for k, v in s.items()
             if k not in ("bg", "ink", "accent", "h2_bg", "bq_bg")},
            sort_keys=True, ensure_ascii=False)
        skel.setdefault(struct_key, []).append(f.stem)
        items.append({"id": f.stem, "skel": struct_key, **s})

    # 结构完全一致 + 主色接近 → 近重复
    near_dup_pairs = []
    for key, members in skel.items():
        if len(members) < 2:
            continue
        base = next(i for i in items if i["id"] == members[0])
        for other in members[1:]:
            o = next(i for i in items if i["id"] == other)
            try:
                dde = _de(_hex_rgb(base["bg"]), _hex_rgb(o["bg"]))
                da = _de(_hex_rgb(base["accent"]), _hex_rgb(o["accent"]))
            except TypeError:
                continue
            if dde < 12 and da < 18:
                near_dup_pairs.append({"a": base["id"], "b": o["id"],
                                       "dBG": round(dde, 1), "dAccent": round(da, 1)})

    # 按族的成员数
    groups = sorted(({"n": len(v), "members": v} for v in skel.values()), key=lambda x: -x["n"])
    return {
        "total": len(items),
        "distinct_skeletons": len(skel),
        "largest_group": groups[0]["n"] if groups else 0,
        "groups_over_6": [g for g in groups if g["n"] > 6],
        "near_dup_pairs": near_dup_pairs,
        "groups": groups,
    }


# ── 渲染审计 ────────────────────────────────────────────────────────────────
WECHAT_FORBIDDEN = ["<style", "<div", "class=", "<link", "<script"]


def _heading_render_rate(md: str, html: str) -> float:
    texts = re.findall(r"^#{2,4}\s+(.+)$", md, re.M)
    texts = [re.sub(r"[：:]+$", "", t.strip()) for t in texts if t.strip()]
    if not texts:
        return 0.0
    return round(sum(1 for t in texts if t in html) / len(texts), 3)


def audit_render(raw: str, theme_ids: list[str]) -> dict:
    md = preprocess(raw)
    results = []
    for tid in theme_ids:
        path = THEMES / f"{tid}.json"
        if not path.exists():
            results.append({"theme": tid, "error": "not found"})
            continue
        d = json.loads(path.read_text(encoding="utf-8"))
        try:
            html = convert_markdown_to_wechat_html(md, str(path))
        except Exception as exc:  # noqa: BLE001
            results.append({"theme": tid, "error": repr(exc)})
            continue
        st = d.get("styles", {})
        bg = d.get("colors", {}).get("background", "#FFFFFF")
        # 正文墨色取 styles.p.color（真实正文文字色），拿不到才退回 colors.primary。
        # ⚠️ 原实现直接用 colors.primary 当「正文墨色」：对 su-* 生成主题它确实等于正文色，
        # 但早期原创主题的 colors.primary 是「品牌/标题色」（如 sakura 的 #e898a8 是浅粉标题色），
        # 据此判「正文/背景对比度」会误报 —— 这些主题真实正文色（styles.p.color）对比度有 8~12。
        ink = ((st.get("p") or {}).get("color")
               or d.get("colors", {}).get("primary", "#000000"))

        def sq(tag: str) -> int:
            return len(re.findall(rf"<{tag}(\s|>)", html))

        rec = {
            "theme": tid,
            "html_bytes": len(html.encode("utf-8")),
            "h1": sq("h1"), "h2": sq("h2"), "h3": sq("h3"),
            "p": sq("p"), "table": sq("table"), "pre": sq("pre"),
            "blockquote": sq("blockquote"), "strong": sq("strong"), "em": sq("em"),
            "ol": sq("ol"), "ul": sq("ul"), "img": sq("img"),
            "inline_style_ratio": round(len(re.findall(r"style=\"", html)) / max(1, len(re.findall(r"<[a-z]", html))), 3),
            "forbidden_count": len([t for t in WECHAT_FORBIDDEN if t in html]),
            "p_font": (st.get("p") or {}).get("font_size"),
            "h2_font": (st.get("h2") or {}).get("font_size"),
            "heading_rate": _heading_render_rate(md, html),
            "contrast_ink_bg": round(contrast(ink, bg), 2),
            "contrast_code": round(contrast(
                (st.get("pre_code") or {}).get("color", ink),
                (st.get("pre") or {}).get("background", bg)), 2),
            # 移动端可读性（2026-10-29）：色块标题必须左对齐、正文必须可断行。
            # 背景：102/164 套原先把 h1 写成居中，18 字标题在 375px 下 101 套折成两行，
            # 居中折行在手机上呈锯齿状；长 URL 会横向撑破版面（微信无法横向滚动）。
            "heading_center_in_banner": (
                len(re.findall(r"<h[1-6]\s[^>]*text-align:center", html))
                if (st.get("h1") or {}).get("background") or (st.get("h1") or {}).get("background_color")
                else 0),
            "text_wrap_ok": "word-break:break-word" in html,
        }
        # verdict：标题文字渲染率 ≥0.9（兼容「序号徽标」类主题把 h2 拆成 section+span）、
        # 正文/代码块对比度达标、关键结构（表格/代码块）存在、色块标题不居中、正文可断行
        rec["verdict"] = (
            "PASS" if (rec["heading_rate"] >= 0.9 and rec["p"] >= 10
                       and rec["table"] >= 1 and rec["pre"] >= 1
                       and rec["contrast_ink_bg"] >= 4.5 and rec["contrast_code"] >= 4.5
                       and rec["heading_center_in_banner"] == 0 and rec["text_wrap_ok"])
            else "FAIL")
        results.append(rec)
    return {"count": len(results), "pass": sum(1 for r in results if r.get("verdict") == "PASS"),
            "results": results}


def build_report_md(report: dict) -> str:
    """把 report.json 渲染成人类可读的 Markdown 报告（与 report.json 同源）。"""
    L: list[str] = []
    L.append("# SuperSu 应力审计 · 人读报告\n")
    L.append(f"- 测试夹具：`{report.get('fixture')}`")
    L.append(f"- 夹具字数：{report.get('fixture_chars')}\n")

    if "struct" in report:
        s = report["struct"]
        L.append(f"## 一、结构识别断言（{s['total']} 项）")
        L.append(f"**总通过 {s['pass']}/{s['total']}；原文保真 {s['fidelity_pass']}/{s['fidelity_total']}**\n")
        L.append("| 断言 | 章节 | 类别 | 描述 | 结果 | 细节 |")
        L.append("|------|------|------|------|------|------|")
        for r in s["rows"]:
            res = "✅" if r["pass"] else "❌"
            L.append(f"| {r['id']} | §{r['section']} | {r['kind']} | {r['desc']} | {res} | {r['detail']} |")
        h = s.get("headings", {})
        L.append(f"\n> 标题层级计数：{h}\n")

    if "dup" in report:
        d = report["dup"]
        L.append("## 二、主题骨架去重")
        L.append(f"- 主题总数：{d['total']}")
        L.append(f"- 不同骨架数：{d['distinct_skeletons']}")
        L.append(f"- 最大同构组：{d['largest_group']} 套")
        L.append(f"- 近重复对：{len(d.get('near_dup_pairs', []))}")
        if d.get("near_dup_pairs"):
            L.append("\n| A | B | 背景ΔLab | 强调ΔLab |")
            L.append("|---|---|---------|---------|")
            for p in d["near_dup_pairs"]:
                L.append(f"| {p['a']} | {p['b']} | {p.get('dBG')} | {p.get('dAccent')} |")
        L.append("")

    if "render" in report:
        rr = report["render"]
        L.append("## 三、164 套渲染达标审计")
        L.append(f"**通过 {rr['pass']}/{rr['count']}**\n")
        fails = [x for x in rr["results"] if x.get("verdict") != "PASS"]
        if fails:
            L.append("| 主题 | 失败原因 |")
            L.append("|------|----------|")
            for x in fails:
                reason = x.get("error") or ", ".join(
                    f"{k}={x[k]}" for k in ("h2", "p", "table", "pre", "contrast_ink_bg", "contrast_code")
                    if k in x
                )
                L.append(f"| {x['theme']} | {reason} |")
        L.append("")

    L.append("> 本报告由 `scripts/theme_stress_audit.py` 自动生成，复现命令见交接文档第 6 节。")
    return "\n".join(L) + "\n"


def main() -> int:
    ap = argparse.ArgumentParser()
    ap.add_argument("--only", choices=["struct", "dup", "render"], default=None)
    ap.add_argument("--themes", default="", help="逗号分隔主题 id，仅 render 用")
    args = ap.parse_args()

    OUT.mkdir(parents=True, exist_ok=True)
    raw = load_fixture()
    md = preprocess(raw)
    (OUT / "preprocessed.md").write_text(md, encoding="utf-8")

    report: dict = {"fixture": str(FIXTURE), "fixture_chars": len(raw)}

    if args.only in (None, "struct"):
        rows = []
        for c in CHECKS:
            try:
                ok, detail = c["fn"](md, raw)
            except Exception as exc:  # noqa: BLE001
                ok, detail = False, f"断言异常 {exc!r}"
            rows.append({"id": c["id"], "section": c["section"], "kind": c["kind"],
                         "desc": c["desc"], "pass": bool(ok), "detail": detail})
        report["struct"] = {
            "total": len(rows),
            "pass": sum(1 for r in rows if r["pass"]),
            "fidelity_total": sum(1 for r in rows if r["kind"] == "fidelity"),
            "fidelity_pass": sum(1 for r in rows if r["kind"] == "fidelity" and r["pass"]),
            "rows": rows,
            "headings": count_headings(md),
        }

    if args.only in (None, "dup"):
        report["dup"] = audit_dup()

    if args.only in (None, "render"):
        if args.themes:
            ids = [t.strip() for t in args.themes.split(",") if t.strip()]
        else:
            ids = [p.stem for p in sorted(THEMES.glob("*.json"))]
        report["render"] = audit_render(raw, ids)

    (OUT / "report.json").write_text(json.dumps(report, ensure_ascii=False, indent=2), encoding="utf-8")
    (OUT / "report.md").write_text(build_report_md(report), encoding="utf-8")

    # 控制台摘要
    if "struct" in report:
        s = report["struct"]
        print(f"[struct] {s['pass']}/{s['total']} 通过（保真 {s['fidelity_pass']}/{s['fidelity_total']}）")
        for r in s["rows"]:
            if not r["pass"]:
                print(f"  FAIL {r['id']} §{r['section']} {r['desc']} -> {r['detail']}")
    if "dup" in report:
        d = report["dup"]
        print(f"[dup] {d['total']} 套 → {d['distinct_skeletons']} 种骨架；最大同构组 {d['largest_group']} 套；"
              f"近重复对 {len(d['near_dup_pairs'])}")
    if "render" in report:
        r = report["render"]
        print(f"[render] {r['pass']}/{r['count']} 通过")
        for x in r["results"]:
            if x.get("verdict") != "PASS":
                print(f"  FAIL {x['theme']} {x.get('error') or {k: x[k] for k in ('h2','p','table','pre','contrast_ink_bg','contrast_code') if k in x}}")
    print(f"\n产物：{OUT}")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
