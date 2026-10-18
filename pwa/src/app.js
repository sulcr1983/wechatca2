/* SuperSu PWA 主交互层
 *
 * 数据流：输入 → 400ms 防抖 → Worker 里的 Python 引擎 → 内联样式 HTML
 *        → iframe 同步 doc.write → 解析条从返回的 markdown 统计
 * 全部本地：没有网络请求（除首次加载引擎与主题 JSON）。
 */

import { createEngine } from './bridge.js';
import { renderLight } from './light.js';

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
const lsSet = (k, v) => { try { localStorage.setItem(k, JSON.stringify(v)); return true; } catch { return false; } };
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
let engineReady = null;   // boot 的 Promise：渲染排队等它，但不挡输入
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
  initAi();         // AI 面板（纯前端 BYOK；未配置时不影响排版）

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

  // 先把草稿恢复到输入框：引擎启动失败（弱网/离线首启）时也不能让用户看不到稿子
  restoreDraft();

  // 引擎异步启动，UI 先可用（骨架 + 遮罩）
  engine = createEngine({ onProgress: onProgress });
  // 引擎在空闲时再开始下载：先让外壳 / 主题 / 轻量预览拿到带宽。
  // 首访实测引擎要 20 秒以上，这期间用户已经能看到近似排版并继续输入。
  const startBoot = () => {
    engineReady = engine.boot().then(() => {
      setEngineState('ready', '引擎已就绪');
      $('boot').classList.add('gone');
      if ($('input').value.trim()) scheduleRender();
    }).catch((e) => {
      setEngineState('error', '引擎加载失败');
      $('boot-label').textContent = '引擎加载失败，点这里重试';
      $('boot-fill').style.background = 'var(--accent)';
      const bootEl = $('boot');
      if (bootEl) {
        bootEl.style.pointerEvents = 'auto';
        bootEl.style.cursor = 'pointer';
        bootEl.onclick = () => location.reload();
      }
      toast('引擎加载失败：' + e.message, 'err');
    });
  };
  if ('requestIdleCallback' in window) {
    requestIdleCallback(startBoot, { timeout: 2500 });
  } else {
    setTimeout(startBoot, 1200);
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

  // 引擎还没就绪（首次要下约 5MB）：先用 12KB 的轻量渲染给一版近似结果，
  // 精确结果到了再原地替换。复制按钮保持禁用，避免把近似版粘进公众号。
  if (!engine || !engine.isReady()) {
    try {
      const raw = themeJsonCache.get(activeId) || await loadThemeJson(activeId);
      const html = renderLight(text, JSON.parse(raw));
      if (mySeq !== renderSeq) return;
      if (html) {
        showPreview(html);
        setEngineState('loading', '快速预览 · 精确排版准备中');
        saveDraft(text);   // 引擎没就绪也要先把稿子存住
      }
    } catch (e) { /* 轻量预览失败就安静等精确结果 */ }
    return;
  }

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
  document.body.classList.add('browsing');   // 让主区给抽屉让位（桌面端不重叠）
  renderFilters();
  renderDrawer();
  $('drawer-search').focus();
}

function closeDrawer() {
  $('drawer').hidden = true;
  $('drawer-mask').hidden = true;
  document.body.classList.remove('browsing');
}

function renderFilters() {
  const fams = [...new Set(themes.map((t) => t.family).filter(Boolean))];
  const chips = [['all', '全部'], ['fav', '收藏']].concat(fams.map((f) => [f, FAMS[f] || f]));
  $('drawer-filters').innerHTML = chips.map(([k, label]) => `
    <button class="fchip" data-fam="${k}" aria-pressed="${drawerFam === k}">${label}</button>`).join('');
}

/* ── 2A 族折叠（与本地版 templates/index.html 保持一致）──
   同族 12 换色折叠成「1 张代表卡 + 色调色点条」；点色点换色**不关抽屉**，方便连续对比。 */
