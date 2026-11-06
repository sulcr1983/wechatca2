/* 标题图 V3 · 版式注册表静态断言（Node 直跑，不需要浏览器）
 *
 * 守什么：docs/xhs/design-xhs-title-v3-all.md §5.2 的 30 套清单与代码不漂移。
 *   · 总数 30 = 现有 7 + 配方 23，顺序与设计文档行序一致
 *   · 需要底图恰好 10 套，且就是文档点名的这 10 个 id
 *   · id 唯一；styles 全部能在 catalog 解析；未实现版式不得伪造 styleId
 *   · nine（九宫格）不是版式：注册表里不得出现，且它是唯一未被覆盖的 style
 *
 * 用法：node scripts/cover_registry_unit.mjs
 */
import {
  LAYOUT_REGISTRY, LAYOUT_COUNT, NEED_IMAGE_COUNT, NINE_LAYOUT_ID,
  registryEntry, styleIdsOf, layoutIdOfStyle, rendererForStyle,
  implementedLayouts, pendingLayouts,
} from '../pwa/src/cover/layout-registry.js';
import { ALL_STYLES } from '../pwa/src/cover/catalog.js';

let pass = 0;
let fail = 0;
const check = (name, ok, detail = '') => {
  if (ok) { pass += 1; console.log(`  PASS  ${name}`); }
  else { fail += 1; console.log(`  FAIL  ${name}${detail ? '  — ' + detail : ''}`); }
};

/* 设计文档 §5.2 的行序 + 刺激风 20 套（2026-11-06 扩容）。
   文档改序这里必须跟着改——本清单是「注册表 ↔ 文档」漂移的唯一判据。 */
const EXPECTED_IDS = [
  'image-led', 'magazine', 'quote', 'bigtype', 'list', 'number', 'swiss',
  'field-note', 'essay-split', 'evidence-wall', 'feature', 'atmos-thesis',
  'marginalia', 'matrix', 'closing-note', 'tall-ledger', 'section-divider',
  'hero-question', 'pipeline', 'before-after', 'two-signals', 'data-layer',
  'image-hero', 'takeaway', 'warning', 'kpi-tower', 'browser-mock',
  'pipeline-arch', 'h-bar', 'stacked-ledger',
  /* 刺激风 20 套（B01–B20） */
  'bold-banner', 'neon-glow', 'sticker-box', 'split-clash', 'mega-number',
  'highlighter', 'vertical-impact', 'half-clash', 'diagonal', 'card-stack',
  'bands', 'ring-focus', 'tag-flow', 'frame-hit', 'corner-num', 'three-grid',
  'mega-char', 'sticky-notes', 'marquee', 'tilt-block',
  /* 结构型 3 套（X1–X3，2026-11-06 用户拍板方向 D）。
     与前面 50 套的区别是「文字与图的空间关系」，不是配色或骨架。 */
  'text-wrap', 'multi-column', 'bleed-overlap',
  /* 第二批结构型 3 套（X4–X6）：语法在现有 53 套里使用次数都为 0，
     且都过了导出 PNG 对照实验。 */
  'gradient-title', 'span-column', 'outline-type',
];

/* 文档 §5.2 统计口径点名的 10 套需图版式（刺激风 20 套全部纯文字，不在此列）。 */
const EXPECTED_NEED_IMG = [
  'image-led', 'magazine', 'field-note', 'essay-split', 'evidence-wall',
  'feature', 'atmos-thesis', 'marginalia', 'matrix', 'image-hero',
];

console.log('标题图 V3 版式注册表');

/* ── 1. 数量与顺序 ── */
check('总数 56 套（30 配方 + 20 刺激风 + 6 结构型）', LAYOUT_COUNT === 56, `${LAYOUT_COUNT} 套`);
check('顺序与设计文档 §5.2 / 刺激风登记表一致',
  LAYOUT_REGISTRY.map((l) => l.id).join() === EXPECTED_IDS.join(),
  LAYOUT_REGISTRY.map((l) => l.id).join());

/* ── 2. 需图口径 ── */
const needImgIds = LAYOUT_REGISTRY.filter((l) => l.needImg).map((l) => l.id);
check('需要底图恰好 10 套', NEED_IMAGE_COUNT === 10, `${NEED_IMAGE_COUNT} 套`);
check('需图的就是文档点名的 10 套',
  needImgIds.slice().sort().join() === EXPECTED_NEED_IMG.slice().sort().join(),
  needImgIds.join());

/* ── 3. 必填字段与唯一性 ── */
check('id 唯一', new Set(LAYOUT_REGISTRY.map((l) => l.id)).size === LAYOUT_COUNT);
check('每套都有 name', LAYOUT_REGISTRY.every((l) => typeof l.name === 'string' && l.name.length > 0));
check('每套都有配方编号字段', LAYOUT_REGISTRY.every((l) => typeof l.code === 'string' && l.code.length > 0));
check('分组只有 existing / recipe / bold / structural',
  LAYOUT_REGISTRY.every((l) => ['existing', 'recipe', 'bold', 'structural'].includes(l.group)));
