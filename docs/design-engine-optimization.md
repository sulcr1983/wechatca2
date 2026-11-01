# 排版引擎优化方案（2026-11-01）

> 状态：**方案文档**，`core/format_engine.py` 一个字未改
> 配套：[`design-kit-themes.md`](design-kit-themes.md)（kit 主题）、
> [`design-magazine-recipes.md`](design-magazine-recipes.md)（15 套配方）
>
> **重要**：本文开头先纠正我此前提出的两项错误诊断。诊断必须跑真实管线，
> 不能靠读正则推断 —— 这条教训写在 §0。

---

## 0. 先纠正两个错误诊断

我在上一轮对话里提了三个「引擎问题」。**实测后两项被推翻**，必须如实记录。

### 0.1 ❌ 已推翻：`_layout_rhythm` 静默失效

**我当时的说法**：`format_engine.py:3077` 的正则
`r'(<p[^>]*style="[^"]*?)margin-bottom:[^;"]*'` 在 `<p>` 没有 `style` 属性时一条都不命中，
所以段距放大从未生效。

**实测结果（走真实管线 `inject_inline_styles`）**：

```
base20 3   rh26 3   base_bar False   rh_bar True
```

- 不加版式：段距 `margin-bottom:20px` 出现 **3 次**
- 加 rhythm：段距变为 `margin-bottom:26px` 出现 **3 次**
- 强调条 `width:4px;height:15px`：base 无、rhythm **有**

**版式两端全部生效。**

**我错在哪**：只看正则、没看执行顺序。`inject_inline_styles` 的步骤是
**第 5 步样式注入 → 第 8 步布局分发**，等版式跑的时候 `<p>` 早已带上
`style` 和 `margin-bottom`，正则必然命中。

**补充核实**：164/164 套主题的 `styles.p` **全部带 `margin_bottom`**（缺失数为 0），
所以连「主题没声明 margin-bottom」的边界场景都不存在。

**结论**：此项**不是缺陷，从优化清单移除**。

### 0.2 ⚠️ 需精确化：「按 `<h[12]>` 切节」重复

**我当时的说法**：重复了 7 处，需要抽公共函数。

**实测结果**：

```
L1913  _wrap_card_sections        re.split(r'(?=<h[12]\s)')      ← 语义不同
L2911  _split_by_headings         re.finditer(...)                ← 公共函数本体
L2924  _split_head_body           re.match(...)                   ← 公共函数本体
L2982  _layout_magazine           内联重写
L2995  _layout_magazine           内联重写
L3092  _layout_cardflow           内联重写
L3102  _layout_cardflow           内联重写
L3126  _layout_outline            内联重写
```

**真相**：公共函数 `_split_by_headings`(L2904) 与 `_split_head_body`(L2922)
**早就存在**。重复的只是 **3 处调用点**（magazine / cardflow / outline），
它们各自把等价逻辑内联写了一遍，没有复用。

**所以这项不是「抽新函数」，而是「把三处改成调用既有函数」** —— 改动更小、风险更低。

---

## 1. 三项真实改造

| # | 改造 | 性质 | 风险 |
|---|---|---|---|
| A | 三处切节改为复用 `_split_by_headings` / `_split_head_body` | 纯重构，输出应字节不变 | 低 |
| B | `_strip_heading_block` 补强：白名单扩展 + 白字回退改判据 | 修真实脆弱点 | 中 |
| C | 新增 `heading_extras` 渲染钩子 | **新增能力**（15 套里 8 套的硬依赖） | 中 |

---

## 2. 改造 A：三处切节复用既有函数

### 2.1 现状对比

| 调用点 | 现在的写法 | 与 `_split_by_headings` 是否等价 |
|---|---|---|
| `_layout_magazine` L2982-2995 | `marks = [m.start() ...]` + 手写 `lead` / `sections` + `re.match` 拆 head/body | ✅ 完全等价 |
| `_layout_cardflow` L3092-3102 | 同上 | ✅ 完全等价 |
| `_layout_outline` L3126-3135 | 同上，但额外用 `re.match(r"<h2[^>]*>(.*?)</h2>")` 提取纯文本做目录 | ⚠️ 部分等价（多一步取文本） |

### 2.2 改法

```python
# 三处统一替换为：
lead, sections = _split_by_headings(html)
if len(sections) < 2:
    return html
for sec in sections:
    head, body = _split_head_body(sec)   # 替代手写的 re.match
```

