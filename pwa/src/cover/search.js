/* 联网搜图（纯前端，BYOK）。
 *
 * 图源只有 Pexels 一家，必须用户自己填免费 Key。
 *
 * 为什么只剩一家（2026-10-27 苏哥拍板「不支持中文的删掉」）：
 *   - Wikimedia：国内直连必超时（HTTP 000），已移除
 *   - Pixabay：**完全不支持中文关键词**（实测「咖啡」→ totalHits 0，
 *     「coffee」→ 500）。而本项目用户几乎全用中文标题搜图，
 *     留着它只会出现「配了 Key 也搜不到」的困惑，所以一并移除。
 *   - Pexels：原生支持中文，竖图多，CDN 国内可直连 → 唯一保留
 *
 * Pexels License 允许免费商用、无需署名。Key 存 localStorage，不上传。
 * 结果缓存 24 小时（localStorage），且**按图源签名隔离**（换 Key 即失效）。
 * 图片只在内存转 data URL，不落盘。
 */

const CACHE_KEY = 'supersu.cover.search.v1';
const CACHE_TTL = 24 * 60 * 60 * 1000;
const CACHE_MAX = 24;
const REQ_TIMEOUT = 9000;
const IMG_TIMEOUT = 15000;

// 常见小红书场景词（按长度优先匹配）
const ZH_EN = [
  ['海边', 'beach ocean'], ['大海', 'ocean'], ['日落', 'sunset'], ['日出', 'sunrise'],
  ['森林', 'forest'], ['城市', 'city'], ['街道', 'street'], ['夜晚', 'night'],
  ['天空', 'sky clouds'], ['雨天', 'rain'], ['下雪', 'snow'], ['雪花', 'snow'],
  ['花朵', 'flowers'], ['咖啡', 'coffee'], ['咖啡馆', 'cafe'], ['书桌', 'desk'],
  ['阅读', 'reading books'], ['办公室', 'office'], ['电脑', 'laptop'], ['工作台', 'workspace'],
  ['旅行', 'travel'], ['骑行', 'cycling'], ['跑步', 'running'], ['美食', 'food'],
  ['早餐', 'breakfast'], ['猫咪', 'cat'], ['小狗', 'dog'], ['雪山', 'snow mountain'],
  ['湖泊', 'lake'], ['河流', 'river'], ['田野', 'field'], ['沙漠', 'desert'],
  ['建筑', 'architecture'], ['极简', 'minimal'], ['生活', 'lifestyle'], ['春天', 'spring'],
  ['夏天', 'summer'], ['秋天', 'autumn'], ['冬天', 'winter'], ['山', 'mountain'],
  ['海', 'ocean'], ['花', 'flowers'], ['树', 'trees'], ['云', 'clouds'],
  ['雨', 'rain'], ['雪', 'snow'], ['书', 'books'], ['猫', 'cat'], ['狗', 'dog'],
];

const dataUrlCache = new Map();

export class SearchError extends Error {}

function plain(html) {
  return String(html || '')
    .replace(/<[^>]*>/g, ' ')
    .replace(/&nbsp;/g, ' ')
    .replace(/&amp;/g, '&')
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/\s+/g, ' ')
    .trim();
}

/** 从标题/文案猜一个 Commons 查询词。 */
export function guessQuery(text) {
  const raw = String(text || '').normalize('NFC').trim();
  if (!raw) return { query: '', translated: false, from: '' };
  const hits = [];
  for (const [zh, en] of ZH_EN) {
    const at = raw.indexOf(zh);
    if (at >= 0) hits.push({ zh, en, at });
  }
  if (hits.length) {
    hits.sort((a, b) => b.zh.length - a.zh.length);
    const picked = hits.slice(0, 2);
    const words = [...new Set(picked.flatMap((h) => h.en.split(/\s+/)))];
    return {
      query: words.join(' '),
      translated: true,
      from: picked.map((h) => h.zh).join('、'),
    };
  }
  const ascii = raw.replace(/[^\x20-\x7E]+/g, ' ').replace(/\s+/g, ' ').trim();
  if (ascii && ascii.length <= 60 && /[a-zA-Z]/.test(ascii)) {
    return { query: ascii, translated: false, from: '' };
  }
  // 中文无映射：去掉标点后取前 12 字直接搜（Pexels 原生支持中文）
  const cleaned = raw.replace(/[，。！？、；：""''《》【】（）()\s]+/g, ' ').trim();
  return { query: cleaned.slice(0, 12), translated: false, from: '' };
}

