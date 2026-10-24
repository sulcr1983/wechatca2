/* 九宫格切图（B2 #7）：一张图 → 3×3 九张，可调间距与顺序，ZIP 打包下载。
 *
 * 纯前端 Canvas；ZIP 用 vendor 里的 fflate（MIT，按需加载，离线可用）。
 * 设计约束：**不静默失败** —— 读图失败 / 图太小 / 打包失败都抛可读原因，由调用方提示。
 */

const BASE = new URL('../../', import.meta.url).href;
const GRID = 3;
const GAP_MIN = 0;
const GAP_MAX = 20;
const MIN_CELL = 16;          // 再小就没有可用性，直接报错

let zipLibPromise = null;

function loadZipLib() {
  if (window.fflate) return Promise.resolve(window.fflate);
  if (!zipLibPromise) {
    zipLibPromise = new Promise((resolve, reject) => {
      const s = document.createElement('script');
      s.src = `${BASE}vendor/fflate.min.js`;
      s.onload = () => (window.fflate
        ? resolve(window.fflate)
        : reject(new Error('打包库加载后未暴露 fflate')));
      s.onerror = () => reject(new Error('打包库加载失败（vendor/fflate.min.js）'));
      document.head.appendChild(s);
    });
  }
  return zipLibPromise;
}

function dl(blob, filename) {
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 4000);
}

/** 读图：接受 File/Blob 或 URL（blob:/data:/同源）。返回 img 与释放函数。 */
function loadImage(src) {
  let url = src;
  let owned = false;
  if (src instanceof Blob) { url = URL.createObjectURL(src); owned = true; }
  const img = new Image();
  img.decoding = 'async';
  const p = new Promise((resolve, reject) => {
    img.onload = () => resolve();
    img.onerror = () => reject(new Error('图片读取失败（格式不支持或文件已损坏）'));
    img.src = url;
  });
  return p.then(async () => {
    try { await img.decode?.(); } catch { /* decode 失败不影响 drawImage */ }
    if (!img.naturalWidth || !img.naturalHeight) {
      if (owned) URL.revokeObjectURL(url);
      throw new Error('图片尺寸异常，无法切图');
    }
    return { img, release: () => { if (owned) URL.revokeObjectURL(url); } };
  }, (err) => { if (owned) URL.revokeObjectURL(url); throw err; });
}

/** 顺序：row = 逐行（左→右，上→下）；snake = 蛇形（第二行反向） */
function orderOf(r, c, order) {
  return order === 'snake' && r % 2 === 1 ? GRID - 1 - c : c;
}

function pad2(n) { return String(n).padStart(2, '0'); }

/**
 * 切 3×3。
 * @param {File|Blob|string} source 图片
 * @param {{gap?: number, order?: 'row'|'snake'}} opts
 * @returns {Promise<{tiles: Array<{seq:number,name:string,blob:Blob,url:string}>,
 *                    side:number, cell:number, gap:number}>}
 */
export async function splitGrid(source, opts = {}) {
  const gap = Math.min(GAP_MAX, Math.max(GAP_MIN, Math.round(Number(opts.gap) || 0)));
  const order = opts.order === 'snake' ? 'snake' : 'row';
  const { img, release } = await loadImage(source);
  try {
    const side = Math.min(img.naturalWidth, img.naturalHeight);
    const cell = Math.floor((side - gap * (GRID - 1)) / GRID);
    if (cell < MIN_CELL) {
      throw new Error(`图片太小（${img.naturalWidth}×${img.naturalHeight}），切出的每格不足 ${MIN_CELL}px`);
    }
    // 方形居中裁剪
    const sx0 = Math.floor((img.naturalWidth - side) / 2);
    const sy0 = Math.floor((img.naturalHeight - side) / 2);

    const tiles = [];
    for (let r = 0; r < GRID; r += 1) {
      for (let c = 0; c < GRID; c += 1) {
        const seq = r * GRID + orderOf(r, c, order) + 1;
        const canvas = document.createElement('canvas');
        canvas.width = cell;
        canvas.height = cell;
        const ctx = canvas.getContext('2d');
        if (!ctx) throw new Error('浏览器不支持 Canvas 2D，无法切图');
        ctx.drawImage(
          img,
          sx0 + c * (cell + gap), sy0 + r * (cell + gap), cell, cell,
          0, 0, cell, cell,
        );
        const blob = await new Promise((resolve) => {
          canvas.toBlob((b) => resolve(b), 'image/png');
        });
        if (!blob) throw new Error('第 ' + seq + ' 张生成失败（Canvas 导出为空）');
        tiles.push({ seq, name: `nine-${pad2(seq)}.png`, blob });
      }
    }
    tiles.sort((a, b) => a.seq - b.seq);
    for (const t of tiles) t.url = URL.createObjectURL(t.blob);
    return { tiles, side, cell, gap };
  } finally {
    release();
  }
}

/** 释放 splitGrid 产生的预览 objectURL */
export function releaseTiles(tiles) {
  for (const t of tiles || []) if (t.url) URL.revokeObjectURL(t.url);
}

function stamp() {
  const d = new Date();
  return `${d.getFullYear()}${pad2(d.getMonth() + 1)}${pad2(d.getDate())}`;
}

/** 打包 9 张为 ZIP（level 0 存储：PNG 本身已压缩，再压只浪费时间）。 */
export async function zipTiles(tiles, baseName = '九宫格') {
  if (!tiles || !tiles.length) throw new Error('还没有切图结果');
  const lib = await loadZipLib();
  const entries = {};
  for (const t of tiles) {
    entries[t.name] = new Uint8Array(await t.blob.arrayBuffer());
  }
  const zipped = lib.zipSync(entries, { level: 0 });
  if (!zipped || !zipped.length) throw new Error('打包结果为空（fflate 未返回数据）');
  const blob = new Blob([zipped], { type: 'application/zip' });
  const filename = `${baseName}-${stamp()}.zip`;
  dl(blob, filename);
  return { filename, bytes: blob.size };
}
