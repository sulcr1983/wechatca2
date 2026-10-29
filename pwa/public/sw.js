/*
 * SuperSu Service Worker（原生手写，无 Workbox）
 *
 * ── 缓存分层（2026-10-18 增量更新改造）─────────────────────────
 *   SHELL   supersu-shell-<BUILD_ID>  版本化：index.html / src/* / manifest / icons / fonts
 *   DATA    supersu-data-v1           稳定：themes/*.json + py/*，缓存键带 ?h=<sha256>
 *   RUNTIME supersu-runtime-v1        稳定：Pyodide 等 CDN 运行时（URL 自带版本号）
 *   MEDIA   supersu-media-v1          稳定：theme-thumbs（按需，不预缓存）
 *
 * 为什么要分层：原来一个 VERSION 同时命名三层缓存，activate 把 cdn 缓存整锅删掉，
 * 于是「改一行 JS」用户也要重下 11MB Pyodide + 1.4MB 主题。分层后只有 shell 换名字，
 * 稳定缓存跨版本保留。BUILD_ID 由 build.mjs 按 shell 文件内容哈希注入。
 *
 * ── 增量怎么来的 ───────────────────────────────────────────────
 * build.mjs 生成 themes/manifest.json（每个数据文件的 sha256）。install 时先看
 * cache.match('<url>?h=<hash>')：命中说明内容没变 → 0 请求；没命中才发网络。
 * 预缓存用 cache:'no-cache'（不是 reload）：浏览器带 If-None-Match，CF Pages 对
 * 未变文件返回 304，body 为 0 字节。
 *
 * ── 其他策略 ──────────────────────────────────────────────────
 *   • 导航请求 → NetworkFirst（3.5s 超时），失败回退 index.html，再失败回退内联离线页
 *   • version.json / changelog.json → 完全放行（更新检测必须读到网络真值）
 *   • 其他同源 GET → StaleWhileRevalidate（写 SHELL 缓存）
 *   • 不自动 skipWaiting：由页面在空闲 / 检测到更新 30s 后自动发 SKIP_WAITING（静默更新）
 *   • critical shell 缺失 → install 直接失败（旧 SW 继续服务，避免装半套白屏）
 */

const BUILD_ID = '__BUILD_ID__';

const SHELL_CACHE = 'supersu-shell-' + BUILD_ID;
// 稳定缓存统一 store- 前缀：旧版本已经用过 supersu-data-v1 / supersu-data-v2 / supersu-cdn-v2，
// 沿用同名会让 activate 的 keep 判断短路，导致旧缓存迁移/清理逻辑永远不执行。
const DATA_CACHE = 'supersu-store-data-v1';
const ASSETS_CACHE = 'supersu-store-assets-v1';
const RUNTIME_CACHE = 'supersu-store-runtime-v1';
const MEDIA_CACHE = 'supersu-store-media-v1';
const CACHE_PREFIX = 'supersu-';

// 数据清单：build.mjs 在构建时把这一行替换成真实 JSON（path → sha256）。
// 内联而不是运行时 fetch：SW 被浏览器回收后离线重启时，manifest 请求必然失败，
// 一旦拿不到清单，所有 /themes、/py 都会退回普通键 → 与缓存里的 ?h= 键不匹配 → 离线全废。
let DATA_MANIFEST = {};
/*__DATA_MANIFEST__*/

// 静态资产清单（2026-10-29 增量补齐）：图标 / 品牌 / 示例图 / 封面模板 / vendor / 字体。
// 这些文件**不随版本变**，放进稳定缓存 + 内容哈希键，跨版本零下载。
// 以前它们躺在版本化的 SHELL 缓存里 → 改一行 JS 也要把这 1MB 重下一遍。
let ASSETS_MANIFEST = {};
/*__ASSETS_MANIFEST__*/

// 导航请求等待网络的上限，超时就直接走缓存，避免弱网白屏
const NAV_TIMEOUT = 3500;

// critical：缺一个就不该接管页面（否则新 SW + 旧资源 = 白屏）
const SHELL_CRITICAL = [
  './index.html',
  './src/app.js',
  './src/style.css',
  './src/bridge.js',
  './src/engine.worker.js',
  './src/update/index.js',
];

