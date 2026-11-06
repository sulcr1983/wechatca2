# 长图文工作台 V5 · 61 种格局 / 183 套配色 / 成套导出

> **用户反馈收敛（2026-11-06）**：
> ①「多做很多模板，要有艺术感、设计感」→ ②「重复的太多，最多是颜色不同，增加 SVG 比例」→
> ③「我们这个是长图文，文字还是重点，并不是图啊」→
> ④「长文格式可以直接把公众号排版格式和引擎拿过来用」→
> ⑤「这个原型图很简陋啊……而且里面的套数都重复，183 的很多都是换个颜色，格局没变化，这个要精简」。
>
> V5 结论：**按格局签名去重**（183 套主题 → 49 种格局代表，134 套纯换色折叠为内部配色变体），
> 模板卡从 195 张降到 **61 张**（12 手写 + 49 格局），183 套配色仍全部可达；
> 界面从简陋 `<select>` 下拉升级为**三栏工作台 + 真实渲染模板卡网格**。
>
> **打开方式**（必须起静态服务，`file://` 下 ES module 会被 CORS 拦）：
> ```bash
> .venv/Scripts/python.exe -m http.server 8128
> # 工作台：http://127.0.0.1:8128/docs/prototypes/xhs/longform-art/editor.html
> # 画廊：  http://127.0.0.1:8128/docs/prototypes/xhs/longform-art/index.html
> ```

---

## 1. 五代对比（实测）

| | V1 | V2 | V3 | V4 | **V5** |
|---|---|---|---|---|---|
| 形态 | 单页海报 | 单页设计稿 | 5 页成套（手工） | 任意长文自动分页 | 同 V4 + 工作台 UI |
| 模板卡数 | 100（10 种结构） | 40 | 12 × 5 页 | 195（**大量重复**） | **61 种格局** |
| 主题来源 | — | — | — | 183 套各占一卡 | **183 套 → 49 格局 + 134 配色变体** |
| 选择方式 | — | — | — | `<select>` 下拉列名字 | **真实渲染卡网格 + 族筛选 + 色板条** |
| 文字区占画布 | ~1/3 | ~1/3 | 1.0 | 1.0 | **1.0** |
| 导出 | 无 | 无 | 无 | PNG/ZIP/Markdown | 同 V4 |

**重复度实测**（`scripts/gen_longform_theme_index.py`）：
183 套主题只有 **53 种原始格局签名**，最大一组 26 套完全相同；
经离散分档后合并为 **49 种格局代表**，折叠 134 套纯换色主题，最大一组 25 个配色变体。

## 2. 格局去重怎么做的

`scripts/gen_longform_theme_index.py` 的 `layout_signature()` 只抓**结构**，不含任何颜色：

| 维度 | 取值 |
|---|---|
| 正文字号 / 标题字号 | 分档（S/M/L、s/m/l/xl），不按每个 px 值区分 |
| 行距 / 字距 / 对齐 | 分档 |
| 字体族 | `serif` / `sans` / `mono`（`sans-serif` 不再被误判成衬线） |
| 标题装饰 | 双线 / 细线 / 左竖线 / 顶线 / 色块 / 无 |
| 引用装饰 / h2 字重 | 有无线 / 字重 |
| 明暗 / kind | 暗底 / 亮底、theme / kit |

同签名只留一个代表（优先有 h1 装饰、有描述、名字更通用），其余降为 `THEME_VARIANTS`：
**配色只挂在代表内部**，切换色板不改任何排印参数（`themes.js::setSwatch` 有单测守住）。
卡名显示「格局名」（如「左起素排 · 大标」「居中双线 · 中标」），不再显示主题商品名。

族：`衬线 · 细线刊头`、`暗底 · 衬线`、`无衬线 · 色块标题` 等 13 个主题族
+ 5 个手写族（书刊 / 手札 / 诗笺 / 网格 / 版心）。

## 3. 三栏工作台（`editor.html`）

> **V6 视觉重设计**：调用 `ui-ux-pro-max` skill 生成设计系统
> （`--design-system "editorial publishing tool content studio minimal warm paper" --variance 3 --motion 2 --density 6`），
> 参考项目已有 `design-system/supersu/MASTER.md`（已读、**未覆盖**、未持久化新文件），
> 结合 `references/style-system.md` 的编辑出版原则落地。**信息架构与全部功能逻辑未改**，只重设计视觉与交互。

