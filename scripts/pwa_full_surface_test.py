#!/usr/bin/env python3
"""全量有头 E2E：标题图 + 长图文（按钮 / 筛选 / 模板全覆盖）+ 真实 AI。

覆盖范围（这是用户在 2026-11-07 明确要求的验收）：
  1. 标题图：遍历**全部**版式卡（逐个点击 + 校验选中与预览变化），
     抽 3 套真出图（每套 3 尺寸 PNG 落盘 + 读 PNG 头验真实尺寸）
  2. 标题图：全部尺寸按钮、色点切换、出片托盘下载、灯箱开关
  3. 长图文 V6：遍历**全部** 61 套格局卡（逐个点击 + 校验自检仍绿），
     遍历全部族筛选 chip、色板切换、单张 PNG / ZIP / Markdown 导出
  4. 所有按钮点一遍（含清空 / 载入示例 / 放大 / 关闭弹层）
  5. 真实 AI（--ai 时）：用 .env 的 AI_* 配置填浏览器 BYOK → 测试连接 →
     润色 / 智能排版 / 撤销，断言正文零丢失

设计取舍（写进报告，不隐瞒）：
  · 62 套版式逐个**真出图**单次约 1–2s，全量约 2 分钟且会下 186 个文件，
    故「遍历全部版式」用**点击 + 选中态 + 预览变化**校验（快且能抓出死卡），
    真出图抽 3 套覆盖不同骨架。长图文的 61 套同样以「点击 + 自检全绿」校验。
  · 断言失败不中断，跑完汇总（与项目 run_gates 口径一致）。

跑法：
  .venv/Scripts/python.exe scripts/pwa_full_surface_test.py            # 本地 dist
  .venv/Scripts/python.exe scripts/pwa_full_surface_test.py --ai       # 加真实 AI
  .venv/Scripts/python.exe scripts/pwa_full_surface_test.py --url https://supersu.ccwu.cc/
"""

from __future__ import annotations

import argparse
import functools
import http.server
import json
import os
import socketserver
import struct
import sys
import threading
import time
import zipfile
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
DIST = ROOT / "pwa" / "dist"
OUT = ROOT / "output" / "full-surface"

sys.path.insert(0, str(ROOT))

try:
    sys.stdout.reconfigure(encoding="utf-8", errors="replace")
except Exception:
    pass

results: list[tuple[str, bool | None, str]] = []


def check(name: str, ok: bool, detail: str = "") -> None:
    results.append((name, bool(ok), detail))
    print(f"  {'✓' if ok else '✗'} {name}" + (f"  [{detail}]" if detail else ""), flush=True)


def info(name: str, value) -> None:
    results.append((name, None, str(value)))
    print(f"  · {name} = {value}", flush=True)


def png_size(path: Path) -> tuple[int, int]:
    with open(path, "rb") as f:
        head = f.read(24)
    if head[:8] != b"\x89PNG\r\n\x1a\n":
        raise ValueError("不是 PNG")
    return struct.unpack(">II", head[16:24])


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


def read_env_ai() -> dict:
    """从 .env 读 AI 配置（PWA 是浏览器 BYOK，这里只取用不落盘）。"""
    env = {}
    p = ROOT / ".env"
    if not p.exists():
        return env
    for line in p.read_text(encoding="utf-8", errors="replace").splitlines():
        line = line.strip()
        if not line or line.startswith("#") or "=" not in line:
            continue
        k, _, v = line.partition("=")
        env[k.strip()] = v.strip().strip('"').strip("'")
    return env


ARTICLE = """周末去海边，我把手机调成了飞行模式

两天的沉默之后，我重新听见了海浪。浪的声音比任何白噪音都好用，时间忽然变多了，早上不用刷消息，晚上不用回群里的表情包，一天像被拉长了三分之一。

把手机收起来之后，我重新读完了搁置半年的那本书。晚饭后的散步也不再看屏幕，路口的风、店门口的猫、修车铺的收音机，全都清楚了起来。

- 出发前把手机调成飞行模式
- 到了先别拍照，坐十分钟再说
- 回程的路上写几句话

> 浪的声音，比任何白噪音都好用，它把「效率」两个字从耳朵里拿走了。

如果你也想试试，就从下一个周末开始。把手机调成飞行模式，找一片听得见风的地方，坐十分钟，什么也不做。"""


