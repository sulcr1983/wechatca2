"""
产品经理视角 · Chrome 有头端到端全流程审计（2026-10-18）
==============================================================
真实启动 Flask + Playwright（系统 Chrome 优先，headless=False 可见窗口），
按「一个真实用户从打开页面到发出去」的完整流程走一遍，只做两件事：

  A. 场景语料：16 类真实输入 → 校验「识别结构」条 + 真实预览 HTML 的层级/结构
                （重点验证「第一段 = 最大标题」的视觉层级是否成立、字号是否单调递减）
  B. 交互逐项：公众号页 + 小红书页每个可点元素 → 校验是否有明确、可观察的功能，
                输入框是否「输入即反馈」，失败是否「有反馈、不静默」
  C. 元素清单：自动枚举 DOM 里全部交互元素 → 统计覆盖率，未覆盖的给出原因

输出：
  output/pm_audit/audit.json   原始数据（供报告生成）
  控制台问题清单

安全策略：
  - 不点真实副作用按钮：确认推送 / 保存配置 / 测试连接 / 保存 Pexels key
  - 账号建/删走 UI，测试前快照 data/*.json，退出时（含崩溃）还原
运行：python tests/test_headed_pm_audit.py
"""
import atexit
import json
import os
import pathlib
import socket
import subprocess
import sys
import time
import urllib.request

from playwright.sync_api import sync_playwright

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
sys.path.insert(0, ROOT)
from core.browser_utils import launch_browser  # noqa: E402  浏览器回退链单真源

try:
    if (sys.stdout.encoding or "").lower() not in ("utf-8", "utf8"):
        sys.stdout.reconfigure(encoding="utf-8", errors="replace")
        sys.stderr.reconfigure(encoding="utf-8", errors="replace")
except Exception:
    pass

PY = sys.executable
BASE = "http://127.0.0.1:5000"
DATA_DIR = pathlib.Path(ROOT) / "data"
OUT_DIR = pathlib.Path(ROOT) / "output" / "pm_audit"

_DATA_SNAPSHOT = {p.name: p.read_text(encoding="utf-8") for p in DATA_DIR.glob("*.json")}


def _restore_data():
    for f in DATA_DIR.glob("*.json"):
        if f.name in _DATA_SNAPSHOT:
            f.write_text(_DATA_SNAPSHOT[f.name], encoding="utf-8")
        else:
            f.unlink(missing_ok=True)


atexit.register(_restore_data)

# ── 结果收集 ──────────────────────────────────────────────────────────────
checks = []      # 断言型：{id, area, name, ok, detail}
findings = []    # 问题型：{id, area, name, sev, evidence, fix}
console_errors = []
timings = {}
inventory = []   # DOM 元素清单
covered = set()  # 已被审计覆盖的元素 key


def chk(cid, area, name, ok, detail=""):
    checks.append({"id": cid, "area": area, "name": name, "ok": bool(ok), "detail": detail})
    print(f"[{'PASS' if ok else 'FAIL'}] {cid} {name}" + (f" — {detail}" if detail else ""))


def find(fid, area, name, sev, evidence, fix):
    """记录问题：sev 高/中/低"""
    findings.append({"id": fid, "area": area, "name": name, "sev": sev,
                     "evidence": evidence, "fix": fix})
    print(f"[ISSUE-{sev}] {fid} {name} — {evidence}")


def cov(*keys):
    """登记已覆盖元素；把 '#id' 与 '.class' 拆成可比较的 key"""
    import re as _re
    for k in keys:
        k = (k or "").strip()
        m = _re.search(r"#([\w-]+)", k)
        if m:
            covered.add("#" + m.group(1))
        for c in _re.findall(r"\.([\w-]+)", k):
            covered.add("." + c)


SKIPPED = []      # 刻意不点的元素及原因
UNCOVERED = []    # 可见但本轮未验证到的元素
EXPECTED_ERR_FROM = None   # 故障注入产生的那批控制台报错起始下标（属预期）


def skip(selector, why):
    SKIPPED.append({"selector": selector, "why": why})


# ── 浏览器侧探针 ──────────────────────────────────────────────────────────
PROBE = """() => {
  const f = document.getElementById('preview-frame');
  const d = f && f.contentDocument;
  const html = d && d.documentElement ? d.documentElement.innerHTML : '';
  const cnt = re => (html.match(re) || []).length;
  const hs = [...(d ? d.querySelectorAll('h1,h2,h3,h4') : [])].slice(0, 8)
      .map(h => ({tag: h.tagName.toLowerCase(), size: parseFloat(getComputedStyle(h).fontSize)}));
  return {
    html,
    // 代码块/列表里用了 &nbsp;，统一成普通空格再比对，避免假失败
    text: (d && d.body ? d.body.innerText : '').replace(/\\u00a0/g, ' '),
    h1: cnt(/<h1[\\s>]/g), h2: cnt(/<h2[\\s>]/g), h3: cnt(/<h3[\\s>]/g),
    bullet: cnt(/•/g), blockquote: cnt(/<blockquote[\\s>]/g),
    pre: cnt(/<pre[\\s>]/g), table: cnt(/<table[\\s>]/g),
    headings: hs,
  };
}"""


def probe(page):
    return page.evaluate(PROBE)


def chips(page):
    return page.evaluate("() => (document.getElementById('parse-chips')||{}).innerText || ''")


def toast(page):
    return page.evaluate("() => (document.getElementById('toast-el')||{}).innerText || ''")


def reload_text(page, text, marker=None, timeout=20000):
    """填输入框 → 等预览真的渲染出 marker → 返回 {probe, chips, ms}"""
    t0 = time.time()
    page.fill("#input-area", text)
    if marker:
        try:
            page.wait_for_function("""(m) => {
                const d = document.getElementById('preview-frame').contentDocument;
                return !!(d && d.body && d.body.innerText.includes(m));
            }""", arg=marker, timeout=timeout)
        except Exception:
            pass
    page.wait_for_timeout(700)
    return {"ms": int((time.time() - t0) * 1000), "p": probe(page), "chips": chips(page)}


# ── 00 场景语料（16 类真实输入）─────────────────────────────────────────
# want: 计数字段下限；want_text/forbid_text: 预览可见文本；want_chips: 识别结构条
CORPUS = [
    dict(id="C01", name="短标题 + 短正文（最常见的粘贴场景）",
         text="我的做法\n\n第一段正文，讲一些背景信息，用来描述背景。\n\n接下来是细节。\n\n最后收个尾。",
         want={"h1": 1}, want_text=["我的做法"], want_chips=["大标题"], forbid_text=[]),
    dict(id="C02", name="真实 TXT 粘贴（无空行、连续短行标题）",
         text="测试文档多风格纯文本转换源文件\n第一部分标准化商业报告风格测试\n"
              "2023年度第四季度运营总结报告\n本报告旨在总结第四季度各部门的关键绩效指标，并规划下一阶段的工作重点。",
         want={"h1": 1, "h2": 1}, want_text=["本报告旨在总结"], want_chips=["大标题"], forbid_text=[]),
    dict(id="C03", name="中文编号小节（一、二、三）",
         text="一、项目背景\n\n这是介绍性文字，说明为什么做这件事。\n\n二、具体做法\n\n第一件事这样办。\n\n三、结论\n\n就到这里。",
         want={"h1": 1, "h2": 2}, want_text=["项目背景"], want_chips=["大标题", "小节"], forbid_text=[]),
    dict(id="C04", name="长散文（首句是完整句子 → 按约定不作标题）",
         text="今天我想聊聊一个很多人都忽略的问题。其实真正重要的是坚持做对的事，而不是追风口。\n\n"
              "我们身边有太多人一开始热情满满，报班买书定计划，但坚持不到一个月就放弃。\n\n"
              "核心观点：做减法比做加法更重要。\n\n很多人喜欢囤积功能和信息，结果反而更焦虑。\n\n"
              "实践建议：每天只挑一件最重要的事做完。\n\n坚持下去你会看到复利效应。",
         want={"h1": 0}, want_text=["做减法比做加法更重要"], want_chips=[], forbid_text=[]),
    dict(id="C05", name="标签 + 步骤（准备工作/首先/然后）",
         text="准备工作\n\n首先，安装好环境。\n\n然后，打开工具。\n\n注意事项\n\n不要频繁切换账号。",
         want={"h1": 1, "h2": 1, "bullet": 2}, want_text=["安装好环境"], want_chips=["大标题", "列表"], forbid_text=[]),
    dict(id="C06", name="提示语 + 命令行（引用块 + 代码块）",
         text="注意：数据已审计。\n\n请执行以下命令：\n\ngit clone https://example.com/a.git\ncd a\nnpm install",
         want={"h1": 0, "blockquote": 1, "pre": 1}, want_text=["数据已审计", "npm install"],
         want_chips=["引用"], forbid_text=[]),
    dict(id="C07", name="Python 代码块（缩进 + f-string，校验无高亮残渣）",
         text="Python 小抄\n\n```python\nimport os\n\ndef main():\n    name = '苏哥'\n"
              "    print(f\"hello {name}\")\n    return name\n```",
         want={"h1": 1, "pre": 1}, want_text=["print(f", "hello {name}"],
         want_chips=["大标题"], forbid_text=['color:#', 'language-python', 'class=']),
    dict(id="C08", name="引号引用 + 箭头并列",
         text="「真正的自由是什么？」\n\n掏手机 → 找 App → 点开门\n\n就这样。",
         want={"blockquote": 1, "bullet": 3}, want_text=["真正的自由"], want_chips=["引用", "列表"], forbid_text=[]),
    dict(id="C09", name="用户手写 Markdown（尊重作者显式层级）",
         text="## 保留标题\n\n- 列表项\n\n> 引用文本",
         want={"h1": 0, "h2": 1, "bullet": 1, "blockquote": 1}, want_text=["保留标题"],
         want_chips=[], forbid_text=[]),
    dict(id="C10", name="Markdown 表格",
         text="数据对比\n\n| 方案 | 成本 |\n| --- | --- |\n| A | 低 |\n| B | 高 |",
         want={"h1": 1, "table": 1}, want_text=["方案"], want_chips=["大标题"], forbid_text=[]),
    dict(id="C11", name="联系信息（标签：值 → 不应被当成文章大标题）",
         text="联系部门：公关部\n联系电话：400-XXX-XXXX\n发布日期：2023年10月27日",
         want={"h1": 0}, want_text=["联系部门：公关部"], want_chips=[], forbid_text=[]),
    dict(id="C12", name="中英混排 + emoji + 列表",
         text="Copywriting 与文案 🎉\n\nEmoji 与中文混排的排版测试，确认不会乱码。\n\n- 要点 A ✅\n- 要点 B 🚀",
         want={"h1": 1, "bullet": 2}, want_text=["要点 A"], want_chips=["大标题", "列表"], forbid_text=[]),
    dict(id="C13", name="装饰标题（==== 第一章 ====）",
         text="==== 第一章 概述 ====\n\n这是正文段落。\n\n==== 第二章 方法 ====\n\n方法说明文字。",
         want={"h1": 1, "h2": 1}, want_text=["概述"], want_chips=["大标题"], forbid_text=[]),
    dict(id="C14", name="超长文（约 3000 字，性能）",
         text=("\n\n".join([f"第{i}部分 分节标题\n\n这一节用来描述一些背景信息与具体做法，"
                            f"句子长度大约在三十到四十个字之间，用来模拟真实长文的内容密度。" * 3
                            for i in range(1, 13)] + ["结语\n\n以上就是全部内容。"])),
         want={"h1": 1, "h2": 5}, want_text=["以上就是全部内容"], want_chips=["大标题"], forbid_text=[]),
    dict(id="C15", name="纯空白/单个字（边界）",
         text="周一\n\n雨。",
         want={"h1": 1}, want_text=["周一"], want_chips=["大标题"], forbid_text=[]),
    dict(id="C16", name="纯列表粘贴（无标题）",
         text="- 第一件事\n- 第二件事\n- 第三件事",
         want={"h1": 0, "bullet": 3}, want_text=["第一件事"], want_chips=["列表"], forbid_text=[]),
]


