# 任务收尾记录 — 自动联网搜图作底图 + 主题去重 + README 重写

> 本文档为**单任务结束程序（Task Closure）**交付物。
> 触发：用户要求「小红书封面自动联网搜真图作底图，一键生成」+ 后续「洁癖操作 + 正规收尾 + 推 GitHub」。

---

## 0. 任务边界

| 项 | 内容 |
|----|------|
| 触发 | 用户：「最好是可以自动网上搜索图片啊不是自己生成。你研究一下这个？我希望是一键生成」→ 后续「执行洁癖操作和执行软件工程正规的单任务结束程序，任务收尾手续，推送到GitHub」「重新写一份README, 要图文并茂，表情丰富」 |
| 范围 | 自动联网搜底图（image_search.py）、双引擎接线、Playwright file:// bug 修复、前端署名条 UI、主题去重（92 套最终态）、README 重写（图文并茂）、文档洁癖同步、git 提交推送 |
| 完成判据 | 三引擎（editorial/swiss/sp-mist）均返回真实 PNG + 真实网图底图；署名条正确显示；README 含截图+mermaid；AGENTS/HANDOFF/design-audit 无矛盾；git push 到 origin main |
| 不在范围 | E2E 陈旧断言清理（41/41 目标）、D-5 分组语义精确化、死代码删除 |

---

## 1. 完成项与验证

### S2 — 自动联网搜真图作底图（🆕✅）
- **新增 `core/image_search.py`**：双轨搜索模块。
  - 默认 Wikimedia Commons（免 API Key，自定义 UA 防 403）。
  - 检测 `PEXELS_API_KEY` 环境变量自动升级 Pexels（更精准，200 次/时）。
  - 本地 `public/images/` 最终兜底。
  - 零 AI 关键词提取：规则中文→英文词典 ~50 条。
  - 缓存 `data/bg_cache/`，返回 `{path, source, author, license, query, thumb}`。
- **接线到 `app.py::api_social_generate()`**：渲染前调用 `search_background(text)`；按 xhs/square/wide 三比例铺 auto_images；用户上传覆盖自动；BLCaptain 传 `bg_image=bg.path`；归藏传 `images=merged`；返回 JSON 加 `background` 字段。
- **BLCaptain 接线**：`blcaptain_bridge.py::generate()` 新增 `bg_image` 参数；`stock = bg_image or _pick_stock_image()`；provenance 标记 `[web-search]` vs `[local-stock-image]`。
- **关键修复 — Playwright file:// → data: URI**：
  - 根因：`guizang_renderer._resolve_img()` 用 `Path(p).resolve().as_uri()` 生成 `file://` URI；Playwright `page.set_content()` 从 `about:blank` 上下文无法加载 `file://`（浏览器安全策略拦截），导致底图静默丢失。
  - 修复：改为 base64 `data:` URI 内嵌（`mimetypes.guess_type` + `base64.b64encode`）。
- **前端署名条**：`templates/index.html` 新增 `#bg-credit` div；生成结果后填充来源/作者/许可/关键词信息。
- **验证（live API，2026-07-25 15:00）**：
  - 「今天来一杯手冲咖啡」→ query=coffee, source=Wikimedia Commons, author=Julius Schorzman, CC BY-SA 2.0 ✅
  - 「周末去海边旅行放空」→ query=travel, source=Wikimedia Commons, author=Japanese Government Railways, Public Domain ✅
  - 「深夜读书关于设计的好书」→ query=design, source=Wikimedia Commons, author=böhringer friedrich, CC BY-SA 2.5 ✅
  - 三引擎 API 调用：editorial(guizang) 3 图 ✅ / swiss(guizang) 3 图 ✅ / sp-mist(BLCaptain) 3 图 ✅
  - 有头 E2E `verify_social_bg.py`：0 console error，#bg-credit 文案正确 ✅

### S1 — 小红书页布局重排（前置，✅ 已完成）
- 2 列布局（.social-ctrl | .social-right）；结果画廊自适应网格；Lightbox 大图预览。

### T2/T3/T4 — 主题去重与开源适配（✅ 已完成）
- 85 套开源适配（xh-*）→ 去 38 重复 → 47 套保留。
- 84 套颜色克隆 → 全部删除。
- 8 套原创撞色 → 删除，每组留代表。
- **最终：92 套 = 45 原创 + 47 开源适配**。name-collision=0、color-twin组=0、92/92 全部渲染通过。

### DOC — README 重写（✅ 已完成）
- 图文并茂：4 张真实截图（公众号排版 / 小红书封面 / 结果画廊 / Lightbox 大图）。
- 表情丰富：全篇 emoji 覆盖功能亮点、章节标题、表格。
- Mermaid 架构图：Frontend → Backend → Engines → External Services。
- 数据准确：92 主题、双引擎、自动搜图机制、双轨说明。
- 截图存放：`docs/screenshots/`（不被 gitignore，随仓库入库）。

