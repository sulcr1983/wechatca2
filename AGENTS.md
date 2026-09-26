# AGENTS.md — SuperSu 个人工具项目规则

## 1. 项目定位

SuperSu 是本地化微信公众号自动排版 + 小红书封面生成工具。
核心理念：**纯文本进，排版出。不用 AI 就不开 AI。**

- 自动 Markdown 预处理（本地规则，零延迟零费用）
- **92 套**主题自动排版（45 套早期原创 + 47 套 su-* 原创；Markdown → 微信内联 HTML）
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
  build_themes.py           原创主题生成器（设计标尺 → 47 套 su-* 主题 JSON）
  theme_specs.py            47 套原创主题的设计意图规格（新主题在这里加一条）
templates/
  index.html            单页前端（公众号 + 小红书双页面；色卡条 + Lightbox）
public/                 静态资源（原 assets/，由 /assets/* 路由提供）
  themes/               92 套排版主题 JSON（45 套早期原创 + 47 套 su-* 原创）
                        ⚠️ su-* 47 套为**生成物**：改 scripts/theme_specs.py 后重跑
                           scripts/build_themes.py 重生成，勿手改 JSON
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
# 启动（二选一）
start-app.bat                    # 双击即用：自动建 venv/装依赖/补 Chromium → 起服务 → 开浏览器
python app.py                    # http://127.0.0.1:5000（等效，需自己先激活环境）
# ⚠️ start-app.bat 的两条硬约束（改动前必读，2026-09-26 因这两条踩过「双击没反应」）：
#   1) 全程用 %~dp0 拼绝对路径调用 .venv\Scripts\python.exe，**不要用 activate.bat**——
#      其内部写死创建时的绝对路径，项目一换目录就失效 → python 落到系统解释器
#      → 报 No module named 'flask'。.venv 换目录后可用
#      `<基础解释器> -m venv .venv` 原地重建激活脚本（不加 --clear，已装包会保留）。
#   2) *.bat / *.cmd **必须 CRLF 换行**（已由 .gitattributes 的 eol=crlf 锁定）。
#      裸 LF 会让 cmd 解析错乱、把行切成半截命令，表现为窗口一闪或一堆
#      `'xxx' is not recognized`。

# 测试
python tests/test_e2e.py         # E2E（Flask test_client，无需起服务）— 52/52 通过
python tests/test_integration.py # 集成测试（需先启动服务）— 35/35 通过
python tests/test_api_e2e.py     # 后端 API 全端点 E2E（自起服务，29 项）— 29/29 通过
python tests/test_headed_full_e2e.py  # 前端有头全按钮 E2E（双页全量，33 项）— 33/33 通过
                                      # 快捷入口：scripts/run_headed_test.bat（自起服务，需 5000 空闲）
python tests/test_headed_userflow.py  # 有头用户流程（需先启动服务，7 项）— 7/7 通过
python tests/test_headed_wechat_copy.py  # 有头复制/推送/封面旧资产（自起服务，12 项）— 12/12 通过
# ⚠️ 三个“自起服务”套件（api_e2e / headed_full_e2e / headed_wechat_copy）跑前会预检端口 5000：
#    若已被你自己的 app.py 占用，直接 ABORT（退出码 2）——否则会连到旧进程用陈旧代码假通过。
# ⚠️ 反过来更危险：如果你自己的 app.py 是**改动前**起的，它会一直占着 5000，套件也会连到旧代码。
#    改完代码务必先确认真进程已换（见下），再跑套件。

# 清理端口
Get-Process python -ErrorAction SilentlyContinue | Stop-Process -Force
# ⚠️ 别用 `taskkill //F //IM python.exe`：本机 PowerShell 会报 `Invalid argument/option - '//F'`
#    直接失败；若把 stderr 重定向到 $null，失败会被吞掉，旧进程继续服务旧代码，
#    表现为「改完代码界面却没变」的假象（2026-09-25 实测踩过）。
#    清完务必核验： (Get-NetTCPConnection -LocalPort 5000 -State Listen).Count 应为 0
```

## 5. 路由速查

| 方法 | 路由 | 用途 |
|------|------|------|
| GET | `/` | 首页 SPA |
| GET | `/api/themes` | 主题列表 |
| POST | `/api/render` | 文本预处理 + Markdown 渲染（核心） |
| GET | `/api/optimize-stream` | SSE 推送 LLM 优化结果 |
| POST | `/api/polish` | AI 润色 |
| POST | `/api/ai-format` | 智能排版：AI 只输出结构决策 JSON（标题/小节/列表/加粗），正文由 `apply_structure` 原样套用；未配置/调用失败/结构不可解析一律本地 `preprocess` 兜底（响应带 `engine: llm\|local` + `fallback` 原因） |
| POST | `/api/summary` | AI 生成摘要 |
| POST | `/api/cover-image` | AI 生成封面图 |
| GET/POST/DELETE | `/api/accounts` | 公众号配置 CRUD |
| POST | `/api/push` | 推送微信草稿箱 |
| GET/POST | `/api/ai-config` | LLM 配置管理 |
| POST | `/api/ai-config/test` | 测试 LLM 连接 |
| GET | `/api/ai-platforms` | 预配置平台列表 |
| GET | `/api/server-ip` | 服务器公网 IP |
| POST | `/api/social/generate` | 小红书封面生成 |
| GET | `/api/social/styles` | 小红书风格列表（含 group） |
| GET | `/api/social/thumbnails` | 模板缩略图列表 |
| GET | `/api/history` | 推送历史 |
| GET | `/temp_covers/<filename>` | 临时封面图（AI 标题图） |
| GET | `/output/<path:filepath>` | 封面渲染产物 |
| GET | `/assets/<path:filename>` | public/ 静态资源 |
| POST | `/open-folder` | 打开本地文件夹 |

## 6. 公众号页面关键元素（顶部模板条 + 双区布局）

```
.topbar                  → 共享顶栏（#page-wechat 之外）：.tab-btn 页面切换（公众号排版 | 小红书封面）+ #btn-settings 设置
#page-wechat
  .tpl-bar              → 顶部紧凑模板条（固定高度 ~135px）
    #tpl-strip           → 横向色卡网格（92 张 .tpl-card，换行滚动）
    #tpl-search          → 内联搜索过滤框
    .tpl-toggle          → 收起/展开按钮
  .wechat-body           → 下方双区 grid（0.85fr | 1.15fr）
    .col-text            → 左：#input-area（textarea，响应式 rem）
      .editor-header     → #btn-demo（看示例/清空）+ #module-picker（插入模块下拉，
                           11 个模块模板，选中即在光标处插入 ::: 围栏并触发渲染）
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
5. python tests/test_headed_full_e2e.py     ← 前端有头全按钮 E2E（双页 32 项）
6. 检查 output/ 目录                        ← 验证封面生成
```

## 9. 已知注意事项

- 封面渲染统一走 `core/guizang_renderer.py`（需 `playwright install chromium`）；旧 `scripts/render_worker.py` 双份实现已删除
- ⚠️ **`.bat` 必须 CRLF**：`.gitattributes` 已锁 `*.bat` / `*.cmd` 为 `eol=crlf`。手写或工具生成的 `.bat` 若为 LF，cmd 会解析错乱（2026-09-26 导致 `start-app.bat` 双击完全不可用）
- ⚠️ **venv 不能靠 `activate.bat` 定位自己**：激活脚本里写死了创建时的绝对路径，项目换目录后激活会静默失效（`VIRTUAL_ENV` 指向旧路径、`python` 落到系统解释器）。脚本一律用绝对路径调 `.venv\Scripts\python.exe`
- `scripts/start_flask.py` / `launcher.py` 为已废弃旧入口（零引用，见 HANDOFF §7 可记录债务），真实入口是 `app.py` / `start-app.bat`
- `public/social-thumb/` 为空时需运行 `scripts/gen_thumbnails.py`
- 测试用 `app.test_client()` 避免端口冲突
- SSE 30 秒超时，优化结果 120 秒缓存；⚠️ 后台 LLM 优化（_start_background_optimization）默认已关闭（前端未接入 SSE 消费），见 F2 修复
- `tests/test_e2e.py` 现在会**在测试前快照、结束时（含中途崩溃，经 atexit）还原** `data/*.json`；测试新增文件删除。仍建议跑测前备份真实配置（快照只覆盖进程正常启动后的写入）
- Windows 上 `os.startfile()` 需 try/except 捕获 OSError
- 字体已放大（响应式 rem 层级，编辑区 #input-area 最大约 1.25rem/20px；非字面 24px）
- 公众号和小红书两套 CSS 独立命名空间，互不污染

## 10. 设计约束

- AI 功能默认折叠，不自动触发
- 核心流程：输入 → 自动预处理 → 选主题 → 渲染（零 AI 参与）
- 智能排版降级契约（2026-09-23，取代「失败即 500」旧版）：`/api/ai-format` 已配置 LLM → 走 LLM（`engine=llm`）；**未配置 / 调用失败 / AI 返回结构无法解析 → 一律本地 `preprocess` 兜底**（`engine=local`，响应带 `fallback` 说明原因，如「AI 网关 HTTP 500，已用本地规则排版」）；按钮永远给得出结果，且失败必带原因、不静默
- 智能排版实现（2026-09-23，参照 GitHub 同类项目）：AI **不改写正文**，只返回结构决策 JSON（`{"title","sections","lists","bold"}`，走 `response_format={"type":"json_object"}`）；本地 `core/preprocessor.apply_structure` 按段号套用标记，越界/重叠/词不在原文的项一律忽略，**正文段落原样保留**。LLM 客户端对 429/5xx/超时退避重试一次（`core/ai_client._post_with_retry`，超时 45s）
- 本地规则边界（2026-09-23 调研拍板）：本地只做**确定性识别**——编号标题（`一、`/`1.`）、短行标题、并列清单（箭头行 `A → B → C`、项目符号 `·•●○`）、引号引用、首个非层级段作大标题；**不做散文主题句提升、不做规则"发明"小节**（调研结论：doocs/md、wenyan-mcp 都不做，唯一同类 Word-Formatter-Pro 也只认编号；非 LLM 的散文分节只有 TextTiling/embedding 路线，与「不用 AI 就不开 AI」冲突）。并列清单规则对 AI 路径同样恒定生效，不依赖 AI 是否标注
- 新增功能采用并存模式，不替换现有工作代码
- **排版模块与页面布局（2026-09-25）**：两套能力，都无需 AI
  - **模块容器**：`process_fenced_containers` 支持 12 种 `:::type[标题]` 围栏（新增 `eyebrow` 小标签 / `cards` 卡片组 / `summary` 要点总结 / `cta` 行动引导；`cards` 内部用 `### 小标题` 分卡）。**必须成对写收尾 `:::`**：缺收尾时整段按普通文本原样输出，绝不吞正文（原实现在未闭合时会把后面整篇当成容器内容）
  - **页面布局**：`inject_inline_styles` 第 8 步按 `theme.layout` 分发 —— `card`→`_wrap_card_sections`、`hero`→`_wrap_hero_sections`、`timeline`→`_wrap_timeline_sections`。此前只实现了 `card`，13 套 `layout:hero`（10 套 su-dusk-* + su-ribbon / su-countdown / su-deepwater）与 1 套 `layout:timeline`（su-milestone）的配置**从未被读取**，属死配置
  - `hero` 开关（`dark_header` 深色首屏 / `numbered` 大序号 / `alt_bg_enabled` 交替色带 / `pull_quotes` 引文穿插 / `cards` 卡片组 / `dark_footer` 暗色尾屏 / `h2_border`）显式声明优先，未声明用 `HERO_DEFAULTS`（对应 10 套 su-dusk-* 描述里的「暗色首屏+大序号+交替色带+引文穿插」）。`cards` 优先于 `alt_bg_enabled`，避免叠两层视觉
  - ⚠️ **首屏取谁**：预处理会把 ≤12 字的短标题标成 `##`（既有行为，测试已钉死），故 `_split_hero_head` 在无 `<h1>` 时退回取首个 `<h2>` + 紧随段落作首屏，否则「暗色首屏」在真实输入下不触发
  - **色带可见性（2026-09-25 修订，取代旧「引擎不擅自改配色」）**：`_resolve_band_bg` 判定主题自带 `alt_bg` 与页面底色的通道差是否 ≥ `_BAND_MIN_DISTANCE`(45)。不足则按 accent 逐步混 12%→24% 派生**带主题色系**的色带（比纯灰好看）；低饱和强调色加深后仍不够时再压 6% 墨色兜底。实测 13 套 hero 主题的色带通道差从 15–50 提到 46–57，有头浏览器目视确认「明显可见」。`su-countdown` 显式 `alt_bg_enabled:false` 故无色带（设计如此）。生成器 `scripts/build_themes.py` 直接复用该函数，保证写进 JSON 的值与引擎兜底永远一致
- **容器样式跟随主题（2026-09-25）**：`_inject_container_styles` 现从 `theme.colors` 派生 surface/text/muted/border/页面底色（此前除 accent 外**全部硬编码**，92 套主题的模块长得一模一样）。修复了两处既有缺陷：
  - 容器内层 `<p>` 的专属样式**从未生效**——通用标签注入（第 5 步）先给这些元素加了 `style`，令容器样式注入的精确匹配失配。已在 `simple_tags` 注入中跳过带 `data-container=` 的元素（HEAD 版本已实测复现）
  - `_recolor_block` / `_apply_h2_border` 里的 `(style="[^"]*)"` 正则尾部多了一个引号，永远匹配不上→静默不生效，已改为 `(style=")([^"]*)(")`
- **预处理器容器感知（2026-09-25）**：`preprocess` 按 `container_depth` 跟踪 `:::` 嵌套，容器内所有行原样穿透（此前容器内的短行会被「短行标题」规则改成 `##`，`:::stat` 的数字、`:::steps` 的步骤全废）
- **代码块三处修复（2026-09-25）**：
  1. **标签泄漏**：`style_pre` 原先把 `<code class="language-xxx">` 开标签一起喂给 `_basic_syntax_highlight`，正则高亮把 `class` 当关键字、`"language-xxx"` 当字符串包成 `<span>`，标签被拆碎；随后 `<code[^>]*>` 替换又吞掉一个 `<span`，导致**每个带语言标记的代码块开头都多显示一行肉眼可见的 `class="language-xxx">`**。现改为先摘出 code 开标签、高亮完再补回。
  2. **f-string 碎片**：`_basic_syntax_highlight` 各步是**串行正则**，后一步会命中前一步插入的 `style="color:#xxx"` 属性值（字符串规则把属性值当字符串再包一层），产出 `<span style=<span style="color:#ce9178">"color:#ce9178"</span>>f…`，**任何含 f-string 的代码都会多出 `"color:#ce9178"` 碎片**。现每步产出的片段存入 `\x00H{i}\x00` 占位符，末尾统一还原。
  3. **围栏被截断**：`preprocess` 的「4 空格缩进 → 自动开代码块」规则不区分是否已在用户手写的 ```` ``` ```` 围栏内，导致 **Python 代码的缩进行被当新代码块、原围栏提前闭合、代码断成两半**（`def` 与 `return` 被拆开）。现新增 `in_fence` 状态跟踪用户围栏，围栏内一律原样保留（**含缩进**）；无围栏的纯缩进行仍照旧自动转代码块。
  - 验证：92 套主题全量渲染 0 标签不平衡；含缩进/f-string/注释/decorator 的 Python 代码块肉眼可见内容无碎片
- **亮底代码块调色板（2026-09-25）**：语法高亮原为固定深底配色，37 套亮底主题（`pre` 背景为浅色）的关键字对比度仅约 2.2:1、发灰读不清。新增 `_SYNTAX_LIGHT` 调色板 + `_is_light_bg()`，按主题 `pre` 背景明暗自动切换（亮底走 VS Code Light+ 系；解析不了的背景按深色处理，不改变未知主题外观）
- **hero 卡片卡面（2026-09-25）**：`_wrap_hero_sections` 的 cards 分支原先**写死 `background-color:#ffffff`**，而暗底主题（`su-deepwater`）的正文是浅色 → 浅字白底不可读。改为按页面底色向墨色靠 7% 派生卡面（`_mix_hex(bg, ink, 0.07)`）：暗底得到亮一档的卡、亮底得到暗一档的卡，一个公式两个方向都成立。实测 su-deepwater 卡面 `#0E1726` → `#1C2534`
- **主题体系（2026-09-25 重构）**：`public/themes/` 原有一批（47 套）设计主题是早期从外部仓库机械适配的，命名 / 描述 / 样式数值沿用外部原值，而该仓库**无 LICENSE = 保留所有权利**，本项目开源即分发存在授权风险。现已整体废弃重写为 `su-*` 原创：`public/themes/` 现为 **92 套 = 45 套早期原创 + 47 套 su-\* 原创**，无 `source` 字段、无旧前缀。
  - **生成链路**：`scripts/theme_specs.py`（47 条设计意图：底色/墨色/强调色/字体气质 + 9 种排版原型 + 布局）→ `scripts/build_themes.py`（字号标尺 / 间距 / 圆角 / 描边 / 列表 / 代码块 / 暗色适配全部由本项目设计系统推导）→ `public/themes/su-*.json`。
  - ⚠️ **改主题方式**：改 `theme_specs.py` 后重跑 `python scripts/build_themes.py`（会覆盖同 id 生成物），**勿手改 su-\*.json**。色带底色直接复用引擎 `_resolve_band_bg`，保证与兜底逻辑一致。
  - ⚠️ **写样式值的坑**：主题 JSON 的值**只放值、不带键名**——`build_style_string` 会自动把 `border_left` 拼成 `border-left:`，值里再带一次前缀会拼出 `border-left:border-left:4px solid …`，浏览器判非法整条丢弃（静默失效）。生成器已按此约束写成 `border_left` + `padding_left` 两个键。
- 所有修改跑 E2E 验证（test_e2e 52/52）+ 集成测试（test_integration 35/35）
- 全系统前后端 E2E：test_api_e2e.py（后端 29 项）+ test_headed_full_e2e.py（前端双页 33 项，0 控制台报错）
- ⚠️ 有头套件的「0 控制台报错」**依赖上游 LLM 可达**：`/api/polish`、`/api/summary` 无本地兜底，上游（如 tokenpool 网关）返 5xx 时浏览器必记 1~2 条 500，套件退出码会是 1。此时先修上游，**不得为凑绿而放宽该判据**
- 有头套件不点的 3 个按钮（真实副作用，刻意避开）：`确认推送` / `保存AI配置` / `测试连接`；其后端路径由 test_api_e2e.py 覆盖。AI 按钮断言「真实产出或真报错」，不用固定 sleep 判"优雅降级"（会把响应慢误判成通过）

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
- 可记录债务：不影响本轮，须说明原因与后续入口（如 `launcher.py` / `start_flask.py` 旧入口未删，见 HANDOFF §7）。
- 无关优化：不进入本轮，禁借机扩大改造。

### 验收规则（须给真实证据）
- 声称完成前必须提供本轮实际运行的命令 / 测试 / 日志 / 截图 / 出图证据。
- 改动跑 E2E（`test_e2e` 52/52）+ 集成（`test_integration` 35/35）；封面相关须实跑 `/api/social/generate` 三引擎（editorial / swiss / mist）出真实 PNG。
- warning / lint / 测试计数漂移 / 文档索引缺失 / 本轮 TODO 按缺陷处理，除非明确记为非本轮债务。
- UI 改动须检查真实渲染（`test_headed_full_e2e` 32/32），不只看代码。

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

## 12. 前端改造方案 v3（2026-09-24 定稿）

- **唯一权威**：`docs/ux-audit/final-plan.html`（链路：走查 `index.html` → 审计 `adversarial-review.html` → 选型 `open-source-picks.html` → 定稿）。**冲突一律以 final-plan 为准**，其余三份为过程记录。
- **⚠️ 前提变更（2026-09-25 拍板）：本项目将开源到 GitHub 给他人使用。**
  因此"个人工具、不加新手引导"的旧结论调整如下：**小红书页**首次进入弹一次使用教程（顶栏「教程」随时重开，两页各自记录看过没）；
  **公众号页**保持安静（操作本就三步）。配图来源说明（Pexels 注册指引）对开源用户必要——他们没有 token 时图可能不贴题。
- **设计前提（三条铁律）**：
  1. **个人工具**，唯一高频用户＝本人 → 不加常驻"新手引导"，只让每天都在用的人更快、更少出错；
  2. 通用能力用成熟开源（**fitty** 文字自适应 / **satori** 去浏览器渲染），业务小逻辑自研（缓存、记忆、文案）；
  3. **每个等待有反馈、每个降级说明原因**（不静默，与 §10 智能排版降级契约同源）。
- **审计实锤（勿再误判）**：
  - 预览卡 `<br>` ＝ **前端 bug**：`templates/index.html:1490` `join('<br>')` + `:1458/:1472` 用 `textContent` 赋值。**成品 PNG 里没有 `<br>`**，别再当成封面渲染问题。
  - 封面溢出根因 ＝ **模板写死字号**（BLCaptain `template-still-paper-card.html:37` `.sp-display{font-size:76px}`），修复落在**引擎层**；且 `blcaptain-style-skill/` 是 vendored 子项目，须"改源 → 重生成 → 跑自带 .mjs 测试"。
  - 生成耗时大头 ＝ 联网搜图（`core/image_search.py` timeout 15–20s）+ 引擎冷启动。治本是缓存/分段计时，**不是写死"约 10 秒"**。
  - 小红书 placeholder「AI 自动提取标题」是**假文案**——实际是本地函数 `extractSocialTitle`，无 AI 参与。
- **明确不做（防止重复讨论）**：首屏三步走常驻引导 / 复制升主按钮＋推送降级 / 92 套主题人工打标签分类 / 非技术用户可用性类验收。
- **实施纪律**：一次一项 → 改完即测（`test_e2e` 52/52 ＋ `test_integration` 35/35；UI 改动加 `test_headed_full_e2e` **33/33**；封面须实跑三引擎出真实 PNG）→ 单项 commit → 回 `files/TODO.md` 打勾。截图基线见 `docs/ux-audit/shots/`（⚠️ 验收脚本每次运行都会重写其中 10 张，跑测后工作区会变脏）。
- **验收脚本计数（2026-09-25 订正）**：`ux_verify_p0` **15/15** · `ux_verify_p1` **15/15** · `ux_verify_tutorial` **13/13**。⚠️ 此前记为「15+13+13」已失效——教程弹窗（后加的产品行为）会遮罩挡住 p0/p1 的点击，两脚本已同步加弹窗关闭处理。
- **实施状态（2026-09-25）**：第一批 U-1…U-6、第二批 U-7…U-11、U-2 真自适应、Pexels 配图与开源教程均已完成（`a4c869e`/`ef5b241`/`48eacf1` 及后续提交）；⚠️ 其中 U-7 的「悬停即试看」已于 **2026-09-26 按用户要求移除**——模板切换改为**仅点击触发**（悬停误触即切换体验不佳）；
  回归全绿（52/52 · 35/35 · 29/29 · 33/33 · 验收脚本 15+15+13）。
- **高级排版落地（2026-09-25，本批）**：激活 13 套 `layout:hero` + 1 套 `layout:timeline` 死配置；新增 4 个模块容器；模块样式改为跟随主题；前端加「插入模块」下拉；**色带可见性修复**（13 套 hero 主题的色带从肉眼看不出提到明显可见，见 §10）。回归 52/52 · 35/35 · 29/29 · 33/33（0 控制台报错），另有有头浏览器目视验收（深色首屏 / 大序号 / 插入模块 / 交替色带 均已确认）。
  - 参考来源与版权：参照 `iniwap/AIWriteX`（**Apache-2.0 + NOTICE 附加限制：未经书面授权禁止分发本项目或其衍生作品**）的成品效果做**纯灵感派生**，未复制其 HTML/CSS/SVG 素材或文案；其 `knowledge/templates/*.html` 是 LLM 成品稿，与本项目「Markdown→结构化 HTML + 主题 JSON 控样式」的架构不同，不可直接搬。
  - **版权已了结（2026-09-25）**：原先 47 套主题的上游仓库**无 LICENSE（= 保留所有权利）**，本项目开源即分发、存在真实风险。现已全部重写为 `su-*` 原创：命名/描述自拟、配色与排版数值由 `scripts/build_themes.py` 的设计系统推导、`source` 字段全清、旧前缀归零，旧主题文件与旧适配脚本一并删除。
  历史记录：第一批 U-1…U-6 **已完成并回归绿**（提交 `a4c869e`）—— `test_e2e` 52/52 · `test_integration` 35/35 · `test_api_e2e` 29/29 · `test_headed_full_e2e` 33/33（0 控制台报错）· `scripts/ux_verify_p0.py` 15/15；封面三引擎实跑出图（改后对照 `docs/ux-audit/shots/after/`）。
  - 落点提示：`fitty` 注入在 `core/guizang_renderer.py`（渲染前 add_script_tag）；BLCaptain 侧因 CLI 无脚本注入口，改为在 `core/blcaptain_bridge.py::_normalize_cover_text` **打断引擎的“前两行拼标题”**（实测有效）。
