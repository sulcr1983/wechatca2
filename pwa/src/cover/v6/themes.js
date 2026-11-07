/* 公众号主题 → 长图文模板适配层
 *
 * 用户想法（2026-11-06）：「长文的格式可以直接把公众号编辑的那个排版格式和引擎
 *   拿过来用，这样也多了很多套模板」。
 * 后续修正：「183 的很多都是换个颜色，格局没变化，这个要精简」。
 *
 * 做法（最小改动、不引 Pyodide、不改产品代码）：
 *   · 真源仍是 public/themes/*.json；scripts/gen_longform_theme_index.py 已按
 *     「格局签名」去重：183 套 → 49 个格局代表，134 套纯换色降为代表的内部变体
 *   · 本文件只把 49 个代表包成模板对象（UI 里就是 49 张卡，不再有 183 张同格局卡）
 *   · 每个代表带 swatches：自身配色 + 同格局的其它配色，切换色板不改格局
 *   · buildAutoSet 的 palette 参数注入配色，不污染 art-system.js 的 8 套色板
 *
 * ⚠️ 几何映射：公众号正文 15px（手机文章宽）→ 长图文 30px（1080 画布），
 *    生成器里已按 2× 缩放并夹在 28–36px（产品门禁 ≥28px 硬下限）。
 */

import { THEME_RECIPES, THEME_VARIANTS, THEME_COUNT, THEME_SOURCE_COUNT, variantsOf }
  from './themes-index.js';
import { buildAutoSet, measureStyle } from './auto.js';
import { storyPageDoc } from './story-system.js';
import { assignDecor } from './decor.js';

export { THEME_COUNT, THEME_SOURCE_COUNT, variantsOf };

/** 主题装饰语法 → CSS。只加线与对齐，不改文字区宽度（文字仍占满画布）。 */
function themeCss(t) {
  const parts = [];
  if (t.titleRule === 'bottom' || t.titleRule === 'double') {
    parts.push(`.page-head{border-bottom:3px ${t.titleRule === 'double' ? 'double' : 'solid'} var(--accent)}`);
    parts.push('.display{border-bottom:1px solid var(--line);padding-bottom:18px}');
  } else if (t.titleRule === 'left') {
    parts.push('.display{border-left:6px solid var(--accent);padding-left:24px}');
  } else if (t.titleRule === 'block') {
    parts.push('.page-head{background:var(--paper2);padding:14px 18px;border-bottom:0}');
  } else if (t.titleRule === 'top') {
    parts.push('.display{border-top:4px solid var(--ink);padding-top:18px}');
  }
  if (t.quoteRule === 'left') {
    parts.push('div[style*="border-left"]{border-left-width:5px!important}');
  }
  if (t.align === 'center' || t.align === 'right') {
    parts.push(`.page p{text-align:${t.align}}`);
  } else if (t.align === 'justify') {
    parts.push('.page p{text-align:justify;text-justify:inter-ideograph}');
  }
  if (t.titleAlign === 'center') parts.push('.display{text-align:center}');
  if (t.dark) parts.push('.page-head{border-bottom-color:var(--accent)}');
  if (t.h2Weight && String(t.h2Weight) !== '500') {
    parts.push(`.page h2{font-weight:${String(t.h2Weight).replace(/[^0-9]/g, '') || 500}}`);
  }
  return parts.join('\n');
}

/** 配色覆盖（只给 storyPageDoc 的 palette 用）。 */
function themePalette(t) {
  return {
    paper: t.paper, paper2: t.paper,      // 主题没写 paper2，同色即可
    ink: t.ink, muted: t.muted,
    accent: t.accent, accentSoft: t.accentSoft,
    line: t.line, dark: t.dark,
  };
}

/** 把一个「格局代表」包成模板对象。
 *  swatches = 自身配色 + 同格局的其它配色变体；切换色板不动格局。 */
export function themeToTemplate(t) {
  const own = { id: t.id, name: t.name, ...themePalette(t) };
  const swatches = [own, ...(THEME_VARIANTS[t.id] || []).map((v) => ({
    id: v.id, name: v.name, ...themePalette(v),
  }))];
  const style = {
    id: `theme-${t.id}`,
    name: t.layoutName || t.name,
    family: t.family || '公众号主题',
    pal: 'xuan',                    // 占位；实际色板由 palette 覆盖
    bodyFont: t.bodyFont,
    titleFont: t.titleFont,
    bodySize: t.bodySize,
    titleSize: t.titleSize,
    lineHeight: t.lineHeight,
    tracking: t.tracking,
    label: 'THEME',
    issue: t.layoutName || t.name,
    footer: t.layoutName || t.name,
    coverKicker: t.desc ? String(t.desc).slice(0, 18) : '公众号主题 · 长图文',
    sectionNote: t.desc ? String(t.desc).slice(0, 22) : '',
    extraCss: themeCss(t),
  };
  return {
    id: `theme-${t.id}`,
    name: t.layoutName || t.name,     // 卡名显示「格局」，不显示主题商品名
    sourceName: t.name,
    family: t.family || '公众号主题',
    pal: 'xuan',
    motion: false,
    desc: t.desc,
    kind: t.kind,
    themeId: t.id,
    layoutName: t.layoutName,
    variantCount: t.variantCount || 1,
    swatches,
    palette: own,
    style,
    /** 切换同格局配色（不改任何排印参数）。 */
    setSwatch(id) {
      const s = this.swatches.find((x) => x.id === id);
      if (s) this.palette = { ...s };
      return this.palette;
    },
    /* 自动分页专用：与 12 套共用同一个 buildAutoSet，只多注入 palette */
    buildSet(raw, doc = null) {
      const ms = measureStyle(this);
      const set = buildAutoSet(raw, this, doc);
      /* 用当前选中的配色与装饰 CSS 重渲每页（最小改动：复用同一批动态页数据） */
      set.htmls = set.pages.map((page, i) => storyPageDoc({
        pal: this.pal, tplId: this.id, pageIndex: i, page,
        motion: false, style: { ...this.style, ...ms },
        total: set.pages.length, palette: this.palette,
        family: this.family, decor: this.decor,
      }));
      return set;
    },
  };
}

/* 装饰分配：每张卡 1 主 + 1 辅，全局不重复（10 套用完再轮回，但组合不同）。
 * ⚠️ 必须在这里调用 —— 只 import 不调用的话，decor 为 undefined，
 *    23 张卡全都没有装饰层（实测踩过）。 */
export const THEME_TEMPLATES = assignDecor(THEME_RECIPES.map(themeToTemplate));
export const THEME_FAMILIES = [...new Set(THEME_TEMPLATES.map((t) => t.family))];

/** 打开单套主题（供 tpl.html 用）。 */
export const themeById = (id) =>
  THEME_TEMPLATES.find((t) => t.id === id || t.themeId === id) || null;

/** 与 12 套合并后的全量列表（UI 单一真源）。 */
export function allTemplates(baseTemplates) {
  return [...baseTemplates, ...THEME_TEMPLATES];
}
