# 更新模块（Update Module）交接文档

> ⚠️ **2026-10-24 行为变更（高于本文正文）**：更新已改为**静默自动升级**——检测到新版本即自动应用
> （空闲立即 / 一直在打字最多等 30s，reload 前落盘草稿），完成后只在右下角弹「已升级到 vX · bN」小提示（8s 消失）；
> 大卡片「发布小票」**只在 `#upd-demo` 预览**。本文 §3 中「由用户点立即更新」的旧描述已过时，
> 以 `pwa/src/update/index.js` 与 `AGENTS.md` §4 为准（见 CLOSURE 任务 20 / 21）。
> 自动化验证：`scripts/pwa_release_card_test.py` 9/9 · `scripts/pwa_auto_update_test.py` 8/8。

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
| `pwa/version.json` | 当前版本（**语义化版本**，现为 `1.5.0`）。必须与更新记录最新版本**一致** | 发版时改 |
| `pwa/scripts/changelog_milestones.json` | 版本切点（从新到旧，`until` 为**右闭时刻**、精确到秒，支持同一天切多版） | 发版加新版本时加一条 |
| `pwa/scripts/gen_changelog.py` | 从 git 历史 + milestones 生成 `changelog.json` 和 `CHANGELOG.md`（**构建时自动跑**，见 §5） | 一般不用手动跑 |

注意：`sw.js` 和 `build.mjs` 里有更新模块的**静态文件清单**（见 §3），加新文件时必须同步这两处，否则构建断言会报错。

---

## 2. 挂载方式（关键，先读这段）

- `pwa/index.html` 里**只有**一行挂载点（第 165 行）：
  ```html
  <div id="update-root"></div>
  ```
  以及一行样式引用（第 14 行）：`<link rel="stylesheet" href="./src/update/update.css">`。
- `pwa/src/app.js`（约 557–558 行）用**动态 import** 拉起模块：
  ```js
  import('./update/changelog.js'),
  import('./update/index.js'),
  ```
- `index.js` 的 `createUpdater()` **一进来就调 `mountUpdateUI()`**（index.js:39）。**这行必须最先调**——它在取所有 DOM 元素之前把 UI 注入进去。顺序错了，后面 `document.getElementById('btn-update')` 全是 `null`，会直接崩。这是上一轮踩过的坑，已修好，别再挪动顺序。

---

## 3. 数据流 / 工作原理

两条独立线索并行（详见 `index.js` 头部注释）：

1. **Service Worker 更新线索**
   - `sw.js` 不自动 `skipWaiting`，新版本装好后停在 `waiting`，避免用户正打字时突然换资源。
   - 页面检测到 `waiting` 的 worker → **静默自动应用**（不可见 / 空闲立即；用户一直在打字最多等 `AUTO_APPLY_MS`=30s；reload 前 `flushDraft()` 落盘）→ `controllerchange` → reload → 右下角「已升级」小提示。
   - （旧行为「用户点立即更新」仅保留在 `#upd-demo` 预览路径；更新失败仍弹卡片写明原因，不静默。）
   - `sw.js` 用 `updateViaCache:'none'` 注册，避免被 HTTP 缓存住导致永远查不到更新。
   - 每小时 + 回到前台时主动 `registration.update()`（5 分钟内不重复打请求）。

2. **静态版本文件线索**（`version.json`，`no-store` 比对）
   - 用于「更新说明」要知道版本号；用户一直不关标签页时，靠轮询也能发现远端已发新版。

**发布小票（右下角卡片）渲染逻辑**（`index.js` 的 `highlightsSince`）：
- 取「用户上次看到之后」的更新条目 → 最多 3 条亮点 + 总数。
- 如果 changelog 版本落后于运行版本、取不到 newer 条目，回退到**最近一批**（scope=`latest`），避免小票永远是占位文案。

**调试预览入口**：地址栏加 `#upd-demo`（`index.js` 约 437 行），会直接弹出「发布小票」用于预览，**不影响正常更新流程**。本地验证必用。

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
5. 本地验证（见 §6），需要时部署（见 §10）。

---

## 5. 构建命令

```bash
# 本机 node 的 fs.rm 被 genie-trash 拦截，清 dist 会失败，必须关掉 safe-delete：
CODEBUDDY_SAFE_DELETE_ENABLED=0 node pwa/scripts/build.mjs
```

