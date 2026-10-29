/*
 * SuperSu Service Worker（原生手写，无 Workbox）
 *
 * ── 缓存分层（2026-10-18 分层，2026-10-29 补齐三类增量）────────
 *   SHELL   supersu-store-shell-v1    稳定：index.html / src/** / manifest / fonts/*.css
 *           ↑ 键带 ?h=<sha256>：**只有内容变了的文件才重新下载**
 *   ASSETS  supersu-store-assets-v1   稳定：图标 / 品牌 / 示例图 / 封面模板 / vendor / woff2
 *   DATA    supersu-store-data-v1     稳定：themes/*.json + py/*（同样带 ?h= 键）
 *   RUNTIME supersu-runtime-v1        稳定：Pyodide 等运行时（URL 自带版本号）
 *   MEDIA   supersu-store-media-v1    稳定：theme-thumbs（按需，不预缓存）
 *
 * 为什么不再「按版本名整体换缓存」：那样改一行 JS 也要把整包重下（实测 1.29MB / 59 请求）。
 * 现在缓存名固定、键带内容哈希，install 时逐文件 cache.match：
 *   命中 → 0 请求；未命中 → 只下这一个。改一行 app.js 实际只下 app.js + sw.js 本身。
 *
 * ── 原子性怎么保证 ─────────────────────────────────────────────
 * 每份 sw.js 内联了自己那一版的完整清单（SHELL/ASSETS/DATA）。新 SW 在 install 期间
 * 把新键写进缓存，但**旧 SW 仍在服务旧键**；直到 activate + clients.claim 后才切换。
 * 页面侧在 controllerchange 时 reload（见 src/update/index.js），避免半新半旧。
 * activate 会清掉不属于当前清单的旧键 —— 所以新 SW 激活后必须尽快 reload。
 *
 * ── 其他策略 ──────────────────────────────────────────────────
 *   • 导航请求 → CacheFirst（清单里的 index.html 哈希键），无缓存时走网络再兜底离线页
 *   • version.json → 完全放行（更新检测必须读到网络真值）
 *   • changelog.json → 网络优先、离线回退缓存（不预缓存，省每次发版的 73KB）
 *   • 其他同源 GET → StaleWhileRevalidate
 *   • 不自动 skipWaiting：由页面在合适的时机发 SKIP_WAITING（见更新策略）
 *   • critical shell 缺失 → install 直接失败（旧 SW 继续服务，避免装半套白屏）
 *   • install 期间向页面广播真实下载进度（文件数 / 字节）
 */

const BUILD_ID = '__BUILD_ID__';

// 缓存名固定：增量靠 ?h= 键，而不是靠换缓存名
const SHELL_CACHE = 'supersu-store-shell-v1';
const DATA_CACHE = 'supersu-store-data-v1';
const ASSETS_CACHE = 'supersu-store-assets-v1';
const RUNTIME_CACHE = 'supersu-store-runtime-v1';
const MEDIA_CACHE = 'supersu-store-media-v1';
const CACHE_PREFIX = 'supersu-';

// 清单：build.mjs 在构建时内联（path → sha256）。
// 内联而不是运行时 fetch：SW 被回收后离线重启时，manifest 请求必然失败，
// 一旦拿不到清单，所有资源都会退回普通键 → 与缓存里的 ?h= 键不匹配 → 离线全废。
let SHELL_MANIFEST = {};
/*__SHELL_MANIFEST__*/

let DATA_MANIFEST = {};
/*__DATA_MANIFEST__*/

let ASSETS_MANIFEST = {};
/*__ASSETS_MANIFEST__*/

// critical：缺一个就不该接管页面（否则新 SW + 旧资源 = 白屏）
const SHELL_CRITICAL = [
  'index.html',
  'src/app.js',
  'src/style.css',
  'src/bridge.js',
  'src/engine.worker.js',
  'src/update/index.js',
];

