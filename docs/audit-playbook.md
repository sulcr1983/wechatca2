# SuperSu 项目审计作业指导书 v1

> **文档性质**：可独立执行的审计 SOP。执行者拿到本文件 + 仓库访问权，**无需额外沟通**即可完成审计并产出报告。
> **适用对象**：项目接手人、外部审计员、AI 助手、发布前自查。
> **基线日期**：2026-10-18。所有"预期结果"均以此日实测为准。
> **上位规范**：`docs/project-conventions.md`（产出物与文档规范）。

---

## 0. 快速开始（执行者第一件事）

```
1. 确认你能访问仓库：cd <repo> && git status
2. 确认 Python 环境：.venv/Scripts/python.exe --version   （Windows）
3. 按 §3 的 A→G 顺序逐项执行（每项都有命令，复制粘贴即可）
4. 把结果填进 §5 的报告模板
5. 按 §7 上报 P0/P1 问题
```

**总时长**：单人 4 小时（含 5 套测试的等待时间）；双人并行 2 小时。
**产出**：一份审计报告 + 一份缺陷清单 + 证据目录（见 §5）。

---

## 1. 审计目标与范围

### 1.1 审计目标（三条，按重要性）

| # | 目标 | 判定成功的标志 |
|---|---|---|
| 1 | **确认项目可正常运行且功能无回归** | 6 套测试全部达到基线通过率（§3.B） |
| 2 | **确认代码/文档/产出物符合项目规范** | §3.C/D/E 全部 PASS |
| 3 | **确认对外发布（开源/部署）合规** | §3.F 全部 PASS |

### 1.2 范围内（必须审）

1. **后端引擎**：`core/`（format_engine / preprocessor / wechat_publisher / image_search / blcaptain_bridge / guizang_renderer）
2. **前端**：`templates/index.html`（单页 SPA，公众号页 + 小红书页）
3. **测试**：`tests/` 6 个套件
4. **文档**：根目录 5 个主文档 + `docs/`
5. **产物与目录**：`public/`、`output/`、`data/`、`test_output/`
6. **PWA（如已开工）**：`pwa/`
7. **合规**：第三方资产、字体、图片、许可证

### 1.3 范围外（明确不做，避免越界）

- ❌ 不修改任何业务代码（审计只读；修复由开发/AI 执行）
- ❌ 不评价产品设计好坏（视觉/交互满意度不在审计范围）
- ❌ 不测试外部平台（微信接口真实推送、小红书发布，需人工授权）
- ❌ 不做性能压测（只记录单次渲染耗时，见 §3.C6）

---

## 2. 审计对象与代码模块地图

| 模块 | 路径 | 职责 | 审计重点 |
|---|---|---|---|
| **排版引擎** | `core/format_engine.py`（约 2349 行） | Markdown + 主题 JSON → 微信内联 HTML | 主题加载、内联样式、AIGC 降级 |
| **预处理器** | `core/preprocessor.py`（约 514 行） | 纯文本 → Markdown（四模式 + 多风格规则） | 规则命中率、误判（§3.B7） |
| **Flask 主应用** | `app.py`（约 909 行） | 25 个路由、SSE、API | 路由完整性、错误处理 |
| **前端** | `templates/index.html`（约 2100 行） | 双页面 SPA、主题抽屉、解析条 | DOM 契约（§3.C5）、控制台报错 |
| **微信发布** | `core/wechat_publisher.py` | 素材上传 + 草稿推送 | 密钥不落库（§3.F4） |
| **封面引擎** | `core/guizang_renderer.py` + `core/blcaptain_bridge.py` | Playwright / Node 双引擎出图 | 浏览器可用性、三引擎出图 |
| **主题库** | `public/themes/*.json`（164 套） | 主题 CSS 定义 | 结构完整性（§3.C4） |
| **缩略图** | `public/theme-thumbs/*.jpg`（164 张） | 模板库真实缩略图 | 与主题一一对应 |
| **测试套件** | `tests/*.py` | 6 套（E2E / 集成 / API / 三套有头） | 通过率（§3.B） |
| **PWA（可选）** | `pwa/` | 纯静态浏览器版 | 白名单构建、离线（§3.G） |