| 栏 | 内容 |
|---|---|
| 顶栏 | 「刊」字印章、期刊式品牌、朱砂渐变细线、`PROOF` 校样徽标、格局/配色计数 |
| 左 `01 / INPUT` | 整篇文章 textarea、语法提示、产物自检条（`aria-live="polite"`）、页数 / 落版字数统计格、导出按钮 |
| 中 `STAGE` | 杂志看样台（横向细纹底 + 双径向墨晕）、整套成品横滑，每页可放大 / 单独下载 PNG |
| 右 `02 / LAYOUT` | **61 张真实渲染格局卡**（懒加载 + 按内容哈希缓存）、按族分组、SVG 搜索图标、族筛选、选中态「✓」角标 |
| 右下色板条 | 票根式分隔，主题代表显示同格局全部配色（最多 25），手写模板显示 8 套基础色板 |

**设计规范（skill Step 2 + pro-rules）**：

| 维度 | 落地 |
|---|---|
| 颜色角色 | 语义令牌：暖纸 `--paper` / 墨 `--ink` / 朱砂 `--accent` / 学术藏蓝 `--navy` / 引文金 `--gold` / 状态 `--ok`；组件不写死 hex |
| 间距 | 4/8 节奏 `--sp-1..--sp-7`，分区 16/24/32/48 层级 |
| 排版 | 越大越细：标题 `Noto Serif SC` weight 500 + 宽字距；小标签 mono 大写 + `.18em`；正文 ≥12px，行高 1.6 |
| 状态 | hover/press/focus 均有反馈，时长分档 `--t-fast 140ms` / `--t-mid 200ms` / `--t-slow 280ms`；按压用 inset 阴影，**不位移布局** |
| 可访问性 | 所有控件 `:focus-visible` 2px 藏蓝焦点环；自检条 `aria-live`；搜索框 `aria-label`；装饰 SVG `aria-hidden`；选中态不只靠颜色（✓ 角标 + 边框 + 阴影）；色板 `::before` 扩到 44px 命中区 |
| 对比度 | 实测 ink/panel 15.62、muted/panel 5.39、白/藏蓝 11.5、朱砂字/浅底 6.44、状态字/浅底 6.96，全部 ≥4.5:1 |
| 动效降级 | `@media(prefers-reduced-motion:reduce)` 把 animation/transition 压到 0.01ms |
| 响应式 | 1440 / 1180 / 980 / 640 四档断点；375–1680 实测 `document.scrollWidth <= innerWidth`，无页面级横向滚动 |
| 图标 | 内联 SVG（搜索放大镜），不用 emoji；品牌印章用 CSS 边框而非图片 |
| 性能 | 61 张卡 `IntersectionObserver` 懒加载 + 内容哈希缓存；iframe 预留 `aspect-ratio:3/4` 防 CLS |

缩略图用**当前文章前 240 字**渲染，不是别人的成品；输入变化后按内容哈希失效并懒重渲。
实测 61 张卡全部能真渲染（滚动触发后 `rendered 61/61`、零占位残留）。

## 4. 自动分页与自检

`paginate.js`：解析任意纯文本 → 离屏 DOM 实测高度装箱 → 超长段二分找最长前缀并在句读处断开 →
页数超限先合并后截断并明确告知字数 → 逐字复验零丢字。算法复用产品 `cards.js` 已验证思路，
**不引 Pyodide、不引 Paged.js、不改产品代码**。

⚠️ **度量与渲染必须同构**：模板特有 CSS（如 `ledger` 的 `.row{min-height:150px}`）必须注入度量宿主，
否则清单行被低估 52px/行导致真机裁切。封面标题用 `splitTitleLines()` 均分行 + 行首标点/虚词归还，
避免孤字成行与「，我把手机 / 了飞行模式」这类断词。

`audit.js`：零丢字 / 空页 / 页数上限 / 字号下限 / 填充率 / 裁切；正常态静默，异常逐条写明。

## 5. 目录