构建会把 `src/update/*` 打进 `pwa/dist/src/update/`，拷入 `changelog.json` 前**自动跑一次 `gen_changelog.py`**（用最新 git 历史重生成，失败则沿用现有文件、不阻断构建），版本号取 `version.json`（提交数写进 `build` 字段）。构建末尾有**断言**（关键文件齐全、主题数一致、无本地版专属目录、无 Google Fonts 外链等），失败会直接报错。

`sw.js` 与 `build.mjs` 的更新文件清单（新增文件务必同步）：
```
src/update/index.js
src/update/ui.js
src/update/changelog.js
src/update/update.css
```

---

## 6. 验证「没改坏」

冒烟脚本（用系统 Chrome，不要用自带 Chromium）：

```bash
# 1) 起本地服务（服务根必须在 pwa/dist，否则相对路径全 404）
cd pwa/dist && python -m http.server 8901 --bind 127.0.0.1
# 2) 用系统 Chrome 打开 http://127.0.0.1:8901/#upd-demo
```

人工核对清单（2026-10-18 自动化冒烟 **6/6 通过**）：
- [ ] 右下角版本号渲染（如 `v1.0.107`）
- [ ] `#update-root` 被注入出子节点（UI 由模块自建）
- [ ] `#upd-demo` 能弹出发布小票，徽标是版本号、亮点 ≥ 3 条
- [ ] 点「查看全部」打开更新记录面板（`#cl-panel` 可见）
- [ ] 控制台无未捕获异常

> ⚠️ **起本地服务前，先关掉占用 `pwa/dist` 的后台 http.server**（跨工具调用的后台服务不存活，但若用 run_in_background 起的 server 还在占目录，rebuild 的 `rmdir` 会报 `EBUSY`）。验证完记得 `kill` 掉 server。

---

## 7. 已知坑（接手前必看）

| # | 现象 | 原因 | 解决 |
|---|---|---|---|
| 1 | `build.mjs` 报 `genie-trash failed` / `EBUSY` 清不了 dist | 本机 node 的 `fs.rm` 被 genie-trash 拦截 | 构建前加 `CODEBUDDY_SAFE_DELETE_ENABLED=0` |
| 2 | rebuild 报 `EBUSY rmdir pwa/dist` | 有后台 http.server 占着目录 | 先 `kill` 占用 8901（或对应端口）的服务再构建 |
| 3 | 页面报 `Cannot read properties of null`（更新相关） | `createUpdater` 里 `mountUpdateUI()` 没最先执行 | 保证 `index.js:39` 的 `mountUpdateUI()` 在所有 `getElementById` 之前 |
| 4 | 改了更新文案却没生效 | 改的是 `ui.js` 模板但没重新 `mountUpdateUI`，或缓存 | 清 SW / 硬刷新；确认改的是 `pwa/src/update/ui.js`（不是旧 `index.html` 里的内联块） |

---

## 8. 当前状态 & 留给接手人的事

**本轮已完成（已提交 `26ba27a`）：**
- 更新模块从 `pwa/src/{update.js,changelog.js,changelog.css}` 抽取为 `pwa/src/update/{index.js,ui.js,changelog.js,update.css}`。
- DOM 改为模块自建（`ui.js`），`index.html` 只剩 `<div id="update-root">` + 一行 css link。
- `app.js` / `sw.js` / `build.mjs` 的导入与清单已全部对齐。
- 构建通过，本地冒烟 **6/6**（截图见 `output/upd_module_verify.png`）。

**未做 / 不是本模块的事：**
- 本次只做「抽取成模块」，没加新功能。
- xiaohu 那家方案已否决（见 `docs/plan-oss-reference.md` §11.9），与更新模块无关。
- 工作区另有 `scripts/theme_stress_audit.py`（582 行，另开会话的模板应力审计活儿，**不要混进更新模块的提交**）。

**建议接手人下一步（按性价比）：**
1. 若以后要给更新面板加功能，直接改 `pwa/src/update/` 内对应文件，记得同步 `sw.js` / `build.mjs` 清单。
2. 发版按 §4 流程走。

---

## 9. 证据 / 产物

- 冒烟截图：`output/upd_module_verify.png`（右下角入口 + 发布小票 + 更新记录面板）
- 构建产物：`pwa/dist/src/update/{index,ui,changelog}.js` + `update.css`
- 自动化冒烟结论：6/6 通过（UI 注入、版本号、发布小票、亮点 3 条、查看全部、零报错）
