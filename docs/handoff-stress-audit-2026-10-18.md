# SuperSu 交接文档 —— 压力测试 × 模板治理 × 双版本治理（2026-10-18）

> 🛑 **2026-10-24 审计声明**：本文为**历史快照/方案稿**，其中的版本号、构建号、「未提交/未部署」等状态**均已过期**。现行状态唯一真源：`HANDOFF.md` §0 + `AGENTS.md` + `CLOSURE.md`。

> 给接手同事的速通说明。本文覆盖 **2026-10-18 一整轮工作的全部内容**：已完成什么、还有什么没做、从哪接。所有结论都可跑命令复现。

---

## 0. 三分钟看懂

**SuperSu** = 纯文本进 → 公众号排版出 + 小红书封面生成（核心理念：*不用 AI 就不开 AI*）。

**⚠️ 方向调整（2026-10-18，苏哥拍板）**
- **以后主打 PWA 版**：`pwa/` → https://supersu.ccwu.cc
- **本地 Flask 版标记弃用但保留代码**：`app.py` + `templates/index.html`（不删，作参考 / 回退）

| 形态 | 入口 | 引擎 | 状态 |
|---|---|---|---|
| **PWA（主）** | `pwa/` → supersu.ccwu.cc | 浏览器内 Pyodide 跑同一套 Python | 主打 |
| 本地 Flask（弃用） | `python app.py` → 127.0.0.1:5000 | 服务端 Python | 弃用保留 |

**引擎真源仍是两版共用**：`core/preprocessor.py` + `core/format_engine.py` + `public/themes/`。
PWA 在 `node pwa/scripts/build.mjs` **构建时**把它们拷进 `pwa/dist/py/`、`pwa/dist/themes/`（`dist` 已 gitignore）。
👉 **改完引擎必须重跑 PWA 构建**，否则就是「本地改了线上没变」。

**git 结构**

| 分支 | 位置 | 说明 |
|---|---|---|
| `main` | 最新，**已推 `origin/main`** | **主打线**（PWA + 本地版弃用入口） |
| `pwa` | 与 main 同点（仅本地） | 工作分支，已冗余，可退 |
| `local-legacy` | `c527004`（旧本地版基线） | 回退点 |

---

## 1. 已完成（全部有实测证据）

| # | 项 | 结果 | 实测 |
|---|---|---|---|
| 1 | **解析硬伤修复（决策 1B）** | `core/preprocessor.py` 8 处 | 结构审计 25/34 → **32/34**（原文保真 3/6 → 5/6） |
| 2 | **主题对比度（1B）** | 2 套真修 + 审计指标纠错 | 渲染审计 156/164 → **164/164** |
| 3 | **字号定稿（业界调研）** | `SCALE` = h1 22 / h2 18 / h3 16 / h4 15 / h5 14 / h6 13 / p 15；119 套 su-* 重生成 | 渲染审计仍 164/164 |
| 4 | **45 套早期主题字号对齐（决策 B）** | 只改字号，定制样式全保留 | 44 文件 / 259 行；**164 套正文统一 15px** |
| 5 | **渲染层安全清洗（决策 4A）** | `md_to_html` 出口加 `sanitize_raw_html` | 脚本 / 事件属性 / 危险 URL 全清除，正常内容与 style 保留 |
| 6 | **模板库族折叠（决策 2A）** | 本地 `templates/index.html` + **PWA `pwa/src/app.js` + `style.css`** | PWA 有头冒烟 **24/24** |
| 7 | **许可证口径（决策 5A）** | 核实**本已是 AGPL-3.0**，无需改动 | `LICENSE` 全文 + README + `THIRD_PARTY_NOTICES.md` |
| 8 | **PWA 重构建 + 两版引擎一致** | `build.mjs` 断言通过 | `core/*.py` 与 `pwa/dist/py/*` **字节一致** |
| 9 | **部署铁律（部署一律同步 git）** | `AGENTS.md §11` + `pwa/scripts/deploy.sh` 硬预检 | 工作区脏 / HEAD 未推送 → 部署直接中止 |
| 10 | **git 分支治理** | main = 主打线；local-legacy 回退点 | 已推 `origin/main`（**快进，无 force**） |

**已跑过的门禁**（命令见 §6）
- `tests/test_e2e.py` → **65/65 ✅**
- `pwa/scripts/smoke.py` → **24/24 ✅**（真实 Chrome，起服务跑 `pwa/dist`）
- `scripts/theme_stress_audit.py` → 渲染 **164/164**、结构 **32/34**
- `tests/test_api_e2e.py` → **29/29 ✅**（本地版，弃用但仍过）

