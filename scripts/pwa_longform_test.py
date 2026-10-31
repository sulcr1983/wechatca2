#!/usr/bin/env python3
"""长图文产物级断言（design §9 门禁行，2026-10-31 接入）。

分工（不与现有套件重复）：
  · 本套件 = design §9 门禁行点名的四类 **DOM 级**断言：
      1. 分页完整性   —— 原文每一句都必须出现在渲染出的卡片里（丢句 = 用户内容被裁）
      2. 字号 ≥28px   —— design §7 的最小可读下限（.body 内容文字；页眉页脚元数据除外）
      3. 填充率分档   —— design §6：正文/清单/步骤 ≥68%、结尾 ≥60%、开篇/金句 ≥45% 且 ≥2 锚点
                         （原「末页 ≥75%」已作废；dense 单段 120–139 字的 66.5% 属几何必然，
                           见 cards.js 的 DENSE_SINGLE_SEG_FLOOR，本套样例不含该边界）
      4. 无溢出       —— 内容高 ≤ 可用高（溢出会裁掉用户内容，比欠填严重）
  · 导出 PNG 的字节/空白/去重产物 QA → `scripts/qa_story_verify.py`（现有，S1/S2）；
    本套件不重复。整套图文的流程级回归在 `scripts/pwa_cover_test.py`（已随双路径更新）。

跑法：.venv/Scripts/python.exe scripts/pwa_longform_test.py（本地 dist，需先 node pwa/scripts/build.mjs）
"""

import os
import sys
import re
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
DIST = ROOT / "pwa" / "dist"
OUT = ROOT / "output" / "gate-run"
PORT = 8097

sys.path.insert(0, str(ROOT))   # core.browser_utils（浏览器回退链单真源）

# 样例文章：按角色工程化 —— 每一段的长短都按 design §6 的实测容量反推，
# 让 5 张内页各自稳定落进「开篇/正文/清单/金句/结尾」且全部达标。
# （第一行是标题，不进内页；正文 = 其余行。）
TITLE_LINE = "周末去海边，我把手机调成了飞行模式"
BODY_TEXT = (
    # 开篇（~100 字 → 74px 大字 9 行，填充 ~80%，锚点 = 色条 + 署名）
    "两天的沉默之后，我重新听见了海浪。浪的声音比任何白噪音都好用，"
    "时间忽然变多了，早上不用刷消息，晚上不用回群里的表情包，"
    "一天像被拉长了三分之一，原来所谓休息，不是换个地方刷手机，"
    "而是允许自己消失一阵子，把注意力还给真实的生活。\n\n"
    # 正文 dense（~150 字 → 9 行，按 1124 口径 ~80%）
    "把手机收起来之后，我重新读完了搁置半年的那本书。晚饭后的散步也不再看屏幕，"
    "路口的风、店门口的猫、修车铺的收音机，全都清楚了起来。"
    "原来不是生活没有细节，是我以前走得太快，细节全被丢在了路上。"
    "慢慢走，反而什么都遇得到，连楼下的桂花都比记忆里香。"
    "日子被这些细碎的响声填满之后，心里那块一直空着的地方，"
    "忽然就被别的东西补上了，说不清是什么，但很清楚。\n\n"
    # 清单（6 条，两条折行 → ~80%）
    "- 出发前把手机调成飞行模式，塞进背包最底下\n"
    "- 到了先别拍照，坐十分钟再说\n"
    "- 回程的路上写几句话，不给点赞留位置\n"
    "- 把手机放进背包最底层\n"
    "- 读十页搁置很久的那本书\n"
    "- 早点睡觉，别熬到两点\n\n"
    # 金句（40 字 + 上下文 43 字 ≤ 120 上限，~80%）
    "> 浪的声音，比任何白噪音都好用，它把「效率」两个字从耳朵里拿走了，"
    "剩下的时间终于属于我自己。\n\n"
    "回到城市之后，我把这段录音设成了闹钟。每天早上被海浪叫醒，"
    "比被消息列表叫醒舒服得多。\n\n"
    # 结尾（~120 字 ≤ closingCap(1)=150，~90%）
    "如果你也想试试，就从下一个周末开始。把手机调成飞行模式，"
    "找一片听得见风的地方，坐十分钟，什么也不做。你会发现"
    "自己一直没有漏掉什么，真正漏掉的，是那些没有被你看见的下午。"
)

