#!/usr/bin/env python3
"""生成 15 套「整篇设计」(mg-*.json) 的真实渲染缩略图（整篇设计卡片用）

⚠️ **完全复用** scripts/gen_theme_thumbs.py 的做法，不发明新方案：
   · 同一套引擎路径：preprocess → convert_markdown_to_wechat_html
   · 同一套截图方式：Playwright set_content + screenshot(clip)
   · 同一套产物约定：public/kit-thumbs/{id}.jpg，前端 <img> 引用

为什么不是 iframe：
   2026-11-02 我一开始在原型里用 <iframe src="...">，结果标题按桌面宽度渲染
   （h1 24–36px），塞进 227px 的卡片后标题占 3–4 行、正文全被挤没，看不出差异。
   线上产品本来就是预渲染 JPG（见 pwa/src/app.js:775 的 theme-thumbs），
   照它做即可 —— 不要硬来创新。

用法：
    .venv/Scripts/python.exe scripts/gen_kit_thumbs.py [--force]

产物：
    public/kit-thumbs/{id}.jpg   480×240 JPG（与 theme-thumbs 同规格）
    public/kit-thumbs/manifest.json
"""
from __future__ import annotations

import json
import sys
from pathlib import Path

BASE = Path(__file__).resolve().parent.parent
sys.path.insert(0, str(BASE))

from core.format_engine import convert_markdown_to_wechat_html  # noqa: E402
from core.preprocessor import preprocess  # noqa: E402
from core.browser_utils import launch_browser  # noqa: E402
from playwright.sync_api import sync_playwright  # noqa: E402

THEMES_DIR = BASE / "public" / "themes"
OUT_DIR = BASE / "public" / "kit-thumbs"

# 尺寸与 gen_theme_thumbs.py 不同，这是刻意的：
#   theme-thumbs 用 480×240（2:1），因为配色主题的差异全在「标题那一条」上，够了；
#   kit-thumbs 用 480×360（4:3），因为整篇设计的差异在「标题 + 小标题 + 正文 + 引用 + 列表」
#   整段结构上 —— 240 高只装得下标题，15 套会被裁得长得一样（2026-11-02 实测踩到）。
W, H = 480, 360
QUALITY = 82

# 样本文案：覆盖 h1 / h2 / 列表 / 引用 —— 四类结构都出现，
# 才能看出每套设计「怎么排大标题、怎么排引用、怎么排列表」的差异。
SAMPLE = """# 周末去了趟海边

两天里我没看手机，也没带相机。

## 第一天：什么也没做

- 坐在礁石上看了很久的海
- 傍晚去镇上吃饭

## 第二天：五点起床看日出

> 后来我才发现，那天唯一拍下的照片，
> 是手机彻底没电之前随手按的一张。
"""


def build_page_html(theme_path: Path) -> str:
    md = preprocess(SAMPLE)
    inner = convert_markdown_to_wechat_html(md, str(theme_path))
    # 和 gen_theme_thumbs.py 一模一样的壳：定宽 480、隐藏溢出、中文字体栈
    return (
        "<!DOCTYPE html><html><head><meta charset='utf-8'>"
        "<style>html,body{margin:0;padding:0;}"
        "body{width:%dpx;overflow:hidden;font-family:'Noto Sans SC','Microsoft YaHei',sans-serif;}"
        "</style></head><body>%s</body></html>" % (W, inner)
    )


def main() -> int:
    force = "--force" in sys.argv
    OUT_DIR.mkdir(parents=True, exist_ok=True)

    # 只处理整篇设计（mg-*），不碰 164 套配色主题
    files = sorted(THEMES_DIR.glob("mg-*.json"))
    if not files:
        print("找不到 mg-*.json（整篇设计主题）")
        return 1

    todo = []
    for f in files:
        out = OUT_DIR / (f.stem + ".jpg")
        if force or not out.exists():
            todo.append(f)

    print("整篇设计: %d 套，待生成: %d 套" % (len(files), len(todo)))
    if not todo:
        print("全部已是最新（加 --force 可强制重生成）")
        return 0

    ok = 0
    fail: list[tuple[str, str]] = []
    with sync_playwright() as p:
        browser = launch_browser(p, args=["--no-proxy-server"])
        page = browser.new_page(viewport={"width": W, "height": H})
        page.set_default_timeout(15000)
        for i, f in enumerate(todo, 1):
            try:
                page.set_content(build_page_html(f), wait_until="load")
                page.wait_for_timeout(60)
                page.screenshot(
                    path=str(OUT_DIR / (f.stem + ".jpg")),
                    clip={"x": 0, "y": 0, "width": W, "height": H},
                    type="jpeg",
                    quality=QUALITY,
                )
                ok += 1
                print("  ok %-18s" % f.stem, flush=True)
            except Exception as exc:  # 单套失败不影响整体
                fail.append((f.stem, str(exc)[:80]))
            if i % 10 == 0 or i == len(todo):
                print("  %d/%d ..." % (i, len(todo)), flush=True)
        browser.close()

    print("\n完成：%d 成功，%d 失败" % (ok, len(fail)))
    for name, err in fail[:10]:
        print("  FAIL", name, err)

    # 清单：前端用它判断哪些有缩略图（同 gen_theme_thumbs.py 的 manifest.json）
    manifest = sorted(p.stem for p in OUT_DIR.glob("*.jpg"))
    (OUT_DIR / "manifest.json").write_text(
        json.dumps(manifest, ensure_ascii=False), encoding="utf-8"
    )
    print("manifest:", len(manifest), "条")
    return 0 if not fail else 1


if __name__ == "__main__":
    sys.exit(main())
