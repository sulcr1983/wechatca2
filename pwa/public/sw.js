/*
 * SuperSu Service Worker（原生手写，无 Workbox）
 *
 * 策略总览：
 *   1) app shell（index.html / src/* / manifest / icons / fonts）→ install 时逐条 precache 到 SHELL 缓存；
 *   2) 数据资源（themes / theme-thumbs / py / cover-templates）→ CacheFirst，命中即返，只缓存 res.ok；
 *   3) CDN（cdn.jsdelivr.net 上的 Pyodide 等）→ CacheFirst，单独 CDN 缓存，允许缓存 opaque 响应；
 *   4) 导航请求 → NetworkFirst（3.5s 超时），失败回退 index.html，再失败回退内联离线页；
 *   5) 其他同源 GET → StaleWhileRevalidate。
 *
 * 取舍：shell 用版本化缓存、升级 VERSION 即整体重来；不自动 skipWaiting，
 * 让页面先提示「有新版本」，由用户点击后发 SKIP_WAITING 再接管，避免编辑中的草稿被刷新打断。
 * 引擎（Pyodide，10MB+）只做运行时缓存，不放进 install，否则首屏安装会卡很久。
 */

const VERSION = 'v1';

const SHELL_CACHE = 'supersu-shell-' + VERSION;
const DATA_CACHE = 'supersu-data-' + VERSION;
const CDN_CACHE = 'supersu-cdn-' + VERSION;
const CACHE_PREFIX = 'supersu-';

// 导航请求等待网络的上限，超时就直接走缓存，避免弱网白屏
const NAV_TIMEOUT = 3500;

// install 阶段预缓存的 app shell。路径都是相对 SW 所在目录（dist/ 即站点根目录）。
// 注意：清单里允许出现暂时还不存在的文件（比如 src/cover.js），precache 是逐条 add，
// 单个 404 只丢一条，不会让整个 install 失败。
const SHELL = [
  './',
  './index.html',
  './manifest.webmanifest',
  './src/app.js',
  './src/style.css',
  './src/bridge.js',
  './src/engine.worker.js',
  './src/update.js',
  './src/changelog.js',
  './src/changelog.css',
  './src/cover.js',
  './version.json',
  './changelog.json',
  './fonts/fonts.css',
  './icons/favicon-32.png',
  './icons/apple-touch-icon.png',
  './icons/icon-192.png',
  './icons/icon-512.png',
  './icons/icon-512-maskable.png',
];

// 数据类资源：体积大、变动少，按需缓存，不进 install
const DATA_PATH_RE = /\/(themes|theme-thumbs|py|cover-templates)\//;
// 跨域运行时（Pyodide / html-to-image 等）
const CDN_HOST_RE = /(^|\.)jsdelivr\.net$/;

/* ── install：预缓存 app shell ───────────────────────────────── */

// 安装时补齐 shell；这里刻意不用 addAll —— 只要清单里有一个 404，addAll 会整体 reject，
// 整个 SW 就装不上了。逐条 add + 各自 catch，缺哪个只是少一份离线副本。
self.addEventListener('install', (event) => {
  event.waitUntil(precacheAll());
});

async function precacheAll() {
  const cache = await caches.open(SHELL_CACHE);

  await Promise.all(
    SHELL.map(async (url) => {
      try {
        // cache: 'reload' 绕过 HTTP 缓存，确保拿到的是这次部署的真实文件
        const res = await fetch(new Request(url, { cache: 'reload' }));
        if (res && res.ok) await cache.put(url, res);
      } catch (err) {
        // 单个文件缺失/网络抖动：忽略，运行时还会再试
      }
    })
  );

  // fonts.css 里的 @font-face 引用的 woff2 无法在 SW 里 glob，
  // 就解析一遍 CSS 的 url()，把字体文件也顺带缓存下来。
  await precacheFonts(cache);
}

async function precacheFonts(cache) {
  try {
    const css = await cache.match('./fonts/fonts.css');
    if (!css) return;
    const text = await css.text();
    const re = /url\(\s*['"]?([^'")]+\.woff2[^'")]*)['"]?\s*\)/g;
    const urls = [];
    let m;
    while ((m = re.exec(text)) !== null) {
      let href = m[1];
      if (/^(data:|https?:)/.test(href)) continue;
      try {
        href = new URL(href, new URL('./fonts/fonts.css', self.registration.scope)).href;
        urls.push(href);
      } catch (err) {
        /* 忽略无法解析的 url */
      }
    }
    await Promise.all(
      urls.map(async (href) => {
        try {
          const res = await fetch(new Request(href, { cache: 'reload' }));
          if (res && res.ok) await cache.put(href, res);
        } catch (err) {
          /* 字体缺失不影响启动，系统字体会兜底 */
        }
      })
    );
  } catch (err) {
    // 字体预缓存只是锦上添花，失败不影响 install
  }
}

