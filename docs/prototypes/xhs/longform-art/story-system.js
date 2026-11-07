/* V3 页面外壳 · 文字为主、SVG 为辅
 *
 * 与 V2 的区别：
 *   V2：.page-content 被图案挤压到 1/3 宽，SVG 占 2/3 画面 → 海报
 *   V3：.page-content 固定 96px 页边距、占满可用区；SVG 只在页眉角标、
 *       页脚分隔线、段首发丝线等 ≤15% 面积处出现 → 长图文
 */

import { PALETTES } from './art-system.js';
import { PAGES } from './story.js';
import { esc } from './fixture.js';
import { renderDecor } from './decor.js';

/* ── 产品 dist 资源绝对前缀（移植适配）─────────────────────────────
 * 本模块生成的 HTML 会被塞进 srcdoc iframe（预览 / renderPageDoc 出图），
 * srcdoc 里的相对路径会解析到 about:srcdoc 而 404。
 * 产品 cards.js::pageDoc 用 opts.baseUrl 绝对路径注入 cover-fonts.css，这里同思路：
 *   dist/src/cover/v6/<file>.js  →  上三级 = dist/
 * 字体与 vendor 都在 dist/fonts/cover/ 与 dist/vendor/（构建已拷，无需新增资源）。
 */
const ASSET_BASE = new URL('./', import.meta.url).href;
const FONT_BASE = `${ASSET_BASE}assets/fonts/`;


/* 页角色的中文显示名（自动分页模式下 role 是英文 id） */
const ROLE_CN = {
  cover: '封面', opening: '开篇', dense: '正文',
  points: '清单', quote: '金句', closing: '结尾',
};

/* ── 裁切角线 + 页脚细线：印刷品本来的语言，不是装饰图案 ── */
export function trimSvg(p, { id, pageIndex, motion }) {
  const a = p.accent;
  return `<svg class="trim" viewBox="0 0 1080 1440" aria-hidden="true">
    <g stroke="${a}" stroke-opacity=".22" stroke-width="1" fill="none">
      <path d="M52,52 H104 M52,52 V104"/>
      <path d="M1028,52 H976 M1028,52 V104"/>
      <path d="M52,1388 H104 M52,1388 V1336"/>
      <path d="M1028,1388 H976 M1028,1388 V1336"/>
    </g>
    <path d="M96,1372 H984" stroke="${a}" stroke-opacity=".14" stroke-width="1"/>
  </svg>`;
}

