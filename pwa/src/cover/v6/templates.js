/* V3 · 长图文模板库：每套 5 页成套，文字为主
 *
 * 用户三次反馈收敛：
 *   ① 要很多模板、HTML 设计、高级文艺感
 *   ② 重复的太多（只有颜色不同）→ 压缩到 40 套真不同结构
 *   ③ 「我们这个是长图文，文字还是重点，并不是图」→ V3 重做：
 *      SVG 退到 ≤15% 边角装饰，文字区占满，每套出 5 页（封面/开篇/正文/清单/结尾）
 *
 * 差异维度（都在文字排印上，不靠换色）：
 *   字号 / 行距 / 字体族 / 对齐 / 栏宽 / 序号体系 / 段首处理 / 标题层级 / 页眉页脚
 *
 * 12 套 = 12 种文字排印骨架，每套 5 页 = 60 张成品页。
 */

import { PALETTES } from './art-system.js';
import { PAGES, ALL_TEXT } from './story.js';
import { storyPageDoc } from './story-system.js';

/* ── 12 套文字排印骨架 ─────────────────────────────────────── */
const STYLES = [
  { id:'classic',  name:'经典书刊', family:'书刊', pal:'xuan',
    titleFont:'var(--serif)', bodyFont:'var(--serif)', bodySize:32, titleSize:88,
    label:'EDITORIAL', issue:'VOL. 2026', footer:'经典书刊 · 宋体正文',
    extraCss:`.body{text-indent:0}` },

  { id:'wenkai',   name:'霞鹜手札', family:'手札', pal:'ou',
    titleFont:'var(--wenkai)', bodyFont:'var(--wenkai)', bodySize:34, titleSize:82,
    label:'FIELD NOTE', issue:'手写 · 01', footer:'霞鹜文楷 · 手札体',
    extraCss:`.page{letter-spacing:.02em}` },

  { id:'xiaowei',  name:'小薇诗笺', family:'诗笺', pal:'qing',
    titleFont:'var(--xiaowei)', bodyFont:'var(--serif)', bodySize:33, titleSize:92,
    label:'POETRY', issue:'诗笺 · 卷二', footer:'站酷小薇 · 诗题',
    extraCss:`.page-head{border-bottom:3px double var(--ink)}` },

  { id:'longcang', name:'龙藏行书', family:'诗笺', pal:'cinnabar',
    titleFont:'var(--longcang)', bodyFont:'var(--wenkai)', bodySize:36, titleSize:112,
    label:'行书', issue:'卷一', footer:'龙藏行书 · 大标题',
    extraCss:`.display{letter-spacing:.08em}.row .n{font-family:var(--serif);font-size:48px}` },

  { id:'swiss',    name:'瑞士无衬线', family:'网格', pal:'swiss',
    titleFont:'var(--sans)', bodyFont:'var(--sans)', bodySize:31, titleSize:100,
    label:'SYSTEM', issue:'REF. CH-01', footer:'SWISS · 左对齐网格',
    extraCss:`.display,.body,.row .t,.quote{font-family:var(--sans)!important;letter-spacing:-.01em}
      .page-head{border-bottom:2px solid var(--ink)}
      .page{background:linear-gradient(90deg,transparent 0 33%,var(--line) 33% calc(33% + 1px),transparent calc(33% + 1px) 66%,var(--line) 66% calc(66% + 1px),transparent calc(66% + 1px))}` },

  { id:'mono',     name:'等宽纪事', family:'网格', pal:'cha',
    titleFont:'var(--mono)', bodyFont:'var(--sans)', bodySize:30, titleSize:74,
    label:'LOG / 2026', issue:'06 · ENTRIES', footer:'等宽 · 编号纪事',
    extraCss:`.page-head{border-bottom:2px solid var(--accent)}
      .kicker,.meta{font-family:var(--mono)}
      .row{border-bottom:1px dashed var(--line)}` },

  { id:'midnight', name:'墨金夜读', family:'书刊', pal:'mo',
    titleFont:'var(--serif)', bodyFont:'var(--serif)', bodySize:33, titleSize:90,
    label:'NOCTURNE', issue:'夜读 · 01', footer:'墨金长卷 · 暗底',
    extraCss:`.page{background:radial-gradient(ellipse at 50% 40%,rgba(201,164,92,.05),transparent 70%)}` },

  { id:'indigo',   name:'靛蓝夜航', family:'书刊', pal:'lan',
    titleFont:'var(--serif)', bodyFont:'var(--serif)', bodySize:32, titleSize:86,
    label:'NAVIGATION', issue:'夜航 · 02', footer:'靛蓝夜航 · 暗底',
    extraCss:`.page-head{border-bottom:1px solid var(--accent)}` },

  { id:'narrow',   name:'窄栏长卷', family:'版心', pal:'xuan',
    titleFont:'var(--serif)', bodyFont:'var(--serif)', bodySize:30, titleSize:80,
    label:'COLUMN', issue:'窄栏 · 01', footer:'窄栏长卷 · 版心收束',
    extraCss:`.page{padding-left:190px;padding-right:190px}
      .page-head{margin-left:-94px;margin-right:-94px}` },

  { id:'wide',     name:'宽栏舒展', family:'版心', pal:'qing',
    titleFont:'var(--serif)', bodyFont:'var(--serif)', bodySize:35, titleSize:94,
    label:'WIDE', issue:'宽栏 · 01', footer:'宽栏舒展 · 大字正文',
    extraCss:`.page{padding-left:64px;padding-right:64px}
      .body{line-height:2.05}` },

  { id:'justified',name:'两端密排', family:'版心', pal:'cinnabar',
    titleFont:'var(--serif)', bodyFont:'var(--serif)', bodySize:29, titleSize:84,
    label:'JUSTIFIED', issue:'密排 · 01', footer:'两端对齐 · 密排',
    extraCss:`.page p{text-align:justify;text-justify:inter-ideograph;line-height:1.78}
      .page-head{margin-bottom:28px}` },

  { id:'ledger',   name:'编号账本', family:'网格', pal:'cha',
    titleFont:'var(--sans)', bodyFont:'var(--serif)', bodySize:31, titleSize:78,
    label:'LEDGER', issue:'06 · ROWS', footer:'编号账本 · 序号体系',
    extraCss:`.page-head{border-bottom:3px solid var(--ink);padding-bottom:22px}
      .row{min-height:150px;align-items:center}
      .row .n{font-size:52px}` },
];

