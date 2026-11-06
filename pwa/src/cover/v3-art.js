/* 标题图 V3 · SVG 装饰层（2026-11-06）
 *
 * 为什么加这一层：现有 53 套模板的底色全是**纯色平铺**（`background: ${pal.paper}`），
 * 纸感只靠配色暗示，放大看是一张纯色卡纸。参考同项目长图文模块的做法
 * （docs/prototypes/xhs/longform-art/art-system.js + graphics.js）：
 *   · 编辑风禁止纯色纸底，必须 3–5 层（纸基 / 纸纹 / 墨染 / 结构线 / 内容）
 *   · 动势用**静态 SVG** 实现，导出即 PNG，不做 WebGL
 *   · 该模块已实测：modern-screenshot 能正确导出 feTurbulence / radialGradient /
 *     clipPath —— 与本模块用的是同一条导出管线（render.js → domToBlob），
 *     所以这里的 SVG 不会出现「预览好看、导出丢失」（对比 ::first-letter 的教训）。
 *
 * 设计取舍：
 *   · 图案**按版式语义绑定**（金句→圆相、证据墙→印章矩阵、瑞士→几何切割…），
 *     不是同一张背景换 opacity —— 后者正是用户反馈「都长得差不多」的成因。
 *   · 全部用 viewBox 0 0 1080 1440 + preserveAspectRatio="xMidYMid slice"：
 *     3:4 精确铺满；1:1 / 21:9 按裁切而不是拉伸（圆不会变成椭圆）。
 *   · 装饰层 z-index:0，与 .cover-img 同层但**在其之前**注入 ——
 *     有底图时照片盖住装饰（照片本身就是纹理），无底图时纸感由 SVG 承担。
 *   · 密度统一压到「看得见但不抢字」（stroke-opacity ≤ .3），
 *     标题图的主角是文字，装饰只负责让底色不再是一块死板纯色。
 */

/** 生成唯一 id 后缀，避免同页多个 SVG defs 互相覆盖。 */
let seq = 0;

const NOISE = (id, dark) => `
  <filter id="gr${id}"><feTurbulence type="fractalNoise" baseFrequency="0.9" numOctaves="3" stitchTiles="stitch"/>
    <feColorMatrix type="saturate" values="0"/></filter>
  <rect width="1080" height="1440" filter="url(#gr${id})" opacity="${dark ? '.07' : '.085'}"/>`;

const WASH = (id, c, dark) => `
  <radialGradient id="w${id}" cx="20%" cy="12%" r="72%">
    <stop offset="0%" stop-color="${c}" stop-opacity="${dark ? '.16' : '.13'}"/>
    <stop offset="100%" stop-color="${c}" stop-opacity="0"/></radialGradient>
  <radialGradient id="v${id}" cx="86%" cy="88%" r="54%">
    <stop offset="0%" stop-color="${c}" stop-opacity="${dark ? '.10' : '.08'}"/>
    <stop offset="100%" stop-color="${c}" stop-opacity="0"/></radialGradient>
  <rect width="1080" height="1440" fill="url(#w${id})"/>
  <rect width="1080" height="1440" fill="url(#v${id})"/>`;

/* ── 图案：每个返回 body（defs 之外的可见部分）─────────────────────
   坐标一律按 1080×1440 书写，靠 viewBox 适配三种尺寸。 */
