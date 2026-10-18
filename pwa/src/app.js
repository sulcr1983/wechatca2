/* SuperSu PWA 主交互层
 *
 * 数据流：输入 → 400ms 防抖 → Worker 里的 Python 引擎 → 内联样式 HTML
 *        → iframe 同步 doc.write → 解析条从返回的 markdown 统计
 * 全部本地：没有网络请求（除首次加载引擎与主题 JSON）。
 */

import { createEngine } from './bridge.js';

/* ── 存储键 ─────────────────────────────────────────────────── */
const LS = {
  theme: 'supersu.pwa.theme',
  fav: 'supersu.pwa.fav',
  recent: 'supersu.pwa.recent',
  draft: 'supersu.pwa.draft',
  mode: 'supersu.pwa.mode',
};

const DEFAULT_THEME = 'su-biz-azure';
const RECENT_MAX = 8;

/* ── 小工具 ─────────────────────────────────────────────────── */
const $ = (id) => document.getElementById(id);
const lsGet = (k, d) => { try { const v = localStorage.getItem(k); return v ? JSON.parse(v) : d; } catch { return d; } };
const lsSet = (k, v) => { try { localStorage.setItem(k, JSON.stringify(v)); } catch { /* 隐私模式满盘，忽略 */ } };
const lsDel = (k) => { try { localStorage.removeItem(k); } catch { /* 同上 */ } };

let toastTimer = null;
function toast(msg, kind = '') {
  const el = $('toast');
  el.textContent = msg;
  el.className = 'toast show' + (kind ? ' ' + kind : '');
  el.hidden = false;
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => {
    el.className = 'toast';
    setTimeout(() => { el.hidden = true; }, 220);
  }, 2600);
}

/* ── 状态 ───────────────────────────────────────────────────── */
let themes = [];                 // [{ id, name, desc, primary, accent, background, family }]
let byId = new Map();
let activeId = DEFAULT_THEME;
let mode = lsGet(LS.mode, 'phone');   // phone | web
let engine = null;
let lastHtml = '';
let lastMarkdown = '';
let renderTimer = null;
let renderSeq = 0;
let themeJsonCache = new Map();

const FAMS = {
  biz: '卷宗', feast: '庙会', letter: '信笺', minimal: '素页',
  night: '夜航', stamp: '钢印', dusk: '首屏', frost: '卡片', other: '其他',
};

/* ── 启动 ───────────────────────────────────────────────────── */
async function main() {
  bindUI();
  applyMode();
  initUpdate();     // 更新管理独立于引擎，先起（动态 import，模块缺失也不影响排版）

  try {
    themes = await (await fetch('./themes/index.json')).json();
    byId = new Map(themes.map((t) => [t.id, t]));
  } catch (e) {
    setEngineState('error', '主题加载失败');
    toast('主题列表加载失败：' + e.message, 'err');
    return;
  }

  const saved = localStorage.getItem(LS.theme);
  activeId = (saved && byId.has(saved)) ? saved : (byId.has(DEFAULT_THEME) ? DEFAULT_THEME : themes[0].id);

  renderCaps();
  updateCharCount();

  // 引擎异步启动，UI 先可用（骨架 + 遮罩）
  engine = createEngine({ onProgress: onProgress });
  try {
    await engine.boot();
    setEngineState('ready', '引擎已就绪');
    $('boot').classList.add('gone');
    restoreDraft();
    if ($('input').value.trim()) scheduleRender();
  } catch (e) {
    setEngineState('error', '引擎加载失败');
    $('boot-label').textContent = '引擎加载失败';
    $('boot-fill').style.background = 'var(--accent)';
    toast('引擎加载失败：' + e.message, 'err');
  }
}

function onProgress({ pct, label }) {
  const fill = $('boot-fill');
  const lab = $('boot-label');
  if (fill) fill.style.width = Math.max(0, Math.min(100, pct)) + '%';
  if (lab && label) lab.textContent = label;
}

function setEngineState(state, text) {
  const badge = $('engine-badge');
  badge.dataset.state = state;
  $('engine-text').textContent = text;
}

/* ── 渲染 ───────────────────────────────────────────────────── */
function scheduleRender() {
  clearTimeout(renderTimer);
  renderTimer = setTimeout(doRender, 400);
}

