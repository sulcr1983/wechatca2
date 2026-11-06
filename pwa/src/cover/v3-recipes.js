/* 标题图 V3 · 配方 23 套渲染器（2026-11-06 用户拍板「其它模板都按新的改」）
 *
 * 设计约束：
 *   · 每套必须有**肉眼可辨的独占结构**（不是换配色）——判据见
 *     scripts/cover_registry_unit.mjs 与 docs/xhs/design-xhs-title-v3-all.md §5.2；
 *   · 只用 DOM → PNG 能用的东西（封面是 modern-screenshot 截图，不是微信编辑器，
 *     flex/grid/rgba/box-shadow 全可用）；
 *   · 标题一律 .h-display，字号由 buildV3Html 按可用宽度反算（__HSIZE__ 占位符）；
 *   · 与 v3-templates.js 共用 prepareCoverHtml 的占位符协议（{{TITLE}}/{{LEAD}}/
 *     {{AUTHOR}}/{{DATE}}、data-author 空署名整块删除、fitty 自适应）。
 */

/* ── 共用小件 ─────────────────────────────────────────────────── */

/** 纸底 + 墨色 + 圆形/方形装饰的文档外壳。 */
function shell(pal, dim, p, body, extraCss = '') {
  return `<!doctype html><html lang="zh-CN"><head><meta charset="utf-8"><style>
  *{box-sizing:border-box} html,body{margin:0;padding:0}
  .poster{position:relative;width:${dim.w}px;height:${dim.h}px;overflow:hidden;isolation:isolate;
    background:${pal.paper};color:${pal.ink};
    font-family:'Noto Sans SC','PingFang SC',system-ui,sans-serif}
  .wrap{position:relative;z-index:2;height:100%;display:flex;flex-direction:column;
    padding:${p.y}px ${p.x}px}
  .h-display{margin:0;font-size:__HSIZE__px;line-height:1.08;font-weight:800;
    letter-spacing:-.02em;text-wrap:balance}
  .lead{margin:28px 0 0;font-size:28px;line-height:1.7;color:${pal.muted};max-width:84%}
  .foot{margin-top:auto;padding-top:18px;border-top:1px solid rgba(128,128,128,.3);
    display:flex;justify-content:space-between;align-items:baseline;
    font:400 18px/1 ui-monospace,Menlo,monospace;letter-spacing:.24em;color:${pal.muted}}
  ${extraCss}
  </style></head><body class="gz">
  <section class="poster"><div class="wrap v3-body">${body}</div></section></body></html>`;
}

/** 引语切条目（清单类版式共用；切不出 ≥2 条返回空）。 */
function itemsOf(lead, max = 5) {
  const parts = String(lead || '')
    .split(/[·、／/｜|，,；;]+/).map((s) => s.trim()).filter((s) => s.length >= 2);
  return parts.length >= 2 ? parts.slice(0, max) : [];
}

/** 标题里的数字（「5 个方法」→ 5），抽不到给空串。 */
function numOf(title) {
  const m = String(title || '').match(/(\d{1,3})/);
  if (m) return m[1];
  const cn = { 一: 1, 二: 2, 三: 3, 四: 4, 五: 5, 六: 6, 七: 7, 八: 8, 九: 9, 十: 10 };
  const c = String(title || '').match(/[一二三四五六七八九十]/);
  return c ? String(cn[c[0]]) : '';
}

