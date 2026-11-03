# 文档与原型索引

> **这份文件解决什么问题**：`docs/` 里原本平铺了 65 份 `.md` + 36 份原型 HTML，
> 文件名各代混杂（v2/v3/v4/v5/v6/v7 并存），接手的人不知道**该读哪份、哪份已作废**。
>
> 2026-11-03 已按模块归组：**顶层只留 3 份**（本索引 / 概览 / 测试），其余进 7 个主题目录。
>
> ⚠️ **本文只做导航，不做裁决**。版本号 / 测试计数 / 主题套数一律看 [`STATE.md`](../STATE.md)。
> 每份文档的状态标记（🟢现役 / 🟡过程 / 🔴已废弃 / 📚长期参考）写了判定依据，
> 判定有疑问时**以文档自述为准**（本文可能滞后）。

---

## 0. 三十秒找到你要的

| 你要做什么 | 直接去 |
|---|---|
| **我刚接手，什么都不懂** | 下面 §1 的四份，按顺序读 |
| **我要改公众号排版页** | [`docs/wechat/`](wechat/) → 先读 `design-wechat-v6-final.md`（⚠️ 开头有勘误区） |
| **我要改小红书（标题图 / 长图文 / 封面）** | [`docs/xhs/`](xhs/) → 先读 `requirements-xhs-title.md` / `requirements-xhs-longform.md` |
| **我要改排版引擎 / 主题 / 版式 / 字号** | [`docs/engine/`](engine/) → 先读 `engine-change-impact.md` |
| **我要看还剩什么没做** | [`docs/meta/open-tasks-2026-11-01.md`](meta/open-tasks-2026-11-01.md) + 本文 §5 |
| **我要看原型长什么样** | 本文 §4（按模块分组，含打开方式） |
| **我要查「当初为什么这么定」** | [`docs/meta/`](meta/) + [`docs/archive/`](archive/)（28 份历史全文） |
| **我要发版 / 跑测试** | [`docs/testing.md`](testing.md) + [`docs/ops/runbook.md`](ops/runbook.md) |

---

## 1. 第一层：必读四份（🟢 现役）

| 文档 | 是什么 | 为什么必读 |
|---|---|---|
| [`STATE.md`](../STATE.md) | 项目单一状态源（**生成物，禁止手改**） | 版本 / 构建号 / 测试计数**只信这里** |
| [`AGENTS.md`](../AGENTS.md) | 工程规则唯一真源 | §11 是 Agent 纪律（含**选择器铁律**：要用户拍板必须给选项） |
| [`HANDOFF.md`](../HANDOFF.md) | 全系统交接 | 怎么上手、目录地图、坑清单、发版流程 |
| [`CLOSURE.md`](../CLOSURE.md) | 收尾台账 | 一行一轮，追历史决策的入口 |

> 加上本文 §5 的「未完成事项」= 完整的现状认知。约 1.5 小时。

---

## 2. 目录地图（7 个主题目录 + 4 个资源目录）

```
docs/
  INDEX.md            ← 本文（唯一入口）
  overview.md         ← 项目概览（一页看懂）
  testing.md          ← 现在怎么测（PWA 主产品）
  wechat/   19 份     ← 公众号排版（主线）
  xhs/      16 份     ← 小红书（标题图 / 长图文 / 封面工坊）
  engine/    8 份     ← 引擎 / 主题 / 版式 / 字号 / 字体
  pwa/       6 份     ← PWA 工程 / 发布 / 更新
  ops/       5 份     ← 工程规范 / 运维 / 审计
  research/  6 份     ← 竞品与外部调研
  meta/      2 份     ← 台账 / 快照
  prototypes/         ← 36 个原型（§4）
  archive/   28 份    ← 历史归档（每份开头有「已过期」声明）
  testing/   4 份     ← 测试四件套（PLAN / CASES / REPORT / BUG）
  brand/  screenshots/  ux-audit/  pwa-spike/   ← 素材与审计产物
```

---

## 3. 逐目录说明

