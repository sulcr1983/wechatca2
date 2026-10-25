/* 封面 HTML 构建：2 套归藏（3 尺寸）+ 10 套模板（3:4）共用同一套注入逻辑。
 *
 * 设计约束：
 * - 所有字体走本地子集（fonts/cover-fonts.css），不出现 Google Fonts；
 * - 标题用 fitty 自适应（vendor/fitty.min.js，MIT），避免长标题出框；
 * - 底图由调用方传 data URL；没有底图时移除 <img>/overlay，直接用模板纸色；
 * - 有底图时统一注入白字 + 阴影，无底图时保留模板原文字色（构建时已移除 WCAG 强制白字段）。
 */

import { COVER_SIZES } from './catalog.js';

const GZ_COLORS = {
  editorial: { paper: '#0d0c0b', ink: '#e8dcc8', muted: '#6b6560', accent: '#c4956a', bg: '#141210' },
  swiss: { paper: '#0a0a0a', ink: '#f5f5f5', muted: '#737373', accent: '#3b82f6', bg: '#111111' },
};

const GZ_FONTS = {
  editorial: {
    family: "'Noto Serif SC', 'Songti SC', Georgia, serif",
    titleSize: 96, titleWeight: 500, titleLine: 1.1,
    bodySize: 28, bodyLine: 1.55, metaSize: 20, metaLetter: '.22em',
  },
  swiss: {
    family: "'Noto Sans SC', 'PingFang SC', system-ui, sans-serif",
    titleSize: 104, titleWeight: 700, titleLine: 1.05,
    bodySize: 32, bodyLine: 1.45, metaSize: 22, metaLetter: '.15em',
  },
};

function esc(s) {
  return String(s == null ? '' : s)
    .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;').replace(/'/g, '&#39;');
}

const OVERRIDE_CSS = `
/* 本地渲染覆盖 */
*,*::before,*::after { box-sizing: border-box; }
html, body { margin: 0; padding: 0; }
body.has-img .kicker, body.has-img .h-display, body.has-img .h-sub,
body.has-img .lead, body.has-img .issue-row, body.has-img .issue-strip span,
body.has-img .h-statement, body.has-img .t-meta, body.has-img .t-cat,
body.has-img .square-title, body.has-img .wide-title {
  color: rgba(255,255,255,.95) !important;
  text-shadow: 0 2px 8px rgba(0,0,0,.35);
}
body.has-img .h-sub, body.has-img .lead { color: rgba(255,255,255,.86) !important; }

/* 无底图（纯色纸底）：模板原本靠底图撑满画布，改为内容垂直居中 */
body:not(.has-img) .inner-content,
body:not(.has-img) .content { min-height: 100%; }
body:not(.has-img) .inner-content,
body:not(.has-img) .content { justify-content: center; }
body:not(.has-img) .grow { display: none !important; }

/* ── 纯色模式补底色（2026-10-25 修）─────────────────────────────
   10 套模板原本全部靠 cover-img（真实照片）撑满画布，并且文字是白色
   （只有 body.has-img 时才会变白，靠深色遮罩保证可读）。
   纯色模式下底图被移除 → 只剩 .inner-content 的 rgba(0,0,0,.08) 淡灰，
   10 套模板看起来**完全一样**（都是灰白板），用户以为「点了没反应」。

   修法：无底图时用模板自己的 --accent（克莱因蓝/柠檬绿/柠檬黄/安全橙…）
   做整版底色，文字转为 --paper（浅色），标题用 --accent-on。
   这样每套模板的配色差异立刻可见，且不依赖任何图片。 */
body:not(.has-img) .poster {
  background: var(--accent) !important;
}
body:not(.has-img) .inner-content {
  background: transparent !important;
  border-radius: 0;
}
/* 文字：亮底 → 用浅色字（accent-on）；同时去掉底图模式的白色规则
   ⚠️ editorial 系列模板没有定义 --accent-on，而它们的 --accent 是深色
   （#111 墨黑 / #2e6b4f 森林绿 / #315d93 靛蓝），必须用白字。
   这里用 --accent-on 优先、缺失时回落 #fff，覆盖两类模板。 */
body:not(.has-img) .h-display,
body:not(.has-img) .h-statement,
body:not(.has-img) .square-title,
body:not(.has-img) .wide-title,
body:not(.has-img) .lead,
body:not(.has-img) .kicker,
body:not(.has-img) .t-cat,
body:not(.has-img) .t-meta,
body:not(.has-img) .issue-row,
body:not(.has-img) .chrome-min,
body:not(.has-img) .chrome-min span {
  color: var(--accent-on, var(--cover-ink, #ffffff)) !important;
  text-shadow: none !important;
}
body:not(.has-img) .hr-accent {
  background: var(--cover-ink, #ffffff) !important;
  opacity: .7;
}
/* 模板里的装饰网格/点阵在纯色底上会脏，去掉 */
body:not(.has-img) .dot-mat { display: none !important; }
`;