async function doRender() {
  const text = $('input').value;
  updateCharCount();

  if (!text.trim()) {
    lastHtml = '';
    lastMarkdown = '';
    showEmpty();
    updateParseBar('');
    $('btn-copy').disabled = true;
    saveDraft(text);
    return;
  }

  const mySeq = ++renderSeq;
  try {
    const json = themeJsonCache.get(activeId) || await loadThemeJson(activeId);
    await engine.setTheme(activeId, json);
    const out = await engine.render(text);
    if (mySeq !== renderSeq) return;          // 有更新的请求，丢弃本次结果
    lastHtml = out.html;
    lastMarkdown = out.markdown;
    showPreview(out.html);
    updateParseBar(out.markdown);
    updateWxTitle(text);
    $('btn-copy').disabled = false;
    saveDraft(text);
    pushRecent(activeId);
  } catch (e) {
    if (mySeq !== renderSeq) return;
    toast('排版失败：' + e.message, 'err');
    setEngineState('error', '渲染出错');
  }
}

async function loadThemeJson(id) {
  const res = await fetch(`./themes/${id}.json`);
  if (!res.ok) throw new Error(`主题 ${id} 读取失败`);
  const txt = await res.text();
  themeJsonCache.set(id, txt);
  return txt;
}

function showPreview(html) {
  const frame = $('preview');
  $('preview-empty').hidden = true;
  $('phone-shell').hidden = false;
  frame.style.display = 'block';

  // 用 srcdoc 而不是 contentDocument.write：
  // ① iframe 带 sandbox（只给 allow-same-origin，不给 allow-scripts），
  //   从父页面 write 进去会被 Chrome 判成「在沙箱文档里执行脚本」并报警；
  // ② srcdoc 是纯数据赋值，不涉及脚本注入，也不会留下 blob URL 泄漏。
  if (frame.getAttribute('srcdoc') === html) return;
  frame.setAttribute('srcdoc', html);
}

function showEmpty() {
  $('preview-empty').hidden = false;
  $('phone-shell').hidden = true;
  const frame = $('preview');
  frame.style.display = 'none';
  frame.removeAttribute('srcdoc');
}

function updateWxTitle(text) {
  const first = text.split('\n').map((l) => l.trim()).find(Boolean) || '未命名';
  $('wx-title').textContent = first.slice(0, 24);
}

/* ── 解析条 ─────────────────────────────────────────────────── */
function updateParseBar(markdown) {
  const bar = $('parse-bar');
  if (!markdown.trim()) {
    bar.innerHTML = '<span class="parse-hint">粘贴后自动识别结构</span>';
    return;
  }
  const lines = markdown.split('\n');
  let h1 = 0, h2 = 0, li = 0, quote = 0, fence = 0, table = 0;
  for (const l of lines) {
    const s = l.trimStart();
    if (s.startsWith('## ')) h2++;
    else if (s.startsWith('# ')) h1++;
    else if (s.startsWith('### ')) h2++;
    else if (s.startsWith('- ') || /^\d+\.\s/.test(s)) li++;
    else if (s.startsWith('> ')) quote++;
    else if (s.startsWith('```')) fence++;
    else if (s.startsWith('|') && s.endsWith('|')) table++;
  }
  const items = [
    ['大标题', h1], ['小节', h2], ['列表', li], ['引用', quote],
    ['代码', Math.floor(fence / 2)], ['表格', table > 2 ? 1 : 0],
  ].filter(([, n]) => n > 0);

  bar.innerHTML = items.length
    ? items.map(([k, n]) => `<span class="chip-stat">${k} <b>×${n}</b></span>`).join('')
    : '<span class="parse-hint">没识别出结构，可按 Markdown 手写</span>';
}

function updateCharCount() {
  const n = $('input').value.trim().length;
  $('char-count').textContent = n + ' 字';
}

/* ── 风格胶囊 ───────────────────────────────────────────────── */
function favList() { return lsGet(LS.fav, []); }
function recentList() { return lsGet(LS.recent, []); }