### 3.1 `docs/wechat/` — 公众号排版（主线，🟢 现役）

**按阅读顺序**：

| 文档 | 状态 | 说明 |
|---|---|---|
| [`design-wechat-v6-final.md`](wechat/design-wechat-v6-final.md) | 🟢 **唯一有效方案** | 方案定稿。⚠️ **开头有勘误区，必读** —— 原文 4 处「现状描述」与线上代码不符 |
| [`plan-wechat-v6-implementation.md`](wechat/plan-wechat-v6-implementation.md) | 🟢 可执行计划 | P0–P6 分期 + 逐文件改动 + 每阶段验证 |
| [`review-wechat-v6-adversarial.md`](wechat/review-wechat-v6-adversarial.md) | 🟢 对抗性审查 | 纠正方案 4 处事实错误 + 2 处代码级陷阱 |
| [`plan-p4-drawer-split.md`](wechat/plan-p4-drawer-split.md) | 🟢 P4 拆分方案 v2 | 抽屉两 tab 拆分详细设计 |
| [`review-p4-drawer-split.md`](wechat/review-p4-drawer-split.md) | 🟢 P4 审查 | 14 条修订依据 |
| [`handover-2026-11-03-wechat-p4.md`](wechat/handover-2026-11-03-wechat-p4.md) | 🟢 **最新交接** | 当前状态 + 8 条陷阱 + 9 步行动清单。⚠️ 有 3 处与实测不符，见 §5 |

**数据真源**（改代码前必看）：

| 文档 | 说明 |
|---|---|
| [`design-kit-themes.md`](wechat/design-kit-themes.md) | 19 套 kit 的 `locked_layout` 权威表 + §7 不复用 `layout` |
| [`design-magazine-recipes.md`](wechat/design-magazine-recipes.md) | 每个杂志风版式的参数（字号 / 字重 / 对齐 / 装饰） |
| [`diagnosis-kit-layout-identity.md`](wechat/diagnosis-kit-layout-identity.md) | 19 套为何与 164 套看不出区别（根因：`layout_*` 只画样式不造结构） |
| [`design-kit-system-v2.md`](wechat/design-kit-system-v2.md) | kit 体系扩展 + 引擎 bug 修复 |
| [`requirements-three-modules.md`](wechat/requirements-three-modules.md) | 三模块需求全景（先读这份看全局） |

**过程稿（🟡 只作历史，别再当依据）**：`design-wechat-page-v3.md` · `design-wechat-v4-structure.md`
· `design-wechat-v5-summary.md` · `design-wechat-layout-naming.md` · `design-wechat-naming-and-discovery.md`
· `wechat-page-redesign.md` · `handover-2026-11-02-wechat-redesign.md`（记录了 5 个真实错误，仍值得读）
· `kit-thumbs-audit.md`（15 张时期的审计快照，现为 19 张）

> ⚠️ **数据真源 ≠ 文档**：19 套 kit 的实际配色在 `public/themes/mg-*.json`。
> **改配色改 JSON，不照抄文档里的色值表**（曾因手填文档色值错了 10/15）。

### 3.2 `docs/xhs/` — 小红书（⚠️ 会话已停止，代码未提交）

