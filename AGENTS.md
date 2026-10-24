# AGENTS.md — SuperSu 个人工具项目规则

## 1. 项目定位

SuperSu 是本地化微信公众号自动排版 + 小红书封面生成工具。
核心理念：**纯文本进，排版出。不用 AI 就不开 AI。**

> ⚠️ **方向调整（2026-10-18，苏哥拍板）**：以后**主打 PWA 版**（`pwa/` → https://supersu.ccwu.cc）；**本地 Flask 版（`app.py` + `templates/index.html`）标记弃用、暂不删除**（保留作参考/回退）。引擎真源仍为两版共用：`core/preprocessor.py` + `core/format_engine.py` + `public/themes/`（PWA 由 `node pwa/scripts/build.mjs` 构建时拷入 `pwa/dist/py/`、`pwa/dist/themes/`，**改引擎后必须重跑构建**）；**UI 真源转为 `pwa/src/app.js` + `pwa/src/style.css`**。

- 自动 Markdown 预处理（本地规则，零延迟零费用）
- **164 套**主题自动排版（45 套早期原创 + 119 套 su-* 原创 = 47 初代 + 72 六族；Markdown → 微信内联 HTML）
- 小红书封面生成（双引擎：归藏 Guizang + BLCaptain 9 风格；**自动联网搜真图作底图**）
- AI 功能（润色/摘要/封面图）默认隐藏，按需展开

## 2. Karpathy 四原则

- **多问别猜**：不确定意图或 API 时，立刻提问
- **极简至上**：只写完成需求的最少代码，不设计未来架构
- **手术修改**：只改要求的部分，不顺手重构、不删已有注释、不修改风格
- **目标驱动**：根据成功标准自我验证，告知验证过程和结果

## 3. 架构速查

