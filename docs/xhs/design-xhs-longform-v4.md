# 小红书长图文 V4 · 实现建议（重点：原型图）

> **本文回答什么**：长图文与公众号长图文是**两条独立管线**，目前只做到「能出一套图」，
> 「模板千篇一律，只是改了个颜色」这个核心诉求一步都还没解决。本文给出：
> ① 现状的代码级复核（含一处文档错误）② 开源方案调研 ③ **原型图建议**（本轮重点）
> ④ Paged.js 技术闸门实测 ⑤ 迁移路径与失败判据。
>
> **阅读顺序**：[`requirements-xhs-longform.md`](requirements-xhs-longform.md)（需求真源）→
> [`review-xhs-longform-templates.md`](review-xhs-longform-templates.md)（对抗性审计）→ 本文。
>
> ⚠️ **数字口径**：版本号 / 构建号 / 门禁计数一律看 [`STATE.md`](../../STATE.md)。
> 本文数字均为 **2026-11-06 实测结构性事实**（文件数、行数、耗时、填充率），
> 已标注来源命令与日期，便于接手人复验 —— 不是状态快照。
>
> **配套产物**：原型 [`prototypes/xhs/longform-v4/`](../prototypes/xhs/longform-v4/)
> · 规格 [`SPEC.md`](../prototypes/xhs/longform-v4/SPEC.md)
> · 总览图 `output/longform-v4/overview.png` · 机检 `output/longform-v4/density_check.json`

---

## 1. 现状复核：一条必须纠正的文档错误

**已读材料**：`STATE.md` / `AGENTS.md` / `HANDOFF.md` §8（V2 待落地 8 步、§8.4 记着没做）/
`docs/INDEX.md`（唯一入口）/ `.workbuddy/memory/2026-11-05.md`（收尾日工作日志，
内容为门禁 `--local` 23 套件与 `nine` 修复，**无长图文改动**）/
[`meta/handover-2026-11-06-three-modules.md`](../meta/handover-2026-11-06-three-modules.md)（三板块交接，1253 行）/
`requirements-xhs-longform.md` / `plan-xhs-longform-next.md` /
`review-xhs-longform-templates.md` / `research-2026-10-31-xhs-longform-generators.md` /
现行代码 `pwa/src/cover/{cards,longform-page,story,render}.js`。

### 1.1 长图文与公众号长图文不是一回事

| | 公众号排版（A） | 小红书长图文（C） |
|---|---|---|
| 管线 | `core/format_engine.py` → 微信内联 HTML（可粘贴的**流式文章**） | `pwa/src/cover/cards.js` → N 张 **1080×1440 位图** |
| 分页 | 无「页」概念，浏览器自己折行 | `buildLong()` 按实测 DOM 高度装箱，页数上限 6 |
| 模板 | 183 套主题 + 15 个版式入口 | `LONG_TPLS` **12 套**（整套共用一套） |
| 产物 | HTML 文本 | 逐张 PNG + ZIP |
| AI | BYOK 结构决策（不改正文） | 无 AI |

**结论**：公众号那套「引擎 + 主题 + 版式」的能力**不能直接搬**到长图文（交接文档 §1.3 已钉死：
两条独立管线，只共享主题数据与底座模块）。但 `core/magazine_layouts.py` 的 19 套杂志版式
里有大量**编排语法**可提取 —— 见 §3。

### 1.2 ⚠️ 文档错误：三套杂志版式从未落地（本轮实测发现）

`requirements-xhs-longform.md` §3 / §4 / §5.3 LF-TPL-9 / §9 多处写：
「`LONG_TPLS` **15 套** = 原 12 套 + 杂志源 3 套（economist / vogue / muji）**已落地**」，
并给出「148 / 111 / 74 / 74 字/页」的实测密度。

**实测复核（2026-11-06）**：

```bash
grep -c "^    id: '" pwa/src/cover/cards.js          # → 12
grep -in "economist\|vogue\|muji" pwa/src/cover/cards.js   # → 0 命中
git log --all --oneline -S"economist" -- pwa/src/cover/cards.js | wc -l   # → 0
```

`cards.js` 只有 **12 套**（editorial / swiss / notion / book / memo / polaroid / aura /
night / doc / film / starry / blank），那三套在 **git 全历史里从未存在**。
那组密度数字出自原型 `prototypes/xhs-longform-layouts.html`，**产品代码一行未改**。

