/* 文艺长图文 · 共享设计系统（本目录唯一真源）
 *
 * 规范来源：references/style-system.md / components.md / background-systems.md
 *   · 「越大越细」：Display weight 500 + 宽字距，正文衬线，小字 mono 才可 500
 *   · 编辑风禁止纯色纸底：必须 3–5 层（纸基 / 纸纹 / 墨染 / 结构线 / 内容）
 *   · 字号硬下限：正文 ≥40px、题注 ≥26px（2026-11-07 按小红书手机端可读性重定标：
 *     1080 画布在 iPhone 14 上缩放 0.361，30px 只显示成 10.8px，看不清）；放不下先删文案，不缩字号
 *   · 动势 = 静态 SVG 墨流 / 等高线 / 斜切，导出即 PNG，不做 WebGL
 *
 * 用法：每个模板函数返回「.page 内部的 HTML」；外层 page() 负责画布、
 *       字体、背景层与页眉页脚契约。
 */

/* ── 产品 dist 资源绝对前缀（移植适配）─────────────────────────────
 * 本模块生成的 HTML 会进 srcdoc iframe（预览 / renderPageDoc 出图），
 * srcdoc 里的相对路径会解析到 about:srcdoc 而 404。
 * 产品 cards.js::pageDoc 用 opts.baseUrl 绝对路径注入字体，这里同思路：
 *   dist/src/cover/v6/<file>.js → 上三级 = dist/
 * 字体/vendor 已在 dist/fonts/cover/ 与 dist/vendor/，构建已拷，无需新增资源。
 */
const ASSET_BASE = new URL('../../../', import.meta.url).href;
const FONT_BASE = `${ASSET_BASE}fonts/cover/`;


/* ── 8 套色板（文艺 5 / 结构化 3）────────────────────────────── */
export const PALETTES = {
  xuan:   { name: '宣纸朱砂', paper:'#F3EDE0', paper2:'#E7DECC', ink:'#221E19', muted:'#7A7164', accent:'#A6432C', accentSoft:'#C77B62', line:'rgba(34,30,25,.18)', dark:false },
  qing:   { name: '青瓷烟雨', paper:'#EDF1ED', paper2:'#DDE6DE', ink:'#1E2B26', muted:'#6B7C73', accent:'#3F6B58', accentSoft:'#7FA08C', line:'rgba(30,43,38,.16)', dark:false },
  lan:    { name: '靛蓝夜航', paper:'#141B29', paper2:'#1E2738', ink:'#EDF0F4', muted:'#96A2B4', accent:'#D8AE6A', accentSoft:'#8C98AD', line:'rgba(237,240,244,.18)', dark:true  },
  ou:     { name: '藕荷诗笺', paper:'#F5EFEC', paper2:'#E9DEDA', ink:'#33262A', muted:'#887278', accent:'#9A5E6E', accentSoft:'#C0929C', line:'rgba(51,38,42,.17)', dark:false },
  mo:     { name: '墨金长卷', paper:'#171613', paper2:'#222019', ink:'#F0E9D8', muted:'#9A917C', accent:'#C9A45C', accentSoft:'#7E7358', line:'rgba(240,233,216,.17)', dark:true  },
  cha:    { name: '茶褐纪事', paper:'#EFE5D4', paper2:'#E0D1B8', ink:'#2B2116', muted:'#7A6A54', accent:'#8A5A2B', accentSoft:'#B58B5E', line:'rgba(43,33,22,.19)', dark:false },
  swiss:  { name: '瑞士冷白', paper:'#F7F7F4', paper2:'#EAEAE5', ink:'#141414', muted:'#70706B', accent:'#0033A0', accentSoft:'#7E96C8', line:'rgba(20,20,20,.16)', dark:false },
  cinnabar:{ name:'朱印本',  paper:'#F6EFE2', paper2:'#EBDFC9', ink:'#2A1B14', muted:'#806B58', accent:'#C0392B', accentSoft:'#D98476', line:'rgba(42,27,20,.18)', dark:false },
};

/* ── 字体栈：文艺族用衬线，瑞士/结构化用无衬线 ───────────────── */
const SERIF = "'NotoSerifSC','Songti SC','STSong',serif";
const SANS  = "'NotoSansSC','PingFang SC',sans-serif";
const WENKAI = "'WenKai','Kaiti SC','STKaiti',serif";
const XIAOWEI = "'ZcoolXiaowei','Songti SC',serif";
const LONGCANG = "'LongCang','Kaiti SC',serif";
const MONO = "ui-monospace,'Cascadia Mono',Menlo,monospace";

