# 交接说明 — SuperSu PWA（全系统）

> **这份文件回答四件事**：这套系统是什么、接手的人 30 分钟怎么跑起来、哪些坑已经踩过、
> 还有哪些事没做完。**不是**进度汇报，也不是方案文档。
>
> **具体数字**（版本号、构建号、线上状态、门禁结果、主题套数）**一律不写在这里** ——
> 它们在 [`STATE.md`](STATE.md)，由 `scripts/gen_state.py` 从 `version.json` 与门禁日志生成。
> 写死数字的文档必然漂移：2026-10-25 踩过一次，同一时刻 6 份文档写着 6 个不同版本号。
>
> 最后更新：2026-11-02（15 个杂志风版式 + 15 套整篇设计 + 编辑器图片能力落地）
> 校验：`python scripts/doc_sync_check.py`

---

## 0. 先看清状态，别上来就写代码

| 面 | 代码状态 | 说明 |
|---|---|---|
| 排版引擎 / 公众号排版 | ✅ 线上运行 | `core/` + `public/themes/` + `pwa/src/app.js` |
| **15 个杂志风版式 + 15 套整篇设计（kit）** | ✅ **已落地**（2026-11-02） | `core/magazine_layouts.py` + `public/themes/mg-*.json` |
| **编辑器图片（粘贴/上传/搜图/AI 关键词）** | ✅ **已落地**（2026-11-02） | `pwa/src/editor-images.js` + `app.js` + `ai.js` |
| 三模块 IA（排版 / 标题图 / 长图文） | ✅ 线上运行 | `pwa/src/cover/index.js` 的顶栏三 tab |
| 小红书标题图 | ✅ 线上运行（旧版 UI） | `pwa/src/cover/title-page.js` |
| 小红书长图文 | ✅ 线上运行（旧版 UI） | `pwa/src/cover/longform-page.js` |
| **封面 UX 重做（本文 §6 那一条线）** | ⚠️ **只有原型，`pwa/src` 一行未改** | `docs/prototypes/xhs/v2/` |

**判断某件事到底做了没有，只看两处**：`pwa/src/**` 有没有对应代码 + `CLOSURE.md` 有没有那一行台账。
**不要相信任何方案文档里的"已实现"** —— 这条被违反过不止一次。

---

## 1. 系统全貌

一个**纯前端 PWA**（Cloudflare Pages），把三件原本分散的事合成一个工具：

```
┌───────────────────────────────────────────────────────────────────┐
│                                                                   │
│ 顶栏：[公众号排版] [小红书标题图] [小红书长图文]           ↻ 更新 │
│                                                                   │
│ ① 公众号排版      文章 → 主题 → 复制到公众号                      │
│    引擎：core/preprocessor.py + core/format_engine.py             │
│          + public/themes/*.json（构建时拷进 pwa/dist/py/）        │
│                                                                   │
│ ② 小红书标题图    一句话 → 1080×1440 封面                         │
│    pwa/src/cover/{title-page,catalog,layouts,templates,cards}     │
│                                                                   │
│ ③ 小红书长图文    长文 → 分页 → N 张卡片                          │
│    pwa/src/cover/{longform-page,story,cards}.js                   │
│                                                                   │
├───────────────────────────────────────────────────────────────────┤
│                                                                   │
│ 底座：搜图 search.js · 底图可读性 analyze.js · 九宫格 nine.js     │
│       导出 export.js · 备份 backup.js · 更新 update/              │
└───────────────────────────────────────────────────────────────────┘
```

**拆的是产品面，不是代码**：渲染管线、模板目录、搜图、可读性分析、分页算法一份代码，
两个小红书模块各自的 UI 与状态。这一点写进了 `docs/xhs/design-module-split-ia.md`（R1/R2 决策）。

### 三个模块为什么这么分

- **标题图是大众需求**：打开即用，首屏看不见任何"长文"概念（用户 R1 原话：
  「标题图和长图长文应该是两个没有关联的模块，做标题就是做标题，这个是最多人的需求」）。