const esc = (s) => String(s == null ? '' : s)
  .replace(/&/g, '&amp;').replace(/</g, '&lt;')
  .replace(/>/g, '&gt;').replace(/"/g, '&quot;');

/** 条目行（编号 + 文本），多处复用。 */
function rows(items, { cls = 'row', numCls = 'rn', txtCls = 'rt', start = 1 } = {}) {
  return items.map((t, i) => `<div class="${cls}"><span class="${numCls}">`
    + `${String(i + start).padStart(2, '0')}</span><span class="${txtCls}">${esc(t)}</span></div>`)
    .join('');
}

/* ── M02 纪实照片：大图区 + 底部说明带 ─────────────────────────────── */
export function tplFieldNote(pal, dim, hasImage) {
  const p = dim.w === dim.h ? 80 : 88;
  /* 无底图时不留空框（2026-11-06 用户评审「图呢？」）：
     退化成「撞色大色块 + 超大斜排标语」，比灰框有意义得多。 */
  const media = hasImage
    ? '<div class="ph"><img class="cover-img" src="" alt=""><div class="cap">FIG.01</div></div>'
    : `<div class="ph solid"><span class="phword">${hasImage ? '' : 'IMAGE'}</span>
        <div class="cap">FIG.01</div></div>`;
  return shell(pal, dim, { x: p, y: p }, `
    ${media}
    <div class="body">
      <span class="kick">FIELD NOTE</span>
      <h1 class="h-display">{{TITLE}}</h1>
      <p class="lead">{{LEAD}}</p>
      <div class="foot"><span data-author>{{AUTHOR}}</span><span>{{DATE}}</span></div>
    </div>`, `
  .poster{padding:0}
  .wrap{padding:0;height:100%}
  .ph{flex:1;position:relative;background:${pal.paper2};
    border-bottom:3px solid ${pal.accent};overflow:hidden}
  .ph .cover-img{position:absolute;inset:0;width:100%;height:100%;object-fit:cover}
  .ph.solid{background:${pal.ink};display:flex;align-items:center;justify-content:center}
  .phword{font:800 190px/1 system-ui,sans-serif;letter-spacing:-.04em;
    color:${pal.paper};opacity:.10;user-select:none}
  .cap{position:absolute;left:0;bottom:0;background:${pal.accent};color:${pal.accentOn};
    font:700 17px/1 ui-monospace,Menlo,monospace;letter-spacing:.2em;padding:8px 12px;z-index:2}
  .body{padding:${p}px ${p}px ${Math.round(p * 0.7)}px}
  .kick{display:block;font:700 18px/1 ui-monospace,Menlo,monospace;letter-spacing:.32em;
    color:${pal.accent};margin-bottom:20px}
  .h-display{font-size:__HSIZE__px}
  .foot{margin-top:34px}`);
}

/* ── M03 左右分栏：左大标题 / 右正文，中间竖线 ─────────────────────── */
export function tplEssaySplit(pal, dim, hasImage) {
  const p = dim.w === dim.h ? 80 : 92;
  return shell(pal, dim, { x: p, y: p }, `
    <div class="grid">
      <div class="left">
        <span class="kick">ESSAY</span>
        <h1 class="h-display">{{TITLE}}</h1>
      </div>
      <div class="right">
        <p class="lead">{{LEAD}}</p>
        <div class="meta"><span data-author>{{AUTHOR}}</span><span>{{DATE}}</span></div>
      </div>
    </div>`, `
  .wrap{padding:${p}px}
  .grid{flex:1;display:grid;grid-template-columns:1.15fr 1fr;gap:0}
  .left{padding-right:38px;border-right:1px solid rgba(128,128,128,.34);
    display:flex;flex-direction:column;justify-content:center}
  /* 2026-11-06 修「右栏内容只占顶部一条」：两端对齐，让引语与署名分居上下，
     而不是全部堆在顶部留出大片空白。 */
  .right{padding-left:38px;display:flex;flex-direction:column;justify-content:space-between}
  .kick{display:block;font:700 17px/1 ui-monospace,Menlo,monospace;letter-spacing:.3em;
    color:${pal.accent};margin-bottom:26px}
  .h-display{font-size:__HSIZE__px;line-height:1.08}
  .lead{margin:0;font-size:30px;line-height:1.9;color:${pal.muted};max-width:100%}
  .meta{margin-top:30px;padding-top:16px;border-top:1px solid rgba(128,128,128,.3);
    display:flex;justify-content:space-between;
    font:400 17px/1 ui-monospace,Menlo,monospace;letter-spacing:.22em;color:${pal.muted}}`);
}

/* ── M06 证据墙：2×2 图格 + 一句判读 ───────────────────────────────── */
export function tplEvidenceWall(pal, dim, hasImage) {
  const p = dim.w === dim.h ? 72 : 84;
  /* 有底图 → 2×2 图格；无底图 → 4 个要点格（填真实文案，不留灰框）。
     2026-11-06 评审：原来 4 个空格子用户会问「图呢」。 */
  const cellHtml = hasImage
    ? Array.from({ length: 4 }, (_, i) =>
      `<div class="cell img"><img class="cover-img" src="" alt=""><i>0${i + 1}</i></div>`).join('')
    : `<div class="cell"><i>01</i><span class="ctx" data-k="0"></span></div>
       <div class="cell"><i>02</i><span class="ctx" data-k="1"></span></div>
       <div class="cell"><i>03</i><span class="ctx" data-k="2"></span></div>
       <div class="cell"><i>04</i><span class="ctx" data-k="3"></span></div>`;
  return shell(pal, dim, { x: p, y: p }, `
    <div class="top"><span class="kick">EVIDENCE WALL</span><span class="cnt">{{DATE}}</span></div>
    <h1 class="h-display">{{TITLE}}</h1>
    <div class="wall">${cellHtml}</div>
    <p class="lead">{{LEAD}}</p>`, `
  .wrap{padding:${p}px}
  .top{display:flex;justify-content:space-between;align-items:baseline;margin-bottom:22px}
  .kick{font:700 17px/1 ui-monospace,Menlo,monospace;letter-spacing:.3em;color:${pal.accent}}
  .cnt{font:400 16px/1 ui-monospace,Menlo,monospace;letter-spacing:.2em;color:${pal.muted}}
  .h-display{font-size:__HSIZE__px;line-height:1.1}
  .wall{flex:1;display:grid;grid-template-columns:1fr 1fr;grid-template-rows:1fr 1fr;
    gap:10px;margin:36px 0 0}
  .cell{position:relative;background:${pal.paper2};border:1px solid rgba(128,128,128,.34);
    display:flex;flex-direction:column;justify-content:space-between;padding:16px}
  .cell.img{align-items:flex-end;justify-content:flex-end}
  .cell .cover-img{position:absolute;inset:0;width:100%;height:100%;object-fit:cover}
  .cell i{font:700 15px/1 ui-monospace,Menlo,monospace;letter-spacing:.2em;color:${pal.accent};
    font-style:normal;position:relative;z-index:1}
  .ctx{font-size:23px;line-height:1.45;font-weight:600;color:${pal.ink};position:relative;z-index:1}
  .lead{margin:30px 0 0;font-size:26px;line-height:1.7;color:${pal.muted}}`);
}

/* ── M10 实证特写：大图占上半 + 底部 3 条要点 ──────────────────────── */
export function tplFeature(pal, dim, hasImage) {
  const p = dim.w === dim.h ? 72 : 84;
  /* 无底图时把「图片区」换成撞色标语区，不留灰框（2026-11-06 评审）。 */
  const media = hasImage
    ? '<div class="ph"><img class="cover-img" src="" alt=""></div>'
    : '<div class="ph solid"><span class="tagline">FEATURE</span></div>';
  return shell(pal, dim, { x: p, y: p }, `
    ${media}
    <div class="body">
      <h1 class="h-display">{{TITLE}}</h1>
      <div class="pts" data-lead-list></div>
      <div class="foot"><span data-author>{{AUTHOR}}</span><span>{{DATE}}</span></div>
    </div>`, `
  .poster{padding:0}
  .wrap{padding:0;height:100%}
  .ph{flex:0 0 46%;background:${pal.paper2};position:relative;overflow:hidden}
  .ph .cover-img{position:absolute;inset:0;width:100%;height:100%;object-fit:cover}
  .ph.solid{background:${pal.accent};display:flex;align-items:center;justify-content:center}
  .tagline{font:800 96px/1 system-ui,sans-serif;letter-spacing:.06em;
    color:${pal.accentOn};opacity:.28}
  .body{flex:1;display:flex;flex-direction:column;padding:${p}px}
  .h-display{font-size:__HSIZE__px;line-height:1.1}
  .pts{margin-top:26px;display:flex;flex-direction:column;gap:0}
  .pt{display:flex;gap:16px;align-items:baseline;padding:14px 0;
    border-top:1px solid rgba(128,128,128,.3)}
  .pt:last-child{border-bottom:1px solid rgba(128,128,128,.3)}
  .pn{flex:none;width:26px;height:26px;border-radius:50%;background:${pal.accent};color:${pal.accentOn};
    font:700 14px/26px ui-monospace,Menlo,monospace;text-align:center}
  .ptx{font-size:25px;line-height:1.55;color:${pal.ink}}
  .foot{margin-top:auto}`);
}

/* ── M09 氛围论点：墨流底 + 一句大论点 ─────────────────────────────── */
export function tplAtmosThesis(pal, dim, hasImage) {
  const p = dim.w === dim.h ? 96 : 108;
  return shell(pal, dim, { x: p, y: p }, `
    <div class="blob a"></div><div class="blob b"></div>
    <div class="wrap">
      <span class="kick">THESIS</span>
      <div class="mid">
        <h1 class="h-display">{{TITLE}}</h1>
        <p class="lead">{{LEAD}}</p>
      </div>
      <div class="foot"><span data-author>{{AUTHOR}}</span><span>{{DATE}}</span></div>
    </div>`, `
  .poster{background:${pal.ink}}
  .wrap{color:${pal.paper};padding:${p}px}
  .blob{position:absolute;border-radius:50%;filter:blur(60px);opacity:.34;z-index:0}
  .blob.a{width:620px;height:620px;background:${pal.accent};top:-180px;right:-160px}
  .blob.b{width:520px;height:520px;background:${pal.paper2};bottom:-140px;left:-120px;opacity:.16}
  .kick{position:relative;font:700 17px/1 ui-monospace,Menlo,monospace;
    letter-spacing:.34em;color:${pal.accent}}
  .mid{flex:1;display:flex;flex-direction:column;justify-content:center}
  .h-display{font-size:__HSIZE__px;line-height:1.16;font-weight:700}
  .lead{margin:34px 0 0;font-size:25px;line-height:1.8;color:${pal.paper};opacity:.72;max-width:82%}
  .foot{margin-top:0;border-color:rgba(255,255,255,.24);color:${pal.paper};opacity:.66}`);
}

/* ── M11 页边批注：主栏 + 右侧窄边栏关键词 ─────────────────────────── */
export function tplMarginalia(pal, dim, hasImage) {
  const p = dim.w === dim.h ? 76 : 88;
  return shell(pal, dim, { x: p, y: p }, `
    <div class="grid">
      <div class="main">
        <h1 class="h-display">{{TITLE}}</h1>
        <p class="lead">{{LEAD}}</p>
        <div class="foot"><span data-author>{{AUTHOR}}</span><span>{{DATE}}</span></div>
      </div>
      <div class="side"><div class="bar"></div><div class="kws" data-lead-list></div></div>
    </div>`, `
  .wrap{padding:${p}px}
  .grid{flex:1;display:grid;grid-template-columns:1fr 176px;gap:34px}
  .main{display:flex;flex-direction:column}
  .h-display{font-size:__HSIZE__px;line-height:1.1}
  .lead{margin:28px 0 0;font-size:25px;line-height:1.78;color:${pal.muted};max-width:100%}
  .foot{margin-top:auto}
  .side{border-left:1px solid rgba(128,128,128,.34);padding-left:22px;
    display:flex;flex-direction:column;justify-content:center;gap:14px}
  .bar{width:40px;height:4px;background:${pal.accent};margin-bottom:8px}
  .kw{font:600 20px/1.4 ui-monospace,Menlo,monospace;color:${pal.ink};
    letter-spacing:.02em;padding-bottom:12px;border-bottom:1px solid rgba(128,128,128,.22)}`);
}

/* ── S12 主数字矩阵：8 格矩阵 + 底部主数字 ─────────────────────────── */
export function tplMatrix(pal, dim, hasImage) {
  const p = dim.w === dim.h ? 68 : 80;
  /* 8 格放真实条目（2026-11-06 评审：原来 7/14/21/28 是编造的假数据，
     和用户内容毫无关系）。条目不足时循环复用，并保留编号当视觉节奏。 */
  return shell(pal, dim, { x: p, y: p }, `
    <h1 class="h-display">{{TITLE}}</h1>
    <div class="mx">
      ${Array.from({ length: 8 }, (_, i) =>
    `<div class="c"><i>0${i + 1}</i><span class="ctx" data-k="${i}"></span></div>`).join('')}
    </div>
    <div class="big"><span class="bn">{{DATE}}</span><span class="bl">{{LEAD}}</span></div>`, `
  .wrap{padding:${p}px}
  .h-display{font-size:__HSIZE__px;line-height:1.1;margin-bottom:26px}
  .mx{flex:1;display:grid;grid-template-columns:repeat(4,1fr);
    grid-template-rows:1fr 1fr;gap:8px}
  .c{background:${pal.paper2};padding:14px;display:flex;flex-direction:column;
    justify-content:space-between;border-top:3px solid ${pal.accent};overflow:hidden}
  .c i{font:700 15px/1 ui-monospace,Menlo,monospace;color:${pal.accent};
    letter-spacing:.2em;font-style:normal}
  .c .ctx{font-size:21px;line-height:1.4;font-weight:600;color:${pal.ink};
    display:-webkit-box;-webkit-line-clamp:3;-webkit-box-orient:vertical;overflow:hidden}
  .big{margin-top:18px;padding-top:16px;border-top:2px solid ${pal.ink};
    display:flex;align-items:baseline;gap:18px}
  .bn{font:800 40px/1 system-ui,sans-serif;color:${pal.ink};letter-spacing:-.03em}
  .bl{font-size:23px;line-height:1.5;color:${pal.muted}}`);
}

/* ── M07 收尾寄语：大标题 + 账本 + 收尾句 ─────────────────────────── */
export function tplClosingNote(pal, dim, hasImage) {
  const p = dim.w === dim.h ? 88 : 100;
  return shell(pal, dim, { x: p, y: p }, `
    <div class="top"><span class="kick">CLOSING</span><span class="no">{{DATE}}</span></div>
    <h1 class="h-display">{{TITLE}}</h1>
    <div class="ledger" data-lead-list></div>
    <div class="end"><span class="ln"></span><span data-author>{{AUTHOR}}</span></div>`, `
  .wrap{padding:${p}px}
  .top{display:flex;justify-content:space-between;align-items:baseline}
  .kick{font:700 17px/1 ui-monospace,Menlo,monospace;letter-spacing:.34em;color:${pal.accent}}
  .no{font:400 16px/1 ui-monospace,Menlo,monospace;letter-spacing:.2em;color:${pal.muted}}
  .h-display{font-size:__HSIZE__px;line-height:1.08;margin:40px 0 0}
  /* 2026-11-06 修「账本贴底、上面大片空」：h1 之后把剩余空间交给账本，逐行均分。 */
  .ledger{margin-top:auto;flex:1;display:flex;flex-direction:column;padding-top:30px}
  .rw{flex:1;display:flex;justify-content:space-between;align-items:center;gap:20px;
    border-top:1px solid rgba(128,128,128,.3)}
  .rw:last-child{border-bottom:1px solid rgba(128,128,128,.3)}
  .rt{font-size:26px;line-height:1.5;color:${pal.ink}}
  .rn{font:400 15px/1 ui-monospace,Menlo,monospace;color:${pal.muted};letter-spacing:.2em}
  .end{margin-top:34px;display:flex;align-items:center;gap:14px;
    font:400 17px/1 ui-monospace,Menlo,monospace;letter-spacing:.24em;color:${pal.muted}}
  .ln{flex:none;width:56px;height:2px;background:${pal.accent}}`);
}

/* ── M08 长账本：左编号右标题的多条清单 ───────────────────────────── */
export function tplTallLedger(pal, dim, hasImage) {
  const p = dim.w === dim.h ? 80 : 92;
  return shell(pal, dim, { x: p, y: p }, `
    <div class="hd">
      <h1 class="h-display">{{TITLE}}</h1>
      <span class="side">LEDGER · {{DATE}}</span>
    </div>
    <div class="book" data-lead-list></div>`, `
  .wrap{padding:${p}px}
  .hd{display:flex;align-items:flex-start;gap:26px;margin-bottom:34px}
  .h-display{flex:1;font-size:__HSIZE__px;line-height:1.1}
  .side{writing-mode:vertical-rl;font:400 16px/1 ui-monospace,Menlo,monospace;
    letter-spacing:.3em;color:${pal.muted};flex:none}
  /* 2026-11-06 修「条目聚在中间、上下空」：条目行均分剩余高度。 */
  .book{flex:1;display:flex;flex-direction:column}
  .bk{flex:1;display:flex;align-items:center;gap:24px;padding:26px 0;
    border-top:1px solid rgba(128,128,128,.32)}
  .bk:last-child{border-bottom:1px solid rgba(128,128,128,.32)}
  .bn{flex:none;width:60px;font:800 26px/1 system-ui,sans-serif;color:${pal.accent};
    font-variant-numeric:tabular-nums}
  .bt{font-size:34px;line-height:1.45;color:${pal.ink}}`);
}

/* ── M12 章节分隔：Act 编号 + 3–6 字大标题 ─────────────────────────── */
export function tplSectionDivider(pal, dim, hasImage) {
  return shell(pal, dim, { x: 96, y: 96 }, `
    <div class="wrap center">
      <span class="act">ACT II</span>
      <h1 class="h-display">{{TITLE}}</h1>
      <div class="rule"></div>
      <p class="lead">{{LEAD}}</p>
      <div class="foot"><span data-author>{{AUTHOR}}</span><span>{{DATE}}</span></div>
    </div>`, `
  .center{align-items:center;text-align:center;justify-content:center}
  .act{font:700 20px/1 ui-monospace,Menlo,monospace;letter-spacing:.5em;
    color:${pal.accent};margin-bottom:40px}
  .h-display{font-size:__HSIZE__px;line-height:1.16}
  .rule{width:88px;height:3px;background:${pal.ink};margin:52px auto 0;opacity:.32}
  .lead{margin:44px 0 0;font-size:27px;line-height:1.75;color:${pal.muted};max-width:76%}
  .foot{position:absolute;left:96px;right:96px;bottom:88px;margin-top:0}`);
}

/* ── M13 大问句：三行问句占满整页 ─────────────────────────────────── */
export function tplHeroQuestion(pal, dim, hasImage) {
  const p = dim.w === dim.h ? 88 : 100;
  return shell(pal, dim, { x: p, y: p }, `
    <div class="qm">?</div>
    <div class="wrap">
      <h1 class="h-display">{{TITLE}}</h1>
      <p class="lead">{{LEAD}}</p>
      <div class="foot"><span data-author>{{AUTHOR}}</span><span>{{DATE}}</span></div>
    </div>`, `
  .poster{padding:0}
  .qm{position:absolute;right:-40px;top:-120px;font:900 720px/1 Georgia,serif;
    color:${pal.accent};opacity:.10;z-index:1;pointer-events:none}
  .wrap{padding:${p}px;justify-content:center}
  .h-display{font-size:__HSIZE__px;line-height:1.2;font-weight:800}
  .lead{margin:40px 0 0;font-size:27px;line-height:1.75;color:${pal.muted};max-width:80%}
  .foot{position:absolute;left:${p}px;right:${p}px;bottom:${Math.round(p * 0.75)}px;margin-top:0}`);
}

/* ── M14 竖排流程：3–4 步，每步一行说明 ───────────────────────────── */
export function tplPipeline(pal, dim, hasImage) {
  const p = dim.w === dim.h ? 76 : 88;
  return shell(pal, dim, { x: p, y: p }, `
    <h1 class="h-display">{{TITLE}}</h1>
    <div class="flow" data-lead-list></div>
    <div class="foot"><span data-author>{{AUTHOR}}</span><span>{{DATE}}</span></div>`, `
  .wrap{padding:${p}px}
  .h-display{font-size:__HSIZE__px;line-height:1.1}
  .flow{flex:1;display:flex;flex-direction:column;justify-content:center;margin-top:24px}
  .st{position:relative;display:flex;gap:22px;padding-bottom:34px}
  .st:last-child{padding-bottom:0}
  .st::before{content:"";position:absolute;left:19px;top:40px;bottom:0;width:2px;
    background:rgba(128,128,128,.3)}
  .st:last-child::before{display:none}
  .sn{flex:none;width:40px;height:40px;border-radius:50%;background:${pal.accent};
    color:${pal.accentOn};font:700 17px/40px ui-monospace,Menlo,monospace;text-align:center;z-index:1}
  .sx{font-size:28px;line-height:1.5;color:${pal.ink};padding-top:4px}`);
}

/* ── M15 前后对比：上下两块（旧 vs 新）─────────────────────────────── */
export function tplBeforeAfter(pal, dim, hasImage) {
  const p = dim.w === dim.h ? 72 : 84;
  return shell(pal, dim, { x: p, y: p }, `
    <h1 class="h-display">{{TITLE}}</h1>
    <div class="vs">
      <div class="blk old"><span class="tg">BEFORE</span><span class="tx">{{LEAD}}</span></div>
      <div class="mid">VS</div>
      <div class="blk new"><span class="tg">AFTER</span><span class="tx">{{TITLE}}</span></div>
    </div>
    <div class="foot"><span data-author>{{AUTHOR}}</span><span>{{DATE}}</span></div>`, `
  .wrap{padding:${p}px}
  .h-display{font-size:__HSIZE__px;line-height:1.1;margin-bottom:26px}
  .vs{flex:1;display:flex;flex-direction:column;justify-content:center;gap:0}
  .blk{flex:1;display:flex;flex-direction:column;justify-content:center;
    gap:14px;padding:28px}
  .blk.old{background:${pal.paper2};opacity:.62}
  .blk.new{background:${pal.ink};color:${pal.paper}}
  .tg{font:700 16px/1 ui-monospace,Menlo,monospace;letter-spacing:.3em;color:${pal.accent}}
  .blk.new .tg{color:${pal.accent}}
  .tx{font-size:30px;line-height:1.5;font-weight:600}
  .mid{align-self:center;background:${pal.accent};color:${pal.accentOn};
    font:800 16px/1 ui-monospace,Menlo,monospace;letter-spacing:.2em;
    padding:8px 16px;border-radius:99px;margin:-14px 0;z-index:2}
  .foot{margin-top:22px}`);
}

/* ── S02 双信号：一实一虚两个大块 ─────────────────────────────────── */
export function tplTwoSignals(pal, dim, hasImage) {
  const p = dim.w === dim.h ? 76 : 88;
  return shell(pal, dim, { x: p, y: p }, `
    <h1 class="h-display">{{TITLE}}</h1>
    <div class="sig">
      <div class="solid"><b>SIGNAL<br>A</b><span>{{LEAD}}</span></div>
      <div class="ghost"><b>SIGNAL<br>B</b><span>{{DATE}}</span></div>
    </div>
    <div class="foot"><span data-author>{{AUTHOR}}</span><span>SUPERSU</span></div>`, `
  .wrap{padding:${p}px}
  .h-display{font-size:__HSIZE__px;line-height:1.1;margin-bottom:28px}
  .sig{flex:1;display:grid;grid-template-columns:1fr 1fr;gap:12px}
  .solid,.ghost{padding:26px;display:flex;flex-direction:column;justify-content:space-between}
  .solid{background:${pal.accent};color:${pal.accentOn}}
  .ghost{border:2px solid ${pal.ink};color:${pal.ink}}
  .solid b,.ghost b{font:800 34px/1.1 system-ui,sans-serif;letter-spacing:.04em}
  .solid span,.ghost span{font-size:22px;line-height:1.55;opacity:.9}
  .foot{margin-top:22px}`);
}

/* ── S03 数据层：对象块 + 3 条属性（mono）──────────────────────────── */
export function tplDataLayer(pal, dim, hasImage) {
  const p = dim.w === dim.h ? 76 : 88;
  return shell(pal, dim, { x: p, y: p }, `
    <span class="pre">OBJECT</span>
    <h1 class="h-display">{{TITLE}}</h1>
    <div class="obj">
      <div class="kv"><i>type</i><b>article</b></div>
      <div class="kv"><i>lead</i><b>{{LEAD}}</b></div>
      <div class="kv"><i>date</i><b>{{DATE}}</b></div>
    </div>
    <div class="foot"><span data-author>{{AUTHOR}}</span><span>{ }</span></div>`, `
  .poster{background:${pal.ink};color:${pal.paper};
    font-family:ui-monospace,SFMono-Regular,Menlo,monospace}
  .wrap{padding:${p}px}
  .pre{font:700 16px/1 ui-monospace,Menlo,monospace;letter-spacing:.34em;
    color:${pal.accent};margin-bottom:20px}
  .h-display{font-size:__HSIZE__px;line-height:1.14;
    font-family:'Noto Sans SC','PingFang SC',sans-serif;font-weight:800}
  .obj{margin-top:auto;border:1px solid rgba(255,255,255,.26);border-radius:8px;
    overflow:hidden}
  .kv{display:flex;gap:20px;padding:18px 20px;border-bottom:1px solid rgba(255,255,255,.16);
    align-items:baseline}
  .kv:last-child{border-bottom:0}
  .kv i{flex:none;width:88px;font-style:normal;font-size:17px;color:${pal.accent};
    letter-spacing:.1em}
  .kv b{font-size:23px;line-height:1.5;font-weight:400;color:${pal.paper}}
  .foot{margin-top:26px;border-color:rgba(255,255,255,.2);color:${pal.paper};opacity:.6}`);
}

/* ── S08 图像主角：图铺满 + 覆盖块标题 + 数字 ──────────────────────── */
export function tplImageHero(pal, dim, hasImage) {
  const p = dim.w === dim.h ? 72 : 84;
  /* 数字块只放真数据（2026-11-06 评审：「03 PARTS / AI TOOL」是编的，与用户内容无关）。
     __NUM__ 由 buildV3Html 从标题抽；抽不到整块留空由 CSS 收掉。 */
  return shell(pal, dim, { x: p, y: p }, `
    <img class="cover-img" src="" alt="">
    <div class="scrim"></div>
    <div class="wrap">
      <div class="nums"><div><b>__NUM__</b><i>NO.</i></div></div>
      <div class="blk">
        <h1 class="h-display">{{TITLE}}</h1>
        <p class="lead">{{LEAD}}</p>
      </div>
      <div class="foot"><span data-author>{{AUTHOR}}</span><span>{{DATE}}</span></div>
    </div>`, `
  .poster{color:#fff;background:${pal.ink}}
  .cover-img{position:absolute;inset:0;width:100%;height:100%;object-fit:cover;z-index:0;
    background:${pal.ink}}
  .scrim{position:absolute;inset:0;z-index:1;
    background:linear-gradient(180deg,rgba(8,8,10,.5) 0%,rgba(8,8,10,.16) 40%,rgba(8,8,10,.88) 100%)}
  .wrap{padding:${p}px}
  .nums{display:flex;gap:26px}
  .nums div{display:flex;flex-direction:column;gap:6px}
  .nums b{font:800 40px/1 system-ui,sans-serif;color:#fff;letter-spacing:-.03em}
  .nums i{font:400 14px/1 ui-monospace,Menlo,monospace;letter-spacing:.24em;
    color:rgba(255,255,255,.72);font-style:normal}
  .blk{margin-top:auto;background:rgba(10,10,12,.62);padding:30px 28px;
    border-left:4px solid ${pal.accent}}
  .h-display{font-size:__HSIZE__px;line-height:1.1;color:#fff}
  .lead{margin:20px 0 0;font-size:25px;line-height:1.65;color:rgba(255,255,255,.86);max-width:100%}
  .foot{margin-top:26px;border-color:rgba(255,255,255,.28);color:rgba(255,255,255,.8)}`);
}

/* ── S07 要点账本：大标题 + 3 行要点，深底收尾 ─────────────────────── */
export function tplTakeaway(pal, dim, hasImage) {
  const p = dim.w === dim.h ? 80 : 92;
  return shell(pal, dim, { x: p, y: p }, `
    <span class="kick">KEY TAKEAWAYS</span>
    <h1 class="h-display">{{TITLE}}</h1>
    <div class="tp" data-lead-list></div>
    <div class="foot"><span data-author>{{AUTHOR}}</span><span>{{DATE}}</span></div>`, `
  .poster{background:${pal.ink};color:${pal.paper}}
  .wrap{padding:${p}px}
  .kick{font:700 17px/1 ui-monospace,Menlo,monospace;letter-spacing:.34em;
    color:${pal.accent};margin-bottom:24px}
  .h-display{font-size:__HSIZE__px;line-height:1.1}
  /* 2026-11-06 修「只有 1 条时聚在中间、上下全空」：
     让条目行按 flex:1 均分剩余高度，行数少时每行自然变高。 */
  .tp{flex:1;display:flex;flex-direction:column;margin-top:28px}
  .tw{flex:1;display:flex;gap:20px;align-items:center;padding:22px 0;
    border-top:1px solid rgba(255,255,255,.2)}
  .tw:last-child{border-bottom:1px solid rgba(255,255,255,.2)}
  .tn{flex:none;font:800 32px/1 system-ui,sans-serif;color:${pal.accent}}
  .tt{font-size:30px;line-height:1.5;color:${pal.paper}}
  .foot{margin-top:24px;border-color:rgba(255,255,255,.22);color:${pal.paper};opacity:.62}`);
}

/* ── S05 警示清单：3 条「不要这样做」，左侧色条 ────────────────────── */
export function tplWarning(pal, dim, hasImage) {
  const p = dim.w === dim.h ? 76 : 88;
  return shell(pal, dim, { x: p, y: p }, `
    <div class="banner">⚠ WARNING</div>
    <h1 class="h-display">{{TITLE}}</h1>
    <div class="ws" data-lead-list></div>
    <div class="foot"><span data-author>{{AUTHOR}}</span><span>{{DATE}}</span></div>`, `
  .wrap{padding:${p}px}
  .banner{align-self:flex-start;background:${pal.accent};color:${pal.accentOn};
    font:800 18px/1 ui-monospace,Menlo,monospace;letter-spacing:.26em;
    padding:10px 16px;margin-bottom:26px}
  .h-display{font-size:__HSIZE__px;line-height:1.1}
  /* 2026-11-06 修同样问题：条目行均分高度，不留大片空白。 */
  .ws{flex:1;display:flex;flex-direction:column;margin-top:22px;gap:14px}
  .wn{flex:1;position:relative;background:${pal.paper2};padding:22px 24px 22px 30px;
    display:flex;align-items:center;
    font-size:27px;line-height:1.5;color:${pal.ink}}
  .wn::before{content:"";position:absolute;left:0;top:0;bottom:0;width:6px;
    background:${pal.accent}}
  .foot{margin-top:24px}`);
}

/* ── S09 数字塔：4 组数字 + 高低柱 ─────────────────────────────────── */
export function tplKpiTower(pal, dim, hasImage) {
  const p = dim.w === dim.h ? 76 : 88;
  /* 真数据（2026-11-06 评审）：原来 24/68/92/17 与高低柱全是编造的。
     现在柱高按条目序号递减（纯视觉节奏，不假装是数据），标签用真实条目文案。 */
  const bars = [100, 82, 64, 46];
  return shell(pal, dim, { x: p, y: p }, `
    <h1 class="h-display">{{TITLE}}</h1>
    <div class="tower">
      ${bars.map((h, i) => `<div class="col">
        <div class="bar" style="height:${h}%"></div>
        <div class="val">0${i + 1}</div>
        <div class="lb ctx" data-k="${i}"></div></div>`).join('')}
    </div>
    <p class="lead">{{LEAD}}</p>
    <div class="foot"><span data-author>{{AUTHOR}}</span><span>{{DATE}}</span></div>`, `
  .wrap{padding:${p}px}
  .h-display{font-size:__HSIZE__px;line-height:1.1}
  .tower{flex:1;display:flex;align-items:flex-end;gap:16px;margin:32px 0 0;
    border-bottom:2px solid ${pal.ink};padding-bottom:0}
  .col{flex:1;display:flex;flex-direction:column;justify-content:flex-end;align-items:center;
    height:100%;gap:0}
  .bar{width:100%;background:${pal.accent};opacity:.9}
  .col:nth-child(2) .bar{background:${pal.ink}}
  .col:nth-child(4) .bar{opacity:.5}
  .val{font:800 26px/1 system-ui,sans-serif;color:${pal.ink};margin-top:10px}
  .lb{font-size:18px;line-height:1.35;color:${pal.muted};text-align:center;
    margin:8px 0 14px;max-width:100%;
    display:-webkit-box;-webkit-line-clamp:2;-webkit-box-orient:vertical;overflow:hidden}
  .lead{margin:26px 0 0;font-size:24px;line-height:1.6;color:${pal.muted}}
  .foot{margin-top:18px}`);
}

/* ── S04 浏览器框：内容装进网页窗口 ───────────────────────────────── */
export function tplBrowserMock(pal, dim, hasImage) {
  const p = dim.w === dim.h ? 72 : 84;
  return shell(pal, dim, { x: p, y: p }, `
    <div class="win">
      <div class="bar"><i></i><i></i><i></i><span class="url">supersu.ccwu.cc</span></div>
      <div class="view">
        <h1 class="h-display">{{TITLE}}</h1>
        <p class="lead">{{LEAD}}</p>
        <div class="cta">READ MORE →</div>
      </div>
    </div>
    <div class="foot"><span data-author>{{AUTHOR}}</span><span>{{DATE}}</span></div>`, `
  .poster{background:${pal.paper2}}
  .wrap{padding:${p}px}
  .win{flex:1;display:flex;flex-direction:column;border-radius:12px;overflow:hidden;
    background:${pal.paper};border:1px solid rgba(128,128,128,.34);
    box-shadow:0 22px 60px rgba(0,0,0,.16)}
  .bar{flex:none;display:flex;align-items:center;gap:8px;padding:14px 16px;
    background:${pal.paper2};border-bottom:1px solid rgba(128,128,128,.28)}
  .bar i{width:11px;height:11px;border-radius:50%;background:${pal.muted};opacity:.5;
    display:block}
  .bar i:first-child{background:${pal.accent};opacity:1}
  .url{margin-left:12px;font:400 14px/1 ui-monospace,Menlo,monospace;
    color:${pal.muted};letter-spacing:.06em}
  .view{flex:1;display:flex;flex-direction:column;justify-content:flex-start;padding:44px;
    gap:0}
  .h-display{font-size:__HSIZE__px;line-height:1.12;margin-top:auto}
  .lead{margin:24px 0 0;font-size:25px;line-height:1.7;color:${pal.muted};max-width:100%}
  .cta{margin-top:auto;margin-bottom:auto;align-self:flex-start;
    font:700 17px/1 ui-monospace,Menlo,monospace;
    letter-spacing:.24em;color:${pal.accent}}
  .foot{margin-top:20px}`);
}

/* ── S06 流程架构：三段式（输入 / 生成 / 分享）─────────────────────── */
export function tplPipelineArch(pal, dim, hasImage) {
  const p = dim.w === dim.h ? 76 : 88;
  const stages = [['INPUT', '文案'], ['BUILD', '渲染'], ['SHARE', '导出']];
  return shell(pal, dim, { x: p, y: p }, `
    <h1 class="h-display">{{TITLE}}</h1>
    <div class="arch">
      ${stages.map(([en, cn], i) => `<div class="sg">
        <div class="no">0${i + 1}</div><div class="en">${en}</div>
        <div class="cn">${cn}</div></div>`).join('<div class="arw">→</div>')}
    </div>
    <p class="lead">{{LEAD}}</p>
    <div class="foot"><span data-author>{{AUTHOR}}</span><span>{{DATE}}</span></div>`, `
  .wrap{padding:${p}px}
  .h-display{font-size:__HSIZE__px;line-height:1.1}
  .arch{flex:1;display:flex;align-items:center;gap:14px;margin:26px 0 0}
  .sg{flex:1;border:2px solid ${pal.ink};padding:22px 16px;text-align:center;
    display:flex;flex-direction:column;gap:8px}
  .sg:nth-child(3){background:${pal.accent};border-color:${pal.accent};color:${pal.accentOn}}
  .no{font:700 15px/1 ui-monospace,Menlo,monospace;letter-spacing:.2em;opacity:.6}
  .en{font:800 24px/1 system-ui,sans-serif;letter-spacing:.1em}
  .cn{font-size:20px;opacity:.8}
  .arw{flex:none;font:400 26px/1 system-ui,sans-serif;color:${pal.muted}}
  .lead{margin:26px 0 0;font-size:24px;line-height:1.6;color:${pal.muted}}
  .foot{margin-top:18px}`);
}

/* ── S10 横条排行：5 行横条比大小 ─────────────────────────────────── */
export function tplHBar(pal, dim, hasImage) {
  const p = dim.w === dim.h ? 76 : 88;
  /* 真数据（2026-11-06 评审）：原来「内容 A–E」是占位符、条宽是假的。
     现在文案用真实条目，条宽按序递减（纯排序视觉，不假装是数值）。 */
  const widths = [100, 82, 66, 52, 40];
  return shell(pal, dim, { x: p, y: p }, `
    <h1 class="h-display">{{TITLE}}</h1>
    <div class="bars">
      ${widths.map((w, i) => `<div class="br">
        <span class="bn">0${i + 1}</span>
        <span class="bt ctx" data-k="${i}"></span>
        <span class="bw"><i style="width:${w}%"></i></span></div>`).join('')}
    </div>
    <div class="foot"><span data-author>{{AUTHOR}}</span><span>{{DATE}}</span></div>`, `
  .wrap{padding:${p}px}
  .h-display{font-size:__HSIZE__px;line-height:1.1;margin-bottom:26px}
  .bars{flex:1;display:flex;flex-direction:column;justify-content:center;gap:16px}
  .br{display:flex;align-items:center;gap:16px}
  .bn{flex:none;width:34px;font:700 18px/1 ui-monospace,Menlo,monospace;color:${pal.accent}}
  .bt{flex:none;width:118px;font-size:22px;color:${pal.ink}}
  .bw{flex:1;height:26px;background:${pal.paper2};position:relative}
  .bw i{position:absolute;left:0;top:0;bottom:0;background:${pal.accent};display:block}
  .foot{margin-top:22px}`);
}

/* ── S11 堆叠账本：大数字 + 标签的 4 行 ────────────────────────────── */
export function tplStackedLedger(pal, dim, hasImage) {
  const p = dim.w === dim.h ? 80 : 92;
  /* 真数据（2026-11-06 评审）：原来 04/12/98%/3h 与「步骤/条目/完成/耗时」是编造的，
     和用户内容无关。现在改成「序号 + 真实条目」。 */
  return shell(pal, dim, { x: p, y: p }, `
    <h1 class="h-display">{{TITLE}}</h1>
    <div class="st">
      ${[0, 1, 2, 3].map((i) =>
    `<div class="row"><b>0${i + 1}</b><i class="ctx" data-k="${i}"></i></div>`).join('')}
    </div>
    <p class="lead">{{LEAD}}</p>
    <div class="foot"><span data-author>{{AUTHOR}}</span><span>{{DATE}}</span></div>`, `
  .wrap{padding:${p}px}
  .h-display{font-size:__HSIZE__px;line-height:1.1}
  .st{flex:1;display:flex;flex-direction:column;justify-content:center;margin:28px 0 0;
    border-top:2px solid ${pal.ink}}
  .row{display:flex;align-items:baseline;justify-content:space-between;gap:20px;
    padding:20px 0;border-bottom:1px solid rgba(128,128,128,.34)}
  .row b{font:800 52px/1 system-ui,sans-serif;color:${pal.accent};letter-spacing:-.04em;
    font-variant-numeric:tabular-nums}
  .row i{font-style:normal;font:400 18px/1 ui-monospace,Menlo,monospace;
    letter-spacing:.24em;color:${pal.muted}}
  .lead{margin:24px 0 0;font-size:24px;line-height:1.6;color:${pal.muted}}
  .foot{margin-top:18px}`);
}
