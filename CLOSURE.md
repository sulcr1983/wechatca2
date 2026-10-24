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

## 任务 8：修「中文小标题识别不出来」（2026-10-18）

**诉求**：阶段 0 验证时发现——粘贴真实文章后，`为什么要跑那么远`、`住在哪里`、`常见问题` 这类小标题全被当成普通段落。这也是用户 2026-10-18 早前抱怨"只识别 3 个标题"的真正根因（当时只补了列表/引用/代码块，标题这条没真修）。

### 根因

`core/preprocessor.py` 的 `_SENTENCE_WORDS` 词表混进两类不该有的词，等于恒真：

1. **超高频单字虚词**：`是|了|在|就|都|很|不|也|我|你|他|这|那|会|能|要|把|被|让|给|对|从|到|与|及|或` —— 任何一句中文都含其中之一。
2. **名词**：`问题|方法|内容|效果|特点|功能|目的|意义|影响|过程|结果|原因|作用|优势|发展|情况` —— 这些恰恰是标题最常用的词。

**量化证据**：20 个典型中文小标题，修复前**只识别 9 个**。FAIL 的包括「常见问题」「我的做法」「写在最后」「使用方法」「内容清单」「效果对比」「重点在这里」「为什么要跑那么远」「住在哪里」「为什么会这样」。

### 修法（三处，仅 `core/preprocessor.py`）

1. **收窄 `_SENTENCE_WORDS`**：只保留三类真信号 —— 强句式短语（是因为/所以/但是/如果/已经/可以/为什么…）、主语代词+谓语（我把/他说的/你要…）、完成体词尾（…着了过）。
2. **孤立行改用更窄的 `_PROSE_PREDICATE`**：孤立成行（前后空行）的短行优先当标题，但仍挡掉「他说了一句话」这类强谓语短句。刻意不收「的」——「我的做法」「出发前的准备」是名词短语，属标题。
3. **首行放宽 `_looks_like_title(is_first_line=True)`**：首行跳过句式判定。产品约定是「第一行自动当标题」（前端 placeholder 就这么写），而首行常带逗号或主语（「周末去海边，我把手机调成了飞行模式」）。

### 验证（真实执行）

- 20 个典型小标题：**9/20 → 20/20**
- 真实文章样本：`# 周末去海边，我把手机调成了飞行模式` + `## 为什么要跑那么远` + `## 住在哪里`，列表/引用不受影响
- 新增 3 项回归测试（含一条**负面测试**，第一版修法被它抓到「他说了一句话」漏成标题，已补 `_PROSE_PREDICATE` 修正）
- **全量 65 / 35 / 29 / 33 / 7 / 12 = 181 全绿**（原 178 + 新增 3）

### 缩略图：确认无需重生成

`scripts/gen_theme_thumbs.py` 的样例本身就是 Markdown，`preprocess` 只去掉了尾部空行（`a.strip() == b.strip()`），**164 张缩略图不受影响**，未重跑。

### 改动文件
| 文件 | 改动 |
|------|------|
| `core/preprocessor.py` | `_SENTENCE_WORDS` 收窄；新增 `_PROSE_PREDICATE` / `_looks_like_prose_line`；短行标题判定按孤立/非孤立分流；`_looks_like_title` 加 `is_first_line` |
| `tests/test_e2e.py` | 新增 3 项（20 标题全识别 / 首行带逗号提升 H1 / 正文段落不反弹） |
| `README.md` / `AGENTS.md` / `docs/testing.md` / `docs/pwa-build-plan.md` | 计数 62→65、178→181 |

### 回滚点
- `git revert <本次提交>`；回滚后 E2E 恢复 62/62。

### 纪律说明
本次改的是 `core/`，在 `pwa` 分支上做（当时 `pwa` 尚未有专属代码），改完把 `main` 快进同步。此后 `pwa` 有专属代码时，`core/` 改动必须回 `main` 做再 rebase。

## 任务 9：品牌 logo 接入（本地版 + PWA，2026-10-18）