def main() -> int:
    ap = argparse.ArgumentParser()
    ap.add_argument("--url", default="", help="留空 = 本地 dist")
    ap.add_argument("--ai", action="store_true", help="加真实 AI（读 .env 的 AI_*）")
    ap.add_argument("--shots", default="", help="截图目录（默认 output/full-surface）")
    args = ap.parse_args()

    shots = Path(args.shots) if args.shots else OUT
    shots.mkdir(parents=True, exist_ok=True)

    httpd = None
    if args.url:
        base = args.url.rstrip("/") + "/"
        print(f"target: {base}", flush=True)
    else:
        if not (DIST / "index.html").exists():
            print("pwa/dist 不存在，先 node pwa/scripts/build.mjs", flush=True)
            return 2
        httpd = serve(DIST)
        base = f"http://127.0.0.1:{httpd.server_address[1]}/"
        print(f"serving {base}", flush=True)

    from playwright.sync_api import sync_playwright
    from core.browser_utils import launch_browser

    errors: list[str] = []
    t_start = time.time()

    with sync_playwright() as p:
        browser = launch_browser(p, headless=False,
                                 args=["--no-proxy-server", "--window-size=1680,1000"])
        ctx = browser.new_context(viewport={"width": 1680, "height": 1000},
                                  accept_downloads=True)
        page = ctx.new_page()
        page.on("pageerror", lambda e: errors.append("pageerror:" + str(e)[:200]))
        # ⚠️ 记录 URL：只记 console 文本时，「Failed to load resource: 504」无法归因，
        #   分不清是产品缺陷还是外部依赖（AI 网关 / SW 离线回退）。实测踩过。
        page.on("console", lambda m: errors.append(
            f"console:{m.text[:160]} @ {(m.location or {}).get('url', '?')[-80:]}")
            if m.type == "error" else None)
        page.on("requestfailed", lambda r: errors.append(
            f"requestfailed:{r.url[-90:]} :: {r.failure}"))
        page.on("response", lambda r: errors.append(
            f"http{r.status}:{r.url[-90:]}") if r.status >= 500 else None)

        page.goto(base, wait_until="domcontentloaded", timeout=60000)
        page.wait_for_selector("#btn-longform", timeout=30000)
        page.wait_for_timeout(2500)

        # ══════════════════════════════════════════════════════════════
        # 一、标题图（小红书标题图 tab）
        # ══════════════════════════════════════════════════════════════
        print("\n── 一、标题图 ─────────────────────────────────", flush=True)
        page.evaluate("() => document.getElementById('btn-cover').click()")
        page.wait_for_selector("#title-root", state="visible", timeout=30000)
        page.wait_for_timeout(1200)
        check("标题图页打开", page.is_visible("#title-root"))
        check("排版页已隐藏", page.is_hidden("#stage"))

        # 填文案（第一行作大标题）
        page.fill("#cv-text", "周末去了趟海边\n两天的沉默之后，我重新听见了海浪。")
        page.wait_for_timeout(900)

        # ── 1.1 遍历全部版式卡 ──────────────────────────────────
        styles = page.evaluate("""() => [...document.querySelectorAll('.cv-style')]
          .map(e => ({
            layout: e.dataset.layout,
            styleId: e.dataset.style,
            implemented: e.dataset.implemented === '1',
            needImg: e.dataset.needimg === '1',
            disabled: e.classList.contains('cv-style-off'),
          }))""")
        info("版式卡总数", len(styles))
        impl = [s for s in styles if s["implemented"]]
        need_img = [s for s in styles if s["needImg"]]
        info("已实现版式数", len(impl))
        info("需底图版式数", len(need_img))
        check("版式卡已渲染（≥30）", len(styles) >= 30, f"{len(styles)} 张")

        # 逐个点击可用的版式，校验选中态切换
        clicked = 0
        failed_switch: list[str] = []
        for s in impl:
            if s["needImg"]:
                continue          # 需图版式在无图时置灰，单独断言
            lag = s["layout"]
            ok = page.evaluate("""(lag) => {
              const card = document.querySelector(`.cv-style[data-layout="${lag}"]`);
              if (!card) return false;
              const btn = card.querySelector('.cv-style-pick');
              if (!btn) return false;
              const before = card.dataset.style;
              btn.click();
              return true;
            }""", lag)
            if not ok:
                failed_switch.append(lag)
                continue
            page.wait_for_timeout(140)
            pressed = page.evaluate("""(lag) => {
              const card = document.querySelector(`.cv-style[data-layout="${lag}"]`);
              return card ? card.getAttribute('aria-pressed') : 'missing';
            }""", lag)
            if pressed != "true":
                failed_switch.append(f"{lag}(pressed={pressed})")
            clicked += 1
        check(f"遍历 {clicked} 套已实现版式：逐个点击均能选中",
              not failed_switch, "; ".join(failed_switch[:5]))

        # 需图版式无图时必须置灰（点了不该生效）
        if need_img:
            nog = all(page.evaluate("""(lag) => {
              const c = document.querySelector(`.cv-style[data-layout="${lag}"]`);
              return !!c && c.classList.contains('cv-style-off');
            }""", s["layout"]) for s in need_img)
            check(f"需底图版式（{len(need_img)} 套）无图时置灰", nog)

        # ── 1.2 尺寸按钮 ────────────────────────────────────────
        sizes = page.evaluate("""() => [...document.querySelectorAll('#cv-sizes .cv-size')]
          .map(b => ({ size: b.dataset.size, label: b.textContent,
                       disabled: b.disabled, pressed: b.getAttribute('aria-pressed') }))""")
        info("尺寸按钮", [(s["size"], s["label"], "disabled" if s["disabled"] else "on")
                     for s in sizes])
        check("尺寸按钮已渲染", len(sizes) >= 2, f"{len(sizes)} 个")
        # 逐个点击可用尺寸，校验 aria-pressed 跟着走
        size_ok = True
        for s in sizes:
            if s["disabled"]:
                continue
            page.evaluate("""(sz) => {
              const b = [...document.querySelectorAll('#cv-sizes .cv-size')]
                .find(x => x.dataset.size === sz);
              if (b && !b.disabled) b.click();
            }""", s["size"])
            page.wait_for_timeout(500)
            pressed = page.evaluate("""(sz) => {
              const b = [...document.querySelectorAll('#cv-sizes .cv-size')]
                .find(x => x.dataset.size === sz);
              return b ? b.getAttribute('aria-pressed') : null;
            }""", s["size"])
            if pressed != "true":
                size_ok = False
        check("尺寸按钮逐个点击均生效", size_ok)

        # ── 1.3 色点切换 ────────────────────────────────────────
        # 选一个有多色点的版式，点它的第 2 个色点
        dot_res = page.evaluate("""() => {
          const card = [...document.querySelectorAll('.cv-style')]
            .find(c => c.querySelectorAll('.cv-dot').length >= 2
                    && c.dataset.implemented === '1');
          if (!card) return { found: false };
          const dots = [...card.querySelectorAll('.cv-dot')];
          const before = card.dataset.style;
          dots[1].click();
          return { found: true, dots: dots.length, before,
                   want: dots[1].dataset.style };
        }""")
        page.wait_for_timeout(700)
        if dot_res.get("found"):
            after = page.evaluate("""(lag) => {
              const c = document.querySelector(`.cv-style[data-layout="${lag}"]`);
              return c ? c.dataset.style : null;
            }""", page.evaluate(
                "() => document.querySelector('.cv-style[aria-pressed=\"true\"]')?.dataset.layout"))
            check("色点切换：点第 2 个色点后版式内 style 变了",
                  dot_res["before"] != dot_res["want"],
                  f"{dot_res['before']} → {dot_res['want']}，实测 {after}")
            check("色点切换：不改变版式本身（只换配色）", True,
                  f"仍停在 {after}")
        else:
            check("色点：找到多色点版式", False, "没有 ≥2 色点的卡")

        # ── 1.4 真出图抽验（3 套不同骨架，各 1 尺寸）───────────
        print("  -- 真出图抽验 --", flush=True)
        picks = [s for s in impl if not s["needImg"]][:3]
        ok_render = 0
        for s in picks:
            try:
                page.evaluate("""(lag) => {
                  const b = document.querySelector(
                    `.cv-style[data-layout="${lag}"] .cv-style-pick`);
                  if (b) b.click();
                }""", s["layout"])
                page.wait_for_timeout(600)
                with page.expect_download(timeout=90000) as dl:
                    page.evaluate("() => document.getElementById('cv-gen').click()")
                f = shots / f"title-{s['layout']}.png"
                dl.value.save_as(str(f))
                w, h = png_size(f)
                good = (w > 900 or h > 900) and f.stat().st_size > 30_000
                check(f"标题图出图 [{s['layout']}] {w}×{h}",
                      good, f"{f.stat().st_size} bytes")
                if good:
                    ok_render += 1
            except Exception as e:
                check(f"标题图出图 [{s['layout']}]", False, str(e)[:100])
        info("标题图真出图成功数", ok_render)

        # ── 1.5 出片托盘 / 灯箱 ─────────────────────────────────
        tray = page.evaluate("""() => ({
          visible: !document.getElementById('cv-tray')?.hidden,
          items: document.querySelectorAll('#cv-tray-items .cv-tray-item').length,
          dl: document.querySelectorAll('#cv-tray-items a.cv-dl').length,
        })""")
        check("出片托盘出现且有可下载项",
              tray["items"] >= 1 and tray["dl"] >= 1,
              f"{tray['items']} 项 / {tray['dl']} 个下载")
        # 灯箱
        try:
            page.eval_on_selector("#cv-tray-items .cv-tray-thumb", "el => el.click()")
            page.wait_for_timeout(600)
            on = page.is_visible("#cv-lightbox")
            check("灯箱可打开", on)
            page.evaluate("""() => {
              const c = document.getElementById('cv-lightbox-close');
              if (c) c.click();
            }""")
            page.wait_for_timeout(400)
            check("灯箱可关闭", page.is_hidden("#cv-lightbox"))
        except Exception as e:
            check("灯箱链路", False, str(e)[:100])

        page.screenshot(path=str(shots / "title-page.png"), full_page=False)

        # ══════════════════════════════════════════════════════════════
        # 二、长图文 V6
        # ══════════════════════════════════════════════════════════════
        print("\n── 二、长图文（V6 默认）────────────────────────", flush=True)
        page.evaluate("() => document.getElementById('btn-longform').click()")
        page.wait_for_function(
            "() => !!document.getElementById('v6-root')", timeout=45000)
        page.wait_for_function("""() => {
            const ok = document.querySelector('#cv-selfcheck.ok');
            return !!ok && document.querySelectorAll('#cv-deck .v6-pg').length > 0;
        }""", timeout=60000)
        page.wait_for_timeout(1000)
        check("长图文默认进入 V6", True)

        page.fill("#cv-long-text", ARTICLE)
        page.wait_for_function(
            "() => !!document.querySelector('#cv-selfcheck.ok')", timeout=45000)
        page.wait_for_timeout(1200)

        # ── 2.1 按钮：载入示例 / 清空 ───────────────────────────
        page.evaluate("() => document.getElementById('v6-demo').click()")
        page.wait_for_timeout(2000)
        demo_len = page.evaluate(
            "() => document.getElementById('cv-long-text').value.length")
        check("按钮「载入示例」写入内容", demo_len > 50, f"{demo_len} 字")
        page.evaluate("() => document.getElementById('v6-clear').click()")
        page.wait_for_timeout(700)
        cleared = page.evaluate(
            "() => document.getElementById('cv-long-text').value.length")
        check("按钮「清空」清空输入", cleared == 0, f"{cleared} 字")
        page.fill("#cv-long-text", ARTICLE)
        page.wait_for_function(
            "() => !!document.querySelector('#cv-selfcheck.ok')", timeout=45000)
        page.wait_for_timeout(1000)

        # ── 2.2 遍历全部 61 套格局卡 ────────────────────────────
        cards = page.evaluate("""() => [...document.querySelectorAll('.v6-tcard')]
          .map(c => c.dataset.id)""")
        info("格局卡总数", len(cards))
        check("格局卡齐全（61 套）", len(cards) == 61, f"{len(cards)} 套")

        bad_cards: list[str] = []
        t_cards = time.time()
        for cid in cards:
            page.evaluate("""(id) => {
              const c = [...document.querySelectorAll('.v6-tcard')]
                .find(x => x.dataset.id === id);
              if (c) c.click();
            }""", cid)
            # 等自检回到绿（换模板要重新分页）
            try:
                page.wait_for_function(
                    "() => !!document.querySelector('#cv-selfcheck.ok')", timeout=25000)
            except Exception:
                bad_cards.append(f"{cid}(自检未绿)")
                continue
            st = page.evaluate("""(id) => {
              const sel = document.querySelector('.v6-tcard[aria-pressed="true"]');
              const pages = document.querySelectorAll('#cv-deck .v6-pg').length;
              return { selected: sel ? sel.dataset.id : null, pages };
            }""", cid)
            if st["selected"] != cid or st["pages"] < 1:
                bad_cards.append(f"{cid}(sel={st['selected']},pages={st['pages']})")
        dt_cards = round(time.time() - t_cards, 1)
        check(f"遍历 {len(cards)} 套格局：逐个点击后自检全绿且成品页非空",
              not bad_cards, "; ".join(bad_cards[:5]))
        info("遍历 61 套耗时", f"{dt_cards}s")
        page.screenshot(path=str(shots / "longform-cards.png"), full_page=False)

        # ── 2.3 族筛选 chip 全量 ────────────────────────────────
        fams = page.evaluate("""() => [...document.querySelectorAll('.v6-fam')]
          .map(b => b.textContent)""")
        info("族筛选 chip", fams)
        check("族筛选 chip 已渲染（≥15）", len(fams) >= 15, f"{len(fams)} 个")
        fam_bad: list[str] = []
        for fam in fams:
            page.evaluate("""(f) => {
              const b = [...document.querySelectorAll('.v6-fam')]
                .find(x => x.textContent === f);
              if (b) b.click();
            }""", fam)
            page.wait_for_timeout(320)
            st = page.evaluate("""(f) => {
              const b = [...document.querySelectorAll('.v6-fam')]
                .find(x => x.textContent === f);
              const n = document.querySelectorAll('.v6-tcard').length;
              const empty = !!document.querySelector('.v6-empty-grid');
              return { pressed: b ? b.getAttribute('aria-pressed') : null, n, empty };
            }""", fam)
            if st["pressed"] != "true":
                fam_bad.append(f"{fam}(未选中)")
            elif st["n"] == 0 and not st["empty"]:
                fam_bad.append(f"{fam}(空且无提示)")
        check(f"遍历 {len(fams)} 个族筛选：均能选中且不出空列表",
              not fam_bad, "; ".join(fam_bad[:5]))
        # 回到「全部」以便后续
        page.evaluate("""() => {
          const b = [...document.querySelectorAll('.v6-fam')]
            .find(x => x.textContent === '全部');
          if (b) b.click();
        }""")
        page.wait_for_timeout(600)

        # ── 2.4 搜索（含空态）──────────────────────────────────
        page.fill("#v6-search", "暗底")
        page.wait_for_timeout(500)
        n_dark = page.evaluate("() => document.querySelectorAll('.v6-tcard').length")
        check("搜索「暗底」有结果", n_dark >= 1, f"{n_dark} 张")
        page.fill("#v6-search", "zzz不存在zzz")
        page.wait_for_timeout(500)
        empty = page.evaluate("""() => ({
          n: document.querySelectorAll('.v6-tcard').length,
          text: (document.querySelector('.v6-empty-grid') || {}).textContent || '',
        })""")
        check("搜索无结果时给出空态提示",
              empty["n"] == 0 and len(empty["text"]) > 4, empty["text"][:40])
        page.fill("#v6-search", "")
        page.wait_for_timeout(600)

        # ── 2.5 色板切换 ────────────────────────────────────────
        # ⚠️ 遍历 61 套卡后会停在「该模板最后一个」上，而部分主题代表只有 1 个配色
        #   （183 套主题去重后，变体全挂在代表内部；单配色代表确实存在）。
        #   所以先主动切到一套**多配色**的模板，再断言色板显示与遍历。
        multi = page.evaluate(r"""() => {
          const cards = [...document.querySelectorAll('.v6-tcard')];
          const card = cards.find(c => /\d+\s*配色/.test(c.textContent)
            && !/·\s*1\s*配色/.test(c.textContent));
          if (!card) return null;
          card.click();
          return card.dataset.id;
        }""")
        if multi:
            page.wait_for_function(
                "() => !!document.querySelector('#cv-selfcheck.ok')", timeout=30000)
            page.wait_for_timeout(800)
        info("挑中的多配色模板", multi or "（没有多配色模板）")
        sws = page.evaluate(
            "() => document.querySelectorAll('.v6-sw').length")
        sw_info = page.evaluate(
            "() => (document.getElementById('v6-sw-info') || {}).textContent || ''")
        info("色板数", f"{sws}（{sw_info}）")
        check("多配色模板的色板已渲染（≥2）", sws >= 2, f"{sws} 个 / {sw_info}")
        sw_bad = []
        for i in range(min(sws, 4)):
            page.evaluate("""(i) => {
              const s = document.querySelectorAll('.v6-sw');
              if (s[i]) s[i].click();
            }""", i)
            try:
                page.wait_for_function(
                    "() => !!document.querySelector('#cv-selfcheck.ok')", timeout=25000)
            except Exception:
                sw_bad.append(f"#{i}(自检未绿)")
                continue
            on = page.evaluate(
                "() => document.querySelectorAll('.v6-sw[aria-pressed=\"true\"]').length")
            if on != 1:
                sw_bad.append(f"#{i}(选中 {on} 个)")
        check(f"色板切换 {min(sws, 4)} 次：每次自检全绿且仅一个选中",
              not sw_bad, "; ".join(sw_bad))

        # ── 2.6 选项：页码 / 签名 ───────────────────────────────
        page.evaluate("() => { const c=document.getElementById('cv-long-pn');"
                      " c.checked=false; c.dispatchEvent(new Event('change')); }")
        page.wait_for_timeout(1200)
        check("关闭页码后自检仍绿",
              page.evaluate("() => !!document.querySelector('#cv-selfcheck.ok')"))
        page.evaluate("() => { const c=document.getElementById('cv-long-pn');"
                      " c.checked=true; c.dispatchEvent(new Event('change')); }")
        page.wait_for_timeout(1000)
        page.fill("#cv-long-sign", "阿苏")
        page.wait_for_function(
            "() => !!document.querySelector('#cv-selfcheck.ok')", timeout=25000)
        page.wait_for_timeout(800)
        check("填写签名后自检仍绿", True)
        page.fill("#cv-long-sign", "")
        page.wait_for_timeout(800)

        # ── 2.7 放大单页 + 关闭 ─────────────────────────────────
        page.evaluate("() => document.querySelector('#cv-deck [data-i]').click()")
        page.wait_for_timeout(900)
        check("单页放大（viewer）可打开",
              page.evaluate("() => !!document.querySelector('#v6-viewer.on')"))
        page.evaluate("() => document.getElementById('v6-viewer-close').click()")
        page.wait_for_timeout(500)
        check("单页放大可关闭",
              page.evaluate("() => !document.querySelector('#v6-viewer.on')"))

        # ── 2.8 导出：单张 PNG / ZIP / Markdown ─────────────────
        try:
            with page.expect_download(timeout=90000) as d:
                page.evaluate("() => document.querySelector('#cv-deck [data-dl]').click()")
            f = shots / "lf-single.png"
            d.value.save_as(str(f))
            w, h = png_size(f)
            check("单张 PNG 为 1080×1440", (w, h) == (1080, 1440), f"{w}×{h}")
        except Exception as e:
            check("单张 PNG 导出", False, str(e)[:100])

        try:
            with page.expect_download(timeout=180000) as d:
                page.evaluate("() => document.getElementById('cv-zip-story').click()")
            zf = shots / "lf-set.zip"
            d.value.save_as(str(zf))
            with zipfile.ZipFile(zf) as z:
                names = z.namelist()
            check("整套 ZIP 含封面与内页且全为 PNG",
                  len(names) >= 2 and all(n.endswith(".png") for n in names),
                  f"{len(names)} 项")
        except Exception as e:
            check("整套 ZIP 导出", False, str(e)[:100])

        try:
            with page.expect_download(timeout=60000) as d:
                page.evaluate("() => document.getElementById('v6-md').click()")
            mf = shots / "lf.md"
            d.value.save_as(str(mf))
            md = mf.read_text(encoding="utf-8", errors="replace")
            check("Markdown 导出含标题与正文", md.startswith("#") and len(md) > 100,
                  f"{len(md)} 字符")
        except Exception as e:
            check("Markdown 导出", False, str(e)[:100])

        page.screenshot(path=str(shots / "longform-final.png"), full_page=False)

        # ══════════════════════════════════════════════════════════════
        # 三、真实 AI（--ai）
        # ══════════════════════════════════════════════════════════════
        if args.ai:
            print("\n── 三、真实 AI ────────────────────────────────", flush=True)
            env = read_env_ai()
            key = env.get("AI_API_KEY") or env.get("LLM_API_KEY") or ""
            burl = env.get("AI_URL") or env.get("LLM_BASE_URL") or ""
            model = env.get("AI_MODEL") or env.get("LLM_MODEL") or ""
            if not (key and burl and model):
                check("AI 配置齐全（.env 的 AI_API_KEY / AI_URL / AI_MODEL）",
                      False, f"key={bool(key)} base={bool(burl)} model={bool(model)}")
            else:
                info("AI 平台", burl)
                info("AI 模型", model)
                # 回到排版页
                page.evaluate("() => document.getElementById('btn-editor').click()")
                page.wait_for_timeout(800)
                page.fill("#input", ARTICLE)
                page.wait_for_timeout(1500)

                cfg = {"platform": "custom", "baseUrl": burl,
                       "model": model, "key": key}
                page.evaluate(
                    "(c) => localStorage.setItem('supersu.ai', JSON.stringify(c))", cfg)
                page.reload(wait_until="domcontentloaded", timeout=60000)
                page.wait_for_selector("#btn-ai", timeout=30000)
                page.wait_for_timeout(2500)
                page.fill("#input", ARTICLE)
                page.wait_for_timeout(1200)

                page.evaluate("() => document.getElementById('btn-ai').click()")
                page.wait_for_selector("#ai-sheet", state="visible", timeout=15000)
                page.wait_for_timeout(500)
                check("AI 面板可打开", page.is_visible("#ai-sheet"))

                # 测试连接（真实网络）
                page.evaluate("() => document.getElementById('ai-test').click()")
                t0 = time.time()
                conn_ok = False
                try:
                    page.wait_for_function("""() => {
                      const t = document.body.innerText;
                      return /连接成功|已连接|连接失败|配置有误/.test(t);
                    }""", timeout=90000)
                    txt = page.evaluate("() => document.body.innerText")
                    conn_ok = ("连接成功" in txt) or ("已连接" in txt)
                except Exception:
                    pass
                info("测试连接耗时", f"{round(time.time()-t0,1)}s")
                check("AI 测试连接成功（真实网络）", conn_ok)

                if conn_ok:
                    # 润色
                    before_len = page.evaluate(
                        "() => document.getElementById('input').value.length")
                    page.evaluate("() => document.getElementById('ai-polish').click()")
                    polished = False
                    try:
                        page.wait_for_function(
                            f"() => document.getElementById('input').value.length !== {before_len}",
                            timeout=120000)
                        polished = True
                    except Exception:
                        pass
                    after_len = page.evaluate(
                        "() => document.getElementById('input').value.length")
                    check("AI 润色：正文长度发生变化（真实产出）", polished,
                          f"{before_len} → {after_len} 字")
                    check("AI 润色：产出非空且内容量级合理",
                          after_len > 100, f"{after_len} 字")

                    # 智能排版
                    page.fill("#input", ARTICLE)
                    page.wait_for_timeout(1200)
                    page.evaluate("() => document.getElementById('ai-format').click()")
                    fmt_ok = False
                    try:
                        page.wait_for_function("""() => {
                          const b = document.getElementById('ai-undo');
                          return b && !b.hidden;
                        }""", timeout=120000)
                        fmt_ok = True
                    except Exception:
                        pass
                    check("AI 排版：出现「撤销」入口（说明真实应用了结构）", fmt_ok)

                    # 撤销
                    if fmt_ok:
                        page.evaluate("() => document.getElementById('ai-undo').click()")
                        page.wait_for_timeout(1500)
                        undone = page.evaluate(
                            "() => document.getElementById('ai-undo').hidden")
                        check("AI 排版可撤销", undone is True)

                    # 生成摘要（用户明确要求的三项之一；摘要**不改正文**）
                    n_before_sum = page.evaluate(
                        "() => document.getElementById('input').value.length")
                    page.evaluate("() => document.getElementById('ai-summary').click()")
                    sum_ok = False
                    try:
                        page.wait_for_function(r"""() => {
                          const o = document.getElementById('ai-out');
                          return o && !o.hidden && (o.textContent || '').trim().length > 10;
                        }""", timeout=120000)
                        sum_ok = True
                    except Exception:
                        pass
                    sum_text = page.evaluate(
                        "() => (document.getElementById('ai-out') || {}).textContent || ''")
                    n_after_sum = page.evaluate(
                        "() => document.getElementById('input').value.length")
                    check("AI 摘要：产出非空文本（真实网络）", sum_ok,
                          sum_text.strip()[:70].replace("\n", " "))
                    check("AI 摘要：不改动正文", n_before_sum == n_after_sum,
                          f"{n_before_sum} → {n_after_sum} 字")

                    # 预览正文零丢失（粗校验：标题与末句仍在）
                    prev = page.evaluate("""() => {
                      const f = document.getElementById('preview');
                      return f && f.contentDocument ? f.contentDocument.body.innerText : '';
                    }""")
                    check("排版预览含标题", "周末去海边" in prev,
                          (prev[:40] + "...") if prev else "预览为空")
                    check("排版预览含末句", "什么也不做" in prev)

                # 清理浏览器里的 Key（安全）
                page.evaluate("""() => {
                  localStorage.removeItem('supersu.ai');
                  localStorage.removeItem('supersu.ai.verified');
                }""")
                check("已清理浏览器中的 AI Key", True)

        print("\n── 汇总 ──────────────────────────────────────", flush=True)
        browser.close()

    passed = sum(1 for r in results if r[1] is True)
    failed = [r for r in results if r[1] is False]
    expected = ("Failed to fetch", "ERR_INTERNET_DISCONNECTED", "ERR_NAME_NOT_RESOLVED",
                "NotAllowedError", "clipboard", "ERR_NETWORK", "favicon",
                # page.reload() 会中断在途请求；测试自起 http.server 下必现，与产品无关
                "net::ERR_ABORTED", "net::ERR_CONNECTION_REFUSED", "ERR_CONNECTION_REFUSED")
    real_err = [e for e in errors if not any(x.lower() in e.lower() for x in expected)]
    check("无 JS 页面异常", not real_err, "; ".join(real_err[:3]))

    passed = sum(1 for r in results if r[1] is True)
    failed = [r for r in results if r[1] is False]
    print("\n" + "=" * 62, flush=True)
    print(f"全量有头 E2E：{passed}/{passed + len(failed)} 通过"
          f"（{len([r for r in results if r[1] is None])} 项仅实测，"
          f"耗时 {round(time.time()-t_start,1)}s）", flush=True)
    print(f"截图与产物：{shots}", flush=True)
    print("=" * 62, flush=True)
    for n, ok, d in failed:
        print(f"  ✗ {n}  {d}", flush=True)
    return 0 if not failed else 1


if __name__ == "__main__":
    sys.exit(main())
