# P4 · 抽屉两 tab 拆分方案（2026-11-03，v2 已按对抗性审查修订）

> **状态**：方案稿，**不写代码**。
> **v2 修订**：已按 `docs/wechat/review-p4-drawer-split.md`（14 条）逐条修正。
> **关联**：`docs/wechat/review-wechat-v6-adversarial.md` E-5～E-8；
> `docs/wechat/plan-wechat-v6-implementation.md` §四 P4。
> **基准**：`docs/prototypes/wechat/wechat-v7.html`（原型定稿）+ `pwa/src/app.js`（线上真源）。

---

## 零、先回答架构问题：「19 套单独做函数」对不对？

用户判断：**19 套整篇设计单独做函数，和第一个 tab 的内容不冲突。**

**方向对，但不能落在数据层，只能落在渲染层。**

### 为什么不能拆成两个数组

`themes`（`app.js:82`）是单一数组，`byId`（`:83`）是单一 Map。22 处 `themes` 引用里，
**只有 6 处是抽屉渲染**，其余 **16 处是「统一 id 空间」的消费方**：

| 消费方 | 行号 | 拆数组后必须加的分支 |
|---|---|---|
| `byId = new Map(...)` | 112 | `themeMeta` / `setActive` / `byId.get` 全线要判断来源 |
| `setActive()` 守卫 | 548 | `if (id !== CUSTOM_ID && !byId.has(id)) return;` |
| `orderedThemes()` | 506–526 | 收藏 / 最近 / 全量 三段都要跨两数组 |
| `renderCaps()` 底部色卡条 | 528–538 | 同上 |
| `loadThemeJson(id)` | 264 | `fetch('./themes/${id}.json')` |
| `applyBackup()` 恢复 | — | 恢复的 id 可能属于任一数组 |

把 `themes` 拆成 `palettes` + `kits`，等于把 **1 个问题**换成 **16 个判断点**。

### 正确切法：三层分开

| 层 | 做法 | 理由 |
|---|---|---|
| **数据** | `themes` 保持单数组；另加两个**只读派生** `PALETTES()` / `KITS()` | id 空间必须唯一，否则 16 处消费方全要改 |
| **渲染** | 新增 `renderKitPane()`，与 `renderAllFolded` / `renderFamilyFold` **并列、互不调用** | 用户说的「单独做函数」落在这里 |
| **状态** | 新增 `drawerMode: 'palette' \| 'kit'`，与 `drawerFam` **正交** | `drawerFam` 只在 palette 模式有意义，kit 无「族」概念 |

> ⚠️ **v1 的错误已修正**：v1 说「两 tab 共用同一个 `#drawer-grid`」。
> 这与原型的两 pane 结构冲突（`wechat-v7.html:974` `#pane-theme` / `:1046` `#pane-kit` 各自一个网格），
> 也让「决策 4 的版式状态文字」无处安放。**v2 改为两个容器，见 §2.1。**

---

## 一、拆分边界（函数级，现状 → 目标）

### 现状

```
openDrawer()            :624   → renderFilters() + renderDrawer()
renderDrawer()          :901   → renderLayouts()      :902
                                 renderBlockToggles() :903
                                 applyKitLock()       :904
                                 分支：q      → renderFlat  :910
                                       fav    → renderFlat  :914
                                       all    → renderAllFolded   :915
                                       族名   → renderFamilyFold  :916
renderAllFolded()       :854   → 精选12 + 族代表卡7 + 「其他风格」平铺  ← 19 套落这里（E-5）
drawerCard()            :768   → 共用；按 kind 切 kit-thumbs/theme-thumbs
familyRepCard()         :795   → 写死 theme-thumbs/（**不改**，只在 palette 出现）
renderCaps()            :528   → orderedThemes().slice(0,40)  ← 19 套会混进来（E-9）
renderFilters()         :744   → `全部 ${themes.length}`      ← 多算 19（E-10）
```

### 目标