**诉求**：用户提供「折纸 S」logo（初版蓝紫、后自行改成朱砂以匹配系统主色），要求放到首页系统名称左侧、系统更新相关位置，并处理 PWA 应用图标。

### 决策（用户确认「按上面的方案」）
- 配色 A：UI 主色仍朱砂（不动 `--accent`），只有徽标是彩色图。
- 徽标形态 A：直接用整块圆角图标 + 1px 描边（不抠图）。
- maskable 底色：浅底（与源图一致）。
- 更新区范围 A：更新入口 + 更新记录面板头部 + 关于弹窗加 logo；**发布小票卡不加**（卡内已有版本徽标）。
- 系统名称：**本轮未改名**，待用户确认。

### 资产链路（新增）
`docs/brand/logo-source.png`（源图 1254²）→ `scripts/build_brand_assets.py` →
- `public/brand/`：logo-64 / logo-256 / favicon-32（本地版走 `/assets/brand/*`，PWA 构建拷进 `dist/brand/`）
- `pwa/public/icons/`：icon-192 / icon-512 / icon-512-maskable / apple-touch-icon(180) / favicon-32（替换原朱砂「版」）

**源图两个坑**（已写进脚本注释）：
1. 圆角外的黑底不是纯黑（实际 1~5 的近似黑），用 `!= (0,0,0)` 判会得到 1px 圆角、黑角填不掉；
2. 圆角是 iOS 式 squircle，按正圆角几何去裁会留一圈暗像素（缩到 32px 肉眼可见）→ 改按颜色判「V ≤ 215 且彩度 ≤ 40」填底色。**不能用 HSV 的 S 判彩度**：近黑像素（max 极小、min=0）时 S 退化成 255，黑底会整片漏填，必须用 V×S/255 反算。

### 接入位置
| 位置 | 本地版 | PWA |
|------|--------|-----|
| 浏览器标签页 | `/assets/brand/favicon-32.png`（替换原内联 SVG） | `icons/favicon-32.png` |
| 顶栏名称左侧 | `.topbar .logo img` 28px | `.brand-mark` 24px（原 `.seal` 朱砂「版」已删） |
| 启动条 | — | `.boot-mark` 22px（原朱砂方块 + 白点） |
| 更新入口按钮 | — | `.brand-mark.xs` 16px（**保留原红点**「有未读更新」） |
| 更新记录面板头部 | — | `#cl-head` 徽标 24px |
| 关于弹窗 | — | `.brand-mark.lg` 40px |

### 改动文件
新增：`scripts/build_brand_assets.py`、`docs/brand/logo-source.png`、`public/brand/*`、`docs/brand/logo-prototype.html`（对比稿原型）
修改：`templates/index.html`、`pwa/index.html`、`pwa/src/style.css`、`pwa/src/update/ui.js`、`pwa/src/update/changelog.js`、`pwa/public/sw.js`、`pwa/scripts/build.mjs`、`pwa/public/icons/*`（5 张替换）、`AGENTS.md`

### 验证（真实执行）
- 资产生成：8 张图**四角零残留**（全图扫描「深灰残留像素 = 0」，人工目视确认无圆弧描边）。
- PWA 构建：`node pwa/scripts/build.mjs` 断言通过（关键文件含 `brand/*`、主题 164 套一致、无 Google Fonts 外链）；BUILD_ID 变化 → 用户端会收到一次静默更新（预期行为）。
- 本地：`tests/test_e2e.py` **65/65**；`tests/test_headed_full_e2e.py` **33/33 通过 + 0 控制台报错**。
- 两版目视（有头浏览器）：6 处（本地顶栏 / PWA 顶栏 / 启动条 / 更新入口 / 更新记录头部 / 关于弹窗）全部正常，无变形、重叠、破图。
- 备注：PWA dist 预览时服务器日志有一条 `/release-notes.json?ts=` 404，**全仓库 grep 无该路径引用**，非本项目代码发出（浏览器扩展或缓存），不影响功能。

