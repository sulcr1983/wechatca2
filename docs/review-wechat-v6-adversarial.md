# 公众号排版页 v6/v7 方案 · 对抗性审查（2026-11-03）

> **审查对象**：`docs/design-wechat-v6-final.md`（方案定稿）+ `docs/plan-wechat-v6-implementation.md`（实现计划）
> **审查方式**：不信任文档，逐条回代码取证。每条结论都附「文件 + 行号 + 实测」。
> **立场**：假设这两份文档是错的，然后去证明它错在哪。凡拿不出代码证据的，不写成结论。

---

## 零、先回答「有没有问题」

有。分五档严重度：

| 档 | 数量 | 性质 | 后果 |
|---|---|---|---|
| **A** | 4 条 | **文档事实错误** —— 说「线上没有 X」，实际线上有，且做得更完整 | 会重复造轮子，或修一个不存在的 bug |
| **B** | 4 条 | **照抄原型会静默失效** —— 变量名 / 选择器 / 尺寸预算对不上 | 改完没反应，且不报错 |
| **C** | 4 条 | **计划的技术缺陷** —— 会真的做错，不是文档笔误 | 19 套字号全体系缩水、装饰撑破版式 |
| **D** | 3 条 | **夹具设计的根本缺陷** —— 断言恒真，测不出东西 | 正是用户担心的「放上去就是摆设」 |
| **E** | 8 条 | **整体页面设计的结构性冲突** —— 与既有约束打架 | 顶栏挤爆、卡片读不清、宽度预算没算、**19 套埋在抽屉最后且无分区、缩略图被裁、说明条漏英文 id、版式区对 kit 全灰** |

**最值得先看的是 D-1**：那份 152 条断言的夹具，**其中 133 条对 18 套是恒真的**（测不出任何东西）。
这直接命中用户那句「不然放上去就是摆设」——但摆设的不是功能，是**测试本身**。

---

## 一、A 类：文档事实错误

### A-1 【严重】§1.1 说「配色微调全文件零监听、零读取」，实际线上一整套都实现了

**方案原文**（`design-wechat-v6-final.md:37`）：

> 设置弹窗里「底色 / 正文 / 强调」三个 `<input type="color">`，**全文件零监听、零读取**。
> 用户能点、能选色，但预览毫无反应，且不报错。……属于「能点但没用」的假控件。

**代码事实**（`pwa/src/app.js`）：

| 行号 | 内容 | 说明 |
|---|---|---|
| 291 | `const CUSTOM_ID = '__custom__';` | 虚拟主题 id |
| 292 | `const LS_CUSTOM = 'supersu.pwa.custom';` | 持久化键 |
| 293 | `let customBase = '';` | 以哪套主题为底（保字号/间距） |
| 297 | `function customColors()` | 读 localStorage |
| 1633 | `const syncCustomInputs = () =>` | 回填取色器初值 |
| 1640 | `const onColor = () =>` | **改色即生效**，写 `LS_CUSTOM` |
| 1647 | `themeJsonCache.delete(CUSTOM_ID)` | 缓存失效（很细的工程细节） |
| 1650 | `['dc-bg','dc-text','dc-accent'].forEach(...'input'...)` | **三个 input 监听** |
| 1653 | `if ($('dc-reset'))` | 恢复按钮 |
| 606–607 | `custom.classList.toggle('locked', isKit)` | **kit 下已禁用** |

**结论：这不是「假控件」，是一套完整实现，连「缓存失效」和「kit 下禁用」都做了。**

**但方案识别对了一半**：线上语义是「自定义配色 = 一套持久化的虚拟主题 `__custom__`」，
而方案要的是「微调 = 临时覆盖，切主题自动清空」。**这是两种不同语义**，确实需要改 ——
但要改的是**语义**，不是「从零接线」。

**修正**：
- 方案 §1.1 的「现状问题」改为：「已实现为持久化虚拟主题，与『临时微调』语义不符」。
- 实现计划 P4 删掉「新增 `S.tune` + input 监听」，改为「改造现有 `onColor` 的清空时机」。
- **新增工作量估计从「接线」降为「改 1 个函数的行为」**，但**多出一项风险**：改语义会影响已存 `LS_CUSTOM` 的老用户数据，需要迁移策略。

### A-2 §1.2 说「线上存在同款结构，实现阶段要一并核验」，实际早就修好了

**方案原文**（`:51`）：

> 修法：点击处理里把 `[data-fav]` 排在 `[data-th]` **之前**并 `stopPropagation()`。
> 线上存在同款结构，实现阶段要一并核验。

**代码事实**（`pwa/src/app.js:1685`）：

```js
if (favBtn) { e.stopPropagation(); toggleFav(favBtn.dataset.fav); return; }
```

`stopPropagation` + `return` 都在，**星标不会误触主题切换**。

**结论：这是「原型踩到的坑」，不是「线上的坑」。** 方案把它写成「实现阶段要核验」，
会让执行者去找一个不存在的 bug。应改为：「原型曾踩此坑，线上已正确；实现时只需回归测试，不必改代码。」

### A-3 【严重】§1.4「版式条 `slice(0,6)` 只露 6 项」—— 那是原型的函数，线上没有这个 bug

