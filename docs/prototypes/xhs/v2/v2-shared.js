/* ══════════════════════════════════════════════════════════════════════
   v2/v2-shared.js —— V2 两页共用的三处修正（不碰配色表与版式表）
   ─────────────────────────────────────────────────────────────────────
   为什么拆出来：配色表是**标题图**的 20 套新表，长图文页有它自己的一套
   （来自 cards.js 的 8 套 + 产品线 5 套）。把新表硬塞进去，长图文按 key 查名字
   会大面积回落成「沙丘暖纸」——实测 13 个色卡有 10 个同名。
   所以只共用「纯函数级」的修正：对比度取色、字体路径、标题断行、示例图路径。
   ══════════════════════════════════════════════════════════════════════ */

const _relLum = (hex) => {
  const c = [1, 3, 5].map((i) => parseInt(String(hex).replace('#', '').slice(i - 1, i + 1), 16) / 255)
    .map((v) => (v <= 0.03928 ? v / 12.92 : Math.pow((v + 0.055) / 1.055, 2.4)));
  return 0.2126 * c[0] + 0.7152 * c[1] + 0.0722 * c[2];
};
const v2Contrast = (a, b) => { const [x, y] = [_relLum(a), _relLum(b)].sort((p, q) => q - p); return (x + 0.05) / (y + 0.05); };

/* 1. inkOn：黑白择优。旧实现按亮度阈值（lum > .42 → 黑）在中间调上必错：
   #d4a04a（lum .38）被判成「用白字」→ 2.35:1，肉眼几乎看不见。 */
inkOn = (hex) => (v2Contrast(hex, '#ffffff') >= v2Contrast(hex, '#0a0a0a') ? '#ffffff' : '#0a0a0a');

/* 2. 字体路径：core 的 `../../../../pwa/...` 是相对 docs/prototypes/ 的，
   本目录深一层，7 个 woff2 会全部 404（字体胶囊退化成同一种字形）。 */
/* 自包含：字体与示例图都已拷进 ./assets/。
   原型会被当成静态站点托管（只暴露本目录），任何 `../` 都会 404。 */
const V2_FONT_BASE = './assets/fonts/';
const _v2inj = new Set();
ensureFont = function (id) {
  const f = fontOf(id);
  if (!f.file || _v2inj.has(f.id)) return;
  _v2inj.add(f.id);
  const st = document.createElement('style');
  st.textContent = `@font-face{font-family:${f.family};font-style:normal;font-display:swap;`
    + `src:url("${V2_FONT_BASE}${f.file}") format('woff2')}`;
  document.head.appendChild(st);
  if (document.fonts && document.fonts.load) document.fonts.load(`48px ${f.family}`).catch(() => {});
};

/* 3. 标题断行：禁止「孤字成行」。
   fitTitle 原本在行数上限内尽量放大，贪心换行会把 7 个字切成 6+1，
   画面上最后一行孤零零一个字（实测大字版「周末去了趟海 / 边」）。 */
fitTitle = function (text, boxW, base, maxLines = 3) {
  const n = Math.max(1, chars(text).length);
  for (let size = base; size > base * 0.55; size -= 2) {
    const cpl = Math.max(1, Math.floor(boxW / size));
    const lines = Math.ceil(n / cpl);
    if (lines > maxLines) continue;
    const last = n - cpl * (lines - 1);
    if (lines > 1 && last === 1 && n >= 4) continue;
    if (lines > 1 && last === 2 && cpl >= 6) continue;
    return size;
  }
  return Math.round(base * 0.55);
};

/* 4. 示例图路径同样深一层；404 的后果不是「没图」，是 renderReal 拿不到 an，
   回退成「白字 + 26% 暗角」压在空白纸上 —— 就是用户说的「加了文字看不清」。 */
PHOTOS.forEach((ph) => { ph.src = ph.src.replace('../../../../public/images/', './assets/img/'); });