**`_layout_outline` 的特殊处**：它要从每节提取 h2 纯文本做目录。这一句
`re.match(r"<h2[^>]*>(.*?)</h2>")` **保留**，但改用 `_split_head_body(sec)[0]`
拿到 head 后再取文本，减少正则重复。

### 2.3 可验证判据

| 判据 | 怎么验 |
|---|---|
| 164 套渲染 HTML **逐字节不变** | `theme_render_dump.py --out before.json` → 改 → `--out after.json` → `--diff before.json after.json`，必须**无输出** |
| 三个版式行为不变 | 同一夹具 × 三个版式，改前改后 dump 对比 |
| 反向验证（判据能红） | 故意把 `_split_head_body` 改成返回 `("", section)` → 目录必须消失、diff 必须报差异 |

### 2.4 回归命令

```bash
# 改前
.venv/Scripts/python.exe scripts/theme_render_dump.py --out output/rd-before.json
# 改后
.venv/Scripts/python.exe scripts/theme_render_dump.py --out output/rd-after.json
# 比对（必须无差异）
.venv/Scripts/python.exe scripts/theme_render_dump.py --diff output/rd-before.json output/rd-after.json
```

> ⚠️ `theme_render_dump.py` 只 dump 主题样式，**不含 layout**（因为 164 套 layout 全为空）。
> 所以三个版式的行为要单独验：写一个固定夹具 × 3 版式的小脚本，改前改后各跑一次比对。

---

## 3. 改造 B：`_strip_heading_block` 的脆弱点

### 3.1 它是什么

`format_engine.py:2701-2740`。作用是：版式（cardflow / card）把每节包成卡片时，
把标题上的「实心背景块」擦掉，否则会出现「卡片里套一个色块」的双重卡片。

### 3.2 三个真实脆弱点（实测确认）

| # | 问题 | 证据 | 后果 |
|---|---|---|---|
| 1 | **白名单硬编码 6 个属性** | L2727-2728 只跳过 `background` / `background-color` / `border-radius` / `display` / `padding` / `box-shadow` | 新增视觉属性（`text-shadow`、`background-image`）会漏擦 |
| 2 | **白字回退只认 5 个硬编码色值** | L2731-2732 只匹配 `#fff` / `#ffffff` / `white` / `#fefefe` / `#f8f8f8` | 其他近白（`rgba(255,255,255,.9)`、`#FAFAFA`）不会被改写成 ink → **白字消失** |
| 3 | **依赖人工记得调用** | 3 个调用点（L1924 / L2998 / L3108）都是手写的 | 新加版式忘调 → 双重卡片回归 |

### 3.3 改法

**问题 1 —— 改成「属性黑名单 + 前缀匹配」的反面思路**：不再白名单跳过，而是
**只保留「与排版无关紧要的排版属性」**（`font-*` / `color` / `line-height` / `letter-spacing` / `margin-*`），
其余一律剔除。这样新属性默认被擦除，不会被漏。

> 这是一个语义反转，必须用 §2.4 同样的 dump 对比证明 164 套输出不变。
> 若不变，说明现有主题的 h1-h3 本来就没有会触发差异的属性。

**问题 2 —— 白字判定改用亮度**：已有 `_luminance(rgb)`（L1380）。
把「是否白字」从「字符串匹配 5 个值」改成「亮度 > 0.9 即视为白」，
覆盖 `rgba` 与任意近白。

**问题 3 —— 加一句 docstring 警告 + 在 `LAYOUT_REGISTRY` 处集中注释**：
手写调用无法自动化，但可以在新增版式的入口处写清「包卡片类版式必须调用它」。

### 3.4 可验证判据

| 判据 | 怎么验 |
|---|---|
| 164 套 dump 无差异 | 同 §2.4 |
| **近白字场景真的被修好** | 造一个 `h2` 用 `color: rgba(255,255,255,.9)` + `background:#256F9D` 的临时主题，跑 cardflow，断言输出里没有 `rgba(255,255,255,.9)` |
| 反向验证 | 把亮度判据写反（> 0.1）→ 该测试必须失败 |

---

## 4. 改造 C：`heading_extras` 渲染钩子（新增能力）

### 4.1 为什么必须做

**实测确认的能力缺口**：

```python
h = md_to_html('## 小节\n\n正文。')
out = inject_inline_styles(h, ...)
# h2 内部内容: '小节'
# h2 内有子标签吗: False
```