**方案原文**（`:68`）：

> 底部版式条 `renderLayBar()` 用 `all.slice(0, 6)` 只露出 6 项，而抽屉里是 8 项。

**代码事实**：

| 位置 | 事实 |
|---|---|
| 原型 `wechat-v7.html:1552` | `function renderLayBar()` —— **这是原型的函数** |
| 原型 `:1568` | 注释「8 项全显示（2026-11-03 用户定）：原来 slice(0,6)…」 |
| 线上 `pwa/src/app.js:529` | `function renderCaps()` —— **线上没有 `renderLayBar`** |
| 线上 `:534` | `slice(0, 40)` —— 这是**色卡胶囊条**（装主题，不是版式） |
| 线上 `:663 LAYOUT_OPTIONS` | **实测 8 项，无 slice** |
| 线上 `:691 renderLayouts()` | 版式区，`LAYOUT_OPTIONS.map(...)` 全量渲染 |

**结论：线上版式区本来就是 8 项全显示。** 实现计划 P4 那条「去掉 `slice(0,6)`」是**修一个不存在的 bug**，
改完会「没变化」，然后被误判成「改了没生效」。

**修正**：P4 删掉该项。改为：「线上已是 8 项，只需回归确认（`LAYOUT_OPTIONS.length === 8`）。」

### A-4 【严重】「顶栏 ⚙ 设置弹窗」—— 线上顶栏**根本没有 ⚙ 按钮**

**方案原文**（`:196`）：

> | 顶栏 ⚙ 弹窗（低频） | 背景 / 配色微调 / 页尾 / 内容开关 / 数据 |

**代码事实**（`pwa/index.html:29–68`）线上顶栏实际内容：

```
.brand + 三个模块导航按钮（公众号排版 / 小红书标题图 / 小红书长图文）
+ 引擎徽标 + 导出▾（菜单 4 项）+ AI + ⋯（菜单 8 项）
```

`grep "btn-settings\|⚙" pwa/index.html pwa/src/app.js` → **0 命中**。

**结论**：所谓「设置弹窗」不是「把已有弹窗内容挪一挪」，而是**全新造一个弹窗 + 全新造一个顶栏按钮**。

**而且这和既有铁律直接冲突**（`AGENTS.md` §6 原文）：

> ⚠️ 顶栏在 390px 已挤满 4 个控件，不要再往里加按钮（2026-10-27 实测加第 5 个会与 `#btn-cover` 重叠 21px）

现在顶栏已经有 3 个模块导航 + 引擎徽标 + 导出 + AI + ⋯，**在 390px 早就超了**。
再加一个 ⚙，不是「重叠 21px」的量级。

**修正**（三选一，需用户拍板，见 §六 问题 1）：
- ① 设置入口并入现有 `⋯` 菜单（零新增顶栏控件）；
- ② 设置入口移到抽屉头部（与「风格库」标题同一行）；
- ③ 坚持新增 ⚙，但必须同时压缩/合并其他控件，属**额外改造**。

---

## 二、B 类：照抄原型会静默失效

### B-1 【严重】CSS 变量名全部对不上，方案给的代码块照抄必失效

**方案 §1.5 给的最终规格**（`:105–110`）：

```css
.d-body{ background:var(--color-foreground); }
.d-name{ color:#F7F4EE; }
.d-fav { color:rgba(247,244,238,.55); }
```

**代码事实**（`pwa/src/style.css:6–31`）线上变量体系：

```
--bg-canvas  --bg-surface  --bg-raised  --bg-hover
--border  --border-hi  --text  --text-soft  --text-muted
--accent  --accent-dim  --accent-soft  --accent-glow
```

`grep -c "\-\-color-" pwa/src/style.css` → **0**。

**结论**：`var(--color-foreground)` 在线上是**未定义变量** → 该属性整条失效 → `.d-body` 背景**不会变深**，
标题条变成「白字压白底」→ 文字直接消失。**这正是 v3/v4 四轮失败的同一种失败模式，只不过这次是「字不见了」而不是「区别不明显」。**

**修正**：全部映射到线上变量：

```css
.d-body{ padding:10px 12px; background:var(--text); border-top:0; }   /* --text = #191713 深墨 */
.d-name{ color:var(--bg-canvas); }                                     /* --bg-canvas = #F7F4EE 暖纸 */
.d-fav { color:rgba(247,244,238,.55); }                                /* 这个值本身是对的，可保留 */
.d-fav[data-on="1"]{ color:#E8A08C; }
```

> ⚠️ **建议**：不要用字面量 `#F7F4EE` / `#191713`，用 `var(--bg-canvas)` / `var(--text)`。
> 否则将来换主题色，标题条不跟着变，又是一个「两套真源」。

### B-2 【严重】`.d-family-card .d-name` 会覆盖 C 案，族代表卡标题变成 3.06:1 不可读

**代码事实**（`pwa/src/style.css:414`）：

```css
.d-family-card .d-name { color: var(--accent); }   /* --accent = #AF3E2B 朱砂 */
```

**CSS 特异性**：`.d-family-card .d-name`（0,2,0）**高于** `.d-name`（0,1,0）。
C 案把 `.d-name` 改成浅色，**族代表卡的标题仍然是朱砂色**，压在 `--text`（#191713）深墨底上。