/* 页面通用 CSS（文字优先） */
const TEXT_CSS = `
  *{box-sizing:border-box} html,body{margin:0;padding:0}
  #xhs-cover{position:relative;width:1080px;height:1440px;overflow:hidden;
    background:var(--paper);color:var(--ink)}
  .fx{position:absolute;inset:0;width:100%;height:100%;pointer-events:none}
  .fx-grain{z-index:0;mix-blend-mode:multiply}
  .fx-ink{z-index:1;opacity:.45}
  /* 装饰层：在纸纹之上、文字之下。透明度交给各手法自己控制，
     整层不再额外降透明（否则细线会看不见）。 */
  .fx-decor{z-index:2}
  .trim{position:absolute;inset:0;width:100%;height:100%;z-index:3;pointer-events:none}

  /* ── 页面骨架：文字区占满，不被图案挤压 ───────────────────── */
  .page{position:relative;z-index:3;height:100%;padding:96px;
    display:flex;flex-direction:column}
  .page-head{display:flex;justify-content:space-between;align-items:baseline;
    padding-bottom:16px;border-bottom:1px solid var(--line);margin-bottom:44px;flex:none}
  .kicker{font:500 21px/1 var(--mono);letter-spacing:.20em;color:var(--accent);margin:0}
  .meta{font:500 19px/1 var(--mono);letter-spacing:.16em;color:var(--muted);margin:0}
  .caption{font:500 20px/1.5 var(--mono);letter-spacing:.12em;color:var(--muted);margin:0}
  .rule{height:1px;background:var(--line);border:0;margin:0}
  .foot{margin-top:auto;padding-top:18px;border-top:1px solid var(--line);
    display:flex;justify-content:space-between;align-items:baseline;flex:none}

  /* ── 通用排版：字号/字体由 #xhs-cover 上的自定义属性注入 ──── */
  .fill{flex:1}
  .mid{display:flex;flex-direction:column;justify-content:center;flex:1}
  .display{font-family:var(--title-font);font-weight:500;letter-spacing:.03em;
    line-height:1.28;text-wrap:balance;margin:0;font-size:var(--title-size)}
  .body-text{font-family:var(--body-font);font-size:var(--body-size);
    line-height:var(--body-lh);margin:0;text-align:justify}
  .body-text+.body-text{margin-top:var(--para-gap)}
  .muted-text{color:var(--muted)}
  .small-text{font-size:var(--small-size);line-height:1.9;margin:var(--para-gap) 0 0}

  /* 首字下沉 */
  .drop::first-letter{float:left;font-size:3em;line-height:.86;font-weight:500;
    padding:6px 12px 0 0;color:var(--accent)}
  .fl{float:left;font-size:3em;line-height:.86;font-weight:500;
    padding:6px 12px 0 0;color:var(--accent)}

  /* ── 封面 ───────────────────────────────────────────────── */
  .cover-kicker{margin-bottom:40px}
  .cover-title{margin-bottom:44px}
  .cover-rule{width:96px;height:3px;background:var(--accent);margin-bottom:36px}
  .cover-lead{font-family:var(--body-font);font-size:var(--body-size);
    line-height:1.9;margin:0 0 48px;text-align:justify}
  .toc{border-top:1px solid var(--line);padding-top:22px}
  .toc .caption{margin-bottom:14px}
  .toc-list{font-family:var(--body-font);font-size:26px;line-height:2;
    color:var(--muted);margin:0}

  /* ── 正文块 ─────────────────────────────────────────────── */
  .block-h{font-family:var(--title-font);font-weight:500;font-size:52px;
    letter-spacing:.03em;line-height:1.3;margin:0 0 30px}
  .block-quote{border-left:4px solid var(--accent);padding-left:28px;
    margin:8px 0 32px}
  .block-quote p{font-family:var(--title-font);font-weight:500;letter-spacing:.02em;
    line-height:1.62;font-size:var(--quote-size);margin:0}
  .section-h{font-family:var(--title-font);font-weight:500;font-size:54px;
    margin:0 0 14px}
  .section-note{margin-bottom:32px}
  .section-rule{margin-bottom:34px}
  .tail-text{font-family:var(--body-font);font-size:var(--tail-size);
    line-height:1.9;color:var(--muted);margin:var(--para-gap) 0 0;text-align:justify}

  /* ── 清单 / 账本 ────────────────────────────────────────── */
  .ledger{border-top:2px solid var(--ink)}
  .row{display:grid;grid-template-columns:104px 1fr;align-items:start;
    padding:26px 0;border-bottom:1px solid var(--line)}
  .row .n{font:500 40px/1 var(--mono);color:var(--accent)}
  .row .t{font-family:var(--body-font);font-size:var(--body-size);line-height:1.6}

  /* ── 金句 / 结尾 ────────────────────────────────────────── */
  .quote{font-family:var(--title-font);font-weight:500;letter-spacing:.02em;
    line-height:1.62;font-size:var(--quote-size);margin:24px 0 44px}
  .bigmark{font-family:var(--title-font);font-size:180px;line-height:.6;
    color:var(--accent);opacity:.22}
  .end-rule{margin-bottom:32px}
  .end-text{margin:0 0 38px}
  .end-toc{border-top:1px solid var(--line);padding-top:20px}
  .end-toc .caption{margin-bottom:16px}
`;

function fontFaces() {
  return `
  @font-face{font-family:'NotoSerifSC';src:url('${FONT_BASE}noto-serif-sc-400.woff2') format('woff2');font-weight:400;font-display:block}
  @font-face{font-family:'NotoSerifSC';src:url('${FONT_BASE}noto-serif-sc-700.woff2') format('woff2');font-weight:700;font-display:block}
  @font-face{font-family:'NotoSansSC';src:url('${FONT_BASE}noto-sans-sc-400.woff2') format('woff2');font-weight:400;font-display:block}
  @font-face{font-family:'WenKai';src:url('${FONT_BASE}wenkai.woff2') format('woff2');font-display:block}
  @font-face{font-family:'ZcoolXiaowei';src:url('${FONT_BASE}zcool-xiaowei.woff2') format('woff2');font-display:block}
  @font-face{font-family:'LongCang';src:url('${FONT_BASE}longcang.woff2') format('woff2');font-display:block}`;
}

