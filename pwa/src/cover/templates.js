/* 封面 HTML 构建：2 套归藏（3 尺寸）+ 10 套模板（3:4）共用同一套注入逻辑。
 *
 * 设计约束：
 * - 所有字体走本地子集（fonts/cover-fonts.css），不出现 Google Fonts；
 * - 标题用 fitty 自适应（vendor/fitty.min.js，MIT），避免长标题出框；
 * - 底图由调用方传 data URL；没有底图时移除 <img>/overlay，直接用模板纸色；
 * - 有底图时统一注入白字 + 阴影，无底图时保留模板原文字色（构建时已移除 WCAG 强制白字段）。
 */

import { COVER_SIZES } from './catalog.js';

/* 归藏设计系统（2026-10-25 按 references/theme-presets.md 原始规范校正）
 *
 * ⚠️ 之前这里两套都是**深色底**，与归藏原文完全不符：
 *    - Editorial 原文是「暖纸浅色」(#f3f0e8 纸 + #0a0a0b 墨)，
 *      深色只有一个特例 Midnight Ink，且明确「不得自创第二个深色」
 *    - Swiss 原文是「白纸」(#fafaf8 纸 + #002FA7 克莱因蓝强调)
 *    用户看到黑底直呼「人家原来不是这样子的」—— 确实是抄错了。
 *
 * 取值逐项对照 references/theme-presets.md：
 *   Editorial 默认盘（第一套）/ Swiss IKB Blue
 */
const GZ_COLORS = {
  editorial: {
    paper: '#f3f0e8',        // --paper
    paper2: '#ebe6da',       // --paper-2（内层纸/卡片）
    ink: '#0a0a0b',          // --ink
    muted: '#68625a',        // --muted
    accent: '#111111',       // --accent
    accentSoft: '#d8d2c6',   // --accent-soft
    bg: '#e7e2d6',           // 画布外底色（比纸略深，让海报有边）
  },
  swiss: {
    paper: '#fafaf8',        // --paper
    ink: '#0a0a0a',          // --ink
    muted: '#737373',        // --grey-3
    accent: '#002FA7',       // --accent（IKB 蓝）
    accentOn: '#ffffff',     // --accent-on
    bg: '#ececea',
  },
  /* 纯文字大字版（2026-10-28，ROAD-1）
     定位：**不用底图**也能出封面 —— 用户痛点「搜不到合适的图，封面就废了」。
     视觉上刻意与「午夜墨金」（深底+金）和「Swiss」（细体大字）都拉开：
     亮纸 + 极重黑体 + 一点橙红，靠字号对比撑住画面。 */
  bigtype: {
    paper: '#fbfaf7',
    paper2: '#f2efe8',
    ink: '#0b0b0c',
    muted: '#6b6660',
    accent: '#ff3b1f',
    accentOn: '#ffffff',
    accentSoft: '#ffd9d2',
    bg: '#efeee9',
  },
};

/* 字体系统（对照 references/style-system.md 的排版规范）
 * Editorial：标题 weight 500 + 宽字距（+.03~.04em），正文用宋体 ——
 *            原文明确「700~900 粗题 + 无衬线正文 + 负字距」是反面教材
 * Swiss：    「大字号要细」主标题 weight 200-400，小字反而更粗
 */
const GZ_FONTS = {
  editorial: {
    family: "'Noto Serif SC', 'Songti SC', Georgia, serif",
    titleSize: 96, titleWeight: 500, titleLine: 1.12, titleTracking: '.04em',
    bodySize: 28, bodyLine: 1.65, metaSize: 20, metaLetter: '.22em',
  },
  swiss: {
    family: "'Noto Sans SC', 'PingFang SC', system-ui, sans-serif",
    titleSize: 104, titleWeight: 300, titleLine: 1.06, titleTracking: '-.01em',
    bodySize: 30, bodyLine: 1.5, metaSize: 22, metaLetter: '.15em',
  },
  /* 大字版：字号给到 148、字重 800、行高 1.0、负字距 ——
     与 Swiss 的「大字号要细」相反，这里就是要有重量感。
     溢出交给 fitty（下方 sel 已包含 .h-display）。 */
  bigtype: {
    family: "'Noto Sans SC', 'PingFang SC', system-ui, sans-serif",
    titleSize: 148, titleWeight: 800, titleLine: 1.0, titleTracking: '-.03em',
    bodySize: 26, bodyLine: 1.6, metaSize: 18, metaLetter: '.2em',
  },
};

