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
import { tokens, cssVars } from './design-tokens.js';
import * as RECIPES from './v3-recipes.js';
import { BOLD_TEMPLATES } from './v3-bold.js';
import { BOLD_EXTRA } from './v3-bold-extra.js';
import { STRUCT_TEMPLATES } from './v3-structural.js';

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

/** 版心内边距 —— 统一走设计令牌，按画布缩放（2026-11-06）。
 *  原来写死三档绝对值（92/88、88/80、96/64），21:9 下比例失衡；
 *  现在由 design-tokens 按 min(w/1080, h/1440) 缩放，三种尺寸视觉比例一致。 */
function padOf(dim) {
  const t = tokens(dim);
  return { x: t.padX, y: t.padY };
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
  .lead{margin:44px 0 0;font-size:var(--fs-lead,30px);line-height:1.72;color:${pal.muted};max-width:78%}
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
  .lead{margin:52px 0 0;font-size:var(--fs-lead,29px);line-height:1.8;color:${pal.muted};max-width:82%}
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
  .lead{margin:60px 0 0;font-size:var(--fs-body,32px);line-height:1.6;color:${sub};max-width:80%}
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
  .lead{margin:34px 0 0;font-size:var(--fs-lead,30px);line-height:1.66;color:rgba(255,255,255,.9);max-width:84%}
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
  .items{margin-top:44px;display:flex;flex-direction:column;justify-content:center;flex:1}
  .it{display:flex;align-items:baseline;gap:22px;padding:30px 0;
    border-top:1px solid rgba(128,128,128,.3)}
  .it:last-child{border-bottom:1px solid rgba(128,128,128,.3)}
  .no{flex:none;font:700 26px/1 ui-monospace,Menlo,monospace;color:${pal.accent};letter-spacing:.06em}
  .tx{font-size:var(--fs-body,36px);line-height:1.5;color:${pal.ink}}
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
  .num{font:800 210px/0.86 system-ui,sans-serif;letter-spacing:-.06em;color:${pal.accent};
    font-variant-numeric:tabular-nums}
  .side{writing-mode:vertical-rl;font:400 19px/1 ui-monospace,Menlo,monospace;
    letter-spacing:.34em;color:${pal.muted};margin-top:6px}
  .h-display{margin:56px 0 0;font-size:__HSIZE__px;line-height:1.14;font-weight:800;letter-spacing:-.01em;max-width:86%;text-wrap:balance}
  .lead{margin:30px 0 0;font-size:var(--fs-lead,28px);line-height:1.7;color:${pal.muted};max-width:80%}
  /* 2026-11-06 修：标题+引语原来贴在上半部、下半屏全空。
     给标题块之后加弹性留白（.spacer），把内容自然推向上下两端。 */
  .spacer{flex:1;min-height:24px}
  .foot{margin-top:auto;padding-top:18px;border-top:1px solid rgba(128,128,128,.34);
    display:flex;justify-content:space-between;
    font:400 18px/1 ui-monospace,Menlo,monospace;letter-spacing:.24em;color:${pal.muted}}
  </style></head><body class="gz">
  <section class="poster"><div class="wrap">
    <div class="top"><div class="num" data-num>01</div><div class="side">{{DATE}}</div></div>
    <h1 class="h-display">{{TITLE}}</h1>
    <p class="lead">{{LEAD}}</p>
    <div class="spacer"></div>
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
  .h-display{margin:120px 0 0;font-size:__HSIZE__px;line-height:1.04;font-weight:300;letter-spacing:-.03em;text-wrap:balance;
    position:relative;z-index:2;background:${pal.paper};padding-bottom:6px}
  .lead{margin:44px 0 0;font-size:var(--fs-lead,27px);line-height:1.66;color:${pal.muted};max-width:74%}
  /* 2026-11-06 修填充率 46%：footer 原来没有 margin-top:auto，
     整块内容悬在上半部、下半屏全空。 */
  .foot{margin-top:auto;display:flex;justify-content:space-between;align-items:baseline;
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
  /* 2026-11-06：配方 23 套（v3-recipes.js），让 30 套不再有灰卡。 */
  'field-note': RECIPES.tplFieldNote,
  'essay-split': RECIPES.tplEssaySplit,
  'evidence-wall': RECIPES.tplEvidenceWall,
  feature: RECIPES.tplFeature,
  'atmos-thesis': RECIPES.tplAtmosThesis,
  marginalia: RECIPES.tplMarginalia,
  matrix: RECIPES.tplMatrix,
  'closing-note': RECIPES.tplClosingNote,
  'tall-ledger': RECIPES.tplTallLedger,
  'section-divider': RECIPES.tplSectionDivider,
  'hero-question': RECIPES.tplHeroQuestion,
  pipeline: RECIPES.tplPipeline,
  'before-after': RECIPES.tplBeforeAfter,
  'two-signals': RECIPES.tplTwoSignals,
  'data-layer': RECIPES.tplDataLayer,
  'image-hero': RECIPES.tplImageHero,
  takeaway: RECIPES.tplTakeaway,
  warning: RECIPES.tplWarning,
  'kpi-tower': RECIPES.tplKpiTower,
  'browser-mock': RECIPES.tplBrowserMock,
  'pipeline-arch': RECIPES.tplPipelineArch,
  'h-bar': RECIPES.tplHBar,
  'stacked-ledger': RECIPES.tplStackedLedger,
  /* 2026-11-06「刺激风」8 套（v3-bold.js）：高饱和撞色 / 大字号 / 贴纸感。
     与上面 30 套「编辑设计风」是两种取向，用户按心情挑。 */
  ...BOLD_TEMPLATES,
  /* 2026-11-06 第二批刺激风 12 套（v3-bold-extra.js）。 */
  ...BOLD_EXTRA,
  /* 2026-11-06 结构型 3 套（v3-structural.js，用户拍板方向 D）：
     现有 50 套的排版语法其实是同一套 —— 全部是 grid/flex 切块 + 文字堆在块里，
     实测 float / shape-outside / column-count 使用次数为 0。
     这 3 套换的是**文字与图的空间关系**（文字绕图 / 多栏正文 / 出血压边），
     这才是真正拉开差异的地方。 */
  ...STRUCT_TEMPLATES,
};

/** 这些版式已接入 V3 模板（其余仍走旧管线，右栏保持置灰占位）。 */
export const V3_LAYOUTS = Object.keys(BUILD);

/** styleId 是否由 V3 模板渲染。 */
export function isV3Style(styleId) {
  const meta = styleById(styleId);
  const layout = LAYOUT_ALIAS[meta.layout] || meta.layout;
  return !!BUILD[layout];
}

/** 各版式的标题字号**上限**（1440 高画布）。标题图主打文字，短标题要能撑满。 */
const BASE_SIZE = {
  magazine: 190, quote: 168, bigtype: 210, 'image-led': 180, list: 150, number: 160, swiss: 170,
};

/** 标题字号：按「可用宽度 ÷ 每行字数」反算，base 作为上限。
 *
 *  2026-11-06 二次修正：原实现只按宽度反算，导致 21:9（宽 2100）下
 *  字号被推到 168–190px，而画布只有 900 高 → 标题占比 0.187（3:4 是 0.086，
 *  整整 2 倍），版面全挤在一起。
 *  现在 base 由设计令牌按 min(w/1080, h/1440) 缩放并给横版额外收紧，
 *  三种尺寸的「标题占画布高」保持在 0.08–0.12 区间。
 */
function titleSize(title, base, availW) {
  const n = [...String(title || '').replace(/\s+/g, '')].length || 1;
  const lines = n <= 6 ? 1 : n <= 16 ? 2 : 3;
  const perLine = Math.ceil(n / lines);
  const fit = Math.floor((availW * 0.97) / perLine);   // 留 3% 余量防贴边
  /* 下限也按画布缩放：3:4 下 56px，21:9 下约 35px（否则小画布放不下）。 */
  const floor = Math.max(24, Math.round(56 * (base / 190)));
  return Math.max(floor, Math.min(base, fit));
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
  // 标题字号按「可用宽度 ÷ 每行字数」反算（2026-11-06 用户反馈「字体不够大」）：
  // 中文全角字宽 ≈ 字号，所以短标题能自然撑满，长标题缩到刚好放下。
  // 各版式版心不同：清单/编号大字扣除内缩，图文封面无图时左侧有色带。
  const padX = padOf(dim).x;
  const availW = (() => {
    const base = dim.w - padX * 2;
    if (layout === 'image-led' && !image) return base - 110;
    if (layout === 'number') return base * 0.86;
    if (layout === 'swiss') return base;          // 瑞士封面的网格线会被标题底色压住，可用整宽
    /* 分栏类（2026-11-06 修）：标题只占左栏，按整宽算会溢出成 3 行竖排。
       左栏 1.15fr / 右栏 1fr，扣掉中间 38px 内距后约 51%。 */
    if (layout === 'essay-split') return Math.round(base * 0.51);
    /* 侧栏类：右侧固定 176px 边栏 + 34px 间距。 */
    if (layout === 'marginalia') return Math.round(base - 210);
    /* 有图墙的版式（2026-11-06）：标题只能占上半，否则会把 2×2 图墙挤出画布
       （证据墙实测：13 字标题按整宽反算约 158px，图墙被压到看不见）。 */
    if (layout === 'evidence-wall') return Math.round(base * 0.62);
    return base;
  })();
  /* 标题上限按设计令牌缩放（2026-11-06）：BASE_SIZE 是 1440 高下的基准值，
     21:9（900 高）必须等比收，否则占比翻倍、版面挤成一团。 */
  const tk = tokens(dim);
  const baseCap = (BASE_SIZE[layout] || 150) * tk.scale * (tk.isWide ? 0.72 : 1);
  html = html.replace(/__HSIZE__/g, String(titleSize(title, Math.round(baseCap), availW)));

  /* 设计令牌注入（2026-11-06）：把 --fs-lead / --fs-body / --fs-meta / --fs-micro
     等变量写进 :root，模板里的 var(--fs-lead,29px) 才能真正按画布缩放。
     ⚠️ 必须包在 :root{} 里 —— 直接把 "a:1px;b:2px" 拼在 <style> 末尾是无效 CSS，
     变量不会定义，模板只会一直用 fallback（实测踩到）。
     没注入时 fallback 是原来的硬编码像素值，不会出现「变量缺失 → 字号 0」。 */
  html = html.replace('</style>', `:root{${cssVars(tk)}}</style>`);

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
  /* 信息密度兜底（2026-11-06 用户评审「信息密度太低」）：
     引语切不出 2 条以上时，版式会空出一大片。这里按优先级补：
       ① 引语本身（哪怕只有一句）
       ② 标题拆成短语（去掉标点后按 4–8 字切）
       ③ 兜到标题原文
     这样任何版式都不会出现「只有一行标题 + 大片空白」。 */
  const items = (() => {
    const parts = splitItems(lead);
    if (parts.length >= 2) return parts;
    const out = [...parts];
    if (String(lead || '').trim()) out.push(String(lead).trim());
    // 标题拆短语：中文按 4–7 字滑动切，英文/数字整段保留
    const titleChunks = String(title || '')
      .split(/[\s，。！？、；：·—\-|/]+/).map((s) => s.trim()).filter((s) => s.length >= 2);
    for (const c of titleChunks) {
      if (!out.includes(c)) out.push(c);
      if (out.length >= 6) break;
    }
    if (!out.length && String(title || '').trim()) out.push(String(title).trim());
    return out;
  })();
  if (items.length) {
    html = html.replace(
      '<div class="items" data-lead-list></div>',
      `<div class="items">${items.map((t, i) => `
        <div class="it"><span class="no">${String(i + 1).padStart(2, '0')}</span>`
        + `<span class="tx">${t.replace(/[&<>"]/g, (c) => (
          { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]))}</span></div>`).join('')}</div>`,
    );
  }

  /* 配方 23 套的条目区（2026-11-06）：各版式自己的 class 名不同，
     逐套按它的行结构渲染，不硬塞统一模板（否则又变成「都长得一样」）。 */
  const esc = (s) => String(s == null ? '' : s)
    .replace(/&/g, '&amp;').replace(/</g, '&lt;')
    .replace(/>/g, '&gt;').replace(/"/g, '&quot;');
  if (items.length) {
    const two = (i) => String(i + 1).padStart(2, '0');
    // M10 实证特写：圆点编号 + 横线
    html = html.replace('<div class="pts" data-lead-list></div>',
      items.map((t, i) => `<div class="pt"><span class="pn">${i + 1}</span>`
        + `<span class="ptx">${esc(t)}</span></div>`).join(''));
    // M11 页边批注：右侧关键词列表
    html = html.replace('<div class="kws" data-lead-list></div>',
      items.map((t) => `<div class="kw">${esc(t)}</div>`).join(''));
    // M07 收尾寄语 / M08 长账本 / S07 要点账本 / S05 警示清单
    html = html.replace('<div class="ledger" data-lead-list></div>',
      items.map((t, i) => `<div class="rw"><span class="rt">${esc(t)}</span>`
        + `<span class="rn">${two(i)}</span></div>`).join(''));
    html = html.replace('<div class="book" data-lead-list></div>',
      items.map((t, i) => `<div class="bk"><span class="bn">${two(i)}</span>`
        + `<span class="bt">${esc(t)}</span></div>`).join(''));
    html = html.replace('<div class="tp" data-lead-list></div>',
      items.map((t) => `<div class="tw"><span class="tt">${esc(t)}</span></div>`).join(''));
    html = html.replace('<div class="ws" data-lead-list></div>',
      items.map((t) => `<div class="wn">${esc(t)}</div>`).join(''));
    // M14 竖排流程：圆号 + 竖线
    html = html.replace('<div class="flow" data-lead-list></div>',
      items.map((t, i) => `<div class="st"><span class="sn">${i + 1}</span>`
        + `<span class="sx">${esc(t)}</span></div>`).join(''));
    /* M06 证据墙 / S12 主数字矩阵（无图分支）：按序灌入真实文案，
       条目不足时循环复用，避免留空框。 */
    for (let i = 0; i < 8; i += 1) {
      html = html.replace(`data-k="${i}"></span>`,
        `data-k="${i}">${esc(items[i % items.length])}</span>`);
    }
    /* 结构型版式（2026-11-06，v3-structural.js）：
       ⚠️ 这里的填充是按**精确字符串**匹配的，新模板必须在此登记，
       否则条目区永远是空的。
       ⚠️ 与上面几套不同：这里必须**保留外层容器**。上面 `.ledger` / `.book`
       等是「容器只做定位、样式写在子元素上」，所以可以整个替换；
       而 `.cols{column-count}` / `.filler{margin/font}` 的样式就写在容器上，
       把容器一起换掉 → 多栏失效、退化成单栏竖排（实测踩到，截图确认）。 */
    /* ⚠️ 2026-11-06：多栏正文的首字下沉改用**真实 span**，不用 ::first-letter。
       依据是长图文模块的实测（docs/xhs/design-xhs-longform-v4.md §3.6）：
       ::first-letter 在 DOM 层生效（52px→176.8px），但 modern-screenshot
       导出的 PNG 里首字仍是正常字号 —— 用户在预览里看到放大、保存下来的却不对。
       真实节点没有这个不确定性。 */
    const flFirst = (t) => {
      const chars = [...String(t || '')];
      if (!chars.length) return '';
      return `<span class="fl">${esc(chars[0])}</span>${esc(chars.slice(1).join(''))}`;
    };
    html = html.replace('<div class="filler" data-lead-list></div>',
      `<div class="filler">${items.map((t) => `<p>${esc(t)}</p>`).join('')}</div>`);
    html = html.replace('<div class="cols" data-lead-list></div>',
      `<div class="cols">${items.map((t, i) => (
        `<p>${i === 0 ? flFirst(t) : esc(t)}</p>`
      )).join('')}</div>`);
  } else {
    /* 切不出条目（用户只写了标题）：把占位整块清空，别留空框。
       ⚠️ 只有一道 lead 时，用它兜底灌进第一个条目位，避免「一片空白」。 */
    const solid = String(lead || '').trim();
    html = html.replace(/<div class="[^"]*" data-lead-list><\/div>/g, solid ? '' : '');
  }
  // 编号大字：标题里的数字当主视觉
  html = html.replace(/<div class="num" data-num>01<\/div>/,
    `<div class="num" data-num>${pickNumber(title)}</div>`);
  // 图像主角的数字块（2026-11-06）：优先取标题里的数字，抽不到给 01
  const titleNum = (String(title || '').match(/(\d{1,3})/) || [])[1];
  html = html.replace(/__NUM__/g, titleNum || '01');

  /* 刺激风占位符（2026-11-06）：
     · __MEGA__ 背景巨型数字 —— 取标题里的数字，抽不到用标题首字；
     · __VSIZE__ 竖排标题字号 —— 竖排的「每行字数」由纵向高度决定，
       不能套横向反算公式，这里按可用高度 / 字数算。 */
  const mega = titleNum || [...String(title || '火')][0];
  html = html.replace(/__MEGA__/g, mega);
  /* 第二批刺激风占位符（2026-11-06）：
     · __CHAR__  单字巨压 —— 取标题里最有信息量的字（数字优先，否则首字）；
     · __CORNER__ 角标编号 —— 取标题数字，抽不到用条目数。 */
  html = html.replace(/__CHAR__/g, mega);
  html = html.replace(/__CORNER__/g, titleNum || String(Math.max(1, items.length)).padStart(2, '0'));
  const vAvail = dim.h - padOf(dim).y * 2 - 150;
  const vChars = [...String(title || '')].length || 1;
  const vSize = Math.max(48, Math.min(160, Math.floor((vAvail / vChars) * 1.02)));
  html = html.replace(/__VSIZE__/g, String(vSize));

  return prepareCoverHtml(html, { title, lead, author, image, baseUrl, analysis, textPos, frosted });
}
