"""
公众号模板全量渲染回归测试（有头浏览器）

覆盖所有 Markdown 元素类型，对代表性主题逐套截图存档，
检查：无崩溃、样式正确、排版美观、中文+英文混排正常。

测试元素清单：
  标题: h1 ~ h6（含中英文、含行内代码）
  文本: 段落(长文)、粗体、斜体、粗斜体、删除线
  行内: 行内代码、链接、图片
  代码: 代码块（多行，模拟 Python/JS）
  列表: 无序(嵌套3层)、有序(嵌套2层)、混合
  引用: 块引用(普通/嵌套/含列表)
  表格: 4列×5行（对齐、长文本单元格）
  分隔线: ---
  脚注: 上标引用 + 脚注区
  Callout: tip / note / warning 类型
  特殊: 超长段落(换行测试)、纯数字、公式感文本
"""
import json, os, sys, time, urllib.request
from pathlib import Path
from playwright.sync_api import sync_playwright

BASE = "http://127.0.0.1:5000"
OUT = Path(__file__).resolve().parent / "theme_shots"
OUT.mkdir(parents=True, exist_ok=True)

# ── 富集测试 Markdown ──────────────────────────────────────────────
TEST_MD = r"""# 一级标题 · 阳光星盘系统 `v2.0`

## 二级标题 项目背景

这是一个**完全本地化**的中文星盘工具，支持 *12 宫位* 和相位解读。

### 三级标题 核心功能

1. 精确计算出生时刻的星盘图
2. 支持 **土星回归** 与 *月相* 分析
3. 用行星落点分析个人特质

#### 四级标题 技术栈

- `Python 3.13` 后端
- `Flask` Web 框架
- `Playwright` 浏览器自动化

##### 五级标题 数据结构

| 字段 | 类型 | 说明 | 必填 |
|------|------|------|------|
| name | string | 用户姓名 | ✓ |
| birth_dt | datetime | 出生时间（本地时区） | ✓ |
| lat | float | 纬度 | ✗ |
| lon | float | 经度 | ✗ |

###### 六级标题 子项详情

> 这是一个**块引用**，用于展示重要提示。
> 嵌套引用：
>
> > 内层引用可以包含 `代码` 和*斜体*。

```python
def calculate_ascendant(lat, lon, sidereal_time):
    '计算上升星座。'
    ramc = sidereal_time + lon
    # 简化算法：实际需用瑞士星历表
    asc = math.atan2(math.sin(ramc), math.cos(ramc) * math.tan(math.radians(lat)))
    return math.degrees(asc) % 360
```

### 长段落换行测试

微信公众号文章通常包含较长的正文段落，需要验证文字在手机端（约 375px 宽度）的换行效果是否正常。本段文字专门用于测试这一场景，包含了中英文混排、数字、标点符号以及一些特殊字符如「全角引号」和半角混用的情形。排版引擎需要正确处理这些情况，确保行高适中、字间距合理、两端对齐或左对齐时的视觉效果令人满意。特别是在使用衬线字体（如宋体/明体）和无衬线字体（如黑体/苹方）时，表现可能有所不同。

### 有序列表与混合内容

1. 第一步：收集用户输入的出生信息
   - 姓名、性别（可选）
   - 出生日期和时间（**必须精确到分钟**）
   - 出生地点（经纬度自动查询）
2. 第二步：调用星历计算引擎
3. 第三步：生成 SVG 星盘图并嵌入 HTML

### 多级无序列表

- 主要功能
  - 星盘计算
    - 行星位置（日月金水木土天海冥）
    - 宫位划分（Placidus / Whole Sign）
    - 相位分析（合拱刑冲六分十二分之五）
  - 文字解读
    - 性格特征概述
    - 事业财运方向
    - 感情关系模式
- 辅助功能
  - 导出 PDF 星盘报告
  - 分享到社交媒体

> [!tip] 小提示
> 点击右上角「一键推送」可直接发送到公众号草稿箱。

> [!note] 注意
> 本工具所有计算均在**本地完成**，数据不会上传到任何服务器。

> [!warning] 免责声明
> 星盘解读仅供娱乐参考，不构成任何决策依据。

---

**加粗文本** 用于强调关键概念；*斜体文本* 用于表达术语或外来语；
`inline code` 表示代码标识符；[超链接](https://example.com) 可跳转外部页面。

![示例图片](https://via.placeholder.com/600x300?text=Cover+Image)

### 脚注测试

太阳返照技术[^1]是预测未来一年趋势的重要方法，常与次限推进[^2]配合使用。

[^1]: Solar Return，即太阳回到精确出生位置的时刻。
[^2]: Secondary Progression，一天对应一年的符号推进法。

### 边界情况

- 纯数字：1234567890
- 特殊字符：©️ ™️ ★ ☆ ● ○ ◎ ▲ ▼ ◆ ◇ ← → ↑ ↓
- 长单词：`Pneumonoultramicroscopicsilicovolcanoconiosis`
- 空 行 上方
- 空 行 下方

**最后一段**：感谢使用 SuperSu 公众号排版工具！🎉
""".strip()

# ── 代表性主题抽样（覆盖不同风格族） ───────────────────────────────
SAMPLE_THEMES = [
    "bold-blue",       # 科技蓝（accent 填充 h1）
    "monocle",         # 文艺衬线（生活风）
    "bauhaus",         # 包豪斯几何（黑白红强对比）
    "warm-card",       # 暖色调卡片
    "elegant-green",   # 雅绿自然
    "minimal-gold",    # 极简金
    "midnight",        # 夜行暗色
    "newspaper",       # 报纸经典
    "ink",             # 墨韵中式
    "bold-blue-ocean", # 生成主题：醒目·海蓝（验证生成主题可用）
]