```
openDrawer()  → renderModeTabs()   ← 新增：两 tab 胶囊 + 计数（现算）
                renderFilters()    ← palette 模式才渲染族 chip
                renderDrawer()

renderDrawer()
  ├─ drawerMode === 'kit'  → renderLayouts()        // 决策4：8胶囊 → 一行状态文字
  │                          renderBlockToggles()    // 段落样式保留（A-4）
  │                          applyKitLock()          // 说明条
  │                          renderKitPane(fav, q)   // 自带搜索、自带空态
  │                          return
  └─ drawerMode === 'palette' → （原三分支与 renderAllFolded 完全不变）
```

**关键约束**：`renderKitPane()` 内部**不引用** `drawerFam`、`drawerTone`、`LAYOUT_OPTIONS`、`FAMS`。
一旦引用，就说明两个 tab 又耦合了。评审时用这一条自查。

---

## 二、逐文件改动

### 2.1 `pwa/index.html`（抽屉骨架）

| 位置 | 改什么 |
|---|---|
| `.drawer-head` 之后 | 新增 `.mode-tabs`：两个按钮 `data-mode="palette"` / `data-mode="kit"`，**计数留空由 JS 填**（禁止写死 —— 曾写死 179 实际 183） |
| `#drawer-filters` | 保留，palette 模式才渲染 |
| `#kit-note` | 保留（说明条 + 退出按钮）。**文案去掉「版式（默认）」**（A-3） |
| `#drawer-layouts` | 保留容器，**palette 专用**；kit 模式下整体 `hidden`（不再往这里塞文字） |
| **`#kit-lock-note`（新增）** | **kit 网格正上方独立一行**：「版式：整篇设计已锁定」。只在 kit pane 内、只在 kit 模式显示（决策 4，2026-11-03 用户选定） |
| **`#drawer-grid`** | **palette 专用**，`renderAllFolded` / `renderFamilyFold` / `renderFlat` 照旧写它 —— **一行都不用改** |
| **`#kit-grid`（新增）** | **kit 专用**，只由 `renderKitPane` 写 |
| **`.drawer-body`（新增包裹）** | 见下方实现陷阱 |
| `#drawer-blocks` | **kit 下保留**（段落样式与版式无关，`applyKitLock` 也只锁 `#drawer-custom`） |
| `#drawer-custom` | kit 下加 `.locked`（既有样式 `style.css:489`） |

> **2026-11-03 用户拍板（三项）**：
> 1. 「版式已锁定」状态文字 → **kit 网格上方独立一行**（新增 `#kit-lock-note`），不并入 `#kit-note`
> 2. 段落样式（金句/数据/提示）→ **kit 下保留可用**，不锁死
> 3. 抽屉宽度 → **统一 520px**（原型定稿值），见 §2.3

#### ⚠️ 实现陷阱：两个网格不能同时 `flex:1` 滚动

现在 `#drawer-grid` 是 `flex:1; min-height:0; overflow-y:auto`（`style.css:371`）。
直接并列加第二个网格，**两个都会是 `flex:1`，各占一半高**。

正确结构：

```html
<div class="drawer-body">        <!-- flex:1; min-height:0; overflow-y:auto -->
  <div class="drawer-grid" id="drawer-grid"></div>
  <div class="drawer-grid" id="kit-grid" hidden></div>
</div>
```

两个网格自己**不再滚动**，滚动交给 `.drawer-body`。切 tab 时切 `hidden`。

#### ⚠️ 事件委托必须上提一层

现在委托挂在 `$('drawer-grid')`（`app.js:1673`），五类点击都在这一处。
新增 `#kit-grid` 后，若委托不动，kit 卡点了没反应。

**修法**：委托改挂到 `.drawer-body`（或 `.drawer`），一次覆盖两个网格。
**不要复制第二份委托** —— 两份必然漂移。

### 2.2 `pwa/src/app.js`