// optional：缺失只记日志，不影响安装（图标/字体/更新记录都能降级）
// ⚠️ 2026-10-29：只放「随版本变」的代码与样式。
//    图标 / 品牌 / 示例图 / 封面模板 / vendor / 字体 全部移到 ASSETS_MANIFEST（见下），
//    否则每次发版都要把这 1MB 重下一遍 —— 那正是「增量只做了一半」的根因。
const SHELL_OPTIONAL = [
  './manifest.webmanifest',
  './src/ai.js',
  './src/export.js',
  './src/images.js',
  './src/light.js',
  './src/update/ui.js',
  './src/update/changelog.js',
  './src/update/update.css',
  './fonts/fonts.css',
  './fonts/cover-fonts.css',
  // 封面页模块（代码，随版本变）
  './src/cover/index.js',
  './src/cover/catalog.js',
  './src/cover/templates.js',
  './src/cover/render.js',
  './src/cover/search.js',
  './src/cover/cover.css',
  // 九宫格切图（B2 #7）：模块，首次点击才 import
  './src/nine.js',
];

// 数据类资源：体积大、变动少，按需 + install 时按 manifest 增量预取
const DATA_PATH_RE = /\/(themes|py)\//;
// 跨域运行时（旧方案兜底：若还从 jsdelivr 取）
const CDN_HOST_RE = /(^|\.)jsdelivr\.net$/;
// 同源自托管的 Pyodide 运行时（路径固定、内容不可变）
const RUNTIME_PATH_RE = /^\/runtime\//;

/* ── install：预缓存 shell + 静态资产 + 数据（全部增量） ─────── */

// 下载统计：上报给页面，状态条显示的是**真实**文件数与字节，不伪造进度
const progress = { done: 0, total: 0, fetched: 0, bytes: 0, t0: 0 };
let lastReportAt = 0;

self.addEventListener('install', (event) => {
  event.waitUntil(precacheAll());
});

/** 广播进度（120ms 节流；结束那次强制发） */
function report(force) {
  const now = Date.now();
  if (!force && now - lastReportAt < 120) return;
  lastReportAt = now;
  const payload = {
    type: 'PRECACHE_PROGRESS',
    done: progress.done,
    total: progress.total,
    fetched: progress.fetched,
    bytes: progress.bytes,
    ms: now - progress.t0,
    finished: Boolean(force),
  };
  self.clients.matchAll({ includeUncontrolled: true, type: 'window' })
    .then((list) => {
      for (const client of list) {
        try { client.postMessage(payload); } catch (err) { /* 客户端已关 */ }
      }
    })
    .catch(() => { /* 无法广播不影响安装 */ });
}

async function precacheAll() {
  progress.t0 = Date.now();
  progress.done = 0;
  progress.fetched = 0;
  progress.bytes = 0;
  progress.total = SHELL_CRITICAL.length
    + SHELL_OPTIONAL.length
    + Object.keys(getAssetManifest()).length;

  // 老用户：先把旧 shell 缓存里的静态资产按新哈希键搬进稳定缓存，
  // 否则「第一次升级」反而要重下 1MB —— 迁移比重新下载便宜得多。
  await migrateShellAssets();

  const cache = await caches.open(SHELL_CACHE);

  // critical 串行：第一条失败就 throw，让整个 install 失败（旧 SW 继续服务）
  for (const url of SHELL_CRITICAL) {
    await addToCache(cache, url, true);
  }
  // optional 并行：单条失败忽略
  await Promise.all(SHELL_OPTIONAL.map((url) => addToCache(cache, url, false)));

  // 静态资产（图标/品牌/示例/封面模板/vendor/字体）：按 sha256 清单，命中就 0 请求
  await precacheAssets();
  await pruneAssets();

  // 主题 + py 引擎：按 sha256 manifest 只取变化的
  await precacheData();
  // 清掉上一版残留的 ?h= 键（否则每改一次主题就多留一份）
  await pruneDataCache();

  report(true);
}