const PATTERNS = {
  /* 圆相：同心圆 + 断笔弧，适合金句/氛围论点这类「一句大论点」 */
  enso: (p) => `
    <circle cx="760" cy="420" r="300" fill="url(#w${p.id})"/>
    <circle cx="760" cy="420" r="232" fill="none" stroke="${p.a}" stroke-opacity=".34"
      stroke-width="12" stroke-dasharray="1320 90" stroke-linecap="round"
      transform="rotate(-28 760 420)"/>
    <circle cx="760" cy="420" r="256" fill="none" stroke="${p.a}" stroke-opacity=".13" stroke-width="1"/>`,

  /* 山水层叠：三层波浪，适合纪实照片/氛围类 */
  mountain: (p) => {
    const ridge = (y, o, fill) => `<path d="M-20,${y} Q200,${y - 150} 420,${y - 40} T800,${y - 90} T1100,${y - 20} L1100,1470 L-20,1470 Z" fill="${fill}" opacity="${o}"/>`;
    return `${ridge(980, '.09', p.a)}${ridge(1080, '.11', p.s)}${ridge(1190, '.13', p.a)}
      <circle cx="800" cy="250" r="82" fill="${p.a}" opacity=".18"/>`;
  },

  /* 折枝：程序化枝干 + 花点，适合分栏/收尾寄语这类留白多的版式 */
  branch: (p) => {
    const dots = [[860, 180], [900, 240], [820, 300], [940, 330], [860, 400], [790, 380], [960, 220]]
      .map(([x, y], i) => `<circle cx="${x}" cy="${y}" r="${7 + (i % 3) * 4}" fill="${p.a}" opacity="${.18 + (i % 4) * .07}"/>`).join('');
    return `<g fill="none" stroke="${p.a}" stroke-opacity=".24" stroke-linecap="round">
        <path d="M1080,120 Q900,220 860,420 Q830,560 700,700" stroke-width="3"/>
        <path d="M900,220 Q960,240 1000,320" stroke-width="1.5"/>
        <path d="M860,420 Q780,400 740,450" stroke-width="1.5"/></g>
      ${dots}`;
  },

  /* 印章矩阵：九宫格，适合证据墙/矩阵/警示清单这类「格状」版式 */
  seals: (p) => {
    const cells = Array.from({ length: 9 }, (_, i) => {
      const x = 120 + (i % 3) * 300; const y = 300 + Math.floor(i / 3) * 300;
      return `<rect x="${x}" y="${y}" width="220" height="220" fill="none" stroke="${p.a}"
        stroke-opacity="${i === 4 ? '.30' : '.11'}" stroke-width="${i === 4 ? 2 : 1}"/>`;
    }).join('');
    return `${cells}<path d="M96,270 H984 M96,1240 H984" stroke="${p.a}" stroke-opacity=".18" stroke-width="2"/>`;
  },

  /* 等高线：密集曲线，适合多栏正文/横条排行这类「流」的版式 */
  contour: (p) => `
    <defs><clipPath id="c${p.id}"><rect width="1080" height="1440"/></clipPath></defs>
    <g clip-path="url(#c${p.id})" fill="none" stroke="${p.a}" stroke-opacity=".16" stroke-width="1.1">
      ${Array.from({ length: 20 }, (_, i) => {
    const y = 180 + i * 56; const c = 420 + Math.sin(i * 0.6) * 260;
    return `<path d="M-40,${y} Q${c},${y - 190 - i * 4} 1120,${y + 60}"/>`;
  }).join('')}
    </g>`,

  /* 拱窗：建筑拱券，适合图文封面/实证特写这类「框住内容」的版式 */
  arch: (p) => `
    <path d="M150,1300 V560 A390,390 0 0 1 930,560 V1300 Z"
      fill="${p.s}" fill-opacity=".09" stroke="${p.a}" stroke-opacity=".24" stroke-width="2"/>
    <path d="M210,1300 V570 A330,330 0 0 1 870,570 V1300 Z"
      fill="none" stroke="${p.a}" stroke-opacity=".13" stroke-width="1"/>
    <path d="M540,240 V1300" stroke="${p.a}" stroke-opacity=".10" stroke-width="1"/>`,

  /* 星轨：极坐标射线，适合编号/数字塔这类「放射」版式 */
  orbit: (p) => {
    const rays = Array.from({ length: 26 }, (_, i) => {
      const ang = (i * Math.PI) / 13; const x = 760 + Math.cos(ang) * 520; const y = 420 + Math.sin(ang) * 520;
      return `<line x1="760" y1="420" x2="${x.toFixed(0)}" y2="${y.toFixed(0)}" stroke="${p.a}" stroke-opacity=".09" stroke-width="1"/>`;
    }).join('');
    return `${rays}
      <circle cx="760" cy="420" r="120" fill="none" stroke="${p.a}" stroke-opacity=".20" stroke-width="1"/>
      <circle cx="760" cy="420" r="236" fill="none" stroke="${p.a}" stroke-opacity=".12" stroke-width="1"/>
      <circle cx="760" cy="420" r="340" fill="none" stroke="${p.a}" stroke-opacity=".08" stroke-width="1"/>`;
  },

  /* 织纹：斜向交叉线 + 双框，适合清单/账本这类「密排」版式 */
  weave: (p) => `
    <defs><clipPath id="d${p.id}"><rect width="1080" height="1440"/></clipPath></defs>
    <g clip-path="url(#d${p.id})" fill="none" stroke="${p.a}" stroke-opacity=".065" stroke-width="1">
      ${Array.from({ length: 24 }, (_, i) => {
    const o = -400 + i * 70;
    return `<path d="M${o},0 L${o + 1440},1440"/><path d="M${o + 1440},0 L${o},1440"/>`;
  }).join('')}
    </g>
    <rect x="96" y="96" width="888" height="1248" fill="none" stroke="${p.a}" stroke-opacity=".18" stroke-width="1"/>`,

  /* 水波：同心椭圆 + 落点，适合收尾寄语这类「下沉」版式 */
  ripple: (p) => `
    ${Array.from({ length: 13 }, (_, i) =>
    `<ellipse cx="540" cy="1120" rx="${90 + i * 62}" ry="${26 + i * 17}" fill="none"
      stroke="${p.a}" stroke-opacity="${(0.26 - i * 0.017).toFixed(3)}" stroke-width="${i < 3 ? 2 : 1}"/>`).join('')}
    <circle cx="540" cy="1120" r="11" fill="${p.a}" opacity=".42"/>`,

  /* 几何切割：斜切色块 + 竖网格，适合瑞士/大字/撞色这类「构成」版式 */
  cut: (p) => `
    <path d="M0,0 H1080 V420 L0,760 Z" fill="${p.a}" fill-opacity=".09"/>
    <path d="M0,900 L1080,560 V1440 H0 Z" fill="${p.s}" fill-opacity=".09"/>
    <path d="M0,760 L1080,420 M0,900 L1080,560" stroke="${p.a}" stroke-opacity=".26" stroke-width="2"/>
    <g stroke="${p.a}" stroke-opacity=".10" stroke-width="1">
      ${Array.from({ length: 9 }, (_, i) => `<path d="M${120 + i * 108},0 V1440"/>`).join('')}
    </g>`,
};

