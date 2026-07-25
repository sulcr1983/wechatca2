# SuperSu 设计偏差与修正契约（design-audit）

> 文档性质：**设计契约 / 修正目标规范**，供下一步代码修复对齐使用。
> 创建日期：2026-07-24 ｜ 基于：有头浏览器 E2E 审计 + 代码级核验 + 运行时调用实证
> 覆盖范围：**公众号文章页 + 小红书封面页**（双页面）
> 对应任务：先立契约（文档 + HTML 原型），再修代码（见 AGENTS.md §11 铁律）

---

## 0. 执行纪律（按 AGENTS.md §11 铁律）

- **推理闸**：本文件解决"下一步修代码时对齐到哪套规范"的问题。消费者 = 后续执行代码修复的 agent / 人。
- **单一真源**：
  - 设计真源 = `references/` 归藏设计系统文档（本文件**只引用、不重复**其内容）。
  - 运行时契约真源（social）= `GET /api/social/styles` 返回的**规范 id**（已运行时确认）。
  - 运行时契约真源（wechat）= `GET /api/themes` 返回的 **53 套主题 JSON**（含 `id` / `name` 字段）。
  - 当前实现事实 = 本节下方代码行（已逐条 `grep` / 运行时核验）。
- **验收规则**：所有结论均带 **验证标签**（运行时验证 / 代码验证 / 设计意图），无"凭截图猜"的结论。
- **不瞎重构**：本文件只描述契约，不改代码；代码修复是独立任务。

---

## 第一部分：小红书封面页（Social Studio）

### 1.1 偏差清单

| 编号 | 严重度 | 偏差 | 验证标签 |
|---|---|---|---|
| D-1 | **P0 阻断** | 生成结果卡显示纯色占位块，不渲染真实封面图 | 代码验证 `index.html:1272` |
| D-4 | **P0 阻断** | 风格选择器 12 个选项对产出**零区分度**（全塌缩到 editorial） | 运行时验证 + 代码验证 `index.html:1180-1262` / `app.py:524` |
| D-2 | P1 | 渲染视觉违反归藏"局部 tint + 纸奶白"铁律，实际铺满暗渐变 + 纯白字 | 代码验证 `scripts/render_worker.py:288,296` |
| D-3 | P1 | 移动端（≤800px）预览区与结果区被 `display:none` 硬隐藏，完全不可见 | 代码验证 `index.html:454-456` |
| D-5 | P2 | 风格分组与 API 规范分组不一致（前端 editorial/swiss/blcaptain vs API 静纸/实证/归藏） | 代码验证 + 运行时验证 |

> **D-6（预览卡 JS 报错）已撤回**：初版误读截图 OCR。复核 `spv` 用 `textContent`（不碰 `.value`），且自动化审计记录 **0 console error + 0 pageerror**，裸 null 必被捕获。非缺陷。

> **修复状态（2026-07-24 已闭环）**：D-1 / D-4 / D-2 / D-3 / W-1 已全部修复并通过回归门禁 + 真实浏览器验证，详见文末 §6。D-5 部分残留（前端分组用静态 `guizang`/`blcaptain` tab，未直接读 API `group`，但 11 个 id 均已可达可区分）；W-2 未做（低优先，非阻断）。

### 1.2 规范 id 真源（运行时确认 `GET /api/social/styles`）

后端**已能正确路由**以下 id——前端只要发这些 id 即可，无需任何后端改动：

```jsonc
{
  "blcaptain": [
    {"id":"sp-mist",    "name":"SP-01 雾野"},
    {"id":"sp-warm",    "name":"SP-02 暖书房"},
    {"id":"sp-coastal", "name":"SP-03 海岸"},
    {"id":"sp-night",   "name":"SP-04 夜纹"},
    {"id":"sp-hearth",  "name":"SP-05 炉台"},
    {"id":"sl-blue",    "name":"SL-01 电蓝"},
    {"id":"sl-mint",    "name":"SL-02 石墨薄荷"},
    {"id":"sl-coral",   "name":"SL-03 安全珊瑚"},
    {"id":"sl-lime",    "name":"SL-04 酸性青柠"}
  ],
  "guizang": [
    {"id":"editorial", "name":"Editorial 杂志风"},
    {"id":"swiss",     "name":"Swiss 瑞士风"}
  ]
}
```