// 导航请求等待网络的上限，超时就直接走缓存，避免弱网白屏
const NAV_TIMEOUT = 3500;

// 数据类资源：体积大、变动少，按需 + install 时按 manifest 增量预取
const DATA_PATH_RE = /\/(themes|py)\//;
// 跨域运行时（旧方案兜底：若还从 jsdelivr 取）
const CDN_HOST_RE = /(^|\.)jsdelivr\.net$/;
// 同源自托管的 Pyodide 运行时（路径固定、内容不可变）
const RUNTIME_PATH_RE = /^\/runtime\//;

/* ── 清单工具 ─────────────────────────────────────────────── */

function getShellManifest() {
  return SHELL_MANIFEST && typeof SHELL_MANIFEST === 'object' ? SHELL_MANIFEST : {};
}

function getDataManifest() {
  return DATA_MANIFEST && typeof DATA_MANIFEST === 'object' ? DATA_MANIFEST : {};
}

function getAssetManifest() {
  return ASSETS_MANIFEST && typeof ASSETS_MANIFEST === 'object' ? ASSETS_MANIFEST : {};
}

/** 路径（不含前导 /）→ 绝对缓存键；不在清单里返回 null */
function manifestKey(manifest, path) {
  const hash = manifest[path];
  return hash ? new URL('./' + path + '?h=' + hash, self.registration.scope).href : null;
}

function shellKey(path) { return manifestKey(getShellManifest(), path); }
function assetKey(path) { return manifestKey(getAssetManifest(), path); }

/** 主题/py 的哈希键（保留原行为：按 URL 查清单） */
function hashedKey(url) {
  const path = url.pathname.replace(/^\//, '');
  const hash = getDataManifest()[path];
  return hash ? url.origin + url.pathname + '?h=' + hash : url.href;
}

/* ── install：预缓存三类资源（全部按内容哈希增量）─────────────── */

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
  progress.total = Object.keys(getShellManifest()).length
    + Object.keys(getAssetManifest()).length
    + Object.keys(getDataManifest()).length;

  await precacheShell();
  await precacheAssets();
  await pruneAssets();
  await precacheData();
  await pruneDataCache();

  report(true);
}

/** 把一条缓存到指定键（重建 Response 去掉 redirect 标记） */
async function putClean(cache, key, res) {
  const body = await res.arrayBuffer();
  await cache.put(key, new Response(body, {
    status: res.status,
    statusText: res.statusText,
    headers: res.headers,
  }));
  progress.fetched += 1;
  progress.bytes += body.byteLength;
}

/** shell：critical 串行（失败即安装失败），其余并行 */
async function precacheShell() {
  const cache = await caches.open(SHELL_CACHE);
  const entries = Object.entries(getShellManifest());

  for (const path of SHELL_CRITICAL) {
    const key = shellKey(path);
    if (!key) continue;
    try {
      if (!(await cache.match(key))) {
        const res = await fetch(new Request(key, { cache: 'no-cache' }));
        if (!res || !res.ok) throw new Error('HTTP ' + (res && res.status) + ' ' + path);
        await putClean(cache, key, res);
      }
    } finally {
      progress.done += 1;
      report(false);
    }
  }

  const rest = entries.filter(([path]) => !SHELL_CRITICAL.includes(path));
  for (let i = 0; i < rest.length; i += 16) {
    const batch = rest.slice(i, i + 16);
    await Promise.all(batch.map(async ([path]) => {
      const key = manifestKey(getShellManifest(), path);
      try {
        if (!key || await cache.match(key)) return;
        const res = await fetch(new Request(key, { cache: 'no-cache' }));
        if (res && res.ok) await putClean(cache, key, res);
      } catch (err) {
        /* 单个文件失败不阻断安装：运行时还会再试 */
      } finally {
        progress.done += 1;
        report(false);
      }
    }));
  }
}

/* ── 静态资产：稳定缓存 + 内容哈希键（跨版本零下载） ────────── */

