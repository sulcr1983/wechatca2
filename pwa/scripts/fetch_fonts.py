# -*- coding: utf-8 -*-
"""D1：PWA 字体自托管（拉丁字体下载 + CSS 本地化；中文用系统字体 fallback）"""
import io
import os
import re
import urllib.request

BASE = r"E:\test\wechatca2"
OUT = os.path.join(BASE, "pwa", "public", "fonts")
os.makedirs(OUT, exist_ok=True)

UA = ("Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 "
      "(KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36")

# 拉丁字体自托管；中文（Noto Sans SC）用系统字体 fallback，避免 400+ 分片文件
API = ("https://fonts.googleapis.com/css2"
       "?family=DM+Sans:opsz,wght@9..40,400;9..40,500;9..40,600;9..40,700"
       "&family=JetBrains+Mono:wght@400;500"
       "&display=swap")


def main():
    req = urllib.request.Request(API, headers={"User-Agent": UA})
    css = urllib.request.urlopen(req, timeout=40).read().decode("utf-8")
    print("css length:", len(css))

    urls = sorted(set(re.findall(r"url\((https://fonts\.gstatic\.com/[^)]+)\)", css)))
    print("font files:", len(urls))

    mapping = {}
    for u in urls:
        name = u.split("/")[-1]
        # 避免不同目录同名（gstatic 路径里带版本目录，文件名 hash 已唯一）
        dst = os.path.join(OUT, name)
        if not os.path.exists(dst):
            data = urllib.request.urlopen(urllib.request.Request(u, headers={"User-Agent": UA}),
                                          timeout=60).read()
            io.open(dst, "wb").write(data)
            print("  +", name, len(data), "bytes")
        mapping[u] = name

    for u, name in mapping.items():
        css = css.replace(u, "./" + name)

    header = (
        "/* SuperSu PWA 字体（自托管）\n"
        " * DM Sans / JetBrains Mono: SIL OFL 1.1，版权行见同目录 OFL.txt\n"
        " * 中文：使用系统字体（PingFang SC / Microsoft YaHei / Noto Sans CJK）\n"
        " */\n"
    )
    io.open(os.path.join(OUT, "fonts.css"), "w", encoding="utf-8", newline="\n").write(header + css)
    print("fonts.css written")

    # OFL 说明（三款字体的版权行 + 许可声明；全文见链接）
    ofl = """SuperSu PWA · 字体许可说明
================================

本目录自托管以下字体（SIL Open Font License 1.1）：

1) DM Sans
   Copyright 2014 The DM Sans Project Authors
   https://fonts.google.com/specimen/DM+Sans

2) JetBrains Mono
   Copyright 2020 The JetBrains Mono Project Authors
   https://fonts.google.com/specimen/JetBrains+Mono

3) Noto Sans SC（不随包分发，使用系统字体替代）
   Copyright 2014-2021 Adobe, with Reserved Font Name 'Source'
   https://fonts.google.com/noto/specimen/Noto+Sans+SC

OFL-1.1 全文：https://openfontlicense.org/open-font-license-official-text/

义务摘要：允许自由使用、修改、分发（含打包进产品），须保留版权声明与本许可文本；
不得单独售卖字体本身；修改后不得使用保留字体名（Noto 的 RFN 为 "Source"）。
"""
    io.open(os.path.join(OUT, "OFL.txt"), "w", encoding="utf-8", newline="\n").write(ofl)
    print("OFL.txt written")


if __name__ == "__main__":
    main()
