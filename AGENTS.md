# AGENTS.md — SuperSu 个人工具项目规则

## 1. 项目定位

SuperSu 是本地化微信公众号自动排版 + 小红书封面生成工具。
核心理念：**纯文本进，排版出。不用 AI 就不开 AI。**

- 自动 Markdown 预处理（本地规则，零延迟零费用）
- **92 套**主题自动排版（45 原创 + 47 开源适配；Markdown → 微信内联 HTML）
- 小红书封面生成（双引擎：归藏 Guizang + BLCaptain 9 风格；**自动联网搜真图作底图**）
- AI 功能（润色/摘要/封面图）默认隐藏，按需展开

## 2. Karpathy 四原则

- **多问别猜**：不确定意图或 API 时，立刻提问
- **极简至上**：只写完成需求的最少代码，不设计未来架构
- **手术修改**：只改要求的部分，不顺手重构、不删已有注释、不修改风格
- **目标驱动**：根据成功标准自我验证，告知验证过程和结果

## 3. 架构速查

```
app.py                  Flask 主应用（路由 + SSE + API）
core/
  format_engine.py      排版引擎（92 主题，Markdown → 微信 HTML）
  preprocessor.py       纯文本 → Markdown（正则规则，零延迟）
  image_search.py       联网搜图（Wikimedia/Pexels 双轨；免 key 默认可用）
  ai_client.py          多平台 LLM 客户端（润色/摘要/排版）
  image_gen.py          AI 封面图生成（LLM 关键词 → 文生图 → PIL 叠加）
  token_manager.py      微信 Access Token 管理（线程安全单例）
  wechat_publisher.py   微信公众号 API（素材上传 + 草稿推送）
  crypto_utils.py       API Key 加密存储
  blcaptain_bridge.py   BLCaptain 封面引擎适配层（Node.js，9 风格）
  guizang_renderer.py   归藏封面渲染器（Playwright HTML→PNG，data URI 内嵌底图）
scripts/
  adapt_external_themes.py  开源主题适配脚本
  remove_dup_themes.py      去重脚本
templates/
  index.html            单页前端（公众号 + 小红书双页面；色卡条 + Lightbox）
public/                 静态资源（原 assets/，由 /assets/* 路由提供）
  themes/               92 套排版主题 JSON（45 原创 + 47 xh-* 开源适配）
  cover-templates/      归藏封面模板
  images/               封面库存图（最终兜底）
  social-thumb/         模板缩略图
references/             归藏设计系统参考文档
data/                   运行时数据（配置/账号/历史/bg_cache 图片缓存）
output/                 封面渲染输出
docs/
  screenshots/          README 配图
  prototypes/           早期 HTML 原型（已废弃）
```

## 4. 启动与停止

```bash
# 启动
pip install -r requirements.txt
playwright install chromium      # 必需：小红书封面生成依赖 Chromium，缺则 /api/social/generate 报 500
python app.py                    # http://127.0.0.1:5000

# 测试
python tests/test_e2e.py         # E2E（Flask test_client，无需起服务）— 40/41 通过
python tests/test_integration.py # 集成测试（需先启动服务）— 35/35 通过
python tests/test_api_e2e.py     # 后端 API 全端点 E2E（自起服务，21 项）— 29/29 通过
python tests/test_headed_full_e2e.py  # 前端有头全按钮 E2E（双页全量，26 项）— 26/26 通过

# 清理端口
taskkill //F //IM python.exe
```

## 5. 路由速查

| 方法 | 路由 | 用途 |
|------|------|------|
| GET | `/` | 首页 SPA |
| GET | `/api/themes` | 主题列表 |
| POST | `/api/render` | 文本预处理 + Markdown 渲染（核心） |
| GET | `/api/optimize-stream` | SSE 推送 LLM 优化结果 |
| POST | `/api/polish` | AI 润色 |
| POST | `/api/ai-format` | AI 智能排版 |
| POST | `/api/summary` | AI 生成摘要 |
| POST | `/api/cover-image` | AI 生成封面图 |
| GET/POST/DELETE | `/api/accounts` | 公众号配置 CRUD |
| POST | `/api/push` | 推送微信草稿箱 |
| GET/POST | `/api/ai-config` | LLM 配置管理 |
| POST | `/api/ai-config/test` | 测试 LLM 连接 |
| GET | `/api/ai-platforms` | 预配置平台列表 |
| GET | `/api/server-ip` | 服务器公网 IP |
| POST | `/api/social/generate` | 小红书封面生成 |
| GET | `/api/social/thumbnails` | 模板缩略图列表 |
| POST | `/open-folder` | 打开本地文件夹 |

