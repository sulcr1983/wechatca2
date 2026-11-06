# 配方规格表（Prototype → 可机检断言）

> 本文是 `docs/prototypes/xhs/longform-v4/` 的**规格真源**。
> 与之配套：`skeletons.js`（实现）、`density_check.json`（实测证据）、`overview.png`（目视证据）。
>
> ⚠️ **口径**：本表的「密度」是 **CSS 版式骨架**的密度（Paged.js 单页），
> 与 `cards.js` 的 **角色填充率**（DOM 装箱分页）是两套不同的量，别混用。
> 见本表 §3「常量对照」。

---

## 1. 五套骨架 · 一行一条规格

每条都可被 `verify_density.py` / 未来的 `scripts/pwa_longform_v4_test.py` 直接断言。

| id | 配方 | 差异维度 | CSS 钩子（新增语法） | 目标密度 | 必备锚点 | 断言写法 |
|---|---|---|---|---|---|---|
| `m01-magazine` | M01 + M03 | 排印骨架 | `.drop::first-letter{float:left;font-size:2.6em}` + `.issue-row` 上下细线 | 密（实测 spanFill 0.849） | `issue-row` 刊头 / 首字下沉 / 上下细线 / 页脚条 | `getComputedStyle(p,'::first-letter').fontSize / base > 2`；`.issue-row` 的 `borderTopWidth !== '0px'`；`.end-rule` 存在；`spanFill ≥ .75` |
| `m08-ledger` | M08 Tall Ledger | 序号系统 + 行结构 | `.row{display:grid;grid-template-columns:132px 1fr;min-height:148px}` + `border-bottom` 发丝线 | 中（0.983） | 左侧序号栏 / 行分隔细线 / 页脚条 | `.row .n` 存在且恰 6 个；每行 `getBoundingClientRect().height ≥ 118`；`.row` 的 `borderBottomWidth !== '0px'`；`.foot` 存在 |
| `m06-evidence` | M06 Evidence Wall | 图文关系（网格） | `.wall{display:grid;grid-template-columns:1fr 1fr}` + 每格 `.cap`/`.q` | 密（0.911） | 2×2 网格 / 每格 caption / 大标题锚点 / 格间细线 / 页脚条 | `.wall` 的 `gridTemplateColumns` 拆成 2 段；`.cell` 数量 = 4 且每格都有 `.cap`；`.cell` 的 `borderRightWidth !== '0px'`；`h1` 存在 |
| `s09-kpi` | S09 KPI Tower | 数据可视化 | `.towers{display:grid;1fr 1fr}` + `.bar{height:var(--h)}` 塔高编码 | 中（0.917） | kicker / h-xl / 塔状条形 / 数值标签 / 页脚条 | `.tower .bar` 数 = 6；每根 `height > 0` 且高度互不完全相等（真实数据映射）；`.tower .val` 文本为数字；`.kicker` 存在 |
| `m14-pipeline` | M14 Vertical Pipeline | 顺序关系 | `.flow{border-left}` 竖引导线 + `.step .nb` 序号 + `.step + .step` 发丝线 | 中（0.893） | kicker / h-xl / 步骤序号 / 步骤间细线 / 竖引导线 / 页脚条 | `.step .nb` 数 = 6 且文本为 `01…06` 递增；`.flow` 的 `borderLeftWidth !== '0px'`；`.step + .step` 的 `borderTopWidth !== '0px'` |

**共有断言（5 套全过才算绿）**：
`single_page`（配方里这些都是单页骨架）· `spanFill ≥ 0.75` · `no_clipping`（末块 bottom ≤ 1344）·
`maxMidGap ≤ 216px` · `leading+trailing ≤ 216px` · `no_flex_push`（禁用 `flex:1` 把内容推到垂直中心，
配方明确禁止）· `anchors_all_present` · `png 精确 1080×1440`。

实测结果（`output/longform-v4/density_check.json`）：**5/5 PASS**，
`spanFill = 0.849 / 0.983 / 0.911 / 0.917 / 0.893`，`maxMidGap = 27–152px`，首尾留白 `21–188px`。

---

## 2. 判据口径（踩过坑，别再改回去）

### 2.1 「内容覆盖 ≥75%」= 整体跨度，不是像素覆盖率

首版机检把 `references/layout-recipes.md` 的
「content must cover ≥75% of canvas height」实现成**像素覆盖率**
（`Σ(块高) / 可用高`，扣掉所有行间距），结果账本 / 流程 / KPI 全部假红
（coverage 只有 0.508–0.549）。

**为什么错**：配方同段另有独立条款
「Any pure-whitespace band >15% canvas height (>216px) needs a stated reason」——
说明它管的是**连续空白带**，不是行距。行距、边框、padding 是设计的一部分，
扣掉后任何有行距的排版都永远达不到 75%，那不是配方本意。

**正确口径**：
- 主判据 `spanFill = (末块 bottom − 首块 top) / 1248` ≥ 0.75
- 辅助判据 `maxMidGap ≤ 216px`（15% × 1440）、`leading+trailing ≤ 216px`
- `coverage` 只作留白节奏的说明信息，**不做硬门槛**

