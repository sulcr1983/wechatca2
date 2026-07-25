#!/usr/bin/env python3
"""删除经用户确认的 38 套重复主题（xh- 与原创同名 + 与原创同 accent/bg 的孪生）。

来源判定（见对话）：
- A: xh-XXX 与原创 XXX 同名（开源重实现你已有的设计）
- C: xh-hero-emerald≈aurora / xh-quote-lavender≈midnight / xh-zen-minimal≈pure-white（accent+bg 完全相同）
仅删除下方白名单中的文件，不会触碰其他主题。
"""
import json
import os
import pathlib

ROOT = pathlib.Path(__file__).resolve().parent.parent
THEMES = ROOT / "public" / "themes"

WHITELIST = {
    "xh-bauhaus", "xh-bold-blue", "xh-bold-green", "xh-bold-navy", "xh-broadsheet",
    "xh-bytedance", "xh-chinese", "xh-coffee-house", "xh-cyber-neon", "xh-elegant-blue",
    "xh-elegant-green", "xh-elegant-navy", "xh-focus-blue", "xh-focus-gold", "xh-focus-red",
    "xh-fresh-card", "xh-github", "xh-ink", "xh-lavender-dream", "xh-magazine", "xh-midnight",
    "xh-minimal-blue", "xh-minimal-gold", "xh-minimal-gray", "xh-minimal-navy", "xh-minimal-red",
    "xh-mint-fresh", "xh-newspaper", "xh-ocean-card", "xh-sports", "xh-sspai", "xh-sunset-amber",
    "xh-terracotta", "xh-warm-card", "xh-wechat-native",
    "xh-hero-emerald", "xh-quote-lavender", "xh-zen-minimal",
}


def main():
    removed = 0
    skipped = 0
    for tid in sorted(WHITELIST):
        f = THEMES / f"{tid}.json"
        if f.exists():
            os.remove(f)
            print(f"  ✓ 删除 {tid}")
            removed += 1
        else:
            print(f"  - 不存在 {tid}")
            skipped += 1
    print(f"\n完成：删除 {removed}，跳过 {skipped}")
    print(f"剩余总主题：{len(list(THEMES.glob('*.json')))}")


if __name__ == "__main__":
    main()
