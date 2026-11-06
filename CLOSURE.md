# 收尾台账 — SuperSu

> **这份文件是「单任务结束程序」的台账**：每完成一轮任务，在这里加一行，正文细节进 `docs/archive/`。
> 只记**结论与去处**，不记过程细节——过程细节随时间只会变成噪音，而且最容易过期。
>
> 数字（版本号、门禁用例数、主题套数）**不写在这里**，见 [`STATE.md`](STATE.md)。

---

## 1. 台账（新的加在最上面）

| 日期 | 任务 | 结果 | 详细记录 |
|:--|:--|:--|:--|
| 2026-11-06 | 长图文 V6 工作台以「可开关试验入口」接入产品 | `pwa/src/cover/v6/`（原型模块移植 + `mount.js` 挂进 `#longform-root`）；`longform-page.js` 为纯插入分派，开关 `supersu.longform.v6` **默认关**、老 `buildLong` 路径主体零删除。**动态 `import()`** 保证默认关零加载，并修掉静态 import 拖慢 `#btn-longform` 事件绑定的真实回归（门禁曾因此超时）。验证：构建断言全过 · 默认关长图文门禁全绿 · 开启态端到端（格局卡 / 零丢字 / PNG / ZIP / 切回无残留 / 草稿保留 / 零 JS 报错）· 两条分页管线逐句产物一致 · `doc_sync_check.py` 一致性校验。代码与文档在本轮落地；推送与部署由后续发布流程执行 | [`docs/prototypes/xhs/longform-art/README.md`](docs/prototypes/xhs/longform-art/README.md) §9 · [`docs/INDEX.md`](docs/INDEX.md) §3.2/§4.4/§5.2 · [`docs/xhs/design-xhs-longform-v4.md`](docs/xhs/design-xhs-longform-v4.md) §5 落地更正 |
| 2026-11-06 | 三板块项目交接文档（公众号排版 / 小红书标题图 / 小红书长图文） | 新增 `docs/meta/handover-2026-11-06-three-modules.md`（六章：项目概览 / 已完成内容 / 未完成任务 / 踩坑与经验 / 遗留风险与后续建议 / 待确认清单）；**全部结论来自实读代码 + 实跑命令**（`git`/`grep`/`node`/`python`/`diff`），不采信方案文档转述；实测复核出 3 处文档与代码不符并就地修正（X-1「未提交改动」已失效、X-5 数字源自原型、`164 套 su-*` 口径有误），新发现 2 个真 bug（kit 背景锁定运算符优先级、hero/timeline 丢 `<h2>` 语义标签）并登记进 `docs/INDEX.md` §5。验证：`doc_sync_check.py` 全绿（含 [H] 段相对链接可达）、`preflight.py` 通过、线上 v1.18.0/b429 与本地一致 | [`docs/meta/handover-2026-11-06-three-modules.md`](docs/meta/handover-2026-11-06-three-modules.md)（新交接文档）、[`docs/INDEX.md`](docs/INDEX.md) §3/§5（登记与复核） |
| 2026-11-03 | 文档与原型归组（`docs/` 顶层 65 份 → 3 份；36 个原型 → 6 个模块目录） | 文档进 7 个主题目录（wechat/xhs/engine/pwa/ops/research/meta），顶层只留 `INDEX.md`（重写为唯一入口，含未完成事项汇总 §5）/`overview.md`/`testing.md`；原型进 `prototypes/{_core,_assets,wechat,xhs,cover,legacy}`；全仓同步 192 条相对链接 + 99 处原型路径 + 49 处资源上跳层数；`doc_sync_check.py` 新增 [H] 段机检相对链接可达（含反向验证）；更正上一轮交接 3 处与实测不符 + P-1 文档冲突说明。验证：真实浏览器跑 8 个原型 0 资源错 / 0 JS 报错、`doc_sync_check` 全绿、`run_gates --quick` 4/4 | [`docs/INDEX.md`](docs/INDEX.md)（新入口）、提交 `532f384` / `abfe0f3` |
| 2026-11-02 | 15 个杂志风版式 + 15 套整篇设计（kit）+ 编辑器图片能力 | 版式：`core/magazine_layouts.py` 新增 15 个版式（time/guardian/vogue…），注册进 `LAYOUT_REGISTRY`（19 个），出口带保真闸门；kit：15 个 `mg-*.json` 带 `kind:"kit"`+`locked_layout`（不复用 `layout`，避免被本机 `layoutOv` 覆盖），锁定时版式胶囊真 disabled、色卡置灰、退出回记忆主题；图片：恢复 `editor-images.js`（压缩 150KB/张）、`copyRich` 复制前自动内嵌外链图、搜图复用 Pexels、AI 生成英文关键词。验证：版式 15/15、kit 15/15、锁定态与退出实测、对比度 179/179、渲染 179/179 | [`HANDOFF.md`](HANDOFF.md) §0/§5、`docs/wechat/design-magazine-recipes.md`、`docs/wechat/design-kit-themes.md`、`docs/engine/design-paste-image-and-typography.md`、`docs/research/research-2026-11-01-seneasy-copy-pipeline.md` |
| 2026-11-01 | 更新记录缺最新版本（发版/部署流程加一道「更新记录」闸） | 根因：`changelog_milestones.json` 切点全靠手工加，1.14.0 之后连续三次发版漏加，1.16.0/1.16.1/1.17.0 的改动全被并进 1.14.0 卡片。修复：生成器缺切点自动补 + 自检断言、`preflight` 新增 `check_changelog()`、`build.mjs` 构建断言、`deploy.sh` 部署前复用 preflight、`release.py` 把 milestones 纳入生成物；并回填 1.14.0 收口与 1.17.0 切点/亮点 | [`AGENTS.md`](AGENTS.md) §「版本号规则」新增的更新记录说明段 |
| 2026-11-01 | 小红书封面 UX 对抗性复核 + V2 重做（方案 / 原型 / 复核报告） | 只动 `docs/` 与 `scripts/`，**`pwa/src` 零改动**；5 个 P0 全部给实测证据并在 V2 原型里修掉；未提交 | [`HANDOFF.md`](HANDOFF.md) §6、`docs/xhs/review-xhs-studio-adversarial.md`、`docs/xhs/design-xhs-studio-final.md`、`docs/prototypes/xhs/v2/` |
| 2026-11-01 | 全系统交接文档重写（并入探索史 / 被否方案 / 全部坑 / 未完成项） | `HANDOFF.md` 400 行；台账超 10 行，历史 11 行移入 `docs/archive/closure-2026-11.md` | [`HANDOFF.md`](HANDOFF.md) |

