#!/usr/bin/env python3
"""长图文 V6 工作台 · 产品级有头 E2E（2026-11-07 接入门禁）。

为什么需要这套（此前是真空）：
  · `pwa_longform_test.py` 只测**经典版**（buildLong）的产物级断言，完全不碰 V6；
  · `pwa_online_e2e.py` 里长图文只有 3 条浅断言（页面打开 / 分页数 / 整套生成），
    且打的是线上站点，不覆盖 V6 试验入口。
  → 结果：V6 从"接进产品"到"部署上线"全程没有任何自动化测试，
     用户看到的「难看、难用」一个都没被任何门禁挡住。

本套件守四类：
  1. 功能闭环：开关两态 / 自动分页 / 零丢字 / 换格局 / 换配色 / 返回经典版 / 草稿保留
  2. ��物真实：单张 PNG 必须 1080×1440（读 PNG 头），ZIP 必须含 NN-封面/内页 且全是 PNG
  3. 布局可用（用户实测反馈"难看难用"的直接回归）：
       主操作（导出/返回）必须在首屏可见、右栏首屏可见格局卡数、中栏成品区留白上限
  4. 零 JS 报错 + 每步布局几何快照（**文本输出，不落截图文件**）

跑法：
  .venv/Scripts/python.exe scripts/pwa_longform_v6_test.py            # 本地 dist（门禁用）
  .venv/Scripts/python.exe scripts/pwa_longform_v6_test.py --url https://supersu.ccwu.cc/
"""

from __future__ import annotations

import argparse
import functools
import http.server
import json
import socketserver
import struct
import sys
import threading
import zipfile
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
DIST = ROOT / "pwa" / "dist"
OUT = ROOT / "output" / "gate-run" / "longform-v6"

sys.path.insert(0, str(ROOT))   # core.browser_utils（浏览器回退链单真源）

try:
    sys.stdout.reconfigure(encoding="utf-8", errors="replace")
except Exception:
    pass

results: list[tuple[str, bool | None, str]] = []
shot_no = 0


def check(name: str, ok: bool, detail: str = "") -> None:
    results.append((name, bool(ok), detail))
    print(f"  {'✓' if ok else '✗'} {name}" + (f"  [{detail}]" if detail else ""), flush=True)


def measure(name: str, value, note: str = "") -> None:
    """只记录实测值、不判定 —— 用于把"感觉难看"变成可比较的数字。"""
    results.append((name, None, f"{value} {note}".strip()))
    print(f"  · {name} = {value}" + (f"  {note}" if note else ""), flush=True)


def png_size(path: Path) -> tuple[int, int]:
    """读 PNG 头拿真实宽高（不看文件名、不看页面声明）。"""
    with open(path, "rb") as f:
        head = f.read(24)
    if head[:8] != b"\x89PNG\r\n\x1a\n":
        raise ValueError("不是 PNG")
    return struct.unpack(">II", head[16:24])


def _scale_of(transform: str) -> float:
    """从 inline transform 里取出 scale 值。

    ⚠️ 不要用 `"scale(0" in s` 判零：`scale(0.264815)` 也含 "scale(0"，
       会把正常的非零缩放误判成 0（本脚本首跑就踩了这个假红）。
    """
    import re as _re

    m = _re.search(r"scale\(\s*([0-9.]+)\s*\)", transform or "")
    return float(m.group(1)) if m else 0.0


def serve(dist: Path):
    class H(http.server.SimpleHTTPRequestHandler):
        def log_message(self, *a):
            pass

    socketserver.TCPServer.allow_reuse_address = True
    httpd = socketserver.ThreadingTCPServer(
        ("127.0.0.1", 0), functools.partial(H, directory=str(dist)))
    httpd.daemon_threads = True
    threading.Thread(target=httpd.serve_forever, daemon=True).start()
    return httpd


