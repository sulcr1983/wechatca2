/* ══════════════════════════════════════════════════════════════════════
   v2/v2-data.js —— V2 原型的数据层补丁（依赖 xhs-ux-core.js）
   ─────────────────────────────────────────────────────────────────────
   为什么不改 core：core 是三个对比原型共用的渲染内核，改它会同时影响旧版，
   而这轮要证明的是「新结构」，不是「新画法」。所以数据层在这里覆盖：
     1. 配色表全量替换（20 套，三族：纸感 / 浓郁 / 暗夜，全部经 WCAG 校验）
     2. 版式表的编号与配色修正（S09 重号、大字版只剩暖色、默认色过于接近）
     3. inkOn 换成「黑白择优」，不再是亮度阈值（阈值在中间调上必错）
   ══════════════════════════════════════════════════════════════════════ */

/* ── 1. 配色：20 套 ─────────────────────────────────────────────────────
   accentText / blockInk 不是手填的，是 scripts/gen_v2_palettes.mjs 算出来的：
     · 正文（paper/ink）≥ 7
     · 强调小字（paper/accentText）≥ 4.5
     · 色块压字（blockBg/blockInk）≥ 4.5
     · 次要字（paper/muted）≥ 4.5
   20/20 全过。旧表 23 套里有 11 套不过（最差 2.26:1），根因是「按亮度阈值选黑/白」——
   中间调色块既不够黑也不够白，两边都到不了 4.5，只能把色块本身压深。 */
const V2_PALS = [
  { key:'dune', name:'沙丘暖纸', fam:'paper', dark:false, paper:'#f0e6d2', ink:'#1f1a14', muted:'#6f6557', accent:'#8f7650', accentText:'#796444', blockInk:'#0a0a0a', line:'rgba(31,26,20,.20)' },
  { key:'forest', name:'森林墨绿', fam:'paper', dark:false, paper:'#f5f1e8', ink:'#16211b', muted:'#5c6a60', accent:'#2e6b4f', accentText:'#2e6b4f', blockInk:'#ffffff', line:'rgba(22,33,27,.18)' },
  { key:'indigo', name:'靛蓝瓷白', fam:'paper', dark:false, paper:'#f2f4f5', ink:'#161c26', muted:'#5b6675', accent:'#315d93', accentText:'#315d93', blockInk:'#ffffff', line:'rgba(22,28,38,.16)' },
  { key:'kraft', name:'牛皮纸', fam:'paper', dark:false, paper:'#eedfc7', ink:'#241c12', muted:'#6b5b42', accent:'#9b5a2e', accentText:'#8f542b', blockInk:'#ffffff', line:'rgba(36,28,18,.22)' },
  { key:'classic', name:'经典墨色', fam:'paper', dark:false, paper:'#f3f0e8', ink:'#111111', muted:'#6b6459', accent:'#111111', accentText:'#111111', blockInk:'#ffffff', line:'rgba(17,17,17,.18)' },
  { key:'warm', name:'暖纸', fam:'paper', dark:false, paper:'#f4efe4', ink:'#1c1a16', muted:'#6f6a5f', accent:'#b4552f', accentText:'#ac522e', blockInk:'#ffffff', line:'rgba(28,26,22,.18)' },
  { key:'ikb', name:'克莱因蓝', fam:'paper', dark:false, paper:'#fafaf8', ink:'#111111', muted:'#6b6b66', accent:'#002FA7', accentText:'#002FA7', blockInk:'#ffffff', line:'rgba(17,17,17,.16)' },
  { key:'lemon', name:'柠檬绿', fam:'paper', dark:false, paper:'#fafaf8', ink:'#111111', muted:'#6b6b66', accent:'#C5E803', accentText:'#62720b', blockInk:'#0a0a0a', line:'rgba(17,17,17,.16)' },
  { key:'safety', name:'安全橙', fam:'paper', dark:false, paper:'#fafaf8', ink:'#111111', muted:'#6b6b66', accent:'#FF6B35', accentText:'#b8502a', blockInk:'#0a0a0a', line:'rgba(17,17,17,.16)' },

  /* 浓郁族：**纸色本身就是高饱和色**。旧版「多巴胺」只换了 accent，paper 一律 #FFF 级近白，
     16 张缩略图只出 7 种底色、画布默认仍是淡黄/淡粉 —— 这才是「颜色单调」的真因。 */
  { key:'butter', name:'黄油', fam:'bold', dark:false, paper:'#FFE066', ink:'#191400', muted:'#6B5A00', accent:'#B23A00', accentText:'#B23A00', blockInk:'#ffffff', line:'rgba(25,20,0,.26)' },
  { key:'lime', name:'青柠', fam:'bold', dark:false, paper:'#C6F432', ink:'#111700', muted:'#4E5F00', accent:'#0B5D3B', accentText:'#0B5D3B', blockInk:'#ffffff', line:'rgba(17,23,0,.28)' },
  { key:'coral', name:'珊瑚', fam:'bold', dark:false, paper:'#FF8A75', ink:'#210703', muted:'#761e11', accent:'#5B1200', accentText:'#5B1200', blockInk:'#ffffff', line:'rgba(33,7,3,.28)' },
  { key:'azure', name:'天蓝', fam:'bold', dark:false, paper:'#8FD0FF', ink:'#04121C', muted:'#14496B', accent:'#003C6B', accentText:'#003C6B', blockInk:'#ffffff', line:'rgba(4,18,28,.26)' },
  { key:'mint', name:'薄荷', fam:'bold', dark:false, paper:'#7FE3B4', ink:'#04140C', muted:'#0F5340', accent:'#00402C', accentText:'#00402C', blockInk:'#ffffff', line:'rgba(4,20,12,.26)' },
  { key:'lilac', name:'丁香', fam:'bold', dark:false, paper:'#CDB9FF', ink:'#0E0620', muted:'#4A2FA0', accent:'#2A0E7A', accentText:'#2A0E7A', blockInk:'#ffffff', line:'rgba(14,6,32,.26)' },

  { key:'midnight', name:'午夜墨金', fam:'dark', dark:true, paper:'#0e0d0c', ink:'#f0e9db', muted:'#9a917f', accent:'#d4a04a', accentText:'#d4a04a', blockInk:'#0a0a0a', line:'rgba(240,233,219,.16)' },
  { key:'ink', name:'墨夜', fam:'dark', dark:true, paper:'#12110f', ink:'#f0e9db', muted:'#9a917f', accent:'#d8a24a', accentText:'#d8a24a', blockInk:'#0a0a0a', line:'rgba(240,233,219,.16)' },
  { key:'neon', name:'夜霓青', fam:'dark', dark:true, paper:'#101018', ink:'#F2F4FF', muted:'#8B90A8', accent:'#22D3EE', accentText:'#22D3EE', blockInk:'#0a0a0a', line:'rgba(242,244,255,.16)' },
  { key:'magenta', name:'品红夜', fam:'dark', dark:true, paper:'#1A0E18', ink:'#FFE9F6', muted:'#A87E97', accent:'#FF2DAF', accentText:'#FF2DAF', blockInk:'#0a0a0a', line:'rgba(255,233,246,.16)' },
  { key:'navy', name:'深海军', fam:'dark', dark:true, paper:'#0B1220', ink:'#E8EEFF', muted:'#8794AE', accent:'#F5C542', accentText:'#F5C542', blockInk:'#0a0a0a', line:'rgba(232,238,255,.16)' },
];
PALS.length = 0;
V2_PALS.forEach((p) => PALS.push(p));