/** 排印参数 → CSS 自定义属性（避免每段都拼内联 style）。 */
function typeVars(style) {
  const fs = style.bodySize || 32;
  return `--body-font:${style.bodyFont || 'var(--serif)'};`
    + `--title-font:${style.titleFont || 'var(--serif)'};`
    + `--body-size:${fs}px;--body-lh:${style.lineHeight || 1.92};`
    + `--para-gap:${style.paraGap || 26}px;`
    + `--quote-size:${Math.max(40, fs + 12)}px;`
    + `--tail-size:${Math.max(24, fs - 4)}px;`
    + `--small-size:${Math.max(22, fs - 6)}px;`;
}

function vars(p) {
  const SERIF = "'NotoSerifSC','Songti SC',serif", SANS = "'NotoSansSC','PingFang SC',sans-serif",
    WENKAI = "'WenKai','Kaiti SC',serif", XIAOWEI = "'ZcoolXiaowei','Songti SC',serif",
    LONGCANG = "'LongCang','Kaiti SC',serif";
  return `--paper:${p.paper};--paper2:${p.paper2};--ink:${p.ink};--muted:${p.muted};`
    + `--accent:${p.accent};--accentSoft:${p.accentSoft};--line:${p.line};`
    + `--serif:${SERIF};--sans:${SANS};--wenkai:${WENKAI};--xiaowei:${XIAOWEI};`
    + `--longcang:${LONGCANG};--mono:ui-monospace,Menlo,monospace;`;
}

/* ── 原创 SVG 构图系统 ────────────────────────────────────────────
 * 用户反馈：「这么多模板，很多都是一样的，能不能搞多点 svg 原创性的设计模板」。
 * 原先 49 张卡共用 baseFx 一种底纹 + trimSvg 两态（motion 开关），所以
 * 「居中素排·中标」9 张里 7 张 title=79/lh=1.9，只差配色 → 视觉上完全一样。
 *
 * 现在按「族」给 8 套真正不同的构图语言（motif），全部：
 *   · 静态（无动画，导出 PNG 后一致）
 *   · 只用 CSS 变量取色（--accent / --ink / --line），不自造色值
 *   · 极淡（opacity ≤ .12），只在留白处出现，不抢正文（文字仍占满 888×1248）
 *   · 纯 SVG 几何，零外部资源
 */
/* 底层：只留极淡纸纹，提供「纸」的质感，不画任何装饰图形。
 * 用户反馈：「这种样式在网上看到过很多，就别用了，用我们自己原创的」——
 * 点阵/扫描线/拱门/八角星/半调网点这类原子图形，是设计素材站的通行套路，已全部删除。
 * 现在每张卡的差异**只由排印本身**产生：
 *   字号档 / 字族 / 行距 / 字距 / 正文对齐 / 标题对齐 / 标题装饰线 / 明暗
 * 这些参数取自 183 套公众号主题的真实 JSON，是「排出来的」，不是「画上去的」。
 * 另有印刷品本来的语言：极淡纸纹 + 页脚细线 + 裁切角线（trimSvg）。 */
function baseFx(p, id) {
  return `
  <svg class="fx fx-grain" viewBox="0 0 1080 1440" preserveAspectRatio="none" aria-hidden="true">
    <filter id="g${id}"><feTurbulence type="fractalNoise" baseFrequency="0.9" numOctaves="3" stitchTiles="stitch"/>
      <feColorMatrix type="saturate" values="0"/></filter>
    <rect width="1080" height="1440" filter="url(#g${id})" opacity=".045"/>
  </svg>`;
}