引擎**没有任何「在标题内插入子元素」的能力**。而 15 套配方里 8 套硬依赖它：

| 配方 | 需要的子元素 |
|---|---|
| 时代周刊 | 红色细框（其实是 border，不需要）／但眉标需要 |
| 卫报 | 眉题「观点 / Opinion」+ 10px 红方块 |
| 经济学人 | 小标题前的红色 01 序号 |
| 国家地理 | 双线夹住的黄金编号 |
| Vogue | 52px 斜体衬线编号 |
| 福布斯 | 无（用大数字段落，不需标题内插） |
| 无印良品 | 眉标 + 酒红序号 |
| 浅草/纪事等 | 编号徽标 |

> 注：引擎已有 `_build_eyebrow_html`（L733）能生成小标签，但那是**围栏容器**（`:::eyebrow`），
> 需要用户手写标记，不能由版式自动加到标题里。

### 4.2 设计

在 `theme` 里声明（可选），版式分发时生效：

```jsonc
{
  "heading_extras": {
    "h1_before": "kicker",      // 标题前插一行小字（取主题的 kicker_text）
    "h1_after":  "bar",         // 标题后插装饰块
    "h2_before": "badge",       // h2 前插编号徽标
    "kicker_text": "观点 / Opinion",
    "style": { ... }            // 各枚举对应的样式，由版式函数提供默认值
  }
}
```

**取值是枚举字符串，不是任意 HTML**。理由：主题 JSON 是数据，塞任意 HTML 等于把
XSS 面开进主题文件。枚举 → 渲染器查表产出固定安全的 HTML。

枚举值（第一批）：
- `kicker`：标题上方一行小字（字号 11–14px、字距 3px、强调色）
- `bar`：标题后一块独立色块（短横条 / 渐变色条）
- `badge`：h2 前的编号徽标（圆角方 / 双线夹 / 纯数字，由版式决定具体形态）

### 4.3 插在哪里

**必须插在「第 5 步样式注入」之后**，理由不是「防止 span 被套样式」——实测：
`simple_tags`（L2285）只有 `h1..h6/p/strong/em/a/img/hr/code/table/th/td`，
**不含 `span`**，所以插进去的 `<span>` 本来就不会被注入（实测确认 span 无 style 属性）。

真正要排在第 8 步（布局分发）之前，是为了让版式函数能看到完整的标题结构
（例如 `_strip_heading_block` 处理的是 h2 开标签本身，子元素要先就位）。

具体落点：新增 `inject_heading_extras(html, theme)`，在 `inject_inline_styles` 里
紧挨着 `apply_paragraph_blocks`（第 7.9 步）之后、第 8 步分发之前调用。

> ⚠️ 注意：`convert_lists_to_sections`（第 1 步）会把列表转成 `<section><span>`，
> 说明引擎本来就在产 span。所以本钩子不引入新的微信兼容风险。

### 4.4 可验证判据

| 判据 | 怎么验 |
|---|---|
| **声明了就出现** | 临时主题加 `h2_before: "badge"` → 输出里 `<h2>` 内必须有 `<span>` |
| **没声明就字节不变** | 164 套（都没声明）dump 与改动前逐字节一致 |
| **不吞字** | 插了子元素的 h2，纯文本长度必须 = 原文长度 + 徽标文本（如「01」2 字符） |
| 反向验证 | 把 `inject_heading_extras` 改成 `return html` → 第一条必须失败 |

---

## 5. 微信安全区清单

### 5.1 可用能力（引擎已在用，15 套只用到这些）

| CSS 能力 | 15 套里谁在用 | 引擎既有依据 |
|---|---|---|
| 内联 `style` 属性 | 全部 15 套 | 引擎的基本做法 |
| `border` / `border-radius` | 时代周刊细框、浮世绘、新粗野粗框 | `_strip_heading_block` L2727 擦的就是它们 |
| `box-shadow`（含无模糊硬阴影） | 浮世绘印章、新粗野 8px 偏移 | L1579 / L1908 / L2156 |
| `background` / `linear-gradient` | 笔记纸底网格、书签标题底 | 引擎已输出 |
| `background-position`（**注意**：这是背景定位，不是 `position` 布局） | 无（15 套未用） | 164 套里 2 套在用（`focus-gold` / `focus-red` 的 `background-size:100% 1px` 细线） |
| `letter-spacing` | 卫报眉题 3px、无印 0.5px | 引擎已输出 |
| `flex` | 双栏/并排结构 | 对话气泡 L1579 已在用 |
| `display:inline-block` | 编号徽标、彩色书签标题 | 引擎已在用 |
| `text-align` / `text-indent` / `line-height` | 全部 | 引擎已输出 |

