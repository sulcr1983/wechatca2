/* 外链图本地化（方案 B2 · #6）
 *
 * 纯前端、无后端。把正文里的 http(s) 外链图抓下来，转成 data URI 内嵌。
 *
 * ⚠️ 平台事实（2026-10 查证）：微信公众号编辑器粘贴富文本时**只认公众号图床 URL，
 * 拒绝 data: URI**。所以内嵌图对「导出 HTML / 长图 PNG / 离线留档」有效，
 * 对「直接粘贴到公众号」无效——那条链路必须由用户在素材库手动上传。
 * UI 文案不得承诺公众号直贴可显示。
 *
 * 设计约束（与 export.js 同源）：
 * - 不静默失败：每张失败的图都要带可读原因（403 / 超时 / 非图片 / 过大 / 跨域）。
 * - 不擅自联网：只有用户点「本地化图片」或执行导出时才抓取。
 * - 有上限：单图 8 MB、单次 40 张、并发 3、超时 12 秒，避免卡死或吃爆内存。
 */

const TIMEOUT_MS = 12000;
const MAX_BYTES = 8 * 1024 * 1024;
const MAX_IMAGES = 40;
const CONCURRENCY = 3;

/** 同一会话内复用：同一 URL 不重复抓（成功才缓存；失败允许重试） */
const cache = new Map();

/** 正文里所有外链图地址（含重复，按出现次数计） */
export function scanExternalImages(html) {
  const out = [];
  const re = /<img\b[^>]*\bsrc\s*=\s*["']([^"']+)["'][^>]*>/gi;
  let m;
  while ((m = re.exec(String(html || '')))) {
    const url = decodeEntities(m[1]).trim();
    if (isExternal(url)) out.push(url);
  }
  return out;
}

function isExternal(url) {
  return /^(https?:)?\/\//i.test(url);
}

function decodeEntities(s) {
  return String(s)
    .replace(/&amp;/g, '&')
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>');
}

function normalizeUrl(url) {
  if (url.startsWith('//')) return 'https:' + url;
  return url;
}

function bytesText(n) {
  return n >= 1024 * 1024 ? (n / 1024 / 1024).toFixed(1) + ' MB' : Math.round(n / 1024) + ' KB';
}

/** 抓一张图 → data URI；失败抛带原因的错误 */
async function fetchOne(url) {
  if (cache.has(url)) return cache.get(url);
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), TIMEOUT_MS);
  try {
    const res = await fetch(normalizeUrl(url), {
      mode: 'cors',
      credentials: 'omit',
      referrerPolicy: 'no-referrer',
      signal: ctrl.signal,
    });
    if (!res.ok) throw new Error(`图片站点拒绝访问（HTTP ${res.status}${res.status === 403 ? '，可能防盗链' : ''}）`);
    const type = (res.headers.get('content-type') || '').split(';')[0].trim().toLowerCase();
    if (!type.startsWith('image/')) throw new Error(`返回的不是图片（${type || '无 Content-Type'}）`);
    const blob = await res.blob();
    if (blob.size > MAX_BYTES) throw new Error(`图片过大（${bytesText(blob.size)}，上限 8 MB）`);
    const dataUrl = await blobToDataUrl(blob, type);
    cache.set(url, dataUrl);
    return dataUrl;
  } catch (e) {
    if (e && e.name === 'AbortError') throw new Error(`请求超时（${TIMEOUT_MS / 1000} 秒）`);
    if (e && /Failed to fetch|NetworkError|Load failed/i.test(e.message || '')) {
      throw new Error('跨域被拒或网络不可达（对方未开放 CORS）');
    }
    throw e instanceof Error ? e : new Error(String(e));
  } finally {
    clearTimeout(timer);
  }
}

function blobToDataUrl(blob, type) {
  const b = blob.type ? blob : new Blob([blob], { type });
  return new Promise((resolve, reject) => {
    const fr = new FileReader();
    fr.onload = () => resolve(String(fr.result));
    fr.onerror = () => reject(new Error('图片读取失败'));
    fr.readAsDataURL(b);
  });
}

/** 简易并发池：保证最多 CONCURRENCY 个请求在飞 */
async function mapLimit(items, limit, fn) {
  const out = new Array(items.length);
  let i = 0;
  async function worker() {
    while (i < items.length) {
      const k = i++;
      out[k] = await fn(items[k], k);
    }
  }
  await Promise.all(Array.from({ length: Math.min(limit, items.length) }, worker));
  return out;
}

/**
 * 把正文里的外链图替换成 data URI。
 * @returns {{ html:string, total:number, localized:number, failed:{src:string,reason:string}[] }}
 *   total/localized 按「出现次数」统计；failed 按「唯一 URL」列出原因。
 */
export async function localizeImages(html) {
  const src = String(html || '');
  if (!src.trim()) return { html: src, total: 0, localized: 0, failed: [] };

  const doc = new DOMParser().parseFromString(src, 'text/html');
  const imgs = Array.from(doc.body.querySelectorAll('img'))
    .filter((el) => isExternal((el.getAttribute('src') || '').trim()));

  if (!imgs.length) return { html: src, total: 0, localized: 0, failed: [] };

  const unique = [...new Set(imgs.map((el) => el.getAttribute('src').trim()))];
  const over = unique.length > MAX_IMAGES ? unique.slice(MAX_IMAGES) : [];
  const target = unique.slice(0, MAX_IMAGES);

  const settled = await mapLimit(target, CONCURRENCY, async (url) => {
    try {
      return { url, dataUrl: await fetchOne(url) };
    } catch (e) {
      return { url, error: (e && e.message) || String(e) };
    }
  });

  const ok = new Map();
  const failed = [];
  for (const r of settled) {
    if (r.dataUrl) ok.set(r.url, r.dataUrl);
    else failed.push({ src: r.url, reason: r.error });
  }
  for (const url of over) failed.push({ src: url, reason: `超过单次 ${MAX_IMAGES} 张上限，未处理` });

  let localized = 0;
  for (const el of imgs) {
    const url = el.getAttribute('src').trim();
    const dataUrl = ok.get(url);
    if (!dataUrl) continue;
    el.setAttribute('src', dataUrl);
    el.removeAttribute('srcset');   // 否则浏览器可能仍按外链候选加载
    localized++;
  }

  return {
    html: doc.body.innerHTML,
    total: imgs.length,
    localized,
    failed,
  };
}

/** 失败原因压成一句话（提示条 / toast 用），最多列 2 条，其余计数 */
export function failureSummary(failed) {
  const list = failed || [];
  if (!list.length) return '';
  const head = list.slice(0, 2).map((f) => `${shortUrl(f.src)}：${f.reason}`).join('；');
  return list.length > 2 ? `${head}；另有 ${list.length - 2} 张失败` : head;
}

export function shortUrl(url) {
  try {
    const u = new URL(normalizeUrl(url));
    const tail = (u.pathname.split('/').filter(Boolean).pop() || '').slice(0, 24);
    return u.host + (tail ? '/' + tail : '');
  } catch {
    return String(url).slice(0, 40);
  }
}