```
app.py                  Flask 主应用（路由 + SSE + API）——本地弃用版入口，PWA 不经过它
core/
  format_engine.py      排版引擎（164 主题，Markdown → 微信 HTML）
  preprocessor.py       纯文本 → Markdown（纯规则零延迟；四模式 conservative/longform/tutorial/auto，⚠️ 尚无 UI 入口待接线）
  image_search.py       联网搜图（Wikimedia/Pexels 双轨；免 key 默认可用）
  ai_client.py          多平台 LLM 客户端（润色/摘要/排版）
  image_gen.py          AI 封面图生成（LLM 关键词 → 文生图 → PIL 叠加）
  token_manager.py      微信 Access Token 管理（线程安全单例）
  wechat_publisher.py   微信公众号 API（素材上传 + 草稿推送）
  crypto_utils.py       API Key 加密存储（仅本地版；PWA 的 Key 在用户浏览器 localStorage）
  blcaptain_bridge.py   BLCaptain 封面引擎适配层（Node.js，9 风格）
  guizang_renderer.py   归藏封面渲染器（Playwright HTML→PNG，data URI 内嵌底图）
  browser_utils.py      浏览器回退链单真源（系统 Chrome → Edge；launch_browser / open_url）
scripts/
  build_themes.py           原创主题生成器（设计标尺 → 119 套 su-* 主题 JSON）
  theme_specs.py            原创主题的设计意图规格（47 初代 + 72 六族；新主题在这里加一条）
  build_brand_assets.py     品牌 logo 资产生成器（源图 → UI 徽标 + PWA 5 张安装图标）
  theme_stress_audit.py     164 套全量渲染审计（标签平衡/无 None/无残渣）
  ai_structure_smoke.py     AI 结构冒烟（真实 Key，非默认门禁）
  pwa_*_test.py             PWA 专项有头测试（见 §4 测试清单；15 个）
  ux_verify_p0/p1/tutorial.py  UX 验收脚本（15/15 · 15/15 · 13/13）
  run_headed_test.bat       有头套件快捷入口（自起服务，需 5000 空闲）
  legacy/                   历史审计脚本（audit_e2e / gen_review / output-audit）
templates/
  index.html            单页前端（公众号 + 小红书双页面；色卡条 + Lightbox）——仅本地弃用版
public/                 静态资源（原 assets/，由 /assets/* 路由提供）
  brand/                品牌 logo 徽标（**生成物**：`python scripts/build_brand_assets.py`
                        从 docs/brand/logo-source.png 导出，两版共用；勿手改 PNG）
  themes/               164 套排版主题 JSON（45 套早期原创 + 119 套 su-* 原创）
                        ⚠️ su-* 119 套为**生成物**：改 scripts/theme_specs.py 后重跑
                           scripts/build_themes.py 重生成，勿手改 JSON
  theme-thumbs/         主题缩略图（生成物；PWA 模板库消费）
  cover-templates/      归藏封面模板
  images/               封面库存图（最终兜底）
  screenshot-backgrounds/  封面截图背景素材
  social-thumb/         模板缩略图
  vendor/               前端内联依赖（modern-screenshot.js / fflate.min.js，PWA 封面与九宫格用）
pwa/                    ★ 主产品（PWA 版，线上 supersu.ccwu.cc）
  index.html            单页外壳（203 行；面板/DOM 由各模块自建）
  version.json          语义化版本（发版时手动 bump；build 字段由构建注入 = git 提交数）
  src/
    app.js              主交互（编辑器/预览/主题抽屉/AI 面板接线）
    ai.js               AI BYOK：AI_PLATFORMS 平台预设 + 配置存取 + 润色/摘要/结构规划
    bridge.js           主线程 ↔ Pyodide Worker 桥
    engine.worker.js    Pyodide 运行时（core/ 引擎副本在 dist/py/）
    export.js           导出四件套（长图 PNG / HTML / Markdown / 图片 ZIP）
    images.js           外链图本地化（data URI 内嵌）
    nine.js             九宫格切图（fflate 按需加载）
    light.js            轻量即时预览
    style.css           全部样式（含 .ai-field / 抽屉让位等）
    cover/              小红书封面（catalog/render/search/index 等，modern-screenshot 单管线）
    update/             更新模块（index/ui/changelog/update.css；静默自动升级 + 小提示）
  public/               sw.js（SW + 缓存分层）/ changelog.json（生成物）/ manifest / icons / fonts / runtime/
  scripts/              build.mjs（构建+断言）/ deploy.sh / gen_changelog.py /
                       changelog_milestones.json / fetch_fonts.py / make_icons.py / smoke.py
  dist/                 构建产物（gitignore，勿手改；node pwa/scripts/build.mjs 生成）
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
start-app.bat                    # 双击即用：自动建 venv/装依赖 → 起服务 → 开浏览器
python app.py                    # http://127.0.0.1:5000（等效，需自己先激活环境）
# ⚠️ start-app.bat 的三条硬约束（改动前必读；2026-09-26 / 10-13 因这些踩过坑）：
#   1) 全程用 %~dp0 拼绝对路径调用 .venv\Scripts\python.exe，**不要用 activate.bat**——
#      其内部写死创建时的绝对路径，项目一换目录就失效 → python 落到系统解释器
#      → 报 No module named 'flask'。.venv 换目录后可用
#      `<基础解释器> -m venv .venv` 原地重建激活脚本（不加 --clear，已装包会保留）。
#   2) *.bat / *.cmd **必须 CRLF 换行**（已由 .gitattributes 的 eol=crlf 锁定）。
#      裸 LF 会让 cmd 解析错乱、把行切成半截命令，表现为窗口一闪或一堆
#      `'xxx' is not recognized`。
#   3) **bat 内不写中文（保持纯 ASCII）**，判断逻辑不依赖 `>nul` / `2>nul` 设备重定向。
#      cmd 会错位解析含多字节字符的 bat 行、吃掉下一行行首（2026-10-13 实锤，见变更 17）；
#      设备重定向在部分机器上间歇性报「系统找不到指定的路径」并污染退出码。
#      bat 不再下载 Chromium——封面渲染用系统 Chrome（缺失回退 Edge，core/browser_utils.py）。
#      中文启动提示由 app.py 打印。

# 测试
python tests/test_e2e.py         # E2E（Flask test_client，无需起服务）— 74/74 通过
python tests/test_integration.py # 集成测试（需先启动服务）— 35/35 通过
python tests/test_api_e2e.py     # 后端 API 全端点 E2E（自起服务，29 项）— 29/29 通过
python tests/test_headed_full_e2e.py  # 前端有头全按钮 E2E（双页全量，33 项）— 33/33 通过
                                      # 快捷入口：scripts/run_headed_test.bat（自起服务，需 5000 空闲）
python tests/test_headed_userflow.py  # 有头用户流程（需先启动服务，7 项）— 7/7 通过
python tests/test_headed_wechat_copy.py  # 有头复制/推送/封面旧资产（自起服务，12 项）— 12/12 通过
python tests/test_headed_pm_audit.py   # 产品经理视角有头全流程审计（16 类场景语料 + 逐元素覆盖，
                                       # 输出 output/pm_audit/audit.json + report.html）。⚠️ 这是**审计套件**：
                                       # 失败项即「发现的问题」，有问题就退出码 1（不用它当门禁）
python tests/test_headed_audit_fixes.py  # 2026-10-18 审计修复专项（18 项，自起服务）— 18/18 通过
                                       # 覆盖：看示例撤销、清空空态/撤销、真草稿、整理格式保缩进、
                                       # Ctrl+Enter 复制（读剪贴板）、抽屉关闭、500 字提示、生成失败态

# PWA 专项（线上站，系统 Chrome 有头）
python scripts/pwa_offline_test.py     # 断网可用性 — 10/10 通过
python scripts/pwa_incremental_test.py --phase 1 --clean  # 增量更新阶段1快照
python scripts/pwa_incremental_test.py --phase 2          # 换一个文件重新部署后跑，验证 6/6
python scripts/pwa_s1s3_test.py        # 首屏不阻塞 + AI 面板/润色/排版/摘要（mock 接口）9/9
python scripts/pwa_payload_probe.py    # 首次/二次/离线 传输量实测（输出 output/pwa_payload）
python scripts/pwa_timeline_probe.py   # 首访里程碑（FCP/主题/引擎就绪）
python scripts/pwa_light_preview_test.py  # 轻量即时预览 6/6（实测首访约 2.5s 出近似排版；门限 15s）
python scripts/pwa_template_ux_test.py    # 模板库 5/5（缩略图/不遮挡/连续对比/版本/底栏移除）
python scripts/pwa_theme_drawer_test.py   # 模板库全量审计 43/43（8 族 83 色调 + 164 套逐个应用 + 纯文字换色可见 + 版式×色调二维 + 移动端）
python scripts/pwa_ai_format_test.py      # AI 排版 27/27（门控 / 四种降级兜底 / 六项结构 / 撤销 / 配置失效，全 mock 不联网）
python scripts/pwa_ai_preset_test.py      # AI 平台预设 21/21（下拉 4 预设+自定义 / 选中自动填地址+模型 / 只填 Key 即通 /
                                          # 模型可手改 / 老配置按地址反查回显 / 门控与 verified 契约不变）
python scripts/ai_structure_smoke.py --file tests/fixtures/txt-format-lab.txt
                                          # 真实 Key 冒烟（读本地 .env，非默认门禁；夹具 100 段，校验正文零丢失）
python scripts/pwa_release_card_test.py   # 更新「发布小票」9/9（版本徽标 `v版本 · b构建号` / 亮点分类 / 查看全部；
                                          # #upd-demo 可预览；SUPERSU_URL 可指向本地 dist 做部署前预检）
python scripts/pwa_auto_update_test.py    # 静默自动更新 8/8（本地 dist 真 SW：改写探针 sw.js 触发新版本 →
                                          # 自动应用并刷新、全程无大卡片、右下角「已升级」小提示 8s 消失）
python scripts/pwa_export_test.py         # PWA 导出有头 12/12（长图 PNG / HTML 自包含 / Markdown / 图片 ZIP / 移动端不溢出）
python scripts/pwa_image_localize_test.py # PWA 外链图本地化 12/12（渲染后抓取转 data URI；失败必给原因）
python scripts/pwa_cover_test.py          # PWA 封面有头 16 项（15 PASS + 1 SKIP 网络）/ 12 风格 / 3 尺寸 / 上传 / 搜图 / 断网生成
python scripts/pwa_nine_test.py           # PWA 九宫格切图 15/15（真下载 ZIP 解包读像素：裁剪/顺序/间距/移动端）
python scripts/pwa_online_e2e.py          # 线上全量有头 E2E 94 项（91 PASS + 3 SKIP）
python scripts/pwa_offline_diag.py        # 断网诊断脚本（非门禁：排查离线可用性用）

# PWA 架构要点（2026-10-18 提速/静默更新改造）
# · Pyodide 同源自托管在 pwa/public/runtime/pyodide/0.28.3（5 个文件 12.1MB；CF 单文件上限 25MB）。
#   换版本：改目录名 + pwa/src/engine.worker.js 的 PYODIDE_VERSION；构建会拷进 dist/runtime。
# · SW 缓存分层：shell-<BUILD_ID>（版本化）/ store-runtime（Pyodide）/ store-data（?h=sha256）/ store-media。
#   BUILD_ID 与数据清单由 build.mjs 注入 sw.js；清单内联（不联网取），SW 被回收后离线重启也不会失效。
# · AI 是**纯前端 BYOK**：配置存 localStorage `supersu.ai`，直连 OpenAI 兼容接口；
#   只支持允许浏览器直连的平台（DeepSeek / Moonshot / SiliconFlow / OpenAI），智谱等会 CORS 失败。
#   **平台预设（2026-10-24 AI-PRESET）**：AI 面板 = 平台下拉（4 预设 + 自定义）→ 选中自动填
#   接口地址 + 默认模型（模型仍可手改）→ 用户只填 API Key → 测试连接。预设单一真源在
#   `pwa/src/ai.js` 的 `AI_PLATFORMS`（加平台只改这一处）；打开面板时按已存接口地址反查预设回显
#   （老配置无 platform 字段也能正确回显；非预设地址回落「自定义」）。
# · AI 能力门控（2026-10-24）：三项配置齐全 + **「测试连接」通过**（`supersu.ai.verified`，配置一改即失效）
#   才显形「AI 排版」入口；未接入时页面纯本地、不发任何 AI 请求。「AI 推荐主题」已下线（价值低）。
#   AI 排版只出结构决策 JSON（title/sections/lists/bold/splits/merges/tables/callouts/hrs/pullquotes），
#   正文一字不改；未配置/HTTP 失败/非 JSON/空结构 → 本地 preprocess 兜底并说明原因；支持一键撤销。
#   ⚠️ 真实 Key 只放本地 `.env`（已 gitignore，不进部署产物）；线上仍由用户自己填。
# · 更新（2026-10-24 用户要求：静默自动）：打开 3s 后主动查 → 后台下载 → **自动应用**
#   （另有每小时定时查 + version.json 独立轮询两条线索，见 pwa/src/update/index.js）
#   （不可见 / 空稿 / 30s 无输入且失焦 → 立即；用户一直在打字也最多等 30s，reload 前先落盘草稿）
#   → 升级完成只在右下角弹小提示「已升级到 vX · bN」（8s 自动消失，点它看更新记录）。
#   大卡片「发布小票」**只在 `#upd-demo` 预览**，正常流程不需要用户确认。
#   `?reset-sw` 注销 SW + 清本站缓存并重载（卡住时的自救开关）。
# · 首屏不阻塞：`#boot` 是底部自适应小条（胶囊、pointer-events:none），引擎没就绪也能先输入。
# · 模板库抽屉：打开时 `body.browsing` → 桌面端主区 `padding-right:500px` 让位（不遮挡预览）、
#   编辑器收起、抽屉 500px；<900px 仍是浮层。**选模板不关闭抽屉**（可连续对比）。
#   **族视图为「版式 × 色调」二维选择**（2026-10-24）：顶部 8 个版式胶囊切族、**保留同名色调**
#   （素页·竹青 → 卷宗·竹青；目标族无该色调时回落第一套）；族视图隐藏重复的家族 chip，只留「全部/收藏」。
# · 版本号规则（2026-10-24 修正）：**语义化版本在 `pwa/version.json` 手动 bump，只发版时改**；
#   `build` = git 提交数，由 build.mjs 注入 dist/version.json。**更新检测比 version 或 build 任一变大**
#   （旧实现只比 version → 版本长期不 bump 时永远判「已最新」，用户看不到更新）。
#   徽标（发布小票 / 更新记录面板）统一显示 `v1.5.0 · b147`。发版两件事缺一不可：
#   ① bump `pwa/version.json` ② 在 `pwa/scripts/changelog_milestones.json` 加一条（`until` 为右闭边界），
#   否则更新记录里不会出现该版本条目。
# · 更新卡是「发布小票」：版本徽标 + 日期 + 3 条亮点（按文案自动标 新功能/优化/修复）+ 查看全部；
#   `#upd-demo` 可随时预览该卡（不影响真实更新流程）。
# · 预览里已移除「写留言/赞/在看」模拟底栏（PWA；Flask 本地版预览仍保留，随弃用不再跟进）。
# · 品牌 logo：源图 docs/brand/logo-source.png → scripts/build_brand_assets.py → public/brand（UI 徽标）
#   + pwa/public/icons（5 张安装图标）；构建把 public/brand 拷进 dist/brand，**两版共用同一份资源**。
#   本地版引 /assets/brand/*，PWA 引 ./brand/*（顶栏 / 启动条 / 更新入口 / 发布小票 / 更新记录头部 / 关于弹窗）。
# · 轻量即时预览：引擎未就绪时用 marked(12KB br) + 主题 styles 出近似排版，badge 标「快速预览」，
#   **复制按钮锁到精确结果**；引擎空闲时启动，就绪后原地替换。
# · 小红书封面（2026-10-19）：`pwa/src/cover/*` + `public/cover-templates`（构建时清洗 10 套）
#   + `public/vendor/modern-screenshot.js`（MIT，离屏 iframe → PNG）。12 风格 =
#   归藏 2（editorial/swiss，3 尺寸 3:4 / 1:1 / 21:9）+ 模板 10（仅 3:4）。
#   底图三选一：纯色 / 上传 / Wikimedia Commons 免 key 搜图（API 与图片 CDN 均 CORS `*`；
#   中文关键词走内置场景词表映射成英文，国内不可达时提示改用上传）。
#   中文字体为 Noto 子集（`pwa/public/fonts/cover/`，GB2312 一级 + ASCII，4 字重 2.39MB），
#   由 `scripts/build_cover_fonts.py` 生成；`cover-fonts.css` 只在封面页按需加载，
#   不参与首屏字体预缓存。⚠️ 新增封面模块要同步 `sw.js` SHELL_OPTIONAL 与 `build.mjs` SHELL_FILES。
# · 九宫格切图（2026-10-24，B2 #7）：`pwa/src/nine.js` 纯 Canvas 3×3 切图（方形居中裁剪、
#   间距 0–20px、逐行/蛇形），ZIP 用 `public/vendor/fflate.min.js`（MIT，store 级，首次下载才注入）。
#   入口：封面结果卡「九宫格」按钮 + 封面页头「九宫格切图」上传；输出固定 `nine-01..09.png`。
# · 批量导出图片（2026-10-24，B2 #20）：导出菜单「图片 ZIP」→ `exportImages`（export.js）收集正文全部
#   `<img>`（data URI 直解 / 相对与 http 先经 ensureLocalizedForExport）→ fflate 打包 `img-01..`。
#   坏图跳过并在 toast 写明原因（按 URL 去重），无图直接报错；上限 60 张 / 单图 8MB / 累计 60MB。
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

