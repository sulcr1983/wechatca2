# 封面模块改造方案

> 日期：2026-10-25　状态：**已拍板，待开工**
> 拍板结果：P1 骨架**做** · P4 遮罩**直接删** · 精选组合由我出初稿
> 上游文档：`docs/cover-style-spec.md`（规范）· `docs/prototypes/cover-lab-audit.html`（审计）
> 新增文档：`docs/spec-cover-layout-skeleton.md`（骨架契约）· `docs/design-cover-gallery.md`（展示设计）
> 原型：**`docs/prototypes/cover-studio.html`** —— 工作台 + 模板库融合版，以这个为准
> 　历史：`cover-lab-v2.html`（工作台）· `cover-gallery.html`（模板库）
> 校验器：`scripts/cover_style_check.py`
> 版本/构建号一律见 `STATE.md`，本文不写死。

---

## 0. 一句话

把原型验证过的「**12 版式 × 10 色板 × 7 文字玩法**」接进现有 PWA 封面链路，
用 `cover-style-spec.md` + `cover_style_check.py` 保证**数量涨了、质量不掉**。

---

## 1. 今天走了三条线，产出在这里

| 线 | 产出 | 结论 |
|---|---|---|
| ① 外部调研 | `docs/research-2026-10-25-xhs-cover-survey.html` | 7 个方案对比 + 许可分档（MIT 可借鉴 / AGPL 只学思路） |
| ② 对抗性审计 | `docs/prototypes/cover-lab-audit.html` | 推翻 3 处、3 个真 bug、1 个盲区；保下 4 条真增量 |
| ③ 规范 + 原型 | `docs/cover-style-spec.md` + `cover-lab-v2.html` + `cover_style_check.py` | 立了硬约束，原型跑通 12 版式 × 底图三级遮罩 |

**三条线收束成一个判断**：封面这块真正的缺口不是「视觉不好看」，是
**版式数量上不去 + 没有质量门禁**。所以方案围绕这两件事展开。

---

## 2. 代码层现状（实测，不是印象）

### 2.1 模块职责

| 文件 | 职责 | 行数 |
|---|---|---|
| `pwa/src/cover/catalog.js` | 风格目录（纯数据，构建脚本与前端共用） | 43 |
| `pwa/src/cover/templates.js` | `GZ_COLORS` / `GZ_FONTS` 参数 + 占位符/底图/fitty 注入 | 374 |
| `pwa/src/cover/render.js` | 离屏 iframe → modern-screenshot 出 PNG | 102 |
| `pwa/src/cover/textmode.js` | 7 种文字玩法 + 4 种字体（**对 HTML 字符串后处理**） | 204 |
| `pwa/src/cover/search.js` | Pexels → Pixabay → Wikimedia 三级降级 | 373 |
| `pwa/src/cover/cover.css` | 封面页 UI 样式 | 299 |
| `public/cover-templates/*/index.html` | 10 套独立模板 | 66–177/套 |

### 2.2 校验器实测（`python scripts/cover_style_check.py`）

```
共 78 项 · 通过 54 · 失败 24

参数层  GZ_COLORS + GZ_FONTS           18/18 全绿  ✅
原型层  12 版式 + 10 色板                14 项失败  （原型侧问题，不进生产）
模板层  10 套 index.html .img-overlay    10 项失败  ⚠️ 见 §6
```

**关键事实**：现有两套体系（Editorial / Swiss）的字重、字距、字体、对比度
**本来就合规**。规范是把既有标准写下来，不是新设门槛。

### 2.3 最大短板

- **版式只有"每套一个 HTML"这一种扩展方式**，加一个版式 = 复制 66–177 行
- **没有排版质量门禁**：溢出、字号越界、对比度不足，全靠肉眼
- **10 套模板的遮罩写法违反项目自己的 `image-overlay.md`**（见 §6）

---

## 3. 目标与边界

### 要做