| 函数 | 行号 | 改动 |
|---|---|---|
| 新增 `PALETTES()` / `KITS()` | ~85 | 只读派生（用函数而非常量：`themes` 在 `:111` 异步赋值） |
| 新增 `drawerMode` | ~621 | `let drawerMode = 'palette';` |
| 新增 `renderModeTabs()` | ~624 前 | 两胶囊 + **现算**计数；`aria-pressed` 跟随 `drawerMode` |
| **新增** `renderKitPane(fav, q)` | ~917 后 | 独立函数：`KITS()` 按 `q` 过滤 → 渲染进 `#kit-grid`；**两种空态分开**；**不带 `.d-kit-tag`** |
| `renderDrawer()` | :901 | kit 分支要跑 **4 件事**（见 §一目标），不是「一行 return」 |
| `renderLayouts()` | :691 | kit 态**整体 hidden**，不渲染 8 胶囊、也不渲染状态文字（状态文字改由 `#kit-lock-note` 承担，见 §2.1） |
| `applyKitLock()` | :580 | ① 版式胶囊段删除（`renderLayouts` 已接管）；② 文案去掉「版式（默认）」（A-3）；③④ 保留 |
| `renderAllFolded()` | :854 | `themes` → `PALETTES()`（19 套不再落进「其他风格」，E-5） |
| `renderFilters()` | :744 | ① kit 模式不渲染；② `themes.length` → `PALETTES().length`（E-10） |
| `renderCaps()` | :528 | 只取 `PALETTES()`；`activeId` 是 kit 时置顶显示（E-9） |
| `familyRepCard()` | :795 | **不改**（只在 palette 出现，缩略图本就在 `theme-thumbs/`） |
| `toggleFav()` | :919 | **不改**（kit 可收藏，只是不进色卡条） |
| 事件委托 | :1673 | **从 `#drawer-grid` 上提到 `.drawer-body`** |
| 新增 mode tab 委托 | ~1664 前 | `data-mode` → 设 `drawerMode` → `renderFilters()` + `renderDrawer()` |

#### `renderKitPane` 要点（A-2 / B-1 / B-2）

```js
function renderKitPane(fav, q) {
  const list = KITS().filter((t) => !q ||
    (t.name + ' ' + t.id + ' ' + (t.desc || '')).toLowerCase().includes(q));
  const box = $('kit-grid');
  if (!list.length) {
    // 两种空态必须分开（原型 wechat-v7.html:1393 记过真实事故：
    // 搜「夜航」明明 19 张缩略图都在，却提示「未生成」）
    box.innerHTML = KITS().length === 0
      ? '<div ...>缩略图未生成，先跑 scripts/gen_kit_thumbs.py</div>'
      : '<div ...>没匹配的整篇设计 · <b data-empty-act="clear">清除搜索</b></div>';
    return;
  }
  box.innerHTML = list.map((t) => drawerCard(t, fav)).join('');
  // ⚠️ 不追加 .d-kit-tag：整个 tab 都是整篇设计，角标零信息量
}
```

### 2.3 `pwa/src/style.css`

| 选择器 | 改动 |
|---|---|
| `.mode-tabs` | 新增，复用 `.fchip` 视觉语言 |
| `.drawer-body`（新增） | `flex:1; min-height:0; overflow-y:auto` —— 承接原 `.drawer-grid` 的滚动职责 |
| `.drawer-grid` | **删掉** `flex:1; min-height:0; overflow-y:auto`（改由 `.drawer-body` 承担），其余（`padding` / `grid-template-columns` / `gap`）保留 |
| **`.d-card-kit .d-prev`** | `aspect-ratio:4/3; height:auto` —— **只需这两条**（A-5） |
| `#kit-grid .d-kit-tag` | `display:none`（B-2，原型 `:713`） |
| **`.d-card { min-height:140px }`** | **不动**（A-5：4:3 下内容高已 144px，覆盖反而制造歧义） |
| `body.browsing .stage` | `padding-right:500px` → `var(--drawer-w)`（审查 B-4） |
| `body.browsing .drawer` | `width:500px` → `var(--drawer-w)`（现在两处硬编码必须一起改，否则让位宽度与抽屉宽度不相等） |
| `.drawer { width }` | `min(560px,94vw)` → `var(--drawer-w)` |
| 新增 `--drawer-w` | **`520px`（2026-11-03 用户拍板，原型定稿值）**，窄屏走 `min(520px,94vw)`。**无「折叠态」** —— v1 写的 248px 不存在（C-1） |

> **v1 的 C-1 错误已删**：`grep "248px\|collapsed" pwa/src/style.css` 零命中；
> 原型 `wechat-v7.html:61` 也只有一个 `--drawer-w: 520px`。线上抽屉**没有折叠态**。

### 2.4 `pwa/theme-curation.json`

