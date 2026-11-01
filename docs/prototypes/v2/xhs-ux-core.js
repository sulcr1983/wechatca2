/* ══════════════════════════════════════════════════════════════════════
   xhs-ux-core.js —— 三版对比原型共用的渲染内核
   ─────────────────────────────────────────────────────────────────────
   从 docs/prototypes/xhs-canvas-ux.html 抽出来的同一份代码（不是重写），
   保证三版画的是完全一样的封面 —— 对比的只有「布局」，不是「渲染质量」。
   改动请改这个文件，三版同时生效。
   ══════════════════════════════════════════════════════════════════════ */

/* 三版共用可变状态：用内核里原有的 state 声明（它已是超集），各版只改字段 */
const SIZES = {
  xhs:    { w:1080, h:1440, label:'3:4',   hint:'1080×1440' },
  square: { w:1080, h:1080, label:'1:1',   hint:'1080×1080' },
  wide:   { w:2100, h:900,  label:'21:9',  hint:'2100×900'  },
};

/* ── 8 套色板（值取自 docs/design-xhs-studio-redesign.md §11.6 全表）
      accent 只用于色块/细线；文字一律 accentText —— 柠檬黄当字只有 1.35:1 */
const PALS = [
  { key:'dune',     name:'沙丘暖纸', paper:'#f0e6d2', ink:'#1f1a14', muted:'#6f6557',
    accent:'#8f7650', accentText:'#6b5334', line:'rgba(31,26,20,.20)', dark:false },
  { key:'forest',   name:'森林墨绿', paper:'#f5f1e8', ink:'#16211b', muted:'#5c6a60',
    accent:'#2e6b4f', accentText:'#2e6b4f', line:'rgba(22,33,27,.18)', dark:false },
  { key:'indigo',   name:'靛蓝瓷白', paper:'#f2f4f5', ink:'#161c26', muted:'#5b6675',
    accent:'#315d93', accentText:'#315d93', line:'rgba(22,28,38,.16)', dark:false },
  { key:'kraft',    name:'牛皮纸',   paper:'#eedfc7', ink:'#241c12', muted:'#6b5b42',
    accent:'#9b5a2e', accentText:'#7c4520', line:'rgba(36,28,18,.22)', dark:false },
  { key:'midnight', name:'午夜墨金', paper:'#0e0d0c', ink:'#f0e9db', muted:'#9a917f',
    accent:'#d4a04a', accentText:'#d4a04a', line:'rgba(240,233,219,.16)', dark:true },
  { key:'ikb',      name:'克莱因蓝', paper:'#fafaf8', ink:'#111111', muted:'#6b6b66',
    accent:'#002FA7', accentText:'#002FA7', line:'rgba(17,17,17,.16)', dark:false },
  /* accent 是 #C5E803（黄绿），真实产品里这套叫「柠檬绿」；
     和 lemon2 的柠檬黄 #FFD500 是两套不同色板，名字不能一样（否则配色行出现两个「柠檬黄」） */
  { key:'lemon',    name:'柠檬绿',   paper:'#fafaf8', ink:'#111111', muted:'#6b6b66',
    accent:'#C5E803', accentText:'#4F5A00', line:'rgba(17,17,17,.16)', dark:false },
  { key:'orange',   name:'安全橙',   paper:'#fafaf8', ink:'#111111', muted:'#6b6b66',
    accent:'#FF6B35', accentText:'#A6390A', line:'rgba(17,17,17,.16)', dark:false },
  /* 以下 5 组来自 catalog.js 的 LAYOUT_PALETTES / TEMPLATE_STYLES，
     是现有产品的正式色板（不是我编的），值照抄。 */
  { key:'paper',   name:'暖纸',     paper:'#f4efe4', ink:'#1c1a16', muted:'#6f6a5f',
    accent:'#b4552f', accentText:'#8f3f1f', line:'rgba(28,26,22,.18)', dark:false },
  { key:'ink',     name:'墨夜',     paper:'#12110f', ink:'#f0e9db', muted:'#9a917f',
    accent:'#d8a24a', accentText:'#d8a24a', line:'rgba(240,233,219,.16)', dark:true },
  { key:'bold',    name:'亮橙',     paper:'#fff7ee', ink:'#141110', muted:'#7a6f62',
    accent:'#ff3b1f', accentText:'#c22a12', line:'rgba(20,17,16,.16)', dark:false },
  { key:'classic', name:'经典墨色', paper:'#f3f0e8', ink:'#111111', muted:'#6b6459',
    accent:'#111111', accentText:'#111111', line:'rgba(17,17,17,.18)', dark:false },
  { key:'lemon2',  name:'柠檬黄',   paper:'#fafaf8', ink:'#111111', muted:'#6b6b66',
    accent:'#FFD500', accentText:'#7A6400', line:'rgba(17,17,17,.16)', dark:false },
  /* ══════ 多巴胺配色（2026-11-01 新增）══════
     用户反馈：默认全是淡黄纸色，太单调。这 10 套是高饱和「跳色」，
     accent 一律给足饱和度，paper 保持浅到能压黑字（深底两套反过来）。
     accentText 是 accent 的深版 —— 小字/编号用它才能在浅底上读得清。 */
  { key:'peach',    name:'蜜桃粉', paper:'#FFF1F4', ink:'#1B1216', muted:'#8A6B74',
    accent:'#FF4D6D', accentText:'#C2183C', line:'rgba(27,18,22,.14)', dark:false },
  { key:'electric', name:'电光蓝', paper:'#F2F5FF', ink:'#0E1330', muted:'#5C6485',
    accent:'#2D5BFF', accentText:'#1B3BC4', line:'rgba(14,19,48,.14)', dark:false },
  { key:'mint',     name:'薄荷绿', paper:'#F0FFF9', ink:'#0B1F19', muted:'#5A7A70',
    accent:'#00C48C', accentText:'#00795A', line:'rgba(11,31,25,.14)', dark:false },
  { key:'citrus',   name:'柑橘橙', paper:'#FFF8E8', ink:'#20160A', muted:'#7A6647',
    accent:'#FF7A00', accentText:'#B24E00', line:'rgba(32,22,10,.14)', dark:false },
  { key:'grape',    name:'葡萄紫', paper:'#F7F1FF', ink:'#170F26', muted:'#6B5B85',
    accent:'#7B4DFF', accentText:'#4E24C4', line:'rgba(23,15,38,.14)', dark:false },
  { key:'acid',     name:'酸性黄', paper:'#FAFFD8', ink:'#161A05', muted:'#6B7245',
    accent:'#A8C400', accentText:'#5F7000', line:'rgba(22,26,5,.16)', dark:false },
  { key:'tomato',   name:'番茄红', paper:'#FFF2F0', ink:'#1F0E0B', muted:'#7A574F',
    accent:'#FF3B30', accentText:'#B81E15', line:'rgba(31,14,11,.14)', dark:false },
  { key:'sky',      name:'天光青', paper:'#F0FAFF', ink:'#0A1A24', muted:'#5B7A8A',
    accent:'#0EA5E9', accentText:'#0369A1', line:'rgba(10,26,36,.14)', dark:false },
  { key:'neon',     name:'夜霓青', paper:'#101018', ink:'#F2F4FF', muted:'#8B90A8',
    accent:'#22D3EE', accentText:'#22D3EE', line:'rgba(242,244,255,.16)', dark:true },
  { key:'magenta',  name:'品红夜', paper:'#1A0E18', ink:'#FFE9F6', muted:'#A87E97',
    accent:'#FF2DAF', accentText:'#FF2DAF', line:'rgba(255,233,246,.16)', dark:true },
];
const palOf = (k) => PALS.find(p => p.key === k) || PALS[0];

/* ── 版式：needImg 决定「不要图」时是否可选 —— 这是本方案的一条硬规则 ── */
/* pals：这张版式支持哪些色板 —— 与 catalog.js 的 members 同口径。
   色板是**版式的属性**，不是全局开关：杂志模板 6 套专属配色、瑞士模板 4 套强调色，
   混成一个全局列表就丢了「这套版式本来长什么样」。 */
const LAYS = [
  /* ══════ 第一组：现有产品 7 张（catalog.js 的 LAYOUTS，顺序不动）══════
     magazine-tpl / swiss-tpl 已并入对应主卡（同骨架只换色板，视为重复）。 */
  { id:'image-led', name:'图文封面', code:'M16', desc:'标题压在图上，最像小红书爆款', needImg:true,  group:'exist', pals:['dune','paper','ink','bold','sky'] },
  /* ⚠️ pals[0] 就是这张卡「默认」用的色板，也决定缩略图第一眼什么颜色。
     原来全是 paper/bold/dune（米黄纸），22 张缩略图摆在一起像一堵土墙 ——
     用户原话「默认的颜色，都是淡黄色，不够好看」。
     现在每张卡的默认色都换成一个有性格的颜色，纸色系退到第二、三位。 */
  { id:'magazine',  name:'杂志封面', code:'M01', desc:'衬线大标题贴底 · 6 套官方配色', needImg:true,  group:'exist',
    pals:['forest','dune','indigo','classic','kraft','midnight'] },
  { id:'quote',     name:'金句',    code:'M04', desc:'居中大字 + 署名，适合观点',    needImg:false, group:'exist', pals:['grape','paper','ink','bold','peach'] },
  { id:'bigtype',   name:'大字版',  code:'—',   desc:'纯文字大字，不用底图也成立',   needImg:false, group:'exist', pals:['tomato','bold','acid'] },
  { id:'list',      name:'清单',    code:'M05', desc:'编号条目，干货与推荐',         needImg:false, group:'exist', pals:['electric','paper','ink','bold'] },
  { id:'number',    name:'编号大字', code:'S09', desc:'超大编号当主视觉',            needImg:false, group:'exist', pals:['citrus','paper','ink','bold'] },
  { id:'swiss',     name:'瑞士封面', code:'S01', desc:'白纸细体大字 · 4 套强调色',    needImg:false, group:'exist',
    pals:['ikb','lemon','lemon2','orange'] },

  /* ══════ 第二组：配方版式（references/layout-recipes.md）══════
     id 后面跟的是配方编号，卡片上会露出一角，方便对照原配方。
     这 15 套替换了上一轮我自己编的 15 套（左右分栏/卡片浮层/网格纸…）。 */

  /* 图文类 */
  { id:'field-note',    name:'纪实照片', code:'M02', desc:'大图 + 底部说明带 + 一句要点', needImg:true,  group:'new', pals:['dune','kraft','paper'] },
  { id:'essay-split',   name:'左右分栏', code:'M03', desc:'左大标题，右 2–3 段，中间细线', needImg:true,  group:'new', pals:['paper','classic','dune'] },
  { id:'evidence-wall', name:'证据墙',  code:'M06', desc:'2×2 图墙 + 一句判读',        needImg:true,  group:'new', pals:['paper','classic','kraft'] },
  { id:'feature',       name:'实证特写', code:'M10', desc:'大图占一半 + 底部 3 条要点',  needImg:true,  group:'new', pals:['paper','ink','dune'] },
  { id:'atmos-thesis',  name:'氛围论点', code:'M09', desc:'墨流底 + 一句大论点',        needImg:true,  group:'new', pals:['ink','midnight','indigo'] },
  { id:'marginalia',    name:'页边批注', code:'M11', desc:'主栏正文 + 窄边栏关键词',    needImg:true,  group:'new', pals:['paper','classic','kraft'] },
  { id:'matrix',        name:'主数字矩阵', code:'S12', desc:'8 格矩阵 + 底部一个主数字', needImg:true,  group:'new', pals:['paper','ikb','ink'] },

  /* 纯文字类 */
  { id:'closing-note',  name:'收尾寄语', code:'M07', desc:'大标题 + 4 条账本 + 收尾句', needImg:false, group:'new', pals:['paper','ink','classic'] },
  { id:'tall-ledger',   name:'长账本',  code:'M08', desc:'左编号右标题的 4–6 条清单',  needImg:false, group:'new', pals:['paper','ink','bold'] },
  { id:'section-divider', name:'章节分隔', code:'M12', desc:'Act II + 3–6 字大标题',   needImg:false, group:'new', pals:['paper','ink','classic'] },
  { id:'hero-question', name:'大问句',  code:'M13', desc:'三行问句占满整页',          needImg:false, group:'new', pals:['paper','ink','midnight'] },
  { id:'pipeline',      name:'竖排流程', code:'M14', desc:'3–4 步竖排，每步一行说明',  needImg:false, group:'new', pals:['paper','classic','ikb'] },
  { id:'before-after',  name:'前后对比', code:'M15', desc:'上下两块：旧做法 vs 新做法', needImg:false, group:'new', pals:['paper','ink','bold'] },
  { id:'two-signals',   name:'双信号',  code:'S02', desc:'两个大块，一实一虚做对比',  needImg:false, group:'new', pals:['paper','ink','ikb'] },
  { id:'data-layer',    name:'数据层',  code:'S03', desc:'对象块 + 3 条属性，强 mono', needImg:false, group:'new', pals:['paper','ink','ikb'] },
  { id:'image-hero',    name:'图像主角', code:'S08', desc:'图铺满 + 覆盖块标题 + 3 个数字', needImg:true,  group:'new', pals:['ink','midnight','paper'] },
  { id:'takeaway',      name:'要点账本', code:'S07', desc:'大标题 + 3 行要点，深底收尾',   needImg:false, group:'new', pals:['ink','midnight','classic'] },
  { id:'warning',       name:'警示清单', code:'S05', desc:'3 条「不要这样做」，左侧色条',  needImg:false, group:'new', pals:['orange','bold','paper'] },
  { id:'kpi-tower',     name:'数字塔',  code:'S09', desc:'4 组数字 + 高低柱，数据感',    needImg:false, group:'new', pals:['paper','ikb','electric'] },
];
/* ══ 多巴胺扩容 ══
   用户原话「颜色比较单调啊，默认的淡黄色，多巴胺颜色也要多搞搞」。
   每条版式在原有推荐色板之后自动追加 2 套高饱和配色（按索引轮转，分布不重样）：
   这样「配色」行里永远有几个跳的颜色，而不是清一色纸黄。
   轮转步长取 3，是为了让相邻版式不会拿到同一对颜色（22 张卡 × 2 = 44 次取色）。 */
const DOPAMINE = ['peach','electric','mint','citrus','grape','acid','tomato','sky','neon','magenta'];
LAYS.forEach((l, i) => {
  const add = [DOPAMINE[i % DOPAMINE.length], DOPAMINE[(i + 3) % DOPAMINE.length]];
  l.pals = [...new Set([...(l.pals || []), ...add])];
});

const layOf = (id) => LAYS.find(l => l.id === id) || LAYS[0];

/* ── 字体 / 文字玩法（与 textmode.js 的目录同口径，玩法只留 3 档）── */
/* 字体 10 款，全部 SIL OFL 1.1 / 免费商用。
   file 非空 = 可选字体，**选中才注入 @font-face**（每款 0.4–1.7MB，
   全量 6.5MB，不按需就是灾难；与 pwa/src/cover/textmode.js 的策略一致）。 */
const FONTS = [
  { id:'auto',   name:'跟随',   family:"'Noto Serif SC'", note:'跟随版式', file:null },
  { id:'sans',   name:'黑体',   family:"'Noto Sans SC'",  note:'中性现代', file:null },
  { id:'serif',  name:'宋体',   family:"'Noto Serif SC'", note:'衬线书卷', file:null },
  { id:'smiley', name:'得意黑', family:"'Smiley Sans'",   note:'窄斜胶囊，封面常用', file:'smiley-sans-oblique.woff2' },
  { id:'wenkai', name:'文楷',   family:"'LXGW WenKai'",   note:'手写楷体，温润', file:'wenkai.woff2' },
  { id:'zcool-kuaile',  name:'快乐体', family:"'ZCOOL KuaiLe'",  note:'圆润活泼', file:'zcool-kuaile.woff2' },
  { id:'zcool-xiaowei', name:'小薇',   family:"'ZCOOL XiaoWei'", note:'清秀细宋', file:'zcool-xiaowei.woff2' },
  { id:'mashanzheng',   name:'马善政', family:"'Ma Shan Zheng'", note:'毛笔书法', file:'mashanzheng.woff2' },
  { id:'longcang',      name:'龙藏',   family:"'Long Cang'",     note:'手写随性', file:'longcang.woff2' },
  { id:'zhimangxing',   name:'志莽',   family:"'Zhi Mang Xing'", note:'行草连笔', file:'zhimangxing.woff2' },
];
const fontOf = (id) => FONTS.find(f => f.id === id) || FONTS[0];

