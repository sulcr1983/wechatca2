# 任务收尾记录 — SuperSu

> 本文档为**单任务结束程序（Task Closure）**交付物：记录本次做了什么、如何验证、回滚点、剩余项与后续建议。
> 关联前置文档：`reports/系统诊断报告_2026-07-11.md`、`reports/superpowers-code-review-2026-07-11.md`。

---

## 0. 任务边界

| 项 | 内容 |
|----|------|
| 触发 | 用户要求"一起收尾，完成之后执行洁癖操作，执行软件工程正规的单任务结束程序" |
| 范围 | F1 封面不可用、F2 孤儿 LLM 调用、F3 集成测试失真、F6 受控提交、洁癖清理、文档同步 |
| 完成判据 | P0 两项修复并经真实执行验证；集成测试重写为对齐真实前端且全绿；工作区受控提交；私密/运行时/ vendored 目录已排除 |
| 不在范围 | F4 AI 限流（外部依赖）、F5 微信白名单（环境约束）、F7 文档偏差已随本次同步修正、E2E 中 1 项陈旧 UI 断言（属测试自身待清理，另行处理） |

---

## 1. 完成项与验证

### F1 — 小红书封面生成不可用（🔴→✅）
- **根因**：封面两条渲染引擎（归藏 / BLCaptain）均依赖 Playwright，但干净环境未安装，用户首次点击生成即 500 `No module named 'playwright'`。
- **修复**：venv 安装 `playwright` + 执行 `playwright install chromium`（Chromium 113.6 MiB）；`requirements.txt` 将 playwright 由"可选"改为"必需依赖"并标注。
- **验证（真实执行）**：起服务逐个打 `POST /api/social/generate`：
  - `editorial`（归藏/Playwright）→ 200，3 张图，全部可访问
  - `swiss`（归藏/Playwright）→ 200，3 张图
  - `mist`（BLCaptain/Node.js）→ 200，3 张图
  - 落盘 `output/*.png` 为 274KB–1.3MB 真实渲染图（非占位）。

### F2 — 孤儿后台 LLM 优化（🔴→✅）
- **根因（铁证）**：`app.py:177-178` 每次非 skip 渲染无条件触发 `_start_background_optimization` → `app.py:202` 的 `call_llm` 打**真实外部 LLM**；而前端 `index.html` 对 `optimize`/`EventSource`/`optimize-stream`/`switchToOptimized`/`optimized` 检索 = **0 匹配**，结果写了 `_opt_store` 却从不被读取。既违反"不用 AI 就不开 AI"原则，又白白吃限流（诊断中实测撞 429）。
- **修复**：`app.py` 默认关闭该自动触发，保留 `/api/optimize-stream` 端点与函数作为"可重新启用的基础设施"，并加注释说明启用条件（前端须先接入 SSE 消费链路）。
- **验证**：重跑 `test_e2e.py` → **40/41 通过，且顶部不再出现 429 噪音**；渲染响应从"可能数秒+限流"降为 ~19ms（纯本地）。

### F3 — 集成测试失真（🔴→✅）
- **根因**：`tests/test_integration.py` 是未跟踪新文件，断言大量过时：查旧版前端 id（`btn-social-link`/`socialText`/`socialGrid`/`step-label`/`workflow-step`/`combobox`/`theme-select` 等当前前端**均不存在**）、API 字段名误用 `text`/`theme`（真实契约为 `raw_text`/`theme_id`）、字面 `font-size: 24px`（真实前端用 rem 响应式）、硬编码不存在的主题 id `"default"`（404）。
- **修复**：重写为对齐真实前端契约——真实元素 id、正确字段名、字体容错解析、动态取真实主题 id、封面生成验证三条引擎。
- **验证**：起服务跑重写后集成测试 → **35/35 全绿**（封面生成现为真实可执行路径，非装饰断言）。

---

## 2. 验证结果汇总

