/* SuperSu PWA 主交互层
 *
 * 数据流：输入 → 400ms 防抖 → Worker 里的 Python 引擎 → 内联样式 HTML
 *        → iframe 同步 doc.write → 解析条从返回的 markdown 统计
 * 全部本地：没有网络请求（除首次加载引擎与主题 JSON）。
 */

import { createEngine } from './bridge.js';
import { renderLight } from './light.js';
import { scanExternalImages, localizeImages, failureSummary } from './images.js';

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
const kb = (n) => (n >= 1024 ? (n / 1024).toFixed(1) + ' KB' : n + ' B');

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
let lastRawHtml = '';              // 引擎原始输出（本地化图片前），用于重试/重抓
let imgBusy = false;               // 图片本地化进行中，防重复点击
let lastImgLocalized = 0;          // 本次渲染已内嵌的图片张数
let lastImgFailed = [];            // 本次本地化失败的 { src, reason }
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
  // 自定义配色刷新后也要能恢复（否则关页就丢）
  activeId = (saved === CUSTOM_ID && customColors()) ? CUSTOM_ID
    : (saved && byId.has(saved)) ? saved
    : (byId.has(DEFAULT_THEME) ? DEFAULT_THEME : themes[0].id);

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
    lastRawHtml = '';
    lastMarkdown = '';
    lastImgLocalized = 0;
    lastImgFailed = [];
    showEmpty();
    updateImageTip();
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
    lastRawHtml = out.html;
    lastImgLocalized = 0;
    lastImgFailed = [];
    lastMarkdown = out.markdown;
    showPreview(out.html);
    updateImageTip();
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
  // 自定义配色：以当前主题为底，把 styles 里写死的颜色换掉（colors 字段引擎不直接消费）
  if (id === CUSTOM_ID) {
    const base = themeJsonCache.get(customBase) || await loadThemeJson(customBase);
    const out = applyCustomColors(JSON.parse(base));
    return JSON.stringify(out);
  }
  const res = await fetch(`./themes/${id}.json`);
  if (!res.ok) throw new Error(`主题 ${id} 读取失败`);
  const txt = await res.text();
  themeJsonCache.set(id, txt);
  return txt;
}

/* ── 自定义配色（最小版，2026-10-24）───────────────────────────
   只做三件事：三个颜色 → 套到底色/正文/强调 → 存本机。
   实现要点：主题 JSON 的 styles 里颜色是写死的 hex（不引用 colors），
   所以必须遍历 styles 把命中旧色的值替换掉，否则只改 colors 看不到变化。 */
const CUSTOM_ID = '__custom__';
const LS_CUSTOM = 'supersu.pwa.custom';
let customBase = '';   // 自定义以哪套主题为底（取当前主题，保证字号/间距等排版不变）

function customColors() {
  try {
    const v = JSON.parse(localStorage.getItem(LS_CUSTOM) || 'null');
    return (v && v.bg && v.text && v.accent) ? v : null;
  } catch { return null; }
}