| 文件 | 作用 |
|---|---|
| `editor.html` | **V5 主入口**：三栏工作台 + 61 格局卡 + 色板切换 + 导出 |
| `index.html` | V3 画廊（12 套 × 固定 5 页，保留未覆盖） |
| `tpl.html?id=<id>&page=<n>` | 单页 HTML 文档，可直接截图 |
| `paginate.js` / `paginate.test.mjs` | 自动分页器 + 7 条单测 |
| `auto.js` | 适配层：度量样式、宿主、动态页 → 可渲染页 |
| `audit.js` / `audit.test.mjs` | 产物自检 + 9 条单测 |
| `story-system.js` | 页面外壳：文字优先 CSS + `renderAuto` + 封面标题分行 |
| `templates.js` | 12 套手写排印骨架 |
| `themes-index.js` | **生成物**：49 个格局代表 + `THEME_VARIANTS`（真源 `public/themes/*.json`） |
| `themes.js` / `themes.test.mjs` | 代表模板 + 内部色板切换 + 12 条单测 |
| `README.md` | 本文 |
| `art-system.js` / `graphics.js` / `story.js` / `fixture.js` | V1–V3 遗留，保留供对照 |
| `assets/fonts/` `vendor/` | 自包含字体、modern-screenshot / fflate / marked |

## 6. 验证（编码-测试-修复循环，V5 全绿）

| 层 | 命令 | 结果 |
|---|---|---|
| 单测 | `node --test paginate.test.mjs audit.test.mjs themes.test.mjs` | **28/28** |
| Node 全量结构 | `$TMPDIR/pagedspike/regress_all.py` | **183/183**（3 夹具 × 61 套） |
| 浏览器 DOM 实测 | `$TMPDIR/pagedspike/regress_browser.py` | **51/51 页**：尺寸/裁切/最小字号 |
| 编辑器端到端 | `$TMPDIR/pagedspike/probe_editor_v5.py` | 61 卡、19 族、3 页 484 字零丢字、色板切换、PNG 下载、零 JS 报错 |
| 缩略图全量 | `$TMPDIR/pagedspike/probe_thumbs.py` | **61/61** 真渲染、零占位、零 pageerror |
| UI/UX 交付前检查 | `$TMPDIR/pagedspike/probe_uiux.py` | 375/768/1024/1440/1680 无横向滚动、reduced-motion 生效、2px 焦点环、`aria-live`、5 组对比度 ≥4.5、成品缩放精确 |
| ZIP 端到端 | `$TMPDIR/pagedspike/probe_zip.py` | 2 页成套 PNG、无 404 |
| 生成器幂等 | 重跑前后 `themes-index.js` sha256 一致 | ✓ |
| 视觉 | 截图目视（三栏 / 缩略图 / 色板条 / 统计格 / 校样徽标） | ✓ |

**本轮修掉的问题**：① 格局重复（183→49）；② 简陋下拉 UI；③ `setMeta` 显示 `undefined`；
④ 封面标题孤字 / 行首标点 / 行首虚词断行；⑤ 配置色板时手写模板与主题模板两套路径统一；
⑥ V6 重设计后 `.pg` 宽度 300→310 导致成品写死缩放被裁 → 改为按实际宽度计算；
⑦ 元素未入 DOM 时 `clientWidth=0` 写出 `scale(0)` 让成品不可见 → 改为先入 DOM 再量 + `requestAnimationFrame` 校正。

## 7. 生成命令

```bash
# 改了 public/themes/*.json 后必须重跑（幂等）
.venv/Scripts/python.exe scripts/gen_longform_theme_index.py

node --test docs/prototypes/xhs/longform-art/*.test.mjs
.venv/Scripts/python.exe $TMPDIR/pagedspike/regress_all.py
.venv/Scripts/python.exe $TMPDIR/pagedspike/regress_browser.py   # 需 8128 静态服务
```

## 8. 边界与纪律

- **原型阶段只写原型**（未改 `pwa/src`、未改 `public/themes/*.json`、未触碰产品构建链）。
  ⚠️ **后续已按用户拍板做了产品内试验入口**，见下文 §9；本节的「未改 `pwa/src`」只描述原型阶段，
  **不代表现状**。未推送 / 部署。
