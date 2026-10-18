# PWA 施工图

> **这份是施工用的**：照着做，不用再回来问。
> `pwa-design.md` 是设计存档（为什么这么做、路线怎么选的），`pwa-cloudflare-plan.md` 是合规与调研证据。
> 三者冲突时，**以本文档为准**——这里写的是最终拍板结果。

**基线**：本地版 `main` 分支已全绿（62 / 35 / 29 / 33 / 7 / 12 = 178）。PWA 在 `pwa` 分支上做，`main` 不受影响。

---

## 1. 交付什么

| 交付物 | 形态 | 验收 |
|---|---|---|
| 在线网址 | Cloudflare Pages 静态站 | 手机 4G 打开可用 |
| 可安装 | PWA manifest + SW | Chrome/Edge/安卓可"安装"，iOS 可"添加到主屏幕" |
| 离线可用 | SW 缓存引擎与字体 | 断网刷新仍能排版 |
| 离线包 | `supersu-pwa.zip` | 群里下载解压双击即用（本地 file:// 打开受限，需起个静态服务或直接给网址） |

**不做**：账号、登录、云同步、付费、埋点、任何服务端存储。

---

## 2. 范围

### 做

| 项 | 说明 |
|---|---|
| 纯文本 → Markdown 自动排版 | 复用 `core/preprocessor.py` 四模式 |
| 164 套主题 | 45 套早期 + 119 套 `su-*`，**全部进包、不改名** |
| 真实缩略图 + 收藏 + 最近使用 | 164 张 jpg |
| 实时预览（手机外框 / 网页） | iframe 同步写入 |
| 复制富文本到公众号 | `ClipboardItem('text/html')` |
| 草稿自动保存 | localStorage，关页再开可恢复 |
| **小红书封面 19 种风格** | 归藏 10 套模板 + BLCaptain 9 套，3:4 / 1:1 / 2.35:1 |
| 封面底图三合一 | 纯色（默认）/ 用户上传 / 可选 Pexels 搜图 |
| 微信推送（隐藏） | 「更多」→ 探测 `127.0.0.1:5000`，有则桥接，无则提示 |
| AI 润色 / 智能排版（隐藏） | 「更多」→ 用户自己填 Key，纯前端直连 LLM |

### 不做（防止重复讨论）

- ❌ 账号体系、登录、云同步
- ❌ 服务端渲染（Workers Python 免费版 10ms CPU 必超，$5/月）
- ❌ 服务端存任何数据（含日志采集、埋点）
- ❌ 多用户、分享链接、协作

---

## 3. 已定稿决策

| # | 决策 | 理由 / 代价 |
|---|---|---|
| D-1 | **路线 B：浏览器内 Pyodide 跑现有 Python 引擎** | 引擎 0 改动、输出逐字节一致；代价首屏 ~11MB |
| D-2 | **整仓 AGPL-3.0 开源，PWA 站点公开** | 归藏 / BLCaptain 资产可直接进包，省 4.5 天 clean-room 重写；代价：源码必须公开（已做） |
| D-3 | **164 套主题全部进包，不改名** | 苏哥已确认"41 套没商标风险""品牌名保留"；记录风险：`bytedance`/`sspai`/`github`/`vogue`/`monocle` 5 个是品牌名，改显示名成本约 10 分钟，有异议随时改 |
| D-4 | **`pwa/` 子目录 + 构建白名单，不 fork `core/`** | 引擎单一真源；`main` 改了引擎，`pwa` rebase 即可 |
| D-5 | **Pyodide 走 jsdelivr CDN（v0.28.3），不塞进 git** | 仓库轻；实测 CDN 200、wasm 8.6MB + stdlib 2.4MB；SW 缓存后离线可用 |
| D-6 | **字体自托管**：DM Sans + JetBrains Mono（8 个 woff2，154KB） | 中文用系统字体（PingFang / 微软雅黑 / Noto CJK），省 1.5MB 分片 |
| D-7 | **默认主题 `su-biz-azure`** | 本地版默认 `bold-blue`，PWA 用更有代表性的商务卷宗风 |
| D-8 | **封面 19 种风格**（比本地版 UI 的 11 种多 8 个归藏变体） | 本地 API 只暴露 editorial/swiss 两个入口；PWA 把 10 套模板各自独立成风格 |
| D-9 | **不接本机服务也能用全部排版功能** | 只有"推送"和"Pexels 搜图"依赖本机/Key，其余纯前端 |
| D-10 | **域名分四阶段**：`*.pages.dev` 自测 → 自购域名 → 备案 + EdgeOne → 离线包兜底 | `workers.dev`/`pages.dev` 国内不稳定；免费域名拿不到大陆节点 |

