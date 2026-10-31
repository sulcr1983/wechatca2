/* 长文卡片渲染器（design §9：cards.js 新建）—— 7 角色渲染器 + buildLong 分页。
 *
 * 来源（两份原型，均已实测验证）：
 *   · docs/prototypes/xhs-text-card-v2.html      → 7 角色版式系统（bodyFor/cardHtml）
 *   · docs/prototypes/xhs-studio-redesign.html   → 12 套模板 + 实测高度装箱分页（buildLong）
 *   本文件按 prototype → 模块的方式搬运，分页算法与实测常量**逐字保留**，不重新推导。
 *
 * 版权：12 套模板的设计来源 geekfoxcharlie/XHS-TextCard（MIT），仅借鉴视觉手法与
 *   信息层级，代码按本项目 DOM+CSS 架构独立重写（THIRD_PARTY_NOTICES.md §3）。
 *
 * 与既有代码的边界：
 *   - 渲染产物 = 自包含 HTML 文档（#xhs-cover 契约与 render.js 一致），story.js 负责
 *     iframe 截图；本文件不做任何截图/滚动管线的复制
 *   - 排版 CSS 内嵌在文档与测量宿主里，全部选择器用 @@S@@ 作用域前缀
 *     （主文档 = '#cv-cards-root '，导出文档 = ''，避免与 style.css 撞类名）
 *   - 字体走 fonts/cover-fonts.css（Noto Serif/Sans SC 本地子集），**无外链字体**
 *     （build.mjs 断言禁止 Google Fonts；原型的 Playfair Display / IBM Plex Mono
 *      分别回退到 var(--serif) / ui-monospace 栈）
 *   - 铁律（design §11.7）：本文件不含任何对比度 / scrim 数学 —— 封面页 r-cover 的
 *     渐变是原型验证过的固定装饰层，不是按图计算的 band scrim
 */

/* ── 基础工具 ─────────────────────────────────────────────────────── */

export const esc = (s) => String(s == null ? '' : s)
  .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');

/** 行内标记：**粗** ==高亮== *斜*（与原型 inline() 一致） */
export const inlineMd = (s) => esc(s)
  .replace(/\*\*(.+?)\*\*/g, '<strong>$1</strong>')
  .replace(/==(.+?)==/g, '<span class="mark">$1</span>')
  .replace(/\*([^*]+?)\*/g, '<em>$1</em>');

