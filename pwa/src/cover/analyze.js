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

export function relLum(r, g, b) {
  return 0.2126 * toLin(r) + 0.7152 * toLin(g) + 0.0722 * toLin(b);
}

export function contrastRatio(l1, l2) {
  const a = Math.max(l1, l2);
  const b = Math.min(l1, l2);
  return (a + 0.05) / (b + 0.05);
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
      p05: lums[Math.floor(lums.length * 0.05)],
      topPct: Math.round(i / BANDS * 100),
    });
  }
  void cv;
  return bands.length ? bands : null;
}

/* ── 主入口 ───────────────────────────────────────────────────────── */

/**
 * 分析底图，给出「文字该放哪、该用什么颜色」。
 *
 * @param {string} dataUrl 底图 data URL（必须同源可读，否则 canvas 被污染）
 * @returns {Promise<null | {
 *   bandTop: number,        // 文字块起始位置 0–1
 *   bandBottom: number,     // 文字块结束位置 0–1
 *   ink: string,            // '#ffffff' | '#141110'
 *   contrast: number,       // 该带实测对比度
 *   worstContrast: number,  // 该带最亮 5% 处的对比度（真正的下限）
 *   needsTint: boolean,     // worstContrast 不达标 → 调用方补局部渐变
 *   tintPeak: number,       // 建议的局部渐变峰值（0 表示不需要）
 *   bands: Array,           // 原始分带数据，供调试
 * }>}
 */
export async function analyzeImage(dataUrl) {
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

  // 只在下方 60% 找（小红书封面惯例：标题在下，上方留给画面主体）
  const lo = Math.floor(bands.length * 0.4);
  let bestIdx = bands.length - 2;
  let bestScore = Infinity;
  for (let i = lo; i < bands.length - 1; i++) {
    const score = bands[i].variance + bands[i + 1].variance;
    if (score < bestScore) {
      bestScore = score;
      bestIdx = i;
    }
  }

  const pair = bands.slice(bestIdx, bestIdx + 2);
  const meanL = pair.reduce((s, b) => s + b.mean, 0) / pair.length;
  const worstL = Math.max(...pair.map((b) => b.p95));

  // 选色要实测比较，不能只看阈值：
  // 亮度落在中间地带时，阈值法会选错（实测某图均值 0.188，白字 4.41 / 黑字 4.76）
  const cWhite = contrastRatio(1.0, meanL);
  const cBlack = contrastRatio(0.0, meanL);
  const useDark = cBlack > cWhite;
  const ink = useDark ? '#141110' : '#ffffff';

  // 真正的下限是「最亮那 5% 像素」上的对比度，不是平均
  const worstContrast = useDark ? contrastRatio(0.0, worstL) : contrastRatio(1.0, worstL);
  const needsTint = worstContrast < 4.5;
  // 需要补多少：把最亮区压到刚好达标，但不超过规范上限 0.30
  let tintPeak = 0;
  if (needsTint) {
    const target = useDark ? 0.42 : 0.14;      // 目标背景亮度
    const a = 1 - target / Math.max(0.001, worstL);
    tintPeak = Math.min(0.30, Math.max(0.15, a));
  }

  return {
    bandTop: bestIdx / bands.length,
    bandBottom: (bestIdx + 2) / bands.length,
    ink,
    contrast: useDark ? cBlack : cWhite,
    worstContrast,
    needsTint,
    tintPeak,
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
 * 不依赖 canvas 的分析核心（喂已算好的分带数据）。
 * 抽出来是为了让 Node 侧单测/校验器能直接验证算法，不用起浏览器。
 *
 * @param {Array<{mean:number, variance:number, p95:number}>} bands
 * @param {{lo?: number, minContrast?: number}} opts
 */
export function pickBandAndInk(bands, opts = {}) {
  const lo = Math.floor(bands.length * (opts.lo ?? 0.4));
  const minContrast = opts.minContrast ?? 4.5;
  let bestIdx = bands.length - 2;
  let bestScore = Infinity;
  for (let i = lo; i < bands.length - 1; i++) {
    const score = bands[i].variance + bands[i + 1].variance;
    if (score < bestScore) {
      bestScore = score;
      bestIdx = i;
    }
  }
  const pair = bands.slice(bestIdx, bestIdx + 2);
  const meanL = pair.reduce((s, b) => s + b.mean, 0) / pair.length;
  const worstL = Math.max(...pair.map((b) => b.p95));
  const cWhite = contrastRatio(1.0, meanL);
  const cBlack = contrastRatio(0.0, meanL);
  const useDark = cBlack > cWhite;
  const worstContrast = useDark ? contrastRatio(0.0, worstL) : contrastRatio(1.0, worstL);
  return {
    bandTop: bestIdx / bands.length,
    bandBottom: (bestIdx + 2) / bands.length,
    ink: useDark ? '#141110' : '#ffffff',
    contrast: useDark ? cBlack : cWhite,
    worstContrast,
    needsTint: worstContrast < minContrast,
  };
}
