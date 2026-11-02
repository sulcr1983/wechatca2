# P4 抽屉两 tab 方案 · 对抗性审查（2026-11-03）

> **审查对象**：`docs/plan-p4-drawer-split.md`（提交 `12ab679`）
> **审查基准**：`docs/prototypes/wechat-v7.html`（原型定稿）+ `pwa/src/app.js`（线上真源）
> **方法**：不看方案自述，逐条对着原型与代码复核；凡方案里的断言都要找到行号或实测数据。
> **结论**：**有问题，共 14 条**。其中 5 条是方案的硬错误（照做会做出错的东西），
> 6 条是遗漏（照做会漏东西），3 条是我自己编造/多余的（必须删）。

---

## 一、A 类：硬错误（照方案做会做错）

### A-1【严重】「共用同一个 `#drawer-grid`」与原型、与已拍板决策 4 都冲突

**方案原文**（§2.1）：「两 tab 共用同一个 `#drawer-grid`，不新建第二个」。

**原型实际做法**（`wechat-v7.html`）：

```
974:  <div id="pane-theme">     ← 配色主题：族 chip + 版式 + 段落 + 字号 + #grid
1046: <div id="pane-kit" hidden> ← 整篇设计：只有 <div class="d-grid" id="grid-kit">
1293: document.getElementById('pane-theme').hidden = mode !== 'theme';
1294: document.getElementById('pane-kit').hidden   = mode !== 'kit';
```

两个**独立的 pane**，切 tab 只切 `hidden`；kit pane 里**根本没有版式区、段落区、字号区**。

**冲突点**：用户已拍板「决策 4：kit 的版式区整体替换成一行状态文字」。
如果按原型把整个 `pane-theme` 隐藏，**这行状态文字没有地方放** —— 版式区本身就不存在了。

**这不是原型错，是我方案把两种做法混在一锅里**：既想共用 `#drawer-grid`（重渲染路线），
又引用了为「独立 pane」设计的决策 4。

**修法（推荐，见 §四 D-1）**：保留两个容器，但**不用 `hidden` 静态 DOM，仍用 innerHTML 重渲染**
（与线上 `app.js` 现有风格一致）：

| 容器 | 归属 | 谁写它 |
|---|---|---|
| `#drawer-grid` | palette | `renderAllFolded` / `renderFamilyFold` / `renderFlat` —— **一行都不用改** |
| `#kit-grid`（新增） | kit | 只由 `renderKitPane` 写 |

**事件委托上提一层**（这是我方案没想到的关键点）：现在委托挂在 `$('drawer-grid')`（`:1673`），
改挂到 `.drawer` 或 `#drawer-body` 上，一次委托同时覆盖两个网格 —— 不需要「复制一遍委托」。

这样做的好处是**palette 三个渲染函数零改动**，比我原方案（让 `renderAllFolded` 改调 `PALETTES()`）
风险更低。原方案那个改法仍然需要（见 B-4），但不再是「共用网格」的代价。

---

### A-2【严重】kit 分支的插入位置会串味，方案说的「一行就够」是错的

**方案原文**（§2.2）：「`renderDrawer()` 开头加 `if (drawerMode === 'kit') { renderKitPane(fav); return; }`
—— **唯一插入点，一行**」。

`renderDrawer()` 实际结构（`app.js:901-917`）：

```js
function renderDrawer() {
  renderLayouts();        // ① 版式区
  renderBlockToggles();   // ② 段落样式区
  applyKitLock();         // ③ kit 说明条 + 置灰
  const fav = new Set(favList());
  const q = drawerQ.trim().toLowerCase();
  if (q) { renderFlat(themes.filter(...), fav); return; }   // ④ 搜索：全量 themes
  if (drawerFam === 'fav') { ... }
  if (drawerFam === 'all') { ... }
  renderFamilyFold(drawerFam, fav);
}
```

两个坑：

1. **放在最开头**：① ② ③ 全不跑 → kit tab 下版式区是上一轮 palette 的残留，
   说明条不更新。**决策 4 的状态文字正是由 `renderLayouts()` 渲染的，必须跑**。
2. **放在 `if (q)` 之后**：kit tab 下搜索会把 `themes`（含 164 套 palette）全渲染进 kit 网格 →
   **串味**。而且 `renderFlat` 是写 `#drawer-grid` 的。