### 5.2 禁用能力（15 套实测 0 处）

| 禁用项 | 后果 | 15 套实测 |
|---|---|---|
| `position` **布局定位**（`relative`/`absolute`/`fixed`） | 微信会剥离 | **0 处** |
| `<style>` 标签 / 类选择器 | 公众号只认内联 | **0 处** |
| `animation` / `transition` | 会被剥离 | **0 处** |
| `filter`（含 `drop-shadow`） | 微信不支持 | **0 处**（硬阴影一律用 `box-shadow`） |
| `var(--x)` CSS 变量 | 微信不解析 | **0 处** |

### 5.3 实测依据（不是推断）

**原型侧**：逐个点开 15 套配方，扫描其 `.doc` 内联样式：

```js
// 结果：scanned 15, bad = {position:0, filter:0, animation:0, transition:0, style_tag:0, var_fn:0}
```

**引擎侧**：164 套主题全量扫描，用排除 `background-position` 的精确正则
`(?<![a-z-])position\s*:` —— **真定位 0 命中**。

> ⚠️ 我第一次扫描用朴素 `position:` 命中 2 套，那是 `background-position`（合法），
> 属于**假阳性**。判据必须带负向前瞻，否则会把合法写法当成越界。

### 5.4 结论

15 套配方**零新增微信依赖**，全部落在「引擎已经在用、且线上已验证」的 9 项能力内。
所以不存在「原型好看、上线变样」的技术原因。

> 唯一注意：`box-shadow` 硬阴影必须写 `rgba` 字面值，不能用 CSS 变量。

### 5.5 可自动化判据（建议做成门禁）

新增一个「越界扫描」，对 15 套 × 各版式的产物跑：

```python
BAD = [
    (r"(?<![a-z-])position\s*:", "position 布局"),
    (r"<style", "<style> 标签"),
    (r"(?<![a-z-])animation\s*:", "animation"),
    (r"(?<![a-z-])transition\s*:", "transition"),
    (r"(?<![a-z-])filter\s*:", "filter"),
    (r"var\(--", "CSS 变量"),
]
```

反向验证：故意往某套样式中注入 `position:absolute` → 必须报错。

---

## 6. 三项改造的落地顺序与总验收

| 顺序 | 改造 | 前置 |
|---|---|---|
| 1 | A：切节复用 | 无（纯重构） |
| 2 | B：`_strip_heading_block` 补强 | A 完成后（避免两个改动混在一起难定位） |
| 3 | C：`heading_extras` 钩子 | A 完成后 |

**每步都跑同一套验收**：

```bash
# 1) 零回归：164 套 dump 无差异
.venv/Scripts/python.exe scripts/theme_render_dump.py --out output/rd-before.json
#   … 改代码 …
.venv/Scripts/python.exe scripts/theme_render_dump.py --out output/rd-after.json
.venv/Scripts/python.exe scripts/theme_render_dump.py --diff output/rd-before.json output/rd-after.json

# 2) 现有门禁全绿
.venv/Scripts/python.exe scripts/theme_contrast_audit.py     # 164 套对比度
.venv/Scripts/python.exe scripts/audit_theme_spec.py         # 配色对照规范

# 3) 三个版式行为不变（需自写夹具脚本）
```

**总判据**：三项改造做完，**164 套 palette 主题的渲染产物必须与今天逐字节一致**。
新增能力只对「显式声明了它的主题」生效。

---

## 7. 不做

| 不做 | 原因 |
|---|---|
| 修 `_layout_rhythm` | **实测证明它没坏**（§0.1），改了才是风险 |
| 重建 `LAYOUT_REGISTRY` 架构 | 现有「一个版式一个函数 + 注册表」的模式是对的，15 套加了 15 个函数即可 |
| 让主题写任意 HTML | 枚举查表，避免 XSS 面进主题数据 |
| 引入 `<style>` / 类选择器 | 公众号只认内联，doocs/md 那套不能照搬（见开源调查 §1.3） |
| 把 `_split_top_blocks` 也统一 | L2930 那个是「按顶层块切分」，语义与「按标题切节」不同，强行统一会引入 bug |