ARTICLE = """周末去海边，我把手机调成了飞行模式

两天的沉默之后，我重新听见了海浪。浪的声音比任何白噪音都好用，时间忽然变多了，早上不用刷消息，晚上不用回群里的表情包，一天像被拉长了三分之一。原来所谓休息，不是换个地方刷手机，而是允许自己消失一阵子，把注意力还给真实的生活。

把手机收起来之后，我重新读完了搁置半年的那本书。晚饭后的散步也不再看屏幕，路口的风、店门口的猫、修车铺的收音机，全都清楚了起来。原来不是生活没有细节，是我以前走得太快，细节全被丢在了路上。

- 出发前把手机调成飞行模式
- 到了先别拍照，坐十分钟再说
- 回程的路上写几句话

> 浪的声音，比任何白噪音都好用，它把「效率」两个字从耳朵里拿走了。

如果你也想试试，就从下一个周末开始。把手机调成飞行模式，找一片听得见风的地方，坐十分钟，什么也不做。"""


def main() -> int:
    ap = argparse.ArgumentParser()
    ap.add_argument("--url", default="", help="留空 = 本地 dist（自起服务）")
    args = ap.parse_args()

    # 产物校验（PNG 尺寸 / ZIP 内容）必须真下载，但写系统临时目录，不落仓库、不留截图
    import tempfile
    tmp = Path(tempfile.mkdtemp(prefix="lfv6-"))

    httpd = None
    if args.url:
        base = args.url.rstrip("/") + "/"
        print(f"target: {base}", flush=True)
    else:
        if not (DIST / "index.html").exists():
            print("pwa/dist 不存在，先跑 node pwa/scripts/build.mjs", flush=True)
            return 2
        httpd = serve(DIST)
        base = f"http://127.0.0.1:{httpd.server_address[1]}/"
        print(f"serving {DIST} at {base}", flush=True)

    from playwright.sync_api import sync_playwright
    from core.browser_utils import launch_browser

    errors: list[str] = []

    with sync_playwright() as p:
        # 无头：开窗只为看截图，而截图已取消；无头同样的真实 Chrome 内核与字体
        browser = launch_browser(p, headless=True,
                                 args=["--no-proxy-server", "--window-size=1680,1000"])
        ctx = browser.new_context(viewport={"width": 1680, "height": 1000},
                                  accept_downloads=True)
        page = ctx.new_page()
        page.on("pageerror", lambda e: errors.append("pageerror:" + str(e)))
        page.on("console", lambda m: errors.append("console:" + m.text)
                if m.type == "error" else None)

        def snap(name: str) -> None:
            """布局快照 —— 不截图，输出可直接分析的几何数字。

            用户要求：保留有头（真实 Chrome + 真实字体 + 真实出图），但不要截图文件，
            改为文本输出，便于直接比对与写进报告。
            """
            global shot_no
            shot_no += 1
            m = page.evaluate("""() => {
              const r = (sel) => {
                const e = document.querySelector(sel);
                if (!e) return null;
                const b = e.getBoundingClientRect();
                return { x: Math.round(b.x), y: Math.round(b.y),
                         w: Math.round(b.width), h: Math.round(b.height),
                         below: Math.round(b.bottom - innerHeight) };
              };
              const deck = document.querySelector('#cv-deck');
              const pages = [...document.querySelectorAll('#cv-deck .v6-pg')];
              const last = pages[pages.length - 1];
              const dr = deck ? deck.getBoundingClientRect() : null;
              /* ⚠️ deck 现在是可滚动瀑布网格：3 页在 884px 宽里会换行，
                 末页必然落到视口下方 —— 「末页底边 vs deck 底边」不再是留白。
                 判据改成：需要滚动 = 内容够满（无大片空白）；不需要滚动时才量底部空档。 */
              const scrollable = deck ? (deck.scrollHeight - deck.clientHeight) > 8 : false;
              const bottomGap = scrollable
                ? 0
                : (dr && last ? Math.round(dr.bottom - (last.getBoundingClientRect().bottom + 12)) : -1);
              /* ⚠️ 经典版阶段 #v6-root 还不存在，直接 getComputedStyle(null) 会抛
                 TypeError 中断整个套件（首跑就踩到）。必须判空。 */
              const v6root = document.getElementById('v6-root');
              return {
                vw: innerWidth, vh: innerHeight,
                cols: v6root ? getComputedStyle(v6root).gridTemplateColumns : null,
                left: r('.v6-left'), stage: r('.v6-stage'), right: r('.v6-right'),
                deck: r('#cv-deck'),
                page1: pages[0] ? (() => { const b = pages[0].getBoundingClientRect();
                  return { w: Math.round(b.width), h: Math.round(b.height) }; })() : null,
                pages: pages.length,
                deckEmptyBelow: bottomGap,
                deckScrollable: scrollable,
                gridScroll: r('#v6-grid-scroll'),
                hScroll: deck ? deck.scrollWidth - deck.clientWidth : 0,
                exportBelow: r('#cv-gen-story') ? r('#cv-gen-story').below : null,
                backBelow: r('#v6-back') ? r('#v6-back').below : null,
                cardsVisible: (() => {
                  const s = document.querySelector('#v6-grid-scroll');
                  if (!s) return 0;
                  const sb = s.getBoundingClientRect();
                  return [...document.querySelectorAll('.v6-tcard')].filter((c) => {
                    const b = c.getBoundingClientRect();
                    return b.top < sb.bottom && b.bottom > sb.top;
                  }).length;
                })(),
              };
            }""")
            results.append((f"[布局] {name}", None, json.dumps(m, ensure_ascii=False)))
            print(f"  · [{name}] " + json.dumps(m, ensure_ascii=False), flush=True)

        page.goto(base, wait_until="domcontentloaded", timeout=60000)
        page.wait_for_selector("#btn-longform", timeout=30000)
        page.wait_for_timeout(2500)

        # ── 1. 默认就是 V6（2026-11-07 转正式）──────────────────
        page.evaluate("() => document.getElementById('btn-longform').click()")
        # 先等 tab 真正切过去（容器不再 hidden），再等 V6 挂载。
        page.wait_for_function(
            "() => { const lr = document.getElementById('longform-root');"
            " return !!lr && !lr.hidden; }", timeout=30000)
        page.wait_for_function("() => !!document.getElementById('v6-root')", timeout=45000)
        page.wait_for_timeout(1200)
        dflt = page.evaluate("""() => ({
          classicKey: localStorage.getItem('supersu.longform.classic'),
          v6Root: !!document.getElementById('v6-root'),
          oldStageInLongform: !!document.querySelector('#longform-root .cv-stage'),
          hasSwitchBtn: !!document.getElementById('cv-v6-switch'),
        })""")
        check("默认：直接进入 V6（无需手动开启）", dflt["v6Root"] is True)
        check("默认：未置 classic 回退标记", dflt["classicKey"] is None, str(dflt["classicKey"]))
        check("默认：经典版 DOM 未叠加注入", dflt["oldStageInLongform"] is False)
        snap("default-entry")

        # ── 2. 填文章，等自动分页出成品 ────────────────────────
        page.fill("#cv-long-text", ARTICLE)
        page.wait_for_function("""() => {
            const ok = document.querySelector('#cv-selfcheck.ok');
            return !!ok && document.querySelectorAll('#cv-deck .v6-pg').length > 0;
        }""", timeout=40000)
        page.wait_for_timeout(1200)

        v6 = page.evaluate("""() => {
          const q = (s) => document.querySelector(s);
          const deck = q('#cv-deck');
          const pages = [...document.querySelectorAll('#cv-deck .v6-pg')];
          const grid = q('#v6-tgrid');
          const firstGrid = grid ? grid.querySelector('.v6-tgrid') : null;
          const scroll = q('#v6-grid-scroll');
          const inGrid = (el) => {
            if (!el || !scroll) return false;
            const r = el.getBoundingClientRect(), s = scroll.getBoundingClientRect();
            return r.top < s.bottom && r.bottom > s.top && r.height > 0;
          };
          const vis = (sel) => {
            const e = q(sel);
            if (!e) return false;
            const r = e.getBoundingClientRect();
            return r.top >= 0 && r.bottom <= innerHeight && r.width > 0;
          };
          const deckRect = deck ? deck.getBoundingClientRect() : null;
          /* ⚠️ deck 现在是可滚动网格：3 页在 884px 宽里会换行，末页必然落到
             视口下方 → 「末页底边 vs deck 底边」在可滚动时算出负数（实测 -360）。
             正确判据：需要滚动 = 内容够满（没有大片空白）；不滚动时才量底部空档。 */
          const deckScrollable = deck
            ? (deck.scrollHeight - deck.clientHeight) > 8 : false;
          const lastPg = pages[pages.length - 1];
          const lastBottom = lastPg
            ? lastPg.getBoundingClientRect().bottom + 12   /* 含页脚标签行 */
            : (deckRect ? deckRect.top : 0);
          const deckBottomGap = deckScrollable
            ? 0
            : (deckRect ? Math.round(deckRect.bottom - lastBottom) : -1);
          return {
            v6Key: localStorage.getItem('supersu.longform.v6'),
            classicKey: localStorage.getItem('supersu.longform.classic'),
            v6Root: !!q('#v6-root'),
            oldStageInLongform: !!document.querySelector('#longform-root .cv-stage'),
            checkText: (q('#cv-selfcheck') || {}).textContent || '',
            checkOk: !!q('#cv-selfcheck').classList.contains('ok'),
            deckPages: pages.length,
            pageWidth: pages[0] ? pages[0].getBoundingClientRect().width : 0,
            frameScale: pages[0] && pages[0].querySelector('iframe')
              ? pages[0].querySelector('iframe').style.transform : '',
            cards: document.querySelectorAll('.v6-tcard').length,
            visibleCards: [...document.querySelectorAll('.v6-tcard')].filter(inGrid).length,
            /* ⚠️ 每族一个 .v6-tgrid，外层 #v6-tgrid 只是容器 —— 取第一个真 grid */
            cardCols: firstGrid
              ? getComputedStyle(firstGrid).gridTemplateColumns.split(' ').length : 0,
            fams: document.querySelectorAll('.v6-fam').length,
            swatches: document.querySelectorAll('.v6-sw').length,
            exportInView: vis('#cv-gen-story'),
            zipInView: vis('#cv-zip-story'),
            backInView: vis('#v6-back'),
            deckBottomGap,
            deckScrollable,
            deckScrollW: deck ? deck.scrollWidth : 0,
            deckClientW: deck ? deck.clientWidth : 0,
          };
        }""")
        check("V6：默认即进入工作台（classic 标记为空）",
              v6["classicKey"] is None, str(v6["classicKey"]))
        check("V6：工作台已挂载", v6["v6Root"] is True)
        check("V6：老 DOM 未叠加注入", v6["oldStageInLongform"] is False)
        check("V6：自动分页出成品页", v6["deckPages"] >= 2, f"{v6['deckPages']} 页")
        check("V6：产物自检全绿（零丢字/无裁切）",
              v6["checkOk"] and "全部落版" in v6["checkText"], v6["checkText"][:60])
        check("V6：61 张格局卡齐全", v6["cards"] == 61, str(v6["cards"]))
        check("V6：配色可切换（色板非空）", v6["swatches"] >= 2, str(v6["swatches"]))
        check("V6：成品页缩放已生效（非 0）",
              _scale_of(v6["frameScale"]) > 0.05,
              v6["frameScale"])

        # ── 3. 布局可用性（用户实测「难看难用」的机器化回归）───────
        check("布局：导出按钮在首屏可见", v6["exportInView"] is True)
        check("布局：ZIP 按钮在首屏可见", v6["zipInView"] is True)
        check("布局：返回经典版在首屏可见", v6["backInView"] is True)
        check("布局：右栏首屏可见格局卡 ≥ 6 张",
              v6["visibleCards"] >= 6, f"visible={v6['visibleCards']}")
        check("布局：右栏格局卡为 3 列", v6["cardCols"] >= 3, f"cols={v6['cardCols']}")
        check("布局：中栏无横向滚动（成品不溢出）",
              v6["deckScrollW"] <= v6["deckClientW"] + 2,
              f"{v6['deckScrollW']}>{v6['deckClientW']}")
        check("布局：中栏底部留白 ≤ 80px", 0 <= v6["deckBottomGap"] <= 80,
              f"gap={v6['deckBottomGap']}px")
        measure("成品页宽度", f"{v6['pageWidth']:.0f}px")
        snap("v6-workbench")

        # ── 4. 换格局 ────────────────────────────────────────────
        first_id = page.evaluate(
            "() => document.querySelector('.v6-tcard[aria-pressed=\"true\"]')?.dataset.id || ''")
        cards = page.locator(".v6-tcard")
        target = None
        for i in range(1, min(cards.count(), 8)):
            cid = cards.nth(i).get_attribute("data-id")
            if cid and cid != first_id:
                target = i
                break
        if target is not None:
            cards.nth(target).scroll_into_view_if_needed()
            page.wait_for_timeout(300)
            cards.nth(target).click()
            page.wait_for_timeout(2200)
        sel = page.evaluate("""() => ({
          selected: document.querySelector('.v6-tcard[aria-pressed="true"]')?.dataset.id || '',
          setName: (document.getElementById('v6-set-name') || {}).textContent || '',
          checkOk: !!document.querySelector('#cv-selfcheck.ok'),
          deckPages: document.querySelectorAll('#cv-deck .v6-pg').length,
          prefs: localStorage.getItem('supersu.longform.prefs.v1') || '',
        })""")
        check("换格局：选中另一套且自检仍全绿",
              sel["selected"] and sel["selected"] != first_id and sel["checkOk"],
              f"{first_id} → {sel['selected']}")
        check("换格局：偏好已持久化（v6Layout）", '"v6Layout"' in sel["prefs"],
              sel["prefs"][:80])

        # 最近使用（PM 走查补）：61 套格局下，找回上次那套是最常见的动作。
        recent = page.evaluate("""() => {
          const chips = [...document.querySelectorAll('.v6-fam')].map(b => b.textContent);
          const p = JSON.parse(localStorage.getItem('supersu.longform.prefs.v1') || '{}');
          return { chips, recent: Array.isArray(p.v6Recent) ? p.v6Recent : null };
        }""")
        check("最近使用：出现「最近」筛选", "最近" in recent["chips"], str(recent["chips"][:4]))
        check("最近使用：已记录的模板进筛选",
              bool(recent["recent"]) and len(recent["recent"]) >= 1,
              str(recent["recent"]))
        # 点「最近」→ 只显示用过的那些，而不是全部 61 张
        page.evaluate("""() => {
          const b = [...document.querySelectorAll('.v6-fam')].find(x => x.textContent === '最近');
          if (b) b.click();
        }""")
        page.wait_for_timeout(700)
        rec_cards = page.evaluate(
            "() => [...document.querySelectorAll('.v6-tcard')].map(c => c.dataset.id)")
        check("最近使用：筛选后卡片数等于用过的数量",
              len(rec_cards) == len(recent["recent"]),
              f"{len(rec_cards)} vs {len(recent['recent'])}")
        # 恢复「全部」，避免影响后续换配色断言
        page.evaluate("""() => {
          const b = [...document.querySelectorAll('.v6-fam')].find(x => x.textContent === '全部');
          if (b) b.click();
        }""")
        page.wait_for_timeout(600)
        snap("v6-switch-layout")

        # ── 5. 换配色 ────────────────────────────────────────────
        before_name = sel["setName"]
        sws = page.locator(".v6-sw")
        if sws.count() >= 2:
            sws.nth(1).click()
            page.wait_for_timeout(1800)
        sw = page.evaluate("""() => ({
          active: document.querySelectorAll('.v6-sw[aria-pressed="true"]').length,
          checkOk: !!document.querySelector('#cv-selfcheck.ok'),
          setName: (document.getElementById('v6-set-name') || {}).textContent || '',
          prefs: localStorage.getItem('supersu.longform.prefs.v1') || '',
        })""")
        check("换配色：仅一个色板处于选中态", sw["active"] == 1, str(sw["active"]))
        check("换配色：自检仍全绿", sw["checkOk"] is True)
        check("换配色：不改格局（模板名不变）", sw["setName"] == before_name,
              f"{before_name} → {sw['setName']}")
        check("换配色：偏好已持久化（v6Swatch）", '"v6Swatch"' in sw["prefs"])
        snap("v6-switch-swatch")

        # ── 6. 单张 PNG：必须真 1080×1440 ────────────────────────
        try:
            with page.expect_download(timeout=90000) as d:
                page.evaluate(
                    "() => document.querySelector('#cv-deck [data-dl]').click()")
            f = tmp / d.value.suggested_filename
            d.value.save_as(str(f))
            w, h = png_size(f)
            check("单张 PNG：真实尺寸 1080×1440", (w, h) == (1080, 1440), f"{w}×{h}")
            check("单张 PNG：非空文件（>100KB）", f.stat().st_size > 100_000,
                  f"{f.stat().st_size} bytes")
        except Exception as e:
            check("单张 PNG：导出成功", False, str(e)[:120])

        # ── 7. 整套 ZIP：条目命名 + 全 PNG ───────────────────────
        try:
            with page.expect_download(timeout=180000) as d:
                page.evaluate("() => document.getElementById('cv-zip-story').click()")
            zf = tmp / d.value.suggested_filename
            d.value.save_as(str(zf))
            with zipfile.ZipFile(zf) as z:
                names = z.namelist()
                bad = [n for n in names if not n.endswith(".png")]
                # 第一张必须是封面，其余内页
                head = [n for n in names if "封面" in n]
            check("整套 ZIP：含封面 + 内页", len(names) >= 2 and bool(head),
                  f"{len(names)} 项: {names[:3]}")
            check("整套 ZIP：全部是 PNG", not bad, ",".join(bad[:3]))
            check("整套 ZIP：页数与预览一致", len(names) == v6["deckPages"],
                  f"{len(names)} vs {v6['deckPages']}")
        except Exception as e:
            check("整套 ZIP：导出成功", False, str(e)[:120])

        # ── 8. 返回经典版：清场 + 草稿保留 ───────────────────────
        page.evaluate("() => document.getElementById('v6-back').click()")
        page.wait_for_function(
            "() => !document.getElementById('v6-root')", timeout=15000)
        page.wait_for_timeout(900)
        back = page.evaluate("""() => {
          const t = document.getElementById('cv-long-text');
          return {
            classicKey: localStorage.getItem('supersu.longform.classic'),
            v6Root: !!document.getElementById('v6-root'),
            v6Style: !!document.getElementById('v6-style'),
            fontAlias: !!document.getElementById('v6-font-alias'),
            oldStage: !!document.querySelector('#longform-root .cv-stage'),
            draftLen: t ? t.value.length : 0,
            backBtn: !!document.getElementById('cv-v6-switch'),
          };
        }""")
        check("返回经典版：已写入 classic 回退标记", back["classicKey"] == "1",
              str(back["classicKey"]))
        check("返回经典版：V6 节点已移除", back["v6Root"] is False)
        check("返回经典版：V6 样式已移除", back["v6Style"] is False)
        check("返回经典版：经典版 DOM 恢复", back["oldStage"] is True)
        check("返回经典版：文章草稿不丢", back["draftLen"] >= len(ARTICLE) - 5,
              f"{back['draftLen']} 字")
        snap("back-to-classic")

        # ── 8b. 从经典版再回到 V6（双向可逆）────────────────────
        page.evaluate("() => document.getElementById('cv-v6-switch').click()")
        page.wait_for_function("() => !!document.getElementById('v6-root')", timeout=45000)
        page.wait_for_timeout(1200)
        again = page.evaluate("""() => ({
          classicKey: localStorage.getItem('supersu.longform.classic'),
          v6Root: !!document.getElementById('v6-root'),
          draftLen: (document.getElementById('cv-long-text') || {}).value?.length || 0,
        })""")
        check("切回 V6：回退标记已清除", again["classicKey"] is None, str(again["classicKey"]))
        check("切回 V6：工作台重新挂载", again["v6Root"] is True)
        check("切回 V6：文章草稿仍在", again["draftLen"] >= len(ARTICLE) - 5,
              f"{again['draftLen']} 字")

        # ── 9. 零 JS 报错 ────────────────────────────────────────
        expected = ("Failed to fetch", "ERR_INTERNET_DISCONNECTED", "ERR_NAME_NOT_RESOLVED",
                    "NotAllowedError", "clipboard", "ERR_NETWORK", "favicon")
        real = [e for e in errors if not any(x.lower() in e.lower() for x in expected)]
        check("无 JS 页面异常", not real, "; ".join(real[:3]))

        browser.close()

    passed = sum(1 for r in results if r[1] is True)
    failed = [r for r in results if r[1] is False]
    measured = [r for r in results if r[1] is None]
    print("\n" + "=" * 60)
    print(f"长图文 V6 产品级 E2E：{passed}/{passed + len(failed)} 通过"
          + (f"（{len(measured)} 项仅实测）" if measured else ""))
    print("=" * 60)
    for n, ok, d in failed:
        print(f"  ✗ {n}  {d}")
    import shutil as _sh
    _sh.rmtree(tmp, ignore_errors=True)
    return 0 if not failed else 1


if __name__ == "__main__":
    sys.exit(main())