- **长图文是独立工具**：有自己的文章输入、分页、配色、导出整套。
- **排版是另一条管线**：走 `core/format_engine.py`，与封面完全独立，共用主题数据而已。

---

## 2. 目录地图（只列接手要用到的）

```
app.py / templates/          Flask 版，**已封存**，取回方式见 ARCHIVE.md
core/                        引擎 4 模块：preprocessor / format_engine / browser_utils / …
public/themes/               主题 JSON（构建时拷进 dist）
public/images/               示例图（封面原型与搜图降级都用它）
pwa/
  src/                       前端源码：app.js / ai.js / export.js / nine.js / images.js
    cover/                   ★ 封面模块 15 个文件，见下表
    update/                  更新检查与面板
  scripts/build.mjs          构建（dist 不入库，别手改）
  scripts/deploy.sh          部署
  scripts/changelog_milestones.json   发版里程碑（until 是右闭边界）
  version.json               语义化版本（只在发版时改）
  public/sw.js               Service Worker 清单（与 build.mjs 必须同步）
scripts/
  run_gates.py               门禁总入口
  doc_sync_check.py          文档一致性机检（含"根目录只能 9 份 md"）
  gen_state.py               生成 STATE.md
  ux_diag.mjs                ★ 2026-11-01 新增：有头多状态截图 + 抓错
  cdp_shot.mjs / cdp_measure.mjs   零依赖 CDP 截图 / 量取
  gen_v2_palettes.mjs        ★ 配色对比度反解与校验
docs/
  xhs/design-xhs-studio-final.md         ★ 封面 UX 现行方案（V2）
  xhs/review-xhs-studio-adversarial.md   ★ 对 V1 的对抗性复核（全部实测数据）
  prototypes/v2/                     ★ V2 可交互原型（自包含，13MB）
  prototypes/ux-*.html               V1 原型与三方案对比（历史）
  archive/                           历史快照（全部带"已过期"声明）
```

### `pwa/src/cover/` 里都是什么

| 文件 | 职责 |
|---|---|
| `index.js` | 壳：顶栏三 tab 的页面互斥 |
| `title-page.js` | 标题图页（左文案 / 中预览 / 右版式） |
| `longform-page.js` | 长图文页 |
| `catalog.js` | **版式与模板目录**：`LAYOUTS` / `LAYOUT_PALETTES` / `TEMPLATE_STYLES` |
| `layouts.js` | 四个版式的真实渲染（image-led / quote / number / list） |
| `templates.js` | magazine / swiss / bigtype 三套 + `inkForAccent()` |
| `cards.js` | 长文的 12 套 `LONG_TPLS` + `CARD_CSS_RAW` + 分页 |
| `story.js` | 长文成套生成 |
| `textmode.js` | `TEXT_FONTS` + `TEXT_MODES`（7 种文字玩法） |
| `analyze.js` | 底图可读性（sRGB 反解暗角 α） |
| `search.js` | 搜图：Pexels → Pixabay → Wikimedia 三级降级 |
| `render.js` / `ui.js` / `bg-picker.js` / `cover.css` | 出图、UI 工具、背景选择、样式 |

---

## 3. 30 分钟上手

```bash
.venv/Scripts/python.exe -V                                  # 需要 Python 3.12+
node pwa/scripts/build.mjs                                   # 构建 dist（不入库）
python -m http.server 8899 --directory pwa/dist               # 本地预览
.venv/Scripts/python.exe scripts/run_gates.py                 # 门禁
```

首次打开要下 Pyodide（约 11MB），进度条走完才算就绪。
**引擎就绪的可观测信号是 `#boot` 加上 `gone` class** —— `window.__engineReady` 是模块内的，拿不到
（写 E2E 时踩过）。

### 看封面 UX 原型（不需要构建）

```bash
python -m http.server 8126                                   # 仓库根起服务
# 然后开 http://127.0.0.1:8126/docs/prototypes/xhs/v2/index.html
```

`docs/prototypes/xhs/v2/` 是**自包含**的：内核、字体、示例图都在 `v2/assets/` 里。
不要把它改回 `../` 相对路径 —— 原型会被当静态站点托管（只暴露该目录），父级一律 404。

