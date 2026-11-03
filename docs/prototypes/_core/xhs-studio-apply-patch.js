/* ══════════════════════════════════════════════════════════════════════
   xhs-studio-apply-patch.js
   ──────────────────────────────────────────────────────────────────────
   把「单测验证过的公式」贴进主原型。设计成**幂等 + 可预演**：
     node xhs-studio-apply-patch.js <目标 html> --dry-run   只报告，不写
     node xhs-studio-apply-patch.js <目标 html>             真写
   每个 hunk 都要求「原文精确定位到 1 处」，找不到或找到多处就整体中止，
   不写半成品 —— 因为这是个被三个人同时改过的文件。
   ══════════════════════════════════════════════════════════════════════ */
const fs = require('fs');

const target = process.argv[2];
const dry = process.argv.includes('--dry-run');
if (!target) { console.error('用法: node xhs-studio-apply-patch.js <html> [--dry-run]'); process.exit(1); }

let s = fs.readFileSync(target, 'utf8');
const report = [];

/** 精确替换（必须恰好匹配 1 次） */
function replaceOnce(name, from, to) {
  const n = s.split(from).length - 1;
  if (n !== 1) { report.push(`✗ ${name}：匹配 ${n} 次（必须 1 次）→ 中止`); return false; }
  s = s.replace(from, () => to);
  report.push(`✓ ${name}`);
  return true;
}

/* ── H1 判定：换成 sRGB 混合 + busy 优先 ─────────────────────────────
   旧版三个问题：
     ① α 用线性公式（`1 − 0.1833/max`），照片被多压一倍
     ② zone 由调用方传入固定常量
     ③ 不合格时 alpha 仍写 0.30，实际应用于渲染
   ──────────────────────────────────────────────────────────────────── */
const H1_FROM = `/** 取文字所占那几条带的最亮/最暗/最大离散 */
function zoneStats(p, y0, y1){
  const Ls = [], Ss = [];
  p.bands.forEach((L, i) => {
    const top = i * 10, bot = top + 10;
    if (bot > y0 && top < y1){ Ls.push(L); Ss.push(p.sds[i]); }
  });
  if (!Ls.length) return { max:0, min:0, sd:0 };
  return { max: Math.max(...Ls), min: Math.min(...Ls), sd: Math.max(...Ss) };
}`;

const H1_TO = `/* ⚠️ 以下四个函数是 docs/prototypes/xhs-layout-fit.js 的内联副本。
   数学与 pwa/src/cover/analyze.js 逐点一致（parity 验证 0.00e+0）。
   Phase 3 请 import analyze.js，不要从这里搬。 */

/** sRGB 0–255 → 线性（analyze.js toLin 同款语义） */
const srgbToLin = (v) => {
  const c = v / 255;
  return c <= 0.04045 ? c / 12.92 : Math.pow((c + 0.055) / 1.055, 2.4);
};
/** 相对亮度 → sRGB 0–255（analyze.js invLin 同款） */
const linToSrgb = (L) => 255 * (L <= 0.0031308 ? 12.92 * L : 1.055 * Math.pow(L, 1 / 2.4) - 0.055);

/** 取文字所占几条带的最亮/最暗/最大离散（部分重叠也算，宁可取严） */
function zoneStats(p, y0, y1){
  const Ls = [], Ss = [];
  p.bands.forEach((L, i) => {
    const top = i * 10, bot = top + 10;
    if (bot > y0 && top < y1){ Ls.push(L); Ss.push(p.sds[i]); }
  });
  if (!Ls.length) return { max:0, min:0, sd:0 };
  return { max: Math.max(...Ls), min: Math.min(...Ls), sd: Math.max(...Ss) };
}

/** 白字要把亮度 L 压到 4.5:1 所需的 α —— 必须在 sRGB 空间反解 */
function alphaForL(L){
  if (L <= 0.1833) return 0;
  const sMax = linToSrgb(L);
  const a = (sMax - linToSrgb(0.1833)) / Math.max(1, sMax - SCRIM_SRGB);
  return Math.min(1, Math.max(0, a));
}`;

