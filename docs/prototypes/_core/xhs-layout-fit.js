/* ══════════════════════════════════════════════════════════════════════
   xhs-layout-fit.js —— 版式适配的四个纯函数（无 DOM 依赖，可直接进 Phase 3）
   ──────────────────────────────────────────────────────────────────────
   为什么单独抽出来：这四条都是「算出来」而不是「调出来」的规则，
   放在渲染函数里既难测也容易被后续改动破坏。抽成纯函数后可以用真实
   数据跑单测，Phase 3 直接 import，prototypes 里也能引用同一份。

   覆盖的四个坑（每一个都踩过）：
     ① scrim α 必须在 sRGB 空间反解 —— 线性空间算出来会过压一倍
     ② 判定必须看「整个文字块」—— 只测标题那几带会漏掉小字
     ③ 中文窄栏按字数反算字号 —— 按比例缩会断出孤字
     ④ 单段字数上限由行高算 —— 拍脑袋写 230 会溢出
   ══════════════════════════════════════════════════════════════════════ */

/* ── 0. 色彩基础（与 pwa/src/cover/analyze.js 同一套数学，单位也一致）────
   ⚠️ 本文件不重新发明 WCAG：analyze.js 早就在仓库里实现了正确版本
   （relLum / contrastRatio / scrimmedLum / invLin）。这里是它的**镜像 +
   纯函数化**，两个用途：① 能在 node 里单测 ② 原型不依赖 pwa 构建。
   Phase 3 落地时**必须 import analyze.js**，不要复制——两套数学并存一定漂移。
   一致性由 `node docs/prototypes/xhs-layout-fit.js --parity` 逐点验证。
   ──────────────────────────────────────────────────────────────────── */

/** sRGB 0–1 → 线性（analyze.js「toLin」同款，只是入参已归一到 0–1） */
const LIN = (c) => (c <= 0.04045 ? c / 12.92 : Math.pow((c + 0.055) / 1.055, 2.4));

/** 相对亮度 → sRGB 0–255（analyze.js「invLin」同款） */
const INV_LIN = (L) => 255 * (L <= 0.0031308 ? 12.92 * L : 1.055 * Math.pow(L, 1 / 2.4) - 0.055);

/** 相对亮度（hex → 0..1） */
function relLum(hex) {
  const h = String(hex).replace('#', '');
  const n = h.length === 3 ? h.split('').map((c) => c + c).join('') : h;
  return 0.2126 * LIN(parseInt(n.slice(0, 2), 16) / 255) +
    0.7152 * LIN(parseInt(n.slice(2, 4), 16) / 255) +
    0.0722 * LIN(parseInt(n.slice(4, 6), 16) / 255);
}

/** 对比度 */
function contrast(l1, l2) {
  const a = Math.max(l1, l2), b = Math.min(l1, l2);
  return (a + 0.05) / (b + 0.05);
}

/* ── 1. scrim —— 必须在 sRGB 空间混合 ────────────────────────────────
   与 analyze.js:44 的 scrimmedLum 逐位一致（`--parity` 会验证）。
   参数 scrimSrgb 是 scrim 底色的 sRGB 值（0–255）：
     · 纯黑 scrim → 0
     · analyze.js 的 rgba(12,11,10) → 12
     · 我们原型卡片用的 rgba(10,9,8) → 10
   ──────────────────────────────────────────────────────────────────── */

const TARGET_L = 0.1833;      // 白字达 4.5:1 时背景亮度上限 = 1.05/4.5 − 0.05
const SCRIM_SRGB = 10;        // 与卡片 CSS 的 rgba(10,9,8,α) 一致

/** 黑/深色 scrim 叠在亮度 L 上之后的相对亮度 */
function scrimmedLum(L, alpha, scrimSrgb = SCRIM_SRGB) {
  if (alpha <= 0) return L;
  const s = INV_LIN(L);
  const out = s * (1 - alpha) + scrimSrgb * alpha;
  return LIN(Math.min(255, Math.max(0, out)) / 255);
}

/**
 * 要把亮度 L 压到「白字 4.5:1」，需要多少 α（**不钳制**，策略由调用方定）。
 * 分母是 `sMax − scrimSrgb`，不是 `sMax` —— 因为 scrim 底色不是纯黑。
 */
function alphaFor(L, scrimSrgb = SCRIM_SRGB, targetL = TARGET_L) {
  if (L <= targetL) return 0;
  const sMax = INV_LIN(L);
  const targetS = INV_LIN(targetL);
  const a = (sMax - targetS) / Math.max(1, sMax - scrimSrgb);
  return Math.min(1, Math.max(0, a));
}