---

## 4. 目录与文件清单

```
pwa/
├─ index.html                    app shell（顶栏 / 编辑区 / 预览区 / 抽屉 / toast）
├─ src/
│  ├─ style.css                  设计系统（与本地版共用变量）
│  ├─ app.js                     交互层：主题列表、防抖渲染、复制、草稿、抽屉
│  ├─ bridge.js                  主线程 ⇄ Worker 的 Promise 化消息协议
│  └─ engine.worker.js           Pyodide 加载 + 引擎调用 + 进度上报
├─ public/
│  ├─ manifest.webmanifest       name/start_url/display/icons/shortcuts
│  ├─ sw.js                      Service Worker（预缓存 shell，CacheFirst 引擎字体）
│  ├─ icons/{192,512}.png        App 图标（暖纸底 + 朱砂方块）
│  └─ fonts/{8×woff2, fonts.css, OFL.txt}
├─ scripts/
│  ├─ fetch_fonts.py             已写好、已验证（8 文件 154KB）
│  ├─ build.mjs                  白名单构建 → dist/
│  └─ deploy.sh                  从 opendoor/.env 读凭证，部署 Pages
└─ README.md                     部署步骤 + 一键命令

随构建复制进 dist/（不进 git）：
├─ py/format_engine.py ← core/format_engine.py
├─ py/preprocessor.py  ← core/preprocessor.py
├─ py/markdown.zip     ← site-packages/markdown（zipimport 用）
├─ themes/*.json       ← public/themes/ 全 164 套
└─ theme-thumbs/*.jpg  ← public/theme-thumbs/ 全 164 张
```

**分支纪律**：`pwa` 分支只加 `pwa/` 与 `.gitignore`，**不改 `core/`、不改 `templates/`**。引擎有问题回 `main` 修。

---

## 5. 技术要点

### 5.1 引擎加载

```js
// engine.worker.js
const PYODIDE_BASE = 'https://cdn.jsdelivr.net/pyodide/v0.28.3/full/';
// ① importScripts(pyodide.js) ② loadPyodide({indexURL}) ③ 写 py/ 到 FS
// ④ sys.path 加入 markdown.zip（zipimport）⑤ import format_engine
```

- `markdown` 3.10.2（纯 Python，51 文件 553KB）打成 **单个 zip**，靠 Python 的 zipimport 直接 import，避免写 51 个文件
- `preprocess(text, 'auto')` → `convert_markdown_to_wechat_html(md, theme_path)`
- `convert_markdown_to_wechat_html` 要读**文件路径**，所以主题 JSON 先 `FS.writeFile` 到内存 FS（`/tmp/theme.json`）再传路径
- 进度分四段上报：下载运行时 5%→55% / 解压标准库 55%→75% / 载引擎 75%→92% / 就绪 100%

### 5.2 渲染协议

```js
// 主线程
const { html, markdown } = await bridge.render(text, themeId);
iframe.contentDocument.write(html);  // 同步写入，避免 blob 异步时序问题

// Worker 回传
{ id, type: 'rendered', payload: { html, markdown } }
```

同一 `id` 的重复请求直接丢弃（防抖 400ms 后只留最后一次）。

### 5.3 主题数据

构建时生成 `dist/themes/index.json`：`[{id, name, desc, primary, accent, background, family}]`。
`family` 由 id 前缀推导：`su-biz-*` → 卷宗，`su-feast-*` → 庙会，`su-letter-*` → 信笺，`su-minimal-*` → 素页，`su-night-*` → 夜航，`su-stamp-*` → 钢印，其余 → 单列。
主题 JSON 本体**打开抽屉时才拉**，不阻塞首屏。

### 5.4 复制

```js
const item = new ClipboardItem({
  'text/html': new Blob([wrappedHtml], { type: 'text/html' }),
  'text/plain': new Blob([plainText], { type: 'text/plain' }),
});
```

降级链：`navigator.clipboard.write` → `document.execCommand('copy')`（临时 contenteditable）→ 弹手动指引。
不支持 `ClipboardItem` 的浏览器（老 Safari）直接走第二级。