function fitScript() {
  return `
<script>
(function () {
  function fit() {
    var poster = document.querySelector('.poster');
    var H = poster ? poster.clientHeight : window.innerHeight;
    var sel = '.h-display,.h-statement,.square-title,.wide-title';
    var els = [].slice.call(document.querySelectorAll(sel));
    els.forEach(function (el) {
      if (!el.dataset.fitMax) {
        el.dataset.fitMax = String(parseFloat(getComputedStyle(el).fontSize) || 96);
      }
      var max = parseFloat(el.dataset.fitMax) || 96;
      var min = 32;
      // 标题最多占封面高度的 55%（横版 66% 给两栏里的标题更多余量）
      var maxH = H * (el.classList.contains('wide-title') ? 0.66 : 0.55);
      el.style.overflowWrap = 'anywhere';
      el.style.wordBreak = 'break-word';
      el.style.flexShrink = '0';
      var size = max;
      el.style.fontSize = size + 'px';
      var guard = 0;
      while (size > min && el.getBoundingClientRect().height > maxH && guard++ < 100) {
        size -= 2;
        el.style.fontSize = size + 'px';
      }
    });
    window.__fitDone = true;
    requestAnimationFrame(function () { window.__coverReady = true; });
  }
  function boot() {
    if (document.fonts && document.fonts.ready) {
      document.fonts.ready.then(function () { setTimeout(fit, 60); });
    } else {
      setTimeout(fit, 60);
    }
  }
  if (document.readyState === 'complete') boot();
  else window.addEventListener('load', boot);
})();
</script>`;
}

/** 按底色亮度选文字色（2026-10-25）。
 *
 * 模板的 --accent 亮度差异很大：克莱因蓝 #002FA7（暗）要用白字，
 * 柠檬黄 #FFD500（很亮）要用黑字，午夜墨金 #d4a04a（中等亮度）白字对比度不足。
 * 用 WCAG 相对亮度公式判断，保证每套模板的文字都可读。
 */
function inkForAccent(hex) {
  const m = /^#?([0-9a-f]{6})$/i.exec((hex || '').trim());
  if (!m) return '#ffffff';
  const n = parseInt(m[1], 16);
  const toLin = (c) => {
    const s = c / 255;
    return s <= 0.04045 ? s / 12.92 : Math.pow((s + 0.055) / 1.055, 2.4);
  };
  const r = toLin((n >> 16) & 255);
  const g = toLin((n >> 8) & 255);
  const b = toLin(n & 255);
  const L = 0.2126 * r + 0.7152 * g + 0.0722 * b;   // 0=黑 1=白
  return L > 0.42 ? '#0a0a0a' : '#ffffff';
}

function applyImage(html, image) {
  const imgRe = /<img[^>]*class="[^"]*\bcover-img\b[^"]*"[^>]*>/i;
  const overlayRe = /<div[^>]*class="[^"]*\bimg-overlay\b[^"]*"[^>]*>\s*<\/div>/i;
  if (image) {
    if (imgRe.test(html)) {
      html = html.replace(imgRe, (m) => m
        .replace(/\ssrc="[^"]*"/i, '')
        .replace(/\s*\/?>$/, ` src="${image}">`));
    } else {
      html = html.replace(/(<section[^>]*class="[^"]*\bposter\b[^"]*"[^>]*>)/i,
        `$1<img class="cover-img" src="${image}" alt="">`);
    }
    html = html.replace(/<body([^>]*)>/i, (m, attrs) => {
      const clean = attrs.replace(/\s*class="[^"]*"/i, '');
      return `<body${clean} class="has-img">`;
    });
  } else {
    html = html.replace(imgRe, '');
    html = html.replace(overlayRe, '');
  }
  return html;
}

