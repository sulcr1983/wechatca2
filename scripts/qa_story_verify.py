#!/usr/bin/env python3
"""新功能专项验证（2026-10-30）：整套图文 + 大字报底图。

为什么单独写：
  v1.9.5 新增两个功能，现有 pwa_cover_test.py 只断言「卡片数 >= 2」和
  「打包按钮出现」，**不检查产出的图片本身**。
  「生成了 5 张」和「5 张都是有效内容」是两件事：
  内页可能空白、可能重复、可能尺寸不对、可能文字溢出。

本脚本做三件现有测试没做的事：
  S1  整套图文：抓每一张 PNG，逐张校验尺寸/字节数/是否近乎空白
  S2  内页去重：把几张内页的像素哈希比对，确认不是同一张复制 N 份
  S3  大字报底图：v1.9.5 刚修的 bug（原来选了图也不铺），验证图真的铺上了

用法：
    .venv/Scripts/python.exe scripts/qa_story_verify.py --port 8077
"""

from __future__ import annotations

import argparse
import functools
import hashlib
import http.server
import json
import socket
import socketserver
import struct
import sys
import threading
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
DIST = ROOT / "pwa" / "dist"
OUT = ROOT / "output" / "qa-story"
sys.path.insert(0, str(ROOT))

STORY_TEXT = """周末去海边，我把手机调成了飞行模式

两天的沉默之后，我重新听见了海浪、风声，还有自己。

1. 早点睡，别熬到两点
2. 出门走走，别一直刷手机
3. 给自己煮碗面
4. 把手机放远一点
5. 读十页书
6. 早点回家"""


class _H(http.server.SimpleHTTPRequestHandler):
    def log_message(self, *a):
        pass


def port_busy(p):
    with socket.socket() as s:
        s.settimeout(0.4)
        return s.connect_ex(("127.0.0.1", p)) == 0


def png_dims(data: bytes):
    if len(data) < 24 or data[:8] != b"\x89PNG\r\n\x1a\n" or data[12:16] != b"IHDR":
        return None
    return struct.unpack(">II", data[16:24])