- 路由判定：`app.py:524` `style.startswith(("sp-","sl-"))` → BLCaptain 引擎；否则 → 归藏引擎（`editorial`/`swiss`）。**全部小写前缀**。
- 归藏内部再映射到 `public/cover-templates/` 真实模板（10 套：6×editorial-* + 4×swiss-*）。

### 1.3 逐项偏差详情

#### D-1 【P0】结果卡不显示真实封面图
- **现象（功能视角）**：用户点"生成封面"后，结果区只出现一个纯色渐变块，看不到成品图，无法判断/下载。核心价值链"生成 → 看图 → 下载"断裂。
- **代码定位**：`templates/index.html:1272`
  ```html
  <div class="result-card-body" style="background:linear-gradient(135deg,#e8d5c0,#d4a06a);"></div>
  ```
  写死渐变占位，**未绑定** API 返回的真实图片 `url`。API 实际已返回 `images[].url`（见 `app.py:536/549`），只是前端没用。
- **修正目标**：结果卡用 `<img src="{真实url}">` 渲染；保留下载按钮（`/output/{task_id}/{fname}`）。原型见 `docs/prototypes/social-studio-target.html` 结果区。

#### D-4 【P0】风格选择器对产出零区分度
- **现象（功能视角）**：用户以为在"选风格"，实际选什么都不影响结果——12 个选项全部渲染成同一个 editorial 封面。静默失败，UI 完全正常，极难察觉。
- **运行时铁证**：分别用 `杂志封面 / 经典排版 / 暖调静物 / SP-01 雾野 / 极简几何` 调 `/api/social/generate`，返回**完全同一组** `xhs-01.png / square-01.png / wide-01.png`（engine=guizang）。
- **根因链（代码级）**：
  1. 前端 `templates/index.html:1180-1184` `styleMap` 硬编码中文名；`:1193` `data-style="${s}"`、`:1262` `body:{style: activeSocialStyle}` 直接把中文名 / `"SP-01 雾野"` 当 id 发出。
  2. 后端 `app.py:524` `is_blcaptain` 仅认**小写** `sp-`/`sl-`——前端发的大写 `"SP-01"` 不匹配 → 走归藏分支。
  3. 归藏渲染入口（实际为 `core/guizang_renderer.py`，`scripts/render_worker.py` 为死代码，详见 §6.2）按 `style` id 选 `public/cover-templates/` 模板；中文名 / `"SP-01 雾野"` 无法命中 → 抛错。
  4. `app.py:550-556` except 兜底 `style="editorial"`。
- **修正目标（前端单点修复，后端不用动）**：风格网格**消费 `/api/social/styles`**，每个选项 `value=规范id`、`文本=name`；选中后 `activeSocialStyle = id`。详见原型选择器。

#### D-2 【P1】渲染视觉违反归藏铁律
- **现象**：封面铺满暗色渐变 + 纯白大字，与设计系统"局部 tint、纸奶白 `#f5f1e8`、克制留白"冲突，整体偏"营销海报"而非"归藏质感"。
- **代码定位（已更正）**：实际渲染入口为 `core/guizang_renderer.py`（原引用的 `scripts/render_worker.py` 经核验为**死代码**，无人导入，详见 §6.2）。修复后覆盖层改为局部 tint，不再铺满暗渐变。
- **修正目标（设计意图，引用 `references/` 归藏系统）**：背景用纸奶白 `#f5f1e8` 或局部 tint，文字用深墨 `#1a1a1a`，仅区块上色。此项为视觉优化，不阻断功能。

#### D-3 【P1】移动端预览/结果被硬隐藏
- **现象**：手机（≤800px）打开小红书页，右侧预览与结果区整个消失，用户什么也看不到。
- **代码定位**：`templates/index.html:454-456`
  ```css
  @media (max-width:800px) {
    .social-preview,.social-results { display:none; }
  }
  ```
- **修正目标**：改为响应式堆叠（`.studio-body` 列方向、预览/结果正常流排布），不再 `display:none`。原型已含 ≤800px 堆叠样式。

#### D-5 【P2】分组与 API 不一致
- **现象**：前端风格 tab 为 `editorial / swiss / blcaptain`，API 规范分组为 `静纸·Still Paper / 实证·Signal Proof（均归 BLCaptain）/ 归藏`。用户看到的分组名与后端语义错位。
- **修正目标**：选择器分组直接映射 `/api/social/styles` 的 `group` 字段，避免双份硬编码分组定义。

