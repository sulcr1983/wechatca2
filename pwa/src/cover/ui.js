/* 封面模块 · 共享 UI 小件（toast / 灯箱 / 文案提取）
 * 2026-10-31 模块拆分：标题图与长图长文成为两个独立页面（design-module-split-ia.md），
 * toast 和灯箱是两页共用的单例，从 index.js 抽出来 —— 否则 page 文件反向 import index
 * 会形成循环依赖。灯箱 DOM 由 index.js 的 mountCover() 建一次，两个页面都能开。 */

export function toast(msg, kind = '') {
  let el = document.querySelector('.cv-toast');
  if (!el) {
    el = document.createElement('div');
    el.className = 'cv-toast';
    document.body.appendChild(el);
  }
  el.textContent = msg;
  el.className = `cv-toast${kind ? ' ' + kind : ''}`;
  el.dataset.show = '1';
  clearTimeout(toast._t);
  toast._t = setTimeout(() => { delete el.dataset.show; }, 2600);
}

export function openLightbox(src) {
  const lb = document.getElementById('cv-lightbox');
  if (!lb) return;
  lb.querySelector('img').src = src;
  lb.hidden = false;
}

export function closeLightbox() {
  const lb = document.getElementById('cv-lightbox');
  if (lb) lb.hidden = true;
}

/* ── 文案提取（与本地版 _extract_story 同口径；两页共用） ──
   从输入文本抽出「标题 + 引语」。
   ⚠️ 2026-10-30 修（实测踩到）：引语原来取「第 2、3 行」，正文第 3 行若是
   列表项「1. 早点睡」，封面副标会变成「…海浪。 · 1. 早点睡」——像文案串了。
   现在：引语只在**第一个列表项之前**取，遇到列表就停。 */
export function extractStory(text) {
  const lines = String(text).split(/\r?\n/).map((l) => l.trim()).filter(Boolean);
  const title = (lines[0] || '').replace(/^#{1,6}\s*/, '').slice(0, 64).trim();
  const rest = lines.slice(1);
  const beforeList = [];
  for (const l of rest) {
    if (/^(\d+[.、)]|[-*•·])\s*/.test(l)) break;
    beforeList.push(l);
    if (beforeList.length >= 2) break;
  }
  const lead = beforeList
    .map((l) => l.replace(/^[-*•>\s]+/, '').trim())
    .filter(Boolean)
    .join(' · ')
    .slice(0, 96);
  return { title, lead };
}