ARTICLE = TITLE_LINE + "\n\n" + BODY_TEXT


def check(name, ok, detail=""):
    tag = "✓" if ok else "✗"
    print(f"  {tag} {name}" + (f"  [{detail}]" if detail and not ok else ""), flush=True)
    return (name, bool(ok), detail)


def skip(name, detail=""):
    print(f"  - {name}  SKIP  {detail}", flush=True)
    return (name, None, detail)


def serve():
    """静态服务 dist。⚠️ 必须起 serve_forever 线程（qa_story_verify.py 同款）——
    只建 TCPServer 不启动 = 连接被 backlog 收下但永远不响应，page.goto 会挂死。"""
    import functools
    import http.server
    import socketserver
    import threading

    class H(http.server.SimpleHTTPRequestHandler):
        def log_message(self, *a):
            pass

    socketserver.TCPServer.allow_reuse_address = True
    httpd = socketserver.ThreadingTCPServer(
        ("127.0.0.1", PORT), functools.partial(H, directory=str(DIST)))
    httpd.daemon_threads = True
    threading.Thread(target=httpd.serve_forever, daemon=True).start()
    print(f"serving {DIST} at http://127.0.0.1:{PORT}/", flush=True)
    return httpd


def norm(s):
    return re.sub(r"\s+", "", s or "")


# 页面 JS：量每张卡的填充率 / 溢出 / 内容字号（transform 缩放不影响比值与 computed 字号）
MEASURE_JS = """
() => {
  const cards = [...document.querySelectorAll('#cv-cards-root .card')];
  return cards.map((card) => {
    const body = card.querySelector('.body');
    if (!body) return { role: 'no-body' };
    /* ⚠️ 必须用 offsetHeight/offsetTop（布局值）而不是 getBoundingClientRect ——
       deck 卡片被 .cv-slot-inner 的 transform:scale() 包着，rect 是缩放后的视觉值，
       除以固定 1124 会整体缩小 4 倍（实测踩过）。offset* 不受 transform 影响。 */
    const avail = body.offsetHeight;
    let bot = 0;
    let fsMin = Infinity;
    let anchors = 0;
    [...body.children].forEach((c) => {
      const cs = getComputedStyle(c);
      if (cs.position === 'absolute') return;   // 装饰层（大数字/引号底）不计
      bot = Math.max(bot, c.offsetTop + c.offsetHeight);
    });
    // 内容字号：.body 里所有带直接文本的元素。
    // ⚠️ 不计入 28px 下限的：等宽签名/CTA 标签与等宽序号（.sign/.qsign/.cta/
    //    .lt-cover-kick/.row .n/.sn）—— 它们是页脚级 metadata 与装饰序号
    //    （design §7 字号表允许 19–20px 级），28px 下限管正文内容。
    [...body.querySelectorAll('*')].forEach((el) => {
      if (el.matches('.sign, .qsign, .cta, .lt-cover-kick, .row .n, .sn')) return;
      const hasText = [...el.childNodes].some((n) => n.nodeType === 3 && n.textContent.trim());
      if (!hasText) return;
      fsMin = Math.min(fsMin, parseFloat(getComputedStyle(el).fontSize));
    });
    // 锚点（design §6：airy 版式靠锚点成立）
    ['.rule', '.sign', '.sub', '.qmark', '.qrule', '.qsign', '.cta', '.lt-cover-kick']
      .forEach((sel) => { if (body.querySelector(sel)) anchors += 1; });
    const role = (body.className.match(/r-(\\w+)/) || [])[1] || 'dense';
    const used = bot;
    /* 填充率口径与 design §6/§9 一致：按 **1124px 通用可用高**归一化
       （§7：1440−166−150）。各模板实测 body 高不同（1100–1230），
       直接用实测 avail 会把 66.5% 算成 63.9%（editorial body 1170）。
       溢出判定另用实测 avail（内容真的超出这个模板的 body 才算溢出）。 */
    const fill1124 = used / 1124 * 100;
    /* dense 的已知几何边界（design §6 落地状态③ / DENSE_SINGLE_SEG_FLOOR）：
       单段 120–139 字恒 8 行 ≈ 66.5%，**接受，不靠加装饰填空**。 */
    const paras = [...body.querySelectorAll('p')];
    const denseFloor = (role === 'dense' && paras.length === 1
      && paras[0].textContent.length >= 120 && paras[0].textContent.length <= 139)
      ? 66.5 : null;
    /* 诊断字段（排「填充率不达标」时看真实渲染，不靠估） */
    const ps = [...body.querySelectorAll('p, .lead, .qt, .ct, .ttl, .t, .st, .sd')];
    const p0 = ps[0];
    const cs0 = p0 ? getComputedStyle(p0) : null;
    return { role, avail, used, fill: fill1124, overflow: used > avail + 2,
             fsMin: fsMin === Infinity ? 0 : fsMin, anchors, denseFloor,
             bodyH: avail, bodyW: body.offsetWidth,
             fs: cs0 ? cs0.fontSize : '-', lh: cs0 ? cs0.lineHeight : '-',
             nP: ps.length, chars: ps.map((x) => x.textContent.length).join('/') };
  });
}
"""