**影响**：LF-TPL-9「骨相差异」的真实状态是 🔴 **未落地**，
`plan-xhs-longform-next.md` 的 B1 批次并不是「已完成，接下来做 B2」，
而是**第一步还没走**。需求文档与交接文档已加勘误区并逐条更正（见 `plan_step_17`）。

> 这类漂移在 11-06 交接文档 §4.6「坑 42 文档里的实测快照也会错」里已列过，
> 本轮又命中一次：**接手时先把取证命令自己跑一遍**。

### 1.3 现有 12 套为什么「千篇一律」

`review-xhs-longform-templates.md` §2 的量化审计：12 套模板专属 CSS 共 81 条 / 4532 字符，
其中 **57/95 条在摆装饰元素的 `right/top/bottom/z-index`**；
`columns` / `float` / `::first-letter` / 正文分栏 **全部为 0 条**。
根因在 `cardInner()`：`tpl` 只用于两件事 —— `tpl.cls`（CSS 命名空间）与
`tpl.head()/foot()`（页眉页脚 HTML）。**一篇文章怎么分段、每页放几句话、标题多大、
正文多宽，12 套完全一样。**

用户原话（需求台账 L-R9）：「模板都是千篇一律，只是改了个颜色，没有啥意义，
希望有更多的真正设计和排版的风格」；L-R8：「要在原来的基础上增加，不要删除」。
两者同时成立的处理方式是：**12 套一套不删，把差异从「皮肤」做到「骨相」；
同时补入以真实杂志排印为源的新骨架。不是用新套替换旧套。**

---

## 2. 开源方案调研（含本轮补充核实）

> 已有调研：[`research/research-2026-10-31-xhs-longform-generators.md`](../research/research-2026-10-31-xhs-longform-generators.md)
> （真实产品形态）+ [`review-xhs-longform-templates.md`](review-xhs-longform-templates.md) §5
> （开源对照表）。本节补上 2026-11-06 用 GitHub API 核实的最新状态与结论。

| 项目 | 真实仓库 / Star / License | 关键机制 | 借鉴什么 | 不能借鉴什么 |
|---|---|---|---|---|
| **归藏 Social Card Skill** | `op7418/guizang-social-card-skill` · **7,991 star** · **AGPL-3.0**（API 实测） | 28 个版式骨架（M01–M16 杂志 + S01–S12 瑞士）、10 套主题预设、单文件 HTML → Playwright → PNG、`validate-social-deck.mjs` 9 条 DOM 实测校验 | **版式与主题色分离**；每条 recipe 带 `Minimum density`；用真实浏览器度量而非猜 | AGPL 有网络服务传染性，**不能抄代码**。本仓库 `references/` 已 vendored 的只是 `.md` 参考文档，已在 `THIRD_PARTY_NOTICES.md` 登记 |
| **XHS-TextCard**（竞品，非开源） | `xhs-textcard.site/editor.html` | 三 Tab 面板（内页 / 封面 / 导出），**只有一个 `template` 字段**整套生效，12 套模板选一 | 「模板是整套共用的一个东西，不是每页各选一个」—— 这条直接否掉过本项目的第二版错误做法 | 内页背景图「原样铺满不压暗」，可读性靠运气，本项目已明确不抄（D9 用 85% 纸色蒙层） |
| **Paged.js** | `pagedjs/pagedjs` · **1,561 star** · **MIT**（API 实测，2026-10 仍在提交） | CSS Paged Media polyfill：`@page` / `break-*` / running headers / `columns` | 浏览器内真流式分页；用户已选为本轮技术方向 | 体积与耗时见 §4；**不提供欠填页策略** |
| **heti 赫蹏** | **`sivan/heti`**（不是 `zhihu/heti`）· **6,749 star** · **MIT** | CLREQ 中文排印：标点挤压、中西文间距、行间注、真多栏、竖排 | 中文排印地基，MIT 可引入 | 缺首字下沉与图文绕排，需自己补 |
| **Satori** | `vercel/satori` · MPL-2.0 | HTML/CSS → SVG | 固定版式的可预测出图 | README 明确：`columns` / `writingMode` 被忽略、`::first-letter` 无效、`float` 行为有偏差、`textWrap` 受限 —— **正好废掉我们要用的杂志手法**，不做本轮方案 |
| **Vivliostyle** | AGPL-3.0 | 中日文排版最强（縦組 / CJK 断行） | 思路参考 | AGPL 对 PWA 是硬风险 |
| **RedInk** | `HisMax/RedInk` · **CC BY-NC-SA 4.0**（非商用） | Vue3 + Flask + Gemini 文生图，「先出大纲 → 逐页生成图」，可单页重绘 | 「大纲 → 逐页」的分步交互、单页重绘 | 整页由 AI 生图，文字是像素不是文本，与「纯文本进、排版出，不用 AI 就不开 AI」冲突；许可证非商用 |

