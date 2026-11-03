# 小红书标题图 · 需求汇总（单模块）

> **本文是什么**：把散在十几份文档里的「小红书标题图」需求收成一份**可查、可勾、可追溯**的台账。
> **不是什么**：不是设计方案（论证在各 `design-*.md`），不是进度汇报（版本/门禁看 `STATE.md`）。
>
> **当前阶段（2026-11-03）**：**先做可交互 HTML 原型，产品代码（`pwa/src/cover/`）暂不动。**
> 所以本文**已经拍板的**照做、**还没定的**统一收在 §6 等原型评审后再决策 —— 本文不替你选方向。
>
> **口径**：凡「现状」一律以当前源码为准（行号可查）；凡「目标」一律注明出处文档与章节。
> 文档与代码冲突时以代码为准，并把冲突登记在 §8。

---

## 1. 文档地图（哪些文档在讲标题图，哪些还有效）

### A. 现行有效（照这份排期）

| 文档 | 讲什么 | 有效性 |
|---|---|---|
| `requirements-three-modules.md` | 三板块现状实测 + 缺口表 T-1…T-5 + 排期建议 | 现状数字基本可靠；**§2.1 有三处数字过期**（见 §8） |
| `design-module-split-ia.md` | 三顶级模块 IA：公众号排版 / 小红书标题图 / 小红书长图文 | **已落地**（`pwa/index.html:36/38/40`、`:227/228`） |
| `design-xhs-studio-final.md` | 「设计方案 V2」：三栏 236/684/520、26 版式、20 配色三族、九宫格逐格预警、8 条交互约定、落地清单 | **原型已出，产品未落地** |
| `design-xhs-canvas-ux.md` | 「单画布 UX」：画布占屏 68%、四颗胶囊、出片托盘；A/B/C 三版对比 | **等决策**；§2.1 布局自述作废，§5/§6/§7 仍有效 |
| `handoff-xhs-studio-redesign.md` | 交接手册：B1–B8 缺陷台账、Phase 3 搬移项、验证方法 | 手册性质，B1/B2 已修（见 §4） |
| `ux-spec-xhs-studio.md` | 体验规范：搜图五态、375 布局、无障碍、**C1–C24 验收清单** | **验收口径唯一真源** |
| `design-xhs-studio-redesign.md` | V1 主方案：§4 搜图、§5 十二版式、§7 数值、§11 底图可读性判定口径、§12 四项增强 | §3（双路径 IA）已被 `design-module-split-ia.md` 取代，其余有效 |
| `review-xhs-studio-adversarial.md` | V1 对抗复核 P0-1…P0-5 / P1-1…P1-7 + §7 四件待拍板 | 复核记录，问题仍然成立 |

### B. 数据底稿 / 调研 / 决策留档

- `design-xhs-photo-luminance.md` —— 底图亮度实测（6 图 × 10 带），是 design §11 的数据来源
- `research-2026-10-30-xhs-text-card-competitors.md` —— 竞品结构（内页/封面/导出三 Tab）
- `NIGHT-REPORT-2026-10-31.md` —— 三项拍板的原始批复与右栏重排结论
- `spec-cover-layout-skeleton.md`、`plan-cover-module-2026-10-25.md`、`cover-style-spec.md`、`design-cover-gallery.md` —— 版式骨架单文件规范与更早一轮的模块方案
- `open-tasks-2026-11-01.md` —— 全项目未完成台账（标题图相关散落在其中）

### C. 原型（可交互参照）

| 原型 | 判定 |
|---|---|
| `prototypes/v3/index.html` → `concept-a-three-col.html` / `concept-b-canvas.html` | **本轮（2026-11-03）新出的骨架对比**：同一渲染内核、同一行为代码，只比 C-1 骨架 / C-2 版式数量 / C-7 结果区 / C-8 历史入口。两版都可交互 |
| `prototypes/v2/title.html`（+ `v2-shared.js` / `v2-data.js`） | **V2 定稿原型**，与 design-xhs-studio-final 对应；v3 复用的是它的内核与数据 |
| `prototypes/xhs-studio-redesign.html` | V1 主原型（12 版式 C1–C6 / T1–T6），B1/B3/B4/B5 修复都在这里验证过 |
| `prototypes/ux-a-three-col.html` / `ux-b-rail.html` / `ux-c-dual-band.html` | 单画布 A/B/C 三版，**等决策** |
| `prototypes/xhs-canvas-ux.html` | 已被用户否决（「又极简过头了，啥都弹窗了」）—— **保留作反例，勿再作为落地方向** |