`v2/assets/` **不入库**（13MB 的字体/图片副本，字体本来就在 `pwa/public/fonts`）。
新克隆下来跑一次就行：

```bash
mkdir -p docs/prototypes/xhs/v2/assets/{fonts,img}
cp pwa/public/fonts/cover/*.woff2 docs/prototypes/xhs/v2/assets/fonts/
cp public/images/{09-snow-bike,05-swing,02-night-street,06-desk-lamp,03-school-bus,07-radio}.jpg \
   docs/prototypes/xhs/v2/assets/img/
```

没回填也能打开页面，只是字体退回系统默认、示例图点了会提示「打不开」。

---

## 4. 发版（两件事缺一不可，顺序别换）

1. bump `pwa/version.json`（**只在发版时改**）
2. 在 `pwa/scripts/changelog_milestones.json` 加一条里程碑（`until` 是**右闭边界**）

然后 `build` → 提交 → `push` → 部署。跳过任何一步都会出现「点了更新没反应」或「更新记录空白」。

```bash
& "C:\Program Files\Git\bin\bash.exe" pwa/scripts/deploy.sh
# 没有 E:/test/opendoor/.env 时用设备码 OAuth：
#   npx --yes wrangler@latest login --device
#   npx --yes wrangler@latest pages deploy pwa/dist --project-name=supersu-pwa --branch=main
```

**`until` 写错的后果**：上一版若写 `23:59:59` 而新版提交在同日更早，新版本会分到 0 条、
`gen_changelog.py` 自检直接报错。上一版 `until` 必须收到它最后一次提交之后一点点。

`scripts/release.py` 只自动提交 4 个生成物（CHANGELOG / changelog.json / version.json / STATE），
**源码改动必须先手工 commit**，否则第 6 步直接中止。

---

## 5. 各子系统现状（一句话 + 已知问题）

| 子系统 | 一句话 | 已知问题 |
|---|---|---|
| 排版引擎 | Python + Pyodide，**19 个版式**（原 4 + 新增 15 个杂志风），主题全量 JSON 驱动 | 改字号只改 `SCALE` 一处即全量生效（2026-10-29 已对齐业界比例） |
| 公众号排版 | 三模式自动编辑 + 主题选择 + 复制 | 移动端排版已归一（色块标题居中折行、长 URL 撑破、图注对比度） |
| **杂志风版式（15 个）** | `core/magazine_layouts.py`，参数源自 14 张截图 + 12 段文案 | 出口有保真闸门，文字变少就原样返回；只用微信安全区样式 |
| **整篇设计 kit（15 套）** | `public/themes/mg-*.json`，带 `kind:"kit"` + `locked_layout` | 选中后版式与配色锁死，需点「改回可组合版式」退出 |
| **编辑器图片** | 粘贴/上传 → 压缩 → data URI；复制时自动内嵌外链图 | 复制超过 8MB 会提示改用长图导出；GIF 不压缩保动画 |
| 小红书标题图 | 一句话 → 1080×1440 | **UI 是旧版**：右栏 3 列 107px，26 套里同屏只见 10 张（见 §6.3） |
| 小红书长图文 | 长文 → 自动分页 → 成套导出 | 右栏要滚才能看到配色（V2 已修原型，未落地） |
| 更新链路 | 静默检查 + 面板 | 面板不在 `#update-root`（那只是静态模板），真面板 `#cl-layer` 挂 body |
| 搜图 | Pexels → Pixabay → Wikimedia 三级降级 | 国内直连 Wikimedia 超时，判废；Key 存 `supersu.stock.keys` |
| 九宫格 | 一张图切 3×3 | **产物可能 7/9 张空白**，界面无预警（见 §6.3 P0-4） |

---

## 6. 小红书封面这条线：探索 → 被否 → 定版

这是本项目里反复最多的一条线，**理解它的历史比读代码更重要** —— 因为大部分返工都来自
「上一轮把功能删了 / 上一轮的前提没重算」。

### 6.1 三个阶段