### 追加（用户确认 5 项决策后，同日）
1. **系统名称统一为「SuperSu 公众号编辑器」**：两版 `<title>` 改为 `SuperSu 公众号编辑器 — 排版 + 封面`；manifest `name` 改同（`short_name` 仍为 `SuperSu`，主屏标签短）；PWA 关于弹窗标题改「关于 SuperSu 公众号编辑器」；两版顶栏在粗体 `SuperSu` 后加浅色小字「公众号编辑器」（`.logo-sub` / `.brand-tail`，`margin-left:4px` 紧贴主名）。
2. **发布小票卡也加 logo**（原方案 A 决定不加，用户改判为「全都加」）：`.upd-head` 首位插入 24px `.brand-mark`，版本徽标与日期保持原样。

验证同上（改动仅文案与一个 `img` 节点），重跑 PWA 构建 + 65/65 + 33/33 与两版目视。

### 窄屏修复（用户点名：不用问，直接修）
`templates/index.html` 的 `@media (max-width:800px)` 内加：`.logo-sub` 隐藏；`.topbar` 改 `overflow-x:auto` + 隐藏滚动条；`.logo/.tab-btn/.top-btn` 设 `flex:0 0 auto; white-space:nowrap`。
**修的是既有问题**（改动前就有）：窄屏顶栏里「公众号排版/小红书封面/教程/设置」会被压成竖排单字折行。实测：375px 现在单行、可横滑（scrollW 459 > clientW 355），800/1440 无横滑、后缀小字照常显示。

### 部署上线（2026-10-19）
- 铁律流程走完：commit `7653a78`（pwa 分支）→ `git checkout main` + `--ff-only` 快进 → `git push origin main`（6107844..7653a78）。
- `pwa/scripts/deploy.sh` → Cloudflare Pages `supersu-pwa`，生产分支 main，部署 ID `00cadd0d`。
- ⚠️ **Windows 坑**：本机默认 `bash` 是 `C:\Windows\system32\bash.exe`（WSL），跑 deploy.sh 会误报「找不到凭证文件 /e/test/opendoor/.env」。必须显式用 Git Bash：
  `& "C:\Program Files\Git\bin\bash.exe" pwa/scripts/deploy.sh`
- 线上核验（真实 HTTP）：`https://supersu.ccwu.cc/` 200、`<title>` = 「SuperSu 公众号编辑器 — 排版 + 封面」、含 `brand-mark` / `brand-tail`；`/brand/logo-64.png` 200（4457B）；`/icons/icon-192.png` 200（24877B）；manifest `name` = 「SuperSu 公众号编辑器」（short_name 仍 SuperSu，3 个图标）；**`/sw.js` 的 BUILD_ID `3676585593e9f892` 与本地 dist 完全一致** → 线上就是本次构建产物。

### 回滚点
- 新增文件删除 / 改回即可；图标与徽标复原为朱砂「版」方章。
- 线上回滚：Cloudflare Pages 控制台把生产版本切回上一个部署，或 `git revert 7653a78` 后重新 deploy。

---

## 任务 10：PWA 小红书封面（S4，2026-10-19）

### 任务边界
| 项 | 内容 |
|----|------|
| 触发 | 用户拍板「S4：PWA 小红书封面」，并选定：2 套归藏 + 10 套模板 / Wikimedia 免 key 搜图 / 内嵌 Noto 子集 |
| 范围 | PWA 封面页、封面模板与字体资产、纯前端搜图、离屏截图、SW/构建清单、有头测试 |
| 完成判据 | 12 风格可出真实 PNG；3 尺寸正确；上传/搜图底图可用；断网仍可生成；0 控制台报错；构建断言通过 |
| 不在范围 | BLCaptain 9 风格（需 Node/Playwright）；Pexels 搜图（需 key 且浏览器 CORS 不稳）；推送探测；离线 zip；真机验收 |

