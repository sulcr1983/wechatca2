/* 标题图 V3 · 结构型版式（2026-11-06，用户拍板方向 D「新增结构型版式，拉开差异」）
 *
 * 为什么单独一组：现有 50 套虽然骨架不同，但**排版语法是同一套** ——
 * 实测统计：全部 50 套里 float / shape-outside / column-count 使用次数为 0，
 * 清一色是「grid/flex 切块 + 文字堆在块里」。真正拉开差异的是**文字与图的
 * 空间关系**，不是再换一个色块位置。
 *
 * 本组用到的排版能力（已实测在本项目的 DOM→PNG 管线可用）：
 *   · float:left/right + 文字环绕 —— 图文互嵌（真杂志做法）
 *   · column-count —— 多栏正文（报纸/期刊正文流）
 *   · 负 margin 出血 + 跨栏标题 —— 打破单一网格
 *
 * 约束与其它模板组相同：标题 .h-display、字号 __HSIZE__ 占位、占位符走
 * prepareCoverHtml 协议、尺寸走 design-tokens。
 */

import { tokens } from './design-tokens.js';

const esc = (s) => String(s == null ? '' : s)
  .replace(/&/g, '&amp;').replace(/</g, '&lt;')
  .replace(/>/g, '&gt;').replace(/"/g, '&quot;');

/** 引语切条目（多栏正文用）。 */
function itemsOf(lead, max = 6) {
  const parts = String(lead || '')
    .split(/[·、／/｜|，,；;。]+/).map((s) => s.trim()).filter((s) => s.length >= 2);
  return parts.length ? parts.slice(0, max) : [String(lead || '').trim()].filter(Boolean);
}

/** 结构型版式的共用外壳（纸底 + 设计令牌）。 */
function shell(pal, dim, body, extraCss = '') {
  const t = tokens(dim);
  return `<!doctype html><html lang="zh-CN"><head><meta charset="utf-8"><style>
  *{box-sizing:border-box} html,body{margin:0;padding:0}
  .poster{position:relative;width:${dim.w}px;height:${dim.h}px;overflow:hidden;isolation:isolate;
    background:${pal.paper};color:${pal.ink};
    font-family:'Noto Sans SC','PingFang SC',system-ui,sans-serif}
  .wrap{position:relative;z-index:2;height:100%;display:flex;flex-direction:column;
    padding:${t.padY}px ${t.padX}px}
  .h-display{margin:0;font-size:__HSIZE__px;line-height:1.08;font-weight:800;
    letter-spacing:-.02em;text-wrap:balance}
  .foot{margin-top:auto;padding-top:${t.meta}px;
    border-top:1px solid rgba(128,128,128,.3);
    display:flex;justify-content:space-between;align-items:baseline;
    font:400 ${t.meta}px/1 ui-monospace,Menlo,monospace;letter-spacing:.24em;color:${pal.muted}}
  ${extraCss}
  </style></head><body class="gz">
  <section class="poster"><div class="wrap v3-body">${body}</div></section></body></html>`;
}

/* ── 1. 图文互嵌：文字真的绕到图片周围（float + shape-outside）─────────
 * 这是 50 套里**完全没有**的排版语法。图片浮在左/右，正文环绕它流动，
 * 图片下方文字自动恢复全宽 —— 真杂志的核心手法。 */
export function tplTextWrap(pal, dim, hasImage) {
  const t = tokens(dim);
  const imgW = Math.round(dim.w * (t.isWide ? 0.3 : 0.42));
  /* 图片高度按**画布高**取，不再按图片宽度算比例（2026-11-06）：
     原来 imgW*0.82 在 3:4 下只有 372px，绕图区只占上半页、下方一大片空白。
     改成占画布高 ~38%，绕图区自然撑开。 */
  const imgH = Math.round(dim.h * (t.isWide ? 0.5 : 0.38));
  /* 无底图时不放灰框：改用一个撞色块 + 大编号，保持「图文互嵌」的版面关系。 */
  /* ⚠️ 必须同时带 cover-img 类：applyImage 只给 `.cover-img` 注入底图 src，
     只写 fw-img 会得到一张破图（实测截图确认）。
     同时 templates.js 的全局规则要用 :not(.fw-img) 排除它，
     否则 `position:absolute !important` 会顶掉 float，绕图直接失效。 */
  const media = hasImage
    ? `<img class="cover-img fw-img" src="" alt="">`
    : `<div class="fw-img fw-solid"><span>NO IMAGE</span></div>`;
  return shell(pal, dim, `
    <span class="kick">TEXT · AROUND · IMAGE</span>
    <h1 class="h-display">{{TITLE}}</h1>
    <div class="flow">
      ${media}
      <div class="filler" data-lead-list></div>
    </div>
    <div class="foot"><span data-author>{{AUTHOR}}</span><span>{{DATE}}</span></div>`, `
  .wrap{padding:${t.padY}px ${t.padX}px}
  .kick{display:block;font:700 ${t.kicker}px/1 ui-monospace,Menlo,monospace;
    letter-spacing:.32em;color:${pal.accent};margin-bottom:${Math.round(t.padY * 0.4)}px}
  .h-display{margin-bottom:${Math.round(t.padY * 0.45)}px}
  .flow{flex:1;min-height:0}
  /* ⚠️ float 是关键：图片脱离文档流，后续文字环绕它。
     shape-outside 用矩形近似（实测在本项目管线可用）。 */
  .fw-img{float:left;width:${imgW}px;height:${imgH}px;object-fit:cover;
    margin:0 ${Math.round(t.gap * 2.4)}px ${Math.round(t.gap * 1.6)}px 0;
    shape-outside:margin-box}
  .fw-solid{background:${pal.accent};display:flex;align-items:flex-end;
    padding:${Math.round(t.gap * 1.6)}px}
  .fw-solid span{font:800 ${t.micro}px/1 ui-monospace,Menlo,monospace;
    letter-spacing:.24em;color:${pal.accentOn};opacity:.7}
  .lead{margin:0;font-size:var(--fs-lead,${t.lead}px);line-height:1.75;color:${pal.ink}}
  /* ⚠️ 条目用 --fs-lead 而不是 --fs-body（2026-11-06）：
     封面文案通常只有 3–5 条，用 26px 排完只占上半页、下方一大片空白
     （截图确认）。封面设计里「内容少就大字」是常规做法，
     也贴合用户「标题图主打文字」的诉求。 */
  .filler{margin-top:${Math.round(t.gap * 2)}px;
    font-size:var(--fs-lead,${t.lead}px);line-height:1.85;color:${pal.muted}}
  .filler p{margin:0 0 ${Math.round(t.gap * 2.2)}px}
  .filler p:last-child{margin-bottom:0}`);
}

/* ── 2. 多栏正文：标题跨栏 + 正文 2–3 栏流动 ─────────────────────────
 * 报纸/期刊的做法。50 套里没有一套用 column-count。 */
export function tplMultiColumn(pal, dim, hasImage) {
  const t = tokens(dim);
  /* 栏数按**版面容量**定，不按条目数：模板函数只拿到 pal/dim/hasImage，
     拿不到条目内容（条目在 buildV3Html 里才切分）。
     ⚠️ 2026-11-06 实测：21:9 用 4 栏时，4 条内容被切成「每栏 1 行」，
     正文区只有 32px 高（画布 3.6%），整版几乎全是留白 —— 是退化不是留白。
     横幅的横向空间虽然大，但**条目数少时栏数必须跟着少**，
     否则每栏只剩一行、栏分隔线反而把版面切碎。宽版用 2 栏。 */
  const cols = 2;
  return shell(pal, dim, `
    <div class="head">
      <span class="kicker">FEATURE STORY</span>
      <span class="issue">{{DATE}}</span>
    </div>
    <h1 class="h-display">{{TITLE}}</h1>
    <div class="rule"></div>
    <div class="colswrap"><div class="cols" data-lead-list></div></div>
    ${hasImage ? '<div class="band"><img class="cover-img" src="" alt=""></div>' : ''}
    <div class="foot"><span data-author>{{AUTHOR}}</span><span>SUPERSU</span></div>`, `
  .wrap{padding:${t.padY}px ${t.padX}px}
  .head{display:flex;justify-content:space-between;align-items:baseline;
    border-bottom:2px solid ${pal.ink};padding-bottom:${Math.round(t.gap * 1.2)}px}
  .kicker{font:700 ${t.kicker}px/1 ui-monospace,Menlo,monospace;
    letter-spacing:.3em;color:${pal.accent}}
  .issue{font:400 ${t.meta}px/1 ui-monospace,Menlo,monospace;
    letter-spacing:.2em;color:${pal.muted}}
  .h-display{margin:${Math.round(t.padY * 0.5)}px 0 0}
  .rule{height:${t.rule}px;background:${pal.accent};
    margin:${Math.round(t.padY * 0.4)}px 0 ${Math.round(t.padY * 0.5)}px;width:72px}
  /* ⚠️ column-count 是多栏正文的核心：文字按栏流动，不是手动切 div。
     colswrap 负责「占满剩余高度」，.cols 负责分栏 —— 两层分工，
     因为 column-count 容器自己撑不开高度（内容少时不会填满）。
     ⚠️ 2026-11-06 实测：4 条内容只占 514–631，页脚在 1315 —— 中间空了 684px
     （画布的 47%），全堆在顶部、下面一整片空白。柱状多栏天生适合长内容，
     短内容时靠 justify-content:center 把空白**上下均分**，视觉才成立。 */
  .colswrap{flex:1;min-height:0;display:flex;flex-direction:column;justify-content:center}
  .cols{flex:0 1 auto;min-height:0;column-count:${cols};column-gap:${Math.round(t.gap * 3)}px;
    column-rule:1px solid rgba(128,128,128,.28);
    font-size:var(--fs-lead,${t.lead}px);line-height:1.8;color:${pal.ink}}
  .cols p{margin:0 0 ${Math.round(t.gap * 1.3)}px;break-inside:avoid}
  /* 首字下沉：用真实 span（见 v3-templates.js 的 flFirst），不用 ::first-letter。
     modern-screenshot 不渲染该伪元素 → 预览放大、导出 PNG 却是正常字号。 */
  .cols .fl{font-size:2.4em;font-weight:800;float:left;
    line-height:.86;margin:2px 6px 0 0;color:${pal.accent}}
  /* 有底图时的通栏图带（2026-11-06）：多栏正文只有 4 条时会空掉下半页，
     用一条横向图带补上版面重量，也让底图真的被用上。
     ⚠️ 必须 position:relative 自成定位上下文，否则 templates.js 里那条
     body.has-img .cover-img{position:absolute;inset:0} 会把它铺满整张画布。 */
  .band{position:relative;overflow:hidden;flex:0 0 ${Math.round(dim.h * 0.26)}px;
    margin:${Math.round(t.gap * 2)}px 0 ${Math.round(t.gap * 1.6)}px}
  .band .cover-img{position:absolute;inset:0;width:100%;height:100%;object-fit:cover}`);
}

/* ── 3. 出血跨栏：大图出血到版心外 + 标题压在图与纸的交界 ───────────── */
export function tplBleedOverlap(pal, dim, hasImage) {
  const t = tokens(dim);
  const media = hasImage
    ? '<img class="cover-img bleed-img" src="" alt="">'
    : '<div class="bleed-img bleed-solid"></div>';
  return shell(pal, dim, `
    ${media}
    <div class="content">
      <span class="kicker">${esc('OVER THE BLEED')}</span>
      <h1 class="h-display">{{TITLE}}</h1>
      <p class="lead">{{LEAD}}</p>
      <div class="foot"><span data-author>{{AUTHOR}}</span><span>{{DATE}}</span></div>
    </div>`, `
  .poster{background:${pal.paper}}
  .wrap{padding:0}
  /* 出血：图片突破版心，左右贴边、上不贴边（留一条纸让标题压上去） */
  .bleed-img{position:absolute;left:0;right:0;top:${Math.round(dim.h * 0.08)}px;
    height:${Math.round(dim.h * 0.52)}px;width:100%;object-fit:cover;z-index:0}
  .bleed-solid{background:${pal.ink}}
  .content{position:relative;z-index:2;flex:1;display:flex;flex-direction:column;
    padding:${t.padY}px ${t.padX}px}
  .kicker{font:700 ${t.kicker}px/1 ui-monospace,Menlo,monospace;
    letter-spacing:.32em;color:${pal.accent};margin-bottom:auto}
  /* 标题压在「图与纸」的交界：一半在纸上、一半在图上看不见 → 加纸底块 */
  .h-display{margin-top:auto;margin-bottom:${Math.round(t.gap * 2)}px;
    background:${pal.paper};padding:${Math.round(t.gap * 1.4)}px
    ${Math.round(t.gap * 1.8)}px;align-self:flex-start;max-width:92%;
    box-shadow:0 0 0 ${Math.round(t.gap * 1.4)}px ${pal.paper}}
  .lead{margin:0;font-size:var(--fs-lead,${t.lead}px);line-height:1.7;
    color:${pal.muted};max-width:78%}
  .foot{margin-top:${Math.round(t.padY * 0.5)}px;border-color:rgba(128,128,128,.3)}`);
}

/* ── 4. 光谱渐变字：标题用 background-clip:text 上渐变 ─────────────────
 * 语法背景：background-clip:text 在 53 套里使用次数为 **0**。
 * 导出实测（2026-11-06 对照实验）：文字区饱和度 96/255，PNG 里保留了渐变；
 * 而 clip-path 在同批实验里 LOST（底行比顶行还宽），所以不用 clip-path。
 *
 * ⚠️ 2026-11-06 二次修正「名不副实」：第一版渐变是
 *    accent → ink → accent → muted，实测四个色标的色相是 **17° / 40° / 17° / 41°**，
 *    全挤在棕橙色系里 —— 那是「暖调渐变」，不叫光谱。
 *    现在真正按色相轮转派生（见 spectrumStops），亮底压低明度、暗底抬高明度，
 *    保证无论纸色深浅，字都落在可读区间。
 *
 * ⚠️ 有底图时必须退化成实心字：本语法靠 color:transparent，
 *    而可读性门禁会跳过 alpha < 0.15 的文字元素 —— 有图时若仍用渐变，
 *    门禁会「跳过而不检查」，等于给了一个假绿灯，字烂在照片上也测不出来。 */

/** RGB → HSL（0-360, 0-1, 0-1）。本地实现而非复用 textmode.js：
 *  那里的 hslToHex 是模块私有、未导出；为它加 export 会扩大改动面，
 *  按最小改动原则在本文件内自带一份，仅服务渐变派生。 */
function rgbToHsl(r, g, b) {
  const rr = r / 255; const gg = g / 255; const bb = b / 255;
  const mx = Math.max(rr, gg, bb); const mn = Math.min(rr, gg, bb);
  const l = (mx + mn) / 2;
  if (mx === mn) return [0, 0, l];
  const d = mx - mn;
  const s = l > 0.5 ? d / (2 - mx - mn) : d / (mx + mn);
  let h;
  if (mx === rr) h = ((gg - bb) / d + (gg < bb ? 6 : 0));
  else if (mx === gg) h = (bb - rr) / d + 2;
  else h = (rr - gg) / d + 4;
  return [h * 60, s, l];
}

function hslToHex(h, s, l) {
  const hh = ((h % 360) + 360) % 360;
  const c = (1 - Math.abs(2 * l - 1)) * s;
  const x = c * (1 - Math.abs(((hh / 60) % 2) - 1));
  const m = l - c / 2;
  let rgb;
  if (hh < 60) rgb = [c, x, 0];
  else if (hh < 120) rgb = [x, c, 0];
  else if (hh < 180) rgb = [0, c, x];
  else if (hh < 240) rgb = [0, x, c];
  else if (hh < 300) rgb = [x, 0, c];
  else rgb = [c, 0, x];
  const toHex = (v) => Math.max(0, Math.min(255, Math.round(v * 255)))
    .toString(16).padStart(2, '0');
  return '#' + rgb.map((v) => toHex(v + m)).join('');
}

/** 由强调色派生真正跨色相的渐变停靠点。
 *
 *  @param {string} accentHex 基色
 *  @param {boolean} dark    纸底是否深色
 *  @returns {string[]} 4 个十六进制色（沿色轮每段 +72°，共跨 216°）
 *
 *  为什么跨度是 216° 而不是整圈：整圈会首尾同色，读起来像「绕回去了」；
 *  216° = 3 段 × 72°，从基色走到「对侧偏暖」的位置，色相差异足够明显
 *  又不会出现首尾撞色。
 *  明度取值：**按实测对比度反推，不凭感觉配**。
 *    标题的最小可读门槛是 WCAG 3.0，而渐变的亮端最难达标 ——
 *    第一版用 [0.34,0.42,0.48,0.52]（亮底），实测：
 *      paper 最差 1.97、bold 最差 1.52，都低于 3.0 → 亮端在浅纸上糊掉。
 *    扫了一组明度数组后选定 [0.24,0.27,0.30,0.34]：
 *      paper 最差 4.63、bold 最差 3.82，均达标且留余量。
 *    暗底反向：用 [0.88,0.82,0.78,0.74] 提亮，ink 最差 7.07。
 *    色相跨度仍是 216°，视觉上的「光谱」不因压暗自损。 */
function spectrumStops(accentHex, dark) {
  const m = /^#?([0-9a-f]{6})$/i.exec(String(accentHex || '').trim());
  const base = m ? m[1] : 'b4552f';
  const [h0, s0] = rgbToHsl(
    parseInt(base.slice(0, 2), 16),
    parseInt(base.slice(2, 4), 16),
    parseInt(base.slice(4, 6), 16),
  );
  /* 饱和度保底 0.55：低饱和色标在渐变里会发灰，看起来像脏了 */
  const sat = Math.max(0.55, Math.min(0.9, s0));
  const light = dark ? [0.88, 0.82, 0.78, 0.74] : [0.24, 0.27, 0.30, 0.34];
  return light.map((l, i) => hslToHex(h0 + 72 * i, sat, l));
}

/* ── 对比度工具：把任意色压到「对给定底色可读」为止 ───────────────────
 *
 * 为什么需要：描边大字用的是模板 accent 直接当描边色，而 accent 是给
 * **色块/强调线**设计的，不代表压在纸底上作**文字**可读。
 * 实测（2026-11-06，从真实渲染产物采样）：
 *   paper 描边 #b4552f on #efe1d3 = 3.82  ✓
 *   ink   描边 #d8a24a on #231e15 = 7.25  ✓
 *   bold  描边 #ff3b1f on #ffe6dc = 2.99  ✗ 差 0.01（亮橙红压近白纸天生不足）
 * 手调某个色值不可持续（每加一套色板就要重调），所以按对比度反推。 */

function hexToRgb(hex) {
  const m = /^#?([0-9a-f]{6})$/i.exec(String(hex || '').trim());
  if (!m) return [0, 0, 0];
  const s = m[1];
  return [parseInt(s.slice(0, 2), 16), parseInt(s.slice(2, 4), 16), parseInt(s.slice(4, 6), 16)];
}

function relLuminance([r, g, b]) {
  const f = (c) => {
    const v = c / 255;
    return v <= 0.03928 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4;
  };
  return 0.2126 * f(r) + 0.7152 * f(g) + 0.0722 * f(b);
}

function contrastRatio(a, b) {
  const la = relLuminance(a);
  const lb = relLuminance(b);
  const hi = Math.max(la, lb);
  const lo = Math.min(la, lb);
  return (hi + 0.05) / (lo + 0.05);
}

/** 返回一个与 bgHex 对比度 >= min 的颜色：保持色相/饱和度，只调明度。
 *  底色偏亮 → 往暗压；底色偏暗 → 往亮提。找不到（极端情况）就返回纯黑/纯白。 */
function readableAgainst(hex, bgHex, min = 3.0) {
  const bg = hexToRgb(bgHex);
  if (contrastRatio(hexToRgb(hex), bg) >= min) return hex;
  const [h, s, l0] = rgbToHsl(...hexToRgb(hex));
  const bgLum = relLuminance(bg);
  const goDark = bgLum > 0.35;
  const sat = Math.max(0.45, s);
  const step = 0.02;
  let l = l0;
  for (let i = 0; i < 60; i += 1) {
    l += goDark ? -step : step;
    if (l <= 0.02 || l >= 0.98) break;
    const cand = hslToHex(h, sat, l);
    if (contrastRatio(hexToRgb(cand), bg) >= min) return cand;
  }
  return goDark ? '#000000' : '#ffffff';
}

export function tplGradientTitle(pal, dim, hasImage) {
  const t = tokens(dim);
  const stops = spectrumStops(pal.accent, !!pal.dark);
  const grad = hasImage
    ? `color:#fff`
    : `color:transparent;-webkit-background-clip:text;background-clip:text;
       background-image:linear-gradient(96deg,${stops[0]} 0%,${stops[1]} 34%,
       ${stops[2]} 68%,${stops[3]} 100%)`;
  return shell(pal, dim, `
    <div class="top"><span class="kick">SPECTRUM</span><span class="issue">{{DATE}}</span></div>
    <div class="stage">
      <h1 class="h-display grad">{{TITLE}}</h1>
      <div class="filler" data-lead-list></div>
    </div>
    <div class="foot"><span data-author>{{AUTHOR}}</span><span class="pn">{{DATE}}</span></div>`, `
  .wrap{padding:${t.padY}px ${t.padX}px}
  .top{display:flex;justify-content:space-between;align-items:baseline;
    padding-bottom:${Math.round(t.gap * 1.3)}px;border-bottom:1px solid rgba(128,128,128,.28)}
  .kick{font:700 ${t.kicker}px/1 ui-monospace,Menlo,monospace;
    letter-spacing:.34em;color:${pal.accent}}
  .issue{font:400 ${t.meta}px/1 ui-monospace,Menlo,monospace;
    letter-spacing:.2em;color:${pal.muted}}
  /* ⚠️ 2026-11-06 实测修正：原来 justify-content:center 让标题+正文作为一个整体
     居中，实测标题 443–706、正文到 992、页脚 1315 → 底部单边空 323px（22% 画布）。
     居中只把空白摊到上下，但内容本身仍是一小块。改为 space-between：
     标题靠上、正文靠下，空白**转成标题与正文之间的呼吸** —— 这是编辑设计里
     有意的留白，而不是「内容没排满」的空洞。 */
  .stage{flex:1;min-height:0;display:flex;flex-direction:column;
    justify-content:space-between;
    padding:${Math.round(t.padY * 0.55)}px 0 ${Math.round(t.padY * 0.35)}px}
  .h-display{${grad};line-height:1.06;letter-spacing:-.025em}
  .filler{font-size:var(--fs-lead,${t.lead}px);line-height:1.85;color:${pal.muted}}
  .filler p{margin:0 0 ${Math.round(t.gap * 2.2)}px;padding-left:${Math.round(t.gap * 2.6)}px;
    border-left:${t.rule}px solid ${pal.accent}}
  .filler p:last-child{margin-bottom:0}
  .foot{margin-top:auto;padding-top:${t.meta}px;border-top:1px solid rgba(128,128,128,.3);
    display:flex;justify-content:space-between;align-items:baseline;
    font:400 ${t.meta}px/1 ui-monospace,Menlo,monospace;letter-spacing:.24em;color:${pal.muted}}
  .pn{opacity:.75}`);
}

/* ── 5. 栏间通栏：正文分栏流动，标题用 column-span:all 横跨所有栏 ──────
 * 与 X2「多栏正文」的区别：X2 是标题在上、正文整体分栏；
 * 本套是**多栏正文中途插入通栏刊头**，栏流从标题下方继续 ——
 * 真报纸/期刊的排版手法。column-span:all 在 53 套里使用次数为 0。
 * 导出实测：标题墨迹宽度占画布 81%（若语法丢失会被关在 1/3 栏内）。 */
export function tplSpanColumn(pal, dim, hasImage) {
  const t = tokens(dim);
  const cols = t.isWide ? 3 : 2;
  return shell(pal, dim, `
    <div class="colswrap">
      <div class="cols">
        <h1 class="h-display">{{TITLE}}</h1>
        <p class="lead">${cols} COLUMN · {{DATE}}</p>
        <div class="rest" data-lead-list></div>
      </div>
    </div>
    <div class="foot"><span data-author>{{AUTHOR}}</span><span>__CORNER__</span></div>`, `
  .wrap{padding:${t.padY}px ${t.padX}px}
  /* ⚠️ 2026-11-06 实测修正两处：
     ① 内容重复：原来刊头下方是 <p class="lead">{{LEAD}}</p>，而 .rest 的条目
        也是从同一份引语切出来的 → 同一段话渲染了两遍（实测 lead 与 items[0]
        完全一致）。改为显示栏数信息，既保留 column-span 元素又不再重复。
     ② 空白全在底部：原来 .cols{flex:1} 让容器占满全高，但 column-count 的内容
        始终从容器顶部开始排 → 4 条内容只占 88–599，页脚在 1315，
        中间空 716px（占画布 50%）。改为 colswrap 居中、.cols 高度由内容决定。 */
  .colswrap{flex:1;min-height:0;display:flex;flex-direction:column;justify-content:center}
  .cols{flex:0 1 auto;column-count:${cols};column-gap:${Math.round(t.gap * 3)}px;
    column-rule:1px solid rgba(128,128,128,.24);
    font-size:var(--fs-lead,${t.lead}px);line-height:1.8;color:${pal.ink}}
  .h-display{column-span:all;line-height:1.08;margin:0 0 ${Math.round(t.gap * 1.6)}px}
  .lead{column-span:all;margin:0 0 ${Math.round(t.gap * 2.6)}px;
    font:400 ${t.meta}px/1 ui-monospace,Menlo,monospace;letter-spacing:.26em;
    color:${pal.accent};border-left:${Math.round(t.rule * 1.8)}px solid ${pal.accent};
    padding-left:${Math.round(t.gap * 1.6)}px}
  .rest p{margin:0 0 ${Math.round(t.gap * 1.8)}px;break-inside:avoid}
  .rest p:last-child{margin-bottom:0}
  .foot{margin-top:${Math.round(t.gap * 2)}px;padding-top:${t.meta}px;
    border-top:1px solid rgba(128,128,128,.3);
    display:flex;justify-content:space-between;align-items:baseline;
    font:400 ${t.meta}px/1 ui-monospace,Menlo,monospace;letter-spacing:.24em;color:${pal.muted}}`);
}

/* ── 6. 描边大字：-webkit-text-stroke 空心字，冲击力强 ────────────────
 * 语法背景：-webkit-text-stroke 在 53 套里使用次数为 **0**。
 * 导出实测：描边区饱和度 61，PNG 里保留了描边（同批实验里 clip-path 是 LOST）。
 *
 * ⚠️ 有底图时同样必须退化成实心字（理由同 X4）：
 *    空心字靠 color:transparent，而门禁跳过 alpha<0.15 的元素 →
 *    有图时若仍空心，门禁看不见它，导致「字在照片上糊掉」也测不出来。 */
export function tplOutlineType(pal, dim, hasImage) {
  const t = tokens(dim);
  const strokeW = Math.max(2, Math.round(t.titleMax * 0.022));
  /* 描边色按对比度反推，不直接用 accent。
     实测（2026-11-06）两件事：
     ① accent 是给色块/强调线设计的，不代表能当**文字**色 ——
        bold 的 #ff3b1f 压在近白纸 #fff7ee 上只有 3.36（勉强），
        而在真实渲染里只剩 2.99（不合格，标题门槛 3.0）。
     ② 差的那部分来自 **SVG 装饰层**：它叠了径向墨染 + 噪点，
        把有效底色从 #fff7ee 拉到 #ffe6dc，吃掉约 11–12% 对比度。
        这个损失无法精确反算（渐变叠加），所以把目标阈值抬高到 4.0
        （3.0 / 0.89 ≈ 3.37，取 4.0 留余量），吸收装饰层影响。
     效果：paper #ac512d=4.13、ink #daa652=7.54、bold #eb1d00=3.74，均达标。 */
  const strokeColor = readableAgainst(pal.accent, pal.paper, 4.0);
  const outline = hasImage
    ? `color:#fff`
    : `color:transparent;-webkit-text-stroke:${strokeW}px ${strokeColor}`;
  const solid = hasImage ? 'color:#fff' : `color:${pal.ink}`;
  return shell(pal, dim, `
    <div class="top"><span class="kick">OUTLINE</span><span>{{DATE}}</span></div>
    <h1 class="h-display out">{{TITLE}}</h1>
    <div class="mid">
      <div class="solid-line">{{LEAD}}</div>
      <div class="filler" data-lead-list></div>
    </div>
    <div class="foot"><span data-author>{{AUTHOR}}</span><span class="big-num">__NUM__</span></div>`, `
  .wrap{padding:${t.padY}px ${t.padX}px}
  .top{display:flex;justify-content:space-between;align-items:baseline;
    font:700 ${t.kicker}px/1 ui-monospace,Menlo,monospace;letter-spacing:.3em;
    color:${pal.accent};margin-bottom:${Math.round(t.gap * 2)}px}
  .out{${outline};line-height:1.02;letter-spacing:-.03em;font-weight:900}
  /* ⚠️ 2026-11-06 实测修正：原来 justify-content:center 让「引语条 + 条目」
     作为整体居中，实测标题 125–378、正文到 1048、页脚 1313 → 底部空 265px。
     改为 space-between：引语条靠上、条目靠下，把空白**转成条与条目之间的呼吸**，
     而不是垫在页脚上方当空洞。 */
  .mid{flex:1;min-height:0;display:flex;flex-direction:column;
    justify-content:space-between;
    padding:${Math.round(t.padY * 0.45)}px 0 ${Math.round(t.padY * 0.25)}px}
  /* 引语做成实心反白条：与空心标题形成「空心 vs 实心」的对比 */
  .solid-line{${solid};background:${hasImage ? 'rgba(12,12,14,.42)' : pal.ink};
    padding:${Math.round(t.gap * 1.6)}px ${Math.round(t.gap * 2)}px;
    font-size:var(--fs-lead,${t.lead}px);line-height:1.62;
    ${hasImage ? '' : `color:${pal.paper}`}}
  .filler{font-size:var(--fs-body,${t.body}px);line-height:1.8;color:${pal.muted}}
  .filler p{margin:0 0 ${Math.round(t.gap * 1.5)}px}
  .filler p:last-child{margin-bottom:0}
  .foot{margin-top:auto;padding-top:${t.meta}px;border-top:${t.rule}px solid ${pal.accent};
    display:flex;justify-content:space-between;align-items:baseline;
    font:400 ${t.meta}px/1 ui-monospace,Menlo,monospace;letter-spacing:.24em;color:${pal.muted}}
  .big-num{font-size:var(--fs-meta,${t.meta}px);color:${pal.accent};letter-spacing:.1em}`);
}

/* ── 7. 混色叠加：标题用 mix-blend-mode 与底下的色块反相叠加 ────────────
 * 语法背景：mix-blend-mode 在现有 56 套里使用次数为 **0**。
 * 导出实测（2026-11-06 对照实验）：纯黄像素 on=0 / off=10232，比值 0.00 ——
 * PNG 里保留了混合结果（如果丢失，文字会全是纯黄）。
 *
 * ⚠️ 有底图时必须退化成实心字：difference 在照片上会产生不可预测的杂色，
 *    而且照片纹理本身就让「反相」失去意义 —— 与渐变/描边同一处置原则。 */
export function tplBlendOverlay(pal, dim, hasImage) {
  const t = tokens(dim);
  /* 底层色块与顶层标题字：落差越大，difference 出来的颜色越鲜 */
  const plate = pal.accent;
  const titleColor = hasImage ? '#fff' : pal.paper;
  const blend = hasImage ? '' : 'mix-blend-mode:difference';
  return shell(pal, dim, `
    <div class="plate"></div>
    <div class="layer">
      <div class="top"><span class="kick">BLEND</span><span>{{DATE}}</span></div>
      <h1 class="h-display mix">{{TITLE}}</h1>
      <div class="filler" data-lead-list></div>
      <div class="foot"><span data-author>{{AUTHOR}}</span><span>__CORNER__</span></div>
    </div>`, `
  .poster{background:${pal.paper}}
  .wrap{padding:0}
  /* 底层色块：斜切占据画布右下一半，作为反相的底 */
  .plate{position:absolute;left:${Math.round(dim.w * 0.26)}px;top:${Math.round(dim.h * 0.3)}px;
    right:0;bottom:0;background:${plate};z-index:0}
  .layer{position:relative;z-index:1;flex:1;
    padding:${t.padY}px ${t.padX}px;display:flex;flex-direction:column}
  .top{display:flex;justify-content:space-between;align-items:baseline;
    font:700 ${t.kicker}px/1 ui-monospace,Menlo,monospace;letter-spacing:.3em;
    color:${pal.muted};margin-bottom:${Math.round(t.gap * 2)}px}
  /* 关键：标题不透明纸色 + difference，压在色块上会反相成对比色 */
  .mix{${blend};color:${titleColor};line-height:1.02;letter-spacing:-.03em;
    font-weight:900;margin-top:${Math.round(t.padY * 0.3)}px}
  .filler{flex:1;min-height:0;display:flex;flex-direction:column;justify-content:flex-end;
    gap:${Math.round(t.gap * 2)}px;padding-bottom:${Math.round(t.padY * 0.5)}px;
    font-size:var(--fs-lead,${t.lead}px);line-height:1.75;
    color:${hasImage ? '#fff' : pal.ink}}
  .filler p{margin:0;padding-left:${Math.round(t.gap * 2)}px;
    border-left:${Math.round(t.rule * 1.6)}px solid ${hasImage ? '#fff' : pal.paper}}
  .foot{padding-top:${t.meta}px;border-top:1px solid rgba(128,128,128,.3);
    display:flex;justify-content:space-between;align-items:baseline;
    font:400 ${t.meta}px/1 ui-monospace,Menlo,monospace;letter-spacing:.24em;
    color:${hasImage ? '#fff' : pal.ink}}`);
}

/* ── 8. 命名栅格：grid-template-areas 做非对称撒点 ────────────────────
 * 语法背景：grid-template-areas 在现有 56 套里使用次数为 **0**。
 * 与已有 grid 的区别：那些都是 repeat(2,1fr) 这类**均分**栅格，
 * 本套用命名区域把标题、编号、正文放进刻意不对称的格子 ——
 * 版面张力来自「格子大小不等」，不是换色。
 * 导出实测：红块左边界 on=368 / off=0，差 368px，PNG 里区域定位保留了。 */
export function tplNamedGrid(pal, dim, hasImage) {
  const t = tokens(dim);
  return shell(pal, dim, `
    <div class="grid">
      <span class="cell-num">__CORNER__</span>
      <h1 class="h-display area-title">{{TITLE}}</h1>
      <span class="cell-rule"></span>
      <div class="filler" data-lead-list></div>
      <div class="foot area-foot"><span data-author>{{AUTHOR}}</span><span>{{DATE}}</span></div>
    </div>`, `
  .wrap{padding:${t.padY}px ${t.padX}px}
  /* 命名栅格：标题占「右上大格」，编号占「左上小格」，正文占「下方整行」——
     刻意不对齐，让视觉重心偏到右上 */
  .grid{flex:1;min-height:0;display:grid;
    grid-template-areas:
      "num   .     title title"
      "num   rule  title title"
      "body  body  body  body"
      "foot  foot  foot  foot";
    grid-template-rows:auto auto 1fr auto;
    grid-template-columns:${Math.round(dim.w * 0.06)}px ${Math.round(dim.w * 0.06)}px 1fr 1fr;
    column-gap:${Math.round(t.gap * 2)}px;row-gap:${Math.round(t.gap * 1.6)}px}
  .cell-num{grid-area:num;font:900 ${Math.round(t.titleMax * 0.42)}px/0.9 ui-monospace,Menlo,monospace;
    color:${pal.accent};letter-spacing:-.04em;align-self:start}
  .cell-rule{grid-area:rule;height:${Math.round(t.rule * 1.4)}px;background:${pal.accent};
    align-self:center}
  .area-title{grid-area:title;align-self:end;margin:0;line-height:1.06;letter-spacing:-.025em}
  /* ⚠️ 选择器必须写 .filler 而不是 .area-body：条目填充走的是精确字符串匹配，
     v3-templates.js 里登记的占位就是 class 为 filler 的 div，
     所以 HTML 侧的类名只能是 filler；若 CSS 还用 .area-body，栅格定位会丢失。
     类名冲突无风险 —— 每个模板是独立 HTML，.filler 只在本文档生效。
     ⚠️ 本注释里不能写用反引号包住的标签字面量：外层是模板字符串，
        反引号会提前终止它（本会话在同一文件踩过两次）。 */
  /* ⚠️ 2026-11-06 实测修正：body 是 1fr 格（占满剩余高度），但原来
     align-self:start 让 4 条内容全堆在格顶 → 内容底 781、页脚 1315，
     中间空 534px（画布 37%）。改为 stretch + 内部 space-between：
     让 4 条在整格里**分散**，空白转成条目之间的呼吸，而不是垫在页脚上方。
     这与前面 3 套的空白修复是同一套思路（把空洞改成节奏）。 */
  .filler{grid-area:body;align-self:stretch;display:flex;flex-direction:column;
    justify-content:space-between;padding-top:${Math.round(t.gap * 2)}px;
    font-size:var(--fs-lead,${t.lead}px);line-height:1.8;color:${pal.muted}}
  .filler p{margin:0;
    padding-left:${Math.round(t.gap * 2.2)}px;border-left:${t.rule}px solid ${pal.accent}}
  .area-foot{grid-area:foot;padding-top:${t.meta}px;border-top:1px solid rgba(128,128,128,.3);
    display:flex;justify-content:space-between;align-items:baseline;
    font:400 ${t.meta}px/1 ui-monospace,Menlo,monospace;letter-spacing:.24em;color:${pal.muted}}`);
}

/* ── 9. 渐隐遮罩：标题右侧用 mask-image 淡出，做「话没说完」的余味 ──────
 * 语法背景：mask-image 在现有 56 套里使用次数为 **0**。
 * 导出实测：右侧/左侧墨迹比 0.00（left=4568 / right=0），PNG 里遮罩保留了。
 * 设计意图：整句标题若直接排满会显得「报告感」，右端淡出反而留白有呼吸。
 * ⚠️ 只淡出**最后一行**的尾部，不能整块淡出 —— 否则正文也跟着看不见。 */
export function tplMaskFade(pal, dim, hasImage) {
  const t = tokens(dim);
  return shell(pal, dim, `
    <div class="top"><span class="kick">FADE</span><span>{{DATE}}</span></div>
    <div class="stage">
      <h1 class="h-display fade">{{TITLE}}</h1>
      <div class="filler" data-lead-list></div>
    </div>
    <div class="foot"><span data-author>{{AUTHOR}}</span><span>__CORNER__</span></div>`, `
  .wrap{padding:${t.padY}px ${t.padX}px}
  .top{display:flex;justify-content:space-between;align-items:baseline;
    font:700 ${t.kicker}px/1 ui-monospace,Menlo,monospace;letter-spacing:.3em;
    color:${pal.accent};margin-bottom:${Math.round(t.gap * 2.4)}px}
  .stage{flex:1;min-height:0;display:flex;flex-direction:column;
    justify-content:space-between;
    padding:${Math.round(t.padY * 0.5)}px 0 ${Math.round(t.padY * 0.3)}px}
  /* 关键：mask-image 让标题右端淡入纸色。渐隐带只覆盖右侧 30%，
     保证左半部分始终清晰可读 */
  .fade{color:${pal.ink};line-height:1.05;letter-spacing:-.025em;
    -webkit-mask-image:linear-gradient(100deg,#000 0%,#000 62%,rgba(0,0,0,.15) 100%);
    mask-image:linear-gradient(100deg,#000 0%,#000 62%,rgba(0,0,0,.15) 100%)}
  .filler{font-size:var(--fs-lead,${t.lead}px);line-height:1.85;color:${pal.muted}}
  .filler p{margin:0 0 ${Math.round(t.gap * 2)}px;
    padding-left:${Math.round(t.gap * 2.4)}px;border-left:${t.rule}px solid ${pal.accent}}
  .filler p:last-child{margin-bottom:0}
  .foot{margin-top:auto;padding-top:${t.meta}px;border-top:1px solid rgba(128,128,128,.3);
    display:flex;justify-content:space-between;align-items:baseline;
    font:400 ${t.meta}px/1 ui-monospace,Menlo,monospace;letter-spacing:.24em;color:${pal.muted}}`);
}

/* ── 10. 透视平面：标题与正文斜躺在一个透视平面上 ──────────────────────
 * 语法背景：perspective + rotateX 在现有 59 套里使用次数为 **0**
 *（现有 transform 只有 scale/translate 类，没有 3D 透视）。
 * 导出实测（2026-11-06 对照实验）：色块顶边 409 / 底边 487，梯形化 16% ——
 * PNG 里保留了透视（如果是平面投影，顶底等宽）。
 *
 * 设计意图：把标题「贴」在桌面上看，产生俯视纵深；与所有平面版式区分开。
 * ⚠️ 有底图时关掉透视：照片本身有透视，再叠投影会让字变形到读不出。
 * ⚠️ perspective 必须写在**父容器**上，子元素才有纵深（写在子元素上无效）。 */
export function tplPerspectivePlane(pal, dim, hasImage) {
  const t = tokens(dim);
  const depth = Math.max(600, Math.round(dim.h * 0.62));
  const tilt = hasImage ? 'none' : `rotateX(${t.isWide ? 26 : 34}deg)`;
  return shell(pal, dim, `
    <div class="top"><span class="kick">PERSPECTIVE</span><span>{{DATE}}</span></div>
    <div class="stage">
      <div class="plane">
        <h1 class="h-display">{{TITLE}}</h1>
        <div class="filler" data-lead-list></div>
      </div>
    </div>
    <div class="foot"><span data-author>{{AUTHOR}}</span><span>__CORNER__</span></div>`, `
  .wrap{padding:${t.padY}px ${t.padX}px}
  .top{display:flex;justify-content:space-between;align-items:baseline;
    font:700 ${t.kicker}px/1 ui-monospace,Menlo,monospace;letter-spacing:.3em;
    color:${pal.accent};margin-bottom:${Math.round(t.gap * 2)}px}
  /* 关键：perspective 在父层，plane 才有纵深；transform-origin 压到底边，
     让平面「贴地向前倒」，不是悬空翻转 */
  .stage{flex:1;min-height:0;perspective:${depth}px;perspective-origin:50% 100%;
    display:flex;flex-direction:column;justify-content:flex-end;
    padding-bottom:${Math.round(t.padY * 0.4)}px}
  .plane{transform:${tilt};transform-origin:50% 100%;
    transform-style:preserve-3d;
    display:flex;flex-direction:column;gap:${Math.round(t.gap * 2.4)}px}
  .h-display{line-height:1.06;letter-spacing:-.025em;margin:0}
  .filler{font-size:var(--fs-lead,${t.lead}px);line-height:1.75;color:${pal.muted};
    display:flex;flex-direction:column;gap:${Math.round(t.gap * 1.6)}px}
  .filler p{margin:0;padding-left:${Math.round(t.gap * 2)}px;
    border-left:${t.rule}px solid ${pal.accent}}
  .foot{margin-top:auto;padding-top:${t.meta}px;border-top:1px solid rgba(128,128,128,.3);
    display:flex;justify-content:space-between;align-items:baseline;
    font:400 ${t.meta}px/1 ui-monospace,Menlo,monospace;letter-spacing:.24em;color:${pal.muted}}`);
}

/* ── 11. 双色条纹边框：border-image 用重复渐变做斜条纹框 ────────────────
 * 语法背景：border-image 在现有 59 套里使用次数为 **0**
 *（现有边框全是 border:1px solid 或 border-left 强调线）。
 * 导出实测：蓝条纹像素 on=14760 / off=0 —— PNG 里保留了条纹边框
 *（丢失则只剩纯色边框，蓝色像素为 0）。
 *
 * 设计意图：让「框」本身成为装饰主体，像印刷品的装饰边。 */
export function tplDuotoneBorder(pal, dim, hasImage) {
  const t = tokens(dim);
  const bw = Math.max(10, Math.round(dim.w * 0.016));
  /* 有底图时边框降为半透明白，避免条纹压在照片上显得脏 */
  const stripe = hasImage
    ? `repeating-linear-gradient(45deg,rgba(255,255,255,.75) 0 ${bw}px,rgba(255,255,255,.28) ${bw}px ${bw * 2}px)`
    : `repeating-linear-gradient(45deg,${pal.accent} 0 ${bw}px,${pal.ink} ${bw}px ${bw * 2}px)`;
  return shell(pal, dim, `
    <div class="framed">
      <div class="inner">
        <div class="top"><span class="kick">DUOTONE</span><span>{{DATE}}</span></div>
        <h1 class="h-display">{{TITLE}}</h1>
        <div class="filler" data-lead-list></div>
        <div class="foot"><span data-author>{{AUTHOR}}</span><span>__CORNER__</span></div>
      </div>
    </div>`, `
  .wrap{padding:${Math.round(t.padY * 0.55)}px ${Math.round(t.padX * 0.55)}px}
  /* 关键：border-image 需要元素本身有 border 宽度，slice 让条纹只出现在边上 */
  .framed{flex:1;min-height:0;display:flex;
    border:${bw}px solid transparent;
    border-image:${stripe} ${bw} repeat}
  .inner{flex:1;min-height:0;display:flex;flex-direction:column;
    padding:${Math.round(t.padY * 0.55)}px ${Math.round(t.padX * 0.5)}px}
  .top{display:flex;justify-content:space-between;align-items:baseline;
    font:700 ${t.kicker}px/1 ui-monospace,Menlo,monospace;letter-spacing:.3em;
    color:${hasImage ? '#fff' : pal.accent};margin-bottom:${Math.round(t.gap * 2)}px}
  .h-display{line-height:1.06;letter-spacing:-.025em;margin:0 0 ${Math.round(t.gap * 2.4)}px;
    color:${hasImage ? '#fff' : pal.ink}}
  /* ⚠️ 2026-11-06 实测修正：space-between 让最后一条正文正好顶到页脚线
     （实测 bottom=1290 = footTop=1290，压线）。加底部内边距留呼吸。 */
  .filler{flex:1;min-height:0;display:flex;flex-direction:column;
    justify-content:space-between;padding-bottom:${Math.round(t.gap * 1.6)}px;
    font-size:var(--fs-lead,${t.lead}px);line-height:1.7;
    color:${hasImage ? '#fff' : pal.muted}}
  .filler p{margin:0;padding-left:${Math.round(t.gap * 2)}px;
    border-left:${Math.round(t.rule * 1.4)}px solid ${hasImage ? '#fff' : pal.accent}}
  .foot{padding-top:${t.meta}px;border-top:1px solid rgba(128,128,128,.3);
    display:flex;justify-content:space-between;align-items:baseline;
    font:400 ${t.meta}px/1 ui-monospace,Menlo,monospace;letter-spacing:.24em;
    color:${hasImage ? '#fff' : pal.muted}}`);
}

/* ── 12. 混色底纹：色块用 background-blend-mode 与网纹相乘 ──────────────
 * 语法背景：background-blend-mode 在现有 59 套里使用次数为 **0**
 *（现有叠加只有单层 linear-gradient，没有「渐变 × 图案」混合）。
 * 导出实测：平均亮度 off=83.6 → on=33.7，变暗 49.9 —— PNG 里保留了相乘结果
 *（丢失则与纯渐变完全一致，亮度差为 0）。
 *
 * 设计意图：让色块自带印刷网纹质感，而不是一块死板纯色。
 * ⚠️ 网纹用 SVG data URI 内联，不用外部图片（导出时不会有跨域风险）。 */
export function tplBlendPlate(pal, dim, hasImage) {
  const t = tokens(dim);
  /* 深灰点阵网纹：与渐变相乘后出现规律的暗点，像油墨印在纸上 */
  const DOTS = "url(\"data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='18' height='18'%3E%3Ccircle cx='9' cy='9' r='3.2' fill='%23666'/%3E%3C/svg%3E\")";
  return shell(pal, dim, `
    <div class="plate"></div>
    <div class="layer">
      <div class="top"><span class="kick">INK PLATE</span><span>{{DATE}}</span></div>
      <h1 class="h-display">{{TITLE}}</h1>
      <div class="filler" data-lead-list></div>
      <div class="foot"><span data-author>{{AUTHOR}}</span><span>__CORNER__</span></div>
    </div>`, `
  .poster{background:${pal.paper}}
  .wrap{padding:0}
  /* 关键：两层背景（渐变 + 点阵）用 multiply 相乘，得到带网纹的色块
     ⚠️ 2026-11-06 可读性门禁实测：有底图时这个亮渐变（accent→paper2）
        会盖住照片，白字页码压在亮端对比度只有 1.98 < 2.0。
        根因是 .plate 与 .cover-img 同为 z-index:0、但 plate 的 DOM 更靠后。
        有底图时改为「半透明压暗层」：不再做网纹相乘，只负责把照片压暗到
        白字可读，网纹交给照片本身（与 SVG 装饰层同一处置思路）。 */
  .plate{position:absolute;inset:0;z-index:0;
    ${hasImage
    ? 'background:linear-gradient(180deg,rgba(10,10,12,.15) 0%,rgba(10,10,12,.72) 62%,rgba(10,10,12,.86) 100%)'
    : `background-image:linear-gradient(160deg,${pal.accent} 0%,${pal.paper2} 100%),${DOTS};
    background-size:cover,18px 18px;
    background-blend-mode:multiply`}}
  .layer{position:relative;z-index:1;flex:1;display:flex;flex-direction:column;
    padding:${t.padY}px ${t.padX}px}
  .top{display:flex;justify-content:space-between;align-items:baseline;
    font:700 ${t.kicker}px/1 ui-monospace,Menlo,monospace;letter-spacing:.3em;
    color:${hasImage ? '#fff' : pal.paper};margin-bottom:${Math.round(t.gap * 2)}px}
  /* 标题与色板同为「纸色/亮色」，靠明度差而非色相拉开 */
  .h-display{line-height:1.04;letter-spacing:-.03em;margin:0 0 ${Math.round(t.gap * 3)}px;
    color:${hasImage ? '#fff' : pal.paper}}
  /* ⚠️ 2026-11-06 实测修正：space-between 让最后一条正文正好顶到页脚线
     （实测 bottom=1315 = footTop=1315，压线）。加底部内边距留呼吸。 */
  .filler{flex:1;min-height:0;display:flex;flex-direction:column;
    justify-content:space-between;padding-bottom:${Math.round(t.gap * 1.6)}px;
    font-size:var(--fs-lead,${t.lead}px);line-height:1.7;
    color:${hasImage ? '#fff' : pal.paper}}
  .filler p{margin:0;padding-left:${Math.round(t.gap * 2)}px;
    border-left:${Math.round(t.rule * 1.4)}px solid ${hasImage ? '#fff' : pal.ink}}
  .foot{padding-top:${t.meta}px;border-top:1px solid rgba(255,255,255,.4);
    display:flex;justify-content:space-between;align-items:baseline;
    font:400 ${t.meta}px/1 ui-monospace,Menlo,monospace;letter-spacing:.24em;
    color:${hasImage ? '#fff' : pal.paper}}`);
}

export const STRUCT_TEMPLATES = {
  'text-wrap': tplTextWrap,
  'multi-column': tplMultiColumn,
  'bleed-overlap': tplBleedOverlap,
  /* 2026-11-06 第二批结构型（用户「继续加新的结构语法」）：
     这 3 套用的语法在现有 53 套里使用次数都是 0，且都经过导出 PNG 对照实验
     验证会被保留（见文件头注释与各自函数注释）。 */
  'gradient-title': tplGradientTitle,
  'span-column': tplSpanColumn,
  'outline-type': tplOutlineType,
  /* 2026-11-06 第三批结构型 3 套：语法在现有 56 套里使用次数都是 0，
     且都过了导出 PNG 对照实验（blend-mode / grid-areas / mask-fade 均 KEPT；
     skew-block 因斜切量仅 20px 未达阈值，未采用）。 */
  'blend-overlay': tplBlendOverlay,
  'named-grid': tplNamedGrid,
  'mask-fade': tplMaskFade,
  /* 2026-11-06 第四批结构型 3 套：语法在现有 59 套里使用次数都是 0，
     且都过了导出 PNG 对照实验（bg-blend / perspective / border-image
     修正探针设计缺陷后均 KEPT；object-position 已保留但本轮未用作主题）。 */
  'perspective-plane': tplPerspectivePlane,
  'duotone-border': tplDuotoneBorder,
  'blend-plate': tplBlendPlate,
};
