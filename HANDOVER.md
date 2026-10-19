# HANDOVER — PWA 交接说明

> **最新交接（2026-10-19 首页体验优化）**：先看 [`docs/handover-2026-10-19-ui-polish.md`](docs/handover-2026-10-19-ui-polish.md)。
> 关键状态：首页优化已提交 `5c6eca3` 并 push，但 Cloudflare 部署失败（wrangler `fetch failed`），**线上仍是 build 119**；接手第一件事是重试部署并跑线上全量有头 E2E。

> 写于 2026-10-18 12:15。对象：接手继续做这个 PWA 的人（包括未来的我和别的 agent）。
> **先读 `docs/pwa-build-plan.md`（施工图）读细节，本文只讲「现在在哪、还差什么、怎么接着做」。**

---

## 0. 一句话现状

**PWA 已上线**：https://supersu.ccwu.cc（自定义域名）+ https://supersu-pwa.pages.dev，粘贴纯文本 → 浏览器内 Python 引擎排版 → 164 套主题 → 复制到公众号，全程无后端、可离线。有头浏览器冒烟 **23/23 通过**，线上域名有头实测渲染通过（2026-10-18）。
**没做的**：推送探测、离线包、真机验收（见 §3）。**2026-10-19 首页优化已提交但未部署成功**，详见 `docs/handover-2026-10-19-ui-polish.md`。
**2026-10-19 补**：小红书封面已落地——12 风格（归藏 2 × 3 尺寸 + 模板 10 × 3:4）、纯色/上传/Wikimedia 免 key 搜图、Noto 中文字体子集、断网可生成；有头测试 16/16。

⚠️ 2026-10-18 已完成基线提交（`0332b7f`）+ 部署上线。后续每完成一项仍按：跑 `smoke.py` → 单项提交 → 回 `files/TODO.md` 打勾。

---

## 1. 30 秒上手

### 1.1 环境
| 项 | 值 |
|---|---|
| 仓库 / 分支 | `E:\test\wechatca2` / **`pwa` 分支** |
| 分支基线 | `c527004 fix(preprocess): 修中文小标题识别不出来` |
| Python | `E:\test\wechatca2\.venv\Scripts\python.exe`（**别用系统 python**） |
| Node | v22.22.2（只有构建脚本用，无 npm 依赖） |
| 浏览器 | 系统 Chrome（`core/browser_utils.py` 已统一 Chrome 优先） |

### 1.2 跑起来
```bash
cd /e/test/wechatca2
node pwa/scripts/build.mjs                 # 构建 → pwa/dist（约 4.3MB，15s）
.venv/Scripts/python.exe -m http.server 8080 -d pwa/dist
# 打开 http://127.0.0.1:8080   首次要下 11MB Pyodide，耐心等进度条
```
**必须走 http://**，`file://` 打开会因为 fetch / Service Worker 受限而跑不起来。

### 1.3 验证（唯一可信的健康度判据）
```bash
# PWA 有头冒烟（起静态服务 + 真实 Chrome 走一遍核心链路）
.venv/Scripts/python.exe pwa/scripts/smoke.py
# 期望：PWA 有头冒烟：24/24 通过

# 封面专项（12 风格 / 3 尺寸 / 上传 / Wikimedia 搜图 / 断网生成）
.venv/Scripts/python.exe scripts/pwa_cover_test.py
# 期望：PWA 封面有头测试：16/16 通过

# 导出专项（长图 PNG / HTML 自包含 / Markdown / 移动端不溢出）
.venv/Scripts/python.exe scripts/pwa_export_test.py
# 期望：PWA 导出专项：8/8 通过

# 线上全量有头 E2E（打到 supersu.ccwu.cc，逐按钮 + 截图）
.venv/Scripts/python.exe scripts/pwa_online_e2e.py
# 期望：85 项左右通过，2 项预期 SKIP

# 本地版回归（确认没把 main 的东西改坏）
.venv/Scripts/python.exe tests/test_e2e.py          # 74/74
.venv/Scripts/python.exe tests/test_api_e2e.py      # 29/29（自起服务，要求 5000 空闲）
```
本地版全量基线：**74 / 35 / 29 / 33 / 7 / 12 = 190 全绿**。