可用高 = `1440 − 2×96 = 1248px`。**不能按 1440 算**（否则 75% 规则宽松 15%）。
`cards.js` 的实测装箱容量是 `1124px`，那是另一套口径（见 §3）。

### 2.2 现代截图 PNG 带 alpha

`modern-screenshot` 出的 PNG 背景是透明的。直接 `convert("RGB")` 会把透明区变黑
（总览图首版 5 页全黑）。必须先 `Image.alpha_composite` 到纸色底再缩放 / 判墨色。

### 2.3 `::first-letter` 在 DOM 生效、在 PNG 里失效

实测 `getComputedStyle(p,'::first-letter')` = `114.4px / base 44px = 2.6`、`float:left`、
`color:rgb(143,118,80)` 全部生效，但导出的 PNG 里首字仍是正常字号 ——
**modern-screenshot 不渲染 `::first-letter` 伪元素**。

**落地时必须改**：不要用伪元素做首字下沉，改用真实 DOM 包首字：
`<p class="drop"><span class="fl">两</span>天的沉默之后…</p>`，
CSS 挂在 `.fl` 上。这条是「看起来全绿、产物是错的」的典型，和本项目 §11 反复踩过的坑同源。

### 2.4 Paged.js 的两个陷阱（详见 `docs/xhs/design-xhs-longform-v4.md` §闸门）

- `pagedjs:rendered` 事件**从不触发**；就绪信号必须用「页数稳定 ~700–900ms」。
- running header 走伪元素 `::after`，`textContent` 读不到，必须查 computed content。
- CSS polyfill 会把 `position:fixed` 重写成 `static`；原型 UI 层必须挂在 `<html>` 下、`<body>` 之外。

---

## 3. 常量对照：哪些要按骨架拆，哪些不用拆

| 常量 | 出处 | 是否按骨架拆 | 理由 |
|---|---|---|---|
| `DENSE_MIN_FILL_CHARS = 140` | `cards.js:270` | ❌ **不拆** | 它只用于 `buildLong:935` 的「摘走末段做 closing 前，先验算上一页是否还够填」的**摘段守卫**，不是分页容量。需求文档 §4.2 已实测钉死这一点。 |
| `OPENING_MAX_CHARS = 120` / `QUOTE_MAX_CHARS = 120` | `cards.js:272/274` | ❌ 不拆 | 角色上限，与版式骨架无关；换骨架不改变「开篇最多几字」。 |
| `closingCap(n) = max(100, 150−10(n−1))` | `cards.js:276` | ❌ 不拆 | 结尾页守卫，同上。 |
| `STORY_MAX_PAGES = 6` | `cards.js:278` | ❌ 不拆 | 产品决策 D5（封面 + 5 内页），与骨架无关。 |
| `DENSE_SINGLE_SEG_FLOOR = 66.5` | `cards.js:283` | ❌ 不拆 | 几何必然（单段 120–139 字），审计已接受。 |
| **逐角色填充率下限 68% / 60% / 45%** | `pwa_longform_test.py:278-290`，按 `1124px` 归一化 | ⚠️ **不改数值，但要新增「骨架维度」的独立判据** | 这是**角色**填充率（DOM 装箱口径），与本表的**骨架** spanFill（Paged.js 口径）不是同一个量。直接把 68% 套到骨架上会重复 §2.1 的错误。 |
| **CSS 几何（`--fs` / `--pgap` / `line-height` / `.body` padding）** | `CARD_CSS_RAW` | ✅ **必须按骨架拆** | 这才决定「每页多少字」：`packDense → denseMaxHeight(tpl,pal)` 用 `tpl.cls` 建真实 DOM 实测 `.body` 高度，**装箱容量自动随 CSS 变**，不需要为每套手写一份 `DENSE_MIN_FILL_CHARS`。需求文档 §4.2 已实测证明。 |
| **密度档（密 / 中 / 疏）** | 本表新增 | ✅ 按骨架声明 | 用作**可机检的版式身份**：同一篇夹具下，不同骨架的 `spanFill` / 页数应不同；若全部相同，说明又退化成「只换皮」。 |

> 一句话：**角色常量一个都不用拆，拆的是 CSS 几何**。
> 这与 `docs/xhs/requirements-xhs-longform.md` §4.2 的结论一致
> （该节曾写错「必须把全局常量按版式拆开」，已自行修正）。

---

## 4. 落地映射：规格将来写在哪