| 阶段 | 时间 | 做了什么 | 结果 |
|---|---|---|---|
| 一 | 10-24 ~ 10-25 | 封面模块从零做：`cover-gallery` → `cover-lab` → `cover-studio` 三个原型迭代；主题从 12 套扩到现在的量级（套数见 STATE.md）；搜图定三级降级 | 上线 |
| 二 | 10-30 ~ 10-31 | 标题图 v2（`xhs-text-card`）、**三模块 IA 拆分上线**、Studio 重设计 Phase 3 主体迁移 | 上线 |
| 三 | 11-01 | 画布 UX 重做：三方案选型 → V1 定版 → **对抗性复核推翻** → V2 重做 | 只有原型 |

### 6.2 被否的方案（连理由一起记，别重开）

| 被否的东西 | 为什么被否 | 用户原话 / 证据 |
|---|---|---|
| **全弹窗版**（`xhs-canvas-ux.html`） | 高频切换全塞进弹层，每次换版式都要点开-选-关 | 「你这个设计又极简过头了。啥都弹窗了……因为要常常切换的」 |
| **方案 B 侧栏 / 方案 C 双带**（`ux-b-rail` / `ux-c-dual-band`） | 三方案对比后选了 A（三栏常驻） | 「a 这种可以」 |
| **15 套自创版式**（左右分栏 / 卡片浮层 / 网格纸 / 贴纸 / 叠压…） | 自己编的，说不出出处，且和"抄袭优秀封面"的要求冲突 | 「你不要自己设计页面啊，你要去网络搜索同类设计封面的优秀开源项目…抄过来」→ 全部换成 `references/layout-recipes.md` 的 M01–M16 / S01–S12 配方 |
| **6 套自造长文模板**（杂志纸 / 极简白 / 墨夜 / 沙丘 / 克莱因 / 薄荷） | `cards.js` 里本来就有 12 套 `LONG_TPLS`，又造了一遍 | 「长图文的模版版式已经很多了！你又自己造轮子！要在原来的基础上增加，去重新设计，不要删除」 |
| **把文字玩法砍到 3 种** | 砍错了，那是 pwa 里已有的差异化能力 | 「不要为了精简删除功能」——补回 7 种 |
| **把字体砍到 3 款** | 同上 | 补回 10 款（含 7 款免费商用书法字体） |
| **「另外 6 套风格」按钮** | 改成滚动条之后，这个按钮就是纯噪音（暗示"还有隐藏的"） | 「现在采用滚动条，就不再需要 另外6套风格 了吧？」 |
| **分组标题**「现有版式 · 7 / 新增纯文字版式 · 11」 | 分组本来是为了解释"为什么少了几套"，可见性规则表达之后就是噪音 | 「这些字没必要写吧？」 |
| **结果画廊**（`cv-gallery`） | 「实时预览」和「标题图结果」是同一张图的两次呈现 | 有意删除，**不是删功能，是删重复** |
| **示例成品墙**（`cv-samples`） | 缩略图改成用用户自己的文案实时渲染，比"别人的成品"更贴近决策 | 有意替换 |
| **A/B 对比槽 / 版式筛选 / 画布拖拽微调** | 主动放弃：对比槽会把右栏撑爆；筛选多一层；手动微调等于承认模板不够好 | 方案 §8「取舍说明」 |
| **V1 整版**（3 列 107px 那份） | 对抗性复核发现几何还是按 9 套算的、有图不解锁图文版式、九宫格 7/9 空白等 5 个 P0 | 见 §6.3 |
| **九宫格专用版式** | 没做。用「预警 + 一键把标题放大铺满」替代（复用已有 `tmode=poster`） | 仍是待拍板项 |

### 6.3 V2 的五个核心决策（都有实测，别再凭感觉改回去）