| 套件 | 结果 | 说明 |
|------|------|------|
| `tests/test_e2e.py`（Flask test_client，无需起服务） | **40 / 41** | 唯一失败 = 1 项陈旧 UI 断言（`btn-social-link` 等旧 id），与本次修复无关，属测试自身待清理 |
| `tests/test_integration.py`（需起服务） | **35 / 35** | 重写后对齐真实前端，全绿 |
| 封面生成实跑（editorial/swiss/mist） | **3 / 3 × 200 + 出图** | 真实 PNG 落盘 |
| 主题/渲染/缩略图/润色/错误处理/性能 | 全绿 | 渲染 ~19ms，主题 ~50ms |

**健康度口径**：以"真实冒烟 + E2E 40/41 + 集成 35/35"为准；不要再被旧集成测试的红绿带偏。

---

## 3. 改动文件清单（本次提交）

| 文件 | 改动 |
|------|------|
| `app.py` | F2：默认关闭孤儿 LLM 优化自动触发（保留 SSE 基础设施） |
| `requirements.txt` | F1：playwright 标为必需依赖 |
| `tests/test_integration.py` | F3：重写为对齐真实前端契约 |
| `tests/test_e2e.py` | SSE 测试改为直接验证消费链路（避免 30s 超时，保持套件快速） |
| `.gitignore` | 排除 `.workbuddy/`（私密）、`output/`、`uploads/`、`test_output/`、`blcaptain-style-skill/`（嵌套 git+node_modules）、`reports/` |
| `AGENTS.md` / `HANDOFF.md` | 同步 F1/F2/F3 事实：路由数约 23（非 50）、playwright 必需、SSE 已关闭、字体 rem、测试计数 |
| `CLOSURE.md` | 本收尾记录 |

**未提交/已排除**：`.workbuddy/`（助手私密记忆，绝不入库）、`output/ uploads/ test_output/`（运行时产物）、`blcaptain-style-skill/`（vendored 子项目，自带 `.git`+`node_modules`）、`data/`（含加密账号密钥，已被 gitignore）、`.env`（密钥）。

---

## 4. 回滚点

- **本次修复对应提交（回滚点）**：`978005fee305fa24f375a2b6bfcd1368ad28b741`
  - 提交信息：`fix: 修复小红书封面缺失 + 关闭孤儿LLM调用 + 重写集成测试`
  - 回滚到修复前：`git revert 978005f` 或 `git checkout 978005f~1 -- <file>`
- 如需回滚 F2 单独回退：恢复 `app.py` 中 `_start_background_optimization` 的自动触发调用（约 `app.py:177-178` 附近，见该处注释）。
- 如需回滚 F1：卸载 playwright 依赖，并改回 `requirements.txt` 标注为可选。

---

## 5. 剩余项（建议后续迭代）

| ID | 项 | 级别 | 说明 |
|----|----|------|------|
| F4 | AI 润色/摘要偶发 429 | Minor | 外部 LLM 限流，配置在、非缺陷；可加重试/降级 |
| F5 | 微信推送需公网 IP 白名单 | Minor | 环境约束，本地不可真测；代码正常 |
| T-UI | E2E 中 1 项陈旧 UI 断言 | Minor | `test_e2e.py` 仍查 `btn-social-link` 等旧 id，需按真实前端修订（建议并入下次测试清理） |
| F7 | 路由数/字体等文档偏差 | 已修正 | 随本次 AGENTS/HANDOFF 同步修正 |

---

## 6. 后续建议（按优先级）

1. **P1 测试清理**：修订 `test_e2e.py` 中 1 项陈旧 UI 断言，使其与真实前端一致，目标 41/41。
2. **P1 凭证提交**：`data/accounts.json`（加密 AppSecret）与 `.env` 由 gitignore 保护，首次部署请单独走安全分发，勿入版本库。
3. **P2 SSE 兑现或彻底移除**：若产品需要"AI 优化预览"，在前端接入 `EventSource` 消费 `/api/optimize-stream` 并重新开启 F2 触发；若不需要，清理 `_opt_store`/`_start_background_optimization` 死代码。
4. **P3 依赖固化**：将 venv（含 playwright+chromium）固化为 `requirements` + 启动脚本校验，避免"换环境即 500"。

---

## 7. 环境/依赖说明（交接必读）