/* ── activate：清旧版本缓存 ─────────────────────────────────── */

// 只保留当前版本的三个 cache，其余 supersu-* 前缀的一律删掉；
// clients.claim() 让已打开的页面立刻归新 SW 管。
self.addEventListener('activate', (event) => {
  event.waitUntil(
    (async () => {
      const keep = [SHELL_CACHE, DATA_CACHE, CDN_CACHE];
      const keys = await caches.keys();
      await Promise.all(
        keys.map((key) => {
          if (key.startsWith(CACHE_PREFIX) && keep.indexOf(key) === -1) {
            return caches.delete(key);
          }
          return null;
        })
      );
      await self.clients.claim();
    })()
  );
});

/* ── message：由页面主动触发的更新接管 ──────────────────────── */

// 页面弹「有新版本，点此更新」后发 {type:'SKIP_WAITING'}，这里才跳过 waiting。
self.addEventListener('message', (event) => {
  const data = event.data;
  if (data && data.type === 'SKIP_WAITING') {
    self.skipWaiting();
  }
});

/* ── fetch：按资源类型分流 ─────────────────────────────────── */

// 分流顺序：非 GET / Range → 导航 → CDN → 数据资源 → 其他同源 → 交给浏览器。
self.addEventListener('fetch', (event) => {
  const request = event.request;

  // 非 GET 一律放行，不缓存任何写操作
  if (request.method !== 'GET') return;

  // Range 请求（视频/大文件分段下载）不能缓存，直接走网络
  if (request.headers.has('range')) return;

  let url;
  try {
    url = new URL(request.url);
  } catch (err) {
    return;
  }

  // 只处理 http(s)，chrome-extension: 之类一概放行
  if (url.protocol !== 'http:' && url.protocol !== 'https:') return;

  const sameOrigin = url.origin === self.location.origin;

  // 1) 页面导航：NetworkFirst
  if (request.mode === 'navigate') {
    event.respondWith(handleNavigate(event));
    return;
  }

  // 2) 跨域 CDN 运行时：CacheFirst（含 Pyodide 的 wasm/zip，多为 opaque 响应）
  if (!sameOrigin && CDN_HOST_RE.test(url.hostname)) {
    event.respondWith(
      cacheFirst(request, CDN_CACHE, true).catch(() => Response.error())
    );
    return;
  }

  // 3) 同源数据资源：CacheFirst
  if (sameOrigin && DATA_PATH_RE.test(url.pathname)) {
    event.respondWith(
      cacheFirst(request, DATA_CACHE, false).catch(() => Response.error())
    );
    return;
  }

  // 4) 其他同源 GET：StaleWhileRevalidate
  if (sameOrigin) {
    event.respondWith(staleWhileRevalidate(request, SHELL_CACHE));
  }

  // 其余跨域请求（第三方图片等）不拦截
});

/**
 * 导航：先网络（3.5s 超时），成功后顺手更新 index.html 缓存；
 * 网络不行就用缓存，最差给一个内联离线页。
 */
async function handleNavigate(event) {
  const request = event.request;
  const cache = await caches.open(SHELL_CACHE);

  try {
    const res = await withTimeout(fetch(request), NAV_TIMEOUT);
    if (res && res.ok) {
      // 把最新页面写回 index.html 这个固定 key，离线回退时总能拿到最后一版。
      // 这里不用 event.waitUntil：此时已过了事件派发期，调用会抛 InvalidStateError，
      // 写缓存失败也不影响本次响应，所以 fire-and-forget 即可。
      cache.put('./index.html', res.clone()).catch(() => {});
    }
    return res;
  } catch (err) {
    const cached = await cache.match(request, { ignoreSearch: true });
    if (cached) return cached;
    const shell = await cache.match('./index.html');
    if (shell) return shell;
    return offlineFallback();
  }
}

/**
 * CacheFirst：命中即返回，未命中才请求网络并写缓存。
 * allowOpaque 为 true 时，跨域 no-cors 的 opaque 响应也写入缓存
 * （读不到 status，但能离线复用）。
 */
async function cacheFirst(request, cacheName, allowOpaque) {
  const cache = await caches.open(cacheName);
  const hit = await cache.match(request);
  if (hit) return hit;

  const res = await fetch(request);
  const cacheable = res && (res.ok || (allowOpaque && res.type === 'opaque'));
  if (cacheable) {
    // 写入失败（配额满等）不能影响本次响应
    try {
      await cache.put(request, res.clone());
    } catch (err) {
      /* ignore */
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

  // 后台更新：不 await，返回缓存后它自己跑完（SW 在请求进行中不会被回收）
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