---

## 2. 用户原话（需求的最上游，不要转述）

出处：`handoff-xhs-studio-redesign.md` §1、`design-module-split-ia.md` §1。

| # | 原话要点 | 硬约束 |
|---|---|---|
| R1 | 文字和底图区分不开；正文字体太小，手机看不清 | 底图上的文字必须有可靠保护；正文手机端可读 |
| R2 | 页面太复杂，一上来就懵；用户要的是最快出标题图 | 首屏极简 |
| R3 | 「搜图这个可以置顶，这是我们的特色功能」 | 联网搜图必须在首屏，不能埋进三级菜单 |
| R4 | 「先做方案和 html 原型图可交互的，别急着动手」 | **禁止**在原型获批前改 `pwa/src` |
| R5 | 原型顶栏必须匹配系统原导航 | 已落地为三个平级 tab |
| R6 | 标题图/长图文要标明是「小红书」的 | 顶栏文案全称不可缩词：公众号排版 / 小红书标题图 / 小红书长图文 |
| R7 | 「选图之后要不断切不同版式看预览、切字体、切配色」 | **高频控件必须常驻**，不能关进弹层 |

---

## 3. 现状能力快照（源码实测，2026-11-03）

| 维度 | 现状 | 证据 |
|---|---|---|
| 页面形态 | 三栏 grid：`clamp(280,21vw,320)` / `1fr` / `clamp(460,34.5vw,520)` | `cover.css:.cv-stage` |
| 左栏 | 一句话输入（≤500 字）→ 配图方式三按钮（搜图/传一张/不要图）→ 保存大图 → 「⚙ 调整」抽屉（字体 / 文字玩法 / 署名 / 尺寸） | `title-page.js` `mountTitlePage()` |
| 中栏 | 实时预览 → 「标题图结果」画廊（`#cv-gallery`）→ 空态 → 示例成品墙 | 同上 |
| 右栏 | 风格卡：9 张版式卡 + 卡内色点 | `catalog.js: LAYOUTS`（9 张） |
| 尺寸 | 3 种：3:4 1080×1440 / 1:1 1080×1080 / 21:9 2100×900 | `catalog.js: COVER_SIZES` |
| 风格数据 | `ALL_STYLES` = 归藏 3（editorial / swiss / bigtype）+ 模板 10（2 版式 × 5 色）+ 版式 12（4 版式 × 3 色板）= **25 个 style** | `catalog.js:102` |
| 版式（卡片身份） | 9 张：图文封面 / 杂志封面 / 金句 / 大字版 / 清单 / 编号大字 / 瑞士封面 / 杂志模板 / 瑞士模板 | `catalog.js:106` |
| 色板（版式内） | 3 套：暖纸 / 墨夜 / 亮橙 | `catalog.js: LAYOUT_PALETTES` |
| 字体 | **4 款**：跟随模板 / 思源黑体 / 思源宋体 / 得意黑（后 3 款里得意黑为按需加载） | `textmode.js: TEXT_FONTS` |
| 文字玩法 | **7 种**：默认 / 大字压阵 / 竖排 / 错位 / 逐字变色 / 描边 / 错行 | `textmode.js: TEXT_MODES` |
| 底图可读性 | `analyze.js` 分带实测 + `alphaForL()` sRGB 反解 + `MAX_ALPHA = 0.30` + `unfit` 判不合格 | `analyze.js:53/62/143-186` |
| 导出 | 单张 PNG（保存大图）+ 九宫格切图（`pwa/src/nine.js: splitGrid`） | `title-page.js` / `nine.js` |
| 偏好存储 | `supersu.cover.prefs.v1` | `title-page.js:19` |
| 隐私清理 | `clearSupersuStorage()` 按 `supersu.` 前缀统一清除 + 删后自检残留 | `app.js:60` / `app.js:2138` |
| 导航 | 三 tab 互斥（`#btn-editor` / `#btn-cover` / `#btn-longform`） | `pwa/index.html` + `cover/index.js: showPage()` |

