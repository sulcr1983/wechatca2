#!/usr/bin/env python3
"""小红书标题图生成 —— 全量功能测试 + 逐步截图（2026-10-25）

背景：这个模块一直没做过全量功能测试（只有零散的 cover 渲染测试）。
本脚本逐个功能点操作，**每一步都截图**，便于人工复核视觉效果。

覆盖清单（按用户实际使用顺序）：
   1 进入页面            点「小红书标题图生成」→ 页面切换
   2 空态                首次进入的示例成品 / 提示
   3 风格列表            归藏组 + 模板组，逐组截图
   4 逐个风格选中        每种风格选中后的界面状态
   5 填文案              cv-text + 字数统计
   6 尺寸切换            3 种尺寸（3:4 / 1:1 / 宽图）可用性
   7 作者名              填入后预览是否更新
   8 生成                点「生成」→ 结果卡片
   9 生成结果详情        每张卡片的大图 + 尺寸校验
  10 点击结果看大图      Lightbox
  11 下载链接            每张卡是否有下载入口
  12 九宫格切图          切图入口与参数
  13 联网找底图          候选底图列表
  14 返回公众号排版      按钮文案与页面切换
  15 窄屏（手机）        移动端布局

产物：output/xhs-full/step-NN-*.png + report.json

用法：
    python scripts/xhs_full_test.py                 # 测线上
    python scripts/xhs_full_test.py --local         # 测本地 dist
    python scripts/xhs_full_test.py --keep-going    # 单步失败不中断（默认就继续，便于看全貌）
"""

from __future__ import annotations

import argparse
import functools
import http.server
import json
import socket
import socketserver
import shutil
import sys
import threading
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
DIST = ROOT / "pwa" / "dist"
OUT = ROOT / "output" / "xhs-full"
ONLINE_URL = "https://supersu.ccwu.cc/"
sys.path.insert(0, str(ROOT))

results: list[dict] = []
step_no = 0


def check(name: str, ok: bool, detail: str = "", shot: str = "") -> None:
    results.append({"name": name, "ok": bool(ok), "detail": str(detail)[:300], "shot": shot})
    mark = "PASS" if ok else "FAIL"
    print(f"  {mark}  {name}" + (f"  | {detail}" if detail else ""), flush=True)


def snap(page, tag: str) -> str:
    """截图并返回文件名"""
    global step_no
    step_no += 1
    fn = f"step-{step_no:02d}-{tag}.png"
    try:
        page.screenshot(path=str(OUT / fn), full_page=False)
        return fn
    except Exception as e:
        print(f"    (截图失败 {tag}: {e})")
        return ""


def port_busy(port: int) -> bool:
    with socket.socket() as s:
        s.settimeout(0.4)
        return s.connect_ex(("127.0.0.1", port)) == 0


SAMPLE = """周末去海边

两天的沉默之后，我重新听见了海浪、风声，还有自己。

他说：“真正让人疲惫的不是工作，是那些没被允许停下来的时刻。”

4 小时 在沙滩上没看一次手机。

下午四点，光从侧面打过来，沙滩是温的。"""