def run():
    OUT_DIR.mkdir(parents=True, exist_ok=True)
    if _port_busy():
        print("[ABORT] 端口 5000 已被占用（可能是你自己的 app.py 在运行）。请先停掉再跑本套件。")
        return 2
    proc = subprocess.Popen([PY, "app.py"], cwd=ROOT)
    try:
        if not wait_server():
            chk("S00", "环境", "服务启动并监听 5000", False, "端口未在超时内就绪")
            return 1
        chk("S00", "环境", "服务启动并监听 5000", True)

        with sync_playwright() as p:
            browser = launch_browser(p, headless=False, slow_mo=60,
                                     args=["--disable-dev-shm-usage"])
            ctx = browser.new_context(viewport={"width": 1440, "height": 900})
            ctx.grant_permissions(["clipboard-read", "clipboard-write"], origin=BASE)
            page = ctx.new_page()
            page.on("console", lambda m: console_errors.append(f"{m.type}: {m.text}")
                    if m.type == "error" else None)
            page.on("pageerror", lambda e: console_errors.append(f"PAGEERROR: {e}"))

            # 记录 /api/render 请求体 —— 用于验证「开关类控件是否真的影响渲染」
            render_bodies = []
            page.on("request", lambda r: render_bodies.append(_body(r))
                    if r.method == "POST" and r.url.endswith("/api/render") else None)

            page.goto(BASE, wait_until="networkidle", timeout=30000)
            chk("S01", "环境", "首页加载 / 公众号页可见", page.is_visible("#page-wechat", timeout=10000))
            close_modals(page)

            part_corpus(page)
            part_wechat(page, render_bodies, ctx)
            for fn in (part_social, part_inventory, part_hierarchy):
                try:
                    fn(page, ctx) if fn is part_hierarchy else fn(page)
                except Exception as e:  # 单段失败不拖垮整轮审计
                    chk(f"X-{fn.__name__}", "环境", f"{fn.__name__} 执行异常", False, str(e)[:200])
                    try:
                        close_modals(page)
                        page.keyboard.press("Escape")
                    except Exception:
                        pass

            page.screenshot(path=str(OUT_DIR / "audit_last.png"))
            browser.close()
    finally:
        try:
            subprocess.run(["taskkill", "/PID", str(proc.pid), "/T", "/F"], capture_output=True)
            proc.wait(timeout=5)
        except Exception:
            try:
                proc.kill()
            except Exception:
                pass

    # 退出码 1 = 有失败检查或真实控制台报错（这是审计套件，发现问题就是它的产出）
    return summary(render_bodies)


# ── A. 场景语料 ──────────────────────────────────────────────────────────
def part_corpus(page):
    print("\n" + "=" * 60 + "\nA. 场景语料：真实输入 → 识别结果\n" + "=" * 60)
    for c in CORPUS:
        marker = c["want_text"][0] if c["want_text"] else None
        r = reload_text(page, c["text"], marker)
        p, cp = r["p"], r["chips"]
        bad = []
        for k, v in c["want"].items():
            if p.get(k, 0) < v:
                bad.append(f"{k}={p.get(k,0)}<{v}")
        for t in c["want_text"]:
            if t not in p["text"]:
                bad.append(f"预览缺「{t}」")
        for t in c["forbid_text"]:
            # 只看「可见文本」——样式属性里的 color:# 是正常高亮，不算残渣
            if t in p["text"]:
                bad.append(f"出现残渣「{t}」")
        for t in c["want_chips"]:
            if t not in cp:
                bad.append(f"识别条缺「{t}」")
        chk(c["id"], "场景", c["name"], not bad,
            f"{r['ms']}ms；h1={p['h1']} h2={p['h2']} 列表项={p['bullet']} 引用={p['blockquote']} "
            f"代码={p['pre']} 表格={p['table']}；识别条=[{cp}]"
            + (f"｜不符：{'; '.join(bad)}" if bad else ""))
        if bad:
            find(c["id"] + "-F", "场景", f"{c['name']} 识别不符预期", "中",
                 f"不符项：{'; '.join(bad)}；识别条=[{cp}]",
                 f"检查 core/preprocessor.py 对「{c['name']}」的规则")
        if r["ms"] > 3000:
            find(c["id"] + "-P", "场景", f"{c['name']} 渲染耗时偏高", "低",
                 f"{r['ms']}ms（含 400ms 前端防抖 + 网络往返）",
                 "长文可考虑把 /api/render 的预处理下沉或加缓存")
    timings["corpus_total_ms"] = sum(1 for _ in CORPUS)
    cov("#input-area")


