#!/usr/bin/env python3
"""生成 164 套排版主题的真实渲染缩略图（模板库卡片用）

思路同 scripts/gen_thumbnails.py：用 Playwright 打开真实渲染结果截取固定区域。
输出：public/theme-thumbs/{theme_id}.jpg（前端 404 时回退渐变占位）

用法：python scripts/gen_theme_thumbs.py [--force]
"""
import sys
import json
from pathlib import Path

BASE = Path(__file__).resolve().parent.parent
sys.path.insert(0, str(BASE))

from core.format_engine import convert_markdown_to_wechat_html  # noqa: E402
from core.preprocessor import preprocess  # noqa: E402
from core.browser_utils import launch_browser  # noqa: E402
from playwright.sync_api import sync_playwright  # noqa: E402

THEMES_DIR = BASE / "public" / "themes"
OUT_DIR = BASE / "public" / "theme-thumbs"

W, H = 480, 240
QUALITY = 82

# 缩略图样例：覆盖 h1/h2/列表/引用，让标题样式差异一眼可辨
SAMPLE = """# 我完成了一个阳光星盘系统

今天分享一个有趣的项目，数据全部在本地完成。

## 核心功能

- 精确计算出生时刻的星盘图
- 支持 12 宫位相位解读
- 用行星落点分析个人特质

> 数据不外传，隐私无忧。
"""


def build_page_html(theme_path: Path) -> str:
    md = preprocess(SAMPLE)
    inner = convert_markdown_to_wechat_html(md, str(theme_path))
    return (
        "<!DOCTYPE html><html><head><meta charset='utf-8'>"
        "<style>html,body{margin:0;padding:0;}"
        "body{width:%dpx;overflow:hidden;font-family:'Noto Sans SC','Microsoft YaHei',sans-serif;}"
        "</style></head><body>%s</body></html>" % (W, inner)
    )


def main():
    force = "--force" in sys.argv
    OUT_DIR.mkdir(parents=True, exist_ok=True)
    files = sorted(THEMES_DIR.glob("*.json"))
    if not files:
        print("no themes found")
        return
    todo = []
    for f in files:
        out = OUT_DIR / (f.stem + ".jpg")
        if force or not out.exists():
            todo.append(f)
    print("themes: %d, to generate: %d" % (len(files), len(todo)))
    if not todo:
        print("all up to date")
        return

    ok = 0
    fail = []
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
            except Exception as e:  # 单主题失败不影响整体
                fail.append((f.stem, str(e)[:80]))
            if i % 20 == 0 or i == len(todo):
                print("  %d/%d ..." % (i, len(todo)), flush=True)
        browser.close()

    print("done: %d ok, %d failed" % (ok, len(fail)))
    for name, err in fail[:10]:
        print("  FAIL", name, err)
    # 生成清单（前端可选用于判断哪些有缩略图）
    manifest = sorted(p.stem for p in OUT_DIR.glob("*.jpg"))
    (OUT_DIR / "manifest.json").write_text(
        json.dumps(manifest, ensure_ascii=False), encoding="utf-8"
    )
    print("manifest:", len(manifest), "entries")


if __name__ == "__main__":
    main()
