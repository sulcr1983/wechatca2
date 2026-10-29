"""把 164 套主题的渲染产物落盘，用于「改前 / 改后」逐字节比对（只读）。

什么时候用
----------
改排版引擎的公共逻辑（颜色兜底、斑马纹、断行…）时，需要证明「只有该变的变了」。
做法：改之前先 dump 一份，改完再 dump 一份，然后 diff 两个 json ——
每个主题的 HTML 是一个字符串，变了就是变了，不受肉眼判断影响。

2026-10-29 实测：加标题可读性护栏后 164 套里只有 23 套变化，
其余 141 套产物逐字节一致（这是「没改坏」的判据）。

用法：
  .venv/Scripts/python.exe scripts/theme_render_dump.py --out output/rd-before.json
  # 改代码
  .venv/Scripts/python.exe scripts/theme_render_dump.py --out output/rd-after.json
  .venv/Scripts/python.exe scripts/theme_render_dump.py --diff output/rd-before.json output/rd-after.json
"""
from __future__ import annotations

import argparse
import json
import re
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent.parent))

from core.format_engine import inject_inline_styles, md_to_html  # noqa: E402

ROOT = Path(__file__).resolve().parent.parent
THEMES = ROOT / "public" / "themes"

# 覆盖面：六级标题 + 段落 + 列表 + 引用 + 代码块 + 表格，尽量让各类样式都出现
MD = """# 产品需求文档 PRD V1.0

本文说明这一版要解决的问题、边界和验收口径，读完这段你应该知道要不要继续看。

## 一、产品概述

这是一个测试段落，用来验证默认版式下不会自动插入目录，也不会被切成卡片。

### 1.1 背景

第二阶段主要面向中小团队，先做最小闭环，不做协作与权限。

#### 1.1.1 现状

每个项目至少显示三条，超出折叠，不打断阅读节奏。

##### 细节

上线后每周复盘一次。

###### 备注

数值以线上为准。

- 列表项一
- 列表项二

> 引用一段话，用来确认引用块配色。

| 列 A | 列 B |
| --- | --- |
| 值 1 | 值 2 |

```python
def hello():
    return "hi"
```
"""


def dump_theme(tid: str) -> str:
    theme = json.loads((THEMES / f"{tid}.json").read_text(encoding="utf-8"))
    return inject_inline_styles(md_to_html(MD), theme)


def dump_all(out_path: Path) -> None:
    ids = sorted(p.stem for p in THEMES.glob("*.json") if p.name != "index.json")
    data = {tid: dump_theme(tid) for tid in ids}
    out_path.parent.mkdir(parents=True, exist_ok=True)
    out_path.write_text(json.dumps(data, ensure_ascii=False), encoding="utf-8")
    print(f"dumped {len(data)} themes → {out_path}")


def diff(before: Path, after: Path) -> int:
    a = json.loads(before.read_text(encoding="utf-8"))
    b = json.loads(after.read_text(encoding="utf-8"))
    changed = [k for k in a if a[k] != b.get(k)]
    only = [k for k in b if k not in a]
    print(f"对比 {len(a)} 套：产物有变化 {len(changed)} 套")
    for k in changed:
        print(f"  · {k}")
    if only:
        print(f"新增主题 {len(only)} 套：{only}")
    return 0


def main() -> int:
    ap = argparse.ArgumentParser()
    ap.add_argument("--out", help="dump 到该文件")
    ap.add_argument("--diff", nargs=2, metavar=("BEFORE", "AFTER"), help="比较两份 dump")
    args = ap.parse_args()
    if args.diff:
        return diff(Path(args.diff[0]), Path(args.diff[1]))
    if args.out:
        dump_all(Path(args.out))
        return 0
    ap.print_help()
    return 1


if __name__ == "__main__":
    sys.exit(main())
