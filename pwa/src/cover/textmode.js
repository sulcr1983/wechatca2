/* 标题文字玩法（2026-10-25）
 *
 * 目的：原来只有「把 {{TITLE}} 原样填进去」一种排法，12 套模板之间只有配色差异，
 * 用户会觉得单调。这里在**不改模板结构**的前提下，对标题做 7 种排版/装饰处理。
 *
 * 设计原则：
 *   1. 纯 CSS + 少量逐字 span，不引入任何依赖，微信截图（rasterize）结果稳定
 *   2. 每种玩法只动「标题」，不碰正文引语/署名，避免破坏模板本身的信息层级
 *   3. 默认 'stack' 完全不干预 —— 保证既有模板渲染零变化（回归安全）
 *   4. 逐字类效果（彩虹/错位）用 display:inline-block，避免中文断行错乱
 */

/** 玩法目录（前端选单 + 测试断言共用同一份，避免漂移）。 */
export const TEXT_MODES = [
  { id: 'stack',    name: '默认',     desc: '沿用模板原本的标题排法' },
  { id: 'poster',   name: '大字压阵', desc: '标题放大到极限，视觉冲击强' },
  { id: 'vertical', name: '竖排',     desc: '自上而下竖排，中式古典感' },
  { id: 'offset',   name: '错位',     desc: '逐字高低错落，节奏跳脱' },
  { id: 'rainbow',  name: '逐字变色', desc: '同一标题每个字换一个色' },
  { id: 'outline',  name: '描边',     desc: '空心字，底色透出来' },
  { id: 'stagger',  name: '错行',     desc: '相邻行左右错开，呼吸感' },
];

/** 字体目录。id 与 @font-face 的 font-family 对应。
 *
 * optional: true 的字体**不在 cover-fonts.css 里**，只有用户选中时才注入
 * @font-face（绝对 URL，因为渲染 iframe 是 srcdoc、相对路径无效）。
 * 目的：得意黑 1.1MB，不能让所有用户进封面页就下载（2026-10-25）。
 */
export const TEXT_FONTS = [
  { id: 'auto',   name: '跟随模板', family: '',            desc: '用模板自带字体' },
  { id: 'sans',   name: '思源黑体', family: "'Noto Sans SC'",  desc: '中性现代，最百搭' },
  { id: 'serif',  name: '思源宋体', family: "'Noto Serif SC'", desc: '衬线，书卷气' },
  {
    id: 'smiley', name: '得意黑', family: "'Smiley Sans'",
    desc: '窄斜胶囊，小红书封面常用',
    optional: true,
    file: 'fonts/cover/smiley-sans-oblique.woff2',
    // ⚠️ 文件名叫 Oblique，字形**本身**就是斜的，但这里必须声明成 normal：
    //    @font-face 的 font-style 是「匹配条件」而不是「渲染变换」。
    //    声明 oblique 时，普通（font-style:normal）的文字匹配不到这个字体
    //    → 静默回退到系统字体，实测截图完全看不出得意黑（2026-10-25 踩过）。
    style: 'normal',
  },
];

const CHAR_SPAN_MODES = new Set(['offset', 'rainbow']);

function escHtml(s) {
  return String(s).replace(/[&<>"']/g, (c) => (
    { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]
  ));
}

/** 「错行」用：把标题按固定字数切成「行组」，偶数行由 CSS 右移。
 *
 * ⚠️ 2026-10-29 修：原来 stagger 的 CSS 依赖 `.tm-line` 子元素，
 *    但只有 offset/rainbow 才会把标题切成 span，stagger 模式不切 →
 *    选择器永远匹配不到 → 点了等于点「默认」（盘点时实测确认）。
 *    现在自己切组，效果就是字面意思：相邻行左右错开。 */
function wrapLineGroups(text, perLine = 5) {
  const chars = [...String(text)];
  const groups = [];
  for (let i = 0; i < chars.length; i += perLine) {
    groups.push(
      `<span class="tm-g" style="--tm-i:${groups.length}">` +
      `${escHtml(chars.slice(i, i + perLine).join(''))}</span>`,
    );
  }
  return groups.join('');
}

