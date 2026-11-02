# P4 · 抽屉两 tab 拆分方案（2026-11-03）

> **状态**：方案稿，**不写代码**。用户 2026-11-03 定：先出 P4 独立拆分方案。
> **关联**：`docs/review-wechat-v6-adversarial.md` E-5～E-8 与决策 4/5/6；
> `docs/plan-wechat-v6-implementation.md` §四 P4。
> **本文只回答一件事**：P4 这块最大改动怎么切成可独立验证、可独立回滚的若干步。

---

## 零、先回答架构问题：「19 套单独做函数」对不对？

用户判断：**19 套整篇设计单独做函数，和第一个 tab 的内容不冲突。**

**方向对，但不能落在数据层，只能落在渲染层。** 原因有代码证据：

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
这正是 `docs/review-wechat-v6-adversarial.md` §五之二指出的元问题：
`kind:'kit'` 应该**按 kind 分派**，不是**按数组分家**。

### 正确切法：三层分开

| 层 | 做法 | 理由 |
|---|---|---|
| **数据** | `themes` 保持单数组；另加两个**只读派生常量** `PALETTES` / `KITS` | id 空间必须唯一，否则 16 处消费方全要改 |
| **渲染** | 新增 `renderKitPane()`，与 `renderAllFolded` / `renderFamilyFold` **并列、互不调用** | 用户说的「单独做函数」落在这里 —— 改名/重写/删掉都不碰 palette 分支 |
| **状态** | 新增 `drawerMode: 'palette' \| 'kit'`，与 `drawerFam` **正交** | `drawerFam`（all/fav/族名）只在 palette 模式有意义，kit 模式无「族」概念 |

这才是真正的「不冲突」：**渲染函数隔离 + 状态变量正交**，而不是把数据劈成两半。

---

## 一、拆分边界（函数级，现状 → 目标）

### 现状

```
openDrawer()            :624   → renderFilters() + renderDrawer()
renderDrawer()          :901   → renderLayouts()      :902
                                 renderBlockToggles() :903
                                 applyKitLock()       :904
                                 分支：q      → renderFlat        :910
                                       fav    → renderFlat        :914
                                       all    → renderAllFolded   :915
                                       族名   → renderFamilyFold  :916
renderAllFolded()       :854   → 精选12 + 族代表卡7 + 「其他风格」平铺  ← 19 套落这里（E-5）
drawerCard()            :768   → 共用；按 kind 切 kit-thumbs/theme-thumbs
familyRepCard()         :795   → 写死 theme-thumbs/
renderCaps()            :528   → orderedThemes().slice(0,40)  ← 19 套会混进来（见 §五）
```

### 目标

```
openDrawer()  → renderModeTabs()   ← 新增：两 tab 胶囊 + 计数（现算）
                renderFilters()    ← palette 模式才渲染族 chip；kit 模式隐藏
                renderDrawer()

renderDrawer()
  ├─ drawerMode === 'kit'      → renderKitPane(fav)          ← 新增，独立文件级函数
  └─ drawerMode === 'palette'  → renderLayouts()
                                 renderBlockToggles()
                                 （原三分支保持不变：q / fav / all / 族）
  applyKitLock()  保留，但删掉「版式胶囊 disabled」那段（决策 4 已改为整块替换）
```

**关键约束**：`renderKitPane()` 内部**不引用** `drawerFam`、`drawerTone`、`LAYOUT_OPTIONS`、`FAMS`。
一旦引用，就说明两个 tab 又耦合了。评审时用这一条自查。

---

## 二、逐文件改动

### 2.1 `pwa/index.html`（抽屉骨架）

| 位置 | 改什么 |
|---|---|
| `:239` 之后（`.drawer-head` 与 `#drawer-filters` 之间） | 新增 `.mode-tabs`：两个按钮 `data-mode="palette"` / `data-mode="kit"`，**计数留空由 JS 填**（禁止写死 164/19 —— 定稿 §2.3 教训：曾写死 179 实际 183） |
| `:248` `#kit-note` | 保留（说明条 + 退出按钮）。文案改为不含括注版式名（决策 4 附带修 E-7） |
| `:255` `#drawer-layouts` | 保留容器；kit 模式由 JS 整体替换成一行状态文字（决策 4） |
| `:256` `#drawer-grid` | 保留单一网格容器 —— **两 tab 共用同一个 `#drawer-grid`**，不新建第二个，避免双份滚动状态与双份事件委托 |
| `:257` `#drawer-blocks` / `:269` `#drawer-custom` | 保留；`drawerMode==='kit'` 时隐藏（kit 的配色锁死，这两个区 100% 不可操作） |