function readCache() {
  try {
    return JSON.parse(localStorage.getItem(CACHE_KEY) || '{}') || {};
  } catch {
    return {};
  }
}

function writeCache(obj) {
  try {
    const entries = Object.entries(obj).sort((a, b) => b[1].t - a[1].t).slice(0, CACHE_MAX);
    localStorage.setItem(CACHE_KEY, JSON.stringify(Object.fromEntries(entries)));
  } catch { /* 隐私模式 / 配额满：不阻断搜索 */ }
}


/* ── 图源（2026-10-27 收敛为单源）───────────────────────────────────────
 *
 * 演进过程：Wikimedia（国内超时）→ 加 Pexels/Pixabay 降级 → 只留 Pexels。
 * 保留 Pixabay 的唯一理由是「备选」，但它不吃中文关键词，
 * 对本项目（中文标题）等于无效，用户还会以为是自己没配好。已移除。
 *
 * 授权：Pexels License，免费商用、无需署名
 *   https://www.pexels.com/license/
 *
 * Key 存浏览器本地（BYOK，与 AI 功能同模式），不上传服务端。
 */

const STOCK_KEY = 'supersu.cover.stock.v1';
const PEXELS_API = 'https://api.pexels.com/v1/search';

/** 读取图库 key。返回 { pexels }，缺省为空串。 */
export function getStockKeys() {
  try {
    const d = JSON.parse(localStorage.getItem(STOCK_KEY) || '{}') || {};
    return { pexels: String(d.pexels || '') };
  } catch {
    return { pexels: '' };
  }
}

/** 保存图库 key（只存本机）。 */
export function setStockKeys({ pexels = '' } = {}) {
  try {
    localStorage.setItem(STOCK_KEY, JSON.stringify({
      pexels: String(pexels).trim(),
    }));
  } catch { /* 隐私模式忽略 */ }
}

/** 当前哪些源可用（用于 UI 提示）。 */
export function availableProviders() {
  const k = getStockKeys();
  const out = [];
  if (k.pexels) out.push('pexels');
  return out;   // Pexels 是唯一图源（Wikimedia/Pixabay 均已移除）
}

async function fetchJson(url, { headers = {}, timeout = REQ_TIMEOUT } = {}) {
  const ctl = new AbortController();
  const timer = setTimeout(() => ctl.abort(), timeout);
  try {
    const res = await fetch(url, { signal: ctl.signal, mode: 'cors', headers });
    if (!res.ok) throw new SearchError(`HTTP ${res.status}`);
    return await res.json();
  } finally {
    clearTimeout(timer);
  }
}

/** Pexels 搜索。原生支持中文 query，竖图优先。 */
async function searchPexels(q, limit, key, page = 1) {
  /* 2026-10-30 加翻页（用户反馈「只有几张、没有上一页下一页」）：
     Pexels 官方支持 page / per_page（per_page 上限 80）。
     每页取 12 张（3 列 × 4 行，左栏一屏能看全），翻页由 UI 传 page。 */
  const params = new URLSearchParams({
    query: q,
    per_page: String(Math.min(80, Math.max(limit, 12))),
    page: String(Math.max(1, page)),
    orientation: 'portrait',
  });
  const data = await fetchJson(`${PEXELS_API}?${params}`, { headers: { Authorization: key } });
  const photos = Array.isArray(data?.photos) ? data.photos : [];
  const items = photos.map((ph) => ({
    id: `px-${ph.id}`,
    title: ph.alt || q,
    url: ph.src?.original || ph.src?.large2x || ph.src?.large || '',
    thumb: ph.src?.medium || ph.src?.small || ph.src?.tiny || '',
    width: ph.width || 0,
    height: ph.height || 0,
    author: ph.photographer || '',
    license: 'Pexels License',
    licenseUrl: 'https://www.pexels.com/license/',
    pageUrl: ph.url || '',
    provider: 'pexels',
  })).filter((it) => it.url && it.width >= 600);
  // total/next_page 交给 UI 决定「下一页」是否可点
  return {
    items,
    page: Number(data?.page) || page,
    total: Number(data?.total_results) || 0,
    hasNext: !!data?.next_page,
  };
}

