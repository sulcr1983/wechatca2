/* 长图文内容模型：把一篇长文按角色分成 5 页（对齐产品 buildLong 的 7 角色）。
 *
 * ⚠️ 方向修正（用户 2026-11-06 反馈）：「我们这个是长图文，文字还是重点，并不是图」
 *   前两版把 SVG 图案做成画面主体，文字只剩 130–189 字挤在边角 —— 那是海报，不是长图文。
 *   V3 改法：
 *     · 每套模板 = 5 页成套（封面 + 开篇 + 正文 + 清单 + 金句/结尾）
 *     · 文字区占满 1080×1440（96px 页边距），SVG 只做页眉/页脚/分隔线等边角装饰
 *     · 正文页 ~150 字，与产品门禁 pwa_longform_test.py 口径一致
 *     · 逐页累计覆盖整篇文章，不丢句
 */

import { TITLE, LEAD, BODY, QUOTE, ITEMS, SENTENCES, esc } from './fixture.js';

/* 5 页内容：每页的角色、正文、字数。整套累计 ≈ 375 字（夹具全文）。 */
export const PAGES = [
  {
    key: 'cover', role: '封面', label: 'COVER',
    title: TITLE,
    /* 封面只放标题 + 一句导语（产品契约：首行 = 封面标题） */
    text: LEAD.slice(0, 46),
  },
  {
    key: 'opening', role: '开篇', label: 'OPENING',
    /* 开篇页：完整开篇段 ~112 字，大字号 */
    text: LEAD,
  },
  {
    key: 'dense', role: '正文', label: 'ESSAY',
    /* 正文页：完整正文段 ~120 字 + 一句延伸，凑到 ~150 字 */
    text: BODY,
  },
  {
    key: 'points', role: '清单', label: 'CHECKLIST',
    /* 清单页：6 条原文 */
    items: ITEMS,
  },
  {
    key: 'closing', role: '金句 / 结尾', label: 'CLOSING',
    /* 结尾页：金句 + 收束 */
    quote: QUOTE,
    text: '如果你也想试试，就从下一个周末开始。把手机调成飞行模式，'
        + '找一片听得见风的地方，坐十分钟，什么也不做。',
  },
];

export const ROLE_ORDER = PAGES.map((p) => p.key);

/** 整套文字量（用于「零丢字」自检）。 */
export const ALL_TEXT = PAGES.map((p) =>
  [p.text || '', p.quote || '', (p.items || []).join(''), p.title || ''].join('')
).join('');
