/* 标题图 V3 · 高保真模板（2026-11-06 用户拍板「先用 AI 设计模板 + 运行时只调参数」）
 *
 * 与 layouts.js 的区别：
 *   · layouts.js 是「骨架 + 少量 CSS」，19 套整篇设计的读者反馈是「区别不大」；
 *   · 这里每套都有独立的版面结构（顶栏 / 首屏带 / 编号系统 / 装饰角标 / 撞色块），
 *     目标是「一眼能认出是哪套」，而不只是换配色。
 *
 * ⚠️ 封面是 DOM → PNG（modern-screenshot），不是微信编辑器，所以 flex/grid 都能用。
 * ⚠️ 标题一律带 .h-display —— templates.js 的 fitty 会按封面高度自动缩放它，
 *    避免「大字报 150px 遇到长标题断成单字」（样例 C 实测踩到的坑）。
 * ⚠️ 不新增版式卡位：仍是 30 套（8 套核心用新模板，其余保持占位），
 *    换渲染器不改注册表数量，避免右栏与设计文档口径漂移。
 */

import { COVER_SIZES, styleById } from './catalog.js';
import { prepareCoverHtml } from './templates.js';

/* magazine-tpl / swiss-tpl 是主卡的配色变体，渲染归到主卡结构。 */
const LAYOUT_ALIAS = { 'magazine-tpl': 'magazine', 'swiss-tpl': 'swiss' };

/** catalog 的 styleId → 统一色板（缺省值保证任何模板都能渲染）。 */
function paletteOf(meta) {
  return {
    paper: meta.paper || '#f4efe4',
    paper2: meta.paper2 || meta.paper || '#eae2d2',
    ink: meta.ink || '#1c1a16',
    muted: meta.muted || '#6f6a5f',
    accent: meta.accent || '#b4552f',
    accentOn: meta.accentOn || '#ffffff',
    dark: !!meta.dark,
  };
}

/** 版心内边距按尺寸缩放（3:4 与 1:1 用同一比例，21:9 单独收窄）。 */
function padOf(dim) {
  const ratio = dim.w / dim.h;
  if (ratio > 1.9) return { x: 96, y: 64 };      // 21:9
  if (ratio > 1.05) return { x: 88, y: 80 };     // 1:1
  return { x: 92, y: 88 };                        // 3:4
}

