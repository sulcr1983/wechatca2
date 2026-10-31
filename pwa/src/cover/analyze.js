/* 底图可读性分析（2026-10-30）—— 回答「文字压在这张图上会不会糊」。
 *
 * 为什么需要这个文件：
 *   此前有底图时，文字位置固定贴底、字色固定白色，再叠一层全画布深色遮罩。
 *   实测 7 张真实图：白字压在最亮 5% 区域时对比度只有 1.08–1.99:1（可读下限 4.5:1）。
 *   把遮罩加到 50% 也只有 2.51:1 —— 要到 4.5 得加到 80%，那时照片已成灰板。
 *
 * 解法（对应 docs/cover-style-spec.md §6.3 的 Step 2「不加遮罩，文字落进 quiet zone」，
 * 该条规范写了很久但代码一直没实现，直接跳到了 Step 3 的遮罩）：
 *   1. 横切 10 条带，每条算平均亮度 / 亮度方差（方差小 = 细节少 = 安静）
 *   2. 在下方 60% 区域挑方差最小的连续两条 → 文字就放那儿
 *   3. 按那条带的实测亮度比较白字/黑字哪个对比度高（不是按阈值切）
 *   4. 只有极少数仍不达标时才补一点局部渐变（峰值 ≤0.30）
 *
 * 与既有代码的边界：
 *   - 复用 templates.js 的 WCAG 公式（inkForAccent 用的同一套），不重写
 *   - 纯计算，不碰 DOM 渲染；调用方拿 {bandTop, ink, contrast} 自己去用
 */

/* ── WCAG 相对亮度与对比度（与 templates.js:inkForAccent 同一公式）────── */
function toLin(c) {
  const s = c / 255;
  return s <= 0.04045 ? s / 12.92 : Math.pow((s + 0.055) / 1.055, 2.4);
}

function invLin(L) {
  // 相对亮度 → sRGB 0–255（alpha 混合必须在 sRGB 空间做，不能直接乘 L）
  return 255 * (L <= 0.0031308 ? 12.92 * L : (1.055 * Math.pow(L, 1 / 2.4) - 0.055));
}

export function relLum(r, g, b) {
  return 0.2126 * toLin(r) + 0.7152 * toLin(g) + 0.0722 * toLin(b);
}

export function contrastRatio(l1, l2) {
  const a = Math.max(l1, l2);
  const b = Math.min(l1, l2);
  return (a + 0.05) / (b + 0.05);
}

/** 黑 scrim（rgba(12,11,10,a)）叠在背景亮度 L 上之后的相对亮度。
 *  ⚠️ 必须在 sRGB 空间混合再算亮度 —— 直接 L×(1-a) 会严重高估效果
 *  （实测：最亮处 L=0.93 时，直接乘得 1.73:1，真实混合得 2.85:1）。 */
export function scrimmedLum(L, alpha, scrimSrgb = 12) {
  if (alpha <= 0) return L;
  const s = invLin(L);
  const out = s * (1 - alpha) + scrimSrgb * alpha;
  return toLin(out);
}

/* ── 压暗策略常量（2026-10-31 对齐 design §11.11，覆盖旧钳制 [0.24, 0.62]）──── */
/** 超过这个 α 就不是压暗，是把照片盖成灰板（原型同值；不合格临界点 L≈0.377）。 */
export const MAX_ALPHA = 0.30;

/** 白字要把亮度 L 压到 4.5:1 所需的 scrim α —— 在 sRGB 空间反解，不设上下限。
 *  调用方拿它跟 MAX_ALPHA 比：≤0.30 才压；>0.30 判不合格（提示换图，不是加大 α）。
 *  ⚠️ scrimSrgb 必须与实际 rgba() 的前三分量一致（本文件的 scrim 是 rgba(12,11,10) → 12；
 *  design §11.8：混色发生在 sRGB 空间，直接 L×(1-a) 会严重低估所需强度）。
 *  @param {number} L 文字带最亮处相对亮度（0–1）
 *  @param {number} scrimSrgb scrim 底色 sRGB 值
 *  @returns {number} 0–1 */
export function alphaForL(L, scrimSrgb = 12) {
  const targetL = 0.183;                      // 白字 4.5:1 的背景亮度上限
  if (L <= targetL) return 0;
  const sMax = invLin(L);
  const a = (sMax - invLin(targetL)) / Math.max(1, sMax - scrimSrgb);
  return Math.min(1, Math.max(0, a));
}

/* ── 分带度量 ─────────────────────────────────────────────────────── */
const BANDS = 10;          // 横切条数
const SAMPLE_W = 50;       // 采样宽度（足够判断方差，又不至于慢）
const SAMPLE_H = 12;       // 每条带采样高度

