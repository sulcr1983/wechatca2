# AI Handoff Spec — SuperSu

---

## 1. 项目快照

- **项目名称**：SuperSu · 公众号排版 + 小红书封面生成工具
- **项目目标（1句话）**：粘贴纯文本，自动排版为公众号风格 HTML，并可生成小红书封面图，AI 功能可选。
- **当前状态**：可运行
- **技术栈（Confirmed / Inferred）**：
  - **Confirmed**：Flask 3.0+ (Python 3.10+)，JavaScript (vanilla)，HTML/CSS (custom properties)，Pillow，requests，python-dotenv
  - **Inferred**：Jinja2 (Flask 内置模板引擎)
- **运行环境**：Windows，Python 3.10+，端口 5000
- **是否可正常启动**：**Yes**（已验证，服务正在运行）

---

## 2. 系统运行真实状态

### 模块：app.py (Flask 主服务)
- **状态**：Confirmed
- **是否可运行**：是，服务在 `http://127.0.0.1:5000` 运行中
- **依赖模块**：core/*, templates/index.html, public/themes/*
- **失败点**：无（已验证 GET / -> 200, GET /api/themes -> 200, POST /api/render -> 200）
- **影响范围**：全部

### 模块：templates/index.html (前端)
- **状态**：Confirmed
- **是否可运行**：是，浏览器正常渲染，浅色暖调主题
- **依赖模块**：app.py (提供 API)，public/themes/* (92 个 JSON 主题：45 原创 + 47 开源适配)
- **失败点**：用户反馈"页面还是旧的"——可能因浏览器缓存，按 Ctrl+F5 后显示新页面
- **影响范围**：全部前端交互

### 模块：core/format_engine.py (排版引擎)
- **状态**：Confirmed
- **是否可运行**：是（1835 行，函数 convert_markdown_to_wechat_html 可用）
- **依赖模块**：public/themes/*.json
- **失败点**：无
- **影响范围**：POST /api/render

### 模块：core/preprocessor.py (纯文本 → Markdown)
- **状态**：Confirmed
- **是否可运行**：是
- **依赖模块**：无
- **失败点**：无
- **影响范围**：POST /api/render (skip_preprocess=false 时)

### 模块：core/ai_client.py (多平台 LLM 客户端)
- **状态**：Confirmed
- **是否可运行**：是（已验证 8 个平台配置可读取，实际 LLM 调用需 API Key 有效）
- **依赖模块**：.env 或 data/config.json
- **失败点**：LLM 调用的成功与否取决于 API Key 有效性
- **影响范围**：POST /api/polish, /api/summary, /api/ai-format, /api/optimize-stream

### 模块：core/image_gen.py (封面图生成)
- **状态**：Confirmed
- **是否可运行**：是（Pillow 生成，fallback 到纯色渐变）
- **依赖模块**：Pillow
- **失败点**：无
- **影响范围**：POST /api/cover-image

### 模块：core/image_search.py (联网搜图)
- **状态**：Confirmed 🆕
- **是否可运行**：是（双轨：Wikimedia Commons 免 key 默认可用；Pexels 需 PEXELS_API_KEY）
- **依赖模块**：requests
- **失败点**：无网络时 fallback 到本地 public/images/
- **影响范围**：POST /api/social/generate 的自动底图搜索

### 模块：core/wechat_publisher.py (微信 API 推送)
- **状态**：Confirmed
- **是否可运行**：部分可用（代码可执行，但实际推送需要有效微信公众号 AppID/AppSecret 且服务器 IP 在微信白名单）
- **依赖模块**：core/token_manager.py, 微信公众号
- **失败点**：微信 API 限制 (40164 IP 未授权，需要公网 IP 加入白名单)
- **影响范围**：POST /api/push

### 模块：core/token_manager.py (Access Token 管理)
- **状态**：Confirmed
- **是否可运行**：是
- **依赖模块**：微信公众号 API
- **失败点**：同 wechat_publisher.py
- **影响范围**：POST /api/push

### 模块：core/crypto_utils.py (AppSecret 加密)
- **状态**：Confirmed，但未读取完整
- **是否可运行**：Unknown（未测试加解密）
- **依赖模块**：Unknown
- **失败点**：Unknown
- **影响范围**：账号管理中 appsecret 存储

### 模块：core/guizang_renderer.py (归藏风格封面渲染)
- **状态**：Confirmed
- **是否可运行**：是（已测试过，输出到 output/ 目录）
- **依赖模块**：public/cover-templates/*, public/images/*, templates/social/*
- **失败点**：无
- **影响范围**：POST /api/social/generate (editorial/swiss 风格)

### 模块：core/blcaptain_bridge.py (BLCaptain 风格封面渲染)
- **状态**：Confirmed
- **是否可运行**：是（需 Node.js 环境，调用 blcaptain-style-skill/bin/blcaptain-style.mjs）
- **依赖模块**：Node.js, blcaptain-style-skill/ 目录
- **失败点**：如果没有 Node.js 环境会 fallback 到 guizang_renderer (editorial 风格)
- **影响范围**：POST /api/social/generate (sp-*/sl-* 风格)