> **为什么只用一个 `#drawer-grid`**：事件委托挂在 `$('drawer-grid')`（`:1673`），
> 五类点击（空态/d-fav/d-axis/d-tone/d-card）都在这一处。新建第二个网格 =
> 复制一遍委托 + 两处状态同步。切换 tab 时只需重渲染同一个容器。

### 2.2 `pwa/src/app.js`

| 函数 | 行号 | 改动 |
|---|---|---|
| 新增 `PALETTES` / `KITS` | ~85 | `const PALETTES = () => themes.filter(t => t.kind !== 'kit')` 形式的只读派生（用函数而非常量，因为 `themes` 在 `:111` 异步赋值） |
| 新增 `drawerMode` | ~621 | `let drawerMode = 'palette';`（默认 palette） |
| 新增 `renderModeTabs()` | ~624 前 | 两个胶囊 + 现算计数；`aria-pressed` 跟随 `drawerMode` |
| **新增** `renderKitPane(fav)` | ~917 后 | **独立函数**：只渲染 19 套，按 `theme-curation.json` 给定顺序；卡片用 `drawerCard` 但外层加 `d-card-kit`；**不碰 `drawerFam` / `LAYOUT_OPTIONS`** |
| `renderDrawer()` | :901 | 开头加 `if (drawerMode === 'kit') { renderKitPane(fav); return; }` —— **唯一插入点，一行** |
| `renderLayouts()` | :691 | kit 态不再渲染 8 个胶囊，改为一行状态文字「版式：整篇设计已锁定」（决策 4）；顺带删掉 `:596` 的 `LAYOUT_OPTIONS.find(...)` 查 `lockedLayout` 的写法（E-7） |
| `applyKitLock()` | :580 | 删掉 ① 版式胶囊段（`renderLayouts` 已接管）；保留 ②③④（说明条 / 色卡区 / 自定义配色） |
| `renderAllFolded()` | :854 | **加一行过滤**：`const list = PALETTES()` 替代 `themes`，确保 19 套不再落进「其他风格」 |
| `renderFilters()` | :744 | `drawerMode==='kit'` 时**不渲染**族 chip（返回空串或隐藏容器） |
| `renderCaps()` | :528 | **修一个新缺陷**（见 §五）：色卡条只取 palette；当前 `activeId` 是 kit 时，额外把该 kit 作为第一颗「正在使用」指示 |
| `orderedThemes()` | :506 | 保持不动（它服务色卡条与胶囊条，语义由 `renderCaps` 侧收窄） |
| `toggleFav()` | :919 | 保持不动（kit 可收藏，属正常需求；只是不再进色卡条） |
| 事件委托 | :1664 / :1673 | `#drawer-filters` 点击加 `if (drawerMode!=='palette') return`；`#drawer-grid` 委托保持（`.d-card` 分支已按 `dataset.id` 走 `setActive`，kit 天然可用） |
| 新增 mode tab 委托 | ~1664 前 | `data-mode` 点击 → 设 `drawerMode` → `renderFilters()` + `renderDrawer()` |

### 2.3 `pwa/src/style.css`

| 选择器 | 行号 | 改动 |
|---|---|---|
| `.mode-tabs` | 新增 ~352 | 两 tab 胶囊，复用 `.fchip` 的视觉语言 |
| `.drawer-grid` | :371 | 保持 `repeat(auto-fill, minmax(142px,1fr))` |
| **`.d-card-kit`** | :390 | **单独尺寸预算**（决策 6 / E-6）：`aspect-ratio:4/3`；`min-height` 独立计算，**不继承 `.d-card{min-height:140px}`** |
| `.d-prev` | :398 | 保持 `height:104px`（palette 2:1 用）；**.d-card-kit .d-prev 覆盖为 aspect-ratio** |
| `body.browsing .stage` | :322 | `padding-right:500px` → `var(--drawer-w)`，与 `.drawer` 联动（审查 B-4） |
| 新增 `--drawer-w` | :300 附近 | 三态：展开 `min(560px,94vw)` / browsing `500px` / 折叠 `248px` |

### 2.4 `pwa/theme-curation.json`

新增 `kits` 段（决策 5 / E-5 必做项）：