/* ── 1. 杂志封面：顶栏双线 + 衬线大标题 + 底部版权区 ───────────────── */
function tplMagazine(pal, dim, hasImage) {
  const p = padOf(dim);
  return `<!doctype html><html lang="zh-CN"><head><meta charset="utf-8"><style>
  *{box-sizing:border-box} html,body{margin:0;padding:0}
  .poster{position:relative;width:${dim.w}px;height:${dim.h}px;overflow:hidden;isolation:isolate;
    background:${pal.paper};color:${pal.ink};
    font-family:'Noto Serif SC','Songti SC',Georgia,serif}
  .cover-img{position:absolute;inset:0;width:100%;height:100%;object-fit:cover;z-index:0}
  .scrim{position:absolute;inset:0;z-index:1;
    background:linear-gradient(180deg,rgba(12,11,10,.55) 0%,rgba(12,11,10,.05) 38%,rgba(12,11,10,.72) 100%)}
  .wrap{position:relative;z-index:2;height:100%;display:flex;flex-direction:column;
    padding:${p.y}px ${p.x}px}
  .top{display:flex;align-items:baseline;justify-content:space-between;
    border-bottom:3px solid currentColor;padding-bottom:16px}
  .brand{font:600 20px/1 ui-monospace,Menlo,monospace;letter-spacing:.34em;text-transform:uppercase;
    color:${pal.accent}}
  .issue{font:400 18px/1 ui-monospace,Menlo,monospace;letter-spacing:.2em;color:${pal.muted}}
  .rule{height:10px;background:${pal.accent};margin-top:22px}
  .mid{margin-top:auto;margin-bottom:auto;padding:40px 0}
  .h-display{margin:0;font-size:__HSIZE__px;line-height:.98;letter-spacing:-.02em;font-weight:700;text-wrap:balance}
  .lead{margin:44px 0 0;font-size:30px;line-height:1.72;color:${pal.muted};max-width:78%}
  .mark{display:block;width:110px;height:5px;background:currentColor;margin-top:52px}
  .foot{border-top:1px solid rgba(128,128,128,.34);padding-top:20px;
    display:flex;align-items:baseline;justify-content:space-between;
    font:400 19px/1 ui-monospace,Menlo,monospace;letter-spacing:.24em;color:${pal.muted}}
  ${hasImage ? `body.has-img .wrap{color:#fff}
    body.has-img .lead{color:rgba(255,255,255,.86)}
    body.has-img .top{border-color:rgba(255,255,255,.6)}
    body.has-img .issue,body.has-img .foot{color:rgba(255,255,255,.8)}
    body.has-img .mark{background:#fff}` : ''}
  </style></head><body class="gz${hasImage ? ' has-img' : ''}">
  <section class="poster">
    <img class="cover-img" src="" alt="">
    ${hasImage ? '<div class="scrim"></div>' : ''}
    <div class="wrap">
      <div class="top"><span class="brand">SuperSu Magazine</span><span class="issue">{{DATE}}</span></div>
      <div class="rule"></div>
      <div class="mid">
        <h1 class="h-display">{{TITLE}}</h1>
        <p class="lead">{{LEAD}}</p>
        <span class="mark"></span>
      </div>
      <div class="foot"><span data-author>BY {{AUTHOR}}</span><span>{{DATE}}</span></div>
    </div>
  </section></body></html>`;
}

/* ── 2. 金句：超大引号 + 对角角标 + 居中层次 ───────────────────────── */
function tplQuote(pal, dim) {
  const p = padOf(dim);
  return `<!doctype html><html lang="zh-CN"><head><meta charset="utf-8"><style>
  *{box-sizing:border-box} html,body{margin:0;padding:0}
  .poster{position:relative;width:${dim.w}px;height:${dim.h}px;overflow:hidden;
    background:${pal.paper};color:${pal.ink};
    font-family:'Noto Serif SC','Songti SC',Georgia,serif}
  .grain{position:absolute;inset:0;background-image:radial-gradient(rgba(20,18,16,.05) 1px,transparent 1px);
    background-size:4px 4px}
  .corner{position:absolute;width:60px;height:60px;border:3px solid ${pal.ink}}
  .c1{left:48px;top:48px;border-right:0;border-bottom:0}
  .c2{right:48px;bottom:48px;border-left:0;border-top:0}
  .wrap{position:relative;height:100%;display:flex;flex-direction:column;align-items:center;
    justify-content:center;text-align:center;padding:${p.y}px ${p.x}px}
  .q{font:700 190px/0.5 Georgia,serif;color:${pal.accent};height:104px}
  .h-display{margin:36px 0 0;font-size:__HSIZE__px;line-height:1.32;font-weight:600;letter-spacing:.01em;text-wrap:balance}
  .rule{width:84px;height:4px;background:${pal.accent};margin-top:58px}
  .lead{margin:52px 0 0;font-size:29px;line-height:1.8;color:${pal.muted};max-width:82%}
  .sign{margin-top:80px;font:400 21px/1 ui-monospace,Menlo,monospace;letter-spacing:.36em;color:${pal.muted}}
  </style></head><body class="gz">
  <section class="poster">
    <div class="grain"></div><span class="corner c1"></span><span class="corner c2"></span>
    <div class="wrap">
      <div class="q">&ldquo;</div>
      <h1 class="h-display">{{TITLE}}</h1>
      <div class="rule"></div>
      <p class="lead">{{LEAD}}</p>
      <div class="sign" data-author>{{AUTHOR}} · {{DATE}}</div>
    </div>
  </section></body></html>`;
}

/* ── 3. 大字版（大字报）：色条 + kicker 徽章 + 超大标题 + 硬边框 ───── */
function tplBigtype(pal, dim) {
  const p = padOf(dim);
  const dark = pal.dark;
  const bg = dark ? '#101418' : pal.paper;
  const fg = dark ? '#F5F1E8' : pal.ink;
  const sub = dark ? '#B9B2A6' : pal.muted;
  return `<!doctype html><html lang="zh-CN"><head><meta charset="utf-8"><style>
  *{box-sizing:border-box} html,body{margin:0;padding:0}
  .poster{position:relative;width:${dim.w}px;height:${dim.h}px;overflow:hidden;
    background:${bg};color:${fg};
    font-family:'Noto Sans SC','PingFang SC',system-ui,sans-serif}
  .bar{height:24px;background:${pal.accent}}
  .wrap{height:calc(100% - 24px);display:flex;flex-direction:column;padding:${p.y}px ${p.x}px}
  .kicker{display:inline-block;align-self:flex-start;background:${pal.accent};color:${pal.accentOn};
    font:800 23px/1 ui-monospace,Menlo,monospace;letter-spacing:.22em;padding:9px 15px}
  .h-display{margin:auto 0 0;font-size:__HSIZE__px;line-height:.94;font-weight:900;letter-spacing:-.03em;text-wrap:balance}
  .lead{margin:60px 0 0;font-size:32px;line-height:1.6;color:${sub};max-width:80%}
  .tag{display:inline-block;align-self:flex-start;margin-top:64px;padding:12px 20px;
    border:3px solid ${fg};font:600 21px/1 ui-monospace,Menlo,monospace;letter-spacing:.2em}
  .foot{margin-top:auto;font:400 20px/1 ui-monospace,Menlo,monospace;letter-spacing:.26em;color:${sub}}
  </style></head><body class="gz">
  <section class="poster"><div class="bar"></div><div class="wrap">
    <span class="kicker">SUPERSU · {{DATE}}</span>
    <h1 class="h-display">{{TITLE}}</h1>
    <p class="lead">{{LEAD}}</p>
    <span class="tag" data-author>BY {{AUTHOR}}</span>
    <div class="foot">SUPERSU</div>
  </div></section></body></html>`;
}

/* ── 4. 图文封面：全出血底图 + 底部压字 + 顶部栏目条 ───────────────── */
function tplImageLed(pal, dim, hasImage) {
  const p = padOf(dim);
  const solid = hasImage ? '' : `<div class="band" style="background:${pal.accent}"></div>`;
  return `<!doctype html><html lang="zh-CN"><head><meta charset="utf-8"><style>
  *{box-sizing:border-box} html,body{margin:0;padding:0}
  .poster{position:relative;width:${dim.w}px;height:${dim.h}px;overflow:hidden;isolation:isolate;
    background:${pal.paper};color:#fff;
    font-family:'Noto Sans SC','PingFang SC',system-ui,sans-serif}
  .cover-img{position:absolute;inset:0;width:100%;height:100%;object-fit:cover;z-index:0}
  .scrim{position:absolute;inset:0;z-index:1;
    background:linear-gradient(180deg,rgba(10,10,12,.42) 0%,rgba(10,10,12,0) 34%,rgba(10,10,12,.88) 100%)}
  .band{position:absolute;left:0;top:0;bottom:0;width:150px;z-index:1}
  .wrap{position:relative;z-index:2;height:100%;display:flex;flex-direction:column;
    padding:${p.y}px ${p.x}px}
  .top{display:flex;justify-content:space-between;align-items:center;
    font:600 19px/1 ui-monospace,Menlo,monospace;letter-spacing:.3em;text-transform:uppercase;
    color:${hasImage ? '#fff' : pal.accent}}
  .mid{margin-top:auto}
  .h-display{margin:0;font-size:__HSIZE__px;line-height:1.02;font-weight:800;letter-spacing:-.02em;text-wrap:balance;
    text-shadow:0 2px 18px rgba(0,0,0,.34)}
  .lead{margin:34px 0 0;font-size:30px;line-height:1.66;color:rgba(255,255,255,.9);max-width:84%}
  .foot{margin-top:44px;padding-top:18px;border-top:1px solid rgba(255,255,255,.42);
    display:flex;justify-content:space-between;
    font:400 18px/1 ui-monospace,Menlo,monospace;letter-spacing:.24em;color:rgba(255,255,255,.86)}
  ${hasImage ? '' : `.poster{color:${pal.ink}} .h-display{text-shadow:none}
    .lead{color:${pal.muted}} .foot{color:${pal.muted};border-color:rgba(128,128,128,.34)}
    .wrap{padding-left:${p.x + 110}px}`}
  </style></head><body class="gz">
  <section class="poster">
    <img class="cover-img" src="" alt="">
    ${solid}
    ${hasImage ? '<div class="scrim"></div>' : ''}
    <div class="wrap">
      <div class="top"><span>Cover Story</span><span>{{DATE}}</span></div>
      <div class="mid">
        <h1 class="h-display">{{TITLE}}</h1>
        <p class="lead">{{LEAD}}</p>
        <div class="foot"><span data-author>BY {{AUTHOR}}</span><span>SuperSu</span></div>
      </div>
    </div>
  </section></body></html>`;
}

/* ── 5. 清单：编号条目 + 细线分隔 + 顶部标签 ───────────────────────── */
function tplList(pal, dim) {
  const p = padOf(dim);
  return `<!doctype html><html lang="zh-CN"><head><meta charset="utf-8"><style>
  *{box-sizing:border-box} html,body{margin:0;padding:0}
  .poster{position:relative;width:${dim.w}px;height:${dim.h}px;overflow:hidden;
    background:${pal.paper};color:${pal.ink};
    font-family:'Noto Sans SC','PingFang SC',system-ui,sans-serif}
  .wrap{height:100%;display:flex;flex-direction:column;padding:${p.y}px ${p.x}px}
  .kick{display:inline-block;align-self:flex-start;border:2px solid ${pal.accent};
    color:${pal.accent};font:700 20px/1 ui-monospace,Menlo,monospace;
    letter-spacing:.24em;padding:8px 14px;text-transform:uppercase}
  .h-display{margin:38px 0 0;font-size:__HSIZE__px;line-height:1.18;font-weight:800;letter-spacing:-.01em;text-wrap:balance}
  .items{margin-top:44px;display:flex;flex-direction:column}
  .it{display:flex;align-items:baseline;gap:22px;padding:22px 0;
    border-top:1px solid rgba(128,128,128,.3)}
  .it:last-child{border-bottom:1px solid rgba(128,128,128,.3)}
  .no{flex:none;font:700 24px/1 ui-monospace,Menlo,monospace;color:${pal.accent};letter-spacing:.06em}
  .tx{font-size:31px;line-height:1.5;color:${pal.ink}}
  .foot{margin-top:auto;padding-top:26px;display:flex;justify-content:space-between;
    font:400 18px/1 ui-monospace,Menlo,monospace;letter-spacing:.24em;color:${pal.muted}}
  </style></head><body class="gz">
  <section class="poster"><div class="wrap">
    <span class="kick">List · {{DATE}}</span>
    <h1 class="h-display">{{TITLE}}</h1>
    <div class="items" data-lead-list></div>
    <div class="foot"><span data-author>BY {{AUTHOR}}</span><span>SuperSu</span></div>
  </div></section></body></html>`;
}

/* ── 6. 编号大字：超大序号 + 标题 + 侧栏月份 ───────────────────────── */
function tplNumber(pal, dim) {
  const p = padOf(dim);
  return `<!doctype html><html lang="zh-CN"><head><meta charset="utf-8"><style>
  *{box-sizing:border-box} html,body{margin:0;padding:0}
  .poster{position:relative;width:${dim.w}px;height:${dim.h}px;overflow:hidden;
    background:${pal.paper};color:${pal.ink};
    font-family:'Noto Sans SC','PingFang SC',system-ui,sans-serif}
  .wrap{height:100%;display:flex;flex-direction:column;padding:${p.y}px ${p.x}px}
  .top{display:flex;align-items:flex-start;justify-content:space-between}
  .num{font:800 300px/0.8 system-ui,sans-serif;letter-spacing:-.06em;color:${pal.accent};
    font-variant-numeric:tabular-nums}
  .side{writing-mode:vertical-rl;font:400 19px/1 ui-monospace,Menlo,monospace;
    letter-spacing:.34em;color:${pal.muted};margin-top:6px}
  .h-display{margin:auto 0 0;font-size:__HSIZE__px;line-height:1.14;font-weight:800;letter-spacing:-.01em;max-width:86%;text-wrap:balance}
  .lead{margin:30px 0 0;font-size:28px;line-height:1.7;color:${pal.muted};max-width:80%}
  .foot{margin-top:34px;padding-top:18px;border-top:1px solid rgba(128,128,128,.34);
    display:flex;justify-content:space-between;
    font:400 18px/1 ui-monospace,Menlo,monospace;letter-spacing:.24em;color:${pal.muted}}
  </style></head><body class="gz">
  <section class="poster"><div class="wrap">
    <div class="top"><div class="num" data-num>01</div><div class="side">{{DATE}}</div></div>
    <h1 class="h-display">{{TITLE}}</h1>
    <p class="lead">{{LEAD}}</p>
    <div class="foot"><span data-author>BY {{AUTHOR}}</span><span>SuperSu</span></div>
  </div></section></body></html>`;
}

/* ── 7. 瑞士封面：网格线 + 极简大写 + 索引号 ───────────────────────── */
function tplSwiss(pal, dim) {
  const p = padOf(dim);
  return `<!doctype html><html lang="zh-CN"><head><meta charset="utf-8"><style>
  *{box-sizing:border-box} html,body{margin:0;padding:0}
  .poster{position:relative;width:${dim.w}px;height:${dim.h}px;overflow:hidden;
    background:${pal.paper};color:${pal.ink};
    font-family:'Noto Sans SC','PingFang SC',Helvetica,sans-serif}
  .grid{position:absolute;inset:0}
  .grid span{position:absolute;top:0;bottom:0;width:1px;background:rgba(128,128,128,.26)}
  .wrap{position:relative;height:100%;display:flex;flex-direction:column;padding:${p.y}px ${p.x}px}
  .idx{font:700 21px/1 ui-monospace,Menlo,monospace;letter-spacing:.3em;color:${pal.accent}}
  .h-display{margin:auto 0;font-size:__HSIZE__px;line-height:1.06;font-weight:300;letter-spacing:-.03em;text-wrap:balance}
  .lead{margin:0 0 26px;font-size:27px;line-height:1.66;color:${pal.muted};max-width:74%}
  .foot{display:flex;justify-content:space-between;align-items:baseline;
    border-top:1px solid rgba(128,128,128,.34);padding-top:18px;
    font:400 18px/1 ui-monospace,Menlo,monospace;letter-spacing:.26em;color:${pal.muted}}
  </style></head><body class="gz">
  <section class="poster">
    <div class="grid"><span style="left:33.3%"></span><span style="left:66.6%"></span></div>
    <div class="wrap">
      <div class="idx">CH · {{DATE}}</div>
      <h1 class="h-display">{{TITLE}}</h1>
      <p class="lead">{{LEAD}}</p>
      <div class="foot"><span data-author>{{AUTHOR}}</span><span>SUPERSU</span></div>
    </div>
  </section></body></html>`;
}

const BUILD = {
  'image-led': tplImageLed,
  magazine: tplMagazine,
  quote: tplQuote,
  bigtype: tplBigtype,
  list: tplList,
  number: tplNumber,
  swiss: tplSwiss,
};

/** 这些版式已接入 V3 模板（其余仍走旧管线，右栏保持置灰占位）。 */
export const V3_LAYOUTS = Object.keys(BUILD);

/** styleId 是否由 V3 模板渲染。 */
export function isV3Style(styleId) {
  const meta = styleById(styleId);
  const layout = LAYOUT_ALIAS[meta.layout] || meta.layout;
  return !!BUILD[layout];
}

/** 各版式的标题基准字号（1440 高画布）。 */
const BASE_SIZE = {
  magazine: 118, quote: 96, bigtype: 146, 'image-led': 112, list: 78, number: 86, swiss: 104,
};

/** 标题字号分档：字数越多缩得越多，避免长标题把结尾挤成单字一行。 */
function titleSize(title, base) {
  const n = [...String(title || '').replace(/\s+/g, '')].length;
  if (n <= 8) return base;
  if (n <= 12) return Math.round(base * 0.82);
  if (n <= 18) return Math.round(base * 0.66);
  if (n <= 26) return Math.round(base * 0.54);
  return Math.round(base * 0.44);
}

/** 清单类版式的条目切分（与 layouts.js 同口径）。 */
function splitItems(lead) {
  const parts = String(lead || '')
    .split(/[·、／/｜|，,；;]+/)
    .map((s) => s.trim())
    .filter((s) => s.length >= 2);
  return parts.length >= 2 ? parts.slice(0, 4) : [];
}

/** 从标题里抽编号（「5 个方法」→ 05，「三件小事」→ 03），抽不到给 01。 */
function pickNumber(title) {
  const m = String(title || '').match(/(\d{1,3})/);
  if (m) return m[1].padStart(2, '0');
  const cn = { 一: '01', 二: '02', 三: '03', 四: '04', 五: '05', 六: '06', 七: '07', 八: '08', 九: '09', 十: '10' };
  const c = String(title || '').match(/[一二三四五六七八九十]/);
  return c ? cn[c[0]] : '01';
}

/**
 * 渲染 V3 模板。返回最终 HTML（已注入字体 / 底图 / fitty）。
 *
 * @param {object} o
 * @param {string} o.style   catalog 的 styleId（如 'quote-ink' / 'editorial-dune'）
 * @param {string} o.size    'xhs' | 'square' | 'wide'
 */
export function buildV3Html({
  style, size = 'xhs', title = '', lead = '', author = '', image = '',
  baseUrl = '', analysis = null, textPos = 'auto', frosted = false,
}) {
  const meta = styleById(style);
  const layout = LAYOUT_ALIAS[meta.layout] || meta.layout;
  const build = BUILD[layout];
  if (!build) throw new Error(`V3 模板未接入：${layout}`);
  const dim = COVER_SIZES[size] || COVER_SIZES.xhs;
  const pal = paletteOf(meta);
  let html = build(pal, dim, !!image);

  // 标题字号按字数分档（2026-11-06）：固定字号遇到长标题会「单字掉行」
  // （大字报 146px 实测把「脑」挤到单独一行）。分档比 fitty 更可控 ——
  // fitty 只保证「不溢出」，不保证「换行好看」。
  html = html.replace(/__HSIZE__/g, String(titleSize(title, BASE_SIZE[layout] || 100)));

  /* ⚠️ 必须带 id="xhs-cover"：render.js 的 renderCoverBlob / 预览都靠它取节点，
     缺了会直接抛「模板里找不到 #xhs-cover」，预览与导出全废（2026-11-06 实测）。 */
  html = html.replace(/<section class="poster"/, '<section class="poster" id="xhs-cover"');

  /* 文字位置（顶/中/底）：有底图时才生效，与 layouts.js 同口径用 transform 平移 ——
     纯色模式下整块本来就在版心内，再平移会顶出画布。
     ⚠️ 容器额外的 v3-body 类供门禁读取位置（测试要认 .inner-content/.content/.ly-body，
     这里补第 4 类，否则「文字位置三档」断言拿到 null）。 */
  html = html.replace(/<div class="wrap"/g, '<div class="wrap v3-body"');
  if (image && textPos && textPos !== 'auto') {
    const shift = { top: '-24%', center: '-8%', bottom: '0%' }[textPos] || '0%';
    html = html.replace('</style>', `.v3-body{transform:translateY(${shift})}</style>`);
  }

  // 清单类：把引语切成条目，切不出来退回一段话
  const items = splitItems(lead);
  if (items.length) {
    html = html.replace(
      '<div class="items" data-lead-list></div>',
      `<div class="items">${items.map((t, i) => `
        <div class="it"><span class="no">${String(i + 1).padStart(2, '0')}</span>`
        + `<span class="tx">${t.replace(/[&<>"]/g, (c) => (
          { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]))}</span></div>`).join('')}</div>`,
    );
  }
  // 编号大字：标题里的数字当主视觉
  html = html.replace(/<div class="num" data-num>01<\/div>/,
    `<div class="num" data-num>${pickNumber(title)}</div>`);

  return prepareCoverHtml(html, { title, lead, author, image, baseUrl, analysis, textPos, frosted });
}