---

## 2. 进度到哪了

对照 `files/TODO.md` 的 PWA 编号：

| 编号 | 任务 | 状态 |
|---|---|---|
| PWA-0a/0b/0c | 可行性验证（Pyodide 跑引擎、浏览器内截图） | ✅ 逐字节一致；封面截图 792ms 出 1080×1440 |
| PWA-1.1 | `pwa/` 骨架 + 设计系统 + manifest + 图标 + 启动遮罩 | ✅ |
| PWA-1.2 | Pyodide Worker + bridge + build.mjs | ✅ 引擎启动 6.7s、渲染 436 字 415ms |
| PWA-1.3 | 主题索引 + 164 缩略图 + 风格胶囊 + 六族抽屉 | ✅ 164 套可选、缩略图真实加载 |
| PWA-1.4 | 防抖渲染 + 解析条 + 手机/网页视图 | ✅ |
| PWA-1.5 | 复制三级降级 + 草稿 + 清本地数据 | ✅ 代码齐（**但「粘贴到公众号样式完整」这条没在自动化里实测，需人工确认**） |
| PWA-2.1–2.3 | 封面 12 种风格 / 三尺寸 / 底图三合一 | ✅ 2026-10-19：归藏 2 × 3 尺寸 + 模板 10 × 3:4；纯色 / 上传 / Wikimedia 搜图；长标题自适应；有头 16/16 |
| PWA-3.1 | manifest + SW + 离线 | ✅ 2026-10-19：SW 已含封面模块/模板预缓存；`pwa_cover_test` 实测断网后仍可生成 |
| PWA-3.2 | 「更多」菜单：推送探测本机 / AI 配置 | ❌ 只做了草稿/清数据/关于 |
| PWA-3.3 | 合规收尾 | 🟡 LICENSE、THIRD_PARTY_NOTICES、关于页链接都有；构建断言已跑 |
| PWA-3.4 | 部署 Cloudflare Pages | ✅ 2026-10-18 上线：项目 `supersu-pwa`，双地址在线——https://supersu-pwa.pages.dev + 自定义域名 **https://supersu.ccwu.cc**（新注册的免费域名，NS 已委派 CF，证书 Google CA）。部署脚本 `pwa/scripts/deploy.sh`（凭证从 `E:/test/opendoor/.env` 读，不落盘） |
| PWA-3.5 | 离线包 zip | ❌ |
| PWA-4.1–4.2 | 真机验收 + 群友试用 | ❌ |
| （新增）更新管理 | 见 §7 | ✅ 代码齐、构建通过；冒烟覆盖入口/记录面板 |

---

## 3. 未完成清单（按该做的顺序）

### 3.1 【已完成 2026-10-18】部署到 Cloudflare Pages

苏哥明确要求过"去 Cloudflare 自己建个项目地址"，**已完成**。

- 项目：`supersu-pwa`（生产分支 main，基线提交 `0332b7f`）
- 地址：https://supersu-pwa.pages.dev ｜ 自定义域名 **https://supersu.ccwu.cc**
- 域名：2026-10-18 在 DNSHE 新注册 `supersu.ccwu.cc`（ccwu.cc 后缀，永久有效），NS 委派 Cloudflare（craig/lara.ns.cloudflare.com），zone 与 Pages 同账号
- 部署方式：`bash pwa/scripts/deploy.sh`（凭证从 `E:/test/opendoor/.env` 读，不落盘不打印；先 `pages project create` 再 deploy——wrangler 4.x 不会自动建项目）
- 验证：服务器侧抓取确认完整应用；有头浏览器（系统 Chrome）实测输入→解析→预览渲染通过；全球 DNS 解析正常
- ⚠️ 国内直连 CF 的 172.6x 段不稳（本机 Clash 环境下 curl 被拦），真实用户访问以浏览器为准；发群时仍建议同时给离线包

### 3.2 封面（D5）——✅ 已完成 2026-10-19
- 实现：`pwa/src/cover/`（UI / 模板 / 渲染 / 搜图）+ `modern-screenshot` 离屏 iframe → PNG。
- 风格：归藏 `editorial` / `swiss`（3 尺寸）+ `public/cover-templates` 10 套（仅 3:4）。
- 字体：`scripts/build_cover_fonts.py` 生成 Noto Serif/Sans SC 子集（GB2312 一级 + ASCII，4 字重 2.39MB），
  构建拷进 `dist/fonts/cover/`；`cover-fonts.css` 只在封面页按需加载。