function orderedThemes() {
  const fav = new Set(favList());
  const recent = recentList();
  const known = new Set(themes.map((t) => t.id));
  const seen = new Set();
  const out = [];

  for (const id of recent) {
    if (known.has(id) && fav.has(id) && !seen.has(id)) { out.push(byId.get(id)); seen.add(id); }
  }
  for (const id of fav) {
    if (known.has(id) && !seen.has(id)) { out.push(byId.get(id)); seen.add(id); }
  }
  for (const id of recent) {
    if (known.has(id) && !seen.has(id)) { out.push(byId.get(id)); seen.add(id); }
  }
  for (const t of themes) {
    if (!seen.has(t.id)) { out.push(t); seen.add(t.id); }
  }
  return out;
}

function renderCaps() {
  const box = $('style-caps');
  const list = orderedThemes().slice(0, 40);
  box.innerHTML = list.map((t) => `
    <button class="cap" data-id="${t.id}" aria-pressed="${t.id === activeId}">
      <span class="cap-sw" style="background:${t.background};--sw2:${t.accent}"></span>
      <span>${escapeHtml(t.name)}</span>
    </button>`).join('');
}

function pushRecent(id) {
  const recent = recentList().filter((x) => x !== id);
  recent.unshift(id);
  lsSet(LS.recent, recent.slice(0, RECENT_MAX));
}

function setActive(id) {
  if (!byId.has(id)) return;
  activeId = id;
  localStorage.setItem(LS.theme, id);
  renderCaps();
  if (!$('drawer').hidden) renderDrawer();
  scheduleRender();
}

/* ── 抽屉 ───────────────────────────────────────────────────── */
let drawerFam = 'all';
let drawerQ = '';

function openDrawer() {
  $('drawer').hidden = false;
  $('drawer-mask').hidden = false;
  renderFilters();
  renderDrawer();
  $('drawer-search').focus();
}

function closeDrawer() {
  $('drawer').hidden = true;
  $('drawer-mask').hidden = true;
}

function renderFilters() {
  const fams = [...new Set(themes.map((t) => t.family).filter(Boolean))];
  const chips = [['all', '全部'], ['fav', '收藏']].concat(fams.map((f) => [f, FAMS[f] || f]));
  $('drawer-filters').innerHTML = chips.map(([k, label]) => `
    <button class="fchip" data-fam="${k}" aria-pressed="${drawerFam === k}">${label}</button>`).join('');
}

function renderDrawer() {
  const grid = $('drawer-grid');
  const fav = new Set(favList());
  const q = drawerQ.trim().toLowerCase();

  let list = themes;
  if (drawerFam === 'fav') list = list.filter((t) => fav.has(t.id));
  else if (drawerFam !== 'all') list = list.filter((t) => t.family === drawerFam);
  if (q) list = list.filter((t) => (t.name + ' ' + t.id + ' ' + (t.desc || '')).toLowerCase().includes(q));

  // 收藏优先
  list = [...list].sort((a, b) => (fav.has(b.id) ? 1 : 0) - (fav.has(a.id) ? 1 : 0));

  if (!list.length) {
    grid.innerHTML = '<div class="drawer-empty">没匹配的风格，换个词试试</div>';
    return;
  }

  grid.innerHTML = list.map((t) => `
    <button class="d-card" data-id="${t.id}" aria-pressed="${t.id === activeId}">
      <span class="d-prev">
        <img class="d-thumb" loading="lazy" alt="" src="./theme-thumbs/${t.id}.jpg"
             data-thumb="${t.id}">
        <span class="d-fallback" style="background:${t.background};color:${t.primary}">
          <i></i><i></i><i></i><i></i>
        </span>
      </span>
      <span class="d-body">
        <span class="d-name">${escapeHtml(t.name)}</span>
        <span class="d-fav" data-fav="${t.id}" data-on="${fav.has(t.id) ? 1 : 0}"
              role="button" tabindex="0" aria-label="收藏">${fav.has(t.id) ? '★' : '☆'}</span>
      </span>
    </button>`).join('');
}

function toggleFav(id) {
  const fav = favList();
  const i = fav.indexOf(id);
  if (i >= 0) fav.splice(i, 1); else fav.push(id);
  lsSet(LS.fav, fav);
  renderDrawer();
  renderCaps();
}

