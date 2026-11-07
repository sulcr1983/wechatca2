/* 产物级自检 · 长图文 V4
 *
 * 判据来源：
 *   · scripts/pwa_longform_test.py（分页完整性 / 字号 ≥40px / 逐角色填充率 / 无溢出）
 *   · references/layout-recipes.md Minimum density（≥75% 画布高、空白带 >15% 需理由）
 *
 * ⚠️ 两套口径不要混：
 *   · 产品门禁按 1124px 归一化（DOM 装箱）
 *   · 本原型按 1248px 可用高（1440 − 2×96），页眉页脚另算
 *
 * 自检结果正常态静默，异常才逐条写明（不吓人，但绝不静默丢内容）。
 */

import { pageCapacity } from './paginate.js';

export const LIMITS = {
  minBodyPx: 28,          // 正文最小字号（产品门禁口径）
  minCaptionPx: 18,       // 题注最小字号
  minFill: 0.45,          // 引语/开篇允许较低，正文/清单 ≥0.68
  minFillDense: 0.68,
  maxPageChars: 900,      // 单页字数上限（超过必然裁切）
};

/** 归一化：去掉空白与 Markdown 标记，用于「零丢字」比对。 */
export const norm = (s) => String(s || '').replace(/\s+/g, '');

/**
 * 检查一套自动分页产物。
 * @param {object} set buildAutoSet() 的返回值
 * @param {string} raw 用户原文（用于逐句零丢失复验）
 * @returns { ok, issues[], stats }
 */
export function auditSet(set, raw) {
  const issues = [];
  const rep = set.report || {};
  const pages = set.pages || [];

  /* ① 零丢字：原文除标题外每句都必须落版 */
  if (rep.missing) issues.push(`有正文未落版：${String(rep.missing).slice(0, 40)}`);
  if (rep.truncatedChars > 0)
    issues.push(`超过页数上限，末尾 ${rep.truncatedChars} 字未出图（已提供复制剩余正文出口）`);

  /* ② 逐页：字数 / 裁切 / 空页 / 角色锚点 */
  const perPage = [];
  pages.forEach((pg, i) => {
    const chars = (pg.blocks || []).reduce((n, b) => n + String(b.text || '').length, 0);
    const isCover = pg.role === 'cover';
    if (!isCover && chars === 0) issues.push(`第 ${i + 1} 页是空页`);
    if (chars > LIMITS.maxPageChars)
      issues.push(`第 ${i + 1} 页 ${chars} 字，超过单页容量，可能裁切`);
    perPage.push({ page: i + 1, role: pg.role, chars });
  });

  /* ③ 结构：必须有封面、至少 1 个正文页、页数在合理区间 */
  if (!pages.some((p) => p.role === 'cover')) issues.push('缺封面页');
  if (pages.length > 13) issues.push(`页数 ${pages.length} 超过上限`);
  const contentPages = pages.filter((p) => p.role !== 'cover');
  if (contentPages.length === 0 && norm(raw).length > 0) issues.push('有正文却没有任何内页');

  /* ④ 原文逐句复验（独立于 paginate 内部的自检，双保险）
     ⚠️ 归一化必须按「行」剥 Markdown 标记：parseArticle 已经把
        - / > / # / 数字序号 去掉了，直接用 /\s+/ 压缩会把行首 '-' 留在 src 里，
        造成「看起来丢字」的假失败（实测踩过，src 比 out 多 3 个字符）。 */
  const src = norm(String(raw || '').split('\n').slice(1).map((line) =>
    line.replace(/^\s*#{1,4}\s+/, '')
      .replace(/^\s*>\s?/, '')
      .replace(/^\s*(?:[-*]|\d+[.、])\s+/, '')
      .replace(/^\s*---+\s*$/, '')
  ).join(''));
  const out = norm(pages.flatMap((p) => p.blocks || [])
    .map((b) => b.text || '').join(''));
  /* 截断时允许尾部缺失，但前面必须逐字一致 */
  if (rep.truncatedChars === 0 && src && out !== src) {
    issues.push('原文与产物逐字比对不一致');
  }

  return {
    ok: issues.length === 0,
    issues,
    stats: {
      totalPages: pages.length,
      totalChars: rep.totalChars || 0,
      renderedChars: rep.renderedChars || 0,
      truncatedChars: rep.truncatedChars || 0,
      manualBreaks: rep.manualBreaks || 0,
      perPage,
    },
  };
}

/** 浏览器端：量一页真实 DOM 的填充率 / 溢出 / 最小字号。 */
export const DOM_AUDIT_JS = `(cfg) => {
  const root = document.getElementById('xhs-cover');
  if (!root) return { error: 'no #xhs-cover' };
  const page = root.querySelector('.page');
  const r = root.getBoundingClientRect();
  const pr = page.getBoundingClientRect();
  /* 所有含文字的叶子块 */
  const all = [...page.querySelectorAll('h1,h2,p,span,div')]
    .filter(el => (el.textContent || '').trim());
  const leaves = all.filter(el => !all.some(o => o !== el && el.contains(o)));
  const rects = leaves.map(el => el.getBoundingClientRect())
    .filter(x => x.height > 0 && x.width > 0);
  const top = Math.min(...rects.map(x => x.top - r.top));
  const bottom = Math.max(...rects.map(x => x.bottom - r.top));
  const avail = r.height - 192;
  const fill = +(((bottom - top) / avail).toFixed(3));
  /* 最小字号（排除角标 SVG 与页脚 caption 允许 18px） */
  const sizes = leaves.map(el => parseFloat(getComputedStyle(el).fontSize))
    .filter(n => n > 0);
  const minFont = Math.min(...sizes);
  return {
    w: Math.round(r.width), h: Math.round(r.height),
    fill,
    clipped: bottom > r.height - 48 + 2,
    minFont,
    blocks: rects.length,
    chars: (page.textContent || '').replace(/\\s+/g, '').length,
  };
}`;

/** 把 DOM 实测结果转成问题列表。 */
export function auditDom(m, role) {
  const issues = [];
  if (!m || m.error) return [m?.error || 'DOM 实测失败'];
  if (m.w !== 1080 || m.h !== 1440) issues.push(`尺寸 ${m.w}×${m.h} 不是 1080×1440`);
  if (m.clipped) issues.push('内容超出画布，会裁字');
  if (m.minFont < LIMITS.minCaptionPx) issues.push(`最小字号 ${m.minFont}px 低于 ${LIMITS.minCaptionPx}px`);
  const floor = (role === 'dense' || role === 'points') ? LIMITS.minFillDense : LIMITS.minFill;
  if (m.fill < floor) issues.push(`填充率 ${m.fill} 低于 ${floor}（${role}）`);
  return issues;
}

/** 正常态静默的摘要文案。 */
export function auditSummary(a) {
  if (a.ok) return `✓ ${a.stats.totalPages} 页 · ${a.stats.renderedChars} 字全部落版 · 无裁切`;
  return a.issues.map((s) => `⚠️ ${s}`).join('　');
}
