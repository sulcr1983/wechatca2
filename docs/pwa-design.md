# SuperSu PWA 实施方案 v1（评审稿 · 未开工）

> 状态：**待苏哥评审**。本文档确认前不动代码。
> 上位调研：`docs/pwa-cloudflare-plan.md`（含版权审计证据与三位 agent 结论）

---

## 0. 先看这一段（大白话摘要）

我们要做的事：把现在这个本地工具（Flask + Python）**复制一份“纯浏览器版”**，部署到一个网址上。你把它丢到群里，任何人点开就能用：粘贴文章 → 自动排版 → 选模板 → 复制到公众号。**所有内容只在各自浏览器里，服务器只发文件、不存任何数据。**

为什么要复制一份而不是直接改造：现有 Flask 跑不了 Cloudflare（那边没有 Python 服务器进程）。但排版引擎是纯 Python，可以塞进浏览器里跑（Pyodide，微软/Anaconda 维护的 CPython-WASM），**引擎一行不用改**。

代价：首次打开要下载约 10MB 的引擎（之后浏览器缓存，离线也能用）。换来的是：**零服务器成本、数据不出浏览器、输出与本地版 100% 一致**。

---

## 1. 目标与非目标

### 目标
1. 群里任何人打开网址即可用，无需安装 Python/Node
2. 排版结果与本地版**逐字节一致**（同一套 `format_engine.py` + 同一批主题 JSON）
3. 数据 100% 留在浏览器（草稿/历史/偏好），服务器无数据库、无日志采集
4. 可“安装到桌面/手机”（PWA），断网可用
5. 零托管成本（Cloudflare Workers Static Assets 静态请求免费无限）

### 非目标（明确不做）
- ❌ 小红书封面生成（依赖 Playwright + 归藏/BLCaptain 资产，合规与体积都不允许）
- ❌ 微信草稿箱推送（微信强制 IP 白名单 + AppSecret，纯前端不可能）
- ❌ 账号/登录/云同步（数据本地是卖点，不做后端）
- ❌ AI 功能（默认关闭，PWA 版直接移除入口）
- ❌ 45 套旧主题中带第三方品牌名的 41 套（商标风险）

---

## 2. 功能范围（PWA 版）

| 功能 | PWA 版 | 说明 |
|---|---|---|
| 粘贴/输入 → 自动排版 | ✅ | 现有 `preprocess` 四模式 + 新增多风格规则 |
| 主题选择（119 套 `su-*`） | ✅ | 真实缩略图 + 收藏 + 最近使用 + 六族分组 |
| 预览（网页 HTML / 手机） | ✅ | 微信文章外框 + 底部互动条 |
| 复制到公众号（富文本） | ✅ | ClipboardItem 写 text/html（自动复用现有实现） |
| 草稿自动保存 | ✅ | localStorage + IndexedDB，离线可恢复 |
| 192/512 图标 + 安装 | ✅ | manifest.json |
| **封面生成** | ❌ 显示“需本地版” | 点击提示：在本机运行 SuperSu 后可用 |
| **微信推送** | ❌ 显示“需本地版” | 同上 |
| **AI 润色/排版** | ❌ 移除入口 | 保持“不用 AI 就不开 AI” |

---

## 3. 用户流程（3 步，与本地版一致）

```
打开网址（首次加载引擎 10MB，带进度条）
  ↓
粘贴文章 → 400ms 自动排版 → 预览区出效果 → 解析条显示识别结构
  ↓
（可选）换主题：点风格胶囊 / 打开模板库抽屉（119 套 + 缩略图 + 收藏）
  ↓
点「复制」→ 富文本进剪贴板 → 粘到公众号后台
```

状态：草稿自动存，关页再开可恢复；顶部显示“离线可用”。

---

## 4. 技术架构

### 4.1 总体结构

