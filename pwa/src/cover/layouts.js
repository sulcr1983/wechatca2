/* 新版式骨架（2026-10-29）—— 4 个结构真正不同的封面版式。
 *
 * 为什么要这个文件：此前 13 张卡里 10 张是同一套 HTML 换了 10 种颜色，
 * 「版式」这一维从来没进过产品（见 output/cover-audit/ 的盘点）。
 * 这里按 docs/spec-cover-layout-skeleton.md 的思路，把结构抽成骨架：
 * 骨架只回答「标题在哪、引语在哪、条目怎么排」，颜色全部来自 catalog 的色板。
 *
 * 与既有代码的边界：
 * - 复用 templates.js 的 prepareCoverHtml（占位符 / 底图注入 / 字体 / fitty）
 * - 容器沿用 .poster + #xhs-cover（续用 applyImage 与截图逻辑）
 * - 标题带 h-display（fitty 与「文字玩法」都靠这个 class 选中）
 * - 所有自建元素用 ly- 前缀，避开 OVERRIDE_CSS 对 .kicker/.content 的改写
 */

import { prepareCoverHtml } from './templates.js';
import { styleById } from './catalog.js';

const W = 1080;
const H = 1440;
const PAD = 96;

// 只出 3:4（与 10 套模板一致；方图/横版留给归藏三套）
const DIM = { w: W, h: H };

function esc(s) {
  return String(s == null ? '' : s)
    .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;').replace(/'/g, '&#39;');
}

function monthStamp() {
  const d = new Date();
  return `${d.getFullYear()}.${String(d.getMonth() + 1).padStart(2, '0')}`;
}

/** 从标题里抽一个编号（「5 个方法」→ 05，「三件小事」→ 03），抽不到给 01。 */
function pickNumber(title) {
  const m = String(title || '').match(/(\d{1,3})/);
  if (m) return m[1].padStart(2, '0');
  const cn = { 一: '01', 二: '02', 三: '03', 四: '04', 五: '05', 六: '06', 七: '07', 八: '08', 九: '09', 十: '10' };
  const c = String(title || '').match(/[一二三四五六七八九十]/);
  return c ? cn[c[0]] : '01';
}

/** 引语切成清单条目；切不出来就返回空数组（版式自动退化为「标题 + 一段引语」）。 */
function splitItems(lead) {
  const parts = String(lead || '')
    .split(/[·、／/｜|，,；;]+/)
    .map((s) => s.trim())
    .filter((s) => s.length >= 2);
  return parts.length >= 2 ? parts.slice(0, 4) : [];
}


/** 有底图时的字色与投影（2026-10-30）：各骨架共用，避免重复算又漏定义。
 *  ink 来自 analyze.js 的实测结果；没有 analysis 时退回白字（原行为）。
 *  ⚠️ 黑字不要加白色光晕投影 —— 那会让笔画边缘发虚，比不加还糊
 *     （社区共识：scrim 管 90% 场景，投影只做辅助且要极轻）。 */
function imgInk(analysis) {
  const ink = analysis?.ink === '#141110' ? '#141110' : '#ffffff';
  const shadow = ink === '#ffffff'
    ? '0 1px 3px rgba(0,0,0,.42), 0 0 1px rgba(0,0,0,.30)'
    : 'none';
  return { ink, shadow };
}