async function precacheAssets() {
  const entries = Object.entries(getAssetManifest());
  if (!entries.length) return;
  const cache = await caches.open(ASSETS_CACHE);

  for (let i = 0; i < entries.length; i += 16) {
    const batch = entries.slice(i, i + 16);
    await Promise.all(batch.map(async ([path, hash]) => {
      const key = './' + path + '?h=' + hash;
      try {
        // 命中说明内容没变 → 一个字节都不用下（这就是跨版本增量的来源）
        if (await cache.match(key)) return;
        const res = await fetch(new Request(key, { cache: 'no-cache' }));
        if (res && res.ok) await putClean(cache, key, res);
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
    const manifest = getAssetManifest();
    if (!Object.keys(manifest).length) return;
    const allow = new Set();
    for (const [path, hash] of Object.entries(manifest)) {
      allow.add(new URL('./' + path + '?h=' + hash, self.registration.scope).href);
    }
    const cache = await caches.open(ASSETS_CACHE);
    const keys = await cache.keys();
    await Promise.all(keys.map((req) => (allow.has(req.url) ? null : cache.delete(req))));
  } catch (err) {
    /* 清理失败不影响功能 */
  }
}

/** 清掉上一版 shell 里不再被引用的键（改名/删除的文件） */
async function pruneShell() {
  try {
    const manifest = getShellManifest();
    if (!Object.keys(manifest).length) return;
    const allow = new Set();
    for (const [path, hash] of Object.entries(manifest)) {
      allow.add(new URL('./' + path + '?h=' + hash, self.registration.scope).href);
    }
    const cache = await caches.open(SHELL_CACHE);
    const keys = await cache.keys();
    await Promise.all(keys.map((req) => (allow.has(req.url) ? null : cache.delete(req))));
  } catch (err) {
    /* 清理失败不影响功能 */
  }
}

/* ── 增量数据：themes + py ─────────────────────────────────── */

/** 允许留在 DATA 缓存里的键：当前清单的 ?h= 版本 + changelog.json 副本 */
function dataCacheAllowList() {
  const allow = new Set();
  for (const [path, hash] of Object.entries(getDataManifest())) {
    allow.add(new URL('./' + path + '?h=' + hash, self.registration.scope).href);
  }
  allow.add(new URL('./themes/manifest.json', self.registration.scope).href);
  allow.add(new URL('./changelog.json', self.registration.scope).href);
  return allow;
}

/** 清掉旧版本残留的 ?h= 键（否则主题每改一次就留一份，缓存无限涨） */
async function pruneDataCache() {
  try {
    if (!Object.keys(getDataManifest()).length) return;   // 没清单就别乱删
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
  const manifest = getDataManifest();
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
        if (res && res.ok) await putClean(cache, key, res);
      } catch (err) {
        /* 单条失败忽略：运行时还会再试 */
      } finally {
        progress.done += 1;
        report(false);
      }
    }));
  }
}