**结论**：**没有现成开源方案能一次满足「长文自动分页 + 杂志版式 + 出 PNG」**。
必须自己拼：Paged.js 负责分页、CSS 负责版式、`modern-screenshot` 负责出图。
License 纪律：AGPL 项目只允许「看效果、自己想实现」，新增代码级借鉴要先过
`THIRD_PARTY_NOTICES.md` 这道账。

---

## 3. 原型图建议（本轮重点）

### 3.1 先说结论：原型要证明的不是「界面好看」

`xhs-longform-plan.html` 已经把「12 套一屏看全 / 真实缩略图 / 撤销 / 去重画廊」
做得很精致，但 `review-xhs-longform-templates.md` §3 S-1/S-3 指出：
**一屏看到 12 套雷同模板，唯一区别是更快地失望**；原型越精致，越容易误以为
「模板问题已经解决」。而且该原型的 `miniHTML()` 是**手绘微缩样张**
（9.6px 标题 + 4 行截断正文 + 装饰条），不是把 1080×1440 页面缩放 ——
它证明了「陈列方案可行」，**没有证明缩略图渲染可行**。

**所以本轮原型的目标改成三件事**：
1. 同一篇文章 → 5 种**骨相**不同的成品页（差异可归因）
2. 差异能被**读出数字**，不只是感觉到（标注条 + 机检）
3. 每张页自己先过配方的 Minimum density 规则（原型不能自己违规）

### 3.2 交付物（都在 `docs/prototypes/xhs/longform-v4/`）

| 文件 | 作用 |
|---|---|
| `fixture.js` | **单一夹具真源**：出自 `scripts/pwa_longform_test.py` 的 `TITLE_LINE + BODY_TEXT`（与产品门禁同一篇，375 字），拆成 `lead/body/items/quote` 四类块并带字数标注 |
| `skeletons.js` | 5 套骨架，每套导出 `{id,name,recipe,dimension,density,css,html,anchors,note}` |
| `render.html` | Paged.js 渲染页：`?skeleton=<id>` 单页 / `?skeleton=all` 总览；带画布外的对照标注条 |
| `SPEC.md` | 一行一条可机检规格 + 判据口径 + 常量对照 + 双落点映射 |
| `vendor/` | 自包含：`paged.polyfill.js` + `modern-screenshot.js`（不依赖 CDN） |
| `output/longform-v4/overview.png` | **5 页并排总览图**，一屏看完差异 |
| `output/longform-v4/*.png` | 5 张 1080×1440 成品页 |
| `density_check.json` / `metrics.json` | 机检证据 |

### 3.3 五种骨架：每种命中一个不同的排印维度

全部照 `references/layout-recipes.md` 的结构，**不自己发挥**（用户 L-R10 要求
「参考杂志的设计模板，先搜索开源组件和参考其他人的优秀方案」）：

| # | 骨架 | 配方 | 差异维度 | 现有 12 套里有吗 | 实测 spanFill |
|---|---|---|---|---|---|
| 1 | 刊头 + 首字下沉 | M01 + M03 | 排印骨架 | ❌ `::first-letter` 出现 0 次 | 0.849 |
| 2 | 竖排账本 | M08 | 序号系统 + 行结构 | ❌ 只有页码，无序号栏 | 0.983 |
| 3 | 证据墙 2×2 | M06 | 图文关系（网格） | ❌ 全是单栏线性流 | 0.911 |
| 4 | KPI 塔（降级） | S09 | 数据可视化 | ❌ | 0.917 |
| 5 | 竖排流程 | M14 | 顺序关系 | ⚠️ `steps` 角色 11-06 才补上，但无引导线 | 0.893 |