# ── B. 公众号页逐项交互 ───────────────────────────────────────────────────
def part_wechat(page, render_bodies, ctx):
    print("\n" + "=" * 60 + "\nB. 公众号页：逐按钮 / 逐输入反馈\n" + "=" * 60)
    A = "公众号页"

    # B01 看示例（按钮是双态：空 → 填示例；有内容 → 清空，见 B02B）
    page.fill("#input-area", "")
    page.wait_for_timeout(600)
    page.click("#btn-demo")
    page.wait_for_timeout(1600)
    dtext = page.evaluate("() => document.getElementById('btn-demo').innerText")
    dval = page.input_value("#input-area")
    pv = probe(page)
    chk("B01", A, "「看示例」在空编辑器时填入示例并渲染",
        len(dval) > 100 and pv["text"].strip() != "" and dtext.strip() == "清空",
        f"按钮文案={dtext!r} 编辑器={len(dval)}字 预览={len(pv['text'])}字")
    cov("#btn-demo")
    clear_toast(page)
    page.click("#btn-clear")
    page.wait_for_timeout(900)
    cleared = page.input_value("#input-area") == ""
    empty_state = page.evaluate(
        "() => { const e=document.getElementById('pv-empty-state');"
        "const f=document.getElementById('preview-frame');"
        "return {emptyVisible: e && e.style.display !== 'none',"
        " frameShown: f && f.style.display !== 'none', previewLen: "
        "((f.contentDocument&&f.contentDocument.body)?f.contentDocument.body.innerText.length:0)};}")
    chk("B02", A, "「清空」清掉编辑器并给提示",
        cleared and "已清空" in toast(page), f"toast={toast(page)[:24]!r}")
    cov("#btn-clear", "#toast-el")
    if cleared and not empty_state["emptyVisible"]:
        find("B02-F", A, "清空编辑器后预览区仍显示上一篇文章（空状态未恢复）", "中",
             f"编辑器已空，但 pv-empty-state 仍隐藏、预览 iframe 仍展示 {empty_state['previewLen']} 字旧内容",
             "在 inputArea 的 input 处理里：内容为空时恢复 #pv-empty-state、隐藏 #phone-shell，清空即回空态")

    # B02B 有用户内容时点「看示例」：会不会静默清掉用户自己写的东西
    page.fill("#input-area", "苏哥自己写的内容\n\n这是第二段，正在写。")
    page.wait_for_timeout(700)
    before_len = len(page.input_value("#input-area"))
    page.click("#btn-demo")
    page.wait_for_timeout(1200)
    after_val = page.input_value("#input-area")
    lbl = page.evaluate("() => document.getElementById('btn-demo').innerText")
    wiped = before_len > 10 and after_val.strip() == ""
    chk("B02B", A, "有用户内容时点「看示例」不会静默清空用户内容", not wiped,
        f"点击前 {before_len} 字 → 点击后 {len(after_val)} 字，按钮文案={lbl!r}")
    if wiped:
        find("B02B-F", A, "「看示例」会静默清空用户正在写的内容（无确认、无撤销）", "高",
             f"编辑器里有 {before_len} 字用户内容，点「看示例」后直接变 0 字，且按钮文案仍是「看示例」，"
             "用户会以为只是“看一下示例”",
             "编辑器非空时：① 先弹确认「这会清掉当前内容」；或 ② 直接插入示例并给 toast+撤销按钮（项目已有 undo 能力，"
             "见 toast(msg,{undo})），别静默丢内容")
    page.click("#btn-clear")
    page.wait_for_timeout(600)

    # B03 整理格式 → 去行首空白 + 已自动整理提示 + 识别条闪一下
    reload_text(page, "标题行\n\n   这一行前面有四个空格\n\n正文段落。", "标题行")
    before_fmt = page.input_value("#input-area")
    page.click("#btn-format")
    page.wait_for_timeout(800)
    after_fmt = page.input_value("#input-area")
    tidy = page.evaluate("() => document.getElementById('tidy-hint').classList.contains('show')")
    chk("B03", A, "「整理格式」真的改动编辑器并给出反馈",
        ("   这一行" in before_fmt) and ("   这一行" not in after_fmt) and tidy,
        f"缩进行首空白已清除={('   这一行' not in after_fmt)}；已自动整理提示={tidy}")
    cov("#btn-format", "#tidy-hint")

    # B04 插入模块 popover（10 项，插入后真的渲染成模块）
    page.click("#btn-insert")
    page.wait_for_timeout(400)
    pop_items = page.locator("#popover-insert .pop-item").count()
    pop_visible = page.evaluate("() => document.getElementById('popover-insert').classList.contains('show')")
    chk("B04", A, "「+ 插入」popover 展开且 10 个模块", pop_visible and pop_items == 10,
        f"可见={pop_visible} 模块数={pop_items}")
    cov("#btn-insert")
    page.click('.pop-item[data-mod="cards"]')
    page.wait_for_timeout(1300)
    p = probe(page)
    has_mod = 'data-container="cards"' in p["html"]
    chk("B05", A, "插入「卡片组」后预览真的渲染为模块", has_mod and "模块速览" in p["text"],
        f"容器存在={has_mod}；正文含卡片文案={'模块速览' in p['text']}")
    cov('.pop-item[data-mod="cards"]')
    if not has_mod:
        find("B05-F", A, "插入的 :::cards 围栏未渲染成卡片容器", "高",
             f"预览 HTML 无 data-container=\"cards\"；预览文本={p['text'][:60]!r}",
             "核对 format_engine.process_fenced_containers 与插入模板的围栏语法是否一致")

    # B06 智能转换开关：2026-10-18 已按审计建议下线（假控件不该存在）
    sw_present = page.locator("#sw-chip").count()
    chk("B06", A, "「智能转换」假开关已下线", sw_present == 0,
        f"#sw-chip 数量={sw_present}")
    if sw_present:
        find("B06-F", A, "「智能转换」开关仍在但没有实际功能", "高",
             "index.html 没有任何 paste 事件处理，/api/render 请求体也不带开关字段",
             "要么补齐 paste 转换（剪贴板 HTML → Markdown），要么把控件摘掉")

    # B08 模板筛选（tpl-search）+ 无结果时的「清除筛选」
    n_all = page.locator("#tpl-strip .tpl-card").count()
    page.fill("#tpl-search", "zzzz不存在")
    page.wait_for_timeout(500)
    n_none = page.locator("#tpl-strip .tpl-card").count()
    clear_btn = page.locator("#tpl-clear-search").count()
    if clear_btn:
        page.click("#tpl-clear-search")
        page.wait_for_timeout(500)
    cov("#tpl-search", "#tpl-clear-search")
    chk("B08", A, "「筛选风格」收敛 + 无结果时有「清除筛选」出口",
        n_all > 0 and n_none == 0 and clear_btn == 1 and
        page.locator("#tpl-strip .tpl-card").count() == n_all,
        f"全部={n_all} 不匹配={n_none} 清除按钮={clear_btn}")

    # B09 风格条收起/展开
    b = page.evaluate("() => document.getElementById('style-bar').classList.contains('collapsed')")
    page.click("#tpl-toggle")
    page.wait_for_timeout(300)
    a = page.evaluate("() => document.getElementById('style-bar').classList.contains('collapsed')")
    cov("#tpl-toggle")
    chk("B09", A, "「收起」切换风格条折叠态", b != a, f"{b} → {a}")
    if a:
        page.click("#tpl-toggle")
        page.wait_for_timeout(250)

    # B10 点风格卡切主题（最近使用胶囊）
    cards = page.locator("#tpl-strip .tpl-card")
    if cards.count() > 1:
        before_name = page.evaluate("() => document.getElementById('theme-name').innerText")
        cards.nth(1).click()
        page.wait_for_timeout(1400)
        after_name = page.evaluate("() => document.getElementById('theme-name').innerText")
        chk("B10", A, "点风格卡切换主题并重渲染", before_name != after_name and probe(page)["text"].strip() != "",
            f"{before_name!r} → {after_name!r}")
        cov("#tpl-strip .tpl-card", "#theme-name")
    else:
        chk("B10", A, "点风格卡切换主题并重渲染", False, "风格条卡片不足 2 张")

    # B11 收藏 ★（个人工具按使用频率置顶）
    fav_btn = page.locator("#tpl-strip .tpl-fav").first
    if fav_btn.count():
        t0 = fav_btn.inner_text()
        fav_btn.click()
        page.wait_for_timeout(500)
        t1 = page.locator("#tpl-strip .tpl-fav").first.inner_text()
        chk("B11", A, "收藏 ★ 有状态变化", t0 != t1, f"{t0!r} → {t1!r}")
        cov("#tpl-strip .tpl-fav")
    else:
        chk("B11", A, "收藏 ★ 有状态变化", False, "风格卡上没有收藏按钮")

    # B12 模板库抽屉（打开/搜索/族筛选/选卡/关闭）
    page.click("#btn-all-tpl")
    page.wait_for_timeout(700)
    drawn = page.evaluate("() => document.getElementById('drawer-tpl').classList.contains('open')")
    n_grid = page.locator("#drawer-grid .d-card").count()
    n_fam = page.locator("#family-chips .d-chip").count()
    cov("#btn-all-tpl", "#drawer-tpl")
    chk("B12", A, "「全部 N 套」打开模板库抽屉", drawn and n_grid > 0,
        f"抽屉可见={drawn} 卡片={n_grid} 族筛选={n_fam}")
    if n_fam >= 4:
        labels = page.evaluate(
            "() => [...document.querySelectorAll('#family-chips .d-chip')].map(b => b.innerText.trim())")
        page.locator("#family-chips .d-chip").nth(3).click()
        page.wait_for_timeout(700)
        n_g1 = page.locator("#drawer-grid .d-card").count()
        chk("B13", A, "族筛选 chip 生效", 0 < n_g1 < n_grid,
            f"全族={n_grid} → 第 4 个 chip（{labels[3] if len(labels) > 3 else '?'}）={n_g1}；chips={labels}")
        cov("#family-chips .d-chip")
        if not (0 < n_g1 < n_grid):
            find("B13-F", A, "族筛选 chip 没有收敛卡片", "中",
                 f"chip={labels[3] if len(labels) > 3 else '?'} 结果={n_g1} 张 / 全族 {n_grid} 张",
                 "核对 FAMILY_LIST 的族名与实际主题 name 前缀是否一致")
    else:
        chk("B13", A, "族筛选 chip 生效", False, f"族 chip 只有 {n_fam} 个")
    if n_fam:
        page.locator("#family-chips .d-chip").nth(0).click()
        page.wait_for_timeout(600)
    dname = page.evaluate(
        "() => { const c = document.querySelector('#drawer-grid .d-card .d-name'); return c ? c.innerText.trim() : ''; }")
    kw2 = (dname.split("·")[0][:2] or "a")
    page.fill("#drawer-search", kw2)
    page.wait_for_timeout(700)
    n_kw = page.locator("#drawer-grid .d-card").count()
    cov("#drawer-search")
    chk("B14", A, "抽屉搜索按关键词收敛", 0 < n_kw < n_grid,
        f"用真实存在的名字片段 {kw2!r}（取自首卡 {dname!r}）搜索 → {n_kw} 张（全族 {n_grid} 张）")
    if not (0 < n_kw < n_grid):
        find("B14-F", A, "抽屉搜索（族名/色名）没有生效或关键词不匹配", "中",
             f"搜索 {kw2!r} 结果 {n_kw} 张，全族 {n_grid} 张",
             "核对 renderDrawerGrid 的过滤字段（应覆盖 name/id/group）与占位文案承诺的「族名或色名」是否一致")
    if n_kw:
        page.locator("#drawer-grid .d-card").first.click()
        page.wait_for_timeout(1500)
        closed = not page.evaluate("() => document.getElementById('drawer-tpl').classList.contains('open')")
        nm = page.evaluate("() => document.getElementById('theme-name').innerText")
        hp = probe(page)
        chk("B15", A, "抽屉选卡：应用主题并关闭抽屉",
            closed and hp["h1"] >= 1 and len(hp["text"]) > 0, f"关闭={closed} 当前主题={nm!r} h1={hp['h1']}")
        cov("#drawer-grid .d-card")
        if not closed:
            find("B15-F", A, "抽屉里选完主题后抽屉没有自动关闭，用户看不到刚套用的效果", "中",
                 f"选中后 drawer 仍为 open；当前主题={nm!r}",
                 "卡片回调里补 closeDrawer()（一次点击应完成「选主题」这件事，选完要能立刻看到预览）")
    else:
        chk("B15", A, "抽屉选卡：应用主题并关闭抽屉", False, "搜索后无卡片")
    page.keyboard.press("Escape")
    page.wait_for_timeout(300)

    # B16 预览模式切换（网页 HTML / 手机预览）
    page.click('.pv-btn[data-preview="html"]')
    page.wait_for_timeout(400)
    cls_html = page.evaluate("() => document.getElementById('pv-content').classList.contains('phone-frame')")
    act_html = page.evaluate("() => document.querySelector('.pv-btn[data-preview=\"html\"]').classList.contains('active')")
    page.click('.pv-btn[data-preview="phone"]')
    page.wait_for_timeout(400)
    cls_phone = page.evaluate("() => document.getElementById('pv-content').classList.contains('phone-frame')")
    cov('.pv-btn[data-preview="html"]', '.pv-btn[data-preview="phone"]', "#pv-content")
    chk("B16", A, "预览模式切换（HTML ⇄ 手机）真的换布局", act_html and (not cls_html) and cls_phone,
        f"html 激活={act_html} phone-frame(HTML)={cls_html} phone-frame(手机)={cls_phone}")

    # B17 主题胶囊按钮（打开抽屉）
    page.click("#theme-chip")
    page.wait_for_timeout(600)
    chk("B17", A, "主题胶囊「当前风格」点击打开模板库",
        page.evaluate("() => document.getElementById('drawer-tpl').classList.contains('open')"))
    cov("#theme-chip")
    page.click("#drawer-close")
    page.wait_for_timeout(400)
    chk("B18", A, "抽屉「×」可关闭", not page.evaluate(
        "() => document.getElementById('drawer-tpl').classList.contains('open')"))
    cov("#drawer-close")
    page.click("#theme-chip")
    page.wait_for_timeout(600)
    page.click("#drawer-mask")
    page.wait_for_timeout(400)
    chk("B19", A, "点遮罩可关闭抽屉", not page.evaluate(
        "() => document.getElementById('drawer-tpl').classList.contains('open')"))
    cov("#drawer-mask")

    # B20 教程（顶栏）
    page.click("#btn-tutorial")
    page.wait_for_timeout(700)
    has_tut = page.locator(".modal.tutorial-modal").count() > 0
    chk("B20", A, "顶栏「教程」弹出使用教程", has_tut)
    cov("#btn-tutorial")
    close_modals(page)

    # B21 设置弹窗 + 内部控件（不点真实副作用按钮）
    page.click("#btn-settings")
    page.wait_for_timeout(900)
    smod = page.locator(".modal").count() > 0
    inner = page.evaluate("""() => ({
        platform: !!document.getElementById('ai-platform'),
        key: !!document.getElementById('ai-api-key'),
        model: !!document.getElementById('ai-model'),
        pexels: !!document.getElementById('pexels-key'),
        pexelsStatus: (document.getElementById('pexels-status')||{}).innerText || '',
    })""")
    chk("B21", A, "「设置」弹窗打开且 AI 配置项齐全", smod and all(
        [inner["platform"], inner["key"], inner["model"], inner["pexels"]]), str(inner)[:150])
    cov("#btn-settings", "#ai-platform", "#ai-api-key", "#ai-model", "#pexels-key")
    # 2026-10-18：这一项是「通过项」，不该算成问题（原报告把它记成低危，虚增问题数）
    chk("B21b", A, "Pexels 状态文案如实区分已配置/未配置",
        "已配置" in inner["pexelsStatus"] or "未配置" in inner["pexelsStatus"],
        inner["pexelsStatus"][:60])
    close_modals(page)

    # B22 输入即反馈：字数/结构统计
    reload_text(page, "标题甲\n\n正文一。\n\n- 项 A\n- 项 B", "标题甲")
    fc = page.evaluate("() => document.getElementById('foot-count').innerText")
    fs = page.evaluate("() => document.getElementById('foot-status').innerText")
    chk("B22", A, "输入即反馈：底栏字数/结构 + 已保存状态", len(fc.strip()) > 0 and len(fs.strip()) > 0,
        f"foot-count={fc!r} foot-status={fs!r}")
    cov("#foot-count", "#foot-status")

    # B23 AI 面板展开
    page.click("#ai-toggle")
    page.wait_for_timeout(400)
    chk("B23", A, "「AI 工具」展开面板", page.evaluate(
        "() => document.getElementById('ai-panel').classList.contains('open')"))
    cov("#ai-toggle", "#ai-panel")

    # B24 AI 智能排版（真实产出或真报错，不静默）
    clear_toast(page)
    before = page.input_value("#input-area")
    page.click("#btn-ai-format")
    try:
        page.wait_for_function("""() => {
            const t = (document.getElementById('toast-el')||{}).textContent || '';
            return t.indexOf('排版完成') >= 0 || t.indexOf('本地规则排版') >= 0
                || t.indexOf('排版失败') >= 0;
        }""", timeout=60000)
    except Exception:
        pass
    t_ai = toast(page)
    after = page.input_value("#input-area")
    done = ("排版完成" in t_ai) or ("本地规则排版" in t_ai) or ("排版失败" in t_ai)
    ok_ai = done and (("失败" in t_ai) or (after.strip() != before.strip()))
    chk("B24", A, "「AI 智能排版」给出真实结果或真实报错", ok_ai,
        f"toast={t_ai[:40]!r}；{len(before)}→{len(after)} 字；已结束={done}")
    cov("#btn-ai-format")
    if not done:
        find("B24-F", A, "AI 智能排版 60s 内没有结束（只有「AI 排版中…」提示）", "中",
             f"toast 一直停在 {t_ai[:40]!r}；编辑器内容未变",
             "① 给这个等待加超时与失败兜底（超时后回退本地规则并说明原因，与降级契约一致）；"
             "② 或把结果做成后台任务 + 轮询，避免用户面对无上限的等待")
    elif "失败" in t_ai:
        find("B24-I", A, "AI 智能排版走了失败路径", "低",
             f"toast={t_ai[:60]!r}（上游 LLM 不可达时属预期，本地兜底也应有结果）",
             "确认上游 LLM 配置；本地兜底路径应仍返回排版结果（engine=local）")

    # B25 AI 润色（开模态 → 开始 → 结果/复位 → 应用到编辑区）
    page.click("#btn-polish")
    try:
        page.wait_for_selector("#polish-start", timeout=6000)
        page.click("#polish-start")
        try:
            page.wait_for_function("""() => {
                const a = document.getElementById('polish-apply');
                const s = document.getElementById('polish-start');
                return (a && a.style.display !== 'none') || (s && !s.disabled);
            }""", timeout=45000)
        except Exception:
            pass
        st = page.evaluate("""() => {
            const b = document.getElementById('polish-apply');
            const s = document.getElementById('polish-start');
            const r = document.getElementById('polish-result');
            return {visible: !!b && b.style.display !== 'none',
                    text: (r && r.value) || '', reset: !!s && !s.disabled};
        }""")
        if st["visible"] and st["text"].strip():
            page.click("#polish-apply")
            page.wait_for_timeout(500)
            chk("B25", A, "「AI 润色」出结果并「应用到编辑区」生效",
                page.input_value("#input-area").strip() == st["text"].strip())
        else:
            chk("B25", A, "「AI 润色」失败时按钮复位（不静默、不卡死）", st["reset"],
                f"结果空={not st['text'].strip()} 按钮已复位={st['reset']}")
            find("B25-I", A, "AI 润色未产出结果（上游不可达）", "低",
                 "模态打开、按钮复位、无未捕获异常 → 属降级路径",
                 "确认上游 LLM 可用；若长期不可用，考虑在模态里直接给出原因文案")
        cov("#btn-polish", "#polish-start", "#polish-apply")
    except Exception as e:
        chk("B25", A, "「AI 润色」模态可触发", False, str(e)[:120])
    close_modals(page)

    # B26 复制（富文本硬验证）+ 空内容时的反馈
    page.evaluate("""
    window.__clip = {write:false, types:[], exec:false};
    try {
      const _w = navigator.clipboard.write.bind(navigator.clipboard);
      navigator.clipboard.write = async function(items){
        window.__clip.write = true;
        for (const it of items){ try { window.__clip.types.push(it.types||[]); } catch(e){} }
        return _w(items);
      };
    } catch(e){}
    const _e = document.execCommand.bind(document);
    document.execCommand = function(c){ if(c==='copy') window.__clip.exec = true; return _e(c); };
    """)
    page.click("#btn-copy")
    page.wait_for_timeout(900)
    pr = page.evaluate("() => window.__clip")
    flat = [t for g in pr.get("types", []) for t in g]
    ok_copy = pr.get("write") and "text/html" in flat
    chk("B26", A, "「复制」写入 text/html 富文本（公众号可直接渲染）", ok_copy,
        f"clipboard.write={pr.get('write')} MIME={flat} execCommand={pr.get('exec')}")
    cov("#btn-copy")
    if not ok_copy:
        find("B26-F", A, "复制按钮没有写出富文本剪贴板", "高",
             f"write={pr.get('write')} MIME={flat}",
             "检查 copyRich 实现与安全上下文；非安全上下文应走 execCommand 兜底或弹手动指引")
    # 空内容时的复制行为：按钮应处于禁用态（明确的「不可用」反馈）
    page.fill("#input-area", "")
    page.wait_for_timeout(900)
    cov("#dialog-copy", "#dialog-copy-close", "#dialog-copy-ok", "#dialog-copy-html")
    disabled_now = page.evaluate("() => document.getElementById('btn-copy').disabled")
    chk("B27", A, "空内容时「复制」按钮自动禁用（不会静默无反应）", disabled_now,
        f"disabled={disabled_now}")
    if not disabled_now:
        page.click("#btn-copy")
        page.wait_for_timeout(700)
        t_empty = toast(page)
        dlg_empty = page.locator("#dialog-copy").count()
        chk("B27b", A, "空内容点「复制」有明确反馈", len(t_empty.strip()) > 0 or dlg_empty > 0,
            f"toast={t_empty[:30]!r} 手动指引浮层={dlg_empty}")
        if not (len(t_empty.strip()) > 0 or dlg_empty > 0):
            find("B27-F", A, "空内容点复制毫无反馈", "中",
                 "编辑器为空时点复制：既无 toast 也无手动指引浮层，用户不知道发生了什么",
                 "复制入口先判空并 toast「还没有内容可复制」，或直接禁用按钮")
    close_modals(page)
    page.keyboard.press("Escape")

    # B28 历史
    reload_text(page, "历史测试标题\n\n正文。", "历史测试标题")
    page.click("#btn-history")
    page.wait_for_timeout(800)
    page.wait_for_timeout(200)
    hm = page.locator(".modal").count()
    chk("B28", A, "「历史」弹出历史记录", hm > 0, f"modal={hm}")
    cov("#btn-history")
    close_modals(page)

    # B29 推送（未绑定 → 引导；绑定临时账号 → 弹窗 + 标题带出）
    clear_toast(page)
    page.click("#btn-push")
    page.wait_for_timeout(1300)
    guided = ("绑定" in toast(page)) or (page.locator("#push-title").count() > 0)
    chk("B29", A, "「推送草稿箱」未绑定时给引导、已绑定时开弹窗", guided,
        f"toast={toast(page)[:30]!r}")
    cov("#btn-push")
    close_modals(page)

    tag = str(int(time.time()))
    nick = f"审计临时账号{tag}"
    page.evaluate("() => openAccountModal()")
    page.wait_for_timeout(1000)
    if page.locator("#acct-nickname").count():
        page.fill("#acct-nickname", nick)
        page.fill("#acct-appid", f"wx_audit_{tag}")
        page.fill("#acct-appsecret", "audit_temp_secret_0000000000")
        cov("#acct-nickname", "#acct-appid", "#acct-appsecret")
        page.click('button.primary:has-text("添加")')
        page.wait_for_timeout(1400)
        added = page.locator("#acct-list > div", has_text=nick).count() == 1
        chk("B30", A, "账号管理：UI 新增账号成功", added)
        cov("#acct-list", 'button.primary:has-text("添加")')
        if not added:
            find("B30-F", A, "账号弹窗里新增账号没有落到列表", "高",
                 "填了名称/AppID/AppSecret 后点「添加」，列表里找不到该账号",
                 "检查 addAccount 的必填校验与写入链路")
        close_modals(page)
        page.click("#btn-push")
        try:
            page.wait_for_selector("#push-title", timeout=6000)
            title_val = page.input_value("#push-title")
            acct_opts = page.evaluate("() => (document.getElementById('push-account')||{}).options ? document.getElementById('push-account').options.length : 0")
            cov("#push-title", "#push-summary", "#push-account")
            chk("B31", A, "推送弹窗打开且标题自动带出", bool(title_val.strip()),
                f"标题={title_val!r} 账号下拉={acct_opts} 项")
            if not title_val.strip():
                find("B31-F", A, "推送弹窗文章标题没有自动带出", "中",
                     "extractTitle 未能从当前内容取出标题",
                     "extractTitle 取 #/## 行或首行，确认对新预处理输出（首行已是 #）仍可靠")
            # 账号管理里删除临时账号（自清理）
            page.click('button:has-text("管理")')
            page.wait_for_timeout(900)
            rows = page.locator("#acct-list > div", has_text=nick)
            if rows.count():
                rows.first.locator("button").first.click()
                page.wait_for_timeout(1300)
                chk("B32", A, "账号管理：UI 删除账号成功（自清理）",
                    page.locator("#acct-list > div", has_text=nick).count() == 0)
            else:
                chk("B32", A, "账号管理：UI 删除账号成功（自清理）", False, "列表未见临时账号")
        except Exception as e:
            chk("B31", A, "推送弹窗打开且标题自动带出", False, str(e)[:120])
    close_modals(page)

    # B33 顶栏两个 tab 切换
    page.click('.tab-btn[data-page="social"]')
    page.wait_for_timeout(600)
    close_modals(page)
    s_ok = page.evaluate("() => document.getElementById('page-social').classList.contains('active')")
    page.click('.tab-btn[data-page="wechat"]')
    page.wait_for_timeout(600)
    w_ok = page.evaluate("() => document.getElementById('page-wechat').classList.contains('active')")
    cov('.tab-btn[data-page="social"]', '.tab-btn[data-page="wechat"]')
    chk("B33", A, "顶栏 tab 双向切换", s_ok and w_ok, f"social={s_ok} wechat={w_ok}")

    # B34 「导入文档」占位按钮：2026-10-18 已按审计建议下线
    page.fill("#input-area", "")
    page.wait_for_timeout(500)
    imp_present = page.locator("#btn-import").count()
    chk("B34", A, "「导入文档」占位按钮已下线", imp_present == 0,
        f"#btn-import 数量={imp_present}")
    if imp_present:
        find("B34-F", A, "「导入文档」是占位按钮：点了只提示「即将上线」", "中",
             "按钮 title 写的是「导入 .docx 文档」，但点击没有文件选择器",
             "① 真正实现 .docx 导入；② 或者先把这个按钮从界面摘掉")

    # B35 模板库星标收藏 + 「我的收藏」计数同步
    page.click("#btn-all-tpl")
    page.wait_for_timeout(700)
    page.fill("#drawer-search", "")
    page.wait_for_timeout(500)
    if page.locator("#drawer-grid .d-star").count():
        fav_id = page.evaluate("() => document.querySelector('#drawer-grid .d-star').dataset.fav")

        def star_state(tid):
            return page.evaluate(
                "(id) => { const b = document.querySelector('#drawer-grid .d-star[data-fav=\"' + id + '\"]');"
                "return b ? b.innerText.trim() : '?'; }", tid)

        def fav_count():
            return page.evaluate(
                "() => { const b=[...document.querySelectorAll('#family-chips .d-chip')]"
                ".find(x => x.dataset.group === 'fav'); return b ? b.innerText.trim() : ''; }")

        s_before, fav_before = star_state(fav_id), fav_count()
        page.locator("#drawer-grid .d-star").first.click()
        page.wait_for_timeout(800)
        s_after, fav_after = star_state(fav_id), fav_count()
        chk("B35", A, "模板库星标可收藏/取消，且「我的收藏」计数同步",
            s_before != s_after and fav_before != fav_after,
            f"{fav_id}: {s_before}→{s_after}；我的收藏 {fav_before!r} → {fav_after!r}")
        cov(".d-star")
        if not (s_before != s_after and fav_before != fav_after):
            find("B35-F", A, "模板库星标收藏后状态/计数没同步", "中",
                 f"{fav_id} 点星前后 {s_before!r}→{s_after!r}，我的收藏计数 {fav_before!r} → {fav_after!r}",
                 "检查 toggleFav 与 renderFamilyChips 的调用链")
    else:
        chk("B35", A, "模板库星标可收藏且「我的收藏」计数同步", False, "抽屉里没有星标按钮")
    page.keyboard.press("Escape")
    page.wait_for_timeout(300)

    # B36 「识别结构」胶囊：长得像按钮，点了要有反应（否则是假可点）
    reload_text(page, "小标题甲\n\n正文内容。\n\n- 项一\n- 项二", "小标题甲")
    chip_probe = page.evaluate("""() => {
        const chips = [...document.querySelectorAll('#parse-chips .parse-chip')];
        if (!chips.length) return {n: 0};
        const cs = getComputedStyle(chips[0]);
        return {n: chips.length, tag: chips[0].tagName, cursor: cs.cursor,
                role: chips[0].getAttribute('role'), tabindex: chips[0].getAttribute('tabindex')};
    }""")
    chk("B36", A, "「识别结构」胶囊是纯展示（span，无手型光标）",
        chip_probe["n"] > 0 and chip_probe.get("tag") == "SPAN"
        and chip_probe.get("cursor") != "pointer"
        and not chip_probe.get("role") and not chip_probe.get("tabindex"),
        str(chip_probe))
    cov("#parse-chips")
    if chip_probe["n"] and chip_probe.get("tag") != "SPAN":
        find("B36-F", A, "「识别结构」胶囊仍是假可点", "低",
             f"{chip_probe['n']} 个 chip，tag={chip_probe.get('tag')} cursor={chip_probe.get('cursor')}",
             "改成 span，去掉 cursor:pointer 与 hover 边框，让它老实当纯展示标签")

    # B37 渲染失败链路：错误浮层出现 + 可关闭（故障注入：指向不存在的主题）
    global EXPECTED_ERR_FROM
    EXPECTED_ERR_FROM = len(console_errors)
    page.evaluate("() => { window.__prevTpl = activeTpl; activeTpl = '__audit_missing_theme__'; doRender(); }")
    page.wait_for_timeout(1500)
    err_show = page.evaluate("() => document.getElementById('dialog-error').classList.contains('show')")
    err_toast = toast(page)
    page.evaluate("() => { activeTpl = window.__prevTpl; }")
    page.click("#dialog-error-close")
    page.wait_for_timeout(400)
    err_closed = not page.evaluate("() => document.getElementById('dialog-error').classList.contains('show')")
    chk("B37", A, "渲染失败时给错误浮层 + 明确提示，且可关闭",
        err_show and err_closed and len(err_toast.strip()) > 0,
        f"浮层={err_show} 已关闭={err_closed} toast={err_toast[:40]!r}")
    cov("#dialog-error", "#dialog-error-retry", "#dialog-error-close")
    if not (err_show and err_closed):
        find("B37-F", A, "渲染失败时错误浮层没有正常出现/关闭", "中",
             f"浮层={err_show} 关闭后={err_closed}",
             "检查 doRender 的 catch 分支与 openDialog/closeDialog")
    reload_text(page, "恢复渲染\n\n正文。", "恢复渲染")

    # B38 设置弹窗「关闭」
    page.click("#btn-settings")
    page.wait_for_timeout(900)
    page.click('.modal .modal-actions button:has-text("关闭")')
    page.wait_for_timeout(600)
    chk("B38", A, "设置弹窗「关闭」能关掉弹窗", page.locator(".modal").count() == 0)
    cov("#btn-settings")
    skip("设置 → 测试连接 / 保存配置 / 保存 Pexels key", "会真的连上游、写 data/ai_config.json，副作用不可逆 —— 后端路径由 test_api_e2e 覆盖")
    skip("推送弹窗 → 确认推送", "会真的调微信公众号接口发草稿")
    skip("设置 → 没有 key？去免费申请（外链）", "会打开外部站点，不适合在自动审计里点")
    close_modals(page)


