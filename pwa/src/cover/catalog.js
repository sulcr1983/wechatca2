/* 封面风格目录（纯数据，构建脚本与前端共用，避免两边清单漂移）。
 *
 * 两层模型（2026-10-29 按 docs/cover-style-spec.md 的「版式 × 色板」落地）：
 *   版式（LAYOUTS）  = 卡片身份，结构不同
 *   色板（members）  = 卡内小圆点，只换颜色
 *
 * ⚠️ 此前是「一色板一卡」：13 张卡里 10 张是同一套 HTML 换了 10 种颜色，
 *    用户看到的其实是 3–5 个样子（详见 output/cover-audit/ 的盘点）。
 *    styleId 一律**不改名**（prefs / 图标 / 测试都在用），只是在其上加了 layout 字段。
 */

export const COVER_SIZES = {
  xhs: { id: 'xhs', label: '3:4 小红书', w: 1080, h: 1440, hint: '1080×1440' },
  square: { id: 'square', label: '1:1 方图', w: 1080, h: 1080, hint: '1080×1080' },
  wide: { id: 'wide', label: '21:9 横版', w: 2100, h: 900, hint: '2100×900' },
};

// 归藏三套：本地版真实基线，支持三种尺寸
export const GUIZANG_STYLES = [
  {
    id: 'editorial', name: 'Editorial 杂志风', group: '归藏', layout: 'magazine',
    desc: '暖纸墨字，衬线标题，适合随笔与长文',
    sizes: ['xhs', 'square', 'wide'], swatch: '#f3f0e8', accent: '#111111',
    thumb: './cover-thumbs/editorial.png',
  },
  {
    id: 'swiss', name: 'Swiss 瑞士风', group: '归藏', layout: 'swiss',
    desc: '白纸极简，无衬线细体大字，适合观点与清单',
    sizes: ['xhs', 'square', 'wide'], swatch: '#fafaf8', accent: '#002FA7',
    thumb: './cover-thumbs/swiss.png',
  },
  {
    /* ROAD-1（2026-10-28）：纯文字大字版。
       专门解决「搜不到合适的图 → 封面就废了」：它**根本不用底图**，
       选了也不铺，所以永远不会图文不符，出图也最快（不用等图片解码）。 */
    id: 'bigtype', name: '大字版', group: '归藏', layout: 'bigtype',
    desc: '纯文字大字，不用底图也好看，适合金句与观点',
    sizes: ['xhs', 'square', 'wide'], swatch: '#fbfaf7', accent: '#ff3b1f',
    thumb: './cover-thumbs/bigtype.png',
  },
];

// 10 套模板（public/cover-templates，AGPL-3.0，见 THIRD_PARTY_NOTICES）：只有 3:4
export const TEMPLATE_STYLES = [
  { id: 'editorial-dune', name: '沙丘暖纸', group: '模板', layout: 'magazine-tpl', paletteName: '沙丘暖纸', sizes: ['xhs'], swatch: '#f0e6d2', accent: '#8f7650', thumb: './cover-thumbs/editorial-dune.png' },
  { id: 'editorial-forest-ink', name: '森林墨绿', group: '模板', layout: 'magazine-tpl', paletteName: '森林墨绿', sizes: ['xhs'], swatch: '#f5f1e8', accent: '#2e6b4f', thumb: './cover-thumbs/editorial-forest-ink.png' },
  { id: 'editorial-indigo-porcelain', name: '靛蓝瓷白', group: '模板', layout: 'magazine-tpl', paletteName: '靛蓝瓷白', sizes: ['xhs'], swatch: '#f2f4f5', accent: '#315d93', thumb: './cover-thumbs/editorial-indigo-porcelain.png' },
  { id: 'editorial-ink-classic', name: '经典墨色', group: '模板', layout: 'magazine-tpl', paletteName: '经典墨色', sizes: ['xhs'], swatch: '#f3f0e8', accent: '#111111', thumb: './cover-thumbs/editorial-ink-classic.png' },
  { id: 'editorial-kraft-paper', name: '牛皮纸', group: '模板', layout: 'magazine-tpl', paletteName: '牛皮纸', sizes: ['xhs'], swatch: '#eedfc7', accent: '#9b5a2e', thumb: './cover-thumbs/editorial-kraft-paper.png' },
  { id: 'editorial-midnight-ink', name: '午夜墨金', group: '模板', layout: 'magazine-tpl', paletteName: '午夜墨金', sizes: ['xhs'], swatch: '#0e0d0c', accent: '#d4a04a', thumb: './cover-thumbs/editorial-midnight-ink.png' },
  { id: 'swiss-ikb', name: '克莱因蓝', group: '模板', layout: 'swiss-tpl', paletteName: '克莱因蓝', sizes: ['xhs'], swatch: '#fafaf8', accent: '#002FA7', thumb: './cover-thumbs/swiss-ikb.png' },
  { id: 'swiss-lemon-green', name: '柠檬绿', group: '模板', layout: 'swiss-tpl', paletteName: '柠檬绿', sizes: ['xhs'], swatch: '#fafaf8', accent: '#C5E803', thumb: './cover-thumbs/swiss-lemon-green.png' },
  { id: 'swiss-lemon-yellow', name: '柠檬黄', group: '模板', layout: 'swiss-tpl', paletteName: '柠檬黄', sizes: ['xhs'], swatch: '#fafaf8', accent: '#FFD500', thumb: './cover-thumbs/swiss-lemon-yellow.png' },
  { id: 'swiss-safety-orange', name: '安全橙', group: '模板', layout: 'swiss-tpl', paletteName: '安全橙', sizes: ['xhs'], swatch: '#fafaf8', accent: '#FF6B35', thumb: './cover-thumbs/swiss-safety-orange.png' },
];

