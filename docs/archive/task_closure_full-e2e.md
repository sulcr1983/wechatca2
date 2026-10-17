# 任务收尾文档：全系统前后端 E2E + 公众号复制/渲染根因修复

> 日期：2026-07-26
> 触发：用户反馈「公众号预览后点复制没反应、复制不到公众号」+ 要求「所有按钮、所有输出、前后端全量 E2E 各测一次」
> 结论：发现并修复 2 个真实产品 bug（复制富文本、首主题自动选中）+ 1 个改进（筛选匹配 id）；补充 2 份全量 E2E（后端 29/29、前端 26/26、0 控制台报错）。

---

## 一、用户反馈与根因

| 现象 | 真因 | 类型 |
|------|------|------|
| 点「复制」没反应 / 复制到公众号是一坨源码 | 原 `#btn-copy` 用 `navigator.clipboard.writeText(lastHtml)` 只写**纯文本**，粘贴到公众号进不去排版样式 | 真 bug（功能失效） |
| 刚进页面直接打字，预览不渲染 | `activeTpl` 仅在手动点选模板时赋值；加载后未初始化 → `doRender()` 因 `!activeTpl` 提前返回 | 真 bug（根因） |
| 输入英文风格名（如 editorial）搜不到模板 | `renderTplList()` 仅匹配中文 `name` | 体验缺陷（已增强） |

---

## 二、改动清单

### 1. `templates/index.html`（复制富文本 + 首主题自动选中 + 筛选增强）
- **复制**：主路径 `ClipboardItem({'text/html','text/plain'})` 写富文本；新增 `copyByExecCommand()` 兜底（隐藏 contenteditable + `execCommand('copy')`），覆盖非安全上下文。toast 提示「已复制，可直接粘贴到公众号 ✅」。
- **首主题自动选中**：`loadThemes()` 在拿到主题后自动 `activeTpl = themes[0].id` 并 `doRender()`，实现「输入即渲染」。
- **筛选**：`renderTplList()` 过滤由仅 `name` 扩展为 `name + id + group`。

### 2. `tests/test_api_e2e.py`（新增，后端全端点 E2E）
- 自起服务，21 个端点逐 HTTP 校验：首页、主题、渲染（正常/无效）、优化流校验、双引擎风格、账号 CRUD 闭环（增→查→删→确认）、历史、推送校验路径（缺参 400 / 账号不存在 404）、打开目录校验（空 400 / 越权 403）、AI 配置读写、AI 文本端点（polish/ai-format/summary，优雅降级判定）、AI 封面图（生成+字节校验）、静态资源 `/assets/*`。
- **结果：29/29 通过。** AI 文本/封面端点均 200 成功（LLM key 已配），封面图 13KB 合法 PNG。

### 3. `tests/test_headed_full_e2e.py`（新增，前端有头全按钮 E2E）
- 有头浏览器（headless=False），逐一点击：
  - 公众号页 13 项：设置、模板筛选、模板收展、输入渲染、预览 HTML⇄手机、切换主题、AI 面板、AI 智能排版、AI 润色（触发）、**复制（富文本硬探针：MIME=['text/html','text/plain']）**、历史、一键推送、账号管理。
  - 小红书页 10 项：切页、平台 xhs⇄wx、填文案（字数统计）、引擎 归藏⇄BLCaptain、选风格（预览卡）、生成封面（结果卡真实图 HTTP 校验）、底图署名、点击结果卡开 Lightbox（大图真实）、关闭 Lightbox。
- **结果：26/26 通过，0 控制台报错 / 0 未捕获异常。**

---

## 三、验证证据

- 后端 E2E：`python tests/test_api_e2e.py` → `后端 API 全端点 E2E：29/29 通过`
- 前端 E2E：`python tests/test_headed_full_e2e.py` → `前端有头全按钮 E2E：26/26 通过` + `✅ 页面无 JS 控制台报错`
- 封面图有效性（Pillow 解码）：xhs 1080×1440 / square 1080×1080 / wide 2100×900 均 OK
- 复制探针：`clipboard.write 成功，MIME=['text/html', 'text/plain']（公众号可渲染富文本）`

---

## 四、回滚点

- 本次提交：`git log` 最新两条（见 `git push` 后 hash）
- 回滚单文件：`git checkout <hash>~1 -- templates/index.html`
- 回滚测试新增：`git checkout <hash>~1 -- tests/test_api_e2e.py tests/test_headed_full_e2e.py`

---

## 五、剩余项（非本轮，已记 TODO）

- `E2E-1`：旧 `test_e2e.py` 仍 40/41（1 项陈旧断言），目标 41/41。
- `D5-FIX`：前端风格分组静态 `guizang`/`blcaptain` 与 API `group` 字段语义对齐（功能无碍）。
- `DEADCODE`：`scripts/render_worker.py` 与 `core/guizang_renderer.py` 双份实现，择机清理。

---

*收尾执行：files/TODO.md 打勾（COPY-1/SEL-1/FILT-1/E2E-API/E2E-UI/CLEAN2）+ 本收尾文档 + 受控 git 提交并推送 origin/main。*
