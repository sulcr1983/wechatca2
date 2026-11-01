/* 外链图本地化（方案 B2 · #6）
 *
 * 纯前端、无后端。把正文里的 http(s) 外链图抓下来，转成 data URI 内嵌。
 *
 * ⚠️ 平台事实（2026-11-01 **实测修正**，推翻了本文原先的结论）：
 *   旧注释写「公众号编辑器只认图床 URL，拒绝 data: URI」——**这是错的**。
 *   实测方法：生成一段含 data:image/jpeg;base64 的富文本，粘进公众号后台正文区，
 *   图片正常显示、文字样式一并带过去。句方便也是这么做的（抓包确认 19/19 张全转 data URI）。
 *   所以内嵌图对「直接粘贴到公众号」**是有效的**，不再需要用户在素材库手动重传。
 *   证据：docs/design-paste-image-and-typography.md §3.3、
 *         docs/research-2026-11-01-seneasy-copy-pipeline.md
 *
 * 但有一个真实约束：剪贴板装的是图片字节，张数一多体积会暴涨（原图直转可达几十 MB，
 * 粘贴明显卡顿）。所以「复制到公众号」这条路径必须带 compress=true，
 * 把单张压到 CLIP_MAX_BYTES、总量压到 CLIP_TOTAL_BYTES 以内。
 *
 * 设计约束（与 export.js 同源）：
 * - 不静默失败：每张失败的图都要带可读原因（403 / 超时 / 非图片 / 过大 / 跨域）。
 * - 不擅自联网：只有用户点「本地化图片」或执行导出/复制时才抓取。
 * - 有上限：单图 8 MB、单次 40 张、并发 3、超时 12 秒，避免卡死或吃爆内存。
 */

const TIMEOUT_MS = 12000;
const MAX_BYTES = 8 * 1024 * 1024;
const MAX_IMAGES = 40;
const CONCURRENCY = 3;

/* ── 复制到公众号用的压缩参数（2026-11-02）────────────────────────────
 * 为什么必须压：2026-11-01 实测确认 data URI 内嵌图能粘进公众号，
 * 但剪贴板体积会随图数量线性膨胀。句方便实测 19 张图合计 755KB（≈40KB/张），
 * 我们取 150KB/张、单次总量 8MB 上限 —— 超了粘贴会明显卡顿。
 * 原图直转（不压）在十几张照片上能到几十 MB。（方案见
 * docs/design-paste-image-and-typography.md §4.1） */
const CLIP_MAX_W = 1080;           // 公众号正文显示宽约 677，2x 屏留量
const CLIP_MAX_BYTES = 150 * 1024; // 单张目标
const CLIP_TOTAL_BYTES = 8 * 1024 * 1024;  // 单次总量
const CLIP_QUALITY_STEPS = [0.85, 0.7, 0.55];
/** data URI 的字符数 ≈ base64 长度，字节数 ≈ 字符数 × 0.75 */
const dataUriBytes = (s) => Math.round(String(s || '').length * 0.75);

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

/** 把任意 data URI / blob 压成目标宽度的 JPEG data URI。
 *
 * 为什么要它：复制到公众号时剪贴板里塞的是图片字节，原图直转会撑爆剪贴板
 * （十几张照片可到几十 MB，粘贴明显卡顿）。见文件头 CLIP_* 参数说明。
 * GIF 不压（压了会丢动画），直接返回原样。
 */
async function compressDataUrl(dataUri) {
  const src = String(dataUri || '');
  if (!/^data:image\//i.test(src)) return src;
  if (/^data:image\/gif/i.test(src)) return src;   // 压了会丢帧

  const img = new Image();
  img.decoding = 'async';
  await new Promise((resolve, reject) => {
    img.onload = resolve;
    img.onerror = () => reject(new Error('图片解码失败'));
    img.src = src;
  });

  const sw = img.naturalWidth || img.width;
  const sh = img.naturalHeight || img.height;
  const scale = Math.min(1, CLIP_MAX_W / Math.max(1, sw));
  const w = Math.max(1, Math.round(sw * scale));
  const h = Math.max(1, Math.round(sh * scale));

  const canvas = document.createElement('canvas');
  canvas.width = w;
  canvas.height = h;
  const ctx = canvas.getContext('2d');
  ctx.fillStyle = '#fff';           // png 透明区转 jpg 会变黑，先铺白
  ctx.fillRect(0, 0, w, h);
  ctx.drawImage(img, 0, 0, w, h);

  let best = null;
  for (const q of CLIP_QUALITY_STEPS) {
    const blob = await new Promise((r) => canvas.toBlob(r, 'image/jpeg', q));
    if (!blob) throw new Error('图片压缩失败');
    best = blob;
    if (blob.size <= CLIP_MAX_BYTES) break;
  }
  return blobToDataUrl(best);
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
 *
 * @param {string} html
 * @param {{compress?: boolean}} [opts]
 *   compress=true 时按 CLIP_* 参数压一遍 —— 复制到公众号用（剪贴板体积敏感）；
 *   导出 HTML / 长图用默认 false（保留原图画质）。
 * @returns {{ html:string, total:number, localized:number, failed:{src:string,reason:string}[], bytes:number }}
 *   total/localized 按「出现次数」统计；failed 按「唯一 URL」列出原因。
 */
export async function localizeImages(html, { compress = false } = {}) {
  const src = String(html || '');
  if (!src.trim()) return { html: src, total: 0, localized: 0, failed: [], bytes: 0 };

  const doc = new DOMParser().parseFromString(src, 'text/html');
  const imgs = Array.from(doc.body.querySelectorAll('img'))
    .filter((el) => isExternal((el.getAttribute('src') || '').trim()));

  if (!imgs.length) return { html: src, total: 0, localized: 0, failed: [], bytes: 0 };

  const unique = [...new Set(imgs.map((el) => el.getAttribute('src').trim()))];
  const over = unique.length > MAX_IMAGES ? unique.slice(MAX_IMAGES) : [];
  const target = unique.slice(0, MAX_IMAGES);

  let totalBytes = 0;
  const settled = await mapLimit(target, CONCURRENCY, async (url) => {
    try {
      let dataUrl = await fetchOne(url);
      if (compress) {
        dataUrl = await compressDataUrl(dataUrl);
        totalBytes += dataUriBytes(dataUrl);
        // 边压边累计；超总量直接判失败，避免剪贴板塞几十 MB 卡死
        if (totalBytes > CLIP_TOTAL_BYTES) {
          throw new Error(`图片总量超过 ${Math.round(CLIP_TOTAL_BYTES / 1024 / 1024)}MB，建议改用「导出长图」`);
        }
      }
      return { url, dataUrl };
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
    bytes: totalBytes,
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
