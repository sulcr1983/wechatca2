/* 封面风格目录（纯数据，构建脚本与前端共用，避免两边清单漂移）。
 *
 * 两层模型（2026-10-29 按 docs/xhs/cover-style-spec.md 的「版式 × 色板」落地）：
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
  { id: 'editorial-dune', name: '沙丘暖纸', group: '模板', layout: 'magazine-tpl', paletteName: '沙丘暖纸', sizes: ['xhs'], swatch: '#f0e6d2', accent: '#8f7650', paper: '#f0e6d2', ink: '#1f1a14', muted: '#6f6557', thumb: './cover-thumbs/editorial-dune.png' },
  { id: 'editorial-forest-ink', name: '森林墨绿', group: '模板', layout: 'magazine-tpl', paletteName: '森林墨绿', sizes: ['xhs'], swatch: '#f5f1e8', accent: '#2e6b4f', paper: '#f5f1e8', ink: '#16251b', muted: '#5d665d', thumb: './cover-thumbs/editorial-forest-ink.png' },
  { id: 'editorial-indigo-porcelain', name: '靛蓝瓷白', group: '模板', layout: 'magazine-tpl', paletteName: '靛蓝瓷白', sizes: ['xhs'], swatch: '#f2f4f5', accent: '#315d93', paper: '#f2f4f5', ink: '#0a1f3d', muted: '#5f6d78', thumb: './cover-thumbs/editorial-indigo-porcelain.png' },
  { id: 'editorial-ink-classic', name: '经典墨色', group: '模板', layout: 'magazine-tpl', paletteName: '经典墨色', sizes: ['xhs'], swatch: '#f3f0e8', accent: '#111111', paper: '#f3f0e8', ink: '#0a0a0b', muted: '#68625a', thumb: './cover-thumbs/editorial-ink-classic.png' },
  { id: 'editorial-kraft-paper', name: '牛皮纸', group: '模板', layout: 'magazine-tpl', paletteName: '牛皮纸', sizes: ['xhs'], swatch: '#eedfc7', accent: '#9b5a2e', paper: '#eedfc7', ink: '#2a1e13', muted: '#755f49', thumb: './cover-thumbs/editorial-kraft-paper.png' },
  { id: 'editorial-midnight-ink', name: '午夜墨金', group: '模板', layout: 'magazine-tpl', paletteName: '午夜墨金', sizes: ['xhs'], swatch: '#0e0d0c', accent: '#d4a04a', paper: '#0e0d0c', ink: '#ece2cf', muted: '#9a8c75', dark: true, thumb: './cover-thumbs/editorial-midnight-ink.png' },
  { id: 'swiss-ikb', name: '克莱因蓝', group: '模板', layout: 'swiss-tpl', paletteName: '克莱因蓝', sizes: ['xhs'], swatch: '#fafaf8', accent: '#002FA7', paper: '#fafaf8', ink: '#0a0a0a', muted: '#6b6b66', thumb: './cover-thumbs/swiss-ikb.png' },
  { id: 'swiss-lemon-green', name: '柠檬绿', group: '模板', layout: 'swiss-tpl', paletteName: '柠檬绿', sizes: ['xhs'], swatch: '#fafaf8', accent: '#C5E803', paper: '#fafaf8', ink: '#0a0a0a', muted: '#6b6b66', thumb: './cover-thumbs/swiss-lemon-green.png' },
  { id: 'swiss-lemon-yellow', name: '柠檬黄', group: '模板', layout: 'swiss-tpl', paletteName: '柠檬黄', sizes: ['xhs'], swatch: '#fafaf8', accent: '#FFD500', paper: '#fafaf8', ink: '#0a0a0a', muted: '#6b6b66', thumb: './cover-thumbs/swiss-lemon-yellow.png' },
  { id: 'swiss-safety-orange', name: '安全橙', group: '模板', layout: 'swiss-tpl', paletteName: '安全橙', sizes: ['xhs'], swatch: '#fafaf8', accent: '#FF6B35', paper: '#fafaf8', ink: '#0a0a0a', muted: '#6b6b66', thumb: './cover-thumbs/swiss-safety-orange.png' },
];

/* 新增 5 个版式（2026-10-29 四个 + 2026-11-06 九宫格）：从 references/layout-recipes.md 的 28 条配方里
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

/* 刺激风专属高饱和色板（2026-11-06）：只给 LAYOUT_DEFS 里 bold:true 的版式用。
   编辑设计风仍是上面 3 套（暖纸/墨夜/亮橙）——两类风格的设计语言不同，
   混用会让「克制」的版式被迫用荧光色。 */
