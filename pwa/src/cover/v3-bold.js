/* 标题图 V3 · 刺激风模板组（2026-11-06 用户拍板「往更刺激的小红书风格走」）
 *
 * 与 v3-recipes.js 的「编辑设计风」（米纸底 + 衬线 + 细线）相对：
 *   · 高饱和撞色、大色块、超大字号、粗描边、贴纸感；
 *   · 目标是信息流里 0.3 秒抓住眼球，而不是耐看。
 *
 * 为什么单独一个文件：两类风格的设计语言完全不同，混在一个文件里
 * 半年后就没人分得清哪套是哪种取向；也让「再加模板」时能按风格批量扩。
 *
 * 约束与 v3-recipes 相同：DOM → PNG 截图，flex/grid 可用；
 * 标题一律 .h-display（字号由 buildV3Html 反算）、占位符走 prepareCoverHtml 协议。
 */

const esc = (s) => String(s == null ? '' : s)
  .replace(/&/g, '&amp;').replace(/</g, '&lt;')
  .replace(/>/g, '&gt;').replace(/"/g, '&quot;');

/** 强对比外壳：允许满版色块，不留纸白边。 */
export function bold(pal, dim, body, extraCss = '', bgColor) {
  return `<!doctype html><html lang="zh-CN"><head><meta charset="utf-8"><style>
  *{box-sizing:border-box} html,body{margin:0;padding:0}
  .poster{position:relative;width:${dim.w}px;height:${dim.h}px;overflow:hidden;isolation:isolate;
    background:${bgColor || pal.paper};color:${pal.ink};
    font-family:'Noto Sans SC','PingFang SC',system-ui,sans-serif}
  .wrap{position:relative;z-index:2;height:100%;display:flex;flex-direction:column;
    padding:0}
  .h-display{margin:0;font-size:__HSIZE__px;line-height:.94;font-weight:900;
    letter-spacing:-.04em;text-wrap:balance}
  ${extraCss}
  </style></head><body class="gz">
  <section class="poster"><div class="wrap v3-body">${body}</div></section></body></html>`;
}

/* ── 1. 撞色横幅：整版高饱和底 + 反白超大标题 + 贴纸条 ─────────────── */
export function tplBoldBanner(pal, dim, hasImage) {
  const bg = pal.accent;
  const fg = pal.accentOn;
  const p = dim.w === dim.h ? 76 : 88;
  return bold(pal, dim, `
    <div class="pad">
      <div class="ticker"><span>HOT · ${esc('{{DATE}}')}</span></div>
      <h1 class="h-display">{{TITLE}}</h1>
      <div class="strip">
        <span class="st">{{LEAD}}</span>
      </div>
      <div class="foot"><span data-author>@{{AUTHOR}}</span><span>SAVE THIS ↓</span></div>
    </div>`, `
  .poster{background:${bg};color:${fg}}
  .pad{flex:1;display:flex;flex-direction:column;padding:${p}px}
  .ticker{align-self:flex-start;border:3px solid ${fg};padding:8px 16px;margin-bottom:auto}
  .ticker span{font:800 19px/1 ui-monospace,Menlo,monospace;letter-spacing:.26em;color:${fg}}
  .h-display{color:${fg};margin:0 0 34px}
  .strip{background:${fg};color:${bg};padding:24px 26px;margin-top:auto;
    border-radius:4px;transform:rotate(-1.6deg)}
  .st{font-size:var(--fs-lead,30px);line-height:1.5;font-weight:700;display:block}
  .foot{display:flex;justify-content:space-between;align-items:baseline;margin-top:22px;
    font:800 18px/1 ui-monospace,Menlo,monospace;letter-spacing:.24em;color:${fg};opacity:.86}`,
  '', bg);
}

/* ── 2. 深底霓虹：近黑底 + 荧光全彩标题 + 发光描边 ─────────────────── */
export function tplNeonGlow(pal, dim, hasImage) {
  const p = dim.w === dim.h ? 80 : 92;
  return bold(pal, dim, `
    <div class="glow"></div>
    <div class="pad">
      <span class="kick">// SAVE FOR LATER</span>
      <h1 class="h-display">{{TITLE}}</h1>
      <p class="lead">{{LEAD}}</p>
      <div class="foot"><span data-author>{{AUTHOR}}</span><span>{{DATE}}</span></div>
    </div>`, `
  .poster{background:#0A0A0C;color:#F5F5F7}
  .glow{position:absolute;width:760px;height:760px;border-radius:50%;
    background:radial-gradient(circle, ${pal.accent} 0%, transparent 68%);
    filter:blur(90px);opacity:.55;right:-220px;top:-200px;z-index:0}
  .pad{flex:1;display:flex;flex-direction:column;padding:${p}px;position:relative;z-index:2}
  .kick{font:800 19px/1 ui-monospace,Menlo,monospace;letter-spacing:.3em;
    color:${pal.accent};margin-bottom:auto}
  .h-display{color:#fff;margin-bottom:34px;
    text-shadow:0 0 34px ${pal.accent}, 0 0 8px ${pal.accent}}
  .lead{margin:0;font-size:var(--fs-lead,29px);line-height:1.6;color:rgba(255,255,255,.74);max-width:86%}
  .foot{display:flex;justify-content:space-between;align-items:baseline;margin-top:auto;
    font:700 17px/1 ui-monospace,Menlo,monospace;letter-spacing:.26em;
    color:${pal.accent};opacity:.9}`,
  '', '#0A0A0C');
}

/* ── 3. 大字框贴：白底 + 黑粗框 + 内嵌反白色块 + 硬阴影 ─────────────── */
export function tplStickerBox(pal, dim, hasImage) {
  const p = dim.w === dim.h ? 64 : 76;
  return bold(pal, dim, `
    <div class="pad">
      <div class="box">
        <h1 class="h-display">{{TITLE}}</h1>
        <div class="blk"><span>{{LEAD}}</span></div>
      </div>
      <div class="foot"><span data-author>BY {{AUTHOR}}</span><span>{{DATE}}</span></div>
    </div>`, `
  .poster{background:${pal.paper}}
  .pad{flex:1;display:flex;flex-direction:column;padding:${p}px}
  .box{flex:1;border:6px solid #0B0B0C;background:#fff;
    box-shadow:14px 14px 0 ${pal.accent};display:flex;flex-direction:column;
    padding:38px;justify-content:space-between}
  .h-display{color:#0B0B0C}
  .blk{background:#0B0B0C;color:#fff;padding:24px 26px;margin-top:30px}
  .blk span{font-size:var(--fs-lead,29px);line-height:1.5;font-weight:700;display:block}
  .foot{display:flex;justify-content:space-between;align-items:baseline;margin-top:20px;
    font:800 18px/1 ui-monospace,Menlo,monospace;letter-spacing:.24em;color:#0B0B0C}`,
  '', pal.paper);
}

/* ── 4. 分屏撞色：上下/左右两块高饱和对撞 ──────────────────────────── */
export function tplSplitClash(pal, dim, hasImage) {
  const p = dim.w === dim.h ? 72 : 84;
  return bold(pal, dim, `
    <div class="top">
      <span class="tag">01 / SAVE</span>
      <h1 class="h-display">{{TITLE}}</h1>
    </div>
    <div class="bot">
      <span class="lead">{{LEAD}}</span>
      <span class="sig" data-author>{{AUTHOR}} · {{DATE}}</span>
    </div>`, `
  .poster{background:${pal.accent}}
  .top{flex:1.25;display:flex;flex-direction:column;padding:${p}px;
    background:${pal.accent};color:${pal.accentOn}}
  .tag{align-self:flex-start;font:800 18px/1 ui-monospace,Menlo,monospace;
    letter-spacing:.28em;opacity:.9;margin-bottom:auto}
  .h-display{color:${pal.accentOn};margin-top:32px}
  .bot{flex:1;display:flex;flex-direction:column;justify-content:space-between;
    padding:${p}px;background:#0B0B0C;color:#fff}
  .lead{font-size:var(--fs-lead,31px);line-height:1.55;font-weight:700;max-width:94%}
  .sig{font:700 17px/1 ui-monospace,Menlo,monospace;letter-spacing:.26em;
    color:rgba(255,255,255,.7);margin-top:26px}`,
  '', pal.accent);
}

/* ── 5. 数字轰炸：巨大数字当背景 + 反白标题 ────────────────────────── */
export function tplMegaNumber(pal, dim, hasImage) {
  const p = dim.w === dim.h ? 68 : 80;
  return bold(pal, dim, `
    <div class="bignum">__MEGA__</div>
    <div class="pad">
      <span class="kick">NUMBER ONE</span>
      <h1 class="h-display">{{TITLE}}</h1>
      <p class="lead">{{LEAD}}</p>
      <div class="foot"><span data-author>{{AUTHOR}}</span><span>{{DATE}}</span></div>
    </div>`, `
  .poster{background:${pal.accent}}
  .bignum{position:absolute;right:-60px;bottom:-180px;z-index:0;
    font:900 620px/1 system-ui,sans-serif;letter-spacing:-.09em;
    color:${pal.accentOn};opacity:.16;user-select:none}
  .pad{flex:1;display:flex;flex-direction:column;padding:${p}px;position:relative;z-index:2}
  .kick{align-self:flex-start;font:800 18px/1 ui-monospace,Menlo,monospace;
    letter-spacing:.3em;color:${pal.accentOn};opacity:.86;margin-bottom:auto}
  .h-display{color:${pal.accentOn};margin-bottom:30px}
  .lead{margin:0;font-size:var(--fs-lead,29px);line-height:1.55;font-weight:700;
    color:${pal.accentOn};opacity:.9;max-width:84%}
  .foot{display:flex;justify-content:space-between;align-items:baseline;margin-top:auto;
    font:700 17px/1 ui-monospace,Menlo,monospace;letter-spacing:.26em;
    color:${pal.accentOn};opacity:.8}`,
  '', pal.accent);
}

/* ── 6. 手写标记：纸底 + 荧光高分笔 + 红圈圈重点 ───────────────────── */
export function tplHighlighter(pal, dim, hasImage) {
  const p = dim.w === dim.h ? 80 : 92;
  return bold(pal, dim, `
    <div class="pad">
      <span class="kick">✱ READ THIS</span>
      <h1 class="h-display"><span class="hl">{{TITLE}}</span></h1>
      <p class="lead">{{LEAD}}</p>
      <div class="foot"><span data-author>{{AUTHOR}}</span><span>{{DATE}}</span></div>
    </div>`, `
  .poster{background:${pal.paper}}
  .pad{flex:1;display:flex;flex-direction:column;padding:${p}px}
  .kick{font:800 19px/1 ui-monospace,Menlo,monospace;letter-spacing:.3em;
    color:${pal.accent};margin-bottom:auto}
  .h-display{margin-bottom:32px}
  /* 荧光笔：用渐变在下半截压一条高亮，模拟马克笔 */
  .hl{background:linear-gradient(180deg, transparent 56%, ${pal.accent} 56%,
    ${pal.accent} 92%, transparent 92%);padding:0 6px}
  .lead{margin:0;font-size:var(--fs-lead,29px);line-height:1.66;color:${pal.ink};opacity:.78;max-width:88%}
  .foot{display:flex;justify-content:space-between;align-items:baseline;margin-top:auto;
    font:700 17px/1 ui-monospace,Menlo,monospace;letter-spacing:.26em;
    color:${pal.ink};opacity:.55}`,
  '', pal.paper);
}

/* ── 7. 竖排冲击：中式竖排 + 大地色块 ──────────────────────────────── */
export function tplVerticalImpact(pal, dim, hasImage) {
  /* 竖排标题不能用横向反算（竖排的「每行字数」由纵向高度决定）。
     字号由 buildV3Html 用真实标题算好，通过 __VSIZE__ 注入。 */
  const p = dim.w === dim.h ? 72 : 84;
  return bold(pal, dim, `
    <div class="pad">
      <div class="vrow">
        <h1 class="h-display vtitle">{{TITLE}}</h1>
        <div class="vmeta"><span>{{DATE}}</span><span data-author>{{AUTHOR}}</span></div>
      </div>
      <div class="bar"><span>{{LEAD}}</span></div>
    </div>`, `
  .poster{background:${pal.ink};color:${pal.paper}}
  .pad{flex:1;display:flex;flex-direction:column;padding:${p}px}
  .vrow{flex:1;display:flex;justify-content:space-between;align-items:flex-start;
    gap:24px;margin-bottom:26px}
  .vtitle{writing-mode:vertical-rl;text-orientation:upright;
    font-size:__VSIZE__px !important;line-height:1.08;letter-spacing:.02em;
    color:${pal.paper};max-height:100%}
  .vmeta{writing-mode:vertical-rl;display:flex;gap:30px;
    font:700 16px/1 ui-monospace,Menlo,monospace;letter-spacing:.34em;
    color:${pal.accent}}
  .bar{background:${pal.accent};color:${pal.accentOn};padding:22px 26px}
  .bar span{font-size:var(--fs-lead,27px);line-height:1.5;font-weight:700;display:block}`,
  '', pal.ink);
}

/* ── 8. 杂志撞色：一半实色 + 一半纸白，中间跨栏大标题 ──────────────── */
export function tplHalfClash(pal, dim, hasImage) {
  const p = Math.round(dim.w / 13);
  return bold(pal, dim, `
    <div class="left"></div>
    <div class="right"></div>
    <div class="pad">
      <span class="kick">ISSUE {{DATE}}</span>
      <h1 class="h-display">{{TITLE}}</h1>
      <p class="lead">{{LEAD}}</p>
      <div class="foot"><span data-author>{{AUTHOR}}</span><span>SUPERSU</span></div>
    </div>`, `
  .left,.right{position:absolute;top:0;bottom:0;z-index:0}
  .left{left:0;width:38%;background:${pal.accent}}
  .right{left:38%;right:0;background:${pal.paper}}
  .pad{flex:1;display:flex;flex-direction:column;
    padding:${dim.w === dim.h ? 76 : 88}px;position:relative;z-index:2}
  .kick{align-self:flex-end;font:800 18px/1 ui-monospace,Menlo,monospace;
    letter-spacing:.3em;color:${pal.accent};margin-bottom:auto}
  .h-display{margin-bottom:32px;color:${pal.ink}}
  .lead{margin:0;font-size:var(--fs-lead,29px);line-height:1.6;font-weight:600;
    color:${pal.ink};opacity:.8;max-width:80%}
  .foot{display:flex;justify-content:space-between;align-items:baseline;margin-top:auto;
    font:800 17px/1 ui-monospace,Menlo,monospace;letter-spacing:.26em;color:${pal.ink}}`,
  '', pal.paper);
}

export const BOLD_TEMPLATES = {
  'bold-banner': tplBoldBanner,
  'neon-glow': tplNeonGlow,
  'sticker-box': tplStickerBox,
  'split-clash': tplSplitClash,
  'mega-number': tplMegaNumber,
  highlighter: tplHighlighter,
  'vertical-impact': tplVerticalImpact,
  'half-clash': tplHalfClash,
};
