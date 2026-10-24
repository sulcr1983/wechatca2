#!/usr/bin/env python3
"""PWA 九宫格切图专项测试（B2 #7）：3×3 切图 / 居中裁剪 / 顺序 / 间距 / ZIP。

设计原则（与其它 PWA 套件一致）：
- **有头**：系统 Chrome（core.browser_utils.launch_browser）。
- **自起静态服务**：服务 pwa/dist，端口占用直接 ABORT。
- **真下载真校验**：抓真实 ZIP，解包后逐张读像素，验证裁剪、顺序、尺寸，而非只看按钮可点。

用法：
    .venv/Scripts/python.exe scripts/pwa_nine_test.py
"""

from __future__ import annotations

import argparse
import functools
import http.server
import io
import socket
import socketserver
import sys
import threading
import zipfile
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
DIST = ROOT / "pwa" / "dist"
OUT = ROOT / "output" / "nine-check"
sys.path.insert(0, str(ROOT))

results: list[tuple[str, bool, str]] = []


def check(name: str, ok: bool, detail: str = "") -> None:
    results.append((name, bool(ok), detail))
    print(("  PASS  " if ok else "  FAIL  ") + name + (f"  | {detail}" if detail else ""), flush=True)


class _Handler(http.server.SimpleHTTPRequestHandler):
    def log_message(self, *args):
        pass


def port_busy(port: int) -> bool:
    with socket.socket() as s:
        s.settimeout(0.4)
        return s.connect_ex(("127.0.0.1", port)) == 0


def cell_color(r: int, c: int) -> tuple[int, int, int]:
    return (20 + r * 60, 20 + c * 60, 120)


def make_grid_image(path: Path) -> None:
    """900×900，每格一种颜色（便于验证顺序）。"""
    from PIL import Image, ImageDraw

    img = Image.new("RGB", (900, 900))
    d = ImageDraw.Draw(img)
    for r in range(3):
        for c in range(3):
            d.rectangle([c * 300, r * 300, c * 300 + 299, r * 300 + 299], fill=cell_color(r, c))
    img.save(path)


def make_wide_image(path: Path) -> None:
    """1200×800：左右各 200px 涂成品红（居中裁剪后必须全部消失）。"""
    from PIL import Image, ImageDraw

    img = Image.new("RGB", (1200, 800), (255, 0, 255))
    d = ImageDraw.Draw(img)
    d.rectangle([200, 0, 999, 799], fill=(30, 140, 200))
    img.save(path)


def near(px: tuple[int, int, int], want: tuple[int, int, int], tol: int = 14) -> bool:
    return all(abs(a - b) <= tol for a, b in zip(px[:3], want))


def read_zip(tiles_zip: Path) -> dict[str, "object"]:
    from PIL import Image

    out = {}
    with zipfile.ZipFile(tiles_zip) as z:
        for name in sorted(z.namelist()):
            with z.open(name) as fh:
                out[name] = Image.open(io.BytesIO(fh.read())).convert("RGB")
    return out