function famLabel(f) { return f ? (FAMS[f] || f) : ''; }
// 色调名 = 主题名去掉族前缀（「卷宗·朱砂」→「朱砂」）
function toneName(t) {
  const f = t.family;
  if (!f) return t.name;
  return String(t.name || '').replace(/^[^·•\-]*[·•\-]\s*/, '') || t.name;
}
// 单张主题卡（扁平网格 / 族代表卡共用）
function drawerCard(t, fav) {
  const inUse = t.id === activeId;
  const isFav = fav.has(t.id);
  return `
    <button class="d-card" data-id="${t.id}" aria-pressed="${inUse}">
      <span class="d-prev">
        <img class="d-thumb" loading="lazy" alt="" src="./theme-thumbs/${t.id}.jpg"
             data-thumb="${t.id}">
        <span class="d-fallback" style="background:${t.background};color:${t.primary}">
          <i></i><i></i><i></i><i></i>
        </span>
      </span>
      <span class="d-body">
        <span class="d-name">${escapeHtml(t.name)}</span>
        <span class="d-fav" data-fav="${t.id}" data-on="${isFav ? 1 : 0}"
              role="button" tabindex="0" aria-label="收藏">${isFav ? '★' : '☆'}</span>
      </span>
    </button>`;
}
// 族代表卡：点它进入该族的折叠视图
function familyRepCard(fam, list, fav) {
  const rep = list.find((t) => t.id === activeId) || list[0];
  const inUse = list.some((t) => t.id === activeId);
  return `
    <button class="d-card d-family-card" data-family="${fam}" aria-pressed="${inUse}">
      <span class="d-prev">
        <img class="d-thumb" loading="lazy" alt="" src="./theme-thumbs/${rep.id}.jpg"
             data-thumb="${rep.id}">
        <span class="d-fallback" style="background:${rep.background};color:${rep.primary}">
          <i></i><i></i><i></i><i></i>
        </span>
        <span class="d-badge">${list.length} 色</span>
      </span>
      <span class="d-body">
        <span class="d-name">${escapeHtml(famLabel(fam))}族</span>
        <span class="d-count">${list.length} 色可选</span>
      </span>
    </button>`;
}
// 扁平网格：收藏优先
function renderFlat(list, fav) {
  const grid = $('drawer-grid');
  const ranked = [...list].sort((a, b) => (fav.has(b.id) ? 1 : 0) - (fav.has(a.id) ? 1 : 0));
  grid.innerHTML = ranked.length
    ? ranked.map((t) => drawerCard(t, fav)).join('')
    : '<div class="drawer-empty">没匹配的风格，换个词试试</div>';
}
// 「全部」视图按族折叠：每族 1 张代表卡，其余（初代/经典）平铺
function renderAllFolded(fav) {
  const fams = [...new Set(themes.map((t) => t.family).filter(Boolean))];
  const byFam = {}; fams.forEach((f) => { byFam[f] = []; });
  const classic = [];
  themes.forEach((t) => { (t.family && byFam[t.family] ? byFam[t.family] : classic).push(t); });
  const reps = fams.filter((f) => byFam[f].length).map((f) => familyRepCard(f, byFam[f], fav)).join('');
  const ranked = [...classic].sort((a, b) => (fav.has(b.id) ? 1 : 0) - (fav.has(a.id) ? 1 : 0));
  $('drawer-grid').innerHTML = reps + ranked.map((t) => drawerCard(t, fav)).join('');
}
// 族视图：1 张代表卡 + 一条横向色调色点（点色点换色，不关抽屉）
function renderFamilyFold(fam, fav) {
  const list = themes.filter((t) => t.family === fam);
  const grid = $('drawer-grid');
  if (!list.length) { grid.innerHTML = '<div class="drawer-empty">没匹配的风格，换个词试试</div>'; return; }
  const rep = list.find((t) => t.id === activeId) || list[0];
  const tones = list.map((t) => {
    const col = t.accent || t.primary || '#888';
    const on = t.id === activeId;
    return `<button class="d-tone${on ? ' active' : ''}" data-id="${t.id}" type="button" aria-pressed="${on}">
      <span class="d-tone-dot" style="background:${col}"></span>
      <span class="d-tone-name">${escapeHtml(toneName(t))}</span>
    </button>`;
  }).join('');
  grid.innerHTML = `<div class="d-fold">${drawerCard(rep, fav)}<div class="d-tone-strip">${tones}</div></div>`;
}
function renderDrawer() {
  const fav = new Set(favList());
  const q = drawerQ.trim().toLowerCase();
  // 搜索优先：全量扁平（跨所有主题，不折叠）
  if (q) {
    renderFlat(themes.filter((t) => (t.name + ' ' + t.id + ' ' + (t.desc || '')).toLowerCase().includes(q)), fav);
    return;
  }
  if (drawerFam === 'fav') { renderFlat(themes.filter((t) => fav.has(t.id)), fav); return; }
  if (drawerFam === 'all') { renderAllFolded(fav); return; }
  renderFamilyFold(drawerFam, fav);
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

/* ── AI 工具（纯前端 BYOK：Key 只存本机，不上传） ─────────────── */
async function initAi() {
  let ai;
  try {
    ai = await import('./ai.js');
  } catch (e) {
    return;   // AI 模块缺失不影响排版
  }
  const sheet = $('ai-sheet');
  const mask = $('ai-mask');
  const out = $('ai-out');
  if (!sheet || !mask) return;

  const open = () => {
    const c = ai.loadConfig();
    $('ai-base').value = c.baseUrl || '';
    $('ai-model').value = c.model || '';
    $('ai-key').value = c.key || '';
    sheet.hidden = false;
    mask.hidden = false;
  };
  const close = () => { sheet.hidden = true; mask.hidden = true; };
  const readForm = () => ({
    baseUrl: $('ai-base').value.trim(),
    model: $('ai-model').value.trim(),
    key: $('ai-key').value.trim(),
  });
  const say = (msg) => { if (!out) return; out.hidden = false; out.textContent = msg; };

  const btnAi = $('btn-ai');
  if (btnAi) btnAi.addEventListener('click', open);
  $('ai-close').addEventListener('click', close);
  mask.addEventListener('click', close);

  $('ai-save').addEventListener('click', () => {
    const cfg = readForm();
    if (!cfg.baseUrl || !cfg.key || !cfg.model) { toast('接口地址、模型、Key 三项都要填', 'err'); return; }
    ai.saveConfig(cfg);
    toast('AI 配置已保存在本机');
  });

  $('ai-test').addEventListener('click', async (e) => {
    const btn = e.currentTarget;
    btn.disabled = true;
    btn.textContent = '测试中…';
    try {
      ai.saveConfig(readForm());
      const r = await ai.testConnection();
      say('连接成功：' + (r || 'ok'));
      toast('AI 连接正常');
    } catch (err) {
      say('连接失败：' + err.message);
      toast('AI 连接失败：' + err.message, 'err');
    } finally {
      btn.disabled = false;
      btn.textContent = '测试连接';
    }
  });

  const run = async (btn, label, fn) => {
    const text = $('input').value.trim();
    if (!text) { toast('先在编辑器里写点内容', 'err'); return; }
    btn.disabled = true;
    const old = btn.textContent;
    btn.textContent = label + '中…';
    try {
      await fn(text);
    } catch (err) {
      say(label + '失败：' + err.message);
      toast(label + '失败：' + err.message, 'err');
    } finally {
      btn.disabled = false;
      btn.textContent = old;
    }
  };

  $('ai-polish').addEventListener('click', (e) => run(e.currentTarget, '润色', async (text) => {
    const outText = await ai.polish(text);
    if (!outText) throw new Error('AI 返回空内容');
    $('input').value = outText;
    saveDraft(outText);
    scheduleRender();
    say('已润色并写回编辑器');
    toast('润色完成');
  }));

  $('ai-format').addEventListener('click', (e) => run(e.currentTarget, '排版', async (text) => {
    if (!engine || !engine.isReady()) throw new Error('引擎还没就绪，稍等几秒再试');
    const plan = await ai.planStructure(text);
    const res = await engine.applyStructure(text, plan);
    if (!res || !res.markdown) throw new Error('结构套用失败');
    $('input').value = res.markdown;
    saveDraft(res.markdown);
    scheduleRender();
    say('已按 AI 结构重排（正文一个字没改）');
    toast('智能排版完成');
  }));

  $('ai-summary').addEventListener('click', (e) => run(e.currentTarget, '摘要', async (text) => {
    const s = await ai.summarize(text);
    say(s || '（空）');
    toast('摘要已生成');
  }));
}

/* ── 草稿 ───────────────────────────────────────────────────── */
// 落盘与渲染解耦：渲染失败 / 引擎还没就绪时也必须能存住稿子
function saveDraft(text) {
  const payload = { text: String(text == null ? '' : text), themeId: activeId, ts: Date.now() };
  const ok = lsSet(LS.draft, payload);
  return ok;
}

// 更新前落盘钩子：update.js 在 skipWaiting 之前 await 它（localStorage 同步写）
window.__supersuFlushDraft = () => {
  try { saveDraft($('input').value); } catch (e) { /* 忽略 */ }
  return Promise.resolve();
};

let lastInputAt = Date.now();

// 空闲判定钩子：update.js 用它决定「能不能静默应用更新」
window.__supersuIsIdle = () => {
  const empty = !$('input').value.trim();
  const farFromInput = Date.now() - lastInputAt > 30000;
  const notTyping = !document.hasFocus() || document.activeElement !== $('input');
  return empty || (farFromInput && notTyping);
};

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
      import('./update/changelog.js'),
      import('./update/index.js'),
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

  let draftTimer = null;
  input.addEventListener('input', () => {
    updateCharCount();
    scheduleRender();
    lastInputAt = Date.now();
    // 草稿独立落盘（500ms 防抖）：不再依赖 doRender 成功，
    // 渲染失败、引擎未就绪、更新 reload 都不会丢最后一段输入
    clearTimeout(draftTimer);
    draftTimer = setTimeout(() => saveDraft(input.value), 500);
  });

  // 切走/关闭页面时补一刀（移动端 visibilitychange 比 beforeunload 可靠）
  document.addEventListener('visibilitychange', () => {
    if (document.visibilityState === 'hidden') saveDraft(input.value);
  });
  window.addEventListener('pagehide', () => saveDraft(input.value));

  // 粘贴后立刻排版，不等打字防抖
  input.addEventListener('paste', () => { setTimeout(scheduleRender, 30); });

  $('btn-copy').addEventListener('click', copyRich);
  const emptyDemo = $('btn-empty-demo');
  if (emptyDemo) emptyDemo.addEventListener('click', () => $('btn-demo').click());

  $('btn-demo').addEventListener('click', () => {
    input.value = DEMO;
    updateCharCount();
    saveDraft(input.value);   // 不等渲染，立即落盘
    scheduleRender();
  });
  $('btn-clear').addEventListener('click', () => {
    input.value = '';
    updateCharCount();
    saveDraft('');            // 清空也要落盘，避免刷新后旧草稿复活
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
    const tone = e.target.closest('.d-tone');
    // 同族换色：不关抽屉，让用户可以连点不同色调逐个对比（与本地版一致）
    if (tone) { setActive(tone.dataset.id); return; }
    const card = e.target.closest('.d-card');
    if (!card) return;
    if (card.dataset.family) {   // 族代表卡 → 进入该族的折叠视图（不关抽屉）
      drawerFam = card.dataset.family;
      renderFilters();
      renderDrawer();
      return;
    }
    // 选模板不关抽屉：让用户可以连点几个逐个看效果（选风格时预览就在左边）
    setActive(card.dataset.id);
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
    if (act === 'update') $('btn-update')?.click();   // 移动端浮动入口隐藏，从「更多」进
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