# 部署（PWA 主站 → Cloudflare Pages 项目 supersu-pwa → https://supersu.ccwu.cc）
# 铁律（§11）：deploy.sh 有硬预检 —— 已跟踪文件必须干净、HEAD 必须已含在 origin/main，否则直接中止。
# ⚠️ 本机默认 `bash` 是 C:\Windows\system32\bash.exe（WSL），跑 deploy.sh 会误报
#    「找不到凭证文件 /e/test/opendoor/.env」。必须显式用 Git Bash：
#      & "C:\Program Files\Git\bin\bash.exe" pwa/scripts/deploy.sh
#    凭证从 E:/test/opendoor/.env 读取（不落盘副本、不回显）。
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
| GET | `/api/social/progress/<task_id>` | 封面生成进度（阶段展示；图在 POST 响应里直接返回） |
| GET | `/api/social/styles` | 小红书风格列表（含 group） |
| GET | `/api/pexels-config` | Pexels Key 是否已配置（不返回 Key 本身） |
| GET | `/api/social/thumbnails` | 模板缩略图列表 |
| GET | `/api/history` | 推送历史 |
| GET | `/temp_covers/<filename>` | 临时封面图（AI 标题图） |
| GET | `/output/<path:filepath>` | 封面渲染产物 |
| GET | `/assets/<path:filename>` | public/ 静态资源 |
| POST | `/open-folder` | 打开本地文件夹 |

