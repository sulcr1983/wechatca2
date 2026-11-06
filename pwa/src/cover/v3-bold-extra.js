/* 标题图 V3 · 刺激风扩展组（2026-11-06）
 *
 * 用户原话：「可以增加更多的模板，往更刺激的小红书风格走，我们的目的是增加无数
 * 好看的模板给用户去选。因为人会腻的，模板少人家就不用了。」
 *
 * 与 v3-bold.js 同一设计语言（高饱和撞色 / 超大字号 / 贴纸感），但每套的**版面结构**
 * 必须不同 —— 判据是「盖住配色后，两套的块结构不能用一句话互相描述」。
 *
 * 复用 v3-bold.js 的 bold() 外壳与色板分流（catalog 的 BOLD_PALETTES）。
 */

import { bold } from './v3-bold.js';

/* ── 9. 斜切色块：对角线切开，两半撞色 ─────────────────────────────── */
export function tplDiagonal(pal, dim, hasImage) {
  const p = dim.w === dim.h ? 76 : 88;
  return bold(pal, dim, `
    <div class="slice"></div>
    <div class="pad">
      <span class="kick">CUT THROUGH</span>
      <h1 class="h-display">{{TITLE}}</h1>
      <p class="lead">{{LEAD}}</p>
      <div class="foot"><span data-author>{{AUTHOR}}</span><span>{{DATE}}</span></div>
    </div>`, `
  .slice{position:absolute;inset:0;z-index:0;
    background:linear-gradient(168deg, ${pal.accentOn}22 0 49.7%, transparent 49.7%)}
  .pad{flex:1;display:flex;flex-direction:column;padding:${p}px;position:relative;z-index:2}
  .kick{align-self:flex-start;font:900 19px/1 ui-monospace,Menlo,monospace;
    letter-spacing:.32em;color:${pal.accentOn};opacity:.8;margin-bottom:auto}
  .h-display{color:${pal.accentOn};margin-bottom:32px}
  .lead{margin:0;font-size:var(--fs-lead,30px);line-height:1.55;font-weight:700;
    color:${pal.accentOn};opacity:.88;max-width:88%}
  .foot{display:flex;justify-content:space-between;align-items:baseline;margin-top:auto;
    font:800 17px/1 ui-monospace,Menlo,monospace;letter-spacing:.26em;
    color:${pal.accentOn};opacity:.72}`, '', pal.accent);
}

/* ── 10. 卡片叠层：三张卡片错位堆叠（贴纸感）──────────────────────── */
export function tplCardStack(pal, dim, hasImage) {
  const p = dim.w === dim.h ? 64 : 76;
  return bold(pal, dim, `
    <div class="pad">
      <div class="stack">
        <div class="card back"></div>
        <div class="card mid"></div>
        <div class="card front">
          <h1 class="h-display">{{TITLE}}</h1>
          <span class="lead">{{LEAD}}</span>
        </div>
      </div>
      <div class="foot"><span data-author>BY {{AUTHOR}}</span><span>{{DATE}}</span></div>
    </div>`, `
  .poster{background:${pal.paper2}}
  .pad{flex:1;display:flex;flex-direction:column;padding:${p}px}
  .stack{flex:1;position:relative}
  .card{position:absolute;border:5px solid ${pal.ink};border-radius:14px;
    box-shadow:10px 10px 0 rgba(0,0,0,.22)}
  .card.back{left:26px;top:26px;right:0;bottom:0;background:${pal.accent};opacity:.5}
  .card.mid{left:13px;top:13px;right:13px;bottom:13px;background:${pal.paper}}
  .card.front{left:0;top:0;right:26px;bottom:26px;background:${pal.accent};
    color:${pal.accentOn};display:flex;flex-direction:column;justify-content:flex-end;
    gap:26px;padding:34px}
  .h-display{color:${pal.accentOn};margin-top:auto}
  .lead{font-size:var(--fs-lead,28px);line-height:1.5;font-weight:700;color:${pal.accentOn};
    opacity:.9;display:block}
  .foot{display:flex;justify-content:space-between;align-items:baseline;margin-top:14px;
    font:800 17px/1 ui-monospace,Menlo,monospace;letter-spacing:.24em;color:${pal.ink}`, '', pal.paper2);
}