| 文档 | 状态 | 说明 |
|---|---|---|
| [`requirements-xhs-title.md`](xhs/requirements-xhs-title.md) | 🟢 需求真源 | 标题图需求台账 |
| [`requirements-xhs-longform.md`](xhs/requirements-xhs-longform.md) | 🟢 需求真源 | 长图文需求台账（含 D1–D20 决策） |
| [`design-xhs-studio-final.md`](xhs/design-xhs-studio-final.md) | 🟢 方案 V2 | Studio 定稿 |
| [`design-xhs-canvas-ux.md`](xhs/design-xhs-canvas-ux.md) | 🟢 单画布 UX | 标题图 / 长图文单画布方案 |
| [`design-xhs-photo-luminance.md`](xhs/design-xhs-photo-luminance.md) | 🟢 实测规则 | 搜图底图文字保护（亮度判定） |
| [`ux-spec-xhs-studio.md`](xhs/ux-spec-xhs-studio.md) | 🟢 体验规范 | Phase 2 体验规格 |
| [`review-xhs-studio-adversarial.md`](xhs/review-xhs-studio-adversarial.md) | 🟢 对抗性复核 | 5 个 P0 全给实测证据 |
| [`review-xhs-longform-templates.md`](xhs/review-xhs-longform-templates.md) | 🟢 对抗性审计 | 长图文模板策略 |
| [`design-module-split-ia.md`](xhs/design-module-split-ia.md) | 🟢 IA 决策 | 三模块拆分（R1–R6），**别扩模块间交互** |
| [`plan-xhs-longform-next.md`](xhs/plan-xhs-longform-next.md) | 🟡 进行中 | 会话停止时的计划 |
| [`design-xhs-studio-redesign.md`](xhs/design-xhs-studio-redesign.md) | 🟡 重设计稿 | V2 的前身（901 行） |
| [`handoff-xhs-studio-redesign.md`](xhs/handoff-xhs-studio-redesign.md) | 🟡 交接 | Studio 重设计交接 |

**封面工坊（另一条产品线，📚 参考）**：`cover-style-spec.md`（`cover_style_check.py` 的判据来源）
· `spec-cover-layout-skeleton.md` · `design-cover-gallery.md` · `plan-cover-module-2026-10-25.md`

> ⚠️ **「12 风格」是过期口径**：实测 9 套版式（`ALL_STYLES`）。
> `public/cover-templates/` 是 10 套模板 = 2 版式 × 5 配色。统一口径为「9 种版式 × 各自推荐配色」。

### 3.3 `docs/engine/` — 引擎 / 主题 / 版式（📚 长期参考）

| 文档 | 状态 | 说明 |
|---|---|---|
| [`engine-change-impact.md`](engine/engine-change-impact.md) | 🟢 **改动前必读** | 引擎三处改动的影响面与回归风险（650 行） |
| [`mobile-typography.md`](engine/mobile-typography.md) | 🟢 **判据来源** | 375px 移动端排版规范（`audit_mobile_typography.py` 依它） |
| [`design-layout-system-v3.md`](engine/design-layout-system-v3.md) | 🟢 实证版 | 抄句方便的真实手法 + 长图文 |
| [`design-engine-optimization.md`](engine/design-engine-optimization.md) | 🟢 优化方案 | 排版引擎性能 |
| [`design-font-feasibility.md`](engine/design-font-feasibility.md) | 🟢 实测 | 字体能落地多少（有实测数据） |
| [`design-paste-image-and-typography.md`](engine/design-paste-image-and-typography.md) | 🟢 实测 | 粘贴图片与排版细节 |
| [`benchmark-md2wechat.md`](engine/benchmark-md2wechat.md) | 📚 对标 | **B-2 建议已作废**（用户已改为正文一组） |
| [`design-layout-system-v2.md`](engine/design-layout-system-v2.md) | 🔴 已被 v3 取代 | 钩子清单低估了句方便的手法 |

### 3.4 `docs/pwa/` — PWA 工程（📚 长期参考）