/* ── 复制 ───────────────────────────────────────────────────── */
async function copyRich() {
  if (!lastHtml) return;
  const theme = byId.get(activeId) || {};
  const wrapped = `<div style="background:${theme.background || '#fff'}">${lastHtml}</div>`;
  const plain = $('input').value;

  // 一级：ClipboardItem 写 text/html
  try {
    if (navigator.clipboard && window.ClipboardItem) {
      await navigator.clipboard.write([new ClipboardItem({
        'text/html': new Blob([wrapped], { type: 'text/html' }),
        'text/plain': new Blob([plain], { type: 'text/plain' }),
      })]);
      toast('已复制，去公众号后台粘贴', 'ok');
      return;
    }
  } catch { /* 落到下一级 */ }

  // 二级：临时 contenteditable + execCommand
  try {
    const holder = document.createElement('div');
    holder.contentEditable = 'true';
    holder.style.cssText = 'position:fixed;left:-9999px;top:0;opacity:0';
    holder.innerHTML = wrapped;
    document.body.appendChild(holder);
    const range = document.createRange();
    range.selectNodeContents(holder);
    const sel = window.getSelection();
    sel.removeAllRanges();
    sel.addRange(range);
    const ok = document.execCommand('copy');
    sel.removeAllRanges();
    holder.remove();
    if (ok) { toast('已复制，去公众号后台粘贴', 'ok'); return; }
  } catch { /* 落到下一级 */ }

  // 三级：明确告诉用户怎么办
  toast('浏览器不让自动复制，请用右键菜单：全选预览 → 复制', 'err');
}

/* ── 草稿 ───────────────────────────────────────────────────── */
function saveDraft(text) {
  lsSet(LS.draft, { text, themeId: activeId, ts: Date.now() });
}

function restoreDraft() {
  const d = lsGet(LS.draft, null);
  if (!d || !d.text) return;
  if ($('input').value.trim()) return;   // 已有内容就不覆盖
  $('input').value = d.text;
  updateCharCount();
  toast('已恢复上次的草稿');
}

/* ── 更新管理（版本检测 + 更新记录）。模块可选，缺了不影响排版 ── */
async function initUpdate() {
  try {
    const [{ createChangelog }, { createUpdater }] = await Promise.all([
      import('./changelog.js'),
      import('./update.js'),
    ]);
    const view = createChangelog({ container: document.body });
    view.mount();
    const updater = createUpdater({ changelog: view });
    await updater.start();
  } catch (e) {
    // 更新模块加载失败时静默降级：排版功能照常，只是看不到更新记录
    console.warn('更新模块未启用：', e && e.message);
  }
}