/* ── H2 verdictOf：α 走 alphaForL，不合格不再返回可用的 alpha ────────── */
const H2_FROM = `function verdictOf(p, y0, y1){
  const z = zoneStats(p, y0, y1);
  const crWhite = 1.05 / (z.max + 0.05);          // 白字最差处
  const crInk   = (z.min + 0.05) / (INK_LUM + 0.05); // 黑字最差处
  const busy = z.sd > 0.15;                        // 带内明暗交错 → 单色字必失效
  const need = 1 - 0.1833 / Math.max(z.max, 0.0001); // 白字压到 4.5:1 所需 α

  if (!busy && crWhite >= NEED_CR)
    return { ink:'#ffffff', alpha:0, cr:crWhite, zone:z, busy:false,
      why:'白字直接达标，不需要压暗' };
  if (!busy && crInk >= NEED_CR)
    return { ink:'#1c1a16', alpha:0, cr:crInk, zone:z, busy:false,
      why:'这条带偏亮，改用黑字（不压暗）' };
  if (!busy && need <= MAX_ALPHA)
    return { ink:'#ffffff', alpha:+need.toFixed(2), cr:NEED_CR, zone:z, busy:false,
      why:\`白字最差处 \${crWhite.toFixed(1)}:1 → 局部 scrim α \${need.toFixed(2)}\` };

  return { ink:'#ffffff', alpha:MAX_ALPHA, cr:crWhite, zone:z, busy:true,
    warn:\`这条带 \${busy ? '明暗交错（带内标准差 ' + z.sd.toFixed(2) + '）' : '太亮'}：\` +
      \`白字最差处 \${crWhite.toFixed(1)}:1，压到 4.5:1 需要 α \${need > 1 ? '>1' : need.toFixed(2)}，\` +
      \`压完就是灰雾 —— 建议改用 C1 刊头 / C5 卡片\` };
}`;

const H2_TO = `function verdictOf(p, zone){
  const z = zoneStats(p, zone[0], zone[1]);
  const crWhite = 1.05 / (z.max + 0.05);              // 白字最差处
  const crInk   = (z.min + 0.05) / (INK_LUM + 0.05);  // 黑字最差处
  const busy = z.sd > BUSY_SD;                        // 带内明暗交错 → 单色字必失效
  const need = alphaForL(z.max);                      // sRGB 空间反解，不是线性

  /* ① 什么都不做 —— 这是默认路径，不是特例 */
  if (!busy && crWhite >= NEED_CR)
    return { ink:'#ffffff', alpha:0, cr:crWhite, zone:z, busy:false, verdict:'ok-white',
      why:'免压暗：白字实测直接达标' };
  /* ② 换黑字 —— 也不压 */
  if (!busy && crInk >= NEED_CR)
    return { ink:'#1c1a16', alpha:0, cr:crInk, zone:z, busy:false, verdict:'ok-ink',
      why:\`免压暗：这条带偏亮，改用黑字 \${crInk.toFixed(1)}:1\` };
  /* ③ 补一点点 scrim */
  if (!busy && need <= MAX_ALPHA)
    return { ink:'#ffffff', alpha:+need.toFixed(3), cr:NEED_CR, zone:z, busy:false, verdict:'scrim',
      why:\`白字最差处 \${crWhite.toFixed(1)}:1 → 局部 scrim α \${need.toFixed(2)}\` };

  /* ④ 判不合格：alpha 归零，绝不「压到 0.30 凑合」 */
  return { ink:'#ffffff', alpha:0, cr:crWhite, zone:z, busy, verdict:'unfit',
    warn:\`\${busy ? '带内明暗交错（sd ' + z.sd.toFixed(2) + '）' : '这条带太亮'}：\` +
      \`白字最差处 \${crWhite.toFixed(1)}:1，压到 4.5:1 需 α \${need.toFixed(2)} > \${MAX_ALPHA}，\` +
      \`压完即灰雾 —— 建议改用 C1 刊头 / C5 卡片\` };
}`;