### 实现要点
- **渲染**：`modern-screenshot`（MIT，28KB）在离屏 iframe 内把 `#xhs-cover` 渲成 PNG；字体/底图全部内联，不依赖后端。
- **风格**：归藏 `editorial` / `swiss`（3 尺寸 1080×1440 / 1080×1080 / 2100×900）+ `public/cover-templates` 10 套（3:4）。
- **模板清洗（构建时）**：去掉 Google Fonts 外链、WCAG 强制白字段、示例文案（kicker/h-sub/署名/日期）与本地 `images/` 路径；Swiss 四套的硬编码 lead 改为 `{{LEAD}}`。
- **字体**：`scripts/build_cover_fonts.py` 下载 Noto Serif/Sans SC，按 GB2312 一级 + ASCII + 常用标点子集化，4 字重共 2.39MB；`cover-fonts.css` 只在封面页按需加载，不参与首屏预缓存。
- **底图**：纯色 / 上传（data URL）/ Wikimedia Commons 搜图（中英场景词映射、结果过滤+排序、24h 元数据缓存、图片转 data URL、失败明确提示）。
- **自适应**：按封面高度循环缩小标题字号（不依赖 fitty），长标题多行不出框。
- **离线**：封面模块、10 套模板、截图库进入 SW 预缓存；断网后仍可生成（字体在首次使用后缓存，缺失时回退系统字体）。

### 改动文件
新增：`pwa/src/cover/{index,catalog,templates,render,search}.js`、`pwa/src/cover/cover.css`、`scripts/build_cover_fonts.py`、`scripts/pwa_cover_test.py`、`public/vendor/modern-screenshot.js`、`pwa/public/fonts/cover/*`（4 woff2 + 2 OFL）、`pwa/public/fonts/cover-fonts.css`
修改：`pwa/index.html`、`pwa/scripts/build.mjs`、`pwa/public/sw.js`、`pwa/version.json`、`pwa/scripts/changelog_milestones.json`、`requirements.txt`、`THIRD_PARTY_NOTICES.md`、`AGENTS.md`、`HANDOVER.md`、`README.md`、`files/TODO.md`、`docs/pwa-consistency-and-speed-plan.md`、`.workbuddy/memory/MEMORY.md`

### 验证（真实执行）
- `scripts/pwa_cover_test.py` → **16/16**：入口切换、12 风格、模板尺寸禁用、归藏 3 尺寸、模板 1 张、上传底图、Wikimedia 搜图、下载链接、窄屏、**断网生成**、0 JS 报错。
- `pwa/scripts/smoke.py` → **24/24**（排版主链路无回归）。
- `tests/test_e2e.py` → **65/65**。
- `node pwa/scripts/build.mjs` → 断言通过（10 套模板、无 Google Fonts、字体齐全、主题 164 套一致）。
- 有头截图：`output/pwa-cover-test.png`、`output/pwa-cover-test-mobile.png`（每次跑测重写）。

### 回滚点
- 代码：`git revert <本次提交>`；删除 `pwa/src/cover/`、`public/vendor/modern-screenshot.js`、`pwa/public/fonts/cover/`、`scripts/build_cover_fonts.py`、`scripts/pwa_cover_test.py` 即可完全移除封面能力。
- 构建：`build.mjs` 的封面块可直接删除；`version.json` / milestones 回退到 1.3.0。
- 线上：Cloudflare Pages 控制台切回上一个部署。

### 影响 / 风险
- dist 增加约 2.4MB（字体）+ 0.6MB（缩略图）+ 0.5MB（模板/截图库）；封面字体按需加载，不影响排版首屏。
- Wikimedia 以纪实照片为主、中文检索弱（靠场景词映射）；国内网络可能不可达，UI 已明确提示改用上传/纯色。
- 模板 10 套为 AGPL-3.0 上游资产，本项目整体 AGPL-3.0 且已在 `THIRD_PARTY_NOTICES.md` 声明；若要闭源分发需重新评估。

---

## 任务 11：TXT 格式兼容扩展（方案 B）+ 抽屉缩略图修复（2026-10-19）