/* ── 事件绑定 ───────────────────────────────────────────────── */
function bindUI() {
  const input = $('input');

  input.addEventListener('input', () => { updateCharCount(); scheduleRender(); });

  // 粘贴后立刻排版，不等打字防抖
  input.addEventListener('paste', () => { setTimeout(scheduleRender, 30); });

  $('btn-copy').addEventListener('click', copyRich);
  $('btn-demo').addEventListener('click', () => {
    input.value = DEMO;
    updateCharCount();
    scheduleRender();
  });
  $('btn-clear').addEventListener('click', () => {
    input.value = '';
    updateCharCount();
    doRender();
    input.focus();
  });

  // 手机 / 网页视图
  $('btn-mode').addEventListener('click', () => {
    mode = mode === 'phone' ? 'web' : 'phone';
    lsSet(LS.mode, mode);
    applyMode();
  });

  // 风格胶囊
  $('style-caps').addEventListener('click', (e) => {
    const cap = e.target.closest('.cap');
    if (cap) setActive(cap.dataset.id);
  });
  for (const btn of document.querySelectorAll('.style-scroll')) {
    btn.addEventListener('click', () => {
      $('style-caps').scrollBy({ left: Number(btn.dataset.dir) * 260, behavior: 'smooth' });
    });
  }
  $('btn-themes').addEventListener('click', openDrawer);

  // 缩略图加载失败就移除 img，露出底下的配色占位（捕获阶段才能拿到 error）
  $('drawer-grid').addEventListener('error', (e) => {
    const img = e.target;
    if (img && img.classList && img.classList.contains('d-thumb')) img.remove();
  }, true);

  // 缩略图加载失败就移除 img，露出底下的配色占位（捕获阶段才能拿到 error）
  $('drawer-grid').addEventListener('error', (e) => {
    const img = e.target;
    if (img && img.classList && img.classList.contains('d-thumb')) img.remove();
  }, true);

  // 抽屉
  $('btn-drawer-close').addEventListener('click', closeDrawer);
  $('drawer-mask').addEventListener('click', closeDrawer);
  $('drawer-search').addEventListener('input', (e) => { drawerQ = e.target.value; renderDrawer(); });
  $('drawer-filters').addEventListener('click', (e) => {
    const chip = e.target.closest('.fchip');
    if (!chip) return;
    drawerFam = chip.dataset.fam;
    renderFilters();
    renderDrawer();
  });
  $('drawer-grid').addEventListener('click', (e) => {
    const favBtn = e.target.closest('.d-fav');
    if (favBtn) { e.stopPropagation(); toggleFav(favBtn.dataset.fav); return; }
    const card = e.target.closest('.d-card');
    if (card) { setActive(card.dataset.id); closeDrawer(); }
  });

  // 更多菜单
  const menu = $('menu');
  $('btn-more').addEventListener('click', (e) => {
    e.stopPropagation();
    menu.hidden = !menu.hidden;
    $('btn-more').setAttribute('aria-expanded', String(!menu.hidden));
  });
  document.addEventListener('click', () => {
    if (!menu.hidden) { menu.hidden = true; $('btn-more').setAttribute('aria-expanded', 'false'); }
  });
  menu.addEventListener('click', (e) => {
    const act = e.target.closest('button')?.dataset.act;
    if (!act) return;
    menu.hidden = true;
    if (act === 'draft') restoreDraft();
    if (act === 'clear-draft') {
      lsDel(LS.draft);
      toast('草稿已清除');
    }
    if (act === 'clear-all') clearAll();
    if (act === 'about') openAbout();
  });

  $('btn-about-close').addEventListener('click', closeAbout);
  $('about-mask').addEventListener('click', closeAbout);

  // 移动端 tabs
  $('tabs').addEventListener('click', (e) => {
    const btn = e.target.closest('button');
    if (!btn) return;
    $('stage').dataset.tab = btn.dataset.tab;
    for (const b of $('tabs').querySelectorAll('button')) {
      b.setAttribute('aria-pressed', String(b === btn));
    }
  });

  // 快捷键
  document.addEventListener('keydown', (e) => {
    if ((e.ctrlKey || e.metaKey) && e.key === 'Enter') { e.preventDefault(); doRender(); }
    if (e.key === 'Escape') { closeDrawer(); closeAbout(); }
  });
}

function applyMode() {
  const wrap = $('preview-wrap');
  wrap.classList.toggle('web', mode === 'web');
  $('btn-mode').textContent = mode === 'web' ? '网页' : '手机';
}

function openAbout() { $('about').hidden = false; $('about-mask').hidden = false; }
function closeAbout() { $('about').hidden = true; $('about-mask').hidden = true; }

async function clearAll() {
  if (!confirm('清除本机保存的草稿、收藏与风格偏好？文章内容不会上传，删了就找不回。')) return;
  lsDel(LS.draft); lsDel(LS.fav); lsDel(LS.recent); lsDel(LS.theme); lsDel(LS.mode);
  try {
    if (window.caches) {
      const keys = await caches.keys();
      await Promise.all(keys.map((k) => caches.delete(k)));
    }
  } catch { /* 清缓存失败不影响数据清理 */ }
  toast('本地数据已清除，刷新后回到初始状态');
}

function escapeHtml(s) {
  return String(s).replace(/[&<>"']/g, (c) => (
    { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]
  ));
}

const DEMO = `周末去海边，我把手机调成了飞行模式

出发前一晚我还在改稿，凌晨两点关电脑，第二天六点的车。上车之后才发现，我已经很久没有这样空着手坐三个小时了。

为什么要跑那么远

城市里的安静是借来的。图书馆四点半闭馆，咖啡馆九点打烊，连公园都有保安吹哨子。海边的安静不要钱，也没人赶你走。

- 第一天下午到的，风很大，帽子被吹进海里
- 第二天退潮，捡了半袋碎贝壳
- 第三天什么都没做，就在岸边坐着

住在哪里

民宿在渔村最里面，老板是本地人，早上会敲门问要不要吃面。房间朝东，五点半太阳就照进来了。

注意：渔村晚上没有路灯，手机要留电。

> 有些休息不是为了更好地工作，就是单纯地需要休息。`;

main();