/* ── 2. 文字带判定 —— 范围与标准都取严 ────────────────────────────────
   ① 范围：从「整个文字块」反推，不用常量（3 行标题会比 2 行标题高 130px）
   ② 标准：4.5:1，不区分大标题/小字（同一块里两种字号都要读得出）
   ③ busy 必须排在 α 之前：带内明暗交错时，任何单色字 + 任何 α 都救不回来
   ──────────────────────────────────────────────────────────────────── */

const NEED_CR = 4.5;
const MAX_ALPHA = 0.30;      // 超过它就不是「压暗」，是把照片盖成灰雾
const BUSY_SD = 0.15;        // 带内标准差超过它 → 高反差，判不合格

/**
 * 由文字块反推它在卡片上占据的百分比带。
 * @param {object} o
 * @param {number} o.cardH        卡片高（1440）
 * @param {number} o.contentW     文字可用宽（全宽 904 / 窄栏 470）
 * @param {number} o.titleSize    标题字号
 * @param {string} o.title        标题文字
 * @param {number} [o.subSize]    小字号（36）
 * @param {string} [o.sub]        小字文字
 * @param {number} [o.bottomOff]  文字块底边距卡片底（C2 190 / C6 无）
 * @param {number} [o.lineH]      标题行高倍数（1.22）
 * @param {number} [o.gap]        标题与小字间距（34）
 * @returns {{y0:number,y1:number,height:number,lines:number,subLines:number}}
 */
function zoneFromBlock(o) {
  const cardH = o.cardH || 1440;
  const lineH = o.lineH || 1.22;
  const gap = o.gap == null ? 34 : o.gap;
  const subSize = o.subSize || 0;

  const cpl = (size, w) => Math.max(1, Math.floor(w / size));   // 每行字数
  const titleLines = Math.ceil([...String(o.title || '')].length / cpl(o.titleSize, o.contentW)) || 1;
  const subLines = (o.sub && subSize)
    ? Math.ceil([...String(o.sub)].length / cpl(subSize, o.contentW))
    : 0;

  const height =
    titleLines * o.titleSize * lineH +
    (subLines ? gap + subLines * subSize * 1.62 : 0);

  const bottom = o.bottomOff == null ? (o.cardH || 1440) : (cardH - o.bottomOff);
  return {
    y0: Math.max(0, Math.round(((bottom - height) / cardH) * 1000) / 10),
    y1: Math.round((bottom / cardH) * 1000) / 10,
    height: Math.round(height),
    lines: titleLines,
    subLines,
  };
}

/**
 * 判定一条文字带该怎么上色/压暗。
 * @param {number[]} bands  10 带平均亮度
 * @param {number[]} sds    10 带内标准差
 * @param {{y0:number,y1:number}} zone
 * @param {string} inkHex   深色字色（默认 #1c1a16）
 */
function judgeZone(bands, sds, zone, inkHex = '#1c1a16') {
  const pick = [];
  bands.forEach((L, i) => {
    const top = i * 10, bot = top + 10;
    if (bot > zone.y0 && top < zone.y1) pick.push(i);
  });
  if (!pick.length) pick.push(0);

  const max = Math.max(...pick.map((i) => bands[i]));
  const min = Math.min(...pick.map((i) => bands[i]));
  const sd = Math.max(...pick.map((i) => sds[i]));
  const busy = sd > BUSY_SD;

  const crWhite = contrast(1, max);
  const crInk = contrast(min, relLum(inkHex));

  /* ④ busy 优先：这一条比 α 数学更重要 —— 换 sRGB 公式后，
     高反差照片按 α 只「需要」0.15，但压完仍然局部糊。 */
  if (!busy && crWhite >= NEED_CR) {
    return { ink: '#ffffff', alpha: 0, contrast: crWhite, zone: { max, min, sd, busy }, verdict: 'ok-white' };
  }
  if (!busy && crInk >= NEED_CR) {
    return { ink: inkHex, alpha: 0, contrast: crInk, zone: { max, min, sd, busy }, verdict: 'ok-ink' };
  }
  const need = alphaFor(max);
  if (!busy && need <= MAX_ALPHA) {
    return { ink: '#ffffff', alpha: +need.toFixed(2), contrast: NEED_CR, zone: { max, min, sd, busy }, verdict: 'scrim' };
  }
  return {
    ink: '#ffffff', alpha: MAX_ALPHA, contrast: crWhite,
    zone: { max, min, sd, busy }, verdict: 'unfit',
    reason: busy
      ? `带内明暗交错（sd ${sd.toFixed(2)}），任何单色字都会在某处失效`
      : `最亮处 L ${max.toFixed(2)}，压到 4.5:1 需 α ${need.toFixed(2)} > ${MAX_ALPHA}，压完即灰雾`,
  };
}