**公平性约束（写死）**：所有骨架共用同一段 `@page { size:1080px 1440px; margin:96px }`、
同一套设计令牌、同一份夹具。**页边距不是版式差异的一部分**，改了就没法归因。

**诚实降级**：夹具里没有图片也没有数字，所以 M06 用「原文真实句子」当证据块
（不塞灰框占位，配方明确反对）、S09 用「条目字数」当塔高编码（可测的真实值），
并在标注条写明降级原因。**不编造内容来凑版式** —— 这既是数据真相，也暴露了
一个真实结论：每种骨架都有内容适配度，不是所有文章都适合所有骨架。

### 3.4 对照标注条：让差异可读

挂在 `<html>` 下、`<body>` 之外的 UI 层（**不占 1080×1440 成品画布**），显示：
骨架名 / 本页字数（实测 287，夹具 375）/ 密度档（密·中·疏）/ 锚点数与清单 /
实测填充率（0.849 ≥0.75 达标）/ 维度与 recipe 出处。

> ⚠️ 踩坑：Paged.js 的 CSS polyfill 会把 `position:fixed` 重写成 `static`，
> 不能靠 `fixed` 隔离 UI 层。改为挂在 `<html>` 下，实测 `barInsidePage=false`。

### 3.5 总览图与机检

- `overview.png`（1920×718）：5 张成品页缩到 360×480 并排，各带标注；
  顶部写明「同一篇文章 / 同一色板 / 同一 @page」，确保差异归因到排印语法。
- `verify_density.py` 机检 **5/5 PASS**：`spanFill ≥0.75`、`maxMidGap ≤216px`、
  `leading+trailing ≤216px`、单页、无裁切、无 `flex:1` 推挤、锚点齐全、PNG 精确 1080×1440。

**判据口径（踩过坑，别改回去）**：首版把「内容覆盖 ≥75% 画布高」实现成
**像素覆盖率**（扣掉行间距），结果有行距的账本 / 流程 / KPI 全部假红
（coverage 只有 0.508–0.549）。配方同段另有「空白带 >216px 需理由」的独立条款，
说明主判据应是**首块 top → 末块 bottom 的整体跨度**；行距与边框是设计的一部分，不该扣除。
`coverage` 只作留白节奏的辅助信息。可用高按 `1440 − 2×96 = 1248px`，
**不能按 1440 算**（否则 75% 规则宽松 15%）。

### 3.6 三条「看起来全绿、产物是错的」陷阱（写进规格）

1. **`::first-letter` 在浏览器生效、在导出 PNG 里失效**：实测 computed `114.4px / 44px = 2.6`、
   `float:left`、accent 色全部生效，浏览器截图目视也能看到放大的首字；
   但 `modern-screenshot` 导出的 PNG 里首字仍是正常字号 ——
   **丢失发生在截图管线，不是 Paged.js 分页**。
   **落地必须改为真实 `<span class="fl">` 包首字**，由 `cardInner` 产出 DOM 节点、
   CSS 挂在 `.fl` 上，让浏览器与导出 PNG 两条路径都成立。
2. **PNG 带 alpha**：`modern-screenshot` 出的背景透明，直接 `convert("RGB")` 会把透明区变黑
   （总览图首版 5 页全黑）。必须先 `Image.alpha_composite` 到纸色底。
3. **就绪信号**：`pagedjs:rendered` 事件**从不触发**（监听 window/document 均收不到）；
   用「页数 > 0」判就绪会读到渐进式渲染的中间态（同一次分页在不同轮次读到 1/2/3/4 页）。
   必须轮询 `.pagedjs_page` 数量并等其稳定 ~700–900ms。

---

## 4. Paged.js 技术闸门（用户已选方向，实测结论：**通过**，带 3 条约束）

### 4.1 五项特性逐条实测