## 6. 公众号页面关键元素（顶部模板条 + 双区布局）

```
#page-wechat
  .tab-bar              → 页面切换（公众号排版 | 小红书封面）+ 设置按钮
  .tpl-bar              → 顶部紧凑模板条（固定高度 ~135px）
    #tpl-strip           → 横向色卡网格（92 张 .tpl-card，换行滚动）
    #tpl-search          → 内联搜索过滤框
    .tpl-toggle          → 收起/展开按钮
  .wechat-body           → 下方双区 grid（0.85fr | 1.15fr）
    .col-text            → 左：#input-area（textarea，响应式 rem）
    .col-preview         → 右：手机预览框（390×760）+ 底部操作栏
      #preview-frame     → iframe 实时预览（srcdoc blob URL）
    .btn-copy / btn-history / btn-push / AI 按钮
  ⚠️ 加载即自动选中第一套主题（activeTpl = themes[0].id）→ 输入即渲染，无需先手动点选
  ⚠️ 复制按钮写入 text/html 富文本（ClipboardItem），公众号可直接粘贴成排版样式；
     非安全上下文（局域网 IP / 旧浏览器）降级走隐藏 contenteditable + execCommand('copy')
```

## 7. 小红书页面关键元素（双引擎 + 自动搜图）

```
#page-social
  .social-ctrl          → 左控制面板（~260px）
    #social-text         → 文案输入 textarea（500 字限制）
    #social-char-count   → 字数计数器
    #social-tpl-grid      → 风格选择网格（.tpl-mini[data-style]）
      归藏: editorial / swiss
      BLCaptain: sp-mist / sp-warm / sp-coastal / sp-night / sp-hearth
                sl-blue / sl-mint / sl-coral / sl-lime
    #btn-generate-cover  → 一键生成按钮
  .social-right          → 右双区（flex 容器）
    .social-preview      → 上：模板预览卡（固定高度 ~200px）
    .social-results      → 下：结果画廊（自适应网格 .results-grid）
      .result-card       → 封面缩略图（3:4），点击 → Lightbox 大图预览
    #bg-credit           → 底图署名条（来源/作者/许可/关键词，自动显示）
```

## 8. 测试工作流

```
1. python app.py                            ← 启动服务
2. python tests/test_integration.py         ← 前后端联动测试
3. python tests/test_e2e.py                 ← 全量 E2E
4. python tests/test_api_e2e.py             ← 后端 API 全端点 E2E（29 项）
5. python tests/test_headed_full_e2e.py     ← 前端有头全按钮 E2E（双页 26 项）
6. 检查 output/ 目录                        ← 验证封面生成
```

## 9. 已知注意事项

- 封面渲染统一走 `core/guizang_renderer.py`（需 `playwright install chromium`）；旧 `scripts/render_worker.py` 双份实现已删除
- `public/social-thumb/` 为空时需运行 `scripts/gen_thumbnails.py`
- 测试用 `app.test_client()` 避免端口冲突
- SSE 30 秒超时，优化结果 120 秒缓存；⚠️ 后台 LLM 优化（_start_background_optimization）默认已关闭（前端未接入 SSE 消费），见 F2 修复
- Windows 上 `os.startfile()` 需 try/except 捕获 OSError
- 字体已放大（响应式 rem 层级，编辑区 #input-area 最大约 1.25rem/20px；非字面 24px）
- 公众号和小红书两套 CSS 独立命名空间，互不污染

## 10. 设计约束