/* ── 3. 版式：编号修正 + 缩略图默认色按「视觉角色」显式指定 ──────────
   修的三件事：
   a) `number`(编号大字) 原来标 S09，与 `kpi-tower`(数字塔) 撞号 —— 配方 S09 是 KPI Tower，
      编号大字是产品原有的，没有配方出处，编号应该是「—」。
   b) 【本轮修正·对抗性复核结论】缩略图默认色原按固定数组 `ROT` 轮转，而 `palFor()`
      永远取 `pals[0]` —— 实测 16 张卡里 **6 张是铺满整块的荧光色**，且第 1 行连出 3 张。
      用户原话：「多巴胺这种样式不是说不行，但是不够好看，作为默认的界面不好看」。
      根因不是配色表（20 套本身没问题），是「把高饱和色均匀塞进缩略图第一位」这条抽样规则。
      数学轮转还有个隐患：版式**显示顺序**是 orderedLays() 重排后的（现有 → 图文 → 纯文字），
      与 LAYS 数组顺序不同，所以按数组索引算的节奏在墙上必然错位。
      改为**按版式 id 显式指定**，一个版式一个颜色 —— 可读、可控、跟显示顺序解耦。
   c) 三个视觉角色（这才是「好看」的定义，不是「消灭饱和色」）：
      ① 纸感为主：浅暖底，墙面绝大部分是可以久看的底
      ② 暗夜配重：结构型版式（清单/章节/对比/数据）给深底，语义上就该压场，同时给墙明暗层次
      ③ 浓郁点缀：**只留 2 张**（金句=丁香紫、警示清单=安全橙，橙色还贴合语义），
         位置在第 1、15 张，**不连成排** —— 饱和色是亮点不是底色。
      实测目标：16 张 = 10 纸感 + 4 暗夜 + 2 浓郁。 */
