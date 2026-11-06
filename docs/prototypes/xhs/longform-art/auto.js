/* 自动分页适配层 · 连接 paginate.js 与 story-system.js
 *
 * 职责（最小改动）：
 *   1. 从 12 套排印风格派生「度量参数」（字号/行距/版心宽/字体族真实值）
 *   2. 在浏览器里建一个隐藏度量宿主，保证 @font-face 与成品同源
 *   3. 调 paginate() 得到动态页 → 转成 storyPageDoc 能吃的页形状
 *   4. 返回零丢字 / 截断 / 页数等自检数据
 *
 * ⚠️ 不编造用户内容：封面目录只列原文里的 Markdown 标题；
 *    没有标题就不显示目录块。封面导语是正文首段摘要，不参与零丢字校验
 *    （全文完整出现在后续页，paginate() 已校验）。
 */

import { paginate, MAX_PAGES } from './paginate.js';
import { storyPageDoc } from './story-system.js';
import { esc } from './fixture.js';

/* CSS 变量 → 真实字体族（度量宿主里没有 :root，必须解析成实际值） */
const FONT_REAL = {
  'var(--serif)': "'NotoSerifSC','Songti SC',serif",
  'var(--sans)': "'NotoSansSC','PingFang SC',sans-serif",
  'var(--wenkai)': "'WenKai','Kaiti SC',serif",
  'var(--xiaowei)': "'ZcoolXiaowei','Songti SC',serif",
  'var(--longcang)': "'LongCang','Kaiti SC',serif",
  'var(--mono)': "ui-monospace,Menlo,monospace",
};

/* 与 templates.js 的 extraCss 一致的版心宽度（单一真源派生） */
const PAD_BY_ID = { narrow: 190, wide: 64 };
const LINEH_BY_ID = { justified: 1.78, wide: 2.05, wenkai: 2.0 };

/** 从一套排印风格派生分页度量参数。 */
export function measureStyle(tpl) {
  const s = tpl.style || {};
  const pad = PAD_BY_ID[tpl.id] ?? 96;
  const bodySize = s.bodySize || 32;
  /* 主题配方自带 lineHeight（1.7–2.1），优先级高于 id 映射表；
     12 套手写模板没写 lineHeight 时回落到 id 映射 / 默认 1.92。 */
  const lineHeight = s.lineHeight || LINEH_BY_ID[tpl.id] || 1.92;
  return {
    bodyFont: FONT_REAL[s.bodyFont] || FONT_REAL['var(--serif)'],
    titleFont: FONT_REAL[s.titleFont] || FONT_REAL['var(--serif)'],
    bodySize,
    lineHeight,
    tracking: s.tracking || '.01em',
    paraGap: 26,
    textWidth: 1080 - pad * 2,
    charsPerRow: Math.max(16, Math.floor((1080 - pad * 2) / (bodySize * 1.05))),
    chromeH: 160,
  };
}

/** 建隐藏度量宿主（放在已经注入了 @font-face 的主文档里）。
 *  extraCss 可选：模板特有的装饰规则（如 ledger 的 `.row{min-height:150px}`）
 *  会影响块高度，必须注入度量宿主，否则装箱会低估高度导致裁切。
 *  ⚠️ 加 `#auto-measure-host` 作用域前缀，避免污染编辑器主文档 UI。 */
export function createMeasureHost(doc, extraCss = '') {
  let host = doc.getElementById('auto-measure-host');
  if (!host) {
    host = doc.createElement('div');
    host.id = 'auto-measure-host';
    host.style.cssText = 'position:fixed;left:-99999px;top:0;width:1080px;'
      + 'visibility:hidden;pointer-events:none;';
    doc.body.appendChild(host);
  }
  /* 模板切换时只换 <style> 内容，不重建宿主（195 套共用同一个宿主）。
     ⚠️ 加作用域前缀，避免模板 CSS 污染编辑器主文档 UI。 */
  let style = host.querySelector('style[data-extra]');
  if (!style) {
    style = doc.createElement('style');
    style.setAttribute('data-extra', '1');
    host.appendChild(style);
  }
  style.textContent = String(extraCss || '').split('}').map((rule) => {
    const i = rule.indexOf('{');
    if (i < 0 || rule.trim().startsWith('@')) return '';
    const sels = rule.slice(0, i).trim().split(',')
      .map((s) => `#auto-measure-host ${s.trim()}`).join(', ');
    return `${sels} {${rule.slice(i + 1)}}`;
  }).join('\n');
  return host;
}