| 文档 | 说明 |
|---|---|
| [`pwa-build-plan.md`](pwa/pwa-build-plan.md) | 施工图（🛑 D1–D10 已全部完成上线） |
| [`pwa-cloudflare-plan.md`](pwa/pwa-cloudflare-plan.md) | 🛑 历史快照，状态已过期 |
| [`pwa-design.md`](pwa/pwa-design.md) | 实施方案 v1（冻结为设计存档） |
| [`pwa-incremental-update-research.md`](pwa/pwa-incremental-update-research.md) | 增量更新调研（`?h=sha256` 缓存键的由来） |
| [`plan-update-2026-10-29.md`](pwa/plan-update-2026-10-29.md) | 更新体验重构落地清单 |
| [`update-handoff.md`](pwa/update-handoff.md) | 更新模块交接 |
| [`diagnosis-changelog-2026-11-03.md`](pwa/diagnosis-changelog-2026-11-03.md) | 🟡 **更新记录诊断（2026-11-03 快照）** —— 线上/本地实测 + 12 条修复建议，改更新记录前先读 |
| [`research-update-module-offtheshelf-2026-11-03.md`](pwa/research-update-module-offtheshelf-2026-11-03.md) | 🟡 **现成更新模块调研（2026-11-03）** —— 结论：没有能直接套的，附 git-cliff 本仓库实测证据 |
| [`review-adversarial-changelog-2026-11-03.md`](pwa/review-adversarial-changelog-2026-11-03.md) | 🟢 **对抗性审查（2026-11-03）** —— **推翻前一版结论**：切点可全自动推导（`version.json` git 历史即真源），附原型实跑验收。**改更新记录前以此为准** |

### 3.5 `docs/ops/` — 工程规范与运维（📚 长期参考）

| 文档 | 说明 |
|---|---|
| [`project-conventions.md`](ops/project-conventions.md) | 产出物与 Git 规范 |
| [`runbook.md`](ops/runbook.md) | 运行手册（装起停 + 故障排查） |
| [`audit-playbook.md`](ops/audit-playbook.md) | 审计作业指导书（36 项清单） |
| [`api-reference.md`](ops/api-reference.md) | ⚠️ **仅本地 Flask 版**（已封存，见 `ARCHIVE.md`） |
| [`agent-constitution-ai-usage.md`](ops/agent-constitution-ai-usage.md) | Agent 宪法模板 AI 用法 |

### 3.6 `docs/research/` — 调研（📚 长期有效）

| 文档 | 说明 |
|---|---|
| [`research-2026-11-01-theme-engines.md`](research/research-2026-11-01-theme-engines.md) | 主题体系开源调查（「只换颜色」是普遍现象吗） |
| [`research-2026-11-01-seneasy-72-layouts.md`](research/research-2026-11-01-seneasy-72-layouts.md) | 句方便 72 套版式实证 |
| [`research-2026-11-01-seneasy-copy-pipeline.md`](research/research-2026-11-01-seneasy-copy-pipeline.md) | 句方便复制链路实测（推翻「排版更细」） |
| [`research-2026-10-30-xhs-text-card-competitors.md`](research/research-2026-10-30-xhs-text-card-competitors.md) | 文字卡竞品调研 |
| [`research-2026-10-31-xhs-longform-generators.md`](research/research-2026-10-31-xhs-longform-generators.md) | 长图文生成器实际形态 |
| [`research-auto-image.md`](research/research-auto-image.md) | 自动配图成熟做法 |

### 3.7 `docs/meta/` — 台账与快照（🟡 会过期，用前看日期）

| 文档 | 说明 |
|---|---|
| [`open-tasks-2026-11-01.md`](meta/open-tasks-2026-11-01.md) | **未完成任务台账**（每条有证据出处，做完一条改一条） |
| [`NIGHT-REPORT-2026-10-31.md`](meta/NIGHT-REPORT-2026-10-31.md) | 某一晚的进度与待决策快照 |

---

## 4. 原型索引（36 个 HTML，已按模块归组）

### 4.1 必须先起静态服务

```bash
# 仓库根目录起服务（必须后台跑，前台调用结束就被杀）
/d/test/wechatca2/.venv/Scripts/python.exe -m http.server 8126

# 然后开
http://127.0.0.1:8126/docs/prototypes/wechat/wechat-v7.html
```

⚠️ **不能直接双击打开**：多数原型引用 `_core/`（内核）或 `data/`（缩略图），
`file://` 协议会被 CORS 拦住，字体和图片全加载失败。

### 4.2 目录结构