- 底图：纯色 / 上传 / Wikimedia Commons 免 key 搜图（CORS 已验证；中文关键词走场景词表映射）。
- 构建：默认清洗 10 套模板（去 Google Fonts / WCAG 强制白字段 / 示例文案 / 本地图路径）。
- 限制：BLCaptain 9 风格仍未进 PWA（需要 Node）；Wikimedia 以纪实照片为主，国内网络可能不可达。
- 验证：`scripts/pwa_cover_test.py` 16/16（含断网生成）。

### 3.3 离线验证（PWA-3.1 收尾）
```bash
# Chrome DevTools → Application → Service Workers → Offline → 刷新
```
期望：仍能用（引擎和主题都已在缓存里）。
`sw.js` 的 `SHELL` 预缓存清单已含 `src/update.js`、`src/changelog.js`、`src/changelog.css`、`version.json`、`changelog.json`（2026-10-18 补齐）。**以后新增前端模块，务必同步往 SHELL 里加**，否则离线时该模块静默不可用。

### 3.4 「更多」菜单补两项（PWA-3.2）
- 推送草稿箱：点击时 `fetch('http://127.0.0.1:5000/api/server-ip', {mode:'cors'})` 探测本机服务；通则桥接，不通提示「需在本机运行 SuperSu」
- AI 润色/智能排版：入口 + 用户自填 Key（存 localStorage，纯前端直连 LLM）

### 3.5 离线包（PWA-3.5）
`pwa/dist` 打 zip + `使用说明.txt`（解压 → 起静态服务 → 打开）。注意：双击 `index.html` 用 `file://` 打不开，必须说明要起服务。

---

## 4. 文件地图

```
pwa/
├─ index.html                 app shell（顶栏/编辑区/预览/风格条/抽屉/关于/更新按钮）
├─ version.json               版本号（当前 1.0.0）—— 更新检测靠它
├─ src/
│  ├─ style.css               设计系统 + 全部布局（暖纸朱砂，变量与本地版共用）
│  ├─ app.js                  主交互：主题列表/防抖渲染/解析条/复制/草稿/抽屉（570 行）
│  ├─ bridge.js               主线程 ⇄ Worker 的 Promise 化通道（含超时）
│  ├─ engine.worker.js        Pyodide 加载 + 引擎调用 + 进度上报
│  ├─ update/                 更新模块（index/ui/changelog/update.css，DOM 自建）
│  ├─ cover/                  小红书封面（index UI / catalog 风格目录 / templates 模板 /
│  │                          render 截图 / search 搜图 / cover.css）
│  ├─ ai.js                   纯前端 BYOK AI（润色 / 摘要 / 智能排版）
│  └─ light.js                轻量即时预览（marked，引擎未就绪时先出近似稿）
├─ public/
│  ├─ manifest.webmanifest    name/icons/shortcuts
│  ├─ sw.js                   Service Worker（307 行，三种缓存策略）
│  ├─ icons/                  5 张图标（192/512/maskable/apple-touch/favicon）
│  ├─ fonts/                  DM Sans + JetBrains Mono（154KB）
│  │  └─ cover/                Noto Serif/Sans SC 封面字体子集（4 woff2，2.39MB）+ OFL
│  ├─ vendor/                 marked / fitty / modern-screenshot（截图库）
│  └─ changelog.json          更新记录数据（由 gen_changelog.py 生成）
├─ scripts/
│  ├─ build.mjs               白名单构建 + 三条断言 + 主题索引 + markdown.zip（核心）
│  ├─ smoke.py                有头冒烟测试（23 项）
│  ├─ gen_changelog.py        git 历史 → changelog.json + CHANGELOG.md
│  ├─ changelog_milestones.json  版本切分配置（手工维护）
│  ├─ make_icons.py           图标生成（Pillow，可复现）
│  └─ fetch_fonts.py          字体下载 + CSS 本地化
└─ dist/                      构建产物（gitignore，不要手改）
```

