/* 轻量即时预览 —— 不依赖 Pyodide。
 *
 * 为什么：首访要下约 5MB 运行时（实测 22 秒才「精确就绪」），不能让用户干等。
 * 这里用 12KB 的 marked 先出一版「结构近似」的排版，精确结果到了再原地替换。
 *
 * 一致性护栏：近似版**不解锁「复制」**，避免把近似结果粘进公众号。
 * 只追求「看着像」，不追求逐字节一致——精确永远由 Python 引擎说了算。
 */

// 主题 styles 的 key → CSS 选择器（只覆盖预览需要的标签）
const KEY_TAG = {
  h1: 'h1', h2: 'h2', h3: 'h3', h4: 'h4', h5: 'h5', h6: 'h6',
  p: 'p', strong: 'strong', em: 'em', a: 'a',
  blockquote: 'blockquote', blockquote_p: 'blockquote p',
  code: 'code', code_block: 'pre', pre: 'pre', pre_code: 'pre code',
  hr: 'hr', table: 'table', th: 'th', td: 'td', tr: 'tr',
  img: 'img', ul: 'ul', ol: 'ol', li: 'li',
  list_item: 'li', list_item_row: 'li',
};

export function isAvailable() {
  return !!(window.marked && typeof window.marked.parse === 'function');
}

function decl(obj) {
  if (!obj || typeof obj !== 'object') return '';
  return Object.entries(obj)
    .filter(([, v]) => v != null && v !== '')
    .map(([k, v]) => `${k.replace(/_/g, '-')}:${v}`)
    .join(';');
}

function cssFromStyles(styles) {
  const st = styles || {};
  let out = '';
  const body = decl(st.wrapper);
  if (body) out += `body{${body}}\n`;
  for (const [key, sel] of Object.entries(KEY_TAG)) {
    const d = decl(st[key]);
    if (d) out += `${sel}{${d}}\n`;
  }
  return out;
}

/** 极简预处理：只做「一眼能看出结构」的几条（完整的在 Python 引擎里） */
function miniPre(raw) {
  const lines = String(raw).split(/\r?\n/);
  const out = [];
  let inFence = false;
  let firstDone = false;

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    if (/^\s*(```|~~~)/.test(line)) {
      inFence = !inFence;
      out.push(line);
      continue;
    }
    if (inFence) { out.push(line); continue; }

    const t = line.trim();
    if (!t) { out.push(''); continue; }

    // 已经是 Markdown 结构的行，原样保留
    if (/^#{1,6}\s/.test(t) || /^[-*+]\s/.test(t) || /^\d+[.)]\s/.test(t)
        || /^>/.test(t) || /^\|/.test(t) || /^:::/.test(t)) {
      out.push(line);
      firstDone = true;
      continue;
    }

    const prevEmpty = i === 0 || !lines[i - 1].trim();
    const nextEmpty = i === lines.length - 1 || !lines[i + 1].trim();
    const looksTitle = t.length <= 24 && !/[。！？；，、]$/.test(t) && !/[：:]/.test(t);

    // 第一行像标题 → 大标题
    if (!firstDone && prevEmpty && looksTitle) {
      out.push('# ' + t);
      firstDone = true;
      continue;
    }
    // 孤立短行 → 小节
    if (prevEmpty && nextEmpty && looksTitle) {
      out.push('## ' + t);
      firstDone = true;
      continue;
    }

    out.push(line);
    firstDone = true;
  }
  return out.join('\n');
}

/**
 * 渲染近似预览。
 * @param {string} raw 用户原始文本
 * @param {{styles?: object}} theme 主题 JSON（含 styles）
 * @returns {string} 完整 HTML（可直接写进 iframe）
 */
export function renderLight(raw, theme) {
  if (!isAvailable()) return '';
  let body = '';
  try {
    body = window.marked.parse(miniPre(raw), { breaks: true, gfm: true, async: false });
  } catch (e) {
    body = '<p>' + String(raw).replace(/[<>&]/g, (c) => ({ '<': '&lt;', '>': '&gt;', '&': '&amp;' }[c])) + '</p>';
  }
  const css = cssFromStyles(theme && theme.styles);
  return '<!DOCTYPE html><html><head><meta charset="utf-8"><style>'
    + 'html,body{margin:0}'
    + 'body{word-break:break-word;overflow-wrap:anywhere}'
    + 'img{max-width:100%;height:auto}'
    + 'table{border-collapse:collapse;width:100%}'
    + 'pre{overflow:auto}'
    + css
    + '</style></head><body>' + body + '</body></html>';
}