/* 每套的小差异：页眉文案、段尾说明（让 5 页成套看起来像同一本书） */
const PER_STYLE_TEXT = {
  classic:  { coverKicker:'EDITORIAL · 长图文', sectionNote:'把注意力还给真实的生活', tailText:'日子被这些细碎的响声填满之后，心里那块一直空着的地方，忽然就被别的东西补上了，说不清是什么，但很清楚。回到城市之后，我把这段录音设成了闹钟，每天早上被海浪叫醒，比被消息列表叫醒舒服得多。' },
  wenkai:   { coverKicker:'FIELD NOTE · 手札', sectionNote:'手写的下午', tailText:'写下来，提醒自己下次别再忘了。' },
  xiaowei:  { coverKicker:'诗笺 · 卷二', sectionNote:'慢下来才看得见', tailText:'浪退下去的时候，沙子上会留下一层细密的水纹，几秒钟就消失了。' },
  longcang: { coverKicker:'行书 · 卷一', sectionNote:'无声的两天', tailText:'头二十分钟很难受，后来就习惯了。' },
  swiss:    { coverKicker:'SYSTEM / 2026', sectionNote:'OBSERVATION', tailText:'Details were always there. I was simply walking too fast.' },
  mono:     { coverKicker:'LOG / 2026', sectionNote:'ENTRY 03', tailText:'路口的风、店门口的猫、修车铺的收音机，全都清楚了起来。' },
  midnight: { coverKicker:'NOCTURNE · 夜读', sectionNote:'灯下', tailText:'连楼下的桂花都比记忆里香。' },
  indigo:   { coverKicker:'NAVIGATION · 夜航', sectionNote:'无信号', tailText:'时间忽然变多了，一天像被拉长了三分之一。' },
  narrow:   { coverKicker:'COLUMN · 窄栏', sectionNote:'版心之内', tailText:'原来所谓休息，不是换个地方刷手机，而是允许自己消失一阵子。' },
  wide:     { coverKicker:'WIDE · 宽栏', sectionNote:'舒展', tailText:'慢慢走，反而什么都遇得到。' },
  justified:{ coverKicker:'JUSTIFIED · 密排', sectionNote:'两端对齐', tailText:'原来不是生活没有细节，是我以前走得太快，细节全被丢在了路上。' },
  ledger:   { coverKicker:'LEDGER · 编号', sectionNote:'六条记录', tailText:'每一条都写在纸上，不给点赞留位置。' },
};

/** 每套模板 = 5 页；renderPage(i) 出单页文档，renderSet() 出整套。 */
export const TEMPLATES = STYLES.map((s, si) => ({
  id: s.id,
  name: s.name,
  family: s.family,
  pal: s.pal,
  pages: PAGES.length,
  motion: si % 2 === 0,          // 动势/克制各半，但只是边角装饰密度
  style: { ...s, ...(PER_STYLE_TEXT[s.id] || {}) },
  renderPage(i) {
    return storyPageDoc({
      pal: s.pal, tplId: s.id, pageIndex: i,
      page: PAGES[i], motion: si % 2 === 0,
      style: { ...s, ...(PER_STYLE_TEXT[s.id] || {}) },
    });
  },
}));

export const byId = (id) => TEMPLATES.find((t) => t.id === id) || TEMPLATES[0];
export const FAMILIES = [...new Set(TEMPLATES.map((t) => t.family))];
export const PAGE_KEYS = PAGES.map((p) => p.key);
export const STORY_TEXT = ALL_TEXT;
