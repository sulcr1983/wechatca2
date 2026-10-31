/* 封面模块入口（2026-10-31 模块拆分，design-module-split-ia.md）
 *
 * 本文件只做「壳」：顶栏三 tab 的页面互斥（公众号排版 / 小红书标题图 / 小红书长图文）、
 * 灯箱单例、两个页面模块的挂载。渲染与状态在各页面文件里：
 *   · title-page.js   标题图（一句话 → 配图 → 出封面；含九宫格）
 *   · longform-page.js 长图长文（贴文章 → 封面配图 → 成套生成；design §5 R5 顺序）
 *   · bg-picker.js    底图选择器工厂（两页各一实例）
 *   · ui.js           toast / 灯箱 / 文案提取（避免 page 反向 import 本文件成环）
 *
 * 历史注：本文件曾装下两个路径的全部逻辑（1832 行单文件混居），
 * 2026-10-31 由项目所有者拍板拆成三个平级顶级模块（§1 R3）。
 */

import { mountTitlePage, onShowTitlePage, escTitlePage } from './title-page.js';
import { mountLongformPage, onShowLongformPage } from './longform-page.js';
import { closeLightbox } from './ui.js';

const $ = (id) => document.getElementById(id);

/* ── 页面互斥：三选一（§3.1）──
   editor = 公众号排版（#stage，本模块外）；title = 标题图；longform = 长图长文 */
let currentPage = 'editor';

function showPage(page) {
  if (!['editor', 'title', 'longform'].includes(page)) return;
  currentPage = page;
  const editor = page === 'editor';
  $('stage').hidden = !editor;
  $('tabs').hidden = !editor;
  const tr = $('title-root');
  const lr = $('longform-root');
  if (tr) tr.hidden = page !== 'title';
  if (lr) lr.hidden = page !== 'longform';
  document.body.classList.toggle('cover-open', !editor);
  /* 三 tab 高亮互斥（R6：全称常驻，不再是两态文字按钮） */
  const map = { editor: 'btn-editor', title: 'btn-cover', longform: 'btn-longform' };
  for (const [p, id] of Object.entries(map)) {
    $(id)?.setAttribute('aria-pressed', String(p === page));
  }
  /* 进入页面时 seed 一次正文 + 刷新该页预览 */
  if (page === 'title') onShowTitlePage();
  if (page === 'longform') onShowLongformPage();
}

function mountCover() {
  const tr = $('title-root');
  const lr = $('longform-root');
  if (!tr || !lr) return;

  /* 灯箱单例（两页共用；DOM 原在 cover-root innerHTML 里，拆分后挂 body） */
  if (!$('cv-lightbox')) {
    const lb = document.createElement('div');
    lb.className = 'cv-lightbox';
    lb.id = 'cv-lightbox';
    lb.hidden = true;
    lb.innerHTML = `
      <button class="cv-lightbox-close" id="cv-lightbox-close" type="button" aria-label="关闭">✕</button>
      <img alt="封面大图">`;
    document.body.appendChild(lb);
    lb.addEventListener('click', (e) => {
      if (e.target.id === 'cv-lightbox') closeLightbox();
    });
    $('cv-lightbox-close')?.addEventListener('click', closeLightbox);
  }

  mountTitlePage(tr);
  mountLongformPage(lr);

  /* 顶栏三 tab（R6：全称「公众号排版 / 小红书标题图 / 小红书长图文」） */
  $('btn-editor')?.addEventListener('click', () => showPage('editor'));
  $('btn-cover')?.addEventListener('click', () => showPage('title'));
  $('btn-longform')?.addEventListener('click', () => showPage('longform'));

  document.addEventListener('keydown', (e) => {
    if (e.key !== 'Escape') return;
    if (escTitlePage()) return;                       // 九宫格开着 → 先关它
    const lb = $('cv-lightbox');
    if (lb && !lb.hidden) { closeLightbox(); return; }
    if (currentPage !== 'editor') showPage('editor'); // 回排版页
  });

  /* 应用持久化的默认页：标题图是大众需求，默认回排版页（用户自己点入口进）。
     （旧偏好里的 path 字段不再消费 —— 三模块后没有「记住上次路径」的需求，
      每次进来都从排版页开始，顶栏就是目录。） */
  showPage('editor');
}

mountCover();