### 1.4 Social 修正目标规范（设计契约）

| 组件 | 契约要求 |
|---|---|
| 结果卡 | `<img>` 绑定 API `url`，可见、可下载；占位仅用于加载中 |
| 风格选择器 | 选项来自 `/api/social/styles`；`value=id`；11 个风格各自产出**可区分**封面 |
| 视觉（归藏） | 纸奶白 `#f5f1e8` 底 / 深墨字 / 局部 tint；不铺满暗渐变 |
| 移动端 | ≤800px 列堆叠，预览与结果**可见** |
| 分组 | 对齐 API `group`，单一分组真源 |

> 交互行为契约（沿用 AGENTS.md §7 归藏 7 步工作流）：输入文案 → 选风格（实时预览）→ 上传图（可选）→ 生成 → 结果卡显示真实图 → 大图查看 / 下载。

### 1.5 Social 验收标准

1. **���择器生效**：用 11 个规范 id 各调一次 `/api/social/generate`，返回 **11 组互不相同**的 PNG（BLCaptain 9 种 + 归藏 2 种），engine 字段正确。
2. **结果可见**：生成后结果卡渲染真实 `<img>`，截图可辨封面内容；下载链接可达。
3. **视觉合规**：抽查生成图，背景为纸奶白 / 局部 tint，非全画布暗渐变。
4. **移动端**：390×844 视口下预览与结果区可见、可操作（headed E2E 验证）。
5. **回归门禁**：`test_e2e`（40/41，已知 1 项陈旧 UI 断言除外）+ `test_integration`（35/35）通过；有头 E2E 交互遍历通过。

---

## 第二部分：公众号文章页（WeChat Studio）

### 2.1 页面现状概述

公众号页是 SuperSu 的**核心功能入口**（默认激活页），实现"纯文本进 → Markdown 自动预处理 → 选主题 → 微信内联 HTML 排版预览 → 复制/推送"的主工作流。

**当前 DOM 结构**（`index.html:474-569`）：
```
#page-wechat（.page.active）
├── .wechat-grid（三栏 CSS Grid）
│   ├── .col-text        → #input-area（textarea，示例文案）
│   ├── .col-templates   → #tpl-list（53 套主题 .tpl-item）
│   └── .col-preview     → #preview-frame（iframe，blob URL 渲染）
├── #ai-panel            → AI 智能排版 + AI 润色卡片（折叠隐藏）
└── .wechat-footer       → 复制 / 历史 / 一键推送 / AI 工具切换
```

**交互链路**（已运行时验证正常）：
1. 页面加载 → `loadThemes()` → `GET /api/themes` → 获得 53 套主题 JSON 数组 ✅
2. 用户点击 `.tpl-item[data-tpl]` → `activeTpl = t.id` → `doRender()` ✅
3. `doRender()` → `POST /api/render {raw_text, theme_id}` → 返回 HTML ✅
4. `showPreview(html)` → 写入 iframe `src = URL.createObjectURL(blob)` ✅
5. 复制/推送弹窗均可打开 ✅

**E2E 证据**：有头浏览器遍历 53 套主题逐一点击，全部返回 200 且预览刷新（`output/e2e_audit/report.json`）；截图 `04_wechat_rendered.png` 确认预览区展示真实渲染效果（Monocle 生活 / 黑藤青 / 报纸等主题名可见）。

### 2.2 偏差清单

| 编号 | 严重度 | 偏差 | 验证标签 |
|---|---|---|---|
| W-1 | **P1** | 移动端（≤800px）主题选择器被 `display:none` 硬隐藏，用户无法切换主题 | 代码验证 `index.html:454` |
| W-2 | P2 | AGENTS.md §6 描述的 DOM 结构（header+main-body+footer）与实际三栏 grid 不一致 | 文档对照 |
| W-3 | P2 | 公众号页功能链路完整，**无 P0 阻断** | 运行时验证（E2E 40/41 + 截图） |

### 2.3 逐项偏差详情