### 任务边界
| 项 | 内容 |
|----|------|
| 触发 | 用户提供自拟的《TXT 自动排版全格式测试文档》，要求「测试模板要用测试文件 + 搜罗更多格式、兼容更多格式」；随后授权「按你的推荐执行」 |
| 范围 | `core/preprocessor.py` 确定性识别扩展；测试夹具入库；审计脚本断言扩充；`pwa/src/style.css` 一处回归修复 |
| 完成判据 | 夹具 16 类格式可识别、原文不丢；全量回归绿；164 套渲染审计 164/164 |
| 不在范围 | Setext 标题、文本清理（pangu/全角）、公式渲染、TSV/CSV、高亮、脚注渲染（理由见 `docs/txt-format-support.md` §5） |

### 改动文件
| 文件 | 改动 |
|------|------|
| `core/preprocessor.py` | 新增：`_SECTION_MARK_RE` / `_TASK_RE` / `_ADMONITION_ALIAS_RE`+映射 / `_ALERT_RE`+标签 / `_NOTICE_BRACKET_RE` / `_TABLE_SEP_RE` / `_SPACE_SPLIT_RE` + `_pipe_table_rows()` / `_space_table_rows()`；循环内新增 6 处规则；`（1）（2）` 去掉四级标题提升 |
| `tests/fixtures/txt-format-lab.txt` | **新增**：用户起草的 16 节全格式夹具（15.8KB） |
| `scripts/theme_stress_audit.py` | 夹具路径改为仓库相对路径（原写死 `E:/personal/Downloads/…`）；断言 34→40（新增 S29–S34）；H01 兼容任务清单改写；S23 认 ☐/☑ |
| `tests/test_e2e.py` | +10 项格式兼容测试（任务清单 / Alerts / admonition / `~~~` / 竖线表 / 空格表 / 括号编号 / 章节标记 / 方括号提示） |
| `pwa/src/style.css` | `.d-card` min-height 118 → 140（修缩略图被 flex 压回 82px 的回归） |
| `AGENTS.md` / `HANDOVER.md` / `docs/testing.md` / `docs/pwa-build-plan.md` / `docs/plan-oss-reference.md` / `docs/test-plan-2026-10-18-abc.md` | 测试计数 65→74、181→190 同步 |
| `docs/txt-format-support.md` | **新增**：调研清单 + 决策结论 + 实施结果 |
| `files/TODO.md` / `CLOSURE.md` | 本任务记录 |

### 关键实现坑
- **表格必须自成一块**：生成表格前要补空行，否则紧贴上一行文字会被 Markdown 并入同一段落 → 表格不成立（实测 `简单的竖线分隔表格（非标准 Markdown）：` 紧跟表格时未渲染）。
- **竖线表要整表规整**：python-markdown 的 `tables` 扩展要求行首 `|`，只补分隔行不够，必须给表头与**所有数据行**补首尾竖线。
- **全角竖线 `｜`** 才判章节标记：半角 `|` 会撞 Markdown 表格的数字首列行。

### 验证（真实执行）
- `tests/test_e2e.py` **74/74**（+10 项）
- `tests/test_integration.py` 35/35 · `test_api_e2e.py` 29/29 · `test_headed_full_e2e.py` 33/33（0 控制台报错）· `test_headed_userflow.py` 7/7 · `test_headed_wechat_copy.py` 12/12
- `scripts/theme_stress_audit.py`：结构 **38/40**（2 项为改动前既有失败：§13 箭头行互斥、诗词层级）；渲染 **164/164**
- `pwa/scripts/smoke.py` 24/24 · `scripts/pwa_cover_test.py` 16/16（含断网生成）
- 夹具实测：16 节标题全部 `##`；3 张非标表全部渲染成 `<table>`（`<table>`×3 / `<tr>`×14）；复选框 6 项转 `☐`；原文保真仅余 1 行（§13 箭头行既有互斥）
- 抽屉缩略图：本地 dist 实测 `.d-prev` = **104px**（修复前线上为 82px）

### 回滚点
- `git revert <本次提交>`（引擎规则、夹具、断言、CSS 一起回滚）；E2E 恢复 65/65。
- 单点回滚：`tests/fixtures/` 删除、`scripts/theme_stress_audit.py` 的 FIXTURE 路径改回外部绝对路径。