> 更早的 11 行（2026-07-11 ~ 2026-11-01 上午）已按 §3 规则移入
> [`docs/archive/closure-2026-11.md`](docs/archive/closure-2026-11.md)。

## 2. 一轮任务结束时做什么

1. **代码**：门禁全绿（`scripts/run_gates.py`，发版后加 `--online`）
2. **文档**：改了行为就同步 `AGENTS.md` / `README.md` / `docs/*`；跑 `scripts/doc_sync_check.py` 机检
3. **台账**：在本文件 §1 加一行（日期 / 任务 / 结果 / 详细记录在哪）
4. **提交**：本轮改动**一起**提交，提交信息写清「为什么」，不只是「改了什么」
5. **归档**：如果本轮产生了超过 100 行的过程记录（诊断报告、逐项验收），写进 `docs/archive/`，本台账只留一行指针

## 3. 台账归档规则

- 本文件的表格**超过 10 行**就把整份移到 `docs/archive/closure-YYYY-MM.md`（加归档声明头），本文件重建为空台账。
- 单轮任务的逐项验收（改了哪些文件、怎么验证的、回滚点）**不进本文件**，直接进 `docs/archive/`。
  2026-10-29 之前的历史做法是全部堆在一份 `CLOSURE.md` 里，最后长到 930 行、没人读，见
  `docs/archive/closure-2026-09-10-task-log.md`。

## 4. 归档索引（`docs/archive/`）

| 文件 | 是什么 |
|:--|:--|
| `closure-2026-11.md` | 2026-11-01 从本文件移出的 11 行台账（2026-07 ~ 2026-11） |
| `closure-2026-09-10-task-log.md` | 任务 1–23 逐项收尾全文（930 行，含回滚点） |
| `handoff-2026-10-flask-spec.md` | Flask 时代系统说明（模块地图 + 变更 1–24） |
| `handover-2026-10-25-pwa-onboarding.md` | 2026-10-18 写的 PWA 交接说明 |
| `handoff-2026-10-25-round.md` | 2026-10-25 那一轮交接（踩坑 7 条 + 遗留问题） |
| `testing-flask-2026-10-24.md` | 本地 Flask 版的测试基线 |
| `task_closure_*.md` | 更早的单任务结项记录（5 份） |
| `legacy-scripts/` | 2026-10-30 从 `scripts/legacy/` 归档的历史审计脚本（见其中 README） |
| `plan-*.md` / `pm-review-*.md` / `pwa-*-plan.md` 等 | 2026-10-30 归档的已完成/过期方案稿（各份开头有「已归档」声明） |