---

## 2. 未完成 / 待接手

| # | 事项 | 现状 | 下一步 |
|---|---|---|---|
| U1 | **H01 原文保真仍差 1 行** | 夹具 §13 箭头行「导入 TXT → … → 复制到公众号」同时被 H01（保留箭头）与 S25（拆成 6 个列表项）要求，**物理互斥**；现保留 S25 | 需夹具作者定夺：改夹具 or 接受 |
| U2 | **S22 诗词分层** | 属 P2-3，本轮（P0+P1）未做 | 要做需在 `preprocessor` 加诗词识别（标题 / 作者分层） |
| U3 | **`pwa/public/changelog.json` 可能被构建重写** | `build.mjs` 会按 git 历史自动重生成「更新记录」，与仓库状态可能漂移 | 接手前先 `git diff pwa/public/changelog.json` 核对 |
| U4 | **线上 PWA 专项测试未跑** | `scripts/pwa_*.py`（离线 / 增量 / 首屏 / 模板 UX / 发布小票）针对**线上站** | 部署后逐个跑 |
| U5 | **`pwa` 分支可退** | 与 `main` 同点，冗余 | 确认后 `git branch -d pwa`（`local-legacy` 保留） |
| U6 | **45 套主题的后续维护口径** | 选了 B（只对齐字号），**未纳入 `build_themes.py`** | 以后再调字号需直接改 JSON 或另写脚本 |
| U7 | **`templates/index.html` 的 2A 折叠仅作参考** | UI 真源已转 `pwa/src/app.js` | 后续 UI 改动只改 PWA 侧 |

---

## 3. 原诊断清单的现状

> 以下来自外部审计报告与压力测试夹具；「现状」列是本轮处理结果。

| 编号 | 问题 | 现状 |
|---|---|---|
| P0-2 | 分隔线 `====` 被判成标题，全文 32 个 `## =` 假标题 | ✅ **已修**（纯分隔线 → `<hr>`） |
| P0-1 | 原文保真：标签行冒号被吞、有序列表序号被改写 | ✅ **已修 8 处**（只剩 U1 那 1 行物理互斥） |
| P1-1 | 标准有序列表被转成标题（教程步骤崩溃） | ✅ 已修（连续有序列表保原序号） |
| P1-2 | 嵌套列表层级丢失 | ✅ 已修（保留行首缩进，S12 0/6 → 6/6） |
| P1-3 | 竖线表格误判为标题 | ✅ 已修（含 `|` 的行不判标题） |
| P1-4 | 数学公式块 `$$` 被标题化 | ✅ 已修 |
| P1-5 | 加粗 `**…**` 被项目符号规则破坏 | ✅ 已修（`_BULLET_RE` 要求符号后跟空白） |
| P1-6 | 原始 HTML 片段被标题化 | ✅ 已修（`<` 开头的行不判标题） |
| P1-7 | 8 套主题对比度不达标 | ✅ **164/164**。⚠️ 其中 **6 套是审计指标取错色**（把品牌色 `colors.primary` 当正文色，真实正文对比度其实 8~12）→ 已改取 `styles.p.color`；**真正有问题的只有 2 套**（`sunset-amber` / `wechat-native` 代码块前景太亮，已加深） |
| P2-1 | 模板「重复感」 | 📊 量化：164 套 → **61 个不同骨架**，最大同构组 **26 套**，近重复对 **4**；治理选 **2A 界面折叠**（已做，不删资产） |
| P2-2 | 字号过大观感 | ✅ 已定稿（见 §4） |
| P2-3 | 诗词未分层 | ❌ 未做（= U2） |
| P2-4 | HTML 安全加固 | ✅ 已做（决策 4A） |

---

## 4. 字号定稿（按业界调研）

**四个来源一致口径**：135编辑器 / 有一云 / 话媒盒子 / 吉加设计 —— 正文 15–16px（15 最推荐）、h1 18–22、h2 16–18；**13px 属「注释 / 引用」层级**，不做正文。

**定稿标尺**（`scripts/build_themes.py` 的 `SCALE`）：
> **h1 22 / h2 18 / h3 16 / h4 15 / h5 14 / h6 13 / p 15**