```json
{ "featured": [...], "order": [...],
  "kits": ["mg-time", "mg-guardian", "..."] }
```

`build.mjs` 读它给 19 套排序并写入 index。**不写这段，`renderKitPane` 只能按 id 兜底排序**，
与「编辑策展顺序」不一致。

### 2.5 `pwa/scripts/build.mjs`

| 位置 | 改动 |
|---|---|
| `loadCuration()` :279 | 增加读 `kits` 字段 |
| `buildThemeIndex` :324 | kit 项单独排序：按 `kits` 数组顺序，不在表内按 id 兜底 |
| `:836` need 清单 | 若新增 `src/kit-pane.js` 才需要加；**本方案不新建文件**，故不动 |

> **为什么不新建 `pwa/src/kit-pane.js`**：`sw.js` 的 `SHELL_CRITICAL`（`:55`）与
> `build.mjs` 的 `need` 清单（`:836`）都是**手工白名单**，新增模块要两处登记（漏了就是
> 「更新后该文件仍是旧的」，2026-10-29 踩过 `src/cover/textmode.js`）。
> 本方案只加约 40 行函数，留在 `app.js` 内收益大于拆文件。**若后续要独立，再走登记流程。**

### 2.6 `scripts/pwa_theme_drawer_test.py`（59 项，必改）

实测依赖的选择器：`.d-tone`×9 `.d-axis`×7 `.fchip`×6 `#drawer-filters`×6
`.dl-chip`×5 `.d-card`×5 `#drawer-search`×5 `.d-family-card`×2 `#drawer-custom`×2 `#drawer-blocks`×2

改动：

| 受影响项 | 原因 | 改法 |
|---|---|---|
| `.dl-chip` 5 处 | 改两 tab 后默认 palette 模式仍在，但需确认抽屉打开时默认落 palette | 打开抽屉后先断言 `drawerMode==='palette'` |
| `#drawer-blocks` / `#drawer-custom` | kit 模式隐藏 | 这些断言都发生在 palette 模式，加前置断言即可 |
| **新增 8–10 项** | 两 tab 切换 / kit 模式无族 chip / kit 卡 4:3 比例 / 说明条无英文 id / 版式区状态文字 / 19 套计数现算 | 新增用例 |

---

## 三、编排顺序（5 步，每步可独立验证、可独立回滚）

切分原则：**先做不依赖结构的，后做动结构的**；每步结束工作区都能跑通门禁。

### 步骤 1｜数据与策展先行（无 UI 变化）

- 改 `theme-curation.json` 加 `kits`；`build.mjs` 读它排序
- **验证**：`node pwa/scripts/build.mjs` 后，检查 `dist/themes/index.json` 里 19 套顺序 = `kits` 数组顺序；`node pwa/scripts/build.mjs` 自带断言全过
- **回滚**：`git revert` 单个提交，UI 完全无变化

### 步骤 2｜修 E-6/E-7/E-8（不动两 tab，纯修 bug）

- `.d-card-kit` 单独尺寸预算（4:3）
- `renderLayouts()` kit 态替换为状态文字；删 `:596` 的 `LAYOUT_OPTIONS` 查询
- `renderAllFolded()` 改用 `PALETTES()`
- **验证**：`python scripts/pwa_theme_drawer_test.py --local`（59 项仍全过，因为此步不动结构）；
  加跑 1440px 与 500px 两档宽度实测 `.d-card-kit .d-prev` 高 ≥ 宽×3/4
- **回滚**：单独提交，可 revert

### 步骤 3｜加两 tab 骨架（最大的一步）

- `index.html` 加 `.mode-tabs`；`app.js` 加 `drawerMode` / `renderModeTabs()` / `renderKitPane()`
- `renderDrawer()` 加一行分派；`renderFilters()` kit 态隐藏族 chip
- `style.css` 加 `.mode-tabs`
- **验证**：`--local` 抽屉测试（含新增用例）；手动切两 tab 各点 3 套
- **回滚**：这一步单独一个 PR，revert 即回旧结构

### 步骤 4｜色卡条缺陷（可放这步，因为依赖 KITS）

- `renderCaps()` 只取 palette；activeId 是 kit 时置顶显示
- **验证**：收藏一套 kit → 打开色卡条 → 断言 40 颗里无 `d-card-kit`（实际是 `.cap`），
  且当前 kit 以「正在使用」形态出现在第一位
- **回滚**：独立提交