function esc(s) {
  return String(s == null ? '' : s)
    .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;').replace(/'/g, '&#39;');
}

/* ── 底图可读性：文字位置 + 自动字色（2026-10-30）──────────────────────
 *
 * 此前有底图时一律「文字贴底 + 白字 + 全画布深遮罩」。
 * 实测 7 张真实图，白字压在最亮区只有 1.08–1.99:1（下限 4.5）；
 * 遮罩加到 50% 也只 2.51:1，要到 4.5 得 80%，照片就成灰板了。
 *
 * 现在按 analyze.js 的实测结果：
 *   - 文字块按 bandTop 定位（跟着图里最安静的那条带走，不再死钉底部）
 *   - 字色按实测亮度自动黑白（不再固定白字）
 *   - 只有 worstContrast 不达标时才补局部渐变（峰值 ≤0.30，spec §6.3 Step 3）
 *
 * 传 analysis=null 时返回空串 → 完全退回原来的行为（回归安全）。
 */
function readableCss(analysis, textPos) {
  if (!analysis) return '';
  const ink = analysis.ink === '#141110' ? '#141110' : '#ffffff';
  const isDark = ink === '#ffffff';
  // 投影方向跟着字色走：白字用黑投影，黑字用白投影
  const shadow = isDark ? 'rgba(0,0,0,.45)' : 'rgba(255,255,255,.55)';

  // 文字位置：auto = 用分析出的 bandTop；三档微调则覆盖
  const POS = { top: 0.22, center: 0.42, bottom: 0.62 };
  const top = textPos && textPos !== 'auto'
    ? (POS[textPos] ?? analysis.bandTop)
    : analysis.bandTop;

  // 局部渐变：只在需要时加，只盖文字带，峰值受规范约束
  const tint = analysis.needsTint
    ? `background:linear-gradient(180deg,rgba(10,10,11,0) ${Math.max(0, Math.round(top * 100 - 12))}%,`
      + `rgba(10,10,11,${(analysis.tintPeak * 0.5).toFixed(2)}) ${Math.round(top * 100 + 10)}%,`
      + `rgba(10,10,11,${analysis.tintPeak.toFixed(2)}) 100%);`
    : '';

  return `
  /* 底图可读性（analyze.js 实测：${(analysis.worstContrast || 0).toFixed(2)}:1）*/
  body.has-img .cover-img { object-position: center ${Math.round(top * 100)}%; }
  /* 定位用绝对定位，不用 padding-top 百分比：
     模板的 .inner-content 自带 padding: 96px 88px（短属性），
     padding-top: X% 的百分比按「父元素宽度」算，实测三档都停在 96px 没动。
     改成 top + transform 之后，三档真的分开了。 */
  body.has-img .content { justify-content: flex-start !important; }
  body.has-img .inner-content {
    position: absolute !important;
    left: 0; right: 0;
    top: ${Math.round(top * 100)}% !important;
    padding: 0 88px 96px !important;
    justify-content: flex-start !important;
  }
  ${tint ? `.img-overlay{${tint}}` : '.img-overlay{background:none !important;}'}
  body.has-img .kicker, body.has-img .h-display, body.has-img .h-sub,
  body.has-img .lead, body.has-img .issue-row, body.has-img .issue-strip span,
  body.has-img .h-statement, body.has-img .t-meta, body.has-img .t-cat,
  body.has-img .square-title, body.has-img .wide-title,
  body.has-img .h-sub, body.has-img .lead {
    color: ${ink} !important;
    text-shadow: 0 2px 10px ${shadow}, 0 1px 3px ${shadow} !important;
  }
  `;
}

/** 文字区磨砂（可选，默认关）：只模糊文字所在带，不糊整张图。
 *  对纯风景有用；对有人物的图会把脸糊掉，所以默认关、由用户手动开。 */