- **运行时**：Python 3.13（managed venv：`~/.workbuddy/binaries/python/envs/default`）；Node.js 22（BLCaptain 封面引擎）。
- **必需依赖**：`flask, python-dotenv, requests, pillow, markdown, platformdirs, playwright` + `playwright install chromium`。
- **启动**：`pip install -r requirements.txt && playwright install chromium && python app.py` → http://127.0.0.1:5000
- **测试**：E2E 无需起服务；集成测试需先起服务。
- **遗留进程清理**：若 5000 端口被旧服务占用，用 `powershell Stop-Process -Id <PID> -Force`（本环境 `taskkill //F` 语法不生效）。

---

## 8. 任务 2：移除模板「悬停即试看」，改为仅点击切换（2026-09-26）

> 独立小任务，追加记录（与上方 P0 修复任务无耦合）。

### 任务边界
| 项 | 内容 |
|----|------|
| 触发 | 用户："模版风格上面，鼠标放上去就自动切换模板……去掉这个功能，让用户点击模板再切换" |
| 范围 | 前端公众号模板条 `#tpl-strip` 的悬停试看（原 U-7） |
| 完成判据 | 悬停不再自动切换；点击仍正常切换；有头浏览器实测通过；文档同步；受控提交 |
| 不在范围 | 小红书页、后端/API（均未触碰） |

### 改动文件
| 文件 | 改动 |
|------|------|
| `templates/index.html` | 删除 `#tpl-strip` 的 `mouseover`/`mouseleave` 监听 + `hoverTimer`（原「悬停即试看 U-7」）；内置教程第 2 步文案由"鼠标划过就能试看"改为"点击卡片即可切换预览"；收尾时清理 `doRender` 死参数（见下） |
| `README.md` | 3 处"悬停试看/划过色卡即试看"→"点击切换/点色卡选主题" |
| `AGENTS.md` | U-7 实施状态加注：悬停试看已于 2026-09-26 按需求移除 |
| `files/TODO.md` | U-7 相关 3 处加注（P1-BATCH 行、U-7 条目、打标签讨论项） |
| `HANDOFF.md` | 新增「变更 16」记录 |
| `CLOSURE.md` | 本节 |

### 验证（有头浏览器，真实执行）
- 工具：Playwright `headless=False` + 真实 Chromium（`--no-proxy-server`），起真实 Flask 服务。
- 结果：**PASS**
  - 首次渲染：iframe.src 生成；
  - hover 第 2、3 张色卡 → iframe.src **不变**（服务日志 hover 期间 **0 次 `POST /api/render`**）；
  - 点击第 2 张色卡 → iframe.src **变化**；
  - 控制台 **0 error**。
- 截图：`output/verify_click_tpl.png`（临时验证产物，验证后清理）。

### 补充（同任务收尾）：清理 `doRender` 死参数
- **背景**：上一版为最小改动，保留了 `doRender(themeId, previewOnly)` 形参；但删除悬停试看后二者**已无任何调用者**（全部为无参 `doRender()` 调用），成死代码。
- **清理**：简化为**无参** `doRender()`，内部统一用 `activeTpl`；删除 `previewOnly` 分支（原 `else` 分支即现行为）与 `catch` 中的静默 `return`；函数上方过时注释一并重写为现状说明。**功能等价**。
- **回归（有头浏览器，真实执行）**：首渲染 ✓ · hover 不切换 ✓ · 点击切换 ✓ · 改输入自动重渲染 ✓ · 0 控制台报错 → **PASS**；服务返回的前端 `previewOnly`/`themeId` 计数 **= 0**。
- **验证脚本**：`output/verify_render_tmp.py`（临时产物，验证后清理）。

### 回滚点
- 主提交：`c88c4c27c1e914360e282615921acfd22684dcbf`（移除悬停试看）；收尾提交：`9dbc6f787953e75f72bb89c9d88081cdf253a2d9`（清理 doRender 死参数）
- 回滚：`git revert <hash>`，或恢复 `templates/index.html` 中原 `mouseover`/`mouseleave` 监听（原逻辑：`mouseover` 200ms 防抖调 `doRender(id, true)`，`mouseleave` 调 `doRender()`）。

### 影响 / 风险
低。仅前端交互变更，无后端/API 改动；点击切换路径未被触碰且经有头浏览器实测。