### 追加（同日）：线上 E2E 固定等待类假失败修复
- **现象**：部署后跑 `scripts/pwa_online_e2e.py` 反复出现「每跑一次偶发一项」——先「风格条右滚/左滚」互为镜像，后「空态复制按钮为灰色禁用态」读到朱砂色；**复跑又全过**。
- **根因**：两处都用**固定等待**（`sleep 900ms` / `500ms`）后读值——平滑滚动在无头浏览器下会被 rAF 节流、清空后的按钮转灰依赖异步 `doRender`，固定等待是碰运气。属测试自身健壮性问题，**非线上功能缺陷**。
- **修法**：抽 `wait_until(pred)` —— **轮询到断言条件成立**再取最终值（6s 兜底）；与 AGENTS 里「不用固定 sleep 判优雅降级」同一条教训。
- **验证**：线上 E2E **连跑两次均 88/88 通过（2 项 SKIP）**。

### 影响 / 风险
- 改 `core/preprocessor.py` → **全部 164 套主题输出会变**（新识别生效处），已跑 164 套渲染审计确认达标。
- PWA 引擎随构建进 `dist/py/`，且 `py/preprocessor.py` 在 SW 增量清单里（`?h=<sha256>`）→ 用户端可通过 SW 更新拿到新引擎，**BUILD_ID 不变不影响**。
- 风险：低。规则均要求「连续 ≥2 行、列数一致」等硬条件，误判面窄。

---

## 任务 12：功能扩展方案 B1 · 出口三件套（2026-10-19）

### 任务边界
| 项 | 内容 |
|----|------|
| 触发 | 用户「执行上面的那个方案」＝ 按 `docs/feature-expansion-plan.html` 的批次推进 |
| 范围 | B1 三项：#1 长图导出 · #2 导出 HTML 文件 · #5 导出 Markdown（落 PWA） |
| 完成判据 | 三种导出都拿到真实文件（真下载、内容正确、长图是真 PNG）；移动端不溢出；回归不坏 |
| 不在范围 | PDF / Word / 九宫格切图 / 图片本地化（后续批次）；本地 Flask 版（AGENTS 2026-10-18 已标记弃用，新功能只落 PWA） |

### 改动文件
| 文件 | 改动 |
|------|------|
| `pwa/src/export.js` | **新增**：`buildStandaloneHtml` / `exportHtml` / `exportMarkdown` / `exportLongImage`（离屏 iframe 定宽 1080 → modern-screenshot 出图；>20000px 抛可操作错误，不静默出白图） |
| `pwa/index.html` | 顶栏新增「导出 ▾」按钮 + `#menu-export`（3 项，带用途小字） |
| `pwa/src/style.css` | `.menu-btn` + `#menu-export` 条目样式 |
| `pwa/src/app.js` | 绑定导出菜单；`import('./export.js')` 首次点击才动态加载；导出成功/失败均 toast，外链图数量提前告知 |
| `pwa/public/sw.js` | `SHELL_OPTIONAL` += `./src/export.js`（离线可用） |
| `pwa/scripts/build.mjs` | `SHELL_FILES` += `src/export.js`；关键文件存在性断言 += `src/export.js` |
| `scripts/pwa_export_test.py` | **新增**：导出专项有头测试（真实下载 + 校验内容与尺寸 + 移动端不溢出） |

### 验证（真实执行）
- `scripts/pwa_export_test.py` **8/8**：`out.md` 849 B（含首行）· `out.html` 4134 B（自包含、含正文）· `out.png` 真 PNG **1080×708** / 84 KB · 移动端 390px `scrollWidth=innerWidth` 无横向溢出 · 0 控制台报错
- 长图目视（`output/export-check/out.png`）：标题 / 正文 / 小节色块 / 列表 / 引用齐全，无截断、无空白
- 回归：`pwa/scripts/smoke.py` **24/24** · `tests/test_e2e.py` **74/74**