function frostedCss(frosted, top) {
  if (!frosted) return '';
  const start = Math.max(0, Math.round(top * 100 - 8));
  return `
  body.has-img .cover-img {
    filter: none;
  }
  .cv-frost {
    position: absolute; left: 0; right: 0;
    top: ${start}%; bottom: 0; z-index: 1; pointer-events: none;
    backdrop-filter: blur(14px) saturate(.92);
    -webkit-backdrop-filter: blur(14px) saturate(.92);
    mask-image: linear-gradient(180deg, transparent 0%, #000 22%, #000 100%);
    -webkit-mask-image: linear-gradient(180deg, transparent 0%, #000 22%, #000 100%);
  }
  `;
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

/* 无底图（纯色纸底）：模板原本靠底图撑满画布，改为内容垂直居中。
   ⚠️ 全部加 :not(.gz) —— 归藏两套（body.gz）自带完整排版与浅色纸底，
   若被这些规则命中会被强制成白字/居中，浅底直接看不见（2026-10-25 修）。 */
body:not(.has-img):not(.gz) .inner-content,
body:not(.has-img):not(.gz) .content { min-height: 100%; }
body:not(.has-img):not(.gz) .inner-content,
body:not(.has-img):not(.gz) .content { justify-content: center; }
body:not(.has-img):not(.gz) .grow { display: none !important; }

/* ── 纯色模式补底色（2026-10-25 修）─────────────────────────────
   10 套模板原本全部靠 cover-img（真实照片）撑满画布，并且文字是白色
   （只有 body.has-img 时才会变白，靠深色遮罩保证可读）。
   纯色模式下底图被移除 → 只剩 .inner-content 的 rgba(0,0,0,.08) 淡灰，
   10 套模板看起来**完全一样**（都是灰白板），用户以为「点了没反应」。

   修法（2026-10-25 二次校正）：无底图时用模板的 **--paper 做纸底 + --ink 做墨字**，
   强调色只留在模板原有的细节元素（.hr-accent 短横线等）里。
   之前一版是「整版刷成 --accent」—— 能区分但违反规范：
   theme-presets.md 明确「accent 克制使用，最多一个强调卡片」，
   整版铺主色不是归藏的设计语言。 */
body:not(.has-img):not(.gz) .poster {
  background: var(--paper) !important;
}
body:not(.has-img):not(.gz) .inner-content {
  background: transparent !important;
  border-radius: 0;
}
/* 文字：亮底 → 用浅色字（accent-on）；同时去掉底图模式的白色规则
   ⚠️ editorial 系列模板没有定义 --accent-on，而它们的 --accent 是深色
   （#111 墨黑 / #2e6b4f 森林绿 / #315d93 靛蓝），必须用白字。
   这里用 --accent-on 优先、缺失时回落 #fff，覆盖两类模板。 */
body:not(.has-img):not(.gz) .h-display,
body:not(.has-img):not(.gz) .h-statement,
body:not(.has-img):not(.gz) .square-title,
body:not(.has-img):not(.gz) .wide-title,
body:not(.has-img):not(.gz) .lead,
body:not(.has-img):not(.gz) .kicker,
body:not(.has-img):not(.gz) .t-cat,
body:not(.has-img):not(.gz) .t-meta,
body:not(.has-img):not(.gz) .issue-row,
body:not(.has-img):not(.gz) .chrome-min,
body:not(.has-img):not(.gz) .chrome-min span {
  color: var(--ink, var(--cover-ink, #111111)) !important;
  text-shadow: none !important;
}
/* 强调色块（2026-10-25 二次修）：
   规范里 4 套 Swiss 共用同一个纸色 #fafaf8，只靠强调色区分 ——
   但纯色模式下强调色原本只出现在一条 96px 短横线上，
   克莱因蓝/柠檬绿/柠檬黄/安全橙 四套**看起来完全一样**（用户最早抱怨的「都一样」）。
   规范允许「每张最多一个强调色块（accent card）」，所以把 kicker 标签
   （「封面 · Cover」）做成强调色填充块 —— 既是瑞士设计的常见手法，
   又让 4 套一眼可分，且不违反「accent 克制使用」。 */
body:not(.has-img):not(.gz) .t-cat,
body:not(.has-img):not(.gz) .kicker {
  background: var(--accent) !important;
  color: var(--accent-on, #ffffff) !important;
  padding: 5px 12px !important;
  border-radius: 2px !important;
  display: inline-block !important;
  text-shadow: none !important;
}

/* 强调线保持模板原样（用 --accent） */
body:not(.has-img):not(.gz) .hr-accent {
  background: var(--accent) !important;
  opacity: 1;
}
/* 模板里的装饰网格/点阵在纯色底上会脏，去掉 */
body:not(.has-img):not(.gz) .dot-mat { display: none !important; }
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
      // 「大字压阵」玩法（2026-10-29 修）：原来 poster 只改字重字距、没有放大，
      // 与名字不符。这里给它 84% 的高度预算 —— fitty 会把字号停在更大的值上。
      var posterMode = !!(document.body && document.body.classList.contains('tm-poster'));
      var ratio = el.classList.contains('wide-title') ? 0.66 : (posterMode ? 0.84 : 0.55);
      var maxH = H * ratio;
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
      // ⚠️ 重建 class 时要保留原有标记（gz = 归藏，走自己的排版），
      //    否则有底图时归藏会被模板规则接管（2026-10-25）
      const keep = (attrs.match(/class="([^"]*)"/i) || [, ''])[1]
        .split(/\s+/).filter((c) => c && c !== 'has-img');
      const cls = ['has-img', ...keep].join(' ').trim();
      const clean = attrs.replace(/\s*class="[^"]*"/i, '');
      return `<body${clean} class="${cls}">`;
    });
  } else {
    html = html.replace(imgRe, '');
    html = html.replace(overlayRe, '');
  }
  return html;
}