/** 生成一页完整 HTML 文档（可单独截图）。
 *  total / page.title / page.toc / page.sectionTitle / page.recap / page.auto
 *  都是可选的自动分页模式扩展；不传时行为与 V3 静态 5 页逐字节一致。
 *  palette 可选：直接注入主题配方色板（公众号 183 套主题适配用），
 *  不传时仍走 art-system.js 的 8 套色板。 */
export function storyPageDoc({ pal, tplId, pageIndex, page, motion, style,
  total = PAGES.length, palette = null, family = '', decor = null }) {
  const base = PALETTES[pal] || PALETTES.xuan;
  /* 主题配方只覆盖颜色字段，字体栈仍由 vars() 提供 */
  const p = palette ? { ...base, ...palette } : base;
  const num = `${String(pageIndex + 1).padStart(2, '0')} / ${String(total).padStart(2, '0')}`;
  const roleCn = page.roleCn || ROLE_CN[page.role] || page.role;
  /* 装饰层：由模板真实参数驱动（标题文字 / 强调色 / 明暗 / 页序），
     不是贴上去的现成纹样 —— 换个标题或换页，图形跟着变。 */
  const decorSvg = decor
    ? renderDecor(decor, p, {
        text: String(page.title || style.issue || ''),
        pageIndex,
        total,
        role: page.role || page.key || '',
      })
    : '';
  const html = `
  <div class="page-head">
    <span class="kicker">${esc(style.label)} · ${esc(roleCn)}</span>
    <span class="meta">${esc(style.issue)}　${num}</span>
  </div>
  ${renderRole(page, style)}
  <div class="foot">
    <span class="caption">${esc(style.footer)}</span>
    <span class="caption">SUPERSU · ${num}</span>
  </div>`;
  return `<!doctype html><html lang="zh-CN"><head><meta charset="utf-8">
<style>${fontFaces()}
:root{${vars(p)}${typeVars(style)}}
${TEXT_CSS}
${style.extraCss || ''}</style></head><body>
<div id="xhs-cover">
  ${baseFx(p, `${tplId}${pageIndex}`)}
  ${decorSvg ? `<svg class="fx fx-decor" viewBox="0 0 1080 1440" aria-hidden="true">${decorSvg}</svg>` : ''}
  ${trimSvg(p, { id: `${tplId}${pageIndex}`, pageIndex, motion })}
  <div class="page">${html}</div>
</div>
<script src="${ASSET_BASE}vendor/modern-screenshot.js"></script>
</body></html>`;
}

/* 封面标题分行：均分行数 + 行首标点归还上一行。
 * ⚠️ 旧实现按固定字数硬切（per=5 切 18 字标题 → 4 行、末行「模式」孤字、
 *    且出现「，我把手机」这种以标点开头的行，实测截图）。
 *    中文排版禁止孤字成行、禁止行首标点（归藏规范 / AGENTS §10）。 */
const LEAD_PUNCT = /^[，。！？；、：,.!?;:）」』】]/;
/* 行首虚词同样要归还上一行，否则会出现「我把手机调成 / 了飞行模式」这种断词 */
const LEAD_WEAK = /^[了着的在是把被给对与及或而后就才也还]/;
const LEAD_BAD = (c) => LEAD_PUNCT.test(c) || LEAD_WEAK.test(c);

/* ⚠️ 旧实现按「字数」硬切（n<=7 单行、n<=14 两行、否则三行），
 *    第二个参数 titleSize 传了却完全没用 —— 于是《桂花巷的黄昏》8 个字
 *    被切成「《桂花巷的 / 黄昏》」，右侧整片空白（用户截图反馈）。
 *    现在按「实际像素宽」判断：整行放得下就不拆，放不下才拆且各行尽量均分。 */
const TITLE_AVAIL = 888;                       // 1080 - 96*2（.page padding）
const _cw = (c) => {
  if (c === ' ') return 0.32;
  const cp = c.codePointAt(0);
  if (cp >= 0x2e80 && cp <= 0x9fff) return 1;  // 中日韩汉字
  if (cp >= 0x3000 && cp <= 0x303f) return 1;  // 中文标点
  if (cp >= 0xff00 && cp <= 0xffef) return 1;  // 全角
  return 0.56;                                 // 拉丁 / 数字
};
const textWidth = (s, size) => {
  let w = 0;
  for (const c of s) w += _cw(c);
  /* 0.035em 字距按 1.01 折入，宁可高估一点点免得贴边溢出 */
  return w * size * 1.01;
};