| 项 | 从 | 到 |
|---|---|---|
| 版式 | 原型 6 | **12**（+图文封面/编号大字/步骤/数据塔/四宫格/条账） |
| 色板 | 10 | **保持 10**（受 `theme-presets.md` 约束，见下） |
| 文字玩法 | 7（已有，但未与新版式一起验证） | **7 × 12 正交验证** |
| 质量门禁 | 无 | `cover_spec` 进 `run_gates.py` |

**色板为什么不扩**：`style-system.md:32` 写明「Editorial 只能用 6 套官方色板，
不要自己发明暖纸色，也不要造第二套暗色」。**扩数量靠版式，不靠滥造色板** ——
这是「多且漂亮」的分界线。

### 展示形态：一版式一卡 + 色点切换

12 版式 × 10 色板 = 120 组合。若按组合铺格子，用户会看到大量
「排版一样、只是换个颜色」的重复卡片。所以：

- **版式**是卡片身份（12 张卡）
- **颜色**降级为卡片底部的小色点（6 个或 4 个）
- 换色只改 `data-theme`，不重建 DOM → 零延迟

详见 `docs/design-cover-gallery.md`，原型 `docs/prototypes/cover-gallery.html`。

### 加版式必须过的差异度检查

原型第一版暴露过：**大字报和堆叠几乎一模一样**。根因是语义断行把两者字号抹平了。
所以加任何新版式都要过：

1. 与已有版式的标题字号差 **≥ 20%**，或
2. 有**独有结构元素**（时间轴 / 网格 / 分栏 / 超大数字 / 引号）
3. 缩略图 240px 宽下与相邻版式**一眼可辨**

### 不做

- ❌ 拖拽式画布编辑器（与"纯文本进、排版出"的定位冲突）
- ❌ 第三套视觉体系（要过 `spec §7` 三道门槛：新字体类型 + 新栅格 + 新图底策略）
- ❌ 改归藏 12 套的配色与字体规范
- ❌ LLM 出图做封面主视觉（文字准确率不可控）

---

## 4. 分阶段计划

每个阶段都能**独立上线、独立验证、独立回滚**。按风险从低到高排。

### P0 · 立规矩（预计 0.5 天，风险极低）

| 动作 | 文件 |
|---|---|
| 校验器接进门禁本地层，**只查参数层**（`--src pwa`，恒绿，不阻断存量） | `scripts/run_gates.py` |
| 校验器补 `--strict` 语义说明 + 退出码约定 | `scripts/cover_style_check.py` |
| 补登第三方声明（若本阶段引入新资产） | `THIRD_PARTY_NOTICES.md` |

**验证**：`python scripts/run_gates.py --quick` → 套件数 +1，全绿。

> 为什么先只查参数层：全量有 24 项存量失败，直接接会立刻红，变成"狼来了"。
> 等 §6 整改完再放开。

---

### P1 · 版式骨架化（预计 1–2 天，**风险最高**）

把「版式」从「每套一个 HTML」抽成「骨架 + 槽位」，落到 `pwa/src/cover/layouts.js`。

```
每个版式只声明：slots（title / lead / body[] / meta / page-no）+ 排序规则
颜色和字体全部从模板 CSS 变量继承，骨架不碰视觉
```

**分三次小步走**，每次只迁 3 个版式，且要求**输出结构一致**：

| 批次 | 版式 | 回归基准 |
|---|---|---|
| 1 | stack / list / quote | 现有 10 套模板渲染结果逐项对比 |
| 2 | poster / compare / dense | 同上 |
| 3 | 新增 6 个（image-led / number / steps / kpi / matrix / ledger） | 无基准，靠校验器 + 人工 |

**验证**：
- `python scripts/pwa_cover_test.py`（现有 cover 套件，须全绿）
- `node scripts/cover_tpl_unit.mjs`（模板单元）
- 新增：对批次 1/2 做「改前 vs 改后」HTML 结构 diff 断言