- **119 套 su-***：由 `SCALE` 驱动（改一处、重跑 `build_themes.py` 即全量生效，可逆）
- **45 套早期原创**：已**一次性对齐到同标尺**（决策 B），但**未纳入 `build_themes.py`**，以后再调需直接改 JSON
- 结果：**164 套正文统一 15px**

---

## 5. 红线（不能做）

1. **不抄任何开源主题 / 代码**（xiaohu-wechat-format 已否决；gzh-design-skill 是 AGPL，一个字节都不能进代码树）
2. **不重写架构**（审计结论：先修解析与编排，不重写、不换模型）
3. **AGPL 来源资产不进公开 PWA 构建产物**
4. **不手删 `public/themes/*.json` 里的 `su-*` 生成物**（它们是 `build_themes.py` 的产物，要减就改 spec 重跑）
5. **⛔ 部署铁律（2026-10-18 新增）**：**部署到服务器的一律先同步 git** —— 部署内容的源码必须先 `commit` 并 `push`（`HEAD` 须已含在 `origin/main`、工作区无未提交改动）。落地点：`pwa/scripts/deploy.sh` 部署前有硬预检。

---

## 6. 上手与复现

```bash
# 环境
.venv/Scripts/python.exe -m pip install -r requirements.txt        # 本地版/工具链
npm i                                                              # PWA 构建需要 node

# 复现本轮实测（无需起服务）
.venv/Scripts/python.exe scripts/theme_stress_audit.py
#   产物：output/stress_audit/{report.json, report.md, preprocessed.md}

# 引擎门禁（两版共用）
.venv/Scripts/python.exe tests/test_e2e.py                        # 65/65

# PWA（主）：构建 → 有头冒烟
node pwa/scripts/build.mjs                                        # 出 pwa/dist（含断言）
.venv/Scripts/python.exe pwa/scripts/smoke.py                     # 24/24（起 127.0.0.1:8088）

# 部署（铁律预检会拦住脏工作区 / 未推送）
bash pwa/scripts/deploy.sh

# 本地版（弃用）遗留门禁
.venv/Scripts/python.exe tests/test_api_e2e.py                    # 自起服务，29/29
```

**审计脚本参数**：`--only struct`（结构断言）| `--only dup`（主题去重）| `--only render`（164 套渲染）。
断言分两类：`fidelity` = 原文保真（硬门禁，丢字 / 改字即 FAIL）、`structure` = 结构识别。

---

## 7. 决策记录

| 决策 | 内容 | 结果 |
|---|---|---|
| 1 | 先修哪些排版硬伤 | 选 **B：全修 P0+P1** → 已修 8 处 |
| 2 | 模板重复治理 | 选 **A：界面折叠**（不删资产）→ 本地 + PWA 双侧已实现 |
| 3 | 字号 | 先选「正文降到 13」→ **苏哥纠正为「按业界调研」** → 定稿为 §4 的整套标尺 |
| 4 | HTML 安全加固 | 选 **A：现在做** → `sanitize_raw_html` 已上线 |
| 5 | 许可证口径 | 选 **A：AGPL** → 核实**本已是** AGPL-3.0 |
| 6 | 45 套主题统一管理 | 选 **B：只对齐字号**（保留定制，不做 spec 重写） |
| 7 | git 结构 | `main` = 主打线（已推）；`local-legacy` = 旧本地版快照 |

---

## 8. 本轮交付物

| 文件 | 作用 |
|---|---|
| `scripts/theme_stress_audit.py` | 应力审计脚本（结构 / 去重 / 渲染） |
| `core/preprocessor.py` | 解析 8 处修复 |
| `core/format_engine.py` | `sanitize_raw_html`（4A） |
| `scripts/build_themes.py` | 字号标尺（§4）→ 119 套 su-* |
| `pwa/src/app.js` + `pwa/src/style.css` | 模板库族折叠（2A，UI 真源） |
| `pwa/scripts/deploy.sh` | 部署铁律硬预检 |
| `docs/handoff-stress-audit-2026-10-18.md` | 本文 |

---

### 附：三份原始资料索引

- 测试夹具：`E:/personal/Downloads/SuperSu_AI排版压力测试文档.txt`（16 章，每章写明「期望」）
- 审计报告：`E:/personal/Downloads/SuperSu_深度审计报告_2026-10-18.md`（P0/P1/P2 + 三阶段执行顺序）
- 开源方案：`docs/plan-oss-reference.md`（借鉴方法论、许可证判定矩阵、xiaohu 否决记录）