**构建时进 `dist/` 的东西**（白名单，见 `build.mjs`）：app shell、字体（含封面 Noto 子集）、164 套主题 JSON + `themes/index.json`、164 张缩略图、`py/{preprocessor.py, format_engine.py, markdown.zip}`、`version.json`、`changelog.json`、manifest、sw.js、icons、vendor、**清洗后的 10 套 `cover-templates/*.html` + `cover-thumbs/*.png`**。封面模板默认包含��不再是 `--cover` 开关）。

---

## 5. 踩过的坑（别重犯）

| 坑 | 现象 | 结论 |
|---|---|---|
| **Worker 相对路径** | 引擎启动卡住，控制台 404 | Worker 在 `/src/` 下，`fetch('py/x')` 会解析成 `/src/py/x`。必须 `new URL('../py/x', self.location.href)` |
| **`[hidden]` 被 `display:flex` 覆盖** | 抽屉明明 `hidden` 却挡住按钮点击 | CSS 顶部加 `[hidden] { display: none !important; }` |
| **markdown 打包缺 dist-info** | `ModuleNotFoundError: No module named 'tables'` | markdown 3.10 用 entry points 解析扩展名，zip 里必须带 `markdown-<ver>.dist-info/{METADATA,entry_points.txt,top_level.txt,WHEEL}` |
| **`doc.write` 进 sandbox iframe** | 控制台刷 `Blocked script execution ... sandboxed` | 改用 `iframe.srcdoc = html`，纯数据赋值，无脚本注入 |
| **内联事件属性** | 同上，`onerror=` 会被当脚本 | 全部 `addEventListener`（缩略图失败用捕获阶段委托） |
| **单线程测试服务器** | 164 张缩略图随机 `ERR_FAILED` | `ThreadingHTTPServer` + `request_queue_size = 256`；另外 lazy 图被浏览器取消属正常，测试里单独归类 |
| **右下角浮动按钮压住风格条** | 有头测试点不到「全部风格」 | `.style-bar { padding-right: 96px }` 给它让位 |
| **Clash 系统代理拦 localhost** | curl 502 / Playwright 连不上 | curl 加 `--noproxy '*'`；浏览器 `args:['--no-proxy-server']` |
| **Playwright channel 顺序** | 一直弹 Edge 不弹 Chrome | `browser_utils.BROWSER_CHANNELS = ("chrome","msedge")`，已修 |
| **`start-app.bat` 的 cmd start** | 启动页弹星愿浏览器 | 已删那行，改由 `app.py::open_browser()` 走 Chrome（本地版的事，PWA 无关） |

---

## 6. 三条数据流

**① 排版**
```
textarea → 400ms 防抖 → bridge.render(text)
  → Worker: pyodide.runPython 里 preprocessor.preprocess(text,'auto')
           → format_engine.convert_markdown_to_wechat_html(md, '/home/pyodide/active-theme.json')
  → { html, markdown } → iframe.srcdoc = html → 解析条统计 markdown
```
主题 JSON 由 `bridge.setTheme(id, jsonText)` 写进 Pyodide 内存 FS，首次切换才写（有 id 去重）。

**② 复制**
`ClipboardItem(text/html)` → `execCommand('copy')` → 手动指引浮层（三级降级）。

**③ 更新**
见 §7。

---

## 7. 更新管理怎么设计的

按业界成熟做法（Workbox 官方文档 / web.dev 同一套），**核心原则：永远不自动换掉用户正在用的版本**。

```
页面加载
 ├─ fetch version.json (no-store) → 当前运行版本 v1.0.0 → 右下角按钮显示
 ├─ fetch changelog.json → 喂给更新记录面板
 ├─ localStorage.seenVersion 对比：
 │    有值且 < 运行版本 → 说明刚更新过 → 900ms 后自动弹更新记录（高亮 since 之后的条目）
 │    无值 → 首次访问 → 静默记下，不打扰
 └─ registerSW({ updateViaCache:'none' })   ← 关键：不让 HTTP 缓存住 sw.js
      ├─ updatefound → installing.statechange='installed' && 已有 controller
      │    → state.waiting 存起来 → 右下角红点 + 提示卡「有 N 条更新」
      ├─ 用户点「立即更新」→ waiting.postMessage({type:'SKIP_WAITING'})
      │    → controllerchange → location.reload()（只 reload 一次）
      ├─ 用户点「稍后」→ 记 dismissedVersion，本次不再打扰
      └─ 每小时 + 回到前台 → registration.update()；同时轮询 version.json
```