新增 `kits` 段（决策 5 / E-5）：

```json
{ "featured": [...], "order": [...], "kits": ["mg-time", "mg-guardian", "..."] }
```

`build.mjs` 读它给 19 套排序。不写这段，`renderKitPane` 只能按 id 兜底排序。

### 2.5 `pwa/scripts/build.mjs`

| 位置 | 改动 |
|---|---|
| `loadCuration()` :279 | 增加读 `kits`（已 `|| []` 兜底，先改 json 也不会炸 —— C-3） |
| `buildThemeIndex` :324 | kit 项按 `kits` 数组顺序，不在表内按 id 兜底 |

> **不新建 `src/kit-pane.js`**：`sw.js` 的 `SHELL_CRITICAL`（`:55`）与 `build.mjs` 的
> `need` 清单（`:836`）都是手工白名单，新增模块要两处登记（漏了就是「更新后该文件仍是旧的」，
> 2026-10-29 踩过 `src/cover/textmode.js`）。本方案只加约 50 行，留在 `app.js` 内。

### 2.6 `scripts/pwa_theme_drawer_test.py`（必改，B-4）

**先纠正一个既有事实**：`:104` `all_ids = [t["id"] for t in index]` 取的是 **183 个**，
而断言文案 `:281` 写「全部 164 套」。**这个数字今天就是假的**，改两 tab 时必须一并修正。

| 改动 | 内容 |
|---|---|
| `all_ids` 拆成 `pal_ids` / `kit_ids` | 按 `kind` 分 |
| 「逐个应用」循环 | palette tab 遍历 `pal_ids`；切 kit tab 遍历 `kit_ids` |
| 断言文案 | 改成实际数量，不再写死 164 |
| 新增 10 项 | 见 §四 |

---

## 三、编排顺序（5 步，每步可独立验证、可独立回滚）

### 步骤 1｜数据与策展先行（无 UI 变化）

- `theme-curation.json` 加 `kits`；`build.mjs` 读它排序
- **验证**：`node pwa/scripts/build.mjs` 后，`dist/themes/index.json` 里 19 套顺序 == `kits` 顺序；build 自带断言全过
- **回滚**：单提交 revert，UI 零变化

### 步骤 2｜修 E-6 / E-7 / E-10（不动 tab 结构，纯修 bug）

- `.d-card-kit .d-prev { aspect-ratio:4/3; height:auto }`，**不动 min-height**
- `applyKitLock()` ②：说明条文案去掉「版式（默认）」
- `renderFilters()`：「全部」改用 `PALETTES().length`
- **验证**：59 项抽屉测试仍全过（此步不动结构）；实测 `.d-card-kit .d-prev` 高/宽 ≥ 0.73
- **回滚**：单提交

### 步骤 3｜加两 tab 骨架（最大一步，单独 PR）

- `index.html`：`.mode-tabs` + `.drawer-body` 包裹 + `#kit-grid`
- `app.js`：`drawerMode` / `renderModeTabs()` / `renderKitPane()`；`renderDrawer()` kit 分支 4 件事；
  **事件委托上提到 `.drawer-body`**
- `style.css`：`.mode-tabs` / `.drawer-body` / `.drawer-grid` 去掉 flex 滚动 / `#kit-grid .d-kit-tag{display:none}`
- **验证**：抽屉测试（含新增 10 项）；手动切两 tab 各点 3 套
- **回滚**：revert 即回旧结构

### 步骤 4｜色卡条缺陷 E-9

- `renderCaps()` 只取 `PALETTES()`；`activeId` 是 kit 时置顶显示 + 标注
- **验证**：收藏一套 kit → 色卡条 40 颗内无 kit 混入；当前 kit 以「正在使用」出现在第一位
- **回滚**：单提交

### 步骤 5｜抽屉宽度归一 500/560 → 520（审查 B-4）

- `--drawer-w: 520px` 单值；`.drawer` / `body.browsing .drawer` / `body.browsing .stage{padding-right}`
  **三处一起**改用变量（现在 500 与 560 两套并存，让位宽度与实际抽屉宽不相等）
- **验证**：桌面 1440px 开抽屉 → 主区右推 == 抽屉实测宽度（520px）；1440/1024/768 三档无横向滚动
- **回滚**：单提交