**依赖**：`requirements.txt`（Flask / markdown / Playwright / Pillow / requests）。Playwright 是**必需依赖**（封面引擎），版本需 ≥1.61。

---

## 3. 审计项与检查清单（核心）

> **执行规则**：按 A→G 顺序执行；每项记录 **PASS / FAIL / SKIP（附原因）**；FAIL 时按"不通过处置"操作并登记到缺陷清单。

### A. 环境与启动（5 项，约 15 分钟）

| 编号 | 检查内容 | 执行命令 | 判定标准（PASS） | 预期结果 | 不通过处置 |
|---|---|---|---|---|---|
| **A1** | Python 与依赖可导入 | `.venv/Scripts/python.exe -c "import flask, markdown, PIL, requests, playwright; print('ok')"` | 输出 `ok`，无 ImportError | `ok` | P0：缺依赖，跑 `pip install -r requirements.txt` |
| **A2** | Playwright 版本合规 | `.venv/Scripts/python.exe -c "import playwright; print(playwright.__version__ if hasattr(playwright,'__version__') else 'n/a')"` + `pip show playwright \| findstr Version` | 版本 ≥ **1.61** | `Version: 1.6x` | P1：低于 1.61 会导致封面引擎启动失败 |
| **A3** | 服务可启动 | 终端 A：`python app.py`；另开终端 B：`curl --noproxy '*' -s -o /dev/null -w "%{http_code}" http://127.0.0.1:5000/api/themes` | 8 秒内返回 **200** | `200` | P0：启动失败，看 A4/A5 与启动日志 |
| **A4** | 端口未被占用 | 启动前：`netstat -ano \| findstr :5000` | 无输出（无 LISTENING） | 无输出 | P1：先清理旧进程（PowerShell `Stop-Process -Id <PID> -Force`），**勿用 taskkill //F** |
| **A5** | 浏览器内核可用 | `.venv/Scripts/python.exe -c "from playwright.sync_api import sync_playwright; from core.browser_utils import launch_browser; p=sync_playwright().start(); b=launch_browser(p, args=['--no-proxy-server']); print('browser ok'); b.close(); p.stop()"` | 输出 `browser ok` | `browser ok` | P1：系统无 Chrome/Edge；装 Edge 或 `playwright install chromium` |

> ⚠️ **本机陷阱**：Clash 系统代理会拦 localhost。所有本地请求加 `--noproxy '*'`；Playwright 启动加 `--no-proxy-server`。

### B. 测试健康度（7 项，约 90 分钟 — 有头套件慢）

> **执行顺序有讲究**：先跑不需要服务的（B1），再跑自起服务的（B3/B5/B6），最后跑需要手动起服务的（B2/B4）。