async function addToCache(cache, url, required) {
  try {
    // no-cache：允许浏览器带 If-None-Match，未变时服务器回 304（0 字节 body）
    const res = await fetch(new Request(url, { cache: 'no-cache' }));
    if (!res || !res.ok) throw new Error('HTTP ' + (res && res.status));
    // 重建一个「没有重定向标记」的响应再入库：
    // CF Pages 会把 /index.html 308 跳到 /，直接缓存这个响应，之后拿它回导航请求
    // 会被浏览器判成 ERR_FAILED（导航不能吃带 redirect 标记的响应）。
    const body = await res.arrayBuffer();
    await cache.put(url, new Response(body, {
      status: res.status,
      statusText: res.statusText,
      headers: res.headers,
    }));
    progress.fetched += 1;
    progress.bytes += body.byteLength;
  } catch (err) {
    if (required) throw err;
  } finally {
    progress.done += 1;
    report(false);
  }
}

/* ── 静态资产：稳定缓存 + 内容哈希键（跨版本零下载） ────────── */

function getAssetManifest() {
  return ASSETS_MANIFEST && typeof ASSETS_MANIFEST === 'object' ? ASSETS_MANIFEST : {};
}

/** 资产路径 → 带哈希的缓存键（清单里没有就返回 null） */
function assetKey(path) {
  const hash = getAssetManifest()[path];
  return hash ? './' + path + '?h=' + hash : null;
}

async function precacheAssets() {
  const entries = Object.entries(getAssetManifest());
  if (!entries.length) return;
  const cache = await caches.open(ASSETS_CACHE);

  // 每批 16 个，避免同时打出上百条请求把弱网打满
  for (let i = 0; i < entries.length; i += 16) {
    const batch = entries.slice(i, i + 16);
    await Promise.all(batch.map(async ([path, hash]) => {
      const key = './' + path + '?h=' + hash;
      try {
        // 命中说明内容没变 → 一个字节都不用下（这就是跨版本增量的来源）
        if (await cache.match(key)) return;
        const res = await fetch(new Request(key, { cache: 'no-cache' }));
        if (res && res.ok) {
          const body = await res.arrayBuffer();
          await cache.put(key, new Response(body, {
            status: res.status,
            statusText: res.statusText,
            headers: res.headers,
          }));
          progress.fetched += 1;
          progress.bytes += body.byteLength;
        }
      } catch (err) {
        /* 单条失败忽略：运行时还会再试 */
      } finally {
        progress.done += 1;
        report(false);
      }
    }));
  }
}

/** 清掉不再被清单引用的资产键（改名/删除的文件） */
async function pruneAssets() {
  try {
    if (!Object.keys(getAssetManifest()).length) return;
    const allow = new Set();
    for (const [path, hash] of Object.entries(getAssetManifest())) {
      allow.add(new URL('./' + path + '?h=' + hash, self.registration.scope).href);
    }
    const cache = await caches.open(ASSETS_CACHE);
    const keys = await cache.keys();
    await Promise.all(keys.map((req) => (allow.has(req.url) ? null : cache.delete(req))));
  } catch (err) {
    /* 清理失败不影响功能 */
  }
}

/** 老版本把资产放在版本化 shell 缓存里：搬进稳定缓存，避免第一次升级重下 1MB */
async function migrateShellAssets() {
  const entries = Object.entries(getAssetManifest());
  if (!entries.length) return;
  try {
    const names = (await caches.keys())
      .filter((k) => k.startsWith('supersu-shell-') && k !== SHELL_CACHE);
    if (!names.length) return;
    const to = await caches.open(ASSETS_CACHE);
    for (const name of names) {
      const from = await caches.open(name);
      for (const [path, hash] of entries) {
        const key = './' + path + '?h=' + hash;
        try {
          if (await to.match(key)) continue;
          const hit = await from.match('./' + path);
          if (hit) await to.put(key, hit);
        } catch (err) {
          /* 单条迁移失败不影响其他 */
        }
      }
    }
  } catch (err) {
    /* 迁移整体失败也不阻塞安装 */
  }
}

/* ── 增量数据：manifest（构建期内联，不依赖网络） ───────────── */

/** 当前构建的数据清单；没有注入时返回空对象（退化为普通缓存键） */
function getManifest() {
  return DATA_MANIFEST && typeof DATA_MANIFEST === 'object' ? DATA_MANIFEST : {};
}