export const BOLD_PALETTES = [
  {
    key: 'electric', name: '电光蓝', dark: false,
    paper: '#1E3AFF', paper2: '#1730D6', ink: '#FFFFFF', muted: '#C7D2FF',
    accent: '#1E3AFF', accentOn: '#FFFFFF',
  },
  {
    key: 'neon', name: '荧光绿', dark: false,
    paper: '#C8FF2E', paper2: '#B4E826', ink: '#0B1400', muted: '#3D5200',
    accent: '#B4E826', accentOn: '#0B1400',
  },
  {
    key: 'magenta', name: '品红', dark: false,
    paper: '#FF1F8F', paper2: '#E0167C', ink: '#FFFFFF', muted: '#FFD1E8',
    accent: '#FF1F8F', accentOn: '#FFFFFF',
  },
  {
    key: 'lemon', name: '柠檬黄', dark: false,
    paper: '#FFD60A', paper2: '#F0C800', ink: '#141100', muted: '#5C4E00',
    accent: '#F0C800', accentOn: '#141100',
  },
  {
    key: 'rose', name: '玫红', dark: true,
    paper: '#12060C', paper2: '#1E0A14', ink: '#FFE3F0', muted: '#C98FAE',
    accent: '#FF2E63', accentOn: '#FFFFFF',
  },
];