**修法**：kit 分支不是「一行 return」，它要依次做四件事：

```js
if (drawerMode === 'kit') {
  renderLayouts();          // 决策 4：8 胶囊 → 一行状态文字（内部按 drawerMode 分支）
  renderBlockToggles();     // 段落样式区保留（见 A-5）
  applyKitLock();           // 说明条
  renderKitPane(fav, drawerQ.trim().toLowerCase());  // 自己按 q 过滤 KITS
  return;
}
```

即 `renderKitPane(fav, q)` **自己处理搜索**（原型 `wechat-v7.html:1367` 就是 `KITS.filter(hit)`），
不借道 `renderFlat`。

---

### A-3【严重】E-7 的描述是错的：不是「漏英文 id」，是显示「默认」这个错词

**方案原文**（§2.2）：「顺带删掉 `:596` 的 `LAYOUT_OPTIONS.find(...)` 查 `lockedLayout` 的写法（E-7）」，
以及新断言第 5 条「`#kit-note-text` 文本**不含** `[a-z]{4,}` 形式的英文内部 id」。

**实测**（读 `dist/themes/index.json` 里任一 kit）：

```
mg-adidas:  layout = ''        ← 空的
            lockedLayout = 'adidas'
```

`applyKitLock()` 实际代码（`app.js:593`）：

```js
const layLabel = (LAYOUT_OPTIONS.find(([id]) => id === t.layout) || ['', t.layout])[1];
```

`t.layout` 是 `''` → 命中 `LAYOUT_OPTIONS` 的 `['', '默认']` → **说明条显示「版式（默认）」**。

所以真实缺陷是：**说明条写着「版式（默认）」，等于什么都没说**，而且暗示「用户可以改成默认」——
而 kit 恰恰是**锁死不能改**的。不是英文 id 泄漏。

**修法**：文案改为直接用 `lockedLayout` 的设计名，或干脆不提版式（决策 4 已有独立的状态文字区）。
新断言第 5 条相应改为「说明条不得出现『默认』二字」。

---

### A-4【严重】`#drawer-blocks`（段落样式）在 kit 下**不该隐藏**，方案写反了

**方案原文**（§2.1）：「`#drawer-blocks` / `#drawer-custom` 保留；`drawerMode==='kit'` 时隐藏
（kit 的配色锁死，这两个区 100% 不可操作）」。

**代码事实**：

- `#drawer-blocks` = **段落样式**（金句 / 数据 / 提示），给当前主题加色块强调 → **与版式无关，kit 完全适用**
- `#drawer-custom` = **自定义配色**（底色/正文/强调）→ kit 锁死，对
- `applyKitLock()` ④ 只给 `#drawer-custom` 加了 `.locked`（`style.css:489` `opacity:.45; pointer-events:none`）
- **没有** `.drawer-blocks.locked` 这条样式 → 段落样式在 kit 下一直是**可用**的

把 `#drawer-blocks` 一起隐藏 = **无理由砍掉一个可用的功能**。

**修法**：只隐藏 / 锁定 `#drawer-custom`；`#drawer-blocks` 保留。

---

### A-5【中等】`renderKitPane` 的尺寸计算没验证过，`.d-card{min-height:140px}` 会不会打架

**方案原文**（§2.3）：「`.d-card-kit` 单独尺寸预算：`aspect-ratio:4/3`；`min-height` 独立计算，
**不继承** `.d-card{min-height:140px}`」。

**实测**（按现行 `.drawer-grid` 规则推算 `style.css:371` `repeat(auto-fill, minmax(142px,1fr))`）：

| 抽屉宽 | 列数 | 卡片宽 | 4:3 应有高 | 现固定高 | 结论 |
|---|---|---|---|---|---|
| 500px | 3 | 149px | 112px | 104px | 只差 8px，裁切率 7% |
| 560px | 3 | ~170px | 128px | 104px | 裁 20% |

加上 `.d-body` 32px：4:3 时卡片内容高 112+32 = 144px > `min-height:140px` → **min-height 自然被撑开，
不需要覆盖**。方案里「min-height 独立计算」是**多余动作**，还会引入「两套 min-height 谁赢」的新问题。