### 5.5 Service Worker 策略

| 资源 | 策略 |
|---|---|
| `index.html` / `src/*` / `manifest` / `icons` | Precache（安装时） |
| `fonts/*` / `themes/*` / `theme-thumbs/*` | CacheFirst，永久 |
| Pyodide CDN（`cdn.jsdelivr.net`） | CacheFirst，首次 fetch 后 `cache.put` |
| 导航请求 | NetworkFirst → 回退缓存 shell |

### 5.6 移动端

≤900px 时单栏 + 底部 `内容 / 预览` 切换。编辑区 `font-size:15px` 防 iOS 聚焦缩放。

---

## 6. 施工清单

每步结束都要：**改完即验 → 单项 commit → 回本表打勾**。

### D1 骨架与字体

| 项 | 内容 |
|---|---|
| 改 | `pwa/index.html`、`pwa/src/style.css`、`pwa/public/manifest.webmanifest`、`pwa/public/icons/*`、`pwa/scripts/fetch_fonts.py`（已写好） |
| 做 | 三段式布局（顶栏 56 / 左编辑 / 右预览+风格条）；启动遮罩带进度条；图标用 Pillow 生成（暖纸底 #F7F4EE + 朱砂 #AF3E2B 方块 + 白点） |
| 验 | `python -m http.server 8080 -d pwa` → 打开看到骨架、字体生效、遮罩停在"等待引擎" |
| 回滚 | 删 `pwa/` 未提交文件 |

### D2 Pyodide 接引擎

| 项 | 内容 |
|---|---|
| 改 | `pwa/src/engine.worker.js`、`pwa/src/bridge.js`、`pwa/scripts/build.mjs`（先出最小可用版：只拷 `py/` + 一个主题） |
| 做 | Worker 加载 Pyodide v0.28.3 → 写 py/ 与 markdown.zip → 暴露 `render`；bridge 做 id 映射与超时（30s） |
| 验 | 控制台 `await bridge.render('第一行标题\n\n正文', 'su-biz-azure')` 返回 html，且与本地 `POST /api/render` 的 `html` **逐字节相同**（取一段 300 字样本对比） |
| 回滚 | Worker 报错时主线程提示"引擎加载失败，请刷新"，不白屏 |

**这是全项目风险最高的一步**。先只验证「能出 HTML」，UI 接不接得上放 D3。

> ✅ **2026-10-18 已实测通过**：Pyodide v0.28.3 跑通现有引擎，436 字样本输出与本地 `POST /api/render` **逐字节一致**（html 4821B）；引擎启动 6.7s、单次渲染 415ms。
> ⚠️ **踩过的坑**：`markdown` 打包成 zip 时必须把 `markdown-<ver>.dist-info/{METADATA,entry_points.txt,top_level.txt,WHEEL}` 一起打进去。markdown 3.10 优先用 entry points 解析扩展名（`tables`/`fenced_code`/`nl2br`），缺 dist-info 会退化成 `import_module('tables')` → `ModuleNotFoundError`。补上即解决，引擎零改动。

### D3 UI 接引擎

| 项 | 内容 |
|---|---|
| 改 | `pwa/src/app.js`、`pwa/scripts/build.mjs`（全量主题 + 缩略图）、`pwa/index.html`（解析条 / 风格条 / 抽屉实体） |
| 做 | 粘贴 → 防抖 400 → 渲染 → iframe；解析条统计从返回的 `markdown` 算；风格胶囊（收藏→最近→其他）；抽屉六族筛选 + 缩略图 lazy |
| 验 | 粘贴 500 字 → 3 秒内出预览；164 套全部可选；收藏刷新后保留 |
| 回滚 | 保留 `?fallback=1` 参数：跳过 Worker，只显示原文 |

### D4 复制 / 草稿 / 清缓存

| 项 | 内容 |
|---|---|
| 改 | `pwa/src/app.js`、`pwa/index.html`（更多菜单） |
| 做 | 复制三级降级；草稿 `localStorage`（`text`/`themeId`/`ts`，1.5s 防抖写）；「更多」放：清空草稿 / 清除本地数据（caches → localStorage）/ 关于 |
| 验 | 复制后粘到公众号后台样式完整；关页再开内容恢复；清除后回到空白 |
| 回滚 | 清数据前 `confirm()` 二次确认 |