| 走哪条路 | 规格落到哪 | 代价 |
|---|---|---|
| **A. 保留现管线（灰度期）** | `cards.js` 的 `LONG_TPLS` 新增条目 + `CARD_CSS_RAW` 按 `cls` 加几何/排印规则 + `cardInner` 加角色分支 | 无新依赖、无 license 风险、分页回归可控；但受单栏限制，做不了真 `columns` / `float` |
| **B. Paged.js（用户已选方向）** | 每套骨架 = 一份 `@page` + `@font-face` + 语义 HTML 模板（`docs/prototypes/xhs/longform-v4/skeletons.js` 已是这个形态）；`cards.js` 退化为「内容结构决策」层 | 可写真流式排版；但必须补齐 §5 的三条迁移约束 |
| **C. 两者并行期** | 旧 `buildLong` 为准，新管线只出预览；产物级逐句比对通过后才切换 | 多一份维护成本，但是唯一安全的灰度路径 |

**推荐 C → B**：先用 C 证明「同一篇文章，两条管线出的文字一字不差」，再逐步切到 B。
无论走哪条，本表 §1 的断言都可以直接搬进 `scripts/pwa_longform_v4_test.py`，
判断据不变，只是把测量对象从 `.pagedjs_page` 换成 `.card`。

### 4.1 逐条规格的双落点（关键：`cardInner` 管结构，CSS 模板管骨架）

同一个规格要拆成两半落，不能整块塞进一处 —— 否则要么把版式写死在 JS 里（不可组合），
要么把内容决策写进 CSS（做不到）。

| 规格要素 | 落 `cards.js` 的 `cardInner` / `buildLong` | 落 Paged.js CSS 模板 | 理由 |
|---|---|---|---|
| 夹具 → 内容块（`lead` / `body` / `items` / `quote`） | ✅ `parseBlocks` + `splitLongParas`，输出 `role` + `blocks` | ❌ | 内容结构决策属引擎，不属样式 |
| 角色判定（开篇 / 清单 / 金句 / 正文 / 结尾） | ✅ `buildLong` 的分页循环（含 `steps`） | ❌ | 角色是分页语义，CSS 无法决定 |
| `---` 强制分页 / 页数上限 6 / 截断合并 | ✅ `buildLong:822-975` | ❌ | 产品语义，Paged.js 不提供 |
| `closingCap` / 摘段守卫 / 逐句零丢失 | ✅ `cards.js:926-975` | ❌ | 欠填后处理，正是闸门要求「上移」的那层 |
| 首字下沉 DOM | ✅ `cardInner` 把首字包进 `<span class="fl">` | `.fl{float:left;font-size:2.6em}` | **§2.3 的坑**：`::first-letter` 在 PNG 里不渲染，必须由 JS 产出真实节点 |
| 骨架容器（`.issue-row` / `.wall` / `.towers` / `.flow` / `.ledger`） | ✅ `cardInner` 按 `tpl.cls` 输出对应 HTML 结构 | ✅ 同名 CSS 定义 grid / 线 / 序号 / 间距 | 结构与样式分离；骨架身份由两者共同构成 |
| `--fs` / `--pgap` / `line-height` / `.body` padding | ❌（不写死数值） | ✅ 每套 `cls` 一份 | 这是 §3 唯一要按骨架拆的量，决定装箱容量 |
| 页眉刊头 / 页码 / 签名 | ✅ `tpl.head()` / `tpl.foot()`（沿用现有契约） | 或交给 `@top-left` / `@bottom-right` margin box | 走 B 时优先保留现契约，避免双真源；margin box 断言要查伪元素（§2.4） |
| §1 的机检断言 | 测量对象 `.card`（角色填充率、1124px 口径） | 测量对象 `.pagedjs_page`（spanFill、1248px 口径） | 两套口径并存，**不互相套用**（§2.1 / §3） |

> 判断口诀：**「这段内容是什么」归 `cardInner`，「这段内容长什么样」归 CSS 模板**。
> 现有 12 套模板的问题恰恰是只有 `head()/foot()` + `cls`，没有骨架结构分支 ——
> 所以新增骨架时，两边都要动，只在 CSS 里加规则不会改变 HTML 结构。

---

## 5. 迁移到 Paged.js 必须补齐的三条（闸门结论）

1. **欠填页后处理**：Paged.js 只管「在哪断」，不管「断了之后够不够满」。
   实测 1000 字文章末页只剩 51 字、填充率 26.7%；本轮 5 骨架首版也有 4 种断成 2 页、
   末页最低 1.7%。现有 `buildLong` 的「先合并后截断 + `closingCap` 守卫」必须**上移**为
   Paged.js 之后的后处理。
2. **1.45s 不能实时重渲**：到首张 PNG 中位 1473ms（分页 1088 + 出图 371）。
   现行承诺是「粘贴后 0 点击即见分页」，必须做防抖 300ms + 按「文章首 200 字哈希 +
   模板 + 色板」缓存 + 首屏只渲可见页（复用 `plan-xhs-longform-next.md` B3-1 方案）。
3. **156KB 登记**：`paged.polyfill.js` gzip 159,865 B。放进 `public/vendor/`，
   登记 `SHELL_OPTIONAL`（按需加载，不进首屏预缓存）与 `assertDist()` 白名单断言。

---

*规格基线：`output/longform-v4/density_check.json`（5/5 PASS）· `overview.png`（目视证据）*