- AI 功能默认折叠，不自动触发
- 核心流程：输入 → 自动预处理 → 选主题 → 渲染（零 AI 参与）
- 新增功能采用并存模式，不替换现有工作代码
- 所有修改跑 E2E 验证（test_e2e 40/41）+ 集成测试（test_integration 35/35）
- 全系统前后端 E2E：test_api_e2e.py（后端 29 项）+ test_headed_full_e2e.py（前端双页 26 项，0 控制台报错）

## 11. Agent 工程纪律（通用宪法适配）

> 本节承载「通用 Agent 宪法」的工程纪律，已适配 SuperSu。唯一真源见本文件；Claude 端 `claude.md` 经 `@AGENTS.md` 导入；WorkBuddy 端在任务内 `@AGENTS.md` 引用生效。

### 真源优先级
事实冲突按序：① 当前源码 / 测试 / 脚本 / 运行日志 / git 状态；② 本文件与 `claude.md`；③ `.workbuddy/memory/MEMORY.md`、`HANDOFF.md`、`CLOSURE.md`；④ `README.md`、`references/`；⑤ archive 历史仅作模式证据，不覆盖当前事实。冲突先报告再等确认。

### 推理闸（编码前必答）
- 实际要解决什么问题？谁创建 / 调用 / 消费这个概念？
- 当前真源在哪？是否已有同职责模块（封面引擎已有归藏 + BLCaptain，勿再造第三套）？
- 唯一 owner 是哪层？UI / 脚本 / prompt 不得私造业务真相。
- 更简单保守的设计是什么？最大回归风险用什么证据阻断？

### 设计规则
- 共享语义单真源进 `core/`；`scripts/`、`core/blcaptain_bridge.py` 只做协议映射 / 接线，不拥有核心语义。
- 生成物只读不手改：`public/` 下 `themes/*.json`、`cover-templates/` 为配置真源；`blcaptain-style-skill/` 是 vendored 子项目（自带 `.git`），其生成输出 `DO NOT EDIT`，改源后重生成。
- 不顺手重构、不删已有注释、不修改风格（Karpathy 四原则见 §2）。

### 错误分级
- 阻断：破坏核心功能 / owner 边界 / 密钥安全 / 数据真相 / 测试门禁 / 用户关键体验。当轮必须收掉。
- 设计风险：架构漂移、运行面失控，须说明取舍与验收入口。
- 可记录债务：不影响本轮，须说明原因与后续入口（如 E2E 陈旧 1 项 → 目标 41/41）。
- 无关优化：不进入本轮，禁借机扩大改造。

### 验收规则（须给真实证据）
- 声称完成前必须提供本轮实际运行的命令 / 测试 / 日志 / 截图 / 出图证据。
- 改动跑 E2E（`test_e2e` 40/41）+ 集成（`test_integration` 35/35）；封面相关须实跑 `/api/social/generate` 三引擎（editorial / swiss / mist）出真实 PNG。
- warning / lint / 测试计数漂移 / 文档索引缺失 / 本轮 TODO 按缺陷处理，除非明确记为非本轮债务。
- UI 改动须检查真实渲染（headed E2E 7/7），不只看代码。

### Git 边界
- 禁止 `git add .`；只 stage 本任务相关文件。
- 嵌套仓库 `blcaptain-style-skill/` 与父仓分别审计、分别提交，勿将其改动吸入父仓。
- `.env`、`data/`（含加密 AppSecret）、`.workbuddy/`、`output/`、`uploads/`、`blcaptain-style-skill/` 已被 gitignore，禁止 force-add。
- dirty worktree 中不回滚 / 覆盖 / 吸入用户未授权改动。

### 文档分层与回写
- 内部真源：`AGENTS.md` / `MEMORY.md` / `HANDOFF.md` / `CLOSURE.md`；外部用户：`README.md`。
- 改代码 / 接口 / 配置 / 架构边界 / 用户行为后，必须同步对应文档（含本文件与 README 测试计数）。
- 单任务结束执行 `CLOSURE.md` 收尾程序（更新文档、受控提交、必要时写 `docs/task_closure_*.md`）。

### 对外贡献 / 多 Agent
- 个人工具，对外 PR 前先读贡献规则、一次一问题、不混入无关改动。
- 多 agent 仅用于互不干扰的独立域；子 agent 结论须主 agent 对照代码 / 测试验收。