---

## 4. 已经拍板、且已经落进产品代码的（不要再提）

| # | 决定 | 证据 |
|---|---|---|
| D1 | 三顶级模块 + 顶栏三 tab，长文页与标题图页状态、结果区、存储键各自独立 | `design-module-split-ia.md` 全文；`cover/index.js`、`title-page.js`、`longform-page.js` 三文件拆分 |
| D2 | 配图三态（搜图 / 传一张 / 不要图）平级大按钮，搜图排第一 | `title-page.js` `#cv-modes` |
| D3 | 署名回归「⚙ 调整」抽屉，不再做跨面板共享字段 | `title-page.js` `#cv-author` |
| D4 | 底图文字保护：scrim 只压文字带、α 由亮度反解、上限 0.30、压不住就判 `unfit` 提示换图 | `analyze.js` |
| D5 | 九宫格是独立工具（可切任意图），入口在预览条常驻，不在结果区 | `title-page.js` `#cv-nine-pick` |
| D6 | 400× 之前的「12 风格」宣传口径作废 | `requirements-three-modules.md` §2.2 |
| D7 | 不给「遮罩浓度 0–100%」滑块 | `design-xhs-studio-redesign.md` §3、`design-xhs-canvas-ux.md` §10 |
| D8 | 尺寸只用真系统那三个（3:4 / 1:1 / 21:9），不使用原型早期的 4:5 / 1242×1660 | `handoff-xhs-studio-redesign.md` §11 第 5 条 |
| D9 | `clearAll()` 按 `supersu.` 前缀统一清除，不再维护手写清单 | `app.js:60` |

---

## 5. 需求条目台账

> 状态取值：**已落地** / **待落地** / **待决策** / **已否决**。
> 优先级沿用 `requirements-three-modules.md`：P0 阻断级体验 / P1 该做 / P2 可选。

### 5.1 信息架构与首屏

| # | 需求 | 状态 | 出处 |
|---|---|---|---|
| T-IA-1 | 标题图独立顶级模块，首屏不出现任何长文概念 | 已落地 | `design-module-split-ia.md` §3/§4 |
| T-IA-2 | 首屏只保留：输入 / 配图三选 / 预览 / 保存 / 调整 | 待落地（现状还有结果画廊 + 示例墙占位） | `design-xhs-studio-redesign.md` §3 |
| T-IA-3 | 首屏可交互元素 ≤12 个（桌面），Tab 站 ≤16 | 待落地 | `ux-spec-xhs-studio.md` C1/C4 |
| T-IA-4 | 首屏不出现「解释产品自己」的文案 | 待落地 | `ux-spec-xhs-studio.md` C2 |

### 5.2 输入

| # | 需求 | 状态 | 出处 |
|---|---|---|---|
| T-IN-1 | 一句话输入，上限 500 字，实时计数 | 已落地 | `title-page.js` `#cv-text` / `#cv-count` |
| T-IN-2 | 首行 = 大标题，其后行 = 小字；**规则写进 placeholder** | 已落地 | `title-page.js` placeholder |
| T-IN-3 | 「用正文」从公众号排版页带入 | 已落地 | `title-page.js` `#cv-use-main` |
| T-IN-4 | 输入区 `min-height 88 / max-height 190`，超出自身滚动 | 待落地（V2 口径） | `design-xhs-studio-final.md` §4.1 |

### 5.3 配图（特色功能）

