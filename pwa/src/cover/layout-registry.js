/* 标题图 V3 · 版式注册表（单一真源）
 *
 * 为什么有这个文件：v3 要求右栏「30 套版式全量可见」，而版式清单此前散在
 * catalog.js 的 LAYOUTS（10 张卡）、layouts.js 的 BUILDERS、render.js 的分支判断里。
 * 只要再改一次右栏就会多出第二套真源 —— 所以把「有哪些版式、叫什么、要不要底图、
 * 对应哪些可渲染的 styleId」收到这一处，UI / 渲染 / 测试都只读它。
 *
 * 30 套 = 现有 7 + 配方 23，逐条取自 docs/xhs/design-xhs-title-v3-all.md §5.2。
 * 编号来自 references/layout-recipes.md（M = 图文/杂志类，S = 系统/结构化类）。
 *
 * ⚠️ 这里**不包含** `nine`（九宫格）：
 *    九宫格不是一套版式，而是「把任意模板产物按 3×3 切开」的独立功能
 *    （2026-11-06 项目所有者明确）。它的入口在中栏常驻，输入是任意画布产物或
 *    用户上传的图片，与「选哪套版式」无关。`nine-*` 三个 styleId 仍留在
 *    catalog.js 里供旧偏好回落，但不得再作为版式卡出现在右栏。
 *
 * ⚠️ 未实现的 23 套配方：`styles` 为空、`implemented: false`。
 *    注册表可以先落数据，但**不得给未实现版式做假卡**（点开必须置灰并说明）。
 *
 * styles 由 catalog 的真实 styleId 派生，不在本文件手写字符串：
 * 版式 → styleId 的唯一映射规则是 `catalog.ALL_STYLES[].layout`，
 * 其中 `magazine-tpl` / `swiss-tpl` 是 magazine / swiss 的配色变体（同骨架换色），
 * 归到同一张卡上（与 catalog.js 的 LAYOUTS 口径一致）。
 */

import {
  ALL_STYLES, GUIZANG_STYLES, TEMPLATE_STYLES, LAYOUT_STYLES, isLayoutStyle,
} from './catalog.js';

/** 九宫格功能专用（不是版式）：catalog 里保留，注册表与右栏都不收录。 */
export const NINE_LAYOUT_ID = 'nine';

/* 模板卡并入主卡：同骨架只换色板，视为同一套版式的配色变体。 */
const LAYOUT_ALIAS = { 'magazine-tpl': 'magazine', 'swiss-tpl': 'swiss' };

/** 30 条元数据（顺序 = 右栏展示顺序 = 设计文档 §5.2 的行序）。 */
const DEFS = [
  /* ── 现有 7 套（产品已实现，styles 非空）── */
  { id: 'image-led', name: '图文封面', code: 'M16', needImg: true, group: 'existing', desc: '标题压在图上，最像小红书爆款' },
  { id: 'magazine', name: '杂志封面', code: 'M01', needImg: true, group: 'existing', desc: '衬线大标题贴底，纸刊质感' },
  { id: 'quote', name: '金句', code: 'M04', needImg: false, group: 'existing', desc: '居中大字 + 署名，适合观点' },
  { id: 'bigtype', name: '大字版', code: '—', needImg: false, group: 'existing', desc: '纯文字大字，不用底图也成立' },
  { id: 'list', name: '清单', code: 'M05', needImg: false, group: 'existing', desc: '编号条目，干货与推荐' },
  { id: 'number', name: '编号大字', code: 'S09', needImg: false, group: 'existing', desc: '超大编号当主视觉' },
  { id: 'swiss', name: '瑞士封面', code: 'S01', needImg: false, group: 'existing', desc: '白纸细体大字，克制有力' },

  /* ── 配方 23 套（渲染器待移植，styles 为空）── */
  { id: 'field-note', name: '纪实照片', code: 'M02', needImg: true, group: 'recipe', desc: '大图 + 底部说明带 + 一句要点' },
  { id: 'essay-split', name: '左右分栏', code: 'M03', needImg: true, group: 'recipe', desc: '左大标题，右 2–3 段，中间细线' },
  { id: 'evidence-wall', name: '证据墙', code: 'M06', needImg: true, group: 'recipe', desc: '2×2 图墙 + 一句判读' },
  { id: 'feature', name: '实证特写', code: 'M10', needImg: true, group: 'recipe', desc: '大图占一半 + 底部 3 条要点' },
  { id: 'atmos-thesis', name: '氛围论点', code: 'M09', needImg: true, group: 'recipe', desc: '墨流底 + 一句大论点' },
  { id: 'marginalia', name: '页边批注', code: 'M11', needImg: true, group: 'recipe', desc: '主栏正文 + 窄边栏关键词' },
  { id: 'matrix', name: '主数字矩阵', code: 'S12', needImg: true, group: 'recipe', desc: '8 格矩阵 + 底部一个主数字' },
  { id: 'closing-note', name: '收尾寄语', code: 'M07', needImg: false, group: 'recipe', desc: '大标题 + 4 条账本 + 收尾句' },
  { id: 'tall-ledger', name: '长账本', code: 'M08', needImg: false, group: 'recipe', desc: '左编号右标题的 4–6 条清单' },
  { id: 'section-divider', name: '章节分隔', code: 'M12', needImg: false, group: 'recipe', desc: 'Act II + 3–6 字大标题' },
  { id: 'hero-question', name: '大问句', code: 'M13', needImg: false, group: 'recipe', desc: '三行问句占满整页' },
  { id: 'pipeline', name: '竖排流程', code: 'M14', needImg: false, group: 'recipe', desc: '3–4 步竖排，每步一行说明' },
  { id: 'before-after', name: '前后对比', code: 'M15', needImg: false, group: 'recipe', desc: '上下两块：旧做法 vs 新做法' },
  { id: 'two-signals', name: '双信号', code: 'S02', needImg: false, group: 'recipe', desc: '两个大块，一实一虚做对比' },
  { id: 'data-layer', name: '数据层', code: 'S03', needImg: false, group: 'recipe', desc: '对象块 + 3 条属性，强 mono' },
  { id: 'image-hero', name: '图像主角', code: 'S08', needImg: true, group: 'recipe', desc: '图铺满 + 覆盖块标题 + 3 个数字' },
  { id: 'takeaway', name: '要点账本', code: 'S07', needImg: false, group: 'recipe', desc: '大标题 + 3 行要点，深底收尾' },
  { id: 'warning', name: '警示清单', code: 'S05', needImg: false, group: 'recipe', desc: '3 条「不要这样做」，左侧色条' },
  { id: 'kpi-tower', name: '数字塔', code: 'S09', needImg: false, group: 'recipe', desc: '4 组数字 + 高低柱，数据感' },
  { id: 'browser-mock', name: '浏览器框', code: 'S04', needImg: false, group: 'recipe', desc: '把内容装进一个网页窗口里' },
  { id: 'pipeline-arch', name: '流程架构', code: 'S06', needImg: false, group: 'recipe', desc: '三段式：输入 / 生成 / 分享' },
  { id: 'h-bar', name: '横条排行', code: 'S10', needImg: false, group: 'recipe', desc: '5–6 行横条比大小，适合 Top N' },
  { id: 'stacked-ledger', name: '堆叠账本', code: 'S11', needImg: false, group: 'recipe', desc: '大标题 + 4 行账本，大数字收尾' },
];

