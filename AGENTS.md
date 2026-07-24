# AGENTS.md — SuperSu 个人工具项目规则

## 1. 项目定位

SuperSu 是本地化微信公众号自动排版 + 小红书封面生成工具。
核心理念：**纯文本进，排版出。不用 AI 就不开 AI。**

- 自动 Markdown 预处理（本地规则，零延迟零费用）
- 53 套主题自动排版（Markdown → 微信内联 HTML）
- 小红书封面生成（归藏设计系统 + 后续接入 BLCaptain）
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
  format_engine.py      排版引擎（53 主题，Markdown → 微信 HTML）
  preprocessor.py       纯文本 → Markdown（正则规则，零延迟）
  ai_client.py          多平台 LLM 客户端（润色/摘要/排版）
  image_gen.py          封面图生成（LLM 关键词 → 文生图 → PIL 叠加）
  token_manager.py      微信 Access Token 管理（线程安全单例）
  wechat_publisher.py   微信公众号 API（素材上传 + 草稿推送）
  crypto_utils.py       API Key 加密存储
  blcaptain_bridge.py   BLCaptain 封面引擎适配层（Node.js）
  guizang_renderer.py   归藏封面渲染（自包含版，备用）
scripts/
  render_worker.py      归藏封面渲染（基于 cover-templates 模板）
  gen_thumbnails.py     用 Playwright 生成封面缩略图
  gen_thumbnails_pil.py 用 PIL 生成占位缩略图（无 Playwright 时）
  run_headed_test.bat   有头浏览器 E2E 测试启动脚本
  start_app.ps1         应用启动脚本（PowerShell）
templates/
  index.html            单页前端（公众号 + 小红书双页面）
public/                 静态资源（原 assets/，由 /assets/* 路由提供）
  themes/               53 套排版主题 JSON
  cover-templates/      10 套归藏封面模板（swiss/editorial 各 4-6 套）
  images/               封面模板库存图
  social-thumb/         模板缩略图
references/             归藏设计系统参考文档
data/                   运行时数据（配置/账号/历史）
output/                 封面渲染输出
docs/
  prototypes/           早期 HTML 原型（prototype_*.html）
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

## 6. 公众号页面关键元素

```
#page-wechat
  .header           → 模式切换 + 主题选择 + AI 按钮（折叠隐藏）
  .main-body
    .editor         → #input-area（textarea，放大字体，响应式 rem）
    .preview        → iframe 实时预览
  .footer           → 底部操作栏
  弹窗层             → AI 润色/推送/公众号管理/历史记录
```

## 7. 小红书页面关键元素（归藏 7 步工作流）

```
#page-social
  .studio-header    → 返回 + 标题 + 状态
  .studio-body
    .studio-controls  → 文案输入 + 模板网格 + 图片上传 + 生成按钮
    .studio-preview   → 模板预览 + 生成结果 + 大图查看
```

## 8. 测试工作流

```
1. python app.py                            ← 启动服务
2. python tests/test_integration.py         ← 前后端联动测试
3. python tests/test_e2e.py                 ← 全量 E2E
4. 检查 output/ 目录                        ← 验证封面生成
```

## 9. 已知注意事项

- `scripts/render_worker.py` 和 `core/guizang_renderer.py` 都需要 `playwright install chromium`
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
