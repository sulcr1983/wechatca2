"""专项校验：实时预览 vs 实际出图 是否一致 + 长文案预览耗时。

思路：
  预览是「真实 iframe + CSS 缩放」，出图是「离屏 iframe 截图」，
  两者理论上同一份 HTML。这里用像素比对把「理论上」变成「实测上」：
    1. 截预览框（已是缩放后的样子）
    2. 取生成的 PNG，缩放到同一尺寸
    3. 算平均绝对差（0~255）与超阈像素占比

判定标准（2026-10-27 实测基线）：
  平均差 < 12 且 超阈像素 < 15% → 一致
  实测 13 套均在 1.5~2.7（纯缩放抗锯齿），可放心把阈值收紧
  若某套突然 > 20，通常是「预览和出图用了不同参数」或模板自身有随机性

用法：.venv/Scripts/python.exe scripts/pwa_preview_verify.py
"""
import io
import sys
import time
import http.server
import threading
import socketserver
import functools
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
sys.path.insert(0, str(ROOT))

from PIL import Image, ImageChops          # noqa: E402
from playwright.sync_api import sync_playwright  # noqa: E402
from core.browser_utils import launch_browser    # noqa: E402
from core.pwa_test_utils import wait_engine_ready  # noqa: E402

DIST = ROOT / "pwa" / "dist"
OUT = ROOT / "output" / "preview-verify"
PORT = 8451

STYLES = [
    ("editorial", "Editorial 杂志风"),
    ("swiss", "Swiss 瑞士风"),
    ("bigtype", "大字版"),
    ("editorial-ink-classic", "经典墨色"),
    ("editorial-dune", "沙丘暖纸"),
    ("editorial-kraft-paper", "牛皮纸"),
    ("editorial-forest-ink", "森林墨绿"),
    ("editorial-indigo-porcelain", "靛蓝瓷白"),
    ("editorial-midnight-ink", "午夜墨金"),
    ("swiss-ikb", "克莱因蓝"),
    ("swiss-lemon-green", "柠檬绿"),
    ("swiss-lemon-yellow", "柠檬黄"),
    ("swiss-safety-orange", "安全橙"),
]

TEXT = "周末去海边\n\n两天的沉默之后，我重新听见了海浪、风声，还有自己。"


class Quiet(http.server.SimpleHTTPRequestHandler):
    def log_message(self, *a):
        pass


def serve():
    srv = socketserver.ThreadingTCPServer(
        ("127.0.0.1", PORT), functools.partial(Quiet, directory=str(DIST)))
    srv.daemon_threads = True
    threading.Thread(target=srv.serve_forever, daemon=True).start()
    return srv


def compare(pv_png: bytes, gen_png: bytes):
    """把出图缩放到预览尺寸后做像素比对，返回 (平均差, 超阈占比)。"""
    a = Image.open(io.BytesIO(pv_png)).convert("RGB")
    b = Image.open(io.BytesIO(gen_png)).convert("RGB").resize(a.size, Image.LANCZOS)
    diff = ImageChops.difference(a, b)
    px = list(diff.getdata())
    total = len(px)
    mean = sum((r + g + bl) / 3 for r, g, bl in px) / total
    over = sum(1 for r, g, bl in px if (r + g + bl) / 3 > 40) / total
    return mean, over