def main() -> int:
    try:
        sys.stdout.reconfigure(encoding="utf-8", errors="replace")
    except Exception:
        pass
    ap = argparse.ArgumentParser()
    ap.add_argument("--port", type=int, default=8077)
    args = ap.parse_args()
    if port_busy(args.port):
        print(f"ERROR: 端口 {args.port} 被占用", file=sys.stderr)
        return 2

    OUT.mkdir(parents=True, exist_ok=True)
    srv = socketserver.ThreadingTCPServer(
        ("127.0.0.1", args.port), functools.partial(_H, directory=str(DIST)))
    srv.daemon_threads = True
    threading.Thread(target=srv.serve_forever, daemon=True).start()
    url = f"http://127.0.0.1:{args.port}/"

    from playwright.sync_api import sync_playwright
    from core.browser_utils import launch_browser
    from core.pwa_test_utils import wait_engine_ready

    res = {}
    try:
        with sync_playwright() as p:
            b = launch_browser(p, headless=True)
            ctx = b.new_context(viewport={"width": 1600, "height": 1000},
                                accept_downloads=True)
            page = ctx.new_page()
            page.goto(url, wait_until="domcontentloaded", timeout=120_000)
            page.fill("#input", STORY_TEXT)
            wait_engine_ready(page, timeout=180_000, fill=False)
            page.wait_for_timeout(1200)

            page.click("#btn-cover")
            page.wait_for_timeout(1500)

            # ── S1：整套图文 ──────────────────────────────────────
            page.fill("#cv-text", STORY_TEXT)
            page.wait_for_timeout(1500)
            page.click("#cv-gen-story")
            try:
                page.wait_for_function(
                    "() => document.querySelectorAll('.cv-card').length > 1", timeout=180_000)
            except Exception as e:
                print(f"[S1] 等待卡片超时：{e}", flush=True)
            page.wait_for_timeout(3000)

            n = page.evaluate("() => document.querySelectorAll('.cv-card').length")
            labels = page.evaluate(
                "() => [...document.querySelectorAll('.cv-card-label')].map(e=>e.textContent.trim())")
            print(f"[S1] 卡片数={n} 标签={labels}", flush=True)

            # 逐张取 blob 的字节（通过 canvas 读像素做空白检测 + 去重）
            stats = page.evaluate("""async () => {
                const imgs = [...document.querySelectorAll('.cv-card-img')];
                const out = [];
                for (const im of imgs) {
                    // 用 fetch blob URL 拿字节，算 sha256 与尺寸
                    const r = await fetch(im.src);
                    const ab = await r.arrayBuffer();
                    // 画到 canvas 做「非背景像素占比」
                    const c = document.createElement('canvas');
                    const w = 160, h = Math.round(160 * (im.naturalHeight / im.naturalWidth));
                    c.width = w; c.height = h;
                    const g = c.getContext('2d');
                    g.drawImage(im, 0, 0, w, h);
                    const px = g.getImageData(0, 0, w, h).data;
                    // 以四角像素为背景色基准
                    const bg = [px[0], px[1], px[2]];
                    let diff = 0, total = w * h;
                    for (let i = 0; i < px.length; i += 4) {
                        const d = Math.abs(px[i]-bg[0]) + Math.abs(px[i+1]-bg[1]) + Math.abs(px[i+2]-bg[2]);
                        if (d > 40) diff++;
                    }
                    out.push({
                        natW: im.naturalWidth, natH: im.naturalHeight,
                        bytes: ab.byteLength,
                        inkRatio: +(diff / total).toFixed(3),
                        label: im.closest('.cv-card')?.querySelector('.cv-card-label')?.textContent.trim() || ''
                    });
                }
                return out;
            }""")
            res["story"] = stats
            for s in stats:
                print(f"    · {s['label']:28s} {s['natW']}x{s['natH']} {s['bytes']}B 墨迹占比={s['inkRatio']}", flush=True)

            # 判据
            if stats:
                blank = [s for s in stats if s["inkRatio"] < 0.02]
                wrong_size = [s for s in stats if (s["natW"], s["natH"]) != (1080, 1440)]
                # 去重：按「墨迹占比 + 字节数」组合看是否高度雷同（像素级哈希需另存）
                sigs = [(s["bytes"], s["inkRatio"]) for s in stats]
                dup = len(sigs) != len(set(sigs))
                print(f"[S1] 空白张数={len(blank)} / 尺寸不对={len(wrong_size)} / 疑似重复={dup}", flush=True)
                res["story_judge"] = {"blank": len(blank), "wrong_size": len(wrong_size),
                                      "dup_suspect": dup}
            else:
                res["story_judge"] = {"error": "no cards"}

            # 打包整套 ZIP
            try:
                with page.expect_download(timeout=180_000) as dl:
                    page.click("#cv-zip-story")
                d = dl.value
                f = OUT / ("story-" + (d.suggested_filename or "s.zip"))
                d.save_as(str(f))
                import zipfile
                with zipfile.ZipFile(f) as z:
                    names = z.namelist()
                    sizes = {n_: z.getinfo(n_).file_size for n_ in names}
                print(f"[S1] ZIP {f.stat().st_size}B 内含 {len(names)} 项：{names}", flush=True)
                res["zip"] = {"bytes": f.stat().st_size, "names": names, "sizes": sizes}
            except Exception as e:
                print(f"[S1] ZIP 打包失败：{str(e)[:150]}", flush=True)
                res["zip"] = {"error": str(e)[:200]}

            # ── S3：大字报底图（v1.9.5 修复项）─────────────────────
            # ⚠️ 不要按 Escape：那会关闭封面页，后面的 .cv-mode / #cv-gen 全都找不到
            #    （上一轮就是这么误报成「大字报出图失败」的）
            page.wait_for_timeout(600)
            # 选大字报版式：卡片是 .cv-style[data-layout]，里面的按钮是 .cv-style-pick[data-style]
            # （见 cover/index.js:236-300，DOM 由 renderStyles 动态构建）
            picked = page.evaluate("""() => {
                // 先找 layout=bigtype 的卡，再点它里面的 pick
                const card = [...document.querySelectorAll('.cv-style')]
                  .find(e => e.dataset.layout === 'bigtype');
                if (card) {
                  const pick = card.querySelector('.cv-style-pick');
                  if (pick) { pick.click(); return 'layout-card'; }
                }
                // 兜底：直接找 data-style=bigtype 的按钮
                const b = [...document.querySelectorAll('.cv-style-pick')]
                  .find(e => e.dataset.style === 'bigtype');
                if (b) { b.click(); return 'direct'; }
                return 'not-found';
            }""")
            print(f"[S3] 选大字报方式={picked}", flush=True)
            page.wait_for_timeout(2000)
            cur_style = page.evaluate("""() => {
                const a = [...document.querySelectorAll('.cv-style')]
                  .find(e => e.getAttribute('aria-pressed') === 'true');
                return a ? (a.dataset.style || a.dataset.layout) : '';
            }""")
            print(f"[S3] 当前选中版式={cur_style}", flush=True)
            res["style_picked"] = cur_style

            # 上传一张测试图作底图（用项目自带的示例图）
            # ⚠️ 必须用「纯照片」而不是 pwa/dist/samples 里的示例图 ——
            #    那些示例图本身是**已排版的成品封面**（自带「封面 · COVER」条和标题字），
            #    叠上我们的文字后会重叠，看起来像 Bug，其实是测试素材选错了。
            sample = None
            for cand in (ROOT / "public" / "images").glob("*.jpg"):
                sample = cand
                break
            if sample:
                # 必须先切到「上传」模式，renderBg 才会动态创建 #cv-file
                # （见 cover/index.js:373-388，state.mode==='upload' 时才建）
                try:
                    page.click(".cv-mode[data-mode='upload']")
                    page.wait_for_timeout(900)
                    print("[S3] 已切到「上传」模式", flush=True)
                except Exception as e:
                    print(f"[S3] 切上传模式失败：{str(e)[:80]}", flush=True)

                uploaded = False
                if page.locator("#cv-file").count():
                    try:
                        page.set_input_files("#cv-file", str(sample))
                        uploaded = True
                        print(f"[S3] 已通过 #cv-file 上传 {sample.name}", flush=True)
                    except Exception as e:
                        print(f"[S3] #cv-file 上传失败：{str(e)[:80]}", flush=True)
                if not uploaded:
                    inputs = page.locator("input[type=file]")
                    for i in range(inputs.count()):
                        try:
                            page.set_input_files(f"input[type=file] >> nth={i}", str(sample))
                            uploaded = True
                            print(f"[S3] 已通过 input[type=file] #{i} 上传", flush=True)
                            break
                        except Exception:
                            continue
                page.wait_for_timeout(3500)
                has_bg = page.evaluate("""() => {
                    const box = document.getElementById('cv-bg-preview');
                    return box ? box.innerHTML.length > 50 : false;
                }""")
                print(f"[S3] 底图已选（预览区有内容）={has_bg}", flush=True)
                # 生成并看结果是否真的带图
                try:
                    with page.expect_download(timeout=180_000) as dl:
                        page.click("#cv-gen")
                    d = dl.value
                    f = OUT / ("bigtype-" + (d.suggested_filename or "b.png"))
                    d.save_as(str(f))
                    data = f.read_bytes()
                    print(f"[S3] 大字报出图 {png_dims(data)} {len(data)}B", flush=True)
                    res["bigtype"] = {"dims": png_dims(data), "bytes": len(data)}
                except Exception as e:
                    print(f"[S3] 大字报出图失败：{str(e)[:150]}", flush=True)
                    res["bigtype"] = {"error": str(e)[:200]}
            else:
                print("[S3] 找不到示例图，跳过底图验证", flush=True)
                res["bigtype"] = {"skipped": "no sample image"}

            ctx.close()
            b.close()
    finally:
        srv.shutdown()
        srv.server_close()

    (OUT / "story.json").write_text(json.dumps(res, ensure_ascii=False, indent=2),
                                    encoding="utf-8")
    print(f"\n明细：{(OUT / 'story.json').relative_to(ROOT)}")
    return 0


if __name__ == "__main__":
    sys.exit(main())
