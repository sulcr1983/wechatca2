# API 速查

全部路由都在 `app.py`（单文件，28 个）。默认 `http://127.0.0.1:5000`。

> 本机开着 Clash 时 curl 必须加 `--noproxy '*'`，否则返回 502。

## 一览表

| # | 方法 | 路径 | 用途 |
|---|---|---|---|
| 1 | GET | `/` | 主页面（单文件 SPA） |
| 2 | GET | `/api/themes` | 主题列表（含 primary/accent/background 配色） |
| 3 | POST | `/api/render` | **核心**：纯文本 → Markdown → 公众号 HTML |
| 4 | GET | `/api/optimize-stream` | SSE，消费后台 LLM 优化结果 |
| 5 | POST | `/api/polish` | AI 润色（整篇改写，需配置 AI） |
| 6 | POST | `/api/ai-format` | AI 智能排版（AI 只给结构决策，正文原样） |
| 7 | GET | `/api/accounts` | 公众号账号列表 |
| 8 | POST | `/api/accounts` | 新增/更新账号 |
| 9 | DELETE | `/api/accounts/<id>` | 删除账号 |
| 10 | GET | `/api/history` | 推送历史 |
| 11 | POST | `/api/summary` | AI 生成 80-100 字摘要 |
| 12 | POST | `/api/cover-image` | 生成公众号封面图（返回图片字节） |
| 13 | GET | `/temp_covers/<file>` | 取临时封面图 |
| 14 | GET | `/output/<path>` | 取输出产物（封面/图片） |
| 15 | GET | `/assets/<path>` | 取 `public/` 静态资源 |
| 16 | POST | `/api/push` | 推送到公众号草稿箱 |
| 17 | POST | `/api/social/generate` | **核心**：小红书封面生成 |
| 18 | GET | `/api/social/progress/<task_id>` | 封面生成进度轮询 |
| 19 | GET | `/api/pexels-config` | 读图片源配置 |
| 20 | POST | `/api/pexels-config` | 写图片源配置 |
| 21 | GET | `/api/social/styles` | 封面风格列表 |
| 22 | GET | `/api/social/thumbnails` | 封面风格缩略图 |
| 23 | POST | `/open-folder` | 在资源管理器打开产物目录 |
| 24 | GET | `/api/ai-config` | 读 AI 配置（密钥脱敏） |
| 25 | POST | `/api/ai-config` | 写 AI 配置 |
| 26 | POST | `/api/ai-config/test` | 测试 AI 连通性 |
| 27 | GET | `/api/ai-platforms` | 支持的 AI 平台预设 |
| 28 | GET | `/api/server-ip` | 本机局域网 IP（给手机访问用） |

## 三个必须知道的

### POST /api/render

最常改的接口。**参数名是 `raw_text` / `theme_id`，不是 `text` / `theme`。**

```json
{ "raw_text": "纯文本内容", "theme_id": "monocle", "skip_preprocess": false }
```

- `skip_preprocess: true` 跳过本地规则预处理，`raw_text` 直接当 Markdown
- 成功返回 `{success, html, markdown, ...}`；`markdown` 是排版后的中间结果，前端「结构解析条」就消费它
- 主题不存在返回 404 `theme not found: <id>`
- 主题 id 不要硬编码 `default`——92 套里没有 default，动态取 `/api/themes` 首项

### POST /api/social/generate

依赖 Playwright（两套封面引擎都用），缺了直接 500 `No module named 'playwright'`。

```json
{ "text": "文案", "style": "editorial", "images": { "xxx": "data:image/png;base64,..." }, "task_id": "可选" }
```

异步执行，前端用 `task_id` 轮询 `/api/social/progress/<task_id>`。

### POST /api/ai-format

AI 只输出**结构决策 JSON**，正文由本地原样套用，不改写一个字。AI 不可用时自动降级到本地规则排版并说明原因——按钮永远给得出结果，不会转圈卡死。

```json
{ "text": "正文" }
```

## 约定

- 所有 POST 收 JSON，出错返回 `{success: false, error: "..."}`
- 密钥（AppSecret / AI Key）加密存 `data/*.json`，GET 接口一律脱敏
- `data/`、`.env` 不进 git