```
docs/prototypes/
  _core/     4   ← 公共渲染内核（xhs-ux-core.js/css + 两个工具脚本）
  _assets/   3   ← 公共素材（sample-quiet.jpg + 两个截图目录）
  wechat/   13   ← 公众号排版原型
  xhs/      15   ← 小红书原型（含自包含的 v2/ 与 v3/）
  cover/     5   ← 封面工坊原型
  legacy/    5   ← 最早期原型（2026-06 / 07）
  data/     21   ← kit 缩略图（**已 gitignore，新 clone 需重新生成**）
```

### 4.3 公众号排版原型链（🟢 v7 是最新）

| 原型 | 状态 | 内容 |
|---|---|---|
| **`wechat/wechat-v7.html`** | 🟢 **最新，唯一该看的** | 真数据 · 183 套 · 真缩略图 · 两 tab 抽屉 · 设置弹窗 · 字号滑块 |
| `wechat/wechat-v6.html` | 🟡 上一版 | 真数据 · 179 套 · 真缩略图 |
| `wechat/wechat-v5.html` | 🟡 过程 | 暖纸朱砂 · 手机外壳 · 真引擎缩略图 |
| `wechat/wechat-v4.html` | 🟡 过程 | 结构纠正版 |
| `wechat/wechat-v3.html` | 🟡 过程 | 方案 B · 四段式抽屉（用户评价「很乱」） |
| `wechat/wechat-abc.html` | 🟡 过程 | ABC 三方案对比 |
| `wechat/wechat-discovery.html` | 🟡 过程 | 版式命名与入口可发现性 |
| `wechat/abc-final-ui.html` | 🟡 过程 | ABC 定稿 UI |
| `wechat/color-compare.html` | 🟡 过程 | 配色方案对比（C 案暖纸朱砂的选定依据） |
| `wechat/layout-system.html` | 📚 参考 | 版式 × 配色原型 V3（378KB，体量最大） |
| `wechat/template-diff-3plans.html` | 🟡 过程 | 三方案差异对比 |
| `wechat/wechat-redesign.html` | 🔴 旧 | 2026-10-16 的早期重设计 |
| `wechat/wechat-studio-target.html` | 🔴 旧 | 2026-07-24 的目标稿 |

> ⚠️ **v7 的缩略图依赖 `docs/prototypes/data/`（21 个文件，已 gitignore 不入库）**。
> 新 clone 后看不到缩略图，需要：
> ```bash
> .venv/Scripts/python.exe scripts/gen_kit_thumbs.py
> cp public/kit-thumbs/*.jpg docs/prototypes/data/
> ```

### 4.4 小红书原型

| 原型 | 状态 | 内容 |
|---|---|---|
| `xhs/xhs-longform-layouts.html` | 🟢 较新 | 长图文版式（55KB） |
| `xhs/xhs-longform-plan.html` | 🟢 较新 | 长图文方案（46KB） |
| `xhs/xhs-canvas-ux.html` | 🟢 参考 | 单画布 UX（114KB） |
| `xhs/xhs-studio-redesign.html` | 🟡 过程 | Studio 重设计（203KB，最大） |
| `xhs/xhs-photo-composition-lab.html` | 🟡 过程 | 搜图构图实验 |
| `xhs/xhs-text-card-v2.html` | 🟡 过程 | 文字卡 v2（73KB） |
| `xhs/xhs-text-card.html` | 🟡 过程 | 文字卡 v1 |
| `xhs/ux-index.html` | 🟡 过程 | 封面工坊最终方案 |
| `xhs/ux-longform.html` | 🟡 过程 | 长图文 UX（77KB） |
| `xhs/ux-a-three-col.html` / `ux-b-rail.html` / `ux-c-dual-band.html` | 🟡 过程 | A 三栏 / B 侧轨 / C 双带 |
| `xhs/three-module-ia.html` | 🟢 参考 | **三模块 IA 原型**（77KB） |

**自包含子目录**：

| 目录 | 状态 | 内容 |
|---|---|---|
| `xhs/v2/` | 🟡 过程（已入库） | `index.html` / `title.html` / `longform.html` + 数据层 + 内核副本。**自带 `assets/`（13MB 字体与示例图，已 gitignore）** |
| `xhs/v3/` | 🟡 **会话停止时进行中** | `index.html` + 三概念稿（`concept-a-three-col` / `concept-b-canvas` / `concept-c-hybrid`）。⚠️ **工作区有未提交改动** |

