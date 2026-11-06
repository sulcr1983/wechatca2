#!/usr/bin/env python3
"""C 模块（小红书长图文）浏览器审计（只读）

检查产物：
  · 分页完整性：原文每个编号句子都必须出现在某页
  · 页数与截断：>6 页时的 truncated 提示
  · 溢出：每页卡片 scrollHeight 是否超过 1440
  · 12 套模板逐套切换：页面仍有内容、无异常
  · 导出整套：ZIP 解包，校验张数 / 尺寸 / 非空白 / 顺序
  · 右栏一屏可见性：scrollHeight / clientHeight 实测

输出：output/audit-2026-11-06/c/browser.json + pages/
"""
from __future__ import annotations

import functools
import http.server
import io
import json
import socketserver
import sys
import threading
import time
import zipfile
from pathlib import Path

from PIL import Image, ImageStat

ROOT = Path(__file__).resolve().parent.parent
DIST = ROOT / "pwa" / "dist"
OUT = ROOT / "output" / "audit-2026-11-06" / "c"
sys.path.insert(0, str(ROOT))


class Q(http.server.SimpleHTTPRequestHandler):
    def log_message(self, *a):
        pass


def start_server():
    httpd = socketserver.ThreadingTCPServer(
        ("127.0.0.1", 0), functools.partial(Q, directory=str(DIST)))
    httpd.daemon_threads = True
    threading.Thread(target=httpd.serve_forever, daemon=True).start()
    return httpd, httpd.server_address[1]


def article(n: int = 40) -> str:
    paras = []
    for i in range(1, n + 1):
        paras.append(f"第{i:02d}句：这是用于分页完整性检查的正文，每一句都必须出现在某一页里。")
        if i % 8 == 0:
            paras.append(f"## 小节{i // 8}\n\n这是第 {i // 8} 个小节的说明文字。")
        if i % 10 == 0:
            paras.append("第一步：打开编辑器\n\n第二步：粘贴文章\n\n第三步：选择模板")
        if i % 12 == 0:
            paras.append("- 清单项甲\n- 清单项乙\n- 清单项丙")
        if i % 14 == 0:
            paras.append("> 引用块：这句话也要落到某一页。")
    return "审计长文标题\n副标题审校\n\n" + "\n\n".join(paras)


def norm(s: str) -> str:
    return "".join(str(s).split())


def png_metrics(data: bytes) -> dict:
    im = Image.open(io.BytesIO(data)).convert("RGB")
    st = ImageStat.Stat(im.convert("L"))
    return {"w": im.width, "h": im.height, "bytes": len(data),
            "stddev": round(st.stddev[0], 2), "blank": st.stddev[0] < 2.0}


