/* 封面风格目录（纯数据，构建脚本与前端共用，避免两边清单漂移）。 */

export const COVER_SIZES = {
  xhs: { id: 'xhs', label: '3:4 小红书', w: 1080, h: 1440, hint: '1080×1440' },
  square: { id: 'square', label: '1:1 方图', w: 1080, h: 1080, hint: '1080×1080' },
  wide: { id: 'wide', label: '21:9 横版', w: 2100, h: 900, hint: '2100×900' },
};

// 归藏两套：本地版真实基线，支持三种尺寸
export const GUIZANG_STYLES = [
  {
    id: 'editorial', name: 'Editorial 杂志风', group: '归藏',
    desc: '暖纸墨字，衬线标题，适合随笔与长文',
    sizes: ['xhs', 'square', 'wide'], swatch: '#f3f0e8', accent: '#111111',
    thumb: './cover-thumbs/editorial.png',
  },
  {
    id: 'swiss', name: 'Swiss 瑞士风', group: '归藏',
    desc: '白纸极简，无衬线细体大字，适合观点与清单',
    sizes: ['xhs', 'square', 'wide'], swatch: '#fafaf8', accent: '#002FA7',
    thumb: './cover-thumbs/swiss.png',
  },
  {
    /* ROAD-1（2026-10-28）：纯文字大字版。
       专门解决「搜不到合适的图 → 封面就废了」：它**根本不用底图**，
       选了也不铺，所以永远不会图文不符，出图也最快（不用等图片解码）。 */
    id: 'bigtype', name: '大字版', group: '归藏',
    desc: '纯文字大字，不用底图也好看，适合金句与观点',
    sizes: ['xhs', 'square', 'wide'], swatch: '#fbfaf7', accent: '#ff3b1f',
    thumb: './cover-thumbs/bigtype.png',
  },
];

// 10 套模板（public/cover-templates，AGPL-3.0，见 THIRD_PARTY_NOTICES）：只有 3:4
export const TEMPLATE_STYLES = [
  { id: 'editorial-dune', name: '沙丘暖纸', group: '模板', sizes: ['xhs'], swatch: '#f0e6d2', accent: '#8f7650', thumb: './cover-thumbs/editorial-dune.png' },
  { id: 'editorial-forest-ink', name: '森林墨绿', group: '模板', sizes: ['xhs'], swatch: '#f5f1e8', accent: '#2e6b4f', thumb: './cover-thumbs/editorial-forest-ink.png' },
  { id: 'editorial-indigo-porcelain', name: '靛蓝瓷白', group: '模板', sizes: ['xhs'], swatch: '#f2f4f5', accent: '#315d93', thumb: './cover-thumbs/editorial-indigo-porcelain.png' },
  { id: 'editorial-ink-classic', name: '经典墨色', group: '模板', sizes: ['xhs'], swatch: '#f3f0e8', accent: '#111111', thumb: './cover-thumbs/editorial-ink-classic.png' },
  { id: 'editorial-kraft-paper', name: '牛皮纸', group: '模板', sizes: ['xhs'], swatch: '#eedfc7', accent: '#9b5a2e', thumb: './cover-thumbs/editorial-kraft-paper.png' },
  { id: 'editorial-midnight-ink', name: '午夜墨金', group: '模板', sizes: ['xhs'], swatch: '#0e0d0c', accent: '#d4a04a', thumb: './cover-thumbs/editorial-midnight-ink.png' },
  { id: 'swiss-ikb', name: '克莱因蓝', group: '模板', sizes: ['xhs'], swatch: '#fafaf8', accent: '#002FA7', thumb: './cover-thumbs/swiss-ikb.png' },
  { id: 'swiss-lemon-green', name: '柠檬绿', group: '模板', sizes: ['xhs'], swatch: '#fafaf8', accent: '#C5E803', thumb: './cover-thumbs/swiss-lemon-green.png' },
  { id: 'swiss-lemon-yellow', name: '柠檬黄', group: '模板', sizes: ['xhs'], swatch: '#fafaf8', accent: '#FFD500', thumb: './cover-thumbs/swiss-lemon-yellow.png' },
  { id: 'swiss-safety-orange', name: '安全橙', group: '模板', sizes: ['xhs'], swatch: '#fafaf8', accent: '#FF6B35', thumb: './cover-thumbs/swiss-safety-orange.png' },
];

export const ALL_STYLES = [...GUIZANG_STYLES, ...TEMPLATE_STYLES];

export function styleById(id) {
  return ALL_STYLES.find((s) => s.id === id) || GUIZANG_STYLES[0];
}