```
浏览器
├─ app shell（原生 HTML/CSS/JS 或 Vite 打包，~200KB）
│   ├─ 复用现有 templates/index.html 的 UI（P0 新版）
│   ├─ 主题胶囊/抽屉/解析条/toast 等交互（纯前端）
│   └─ 复制（ClipboardItem text/html）
├─ Web Worker（引擎线程，不阻塞 UI）
│   ├─ Pyodide（~10MB，首次下载后缓存）
│   ├─ core/format_engine.py（原样）
│   ├─ core/preprocessor.py（原样）
│   └─ public/themes/su-*.json（119 套，按需读入）
└─ 本地存储
    ├─ localStorage：主题偏好 / 收藏 / 最近使用 / 智能转换开关
    └─ IndexedDB：草稿（单条）+ 历史（可选）

Cloudflare Workers Static Assets（服务器）
└─ 只发静态文件：dist/（app shell + themes + vendor + fonts）
```

### 4.2 为什么选 Pyodide 而不是 JS 重写

| 维度 | Pyodide（跑现有 Python） | JS 重写（marked + 主题引擎） |
|---|---|---|
| 引擎改动 | **0 行** | 2349 行重写 + 164 主题视觉回归 |
| 输出一致性 | **100%** | 需像素级对齐，hero/card 包裹逻辑高难 |
| 工作量 | **5-7 天** | 18-25 天 |
| 首屏 | ~10MB（缓存后 0） | ~200KB |
| 适用 | 先上线验证 | 后期优化 |

**结论：先用 Pyodide 上线（一个月内可用），确认群里有人长期用，再考虑 JS 重写。**

### 4.3 与本地后端的关系（可选增强，不阻塞）

PWA 启动时探测 `http://127.0.0.1:5000/api/themes`（1.5s 超时）：
- 通则显示「封面生成 / 微信推送」入口（走本地 Flask，能力完整）
- 不通则隐藏这两个按钮，并显示一行灰字「封面/推送需在本机运行 SuperSu 后可用」

---

## 5. 目录结构（新分支 `pwa`）

```
仓库根（私有）
├─ core/                          ← 共享，不复制（构建时白名单 copy）
├─ public/themes/su-*.json        ← 共享（119 套）
├─ public/theme-thumbs/su-*.jpg   ← 共享（119 张）
├─ templates/index.html           ← 本地版 UI（继续演进）
├─ docs/
│  ├─ pwa-cloudflare-plan.md      ← 调研与合规（已完成）
│  └─ pwa-design.md               ← 本文档
└─ pwa/                           ← 新增（PWA 专属，构建与部署只在这里）
   ├─ index.html                  ← PWA app shell（复用新 UI，去掉封面/推送）
   ├─ src/app.js                  ← 交互层（原生 JS，无框架）
   ├─ src/engine.worker.js        ← Pyodide Worker
   ├─ src/bridge.js               ← 主线程 ⇄ Worker 消息协议
   ├─ public/manifest.webmanifest
   ├─ public/icons/{192,512}.png
   ├─ public/fonts/*.woff2 + OFL.txt
   ├─ scripts/build.mjs           ← 白名单构建（禁 cp -r public/）
   └─ README.md                   ← 部署步骤（wrangler）
```

**分支策略**：`pwa` 分支只加 `pwa/` 与构建脚本，不改 `core/`；`core/` 的改动在 `main` 上做，`pwa` 分支 rebase 即可。这样引擎单一真源。

---

## 6. 数据流

```
输入（textarea）
  → 主线程 debounce 400ms
  → postMessage({type:'render', text, themeId})  → Worker
  → Worker: preprocess(text) → convert_markdown_to_wechat_html(md, theme_json)
  → postMessage({type:'rendered', html, markdown})
  → 主线程：iframe.srcdoc = html；解析条读 markdown 统计
  → 草稿写 localStorage（text + themeId + 时间）
```

复制：直接 `navigator.clipboard.write([ClipboardItem({'text/html': blob})])`（现有实现迁移）。
无网络请求（除首次加载引擎与字体）。

