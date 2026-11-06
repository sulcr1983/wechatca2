# 项目交接文档 — SuperSu（公众号排版 / 小红书标题图 / 小红书长图文）

> **这份文件回答什么**：三个业务板块各自「做到了什么、还差什么、踩过什么坑、接下来谁来做」。
>
> 📌 **本文件的数字口径**：涉及主题套数、版式数、门禁计数等**具体数字**，一律以
> [`STATE.md`](../../STATE.md) 为准（机器生成，禁止手改）。本文件写死的数字仅限
> **本文写作时（2026-11-06）实测所得的结构性事实**（文件数、行数、调用点行号），
> 已在每处标注来源与命令，便于复核。
>
> 📌 **本文的取证方式**：全部结论来自实读代码 / 实跑命令（`git`、`grep`、`wc`、`node`、`python`），
> **不是**从方案文档转述。凡无法从代码确认的，一律显式标注「**待确认**」。
>
> **配套阅读**：
> [`docs/INDEX.md`](../INDEX.md)（文档入口 · 未完成事项汇总）·
> [`HANDOFF.md`](../../HANDOFF.md)（全系统交接 · 坑清单）·
> [`AGENTS.md`](../../AGENTS.md)（工程规则唯一真源）·
> [`STATE.md`](../../STATE.md)（状态真源）
>
> **整理时间**：2026-11-06 · **代码基线**：`main` @ `c80c542`（443 提交，工作区干净）

---

## 目录

