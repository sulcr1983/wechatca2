# SuperSu PWA 实施方案 v1（评审稿 · 未开工）

> 状态：**待苏哥评审**。本文档确认前不动代码。
> 上位调研：`docs/pwa-cloudflare-plan.md`（含版权审计证据与三位 agent 结论）

---

## 0. 先看这一段（大白话摘要）

> **方案已锁定（2026-10-18 02:10，苏哥全部拍板）**
> - 渲染路线：**B 浏览器内 Pyodide**（进页面后台预加载 + 进度条）
> - 合规路线：**开源 + 整仓 AGPL-3.0**（封面直接用现成的归藏 10 套 + BLCaptain 9 套）
> - 封面底图：**三合一**（纯色默认 + 用户上传 + 可选 Pexels 搜图）；尺寸 **3:4 / 1:1 / 2.35:1**
> - 45 套旧主题：**全部保留**（5 套品牌名不改，用户已确认）
> - 推送 / AI：**保留但收进「更多」**
> - 账号 / 云同步：不做，数据全本地
> - 托管：**Cloudflare Pages**（复用 opendoor 账号）+ 离线包兜底

我们要做的事：把现在这个本地工具（Flask + Python）**复制一份“纯浏览器版”**，部署到一个网址上。你把它丢到群里，任何人点开就能用：粘贴文章 → 自动排版 → 选模板 → 复制到公众号。**所有内容只在各自浏览器里，服务器只发文件、不存任何数据。**

为什么要复制一份而不是直接改造：**Cloudflare 原生支持 Python**（官方一等支持，`WorkerEntrypoint` + `pywrangler`），但 **Flask 是 WSGI 应用、需要服务器套接字，而 Workers 是请求函数模型，Flask 不能原样跑**（改动量约 50-80 行，见 §4.2 路线 A）。

排版引擎本身是纯 Python（只依赖 `markdown` 这个纯 Python 包），所以有两条路：**放在 Cloudflare 边缘跑（服务端）** 或 **塞进浏览器里跑（客户端，Pyodide）**。两条路引擎逻辑都不用改，只是入口形态不同。本方案默认走客户端（零成本 + 数据不出浏览器），服务端作为可选增强。

代价：首次打开要下载约 10MB 的引擎（之后浏览器缓存，离线也能用）。换来的是：**零服务器成本、数据不出浏览器、输出与本地版 100% 一致**。

---

## 1. 目标与非目标

### 目标
1. 群里任何人打开网址即可用，无需安装 Python/Node
2. 排版结果与本地版**逐字节一致**（同一套 `format_engine.py` + 同一批主题 JSON）
3. 数据 100% 留在浏览器（草稿/历史/偏好），服务器无数据库、无日志采集
4. 可“安装到桌面/手机”（PWA），断网可用
5. 零托管成本（Cloudflare Workers Static Assets 静态请求免费无限）

### 范围修订（2026-10-18 苏哥拍板，覆盖此前"非目标"）

