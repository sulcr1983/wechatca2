# 更新体验重构方案（落地清单）

> 日期：2026-10-29　状态：**待拍板，未开工**
> 可视化方案（含可点原型）：**`output/update-redesign/index.html`** —— 以那份为准，本文只给可执行的改动切分。
> 上游依据：`pwa/src/update/*` · `pwa/public/sw.js` · `pwa/scripts/build.mjs` · `pwa/scripts/gen_changelog.py` ·
> `docs/pwa-incremental-update-research.md`（2026-10-18 调研，结论仍有效） · `docs/update-handoff.md` · `docs/runbook.md §7`
> 版本 / 构建号 / 测试结果一律见 `STATE.md`，本文不写死。

---

## 0. 一句话

增量更新的地基已经做对（缓存分层 + sha256 清单 + 304），
本方案补的是**用户侧闭环**：能查、能点、能完成、知道更新了什么；顺手把壳子那半截增量补齐。

---

## 1. 现状核实（2026-10-29 实测，非门禁指标）

| 项 | 实测值 | 来源 |
|---|---|---|
| dist 总量 | 22MB（runtime 12MB / fonts 3.8MB / themes 1.7MB） | `du -sh pwa/dist` |
| 改一行 JS 后实际需重下 | 约 1.29MB / 59 请求 | shell 清单累加（见下） |
| 其中真正变的 | 十几 KB | 同上 |
| 更新记录数据 | 73.7KB / 16 版本 / 237 条，v1.7.0 单版 29 条 | `changelog.json` |
| 主动检查更新入口 | 0 处 | 全仓 grep |

shell 每次整体换代的重下清单：`index.html` 16K + `src/` 372K + `icons/` 340K + `samples/` 156K +
`cover-templates/` 84K + `vendor/` 108K + `brand/` 56K + `fonts/*.woff2` 160K ≈ **1.29MB**。

---

## 2. 三个必须先承认的事实

1. **没有入口**：`openChangelog()` 只渲染本地 `changelog.json`，不发请求。
2. **闭环断在最后一步**：`reconcileSeenVersion()`（index.js:121）在 reload 后把**新版本**写成已读，
   用户点「已升级」→ `openChangelog()` 用新版本当 since → 本次更新条目数恒为 0。
3. **增量只到数据层**：`SHELL_CACHE` 带 `BUILD_ID`，壳内所有文件跟着换缓存名，等于全量。

---

## 3. 改动切分（A→F，每批可独立构建上线）

### A. 检查更新能力（核心新功能）

改：`src/update/index.js` · `src/update/changelog.js` · `src/update/ui.js` · `src/update/update.css`

```js
// index.js 新增
const CHECK_MIN_MS = 60 * 1000;
let lastCheck = { at: 0, result: null };

async function checkNow({ force = false } = {}) {
  if (!force && lastCheck.result && Date.now() - lastCheck.at < CHECK_MIN_MS) return lastCheck.result;
  // 并行：version.json（权威信号，304 便宜）+ reg.update()（触发下载）
  // 返回 { state: 'latest' | 'data-only' | 'update' | 'offline' | 'pending', remote, build, waiting }
}
```

- `changelog.open()` 新增 `onCheck` 回调；状态条插在 `#cl-toolbar` **之上**，高度固定 44px（避免布局跳动）。
- 浮标文案随状态：`更新记录` / `有新版本` / `✓ 已更新`。
- 「立即更新」复用现有 `applyUpdate()`（已含 flushDraft + SKIP_WAITING + 15s 超时兜底）。

**注意**：`version` 变了但 `BUILD_ID` 没变时（只改了 changelog / 主题数据），
必须是「内容已同步，无需重启」，不能说「有新版本」却没有可点的东西。

### B. 修 P0-2（升级后 0 条）

改：`src/update/index.js`

- `controllerchange` reload 前：`localStorage.setItem('supersu.pwa.prevVersion', state.running)`
- `showUpgradedIfAny()` 点击 → `openChangelog({ since: prevVersion, mode: 'update' })`，读完即清。
- `openChangelog()` 里的 `remember(state.running)` 改为：仅在 browse 且停留 ≥2s 或滚到底时记已读。

### C. 进度与结果可见

改：`public/sw.js` · `src/update/index.js`

```js
// sw.js：install 期间统计，100ms 节流广播
async function report(progress) {
  const clients = await self.clients.matchAll({ includeUncontrolled: true });
  for (const c of clients) c.postMessage({ type: 'PRECACHE_PROGRESS', ...progress });
}
```