---

## 四、验证口径与新增断言

```bash
.venv/Scripts/python.exe scripts/run_gates.py                       # 每步
.venv/Scripts/python.exe scripts/pwa_theme_drawer_test.py --local   # 步骤 2/3 必跑
.venv/Scripts/python.exe scripts/kit_alignment_fixture.py --browser # 19 套对齐
.venv/Scripts/python.exe scripts/kit_alignment_canred.py --browser  # 反向验证
.venv/Scripts/python.exe scripts/doc_sync_check.py                  # 文档同步
```

**新增断言（10 条，已按审查修订）**：

1. 切 kit tab → `#kit-grid .d-card` 数 == `KITS().length`（现算）
2. 切 palette tab → `#kit-grid` 隐藏、`#drawer-grid` 非空
3. kit 模式下 `#drawer-filters .fchip` 数 == 0
4. kit 模式下 `#drawer-custom` 有 `.locked`，**`#drawer-blocks` 没有**（A-4 回归）
5. kit 卡 `.d-prev` 高/宽 ≥ 0.73（4:3）
6. `#kit-note-text` **不含「默认」二字**（A-3 回归）
7. kit 模式下 `#drawer-layouts` 整体隐藏（无 `.dl-chip`）；**`#kit-lock-note` 可见且文案含「已锁定」**（决策 4：独立一行，不并入说明条）
8. kit tab 搜有命中 → 有卡；搜无命中 → 文案含「没匹配」；`KITS` 为空 → 文案含「未生成」（B-1）
9. palette tab 的「全部」chip 数字 == `PALETTES().length`，**不等于** `THEMES.length`（B-3 / E-10）
10. kit 卡内不存在 `.d-kit-tag`（B-2）

---

## 五、本轮发现的三条新缺陷（原审查 E-5～E-8 未覆盖）

### E-9【中等】收藏的整篇设计会混进底部色卡条

`toggleFav()`（`:919`）不区分 kind → kit 可收藏；`orderedThemes()`（`:506`）把收藏排前面；
`renderCaps()`（`:528`）`slice(0,40)` **未按 kind 过滤**。

后果：色卡条语义是「换配色」（点了只换颜色），但点中 kit = **整套版式被替换**，且色卡条**不显示**它是整篇设计。

**修法**：并入步骤 4。

### E-10【中等】「全部」chip 的数字多算 19

`renderFilters()`（`:747`）用 `themes.length` = 183，但 palette tab 只展示 164 套。
用户在 palette tab 看到「全部 183」，点进去只数出 164 套。

**修法**：并入步骤 2。

### E-11【低】测试名与实跑数量不符（既有问题）

`pwa_theme_drawer_test.py:281` 断言文案「全部 164 套」，实际 `all_ids` 是 183 个。
**不是本次改动引入**，但改两 tab 时必须一并修正，否则数字继续漂。

---

## 六、风险与不做

| 风险 | 说明 | 阻断方式 |
|---|---|---|
| 抽屉测试挂 19 项 | kit id 在 palette tab 搜不到 | 步骤 3 同时改测试；**不放宽断言凑绿** |
| 两个网格各占一半高 | 都写 `flex:1` | `.drawer-body` 承接滚动（§2.1 陷阱） |
| kit 卡点击无反应 | 委托仍挂 `#drawer-grid` | 委托上提 `.drawer-body` |
| `aspect-ratio` 被 `height` 压制 | `.d-prev` 写死 `height:104px` | 必须同时 `height:auto` |
| 窄屏两 tab 挤 | 胶囊横排 | `@media (max-width:900px)` 缩 padding |
| SW 缓存旧 `app.js` | `SHELL_CRITICAL` 含它，`?v=` 内容哈希 | 无需处理，构建自动变哈希 |

**明确不做**：

- 不新建 `src/kit-pane.js`（避免两处白名单登记）
- 不拆 `themes` 数组（见 §零）
- 不给 19 套补 `family`（族是「可组合版式」的概念）
- 不改 `familyRepCard()`（只在 palette 出现）
- 不改 `.d-card{min-height}`（A-5）
- 不虚构「抽屉折叠态」（C-1）
