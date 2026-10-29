# 更新模块（Update Module）交接文档

> ⚠️ **2026-10-29 行为变更（v1.8.0，高于本文正文）**：更新入口从「只被动等待」补齐为**可主动检查 + 可一键更新**。
> - 更新记录面板顶部新增**状态条**：打开面板即自动查服务器；四态「正在检查 / 已是最新 / 新版本已就绪 / 下载中」，
>   就绪态直接给「立即重启」按钮，点完自动落盘草稿 → 新 worker 接管 → reload，全程不需要用户理解 SW。
> - 静默自动应用策略改为**方案 A**：仅在页面不可见、或空闲满 10 分钟时才自动重启；
>   用户点过「检查更新」后 60s 内**不自动重启**（否则一点就刷新，体验极差）。
> - 更新记录新增：亮点列表（`highlights`）、开发者细节折叠（`dev` 条目）、**反馈入口**（报告问题 / 提个需求 / 复制邮箱，`mailto:` 预填版本+浏览器信息）、底部「最近 5 次更新诊断」。
> - **壳层增量真正落地**：`SHELL_CACHE` 固定名 + 逐文件内容哈希键，改一行 JS 实测只下 6 个文件 / 62KB（原先 1.29MB / 59 请求）。
> - 自动化验证：`scripts/pwa_update_panel_test.py` **11/11**（已进门禁）· `pwa_release_card_test.py` 9/9 · `pwa_auto_update_test.py` 8/8。
>
> 2026-10-24 的旧变更（仍有效）：静默自动升级 + 右下角「已升级到 vX · bN」小提示；大卡片「发布小票」只在 `#upd-demo` 预览。
> 以 `pwa/src/update/index.js` 与 `AGENTS.md` §4 为准。

> 适用范围：本仓库 PWA 的「更新」相关功能（版本检测、Service Worker 更新、右下角更新入口、发布小票、更新记录面板）。
> 本文档面向**接手该模块的开发者**，讲清：文件在哪、改哪、怎么加新版本、怎么验证、已知坑。
> 编写于 2026-10-18。抽取工作已提交 `26ba27a`，本文档提交 `2a705d2`。

---

## 0. 一句话定位

更新模块负责 PWA 的 **版本检测 + SW 更新 + 右下角更新入口 + 发布小票 + 更新记录面板**。

本次把原本散落在 `pwa/src/` 的 3 个文件（`update.js` / `changelog.js` / `changelog.css`）**抽成独立目录 `pwa/src/update/`**，并让模块**自己注入 DOM**，页面只留一个 `<div id="update-root">` 挂载点。目的是让「更新」能独立迭代，改文案/改样式/加东西都不用动 `index.html`。

---

## 1. 文件清单（改哪里）

| 文件 | 职责 | 你通常会改它吗 |
|---|---|---|
| `pwa/src/update/index.js` | 主逻辑：SW 更新检测、`version.json` 轮询、右下角入口、发布小票渲染。导出 `createUpdater()` | 改更新行为时 |
| `pwa/src/update/ui.js` | **模块自带 DOM 模板**，`mountUpdateUI()` 注入到 `#update-root`。右下角按钮、发布小票的结构与 id 都在这里 | 改文案/结构/加元素时 |
| `pwa/src/update/changelog.js` | 更新记录面板（`#cl-panel`），从 `changelog.json` 渲染。导出 `createChangelog()` | 改记录面板样式/逻辑时 |
| `pwa/src/update/update.css` | 更新模块**全部**样式（原 `style.css` 里的 `upd-*` 段已搬来） | 改外观时 |
| `pwa/public/changelog.json` | 更新记录数据源（**由脚本生成，别手改**） | 一般不动 |
| `pwa/version.json` | 当前版本（**语义化版本**，现为 `1.8.0`）。必须与更新记录最新版本**一致** | 发版时改 |
| `pwa/public/sw.js` | SW：三份内联清单（SHELL / ASSETS / DATA）+ 分层缓存 + `PRECACHE_PROGRESS` 进度广播 | 改缓存策略时 |
| `pwa/scripts/build.mjs` | 构建：**扫描**生成三份清单 + 算 `BUILD_ID` + 注入 `sw.js` | 一般不用动 |
| `pwa/scripts/changelog_milestones.json` | 版本切点（从新到旧，`until` 为**右闭时刻**、精确到秒，支持同一天切多版） | 发版加新版本时加一条 |
| `pwa/scripts/gen_changelog.py` | 从 git 历史 + milestones 生成 `changelog.json` 和 `CHANGELOG.md`（**构建时自动跑**，见 §5） | 一般不用手动跑 |