### 回滚点
- `git revert <本次提交>`；或删 `pwa/src/export.js` + 还原 `pwa/index.html` / `app.js` / `sw.js` / `build.mjs` 的四处清单。

### 影响 / 风险
- 顶栏多一个按钮（移动端已验证无横向溢出）。
- 长图上限 20000px：超长文明确报错并建议改用「导出 HTML」，不静默。
- 外链图只提示数量、不做本地化（那是 B2 #6）；导出 HTML 里的外链图对方网络可能看不到，已在 toast 里说明。

---

## 任务 13：功能扩展方案 B2 · #6 外链图本地化（务实最小版，2026-10-24）

### 任务边界
| 项 | 内容 |
|----|------|
| 触发 | 用户「按交接文档的 B2 批次开始，先做外链图本地化」 |
| 关键事实 | 查证确认：公众号编辑器粘贴富文本**只认公众号图床 URL，拒绝 `data:` URI**（腾讯云实践记录 + 微信开放社区）。纯前端无后端，无法替用户上传到公众号图床 |
| 拍板 | 用户选「务实最小版」：导出链路真内嵌；复制链路如实提示需手动上传，不做假承诺 |
| 完成判据 | 导出 HTML 里的外链图变成 data URI；抓不到必须给原因并保留原 URL；提示条存在且不误导；回归不坏 |
| 不在范围 | 微信素材上传 / 图床 / 后端中转；#7 九宫格、#20 批量导出图片；本地 Flask 版 |

### 改动文件
| 文件 | 改动 |
|------|------|
| `pwa/src/images.js` | **新增**：`scanExternalImages`（按出现次数统计外链图）/ `localizeImages`（DOMParser 替换 src、去 srcset、并发 3、单图 8MB、单次 40 张、超时 12s）/ 失败原因分类 / 会话内成功缓存 |
| `pwa/src/app.js` | 渲染后扫描并显示 `#img-tip`；点击才联网抓图；导出 HTML/长图前自动内嵌；复制后用 `toastAfterCopy` 如实提示（外链 / 内嵌图公众号都不认） |
| `pwa/index.html` | 预览区新增 `#img-tip` 提示条 + `#btn-localize` |
| `pwa/src/style.css` | `.img-tip` 样式（不挤占预览高度、移动端不溢出） |
| `pwa/public/sw.js` | `SHELL_OPTIONAL` += `./src/images.js` |
| `pwa/scripts/build.mjs` | `SHELL_FILES` += `src/images.js`；关键文件存在性断言 += `src/images.js` |
| `scripts/pwa_image_localize_test.py` | **新增**：外链图专项有头测试（同源真图 + 同源 404，确定性、不依赖外网） |

### 验证（真实执行）
- `scripts/pwa_image_localize_test.py` **11/11**：提示条出现并如实说明 · HTML 导出自动内嵌 `data:image/png;base64` · 失败图保留原 URL · 提示条写明 `HTTP 404` · 重试仍给原因 · 清空/无图时提示条隐藏 · 移动端无横向溢出 · 0 未捕获异常
- 回归：`scripts/pwa_export_test.py` **8/8** · `pwa/scripts/smoke.py` **24/24**
- 构建：`node pwa/scripts/build.mjs` 通过（BUILD_ID `9d9ba88e8cfb74dc`，19.35MB，断言全过）

### 回滚点
- 删 `pwa/src/images.js` + 还原 `pwa/src/app.js` / `index.html` / `style.css` / `sw.js` / `build.mjs`；或 `git revert <本次提交>` 后重跑 `build.mjs`。

### 影响 / 风险
- 只在用户点击「本地化图片」或执行 HTML/长图导出时联网，不在每次渲染时抓图（隐私与性能）。
- 单图 8MB / 单次 40 张 / 超时 12s：超限明确写原因，不静默。
- 公众号直贴仍不会显示内嵌图——这是平台限制，已写进 UI 与交接文档，避免后续误改文案。

---

## 任务 14：功能扩展方案 B2 · #7 九宫格切图（2026-10-24）