def main() -> int:
    if not (DIST / "index.html").exists():
        print("pwa/dist 不存在，先跑 node pwa/scripts/build.mjs", flush=True)
        return 2

    OUT.mkdir(parents=True, exist_ok=True)
    from playwright.sync_api import sync_playwright
    from core.browser_utils import launch_browser

    results = []
    httpd = serve()
    _browser = None
    try:
        with sync_playwright() as p:
            browser = launch_browser(p, headless=True,
                                     args=["--no-proxy-server", "--window-size=1440,960"])
            _browser = browser
            page = browser.new_page(viewport={"width": 1440, "height": 960})
            errors = []
            page.on("pageerror", lambda e: errors.append("pageerror:" + str(e)))

            page.goto(f"http://127.0.0.1:{PORT}/", wait_until="domcontentloaded", timeout=60000)
            print("  步骤1 页面已加载", flush=True)
            page.wait_for_selector("#btn-longform", timeout=20000)
            page.click("#btn-longform")
            page.wait_for_selector("#longform-root:not([hidden])", timeout=10000)
            print("  步骤2 封面页已打开", flush=True)

            print("  步骤3 已打开长图文页（独立顶级模块）", flush=True)
            results.append(check("切到长文路径", page.is_visible("#cv-long-text")))

            # 空态：友好提示，不打红叉（night report V9）
            page.wait_for_timeout(900)
            sc = page.inner_text("#cv-selfcheck") if page.is_visible("#cv-selfcheck") else ""
            results.append(check("空态是友好提示（非失败报错）",
                                 "还没有正文" in sc, sc[:40]))

            # ── 粘贴整篇 → 实时分页 ──
            print("  步骤4 填写文章", flush=True)
            page.fill("#cv-long-sign", "阿苏")
            page.fill("#cv-long-text", ARTICLE)
            # 等 deck 渲染 + 自检转静默（正常态 hidden = 分页完整且未截断）
            page.wait_for_function(
                "() => document.querySelectorAll('#cv-deck .cv-slot').length >= 2",
                timeout=30000)
            try:
                page.wait_for_function(
                    "() => document.getElementById('cv-selfcheck').hidden === true",
                    timeout=20000)
                results.append(check("产物自检正常态静默（= 逐句落版且未截断）", True))
            except Exception:
                results.append(check("产物自检正常态静默（= 逐句落版且未截断）", False,
                                     page.inner_text("#cv-selfcheck")[:80]))

            # ── 1. 分页完整性（逐句落版，DOM 直接比对）──
            deck_text = norm(page.inner_text("#cv-deck"))
            sentences = []
            for seg in re.split(r"\n+", BODY_TEXT):
                seg = seg.strip()
                if not seg:
                    continue
                if seg.startswith(("-", ">")):
                    seg = re.sub(r"^[-*•·>]\s*", "", seg)
                for s in re.split(r"(?<=[。！？!?；;])", seg):
                    if len(norm(s)) > 8:
                        sentences.append(s)
            missing = [s for s in sentences if norm(s) not in deck_text]
            results.append(check(f"分页完整性：{len(sentences)} 句全部落版",
                                 not missing,
                                 "缺: " + " | ".join(m[:12] for m in missing[:3])))

            n_slots = page.locator("#cv-deck .cv-slot").count()
            results.append(check(f"页数上限（{n_slots} ≤ 6：封面 + 内页）", 2 <= n_slots <= 6))

            # ── 2/3/4. 字号 / 填充分档 / 无溢出 ──
            stats = page.evaluate(MEASURE_JS)
            fills = {s["role"]: s for s in stats}
            print("  （实测）角色/填充%: " + ", ".join(
                f"{s['role']}={s['fill']:.1f}%" for s in stats), flush=True)
            print("  （诊断）", flush=True)
            for s in stats:
                print(f"    {s['role']:8s} body {s.get('bodyW')}x{s.get('bodyH')} "
                      f"fs={s.get('fs')} lh={s.get('lh')} nP={s.get('nP')} "
                      f"chars={s.get('chars')}", flush=True)

            # 字号 ≥28px（design §7 最小可读下限；transform 缩放不影响 computed 值）
            fs_vals = [s["fsMin"] for s in stats if s.get("fsMin")]
            fs_min = min(fs_vals) if fs_vals else 0
            results.append(check(f"内容字号 ≥28px（实测最小 {fs_min:.0f}px）", fs_min >= 28))

            # 无溢出（内容被裁比欠填严重；全部角色一律不允许）
            over = [f"{s['role']}({s['fill']:.1f}%)" for s in stats if s.get("overflow")]
            results.append(check("无溢出（内容高 ≤ 可用高）", not over, "; ".join(over)))

            # 填充分档（design §6 落地标准）
            tiers = [
                ("dense", 68), ("points", 68), ("steps", 68),
                ("closing", 60), ("opening", 45), ("quote", 45),
            ]
            for role, floor in tiers:
                if role not in fills:
                    continue
                s = fills[role]
                # dense 单段 120–139 字：66.5% 是几何必然（§6 裁定接受），下限按例外
                if s.get("denseFloor"):
                    floor = s["denseFloor"]
                ok = s["fill"] >= floor
                msg = f"{role} 填充 {s['fill']:.1f}% ≥ {floor}%"
                if role in ("opening", "quote"):
                    ok = ok and s["anchors"] >= 2
                    msg += f" 且锚点 {s['anchors']} ≥ 2"
                results.append(check(msg, ok))
            # 已知例外：dense 单段 120–139 字恒 66.5%（cards.js DENSE_SINGLE_SEG_FLOOR，
            # design §6 落地状态③：「大字版式占高少是大字的代价」——接受，不靠装饰填空）。

            # ── 模板锁色：色板置灰（design §12.1 方案 C 交互内核）──
            # 导出 PNG 的产物 QA（字节/空白/去重）归 scripts/qa_story_verify.py（S1/S2），此处不重复。
            page.click('.cv-ltpl[data-tpl="night"]')
            page.wait_for_timeout(700)
            locked_disabled = page.evaluate(
                "() => [...document.querySelectorAll('#cv-lpals .cv-lpal')].every(d => d.disabled)")
            lock_hint = page.inner_text("#cv-lpal-lock") if page.is_visible("#cv-lpal-lock") else ""
            results.append(check("锁色模板：色板置灰 + 提示（方案 C）",
                                 locked_disabled and "自带配色" in lock_hint, lock_hint[:40]))
            page.click('.cv-ltpl[data-tpl="editorial"]')
            page.wait_for_timeout(500)

            # ══ §12.7 四项增强验收（design §12.2–§12.5）══════════════════
            print("  步骤5 版式选项", flush=True)

            # ① 页码开关（§12.5）：默认开 → 关掉后 12 套逐套页码消失、页脚其余元素不动
            pn_on = page.evaluate(
                "() => [...document.querySelectorAll('#cv-cards-root .card .lf')]"
                ".every(f => /\\d\\s*\\/\\s*\\d|^\\d{2}$|P\\. \\d{2}/.test(f.textContent))")
            results.append(check("页码默认开（现状回归）", pn_on))
            page.uncheck("#cv-long-pn")
            page.wait_for_timeout(800)
            pn_off = page.evaluate(
                "() => [...document.querySelectorAll('#cv-cards-root .card .lf')]"
                ".map(f => f.textContent.replace(/\\s+/g,''))")
            # 关掉后页脚里不该再有「2 / 5」这类页码
            still_has_pn = any(re.search(r"\d+\s*/\s*\d+|\bP\.\d{2}\b", t) for t in pn_off)
            results.append(check("关页码后页脚无页码文本", not still_has_pn,
                                 " | ".join(pn_off)[:60]))
            page.check("#cv-long-pn")
            page.wait_for_timeout(600)

            # ② 签名（§12.4）：填入 → 每张内页页脚都有 @签名；封面不显示
            page.fill("#cv-long-sign", "阿苏")
            page.wait_for_timeout(900)
            sign_stats = page.evaluate("""() => {
              const cards = [...document.querySelectorAll('#cv-cards-root .card')];
              const hasCover = !!cards[0]?.querySelector('.r-cover .lt-foot-sign');
              const inner = cards.slice(1);
              return { hasCover,
                n: inner.length,
                nSign: inner.filter(c => c.querySelector('.lf .lt-foot-sign')).length,
                sample: inner[0]?.querySelector('.lf .lt-foot-sign')?.textContent || '' };
            }""")
            results.append(check(
                f"签名出现在全部 {sign_stats['n']} 张内页页脚（封面不显示）",
                sign_stats["nSign"] == sign_stats["n"] and not sign_stats["hasCover"]
                and "@阿苏" in sign_stats["sample"],
                str(sign_stats)[:80]))
            page.fill("#cv-long-sign", "")
            page.wait_for_timeout(700)

            # ③ 强制分页符（§12.3）：--- 独立成段即分页
            # ⚠️ 长文输入的第一行会被 extractStory 当**封面标题**，正文 = 其余行。
            #    所以分页符用例必须先给一行标题，否则第一段会被吃掉（实测踩到）。
            base_pages = page.locator("#cv-deck .cv-slot").count()
            page.fill("#cv-long-text",
                      "三个下午\n\n第一段内容。\n\n---\n\n第二段内容。\n\n---\n\n第三段内容。")
            page.wait_for_timeout(1200)
            brk_pages = page.locator("#cv-deck .cv-slot").count()
            roles_brk = page.evaluate(
                "() => [...document.querySelectorAll('#cv-deck .cv-slot-role')].map(e => e.textContent)")
            texts_brk = page.evaluate(
                "() => [...document.querySelectorAll('#cv-deck .body')]"
                ".map(b => b.textContent.replace(/\\s+/g,'').slice(0,20))")
            print(f"  （诊断）分页符用例实际页: {list(zip(roles_brk, texts_brk))}", flush=True)
            # 期望：封面 + 3 段成页（≥3 页），且正文里 3 段都在（不被合并/丢失）
            joined = "".join(texts_brk)
            results.append(check(
                f"分页符生效（{brk_pages} 页，角色 {'/'.join(roles_brk)}）",
                brk_pages >= 3 and all(s in joined for s in ("第一段", "第二段", "第三段")),
                f"原 {base_pages} 页"))
            # 规则①：连续两个只分一次（不产生空页）
            page.fill("#cv-long-text", "标题\n\nA。\n\n---\n\n---\n\nB 段内容。")
            page.wait_for_timeout(1000)
            two_brk = page.locator("#cv-deck .cv-slot").count()
            results.append(check("连续两个分页符只分一次（不产生空页）", two_brk == 3, f"{two_brk} 页"))

            # ④ 内页背景图（§12.2）：6 套可用 / 6 套禁用
            page.fill("#cv-long-text", ARTICLE)
            page.wait_for_timeout(1200)
            bg_avail = page.evaluate(
                "() => !document.getElementById('cv-longbg-file').disabled")
            results.append(check("editorial 支持内页背景图", bg_avail))
            page.click('.cv-ltpl[data-tpl="night"]')
            page.wait_for_timeout(700)
            bg_locked = page.evaluate(
                "() => document.getElementById('cv-longbg-file').disabled")
            lock_txt = page.inner_text("#cv-longbg-lock") if page.is_visible("#cv-longbg-lock") else ""
            results.append(check("night 禁用内页背景图 + 提示自带背景",
                                 bg_locked and "自带" in lock_txt, lock_txt[:40]))
            page.click('.cv-ltpl[data-tpl="editorial"]')
            page.wait_for_timeout(600)

            # 上传一张背景图，验证内页真的铺上 + 蒙层存在
            page.set_input_files("#cv-longbg-file", str(ROOT / "docs" / "brand" / "logo-source.png"))
            page.wait_for_timeout(1500)
            bg_stats = page.evaluate("""() => {
              const cards = [...document.querySelectorAll('#cv-cards-root .card')];
              const inner = cards.slice(1);
              return { n: inner.length,
                nBg: inner.filter(c => c.querySelector('.lt-bg')).length,
                nMask: inner.filter(c => c.querySelector('.lt-bg-mask')).length,
                coverHasBg: !!cards[0]?.querySelector('.lt-bg') };
            }""")
            results.append(check(
                f"内页铺上背景图 + 纸色蒙层（{bg_stats['nBg']}/{bg_stats['n']} 张，封面不受影响）",
                bg_stats["nBg"] == bg_stats["n"] and bg_stats["nMask"] == bg_stats["n"]
                and not bg_stats["coverHasBg"],
                str(bg_stats)[:80]))
            page.click("#cv-longbg-clear")
            page.wait_for_timeout(700)

            page.screenshot(path=str(OUT / "pwa-longform-test.png"), full_page=True)

            real_errors = [e for e in errors if "Failed to fetch" not in e]
            results.append(check("无 JS 页面异常", not real_errors, "; ".join(real_errors[:2])))

            browser.close()
            _browser = None
    finally:
        if _browser is not None:
            try:
                _browser.close()
            except Exception:
                pass
        httpd.shutdown()

    passed = sum(1 for _, ok, _ in results if ok is True)
    failed = [r for r in results if r[1] is False]
    skipped = sum(1 for _, ok, _ in results if ok is None)
    print("\n" + "=" * 56)
    print(f"PWA 长图文产物级测试：{passed}/{passed + len(failed)} 通过"
          + (f"（{skipped} 项 SKIP）" if skipped else ""))
    print("=" * 56)
    for name, _, detail in failed:
        print(f"  ✗ {name}  {detail}")
    return 0 if not failed else 1


if __name__ == "__main__":
    raise SystemExit(main())