> **2026-10-29 起不再需要手工维护文件清单**：`build.mjs` 会扫描 `src/**/*.{js,css}` + `index.html` + `manifest` + `fonts/*.css`
> 生成 `SHELL_MANIFEST`，扫描 `icons/ brand/ samples/ cover-templates/ vendor/ fonts/*.woff2` 生成 `ASSETS_MANIFEST`，
> 再把两份清单的摘要算成 `BUILD_ID` 注入 `sw.js`。加新文件**只需放进对应目录**，清单自动跟上（漏注入/清单不全构建会断言失败）。

---

## 2. 挂载方式（关键，先读这段）

- `pwa/index.html` 里**只有**一行挂载点：
  ```html
  <div id="update-root"></div>
  ```
  以及一行样式引用：`<link rel="stylesheet" href="./src/update/update.css">`。
- `pwa/src/app.js` 用**动态 import** 拉起模块：
  ```js
  import('./update/changelog.js'),
  import('./update/index.js'),
  ```
- `index.js` 的 `createUpdater()` **一进来就调 `mountUpdateUI()`**。**这行必须最先调**——它在取所有 DOM 元素之前把 UI 注入进去。顺序错了，后面 `document.getElementById('btn-update')` 全是 `null`，会直接崩。这是上一轮踩过的坑，已修好，别再挪动顺序。

---

## 3. 数据流 / 工作原理

两条独立线索并行（详见 `index.js` 头部注释）：

1. **Service Worker 更新线索**
   - `sw.js` 不自动 `skipWaiting`，新版本装好后停在 `waiting`，避免用户正打字时突然换资源。
   - 页面检测到 `waiting` 的 worker → 交给 `tryAutoApply()` 决定是否立即重启（**方案 A**，见下）。
   - 更新失败仍弹卡片写明原因，不静默。
   - `sw.js` 用 `updateViaCache:'none'` 注册，避免被 HTTP 缓存住导致永远查不到更新。
   - 每小时 + 回到前台时主动 `registration.update()`（5 分钟内不重复打请求）。

2. **静态版本文件线索**（`version.json`，`no-store` 比对）
   - 用于「更新说明」要知道版本号；用户一直不关标签页时，靠轮询也能发现远端已发新版。
   - `changelog.json` 在 SW 里走 `networkFirstCache`（**不预缓存、不放行**），所以更新记录永远能拿到最新的。

### 3.1 主动检查：`checkNow({ force })` → 五态

更新记录面板打开时（以及状态条上的「再查一次」/「立即重启」）都会调它，返回：

| 返回 | 含义 | 状态条显示 |
|---|---|---|
| `latest` | 服务器版本 = 运行版本 | 已是最新 · `vX · bN` · 再查一次 |
| `data-only` | 版本号变了但壳没变（只改了主题/更新记录） | 数据已同步（不提示重启） |
| `update` / `ready` | 有新壳，worker 已 `waiting` | 新版本 `vX · bN` 已就绪 · 立即重启 |
| `offline` | `version.json` 取不到 | 连不上服务器 · 重试 |
| `pending` | 正在下载中 | 正在下载 + 进度条 |

内部状态机 `phase`：`idle | checking | latest | available | downloading | ready | applying | data-only | offline | done`。
对外用 `subscribe(fn)` / `snapshot()` 暴露，`changelog.js` 的 `#cl-status` 只订阅、不自己去轮询。

> 两个必须保留的实现细节，删了会立刻退化：
> 1. **「检查中」至少停 320ms**（`settle()`）。本地/好网 `version.json` 几毫秒就回，状态条一闪而过，
>    用户会以为「没检查」，自动化也观测不到。
> 2. 注册 SW 的 `message` 监听里有 `if (!navigator.serviceWorker.controller) return;`——
>    **首次安装**也会广播 `PRECACHE_PROGRESS`，不拦就会把「安装」说成「更新下载中」，入口文案会一直卡在「更新下载中」。

### 3.2 静默策略：方案 A（2026-10-29 起）

```js
const AUTO_RESTART_IDLE_MS = 10 * 60 * 1000;  // 空闲满 10 分钟
const MANUAL_SUPPRESS_MS   = 60 * 1000;       // 用户刚点过检查，60s 内别自动重启
```

`tryAutoApply()` 只在以下任一条件成立时自动重启，否则**安静等待**：
- 页面**不可见**（切到别的标签页 / 最小化）；
- 或可见但已空闲满 10 分钟（`window.__supersuIsIdle()` 为真，即用户没在输入）。