| # | 决策 | 依据 |
|---|---|---|
| 1 | 三栏 **236 / 684 / 520**（原 224/856/360） | 画布被**高度**约束，中栏 856 里只有 591 是画布，237px 加宽毫无用处；让给右栏 |
| 2 | 版式 **5 列 × 94px**，16 套一屏全见 | V1 3 列 107px 时同屏只见 10 张、第 4 行切一半（用户三次抱怨"版式只剩几套"的真正原因） |
| 3 | 可见性绑「**有没有一张图**」，不绑 Key | V1 上传自己的照片后图文版式仍 0 套，还挂着"配个 Key 就出现" |
| 4 | 配色 **20 套三族**（纸感 9 / 浓郁 6 / 暗夜 5） | V1 的"多巴胺"只改 accent、paper 全近白 → 16 张缩略图只有 7 种底色，"淡黄"变"淡粉" |
| 5 | 色块压字用**黑白择优 + 色块反解压深** | V1 的 `inkOn()` 是亮度阈值，23 套里 11 套不达 4.5:1，最差 2.26 |

配套的两个硬规矩（写进方案 §11）：

- **高频切换的东西，一屏至少露出 3 行 / 12 个**。做不到就压缩表现，不让它滚。
- **每套版式的配色里必须有纸感和暗夜各一**。不允许出现"这一套只有暖色"。

---

## 7. 坑清单（每条都真踩过）

### 7.1 工程纪律

- `pwa/dist/` 是构建产物（gitignore）：**永远不要手改**。改源码后必须重新 build，否则门禁测的是旧产物。
- 新增前端模块 / 改 `SHELL_FILES` / `SHELL_OPTIONAL`：`pwa/public/sw.js` 与 `pwa/scripts/build.mjs`
  **两处清单必须同步**，漏一处就是「离线缺文件」或「更新拿不到新文件」。
- 真实 AI Key 只放本地 `.env`；线上由用户自己填。
- 浏览器统一用系统 Chrome，**不 `playwright install chromium`**（国内 183MB 会卡死）。
- **不要全局杀浏览器**（`taskkill /IM chrome.exe`）。用户已明确制止过一次；自动化一律用独立
  `--user-data-dir`。
- `.bat` 必须 **CRLF + 纯 ASCII**（`.gitattributes` 已锁）。UTF-8 中文会让 cmd 错位吃行首。

### 7.2 测量与测试（「测试绿了但功能坏」的元凶）

- **「有反应」≠「产物正确」**。本项目最大的系统性盲区：大量断言停在「按钮可用了 / toast 出现了」。
  典型：`pwa_headed_full_e2e.py` 对「复制到公众号」只查 `#toast` 可见，**从不读剪贴板内容** ——
  而复制富文本是本产品的核心交付动作。写断言必须验到产物层（读剪贴板 / 读下载文件字节 /
  刷新后逐字比对 / 逐格统计墨迹）。
- **判据不能拍脑袋**：长图高度没有「必须 > 400px」这种规矩，短文 375px 就是对的 —— 先看真实产物再定阈值。
- 测渲染前必须回到**确定态**（比如「复制按钮禁用」），否则 `wait_for_function(启用)` 瞬间返回、读到旧结果。
- 线上渲染有约 1 秒滞后，**固定 `sleep` 会误判**；要等具体信号（`#boot.gone`、元素出现、文本变化）。
- 量对比度时**测量口径必须和渲染口径一致**：底色要看祖先链、渐变色标按 alpha 合成、
  `background-size: … 1px` 的装饰细线不算文字底色。口径不对会批量造出「1.29 的假失败」，比不测更容易误导。
- **测移动端先切页签**：`.pane-preview{display:none}`，没切到预览页签就 `bounding_box()` 必为 null。
- **端口冲突会让门禁假失败**：某个套件 0 秒失败，先查 8096–8098 是否被别的会话占用。

### 7.3 截图与视口（2026-11-01 新增，三个坑连着踩）

| 坑 | 现象 | 正确做法 |
|---|---|---|
| Windows 150% 缩放 | 窗口 1440×900 实际是 CSS 960×600，截图底部一条白、布局只填 2/3 | Chrome 加 `--force-device-scale-factor=1 --high-dpi-support=0` |
| 有头模式 clip 被忽略 | 传 900 仍出 1053；`Page.getLayoutMetrics` 也报 1053 | **视口截图不带 clip**，窗口高 = 目标高 + 浏览器 UI（实测 153） |
| `fromSurface:true` 会挂住 | 页面上同时有多块 1080×1440 缩放合成层时，`captureScreenshot` 等不到稳定帧，进程永久挂起 | 加超时 + 退回 `fromSurface:false` |