- 主题索引是生成物；产品引擎真源仍是 `pwa/src/cover/cards.js`，老 `buildLong` 路径主体零改动。

- `doc_sync_check.py` 若报 `STATE.md 已过期`，通常是会话期间外部提交导致状态文件未再生成，
  与本原型无关；按「归属不明不擅自改」原则不重生成他人产物。
- 不做 WebGL / 运行时动效 / Satori / AGPL 代码引入。
- 两套引擎并存（JS 快速版 / Pyodide 精确预览）与 19 套杂志语法配料仍是后续议题。

## 9. 产品内试验入口（2026-11-06，用户拍板「做可开关的试验入口」）

| 项 | 做法 |
|---|---|
| 落点 | 原型 10 个模块移植到 [`pwa/src/cover/v6/`](../../../../pwa/src/cover/v6/)（资源路径改绝对 `ASSET_BASE`，不复制字体 / vendor）；新增 `mount.js` 把工作台挂进产品 `#longform-root` |
| 开关 | `localStorage` 键 `supersu.longform.v6`，**默认不存在 = 关**。右栏「试用新版工作台 V6」开启，「← 返回经典版长图文」关闭，切回时文章草稿不丢 |
| 兼容原框架 | 产品顶栏三 tab / 品牌 / 导出 / AI 入口原样保留；V6 只占 `#longform-root`；CSS 全 `#v6-root` 作用域，不改产品 `:root` / `cover.css`；开启时老 DOM 完全不注入（门禁 `#cv-*` id 不重复） |
| 复用产品管线 | 出图 `story.js::renderPageDoc`（`#xhs-cover` / 1080×1440）、ZIP `nine.js::zipTiles`、提示 `cover/ui.js::toast`、偏好 `supersu.longform.prefs.v1`（追加 `v6Layout` / `v6Swatch` / `v6Family`，老字段不丢） |
| 零负担 | `longform-page.js` 用**动态 `import()`** 加载 V6，默认关时零 V6 模块加载；老路径主体为纯插入（零删除）。⚠️ 静态 import 会把 11 个模块挂进 `cover/index.js` 启动依赖图、拖慢 `#btn-longform` 事件绑定，导致 `pwa_longform_test.py` 在按钮一出现即点击时落空（实测真实回归，已修） |
| 自动分页 | V6 用原型 `paginate.js` 的 DOM 实测装箱替换 `buildLong` 的分页真源（仅在开关开启时）；两条管线逐句产物比对见下 |

**实测证据（2026-11-06，全部为本次真实运行命令）**：

| 层 | 命令 | 结果 |
|---|---|---|
| 构建 | `node pwa/scripts/build.mjs` | 断言全过；V6 的 11 个模块被自动扫进 SW SHELL 清单 |
| 默认关门禁 | `scripts/pwa_longform_test.py` | 全绿（分页完整性 / 6 页上限 / 字号 / 填充率 / 页码签名 / 背景图 / 零 JS 异常） |
| 开启态端到端 | `$TMPDIR/pagedspike/probe_v6_product.py` | `all_pass`：61 格局卡 / 19 族 / 8 色板 / 老 DOM 不注入 / 自检零丢字 / 单张 PNG / ZIP 两张 PNG / 切回无残留 / 草稿保留 / 零报错 |
| 两条管线逐句比对 | `$TMPDIR/pagedspike/compare_pipelines.py` | short / standard / long 三夹具下 `oldText === v6Text === src`（逐字一致）、`missing` 空、`truncatedChars=0`；页数差异是分页策略本身 |
| 目视 | `output/longform-v6-product/v6-in-product.png` | 产品顶栏与三 tab 原样，V6 只占 `#longform-root` |

**回滚点**：删掉 `supersu.longform.v6` 这个键（或直接不点开关）即回到经典版；
`longform-page.js` 的插入块可整体移除，`pwa/src/cover/v6/` 目录可整体删除，`build.mjs` 会自动不再扫到它们。

> ⚠️ **仍是试验入口**：默认关、未替换线上默认行为、未 push、未部署。
> 用户拍板的「替换 `buildLong`」在开关开启态已落地，灰度转正式需另行拍板。