function splitTitleLines(title, titleSize, avail = TITLE_AVAIL) {
  const size = titleSize || 82;
  const chars = [...String(title || '')];
  if (chars.length < 2) return [title];
  const total = textWidth(title, size);
  if (total <= avail) return [title];          // 一行放得下 → 不拆（原来这里永远走不到）
  const need = Math.min(4, Math.ceil(total / avail));
  if (need <= 1) return [title];

  /* 均分：每行目标宽 = 总宽 / 行数；贪心装到接近目标就断行 */
  const target = total / need;
  const lines = [];
  let cur = '', curW = 0;
  for (let i = 0; i < chars.length; i++) {
    const c = chars[i];
    const w = _cw(c) * size * 1.01;
    const remain = chars.length - i;
    const linesLeft = need - lines.length - 1;
    /* 剩下的字必须够填满剩余行（每行至少 2 字），否则宁可超宽也不提前断 */
    const mustFill = linesLeft > 0 && remain <= linesLeft * 2;
    if (cur && curW + w > target * 1.06 && !mustFill) {
      lines.push(cur); cur = c; curW = w;
    } else {
      cur += c; curW += w;
    }
  }
  if (cur) lines.push(cur);

  /* 行首禁则：标点 / 虚词归还上一行（最多 2 个，避免把整行搬走） */
  for (let i = 1; i < lines.length; i++) {
    let guard = 0;
    while (lines[i] && LEAD_BAD(lines[i][0]) && lines[i].length > 2 && guard++ < 2) {
      lines[i - 1] += lines[i][0];
      lines[i] = lines[i].slice(1);
    }
  }
  return lines.filter(Boolean);
}

/* 自动分页模式：严格渲染 paginate() 产出的真实块，不编造任何用户内容。
 * 静态 5 页 demo 走下面的原有分支，行为不变。 */
function renderAuto(page, style) {
  if (page.role === 'cover') {
    const title = String(page.title || '未命名');
    /* 标题字号按可用宽度算（杂志封面做法，逻辑不变；结果只注入 CSS 变量）：
     * 一行放得下就撑满版心，放不下先尝试缩成一行，实在太长才拆。 */
    const AVAIL = 888;                    // 1080 - 96*2
    const CEIL = 132;
    const basePx = Math.min(style.titleSize || 82, 112);
    const w1 = textWidth(title, basePx);
    let titlePx = basePx, lines;
    if (w1 <= AVAIL) {
      titlePx = Math.min(CEIL, Math.floor((AVAIL * 0.98) / (w1 / basePx)));
      lines = [title];
    } else {
      const fitPx = Math.floor((AVAIL * 0.98) / (w1 / basePx));
      if (fitPx >= 62) { titlePx = fitPx; lines = [title]; }
      else {
        lines = splitTitleLines(title, basePx, AVAIL);
        if (lines.length >= 3) {
          titlePx = Math.min(basePx, lines.length >= 4 ? 62 : 70);
          lines = splitTitleLines(title, titlePx, AVAIL);
        }
      }
    }
    const toc = (page.toc || []).map((t, i) =>
      `${String(i + 1).padStart(2, '0')}　${esc(t)}`).join('<br>');
    return `<div class="mid">
      <p class="kicker cover-kicker">${esc(style.coverKicker || 'EDITORIAL · 长图文')}</p>
      <h1 class="display cover-title" style="--title-size:${titlePx}px">${lines.map(esc).join('<br>')}</h1>
      <div class="cover-rule"></div>
      ${page.lead ? `<p class="cover-lead">${esc(page.lead)}</p>` : ''}
      ${toc ? `<div class="toc">
        <p class="caption">本期目录 · IN THIS ISSUE</p>
        <p class="toc-list">${toc}</p>
      </div>` : ''}
    </div>`;
  }

  /* 非封面：按块类型原样排印 */
  const parts = page.blocks.map((b, i) => {
    if (b.type === 'h') return `<h2 class="block-h">${esc(b.text)}</h2>`;
    if (b.type === 'quote') return `<div class="block-quote"><p>${esc(b.text)}</p></div>`;
    if (b.type === 'li') return `<div class="row">
      <span class="n">${String(i + 1).padStart(2, '0')}</span>
      <span class="t">${esc(b.text)}</span></div>`;
    /* p：首块首字下沉（若该页以正文开头） */
    const first = i === 0 && page.role !== 'points';
    return `<p class="body-text">${first
      ? `<span class="fl">${esc(String(b.text)[0] || '')}</span>${esc(String(b.text).slice(1))}`
      : esc(b.text)}</p>`;
  }).join('');

  const head = page.sectionTitle
    ? `<h2 class="section-h">${esc(page.sectionTitle)}</h2>
       <p class="caption section-note">${esc(page.sectionNote || '')}</p>
       <hr class="rule section-rule">`
    : '';
  return `<div class="fill">${head}${parts}</div>`;
}

