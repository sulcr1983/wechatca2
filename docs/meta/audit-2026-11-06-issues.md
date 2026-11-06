# 三模块清查问题清单（2026-11-06）

> ✅ **2026-11-06 修复批次**：A-01/A-02/A-03/A-04/A-05、B-01/B-02/B-03/B-04、C-01/C-02/C-03/C-04、X-01~X-07、X-10 已修并通过回归；X-08（部署）、X-09（文档交叉状态）、X-11（主题结构多样性）待处理。

> 配套报告：[`audit-2026-11-06-three-modules.md`](audit-2026-11-06-three-modules.md)
> 基线：`c80c542` · 证据：`output/audit-2026-11-06/`
> 优先级：**P0** 主路径做不完/产物错误 ｜ **P1** 违反承诺或门禁失效 ｜ **P2** 体验/维护性
> 状态：S1 可用 / S2 有缺陷 / S3 临时硬编码 / S4 伪实现或死代码 / S5 未开发 / S6 无法验证

| ID | 模块 | 现象 | 证据（可复现） | 影响 | 根因 | 涉及文件 | 状态 | 优先级 |
|---|---|---|---|---|---|---|---|---|
| **A-01** | A | forbes 版式含图片时，正文出现 `100%" alt="审计图" src="http://…"` 裸文本 | 选 `mg-forbes` / 版式 `forbes`，正文含一张 Markdown 图片；183 套全量仅此 1 套、15 版式仅此 1 个；`output/audit-2026-11-06/a/kits/mg-forbes.png` | 文章可见损坏，用户会直接发布出去 | `layout_forbes()` 的数字放大正则未排除标签属性，把 `<img style="max-width:100%">` 的 `100%` 替换成 `<span>` | `core/magazine_layouts.py` `layout_forbes`（≈660-700） | S2 ✅已修 | **P0** |
| **A-02** | A | 选整篇设计后，「整页背景」仍可点、可写入 | 19/19 kit 的 `#set-grid-bg .bg-card[disabled]` = 0；点击后 `supersu.pwa.pagebg` 改变；`output/audit-2026-11-06/a/browser.json` | 违反「整篇设计锁死」承诺 | `app.js:2323` 运算符优先级：`!!(x\|\|{}).kind === 'kit'` | `pwa/src/app.js` `renderBgGrid` / `setBg` | S2 ✅已修 | P1 |
| **A-03** | A | hero / timeline 版式丢失 `<h2>` 语义 | 静态 15 版式矩阵：hero/timeline `h2=0`，其余 2；剪贴板 HTML 同样 `h2=0` | 无障碍/结构识别受损，视觉无感 | `_rewrite_h2_as_row()` 用 `section>span+span` 整段替换 `<h2>` | `core/format_engine.py:2039-2052`；调用点 `:2209`/`:2245` | S2 ✅已修 | P1 |
| **A-04** | A | 「外链转脚注」开关在 PWA 无效果 | `extract_links_as_footnotes` 只在 CLI 路径调用（`:3359`/`:3455`），PWA 入口 `:3535-3580` 无调用 | 开关是伪实现 | 接线遗漏 | `core/format_engine.py` | S4 ✅已修 | P1 |
| **A-05** | A | 183/183 主题在含表格时出现 `<tr style="">` 空样式 | `output/audit-2026-11-06/a/static.json`，`empty_style` 计数 183 | 产物残渣，微信中无害 | 斑马纹/表格注入留下空 style | `core/format_engine.py` 表格注入 | S2 ✅已修 | P2 |
| **B-01** | B | 九宫格 6/9 格近空白，界面无预警 | 1080×1440 封面切成 9 张 356×356；逐格墨迹 `0.004/0.000/0.002/0.168/0.229/0.111/0.019/0.000/0.000`，6 格 <2%；状态条只写尺寸 | 用户可能发布整片空白的九宫格 | 无逐格覆盖率判定 | `pwa/src/nine.js`、`pwa/src/cover/title-page.js` | S2 ✅已修 | **P0** |
| **B-02** | B | 文档称字体 10 款，实际 4 款 | `#cv-fonts .cv-chip` = 4；`TEXT_FONTS` = auto/sans/serif/smiley | 对外口径失真 | 交接稿转述错误 | `docs/meta/handover-2026-11-06:383` | S2 ✅已修 | P2 |
| **B-03** | B | 21:9 的 bigtype / swiss 标题相对画布明显偏小 | `output/audit-2026-11-06/b/png/supersu-cover-bigtype-wide.png`、`swiss-wide.png` | 横版「大字版」名不副实 | 字号未按尺寸缩放 | `pwa/src/cover/layouts.js` / `render.js` | S2 ✅已修 | P2 |
| **B-04** | B | 对外仍写「12 风格」 | README / AGENTS / overview 多处；实际 9 版式卡 / 25 style | 用户预期错位 | 旧口径未清 | `README.md`、`AGENTS.md`、`docs/overview.md` | S2 ✅已修 | P2 |
| **C-01** | C | 40 段长文只落 12 段（6 页上限），自检提示截断 1126 字 | 40 个编号句缺 28；自检「38/74 句未落版」；200 段缺 250/373、截断 7651 字；`output/audit-2026-11-06/c/browser.json` | 「长图文」主场景内容大量丢失 | `STORY_MAX_PAGES=6` 上限 + 分页装箱 | `pwa/src/cover/cards.js:278`、`buildLong` | S2 ✅已修 | P1 |
| **C-02** | C | 清空长文后仍保留 1 个封面槽，空态不显示 | `empty.slots=1`、`empty_visible=false` | 用户以为还有内容 | 空输入未回到空态 | `pwa/src/cover/longform-page.js` | S2 ✅已修 | P2 |
| **C-03** | C | `role:'steps'` 永不产出，步骤内容被当普通段落 | `pwa/src/cover/` 无 `role:'steps'`；页面角色只有封面/开篇/正文/清单 | 步骤版式白做 | `buildLong` 未产出该角色 | `pwa/src/cover/cards.js:285`、`:1046-1051` | S4 ✅已修 | P1 |
| **C-04** | C | X-5 的 `1013/854` 与现行代码不符，且出处写错 | 现行右栏 `scrollHeight=844 / clientHeight=844`；`1013` 实际在 `docs/xhs/review-xhs-studio-adversarial.md:189` | 误导修复方案 | 文档引用原型/错行 | `docs/INDEX.md:301`、交接稿 §3.2 X-5 | S2 ✅已修 | P2 |
| **X-01** | 工程 | `STATE.md` 少报 11 个本地套件、整层有头缺失；`--check` 只比 3 个字段 | 实际 22/2/2/6；STATE 记录 11/2/6；HEAD 442→443、工作区变脏仍报「一致」 | 「状态真源」不可信 | `gen_state.py` 行级正则 + `--check` 判据过窄 | `scripts/gen_state.py:161-171`、`:277-298` | S2 ✅已修 | P1 |
| **X-02** | 工程 | `preflight` 漏 `core/magazine_layouts.py`，只改它不会触发「dist 过期」 | `CODE_PATHS` 无该文件；`build.mjs:408` 会拷贝 | 可部署旧引擎 | 白名单遗漏 | `scripts/preflight.py:50-64` | S2 ✅已修 | P1 |
| **X-03** | 工程 | 线上层无长图文功能断言 | `pwa_online_e2e.py` 只查 `#btn-longform` 文案 | 部署漏 `longform-page.js` 无人发现 | 覆盖缺口 | `scripts/pwa_online_e2e.py` | S2 ✅已修 | P1 |
| **X-04** | 工程 | 九宫格门禁无空白/覆盖率断言 | `pwa_nine_test.py` 只查尺寸/顺序/颜色 | B-01 无法被门禁拦住 | 覆盖缺口 | `scripts/pwa_nine_test.py` | S2 ✅已修 | P1 |
| **X-05** | 工程 | 复制门禁只有默认主题 3 条断言 | `pwa_artifact_assert_test.py:127-158` | 多主题/图片组合无保护 | 覆盖缺口 | 同左 | S2 ✅已修 | P1 |
| **X-06** | 文档 | 「12 风格 / 10 字体 / 1013 出处 / X-1 / release 10 步」等口径漂移 | `doc_sync_check` 全绿但仍存在；详见报告 §5 | 接手人被误导 | 文档未随代码更新 | 多份 | S2 ✅已修 | P2 |
| **X-07** | 配置 | `.env.example` 缺 7 个实际 key，多 `PORT` | `.env.example` vs `.env` key 名对照 | 新人配置缺凭证 | 未同步 | `.env.example` | S2 ✅已修 | P2 |
| **X-08** | 运维 | 当前无法部署：HEAD 领先 1 个提交 + 2 个文档未提交 | `preflight --deploy` FAIL | 部署被拦 | 未 push / 工作区脏 | git | S2 | P2 |
| **X-09** | 文档 | 九宫格专用版式三处状态矛盾（已拍板/已被否/待决策） | INDEX §5.2 / 交接稿 §3.4 / requirements T-OUT-7 | 需求真源不清 | 未统一 | 三份文档 | S2 | P2 |
| **X-10** | 工程 | `STATE.md` 写「工作区干净」「最近门禁 3/3」，后者只是线上层 | `STATE.md:22`、`:36-38` | 状态误读 | 生成口径 | `scripts/gen_state.py` | S2 ✅已修 | P2 |
| **X-11** | 产品 | 164 套非 kit 主题仅 62 种结构签名；72 套为 6 族 × 12 色同骨架 | 去色值后的 `styles` 签名统计 | 「模板多」但看着像 | 生成器按族×色派生 | `scripts/theme_specs.py` / `build_themes.py` | S2 | P1 |