# ── C. 小红书页逐项交互 ───────────────────────────────────────────────────
def part_social(page):
    print("\n" + "=" * 60 + "\nC. 小红书页：逐按钮 / 逐输入反馈\n" + "=" * 60)
    A = "小红书页"
    page.click('.tab-btn[data-page="social"]')
    page.wait_for_timeout(700)
    close_modals(page)
    chk("D01", A, "切到小红书页", page.evaluate(
        "() => document.getElementById('page-social').classList.contains('active')"))
    cov('.plt-btn[data-platform="xhs"]', '.plt-btn[data-platform="wx"]')

    # D02 文案输入 + 字数统计 + 500 上限
    page.fill("#social-text", "周末去海边旅行放空，拍一组氛围感照片。")
    page.wait_for_timeout(400)
    c1 = page.evaluate("() => document.getElementById('social-char-count').innerText")
    page.fill("#social-text", "字" * 520)
    page.wait_for_timeout(400)
    c2 = page.evaluate("() => document.getElementById('social-char-count').innerText")
    val_len = len(page.input_value("#social-text"))
    c2_over = page.evaluate("() => document.getElementById('social-char-count').classList.contains('over')")
    # 2026-10-18 定论：不硬截断（硬截会吃用户文字），改为变红 + 明确提示
    chk("D02", A, "文案字数实时统计，超 500 字明确提示（不硬截断）",
        "/ 500" in c1 and val_len == 520 and c2_over,
        f"{c1!r} → {c2!r}；实际长度={val_len}；over={c2_over}")
    cov("#social-text", "#social-char-count")
    if not c2_over:
        find("D02-F", A, "文案超过 500 字没有任何提示", "低",
             f"输入 520 字，实际保留 {val_len} 字，计数={c2!r}，计数器未标红",
             "计数器加 .over 样式并在首次超限时 toast 提示；不要硬截断")

    # D03 平台切换（3:4 / 微信封面）
    page.fill("#social-text", "阳光星盘，精确计算出生时刻星盘。")
    page.wait_for_timeout(300)
    page.click('.plt-btn[data-platform="wx"]')
    page.wait_for_timeout(400)
    wx_on = page.evaluate("() => document.querySelector('.plt-btn[data-platform=\"wx\"]').classList.contains('active')")
    page.click('.plt-btn[data-platform="xhs"]')
    page.wait_for_timeout(400)
    xhs_on = page.evaluate("() => document.querySelector('.plt-btn[data-platform=\"xhs\"]').classList.contains('active')")
    chk("D03", A, "平台切换 3:4 ⇄ 微信封面 有激活态", wx_on and xhs_on, f"wx={wx_on} xhs={xhs_on}")

    # D04 引擎分组 + 风格卡 → 预览卡
    tabs = page.locator(".style-tab")
    n_tabs = tabs.count()
    tabs.nth(0).click()
    page.wait_for_selector("#social-tpl-grid .tpl-mini", timeout=8000)
    g0 = page.locator("#social-tpl-grid .tpl-mini").count()
    cov(".style-tab")
    chk("D04", A, "风格分组 tab 存在且切换后加载风格卡", n_tabs >= 1 and g0 > 0,
        f"tab 数={n_tabs} 第1组风格={g0}")
    if n_tabs >= 2:
        tabs.nth(1).click()
        page.wait_for_selector("#social-tpl-grid .tpl-mini", timeout=8000)
        chk("D05", A, "第 2 组风格卡加载", page.locator("#social-tpl-grid .tpl-mini").count() > 0)
        tabs.nth(0).click()
        page.wait_for_selector("#social-tpl-grid .tpl-mini", timeout=8000)
    else:
        chk("D05", A, "第 2 组风格卡加载", False, "只有 1 个分组 tab")
    page.locator("#social-tpl-grid .tpl-mini").first.click()
    page.wait_for_timeout(700)
    spv = page.evaluate("""() => {
        const c = document.getElementById('spv-card');
        return {vis: !!c && c.style.display !== 'none',
                tag: (document.getElementById('spv-tag')||{}).innerText || '',
                title: (document.getElementById('spv-title')||{}).innerText || ''};
    }""")
    cov("#social-tpl-grid .tpl-mini", "#spv-card", "#spv-tag", "#spv-title", "#spv-desc")
    chk("D06", A, "选风格 → 预览卡显示标签与标题", spv["vis"] and len(spv["title"].strip()) > 0,
        str(spv))

    # D07 本地底图上传槽（3 个比例槽，校验比例与缩略）
    slot_png = _make_png(OUT_DIR / "_slot_3x4.png", 540, 720)
    if slot_png:
        page.set_input_files('#img-slots .img-slot[data-ratio="xhs"] input[type=file]', str(slot_png))
        page.wait_for_timeout(900)
        has_img = page.evaluate(
            "() => document.querySelector('#img-slots .img-slot[data-ratio=\"xhs\"]').classList.contains('has-img')")
        cov('#img-slots .img-slot[data-ratio="xhs"] input[type=file]', "#img-slots")
        chk("D07", A, "上传 3:4 底图 → 槽位变已选态", has_img, f"has-img={has_img}")
        if not has_img:
            find("D07-F", A, "上传底图后槽位没有反馈", "中", "选了图片但 .img-slot 没有 has-img 类",
                 "检查 setupUploadSlots 的 change 处理与 socialUploads 写入")
    else:
        chk("D07", A, "上传 3:4 底图 → 槽位变已选态", False, "PIL 不可用，跳过")

    # D08 生成封面（真实渲染图 + 底图署名）
    r = page.evaluate("() => location.href")
    page.click("#btn-generate-cover")
    try:
        page.wait_for_selector("#results-list .result-card", timeout=90000)
        srcs = page.evaluate(
            "() => [...document.querySelectorAll('#results-list .result-card img')].map(i=>i.src)")
        real = 0
        for s in srcs:
            try:
                resp = urllib.request.urlopen(s, timeout=30)
                if resp.status == 200 and s.endswith(".png") and len(resp.read()) > 100:
                    real += 1
            except Exception:
                pass
        credit = page.evaluate("""() => {
            const c = document.getElementById('bg-credit');
            return (c && c.style.display !== 'none') ? c.innerText.trim() : '';
        }""")
        cov("#btn-generate-cover", "#results-list", "#bg-credit", "#results-empty")
        chk("D08", A, "「生成封面」出真实 PNG 结果卡", len(srcs) > 0 and real == len(srcs),
            f"卡片={len(srcs)} 真实图={real}")
        chk("D09", A, "底图署名如实（不写死「自动联网搜索」）",
            ("底图来源" in credit or "本地" in credit) and "自动联网搜索" not in credit,
            f"署名={credit[:70]!r}")
        if real != len(srcs):
            find("D08-F", A, "生成封面存在无效结果图", "高", f"{len(srcs) - real}/{len(srcs)} 张取不到真实字节",
                 "检查渲染产物写入 output/ 与 /output/ 静态路由")
    except Exception as e:
        chk("D08", A, "「生成封面」出真实 PNG 结果卡", False, str(e)[:140])
        find("D08-F", A, "生成封面没有产出结果卡", "高", str(e)[:140],
             "检查 /api/social/generate 三引擎与联网搜图链路")

    # D10 Lightbox 打开 / 关闭
    if page.locator("#results-list .result-card").count():
        page.locator("#results-list .result-card").first.click()
        page.wait_for_timeout(600)
        lb = page.evaluate("""() => {
            const l = document.getElementById('lightbox');
            const i = document.getElementById('lb-img');
            return {show: l.classList.contains('show'), w: i.naturalWidth, src: i.src};
        }""")
        cov("#lightbox", "#lb-img", "#lb-close")
        chk("D10", A, "点结果卡打开 Lightbox 且大图真实",
            lb["show"] and lb["w"] > 0 and "/output/" in lb["src"], str(lb)[:140])
        page.click("#lb-close")
        page.wait_for_timeout(400)
        chk("D11", A, "Lightbox 关闭按钮生效",
            not page.evaluate("() => document.getElementById('lightbox').classList.contains('show')"))
    else:
        chk("D10", A, "点结果卡打开 Lightbox 且大图真实", False, "无结果卡")

    # D12 底图帮助链接 → 教程
    page.click("#lnk-bg-help")
    page.wait_for_timeout(700)
    chk("D12", A, "「图和文案对不上？点这」能给出配图说明", page.locator(".modal").count() > 0)
    cov("#lnk-bg-help")
    close_modals(page)

    # D13 Ctrl+Enter 快捷生成（不重复等出图，只看是否触发）
    hint = page.evaluate("() => (document.querySelector('.gen-hint')||{}).innerText || ''")
    chk("D13", A, "生成按钮旁标明 Ctrl+Enter 快捷方式", "Ctrl" in hint, f"提示={hint!r}")


