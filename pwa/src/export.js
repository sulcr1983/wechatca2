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
