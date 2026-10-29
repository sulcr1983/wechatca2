/* 整套图文（2026-10-30）—— 一次出「封面 + 内页多张」。
 *
 * 为什么做这个：
 *   用户反馈「记得之前有标题和正文一起的功能，现在只剩标题了」。
 *   查了代码，本项目**从来没有**实现过（docs/design-cover-gallery.md 里
 *   画过「内页类（7）」的饼，但一直没落地）。
 *   查了竞品（红墨 / 创客贴 / 火兔工具箱 / A9）—— 行业标准就是
 *   「输入主题 → 封面 + 3~6 张内页，一次出齐，整套风格统一」，
 *   单独出一张封面反而是少数派。
 *
 * 设计原则（照着竞品的共识来，不自己发明）：
 *   1. **复用现有版式骨架**，不新写一套排版 —— 封面用用户选的版式，
 *      内页用已有的 list / number / quote 骨架，视觉天然一致
 *   2. **内容从正文自动拆页**，不要求用户手工分页（竞品都是自动的）
 *   3. **一套图共用同一色板与底图**，风格不会撞
 *   4. 一次只出 3:4（小红书标准），不做多尺寸（那会让页数翻倍、用户懵）
 *
 * 与既有代码的边界：
 *   - 渲染全部走 render.js 的 buildCoverHtml（同一套字体/fitty/截图管线）
 *   - 不碰单张封面逻辑；单张仍走原来的 generate()
 */

import { buildCoverHtml } from './render.js';

const MAX_PAGES = 6;       // 封面 + 最多 5 张内页（小红书单篇上限 18 张，6 张足够）
const PAGE_STYLES = ['list', 'number', 'quote'];  // 内页轮换用的骨架（都是纯色排版）

/* ── 正文拆页 ─────────────────────────────────────────────────────── */

/**
 * 把正文拆成若干「内页」。
 *
 * 拆法按内容形态走（不是按字数硬切）：
 *   · 有「1. 2. 3.」或「- 」列表 → 每 3 条一页，用清单骨架
 *   · 有多个自然段 → 每段一页，用金句/编号骨架
 *   · 都没有 → 按句子数均分成 2 页
 *
 * ⚠️ 2026-10-30 实测踩到：正文里既有引语又有列表时，
 *    extractStory 的 lead 会把列表项也吸进去（「海浪。 · 1. 早点睡」）。
 *    所以这里返回 `leadUsed` —— 告诉调用方「引语该用哪一段」，
 *    避免封面副标混进列表。见 pickCoverLead()。
 *
 * @param {string} body 正文（不含标题）
 * @returns {{pages: Array<{heading, items, lead}>, listStart: number}}
 */
export function splitIntoPages(body) {
  const raw = String(body || '').trim();
  if (!raw) return { pages: [], listStart: -1 };

  /* 列表形态：抓到「1. / 2. / - 」这类条目。
     ⚠️ 一条一条保留完整句子，不要按字数切 —— 实测「早点睡，别熬到两点」
        被逗号切成两条，内页上变成「早点睡」「别熬到两点」两个独立条目，
        读起来像两句无关的话。 */
  const listLines = raw.split(/\r?\n/)
    .map((l) => l.trim())
    .filter((l) => /^(\d+[.、)]|[-*•·])\s*/.test(l))
    .map((l) => l.replace(/^(\d+[.、)]|[-*•·])\s*/, '').trim())
    .filter((l) => l.length >= 1);

  if (listLines.length >= 3) {
    const pages = [];
    for (let i = 0; i < listLines.length && pages.length < MAX_PAGES - 1; i += 3) {
      const chunk = listLines.slice(i, i + 3);
      pages.push({
        heading: chunk[0].slice(0, 18),   // 用第一条当页标题（竞品也是这么抓的）
        items: chunk,
        lead: '',
      });
    }
    // 列表第一行在正文里的位置（用于切掉引语里的列表部分）
    const firstListLine = raw.split(/\r?\n/).findIndex((l) =>
      /^(\d+[.、)]|[-*•·])\s*/.test(l.trim()));
    return { pages, listStart: firstListLine };
  }

  // ② 段落形态：每个自然段一页
  const paras = raw.split(/\n{2,}/).map((p) => p.trim()).filter((p) => p.length >= 8);
  if (paras.length >= 2) {
    return {
      pages: paras.slice(0, MAX_PAGES - 1).map((p) => {
        const first = p.split(/[。！？.!?]/)[0] || p.slice(0, 18);
        return { heading: first.slice(0, 20), items: [], lead: p.slice(0, 140) };
      }),
      listStart: -1,
    };
  }

  // ③ 一整段长文：按句号均分
  const sents = raw.split(/(?<=[。！？.!?])/).map((s) => s.trim()).filter((s) => s.length >= 6);
  if (sents.length >= 4) {
    const per = Math.ceil(sents.length / 2);
    const pages = [];
    for (let i = 0; i < sents.length && pages.length < 2; i += per) {
      const chunk = sents.slice(i, i + per);
      pages.push({
        heading: (chunk[0] || '').slice(0, 20),
        items: [],
        lead: chunk.join('').slice(0, 200),
      });
    }
    return { pages, listStart: -1 };
  }

  return { pages: [], listStart: -1 };
}