/* 可选字体按需注入。原型里字体与 pwa 同目录（public/fonts/cover）。 */
const FONT_BASE = '../../pwa/public/fonts/cover/';
const _injected = new Set();
function ensureFont(id) {
  const f = fontOf(id);
  if (!f.file || _injected.has(f.id)) return;
  _injected.add(f.id);
  const st = document.createElement('style');
  st.textContent = `@font-face{font-family:${f.family};font-style:normal;font-display:swap;`
    + `src:url("${FONT_BASE}${f.file}") format('woff2')}`;
  document.head.appendChild(st);
  // 显式触发下载：画布是 innerHTML 重绘，不预热会先看到回退字体再闪成目标字体
  if (document.fonts && document.fonts.load) document.fonts.load(`48px ${f.family}`).catch(() => {});
}
/* 7 种，与 pwa/src/cover/textmode.js 的 TEXT_MODES 同口径。
   原项目就有 7 种，我在第一版方案里砍到 3 种 —— 砍错了，这是差异化能力。 */
const TMODES = [
  { id:'stack',    name:'默认',     note:'沿用版式原本的排法' },
  { id:'poster',   name:'大字压阵', note:'字号撑到极限' },
  { id:'vertical', name:'竖排',     note:'中式古典' },
  { id:'offset',   name:'错位',     note:'逐字高低错落' },
  { id:'rainbow',  name:'逐字变色', note:'每字一色' },
  { id:'outline',  name:'描边',     note:'空心字，透底色' },
  { id:'stagger',  name:'错行',     note:'相邻行左右错开' },
];

/* ── 照片：亮度分析在运行时真算（缩到 108×144 画进 canvas，逐带取 mean/sd）── */
const PHOTOS = [
  { id:'p1', name:'海边雾晨', src:'../../public/images/09-snow-bike.jpg'  },
  { id:'p2', name:'山野秋千', src:'../../public/images/05-swing.jpg'      },
  { id:'p3', name:'夜街路灯', src:'../../public/images/02-night-street.jpg' },
  { id:'p4', name:'桌灯',     src:'../../public/images/06-desk-lamp.jpg'  },
  { id:'p5', name:'校车',     src:'../../public/images/03-school-bus.jpg' },
  { id:'p6', name:'收音机',   src:'../../public/images/07-radio.jpg'      },
];
const photoOf = (id) => PHOTOS.find(p => p.id === id) || PHOTOS[0];

/* ── 状态 ── */
const state = {
  mode:'title',          // title | long
  size:'xhs',
  pal:'dune',
  lay:'image-led',
  font:'auto',
  tmode:'stack',
  vpos:'auto',           // auto | top | mid | bottom
  frost:false,           // 磨砂（强制压暗）
  imgMode:'search',      // search | upload | color
  photo:'p1',
  photos:[],             // 搜索结果（原型里直接用本地 6 张）
  text:'',
  // 长文
  longText:'',
  tpl:'editorial',
  page:0,
  pages:[],
  pn:true,
  sign:'',
};
const analysisCache = new Map();

/* ══════════════════════════════════════════════════════════════════════
   1. 工具
   ══════════════════════════════════════════════════════════════════════ */
const esc = (s) => String(s).replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const chars = (s) => [...String(s)];
const now = () => performance.now();

function toast(msg, err) {
  const t = $('toast');
  t.textContent = msg;
  t.className = 'toast on' + (err ? ' err' : '');
  clearTimeout(toast._t);
  toast._t = setTimeout(() => { t.className = 'toast' + (err ? ' err' : ''); }, 2400);
}

/* 标题自适应：按字数反算字号，宁降字号也不让标题爆版 */
function fitTitle(text, boxW, base, maxLines = 3) {
  const n = Math.max(1, chars(text).length);
  for (let size = base; size > base * 0.55; size -= 2) {
    const cpl = Math.max(1, Math.floor(boxW / size));
    if (Math.ceil(n / cpl) <= maxLines) return size;
  }
  return Math.round(base * 0.55);
}
/* 小字换行估算（用于算文字带高度） */
const subLines = (text, boxW, size) => Math.max(1, Math.ceil(chars(text).length / Math.max(1, Math.floor(boxW / (size * 0.96)))));

/* ══════════════════════════════════════════════════════════════════════
   2. 底图可读性：与 analyze.js 同口径（sRGB 空间反解 α，封顶 0.30，busy 优先）
   ══════════════════════════════════════════════════════════════════════ */
const toLin = (c) => { c /= 255; return c <= 0.04045 ? c / 12.92 : Math.pow((c + 0.055) / 1.055, 2.4); };
const invLin = (L) => 255 * (L <= 0.0031308 ? L * 12.92 : 1.055 * Math.pow(L, 1 / 2.4) - 0.055);
const relLum = (r, g, b) => 0.2126 * toLin(r) + 0.7152 * toLin(g) + 0.0722 * toLin(b);
const SCRIM_SRGB = 10;
const MAX_ALPHA = 0.30;
const NEED_CR = 4.5;
const BUSY_SD = 0.15;

function alphaForL(L) {
  const sMax = invLin(L);
  const targetS = invLin(0.1833);      // 白字达 4.5:1 所需的底亮度上限
  return Math.max(0, (sMax - targetS) / Math.max(1, sMax - SCRIM_SRGB));
}
function scrimmedLum(L, a) {
  if (a <= 0) return L;
  const s = invLin(L);
  return toLin(s * (1 - a) + SCRIM_SRGB * a);
}
const contrast = (a, b) => (Math.max(a, b) + 0.05) / (Math.min(a, b) + 0.05);
const INK_DARK = relLum(28, 26, 22);
const WHITE = 1;

/* 逐带实测：把图缩到 108×144 画进 canvas，按 10 带算 mean / sd */
async function analyze(src) {
  if (analysisCache.has(src)) return analysisCache.get(src);
  const p = new Promise((resolve, reject) => {
    const img = new Image();
    img.onload = () => {
      const W = 108, H = 144;
      const cv = document.createElement('canvas');
      cv.width = W; cv.height = H;
      const cx = cv.getContext('2d', { willReadFrequently:true });
      // 按 object-fit:cover 居中裁切
      const ir = img.width / img.height, cr = W / H;
      let sw = img.width, sh = img.height, sx = 0, sy = 0;
      if (ir > cr) { sw = img.height * cr; sx = (img.width - sw) / 2; }
      else { sh = img.width / cr; sy = (img.height - sh) / 2; }
      cx.drawImage(img, sx, sy, sw, sh, 0, 0, W, H);
      const d = cx.getImageData(0, 0, W, H).data;
      const bands = [], sds = [];
      for (let b = 0; b < 10; b++) {
        const y0 = Math.floor(b * H / 10), y1 = Math.floor((b + 1) * H / 10);
        let sum = 0, sum2 = 0, n = 0, max = 0, min = 1;
        for (let y = y0; y < y1; y++) {
          for (let x = 0; x < W; x++) {
            const i = (y * W + x) * 4;
            const L = relLum(d[i], d[i + 1], d[i + 2]);
            sum += L; sum2 += L * L; n++;
            if (L > max) max = L;
            if (L < min) min = L;
          }
        }
        const mean = sum / n;
        bands.push(+mean.toFixed(4));
        sds.push(+Math.sqrt(Math.max(0, sum2 / n - mean * mean)).toFixed(4));
      }
      resolve({ bands, sds });
    };
    img.onerror = () => reject(new Error('图片加载失败'));
    img.src = src;
  });
  const r = await p;
  analysisCache.set(src, r);
  return r;
}

/* 四种判定（顺序硬性：先什么都不做 → 再试黑字 → 最后才压暗） */
function judge(an, zone) {
  const i0 = Math.max(0, Math.floor(zone[0] * 10));
  const i1 = Math.min(9, Math.ceil(zone[1] * 10) - 1);
  let maxL = 0, minL = 1, sd = 0, mean = 0, n = 0;
  for (let i = i0; i <= i1; i++) {
    maxL = Math.max(maxL, an.bands[i]);
    minL = Math.min(minL, an.bands[i]);
    sd = Math.max(sd, an.sds[i]);
    mean += an.bands[i]; n++;
  }
  mean /= Math.max(1, n);
  const busy = sd > BUSY_SD;
  const whiteCR = contrast(WHITE, maxL);
  const blackCR = contrast(minL, INK_DARK);
  if (!busy && whiteCR >= NEED_CR) return { ink:'#fff', alpha:0, verdict:'免压暗', cr:whiteCR, busy };
  if (!busy && blackCR >= NEED_CR) return { ink:'#1f1a14', alpha:0, verdict:'免压暗', cr:blackCR, busy };
  const a = alphaForL(maxL);
  if (!busy && a <= MAX_ALPHA) return { ink:'#fff', alpha:a, verdict:'轻压暗', cr:contrast(WHITE, scrimmedLum(maxL, a)), busy };
  return { ink:'#fff', alpha:0, verdict:'建议换版式', cr:whiteCR, busy, unfit:true };
}

/* ══════════════════════════════════════════════════════════════════════
   3. 标题图渲染器
   ══════════════════════════════════════════════════════════════════════ */
/* ══════════════════════════════════════════════════════════════════════
   实心色块上的文字色 —— 照抄 pwa/src/cover/templates.js: inkForAccent()
   ──────────────────────────────────────────────────────────────────────
   为什么必须有：一套色板的 accent 亮度差极大 ——
     克莱因蓝 #002FA7 很暗 → 必须白字
     酸性黄 #A8C400 / 柠檬黄 #FFD500 很亮 → 必须黑字
   之前所有「压在主色块上的字」都写成固定 `pal.paper`（近白），
   碰上亮色 accent 就是白字压亮黄，直接看不见（用户原话「很多文字都看不清了」）。
   这不是新问题：templates.js 在 2026-10-25 就用 WCAG 相对亮度解决过，
   原型里只是没把这段搬过来。
   ══════════════════════════════════════════════════════════════════════ */
function inkOn(hex) {
  const m = /^#?([0-9a-f]{6})$/i.exec(String(hex || '').trim());
  if (!m) return '#ffffff';
  const n = parseInt(m[1], 16);
  const toLin = (c) => {
    const v = c / 255;
    return v <= 0.04045 ? v / 12.92 : Math.pow((v + 0.055) / 1.055, 2.4);
  };
  const L = 0.2126 * toLin((n >> 16) & 255) + 0.7152 * toLin((n >> 8) & 255) + 0.0722 * toLin(n & 255);
  return L > 0.42 ? '#0a0a0a' : '#ffffff';   // 阈值同 templates.js
}

function artStyle(W, H, pal, extra = '') {
  return `width:${W}px;height:${H}px;`
    + `--paper:${pal.paper};--ink:${pal.ink};--muted:${pal.muted};`
    + `--accent:${pal.accent};--accentText:${pal.accentText};--line:${pal.line};` + extra;
}
/* 文字玩法 → 附加 CSS（只作用于标题，不碰正文） */
/* 标题内容：offset / rainbow 要逐字 span，stagger 要行组，其余原样。
   ⚠️ 逐字 span 必须 display:inline-block，否则中文断行会错乱（textmode.js 同款处理）。 */
function titleHtml(t) {
  const m = state.tmode;
  const cs = chars(t);
  if (m === 'offset' || m === 'rainbow') {
    return cs.map(c => `<span class="ch">${esc(c)}</span>`).join('');
  }
  if (m === 'stagger') {
    const out = [];
    for (let i = 0; i < cs.length; i += 8) out.push(`<span class="ln">${esc(cs.slice(i, i + 8).join(''))}</span>`);
    return out.join('');
  }
  return esc(t);
}

/* 把一段 CSS 的所有选择器加上作用域前缀。
   ⚠️ 必须做：tmodeCss 产出的是裸选择器 `.ttl{writing-mode:vertical-rl}`，
      而同一个页面里同时存在 1 张主画布 + 9 张缩略图。不隔离的话，
      主画布一选「竖排」，9 张版式缩略图会全部跟着竖排 —— 缩略图的唯一职责
      （比较版式）当场失效。实测踩过，缩略图全变成一个样。
   （正式项目里画布跑在 iframe / shadow 里，天然隔离；原型是直接 DOM，必须自己加前缀。） */
function scopeCss(css, sel) {
  if (!css) return '';
  return css.replace(/([^{}]+)\{([^{}]*)\}/g, (m, sels, body) =>
    sels.split(',').map(s => `${sel} ${s.trim()}`).join(',') + '{' + body + '}');
}

function tmodeCss(mode) {
  let css = '';
  if (mode === 'poster') css += '.ttl{line-height:.96 !important;font-weight:900 !important;letter-spacing:-.01em !important}';
  if (mode === 'vertical') css += '.ttl{writing-mode:vertical-rl;text-orientation:upright;line-height:1.15;letter-spacing:.06em;max-height:78%}'
    // 竖排时副标题也得竖着，否则一行横排字横在画布中央，像放错了层
    + '.blk{display:flex;flex-direction:row-reverse;gap:22px;align-items:flex-start;justify-content:center}'
    + '.sub{writing-mode:vertical-rl;text-orientation:upright;margin-top:0 !important;max-height:70%;opacity:.78}'
    + '.auth{margin-top:0 !important;align-self:flex-end}'
    + '.kick{display:none}';
  if (mode === 'outline') css += '.ttl{-webkit-text-stroke:2px currentColor;color:transparent !important;text-shadow:none !important}';
  if (mode === 'offset') css += '.ttl .ch{display:inline-block;transform:translateY(-.09em)}.ttl .ch:nth-child(even){transform:translateY(.09em)}';
  if (mode === 'rainbow') css += '.ttl .ch{display:inline-block}'
    + '.ttl .ch:nth-child(6n+1){color:#D85A30}.ttl .ch:nth-child(6n+2){color:#1D9E75}'
    + '.ttl .ch:nth-child(6n+3){color:#378ADD}.ttl .ch:nth-child(6n+4){color:#BA7517}'
    + '.ttl .ch:nth-child(6n+5){color:#993556}.ttl .ch:nth-child(6n+6){color:#534AB7}';
  if (mode === 'stagger') css += '.ttl .ln{display:block}.ttl .ln:nth-child(even){margin-left:1.15em}';
  return css;
}


/* ══════════════════════════════════════════════════════════════════════
   现有产品的 7 个版式 —— 按真实实现逐项照抄
   ──────────────────────────────────────────────────────────────────────
   来源：pwa/src/cover/layouts.js（image-led / quote / number / list）
         pwa/src/cover/templates.js（magazine / swiss / bigtype 三套归藏）
   规格是**抄的，不是估的**：
     · layouts 四套  PAD=96、kicker mono 22px/字距 .28em 前置 56×2 线、
       标题 96–128px/字重 500–800、foot mono 22px/字距 .18em + 发丝线
     · 归藏三套      editorial 96px/500/.04em（衬线）、swiss 104px/300/-.01em（无衬线）、
       bigtype 148px/800/-.03em
   之前原型里这 7 套是我凭感觉画的，字号、字重、结构都对不上，
   用户一眼就看出「和服务器不是一个风格」。
   ══════════════════════════════════════════════════════════════════════ */
const REAL_LAYS = {
  'image-led': 1, magazine: 1, quote: 1, bigtype: 1, list: 1, number: 1, swiss: 1,
};

const MONO = "ui-monospace,SFMono-Regular,Menlo,monospace";

function dateStamp() {
  const d = new Date();
  return `${d.getFullYear()}.${String(d.getMonth() + 1).padStart(2, '0')}`;
}

/** 「5 个方法」→ 05；「三件小事」→ 03；抽不到给 01（同 layouts.js:pickNumber） */
function pickNumber(t) {
  const m = String(t || '').match(/(\d{1,3})/);
  if (m) return m[1].padStart(2, '0');
  const cn = { 一:'01', 二:'02', 三:'03', 四:'04', 五:'05', 六:'06', 七:'07', 八:'08', 九:'09', 十:'10' };
  const c = String(t || '').match(/[一二三四五六七八九十]/);
  return c ? cn[c[0]] : '01';
}

/** 引语切条目；切不出 ≥2 条就返回空（版式退化为「标题 + 一段引语」） */
function splitItems(lead) {
  const parts = String(lead || '').split(/[·、／/｜|，,；;]+/).map(x => x.trim()).filter(x => x.length >= 2);
  return parts.length >= 2 ? parts.slice(0, 4) : [];
}