| # | 需求 | 状态 | 出处 |
|---|---|---|---|
| T-IMG-1 | 三态平级：搜图 / 传一张 / 不要图 | 已落地 | `title-page.js` `#cv-modes` |
| T-IMG-2 | 搜图五态齐全：未配 Key / 搜索中 / 有结果 / 无结果 / 失败超时，每态都有退路 | 待验收（设计已定，需按 C9–C13 逐条核） | `ux-spec-xhs-studio.md` §4、C9–C13 |
| T-IMG-3 | 未配 Key 时不置灰、不弹 toast，就地说明 + 配置入口 | 待验收 | 同上 C9 |
| T-IMG-4 | 关键词从标题自动提取（复用 `ZH_EN` 词表），并提示「已从标题自动填入」 | 待落地 | `design-xhs-studio-redesign.md` §4、C7 |
| T-IMG-5 | 图源仅 Pexels 一家（BYOK），Wikimedia / Pixabay 已移除 | 已落地 | `AGENTS.md` §9 |
| T-IMG-6 | 最近用过的最多 8 张，一排 4 个，点即换 | 待落地 | `design-xhs-studio-final.md` §4.2 |

### 5.4 底图可读性

| # | 需求 | 状态 | 出处 |
|---|---|---|---|
| T-RD-1 | 目标对比度 4.5:1（取严，不按字号分级） | 已落地 | `design-xhs-studio-redesign.md` §11.1；`analyze.js` |
| T-RD-2 | 四种判定：免压暗白字 / 免压暗黑字 / 轻压暗 + α / 判不合格 | 已落地 | 同 §11.2；`analyze.js` |
| T-RD-3 | scrim 混色在 sRGB 空间反解，`MAX_ALPHA = 0.30`，超限不压只提示换图 | 已落地 | `handoff-xhs-studio-redesign.md` B1 |
| T-RD-4 | 文字带由文字块反推，不用常量 62% | 已落地（原型侧）；真系统按 B5 搬移 | 同 B5 |
| T-RD-5 | 压在照片上的字加极淡投影（`0 1px 18px rgba(8,7,6,.34)`），scrim 管 90% | 待落地 | `design-xhs-canvas-ux.md` §5 |
| T-RD-6 | 左栏有可读性明细块（判定 + 已加压暗比例 + 换图建议），不藏在信息条 | 待落地 | `design-xhs-studio-final.md` §4.3 |

### 5.5 版式

| # | 需求 | 状态 | 出处 |
|---|---|---|---|
| T-LAY-1 | 12 种版式两组：图文 C1–C6（刊头照片带 / 全出血 / 左文右图 / 上下分栏 / 卡片浮层 / 安静区）+ 纯文字 T1–T6（杂志刊头 / 瑞士极简 / 大字报 / 金句 / 编号大字 / 清单） | 待落地（真系统现为 9 张卡） | `design-xhs-studio-redesign.md` §5 |
| T-LAY-2 | V2 目标口径：26 套版式，编号唯一，现有 7 套永远排最前 | 待决策（与 T-LAY-1 的 12 种是两套口径） | `design-xhs-studio-final.md` §6.1/§6.4 |
| T-LAY-3 | 可见性单入口 `layVisible(l, hasPic) = !l.needImg \|\| hasPic` | 待决策（`review-xhs-studio-adversarial.md` §7 第 2 条待你确认） | 同 §6.4 |
| T-LAY-4 | 有图 26 套 / 无图 16 套，头部留「另有 8 套要图 →」，点它是**去选图**而不是配 Key | 待决策 | 同上 |
| T-LAY-5 | 不满足前提的版式**置灰但保留**并给原因（如「清单要 2 条以上小字」） | 待落地 | 同 §6.5 |
| T-LAY-6 | 版式缩略图用**用户自己的文案**实时渲染，缩放比运行时量容器宽度 | 待落地 | `design-xhs-canvas-ux.md` §2.3 |
| T-LAY-7 | 高频切换的版式区一屏至少露出 3 行 / 12 个 | 待落地 | `design-xhs-studio-final.md` §2/§11 第 6 条 |
| T-LAY-8 | 「全部版式」全屏总览入口（6 列） | 待决策 | `review-xhs-studio-adversarial.md` §7 第 1 条 |

