/* 封面渲染：在离屏 iframe 里构建 HTML → 等字体/fitty 就绪 → modern-screenshot 出 PNG。
 * 纯前端、无后端；同一套代码也用于预览（buildCoverHtml）。
 */

import { COVER_SIZES, GUIZANG_STYLES, styleById, isLayoutStyle } from './catalog.js';
import { buildGuizangHtml, prepareTemplateHtml } from './templates.js';
import { buildLayoutHtml } from './layouts.js';
import { applyTextStyle } from './textmode.js';

const BASE = new URL('../../', import.meta.url).href;
const WAIT_READY_MS = 15000;

let libPromise = null;
const templateCache = new Map();

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

async function loadTemplate(id) {
  if (templateCache.has(id)) return templateCache.get(id);
  const res = await fetch(`${BASE}cover-templates/${id}.html`, { cache: 'force-cache' });
  if (!res.ok) throw new Error(`模板加载失败：${id}（HTTP ${res.status}）`);
  const html = await res.text();
  templateCache.set(id, html);
  return html;
}

/** 返回最终 HTML（不渲染），供预览或调试。 */
export async function buildCoverHtml({ style, size = 'xhs', title, lead = '', author = '', image = '', textMode = 'stack', font = 'auto', analysis = null, textPos = 'auto', frosted = false }) {
  const meta = styleById(style);
  const realSize = meta.sizes.includes(size) ? size : meta.sizes[0];
  const opts = {
    title, lead, author, image, baseUrl: BASE,
    // 底图可读性分析结果（2026-10-30）：文字位置与字色由 analyze.js 实测得出，
    // 传 null 时各渲染器回退到原来的「贴底 + 白字 + 深遮罩」行为（回归安全）。
    analysis, textPos, frosted,
  };
  let html;
  if (GUIZANG_STYLES.some((s) => s.id === style)) {
    html = buildGuizangHtml({ style, size: realSize, ...opts });
  } else if (isLayoutStyle(style)) {
    // 2026-10-29 新增的 4 个版式：骨架渲染（只出 3:4）
    html = buildLayoutHtml({ style, ...opts });
  } else {
    html = prepareTemplateHtml(await loadTemplate(style), opts);
  }
  // 字体 + 文字玩法（2026-10-25）：在模板产物之上做一层纯 CSS/逐字 span 处理，
  // 不改模板结构，默认 'stack'/'auto' 时行为与之前完全一致（回归安全）。
  // baseUrl 用于可选字体（得意黑）的绝对 URL —— srcdoc 里相对路径无效。
  html = applyTextStyle(html, { mode: textMode, font, title, baseUrl: BASE });
  return { html, size: realSize, meta };
}

function waitReady(win, timeout = WAIT_READY_MS) {
  return new Promise((resolve, reject) => {
    const t0 = Date.now();
    const tick = () => {
      if (win.__coverReady) return resolve();
      if (Date.now() - t0 > timeout) return reject(new Error('封面排版超时（字体或自适应未就绪）'));
      setTimeout(tick, 50);
    };
    tick();
  });
}

/** 渲染成 PNG Blob。 */
export async function renderCoverBlob(opts) {
  const lib = await loadLib();
  const { html, size, meta } = await buildCoverHtml(opts);
  const dim = COVER_SIZES[size] || COVER_SIZES.xhs;

  const iframe = document.createElement('iframe');
  iframe.setAttribute('aria-hidden', 'true');
  iframe.style.cssText = `position:fixed;left:-20000px;top:0;border:0;width:${dim.w + 240}px;height:${dim.h + 160}px;`;
  document.body.appendChild(iframe);

  try {
    await new Promise((resolve, reject) => {
      iframe.onload = () => resolve();
      iframe.onerror = () => reject(new Error('封面 iframe 加载失败'));
      iframe.srcdoc = html;
    });
    await waitReady(iframe.contentWindow);
    // 等字体真正就绪（2026-10-25）：可选字体（得意黑）是按需注入的，
    // 若不等 fonts.ready，截图可能拍到「字体还没下完 → 用回退字体」的画面。
    try {
      await iframe.contentWindow.document.fonts.ready;
    } catch { /* 老浏览器没有 fonts.ready，忽略 */ }
    // 再等一帧，确保 fitty 的 font-size 已写回
    await new Promise((r) => requestAnimationFrame(() => requestAnimationFrame(r)));
    const node = iframe.contentDocument.getElementById('xhs-cover');
    if (!node) throw new Error('模板里找不到 #xhs-cover');
    const blob = await lib.domToBlob(node, { width: dim.w, height: dim.h, scale: 1 });
    return { blob, width: dim.w, height: dim.h, style: meta.id, size };
  } finally {
    iframe.remove();
  }
}