/** 封面目录：只取原文里的 Markdown 标题，没有就不显示。 */
function buildToc(blocks) {
  return blocks.filter((b) => b.type === 'h').map((b) => String(b.text || '')).slice(0, 6);
}

/** 把 paginate() 的页转成 storyPageDoc 的 page 形状。 */
function toRenderPage(pg, ctx) {
  const { title, blocks, total } = ctx;
  if (pg.role === 'cover') {
    const firstPara = blocks.find((b) => b.type === 'p');
    const lead = firstPara ? String(firstPara.text || '').slice(0, 60) : '';
    return {
      role: 'cover', roleCn: '封面', auto: true,
      title, lead: lead ? lead + (String(firstPara.text).length > 60 ? '……' : '') : '',
      toc: buildToc(blocks), total,
    };
  }
  return {
    role: pg.role, roleCn: {
      opening: '开篇', dense: '正文', points: '清单', quote: '金句', closing: '结尾',
    }[pg.role] || '正文',
    auto: true, blocks: pg.blocks, total,
  };
}

/**
 * 任意长文 → 一整套「可渲染页」。
 * @param {string} raw 用户原文
 * @param {object} tpl TEMPLATES 里的一套
 * @param {Document} doc 浏览器文档（传 null 走 Node 字数包络降级）
 * @returns { pages, htmls, report }
 */
export function buildAutoSet(raw, tpl, doc = null) {
  const ms = measureStyle(tpl);
  /* ⚠️ 模板特有 CSS（如 ledger 的 .row{min-height:150px}）会改变块高度，
     必须注入度量宿主，否则装箱低估高度 → 真机裁切（浏览器回归实测 fill=1.063）。 */
  const host = doc ? createMeasureHost(doc, (tpl.style && tpl.style.extraCss) || '') : null;
  const result = paginate(raw, ms, host);

  const blocks = [];
  /* 从 paginate 的结果里取回所有真实块，仅供封面目录/导语使用 */
  for (const pg of result.pages) for (const b of pg.blocks) blocks.push(b);

  const ctx = { title: result.title, blocks, total: result.pages.length };
  const renderPages = result.pages.map((pg) => toRenderPage(pg, ctx));

  const htmls = renderPages.map((page, i) => storyPageDoc({
    pal: tpl.pal, tplId: `${tpl.id}-auto`, pageIndex: i, page,
    motion: !!tpl.motion, style: { ...tpl.style, ...ms },
    total: result.pages.length,
  }));

  return {
    pages: renderPages,
    htmls,
    title: result.title,
    report: {
      totalPages: result.pages.length,
      maxPages: MAX_PAGES,
      totalChars: result.totalChars,
      renderedChars: result.renderedChars,
      truncatedChars: result.truncatedChars,
      missing: result.missing,
      manualBreaks: result.manualBreaks,
      charsPerPage: result.pages.map((p) =>
        p.blocks.reduce((n, b) => n + String(b.text || '').length, 0)),
    },
  };
}

/** 供 UI 显示的自检摘要（正常态静默，异常才提示）。 */
export function selfCheckText(report) {
  if (report.missing) return `⚠️ 有 ${report.missing.length} 字未落版，请检查原文`;
  if (report.truncatedChars > 0)
    return `⚠️ 超过 ${report.maxPages} 页上限，末尾 ${report.truncatedChars} 字未出图（可复制剩余正文另做一套）`;
  if (report.manualBreaks > 0) return `已按 ${report.manualBreaks} 处 --- 强制分页`;
  return '';
}

/** 导出剩余正文（上限截断时用），原样返回不改写。 */
export function remainingText(pages) {
  return pages.filter((p) => p.role !== 'cover')
    .flatMap((p) => p.blocks || []).map((b) => String(b.text || '')).join('\n\n');
}
