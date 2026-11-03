/* ══════════════════════════════════════════════════════════════════════
   v3/shared.js —— 三版骨架对比共用的渲染修正（依赖 ../v2/xhs-ux-core.js）
   ─────────────────────────────────────────────────────────────────────
   为什么又要一份：v2/v2-shared.js 里的资源路径是相对 v2/ 目录的
   （'./assets/fonts/'、'./assets/img/'）。v3 在隔壁目录，直接复用它会让
   7 款字体与 6 张示例图全部 404 —— 而 404 的后果不是「少个字体」，
   是 renderReal 拿不到 an，回退成「白字 + 26% 暗角」压在空白纸上，
   看起来就像「加了文字看不清」。所以这里只做路径改写 + 同样四条修正。

   数据层直接复用 ../v2/v2-data.js（20 套配色 / 可见性规则 / 临时框架），
   保证三版画出来的封面与 V2 完全一致 —— 本轮对比的只有**骨架**。
   ══════════════════════════════════════════════════════════════════════ */

const _v3RelLum = (hex) => {
  const c = [1, 3, 5].map((i) => parseInt(String(hex).replace('#', '').slice(i - 1, i + 1), 16) / 255)
    .map((v) => (v <= 0.03928 ? v / 12.92 : Math.pow((v + 0.055) / 1.055, 2.4)));
  return 0.2126 * c[0] + 0.7152 * c[1] + 0.0722 * c[2];
};
const v3Contrast = (a, b) => {
  const [x, y] = [_v3RelLum(a), _v3RelLum(b)].sort((p, q) => q - p);
  return (x + 0.05) / (y + 0.05);
};

/* 1. inkOn：黑白择优（阈值法在中间调上必错，#d4a04a 会被判成用白字） */
inkOn = (hex) => (v3Contrast(hex, '#ffffff') >= v3Contrast(hex, '#0a0a0a') ? '#ffffff' : '#0a0a0a');

/* 2. 字体路径：指回 v2/assets（13MB，不复制第二份） */
const V3_FONT_BASE = '../v2/assets/fonts/';
const _v3inj = new Set();
ensureFont = function (id) {
  const f = fontOf(id);
  if (!f.file || _v3inj.has(f.id)) return;
  _v3inj.add(f.id);
  const st = document.createElement('style');
  st.textContent = `@font-face{font-family:${f.family};font-style:normal;font-display:swap;`
    + `src:url("${V3_FONT_BASE}${f.file}") format('woff2')}`;
  document.head.appendChild(st);
  if (document.fonts && document.fonts.load) document.fonts.load(`48px ${f.family}`).catch(() => {});
};

/* 3. 标题断行：禁止孤字成行（7 字被贪心切成 6+1） */
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

/* 4. 示例图路径指回 v2/assets。
   ⚠️ core 里的原始值是 '../../public/images/xxx'（相对 docs/prototypes/），
   不是 './assets/img/' —— 那是 v2-shared.js 改写**之后**的形态。
   这里直接一步替换到底，别再套一层。 */
PHOTOS.forEach((ph) => { ph.src = ph.src.replace('../../public/images/', '../v2/assets/img/'); });