/* ── activate：清旧版本化缓存、接管页面、清理过期键 ─────────── */

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
          // 旧 data 缓存 → 主题/py 搬进 DATA（按新清单换成带哈希的键）
          if (key.startsWith('supersu-data-')) {
            await migrateCache(key, DATA_CACHE);
            return caches.delete(key);
          }
          // 其余（旧 shell 版本化缓存 / 过期版本）直接删：
          // shell 旧键无法校验内容，复用反而有「旧文件当新文件」的风险，宁可重下一次
          return caches.delete(key);
        })
      );
      await self.clients.claim();
      // 清掉当前 shell 缓存里不属于本清单的键（改名/删除的文件）
      await pruneShell();
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
          const hash = getDataManifest()[path];
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
  const path = url.pathname.replace(/^\//, '');

  // 1) 页面导航：CacheFirst（当前清单里的 index.html）
  if (request.mode === 'navigate') {
    event.respondWith(handleNavigate(event));
    return;
  }

  // 2) version.json：完全放行给浏览器（更新检测必须读到网络真值）
  if (sameOrigin && /\/version\.json$/.test(url.pathname)) return;

  // 2.5) changelog.json：网络优先、离线回退缓存。
  //      不预缓存是为了别每次发版都重下 73KB；不做放行是为了离线也能翻更新记录。
  if (sameOrigin && /\/changelog\.json$/.test(url.pathname)) {
    event.respondWith(networkFirstCache(request, DATA_CACHE));
    return;
  }

  // 3) shell（代码/HTML/样式）：按清单哈希键 CacheFirst —— 改一行只下一份
  if (sameOrigin && shellKey(path)) {
    event.respondWith(cacheFirstByKey(request, shellKey(path), SHELL_CACHE));
    return;
  }

  // 4) 同源 Pyodide 运行时：CacheFirst（稳定缓存，跨版本保留、一次下载永久命中）
  if (sameOrigin && RUNTIME_PATH_RE.test(url.pathname)) {
    event.respondWith(
      cacheFirst(request, RUNTIME_CACHE, false).catch(() => Response.error())
    );
    return;
  }

  // 5) 跨域 CDN 运行时（兜底）：CacheFirst
  if (!sameOrigin && CDN_HOST_RE.test(url.hostname)) {
    event.respondWith(
      cacheFirst(request, RUNTIME_CACHE, true).catch(() => Response.error())
    );
    return;
  }

  // 6) 缩略图：稳定缓存 + SWR（主题重生成同名图时能自动更新，不会永久脏读）
  if (sameOrigin && /\/theme-thumbs\//.test(url.pathname)) {
    event.respondWith(staleWhileRevalidate(request, MEDIA_CACHE));
    return;
  }

  // 7) 静态资产（图标/品牌/示例图/封面模板/vendor/字体）：稳定缓存 + 哈希键
  if (sameOrigin && assetKey(path)) {
    event.respondWith(cacheFirstByKey(request, assetKey(path), ASSETS_CACHE));
    return;
  }

  // 8) 主题 JSON / py 引擎：按清单哈希键 CacheFirst（增量核心）
  if (sameOrigin && DATA_PATH_RE.test(url.pathname)) {
    if (/\/themes\/manifest\.json$/.test(url.pathname)) return;
    event.respondWith(dataFirst(request, url));
    return;
  }

  // 9) 其他同源 GET：StaleWhileRevalidate
  if (sameOrigin) {
    event.respondWith(staleWhileRevalidate(request, SHELL_CACHE));
  }
});

/**
 * 导航：CacheFirst。
 * 为什么不用 NetworkFirst：资源键带内容哈希，新 HTML 不会配旧 JS（各取各的键）。
 * 拿不到清单里的 index.html 时才走网络，再不行给离线页。
 */
async function handleNavigate(event) {
  const request = event.request;
  const cache = await caches.open(SHELL_CACHE);
  const key = shellKey('index.html');
  const cached = key ? await cache.match(key) : null;
  if (cached) return cached;

  // 兜底：清单里没有 index.html（老版本 SW / 清单异常）时按普通键找一次
  const legacy = await cache.match('./index.html');
  if (legacy) return legacy;

  try {
    const res = await withTimeout(fetch(request), NAV_TIMEOUT);
    if (res && res.ok && key) {
      // fire-and-forget：已过事件派发期，写失败不影响本次响应
      putClean(cache, key, res.clone()).catch(() => {});
    }
    return res;
  } catch (err) {
    return offlineFallback();
  }
}

/** 数据资源：哈希键命中即返，未命中走网络并按哈希键写入 */
async function dataFirst(request, url) {
  let key = request.url;
  try {
    key = hashedKey(url);
  } catch (err) {
    /* manifest 不可用 → 退回普通键 */
  }
  return cacheFirstByKey(request, key, DATA_CACHE);
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
