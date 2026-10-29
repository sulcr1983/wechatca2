# SuperSu 项目概览（一页看懂）

> ⚠️ **阅读前提（2026-10-24 审计补）**：本文原以**本地 Flask 版**视角写成；**PWA 才是当前主产品**（已上线，当前版本见 `STATE.md`）。
> 两版共用 `core/` 引擎；凡标注「本地版」的能力 PWA 没有（或未做），当前产品形态以 `README.md` 架构图与 `AGENTS.md` §3 为准。

> 个人项目，够用就好。本文档合并了原「需求规格」与「架构设计」两份文档，只保留**接手、改动、排查时真正用得上的信息**。
>
> 配套：`api-reference.md`（28 个路由，仅本地版）· `testing.md`（测试怎么跑）· `runbook.md`（装起停 + 故障排查）· `project-conventions.md`（产出物与 Git 规范）· `audit-playbook.md`（36 项审计清单）

---

## 1. 是什么

**本地优先的公众号排版 + 小红书封面工具**。纯文本进、排版出；不接 AI 也能用；数据不出门。

三个核心场景：

| 场景 | 操作 | 出口 |
|---|---|---|
| 公众号排版 | 粘贴文章 → 自动识别结构 → 选主题 | 复制富文本，粘到公众号后台 |
| 小红书封面 | 写文案 → 选风格 → 生成 | PWA：归藏风格 3 张（3:4 / 1:1 / 21:9）或模板 1 张（3:4），共 12 风格；本地版 11 风格 |
| 群友免费用（**已上线**） | 打开网址 → 粘贴 → 复制 | PWA <https://supersu.ccwu.cc>，数据不出浏览器 |

---

## 2. 功能清单（压缩版）

**输入与排版**：纯文本自动转 Markdown（四模式：保守/长文分层/教程/自动）· 富文本粘贴转换（待接）· docx 导入（待接）· 中英文空格（待接）

**排版与预览**：164 套主题渲染 · 实时预览（400ms 防抖）· 手机/网页两种模式 · 结构解析条（识别结果可点）· 10 种 `:::` 模块插入

**主题库**：真实缩略图（164 张）· 收藏 / 最近 / 七族分组 · 默认主题记忆

**输出**：富文本复制（三级降级：Clipboard → execCommand → 手动指引）· 推送草稿箱（本地版）· 历史记录（本地版）

**小红书封面**：PWA 12 风格（归藏 2 入口 × 3 尺寸 + 10 套模板 3:4，纯前端可离线）；本地版双引擎（归藏 + BLCaptain 9）= 11 风格 · 自动搜图（Pexels/Wikimedia，本地版）· 底图上传 · Lightbox 预览

**AI（默认隐藏）**：润色 / 摘要 / 智能排版（**只出结构决策，正文一字不改**，失败一律本地兜底）；PWA 为平台下拉预设（DeepSeek / Moonshot / SiliconFlow / OpenAI + 自定义），选中自动填地址与模型，**只需再填 API Key**，Key 只存本机浏览器

**不做**：账号体系、云同步、SaaS、代运营

---

## 3. 架构与模块地图

```
【PWA 主产品（无后端）】
浏览器（pwa/index.html 单页外壳）
   ├─ app.js 主交互（编辑器/预览/主题抽屉/AI 面板）
   ├─ engine.worker.js：Pyodide 跑 core/ 引擎副本（dist/py/，构建时拷入）
   ├─ cover/（modern-screenshot 出封面 PNG）· export.js · nine.js · images.js
   ├─ ai.js（平台预设 BYOK）· update/（静默自动升级）
   └─ sw.js：shell / runtime / data / media 四层缓存，断网可用

【本地版（Flask，已弃用，保留回退）】
浏览器（templates/index.html 单页 SPA，原生 HTML/JS，无构建链）
   ↓ fetch + SSE
app.py（Flask，28 路由）
   ↓ import
core/（纯 Python 引擎，不依赖 Flask）
```

| 模块 | 干什么 | 关键函数 |
|---|---|---|
| `core/preprocessor.py` | 纯文本 → Markdown（正则 + 启发式） | `preprocess(text, mode)` |
| `core/format_engine.py` | Markdown + 主题 JSON → 微信内联 HTML | `convert_markdown_to_wechat_html()` |
| `core/image_search.py` | Pexels / Wikimedia 搜图 + 署名（本地版） | — |
| `core/guizang_renderer.py` | 归藏封面（Playwright 截图） | — |
| `core/blcaptain_bridge.py` | BLCaptain 封面（Node CLI） | — |
| `core/browser_utils.py` | 浏览器内核单真源（系统 Edge/Chrome 优先） | `launch_browser()` |
| `core/wechat_publisher.py` + `token_manager` | 素材上传 + 草稿推送 | — |
| `core/ai_client.py` | 多平台 LLM（OpenAI 兼容） | — |

**数据**：`public/themes/*.json`（164 主题）、`public/theme-thumbs/*.jpg`（164 缩略图）、`data/*.json`（配置/账号/历史）、`output/`（渲染产物，可再生）