| 编号 | 检查内容 | 执行命令 | 判定标准（PASS） | 预期结果（基线 2026-10-18） |
|---|---|---|---|---|
| **B1** | 后端 E2E（无需服务） | `.venv/Scripts/python.exe tests/test_e2e.py` | **全部通过**，退出码 0 | **62/62** |
| **B2** | 前端集成（需先起服务） | 先 `python app.py`，再 `.venv/Scripts/python.exe tests/test_integration.py` | 全部通过 | **35/35** |
| **B3** | API 全端点（自起服务） | `.venv/Scripts/python.exe tests/test_api_e2e.py` | 全部通过，端口 5000 空闲 | **29/29** |
| **B4** | 有头用户流程（需先起服务） | 先 `python app.py`，再 `.venv/Scripts/python.exe tests/test_headed_userflow.py` | 全部通过 + **0 控制台报错** | **7/7** |
| **B5** | 有头全按钮（自起服务） | `.venv/Scripts/python.exe tests/test_headed_full_e2e.py` | 全部通过 + 0 报错 + 截图产出 | **33/33** |
| **B6** | 复制/推送套件（自起服务） | `.venv/Scripts/python.exe tests/test_headed_wechat_copy.py` | 全部通过 | **12/12** |
| **B7** | 测试未污染用户数据 | 跑测后：`git status --short` + `ls data/` | data/*.json 内容未被清空（账号/历史仍在） | 与原值一致 |

**通过率判定**：
- **100%** = PASS
- **≥95%（如 61/62）** = **P1**（记录失败项，限期修）
- **<95%** = **P0**（阻断发布）

**不通过处置**：把失败用例的**完整输出**（含 traceback）贴进缺陷清单；有头测试失败时同时保存截图到 `test_output/audit/`。

> ⚠️ **三个"自起服务"套件跑前会预检 5000 端口**：若被你自己的服务占用会直接 ABORT（退出码 2）。必须先杀掉自己起的服务，否则是"假通过/假失败"。

### C. 代码质量（6 项，约 45 分钟）

| 编号 | 检查内容 | 执行命令 | 判定标准（PASS） |
|---|---|---|---|
| **C1** | Python 语法全通过 | `.venv/Scripts/python.exe -m py_compile app.py core/*.py scripts/*.py` | 无 SyntaxError |
| **C2** | 前端 JS 语法 | 提取 `<script>` 内容后 `node --check <file>`（见附录 §8.2） | 无 SyntaxError |
| **C3** | 无硬编码密钥 | `grep -rn "AppSecret\|appsecret\|sk-\|api_key.*=.*['\"][A-Za-z0-9]\{20,\}" --include="*.py" --include="*.html" . \| grep -v ".venv\|node_modules"` | 无真实密钥（只允许读取配置/环境变量） |
| **C4** | 主题 JSON 完整性 | `.venv/Scripts/python.exe -c "import json,glob; [json.load(open(f,encoding='utf-8')) for f in glob.glob('public/themes/*.json')]; print(len(glob.glob('public/themes/*.json')))"` | 164 个，全部可解析 |
| **C5** | 前端 DOM 契约存在 | `grep -c "id=\"tpl-strip\"\|id=\"input-area\"\|id=\"preview-frame\"\|id=\"btn-copy\"\|id=\"btn-push\"\|id=\"btn-history\"" templates/index.html` | 6 个关键 id 全部存在（测试依赖） |
| **C6** | 渲染性能 | 起服务后：`curl --noproxy '*' -s -X POST http://127.0.0.1:5000/api/render -H "Content-Type: application/json" -d '{\"raw_text\":\"# 标题\\n\\n正文\",\"theme_id\":\"su-biz-azure\"}' -w "\n%{time_total}s"` | 单次 < **200ms**（基线约 7ms） |

### D. 文档一致性（5 项，约 30 分钟）

| 编号 | 检查内容 | 执行命令/方法 | 判定标准（PASS） |
|---|---|---|---|
| **D1** | 5 个主文档齐全 | `ls README.md AGENTS.md HANDOFF.md CLOSURE.md files/TODO.md` | 全部存在 |
| **D2** | 测试计数与实测一致 | 对比 `grep "通过" AGENTS.md` 与实际跑出的数字 | 数字一致（不一致 = P1，需更新文档） |
| **D3** | 最近变更已记录 | 看 `HANDOFF.md` 最后一条变更的日期 | 包含最近一次代码提交的日期与内容 |
| **D4** | 收尾台账有回滚点 | 看 `CLOSURE.md` 最后一条是否有提交哈希 | 有 `git log --oneline -1` 的哈希 |
| **D5** | docs 目录规范 | `ls docs/` | 根下只有 `.md` + `archive/ prototypes/ screenshots/ ux-audit/`（允许 `exe-packaging-report.html` 这类专题报告） |

### E. 产出物与目录规范（4 项，约 20 分钟）

| 编号 | 检查内容 | 执行命令 | 判定标准（PASS） |
|---|---|---|---|
| **E1** | 工作区干净 | `git status --short` | 无输出（或仅有预期的未跟踪产物目录） |
| **E2** | output 体积受控 | `du -sh output` | **< 500MB**（基线 45MB） |
| **E3** | 测试产物不残留 | `ls test_output/` | 只有本轮产物或为空；无 `.py` 临时脚本 |
| **E4** | gitignore 覆盖 | `git check-ignore -v data/ output/ test_output/ pwa/dist/ .env` | 全部被忽略 |

### F. 合规检查（5 项，约 40 分钟）

| 编号 | 检查内容 | 执行命令 | 判定标准（PASS） |
|---|---|---|---|
| **F1** | 根目录有 LICENSE | `ls LICENSE THIRD_PARTY_NOTICES.md` | 两者存在（开源路线必须） |
| **F2** | 许可声明与仓库一致 | 看 `README.md` 的 License 段落 + `LICENSE` 首行 | 声明一致（如均为 AGPL-3.0） |
| **F3** | 字体许可文件 | `ls pwa/public/fonts/OFL.txt`（或 `public/fonts/`） | 存在，含三款字体的版权行 |
| **F4** | 敏感文件未入库 | `git ls-files \| grep -E "^\.env$\|^data/\|^output/"` | 无输出 |
| **F5** | 第三方资产许可说明 | `grep -l "AGPL\|BLCaptain\|OFL" THIRD_PARTY_NOTICES.md` | 命中，且列明归藏/BLCaptain/字体 |

**合规判定**：F1/F4 任一 FAIL = **P0**（不可公开发布）；F2/F3/F5 = **P1**。

### G. PWA 专项（如 `pwa/` 已开工；4 项，约 30 分钟）

| 编号 | 检查内容 | 执行命令 | 判定标准（PASS） |
|---|---|---|---|
| **G1** | 构建产物白名单 | `node pwa/scripts/build.mjs` 后：`ls pwa/dist/` | 无 `cover-templates`/`screenshot-backgrounds`/`images`/`social-thumb`（若走开源 AGPL 路线，此条改为"存在但已随仓库开源"） |
| **G2** | 无外网字体依赖 | `grep -rn "fonts.googleapis.com" pwa/dist/` | 无输出 |
| **G3** | PWA 三件套 | 检查 `pwa/dist/manifest.webmanifest`（含 name/icons 192+512/display）+ Service Worker 注册代码 | 三要素齐全 |
| **G4** | 离线可用 | 浏览器打开 → DevTools Network 切 Offline → 刷新 | 页面仍可用（引擎已缓存） |

---

## 4. 判定标准总表（缺陷分级）

| 等级 | 定义 | 典型场景 | 时限 | 是否阻断发布 |
|---|---|---|---|---|
| **P0 阻断** | 功能不可用 / 数据损坏 / 合规硬伤 | 测试 <95%、服务起不来、密钥入库、无 LICENSE | **立即** | ✅ 阻断 |
| **P1 严重** | 功能缺陷但可绕 / 文档严重不符 | 单测失败、文档计数错、字体未自托管 | 当天 | ⚠️ 修复后可发 |
| **P2 改进** | 体验/规范瑕疵 | 目录不规范、命名不统一、注释缺失 | 下次迭代 | ❌ 不阻断 |
| **INFO** | 观察项 | 性能数据、体积趋势 | 归档 | ❌ |

**判定原则**：
1. 有明确数字标准（如 62/62）的，**按数字判**，不做主观解释
2. 无数字标准的（如"文档一致性"），按本文档给出的**具体判据**判
3. 拿不准的**一律降级为 P2 + 标注"待确认"**，不阻塞发布

---

## 5. 预期输出与交付物

### 5.1 审计报告（必须产出，Markdown）

保存到 `docs/audit/audit-YYYY-MM-DD.md`，模板：

```markdown
# SuperSu 审计报告 YYYY-MM-DD

## 一、结论
- 总体：PASS / PASS-with-issues / FAIL
- P0：N 项 / P1：N 项 / P2：N 项
- 是否可发布：是 / 否（原因）

## 二、逐项结果
| 编号 | 检查项 | 结果 | 实测值 | 备注 |
|---|---|---|---|---|
| A1 | 依赖导入 | PASS | ok | |
| B1 | 后端 E2E | PASS | 62/62 | |
| ...（A-G 全部列出） |

## 三、缺陷清单
| # | 等级 | 模块 | 现象 | 复现步骤 | 预期 vs 实际 | 建议修复 | 证据 |
|---|---|---|---|---|---|---|---|
| 1 | P1 | 前端 | ... | ... | ... | ... | `test_output/audit/xxx.png` |

## 四、证据目录
- 截图：`test_output/audit/`
- 测试日志：`test_output/audit/*.log`
- 命令输出：粘贴关键片段

## 五、复测记录（修复后）
| 缺陷# | 复测结果 | 复测人 | 日期 |
```

### 5.2 缺陷清单（可与报告合并，也可单独 CSV）

字段固定：`编号 / 等级 / 模块 / 现象 / 复现步骤 / 预期 / 实际 / 建议 / 证据路径`。

### 5.3 证据留存要求

| 类型 | 存放位置 | 说明 |
|---|---|---|
| 测试截图 | `test_output/audit/` | 有头测试的失败截图 |
| 测试日志 | `test_output/audit/*.log` | 完整 stdout（不要只留 tail） |
| 命令输出 | 报告内粘贴 | 关键命令的原始输出 |
| 浏览器控制台 | 报告内粘贴 | 有头测试的 console 报错 |

> **证据目录不入库**（`test_output/` 已 gitignore）；报告入 `docs/audit/`（入库）。

---

## 6. 时间安排与责任人分工

### 6.1 时间盒（单人 4 小时）

| 时段 | 环节 | 时长 | 说明 |
|---|---|---|---|
| 00:00-00:15 | A 环境与启动 | 15 min | 起服务后用着不关，供 B2/B4 使用 |
| 00:15-01:45 | B 测试健康度 | 90 min | 有头套件慢，可并行开终端 |
| 01:45-02:30 | C 代码质量 | 45 min | 静态检查为主 |
| 02:30-03:00 | D 文档一致性 | 30 min | 对照实测数字 |
| 03:00-03:20 | E 产出物与目录 | 20 min | 体积与 gitignore |
| 03:20-04:00 | F 合规 | 40 min | 逐文件核对 |
| （可选）04:00-04:30 | G PWA 专项 | 30 min | 仅当 `pwa/` 已开工 |

**留出 30 分钟写报告**（可与其他环节重叠，边审边记）。

### 6.2 角色分工

| 角色 | 职责 | 谁是 |
|---|---|---|
| **审计执行者** | 按本文档执行 A-G，产出报告与缺陷清单 | 接手人 / AI 助手 / 外部审计 |
| **复核人** | 抽查报告中的 P0/P1，确认证据充分 | 项目负责人（苏哥） |
| **修复人** | 按缺陷清单修复，修完回报复测 | 开发 / AI 助手 |
| **发布决策人** | 依据报告决定是否发布/开源 | 项目负责人（苏哥） |

> **单人也跑得动**：一个人可以同时是执行者+修复人，但**复核必须由另一人（或另一个 AI 会话）做**，避免"自己审自己"。

---

## 7. 问题记录与上报流程

### 7.1 记录格式（缺一不可）

```
【P1-03】前端 · 模板库缩略图偶发不显示
- 模块：templates/index.html · .d-thumb
- 现象：刷新后部分卡片只有渐变底色，无缩略图
- 复现：打开抽屉 → 快速滚动到底部 → 部分图未加载
- 预期：164 张全部显示
- 实际：约 8 张空白
- 证据：test_output/audit/thumb-missing.png
- 建议：img 加 loading="lazy" 的同时补 onerror 回退（已有），检查 /assets 路由缓存头
```

### 7.2 上报路径与时限

| 等级 | 上报给谁 | 时限 | 方式 |
|---|---|---|---|
| **P0** | 项目负责人（苏哥）+ 立即停发 | **发现即报**（< 15 分钟） | 微信/邮件 + 报告置顶 |
| **P1** | 项目负责人 | 当天 24:00 前 | 报告汇总 |
| **P2** | 记入报告即可 | 下次迭代 | 报告附录 |
| **INFO** | 归档 | — | 报告附录 |

### 7.3 升级规则

- P1 超过 **3 天**未修 → 自动升级为 P0（阻断发布）
- 同一模块累计 **3 个 P1** → 该模块整体标记为"不建议使用"
- 审计中发现**新风险类型**（本文档未覆盖）→ 记为 INFO + 建议补进本文档

### 7.4 复测与关闭

1. 修复人改完后，**必须重跑对应检查项**（不是"我觉得改好了"）
2. 复测结果写进报告 §5"复测记录"
3. 复测通过 = 缺陷关闭；复测失败 = 退回修复人（同一缺陷最多 2 轮）
4. **P0 未清零不得发布**

---

## 8. 附录

### 8.1 常用命令速查（Windows / Git Bash）

```bash
# 起服务（终端 A，保持不关）
python app.py

# 健康检查（注意 --noproxy）
curl --noproxy '*' -s -o /dev/null -w "%{http_code}\n" http://127.0.0.1:5000/api/themes

# 杀服务（PowerShell，勿用 taskkill //F）
Get-Process python -ErrorAction SilentlyContinue | Stop-Process -Force

# 跑单个测试
.venv/Scripts/python.exe tests/test_e2e.py

# 主题数量
ls public/themes/*.json | wc -l        # 应为 164

# 缩略图数量
ls public/theme-thumbs/*.jpg | wc -l   # 应为 164

# 体积排查
du -sh */ | sort -rh | head -10
```

### 8.2 前端 JS 语法检查（C2 用）

```bash
.venv/Scripts/python.exe -c "
import io, re
src = io.open('templates/index.html', encoding='utf-8').read()
m = re.search(r'<script>(.*?)</script>', src, re.S)
io.open('test_output/_check.js', 'w', encoding='utf-8', newline='\n').write(m.group(1))
print('extracted', len(m.group(1)), 'chars')
"
node --check test_output/_check.js && echo "JS OK"
```

### 8.3 已知坑（审计时务必遵守）

| 坑 | 症状 | 正确做法 |
|---|---|---|
| Clash 代理拦 localhost | `curl` 返回 502 | 加 `--noproxy '*'`；Playwright 加 `--no-proxy-server` |
| 端口 5000 被占 | 自起服务套件 ABORT（退出码 2） | 先杀进程，再跑套件 |
| `taskkill //F` 失败 | PowerShell 报 Invalid argument | 用 `Stop-Process -Id <PID> -Force` |
| 有头套件跑改 data/ | 账号/历史被清空 | 测试已做快照还原；跑前仍建议备份 `data/` |
| bash 里写含反引号的长文本 | 生成垃圾文件 / 文档被污染 | 用文件写入工具，不要在 shell 里内联长文本 |
| 测试等待过短 | 误判"失败"（实际还在跑） | 有头测试用条件轮询，不用固定 sleep |

### 8.4 术语

| 术语 | 含义 |
|---|---|
| 有头测试 | 真实打开浏览器窗口的端到端测试（非无头） |
| DOM 契约 | 测试依赖的 HTML id/class，改动会导致测试失效 |
| 白名单构建 | 只 copy 指定文件到 dist，禁止整目录复制 |
| L1/L2/L3 产出物 | 交付物 / 运行时数据 / 可再生缓存（见 project-conventions §5） |
| 静默丢组 | 代码里 `if not items: continue` 导致功能缺失但不报错 |

---

## 9. 审计执行确认（签字栏）

| 项 | 内容 |
|---|---|
| 审计日期 | |
| 审计执行者 | |
| 仓库提交哈希 | `git log --oneline -1` → |
| 环境（OS / Python / Playwright） | |
| 报告路径 | `docs/audit/audit-YYYY-MM-DD.md` |
| P0 / P1 / P2 数量 | / / |
| 总体结论 | PASS / PASS-with-issues / FAIL |
| 复核人签字 | |