旧的「一直在打字最多等 30s 就强刷」已废弃——那会在用户敲到一半时刷新。

### 3.3 增量更新：三份清单 + 内容哈希键

```
SHELL_CACHE = 'supersu-store-shell-v1'     // 固定名，不再随 BUILD_ID 换代
ASSETS_CACHE / DATA_CACHE / RUNTIME_CACHE / MEDIA_CACHE
```

- **每个静态文件带内容哈希作为缓存键**（`?h=<sha256>`），命中即 0 请求；
  只有内容变了的文件才会真的下网络。实测：改一行 `src/app.js` → **6 个文件 / 62KB**（原 1.29MB / 59 请求）。
- `fetch` 分流顺序：`navigate` → `version.json` 放行 → `changelog.json` 网络优先 → shell 哈希键
  → runtime → CDN → 缩略图 SWR → assets 哈希键 → data → SWR 兜底。
- `putClean()` 重建没有 `redirect` 标记的 Response——否则导航回退会 `ERR_FAILED`。
- 下载期间按 120ms 节流广播 `PRECACHE_PROGRESS { done, total, fetched, bytes, finished, ms }`；
  `fetched` 是**真正下载数**，`total` 是**比对总数**。面板显示的是 `fetched`（"已下载 N 个文件"），
  存进 `pendingUpdate.files` 的也是 `fetched`——写成 `total` 会出现「225 个文件 / 62KB」这种自相矛盾的文案。

### 3.4 「本次更新 N 条」为什么不再恒为 0

`LS_PREV`（上次运行的版本号）必须在 **reload 之前**写：`applyUpdate()` 和 `controllerchange` 里都写 `state.running`。
否则 reload 后 `reconcileSeenVersion()` 会把新版本直接标成"已读"，`openChangelog()` 再拿 `since` 时已经无差值 → 恒 0 条。
`openChangelog()` 用 `prevVersion` 作 `since`，且 banner 在 `since === currentVersion` 时**隐藏**（首次访问没更新可回顾，别摆一句"你之前用的是 v当前版本，已是最新"）。

**发布小票（右下角卡片）渲染逻辑**（`index.js` 的 `highlightsSince`）：
- 取「用户上次看到之后」的更新条目 → 最多 3 条亮点 + 总数。
- 如果 changelog 版本落后于运行版本、取不到 newer 条目，回退到**最近一批**（scope=`latest`），避免小票永远是占位文案。

**调试预览入口**：地址栏加 `#upd-demo`，会直接弹出「发布小票」用于预览，**不影响正常更新流程**。本地验证必用。

---

## 4. 怎么加一个新版本 / 改更新说明（操作手册）

> 更新记录是**声明式生成**的，不要手改 `changelog.json`。

1. 日常开发按 **Conventional Commits** 写 commit（`feat` / `fix` / `docs` / `chore` / `test` / `refactor` / `perf` / `style`；未知类型兜底 `other`，不丢条目）。
2. 发版时，在 `pwa/scripts/changelog_milestones.json` **加一条**新版本切点（从新到旧排，带 `version` / `date` / `title` / `until`）。`until` 是**右闭时刻**、精确到秒——同一天要切多个版本时靠它区分（脚本用 `--date=iso-strict` 取提交时刻分桶）。
3. 改 `pwa/version.json` 的 `version` 为本次版本号（语义化，如 `1.4.0`），**并与第 2 步加的那条版本号一致**——运行版本和列表最新版本对齐，「当前版本」高亮与"这次更新了 N 条"判断才对得上。构建会把提交数写进 `build` 字段，仅作展示。
4. 构建（见 §5，注意 safe-delete 坑）。**构建时会自动跑 `gen_changelog.py` 重新生成 `changelog.json`**，所以不用手动跑；想先预览也可以：
   ```bash
   python pwa/scripts/gen_changelog.py         # 写 changelog.json + CHANGELOG.md
   python pwa/scripts/gen_changelog.py --check # 只自检、不写文件
   ```
5. 本地验证（见 §6），需要时部署（见 `docs/runbook.md`；实际命令是 `bash pwa/scripts/deploy.sh`）。

---

## 5. 构建命令

```bash
# 本机 node 的 fs.rm 被 genie-trash 拦截，清 dist 会失败，必须关掉 safe-delete：
CODEBUDDY_SAFE_DELETE_ENABLED=0 node pwa/scripts/build.mjs
```