**实测对比度**：

```
#AF3E2B on #191713 = 3.06 : 1     （正文要求 4.5:1，未达标）
```

**结论**：族代表卡（抽屉里最重要的那一类卡）标题**会看不清**。这是 C 案的漏网之鱼，方案完全没提。

**修正**：C 案必须显式覆盖族代表卡：

```css
.d-body{ background:var(--text); }
.d-name,
.d-family-card .d-name{ color:var(--bg-canvas); }   /* 特异性拉平后再覆盖 */
```

或者更稳的写法：把 `.d-family-card .d-name` 的着色改成**只改左侧竖线/圆点**，不靠字色区分族。

### B-3 【严重】`.d-card{ min-height:140px }` 的尺寸预算会被 `aspect-ratio` 打破

**代码事实**（`pwa/src/style.css:377–385`）原文注释写得很清楚：

```css
/* 2026-10-19 修：缩略图高度 84→104 时未同步抬高卡片，卡片被钉在 118px，
   flex 把 .d-prev 压回 ~82px（线上实测）。104 + 32(body) = 136 内容高，
   留 2px 余量 → 140。 */
.d-card { display:flex; flex-direction:column; min-height:140px; }
```

而 `:398` 是 `.d-prev{ height:104px; }` —— **写死高度**。

**方案要同时改两处**：
1. `.d-prev` `height:104px` → `aspect-ratio:2/1`（宽度驱动，两列 221px → **111px**）
2. `.d-body` `padding:7px 9px 8px` → `padding:10px 12px`（**每边多 3px，高 +6px**）
3. `.d-name` `font-size:12px` → `15px/700`（**高 +约 6px**）

**算账**（两列，列宽 221px）：
- 新版 `.d-prev` = 111px（比原 104 **矮 7px**）
- 新版 `.d-body` = 10+~20+10 = **约 40px**（原约 32px，**高 8px**）
- 合计 ≈ **151px** > `min-height:140px`

**结论**：`min-height:140px` 从「兜底」变成「约束」，但**没超**，所以不会压扁。
但注释里那套「104+32=136，留 2px」的推导**已完全失效**，且 `.d-card` 是 flex 列，
`.d-prev` 一旦从固定高变 aspect-ratio，在 `min-height` 与 flex 分配之间会出现**谁赢**的问题。

**修正**：P4 里必须补一条——**同步更新 `.d-card` 的 `min-height` 与注释**，
并在真机（两列 1420px 抽屉 / 一列 / 移动端）三种宽度下各量一次 `d-prev` 实际高。
`aspect-ratio` 在 flex 子项里被 `min-height` 挤压是**已知的浏览器行为**，不实测不敢保证。

### B-4 抽屉宽度有四个互不相同的数字，方案没对齐线上真值

| 来源 | 数值 | 出处 |
|---|---|---|
| 线上抽屉 | `min(560px, 94vw)`，browsing 时 **500px** | `style.css:313, 324` |
| 原型抽屉 | `--drawer-w: 520px` | `wechat-v7.html:61` |
| 方案 §3.2 折叠前 | **450px** | `design-wechat-v6-final.md` 摘要 |
| 方案 §3.2 折叠后 | **248px** | 同上 |

**结论**：`body.browsing .stage { padding-right: 500px }` 与实际抽屉宽**必须联动**，
四个数字里没有一个能直接用。折叠后 248px，则 `padding-right` 也必须变成 248px，
否则预览区右侧留 252px 空白。

**修正**：P4 明确「抽屉宽度改为 CSS 变量 `--drawer-w`，`body.browsing` 的 `padding-right` 与其联动」，
并列出三态真值：展开 500 / 折叠 248 / 移动端 `min(560px,94vw)`。

---

## 三、C 类：计划里的技术缺陷（会真的做错）

### C-1 【最严重】字号基准写死 15px 是错的：19 套里 3 套正文是 17px

**方案原文**（`design-wechat-v6-final.md:213`）：

> | 基准 | 15px = 主题原值，`ratio=1` 时产物与不设字号一致 |

**实测 19 套 `styles.p.font_size`**：

| 值 | 套数 | 哪几套 |
|---|---|---|
| **16px** | 14 套 | adidas / economist / forbes / guardian / ikea / m2w-light / m2w-rational / m2w-swiss / m2w-tech / mori / muji / natgeo / note / starbucks / time / vogue（含 16px 全部）|
| **17px** | 3 套 | **brutal / deepread / ukiyoe** |

（精确计数：14 套 16px + 3 套 17px = 17 套；另 2 套见下条 `layout_*` 硬编码）

**结论**：用 `ratio = 字号 / 15`：
- 16px 套在「字号=15」时 → `ratio=1.0` → 但**主题原值是 16px**，产物会从 16px 变成 15px → **默认态就缩水了**
- 17px 套同理，缩得更多

**这直接违反方案自己定的「`ratio=1` 时产物与不设字号一致」** —— 基准取错，这条保证就不成立。

**修正**：基准必须**按套取值**：

