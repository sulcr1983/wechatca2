# PWA 增量更新调研（2026-10-18）

> 🛑 **2026-10-24 审计声明**：本文为**历史快照/方案稿**，其中的版本号、构建号、「未提交/未部署」等状态**均已过期**。现行状态唯一真源：`HANDOFF.md` §0 + `AGENTS.md` + `CLOSURE.md`。

> 结论先行：现在的更新**确实是全量**——改一行 JS，用户要重新下载约 **13.2MB**。
> 其中 **11MB 是根本没变的 Pyodide 运行时**，1.4MB 是 164 个没变的主题 JSON。
> 不是"打包工具不给力"，是 Service Worker 的缓存分层设计问题，改 3 个地方就能把单次更新压到 200KB 以内。

---

## 一、为什么现在是全量（根因）

| # | 根因 | 位置 | 后果 |
|---|---|---|---|
| 1 | **一个 `VERSION` 同时命名三层缓存**（shell / data / cdn） | `pwa/public/sw.js:18,20-22` | 任何发布 = 三个命名空间全部换代 |
| 2 | **activate 只保留当前三个缓存名**，其余 `supersu-*` 全删 | `sw.js:162-178` | 旧 `cdn` 缓存里的 **Pyodide 11MB** 被直接删掉 |
| 3 | **install 无条件全量预缓存** 19 个 shell + 8 个字体 + 165 个主题 JSON | `sw.js:66-123` | 每次都重拉 2.0MB / ~191 个请求 |
| 4 | **预缓存用 `cache:'reload'`**，绕过 HTTP 缓存、不发 `If-None-Match` | `sw.js:73,100,113,146` | 没变的文件也拿完整 body，CF Pages 的 304 机制被废掉 |
| 5 | **产物没有内容哈希**，也没有 `_headers` | `build.mjs:176`；`pwa/dist` 无 `_headers` | 只能靠整体 `VERSION` 失效，做不到按文件增量 |

## 二、量化账（按 dist 实测字节）

| 场景 | shell | 主题 JSON | 引擎 py | Pyodide | 合计 | 请求数 |
|---|---|---|---|---|---|---|
| 首次安装 | 0.38MB | 1.40MB | 0.23MB | 11MB | **13.2MB** | ~199 |
| 只改一行 JS（升 VERSION） | 0.38MB | 1.40MB | 0.23MB | 11MB | **13.2MB** | ~199 |
| 只改一个主题 JSON（升 VERSION） | 0.38MB | 1.40MB | 0.23MB | 11MB | **13.2MB** | ~199 |
| 只改 JS **不升** VERSION | ~20KB | 0 | 0 | 0 | **~20KB** | 1~2（但不提示更新，且可能新旧混用） |

> 也就是说：真实改动 21KB 的发布，用户付了 13.2MB 的流量，浪费 13.18MB。

## 三、业界怎么做增量（调研结论）

### 3.1 Workbox 的 revision 机制（可手写等价）