## 6. 公众号页面关键元素（2026-10-18 重设计：贴边三段式 + 解析条 + 风格条）

```
.topbar                  → 贴边白 chrome（56px，底部 1px）：.logo（品牌 logo 徽标 + SuperSu 公众号编辑器）+ .tab-btn
                           （公众号排版 | 小红书封面，active 底部朱砂条）+ 教程 / 设置
#page-wechat
  .workspace             → 主区 flex 双栏（无 gap，1px 分隔）
    .col-text            → 左栏 620px：.editor-header 48px
                           （#btn-clear 清空 / #btn-insert 插入 popover / #btn-demo 看示例）
                           + .editor-area（#input-area，Markdown 源码，flex-1）+ .parse-bar 44px
      .parse-bar         → 识别结构 chips（#parse-chips，纯展示 span）+ #tidy-hint 整理结果瞬态
                           + #btn-format 整理格式
                           ⚠️ 2026-10-18：「智能转换」#sw-chip 是假开关（无 paste 实现）已下线；
                           「导入文档」#btn-import 是占位按钮已下线
    .col-divider         → 1px 分隔线
    .col-preview         → 右栏：.preview-header 48px（.pv-btn 网页HTML|手机预览 分段 + #theme-chip 当前风格胶囊）
                           + .preview-content 舞台（#preview-frame，手机模式 375×min(600,100%)）
                           + .tpl-bar 风格条 104px
      .tpl-bar           → #tpl-search 紧凑筛选 + #tpl-toggle 收起 + #btn-all-tpl 全部 164 套
                           + #tpl-strip 最近使用胶囊（.tpl-card 含 .swatch/.tname/.tpl-fav）
  .footbar               → 底栏 64px：#foot-status（真实草稿状态：尚未保存 / 已保存 · HH:MM /
                           本地保存失败）+ #foot-count 字数/结构 + #ai-toggle
                           + #btn-history 历史 + #btn-push 推送草稿箱（secondary）+ #btn-copy 复制（唯一 primary）
                           ⚠️ 草稿落盘 localStorage `supersu.draft.v1`（input 500ms 防抖 + pagehide +
                              visibilitychange + doRender 前），刷新自动恢复；清空也会写空草稿
  .ai-panel              → AI 工具面板（默认收起，功能保留）
  .drawer#drawer-tpl     → 模板库抽屉 560（#drawer-search + #family-chips 六族 + #drawer-grid 两列卡片）
  .popover#popover-insert→ 插入模块（10 项，光标处插入 ::: 围栏）
  .dialog#dialog-copy    → 手动复制指引（剪贴板降级第三级）
  .dialog#dialog-error   → 渲染错误浮层
  ⚠️ 后向兼容契约（勿删）：#tpl-strip（风格胶囊容器）/ .tpl-card + .tname / .tpl-bar(class) /
     #tpl-toggle（切换 .tpl-bar.collapsed）/ #tpl-search —— 三套有头测试依赖
  ⚠️ 加载即自动选中上次主题（localStorage supersu.lastTheme，缺省首套）→ 输入即渲染
  ⚠️ 解析条统计源 = /api/render 返回的 markdown（引擎识别结果），不是编辑器原文
  ⚠️ 复制写入 text/html（ClipboardItem）；非安全上下文走 execCommand；再失败弹 #dialog-copy 手动指引
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
5. python tests/test_headed_full_e2e.py     ← 前端有头全按钮 E2E（双页 33 项）
6. 检查 output/ 目录                        ← 验证封面生成
```