| 特性 | 结果 | 证据 |
|---|---|---|
| `break-inside: avoid` | ✅ | 原子块只产生 1 个片段，未被拆到两页（583px） |
| `break-before: page` | ✅ | `.newpage` 独占第 4 页 |
| running header `string()` + 计数器 | ✅ | 伪元素 `::after` content = `"周末去了趟海边"`，top=38 落在 96px 页边距带内 |
| `columns` 多栏 | ✅ | 2 栏，子元素 left = [96, 564] |
| `::first-letter` 首字下沉 | ✅（DOM 层） | 52px → 176.8px（ratio 3.4）、`float:left`；⚠️ 出图不生效，见 §3.6 |
| `modern-screenshot` 出图 | ✅ | PNG 解码后全部 1080×1440、无空白页、无 `pageerror` |
| 字体时序 / 页数可复现 | ✅ | 等待与不等待 `fonts.ready` 均 6 页；4 次独立运行均 6 页 |

### 4.2 三个数字

| 项 | 实测 |
|---|---|
| **打包后体积** | `paged.polyfill.js` raw 921,702 B / **gzip 159,865 B（≈156KB）**；`modern-screenshot.js` gzip 10,902 B（仓库已有） |
| **首屏分页耗时** | 冷启动 settle **1212ms**、热启动中位 **1088ms**、出首张 PNG 中位 371ms、**到首张 PNG 中位 1473ms** |
| **1000 字文章页数** | **6 页**（夹具实测 1042 字，4 次运行稳定） |

### 4.3 迁移前必须补齐的三条约束

1. **欠填页后处理**：Paged.js 只管「在哪断」，不管「断了之后够不够满」。
   实测 1000 字文章末页只剩 51 字、填充率 **26.7%**；本轮 5 骨架首版也有 4 种断成 2 页、
   末页最低 **1.7%**（只剩页脚）。现有 `buildLong` 的「先合并后截断 +
   `closingCap` 守卫」（`cards.js:926-975`）必须**上移**为 Paged.js 之后的后处理，
   否则会退化成「每套都有一张半空的末页」。
2. **1.45s 不能实时重渲**：现行承诺是「粘贴后 0 点击即见分页」
   （`ux-spec-xhs-studio.md` C6），即每次输入变化都重渲。必须做
   防抖 300ms + 按「文章首 200 字哈希 + 模板 + 色板」缓存 + 首屏只渲可见页，
   可直接复用 `plan-xhs-longform-next.md` B3-1 已给的性能方案。
3. **156KB 登记**：PWA 是零依赖白名单构建（`build.mjs` 的 `assertDist()`），
   SW 缓存分 5 层。Paged.js 放 `public/vendor/`，登记 `SHELL_OPTIONAL`
   （长图文页按需加载，不进首屏预缓存）+ 加一条「vendor 关键文件齐全」断言。

### 4.4 另一个陷阱：running header 是伪元素

`pg.querySelector('.pagedjs_margin-top-left').textContent` 恒为空，
但截图里文字明明在。断言必须查 `getComputedStyle(el,'::after').content`，
不能读 `textContent`。

---

## 5. 迁移建议（原稿口径：只写方案，不动 `pwa/src`）

> ⚠️ **2026-11-06 落地更正（本节写于原型阶段，不代表现状）**：用户后续拍板
> 「做可开关的试验入口」，已在产品内落地 —— `pwa/src/cover/v6/` + `mount.js` 挂进
> `#longform-root`，开关 `supersu.longform.v6` **默认关**、老 `buildLong` 路径主体零删除。
> 分页真源按拍板在**开启态**换为原型自研 `paginate.js`（DOM 实测装箱），灰度转正式需另行拍板。
>
> **技术路线的取舍（不静默替换，显式记录）**：原拍板是「引入 Paged.js 重做分页管线」，
> 闸门实测通过后仍带三条约束（欠填页后处理 / 不能实时重渲 / vendor 体积），且
> `pagedjs:rendered` 从不触发、running header 是伪元素、`position:fixed` 被重写。
> 最终**未把 Paged.js 带入产品**，改用原型自研分页器，复用 `cards.js` 已验证的
> 「离屏 DOM 实测高度装箱 + 句读回退」思路；代价是拿不到 CSS Paged Media 的
> 原生 `break-*` / running header 语义，收益是零新依赖、零闸门约束、产物级零丢字可机检。
> 若后续仍要 Paged.js，需重新拍板并接回 §4.3 三条约束。
>
> 构建 / 门禁 / 开关两态端到端 / 两条管线逐句比对的实测证据见
> [`docs/prototypes/xhs/longform-art/README.md`](../prototypes/xhs/longform-art/README.md) §9。
> 下面 §5.1–§5.5 保留**原稿方案与调研结论**，供回溯。