### CLEAN — 文档洁癖同步（✅ 已完成）
- **AGENTS.md**：§1 53→92 + BLCaptain 已集成 + 搜图特性；§3 架构树加 image_search.py + 更新模块列表；§6 公众号 DOM 更新为 tpl-bar+wechat-body；§7 社交页更新为 .social-ctrl/.social-right/.results-grid/.lightbox。
- **HANDOFF.md**：§2 templates 行数/主题数修正；新增 image_search.py 模块条目；§3 文件系统表 53→92；§4 社交链路加自动搜图步骤；§8 新增变更 4 条目。
- **design-audit.md**：§0 主题数 53→92；§2.1 WeChat DOM 更新为当前布局；§6.1 W-2 标已解决；§6.4 加新能力说明。

---

## 2. 改动文件清单（本次提交）

| 文件 | 改动 |
|------|------|
| `core/image_search.py` | 🆕 新建：双轨联网搜图模块 |
| `app.py` | 新增 image_search 导入 + api_social_generate 搜图接线 + background 返回 |
| `core/blcaptain_bridge.py` | generate() 新增 bg_image 参数 |
| `core/guizang_renderer.py` | _resolve_img() file:// → base64 data: URI 修复 |
| `templates/index.html` | #bg-credit 署名条 + 结果卡真实图绑定 + 社交页 2 列布局 |
| `core/format_engine.py` | GALLERY_THEMES 去重后列表更新 |
| `public/themes/*.json` | -8 原创（撞色删除）+ 47 xh-* 开源适配（新增） |
| `scripts/adapt_external_themes.py` | 🆕 开源主题适配脚本 |
| `scripts/remove_dup_themes.py` | 🆕 xh 去重脚本 |
| `scripts/remove_dup_originals.py` | 🆕 原创去重脚本 |
| `tests/agent_browser_full_flow.ps1` | 主题名引用更新（elegant-navy→bold-navy） |
| `README.md` | 🔄 重写：图文并茂 + 表情丰富 + mermaid + 4 张截图 |
| `AGENTS.md` | 🔄 洁癖：92 主题 / 新架构 / 新 DOM / 搜图特性 |
| `HANDOFF.md` | 🔄 洁癖：新模块 / 新链路 / 变更 4 |
| `docs/design-audit.md` | 🔄 洁癖：DOM 更新 / W-2 已解决 / 新能力注 |
| `files/TODO.md` | 🆕 新建：任务清单（全部已打勾） |
| `docs/task_closure_social-bg.md` | 🆕 本收尾文档 |
| `docs/screenshots/*.png` | 🆕 4 张 README 配图 |

**未提交/已排除**：`.env`（密钥）、`data/`（含加密账号+bg_cache）、`output/`（运行时产物）、`uploads/`、`test_output/`、`blcaptain-style-skill/`（嵌套 git+node_modules）、`.workbuddy/`（私密记忆）、`temp_covers/`、`reports/`、`output/_shot_readme.py`（临时脚本）。

---

## 3. 回滚点

- **本次提交**：（待 push 后填入 commit hash）
  - 回滚：`git revert <hash>` 或 `git checkout <hash>~1 -- <file>`
- 如需单独回滚搜图功能：移除 `app.py` 中 image_search 导入和 search_background 调用；恢复 blcaptain_bridge/guizang_renderer 的旧签名。
- 如需单独回滚主题变更：恢复被删的 8 个原创 JSON + 删除 47 个 xh-* JSON。

---

## 4. 测试健康度

| 套件 | 结果 | 说明 |
|------|------|------|
| `tests/test_e2e.py` | **40 / 41** | 1 项陈旧 UI 断言（非本轮引入） |
| `tests/test_integration.py` | **35 / 35** | 对齐真实前端契约 |
| 有头 E2E (`test_headed_userflow.py`) | **7 / 7** | 公众号渲染 + 社交封面生成 |
| Live API 三引擎出图 | **3 / 3 × 200 + 真实网图底图** | editorial / swiss / sp-mist |
| Live 搜图关键词提取 | **3 / 3** | coffee / travel / design → 真实照片 + 署名 |

---

## 5. 剩余项

| ID | 项 | 级别 | 说明 |
|----|----|------|------|
| E2E-1 | 清理 1 项陈旧 UI 断言 | P2 | 目标 41/41 |
| D5-FIX | 风格分组对齐 API group | P2 | 功能无碍，语义精确化 |
| DEADCODE | 删除 render_worker.py 死代码 | P3 | 与 guizang_renderer 双份 |

---

*收尾完成时间：2026-07-25*
