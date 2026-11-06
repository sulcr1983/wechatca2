#!/usr/bin/env python3
"""B 模块（小红书标题图）浏览器审计（只读）

检查产物，不检查控件：
  · 25 个 style × 其支持尺寸：生成真 PNG，校验像素尺寸 / 非空白 / 文件字节
  · 真实下载按钮：文件名与字节
  · 九宫格：9 张切片的逐格墨迹覆盖率 + ZIP 解包
  · 无 Pexels Key：不发请求、给出可操作指引
  · 状态隔离：切回公众号页再回来，封面文案不丢

输出：output/audit-2026-11-06/b/browser.json + png/
用法：
    .venv/Scripts/python.exe scripts/audit_b_browser.py
"""
from __future__ import annotations

import base64
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
OUT = ROOT / "output" / "audit-2026-11-06" / "b"
PNG = OUT / "png"
sys.path.insert(0, str(ROOT))

TEXT = "审计标题甲乙\n副标题丙丁"


class Q(http.server.SimpleHTTPRequestHandler):
    def log_message(self, *a):
        pass


def start_server():
    httpd = socketserver.ThreadingTCPServer(
        ("127.0.0.1", 0), functools.partial(Q, directory=str(DIST)))
    httpd.daemon_threads = True
    threading.Thread(target=httpd.serve_forever, daemon=True).start()
    return httpd, httpd.server_address[1]


def png_metrics(path: Path) -> dict:
    im = Image.open(path).convert("RGB")
    g = im.convert("L")
    st = ImageStat.Stat(g)
    colors = im.getcolors(maxcolors=1_000_000) or []
    return {"w": im.width, "h": im.height, "bytes": path.stat().st_size,
            "stddev": round(st.stddev[0], 2), "colors": len(colors),
            "blank": st.stddev[0] < 2.0}