> ⚠️ **这一阶段有"不改视觉却改坏视觉"的风险**。已拍板 P1 要做，
> 但**批次 1/2（迁移老模板）可以停**：如果做不出可信的结构 diff 断言，
> 就让老 10 套继续走老路径，骨架只服务新增的 6 个版式 —— 架构照样成立，
> 只是老模板暂时不享受"改一次视觉改一个文件"的收益。

---

### P2 · 扩到 12 版式（预计 2–3 天）

依赖 P1（或 P1 的备选方案）。逐个补：

| 版式 | 槽位消耗 | 参考来源 |
|---|---|---|
| 图文封面 image-led | title + lead + byline | 归藏 M16 full-bleed |
| 编号大字 number | 大数字 + title + lead | 归藏 `num-mega` |
| 步骤 steps | title + body[]（编号） | 归藏 pipeline 版式 |
| 数据塔 kpi | title + 数字提取 | Swiss KPI Tower |
| 四宫格 matrix | title + body[]（前 4） | Swiss Matrix |
| 条账 ledger | title + body[]（标签/值） | Editorial ledger |

每个版式**必须同时交**：
1. 骨架实现
2. 一套「精选组合」（哪个色板最搭，写进 `catalog.js`）
3. 校验器全绿

**验证**：`cover_spec` 全绿 + 12 版式各出一张样图存 `docs/screenshots/cover/`

---

### P3 · 文字玩法与版式正交（预计 1–2 天，风险低）

**好消息**：`textmode.js` 的 `applyTextStyle(html, …)` 是**对 HTML 字符串后处理**，
天然与版式解耦，不需要改架构。

**要验证的冲突点**（原型阶段发现的）：

| 冲突 | 说明 | 处置 |
|---|---|---|
| 字号打架 | 我的 `planTitle` 自适应字号 vs textmode 的 `poster`（大字压阵，放大到极限） | 二选一，`poster` 模式接管时禁用自适应 |
| 断行打架 | `applyTextStyle` 的逐字 span（offset/rainbow）会破坏 `<br>` 语义断行 | 这两种模式下改用逐字 span 做断行 |
| 命名打架 | layout `poster`（大字报）vs textmode `poster`（大字压阵）是**两个维度同名** | UI 上分别叫「版式·大字报」「文字·大字压阵」 |

**验证**：12 layout × 7 textmode = **84 组合**，抽 20 个代表组合出图人工过 + 缩略图自检。

> 840 种全量截图不现实。策略：**精选组合全覆盖 + 其余抽检**。

---

### P4 · 10 套模板遮罩整改（预计 1–2 天，**视觉变化最大**）

**问题**（`cover_style_check.py` 实测，10 套全命中）：

```css
.img-overlay { inset: 0;
  background: linear-gradient(180deg, rgba(0,0,0,.35) 0%, .55 50%, .70 100%);
  backdrop-filter: blur(2px); }
```

这是 `references/image-overlay.md` 的 **Banned 第一条**，峰值 0.70 是规范上限 0.30 的 **2.3 倍**。

**做法**（严格按 `image-overlay.md` 的四步）：
1. 先删 `.img-overlay`，看裸图能不能读
2. 读不了 → 换图（选图优先）
3. 还不行 → 局部 image-toned tint，峰值 ≤0.30

**必须先做 A/B**：只改 `editorial-dune` 一套，出「改前 / 删遮罩 / 局部 tint」三张图给你看，
拍板后再推剩下 9 套。

**同步义务**：改完后更新 `THIRD_PARTY_NOTICES.md` 里「本项目所作修改」一栏
（AGPL §5 要求，归藏那条已有格式，照填即可）。

**验证**：`cover_spec` 违禁项归零 + 10 套样图人工过。

---

## 5. 与开发主线的衔接