/** 把占位符、底图、字体、fitty 注入到任意封面 HTML。 */
export function prepareCoverHtml(html, { title, lead, author, image, baseUrl, analysis, textPos, frosted }) {
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
  // 底图可读性（2026-10-30）：只有真的选了底图才注入；analysis 为空时是空串，行为不变
  const readable = image ? readableCss(analysis, textPos) : '';
  const frostCss = image ? frostedCss(frosted, analysis ? analysis.bandTop : 0.6) : '';
  const frostEl = (image && frosted) ? '<div class="cv-frost"></div>' : '';
  const head = `<link rel="stylesheet" href="${baseUrl}fonts/cover-fonts.css">`
    + `<style>:root{--cover-ink:${inkColor}}</style><style>${OVERRIDE_CSS}${readable}${frostCss}</style>`;
  if (/<\/head>/i.test(html)) html = html.replace(/<\/head>/i, `${head}</head>`);
  else html = head + html;
  if (frostEl) {
    // 磨砂层要压在底图之上、文字之下
    html = html.replace(/(<section[^>]*class="[^"]*\bposter\b[^"]*"[^>]*>)/i, `$1${frostEl}`);
  }
  if (/<\/body>/i.test(html)) html = html.replace(/<\/body>/i, `${fitScript()}</body>`);
  else html += fitScript();
  return html;
}