### 任务边界
| 项 | 内容 |
|----|------|
| 触发 | 用户「继续开 B2 #7 九宫格切图」 |
| 拍板（用户选择） | 入口＝封面结果卡 + 上传入口；交付＝ZIP 一次下载；非正方形＝方形居中裁剪；间距 0–20px；顺序＝逐行（默认）+ 蛇形 |
| 完成判据 | 真出 9 张真 PNG、裁剪不变形、顺序可切换、ZIP 可下载且内容正确；移动端不溢出；离线可用；回归不坏 |
| 不在范围 | 批量导出图片（#20）、PDF/Word/二维码（B3）、后端参与 |

### 改动文件
| 文件 | 改动 |
|------|------|
| `pwa/src/nine.js` | **新增**：`splitGrid`（方形居中裁剪 + 3×3 + 间距/顺序）/ `releaseTiles` / `zipTiles`（fflate store 级 ZIP，文件名 `nine-01..09.png`）；失败一律抛可读原因 |
| `pwa/src/cover/index.js` | 结果卡新增「九宫格」按钮；页头新增「九宫格切图」上传入口（`#cv-nine-pick` / `#cv-nine-file`）；切图弹窗（3×3 预览、间距滑杆、顺序下拉、ZIP 下载、状态条、Esc/背景关闭） |
| `pwa/src/cover/cover.css` | `.cv-nine*` 弹窗样式（`min(460px, 94vw)`，移动端不溢出） |
| `public/vendor/fflate.min.js` | **新增**：fflate 0.8.2 UMD（MIT，32.6KB，本地 vendor，离线可用） |
| `pwa/public/sw.js` | `SHELL_OPTIONAL` += `./src/nine.js`、`./vendor/fflate.min.js` |
| `pwa/scripts/build.mjs` | `SHELL_FILES` 与关键文件断言 += 两个新文件 |
| `THIRD_PARTY_NOTICES.md` | 登记 fflate（MIT） |
| `scripts/pwa_nine_test.py` | **新增**：专项有头测试（真下载 ZIP、解包读像素验证顺序与裁剪） |
| `scripts/pwa_cover_test.py` | 修失效夹具 `logo.png` → `logo-source.png`（「上传底图」不再 SKIP） |
| `scripts/pwa_online_e2e.py` | 线上 E2E 增加九宫格 3 项（切图 / ZIP / 关闭） |

### 验证（真实执行）
- `scripts/pwa_nine_test.py` **15/15**：入口可见 · 9 张预览 · 状态条尺寸 · ZIP 含 nine-01..09 · 间距 6 → 296×296 · 逐行 nine-04 = 第二行第 1 格 · 蛇形 nine-04 = 第二行第 3 格 / nine-06 = 第二行第 1 格 · 间距 0 → 300×300 · 1200×800 → 266×266 且左右品红边被裁掉 · 关闭收起并清空 · 移动端 390px 不溢出（panel 20–370）· 0 控制台报错
- 回归：`scripts/pwa_cover_test.py` **15/15（1 SKIP：Wikimedia 网络）** · `scripts/pwa_export_test.py` **8/8** · `pwa/scripts/smoke.py` **24/24**
- 线上：部署后 `scripts/pwa_online_e2e.py` **90/90（3 SKIP）**，`version.json` build **134**
- 构建：`node pwa/scripts/build.mjs` 通过（19.39MB，断言全过）

### 回滚点
- 删 `pwa/src/nine.js` + 还原 `cover/index.js` / `cover.css` / `sw.js` / `build.mjs`；或 `git revert <本次提交>` 后重跑 `build.mjs`。

### 影响 / 风险
- ZIP 库按需注入（首次点「下载 9 张」才加载 `vendor/fflate.min.js`），不占首屏；已进 SW 预缓存，离线可用。
- `fflate` 用 `store`（level 0）：PNG 已压缩，再 deflate 只增耗时。
- 切图为纯 Canvas 本地处理，图片不出浏览器；ZIP 命名固定 `nine-01..09.png`，方便按序上传。