/* ── 3. 中文断行：按字数反算字号 + 孤字守卫 ───────────────────────────
   按比例缩（0.78×）是错的：它保证不了「每行几个字」，7 字标题会断成 5+2，
   14 字小字会断成 13+1（末行一个「浪」）。正确顺序是**先定每行字数**。
   ──────────────────────────────────────────────────────────────────── */

/** 每行可容纳字数 */
const charsPerLine = (size, width, safety = 0.95) => Math.max(1, Math.floor((width * safety) / size));

/**
 * 按「目标行数」反算标题字号。
 *
 * ⚠️ 这里有个反直觉的点（我自己第一版写错过）：
 *   中文断行是「每行能放几个字」决定的，`per = floor(栏宽 / 字号)`。
 *   想把 7 字拆成 4+3，只能**加大**字号（让 per 从 5 掉到 4），
 *   而字号通常已被设计值封顶 —— 所以「缩字号避免孤字」是反的，
 *   越缩 per 越大、末行越短。
 *
 *   真正的解法是 CSS：`text-wrap: balance` 会保持字号不变、
 *   自动调整断点把行撑匀（7 字 → 4+3）。JS 不该抢这件事。
 *
 *   所以本函数的职责只有两个：
 *     ① 按字数反算「需要多大才塞进行数」（chars-first，而不是按比例缩）
 *     ② 报告 per < 3 的病态窄栏（一行两个字读不成句，必须换构图或缩短标题）
 */
function fitTitle(text, width, baseSize, wantLines) {
  const n = [...String(text || '')].length || 1;
  const safety = 0.95;
  let size = baseSize;

  if (wantLines && wantLines > 0) {
    const perLine = Math.ceil(n / wantLines);
    size = Math.min(baseSize, Math.max(28, Math.floor((width * safety) / perLine)));
  }

  const per = charsPerLine(size, width, safety);
  const lines = Math.ceil(n / per);
  return {
    size,
    lines,
    charsPerLine: per,
    /* 交给 CSS balance；这里只如实报告自然断点会落在哪 */
    naturalSplit: lines === 1 ? [n] : Array.from({ length: lines }, (_, i) =>
      i === lines - 1 ? n - per * (lines - 1) : per),
    tooNarrow: per < 3,
  };
}

/**
 * 小字的断行质量检查（小字没有「字号可调」的余地，只能报告 + 建议）
 * @returns {{lines:number, lastLine:number, orphan:boolean}}
 */
function subWrap(text, width, size) {
  const n = [...String(text || '')].length || 1;
  const per = charsPerLine(size, width);
  const lines = Math.ceil(n / per);
  const lastLine = lines === 1 ? n : n - per * (lines - 1);
  return { lines, lastLine, orphan: lines > 1 && lastLine <= 2, charsPerLine: per };
}

/* ── 4. 长文分页：单段硬上限由算术得出，不拍脑袋 ─────────────────────
   52px / 行高 1.74 / 每行 17 字 / 可用高 1124px
   → 1124 / 90.5 = 12.4 行 → 12 × 17 = 204 字（理论）
   取 190 留余量（字体回落、标点挤压都会多占行）。
   ──────────────────────────────────────────────────────────────────── */

const BODY_FS = 52, BODY_LH = 1.74;
const AVAIL_H = 1124;
const CONTENT_W = 904;

/** 单段最大字数（可按字号重算） */
function maxParaChars(fs = BODY_FS, availH = AVAIL_H, width = CONTENT_W) {
  const lineHeight = fs * BODY_LH;
  const lines = Math.floor(availH / lineHeight);        // 12
  const perLine = Math.floor(width / fs);               // 17
  return { lines, perLine, max: lines * perLine - 14 };  // 204 − 余量 = 190
}

/** 按句末标点把超长段落切开（不动句内） */
function splitLongParas(blocks, limit) {
  const cap = limit || maxParaChars().max;
  const out = [];
  for (const b of blocks) {
    if (b.type !== 'p' || b.text.length <= cap) { out.push(b); continue; }
    let cur = '';
    for (const s of b.text.split(/(?<=[。！？!?；;])/)) {
      if (cur && (cur + s).length > cap) { out.push({ ...b, text: cur }); cur = s; }
      else cur += s;
    }
    if (cur.trim()) out.push({ ...b, text: cur });
  }
  return out;
}

/* ── 5. 填充率分档（§6 裁定）────────────────────────────────────────── */

const FILL_MIN = { dense: 0.68, points: 0.68, steps: 0.68, closing: 0.60, opening: 0.45, quote: 0.45 };