/** 把绝对 URL 映射成带内容哈希的缓存键（清单里没有就退回原 URL） */
function hashedKey(url) {
  const path = url.pathname.replace(/^\//, '');
  const hash = getManifest()[path];
  return hash ? url.origin + url.pathname + '?h=' + hash : url.href;
}

/** 允许留在 DATA 缓存里的键：当前清单的 ?h= 版本 + manifest.json 本身 */
function dataCacheAllowList() {
  const allow = new Set();
  for (const [path, hash] of Object.entries(getManifest())) {
    allow.add(new URL('./' + path + '?h=' + hash, self.registration.scope).href);
  }
  allow.add(new URL('./themes/manifest.json', self.registration.scope).href);
  return allow;
}

/** 清掉旧版本残留的 ?h= 键（否则主题每改一次就留一份，缓存无限涨） */
async function pruneDataCache() {
  try {
    if (!Object.keys(getManifest()).length) return;   // 没清单就别乱删
    const allow = dataCacheAllowList();
    const cache = await caches.open(DATA_CACHE);
    const keys = await cache.keys();
    await Promise.all(keys.map((req) => (allow.has(req.url) ? null : cache.delete(req))));
  } catch (err) {
    /* 清理失败不影响功能 */
  }
}

async function precacheData() {
  const cache = await caches.open(DATA_CACHE);
  const manifest = getManifest();
  const entries = Object.entries(manifest);
  if (!entries.length) return;

  // 每批 16 个，避免同时打出上百条请求把弱网打满
  for (let i = 0; i < entries.length; i += 16) {
    const batch = entries.slice(i, i + 16);
    await Promise.all(batch.map(async ([path, hash]) => {
      const key = './' + path + '?h=' + hash;
      try {
        // 关键：key 命中说明这个文件内容没变 → 一个字节都不用下
        if (await cache.match(key)) return;
        const res = await fetch(new Request(key, { cache: 'no-cache' }));
        if (res && res.ok) await cache.put(key, res);
      } catch (err) {
        /* 单条失败忽略：运行时还会再试 */
      }
    }));
  }
}

/* ── activate：只换 shell，迁移并清理旧缓存 ─────────────────── */

self.addEventListener('activate', (event) => {
  event.waitUntil(
    (async () => {
      const keep = new Set([SHELL_CACHE, DATA_CACHE, ASSETS_CACHE, RUNTIME_CACHE, MEDIA_CACHE]);
      const keys = await caches.keys();
      await Promise.all(
        keys.map(async (key) => {
          if (!key.startsWith(CACHE_PREFIX) || keep.has(key)) return null;
          // 旧 CDN 缓存（supersu-cdn-vN）→ 先把条目搬进 RUNTIME，再删，避免老用户重下 11MB
          if (key.startsWith('supersu-cdn-')) {
            await migrateCache(key, RUNTIME_CACHE);
            return caches.delete(key);
          }
          // 旧 data 缓存 → 主题/py 搬进 DATA（按新 manifest 换成带哈希的键）
          if (key.startsWith('supersu-data-')) {
            await migrateCache(key, DATA_CACHE);
            return caches.delete(key);
          }
          // 其余（旧 shell / 过期版本）直接删
          return caches.delete(key);
        })
      );
      await self.clients.claim();
    })()
  );
});

/** 把 fromName 里的条目搬进 toName（已存在的不覆盖）；data 目标会换成哈希键 */
async function migrateCache(fromName, toName) {
  try {
    const from = await caches.open(fromName);
    const to = await caches.open(toName);
    const requests = await from.keys();
    for (const req of requests) {
      try {
        const hit = await from.match(req);
        if (!hit) continue;
        let target = req.url;
        if (toName === DATA_CACHE) {
          const path = new URL(req.url).pathname.replace(/^\//, '');
          const hash = getManifest()[path];
          // 没有哈希说明这份旧数据不在当前清单里：不迁移（迁过去也永远不会被命中）
          if (!hash) continue;
          target = req.url + '?h=' + hash;
        }
        if (await to.match(target)) continue;
        await to.put(target, hit);
      } catch (err) {
        /* 单条迁移失败不影响其他 */
      }
    }
  } catch (err) {
    /* 迁移整体失败也不阻塞 activate */
  }
}

/* ── message：由页面主动触发的更新接管 ──────────────────────── */

self.addEventListener('message', (event) => {
  const data = event.data;
  if (data && data.type === 'SKIP_WAITING') {
    self.skipWaiting();
  }
});

/* ── fetch：按资源类型分流 ─────────────────────────────────── */

self.addEventListener('fetch', (event) => {
  const request = event.request;

  if (request.method !== 'GET') return;
  if (request.headers.has('range')) return;

  let url;
  try {
    url = new URL(request.url);
  } catch (err) {
    return;
  }

  if (url.protocol !== 'http:' && url.protocol !== 'https:') return;

  const sameOrigin = url.origin === self.location.origin;

  // 1) 页面导航：NetworkFirst
  if (request.mode === 'navigate') {
    event.respondWith(handleNavigate(event));
    return;
  }

  // 2) version.json：完全放行给浏览器（更新检测必须读到网络真值，
  //    否则会被 StaleWhileRevalidate 缓存住，永远显示旧版本）
  if (sameOrigin && /\/version\.json$/.test(url.pathname)) return;

  // 2.5) changelog.json：网络优先、离线回退缓存。
  //    不放行是为了离线也能翻更新记录；不做预缓存是为了别每次发版都重下 73KB。
  if (sameOrigin && /\/changelog\.json$/.test(url.pathname)) {
    event.respondWith(networkFirstCache(request, DATA_CACHE));
    return;
  }

  // 3) 同源 Pyodide 运行时：CacheFirst（稳定缓存，跨版本保留、一次下载永久命中）
  if (sameOrigin && RUNTIME_PATH_RE.test(url.pathname)) {
    event.respondWith(
      cacheFirst(request, RUNTIME_CACHE, false).catch(() => Response.error())
    );
    return;
  }

  // 4) 跨域 CDN 运行时（兜底）：CacheFirst（稳定缓存，跨版本保留）
  if (!sameOrigin && CDN_HOST_RE.test(url.hostname)) {
    event.respondWith(
      cacheFirst(request, RUNTIME_CACHE, true).catch(() => Response.error())
    );
    return;
  }

  // 5) 缩略图：稳定缓存 + SWR（主题重生成同名图时能自动更新，不会永久脏读）
  //    注意：/samples/（封面空态示例）不在此规则内——它们随 shell 版本化预缓存，
  //    由下方 SHELL_CACHE 兜底命中；若放这里只会查 MEDIA_CACHE（空）反而挡掉预缓存副本
  if (sameOrigin && /\/theme-thumbs\//.test(url.pathname)) {
    event.respondWith(staleWhileRevalidate(request, MEDIA_CACHE));
    return;
  }

  // 4.5) 静态资产（图标/品牌/示例图/封面模板/vendor/字体）：
  //      稳定缓存 + 内容哈希键，跨版本 0 请求 —— 这是「改一行 JS 不用重下 1MB」的关键
  if (sameOrigin && assetKey(url.pathname.replace(/^\//, ''))) {
    event.respondWith(assetFirst(request, url));
    return;
  }

  // 5) 主题 JSON / py 引擎：按清单哈希键 CacheFirst（增量核心）
  //    清单文件本身放行（它只是构建产物，不该被当成数据缓存）
  if (sameOrigin && DATA_PATH_RE.test(url.pathname)) {
    if (/\/themes\/manifest\.json$/.test(url.pathname)) return;
    event.respondWith(dataFirst(request, url));
    return;
  }

  // 6) 其他同源 GET：StaleWhileRevalidate
  if (sameOrigin) {
    event.respondWith(staleWhileRevalidate(request, SHELL_CACHE));
  }
});

/** 静态资产：按内容哈希键取（命中即返，未命中才联网并写入） */
async function assetFirst(request, url) {
  const key = assetKey(url.pathname.replace(/^\//, ''));
  if (!key) return fetch(request);
  return cacheFirstByKey(request, new URL(key, self.registration.scope).href, ASSETS_CACHE);
}

/**
 * 网络优先、离线回退缓存（给 changelog.json 用）：
 * 在线永远读网络真值，断网时还能翻更新记录。
 */
async function networkFirstCache(request, cacheName) {
  const cache = await caches.open(cacheName);
  try {
    const res = await fetch(new Request(request, { cache: 'no-cache' }));
    if (res && res.ok) {
      cache.put(request, res.clone()).catch(() => {});
      return res;
    }
    const cached = await cache.match(request);
    return cached || res;
  } catch (err) {
    const cached = await cache.match(request);
    if (cached) return cached;
    return new Response('', { status: 504, statusText: 'Offline' });
  }
}

/** 数据资源：哈希键命中即返，未命中走网络并按哈希键写入 */
async function dataFirst(request, url) {
  let key = request.url;
  try {
    key = await hashedKey(url);
  } catch (err) {
    /* manifest 不可用 → 退回普通键 */
  }
  return cacheFirstByKey(request, key, DATA_CACHE);
}

/**
 * 导航：CacheFirst。
 * 为什么不用 NetworkFirst：资源没有内容哈希，新 HTML 配旧 JS 会出现「半新半旧」
 * （新 DOM + 旧 src/app.js → null.addEventListener 报错）。shell 是原子安装的，
 * 缓存里的 index.html 与 src/* 永远同一版本；换新版本走「更新提示 → skipWaiting → reload」。
 */
async function handleNavigate(event) {
  const request = event.request;
  const cache = await caches.open(SHELL_CACHE);

  const cached = await cache.match('./index.html');
  if (cached) return cached;

  try {
    const res = await withTimeout(fetch(request), NAV_TIMEOUT);
    if (res && res.ok) {
      // fire-and-forget：已过事件派发期，写失败不影响本次响应
      cache.put('./index.html', res.clone()).catch(() => {});
    }
    return res;
  } catch (err) {
    return offlineFallback();
  }
}

/**
 * CacheFirst（按请求 URL）：命中即返回，未命中才请求网络并写缓存。
 * allowOpaque 为 true 时，跨域 no-cors 的 opaque 响应也写入缓存。
 */
async function cacheFirst(request, cacheName, allowOpaque) {
  return cacheFirstByKey(request, request.url, cacheName, allowOpaque);
}

/** CacheFirst（指定缓存键，用于 ?h=<sha256> 增量键） */
async function cacheFirstByKey(request, key, cacheName, allowOpaque) {
  const cache = await caches.open(cacheName);
  const hit = await cache.match(key);
  if (hit) return hit;

  const res = await fetch(request);
  const cacheable = res && (res.ok || (allowOpaque && res.type === 'opaque'));
  if (cacheable) {
    try {
      await cache.put(key, res.clone());
    } catch (err) {
      /* 配额满等，不影响本次响应 */
    }
  }
  return res;
}

/**
 * StaleWhileRevalidate：先给缓存（有的话），同时后台拉新并更新缓存；
 * 没有缓存时等网络，网络也失败就返回 504。
 */
async function staleWhileRevalidate(request, cacheName) {
  const cache = await caches.open(cacheName);

  const cached = await cache.match(request);

  const network = fetch(request)
    .then((res) => {
      if (res && res.ok) {
        cache.put(request, res.clone()).catch(() => {});
      }
      return res;
    })
    .catch(() => null);

  if (cached) return cached;

  const res = await network;
  if (res) return res;
  return new Response('', { status: 504, statusText: 'Offline' });
}

/** 给 promise 套一个超时；超时按失败处理，走缓存分支 */
function withTimeout(promise, ms) {
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error('timeout')), ms);
    promise.then(
      (value) => {
        clearTimeout(timer);
        resolve(value);
      },
      (err) => {
        clearTimeout(timer);
        reject(err);
      }
    );
  });
}

/** 首次访问就断网时的兜底页：不依赖任何外部资源 */
function offlineFallback() {
  const html =
    '<!DOCTYPE html><html lang="zh-CN"><head><meta charset="UTF-8">' +
    '<meta name="viewport" content="width=device-width, initial-scale=1">' +
    '<title>SuperSu · 离线</title></head>' +
    '<body style="margin:0;min-height:100vh;display:flex;align-items:center;justify-content:center;' +
    'background:#F7F4EE;color:#2B2B2B;font:16px/1.7 -apple-system,BlinkMacSystemFont,\'PingFang SC\',\'Microsoft YaHei\',sans-serif">' +
    '<div style="max-width:22em;padding:32px;text-align:center">' +
    '<h1 style="font-size:20px;margin:0 0 12px">暂时连不上网</h1>' +
    '<p style="margin:0 0 8px;color:#6B6B6B">首次使用需要联网加载一次排版引擎，之后就能离线用了。</p>' +
    '<p style="margin:0;color:#6B6B6B">请检查网络后重新打开页面。</p>' +
    '</div></body></html>';
  return new Response(html, {
    status: 200,
    headers: { 'Content-Type': 'text/html; charset=utf-8' },
  });
}