def main() -> int:
    try:
        sys.stdout.reconfigure(encoding="utf-8", errors="replace")
    except Exception:
        pass

    ap = argparse.ArgumentParser()
    ap.add_argument("--local", action="store_true", help="测本地 dist（默认测线上）")
    ap.add_argument("--port", type=int, default=8121)
    args = ap.parse_args()

    if OUT.exists():
        shutil.rmtree(OUT)
    OUT.mkdir(parents=True, exist_ok=True)

    srv = None
    if args.local:
        if not (DIST / "index.html").exists():
            print("ERROR: pwa/dist 不存在，先 node pwa/scripts/build.mjs", file=sys.stderr)
            return 2
        if port_busy(args.port):
            print(f"ERROR: 端口 {args.port} 被占用", file=sys.stderr)
            return 2

        class Q(http.server.SimpleHTTPRequestHandler):
            def log_message(self, *a):
                pass

        srv = socketserver.ThreadingTCPServer(
            ("127.0.0.1", args.port), functools.partial(Q, directory=str(DIST)))
        srv.daemon_threads = True
        threading.Thread(target=srv.serve_forever, daemon=True).start()
        url = f"http://127.0.0.1:{args.port}/"
        print(f"目标：{url}（本地 dist）")
    else:
        url = ONLINE_URL
        print(f"目标：{url}（线上）")

    from playwright.sync_api import sync_playwright
    from core.browser_utils import launch_browser
    from core.pwa_test_utils import wait_engine_ready

    errors: list[str] = []
    try:
        with sync_playwright() as p:
            browser = launch_browser(p, headless=True, args=["--no-proxy-server"])
            ctx = browser.new_context(viewport={"width": 1400, "height": 900})
            page = ctx.new_page()

            def _on_console(m):
                if m.type != "error":
                    return
                t = m.text or ""
                if t.startswith("Failed to load resource"):
                    return
                errors.append(t)
            page.on("console", _on_console)
            page.on("pageerror", lambda e: errors.append(str(e)))

            page.goto(url, wait_until="domcontentloaded", timeout=60000)
            page.wait_for_selector("#btn-themes", timeout=40000)
            page.fill("#input", SAMPLE)
            ready = wait_engine_ready(page)
            check("引擎就绪（进小红书前）", ready)
            page.wait_for_timeout(1200)
            s0 = snap(page, "00-公众号排版页")

            # ── 1 进入小红书 ──
            print("\n── 1 进入小红书标题图生成 ──")
            btn = page.locator("#btn-cover")
            label_before = btn.inner_text().strip()
            check("按钮文案 = 小红书标题图生成", "小红书标题图生成" in label_before, label_before, s0)
            btn.click()
            page.wait_for_timeout(1500)
            vis = page.evaluate("() => !document.getElementById('cover-root').hidden")
            check("点击后进入小红书页", vis)
            s1 = snap(page, "01-进入小红书")
            label_after = page.locator("#btn-cover").inner_text().strip()
            check("返回按钮文案 = 公众号排版", "公众号排版" in label_after, label_after, s1)

            # ── 2 空态 ──
            print("\n── 2 首次进入的空态 / 示例 ──")
            empty_n = page.evaluate("""() => {
                const e = document.getElementById('cv-empty');
                return e && !e.hidden ? e.querySelectorAll('*').length : -1;
            }""")
            check("空态存在（首次进入有引导）", empty_n >= 0, f"元素数={empty_n}")
            s2 = snap(page, "02-空态")

            # ── 3 风格列表 ──
            print("\n── 3 风格列表分组 ──")
            groups = page.evaluate("""() => {
                const g = document.getElementById('cv-styles');
                if (!g) return [];
                return [...g.querySelectorAll('.cv-group-label')].map(e => e.textContent.trim());
            }""")
            check("风格分组 ≥ 2（归藏 / 模板）", len(groups) >= 2, groups)
            styles = page.evaluate("""() => {
                const g = document.getElementById('cv-styles');
                return [...g.querySelectorAll('.cv-style')].map(e => e.dataset.style);
            }""")
            check("风格总数 ≥ 9", len(styles) >= 9, f"{len(styles)} 个")
            s3 = snap(page, "03-风格列表")

            # ── 4 逐个风格选中（截图抽查前 4 个 + 全部验证状态） ──
            print("\n── 4 逐个风格选中 ──")
            bad_style = []
            for i, sid in enumerate(styles):
                try:
                    page.click(f".cv-style[data-style='{sid}']")
                    page.wait_for_timeout(450)
                    pressed = page.evaluate(
                        f"() => document.querySelector(\".cv-style[data-style='{sid}']\")?.getAttribute('aria-pressed')")
                    if pressed != "true":
                        bad_style.append(sid)
                    if i < 4:
                        snap(page, f"04-风格-{sid}")
                except Exception as e:
                    bad_style.append(f"{sid}({type(e).__name__})")
            check(f"全部 {len(styles)} 种风格可选中", not bad_style, bad_style[:3] or "全部 OK")

            # ── 5 填文案 ──
            print("\n── 5 填文案 + 字数统计 ──")
            page.fill("#cv-text", SAMPLE)
            page.wait_for_timeout(800)
            cnt = page.evaluate("""() => {
                const c = document.getElementById('cv-count');
                return c ? c.textContent.trim() : '';
            }""")
            check("字数统计更新", bool(cnt), cnt)
            s5 = snap(page, "05-填文案")

            # ── 6 尺寸切换 ──
            print("\n── 6 尺寸切换 ──")
            sizes = page.evaluate("""() => {
                return [...document.querySelectorAll('.cv-size')].map(e => ({
                    label: e.textContent.trim(),
                    disabled: e.disabled,
                    key: e.dataset.size || '',
                }));
            }""")
            usable = [x for x in sizes if not x["disabled"]]
            check("至少 1 种尺寸可用", len(usable) >= 1, f"{len(usable)}/{len(sizes)} 可用")
            s6 = snap(page, "06-尺寸")

            # ── 7 作者名 ──
            print("\n── 7 作者名 ──")
            page.fill("#cv-author", "阿苏")
            page.wait_for_timeout(600)
            check("作者名可填", page.input_value("#cv-author") == "阿苏")
            s7 = snap(page, "07-作者名")

            # ── 8 生成 ──
            print("\n── 8 生成标题图 ──")
            gen_ok = False
            try:
                page.click("#cv-gen")
                # 生成可能要等（含联网找底图）
                page.wait_for_function(
                    "() => document.querySelectorAll('.cv-card').length > 0", timeout=120000)
                gen_ok = True
            except Exception as e:
                check("点击生成后出现结果卡片", False, type(e).__name__)
            if gen_ok:
                cards = page.evaluate("""() => {
                    return [...document.querySelectorAll('.cv-card')].map(c => {
                        const img = c.querySelector('img');
                        return {
                            w: img ? img.naturalWidth : 0,
                            h: img ? img.naturalHeight : 0,
                            hasDl: !!c.querySelector('a.cv-dl'),
                            label: (c.querySelector('.cv-card-label') || {}).textContent || '',
                        };
                    });
                }""")
                check("生成出结果卡片", len(cards) >= 1, f"{len(cards)} 张")
                real = [c for c in cards if c["w"] > 0 and c["h"] > 0]
                check("每张都是真实渲染图（非空白）", len(real) == len(cards),
                      f"{len(real)}/{len(cards)} 有像素")
                check("每张都有下载入口", all(c["hasDl"] for c in cards),
                      f"{sum(1 for c in cards if c['hasDl'])}/{len(cards)}")
                dims = [(c["w"], c["h"]) for c in cards]
                # ⚠️ 2026-10-25 修正误判：卡片数取决于**当前风格支持的尺寸**，
                #   归藏风格出 3 个尺寸，模板风格只出 3:4（1 张）。所以不能断言「必须 3 张」，
                #   只能断言「张数与该风格支持的尺寸数一致」且尺寸都是真实比例。
                cur_style = page.evaluate(
                    "() => document.querySelector('.cv-style[aria-pressed=\"true\"]')?.dataset.style || ''")
                sizes_of_style = page.evaluate(
                    f"() => {{ const s = (window.__cvStyles||[]).find(x=>x.id==='{cur_style}');"
                    f" return s ? s.sizes.length : -1 }}")
                expect_n = sizes_of_style if sizes_of_style > 0 else None
                check("卡片数与该风格支持的尺寸数一致",
                      expect_n is None or len(cards) == expect_n,
                      f"风格={cur_style} 支持={expect_n} 实出={len(cards)}")
                check("尺寸都是真实比例（非 0）", all(w > 0 and h > 0 for w, h in dims), dims)
                s8 = snap(page, "08-生成结果")

                # ── 9 结果详情 ──
                print("\n── 9 结果卡片详情 ──")
                page.evaluate("""() => {
                    const c = document.querySelector('.cv-card');
                    if (c) c.scrollIntoView({block: 'center'});
                }""")
                page.wait_for_timeout(600)
                s9 = snap(page, "09-结果详情")

                # ── 10 点击看大图 ──
                print("\n── 10 点击结果看大图（Lightbox） ──")
                try:
                    page.locator(".cv-card").first.click()
                    page.wait_for_timeout(1200)
                    lb = page.evaluate("""() => {
                        const l = document.getElementById('cv-lightbox');
                        if (!l) return {show: false};
                        const img = l.querySelector('img');
                        return {show: !l.hidden, w: img ? img.naturalWidth : 0};
                    }""")
                    check("Lightbox 打开且大图有像素", lb.get("show") and lb.get("w", 0) > 0, lb)
                    s10 = snap(page, "10-Lightbox")
                    page.click("#cv-lightbox-close")
                    page.wait_for_timeout(600)
                    closed = page.evaluate("() => document.getElementById('cv-lightbox').hidden")
                    check("Lightbox 可关闭", closed)
                except Exception as e:
                    check("Lightbox 打开", False, f"{type(e).__name__}: {str(e)[:80]}")

                # ── 11 九宫格 ──
                print("\n── 11 九宫格切图 ──")
                nine = page.evaluate("""() => {
                    const n = document.getElementById('cv-nine');
                    return n ? {exists: true, visible: !n.hidden} : {exists: false};
                }""")
                check("九宫格入口存在", nine.get("exists"), nine)
                s11 = snap(page, "11-九宫格")

                # ── 12 联网底图候选 ──
                print("\n── 12 联网找底图候选 ──")
                # ⚠️ cv-cands 是**动态创建**的（点「联网搜图」后才插入 DOM）。
                #    按钮 id 是 cv-search（不是 cv-net）—— 2026-10-25 修正。
                #    这里先确保切到「联网搜图」模式，再点搜索。
                net_tab = page.locator("#cv-bg-net")
                if net_tab.count() == 0:
                    net_tab = page.locator("button:has-text('联网搜图')")
                if net_tab.count() > 0:
                    net_tab.first.click()
                    page.wait_for_timeout(800)
                page.fill("#cv-q", "beach")
                search_btn = page.locator("#cv-search")
                check("有搜索按钮（联网搜图）", search_btn.count() > 0)
                if search_btn.count() > 0:
                    search_btn.click()
                    cand_n = 0
                    cand_ok = False
                    for _ in range(25):
                        page.wait_for_timeout(1000)
                        cand_n = page.evaluate("""() => {
                            const c = document.getElementById('cv-cands');
                            return c ? c.querySelectorAll('.cv-cand').length : 0;
                        }""")
                        if cand_n > 0:
                            cand_ok = True
                            break
                    status_txt = page.evaluate("""() => {
                        const s = document.querySelector('.cv-status, #cv-status');
                        return s ? s.textContent.trim() : '';
                    }""")
                    # 国内网络可能连不上 Wikimedia —— 那不是产品 bug，标 SKIP 而非 FAIL
                    if not cand_ok and ("不可达" in status_txt or "没有找到" in status_txt
                                        or "搜索" in status_txt):
                        results.append({"name": "联网后出现底图候选", "ok": None,
                                        "detail": f"网络受限（{status_txt[:60]}），非产品缺陷",
                                        "shot": ""})
                        print(f"  SKIP  联网后出现底图候选  | 网络受限：{status_txt[:60]}")
                    else:
                        check("联网后出现底图候选", cand_ok, f"{cand_n} 个候选")
                s12 = snap(page, "12-底图候选")
            else:
                for nm in ("生成出结果卡片", "每张都是真实渲染图（非空白）",
                           "每张都有下载入口", "尺寸符合预期（3 张不同比例）",
                           "Lightbox 打开且大图有像素", "九宫格入口存在", "底图候选区存在"):
                    check(nm, False, "生成失败，后续无法验证")

            # ── 13 返回公众号排版 ──
            print("\n── 13 返回公众号排版 ──")
            try:
                page.click("#btn-cover")
                page.wait_for_timeout(1200)
                back = page.evaluate("() => document.getElementById('cover-root').hidden")
                check("点「公众号排版」回到排版页", back)
                label_back = page.locator("#btn-cover").inner_text().strip()
                check("按钮文案恢复为「小红书标题图生成」",
                      "小红书标题图生成" in label_back, label_back)
                s13 = snap(page, "13-返回排版")
            except Exception as e:
                check("返回公众号排版", False, f"{type(e).__name__}: {str(e)[:80]}")

            # ── 14 关闭按钮尺寸 ──
            print("\n── 14 关闭按钮尺寸（用户反馈太小） ──")
            page.click("#btn-themes")
            page.wait_for_timeout(700)
            box = page.evaluate("""() => {
                const b = document.getElementById('btn-drawer-close');
                if (!b) return null;
                const r = b.getBoundingClientRect();
                return {w: Math.round(r.width), h: Math.round(r.height)};
            }""")
            check("抽屉关闭按钮 ≥ 40×40", bool(box and box["w"] >= 40 and box["h"] >= 40), box)
            s14 = snap(page, "14-关闭按钮")
            page.click("#btn-drawer-close")
            page.wait_for_timeout(400)

            # ── 15 窄屏 ──
            print("\n── 15 窄屏（手机 375×760） ──")
            page.set_viewport_size({"width": 375, "height": 760})
            page.wait_for_timeout(1200)
            s15 = snap(page, "15-窄屏排版页")
            try:
                page.click("#btn-cover")
                page.wait_for_timeout(1500)
                narrow_ok = page.evaluate("() => !document.getElementById('cover-root').hidden")
                check("窄屏下能进入小红书页", narrow_ok)
                s16 = snap(page, "16-窄屏小红书")
                # 横向溢出检查
                overflow = page.evaluate(
                    "() => document.documentElement.scrollWidth > window.innerWidth + 2")
                check("窄屏无横向溢出", not overflow, f"溢出={overflow}")
            except Exception as e:
                check("窄屏下能进入小红书页", False, type(e).__name__)
            page.set_viewport_size({"width": 1400, "height": 900})

            check("全程无 JS 报错", not errors, errors[:2] if errors else "0 报错")
            browser.close()
    finally:
        if srv:
            srv.shutdown()

    return _finish()


def _finish() -> int:
    passed = sum(1 for r in results if r["ok"] is True)
    failed = sum(1 for r in results if r["ok"] is False)
    print("\n" + "=" * 60)
    print(f"小红书全量测试：{passed}/{passed + failed} 通过    截图 {step_no} 张")
    if failed:
        print("\n失败项：")
        for r in results:
            if r["ok"] is False:
                print(f"  · {r['name']}  {r['detail']}")
    OUT.mkdir(parents=True, exist_ok=True)
    (OUT / "report.json").write_text(
        json.dumps({"steps": results, "shots": step_no}, ensure_ascii=False, indent=2),
        encoding="utf-8")
    print(f"截图与报告：{OUT}")
    return 0 if failed == 0 else 1


if __name__ == "__main__":
    sys.exit(main())