**两个独立线索都保留**：SW 更新保证资源一致；`version.json` 轮询保证「用户一直不关标签页」也能发现远端已发新版。

**更新记录数据**：`pwa/public/changelog.json`，由 `pwa/scripts/gen_changelog.py` 从 git 历史生成（Keep a Changelog 分类 + Conventional Commits 解析 + 非规范提交兜底归 `other`）。版本切分靠 `changelog_milestones.json`（手工维护 9 个里程碑）。改完代码要重新生成：
```bash
.venv/Scripts/python.exe pwa/scripts/gen_changelog.py
node pwa/scripts/build.mjs
```

**发新版流程**（正规做法）：
1. 改 `pwa/version.json` 的 version（SemVer：新功能 +minor、只修 bug +patch）
2. 在 `changelog_milestones.json` 顶部加一条里程碑
3. 跑 `gen_changelog.py` → 跑 `build.mjs` → 部署
4. `sw.js` 的 `VERSION` 常量**也要一起改**（`v1` → `v2`），否则缓存不换名

---

## 8. 需要苏哥拍板的事

| # | 事项 | 现状 | 建议 |
|---|---|---|---|
| 1 | **更新记录生成器要不要换成现成轮子** | 现在是零依赖自研 `gen_changelog.py`（约 200 行） | 候选：`git-cliff`（Rust 单二进制，快、模板化）或 `conventional-changelog-cli`（npm 全局包）。两者都能用，代价是引入新运行时。个人项目建议维持零依赖 |
| 2 | **封面字体子集化方案** | 未定 | 中文两族按 3500 常用字子集（约 1-2MB/字重）；若嫌大，可让中文退回系统字体（视觉略降级） |
| 3 | **域名走哪一阶段** | 未定 | `pages.dev` 先自测 → 群里发时同时给离线包 → 要长期稳定需自购域名 + 备案 + 国内 CDN |
| 4 | 图标四角透明 | apple-touch-icon 带透明圆角，iOS 会填黑 | 上真机看，觉得难看就改满铺版（`make_icons.py` 一行参数） |

---

## 9. 环境与凭证

- **Cloudflare**：账号复用 `E:\test\opendoor`，凭证在同目录 `.env`。**不要复制进本仓库、不要提交、不要在日志/对话里打印**。
- **`.gitignore` 已排除**：`pwa/dist/`、`pwa/node_modules/`、`data/`、`.env`、`output/`、`blcaptain-style-skill/`（vendored）。
- **`docs/pwa-spike/`** 里是阶段 0 的验证证据（2.4MB 的 PNG），不是运行时依赖。
- **本地版（main 分支能力）没动**：`core/`、`app.py`、`templates/` 都还是本地版那套，PWA 只读不写。

---

## 10. 接手后建议的顺序

0. **先处理 2026-10-19 首页优化**：重试 `deploy.sh` → 跑 `scripts/pwa_online_e2e.py` → 详情见 `docs/handover-2026-10-19-ui-polish.md`。
1. ~~先提交~~ ✅（0332b7f）→ ~~部署 Cloudflare~~ ✅（supersu.ccwu.cc）→ ~~补「更多」菜单 + 离线验证~~ 见下
2. **离线验证**（§3.3）→ Chrome DevTools 离线刷新，确认 SW 缓存够用
3. **补「更多」菜单**（§3.4）→ 推送探测 + AI 配置
4. **封面**（§3.2）→ 最大一块，要先把字体搞定
5. **离线包 + 真机验收**（§3.5、PWA-4.x）
6. 全程：每完成一项 → 跑 `smoke.py` → 单项提交 → 回 `files/TODO.md` 打勾 → 重新生成 changelog

---

*本文档基于 2026-10-19 的实测状态更新（首页优化已提交未部署）。若与代码冲突，以代码与实测为准，并回来更新本文。*