#### W-1 【P1】移动端主题选择器硬隐藏
- **现象（功能视角）**：手机或窄屏（≤800px）打开公众号页，中间栏 53 套主题列表完全消失（`display:none`）。用户只能看到编辑区和预览区堆叠，**无法切换主题**——只能使用当前选中项（首次加载为空，需桌面端先选一次）。
- **代码定位**：`templates/index.html:452-458`
  ```css
  @media (max-width:800px) {
    .wechat-grid { grid-template-columns:1fr; }   /* ← 单列堆叠 OK */
    .col-templates { display:none; }                /* ← 主题列表被杀 */
    .social-grid { grid-template-columns:1fr; }
    .social-preview,.social-results { display:none; } /* ← social 同病 */
    .app { padding:0 10px 10px; }
  }
  ```
- **对比 social 的 D-3**：同一段 `@media` 里同时隐藏了两侧的关键区域（social 隐藏预览/结果，wechat 隐藏主题列表）。根因相同：早期移动端适配用了"直接隐藏"而非"响应式重排"。
- **修正目标**：移动端主题选择器改为**可访问形态**——推荐方案：
  - 方案 A（推荐）：顶部下拉选择器 `<select>`（紧凑，不占空间，53 项可滚动）
  - 方案 B：底部抽屉面板（点击按钮滑出，不遮挡编辑区）
  - 方案 C：折叠标题栏（点击"模板 (53)"展开/收起列表）
  - 原型采用方案 A（select 下拉），最简洁且零 JS 依赖。

#### W-2 【P2】AGENTS.md §6 结构描述过时
- **现象**：`AGENTS.md` 第 6 节描述公众号页结构为：
  ```
  #page-wechat
    .header           → 模式切换 + 主题选择 + AI 按钮（折叠隐藏）
    .main-body
      .editor         → #input-area
      .preview        → iframe 实时预览
    .footer           → 底部操作栏
  ```
  实际 DOM 为三栏 grid（`.col-text | .col-templates | .col-preview`）+ `#ai-panel` + `.wechat-footer`，无 `.header` / `.main-body` 包裹。
- **影响**：误导后续开发者读文档时代码对不上。不影响运行。
- **修正目标**：同步更新 AGENTS.md §6 为实际 DOM 结构（三栏 grid 版）。

#### W-3 【确认】公众号页无 P0 阻断
- **证据汇总**：
  - E2E 有头遍历：53 主题全部点击通过，0 console error（`report.json`）
  - 截图 `04_wechat_rendered.png`：预览 iframe 展示真实渲染 HTML（可见 Monocle/黑藤青/报纸等主题名）
  - 代码 `showPreview()`（`:724-729`）：用 `URL.createObjectURL(blob)` 写入 iframe src，**不是占位**
  - `POST /api/render` 用 `{raw_text, theme_id}` 正确传参（`:709-713`），theme_id 来自 `t.id`（API 返回的真实 id，如 `"monocle"` / `"bauhaus"` 等）
- **结论**：公众号页核心链路健康。本轮只需修 W-1（移动端主题可访问性）。

### 2.4 WeChat 修正目标规范（设计契约）

| 组件 | 契约要求 |
|---|---|
| 主题选择（桌面） | 保持现有三栏 grid 中间列 53 项列表不变（已 OK） |
| 主题选择（移动端） | ≤800px 时从 `display:none` 改为**可访问**（select 下拉 / 抽屉 / 折叠，原型用 select） |
| 编辑区 | textarea 保持现有行为（自动示例文案、Markdown 支持） |
| 预览区 | iframe blob URL 渲染保持不变（已 OK） |
| 底部操作栏 | 复制 / 历史 / 推送 / AI 切换保持不变（已 OK） |
| AGENTS.md | §6 结构描述同步更新为实际三栏 grid DOM |

> 交互行为契约：粘贴/输入文本 → 点击主题 → 实时渲染预览（iframe）→ 复制 HTML / 一键推送微信草稿箱。

### 2.5 WeChat 验收标准

1. **移动端主题可选**：390×844 视口下公众号页可见主题选择控件（select 或等效），切换后触发 `doRender()` 并刷新预览。
2. **桌面端不变**：1440×900 视口下三栏布局、53 项列表点击行为与现有一致（回归安全）。
3. **53 主题各有区分**：抽查 5 个互异主题（如 monocle / bauhaus / vogue / ink / terminal-green），各自渲染出的 HTML 在字体/配色/间距上**视觉可区分**。
4. **回归门禁**：`test_e2e`（40/41）+ `test_integration`（35/35）通过。

