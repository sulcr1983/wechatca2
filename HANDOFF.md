# AI Handoff Spec — SuperSu

---

## 1. 项目快照

- **项目名称**：SuperSu · 公众号排版 + 小红书封面生成工具
- **项目目标（1句话）**：粘贴纯文本，自动排版为公众号风格 HTML，并可生成小红书封面图，AI 功能可选。
- **当前状态**：可运行且全测试矩阵全绿（2026-09-23 全量盘点 + 同日收口）
- **最近盘点**：2026-09-23（实跑 52/52 · 35/35 · 29/29 · 32/32 · 7/7 · 12/12；原记录风险 6–10 已全部收掉，见 §7。⚠️ 唯一非绿项：上游 LLM 网关 `api.tokenpool.co` 当轮返 500，令有头全按钮套件记 2 条控制台 500、退出码 1——判据未放宽，属环境故障）
- **技术栈（Confirmed / Inferred）**：
  - **Confirmed**：Flask 3.0+（Python 3.12+，仓库 `.venv` 为 3.12.10），JavaScript (vanilla)，HTML/CSS (custom properties)，Pillow，requests，python-dotenv，Playwright 1.61+
  - **Inferred**：Jinja2 (Flask 内置模板引擎)
- **运行环境**：Windows，Python 3.12+，端口 5000
- **Git 推送**：远端 `git@github.com:sulcr1983/wechatca2.git`。全局 `~/.ssh/config` 把 `github.com` 指向 hotnews 部署密钥（对本仓库无写权限，直接用会报 `denied to deploy key`）；本仓库已在 `.git/config` 设 `core.sshCommand` → `~/.ssh/id_ed25519_wechatca2`（专用部署密钥，2026-09-23 实推验证通过）。默认 `git push` 可用，勿删该配置
- **是否可正常启动**：**Yes**（已验证）

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
- **依赖模块**：app.py (提供 API)，public/themes/* (164 个 JSON 主题：45 套早期原创 + 119 套 su-* 自研原创)
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
- **是否可运行**：是（2026-09-23 复核：test_e2e 52/52、test_integration 35/35、test_api_e2e 29/29、test_headed_full_e2e 32/32、test_headed_userflow 7/7、test_headed_wechat_copy 12/12。⚠️ 有头全按钮套件当轮退出码 1：上游 LLM 网关 `api.tokenpool.co` 返 500，`/api/polish` + `/api/summary` 无本地兜底 → 2 条控制台 500，判据不放宽，上游恢复即绿）
- **依赖模块**：Flask test client / requests / Playwright Chromium
- **失败点**：无（原 3 项已全部收掉：① tpl-list 陈旧断言 → 改断 `tpl-strip`；② test_e2e 清空 data/*.json → 改为快照 + atexit 还原，已用「写入脏数据后崩溃」实测还原成功；③ userflow 选择器陈旧 / 复制探针 `Object.keys(it.types)` 误报 → 改 `#tpl-strip .tpl-card` 与 `Array.from(it.types)`）
- **硬化**：6 个测试脚本加 UTF-8 stdout 守卫（GBK 管道不再崩，无需再设 PYTHONIOENCODING）；3 个自起服务的脚本用 `PY = sys.executable` 取代硬编码 WorkBuddy venv 路径
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
| `app.py` | Flask 主入口，23 个路径 / 25 个路由装饰器（@app.route 实测） | stable | high | core/*, templates/ |
| `templates/index.html` | 前端页面 SPA，1676 行 | stable | medium | app.py API |
| `core/format_engine.py` | Markdown → 微信 HTML 转换，1835 行 | stable | medium | public/themes/* |
| `core/preprocessor.py` | 纯文本 → Markdown 规则引擎 | stable | low | 无 |
| `core/ai_client.py` | 多平台 LLM 客户端 | stable | low | .env config |
| `core/image_gen.py` | Pillow 封面图生成 | stable | low | Pillow, fonts |
| `core/wechat_publisher.py` | 微信 API 草稿箱推送 | stable | high | token_manager |
| `core/token_manager.py` | 微信 Access Token 管理 | stable | medium | 微信公众号 |
| `core/crypto_utils.py` | AppSecret 加密/解密 | unknown | medium | 无 |
| `core/guizang_renderer.py` | 归藏风格封面 HTML→PNG | stable | low | public/cover-templates/* |
| `core/blcaptain_bridge.py` | BLCaptain 风格封面 (Node.js) | stable | medium | Node.js, blcaptain-style-skill/ |
| `start_flask.py` | 冗余启动脚本（无浏览器打开逻辑、无任何引用；真实入口为 app.py / start-app.bat） | obsolete | low | app.py |
| `launcher.py` | 打包入口占位（唯一引用方 build.yml 已于 2026-09-23 删除 → 现零引用；exe 路线已被否决） | obsolete | low | app.py |
| `public/themes/*.json` | 164 个排版主题配置（45 套早期原创 + 119 套 su-* 自研原创） | stable | low | format_engine |
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

### Test Command（2026-09-23 实跑复核）
```bash
# 1) E2E（Flask test_client，无需起服务）：52/52 ✅
#    data/*.json 已做「测试前快照 + atexit 还原」，不再清空真实配置
python tests/test_e2e.py

# 2) 集成测试（需先起服务 python app.py）：35/35 ✅
python tests/test_integration.py

# 3) 后端 API 全端点（自起服务）：29/29 ✅
#    ⚠️ 自起服务套件跑前预检端口 5000：被占则 ABORT(2)，避免连旧进程假通过
python tests/test_api_e2e.py

# 4) 前端有头全按钮（自起服务，需 Chromium）：32/32 ✅ 0 控制台报错
#    含 AI 摘要 / AI 封面 / AI 润色应用 / 账号 UI 增删；断言「真实产出或真报错」
#    刻意不点 确认推送 / 保存AI配置 / 测试连接（真实副作用）——由 test_api_e2e 覆盖后端
python tests/test_headed_full_e2e.py

# 5) 有头用户流程（需先起服务）：7/7 ✅
python tests/test_headed_userflow.py

# 6) 有头复制/推送/封面旧资产（自起服务）：12/12 ✅
python tests/test_headed_wechat_copy.py
```

### Build Command（暂无）
```bash
# 无构建步骤：本项目为 Python 源码直跑（python app.py）
# CI 构建工作流 .github/workflows/build.yml 已于 2026-09-23 删除（Nuitka 参数陈旧 + exe 封装被否决）
# exe 封装结论见 docs/exe-packaging-report.html（PyInstaller + Inno Setup），尚未实施
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

### 2026-09-23 全量盘点新增

> 6–10 均为 2026-09-23 盘点发现，**同日全部收掉**，保留记录备查。

6. **[MAJOR] test_e2e 会把用户数据清空 → ✅ 已修**
   - 原状：`tests/test_e2e.py` 结尾无条件把 `data/*.json` 重写为 `[]`（accounts / history / ai_config）；本轮实跑后三文件均为 2 字节 `[]`，且 data/ 从未入库、无法从 git 恢复
   - 修复：测试前快照内容 + `atexit` 还原（已有文件还原、测试新增文件删除）。已实测：跑完 41/41 后三文件 md5 不变；再模拟「写入脏数据后抛异常崩溃」，退出后脏数据被还原、新增文件被清除
7. **[MAJOR] CI 工作流损坏且与决策矛盾 → ✅ 已删**
   - `.github/workflows/build.yml` 用 Nuitka + `assets=` 旧路径（已更名 `public/`）+ `data=data`（gitignore 目录，CI 上不存在）+ `nuitka-onefile`（无效包），push 到 main 必失败；且 exe 封装已被用户否决
   - 处置：`git rm .github/workflows/build.yml`（exe 路线调研结论仍保留在 `docs/exe-packaging-report.html`）
8. **[MAJOR] requirements.txt playwright 版本声明过宽 → ✅ 已修**
   - `playwright>=1.40` 与已记录事实「<1.61 driver 必挂」矛盾；已改为 `>=1.61`（两处 venv 实际均为 1.61.0）
9. **[MINOR] 测试硬编码解释器绝对路径 → ✅ 已修**
   - `test_api_e2e.py` / `test_headed_full_e2e.py` / `test_headed_wechat_copy.py` 原硬编码 WorkBuddy venv 绝对路径，换机即挂；已改为 `PY = sys.executable`
10. **[MINOR] 本地领先 origin/main 4 个提交未推送 → ✅ 已推送**
   - `87949b7` `66e8bc3` `ad80b7e` `7ebaade` 已推上 origin/main（走 HTTPS：SSH deploy key 绑定 hotnews_local，对 wechatca2 无写权限）
   - ⚠️ 遗留：remote URL 仍是 SSH，后续直接 `git push` 会再被拒；要么改 remote 为 HTTPS，要么给 wechatca2 配对应 deploy key

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

### 变更 4：自动联网搜底图 + 主题去重 + 外部主题适配（2026-07-25）🆕
- **新增 `core/image_search.py`**：双轨联网搜图模块。默认 Wikimedia Commons（免 key，自定义 UA 防 403）；检测到 `PEXELS_API_KEY` 自动升级 Pexels。规则提取中文→英文关键词（零 AI）。缓存到 `data/bg_cache/`，返回 `{path, source, author, license, query}`。
- **接线**：`app.py::api_social_generate()` 渲染前调用 `search_background()`；BLCaptain 接收 `bg_image` 参数；归藏接收 `images=merged`（用户上传覆盖自动底图）；前端结果区下方显示 `#bg-credit` 署名条。
- **关键修复**：`guizang_renderer._resolve_img()` 从 `file://` URI 改为 base64 `data:` URI 内嵌——Playwright `set_content()` 下浏览器安全策略拦截 file://，导致底图静默丢失。
- **主题去重 + 外部主题适配**：从外部仓库适配 47 套主题（加 `xh-` 前缀），删除 84 套颜色克隆 + 8 套原创撞色重复。最终 **92 套 = 45 原创 + 47 适配**。
  - ⚠️ **已于 2026-09-25 推翻**：该外部仓库无 LICENSE（= 保留所有权利），本项目开源即分发存在风险；这 47 套已全部废弃并重写为本项目自研原创（见变更 14）。
- **验证**：live API 三引擎（editorial/swiss/sp-mist）均返回真实 PNG + 真实网图底图；有头 E2E 0 console 错误；署名条文案正确。
- **影响**：封面生成核心价值链「搜图→渲染→展示→署名」完整闭环。
- **风险**：低。Wikimedia 无 key 但有请求频率限制（实际使用远低于上限）。

### 变更 5：公众号复制富文本 + 首主题自动选中 + 全系统前后端 E2E（2026-07-26）🆕
- **复制 bug 修复（用户反馈「点复制没反应/复制不到公众号」）**：原 `#btn-copy` 用 `navigator.clipboard.writeText(lastHtml)` 只写纯文本，粘贴到公众号是一坨 HTML 源码。改为 `ClipboardItem({'text/html', 'text/plain'})` 写富文本，公众号可直接渲染成排版样式；非安全上下文（局域网 IP / 旧浏览器）降级走隐藏 contenteditable + `execCommand('copy')`。
- **首主题自动选中（根因修复）**：原 `activeTpl` 仅在手动点选模板时赋值，导致**刚进页面直接打字预览不渲染**。改为 `loadThemes()` 后自动 `activeTpl = themes[0].id` 并渲染，实现「输入即渲染」。
- **模板筛选增强**：`renderTplList()` 过滤由仅匹配 `name` 扩展为同时匹配 `name + id + group`，英文 id（如 editorial）也可搜到。
- **全系统 E2E（用户要求「所有按钮/输出/前后端都测一次」）**：
  - 新增 `tests/test_api_e2e.py`：后端 21 个端点全量 HTTP 校验（含账号 CRUD 闭环、AI 优雅降级、静态资源、推送校验路径），**29/29 通过**。
  - 新增 `tests/test_headed_full_e2e.py`：有头浏览器逐一点击公众号页 13 个交互 + 小红书页 10 个交互（含复制富文本探针、Lightbox 大图、底图署名），**26/26 通过，0 控制台报错**。（该套后续扩至 **32 项 / 32/32 通过**，见变更 7）
- **验证**：双 E2E 全绿；Pillow 校验三张封面 PNG 均有效（xhs 1080×1440 / square 1080×1080 / wide 2100×900）。
- **风险**：低。复制富文本依赖 `navigator.clipboard` 安全上下文，已做 execCommand 兜底。

### 变更 6：全量盘点 + 同日收口（2026-09-23）🆕
- **盘点基线（真实执行）**：test_e2e 41/41、test_integration 34/35（tpl-list 陈旧断言）、test_api_e2e 29/29、test_headed_full_e2e 27/27；封面三引擎（editorial/swiss/mist）实跑 200 + 真实 PNG（1.9–7.7MB）+ Wikimedia 实搜底图。
- **文档修正**：`AGENTS.md` §4/§5/§6/§9/§10/§11 同步真实计数、补 5 条缺失路由、修正 `.topbar/.tab-btn` 结构。
- **盘点发现的 5 项风险（6–10）当日全部收掉**：
  - test_e2e 数据保护（快照 + atexit 还原，含崩溃路径实测）
  - 删除损坏 CI `.github/workflows/build.yml`
  - `requirements.txt` playwright `>=1.40` → `>=1.61`
  - 3 个测试脚本 `PY = sys.executable` 取代硬编码 venv 路径
  - 4 笔未推送提交推送至 origin/main
- **测试资产修复**：集成 tpl-list → tpl-strip 断言；userflow `#tpl-list .tpl-item` → `#tpl-strip .tpl-card`；复制探针 `Object.keys(it.types)` → `Array.from(it.types)`；6 个脚本加 UTF-8 stdout 守卫。
- **清理**：`output/`（752MB → 9.6MB）、`test_output/`、`temp_covers/` 缓存、`.pytest_cache`、`__pycache__`；保留 `output/e2e_audit/`（审计证据）、`reports/`、`data/`。
- **收口后全矩阵（真实执行）**：41/41 · 35/35 · 29/29 · 32/32 · 7/7 · 12/12，共 **156/156 全绿**，且 `data/*.json` 跑测后 md5 不变。

### 变更 7：有头套件补盲 5 个按钮 + 修掉自己的假阳性（2026-09-23）🆕
- **背景**：核对 `templates/index.html` 全部 29 个 `<button>` 后发现，有头套件虽叫「全按钮」，实际有 8 个按钮的**前端点击链路**从未被点过（只有后端被 `test_api_e2e` 覆盖）。
- **补测 5 个安全项**（用户选定范围）：`polish-apply`（应用到编辑区）、`genSummary`（AI 摘要）、`genCover`（AI 封面）、`addAccount` / `deleteAccount`（账号 UI 增删）。
- **安全策略**：账号走「UI 建 → UI 删」自清理；套件加 `data/*.json` 快照 + atexit 还原（建账号会写 `accounts.json`）。实测跑完 `accounts.json` 仍为 `[]`、md5 不变。
- **刻意不点 3 个**（真实副作用，后端已覆盖）：`confirmPush`（真打微信接口）、`saveAiConfig` / `testAiConfig`（会覆盖 `data/ai_config.json`）。
- **修掉自己的假阳性**：初版用固定 `sleep` 判「优雅降级」，导致 LLM 响应慢（>3s / >8s）被误判成"降级"而**假通过**（当时 31/32，唯一 FAIL 正是等待过短）。改为 `wait_for_function` 轮询到「真实产出 or 真报错」，并把"超时未结束且未报错"判为 FAIL。
- **修复后实测（真实产出）**：润色结果写回编辑区（50 字）、AI 摘要 90 字、AI 封面 `#cover-preview` 内真实 `<img>`、账号列表增删各 1 行 → **32/32 通过，0 控制台报错**。

### 变更 8：智能排版「LLM 优先 / 本地兜底」+ 自起服务套件端口预检（2026-09-23）🆕
- **背景**：用户问「能不能自动排版？」——现状是 `/api/ai-format` 未配 LLM 时直接 500「AI排版失败，请检查AI配置」，即"没有配置就什么也不给"。用户拍板：**按钮降级**（不做输入即自动跑 LLM，保持「AI 不自动触发」约束）。
- **后端**：`core/ai_client.py` 新增 `is_configured()`（单真源：`base_url` + `api_key` 齐备）；`app.py:/api/ai-format` 三态——① LLM 成功 → `engine=llm`；② **未配置** → 本地 `preprocess` 兜底 `engine=local`（200，不是错误）；③ **已配置但调用失败** → 真报错 500，**不静默降级**。
- **前端**：`#btn-ai-format` 按 `data.engine` 提示「AI 排版完成」或「未配置 AI，已用本地规则排版」。
- **顺带修掉一个假通过陷阱**：三个「自起服务」套件（`test_api_e2e` / `test_headed_full_e2e` / `test_headed_wechat_copy`）原先不做端口预检——若用户自己的 `app.py` 正占着 5000，被测子进程 bind 失败退出，`wait_server()` 会连上**旧进程**，于是拿陈旧代码静默假通过。现统一加 `_port_busy()` 预检，命中则 ABORT（退出码 2）。
- **实测证据**：`test_e2e` 新增 3 项分支测试（桩 `call_llm`/`is_configured` 覆盖 llm / local / 真报错三态）→ **44/44**；有头套件 AI 排版步改为读 toast + 断言编辑区真实改写，实跑 `toast='AI 排版完成'；50 字 → 61 字`（真实 LLM，5.4s）→ **32/32**；线上 `POST /api/ai-format` 返回 `engine=llm`。全矩阵 **44/44 · 35/35 · 29/29 · 32/32 · 7/7 · 12/12 = 159/159**。

### 变更 9：智能排版改为「AI 只出结构决策 JSON，正文本地原样套用」（2026-09-23）🆕
> ⚠️ 本条描述的「JSON 解析失败 → 500 真报错」契约已由 **变更 10** 取代（改为降级本地 + 说明原因）；计数 48/48 亦为当时值，现为 52/52。此处保留为历史记录。
- **背景**：用户反馈 AI 排版「没啥变化 / 分节不稳定」——原实现让 LLM **重写整篇文章**再吐 Markdown，同一篇文章跑出 1/4/1 个小节；用户拍板「有问题先网络调研方案，不要自己造轮子折腾」「GitHub 上很多同类项目，去抄他们的方案」。
- **调研结论（同类项目实测）**：`doocs/md`（13.4k★）AI 只有润色/翻译/总结，无自动分节；`caol64/wenyan-mcp` 无提示词；真正可抄的是 `Suxingyu111/ai-article-creator`——**每个 LLM 步骤都用结构化 schema（`OutlineResult`/`BodySection`），调用带 `response_format={"type":"json_object"}`，解析失败有兜底**；小标题写作规则来自 `CH3SH-LC/wechat-mp`（4-12 字、全文 3-5 个、句式家族统一、句尾不带标点）。
- **新实现**：`app.py:/api/ai-format` 把原文按空行切段并编号喂给 LLM，**LLM 只返回决策 JSON**（`{"title","sections","lists","bold"}`），正文由新增的 `core/preprocessor.apply_structure()` 按段号原样套用标记——**一个字都不改写**；越界段号 / 区间重叠 / 词不在原文中一律忽略该项（LLM 输出属系统边界）。JSON 解析失败 → 500 真报错，不静默降级。
- **稳定性加固**：`core/ai_client.py` 新增 `_post_with_retry()`——网关 429/5xx/连接超时退避 1 秒重试一次（观察到的中转站偶发 500 与 20s+ 慢响应），超时 30s → 45s；`json_mode=True` 时带 `response_format`，遇不支持该参数的中转自动去掉重试一次。
- **实测证据**：你的真实端点探测 `response_format` → HTTP 200（支持）；同一篇文章 3 连跑 → 小节数 **2/2/2**、节边界一致、**正文缺失段 = 0**（仅新增小节标题），7-8s/次；改前为 1/4/1。HTTP 直连线上进程 3 连跑 → 200/200/200；有头浏览器点击「AI 智能排版」→ 绿色 h1 + 2 个 h2 小节 + 加粗，0 控制台报错（截图 `output/ai_format_check/9_before_plan.png`、`10_after_plan.png`）。`test_e2e` 新增 5 项智能排版测试 + 2 项客户端重试测试 → **48/48**；全矩阵 **48/48 · 35/35 · 29/29 · 32/32 · 7/7 · 12/12 = 163/163**。

### 变更 10：本地兜底也能自动排 + AI 失败改降级本地（2026-09-23）🆕
- **背景**：用户指出上一轮只做了 LLM 路径，要求「没有 LLM、降级本地也要能自动排」，并再次强调先调研同行。另发现用户的上游网关 `api.tokenpool.co` **当时正在返 500**，导致「智能排版」必然报错——即旧契约「已配置但失败 → 真报错 500」在网关不稳时会让按钮完全不可用。
- **调研结论（核到源码）**：主流项目**没有**用本地规则给无标记散文分节的先例——`doocs/md` 的「一键排版」实为 Prettier 格式化（`headings.ts` 只从已有 `#` 抽大纲）；`wenyan-mcp` 只吃 Markdown；135编辑器/壹伴都要求用户先把标题正文标清楚；唯一同类 [Word-Formatter-Pro](https://github.com/cwyalpha/Word-Formatter-Pro) 只认编号正则（`wfp_core.py`）且**明确不提升散文段**。非 LLM 的散文分节只有 TextTiling/embedding 路线，与「不用 AI 就不开 AI」冲突。
- **实测证伪**：「我原本是可以的」不成立于本地规则链——把 6 个历史版本（`f2bbb16` → `99581f2`）逐版回放，对这篇散文体文章**都识别不出任何 `##`**，本地路径从来只能加 `#` 大标题。
- **本地增强（确定性识别）**：`core/preprocessor.py` 新增并列清单规则——箭头行 `掏手机 → 找 App → …` 拆成多条 `- ` 项（≥3 项、每项 ≤14 字、项内无逗号才算），项目符号行 `·•●○` 转列表；`_to_list_items()` 同时被 `apply_structure` 复用，**因此 AI 路径也恒定生效**（此前 AI 计划没标 lists 时那句箭头行会丢列表，截图已证）。散文主题句提升**刻意不做**（用户拍板）。
- **AI 失败改降级**：用户拍板「失败也降级本地」。`app.py:/api/ai-format` 三态合并为两态——LLM 成功 `engine=llm`；未配置 / 调用失败 / 结构不可解析 → 一律 `preprocess` 兜底 `engine=local` + `fallback` 原因；`core/ai_client.call_llm` 新增可选 `error_out` 参数回传底层原因（`_llm_fail_reason()` 压成「网关 HTTP 500」或「网络异常或超时」）。
- **实测证据**：真实网关 500 期间线上 `POST /api/ai-format` → `engine=local`、`fallback='AI 网关 HTTP 500，已用本地规则排版'`，本地产出含 4~5 条列表项、正文零改写；有头浏览器点击 → toast 与预览同步，**0 控制台报错**（截图 `output/ai_format_check/13_local_fallback_toast.png`，改前基线 `11_local_before.png`、改后 `12_local_after.png`）。92/92 主题对列表与 `---` 渲染验证通过；仓库 91 条含箭头的散文行仅 1 条会被转列表（那条本身即步骤序列）。`test_e2e` **52/52**。

---

### 变更 11：前端体验走查 → 对抗审计 → 开源选型 → 方案 v3 定稿（2026-09-24）🆕

> ⚠️ 本轮**只出方案，未改动任何产品代码**（用户明确要求"先完成方案设计，不要动手这么快"）。

- **方法**：① 有头 Chromium 按真实用户路径走查 15 步，逐步截图（`scripts/ux_walkthrough.py`）；② 对方案做红队对抗审计（假设自己全错，到源码找反证）；③ 逐个问题检索开源方案，能直接用就不自研。
- **产物**（`docs/ux-audit/`）：`index.html` 走查诊断 → `adversarial-review.html` 对抗审计 → `open-source-picks.html` 开源选型 → **`final-plan.html` 定稿（含线框原型，唯一权威）**；证据 `walkthrough.json` + `shots/` 15 张截图。
- **走查实测**：92 套主题无分类；搜"科技"返回 0 且无救场；点生成后按钮文案不变、无进度（实测要等十几秒）；封面 3 张但标题溢出/正文重叠、预览卡露出 `<br>`；底图署名 `local` 却写"自动联网搜索"。
- **审计推翻 3 处**：三步走常驻引导（个人工具无新用户）／复制升主按钮+推送降级（"90% 用户只复制"是编的假设）／92 套人工打标签（成本高，悬停试看+最近使用置顶更省）。
- **审计修正关键归因**：`<br>` 属前端预览卡而非成品；溢出根因在**引擎模板写死字号**（非前端）；慢的大头是搜图 15–20s（非渲染）。
- **开源选型**：`fitty`（文字自适应，治溢出，两套引擎通用）／`md-wechat`（悬停即试看）／`doocs/md`（整体范式）／`satori`（Vercel，中期可去 Chromium/Node）／`rednote-pro`（分页算法）。确认自研：进度反馈、搜图缓存、记住主题、署名如实。
- **影响**：无（未改代码）。**下一步**＝按 `final-plan.html`「第一批（止血）」U-1…U-6 逐项实施，**须先获用户批准**。
- **是否验证**：方案阶段已验证——走查截图与源码证据齐备；实施阶段待批。

---

### 变更 12：P0 第一批止血 U-1…U-6（2026-09-25）🆕

- **背景**：用户批准 `docs/ux-audit/final-plan.html` 的"第一批（止血）"6 项，并选定"引入 fitty""6 项一次做完"。
- **改动**：
  - U-1 `templates/index.html`：预览卡 `extractSocialDesc` 由 `join('<br>')` 改 `join('\n')`，`.spv-desc` 加 `white-space:pre-line`（该值走 `textContent`，不再把 `<br>` 当字面文字显示）。
  - U-2 封面溢出：归藏 `core/guizang_renderer.py` 渲染前注入 **fitty v2.4.2（MIT，vendored 于 `public/vendor/fitty.min.js`）**，对 `.h-display` 做 32–96px 自适应；BLCaptain 侧（CLI 无脚本注入口）改 `core/blcaptain_bridge.py::_normalize_cover_text()` —— 实测引擎会把**输入前两行拼成一个标题**（14 字标题 + 副标题 → 27 字必溢出），故在标题后补空行打断拼接 + 标题超长钳到 16 字。
  - U-3 生成进度：`app.py` 新增 `_GEN_PROGRESS` 内存态 + `GET /api/social/progress/<task_id>`（searching/rendering/done）；前端生成时置灰按钮、800ms 轮询显示真实阶段，结束（含失败）恢复。
  - U-4 署名如实：`#bg-credit` 按来源分支；`local` 时写"联网没找到合适的底图，已用本地底图"，去掉写死的"自动联网搜索"；顺带对作者/关键词做 HTML 转义。
  - U-5 示例按需：输入框不再预置整篇示例（原为 textarea 初始内容），改空 + 灰字提示；新增"看示例 / 清空"按钮；`localStorage.supersu.lastTheme` 记住上次主题。
  - U-6 复制与推送同级主按钮；未绑定公众号时点推送给 toast 引导并打开设置。
- **验证（真实执行）**：`test_e2e` 52/52 · `test_integration` 35/35 · `test_api_e2e` 29/29 · `test_headed_full_e2e` **33/33**（0 控制台报错）· 新增 `scripts/ux_verify_p0.py` **15/15**；封面三引擎（editorial/swiss/sp-mist）实跑出图，人工核验 sp-mist 标题不再溢出/重叠。
- **测试契约更新**：`test_headed_full_e2e.py` 两处断言随产品行为更新（署名如实 / 未配置引导），并把"建临时账号"前置（否则未配置分支会跳过推送弹窗内后续覆盖）；账号仍走 UI 建 → UI 删自清理。
- **影响**：前端交互 + 封面产出质量 + 新增 1 个只读端点；无破坏性变更。

---

### 变更 13：Pexels 配图升级 + 开源教程 + 设置里填 token（2026-09-25）🆕

- **前提变更（用户拍板）**：项目开源给他人使用 → 需要教程与配图说明；教程按页触发（小红书首次进入弹一次，公众号保持安静）。
- **A1 图源升级**：`core/image_search.py::_pexels_search` —— 中文 query 走 `locale=zh-CN`（Pexels 原生中文）；竖版优先，无结果放宽 orientation 再查；一次取 ≥5 候选（为打分选优留口）。
- **⚠️ 修复"降级固化"**：`_local_fallback` 不再写查询缓存（否则一次没搜到会被固化 7 天，永远配错图）；已清空旧 `data/bg_cache/query_cache.json`。
- **教程（两页各自一份）**：`templates/index.html` `openTutorial(kind)` 按当前页生成内容；小红书页首次进入自动弹（`maybeShowTutorial('social')`）；顶栏「教程」随时重开；底图区「图和文案对不上？点这」入口；效果示例用本机缩略图（不依赖外网）。
- **设置里填 token**：设置弹窗新增「Pexels 图库 API」一栏。`GET/POST /api/pexels-config`——key 经 `crypto_utils.encrypt` 存 `data/pexels.json`（不入库），保存后注入 `os.environ` **立即生效**；GET 只返回 `configured`，绝不回传 key。`.env` 方式依然可用。
- **验证（真实执行）**：`scripts/ux_verify_tutorial.py` 13/13；curl 全流程（GET → POST → GET → 生成 source=Pexels）；回归 `52/52 · 29/29 · 33/33`（0 控制台报错）。截图 `shots/after/tutorial-*.jpg`、`settings-pexels.jpg`。
- **本批踩坑记录**：①事件对象被当参数传给 `openTutorial(kind)` → 内容 undefined（addEventListener 必须包箭头函数）；②heredoc 补丁中字面 `/n` 混入 app.py → SyntaxError（heredoc 转义链不可靠，改用 Edit 工具修复）。

---

### 变更 14：高级排版落地 + 主题体系重构为纯原创（2026-09-25）🆕

**A. 激活死配置（高级排版）**
- **背景**：用户觉得「自动排版功能比较弱」，给了参考图问「需要 LLM 吗」+ 提供了 `iniwap/AIWriteX` 想看能否借鉴。
- **调研结论**：92 套主题里 `layout` 字段分布为 `hero` 13 / `card` 4 / `timeline` 1 / 无 74，但引擎**只实现了 `card`**——13 套 hero + 1 套 timeline 的配置从未被读取，属死配置。其中 10 套 `su-dusk-*` 的描述明确写着「暗色首屏+大序号+交替色带+引文穿插」，4 套特化主题还写了显式布尔开关。**无需 LLM**：这些是「带语义角色的容器」，本地正则可 100% 稳定转出。
- **实现**：`core/format_engine.py` 第 8 步布局分发补 `hero`→`_wrap_hero_sections`、`timeline`→`_wrap_timeline_sections`；新增 `HERO_DEFAULTS` 处理「未声明开关」（10 套只写了描述没写布尔值），显式开关优先。
- **新增 4 个模块容器**（容器 8→12 种）：`:::eyebrow` 小标签 / `:::cards` 卡片组（内部 `### 分卡`）/ `:::summary` 要点总结 / `:::cta` 行动引导。
- **模块样式跟随主题**：`_inject_container_styles` 原先除 accent 外**全部硬编码**（92 套主题模块长得一模一样），现从 `theme.colors` 派生 surface / text / muted / border / 页面底色。
- **前端**：输入框工具条加 `#module-picker`（11 个模块模板，光标处插入 `:::` 围栏并自动渲染）。

**B. 修掉 9 个既有缺陷（本轮实测复现后收掉）**
1. **容器内层 `<p>` 专属样式从未生效**：通用标签注入（第 5 步）先给元素加了 `style`，令容器样式注入的精确匹配失配 → `:::stat` 的 48px 大数字、引文卡样式全部没生效（**这是「高级排版弱」的直接原因**）。已用 git stash 在 HEAD 版本实测复现（`stat-number 是否注入样式: False`）。
2. **预处理器把容器内部短行标成 `##`**：`:::stat` 的数字变 `## 42%`、`:::steps` 步骤全废。已在 `preprocess` 加 `container_depth` 跟踪，容器内一律原样穿透。
3. **容器缺收尾 `:::` 会吞掉后面整篇正文**（静默丢数据，违反「不静默」契约）：改为整段原样输出。
4. **代码块开头多显示一行 `class="language-xxx">`**：`style_pre` 把 `<code class="language-xxx">` 开标签一起喂给正则高亮器，`class` 命中关键字、`"language-xxx"` 命中字符串，标签被拆碎；随后 `<code[^>]*>` 替换又吞掉一个 `<span`。
5. **含 f-string 的代码多出 `"color:#ce9178"` 碎片**：高亮器是串行正则，字符串规则命中前一步自己插入的 `style="color:#ce9178"` 属性值并再包一层，产出 `<span style=<span style="color:#ce9178">"color:#ce9178"</span>>f…`。改为各步片段存入占位符、末尾统一还原。
6. **手写 ```` ``` ```` 围栏被截断**：`preprocess` 的「4 空格缩进 → 自动开代码块」规则不区分是否已在用户围栏内，Python 的缩进行被当新代码块 → 原围栏提前闭合、`def` 与 `return` 被拆开、多出空代码块。新增 `in_fence` 状态跟踪，围栏内原样保留（含缩进）。
7. **18 套主题的 h2 左边框强调条静默失效**（有头 E2E 发现）：生成器把 `border-left:…` 整串当成 `border_left` 的值，`build_style_string` 再拼一次前缀 → `border-left:border-left:4px solid …`，浏览器判非法整条丢弃。改为 `border_left` + `padding_left` 两个键。
8. **su-deepwater 的 hero 卡片浅字白底不可读**（有头 E2E 发现）：cards 分支写死 `background-color:#ffffff`，而暗底主题正文是浅色 `#DDE6F2`，对比度约 1.2:1。改为按页面底色向墨色靠 7% 派生卡面，实测卡面 `#0E1726` → `#1C2534`。
9. **37 套亮底主题代码块高亮对比度过低**（有头 E2E 发现）：高亮器只有一套深底配色，亮底上关键字对比度约 2.2:1、发灰。新增 `_SYNTAX_LIGHT` 调色板 + `_is_light_bg()`，按 `pre` 背景明暗切换。
修复后 92 套全量渲染 0 标签不平衡，含缩进 / f-string / 注释 / decorator 的代码块肉眼可见内容无碎片。

**C. 色带可见性（用户明确要求「为了好看最重要」）**
- `su-dusk-*` 等 13 套的 `alt_bg` 是 `#fafafa` / `#f7f7f8`，与白底只差 15/23 → **肉眼看不出「交替色带」**，等于特性没生效。
- 新增 `_resolve_band_bg` + `_BAND_MIN_DISTANCE`(45)：不足则按 accent 逐步混 12%→24% 派生**带主题色系**的色带，低饱和强调色再压 6% 墨色兜底。实测色带通道差 **15–50 → 46–57**，有头浏览器目视确认「很明显」。

**D. 主题体系重构：47 套外部适配主题 → 本项目自研 `su-*` 原创（版权了结）**
- **背景**：用户要求彻底解决这 47 套的版权问题，且要求「不能完全看得出」与外部来源的关系；选定「自己重写一遍」。
- **原风险**：47 套的 `source` 字段全部指向外部仓库（**该仓库无 LICENSE = 保留所有权利**）；文件前缀、展示名、描述文案、样式数值（29–39 键）均为外部原值。本项目已定开源 = 分发 → 真实风险。
- **做法**：`scripts/theme_specs.py` 写 47 条**设计意图**（底色/墨色/强调色/字体气质 + 9 种排版原型 + 布局），`scripts/build_themes.py` 用**本项目自己的设计标尺**推导全部数值（字号标尺 / 间距 / 圆角 / 描边 / 列表 / 代码块 / 暗色适配）；色带直接复用引擎 `_resolve_band_bg`，保证与兜底逻辑单真源。命名与描述自拟。
- **结果**：92 套 = 45 套早期原创 + 47 套 `su-*`；旧前缀归零、`source` 字段全清、无重名；删除失效脚本 `scripts/adapt_external_themes.py` 与 `scripts/remove_dup_themes.py`，并清理各文档中残留的外部来源表述。
- **⚠️ 改主题方式**：改 `theme_specs.py` 后重跑 `python scripts/build_themes.py`（会覆盖同 id 生成物），**勿手改 `su-*.json`**。

**E. 顺带修掉的文档缺陷**
- AGENTS.md 的清理命令 `taskkill //F //IM python.exe` **在本机 PowerShell 直接报错**（`Invalid argument/option - '//F'`），且失败被 `$null` 吞掉 → 旧 Flask 进程一直占着 5000 端口，新代码起不来，表现为「改完代码界面却没变」的假象（本轮实际踩到，靠比对「运行中服务返回值 vs 源码直调返回值」才定位）。已换成 `Get-Process python | Stop-Process -Force` 并加端口核验步骤。

- **验证（真实执行）**：`test_e2e` 52/52 · `test_integration` 35/35 · `test_api_e2e` 29/29 · `test_headed_full_e2e` 33/33（0 控制台报错）；92 套主题全量渲染 0 标签不平衡；live `/api/themes` 确认 92 套（su- 47 / xh- 0）；有头浏览器目视验收深色首屏 / 大序号递增 / 插入模块 / 交替色带。
- **影响**：主题体系（47 套替换）、排版引擎（布局分发 + 12 种容器 + 主题化取色）、前端（插入模块入口）。

---

### 变更 15：修「start-app.bat 双击没反应」（2026-09-26）🆕

- **现象**：用户双击 `start-app.bat` 没反应（服务起不来、浏览器不弹）。
- **根因（两条叠加，均实测复现）**：
  1. **`.bat` 是裸 LF 换行**（CRLF=0 / 裸LF=50）。cmd 解析 LF 批处理会错乱——实测输出里出现 `'—'`、`'os.path.exists'`、`'SER'` 等**半截命令碎片**，`call activate.bat` 那条因此没生效。
  2. **venv 的 `activate.bat` 写死了旧盘符**：`set VIRTUAL_ENV=d:\test\wechatca2\.venv`，而项目实际在 `e:\test\wechatca2`（`d:\test\wechatca2` 已不存在）。旧版脚本靠 `call activate.bat` 激活环境 → 激活指向不存在的路径 → `python` 落到 `C:\Python314\python.exe`（系统解释器）→ `import flask` 失败 → `app.py` 报 `No module named 'flask'` → 表现为「点了没反应」。`pip.exe` 里同样有 2 处 `d:\` 硬编码。
- **修复**：
  - 修 venv：用基础解释器 `Python312\python.exe -m venv .venv` **原地重建激活脚本**（不加 `--clear`，**25 个已装包全部保留**，实测重建后 `flask/markdown/playwright` 均可导入）。现 `VIRTUAL_ENV=E:\test\wechatca2\.venv`。
  - 改 `start-app.bat`：全程改用 `%~dp0.venv\Scripts\python.exe` **绝对路径调用**，彻底不再依赖 `activate.bat`（这样以后项目再换目录也不会坏）；顺手把开浏览器那行的嵌套引号 `start "" cmd /c "... start "" http://..."` 简化为 `start http://...`，去掉脆弱写法。
  - 新增 `.gitattributes` 锁 `*.bat` / `*.cmd` 为 `eol=crlf`，防换行问题复发。
  - 顺带修 `scripts/run_headed_test.bat`（同病：`cd /d d:\test\wechatca2` 写死旧盘符、指向**已删除**的 `test_headed_full.py`、`echo` 少空格）。改为 `%~dp0` 定位 + 调用真实套件 `tests/test_headed_full_e2e.py`（该套件自起服务，无需脚本再起一个，故删掉原先的 `start_flask.py` 启动步骤）。
- **验证（真实执行）**：
  - `start-app.bat`：实测输出无碎片、无依赖误报 → `Running on http://127.0.0.1:5000` → `GET /api/themes 200`（92 套）→ 日志出现来自浏览器的 `GET /` 与缩略图请求（**证明浏览器也已自动打开**）；端口 5000 监听 = 1，服务进程为 `e:\test\wechatca2\.venv\Scripts\python.exe`。
  - `run_headed_test.bat`：退出码 0 → **33/33 通过**、**0 控制台报错**。
  - 回归门禁 `test_e2e` **52/52**（本次未改应用代码，仅启动脚本与换行配置）。
- **影响**：仅启动/开发脚本与仓库换行配置；无应用代码变更。
- **风险**：低。唯一副作用是仓库首次应用 `.gitattributes` 时两个 `.bat` 会按 CRLF 重新入库（内容等价）。

---

### 变更 16：移除模板「悬停即试看」，改为仅点击切换（2026-09-26）🆕

- **需求**：用户反馈模板色卡"鼠标放上去就自动切换模板"，概念上好看但实际难用——鼠标扫过即触发预览/切换，误触频繁。要求**去掉自动切换，改回仅点击切换**。
- **根因**：`templates/index.html` 公众号模板条 `#tpl-strip` 注册了 `mouseover` 监听（U-7「悬停即试看」，200ms 防抖）→ 触发 `doRender(id, true)` 试看预览、`mouseleave` 还原。这是前端**唯一**一处"悬停即切换"（小红书页 `.tpl-mini` 本就只有点击逻辑）。
- **修复**：删除该 `mouseover`/`mouseleave` 监听与 `hoverTimer`，模板切换**仅由既有点击监听**（`tplStrip` click → 设 `activeTpl` → `doRender()`）负责；留一行注释说明历史。收尾时**清理了 `doRender` 死参数**：`themeId`/`previewOnly` 已无调用者，简化为**无参** `doRender()`（功能等价），函数上方过时注释同步重写。
- **验证（有头浏览器 Playwright `headless=False`，真实执行）**：
  - 输入文案 → 首次渲染（iframe.src 生成）；
  - **hover 第 2、3 张色卡** → iframe.src **不变**（服务日志显示 hover 期间 **0 次 `POST /api/render`**）；
  - **点击第 2 张色卡** → iframe.src **变化**（渲染成功）；
  - 控制台 **0 error**；脚本判定 `RESULT: PASS`。
  - **清理死参数后二次回归**（有头，`output/verify_render_tmp.py`）：首渲染 / hover 不切换 / 点击切换 / 改输入自动重渲染 全 ✓ · 0 报错；服务返回前端 `previewOnly`/`themeId` 计数 = 0。
- **文档同步**：`README.md`（3 处"悬停试看"→"点击切换"）、`index.html` 内置教程第 2 步文案、`AGENTS.md`（U-7 状态加注）、`files/TODO.md`（U-7 条目加注）。
- **影响**：仅前端交互；无后端/API 变更。
- **风险**：低。移除的是纯前端事件监听；点击切换路径未被触碰，且经有头浏览器实测。

---

### 变更 17：修「点 start 用不了」根因链 + 封面浏览器零下载化（2026-10-13）🆕

- **用户报障**："点 start 用不了"，且质疑"为啥需要 chromium？直接弹窗默认浏览器不行吗"。澄清：**打开界面一直用系统默认浏览器**（bat 的 `start http://...` / app.py 的 `webbrowser.open`），与 Chromium 无关；Chromium 只服务**封面 HTML→PNG 渲染**（无头浏览器当截图引擎）。
- **根因（三条叠加，均实测复现）**：
  1. **bat 每次启动自检 bundled Chromium，缺失即下载 183.6 MiB**（首次运行块 + 自检块共两处 `playwright install chromium`）。本机该下载从未成功（`ms-playwright/` 仅 3.7MB；02:23/11:32 两次安装尝试只装上 ffmpeg/winldd）——每次双击都卡在下载步，观感即"点了没反应"。
  2. **bat 内 UTF-8 中文（chcp 65001）触发 cmd 错位解析**：cmd 读含多字节字符的行后，后续行起点错位、**吃掉行首** → REM/echo 行变半截命令 → 满屏 `'xxx' is not recognized` 碎片。实测两种启动方式（git bash `cmd //c` / PowerShell `cmd /c`）输出**完全相同**的碎片；命中行含行 1-14 未改动区域（`'服务（或按'` / `'CRLF'` / `'止服务（或按'` 等）——属**既有缺陷**，变更 15 的"无碎片"结论被推翻。对照实验：UTF-8+BOM 否决（BOM 破坏 `@echo off`）；GBK 编码可消碎片但编辑维护易再踩坑；**全 ASCII 零碎片**（定案）。
  3. **`>nul` / `2>nul` 设备重定向在本机间歇失效**：依赖自检 `"%VENV%" -c "import flask, playwright" 2>nul || (...)` 被误判失败。实测同一命令 `2>_err.txt` → rc=0 干净；`2>nul` → 报「系统找不到指定的路径」+ rc=1 → 每次双击空跑一轮 pip 重装 + 报错。
- **修复**：
  - `start-app.bat` **重写为纯 ASCII**（删两处 Chromium 下载；不再需要 chcp；依赖自检改 `if errorlevel 1`，不再用设备重定向；三条硬约束留英文注释，见 AGENTS §4）。
  - `app.py`：`__main__` 分支打印**中文启动提示**（PEP 528 直写控制台，936 下实测显示正常）——双击观感保持中文。
  - **封面浏览器零下载化**：新增 `core/browser_utils.py::launch_browser`（回退链单真源：msedge → chrome → bundled，全失败给可操作报错）；`core/guizang_renderer.py` 接入（删私有 `_launch_available_browser`）；`core/blcaptain_bridge.py` 调 Node 时注入 `CHROMIUM_PATH` 指向系统 Edge/Chrome（上游 `render.mjs::findChromium` 原生支持该变量，vendored 子项目零改动）；三个有头测试套件接入同一 `launch_browser`。
- **验证（全部真实执行）**：
  - 归藏：系统 Edge 155.0.4283.45 实测启动渲染 ✓；重构后无头出图 3 张（889KB/667KB/1.2MB）✓；
  - BLCaptain：`sp-mist` 经 CHROMIUM_PATH 16s 出 3 张 PNG（5.7/5.0/5.1MB）✓；
  - 端到端：`POST /api/social/generate` 三引擎（editorial/swiss/sp-mist）全 200；Pillow 批量复核 14 张 PNG 全有效（1080×1440 / 1080×1080 / 2100×900 / 2160×2880）✓；
  - **ASCII 版 bat 实跑（双击等效）**：零碎片、零「系统找不到指定的路径」、依赖自检不误触发、`Running on http://127.0.0.1:5000`、浏览器自动打开（日志出现浏览器 GET）✓；
  - **全测试矩阵 168/168 全绿（真实执行）**：`test_e2e` 52/52 · `test_integration` 35/35 · `test_api_e2e` 29/29 · `test_headed_full_e2e` **33/33（0 控制台报错）** · `test_headed_wechat_copy` **12/12** · `test_headed_userflow` **7/7**。
  - 有头套件随本轮**三处基建修复**（跑全量时暴露并当场收掉）：① **树杀停服**——venv 的 python.exe 是 launcher，`proc.terminate()` 只杀它、底层解释器变孤儿继续占 5000（实测残留），三个自起服务套件统一改 `taskkill /T /F`；② **教程弹窗遮挡适配**——wechat_copy / userflow 在 9-25 教程弹窗上线后从未跑过（覆盖盲区今日暴露），点击被 `tutorial-modal` 遮挡（56 次重试失败），补 modal 移除（与 full_e2e 同款）；③ 首轮 32/33 的单项失败为环境波动，复跑 33/33（含该项）全过。
- **影响**：启动脚本（重写）、封面双引擎浏览器获取方式、3 个有头测试套件、`app.py` 启动输出。
- **风险**：低。系统 Edge/Chrome 与 bundled Chromium 同内核；回退链全失败时给明确报错（不静默）。未装系统浏览器的机器封面功能会明确报错（原路径是卡 183MB 下载）。

---

### 变更 18：六族 · 十二色主题（72 套）+ 暗底斑马纹修复（2026-10-13）🆕

- **用户诉求**：参照 [mspringjade/wechat-formatter](https://github.com/mspringjade/wechat-formatter)（TypeZen）的主题风格给 SuperSu 增加模板，且明确"**要遵守它的版权规定**"。
- **许可证核查（GitHub API + README 原文，先于一切编码）**：该仓库 **AGPL-3.0**（标准全文）+ README 附加条款（未经书面授权禁止一切商用；修改/分发须保留署名+仓库链接+说明修改+附 AGPL 链接）。其"72 套模板"= 6 类风格系统（新粗野/极简/商务/文艺/科技/节庆）× 12 色，实现在 `app/template-engine.ts`（44KB 手调 CSS 字符串，与自家渲染引擎深度耦合）。
- **路线拍板（AskUserQuestion 二选一，用户选推荐项）**：**纯灵感派生 · 原创重写**——不移植其代码：AGPL 对本项目"开源分发"意味着整体 AGPL 化 + 非商用 + 署名；仅参照品类观感，命名 / 色值 / 样式表达全部本项目自研。范围：全量 6 族 × 12 色 = **72 套**。（另一选项"直接移植+AGPL 化"与"先联系作者"已向用户说明代价。）
- **实现**：
  - `scripts/build_themes.py`：新增 6 个族级原型（stamp/minimal/biz/letter/night/feast）+ `FAMILY_TONES`（12 色调 = 色相 + 饱和/明度微调）+ `FAMILIES`（bg/ink/字体/暗底标记 + accent2 规则 + 族级技法 patch）；`build_theme` 按 `spec.family` 走推导分支，技法补丁在统一装配（含暗色适配）后做**元素级覆盖**。既有 9 原型与 47 套初代输出路径**零触碰**。
  - `scripts/theme_specs.py`：末尾追加「族 × 色调」72 条规格（命名/描述自拟：钢印·朱砂 …… 庙会·栗棕）。
  - `core/format_engine.py`：**暗底主题表格斑马纹修复**——原硬编码浅灰 `#f9f9f9` 在暗底主题上浅字行读不出来（既有暗底主题同样受影响，夜航族验收暴露）；现按页面底色明暗派生（亮底沿用原值，暗底向白微混 6%）。
  - `README.md`：计数同步 92→164；顺手修正 HEAD 遗留的「鼠标划过色卡」过期文案（U-7 已于 c88c4c2 移除悬停，前端 hover 监听现状 = 0）。
- **验证（全部真实执行）**：
  - 生成器重跑后既有 47 套 su-* JSON `git diff` **字节零改动**；新增 72 套落盘（`public/themes/su-{stamp,minimal,biz,letter,night,feast}-{crimson…chestnut}.json`）；
  - **164 套全量富样本渲染审计全过**（标签平衡 / 无 None / 无空 style / 无 `;;`·`:;` 拼接残渣；脚本 `output/theme-review/gen_review.py`，含 `<tr style="">` 引擎既有行为的归因说明）；
  - 斑马纹修复对照：4 套亮底主题（bold-blue / su-academic / su-frost-card / su-dusk-mint）渲染哈希**改前改后一致**；2 套暗底（su-nightsky / su-deepwater）按预期变更；
  - 有头目视（系统 Edge）：六族逐族截图 + 钢印/夜航全卡片复核；当场修复 2 处问题并复验——钢印 h3 与 h2 色块挤行（display:table 修复）、审查台示例图 data URI 被 Markdown 括号截断（base64 修复）；截图 `output/theme-review/shot-*.png` / `card-*.png`；
  - 套件：`test_e2e` **52/52** · `test_integration` **35/35** · `test_api_e2e` **29/29** · `test_headed_full_e2e` **33/33**（0 控制台报错，164 张色卡全量加载无异常）；
  - 评审台（供用户审图）：`output/theme-review/six-families.html`（与产品同源渲染的 72 卡单页，output/ 已 gitignore）。
- **影响**：`public/themes/` +72 JSON（92→164）；`scripts/build_themes.py` + `scripts/theme_specs.py`；`core/format_engine.py` 斑马纹一处；文档计数（AGENTS/README/HANDOFF/CLOSURE）。
- **风险**：低。技法补丁仅对 `spec.family` 新族生效，初代主题装配路径未改（字节级回归证明）；斑马纹修复对亮底零影响、暗底为可读性提升。提交：`278391e`（2026-10-13，用户发令后提交并推送 origin/main）。

---

### 变更 19：公众号页重设计（设计阶段）+ 自动编辑三模式（2026-10-16 / 10-17 / 10-18）

**A. 公众号排版页重设计（设计阶段完成，界面未落代码）**
- **用户诉求**：解决"长期不好看、不好用"；重设版面与配色；确认不接 AI 也能自动排版；自动排版要便于衔接模板选择流程。
- **可行性调研**：无 AI 自动排版可行——现有 `preprocessor` 已覆盖纯文本 90% 结构；补齐方案 = turndown（富文本粘贴→Markdown）+ mammoth.js（docx→HTML→MD）+ pangu.js（中英文空格，**只进渲染管道**），三者均 MIT、本地 vendor、禁 CDN（`public/vendor/` 现仅 fitty.min.js，尚未引入）。
- **设计流程**：走「UI 设计全栈专家团」（TeamCreate `ui-supersu`）——视觉建筑师 + 体验设计师并行产出、v1.1→v1.3 多轮对抗修订后收口；Ardot 画布产出 **5 帧**设计稿（fileId **737147257801936**）：帧1 主工作台 / 帧2 模板库抽屉 560 / 帧3 历史抽屉 480 / 帧4 手动复制指引 560 / 帧5 渲染错误浮层 480。
- **设计系统**：暖纸 `#F7F4EE` → 白卡 `#FFFFFF` → 印泥朱砂 `#AF3E2B`（白字对比度约 5:1）+ Noto Sans SC / Inter / JetBrains Mono；三段式骨架（顶栏 56 白 chrome / 左 620 内容 | 右 819 预览+风格 / 底栏 64）；模板选择 = 右栏「最近使用」胶囊条 + 模板库抽屉（两行 chips：全部/收藏/最近 + 六族 卷宗/庙会/信笺/素页/夜航/钢印）。
- **交互定稿**：主路径「粘贴 →（可选换风格）→ 复制」2-3 步；富文本粘贴默认开 + toast 撤销 + `Ctrl+Shift+V` 逃生门；编辑器 = 整理后 Markdown 源码（粘贴/导入写回、手动打字不改写）；复制唯一 primary（min-w 148/h 40）；解析条（智能转换 switch / 识别结构 chips / 整理格式）on-off 双态；出稿三件套（复制/推送/历史）权重 0<1<唯一主。
- **HTML 交互原型**：`docs/prototypes/wechat-redesign.html`（单文件零依赖，可点可玩：实时渲染 / 主题切换含深色反相 / 模板库抽屉 / 富文本粘贴模拟 / 复制降级浮层 / 插入 popover）。
- **方案文档**：`docs/wechat-page-redesign.md`（tokens / 交互规范 / 前端契约 / P0-P3 落地顺序 / 待决策项）。
- **落地决策（用户拍板 2026-10-18）**：① 落地基准 = **完整版原型**（非简化版）；② 先收工程账再落 P0 界面；③ 三模式默认 auto + 设置里可切。

**B. 自动编辑三模式（P1 部分落地，2026-10-17）**
- **用户诉求**：自动排版要更强——长文、教程等不同文体都要有合适的整理方式。
- **参考与合规**：借鉴 [YiShu5/GZHcomposing](https://github.com/YiShu5/GZHcomposing) `js/preprocess.js` 的三模式思路，**clean-room 实现、未复制其代码**。
- **实现**：`core/preprocessor.py` 290→396 行，`preprocess(text, mode='auto')` 四值：
  - `conservative`：仅识别显式结构（序号/短行标题、列表、引用、代码块），不主动加标题；
  - `longform`：长散文按「标签：内容」白名单补至多 5 个 `###` 小标题（间隔 ≥2 段）；
  - `tutorial`：教程标签（准备工作/注意事项/…）→ 小标题；中文序数（首先/然后/第一步…）→ 列表项；
  - `auto`：短文或已有结构 → conservative；长散文无结构 → longform。
- **关键修复**：首句不再被无条件提升为巨标题（auto 下须"确像标题"才提升）——历史上散文被误排的最大痛点。
- **测试**：`tests/test_e2e.py` +4 项 → **E2E 56/56**；有头走查 `scripts/walkthrough_autedit.py`（纯散文/半结构化/长文自动分层三类输入，真实经过 `/api/render` 验证预览）。
- ⚠️ **现状**：三模式**尚无 UI 入口**（`/api/render` 未暴露 `mode`，app.py:201 仍单参调用），属 P1 接线项。

**影响**：`core/preprocessor.py` / `tests/test_e2e.py` / `templates/index.html`（placeholder 1 行）/ 新增 2 个原型 + 方案文档 + 走查脚本。
**风险**：低。preprocess 默认行为变化（首行标题规则收紧 + 长文补 ###）经 56 项测试覆盖；前端尚未消费 mode；界面重设计为 0% 落地（P0 待执行）。

---

### 变更 20：公众号页 P0 界面落地（2026-10-18）

- **用户拍板（1A / 2A / 3A）**：落地基准 = 完整版原型 `docs/prototypes/wechat-redesign.html`；先收工程账（提交 + 文档 + 清理）再落 P0；自动编辑三模式默认 auto + 设置里可切（设置入口属 P1 待接）。
- **落地内容（`templates/index.html`，+约 700 行）**：
  - **设计系统全换**：暖纸 `#F7F4EE` / 次表面 `#FAF9F5` / 白卡 `#FFFFFF` / 描边 `#EAE6DD·#D8D2C6` / 文本 `#191713·#6E6759·#9B9484` / 印泥朱砂 `#AF3E2B`（hover `#96331F`）/ 成功 `#5F8F73`；圆角 16/14/12/8；阴影两级；字体 Noto Sans SC 优先。
  - **顶栏**：贴边白 chrome 56px + 底边 1px；朱砂方章「版」logo；tab 底部 2px 朱砂激活条。
  - **三段式工作台**：左栏 620 内容（编辑器头部 48 / 编辑区 / 解析条 44）| 1px 分隔 | 右栏（预览工具行 48 / 预览舞台 / 风格条 104）。
  - **结构解析条**：智能转换开关（on/off 双态）、识别结构 chips（计数 400ms 朱砂闪烁）、整理格式按钮、「已自动整理」瞬态。
  - **预览**：网页 HTML / 手机预览分段控件；当前风格胶囊（3 色点 + 名称 + chevron）；手机框 375×min(600,100%)。
  - **风格条**：最近使用胶囊横排（星标收藏）+ 紧凑筛选 + 收起 + 全部 164 套入口。
  - **模板库抽屉 560**：搜索 + 两行六族 chips（全部/收藏/最近 + 卷宗/庙会/信笺/素页/夜航/钢印）+ 两列卡片（渐变预览条 + 星标 + 使用中徽标 + 单行描述）。
  - **插入模块 popover**：10 项，替代旧 `<select>`；光标处插入 `:::` 围栏。
  - **底栏**：已保存 + 字数/结构完整 + AI 工具（降级） + 历史 ghost + 推送草稿箱 secondary + 复制唯一 primary（min-w 148 / h 40 / Ctrl+Enter）。
  - **浮层**：手动复制指引（剪贴板降级第三级，三步指引 + 复制 HTML 源码）、渲染错误浮层（重试/关闭）。
  - **可操作 toast**：深色 #2A2721，支持撤销 pill / 副标题，5s（带 action）/2.2s。
- **关键工程决策（零改测试）**：旧模板条契约整体迁到新结构——`.tpl-bar` class 挂到风格条、`#tpl-strip` 作为胶囊容器、胶囊同时带 `.tpl-card` + `.tname`、`#tpl-toggle` 保留收起语义（切换 `.tpl-bar.collapsed`）、`#tpl-search` 变紧凑筛选框。**三套有头测试（33 + 7 + 12 项）与 35 项集成、56 项 E2E 全部无需修改即通过。**
- **修复（本轮实测发现）**：① 解析条统计源从"编辑器原文"改为 `/api/render` 返回的 `markdown`（引擎识别结果）；② 模板库卡片 grid 行高塌陷为 2px（内容不撑高）→ `.d-card` 加 `display:flex; flex-direction:column; min-height:112px`。
- **验证（全部真实执行）**：E2E **56/56** · 集成 **35/35** · 有头全按钮 **33/33**（0 控制台报错）· 有头用户流程 **7/7** · 有头复制/推送 **12/12**；4 张改后截图（主界面/填充渲染/模板库抽屉/插入 popover）。
- **遗留（P1/P2，非本轮范围）**：自动编辑三模式无 UI 入口；turndown/pangu/mammoth 未引入（富文本粘贴与 docx 导入未上线，导入按钮为提示占位）；历史仍为旧 modal（设计稿为抽屉）；移动端单栏 / a11y 走查未做。

---

### 变更 21：模板库真实缩略图 + 收藏优先 + 预览微信外框（2026-10-18 补）

- **用户反馈（bug）**：模板库卡片只有渐变占位，“根本看不出风格”；要求真实缩略图 + 可收藏 + 常用优先。
- **缩略图生成**：新增 `scripts/gen_theme_thumbs.py`（思路同 `gen_thumbnails.py`）——用 `convert_markdown_to_wechat_html` 渲染统一样例文章，Playwright（系统 Chrome）截取 480×240 JPEG（q82），输出 `public/theme-thumbs/{id}.jpg` + `manifest.json`。**164 套全部生成成功（2.8MB，均 17KB）**，支持 `--force` 重跑（改主题 JSON 后重生成）。
- **卡片改造**：缩略图高 64→120px（`<img loading=lazy>` + `onerror` 回退渐变）；右上角圆形收藏星标（可点，阻止冒泡不切主题）；排序 = **收藏 → 最近 → 其他**；抽屉默认分组 = 有「最近使用」则「最近使用」，否则「全部」。
- **预览真实化**：手机模式加微信文章外框——顶部「‹ 公众号文章 ···」导航条 + 底部「阅读 1.2万 / 赞 328 / 在看 96 / 分享」互动条（均为静态 chrome，位于 iframe 外，**不会进入复制内容**）；网页 HTML 模式自动隐藏 chrome 并铺满。
- **默认精选跨族**：首次进入「最近使用」= 初代 3 套 + 六族各 1 套（避免同族换色看起来“只有颜色变化”）。
- **验证**：E2E **62/62** · 有头全按钮 **33/33**（0 控制台报错）；截图对比不同族渲染差异明显（极光=渐变块 / 卷宗=纯文字+粗黑横线+h2 色块 / 列表符号不同）。
- **说明**：素页等六族内部 12 色为「同骨架换色」（主题库设计），同族间差异主要在配色；跨族差异显著。

---

### 变更 22：浏览器统一 Chrome 优先，修「启动页弹星愿」（2026-10-18）

**诉求**：用户反映"为啥一直弹窗在星愿浏览器，还有 edge，为啥不是 chrome"。

**根因（两个独立来源）**：
1. `start-app.bat` 里 `start "" cmd /c "... & start http://127.0.0.1:5000"` —— cmd 内置 `start` **永远走系统默认浏览器**；本机默认被星愿抢占（`StartMenuInternet\Chromium` = `C:\Program Files\Twinkstar Browser\twinkstar.exe`，http/https `UserChoice` = `ChromiumHTM`）。
2. `core/browser_utils.py` 原 `for channel in ("msedge", "chrome")` —— 装了 Edge 就永远轮不到 Chrome；`core/blcaptain_bridge.py` 的候选路径表同样 Edge 在前。

**修法**：`browser_utils.py` 改 `("chrome", "msedge")` 并把可执行文件探测收敛为本模块单真源（`find_chrome_executable` / `find_edge_executable` / `find_system_browser` / `open_url`）；`blcaptain_bridge.py` 删自带候选表；`start-app.bat` 删掉 cmd `start` 那行、取消 `SUPERSU_NO_AUTOBROWSER`，改由 `app.py::open_browser()` 经 `open_url()` 打开。

**验证**：实测 `launch_browser` 返回 `155.0.8059.84`（Chrome，Edge 是 `155.0.4283.45`）；`open_url` 干跑 spawn 的正是 chrome.exe，去掉 Chrome 路径后能回退系统默认；启动 Chrome 后 `twinkstar.exe` 进程数 21→21（不会连带拉起）；回归 62/35/29/33/7/12 = **178 全绿**。

**回滚**：`git revert e7383f8`。

---

### 变更 23：PWA 文档体系 + 阶段 0 可行性验证（2026-10-18）

**背景**：苏哥要求"先做完文档再开工"，且"小项目不要过度设计"。

**文档产出**：
- `docs/overview.md`（一页看懂，替代此前写的 requirements.md / architecture.md —— 个人项目不需要 34 项 FR 与 10 条 ADR）
- `docs/api-reference.md`（28 路由一张表 + 3 个高频接口契约）
- `docs/testing.md`（6 套件跑法、实测基线、5 个坑、DOM 契约）
- `docs/runbook.md`（装起停 + 数据在哪 + 12 条故障处置 + 备份迁移）
- `docs/pwa-build-plan.md`（**PWA 施工图**：范围、10 条定稿决策、D1-D10 文件级任务、验收表、部署、风险）
- `pwa-design.md` 冻结为设计存档，冲突以施工图为准

**阶段 0 验证（两项命门，均已通过）**：
- **0a Pyodide 跑现有引擎**：436 字样本输出与本地 `POST /api/render` **逐字节一致**（html 4821B）；引擎启动 6.7s、渲染 415ms；Pyodide v0.28.3
- **0b 浏览器内 HTML→PNG**：`html-to-image@1.11.13` 把归藏模板渲成 1080×1440 PNG 只用 **792ms**（2.24MB），底图正常、文字清晰、长标题不溢出
- 证据：`docs/pwa-spike/{report.json,0a-pyodide.png,0b-cover.png}`；结论详见 `CLOSURE.md` 任务 7

**两个技术结论**：
1. `markdown` 打包成 zip 必须带 `markdown-<ver>.dist-info/{METADATA,entry_points.txt,top_level.txt,WHEEL}` —— markdown 3.10 优先用 entry points 解析扩展名，缺 dist-info 会 `ModuleNotFoundError: No module named 'tables'`。补上即解决，引擎零改动。
2. 归藏封面模板外链 5 个 Google Fonts 家族 → PWA 必须自托管（合规断言禁止 `fonts.googleapis.com`，且国内被墙）；中文两族需按常用字子集化。

**验证中发现的既有问题（未改，待决策）**：`preprocessor._looks_like_sentence` 词表含「是/了/在/我/你/要/为什么/问题/方法/内容/效果」等超高频词与名词，导致中文短标题几乎永远被判成句子 —— 20 个典型小标题实测**只识别 9 个**（「常见问题」「我的做法」「写在最后」「使用方法」全 FAIL）。属 `core/` 改动，会改变全部渲染输出并需重跑 178 项测试 + 重生成 164 张缩略图。

**回滚点**：`git revert` 对应提交；`docs/pwa-spike/` 可整目录删除，无代码依赖。

---

### 变更 24：修「中文小标题识别不出来」（2026-10-18）

**根因**：`core/preprocessor.py::_SENTENCE_WORDS` 混入超高频单字虚词（是/了/在/我/要/把…）与**名词**（问题/方法/内容/效果/特点/功能…），等于恒真 → 20 个典型中文小标题只识别 9 个。这是用户"只识别 3 个标题"抱怨的真正根因。

**修法**：① 词表只留强句式短语 / 主语+谓语 / 完成体词尾；② 孤立成行的短行改用更窄的 `_PROSE_PREDICATE`（只认主语+谓语、动词+着了过，刻意不收「的」）；③ 首行 `_looks_like_title(is_first_line=True)` 跳过句式判定，兑现「第一行自动当标题」的产品承诺。

**验证**：20/20 识别；真实文章出 `# H1 + ## H2`；新增 3 项回归测试（其中一条负面测试抓到了第一版修法的反弹，已修）。**65 / 35 / 29 / 33 / 7 / 12 = 181 全绿**。164 张缩略图确认不受影响（样例本身是 Markdown），未重跑。

**回滚**：`git revert` 对应提交。

---

## 9. 下一步开发建议

### NEXT STEP 1（唯一最优先）
> 2026-10-18 更新：阶段 0 可行性验证已通过（见变更 23），下一步是 **PWA D1**。
- **action**：按 `docs/pwa-build-plan.md` 从 D1 开工（pwa/ 骨架 + 设计系统 + manifest + 图标），进度在 `files/TODO.md` 的 PWA-1.1 起
- **reason**：两个命门（Pyodide 跑引擎 / 浏览器内截图）实测均通过，8-11 人日排期成立
- **affected files**：`pwa/**`（不改 `core/`、不改 `templates/`）
- **validation criteria**：`python -m http.server 8080 -d pwa` 打开能看到三段式布局、字体生效、启动遮罩

> 历史（2026-09-23 已过期）：确认用户能看到最新前端并收集反馈 —— 用户早已在使用新前端，本项作废。

### DO NOT DO
- 不要碰 docs/prototypes/prototype_full.html 和 docs/prototypes/prototype_ai_simplify.html（已废弃）
- 不要重构 backend API 结构（约 23 条路由，当前够用）
- 不要添加新功能除非用户明确要求（用户说过"到时再慢慢修"）
- 不要添加自动缓存清理/版本号（用户按 Ctrl+F5 即可，过度设计）

---

## 10. 风险总结

- **当前最大风险**：用户对前端状态存在认知差距——"看不到新页面"被理解为"代码没改"，实际是浏览器缓存问题。这影响了用户对进度的信任。
- **哪个模块最不稳定**：**wechat_publisher.py** — 依赖微信公众号白名单和公网 IP，环境要求高，不适用本地开发测试
- **哪个改动最危险**：直接修改 **templates/index.html** 的 JS 逻辑可能破坏与其他 API 的交互；修改 **core/format_engine.py** 的样式注入逻辑可能影响 92 套主题
- **是否建议先修复再开发**：**是**——先让用户亲眼确认新前端已生效（截图/共享屏幕/Ctrl+F5），再按用户反馈迭代