工具：`scripts/ux_diag.mjs`（有头多状态 + 抓 console/异常/404）、`scripts/cdp_shot.mjs`（1:1 像素）、
`scripts/cdp_measure.mjs`（DOM 量取，snippet 是**带 return 的函数体**，不是整个 script）。

### 7.4 渲染与样式（这一类的复发率最高）

- **渲染函数读全局，不读传入参数** —— 本项目最高频的 bug，已犯 6 次：
  `state.pal`（缩略图全同色）、`LF.tpl`（长文模板全同）、`pals[0]`、`LF.size`（变 undefined→CSS 整条作废）、
  `PEXELS_KEY`（清空后版式不回落）。
  **根因**：`cardHtml()` / `pageHtml()` 内部读 `palOf(state.pal)`，没有 `o.pal` 入参。
  落地时必须改成显式入参，否则还会来第七次。
- **加新块类型必须同时改估高函数**：`blockH` 只处理 h3/p，加上 list 后 `[...b.text]` 对 undefined 展开 →
  整个 build 抛错、`PAGES` 归零、页面全空。
- **缺 `</div>` 会让后面的卡全嵌套进上一张**：表现为「一张卡高 2156px、名字色点被 overflow 裁掉」。
- **动态样式必须加作用域**：裸选择器 `.ttl` 是全局的，主画布一竖排，缩略图全跟着竖排。
- **`[hidden]` 打不过 `display:flex`**：`[hidden]{display:none}` 优先级低，要 `.x[hidden]{display:none!important}`。
- **删元素必须同时删事件**：删了 `#pals` 的 HTML 却留着 `$('pals').onclick`，`null.onclick` 直接中断启动（0 张卡）。
- **`<button>` 定高 + 继承 `line-height:1.6` 会把中文字形顶出盒子** ——
  表现为「书法字体被切成一条横带」。真相是 10.5px 太小、笔画断成点；修法是 `display:inline-flex;align-items:center;line-height:1` 且字号 ≥13px。
- **中文标题不许孤字成行**：字号写死时贪心换行把 7 个字切成 6+1（「周末去了趟海 / 边」）。
  修法：`fitTitle` 里否决「最后一行只剩 1–2 个字」。

### 7.5 数据与状态

- **存储键分散是结构性隐患**：`supersu.*` 共 18 个，散在 5 个模块（app / ai / cover/index /
  cover/search / update/index），**没有统一注册表**。`clearAll()` 手写清单只删 5 个 → 漏 13 个，
  含 2 个 API Key 明文。每加一个键就会再漏一次。
- **配色不是「加个 accent」就完事**：`paper` 决定画面重量。10 套"多巴胺"全用近白纸，
  缩略图里就是一片同色。
- **`inkOn` 不能按亮度阈值**：中间调（#d4a04a / #00C48C / #FF7A00）两边都到不了 4.5，
  必须黑白各算取高，两侧都不够时**把色块本身压深**。

### 7.6 文档

- **根目录 `.md` 只允许 9 份**（README / AGENTS / STATE / HANDOFF / CLOSURE / ARCHIVE /
  CHANGELOG / THIRD_PARTY_NOTICES / claude）。多一份 `doc_sync_check.py` 的 [G] 段直接报错。
  历史与过程记录进 `docs/archive/`，且**开头必须有「已归档 / 已过期」声明**。
- **活文档禁写具体数字**，一律指向 `STATE.md`。
- **同一份文档里数量必须一致**：V1 方案里同时出现「9 套 / 22 套 / 26 套」，还留着互相矛盾的两条
  规格（「永远 22 套不过滤」vs「没 Key 只出纯文字」）。写规格前先全文搜一遍数字。