### 模块：tests (测试)
- **状态**：Confirmed
- **是否可运行**：是（41 个测试函数，涵盖 render/polish/summary/cover/accounts/push/SSE/preprocess）
- **依赖模块**：Flask test client
- **失败点**：部分测试依赖 LLM（polish/summary 等），API Key 无效时可能失败
- **影响范围**：测试覆盖

### 模块：docs/prototypes/prototype_full.html / docs/prototypes/prototype_ai_simplify.html (旧原型)
- **状态**：Confirmed（废弃）
- **是否可运行**：否，用户明确说"原型图不管了"
- **依赖模块**：无
- **失败点**：不再使用
- **影响范围**：无

---

## 3. 文件系统关键结构

| 文件 | 作用 | Status | Risk | Dependency |
|------|------|--------|------|------------|
| `app.py` | Flask 主入口，约 23 条路由（@app.route 实测，非 50） | stable | high | core/*, templates/ |
| `templates/index.html` | 前端页面 SPA，1233 行 | stable | medium | app.py API |
| `core/format_engine.py` | Markdown → 微信 HTML 转换，1835 行 | stable | medium | public/themes/* |
| `core/preprocessor.py` | 纯文本 → Markdown 规则引擎 | stable | low | 无 |
| `core/ai_client.py` | 多平台 LLM 客户端 | stable | low | .env config |
| `core/image_gen.py` | Pillow 封面图生成 | stable | low | Pillow, fonts |
| `core/wechat_publisher.py` | 微信 API 草稿箱推送 | stable | high | token_manager |
| `core/token_manager.py` | 微信 Access Token 管理 | stable | medium | 微信公众号 |
| `core/crypto_utils.py` | AppSecret 加密/解密 | unknown | medium | 无 |
| `core/guizang_renderer.py` | 归藏风格封面 HTML→PNG | stable | low | public/cover-templates/* |
| `core/blcaptain_bridge.py` | BLCaptain 风格封面 (Node.js) | stable | medium | Node.js, blcaptain-style-skill/ |
| `start_flask.py` | 启动脚本（带自动打开浏览器） | stable | low | app.py |
| `launcher.py` | PyInstaller 打包入口 | stable | low | app.py |
| `public/themes/*.json` | 92 个排版主题配置（45 原创 + 47 xh-* 开源适配） | stable | low | format_engine |
| `public/cover-templates/*` | 归藏风格的 HTML 封面模板 | stable | low | guizang_renderer |
| `public/social-thumb/*.png` | 封面风格缩略图 | stable | low | index.html |
| `.env.example` | 环境变量模板 | stable | low | 无 |
| `tests/test_e2e.py` | 端到端测试，41 个函数 | stable | low | Flask test client |
| `docs/prototypes/prototype_full.html` | 旧原型（废弃） | obsolete | none | 无 |
| `docs/prototypes/prototype_ai_simplify.html` | 旧原型（废弃） | obsolete | none | 无 |

---

## 4. 核心执行链路

### 主链路：公众号排版

```
用户输入纯文本 (index.html textarea)
  → POST /api/render {raw_text, theme_id}
    → preprocessor.preprocess(text)  // 纯文本 → Markdown（本地规则）
    → format_engine.convert_markdown_to_wechat_html(markdown, theme_path)
      → 加载 JSON 主题配置
      → md_to_html(markdown)  // Markdown → HTML 片段
      → inject_inline_styles(html, theme)  // 注入内联样式
      → generate_preview(html, footnotes, theme)  // 组装完整 HTML
    → 返回 {html, markdown, request_id}
  → 前台 iframe.srcdoc = html  // 实时预览
```

**分支：后台 LLM 优化（默认关闭）**
```
⚠️ 2026-07-11 修复（F2）：前端 index.html 从未接入 SSE 消费逻辑，
每次非 skip 渲染却无条件触发 call_llm 打真实外部 LLM（结果无人读取，被限流时纯浪费）。
现默认关闭 _start_background_optimization 的自动触发；/api/optimize-stream 端点与
函数保留为"可重新启用的基础设施"。如需启用，须先在前端接入 EventSource 消费链路。
```

### 副链路：AI 润色

```
用户点击"AI 润色"弹窗 → 选择风格 → POST /api/polish {text, style}
  → call_llm(POLISH_PROMPTS[style], text)
  → 返回 {polished_text}
```

### 副链路：公众号推送

```
用户点击"一键推送" → 填写标题/摘要 → POST /api/push
  {account_id, title, html, summary, cover_temp_filename}
  → 查找账号配置（从 data/accounts.json）
  → token_manager.get_token(appid, appsecret)  // 获取 access_token
  → upload_permanent_material(token, cover_bytes)  // 上传封面
  → filter_html_images(html)  // 移除 <img> 标签
  → push_to_draft(token, title, html, digest, thumb_media_id)
  → 微信 API: /cgi-bin/draft/add
  → 保存历史到 data/history.json
  → 返回 {media_id}
```

### 副链路：小红书封面生成

```
POST /api/social/generate {text, style}
  → image_search.search_background(text)        // 🆕 自动联网搜底图（Wikimedia/Pexels/本地兜底）
  → 判断风格是否 BLCaptain (is_blcaptain)
  → 如果是：BLCaptainBridge.generate(text, style, output_dir, bg_image=bg.path)
    → Node.js 子进程 blcaptain-style.mjs
    → 注入自动搜到的真实照片作背景
    → 输出 PNG 到 output/<task_id>/output/
  → 如果是归藏：guizang_renderer.render_social_cards(text, output_dir, style, images=merged)
    → 读取 cover-templates HTML
    → 底图以 base64 data URI 内嵌（避免 Playwright file:// 安全拦截）
    → 填充模板变量 + 真实照片底图
    → 生成 3 张 PNG（3:4 / 1:1 / 21:9）
    → 输出到 output/<task_id>/
  → 返回 {images: [{file, url, type}], background: {source, author, license, query}}
```

### 副链路：封面图生成（标题图）

```
POST /api/cover-image {title, full_text}
  → generate_cover(title, full_text)
    → 尝试 LLM 生成背景图（如配置了 IMAGE_GEN_*）
    → fallback：Pillow 绘制渐变背景 + 标题文字
  → 保存到 temp_covers/<uuid>.png
  → 返回 {image_url}
```

### 失败点清单

| 步骤 | 失败条件 | 后果 |
|------|----------|------|
| POST /api/push | 微信公众号未授权 IP | 推送失败，返回 40164 错误 |
| POST /api/push `→ upload_permanent_material` | API 异常 | 返回空 media_id，推送继续但无封面 |
| POST /api/polish, /api/summary, /api/ai-format | API Key 无效或 LLM 不可用 | 返回 500 |
| POST /api/social/generate → BLCaptain | Node.js 不可用 | 自动 fallback 到 guizang_renderer editorial 风格 |
| POST /api/social/generate → guizang_renderer | HTML 模板缺失 | 返回 500 |
| GET /api/themes | themes 目录 JSON 文件损坏 | 主题列表不完整 |

---

## 5. 配置与环境

### Env 变量（仅 key）

| Key | 必填 | 用途 |
|-----|------|------|
| `LLM_BASE_URL` | 否 | AI 功能 API 地址 |
| `LLM_API_KEY` | 否 | AI 功能 API 密钥 |
| `LLM_MODEL` | 否 | AI 模型名 |
| `IMAGE_GEN_BASE_URL` | 否 | 文生图 API 地址 |
| `IMAGE_GEN_API_KEY` | 否 | 文生图 API 密钥 |
| `IMAGE_GEN_MODEL` | 否 | 文生图模型名 |
| `PORT` | 否 | 服务端口（默认 5000） |

### Config 文件

| 文件 | 用途 | Status |
|------|------|--------|
| `.env` | 环境变量（不在 git 中） | Confirmed |
| `data/accounts.json` | 微信公众号账号配置（AppSecret 加密存储） | Confirmed |
| `data/config.json` | AI 配置持久化 | Confirmed（自动生成） |
| `data/history.json` | 推送历史记录，最多 20 条 | Confirmed（自动生成） |

### 外部服务

| 服务 | 用途 | Status |
|------|------|--------|
| 微信公众平台 API | 草稿箱推送 (api.weixin.qq.com) | Confirmed，需要公网 IP 白名单 |
| LLM API（阿里云百炼/OpenAI/Claude 等） | AI 排版/润色/摘要 | Confirmed，需要有效 API Key |
| 文生图 API（阿里云万相） | 封面图背景生成 | Confirmed，optional |
| ipify.org | 获取公网 IP | Confirmed，测试白名单用 |

**敏感值**：API Keys [REDACTED]

---

## 6. 启动与运行

### Install Steps（Confirmed）
```bash
pip install -r requirements.txt
# requirements.txt 内容：flask>=3.0, python-dotenv>=1.0, requests>=2.31, pillow>=10.0, markdown>=3.5, platformdirs>=4.0, playwright>=1.40
```

**必需依赖（小红书封面生成，缺则 500）**：
```bash
playwright install chromium   # 安装 Chromium 浏览器，否则 /api/social/generate 报 No module named 'playwright'
```

### Run Command（Confirmed）
```bash
python app.py
# 或 python start_flask.py（自动打开浏览器）
# 浏览器访问 http://127.0.0.1:5000
```
已验证：服务可正常启动并运行

### Test Command（Confirmed）
```bash
# 1) E2E（Flask test_client，无需起服务）：40/41 通过
#    （1 项陈旧 UI 断言失败，与 F2 修复无关，属测试自身待清理）
python tests/test_e2e.py

# 2) 集成测试（需先起服务 python app.py）：35/35 通过
#    （已重写为对齐真实前端：字段名 raw_text/theme_id、真实元素 id、
#      字体容错解析、动态取真实主题 id；封面生成项依赖 playwright+Chromium）
python tests/test_integration.py
```

### Build Command（Inferred）
```bash
# 推测用于 PyInstaller 打包
pyinstaller launcher.py  # 未验证
```

---

## 7. 已知问题

### CRITICAL（系统不可用）
**无**

### MAJOR（功能异常）

1. **微信公众号推送需要公网 IP 白名单**
   - description：POST /api/push 调用微信 API 时，如果服务器 IP 不在微信公众号后台白名单中，返回 40164 错误
   - trigger：执行推送操作
   - suspected cause：微信安全策略要求 IP 白名单
   - confirmed cause：微信 API 返回 `errcode: 40164, errmsg: "invalid ip"`
   - workaround：将服务器公网 IP 添加到微信公众号后台 IP 白名单（有 /api/server-ip 辅助获取 IP）

2. **用户浏览器缓存导致看不到最新前端**
   - description：用户刷新页面看不到新前端设计，需要强制刷新
   - trigger：更新 index.html 后用户直接刷新页面
   - suspected cause：浏览器缓存了旧版本
   - confirmed cause：Ctrl+F5 强制刷新后正常显示
   - workaround：通知用户 Ctrl+F5 或打开无痕窗口

### MINOR（优化问题）

3. **前端用户第一次看到的是旧缓存页面（用户已反馈 2 次）**
   - description：用户连续 2 次反馈"和之前一样/完全没有改变"
   - trigger：更新代码后刷新
   - suspected cause：浏览器缓存
   - workaround：Ctrl+F5 强制刷新

4. **无 AI 配置时的 UX**
   - description：首次使用无 .env 时，AI 功能直接显示错误而非引导配置
   - trigger：点击 AI 排版/润色
   - suspected cause：代码无 AI 配置检查
   - workaround：先配置 AI 设置

5. **早期原型（prototype_full / prototype_ai_simplify）已迁移至 docs/prototypes/**
   - description：2 个废弃的原型文件 2000+ 行，与主 index.html 无关
   - trigger：不触发
   - risk：低，但可能误导开发者
   - workaround：可以删除（用户已确认"原型图不管了"）

---

## 8. 最近变更（只写影响系统的）

### 变更 1：前端完整重写（templates/index.html）
- **改动**：从 2462 行旧代码重写为 1233 行浅色暖调双页面 SPA
  - 深色主题 → 浅色暖调（`#f5f3ef` 背景，`#c8832e` 强调色）
  - 单页 → 双页（公众号排版 + 小红书封面）
  - 内联 CSS → CSS 变量架构
  - 添加所有模态弹窗（AI 润色、推送、设置、账号管理、历史）
- **影响**：用户界面和交互全部更新
- **风险**：低，不影响后端 API
- **是否验证**：是，服务启动正常，API 调用正常

### 变更 2：docs/prototypes/prototype_full.html 修改（已废弃）
- **改动**：修复 CSS 高度 2100px 和滚动条问题
- **影响**：无（用户已说不做原型图）
- **风险**：无
- **是否验证**：否，已废弃

### 变更 3：P0 修复（2026-07-11，F1/F2/F3）
- **F1 小红书封面可用**：venv 安装 playwright + `playwright install chromium`；
  requirements.txt 将 playwright 标为必需依赖。验证 editorial/swiss(归藏) 与
  mist(BLCaptain/Node) 均 200 出图。
- **F2 关闭孤儿 LLM 调用**：app.py 默认关闭 `_start_background_optimization`
  自动触发（前端从未消费其结果）。保留 SSE 基础设施。
- **F3 重写集成测试**：tests/test_integration.py 对齐真实前端契约，
  字段名 raw_text/theme_id、真实元素 id、字体容错解析、动态取主题 id；35/35 全绿。
- **影响**：主链路 + 封面链路均健康；渲染不再白烧外部 LLM。
- **风险**：低。
- **是否验证**：是（E2E 40/41；集成 35/35；封面实跑出图）。

### 变更 4：自动联网搜底图 + 主题去重 + 开源适配（2026-07-25）🆕
- **新增 `core/image_search.py`**：双轨联网搜图模块。默认 Wikimedia Commons（免 key，自定义 UA 防 403）；检测到 `PEXELS_API_KEY` 自动升级 Pexels。规则提取中文→英文关键词（零 AI）。缓存到 `data/bg_cache/`，返回 `{path, source, author, license, query}`。
- **接线**：`app.py::api_social_generate()` 渲染前调用 `search_background()`；BLCaptain 接收 `bg_image` 参数；归藏接收 `images=merged`（用户上传覆盖自动底图）；前端结果区下方显示 `#bg-credit` 署名条。
- **关键修复**：`guizang_renderer._resolve_img()` 从 `file://` URI 改为 base64 `data:` URI 内嵌——Playwright `set_content()` 下浏览器安全策略拦截 file://，导致底图静默丢失。
- **主题去重 + 开源适配**：从 xiaohu-wechat-format 适配 47 套开源主题（xh-* 前缀），删除 84 套颜色克隆 + 8 套原创撞色重复。最终 **92 套 = 45 原创 + 47 开源**。
- **验证**：live API 三引擎（editorial/swiss/sp-mist）均返回真实 PNG + 真实网图底图；有头 E2E 0 console 错误；署名条文案正确。
- **影响**：封面生成核心价值链「搜图→渲染→展示→署名」完整闭环。
- **风险**：低。Wikimedia 无 key 但有请求频率限制（实际使用远低于上限）。

### 变更 5：公众号复制富文本 + 首主题自动选中 + 全系统前后端 E2E（2026-07-26）🆕
- **复制 bug 修复（用户反馈「点复制没反应/复制不到公众号」）**：原 `#btn-copy` 用 `navigator.clipboard.writeText(lastHtml)` 只写纯文本，粘贴到公众号是一坨 HTML 源码。改为 `ClipboardItem({'text/html', 'text/plain'})` 写富文本，公众号可直接渲染成排版样式；非安全上下文（局域网 IP / 旧浏览器）降级走隐藏 contenteditable + `execCommand('copy')`。
- **首主题自动选中（根因修复）**：原 `activeTpl` 仅在手动点选模板时赋值，导致**刚进页面直接打字预览不渲染**。改为 `loadThemes()` 后自动 `activeTpl = themes[0].id` 并渲染，实现「输入即渲染」。
- **模板筛选增强**：`renderTplList()` 过滤由仅匹配 `name` 扩展为同时匹配 `name + id + group`，英文 id（如 editorial）也可搜到。
- **全系统 E2E（用户要求「所有按钮/输出/前后端都测一次」）**：
  - 新增 `tests/test_api_e2e.py`：后端 21 个端点全量 HTTP 校验（含账号 CRUD 闭环、AI 优雅降级、静态资源、推送校验路径），**29/29 通过**。
  - 新增 `tests/test_headed_full_e2e.py`：有头浏览器逐一点击公众号页 13 个交互 + 小红书页 10 个交互（含复制富文本探针、Lightbox 大图、底图署名），**26/26 通过，0 控制台报错**。
- **验证**：双 E2E 全绿；Pillow 校验三张封面 PNG 均有效（xhs 1080×1440 / square 1080×1080 / wide 2100×900）。
- **风险**：低。复制富文本依赖 `navigator.clipboard` 安全上下文，已做 execCommand 兜底。

---

## 9. 下一步开发建议

### NEXT STEP 1（唯一最优先）
- **action**：确认用户能看到最新前端并收集反馈
- **reason**：用户已连续 2 次抱怨"页面没变"，需要先解决信任问题再继续开发
- **affected files**：templates/index.html
- **validation criteria**：用户在浏览器看到浅色暖调新设计，而非旧的深色页面

### DO NOT DO
- 不要碰 docs/prototypes/prototype_full.html 和 docs/prototypes/prototype_ai_simplify.html（已废弃）
- 不要重构 backend API 结构（约 23 条路由，当前够用）
- 不要添加新功能除非用户明确要求（用户说过"到时再慢慢修"）
- 不要添加自动缓存清理/版本号（用户按 Ctrl+F5 即可，过度设计）

---

## 10. 风险总结

- **当前最大风险**：用户对前端状态存在认知差距——"看不到新页面"被理解为"代码没改"，实际是浏览器缓存问题。这影响了用户对进度的信任。
- **哪个模块最不稳定**：**wechat_publisher.py** — 依赖微信公众号白名单和公网 IP，环境要求高，不适用本地开发测试
- **哪个改动最危险**：直接修改 **templates/index.html** 的 JS 逻辑可能破坏与其他 API 的交互；修改 **core/format_engine.py** 的样式注入逻辑可能影响 53 个主题
- **是否建议先修复再开发**：**是**——先让用户亲眼确认新前端已生效（截图/共享屏幕/Ctrl+F5），再按用户反馈迭代