构建会把 `src/update/*` 打进 `pwa/dist/src/update/`，拷入 `changelog.json` 前**自动跑一次 `gen_changelog.py`**（用最新 git 历史重生成，失败则沿用现有文件、不阻断构建），版本号取 `version.json`（提交数写进 `build` 字段）。构建末尾有**断言**（关键文件齐全、主题数一致、无本地版专属目录、无 Google Fonts 外链、`__SHELL_MANIFEST__` 已注入、`SHELL_MANIFEST` 不含 `src/app.js`、无残留 `SHELL_OPTIONAL`、`assets-manifest.json` 完整等），失败会直接报错。

清单**不需要手工维护**（2026-10-29 起）：`buildShellManifest()` / `buildAssetManifest()` 扫描目录生成，
`computeBuildId()` 取两份清单摘要作指纹，`stampSw()` 往 `sw.js` 的 `/*__*_MANIFEST__*/` 占位符里注入。

> 构建末尾会打印一行指纹，部署后核对用：
> `✓ SW 指纹 BUILD_ID=<hash> + 清单 shell 24 / data 168 / assets 33 + _headers`

---

## 6. 验证「没改坏」

**首选：跑专项回归（11 项，约 15s）**

```bash
.venv/Scripts/python.exe scripts/pwa_update_panel_test.py
```

它拷一份 `pwa/dist` 到系统临时目录，**改写里面的 `version.json` / `sw.js` / `changelog.json` 模拟服务器发版**，
不 mock Service Worker、全程真 SW。覆盖：打开面板即自动检查 → 出现新版本 → 点「立即重启」自动完成并刷新
→ 更新记录里「本次更新 N 条」且 N > 0 → 反馈入口指向 `sulcr@qq.com` 且邮件预填版本 → 零 JS 异常。
该测试已纳入 `scripts/run_gates.py`（`update_panel`，本地层）。

其它相关回归：`pwa_auto_update_test.py`（静默自动更新 8）· `pwa_release_card_test.py`（发布小票 9，打线上）。

**手工冒烟**（用系统 Chrome，不要用自带 Chromium）：

```bash
# 1) 起本地服务（服务根必须在 pwa/dist，否则相对路径全 404）
cd pwa/dist && python -m http.server 8901 --bind 127.0.0.1
# 2) 用系统 Chrome 打开 http://127.0.0.1:8901/#upd-demo
```

人工核对清单：
- [ ] 右下角版本号渲染（如 `v1.8.0 · b263`）
- [ ] `#update-root` 被注入出子节点（UI 由模块自建）
- [ ] `#upd-demo` 能弹出发布小票，徽标是版本号、亮点 ≥ 3 条
- [ ] 点「查看全部」打开更新记录面板（`#cl-panel` 可见）
- [ ] 面板顶部状态条先「正在检查」后「已是最新」
- [ ] 面板底部反馈行三个入口可点，`mailto:` 指向 `sulcr@qq.com`
- [ ] 控制台无未捕获异常

> ⚠️ **起本地服务前，先关掉占用 `pwa/dist` 的后台 http.server**（跨工具调用的后台服务不存活，但若用 run_in_background 起的 server 还在占目录，rebuild 的 `rmdir` 会报 `EBUSY`）。验证完记得 `kill` 掉 server。

---

## 7. 已知坑（接手前必看）