```python
base = float(theme["styles"]["p"]["font_size"].rstrip("px"))   # 该套自己的原值
ratio = target / base                                          # target = 用户选的 14–18
```

这样「字号 = 该套原值」时 `ratio == 1.0`，产物零变化，才符合承诺。

### C-2 【最严重】19 套 `layout_*` 全部重写 `p` 的 `font-size`，**JSON 不是字号真源**

**代码事实**（`core/magazine_layouts.py`）：

```
grep -n 'style_all(out, "p"' → 19 处命中（361/404/458/514/562/621/675/718/755/802/
                                  855/902/943/993/1049/1118/1167/1222/1275）
```

**每一个 `layout_*` 函数都重新给全文 `p` 写了一遍 `font-size`**。举两个实例：

- `layout_ukiyoe:755` → `{"font-size": "17px", "line-height": "1.8", ...}`
- `layout_ikea:855` → `{"font-size": "16px", ...}`

**而分发的顺序是**（`format_engine.py:2388–2404`）：

```
inject_inline_styles()（此时用主题 JSON 的 styles.p 注入 16px）
   ↓
elif _layout in LAYOUT_REGISTRY: html = LAYOUT_REGISTRY[_layout](html, theme)   ← 版式在**之后**执行
```

**结论**：kit 的最终字号**由 `layout_*` 函数决定，不是 JSON 决定**。
计划 P3 说「按 JSON 基准缩放」→ 在 19 套上**全部不可靠**，因为你缩的是被覆盖掉的旧值。

**而且这解释了 §2.6 的「2 套例外」**（`mg-deepread` / `mg-guardian` 列表 span 17px vs 正文 12/14px）——
那 12/14px 就是 `layout_*` 里**别的元素**的字号，不是 JSON 的。

**修正**：P3 的基准与作用点都必须改成「**版式执行后**」：

1. `apply_font_scale` 必须在 `LAYOUT_REGISTRY[_layout](...)` **之后**调用（计划已写「layout 分发之后」，这点对）；
2. 但**基准不是读 JSON**，而是**从产物 HTML 里实测当前 `p` 的 `font-size`**，再按比例缩放；
3. 或者更稳：让 `layout_*` 接受一个 `scale` 参数，由分发层传入 —— 但这要改 19 个函数签名，
   **风险高于收益**，建议用「产物实测基准」方案。

### C-3 【严重】装饰 `span` 会被无脑缩放，52px 大引号会撑破版式

**代码事实**（`core/magazine_layouts.py`，装饰性 `span` 自带 `font-size`）：

| 行号 | 字号 | 用途 |
|---|---|---|
| 586 | **52px** | Vogue 的大引号装饰 |
| 639 | **30px** | 某套的大序号 |
| 527 | **22px** | 某套的强调符号 |

**计划 §2.6 的要求是**：

> `apply_font_scale`：对 `p` / `blockquote` / `h1`–`h6` / **`span[style*=font-size]`** 的 `font-size` 乘 `ratio`

**结论**：这条会把这些**装饰**一起缩放：
- 用户选 18px（`ratio = 18/16 = 1.125`）→ **52px 大引号变成 58.5px**
- 选 14px → 45.5px

Vogue 那个 52px 大引号是**版式的视觉锚点**，跟着正文缩放会破坏它精心设计的比例，甚至溢出容器。

**修正**：`span` 缩放必须**白名单化**，不能按「有 font-size 就缩」：

```python
# ✅ 只缩「正文类 span」：列表文字、正文内联强调
#    判据：该 span 在 <section> 内 且 其 font-size ≈ 该段落的正文基准（±1px）
# ❌ 排除：display:inline-block 的装饰、font-size ≥ 22px 的、位于 h1/h2 内的
```

**更简单的做法**：**只缩 `p` / `blockquote` / `h1–h6` / `li`，不碰 `span`**，
然后在夹具里断言「列表文字与 `p` 的字号差」——而这正是 §2.6 用 `partial` 模式会 18/19 掉队的场景。
所以**必须缩 span，但必须白名单**。这是计划里最需要补的实现细节。

### C-4 blockquote 的基准同样不可信（`layout_guardian` 引用 19px 是硬编码）

**实测**：19 套 `styles.blockquote.font_size` 全是 **15px / 16px**。
但 `core/magazine_layouts.py:436` 里卫报的引用块是 **`"font-size": "19px"`**（放大引用），**硬编码在 layout 里**。

**修正**：与 C-2 同源——所有基准都从**产物实测**，不从 JSON 读。

---

## 四、D 类：夹具设计的根本缺陷（正对「放上去就是摆设」）

### D-1 【最关键】A1 断言对 18 套是**恒真**的，测不出任何东西

**计划 §5.1 的 A1**：

> 每套正文 `text-align` == 该套规范值（§2.1 表）

**实测 19 套 `styles.p.text_align`**：

```
mg-adidas: left    mg-brutal: left    mg-deepread: left   mg-economist: left
mg-forbes: left    mg-guardian: left  mg-ikea: left       mg-m2w-light: left
mg-m2w-rational: left   mg-m2w-swiss: left   mg-m2w-tech: left   mg-mori: left
mg-muji: left      mg-natgeo: left    mg-note: left       mg-starbucks: left
mg-time: left      mg-ukiyoe: left    mg-vogue: left
                              ↑ 19 套全部 left，**包括浮世绘**
```