/** 锚点够不够（airy 版式靠锚点成立，不靠填充率） */
function anchorsOk(role, anchors) {
  if (role === 'opening' || role === 'quote') return anchors >= 2;
  if (role === 'closing') return anchors >= 3;
  return true;
}

function fillVerdict(role, fill, anchors = 0) {
  const min = FILL_MIN[role] ?? 0.6;
  return {
    pass: fill >= min && anchorsOk(role, anchors),
    ratio: +(fill / min).toFixed(2),
    reason: fill < min ? `填充 ${(fill * 100).toFixed(0)}% < ${(min * 100)}%` : (!anchorsOk(role, anchors) ? '锚点不足' : 'ok'),
  };
}

/* ── 6. 自测（node docs/prototypes/xhs-layout-fit.js 可直接跑）────────── */

function __test() {
  const log = [];
  const photos = {
    海边雾晨: [[0.131,0.145,0.161,0.178,0.199,0.223,0.073,0.045,0.039,0.035],
              [0.010,0.010,0.012,0.027,0.026,0.096,0.053,0.013,0.003,0.002]],
    山野秋千: [[0.389,0.793,0.871,0.607,0.191,0.229,0.229,0.197,0.136,0.075],
              [0.293,0.147,0.154,0.325,0.126,0.115,0.082,0.074,0.094,0.043]],
    旧照片堆: [[0.268,0.288,0.530,0.391,0.144,0.243,0.263,0.260,0.140,0.119],
              [0.253,0.261,0.258,0.263,0.193,0.231,0.252,0.216,0.178,0.181]],
  };

  /* C2：7 字标题 108px + 小字 14 字 36px，底部锚定 190 */
  for (const [name, [bands, sds]] of Object.entries(photos)) {
    const z = zoneFromBlock({
      cardH: 1440, contentW: 904, titleSize: 108, title: '周末去了趟海边',
      subSize: 36, sub: '两天里我没看手机，只听见浪', bottomOff: 190,
    });
    const v = judgeZone(bands, sds, z);
    log.push(`${name.padEnd(6)} zone ${z.y0}–${z.y1}% (${z.lines}行) → ${v.verdict} α=${v.alpha} ${v.contrast.toFixed(1)}:1${v.reason ? ' · ' + v.reason : ''}`);
  }

  /* 3 行标题：zone 必须自动上移，不能停在常量 62% */
  const z2 = zoneFromBlock({ cardH: 1440, contentW: 904, titleSize: 92, title: '周末去了趟海边我把手机调成飞行模式然后什么都不做', bottomOff: 190 });
  const z1 = zoneFromBlock({ cardH: 1440, contentW: 904, titleSize: 92, title: '周末去了趟海边', bottomOff: 190 });
  log.push(`\n2 行标题 zone 起点 ${z1.y0}%（${z1.lines} 行）→ 3 行 ${z2.y0}%（${z2.lines} 行）：动态 zone 会自己上移 ${(z1.y0 - z2.y0).toFixed(1)} 个点`);

  /* 窄栏字数反算 */
  for (const [w, base, want] of [[470, 84, 0], [470, 108, 0], [470, 108, 2], [904, 128, 0]]) {
    const f = fitTitle('周末去了趟海边', w, base, want || undefined);
    log.push(`栏宽 ${w} base ${base}${want ? ' want' + want : ''} → ${f.size}px × ${f.lines} 行（每行 ${f.charsPerLine} 字，自然断点 ${f.naturalSplit.join('+')}${f.tooNarrow ? ' ⚠ 栏太窄' : ''}）`);
  }
  const sw = subWrap('两天里我没看手机，只听见浪', 470, 36);
  log.push(`小字 470px/36px → ${sw.lines} 行，末行 ${sw.lastLine} 字${sw.orphan ? ' ⚠ 孤字' : ''}`);

  log.push(`\n单段上限：${JSON.stringify(maxParaChars())}`);
  log.push(`fillVerdict(quote, 0.37) → ${JSON.stringify(fillVerdict('quote', 0.37, 2))}`);
  log.push(`fillVerdict(quote, 0.37, 1) → ${JSON.stringify(fillVerdict('quote', 0.37, 1))}`);
  log.push(`fillVerdict(dense, 0.72) → ${JSON.stringify(fillVerdict('dense', 0.72))}`);

  return log.join('\n');
}

if (typeof module !== 'undefined' && module.exports) {
  module.exports = {
    relLum, contrast, scrimmedLum, alphaFor, zoneFromBlock, judgeZone,
    fitTitle, subWrap, charsPerLine, maxParaChars, splitLongParas,
    FILL_MIN, fillVerdict, anchorsOk, SCRIM_SRGB, TARGET_L,
  };
  if (require.main === module) console.log(__test());
}