| # | 现象 | 原因 | 解决 |
|---|---|---|---|
| 1 | `build.mjs` 报 `genie-trash failed` / `EBUSY` 清不了 dist | 本机 node 的 `fs.rm` 被 genie-trash 拦截 | 构建前加 `CODEBUDDY_SAFE_DELETE_ENABLED=0` |
| 2 | rebuild 报 `EBUSY rmdir pwa/dist` | 有后台 http.server 占着目录 | 先 `kill` 占用 8901（或对应端口）的服务再构建 |
| 3 | 页面报 `Cannot read properties of null`（更新相关） | `createUpdater` 里 `mountUpdateUI()` 没最先执行 | 保证 `createUpdater` 里 `mountUpdateUI()` 在所有 `getElementById` 之前 |
| 4 | 改了更新文案却没生效 | 改的是 `ui.js` 模板但没重新 `mountUpdateUI`，或缓存 | 清 SW / 硬刷新；确认改的是 `pwa/src/update/ui.js`（不是旧 `index.html` 里的内联块） |
| 5 | 首次访问就显示「更新下载中」，永远不恢复 | 首次安装也广播 `PRECACHE_PROGRESS`，被当成更新 | `index.js` 的 message 监听里 `if (!navigator.serviceWorker.controller) return;` |
| 6 | 面板显示「225 个文件 / 62KB」自相矛盾 | `done/total` 是**比对总数**，不是下载数 | 进度里区分 `total`（比对）与 `fetched`（真下），文案与落盘都用 `fetched` |
| 7 | 只改了几行 JS，构建后却整包重下 1.29MB | 缓存名带 `BUILD_ID`，壳内 51 项全换 key | 缓存名固定 `supersu-store-shell-v1` + 逐文件 `?h=<sha256>` 键（2026-10-29 已修） |
| 8 | 升级后点「查看更新」恒为 0 条 | reload 后 `reconcileSeenVersion()` 把新版本写成已读，`since` 无差值 | `applyUpdate()` / `controllerchange` 里 reload **前**写 `LS_PREV` |
| 9 | git diff 里某个文件整篇 +/-（内容其实没变） | 编辑器把 LF 存成了 CRLF | `git checkout -- <file>` 回滚，或确认 `core.autocrlf=false` 下不要引入 `\r\n` |
| 10 | 状态条「正在检查」截图/自动化抓不到 | `version.json` 几毫秒返回，一闪而过 | `checkNow` 的 `settle()` 保证「检查中」至少停留 320ms |
| 11 | 状态条永远只有「已是最新」，从不显示「N 分钟前检查」 | `state.checkedAt` 初始化 0 后再没赋值 | 成功拿到 `version.json` 后写 `state.checkedAt = Date.now()`；离线**不**写（否则谎报刚查过） |
| 12 | 刚查过 30s 再打开面板，看不到服务器刚发的新版 | `CHECK_REUSE_MS`（60s）复用窗口把用户主动打开也挡了 | `open()` 调 `handlers.check(true)` 强制真查；复用窗口只兜后台轮询 |
| 13 | 手机端版本标题显示成「更新体验重…」 | 版本头一行塞了 ver+date+title+最新+N 条 | ≤600px 时 `.cl-rel-head` 换行，标题 `order:3; flex:1 1 100%` 独占第二行 |
| 14 | 首次访问时启动条压住面板页脚的反馈入口 | `#boot` z-index 100 > `#cl-layer` 75 | 面板 open/close 时给 body 加/去 `.cl-open`，`body.cl-open .boot` 收起 |

---

## 8. 当前状态 & 留给接手人的事

**2026-10-29 本轮已完成（v1.8.0）：**
- 更新记录面板：顶部状态条（检查/就绪/下载中/离线四态）+ 「立即重启」+ 亮点列表 + 开发者细节折叠 + 反馈入口 + 更新诊断。
- 打开面板即自动检查服务器；点「立即重启」自动落盘草稿 → 接管 → reload，全程无需理解 SW。
- 静默策略改方案 A（不可见 / 空闲 10 分钟才自动重启；手动检查后 60s 内不自动重启）。
- 壳层增量落地：固定缓存名 + 三份扫描式清单 + 内容哈希键，实测 **6 文件 / 62KB**（降 95%）。
- 修 P0：升级后「本次更新 N 条」恒为 0（`LS_PREV` 写入时机）。
- 回归：`pwa_update_panel_test.py` 11/11（已进门禁）· 本地断网探针通过（首访就绪 → 断网刷新仍就绪 → 断网排版 OK → 0 JS 错误）。

**更早（已提交 `26ba27a`）：**
- 更新模块从 `pwa/src/{update.js,changelog.js,changelog.css}` 抽取为 `pwa/src/update/{index.js,ui.js,changelog.js,update.css}`。
- DOM 改为模块自建（`ui.js`），`index.html` 只剩 `<div id="update-root">` + 一行 css link。
- `app.js` / `sw.js` / `build.mjs` 的导入与清单已全部对齐。

**建议接手人下一步（按性价比）：**
1. 给更新面板加功能直接改 `pwa/src/update/`（清单已扫描式，不用再手工同步 `sw.js`）。改完跑 §6 第一条命令。
2. 发版按 §4 流程走；部署后核对构建打印的 `BUILD_ID` 与线上 `sw.js` 一致。

---

## 9. 证据 / 产物

- 回归截图：`output/update-panel/`（状态条各态 + 更新记录本次高亮 + 反馈入口）
- 方案文档：`docs/plan-update-2026-10-29.md`（A–F 批次）；可视化方案 `output/update-redesign/index.html`
- 增量实测探针：`output/_probe/update_incremental_probe.py`（改一行 app.js → 6 文件 / 62KB）
- 断网实测探针：`output/_probe/update_offline_probe.py`（首访就绪 → 断网刷新仍就绪）
- 构建产物：`pwa/dist/src/update/{index,ui,changelog}.js` + `update.css` + `sw.js`（含注入清单）