| 主线机制 | 本方案怎么接 |
|---|---|
| `scripts/release.py` | 每个阶段独立发版；**先 `--dry-run` 演练** |
| `scripts/gen_state.py` | 版式数会进 STATE.md 的「产品规模」，需改 `gen_state.py` 的采集逻辑（现在读的是 8 种公众号版式，封面版式要另起一行） |
| `scripts/doc_sync_check.py` | 本文与 spec 都不写死版本号，只指向 STATE.md |
| `scripts/run_gates.py` | 新增 `cover_spec` 项挂**本地层（local）**，断网可跑 |
| `AGENTS.md §4` | **改引擎后必须重跑 `node pwa/scripts/build.mjs`**（本方案主要改 `pwa/src/cover/`，属引擎侧） |
| pre-push 钩子 | 新增文件已跟踪，无换行符风险（.md / .py / .html） |

**文档同步义务**：P2 完成后需更新
`AGENTS.md §3 架构速查`（cover 模块新增 `layouts.js` 要登记）。

---

## 6. 风险与应对

| 风险 | 概率 | 应对 |
|---|---|---|
| **P1 重构改坏现有 10 套** | 中 | 逐批次迁移 + 结构 diff 断言；做不出基准就放弃 P1 走备选 |
| **P4 视觉变化被否** | 中 | 先 1 套 A/B，不批量推 |
| 校验器误报（阈值太严） | 中 | 先只查参数层；规则要拿真实资产跑过再定（doc_sync 那次的教训） |
| 组合爆炸无法全量验证 | 高 | 精选组合全覆盖 + 其余抽检；明确写进验收标准 |
| 字重 500 在中文上被合成伪粗体 | 低 | 项目已有 400/700 woff2，浏览器按 400 匹配；如视觉不对再评估补 Medium 字重 |

---

## 7. 验收标准

1. **版式 12 个可用**，每个有 1 套精选组合写进 `catalog.js`
2. **`cover_spec` 门禁全绿**（参数层 18/18）
3. **现有功能不回退**：`pwa_cover_test.py` 与模板库套件全绿（当前基线见最新门禁日志）
4. **缩略图自检**：抽 20 个组合出 360px 图，标题可读
5. **文档同步**：`python scripts/doc_sync_check.py` 通过
6. **10 套模板遮罩**：违禁项归零，且三张 A/B 图存进 `docs/screenshots/cover/before-after/`

---

## 8. 已拍板（2026-10-25）

| 事项 | 决定 | 落地影响 |
|---|---|---|
| **P1 版式骨架化** | **做** | 新架构落到 `pwa/src/cover/layouts.js`；老 10 套继续走老路径，零风险 |
| **P4 遮罩** | **直接删** | 不保留 `.img-overlay`，裸图可读性交给选图（spec §6.2 双测试）；先改 1 套出 A/B 图 |
| **精选组合** | 我出初稿 | 已写进 `design-cover-gallery.md §5` 和原型数据；待按实际出图调 |

### 删除遮罩后的兜底

删掉 70% 黑渐变后，图选得差就会露馅。兜底顺序（不可跳）：

1. **换图**（quiet-zone ≥30% + 氛围光）—— 首选
2. 图实在换不了 → 局部 image-toned tint，峰值 ≤0.30（spec §6.3 Step 3）
3. 都不行 → 这个内容改用「标题在图外」的版式（stack / dense），不要硬压

---

## 9. 下一步（等开工指令）

按 P0 → P1 → P2 → P3 → P4 顺序，每阶段独立发版。

**开工前需要确认的最后一件事**：P1 的 `layouts.js` 是新建文件，
`AGENTS.md §3 架构速查` 需要同步登记（P1 完成时一起改，避免文档先行）。

---

## 附：本方案不涉及的事

- 本地 Flask 版（`app.py` + `templates/index.html`）—— 已弃用，不动
- `core/` 下的封面引擎（`guizang_renderer.py` / `blcaptain_bridge.py`）—— 本地版专用，不动
- `pwa/src/cover/search.js` 的三级降级 —— 已完善，不动