### D5 封面

| 项 | 内容 |
|---|---|
| 改 | `pwa/src/cover.js`（新增）、`pwa/src/app.js`（第二页签）、`pwa/scripts/build.mjs`（拷 `cover-templates/`、`blcaptain-style-skill/`、`public/images/`、`public/vendor/`） |
| 做 | 19 种风格卡；底图三合一；三尺寸；`html2canvas` 或 **`SVG foreignObject` → canvas**（不引新依赖的话）导出 PNG |
| 验 | 任一风格 → 出 3 张真实 PNG；上传底图能叠上去；长标题不溢出 |
| 回滚 | 封面整块 `feature flag`（`localStorage.cover=0` 隐藏入口） |

✅ **2026-10-18 已验证可行**：`html-to-image@1.11.13` 把归藏 `editorial-ink-classic` 渲成 1080×1440 PNG 只用 **792ms**（2.24MB），底图正常叠加、文字清晰、长标题自动换行不溢出。证据 `docs/pwa-spike/0b-cover.png`。

⚠️ **新发现的硬约束：字体必须自托管。** 归藏模板外链了 5 个 Google Fonts 家族（Noto Serif SC / Noto Sans SC / Playfair Display / Inter / IBM Plex Mono）。PWA 两条都不能留：合规断言禁止 `fonts.googleapis.com`，且国内被墙。
- 拉丁字族（Playfair / Inter / Plex Mono）直接自托管，体积小
- 中文字族（Noto Serif SC / Noto Sans SC）必须**按常用字子集化**（3500 常用字约 1-2MB/字重），否则单个字重就 8MB+
- 截图时 `html-to-image` 传 `skipFonts: true`，字体由页面已加载的 `@font-face` 提供，避免重复内联
- BLCaptain 侧的字体策略同样要核（D5 首日一起看）

### D6 manifest + SW + 离线

| 项 | 内容 |
|---|---|
| 改 | `pwa/public/sw.js`、`pwa/src/app.js`（注册）、`pwa/index.html` |
| 做 | 预缓存 shell；引擎/字体 CacheFirst；导航回退 |
| 验 | Chrome DevTools → Application → 断网 → 刷新仍可用；Lighthouse PWA 项通过 |
| 回滚 | SW 加 `skipWaiting` + 版本号，出问题换 `sw.js` 内容即失效 |

### D7 合规收尾

| 项 | 内容 |
|---|---|
| 改 | `LICENSE`（已有）、`THIRD_PARTY_NOTICES.md`（已有）、`pwa/index.html`（页脚源码链接）、`README.md` |
| 做 | 页脚加「源码 / AGPL-3.0 / 第三方许可」三链接；确认归藏与 BLCaptain 的 LICENSE 文件随包或随仓库可访问 |
| 验 | 三条断言通过；页脚链接可点；`THIRD_PARTY_NOTICES.md` 覆盖归藏、BLCaptain、fitty、字体、图片来源 |
| 回滚 | — |

### D8 构建 + 部署

| 项 | 内容 |
|---|---|
| 改 | `pwa/scripts/build.mjs`（定稿）、`pwa/scripts/deploy.sh`、`pwa/README.md` |
| 做 | 白名单构建 + 三条 CI 断言 + 部署 Pages |
| 验 | `node pwa/scripts/build.mjs` 出 `dist/`；`bash pwa/scripts/deploy.sh` 出网址；网址能打开并渲染 |
| 回滚 | Pages 项目可整体删除；`main` 分支不受影响 |

### D9 离线包

| 项 | 内容 |
|---|---|
| 改 | `pwa/scripts/build.mjs`（加 zip 目标） |
| 做 | `dist/` 打成 `supersu-pwa.zip`，附 `使用说明.txt`（解压 → 起静态服务 → 打开） |
| 验 | 解压后 `python -m http.server` 打开可用 |
| 回滚 | — |

### D10 真机验收

| 项 | 内容 |
|---|---|
| 做 | 安卓 Chrome + iOS Safari + 桌面 Chrome；群里 2-3 人试用 |
| 验 | 逐条对 §7 验收表 |
| 回滚 | 保留 `main` 的本地版作为兜底 |

---

## 7. 验收表

**功能**

