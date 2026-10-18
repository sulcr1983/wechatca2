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
    desc: '杂志排版，衬线标题，适合随笔与长文',
    sizes: ['xhs', 'square', 'wide'], swatch: '#0d0c0b', accent: '#c4956a',
  },
  {
    id: 'swiss', name: 'Swiss 瑞士风', group: '归藏',
    desc: '瑞士极简，无衬线大字，适合观点与清单',
    sizes: ['xhs', 'square', 'wide'], swatch: '#0a0a0a', accent: '#3b82f6',
  },
];

// 10 套模板（public/cover-templates，AGPL-3.0，见 THIRD_PARTY_NOTICES）：只有 3:4
export const TEMPLATE_STYLES = [
  { id: 'editorial-dune', name: '沙丘暖纸', group: '模板', sizes: ['xhs'], swatch: '#f0e6d2', accent: '#8f7650', thumb: './cover-thumbs/editorial-dune.png' },
  { id: 'editorial-forest-ink', name: '森林墨绿', group: '模板', sizes: ['xhs'], swatch: '#dfe5dc', accent: '#2f4a38', thumb: './cover-thumbs/editorial-forest-ink.png' },
  { id: 'editorial-indigo-porcelain', name: '靛蓝瓷白', group: '模板', sizes: ['xhs'], swatch: '#e9e7e2', accent: '#27346b', thumb: './cover-thumbs/editorial-indigo-porcelain.png' },
  { id: 'editorial-ink-classic', name: '经典墨色', group: '模板', sizes: ['xhs'], swatch: '#efebe4', accent: '#1f1c18', thumb: './cover-thumbs/editorial-ink-classic.png' },
  { id: 'editorial-kraft-paper', name: '牛皮纸', group: '模板', sizes: ['xhs'], swatch: '#d9c6a5', accent: '#7b5b37', thumb: './cover-thumbs/editorial-kraft-paper.png' },
  { id: 'editorial-midnight-ink', name: '午夜墨金', group: '模板', sizes: ['xhs'], swatch: '#0e0d0c', accent: '#d4a04a', thumb: './cover-thumbs/editorial-midnight-ink.png' },
  { id: 'swiss-ikb', name: '克莱因蓝', group: '模板', sizes: ['xhs'], swatch: '#fafaf8', accent: '#002FA7', thumb: './cover-thumbs/swiss-ikb.png' },
  { id: 'swiss-lemon-green', name: '柠檬绿', group: '模板', sizes: ['xhs'], swatch: '#f4f6ef', accent: '#5a7d2a', thumb: './cover-thumbs/swiss-lemon-green.png' },
  { id: 'swiss-lemon-yellow', name: '柠檬黄', group: '模板', sizes: ['xhs'], swatch: '#fbf9ef', accent: '#c9a227', thumb: './cover-thumbs/swiss-lemon-yellow.png' },
  { id: 'swiss-safety-orange', name: '安全橙', group: '模板', sizes: ['xhs'], swatch: '#f7f4ef', accent: '#d94f1e', thumb: './cover-thumbs/swiss-safety-orange.png' },
];

export const ALL_STYLES = [...GUIZANG_STYLES, ...TEMPLATE_STYLES];

export function styleById(id) {
  return ALL_STYLES.find((s) => s.id === id) || GUIZANG_STYLES[0];
}