const _fixCode = { number: '—' };
LAYOUTS_FIX();
function LAYOUTS_FIX() {
  /* 每个版式一个默认色。前半是纯文字版式（决定 16 张默认墙面的观感），
     后半是图文版式（底图盖住大半，底色只影响留白区）。 */
  const THUMB = {
    /* ── 纯文字（无图时可见的 16 张）── */
    'quote':          'lilac',     // 浓郁①：墙上唯一的高饱和亮点，放在第 1 张
    'bigtype':        'warm',      // 默认选中项，必须最安静
    'list':           'midnight',
    'number':         'classic',
    'swiss':          'ikb',
    'closing-note':   'dune',
    'tall-ledger':    'kraft',
    'section-divider':'ink',
    'hero-question':  'classic',
    'pipeline':       'dune',
    'before-after':   'midnight',
    'two-signals':    'warm',
    'data-layer':     'navy',
    'takeaway':       'forest',
    'warning':        'safety',    // 浓郁②：语义就是橙色警示
    'kpi-tower':      'ikb',
    /* ── 图文（有图时插在前面，共 26 张）── */
    'image-led':      'dune',
    'magazine':       'forest',
    'field-note':     'kraft',
    'essay-split':    'dune',
    'evidence-wall':  'classic',
    'feature':        'dune',
    'atmos-thesis':   'ink',
    'marginalia':     'kraft',
    'matrix':         'ikb',
    'image-hero':     'ink',
  };
  /* 补色池：把三类色都摸得到，保证配色行不会只剩纸黄。 */
  const PAPER_EXTRA = ['warm', 'classic', 'dune', 'kraft', 'ikb'];
  const DARK_EXTRA = ['midnight', 'ink', 'navy'];
  const BOLD_EXTRA = ['lilac', 'coral', 'azure', 'mint', 'butter', 'lime'];
  LAYS.forEach((l) => {
    l.code = _fixCode[l.id] || l.code;
    l.fam = l.needImg ? 'img' : 'text';
    const own = THUMB[l.id] || (l.needImg ? 'kraft' : 'warm');
    /* 配色行：缩略图色放第一（它决定卡面，也决定一打开选中哪套），
       版式**原本的推荐色**紧跟（那是有设计意图的，别抢它的位置），
       最后补通用池 —— 纸感 / 暗夜 / 浓郁三类都摸得到。 */
    l.pals = [own, ...(l.pals || []), ...PAPER_EXTRA, ...DARK_EXTRA, ...BOLD_EXTRA]
      .filter((v, j, a) => a.indexOf(v) === j)
      .filter((v) => PALS.some((p) => p.key === v))
      .slice(0, 10);
  });
}

/* ── 4. 可见性规则（单一入口）────────────────────────────────────────
   ⚠️ 这是对需求的一处**建设性修订**，必须和用户确认：

   原需求：「没有配图 API → 只出纯文字版式；配了 → 图文版式排前」。
   实测按字面实现会产生一个死结（已复现）：
     用户上传了自己的照片（完全不需要 API）→ 图文版式依然 0 套可见，
     底部还挂着「还有 8 套图文版式 · 配个免费 Key 就出现」。
     即「有图却不能选图版式」，核心链路断在这里。

   修订：可见性跟「**当前有没有一张图**」走，Key 只决定「能不能搜」。
     · 有图（上传 / 搜到 / 示例库）→ 图文版式排前 + 纯文字版式全出
     · 无图 → 只出纯文字版式，底部一行「有图时有 8 套图文版式 →」，
       点它**去选图**（上传/搜图），而不是去配 Key
   这样既守住了「没图时别给用不了的版式」，又不会把上传用户挡在门外。 */
function layVisible(l, hasPic) {
  if (!l.needImg) return true;
  return hasPic;
}
function orderedLays(hasPic) {
  const exist = LAYS.filter((l) => l.group === 'exist' && layVisible(l, hasPic));
  const img = LAYS.filter((l) => l.group !== 'exist' && l.needImg && layVisible(l, hasPic));
  const txt = LAYS.filter((l) => l.group !== 'exist' && !l.needImg);
  // 有图：现有 → 图文 → 纯文字；无图：现有（去图）→ 纯文字
  return hasPic ? [...exist, ...img, ...txt] : [...exist, ...txt];
}
const hiddenImgCount = (hasPic) => (hasPic ? 0 : LAYS.filter((l) => l.needImg && l.group !== 'exist').length);

/* ── 5. 渲染时的「临时框架」：core 的渲染函数读全局 state ──────────────
   （renderReal/renderRecipe 内部都是 palOf(state.pal) / fontOf(state.font)，
     所以要画「别的那一张」，只能临时改全局再还原。这是 core 的设计债，
     在落地版里应该改成 o.pal / o.font 显式入参 —— 已写进方案 §7。） */
function withFrame(patch, fn) {
  const saved = {};
  for (const k in patch) { saved[k] = state[k]; state[k] = patch[k]; }
  try { return fn(); } finally { for (const k in saved) state[k] = saved[k]; }
}
const palFor = (layId) => PAL_MAP[layId] || (layOf(layId).pals || ['warm'])[0];
const PAL_MAP = {};

/* ── 5. 存储键集中登记（旧代码散在 5 个模块，clearAll 只删 5 个、漏 13 个含 2 个 Key）── */
const V2_STORE = ['prototype.pexels.key'];