/* ── 11. 大色块分割：上下两大条，中间细缝 ──────────────────────────── */
export function tplBands(pal, dim, hasImage) {
  const p = dim.w === dim.h ? 70 : 82;
  return bold(pal, dim, `
    <div class="band top">
      <span class="num">01</span>
      <h1 class="h-display">{{TITLE}}</h1>
    </div>
    <div class="gap"></div>
    <div class="band bot">
      <span class="lead">{{LEAD}}</span>
      <span class="sig" data-author>{{AUTHOR}} · {{DATE}}</span>
    </div>`, `
  .wrap{display:flex;flex-direction:column;background:${pal.ink};gap:8px}
  .band{display:flex;flex-direction:column;padding:${p}px}
  .band.top{flex:1.4;background:${pal.accent};color:${pal.accentOn};justify-content:space-between}
  .band.bot{flex:1;background:${pal.ink};color:${pal.paper};justify-content:space-between}
  .gap{height:8px;background:${pal.accent}}
  .num{font:900 26px/1 ui-monospace,Menlo,monospace;letter-spacing:.3em;
    color:${pal.accentOn};opacity:.82}
  .h-display{color:${pal.accentOn}}
  .lead{font-size:var(--fs-lead,29px);line-height:1.55;font-weight:700;color:${pal.paper}}
  .sig{font:800 17px/1 ui-monospace,Menlo,monospace;letter-spacing:.26em;
    color:${pal.paper};opacity:.6}`, '', pal.ink);
}

/* ── 12. 圆环强调：大色圈 + 居中大字 ──────────────────────────────── */
export function tplRingFocus(pal, dim, hasImage) {
  const size = Math.round(Math.min(dim.w, dim.h) * 0.72);
  return bold(pal, dim, `
    <div class="ring" style="width:${size}px;height:${size}px"></div>
    <div class="pad">
      <h1 class="h-display">{{TITLE}}</h1>
      <p class="lead">{{LEAD}}</p>
      <div class="foot"><span data-author>{{AUTHOR}}</span><span>{{DATE}}</span></div>
    </div>`, `
  .poster{display:flex;align-items:center;justify-content:center;background:${pal.paper}}
  .ring{position:absolute;border-radius:50%;background:${pal.accent};z-index:0}
  .pad{position:relative;z-index:2;flex:1;display:flex;flex-direction:column;
    align-items:center;justify-content:center;text-align:center;padding:0 84px}
  .h-display{color:${pal.accentOn};text-align:center}
  .lead{margin:30px 0 0;font-size:var(--fs-lead,27px);line-height:1.55;font-weight:700;
    color:${pal.accentOn};opacity:.9;max-width:88%;text-align:center}
  .foot{position:absolute;left:84px;right:84px;bottom:80px;
    display:flex;justify-content:space-between;align-items:baseline;
    font:800 17px/1 ui-monospace,Menlo,monospace;letter-spacing:.26em;
    color:${pal.ink};opacity:.6}`, '', pal.paper);
}

/* ── 13. 标签流水：一排彩色标签 + 大标题 ───────────────────────────── */
export function tplTagFlow(pal, dim, hasImage) {
  const p = dim.w === dim.h ? 76 : 88;
  return bold(pal, dim, `
    <div class="pad">
      <div class="tags">
        <span class="tg">NEW</span><span class="tg">HOT</span><span class="tg">2026</span>
      </div>
      <h1 class="h-display">{{TITLE}}</h1>
      <div class="strip"><span>{{LEAD}}</span></div>
      <div class="foot"><span data-author>{{AUTHOR}}</span><span>SWIPE →</span></div>
    </div>`, `
  .poster{background:${pal.paper}}
  .pad{flex:1;display:flex;flex-direction:column;padding:${p}px}
  .tags{display:flex;gap:10px;margin-bottom:auto}
  .tg{font:900 17px/1 ui-monospace,Menlo,monospace;letter-spacing:.2em;
    padding:9px 15px;background:${pal.accent};color:${pal.accentOn}}
  .tg:nth-child(2){background:${pal.ink};color:${pal.paper}}
  .tg:nth-child(3){background:none;color:${pal.accent};border:3px solid ${pal.accent}}
  .h-display{color:${pal.ink};margin-bottom:28px}
  .strip{background:${pal.accent};color:${pal.accentOn};padding:22px 24px;margin-top:auto}
  .strip span{font-size:var(--fs-lead,29px);line-height:1.5;font-weight:700;display:block}
  .foot{display:flex;justify-content:space-between;align-items:baseline;margin-top:20px;
    font:800 17px/1 ui-monospace,Menlo,monospace;letter-spacing:.24em;color:${pal.ink}}`, '', pal.paper);
}