### 5.1 路线（推荐 C → B）

| 路线 | 做法 | 代价 |
|---|---|---|
| **A 保留现管线** | `LONG_TPLS` 新增条目 + `CARD_CSS_RAW` 按 `cls` 加几何 + `cardInner` 加角色分支 | 无新依赖、无 license 风险、回归可控；但受单栏限制，做不了真 `columns` / `float` |
| **B Paged.js**（用户已选） | 每套骨架 = 一份 `@page` + `@font-face` + 语义 HTML 模板；`cards.js` 退化为「内容结构决策」层 | 可写真流式排版；必须补齐 §4.3 三条 |
| **C 并行灰度** | 旧 `buildLong` 为准，新管线只出预览；产物级逐句比对通过后才切 | 多一份维护成本，但是唯一安全的切换路径 |

**先 C 后 B**：用 C 证明「同一篇文章，两条管线出的文字一字不差」，再逐步切到 B。

### 5.2 双落点（关键，见 `SPEC.md` §4.1）

> **「这段内容是什么」归 `cardInner`/`buildLong`，「这段内容长什么样」归 CSS 模板。**

- 归 `cardInner`/`buildLong`：内容块解析、角色判定、`---` 强制分页、页数上限 6、
  截断合并、`closingCap` 守卫、逐句零丢失、**首字下沉的真实 `<span>` 节点**、骨架容器 HTML。
- 归 CSS 模板：`--fs` / `--pgap` / `line-height` / `.body` padding（这是 §3「唯一要按骨架拆」的量）、
  grid / 装饰线 / 序号 / 间距。
- **现有 12 套的问题恰恰是只有 `head()/foot()` + `cls`，没有骨架结构分支** ——
  所以新增骨架时两边都要动，只在 CSS 里加规则不会改变 HTML 结构。

### 5.3 常量口径：角色常量一个都不拆

`DENSE_MIN_FILL_CHARS=140` / `OPENING_MAX_CHARS=120` / `QUOTE_MAX_CHARS=120` /
`closingCap` / `STORY_MAX_PAGES=6` / `DENSE_SINGLE_SEG_FLOOR=66.5` **全部不按骨架拆**：
它们管的是角色上限与摘段守卫，不是分页容量。真正决定「每页多少字」的是
`packDense → denseMaxHeight(tpl,pal)` 用 `tpl.cls` 建真实 DOM 实测 `.body` 高度，
**装箱容量自动随 CSS 变**。另外 `pwa_longform_test.py` 的逐角色填充率 68/60/45%
按 **1124px** 归一化，与本原型的骨架 `spanFill` 按 **1248px** 归一化是两套口径，
**不可互相套用**。

### 5.4 失败判据（当场回滚）

- 分页完整性断言从「全部落版」变成「缺句」；
- 同一篇文章两条管线的文字有任一字不同；
- 12 套模板缩略图让首次进入长文页 **> 1.5s**；
- 撤销导致正文内容变化；
- 五种骨架的 `spanFill` 变得相同（说明密度差异没生效，退化成换皮）；
- 任一页出现裁切或欠填（填充率 < 0.75 且无理由）。

**回滚点**：本任务对 `pwa/src/cover/` **一行未改**，回滚 = 丢弃新管线文件；
旧 `buildLong` 全程保持为准，不做「先删后建」。

> ⚠️ **工作区边界**：`git status` 里 `pwa/src/cover/{catalog,layout-registry,templates,v3-templates}.js`
> 等 `M` 改动与 `v3-structural.js` 未跟踪文件，**不是本任务产物**（本任务只写
> `docs/` · `docs/prototypes/` · `$TMPDIR` · `output/longform-v4/`）。
> 按 `AGENTS.md` §11 Git 边界：不回滚、不覆盖、不吸入这些未授权改动。
> 迁移实施时如需动 `pwa/src`，必须先与这些改动的归属方对齐。

### 5.4.1 Paged.js 做不到、仍需自研的清单（别指望 polyfill 包办）