- [ ] 打开网址 → 粘贴 500 字 → 3 秒内出预览
- [ ] 164 套主题全部可选，缩略图正确
- [ ] 收藏星标可点，刷新后保留
- [ ] 复制 → 粘到公众号后台，粗体/引用/列表/标题样式完整
- [ ] 草稿：关页再开 → 内容恢复
- [ ] 断网 → 刷新仍可用
- [ ] 手机可"添加到主屏幕"，图标正常
- [ ] 封面：任一风格出 3 张真实 PNG，长标题不溢出
- [ ] 推送入口探测本机服务：有则桥接、无则提示

**合规**

- [ ] `dist/` 内无 `cover-templates|screenshot-backgrounds|prototypes`（D-3 后 `images/` 与 `social-thumb/` 允许，仅封面用图进包）
- [ ] `dist/` 内无 `fonts.googleapis.com`
- [ ] 字体目录含 `OFL.txt`
- [ ] 页脚源码链接可访问
- [ ] `THIRD_PARTY_NOTICES.md` 覆盖归藏 / BLCaptain / fitty / 字体 / 图片

**回归**

- [ ] 同一段 300 字样本，PWA 输出 HTML 与本地 `POST /api/render` 逐字节相同
- [ ] Worker 崩溃/超时有提示，不白屏
- [ ] 本地版 `main` 的 178 项测试仍全绿（`pwa` 分支不改 `core/`）

**性能（首次 / 二次）**

- [ ] 首屏 HTML+CSS+JS ≤ 250KB
- [ ] 引擎下载进度可见，不假死
- [ ] 二次打开（已缓存）≤ 1.5 秒可用
- [ ] 单次渲染 ≤ 1.2 秒（500 字）

---

## 8. 部署

```bash
# 1) 构建
node pwa/scripts/build.mjs          # → pwa/dist/

# 2) 断言（build.mjs 内置，失败即退出非 0）

# 3) 部署（凭证从 opendoor 读，不落盘、不打印）
bash pwa/scripts/deploy.sh
# = npx wrangler pages deploy pwa/dist --project-name=supersu-pwa
```

| 项 | 值 |
|---|---|
| 账号 | opendoor 项目的 Cloudflare 账号（凭证在 `E:\test\opendoor\.env`） |
| 项目名 | `supersu-pwa` |
| 默认网址 | `https://supersu-pwa.pages.dev` |
| 自定义域名 | 自购域名 + Cloudflare DNS（国内稳定需备案 + EdgeOne） |

⚠️ 不要把 Token 复制进本仓库、不要提交 `.env`、不要在日志里打印。

**国内可访问性**：`pages.dev` 不稳定。第一阶段先用它自测，群里发的时候同时给离线包。要长期稳定只有「自有域名 + 备案 + 国内 CDN」一条路。

---

## 9. 风险与回滚

| 风险 | 概率 | 应对 |
|---|---|---|
| ~~Pyodide 跑不通现有引擎~~ | ~~中~~ | ✅ 2026-10-18 已实测：逐字节一致。风险解除 |
| ~~浏览器内截图不可行~~ | ~~中~~ | ✅ 2026-10-18 已实测：`html-to-image` 792ms 出 1080×1440。风险解除 |
| **封面字体子集化**（中文两族，做不好体积失控） | 中 | D5 首日定方案：常用 3500 字子集 + 按字重分片；实在不行中文字族退回系统字体（视觉略降级） |
| 首屏 11MB 体感重 | 高 | 进度条 + 明确文案 + 二次秒开；后续可考虑把引擎拆包 |
| iOS 内存（Pyodide ~150MB） | 中 | Worker 内运行、单页复用；超长文档分片；真机先测 |
| `pages.dev` 国内打不开 | 高 | 离线包兜底；长期走备案域名 |
| 包体超标（白名单漏拷） | 低 | 构建断言拦截 |

**总回滚**：删 Pages 项目 + 丢弃 `pwa` 分支。`main` 完全不受影响。

---

## 10. 工作量

| 阶段 | 人日 |
|---|---|
| D1–D4 排版主链路 | 3–4 |
| D5 封面 | 2–3（取决于浏览器截图方案） |
| D6–D9 PWA 化 + 部署 | 2 |
| D10 真机与修复 | 1–2 |
| **合计** | **8–11** |

---

*2026-10-18 定稿 · 与 `pwa-design.md` 冲突时以本文档为准*