# ── D. 元素清单与覆盖 ─────────────────────────────────────────────────────
INVENTORY_JS = """() => {
  const out = [];
  const sel = 'button, input, textarea, select, a[href], .tpl-card, .tpl-mini,'
            + '.plt-btn, .seg-btn, .ai-card, .ai-toggle, .pop-item, .d-chip, .d-card,'
            + '.d-star, .style-tab, .img-slot, .tab-btn, .tpl-fav, .pv-btn';
  document.querySelectorAll(sel).forEach(el => {
    const r = el.getBoundingClientRect();
    const st = getComputedStyle(el);
    out.push({
      tag: el.tagName.toLowerCase(),
      id: el.id || '',
      cls: (el.className || '').toString().split(' ').filter(Boolean).slice(0, 2).join('.'),
      text: ((el.innerText || el.placeholder || el.getAttribute('title') || '') + '').trim().slice(0, 16),
      visible: r.width > 0 && r.height > 0 && st.visibility !== 'hidden',
      page: document.getElementById('page-social').classList.contains('active') ? 'social' : 'wechat',
    });
  });
  return out;
}"""


def part_inventory(page):
    print("\n" + "=" * 60 + "\nD. 元素清单与覆盖统计\n" + "=" * 60)
    goto_page(page, "wechat")
    seen = {}
    # 页面级扫描（含两页、抽屉/弹窗打开态）
    for action in ("wechat", "drawer", "settings", "social"):
        if action == "drawer":
            page.click("#btn-all-tpl")
            page.wait_for_timeout(600)
        elif action == "settings":
            page.keyboard.press("Escape")
            page.wait_for_timeout(300)
            page.click("#btn-settings")
            page.wait_for_timeout(900)
        elif action == "social":
            close_modals(page)
            page.click('.tab-btn[data-page="social"]')
            page.wait_for_timeout(600)
        for e in page.evaluate(INVENTORY_JS):
            key = (e["id"] or e["cls"] or e["tag"]) + "|" + e["text"]
            if key not in seen or (e["visible"] and not seen[key]["visible"]):
                seen[key] = e
    close_modals(page)
    page.keyboard.press("Escape")
    page.wait_for_timeout(300)
    page.click('.tab-btn[data-page="wechat"]')
    page.wait_for_timeout(500)

    inventory.extend(seen.values())
    vis = [e for e in seen.values() if e["visible"]]
    uncovered = []
    for e in vis:
        if e["id"] and ("#" + e["id"]) in covered:
            continue
        cls_tokens = ["." + c for c in (e["cls"] or "").split(".") if c]
        if any(t in covered for t in cls_tokens):
            continue
        uncovered.append(e)
    chk("E01", "元素清单", "枚举 DOM 交互元素并统计覆盖", len(vis) > 0,
        f"可见交互元素={len(vis)}；已覆盖≈{len(vis) - len(uncovered)}；未覆盖={len(uncovered)}")
    UNCOVERED.extend(uncovered)
    for e in uncovered:
        print(f"    · 未覆盖：{e['page']} <{e['tag']}> id={e['id'] or '-'} "
              f"cls={e['cls'] or '-'} 文案={e['text']!r}")
    for s in SKIPPED:
        print(f"    · 刻意跳过：{s['selector']} —— {s['why']}")