check('现有 7 + 配方 23 + 刺激风 20 + 结构型 6',
  LAYOUT_REGISTRY.filter((l) => l.group === 'existing').length === 7
  && LAYOUT_REGISTRY.filter((l) => l.group === 'recipe').length === 23
  && LAYOUT_REGISTRY.filter((l) => l.group === 'bold').length === 20
  && LAYOUT_REGISTRY.filter((l) => l.group === 'structural').length === 6,
  `existing=${LAYOUT_REGISTRY.filter((l) => l.group === 'existing').length} `
  + `recipe=${LAYOUT_REGISTRY.filter((l) => l.group === 'recipe').length} `
  + `bold=${LAYOUT_REGISTRY.filter((l) => l.group === 'bold').length} `
  + `structural=${LAYOUT_REGISTRY.filter((l) => l.group === 'structural').length}`);

/* ── 4. styles 必须真实可解析 ── */
const allStyleIds = new Set(ALL_STYLES.map((s) => s.id));
const badStyles = LAYOUT_REGISTRY.flatMap((l) => l.styles.filter((id) => !allStyleIds.has(id))
  .map((id) => `${l.id}:${id}`));
check('每条 styles 都能在 catalog 解析', badStyles.length === 0, badStyles.slice(0, 5).join(', '));

/* ── 5. 已实现 / 未实现 ──
   2026-11-06：全部版式均已接入渲染器（30 配方 + 20 刺激风 + 3 结构型），不再有占位卡。
   断言从「已实现恰好 7 套」改为「全部已实现」，并保留「未实现必须 styles 为空」
   这条不变量 —— 将来若再加版式但没写渲染器，这里要能拦住。 */
const implemented = implementedLayouts().map((l) => l.id);
const pending = pendingLayouts().map((l) => l.id);
check('全部已实现（无占位卡）', implemented.length === LAYOUT_COUNT, `${implemented.length} 套`);
check('未实现清单为空', pending.length === 0, pending.join());
check('未实现的版式必须 styles 为空（不变量）',
  pendingLayouts().every((l) => l.styles.length === 0), pending.join());
check('已实现版式 renderers 非空',
  implementedLayouts().every((l) => l.renderers.length > 0),
  implementedLayouts().filter((l) => !l.renderers.length).map((l) => l.id).join(', '));
check('registryEntry 对未知 id 返回 null', registryEntry('no-such-layout') === null);
check('styleIdsOf 对未知版式返回空数组', styleIdsOf('no-such-layout').length === 0);

/* ── 6. 反向映射 ── */
const unmatched = ALL_STYLES
  .filter((s) => s.layout !== NINE_LAYOUT_ID)
  .filter((s) => !registryEntry(layoutIdOfStyle(s.id)));
check('除九宫格外，每个 style 都能回指到注册表',
  unmatched.length === 0, unmatched.map((s) => s.id).slice(0, 5).join(', '));

const uncovered = ALL_STYLES
  .filter((s) => !LAYOUT_REGISTRY.some((l) => l.styles.includes(s.id)))
  .map((s) => s.id);
check('唯一未被注册表覆盖的是九宫格 3 个 style',
  uncovered.length === 3 && uncovered.every((id) => id.startsWith(`${NINE_LAYOUT_ID}-`)),
  uncovered.join());

/* ── 7. 九宫格不是版式 ── */
check('注册表里没有 nine（九宫格是独立功能，不是版式）',
  !LAYOUT_REGISTRY.some((l) => l.id === NINE_LAYOUT_ID));
check('layoutIdOfStyle(nine-paper) 指向 nine 而不是某套版式',
  layoutIdOfStyle('nine-paper') === NINE_LAYOUT_ID);

/* ── 8. 渲染管线可判定 ── */
const noRenderer = ALL_STYLES.filter((s) => !rendererForStyle(s.id)).map((s) => s.id);
check('每个 style 都能判定渲染管线', noRenderer.length === 0, noRenderer.join());
check('归藏 editorial 走 guizang', rendererForStyle('editorial') === 'guizang');
check('模板 editorial-dune 走 template', rendererForStyle('editorial-dune') === 'template');
check('骨架 quote-paper 走 layout', rendererForStyle('quote-paper') === 'layout');
check('未知 style 返回 null', rendererForStyle('no-such-style') === null);

/* ── 9. magazine / swiss 合并了模板配色（不丢卡） ── */
check('magazine 含归藏 editorial + 6 套模板配色',
  ['editorial', 'editorial-dune', 'editorial-forest-ink', 'editorial-indigo-porcelain',
    'editorial-ink-classic', 'editorial-kraft-paper', 'editorial-midnight-ink']
    .every((id) => registryEntry('magazine').styles.includes(id)));
check('swiss 含归藏 swiss + 4 套模板强调色',
  ['swiss', 'swiss-ikb', 'swiss-lemon-green', 'swiss-lemon-yellow', 'swiss-safety-orange']
    .every((id) => registryEntry('swiss').styles.includes(id)));

console.log(`\n版式注册表断言：${pass}/${pass + fail} 通过`);
process.exit(fail === 0 ? 0 : 1);