def main() -> int:
    try:
        sys.stdout.reconfigure(encoding="utf-8", errors="replace")
    except Exception:
        pass

    ap = argparse.ArgumentParser()
    ap.add_argument("--port", type=int, default=8091)
    args = ap.parse_args()

    if not (DIST / "index.html").exists():
        print("ERROR: pwa/dist 不存在，先跑 node pwa/scripts/build.mjs", file=sys.stderr)
        return 2
    if port_busy(args.port):
        print(f"ERROR: 端口 {args.port} 被占用 —— 换 --port 或先停掉占用进程", file=sys.stderr)
        return 2

    OUT.mkdir(parents=True, exist_ok=True)
    grid_img = OUT / "src-grid.png"
    wide_img = OUT / "src-wide.png"
    make_grid_image(grid_img)
    make_wide_image(wide_img)

    srv = socketserver.ThreadingTCPServer(
        ("127.0.0.1", args.port), functools.partial(_Handler, directory=str(DIST))
    )
    srv.daemon_threads = True
    srv.request_queue_size = 64
    threading.Thread(target=srv.serve_forever, daemon=True).start()
    url = f"http://127.0.0.1:{args.port}/"

    from playwright.sync_api import sync_playwright
    from core.browser_utils import launch_browser

    errors: list[str] = []

    def wait_tiles(page) -> int:
        page.wait_for_function(
            "() => document.querySelectorAll('#cv-nine-grid img').length === 9", timeout=30000
        )
        return page.locator("#cv-nine-grid img").count()

    def grab_zip(page, tag: str) -> Path:
        with page.expect_download(timeout=60000) as di:
            page.click("#cv-nine-zip")
        d = di.value
        path = OUT / f"nine-{tag}.zip"
        d.save_as(str(path))
        return path

    try:
        with sync_playwright() as p:
            browser = launch_browser(p, headless=True, args=["--no-proxy-server"])
            ctx = browser.new_context(viewport={"width": 1360, "height": 900}, accept_downloads=True)
            page = ctx.new_page()
            page.on("pageerror", lambda e: errors.append(str(e)))
            page.on("console", lambda m: errors.append(m.text) if m.type == "error" else None)

            page.goto(url, wait_until="domcontentloaded", timeout=60000)
            page.wait_for_selector("#btn-cover", timeout=60000)
            page.click("#btn-cover")
            page.wait_for_selector("#cv-nine-pick", timeout=30000)
            check("封面页九宫格入口可见", page.is_visible("#cv-nine-pick"))

            # ① 上传 900×900 九色图 → 出 9 张
            page.set_input_files("#cv-nine-file", str(grid_img))
            page.wait_for_selector("#cv-nine:not([hidden])", timeout=30000)
            n = wait_tiles(page)
            check("上传后切出 9 张预览", n == 9, f"{n} 张")
            status = page.inner_text("#cv-nine-status")
            check("状态条给出尺寸信息", "9 张" in status and "900×900" in status, status[:60])

            # ② 默认逐行顺序 + 间距 6 → ZIP 下载并解包
            zpath = grab_zip(page, "row")
            imgs = read_zip(zpath)
            names = sorted(imgs)
            check("ZIP 含 9 个 nine-0X.png",
                  len(names) == 9 and names[0] == "nine-01.png" and names[-1] == "nine-09.png",
                  f"{len(names)} 个 · {names[:2]}…")
            side = 900
            want_cell = (side - 6 * 2) // 3
            sizes = {im.size for im in imgs.values()}
            check(f"间距 6 时每张 {want_cell}×{want_cell}",
                  sizes == {(want_cell, want_cell)}, str(sorted(sizes)))

            seq4 = imgs["nine-04.png"].getpixel((want_cell // 2, want_cell // 2))
            check("逐行顺序：nine-04 = 第二行第 1 格",
                  near(seq4, cell_color(1, 0)), f"rgb={seq4}")

            # ③ 蛇形顺序
            page.select_option("#cv-nine-order", "snake")
            page.wait_for_timeout(400)
            wait_tiles(page)
            zpath = grab_zip(page, "snake")
            imgs_s = read_zip(zpath)
            s4 = imgs_s["nine-04.png"].getpixel((want_cell // 2, want_cell // 2))
            s6 = imgs_s["nine-06.png"].getpixel((want_cell // 2, want_cell // 2))
            check("蛇形顺序：nine-04 = 第二行第 3 格", near(s4, cell_color(1, 2)), f"rgb={s4}")
            check("蛇形顺序：nine-06 = 第二行第 1 格", near(s6, cell_color(1, 0)), f"rgb={s6}")

            # ④ 间距 0 → 每张 300
            page.evaluate(
                "() => { const el = document.getElementById('cv-nine-gap');"
                " el.value = '0'; el.dispatchEvent(new Event('input', { bubbles: true })); }"
            )
            page.wait_for_timeout(500)
            page.wait_for_function(
                "() => document.getElementById('cv-nine-status').textContent.includes('300×300')",
                timeout=15000,
            )
            check("间距 0 时每张 300×300", "300×300" in page.inner_text("#cv-nine-status"))

            # ⑤ 非正方形 1200×800 → 居中裁剪（左右品红边必须消失）
            page.evaluate(
                "() => { const el = document.getElementById('cv-nine-gap');"
                " el.value = '0'; el.dispatchEvent(new Event('input', { bubbles: true })); }"
            )
            page.set_input_files("#cv-nine-file", str(wide_img))
            page.wait_for_timeout(300)
            wait_tiles(page)
            page.wait_for_function(
                "() => document.getElementById('cv-nine-status').textContent.includes('800×800')",
                timeout=15000,
            )
            zpath = grab_zip(page, "wide")
            imgs_w = read_zip(zpath)
            w_sizes = {im.size for im in imgs_w.values()}
            check("1200×800 裁成方形：每张 266×266",
                  w_sizes == {(266, 266)}, str(sorted(w_sizes)))
            has_magenta = any(
                near(im.getpixel((2, 133)), (255, 0, 255)) or near(im.getpixel((263, 133)), (255, 0, 255))
                for im in imgs_w.values()
            )
            check("居中裁剪：左右品红边已裁掉", not has_magenta)

            # ⑥ 关闭
            page.click("#cv-nine-x")
            page.wait_for_timeout(200)
            check("关闭按钮收起弹窗", page.is_hidden("#cv-nine"))
            check("关闭后预览清空", page.locator("#cv-nine-grid img").count() == 0)

            # ⑦ 移动端：弹窗不能横向溢出
            m = ctx.new_page()
            m.set_viewport_size({"width": 390, "height": 844})
            m.goto(url, wait_until="domcontentloaded", timeout=60000)
            m.wait_for_selector("#btn-cover", timeout=60000)
            m.click("#btn-cover")
            m.wait_for_selector("#cv-nine-pick", timeout=30000)
            m.set_input_files("#cv-nine-file", str(grid_img))
            m.wait_for_selector("#cv-nine:not([hidden])", timeout=30000)
            sw, iw = m.evaluate("() => [document.documentElement.scrollWidth, window.innerWidth]")
            panel = m.evaluate("() => { const r = document.querySelector('.cv-nine-panel').getBoundingClientRect(); return [r.left, r.right]; }")
            check("移动端弹窗不横向溢出", sw <= iw and panel[0] >= 0 and panel[1] <= iw,
                  f"scrollWidth={sw}/{iw} panel={panel}")

            check("无 JS 控制台报错", not errors, errors[0][:140] if errors else "")
            browser.close()
    finally:
        srv.shutdown()

    passed = sum(1 for _, ok, _ in results if ok)
    total = len(results)
    print("\n" + "=" * 56)
    print(f"PWA 九宫格专项：{passed}/{total} 通过")
    print(f"产物：{OUT}")
    return 0 if passed == total else 1


if __name__ == "__main__":
    raise SystemExit(main())
