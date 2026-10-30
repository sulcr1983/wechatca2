#!/usr/bin/env python3
"""验证外部适配主题（xh- 前缀）能正常被 /api/themes 列举并 /api/render 渲染。

不依赖外部服务：直接用 app.test_client()。
"""
import sys
import pathlib

ROOT = pathlib.Path(__file__).resolve().parent.parent.parent
sys.path.insert(0, str(ROOT))

import app as app_module

SAMPLE_MD = """# 主标题 H1
## 二级标题 H2
这是一段**加粗**与*斜体*以及 `inline code` 的正文。
> 引用一段话，用于测试 blockquote 样式。
## 列表
- 无序项一
- 无序项二
  - 嵌套项
## 表格
| 列A | 列B | 列C |
| --- | --- | --- |
| 1 | 2 | 3 |
| 4 | 5 | 6 |
## 代码
```python
def hello():
    return "world"
```
"""

# 挑选若干设计语言差异明显的外部主题
XH_SAMPLE = [
    "xh-brutalism-raw",   # 粗野主义黑边
    "xh-swiss-grid",      # 瑞士网格
    "xh-memphis",         # 孟菲斯
    "xh-vaporwave",       # 蒸汽波渐变
    "xh-kaiti-journal",   # 楷体期刊衬线
    "xh-blueprint",       # 蓝图
]
ORIG_SAMPLE = ["bauhaus", "monocle", "midnight"]


def main():
    client = app_module.app.test_client()

    # 1) /api/themes 计数
    r = client.get("/api/themes")
    assert r.status_code == 200, f"/api/themes -> {r.status_code}"
    themes = r.get_json()
    total = len(themes)
    xh = [t for t in themes if t["id"].startswith("xh-")]
    print(f"[themes] total={total}  xh-external={len(xh)}")
    assert total == 92, f"期望 92，实际 {total}"
    assert len(xh) == 47, f"期望 47 外部主题，实际 {len(xh)}"

    # 抽样校验 xh 主题带 colors（用于顶栏色板）
    for tid in XH_SAMPLE:
        meta = next((t for t in themes if t["id"] == tid), None)
        assert meta, f"未找到 {tid}"
        assert meta["colors"].get("primary"), f"{tid} 缺少 primary 色"
    print(f"[themes] 抽样 {len(XH_SAMPLE)} 个外部主题均含 colors ✓")

    # 2) /api/render 渲染校验
    fail = 0
    for tid in XH_SAMPLE + ORIG_SAMPLE:
        r = client.post("/api/render", json={"raw_text": SAMPLE_MD, "theme_id": tid})
        if r.status_code != 200:
            print(f"  ✗ {tid} render -> {r.status_code}")
            fail += 1
            continue
        html = r.get_json().get("html", "")
        ok = ("<h1" in html) and ("<table" in html) and ("<blockquote" in html) and len(html) > 200
        status = "✓" if ok else "✗"
        if not ok:
            fail += 1
        print(f"  {status} render {tid}  (html {len(html)} bytes, h1/table/quote present={ok})")
    assert fail == 0, f"{fail} 个主题渲染失败"

    print("\nALL PASS ✅  外部主题适配 + 渲染验证通过")


if __name__ == "__main__":
    main()