/* ── 外壳：两套版式共用的文档骨架 ───────────────────────────────────── */
function shell({ pal, cls, css, body, hasImage, serif, analysis, textPos }) {
  const family = serif
    ? "'Noto Serif SC', 'Songti SC', Georgia, serif"
    : "'Noto Sans SC', 'PingFang SC', system-ui, sans-serif";
  /* 底图可读性（2026-10-30）：按 analyze.js 实测结果决定
       · 字色（白/黑，按实测亮度比较）
       · 文字块位置（跟着最安静的带走，不再死钉底部）
       · 只在最亮区不达标时才补局部渐变（峰值 ≤0.30）
     没有 analysis 时退回原来的「固定白字 + 深遮罩」——行为不变。 */
  const { ink, shadow } = imgInk(analysis);
  /* 文字区域：新版式骨架是 .ly-body 贴底（justify-content:flex-end），
     文字固定在底部 → 分析区域必须对齐底部，不能按「文字可自由移动」假设。 */
  const zone = analysis?.zone || [0.55, 1.0];
  /* 局部 scrim（Material Design 官方规范 m1.material.io/style/imagery.html）：
     · 只盖文字区域，不整图满铺（官方明令 Don't over-scrim）
     · 4 档渐变、中点偏暗端 3/10（官方 anti-banding 要求；
       两档渐变会出现肉眼可见的暗带边缘 Mach band）
     · 峰值 0.22–0.40（官方深色 scrim Do 区间；>0.40 即 over-scrim）
     无 analysis 时退回原来那条固定渐变（回归安全）。 */
  const needTint = !!analysis?.needsTint;
  const peak = analysis
    ? (needTint ? Math.min(0.40, Math.max(0.22, analysis.tintPeak)) : 0.22)
    : 0.26;
  const bandLo = Math.round(zone[0] * 100);
  const bandHi = Math.round(zone[1] * 100);
  const mid = Math.round(bandLo + (bandHi - bandLo) * 0.7);   // 中点偏暗端 3/10
  const scrim = hasImage
    ? `.ly-scrim{position:absolute;inset:0;z-index:1;pointer-events:none;
    background:linear-gradient(180deg, rgba(12,11,10,0) ${bandLo}%,
      rgba(12,11,10,${(peak * 0.35).toFixed(3)}) ${Math.round(bandLo + (mid - bandLo) * 0.5)}%,
      rgba(12,11,10,${(peak * 0.78).toFixed(3)}) ${mid}%,
      rgba(12,11,10,${peak.toFixed(3)}) ${bandHi}%,
      rgba(12,11,10,${peak.toFixed(3)}) 100%)}`
    : '';
  return `<!doctype html>
<html lang="zh-CN"><head><meta charset="utf-8"><title>封面</title>
<style>
  *{box-sizing:border-box} html,body{margin:0;padding:0}
  :root{
    --paper:${pal.paper}; --paper-2:${pal.paper2}; --ink:${pal.ink};
    --muted:${pal.muted}; --accent:${pal.accent}; --accent-on:${pal.accentOn};
  }
  body{background:var(--paper);color:var(--ink);font-family:${family};-webkit-font-smoothing:antialiased}
  .poster{position:relative;overflow:hidden;isolation:isolate;
          width:${DIM.w}px;height:${DIM.h}px;background:var(--paper);color:var(--ink)}
  .poster .cover-img{position:absolute;inset:0;width:100%;height:100%;object-fit:cover;z-index:0}
  .ly-body{position:relative;z-index:2;height:100%;display:flex;flex-direction:column;
           padding:${PAD}px;justify-content:flex-end}
  /* 纸纹：极淡的点阵，凑近才看得出，避免大面积纯色显得"空" */
  .ly-grain{position:absolute;inset:0;z-index:1;pointer-events:none;opacity:.5;
            background-image:radial-gradient(rgba(0,0,0,.045) 1px, transparent 1px);
            background-size:3px 3px}
  .ly-kick{display:inline-flex;align-items:center;gap:14px;margin:0 0 28px;
           font:500 22px/1 ui-monospace,SFMono-Regular,Menlo,monospace;
           letter-spacing:.28em;text-transform:uppercase;color:var(--muted)}
  .ly-kick::before{content:"";width:56px;height:2px;background:var(--accent);flex:none}
  .ly-title{margin:0;font-size:104px;line-height:1.1;letter-spacing:.01em;font-weight:600}
  .ly-lead{margin:30px 0 0;font-size:30px;line-height:1.68;color:var(--muted);max-width:760px}
  .ly-foot{display:flex;align-items:center;justify-content:space-between;gap:24px;
           margin-top:48px;padding-top:22px;border-top:1px solid rgba(128,128,128,.28);
           font:400 22px/1 ui-monospace,SFMono-Regular,Menlo,monospace;
           letter-spacing:.18em;color:var(--muted)}
  ${hasImage ? `
  /* 底图可读性（2026-10-30 · Material Design 局部 scrim 规范）：
     scrim 只盖文字带（4 档渐变防色带，峰值 0.22–0.40），不整图满铺。
     字色由 analyze.js 按该带实测亮度决定；投影只做辅助（scrim 管 90% 场景）。 */
  ${scrim}
  body.has-img .ly-title{color:${ink};text-shadow:${shadow}}
  body.has-img .ly-lead{color:${ink};opacity:.94;text-shadow:${shadow}}
  body.has-img .ly-kick,body.has-img .ly-foot{color:${ink};opacity:.92;
    text-shadow:${shadow};border-color:${ink === '#ffffff' ? 'rgba(255,255,255,.34)' : 'rgba(20,17,16,.28)'}}
  body.has-img .ly-grain{display:none}
  /* ⚠️ 不动 .ly-body 的 justify-content / padding-top ——
     那会把整块文字顶到某个位置，破坏各版式自己的垂直节奏。
     文字位置微调用 transform 平移（纯视觉位移，不参与布局计算）。 */
  ${textPos && textPos !== 'auto'
    ? `body.has-img .ly-body{transform:translateY(${{top: '-28%', center: '-10%', bottom: '0%'}[textPos] || '0%'})}`
    : ''}
  ` : ''}
  ${css}
</style></head>
<body${hasImage ? ' class="has-img"' : ''}><section class="poster ly-poster ${cls}" id="xhs-cover">
  <img class="cover-img" src="{{IMAGE}}" alt="">
  ${hasImage ? '<div class="ly-scrim"></div>' : ''}
  <div class="ly-grain"></div>
  ${body}
</section></body></html>`;
}

