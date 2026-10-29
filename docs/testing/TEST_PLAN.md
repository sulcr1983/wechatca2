# TEST_PLAN — 测试范围、策略、优先级与环境

> 本文件是「这一轮独立质量诊断」的测试方案。**不是**项目原有门禁的说明——
> 原有门禁怎么跑、三档判据、各套件挡什么，见 [`../testing.md`](../testing.md)。
> 两者关系：`testing.md` 管「日常回归怎么跑」，本目录管「用户视角的功能验证」。

- 被测版本：**v1.9.5 / build 303**（诊断期间上游从 v1.9.4 升到 v1.9.5，已在两个版本上复跑关键项，结论一致）
- 被测对象：线上 `https://supersu-pwa.pages.dev/`（= `https://supersu.ccwu.cc/`，同一站点）
  + 本地 `pwa/dist`（由 `node pwa/scripts/build.mjs` 构建）
- 诊断日期：2026-10-30

---

## 1. 产品形态（先明确「测什么」）

SuperSu 是**纯静态 PWA**，没有后端、没有账号、没有埋点：

| 层 | 技术 | 对测试的含义 |
|:--|:--|:--|
| 外壳 | `pwa/index.html` + `pwa/src/*.js`（原生 ES Module） | 无框架，DOM 由各模块自建 |
| 排版引擎 | Python（`core/format_engine.py`）跑在 Pyodide/WASM Worker 里 | 首访要下约 40MB 运行时，**必须等 `#engine-badge[data-state=ready]`** |
| 数据 | `localStorage`（草稿/主题/收藏/Key）+ Cache Storage（SW 预缓存） | 持久化与隐私风险都在这两层 |
| 部署 | Cloudflare Pages | 线上只做**无破坏性**验证 |

**关键测量约束**（都是踩过的坑，照做才测得出真结果）：
- 引擎**只在有内容时**才 ready——空编辑器永远停在 loading。等 ready 前必须先填内容。
- 线上渲染有约 1 秒滞后，**固定 sleep 会误判**，要等具体信号（元素出现/文本变化/按钮启用）。
- 复制功能必须**先授剪贴板权限**，否则一级路径必失败、测出的「成功」是兜底路径的假象。

## 2. 测试分层（本轮实际执行的）

| 层 | 手段 | 目的 | 状态 |
|:--|:--|:--|:--|
| L0 静态核查 | 读源码 + `doc_sync_check.py` | 文档与代码是否一致、功能是否真实存在 | ✅ 已执行 |
| L1 项目现有门禁 | `python scripts/run_gates.py`（本地层 14 套件） | 复用既有回归，确认基线是否健康 | ✅ 已执行 |
| L2 独立 E2E | `scripts/qa_independent_e2e.py` | 验证**最终产物**（剪贴板/下载文件/持久化） | ✅ 已执行（本地 + 线上） |
| L3 深挖复核 | `qa_deep_verify.py` / `qa_round2.py` / `qa_round3.py` / `qa_r7_recheck.py` | 把「疑似」与「我测错了」分开 | ✅ 已执行 |
| L4 新功能专项 | `qa_story_verify.py` | v1.9.5 新增「整套图文」「大字报底图」 | ✅ 已执行 |
| L5 人工探索 | 截图目视 + 图片内容判读 | 视觉/内容质量（自动化判不了） | ✅ 已执行 |

**没有引入任何新框架**：复用项目已有的 Python Playwright 1.64.1 + 系统 Chrome
（`core/browser_utils.launch_browser` 的回退链）+ 自起静态服务。
项目未安装 Playwright bundled Chromium（`chromium-1248` 目录不存在），刻意沿用系统 Chrome。

## 3. 风险优先级定义

| 级别 | 定义 | 判定口径 |
|:--|:--|:--|
| **P0** | 核心功能不可用、数据丢失、安全/隐私问题 | 用户的主要目的达不成，或本机敏感数据被错误保留/泄露 |
| **P1** | 主要流程走不通、重要功能出错 | 有明确错误结果，但有可绕过的替代路径 |
| **P2** | 部分功能异常、兼容性、体验明显下降 | 功能可用但结果不对/文案误导 |
| **P3** | 细节、轻微视觉、非关键优化 | 不影响完成任务 |

## 4. 重点测试维度与本轮覆盖情况

