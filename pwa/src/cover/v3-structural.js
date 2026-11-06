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
 * ⚠️ 有底图时必须退化成实心字：本语法靠 color:transparent，
 *    而可读性门禁会跳过 alpha < 0.15 的文字元素 —— 有图时若仍用渐变，
 *    门禁会「跳过而不检查」，等于给了一个假绿灯，字烂在照片上也测不出来。 */
export function tplGradientTitle(pal, dim, hasImage) {
  const t = tokens(dim);
  const grad = hasImage
    ? `color:#fff`
    : `color:transparent;-webkit-background-clip:text;background-clip:text;
       background-image:linear-gradient(100deg,${pal.accent} 0%,${pal.ink} 42%,
       ${pal.accent} 74%,${pal.muted} 100%)`;
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
  const outline = hasImage
    ? `color:#fff`
    : `color:transparent;-webkit-text-stroke:${strokeW}px ${pal.accent}`;
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
};