### 4.5 封面工坊原型

| 原型 | 内容 |
|---|---|
| `cover/cover-studio.html` | 封面工坊（86KB） |
| `cover/cover-lab-audit.html` | 审计版（108KB） |
| `cover/cover-lab-v2.html` | 实验 v2（81KB） |
| `cover/cover-lab.html` | 实验 v1（46KB） |
| `cover/cover-gallery.html` | 模板库展示（37KB） |

### 4.6 最早期原型（`legacy/`，🔴 只作历史）

| 原型 | 内容 |
|---|---|
| `legacy/prototype_full.html` / `prototype_ai_simplify.html` | 2026-06-15 最早期 |
| `legacy/first-principles-prototype.html` | 2026-10-17 第一性原理原型 |
| `legacy/feature-expansion.html` | 2026-10-19 功能扩展 |
| `legacy/social-studio-target.html` | 2026-07-24 小红书目标稿 |

---

## 5. 未完成事项（唯一汇总，2026-11-03）

> 本节取代散在各文档里的「待办」段落。**做完一条改一条**，别只在新文档里写。

### 5.1 公众号排版（主线，P0）

| # | 事项 | 状态 | 证据 / 卡在哪 |
|---|---|---|---|
| **W-1** | P4 七项代码**已全部落地但未提交** | 🔴 待提交 | `git status` 有 4 个产品文件改动；见 `handover-2026-11-03-wechat-p4.md` §2.3 |
| **W-2** | **线上仍是坏的**：19 套整篇设计只换配色不换版式 | 🔴 待部署 | 线上 `engine.worker.js` 含 `py/magazine_layouts.py` = **0 命中**；修复在 `ffd94df`，已推送未部署 |
| **W-3** | 三项「内容开关」引擎侧不支持 | 🔴 待决策 | `extract_links_as_footnotes()` 只在 CLI 路径调用（`format_engine.py:3359/3455`），PWA 主入口不调 |
| **W-4** | 有头 E2E 52 条断言**从未跑完** | 🔴 待跑 | `scripts/pwa_headed_full_e2e.py --local`，必须后台 |
| **W-5** | 版式入口 8 → 15（新增 7 个报刊版式） | ✅ **已完成**（2026-11-03，用户拍板「扩」） | `LAYOUT_OPTIONS` 8→15；判据是实测「换主题后配色是否跟着走」，6 套品牌锁死的仍只走 kit；专项 `mag_layout` 63 项断言进门禁 |
| **W-6** | 7 个杂志风版式的 UI 中文名 | 🟡 待定 | 古籍名方案已拟好（`design-wechat-layout-naming.md`） |
| **W-7** | 移动端（375px）导航重做 | ⚪ 明确不在本轮 | 用户已定 |

### 5.2 小红书（两个模块，均已停止）

| # | 事项 | 状态 | 证据 |
|---|---|---|---|
| **X-1** | 9 个文件是未提交改动（含 `pwa/src/cover/cards.js` +133 行） | 🔴 待处理 | 已进 `pwa/dist`；直接部署会把别人的代码推上线 |
| **X-2** | 标题图 UX V2（三栏骨架）未落地 | 🔴 待做 | `pwa/src` 零改动，只有原型 |
| **X-3** | 九宫格专用版式（用户已拍板要） | 🔴 待做 | `requirements-xhs-title.md` T-2 |
| **X-4** | 长图文 `steps` 角色是死代码 | 🟡 待修 | `buildLong()` 从不产出 `role:'steps'` |
| **X-5** | 长图文模板区一屏看不全 | 🟡 待修 | `scrollHeight=1013 > client=854` |

### 5.3 工程 / 文档