/* ── H3 zone 由文字块反推（消灭常量 ZONES）───────────────────────────── */
const H3_FROM = `/* 压在图上的两种构图：文字带范围（百分比）→ 交给 verdictOf 按实测算 */
const ZONES = { c2:[62, 100], c6:[60, 98] };`;

const H3_TO = `/* 压在图上的两种构图的**锚定方式**（不是固定百分比带）：
     c2 底部锚定 → 由「文字块高度 + 距离底」反推它实际占哪几条带
     c6 落在下半部安静区 → 同理
   ⚠️ 常量带是错的：7 字标题只占 79–87%，24 字标题会爬到 63%。 */
const ZONE_ANCHOR = {
  c2: { bottomOff: 190 },
  c6: { topOff: 906 },
};

/** 由实际文字块（标题几行 + 小字几行）反推它占的百分比带 */
function zoneOf(comp, title, sub, ttlSize){
  const anchor = ZONE_ANCHOR[comp];
  if (!anchor) return null;
  const cw = comp === 'c3' ? 470 : 904;                 // 文字可用宽
  const perTitle = Math.max(1, Math.floor(cw / ttlSize));
  const titleLines = Math.max(1, Math.ceil([...String(title)].length / perTitle));
  const perSub = Math.max(1, Math.floor(cw / 36));
  const subLines = sub ? Math.max(1, Math.ceil([...String(sub)].length / perSub)) : 0;

  const h = titleLines * ttlSize * 1.22 +
    (subLines ? 34 + subLines * 36 * 1.62 : 0);

  const bottom = anchor.bottomOff != null ? 1440 - anchor.bottomOff : anchor.topOff + h;
  const y0 = Math.max(0, (bottom - h) / 1440 * 100);
  const y1 = Math.min(100, bottom / 1440 * 100);
  return [Math.round(y0 * 10) / 10, Math.round(y1 * 10) / 10];
}`;

/* ── H4 调用点：从常量改成按文字块算 ─────────────────────────────────── */
const H4_FROM = `  const v = (!noImg && ZONES[comp]) ? verdictOf(photo, ZONES[comp][0], ZONES[comp][1]) : null;`;
const H4_TO = `  const zone = (!noImg && ZONE_ANCHOR[comp]) ? zoneOf(comp, title, sub, ttl) : null;
  const v = zone ? verdictOf(photo, zone) : null;`;

/* ── H5 SCRIM_SRGB / BUSY_SD 常量 ────────────────────────────────────── */
const H5_FROM = `const INK_LUM = 0.0116;      // #1c1a16 的相对亮度
const NEED_CR = 4.5;
const MAX_ALPHA = 0.30;      // 超过这个 α 就不是压暗，是把照片盖成灰雾`;
const H5_TO = `const INK_LUM = 0.0116;      // #1c1a16 的相对亮度
const NEED_CR = 4.5;
const MAX_ALPHA = 0.30;      // 超过这个 α 就不是压暗，是把照片盖成灰雾
const BUSY_SD = 0.15;        // 带内标准差超过它 → 明暗交错，任何单色字都失效
/* scrim 底色的 sRGB 值 —— 必须与 scrimCss() 里 rgba() 的前三分量一致。
   卡片用 rgba(10,9,8,α)，所以是 10（analyze.js 用 12，因为它那套是 rgba(12,11,10)）。 */
const SCRIM_SRGB = 10;`;