---

## 9. 任务 3：修「点 start 用不了」根因链 + 封面浏览器零下载化（2026-10-13）

> 独立小任务，追加记录（与上方任务无耦合）。

### 任务边界
| 项 | 内容 |
|----|------|
| 触发 | 用户："帮我看看为啥这个用不了。尤其是点 start" + "为啥需要 chromium？直接弹窗默认浏览器不行吗" |
| 范围 | `start-app.bat` 启动链路；封面双引擎的浏览器获取方式；有头测试套件的浏览器启动 |
| 完成判据 | 双击 start 零报错秒起；封面三引擎零下载出图（系统 Edge/Chrome）；回归绿；文档同步 |
| 不在范围 | 业务功能代码、前端页面、微信推送链路（均未触碰） |

### 改动文件
| 文件 | 改动 |
|------|------|
| `start-app.bat` | 重写为纯 ASCII（删两处 Chromium 下载；依赖自检 `2>nul` → `if errorlevel 1`；三条硬约束注释；CRLF 保持） |
| `app.py` | `__main__` 打印中文启动提示（承接 bat 移出的中文） |
| `core/browser_utils.py` | **新增**：`launch_browser` 回退链单真源（msedge → chrome → bundled） |
| `core/guizang_renderer.py` | 接入 `launch_browser`（删私有 `_launch_available_browser`） |
| `core/blcaptain_bridge.py` | Node 调用注入 `CHROMIUM_PATH`（上游 findChromium 原生口子，vendored 零改动） |
| `tests/test_headed_*.py` ×3 | 接入 `launch_browser`；docstring 更新；userflow 补 `import os` + sys.path |
| `AGENTS.md` / `README.md` | 启动说明、bat 三条硬约束、浏览器策略同步 |
| `HANDOFF.md` | 新增「变更 17」 |
| `CLOSURE.md` | 本节 |

### 验证（真实执行）
- bat 实跑（双击等效）：零碎片 / 零「系统找不到指定的路径」/ 依赖自检不误触发 / 服务秒起 / 浏览器自动打开；
- 三引擎出图：editorial / swiss / sp-mist 全 200，14 张 PNG Pillow 复核全有效；
- 无头 + 有头（3 秒启动 + 截图）双链路 ✓；
- **全测试矩阵 168/168 全绿**：test_e2e 52/52 · integration 35/35 · api_e2e 29/29 · headed_full_e2e 33/33（0 控制台报错）· wechat_copy 12/12 · userflow 7/7；
- 有头套件三处基建修复（本轮跑全量时暴露并收掉，详见 HANDOFF 变更 17）：树杀停服（venv launcher 孤儿占 5000）、教程弹窗遮挡适配（wechat_copy / userflow 补 modal 移除）。

### 回滚点
- 主提交（启动链路 + 浏览器零下载化）：`2cff76e`；测试提交（套件适配）：`f89a5fb`；文档提交：本节所在提交。
- 回滚：`git revert <hash>`（按需选择单笔或全部）。

### 影响 / 风险
低。系统 Edge/Chrome 与 bundled Chromium 同内核；回退链全失败时给明确报错（不静默）。`ms-playwright/` 里 ffmpeg/winldd 3.7MB 残渣无害可留。

---

## 10. 任务 4：六族 · 十二色主题（72 套）+ 暗底斑马纹修复（2026-10-13）