**修法**：只写 `.d-card-kit .d-prev { aspect-ratio: 4/3; height: auto; }`，**不要动 min-height**。
（`.d-prev` 现在写死 `height:104px`，必须一起改 `height:auto`，否则 `aspect-ratio` 被 `height` 压制。）

> ⚠️ 顺带纠正一个我之前的说法：缩略图真实规格是 **480×360（4:3）**，
> 原型注释写的「截 480×240 生成」（`wechat-v7.html:1377`）是**原型注释写错了**，别照它做。

---

## 二、B 类：遗漏（照方案做会漏东西）

### B-1 kit 网格没有空态

原型有两种，方案一条都没写（`wechat-v7.html:1393-1395`）：

- **搜索无命中**（常见）：「没匹配的整篇设计 · 清除搜索」
- **缩略图缺失**（罕见）：`KITS.length === 0` → 提示跑生成脚本

原型注释记了一个真实事故：「搜『夜航』时明明 19 张缩略图都在，却提示『未生成』」——
**两种空态混成一种会造成误导**，必须分开。

### B-2 kit tab 内不该再显示「整篇」小标

原型 `wechat-v7.html:713`：

```css
#grid-kit .d-kit{ display:none; }   /* 冗余徽章，本 tab 零信息量 */
```

理由：整个 tab 都是整篇设计，每张卡再挂个「整篇」角标是废话。方案没写，照做会把角标带进 kit tab。

### B-3【新缺陷 E-10】`renderFilters()` 的「全部 183」在 palette tab 下是错的

`app.js:747`：

```js
const chips = [['all', `全部 ${themes.length}`], ['fav', `收藏 ${favList().length}`]] ...
```

`themes.length` = 183（164 palette + 19 kit）。分成两 tab 后，palette tab 里的「全部」实际只展示
164 套 → chip 上的数字**多算了 19**。用户在 palette tab 看到「全部 183」，点进去只数出 164 套。

**修法**：`renderFilters()` 改用 `PALETTES().length`。
（顺带：kit tab 下这排 chip 本就不渲染，见 A-2。）

### B-4【最容易被忽略】59 项抽屉测试会挂 19 项，且它现在的「164」本来就是假的

`scripts/pwa_theme_drawer_test.py:104`：

```python
all_ids = [t["id"] for t in index]      # ← index.json 全量 = 183 个，含 19 套 kit
```

`:281` 的断言文案却写「全部 164 套模板逐个可应用」，实际跑的是 **183 个 id**。
→ 这个测试**今天就在跑 183 套**，只是名字叫 164。

改两 tab 后：这 19 个 kit id 在 `#drawer-search` 里搜不到（kit 不在 palette tab）→
`card.count() == 0` → **19 个失败**。

**修法**：
1. `all_ids` 按 kind 拆：`pal_ids` / `kit_ids`
2. palette tab 里遍历 `pal_ids`；切到 kit tab 再遍历 `kit_ids`
3. 断言文案改成实际数量，别再写死 164

### B-5 `renderFilters()` 的族 chip 会算进 kit 吗？

`themes.map(t => t.family).filter(Boolean)` —— 19 套 kit 的 `family` 全是 `''`，**不会进族统计**。
✅ 这条没问题，但方案没说，评审时会被问，先记下。

### B-6 `familyRepCard()` 硬编码 `theme-thumbs` —— **不需要改**

方案 §一「现状」把它列了出来，容易被读成「也要改」。实际上：族代表卡只在 palette tab 出现，
palette 的缩略图本来就在 `theme-thumbs/`。**保持不动是对的**，方案应写明「不改」，避免实现时误改。

---

## 三、C 类：方案里多余 / 我编造的，必须删

### C-1【编造】`--drawer-w` 的「折叠 248px」不存在

**方案原文**（§2.3）：「三态：展开 `min(560px,94vw)` / browsing `500px` / **折叠 `248px`**」。

**核实**：

```
grep -n "248px|252px|collapsed|折叠" pwa/src/style.css   → 无匹配
原型 wechat-v7.html:61  --drawer-w: 520px;               → 只有一个值，无折叠态
```

线上抽屉**没有折叠态**。「248px」是我凭印象编的。必须删掉，否则实现时会去找一个不存在的状态。

### C-2【多余】`.d-card-kit` 不需要覆盖 `min-height`

见 A-5 的实测：4:3 下内容高 144px 自然超过 140px。覆盖反而制造新歧义。