// 把 theme.colors 的三个主色映射进 styles 的每个颜色值
function applyCustomColors(theme) {
  const c = customColors();
  if (!c) return theme;
  const old = theme.colors || {};
  const map = new Map();
  const norm = (s) => String(s || '').toUpperCase();
  if (old.background) map.set(norm(old.background), c.bg);
  if (old.primary) map.set(norm(old.primary), c.text);
  if (old.accent) map.set(norm(old.accent), c.accent);
  const walk = (obj) => {
    for (const k of Object.keys(obj)) {
      const v = obj[k];
      if (typeof v === 'string') {
        const hit = map.get(norm(v));
        if (hit) obj[k] = hit;
      } else if (v && typeof v === 'object') walk(v);
    }
  };
  if (theme.styles) walk(theme.styles);
  theme.colors = { ...old, background: c.bg, primary: c.text, accent: c.accent };
  theme.name = '自定义配色';
  return theme;
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

/* ── 外链图（方案 B2 · #6）─────────────────────────────────────
 * 事实：公众号编辑器粘贴富文本只认公众号图床，**拒绝 data: URI**。
 * 因此这里只承诺「导出 HTML / 长图 / 留档可用」，复制链路如实提示需手动上传。 */
function updateImageTip() {
  const el = $('img-tip');
  const txt = $('img-tip-text');
  const btn = $('btn-localize');
  if (!el || !txt || !btn) return;

  const left = scanExternalImages(lastHtml).length;
  if (left) {
    el.hidden = false;
    txt.textContent = lastImgFailed.length
      ? `仍有 ${left} 张外链图未内嵌：${failureSummary(lastImgFailed)}`
      : `发现 ${left} 张外链图：公众号直贴不会显示；本地化后可用于导出 / 留档`;
    btn.hidden = false;
    btn.disabled = imgBusy;
    btn.textContent = imgBusy ? '正在抓取…' : (lastImgFailed.length ? '重试剩余' : '本地化图片');
  } else if (lastImgLocalized) {
    el.hidden = false;
    txt.textContent = `已内嵌 ${lastImgLocalized} 张图片（导出 HTML / 长图可用；公众号仍需在素材库手动上传）`;
    btn.hidden = true;
    btn.disabled = false;
  } else {
    el.hidden = true;
    btn.hidden = false;
    btn.disabled = false;
  }
}

async function localizeForUser() {
  if (imgBusy || !lastRawHtml) return;
  const seq = renderSeq;
  imgBusy = true;
  updateImageTip();
  try {
    const r = await localizeImages(lastRawHtml);
    if (seq !== renderSeq) return;              // 抓取期间用户又改了内容
    lastImgLocalized = r.localized;
    lastImgFailed = r.failed;
    if (r.localized) {
      lastHtml = r.html;
      showPreview(r.html);
    }
    if (!r.failed.length) toast(`已内嵌 ${r.localized} 张图片（可用于导出）`, 'ok');
    else toast(`已内嵌 ${r.localized}/${r.total} 张；${r.failed.length} 张失败：${failureSummary(r.failed)}`, 'err');
  } catch (e) {
    if (seq === renderSeq) toast('图片本地化失败：' + ((e && e.message) || e), 'err');
  } finally {
    imgBusy = false;
    updateImageTip();
  }
}

/** 导出前自动内嵌外链图（只对 HTML / 长图有意义；复制链路不做假承诺） */
async function ensureLocalizedForExport() {
  const n = scanExternalImages(lastHtml).length;
  if (!n || !lastRawHtml) return { html: lastHtml, failed: [], localized: 0 };
  const seq = renderSeq;
  toast(`正在内嵌 ${n} 张外链图…`);
  const r = await localizeImages(lastRawHtml);
  if (seq !== renderSeq) throw new Error('内容刚发生变化，请重新导出');
  lastImgLocalized = r.localized;
  lastImgFailed = r.failed;
  if (r.localized) {
    lastHtml = r.html;
    showPreview(r.html);
  }
  updateImageTip();
  return { html: r.html, failed: r.failed, localized: r.localized };
}

function updateWxTitle(text) {
  const first = text.split('\n').map((l) => l.trim()).find(Boolean) || '未命名';
  // 去掉 Markdown 标记：# 标题 / > 引用 / - 列表，导出文件名不该带符号
  const clean = first.replace(/^#{1,6}\s*/, '').replace(/^>\s*/, '').replace(/^[-*+]\s+/, '').trim();
  $('wx-title').textContent = (clean || '未命名').slice(0, 24);
}

/* ── 解析条 ─────────────────────────────────────────────────── */
function updateParseBar(markdown) {
  // 只重绘识别结果容器，避免把同排的「AI 排版」按钮一起冲掉（2026-10-24 实测踩到）
  const bar = $('parse-body') || $('parse-bar');
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

// 主题元信息：普通主题查索引；自定义配色是虚拟主题（不在 164 套索引里）
function themeMeta(id) {
  if (id === CUSTOM_ID) {
    const c = customColors();
    const base = byId.get(customBase) || themes[0] || {};
    return { id: CUSTOM_ID, name: '自定义配色',
             background: c ? c.bg : base.background, accent: c ? c.accent : base.accent,
             primary: c ? c.text : base.primary };
  }
  return byId.get(id);
}

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
  // 当前主题必须始终出现在胶囊条里（否则「正在用哪套」在底部看不出来）
  const list = orderedThemes();
  const current = themeMeta(activeId);
  const shown = (current ? [current, ...list.filter((t) => t.id !== activeId)] : list).slice(0, 40);
  box.innerHTML = shown.map((t) => `
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

function setActive(id, announce = false) {
  if (id !== CUSTOM_ID && !byId.has(id)) return;
  activeId = id;
  localStorage.setItem(LS.theme, id);
  renderCaps();
  if (!$('drawer').hidden) renderDrawer();
  scheduleRender();
  // 同族 12 色只改强调色：纯文字文章里预览看不出差别，必须给一条明确反馈
  if (announce) {
    const t = themeMeta(id);
    toast(`已切换：${t ? t.name : id}`, 'ok');
  }
}

/* ── 抽屉 ───────────────────────────────────────────────────── */
let drawerFam = 'all';
let drawerQ = '';
let drawerTone = '';   // 二维选择器：记住当前色调，跨版式迁移（素页·竹青 → 卷宗·竹青）

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
  // 族视图里家族 chip 与上方「版式」条重复，只保留「全部 / 收藏」；切族交给版式条
  const inFamily = drawerFam !== 'all' && drawerFam !== 'fav';
  const chips = [['all', '全部'], ['fav', '收藏']]
    .concat(inFamily ? [] : fams.map((f) => [f, FAMS[f] || f]));
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
    : emptyStateHtml();
}
// 空态不能是死空白（U-8，2026-10-24）：按上下文给出口
function emptyStateHtml() {
  const q = drawerQ.trim();
  if (q) {
    return `<div class="drawer-empty">没匹配「${escapeHtml(q)}」的风格
      <div class="d-empty-acts">
        <button class="ghost-btn" type="button" data-empty-act="clear">清除搜索</button>
        <button class="ghost-btn" type="button" data-empty-act="recent">看最近使用的</button>
      </div></div>`;
  }
  if (drawerFam === 'fav') {
    return `<div class="drawer-empty">还没有收藏
      <div class="d-empty-acts">
        <button class="ghost-btn" type="button" data-empty-act="all">看全部风格</button>
      </div></div>`;
  }
  return '<div class="drawer-empty">没匹配的风格，换个词试试</div>';
}
const clearSearch = () => { drawerQ = ''; $('drawer-search').value = ''; };
// 看最近使用的：有最近 → 平铺最近；没有 → 回落全部视图并说明
function showRecent() {
  const ids = recentList().filter((id) => byId.has(id));
  if (!ids.length) {
    drawerFam = 'all';
    renderFilters();
    renderDrawer();
    toast('还没有最近使用的主题，先逛逛全部');
    return;
  }
  renderFlat(ids.map((id) => byId.get(id)), new Set(favList()));
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
// 族视图：版式 × 色调二维选择（2026-10-24）
// 版式条只列有色调可选的族；换版式时**保留同名色调**（素页·竹青 → 卷宗·竹青）。
function renderFamilyFold(fam, fav) {
  const list = themes.filter((t) => t.family === fam);
  const grid = $('drawer-grid');
  if (!list.length) { grid.innerHTML = '<div class="drawer-empty">没匹配的风格，换个词试试</div>'; return; }
  const rep = list.find((t) => t.id === activeId) || list[0];
  const famKeys = [...new Set(themes.map((t) => t.family).filter(Boolean))];
  const axis = famKeys.map((f) => `<button class="d-axis${f === fam ? ' active' : ''}"
      data-fam="${f}" type="button" aria-pressed="${f === fam}">${escapeHtml(famLabel(f))}</button>`).join('');
  const tones = list.map((t) => {
    const col = t.accent || t.primary || '#888';
    const on = t.id === activeId;
    return `<button class="d-tone${on ? ' active' : ''}" data-id="${t.id}" type="button" aria-pressed="${on}">
      <span class="d-tone-dot" style="background:${col}"></span>
      <span class="d-tone-name">${escapeHtml(toneName(t))}</span>
    </button>`;
  }).join('');
  grid.innerHTML = `<div class="d-fold">
    <div class="d-axis-row" role="group" aria-label="版式">${axis}</div>
    ${drawerCard(rep, fav)}
    <div class="d-tone-strip">${tones}</div>
  </div>`;
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
      toastAfterCopy();
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
    if (ok) { toastAfterCopy(); return; }
  } catch { /* 落到下一级 */ }

  // 三级：明确告诉用户怎么办
  toast('浏览器不让自动复制，请用右键菜单：全选预览 → 复制', 'err');
}

/** 复制后的如实反馈：公众号只认图床 URL，data URI 与外链都不算「已完成」 */
function toastAfterCopy() {
  const left = scanExternalImages(lastHtml).length;
  const embedded = /data:image\//i.test(lastHtml);
  if (left) toast(`已复制，但还有 ${left} 张外链图，公众号里不会显示`, 'err');
  else if (embedded) toast('已复制。公众号不识别内嵌图，正文图请在素材库上传，或用长图导出', 'err');
  else toast('已复制，去公众号后台粘贴', 'ok');
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

  // 平台下拉：选项由 ai.js 的 AI_PLATFORMS 渲染（单一真源，加平台只改一处）
  const selPlatform = $('ai-platform');
  if (selPlatform && !selPlatform.options.length) {
    for (const p of ai.AI_PLATFORMS) {
      const o = document.createElement('option');
      o.value = p.id;
      o.textContent = p.name;
      selPlatform.appendChild(o);
    }
    const oc = document.createElement('option');
    oc.value = 'custom';
    oc.textContent = '自定义（自填地址与模型）';
    selPlatform.appendChild(oc);
  }

  const open = () => {
    const c = ai.loadConfig();
    const hasCfg = !!(c.baseUrl || c.model || c.key);
    // 按接口地址反查预设；有配置但查不到（含自定义地址）→ 「自定义」；
    // 完全没配置 → 默认第一个平台，地址/模型预填好，用户只差填 Key
    const p = ai.presetByBaseUrl(c.baseUrl) || (hasCfg ? null : ai.AI_PLATFORMS[0]);
    if (p) {
      selPlatform.value = p.id;
      $('ai-base').value = c.baseUrl || p.baseUrl;
      $('ai-model').value = c.model || p.model;
    } else {
      selPlatform.value = 'custom';
      $('ai-base').value = c.baseUrl || '';
      $('ai-model').value = c.model || '';
    }
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

  // 换平台 → 地址/模型按预设重填（之后仍可手改）；「自定义」→ 清空自填
  selPlatform.addEventListener('change', () => {
    const p = ai.AI_PLATFORMS.find(x => x.id === selPlatform.value);
    if (p) {
      $('ai-base').value = p.baseUrl;
      $('ai-model').value = p.model;
    } else {
      $('ai-base').value = '';
      $('ai-model').value = '';
    }
  });

  // AI 能力门控：三项配置齐全 + **测试连接通过** 才把 AI 入口放出来；
  // 没接入时页面完全按本地工作，不出现任何 AI 入口（用户 2026-10-24 的产品规则）。
  const refreshAiGate = () => {
    const on = !!ai.isVerified();
    document.body.classList.toggle('ai-ready', on);
    const row = $('btn-ai-format-row');
    if (row) row.hidden = !on;
  };
  refreshAiGate();

  const btnAi = $('btn-ai');
  if (btnAi) btnAi.addEventListener('click', open);
  $('ai-close').addEventListener('click', close);
  mask.addEventListener('click', close);

  $('ai-save').addEventListener('click', () => {
    const cfg = readForm();
    if (!cfg.baseUrl || !cfg.key || !cfg.model) { toast('接口地址、模型、Key 三项都要填（选好平台，前两项自动填好）', 'err'); return; }
    ai.saveConfig(cfg);
    refreshAiGate();   // 配置一变，之前的「测试通过」作废，AI 入口收起
    toast('AI 配置已保存在本机，点「测试连接」通过后才会启用 AI 排版');
  });

  $('ai-test').addEventListener('click', async (e) => {
    const btn = e.currentTarget;
    btn.disabled = true;
    btn.textContent = '测试中…';
    try {
      ai.saveConfig(readForm());
      const r = await ai.testConnection();
      ai.markVerified();     // 只有测试成功才落「已验证」
      refreshAiGate();
      say('连接成功：' + (r || 'ok'));
      toast('AI 连接正常，已启用 AI 排版');
    } catch (err) {
      refreshAiGate();
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

  const runAiFormat = (btn) => run(btn, '排版', async (text) => {
    if (!engine || !engine.isReady()) throw new Error('引擎还没就绪，稍等几秒再试');
    // 与本地版 /api/ai-format 同一降级契约：AI 不可用 / 失败 / 结构不可解析 → 本地规则兜底，
    // 按钮永远给得出结果，且必须说明为什么没用上 AI（不静默）。
    let plan = null;
    let reason = '';
    try {
      plan = await ai.planStructure(text);
      const usable = plan && (Number.isInteger(plan.title)
        || (Array.isArray(plan.sections) && plan.sections.length)
        || (Array.isArray(plan.lists) && plan.lists.length)
        || (Array.isArray(plan.bold) && plan.bold.length));
      if (!usable) {
        reason = 'AI 返回的结构为空或格式不对';
        plan = null;
      }
    } catch (err) {
      reason = (err && err.message) || String(err);
    }

    if (plan) {
      try {
        const res = await engine.applyStructure(text, plan);
        if (res && res.markdown) {
          aiUndoText = text;          // 撤销回到排版前
          syncUndo();
          $('input').value = res.markdown;
          saveDraft(res.markdown);
          scheduleRender();
          const counts = [
            ['拆段', plan.splits], ['合段', plan.merges], ['表格', plan.tables],
            ['提示框', plan.callouts], ['分隔线', plan.hrs], ['金句', plan.pullquotes],
            ['小节', plan.sections], ['列表', plan.lists],
          ].filter(([, v]) => Array.isArray(v) && v.length)
            .map(([k, v]) => `${k} ${v.length}`).join(' · ') || '结构微调';
          say(`已按 AI 结构重排：${counts}（正文一个字没改）`);
          toast(`智能排版完成：${counts}`);
          return;
        }
        reason = 'AI 结构套用失败';
      } catch (err) {
        reason = (err && err.message) || String(err);
      }
    }

    const local = await engine.render(text);
    if (!local || !local.markdown) throw new Error('本地排版也失败了，请刷新重试');
    aiUndoText = text;
    syncUndo();
    $('input').value = local.markdown;
    saveDraft(local.markdown);
    scheduleRender();
    say('AI 未生效（' + reason + '），已用本地规则排版');
    toast('已用本地规则排版：' + reason, 'err');
  });

  // 入口一：AI 面板里的「智能排版」；入口二：解析条上的常驻「AI 排版」（仅 AI 就绪时显形）
  $('ai-format').addEventListener('click', (e) => runAiFormat(e.currentTarget));
  const rowFmt = $('btn-ai-format-row');
  if (rowFmt) rowFmt.addEventListener('click', () => runAiFormat(rowFmt));

  // 撤销：AI 排版 / 本地兜底都会重写编辑器，必须能一键回到排版前
  let aiUndoText = null;
  const syncUndo = () => {
    const b = $('ai-undo');
    if (b) b.hidden = !aiUndoText;
  };
  const undoBtn = $('ai-undo');
  if (undoBtn) {
    undoBtn.addEventListener('click', () => {
      if (!aiUndoText) return;
      $('input').value = aiUndoText;
      saveDraft(aiUndoText);
      scheduleRender();
      aiUndoText = null;
      syncUndo();
      say('已撤销到排版前');
      toast('已撤销 AI 排版');
    });
  }

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

  /* 自定义配色（最小版）：改色即生效；「恢复」回到当前底主题 */
  const syncCustomInputs = () => {
    const base = byId.get(customBase) || themes[0] || {};
    const c = customColors() || { bg: base.background, text: base.primary, accent: base.accent };
    if ($('dc-bg')) $('dc-bg').value = c.bg || '#ffffff';
    if ($('dc-text')) $('dc-text').value = c.text || '#333333';
    if ($('dc-accent')) $('dc-accent').value = c.accent || '#888888';
  };
  const onColor = () => {
    const v = { bg: $('dc-bg').value, text: $('dc-text').value, accent: $('dc-accent').value };
    // 首次使用：以当前主题为底（保住字号/间距），之后一直沿用
    if (!customBase || !byId.has(customBase)) {
      customBase = byId.has(activeId) ? activeId : themes[0].id;
    }
    localStorage.setItem(LS_CUSTOM, JSON.stringify(v));
    themeJsonCache.delete(CUSTOM_ID);   // 配色变了，缓存要失效
    setActive(CUSTOM_ID);
  };
  ['dc-bg', 'dc-text', 'dc-accent'].forEach((id) => {
    if ($(id)) $(id).addEventListener('input', onColor);
  });
  if ($('dc-reset')) {
    $('dc-reset').addEventListener('click', () => {
      localStorage.removeItem(LS_CUSTOM);
      themeJsonCache.delete(CUSTOM_ID);
      customBase = '';
      const back = byId.has(DEFAULT_THEME) ? DEFAULT_THEME : themes[0].id;
      setActive(back, true);
      syncCustomInputs();
    });
  }
  syncCustomInputs();
  $('drawer-filters').addEventListener('click', (e) => {
    const chip = e.target.closest('.fchip');
    if (!chip) return;
    drawerFam = chip.dataset.fam;
    const cur = byId.get(activeId);
    drawerTone = (cur && cur.family === drawerFam) ? toneName(cur) : '';
    renderFilters();
    renderDrawer();
  });
  $('drawer-grid').addEventListener('click', (e) => {
    // 空态出口（U-8）：清除搜索 / 看最近使用的 / 看全部
    const ea = e.target.closest('[data-empty-act]');
    if (ea) {
      const act = ea.dataset.emptyAct;
      clearSearch();
      if (act === 'recent') showRecent();
      else if (act === 'all') { drawerFam = 'all'; renderFilters(); renderDrawer(); }
      else renderDrawer();
      return;
    }
    const favBtn = e.target.closest('.d-fav');
    if (favBtn) { e.stopPropagation(); toggleFav(favBtn.dataset.fav); return; }
    const axis = e.target.closest('.d-axis');
    // 二维选择器：换版式时优先保留同名色调；目标族没有该色调就落到它第一套
    if (axis) {
      const fam = axis.dataset.fam;
      const list = themes.filter((t) => t.family === fam);
      const pick = (drawerTone && list.find((t) => toneName(t) === drawerTone)) || list[0];
      drawerFam = fam;
      if (pick) {
        drawerTone = toneName(pick);
        setActive(pick.id, true);
        renderFilters();
      } else {
        renderFilters();
        renderDrawer();
      }
      return;
    }
    const tone = e.target.closest('.d-tone');
    // 同族换色：不关抽屉，让用户可以连点不同色调逐个对比（与本地版一致）
    if (tone) {
      const t = byId.get(tone.dataset.id);
      drawerTone = t ? toneName(t) : drawerTone;
      setActive(tone.dataset.id, true);
      return;
    }
    const card = e.target.closest('.d-card');
    if (!card) return;
    if (card.dataset.family) {   // 族代表卡 → 进入该族的折叠视图（不关抽屉）
      drawerFam = card.dataset.family;
      const cur = byId.get(activeId);
      drawerTone = (cur && cur.family === drawerFam) ? toneName(cur) : '';
      renderFilters();
      renderDrawer();
      return;
    }
    // 选模板不关抽屉：让用户可以连点几个逐个看效果（选风格时预览就在左边）
    setActive(card.dataset.id, true);
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

  // 外链图本地化（方案 B2 · #6）：只有用户点击才联网抓图
  const btnLocalize = $('btn-localize');
  if (btnLocalize) btnLocalize.addEventListener('click', localizeForUser);

  // 导出菜单（方案 B1 · 出口三件套）：export.js 首次点击才动态加载（离线时它在 SW 预缓存里）
  const xbtn = $('btn-export');
  const xmenu = $('menu-export');
  xbtn.addEventListener('click', (e) => {
    e.stopPropagation();
    xmenu.hidden = !xmenu.hidden;
    xbtn.setAttribute('aria-expanded', String(!xmenu.hidden));
  });
  document.addEventListener('click', () => {
    if (!xmenu.hidden) { xmenu.hidden = true; xbtn.setAttribute('aria-expanded', 'false'); }
  });
  xmenu.addEventListener('click', async (e) => {
    const btn = e.target.closest('button[data-exp]');
    if (!btn) return;
    e.stopPropagation();
    xmenu.hidden = true;
    xbtn.setAttribute('aria-expanded', 'false');

    const kind = btn.dataset.exp;
    const title = $('wx-title')?.textContent || '';
    try {
      const X = await import('./export.js');
      const theme = byId.get(activeId) || {};
      if (kind === 'md') {
        const r = X.exportMarkdown(lastMarkdown, title);
        toast(`已导出 Markdown（${kb(r.bytes)}）`, 'ok');
      } else if (kind === 'html') {
        // 导出前自动内嵌外链图：导出文件/长图不经过公众号过滤，内嵌有效
        const prep = await ensureLocalizedForExport();
        const r = X.exportHtml(prep.html, theme, title);
        toast(prep.failed.length
          ? `已导出 HTML（${kb(r.bytes)}）· ${prep.failed.length} 张未内嵌：${failureSummary(prep.failed)}`
          : `已导出 HTML（${kb(r.bytes)}${prep.localized ? '，已内嵌 ' + prep.localized + ' 张图' : ''}）`,
        prep.failed.length ? 'err' : 'ok');
      } else if (kind === 'long') {
        toast('正在生成长图…');
        const prep = await ensureLocalizedForExport();
        const r = await X.exportLongImage(prep.html, theme, title);
        toast(prep.failed.length
          ? `已导出长图 ${r.width}×${r.height}（${kb(r.bytes)}）· ${prep.failed.length} 张图未内嵌`
          : `已导出长图 ${r.width}×${r.height}（${kb(r.bytes)}）`,
        prep.failed.length ? 'err' : 'ok');
      } else if (kind === 'images') {
        // 批量导出图片（B2 #20）：正文全部图片打成一个 ZIP
        toast('正在打包正文图片…');
        const prep = await ensureLocalizedForExport();
        const r = await X.exportImages(prep.html, title);
        // 同一张坏图会在「本地化」和「打包」各失败一次，按 URL 去重，别把 1 张报成 2 张
        const seen = new Set();
        const fails = prep.failed.concat(r.skipped || []).filter((f) => {
          if (seen.has(f.src)) return false;
          seen.add(f.src);
          return true;
        });
        toast(fails.length
          ? `已导出 ${r.count} 张图片；${fails.length} 张跳过：${failureSummary(fails)}`
          : `已导出 ${r.count} 张图片（${kb(r.bytes)}）`,
        fails.length ? 'err' : 'ok');
      }
    } catch (err) {
      toast('导出失败：' + ((err && err.message) || err), 'err');
    }
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
    if (e.key === 'Escape') { closeDrawer(); closeAbout(); if (!$('menu-export').hidden) { $('menu-export').hidden = true; $('btn-export').setAttribute('aria-expanded', 'false'); } }
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