function bandMetrics(ctx, imgW, imgH) {
  const cv = ctx.canvas;
  const bands = [];
  for (let i = 0; i < BANDS; i++) {
    const y0 = Math.floor(imgH * i / BANDS);
    const h = Math.floor(imgH * (i + 1) / BANDS) - y0;
    if (h <= 0) continue;
    ctx.drawImage(ctx.__img, 0, y0, imgW, h, 0, 0, SAMPLE_W, SAMPLE_H);
    let data;
    try {
      data = ctx.getImageData(0, 0, SAMPLE_W, SAMPLE_H).data;
    } catch {
      // canvas 被污染（跨域图没转 data URL）→ 放弃分析，调用方回退默认
      return null;
    }
    let sum = 0;
    let sum2 = 0;
    let n = 0;
    const lums = [];
    for (let p = 0; p < data.length; p += 4) {
      const L = relLum(data[p], data[p + 1], data[p + 2]);
      lums.push(L);
      sum += L;
      sum2 += L * L;
      n++;
    }
    const mean = sum / n;
    const variance = Math.max(0, sum2 / n - mean * mean);
    lums.sort((a, b) => a - b);
    bands.push({
      i,
      mean,
      variance,
      p95: lums[Math.min(lums.length - 1, Math.floor(lums.length * 0.95))],
      /* p99 = 真正的最亮处。用 p95 会低估：实测某图 p95=0.34 时 scrim 0.30 够，
         但真实最亮处 0.93 需要 0.60 才够 —— 白字最怕的就是那 1% 的亮块。 */
      p99: lums[Math.min(lums.length - 1, Math.floor(lums.length * 0.99))],
      p05: lums[Math.floor(lums.length * 0.05)],
      topPct: Math.round(i / BANDS * 100),
    });
  }
  void cv;
  return bands.length ? bands : null;
}

/* ── 主入口 ───────────────────────────────────────────────────────── */

/**
 * 分析底图，给出「文字该用什么颜色、要不要补 scrim」。
 *
 * ⚠️ 2026-10-30 第二次修（实测踩到两个真 bug）：
 *   1. 上一版只看「方差最小」就选带 —— 方差小只代表细节少，不代表能读。
 *      实测一张高反差图选了纯白区判「黑字」（均值上 17:1 看着完美），
 *      但文字实际往下延伸压到人物深色区域 → 黑字压在黑头发上完全看不见。
 *   2. **更严重的是位置错位**：scrim 按 bandTop 算，但模板/版式的文字是
 *      「贴底排版」固定在底部 —— 结果 scrim 压暗了画面中部，文字所在底部没被压，
 *      等于白做（实测 scrim 生效了但文字对比度仍是 2.4:1）。
 *
 * 所以现在**不再假设文字可以自由移动**：模板/版式的版面是固定的，
 * 分析必须对齐「文字真实占据的区域」。默认取底部 45%（贴底排版的标题+引语），
 * 由调用方用 zone 参数指定。
 *
 * @param {string} dataUrl 底图 data URL（必须同源可读，否则 canvas 被污染）
 * @param {{zone?: [number, number], minContrast?: number}} opts
 *   zone = 文字真实占据的纵向范围（0–1），默认 [0.55, 1.0]（贴底排版）
 * @returns {Promise<null | {
 *   ink: string,            // '#ffffff' | '#141110'
 *   contrast: number,       // 该区域实测对比度（最坏处）
 *   needsTint: boolean,     // 原始对比度不达标 → 需要 scrim（unfit 时调用方不得压）
 *   tintPeak: number,       // 建议 scrim 峰值（0–0.30；unfit 时为 0）
 *   unfit: boolean,         // true = 压到 4.5:1 需 α>0.30 → 不压（压了是灰雾），提示换图
 *   zone: [number, number], // 实际分析的区域
 *   bands: Array,           // 原始分带数据，供调试
 * }>}
 */
export async function analyzeImage(dataUrl, opts = {}) {
  if (!dataUrl) return null;
  let img;
  try {
    img = await loadImage(dataUrl);
  } catch {
    return null;
  }
  if (!img.naturalWidth || !img.naturalHeight) return null;

  const cv = document.createElement('canvas');
  cv.width = SAMPLE_W;
  cv.height = SAMPLE_H;
  const ctx = cv.getContext('2d', { willReadFrequently: true });
  if (!ctx) return null;
  ctx.__img = img;

  const bands = bandMetrics(ctx, img.naturalWidth, img.naturalHeight);
  if (!bands || bands.length < 3) return null;

  const zone = opts.zone ?? [0.55, 1.0];
  const minContrast = opts.minContrast ?? 4.5;
  const res = analyzeZone(bands, zone, minContrast);
  if (!res) return null;

  /* 需要补多少 scrim：按「最亮处压到刚好 4.5:1」在 sRGB 空间反解（alphaForL）。
     2026-10-31 覆盖旧钳制 [0.24, 0.62]（design §11.11）：下限把需要的 0.04 硬拉到
     0.24 = 无故多压 5 倍；上限 0.62 = 灰雾，正是用户抱怨的那件事。新口径：
     · 0 < a ≤ 0.30 → 压，峰值就是实算值（需要 0.04 就只压 0.04）
     · a > 0.30 → 完全不压（unfit=true，tintPeak=0），调用方提示换图 ——
       压到 0.30 也只能救回 ≈2.2:1，照片却灰了。 */
  let tintPeak = 0;
  let unfit = false;
  if (res.needsTint) {
    const a = alphaForL(res.maxL);
    if (a > MAX_ALPHA) {
      unfit = true;
    } else {
      tintPeak = +a.toFixed(3);
    }
  }

  /* 报告「补完 scrim 之后」的真实对比度（2026-10-30 修）：
     上一版把 scrim 前的值直接显示给用户（实测画面明明很清晰却标「会糊 1.3:1」）。
     用户看到的是最终成品，标记就必须按最终成品算。
     scrim 是黑渐变叠在图上：背景亮度 = L × (1 - peak)。 */
  const effMaxL = scrimmedLum(res.maxL, tintPeak);
  const finalContrast = res.ink === '#141110'
    ? contrastRatio(0.0, res.minL)
    : contrastRatio(1.0, effMaxL);

  return {
    ink: res.ink,
    contrast: finalContrast,
    worstContrast: finalContrast,
    rawContrast: res.worst,          // scrim 之前的原始值（调试用）
    needsTint: res.needsTint,
    tintPeak,
    unfit,
    zone,
    maxL: res.maxL,
    minL: res.minL,
    bands,
  };
}