| 项 | 结论 | 落地方式 |
|---|---|---|
| **小红书封面** | ✅ **做（用现成模板）** | 开源路线下，**归藏 10 套 + BLCaptain 9 套共 19 种风格直接复用**（整仓 AGPL + 公开源码，履行 §13 义务即合规）；底图三合一（纯色默认 / 用户上传 / 可选 Pexels 搜图）；尺寸 3:4 + 1:1 + 2.35:1。**不再需要 clean-room 重写（省 4.5 天）** |
| **微信推送** | ✅ **保留（默认隐藏）** | 纯前端无法直接调微信（IP 白名单 + AppSecret）。方案：入口收进"更多"，点击时探测本机 `127.0.0.1:5000` —— 有本地服务则桥接推送；无则提示"需在本机运行 SuperSu"。可选增强：固定 IP 的小转发服务（VPS） |
| **账号/登录/云同步** | ❌ **不做（确认）** | 无后端、无登录；所有内容只在浏览器（localStorage + IndexedDB），页面上多处标注"数据仅存本机" |
| **AI 功能** | ✅ **保留（默认隐藏）** | 润色/智能排版入口收进"更多"菜单；未配置时点击提示去设置；纯前端可调用户自己填的 LLM API（可选） |
| **45 套旧主题** | ✅ **全部保留，不改名** | 用户已确认（2026-10-18 02:06）：5 套品牌名（github/vogue/sspai/bytedance/monocle）保留不动。文档记录风险提示，改名成本仅 10 分钟，将来如有异议随时可改 |
| **封面上限** | ✅ 保留全部 | 自研封面 + 现有 119 套排版主题，两边都不砍 |

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
| **封面生成** | ✅ **可用（19 种风格）** | 归藏 10 套 + BLCaptain 9 套；底图三合一（纯色/上传/搜图）；尺寸 3:4（1080×1440）/ 1:1（1080×1080）/ 2.35:1（900×383） |
| **微信推送** | ✅ 保留（隐藏） | 收进"更多"，点击探测本机服务；有则桥接，无则提示 |
| **AI 润色/排版** | ✅ 保留（隐藏） | 收进"更多"，未配置时提示去设置 |
| **旧主题 45 套** | ✅ 保留（改名） | 只改显示名，id 不变 |

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

### 4.2 两条渲染路线（Cloudflare Python vs 浏览器 Python）

> 2026-10-18 核实官方文档：Workers Python 支持「纯 Python 包 + PyEmscripten wheel + Pyodide 内置包」，官方示例直接推荐 FastAPI / Langchain / Pydantic。我们的 `format_engine.py` + `preprocessor.py` 只依赖 `markdown`（纯 Python）→ **技术上可以直接在 Workers 里跑**。

| 维度 | **路线 A：Workers Python（服务端渲染）** | **路线 B：浏览器内 Pyodide（客户端渲染）** |
|---|---|---|
| Python 运行位置 | Cloudflare 边缘 | 用户浏览器 Web Worker |
| 引擎改动 | 需把 Flask 入口改为 `WorkerEntrypoint.fetch`（50-80 行适配；**Flask 不能原样跑**） | **0 行** |
| 首屏体积 | ✅ ~200KB（引擎在服务端） | ❌ ~10MB（首次下载，之后缓存） |
| 渲染延迟 | ✅ 边缘执行（Pyodide 比原生慢 3-5x） | ⚠️ 本地 CPU（慢但无时限） |
| **CPU 限制** | ❌ 免费版 **10ms/请求**（必超，Error 1102）→ **需 Workers Paid $5/月**（Paid 默认 30s，可调至 5min） | ✅ 无限制（用用户自己的 CPU） |
| 内存 | ⚠️ **128MB/isolate**（Pyodide + markdown + 主题，需实测） | ⚠️ 浏览器标签内存（iOS 约 150MB） |
| 数据隐私 | ⚠️ **文章文本会上传到 Cloudflare 边缘**（无状态、不落盘，但确实经过服务器） | ✅ **完全不出浏览器** |
| 离线可用 | ❌ 不能（每次渲染要联网） | ✅ 可以（引擎缓存后离线） |
| 成本 | ❌ **$5/月**（约 36 元/月） | ✅ **$0** |
| 部署方式 | ✅ `pywrangler deploy` 一条命令 | ⚠️ 需构建 + 白名单打包 |
| 包体限制 | 64MiB 未压缩（Pyodide 运行时 + 包，够用） | 无 |

**怎么选**

| 你的偏好 | 选 |
|---|---|
| 群里点开秒用、能接受 $5/月、不介意文本经过 CF | **路线 A**（部署最省心） |
| 零成本、数据绝不出浏览器、要离线可用 | **路线 B**（本方案默认） |
| 两者都要（首屏快 + 可选隐私） | 混合：静态 PWA 为主 + Workers 作为可选渲染后端（复杂度 +2 人日） |