/** styleId → 版式 id（`magazine-tpl` / `swiss-tpl` 归到主卡）。 */
function layoutIdOfStyleMeta(meta) {
  return LAYOUT_ALIAS[meta.layout] || meta.layout;
}

/** 某版式下所有可渲染的 styleId（顺序沿用 ALL_STYLES：归藏 → 模板 → 骨架版式）。 */
function stylesOf(layoutId) {
  return ALL_STYLES
    .filter((s) => layoutIdOfStyleMeta(s) === layoutId && s.layout !== NINE_LAYOUT_ID)
    .map((s) => s.id);
}

/** 一套版式用到的渲染管线（一条版式可能同时有多种：magazine = 归藏 + 模板）。 */
function renderersOf(styleIds) {
  const out = new Set();
  for (const id of styleIds) {
    if (GUIZANG_STYLES.some((s) => s.id === id)) out.add('guizang');
    else if (isLayoutStyle(id)) out.add('layout');
    else if (TEMPLATE_STYLES.some((s) => s.id === id)) out.add('template');
  }
  return [...out];
}

/** 30 套注册表（唯一真源）。`styles` / `implemented` / `renderers` 全部由 catalog 派生。 */
export const LAYOUT_REGISTRY = DEFS.map((d) => {
  const styles = stylesOf(d.id);
  return {
    ...d,
    styles,
    implemented: styles.length > 0,
    renderers: renderersOf(styles),
  };
});

export const LAYOUT_COUNT = LAYOUT_REGISTRY.length;
export const NEED_IMAGE_COUNT = LAYOUT_REGISTRY.filter((l) => l.needImg).length;

/** 按 id 取注册表条目；未知 id 返回 null（调用方必须显式处理，不静默回落）。 */
export function registryEntry(layoutId) {
  return LAYOUT_REGISTRY.find((l) => l.id === layoutId) || null;
}

/** 某版式可选的 styleId（未实现的版式返回空数组）。 */
export function styleIdsOf(layoutId) {
  const entry = registryEntry(layoutId);
  return entry ? entry.styles : [];
}

/** styleId → 版式 id（含未收录的 nine，用于旧偏好回落与入口判断）。 */
export function layoutIdOfStyle(styleId) {
  const meta = ALL_STYLES.find((s) => s.id === styleId);
  return meta ? layoutIdOfStyleMeta(meta) : null;
}

/** styleId 的渲染管线；无法判定时返回 null（render.js 的模板分支兜底）。 */
export function rendererForStyle(styleId) {
  if (GUIZANG_STYLES.some((s) => s.id === styleId)) return 'guizang';
  if (isLayoutStyle(styleId)) return 'layout';
  if (TEMPLATE_STYLES.some((s) => s.id === styleId)) return 'template';
  return null;
}

/** 已能渲染的版式（7 套，V3-A2 起可直接选）。 */
export function implementedLayouts() {
  return LAYOUT_REGISTRY.filter((l) => l.implemented);
}

/** 尚未实现渲染器的版式（23 套，右栏必须置灰、不得假装可选）。 */
export function pendingLayouts() {
  return LAYOUT_REGISTRY.filter((l) => !l.implemented);
}