function toHex(n) {
  return Math.max(0, Math.min(255, Math.round(n))).toString(16).padStart(2, '0');
}

function rgbToHsl(r, g, b) {
  r /= 255; g /= 255; b /= 255;
  const max = Math.max(r, g, b); const min = Math.min(r, g, b);
  let h = 0; let s = 0;
  const l = (max + min) / 2;
  const d = max - min;
  if (d !== 0) {
    s = l > 0.5 ? d / (2 - max - min) : d / (max + min);
    if (max === r) h = ((g - b) / d) % 6;
    else if (max === g) h = (b - r) / d + 2;
    else h = (r - g) / d + 4;
    h *= 60;
    if (h < 0) h += 360;
  }
  return [h, s, l];
}

function hslToHex(h, s, l) {
  h = ((h % 360) + 360) % 360;
  const c = (1 - Math.abs(2 * l - 1)) * s;
  const x = c * (1 - Math.abs(((h / 60) % 2) - 1));
  const m = l - c / 2;
  let rgb;
  if (h < 60) rgb = [c, x, 0];
  else if (h < 120) rgb = [x, c, 0];
  else if (h < 180) rgb = [0, c, x];
  else if (h < 240) rgb = [0, x, c];
  else if (h < 300) rgb = [x, 0, c];
  else rgb = [c, 0, x];
  return '#' + rgb.map((v) => toHex((v + m) * 255)).join('');
}

/** 由模板强调色派生一组「同族但可区分」的逐字配色。 */
function rainbowPalette(accentHex, count) {
  const m = /^#?([0-9a-f]{6})$/i.exec(String(accentHex || '').trim());
  const base = m ? m[1] : '002FA7';
  const r = parseInt(base.slice(0, 2), 16);
  const g = parseInt(base.slice(2, 4), 16);
  const b = parseInt(base.slice(4, 6), 16);
  const [h0, s0, l0] = rgbToHsl(r, g, b);
  const step = 360 / Math.max(count, 1);
  const out = [];
  for (let i = 0; i < count; i += 1) {
    // 保持原色的饱和度/亮度区间，只旋转色相 → 不会出现脏色
    out.push(hslToHex(h0 + step * i, Math.min(1, Math.max(0.45, s0)), Math.min(0.72, Math.max(0.42, l0 + 0.18))));
  }
  return out;
}

/** 把纯文本标题转成逐字 span（保留换行）。 */
function wrapChars(text, accentHex) {
  const palette = rainbowPalette(accentHex, [...text].length || 1);
  let i = 0;
  const parts = [];
  for (const ch of text) {
    if (ch === '\n') { parts.push('<br>'); continue; }
    if (ch === ' ') { parts.push('<span class="tm-sp">&nbsp;</span>'); continue; }
    const color = palette[i] || palette[0];
    // --tm-i 供 CSS 做高低错落；style 里的 color 供逐字变色
    parts.push(`<span class="tm-ch" style="--tm-i:${i};color:${color}">${escHtml(ch)}</span>`);
    i += 1;
  }
  return parts.join('');
}

/** 每种玩法对应的 CSS。作用域限定 .tm-<mode>，互不干扰。 */
function modeCss(mode) {
  const head = `body.tm-${mode} :is(.h-display,.h-statement,.square-title,.wide-title)`;
  switch (mode) {
    case 'poster':
      return `${head}{letter-spacing:-.01em !important;line-height:.98 !important;font-weight:900 !important;}`;
    case 'vertical':
      return `${head}{writing-mode:vertical-rl !important;text-orientation:upright !important;line-height:1.15 !important;letter-spacing:.06em !important;max-height:78% !important;margin-left:auto !important;margin-right:auto !important;}`;
    case 'offset':
      return `body.tm-offset .tm-ch{display:inline-block;transform:translateY(calc((var(--tm-i) - 1) * 0.06em));}`;
    case 'rainbow':
      return `body.tm-rainbow .tm-ch{display:inline-block;}`;
    case 'outline':
      return `${head}{-webkit-text-stroke:2.5px currentColor !important;color:transparent !important;text-shadow:none !important;}`;
    case 'stagger':
      // 相邻「行组」左右错开（配合 wrapLineGroups 的 5 字一组断行）
      return 'body.tm-stagger .tm-g{display:block;}'
        + 'body.tm-stagger .tm-g:nth-child(even){margin-left:.72em;}';
    default:
      return '';
  }
}