**关键提醒**：路线 A 的 $5/月是**硬成本**（免费版 10ms CPU 必然超限），且与苏哥最初"所有数据都是本地，服务器只下发"的诉求**部分冲突**（文本会经过服务器）。路线 B 完全满足该诉求，代价是首屏 10MB。

---

### 4.3 为什么选 Pyodide 而不是 JS 重写

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
| **归藏 `cover-templates` + 4 张 webp + `references/`** | ✅ | ✅ **进包**（开源路线） | 整仓 AGPL-3.0 + 公开源码 + 页脚源码链接 → 履行 §13 义务，合规 |
| **自主封面引擎（clean-room 重写，见 §18）** | ✅ | ✅ 进包 | 风格与排版思路不受版权保护；**代码、类名、色值、命名必须全部自研**，不得照抄归藏数值 |
| **BLCaptain 引擎** | ✅ | ✅ **进包**（开源路线） | 双许可 §1.3：开源项目 + 公开完整源码 = 免费使用；需保留 LICENSE 并在 README 说明安装方式 |
| `public/images/` 10 张照片 | ✅ | ✅ **保留** | 用户决定（个人开源项目，风险已知可接受） |
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
| D1 | 建 `pwa` 分支 + `pwa/` 骨架；字体自托管（含封面模板字体本地化） | 可跑的静态页骨架 |
| D2 | Pyodide Worker 接入引擎 + bridge 协议 + **进页面预加载 + 进度条** | 浏览器里能渲染 |
| D3 | 复用新 UI（编辑器/解析条/风格条/抽屉）+ 主题与缩略图接入 | 排版功能对齐本地版 |
| D4 | 复制/草稿/清缓存 + 推送/AI 入口收进「更多」+ 本机服务探测 | 交互闭环 |
| D5 | **封面接入：19 种风格模板（归藏+BLCaptain）+ 三合一底图 + 三尺寸** | 封面功能可用 |
| D6 | manifest + Service Worker + 离线验证 | 可安装、断网可用 |
| D7 | **合规文件（LICENSE / THIRD_PARTY_NOTICES / README / 页脚源码链接）+ images 换图** | 可公开 |
| D8 | 构建脚本 + CI 断言 + **部署 Cloudflare Pages（复用 opendoor 账号）** | 上线网址 |
| D9 | **离线包（supersu-pwa.zip）** + 使用说明 | 群里可直接下载 |
| D10 | 手机/桌面真机验收 + 群友试用 + 修复收尾 | 可发群 |

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

## 16. Cloudflare 账号复用（opendoor 项目已验证可行）

> 2026-10-18 调研 `E:\test\opendoor`：该项目已在 Cloudflare Pages 上运行，凭证与流程可直接复用。

| 项 | 值/做法 |
|---|---|
| 账号 ID | `2f69dbd5…`（见 `E:\test\opendoor\.env`，**不复制到本仓库**） |
| API Token | `E:\test\opendoor\.env` 的 `CLOUDFLARE_API_TOKEN`（具备 Pages 写权限） |
| 已有项目 | `opendoor-6dbf93`（Pages） |
| 部署命令参考 | `npx wrangler pages deploy <dir> --project-name=<项目名>` |
| 本项目的做法 | 新建独立 Pages 项目（建议 `supersu-pwa`），**凭证在部署时从 opendoor 的 .env 读取**，不写入本项目仓库 |
| 访问网址 | `https://supersu-pwa.pages.dev`（默认域名） |

**部署脚本约定**（`pwa/scripts/deploy.sh` 或 npm script）：
1. 从 `E:\test\opendoor\.env` 读取 `CLOUDFLARE_ACCOUNT_ID` / `CLOUDFLARE_API_TOKEN`（环境变量注入，不落盘）
2. `npx wrangler pages deploy pwa/dist --project-name=supersu-pwa`
3. 部署前跑三条 CI 断言（见 §7）

> ⚠️ **安全**：不要把 Token 复制进本仓库、不要提交 `.env`、不要在日志/对话里打印。部署脚本只读环境变量。

---

## 17. 域名与国内可访问性（2026-10-18 研究结论）