/** 归藏两套：按尺寸生成单张海报。 */
export function buildGuizangHtml({ style, size, title, lead, author, image, baseUrl, analysis, textPos, frosted }) {
  const c = GZ_COLORS[style] || GZ_COLORS.editorial;
  const f = GZ_FONTS[style] || GZ_FONTS.editorial;
  const dim = COVER_SIZES[size] || COVER_SIZES.xhs;
  const date = new Date().toISOString().slice(0, 7).replace('-', '.');
  const isWide = size === 'wide';
  const isSquare = size === 'square';
  // 大字版（2026-10-28）：不用底图 + 垂直居中 + 强调色块压题，跟编辑风拉开距离
  const isBig = style === 'bigtype';

  const layoutCss = isWide ? `
    .poster { width: ${dim.w}px; height: ${dim.h}px; }
    .content { padding: 80px 120px; }
    .wide-layout { display:grid; grid-template-columns:1fr 1fr; gap:80px; height:100%; align-items:center; }
    .wide-title { font-size:96px; line-height:1.1; font-weight:${f.titleWeight}; letter-spacing:${f.titleTracking || '.03em'}; margin:0 0 24px; }
    .wide-img { width:100%; height:100%; object-fit:cover; border-radius:4px; }
    .lead { max-width: 720px; }
  ` : isSquare ? `
    .poster { width: ${dim.w}px; height: ${dim.h}px; }
    .content { padding:88px; justify-content:center; align-items:center; text-align:center; }
    .square-title { font-size:88px; line-height:1.15; font-weight:${f.titleWeight}; letter-spacing:${f.titleTracking || '.04em'}; margin:0 0 24px; }
    .lead { max-width: 760px; }
    .issue-row { justify-content:center; margin-bottom:32px; }
  ` : `
    .poster { width: ${dim.w}px; height: ${dim.h}px; }
    .content { justify-content:${isBig ? 'center' : 'flex-end'}; padding:96px 88px; }
    .h-display { font-size:${f.titleSize}px; line-height:${f.titleLine}; font-weight:${f.titleWeight}; letter-spacing:${f.titleTracking || '.04em'}; margin:0 0 20px; }
  `;

  // 大字版**强制不铺底图**：选了图也不铺 —— 它的卖点就是「纯文字、永不图文不符」。
  const useImg = style === 'bigtype' ? '' : image;
  const imageHtml = useImg ? `<img class="cover-img" src="{{IMAGE}}" alt=""><div class="img-overlay"></div>` : '';
  /* 遮罩（2026-10-30 改）：此前是无条件深遮罩。现在按 analyze.js 的实测结果：
     · 文字带最亮区够读（worstContrast ≥ 4.5）→ 完全不遮，照片保持原样
     · 不够 → 只盖文字带，峰值 ≤0.30（spec §6.3 Step 3）
     没有 analysis 时（老调用路径）退回原来的写法，行为不变。 */
  let overlayCss;
  if (useImg && analysis) {
    const top = textPos && textPos !== 'auto'
      ? ({ top: 0.22, center: 0.42, bottom: 0.62 }[textPos] ?? analysis.bandTop)
      : analysis.bandTop;
    overlayCss = analysis.needsTint
      ? `background: linear-gradient(180deg, rgba(10,10,11,0) ${Math.max(0, Math.round(top * 100 - 12))}%,`
        + ` rgba(10,10,11,${(analysis.tintPeak * 0.5).toFixed(2)}) ${Math.round(top * 100 + 10)}%,`
        + ` rgba(10,10,11,${analysis.tintPeak.toFixed(2)}) 100%);`
      : 'background: none;';
  } else {
    overlayCss = isSquare
      ? 'background: radial-gradient(72% 60% at 50% 50%, rgba(10,10,11,.30) 0%, rgba(10,10,11,0) 100%);'
      : isWide
        ? 'background: linear-gradient(90deg, rgba(10,10,11,.30) 0%, rgba(10,10,11,0) 60%);'
        : 'background: linear-gradient(180deg, rgba(10,10,11,0) 50%, rgba(10,10,11,.30) 100%);';
  }

  // 署名（2026-10-25 新增）：归藏两套原来完全没有署名字段，用户填了也不显示。
  // 空署名时不渲染，避免留下孤儿分隔符。
  const hasAuthor = String(author || '').trim().length > 0;
  const authorLine = (extra = '') => (hasAuthor
    ? `<p class="gz-author" style="font-family:monospace;font-size:${f.metaSize}px;`
      + `letter-spacing:${f.metaLetter};color:${c.muted};margin:18px 0 0;${extra}">`
      + `By ${esc(author)}</p>`
    : '');

  /* 3:4 两种排法：默认贴底（编辑风）／大字版居中压色块。
     ⚠️ 这里刻意**不用嵌套模板**：${cond ? `A` : `B`} 这种写法在部分 Chromium
     上会让整个模块解析失败（实测报 "Unexpected identifier 'html'"），
     先算好字符串再插入最稳，也更好读。 */
  const xhsNormal = `
    <div class="issue-row" style="font-family:monospace;font-size:${f.metaSize}px;letter-spacing:${f.metaLetter};color:${c.muted};">Vol. 01 <span class="dot" style="display:inline-block;width:5px;height:5px;border-radius:50%;background:${c.muted};margin:0 12px;"></span> ${date}</div>
    <div style="margin-top:40px;">
      <p class="kicker" style="font-family:monospace;font-size:21px;letter-spacing:.22em;color:${c.ink};margin:0 0 24px;">封面 · Cover</p>
      <h1 class="h-display">{{TITLE}}</h1>
      <div style="width:48px;height:3px;background:${c.accent};margin-bottom:20px;opacity:.8;"></div>
      <p class="lead" style="font-size:${f.bodySize}px;line-height:${f.bodyLine};color:${c.ink};margin:0;max-width:640px;">{{LEAD}}</p>
      ${authorLine()}
    </div>`;

  const xhsBig = `
    <div class="issue-row" style="font-family:monospace;font-size:${f.metaSize}px;letter-spacing:${f.metaLetter};color:${c.muted};">Vol. 01 <span class="dot" style="display:inline-block;width:5px;height:5px;border-radius:50%;background:${c.muted};margin:0 12px;"></span> ${date}</div>
    <div style="margin:auto 0;">
      <div style="width:104px;height:14px;background:${c.accent};margin:0 0 40px;"></div>
      <h1 class="h-display">{{TITLE}}</h1>
      <p class="lead" style="font-size:${f.bodySize}px;line-height:${f.bodyLine};color:${c.ink};margin:28px 0 0;max-width:660px;">{{LEAD}}</p>
      ${authorLine()}
    </div>
    <div style="width:100%;height:1px;background:${c.accent};opacity:.35;margin-top:40px;"></div>`;

  const body = isWide ? `
    <div class="wide-layout">
      <div>
        <p class="kicker" style="font-size:21px;letter-spacing:.22em;color:${c.accent};margin:0 0 24px;">封面 · Cover</p>
        <h1 class="wide-title">{{TITLE}}</h1>
        <p class="lead" style="font-size:${f.bodySize}px;line-height:${f.bodyLine};color:${c.ink};margin:0;">{{LEAD}}</p>
        ${authorLine()}
      </div>
      ${useImg ? '<div><img class="wide-img" src="{{IMAGE}}" alt=""></div>' : ''}
    </div>` : isSquare ? `
    <div class="issue-row" style="font-family:monospace;font-size:${f.metaSize}px;letter-spacing:${f.metaLetter};color:${c.muted};">Vol. 01 · ${date}</div>
    <h1 class="square-title">{{TITLE}}</h1>
    <p class="lead" style="font-size:${f.bodySize}px;line-height:${f.bodyLine};color:${c.ink};margin:0;">{{LEAD}}</p>
    ${authorLine()}` : (isBig ? xhsBig : xhsNormal);

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
    background-image:radial-gradient(rgba(0,0,0,.05) 1px, transparent 1px);background-size:3px 3px}
  ${layoutCss}
</style></head>
<body class="gz"><section class="poster ${size}" id="xhs-cover">
  ${imageHtml}
  <div class="grain"></div>
  <div class="content">${body}</div>
</section></body></html>`;

  return prepareCoverHtml(html, {
    title, lead, author, image: useImg, baseUrl,
    // 归藏自己也生成了一套 overlayCss，这里传 analysis 让 readableCss 补上字色；
    // 但 overlay 已被本函数处理过，为避免叠加两层遮罩，readableCss 里对 .img-overlay 的
    // 覆盖只在 needsTint 时生效 —— 见 readableCss 的注释。
    analysis: useImg ? analysis : null,
    textPos,
    frosted,
  });
}

/** 10 套模板：原始 HTML 已由构建脚本清洗（去 Google Fonts / 去强制白字段 / 底图占位）。 */
export function prepareTemplateHtml(rawHtml, { title, lead, author, image, baseUrl, analysis, textPos, frosted }) {
  return prepareCoverHtml(rawHtml, { title, lead, author, image, baseUrl, analysis, textPos, frosted });
}