/** 把占位符、底图、字体、fitty 注入到任意封面 HTML。 */
export function prepareCoverHtml(html, { title, lead, author, image, baseUrl }) {
  const now = new Date();
  const date = `${now.getFullYear()}.${String(now.getMonth() + 1).padStart(2, '0')}`;

  /* ⚠️ 2026-10-25 修的隐藏 bug：
     原来「先替换占位符、再删空标签」——
       .replace(/\{\{AUTHOR\}\}/g, '') 先把 {{AUTHOR}} 变成空串，
       随后 /<span>\s*\{\{AUTHOR\}\}\s*<\/span>/ 永远匹配不到 → 死代码。
     结果：没填署名时，封面上会残留「· 小红书」「/ 」这种孤儿分隔符。
     正确顺序：**先按 data-author 标记删掉整个元素，再替换占位符**。 */
  const dropIfEmpty = (flag, on) => {
    if (on) return;
    // 匹配带 data-author 的任意简单元素并整块删除（模板里都是单层叶子元素）
    html = html.replace(/<(\w+)[^>]*\bdata-author\b[^>]*>[\s\S]*?<\/\1>/gi, '');
  };
  dropIfEmpty('author', String(author || '').trim());

  html = html.replace(/\{\{TITLE\}\}/g, esc(title))
    .replace(/\{\{LEAD\}\}/g, esc(lead))
    .replace(/\{\{AUTHOR\}\}/g, esc(author))
    .replace(/\{\{DATE\}\}/g, date);
  // lead 为空时删掉空段落（这条原本就是对的：它匹配的是「替换后变成空」的 <p class="lead">）
  if (!lead) html = html.replace(/<p[^>]*class="[^"]*\blead\b[^"]*"[^>]*>\s*<\/p>/gi, '');
  html = applyImage(html, image);
  // 纯色模式：按模板自己的 --accent 亮度算出可读的字色，注入 --cover-ink 变量
  // （OVERRIDE_CSS 里用它；模板自带 --accent-on 时以模板为准，见 CSS 的回落链）
  const accentHex = (/--accent:\s*(#[0-9a-fA-F]{6})/.exec(html) || [])[1] || '';
  const inkColor = inkForAccent(accentHex);
  const head = `<link rel="stylesheet" href="${baseUrl}fonts/cover-fonts.css">`
    + `<style>:root{--cover-ink:${inkColor}}</style><style>${OVERRIDE_CSS}</style>`;
  if (/<\/head>/i.test(html)) html = html.replace(/<\/head>/i, `${head}</head>`);
  else html = head + html;
  if (/<\/body>/i.test(html)) html = html.replace(/<\/body>/i, `${fitScript()}</body>`);
  else html += fitScript();
  return html;
}

/** 归藏两套：按尺寸生成单张海报。 */
export function buildGuizangHtml({ style, size, title, lead, author, image, baseUrl }) {
  const c = GZ_COLORS[style] || GZ_COLORS.editorial;
  const f = GZ_FONTS[style] || GZ_FONTS.editorial;
  const dim = COVER_SIZES[size] || COVER_SIZES.xhs;
  const date = new Date().toISOString().slice(0, 7).replace('-', '.');
  const isWide = size === 'wide';
  const isSquare = size === 'square';

  const layoutCss = isWide ? `
    .poster { width: ${dim.w}px; height: ${dim.h}px; }
    .content { padding: 80px 120px; }
    .wide-layout { display:grid; grid-template-columns:1fr 1fr; gap:80px; height:100%; align-items:center; }
    .wide-title { font-size:96px; line-height:1.1; font-weight:${f.titleWeight}; letter-spacing:.03em; margin:0 0 24px; }
    .wide-img { width:100%; height:100%; object-fit:cover; border-radius:4px; }
    .lead { max-width: 720px; }
  ` : isSquare ? `
    .poster { width: ${dim.w}px; height: ${dim.h}px; }
    .content { padding:88px; justify-content:center; align-items:center; text-align:center; }
    .square-title { font-size:88px; line-height:1.15; font-weight:${f.titleWeight}; letter-spacing:.04em; margin:0 0 24px; }
    .lead { max-width: 760px; }
    .issue-row { justify-content:center; margin-bottom:32px; }
  ` : `
    .poster { width: ${dim.w}px; height: ${dim.h}px; }
    .content { justify-content:flex-end; padding:96px 88px; }
    .h-display { font-size:${f.titleSize}px; line-height:${f.titleLine}; font-weight:${f.titleWeight}; letter-spacing:.04em; margin:0 0 20px; }
  `;

  const imageHtml = image ? `<img class="cover-img" src="{{IMAGE}}" alt=""><div class="img-overlay"></div>` : '';
  const overlayCss = isSquare
    ? 'background: radial-gradient(72% 60% at 50% 50%, rgba(10,10,11,.30) 0%, rgba(10,10,11,0) 100%);'
    : isWide
      ? 'background: linear-gradient(90deg, rgba(10,10,11,.30) 0%, rgba(10,10,11,0) 60%);'
      : 'background: linear-gradient(180deg, rgba(10,10,11,0) 50%, rgba(10,10,11,.30) 100%);';

  // 署名（2026-10-25 新增）：归藏两套原来完全没有署名字段，用户填了也不显示。
  // 空署名时不渲染，避免留下孤儿分隔符。
  const hasAuthor = String(author || '').trim().length > 0;
  const authorLine = (extra = '') => (hasAuthor
    ? `<p class="gz-author" style="font-family:monospace;font-size:${f.metaSize}px;`
      + `letter-spacing:${f.metaLetter};color:rgba(255,255,255,.72);margin:18px 0 0;${extra}">`
      + `By ${esc(author)}</p>`
    : '');

  const body = isWide ? `
    <div class="wide-layout">
      <div>
        <p class="kicker" style="font-size:21px;letter-spacing:.22em;color:${c.accent};margin:0 0 24px;">封面 · Cover</p>
        <h1 class="wide-title">{{TITLE}}</h1>
        <p class="lead" style="font-size:${f.bodySize}px;line-height:${f.bodyLine};color:rgba(255,255,255,.85);margin:0;">{{LEAD}}</p>
        ${authorLine()}
      </div>
      ${image ? '<div><img class="wide-img" src="{{IMAGE}}" alt=""></div>' : ''}
    </div>` : isSquare ? `
    <div class="issue-row" style="font-family:monospace;font-size:${f.metaSize}px;letter-spacing:${f.metaLetter};color:rgba(255,255,255,.75);">Vol. 01 · ${date}</div>
    <h1 class="square-title">{{TITLE}}</h1>
    <p class="lead" style="font-size:${f.bodySize}px;line-height:${f.bodyLine};color:rgba(255,255,255,.85);margin:0;">{{LEAD}}</p>
    ${authorLine()}` : `
    <div class="issue-row" style="font-family:monospace;font-size:${f.metaSize}px;letter-spacing:${f.metaLetter};color:rgba(255,255,255,.75);">Vol. 01 <span class="dot" style="display:inline-block;width:5px;height:5px;border-radius:50%;background:rgba(255,255,255,.4);margin:0 12px;"></span> ${date}</div>
    <div style="margin-top:40px;">
      <p class="kicker" style="font-family:monospace;font-size:21px;letter-spacing:.22em;color:rgba(255,255,255,.85);margin:0 0 24px;">封面 · Cover</p>
      <h1 class="h-display">{{TITLE}}</h1>
      <div style="width:48px;height:3px;background:${c.accent};margin-bottom:20px;opacity:.8;"></div>
      <p class="lead" style="font-size:${f.bodySize}px;line-height:${f.bodyLine};color:rgba(255,255,255,.85);margin:0;max-width:640px;">{{LEAD}}</p>
      ${authorLine()}
    </div>`;

  const html = `<!doctype html>
<html lang="zh-CN"><head><meta charset="utf-8"><title>封面</title>
<style>
  *{box-sizing:border-box} html,body{margin:0;padding:0}
  body{background:${c.bg};font-family:${f.family};-webkit-font-smoothing:antialiased}
  .poster{position:relative;overflow:hidden;isolation:isolate;background:${c.paper};color:${c.ink}}
  .poster .content{position:relative;z-index:2;height:100%;display:flex;flex-direction:column}
  .poster .cover-img{position:absolute;inset:0;width:100%;height:100%;object-fit:cover;z-index:0}
  .poster .img-overlay{position:absolute;inset:0;z-index:1;pointer-events:none;${overlayCss}}
  .poster .grain{position:absolute;inset:0;z-index:3;pointer-events:none;opacity:.30;
    background-image:radial-gradient(rgba(255,255,255,.06) 1px, transparent 1px);background-size:3px 3px}
  ${layoutCss}
</style></head>
<body><section class="poster ${size}" id="xhs-cover">
  ${imageHtml}
  <div class="grain"></div>
  <div class="content">${body}</div>
</section></body></html>`;

  return prepareCoverHtml(html, { title, lead, author, image, baseUrl });
}

/** 10 套模板：原始 HTML 已由构建脚本清洗（去 Google Fonts / 去强制白字段 / 底图占位）。 */
export function prepareTemplateHtml(rawHtml, { title, lead, author, image, baseUrl }) {
  return prepareCoverHtml(rawHtml, { title, lead, author, image, baseUrl });
}