> 追加记录（与上方任务无耦合）。上游参考：[mspringjade/wechat-formatter](https://github.com/mspringjade/wechat-formatter)（TypeZen）。

### 任务边界
| 项 | 内容 |
|----|------|
| 触发 | 用户："帮我增加这些模板，要遵守它的版权规定"（附上游仓库链接） |
| 范围 | 新增 72 套原创主题（6 族 × 12 色）；配套暗底斑马纹修复；文档计数同步 |
| 完成判据 | 版权走"灵感派生原创"路线（经用户拍板）；生成物与规格真源一致；既有 47 套字节零改动；全量审计 + 四套件绿；有头目视六族成立 |
| 不在范围 | 上游任何代码/CSS/命名/文案的移植；小红书页；封面链路；`templates/index.html` |

### 版权路线（先核查后编码）
- **上游许可事实**：LICENSE = AGPL-3.0 全文；README 附加"未经书面授权禁止商用"及署名/链接/修改说明要求。
- **对 SuperSu 的代价**：直接移植 → 分发版整体 AGPL-3.0 + 非商用 + 署名；故不移植。
- **拍板**（AskUserQuestion）：**纯灵感派生 · 原创重写**，全量 6 族 × 12 色。仅参照品类观感（思想层），命名 / 色值 / 样式表达全部自研；族名（钢印/素页/卷宗/信笺/夜航/庙会）、色调词（朱砂…栗棕）、色值（HSL 推导）、描述均为本项目自拟。

### 改动文件
| 文件 | 改动 |
|------|------|
| `scripts/build_themes.py` | 第二批：6 族原型 + `FAMILY_TONES` + `FAMILIES`（含 accent2 规则与技法 patch 函数）+ `build_theme` 族分支；初代路径零改动 |
| `scripts/theme_specs.py` | 末尾追加「族 × 色调」72 条规格（命名/描述自拟） |
| `core/format_engine.py` | 斑马纹按主题底色明暗派生（亮底字节不变；暗底向白微混 6%） |
| `public/themes/*.json` | +72 新生成物（92→164 套） |
| `README.md` | 计数 92→164（图表/清单/架构图等 13 处）；顺手修正遗留的「鼠标划过色卡」过期文案 |
| `AGENTS.md` / `HANDOFF.md` | 计数与六族条目（HANDOFF「变更 18」） |
| `CLOSURE.md` | 本节 |

### 验证（真实执行）
- 生成器：`python scripts/build_themes.py` → 119 套（47 覆盖 + 72 新）；`git diff public/themes` 对既有 47 套 = **0 行**。
- 全量审计（`output/theme-review/gen_review.py`）：164 套富样本渲染（h1-h3/引用/列表/代码块/表格/容器/图片/hr）**全部通过**（标签平衡、无 None/空 style/拼接残渣）。
- 斑马纹对照实验：4 亮底主题渲染哈希前后**一致**；2 暗底主题按预期变更（夜航表格读数恢复）。
- 有头目视（系统 Edge，`output/theme-review/` 截图）：六族成立；修复 2 处当场问题（钢印 h3 挤行 → display:table；审查台示例图 data URI 截断 → base64）并复验。
- 套件：`test_e2e` **52/52** · `test_integration` **35/35** · `test_api_e2e` **29/29** · `test_headed_full_e2e` **33/33**（0 控制台报错）。

### 回滚点
- 主提交：`278391e3962c949f26a5581c26a76feebdfdc782`（feat(themes)：六族·十二色 72 套＋斑马纹修复）；回滚：`git revert 278391e`。
- 生成物级回滚：从 `scripts/theme_specs.py` 删第二批块 + 删 `public/themes/su-{stamp,minimal,biz,letter,night,feast}-*.json` 后重跑生成器。

### 影响 / 风险
低。技法补丁仅对新族生效、初代 47 套字节级回归证明未受影响；斑马纹修复亮底零影响。待用户评审审查台后如需调手感，改 `build_themes.py` 对应族 patch / `FAMILY_TONES` 后重跑即可（生成物勿手改）。

---

## 任务 5：公众号页重设计（设计阶段）+ 自动编辑三模式（2026-10-16 → 10-18）

### 改动文件
| 文件 | 改动 |
|------|------|
| `docs/wechat-page-redesign.md` | 新增：设计系统 tokens / 交互规范 / 前端契约 / P0-P3 落地顺序 |
| `docs/prototypes/wechat-redesign.html` | 新增：完整交互原型（单文件零依赖，可点可玩） |
| `docs/prototypes/first-principles-prototype.html` | 新增：简化多模板原型（方向验证，非落地基准） |
| `core/preprocessor.py` | 新增四模式（conservative/longform/tutorial/auto）+ 首句标题规则收紧（290→396 行） |
| `tests/test_e2e.py` | +4 项自动编辑测试（56/56） |
| `scripts/walkthrough_autedit.py` | 新增：自动编辑有头走查（3 类输入） |
| `templates/index.html` | placeholder 文案更新（1 行；界面重设计未落地） |

### 验证（真实执行）
- `tests/test_e2e.py` **56/56 通过**（含新增 4 项：散文不强提标题 / 长文自动分层 / tutorial 序数转列表 / conservative 不加标题）。
- 完整交互原型 6 张有头截图验证（Playwright + 系统 Chrome）：主界面 / 模板库抽屉 / 深色主题夜航反相 / 富文本粘贴 toast+撤销 / 复制失败浮层 / 插入 popover。
- 设计稿 5 帧经 Ardot `capture_layout` + `capture_screenshot` 双验证；修复 spacer 默认 100px 高度溢出、引用块文字撑高、解析条 padding 撑爆、tab 描边参数等问题。

### 回滚点
- 本次提交：`git log --oneline -1`（提交信息 `feat(design+preprocess): 公众号页重设计设计稿与原型 + 自动编辑三模式`）；回滚：`git revert <hash>`。
- 设计稿为云端文件（Ardot fileId 737147257801936），不参与代码回滚。

### 影响 / 风险
- `preprocess` 默认行为变化：auto 模式首行须确像标题才提升为 `#`；长散文自动补 `###` 小标题（≤5 个、间隔 ≥2 段）。既有 56 项测试全过，无回归。
- 三模式暂无 UI 入口（P1 接线项，用户已拍板「默认 auto + 设置可切」）。
- 界面重设计 0% 落地（P0 待执行，落地基准 = 完整版原型）。

---

## 任务 6：公众号页 P0 界面落地（2026-10-18）

### 改动文件
| 文件 | 改动 |
|------|------|
| `templates/index.html` | CSS 设计系统重写（token / 顶栏 / 三段式 / 解析条 / 风格条 / 抽屉 / popover / 浮层 / 可操作 toast）；公众号页 HTML 重构；JS 改造（解析条 / 模板库抽屉 / 插入 popover / 浮层 / toast 撤销）；约 +700 行 |
| `AGENTS.md` | §6 公众号页面关键元素全量重写（含后向兼容契约说明） |
| `HANDOFF.md` / `CLOSURE.md` | 变更 20 / 本节 |

### 关键词
- **零改测试迁移**：`.tpl-bar` → 风格条容器、`#tpl-strip` → 胶囊容器、`.tpl-card` + `.tname` → 胶囊结构、`#tpl-toggle` → 收起、`#tpl-search` → 紧凑筛选。三套有头测试 + 集成 + E2E 全部无需修改即通过。
- **解析条数据源**：`/api/render` 响应的 `markdown` 字段（引擎识别结果），不统计编辑器原文。
- **grid 行高修复**：`.d-card { display:flex; flex-direction:column; min-height:112px }`。

### 验证（真实执行）
- E2E **56/56** · 集成 **35/35**（含封面三引擎真实出图）
- 有头全按钮 **33/33**（0 控制台报错）· 有头用户流程 **7/7** · 有头复制/推送 **12/12**
- 改后截图 4 张：主界面 / 填充渲染（解析条「大标题 ×1 · 引用 ×1」）/ 模板库抽屉（两列卡片 + 使用中徽标）/ 插入 popover

### 回滚点
- 本次提交：`git log --oneline -1`（提交信息 `feat(ui): 公众号页 P0 界面落地（暖纸朱砂设计系统 + 三段式 + 解析条 + 模板库抽屉）`）；回滚：`git revert <hash>`。

### 影响 / 风险
- 界面结构与配色整体更换；小红书页继承新 token（布局未动）。
### 补充（同日）：模板库缩略图与收藏优先
| 文件 | 改动 |
|------|------|
| `scripts/gen_theme_thumbs.py` | 新增：164 套主题真实渲染缩略图生成（480×240 JPEG） |
| `public/theme-thumbs/*.jpg` | 新增：164 张缩略图 + manifest.json（2.8MB） |
| `templates/index.html` | 卡片真实缩略图（回退渐变）、收藏星标、收藏优先排序、抽屉默认「最近使用」、预览微信外框（导航条+互动条）、默认跨族精选 |
验证：E2E 62/62 · 有头全按钮 33/33（0 报错）。
回滚：`git revert <本次提交>`；缩略图可删目录 + 前端 onerror 自动回退渐变。
- 旧 DOM 契约保留，测试无需改；`#module-picker`（旧 select）已移除，由 `#btn-insert` popover 替代。
- P1 遗留：富文本粘贴（turndown）/ docx 导入（mammoth）/ pangu / 三模式 UI 入口；P2 遗留：历史抽屉、移动端单栏、a11y。

## 任务 7：PWA 阶段 0 可行性验证（2026-10-18）

**结论：两项命门全部通过，PWA 施工图 D1-D10 的排期成立。**

### 验的是什么

| # | 假设 | 判据 |
|---|------|------|
| 0a | 浏览器内 Pyodide 能跑通现有 Python 引擎 | 输出与本地 `POST /api/render` 的 html **逐字节相同** |
| 0b | 浏览器内能把封面 HTML 渲成 PNG（没有 Playwright） | 出 1080×1440 真图，文字清晰、长标题不溢出 |

### 实测结果

| 项 | 结果 | 数字 |
|---|------|------|
| 0a | ✅ 逐字节一致 | 引擎启动 **6686ms**；渲染 436 字 **415ms**；markdown 429 字、html 4821 字节，与本地完全相同 |
| 0b | ✅ 出图成功 | **792ms** 出 1080×1440 PNG（2.24MB），底图正常叠加，文字清晰无溢出 |

环境：Pyodide **v0.28.3**（jsdelivr CDN）；`html-to-image` 1.11.13；系统 Chrome 155.0.8059.84 有头。
证据：`docs/pwa-spike/report.json`、`docs/pwa-spike/0a-pyodide.png`、`docs/pwa-spike/0b-cover.png`。

### 两个关键技术结论（已回写施工图）

1. **markdown 打包必须带 dist-info**。markdown 3.10 优先用 entry points 找扩展（`tables`/`fenced_code`/`nl2br`），zipimport 里没有 `.dist-info` 会退化成 `import_module('tables')` → `ModuleNotFoundError`。把 `markdown-<ver>.dist-info/{METADATA,entry_points.txt,top_level.txt,WHEEL}` 一起打进 zip 即解决，**不改引擎一行**。
2. **封面模板依赖 Google Fonts**（Noto Serif SC / Noto Sans SC / Playfair Display / Inter / IBM Plex Mono 五个家族）。PWA 两条路都不允许保留该外链：合规断言禁止 `fonts.googleapis.com`，且国内被墙。D5 必须自托管（中文需子集化，否则体积失控）。

### 验证中发现的两处既有问题（**本轮未改**，等决策）

| # | 问题 | 证据 |
|---|------|------|
| B-1 | `preprocessor._looks_like_sentence` 词表含「是/了/在/我/你/要/为什么/问题/方法/内容/效果」等超高频词与**名词**，导致中文短标题几乎永远被判成句子 | 20 个典型小标题实测**只识别 9 个**：「常见问题」「我的做法」「写在最后」「使用方法」全 FAIL；spike 截图里「为什么要跑那么远」「住在哪里」均未成标题 |
| B-2 | 封面模板字体外链 | 见上 |

B-1 属 `core/` 改动，与「`pwa` 分支不改 core」的纪律冲突，且会改变全部渲染输出、需重跑 178 项测试并重生成 164 张缩略图 —— 需苏哥单独决策是否插队修。

### 改动文件
| 文件 | 改动 |
|------|------|
| `docs/pwa-spike/{report.json,0a-pyodide.png,0b-cover.png}` | 新增：验证证据（spike 代码跑完即删，未入库） |
| `docs/pwa-build-plan.md` | D2 / D5 补「已验证」与实测数字；新增字体自托管的硬约束 |
| `files/TODO.md` | PWA-0a/0b/0c 打勾 |
| `CLOSURE.md` | 本节 |

### 回滚点
- `git revert <本次提交>`；`docs/pwa-spike/` 可整目录删除，无代码依赖。

### 剩余项
- D1 起按施工图推进；D5 的字体子集化方案需在动工前定（见待决策）。