/** 纯文本 → 块数组（p / h1–h4 / quote / step / li / pagebreak）。 */
export function parseBlocks(md) {
  const lines = String(md).replace(/\r\n/g, '\n').split('\n');
  const blocks = [];
  let para = [];
  const flush = () => {
    if (para.length) {
      const t = para.join('\n').trim();
      if (t) blocks.push({ type: 'p', text: t });
      para = [];
    }
  };
  for (const raw of lines) {
    const line = raw.trim();
    if (!line) { flush(); continue; }
    if (/^(-{3,}|\*{3,})$/.test(line)) { flush(); blocks.push({ type: 'pagebreak' }); continue; }
    let m = line.match(/^(#{1,4})\s+(.+)$/);
    if (m) { flush(); blocks.push({ type: 'h' + m[1].length, text: m[2] }); continue; }
    if (/^>\s?/.test(line)) { flush(); blocks.push({ type: 'quote', text: line.replace(/^>\s?/, '') }); continue; }
    m = line.match(/^(?:第([一二三四五六七八九十]+)步|[①-⑳]|(\d{1,2})[.、)])\s*(.+)$/);
    if (m) {
      flush();
      const txt = m[3];
      const sp = txt.split(/[：:]/);
      blocks.push({
        type: 'step', text: txt,
        title: (sp.length > 1 ? sp[0] : txt).trim(),
        desc: sp.length > 1 ? sp.slice(1).join('：').trim() : '',
      });
      continue;
    }
    m = line.match(/^[-*•·]\s+(.+)$/);
    if (m) { flush(); blocks.push({ type: 'li', text: m[1] }); continue; }
    para.push(line);
  }
  flush();
  return blocks;
}

export const charSum = (arr) => arr.reduce((n, b) => n + (b.text ? b.text.length : 0), 0);

/** 超长段落按句拆开（>190 字一段在 52px 正文里必然溢出 1124px 可用高）。
 *  204 是算术上限（12 行 × 17 字），190 留 14 字余量给字体回落与标点挤压。 */
export function splitLongParas(blocks) {
  const out = [];
  for (const b of blocks) {
    if (b.type !== 'p' || b.text.length <= 190) { out.push(b); continue; }
    let cur = '';
    for (const s of b.text.split(/(?<=[。！？!?；;])/)) {
      if (cur && (cur + s).length > 230) { out.push({ type: 'p', text: cur }); cur = s; }
      else cur += s;
    }
    if (cur.trim()) out.push({ type: 'p', text: cur });
  }
  return out;
}

/* ── 8 套色板：直接映射现有封面模板色板，保证「封面 + 内页」同族（design §7）── */

export const PALETTES = [
  { key: 'dune', name: '沙丘暖纸', ds: '暖纸 + 沙褐', fam: 'editorial',
    paper: '#f0e6d2', paper2: '#ded0b7', ink: '#1f1a14', muted: '#6f6557',
    accent: '#8f7650', line: 'rgba(31,26,20,.22)', hl: 'rgba(143,118,80,.20)',
    grain: 'rgba(0,0,0,.045)', at: '#6b5334' },
  { key: 'forest', name: '森林墨绿', ds: '米白 + 墨绿', fam: 'editorial',
    paper: '#f5f1e8', paper2: '#e7e1d3', ink: '#16211b', muted: '#5c6a60',
    accent: '#2e6b4f', line: 'rgba(22,33,27,.20)', hl: 'rgba(46,107,79,.16)',
    grain: 'rgba(0,0,0,.042)', at: '#2e6b4f' },
  { key: 'indigo', name: '靛蓝瓷白', ds: '瓷白 + 靛蓝', fam: 'editorial',
    paper: '#f2f4f5', paper2: '#e2e8ec', ink: '#161c26', muted: '#5b6675',
    accent: '#315d93', line: 'rgba(22,28,38,.18)', hl: 'rgba(49,93,147,.14)',
    grain: 'rgba(0,0,0,.040)', at: '#315d93' },
  { key: 'kraft', name: '牛皮纸', ds: '牛皮 + 焦褐', fam: 'editorial',
    paper: '#eedfc7', paper2: '#dccaa9', ink: '#241c12', muted: '#6b5b42',
    accent: '#9b5a2e', line: 'rgba(36,28,18,.24)', hl: 'rgba(155,90,46,.20)',
    grain: 'rgba(0,0,0,.050)', at: '#7c4520' },
  { key: 'midnight', name: '午夜墨金', ds: '墨黑 + 暗金', fam: 'editorial',
    paper: '#0e0d0c', paper2: '#1a1816', ink: '#f0e9db', muted: '#9a917f',
    accent: '#d4a04a', line: 'rgba(240,233,219,.18)', hl: 'rgba(212,160,74,.22)',
    grain: 'rgba(255,255,255,.045)', at: '#d4a04a' },
  { key: 'ikb', name: '克莱因蓝', ds: '瑞士 · 无衬线', fam: 'swiss',
    paper: '#fafaf8', paper2: '#f0f0ec', ink: '#111111', muted: '#6b6b66',
    accent: '#002FA7', line: 'rgba(17,17,17,.18)', hl: 'rgba(0,47,167,.10)',
    grain: 'rgba(0,0,0,.035)', at: '#002FA7' },
  { key: 'lemon', name: '柠檬黄', ds: '瑞士 · 高能', fam: 'swiss',
    paper: '#fafaf8', paper2: '#f1f1ea', ink: '#111111', muted: '#6b6b66',
    accent: '#C5E803', line: 'rgba(17,17,17,.18)', hl: 'rgba(197,232,3,.34)',
    grain: 'rgba(0,0,0,.035)', at: '#4F5A00' },
  { key: 'orange', name: '安全橙', ds: '瑞士 · 冲击', fam: 'swiss',
    paper: '#fafaf8', paper2: '#f2f0eb', ink: '#111111', muted: '#6b6b66',
    accent: '#FF6B35', line: 'rgba(17,17,17,.18)', hl: 'rgba(255,107,53,.16)',
    grain: 'rgba(0,0,0,.035)', at: '#A6390A' },
];

export const paletteByKey = (key) => PALETTES.find((p) => p.key === key) || PALETTES[0];

/* ── 页脚辅助（design §12.4 签名 / §12.5 页码开关）────────────────────
   两者都只在**页脚**动，不新造颜色不新增布局：
   · 页码：o.pn === false 时省略（默认 true = 现状，老用户不会觉得页码「丢了」）
   · 签名：o.sign 非空时追加 `@签名`，沿用模板页脚既有的字号与颜色
   ⚠️ 只管 foot() 里的页码文本；closing 的超大装饰数字、页眉都不受影响。 */
const pn = (txt, o) => (o && o.pn === false ? '' : txt);
const sg = (o) => (o && o.sign ? `<span class="lt-foot-sign">@${esc(o.sign)}</span>` : '');

/* ── 12 套长文模板（整套图文共用；design §6.0.3）───────────────────── */

export const LONG_TPLS = [
  {
    id: 'editorial', name: '杂志编辑', cls: 'lt-editorial',
    desc: 'EDITORIAL 刊头 · 上下细线 · 衬线正文',
    palette: null,
    head: () => `<span class="lt-mast">EDITORIAL</span>
      <span class="lt-mast-r">COLLECTION // VOL. 2026</span>`,
    foot: (i, n, o) => `<span class="lt-foot-l">SuperSu${sg(o)}</span><span class="lt-foot-r">${pn(`${i} / ${n}`, o)}</span>`,
  },
  {
    id: 'swiss', name: '瑞士网格', cls: 'lt-swiss',
    desc: '左侧色条 · 40px 网格 · REF 编号',
    palette: null,
    head: () => `<span class="lt-mast">SWISS STUDIO</span>
      <span class="lt-mast-r">REF. CH-8004</span>`,
    foot: (i, n, o) => `<span class="lt-foot-l">${pn(String(i).padStart(2, '0'), o)}${sg(o)}</span>
      <span class="lt-corner"></span>`,
  },
  {
    id: 'notion', name: '效率笔记', cls: 'lt-notion',
    desc: '面包屑导航 · 顶部细线 · 克制的灰',
    palette: { paper: '#ffffff', paper2: '#f7f6f3', ink: '#37352f', muted: '#9b9a97',
      accent: '#0f7b6c', at: '#0f7b6c', line: 'rgba(55,53,47,.09)', hl: 'rgba(15,123,108,.15)',
      grain: 'rgba(0,0,0,.03)' },
    head: () => `<span class="lt-mast">📖 &nbsp;/&nbsp; Workspace &nbsp;/&nbsp; Notes</span>`,
    foot: (i, n, o) => `<span class="lt-foot-l">SuperSu${sg(o)}</span><span class="lt-foot-r">${pn(`${i} / ${n}`, o)}</span>`,
  },
  {
    id: 'book', name: '书籍内页', cls: 'lt-book',
    desc: '左侧装订阴影 · 右缘高光 · 纸张纹理',
    palette: { paper: '#fdfbf7', paper2: '#f5f1e8', ink: '#2b2b2b', muted: '#8a7f70',
      accent: '#8c3a3a', at: '#8c3a3a', line: 'rgba(93,64,55,.14)', hl: 'rgba(140,58,58,.10)',
      grain: 'rgba(0,0,0,.05)' },
    head: () => `<span class="lt-book-sect">§</span>
      <span class="lt-book-mast">C L A S S I C   L I T E R A T U R E</span>`,
    foot: (i, n, o) => `<span class="lt-foot-l">SuperSu${sg(o)}</span><span class="lt-foot-r">${pn(`P. ${String(i).padStart(2, '0')}`, o)}</span>`,
  },
  {
    id: 'memo', name: '苹果备忘录', cls: 'lt-memo',
    desc: 'iOS 顶栏 · 横线纸 · 圆角白卡',
    palette: { paper: '#f2f2f7', paper2: '#ffffff', ink: '#1c1c1e', muted: '#8e8e93',
      accent: '#ff9500', at: '#c46f00', line: 'rgba(60,60,67,.12)', hl: 'rgba(255,149,0,.16)',
      grain: 'rgba(0,0,0,.02)' },
    head: () => `<span class="lt-memo-back">‹ 备忘录</span>
      <span class="lt-memo-date"></span><span class="lt-memo-done">完成</span>`,
    foot: (i, n, o) => `<span class="lt-foot-l">SuperSu${sg(o)}</span><span class="lt-foot-r">${pn(`${i} / ${n}`, o)}</span>`,
  },
  {
    id: 'polaroid', name: '拍立得', cls: 'lt-polaroid',
    desc: '上部照片框 · 胶带 · 复古颗粒',
    palette: { paper: '#fafafa', paper2: '#ffffff', ink: '#2b2b2b', muted: '#8a8a8a',
      accent: '#d9534f', at: '#b23f3b', line: 'rgba(0,0,0,.10)', hl: 'rgba(217,83,79,.18)',
      grain: 'rgba(0,0,0,.06)' },
    head: () => '',
    foot: (i, n, o) => `<span class="lt-foot-l">${sg(o)}</span><span class="lt-foot-r">${pn(String(i).padStart(2, '0'), o)}</span>`,
  },
  {
    id: 'aura', name: '弥散极光', cls: 'lt-aura',
    desc: '三层光晕 · 毛玻璃圆角卡',
    palette: { paper: '#ffffff', paper2: '#fafafa', ink: '#2d3436', muted: '#7a8285',
      accent: '#2d3436', at: '#2d3436', line: 'rgba(45,52,54,.10)', hl: 'rgba(45,52,54,.10)',
      grain: 'rgba(0,0,0,.03)' },
    head: () => '',
    foot: (i, n, o) => `<span class="lt-foot-l">SuperSu${sg(o)}</span><span class="lt-foot-r">${pn(`${i} / ${n}`, o)}</span>`,
  },
  {
    id: 'night', name: '暗夜深思', cls: 'lt-night',
    desc: '深色径向渐变 · 左侧发光竖线 · 终端感',
    palette: { paper: '#0d0d0d', paper2: '#161616', ink: '#e5e5e5', muted: '#8a8a8a',
      accent: '#00f5ff', at: '#00e0e8', line: 'rgba(255,255,255,.10)', hl: 'rgba(0,245,255,.14)',
      grain: 'rgba(255,255,255,.04)' },
    head: () => `<span class="lt-night-pn"></span>
      <span class="lt-mast-r">// THOUGHT MODE ON</span>`,
    foot: (i, n, o) => `<span class="lt-foot-l">${sg(o)}</span><span class="lt-foot-r">${pn(`${i} / ${n}`, o)}</span>`,
  },
  {
    id: 'doc', name: '大厂文档', cls: 'lt-doc',
    desc: '网格底 · macOS 窗口 · CONFIDENTIAL',
    palette: { paper: '#f8f9fb', paper2: '#ffffff', ink: '#111827', muted: '#6b7280',
      accent: '#0066ff', at: '#0052cc', line: 'rgba(17,24,39,.09)', hl: 'rgba(0,102,255,.10)',
      grain: 'rgba(0,0,0,.02)' },
    head: () => `<span class="lt-doc-dots"><i></i><i></i><i></i></span>
      <span class="lt-doc-title">DOCUMENT VIEWER</span>
      <span class="lt-mast-r">CONFIDENTIAL</span>`,
    foot: (i, n, o) => `<span class="lt-foot-l">SuperSu${sg(o)}</span><span class="lt-foot-r">${pn(`${i} / ${n}`, o)}</span>`,
  },
  {
    id: 'film', name: '电影胶片', cls: 'lt-film',
    desc: '宽银幕遮幅 · 胶片齿孔 · 帧编号',
    palette: { paper: '#1a1a18', paper2: '#252320', ink: '#d8d4ce', muted: '#9a938a',
      accent: '#c8b89a', at: '#d8c9ae', line: 'rgba(200,184,154,.20)', hl: 'rgba(200,184,154,.15)',
      grain: 'rgba(255,255,255,.03)' },
    head: () => `<div class="lt-film-bars top"><span class="lt-film-frame">▶ 01A</span>
      <span class="lt-film-kodak">KODAK  5222  DOUBLE-X</span></div>
      <div class="lt-film-title">— A   C I N E M A T I C   N O T E —</div>`,
    foot: (i, n, o) => `<div class="lt-film-scene">${pn(`SCENE ${String(i).padStart(2, '0')} / ${String(n).padStart(2, '0')}`, o)}${sg(o)}</div>
      <div class="lt-film-bars bottom"><span class="lt-film-dir">DIR. ___________</span>
      <span class="lt-film-print">PRINT: FINAL</span></div>`,
  },
  {
    id: 'starry', name: '星光质感', cls: 'lt-starry',
    desc: '深蓝夜空 · 星点光晕 · 月亮微光',
    palette: { paper: '#0c1445', paper2: '#141a3e', ink: '#e8eaf2', muted: '#8f97b8',
      accent: '#fbbf24', at: '#fbbf24', line: 'rgba(251,191,36,.25)', hl: 'rgba(251,191,36,.16)',
      grain: 'rgba(255,255,255,.03)' },
    head: () => `<span class="lt-starry-mark">✦ STARRY NIGHT</span>`,
    foot: (i, n, o) => `<span class="lt-foot-l">SuperSu${sg(o)}</span><span class="lt-foot-r">${pn(`${i} / ${n}`, o)}</span>`,
  },
  {
    id: 'blank', name: '极简留白', cls: 'lt-blank',
    desc: '只有页码 —— 把注意力全留给文字',
    palette: null,
    head: () => '',
    foot: (i, n, o) => `<span class="lt-foot-l">${sg(o)}</span><span class="lt-foot-r">${pn(`${i} / ${n}`, o)}</span>`,
  },
];

export const tplById = (id) => LONG_TPLS.find((t) => t.id === id) || LONG_TPLS[0];

/** 内页背景图可用模板（design §12.2）：6 套。
 *  另外 6 套（polaroid/aura/night/doc/film/starry）自带完整背景体系
 *  （照片框、光晕、深色渐变、网格底、遮幅、星空），铺图会毁掉模板语义 → 禁用。 */
export const BG_TPL_IDS = ['editorial', 'swiss', 'notion', 'book', 'memo', 'blank'];
export const tplSupportsBg = (id) => BG_TPL_IDS.includes(id);

/* ── 实测常量（原型逐字搬运，出处见 design §6「落地状态」）──────────── */

/** dense 页「摘段后」至少剩多少字才允许把末段摘去做 closing。
 *  140 是实测推导：1080 真宽下 dense 单段 128 字 = 66.5%、140 字 = 74.6%，
 *  §6 下限 68% 的临界正落在 8→9 行之间。 */
export const DENSE_MIN_FILL_CHARS = 140;
/** 开篇容量上限：170 字首段在开篇角色里 101.7% 溢出（内容被裁）。 */
export const OPENING_MAX_CHARS = 120;
/** 金句容量上限：金句 30 字 + 上下文 120 字 = 106.3% 溢出。 */
export const QUOTE_MAX_CHARS = 120;
/** 结尾容量上限：1 段 170 字 / 2 段 156 字 / 3 段 140 字都实测溢出。 */
export const closingCap = (n) => Math.max(100, 150 - 10 * (n - 1));
/** 一套图文页数上限（封面 + 最多 5 张内页；对齐行业标准与旧 story.js）。 */
export const STORY_MAX_PAGES = 6;
export const STORY_MAX_INNER = STORY_MAX_PAGES - 1;
/** 已知几何边界：dense 单段 120–139 字恒为 8 行 = 66.5%（低于 §6 的 68%）。
 *  **不是缺陷**：要够 68% 必须 9 行（≥140 字），而第二段一加就是 16 行 → 134.7% 溢出。
 *  「大字版式占高少是大字的代价」—— 接受，不靠加装饰填空。 */
export const DENSE_SINGLE_SEG_FLOOR = 66.5;

export const ROLES = {
  cover: { label: '封面' },
  opening: { label: '开篇' },
  points: { label: '清单' },
  quote: { label: '金句' },
  steps: { label: '步骤' },
  dense: { label: '正文' },
  closing: { label: '结尾' },
};

/* ── 排版 CSS（作用域前缀 @@S@@：主文档 = '#cv-cards-root '，导出文档 = ''）──
   ⚠️ 排印基元用 :where() 把特异性归零（原型 2026-10-31 重大修复）：
   原来写 `.card .body p`（0,2,1）会压过所有角色规则（0,2,0），
   开篇 74 / 金句 78 / 结尾 66 / 清单 56 的字号阶梯从未生效过 ——
   那是「长文看起来单调」的根因之一。角色规则必须能盖过基础规则。 */

const CARD_CSS_RAW = `
@@S@@.card{
  width:1080px;height:1440px;position:relative;overflow:hidden;
  background:var(--paper);color:var(--ink);
  --serif:"Noto Serif SC","Songti SC",Georgia,serif;
  --sans:"Noto Sans SC","PingFang SC",system-ui,sans-serif;
  --mono:ui-monospace,SFMono-Regular,Menlo,monospace;
  -webkit-font-smoothing:antialiased;
}
@@S@@.card .grain{position:absolute;inset:0;z-index:3;pointer-events:none;opacity:.30;
  background-image:radial-gradient(var(--grain) 1px,transparent 1px);background-size:3px 3px}
@@S@@.card .body{position:absolute;left:88px;right:88px;top:166px;bottom:150px;z-index:4;
  display:flex;flex-direction:column}

/* 页眉页脚通用（12 套模板各自微调几何） */
@@S@@.card .lh{position:absolute;left:88px;right:88px;top:66px;height:34px;z-index:5;
  display:flex;align-items:center;justify-content:space-between;gap:20px;
  font:600 16px/1 var(--mono);letter-spacing:.18em;text-transform:uppercase;
  color:var(--muted)}
@@S@@.card .lf{position:absolute;left:88px;right:88px;bottom:56px;height:30px;z-index:5;
  display:flex;align-items:center;justify-content:space-between;
  font:500 16px/1 var(--mono);letter-spacing:.14em;color:var(--muted)}
@@S@@.card .lt-mast{font-weight:700;letter-spacing:.14em;color:var(--ink)}
@@S@@.card .lt-mast-r{font-style:italic;font-weight:400;letter-spacing:.10em}
/* 页脚签名（design §12.4）：沿用页脚自身的字号与颜色，只加一点左间距分隔 */
@@S@@.card .lt-foot-sign{margin-left:10px;opacity:.72}
/* 内页背景图 + 纸色蒙层（design §12.2）。z 序：图(0) → 蒙层(1) → 装饰/文字 */
@@S@@.card .lt-bg{position:absolute;inset:0;width:100%;height:100%;object-fit:cover;
  z-index:0;pointer-events:none}
@@S@@.card .lt-bg-mask{position:absolute;inset:0;z-index:1;pointer-events:none}
/* 有背景图时纸纹让位（两层半透明叠加会显脏） */
@@S@@.card:has(.lt-bg) .grain{display:none}

/* ── 1 杂志编辑：上下细线 + 衬线正文 ───────────────────────────── */
@@S@@.card.lt-editorial .lh{top:62px;padding-bottom:14px;border-bottom:1px solid var(--line)}
@@S@@.card.lt-editorial .body{top:150px;bottom:120px}
@@S@@.card.lt-editorial .lf{border-top:1px solid var(--line);padding-top:14px}
@@S@@.card.lt-editorial .body .h2{font-family:var(--serif);letter-spacing:.02em}

/* ── 2 瑞士网格：左侧色条 + 40px 竖网格 ────────────────────────── */
@@S@@.card.lt-swiss{background-image:repeating-linear-gradient(90deg,
  var(--line) 0 1px, transparent 1px 40px)}
@@S@@.card.lt-swiss::before{content:"";position:absolute;left:0;top:0;bottom:0;width:8px;
  background:var(--accent);z-index:2}
@@S@@.card.lt-swiss .lh{left:100px;right:60px;top:40px;justify-content:flex-end}
@@S@@.card.lt-swiss .body{left:100px;right:60px;top:110px;bottom:110px}
@@S@@.card.lt-swiss .lf{left:100px;right:60px}
@@S@@.card.lt-swiss .corner{width:20px;height:20px;border:2px solid var(--accent)}
@@S@@.card.lt-swiss .body p{font-family:var(--sans);line-height:1.62}
@@S@@.card.lt-swiss .body .h2{font-family:var(--sans);font-weight:700;letter-spacing:-.01em}

/* ── 3 效率笔记：白纸 + 面包屑 + 顶部细线 ──────────────────────── */
@@S@@.card.lt-notion .lh{top:56px;padding-bottom:12px;border-bottom:1px solid var(--line);
  text-transform:none;letter-spacing:.02em;font:500 17px/1 var(--sans)}
@@S@@.card.lt-notion .body{top:140px;bottom:110px}
@@S@@.card.lt-notion .body p{font-family:var(--sans);line-height:1.76}
@@S@@.card.lt-notion .body .h2{font-family:var(--sans);font-weight:600}

/* ── 4 书籍内页：左侧装订阴影 + 右缘高光 + 纸张纹理 ────────────── */
@@S@@.card.lt-book{background:
  linear-gradient(90deg, rgba(0,0,0,.15) 0%, rgba(0,0,0,.05) 4%, rgba(0,0,0,0) 12%),
  linear-gradient(270deg, rgba(255,255,255,.5) 0 3px, transparent 3px),
  var(--paper)}
@@S@@.card.lt-book .lh{top:68px;justify-content:center;column-gap:18px}
@@S@@.card.lt-book .lt-book-sect{color:var(--accent);font-size:22px;line-height:1}
@@S@@.card.lt-book .lt-book-mast{font:italic 500 15px/1 var(--serif);letter-spacing:.34em;color:var(--muted)}
@@S@@.card.lt-book .body{left:110px;right:96px;top:150px;bottom:130px}
@@S@@.card.lt-book .lf{left:110px;right:96px}

/* ── 5 苹果备忘录：iOS 顶栏 + 横线纸 + 白卡 ────────────────────── */
@@S@@.card.lt-memo{padding:0}
@@S@@.card.lt-memo::before{content:"";position:absolute;left:15px;right:15px;top:55px;bottom:55px;
  background:#fff;border-radius:14px;box-shadow:0 6px 24px rgba(0,0,0,.05);z-index:1}
@@S@@.card.lt-memo .lh{left:40px;right:40px;top:16px;height:26px;z-index:5;
  text-transform:none;letter-spacing:.01em;font:500 17px/1 var(--sans);color:var(--accent)}
@@S@@.card.lt-memo .lt-memo-date{color:var(--muted);font-weight:400;font-size:13px}
@@S@@.card.lt-memo .lt-memo-done{color:var(--accent);font-weight:600}
@@S@@.card.lt-memo .body{left:52px;right:52px;top:100px;bottom:110px;z-index:4;
  background-image:repeating-linear-gradient(180deg,
    transparent 0 calc(var(--fs) * 1.74 - 1px), var(--line) calc(var(--fs) * 1.74 - 1px) calc(var(--fs) * 1.74))}
@@S@@.card.lt-memo .body p{font-family:var(--sans);line-height:1.74}
@@S@@.card.lt-memo .body .h2{font-family:var(--sans);font-weight:600}

/* ── 6 拍立得：上部照片框 + 胶带 ──────────────────────────────── */
@@S@@.card.lt-polaroid{background:#d6d6d6}
@@S@@.card.lt-polaroid::before{content:"";position:absolute;left:50px;top:60px;right:50px;bottom:60px;
  background:#fafafa;box-shadow:0 14px 34px rgba(0,0,0,.16);z-index:1}
/* 照片框按比例 26%（原型 T5 修：写死 420px 会把正文区压到 730px，开篇必溢出） */
@@S@@.card.lt-polaroid::after{content:"";position:absolute;left:80px;right:80px;top:90px;
  height:calc(26% - 30px);
  background:linear-gradient(140deg,#3a3a3a,#2c2c2c 60%,#4a4a4a);z-index:2}
@@S@@.card.lt-polaroid .lh{top:34px;z-index:6;left:0;right:0;justify-content:center}
@@S@@.card.lt-polaroid .lh::before{content:"";width:150px;height:36px;
  background:rgba(255,255,255,.55);box-shadow:0 3px 8px rgba(0,0,0,.12);
  transform:rotate(-2deg)}
@@S@@.card.lt-polaroid .body{left:90px;right:90px;top:calc(26% + 60px);bottom:130px;z-index:4}
@@S@@.card.lt-polaroid .lf{left:90px;right:90px}

/* ── 7 弥散极光：三层光晕 + 毛玻璃卡 ──────────────────────────── */
@@S@@.card.lt-aura{background:
  radial-gradient(80% 60% at 0% 0%, rgba(255,195,160,.34), transparent 70%),
  radial-gradient(70% 55% at 100% 18%, rgba(255,175,189,.28), transparent 70%),
  radial-gradient(90% 70% at 50% 100%, rgba(33,147,176,.18), transparent 70%),
  #fff}
@@S@@.card.lt-aura::before{content:"";position:absolute;left:25px;right:25px;top:30px;bottom:60px;
  background:rgba(255,255,255,.52);border:1.5px solid rgba(255,255,255,.75);
  border-radius:28px;box-shadow:0 10px 40px rgba(0,0,0,.04);z-index:1;
  backdrop-filter:blur(2px)}
@@S@@.card.lt-aura .lh{left:60px;right:60px;top:60px;z-index:5}
@@S@@.card.lt-aura .body{left:60px;right:60px;top:130px;bottom:110px;z-index:4}
@@S@@.card.lt-aura .lf{left:60px;right:60px;bottom:80px}

/* ── 8 暗夜深思：径向渐变 + 左侧发光竖线 ──────────────────────── */
@@S@@.card.lt-night{background:radial-gradient(90% 70% at 50% 50%, #1a1a1a, #050505)}
@@S@@.card.lt-night::before{content:"";position:absolute;left:0;top:0;bottom:0;width:3px;
  background:linear-gradient(180deg, transparent, var(--accent) 20% 80%, transparent);
  opacity:.35;z-index:2}
@@S@@.card.lt-night::after{content:"";position:absolute;left:20px;right:20px;top:30px;bottom:60px;
  border:1px solid rgba(255,255,255,.05);border-radius:16px;
  background:rgba(255,255,255,.02);z-index:1}
@@S@@.card.lt-night .lh{left:52px;right:52px;top:50px;z-index:5}
@@S@@.card.lt-night .night-pn,.card.lt-night .lt-night-pn{color:rgba(255,255,255,.35)}
@@S@@.card.lt-night .body{left:52px;right:52px;top:120px;bottom:150px;z-index:4}
@@S@@.card.lt-night .lf{left:52px;right:52px;bottom:80px;padding-top:14px;
  border-top:1px solid rgba(255,255,255,.2)}
@@S@@.card.lt-night .body .h2{color:var(--accent)}

/* ── 9 大厂文档：网格 + macOS 窗口 ────────────────────────────── */
@@S@@.card.lt-doc{background:
  repeating-linear-gradient(90deg, rgba(0,102,255,.022) 0 1px, transparent 1px 20px),
  repeating-linear-gradient(180deg, rgba(0,102,255,.022) 0 1px, transparent 1px 20px),
  var(--paper)}
@@S@@.card.lt-doc::before{content:"";position:absolute;left:15px;right:15px;top:40px;bottom:60px;
  background:#fff;border-radius:12px;box-shadow:0 10px 30px rgba(0,0,0,.08);z-index:1}
@@S@@.card.lt-doc .lh{left:15px;right:15px;top:40px;height:30px;z-index:5;
  border-radius:12px 12px 0 0;background:rgba(17,24,39,.05);padding:0 14px;
  justify-content:flex-start;gap:14px}
@@S@@.card.lt-doc .lt-doc-dots{display:flex;gap:7px}
@@S@@.card.lt-doc .lt-doc-dots i{width:10px;height:10px;border-radius:50%;display:block}
@@S@@.card.lt-doc .lt-doc-dots i:nth-child(1){background:#ff5f56}
@@S@@.card.lt-doc .lt-doc-dots i:nth-child(2){background:#ffbd2e}
@@S@@.card.lt-doc .lt-doc-dots i:nth-child(3){background:#27c93f}
@@S@@.card.lt-doc .lt-doc-title{font:700 11px/1 var(--sans);letter-spacing:.06em;color:var(--muted)}
@@S@@.card.lt-doc .lt-mast-r{margin-left:auto;font:700 10px/1 var(--sans);letter-spacing:.08em}
@@S@@.card.lt-doc .body{left:50px;right:50px;top:130px;bottom:120px;z-index:4}
@@S@@.card.lt-doc .lf{left:50px;right:50px}

/* ── 10 电影胶片：宽银幕遮幅 + 齿孔 ──────────────────────────── */
@@S@@.card.lt-film{background:radial-gradient(90% 75% at 50% 45%, #252320, #1a1a18 60%, #111110)}
@@S@@.card.lt-film::after{content:"";position:absolute;inset:0;z-index:6;pointer-events:none;
  box-shadow:inset 0 0 140px 30px rgba(0,0,0,.45)}
@@S@@.card.lt-film .lt-film-bars{position:absolute;left:0;right:0;height:7%;z-index:7;
  background:#000;display:flex;align-items:center;padding:0 16px;
  font:600 10px/1 "Courier New",monospace;letter-spacing:.06em;
  color:rgba(200,184,154,.35)}
@@S@@.card.lt-film .lt-film-bars.top{top:0;border-bottom:.5px solid rgba(200,184,154,.2);
  justify-content:space-between}
@@S@@.card.lt-film .lt-film-bars.bottom{bottom:0;border-top:.5px solid rgba(200,184,154,.2);
  justify-content:space-between}
@@S@@.card.lt-film .lt-film-bars::before{content:"";position:absolute;left:0;right:0;top:50%;
  height:45%;transform:translateY(-50%);
  background-image:repeating-linear-gradient(90deg,
    rgba(200,184,154,.12) 0 8px, transparent 8px 32px);
  -webkit-mask-image:repeating-linear-gradient(90deg,#000 0 8px,transparent 8px 32px);
  pointer-events:none;opacity:.9}
@@S@@.card.lt-film .lh{left:0;right:0;top:7%;height:56px;z-index:8;justify-content:center}
@@S@@.card.lt-film .lt-film-title{font:italic 500 15px/1 var(--serif);letter-spacing:.22em;
  color:rgba(200,184,154,.5)}
@@S@@.card.lt-film .body{left:70px;right:70px;top:calc(7% + 100px);bottom:calc(7% + 90px);z-index:5}
@@S@@.card.lt-film .lf{bottom:7%;height:7%;left:0;right:0;z-index:8;justify-content:center}
@@S@@.card.lt-film .lt-film-scene{font:500 12px/1 "Courier New",monospace;letter-spacing:.14em;
  color:rgba(200,184,154,.4)}

/* ── 11 星光质感：深蓝渐变 + 星点 + 月亮微光 ──────────────────── */
@@S@@.card.lt-starry{background:
  radial-gradient(70% 50% at 85% 8%, rgba(251,191,36,.16), transparent 65%),
  radial-gradient(120% 90% at 50% 20%, #1a1a3e, #0c1445 55%, #0f0f2d)}
@@S@@.card.lt-starry::before{content:"";position:absolute;inset:0;z-index:1;opacity:.9;
  background-image:
    radial-gradient(1.5px 1.5px at 12% 18%, rgba(255,255,255,.9), transparent),
    radial-gradient(1px 1px at 28% 42%, rgba(255,255,255,.7), transparent),
    radial-gradient(2px 2px at 44% 12%, rgba(255,255,255,.85), transparent),
    radial-gradient(1px 1px at 62% 30%, rgba(255,255,255,.6), transparent),
    radial-gradient(1.5px 1.5px at 78% 15%, rgba(255,255,255,.8), transparent),
    radial-gradient(1px 1px at 88% 48%, rgba(255,255,255,.55), transparent),
    radial-gradient(1px 1px at 18% 68%, rgba(255,255,255,.6), transparent),
    radial-gradient(1.5px 1.5px at 72% 78%, rgba(255,255,255,.7), transparent);
  background-size:100% 100%}
@@S@@.card.lt-starry .lh{left:60px;right:60px;top:56px;z-index:5;
  border-bottom:1px solid rgba(251,191,36,.35);padding-bottom:16px}
@@S@@.card.lt-starry .lt-starry-mark{color:var(--accent);font-weight:600;letter-spacing:.16em}
@@S@@.card.lt-starry .body{left:60px;right:60px;top:140px;bottom:120px;z-index:4}
@@S@@.card.lt-starry .lf{left:60px;right:60px;color:rgba(251,191,36,.6)}

/* ── 12 极简留白：只有页码 ──────────────────────────────────── */
@@S@@.card.lt-blank .body{top:120px;bottom:120px}
@@S@@.card.lt-blank .lh{display:none}

/* 排印基元：:where() 归零特异性（见文件头说明） */
@@S@@:where(.card .body p){margin:0 0 var(--pgap);font-family:var(--serif);font-weight:400;
  font-size:var(--fs);line-height:1.74;text-align:justify;text-wrap:pretty}
@@S@@:where(.card .body .h2){font-family:var(--serif);font-weight:500;letter-spacing:.03em;
  font-size:calc(var(--fs) * 1.40);line-height:1.32;margin:0 0 calc(var(--fs) * .48);text-wrap:balance}
@@S@@:where(.card .body .h3){font-family:var(--serif);font-weight:500;letter-spacing:.02em;
  font-size:calc(var(--fs) * 1.10);line-height:1.38;
  margin:calc(var(--fs) * .58) 0 calc(var(--fs) * .26);text-wrap:balance}
@@S@@.card .body strong{font-weight:600}
@@S@@.card .body em{font-family:var(--serif);font-style:italic}
@@S@@.card .body .mark{background:var(--hl);padding:0 3px;border-radius:2px}

/* ⓪ 封面页：封面 = 模板的 P1（与内页共用 .lh/.lf/配色，不出现「第一页和后面不同」）。
   底图铺满整页压一层固定渐变（原型验证的装饰层），标题在照片上仍读得清。 */
@@S@@.card .body.r-cover{justify-content:flex-end;padding-bottom:0}
@@S@@.card .body.r-cover .lt-cover-img{position:absolute;inset:0;width:100%;height:100%;
  object-fit:cover;object-position:center 46%;z-index:0}
@@S@@.card .body.r-cover.has-img::after{content:"";position:absolute;inset:0;z-index:1;
  background:linear-gradient(180deg,rgba(10,9,8,0) 38%,rgba(10,9,8,.30) 62%,
    rgba(10,9,8,.66) 84%,rgba(10,9,8,.80) 100%)}
@@S@@.card .body.r-cover .lt-cover-inner{position:relative;z-index:2;padding-bottom:8px}
@@S@@.card .body.r-cover .lt-cover-kick{margin:0 0 18px;font:500 21px/1 var(--mono);
  letter-spacing:.22em;text-transform:uppercase;color:var(--accentText)}
@@S@@.card .body.r-cover .lt-cover-ttl{margin:0;font-family:var(--serif);font-weight:500;
  font-size:calc(var(--fs) * 2.05);line-height:1.18;letter-spacing:.02em;text-wrap:balance}
@@S@@.card .body.r-cover .lt-cover-sub{margin:26px 0 0;font-family:var(--serif);
  font-style:italic;font-size:calc(var(--fs) * .60);line-height:1.62;color:var(--muted);
  max-width:820px;text-wrap:pretty}
@@S@@.card .body.r-cover.has-img .lt-cover-ttl{color:#fff;
  text-shadow:0 1px 2px rgba(0,0,0,.45), 0 6px 22px rgba(0,0,0,.35)}
@@S@@.card .body.r-cover.has-img .lt-cover-sub{color:rgba(255,255,255,.88)}
@@S@@.card .body.r-cover.has-img .lt-cover-kick{color:rgba(255,255,255,.82)}

/* ① 开篇 opening */
@@S@@.card .body.r-opening{justify-content:center}
@@S@@.r-opening .rule{width:62px;height:2px;background:var(--accent);margin:0 0 38px;flex:none}
@@S@@.r-opening .lead{font-family:var(--serif);font-weight:500;font-size:74px;line-height:1.36;
  letter-spacing:.03em;margin:0;max-width:900px;text-wrap:balance}
@@S@@.r-opening .sub{font-family:var(--serif);font-style:italic;font-weight:400;
  font-size:31px;line-height:1.52;color:var(--muted);margin:32px 0 0;max-width:820px;text-wrap:pretty}
@@S@@.r-opening .sign{margin-top:64px;font:400 20px/1 var(--mono);letter-spacing:.20em;
  text-transform:uppercase;color:var(--muted)}

/* ② 清单 points
   ⚠️ .body 本身是 absolute（已是子元素的包含块），这里不能再写 position:relative ——
   那会把它拉回普通流，宽度变成整卡 1080，右边界溢出 88px（原型实测）。 */
@@S@@.card .body.r-points{justify-content:center}
@@S@@.r-points .big-num{position:absolute;right:-30px;top:-16px;z-index:0;pointer-events:none;
  font:600 300px/1 var(--serif);color:var(--accent);opacity:.10;letter-spacing:-.03em}
@@S@@.r-points .ttl{position:relative;z-index:1;font-family:var(--serif);font-weight:500;
  letter-spacing:.03em;font-size:56px;line-height:1.32;margin:0 0 36px;text-wrap:balance}
@@S@@.r-points .rows{position:relative;z-index:1;display:flex;flex-direction:column}
@@S@@.r-points .row{display:flex;gap:26px;align-items:baseline;padding:25px 0;
  border-top:1px solid var(--line)}
@@S@@.r-points .row:last-child{border-bottom:1px solid var(--line)}
@@S@@.r-points .row .n{flex:none;font:500 24px/1 var(--mono);letter-spacing:.10em;
  color:var(--accentText);padding-top:5px;font-variant-numeric:tabular-nums}
@@S@@.r-points .row .t{flex:1;font-family:var(--serif);font-size:var(--fs);line-height:1.62;
  font-weight:400;text-align:justify;text-wrap:pretty}
@@S@@.r-points .row .t b{font-weight:600}
@@S@@.r-points .pintro,.r-steps .pintro{
  position:relative;z-index:1;font-family:var(--serif);font-weight:400;
  font-size:calc(var(--fs) * .88);line-height:1.7;color:var(--muted);
  margin:0 0 30px;text-align:justify;text-wrap:pretty}

/* ③ 金句 quote */
@@S@@.card .body.r-quote{justify-content:center;text-align:center}
@@S@@.r-quote .qbg{position:absolute;left:50%;top:50%;transform:translate(-50%,-56%);z-index:0;
  font-family:Georgia,var(--serif);font-style:italic;font-weight:400;
  font-size:560px;line-height:.9;color:var(--accent);opacity:.13;pointer-events:none}
@@S@@.r-quote .qmark{position:relative;z-index:1;font-family:Georgia,var(--serif);
  font-style:italic;font-size:130px;line-height:.55;color:var(--accent);opacity:.34;
  margin:0 0 22px;align-self:center}
@@S@@.r-quote .qt{position:relative;z-index:1;font-family:var(--serif);font-weight:500;
  font-size:78px;line-height:1.46;letter-spacing:.03em;margin:0;max-width:840px;
  align-self:center;text-wrap:balance}
@@S@@.r-quote .qrule{position:relative;z-index:1;width:54px;height:2px;background:var(--accent);
  margin:42px auto 0;opacity:.70}
@@S@@.r-quote .qctx{position:relative;z-index:1;margin:40px auto 0;max-width:760px;
  font-family:var(--serif);font-weight:400;font-size:30px;line-height:1.72;
  color:var(--muted);text-align:justify;text-wrap:pretty}
@@S@@.r-quote .qsign{position:relative;z-index:1;margin:30px auto 0;
  font:400 20px/1 var(--mono);letter-spacing:.24em;text-transform:uppercase;color:var(--muted)}

/* ④ 步骤 steps */
@@S@@.r-steps .ttl{font-family:var(--serif);font-weight:500;letter-spacing:.03em;font-size:56px;
  line-height:1.32;margin:0 0 42px;text-wrap:balance}
@@S@@.r-steps .flow{display:flex;flex-direction:column}
@@S@@.r-steps .step{display:flex;gap:28px;position:relative;padding-bottom:36px}
@@S@@.r-steps .step:last-child{padding-bottom:0}
@@S@@.r-steps .step:not(:last-child)::before{content:"";position:absolute;left:28px;top:56px;
  bottom:0;width:1px;background:var(--line)}
@@S@@.r-steps .step .sn{flex:none;width:56px;height:56px;border-radius:50%;display:grid;
  place-items:center;border:1px solid var(--accent);color:var(--accentText);
  font:500 21px/1 var(--mono);font-variant-numeric:tabular-nums;background:var(--paper);
  position:relative;z-index:1}
@@S@@.r-steps .step .sc{flex:1;padding-top:5px}
@@S@@.r-steps .step .st{font-family:var(--serif);font-weight:600;font-size:calc(var(--fs) * 1.0);
  line-height:1.5;margin:0 0 8px;text-wrap:pretty}
@@S@@.r-steps .step .sd{font-family:var(--serif);font-weight:400;font-size:calc(var(--fs) * .82);
  line-height:1.68;color:var(--muted);margin:0;text-align:justify;text-wrap:pretty}

/* ⑤ 正文 dense —— 中文不做首字下沉，用 40px 小色条做段首锚点 */
@@S@@.r-dense .ttl{font-family:var(--serif);font-weight:500;letter-spacing:.03em;
  font-size:calc(var(--fs) * 1.36);line-height:1.34;margin:0 0 calc(var(--fs) * .50);text-wrap:balance}
@@S@@.r-dense .drop{position:relative}
@@S@@.r-dense .drop::before{content:"";display:block;width:40px;height:2px;background:var(--accent);
  margin:0 0 22px;opacity:.75}

/* ⑥ 结尾 closing */
@@S@@.card .body.r-closing{justify-content:center}
@@S@@.r-closing .cbg{position:absolute;right:-30px;bottom:-60px;z-index:0;pointer-events:none;
  font:600 340px/1 var(--serif);color:var(--accent);opacity:.09;letter-spacing:-.04em}
@@S@@.r-closing .rule{position:relative;z-index:1;width:62px;height:2px;background:var(--accent);
  margin:0 0 34px;flex:none}
@@S@@.r-closing .ct{position:relative;z-index:1;font-family:var(--serif);font-weight:500;
  font-size:66px;line-height:1.42;letter-spacing:.03em;margin:0;max-width:860px;text-wrap:balance}
@@S@@.r-closing .cd{position:relative;z-index:1;font-family:var(--serif);font-weight:400;
  font-size:31px;line-height:1.68;color:var(--muted);margin:30px 0 0;max-width:780px;
  text-align:justify;text-wrap:pretty}
@@S@@.r-closing .cta{position:relative;z-index:1;display:inline-flex;align-items:center;gap:14px;
  margin-top:56px;font:500 21px/1 var(--mono);letter-spacing:.16em;text-transform:uppercase;
  color:var(--accentText);border-top:1px solid var(--line);padding-top:24px;align-self:flex-start}
@@S@@.r-closing .cta::before{content:"";width:28px;height:2px;background:var(--accent)}

/* 瑞士模式：无衬线 / 无纹理 / 一个强调色（fam='swiss' 的色板附加类） */
@@S@@.card.swiss .body p,.card.swiss .row .t,.card.swiss .ct,.card.swiss .sd{font-family:var(--sans)}
@@S@@.card.swiss .r-quote .qt,.card.swiss .r-opening .lead,.card.swiss .r-closing .ct,
.card.swiss .r-points .ttl,.card.swiss .r-steps .ttl,.card.swiss .r-dense .ttl,.card.swiss .r-opening .sub{
  font-family:var(--sans);font-weight:300;letter-spacing:.01em}
@@S@@.card.swiss .grain{display:none}
@@S@@.card.swiss .r-steps .step .sn{border-radius:0}
@@S@@.card.swiss .body .mark{background:var(--accent);color:var(--paper);padding:0 5px}
`;

/** 作用域化 CSS。scope='' 用于导出文档；'#cv-cards-root ' 用于主文档预览与测量。 */
export function cardCss(scope = '') {
  return CARD_CSS_RAW.split('@@S@@').join(scope);
}
/* ── 度量环境（主文档内注入 CSS + 字体，供 packDense 实测高度）────────── */

let envPromise = null;

/** 确保主文档具备卡片 CSS + 封面字体。返回 #cv-cards-root 容器
 *  （index.js 的长文预览 deck 也挂在这里；不存在时建一个屏外隐藏容器）。 */
export function ensureCardsEnv(baseUrl = '') {
  if (envPromise) return envPromise;
  envPromise = (async () => {
    let root = document.getElementById('cv-cards-root');
    if (!root) {
      root = document.createElement('div');
      root.id = 'cv-cards-root';
      root.style.cssText = 'position:fixed;left:-99999px;top:0;width:0;height:0;overflow:hidden;';
      document.body.appendChild(root);
    }
    if (!document.getElementById('cv-cards-css')) {
      const style = document.createElement('style');
      style.id = 'cv-cards-css';
      style.textContent = cardCss('#cv-cards-root ');
      document.head.appendChild(style);
    }
    // 字体：度量与预览都必须等封面字体就绪，否则行数按回退字体算，
    // 与最终截图（真字体）不一致 → 溢出/欠填误判。3s 超时兜底（4% 余量兜底）。
    try {
      if (baseUrl && !document.querySelector('link[data-cv-fonts]')) {
        const l = document.createElement('link');
        l.rel = 'stylesheet';
        l.setAttribute('data-cv-fonts', '1');
        l.href = `${baseUrl}fonts/cover-fonts.css`;
        document.head.appendChild(l);
      }
      const loads = ['400 52px "Noto Serif SC"', '700 52px "Noto Serif SC"',
        '400 52px "Noto Sans SC"', '700 52px "Noto Sans SC"']
        .map((f) => (document.fonts ? document.fonts.load(f).catch(() => {}) : Promise.resolve()));
      await Promise.race([Promise.all(loads), new Promise((r) => setTimeout(r, 3000))]);
    } catch { /* 字体失败不阻断：回退字体 + 4% 余量兜底 */ }
    return root;
  })();
  return envPromise;
}

/** 实测某串正文块在**当前模板**下的高度（像素），返回每块含下边距的高度。
 *  2026-10-31（原型）：从「按字数估算」改为「实测 DOM 高度」—— 12 套模板的
 *  正文可用宽度与字号不同，同样字数在不同模板下高度能差 15% 以上。 */
function measureDense(blocks, tpl, pal) {
  /* ⚠️ 守卫顺序：先判 document 存在，再 getElementById —— 反了会在 Node（单测/SSR）里
     直接 ReferenceError（不是返回 null）。无 DOM 时返回 null → packDense 走字数包络。 */
  if (typeof document === 'undefined' || !document.body) return null;
  const root = document.getElementById('cv-cards-root');
  if (!root) return null;
  const host = document.createElement('div');
  host.className = `card ${tpl.cls}`;
  host.style.cssText = 'position:fixed;left:-99999px;top:0;width:1080px;height:1440px;' + styleVars(pal);
  const body = document.createElement('div');
  body.className = 'body';
  /* 保留 left/right（宽度由模板决定），只放开 top/bottom 让高度随内容撑开 */
  body.style.cssText = 'top:auto;bottom:auto;height:auto;';
  host.appendChild(body);
  const paras = blocks.map((b) => {
    const p = document.createElement('p');
    p.innerHTML = inlineMd(b.text || '');
    body.appendChild(p);
    return p;
  });
  root.appendChild(host);
  const heights = paras.map((p) => {
    const cs = getComputedStyle(p);
    return p.getBoundingClientRect().height + (parseFloat(cs.marginBottom) || 0);
  });
  root.removeChild(host);
  return heights;
}

/** 当前模板下 dense 页的可用高度（像素）。无 DOM（单测/SSR）返回 null → 走字数包络。 */
function denseMaxHeight(tpl, pal) {
  if (typeof document === 'undefined' || !document.body) return null;
  const root = document.getElementById('cv-cards-root');
  if (!root) return null;
  const host = document.createElement('div');
  host.className = `card ${tpl.cls}`;
  host.style.cssText = 'position:fixed;left:-99999px;top:0;width:1080px;height:1440px;' + styleVars(pal);
  const body = document.createElement('div');
  body.className = 'body';
  host.appendChild(body);
  root.appendChild(host);
  const h = body.getBoundingClientRect().height;
  root.removeChild(host);
  return h;
}

/** 把单块反复切分，直到每一块都装得进 maxH（原型：原来只切一刀，400 字单段照样溢出）。 */
function splitUntilFit(block, maxH, tpl, pal) {
  const out = [];
  let queue = [block];
  let guard = 0;
  while (queue.length && guard++ < 60) {
    const b = queue.shift();
    const h = (measureDense([b], tpl, pal) || [0])[0];
    if (h <= maxH) { out.push(b); continue; }
    const parts = splitBlockToFit(b, maxH, tpl, pal);
    if (!parts) { out.push(b); continue; }   /* 切不动（太短），原样保留 */
    queue.unshift(...parts);
  }
  return out;
}

function splitBlockToFit(block, maxH, tpl, pal) {
  const text = String(block.text || '');
  if (text.length < 2) return null;
  /* 二分：找「能装进 maxH 的最长前缀」，再回退到句读处断开 */
  let lo = 1, hi = text.length - 1, best = 0;
  while (lo <= hi) {
    const mid = (lo + hi) >> 1;
    const h = measureDense([{ ...block, text: text.slice(0, mid) }], tpl, pal);
    if (h && h[0] <= maxH) { best = mid; lo = mid + 1; } else hi = mid - 1;
  }
  if (best < 2) return null;
  const WIN = 24;
  const tail = text.slice(Math.max(0, best - WIN), best);
  const at = Math.max(
    tail.lastIndexOf('。'), tail.lastIndexOf('！'), tail.lastIndexOf('？'),
    tail.lastIndexOf('；'), tail.lastIndexOf('，'), tail.lastIndexOf('、'),
  );
  const cut = at > 0 ? Math.max(0, best - WIN) + at + 1 : best;
  return [
    { ...block, text: text.slice(0, cut) },
    { ...block, text: text.slice(cut) },
  ];
}

/** 把一串连续正文块按实测高度装进多页。无 DOM 时回退到字数包络
 *  `Σ ceil(字数/17) + 段数 ≤ 13`（design §6；单测/SSR 降级路径）。 */
function packDense(blocks, tpl, pal) {
  /* 留 4% 安全余量：字体回退的行高与最终字体有 1–6% 差异（film 模板实测 106% 溢出）。
     裁切 = 用户原文丢失，属阻断级 —— 宁可行少一点。 */
  const maxH = Math.floor((denseMaxHeight(tpl, pal) || 1124) * 0.96);

  /* 先处理「单块就超页容量」的段落：反复切分后再进正常装箱流程 */
  const flat = [];
  blocks.forEach((b) => {
    const h = (measureDense([b], tpl, pal) || [0])[0];
    if (h > maxH) flat.push(...splitUntilFit(b, maxH, tpl, pal));
    else flat.push(b);
  });

  const heights = measureDense(flat, tpl, pal);

  if (!heights) {
    const pages = [];
    let cur = [], rows = 0, segs = 0;
    blocks.forEach((b) => {
      const t = (b.text || '').length;
      const r = Math.max(1, Math.ceil(t / 17));
      if (cur.length && rows + r + segs + 1 > 13) { pages.push(cur); cur = []; rows = 0; segs = 0; }
      cur.push(b); rows += r; segs++;
    });
    if (cur.length) pages.push(cur);
    return pages;
  }

  const pages = [];
  let cur = [], h = 0;
  /* ⚠️ 必须遍历 flat（切分后的数组）—— heights 是按 flat 量的，
     用 blocks 会索引错位，切分等于白做（原型踩过）。 */
  flat.forEach((b, i) => {
    const bh = heights[i];
    if (cur.length && h + bh > maxH) {
      pages.push(cur); cur = []; h = 0;
    }
    cur.push(b); h += bh;
  });
  if (cur.length) pages.push(cur);
  return pages;
}

/* ── 分页器：把正文拆成内页（封面单独产出，不在这个数组里）──────────── */

export function buildLong(text, { tpl = LONG_TPLS[0], pal = PALETTES[0] } = {}) {
  const blocks = splitLongParas(parseBlocks(text));
  const pages = [];
  let i = 0;
  let manualBreaks = 0;      // 实际生效的手动分页符数（design §12.3 自检条要写出来）

  /* ── 强制分页符（design §12.3）：独占一行的 `---` = 强制分页 ──────────
     仅长文管线如此（公众号排版走 format_engine，语义不变，两条管线独立）。
     边界规则：
       ① 连续两个 `---` 只分一次（splitIntoManualSegments 里合并空段）
       ② 开头/结尾的 `---` 忽略（空段直接丢弃）
       ③ 手动分页优先于自动分页：先按 `---` 切大段，段内再走既有自动分页
       ④ opening/closing 仍只授予自然首页/末页；手动分页后的短页按 dense 排
     ⚠️ 原实现是 `if (b.type === 'pagebreak') { i++; continue; }` —— 等于把分页符
        当不存在，用户写 `---` 想断页却断不了。 */
  const segs = [];
  let curSeg = [];
  for (const b of blocks) {
    if (b.type === 'pagebreak') {
      if (curSeg.length) { segs.push(curSeg); curSeg = []; }   // ① 空段不产生分页
      continue;
    }
    curSeg.push(b);
  }
  if (curSeg.length) segs.push(curSeg);                        // ② 结尾 `---` 自然丢弃
  manualBreaks = Math.max(0, segs.length - 1);

  /* 单段（无分页符）时走原来的整体流程；多段时逐段独立分页再拼接 */
  const buildSegment = (seg, isFirst, isLast) => {
    const out = [];
    let j = 0;
    /* 开篇：取开头连续段落，≤ 90 字；首段超长（> OPENING_MAX_CHARS）时不做开篇页。
       ④ 只有**自然首页**才配 opening —— 手动分页后的段不算开篇。 */
    if (isFirst) {
      let cur = [], ch = 0;
      while (j < seg.length && seg[j].type === 'p' && ch < 70) {
        cur.push(seg[j]); ch += seg[j].text.length; j++;
      }
      if (cur.length && ch <= OPENING_MAX_CHARS) out.push({ role: 'opening', blocks: cur });
      else if (cur.length) { j -= cur.length; }
    }

    while (j < seg.length) {
      const b = seg[j];

      if (b.type === 'li') {
        const group = [];
        while (j < seg.length && seg[j].type === 'li') { group.push(seg[j]); j++; }
        /* 前导段落并入清单页（作为 intro），避免出现半空的正文页 */
        let lead = [];
        const prev = out[out.length - 1];
        if (prev && prev.role === 'dense' && charSum(prev.blocks) < 70) { lead = out.pop().blocks; }
        /* 清单页最多 6 条：再多会撑破 1124px，拆成两页 */
        for (let k = 0; k < group.length; k += 6) {
          out.push({ role: 'points', blocks: (k === 0 ? lead : []).concat(group.slice(k, k + 6)) });
        }
        continue;
      }

      if (b.type === 'quote') {
        const q = [b]; j++;
        let qch = b.text ? b.text.length : 0;
        /* 紧跟的短段落作为上下文（提高填充，避免孤句空页）；
           按 QUOTE_MAX_CHARS 封顶，超出的段落留给后面的 dense 页。 */
        while (j < seg.length && seg[j].type === 'p' && seg[j].text.length <= 80 &&
               qch + seg[j].text.length <= QUOTE_MAX_CHARS) {
          q.push(seg[j]); qch += seg[j].text.length; j++;
        }
        out.push({ role: 'quote', blocks: q });
        continue;
      }

      /* 正文页：按实测 DOM 高度装箱（packDense）；无 DOM 降级为字数包络 */
      const dp = [];
      while (j < seg.length && seg[j].type !== 'li' && seg[j].type !== 'quote') {
        dp.push(seg[j]); j++;
      }
      if (dp.length) {
        packDense(dp, tpl, pal).forEach((blks) => out.push({ role: 'dense', blocks: blks }));
      }
    }
    void isLast;
    return out;
  };

  segs.forEach((seg, si) => {
    buildSegment(seg, si === 0, si === segs.length - 1).forEach((p) => {
      /* 段索引只作内部标记（非枚举，不影响序列化），供 closing 判定用 */
      Object.defineProperty(p, '_seg', { value: si, enumerable: false });
      pages.push(p);
    });
  });

  /* 结尾：优先把最后一段单独做成结尾页 —— 结尾页塞两段会把 CTA 挤到页脚上。
     ④ 只给**自然末页**（design §12.3 规则④）：手动分页符切出来的段末不升格 closing，
     否则「A --- B --- C」会变成 A(opening) / B(closing)，C 被并进 closing 的前一段
     （实测踩到：3 段只出 3 页，第三段消失）。 */
  if (pages.length >= 2) {
    const last = pages[pages.length - 1];
    const inLastSeg = last._seg === segs.length - 1;
    if (inLastSeg && last.role === 'dense') {
      const tail = last.blocks[last.blocks.length - 1];
      /* B3 guard：摘走末段会让上一页掉到 §6 下限以下（310 字样例实测 66.5%）。
         design §6：末页欠填先尝试合并，不允许靠加装饰填空 —— 摘段前先验算。 */
      const rest = charSum(last.blocks.slice(0, -1));
      const tailLen = (tail.text || '').length;
      if (last.blocks.length >= 2 && tailLen <= 120 && rest >= DENSE_MIN_FILL_CHARS &&
          tailLen <= closingCap(1)) {
        last.blocks = last.blocks.slice(0, -1);
        pages.push({ role: 'closing', blocks: [tail] });
      } else if (last.blocks.length === 1 && charSum(last.blocks) <= closingCap(1)) {
        last.role = 'closing';
      }
    }
  }

  /* 页数上限：超限**先合并、后截断**，truncated 供自检提示。
     合并 = 相邻两个 dense 页按实测高度验算装得下才合（不静默丢内容）。 */
  let truncated = 0;
  while (pages.length > STORY_MAX_INNER) {
    let merged = false;
    for (let k = 0; k < pages.length - 1; k++) {
      const a = pages[k], b = pages[k + 1];
      if (a.role !== 'dense' || b.role !== 'dense') continue;
      const together = a.blocks.concat(b.blocks);
      const hs = measureDense(together, tpl, pal);
      const cap = Math.floor((denseMaxHeight(tpl, pal) || 1124) * 0.96);
      const total = hs ? hs.reduce((x, y) => x + y, 0) : Infinity;
      if (total <= cap) {
        pages.splice(k, 2, { role: 'dense', blocks: together });
        merged = true;
        break;
      }
    }
    if (!merged) {
      const dropped = pages.pop();
      truncated += charSum(dropped.blocks);
    }
  }
  Object.defineProperty(pages, 'truncated', { value: truncated, enumerable: false });
  /* 自检条要写「手动分页符 X 处」（design §12.3 规则③） */
  Object.defineProperty(pages, 'manualBreaks', { value: manualBreaks, enumerable: false });
  return pages;
}

/* ── 单页渲染（7 角色）────────────────────────────────────────────── */

function styleVars(pal) {
  /* 长文一次只出 3:4（design §6.0 原则 4），几何常量固定 */
  return '--paper:' + pal.paper + ';--paper2:' + pal.paper2 + ';--ink:' + pal.ink +
    ';--muted:' + pal.muted + ';--accent:' + pal.accent + ';--accentText:' + (pal.at || pal.accent) +
    ';--line:' + pal.line + ';--hl:' + pal.hl + ';--grain:' + pal.grain +
    ';--cw:1080px;--ch:1440px;--k:1;--fs:52px;--pgap:43px;';
}

/** 单页 .card 内部 HTML（含模板页眉页脚）。7 角色渲染器，搬自原型 longBody/longCard。
 *
 *  design §12.4/§12.5/§12.2 三项增强都在这里收口：
 *    · pn=false      省略页脚页码（closing 的超大装饰数字与页眉不受影响）
 *    · sign 非空     页脚追加 `@签名`，沿用模板页脚字号与颜色
 *    · bg 非空       内页铺背景图 + 纸色 85% 蒙层（z 序：图 → 蒙层 → 装饰 → 文字）
 *                    封面永远不铺（封面底图是 image 参数，另一个维度） */
export function cardInner({ role, blocks = [], tpl, pal, index = 0, total = 1,
  title = '', sub = '', author = '', image = '', pn: showPn = true, sign = '', bg = '' }) {
  const st = pal;
  const vars = styleVars(st);
  const swiss = (!tpl.palette && st.fam === 'swiss') ? ' swiss' : '';
  const ttlBlock = blocks.find((b) => /^h[1-4]$/.test(b.type));
  const ttl = ttlBlock ? ttlBlock.text : '';
  const head = tpl.head ? tpl.head() : '';
  const foot = tpl.foot ? tpl.foot(index, total, { pn: showPn, sign }) : '';

  /* 内页背景图（design §12.2）：只给内页，且只在支持背景的模板上。
     85% 纸色蒙层 —— 内页是 52px 大面积正文，没法像封面那样只压文字带；
     不抄竞品「原样铺满不参与压暗」，那等于把可读性交给运气。
     z 序：bg(0) → mask(1) → grain(3) → 模板装饰(1/2) → 文字(4)。
     ⚠️ 蒙层用 paper 色而非黑色：黑蒙层会把暖色模板洗成灰雾（§5 铁律 1 的坑）。 */
  const bgLayer = (role !== 'cover' && bg && tplSupportsBg(tpl.id))
    ? `<img class="lt-bg" src="${bg}" alt="" aria-hidden="true">
    <div class="lt-bg-mask" style="background:${st.paper};opacity:.85"></div>`
    : '';

  let bodyInner = '';
  if (role === 'cover') {
    const haveImg = !!image;
    const kick = esc(pal.name || tpl.name);
    const img = haveImg ? `<img class="lt-cover-img" src="${image}" alt="">` : '';
    bodyInner = `<div class="body r-cover${haveImg ? ' has-img' : ''}">
      ${img}
      <div class="lt-cover-inner">
        <p class="lt-cover-kick">${kick}</p>
        <h1 class="lt-cover-ttl">${esc(title)}</h1>
        ${sub ? `<p class="lt-cover-sub">${esc(sub)}</p>` : ''}
      </div>
    </div>`;
  } else if (role === 'opening') {
    const all = blocks.filter((b) => b.text);
    const lead = all[0] ? all[0].text : '';
    const rest = all.slice(1).map((b) => b.text).join(' ');
    bodyInner = `<div class="body r-opening">
      <div class="rule"></div>
      <p class="lead">${inlineMd(lead)}</p>
      ${rest ? `<p class="sub">${inlineMd(rest)}</p>` : ''}
      ${author ? `<div class="sign">— ${esc(author)}</div>` : ''}
    </div>`;
  } else if (role === 'quote') {
    const q = blocks.find((b) => b.type === 'quote');
    const rest = blocks.filter((b) => b !== q && b.text);
    const qt = q ? q.text : (blocks[0] ? blocks[0].text : '');
    const ctxTxt = rest.map((b) => b.text).join(' ');
    bodyInner = `<div class="body r-quote">
      <div class="qbg">&ldquo;</div>
      <div class="qmark">&ldquo;</div>
      <p class="qt">${inlineMd(qt)}</p>
      <div class="qrule"></div>
      ${ctxTxt ? `<p class="qctx">${inlineMd(ctxTxt)}</p>` : ''}
      <div class="qsign">— 摘自正文</div>
    </div>`;
  } else if (role === 'points') {
    const items = blocks.filter((b) => b.type === 'li');
    const others = blocks.filter((b) => b !== ttlBlock && (b.type === 'p' || b.type === 'quote'));
    const rows = items.map((b, i) =>
      `<div class="row"><span class="n">${String(i + 1).padStart(2, '0')}</span><span class="t">${inlineMd(b.text)}</span></div>`).join('');
    const intro = others.map((b) => `<p class="pintro">${inlineMd(b.text)}</p>`).join('');
    bodyInner = `<div class="body r-points">
      <div class="big-num">${String(items.length || 1).padStart(2, '0')}</div>
      ${ttl ? `<p class="ttl">${inlineMd(ttl)}</p>` : ''}
      ${intro}
      <div class="rows">${rows}</div>
    </div>`;
  } else if (role === 'steps') {
    const steps = blocks.filter((b) => b.type === 'step');
    const flow = steps.map((b, i) =>
      `<div class="step"><div class="sn">${String(i + 1).padStart(2, '0')}</div>
      <div class="sc"><p class="st">${inlineMd(b.title)}</p>${b.desc ? `<p class="sd">${inlineMd(b.desc)}</p>` : ''}</div></div>`).join('');
    bodyInner = `<div class="body r-steps">${ttl ? `<p class="ttl">${inlineMd(ttl)}</p>` : ''}<div class="flow">${flow}</div></div>`;
  } else if (role === 'closing') {
    const all = blocks.filter((b) => b.text);
    const ct = all.length ? all[all.length - 1].text : '';
    const cd = all.length > 1 ? all.slice(0, -1).map((b) => b.text).join(' ') : '';
    const cta = author ? `关注 ${author}` : '关注 SuperSu';
    bodyInner = `<div class="body r-closing">
      <div class="cbg">${String(blocks.length).padStart(2, '0')}</div>
      <div class="rule"></div>
      <p class="ct">${inlineMd(ct)}</p>
      ${cd ? `<p class="cd">${inlineMd(cd)}</p>` : ''}
      <div class="cta">${esc(cta)}</div>
    </div>`;
  } else {
    /* dense（正文）*/
    const rest = blocks.filter((b) => b !== ttlBlock);
    const withBlocks = rest.map((b, i) => {
      if (b.type === 'p') return `<p${i === 0 ? ' class="drop"' : ''}>${inlineMd(b.text)}</p>`;
      if (/^h[12]$/.test(b.type)) return `<p class="h2">${inlineMd(b.text)}</p>`;
      if (/^h[34]$/.test(b.type)) return `<p class="h3">${inlineMd(b.text)}</p>`;
      if (b.type === 'quote') return `<p><em>${inlineMd(b.text)}</em></p>`;
      if (b.type === 'li') return `<p>· ${inlineMd(b.text)}</p>`;
      if (b.type === 'step') return `<p><strong>${inlineMd(b.title)}</strong>${b.desc ? '：' + inlineMd(b.desc) : ''}</p>`;
      return '';
    }).join('');
    bodyInner = `<div class="body r-dense">${ttl ? `<p class="ttl">${inlineMd(ttl)}</p>` : ''}${withBlocks}</div>`;
  }

  return `<div class="card ${tpl.cls}${swiss}" style="${vars}">
    ${bgLayer}
    <div class="grain"></div>
    ${head ? `<div class="lh">${head}</div>` : ''}
    ${bodyInner}
    <div class="lf">${foot}</div>
  </div>`;
}

/** 单页 → 自包含 HTML 文档（#xhs-cover 契约，story.js 拿去 iframe 截图）。
 *  ⚠️ 卡片本身必须带 id="xhs-cover"：render.js 的截图管线按这个 id 找节点，
 *  story.js 复用同一契约。只给 body 挂 id 会让截图端找不到节点（实测踩过）。 */
export function pageDoc(opts) {
  const inner = cardInner(opts).replace(/^<div class="card /, '<div id="xhs-cover" class="card ');
  const fonts = opts.baseUrl ? `<link rel="stylesheet" href="${opts.baseUrl}fonts/cover-fonts.css">` : '';
  return `<!doctype html>
<html lang="zh-CN"><head><meta charset="utf-8"><title>封面</title>
${fonts}
<style>
${cardCss('')}
html,body{margin:0;padding:0;background:var(--paper, #fff)}
</style></head>
<body>${inner}</body></html>`;
}

/** 单页内容超出时整体等比缩小（CSS zoom，布局级缩放）。
 *  ⚠️ 不能用 transform:scale —— 它只缩视觉，body 盒子跟着缩，可用高也缩，
 *  「内容视觉高 = used·k」永远对不上「body 视觉高 = avail·k」（原型连踩三次的坑）。
 *  也不能改字号 —— 开篇/金句的字号是设计的一部分。 */
export function fitOverflowCards(rootEl) {
  (rootEl || document).querySelectorAll('#cv-cards-root .card .body, .cv-cards-scope .card .body').forEach((body) => {
    body.style.zoom = '';
    const rect = body.getBoundingClientRect();
    const avail = rect.height;
    let contentBottom = rect.top;
    [...body.children].forEach((c) => {
      if (getComputedStyle(c).position === 'absolute') return;
      const r = c.getBoundingClientRect();
      if (r.height > 0) contentBottom = Math.max(contentBottom, r.bottom);
    });
    const used = contentBottom - rect.top;
    if (used <= avail + 1) return;
    let k = Math.max(0.4, (avail / used) * 0.99);
    for (let i = 0; i < 8; i++) {
      body.style.zoom = k;
      const r2 = body.getBoundingClientRect();
      let bot = r2.top;
      [...body.children].forEach((c) => {
        if (getComputedStyle(c).position === 'absolute') return;
        const cr = c.getBoundingClientRect();
        if (cr.height > 0) bot = Math.max(bot, cr.bottom);
      });
      if (bot - r2.top <= r2.height - 1) break;
      k *= 0.98;
    }
  });
}
