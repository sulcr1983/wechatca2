/* 整套图文（2026-10-31 按 design §9 重做）—— 封面 + 内页，一套模板管整套。
 *
 * 本轮改了什么（§9 story.js 行）：
 *   1. **分页搬原型的 buildLong()**（cards.js）：DOM 实测高度装箱为主、
 *      字数包络 `Σceil(字数/17)+段数≤13` 降级 + 四个实测常量
 *      DENSE_MIN_FILL_CHARS / OPENING_MAX_CHARS / QUOTE_MAX_CHARS / closingCap
 *      （design §6「落地状态」，原型 1080 真宽逐个量过）
 *   2. **内页改走 cards.js 的 7 角色渲染器**：开篇/清单/金句/步骤/正文/结尾 + 封面页，
 *      封面 = 这套模板的第 1 页（竞品实证：模板选一次管整套，见
 *      docs/research-2026-10-31-xhs-longform-generators.md）
 *   3. 12 套长文模板 + 8 套色板由调用方传入（index.js 长文路径选择器）
 *
 * 与既有代码的边界：
 *   - 截图管线：render.js 的 renderCoverBlob 只认 catalog styleId，而长文模板不在
 *     catalog 里；design §9 未开放 render.js，所以这里内置同构的 iframe 截图
 *     （同一 modern-screenshot 库 + 同一 #xhs-cover 契约）。
 *     render.js 未来若导出通用 renderHtmlBlob，应收敛过去删除这份副本。
 *   - 单张封面路径不归这里管，仍走 index.js 的 generate()。
 */

import { buildLong, pageDoc, tplById, paletteByKey, STORY_MAX_PAGES } from './cards.js';

const BASE = new URL('../../', import.meta.url).href;
const WAIT_READY_MS = 15000;

/* ── 截图库加载（与 render.js 同一 vendor 文件、同一缓存模式）────────── */
let libPromise = null;
function loadLib() {
  if (window.modernScreenshot) return Promise.resolve(window.modernScreenshot);
  if (!libPromise) {
    libPromise = new Promise((resolve, reject) => {
      const s = document.createElement('script');
      s.src = `${BASE}vendor/modern-screenshot.js`;
      s.onload = () => (window.modernScreenshot
        ? resolve(window.modernScreenshot)
        : reject(new Error('截图库加载后未暴露 modernScreenshot')));
      s.onerror = () => reject(new Error('截图库加载失败（vendor/modern-screenshot.js）'));
      document.head.appendChild(s);
    });
  }
  return libPromise;
}

/** 等 iframe 就绪。⚠️ 超时**不 reject**（render.js 的做法是抛错，但长文是连续 6 页，
 *  一页字体慢就整批失败代价太大）—— 超时后降级继续截图，字体回退也能出图。 */
function waitReady(win, timeout = 6000) {
  return new Promise((resolve) => {
    const t0 = Date.now();
    const tick = () => {
      if (win.document.readyState === 'complete') return resolve();
      if (Date.now() - t0 > timeout) return resolve();   // 降级，不阻断
      setTimeout(tick, 40);
    };
    tick();
  });
}

/** 渲染一张自包含 HTML 文档 → PNG Blob（1080×1440）。
 *  与 render.js 的 renderCoverBlob 同构：离屏 iframe → 等字体 → domToBlob。 */
