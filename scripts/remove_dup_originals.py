#!/usr/bin/env python3
"""按用户确认，删除原创 53 套中同 accent+bg 的撞色重复（每组留 1 个代表）。

删除名单（每组保留的代表已排除）：
- 蓝组(4): 留 bold-blue → 删 elegant-blue, focus-blue, minimal-blue
- navy组(3): 留 bold-navy → 删 elegant-navy, minimal-navy
- green组(2): 留 bold-green → 删 elegant-green
- gold组(2): 留 focus-gold → 删 minimal-gold
- red组(2): 留 focus-red → 删 minimal-red
仅删白名单，不动其他主题。引用处（format_engine GALLERY_THEMES/THEME_BUTTONS、测试 ps1）已改为保留的代表。
"""
import json
import os
import pathlib

ROOT = pathlib.Path(__file__).resolve().parent.parent
THEMES = ROOT / "public" / "themes"

WHITELIST = {
    "elegant-blue", "focus-blue", "minimal-blue",
    "elegant-navy", "minimal-navy",
    "elegant-green",
    "minimal-gold",
    "minimal-red",
}


def main():
    removed = 0
    for tid in sorted(WHITELIST):
        f = THEMES / f"{tid}.json"
        if f.exists():
            os.remove(f)
            print(f"  ✓ 删除 {tid}")
            removed += 1
        else:
            print(f"  - 不存在 {tid}")
    print(f"\n完成：删除 {removed} 套原创撞色重复")
    print(f"剩余总主题：{len(list(THEMES.glob('*.json')))}")


if __name__ == "__main__":
    main()