def main():
    OUT.mkdir(parents=True, exist_ok=True)
    srv = serve()
    rows = []
    perf = {}
    try:
        with sync_playwright() as p:
            br = launch_browser(p, headless=True, args=["--no-proxy-server"])
            ctx = br.new_context(viewport={"width": 1440, "height": 950})
            page = ctx.new_page()
            errs = []
            page.on("pageerror", lambda e: errs.append(str(e)))
            page.goto(f"http://127.0.0.1:{PORT}/", wait_until="domcontentloaded", timeout=60000)
            wait_engine_ready(page)
            page.wait_for_timeout(1200)
            page.click("#btn-cover")
            page.wait_for_timeout(500)

            # 统一用 3:4，预览与出图才能对齐
            page.click('.cv-style[data-style="editorial"]')
            page.fill("#cv-text", TEXT)
            page.wait_for_timeout(1500)

            for sid, name in STYLES:
                page.click(f'.cv-style[data-style="{sid}"]')
                page.wait_for_timeout(250)
                # 等预览真的换成这个风格（比等固定时间可靠）
                page.wait_for_function(
                    "() => { const f = document.querySelector('.cv-preview-scaler iframe');"
                    " if (!f || !f.contentDocument) return false;"
                    " const r = f.contentDocument.getElementById('xhs-cover');"
                    " return !!r && r.innerText.includes('周末去海边'); }", timeout=15000)
                page.wait_for_timeout(700)
                # ⚠️ 只能截封面本体（.cv-preview-scaler）。
                #    截 .cv-preview-box 会把四周的米色留白也拍进去，
                #    深色风格（午夜墨金）留白 vs 深底 → 平均差 113 的假偏差，
                #    浅色风格则只差 5~15（越接近米色差越小）。第一版就栽在这。
                pv = page.locator(".cv-preview-scaler").screenshot()

                # ⚠️ 必须先记下旧图 src：上一次生成的结果还在画廊里，
                #    只等 naturalWidth>0 会立刻为真 → 比对的其实是上一套风格的图
                #    （第一版脚本就栽在这，午夜墨金跟靛蓝瓷白比出 113 的平均差）。
                prev_src = page.evaluate(
                    "() => { const i = document.querySelector('.cv-card img'); return i ? i.src : ''; }")
                page.click("#cv-gen")
                page.wait_for_function(
                    "(prev) => { const i = document.querySelector('.cv-card img');"
                    " return !!i && i.src !== prev && i.naturalWidth > 0; }",
                    arg=prev_src, timeout=120000)
                page.wait_for_timeout(400)
                # 取第一张（3:4）的二进制
                gen = page.evaluate("""async () => {
                    const img = document.querySelector('.cv-card img');
                    const r = await fetch(img.src);
                    const buf = await r.arrayBuffer();
                    return Array.from(new Uint8Array(buf));
                }""")
                gen_png = bytes(gen)

                mean, over = compare(pv, gen_png)
                rows.append((name, mean, over))
                print(f"  {name:<18} 平均差 {mean:5.2f}  超阈像素 {over*100:4.1f}%")
                # 清掉结果，下一轮重新生成

            # ── 长文案预览耗时 ──
            long_text = ("海边的一天。\n\n" + "我们把行李放在民宿，沿着海岸线走了很久，风很大，"
                         "说话要靠喊。傍晚回来时鞋里全是沙子，谁也没抱怨。" * 9)[:500]
            # ⚠️ 必须用每轮不同的标记词判断「预览已换成这一版」，
            #    else 旧预览本来就有文字，条件立刻为真 → 测出 0ms 的假数据。
            for idx, (label, txt) in enumerate([("短文案 20 字", TEXT), ("满额 500 字", long_text)]):
                mark = f"标记{idx}XZ"
                body = f"{mark}\n\n{txt}"
                t0 = time.time()
                page.fill("#cv-text", body[:500] if len(body) > 500 else body)
                page.wait_for_function(
                    "(m) => { const f = document.querySelector('.cv-preview-scaler iframe');"
                    " if (!f || !f.contentDocument) return false;"
                    " const r = f.contentDocument.getElementById('xhs-cover');"
                    " return !!r && r.innerText.includes(m); }",
                    arg=mark, timeout=15000)
                perf[label] = (time.time() - t0) * 1000
                chars = len(body[:500])
                print(f"  {label:<12} {chars} 字 · 输入→预览更新 {perf[label]:.0f} ms")
                page.wait_for_timeout(900)

            print("JS 报错:", errs[:3] if errs else "无")
            page.screenshot(path=str(OUT / "final.png"))
            br.close()
    finally:
        srv.shutdown()

    worst = max(rows, key=lambda r: r[1])
    print("\n最大偏差:", f"{worst[0]} 平均差 {worst[1]:.2f}")
    bad = [r for r in rows if r[1] > 12 or r[2] > 0.15]
    print("判定:", "全部一致" if not bad else f"⚠️ {len(bad)} 套偏差过大：{[b[0] for b in bad]}")


if __name__ == "__main__":
    main()