- 完成后写 `supersu.pwa.lastUpdate = { from, to, files, bytes, ms, ok }`（保留最近 5 次）。
- 状态条显示真实文件数与字节，不伪造进度。
- 更新记录页脚加「更新诊断」：最近 5 次 + `?reset-sw` 自救入口。

### D. 壳子也增量（收益最大、零 UI 风险）

改：`public/sw.js` · `scripts/build.mjs`

- 新增 `ASSETS_CACHE = 'supersu-store-assets-v1'`；
  把 `icons/ samples/ cover-templates/ brand/ vendor/ fonts/*.woff2` 移出 `SHELL_OPTIONAL`，
  纳入 `themes/manifest.json` 同款清单（`?h=` 键）。
- `SHELL_CRITICAL` 保留 6 个；`SHELL_OPTIONAL` 只留会随版本变的 `index.html` 依赖。
- 同步改 `build.mjs` 的 `SHELL_FILES`（它决定 `BUILD_ID`），否则「只换图标」不会触发更新。
- 目标：单次更新 1.29MB/59 请求 → **约 45KB/12 请求**。

**风险点**：`pruneDataCache()` 的允许列表要覆盖新缓存；旧用户首次升级需迁移（沿用现有 `migrateCache` 思路）。

### E. 更新记录说人话

改：`scripts/gen_changelog.py` · `pwa/scripts/changelog_milestones.json` · `src/update/changelog.js`

```json
{ "version": "1.8.0", "date": "2026-10-30", "until": "2026-10-30T12:00:00",
  "title": "更新记录里能直接更新了",
  "highlights": ["打开更新记录就会自动检查新版本", "只下载变化的文件，更新快十倍", "升级后能看到这次改了什么"] }
```

- 生成器：`highlights` 直出 `userItems`；`test/chore/docs` 归入 `devItems`（默认折叠）。
- 面板：每版默认显示 3 条亮点 +「全部 N 条」展开；开发者细节折叠区含 hash / scope。
- 顺带修：移动端打开面板**不自动聚焦搜索框**（现在会弹输入法挡内容）。

### F. 测试固化

新增 `scripts/pwa_update_panel_test.py`（有头，进 `run_gates.py` 本地层）：

1. 打开面板 → 300ms 内出现「正在检查更新」，2s 内出结论；
2. 三态切换（最新 / 有新版本 / 离线）文案正确；
3. 点「立即更新」→ 页面重载、草稿仍在、`prevVersion` 生效 →
   再次打开面板显示「本次更新 N 条」，N > 0；
4. 控制台零报错。

---

## 4. 验收（可当场跑）

```bash
node pwa/scripts/build.mjs                # 断言含 sw.js/manifest 前置条件
python scripts/run_gates.py --quick
python scripts/pwa_update_panel_test.py  # 新增
python scripts/pwa_incremental_test.py --phase 1   # 改动前取基线
python scripts/pwa_incremental_test.py --phase 2   # 发布后对比
```

单条硬指标：只改一行 `app.js` 发版，DevTools Network 总传输 **< 80KB**（D 批次后 **< 20KB**），
请求数 **< 15**，且 `supersu-store-runtime-v1` 里 Pyodide 条目仍在。

---

## 5. 明确不做

| 方案 | 为什么不做 |
|---|---|
| 字节级 delta（bsdiff / 共享字典） | 2026-10-18 调研已否：收益被 Brotli 吃掉，需 WASM 且非生产可用 |
| `changelog.json` 分片 | 16 版 / 73.7KB / gzip 后约 15KB，拆分的复杂度换不来体感 |
| 更新包大小预估 | 需额外请求或维护尺寸表，误差大；改为「下载时真实进度 + 完成后实际字节」 |
| 灰度 / A-B 发布 | 个人工具；CF Pages preview + `?reset-sw` 够用 |

---

## 6. 待拍板（影响手感，定了再开工）

1. **更新完要不要自己重启**：A 后台下载 + 前台提示「点一下重启」，仅隐藏/空闲 ≥10 分钟才静默（推荐）；
   B 保持现在 30s 必刷。
2. **更新记录默认给谁看**：A 用户向 3 条亮点 + 折叠细节（推荐）；B 全量 git log。
3. **入口**：A 浮标 + 「⋯」菜单双入口（推荐）；B 顶栏常驻版本按钮。