- **Python 改 `*.md` 会破坏换行符**：仓库换行是混合的（根 `README`/`AGENTS`/`files/TODO`/`*.bat` 是 CRLF；
  `scripts/*.py`、`docs/**`、根 `HANDOFF`/`CLOSURE`/`ARCHIVE` 是 LF）。
  `Path.write_text()` 在 Windows 会把 `\n` 转成 `\r\n`，`io.open(newline="")` 又会把 CRLF 变回 LF。
  要精确保留：`read_bytes()`/`write_bytes()`。改完必看 `git diff --numstat`，数字接近文件行数就是换行被改了。
- **不要新建 `HANDOVER-日期.md` / `docs/task_closure_*.md`**。台账进 `CLOSURE.md`（一轮一行）。
- bash heredoc 里的 `\n` 会变字面量，写多行内容用 `python - <<'EOF'` 而不是 `echo -e`。

---

## 8. 未完成的事

### 8.1 待用户拍板（4 件，别自己决定）

| # | 问题 | 现状 | 影响 |
|---|---|---|---|
| 1 | **26 套版式要不要一屏全看？** | 现在 16 套全见、26 套滚 1.2 行。全见需 5 列 × 74px | 决定右栏宽度与缩略图尺寸 |
| 2 | **「有图才出图文版式」这个修订落不落？** | V2 按「有没有图」判断，**偏离了原话**（原话是「没 API 只显示纯文字」） | 决定 §6.3 决策 3 是否成立 |
| 3 | **九宫格要不要专用版式？** | 现在是「预警 + 一键铺满」 | 要「9 张都好看」是另一个功能 |
| 4 | **长图文 13 套配色要不要并入标题图那 20 套？** | 两套来源不同（`cards.js: PALETTES` vs `catalog.js`），部分不达 AA | 合并前要先定口径，否则长图文色卡会大面积回落 |

### 8.2 待落地（V2 原型 → `pwa/src`，8 步）

| 顺序 | 文件 | 改什么 | 风险 |
|---|---|---|---|
| 1 | `cover/cover.css` | 三栏骨架新数值、版式卡、胶囊、托盘 | 低，纯新增 |
| 2 | `cover/title-page.js` | 左栏补配图三态与最近图；尺寸/署名迁入；右栏 5 列 + 密度切换 | 中，选择器全变 |
| 2b | `cover/textmode.js` | `TEXT_FONTS` 3 → 10 款（`build_cover_fonts.py` 已扩表，产物已入库） | 低，纯数据 |
| 3 | `cover/cards.js` | **`palOf(k)` 改成接受显式 `o.pal`**（见 §7.4 第一条） | 中 |
| 4 | `cover/catalog.js` | 配色加 `fam` 与 `blockInk`；`bigtype` 补回 paper/ink | 低，纯数据 |
| 5 | `cover/render.js` | 保存改两段式：定影 → 托盘 → 下载 | 中，动落盘路径 |
| 6 | `cover/nine.js` | 加逐格覆盖率检查（无内容就预警） | 低 |
| 7 | `cover/longform-page.js` | 右栏 4 列、配色口径统一 | **高**，推翻现分页口径 |
| 8 | `tools/pwa_cover_test.py` | 选择器与阈值同步；新增两条断言（见下） | 中 |

### 8.3 已知债务

- `clearAll()` 只删 5 个存储键（实际 18 个，含 2 个 Key 明文）→ 按 `supersu.` 前缀统一清除 + 建登记表。
- `title-page.js:664-685`「实时预览」与「标题图结果」是同一张图的两次呈现 → 删下半部分。
- `templates.js: inkForAccent()` 仍是阈值法 → 改黑白择优。
- 字体按需加载没进 Cache Storage（7 款可选字体合计约 7.5MB，重复下载体验差）。
- **验收机检脚本还没写**。方案 §13 给了 7 条可机检判据（一屏可见 / 可见性单入口 / 对比度 /
  编号唯一 / **缩略图底色去重率** / 九宫格产物 / 无破图），建议做成 `scripts/ux_v2_accept.mjs`。
  其中"底色去重率"是这轮新加的 ——「一片同色」这个 bug 已经复发两次，只有量化能拦住第三次。