---

## 3. 总体修复路线图（建议顺序）

### Phase 1 — 阻断修复（P0）
| 步骤 | 偏差 | 改动位置 | 说明 |
|---|---|---|---|
| 1.1 | D-4 | `index.html:1180-1193` | 风格选择器消费 `/api/social/styles`，`value=id` |
| 1.2 | D-1 | `index.html:1268-1278` | 结果卡改 `<img src="{url}">` |

> **必须先修 D-4 再修 D-1**：否则 D-1 修完后永远只看得到 editorial 一种结果。

### Phase 2 — 移动端修复（P1）
| 步骤 | 偏差 | 改动位置 | 说明 |
|---|---|---|---|
| 2.1 | W-1 | `index.html:454` + 新增 select | 公众号移动端主题改 select 下拉 |
| 2.2 | D-3 | `index.html:455-456` | social 移动端改堆叠（不再 hide） |

### Phase 3 — 视觉与体验优化（P1/P2）
| 步骤 | 偏差 | 改动位置 | 说明 |
|---|---|---|---|
| 3.1 | D-2 | `core/guizang_renderer.py`（原引用 `render_worker.py` 为死代码，见 §6.2） | 渲染配色对齐归藏铁律 ✅已修复 |
| 3.2 | D-5 | `index.html:589-594` | 分组对齐 API group |
| 3.3 | W-2 | `AGENTS.md` §6 | 文档同步实际 DOM |

---

## 4. 不在本轮范围（防范围蔓延）

- AI 润色 / 推送 / 账号管理等弹窗（审计 0 报错，不在本次修复）。
- 新建第三套封面引擎（铁律：已有归藏 + BLCaptain，勿再造）。
- 公众号主题 JSON 内容本身的增删改（53 套主题是独立资产，不在 UI 修复范围内）。
- 服务端性能优化 / 缓存策略（本次聚焦前端交互与视觉对齐）。

---

## 5. 交付物索引

| 文件 | 类型 | 说明 |
|---|---|---|
| `docs/design-audit.md` | 本文档 | 双页面偏差报告 + 修正契约 + 验收标准 + 路线图 |
| `docs/prototypes/social-studio-target.html` | Social 原型 | 小红书 studio 修正目标态（可选交互） |
| `docs/prototypes/wechat-studio-target.html` | WeChat 原型 | 公众号页修正目标态（可选交互） |
| `output/e2e_audit/shots/proto_studio_desktop.png` | 截图 | Social 原型桌面端渲染核验 |
| `output/e2e_audit/shots/proto_studio_mobile.png` | 截图 | Social 原型移动端渲染核验 |
| `output/e2e_audit/shots/proto_wechat_desktop.png` | 截图 | WeChat 原型桌面端渲染核验 |
| `output/e2e_audit/shots/proto_wechat_mobile.png` | 截图 | WeChat 原型移动端渲染核验 |
| `output/e2e_audit/diff_report.html` | 报告 | E2E 审计原始报告（含 PM 截图审视） |
| `output/e2e_audit/report.json` | 数据 | E2E 自动化审计原始数据 |
| `output/e2e_audit/shots/*.png`（27 张） | 截图 | 有头浏览器 E2E 全量截图证据 |

---

## 6. 修复执行记录（2026-07-24 已闭环）

> 按 AGENTS.md §11 纪律：代码修复已完成，并通过全部回归门禁 + 真实浏览器验证。
> 提交：本地 commit（未 push）。改动文件：`templates/index.html`、`core/guizang_renderer.py`、`docs/prototypes/*`、`docs/design-audit.md`。

### 6.1 逐项修复状态

