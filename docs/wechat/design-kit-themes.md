# Kit 主题方案（15 套「整篇设计」）· 数据模型与交互契约

> 状态：**方案文档**，`core/` 与 `pwa/src/` 一个字未改
> 配套：[`design-magazine-recipes.md`](design-magazine-recipes.md)（15 套配方参数）、
> [`engine/design-engine-optimization.md`](../engine/design-engine-optimization.md)（引擎三项改造）
> 原型：`docs/prototypes/wechat/layout-system.html`

---

## 0. 一页纸结论

| 项 | 决定 |
|---|---|
| 形态 | 15 套 = **主题（kit 主题）**，不是版式 |
| 列表 | 抽屉分两段：**配色主题（49 签名卡）** / **整篇设计（15 套）** |
| 选中后 | 版式区 `disabled` + 顶部说明行 + 「改回可组合版式」按钮 + 色卡区置灰 + 自定义配色收起 |
| 配色 | **锁死**。kit 主题的 colors/styles 是固定值，不随当前主题派生 |
| 退出 | 回到**进 kit 前记住的那套 palette 主题** |
| 收藏 | **可收藏**（收藏是用户行为，不因是 kit 就禁掉） |
| id | `mg-time` / `mg-guardian` …（避开 `su-*`） |
| 新增字段 | `kind: "kit"` + `locked_layout` |
| 新增文件 | 15 个 `public/themes/mg-*.json`，**无新增目录、无新增管线** |

---

## 1. 为什么是「主题」而不是「版式」

我最初把它们做成版式（从当前主题派生 accent），这是错的。原因：

> ⚠️ **2026-11-01 修正**：本节原按「品牌印象」分「8 套配色即身份 / 7 套结构即身份」，
> 实测代码后**发现分错了**。判据换成可 grep 的事实：**layout 函数里有没有写死品牌色值**
> （排除 `#fff` / `#000`）。结果：