# ── E. 视觉层级（跨主题字号单调性）────────────────────────────────────────
def part_hierarchy(page, ctx):
    print("\n" + "=" * 60 + "\nE. 视觉层级：第一段 = 最大标题（跨主题字号单调）\n" + "=" * 60)
    goto_page(page, "wechat")
    text = ("我的做法\n\n第一段正文，用来说明这篇文章要讲什么。\n\n"
            "为什么要这样做\n\n因为成本更低，维护也更简单。\n\n"
            "一、具体步骤\n\n先做第一件事，再做第二件事。")

    def measure(tag_name, label):
        page.fill("#input-area", text)
        page.wait_for_timeout(1700)
        p = probe(page)
        hs = p["headings"]
        sizes = [h["size"] for h in hs]
        mono = len(sizes) < 2 or sizes[0] > sizes[1]
        top_is_h1 = bool(hs) and hs[0]["tag"] == "h1"
        body_size = page.evaluate("""() => {
            const d = document.getElementById('preview-frame').contentDocument;
            const ps = [...d.querySelectorAll('p')];
            return ps.length ? parseFloat(getComputedStyle(ps[0]).fontSize) : 0;
        }""")
        chk(tag_name, "视觉层级", f"第一段是最大的 h1 且字号单调递减（{label}）",
            top_is_h1 and mono and bool(sizes) and sizes[0] >= 20,
            f"首标题={hs[0] if hs else None} 字号序列={sizes} 正文≈{body_size}px "
            f"h1>h2={mono} 首标题是 h1={top_is_h1}")
        if not top_is_h1:
            find(tag_name + "-F", "视觉层级", f"{label}：第一段没有成为最大标题（h1）", "高",
                 f"预览层级序列={hs}",
                 "core/preprocessor.preprocess 的首行提升逻辑需覆盖该输入形态")
        if sizes and sizes[0] < 20:
            find(tag_name + "-F2", "视觉层级", f"{label}：大标题字号偏小，看不出层级", "中",
                 f"h1={sizes[0]}px", "该主题 JSON 的 h1 font_size 需与 h2 拉开 ≥4px")

    measure("E10", "（默认主题）")
    for n, idx in enumerate((3, 40), start=1):
        page.click("#btn-all-tpl")
        page.wait_for_timeout(600)
        page.fill("#drawer-search", "")
        page.wait_for_timeout(500)
        if page.locator("#drawer-grid .d-card").count() > idx:
            page.locator("#drawer-grid .d-card").nth(idx).click()
            page.wait_for_timeout(1600)
            label = page.evaluate("() => document.getElementById('theme-name').innerText")
            measure(f"E1{n}", label)
        else:
            chk(f"E1{n}", "视觉层级", "换一个主题再验层级", False, "抽屉卡片不足")
        page.keyboard.press("Escape")
        page.wait_for_timeout(300)