而**引擎默认就是 `left`**（`inject_inline_styles` 不写 text-align 时，浏览器默认 `text-align:start` → 视觉等价 left）。

**结论**：
- 对 18 套，「断言 == left」**在任何实现下都成立**（即使代码删光也成立）→ **零信息量的恒真断言**
- 对 `mg-ukiyoe`，「断言 == justify」有意义（因为它靠硬编码 justify）→ **只有 1 套有信息量**

**用户原话「不然放上去就是摆设」——这里摆设的不是功能，是这 18 条断言。**

**修正**：A1 拆成两条，把「恒真」变成「有分辨力」：

| 新 id | 断言 | 为什么有信息量 |
|---|---|---|
| **A1a** | `mg-ukiyoe` 产物**必须**含 `text-align:justify` | 删掉硬编码就红（已验证） |
| **A1b** | 其余 18 套产物**不得**含 `text-align:justify` | 有人写进 justify 就红 |
| **A1c** | **能力断言**：对每套强制注入 justify 后，非末行右缘 ≤ 1.5px | 证明「这 18 套的 DOM 结构支持 justify」——**这才是用户问的「能不能完整实现自动对齐」** |

**A1c 是本次审查最有价值的补充**：它测的是**能力**（19 套的 DOM 是否都能两端对齐），
而不是**配置值**（当前是不是 left）。用户问的是前者，方案测的是后者。

### D-2 【严重】A7「产物不含 `text-align:center`」会误伤标题居中

**代码事实**（`core/magazine_layouts.py`）已有的合法 `text-align:center`：

| 行号 | 用途 |
|---|---|
| 213 | `num_badge` 数字徽标居中 |
| 367 | `layout_time` 的 h1 居中 |
| 814 | 某套的 h2 徽标居中 |

**结论**：若 A7 按「产物不含 `text-align:center`」写，这 19 套里至少 3 套会**误报红**。
而 `center` 用在**标题/徽标**上是完全正确的设计。

**修正**：A7 的判据必须限定在**正文元素**：

```
仅检查 <p ...> 开标签内的 style 是否含 text-justify / hanging-punctuation /
text-autospace / line-break —— 不检查 h1–h6 / 徽标 span
```

### D-3 `_guard` 会在「文字变少」时静默放弃改造，夹具没覆盖

**代码事实**（`core/magazine_layouts.py:262`）：

```python
def _guard(original: str, out: str) -> str:
    """出口闸门：文字变少就放弃改造，原样返回。"""
    return out if plain_len(out) >= plain_len(original) else original
```

**风险**：如果将来给 19 套加对齐/缩放时，某个正则**碰巧吃掉了文字**，
`_guard` 会**静默返回原文** → 用户看到「设置了没效果」，日志里一个字都没有。

**修正**：加一条断言 **A10「改造必须真的发生」**：

```
对每套：注入一个必然生效的探针（如 text-align:justify）后，
断言「产物 ≠ 未注入的产物」。若相等 → 说明 _guard 静默吞了改造 → 红。
```

这条比 A1–A9 都重要，因为它守的是**「所有其他断言的前提」**：
如果改造被 `_guard` 吞了，A2–A9 全部会在「没改过的产物」上跑，全绿，**而实际什么都没发生**。

---

## 五、E 类：整体页面设计的结构性冲突

### E-1 顶栏加 ⚙ 违反既有约束（详见 A-4）

`AGENTS.md` §6：顶栏 390px 已挤满，实测加第 5 个控件会重叠 21px。
现在顶栏已有 3 个模块导航 + 引擎徽标 + 导出 + AI + ⋯ = **7 个控件**。

### E-2 19 套暖白缩略图会和抽屉背景融在一起，C 案只解决了标题条

**代码事实**：

| 元素 | 色值 |
|---|---|
| `.d-prev` 背景（缩略图底下） | `--bg-hover` = **#F0EDE8** |
| `mg-muji` 底色 | #F8F6F1 |
| `mg-mori` 底色 | #FAF7F0 |
| `mg-ukiyoe` 底色 | #F3F0E8 |

**结论**：19 套里有 8 套本身是暖白纸底，**缩略图与 `.d-prev` 背景几乎同色**（差 3–8 个色阶）。
C 案把**标题条**做成深墨解决「字看不清」，但**没解决「图看不清边界」**——
缩略图会像「浮」在卡片里，看不出文章的边界在哪。

**修正**：19 套缩略图给一个**极浅的内描边**（`.d-card-kit .d-prev{ box-shadow: inset 0 0 0 1px var(--border) }`），
或用比 `--bg-hover` 更深一档的底。**必须在 4:3 比例 + 暖白缩略图上实测**，不能只看 164 套的效果。

### E-3 线上顶栏有**三个模块导航**，方案只还原了两个菜单

**代码事实**（`pwa/index.html:35–41`）：`#btn-editor` / `#btn-cover` / `#btn-longform` 三个按钮是**活功能**。

而方案 §3.5 只写了「导出菜单 4 项 + ⋯ 菜单 8 项」，
且 §零 边界 ③ 说「小红书两个模块搁置」。

