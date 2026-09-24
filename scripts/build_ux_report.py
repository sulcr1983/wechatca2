"""把 docs/ux-audit/report.tpl.html 里的截图引用替换为 base64 内嵌，生成单文件 index.html。

用法：python scripts/build_ux_report.py
"""

import os
import re
import sys
import base64

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
UX = os.path.join(ROOT, "docs", "ux-audit")
TPL = os.path.join(UX, sys.argv[1] if len(sys.argv) > 1 else "report.tpl.html")
OUT = os.path.join(UX, sys.argv[2] if len(sys.argv) > 2 else "index.html")


def main():
    with open(TPL, encoding="utf-8") as f:
        html = f.read()

    stats = []

    def repl(m):
        rel = m.group(1)
        p = os.path.join(UX, rel.replace("/", os.sep))
        with open(p, "rb") as img:
            raw = img.read()
        stats.append((rel, len(raw)))
        b64 = base64.b64encode(raw).decode("ascii")
        return 'src="data:image/jpeg;base64,%s"' % b64

    out = re.sub(r'src="(shots/[^"]+)"', repl, html)

    with open(OUT, "w", encoding="utf-8") as f:
        f.write(out)

    print("写入:", OUT)
    print("内嵌截图数:", len(stats))
    print("原图合计: %.1f MB" % (sum(s for _, s in stats) / 1024 / 1024))
    print("最终 HTML: %.2f MB" % (os.path.getsize(OUT) / 1024 / 1024))
    for rel, s in stats:
        print("  -", rel, "%.0f KB" % (s / 1024))


if __name__ == "__main__":
    main()