function loadImage(src) {
  return new Promise((resolve, reject) => {
    const im = new Image();
    im.decoding = 'async';
    im.onload = () => resolve(im);
    im.onerror = () => reject(new Error('底图解码失败'));
    im.src = src;
  });
}

/* ── 供测试与校验脚本复用的纯计算版本 ───────────────────────────────── */

/**
 * 按「文字真实占据的区域」判定字色与是否达标（纯计算，不依赖 canvas）。
 *
 * @param {Array<{mean,variance,p95,p05}>} bands 分带数据
 * @param {[number, number]} zone 文字区域（0–1，如 [0.55, 1.0] 表示底部 45%）
 * @param {number} minContrast 可读下限（WCAG AA 正文 4.5）
 */
export function analyzeZone(bands, zone = [0.55, 1.0], minContrast = 4.5) {
  const n = bands.length;
  const i0 = Math.max(0, Math.floor(n * zone[0]));
  const i1 = Math.min(n, Math.ceil(n * zone[1]));
  const seg = bands.slice(i0, Math.max(i0 + 1, i1));
  if (!seg.length) return null;

  // 白字的下限由「最亮处」决定，黑字的下限由「最暗处」决定 ——
  // 这才是人眼看到的下限，不是平均值。用 p99 而非 p95（见 bandMetrics 注释）
  const maxL = Math.max(...seg.map((b) => b.p99 ?? b.p95));
  const minL = Math.min(...seg.map((b) => b.p05 ?? b.mean));
  const cWhite = contrastRatio(1.0, maxL);
  const cBlack = contrastRatio(0.0, minL);

  /* 选色规则：
     · 黑字只在「真的达标」时才用（黑字站不住比白字更难看：黑字压在深色物体上直接消失）
     · 白字是默认：它靠 scrim 提亮背景，可调范围大得多
     · 两边都不达标时用白字 + scrim（Material 规范的标准做法） */
  const useDark = cBlack >= minContrast && cBlack > cWhite;
  const worst = useDark ? cBlack : cWhite;

  return {
    ink: useDark ? '#141110' : '#ffffff',
    worst,
    needsTint: worst < minContrast,
    maxL,
    minL,
    cWhite,
    cBlack,
  };
}

/**
 * 老接口保留（按「挑最安静的带」的思路），仅供单测/校验脚本回归使用。
 * 生产渲染已改用 analyzeZone —— 因为版面是固定的，文字不能自由移动。
 */
export function pickBandAndInk(bands, opts = {}) {
  const lo = Math.floor(bands.length * (opts.lo ?? 0.35));
  const span = opts.span ?? 3;
  const minContrast = opts.minContrast ?? 4.5;

  const candidates = [];
  for (let i = lo; i <= bands.length - span; i++) {
    const seg = bands.slice(i, i + span);
    const maxL = Math.max(...seg.map((b) => b.p95));
    const minL = Math.min(...seg.map((b) => b.p05 ?? b.mean));
    const cWhite = contrastRatio(1.0, maxL);
    const cBlack = contrastRatio(0.0, minL);
    const useDark = cBlack >= minContrast && cBlack > cWhite;
    const worst = useDark ? cBlack : cWhite;
    const quiet = seg.reduce((s, b) => s + b.variance, 0) / seg.length;
    candidates.push({ i, worst, useDark, quiet, maxL, minL });
  }
  if (!candidates.length) return null;

  const readable = candidates.filter((c) => c.worst >= minContrast);
  const pool = readable.length ? readable : candidates;
  const best = readable.length
    ? pool.reduce((a, b) => (b.quiet < a.quiet ? b : a))
    : pool.reduce((a, b) => (b.worst > a.worst ? b : a));

  return {
    bandTop: best.i / bands.length,
    bandBottom: (best.i + span) / bands.length,
    ink: best.useDark ? '#141110' : '#ffffff',
    contrast: best.worst,
    worstContrast: best.worst,
    needsTint: best.worst < minContrast,
    readable: best.worst >= minContrast,
  };
}