---

## 7. 构建与打包（白名单，硬约束）

**进包**（显式路径 copy，禁止 `cp -r public/`）：
- `public/themes/` 中 `su-*.json`（119）
- `public/theme-thumbs/` 中 `su-*.jpg`（119）+ manifest.json
- `public/vendor/`（fitty，4KB）
- `public/fonts/*.woff2` + `OFL.txt`
- `pwa/index.html`、`src/*`、`icons`、`manifest.webmanifest`
- `core/format_engine.py`、`core/preprocessor.py`（复制进 `dist/py/`）

**不进包**（CI 断言）：
1. `dist/` 下不存在 `cover-templates|screenshot-backgrounds|images|social-thumb|prototypes`
2. `dist/` 下无 `fonts.googleapis.com` 字符串
3. `dist/themes/` 下所有文件以 `su-` 开头

---

## 8. 部署

1. Cloudflare 账号 → `wrangler` 登录
2. `wrangler.jsonc`：`assets.directory = "./pwa/dist"`，`not_found_handling = "single-page-application"`
3. `npx wrangler deploy` → 得到 `xxx.workers.dev` 网址
4. 自定义域名（可选）：域名需在 Cloudflare 托管 → 加 Custom Domain
5. 验证：手机 4G 打开 → 安装到桌面 → 断网再开仍可用

---

## 9. PWA 能力清单

| 项 | 要求 |
|---|---|
| `manifest.webmanifest` | name / short_name / start_url / display=standalone / theme_color / background_color / icons 192+512 / shortcuts（新建、历史） |
| Service Worker | app shell 预缓存；引擎/字体 CacheFirst；导航 NetworkFirst + 离线回退 |
| 离线 | 首次加载后完全离线可用（引擎缓存） |
| 安装 | Chrome/Edge/安卓可装；iOS 走“添加到主屏幕” |
| 清缓存 | 设置页提供“清除本地数据”三连（caches → IndexedDB → localStorage） |

---

## 10. 合规边界（本文档的硬约束）

| 资产 | 本地版 | PWA 公开包 | 原因 |
|---|---|---|---|
| `core/format_engine.py` / `preprocessor.py` | ✅ | ✅ | 自研 |
| `public/themes/su-*.json`（119） | ✅ | ✅ | 自研生成物 |
| `public/themes/` 4 套通用命名（bold-blue 等） | ✅ | ✅ 改名 `su-tech-*` | 低风险，审计背书 |
| 其余 41 套（github/vogue/sspai/bytedance…） | ✅ | ❌ | 商标风险 |
| `public/theme-thumbs/su-*.jpg` | ✅ | ✅ | 自研渲染产物 |
| **归藏 `cover-templates` + 4 张 webp + `references/`** | ✅ **随便用** | ❌ **不进包** | AGPL-3.0：一旦随公开站点分发，须向访问者提供源码（免费/小群/不开源仓库都不豁免） |
| **BLCaptain 引擎** | ✅ | ❌ 不涉及 | 自定义双许可：闭源服务需付费授权；PWA 不加载它即不涉及 |
| `public/images/` 10 张照片 | ✅ | ❌ | 来源不明，不能公开再分发 |
| 字体（DM Sans / Noto Sans SC / JetBrains Mono） | ✅ | ✅ 自托管 + OFL.txt | OFL-1.1 允许打包 |

> **一句话**：本地版什么都不用删、什么都能用；PWA 包只装“渲染内核 + 119 套自研主题 + 字体”。

---

## 11. 性能预算

| 项 | 预算 | 实际/说明 |
|---|---|---|
| 首屏 HTML/CSS/JS | ≤ 250KB | 原生 JS，无框架 |
| 主题 JSON（119） | 1.7MB | 按需加载（打开抽屉才拉） |
| 缩略图（119） | 2.8MB | lazy loading |
| 字体 woff2（中文分片） | ~1.5MB | 按 unicode-range 分片 |
| Pyodide + 引擎 | ~10MB | 首次加载，Worker 预取，显示进度条；缓存后 0 |
| 单次渲染 | ≤ 600ms | Python-on-WASM 比原生慢 3-5 倍，400ms 防抖 |