/* ── 14. 边框冲击：内描边双框 + 反白大字 ───────────────────────────── */
export function tplFrameHit(pal, dim, hasImage) {
  const p = dim.w === dim.h ? 60 : 72;
  return bold(pal, dim, `
    <div class="frame">
      <div class="inner">
        <span class="kick">SAVE / SHARE</span>
        <h1 class="h-display">{{TITLE}}</h1>
        <p class="lead">{{LEAD}}</p>
        <div class="foot"><span data-author>{{AUTHOR}}</span><span>{{DATE}}</span></div>
      </div>
    </div>`, `
  .poster{background:${pal.accent};display:flex;align-items:center;justify-content:center}
  .frame{position:absolute;inset:${p}px;border:5px solid ${pal.accentOn};
    display:flex;padding:10px}
  .inner{flex:1;border:2px solid ${pal.accentOn}55;display:flex;flex-direction:column;
    padding:44px}
  .kick{font:900 18px/1 ui-monospace,Menlo,monospace;letter-spacing:.34em;
    color:${pal.accentOn};opacity:.85;margin-bottom:auto}
  .h-display{color:${pal.accentOn};margin-bottom:28px}
  .lead{margin:0;font-size:var(--fs-lead,28px);line-height:1.55;font-weight:700;
    color:${pal.accentOn};opacity:.9;max-width:90%}
  .foot{display:flex;justify-content:space-between;align-items:baseline;margin-top:auto;
    font:800 17px/1 ui-monospace,Menlo,monospace;letter-spacing:.26em;
    color:${pal.accentOn};opacity:.75}`, '', pal.accent);
}

/* ── 15. 数字角标：右上角巨大编号 + 左下标题 ───────────────────────── */
export function tplCornerNum(pal, dim, hasImage) {
  const p = dim.w === dim.h ? 76 : 88;
  return bold(pal, dim, `
    <div class="corner">__CORNER__</div>
    <div class="pad">
      <div class="top"><span class="kick">COUNT DOWN</span></div>
      <h1 class="h-display">{{TITLE}}</h1>
      <p class="lead">{{LEAD}}</p>
      <div class="foot"><span data-author>{{AUTHOR}}</span><span>{{DATE}}</span></div>
    </div>`, `
  .poster{background:${pal.paper}}
  .corner{position:absolute;right:-30px;top:-40px;z-index:0;
    font:900 400px/1 system-ui,sans-serif;letter-spacing:-.08em;
    color:${pal.accent};opacity:.20;user-select:none}
  .pad{flex:1;display:flex;flex-direction:column;padding:${p}px;position:relative;z-index:2}
  .top{display:flex;justify-content:flex-start;margin-bottom:auto}
  .kick{font:900 18px/1 ui-monospace,Menlo,monospace;letter-spacing:.32em;color:${pal.accent}}
  .h-display{color:${pal.ink};margin-bottom:28px;max-width:88%}
  .lead{margin:0;font-size:var(--fs-lead,29px);line-height:1.55;font-weight:700;
    color:${pal.ink};opacity:.76;max-width:84%}
  .foot{display:flex;justify-content:space-between;align-items:baseline;margin-top:auto;
    font:800 17px/1 ui-monospace,Menlo,monospace;letter-spacing:.26em;
    color:${pal.ink};opacity:.6}`, '', pal.paper);
}

/* ── 16. 三栏网格：三等分色块（每块一条要点）────────────────────────── */
export function tplThreeGrid(pal, dim, hasImage) {
  const p = dim.w === dim.h ? 64 : 76;
  return bold(pal, dim, `
    <div class="pad">
      <h1 class="h-display">{{TITLE}}</h1>
      <div class="grid">
        <div class="cell c1"><span class="cn">01</span><span class="ct" data-k="0"></span></div>
        <div class="cell c2"><span class="cn">02</span><span class="ct" data-k="1"></span></div>
        <div class="cell c3"><span class="cn">03</span><span class="ct" data-k="2"></span></div>
      </div>
      <div class="foot"><span data-author>{{AUTHOR}}</span><span>{{DATE}}</span></div>
    </div>`, `
  .poster{background:${pal.paper}}
  .pad{flex:1;display:flex;flex-direction:column;padding:${p}px}
  .h-display{color:${pal.ink};margin-bottom:26px}
  .grid{flex:1;display:grid;grid-template-columns:repeat(3,1fr);gap:8px}
  .cell{display:flex;flex-direction:column;justify-content:space-between;padding:20px}
  .c1{background:${pal.accent};color:${pal.accentOn}}
  .c2{background:${pal.ink};color:${pal.paper}}
  .c3{background:${pal.paper2};color:${pal.ink};border:3px solid ${pal.accent}}
  .cn{font:900 22px/1 ui-monospace,Menlo,monospace;letter-spacing:.2em;opacity:.8}
  .ct{font-size:var(--fs-body,24px);line-height:1.4;font-weight:800}
  .foot{display:flex;justify-content:space-between;align-items:baseline;margin-top:20px;
    font:800 17px/1 ui-monospace,Menlo,monospace;letter-spacing:.24em;color:${pal.ink};opacity:.6}`,
  '', pal.paper);
}