### C-3【多余的谨慎】步骤 1 说「先改 build 再改 json，或同提交」

`build.mjs:279-282` 实际是：

```js
if (!fs.existsSync(p)) return { featured: [], order: [] };
return { featured: d.featured || [], order: d.order || [] };
```

已有 `|| []` 兜底 → **先改 json 也不会炸**，只是 `kits` 读不到。这个风险提示是多余的，
可以保留成「建议同提交」但不必当风险。

---

## 四、D 类：需要用户拍板（见回复里的选择器）

| # | 决策点 | 选项 |
|---|---|---|
| D-1 | kit pane 里「版式已锁定」那行状态文字放哪 | ① kit pane 顶部独立一行（跟原型 pane 结构一致）② 并入 `#kit-note` 说明条（少一行） |
| D-2 | kit tab 下「段落样式」（金句/数据/提示）是否保留 | ① 保留（它是内容装饰，不破坏 kit 设计）② 一并锁死 |
| D-3 | 抽屉宽度统一为 | ① 520px（原型定稿值）② 保持线上 500px |

---

## 五、修正后的编排（替换原方案 §三 的步骤 2 与 3）

原方案步骤 1 / 4 / 5 不受影响。步骤 2 / 3 改动如下：

### 步骤 2｜修 E-6 / E-7 / E-10（不动 tab 结构，纯修 bug）

- `.d-card-kit .d-prev { aspect-ratio:4/3; height:auto }`，**不动 min-height**
- `applyKitLock()` ②：说明条文案去掉「版式（默认）」（A-3）
- `renderFilters()`：「全部」改用 `PALETTES().length`（B-3 / E-10）
- **验证**：59 项抽屉测试仍全过（此步不动结构）；实测 `.d-card-kit .d-prev` 高/宽 ≥ 0.73

### 步骤 3｜加两 tab 骨架

- `index.html`：`.mode-tabs` + 新增 `#kit-grid`（与 `#drawer-grid` 并列）
- `app.js`：
  - `drawerMode` / `renderModeTabs()`
  - `renderKitPane(fav, q)` —— **自带搜索 + 自带两种空态 + 不带 `.d-kit-tag`**
  - `renderDrawer()` 的 kit 分支要跑 4 件事（A-2）
  - **事件委托从 `$('drawer-grid')` 上提到 `.drawer`**（A-1）
- `style.css`：`.mode-tabs`、`#kit-grid` 复用 `.drawer-grid` 规则、`#kit-grid .d-kit-tag{display:none}`
- **验证**：见 §六 新增断言 1–9

---

## 六、修正后的新增断言（替换原方案 §四 的 7 条）

1. 切到 kit tab → `#kit-grid .d-card` 数 == `KITS.length`（现算）
2. 切到 palette tab → `#kit-grid` 为空、`#drawer-grid` 非空
3. kit 模式下 `#drawer-filters .fchip` 数 == 0
4. kit 模式下 `#drawer-custom` 有 `.locked`，**`#drawer-blocks` 没有**（A-4 回归）
5. kit 卡 `.d-prev` 高/宽 ≥ 0.73（4:3）
6. `#kit-note-text` **不含「默认」二字**（A-3 回归）
7. kit 模式下 `#drawer-layouts` 内无 `.dl-chip`，有状态文字（决策 4）
8. kit tab 搜「夜航」→ 无命中空态文案含「没匹配」；搜缩略图不存在的 id → 空态文案含「未生成」（B-1 两种空态分开）
9. palette tab 的「全部」chip 数字 == `PALETTES().length`，**不等于** `THEMES.length`（B-3 回归）
10. kit 卡内不存在 `.d-kit-tag`（B-2 回归）

---

## 七、审查未覆盖的（诚实标注）

- **真机 / 微信环境**：本审查只核代码与原型，未在真机验证 4:3 卡片的实际观感
- **`#kit-grid` 的滚动容器归属**：`#drawer-grid` 现是 `flex:1; overflow-y:auto`。
  新增第二个网格后，**两个网格不能同时是 `flex:1` 滚动区**（会各占一半高）。
  正确做法：把滚动包成外层 `.drawer-body{flex:1;overflow-y:auto}`，两个网格放里面。
  **这条是本次审查新发现的实现陷阱，原方案完全没提。**