/* 5 种角色各自的文字排印（文字是主体） */
function renderRole(page, style) {
  if (page.auto) return renderAuto(page, style);
  const tSize = Math.min(style.titleSize || 88, 82);
  if (page.key === 'cover') {
    return `<div class="mid">
      <p class="kicker cover-kicker">${esc(style.coverKicker || 'EDITORIAL · 长图文')}</p>
      <h1 class="display cover-title" style="--title-size:${tSize}px">
        周末去海边<br>我把手机<br>调成飞行模式</h1>
      <div class="cover-rule"></div>
      <p class="cover-lead">${esc(page.text)}……</p>
      <div class="toc">
        <p class="caption">本期目录 · IN THIS ISSUE</p>
        <p class="toc-list">开篇 · 沉默之后　／　正文 · 慢慢走　／　六件事　／　金句与收束</p>
      </div>
    </div>`;
  }
  if (page.key === 'opening') {
    return `<div class="fill">
      <h2 class="section-h">开篇 · 沉默之后</h2>
      <hr class="rule section-rule">
      <p class="body-text"><span class="fl">${esc(page.text[0])}</span>${esc(page.text.slice(1))}</p>
    </div>`;
  }
  if (page.key === 'points') {
    return `<div class="fill">
      <h2 class="section-h">六件事</h2>
      <p class="caption section-note">把手机收起来之后，我留下的清单</p>
      <div class="ledger">
        ${(page.items || []).map((t, i) => `<div class="row">
          <span class="n">${String(i + 1).padStart(2, '0')}</span>
          <span class="t">${esc(t)}</span></div>`).join('')}
      </div>
    </div>`;
  }
  if (page.key === 'closing') {
    return `<div class="mid">
      <div class="bigmark">“</div>
      <p class="quote">${esc(page.quote)}</p>
      <hr class="rule end-rule">
      <p class="body-text end-text">${esc(page.text)}</p>
      <div class="end-toc">
        <p class="caption">这五页，说了什么</p>
        <p class="toc-list">01　把手机留在车里，先坐十分钟<br>
          02　慢下来，才看得见细节<br>
          03　写下来，不给点赞留位置<br>
          04　别熬到两点，早点睡</p>
      </div>
    </div>`;
  }
  /* dense 正文：整段文字，占满页面（⚠️ 原有 3 段，一段都不能少） */
  return `<div class="fill">
    <h2 class="section-h">正文 · 慢慢走</h2>
    <p class="caption section-note">${esc(style.sectionNote || '把注意力还给真实的生活')}</p>
    <hr class="rule section-rule">
    <p class="body-text"><span class="fl">${esc(page.text[0])}</span>${esc(page.text.slice(1))}</p>
    <p class="body-text tail-text">${esc(style.tailText || '原来不是生活没有细节，是我以前走得太快。')}</p>
    <p class="body-text muted-text small-text">如果你也想试试，就从下一个周末开始。把手机调成飞行模式，
      找一片听得见风的地方，坐十分钟，什么也不做。你会发现自己一直没有漏掉什么，
      真正漏掉的，是那些没有被你看见的下午。</p>
  </div>`;
}