def ink_ratio(im: Image.Image) -> float:
    """以出现最多的颜色为底色，统计明显偏离底色的像素比例"""
    rgb = im.convert("RGB")
    cols = rgb.getcolors(maxcolors=2_000_000) or []
    if not cols:
        return 0.0
    bg = max(cols, key=lambda c: c[0])[1]
    px = rgb.load()
    step = max(1, min(rgb.width, rgb.height) // 200)
    total = hit = 0
    for y in range(0, rgb.height, step):
        for x in range(0, rgb.width, step):
            total += 1
            r, g, b = px[x, y]
            if abs(r - bg[0]) + abs(g - bg[1]) + abs(b - bg[2]) > 24:
                hit += 1
    return round(hit / total, 4) if total else 0.0


def fetch_card_png(page, index: int) -> tuple[str, bytes]:
    res = page.evaluate("""async (i) => {
        const links = [...document.querySelectorAll('.cv-card a.cv-dl[download]')];
        const a = links[i];
        if (!a) return null;
        const r = await fetch(a.href);
        const blob = await r.blob();
        const data = await new Promise((resolve) => {
            const fr = new FileReader();
            fr.onload = () => resolve(fr.result);
            fr.readAsDataURL(blob);
        });
        return { name: a.download, data };
    }""", index)
    if not res:
        raise RuntimeError("card link missing")
    b64 = res["data"].split(",", 1)[1]
    return res["name"], base64.b64decode(b64)


def main() -> int:
    OUT.mkdir(parents=True, exist_ok=True)
    PNG.mkdir(parents=True, exist_ok=True)
    httpd, port = start_server()
    errors: list[str] = []
    pexels_requests: list[str] = []

    from playwright.sync_api import sync_playwright
    from core.browser_utils import launch_browser

    results: dict = {"generatedAt": time.strftime("%Y-%m-%d %H:%M:%S"),
                     "text": TEXT, "styles": [], "nine": {}, "no_key": {}, "isolation": {}}
    with sync_playwright() as p:
        browser = launch_browser(p, headless=True,
                                 args=["--force-device-scale-factor=1", "--high-dpi-support=0"])
        ctx = browser.new_context(viewport={"width": 1440, "height": 900}, accept_downloads=True)
        page = ctx.new_page()
        page.on("pageerror", lambda e: errors.append(str(e)[:300]))
        page.on("request", lambda r: pexels_requests.append(r.url)
                if "api.pexels.com" in r.url else None)
        page.goto(f"http://127.0.0.1:{port}/", wait_until="domcontentloaded", timeout=120_000)
        page.click("#btn-cover")
        page.wait_for_selector("#title-root", state="visible", timeout=30_000)
        page.fill("#cv-text", TEXT)
        page.fill("#cv-author", "阿苏")
        page.wait_for_timeout(800)

        # 收集 25 个 style（pick + dots）
        ids = page.evaluate("""() => {
            const s = new Set();
            document.querySelectorAll('#cv-styles [data-style]').forEach(e => s.add(e.dataset.style));
            return [...s];
        }""")
        results["style_count"] = len(ids)

        for sid in ids:
            prev_count = page.locator(".cv-card").count()
            try:
                page.locator(f'#cv-styles [data-style="{sid}"]').first.click()
                page.wait_for_timeout(450)
                sizes = page.locator("#cv-sizes .cv-size:not([disabled])").count()
                prev_status = page.inner_text("#cv-status")
                page.click("#cv-gen")
                page.wait_for_function(
                    "(prev) => document.getElementById('cv-status').textContent !== prev",
                    arg=prev_status, timeout=90_000)
                page.wait_for_function(
                    "() => !document.getElementById('cv-gen').disabled", timeout=90_000)
                page.wait_for_timeout(300)
                n = page.locator(".cv-card").count()
                row = {"style": sid, "sizes_enabled": sizes, "cards": n, "pngs": []}
                for i in range(n):
                    name, data = fetch_card_png(page, i)
                    path = PNG / name
                    path.write_bytes(data)
                    m = png_metrics(path)
                    m.update({"name": name, "ink": ink_ratio(Image.open(path))})
                    row["pngs"].append(m)
                results["styles"].append(row)
                print("  style", sid, "sizes", sizes, "cards", n,
                      "ok", all(not x["blank"] for x in row["pngs"]), flush=True)
            except Exception as e:  # noqa: BLE001
                results["styles"].append({"style": sid,
                                          "error": f"{type(e).__name__}: {e}"})
                print("  style", sid, "ERROR", e, flush=True)

        # 真实下载（锚点）一次
        try:
            with page.expect_download(timeout=30_000) as dl:
                page.locator('.cv-card a.cv-dl[download]').first.click()
            d = dl.value
            save = OUT / ("dl-" + (d.suggested_filename or "cover.png"))
            d.save_as(str(save))
            results["download"] = {"name": d.suggested_filename,
                                   "bytes": save.stat().st_size,
                                   "png_suffix": (d.suggested_filename or "").endswith(".png")}
        except Exception as e:  # noqa: BLE001
            results["download"] = {"error": f"{type(e).__name__}: {e}"}

        # 九宫格：用当前最后一张结果
        try:
            page.locator(".cv-card button.cv-dl").first.click()
            page.wait_for_selector("#cv-nine", state="visible", timeout=10_000)
            page.wait_for_function(
                "() => document.querySelectorAll('#cv-nine-grid img').length === 9",
                timeout=60_000)
            tiles = page.evaluate("""async () => {
                const out = [];
                for (const img of document.querySelectorAll('#cv-nine-grid img')) {
                    const r = await fetch(img.src); const b = await r.blob();
                    const d = await new Promise(res => {
                        const fr = new FileReader(); fr.onload = () => res(fr.result);
                        fr.readAsDataURL(b);
                    });
                    out.push({ alt: img.alt, data: d });
                }
                return out;
            }""")
            tile_stats = []
            for i, t in enumerate(tiles):
                data = base64.b64decode(t["data"].split(",", 1)[1])
                p = OUT / f"nine-{i+1}.png"
                p.write_bytes(data)
                im = Image.open(p)
                tile_stats.append({"name": t["alt"], "w": im.width, "h": im.height,
                                   "ink": ink_ratio(im)})
            results["nine"] = {
                "tiles": tile_stats,
                "blank_tiles": sum(1 for t in tile_stats if t["ink"] < 0.02),
                "min_ink": min(t["ink"] for t in tile_stats),
                "status": page.inner_text("#cv-nine-status"),
            }
            page.screenshot(path=str(OUT / "nine-modal.png"))
            try:
                with page.expect_download(timeout=60_000) as dl2:
                    page.click("#cv-nine-zip")
                z = dl2.value
                zpath = OUT / ("nine-" + (z.suggested_filename or "nine.zip"))
                z.save_as(str(zpath))
                with zipfile.ZipFile(zpath) as zf:
                    names = zf.namelist()
                    dims = []
                    for n in names:
                        with zf.open(n) as f:
                            im = Image.open(io.BytesIO(f.read()))
                            dims.append([im.width, im.height])
                results["nine"]["zip"] = {"name": z.suggested_filename, "files": names[:12],
                                          "count": len(names), "dims": dims[:9]}
            except Exception as e:  # noqa: BLE001
                results["nine"]["zip"] = {"error": f"{type(e).__name__}: {e}"}
            page.click("#cv-nine .cv-modal-close") if page.locator("#cv-nine .cv-modal-close").count() else None
        except Exception as e:  # noqa: BLE001
            results["nine"] = {"error": f"{type(e).__name__}: {e}"}

        # 无 Key 搜图：不发请求 + 给指引
        try:
            page.click('#cv-modes [data-mode="search"]')
            page.wait_for_timeout(800)
            body = page.inner_text("#cv-bg-body")
            results["no_key"] = {
                "pexels_requests": [u for u in pexels_requests],
                "ui_text": body[:300],
                "has_key_hint": ("Key" in body or "key" in body or "注册" in body),
            }
        except Exception as e:  # noqa: BLE001
            results["no_key"] = {"error": f"{type(e).__name__}: {e}"}

        # 状态隔离：切回公众号页再回来
        try:
            page.click("#btn-editor")
            page.wait_for_timeout(400)
            editor_val = page.input_value("#input")
            page.click("#btn-cover")
            page.wait_for_timeout(400)
            cover_val = page.input_value("#cv-text")
            results["isolation"] = {"editor_len": len(editor_val), "cover_text_kept": cover_val == TEXT}
        except Exception as e:  # noqa: BLE001
            results["isolation"] = {"error": f"{type(e).__name__}: {e}"}

        results["errors"] = errors[-20:]
        (OUT / "browser.json").write_text(json.dumps(results, ensure_ascii=False, indent=2),
                                         encoding="utf-8")
        browser.close()
    httpd.shutdown()

    ok = [r for r in results["styles"] if r.get("pngs")]
    bad = [r for r in results["styles"] if r.get("error") or
           any(x["blank"] for x in r.get("pngs", []))]
    print(f"style {len(ok)}/{len(results['styles'])} 有产物；异常 {len(bad)}")
    print("nine:", results["nine"].get("blank_tiles"), "blank /", len(results["nine"].get("tiles", [])))
    print("no_key requests:", len(results["no_key"].get("pexels_requests", [])))
    print("→", OUT / "browser.json")
    return 0


if __name__ == "__main__":
    sys.exit(main())