/**
 * 对已注入文案的封面 HTML 施加「字体 + 文字玩法」。
 *
 * @param {string} html    prepareCoverHtml / buildGuizangHtml 的产物
 * @param {object} opt
 * @param {string} opt.mode      TEXT_MODES 的 id，默认 'stack'
 * @param {string} opt.font      TEXT_FONTS 的 id，默认 'auto'
 * @param {string} opt.title     原始标题（逐字类玩法需要重新切字）
 * @param {string} opt.baseUrl   封面资源根（用于可选字体的绝对 URL）
 * @returns {string} 处理后的 HTML
 */
export function applyTextStyle(html, { mode = 'stack', font = 'auto', title = '', baseUrl = '' } = {}) {
  if (!html) return html;
  const meta = TEXT_FONTS.find((f) => f.id === font);
  const family = meta && meta.family;

  // 可选字体：只有**真选中**才注入 @font-face → 浏览器这时才去下 1.1MB
  // （未选中时这个文件永远不会被请求，首屏零开销）
  let fontFace = '';
  if (meta && meta.optional && baseUrl) {
    const url = new URL(meta.file, baseUrl).href;
    fontFace = `@font-face{font-family:${family};font-style:${meta.style || 'normal'};`
      + `font-weight:400;font-display:swap;src:url("${url}") format('woff2');}`;
  }

  // 逐字类玩法：把已注入的纯文本标题替换成逐字 span
  if (CHAR_SPAN_MODES.has(mode) && title) {
    const accentHex = (/--accent:\s*(#[0-9a-fA-F]{6})/.exec(html) || [])[1] || '#002FA7';
    const wrapped = wrapChars(title, accentHex);
    // 只替换第一个标题元素的内容（模板里标题只出现一次）
    html = html.replace(
      /(<(?:h1)[^>]*class="[^"]*(?:h-display|h-statement|square-title|wide-title)[^"]*"[^>]*>)([\s\S]*?)(<\/h1>)/i,
      (m, open, _inner, close) => open + wrapped + close,
    );
  }

  // 「错行」：切成行组（和逐字类一样需要重建标题内容）
  if (mode === 'stagger' && title) {
    html = html.replace(
      /(<(?:h1)[^>]*class="[^"]*(?:h-display|h-statement|square-title|wide-title)[^"]*"[^>]*>)([\s\S]*?)(<\/h1>)/i,
      (m, open, _inner, close) => open + wrapLineGroups(title) + close,
    );
  }

  const css = [
    fontFace,
    mode !== 'stack' ? modeCss(mode) : '',
    family ? `body :is(.h-display,.h-statement,.square-title,.wide-title,.lead,.kicker,.t-cat,.t-meta,.issue-row,.chrome-min){font-family:${family} !important;}` : '',
  ].filter(Boolean).join('\n');

  if (css) {
    const styleTag = `<style data-textstyle="1">${css}</style>`;
    if (/<\/head>/i.test(html)) html = html.replace(/<\/head>/i, `${styleTag}</head>`);
    else html = styleTag + html;
  }

  // body 加 mode class（部分玩法靠它选作用域）
  if (mode !== 'stack') {
    html = html.replace(/<body([^>]*)>/i, (m, attrs) => {
      if (/class="/i.test(attrs)) {
        return `<body${attrs.replace(/class="([^"]*)"/i, (mm, cls) => `class="${cls} tm-${mode}"`)}>`;
      }
      return `<body${attrs} class="tm-${mode}">`;
    });
  }
  return html;
}