**冲突**：线上入口是活的，用户点得进去；方案说搁置、原型不画。
**这不是「不做功能」，而是「原型和线上不一致」** —— 评审时按原型过，上线后发现多了两个按钮。

**修正**：原型必须**保留这三个导航按钮**（哪怕是死链接 + toast），并在方案里写明
「小红书两模块功能搁置，但入口保留、点击说明『开发中』」——否则就是 §3.6「死按钮一律给最小反馈」的反例。

### E-4 折叠 248px 与「版本可见行数 2.8→3.3」的计算前提没写

方案摘要里「折叠后 450px → 248px，可见行数 2.8 → 3.3」——
但线上抽屉是 **500px**，不是 450px。**基数是错的，收益数字也就不可复现。**

**修正**：P4 里给出**以线上 500px 为基数**的重算，或删掉这个收益估计（不写没验证过的数字）。

### E-5 【严重】19 套整篇设计在抽屉里排在**第 165–183 位**，且没有独立分区

**代码事实**（实测 `pwa/dist/themes/index.json`，共 183 项）：

```
第 165 位  mg-adidas        featured=False  family=''
第 166 位  mg-brutal        featured=False  family=''
...
第 183 位  mg-vogue         featured=False  family=''
```

19 套的 `featured` **全是 false**、`family` **全是空**。而 `app.js:853 renderAllFolded()`
的分段逻辑是「编辑精选（12 套）→ 按族折叠（7 张代表卡）→ `rest`=其他风格（平铺）」——
`family` 为空的全部落进 `rest`，`rest` 的排序只按「有没有收藏」。

**后果**：用户要打开抽屉、滚过 12 张精选 + 7 张族卡 + 剩余配色主题，**滚到最底部**才能见到
19 套整篇设计，且被归在「其他风格 · 每个都是一套独立版式」这种**误导性标题**下
（整篇设计恰恰不是"一套独立版式"，而是成套的稿子）。

而原型 v7（`docs/prototypes/wechat-v7.html:965–975, 1041–1047`）**有独立 tab**：

```html
<button data-mode="kit"><b>整篇设计</b><span>19 套 · 成套的稿子</span></button>
...
<div class="d-grid" id="grid-kit"></div>
```

**冲突性质**：方案 P4 写了「抽屉改两 tab」，但 **P5「资源与构建」没写要把 19 套的
`featured` / `family` / 排序补进 `theme-curation.json`**。只改 DOM 结构、不改数据，
两 tab 会变成「一个 tab 有 164 套、另一个 tab 空/错位」或者「19 套仍埋在 palette tab 底部」。

**修正**（必须写进 P5）：
1. `pwa/theme-curation.json` 里给 19 套显式分组（不能靠 `family` 为空来兜底）；
2. `buildThemeIndex` 输出 `kind:'kit'` 时，`renderAllFolded` 必须**先排除** kit，
   否则两 tab 会重复出现 19 套；
3. 抽屉两 tab 各自计数：`配色主题 164 套` / `整篇设计 19 套` —— 数字必须从
   `index.json` 实测而来，不能写死（现在文档里写死 164/19，加一套就错）。

### E-6 【严重】kit 缩略图是 4:3，但 `.d-prev` 写死 `height:104px` —— 两列时**裁掉近四成**

**代码事实**：

| 项 | 值 | 出处 |
|---|---|---|
| kit 缩略图实际尺寸 | **480×360（4:3）** | 实测 `public/kit-thumbs/*.jpg` 19 张全部一致 |
| 配色缩略图尺寸 | 480×240（2:1） | 实测 `public/theme-thumbs/*.jpg` |
| `.d-prev` | `height: 104px`（写死） | `pwa/src/style.css:398` |
| `.d-thumb` | `object-fit: cover; object-position: top center` | `pwa/src/style.css:399` |
| 抽屉网格 | `repeat(auto-fill, minmax(142px, 1fr))` | `pwa/src/style.css:373` |

按格子宽度算 4:3 需要的高度：

```
抽屉 500px（browsing 态）→ 可用 468 → 3 列：每列 149.3px，4:3 需 110.5px（实际 104，裁 6%）
                                      2 列：每列 229.0px，4:3 需 170.2px（实际 104，裁 39%）
抽屉 560px → 2 列：每列 259.0px，4:3 需 192.8px（实际 104，裁 46%）
```

**后果**：整篇设计的缩略图是**整篇文章的版式预览**（标题+正文+列表+引用全在里面），
`object-position: top center` + 裁掉 39–46% 高度 = **只剩上半截标题区**，
用户看到的是「一堆长得差不多的标题」，分不出 19 套的差异 —— 缩略图失去意义。

方案 P4 确实写了「`.d-prev` 改 `aspect-ratio:2/1`，kit 用 `4/3`」，但**没算这条**：
`aspect-ratio` 只在宽高都自由时生效，而 `.d-card{min-height:140px}` 是 flex 容器，
`.d-prev` 作为 flex 子项会被 `min-height` 反向挤压 → **`aspect-ratio` 失真**（审查 B-3 已提，
但没和 E-6 的 4:3 数据合起来算过）。