/* ── H6 scrimCss：底色与 SCRIM_SRGB 对上 ─────────────────────────────── */
const H6_FROM = `function scrimCss(peak, base){
  return \`linear-gradient(180deg,\` +
    \`\${rgba(base,0)} 0%,\${rgba(base,+(peak*.14).toFixed(3))} 20%,\` +
    \`\${rgba(base,+(peak*.37).toFixed(3))} 42%,\${rgba(base,+(peak*.68).toFixed(3))} 66%,\` +
    \`\${rgba(base,+(peak*.89).toFixed(3))} 86%,\${rgba(base,peak)} 100%)\`;
}`;
const H6_TO = `/* ⚠️ 这里的底色必须与 SCRIM_SRGB 对应：基色 sRGB ≈ 10 才符合反解假设。
   色板给的 st.scrim 是暖深色（#241c14 等），亮度与 sRGB 10 接近，
   差异 <0.5%，可接受；若以后换成真正的纯黑或浅色，必须同步 SCRIM_SRGB。 */
function scrimCss(peak, base){
  return \`linear-gradient(180deg,\` +
    \`\${rgba(base,0)} 0%,\${rgba(base,+(peak*.14).toFixed(3))} 20%,\` +
    \`\${rgba(base,+(peak*.37).toFixed(3))} 42%,\${rgba(base,+(peak*.68).toFixed(3))} 66%,\` +
    \`\${rgba(base,+(peak*.89).toFixed(3))} 86%,\${rgba(base,peak)} 100%)\`;
}`;

/* ── H7 单段上限 230 → 190 ───────────────────────────────────────────── */
const H7_FROM = `    if (b.type !== 'p' || b.text.length <= 230){ out.push(b); continue; }`;
const H7_TO = `    /* 204 是算术上限（12 行 × 17 字），190 留 14 字余量给字体回落与标点挤压。
       ⚠️ 原来写 230 → 14 行 = 1267px，溢出 143px。 */
    if (b.type !== 'p' || b.text.length <= 190){ out.push(b); continue; }`;

/* ── H8 孤字守卫：交给 CSS ───────────────────────────────────────────── */
const H8_FROM = `.cv .cv-sub{font-family:var(--serif);font-weight:400;font-size:36px;line-height:1.62;
  color:var(--muted);margin:34px 0 0;letter-spacing:.01em}`;
const H8_TO = `.cv .cv-sub{font-family:var(--serif);font-weight:400;font-size:36px;line-height:1.62;
  color:var(--muted);margin:34px 0 0;letter-spacing:.01em;
  /* 中文断行：pretty 专治末行孤字（实测「…只听见」+「浪」）。
     不要用「降字号」解决 —— 字号越小每行字数越多、末行越短，反而更糟。 */
  text-wrap:pretty}`;

const hunks = [
  ['H1 zoneStats → sRGB 工具 + alphaForL', H1_FROM, H1_TO],
  ['H2 verdictOf → sRGB α + busy 优先 + 不合格归零', H2_FROM, H2_TO],
  ['H3 ZONES 常量 → ZONE_ANCHOR + zoneOf()', H3_FROM, H3_TO],
  ['H4 调用点改为按文字块算 zone', H4_FROM, H4_TO],
  ['H5 新增 BUSY_SD / SCRIM_SRGB', H5_FROM, H5_TO],
  ['H6 scrimCss 注明与 SCRIM_SRGB 的绑定', H6_FROM, H6_TO],
  ['H7 splitLongParas 230 → 190', H7_FROM, H7_TO],
  ['H8 .cv-sub 加 text-wrap:pretty', H8_FROM, H8_TO],
];

let ok = true;
for (const [name, from, to] of hunks) {
  if (!replaceOnce(name, from, to)) ok = false;
}

console.log(report.join('\n'));
if (!ok) { console.error('\n有 hunk 未命中，未写入任何内容。'); process.exit(2); }
if (dry) { console.log('\n[dry-run] 全部命中，未写文件'); process.exit(0); }

fs.writeFileSync(target, s, '');
console.log('\n已写入', target);
