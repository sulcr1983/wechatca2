/* themes.js 适配层单测：跑法 node --test docs/prototypes/xhs/longform-art/themes.test.mjs
 *
 * ⚠️ 契约已变（用户反馈「183 的很多都是换个颜色，格局没变化，这个要精简」）：
 *    183 套主题 → 23 个视觉格局代表，160 套纯换色降为代表的内部配色变体。
 *    模板卡按「格局」计，不按主题数计；配色仍全部可达（swatches 总数 = 183）。
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { dirname, join } from 'node:path';

const here = dirname(fileURLToPath(import.meta.url));
const { THEME_TEMPLATES, THEME_FAMILIES, themeById, allTemplates,
        THEME_COUNT, THEME_SOURCE_COUNT } =
  await import(pathToFileURL(join(here, 'themes.js')).href);
const { THEME_RECIPES, THEME_VARIANTS } =
  await import(pathToFileURL(join(here, 'themes-index.js')).href);
const { measureStyle } = await import(pathToFileURL(join(here, 'auto.js')).href);
const { auditSet } = await import(pathToFileURL(join(here, 'audit.js')).href);

const RAW = `周末去海边，我把手机调成了飞行模式

两天的沉默之后，我重新听见了海浪。浪的声音比任何白噪音都好用，时间忽然变多了，早上不用刷消息，晚上不用回群里的表情包。

把手机收起来之后，我重新读完了搁置半年的那本书。晚饭后的散步也不再看屏幕，路口的风、店门口的猫、修车铺的收音机，全都清楚了起来。

- 出发前把手机调成飞行模式，塞进背包最底下
- 到了先别拍照，坐十分钟再说
- 回程的路上写几句话

> 浪的声音，比任何白噪音都好用。

如果你也想试试，就从下一个周末开始。`;

test('格局去重：183 套源主题 → 23 个视觉格局代表，160 套折叠为配色变体', () => {
  assert.equal(THEME_SOURCE_COUNT, 183);
  assert.equal(THEME_RECIPES.length, 23);
  assert.equal(THEME_TEMPLATES.length, 23);
  assert.equal(THEME_COUNT, 23);
  assert.equal(THEME_SOURCE_COUNT - THEME_COUNT, 160);
  assert.ok(THEME_FAMILIES.length > 3, '应按格局分出多个族');
});

test('每个代表都有唯一格局签名，同签名不再各占一张卡', () => {
  const sigs = THEME_RECIPES.map((r) => r.signature);
  assert.equal(new Set(sigs).size, sigs.length, '代表之间格局不得重复');
  const ids = new Set(THEME_TEMPLATES.map((t) => t.id));
  assert.equal(ids.size, 23, 'id 不应重复');
  for (const t of THEME_TEMPLATES) {
    assert.ok(t.layoutName, `${t.id} 缺格局名`);
    assert.ok(t.variantCount >= 1, `${t.id} 缺变体计数`);
    assert.equal(t.swatches.length, t.variantCount, `${t.id} swatches 与变体数不符`);
  }
});

test('所有 183 套配色仍可达，但只作为代表内部色板', () => {
  const total = THEME_TEMPLATES.reduce((n, t) => n + t.swatches.length, 0);
  assert.equal(total, THEME_SOURCE_COUNT);
  const allIds = THEME_TEMPLATES.flatMap((t) => t.swatches.map((s) => s.id));
  assert.equal(new Set(allIds).size, 183, '配色 id 不应重复或丢失');
  assert.equal(Object.keys(THEME_VARIANTS).length, 23);
});

test('切换色板只改配色，不改任何排印参数', () => {
  const t = THEME_TEMPLATES.find((x) => x.swatches.length > 3);
  assert.ok(t, '应存在有多套配色的代表');
  const before = JSON.stringify({ bodySize: t.style.bodySize, extraCss: t.style.extraCss,
    titleFont: t.style.titleFont, lineHeight: t.style.lineHeight });
  const other = t.swatches.find((s) => s.id !== t.palette.id);
  const pal = t.setSwatch(other.id);
  assert.equal(pal.accent, other.accent);
  assert.equal(JSON.stringify({ bodySize: t.style.bodySize, extraCss: t.style.extraCss,
    titleFont: t.style.titleFont, lineHeight: t.style.lineHeight }), before);
  const html = t.buildSet(RAW, null).htmls[0];
  assert.ok(html.includes(`--accent:${other.accent}`), '切换后的配色应注入 HTML');
  t.setSwatch(t.swatches[0].id);   // 还原，避免影响后续用例
});

test('每套代表都有配色与排印参数，字号守住下限', () => {
  for (const t of THEME_TEMPLATES) {
    assert.ok(t.palette.paper.startsWith('#'), `${t.id} 缺 paper`);
    assert.ok(t.palette.ink.startsWith('#'), `${t.id} 缺 ink`);
    assert.ok(t.palette.accent.startsWith('#'), `${t.id} 缺 accent`);
    assert.ok(t.style.bodySize >= 28, `${t.id} 字号低于 28px`);
    assert.ok(t.style.bodySize <= 36, `${t.id} 字号超上限`);
    assert.ok(t.style.lineHeight >= 1.7 && t.style.lineHeight <= 2.1);
  }
});

test('几何映射：公众号 15px 正文 → 长图文 ≥28px（不是照抄 15px）', () => {
  const r = THEME_RECIPES[0];
  assert.ok(r.bodySize >= 28);
  const t = THEME_TEMPLATES.find((x) => x.themeId === r.id);
  assert.ok(t, '代表应能在模板列表中找到');
  const ms = measureStyle(t);
  assert.equal(ms.bodySize, r.bodySize);
  assert.equal(ms.lineHeight, r.lineHeight);
});

test('字体族三分类齐全，且 sans-serif 不被误判成衬线', () => {
  const fonts = new Set(THEME_RECIPES.map((x) => x.bodyFont));
  assert.ok(fonts.has('var(--sans)'));
  assert.ok(fonts.has('var(--serif)'));
  assert.ok(fonts.has('var(--mono)'));
});

test('装饰语法：细线 / 左竖线 / 色块标题都转成 CSS', () => {
  const rules = new Set(THEME_TEMPLATES.map((t) => t.style.extraCss));
  assert.ok(rules.size > 8, '格局 CSS 不应千篇一律');
  const withBottom = THEME_TEMPLATES.find((t) => t.style.extraCss.includes('border-bottom:3px'));
  const withLeft = THEME_TEMPLATES.find((t) => t.style.extraCss.includes('border-left:6px'));
  const withBlock = THEME_TEMPLATES.find((t) => t.style.extraCss.includes('background:var(--paper2)'));
  assert.ok(withBottom && withLeft && withBlock, '三种主要装饰都应存在');
});

test('代表渲染：配色注入 HTML、零丢字、auditSet 全绿', () => {
  for (const t of THEME_TEMPLATES.slice(0, 8)) {
    const s = t.buildSet(RAW, null);
    assert.equal(s.htmls.length, s.pages.length);
    assert.ok(s.htmls[0].includes(`--accent:${t.palette.accent}`), `${t.id} 配色未注入`);
    /* 字号改为 CSS 自定义属性注入（用户要求「用最简单的原生 CSS 完成样式」，
       49 处内联 style 已收进 .body-text / .display 等语义类）。 */
    assert.ok(s.htmls[0].includes(`--body-size:${t.style.bodySize}px`), `${t.id} 正文字号未注入`);
    assert.ok(s.htmls[0].includes('--title-font:'), `${t.id} 标题字体未注入`);
    assert.ok(s.htmls[0].includes('font-size:var(--body-size)'), `${t.id} 未引用 CSS 变量`);
    const a = auditSet(s, RAW);
    assert.equal(a.ok, true, `${t.id}: ${JSON.stringify(a.issues)}`);
  }
});

test('全量合并：12 套手写 + 23 个格局代表 = 35 张模板卡', () => {
  const base = Array.from({ length: 12 }, (_, i) => ({ id: `base-${i}` }));
  const all = allTemplates(base);
  assert.equal(all.length, 35);
  assert.equal(new Set(all.map((t) => t.id)).size, 35);
});

test('主题按 id 可查（含 theme- 前缀）', () => {
  const t = THEME_TEMPLATES[0];
  assert.equal(themeById(t.id), t);
  assert.equal(themeById(t.themeId), t);
});

test('生成器幂等性：索引字段齐全', () => {
  const keys = ['id','name','paper','ink','accent','bodyFont','bodySize',
                'titleRule','lineHeight','signature','family','layoutName','variantCount'];
  for (const r of THEME_RECIPES) for (const k of keys) assert.ok(k in r, `${r.id} 缺 ${k}`);
});