**修正**：`.d-card-kit` 单独一套尺寸预算（不与 palette 卡共用 `min-height:140px`），
并在**两列/三列两种宽度**下各实测一次 `.d-prev` 实际高度 ≥ 宽×3/4。

### E-7 【严重】kit 说明条把**英文内部代号**直接显示给用户

**代码事实**（`pwa/src/app.js:596`）：

```js
const layLabel = (LAYOUT_OPTIONS.find(([id]) => id === t.layout) || ['', t.layout])[1];
```

`themeMeta()` 对 kit 返回的 `layout` 是 `t.lockedLayout`（`app.js:490–494`），
而 19 套的 `lockedLayout` 实测为：

```
adidas / brutal / deepread / economist / forbes / guardian / ikea / light
mori / muji / natgeo / note / rational / starbucks / swiss / tech / time / ukiyoe / vogue
```

`LAYOUT_OPTIONS` 只有 8 项（`'' / rhythm / cardflow / outline / magazine / card / hero / timeline`）
—— **19 套的 `lockedLayout` 一个都不在里面**。

**后果**：说明条渲染出来的中文文案是：

> 正在使用整篇设计「时代周刊」，版式（**time**）与配色已固定，不能再单独改。

**面向普通用户的中文界面里直接漏出英文内部代号**。19 套**全部命中**（不是边角情况）。

**修正**：二选一 ——
① `lockedLayout` 前不改文案，改渲染：kit 时**不显示括注的版式名**，
   只写「版式与配色已固定」（整篇设计本身就是版式，说"版式（time）"零信息量）；
② 若一定要显示，必须在 `buildThemeIndex` 里补一个 `lockedLayoutLabel`（中文名），
   不能在 UI 层用 `LAYOUT_OPTIONS` 查——那 8 项是**可组合版式**，与 19 套**不是同一套枚举**。

**这条同时说明一个更深的问题**：`locked_layout`（19 套，杂志版式）与 `LAYOUT_OPTIONS`
（8 项，可组合版式）是**两个互不相干的枚举**，方案里从未明确写下这个边界，
所以 `:596` 这种"顺手查一下"的代码会持续产生错误。**方案必须显式声明二者互不映射。**

### E-8 【严重】kit 选中时，版式区 8 项**全灰且无一高亮**

**代码事实**（`pwa/src/app.js:691–703`）：

```js
const cur = layoutOf(meta);          // kit 时 = 'adidas'
...
'<button class="dl-chip${id === cur ? ' on' : ''}" ... disabled>'
```

8 个胶囊的 `id` 是 `''/rhythm/cardflow/...`，`cur` 是 `'adidas'` → **`id === cur` 永远为 false**
→ 8 个胶囊**全部既灰、又都不高亮**。

**后果**：用户看到一排全灰的按钮，无法得知「现在到底是哪个版式」。
配合 E-7（说明条漏英文 id），用户得到的完整信息是：
「版式（adidas）已固定」+ 8 个全灰无名胶囊 —— **两个来源都说不出人话**。

**修正**：kit 态下版式区应**整体替换**为一行状态文字（如「版式：整篇设计已锁定」），
或干脆**隐藏版式区**（它此时 100% 不可操作，留着只是噪声）。
原型 v7 的做法可参考：`#grid-kit .d-kit{ display:none }` —— 原型已经在做「kit 态剔除无信息量控件」，
方案没把这条原则带进版式区。

---

## 五之二、页面设计层的元问题：方案把「两个目录」当成了「一个目录」

上面 E-5～E-8 四条**不是四个孤立 bug**，是同一个结构性错误的四个症状：

| 事实 | 说明 |
|---|---|
| `lockedLayout` 19 个值 | **杂志版式**枚举（adidas/brutal/time…） |
| `LAYOUT_OPTIONS` 8 项 | **可组合版式**枚举（rhythm/cardflow/outline…） |
| 用户已确认 | 「19 套**独立于** 164 套配色主题，不是下级关系」 |
| 用户已确认 | 「版式区必须正好 8 项，19 套杂志版式不得混入」 |

**结论**：方案在文字上守住了这两条（8 项不动、19 套独立），但在**数据模型和 UI 承接**上
没有对应物 —— `index.json` 把 19 套和 164 套塞进同一个数组、同一套 `family/featured` 字段，
于是所有"统一处理"的代码（排序、分区、版式名查询、胶囊高亮）**全部按一个目录的假设写**，
每一条都会在这 19 套上出错。

**必须补进方案的一条设计约束**：

> `kind: 'kit'` 与 palette 主题在**任何**遍历 UI 的代码里都必须先分流，
> 不允许"先统一渲染、再特判"。判据：凡出现 `themes.map/filter/find` 且后续用到
> `layout` / `family` / `featured` 的地方，都要先问「这里 19 套走得通吗」。

---

## 六、F 类：验证边界（必须提前决策）

### F-1 如果微信剥离 `text-align:justify`，退回方案是什么？

方案 §7.1 已定「严格按规范：只有浮世绘 justify」。
但**如果真机验证发现微信剥离了 justify**，浮世绘就退化成左对齐 —— 这与它「两端对齐」的规范冲突。

