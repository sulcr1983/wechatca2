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

/* 页角色的中文显示名（自动分页模式下 role 是英文 id） */
const ROLE_CN = {
  cover: '封面', opening: '开篇', dense: '正文',
  points: '清单', quote: '金句', closing: '结尾',
};

/* ── 轻量 SVG 装饰：只画角标 / 细线 / 序号圈，不抢正文 ── */
export function trimSvg(p, { id, pageIndex, motion }) {
  const a = p.accent;
  const corner = motion
    ? `<path d="M52,52 H168 M52,52 V168" stroke="${a}" stroke-opacity=".45" stroke-width="2" fill="none"/>
       <path d="M1028,52 H912 M1028,52 V168" stroke="${a}" stroke-opacity=".45" stroke-width="2" fill="none"/>
       <circle cx="${pageIndex * 8 + 60}" cy="1388" r="3" fill="${a}" opacity=".5"/>`
    : `<path d="M52,52 H120 M52,52 V120" stroke="${a}" stroke-opacity=".28" stroke-width="1" fill="none"/>
       <path d="M1028,1388 H960 M1028,1388 V1320" stroke="${a}" stroke-opacity=".28" stroke-width="1" fill="none"/>`;
  return `<svg class="trim" viewBox="0 0 1080 1440" aria-hidden="true">
    ${corner}
    <path d="M96,1372 H984" stroke="${a}" stroke-opacity=".18" stroke-width="1"/>
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
  .trim{position:absolute;inset:0;width:100%;height:100%;z-index:2;pointer-events:none}
  /* 文字区占满，不再被图案挤压 */
  .page{position:relative;z-index:3;height:100%;padding:96px;
    display:flex;flex-direction:column}
  .kicker{font:500 21px/1 var(--mono);letter-spacing:.20em;color:var(--accent);margin:0}
  .meta{font:500 19px/1 var(--mono);letter-spacing:.16em;color:var(--muted);margin:0}
  .page-head{display:flex;justify-content:space-between;align-items:baseline;
    padding-bottom:16px;border-bottom:1px solid var(--line);margin-bottom:44px;flex:none}
  .display{font-family:var(--serif);font-weight:500;letter-spacing:.03em;line-height:1.28;
    text-wrap:balance;margin:0}
  .body{font-family:var(--serif);font-size:32px;line-height:1.92;font-weight:400;
    letter-spacing:.01em;margin:0;text-align:justify}
  .caption{font:500 20px/1.5 var(--mono);letter-spacing:.12em;color:var(--muted);margin:0}
  .rule{height:1px;background:var(--line);border:0;margin:0}
  .fl{float:left;font-size:3em;line-height:.86;font-weight:500;
    padding:6px 12px 0 0;color:var(--accent)}
  .foot{margin-top:auto;padding-top:18px;border-top:1px solid var(--line);
    display:flex;justify-content:space-between;align-items:baseline;flex:none}
  /* 清单页 */
  .ledger{border-top:2px solid var(--ink)}
  .row{display:grid;grid-template-columns:104px 1fr;align-items:start;
    padding:26px 0;border-bottom:1px solid var(--line)}
  .row .n{font:500 40px/1 var(--mono);color:var(--accent)}
  .row .t{font-family:var(--serif);font-size:31px;line-height:1.6}
  /* 金句页 */
  .quote{font-family:var(--serif);font-weight:500;letter-spacing:.02em;line-height:1.62}
  .bigmark{font-family:var(--serif);font-size:180px;line-height:.6;color:var(--accent);opacity:.22}
`;

function fontFaces() {
  return `
  @font-face{font-family:'NotoSerifSC';src:url('./assets/fonts/noto-serif-sc-400.woff2') format('woff2');font-weight:400;font-display:block}
  @font-face{font-family:'NotoSerifSC';src:url('./assets/fonts/noto-serif-sc-700.woff2') format('woff2');font-weight:700;font-display:block}
  @font-face{font-family:'NotoSansSC';src:url('./assets/fonts/noto-sans-sc-400.woff2') format('woff2');font-weight:400;font-display:block}
  @font-face{font-family:'WenKai';src:url('./assets/fonts/wenkai.woff2') format('woff2');font-display:block}
  @font-face{font-family:'ZcoolXiaowei';src:url('./assets/fonts/zcool-xiaowei.woff2') format('woff2');font-display:block}
  @font-face{font-family:'LongCang';src:url('./assets/fonts/longcang.woff2') format('woff2');font-display:block}`;
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

/* 底层纸纹/墨染：极淡，只提供质感，不抢文字 */
function baseFx(p, id) {
  return `
  <svg class="fx fx-grain" viewBox="0 0 1080 1440" preserveAspectRatio="none" aria-hidden="true">
    <filter id="g${id}"><feTurbulence type="fractalNoise" baseFrequency="0.9" numOctaves="3" stitchTiles="stitch"/>
      <feColorMatrix type="saturate" values="0"/></filter>
    <rect width="1080" height="1440" filter="url(#g${id})" opacity=".06"/>
  </svg>
  <svg class="fx fx-ink" viewBox="0 0 1080 1440" aria-hidden="true">
    <defs><radialGradient id="w${id}" cx="16%" cy="10%" r="72%">
      <stop offset="0%" stop-color="${p.accentSoft}" stop-opacity=".10"/>
      <stop offset="100%" stop-color="${p.accentSoft}" stop-opacity="0"/></radialGradient></defs>
    <rect width="1080" height="1440" fill="url(#w${id})"/>
  </svg>`;
}

/** 生成一页完整 HTML 文档（可单独截图）。
 *  total / page.title / page.toc / page.sectionTitle / page.recap / page.auto
 *  都是可选的自动分页模式扩展；不传时行为与 V3 静态 5 页逐字节一致。
 *  palette 可选：直接注入主题配方色板（公众号 183 套主题适配用），
 *  不传时仍走 art-system.js 的 8 套色板。 */
export function storyPageDoc({ pal, tplId, pageIndex, page, motion, style,
  total = PAGES.length, palette = null }) {
  const base = PALETTES[pal] || PALETTES.xuan;
  /* 主题配方只覆盖颜色字段，字体栈仍由 vars() 提供 */
  const p = palette ? { ...base, ...palette } : base;
  const num = `${String(pageIndex + 1).padStart(2, '0')} / ${String(total).padStart(2, '0')}`;
  const roleCn = page.roleCn || ROLE_CN[page.role] || page.role;
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
:root{${vars(p)}}
${TEXT_CSS}
${style.extraCss || ''}</style></head><body>
<div id="xhs-cover">
  ${baseFx(p, `${tplId}${pageIndex}`)}
  ${trimSvg(p, { id: `${tplId}${pageIndex}`, pageIndex, motion })}
  <div class="page">${html}</div>
</div>
<script src="./vendor/modern-screenshot.js"></script>
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
function splitTitleLines(title, titleSize) {
  const chars = [...title];
  const n = chars.length;
  if (n <= 7) return [title];
  const target = n <= 14 ? 2 : 3;
  for (let count = target; count >= 2; count--) {
    const per = Math.ceil(n / count);
    const parts = [];
    for (let i = 0; i < n; i += per) parts.push(chars.slice(i, i + per).join(''));
    for (let i = 1; i < parts.length; i++) {
      /* 只归还 1–2 个行首字符，避免把整行搬到上一行造成新的孤字 */
      let guard = 0;
      while (parts[i] && LEAD_BAD(parts[i][0]) && parts[i].length > 3 && guard++ < 2) {
        parts[i - 1] += parts[i][0];
        parts[i] = parts[i].slice(1);
      }
    }
    const out = parts.filter(Boolean);
    if (out[out.length - 1].length >= 3) return out;
  }
  return [title];
}

/* 自动分页模式：严格渲染 paginate() 产出的真实块，不编造任何用户内容。
 * 静态 5 页 demo 走下面的原有分支，行为不变。 */
function renderAuto(page, style) {
  const T = style.titleFont || 'var(--serif)';
  const B = style.bodyFont || 'var(--serif)';
  const fs = style.bodySize || 32;

  if (page.role === 'cover') {
    const title = String(page.title || '未命名');
    const lines = splitTitleLines(title, style.titleSize || 82);
    const toc = (page.toc || []).map((t, i) =>
      `${String(i + 1).padStart(2, '0')}　${esc(t)}`).join('<br>');
    const titlePx = Math.min(style.titleSize || 82, lines.length >= 4 ? 62 : (lines.length === 3 ? 70 : 82));
    return `<div style="display:flex;flex-direction:column;justify-content:center;flex:1">
      <p class="kicker" style="margin-bottom:40px">${esc(style.coverKicker || 'EDITORIAL · 长图文')}</p>
      <h1 class="display" style="font-family:${T};font-size:${titlePx}px;
        margin-bottom:44px">${lines.map(esc).join('<br>')}</h1>
      <div style="width:96px;height:3px;background:var(--accent);margin-bottom:36px"></div>
      ${page.lead ? `<p style="font-family:${B};font-size:${fs}px;line-height:1.9;margin:0 0 48px">
        ${esc(page.lead)}</p>` : ''}
      ${toc ? `<div style="border-top:1px solid var(--line);padding-top:22px">
        <p class="caption" style="margin-bottom:14px">本期目录 · IN THIS ISSUE</p>
        <p style="font-family:${B};font-size:26px;line-height:2.0;color:var(--muted);margin:0">${toc}</p>
      </div>` : ''}
    </div>`;
  }

  /* 非封面：按块类型原样排印 */
  const parts = page.blocks.map((b, i) => {
    if (b.type === 'h') return `<h2 style="font-family:${T};font-weight:500;font-size:52px;
      letter-spacing:.03em;line-height:1.3;margin:0 0 30px">${esc(b.text)}</h2>`;
    if (b.type === 'quote') return `<div style="border-left:4px solid var(--accent);
      padding-left:28px;margin:8px 0 32px">
      <p class="quote" style="font-family:${T};font-size:${Math.max(40, fs + 12)}px;
        margin:0">${esc(b.text)}</p></div>`;
    if (b.type === 'li') return `<div class="row" style="display:grid;grid-template-columns:104px 1fr;
      align-items:start;padding:22px 0;border-bottom:1px solid var(--line)">
      <span class="n" style="font:500 40px/1 var(--mono);color:var(--accent)">${String(i + 1).padStart(2, '0')}</span>
      <span style="font-family:${B};font-size:${fs}px;line-height:1.7">${esc(b.text)}</span></div>`;
    /* p：首块首字下沉（若该页以正文开头） */
    const first = i === 0 && page.role !== 'points';
    return `<p style="font-family:${B};font-size:${fs}px;line-height:${style.lineHeight || 1.92};
      margin:0 0 ${style.paraGap || 26}px;text-align:justify">${first
        ? `<span class="fl">${esc(String(b.text)[0] || '')}</span>${esc(String(b.text).slice(1))}`
        : esc(b.text)}</p>`;
  }).join('');

  const head = page.sectionTitle
    ? `<h2 style="font-family:${T};font-weight:500;font-size:54px;margin:0 0 14px">${esc(page.sectionTitle)}</h2>
       <p class="caption" style="margin-bottom:32px">${esc(page.sectionNote || '')}</p>
       <hr class="rule" style="margin-bottom:34px">`
    : '';
  return `<div style="flex:1">${head}${parts}</div>`;
}

/* 5 种角色各自的文字排印（文字是主体） */
function renderRole(page, style) {
  if (page.auto) return renderAuto(page, style);
  const T = style.titleFont || 'var(--serif)';
  const B = style.bodyFont || 'var(--serif)';
  const fs = style.bodySize || 32;
  const titleSize = style.titleSize || 88;
  if (page.key === 'cover') {
    return `<div style="display:flex;flex-direction:column;justify-content:center;flex:1">
      <p class="kicker" style="margin-bottom:40px">${esc(style.coverKicker || 'EDITORIAL · 长图文')}</p>
      <h1 class="display" style="font-family:${T};font-size:${Math.min(titleSize, 82)}px;margin-bottom:44px">
        周末去海边<br>我把手机<br>调成飞行模式</h1>
      <div style="width:96px;height:3px;background:var(--accent);margin-bottom:36px"></div>
      <p style="font-family:${B};font-size:${fs}px;line-height:1.9;margin:0 0 48px">${esc(page.text)}……</p>
      <div style="border-top:1px solid var(--line);padding-top:22px">
        <p class="caption" style="margin-bottom:14px">本期目录 · IN THIS ISSUE</p>
        <p style="font-family:${B};font-size:26px;line-height:2.0;color:var(--muted);margin:0">
          开篇 · 沉默之后　／　正文 · 慢慢走　／　六件事　／　金句与收束</p>
      </div>
    </div>`;
  }
  if (page.key === 'opening') {
    return `<div style="flex:1">
      <h2 style="font-family:${T};font-weight:500;font-size:56px;letter-spacing:.03em;
        line-height:1.3;margin:0 0 36px">开篇 · 沉默之后</h2>
      <hr class="rule" style="margin-bottom:38px">
      <p style="font-family:${B};font-size:${fs + 2}px;line-height:2.0;margin:0">
        <span class="fl">${esc(page.text[0])}</span>${esc(page.text.slice(1))}</p>
    </div>`;
  }
  if (page.key === 'points') {
    return `<div style="flex:1">
      <h2 style="font-family:${T};font-weight:500;font-size:56px;margin:0 0 14px">六件事</h2>
      <p class="caption" style="margin-bottom:34px">把手机收起来之后，我留下的清单</p>
      <div class="ledger">
        ${(page.items || []).map((t, i) => `<div class="row">
          <span class="n">${String(i + 1).padStart(2, '0')}</span>
          <span class="t" style="font-family:${B}">${esc(t)}</span></div>`).join('')}
      </div>
    </div>`;
  }
  if (page.key === 'closing') {
    return `<div style="flex:1;display:flex;flex-direction:column;justify-content:center">
      <div class="bigmark">“</div>
      <p class="quote" style="font-family:${T};font-size:56px;margin:24px 0 44px">
        ${esc(page.quote)}</p>
      <hr class="rule" style="margin-bottom:32px">
      <p style="font-family:${B};font-size:${fs}px;line-height:1.9;margin:0 0 38px">
        ${esc(page.text)}</p>
      <div style="border-top:1px solid var(--line);padding-top:20px">
        <p class="caption" style="margin-bottom:16px">这五页，说了什么</p>
        <p style="font-family:${B};font-size:26px;line-height:2.0;color:var(--muted);margin:0">
          01　把手机留在车里，先坐十分钟<br>
          02　慢下来，才看得见细节<br>
          03　写下来，不给点赞留位置<br>
          04　别熬到两点，早点睡</p>
      </div>
    </div>`;
  }
  /* dense 正文：整段文字，占满页面 */
  return `<div style="flex:1">
    <h2 style="font-family:${T};font-weight:500;font-size:56px;margin:0 0 14px">正文 · 慢慢走</h2>
    <p class="caption" style="margin-bottom:38px">${esc(style.sectionNote || '把注意力还给真实的生活')}</p>
    <hr class="rule" style="margin-bottom:38px">
    <p style="font-family:${B};font-size:${fs}px;line-height:2.0;margin:0 0 32px;text-align:justify">
      <span class="fl">${esc(page.text[0])}</span>${esc(page.text.slice(1))}</p>
    <p style="font-family:${B};font-size:${fs - 4}px;line-height:1.9;color:var(--muted);
      margin:0 0 26px;text-align:justify">${esc(style.tailText || '原来不是生活没有细节，是我以前走得太快。')}</p>
    <p style="font-family:${B};font-size:${fs - 6}px;line-height:1.9;color:var(--muted);
      margin:0;text-align:justify">如果你也想试试，就从下一个周末开始。把手机调成飞行模式，
      找一片听得见风的地方，坐十分钟，什么也不做。你会发现自己一直没有漏掉什么，
      真正漏掉的，是那些没有被你看见的下午。</p>
  </div>`;
}