## 整改顺序（建议）

1. **P0 止血**：A-01（forbes 图片）、B-01（九宫格空白预警）。
2. **P1 承诺修复**：A-02、A-03、C-01、C-03、A-04、X-01、X-02、X-03、X-04、X-05、X-11。
3. **P2 收口**：A-05、B-02、B-03、B-04、C-02、C-04、X-06…X-10。

## 验收证据（逐项）

- **A-01**：183 套 + 15 版式含图渲染，正文不出现 `alt=` / `src=` 裸文本。
- **B-01**：逐格墨迹 <2% 时出现黄条；正常图不误报；九宫格测试新增覆盖率断言。
- **A-02**：19/19 kit 背景卡 `disabled`，点击不改 `supersu.pwa.pagebg`。
- **A-03**：hero/timeline 剪贴板 `h2 ≥ 1`，其余版式不回归。
- **C-01**：40 段文章全落版，或明确提示「已截断 N 字」且可回退。
- **X-01/X-02**：故障注入——改 HEAD、改 `magazine_layouts.py`、加套件，门禁必须变红。

## 产品决策（2026-11-06 已确认）

| # | 事项 | 结论 |
|---|---|---|
| D1 | 6 页上限 | ✅ **保持 6 页**；强化截断提示，并提供「拆成第二套」的出口（不提高上限） |
| D2 | 九宫格专用版式 | ✅ **做**，作为独立开发项排在止血之后 |
| D3 | 对外模板计数 | ✅ 按「**能用且看得出区别**」：A=164 配色 + 19 整篇；B=9 版式卡 / 25 style；C=12 模板 × 8 色板 |
| D4 | 21:9 字号 | ✅ **按尺寸缩放字号**，让「大字版」在横版也成立 |
| D5 | `steps` 角色 | ✅ **启用**，让「第一步/第二步」单独成页 |