/** 版式 → 图案。按语义绑定，不复用同一张背景。 */
const BY_LAYOUT = {
  /* 现有 7 */
  'image-led': 'arch', magazine: 'contour', quote: 'enso', bigtype: 'cut',
  list: 'weave', number: 'orbit', swiss: 'cut',
  /* 配方 23 */
  'field-note': 'mountain', 'essay-split': 'branch', 'evidence-wall': 'seals',
  feature: 'arch', 'atmos-thesis': 'enso', marginalia: 'contour', matrix: 'seals',
  'closing-note': 'ripple', 'tall-ledger': 'weave', 'section-divider': 'cut',
  'hero-question': 'enso', pipeline: 'orbit', 'before-after': 'cut',
  'two-signals': 'contour', 'data-layer': 'weave', 'image-hero': 'arch',
  takeaway: 'branch', warning: 'seals', 'kpi-tower': 'orbit',
  'browser-mock': 'weave', 'pipeline-arch': 'orbit', 'h-bar': 'contour',
  'stacked-ledger': 'weave',
  /* 结构型 3 */
  'text-wrap': 'branch', 'multi-column': 'contour', 'bleed-overlap': 'arch',
};

/** 刺激风没有明确语义，按序循环分配，让相邻卡视觉上一眼能分开。 */
const BOLD_CYCLE = ['cut', 'orbit', 'enso', 'seals', 'contour', 'branch', 'arch', 'ripple'];

const BOLD_LAYOUTS = [
  'bold-banner', 'neon-glow', 'sticker-box', 'split-clash', 'mega-number',
  'highlighter', 'vertical-impact', 'half-clash', 'diagonal', 'card-stack',
  'bands', 'ring-focus', 'tag-flow', 'frame-hit', 'corner-num', 'three-grid',
  'mega-char', 'sticky-notes', 'marquee', 'tilt-block',
];
BOLD_LAYOUTS.forEach((id, i) => { BY_LAYOUT[id] = BOLD_CYCLE[i % BOLD_CYCLE.length]; });

/** 该版式用哪种图案（未知版式回落到 cut，保证总有纸感）。 */
export function artPatternFor(layout) {
  return BY_LAYOUT[layout] || 'cut';
}

/**
 * 生成装饰层 SVG。
 *
 * @param {{paper:string, accent:string, accentSoft?:string, dark?:boolean}} pal
 * @param {string} layout  版式 id（决定图案）
 * @returns {string} 可直接插进 .poster 内部的 <svg>
 */
export function artLayer(pal, layout) {
  const pat = artPatternFor(layout);
  const fn = PATTERNS[pat];
  if (!fn) return '';
  seq += 1;
  const id = `t${seq}`;
  const p = {
    id,
    a: pal.accent,
    s: pal.accentSoft || pal.accent,
    dark: !!pal.dark,
  };
  return `<svg class="art" viewBox="0 0 1080 1440" preserveAspectRatio="xMidYMid slice" aria-hidden="true">
    <defs>${NOISE(id, p.dark)}${WASH(id, p.dark ? p.a : p.s, p.dark)}</defs>
    ${fn(p)}
  </svg>`;
}

/** 装饰层的 CSS（固定一条，随 SVG 一起注入）。 */
export const ART_CSS = `
  .poster > .art{position:absolute;inset:0;width:100%;height:100%;z-index:0;pointer-events:none}
  /* ⚠️ 2026-11-06 实测堆叠顺序：applyImage 会把底图插到 poster 开标签之后，
     装饰层也插在同一位置，两者同为 z-index:0 时后插入者在上 ——
     **装饰层会盖在照片上**（实测 art@8467 > img@8371）。
     取舍：装饰层只为治疗「纯色平铺像一张卡纸」，而有照片时这问题根本不存在
     （照片本身就是纹理）。所以有底图时直接隐藏，而不是压淡 ——
     压淡会留下可见的弧线/网格蒙在照片上，像脏点，反而降低质感。
     ⚠️ 注意：本注释里**不能写图片标签的字面量**，applyImage 是按字符串
        全局正则替换的，注释里的标签也会被它当成真标签注入 src（实测踩到）。 */
  body.has-img .poster > .art{display:none}
`;