1. [项目概览](#1-项目概览)
2. [已完成内容](#2-已完成内容)
3. [未完成任务](#3-未完成任务)
4. [踩坑与经验](#4-踩坑与经验)
5. [遗留风险与后续建议](#5-遗留风险与后续建议)
6. [待确认清单](#6-待确认清单)

---

# 1. 项目概览

## 1.1 产品定位与形态

SuperSu 是一个**纯前端 PWA**（Cloudflare Pages 静态托管），把三件原本分散的事合成一个工具：

| # | 业务板块 | 用户动作 | 产物 |
|---|---|---|---|
| **A** | **公众号排版**（主线） | 粘贴文章 → 选主题/版式 → 复制到公众号 | 微信内联样式 HTML |
| **B** | **小红书标题图** | 一句话 + 底图 → 生成封面 | 1080×1440 等 3 尺寸 PNG |
| **C** | **小红书长图文** | 长文 → 自动分页 → 成套导出 | N 张卡片 + ZIP |

> ⚠️ **本地 Flask 版已于 2026-10-28 封存并移出工作区**（`app.py` / `templates/` / `tests/` /
> `data/` / `start-app.bat`）。取回方式见 [`ARCHIVE.md`](../../ARCHIVE.md)（tag `flask-v1-archive-2026-10-28`）。
> **仓库里不存在第二套后端结构** —— 遇到旧文档提到 `/api/render`、`127.0.0.1:5000`、
> `tests/test_e2e.py` 的，一律是已封存内容，**不要照着跑**。

**核心理念**：*纯文本进，排版出。不用 AI 就不开 AI。*
AI 能力（润色 / 摘要 / 结构规划 / AI 封面图）默认隐藏，按需展开，且全部 **BYOK**（用户自带 Key，存本机浏览器）。

**线上地址**：
- 主推 https://supersu.ccwu.cc（DNSHE ccwu.cc）
- 镜像 https://supersu-pwa.pages.dev（Cloudflare Pages 项目 `supersu-pwa`，生产分支 `main`）

---

## 1.2 技术栈

### 前端（无框架、无构建打包器）

| 层 | 选型 | 说明 |
|---|---|---|
| 语言 | **原生 ES Module + 原生 CSS** | 无 React/Vue/Tailwind，无 npm 依赖 |
| 渲染引擎 | **Pyodide 0.28.3**（WebAssembly Python） | 自托管 `pwa/public/runtime/`，**不引 CDN** |
| Service Worker | 手写原生（**不用 Workbox**） | `pwa/public/sw.js`，616 行，5 层缓存 |
| 字体 | 自托管 `.woff2` | 禁 Google Fonts（`build.mjs` 构建断言会拦） |
| 封面出图 | **modern-screenshot**（`public/vendor/`） | 离屏 iframe → PNG |
| ZIP 打包 | **fflate**（按需加载） | 九宫格 / 长图文导出 |

### 后端（已无。引擎跑在浏览器里）

- `core/format_engine.py`（3584 行）+ `core/preprocessor.py`（1006 行）+ `core/magazine_layouts.py`（1470 行）
- 构建时由 `pwa/scripts/build.mjs` 拷进 `pwa/dist/py/`，随 SW 缓存下发。

### 构建 / 门禁 / 发布

| 环节 | 工具 | 位置 |
|---|---|---|
| 构建 | Node ESM（`node:crypto` / `node:zlib` / `node:child_process` 内置） | `pwa/scripts/build.mjs`（930 行） |
| 部署 | Cloudflare Pages（`wrangler`） | `pwa/scripts/deploy.sh`（118 行） |
| 门禁编排 | Python | `scripts/run_gates.py`（641 行，唯一真源） |
| 一键全测菜单 | Python | `scripts/test_all.py`（174 行） |
| 发版编排 | Python | `scripts/release.py`（449 行） |
| 前置检查 | Python | `scripts/preflight.py`（282 行） |
| 状态生成 | Python | `scripts/gen_state.py`（317 行）→ `STATE.md` |

> 📌 **PWA 侧零 npm 依赖** —— 全仓库只有 `blcaptain-style-skill/package.json`（第三方 vendored 子项目，
> 已 gitignore）。`pwa/scripts/build.mjs` 自实现 zip 写入器（`zlib deflateRaw` + CRC32 表）。
>
> **Python 依赖**（`requirements.txt`）：`python-dotenv` / `requests` / `pillow` / `markdown`（引擎必需）/
> `playwright>=1.61`（**版本下限是硬要求**，低版本 clipboard 与 set_content 行为不一致会让复制/底图静默失败）/
> `fonttools` / `brotli`。

---

## 1.3 目录结构与核心模块划分

```
wechatca2/
├── core/                       ★ 排版引擎（PWA 与本地共用同一份真源）
│   ├── format_engine.py            3584 行 · 19 个版式注册表 · 微信 HTML 生成
│   ├── preprocessor.py             1006 行 · 纯文本 → Markdown（4 模式，零延迟零费用）
│   ├── magazine_layouts.py         1470 行 · 19 个杂志风版式函数
│   ├── browser_utils.py            浏览器回退链（系统 Chrome → Edge）
│   └── pwa_test_utils.py
├── public/
│   ├── themes/                 183 套主题 JSON（164 配色主题 + 19 整篇设计 kit）
│   ├── theme-thumbs/  kit-thumbs/   缩略图（生成物）
│   ├── cover-templates/        10 套封面模板（2 版式 × 各配色，独立完整 HTML）
│   ├── vendor/                 modern-screenshot / fflate（前端内联依赖）
│   └── images/  brand/  social-thumb/ …
├── pwa/                        ★ 主产品
│   ├── index.html              单页外壳（面板/DOM 由各模块自建）
│   ├── version.json            语义化版本（只在发版时改）
│   ├── src/
│   │   ├── app.js              2408 行 · 公众号排版主交互
│   │   ├── ai.js               AI BYOK：平台预设 + 润色/摘要/结构规划
│   │   ├── bridge.js           主线程 ⇄ Pyodide Worker 桥（Promise 化）
│   │   ├── engine.worker.js    Pyodide 运行时 Worker
│   │   ├── light.js            轻量即时预览（不解锁复制）
│   │   ├── editor-images.js    粘贴/上传 → 压缩 → data URI
│   │   ├── images.js           外链图本地化（data URI 内嵌）
│   │   ├── nine.js             九宫格切图（3×3）+ ZIP
│   │   ├── export.js           导出四件套（HTML / Markdown / 长图 PNG / 图片 ZIP）
│   │   ├── backup.js           本机数据备份/恢复（默认不导出 API Key）
│   │   ├── style.css           875 行 · 全部样式
│   │   ├── cover/              15 文件 · 小红书三模块（见 §1.4）
│   │   └── update/             4 文件 · 更新管理器 + 更新记录面板
│   ├── public/sw.js            Service Worker（5 层缓存）
│   └── scripts/                build.mjs · deploy.sh · gen_changelog.py · …
├── scripts/                    100 个脚本（门禁 / 审计 / 生成器 / 探针）
├── docs/                       ★ 文档与原型（7 个主题目录 + 归档区）
├── data/                       运行时数据（gitignore，Flask 版遗留）
└── STATE.md                    ★ 状态真源（生成物，禁止手改）
```

### 三个板块的代码关系

```
                  ┌─────────────────────── 共享底座 ───────────────────────┐
                  │  search.js（搜图）· analyze.js（底图可读性）· nine.js    │
                  │  export.js（导出）· backup.js（备份）· update/（更新）    │
                  └───────────────┬─────────────────────────┬──────────────┘
                                  │                         │
   ┌── A 公众号排版 ─────────────┴──┐              ┌── B/C 小红书 ──────────┴──┐
   │ app.js（2408 行）              │              │ cover/index.js（三 tab 壳）│
   │  ├ 抽屉（配色 tab / 整篇设计 tab）│              │  ├ title-page.js（标题图）│
   │  ├ LAYOUT_OPTIONS（15 项）      │              │  ├ longform-page.js（长图）│
   │  ├ 段落样式开关（3 种）         │              │  ├ cards.js（长图渲染引擎）│
   │  └ 设置弹窗 / 字号滑块 / AI 面板 │              │  ├ catalog.js（25 style） │
   │        ↓ bridge.js             │              │  ├ layouts.js templates.js│
   │   engine.worker.js（Pyodide）   │              │  └ render.js story.js     │
   │        ↓ core/format_engine.py │              └──────────────────────────┘
   │   183 套 themes JSON            │
   └───────────────────────────────┘
```

**关键设计事实（三条，别改错）**：

1. **拆的是产品面，不是代码面**。渲染管线、模板目录、搜图、可读性分析、分页算法**一份代码**，
   两个小红书模块各自的 UI 与状态。决策记录：`docs/xhs/design-module-split-ia.md`（R1–R6）。
2. **A 板块与 B/C 板块是两条独立管线**。A 走 `core/format_engine.py`；B/C 走 `pwa/src/cover/*`，
   不共用引擎，只共用主题数据与底座模块。
3. **小红书两模块状态完全隔离**：`supersu.cover.prefs.v1` vs `supersu.longform.prefs.v1`。

---

## 1.4 启动与本地运行

### 环境要求

- **Python 3.12+**（仓库自带 `.venv/`）
- **Node.js**（构建用）
- **系统 Chrome**（测试用，**禁止 `playwright install chromium`** —— 国内 183MB 会卡死）

### 日常开发

```bash
# 1) 构建（改了 pwa/src / core/ / public/themes 必须重跑）
node pwa/scripts/build.mjs

# 2) 本地预览（纯静态，无需后端）
python -m http.server 8899 --directory pwa/dist
#    → http://127.0.0.1:8899

# 3) 门禁
.venv/Scripts/python.exe scripts/run_gates.py          # 默认：按改动面选套件
.venv/Scripts/python.exe scripts/test_all.py --list     # 一键全测档位列表
```

> 📌 **改过 `pwa/src/`、`core/`、`public/themes/` 必须先构建**，否则门禁测的是旧产物
> （`pwa/dist/` 是 gitignore 的构建产物）。

### 首次打开需下 Pyodide（约 11MB 压缩后）

**引擎就绪的可观测信号是 `#boot` 元素加上 `gone` class** —— `window.__engineReady` 是模块内变量，外部拿不到
（写 E2E 时踩过）。

### 看原型（不要双击打开）

```bash
# 仓库根起静态服务（必须后台跑）
.venv/Scripts/python.exe -m http.server 8126
# → http://127.0.0.1:8126/docs/prototypes/wechat/wechat-v7.html
```

> ⚠️ `file://` 协议会被 CORS 拦住，字体与缩略图全失败。
> ⚠️ 原型内资源路径有**三类深度**（改目录时按这个算，别一律「加一层」）：
> 模块目录（`wechat/` 等）= 到仓库根**三跳**；`xhs/v2/`、`xhs/v3/` = **四跳**；同目录引用不动。
>
> ⚠️ `docs/prototypes/data/` 与 `docs/prototypes/xhs/v2/assets/` **不入库**（gitignore）。
> 新 clone 缺缩略图与字体，需回填：
> ```bash
> .venv/Scripts/python.exe scripts/gen_kit_thumbs.py
> cp public/kit-thumbs/*.jpg docs/prototypes/data/
> mkdir -p docs/prototypes/xhs/v2/assets/{fonts,img}
> cp pwa/public/fonts/cover/*.woff2 docs/prototypes/xhs/v2/assets/fonts/
> cp public/images/{09-snow-bike,05-swing,02-night-street,06-desk-lamp,03-school-bus,07-radio}.jpg \
>    docs/prototypes/xhs/v2/assets/img/
> ```

---

# 2. 已完成内容

> 下面每条都标注了**实现位置**与**验证方式**。「验证方式」列的是仓库里真实存在的测试脚本；
> 没有对应脚本的，会明确标注「**无独立门禁**」。

## 2.1 板块 A：公众号排版（主线）

### A-1 排版引擎（核心）

| 项 | 内容 |
|---|---|
| **实现位置** | `core/format_engine.py`（3584 行）、`core/preprocessor.py`（1006 行）、`core/magazine_layouts.py`（1470 行） |
| **PWA 唯一入口** | `convert_markdown_to_wechat_html()` `core/format_engine.py:3535-3580` |

**关键实现逻辑**（`format_engine.py:3535-3580` 完整链路）：

1. `:3559-3560` **kit 归一化** —— `locked_layout` 映射为 `layout`（**不复用主题 JSON 的 `layout` 字段**，
   否则会被本机 `layoutOv[id]` 覆盖，kit 就锁不住）
2. `:3562-3569` **预处理链** —— `fix_cjk_spacing` → `fix_cjk_bold_punctuation` → `process_callouts`
   → `process_manual_footnotes` → `process_fenced_containers` → `~~strikethrough~~` → `md_to_html`
3. `:3570-3571` `inject_inline_styles` → `convert_image_captions`
4. `:3575-3578` **字号缩放必须在所有版式与注入之后** —— 版式函数写死 `font-size`，
   提前缩放会被覆盖

**版式注册表**：`LAYOUT_REGISTRY` `format_engine.py:3307-3312` = `magazine/rhythm/cardflow/outline`；
`:3315` 并入 `MAGAZINE_LAYOUTS`（`core/magazine_layouts.py:1449-1472`，19 个版式函数）。
> 导入失败只少 15 键，原 4 个照常 —— **静默降级**，这是 §4.5 那条事故的根因。

**主题系统（183 套，实测）**：

| 维度 | 实测值 | 判据 |
|---|---|---|
| 主题总数 | **183** | `ls public/themes/*.json \| wc -l` |
| `kind == "kit"`（整篇设计） | **19** | 全部命中 `mg-*` 前缀 |
| 非 kit（配色主题） | **164** | 其余全部 |
| 其中 `su-*` 前缀 | **119** | `scripts/theme_specs.py` 的 `SPECS` 字面量 |
| 早期经典主题名 | **45** | `aurora` / `ink` / `github` / `newspaper` 等历史 JSON |

> ⚠️ **口径纠正**：「164 套 su-*」是**过时表述**。164 是**非 kit 主题总数**，
> 其中只有 119 个叫 `su-*`，另 45 个是早期经典主题名。
> `core/format_engine.py:3558` 的注释「164 套 su-* 没有 locked_layout」表述有误
> （那 45 个经典主题同样无 `locked_layout`），`scripts/pwa_theme_drawer_test.py:285` 已记录此事。
>
> 📌 **kit 的配色真源是 JSON 本身**（`public/themes/mg-*.json`），
> **别照抄文档里的色值表** —— 曾因手填文档色值错了 10/15。

**版式入口 `LAYOUT_OPTIONS`（15 项，实测）**：定义在 **`pwa/src/app.js:770-787`**（不在引擎里）。

| # | id | 中文名 | # | id | 中文名 |
|---|---|---|---|---|---|
| 0 | `''` | 默认 | 8 | `time` | 朱丝栏 |
| 1 | `rhythm` | 图文节奏 | 9 | `guardian` | 天头 |
| 2 | `cardflow` | 卡片流 | 10 | `economist` | 鱼尾 |
| 3 | `outline` | 目录导航 | 11 | `natgeo` | 乌丝栏 |
| 4 | `magazine` | 杂志分栏 | 12 | `vogue` | 版心 |
| 5 | `hero` | 首屏 | 13 | `forbes` | 算经 |
| 6 | `card` | 卡片组 | 14 | `adidas` | 三道 |
| 7 | `timeline` | 时间线 | | | |

- `LAYOUT_GROUP_AT = 8`（`app.js:792`）—— 前 8 个通用，其余 7 个报刊
- `LAYOUT_LABEL_ONLY`（`app.js:797-801`）另收录 12 个**不给独立入口**的显示名（muji 留白 / starbucks 咖啡 /
  mori 森系 / ukiyoe 浮世绘 / note 手账 / ikea 宜家 / brutal 野兽 / deepread 深读 / tech 技术编辑 /
  rational 理性 / swiss 瑞士 / light 轻刊）—— 这些版式**写死了品牌色**，配别的配色会串味

**字号标尺 `SCALE`**（`scripts/build_themes.py:70-78`，2026-10-18 定稿）：

```python
SCALE = {
    "h1": 22, "h2": 18, "h3": 16, "h4": 15, "h5": 14, "h6": 13,
    "p": 15, "small": 13, "code": 13.5,
}
```

> 只改这一处、重跑 `build_themes.py` 即 119 套 `su-*` 全量生效，可逆。
> 引擎侧**无** `SCALE` 常量（那是生成器侧的）；引擎只有运行时缩放用的标签白名单
> `_SCALE_HEADING_TAGS:2671` / `_SCALE_BODY_TAGS:2674` / `_BODY_MAX_SCALE_PX = 22.0:2675`。

**验证方式**：
- `scripts/pwa_magazine_layout_test.py`（262 行，纯 Python，不启浏览器）—— 报刊版式 63 项断言
- `scripts/pwa_layout_compat_test.py`（507 行）—— A+B+C 双态夹具 × 5 版式兼容矩阵 100 项
- `scripts/kit_alignment_fixture.py` —— 19 套整篇设计对齐夹具 152 项
- `scripts/theme_stress_audit.py` / `theme_contrast_audit.py` / `audit_theme_spec.py` —— 全量渲染审计 / 对比度 / 配色规范
- `scripts/pwa_headed_full_e2e.py`（769 行，有头）—— 端到端

---

### A-2 公众号排版前端（`pwa/src/app.js`，2408 行）

| 功能 | 实现位置 | 关键逻辑 |
|---|---|---|
| **模板库抽屉**（两 tab） | `app.js:653-749` | `poolThemes:662` `renderModeTabs:667` `renderKitPane:685` `openDrawer:694` `switchTab:724`；两个 tab **并列不是父子**：配色主题（换皮不换骨）/ 整篇设计（成套锁死） |
| **风格胶囊** | `app.js:495-606` | `themeMeta:500` `orderedThemes:529` `renderCaps:551` `pushRecent:564` |
| **kit 锁定态** | `app.js:607-652` | `applyKitLock:614` `exitKit:645`；锁定时版式胶囊真 disabled、色卡置灰；「改回可组合版式」退出 |
| **版式层** | `app.js:750-854` | `LAYOUT_OPTIONS:770` `renderLayouts:827`；`STRUCT_LAYOUTS = new Set(['outline','magazine']):813`（引擎标题不足 2 个时原样返回） |
| **段落样式开关**（3 种） | `app.js:855-916` | 金句 / 数据 / 提示，按内容自动识别；`effectiveBlocks:888` |
| **2A 族折叠** | `app.js:917-1095` | 7 族中文名 `FAMS:100-104`（biz 公文 / feast 节庆 / letter 信笺 / minimal 素页 / night 夜航 / stamp 钢印 / dusk 暮色） |
| **复制到公众号** | `app.js:1096-1163` | `copyRich:1097` —— 复制前自动 `localizeImages({compress:true})` 内嵌外链图 |
| **自定义配色** | `app.js:310-373` | `customColors:320` `applyCustomColors:328`；**取色器已从抽屉迁入设置弹窗** |
| **设置弹窗** | `app.js:2240-2284` | `openSettings:2243` `tailPayload:2265` `tailHtml:2276`；低频项集中入口，顶栏不新增控件（390px 下顶栏已挤满） |
| **整页背景** | `app.js:2285-2350` | `BGS`（纯白/暖纸/纸张纹理/细网格）、`applyPageBg:2307` —— **在产物外面包一层 section**，不改主题 JSON；plain 时零变化 |
| **字号滑块** | DOM `pwa/index.html:281-288`；JS `app.js:1836-1888` | `syncFontUi:1836` `setFont:1853`；14–18px，变更时 `themeJsonCache.delete(activeId)`（setTheme 指纹不含字号） |
| **AI 面板** | `app.js:1287-1570` | `initAi:1288` `refreshAiGate:1356` `run:1452` `runAiFormat:1479` `syncUndo:1546`；默认隐藏 |
| **配图搜索** | `app.js:2090-2239` | `bindPicDialog:2094` `doSearch:2156`；复用 Pexels，Key 与封面共用 |
| **备份/恢复** | `app.js:1164-1286` + `pwa/src/backup.js` | `BACKUP_VERSION=1`、**默认不导出 API Key** |
| **草稿** | `app.js:1571-1603` | `saveDraft:1573` `restoreDraft:1595` |

**样式**（`pwa/src/style.css`，875 行）关键位置：

| 区块 | 行号 |
|---|---|
| 抽屉 | `309-387`（`--drawer-w: 500px:314`，窄屏 `min(560px, 94vw):336`） |
| 2A 族折叠 | `463-549` |
| 整篇设计锁定说明条 | `550-628` |
| 设置弹窗 | `629-670` |
| 字号滑块 | `595-612` |
| **缩略图（aspect-ratio）** | `.d-prev { aspect-ratio: 2 / 1 }` **`:438`**；`.d-card-kit .d-prev { aspect-ratio: 4 / 3 }` **`:441`**；`.d-card` `min-height: 116px` `:417` |

> 📌 P4-4 把缩略图从固定 `height:104px` 改成 `aspect-ratio`。
> **`min-height` 必须给具体值**（0/auto 会让卡片塌陷到 4px）。

**验证方式**：
- `scripts/pwa_theme_drawer_test.py`（549 行，Playwright）—— 模板库全量审计 59 项
  （含 183 套逐个应用、7 族色调全点、切版式保留同名色调、移动端无横向溢出、**版式层 15 个选项**）
- `scripts/pwa_headed_full_e2e.py`（769 行）—— 端到端 53 项（含 183 套 × 3 夹具、15 版式、段落样式 3 开关、设置弹窗）
- `scripts/pwa_export_test.py` / `pwa_artifact_assert_test.py` / `pwa_update_panel_test.py`
- `scripts/pwa_ppmode_test.py`（预处理四模式 11 项）/ `pwa_light_preview_test.py` / `pwa_s1s3_test.py`

---

### A-3 引擎侧已知缺陷（已实测确认，非臆测）

| # | 现象 | 位置 | 实测结论 |
|---|---|---|---|
| **1** | **`extract_links_as_footnotes()` 在 PWA 主入口不被调用** —— 「外链转脚注」这个开关在网页端无效 | 定义 `format_engine.py:364`；调用点仅 `:3359`（`format_for_output()` 内，CLI 路径）与 `:3455`（`main()` 内，CLI argparse 入口）；**`:3535-3580` 的 PWA 入口全文无此调用** | ✅ 已实测确认（grep 全仓 + 读 PWA 完整调用链 `engine.worker.js:144-153`） |
| **2** | **hero / timeline 版式下 `<h2>` 语义标签丢失** —— 引擎把 `<h2>` 改写成 `section > span + span`（徽标 + 标题），**原 `<h2>` 整段被丢弃**，无 `role`/`aria` 补救 | `_rewrite_h2_as_row()` `format_engine.py:2039-2052`；调用点 `:2209`（hero numbered）、`:2245`（timeline） | ✅ 已实测确认（实跑 7 个版式比对 `<h2>` 计数：`''`/`rhythm`/`outline`/`cardflow`/`magazine` 各保留 1 个；**`hero`/`timeline` 为 0**） |
| **3** | 默认/通用版式**保留** `<h2>` —— `_layout_rhythm:3201-3208` 只在 h2 前插强调条；`_layout_outline:3294-3299` 在 h2 内插编号；`_strip_heading_block:2833` 只擦底色 | 同上 | ✅ 已实测确认 |

> ⚠️ **#2 是可访问性缺陷**，不是视觉问题（视觉正常）。修的时候注意：
> `magazine_layouts.py:332-355` `decorate_sections()` 是基于**原开标签**改样式并插入前缀，
> h1/h2 标签保留（`:349-354` 注释记录了早先写成 `f"<{tag}>"` 丢样式的 bug）—— 别照抄那个错法。

---

## 2.2 板块 B：小红书标题图

| 项 | 内容 |
|---|---|
| **实现位置** | `pwa/src/cover/title-page.js`（863 行）+ `catalog.js` / `layouts.js` / `templates.js` / `render.js` / `textmode.js` / `bg-picker.js` / `analyze.js` / `search.js` / `ui.js` / `cover.css`（669 行） |
| **状态隔离** | `supersu.cover.prefs.v1`（与长图文 `supersu.longform.prefs.v1` 完全独立） |

**关键功能**：

| 功能 | 实现位置 | 说明 |
|---|---|---|
| 页面挂载 | `title-page.js:591` `mountTitlePage` | 顶栏三 tab 之一 |
| 实时预览 | `title-page.js:494` `schedulePreview` | 用**用户自己的文案**实时渲染缩略图（不是别人的成品） |
| 文字玩法 | `textmode.js`（231 行）`applyTextStyle:176` | `TEXT_MODES`（`:14`）7 种 + `TEXT_FONTS`（`:30`）4 款（auto/sans/serif/smiley）；彩虹配色 |
| 尺寸 | `catalog.js:12` `COVER_SIZES` | xhs / square / wide 三档 |
| 九宫格 | `title-page.js:14` 复用 `pwa/src/nine.js` | `splitGrid` / `releaseTiles` / `zipTiles`；`GRID=3:9` `MIN_CELL=16:12` |
| 底图亮度分析 | `analyze.js`（305 行） | `analyzeImage:150` `analyzeZone:235` `pickBandAndInk:271` `relLum:31` `contrastRatio:35` `alphaForL:62` `MAX_ALPHA:53` —— **sRGB 反解暗角 α**，保证字色对比度 |
| 底图三态 | `bg-picker.js`（370 行）`createBgPicker:29` | 搜一张 / 传一张 / 不要图（纯色，不依赖网络） |
| 搜图 | `search.js`（307 行） | 见 §2.4 |

**验证方式**：
- `scripts/xhs_full_test.py` —— 标题图全量功能测试 + 逐步截图（15 步），产物 `output/xhs-full/step-NN-*.png`
  ⚠️ **未进 `run_gates.py`**（人工/专项验证，非自动门禁）
- `scripts/pwa_cover_test.py` —— 覆盖入口切换 / 9 版式 + 25 配色 / 3 尺寸 / 归藏与模板与新版式出图 /
  上传底图 / 联网搜图 / 下载链接 / 窄屏布局 / 断网生成（30 项，**进门禁**）
- `scripts/qa_story_verify.py` —— 整套图文产物 QA（逐张校验尺寸/字节数/是否近乎空白 + 内页去重 + 大字报底图）
  ⚠️ **未进 `run_gates.py`**

---

## 2.3 板块 C：小红书长图文

| 项 | 内容 |
|---|---|
| **实现位置** | `pwa/src/cover/longform-page.js`（585 行，UI 层）+ `story.js`（165 行，编排层）+ `cards.js`（1135 行，渲染引擎） |

### 2.3.1 `cards.js` —— 长图文渲染引擎（1135 行 / 63KB）

四大块：

1. **解析层**（`:23-90`）
   - `parseBlocks:35` —— Markdown 切成 `p / h1-h4 / quote / step / li / pagebreak` 七种块
   - `splitLongParas:77` —— >190 字段落按句切
   - `inlineMd:29` —— 行内 `**粗** ==高亮== *斜*`
2. **数据/常量层**（`:91-293`）
   - `PALETTES:93` 8 套色板 ｜ `LONG_TPLS:140` 12 套长文模板 ｜ `BG_TPL_IDS:262` 6 套可用底图模板
   - `ROLES:285` 7 角色字典 ｜ 阈值常量 `:265-283`（含 `DENSE_SINGLE_SEG_FLOOR=66.5`、`STORY_MAX_PAGES=6`）
3. **CSS 层**（`:295-637`）
   - `CARD_CSS_RAW` 一份大常量，含 12 套模板各自装饰 CSS（`:334-495`：胶片齿孔 / 拍立得胶带 /
     macOS 窗口 / 星光月晕）+ 7 角色排印规则
   - `@@S@@` 占位符做作用域前缀（主文档 `#cv-cards-root ` / 导出文档空串），`cardCss(scope):635` 负责替换
4. **渲染/分页层**（`:638-1135`）
   - `ensureCardsEnv:644` 注入 CSS+字体做度量宿主
   - `measureDense` / `denseMaxHeight` / `splitUntilFit` / `packDense`（`:683-814`）—— **按实测 DOM 高度装箱分页**
   - `buildLong:816` 主分页器 ｜ `cardInner:978` 7 角色分支 ｜ `pageDoc:1091` 出独立文档
   - `fitOverflowCards:1108` 溢出兜底

### 2.3.2 `story.js` —— 成套编排（165 行）

`buildStorySet:116` 调 `buildLong` → 每页 `pageDoc` → `render` → 结果数组，
并挂 `truncated` / `totalPages` / `manualBreaks` 三个非枚举属性。

### 2.3.3 长图文 UI（`longform-page.js`）

左栏文章输入 → 封面配图 → 导出；中栏整套横滑预览 + 自检条；右栏模板/色板/版式选项。

**验证方式**：
- `scripts/pwa_longform_test.py` —— **产物级断言**（四类 DOM 级断言）：
  ① 分页完整性（原文每句都必须出现在渲染出的卡片里）② 字号 ≥28px
  ③ 填充率分档（正文/清单/步骤 ≥68%、结尾 ≥60%、开篇/金句 ≥45% 且 ≥2 锚点）④ 无溢出
  （**进门禁**）
- `scripts/qa_story_verify.py` —— 导出 PNG 的字节/空白/去重产物 QA（**未进门禁**）

---

## 2.4 共用底座：搜图与封面风格目录

### 搜图（`pwa/src/cover/search.js`，307 行）

| 项 | 实测事实 |
|---|---|
| **图源** | **只有 Pexels 一家** —— `PEXELS_API = 'https://api.pexels.com/v1/search'` `:126` |
| **已移除的图源** | Wikimedia（国内直连超时）、Pixabay（不支持中文）—— 原因写在 `search.js:1-15` 头注释 |
| **BYOK** | Key 存 `localStorage` 键 `supersu.cover.stock.v1` `:125`，**只存本机、不上传** `:12` |
| **无 Key 行为** | **不发请求**，直接抛 `SearchError` 并带 `err.needKey = true` `:207-212`，UI 提示「点『填 Key（免费·2分钟）』」 |
| **请求参数** | `orientation=portrait` 竖图优先、`per_page` 12–80、`page` 翻页 `:172-178`；过滤 `width >= 600` `:192`；超时 9s |
| **降级 ①缓存兜底** | 结果缓存 24h（`CACHE_TTL:18`）、最多 24 条；key = `图源签名:查询词` `:241-243` → **换 Key 自动失效、不串源**；只缓存第 1 页 |
| **降级 ②关键词回退** | 英文映射词搜不到时，第 1 页用**原文**重搜一次 `:266-271`；**翻页时不重试**（避免把「原文第 1 页」当第 2 页） |
| **降级 ③下载兜底** | `fetchImageDataUrl:285` 失败 → 提示「可改用纯色或上传图片」`:303` |

### 封面风格目录（`pwa/src/cover/catalog.js`，137 行）

```
ALL_STYLES = [...GUIZANG_STYLES, ...TEMPLATE_STYLES, ...LAYOUT_STYLES]   :102
```

| 组 | 数量 | 内容 |
|---|---|---|
| 归藏 `GUIZANG_STYLES:19` | 3 | `editorial` 杂志风 / `swiss` 瑞士风 / `bigtype` 大字版 |
| 模板 `TEMPLATE_STYLES:44` | 10 | `magazine-tpl` 6 套（沙丘暖纸/森林墨绿/靛蓝瓷白/经典墨色/牛皮纸/午夜墨金）+ `swiss-tpl` 4 套（克莱因蓝/柠檬绿/柠檬黄/安全橙） |
| 版式 `LAYOUT_STYLES:85` | 12 | `image-led` / `quote` / `number` / `list` × 3 色板（暖纸/墨夜/亮橙） |

**合计 25 个 style，分 9 张版式卡**（`LAYOUTS:106-119`）：
`image-led`(3) / `magazine`(1) / `quote`(3) / `bigtype`(1) / `list`(3) / `number`(3) / `swiss`(1) /
`magazine-tpl`(6) / `swiss-tpl`(4)。

> ⚠️ **口径统一**：对外说「**9 种版式 × 各自推荐配色**」。
> 「12 风格」是过期说法（`docs/INDEX.md` 已记）。
> `public/cover-templates/` 实测 **10 套**（`ls | wc -l`），每套是**独立复制的完整 HTML**，
> 结构上是 **2 种版式骨架（editorial / swiss）× 各自配色**，仅支持 3:4。

---

## 2.5 工程体系（支撑三个板块）

| 环节 | 实现 | 事实 |
|---|---|---|
| **构建** | `pwa/scripts/build.mjs`（930 行） | **白名单构建**（不是 `cp -r`）：仓库含本地 Flask 版专属资产，漏拷就把不该公开的东西发上线 |
| 构建关键阶段 | 同上 | ① 清空重建 `dist` → ② app shell → ③ 字体 → ④ Pyodide 运行时（缺目录 **直接 throw**）→ ⑤ 主题 + `themes/index.json` → ⑥ 缩略图 → ⑦ **Python 引擎 3 个 py** + `markdown.zip`（**必须带 `markdown-*.dist-info/`**，否则 entry points 解析退化报 ModuleNotFoundError）→ ⑧ 封面模板（**注入清洗**：去 Google Fonts / 去 WCAG 白字段 / 清示例文案）→ ⑨ 版本 + 更新记录 → ⑩ vendor → ⑪ `_headers` + SW 指纹注入 → ⑫ **断言** → ⑬ 同步 `STATE.md` |
| **构建断言** | `assertDist()` `build.mjs:808-927` | 10 类：本地版专属目录不得进包 / 不得残留 `fonts.googleapis.com` / 主题数 == 索引条目数 / 封面模板齐全 / 关键文件 28 项 / **增量更新 4 个占位符已注入** / **worker 加载清单覆盖 dist/py 全部 .py** / 版本号占位符已注入 / 资产清单 ≥20 项 / `themes/manifest.json` 条目充足 |
| **构建号** | `computeBuildId()` `build.mjs:642-648` | sha256(shell + assets + **版本号**) —— 版本号也算进指纹，否则「只改文案不动代码」浏览器认为 SW 字节没变 → 永远无 waiting worker |
| **Service Worker** | `pwa/public/sw.js`（616 行） | **5 层缓存**：`store-shell` / `store-assets` / `store-data` / `store-runtime` / `store-media`。**缓存名固定、键带 `?h=<sha256>` 内容哈希** → 改一行 `app.js` 实际只下 app.js + sw.js（不再「按版本名整体换缓存」要重下 1.29MB / 59 请求） |
| SW 关键常量 | `sw.js:55-62` | `SHELL_CRITICAL` 6 项（index.html / src/app.js / style.css / bridge.js / engine.worker.js / update/index.js）—— **缺一个 install 直接失败**（旧 SW 继续服务，避免装半套白屏） |
| SW 清单内联 | `sw.js:45-52` | 三个 manifest 占位符由 build 内联 —— **不能运行时 fetch**：SW 被回收后离线重启时 manifest 请求必然失败 → 退回普通键 → 与缓存里的 `?h=` 键不匹配 → **离线全废** |
| **更新管理器** | `pwa/src/update/index.js`（747 行） | 11 态状态机（`:93`）；**后台自动下载、前台只提示「点一下重启」**（2026-10-29 拍板方案 A）；只有 hidden 或「可见但空闲 ≥10min」才静默重启（`AUTO_RESTART_IDLE_MS = 10min`） |
| 更新版���来源 | `update/index.js:43` | `const APP_VERSION = '__APP_VERSION__'`（构建注入）。⚠️ **绝不能用 `fetch('./version.json')` 当「我在跑的版本」** —— 那是服务器最新值，发版后老页面 running 立刻变新 → 永远判「已是最新」（2026-10-29 事故） |
| 更新记录面板 | `pwa/src/update/changelog.js`（1008 行） | 纯原生 ES module；DOM 只建一次，搜索/筛选只切 hidden；**全部正文走 `textContent`**（XSS 防护）；`countEntries` 默认只数用户可见条目（排除 dev） |
| **门禁** | `scripts/run_gates.py`（641 行） | **32 个套件 / 4 层**：本地层 22 项、线上层 2 项、有头层 2 项、扩展层 6 项 |
| 门禁档位 | 同上 | `--quick` / `--local` / `--online` / `--full` / `--ui` / `--all` / `--skip-preflight`；**默认档 = 按工作区未提交改动挑套件** |
| 门禁并行 | `run_gates.py:172` | `PARALLEL_SAFE` **刻意清空** —— 并行不撞端口（都 bind 0）但**抢 Pyodide** |
| **前置检查** | `scripts/preflight.py`（282 行） | 6 项：dist 存在 / **构建新鲜度（阻断）** / 版本号一致（阻断） / **更新记录覆盖（阻断）** / 工作区干净（`--deploy` 时阻断） / 线上版本对齐（`--online`） |
| **发版** | `scripts/release.py`（449 行） | 文档头列 10 步、**代码实际 8 步**（2026-11-01 精简，前置检查与生成更新记录已并入构建） |
| **部署** | `pwa/scripts/deploy.sh`（118 行） | Cloudflare Pages；凭证读**仓库根 `.env`**；4 道 git 铁律预检（工作区干净 / HEAD 必须在 `origin/main` 上 / dist 存在 / 更新记录覆盖） |
| **状态真源** | `scripts/gen_state.py`（317 行） | 生成 `STATE.md`；门禁套件清单**从 `run_gates.py` 自动正则读取**（唯一真源） |

**当前基线实测（2026-11-06）**：

```
$ .venv/Scripts/python.exe scripts/preflight.py
✅ 前置检查通过
  OK  dist 存在            OK  dist 新鲜：dist.build=429 >= 需要的 429（落后 HEAD 14 个提交，但均未改动代码路径）
  OK  dist 版本号与源码一致：v1.18.0
  OK  更新记录覆盖当前版本：v1.18.0（共 33 个版本）
  OK  已跟踪文件干净

$ curl https://supersu.ccwu.cc/version.json
{"name":"SuperSu PWA","version":"1.18.0","releasedAt":"2026-11-04","build":429}

$ git status --porcelain -uall     # 空 → 工作区干净
$ git log origin/main..HEAD --oneline
c80c542 chore(build): STATE 同步收尾验证（线上层 3/3，含版式胶囊 6 项）
```

> ⚠️ **本地 HEAD 领先远端 1 个提交**（只改了 `STATE.md`）。`deploy.sh` 的 git 铁律预检要求
> HEAD 在 `origin/main` 上 —— **直接部署会被拦**，需先 push。

---

# 3. 未完成任务

> 优先级：**P0** 阻断/影响核心体验 ｜ **P1** 该做 ｜ **P2** 可选
> 状态取自 `docs/INDEX.md` §5、`docs/meta/open-tasks-2026-11-01.md`、`HANDOFF.md` §8
> —— 本文已逐条**复核其真实性**，与文档不一致的地方在「实测结论」列说明。

## 3.1 板块 A：公众号排版

### W-1 ⚪ P0 · 外链转脚注在网页端无效

| 项 | 内容 |
|---|---|
| **描述** | 「内容开关」里的「外链转脚注」在 PWA 里点了没反应 |
| **进度** | 🔴 引擎侧**能力存在**，但**PWA 主入口不调用** |
| **阻塞点** | 需要决策：这是「网页端不支持」还是「接线漏了」？引擎 `extract_links_as_footnotes()` 只在 CLI 路径（`format_engine.py:3359` / `:3455`）调用，PWA 入口 `:3535-3580` 全文无此调用 |
| **关键文件** | `core/format_engine.py:364`（定义）、`:3359` / `:3455`（CLI 调用点）、`:3535-3580`（PWA 入口） |
| **实现思路** | 在 `convert_markdown_to_wechat_html()` 的预处理链后（`:3569` 之后、`:3570` 注入内联样式之前）加一次调用；**但要先确认脚注 HTML 的样式是否会被 `inject_inline_styles` 覆盖**，需加引擎侧断言 |
| **优先级** | **P1**（需先拍板语义，非纯技术问题） |

### W-2 🔴 P0 · hero / timeline 版式丢失 `<h2>` 语义标签

| 项 | 内容 |
|---|---|
| **描述** | 选 hero（首屏）或 timeline（时间线）版式时，引擎把 `<h2>` 改写成 `section > span + span`，**`<h2>` 标签整段被丢弃** —— 视觉正常，但语义层级丢失，影响无障碍与公众号端的结构识别 |
| **进度** | 🔴 未修（已实测确认，见 §2.1 A-3 #2） |
| **阻塞点** | 无外部依赖；`_rewrite_h2_as_row()` 是纯函数，改动范围可控 |
| **关键文件** | `core/format_engine.py:2039-2052`（`_rewrite_h2_as_row`）、`:2209`（hero 调用）、`:2245`（timeline 调用） |
| **实现思路** | 改写时保留一个**视觉等价但语义正确**的 `<h2>`：把徽标 `<span>` 放进 `<h2>` 内部而非替换掉整个标签；参照 `magazine_layouts.py:332-355` `decorate_sections()` 的做法（**基于原开标签改样式**，不重开标签）。改完必须补一条引擎级断言（见 §4.6「断言守设计意图」） |
| **优先级** | **P0**（可访问性缺陷，且只在 2 个版式下触发，容易漏） |

### W-3 🟡 P1 · 主题计数口径在多处文档里写错

| 项 | 内容 |
|---|---|
| **描述** | 「164 套 su-*」是**过时表述**。实测：183 套总数 = 164 非 kit + 19 kit；164 里只有 119 个叫 `su-*`，另 45 个是早期经典主题名 |
| **进度** | 🟡 代码侧正确，**文档侧未统一** |
| **阻塞点** | 无 |
| **关键文件** | `core/format_engine.py:3558`（注释表述有误）、`docs/INDEX.md:85`、`AGENTS.md` 相关段、`scripts/pwa_theme_drawer_test.py:285`（已记录此事） |
| **实现思路** | 把「164 套 su-*」统一改为「**164 套配色主题（含 119 套 su-* + 45 套早期经典）**」；注意 `doc_sync_check.py` 会校验主题套数，**改文档前先跑一遍**看它认哪个口径 |
| **优先级** | **P1**（接手人第一眼就会被这个数字绕进去） |

### W-4 ⚪ 已明确不做 · 移动端（375px）导航重做

用户已定：不在本轮。记录在此仅作口径对齐。

---

## 3.2 板块 B / C：小红书

### X-1 🔴 P0 · 标题图 UX V2（三栏骨架）未落地

| 项 | 内容 |
|---|---|
| **描述** | 封面 UX V2 方案 + 原型 + 对抗性复核（5 个 P0 全给实测证据）**全部完成**，但**只动 `docs/`，`pwa/src` 一行未改** |
| **进度** | 🔴 方案已定稿（`docs/xhs/design-xhs-studio-final.md`），原型可交互（`docs/prototypes/xhs/v2/`），**产品零改动** |
| **阻塞点** | ⚠️ **不能一次性全搬** —— `HANDOFF.md` §8.2 给了 8 步顺序，其中第 7 步（`longform-page.js` 右栏 4 列 + 配色口径统一）**风险最高**，会推翻现行分页口径 |
| **关键文件** | `pwa/src/cover/cover.css`（三栏骨架）、`title-page.js`（右栏 5 列）、`cards.js`（`palOf(k)` 改显式 `o.pal`）、`catalog.js`（配色加 `fam`/`blockInk`）、`render.js`（两段式保存）、`longform-page.js`（右栏 4 列） |
| **实现思路** | 严格按 `HANDOFF.md` §8.2 的 8 步顺序做，每步独立构建 + 有头验证；**每步都要补产物级断言**（`HANDOFF.md` §9 第 3 步：「没有断言就等于没做」——这一轮 5 个 P0 里有 4 个是"界面看起来正常、产物是错的"） |
| **优先级** | **P0**（用户抱怨最直接的一处） |

### X-2 🔴 P0 · 九宫格产物可能 7/9 张空白，界面无预警

| 项 | 内容 |
|---|---|
| **描述** | 一张图切 3×3 时，切出来可能只有 2 张有内容，其余是空白格；界面**不预警** |
| **进度** | 🔴 未做 |
| **阻塞点** | 需要一个「逐格覆盖率」判据 —— 参考 `analyze.js` 的亮度分析能力 |
| **关键文件** | `pwa/src/nine.js`（`splitGrid:78`）、`title-page.js`（复用 nine.js） |
| **实现思路** | 加逐格覆盖率检查（无内容就预警），并提供「一键把标题放大铺满」（复用已有 `tmode=poster`）。**这是「预警 + 一键铺满」的替代方案**，不是专用版式（专用版式已被否，见 §3.4） |
| **优先级** | **P0** |

### X-3 🟡 P1 · 长图文 `role:'steps'` 是死代码

| 项 | 内容 |
|---|---|
| **描述** | `cards.js` 声明了 7 个 role，`steps` 有一个完整分支（`cardInner:1046-1051`）和一整套 CSS（`:583-598`），**但 `buildLong()` 从不产出它** |
| **进度** | 🟡 **已实测确认**（grep 全 `pwa/src/cover/`：`role: 'steps'` 零命中） |
| **阻塞点** | 无外部依赖，但**要先定产品语义**：`steps` 是「长文里显式写步骤就该用步骤版式」，还是「步骤内容应该并入正文页」 |
| **关键文件** | `pwa/src/cover/cards.js:285-293`（ROLES 字典）、`:1046-1051`（死分支）、`:583-598`（死 CSS）、`:53-63`（`parseBlocks` 会产出 `type:'step'` 块） |
| **补充实测** | ⚠️ **`docs/INDEX.md` §5.2 X-4 的描述不完整**：内容**没丢** —— `parseBlocks` 确实产出 `type:'step'` 的块（识别「第二步：」「①②」「1.」三种写法），但分页循环只把 `li`/`quote` 单独成页，**step 块被并入 `dense` 页**，最终降级成一行 `<p><strong>标题</strong>：描述</p>`（`cards.js:1073`）。所以「步骤内容永远走不到专用步骤版式」，不是「步骤内容会消失」 |
| **实现思路** | 二选一：① 让 `buildLong` 把连续的 step 块单独成页（启用已有分支）；② 删掉死分支与死 CSS。**建议 ①** —— 死代码留着，下一个人会以为它能用 |
| **优先级** | **P1** |

### X-4 🟡 P1 · 长图文模板区一屏看不全

| 项 | 内容 |
|---|---|
| **描述** | 右栏模板区 2 列 × 6 行 + 色板 + 版式选项，内容高度必然超出视口，要靠滚动才能看完 |
| **进度** | 🟡 问题性质成立，但**文档里的数字来自原型，不是现行代码** |
| **阻塞点** | ⚠️ `docs/INDEX.md` §5.2 X-5 引用的 `scrollHeight=1013 > client=854` 出自 **`docs/prototypes/xhs/ux-longform.html:189`**。现行 `pwa/src` 里**根本没有 `.side-scroll` 这个容器**（grep `pwa/` = 0 命中），对应的现行结构是 `aside.cv-col.cv-col-right` |
| **关键文件** | `pwa/src/cover/longform-page.js:448-479`（右栏 DOM）、`pwa/src/cover/cover.css:171`（`.cv-ltpls` 2 列）、`:489-495`（`.cv-col` 整体 `overflow-y:auto`）、`:501-505`（右栏样式） |
| **实现思路** | 方案已记为 LF-TPL-5「模板区独立滚动，不与色板/选项共用滚动」（`docs/xhs/requirements-xhs-longform.md:254`）。⚠️ **现行代码的实测 scrollHeight/clientHeight 待浏览器实测**（见 §6） |
| **优先级** | **P1** |

### X-5 🟡 P1 · 长图文 13 套配色与标题图 20 套配色口径不统一

| 项 | 内容 |
|---|---|
| **描述** | 两套配色来源不同（`cards.js: PALETTES:93` 8 套 vs `catalog.js` 25 style），部分配色**不达 AA 对比度** |
| **进度** | 🟡 未做，**口径未定** |
| **阻塞点** | **必须先定口径** —— 合并前要先定「以哪套为准」，否则长图文色卡会大面积回落 |
| **关键文件** | `pwa/src/cover/cards.js:93`（PALETTES）、`pwa/src/cover/catalog.js:85`（LAYOUT_STYLES） |
| **优先级** | **P1**（待拍板） |

### X-6 ⚪ P2 · 图片用 `<section style="line-height:0">` 包裹

消除图片底部 3–5px 空隙。来源：`docs/meta/open-tasks-2026-11-01.md` I-8。

---

## 3.3 工程 / 文档

### E-1 🔴 P0 · kit 态「背景不可改」因运算符优先级 bug 实际没生效

| 项 | 内容 |
|---|---|
| **描述** | 选「整篇设计」（kit）后，设置弹窗里的整页背景**应该禁用**（背景是整篇设计的一部分），**但实际没禁用**，提示语也显示错 |
| **进度** | 🔴 **本文写作时实测确认是真 bug**（见下方实测） |
| **阻塞点** | 无 |
| **关键文件** | `pwa/src/app.js:2323` |
| **实测** | 仓库写法 `!!(themeMeta(activeId) \|\| {}).kind === 'kit'`，JS 里 `!` 优先级高于属性访问 → 实际解析为 `(!!(themeMeta(activeId) \|\| {})).kind === 'kit'` → `false.kind` → `undefined` → **恒不等于 `'kit'`**。node 实跑：`locked = false`（正确写法应为 `true`） |
| **对照** | 同文件 `:616` `!!(t && t.kind === 'kit')` 与 `:830` `!!(meta && meta.kind === 'kit')` **写法正确**，**只有 `:2323` 这一处错** |
| **影响面** | `renderBgGrid():2320` —— kit 态下背景按钮不置灰、可点；`setBg():2344` 不做 kit 校验；`#set-bg-note` 提示文案走错分支 |
| **实现思路** | 改成 `const locked = (themeMeta(activeId) || {}).kind === 'kit';`。改完补一条门禁断言（kit 态背景按钮 `disabled` 为 true） |
| **优先级** | **P0**（一行修复，但直接违反「整篇设计锁死」的产品承诺） |

### E-2 🔴 P0 · 更新模块自动更新有 1 条真 FAIL

| 项 | 内容 |
|---|---|
| **描述** | `scripts/pwa_auto_update_test.py` 有 1 条真 FAIL：改写 BUILD_ID 后 90s 内未自动刷新（3/4 通过） |
| **进度** | 🔴 未查 |
| **阻塞点** | ⚠️ **归属更新模块那条线**（`pwa/src/update/*` 正由另一条线在改，**不擅自碰**） |
| **关键文件** | `scripts/pwa_auto_update_test.py`、`pwa/src/update/index.js`（`tryAutoApply:489` `AUTO_RESTART_IDLE_MS = 10min`）、`pwa/public/sw.js` |
| **实现思路** | 先复现并定位是「SW 没装上」还是「页面判定不满足静默条件」。⚠️ 注意 §4.4「AI 按钮验收禁止用固定 sleep」—— **这条也适用**：不能靠固定 sleep 判「没更新」 |
| **优先级** | **P0**（但需与更新模块那条线协调归属） |

### E-3 🟡 P1 · 浏览器套件「变慢到超时」属环境问题

| 项 | 内容 |
|---|---|
| **描述** | 连续跑多个浏览器套件时，后面几个会变慢到超时（单跑全过）。失败集中在等引擎的 4 个套件（ai_format / export / cover / ppmode），报的都是「引擎还没就绪」 |
| **进度** | 🟡 **已定性为环境问题**（2026-11-05）：Pyodide 引擎就绪时间随机器状态浮动（实测 ai_preset 12s → 238s；**同一天单跑也复现**） |
| **阻塞点** | ⚠️ **不是超时值设小了** —— 曾试图放宽，但同一天单跑也复现，**放宽只会掩盖真问题**。换机器或重启后复验 |
| **关键文件** | `scripts/run_gates.py`（超时 900s `:361`）、`docs/INDEX.md` §5.3 E-10 |
| **优先级** | **P1**（换机器/重启后复验即可） |

### E-4 🟡 P1 · 未入库资产需重跑脚本回填

| 项 | 内容 |
|---|---|
| **描述** | `docs/prototypes/data/`（kit 缩略图）与 `docs/prototypes/xhs/v2/assets/`（13MB 字体/图片副本）**不入库**（gitignore） |
| **进度** | 🟡 已知，新 clone 需回填 |
| **关键文件** | `.gitignore:82`、`docs/INDEX.md` §5.3 E-5 |
| **实现思路** | 命令见 §1.4 |
| **优先级** | **P2** |

### E-5 🟡 P1 · `clearAll()` 只删 5 个存储键，实际有 18 个

| 项 | 内容 |
|---|---|
| **描述** | `supersu.*` 存储键共 18 个，散在 5 个模块（app / ai / cover/index / cover/search / update/index），**没有统一注册表**。`clearAll()` 手写清单只删 5 个 → 漏 13 个，**含 2 个 API Key 明文** |
| **进度** | 🟡 未修 |
| **阻塞点** | 无 |
| **关键文件** | `pwa/src/app.js:2351`（`clearAll`）、`app.js:39-82`（`supersuKeys:49` `clearSupersuStorage:61` —— **这两个函数已存在**） |
| **实现思路** | ⚠️ **`app.js:49` 已有 `supersuKeys()`，`:61` 已有 `clearSupersuStorage()`** —— 优先复用它们，而不是再写一份清单（这正是「重复失败要停手」的典型：别造第二套） |
| **优先级** | **P1**（涉及 API Key 明文残留） |

### E-6 🟡 P1 · 存储键无统一注册表（结构性隐患）

与 E-5 同源。每加一个键就会再漏一次 —— 需要一份注册表 + 启动时自检。
来源：`HANDOFF.md` §7.5。

### E-7 ⚪ P2 · `templates.js` 的 `inkForAccent()` 仍是阈值法

应改「黑白择优 + 色块反解压深」—— 中间调（`#d4a04a` / `#00C48C` / `#FF7A00`）两边都到不了 4.5:1。
来源：`HANDOFF.md` §7.5 / §8.3。

### E-8 ⚪ P2 · 封面字体按需加载没进 Cache Storage

7 款可选字体合计约 7.5MB，重复下载体验差。来源：`HANDOFF.md` §8.3。

### E-9 ⚪ P2 · 缺「验收机检脚本」

方案 §13 给了 7 条可机检判据（一屏可见 / 可见性单入口 / 对比度 / 编号唯一 / **缩略图底色去重率** / 九宫格产物 / 无破图），
建议做成 `scripts/ux_v2_accept.mjs`。其中「底色去重率」是新增 —— 「一片同色」这个 bug 已复发两次，
**只有量化能拦住第三次**。来源：`HANDOFF.md` §8.3。

### E-10 ⚪ P2 · 文档「实测快照」会错

上一轮交接稿有 3 处与实测不符（声称未推送实为已推送、声称背景段是半成品实为已写完、漏记一个优先级 bug）。
**教训：文档里的「实测快照」也会错，接手先把取证命令自己跑一遍。**
来源：`docs/wechat/handover-2026-11-03-wechat-p4.md` 开头勘误区。

---

## 3.4 明确被否的方案（**别重开**）

`HANDOFF.md` §6.2 记录了小红书这条线被否掉的方案，**连理由一起记**：

| 被否的东西 | 为什么被否 |
|---|---|
| **全弹窗版**（`xhs-canvas-ux.html`） | 高频切换全塞进弹层，每次换版式都要点开-选-关 —— 用户原话「你这个设计又极简过头了」 |
| **方案 B 侧栏 / 方案 C 双带** | 三方案对比后选了 A（三栏常驻） |
| **15 套自创版式** | 自己编的说不出出处，与「抄优秀开源项目」冲突 → 全换成 `references/layout-recipes.md` 的 M01–M16 / S01–S12 配方 |
| **6 套自造长文模板** | `cards.js` 本来就有 12 套 `LONG_TPLS`，又造了一遍 —— 用户原话「你又自己造轮子！要在原来的基础上增加，不要删除」 |
| **把文字玩法砍到 3 种** | 砍错了，那是已有差异化能力 → 补回 7 种 |
| **把字体砍到 3 款** | 同上 → 补回 10 款 |
| **「另外 6 套风格」按钮** | 改成滚动条后该按钮是纯噪音 |
| **分组标题**「现有版式 · 7 / 新增纯文字版式 · 11」 | 可见性规则表达之后就是噪音 |
| **结果画廊**（`cv-gallery`） | 与「实时预览」是同一张图的两次呈现 —— **删重复，不是删功能** |
| **示例成品墙**（`cv-samples`） | 缩略图改用用户自己的文案实时渲染，比「别人的成品」更贴近决策 |
| **A/B 对比槽 / 版式筛选 / 画布拖拽微调** | 主动放弃：对比槽撑爆右栏；筛选多一层；手动微调等于承认模板不够好 |
| **V1 整版**（3 列 107px） | 对抗性复核发现 5 个 P0（几何按 9 套算、有图不解锁图文版式、九宫格 7/9 空白…） |
| **九宫格专用版式** | 2026-11-06 更新：**已新增专用版式**（10 版式 / 28 配色）+ 逐格空白预警；旧「只做预警」结论作废 |

> 📌 **用户对「不要自己造轮子」和「不要为了精简删除功能」有明确要求** —— 这两条会反复触发。

---

# 4. 踩坑与经验

> 每条格式：**现象 → 根因 → 解决办法 → 涉及文件 → 规避建议**。
> 全部来自仓库里真实存在的代码注释 / 提交记录 / 记忆日志。

## 4.1 构建与发布

### 坑 1 ⭐ PWA 漏加载 `magazine_layouts.py` —— 19 套版式在浏览器里一次都没跑过

| 项 | 内容 |
|---|---|
| **现象** | 点哪套整篇设计都只换配色、不换版式。**本地夹具 228/228 全绿也发现不了** |
| **根因** | `engine.worker.js` 只加载 3 个 py，漏了 `magazine_layouts.py`；而 `format_engine` 对它 `try/except ImportError: MAGAZINE_LAYOUTS = {}` **静默兜底**，不报错。本地夹具跑的是 `core/` 包（`from core.magazine_layouts import`），**绕过了断点** |
| **解决办法** | 构建期断言 —— `engine.worker.js` 必须包含加载行 `'../py/<name>'`（`build.mjs:875-885`） |
| **涉及文件** | `pwa/scripts/build.mjs:875-885`、`pwa/src/engine.worker.js:113-118`（注释 `:107-112` 明写漏了会静默兜底） |
| **规避建议** | ⚠️ **断言必须匹配行为，不能匹配文字** —— 第一次实现用 `includes(name)`，结果断言上方的注释里含 `magazine_layouts.py` 字样，**把断言自己骗成通过**（反向验证照样全绿）。现在断言匹配的是**加载行的真实写法** |

### 坑 2 ⭐ 更新记录版本边界事故 —— 1.14.0 之后连三次发版漏切点

| 项 | 内容 |
|---|---|
| **现象** | 1.16.0 / 1.16.1 / 1.17.0 的改动全被塞进 1.14.0 卡片，线上更新记录最新版本一直停在 1.14.0，用户升级后「看不到这次改了什么」，而**构建一路绿灯** |
| **根因** | `gen_changelog.py` 生成失败只 log 一句、沿用旧 `changelog.json` 就继续构建；且切点靠人手维护 `changelog_milestones.json` |
| **解决办法** | **四层防线**：① 构建期版本对不上**必须阻断**（`build.mjs:520-531` exit 1）② `preflight` 新增 `check_changelog():169-212` ③ `deploy.sh` 复用 preflight `--deploy` 判据（`:76-106`）④ **根因治理**：版本边界改为**从 `pwa/version.json` 的 git 历史自动推导**（`gen_changelog.py:177-191`） |
| **涉及文件** | `pwa/scripts/gen_changelog.py`、`pwa/scripts/build.mjs:497-531`、`scripts/preflight.py:169-212`、`pwa/scripts/deploy.sh:76-106` |
| **规避建议** | 版本边界自动推导后，`changelog_milestones.json` 的 `until` 字段已**不再需要维护**（1.0.0 起全自动）。实测效果：1.17.0 从 77 条降到 10 条；凭空缺失的 1.16.0 自动出现；幽灵版本 1.14.0 自动消失；370 条一条不丢 |

### 坑 3 ⭐ 产品文件不完整时，整块别提交 —— 线上整站 JS 崩溃

| 项 | 内容 |
|---|---|
| **现象** | 2026-11-04 的 P0 热修：线上整站 JS 崩溃 |
| **根因** | 只提 `app.js` 没提 `index.html` 的 DOM（`#settings-dlg` 等），线上 `app.js` 找不到元素 |
| **解决办法** | 补回设置弹窗 DOM，同版本发版 |
| **涉及文件** | `pwa/index.html:319-320`、`pwa/src/app.js` |
| **规避建议** | **产品文件不完整时，整块别提交。** 提交前确认「改了 JS 就得连 DOM 一起改」 |

### 坑 4 push 到 HTTPS 全 URL 后必须同步 `refs/remotes/origin/main`

| 项 | 内容 |
|---|---|
| **现象** | 推完代码，`deploy.sh` 的 git 铁律预检误报「未推送」 |
| **根因** | `origin` 是 SSH（`git@github.com:sulcr1983/wechatca2.git`）但本机无密钥，走 HTTPS 全 URL 推送后**远端跟踪引用没更新** |
| **解决办法** | 推送后必须同步 `refs/remotes/origin/main` |
| **涉及文件** | `scripts/release.py:188-207`（`_push_main`） |
| **规避建议** | token 走 `GIT_CONFIG_*` 环境变量而非命令行（避免进日志） |

### 坑 5 node-shim 拦 `fs.rmSync` —— 改错方向把构建从 2.6s 拖到 145s

| 项 | 内容 |
|---|---|
| **现象** | `build.mjs` 的 `rmrf(DIST)` 报错 |
| **根因** | 执行环境的 node-shim 拦删除操作 |
| **解决办法** | 在**调用侧**（`release.py`）剔除 `NODE_OPTIONS` / `CODEBUDDY_SAFE_DELETE_BULK_GUARD` / `CODEBUDDY_SAFE_DELETE_SANDBOX`（`release.py:91-119`），**不改业务代码** |
| **规避建议** | ⚠️ 曾试图改 build.mjs 的删除逻辑，**把构建从 2.6s 拖到 145s**。这类环境适配**一律在调用侧做** |

### 坑 6 Python 改 `*.md` 会破坏换行符

| 项 | 内容 |
|---|---|
| **现象** | 改一个 md，整个文件变成假改动 |
| **根因** | 仓库换行是**混合**的：根 `README`/`AGENTS`/`files/TODO`/`*.bat` 是 CRLF；`scripts/*.py`、`docs/**`、根 `HANDOFF`/`CLOSURE`/`ARCHIVE` 是 LF。`Path.write_text()` 在 Windows 会把 `\n` 转成 `\r\n` |
| **解决办法** | 要精确保留：用 `read_bytes()` / `write_bytes()` |
| **规避建议** | 改完必看 `git diff --numstat` —— **数字接近文件行数就是换行被改了** |

---

## 4.2 测试与门禁

### 坑 7 ⭐ `run_gates --full` 静默挂死 30 分钟（四层根因叠加）

| 项 | 内容 |
|---|---|
| **现象** | 静默挂死 30 分钟，日志零输出；一次超时留下 8 个 chrome |
| **根因** | ① `run_step` 默认超时 1800s + `subprocess.run` 收集完才写日志 → **死前输出全丢** ② `PARALLEL_SAFE={cover, theme_drawer}` 抢 Pyodide → cover 18s 假红 ③ 超时只 kill 直接子进程 → **Chrome 是孙进程**，残留 ④ **套件成功后也残留浏览器**，累积 28 个拖慢后续套件到超时 |
| **解决办法** | 超时 900s（`run_gates.py:361`）｜保留死前输出（`:392-397`）｜`Popen` + `taskkill /F /T /PID` 按进程树杀（`:345-358`）｜`PYTHONUNBUFFERED=1`（`:379`）｜**清空并行组**（`:172`）｜**每个套件结束都清残留**（`:400-406`） |
| **涉及文件** | `scripts/run_gates.py:160-172`（并行抢 Pyodide 的完整推理）、`:345-406` |
| **规避建议** | ⚠️ **「成功」也要清残留** —— 只在失败时清是不够的，因为残留是累积的 |

### 坑 8 ⭐ 测试脚本禁止在循环里 unlink 临时文件

| 项 | 内容 |
|---|---|
| **现象** | **所有断言都 PASS，但进程退出码 1**，门禁判 FAIL，**报错完全看不出跟断言有关** |
| **根因** | 执行环境有「累计删除」保护（阈值 50）。一个套件渲染 13 版式 × 3 主题 = 50 多次 `tmp.unlink()`；`pwa_auto_update_test.py` 探针是整份 `pwa/dist`（约 444 个文件），无论 `rmtree` 还是逐个 `unlink` 都会撞上 |
| **解决办法** | 改用**固定文件覆盖写**、不删任何东西（`output/` 已 gitignore） |
| **涉及文件** | `scripts/pwa_magazine_layout_test.py:99-113`（含完整复盘注释）、`scripts/pwa_auto_update_test.py:70-72` |
| **规避建议** | **看到「断言全 PASS 但退出码 1」，第一反应查删除计数，不要怀疑断言** |

### 坑 9 ⭐ 端口写死 → TIME_WAIT 假红

| 项 | 内容 |
|---|---|
| **现象** | `PermissionError: [WinError 10013]`、「端口 8096 被占用」，**单跑永远正常** |
| **根因** | 套件写死端口，上一轮遗留的 TIME_WAIT 连接挡住 bind。`run_gates` 会把 `cover` 与 `theme_drawer` **并行**跑，写死 8096/8098 会互抢 |
| **解决办法** | 一律 `("127.0.0.1", 0)` 让系统分配，起完读 `httpd.server_address[1]` |
| **涉及文件** | `scripts/pwa_cover_test.py:48-58`、`scripts/pwa_theme_drawer_test.py:113-125`、`scripts/pwa_longform_test.py:83` |
| **规避建议** | **测试脚本禁止写死端口。** 这不是风格问题，是并行门禁的正确性前提 |

### 坑 10 ⭐ AI 按钮验收禁止用固定 sleep 判「优雅降级」

| 项 | 内容 |
|---|---|
| **现象** | LLM 慢会被误判成「降级成功」→ **假通过** |
| **根因** | 用固定 sleep 等待，然后看有没有报错 → LLM 慢时还没返回，自然「没报错」 |
| **解决办法** | **必须轮询到「真实产出 or 真报错」**，超时未结束判 FAIL |
| **涉及文件** | `scripts/pwa_ai_format_test.py`、`scripts/pwa_ai_preset_test.py` |
| **规避建议** | ⚠️ **这条同样适用于更新模块的自动更新测试**（E-2）—— 不能靠固定 sleep 判「没更新」 |

### 坑 11 ⭐ 断言要守「设计意图」，不是守「某个像素值」

| 项 | 内容 |
|---|---|
| **现象** | P4-4 把缩略图从 `height:104px` 改成 `aspect-ratio:2/1`，线上层断言「高度 ≥96」**立刻变成假标准** |
| **根因** | 断言写死了实现细节，而不是设计承诺 |
| **解决办法** | 改守「**比例 2:1 + 未塌陷 ≥60**」（定稿 §1.3 的真正承诺） |
| **涉及文件** | `scripts/pwa_online_e2e.py`、`docs/INDEX.md` §5.3 E-7 |
| **规避建议** | **先问「设计承诺是什么」，再写断言。** 像素值会变，承诺不会 |

### 坑 12 ⭐ 线上层是独立盲区

| 项 | 内容 |
|---|---|
| **现象** | 2026-11-04 版式扩项上线，**线上层完全没覆盖版式胶囊**（`grep dl-chip` = 0），无人守 |
| **根因** | 线上层套件与本地专项各自演进，没有「本地新功能上线必须同步补线上断言」的纪律 |
| **解决办法** | 补 6 项（15 个胶囊 / 分两段 / 7 个报刊名 / 抽点 3 个验产物） |
| **涉及文件** | `scripts/pwa_online_e2e.py` |
| **规避建议** | ⚠️ **新功能上线必须同步补 `pwa_online_e2e.py` 断言** —— 本地专项再全，也守不住「部署漏文件」「缓存发错版本」 |

### 坑 13 套件描述别写死断言总数

条件分支会让计数浮动（曾出现「说 97 实际 107」的假描述）。`run_gates.py:136-137` 刻意用「线上全量（含版式胶囊 6）」这种描述。

### 坑 14 Windows 管道 GBK → UnicodeEncodeError 假红

子进程必须显式钉 UTF-8：`PYTHONIOENCODING=utf-8` + `PYTHONUTF8=1` + `PYTHONUNBUFFERED=1`（`run_gates.py:368-379`）。
不关缓冲时套件卡住日志里一个字都没有。`release.py:108-113` 同理 —— **不钉 UTF-8，`release.py` 调门禁必然挂，一键发版整个是坏的**。

### 坑 15 量预览产物要读 `#preview` 的 `srcdoc`

读 `innerHTML` **恒为空**（预览是 iframe）。

---

## 4.3 浏览器自动化与系统环境

### 坑 16 ⭐ 禁止另装 Chromium / Playwright 浏览器

必须用系统 Chrome：`C:/Program Files/Google/Chrome/Application/chrome.exe`。
路线：系统 Chrome `--remote-debugging-port=9222 --user-data-dir=<独立目录>` 后台起 →
Playwright `connect_over_cdp("http://127.0.0.1:9222")`。
`playwright install chromium` 的 183MB 国内会卡死。
`agent-browser`（vercel-labs）headed 模式本环境不可用（daemon SIGTERM），别用。

### 坑 17 ⭐ Chrome 窗口堆积

| 项 | 内容 |
|---|---|
| **现象** | 反复跑浏览器套件留一堆空转窗口，累积占 CPU/内存**拖慢后续套件到超时** |
| **根因** | `terminate()` 只杀主进程；Playwright 临时 profile 每个 ~70MB |
| **解决办法** | 一次调用只起**一个** Chrome；`user-data-dir` 用完必删；结束用 `taskkill /F /T /PID` 按进程树杀 |
| **涉及文件** | `scripts/run_gates.py:345-358`（`_kill_tree`）、`scripts/kill_test_processes.py:57-76` |
| **规避建议** | ⚠️ `kill_test_processes.py` 的 `list_chrome()` **只认带 `user-data-dir` 的**，**绝不杀用户日常 Chrome**。⚠️ **验纯 DOM 的东西时别等 Pyodide 引擎就绪**（冷启动常超 100s），否则反复重试 → 窗口堆积 |

### 坑 18 ⭐ 跨工具调用的后台服务不存活

Bash 里 `... &` 起的 Flask / http.server 会在**本次调用结束时被清理**。
→ 「起服务 → 走查 → 关」必须放在**同一次 Bash 调用**内完成。
→ `run_in_background` 起的 server 仍占 `pwa/dist` → rebuild 的 `rmdir` 报 `EBUSY`。

### 坑 19 ⭐ 系统代理（Clash）拦 localhost

| 项 | 内容 |
|---|---|
| **现象** | `curl 127.0.0.1:5000` 返回 502；Playwright 连本地也失败 |
| **根因** | 本机 Clash 系统代理拦 localhost |
| **解决办法** | curl 用 `curl --noproxy '*'`；Playwright 用 `chromium.launch(args=["--no-proxy-server"])` |
| **相关** | `pwa/scripts/deploy.sh:32-33` —— `npx wrangler whoami` 会因代理警告返回非 0 → 「明明有登录态却报没登录」。**改用直接看凭证文件**（`$APPDATA/xdg.config/.wrangler/config/default.toml` / `~/.config/.wrangler/config/default.toml`） |

### 坑 20 ⭐ Service Worker 缓存旧 CSS —— 验证假绿

| 项 | 内容 |
|---|---|
| **现象** | PWA 改样式后浏览器读旧 `style.css`，**验证假绿** |
| **根因** | `style.css` 的 href 没带版本参数，SW + HTTP 缓存命中旧文件 |
| **解决办法** | 量样式前必须 `Network.setCacheDisabled`，或注销 SW + 清 caches |
| **涉及文件** | `pwa/public/sw.js`、`pwa/scripts/build.mjs:38-59` |
| **规避建议** | 产品侧已用 `?h=<sha256>` 哈希键解决（`sw.js:6`）—— **但改 `style.css` 的 href 本身仍需手动清缓存**。⚠️ **新增前端模块要同步 `sw.js` SHELL 清单 + `build.mjs` SHELL_FILES**（手工白名单已于 2026-10-29 废弃，漏了 `src/cover/textmode.js`） |

### 坑 21 截图与视口（Windows 150% 缩放）

| 坑 | 现象 | 正确做法 |
|---|---|---|
| Windows 150% 缩放 | 窗口 1440×900 实际是 CSS 960×600，截图底部一条白、布局只填 2/3 | Chrome 加 `--force-device-scale-factor=1 --high-dpi-support=0` |
| 有头模式 clip 被忽略 | 传 900 仍出 1053 | **视口截图不带 clip**，窗口高 = 目标高 + 浏览器 UI（实测 153） |
| `fromSurface:true` 会挂住 | 页面上同时有多块 1080×1440 合成层时，`captureScreenshot` 等不到稳定帧，进程永久挂起 | 加超时 + 退回 `fromSurface:false` |

工具：`scripts/ux_diag.mjs`（有头多状态 + 抓 console/异常/404）、`scripts/cdp_shot.mjs`（1:1 像素）、`scripts/cdp_measure.mjs`（DOM 量取，snippet 是**带 return 的函数体**）。

---

## 4.4 排版引擎与渲染

### 坑 22 ⭐ 渲染函数读全局，不读传入参数（本项目最高频 bug，已犯 6 次）

| 项 | 内容 |
|---|---|
| **现象** | `state.pal`（缩略图全同色）、`LF.tpl`（长文模板全同）、`pals[0]`、`LF.size`（变 undefined → CSS 整条作废）、`PEXELS_KEY`（清空后版式不回落） |
| **根因** | `cardHtml()` / `pageHtml()` 内部读 `palOf(state.pal)`，**没有 `o.pal` 入参** |
| **解决办法** | 落地时改成显式入参 |
| **涉及文件** | `pwa/src/cover/cards.js`（`palOf`）、`title-page.js`、`longform-page.js` |
| **规避建议** | ⚠️ **不改就会来第七次。** `HANDOFF.md` §8.2 第 3 步就是这一条 |

### 坑 23 加新块类型必须同时改估高函数

`blockH` 只处理 h3/p，加上 list 后 `[...b.text]` 对 undefined 展开 → 整个 build 抛错、`PAGES` 归零、页面全空。

### 坑 24 缺 `</div>` 会让后面的卡全嵌套进上一张

表现为「一张卡高 2156px、名字色点被 overflow 裁掉」。

### 坑 25 动态样式必须加作用域

裸选择器 `.ttl` 是全局的，主画布一竖排，缩略图全跟着竖排。

### 坑 26 `[hidden]` 打不过 `display:flex`

`[hidden]{display:none}` 优先级低，要 `.x[hidden]{display:none!important}`。

### 坑 27 删元素必须同时删事件

删了 `#pals` 的 HTML 却留着 `$('pals').onclick` → `null.onclick` 直接中断启动（0 张卡）。

### 坑 28 `<button>` 定高 + 继承 `line-height:1.6` 会把中文字形顶出盒子

表现为「书法字体被切成一条横带」。真相是 10.5px 太小、笔画断成点；
修法：`display:inline-flex;align-items:center;line-height:1` 且字号 ≥13px。

### 坑 29 中文标题不许孤字成行

字号写死时贪心换行把 7 个字切成 6+1（「周末去了趟海 / 边」）。
修法：`fitTitle` 里否决「最后一行只剩 1–2 个字」。

### 坑 30 量对比度时测量口径必须和渲染口径一致

底色要看祖先链、渐变色标按 alpha 合成、`background-size: … 1px` 的装饰细线**不算文字底色**。
口径不对会批量造出「1.29 的假失败」，**比不测更容易误导**。

### 坑 31 「有反应」≠「产物正确」

本项目最大的系统性盲区：大量断言停在「按钮可用了 / toast 出现了」。
典型：`pwa_headed_full_e2e.py` 对「复制到公众号」只查 `#toast` 可见，**从不读剪贴板内容** ——
而复制富文本是本产品的核心交付动作。
→ **写断言必须验到产物层**（读剪贴板 / 读下载文件字节 / 刷新后逐字比对 / 逐格统计墨迹）。

### 坑 32 测渲染前必须回到「确定态」

比如「复制按钮禁用」，否则 `wait_for_function(启用)` 瞬间返回、读到旧结果。

### 坑 33 线上渲染有约 1 秒滞后，固定 sleep 会误判

要等具体信号（`#boot.gone`、元素出现、文本变化）。

### 坑 34 测移动端先切页签

`.pane-preview{display:none}`，没切到预览页签就 `bounding_box()` 必为 null。

---

## 4.5 数据与状态

### 坑 35 ⚠️ `data/` 目录保护

早前 `tests/test_e2e.py` 无条件把 `data/*.json` 重写为 `[]`（accounts / history / ai_config）；且 `data/` **不入库**，无法从 git 恢复。
→ 改为测试前快照 + atexit 还原。
⚠️ **注意**：`tests/` 目录现已**只剩 `__pycache__`** —— Flask 版套件 2026-10-28 已封存移出，
`tests/test_e2e.py` **已不存在**。`run_gates.py:25-27` 明确警告不要照旧文档跑。

### 坑 36 存储键分散是结构性隐患

`supersu.*` 共 18 个，散在 5 个模块，**没有统一注册表**。`clearAll()` 手写清单只删 5 个 → 漏 13 个，含 2 个 API Key 明文。

### 坑 37 配色不是「加个 accent」就完事 —— `paper` 决定画面重量

10 套「多巴胺」全用近白纸，缩略图里就是一片同色。

### 坑 38 `inkOn` 不能按亮度阈值

中间调（`#d4a04a` / `#00C48C` / `#FF7A00`）两边都到不了 4.5，
必须黑白各算取高，两侧都不够时**把色块本身压深**。

---

## 4.6 文档纪律

### 坑 39 ⭐ 活文档禁写具体数字，一律指向 `STATE.md`

写死数字的文档必然漂移：2026-10-25 踩过一次，**同一时刻 6 份文档写着 6 个不同版本号**。
机检：`scripts/doc_sync_check.py`（含 [G] 段「根目录只能 9 份 md」、[C] 段「归档文档必须有过期声明」、
**[H] 段「md 相对链接可达」**）。

### 坑 40 ⭐ 文档归类纪律

新增 `.md` **放进对应主题目录**（`wechat/` `xhs/` `engine/` `pwa/` `ops/` `research/` `meta/`），
**不要平铺在 `docs/` 顶层**；并回来更新 `docs/INDEX.md` §3。
未完成事项统一写进 `docs/INDEX.md` §5，**不要散落在各文档里**。

### 坑 41 同一份文档里数量必须一致

V1 方案里同时出现「9 套 / 22 套 / 26 套」，还留着互相矛盾的两条规格。
**写规格前先全文搜一遍数字。**

### 坑 42 文档里的「实测快照」也会错

上一轮交接稿 3 处与实测不符。→ **接手先把取证命令自己跑一遍**，别直接信。

### 坑 43 根目录 `.md` 只允许 9 份

README / AGENTS / STATE / HANDOFF / CLOSURE / ARCHIVE / CHANGELOG / THIRD_PARTY_NOTICES / claude。
多一份 `doc_sync_check.py` 的 [G] 段直接报错。
历史与过程记录进 `docs/archive/`，且**开头必须有「已归档 / 已过期」声明**。
**不要新建 `HANDOVER-日期.md` / `docs/task_closure_*.md`** —— 台账进 `CLOSURE.md`（一轮一行）。

### 坑 44 bash heredoc 里的 `\n` 会变字面量

写多行内容用 `python - <<'EOF'`，不要 `echo -e`。

---

# 5. 遗留风险与后续建议

## 5.1 技术债

| # | 债务 | 规模 | 位置 | 建议 |
|---|---|---|---|---|
| 1 | **`app.js` 单文件 2408 行** | 2408 行 | `pwa/src/app.js` | 已按功能分 30+ 区块并有分隔注释。**不建议现在拆**（改动面太大）；但新增功能必须放进对应区块，别再往文件尾堆 |
| 2 | **`cards.js` 单文件 1135 行 / 63KB** | 1135 行 | `pwa/src/cover/cards.js` | 内含解析/数据/CSS/渲染 4 层。CSS 层（`:295-637`，300+ 行）**最值得先抽**（独立成 `.css` 或独立模块） |
| 3 | **存储键无注册表** | 18 个键散 5 模块 | `pwa/src/**` | `app.js:49` 已有 `supersuKeys()`、`:61` 已有 `clearSupersuStorage()` —— **优先复用，别造第二套**（E-5 / E-6） |
| 4 | **死代码未清** | `role:'steps'` 一套 CSS + 一个分支 | `cards.js:583-598` / `:1046-1051` | X-3。建议**启用**而非删除（否则下一个人会以为它能用） |
| 5 | **`inkForAccent()` 阈值法** | — | `templates.js` | 改黑白择优 + 色块反解压深（E-7） |
| 6 | **`render` 函数读全局而非入参** | 已犯 6 次 | `cards.js` / `title-page.js` | X-1 第 3 步处理（§4.4 坑 22） |
| 7 | **原型资产不入库** | 13MB 字体 + 缩略图 | `.gitignore:82` | 有意为之（避免仓库膨胀），但**必须让接手人知道要跑回填脚本**（§1.4） |
| 8 | **AGPL-3.0 分发口径** | — | `LICENSE` / `THIRD_PARTY_NOTICES.md` | ⚠️ 见 §5.3 |

## 5.2 外部依赖与账号 / 环境配置要求

| 依赖 | 用途 | 是否必须 | 缺失时的降级 |
|---|---|---|---|
| **Pyodide 运行时** | 排版引擎 | **必须**（首访下载约 11MB） | 无降级。需自托管 `pwa/public/runtime/`，构建缺目录直接 throw |
| **系统 Chrome** | 全部有头测试 | 测试必须 | 禁止 `playwright install chromium`（国内 183MB 卡死） |
| **Cloudflare Pages 账号** | 部署 | 发布必须 | 凭证：`CLOUDFLARE_ACCOUNT_ID` / `CLOUDFLARE_API_TOKEN`（仓库根 `.env`）或 wrangler 登录态 |
| **GitHub 推送权限** | 推代码 | 发布必须 | `origin` 是 SSH（`git@github.com:sulcr1983/wechatca2.git`）但本机无密钥 → 走 HTTPS + `.env` 的 `GITHUB_TOKEN` |
| **Pexels API Key** | 搜图底图 | **可选** | 无 Key → **不发请求**，提示「填 Key（免费·2分钟）」；纯色模式 / 手动上传不受影响。Key 存 `supersu.cover.stock.v1` |
| **LLM Key**（DeepSeek / 阿里云百炼 / OpenAI 兼容） | AI 润色 / 摘要 / 结构规划 | **可选** | AI 面板默认隐藏；`real_ai` 套件需要 `.env` 有 Key |
| **文生图 Key** | AI 封面图 | **可选** | 无 Key → 该功能不展示 |
| **Node.js** | 构建 | **必须** | — |
| **Python 3.12+** | 门禁 / 生成器 | **必须** | 仓库自带 `.venv/` |

**`.env` 的 15 个 key**（值未读取，仅列名）：
`AI_API_KEY` / `AI_URL` / `AI_MODEL` / `AI_IMAGE_MODEL` / `AI_PLATFORM_ID` /
`LLM_BASE_URL` / `LLM_API_KEY` / `LLM_MODEL` /
`IMAGE_GEN_BASE_URL` / `IMAGE_GEN_API_KEY` / `IMAGE_GEN_MODEL` /
`PEXELS_API_KEY` / `GITHUB_TOKEN` / `CLOUDFLARE_ACCOUNT_ID` / `CLOUDFLARE_API_TOKEN`

> ⚠️ **`.env.example` 与实际 `.env` 不同步**：example 里有 `PORT`（实际 `.env` 没有）；
> 实际 `.env` 多了 `AI_*` 5 个 + `GITHUB_TOKEN` + `CLOUDFLARE_*` 2 个，**example 未列**。
> → **待确认**是有意还是遗漏（见 §6）。建议补齐，否则新人照 example 配会缺 3 个必需凭证。

## 5.3 合规与分发风险（**公开分发前必查**）

| 项 | 事实 | 动作 |
|---|---|---|
| **LICENSE = AGPL-3.0** | 线上「关于」页与此一致 | ✅ 已一致 |
| **AGPL 来源资产** | `references/`、`public/cover-templates/` 逐字同上游 | ⚠️ **不进公开 PWA 构建产物**（`build.mjs:816` 有断言拦 `references` / `prototypes` / `social-thumb`） |
| **微信推送** | 微信 API 必须本地后端 | ⚠️ **推送功能已封存**（Flask 版随 `app.py` 移出）。**当前 PWA 不含推送能力** —— 不要按旧文档实现 |
| **README License 段** | 曾写 MIT，与 LICENSE 文件冲突 | 🔴 **审计 P0-1 未收口** —— 分发前先统一口径 |
| **kit 主题名** | 15 套 kit 保留品牌名（时代周刊 / 卫报 / Vogue 画报…） | ⚠️ 用户经 USPTO 查证后**明确决定保留**，已知风险，**不要再劝改** |

## 5.4 需要他人协助确认的事项

| # | 事项 | 找谁 | 为什么需要 |
|---|---|---|---|
| 1 | **26 套版式要不要一屏全看？** | **产品负责人（苏哥）** | 现在 16 套全见、26 套滚 1.2 行。全见需 5 列 × 74px → 决定右栏宽度与缩略图尺寸。**影响 X-1 的骨架数值** |
| 2 | **「有图才出图文版式」这个修订落不落？** | **产品负责人** | V2 按「有没有图」判断，**偏离了用户原话**（原话是「没 API 只显示纯文字」）→ 决定 V2 决策 3 是否成立 |
| 3 | **九宫格要不要专用版式？** | **产品负责人** | 现在是「预警 + 一键铺满」。要「9 张都好看」是另一个功能 |
| 4 | **长图文 13 套配色要不要并入标题图那 20 套？** | **产品负责人** | 两套来源不同，部分不达 AA。**合并前要先定口径** |
| 5 | **「外链转脚注」在网页端是否要支持？** | **产品负责人** | W-1：引擎有能力但 PWA 不调用 —— 是「不支持」还是「接线漏了」？ |
| 6 | **`steps` 角色：启用还是删除？** | **产品负责人 + 开发** | X-3：影响长图文分页口径 |
| 7 | **E-2 自动更新 FAIL 的归属** | **更新模块那条线的负责人** | `pwa/src/update/*` 正由另一条线在改，**不擅自碰** |
| 8 | **`.env.example` 是否补齐 3 个凭证 key** | **仓库维护者** | 见 §5.2 末尾 |
| 9 | **README License 段统一口径** | **法务 / 仓库维护者** | AGPL-3.0 vs MIT 冲突 |

## 5.5 后续建议（按建议执行顺序）

### 立刻可做（半天内，不依赖任何人）

1. **修 E-1（kit 背景锁定）** —— `app.js:2323` 一行改法 + 一条门禁断言。
   顺带把 E-5/E-6 一起做：`clearAll()` 改用已有的 `clearSupersuStorage()`。
2. **修 W-2（`<h2>` 语义）** —— `format_engine.py:2039-2052` 改成保留 h2 标签 + 引擎级断言。
3. **统一主题计数口径**（W-3）—— 先跑 `doc_sync_check.py` 看它认哪个口径，再改文档。
4. **push 本地领先的 1 个提交** —— 否则 `deploy.sh` 的 git 铁律预检会拦部署。

### 需要产品拍板（先问，再动手）

5. **X-1 标题图 UX V2 落地** —— 按 `HANDOFF.md` §8.2 的 8 步顺序做，**每步补产物级断言**。
   动手前先拿到 §5.4 的 #1 / #2 两个答复（它们直接决定骨架数值）。
6. **X-2 九宫格空白预警** —— 不依赖拍板，可与 X-1 并行。
7. **X-3 / X-4 / X-5** —— 需要 #6 / #4 答复。

### 需要环境或他人配合

8. **E-2 自动更新 FAIL** —— 先复现定位，再与更新模块那条线对齐归属。
9. **E-3 环境问题** —— 换机器或重启后复验（**不要放宽超时来掩盖**）。
10. **§5.3 合规收口** —— README License 口径、`.env.example` 补齐。

### 方法论建议（比具体任务更重要）

> **本项目历史上最大的浪费不是写错代码，是「测试绿了但功能坏着」。**

- **每个新功能上线前先问：「产物层怎么验？」** —— 读剪贴板 / 读下载字节 / 刷新后逐字比对，
  而不是「按钮可点了」
- **每个新断言先问：「设计承诺是什么？」** —— 而不是「现在实现是几 px」
- **每个新功能上线必须同步补 `pwa_online_e2e.py`** —— 本地专项再全也守不住部署漏文件
- **接手任何文档前，先把取证命令自己跑一遍** —— 文档里的「实测快照」也会错

---

# 6. 待确认清单

> 以下内容**无法从代码/命令确认**，需人工核实后回填。

| # | 待确认项 | 建议核实方式 | 影响 |
|---|---|---|---|
| 1 | **45 个早期经典主题（`aurora`/`ink`/`github` 等）的生成来源** —— 不在 `scripts/theme_specs.py` 的 119 条 `SPECS` 中，推测是历史遗留手工 JSON | 查 git 历史 `git log --diff-filter=A -- public/themes/aurora.json` | 主题体系的可维护性（改 spec 能否覆盖它们） |
| 2 | **`docs/INDEX.md` §5.2 X-1「9 个文件未提交改动（含 cards.js +133 行）」已不成立** —— 实测工作区干净、`git log --numstat` 无任何 `+133` 提交 | 已实测确认，建议**改文档**（本文已记录） | 文档准确性 |
| 3 | **`pwa/dist/` 与 `pwa/src/` 的同步保证** —— `pwa/dist/` 被 gitignore，本次实测 3 个 py 与 `app.js` 均 SAME，但未逐项 diff 全量 | 跑 `node pwa/scripts/build.mjs` 后全量 diff | 部署漏文件风险 |
| 4 | **`dist/themes/` 185 个 JSON vs 源 `public/themes/` 183 个** —— 差异应是 `index.json` + `manifest.json`（构建断言 `build.mjs:829-833` 保证主题数与索引一致），但未逐文件核对 | `ls pwa/dist/themes/ \| grep -v '\.json$'` + 逐个核对 | 低（构建断言已覆盖） |
| 5 | **现行代码里长图文右栏的真实 `scrollHeight`/`clientHeight`** —— X-4 的 `1013/854` 出自原型，生产代码无 `.side-scroll` 容器 | 起服务后量 `#longform-root .cv-col-right` | X-4 的修复方案量化 |
| 6 | **`public/cover-templates/` 10 个物理目录与 `TEMPLATE_STYLES` 的显式映射** —— `templates.js:583` 按 id 取文件，但代码里未显式建模 `magazine-tpl`/`swiss-tpl` 两个 layout 到 10 个目录的对应 | 读 `templates.js` 的取文件逻辑 + 跑 `scripts/cover_tpl_unit.mjs`（运行时读目录数，会打印「模板数：10」） | 新增模板时的接入点 |
| 7 | **`gen_changelog.py` 的 `NOISE_RE` 具体正则** —— 只读到引用点 `:670` | 读 `gen_changelog.py` 的 `NOISE_RE` 定义 | 更新记录的噪音过滤口径 |
| 8 | **`run_gates.py` 提示文案「加 --full-gates 才跑」与实际 argparse 不符** —— `run_gates.py` 只有 `--local`，没有 `--full-gates`（那是 `release.py` 自己的参数名） | 读 `run_gates.py:503` 的提示文案 | 文案 bug（不影响功能） |
| 9 | **`changelog.js:702` 的反馈邮箱** 与发布小票邮箱是否一致 | 对照 `pwa/src/update/changelog.js:702` 与发布小票配置 | 反馈入口可达性 |
| 10 | **`pwa/manifest.webmanifest` 的 `version` 字段** 与 `pwa/version.json` 的同步关系 | 读 manifest 内容 | PWA 安装体验 |
| 11 | **`.env.example` 未列 3 个凭证 key 是有意还是遗漏** | 问仓库维护者 | 新人配置成本 |
| 12 | **`pwa/scripts/smoke.py`（13KB）/ `fetch_fonts.py` / `make_icons.py` 的职责** | 读这三个文件 | 低 |

---

## 附录 A：本文的取证命令（可复现）

```bash
cd /d/test/wechatca2

# 状态与基线
git status --porcelain -uall          # 工作区干净
git log origin/main..HEAD --oneline   # 领先远端 1 个提交
git rev-list --count HEAD              # 443
.venv/Scripts/python.exe scripts/preflight.py
curl -s --noproxy '*' -A "Mozilla/5.0" https://supersu.ccwu.cc/version.json

# 结构计数
ls public/themes/*.json | wc -l        # 183
ls public/cover-templates/ | wc -l     # 10
ls pwa/src/cover/ | wc -l              # 15

# 源码同步
for f in format_engine.py preprocessor.py magazine_layouts.py; do
  diff -q core/$f pwa/dist/py/$f && echo "$f SAME"; done
diff -q pwa/src/app.js pwa/dist/src/app.js && echo "app.js SAME"

# 关键调用点
grep -n "extract_links_as_footnotes" core/format_engine.py
grep -n "LAYOUT_OPTIONS = \[" pwa/src/app.js
grep -n "_rewrite_h2_as_row" core/format_engine.py

# E-1 运算符优先级实测
node -e "const m={kind:'kit'};
console.log('仓库写法:', !!(m||{}).kind==='kit', '| 正确写法:', (m||{}).kind==='kit');"
```

## 附录 B：三个板块的文件速查

| 板块 | 核心文件 | 关键行 |
|---|---|---|
| **A 公众号排版** | `pwa/src/app.js` | `LAYOUT_OPTIONS:770` `themeMeta:500` `applyKitLock:614` `renderLayouts:827` `copyRich:1097` `openSettings:2243` `renderBgGrid:2320` **`setBg:2344`** `clearAll:2351` |
| | `core/format_engine.py` | **PWA 入口 `:3535`** `_rewrite_h2_as_row:2039` `LAYOUT_REGISTRY:3307` `extract_links_as_footnotes:364` |
| | `core/magazine_layouts.py` | `MAGAZINE_LAYOUTS:1449`（19 个版式）`decorate_sections:332` |
| | `pwa/src/style.css` | 抽屉 `309` 缩略图 **`438`/`441`** 设置弹窗 `629` 字号滑块 `595` |
| **B 标题图** | `pwa/src/cover/title-page.js` | `mountTitlePage:591` `schedulePreview:494` |
| | `pwa/src/cover/catalog.js` | `ALL_STYLES:102` `LAYOUTS:106` |
| | `pwa/src/cover/search.js` | `PEXELS_API:126` `searchBackground:231` `fetchImageDataUrl:285` |
| | `pwa/src/cover/analyze.js` | `analyzeImage:150` `pickBandAndInk:271` |
| **C 长图文** | `pwa/src/cover/cards.js` | `buildLong:816` `cardInner:978` `ROLES:285` `LONG_TPLS:140` `PALETTES:93` `cardCss:635` |
| | `pwa/src/cover/story.js` | `buildStorySet:116` `renderPageDoc:60` |
| | `pwa/src/cover/longform-page.js` | `mountLongformPage:386` 右栏 DOM `:448-479` |
| **共用底座** | `pwa/src/nine.js` | `splitGrid:78` `zipTiles:132` |
| | `pwa/src/export.js` | `exportLongImage:116` `exportImages:251` |
| | `pwa/src/update/index.js` | `APP_VERSION:43` `checkNow:202` `applyUpdate:539` |
| | `pwa/public/sw.js` | `SHELL_CRITICAL:55-62` 清单占位符 `:45-52` |

---

**整理时间**：2026-11-06
**代码基线**：`main` @ `c80c542`（443 提交 · 工作区干净 · 领先远端 1 提交）
**作者**：吴八哥（AI 助手）· 复核方式见附录 A
**⚠️ 本文件与 `STATE.md` 冲突时以 `STATE.md` 为准；与 `docs/INDEX.md` §5 冲突时以本文的「实测结论」列为准。**