| 维度 | 覆盖 | 说明 |
|:--|:--|:--|
| 正常流程 | ✅ | 粘贴 → 排版 → 换主题 → 复制 → 导出全链路 |
| 异常流程 | ✅ 部分 | 空输入、超长、特殊字符已测；**AI 失败/网络中断的错误分支未全测** |
| 边界情况 | ✅ | 2.5 万字、HTML 注入字符、空稿 |
| 数据可靠性 | ✅ | 刷新保留、主题记忆、断网重开 |
| 功能联动 | ✅ 部分 | 主题×版式×段落样式矩阵（项目已有 100 例套件）；封面↔正文联动已测 |
| 浏览器兼容 | ⚠️ 部分 | 只测 Chromium 内核（系统 Chrome）。**Firefox/Safari 未测** |
| PWA 能力 | ✅ | SW 接管、断网可用、更新面板 |
| 安全与隐私 | ✅ | Key 存储与「清除本地数据」的实际效果 |
| AI 功能 | ⚠️ 部分 | 平台预设/降级链路已由项目套件覆盖；**真实 Key 调用未做**（避免消耗用户额度） |
| 推送微信 | ❌ 不适用 | 该功能已随 Flask 版封存，PWA 无此能力（README 已标注） |
| 内置教程 | ❌ 不适用 | 已封存移除 |

## 5. 明确不测（附原因）

| 项目 | 原因 |
|:--|:--|
| 本地 Flask 版（`app.py`/`templates/`） | 已于 2026-10-28 封存移出工作区，见 `ARCHIVE.md`。测它没有意义 |
| 微信草稿箱推送 | 同上，功能不存在于 PWA |
| 真实 AI 付费调用 | 会消耗用户 API 额度；项目已有 `pwa_real_ai_test.py` 在用户显式要求时跑 |
| Firefox / Safari | 环境只有 Chrome/Edge；且 `modern-screenshot` 等能力在 Safari 有已知差异，本轮无环境验证 |
| 线上破坏性操作 | 线上只做只读 + 本地态操作，不触碰服务器数据 |

## 6. 环境与命令

```bash
# 构建（改过 pwa/src / core / themes 必须重跑）
node pwa/scripts/build.mjs

# L1 项目现有门禁（本地层）
.venv/Scripts/python.exe scripts/run_gates.py

# L2 独立 E2E（本地 dist）
.venv/Scripts/python.exe scripts/qa_independent_e2e.py --port 8071

# L2 独立 E2E（线上）
.venv/Scripts/python.exe scripts/qa_independent_e2e.py --url https://supersu-pwa.pages.dev/ --slow 1.5

# L3 深挖 / 复核
.venv/Scripts/python.exe scripts/qa_deep_verify.py --port 8072
.venv/Scripts/python.exe scripts/qa_round2.py      --port 8073
.venv/Scripts/python.exe scripts/qa_round3.py      --port 8074
.venv/Scripts/python.exe scripts/qa_r7_recheck.py  --port 8075

# L4 新功能专项
.venv/Scripts/python.exe scripts/qa_story_verify.py --port 8077
```

端口约定：每个脚本默认端口不同（8071–8078），可并发跑，也可用 `--port` 改。
**端口被占会直接退出并提示换端口**（不静默复用别人的服务，避免测错对象）。

## 7. 证据保存位置

| 内容 | 路径 |
|:--|:--|
| 项目门禁日志 | `output/gate-run/run-<时间戳>.log` |
| 独立 E2E 报告 + 截图 | `output/qa-independent/report.json`、`NN-*.png`、`clipboard.html`、`dl-*` |
| 深挖明细 | `output/qa-deep/deep.json` |
| 第二轮 | `output/qa-round2/report.json`、`mobile-375.png` |
| 第三轮复核 | `output/qa-round3/verify.json` |
| 更新面板复核 | `output/qa-r7/r7.json`、`panel.png` |
| 新功能专项 | `output/qa-story/story.json`、`story-*.zip` |
| 项目现有套件产物 | `output/ai-format/`、`output/export-check/`、`output/e2e-online/` 等 |

## 8. 判据纪律（本轮自我约束）

1. **不用「按钮有反应」当通过**：必须验证产物（剪贴板内容、下载文件字节、PNG 像素）。
2. **不用「测试脚本绿了」当通过**：先确认测试自己没写错，再判产品对错。
3. **假失败必须撤销**：本轮有 3 条 FAIL 经复核确认是测试写错（长图高度阈值、移动端按钮可见性、更新面板读取位置），已从缺陷清单剔除并在报告里写明。
4. **无法验证就写 BLOCKED**，不写 PASS。