/* ── 17. 大字压阵：单字超巨 + 小标题 ───────────────────────────────── */
export function tplMegaChar(pal, dim, hasImage) {
  const p = dim.w === dim.h ? 70 : 82;
  return bold(pal, dim, `
    <div class="mega">__CHAR__</div>
    <div class="pad">
      <h1 class="h-display">{{TITLE}}</h1>
      <p class="lead">{{LEAD}}</p>
      <div class="foot"><span data-author>{{AUTHOR}}</span><span>{{DATE}}</span></div>
    </div>`, `
  .poster{background:${pal.ink};color:${pal.paper}}
  .mega{position:absolute;left:50%;top:46%;transform:translate(-50%,-50%);
    font:900 900px/0.8 'Noto Sans SC',system-ui,sans-serif;letter-spacing:-.1em;
    color:${pal.accent};opacity:.30;z-index:0;user-select:none;white-space:nowrap}
  .pad{position:relative;z-index:2;flex:1;display:flex;flex-direction:column;padding:${p}px}
  .h-display{color:${pal.paper};margin-top:auto;margin-bottom:22px;
    text-shadow:0 3px 24px rgba(0,0,0,.6)}
  .lead{margin:0;font-size:var(--fs-lead,27px);line-height:1.55;font-weight:700;
    color:${pal.paper};opacity:.8;max-width:86%;text-shadow:0 2px 12px rgba(0,0,0,.5)}
  .foot{display:flex;justify-content:space-between;align-items:baseline;margin-top:30px;
    font:800 17px/1 ui-monospace,Menlo,monospace;letter-spacing:.26em;
    color:${pal.paper};opacity:.6}`, '', pal.ink);
}

/* ── 18. 便签拼贴：多张便签错落（手账感）────────────────────────────── */
export function tplStickyNotes(pal, dim, hasImage) {
  const p = dim.w === dim.h ? 66 : 78;
  return bold(pal, dim, `
    <div class="pad">
      <div class="n n1"><span data-k="0"></span></div>
      <div class="n n2"><span data-k="1"></span></div>
      <div class="n n3 main">
        <h1 class="h-display">{{TITLE}}</h1>
        <span class="lead">{{LEAD}}</span>
      </div>
      <div class="foot"><span data-author>{{AUTHOR}}</span><span>{{DATE}}</span></div>
    </div>`, `
  .poster{background:${pal.paper2}}
  .pad{flex:1;position:relative;padding:${p}px;display:flex;flex-direction:column}
  .n{position:absolute;padding:20px;font-size:var(--fs-body,22px);line-height:1.4;font-weight:800;
    box-shadow:6px 8px 18px rgba(0,0,0,.16)}
  .n1{left:${p}px;top:${p}px;width:250px;height:150px;background:${pal.accent};
    color:${pal.accentOn};transform:rotate(-4deg);overflow:hidden}
  .n2{right:${p}px;top:${Math.round(p * 2.2)}px;width:220px;height:130px;
    background:${pal.ink};color:${pal.paper};transform:rotate(3.5deg);overflow:hidden}
  .n3{position:relative;margin:auto 0 0;width:100%;min-height:56%;
    background:${pal.paper};color:${pal.ink};transform:rotate(-1deg);
    display:flex;flex-direction:column;justify-content:flex-end;gap:22px;
    border:3px solid ${pal.ink}}
  .h-display{color:${pal.ink};margin-top:auto}
  .lead{font-size:var(--fs-lead,26px);line-height:1.5;font-weight:700;color:${pal.ink};opacity:.72;
    display:block}
  .foot{display:flex;justify-content:space-between;align-items:baseline;margin-top:16px;
    font:800 17px/1 ui-monospace,Menlo,monospace;letter-spacing:.24em;color:${pal.ink};opacity:.6}`,
  '', pal.paper2);
}