### 步骤 5｜抽屉宽度归一（审查 B-4）

- `--drawer-w` 三态 + `padding-right` 联动
- **验证**：桌面 1440px 开抽屉 → 主区右推 = 抽屉宽；折叠态无 252px 空白
- **回滚**：独立提交

---

## 四、每步的统一验证口径

```bash
# 每步都跑（按改动面自动选套件）
.venv/Scripts/python.exe scripts/run_gates.py

# 步骤 2/3 必跑（抽屉结构改动）
.venv/Scripts/python.exe scripts/pwa_theme_drawer_test.py --local

# 19 套对齐夹具（改 mg-* 或 magazine_layouts 时自动触发，也可手跑）
.venv/Scripts/python.exe scripts/kit_alignment_fixture.py --browser

# 反向验证：证明夹具不是摆设（不需要每步跑，改夹具时跑）
.venv/Scripts/python.exe scripts/kit_alignment_canred.py --browser

# 文档同步
.venv/Scripts/python.exe scripts/doc_sync_check.py
```

**新增断言（必须写进 `pwa_theme_drawer_test.py`）**：

1. 切到「整篇设计」tab → 网格里卡片数 == `KITS.length`（现算，不写死 19）
2. kit 模式下 `#drawer-filters .fchip` 数量 == 0（无族 chip）
3. kit 模式下 `#drawer-blocks` / `#drawer-custom` 不可见
4. kit 卡 `.d-prev` 高/宽 ≥ 0.73（4:3 允许 2px 误差）
5. `#kit-note-text` 文本**不含** `[a-z]{4,}` 形式的英文内部 id（E-7 回归）
6. kit 模式下 `#drawer-layouts` 内无 `.dl-chip`，只有一行状态文字（E-8 回归）
7. 切回 palette → 族 chip 恢复、8 个 `.dl-chip` 恢复

---

## 五、本轮新发现的一个缺陷（原审查 E-5～E-8 未覆盖）

### E-9 【中等】收藏的整篇设计会混进底部色卡条

**代码事实**：

- `toggleFav()`（`:919`）不区分 kind，kit 可被收藏
- `orderedThemes()`（`:506`）把「收藏」排在「其余」之前
- `renderCaps()`（`:528`）取 `orderedThemes().slice(0, 40)`，**未按 kind 过滤**

**后果**：用户收藏一套整篇设计后，底部色卡条前 40 颗里会出现它。
色卡条的语义是「换配色」——点一颗胶囊 = 只换颜色、版式不变。
但点中那套 kit = **整套版式被替换**，与用户的预期完全不符。
更糟的是色卡条**不显示**「这是整篇设计」，用户无从分辨。

**修法**（并入步骤 4）：`renderCaps()` 只从 `PALETTES()` 取；
若当前 `activeId` 是 kit，则把该 kit 作为第一颗、加 `data-kind="kit"` 并显示「整篇」小标，
其余 39 颗全为 palette。

---

## 六、风险与不做

| 风险 | 说明 | 阻断方式 |
|---|---|---|
| 59 项抽屉测试大面积挂 | 依赖 `.fchip` / `.dl-chip` / `#drawer-blocks` | 步骤 3 后立即跑，逐项修；**不放宽断言凑绿** |
| kit 卡 4:3 与 palette 卡 2:1 高度不齐 | 已分 tab，两种卡不混排 → 无视觉问题 | 步骤 3 完成后才生效；步骤 2 期间若仍混排，先只改比例不改高度 |
| `theme-curation.json` 加 `kits` 后旧 build 报错 | `loadCuration()` 有 `|| []` 兜底 | 步骤 1 先改 build 再改 json，或同提交 |
| 窄屏 900px 以下两 tab 挤 | `.mode-tabs` 用横向胶囊，与 `.fchip` 同语言 | 加 `@media (max-width:900px)` 缩小 padding |
| SW 缓存旧 `app.js` | `SHELL_CRITICAL` 含 `src/app.js`，`?h=` 内容哈希 | 无需处理；构建自动变哈希 |

**明确不做**：

- 不新建 `src/kit-pane.js`（避免 `sw.js` + `build.mjs` 两处白名单登记）
- 不拆 `themes` 数组（见 §零）
- 不给 19 套补 `family`（那是「可组合版式」的概念，19 套不该有族）
- 不在抽屉新增任何「对齐」控件（方案 §七 决策 1 已定，A 案零 UI）
