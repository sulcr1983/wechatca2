/* Wikimedia Commons 免 key 搜图（纯前端）。
 *
 * 为什么用它：不需要用户配置 Key，API 与图片 CDN 都返回 access-control-allow-origin: *。
 * 中文在 Commons 的搜索命中有偏差，所以先用内置场景词表把中文标题映射成英文关键词；
 * 没有命中时退回原文查询，仍无结果就返回空数组（UI 保留纯色 / 上传底图）。
 * 结果元数据缓存 24 小时（localStorage），图片本身只在内存里转 data URL，不落盘。
 */

const API = 'https://commons.wikimedia.org/w/api.php';
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
  // 中文无映射：去掉标点后取前 12 字，交给 Commons 的中文索引碰运气
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

async function request(query, limit) {
  const params = new URLSearchParams({
    action: 'query',
    format: 'json',
    formatversion: '2',
    origin: '*',
    generator: 'search',
    gsrsearch: `${query} filetype:bitmap`,
    gsrnamespace: '6',
    gsrlimit: '30',
    prop: 'imageinfo',
    iiprop: 'url|size|extmetadata',
    iiurlwidth: '1600',
  });
  const ctl = new AbortController();
  const timer = setTimeout(() => ctl.abort(), REQ_TIMEOUT);
  let data;
  try {
    const res = await fetch(`${API}?${params.toString()}`, { signal: ctl.signal, mode: 'cors' });
    if (!res.ok) throw new SearchError(`搜图接口 HTTP ${res.status}`);
    data = await res.json();
  } catch (e) {
    if (e instanceof SearchError) throw e;
    throw new SearchError(e && e.name === 'AbortError'
      ? '联网搜图超时（可改用纯色或上传图片）'
      : '联网搜图失败（网络不可达时可改用纯色或上传图片）');
  } finally {
    clearTimeout(timer);
  }

  const pages = Array.isArray(data?.query?.pages) ? data.query.pages : [];
  const BAD = /(?:^|[^a-z])(map|census|diagram|logo|chart|flag|coat[ _]of[ _]arms|seal|screenshot|icon)(?:[^a-z]|$)/i;
  const seen = new Set();
  const items = [];
  for (const p of pages) {
    const ii = p.imageinfo?.[0];
    if (!ii) continue;
    const url = ii.thumburl || ii.url || '';
    const ext = (url.split('?')[0].split('.').pop() || '').toLowerCase();
    if (!url || seen.has(url)) continue;
    if (!['jpg', 'jpeg', 'png', 'webp'].includes(ext)) continue;
    if (BAD.test(String(p.title || ''))) continue;
    const width = ii.thumbwidth || ii.width || 0;
    const height = ii.thumbheight || ii.height || 0;
    if (width < 800 || height < 600) continue;
    const m = ii.extmetadata || {};
    seen.add(url);
    // 候选网格用小图（480px），选中后才下载 1600px 原图
    const small = url.replace(/\/(\d+)px-/, '/480px-');
    items.push({
      id: p.pageid,
      title: plain(String(p.title || '').replace(/^File:/i, '')),
      url,
      thumb: small !== url ? small : url,
      width,
      height,
      author: plain(m.Artist?.value || m.Credit?.value || '').slice(0, 80),
      license: plain(m.LicenseShortName?.value || ''),
      licenseUrl: m.LicenseUrl?.value || '',
      pageUrl: ii.descriptionurl || '',
    });
  }
  const words = query.toLowerCase().split(/\s+/).filter(Boolean);
  const score = (it) => {
    let s = 0;
    const t = it.title.toLowerCase();
    for (const w of words) if (t.includes(w)) s += 3;
    if (it.height > it.width) s += 2;              // 竖图更适合 3:4
    const ratio = it.width / it.height;
    if (ratio > 0.65 && ratio < 1.55) s += 1;      // 接近方图/竖图，裁切损失小
    if (it.width * it.height > 2_000_000) s += 0.5;
    return s;
  };
  items.sort((a, b) => score(b) - score(a));
  return items.slice(0, limit);
}

/** 搜底图。返回 { query, translated, from, items }；失败抛 SearchError。 */
export async function searchBackground(input, { limit = 6 } = {}) {
  const guess = guessQuery(input);
  const q = guess.query;
  if (!q) return { query: '', translated: false, from: '', items: [] };

  const cache = readCache();
  const hit = cache[q];
  if (hit && Date.now() - hit.t < CACHE_TTL && Array.isArray(hit.items)) {
    return { ...guess, items: hit.items };
  }

  let items = await request(q, limit);
  // 映射后的英文没结果时，退回原文再试一次（中文标题可能命中 Commons 描述）
  if (!items.length && input && q !== input.trim()) {
    items = await request(input.trim().slice(0, 60), limit);
  }
  cache[q] = { t: Date.now(), items };
  writeCache(cache);
  return { ...guess, items };
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