/* ── 19. 跑马灯：上下两条重复文字带 + 中间大标题 ───────────────────── */
export function tplMarquee(pal, dim, hasImage) {
  const p = dim.w === dim.h ? 0 : 0;
  return bold(pal, dim, `
    <div class="mq top"><span>{{TITLE}}</span></div>
    <div class="pad">
      <span class="kick">SCROLL STOPPER</span>
      <h1 class="h-display">{{TITLE}}</h1>
      <p class="lead">{{LEAD}}</p>
      <div class="foot"><span data-author>{{AUTHOR}}</span><span>{{DATE}}</span></div>
    </div>
    <div class="mq bot"><span>{{LEAD}}</span></div>`, `
  .poster{background:${pal.paper}}
  .wrap{display:flex;flex-direction:column}
  .mq{background:${pal.accent};color:${pal.accentOn};padding:16px 0;overflow:hidden;
    white-space:nowrap;flex:none}
  .mq span{font:900 24px/1 ui-monospace,Menlo,monospace;letter-spacing:.24em;
    padding-left:24px}
  .mq.bot{background:${pal.ink};color:${pal.paper}}
  .pad{flex:1;display:flex;flex-direction:column;
    padding:${dim.w === dim.h ? 76 : 88}px}
  .kick{align-self:flex-start;font:900 18px/1 ui-monospace,Menlo,monospace;
    letter-spacing:.3em;color:${pal.accent};margin-bottom:auto}
  .h-display{color:${pal.ink};margin-bottom:28px}
  .lead{margin:0;font-size:var(--fs-lead,29px);line-height:1.55;font-weight:700;
    color:${pal.ink};opacity:.76;max-width:88%}
  .foot{display:flex;justify-content:space-between;align-items:baseline;margin-top:auto;
    font:800 17px/1 ui-monospace,Menlo,monospace;letter-spacing:.26em;
    color:${pal.ink};opacity:.6}`, '', pal.paper);
}

/* ── 20. 倾斜色块：斜置色块压住大标题 ─────────────────────────────── */
export function tplTiltBlock(pal, dim, hasImage) {
  const p = dim.w === dim.h ? 76 : 88;
  return bold(pal, dim, `
    <div class="tilt"></div>
    <div class="pad">
      <span class="kick">BREAK THE GRID</span>
      <h1 class="h-display">{{TITLE}}</h1>
      <div class="blk"><span>{{LEAD}}</span></div>
      <div class="foot"><span data-author>{{AUTHOR}}</span><span>{{DATE}}</span></div>
    </div>`, `
  .poster{background:${pal.paper2}}
  .tilt{position:absolute;left:-10%;right:-10%;top:38%;height:32%;
    background:${pal.accent};transform:rotate(-5deg);z-index:1}
  .pad{position:relative;z-index:2;flex:1;display:flex;flex-direction:column;padding:${p}px}
  .kick{font:900 18px/1 ui-monospace,Menlo,monospace;letter-spacing:.32em;
    color:${pal.accent};margin-bottom:auto}
  .h-display{color:${pal.ink};margin-bottom:30px;
    text-shadow:0 2px 0 ${pal.paper2}, 0 -2px 0 ${pal.paper2}}
  .blk{background:${pal.ink};color:${pal.paper};padding:24px 26px;align-self:flex-start;
    max-width:90%;margin-bottom:auto}
  .blk span{font-size:var(--fs-lead,28px);line-height:1.5;font-weight:700;display:block}
  .foot{display:flex;justify-content:space-between;align-items:baseline;
    font:800 17px/1 ui-monospace,Menlo,monospace;letter-spacing:.26em;
    color:${pal.ink};opacity:.62}`, '', pal.paper2);
}

export const BOLD_EXTRA = {
  diagonal: tplDiagonal,
  'card-stack': tplCardStack,
  bands: tplBands,
  'ring-focus': tplRingFocus,
  'tag-flow': tplTagFlow,
  'frame-hit': tplFrameHit,
  'corner-num': tplCornerNum,
  'three-grid': tplThreeGrid,
  'mega-char': tplMegaChar,
  'sticky-notes': tplStickyNotes,
  marquee: tplMarquee,
  'tilt-block': tplTiltBlock,
};