Paged.js 是**排版分页器**，不是产品逻辑层。下面 9 项全部要留在项目自己的代码里：

| # | 能力 | 现归属 | 为什么 Paged.js 不管 |
|---|---|---|---|
| 1 | **欠填页策略**：超限先合并、后截断 | `buildLong:945-975` | 纯 CSS 分页只决定「在哪断」，不判断「断了之后这页够不够满」（实测末页 26.7%） |
| 2 | **`---` 强制分页符语义**（连续只分一次 / 首尾忽略 / 手动优先于自动） | `buildLong:822-841` | CSS 的 `break-before` 没有「用户输入的文本标记」这层语义 |
| 3 | **页数上限 6 + `truncated` 字数提示 + 「复制剩余正文做第二套」** | `cards.js:278`、`buildLong` 尾部 | 产品决策 D5；polyfill 不会主动丢内容也不会告诉用户丢了多少 |
| 4 | **7 角色判定**（cover / opening / points / quote / steps / dense / closing） | `buildLong` 分页循环 | 角色是内容语义（这段是不是清单、是不是金句），CSS 无从判断 |
| 5 | **`closingCap` 摘段守卫 + 逐句零丢失校验** | `cards.js:926-975` | 同上；这是本项目被审计钉死的「不吞正文」契约 |
| 6 | **产物自检条**（缺句 / 截断 / 手动分页符 / 空态，正常态静默） | `longform-page.js:333-378` | UI 反馈层，与排版引擎无关 |
| 7 | **整套导出**：逐张 PNG + ZIP + 单张下载 + 文件名 `NN-封面/内页N.png` | `story.js` / `longform-page.js` / `render.js` | polyfill 只生成 DOM，不出图不打包 |
| 8 | **配色与模板的锁色契约**（3 套跟随 / 9 套锁色、`tplSupportsBg` 6 套可用） | `PALETTES` / `LONG_TPLS` / `longform-page.js` | 设计系统约束，不是 CSS Paged Media 规范的一部分 |
| 9 | **就绪信号与性能策略**（页数稳定判定、防抖 300ms、按内容哈希缓存、首屏只渲可见页） | 本项目自研 | `pagedjs:rendered` 事件实测从不触发；1.45s 也不支持「每次按键重渲」 |

> 换句话说：**换掉的是「怎么把文字摆到一张张画布上」，不是「摆什么、摆几张、怎么交付」**。
> 若把这 9 项也交给新的 CSS 模板去猜，就会重演本项目反复踩过的
> 「界面看起来正常、产物是错的」（交接文档 §4.4 坑 31）。

### 5.5 明确不做（别重开，见交接文档 §3.4）

全弹窗版 / 方案 B 侧栏 / 方案 C 双带 / 15 套自创版式 / 6 套自造长文模板 /
把文字玩法砍到 3 种 / 把字体砍到 3 款 / A-B 对比槽 / 画布拖拽微调 /
逐页手动调整（C-5）/ 长文多尺寸（D13）/ 长文切九宫格（D14）/
长文配色并入标题图（D15）/ 长文正文草稿持久化（D16）/
**复用标题图版式做长文每一页**（返工过两次）。

---

## 6. 给原型的实施顺序（如果继续往下做）

1. **补齐 §3.6 的首字下沉 DOM 化**，重跑 `verify_density.py` 与目视验收。
2. 把 `SPEC.md` §1 的断言搬进 `scripts/pwa_longform_v4_test.py`（判断据不变，
   测量对象从 `.pagedjs_page` 换成 `.card`）。
3. 按 §4.3 三条做技术闸门的实现：欠填页后处理 → 防抖缓存 → vendor 登记。
4. 走 C 并行灰度，产物级逐句比对通过后再切 B。
5. 每步独立跑 `node pwa/scripts/build.mjs` + `python scripts/pwa_longform_test.py`
   + `python scripts/doc_sync_check.py`，同步更新 `docs/INDEX.md` §5 未完成事项。

---

*证据基线（2026-11-06 实跑）：`probe_final.py` / `probe_measure.py` / `probe_perf.py` /
`render_skeletons.py` / `verify_density.py` / `make_overview.py`。
原型产物见 `output/longform-v4/`（gitignore，可重跑生成）。*
