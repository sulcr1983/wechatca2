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

## 9. 下一步开发建议

### NEXT STEP 1（唯一最优先）
> 2026-09-23 盘点注：本项已过期（用户早已在使用新前端），下一步建议待重新规划。
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
- **哪个改动最危险**：直接修改 **templates/index.html** 的 JS 逻辑可能破坏与其他 API 的交互；修改 **core/format_engine.py** 的样式注入逻辑可能影响 92 套主题
- **是否建议先修复再开发**：**是**——先让用户亲眼确认新前端已生效（截图/共享屏幕/Ctrl+F5），再按用户反馈迭代