export async function renderPageDoc(doc) {
  const t0 = performance.now();
  const lib = await loadLib();
  const W = 1080;
  const H = 1440;
  const iframe = document.createElement('iframe');
  iframe.setAttribute('aria-hidden', 'true');
  iframe.style.cssText = `position:fixed;left:-20000px;top:0;border:0;width:${W + 240}px;height:${H + 160}px;`;
  document.body.appendChild(iframe);
  try {
    await new Promise((resolve, reject) => {
      iframe.onload = () => resolve();
      iframe.onerror = () => reject(new Error('长文页 iframe 加载失败'));
      iframe.srcdoc = doc;
    });
    const tLoad = performance.now();
    await waitReady(iframe.contentWindow);
    try {
      /* 字体等太久会拖死整套导出：4 个 woff2 子集在每页新 iframe 里都要重新解析。
         给 3s 上限，超时就用回退字体出图（视觉上仍在同一族，只是字形不同）。 */
      await Promise.race([
        iframe.contentWindow.document.fonts.ready,
        new Promise((r) => setTimeout(r, 3000)),
      ]);
    } catch { /* 老浏览器没有 fonts.ready，忽略 */ }
    await new Promise((r) => requestAnimationFrame(() => requestAnimationFrame(r)));
    const node = iframe.contentDocument.getElementById('xhs-cover');
    if (!node) throw new Error('长文页里找不到 #xhs-cover');
    const blob = await lib.domToBlob(node, { width: W, height: H, scale: 1 });
    const tEnd = performance.now();
    /* 计时诊断：整套 6 页 × 每页耗时，卡在哪一段一眼可见
       （load / fonts / screenshot 三段，见 output/gate-run 的日志） */
    console.info(`[story] page ${Math.round(tLoad - t0)}ms load · `
      + `${Math.round(tEnd - tLoad)}ms shot · ${Math.round(tEnd - t0)}ms total`);
    return { blob, width: W, height: H };
  } finally {
    iframe.remove();
  }
}

/* ── 整套生成 ─────────────────────────────────────────────────────── */

/**
 * 生成整套图文：1 张封面（模板 P1，可铺底图）+ N 张内页（纯色排版）。
 *
 * @param {object} opts
 * @param {string} opts.title     标题（封面大字）
 * @param {string} opts.lead      引语（封面副标；空则不渲染 sub）
 * @param {string} opts.body      正文（buildLong 自动拆页）
 * @param {string} opts.author    署名（开篇签名 / 结尾 CTA）
 * @param {string} opts.image     底图 data URL（只铺封面；内页纯色，竞品共识）
 * @param {string} opts.longTpl   模板 id（12 选 1，整套生效）
 * @param {string} opts.palKey    色板 key（模板锁配色时忽略）
 * @param {function} [opts.render] (doc) => Promise<{blob,width,height}> 注入以便测试替换
 * @returns {Promise<Array<{role,index,label,blob,width,height}>>}  附 truncated（被截断字数）
 */
export async function buildStorySet(opts) {
  const {
    title = '', lead = '', body = '', author = '', image = '',
    longTpl = 'editorial', palKey = 'dune',
    pn = true, sign = '', bg = '',
    render = renderPageDoc,
  } = opts;

  const tpl = tplById(longTpl);
  const pal = tpl.palette || paletteByKey(palKey);

  const inner = buildLong(body, { tpl, pal });
  const truncated = inner.truncated || 0;
  const manualBreaks = inner.manualBreaks || 0;
  const pages = [{ role: 'cover' }, ...inner];
  const results = [];

  for (let i = 0; i < pages.length; i++) {
    const p = pages[i];
    const doc = pageDoc({
      role: p.role,
      blocks: p.blocks || [],
      tpl,
      pal,
      index: i,
      total: pages.length,
      title,
      sub: p.role === 'cover' ? lead : '',
      author,
      image: p.role === 'cover' ? image : '',   // 内页不铺底图（design §6.0 原则 3）
      pn,
      sign,
      bg,                                        // 内页背景图（§12.2，封面不受影响）
      baseUrl: BASE,
    });
    const r = await render(doc);
    results.push({
      role: p.role,
      index: i,
      label: p.role === 'cover' ? '封面' : `内页 ${i}`,
      ...r,
    });
  }
  Object.defineProperty(results, 'truncated', { value: truncated, enumerable: false });
  Object.defineProperty(results, 'totalPages', { value: pages.length, enumerable: false });
  Object.defineProperty(results, 'manualBreaks', { value: manualBreaks, enumerable: false });
  return results;
}

export { STORY_MAX_PAGES };