### 5.6 配色

| # | 需求 | 状态 | 出处 |
|---|---|---|---|
| T-PAL-1 | V2 口径：20 套配色分三族（纸感 9 / 浓郁 6 / 暗夜 5） | 待落地（现状 3 套色板 + 10 套模板自带色） | `design-xhs-studio-final.md` §7.2 |
| T-PAL-2 | 每套版式的配色里必须有「纸感 + 暗夜」各一 | 待落地 | 同 §7.3、§11 第 5 条 |
| T-PAL-3 | 色块上的字：`inkOn()` 黑白各算一遍取高，`accentText` / `blockInk` 由脚本反解不手填 | 待落地 | 同 §7.4 |
| T-PAL-4 | 对比度门限：正文 ≥7、强调小字 ≥4.5、色块文字 ≥4.5、次要字 ≥4.5 | 待落地（可脚本校验） | 同 §7.4 表、§13 |
| T-PAL-5 | 配色独立成行，不做卡内小色点 | 待决策（V2 主张；现状是卡内色点） | 同 §11 第 4 条 |
| T-PAL-6 | 缩略图底色去重率 ≥60%，防「一堵同色墙」 | 待落地（可机检） | 同 §13 第 5 条 |
| T-PAL-7 | 多巴胺色族「当默认太花」需修正 | 待落地 | `requirements-three-modules.md` T-3 |

### 5.7 字体 / 文字玩法 / 位置

| # | 需求 | 状态 | 出处 |
|---|---|---|---|
| T-TXT-1 | 标题排法只保留 3 档：默认 / 大字压阵 / 竖排 | 待决策（现状 7 种；design 口径为「只保留 2 种 + 默认」） | `design-xhs-studio-redesign.md` §5 |
| T-TXT-2 | V2 口径：字体 10 款、玩法 7 种、位置 4 档 + 磨砂 | 待决策（现状字体 4 款） | `design-xhs-studio-final.md` §8 |
| T-TXT-3 | 字体胶囊不得小于 13px；玩法/位置用 12px | 待落地 | 同 §8 |
| T-TXT-4 | 竖排必须给 `max-height`（78%）并右侧展开 | 已落地（真系统踩过并修） | `design-xhs-studio-redesign.md` §5 |
| T-TXT-5 | 字体按需加载进 Cache Storage（约 7.5MB 重复下载） | 待落地（P2） | `requirements-three-modules.md` T-4 |

### 5.8 尺寸

| # | 需求 | 状态 | 出处 |
|---|---|---|---|
| T-SZ-1 | 3 种尺寸：3:4 / 1:1 / 21:9 | 已落地 | `catalog.js: COVER_SIZES` |
| T-SZ-2 | 尺寸控件下补一行小字写实际像素 + 用途 | 待落地 | `handoff-xhs-studio-redesign.md` U5 |

### 5.9 预览 / 结果 / 导出

| # | 需求 | 状态 | 出处 |
|---|---|---|---|
| T-OUT-1 | 实时预览即成品，不点生成也能看 | 已落地 | `title-page.js` |
| T-OUT-2 | **删除重复呈现**：「实时预览」与「标题图结果」是同一张图的两次展示，删下半部分 | 待落地 | `design-xhs-canvas-ux.md` §1、`design-xhs-studio-final.md` §12 |
| T-OUT-3 | 保存改两段式：定影动画 → 出片托盘（写明尺寸/体积）→ 用户自己点下载 | 待落地 | `design-xhs-canvas-ux.md` §3 |
| T-OUT-4 | 托盘不自动消失（约 9 秒），且画布必须让位（`padding-bottom`） | 待落地 | 同 §3 |
| T-OUT-5 | 九宫格打开即逐格算内容覆盖率，不足 3 格出黄条预警 | 待落地（`pwa/src/nine.js` 目前无覆盖率判定） | `design-xhs-studio-final.md` §9 |
| T-OUT-6 | 「把标题放大铺满」一键复用 `tmode = poster`，不新造九宫格版式 | 待落地 | 同 §9 |
| T-OUT-7 | 九宫格专用版式（切出 9 张都好看）是否需要 | 待决策（用户曾表示「要专用版式」） | `requirements-three-modules.md` T-2、`review-xhs-studio-adversarial.md` §7 第 3 条 |
| T-OUT-8 | 空标题时不输出占位文字图（禁用或提示） | 待验收 | `ux-spec-xhs-studio.md` C23 |
| T-OUT-9 | 导出/保存任何时刻都在 1 次滚动范围内；手机端常驻底部 | 待验收 | 同 C8 |