| 判据（实测） | 配方 | 数量 |
|---|---|---|
| **写死 1–3 个品牌色** → 换配色即失效 | `muji`(#F8F6F1/#EFEAE1) · `mori`(#FAF7F0) · `ukiyoe`(#1B3A5C/#8C3A2E/#F3F0E8) · `note`(#2C4E7A/#F7F8FA) · `ikea`(#FFDA1A/#C9A227) · `starbucks`(#006241/#F2EDE4) · `brutal`(#F5E9A8/#F5C6D0) · `deepread`(#4A3B32/#C8795A) | **8 套** |
| **写死 0 个**（纯 accent 派生）→ 可自由组合 | `time` · `guardian` · `economist` · `natgeo` · `vogue` · `forbes` · `adidas` | **7 套** |

**注意与旧分类的差异**：旧版把 `time`/`vogue` 归为「配色即身份」、把 `deepread`/`note` 归为
「结构即身份」——**两处都反了**。原分类靠品牌印象，没有实测支撑。

**决定**：
- 8 套「写死品牌色」的 → 做成 kit 主题，且**从版式段移除**（它们在别的配色下会产出四不像）
- 7 套「纯 accent 派生」的 → 既是 kit，也保留在版式段（可自由组合，是真正的正交能力）

所以版式段从 26 → **18 个**（11 通用 + 7 真可组合）。这条判据可 grep、可进 CI，
不像「我觉得它算结构还是配色」那样靠印象。

---

## 2. 数据模型：两个新字段

### 2.1 字段定义

在现有主题 JSON 上**扩两个顶层字段**：

```jsonc
{
  "name": "时代周刊",
  "description": "红色细框线 + 居中秩序 + 小信息，适合新闻、商业、人物",
  "kind": "kit",                    // ← 新增。缺省视为 "palette"
  "locked_layout": "time",          // ← 新增。kit 自带的版式，对应 LAYOUT_REGISTRY 里的键
  "colors": { ... },                // 固定值，不派生
  "styles": { ... }                 // 固定值
}
```

### 2.2 为什么扩字段，而不是新建目录或新 JSON 结构

| 方案 | 评价 |
|---|---|
| **扩两个顶层字段**（选用） | 复用现有 `loadThemeJson` / `themeJsonCache` / SW 清单 / `buildThemeIndex` / `themes/manifest.json` 全链路，**零新增管线** |
| 新建 `public/kits/*.json` | 要新写一套加载、缓存、SW 预热、manifest 生成、索引构建。**五处新代码，五处新坑** |
| 复用 `layout` 字段表达 | ❌ 不行。`layout` 已被「用户本机覆盖」占用（见 §3.1），会被覆盖掉 |

**关键约束**：`kind` 与 `locked_layout` 必须是**新字段**，不能复用 `layout`。原因见下。

### 2.3 为什么不能用现有的 `layout` 字段

`app.js:486-489`（`themeMeta`）里：

```js
const layoutOv = lsGet(LS.layout, {});           // 用户本机覆盖
return { ...t,
         layout: layoutOv[id] !== undefined ? layoutOv[id] : (t.layout || '') };
```

**用户的本地覆盖优先级高于主题自带值。** 如果 kit 用 `layout` 表达，用户在 kit 上点过一次版式，
`layoutOv[id]` 就写入了 → 下次再选这个 kit，`layout` 读的是用户的旧值，**锁死失效**。

所以必须：
- 用独立的 `locked_layout` 字段
- `themeMeta` 对 kit **直接返回** `locked_layout`，**不查** `layoutOv`

---

## 3. 交互契约

### 3.1 锁定语义（五件事必须同时做，不能只写文案）

| # | 行为 | 判定 |
|---|---|---|
| 1 | 版式区所有胶囊 `disabled` + `aria-disabled="true"` | 真 `disabled`，不是加灰色 class |
| 2 | 版式区顶部出现一行说明 | 文案：「这是整篇设计，版式与配色已固定」 |
| 3 | 出现「改回可组合版式」按钮 | 点击后执行 §3.2 |
| 4 | 色卡区（`#style-caps`）置灰 | 同样 `disabled` |
| 5 | 自定义配色区（`#drawer-custom`）隐藏 | `hidden`，不是变灰——kit 的配色不可自定义 |

**为什么这五条必须齐**：只置灰版式区而不锁色卡，用户会以为「至少能换色」，结果换了发现样式没变（因为 kit 的 styles 是固定的），判定为「坏了」。

### 3.2 退出语义

「改回可组合版式」按钮 = 回到**进 kit 前记住的那套 palette 主题**。

**为什么不是「回到默认」**：用户可能本来在用「公文·湖蓝」，点了个 kit 看效果，不想用了。
回到「默认」等于把人家原来的选择也丢了。

**记忆机制**：

```js
// 存储键（新增，加入 supersu.* 注册表）
const LS_KIT_RETURN = 'supersu.kit.return';   // 存「进 kit 前的那套 palette id」
```

- 进入 kit 时：若当前是 palette 主题 → 写入 `supersu.kit.return`
- 退出时：读该键 → 切回；若无值（异常情况）→ 回落第一套 palette 主题
- 再次进入另一个 kit：**不覆盖**已有记忆（保留用户最初那套）

### 3.3 收藏

kit **可以收藏**。理由：收藏是用户对「我常用它」的表达，与「它是不是可组合」无关。
实现上无需改动——收藏键 `supersu.fav` 存的是 id 列表，`mg-time` 与 `ink` 一视同仁。

### 3.4 搜索

两段**各自独立搜索**：

- 搜索框输入时，两段同时过滤，各自显示自己的命中数
- 某段命中 0 时，该段标题仍显示（附「无匹配」），**不整段消失**——否则用户以为分类被删了

---

## 4. 渲染契约：kit 与 palette 的差异点

| 环节 | palette 主题 | kit 主题 |
|---|---|---|
| `layout` 取值 | 用户选的（`layoutOv` 优先） | **固定** `locked_layout`，不查 `layoutOv` |
| 版式区 | 可点 | `disabled` + 说明行 |
| `styles` | 主题自带 | 主题自带（固定值） |
| `colors` | 主题自带 | 主题自带（固定值） |
| 自定义配色 | 可用 | 隐藏 |
| 段落样式三开关 | 可切换 | **仍可用**（不改颜色，只改内容识别，与配色锁死不冲突） |
| 收藏 | 可收藏 | 可收藏 |
| 导出 / 复制 | 一致 | 一致 |

> **段落样式三开关（金句/数据/提示）保持可用的理由**：它们只影响「哪些段落被识别成特殊块」，
> 不改配色，所以不违背「配色锁死」。锁得过头会让 kit 变成死物。

---

## 5. id 命名：为什么是 `mg-*`

现有族归属靠前缀：

```js
// build.mjs:169
function familyOf(id) {
  const m = /^su-([a-z]+)-/.exec(id);
  return m && FAMILIES.includes(m[1]) ? m[1] : '';
}
const FAMILIES = ['biz', 'feast', 'letter', 'minimal', 'night', 'stamp', 'dusk'];
```

| 命名 | 后果 |
|---|---|
| `mg-time`（选用） | 不匹配 `su-` 前缀 → `familyOf` 返回 `''` → 归入「经典」，**不影响 7 个族** |
| `su-time-xxx` ❌ | 若 `time` 不在 `FAMILIES` → 返回 `''`，白命名；若加进 `FAMILIES` → 会改 `doc_sync_check.py` 的族数校验（7 族变 8 族），牵动 README/AGENTS/overview |

**`mg-` 前缀的好处**：一眼可辨「这是 magazine kit」，且与族系统正交。

15 个 id：
```
mg-time  mg-guardian  mg-economist  mg-natgeo  mg-vogue
mg-forbes  mg-muji  mg-mori  mg-ukiyoe  mg-note
mg-ikea  mg-starbucks  mg-adidas  mg-brutal  mg-deepread
```

---

## 6. 15 套的固定配色与 locked_layout

配色取**截图原值**，不派生自当前主题。凡截图未给具体色值的，按截图的色彩描述推导并标注「推导」。

| # | id | 名称 | locked_layout | 底色 | 主墨色 | 强调色 | 配色来源 |
|---|---|---|---|---|---|---|---|
| 1 | `mg-time` | 时代周刊 | `time` | `#FFFFFF` | `#111111` | `#E3120B` | 截图「红色」+ 时代标志红 |
| 2 | `mg-guardian` | 卫报 | `guardian` | `#FFFFFF` | `#121212` | `#C70000` | 截图「深蓝标题、红色记号」+ 卫报红 |
| 3 | `mg-economist` | 经济学人 | `economist` | `#FFFFFF` | `#333333` | `#E3120B` | 截图「深灰非纯黑」+ 经经学人红 |
| 4 | `mg-natgeo` | 国家地理 | `natgeo` | `#FFFFFF` | `#1A1A1A` | `#F5B800` | 截图黄 `#F5B800` |
| 5 | `mg-vogue` | Vogue 画报 | `vogue` | `#FFFFFF` | `#000000` | `#000000` | 截图「只有黑白」 |
| 6 | `mg-forbes` | 福布斯 | `forbes` | `#FFFFFF` | `#1A1A1A` | `#0B4FA8` | 截图「可加一点深蓝」 |
| 7 | `mg-muji` | 无印良品 | `muji` | `#F8F6F1` | `#3D3935` | `#7F0019` | 截图原值 |
| 8 | `mg-mori` | 森系 | `mori` | `#FAF7F0` | `#3F3A32` | `#6B8E6B` | 截图「豆绿」推导 |
| 9 | `mg-ukiyoe` | 浮世绘 | `ukiyoe` | `#F3F0E8` | `#1B3A5C` | `#8C3A2E` | 截图「靛青 + 赭红」 |
| 10 | `mg-note` | 笔记纸底 | `note` | `#F7F8FA` | `#22303F` | `#2C4E7A` | 截图「淡灰蓝 + 深蓝」 |
| 11 | `mg-ikea` | 宜家目录 | `ikea` | `#FFFFFF` | `#111111` | `#0058A3` | 截图原值（+ 黄 `#FFDA1A` 只画线） |
| 12 | `mg-starbucks` | 星巴克 | `starbucks` | `#FFFFFF` | `#1E1E1E` | `#006241` | 截图「深绿」 |
| 13 | `mg-adidas` | 阿迪达斯 | `adidas` | `#FFFFFF` | `#000000` | `#000000` | 截图「黑白灰」 |
| 14 | `mg-brutal` | 新粗野 | `brutal` | `#FFFFFF` | `#000000` | `#7C3AED` | 截图「紫底」推导 |
| 15 | `mg-deepread` | 深度阅读 | `deepread` | `#FFFFFF` | `#4A3B32` | `#C8795A` | 截图「深褐 + 赤陶」 |

> **宜家需要两个颜色**（蓝写字、黄画线）。主题 JSON 只有 `accent` 一个强调位 →
> 第二个颜色写在 `styles` 里作为固定字面值（如 h1 的 `border-bottom:4px solid #FFDA1A`），
> 不进 `colors`。这样不影响主题体系，也不需要新增 `accent2` 字段。

---

## 7. 实现路径（对应真实文件与函数）

| 步骤 | 文件 | 落点 | 改什么 |
|---|---|---|---|
| 1 | `public/themes/mg-*.json` | 新建 15 个 | 完整 `colors` + `styles` + `kind` + `locked_layout` |
| 2 | `pwa/scripts/build.mjs` | `buildThemeIndex()` L300-314 | entry 增加 `kind: theme.kind \|\| 'palette'` 与 `lockedLayout: theme.locked_layout \|\| ''` |
| 3 | `pwa/src/app.js` | `themeMeta()` L473-490 | kit 分支：`layout` 直接返回 `lockedLayout`，跳过 `layoutOv` |
| 4 | `pwa/src/app.js` | `renderLayouts()` L620-627 | kit 时输出 `disabled` + `aria-disabled` |
| 5 | `pwa/src/app.js` | `renderDrawer()` | 拆两段渲染，各自计数 |
| 6 | `pwa/src/app.js` | 版式层 click 处理 L1426 | kit 时直接 `return`（双保险，防绕过 disabled） |
| 7 | `pwa/src/app.js` | 新增 | 锁定态 UI 切换 + 「改回可组合版式」按钮 + 记忆键读写 |
| 8 | `pwa/src/style.css` | 新增 | `.dl-chip[disabled]` / `.cap[disabled]` / `.kit-note` / `.kit-exit` 样式 |
| 9 | `pwa/theme-curation.json` | `order` 末尾 | 15 个 id 追加；**不进 `featured`** |
| 10 | 文档 | README / AGENTS / overview | 主题数 164 → 179 |

### 7.1 为什么 kit 不进 `featured`

`featured` 是「配色主题的推荐位」（12 套，跨场景覆盖）。kit 是另一类东西，
混进去会让「先看这几套」失去意义。它们在 `order` 里全部排最后，符合你「放在最下方」的要求。

---

## 8. 验收判据（每条都要能红）

| # | 判据 | 反向验证方式 |
|---|---|---|
| 1 | 15 套全部通过现有对比度门禁（标题 ≥3.0 / 正文 ≥4.5） | 把某套 accent 改成 `#FFEE00` → 必须报错 |
| 2 | 15 套全部通过现有渲染审计（标签配平 / 无 None 残渣） | 故意留一个 `None` → 必须报错 |
| 3 | 选中 kit 后版式区 `disabled` 为真 | 断掉 `renderLayouts` 的 kit 分支 → 必须失败 |
| 4 | 选中 kit 后色卡区 `disabled` 为真 | 同上 |
| 5 | 选中 kit 后 `drawer-custom` 不可见 | 同上 |
| 6 | 退出后回到记忆的 palette 主题 | 清掉 `supersu.kit.return` → 必须回落正确 |
| 7 | **164 套 palette 主题的渲染产物逐字节不变** | 用 `theme_render_dump.py --diff` 比对 |
| 8 | 主题总数 179、族数仍为 7 | `doc_sync_check.py` 通过 |

第 7 条是本次的硬底线：**加 15 套不能碰原有 164 套的任何输出。**

---

## 9. 已知风险与对策

| 风险 | 后果 | 对策 |
|---|---|---|
| `locked_layout` 拼错（如 `mg-typo: "time2"`） | 引擎查不到 → 静默不套版式，用户以为 kit 没效果 | 构建期断言：`locked_layout` 必须存在于 `LAYOUT_REGISTRY` |
| 15 套 styles 手写量大、易漂移 | 与原型不一致 | 用 `scripts/build_themes.py` 现有的装配逻辑生成，**不手写 JSON** |
| SW 缓存清单漏加新主题 | 线上离线时 15 套不出现 | 现有构建已「扫描目录生成清单」，不必手工同步（需验证一次） |
| 用户理解不了「整篇设计」 | 点进去发现不能改版式，觉得被限制 | 卡片上加标记（如右上角一个小锁图标）+ 选中后的说明行 |
| 与「49 张签名卡」的层级重复 | 抽屉里两段都是「主题」，用户困惑 | 段标题写清差异：「配色主题 · 可自由组合」/「整篇设计 · 版式配色已固定」 |

---

## 10. 不做

| 不做 | 原因 |
|---|---|
| 让 kit 支持换色 | 8 套的辨识度就来自配色，换色即失去身份（你已确认锁死） |
| 让 kit 在版式上再叠加 | 会产生 kit 结构 + 版式结构的双重包裹，历史上 `_strip_heading_block` 就是为治这个而加的 |
| 把 kit 做成新目录/新管线 | 复用现有链路，零新增 |
| 改 `FAMILIES` 加新族 | 会牵动族数校验与三份文档，收益为零 |