| # | 事项 | 状态 |
|---|---|---|
| **E-1** | 文档已归组（本轮完成）：65 份顶层 → 3 份 | ✅ 2026-11-03 |
| **E-2** | 原型已归组（本轮完成）：36 个 → 6 个模块目录 | ✅ 2026-11-03 |
| **E-3** | 交接文档 `handover-2026-11-03-wechat-p4.md` 有 3 处与实测不符（背景段已写完 / 未推送实为已推送 / 漏记 kit 背景锁定 bug） | 🔴 待更正文档 |
| **E-4** | `pwa/src/app.js` 里 kit 态「背景不可改」因运算符优先级 bug 实际没生效 | 🔴 待修 |
| **E-5** | `docs/prototypes/data/` 与 `xhs/v2/assets/` 未入库，新 clone 缺缩略图与字体 | 🟡 已知，需重跑脚本 |

---

## 6. 归档区（`docs/archive/`，28 份）

**规则**：过程记录写这里，开头必须有「已过期 / 已归档」声明（`doc_sync_check.py` 的 [C] 段会拦）。

| 类别 | 文件 |
|---|---|
| 台账归档 | `closure-2026-09-10-task-log.md`（930 行）· `closure-2026-11.md` |
| 旧交接 | `handoff-2026-10-flask-spec.md` · `handover-2026-10-19-*` · `handover-2026-10-24-image-localize.md` · `handover-2026-10-25-pwa-onboarding.md` · `handoff-2026-10-25-round.md` · `handoff-stress-audit-2026-10-18.md` |
| 审计快照 | `audit-2026-10-18.md` · `audit-2026-10-18-playbook.md` · `design-audit.md` · `pm-review-abc-layouts.md` |
| 已完成方案 | `plan-audit-fix-2026-10-25.md` · `plan-oss-reference.md` · `pwa-consistency-and-speed-plan.md` · `test-plan-2026-10-18-abc.md` · `txt-format-support.md` · `testing-flask-2026-10-24.md` |
| 单任务结项 | `task_closure_*.md`（5 份） |
| 其他 | `MIGRATE-TO-LINUX.md` · `exe-packaging-report.html` · `feature-expansion-plan.html` · `legacy-scripts/` |

---

## 7. 状态标记与判定依据

| 标记 | 含义 | 判定依据 |
|---|---|---|
| 🟢 现役 | 当前有效，可作依据 | 文档自述「唯一有效 / 定稿 / 判据来源」，或代码/脚本直接引用它 |
| 🟡 过程 | 历史过程稿，只作背景 | 被后续文档明确写「已被本文收敛」，或文件名含 v1/v2 且已有 v3+ |
| 🔴 已废弃 / 待做 | 别再看 / 还没做 | 会话中明确判定「不可用」，或依赖的资源已删除/不入库 |
| 📚 长期参考 | 调研/规范，长期有效 | 内容是竞品实测、工程规范、技术调研，不随版本失效 |

**判定有疑问时以文档自述为准** —— 本文可能滞后于最新改动。

---

## 8. 维护规则

1. **新增文档 → 放进对应主题目录**，然后回来更新本文 §3。平铺在 `docs/` 顶层会被拒。
2. **文档状态变化时改标记**，尤其 🟡 变 🔴 时。
3. **本文不放具体数字**（版本号 / 套数 / 测试计数）→ 那些指向 [`STATE.md`](../STATE.md)。
4. **未完成事项统一写进 §5**，不要散落在各文档。
5. 本文放在 `docs/` 而非根目录，因此**不受**「活文档禁写数字」约束
   （该规则只针对 `README.md` / `AGENTS.md` / `HANDOFF.md` / `CLOSURE.md` 四份）。

**校验**：

```bash
.venv/Scripts/python.exe scripts/doc_sync_check.py
```

---

**整理时间**：2026-11-03
**覆盖范围**：`docs/*.md`（3 份）· 7 个主题目录（62 份）· `docs/prototypes/`（36 个 HTML + 6 个模块目录）
· `docs/archive/`（28 份）· `docs/testing/`（4 份）