> **核心事实：免费二级域名在国内没有稳定访问路径。**

| 域名/托管 | 国内可访问 | 依据/原因 |
|---|---|---|
| `*.workers.dev` | ❌ **基本打不开** | 实测解析到 `198.18.x.x`（保留网段）——DNS 污染；移动网络最明显 |
| `*.pages.dev` | ⚠️ 不稳定 | 同源污染；个别运营商/时段能通 |
| 腾讯云 EdgeOne 免费域名 `*.edgeone.cool` | ❌ 打不开 | **免备案 → 拿不到大陆节点** |
| Gitee Pages | ❌ 已下线 | 服务关闭 |
| 自有域名（不备案）+ Cloudflare | ⚠️ 仍可能被限 | 绕开域名层污染，但 CF 节点 IP 可能被精准阻断 |
| **自有域名 + 备案 + 腾讯云 EdgeOne/CDN** | ✅ **稳定** | 唯一可靠路径；域名几十元/年 + 备案 1-2 周 |
| `eu.org` 免费域名 + Cloudflare | ⚠️ 看运气 | 免费、需人工审核 1-2 周；国内质量取决于 CF 节点是否被污染 |

**结论**：想"群里手机点开就能用"，**免费方案做不到稳定**。

### 推荐组合（按阶段）

| 阶段 | 方案 | 成本/时间 | 适用 |
|---|---|---|---|
| **P1 先验证** | `*.workers.dev` 部署 | 0 元 / 立即 | 你本机 + 海外网络验证功能（国内手机大概率打不开，属正常） |
| **P2 群里试用** | 申请 `eu.org` 免费域名 → 绑 Cloudflare | 0 元 / 审核 1-2 周 | 赌 CF 节点可通；不通就降级 |
| **P3 稳定方案** | 买域名（.com/.cn 约 50-100 元/年）+ 备案（1-2 周）+ 腾讯云 EdgeOne | 几十元 + 2-3 周 | 群里所有人稳定可用 |
| **P4 兜底（推荐同时做）** | **离线包分发**：构建一个 `supersu-pwa.zip`，群友下载解压双击 `index.html` 就能用 | 0 元 / 立即可用 | 完全不依赖网络；缺点是要下载几十 MB |

> **务实建议**：P1 + P4 先做（一天内可交付、100% 可用）；同时提交 eu.org 申请；群里反馈"打不开"再走 P3 备案。
> **注意**：P4 的离线包用 `file://` 打开时 Service Worker 不可用，但核心功能（引擎已内联、主题本地）不受影响，只是不能"安装到桌面"。

---

## 18. 封面引擎：clean-room 重写 + 命名方案

### 18.1 为什么必须重写

苏哥要求封面进 PWA。归藏模板是 AGPL，不能进公开包；**"改一改"也不行**（衍生作品仍受 AGPL 约束）。唯一合法路径是 **clean-room 重写**：只借鉴"杂志排版 / 网格排版"这类**风格思路**（思想不受版权保护），代码、类名、CSS 变量、色值、命名全部自研。

### 18.2 重写范围（3 风格 × 4 配色 = 12 套）

| 风格 | 定位 | 设计语言（自研） |
|---|---|---|
| **墨刊** | 长文、专栏、深度内容 | 大标题衬线 + 细分割线 + 留白克制；像一本杂志的封面 |
| **素格** | 理性、数据、结构化内容 | 严格 12 列网格 + 粗体无衬线 + 单色块；瑞士国际主义气质 |
| **留白** | 短句、金句、情绪表达 | 超大留白 + 居中短句 + 一条底线；极简 |

每风格 4 配色（纸白 / 墨黑 / 朱砂 / 青瓷），共 12 套。**全部由我重写 HTML/CSS**（约 100-150 行/套），色值为新推导（不复用归藏数值）。

### 18.3 渲染方式