def main() -> int:
    OUT.mkdir(parents=True, exist_ok=True)
    httpd, port = start_server()
    errors: list[str] = []
    results: dict = {"generatedAt": time.strftime("%Y-%m-%d %H:%M:%S")}

    from playwright.sync_api import sync_playwright
    from core.browser_utils import launch_browser

    with sync_playwright() as p:
        browser = launch_browser(p, headless=True,
                                 args=["--force-device-scale-factor=1", "--high-dpi-support=0"])
        ctx = browser.new_context(viewport={"width": 1440, "height": 900}, accept_downloads=True)
        page = ctx.new_page()
        page.on("pageerror", lambda e: errors.append(str(e)[:300]))
        page.goto(f"http://127.0.0.1:{port}/", wait_until="domcontentloaded", timeout=120_000)
        page.click("#btn-longform")
        page.wait_for_selector("#longform-root", state="visible", timeout=30_000)
        page.fill("#cv-long-text", article(40))
        page.wait_for_selector("#cv-deck .cv-slot", timeout=60_000)
        page.wait_for_timeout(1200)

        def snapshot() -> dict:
            return page.evaluate("""() => {
                const deck = document.getElementById('cv-deck');
                const slots = [...document.querySelectorAll('#cv-deck .cv-slot')];
                const cards = [...document.querySelectorAll('#cv-deck .cv-slot-inner')];
                const rc = document.querySelector('#longform-root .cv-col-right');
                return {
                  text: deck ? deck.innerText : '',
                  slots: slots.length,
                  captions: slots.map(s => (s.querySelector('.cv-slot-cap')||{}).innerText || ''),
                  overflow: cards.map(c => {
                    const el = c.firstElementChild || c;
                    return {sh: el.scrollHeight, ch: el.clientHeight};
                  }),
                  right: rc ? {sh: rc.scrollHeight, ch: rc.clientHeight} : null,
                  status: (document.getElementById('cv-status')||{}).textContent || '',
                  selfcheck: (document.getElementById('cv-selfcheck')||{}).textContent || '',
                  selfcheck_hidden: !!(document.getElementById('cv-selfcheck')||{}).hidden,
                };
            }""")

        base = snapshot()
        markers = [f"第{i:02d}句" for i in range(1, 41)]
        missing = [m for m in markers if norm(m) not in norm(base["text"])]
        results["base"] = {
            "pages": base["slots"], "captions": base["captions"],
            "missing_markers": missing, "missing_count": len(missing),
            "overflow": [o for o in base["overflow"] if o["sh"] > o["ch"] + 2],
            "right_column": base["right"],
            "status": base["status"], "selfcheck": base["selfcheck"],
            "selfcheck_hidden": base["selfcheck_hidden"],
        }

        # 12 套模板逐套切换
        tpl_rows = []
        tpl_count = page.locator("#cv-ltpls .cv-ltpl").count()
        for i in range(tpl_count):
            try:
                page.locator("#cv-ltpls .cv-ltpl").nth(i).click()
                page.wait_for_timeout(600)
                s = snapshot()
                miss = [m for m in markers if norm(m) not in norm(s["text"])]
                tpl_rows.append({"index": i, "pages": s["slots"], "missing": len(miss),
                                 "overflow": len([o for o in s["overflow"] if o["sh"] > o["ch"] + 2])})
            except Exception as e:  # noqa: BLE001
                tpl_rows.append({"index": i, "error": f"{type(e).__name__}: {e}"})
        results["templates"] = {"count": tpl_count, "rows": tpl_rows}

        # 8 套色板逐套切换
        pal_rows = []
        pal_count = page.locator("#cv-lpals .cv-lpal").count()
        for i in range(pal_count):
            try:
                page.locator("#cv-lpals .cv-lpal").nth(i).click()
                page.wait_for_timeout(350)
                s = snapshot()
                pal_rows.append({"index": i, "pages": s["slots"],
                                 "missing": len([m for m in markers if norm(m) not in norm(s["text"])])})
            except Exception as e:  # noqa: BLE001
                pal_rows.append({"index": i, "error": f"{type(e).__name__}: {e}"})
        results["palettes"] = {"count": pal_count, "rows": pal_rows}

        # 回到第一套模板 + 导出整套
        try:
            page.locator("#cv-ltpls .cv-ltpl").nth(0).click()
            page.wait_for_timeout(600)
            page.click("#cv-gen-story")
            page.wait_for_function(
                "() => !document.getElementById('cv-gen-story').disabled", timeout=180_000)
            page.wait_for_timeout(500)
            gen = page.evaluate("""() => ({
                status: (document.getElementById('cv-status')||{}).textContent || '',
                cards: document.querySelectorAll('#lf-gallery .cv-card').length,
                zip_visible: !document.getElementById('cv-zip-story').hidden,
            })""")
            results["export"] = gen
            if gen["zip_visible"]:
                with page.expect_download(timeout=120_000) as dl:
                    page.click("#cv-zip-story")
                d = dl.value
                zpath = OUT / ("story-" + (d.suggested_filename or "story.zip"))
                d.save_as(str(zpath))
                with zipfile.ZipFile(zpath) as zf:
                    names = zf.namelist()
                    pages = []
                    for n in names:
                        with zf.open(n) as f:
                            pages.append({"name": n, **png_metrics(f.read())})
                results["export"]["zip"] = {"count": len(names), "names": names,
                                            "pages": pages,
                                            "blank": sum(1 for x in pages if x["blank"])}
                # 保存首张供目视
                with zipfile.ZipFile(zpath) as zf:
                    (OUT / "page-01.png").write_bytes(zf.read(names[0]))
        except Exception as e:  # noqa: BLE001
            results["export"] = {"error": f"{type(e).__name__}: {e}"}

        # 超长文章：触发页数上限 / 截断提示
        try:
            page.fill("#cv-long-text", article(200))
            page.wait_for_timeout(1500)
            s = snapshot()
            results["too_long"] = {
                "pages": s["slots"], "status": s["status"],
                "selfcheck": s["selfcheck"], "selfcheck_hidden": s["selfcheck_hidden"],
                "truncated_hint": ("截断" in s["status"] or "截断" in s["selfcheck"]),
            }
        except Exception as e:  # noqa: BLE001
            results["too_long"] = {"error": f"{type(e).__name__}: {e}"}

        # 空输入
        try:
            page.fill("#cv-long-text", "")
            page.wait_for_timeout(800)
            results["empty"] = page.evaluate("""() => ({
                empty_visible: !document.getElementById('lf-empty').hidden,
                status: (document.getElementById('cv-status')||{}).textContent || '',
                slots: document.querySelectorAll('#cv-deck .cv-slot').length,
            })""")
        except Exception as e:  # noqa: BLE001
            results["empty"] = {"error": f"{type(e).__name__}: {e}"}

        results["errors"] = errors[-20:]
        (OUT / "browser.json").write_text(json.dumps(results, ensure_ascii=False, indent=2),
                                         encoding="utf-8")
        browser.close()
    httpd.shutdown()
    print(json.dumps({k: results.get(k) for k in ("base", "templates", "palettes", "export", "too_long", "empty")},
                     ensure_ascii=False, indent=1)[:3000])
    return 0


if __name__ == "__main__":
    sys.exit(main())