const LAYOUT_DEFS = [
  { id: 'image-led', name: '图文封面', note: '标题压在图上，最像小红书爆款' },
  { id: 'quote', name: '金句', note: '居中大字 + 署名，适合观点' },
  { id: 'number', name: '编号大字', note: '超大编号当主视觉，适合「5 个方法」' },
  { id: 'nine', name: '九宫格', note: '3×3 网格，切成九张每张都有内容' },
  { id: 'list', name: '清单', note: '编号条目，干货与推荐' },
  /* 2026-11-06：配方 23 套全部接入（用户拍板「其它模板都按新的改」）。
     每条都是独立版面结构，不是换配色。id 与 layout-registry / layout-recipes 一一对应。 */
  { id: 'field-note', name: '纪实照片', note: '大图 + 底部说明带 + 一句要点' },
  { id: 'essay-split', name: '左右分栏', note: '左大标题，右 2–3 段，中间细线' },
  { id: 'evidence-wall', name: '证据墙', note: '2×2 图墙 + 一句判读' },
  { id: 'feature', name: '实证特写', note: '大图占一半 + 底部 3 条要点' },
  { id: 'atmos-thesis', name: '氛围论点', note: '墨流底 + 一句大论点' },
  { id: 'marginalia', name: '页边批注', note: '主栏正文 + 窄边栏关键词' },
  { id: 'matrix', name: '主数字矩阵', note: '8 格矩阵 + 底部一个主数字' },
  { id: 'closing-note', name: '收尾寄语', note: '大标题 + 4 条账本 + 收尾句' },
  { id: 'tall-ledger', name: '长账本', note: '左编号右标题的 4–6 条清单' },
  { id: 'section-divider', name: '章节分隔', note: 'Act II + 3–6 字大标题' },
  { id: 'hero-question', name: '大问句', note: '三行问句占满整页' },
  { id: 'pipeline', name: '竖排流程', note: '3–4 步竖排，每步一行说明' },
  { id: 'before-after', name: '前后对比', note: '上下两块：旧做法 vs 新做法' },
  { id: 'two-signals', name: '双信号', note: '两个大块，一实一虚做对比' },
  { id: 'data-layer', name: '数据层', note: '对象块 + 3 条属性，强 mono' },
  { id: 'image-hero', name: '图像主角', note: '图铺满 + 覆盖块标题 + 3 个数字' },
  { id: 'takeaway', name: '要点账本', note: '大标题 + 3 行要点，深底收尾' },
  { id: 'warning', name: '警示清单', note: '3 条「不要这样做」，左侧色条' },
  { id: 'kpi-tower', name: '数字塔', note: '4 组数字 + 高低柱，数据感' },
  { id: 'browser-mock', name: '浏览器框', note: '把内容装进一个网页窗口里' },
  { id: 'pipeline-arch', name: '流程架构', note: '三段式：输入 / 生成 / 分享' },
  { id: 'h-bar', name: '横条排行', note: '5–6 行横条比大小，适合 Top N' },
  { id: 'stacked-ledger', name: '堆叠账本', note: '大数字 + 标签的 4 行账本' },
  /* 2026-11-06「刺激风」8 套：高饱和撞色 / 超大字号 / 贴纸感。
     用户原话「往更刺激的小红书风格走，模板多一些，人会腻」。 */
  { id: 'bold-banner', name: '撞色横幅', note: '整版高饱和底 + 反白超大标题 + 贴纸条', bold: true },
  { id: 'neon-glow', name: '霓虹发光', note: '近黑底 + 荧光标题 + 发光描边', bold: true },
  { id: 'sticker-box', name: '贴纸框', note: '白底黑粗框 + 硬阴影 + 内嵌反白色块', bold: true },
  { id: 'split-clash', name: '分屏撞色', note: '上下两块高饱和对撞', bold: true },
  { id: 'mega-number', name: '数字轰炸', note: '巨大数字压背景 + 反白标题', bold: true },
  { id: 'highlighter', name: '荧光笔', note: '纸底 + 荧光高亮 + 手写标记感', bold: true },
  { id: 'vertical-impact', name: '竖排冲击', note: '中式竖排标题 + 底部撞色条', bold: true },
  { id: 'half-clash', name: '半版撞色', note: '一半实色一半纸白，标题跨栏', bold: true },
  /* 2026-11-06 第二批刺激风 12 套：每套独立版面结构，盖住配色后不能用一句话互相描述。 */
  { id: 'diagonal', name: '斜切撞色', note: '对角线切开，两半撞色', bold: true },
  { id: 'card-stack', name: '卡片叠层', note: '三张卡片错位堆叠，贴纸感', bold: true },
  { id: 'bands', name: '大色块分割', note: '上下两大条 + 中间撞色细缝', bold: true },
  { id: 'ring-focus', name: '圆环聚焦', note: '大色圈 + 居中大字', bold: true },
  { id: 'tag-flow', name: '标签流水', note: '一排彩色标签 + 大标题 + 底部色条', bold: true },
  { id: 'frame-hit', name: '双框冲击', note: '内描边双框 + 反白大字', bold: true },
  { id: 'corner-num', name: '角标数字', note: '右上角巨大编号 + 左下标题', bold: true },
  { id: 'three-grid', name: '三栏色块', note: '三等分色块，每块一条要点', bold: true },
  { id: 'mega-char', name: '单字巨压', note: '单字超巨背景 + 小标题', bold: true },
  { id: 'sticky-notes', name: '便签拼贴', note: '多张便签错落，手账感', bold: true },
  { id: 'marquee', name: '跑马灯', note: '上下两条文字带 + 中间大标题', bold: true },
  { id: 'tilt-block', name: '倾斜色块', note: '斜置色块压住大标题', bold: true },
  /* 2026-11-06 结构型 3 套（用户拍板方向 D）：换的是「文字与图的空间关系」，
     不是再挪一个色块。现有 50 套实测 float/column-count 使用次数为 0，
     这三套补上真杂志的排版语法。用编辑设计风色板（不加 bold）。 */
  { id: 'text-wrap', name: '图文互嵌', note: '文字真的绕着图片流，图片下方恢复全宽' },
  { id: 'multi-column', name: '多栏正文', note: '标题跨栏，正文分 3 栏流动，首字下沉' },
  { id: 'bleed-overlap', name: '出血压边', note: '大图出血到版心外，标题压在交界' },
  /* 2026-11-06 第二批结构型 3 套：语法在现有 53 套里使用次数都为 0，
     且都过了导出 PNG 对照实验（见 v3-structural.js 各自的注释）。 */
  { id: 'gradient-title', name: '光谱渐变字', note: '标题上渐变，色相从 accent 过渡到墨色' },
  { id: 'span-column', name: '栏间通栏', note: '正文分栏流动，刊头横跨所有栏' },
  { id: 'outline-type', name: '描边大字', note: '空心描边标题 + 实心反白引语条' },
  /* 2026-11-06 第三批结构型 3 套：语法在现有 56 套里使用次数都是 0，
     且都过了导出 PNG 对照实验（blend-mode / grid-areas / mask-fade 均 KEPT）。 */
  { id: 'blend-overlay', name: '混色叠加', note: '标题与斜切色块反相混合，出对比色' },
  { id: 'named-grid', name: '命名栅格', note: '非对称撒点，重心偏右上' },
  { id: 'mask-fade', name: '渐隐遮罩', note: '标题右端淡入纸色，留余味' },
  /* 2026-11-06 第四批结构型 3 套：语法在现有 59 套里使用次数都是 0，
     且都过了导出 PNG 对照实验（perspective / border-image / bg-blend 均 KEPT）。 */
  { id: 'perspective-plane', name: '透视平面', note: '标题斜躺在透视平面上，俯视纵深' },
  { id: 'duotone-border', name: '双色条纹边框', note: '边框本身是斜条纹装饰主体' },
  { id: 'blend-plate', name: '混色底纹', note: '色块与点阵相乘，出印刷网纹' },
];

export const LAYOUT_STYLES = LAYOUT_DEFS.flatMap((l) => (
  l.bold ? BOLD_PALETTES : LAYOUT_PALETTES
).map((p) => ({
  id: `${l.id}-${p.key}`,
  name: l.name,
  group: '版式',
  layout: l.id,
  paletteKey: p.key,
  paletteName: p.name,
  desc: l.note,
  /* ⚠️ 2026-11-06：原来写死 ['xhs'] → 用户反馈「尺寸为啥只有 3:4？其他不做吗」。
     V3 模板本来就按 dim 自适应（padOf 对 3:4 / 1:1 / 21:9 给了不同内边距，
     字号也按可用宽高反算），所以三种尺寸都能出。
     旧管线（layouts.js，只画 1080×1440）的版式不在 LAYOUT_STYLES 里，不受影响。 */
  sizes: ['xhs', 'square', 'wide'],
  swatch: p.paper,
  accent: p.accent,
  /* 渲染用的完整色板（layouts.js 直接消费，不走 CSS 变量继承）。
     bold 版式用高饱和专属色板（2026-11-06），编辑设计风仍是暖纸/墨夜/亮橙。 */
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
  { id: 'nine', name: '九宫格', note: '3×3 网格，切成九张每张都有内容' },
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