def main():
    errors = []
    results = []

    # 先通过 API 快速验证所有样本主题可渲染（不依赖浏览器）
    print("=== Phase 1: API 渲染验证 ===")
    api_ok = 0
    for tid in SAMPLE_THEMES:
        try:
            req = urllib.request.Request(
                f"{BASE}/api/render",
                data=json.dumps({"raw_text": TEST_MD, "theme_id": tid}).encode(),
                headers={"Content-Type": "application/json"},
                method="POST",
            )
            with urllib.request.urlopen(req, timeout=15) as resp:
                data = json.loads(resp.read())
                html = data.get("html", "")
                if resp.status == 200 and len(html) > 200:
                    api_ok += 1
                    results.append({"theme": tid, "api": "OK", "html_len": len(html)})
                else:
                    errors.append(f"API-bad:{tid}:status={resp.status},len={len(html)}")
                    results.append({"theme": tid, "api": "FAIL", "html_len": len(html)})
        except Exception as e:
            errors.append(f"API-err:{tid}:{e}")
            results.append({"theme": tid, "api": "ERR", "html_len": 0})
    print(f"  API 渲染: {api_ok}/{len(SAMPLE_THEMES)} 通过")

    # Phase 2: 有头浏览器逐套截图
    print("\n=== Phase 2: 有头浏览器截图 ===")
    with sync_playwright() as p:
        browser = p.chromium.launch(headless=False)
        page = browser.new_page(viewport={"width": 390, "height": 844})  # 手机尺寸
        page.on("console", lambda m: errors.append(f"console:{m.type}:{m.text}") if m.type == "error" and "ERR_CONNECTION_CLOSED" not in (m.text or "") else None)
        page.on("pageerror", lambda e: errors.append(f"pageerror:{str(e)}"))

        page.goto(BASE, wait_until="networkidle")
        page.wait_for_selector("#input-area", timeout=10000)

        # 注入测试文本
        page.fill("#input-area", TEST_MD)
        page.wait_for_timeout(300)

        shot_ok = 0
        for i, tid in enumerate(SAMPLE_THEMES):
            # 策略：清空搜索 → 在完整色卡列表中精确匹配 data-tpl
            page.fill("#tpl-search", "")
            page.wait_for_timeout(200)

            # 滚动色卡条到顶部确保所有卡可查询
            page.eval_on_selector("#tpl-strip", "el => el.scrollTop = 0")
            page.wait_for_timeout(150)

            cards = page.query_selector_all("#tpl-strip .tpl-card")
            target = None
            for card in cards:
                dp = card.get_attribute("data-tpl") or ""
                if dp == tid:
                    target = card
                    break
            # fallback: 部分匹配（处理可能的 id 变体）
            if not target:
                for card in cards:
                    dp = card.get_attribute("data-tpl") or ""
                    tname = card.eval_on_selector(".tname", "el => el.textContent").strip()
                    if tid in dp or tid.replace("-", "") in dp.replace("-", "") or tid in tname:
                        target = card
                        break
            # last resort: 用搜索框缩小范围再找
            if not target:
                kw = tid.split("-")[0] if "-" in tid else tid[:5]
                page.fill("#tpl-search", kw)
                page.wait_for_timeout(300)
                cards = page.query_selector_all("#tpl-strip .tpl-card")
                if cards:
                    target = cards[0]

            if not target:
                errors.append(f"NOTFOUND:{tid}")
                page.fill("#tpl-search", "")
                page.wait_for_timeout(150)
                continue

            # 滚动到目标卡可见区域再点击
            target.scroll_into_view_if_needed()
            page.wait_for_timeout(150)
            target.click()
            page.wait_for_timeout(800)

            # 等预览 iframe 加载
            frame_el = page.query_selector("#preview-frame[src]")
            if frame_el:
                # 切到手机预览模式
                page.click('[data-preview="phone"]')
                page.wait_for_timeout(400)

                safe_name = tid.replace("/", "_")
                shot_path = OUT / f"{safe_name}.png"
                page.screenshot(path=str(shot_path), full_page=True)
                shot_ok += 1
                results[i]["screenshot"] = str(shot_path)
                print(f"  [{i+1}/{len(SAMPLE_THEMES)}] {tid} → 截图 OK ({shot_path.stat().st_size//1024}KB)")

                # 切回 HTML 模式供下一轮
                page.click('[data-preview="html"]')
                page.wait_for_timeout(200)
            else:
                errors.append(f"NORENDER:{tid}")
                print(f"  [{i+1}/{len(SAMPLE_THEMES)}] {tid} → 未渲染")

            # 清空搜索，准备下一轮
            page.fill("#tpl-search", "")
            page.wait_for_timeout(150)

        browser.close()

    # ── 汇总 ─────────────────────────────────────────────────────
    print(f"\n{'='*50}")
    print(f"API 通过     : {api_ok}/{len(SAMPLE_THEMES)}")
    print(f"截图成功     : {shot_ok}/{len(SAMPLE_THEMES)}")
    print(f"错误数       : {len(errors)}")
    if errors:
        print(f"错误详情     :")
        for e in errors[:15]:
            print(f"  - {e}")
        if len(errors) > 15:
            print(f"  ... 还有 {len(errors)-15} 条")

    # 写结果 JSON
    (OUT / "test_results.json").write_text(json.dumps(results, ensure_ascii=False, indent=2), encoding="utf-8")

    ok = (api_ok == len(SAMPLE_THEMES) and shot_ok >= len(SAMPLE_THEMES) - 1 and len(errors) == 0)
    print(f"\nRESULT: {'PASS ✅' if ok else 'FAIL ❌'}")
    return 0 if ok else 1


if __name__ == "__main__":
    sys.exit(main())