### 5.10 存储 / 隐私

| # | 需求 | 状态 | 出处 |
|---|---|---|---|
| T-SV-1 | 标题图偏好存 `supersu.cover.prefs.v1`，与长文键分家 | 已落地 | `title-page.js:19` |
| T-SV-2 | `clearAll()` 清全部 `supersu.` 前缀键（含 Key 明文）+ 删后自检 | 已落地 | `app.js:60/2138` |
| T-SV-3 | 建一张存储键登记表，新增键必须登记 | 待落地 | `design-xhs-studio-final.md` §12 |
| T-SV-4 | 历史记录（`supersu.cover.history.v1`）入口从 ⋯ 菜单进 | 待决策 | `design-xhs-canvas-ux.md` §11 |

### 5.11 响应式 / 无障碍

| # | 需求 | 状态 | 出处 |
|---|---|---|---|
| T-RS-1 | 断点 3 档：≥1281 三栏 236/flex/520；981–1280 版式 4 列可滚；≤980 单栏 + 底部页签 | 待落地 | `design-xhs-studio-final.md` §3.1 |
| T-RS-2 | 窄屏顺序：输入 → 配图 → 搜图 → 预览 → 构图 → 调整，无横向滚动 | 待验收 | `ux-spec-xhs-studio.md` C14 |
| T-RS-3 | 可点元素命中区 ≥44×44 | 待验收 | 同 C15 |
| T-RS-4 | 输入控件 `font-size ≥16px`（防 iOS 聚焦放大） | 待验收 | 同 C16 |
| T-RS-5 | 灯箱 Esc 关闭 / Tab 不逃出 / 关闭后焦点回到触发元素 | 待验收 | 同 C19 |
| T-RS-6 | 无无名按钮、状态变化走 live region、对比度达标 | 待验收 | 同 C20–C22 |
| T-RS-7 | 键盘：输入 → 搜图 → 选图 → 换版式 → 保存，全程不迷失焦点 | 待验收（C18 已按「不改 DOM」裁定放宽） | 同 C18、`design-xhs-studio-redesign.md` §12.6 |

---

## 6. 需要先定方向、再谈落地的（本轮先做原型，评完再选）

> 这些是**方案之间互相冲突**的地方，不是缺细节。逐条给冲突点与备选，等原型评审后由项目所有者裁定。
> 本表不替用户选择。

| # | 冲突 | 备选 |
|---|---|---|
| C-1 | **页面骨架**：V2 三栏常驻（236/684/520）vs 单画布（命令栏 + 画布占 68% + 胶囊弹层） | A 三栏 / B 单侧集成栏 / C 双带环绕 —— 见 `design-xhs-canvas-ux.md` §0.2；第一版「全弹窗」已被否决 |
| C-2 | **版式数量与呈现**：12 种（C1–C6 / T1–T6）vs 26 套（产品 7 + 配方 19） | 12 强调「一看就懂」；26 强调「够用」但需密度两档 |
| C-3 | **可见性判据**：没配图 API 就只显示纯文字版式（原话）vs 有图就出图文版式（修订） | 修订能解开「上传了自己的图却看不到图文版式」的死结 |
| C-4 | **配色口径**：3 套色板（现状）vs 20 套三族（V2）vs 每版式 4 套 | 20 套需同步做对比度反解与去重率门禁 |
| C-5 | **字体 / 玩法数量**：4 款字体 + 7 玩法（现状）vs 10 款字体 + 3 玩法（V2） | 10 款字体需补字体子集与按需加载 |
| C-6 | **九宫格**：预警 + 一键铺满（复用现有能力）vs 九宫格专用版式（新功能） | 后者需独立设计内容分布 |
| C-7 | **结果区存废**：保留「标题图结果」画廊 vs 只留预览 + 出片托盘 | 现状是同一张图展示两次 |
| C-8 | **历史记录入口** | ⋯ 菜单 vs 结果区常驻 |