---

## 12. 验收标准（做完逐条对）

**功能**
1. 打开网址 → 粘贴 500 字文章 → 3 秒内出预览
2. 119 套主题全部可选，缩略图正确显示
3. 收藏星标可点，刷新后保留
4. 复制 → 粘贴到公众号后台 → 排版样式完整（粗体/引用/列表/标题）
5. 草稿：关页再开 → 内容恢复
6. 断网 → 刷新仍可用（引擎已缓存）
7. 手机浏览器 → 可添加到主屏幕、图标正常

**合规**
8. `dist/` 内无任何 `cover-templates|screenshot-backgrounds|images|social-thumb|prototypes`
9. `dist/themes/` 全部 `su-` 前缀
10. `dist/` 内无 `fonts.googleapis.com`
11. 字体目录含 `OFL.txt`

**测试**
12. 现有 E2E 62 项中与渲染/预处理相关的用例，在 Node 侧用同一引擎跑通（回归）
13. Worker 通信异常（超时/崩溃）有兜底提示，不白屏

---

## 13. 里程碑（5-7 天拆分）

| 天 | 任务 | 产出 |
|---|---|---|
| D1 | 建 `pwa` 分支 + `pwa/` 骨架；字体下载与自托管（含 10 套封面模板改本地字体，顺手修断网溢出） | 可跑的静态页骨架 |
| D2 | Pyodide Worker 接入引擎 + bridge 协议 + 进度条 | 浏览器里能渲染 |
| D3 | 复用新 UI（编辑器/解析条/风格条/抽屉）+ 主题与缩略图接入 | 功能对齐本地版（除封面/推送） |
| D4 | 复制/草稿/清缓存 + 本地服务探测（封面/推送入口显隐） | 交互闭环 |
| D5 | manifest + Service Worker + 离线验证 | 可安装、断网可用 |
| D6 | 白名单构建脚本 + 三条 CI 断言 + 部署到 Cloudflare | 上线网址 |
| D7 | 手机/桌面真机验收 + 修复 | 可发群 |

---

## 14. 风险与回滚

| 风险 | 应对 |
|---|---|
| 首屏 10MB 体感重 | 进度条 + 骨架屏 + “引擎已就绪”提示；第二次打开秒开 |
| iOS 内存（Pyodide ~150MB） | 只在 Worker 跑、单页复用；大文档分片渲染；真机先测 |
| Pyodide 慢 3-5x | 400ms 防抖；渲染中显示“排版中”；必要时阶段 2 换 JS 引擎 |
| Worker 崩溃 | 主线程捕获 → 提示“引擎加载失败，请刷新”；不影响已保存草稿 |
| 包体超标（白名单漏拷） | 三条 CI 断言拦截 |
| 群里有人用旧浏览器 | 检测 `ClipboardItem`/`wasm` 支持，不支持时提示“请用 Chrome/Edge” |

**回滚**：删 Cloudflare 部署即可；仓库 `pwa` 分支可整体丢弃，`main` 完全不受影响。

---

## 15. 待确认（需要苏哥拍板）

1. **PWA 里要不要封面功能？**
   - A（推荐）：不要。封面留本地版，PWA 专注排版+复制 → 零合规成本
   - B：要，且整站开源（页脚挂源码）→ 可含归藏资产
   - C：要，去找归藏作者买例外授权
2. **默认主题**：把「醒目·蓝」改名为 `su-tech-blue` 纳入白名单（推荐，观感不变）——审计已背书
3. **网址**：先用 `xxx.workers.dev` 免费域名，还是绑你的自定义域名（需域名托管在 Cloudflare）
4. **是否现在开工**（确认本文档后即按 D1-D7 执行）