## 9. 已知注意事项

- **PWA 封面**（2026-10-19）：纯前端 `modern-screenshot` 生成，不依赖 Flask/Playwright；模板 10 套来自 AGPL-3.0 上游（已在 `THIRD_PARTY_NOTICES.md` 声明），构建时去掉 Google Fonts 并把示例文案替换为占位符。**Wikimedia 图库以纪实照片为主**，中文关键词靠场景词表映射，国内网络可能不可达——失败时必须提示改用上传/纯色，不得静默。
- 封面渲染统一走 `core/guizang_renderer.py`；**浏览器内核优先系统 Chrome、缺失回退 Edge（零下载）**——回退链单真源 `core/browser_utils.py::launch_browser`（bundled Chromium 只作兜底），BLCaptain（Node 侧）经 `CHROMIUM_PATH` 注入系统浏览器（`core/blcaptain_bridge.py` 每次调用 Node 时注入）。旧 `scripts/render_worker.py` 双份实现已删除
- ⚠️ **`.bat` 必须 CRLF + 纯 ASCII**：`.gitattributes` 已锁 `*.bat` / `*.cmd` 为 `eol=crlf`。裸 LF 会解析错乱（2026-09-26 双击完全不可用）；**UTF-8 中文（chcp 65001 下）会令 cmd 错位吃行首、满屏 `'xxx' is not recognized`**（2026-10-13 实锤，见 HANDOFF 变更 17）。`start-app.bat` 现为纯英文文件，中文启动提示由 `app.py` 打印
- ⚠️ **venv 不能靠 `activate.bat` 定位自己**：激活脚本里写死了创建时的绝对路径，项目换目录后激活会静默失效（`VIRTUAL_ENV` 指向旧路径、`python` 落到系统解释器）。脚本一律用绝对路径调 `.venv\Scripts\python.exe`
- `scripts/start_flask.py` / `launcher.py` 旧入口**已删除**（2026-10 审计确认全仓零引用后移除）；真实入口是 `app.py` / `start-app.bat`
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
- **解析/渲染加固（2026-10-18，压力审计后按 1B/3C/4A 决策修复）**：
  - `core/preprocessor.py` 8 处：① 纯分隔线（整行只由 `=`/`-`/`—` 组成）→ `<hr>`，不再产出 `## =` 假标题；② 短标签行**保留结尾冒号**（不再吞字）；③ 阿拉伯数字「连续有序列表」**保留原序号**（不再重排成 `1.` 或标题化）；④ 嵌套列表**保留行首缩进**；⑤ 含 `|` / 以 `<` 开头 / `$$` 公式块不判标题；⑥ `_BULLET_RE` 要求符号后跟空白（`**加粗**` 不再被拆成 `- *加粗**`）；⑦ 步骤行「步骤一：…」**保留标签文字**；⑧ 箭头行「标签：内容 → A → B」不误拆为清单
  - `core/format_engine.py`：`md_to_html` 出口统一做 `sanitize_raw_html`（决策 4A 渲染层安全清洗）——危险标签（script/style/iframe/object/embed/form/…）/ 事件属性（`on*`）/ 危险协议 URL（`javascript:` / `vbscript:` / `data:text/html`）渲染前清除，正常标签与内联 style 保留
  - `scripts/build_themes.py`：字号标尺**整体对齐业界调研比例**（交接文档 §4：四来源一致口径 = 正文 15–16 / h1 18–22 / h2 16–18）——`SCALE` 由 h1 25 / h2 20 / p 16 改为 **h1 22 / h2 18 / h3 16 / h4 15 / h5 14 / h6 13 / p 15**（正文取业内最推荐的 15px；13px 只留给 h6 与注释级）。改这一处重跑 `build_themes.py` 即 119 套全量生效，可逆
  - 主题对比度（1B / 审计 P1-7）：`scripts/theme_stress_audit.py` 的 `contrast_ink_bg` 原拿 `colors.primary` 当「正文墨色」，对早期原创主题（其 `primary` 是品牌/标题色）**误报**——已改取真实的 `styles.p.color`；真实有问题的只有 `sunset-amber` / `wechat-native` 两套代码块前景（已加深）。渲染审计 156/164 → **164/164**
  - ⚠️ 两条**刻意不修**：夹具 §13 箭头行「导入 TXT → … → 复制到公众号」同时被「原文保真 H01」（要保留箭头）与「转列表 S25」（要拆成分行）要求，**物理互斥**，本轮保留 S25；诗词分层（S22 = P2-3）不在 P0+P1 范围
  - 45 套早期原创主题（非 `su-*`）**字号已对齐业界标尺**（决策 B，2026-10-18）：只改 `h1–h6 + p + list_item_text` 的字号（h1 22 / h2 18 / h3 16 / h4 15 / h5 14 / h6 13 / p 15），**其余定制样式（渐变 / 阴影 / 字重 / 字距 / 字族）原样保留**；至此 164 套正文统一 15px。⚠️ 它们**未纳入 `build_themes.py`**（非 spec 驱动），以后再调字号需直接改 JSON 或另写脚本。
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
- **主题体系（2026-09-25 重构）**：`public/themes/` 原有一批（47 套）设计主题是早期从外部仓库机械适配的，命名 / 描述 / 样式数值沿用外部原值，而该仓库**无 LICENSE = 保留所有权利**，本项目开源即分发存在授权风险。现已整体废弃重写为 `su-*` 原创：`public/themes/` 现为 **164 套 = 45 套早期原创 + 119 套 su-\* 原创**（47 初代 + 72 六族，见下条），无 `source` 字段、无旧前缀。
  - **生成链路**：`scripts/theme_specs.py`（设计意图：底色/墨色/强调色/字体气质 + 排版原型 + 布局；六族 72 套只声明「族 × 色调」组合）→ `scripts/build_themes.py`（字号标尺 / 间距 / 圆角 / 描边 / 列表 / 代码块 / 暗色适配 / 族级技法补丁全部由本项目设计系统推导）→ `public/themes/su-*.json`。
  - ⚠️ **改主题方式**：改 `theme_specs.py` 后重跑 `python scripts/build_themes.py`（会覆盖同 id 生成物），**勿手改 su-\*.json**。色带底色直接复用引擎 `_resolve_band_bg`，保证与兜底逻辑一致。
  - ⚠️ **写样式值的坑**：主题 JSON 的值**只放值、不带键名**——`build_style_string` 会自动把 `border_left` 拼成 `border-left:`，值里再带一次前缀会拼出 `border-left:border-left:4px solid …`，浏览器判非法整条丢弃（静默失效）。生成器已按此约束写成 `border_left` + `padding_left` 两个键。
  - **色调可见化（2026-10-24）**：素页/卷宗/信笺三族的 h1 增加 2px 本族强调色下划线（其余族本已通过阴影/字色/底色体现色调）。重生成仅 36 套变化、只动 `styles.h1.border_bottom` / `styles.h1.padding_bottom`；写文件必须显式 `newline="\n"`，否则 Windows CRLF 会让 119 套全部变成假改动。
