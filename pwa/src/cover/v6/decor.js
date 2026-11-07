/* 原创装饰语汇库 —— 印刷与排版本身的装饰，不是素材站的纹样
 *
 * 用户要求：「要复杂、要图形、要好看、要多样式」，但同时也说：
 *   「这种样式在网上看到过很多，就别用了，用我们自己原创的」
 *
 * 所以这里的每一套都取自**真实印刷工艺**，并且由模板自己的参数驱动：
 *   · 标题文字 → 套色错位 / 描边大字的字形（换个标题就换一个图形）
 *   · 强调色 accent → 所有装饰的着色（不自造色值）
 *   · 明暗 dark → 混合模式与透明度（亮底用 multiply，暗底用 screen）
 *   · 页序 pageIndex → 位置微移（同一套模板的不同页也不完全一样）
 *
 * 全部落在 .fx 层（文字层 .page 之下），不抢正文。
 * 每个函数返回 SVG 内联片段字符串。
 */

/** SVG 里用到的字体族名（与 story-system 的 @font-face 一致） */
const SERIF = 'NotoSerifSC, Songti SC, serif';
const SANS = 'NotoSansSC, PingFang SC, sans-serif';

/** 取标题的安全片段（去掉书名号与首尾空白，避免装饰里出现标点） */
function bare(s) {
  return String(s || '')
    .replace(/^[《【「『("'']+/, '')
    .replace(/[》】」』)"'']+$/, '')
    .replace(/[，。！？；：、,.!?;:]/g, '')
    .trim();
}

/* ──────────────────────────────────────────────────────────────
 * 1. 套色错位（misregistration）
 *    真实印刷里四色版没对准会出现边缘叠影。这里把标题文字复制成一个
 *    SVG 路径文字，偏移几像素、只留强调色轮廓 → 像印偏了一版。
 * ────────────────────────────────────────────────────────────── */
export function misregistration(p, ctx) {
  const t = bare(ctx.text);
  if (!t) return '';
  const line = [...t].slice(0, 8).join('');
  /* 落点用固定网格（不试图对齐真实标题基线 —— 那个位置随分页变化，
     算不准就会压在正文上）。四个落点按页序轮转，错位偏移固定。 */
  const spots = [
    [96, 1236], [1080 - 96, 300], [96, 470], [1080 - 96, 1236],
  ];
  const [x, y] = spots[ctx.pageIndex % spots.length];
  const anchor = ctx.pageIndex % 4 === 1 || ctx.pageIndex % 4 === 3 ? 'end' : 'start';
  const dx = 5 + (ctx.pageIndex % 3);
  const dy = 4 + ((ctx.pageIndex + 1) % 3);
  const size = 118;
  const op = p.dark ? '.26' : '.18';
  return `
  <g style="mix-blend-mode:${p.dark ? 'screen' : 'multiply'}">
    <text x="${x + dx}" y="${y + dy}" font-family="${SERIF}" font-size="${size}px"
      font-weight="700" fill="${p.accent}" fill-opacity="${op}" letter-spacing=".01em"
      text-anchor="${anchor}">${escapeXml(line)}</text>
    <text x="${x}" y="${y}" font-family="${SERIF}" font-size="${size}px"
      font-weight="700" fill="none" stroke="${p.ink}" stroke-opacity=".16"
      stroke-width="1.1" letter-spacing=".01em"
      text-anchor="${anchor}">${escapeXml(line)}</text>
  </g>`;
}

/* ──────────────────────────────────────────────────────────────
 * 2. 描边大字（outline display）
 *    把标题首字放大成水印级的大字，只描边不填充 —— 版式设计里的
 *    「字母压底」手法（letterpress counter），不是贴图。
 * ────────────────────────────────────────────────────────────── */
export function outlineGlyph(p, ctx) {
  const t = bare(ctx.text);
  if (!t) return '';
  const ch = [...t][0];
  const sw = p.dark ? '.55' : '.35';
  /* 位置按页序轮转，避免每页都压在同一个角 */
  const spots = [
    [1080 - 330, 1440 - 210], [70, 430], [1080 - 300, 520], [110, 1440 - 180],
  ];
  const [x, y] = spots[ctx.pageIndex % spots.length];
  return `
  <text x="${x}" y="${y}" font-family="${SERIF}" font-size="420px" font-weight="700"
    fill="none" stroke="${p.accent}" stroke-opacity="${sw}"
    stroke-width="1.6" letter-spacing="-.02em">${escapeXml(ch)}</text>`;
}

/* ──────────────────────────────────────────────────────────────
 * 3. 竖排刊刻线（index rule）
 *    书籍书口/index 用的竖线组：一组长短不一的竖线 + 页序刻度，
 *    长度随页序递增 —— 像翻书时手指滑过的位置。
 * ────────────────────────────────────────────────────────────── */
export function indexRule(p, ctx) {
  const x0 = 1080 - 52;
  const n = 14;
  const out = [];
  for (let i = 0; i < n; i++) {
    const y = 260 + i * 62;
    const len = i <= ctx.pageIndex * 4 ? 26 : 11;
    out.push(`<path d="M${x0},${y} h-${len}"/>`);
  }
  return `<g stroke="${p.accent}" stroke-opacity=".38" stroke-width="1.4" fill="none">
    ${out.join('')}
  </g>
  <path d="M${x0},250 V${260 + n * 62}" stroke="${p.ink}" stroke-opacity=".12"/>`;
}

/* ──────────────────────────────────────────────────────────────
 * 4. 校对括线（proof bracket）
 *    校对稿上用粗括号标出待改区域。四个角的 L 形粗线 + 中间断开，
 *    做成「版面正在被标记」的观感。
 * ────────────────────────────────────────────────────────────── */
export function proofBracket(p, ctx) {
  const m = 56, L = 132;
  const w = 3.2;
  const g = p.dark ? '.42' : '.30';
  return `<g stroke="${p.accent}" stroke-opacity="${g}" stroke-width="${w}" fill="none">
    <path d="M${m},${m + L} V${m} H${m + L}"/>
    <path d="M${1080 - m - L},${m} H${1080 - m} V${m + L}"/>
    <path d="M${m},${1440 - m - L} V${1440 - m} H${m + L}"/>
    <path d="M${1080 - m - L},${1440 - m} H${1080 - m} V${1440 - m - L}"/>
  </g>`;
}

/* ──────────────────────────────────────────────────────────────
 * 5. 线雕渐层（engraving hatch）
 *    铜版画/木口木刻的排线：线条密度渐变造出灰阶。
 *    这是真实版画工艺，不是「斜线纹理」这种素材贴图。
 * ────────────────────────────────────────────────────────────── */
export function engraving(p, ctx) {
  const lines = [];
  const rows = 34;
  /* ⚠️ 必须留在**左侧页边距内**（x < 96），不能压正文。
   *    原来从 1080-96 往左排到 763，而正文右边界是 984 → 排线穿字
   *    （有头截图实测「pass behind the black typography」）。 */
  for (let i = 0; i < rows; i++) {
    const y = 200 + i * 28;
    if (y > 1300) break;                    // 避开页脚
    /* 越靠下越密：条数递增 */
    const n = 2 + Math.floor(i / 6);
    for (let k = 0; k < n; k++) {
      const x = 88 - k * 15 - (i % 4) * 3;
      if (x < 12) break;
      lines.push(`<path d="M${x},${y} h-11"/>`);
    }
  }
  return `<g stroke="${p.ink}" stroke-opacity="${p.dark ? '.24' : '.16'}"
    stroke-width="1.1" fill="none">${lines.join('')}</g>`;
}

/* ──────────────────────────────────────────────────────────────
 * 6. 朱印（seal）
 *    中式印章：方框 + 内框 + 竖排文字（取标题首 2 字）。
 *    文字跟着标题走 —— 换个标题就是另一枚印。
 * ────────────────────────────────────────────────────────────── */
export function seal(p, ctx) {
  const t = bare(ctx.text);
  if (!t) return '';
  const chars = [...t].slice(0, 2);
  const x = 1080 - 200, y = 1440 - 250, s = 108;
  return `<g fill="none" stroke="${p.accent}" stroke-opacity=".75">
    <rect x="${x}" y="${y}" width="${s}" height="${s}" stroke-width="3"/>
    <rect x="${x + 9}" y="${y + 9}" width="${s - 18}" height="${s - 18}" stroke-width="1"/>
  </g>
  <text x="${x + s / 2}" y="${y + 40}" font-family="${SERIF}" font-size="34px"
    fill="${p.accent}" fill-opacity=".8" text-anchor="middle">${escapeXml(chars[0] || '')}</text>
  <text x="${x + s / 2}" y="${y + 80}" font-family="${SERIF}" font-size="34px"
    fill="${p.accent}" fill-opacity=".8" text-anchor="middle">${escapeXml(chars[1] || '')}</text>`;
}

/* ──────────────────────────────────────────────────────────────
 * 7. 边色带（edge band）
 *    整幅色带压在版心边缘，像书脊的颜色标识。
 *    宽度按页序变化（封面最宽），并带一道纸色细缝 —— 像压印。
 * ────────────────────────────────────────────────────────────── */
export function edgeBand(p, ctx) {
  const w = 26 + (ctx.pageIndex === 0 ? 14 : 0) + (ctx.pageIndex % 3) * 5;
  const op = p.dark ? '.42' : '.30';
  return `<g>
    <rect x="0" y="0" width="${w}" height="1440" fill="${p.accent}" opacity="${op}"
      style="mix-blend-mode:${p.dark ? 'screen' : 'multiply'}"/>
    <path d="M${w + 7},0 V1440" stroke="${p.ink}" stroke-opacity=".10" stroke-width="1"/>
    <path d="M${w + 12},0 V1440" stroke="${p.accent}" stroke-opacity=".16" stroke-width="1"/>
  </g>`;
}

/* ──────────────────────────────────────────────────────────────
 * 8. 双色叠印（duotone overlay）
 *    两个大色块以 multiply/screen 交叠，形成印刷的「双色」观感。
 *    角度与尺寸按页序轮转 —— 同一模板不同页也不同。
 * ────────────────────────────────────────────────────────────── */
export function duotone(p, ctx) {
  const ang = [18, 200, 138, 320][ctx.pageIndex % 4];
  const rad = (ang * Math.PI) / 180;
  const w = 1080, h = 1440;
  const cx = w / 2, cy = h / 2;
  const dx = Math.cos(rad) * 900, dy = Math.sin(rad) * 900;
  const mode = p.dark ? 'screen' : 'multiply';
  return `<g style="mix-blend-mode:${mode}">
    <path d="M${cx - dx},${cy - dy} L${cx + dy * 0.6},${cy - dx * 0.6}
      L${cx + dx},${cy + dy} L${cx - dy * 0.6},${cy + dx * 0.6} Z"
      fill="${p.accent}" opacity="${p.dark ? '.20' : '.13'}"/>
    <circle cx="${980}" cy="${1180}" r="360" fill="${p.accentSoft || p.accent}"
      opacity="${p.dark ? '.16' : '.10'}"/>
  </g>`;
}

/* ──────────────────────────────────────────────────────────────
 * 9. 扉页框（title page frame）
 *    古典书籍扉页的双层细框：外框细、内框更细，四边留不对称的距离
 *    造出「装订边」暗示。真实书籍排版手法。
 * ────────────────────────────────────────────────────────────── */
export function titleFrame(p, ctx) {
  const outer = { l: 62, r: 46, t: 62, b: 50 };
  const inner = { l: 74, r: 34, t: 74, b: 38 };
  return `<g fill="none" stroke="${p.accent}">
    <rect x="${outer.l}" y="${outer.t}"
      width="${1080 - outer.l - outer.r}" height="${1440 - outer.t - outer.b}"
      stroke-opacity=".34" stroke-width="1.6"/>
    <rect x="${inner.l}" y="${inner.t}"
      width="${1080 - inner.l - inner.r}" height="${1440 - inner.t - inner.b}"
      stroke-opacity=".16" stroke-width="1"/>
  </g>`;
}

/* ──────────────────────────────────────────────────────────────
 * 10. 竖排书耳（vertical ear）
 *     古籍书页左侧的「书耳」：一窄条，内含竖排小字。
 *     文字取标题尾部，竖排 —— 换标题即换内容。
 * ────────────────────────────────────────────────────────────── */
export function bookEar(p, ctx) {
  const t = bare(ctx.text);
  const tail = [...t].slice(-4).join('');
  if (!tail) return '';
  const x = 40;
  return `<g>
    <path d="M${x + 22},${96} V${96 + 260}" stroke="${p.accent}"
      stroke-opacity=".40" stroke-width="1.6"/>
    <text x="${x + 16}" y="${96 + 24}" font-family="${SERIF}" font-size="24px"
      fill="${p.muted}" fill-opacity=".55" writing-mode="tb"
      letter-spacing=".16em">${escapeXml(tail)}</text>
  </g>`;
}

/** XML 文本转义（SVG 内联用） */
function escapeXml(s) {
  return String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;')
    .replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}

/* ──────────────────────────────────────────────────────────────
 * 组合规则：每张卡 2 套，**组合互不重复**。
 *
 * ⚠️ 原来用「消费式轮转」（pick 一次标记已用，用完清空重来），
 *    实测 23 张卡只得到 11 种组合（misregistration 被用了 7 次）——
 *    用户要「多样式」，这不够。
 *
 * 改成确定性阶梯：主 = k % n，辅 = (主 + 1 + floor(k / n)) % n
 *   n=10 时，23 张卡的主手法均匀分布（每套 2–3 次），
 *   且任意两张卡的组合都不同（实测 23/23 唯一）。
 * ────────────────────────────────────────────────────────────── */
export const ALL_DECOR = [
  'misregistration', 'outlineGlyph', 'indexRule', 'proofBracket',
  'engraving', 'seal', 'edgeBand', 'duotone', 'titleFrame', 'bookEar',
];

export const DECOR_FN = {
  misregistration, outlineGlyph, indexRule, proofBracket,
  engraving, seal, edgeBand, duotone, titleFrame, bookEar,
};

/** 给一组模板分配装饰（每张 2 套，组合全局唯一）。 */
export function assignDecor(list) {
  const n = ALL_DECOR.length;
  for (let k = 0; k < list.length; k++) {
    const a = k % n;
    const b = (a + 1 + Math.floor(k / n)) % n;
    /* b 永远不等于 a（+1 起步，且 floor(k/n) < n） */
    list[k].decor = [ALL_DECOR[a], ALL_DECOR[b === a ? (a + 1) % n : b]];
  }
  return list;
}

/** 渲染某张卡的全部装饰层。 */
export function renderDecor(tplDecor, p, ctx) {
  const parts = [];
  for (const key of (tplDecor || [])) {
    const fn = DECOR_FN[key];
    if (fn) {
      try { parts.push(fn(p, ctx)); } catch { /* 单套失败不影响整页 */ }
    }
  }
  return parts.filter(Boolean).join('\n');
}