/** 搜图主入口：Pexels 是唯一图源（Wikimedia/Pixabay 都已移除）。 */
async function searchMultiProvider(q, limit, page = 1) {
  const keys = getStockKeys();

  // 没配 Key 就别发请求了 —— 直接告诉用户去填，比等一下再失败好
  if (!keys.pexels) {
    const err = new SearchError(
      '还没配置 Pexels Key。点「填 Key（免费·2分钟）」填一个就能用，支持中文关键词。');
    err.needKey = true;
    throw err;
  }

  try {
    const r = await searchPexels(q, limit, keys.pexels, page);
    if (r.items.length) return { ...r, provider: 'pexels' };
    const err = new SearchError(page > 1
      ? '后面没有了，回上一页看看。'
      : '没找到底图，换个关键词试试（中文/英文都行，如 海边 / beach / 咖啡）。');
    err.detail = ['Pexels 无结果'];
    throw err;
  } catch (e) {
    if (e instanceof SearchError) throw e;
    const err = new SearchError(`搜图失败：${e.message || e}`);
    err.detail = ['Pexels 请求异常'];
    throw err;
  }
}

/** 搜底图。返回 { query, translated, from, items }；失败抛 SearchError。 */
export async function searchBackground(input, { limit = 12, page = 1 } = {}) {
  const guess = guessQuery(input);
  const q = guess.query;
  if (!q) return { query: '', translated: false, from: '', items: [], provider: '', hasNext: false };

  /* 缓存必须绑定「当前用了哪些图源」（2026-10-27 修）。
     原来只用查询词当 key，实测踩到：先配 Pexels 搜 beach（结果入缓存），
     再把 Pexels Key 清空，再搜 beach —— 直接命中旧缓存，
     返回 Pexels 的图，可用户明明没有 Pexels Key。
     现在 key = 「图源签名:查询词」，换 Key 立刻失效，不会串源。 */
  const sig = availableProviders().join('+') || 'none';
  // 缓存只缓存第 1 页（翻页结果不进缓存，避免把「第 3 页」当成首屏）
  const ck = `${sig}:${q}`;
  const cache = readCache();
  const hit = cache[ck];
  if (page === 1 && hit && Date.now() - hit.t < CACHE_TTL && Array.isArray(hit.items)) {
    return { ...guess, items: hit.items, provider: hit.provider || '',
             hasNext: !!hit.hasNext, total: hit.total || 0, page: 1 };
  }

  // 2026-10-27：只保留 Pexels（Wikimedia 国内不可达、Pixabay 不吃中文，均已移除）。
  // Pexels 原生支持中文，guessQuery 的英文映射只作为「更准的关键词」锦上添花。
  let items = [];
  let provider = '';
  let hasNext = false;
  let total = 0;
  try {
    const r = await searchMultiProvider(q, limit, page);
    items = r.items;
    provider = r.provider;
    hasNext = !!r.hasNext;
    total = r.total || 0;
  } catch (e) {
    // 英文映射词没命中时，退回原文再试一次（Pexels 直接吃中文，中文往往更准）
    // 翻页时不重试：第 2 页没结果就是真的没有了，别把「原文第 1 页」当第 2 页返回
    if (page === 1 && input && q !== input.trim()) {
      const r2 = await searchMultiProvider(input.trim().slice(0, 60), limit, page);
      items = r2.items;
      provider = r2.provider;
      hasNext = !!r2.hasNext;
      total = r2.total || 0;
    } else {
      throw e;
    }
  }
  // 只缓存第 1 页
  if (page === 1) {
    cache[ck] = { t: Date.now(), items, provider, hasNext, total };
    writeCache(cache);
  }
  return { ...guess, items, provider, hasNext, total, page };
}

/** 把远程图片转成 data URL（避免截图时跨域图片被污染）。 */
export async function fetchImageDataUrl(url) {
  if (dataUrlCache.has(url)) return dataUrlCache.get(url);
  const ctl = new AbortController();
  const timer = setTimeout(() => ctl.abort(), IMG_TIMEOUT);
  try {
    const res = await fetch(url, { signal: ctl.signal, mode: 'cors', credentials: 'omit' });
    if (!res.ok) throw new SearchError(`底图下载失败 HTTP ${res.status}`);
    const blob = await res.blob();
    const dataUrl = await new Promise((resolve, reject) => {
      const fr = new FileReader();
      fr.onload = () => resolve(String(fr.result || ''));
      fr.onerror = () => reject(new SearchError('底图读取失败'));
      fr.readAsDataURL(blob);
    });
    dataUrlCache.set(url, dataUrl);
    return dataUrl;
  } catch (e) {
    if (e instanceof SearchError) throw e;
    throw new SearchError('底图下载失败（跨域或网络不可达），可改用纯色或上传图片');
  } finally {
    clearTimeout(timer);
  }
}