- 构建期对**文件内容**算哈希（Workbox 用 MD5），缓存键 = `url + '?__WB_REVISION__=' + hash`。
- install 时逐条 `cache.match(新键)`：命中 → **跳过下载**；未命中 → 只拉这一个文件。
- activate 用当前 manifest 比对，删除"不在 manifest 里"的条目，而不是按缓存名整体删。
- 依据：[workbox-precaching](https://developer.chrome.com/docs/workbox/modules/workbox-precaching)、[workbox-build](https://developer.chrome.com/docs/workbox/modules/workbox-build)

**手写等价做法（本项目不需要引入 Workbox）：**

```js
// build.mjs 生成 { "themes/a.json": "<sha256>", ... }
const m = await (await fetch('./precache-manifest.json', { cache: 'no-cache' })).json();
for (const [url, rev] of Object.entries(m)) {
  const key = url + '?h=' + rev;
  if (await cache.match(key)) continue;              // 没变：0 请求
  await cache.put(key, await fetch(key, { cache: 'no-cache' }));  // 变了：只下这一个
}
```

### 3.2 HTTP 层：ETag + 304 是"零字节"的来源

| 机制 | SW 里是否生效 | 说明 |
|---|---|---|
| ETag / If-None-Match / 304 | ✅ | 浏览器自动带条件头，304 时只传几百字节响应头，JS 侧拿到合成的 200 |
| `cache:'reload'` | ❌ 破坏它 | 跳过 HTTP 缓存、不发条件头，直接 200 全量 |
| `cache:'no-cache'` | ✅ 最佳折中 | 先查缓存、强制校验：没变 304，变了 200 |
| CF Pages 默认头 | — | `ETag` + `public, max-age=0, must-revalidate`，自动 Brotli |
| `_headers` | — | 放构建输出根目录可覆盖默认头，最多 100 条规则 |

依据：[MDN Request.cache](https://developer.mozilla.org/en-US/docs/Web/API/Request/cache)、[Cloudflare Pages Serving](https://developers.cloudflare.com/pages/configuration/serving-pages/)、[CF Pages Headers](https://developers.cloudflare.com/pages/configuration/headers/)

**长缓存最佳实践**：只有"URL 随内容变"才配 `max-age=31536000, immutable`；HTML / `sw.js` / `version.json` 必须 `max-age=0, must-revalidate`。

### 3.3 字节级 delta（bsdiff / Shared Dictionary）——**不建议做**

- `sw-delta` 实验（2016）作者自称非生产可用；bsdiff 需要 WASM、生成 patch 吃内存。
- 4.27MB 里 2.8MB 是已压缩 JPEG、1.6MB 是 164 个 8KB 小 JSON，逐文件 diff 收益被 Brotli 吃掉。
- 真正的大头 Pyodide 是**版本固定 URL**，正确做法是跨版本复用，而不是打补丁。
- 结论：revision manifest 已拿到 95% 收益，复杂度只有 5%。

### 3.4 缓存分层：哪些该跨版本保留

| 资源 | 建议缓存 | 跨版本保留 | 失效方式 |
|---|---|---|---|
| `index.html`、`src/*.js/css`、`py/` 引擎 | `supersu-shell-<VERSION>` | ❌ | VERSION+1 |
| `version.json`、`changelog.json` | 不缓存（SW 直接放行） | — | 每次网络（否则更新提示慢一拍） |
| Pyodide（jsdelivr 固定版本 URL） | `supersu-runtime-v1` | ✅ | URL 自带版本，永不删 |
| 字体 / 图标 / vendor | `supersu-assets-v1` | ✅ | 极少变 |
| 主题 JSON | `supersu-data-v1` + `?h=<sha256>` | ✅ | 新 hash = 新键 |
| 缩略图 | `supersu-media-v1`（按需） | ✅ | 同上 |

activate 只删"明确属于旧版本"的名字，**绝不按 `supersu-` 宽前缀删**：

```js
const keep = new Set([SHELL_CACHE, 'supersu-runtime-v1', 'supersu-assets-v1', 'supersu-data-v1', 'supersu-media-v1']);
for (const k of await caches.keys()) {
  if (k.startsWith('supersu-shell-') && k !== SHELL_CACHE) await caches.delete(k);
}
```

> 迁移细节：新 SW 第一次 activate 时，把旧 `supersu-cdn-v2` 的条目 `match` 出来 `put` 进稳定缓存（不走网络），再删旧缓存——否则老用户仍会重下 11MB。

## 四、更新检测：现在有 3 个真 bug

| # | 问题 | 位置 | 影响 |
|---|---|---|---|
| 1 | `version.json` 被自己的 SW **SWR 缓存**住，`cache:'no-store'` 管不到 Cache API | `sw.js:236-239` + `update.js:53-57` | 远端版本比对永远读到旧值，等于失效 |
| 2 | 只改 JS/CSS 时 `sw.js` 字节没变 → 浏览器不触发 install | `sw.js:18`（VERSION 手写） | 用户永远收不到更新 |
| 3 | `controllerchange` 没判断 `hadController` | `update.js:151-155` | 首次安装也会多刷一次页面 |
| 4 | `precacheAll` 每条都 catch | `sw.js:66-87` | 关键文件 404 也能"安装成功"→ 之后白屏（不是原子安装） |
| 5 | `SHELL` 里 `./src/cover.js` 产物不存在 | `sw.js:42` | 每次 install 固定一个 404 |

**检测节奏建议**：页面可见时查（5 分钟节流）+ 每 60 分钟一次 + 启动后等首屏渲染完再查。CF Pages 对 `version.json` 的条件请求是 304，成本可忽略。
**兼容性**：iOS Safari 后台会挂起定时器，只能靠"回到前台"；微信内置浏览器多为 WKWebView，必须 `'serviceWorker' in navigator` 特性检测后降级为提示用户用系统浏览器。

## 五、静默更新 vs 提示（编辑类工具的正确姿势）

- **不能粗暴自动刷新**：编辑区是核心，reload 的代价是用户上下文，不是网络。
- 建议：**默认提示、空闲时静默**。
  - 提示：右下角非阻塞卡片「有新版本，草稿已保存」+「立即更新 / 稍后」。
  - 静默条件（全部满足才自动应用）：`visibilityState==='hidden'` 或（无焦点 + 30s 无输入 + 无输入法 composition + 草稿已落盘）。
- 多标签页：`BroadcastChannel('supersu-update')`，只有发起标签 reload，其余标签改文案「下次打开生效」。

**状态机：**

```text
IDLE ──启动/可见/定时──► CHECKING
CHECKING ──sw.js 未变或 304──► IDLE（无 UI）
   │ 字节不同
   ▼
DOWNLOADING（install 预缓存 CRITICAL；失败则 install 失败，旧 SW 继续服务）
   ▼
READY（waiting）──► UI 提示 / 空闲判定
   ▼
APPLYING：saveDraft → 发 SKIP_WAITING → 按钮「更新中…」
   ▼
RELOADING：controllerchange + hadController + 一次性 flag → reload
   ▼
CLEANUP：只删旧 shell，保留 runtime/data/prev → 记 seenVersion
```

## 六、更新不丢数据（现状与缺口）

| 风险 | 现状 | 结论 |
|---|---|---|
| 更新 reload 丢掉未保存内容 | `saveDraft` 只在 `doRender` 成功后调用（400ms 防抖 + 渲染成功）；`applyUpdate` 前不 flush | **已踩到，最高危** |
| 引擎启动失败就打不开草稿 | `restoreDraft()` 在 `await engine.boot()` 之后 | **已踩到**（弱网/离线首启正好命中） |
| 卸载瞬间没有兜底 | 全站无 `beforeunload` / `pagehide` / `visibilitychange` | 缺 |
| 配额淘汰 | 无 `navigator.storage.persist()`；`lsSet` 静默吞异常 | 缺 |
| 多标签互相覆盖 | 单键 `supersu.pwa.draft`，无 `storage` 监听 | 已埋雷 |
| schema 不兼容 | 无版本字段、无迁移、无类型校验 | 已埋雷 |
| 删缓存误删用户数据 | 目前无用户上传物；将来做本地配图必须用独立 `supersu-user-` 前缀且永不删 | 预防 |

**推荐：IndexedDB 主存 + localStorage 同步镜像**
- IDB：`drafts`（id/text/themeId/ts/v）+ `revisions`（最近 20 版）。
- LS：只存最新一版镜像（≤50KB），作为"最后一毫秒"唯一可靠的同步写通道。
- 写入时机：`input` 500ms 防抖 → `blur` 立即 → `visibilitychange(hidden)` 同步写 LS → `pagehide` 兜底 → 点「立即更新」前 `await flush()`。

## 七、改造清单（按收益排序）

| # | 改什么 | 文件 | 预期收益 |
|---|---|---|---|
| 1 | CDN 缓存去掉 `VERSION`，固定 `supersu-runtime-v1`，activate 迁移旧条目 | `sw.js:22,165` | **省 11MB/次** |
| 2 | 构建生成 `themes/manifest.json`（sha256），SW 只拉变化项 | `build.mjs` + `sw.js:97-123` | **省 1.4MB + 164 请求** |
| 3 | `DATA`/缩略图缓存稳定化，activate 只删旧 `shell` | `sw.js:21,160-178` | 活跃用户最多 2.8MB |
| 4 | 预缓存 `cache:'reload'` → `'no-cache'`；`version.json`/`changelog.json` 放行 | `sw.js:62-156,193` | shell 0.38MB → 304 几百字节 |
| 5 | 构建注入 `VERSION`（版本号 + git hash 替换进 sw.js） | `build.mjs` + `sw.js:18` | 修「改 JS 检测不到更新」 |
| 6 | `applyUpdate` 前 `await flushDraft()`；`input` 防抖独立落盘 | `update.js:185` + `app.js:413` | 修「更新丢最后一句话」 |
| 7 | `restoreDraft()` 移出 `engine.boot()` 的 try | `app.js:82-86` | 修「引擎失败看不到草稿」 |
| 8 | `hadController` 守卫 + 可见时 5 分钟节流 | `update.js:114-156` | 修「首次安装多刷一次」 |
| 9 | 删除 `./src/cover.js` 预缓存；CRITICAL 资源失败让 install 失败 | `sw.js:42,66-87` | 消除固定 404 + 白屏风险 |
| 10 | 生成 `dist/_headers`（带 hash 的静态资源长缓存，HTML/SW no-cache） | `build.mjs` | 减少回源 RTT |

**分阶段建议**
- **第一阶段（半天，收益最大）**：#1 + #3 + #4 + #9 —— 单次更新从 13.2MB 降到约 0.4MB。
- **第二阶段（1 天）**：#2 + #5 + #10 —— 降到约 20KB～200KB，且更新能真正被检测到。
- **第三阶段（按需）**：#6 + #7 + #8 + 草稿 IDB 化 —— 解决"不丢数据"与体验。

## 八、验收标准（怎么证明真的增量了）

1. 部署 v3 后，在 DevTools → Application → Cache Storage 看：`supersu-runtime-v1` 里的 Pyodide 5 个条目**仍在**。
2. Network 面板过滤 `themes/`：第二次 install 只应有**变化的** JSON 请求（预期 0～2 个），不是 165 个。
3. 只改一行 JS 发布，Network 总传输量 < 200KB（含 sw.js 本身）。
4. 更新前在编辑器输入文字但不等待渲染，点「立即更新」→ reload 后文字仍在。
5. 断网后刷新：仍能排版（回归 `scripts/pwa_offline_test.py` 8/8）。

## 九、参考来源

- [Workbox precaching](https://developer.chrome.com/docs/workbox/modules/workbox-precaching) ｜ [Handling SW updates](https://developer.chrome.com/docs/workbox/handling-service-worker-updates)
- [MDN Request.cache](https://developer.mozilla.org/en-US/docs/Web/API/Request/cache) ｜ [Service Worker lifecycle](https://web.dev/articles/service-worker-lifecycle) ｜ [skipWaiting](https://developer.mozilla.org/en-US/docs/Web/API/ServiceWorkerGlobalScope/skipWaiting) ｜ [Clients.claim](https://developer.mozilla.org/en-US/docs/Web/API/Clients/claim)
- [Cloudflare Pages Serving](https://developers.cloudflare.com/pages/configuration/serving-pages/) ｜ [Pages Headers](https://developers.cloudflare.com/pages/configuration/headers/)
- [CacheStorage](https://developer.mozilla.org/zh-CN/docs/Web/API/CacheStorage) ｜ [Storage quotas & eviction](https://developer.mozilla.org/zh-CN/docs/Web/API/Storage_API/Storage_quotas_and_eviction_criteria) ｜ [BroadcastChannel](https://developer.mozilla.org/en-US/docs/Web/API/BroadcastChannel)
