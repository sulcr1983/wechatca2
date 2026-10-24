/* 导出与分发（方案 B1 · 出口三件套）：HTML 文件 / Markdown / 长图 PNG。
 *
 * 纯前端、无后端。长图复用 vendor 里的 modern-screenshot（与小红书封面同一套库，
 * 不新增依赖）。设计约束：**不静默失败** —— 每一项失败都要抛出可操作的原因，
 * 由调用方 toast 给用户；超长、外链图这类「可能出问题」的情况要提前告知。
 */

const BASE = new URL('../../', import.meta.url).href;
const LONG_WIDTH = 1080;      // 长图定宽：与小红书封面同宽，手机上足够清晰
const LONG_MAX_H = 20000;     // 画布上限保护：超长给提示，而不是渲染出一张白图
const IMG_WAIT_MS = 8000;     // 等图片加载的上限（外链图失败也不能卡住导出）

let libPromise = null;

function loadLib() {
  if (window.modernScreenshot) return Promise.resolve(window.modernScreenshot);
  if (!libPromise) {
    libPromise = new Promise((resolve, reject) => {
      const s = document.createElement('script');
      s.src = `${BASE}vendor/modern-screenshot.js`;
      s.onload = () => (window.modernScreenshot
        ? resolve(window.modernScreenshot)
        : reject(new Error('截图库加载后未暴露 modernScreenshot')));
      s.onerror = () => reject(new Error('截图库加载失败（vendor/modern-screenshot.js）'));
      document.head.appendChild(s);
    });
  }
  return libPromise;
}

function escapeHtml(s) {
  return String(s == null ? '' : s)
    .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;').replace(/'/g, '&#39;');
}

/** 触发一次文件下载；用完回收 objectURL，避免长会话里泄漏 */
function download(blob, filename) {
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 4000);
}