function fontFaces() {
  return `
  @font-face{font-family:'NotoSerifSC';src:url('${FONT_BASE}noto-serif-sc-400.woff2') format('woff2');font-weight:400;font-display:block}
  @font-face{font-family:'NotoSerifSC';src:url('${FONT_BASE}noto-serif-sc-700.woff2') format('woff2');font-weight:700;font-display:block}
  @font-face{font-family:'NotoSansSC';src:url('${FONT_BASE}noto-sans-sc-400.woff2') format('woff2');font-weight:400;font-display:block}
  @font-face{font-family:'NotoSansSC';src:url('${FONT_BASE}noto-sans-sc-700.woff2') format('woff2');font-weight:700;font-display:block}
  @font-face{font-family:'WenKai';src:url('${FONT_BASE}wenkai.woff2') format('woff2');font-display:block}
  @font-face{font-family:'ZcoolXiaowei';src:url('${FONT_BASE}zcool-xiaowei.woff2') format('woff2');font-display:block}
  @font-face{font-family:'LongCang';src:url('${FONT_BASE}longcang.woff2') format('woff2');font-display:block}
  @font-face{font-family:'Zhimangxing';src:url('${FONT_BASE}zhimangxing.woff2') format('woff2');font-display:block}`;
}

function vars(p) {
  return `--paper:${p.paper};--paper2:${p.paper2};--ink:${p.ink};--muted:${p.muted};`
    + `--accent:${p.accent};--accentSoft:${p.accentSoft};--line:${p.line};`
    + `--serif:${SERIF};--sans:${SANS};--wenkai:${WENKAI};--xiaowei:${XIAOWEI};--longcang:${LONGCANG};--mono:${MONO};`;
}

/* ── SVG 装饰层：程序化纸纹 / 墨染 / 等高线（全部静态，导出即 PNG）──
   实测 modern-screenshot 可正确导出 feTurbulence / radialGradient / clipPath。
   seed 用离散值，保证同一模板每次渲染一致（不随机）。 */
export function svgLayers(p, opts = {}) {
  const id = opts.id || 'a';
  const motion = !!opts.motion;          // 动势版：等高线 + 斜切墨流
  const dark = !!p.dark;
  const inkStop = dark ? p.accent : p.accentSoft;
  const wash = dark ? '0.16' : '0.13';
  const lines = motion
    ? `<g clip-path="url(#arc${id})" fill="none" stroke="${inkStop}" stroke-opacity="${dark?'.20':'.15'}" stroke-width="1.1">
         ${Array.from({length:9},(_,i)=>{
           const y=760+i*34, c=540+(i%3-1)*80;
           return `<path d="M-40,${y} Q${c},${y-260-(i%4)*36} 1120,${y+40}"/>`;
         }).join('')}
       </g>
       <path d="M0,1180 Q420,980 1080,1130 L1080,1440 L0,1440 Z" fill="${inkStop}" opacity="${dark?'.055':'.045'}"/>
       <circle cx="880" cy="250" r="150" fill="none" stroke="${inkStop}" stroke-opacity=".22" stroke-width="1"/>
       <circle cx="880" cy="250" r="196" fill="none" stroke="${inkStop}" stroke-opacity=".12" stroke-width="1"/>`
    : `<g fill="none" stroke="${inkStop}" stroke-opacity="${dark?'.13':'.10'}" stroke-width="1">
         <path d="M0,1188 H1080"/><path d="M0,1212 H1080"/>
       </g>
       <circle cx="120" cy="180" r="58" fill="none" stroke="${inkStop}" stroke-opacity=".14" stroke-width="1"/>`;
  return `
  <svg class="fx fx-grain" viewBox="0 0 1080 1440" preserveAspectRatio="none" aria-hidden="true">
    <filter id="grain${id}"><feTurbulence type="fractalNoise" baseFrequency="0.9" numOctaves="3" stitchTiles="stitch"/>
      <feColorMatrix type="saturate" values="0"/></filter>
    <rect width="1080" height="1440" filter="url(#grain${id})" opacity="${dark?'.07':'.085'}"/>
  </svg>
  <svg class="fx fx-ink" viewBox="0 0 1080 1440" aria-hidden="true">
    <defs>
      <radialGradient id="wash${id}" cx="20%" cy="14%" r="70%">
        <stop offset="0%" stop-color="${inkStop}" stop-opacity="${wash}"/>
        <stop offset="100%" stop-color="${inkStop}" stop-opacity="0"/>
      </radialGradient>
      <radialGradient id="wash2${id}" cx="86%" cy="88%" r="52%">
        <stop offset="0%" stop-color="${inkStop}" stop-opacity="${dark?'.10':'.08'}"/>
        <stop offset="100%" stop-color="${inkStop}" stop-opacity="0"/>
      </radialGradient>
      <clipPath id="arc${id}"><path d="M0,700 Q540,520 1080,760 L1080,1440 L0,1440 Z"/></clipPath>
    </defs>
    <rect width="1080" height="1440" fill="url(#wash${id})"/>
    <rect width="1080" height="1440" fill="url(#wash2${id})"/>
    ${lines}
  </svg>`;
}