REPORT_CSS = """
:root{--ink:#1f2328;--muted:#6b7280;--soft:#8b949e;--line:#e6e8eb;--bg:#f6f7f9;
--hi:#c0392b;--mid:#b26a00;--low:#57606a;--ok:#1a7f37}
*{box-sizing:border-box}
body{margin:0;background:var(--bg);color:var(--ink);line-height:1.75;
font-family:-apple-system,BlinkMacSystemFont,'Segoe UI','PingFang SC','Microsoft YaHei',sans-serif}
.wrap{max-width:1080px;margin:0 auto;padding:40px 28px 80px}
h1{font-size:26px;margin:0 0 6px;letter-spacing:.01em}
h2{font-size:18px;margin:44px 0 14px;padding-left:10px;border-left:4px solid #af3e2b}
h3{font-size:15px;margin:26px 0 10px;color:#3a4046}
.sub{color:var(--muted);font-size:13px;margin-bottom:26px}
.cards{display:grid;grid-template-columns:repeat(auto-fit,minmax(168px,1fr));gap:12px;margin:22px 0}
.card{background:#fff;border:1px solid var(--line);border-radius:10px;padding:14px 16px}
.card .k{font-size:12px;color:var(--soft);letter-spacing:.06em}
.card .v{font-size:24px;font-weight:700;margin-top:4px}
.card .n{font-size:12px;color:var(--muted);margin-top:2px}
table{width:100%;border-collapse:collapse;background:#fff;border:1px solid var(--line);
border-radius:10px;overflow:hidden;font-size:13px}
th,td{padding:10px 12px;border-bottom:1px solid var(--line);vertical-align:top;text-align:left}
th{background:#fbfbfc;font-size:12px;color:var(--soft);font-weight:600;letter-spacing:.04em}
tr:last-child td{border-bottom:none}
.tag{display:inline-block;padding:1px 8px;border-radius:20px;font-size:11px;font-weight:700;color:#fff;white-space:nowrap}
.s-高{background:var(--hi)}.s-中{background:var(--mid)}.s-低{background:var(--low)}
.pass{color:var(--ok);font-weight:700}.fail{color:var(--hi);font-weight:700}
.ev{color:#4a5157}.fx{color:#1a3d6d}
.mono{font-family:ui-monospace,SFMono-Regular,Menlo,Consolas,monospace;font-size:12px}
.note{background:#fff;border:1px solid var(--line);border-left:4px solid #af3e2b;border-radius:8px;
padding:12px 16px;font-size:13px;color:#3a4046;margin:16px 0}
ul{padding-left:20px}li{font-size:13px;color:#3a4046;margin:4px 0}
.legend{font-size:12px;color:var(--soft);margin-top:8px}
"""