/* ── 1. 图文封面（M16 全出血 / 无图退化为「左侧色带」）────────────────── */
function buildImageLed({ pal, title, lead, author, image, analysis, textPos }) {
  const hasImage = !!image;
  const foot = `<div class="ly-foot"><span>{{DATE}}</span><span data-author>By {{AUTHOR}}</span></div>`;
  const body = `
  <div class="ly-body">
    <p class="ly-kick">封面 · Cover</p>
    <div class="ly-mid">
      <h1 class="ly-title h-display">{{TITLE}}</h1>
      {{LEAD_BLOCK}}
    </div>
    ${foot}
  </div>`;
  const css = hasImage ? `
  /* 有底图：上「栏目」中「标题」下「署名」三点撑开，别把字全堆在底边 */
  .ly-body{justify-content:space-between;padding:${PAD}px ${PAD}px ${PAD - 8}px}
  .ly-title{font-size:112px;font-weight:600}
  .ly-mid{padding-bottom:26px}
  ` : `
  /* 无底图：左侧贯穿色带 + 右侧纸面文字，和「大字版」明显区分 */
  .poster.ly-image-led::before{content:"";position:absolute;left:0;top:0;bottom:0;
    width:150px;background:var(--accent);z-index:1}
  .poster.ly-image-led::after{content:"";position:absolute;left:150px;top:0;bottom:0;
    width:10px;background:var(--paper-2);z-index:1}
  .ly-body{justify-content:space-between;padding:${PAD}px ${PAD}px ${PAD}px ${PAD + 96}px}
  .ly-title{font-size:128px;font-weight:600;line-height:1.04}
  .ly-mid{padding-bottom:30px}
  `;
  return shell({ pal, cls: 'ly-image-led', css, body, hasImage, analysis, textPos });
}

/* ── 2. 金句（M04）────────────────────────────────────────────────── */
function buildQuote({ pal, title, lead, author, image, analysis, textPos }) {
  const hasImage = !!image;
  const body = `
  <div class="ly-body ly-quote-body">
    <div class="ly-mark">“</div>
    <h1 class="ly-title h-display">{{TITLE}}</h1>
    <div class="ly-rule"></div>
    {{LEAD_BLOCK}}
    <div class="ly-sign" data-author>{{AUTHOR}}</div>
  </div>`;
  const css = `
  .ly-quote-body{justify-content:center;align-items:center;text-align:center;padding:150px 130px}
  .ly-mark{font:400 190px/0.6 Georgia,serif;color:var(--accent);opacity:.55;height:96px}
  .poster.ly-quote .ly-title{font-size:100px;line-height:1.34;font-weight:500;letter-spacing:.02em;max-width:820px}
  .ly-rule{width:76px;height:3px;background:var(--accent);margin:44px auto 0;opacity:.85}
  .poster.ly-quote .ly-lead{font-size:28px;text-align:center;margin:34px auto 0;max-width:700px;color:var(--muted)}
  .ly-sign{margin-top:52px;font:400 22px/1 ui-monospace,SFMono-Regular,Menlo,monospace;
           letter-spacing:.3em;color:var(--muted)}
  ${hasImage ? '.poster.ly-quote .ly-body{background:rgba(0,0,0,.18)}' : ''}
  `;
  return shell({ pal, cls: 'ly-quote', css, body, hasImage, serif: true, analysis, textPos });
}

/* ── 3. 编号大字 ──────────────────────────────────────────────────── */
function buildNumber({ pal, title, lead, author, image, analysis, textPos }) {
  const { ink, shadow } = imgInk(analysis);
  const hasImage = !!image;
  const num = pickNumber(title);
  const body = `
  <div class="ly-body">
    <div class="ly-numrow">
      <div class="ly-num">${esc(num)}</div>
      <div class="ly-side">${esc(monthStamp())}</div>
    </div>
    <div class="ly-mid">
      <h1 class="ly-title h-display">{{TITLE}}</h1>
      {{LEAD_BLOCK}}
    </div>
    <div class="ly-foot"><span>No.${esc(num)}</span><span data-author>By {{AUTHOR}}</span></div>
  </div>`;
  const css = `
  /* 数字当主视觉，标题紧跟其下，整块垂直居中（贴顶会留下半屏空白） */
  .ly-body{justify-content:center;padding:${PAD}px}
  .ly-numrow{display:flex;align-items:flex-start;justify-content:space-between;margin-bottom:14px}
  .ly-num{font:800 280px/0.80 'Noto Sans SC',system-ui,sans-serif;letter-spacing:-.06em;
          color:var(--accent);opacity:.92;font-variant-numeric:tabular-nums}
  .ly-side{writing-mode:vertical-rl;font:400 20px/1 ui-monospace,monospace;
           letter-spacing:.34em;color:var(--muted);margin-top:8px}
  .ly-mid{padding-top:8px}
  /* 内容块垂直居中、页脚绝对贴底 —— 两者互不抢空间 */
  .ly-number .ly-foot{position:absolute;left:${PAD}px;right:${PAD}px;bottom:${PAD}px;margin-top:0}
  .poster.ly-number .ly-title{font-size:92px;line-height:1.16;font-weight:700;letter-spacing:-.01em;max-width:820px}
  .poster.ly-number .ly-lead{font-size:28px;line-height:1.7;max-width:700px;margin-top:26px}
  body.has-img .ly-num{opacity:.98;color:${ink};text-shadow:0 3px 20px ${shadow}}
  body.has-img .ly-side{color:${ink};opacity:.88}
  `;
  return shell({ pal, cls: 'ly-number', css, body, hasImage, analysis, textPos });
}