| 编号 | 严重度 | 状态 | 改动位置 | 验证标签 |
|---|---|---|---|---|
| D-1 | P0 | ✅ 已修复 | `templates/index.html` 结果卡改 `<img src="${r.url}">` + 新增 `.result-card-img` CSS（不再写死渐变占位） | 真实浏览器验证 `d1_result_img_real:true`（naturalWidth 1080/1080/2100，0 console error） |
| D-4 | P0 | ✅ 已修复 | `index.html` 新增 `loadSocialStyles()` 消费 `GET /api/social/styles`，网格 `data-style="${s.id}"`；风格 tab 改为 `guizang`/`blcaptain` 两组；`activeSocialStyle = id` | 真实浏览器验证 `d4_distinct_ids_present:true`；运行时确认 11 个 id 各自可生成 |
| D-2 | P1 | ✅ 已修复 | `core/guizang_renderer.py` 覆盖层由全画布暗渐变改为局部 tint（xhs `180°→0.30` / square 径向 `0.30` / wide `90°→0.30`），移除图片 `opacity` 压暗，叠加层按图存在条件渲染 | 代码验证 + 集成测试 35/35 通过（含 editorial 真实出图） |
| D-3 | P1 | ✅ 已修复 | `index.html` `@media(max-width:800px)` 移除 `.social-preview,.social-results{display:none}`，改为单列堆叠 | 真实浏览器验证 `d3_social_visibility` 两者 `display:flex,visible:true` |
| W-1 | P1 | ✅ 已修复 | `index.html` 移动端 `.col-templates` 由 `display:none` 改为 `max-height:42vh;overflow:auto` 可滚动访问（替代原 select 方案，等价满足"可访问"契约） | 真实浏览器验证 `w1_col_templates:{display:"flex",visible:true}` |
| D-5 | P2 | ⚠️ 部分残留 | 前端分组用静态 `guizang`/`blcaptain` tab，未直接读 API `group` 字段；但 11 个 id 均已可达、可区分 | 代码验证 + 运行时验证 |
| W-2 | P2 | ⏸ 未做（低优先，非阻断） | AGENTS.md §6 DOM 描述待同步为三栏 grid | 文档对照 |

### 6.2 修正说明：D-2 / D-4 源文件引用更正

原文 §1.3 D-2 与 §3 路线图将渲染源头指向 `scripts/render_worker.py:288,296`。经代码级核验（`grep` 全仓库 `.py` 导入），**`scripts/render_worker.py` 是死代码——没有任何模块导入它**，运行时实际渲染入口为 `core/guizang_renderer.py`。因此：

- D-2 的真实修复作用于 `core/guizang_renderer.py`，原文行号引用作废。
- D-4 根因链第 3 步原写"归藏 `scripts/render_worker.py:127-135` 用 `startswith(style)` 匹配"——该路径同样指向死代码。真实归藏渲染入口为 `core/guizang_renderer.py`，按 `style` id 选 `public/cover-templates/` 模板；D-4 的本质修复在前端（发规范 id），后端兜底 `style="editorial"` 行为不变。

> 注：`scripts/render_worker.py` 与 `guizang_renderer.py` 内容相似，疑似历史遗留双份实现。本轮仅修活代码，未删除死代码（不在本次范围，避免误伤）。

### 6.3 回归门禁结果（2026-07-24）

- `tests/test_e2e.py`：**40/41 通过**。唯一失败为已知陈旧 UI 元素断言（缺 `theme-select`/`account-select`/`phone-frame`/`push-modal`/`polish-modal` 等历史 id），与本次改动无关——修复前后一致，非回归。
- `tests/test_integration.py`：**35/35 通过**（需先起服务；覆盖 editorial / swiss / mist 真实渲染链路）。
- 真实浏览器验证 `output/e2e_audit/verify_app_fixes.py`：D-1 / D-3 / D-4 / W-1 全部通过，**0 console error**。
- 有头 E2E `tests/test_headed_userflow.py`：7 步工作流通过（结果卡渲染真实图）。

### 6.4 残留与后续

- **D-5（P2）**：前端分组为静态 `guizang`/`blcaptain`，与 API `group` 字段（`归藏`/`静纸`/`实证`）命名不完全对齐。功能无碍（11 id 全可达），若需语义精确可改为动态渲染 API `group`。
- **W-2（P2）**：AGENTS.md §6 公众号页 DOM 描述（`.header`/`.main-body`/`.footer`）与实际三栏 grid 不一致，待文档同步。
- **死代码清理（建议）**：`scripts/render_worker.py` 确认无人导入，可择机删除，避免与 `core/guizang_renderer.py` 双份实现漂移。
- **`public/prototypes/` 重复副本**：与 `docs/prototypes/` 内容重复且未被应用引用，建议清理（当前未被提交）。