/* ── 画布外壳：固定 1080×1440，导出契约 #xhs-cover ─────────────── */
const BASE_CSS = `
  *{box-sizing:border-box}
  html,body{margin:0;padding:0}
  #xhs-cover{position:relative;width:1080px;height:1440px;overflow:hidden;
    background:var(--paper);color:var(--ink)}
  .fx{position:absolute;inset:0;width:100%;height:100%;pointer-events:none}
  .fx-grain{z-index:0;mix-blend-mode:multiply}
  .fx-ink{z-index:1}
  .page-content{position:relative;z-index:3;height:100%;padding:96px}
  /* 通用排印：越大越细 */
  .kicker{font:500 21px/1 var(--mono);letter-spacing:.22em;color:var(--accent);margin:0}
  .meta{font:500 19px/1 var(--mono);letter-spacing:.20em;color:var(--muted);margin:0}
  .display{font-family:var(--serif);font-weight:500;letter-spacing:.035em;line-height:1.16;margin:0;
    text-wrap:balance}
  .h-xl{font-family:var(--serif);font-weight:500;letter-spacing:.03em;line-height:1.2;margin:0;
    text-wrap:balance}
  .body{font-family:var(--serif);font-size:30px;line-height:1.85;font-weight:400;margin:0}
  .caption{font:500 20px/1.5 var(--mono);letter-spacing:.14em;color:var(--muted);margin:0}
  .rule{height:1px;background:var(--line);border:0;margin:0}
  .rule-strong{height:3px;background:var(--ink);border:0;margin:0}
  .fl{float:left;font-size:3.1em;line-height:.82;font-weight:500;
      padding:8px 14px 0 0;color:var(--accent)}
  .stamp{display:inline-flex;align-items:center;justify-content:center;
    border:2px solid var(--accent);color:var(--accent);font-family:var(--serif);
    font-weight:500;letter-spacing:.1em}
  .no-select{user-select:none}
`;

/** 生成一个完整、自包含、可直接截图/直接双击打开的 HTML 文档。 */
export function pageDoc({ pal, id, motion = false, head = '', body = '', foot = '', extraCss = '', artSvg = '' }) {
  const p = PALETTES[pal] || PALETTES.xuan;
  return `<!doctype html><html lang="zh-CN"><head><meta charset="utf-8">
<style>${fontFaces()}
:root{${vars(p)}}
${BASE_CSS}
${extraCss}</style></head><body>
<div id="xhs-cover">
  ${svgLayers(p, { id, motion })}
  ${artSvg}
  <div class="page-content">
    ${head}
    ${body}
    ${foot}
  </div>
</div>
<script src="${ASSET_BASE}vendor/modern-screenshot.js"></script>
</body></html>`;
}

/** 看板模式：同一文档里放多个 .page，用 iframe 之外的 grid 排列。
 *  注意：看板只用于浏览，成品导出仍按单页 #xhs-cover 契约。 */
export function galleryDoc(pages, { columns = 4 } = {}) {
  const faces = fontFaces().replaceAll("./assets/", "./assets/");
  return `<!doctype html><html lang="zh-CN"><head><meta charset="utf-8">
<style>${faces}
*{box-sizing:border-box}html,body{margin:0;padding:0;background:#e9e3d7}
.gallery{display:grid;grid-template-columns:repeat(${columns},1fr);gap:18px;padding:24px}
.frame{width:100%;aspect-ratio:3/4;overflow:hidden;position:relative;background:#fff;
  box-shadow:0 2px 14px rgba(0,0,0,.10)}
.frame iframe{position:absolute;top:0;left:0;width:1080px;height:1440px;border:0;
  transform:scale(var(--s,.25));transform-origin:top left}
.cap{padding:8px 4px 14px;font:500 13px/1.5 ui-monospace,monospace;color:#3a332a}
.cap b{color:#8a4a2e}
</style></head><body><div class="gallery">
${pages.map((p,i)=>`<div>
  <div class="frame"><iframe scrolling="no" src="./tpl.html?id=${p.id}"></iframe></div>
  <div class="cap"><b>${String(i+1).padStart(2,'0')} · ${esc(p.name)}</b>　${esc(p.family)} / ${esc(p.mood)}</div>
</div>`).join('')}
</div></body></html>`;
}

function esc(s){return String(s==null?'':s).replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;')}
