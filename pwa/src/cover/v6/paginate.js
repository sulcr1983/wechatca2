/* 自动分页器 · 长图文 V4
 *
 * 目标：把「任意长度的纯文本」自动拆成 N 张 1080×1440 页，逐句零丢失。
 *
 * 算法来源（复用已验证的产品实现，不引新依赖）：
 *   pwa/src/cover/cards.js 的 measureDense / denseMaxHeight / splitUntilFit / packDense
 *     · DOM 实测高度装箱（不是按字数猜）
 *     · 单块超页容量时二分找「能装进 maxH 的最长前缀」，再回退到句读处断开
 *     · 留 4% 安全余量（字体回退的行高差异）
 *     · 无 DOM（Node 单测）时降级到字数包络
 *
 * 与产品的差异（最小改动原则）：本文件只在原型目录内实现一个轻量版，
 * 不复制产品 7 角色的复杂分支，只保留「解析 → 装箱 → 角色标注」三件事。
 *
 * ⚠️ Paged.js（MIT）调研结论：它是 CSS Paged Media polyfill，只管「在哪断」，
 *    不管「断了之后这页够不够满」；固定 1080×1440 画布下末页填充率可低到 26.7%，
 *    且 pagedjs:rendered 事件实测不触发。故不引入，沿用 DOM 实测装箱。
 */

/* ── 1. 解析：纯文本 → 块数组 ────────────────────────────────── */

export const MAX_PAGES = 12;          // 上限（超过则合并，不丢内容）
export const CHARS_PER_ROW = 26;      // 无 DOM 时的字数包络口径（32px 中文 / 888px 宽）