---

## 7. 明确不做（已否决，勿捡回）

- 公众号推送（`cd0668d` 已删）；编辑器贴图已恢复但推送不做
- 首屏常驻新手引导
- 把长图文配色并入标题图的配色表
- 「遮罩浓度 0–100%」滑块
- 长文正文草稿持久化
- URL 路由 / hash
- 在原型获批前改 `pwa/src`（R4）

---

## 8. 文档漂移清单（需要回头修文档的地方）

| # | 文档 | 问题 | 应改为 |
|---|---|---|---|
| S-1 | `requirements-three-modules.md` §2.1 | 写「字体 10 款」 | 实际 4 款（`textmode.js: TEXT_FONTS`）；10 款是 V2 目标 |
| S-2 | `requirements-three-modules.md` §2.1 | 写「文字玩法 4 种」 | 实际 7 种（`TEXT_MODES`） |
| S-3 | `requirements-three-modules.md` §2.1 | 写「版式 9 套」而 `ALL_STYLES` 为 25 个 style | 需区分「9 张版式卡」与「25 个 style（卡 × 色板）」两种计数 |
| S-4 | `requirements-three-modules.md` T-5 | 记为 P0 隐私缺口 | 已修：`app.js:60` 按前缀清除 + 删后自检 |
| S-5 | `requirements-three-modules.md` T-4 | 字体 7 款约 7.5MB | 当前只有得意黑一款按需加载（1.1MB 级），数字需按实际重算 |
| S-6 | `overview.md` §1/§2 | 仍写「12 风格 / 本地版 11 风格 / Wikimedia」 | PWA 现为 9 张版式卡 + 3 尺寸 + Pexels 单源 |

> 以上 6 条不在本会话的改动范围内（本会话只做标题图需求汇总 + 原型），需要时另开一轮统一修。

---

## 9. 下一步（本会话后续）

1. ~~在 §6 的 C-1…C-8 里挑出与原型形态相关的（C-1 / C-2 / C-7 / C-8），先做新一版可交互 HTML 原型给项目所有者看。~~
   **已完成 2026-11-03**：`docs/prototypes/v3/index.html` → `concept-a-three-col.html`（三栏常驻，26 套全在右栏）/ `concept-b-canvas.html`（单画布，12 套常驻底部横条）。
   两版共用 `v2/xhs-ux-core.js` + `v2/v2-data.js` + `v3/shared.js` + `v3/app.js`，**封面渲染逐像素一致**，差异只在骨架 / 版式数量 / 历史入口。
   实测（`scripts/cdp_measure.mjs`）：
   - 1440×900 三栏版 236 / 684 / 520，16 套落 6 列一屏放下；单画布版画布 491×654（占 82% 高）
   - 1280×900 三栏版 214 / 638 / 428，16 套 5 列，最后一行不溢出（-48px）
   - 375×812 两版横向溢出 **0 处**；三栏版在 <980px 折成「单页 + 底部 tab」（此时与单画布版体感接近）
2. **等方向选择**（三栏 / 单画布 / 两者都要改），选完再把 §5 的「待落地」逐条转成落地清单（沿用 `design-xhs-studio-final.md` §12 的文件级顺序）。
3. 落地后跑 `node pwa/scripts/build.mjs` + `python scripts/test_all.py` + `python scripts/doc_sync_check.py`。

---

*本文基于 2026-11-03 当前源码实测。若与代码冲突，以代码为准并回来更新本文。*