def write_report(data):
    """把审计结果渲染成一份自包含 HTML 报告（无外部依赖，双击即看）"""
    checks = data["checks"]
    findings = sorted(data["findings"], key=lambda x: {"高": 0, "中": 1, "低": 2}[x["sev"]])
    passed, total = data["checks_passed"], data["checks_total"]

    def esc(s):
        return (str(s).replace("&", "&amp;").replace("<", "&lt;").replace(">", "&gt;"))

    rows_f = "".join(
        f"<tr><td><span class='tag s-{f['sev']}'>{f['sev']}</span></td><td><b>{esc(f['name'])}</b>"
        f"<div class='mono' style='color:#8b949e'>{esc(f['id'])} · {esc(f['area'])}</div></td>"
        f"<td class='ev'>{esc(f['evidence'])}</td><td class='fx'>{esc(f['fix'])}</td></tr>"
        for f in findings) or "<tr><td colspan='4'>无</td></tr>"

    rows_s = "".join(
        f"<tr><td><span class='{'pass' if c['ok'] else 'fail'}'>{'✓' if c['ok'] else '✗'}</span> {esc(c['id'])}</td>"
        f"<td>{esc(c['name'])}</td><td class='mono ev'>{esc(c['detail'])}</td></tr>"
        for c in checks if c["area"] == "场景")

    rows_i = "".join(
        f"<tr><td><span class='{'pass' if c['ok'] else 'fail'}'>{'✓' if c['ok'] else '✗'}</span></td>"
        f"<td>{esc(c['area'])}</td><td>{esc(c['name'])}</td>"
        f"<td class='mono ev'>{esc(c['detail'])}</td></tr>"
        for c in checks if c["area"] != "场景")

    unc = "".join(f"<li><span class='mono'>{esc(e['page'])} &lt;{esc(e['tag'])}&gt; "
                  f"id={esc(e['id'] or '-')} cls={esc(e['cls'] or '-')}</span> — {esc(e['text'])}</li>"
                  for e in data.get("uncovered", [])) or "<li>无</li>"
    skp = "".join(f"<li><b>{esc(s['selector'])}</b> —— {esc(s['why'])}</li>"
                  for s in data.get("skipped", [])) or "<li>无</li>"
    ce = "".join(f"<li class='mono'>{esc(e)}</li>" for e in data.get("console_errors", [])) or "<li>无</li>"
    cee = "".join(f"<li class='mono'>{esc(e)}</li>" for e in data.get("console_errors_expected", []))

    hi = sum(1 for f in findings if f["sev"] == "高")
    mid = sum(1 for f in findings if f["sev"] == "中")
    low = sum(1 for f in findings if f["sev"] == "低")
    html = f"""<!DOCTYPE html>
<html lang="zh-CN"><head><meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<title>SuperSu 有头全流程审计报告 · {esc(data['generated_at'][:10])}</title>
<style>{REPORT_CSS}</style></head><body><div class="wrap">
<h1>SuperSu · Chrome 有头全流程审计报告</h1>
<div class="sub">生成时间 {esc(data['generated_at'])} ｜ 真实浏览器：系统 Chrome（headless=false）｜
Playwright 同步 API 驱动，逐按钮、逐场景、逐输入反馈走完两页全部流程</div>

<div class="cards">
  <div class="card"><div class="k">检查项</div><div class="v">{passed}/{total}</div>
    <div class="n">通过的交互/场景断言</div></div>
  <div class="card"><div class="k">问题合计</div><div class="v">{len(findings)}</div>
    <div class="n">高 {hi} · 中 {mid} · 低 {low}</div></div>
  <div class="card"><div class="k">场景语料</div><div class="v">{len([c for c in checks if c['area']=='场景'])}</div>
    <div class="n">真实输入 → 识别结果</div></div>
  <div class="card"><div class="k">可见交互元素</div><div class="v">{len(data.get('inventory', []))}</div>
    <div class="n">未覆盖 {len(data.get('uncovered', []))} 个</div></div>
  <div class="card"><div class="k">真实 JS 报错</div><div class="v">{len(data.get('console_errors', []))}</div>
    <div class="n">另有 {len(data.get('console_errors_expected', []))} 条为故障注入预期</div></div>
</div>

<div class="note"><b>这次审计怎么做的（方法）</b>
<ul>
<li><b>工具链</b>：Playwright（Python 同步 API）+ 系统 Chrome 有头窗口（<span class="mono">core/browser_utils.launch_browser</span> 的 Chrome 优先回退链），断言口径与仓库既有有头套件一致。</li>
<li><b>场景语料</b>：16 类真实输入（短标题、无空行 TXT、编号小节、长散文、步骤、提示+命令行、Python 代码块、引用/箭头、手写 Markdown、表格、联系信息、中英混排 emoji、装饰标题、3000 字长文、边界、纯列表），逐条比对「识别结构条」与预览 HTML 的真实层级/结构。</li>
<li><b>逐元素</b>：自动枚举 DOM 里全部可见可交互元素（按钮/输入/下拉/卡片/胶囊），能点的都点一遍并验证「有明确、可观察的效果」；有真实副作用的（确认推送、保存密钥、外链）刻意不点，并单独列出原因。</li>
<li><b>输入即反馈</b>：编辑区字数/结构、风格筛选、抽屉搜索、文案计数器、底图槽位、开关态，全部验证「输入 → 立刻有反馈」。</li>
<li><b>故障注入</b>：把主题指向不存在的 id，验证渲染失败时的错误浮层 + 提示 + 关闭链路真的可用。</li>
</ul>
<span class="legend">判定口径：只认「真实产出 / 真实报错」，不用固定 sleep 判「优雅降级」；假控件（长得像可点但没功能）一律记问题。</span>
</div>

<h2>一、问题清单（按严重度）</h2>
<table><thead><tr><th style="width:52px">级别</th><th style="width:250px">问题</th>
<th>证据（真实观测）</th><th style="width:300px">优化建议</th></tr></thead>
<tbody>{rows_f}</tbody></table>

<h2>二、场景语料矩阵（16 类真实输入）</h2>
<table><thead><tr><th style="width:56px">结果</th><th style="width:300px">场景</th>
<th>识别结果（真实预览观测）</th></tr></thead><tbody>{rows_s}</tbody></table>

<h2>三、逐按钮 / 逐交互覆盖（公众号页 + 小红书页）</h2>
<table><thead><tr><th style="width:46px">结果</th><th style="width:96px">区域</th>
<th style="width:290px">检查项</th><th>观测详情</th></tr></thead><tbody>{rows_i}</tbody></table>

<h2>四、元素清单与覆盖情况</h2>
<h3>未覆盖（仍可进一步验证）</h3><ul>{unc}</ul>
<h3>刻意不点（真实副作用，后端路径由 test_api_e2e 覆盖）</h3><ul>{skp}</ul>
<h3>真实 JS 控制台报错</h3><ul>{ce}</ul>
<h3>故障注入产生的预期报错</h3><ul>{cee or '<li>无</li>'}</ul>

<h2>五、复现方式</h2>
<div class="note"><span class="mono">python tests/test_headed_pm_audit.py</span>
（自起自停服务；跑前若 5000 端口被占用会直接 ABORT，避免连到旧进程假通过）
<br>原始数据：<span class="mono">output/pm_audit/audit.json</span>｜末屏截图：<span class="mono">output/pm_audit/audit_last.png</span></div>
</div></body></html>"""
    (OUT_DIR / "report.html").write_text(html, encoding="utf-8")


# ── 汇总 ─────────────────────────────────────────────────────────────────
def summary(render_bodies):
    OUT_DIR.mkdir(parents=True, exist_ok=True)
    passed = sum(1 for c in checks if c["ok"])
    exp_from = EXPECTED_ERR_FROM if EXPECTED_ERR_FROM is not None else len(console_errors)
    real_errors = console_errors[:exp_from]
    expected_errors = console_errors[exp_from:]
    if real_errors:
        find("JS-F", "环境", "页面出现 JS 控制台报错", "高",
             f"{len(real_errors)} 条：{'; '.join(e[:60] for e in real_errors[:4])}",
             "逐条定位；若是上游 LLM 5xx 导致的，先修上游，不为凑绿而放宽判据")
    data = {
        "generated_at": time.strftime("%Y-%m-%d %H:%M:%S"),
        "checks_total": len(checks), "checks_passed": passed,
        "findings": findings, "checks": checks,
        "console_errors": real_errors,
        "console_errors_expected": expected_errors,
        "inventory": inventory, "skipped": SKIPPED, "uncovered": UNCOVERED,
    }
    (OUT_DIR / "audit.json").write_text(json.dumps(data, ensure_ascii=False, indent=2),
                                        encoding="utf-8")
    write_report(data)
    print("\n" + "=" * 60)
    print(f"有头全流程审计：{passed}/{len(checks)} 项检查通过；"
          f"问题 {len(findings)} 条（高 {sum(1 for f in findings if f['sev']=='高')} / "
          f"中 {sum(1 for f in findings if f['sev']=='中')} / "
          f"低 {sum(1 for f in findings if f['sev']=='低')}）")
    if findings:
        print("\n问题清单：")
        for f in sorted(findings, key=lambda x: {"高": 0, "中": 1, "低": 2}[x["sev"]]):
            print(f"  [{f['sev']}] {f['id']} {f['name']}")
            print(f"        证据：{f['evidence'][:160]}")
            print(f"        建议：{f['fix'][:160]}")
    if real_errors:
        print(f"\n⚠️ 页面 JS 报错 {len(real_errors)} 条：")
        for e in real_errors[:10]:
            print("   -", e[:150])
    else:
        print("\n✅ 页面无真实 JS 控制台报错"
              + (f"（另有 {len(expected_errors)} 条来自 B37 故障注入，属预期）" if expected_errors else ""))
    print(f"\n数据落盘：{OUT_DIR / 'audit.json'}")
    print(f"HTML 报告：{OUT_DIR / 'report.html'}")
    print("=" * 60)
    return 0 if (passed == len(checks) and not real_errors) else 1


# ── 小工具 ───────────────────────────────────────────────────────────────
def _body(req):
    try:
        return json.loads(req.post_data or "{}")
    except Exception:
        return {}


def _make_png(path, w, h):
    try:
        from PIL import Image
        path.parent.mkdir(parents=True, exist_ok=True)
        Image.new("RGB", (w, h), (30, 60, 120)).save(path)
        return path
    except Exception:
        return None


def close_modals(page):
    page.evaluate("document.querySelectorAll('.modal').forEach(m=>m.remove())")
    page.wait_for_timeout(120)


def clear_toast(page):
    """清掉上一条 toast——避免用陈旧文案误判下一步的反馈"""
    page.evaluate("() => { const t = document.getElementById('toast-el');"
                  "if (t) { t.textContent = ''; t.style.opacity = '0'; } }")
    page.wait_for_timeout(80)


def goto_page(page, name):
    page.click(f'.tab-btn[data-page="{name}"]')
    page.wait_for_timeout(600)
    close_modals(page)


def wait_server(timeout=45):
    t0 = time.time()
    while time.time() - t0 < timeout:
        try:
            urllib.request.urlopen(BASE, timeout=2)
            return True
        except Exception:
            time.sleep(0.5)
    return False


def _port_busy(port=5000):
    with socket.socket(socket.AF_INET, socket.SOCK_STREAM) as s:
        s.settimeout(0.5)
        return s.connect_ex(("127.0.0.1", port)) == 0


if __name__ == "__main__":
    sys.exit(run())