/** 解析 Markdown 风格的纯文本。首行 = 标题，其余按空行分段。 */
export function parseArticle(raw) {
  const text = String(raw || '').replace(/\r\n/g, '\n').trim();
  if (!text) return { title: '', blocks: [] };
  const lines = text.split('\n');
  const title = (lines.shift() || '').trim();
  const blocks = [];
  let para = [];

  const flush = () => {
    const t = para.join('').trim();
    if (t) blocks.push({ type: 'p', text: t });
    para = [];
  };

  for (const line of lines) {
    const s = line.trim();
    if (!s) { flush(); continue; }
    if (/^---+$/.test(s)) { flush(); blocks.push({ type: 'break' }); continue; }
    if (/^#{1,4}\s+/.test(s)) { flush(); blocks.push({ type: 'h', text: s.replace(/^#{1,4}\s+/, '') }); continue; }
    if (/^>\s?/.test(s)) { flush(); blocks.push({ type: 'quote', text: s.replace(/^>\s?/, '') }); continue; }
    if (/^[-*]\s+/.test(s) || /^\d+[.、]\s*/.test(s)) {
      flush();
      blocks.push({ type: 'li', text: s.replace(/^([-*]|\d+[.、])\s+/, '') });
      continue;
    }
    para.push(s);
  }
  flush();
  return { title, blocks };
}

/* ── 2. 度量：离屏 DOM 实测高度 ─────────────────────────────── */

/**
 * 量一段文字在目标样式下的高度。
 * 宿主元素由调用方提供（保证字体/CSS 与最终成品同源）。
 * 返回像素高度；无 DOM 返回 null。
 */
export function measureText(text, style, host) {
  if (typeof document === 'undefined' || !host) return null;
  const el = document.createElement('p');
  el.style.cssText = `font-family:${style.bodyFont || 'serif'};`
    + `font-size:${style.bodySize || 32}px;line-height:${style.lineHeight || 1.92};`
    + `letter-spacing:${style.tracking || '.01em'};text-align:justify;`
    + `margin:0 0 ${style.paraGap || 26}px;width:${style.textWidth || 888}px;`;
  el.textContent = text;
  host.appendChild(el);
  const cs = getComputedStyle(el);
  const h = el.getBoundingClientRect().height + (parseFloat(cs.marginBottom) || 0);
  host.removeChild(el);
  return h;
}

/** 页面可用高度（1440 − 上下 96px 页边距 − 页眉页脚约 160px）。 */
export function pageCapacity(style) {
  return Math.floor((1440 - 96 * 2 - (style.chromeH || 160)) * 0.96);
}

/* ── 2b. 按块类型度量（与 story-system.js::renderAuto 的块结构一一对应）──
 *
 * ⚠️ 这是「度量与渲染同构」的关键：分页器原先统一用 <p> 量高度，
 *    但 li 在 renderAuto 里是带 22px 上下 padding 的 grid .row、quote 有左边线与
 *    更大字号、h 是 52px 标题 —— 用 <p> 会低估约 40%，浏览器实测出现 fill=1.183 裁切。
 *    改 renderAuto 的块结构时必须同步改这里；浏览器回归 regress_browser.py 会守住。
 *
 * 字体用 style.bodyFont（measureStyle 已把 var(--serif) 解析成真实字体族），
 * 不依赖度量宿主里的 :root 变量，保证与成品同源。 */
const escHtml = (s) => String(s == null ? '' : s)
  .replace(/&/g, '&amp;').replace(/</g, '&lt;')
  .replace(/>/g, '&gt;').replace(/"/g, '&quot;');

export function measureBlock(b, style, host) {
  if (typeof document === 'undefined' || !host) return null;
  const text = escHtml(String(b.text || ''));
  const F = style.bodyFont || 'serif';
  const T = style.titleFont || F;
  const fs = style.bodySize || 32;
  const lh = style.lineHeight || 1.92;
  const gap = style.paraGap || 26;
  const w = style.textWidth || 888;

  const wrap = document.createElement('div');
  wrap.style.cssText = `width:${w}px;`;
  if (b.type === 'li') {
    wrap.innerHTML = `<div class="row" style="display:grid;grid-template-columns:104px 1fr;
      align-items:start;padding:22px 0;border-bottom:1px solid rgba(0,0,0,.2)">
      <span style="font:500 40px/1 ui-monospace,Menlo,monospace">01</span>
      <span style="font-family:${F};font-size:${fs}px;line-height:1.7">${text}</span></div>`;
  } else if (b.type === 'quote') {
    wrap.innerHTML = `<div style="border-left:4px solid rgba(0,0,0,.2);
      padding-left:28px;margin:8px 0 32px">
      <p style="font-family:${T};font-size:${Math.max(40, fs + 12)}px;
        line-height:1.62;letter-spacing:.02em;margin:0">${text}</p></div>`;
  } else if (b.type === 'h') {
    wrap.innerHTML = `<h2 style="font-family:${T};font-weight:500;font-size:52px;
      letter-spacing:.03em;line-height:1.3;margin:0 0 30px">${text}</h2>`;
  } else {
    wrap.innerHTML = `<p style="font-family:${F};font-size:${fs}px;
      line-height:${lh};letter-spacing:${style.tracking || '.01em'};
      margin:0 0 ${gap}px;text-align:justify">${text}</p>`;
  }
  host.appendChild(wrap);
  const inner = wrap.firstElementChild;
  const cs = getComputedStyle(inner);
  const h = inner.getBoundingClientRect().height
    + (parseFloat(cs.marginTop) || 0) + (parseFloat(cs.marginBottom) || 0);
  host.removeChild(wrap);
  return h;
}

/* ── 3. 切分：超长单段按句读二分 ─────────────────────────────── */

const BREAKS = ['。', '！', '？', '；', '，', '、', ' '];

/** 在一个窗口内找最后一个句读位置，避免把词切开。 */
function lastBreak(s, from, to) {
  const win = s.slice(Math.max(0, from - 24), to);
  let at = -1;
  for (const b of BREAKS) at = Math.max(at, win.lastIndexOf(b));
  return at > 0 ? Math.max(0, from - 24) + at + 1 : -1;
}

/** 把超出 maxH 的单块切成多个能装下的块。 */
export function splitBlock(block, maxH, style, host) {
  const text = String(block.text || '');
  if (text.length < 2) return null;
  let lo = 1, hi = text.length - 1, best = 0;
  while (lo <= hi) {
    const mid = (lo + hi) >> 1;
    const h = measureBlock({ ...block, type: 'p', text: text.slice(0, mid) }, style, host);
    if (h === null) return null;             // 无 DOM → 交给字数包络
    if (h <= maxH) { best = mid; lo = mid + 1; } else hi = mid - 1;
  }
  if (best < 2) return null;
  const at = lastBreak(text, best, best);
  const cut = at > 0 ? at : best;
  return [
    { ...block, text: text.slice(0, cut) },
    { ...block, text: text.slice(cut) },
  ];
}

export function splitUntilFit(block, maxH, style, host) {
  const out = [];
  const queue = [block];
  let guard = 0;
  while (queue.length && guard++ < 80) {
    const b = queue.shift();
    const h = measureBlock(b, style, host);
    if (h === null) { out.push(b); continue; }
    if (h <= maxH) { out.push(b); continue; }
    const parts = splitBlock(b, maxH, style, host);
    if (!parts) { out.push(b); continue; }
    queue.unshift(...parts);
  }
  return out;
}

/* ── 4. 装箱 ─────────────────────────────────────────────────── */

/** 无 DOM 时的字数包络降级（保持与产品 §6 口径一致）。 */
function packByChars(blocks, maxH, style) {
  const perRow = style.charsPerRow || CHARS_PER_ROW;
  const maxRows = Math.max(1, Math.floor(maxH / ((style.bodySize || 32) * (style.lineHeight || 1.92))));
  const pages = [];
  let cur = [], rows = 0;
  for (const b of blocks) {
    if (b.type === 'break') { if (cur.length) { pages.push(cur); cur = []; rows = 0; } continue; }
    const r = Math.max(1, Math.ceil(String(b.text || '').length / perRow));
    if (cur.length && rows + r > maxRows) { pages.push(cur); cur = []; rows = 0; }
    cur.push(b); rows += r;
  }
  if (cur.length) pages.push(cur);
  return pages;
}

/** 按实测高度把块装进多页。 */
export function packBlocks(blocks, style, host) {
  const maxH = pageCapacity(style);
  const flat = [];
  for (const b of blocks) {
    if (b.type === 'break') { flat.push(b); continue; }
    const h = measureBlock(b, style, host);
    if (h !== null && h > maxH) flat.push(...splitUntilFit(b, maxH, style, host));
    else flat.push(b);
  }
  const dom = flat.some((b) => b.type !== 'break');
  if (!dom || typeof document === 'undefined') return packByChars(flat, maxH, style);

  const pages = [];
  let cur = [], h = 0;
  for (const b of flat) {
    if (b.type === 'break') { if (cur.length) { pages.push(cur); cur = []; h = 0; } continue; }
    const bh = measureBlock(b, style, host) || 0;
    if (cur.length && h + bh > maxH) { pages.push(cur); cur = []; h = 0; }
    cur.push(b); h += bh;
  }
  if (cur.length) pages.push(cur);
  return pages;
}

/* ── 5. 上限：先合并、后截断，但必须告知 ─────────────────────── */

/** 超上限时把相邻小页合并；合并不了才标记溢出（不静默丢内容）。 */
export function enforceMaxPages(pages, style, host) {
  const maxH = pageCapacity(style);
  const out = pages.slice();
  let guard = 0;
  while (out.length > MAX_PAGES && guard++ < 60) {
    let merged = false;
    for (let i = 0; i < out.length - 1; i++) {
      const a = out[i], b = out[i + 1];
      const total = (host && typeof document !== 'undefined')
        ? a.concat(b).reduce((n, x) => n + (measureBlock(x, style, host) || 0), 0)
        : Infinity;
      if (total <= maxH) { out.splice(i, 2, a.concat(b)); merged = true; break; }
    }
    if (!merged) break;
  }
  const truncated = out.slice(MAX_PAGES);
  return {
    pages: out.slice(0, MAX_PAGES),
    truncatedBlocks: truncated.flat(),
    truncatedChars: truncated.flat().reduce((n, b) => n + String(b.text || '').length, 0),
  };
}

/* ── 6. 主入口 + 角色标注 ────────────────────────────────────── */

/** 给每页标角色（封面 / 开篇 / 正文 / 清单 / 结尾），供渲染器选骨架。 */
function labelPages(pages) {
  return pages.map((blocks, i) => {
    let role = 'dense';
    if (i === 0) role = 'opening';
    if (i === pages.length - 1 && pages.length > 1) role = 'closing';
    if (blocks.some((b) => b.type === 'quote')) role = 'quote';
    if (blocks.filter((b) => b.type === 'li').length >= 3) role = 'points';
    return { index: i, role, blocks };
  });
}

/**
 * 任意长文 → 一整套页。
 * @returns { title, pages, totalChars, renderedChars, truncatedChars, missing, manualBreaks }
 */
export function paginate(raw, style, host) {
  const { title, blocks } = parseArticle(raw);
  const manualBreaks = blocks.filter((b) => b.type === 'break').length;
  const packed = packBlocks(blocks, style, host);
  const { pages: limited, truncatedBlocks, truncatedChars } = enforceMaxPages(packed, style, host);
  const pages = labelPages(limited);

  /* 零丢字自检：原文每个块文字必须能在某页找到（按原顺序拼接后比对） */
  const source = blocks.filter((b) => b.type !== 'break')
    .map((b) => String(b.text || '').replace(/\s+/g, ''))
    .join('');
  const rendered = pages.flatMap((p) => p.blocks)
    .map((b) => String(b.text || '').replace(/\s+/g, ''))
    .join('');
  const dropped = truncatedBlocks.map((b) => String(b.text || '').replace(/\s+/g, '')).join('');
  const expected = source.slice(0, source.length - dropped.length);

  return {
    title,
    pages: [{ index: -1, role: 'cover', blocks: [] }, ...pages],  // 封面 = 第 1 页
    totalChars: source.length,
    renderedChars: rendered.length,
    truncatedChars,
    missing: expected !== rendered ? (source.slice(rendered.length) || '(顺序不一致)') : '',
    manualBreaks,
  };
}

/** 把一页的块渲染成纯文本（供自检 / 导出 Markdown 用）。 */
export function pageText(page) {
  return page.blocks.map((b) => String(b.text || '')).join('\n');
}