---

## 4. 三条关键数据流

**① 排版**：粘贴 → 防抖 400ms → `POST /api/render {raw_text, theme_id}` → `preprocess` → 主题内联 → 返回 `{html, markdown}` → iframe 同步 `doc.write` → 解析条用返回的 markdown 统计

**② 复制**：`ClipboardItem(text/html)` → 失败走 `execCommand` → 再失败弹手动指引浮层

**③ 封面（本地版流程）**：解析标题 → 底图（上传 > Pexels > Wikimedia > 本地）→ 归藏（Playwright）或 BLCaptain（Node）→ `output/{task_id}/*.png`
（PWA 流程：文案 → 纯色/上传/Wikimedia 手动搜图 → modern-screenshot 合成 → 直接下载）

---

## 5. 主题系统（核心扩展点）

主题 JSON 结构：`{name, description, colors{primary,accent,background}, styles{tag: {css属性: 值}}, layout?, hero/card/timeline?}`

渲染时把 `styles[tag]` 的属性拼成 `style="..."`（**必须内联**，公众号会剥 `<style>`）。

**可读性护栏（2026-10-29）**：注入内联样式时对 `h1–h6` 兜底一次——标题与它所在底色的对比度
不足 3.0 就只改颜色：自带标题条的**压深那几个没达标的色标**（保住原字色），没有标题条的
**按色相压深/提亮字色**（金黄仍是金黄，不会变成黑）。本来就达标的元素原样返回，产物零改动。
验收：`scripts/theme_contrast_audit.py`（门禁 `theme_contrast`）。

**加主题的正确姿势**：

```
1. scripts/theme_specs.py 追加一条规格
2. python scripts/build_themes.py          # 生成 JSON
3. python scripts/gen_theme_thumbs.py --force   # 重生成缩略图
4. 跑 E2E + 有头测试
⚠️ 禁止手改 su-*.json（生成物）
```

---

## 6. 关键决策（为什么这么做）

| 决策 | 理由 |
|---|---|
| 自动排版用**纯规则**、不接 AI | 零延迟零费用；用户要求"不用 AI 就不开 AI" |
| AI 只出**结构 JSON**，正文原样套用 | 防 LLM 改写正文 |
| 预览用 **iframe + doc.write** | 隔离主题 CSS；同步写入避免时序问题 |
| 主题**预生成缩略图**（非 CSS 现场画） | 真实、快、可缓存；改主题重跑 2 分钟 |
| 封面**双引擎** | 两套审美覆盖；BLCaptain 9 种商业风 |
| 浏览器用**系统 Chrome**（回退 Edge 再回退 bundled） | 避免 183MB Chromium 下载卡死（历史事故）；Chrome 是 Playwright 一等支持。<br>启动页也强制 Chrome——本机系统默认被星愿浏览器抢占（`UserChoice=ChromiumHTM`），`cmd start` / `webbrowser.open` 都会弹星愿 |
| PWA 用 **Pyodide 跑现有 Python** | 引擎 0 改动、输出一致；**已上线**（<https://supersu.ccwu.cc>，当前版本见 `STATE.md`，首屏约 10MB，断网可用） |
| 整仓 **AGPL-3.0** | 归藏资产 AGPL；开源即合规；BLCaptain §1.3 也要求开源 |

---

## 7. 已知债务

| 项 | 影响 | 计划 |
|---|---|---|
| `templates/index.html` 单文件 2671 行（本地版） | 改一处需通读 | 保持（个人项目，简单优先）；PWA 侧 `pwa/index.html` 仅 203 行、按模块拆分 |
| 预处理器四模式无 UI 入口 | 用户用不到 | 待排期（`preprocessor.py` 的 `_MODES` 已在引擎里） |
| 历史记录仍是旧 modal | 与设计稿（抽屉）不一致 | 有空再改 |
| 富文本粘贴 / docx / pangu 未接 | 设计稿三件套未落地 | 待排期 |

---

## 8. 怎么改（速查）

| 改什么 | 去哪 |
|---|---|
| 加主题 | `scripts/theme_specs.py` + 重跑生成器 |
| 加 `:::` 模块 | `format_engine.py` 容器分支 + 前端 `MODULE_TEMPLATES`（两处同步） |
| 加 API | `app.py` + 补 `test_api_e2e` |
| 改界面 | `templates/index.html`（**先看 DOM 契约**：`#input-area`/`#preview-frame`/`#tpl-strip`/`.tpl-card`/`#btn-copy` 等，改完跑有头测试） |
| 改 PWA | `pwa/src/`（源码与 `core/` 单一真源；**构建时会把 `core/` 的两个引擎文件拷进 `pwa/dist/py/`**，改引擎后必须重跑 `node pwa/scripts/build.mjs`） |

---

*最后更新：2026-10-24（审计修订：PWA 已上线为主产品、本地版能力逐项标注、架构图补 PWA 分支）*