### 8.4 记着但没做

- 手机长按保存提示（`cv-tip`）—— 落地时放进出片托盘。
- 「撤销上一版」：切了 15 次想退回刚才那套，值得做，画布左下角给一条 3 秒后消失的提示。
  方案 §8 标注"保留"，但两版原型都没实现。
- 长图文内页背景图（上传 / 用作封面 / 清除）—— `cv-longbg-*` 在清单里，原型未做。

### 8.5 工作区状态

**2026-11-02 已全部提交并推送**（换电脑可直接 `git clone` 继续）。

上一轮遗留的封面 UX V2 产出（原型 / 复核报告 / 方案 / 字体）与 2026-11-02 的
版式引擎 + kit + 图片能力，现在都在 `origin/main` 里。

```bash
git status --short        # 应只剩空（或你自己的新改动）
```

`docs/prototypes/xhs/v2/assets/` 的 13MB 字体/图片副本**仍在 `.gitignore` 里**（不重复入库），
新克隆后按 §3 的一条 `cp` 回填即可。`out/`（调试产物）与 `scripts/snippets/`（临时探针）
也已加进 `.gitignore`。

---

## 9. 如果只剩一天，按这个顺序做

1. **先提交那 39 项**，跑一遍 `scripts/run_gates.py` 确认基线是绿的。
2. **只做 §8.2 的第 1/2/6 步**（骨架 + 标题图 + 九宫格预警）——
   它们是用户抱怨最直接的三处，且都不动分页口径。
3. **给这三步补两条产物级断言**：`lays` 数量随图片切换（16↔26）、九宫格 `blankCells` 与预警一致。
   没有断言就等于没做 —— 这一轮的 5 个 P0 里有 4 个是"界面看起来正常、产物是错的"。

第 3 步别跳。这个项目历史上最大的浪费不是写错代码，是**测试绿了但功能坏着**。

---

## 10. 文档地图

| 文档 | 管什么 |
|:--|:--|
| [`AGENTS.md`](AGENTS.md) | **工程规则唯一真源**：架构、门禁、命名、纪律、踩过的坑 |
| [`STATE.md`](STATE.md) | 当前状态（自动生成，别手改） |
| [`CLOSURE.md`](CLOSURE.md) | 收尾台账（每轮一行，历史全文在 `docs/archive/`） |
| [`ARCHIVE.md`](ARCHIVE.md) | 封存记录：什么东西移出了工作区、怎么取回 |
| [`README.md`](README.md) | 对外说明、使用方式、功能清单 |
| `docs/xhs/design-xhs-studio-final.md` | 封面 UX 现行方案（V2，含所有实测数值） |
| `docs/xhs/review-xhs-studio-adversarial.md` | 对 V1 的对抗性复核（P0/P1/P2 + 复现命令） |
| `docs/xhs/design-module-split-ia.md` | 三模块 IA 的拆分决策（R1–R6） |
| `docs/prototypes/xhs/v2/` | V2 可交互原型（入口 `index.html`） |
| `docs/testing.md` + `docs/testing/` | 怎么测：门禁分层、三档判据、探针 |
| `files/TODO.md` | 待办与排期 |

### 历史去哪找

- `docs/archive/`：Flask 时代系统说明、2026-10-18 的 PWA 交接、2026-10-25 那一轮交接、
  任务 1–23 收尾全文。**它们写的版本号和文件名都过期了，只有追溯价值。**
- `docs/xhs/handoff-xhs-studio-redesign.md`（2026-10-31）：Studio 重设计的子系统交接。
  **它写的"Phase 3 未开始"已经过期**——Phase 3 主体迁移在 10-31 就落地发版了（见 `CLOSURE.md` 归档台账）；
  封面 UX 部分则被本文 §6.3 取代。读它只为了解当时的取舍理由，不要当现状。
- `.workbuddy/memory/YYYY-MM-DD.md`：逐日工作日志，含当轮踩坑的原始记录（最接近现场的材料）。