- **六族 · 十二色新增（2026-10-13）**：主题 92 → **164 套**，新增 6 套族级风格系统 × 12 色调 = 72 套（钢印·新粗野 / 素页·极简 / 卷宗·商务 / 信笺·文艺 / 夜航·科技 / 庙会·节庆）。
  - **链路**：族级技法补丁与颜色推导都在 `build_themes.py` 的 `FAMILIES` / `FAMILY_TONES`（accent = 色调色相 × 族级饱和·明度基线，HSL 推导；暗底族同表 `dark=True`）；`theme_specs.py` 末尾只声明「族 × 色调」组合与命名/描述。
  - **版权路线（灵感派生，勿改口径）**：品类观感参照 [mspringjade/wechat-formatter](https://github.com/mspringjade/wechat-formatter)（TypeZen，**AGPL-3.0 + README 附加非商用条款**）。该许可对本项目「开源分发」的代价是整体 AGPL 化 + 非商用 + 署名，故**不移植其代码**：其模板引擎的 CSS 数值、12 色调命名、文案一律未复制；本批族名（钢印/素页/卷宗/信笺/夜航/庙会）、色调词（朱砂/柿橙/麦金/竹青/茶青/湖蓝/藏蓝/青莲/紫藤/粉黛/铁灰/栗棕）、色值与描述均为本项目自拟/推导。同 AIWriteX 先例（§12「纯灵感派生」）。
  - **回归锚点**：重跑生成器后既有 47 套 su-* JSON **字节零改动**；164 套全量富样本渲染审计（标签平衡 / 无 None·空 style·拼接残渣）全过；四套件 52/52 · 35/35 · 29/29 · 33/33（0 控制台报错）。
- **暗底主题表格斑马纹修复（2026-10-13，六族验收暴露）**：`inject_inline_styles` 的斑马纹原为硬编码浅灰 `#f9f9f9`，压在暗底主题上浅字行读不出来（既有全部暗底主题同样受影响）。现按页面底色明暗派生：亮底沿用浅灰（**渲染输出字节不变**，实测 4 套亮底主题前后哈希一致）；暗底从底色向白微混 6%（夜航族表格读数恢复，`<tr style="">` 归因说明见审计脚本 `output/theme-review/gen_review.py`）。
- **首行 = 文章大标题（2026-10-18 修订）**：`preprocess` 末尾的「首行提升」原实现遇到**已被规则标成 `##` 的首行**会因 `s.startswith('#')` 直接跳过 → 「短标题开头」的文章**全文没有 H1**，预览最大标题只有 h2、层级被压平，识别结构条的「大标题」恒为 0。现规则：首行是普通标题文本 → 直接加 `#`（各非保守模式，沿用原行为）；首行已被规则标为 `##~######` → 升为 `#`（**仅 `auto`/`longform`**；`tutorial` 首行多是「准备工作」这类小节标签，不强升）。例外：① 原文首行本身是手写 Markdown 标题（`## 保留标题`）→ 尊重作者显式层级不动；②「标签：值」行（`联系部门：公关部`）不提升 —— 与 `_looks_like_title`/短行标题检测的既有判定一致。回归：`test_e2e` **74/74**（其中 3 条断言按新行为更新：short_heading / numbered_heading / multi_style_sections）
- **格式兼容扩展（2026-10-19，方案 B）**：`core/preprocessor.py` 新增一批**确定性**识别，夹具入库 `tests/fixtures/txt-format-lab.txt`（`scripts/theme_stress_audit.py` 断言 34 → 40）。新增：GFM 任务清单 `- [ ]`/`- [x]` → ☐/☑；`NN｜` 章节标记 → `##`（含带冒号的 06/12，此前因「含 `：` 不当标题」而漏）；**无分隔行的竖线表整表规整**（补首尾竖线 + 补表头分隔行——python-markdown 的 tables 扩展要求行首 `|`）；空格/全角空格对齐表 → 管道表；`~~~` 围栏；GFM Alerts `> [!NOTE]` → `> 【提示】`；admonition 别名 `::: tip/note/warning/danger/details` → 复用 `:::summary[中文标签]`；`【提示】【注意】…` → 引用块。**改口径**：`（1）（2）` 不再一律当四级标题（夹具 §04 明确「看起来像列表，但未必是列表」）→ 永不判标题、保持原文行。**刻意不做**：Setext 下划线标题（与既有 `===`/`---` 分隔线行为互斥）、文本清理（pangu/全角，默认关=不做）、公式渲染（只保留原文）。⚠️ 表格类规则必须让表格**自成一块**（生成前补一个空行），否则会与上一行文字并入同一段落、表格不成立（本轮实测踩到并修掉）。
- **代码块 `&nbsp;`**：渲染后的代码块缩进与空格是 `&nbsp;`（视觉正常、粘贴到公众号也正常），断言比对预览文本时必须先把 `\u00a0` 归一到空格，否则会出现「代码内容丢失」的假失败
- **列表无 `<li>`**：`convert_lists_to_sections` 会把 `- 项` 渲染成 `<section><span>•</span>…</section>`，校验列表要看识别结构条的「列表 ×N」或 bullet 字符，不能数 `<li>`
- 所有修改跑 E2E 验证（test_e2e 74/74）+ 集成测试（test_integration 35/35）
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
- 可记录债务：不影响本轮，须说明原因与后续入口（旧入口类债务应在确认零引用后删除，不留 `_old` 尸体）。
- 无关优化：不进入本轮，禁借机扩大改造。

### 验收规则（须给真实证据）
- 声称完成前必须提供本轮实际运行的命令 / 测试 / 日志 / 截图 / 出图证据。
- 改动跑 E2E（`test_e2e` 74/74）+ 集成（`test_integration` 35/35）；封面相关须实跑 `/api/social/generate` 三引擎（editorial / swiss / mist）出真实 PNG；PWA 封面改动须跑 `scripts/pwa_cover_test.py`（16 项，含断网生成）；改动封面页交互还须跑 `scripts/pwa_nine_test.py`（15/15）。
- warning / lint / 测试计数漂移 / 文档索引缺失 / 本轮 TODO 按缺陷处理，除非明确记为非本轮债务。
- UI 改动须检查真实渲染（`test_headed_full_e2e` 33/33），不只看代码。

### Git 边界
- 禁止 `git add .`；只 stage 本任务相关文件。
- 嵌套仓库 `blcaptain-style-skill/` 与父仓分别审计、分别提交，勿将其改动吸入父仓。
- `.env`、`data/`（含加密 AppSecret）、`.workbuddy/`、`output/`、`uploads/`、`blcaptain-style-skill/` 已被 gitignore，禁止 force-add。
- dirty worktree 中不回滚 / 覆盖 / 吸入用户未授权改动。
- ⛔ **铁律（2026-10-18）：部署到服务器的一律先同步 git**——凡「已部署 / 准备部署到服务器」的内容（PWA 构建产物、`pwa/public/*`、品牌与静态资源、主题、脚本等），其**源码必须先 commit 并 push**，做到 `HEAD` 已包含在 `origin/main` 里、且工作区无未提交改动；**禁止「只在本地改 / 只在服务器上改、git 没有对应提交」的状态**。落地点：`pwa/scripts/deploy.sh` 部署前做 git 预检（工作区脏 / HEAD 未推送 → 直接中止）。

### 文档分层与回写
- 内部真源：`AGENTS.md` / `MEMORY.md` / `HANDOFF.md` / `CLOSURE.md`；外部用户：`README.md`。
- 改代码 / 接口 / 配置 / 架构边界 / 用户行为后，必须同步对应文档（含本文件与 README 测试计数）。
- 单任务结束执行 `CLOSURE.md` 收尾程序（更新文档、受控提交）。**不再新建 `docs/task_closure_*.md`**，全部并入 `CLOSURE.md`（见 `docs/project-conventions.md`）。

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
- **明确不做（防止重复讨论）**：首屏三步走常驻引导 / 复制升主按钮＋推送降级 / 164 套主题人工打标签分类 / 非技术用户可用性类验收。
- **实施纪律**：一次一项 → 改完即测（`test_e2e` 74/74 ＋ `test_integration` 35/35；UI 改动加 `test_headed_full_e2e` **33/33**；封面须实跑三引擎出真实 PNG）→ 单项 commit → 回 `files/TODO.md` 打勾。截图基线见 `docs/ux-audit/shots/`（⚠️ 验收脚本每次运行都会重写其中 10 张，跑测后工作区会变脏）。
- **验收脚本计数（2026-09-25 订正）**：`ux_verify_p0` **15/15** · `ux_verify_p1` **15/15** · `ux_verify_tutorial` **13/13**。⚠️ 此前记为「15+13+13」已失效——教程弹窗（后加的产品行为）会遮罩挡住 p0/p1 的点击，两脚本已同步加弹窗关闭处理。
- **实施状态（2026-09-25）**：第一批 U-1…U-6、第二批 U-7…U-11、U-2 真自适应、Pexels 配图与开源教程均已完成（`a4c869e`/`ef5b241`/`48eacf1` 及后续提交）；⚠️ 其中 U-7 的「悬停即试看」已于 **2026-09-26 按用户要求移除**——模板切换改为**仅点击触发**（悬停误触即切换体验不佳）；
  回归全绿（52/52 · 35/35 · 29/29 · 33/33 · 验收脚本 15+15+13）。
- **高级排版落地（2026-09-25，本批）**：激活 13 套 `layout:hero` + 1 套 `layout:timeline` 死配置；新增 4 个模块容器；模块样式改为跟随主题；前端加「插入模块」下拉；**色带可见性修复**（13 套 hero 主题的色带从肉眼看不出提到明显可见，见 §10）。回归 52/52 · 35/35 · 29/29 · 33/33（0 控制台报错），另有有头浏览器目视验收（深色首屏 / 大序号 / 插入模块 / 交替色带 均已确认）。
  - 参考来源与版权：参照 `iniwap/AIWriteX`（**Apache-2.0 + NOTICE 附加限制：未经书面授权禁止分发本项目或其衍生作品**）的成品效果做**纯灵感派生**，未复制其 HTML/CSS/SVG 素材或文案；其 `knowledge/templates/*.html` 是 LLM 成品稿，与本项目「Markdown→结构化 HTML + 主题 JSON 控样式」的架构不同，不可直接搬。
  - **版权已了结（2026-09-25）**：原先 47 套主题的上游仓库**无 LICENSE（= 保留所有权利）**，本项目开源即分发、存在真实风险。现已全部重写为 `su-*` 原创：命名/描述自拟、配色与排版数值由 `scripts/build_themes.py` 的设计系统推导、`source` 字段全清、旧前缀归零，旧主题文件与旧适配脚本一并删除。
  历史记录：第一批 U-1…U-6 **已完成并回归绿**（提交 `a4c869e`）—— `test_e2e` 52/52 · `test_integration` 35/35 · `test_api_e2e` 29/29 · `test_headed_full_e2e` 33/33（0 控制台报错）· `scripts/ux_verify_p0.py` 15/15；封面三引擎实跑出图（改后对照 `docs/ux-audit/shots/after/`）。
  - 落点提示：`fitty` 注入在 `core/guizang_renderer.py`（渲染前 add_script_tag）；BLCaptain 侧因 CLI 无脚本注入口，改为在 `core/blcaptain_bridge.py::_normalize_cover_text` **打断引擎的“前两行拼标题”**（实测有效）。