/* 新增 4 个版式（2026-10-29）：从 references/layout-recipes.md 的 28 条配方里
 * 挑使用频率最高的四条先落地 —— 图文封面(M16/S08)、金句(M04)、编号大字、清单(M05)。
 * 每个版式配 3 套色板，卡内可换色；只出 3:4（与 10 套模板一致，先不给方图/横版）。 */
export const LAYOUT_PALETTES = [
  {
    key: 'paper', name: '暖纸', dark: false,
    paper: '#f4efe4', paper2: '#eae2d2', ink: '#1c1a16', muted: '#6f6a5f',
    accent: '#b4552f', accentOn: '#ffffff',
  },
  {
    key: 'ink', name: '墨夜', dark: true,
    paper: '#12110f', paper2: '#1c1a17', ink: '#f0e9db', muted: '#9a917f',
    accent: '#d8a24a', accentOn: '#12110f',
  },
  {
    key: 'bold', name: '亮橙', dark: false,
    paper: '#fff7ee', paper2: '#ffe9d6', ink: '#141110', muted: '#7a6f62',
    accent: '#ff3b1f', accentOn: '#ffffff',
  },
];

const LAYOUT_DEFS = [
  { id: 'image-led', name: '图文封面', note: '标题压在图上，最像小红书爆款' },
  { id: 'quote', name: '金句', note: '居中大字 + 署名，适合观点' },
  { id: 'number', name: '编号大字', note: '超大编号当主视觉，适合「5 个方法」' },
  { id: 'list', name: '清单', note: '编号条目，干货与推荐' },
];

export const LAYOUT_STYLES = LAYOUT_DEFS.flatMap((l) => LAYOUT_PALETTES.map((p) => ({
  id: `${l.id}-${p.key}`,
  name: l.name,
  group: '版式',
  layout: l.id,
  paletteKey: p.key,
  paletteName: p.name,
  desc: l.note,
  sizes: ['xhs'],
  swatch: p.paper,
  accent: p.accent,
  // 渲染用的完整色板（layouts.js 直接消费，不走 CSS 变量继承）
  paper: p.paper, paper2: p.paper2, ink: p.ink, muted: p.muted,
  accentOn: p.accentOn, dark: p.dark,
  thumb: `./cover-thumbs/${l.id}-${p.key}.png`,
})));

export const ALL_STYLES = [...GUIZANG_STYLES, ...TEMPLATE_STYLES, ...LAYOUT_STYLES];

/* ── 卡片分组（版式是卡片身份，色板是卡内色点）──────────────────────────
 * 顺序即展示顺序：把「一眼能看出是小红书」的放前面，工艺类模板放后面。 */
export const LAYOUTS = [
  { id: 'image-led', name: '图文封面', note: '标题压在图上，最像小红书爆款' },
  { id: 'magazine', name: '杂志封面', note: '衬线大标题贴底，纸刊质感' },
  { id: 'quote', name: '金句', note: '居中大字 + 署名，适合观点' },
  { id: 'bigtype', name: '大字版', note: '纯文字，不用底图也成立' },
  { id: 'list', name: '清单', note: '编号条目，干货与推荐' },
  { id: 'number', name: '编号大字', note: '超大编号当主视觉' },
  { id: 'swiss', name: '瑞士封面', note: '白纸细体大字，克制有力' },
  { id: 'magazine-tpl', name: '杂志模板', note: '6 套官方杂志配色' },
  { id: 'swiss-tpl', name: '瑞士模板', note: '4 套强调色，仅 3:4' },
].map((card) => ({
  ...card,
  members: ALL_STYLES.filter((s) => s.layout === card.id).map((s) => s.id),
}));

export function styleById(id) {
  return ALL_STYLES.find((s) => s.id === id) || GUIZANG_STYLES[0];
}

export function layoutById(id) {
  return LAYOUTS.find((l) => l.id === id) || LAYOUTS[0];
}

export function layoutOfStyle(styleId) {
  return layoutById(styleById(styleId).layout);
}

/** 新版式（layout 骨架渲染）的 styleId 判定 —— render.js 用它选渲染管线。 */
export function isLayoutStyle(id) {
  return LAYOUT_STYLES.some((s) => s.id === id);
}