/* ── 4. 清单（M05）────────────────────────────────────────────────── */
function buildList({ pal, title, lead, author, image, analysis, textPos }) {
  const { ink, shadow } = imgInk(analysis);
  const hasImage = !!image;
  const items = splitItems(lead);
  const rows = items.map((t, i) => `
      <li class="ly-item"><span class="ly-idx">${String(i + 1).padStart(2, '0')}</span>
        <span class="ly-txt">${esc(t)}</span></li>`).join('');
  const body = `
  <div class="ly-body">
    <p class="ly-kick">清单 · List</p>
    <h1 class="ly-title h-display">{{TITLE}}</h1>
    ${items.length ? `<ul class="ly-list">${rows}</ul>` : '{{LEAD_BLOCK}}'}
    <div class="ly-foot"><span>{{DATE}}</span><span data-author>By {{AUTHOR}}</span></div>
  </div>`;
  const css = `
  .ly-body{justify-content:center;padding:${PAD}px}
  .poster.ly-list .ly-kick{color:var(--accent)}
  .poster.ly-list .ly-title{font-size:76px;line-height:1.2;font-weight:700;letter-spacing:-.005em;max-width:820px}
  .ly-list{list-style:none;margin:44px 0 0;padding:0;max-width:840px}
  .ly-item{display:flex;align-items:baseline;gap:26px;padding:24px 0;
           border-top:1px solid rgba(128,128,128,.26)}
  .ly-item:last-child{border-bottom:1px solid rgba(128,128,128,.26)}
  .ly-idx{flex:none;font:600 26px/1 ui-monospace,SFMono-Regular,Menlo,monospace;
          color:var(--accent);letter-spacing:.06em;padding-top:2px}
  .ly-txt{font-size:34px;line-height:1.55;color:var(--ink)}
  .poster.ly-list .ly-lead{font-size:30px;margin-top:36px}
  body.has-img .ly-item{border-color:${ink === '#ffffff' ? 'rgba(255,255,255,.34)' : 'rgba(20,17,16,.30)'}}
  body.has-img .ly-txt{color:${ink};text-shadow:0 2px 12px ${shadow}}
  `;
  return shell({ pal, cls: 'ly-list', css, body, hasImage, analysis, textPos });
}

const BUILDERS = {
  'image-led': buildImageLed,
  quote: buildQuote,
  number: buildNumber,
  list: buildList,
};

/**
 * 渲染新版式封面。
 *
 * @param {object} o
 * @param {string} o.style    catalog 里的 styleId（如 'quote-ink'）
 * @param {string} o.title    大标题
 * @param {string} o.lead     引语（清单版式会切成条目）
 * @param {string} o.author   署名（可空）
 * @param {string} o.image    底图 data URL（可空）
 * @param {string} o.baseUrl  资源根（字体绝对 URL 用）
 */
export function buildLayoutHtml({ style, title, lead = '', author = '', image = '', baseUrl = '', analysis = null, textPos = 'auto', frosted = false }) {
  const meta = styleById(style);
  const build = BUILDERS[meta.layout];
  if (!build) throw new Error(`未知版式：${meta.layout}`);
  const pal = {
    paper: meta.paper, paper2: meta.paper2, ink: meta.ink,
    muted: meta.muted, accent: meta.accent, accentOn: meta.accentOn,
  };
  let html = build({ pal, title, lead, author, image, analysis, textPos });

  // 引语块：空引语时整块去掉，不留空段落
  html = html.replace('{{LEAD_BLOCK}}',
    String(lead || '').trim() ? '<p class="ly-lead">{{LEAD}}</p>' : '');

  return prepareCoverHtml(html, { title, lead, author, image, baseUrl, analysis, textPos, frosted });
}

export const LAYOUT_IDS = Object.keys(BUILDERS);