/**
 * 挑封面该用的引语。
 *
 * 问题（2026-10-30 实测）：正文里既有引语又有列表时，
 * `extractStory` 的 lead 会一路吸到列表项 → 封面副标变成
 * 「两天的沉默之后，我重新听见了海浪。 · 1. 早点睡，别熬到两点」。
 *
 * 修法：只取**列表开始之前**的非空行作引语；没有列表就取前两行。
 */
export function pickCoverLead(body, fallbackLead = '') {
  const lines = String(body || '').split(/\r?\n/);
  const listIdx = lines.findIndex((l) => /^(\d+[.、)]|[-*•·])\s*/.test(l.trim()));
  const scope = listIdx >= 0 ? lines.slice(0, listIdx) : lines;
  const lead = scope.map((l) => l.trim())
    .filter(Boolean)
    .map((l) => l.replace(/^[-*•>\s]+/, '').trim())
    .filter(Boolean)
    .join(' · ')
    .slice(0, 96);
  return lead || fallbackLead;
}

/* ── 整套生成 ─────────────────────────────────────────────────────── */

/**
 * 生成整套图文：1 张封面 + N 张内页。
 *
 * @param {object} opts
 * @param {string} opts.style      封面的 styleId（用户当前选的）
 * @param {string} opts.title      标题
 * @param {string} opts.lead       引语（封面副标）
 * @param {string} opts.body       正文（用于拆内页）
 * @param {string} opts.author     署名
 * @param {string} opts.image      底图 data URL（整套共用）
 * @param {object} opts.analysis   底图分析结果（封面用）
 * @param {string} opts.font       字体
 * @param {string} opts.textMode   文字玩法
 * @param {function} opts.render   (opts) => Promise<{blob}> 注入以便测试替换
 * @returns {Promise<Array<{role, index, label, blob, width, height}>>}
 */
export async function buildStorySet(opts) {
  const {
    style, title, lead = '', body = '', author = '', image = '',
    analysis = null, font = 'auto', textMode = 'stack',
    render = renderOne,
  } = opts;

  const { pages } = splitIntoPages(body);
  const results = [];

  /* 封面引语：只取「列表开始之前」的内容。
     直接传 lead 会把列表项吸进来（实测封面副标变成
     「…听见了海浪。 · 1. 早点睡，别熬到两点」）。 */
  const coverLead = pickCoverLead(body, lead);

  // ① 封面：用用户当前选的版式 + 底图 + 署名（跟单张封面完全一致）
  const cover = await render({
    style, size: 'xhs', title, lead: coverLead, author, image,
    analysis, font, textMode, textPos: 'auto', frosted: false,
  });
  results.push({ role: 'cover', index: 0, label: '封面', ...cover });

  // ② 内页：轮换已有骨架，共用同一色板（色板从封面 styleId 推导）
  for (let i = 0; i < pages.length; i++) {
    const p = pages[i];
    const skeleton = PAGE_STYLES[i % PAGE_STYLES.length];
    // 用该骨架的基础色（paper = 纸底墨字，与封面同族）
    const innerStyle = `${skeleton}-paper`;
    /* ⚠️ 清单骨架靠 layouts.js 的 splitItems 拆条目，它的分隔符里包含「，」——
       实测「早点睡，别熬到两点」被切成「早点睡」「别熬到两点」两个独立条目，
       读起来像两句无关的话。
       修法：这里只用「·」连接（splitItems 认它），并先把条目内的「，」换成空格，
       保证一条就是一条。 */
    const itemText = p.items.length
      ? p.items.map((s) => s.replace(/[，,；;、／/｜|]/g, ' ').trim()).join(' · ')
      : p.lead;
    const inner = await render({
      style: innerStyle,
      size: 'xhs',
      title: p.heading || `第 ${i + 1} 页`,
      lead: itemText,
      author,
      image: '',            // 内页不铺底图：竞品的内页都是纯色排版，铺图反而乱
      analysis: null,
      font,
      textMode,
      textPos: 'auto',
      frosted: false,
    });
    results.push({
      role: 'inner', index: i + 1, label: `内页 ${i + 1}`,
      styleId: innerStyle, ...inner,
    });
  }
  return results;
}

/** 默认渲染实现：走 render.js 的真实管线。 */
async function renderOne(o) {
  // 动态 import 避免顶层循环依赖
  const { renderCoverBlob } = await import('./render.js');
  return renderCoverBlob(o);
}

export const STORY_MAX_PAGES = MAX_PAGES;