function renderReal(W, H, o) {
  const pal = palOf(state.pal);
  const S = W / 1080;
  const PAD = 96 * S;
  const lay = o.lay;
  const t = o.title || '';
  const lead = o.sub || '';
  const auth = o.auth || '';
  const photo = o.photo || '';
  const an = o.an || null;
  const hasImg = !!photo;
  const uid = 'rl' + (renderReal._n = (renderReal._n || 0) + 1);

  // 字体族：layouts 里 quote 用衬线，其余无衬线；归藏的 magazine 衬线，swiss/bigtype 无衬线
  const autoSerif = (lay === 'quote' || lay === 'magazine');
  const famStr = state.font === 'auto'
    ? (autoSerif ? "'Noto Serif SC'" : "'Noto Sans SC'")
    : fontOf(state.font).family.replace(/"/g, "'");

  // 有图时的字色 / 遮罩：沿用原型已有的四档判定（alpha 是按实测亮度反解的）
  const zone = [0.55, 1];
  const v = hasImg ? (an ? judge(an, zone) : { ink:'#fff', alpha:0.26 }) : { ink: pal.ink, alpha:0, verdict:'纯文字' };
  o._verdict = v;                 // 调用方（paint）靠它显示底部判定值，别漏
  const ink = hasImg ? v.ink : pal.ink;
  const subInk = hasImg ? v.ink : pal.muted;
  const scrim = hasImg && v.alpha > 0
    ? `<div class="ly-scrim" style="position:absolute;left:0;right:0;top:52%;bottom:0;z-index:1;pointer-events:none;`
      + `background:linear-gradient(180deg,rgba(12,11,10,0) 0%,rgba(12,11,10,${(v.alpha * 0.35).toFixed(3)}) 46%,`
      + `rgba(12,11,10,${(v.alpha * 0.78).toFixed(3)}) 72%,rgba(12,11,10,${v.alpha.toFixed(3)}) 100%)"></div>`
    : '';
  const imgEl = hasImg
    ? `<img src="${photo}" alt="" style="position:absolute;inset:0;width:100%;height:100%;object-fit:cover;z-index:0">`
    : '';

  const rootStyle = `position:relative;width:${W}px;height:${H}px;overflow:hidden;isolation:isolate;`
    + `background:${pal.paper};color:${pal.ink};font-family:${famStr};`
    + `--paper:${pal.paper};--paper2:${pal.paper2 || pal.paper};--ink:${pal.ink};--muted:${pal.muted};`
    + `--accent:${pal.accent};--accentText:${pal.accentText || pal.accent};`;

  /* 文案必须跟着版式走：清单是「清单 · List」，不是「封面 · Cover」。
     原来写死在函数里，结果清单页顶上印着「封面」，一眼就露馅（实测发现）。 */
  const kicker = (color, size, label = '封面 · Cover') => `<div style="display:inline-flex;align-items:center;gap:${14 * S}px;`
    + `margin:0 0 ${28 * S}px;font:500 ${size * S}px/1 ${MONO};letter-spacing:.28em;`
    + `text-transform:uppercase;color:${color}">`
    + `<span style="display:block;width:${56 * S}px;height:${Math.max(1, 2 * S)}px;background:${pal.accent};flex:none"></span>`
    + `${label}</div>`;

  const foot = (color, size) => `<div style="display:flex;align-items:center;justify-content:space-between;`
    + `gap:${24 * S}px;margin-top:${48 * S}px;padding-top:${22 * S}px;`
    + `border-top:1px solid ${hasImg ? (ink === '#ffffff' ? 'rgba(255,255,255,.34)' : 'rgba(20,17,16,.28)') : 'rgba(128,128,128,.28)'};`
    + `font:400 ${size * S}px/1 ${MONO};letter-spacing:.18em;color:${color}">`
    + `<span>${dateStamp()}</span><span>${auth ? 'By ' + esc(auth) : ''}</span></div>`;

  const h1 = (size, extra) => `<h1 class="ttl" style="margin:0;font-size:${size * S}px;${extra}">${titleHtml(t)}</h1>`;
  const leadEl = (size, extra) => lead
    ? `<div class="sub" style="font-size:${size * S}px;${extra}">${esc(lead)}</div>` : '';

  let inner = '';

  /* ── 1. 图文封面（M16）：有图三点撑开；无图退化为左侧贯穿色带 ── */
  if (lay === 'image-led') {
    if (hasImg) {
      const ts = Math.min(112, fitTitle(t, W - PAD * 2, 112 * S, 3) / S) * S;
      inner = `<div style="position:relative;z-index:2;height:100%;box-sizing:border-box;display:flex;`
        + `flex-direction:column;justify-content:space-between;padding:${PAD}px ${PAD}px ${PAD - 8 * S}px">`
        + kicker(ink, 22)
        + `<div style="padding-bottom:${26 * S}px">${h1(ts / S, `line-height:1.1;letter-spacing:.01em;font-weight:600;color:${ink}`)}`
        + leadEl(30, `line-height:1.68;color:${ink};opacity:.94;margin-top:${30 * S}px;max-width:${760 * S}px`)
        + `</div>${foot(ink, 22)}</div>`;
    } else {
      const ts = Math.min(128, fitTitle(t, W - (PAD + 96 * S) - PAD, 128 * S, 3) / S) * S;
      inner = `<div style="position:absolute;left:0;top:0;bottom:0;width:${150 * S}px;background:${pal.accent};z-index:1"></div>`
        + `<div style="position:absolute;left:${150 * S}px;top:0;bottom:0;width:${10 * S}px;`
        + `background:${pal.paper2 || pal.paper};z-index:1"></div>`
        + `<div style="position:relative;z-index:2;height:100%;box-sizing:border-box;display:flex;`
        + `flex-direction:column;justify-content:space-between;padding:${PAD}px ${PAD}px ${PAD}px ${PAD + 96 * S}px">`
        + kicker(pal.muted, 22)
        + `<div style="padding-bottom:${30 * S}px">${h1(ts / S, `line-height:1.04;font-weight:600;color:${pal.ink}`)}`
        + leadEl(30, `line-height:1.68;color:${pal.muted};margin-top:${30 * S}px;max-width:${700 * S}px`)
        + `</div>${foot(pal.muted, 22)}</div>`;
    }
  }

  /* ── 2. 金句（M04）：居中，衬线，引号当图形 ── */
  else if (lay === 'quote') {
    inner = `<div style="position:relative;z-index:2;height:100%;box-sizing:border-box;display:flex;`
      + `flex-direction:column;justify-content:center;align-items:center;text-align:center;`
      + `padding:${150 * S}px ${130 * S}px;${hasImg ? 'background:rgba(0,0,0,.18)' : ''}">`
      + `<div style="font:400 ${190 * S}px/0.6 Georgia,serif;color:${pal.accent};opacity:.55;height:${96 * S}px">“</div>`
      + h1(100, `line-height:1.34;font-weight:500;letter-spacing:.02em;max-width:${820 * S}px;color:${ink}`)
      + `<div style="width:${76 * S}px;height:${Math.max(2, 3 * S)}px;background:${pal.accent};`
      + `margin:${44 * S}px auto 0;opacity:.85"></div>`
      + leadEl(28, `text-align:center;margin:${34 * S}px auto 0;max-width:${700 * S}px;color:${subInk};line-height:1.7`)
      + (auth ? `<div class="auth" style="margin-top:${52 * S}px;font:400 ${22 * S}px/1 ${MONO};`
        + `letter-spacing:.3em;color:${subInk}">${esc(auth)}</div>` : '')
      + `</div>`;
  }

  /* ── 3. 编号大字：超大编号当主视觉，整块垂直居中 ── */
  else if (lay === 'number') {
    const num = pickNumber(t);
    inner = `<div style="position:relative;z-index:2;height:100%;box-sizing:border-box;display:flex;`
      + `flex-direction:column;justify-content:center;padding:${PAD}px">`
      + `<div style="display:flex;align-items:flex-start;justify-content:space-between;margin-bottom:${14 * S}px">`
      + `<div style="font-size:${280 * S}px;line-height:.80;font-weight:800;letter-spacing:-.06em;`
      + `color:${pal.accentText};opacity:.94;font-variant-numeric:tabular-nums">${num}</div>`
      + `<div style="writing-mode:vertical-rl;font:400 ${20 * S}px/1 ${MONO};letter-spacing:.34em;`
      + `color:${subInk};margin-top:${8 * S}px">${dateStamp()}</div></div>`
      + `<div style="padding-top:${8 * S}px">`
      + h1(92, `line-height:1.16;font-weight:700;letter-spacing:-.01em;max-width:${820 * S}px;color:${ink}`)
      + leadEl(28, `line-height:1.7;max-width:${700 * S}px;margin-top:${26 * S}px;color:${subInk}`)
      + `</div>`
      + `<div style="position:absolute;left:${PAD}px;right:${PAD}px;bottom:${PAD}px;display:flex;`
      + `justify-content:space-between;font:400 ${22 * S}px/1 ${MONO};letter-spacing:.18em;color:${subInk}">`
      + `<span>No.${num}</span><span>${auth ? 'By ' + esc(auth) : ''}</span></div>`
      + `</div>`;
  }

  /* ── 4. 清单（M05）：编号条目 + 发丝线 ── */
  else if (lay === 'list') {
    const items = splitItems(lead);
    const rows = items.map((x, i) => `<li style="display:flex;align-items:baseline;gap:${26 * S}px;`
      + `padding:${24 * S}px 0;border-top:1px solid ${hasImg ? (ink === '#ffffff' ? 'rgba(255,255,255,.34)' : 'rgba(20,17,16,.30)') : 'rgba(128,128,128,.26)'};`
      + `${i === items.length - 1 ? `border-bottom:1px solid ${hasImg ? (ink === '#ffffff' ? 'rgba(255,255,255,.34)' : 'rgba(20,17,16,.30)') : 'rgba(128,128,128,.26)'};` : ''}">`
      + `<span style="flex:none;font:600 ${26 * S}px/1 ${MONO};color:${pal.accentText};letter-spacing:.06em;padding-top:${2 * S}px">`
      + `${String(i + 1).padStart(2, '0')}</span>`
      + `<span style="font-size:${34 * S}px;line-height:1.55;color:${ink};`
      + `${hasImg ? 'text-shadow:0 2px 12px rgba(0,0,0,.42)' : ''}">${esc(x)}</span></li>`).join('');
    inner = `<div style="position:relative;z-index:2;height:100%;box-sizing:border-box;display:flex;`
      + `flex-direction:column;justify-content:center;padding:${PAD}px">`
      + kicker(hasImg ? ink : pal.accentText, 22, '清单 · List')
      + h1(76, `line-height:1.2;font-weight:700;letter-spacing:-.005em;max-width:${820 * S}px;color:${ink}`)
      + (items.length
        ? `<ul style="list-style:none;margin:${44 * S}px 0 0;padding:0;max-width:${840 * S}px">${rows}</ul>`
        : leadEl(30, `line-height:1.65;margin-top:${36 * S}px;max-width:${700 * S}px;color:${subInk}`))
      + foot(subInk, 22) + `</div>`;
  }

  /* ── 5/6. 杂志封面（editorial）/ 瑞士封面（swiss）──
     真实实现里这两套是**同一个结构**，差异只有字体族、字重、字距、强调色：
       editorial  衬线 96px/500/.04em，正文 28px/1.65，meta 20px/.22em
       swiss      无衬线 104px/300/-.01em，正文 30px/1.5，meta 22px/.15em
     这也正是「瑞士封面和瑞士模板看起来重复」的根源 —— 产品里它们本来就同构。 */
  else if (lay === 'magazine' || lay === 'swiss') {
    const isSw = lay === 'swiss';
    const metaSize = (isSw ? 22 : 20) * S;
    const metaTrack = isSw ? '.15em' : '.22em';
    const tSize = isSw ? 104 : 96;
    const tWeight = isSw ? 300 : 500;
    const tTrack = isSw ? '-.01em' : '.04em';
    const tLine = isSw ? 1.06 : 1.12;
    inner = `<div style="position:relative;z-index:2;height:100%;box-sizing:border-box;display:flex;`
      + `flex-direction:column;justify-content:flex-end;padding:${PAD}px ${88 * S}px">`
      + `<div style="font:400 ${metaSize}px/1 ${MONO};letter-spacing:${metaTrack};color:${subInk}">Vol. 01`
      + `<span style="display:inline-block;width:${5 * S}px;height:${5 * S}px;border-radius:50%;`
      + `background:${subInk};margin:0 ${12 * S}px;vertical-align:2px"></span>${dateStamp()}</div>`
      + `<div style="margin-top:${40 * S}px">`
      + `<div style="font:400 ${21 * S}px/1 ${MONO};letter-spacing:.22em;color:${ink};margin:0 0 ${24 * S}px">封面 · Cover</div>`
      + h1(tSize, `line-height:${tLine};font-weight:${tWeight};letter-spacing:${tTrack};margin-bottom:${20 * S}px;color:${ink}`)
      + `<div style="width:${48 * S}px;height:${Math.max(2, 3 * S)}px;background:${pal.accent};`
      + `margin-bottom:${20 * S}px;opacity:.8"></div>`
      + leadEl(isSw ? 30 : 28, `line-height:${isSw ? 1.5 : 1.65};color:${ink};max-width:${(isSw ? 700 : 640) * S}px`)
      + (auth ? `<div class="auth" style="font-family:${MONO};font-size:${metaSize}px;letter-spacing:${metaTrack};`
        + `color:${subInk};margin-top:${18 * S}px">By ${esc(auth)}</div>` : '')
      + `</div></div>`;
  }

  /* ── 7. 大字版：148px / 800 / -.03em + 强调色块压题 ── */
  else if (lay === 'bigtype') {
    inner = `<div style="position:relative;z-index:2;height:100%;box-sizing:border-box;display:flex;`
      + `flex-direction:column;justify-content:center;padding:${PAD}px ${88 * S}px">`
      + `<div style="font:400 ${18 * S}px/1 ${MONO};letter-spacing:.2em;color:${subInk}">Vol. 01`
      + `<span style="display:inline-block;width:${5 * S}px;height:${5 * S}px;border-radius:50%;`
      + `background:${subInk};margin:0 ${12 * S}px;vertical-align:2px"></span>${dateStamp()}</div>`
      + `<div style="margin:auto 0">`
      + `<div style="width:${104 * S}px;height:${14 * S}px;background:${pal.accent};margin:0 0 ${40 * S}px"></div>`
      /* ⚠️ 原来写死 148px：7 个字的标题 148×7=1036 > 内容宽 904，贪心换行切成 6+1，
         最后一行孤零零一个字（实测「周末去了趟海 / 边」）。改成先按内容宽求字号，上限仍是 148。 */
      + h1(Math.min(148, fitTitle(t, 1080 - 176, 148, 2)), `line-height:1.0;font-weight:800;letter-spacing:-.03em;margin-bottom:${20 * S}px;color:${ink}`)
      + leadEl(26, `line-height:1.6;color:${ink};margin-top:${28 * S}px;max-width:${660 * S}px`)
      + (auth ? `<div class="auth" style="font-family:${MONO};font-size:${18 * S}px;letter-spacing:.2em;`
        + `color:${subInk};margin-top:${18 * S}px">By ${esc(auth)}</div>` : '')
      + `</div>`
      + `<div style="width:100%;height:1px;background:${pal.accent};opacity:.35;margin-top:${40 * S}px"></div>`
      + `</div>`;
  }

  // 文字位置：真实实现用 translateY 平移（不改布局），跟 title-page.js 的 textPos 一致
  const shift = { top: '-28%', mid: '-10%', bottom: '0%' }[state.vpos] || '0%';
  const shiftCss = hasImg && shift !== '0%' ? `#${uid} .rl-body{transform:translateY(${shift})}` : '';

  return `<div class="cv-art" id="${uid}" style="${rootStyle}">`
    + `<style>${scopeCss(tmodeCss(state.tmode), '#' + uid)}${shiftCss}</style>`
    + imgEl + scrim
    + `<div class="rl-body" style="position:relative;z-index:2;height:100%">${inner}</div>`
    + `</div>`;
}


/* ══════════════════════════════════════════════════════════════════════
   配方版式（15 套）—— 结构照 references/layout-recipes.md
   ──────────────────────────────────────────────────────────────────────
   每条配方的共同骨架（配方文件里反复出现的）：
     kicker  mono 21-22px / 字距 .22em
     h-xl    96-112px 衬线，行高 1.05-1.15
     lead    28-30px，muted
     strip   底部 mono 条 + 发丝线
     grain   3px 点阵（opacity .5），避免大面积纯色发空
   下面每个 kind 只改「内容块怎么排」，骨架统一。
   ══════════════════════════════════════════════════════════════════════ */
const RECIPE_KIND = {
  'image-hero': 'imageHero', takeaway: 'takeaway', warning: 'warning', 'kpi-tower': 'kpi',
  'field-note': 'photoCaption', 'essay-split': 'split', 'evidence-wall': 'wall',
  feature: 'feature', 'atmos-thesis': 'atlas', marginalia: 'marginal',
  matrix: 'matrix',
  'closing-note': 'closing', 'tall-ledger': 'ledger', 'section-divider': 'divider',
  'hero-question': 'question', pipeline: 'pipeline', 'before-after': 'beforeafter',
  'two-signals': 'twoSignals', 'data-layer': 'dataLayer',
};

function renderRecipe(W, H, o) {
  const pal = palOf(state.pal);
  const S = W / 1080;
  const PAD = 96 * S;
  const kind = RECIPE_KIND[o.lay];
  const t = o.title || '';
  const lead = o.sub || '';
  const auth = o.auth || '';
  const photo = o.photo || '';
  const an = o.an || null;
  /* ⚠️ 只有 needImg 的版式才铺图。纯文字配方（大问句/章节分隔/竖排流程…）
     铺了图就变成「照片 + 字」，配方本身的气质全没了（实测：大问句页上压着一张海边照片）。 */
  const hasImg = !!photo && !!layOf(o.lay).needImg;
  const uid = 'rc' + (renderRecipe._n = (renderRecipe._n || 0) + 1);
  const serif = (o.lay === 'field-note' || o.lay === 'essay-split' || o.lay === 'marginalia'
    || o.lay === 'section-divider' || o.lay === 'closing-note' || o.lay === 'hero-question');
  const famStr = state.font === 'auto'
    ? (serif ? "'Noto Serif SC'" : "'Noto Sans SC'")
    : fontOf(state.font).family.replace(/"/g, "'");

  const zone = [0.6, 1];
  const v = hasImg ? (an ? judge(an, zone) : { ink:'#fff', alpha:0.26 }) : { ink: pal.ink, alpha:0 };
  o._verdict = v;
  const ink = hasImg ? v.ink : pal.ink;

  const scrim = hasImg && v.alpha > 0
    ? `<div style="position:absolute;left:0;right:0;top:50%;bottom:0;z-index:1;pointer-events:none;`
      + `background:linear-gradient(180deg,rgba(12,11,10,0) 0%,rgba(12,11,10,${(v.alpha * 0.35).toFixed(3)}) 44%,`
      + `rgba(12,11,10,${(v.alpha * 0.8).toFixed(3)}) 74%,rgba(12,11,10,${v.alpha.toFixed(3)}) 100%)"></div>`
    : '';
  const imgEl = hasImg
    ? `<img src="${photo}" alt="" style="position:absolute;inset:0;width:100%;height:100%;object-fit:cover;z-index:0">`
    : '';

  const rootStyle = `position:relative;width:${W}px;height:${H}px;overflow:hidden;isolation:isolate;`
    + `background:${pal.paper};color:${pal.ink};font-family:${famStr};`
    + `--paper:${pal.paper};--paper2:${pal.paper2 || pal.paper};--ink:${pal.ink};--muted:${pal.muted};`
    + `--accent:${pal.accent};--accentText:${pal.accentText || pal.accent};`;

  /* 配方里的三个固定零件 */
  const KICK = (label, color) => `<div style="font:500 ${21 * S}px/1 ${MONO};letter-spacing:.22em;`
    + `text-transform:uppercase;color:${color || pal.muted};margin:0 0 ${26 * S}px">${label}</div>`;

  const STRIP = (left, right, color) => `<div style="display:flex;align-items:center;justify-content:space-between;`
    + `gap:${20 * S}px;padding-top:${20 * S}px;margin-top:${36 * S}px;`
    + `border-top:1px solid ${hasImg ? (ink === '#ffffff' ? 'rgba(255,255,255,.32)' : 'rgba(20,17,16,.26)') : 'rgba(128,128,128,.3)'};`
    + `font:400 ${20 * S}px/1 ${MONO};letter-spacing:.2em;color:${color || pal.muted}">`
    + `<span>${left}</span><span>${right || ''}</span></div>`;

  const H1 = (size, extra) => `<h1 class="ttl" style="margin:0;font-size:${size * S}px;${extra}">${titleHtml(t)}</h1>`;
  const LEAD = (size, extra) => lead ? `<div class="sub" style="font-size:${size * S}px;${extra}">${esc(lead)}</div>` : '';
  /* 小字切条目：`·`/`、`/换行 都算分隔；不足 2 条时给一组和主题无关的占位（不编内容） */
  const items = (n) => {
    const a = String(lead || '').split(/[·、／/｜|，,；;\n]+/).map(x => x.trim()).filter(Boolean);
    return a.slice(0, n);
  };

  const GRAIN = `<div style="position:absolute;inset:0;z-index:1;pointer-events:none;opacity:.5;`
    + `background-image:radial-gradient(rgba(0,0,0,.045) 1px,transparent 1px);background-size:3px 3px"></div>`;

  let inner = '';

  /* ── M02 纪实照片：大图 + 底部纸面说明带 ── */
  if (kind === 'photoCaption') {
    // 图占上 66%，下面 34% 是纸面说明带：一眼是「照片 + 图注」，不是「图文封面」
    const imgH = Math.round(H * 0.66);
    inner = `<div style="position:absolute;left:0;top:0;right:0;height:${imgH}px;overflow:hidden;z-index:1">`
      + (hasImg ? `<img src="${photo}" style="width:100%;height:100%;object-fit:cover;display:block">`
        : `<div style="width:100%;height:100%;background:${pal.paper2 || pal.muted};opacity:.28"></div>`)
      + `</div>`
      + `<div style="position:absolute;left:0;right:0;bottom:0;height:${H - imgH}px;`
      + `box-sizing:border-box;padding:${52 * S}px ${PAD}px ${44 * S}px;background:${pal.paper};z-index:2">`
      + `<div style="font:500 ${19 * S}px/1 ${MONO};letter-spacing:.24em;color:${pal.muted};margin-bottom:${24 * S}px">`
      + `现场 · Field Note</div>`
      + H1(84, `line-height:1.12;font-weight:600;letter-spacing:.01em;color:${pal.ink};`
        + `display:-webkit-box;-webkit-line-clamp:2;-webkit-box-orient:vertical;overflow:hidden`)
      + `<div style="width:${56 * S}px;height:${Math.max(2, 3 * S)}px;background:${pal.accent};`
      + `margin:${26 * S}px 0 ${18 * S}px"></div>`
      + LEAD(27, `line-height:1.6;color:${pal.muted};`)
      + `</div>`;
    return wrapRecipe();
  }

  /* ── M03 左右分栏：左大标题，右 2–3 段，中间细线 ── */
  if (kind === 'split') {
    const leftW = Math.round(W * 0.54);
    const parts = items(3);
    inner = `<div style="position:absolute;inset:0;z-index:2;box-sizing:border-box;padding:${PAD}px;`
      + `display:grid;grid-template-columns:${leftW - PAD}px 1px 1fr;gap:${34 * S}px">`
      + `<div style="display:flex;flex-direction:column;justify-content:space-between;min-width:0">`
      + KICK('Essay · 随笔')
      + `<div>${H1(96, `line-height:1.1;font-weight:600;letter-spacing:.02em;color:${pal.ink}`)}</div>`
      + `<div style="font:400 ${19 * S}px/1 ${MONO};letter-spacing:.2em;color:${pal.muted}">`
      + `${auth ? 'BY ' + esc(auth) : ''}</div></div>`
      + `<div style="background:rgba(128,128,128,.32)"></div>`
      + `<div style="display:flex;flex-direction:column;justify-content:flex-end;gap:${26 * S}px;min-width:0">`
      + (hasImg ? `<img src="${photo}" style="width:100%;height:${Math.round(H * 0.34)}px;object-fit:cover;`
        + `display:block;margin-bottom:${8 * S}px">` : '')
      + (parts.length
        ? parts.map((p, i) => `<div style="display:flex;gap:${16 * S}px;align-items:baseline">`
          + `<span style="font:600 ${19 * S}px/1 ${MONO};color:${pal.accentText};flex:none">`
          + `${String(i + 1).padStart(2, '0')}</span>`
          + `<span style="font-size:${28 * S}px;line-height:1.68;color:${pal.ink}">${esc(p)}</span></div>`).join('')
        : LEAD(24, `line-height:1.7;color:${pal.muted}`))
      + `</div></div>`;
    return wrapRecipe();
  }

  /* ── M06 证据墙：2×2 图墙 + 一句判读 ── */
  if (kind === 'wall') {
    const cell = Math.round((W - PAD * 2 - 12 * S) / 2);
    const pos = [['0% 0%', 'center'], ['100% 0%', 'center'], ['0% 100%', 'center'], ['100% 100%', 'center']];
    inner = `<div style="position:absolute;inset:0;z-index:2;box-sizing:border-box;padding:${PAD}px;`
      + `display:flex;flex-direction:column">`
      + KICK('Evidence · 证据')
      + H1(72, `line-height:1.16;font-weight:600;color:${pal.ink};margin-bottom:${30 * S}px;`
        + `display:-webkit-box;-webkit-line-clamp:2;-webkit-box-orient:vertical;overflow:hidden`)
      + `<div style="display:grid;grid-template-columns:repeat(2,1fr);gap:${12 * S}px">`
      + pos.map((p, i) => `<div style="position:relative;height:${cell}px;overflow:hidden;background:${pal.paper2 || '#e9e3d6'}">`
        + (hasImg ? `<img src="${photo}" style="width:100%;height:100%;object-fit:cover;object-position:${p[0]};`
          + `transform:scale(1.9);transform-origin:${p[0]};display:block">` : '')
        + `<span style="position:absolute;left:${8 * S}px;bottom:${8 * S}px;font:600 ${16 * S}px/1 ${MONO};`
        + `color:#fff;background:rgba(20,17,16,.6);padding:${3 * S}px ${7 * S}px">`
        + `${String(i + 1).padStart(2, '0')}</span></div>`).join('')
      + `</div>`
      + LEAD(26, `line-height:1.6;color:${pal.muted};margin-top:${26 * S}px`)
      + `</div>`;
    return wrapRecipe();
  }

  /* ── M10 实证特写：大图 55% + 标题在上 + 底部 3 条要点 ── */
  if (kind === 'feature') {
    const imgH = Math.round(H * 0.54);
    const parts = items(3);
    inner = `<div style="position:absolute;inset:0;z-index:2;box-sizing:border-box;padding:${PAD}px ${PAD}px ${56 * S}px;`
      + `display:flex;flex-direction:column">`
      + KICK('Evidence Feature · 实证')
      + H1(80, `line-height:1.14;font-weight:600;color:${pal.ink};`
        + `display:-webkit-box;-webkit-line-clamp:2;-webkit-box-orient:vertical;overflow:hidden`)
      + `<div style="height:${28 * S}px"></div>`
      + `<div style="height:${imgH}px;overflow:hidden;background:${pal.paper2 || '#e9e3d6'};flex:none">`
      + (hasImg ? `<img src="${photo}" style="width:100%;height:100%;object-fit:cover;display:block">` : '')
      + `</div>`
      + `<div style="display:flex;flex-direction:column;gap:${14 * S}px;margin-top:${30 * S}px">`
      + (parts.length ? parts.map((p, i) => `<div style="display:flex;gap:${16 * S}px;align-items:baseline;`
        + `border-top:1px solid rgba(128,128,128,.26);padding-top:${14 * S}px">`
        + `<span style="font:600 ${18 * S}px/1 ${MONO};color:${pal.accentText};flex:none">`
        + `${String(i + 1).padStart(2, '0')}</span>`
        + `<span style="font-size:${26 * S}px;line-height:1.5;color:${pal.ink}">${esc(p)}</span></div>`).join('')
        : LEAD(26, `color:${pal.muted}`))
      + `</div></div>`;
    return wrapRecipe();
  }

  /* ── M09 氛围论点：墨流底 + 一句大论点 ── */
  if (kind === 'atlas') {
    // 配方要求「背景可见、内容不盖满」：用三层径向渐变模拟 ink-flow，透明度压到 .9
    inner = `<div style="position:absolute;inset:0;z-index:0;`
      + `background:radial-gradient(60% 44% at 22% 18%,${pal.accent}26 0%,transparent 62%),`
      + `radial-gradient(52% 40% at 82% 74%,${pal.accent}1f 0%,transparent 66%),`
      + `radial-gradient(70% 50% at 50% 108%,${pal.accent}14 0%,transparent 70%),${pal.paper}"></div>`
      + `<div style="position:absolute;inset:0;z-index:2;box-sizing:border-box;padding:${PAD}px;`
      + `display:flex;flex-direction:column;justify-content:center">`
      + KICK('Thesis · 论点')
      + H1(118, `line-height:1.16;font-weight:600;letter-spacing:.01em;color:${pal.ink};`
        + `max-width:${W - PAD * 2}px`)
      + `<div style="width:${72 * S}px;height:${Math.max(2, 3 * S)}px;background:${pal.accent};`
      + `margin:${40 * S}px 0 ${26 * S}px;opacity:.9"></div>`
      + LEAD(30, `line-height:1.66;color:${pal.muted};max-width:${760 * S}px`)
      + `</div>`
      + `<div style="position:absolute;left:${PAD}px;right:${PAD}px;bottom:${40 * S}px;z-index:2">`
      + STRIP('Vol.01', dateStamp(), pal.muted) + `</div>`;
    return wrapRecipe();
  }

  /* ── M11 页边批注：主栏正文 + 窄边栏关键词 ── */
  if (kind === 'marginal') {
    const mainW = Math.round(W * 0.62);
    const parts = items(3);
    inner = `<div style="position:absolute;inset:0;z-index:2;box-sizing:border-box;padding:${PAD}px;`
      + `display:flex;flex-direction:column">`
      + KICK('Marginalia · 批注')
      + H1(84, `line-height:1.14;font-weight:600;color:${pal.ink};margin-bottom:${30 * S}px;`
        + `display:-webkit-box;-webkit-line-clamp:2;-webkit-box-orient:vertical;overflow:hidden`)
      + `<div style="display:grid;grid-template-columns:1fr 1px ${mainW === 0 ? 0 : Math.round(W * 0.24)}px;`
      + `gap:${30 * S}px;flex:1;min-height:0;align-content:start">`
      + `<div style="display:flex;flex-direction:column;gap:${20 * S}px">`
      + (parts.length ? parts.map(p => `<div style="font-size:${28 * S}px;line-height:1.72;color:${pal.ink}">`
        + `${esc(p)}</div>`).join('') : LEAD(28, `line-height:1.72;color:${pal.ink}`))
      + `</div><div style="background:rgba(128,128,128,.3)"></div>`
      + `<div style="display:flex;flex-direction:column;gap:${18 * S}px">`
      + (hasImg ? `<img src="${photo}" style="width:100%;height:${Math.round(H * 0.2)}px;object-fit:cover;display:block">` : '')
      + `<div style="font:500 ${17 * S}px/1.7 ${MONO};letter-spacing:.12em;color:${pal.muted}">`
      + `${auth ? 'BY ' + esc(auth) : dateStamp()}</div></div>`
      + `</div></div>`;
    return wrapRecipe();
  }

  /* ── S12 主数字矩阵：8 格 + 底部主数字 ── */
  if (kind === 'matrix') {
    const cells = items(8);
    inner = `<div style="position:absolute;inset:0;z-index:2;box-sizing:border-box;padding:${PAD}px ${PAD}px ${52 * S}px;`
      + `display:flex;flex-direction:column">`
      + KICK('Capabilities · 能力清单')
      + H1(74, `line-height:1.16;font-weight:600;color:${pal.ink};margin-bottom:${28 * S}px;`
        + `display:-webkit-box;-webkit-line-clamp:2;-webkit-box-orient:vertical;overflow:hidden`)
      + `<div style="display:grid;grid-template-columns:repeat(2,1fr);gap:${10 * S}px;flex:1;min-height:0;`
      + `align-content:start">`
      + (cells.length ? cells.map((c, i) => `<div style="padding:${16 * S}px ${14 * S}px;`
        + `border:1px solid ${i === 2 ? pal.accent : 'rgba(128,128,128,.3)'};`
        + `${i === 2 ? `background:${pal.accent};` : ''}min-height:${76 * S}px;box-sizing:border-box">`
        + `<div style="font:600 ${15 * S}px/1 ${MONO};letter-spacing:.1em;`
        + `color:${i === 2 ? inkOn(pal.accent) : pal.muted};margin-bottom:${8 * S}px">`
        + `${String(i + 1).padStart(2, '0')}</div>`
        + `<div style="font-size:${26 * S}px;line-height:1.36;font-weight:500;`
        + `color:${i === 2 ? inkOn(pal.accent) : pal.ink}">${esc(c)}</div></div>`).join('')
        : `<div style="grid-column:1/-1;font-size:${26 * S}px;color:${pal.muted};line-height:1.7">`
        + `小字用「·」分隔，会变成矩阵格子</div>`)
      + `</div>`
      + `<div style="display:flex;align-items:flex-end;justify-content:space-between;gap:${24 * S}px;`
      + `margin-top:${30 * S}px;padding-top:${24 * S}px;border-top:1px solid rgba(128,128,128,.3)">`
      + `<div style="font-size:${24 * S}px;line-height:1.5;color:${pal.muted};max-width:${420 * S}px">`
      + `${esc(auth || '一个封面，装下一件事的全部')}</div>`
      + `<div style="font-size:${140 * S}px;line-height:.8;font-weight:800;letter-spacing:-.05em;`
      + `color:${pal.accentText};font-variant-numeric:tabular-nums">`
      + `${String(Math.max(cells.length, 1)).padStart(2, '0')}</div></div>`
      + `</div>`;
    return wrapRecipe();
  }

  /* ── M07 收尾寄语：大标题 + 4 条账本 + 收尾句 ── */
  if (kind === 'closing') {
    const rows = items(4);
    const list = rows.length ? rows : ['把话说完', '把事做透', '把人记住', '下次见'];
    inner = `<div style="position:absolute;inset:0;z-index:2;box-sizing:border-box;padding:${PAD}px ${PAD}px ${48 * S}px;`
      + `display:flex;flex-direction:column">`
      + KICK('Closing · 收尾')
      + H1(92, `line-height:1.12;font-weight:600;color:${pal.ink};`
        + `display:-webkit-box;-webkit-line-clamp:2;-webkit-box-orient:vertical;overflow:hidden`)
      + `<div style="margin-top:${36 * S}px;flex:1;min-height:0">`
      + list.map((x, i) => `<div style="display:flex;gap:${22 * S}px;align-items:flex-start;`
        + `padding:${22 * S}px 0;border-top:1px solid rgba(128,128,128,.26);`
        + `${i === list.length - 1 ? 'border-bottom:1px solid rgba(128,128,128,.26);' : ''}">`
        + `<span style="flex:none;font:600 ${20 * S}px/1.5 ${MONO};color:${pal.accentText};letter-spacing:.06em">`
        + `${String(i + 1).padStart(2, '0')}</span>`
        + `<span style="font-family:'Noto Serif SC',serif;font-size:${30 * S}px;line-height:1.45;color:${pal.ink}">`
        + `${esc(x)}</span></div>`).join('')
      + `</div>`
      + `<div style="display:flex;align-items:flex-end;justify-content:space-between;gap:${24 * S}px;`
      + `margin-top:${28 * S}px">`
      + `<div style="font-family:'Noto Serif SC',serif;font-size:${28 * S}px;line-height:1.6;`
      + `color:${pal.muted};font-style:italic">${esc(auth ? '— ' + auth : '— 这一篇写到这里')}</div>`
      + `<div style="font:400 ${18 * S}px/1 ${MONO};letter-spacing:.2em;color:${pal.muted}">THE END</div>`
      + `</div></div>`;
    return wrapRecipe();
  }

  /* ── M08 长账本：左编号右标题的 4–6 条 ── */
  if (kind === 'ledger') {
    const rows = items(6);
    const list = rows.length ? rows : ['第一条', '第二条', '第三条', '第四条'];
    inner = `<div style="position:absolute;inset:0;z-index:2;box-sizing:border-box;padding:${PAD}px ${PAD}px ${48 * S}px;`
      + `display:flex;flex-direction:column">`
      + KICK('Ledger · 账本')
      + H1(80, `line-height:1.14;font-weight:600;color:${pal.ink};margin-bottom:${30 * S}px;`
        + `display:-webkit-box;-webkit-line-clamp:2;-webkit-box-orient:vertical;overflow:hidden`)
      + `<div style="flex:1;min-height:0;display:flex;flex-direction:column;justify-content:flex-start">`
      + list.map((x, i) => `<div style="display:flex;gap:${26 * S}px;align-items:baseline;`
        + `padding:${Math.max(18, 26 - list.length * 2) * S}px 0;border-top:1px solid rgba(128,128,128,.26);`
        + `${i === list.length - 1 ? 'border-bottom:1px solid rgba(128,128,128,.26);' : ''}">`
        + `<span style="flex:none;width:${70 * S}px;font:600 ${22 * S}px/1.4 ${MONO};`
        + `color:${pal.accentText};letter-spacing:.04em">${String(i + 1).padStart(2, '0')}</span>`
        + `<span style="font-size:${38 * S}px;line-height:1.4;color:${pal.ink};font-weight:500">${esc(x)}</span>`
        + `</div>`).join('')
      + `</div>`
      + `<div style="font:400 ${18 * S}px/1 ${MONO};letter-spacing:.2em;color:${pal.muted};`
      + `margin-top:${24 * S}px">${dateStamp()} · ${String(list.length).padStart(2, '0')} ITEMS</div>`
      + `</div>`;
    return wrapRecipe();
  }

  /* ── M12 章节分隔：kicker + 3–6 字大标题 + 斜体副题 ── */
  if (kind === 'divider') {
    const short = String(t || '新的开始').slice(0, 8);
    inner = `<div style="position:absolute;inset:0;z-index:2;box-sizing:border-box;padding:${PAD}px;`
      + `display:flex;flex-direction:column;justify-content:center">`
      + `<div style="font:500 ${20 * S}px/1 ${MONO};letter-spacing:.28em;color:${pal.accentText};`
      + `margin-bottom:${30 * S}px">ACT II · 第二节</div>`
      + `<h1 class="ttl" style="margin:0;font-size:${Math.min(160, Math.round(760 / Math.max(3, short.length))) * S}px;`
      + `line-height:1.06;font-weight:600;letter-spacing:.04em;color:${pal.ink}">${titleHtml(short)}</h1>`
      + `<div style="width:${88 * S}px;height:${Math.max(2, 3 * S)}px;background:${pal.accent};`
      + `margin:${36 * S}px 0 ${22 * S}px"></div>`
      + LEAD(30, `line-height:1.6;color:${pal.muted};font-style:italic;font-family:'Noto Serif SC',serif`)
      + `</div>`
      + `<div style="position:absolute;left:${PAD}px;right:${PAD}px;bottom:${44 * S}px;z-index:2">`
      + STRIP('Section · 00', dateStamp(), pal.muted) + `</div>`;
    return wrapRecipe();
  }

  /* ── M13 大问句：三行问句占满整页 ── */
  if (kind === 'question') {
    // 配方明令：每行 ≤6 字、最多 3 行，宁可改短也不缩字号
    const raw = String(t || '你会怎么选');
    /* 断行必须「均分」：按 6 字硬切会把 7 个字切成 6+1，第二行只剩一个字（实测很难看）。
       配方要求「每行 ≤6 字、最多 3 行，按语义断」，这里先按行数均分，再短的行数优先。 */
    const nLines = raw.length <= 6 ? 1 : (raw.length <= 12 ? 2 : 3);
    const per = Math.ceil(raw.length / nLines);
    const lines = [];
    for (let i = 0; i < raw.length && lines.length < 3; i += per) lines.push(raw.slice(i, i + per));
    const maxLen = Math.max(...lines.map(l => l.length), 1);
    const fs = Math.min(150, Math.round(880 / maxLen));
    inner = `<div style="position:absolute;inset:0;z-index:2;box-sizing:border-box;padding:${PAD}px;`
      + `display:flex;flex-direction:column;justify-content:center">`
      + KICK('The Question · 留给你的')
      + `<h1 class="ttl" style="margin:0;font-size:${fs * S}px;line-height:1.18;font-weight:600;color:${pal.ink}">`
      + lines.map(l => titleHtml(l)).join('<br>') + `</h1>`
      + LEAD(28, `line-height:1.6;color:${pal.muted};margin-top:${40 * S}px;max-width:${700 * S}px`)
      + `</div>`
      + `<div style="position:absolute;left:${PAD}px;right:${PAD}px;bottom:${44 * S}px;z-index:2">`
      + STRIP('End · Page 09', '欢迎留言', pal.muted) + `</div>`;
    return wrapRecipe();
  }

  /* ── M14 竖排流程：3–4 步 ── */
  if (kind === 'pipeline') {
    const steps = items(4);
    const list = steps.length ? steps : ['第一步', '第二步', '第三步'];
    inner = `<div style="position:absolute;inset:0;z-index:2;box-sizing:border-box;padding:${PAD}px ${PAD}px ${48 * S}px;`
      + `display:flex;flex-direction:column">`
      + KICK('Pipeline · 流程')
      + H1(76, `line-height:1.16;font-weight:600;color:${pal.ink};margin-bottom:${34 * S}px;`
        + `display:-webkit-box;-webkit-line-clamp:2;-webkit-box-orient:vertical;overflow:hidden`)
      + `<div style="flex:1;min-height:0;display:flex;flex-direction:column;justify-content:center;`
      + `gap:${Math.max(14, 34 - list.length * 4) * S}px">`
      + list.map((x, i) => `<div style="display:flex;gap:${24 * S}px;align-items:flex-start">`
        + `<div style="flex:none;width:${64 * S}px;height:${64 * S}px;border-radius:50%;`
        + `border:1px solid ${pal.accent};display:grid;place-items:center;`
        + `font:600 ${20 * S}px/1 ${MONO};color:${pal.accentText}">${String(i + 1).padStart(2, '0')}</div>`
        + `<div style="min-width:0;padding-top:${6 * S}px">`
        + `<div style="font-family:'Noto Serif SC',serif;font-size:${34 * S}px;line-height:1.4;`
        + `color:${pal.ink}">${esc(x)}</div>`
        + `<div style="font-size:${23 * S}px;line-height:1.6;color:${pal.muted};margin-top:${6 * S}px">`
        + `第 ${i + 1} 步 · 做完再往下</div></div></div>`).join('')
      + `</div>`
      + `<div style="font:400 ${18 * S}px/1 ${MONO};letter-spacing:.2em;color:${pal.muted};`
      + `margin-top:${22 * S}px">${String(list.length).padStart(2, '0')} STEPS</div>`
      + `</div>`;
    return wrapRecipe();
  }

  /* ── M15 前后对比：上下两块 ── */
  if (kind === 'beforeafter') {
    const rows = items(6);
    const before = rows.slice(0, 3);
    const after = rows.slice(3, 6);
    const blk = (label, arr, dim, accent) => `<div style="flex:1;min-height:0;box-sizing:border-box;`
      + `padding:${30 * S}px ${28 * S}px;border:1px solid ${accent ? pal.accent : 'rgba(128,128,128,.32)'};`
      + `${accent ? `background:${pal.accent};` : `background:${pal.paper2 || 'transparent'};`}`
      + `${dim ? 'opacity:.68;' : ''}">`
      + `<div style="font:500 ${17 * S}px/1 ${MONO};letter-spacing:.22em;margin-bottom:${14 * S}px;`
      + `color:${accent ? inkOn(pal.accent) : pal.muted}">${label}</div>`
      + `<div style="font-family:'Noto Serif SC',serif;font-size:${40 * S}px;line-height:1.3;`
      + `color:${accent ? inkOn(pal.accent) : pal.ink};margin-bottom:${18 * S}px">`
      + `${esc((arr[0] || (accent ? '先发版' : '反复修')).slice(0, 8))}</div>`
      + `<div style="display:flex;flex-direction:column;gap:${10 * S}px">`
      + (arr.slice(1).length ? arr.slice(1) : ['一天发三条', '评论区做精修'])
        .map(x => `<div style="font-size:${23 * S}px;line-height:1.5;`
          + `color:${accent ? inkOn(pal.accent) : pal.muted};opacity:${accent ? '.96' : '1'}">`
          + `· ${esc(x)}</div>`).join('')
      + `</div></div>`;
    inner = `<div style="position:absolute;inset:0;z-index:2;box-sizing:border-box;padding:${PAD}px ${PAD}px ${48 * S}px;`
      + `display:flex;flex-direction:column">`
      + KICK('Before · After')
      + H1(72, `line-height:1.16;font-weight:600;color:${pal.ink};margin-bottom:${28 * S}px;`
        + `display:-webkit-box;-webkit-line-clamp:2;-webkit-box-orient:vertical;overflow:hidden`)
      + `<div style="flex:1;min-height:0;display:flex;flex-direction:column;gap:${14 * S}px">`
      + blk('BEFORE · 旧', before, true, false)
      + blk('AFTER · 新', after, false, true)
      + `</div></div>`;
    return wrapRecipe();
  }

  /* ── S02 双信号：两块，一实一虚 ── */
  if (kind === 'twoSignals') {
    const rows = items(4);
    const a = rows.slice(0, 2);
    const b = rows.slice(2, 4);
    const mod = (label, arr, fill) => `<div style="flex:1;min-width:0;box-sizing:border-box;`
      + `padding:${32 * S}px ${26 * S}px;display:flex;flex-direction:column;justify-content:space-between;`
      + `${fill ? `background:${pal.ink};` : `border:1px solid ${pal.accent};`}">`
      + `<div style="font:500 ${17 * S}px/1 ${MONO};letter-spacing:.22em;`
      + `color:${fill ? inkOn(pal.ink) : pal.accentText};margin-bottom:${22 * S}px">${label}</div>`
      + `<div style="font-family:'Noto Serif SC',serif;font-size:${44 * S}px;line-height:1.28;`
      + `color:${fill ? inkOn(pal.ink) : pal.ink}">${esc((arr[0] || '信号一').slice(0, 10))}</div>`
      + `<div style="font-size:${22 * S}px;line-height:1.6;margin-top:${18 * S}px;`
      + `color:${fill ? inkOn(pal.ink) : pal.muted};opacity:${fill ? '.82' : '1'}">`
      + `${esc(arr[1] || '一句话说明')}</div></div>`;
    inner = `<div style="position:absolute;inset:0;z-index:2;box-sizing:border-box;padding:${PAD}px ${PAD}px ${48 * S}px;`
      + `display:flex;flex-direction:column">`
      + KICK('Two Signals · 两个信号')
      + H1(78, `line-height:1.16;font-weight:600;color:${pal.ink};margin-bottom:${30 * S}px;`
        + `display:-webkit-box;-webkit-line-clamp:2;-webkit-box-orient:vertical;overflow:hidden`)
      + `<div style="flex:1;min-height:0;display:flex;gap:${14 * S}px">`
      + mod('SIGNAL A · 旧', a, true) + mod('SIGNAL B · 新', b, false)
      + `</div></div>`;
    return wrapRecipe();
  }

  /* ── S03 数据层：对象块 + 3 条属性 ── */
  if (kind === 'dataLayer') {
    const rows = items(3);
    const list = rows.length ? rows : ['来源可追溯', '每一步可回滚', '结果可复核'];
    inner = `<div style="position:absolute;inset:0;z-index:2;box-sizing:border-box;padding:${PAD}px ${PAD}px ${48 * S}px;`
      + `display:flex;flex-direction:column">`
      + KICK('Data Layer · 数据层')
      + H1(74, `line-height:1.16;font-weight:600;color:${pal.ink};margin-bottom:${30 * S}px;`
        + `display:-webkit-box;-webkit-line-clamp:2;-webkit-box-orient:vertical;overflow:hidden`)
      + `<div style="border:1px solid ${pal.accent};padding:${30 * S}px ${28 * S}px;`
      + `display:flex;align-items:center;gap:${22 * S}px;margin-bottom:${30 * S}px">`
      + `<div style="width:${64 * S}px;height:${80 * S}px;border:1px solid ${pal.accent};`
      + `position:relative;flex:none">`
      + `<div style="position:absolute;right:${-1}px;top:${-1}px;width:${22 * S}px;height:${22 * S}px;`
      + `background:${pal.accent}"></div></div>`
      + `<div style="min-width:0">`
      + `<div style="font:600 ${20 * S}px/1.3 ${MONO};letter-spacing:.1em;color:${pal.accentText}">`
      + `${esc(String(t || 'untitled').slice(0, 14))}</div>`
      + `<div style="font-size:${22 * S}px;line-height:1.5;color:${pal.muted};margin-top:${6 * S}px">`
      + `source-of-truth · ${dateStamp()}</div></div></div>`
      + `<div style="flex:1;min-height:0;display:flex;flex-direction:column;justify-content:center">`
      + list.map((x, i) => `<div style="display:flex;gap:${20 * S}px;align-items:baseline;`
        + `padding:${20 * S}px 0;border-top:1px solid rgba(128,128,128,.26)">`
        + `<span style="flex:none;font:500 ${17 * S}px/1.4 ${MONO};letter-spacing:.14em;`
        + `color:${pal.muted};width:${110 * S}px">PROP ${String(i + 1).padStart(2, '0')}</span>`
        + `<span style="font-size:${30 * S}px;line-height:1.45;color:${pal.ink}">${esc(x)}</span>`
        + `</div>`).join('')
      + `</div></div>`;
    return wrapRecipe();
  }

  /* ── S08 图像主角：图铺满 + 覆盖块标题 + 底部 3 个数字 ── */
  if (kind === 'imageHero') {
    const stats = items(3);
    const sList = stats.length ? stats : ['1080px', '3:4', 'PNG'];
    inner = `<div style="position:absolute;inset:0;z-index:2;box-sizing:border-box;padding:${PAD}px ${PAD}px ${44 * S}px;`
      + `display:flex;flex-direction:column">`
      + `<div style="display:flex;align-items:center;justify-content:space-between;`
      + `font:400 ${18 * S}px/1 ${MONO};letter-spacing:.2em;color:${hasImg ? ink : pal.muted}">`
      + `<span>RELEASE · 产品</span><span>${dateStamp()}</span></div>`
      + `<div style="flex:1;min-height:0;display:flex;align-items:flex-start;padding-top:${44 * S}px">`
      + `<div style="max-width:${W - PAD * 2 - 120 * S}px;padding:${28 * S}px ${30 * S}px;`
      + `background:${hasImg ? 'rgba(255,255,255,.9)' : pal.paper2 || pal.paper};`
      + `backdrop-filter:blur(6px)">`
      + `<div style="font:500 ${17 * S}px/1 ${MONO};letter-spacing:.22em;color:${pal.accentText};`
      + `margin-bottom:${16 * S}px">COVER · 封面</div>`
      + H1(78, `line-height:1.14;font-weight:600;color:${pal.ink};`
        + `display:-webkit-box;-webkit-line-clamp:3;-webkit-box-orient:vertical;overflow:hidden`)
      + LEAD(24, `line-height:1.55;color:${pal.muted};margin-top:${14 * S}px;`
        + `display:-webkit-box;-webkit-line-clamp:2;-webkit-box-orient:vertical;overflow:hidden`)
      + `</div></div>`
      + `<div style="display:flex;gap:${18 * S}px;padding-top:${22 * S}px;`
      + `border-top:1px solid ${hasImg ? (ink === '#ffffff' ? 'rgba(255,255,255,.34)' : 'rgba(20,17,16,.28)') : 'rgba(128,128,128,.3)'}">`
      + sList.map((x, i) => `<div style="flex:1;min-width:0">`
        + `<div style="font-size:${40 * S}px;line-height:1.1;font-weight:800;`
        + `letter-spacing:-.02em;color:${hasImg ? ink : pal.ink};`
        + `font-variant-numeric:tabular-nums">${esc(x.slice(0, 6))}</div>`
        + `<div style="font:400 ${15 * S}px/1 ${MONO};letter-spacing:.16em;`
        + `color:${hasImg ? ink : pal.muted};opacity:.75;margin-top:${8 * S}px">`
        + `STAT ${String(i + 1).padStart(2, '0')}</div></div>`).join('')
      + `</div></div>`;
    return wrapRecipe();
  }

  /* ── S07 要点账本：大标题 + 3 行要点，深底收尾 ── */
  if (kind === 'takeaway') {
    const rows = items(3);
    const list = rows.length ? rows : ['先写清楚一件事', '再把它讲透', '最后给一句结论'];
    inner = `<div style="position:absolute;inset:0;z-index:2;box-sizing:border-box;padding:${PAD}px ${PAD}px ${48 * S}px;`
      + `display:flex;flex-direction:column;justify-content:center">`
      + KICK('Takeaway · 带走这三条')
      + H1(88, `line-height:1.14;font-weight:600;color:${pal.ink};margin-bottom:${34 * S}px;`
        + `display:-webkit-box;-webkit-line-clamp:2;-webkit-box-orient:vertical;overflow:hidden`)
      + list.map((x, i) => `<div style="display:flex;align-items:flex-start;gap:${24 * S}px;`
        + `padding:${26 * S}px 0;border-top:1px solid rgba(128,128,128,.28);`
        + `${i === list.length - 1 ? 'border-bottom:1px solid rgba(128,128,128,.28);' : ''}">`
        + `<span style="flex:none;font:800 ${44 * S}px/1 ${MONO};letter-spacing:-.04em;`
        + `color:${pal.accentText};opacity:.92;font-variant-numeric:tabular-nums">`
        + `${String(i + 1).padStart(2, '0')}</span>`
        + `<div style="min-width:0;padding-top:${4 * S}px">`
        + `<div style="font-family:'Noto Serif SC',serif;font-size:${32 * S}px;line-height:1.42;`
        + `color:${pal.ink};font-weight:500">${esc(x)}</div>`
        + `<div style="font:400 ${16 * S}px/1.6 ${MONO};letter-spacing:.14em;color:${pal.muted};`
        + `margin-top:${8 * S}px">POINT ${String(i + 1).padStart(2, '0')}</div></div></div>`).join('')
      + `</div>`;
    return wrapRecipe();
  }

  /* ── S05 警示清单：3 条「不要这样做」 ── */
  if (kind === 'warning') {
    const rows = items(3);
    const list = rows.length ? rows : ['别把字压在脸上', '别用纯白压照片', '别堆三行以上的小字'];
    inner = `<div style="position:absolute;inset:0;z-index:2;box-sizing:border-box;padding:${PAD}px ${PAD}px ${48 * S}px;`
      + `display:flex;flex-direction:column;justify-content:center">`
      + KICK('Do Not · 别这样')
      + H1(84, `line-height:1.14;font-weight:600;color:${pal.ink};margin-bottom:${32 * S}px;`
        + `display:-webkit-box;-webkit-line-clamp:2;-webkit-box-orient:vertical;overflow:hidden`)
      + `<div style="display:flex;flex-direction:column;gap:${16 * S}px">`
      + list.map((x, i) => `<div style="display:flex;align-items:stretch;gap:0;`
        + `border:1px solid ${pal.accent};background:${pal.paper2 || 'transparent'}">`
        + `<div style="flex:none;width:${10 * S}px;background:${pal.accent}"></div>`
        + `<div style="flex:none;width:${96 * S}px;display:grid;place-items:center;`
        + `font:700 ${26 * S}px/1 ${MONO};letter-spacing:-.02em;color:${pal.accentText}">`
        + `NO.${String(i + 1).padStart(2, '0')}</div>`
        + `<div style="padding:${24 * S}px ${22 * S}px;font-size:${30 * S}px;line-height:1.42;`
        + `color:${pal.ink};min-width:0">${esc(x)}</div></div>`).join('')
      + `</div>`
      + `<div style="font:400 ${17 * S}px/1.6 ${MONO};letter-spacing:.16em;color:${pal.muted};`
      + `margin-top:${28 * S}px">这 ${list.length} 条是实测踩过的坑</div>`
      + `</div>`;
    return wrapRecipe();
  }

  /* ── S09 数字塔：4 组数字 + 高低柱 ── */
  if (kind === 'kpi') {
    const rows = items(4);
    const list = rows.length >= 2 ? rows : ['132K', '4.8万', '92%', '3.2×'];
    const vals = list.map((x, i) => 0.42 + ((i * 37) % 55) / 100);   // 稳定伪随机，别用 Math.random（每次重绘会跳）
    inner = `<div style="position:absolute;inset:0;z-index:2;box-sizing:border-box;padding:${PAD}px ${PAD}px ${48 * S}px;`
      + `display:flex;flex-direction:column">`
      + KICK('Data · 四组数字')
      + H1(76, `line-height:1.16;font-weight:600;color:${pal.ink};margin-bottom:${30 * S}px;`
        + `display:-webkit-box;-webkit-line-clamp:2;-webkit-box-orient:vertical;overflow:hidden`)
      + `<div style="flex:1;min-height:0;display:flex;align-items:flex-end;gap:${14 * S}px;`
      + `padding-bottom:${16 * S}px">`
      + list.map((x, i) => `<div style="flex:1;min-width:0;display:flex;flex-direction:column;`
        + `align-items:center;justify-content:flex-end;height:100%">`
        + `<div style="font-size:${Math.min(44, Math.round(220 / Math.max(3, x.length))) * S}px;`
        + `line-height:1.1;font-weight:800;letter-spacing:-.03em;color:${pal.ink};`
        + `font-variant-numeric:tabular-nums;margin-bottom:${10 * S}px;text-align:center">`
        + `${esc(x.slice(0, 5))}</div>`
        + `<div style="width:100%;height:${Math.round(vals[i] * 100)}%;`
        + `background:${i === 0 ? pal.accent : (pal.paper2 || 'rgba(128,128,128,.2)')};`
        + `${i === 0 ? '' : `border:1px solid ${pal.accent};opacity:.9;`}`
        + `min-height:${24 * S}px"></div>`
        + `<div style="font:400 ${14 * S}px/1 ${MONO};letter-spacing:.14em;color:${pal.muted};`
        + `margin-top:${10 * S}px">${String(i + 1).padStart(2, '0')}</div></div>`).join('')
      + `</div></div>`;
    return wrapRecipe();
  }

  /* 兜底：任何没命中的 kind 退回「论点」排版，绝不返回空画布 */
  inner = `<div style="position:absolute;inset:0;z-index:2;box-sizing:border-box;padding:${PAD}px;`
    + `display:flex;flex-direction:column;justify-content:center">`
    + KICK('Cover') + H1(100, `line-height:1.14;font-weight:600;color:${pal.ink}`)
    + LEAD(28, `line-height:1.64;color:${pal.muted};margin-top:${28 * S}px`)
    + `</div>`;

  return wrapRecipe();

  /* 统一出口：根节点 + 作用域 CSS + 图 + 遮罩 + 内容 */
  function wrapRecipe() {
    const shift = { top: '-26%', mid: '-9%', bottom: '0%' }[state.vpos] || '0%';
    const shiftCss = hasImg && shift !== '0%'
      ? `#${uid} .rc-body{transform:translateY(${shift})}` : '';
    return `<div class="cv-art" id="${uid}" style="${rootStyle}">`
      + `<style>${scopeCss(tmodeCss(state.tmode), '#' + uid)}${shiftCss}</style>`
      + imgEl + scrim + GRAIN
      + `<div class="rc-body" style="position:relative;z-index:2;height:100%">${inner}</div>`
      + `</div>`;
  }
}

function coverHtml(W, H, o) {
  /* 现有产品的 7 个版式走真实规格渲染；其余（本轮新加的）走下面的旧分支。
     这样「和服务器一致」与「我加的新东西」在代码里是分开的两条路，
     改一边不会顺手弄坏另一边。 */
  if (REAL_LAYS[o.lay]) return renderReal(W, H, o);
  /* 配方版式（15 套）：结构照 references/layout-recipes.md */
  if (RECIPE_KIND[o.lay]) return renderRecipe(W, H, o);

  const pal = palOf(state.pal);
  const S = W / 1080;
  const pad = 88 * S;
  const boxW = W - pad * 2;
  const fontFam = fontOf(state.font).family;
  const isSans = (state.font === 'sans') || o.lay === 'swiss' || o.lay === 'swiss-tpl';
  const ff = state.font === 'auto'
    ? ((o.lay === 'swiss' || o.lay === 'swiss-tpl') ? "'Noto Sans SC'" : "'Noto Serif SC'")
    : fontFam;

  const title = o.title || '';
  const sub = o.sub || '';
  const auth = o.auth || '';
  const kick = o.kick || '';
  const photo = o.photo || '';
  const an = o.an || null;

  const titleEl = (size, cls = '') =>
    `<h1 class="ttl ${cls}" style="font-size:${size}px;${cls === 'onPhoto' ? `color:${o.ink || '#fff'}` : ''}">${titleHtml(title)}</h1>`;
  const subEl = (size, extra = '') =>
    sub ? `<div class="sub" style="font-size:${size}px;margin-top:${Math.round(size * 0.72)}px;${extra}">${esc(sub)}</div>` : '';
  const authEl = (size, extra = '') =>
    auth ? `<div class="auth" style="font-size:${size}px;margin-top:${Math.round(size * 0.9)}px;${extra}">${esc(auth)}</div>` : '';

  let body = '';

  if (o.lay === 'image-led' || o.lay === 'card') {
    /* C2 全出血 / C5 卡片浮层 */
    const tSize = fitTitle(title, boxW * 0.96, 96 * S, 2);   // M16: 96px 起，最多 2 行
    const sSize = 36 * S;
    const blockH = (title ? (Math.ceil(chars(title).length / Math.max(1, Math.floor(boxW * 0.96 / tSize))) * tSize * 1.22) : 0)
      + (sub ? subLines(sub, boxW * 0.96, sSize) * sSize * 1.62 + sSize * 0.72 : 0)
      + (auth ? sSize * 1.9 : 0) + 30 * S;
    /* 文字位置：auto 贴底 150 / bottom 更贴底 96 / mid 居中 / top 贴顶。
       ⚠️ 位置一变，judge 的取样带必须跟着变 —— 否则文字挪到亮天空上，
          还在按底部草地算对比度，会给出「免压暗」的错误结论（这条容易漏）。 */
    const vpos = state.vpos || 'auto';
    const bottomOff = Math.round((vpos === 'bottom' ? 96 : 150) * S);
    let blkCss, zone;
    if (vpos === 'top') {
      const top = Math.round(pad * 1.05);
      blkCss = `top:${top}px;`;
      zone = [top / H, Math.min(1, (top + blockH) / H)];
    } else if (vpos === 'mid') {
      const top = Math.round((H - blockH) / 2);
      blkCss = `top:${top}px;`;
      zone = [Math.max(0, top / H), Math.min(1, (top + blockH) / H)];
    } else {
      blkCss = `bottom:${bottomOff}px;`;
      zone = [Math.max(0, 1 - (bottomOff + blockH) / H), 1];
    }
    // 遮罩覆盖「文字带 + 一点余量」。位置换了遮罩必须跟着换，
    // 否则选「顶部」时遮罩还留在底部，文字直接糊在亮天空上。
    const sTop = Math.max(0, zone[0] - 0.06);
    const sH = Math.min(1, zone[1] + 0.04) - sTop;
    const v = an ? judge(an, zone) : { ink:'#fff', alpha:0.22, verdict:'分析中', cr:0 };
    /* 磨砂：用户觉得不够清楚时的强制出口。
       只做「更强」，不给「关掉」——关掉必然看不清，那不是选项（title-page.js 同口径）。 */
    if (state.frost && an) {
      v.alpha = Math.max(v.alpha, 0.34);
      v.ink = '#fff';
      v.verdict = '已加磨砂';
    }

    if (o.lay === 'card') {
      const cw = boxW, ch = blockH + 90 * S;
      // 卡片也要跟着文字位置走，否则选了「顶部」卡片还赖在底部
      const cardBottom = vpos === 'top' ? Math.round(H - ch - pad)
        : vpos === 'mid' ? Math.round((H - ch) / 2) : bottomOff;
      body = (photo ? `<img class="ph" src="${photo}" style="inset:0;width:100%;height:100%">` : '')
        + `<div style="position:absolute;left:${pad}px;bottom:${cardBottom}px;width:${cw}px;height:${ch}px;`
        + `background:${pal.dark ? 'rgba(255,255,255,.94)' : '#fff'};border-radius:${16 * S}px;`
        + `box-shadow:0 ${24 * S}px ${60 * S}px rgba(93,74,58,.20);"></div>`
        + `<div class="blk" style="bottom:${cardBottom + 45 * S}px;left:${pad + 44 * S}px;right:${pad + 44 * S}px;">`
        + `<h1 class="ttl" style="font-size:${tSize}px;color:#1f1a14">${titleHtml(title)}</h1>`
        + (sub ? `<div class="sub" style="font-size:${sSize}px;color:#6f6557;margin-top:${Math.round(sSize * 0.72)}px">${esc(sub)}</div>` : '')
        + (auth ? `<div class="auth" style="font-size:${sSize * 0.86}px;color:#6f6557;margin-top:${Math.round(sSize * 0.9)}px">${esc(auth)}</div>` : '')
        + `</div>`;
      o._verdict = { ink:'#1f1a14', alpha:0, verdict:'卡片即保护', cr:0 };
    } else {
      body = (photo ? `<img class="ph" src="${photo}" style="inset:0;width:100%;height:100%">` : `<div style="position:absolute;inset:0;background:${pal.paper}"></div>`)
        + (v.alpha > 0
          ? `<div class="scrim" style="top:${(sTop * 100).toFixed(1)}%;height:${(sH * 100).toFixed(1)}%;`
            + `background:linear-gradient(to bottom,rgba(10,9,8,0) 0%,rgba(10,9,8,${(v.alpha * 0.55).toFixed(3)}) 22%,`
            + `rgba(10,9,8,${v.alpha.toFixed(3)}) 62%,rgba(10,9,8,${Math.min(0.36, v.alpha * 1.05).toFixed(3)}) 100%)"></div>`
          : '')
        /* ── M16 Image-Led Cover（照 references/layout-recipes.md 的骨架，不自己发挥）──
           配方硬规格：标题 Noto Serif SC **400–500**、96px 起、字距 .12em、行高 1.12、
           文字用**纸白**（不是纯白 #fff）、底部 mono 条 + 发丝线 rgba(.35)、左对齐。
           配方明令禁止：字重 700+、纯白、居中、>120px。之前这三条我全犯了。 */
        + `<div class="blk${photo ? ' onphoto' : ''}" style="${blkCss}">`
        + (kick ? `<div style="font-family:ui-monospace,monospace;font-size:${20 * S}px;`
            + `letter-spacing:.22em;text-transform:uppercase;color:${v.ink};opacity:.85;`
            + `margin-bottom:${30 * S}px">${esc(kick)}</div>` : '')
        + `<h1 class="ttl" style="font-size:${tSize}px;color:${v.ink};font-weight:500;`
            + `line-height:1.12;letter-spacing:.12em">${titleHtml(title)}</h1>`
        + (sub ? `<div class="sub" style="font-size:${30 * S}px;color:${v.ink};opacity:.88;`
            + `margin-top:${Math.round(20 * S)}px;letter-spacing:.04em">${esc(sub)}</div>` : '')
        + `<div style="margin-top:${30 * S}px;padding-top:${14 * S}px;`
            + `border-top:1px solid ${pal.dark ? 'rgba(240,233,219,.35)' : 'rgba(245,241,232,.35)'};`
            + `font-family:ui-monospace,monospace;font-size:${19 * S}px;letter-spacing:.22em;`
            + `text-transform:uppercase;color:${v.ink};opacity:.82">`
            + `${esc(auth || 'VOL. 01 — 2026 — XHS')}</div>`
        + `</div>`;
      o._verdict = v;
    }
  }

  else if (o.lay === 'magazine' || o.lay === 'magazine-tpl') {
    /* ── M01 Magazine Issue Cover（照配方四段式）──
       ① 顶部期号行（分类 / 色板）② 图片井 35–55% ③ 大衬线标题 2–4 行
       ④ 底部期号条 3–5 个要点 + 发丝线。强调色只做一条竖线/小标签，不铺面。 */
    const bandTop = Math.round(118 * S);
    const bandH = Math.round(H * 0.42);          // 配方：图占 35%–55%
    const tSize = fitTitle(title, boxW, 96 * S, 3);
    const sSize = 34 * S;
    const mono = 'ui-monospace,SFMono-Regular,Menlo,monospace';
    body =
      // ① 顶部期号行
      `<div style="position:absolute;left:${pad}px;right:${pad}px;top:${62 * S}px;display:flex;`
        + `justify-content:space-between;font-family:${mono};font-size:${19 * S}px;`
        + `letter-spacing:.2em;text-transform:uppercase;color:${pal.muted}">`
        + `<span>${esc(kick || 'EDITORIAL')}</span><span>${esc(pal.name)}</span></div>`
      // ② 图片井
      + `<div style="position:absolute;left:${pad}px;right:${pad}px;top:${bandTop}px;height:${bandH}px;`
        + `overflow:hidden;background:${pal.paper2 || pal.paper}">`
        + (photo ? `<img class="ph" src="${photo}" style="inset:0;width:100%;height:100%">` : '')
        + `</div>`
      // ③ 标题
      + `<div style="position:absolute;left:${pad}px;right:${pad}px;top:${bandTop + bandH + 54 * S}px">`
        + `<h1 class="ttl" style="font-size:${tSize}px;line-height:1.16;font-weight:500;letter-spacing:.04em">${titleHtml(title)}</h1>`
        + (sub ? `<div class="sub" style="font-size:${sSize}px;margin-top:${24 * S}px">${esc(sub)}</div>` : '')
        + `</div>`
      // ④ 底部期号条
      + `<div style="position:absolute;left:${pad}px;right:${pad}px;bottom:${86 * S}px;`
        + `border-top:1px solid ${pal.line};padding-top:${16 * S}px;display:flex;gap:${30 * S}px;`
        + `font-family:${mono};font-size:${19 * S}px;letter-spacing:.16em;text-transform:uppercase;color:${pal.muted}">`
        + `<span>01</span><span>02</span><span>03</span>`
        + `<span style="margin-left:auto">${esc(auth || '')}</span></div>`;
    o._verdict = { ink:'#1f1a14', alpha:0, verdict:'图字不重叠', cr:0 };
  }

  else if (o.lay === 'toptext') {
    /* 上下分栏：上纸写字、下 54% 放图。字永远在纸上，不用压暗。 */
    const imgTop = Math.round(H * 0.54);
    const tSize = fitTitle(title, boxW, 92 * S, 4);
    const sSize = 34 * S;
    body = `<div style="position:absolute;left:0;top:0;right:0;height:${imgTop}px;background:${pal.paper}"></div>`
      + `<div style="position:absolute;left:0;top:${imgTop}px;right:0;bottom:0;overflow:hidden;background:${pal.paper2 || pal.paper}">`
      + (photo ? `<img class="ph" src="${photo}" style="inset:0;width:100%;height:100%">` : '')
      + `</div>`
      + `<div style="position:absolute;left:${pad}px;right:${pad}px;top:0;height:${imgTop}px;display:flex;flex-direction:column;justify-content:center">`
      + (kick ? `<div class="kick" style="font-size:${19 * S}px;margin-bottom:${28 * S}px">${esc(kick)}</div>` : '')
      + `<h1 class="ttl" style="font-size:${tSize}px;line-height:1.16">${titleHtml(title)}</h1>`
      + (sub ? `<div class="sub" style="font-size:${sSize}px;margin-top:${Math.round(sSize * 0.8)}px">${esc(sub)}</div>` : '')
      + `</div>`
      + `<div style="position:absolute;left:${pad}px;right:${pad}px;top:${imgTop - 6 * S}px;height:${Math.max(2, 3 * S)}px;background:${pal.accent}"></div>`
      + (auth ? `<div class="auth" style="position:absolute;left:${pad}px;bottom:${64 * S}px;font-size:${26 * S}px;color:#fff;opacity:.92;text-shadow:0 1px 14px rgba(0,0,0,.45)">${esc(auth)}</div>` : '');
    o._verdict = { ink:'#1f1a14', alpha:0, verdict:'图字不重叠', cr:0 };
  }

  else if (o.lay === 'frame') {
    /* 相框：纸面上内缩一个细线图框，文字在框下。留白即风格。 */
    const inPad = Math.round(W * 0.09);
    const fh = Math.round(H * 0.50);
    const tSize = fitTitle(title, W - inPad * 2, 80 * S, 2);
    const sSize = 32 * S;
    body = `<div style="position:absolute;inset:0;background:${pal.paper}"></div>`
      + `<div style="position:absolute;left:${inPad}px;top:${inPad}px;width:${W - inPad * 2}px;height:${fh}px;overflow:hidden;background:${pal.paper2 || pal.paper}">`
      + (photo ? `<img class="ph" src="${photo}" style="inset:0;width:100%;height:100%">` : '')
      + `</div>`
      + `<div style="position:absolute;left:${inPad}px;top:${inPad}px;width:${W - inPad * 2}px;height:${fh}px;`
      + `border:${Math.max(1, Math.round(2.2 * S))}px solid ${pal.accent};opacity:.78"></div>`
      + `<div style="position:absolute;left:${inPad}px;right:${inPad}px;top:${inPad + fh + 72 * S}px">`
      + `<h1 class="ttl" style="font-size:${tSize}px;line-height:1.2">${titleHtml(title)}</h1>`
      + (sub ? `<div class="sub" style="font-size:${sSize}px;margin-top:${Math.round(sSize * 0.78)}px">${esc(sub)}</div>` : '')
      + `</div>`
      + (auth ? `<div class="auth" style="position:absolute;left:${inPad}px;bottom:${Math.round(inPad * 0.9)}px;font-size:${26 * S}px">${esc(auth)}</div>` : '');
    o._verdict = { ink:'#1f1a14', alpha:0, verdict:'图字不重叠', cr:0 };
  }

  else if (o.lay === 'band') {
    /* 色带压字：整图 + 底部实心色带托标题。色带必须贴到画布底。 */
    const bandH = Math.round(H * 0.34);
    const bandTop = H - bandH;
    const tSize = fitTitle(title, boxW, 100 * S, 2);
    const sSize = 34 * S;
    const onBand = pal.dark ? '#12110f' : pal.paper;
    body = (photo ? `<img class="ph" src="${photo}" style="inset:0;width:100%;height:100%">` : `<div style="position:absolute;inset:0;background:${pal.paper}"></div>`)
      + `<div style="position:absolute;left:0;right:0;top:${bandTop}px;height:${bandH}px;background:${pal.accent}"></div>`
      + `<div style="position:absolute;left:${pad}px;right:${pad}px;top:${bandTop}px;height:${bandH}px;display:flex;flex-direction:column;justify-content:center">`
      + (kick ? `<div class="kick" style="font-size:${18 * S}px;color:${onBand};opacity:.8;margin-bottom:${20 * S}px">${esc(kick)}</div>` : '')
      + `<h1 class="ttl" style="font-size:${tSize}px;line-height:1.14;color:${onBand}">${titleHtml(title)}</h1>`
      + (sub ? `<div class="sub" style="font-size:${sSize}px;margin-top:${Math.round(sSize * 0.7)}px;color:${onBand};opacity:.9">${esc(sub)}</div>` : '')
      + `</div>`
      + (auth ? `<div class="auth" style="position:absolute;left:${pad}px;bottom:${48 * S}px;font-size:${24 * S}px;color:${onBand};opacity:.72">${esc(auth)}</div>` : '');
    o._verdict = { ink:onBand, alpha:0, verdict:'色带即保护', cr:0 };
  }

  else if (o.lay === 'corner') {
    /* 角标小图：大字为主，右下角一个方形小图。 */
    const sq = Math.round(W * 0.28);
    const tSize = fitTitle(title, boxW, 108 * S, 4);
    const sSize = 36 * S;
    const sqBottom = Math.round(H * 0.10);
    body = `<div style="position:absolute;inset:0;background:${pal.paper}"></div>`
      + `<div style="position:absolute;left:${pad}px;right:${pad}px;top:${Math.round(H * 0.26)}px">`
      + (kick ? `<div class="kick" style="font-size:${19 * S}px;margin-bottom:${26 * S}px">${esc(kick)}</div>` : '')
      + `<h1 class="ttl" style="font-size:${tSize}px;line-height:1.14">${titleHtml(title)}</h1>`
      + (sub ? `<div class="sub" style="font-size:${sSize}px;margin-top:${Math.round(sSize * 0.8)}px">${esc(sub)}</div>` : '')
      + `</div>`
      + `<div style="position:absolute;right:${pad}px;bottom:${sqBottom}px;width:${sq}px;height:${sq}px;overflow:hidden;background:${pal.paper2 || pal.paper};border-radius:${6 * S}px">`
      + (photo ? `<img class="ph" src="${photo}" style="inset:0;width:100%;height:100%">` : '')
      + `</div>`
      + (auth ? `<div class="auth" style="position:absolute;left:${pad}px;bottom:${sqBottom}px;font-size:${26 * S}px">${esc(auth)}</div>` : '');
    o._verdict = { ink:'#1f1a14', alpha:0, verdict:'图字不重叠', cr:0 };
  }

  else if (o.lay === 'split') {
    /* 左文右图：竖切 56/44 */
    const splitX = Math.round(W * 0.56);
    const tSize = fitTitle(title, splitX - pad * 2, 84 * S, 4);
    const sSize = 34 * S;
    // ⚠️ 三元运算符优先级陷阱：`photo ? A : '' + B` 会被解析成 `photo ? A : ('' + B)`，
    //    有图时后面所有文字块全被丢掉（实测踩过：左文右图只剩图、没字）。必须给三元加括号。
    body = (photo ? `<img class="ph" src="${photo}" style="left:${splitX}px;top:0;width:${W - splitX}px;height:${H}px">` : '')
      + `<div style="position:absolute;left:0;top:0;width:${splitX}px;height:${H}px;background:${pal.paper}"></div>`
      + `<div class="kick" style="position:absolute;left:${pad}px;top:${120 * S}px;font-size:${19 * S}px">${esc(kick || 'FIELD NOTES')}</div>`
      + `<div style="position:absolute;left:${pad}px;width:${splitX - pad * 2}px;top:50%;transform:translateY(-50%)">`
      + `<h1 class="ttl" style="font-size:${tSize}px">${titleHtml(title)}</h1>`
      + (sub ? `<div class="sub" style="font-size:${sSize}px;margin-top:${Math.round(sSize * 0.7)}px">${esc(sub)}</div>` : '')
      + (auth ? `<div class="auth" style="font-size:${sSize * 0.86}px;margin-top:${Math.round(sSize * 0.9)}px">${esc(auth)}</div>` : '')
      + `</div>`
      + `<div style="position:absolute;left:${pad}px;bottom:${110 * S}px;width:${52 * S}px;height:${3 * S}px;background:${pal.accent}"></div>`;
    o._verdict = { ink:'#1f1a14', alpha:0, verdict:'图字不重叠', cr:0 };
  }

  else if (o.lay === 'swiss' || o.lay === 'swiss-tpl') {
    /* ── S01 Accent Cover（照配方）──
       米白或强调底 + 大细体标题 + **一个**抽象块（方/圆/对比块）+ 底部 metadata 条。
       配方原话：Use one clear concept. No decorative blobs. */
    const tSize = fitTitle(title, boxW, 104 * S, 3);
    const mono = 'ui-monospace,SFMono-Regular,Menlo,monospace';
    body = `<div style="position:absolute;inset:0;background:${pal.paper}"></div>`
      + `<div style="position:absolute;left:${pad}px;right:${pad}px;top:${60 * S}px;display:flex;`
        + `justify-content:space-between;font-family:${mono};font-size:${19 * S}px;`
        + `letter-spacing:.22em;text-transform:uppercase;color:${pal.muted}">`
        + `<span>${esc(kick || 'SWISS')}</span><span>${esc(pal.name)}</span></div>`
      // 一个抽象块：实心强调色方块 + 细描边方块（两节点关系，配方里的 "two-node diagram"）
      + `<div style="position:absolute;left:${pad}px;top:${H * 0.26}px;display:flex;align-items:center;gap:${22 * S}px">`
        + `<div style="width:${96 * S}px;height:${96 * S}px;background:${pal.accent}"></div>`
        + `<div style="width:${96 * S}px;height:${96 * S}px;border:${Math.max(1, 2 * S)}px solid ${pal.ink}"></div>`
        + `</div>`
      + `<div style="position:absolute;left:${pad}px;right:${pad}px;top:${H * 0.44}px">`
        + `<h1 class="ttl" style="font-size:${tSize}px;line-height:1.06;font-weight:300;letter-spacing:-.015em">${titleHtml(title)}</h1>`
        + (sub ? `<div class="sub" style="font-size:${34 * S}px;margin-top:${42 * S}px;max-width:${boxW * 0.86}px">${esc(sub)}</div>` : '')
        + `</div>`
      + `<div style="position:absolute;left:${pad}px;right:${pad}px;bottom:${86 * S}px;`
        + `border-top:1px solid ${pal.line};padding-top:${16 * S}px;display:flex;justify-content:space-between;`
        + `font-family:${mono};font-size:${19 * S}px;letter-spacing:.2em;text-transform:uppercase;color:${pal.muted}">`
        + `<span>${esc(auth || 'INTERNATIONAL')}</span><span>1080 × 1440</span></div>`;
    o._verdict = { ink:'#111111', alpha:0, verdict:'纯文字', cr:0 };
  }

  else if (o.lay === 'bigtype') {
    const tSize = fitTitle(title, boxW * 0.94, 148 * S, 3);
    body = `<div style="position:absolute;left:0;right:0;top:50%;transform:translateY(-50%);padding:0 ${pad}px">`
      + `<div style="width:${78 * S}px;height:${10 * S}px;background:${pal.accent};margin:0 auto ${46 * S}px"></div>`
      + `<h1 class="ttl" style="font-size:${tSize}px;font-weight:700;line-height:1.06;text-align:center">${titleHtml(title)}</h1>`
      + (sub ? `<div class="sub" style="font-size:${34 * S}px;margin-top:${44 * S}px;text-align:center">${esc(sub)}</div>` : '')
      + (auth ? `<div class="auth" style="font-size:${26 * S}px;margin-top:${40 * S}px;text-align:center">${esc(auth)}</div>` : '')
      + `</div>`;
  }

  else if (o.lay === 'quote') {
    const tSize = fitTitle(title, boxW * 0.86, 96 * S, 3);
    body = `<div class="pg-deco" style="left:${pad}px;top:${H * 0.22}px;font-size:${420 * S}px;line-height:1;opacity:.10;font-family:'Noto Serif SC',serif">“</div>`
      + `<div style="position:absolute;left:${pad}px;right:${pad}px;top:50%;transform:translateY(-50%);text-align:center">`
      + `<h1 class="ttl" style="font-size:${tSize}px;line-height:1.42">${titleHtml(title)}</h1>`
      + `<div style="width:${56 * S}px;height:${3 * S}px;background:${pal.accent};margin:${56 * S}px auto 0"></div>`
      + (sub ? `<div class="sub" style="font-size:${32 * S}px;margin-top:${44 * S}px">${esc(sub)}</div>` : '')
      + (auth ? `<div class="auth" style="font-size:${26 * S}px;margin-top:${38 * S}px">${esc(auth)}</div>` : '')
      + `</div>`;
  }

  else if (o.lay === 'number') {
    const num = (String(title).match(/(\d+)/) || [])[1] || String(new Date().getMonth() + 1).padStart(2, '0');
    body = `<div style="position:absolute;left:${pad}px;right:${pad}px;top:${H * 0.16}px">`
      + `<div style="font-family:'Noto Sans SC';font-size:${520 * S}px;font-weight:700;line-height:.86;`
      + `color:${pal.accent};opacity:.16;letter-spacing:-.04em">${esc(num)}</div>`
      + `</div>`
      + `<div class="blk" style="bottom:${H * 0.22}px;">`
      + `<h1 class="ttl" style="font-size:${fitTitle(title, boxW, 100 * S, 3)}px">${titleHtml(title)}</h1>`
      + (sub ? `<div class="sub" style="font-size:${34 * S}px;margin-top:${32 * S}px">${esc(sub)}</div>` : '')
      + (auth ? `<div class="auth" style="font-size:${26 * S}px;margin-top:${34 * S}px">${esc(auth)}</div>` : '')
      + `</div>`;
  }

  else if (o.lay === 'list') {
    /* ⚠️ 清单版式必须真有多条：只有 1 条时整页下半截全空（实测过，看着像没生成完）。
       条目不足 2 条就不该用这套 —— 由 layAvailable() 在面板层挡住，这里做兜底。 */
    const items = (sub ? sub.split(/[·、\n]/).filter(Boolean).slice(0, 5) : []);
    if (items.length < 2) {
      // 兜底：退化成「金句」的排法，绝不留半页空白
      return coverHtml(W, H, { ...o, lay: 'quote' });
    }
    // 条目少 → 行距撑开，让版面饱满；条目多 → 收窄
    const rowH = Math.min(150 * S, (H * 0.46) / items.length);
    body = `<div style="position:absolute;left:${pad}px;right:${pad}px;top:${H * 0.2}px">`
      + `<h1 class="ttl" style="font-size:${fitTitle(title, boxW, 84 * S, 2)}px">${titleHtml(title)}</h1>`
      + `<div style="width:${64 * S}px;height:${3 * S}px;background:${pal.accent};margin:${38 * S}px 0 ${48 * S}px"></div>`
      + items.map((it, i) => `<div style="display:flex;gap:${26 * S}px;align-items:flex-start;`
        + `height:${rowH}px;padding-top:${20 * S}px;border-bottom:1px solid ${pal.line}">`
        + `<span style="font-family:'Noto Sans SC';font-size:${26 * S}px;color:${pal.accentText};`
        + `font-weight:600;min-width:${44 * S}px;line-height:1.6">${String(i + 1).padStart(2, '0')}</span>`
        + `<span style="font-size:${44 * S}px;line-height:1.5">${esc(it.trim())}</span></div>`).join('')
      + `</div>`
      + (auth ? `<div class="auth" style="position:absolute;left:${pad}px;bottom:${110 * S}px;font-size:${26 * S}px">${esc(auth)}</div>` : '');
  }

  /* ══════════ 以下 8 套：参考各种标题设计风格的排版 ══════════ */

  else if (o.lay === 'stacked') {
    /* 叠压大字：标题切两行、第二行右移压在第一行下缘，字距收紧。
       杂志内页/潮流海报最常见的「大字压阵」手法。 */
    const cs = chars(title);
    const half = Math.max(1, Math.ceil(cs.length / 2));
    const l1 = cs.slice(0, half).join('');
    const l2 = cs.slice(half).join('') || '';
    const tSize = fitTitle(title, boxW * 0.94, 132 * S, 4);
    body = `<div style="position:absolute;inset:0;background:${pal.paper}"></div>`
      + `<div style="position:absolute;left:${pad}px;right:${pad}px;top:50%;transform:translateY(-50%)">`
      + `<div style="font-size:${tSize}px;line-height:.94;font-weight:700;letter-spacing:-.02em">`
      + `<span style="display:block">${esc(l1)}</span>`
      + (l2 ? `<span style="display:block;margin-left:.26em;color:${pal.accentText}">${esc(l2)}</span>` : '')
      + `</div>`
      + (sub ? `<div class="sub" style="font-size:${32 * S}px;margin-top:${44 * S}px">${esc(sub)}</div>` : '')
      + `</div>`
      + (auth ? `<div class="auth" style="position:absolute;left:${pad}px;bottom:${96 * S}px;font-size:${26 * S}px">${esc(auth)}</div>` : '');
    o._verdict = { ink:pal.ink, alpha:0, verdict:'纯文字', cr:0 };
  }

  else if (o.lay === 'outline') {
    /* 描边大字：空心标题，笔画是强调色。适合「一个词打天下」的短标题。 */
    const tSize = fitTitle(title, boxW, 168 * S, 3);
    body = `<div style="position:absolute;inset:0;background:${pal.paper}"></div>`
      + `<div style="position:absolute;left:${pad}px;right:${pad}px;top:50%;transform:translateY(-50%);text-align:center">`
      + `<div class="ttl" style="font-size:${tSize}px;line-height:1.04;font-weight:700;letter-spacing:.02em;`
      + `color:transparent;-webkit-text-stroke:${Math.max(1.5, 3 * S)}px ${pal.accentText}">${esc(title)}</div>`
      + (sub ? `<div class="sub" style="font-size:${34 * S}px;margin-top:${52 * S}px">${esc(sub)}</div>` : '')
      + `</div>`
      + (auth ? `<div class="auth" style="position:absolute;left:0;right:0;text-align:center;bottom:${96 * S}px;font-size:${26 * S}px">${esc(auth)}</div>` : '');
    o._verdict = { ink:pal.ink, alpha:0, verdict:'纯文字', cr:0 };
  }

  else if (o.lay === 'highlight') {
    /* 马克笔高亮：标题下半部压一条实心色带，像被荧光笔划过。
       比「色块当背景」轻，又比纯文字有重点。 */
    const tSize = fitTitle(title, boxW * 0.96, 112 * S, 3);
    body = `<div style="position:absolute;inset:0;background:${pal.paper}"></div>`
      + `<div style="position:absolute;left:${pad}px;right:${pad}px;top:50%;transform:translateY(-50%)">`
      + (kick ? `<div class="kick" style="font-size:${19 * S}px;margin-bottom:${30 * S}px">${esc(kick)}</div>` : '')
      + `<div class="ttl" style="font-size:${tSize}px;line-height:1.24;font-weight:700">`
      + `<span style="background:linear-gradient(transparent 56%,${pal.accent} 56% 94%,transparent 94%);`
      + `padding:0 ${8 * S}px;box-decoration-break:clone;-webkit-box-decoration-break:clone">${esc(title)}</span></div>`
      + (sub ? `<div class="sub" style="font-size:${34 * S}px;margin-top:${40 * S}px">${esc(sub)}</div>` : '')
      + `</div>`
      + (auth ? `<div class="auth" style="position:absolute;left:${pad}px;bottom:${96 * S}px;font-size:${26 * S}px">${esc(auth)}</div>` : '');
    o._verdict = { ink:pal.ink, alpha:0, verdict:'纯文字', cr:0 };
  }

  else if (o.lay === 'vertical') {
    /* 竖排：中式竖排，从右往左。长标题会自己断成多列。 */
    const tSize = fitTitle(title, H * 0.62, 96 * S, 4);
    body = `<div style="position:absolute;inset:0;background:${pal.paper}"></div>`
      + `<div style="position:absolute;right:${pad + 40 * S}px;top:${H * 0.14}px;bottom:${H * 0.16}px;`
      + `writing-mode:vertical-rl;text-orientation:upright">`
      + `<div class="ttl" style="font-size:${tSize}px;line-height:1.42;letter-spacing:.1em;font-weight:500">${esc(title)}</div>`
      + (sub ? `<div class="sub" style="font-size:${30 * S}px;margin-right:${36 * S}px;opacity:.72;`
          + `writing-mode:vertical-rl;margin-top:0">${esc(sub)}</div>` : '')
      + `</div>`
      + `<div style="position:absolute;left:${pad}px;bottom:${120 * S}px;width:${52 * S}px;height:${4 * S}px;background:${pal.accent}"></div>`
      + (auth ? `<div class="auth" style="position:absolute;left:${pad}px;bottom:${150 * S}px;font-size:${26 * S}px;`
          + `writing-mode:vertical-rl">${esc(auth)}</div>` : '');
    o._verdict = { ink:pal.ink, alpha:0, verdict:'纯文字', cr:0 };
  }

  else if (o.lay === 'duotone') {
    /* 双色标题：第一行实心，第二行只描边。对比强、有节奏。 */
    const cs = chars(title);
    const half = Math.max(1, Math.ceil(cs.length / 2));
    const l1 = cs.slice(0, half).join('');
    const l2 = cs.slice(half).join('') || '';
    const tSize = fitTitle(title, boxW, 138 * S, 4);
    body = `<div style="position:absolute;inset:0;background:${pal.paper}"></div>`
      + `<div style="position:absolute;left:${pad}px;right:${pad}px;top:50%;transform:translateY(-50%)">`
      + `<div style="font-size:${tSize}px;line-height:.98;font-weight:700">`
      + `<span style="display:block;color:${pal.ink}">${esc(l1)}</span>`
      + (l2 ? `<span style="display:block;color:transparent;-webkit-text-stroke:${Math.max(1.4, 2.6 * S)}px ${pal.accentText}">${esc(l2)}</span>` : '')
      + `</div>`
      + (sub ? `<div class="sub" style="font-size:${32 * S}px;margin-top:${46 * S}px">${esc(sub)}</div>` : '')
      + `</div>`;
    o._verdict = { ink:pal.ink, alpha:0, verdict:'纯文字', cr:0 };
  }

  else if (o.lay === 'grid') {
    /* 网格纸：细网格当底，大字压在上面。工程感/手账感。 */
    const tSize = fitTitle(title, boxW, 118 * S, 3);
    const g = Math.round(72 * S);
    body = `<div style="position:absolute;inset:0;background:${pal.paper}"></div>`
      + `<div style="position:absolute;inset:0;`
      + `background-image:linear-gradient(${pal.line} 1px,transparent 1px),linear-gradient(90deg,${pal.line} 1px,transparent 1px);`
      + `background-size:${g}px ${g}px;opacity:.55"></div>`
      + `<div style="position:absolute;left:${pad}px;right:${pad}px;top:${H * 0.30}px">`
      + `<h1 class="ttl" style="font-size:${tSize}px;line-height:1.16;font-weight:700">${titleHtml(title)}</h1>`
      + (sub ? `<div class="sub" style="font-size:${34 * S}px;margin-top:${40 * S}px">${esc(sub)}</div>` : '')
      + `</div>`
      + `<div style="position:absolute;left:${pad}px;right:${pad}px;top:${H * 0.30 - 34 * S}px;height:${3 * S}px;background:${pal.accent}"></div>`
      + (auth ? `<div class="auth" style="position:absolute;left:${pad}px;bottom:${96 * S}px;font-size:${26 * S}px">${esc(auth)}</div>` : '');
    o._verdict = { ink:pal.ink, alpha:0, verdict:'纯文字', cr:0 };
  }

  else if (o.lay === 'issue') {
    /* 期号：左上超大两位数字 + 细竖线 + 标题贴底。系列内容的「第 N 期」专用。 */
    const num = String(Math.max(1, Math.round((chars(title).length % 9) + 1))).padStart(2, '0');
    const tSize = fitTitle(title, boxW, 92 * S, 3);
    body = `<div style="position:absolute;inset:0;background:${pal.paper}"></div>`
      + `<div style="position:absolute;left:${pad}px;top:${H * 0.13}px;display:flex;align-items:flex-start;gap:${34 * S}px">`
      + `<div style="font-size:${220 * S}px;line-height:.82;font-weight:700;color:${pal.accentText};letter-spacing:-.04em">${num}</div>`
      + `<div style="width:${2 * S}px;height:${180 * S}px;background:${pal.line};margin-top:${28 * S}px"></div>`
      + `<div style="padding-top:${30 * S}px">`
      + (kick ? `<div class="kick" style="font-size:${18 * S}px;margin-bottom:${18 * S}px">${esc(kick)}</div>` : '')
      + `<div style="font-size:${28 * S}px;color:${pal.muted};letter-spacing:.14em">ISSUE ${num}</div>`
      + `</div></div>`
      + `<div class="blk" style="bottom:${150 * S}px;">`
      + `<h1 class="ttl" style="font-size:${tSize}px;line-height:1.18">${titleHtml(title)}</h1>`
      + (sub ? `<div class="sub" style="font-size:${32 * S}px;margin-top:${34 * S}px">${esc(sub)}</div>` : '')
      + `</div>`
      + (auth ? `<div class="auth" style="position:absolute;left:${pad}px;bottom:${96 * S}px;font-size:${26 * S}px">${esc(auth)}</div>` : '');
    o._verdict = { ink:pal.ink, alpha:0, verdict:'纯文字', cr:0 };
  }

  else if (o.lay === 'diagonal') {
    /* 对角分割：左下纸面写字，右上图斜切。一条 8° 的斜线把画面切开。 */
    const cut = Math.round(H * 0.52);
    const tSize = fitTitle(title, boxW * 0.9, 104 * S, 3);
    const clip = `polygon(100% 0, 100% 100%, 0 100%)`;
    body = `<div style="position:absolute;inset:0;background:${pal.paper}"></div>`
      + (photo ? `<div style="position:absolute;inset:0;overflow:hidden;clip-path:${clip}">`
          + `<img class="ph" src="${photo}" style="inset:0;width:100%;height:100%"></div>` : '')
      + `<div style="position:absolute;left:0;right:0;top:${cut}px;height:${3 * S}px;`
      + `background:${pal.accent};transform:rotate(-9deg);transform-origin:left center"></div>`
      + `<div style="position:absolute;left:${pad}px;right:${pad}px;bottom:${150 * S}px">`
      + `<h1 class="ttl" style="font-size:${tSize}px;line-height:1.14;font-weight:700">${titleHtml(title)}</h1>`
      + (sub ? `<div class="sub" style="font-size:${32 * S}px;margin-top:${34 * S}px">${esc(sub)}</div>` : '')
      + `</div>`
      + (auth ? `<div class="auth" style="position:absolute;left:${pad}px;bottom:${96 * S}px;font-size:${26 * S}px">${esc(auth)}</div>` : '');
    o._verdict = { ink:pal.ink, alpha:0, verdict:'文字在纸上', cr:0 };
  }

  else if (o.lay === 'sticker') {
    /* 贴纸：标题装在一块圆角方块里，带纸感和轻投影。像手账贴纸。 */
    const tSize = fitTitle(title, boxW * 0.82, 84 * S, 4);
    body = `<div style="position:absolute;inset:0;background:${pal.paper2 || pal.paper}"></div>`
      + (photo ? `<img class="ph" src="${photo}" style="inset:0;width:100%;height:100%;opacity:.9">` : '')
      + `<div style="position:absolute;left:${pad + 10 * S}px;right:${pad + 10 * S}px;top:50%;transform:translateY(-50%) rotate(-1.2deg);`
      + `background:${pal.paper};border-radius:${14 * S}px;padding:${64 * S}px ${48 * S}px;`
      + `box-shadow:0 ${18 * S}px ${48 * S}px rgba(20,16,10,.22)">`
      + `<h1 class="ttl" style="font-size:${tSize}px;line-height:1.22;font-weight:700">${titleHtml(title)}</h1>`
      + (sub ? `<div class="sub" style="font-size:${32 * S}px;margin-top:${34 * S}px">${esc(sub)}</div>` : '')
      + (auth ? `<div class="auth" style="font-size:${24 * S}px;margin-top:${30 * S}px">${esc(auth)}</div>` : '')
      + `</div>`;
    o._verdict = { ink:pal.ink, alpha:0, verdict:'贴纸即保护', cr:0 };
  }

  const uid = 'cv' + (coverHtml._n = (coverHtml._n || 0) + 1);
  return `<div class="cv-art${isSans ? ' sans' : ''}" id="${uid}" style="${artStyle(W, H, pal, `font-family:${ff};`)}">`
    + `<style>${scopeCss(tmodeCss(state.tmode), '#' + uid)}</style>`
    + body + `</div>`;
}

/* 文案提取（与 ui.js 的 extractStory 同口径：引语只取第一个列表项之前） */
function extract(text) {
  const lines = String(text).split(/\r?\n/).map(l => l.trim()).filter(Boolean);
  const title = (lines[0] || '').replace(/^#{1,6}\s*/, '').slice(0, 64);
  const rest = lines.slice(1);
  const before = [];
  for (const l of rest) {
    if (/^(\d+[.、)]|[-*•·])\s*/.test(l)) break;
    before.push(l);
    if (before.length >= 2) break;
  }
  // ⚠️ 小字必须「像小字」：长文里第二段是完整一句话，整句塞进封面会变成第二段正文。
  //    规则：只取第一句（到第一个句末标点），再截到 44 字 —— 封面小字是钩子，不是摘要。
  const first = before[0] || '';
  const one = first.split(/[。！？!?；;]/)[0] || first;
  const sub = one.slice(0, 44);
  return { title, sub };
}