PWA 端用 **snapdom**（约 20KB，浏览器原生光栅化）把 DOM 模板渲染成 PNG：
- 尺寸：小红书 3:4（1080×1440）/ 方图 1:1（1080×1080）
- 中文字体等 `document.fonts.ready` 后渲染
- 导出：`<a download>` 保存 PNG

### 18.4 命名方案（主题与封面）

**封面风格**（替代归藏的 editorial/swiss）：**墨刊 / 素格 / 留白** —— 三个名字都贴中文语感、能望文生义。

**主题族名**（现有六族已较雅，建议保留）：卷宗 / 庙会 / 信笺 / 素页 / 夜航 / 钢印。
**默认主题**：`bold-blue` 中文名保留「**醒目·蓝**」，内部 id 改 `su-tech-blue`（观感不变，审计已背书）。

**若要更诗意，可选备用名**：尺规（素格）/ 铅字（墨刊）/ 余白（留白）。

### 18.5 工作量

| 项 | 人日 |
|---|---|
| 3 风格 × 4 配色模板（HTML/CSS 自研） | 2.5 |
| snapdom 接入 + 导出流程 + 字体就绪处理 | 1.5 |
| 真机验收（尺寸/字体/裁切） | 0.5 |
| **合计** | **+4.5** |

---

## 19. 合规落地清单（AGPL 开源路线，约 1-2 人日）

| # | 动作 | 具体 |
|---|---|---|
| 1 | 根目录补 `LICENSE` | AGPL-3.0 全文（可从 gnu.org 取官方文本） |
| 2 | 新增 `THIRD_PARTY_NOTICES.md` | 归藏（AGPL-3.0 + 仓库链接）、BLCaptain（双许可 + 条款摘要）、fitty（MIT）、字体（OFL 三份）、Python 依赖清单 |
| 3 | README 改声明 | MIT 徽章删除 → AGPL-3.0 + 上游署名 + 修改说明 |
| 4 | PWA 页脚「源码」链接 | 指向 GitHub 公开仓库（履行 §13 网络条款） |
| 5 | `public/images/` 10 张来源不明图 | **按用户决定保留**（2026-10-18 02:08：个人开源项目风险可接受；风险已知：公开仓库属再分发，如有异议随时替换） |
| 6 | BLCaptain 纳入仓库 | 提交代码副本（排除 node_modules）+ README 写 `npm install`；或说明"需自行安装" |
| 7 | GitHub 仓库公开 | `sulcr1983/wechatca2`（本机 SSH key 已配置可用） |

> ⚠️ 5 套品牌名主题按用户决定**保留不改**，风险记录于此：属商标性使用，非版权问题；个人免费分享场景风险低，如有异议改名成本 10 分钟。

---

## 15. 待确认（需要苏哥拍板）

**全部决策已锁定（2026-10-18 02:10）**

| # | 事项 | 结论 |
|---|---|---|
| 1 | 合规路线 | ✅ **开源 + 整仓 AGPL-3.0**（公开 GitHub 仓库） |
| 2 | 渲染路线 | ✅ **B 浏览器 Pyodide**（进页面预加载 + 进度条） |
| 3 | 封面 | ✅ 用现成 19 种风格（归藏 10 + BLCaptain 9），不重写 |
| 4 | 封面底图 | ✅ 三合一（纯色默认 / 用户上传 / 可选 Pexels 搜图） |
| 5 | 封面尺寸 | ✅ 3:4 + 1:1 + 2.35:1 |
| 6 | 45 套旧主题 | ✅ 全保留（5 套品牌名不改） |
| 7 | 推送 / AI | ✅ 保留，收进「更多」 |
| 8 | 账号 / 同步 | ❌ 不做 |
| 9 | Cloudflare | ✅ 复用 opendoor 账号（Pages，新项目 `supersu-pwa`） |
| 10 | 默认主题 | `bold-blue` 改 `su-tech-blue`，中文名「醒目·蓝」保留 |

**总工作量：8-10 人日**（走开源路线省掉封面重写 4.5 天，增加合规文件 1-2 天）。

**唯一剩余动作：开工。**