**这是真风险**：浮世绘线上已经跑着 justify（硬编码），**但从没人验证过它在公众号后台是否保留**。

**必须提前定**（见 §七 问题 2）：剥离时的兜底，是「接受左对齐」还是「改用别的手段（如给每段补尾随空格）」。
后者是 hack，不建议，但要明确写「不采用」。

### F-2 字号放大到 18px + `word-break:break-word` 会让断词更频繁

**代码事实**（`format_engine.py:855`）：`_WRAP_CSS = "overflow-wrap:break-word;word-break:break-word"` 在 183 套全部生效，
实测会把 `segment` 切成 `seg/ment`。

**结论**：字号 15→18（+20%）后，每行可容纳的英文词更少，**断词概率显著上升**。
这是「字号功能」的一个可感知副作用，方案完全没提。

**修正**：验收时加一条「18px 下正文断词数不超过 15px 的 2 倍」，或在字号段旁注明「英文长词可能断开」。

---

## 七、三个决策 —— ✅ 已全部定案（用户 2026-11-03）

| # | 问题 | 决定 | 落地影响 |
|---|---|---|---|
| **1** | 设置入口放哪 | ✅ **并入现有「⋯」菜单，顶栏零新增控件** | `pwa/index.html:53` 附近 `#menu` 加一项；不新增 ⚙；`AGENTS.md` §6 的顶栏约束不被破坏；行展开/合并的额外改造全部取消 |
| **2** | 微信若剥离 justify 怎么办 | ✅ **接受退化为左对齐，并在文档里写明** | 浮世绘真机验收时若发现右缘不齐，**不改实现**，只在 `design-wechat-v6-final.md` §五风险表补一条说明；不采用「补尾随空格」之类的 hack |
| **3** | 已存 `LS_CUSTOM` 老数据 | ✅ **保留已存配色，首次切换主题时才清空** | `onColor` 改造时**不主动删除**已有数据；只在 `setActive()` 检测到「当前是 `CUSTOM_ID` 且发生了主题切换」时才 `removeItem` |
| **4** | kit 选中时版式区怎么显示（E-8） | ✅ **整体替换成一行状态文字「版式：整篇设计已锁定」** | 不再渲染 8 个全灰胶囊；**顺带消掉 E-7**（说明条不再查 `LAYOUT_OPTIONS`，故不会漏出 `adidas`/`time` 这类英文 id） |
| **5** | 19 套入口位置（E-5） | ✅ **按原型 v7 做独立 tab：配色主题 164 套 / 整篇设计 19 套** | P4 改抽屉结构（最大的一块）；**P5 必须给 `theme-curation.json` 补 19 套分组**，否则两 tab 会空或错位；`renderAllFolded` 必须先排除 `kind:'kit'` |
| **6** | 4:3 缩略图被裁 39–46%（E-6） | ✅ **kit 卡单独一套尺寸预算，严格按 4:3 出高度** | `.d-card-kit` 不与 palette 卡共用 `min-height:140px`；因已分 tab，两种卡不同高不产生混排问题 |

**这六条已同步写进 `plan-wechat-v6-implementation.md`**（P4 / P5 段落），不再作为未决项。

---

## 八、修正后的优先级建议

原计划 P0→P6 顺序**基本正确**（夹具先行），但内容需要替换：

| 阶段 | 原计划 | 审查后修正 |
|---|---|---|
| **P0** | 19 套 × 8 断言 | **改为 19 套 × 11 断言**：A1 拆成 A1a/A1b/**A1c（能力断言）**，A7 限定正文元素，**新增 A10（改造必须真的发生）** |
| **P1** | 对齐契约收拢到 JSON | 保持（实测 19 套 JSON 全 left，只需改 ukiyoe + 删硬编码，改动极小） |
| **P2** | 引擎对齐注入 | 保持 |
| **P3** | 字号缩放 | **重写**：基准从产物实测取（不是 JSON 的 15px）；`span` 白名单化（排除 52/30/22px 装饰） |
| **P4** | UI 结构改造 | **删掉**「去掉 slice(0,6)」；**修正** CSS 变量名映射；**补** `.d-family-card` 覆盖、`.d-card` min-height 重算、抽屉宽度四态联动、加 ⚙ 的取舍；配色微调从「接线」改为「改语义」 |
| **P5** | 资源与构建 | 保持，补 19 套缩略图内描边 |
| **P6** | 文档同步 | 保持，补真机剥离 justify 的兜底结论 |

---

## 九、一句话总结

> **方案的设计方向没错，但「现状描述」有 4 处是错的，照着做会做无用功；**
> **「字号缩放」和「夹具断言」两处有实质技术缺陷，照做会真的做错。**
>
> 最需要改的是夹具：**现有 152 条断言里，133 条对 18 套恒真**。
> 用户担心「放上去是摆设」——真正会变成摆设的，是这份测试本身。
> 补上 **A1c（能力断言）** 和 **A10（改造必须真的发生）**，夹具才第一次具备分辨力。

---

*本文是为 `design-wechat-v6-final.md` + `plan-wechat-v6-implementation.md` 做的对抗性审查。
所有结论均可按文中行号复核；凡未能实测的，已在文中显式标注。*