/** 文件名：标题（去掉文件系统非法字符、限长）+ 日期。标题为空时用「未命名」。 */
export function fileName(title, ext) {
  const t = String(title || '').replace(/[\\/:*?"<>|\n\r\t]/g, '').trim().slice(0, 40) || '未命名';
  const d = new Date();
  const p = (n) => String(n).padStart(2, '0');
  return `${t}-${d.getFullYear()}${p(d.getMonth() + 1)}${p(d.getDate())}.${ext}`;
}

/** 正文里的外链图数量（导出前提示：对方网络可能看不到） */
export function countExternalImages(html) {
  return (String(html).match(/<img[^>]+src=["']https?:\/\//gi) || []).length;
}

/** 把引擎输出包成**自包含** HTML：样式本来就全内联，这里只补页面底色与基础字体。 */
export function buildStandaloneHtml(html, theme = {}, title = '', width = 677) {
  const bg = theme.background || '#ffffff';
  const font = '-apple-system, BlinkMacSystemFont, "Segoe UI", "PingFang SC", "Noto Sans SC", "Microsoft YaHei", sans-serif';
  return `<!DOCTYPE html>
<html lang="zh-CN">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>${escapeHtml(title || 'SuperSu 导出')}</title>
<style>
  html, body { margin: 0; padding: 0; background: ${bg}; }
  body { font-family: ${font}; -webkit-text-size-adjust: 100%; }
  .supersu-doc { max-width: ${width}px; margin: 0 auto; padding: 16px; box-sizing: border-box; }
  .supersu-doc img { max-width: 100% !important; height: auto !important; }
</style>
</head>
<body>
<div class="supersu-doc">${html}</div>
</body>
</html>`;
}

/** 导出 HTML 文件（留档 / 交稿）。返回 { filename, bytes, externalImages } */
export function exportHtml(html, theme, title) {
  if (!html) throw new Error('还没有排版结果，先写点内容');
  const doc = buildStandaloneHtml(html, theme, title, 677);
  const blob = new Blob([doc], { type: 'text/html;charset=utf-8' });
  const name = fileName(title, 'html');
  download(blob, name);
  return { filename: name, bytes: blob.size, externalImages: countExternalImages(html) };
}

/** 导出 Markdown 源文件（我们本来就是 Markdown 内核，这是最「无损」的一种） */
export function exportMarkdown(markdown, title) {
  if (!markdown) throw new Error('还没有排版结果，先写点内容');
  const blob = new Blob([markdown], { type: 'text/markdown;charset=utf-8' });
  const name = fileName(title, 'md');
  download(blob, name);
  return { filename: name, bytes: blob.size };
}

async function waitImages(doc, timeout = IMG_WAIT_MS) {
  const imgs = Array.from(doc.images || []);
  await Promise.all(imgs.map((img) => (img.complete ? null : new Promise((resolve) => {
    const t = setTimeout(resolve, timeout);
    const done = () => { clearTimeout(t); resolve(); };
    img.addEventListener('load', done, { once: true });
    img.addEventListener('error', done, { once: true });   // 失败也放行，不卡住导出
  }))));
}

/** 导出长图 PNG：离屏 iframe 里按定宽渲染整篇 → 量高度 → modern-screenshot 出图。
 *  返回 { filename, width, height }。超长会抛可操作错误（不静默给白图）。 */
export async function exportLongImage(html, theme, title) {
  if (!html) throw new Error('还没有排版结果，先写点内容');
  const lib = await loadLib();
  const doc = buildStandaloneHtml(html, theme, title, LONG_WIDTH);

  const iframe = document.createElement('iframe');
  iframe.setAttribute('aria-hidden', 'true');
  iframe.style.cssText = `position:fixed;left:-20000px;top:0;border:0;width:${LONG_WIDTH}px;height:800px;`;
  document.body.appendChild(iframe);

  try {
    await new Promise((resolve, reject) => {
      iframe.onload = () => resolve();
      iframe.onerror = () => reject(new Error('长图容器加载失败'));
      iframe.srcdoc = doc;
    });
    const idoc = iframe.contentDocument;
    if (!idoc) throw new Error('长图容器不可访问（浏览器限制）');
    await waitImages(idoc);
    // 再等一帧，确保字体回流完成
    await new Promise((r) => requestAnimationFrame(() => requestAnimationFrame(r)));

    const node = idoc.body.firstElementChild;
    if (!node) throw new Error('长图内容为空');
    const height = Math.ceil(node.getBoundingClientRect().height);
    if (height < 40) throw new Error('内容高度异常，无法生成长图');
    if (height > LONG_MAX_H) {
      throw new Error(`文章太长（约 ${height}px，超过上限 ${LONG_MAX_H}px），建议改用「导出 HTML 文件」`);
    }

    const blob = await lib.domToBlob(node, { width: LONG_WIDTH, height, scale: 1 });
    const name = fileName(title, 'png');
    download(blob, name);
    return { filename: name, width: LONG_WIDTH, height, bytes: blob.size };
  } finally {
    iframe.remove();
  }
}

/* ── 批量导出图片（B2 #20）：正文所有图 → ZIP ─────────────────────
 * 正文图可能是三种来源：data URI（已本地化）、同源相对路径、仍存活的外链。
 * 外链通常已被 ensureLocalizedForExport 抓成 data URI；抓失败的按「跳过 + 原因」如实上报，
 * 绝不静默丢图。ZIP 用 vendor fflate（与九宫格同一套，store 级）。 */

const IMG_MAX = 60;
const IMG_MAX_BYTES = 8 * 1024 * 1024;
const IMG_MAX_TOTAL = 60 * 1024 * 1024;
const IMG_CONCURRENCY = 3;

const MIME_EXT = {
  'image/png': 'png',
  'image/jpeg': 'jpg',
  'image/jpg': 'jpg',
  'image/gif': 'gif',
  'image/webp': 'webp',
  'image/svg+xml': 'svg',
  'image/bmp': 'bmp',
  'image/avif': 'avif',
};

let zipPromise = null;

function loadZip() {
  if (window.fflate) return Promise.resolve(window.fflate);
  if (!zipPromise) {
    zipPromise = new Promise((resolve, reject) => {
      const s = document.createElement('script');
      s.src = `${BASE}vendor/fflate.min.js`;
      s.onload = () => (window.fflate
        ? resolve(window.fflate)
        : reject(new Error('打包库加载后未暴露 fflate')));
      s.onerror = () => reject(new Error('打包库加载失败（vendor/fflate.min.js）'));
      document.head.appendChild(s);
    });
  }
  return zipPromise;
}

function bytesText(n) {
  return n >= 1024 * 1024 ? (n / 1024 / 1024).toFixed(1) + ' MB' : Math.round(n / 1024) + ' KB';
}

function dataUriToBlob(src) {
  const m = /^data:([^;,]*)(;base64)?,([\s\S]*)$/i.exec(src);
  if (!m) throw new Error('内嵌图格式无法解析');
  const type = m[1] || 'application/octet-stream';
  const isB64 = !!m[2];
  const raw = isB64 ? atob(m[3].replace(/\s/g, '')) : decodeURIComponent(m[3]);
  const bytes = new Uint8Array(raw.length);
  for (let i = 0; i < raw.length; i += 1) bytes[i] = raw.charCodeAt(i);
  return new Blob([bytes], { type });
}

async function srcToBlob(src) {
  if (/^data:/i.test(src)) {
    const blob = dataUriToBlob(src);
    if (!blob.type.startsWith('image/')) throw new Error(`不是图片（${blob.type || '未知类型'}）`);
    return blob;
  }
  const res = await fetch(src, { credentials: 'omit', referrerPolicy: 'no-referrer' });
  if (!res.ok) {
    throw new Error(`下载失败（HTTP ${res.status}${res.status === 403 ? '，可能防盗链' : ''}）`);
  }
  const type = (res.headers.get('content-type') || '').split(';')[0].trim().toLowerCase();
  if (!type.startsWith('image/')) throw new Error(`返回的不是图片（${type || '无 Content-Type'}）`);
  const blob = await res.blob();
  if (blob.size > IMG_MAX_BYTES) throw new Error(`图片过大（${bytesText(blob.size)}，上限 8 MB）`);
  return blob;
}

function extFor(blob, src) {
  if (MIME_EXT[blob.type]) return MIME_EXT[blob.type];
  const tail = String(src).split('?')[0].split('.').pop().toLowerCase();
  return /^(png|jpe?g|gif|webp|svg|bmp|avif)$/.test(tail) ? (tail === 'jpeg' ? 'jpg' : tail) : 'png';
}

/** 简易并发池（与 images.js 同策略，这边独立一份避免跨模块耦合） */
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
 * 把正文里的图片全部打成一个 ZIP。
 * @returns {Promise<{filename:string,count:number,bytes:number,skipped:{src:string,reason:string}[]}>}
 * 正文没有图 / 所有图都失败 → 抛可操作错误（不静默）。
 */
export async function exportImages(html, title) {
  if (!html) throw new Error('还没有排版结果，先写点内容');
  const doc = new DOMParser().parseFromString(html, 'text/html');
  const srcs = [];
  for (const el of Array.from(doc.body.querySelectorAll('img'))) {
    const s = (el.getAttribute('src') || '').trim();
    if (s && !srcs.includes(s)) srcs.push(s);
  }
  if (!srcs.length) throw new Error('正文里没有图片，先插入一张再导出');

  const over = srcs.length > IMG_MAX ? srcs.slice(IMG_MAX) : [];
  const target = srcs.slice(0, IMG_MAX);
  const skipped = over.map((src) => ({ src, reason: `超过单次 ${IMG_MAX} 张上限，未处理` }));

  const settled = await mapLimit(target, IMG_CONCURRENCY, async (src) => {
    try {
      return { src, blob: await srcToBlob(src) };
    } catch (e) {
      return { src, error: (e && e.message) || String(e) };
    }
  });

  const files = [];
  let total = 0;
  for (const r of settled) {
    if (!r.blob) { skipped.push({ src: r.src, reason: r.error }); continue; }
    if (total + r.blob.size > IMG_MAX_TOTAL) {
      skipped.push({ src: r.src, reason: `累计超过 ${bytesText(IMG_MAX_TOTAL)} 上限，未打包` });
      continue;
    }
    total += r.blob.size;
    const seq = files.length + 1;
    files.push({ name: `img-${String(seq).padStart(2, '0')}.${extFor(r.blob, r.src)}`, blob: r.blob });
  }
  if (!files.length) {
    const why = skipped[0] ? `：${skipped[0].reason}` : '';
    throw new Error(`正文里的图片都没能取到${why}`);
  }

  const lib = await loadZip();
  const entries = {};
  for (const f of files) entries[f.name] = new Uint8Array(await f.blob.arrayBuffer());
  const zipped = lib.zipSync(entries, { level: 0 });
  if (!zipped || !zipped.length) throw new Error('打包结果为空（fflate 未返回数据）');

  const blob = new Blob([zipped], { type: 'application/zip' });
  const name = fileName(title || '正文图片', 'zip');
  download(blob, name);
  return { filename: name, count: files.length, bytes: blob.size, skipped };
}
