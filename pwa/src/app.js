/* SuperSu PWA 主交互层
 *
 * 数据流：输入 → 400ms 防抖 → Worker 里的 Python 引擎 → 内联样式 HTML
 *        → iframe 同步 doc.write → 解析条从返回的 markdown 统计
 * 全部本地：没有网络请求（除首次加载引擎与主题 JSON）。
 */

import { createEngine } from './bridge.js';
import { renderLight } from './light.js';
import { scanExternalImages, localizeImages, failureSummary } from './images.js';
import { insertImageFiles } from './editor-images.js';
import { buildBackup, backupSummary, downloadBackup, parseBackup, applyBackup } from './backup.js';

/* ── 存储键 ─────────────────────────────────────────────────── */
const LS = {
  theme: 'supersu.pwa.theme',
  fav: 'supersu.pwa.fav',
  recent: 'supersu.pwa.recent',
  draft: 'supersu.pwa.draft',
  mode: 'supersu.pwa.mode',
  blocks: 'supersu.pwa.blocks',   // 段落样式本机覆盖（不改仓库主题文件）
  layout: 'supersu.pwa.layout',   // 版式本机覆盖
  pp: 'supersu.pwa.ppmode',       // 预处理模式 auto/conservative/longform/tutorial（2026-10-31 接线）
  kitReturn: 'supersu.pwa.kit.return',  // 进整篇设计前用的那套配色主题（退出时回这里）
  fontSize: 'supersu.pwa.fontsize',     // 正文字号 px（2026-11-03 接线；null/缺省 = 用该套原值）
  bg: 'supersu.pwa.pagebg',             // 整页背景预设（2026-11-03 P4-2；缺省 plain = 不包外层）
};

const DEFAULT_THEME = 'su-biz-azure';
const RECENT_MAX = 8;

/* ── 小工具 ─────────────────────────────────────────────────── */
const $ = (id) => document.getElementById(id);
const lsGet = (k, d) => { try { const v = localStorage.getItem(k); return v ? JSON.parse(v) : d; } catch { return d; } };
const lsSet = (k, v) => { try { localStorage.setItem(k, JSON.stringify(v)); return true; } catch { return false; } };
const lsDel = (k) => { try { localStorage.removeItem(k); } catch { /* 同上 */ } };
const kb = (n) => (n >= 1024 ? (n / 1024).toFixed(1) + ' KB' : n + ' B');

/* ── 本机存储的统一前缀与「清干净」工具（2026-10-30）─────────────
 * 背景：本机数据的键分散在五个模块里 —— app.js（草稿/主题/收藏/版式…）、
 * ai.js（AI 配置 + Key）、cover/index.js（封面偏好）、cover/search.js
 * （图库 Key + 搜图缓存）、update/index.js（更新诊断）。
 * 此前 clearAll() 是**手写清单**只删 5 个键，实测漏掉 13 个（含两个 API Key 明文），
 * 用户点「清除本地数据」后 Key 还留在浏览器里 —— 与确认框的承诺相反。
 * 改成按前缀扫：不需要维护清单，任何模块以后新增 supersu.* 键都自动覆盖。 */
const LS_PREFIX = 'supersu.';

/** 列出当前所有本机数据键（用于清除与自检） */
function supersuKeys() {
  const out = [];
  try {
    for (let i = 0; i < localStorage.length; i++) {
      const k = localStorage.key(i);
      if (k && k.startsWith(LS_PREFIX)) out.push(k);
    }
  } catch { /* 隐私模式：读不到就当没有 */ }
  return out;
}

/** 删掉所有本机数据键，返回删除个数。先收集再删，避免边遍历边删导致漏项 */
function clearSupersuStorage() {
  const keys = supersuKeys();
  let n = 0;
  for (const k of keys) {
    try { localStorage.removeItem(k); n++; } catch { /* 忽略单键失败 */ }
  }
  return n;
}

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
  biz: '公文', feast: '节庆', letter: '信笺', minimal: '素页',
  night: '夜航', stamp: '钢印', dusk: '暮色',
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

/* ── 预处理模式（2026-10-31 接线）────────────────────────────────
 * 引擎四模式暴露到解析条：默认 auto 自动判断，允许手动指定。
 * auto 的实际判定结果由 worker 返回（out.mode），在解析条给一行反馈 ——
 * 用户能知道「智能识别」这次到底按什么规则处理了（U-11：说人话）。 */
const PP_LABELS = { conservative: '短文·已有结构', longform: '长文分层', tutorial: '教程步骤' };
let lastPpEffective = null;
function ppMode() {
  const v = $('pp-mode') && $('pp-mode').value;
  return ['auto', 'conservative', 'longform', 'tutorial'].includes(v) ? v : 'auto';
}

/* 正文字号（2026-11-03）：null = 用该套主题自己的原值（产物零变化）；
   给了值则由引擎按「产物实测基准」等比缩放全篇（见 format_engine.apply_font_scale）。
   范围 14–18，与已定案的 §7.2 一致。 */
const FONT_MIN = 14;
const FONT_MAX = 18;
function fontSizePx() {
  const v = parseInt(lsGet(LS.fontSize, null), 10);
  if (!v) return null;
  return Math.min(FONT_MAX, Math.max(FONT_MIN, v));
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
    const out = await engine.render(text, ppMode(), fontSizePx());
    if (mySeq !== renderSeq) return;          // 有更新的请求，丢弃本次结果
    lastHtml = out.html;
    lastRawHtml = out.html;
    lastImgLocalized = 0;
    lastImgFailed = [];
    lastMarkdown = out.markdown;
    /* 页尾内容（2026-11-03 P4-2）：拼在产物层而不是编辑器文本层，
       这样复制/导出天然包含它，且不会污染用户正在编辑的正文。
       tailHtml() 无内容时返回空串 → 产物与不设页尾时逐字节一致。 */
    const tail = await tailHtml();
    if (mySeq !== renderSeq) return;
    /* 整页背景（2026-11-03 P4-2）：包在产物最外层。
       plain 时 applyPageBg 原样返回 → 产物与不设背景时逐字节一致。 */
    const composed = applyPageBg(tail ? out.html + tail : out.html);
    lastHtml = composed;
    lastRawHtml = composed;
    showPreview(composed);
    updateImageTip();
    lastPpEffective = out.mode || null;   // auto 判定结果，解析条做反馈
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
    // 空字符串 = 用户明确选了「默认」→ 必须把继承来的 layout 删掉。
    // 只写 if (customLayout) 的话，选「默认」时底主题自带的版式（如 outline 目录）会残留，
    // 出现「UI 选着默认、预览却还在出目录」的矛盾。
    if (customLayout) out.layout = customLayout;
    else delete out.layout;
    if (customBlocks && Object.values(customBlocks).some(Boolean)) out.blocks = customBlocks;
    return JSON.stringify(out);
  }
  const res = await fetch(`./themes/${id}.json`);
  if (!res.ok) throw new Error(`主题 ${id} 读取失败`);
  const txt = await res.text();
  const json = JSON.parse(txt);

  // 本机覆盖（版式 / 段落样式）：用户在抽屉里改的，不改仓库里的主题文件
  const layoutOv = lsGet(LS.layout, {});
  if (layoutOv[id] !== undefined) {
    if (layoutOv[id]) json.layout = layoutOv[id];
    else delete json.layout;
  }
  const blocksOv = lsGet(LS.blocks, {});
  if (blocksOv[id]) {
    if (Object.values(blocksOv[id]).some(Boolean)) json.blocks = blocksOv[id];
    else delete json.blocks;
  }
  // 新版式（magazine/rhythm/cardflow/outline）不需要主题里的额外配置块，
  // 但引擎要求 layout 值存在即可；这里确保没有残留的旧配置干扰
  const out = JSON.stringify(json);
  themeJsonCache.set(id, out);
  return out;
}

/* ── 自定义配色（最小版，2026-10-24）───────────────────────────
   只做三件事：三个颜色 → 套到底色/正文/强调 → 存本机。
   实现要点：主题 JSON 的 styles 里颜色是写死的 hex（不引用 colors），
   所以必须遍历 styles 把命中旧色的值替换掉，否则只改 colors 看不到变化。 */
const CUSTOM_ID = '__custom__';
const LS_CUSTOM = 'supersu.pwa.custom';
let customBase = '';   // 自定义以哪套主题为底（取当前主题，保证字号/间距等排版不变）
let customLayout = ''; // 自定义配色时选的版式（B 方案）
let customBlocks = null; // 自定义配色时的段落样式开关（C 方案）

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
 * ⚠️ 平台事实（2026-11-01 实测修正）：旧注释说「公众号拒绝 data: URI」，**是错的**。
 * data URI 内嵌图可以随富文本粘进公众号（实测图片正常显示）。
 * 所以这里不再把复制当成「注定缺图」的路径 —— copyRich() 会先把外链图
 * 抓下来压缩再转 data URI，提示条只负责告诉用户「还剩几张没本地化」。 */
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
      : `发现 ${left} 张外链图：复制到公众号时会自动抓取内嵌，也可先点「本地化图片」处理`;
    btn.hidden = false;
    btn.disabled = imgBusy;
    btn.textContent = imgBusy ? '正在抓取…' : (lastImgFailed.length ? '重试剩余' : '本地化图片');
  } else if (lastImgLocalized) {
    el.hidden = false;
    txt.textContent = `已内嵌 ${lastImgLocalized} 张图片（导出 HTML / 长图 / 复制到公众号均可用）`;
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

  /* 智能识别的判定反馈：只有 auto 主动选了非保守路径才提示，短文走保守整理
     是常态，不提示（噪音控制） */
  const autoChip = (ppMode() === 'auto' && (lastPpEffective === 'longform' || lastPpEffective === 'tutorial'))
    ? `<span class="chip-stat" id="pp-effective">已按「${PP_LABELS[lastPpEffective]}」识别</span>`
    : '';
  bar.innerHTML = autoChip + (items.length
    ? items.map(([k, n]) => `<span class="chip-stat">${k} <b>×${n}</b></span>`).join('')
    : '<span class="parse-hint">没识别出结构，可按 Markdown 手写</span>');
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
             primary: c ? c.text : base.primary,
             layout: customLayout || '',
             blocks: customBlocks || {} };
  }
  const t = byId.get(id);
  if (!t) return t;

  // kit（整篇设计）：版式由主题锁死，**不查 layoutOv**。
  // 否则用户以前在某套配色上调过的版式会串进来，kit 就不再是那个设计。
  if (t.kind === 'kit') {
    return { ...t,
             layout: t.lockedLayout || '',
             blocks: effectiveBlocks(id),
             locked: true };
  }

  // 版式 / 段落样式可能被本机覆盖（抽屉里改的），这里返回生效值供 UI 显示
  const layoutOv = lsGet(LS.layout, {});
  return { ...t,
           layout: layoutOv[id] !== undefined ? layoutOv[id] : (t.layout || ''),
           blocks: effectiveBlocks(id) };
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

  /* 配色微调是「临时覆盖」而不是持久化的虚拟主题（2026-11-03 P4-7，用户拍板）。
     规则：只要从 __custom__ 切到别的主题，就清掉 LS_CUSTOM 并清 customBase ——
     否则用户改完色、再去挑一套主题，那三个色值会一直盖在新主题上，看起来像「主题坏了」。
     ⚠️ **读到时不要主动删**：老用户打开仍应看到自己存的配色，不能突然变样。
     这是 plan §P4「配色微调：改的是语义，不是接线」的落点。 */
  if (activeId === CUSTOM_ID && id !== CUSTOM_ID) {
    try { localStorage.removeItem(LS_CUSTOM); } catch { /* 隐私模式可能抛，忽略 */ }
    themeJsonCache.delete(CUSTOM_ID);
    customBase = '';
  }

  /* 进 kit 前记住当前那套「配色主题」（2026-11-02）。
     为什么要记：kit 的版式和配色都锁死，用户退出时必须回到**他原来那套**，
     而不是回「默认」—— 否则他挑了很久的主题就白挑了。
     只在「从 palette 进入 kit」时记录，避免 kit → kit 时把记录覆盖成另一套 kit。 */
  const prev = byId.get(activeId);
  const next = byId.get(id);
  if (next && next.kind === 'kit' && (!prev || prev.kind !== 'kit')) {
    lsSet(LS.kitReturn, activeId);
  }

  activeId = id;
  localStorage.setItem(LS.theme, id);
  renderCaps();
  if (!$('drawer').hidden) renderDrawer();
  applyKitLock();
  scheduleRender();
  // 同族 12 色只改强调色：纯文字文章里预览看不出差别，必须给一条明确反馈
  if (announce) {
    const t = themeMeta(id);
    toast(`已切换：${t ? t.name : id}`, 'ok');
  }
}

/* ── 整篇设计锁定态（2026-11-02）────────────────────────────────
 * kit 选中时同步做四件事，缺一条用户就会以为「界面坏了」：
 *   ① 版式胶囊全部 disabled（真 disabled，不是只变灰）
 *   ② 顶部出现一行说明 + 「改回可组合版式」
 *   ③ 底部色卡区置灰且不可点（配色锁死）
 *   ④ 自定义配色区同样锁住
 * 段落样式三开关**不禁用** —— 它们只加色块强调，不改配色和版式。 */
function applyKitLock() {
  const t = themeMeta(activeId);
  const isKit = !!(t && t.kind === 'kit');

  // ① 版式胶囊
  const chips = document.querySelectorAll('#drawer-layouts .dl-chip');
  chips.forEach((c) => {
    c.disabled = isKit;
    c.setAttribute('aria-disabled', isKit ? 'true' : 'false');
  });

  // ② 说明条
  const note = $('kit-note');
  const noteText = $('kit-note-text');
  if (note) note.hidden = !isKit;
  if (isKit && noteText) {
    const layLabel = layoutLabel(t.layout);
    noteText.innerHTML = `正在使用整篇设计<b>「${escapeHtml(t.name)}」</b>`
      + `，版式（${escapeHtml(layLabel)}）与配色已固定，不能再单独改。`;
  }

  // ③ 底部色卡区
  const bar = $('style-bar');
  if (bar) bar.classList.toggle('locked', isKit);

  // ④ 自定义配色
  const custom = $('drawer-custom');
  if (custom) custom.classList.toggle('locked', isKit);
}

/** 退出整篇设计：回到进 kit 前那套配色主题。 */
function exitKit() {
  const back = lsGet(LS.kitReturn, '') || DEFAULT_THEME;
  const target = byId.has(back) ? back : DEFAULT_THEME;
  setActive(target);
  const t = themeMeta(target);
  toast(`已改回可组合版式：${t ? t.name : target}`, 'ok');
}

/* ── 抽屉 ───────────────────────────────────────────────────── */
let drawerFam = 'all';
let drawerQ = '';
// 抽屉两个 tab（2026-11-03，P4）：'palette' = 164 套配色主题（可组合版式）；
// 'kit' = 19 套整篇设计（版式+配色锁死）。两者**互不相干、不是父子关系**。
// 与 drawerFam 正交：切 tab 不改族视图，切族不影响 tab。
let drawerMode = 'palette';

/** 当前 tab 该显示哪些主题。`kind:'kit'` 必须在任何遍历 UI 的代码里先分流。 */
function poolThemes() {
  return themes.filter((t) => ((t.kind === 'kit') === (drawerMode === 'kit')));
}

/** 两个 tab 的计数与选中态（每次重渲染都要刷新，innerHTML 会重建）。 */
function renderModeTabs() {
  const pal = themes.filter((t) => t.kind !== 'kit').length;
  const kit = themes.filter((t) => t.kind === 'kit').length;
  const cp = $('tab-count-palette');
  const ck = $('tab-count-kit');
  if (cp) cp.textContent = String(pal);
  if (ck) ck.textContent = String(kit);
  document.querySelectorAll('#drawer-mode-tabs .mode-tab').forEach((b) => {
    const on = b.dataset.mode === drawerMode;
    b.classList.toggle('on', on);
    b.setAttribute('aria-selected', on ? 'true' : 'false');
  });
  // 2026-11-03 P4-5：kit tab 下版式区**不再隐藏**，改为在 renderLayouts 里渲染
  // 一行状态文字「整篇设计已锁定（套名）」。隐藏会让用户以为功能消失了。
  // 段落样式（金句/数据/提示）在 kit 下仍可用（已定案 2026-11-03）。
}

/** 整篇设计 tab 的网格：19 套平铺，每张卡都自带版式+配色。 */
function renderKitPane(fav) {
  const list = themes.filter((t) => t.kind === 'kit');
  $('drawer-grid').innerHTML = `
    <div class="d-sec"><b>整篇设计 ${list.length} 套</b>
      <span>版式与配色一起套用，选中即整篇生效</span></div>
    <div class="d-grid d-grid-kit">${list.map((t) => drawerCard(t, fav)).join('')}</div>`;
}
let drawerTone = '';   // 二维选择器：记住当前色调，跨版式迁移（素页·竹青 → 公文·竹青）

function openDrawer() {
  $('drawer').hidden = false;
  $('drawer-mask').hidden = false;
  document.body.classList.add('browsing');   // 让主区给抽屉让位（桌面端不重叠）
  renderFilters();
  renderDrawer();
  $('drawer-search').focus();
}

/* 两个 tab 的切换（2026-11-03，P4）：切 tab 时重置族视图到「全部」，
   否则在整篇设计 tab 会残留一个配色族名、渲染出空网格。 */
function bindModeTabs() {
  const box = $('drawer-mode-tabs');
  if (!box) return;
  box.addEventListener('click', (e) => {
    const b = e.target.closest('.mode-tab');
    if (!b) return;
    const next = b.dataset.mode === 'kit' ? 'kit' : 'palette';
    if (next === drawerMode) return;
    drawerMode = next;
    drawerFam = 'all';      // 跨 tab 不保留族选择（两边的候选集不相交）
    drawerQ = '';           // 搜索词也清掉，避免「切过来什么都没有」
    const s = $('drawer-search');
    if (s) s.value = '';
    renderFilters();
    renderDrawer();
  });
}

/** 窄屏：切到指定页签（桌面端此函数无副作用）。 */
function switchTab(name) {
  const stage = $('stage');
  if (!stage) return;
  stage.dataset.tab = name;
  for (const b of $('tabs').querySelectorAll('button')) {
    b.setAttribute('aria-pressed', String(b.dataset.tab === name));
  }
}

/** 窄屏选完主题：关抽屉 + 切到预览，让用户立刻看到效果。
 *
 *  桌面端**不能**这么做：预览就在左边、抽屉不挡视线，原来的
 *  「不关抽屉、连点几个逐个对比」是更好的体验（见 d-card 处原注释）。
 */
function showResultOnNarrow() {
  if (!window.matchMedia('(max-width: 900px)').matches) return;
  closeDrawer();
  switchTab('preview');
}

function closeDrawer() {
  $('drawer').hidden = true;
  $('drawer-mask').hidden = true;
  document.body.classList.remove('browsing');
}

/* ── 版式层（B 方案，2026-10-24）──────────────────────────────
   换版式 = 换结构（不是换颜色）。选中后立刻把当前主题的 layout 换掉并重渲染。
   版式与色调正交：版式决定「区块怎么切」，色调决定「什么颜色」。

   2026-11-03 扩项：从 8 项扩到 15 项，新增 7 个「报刊」版式。
   判据不是偏好，是**实测「换主题后配色是否跟着走」**（探针见
   `output/_probe_extreme.py` 的同款方法）：函数体里只要有一个非中性的
   写死十六进制色，换任何主题都会留下一块品牌色 → 不进这张表。
   实测结果：
     ✅ 可自由配 13 个：time/guardian/economist/natgeo/vogue/forbes/muji/
        starbucks/adidas/tech/rational/swiss/light
     ❌ 品牌锁死 6 个：mori(#1D3A1D) / ukiyoe(#1B3A5C,#22303F,#8C3A2E) /
        note(#22303F,#F5D90A,#FDF6C8) / ikea(#FFDA1A) /
        brutal(#F5C6D0,#F5E9A8) / deepread(#4A3B32)
   这 6 个只走 kit（`locked_layout`），不给单独入口 —— 它们的设计身份就是那套颜色。

   ⚠️ 为什么只取 7 个而不是 13 个：muji/starbucks 是「写死到没有品牌色」的
   极简派，放进自由组合区会和默认版式看不出区别；tech/rational/swiss/light
   是 2026-11-02 的 md2wechat 风格，属于另一条产品线，等 P5 单独评估。
   7 个报刊版式的中文名见 `docs/wechat/design-wechat-layout-naming.md`（汉典已核实）。 */
const LAYOUT_OPTIONS = [
  ['', '默认'],
  ['rhythm', '图文节奏'],
  ['cardflow', '卡片流'],
  ['outline', '目录导航'],
  ['magazine', '杂志分栏'],
  ['hero', '首屏'],
  ['card', '卡片组'],
  ['timeline', '时间线'],
  /* ── 报刊（2026-11-03 新增，纯 accent 派生，可自由配色）── */
  ['time', '朱丝栏'],
  ['guardian', '天头'],
  ['economist', '鱼尾'],
  ['natgeo', '乌丝栏'],
  ['vogue', '版心'],
  ['forbes', '算经'],
  ['adidas', '三道'],
];

/* 分组：版式条按「通用 / 报刊」两段渲染，中间一个细分隔线。
   15 个胶囊平铺会占三行、把下面的模板网格挤掉 —— 分段后视觉上仍是两组，
   但组内顺序稳定，用户扫一眼就知道「通用是结构、报刊是版式风格」。 */
const LAYOUT_GROUP_AT = 8;   // 前 8 项 = 通用，其余 = 报刊

/* 只用于「显示名」的补充映射：这 6 个版式**不给独立入口**（品牌色锁死，
   换任何主题都会毁），但它们仍是 19 套 kit 的 locked_layout，
   kit 说明条要说出「版式是哪一个」时不能漏成英文 id。 */
const LAYOUT_LABEL_ONLY = {
  muji: '留白', starbucks: '咖啡', mori: '森系', ukiyoe: '浮世绘',
  note: '手账', ikea: '宜家', brutal: '野兽', deepread: '深读',
  tech: '技术编辑', rational: '理性', swiss: '瑞士', light: '轻刊',
};

/** 任意 layout id → 中文显示名（入口表优先，其次显示名表，最后原样） */
function layoutLabel(id) {
  if (!id) return '默认';
  const hit = LAYOUT_OPTIONS.find(([x]) => x === id);
  return hit ? hit[1] : (LAYOUT_LABEL_ONLY[id] || id);
}

/* 结构版式：靠小标题切段才有意义（引擎在标题不足 2 个时会原样返回）*/
// 结构版式：靠小标题切段才有意义（引擎在标题不足 2 个时会原样返回）
// magazine 还额外要求「每节至少 2 段」才有双栏效果（1 段分不出左右列）
const STRUCT_LAYOUTS = new Set(['outline', 'magazine']);

/* 当前输入里的小标题数量（## / ### 开头，或加粗独立成行）。
   引擎判据是「至少 2 个 h1/h2」，这里按同一口径粗算，仅用于给用户提示。 */
function headingCount() {
  const text = ($('input') && $('input').value) || '';
  const md = (text.match(/^#{1,3}[ \t]+\S/gm) || []).length;
  return md;
}

function layoutOf(t) {
  return (t && t.layout) || '';
}

function renderLayouts() {
  const meta = themeMeta(activeId);
  const cur = layoutOf(meta);
  const locked = !!(meta && meta.kind === 'kit');
  /* 2026-11-03 P4-5：kit 态不再整行隐藏，改为一行状态文字（plan §P4 决策 E-7/E-8）。
     隐藏会让用户以为「版式这项功能消失了」；显示状态文字才说得清「已锁定、且锁的是哪套」。
     ⚠️ 顺带修掉旧问题：原实现对未知 layout id 会回落显示英文 id（LAYOUT_OPTIONS 只有 8 项，
     19 套的 layout 名不在其中）。这里直接用主题的中文名，不再查表。 */
  if (locked) {
    $('drawer-layouts').innerHTML =
      '<span class="dl-label">版式</span>'
      + `<span class="dl-locked">整篇设计已锁定（${escapeHtml(meta.name || '')}）</span>`;
    return;
  }
  const chip = ([id, label]) => `
      <button class="dl-chip${id === cur ? ' on' : ''}" data-layout="${id}"
              type="button" aria-pressed="${id === cur}"
              aria-disabled="false">${label}</button>`;
  /* 2026-11-03 扩项：15 个胶囊分「通用 / 报刊」两段，中间一道细分隔线。
     段内顺序与 LAYOUT_OPTIONS 一致，两段各占一行，不推挤下方模板网格。 */
  const head = LAYOUT_OPTIONS.slice(0, LAYOUT_GROUP_AT).map(chip).join('');
  const mag = LAYOUT_OPTIONS.slice(LAYOUT_GROUP_AT).map(chip).join('');
  $('drawer-layouts').innerHTML =
    '<span class="dl-label">版式</span>'
    + `<span class="dl-group">${head}</span>`
    + `<span class="dl-group dl-group-mag">${mag}</span>`;
}

/* ── 段落样式开关（C 方案）────────────────────────────────────
   这三个开关直接写进主题的 blocks 字段，改完立刻重渲染。 */
function blocksOf(t) {
  return (t && t.blocks) || {};
}

function renderBlockToggles() {
  const b = blocksOf(themeMeta(activeId));
  for (const k of ['quote', 'data', 'tip']) {
    const el = $('db-' + k);
    if (el) el.checked = !!b[k];
  }
}

function setBlockToggle(key, on) {
  // 自定义配色主题没有主题文件，直接改内存里的 meta
  const t = themeMeta(activeId);
  if (!t) return;
  const next = { ...blocksOf(t), [key]: on };
  if (activeId === CUSTOM_ID) {
    customBlocks = next;
    themeJsonCache.delete(CUSTOM_ID);
  } else {
    // 普通主题：把 blocks 覆盖记在本机（不改仓库里的主题文件）
    const overrides = lsGet(LS.blocks, {});
    overrides[activeId] = next;
    lsSet(LS.blocks, overrides);
    themeJsonCache.delete(activeId);
  }
  scheduleRender();
}

// 读某主题实际生效的 blocks：本机覆盖 > 主题自带
function effectiveBlocks(id) {
  if (id === CUSTOM_ID) return customBlocks || {};
  const overrides = lsGet(LS.blocks, {});
  if (overrides[id]) return overrides[id];
  return (byId.get(id) || {}).blocks || {};
}

function renderFilters() {
  const pool = poolThemes();
  // 整篇设计 tab：没有族与色调的二维结构（19 套各自独立），只留「全部 / 收藏」
  if (drawerMode === 'kit') {
    $('drawer-filters').innerHTML = [['all', `全部 ${pool.length}`], ['fav', `收藏 ${favList().length}`]]
      .map(([k, label]) => `<button class="fchip" data-fam="${k}" aria-pressed="${drawerFam === k}">${label}</button>`)
      .join('');
    return;
  }
  const fams = [...new Set(pool.map((t) => t.family).filter(Boolean))];
  // 族视图里家族 chip 与上方「版式」条重复，只保留「全部 / 收藏」；切族交给版式条
  const inFamily = drawerFam !== 'all' && drawerFam !== 'fav';
  // chip 上直接写总数：「全部」视图只渲染精选 + 族代表卡，不给数字会被误以为模板变少了
  const chips = [['all', `全部 ${pool.length}`], ['fav', `收藏 ${favList().length}`]]
    .concat(inFamily ? [] : fams.map((f) => {
      const n = pool.filter((t) => t.family === f).length;
      return [f, `${FAMS[f] || f} ${n}`];
    }));
  $('drawer-filters').innerHTML = chips.map(([k, label]) => `
    <button class="fchip" data-fam="${k}" aria-pressed="${drawerFam === k}">${label}</button>`).join('');
}

/* ── 2A 族折叠（与本地版 templates/index.html 保持一致）──
   同族 12 换色折叠成「1 张代表卡 + 色调色点条」；点色点换色**不关抽屉**，方便连续对比。 */
function famLabel(f) { return f ? (FAMS[f] || f) : ''; }
// 色调名 = 主题名去掉族前缀（「公文·朱砂」→「朱砂」）
function toneName(t) {
  const f = t.family;
  if (!f) return t.name;
  return String(t.name || '').replace(/^[^·•\-]*[·•\-]\s*/, '') || t.name;
}
// 单张主题卡（扁平网格 / 族代表卡共用）
function drawerCard(t, fav) {
  const inUse = t.id === activeId;
  const isFav = fav.has(t.id);
  const isKit = t.kind === 'kit';
  // ⚠️ 缩略图目录必须按 kind 分开：
  //   theme-thumbs/ 只有 164 套配色主题（gen_theme_thumbs.py 生成）
  //   kit-thumbs/   只有 19 套整篇设计（gen_kit_thumbs.py 生成，480×360）
  // 早先写死 theme-thumbs/，导致整篇设计的卡全是裂图 / 回落到占位块（2026-11-02 修复）
  const thumbDir = isKit ? 'kit-thumbs' : 'theme-thumbs';
  return `
    <button class="d-card${isKit ? ' d-card-kit' : ''}" data-id="${t.id}" aria-pressed="${inUse}">
      <span class="d-prev">
        <img class="d-thumb" loading="lazy" alt="" src="./${thumbDir}/${t.id}.jpg"
             data-thumb="${t.id}">
        <span class="d-fallback" style="background:${t.background};color:${t.primary}">
          <i></i><i></i><i></i><i></i>
        </span>
        ${isKit ? '<span class="d-kit-tag">整篇</span>' : ''}
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
// 「全部」视图：编辑精选 → 按族折叠（每族 1 张代表卡）→ 其余平铺
function renderAllFolded(fav) {
  // ⚠️ 必须用 poolThemes()：19 套整篇设计（kind:'kit'）不属于配色 tab 的候选集，
  // 混进来会让「按族浏览」的套数虚高、且点进去版式被锁死（2026-11-03 P4）
  const pool = poolThemes();
  const fams = [...new Set(pool.map((t) => t.family).filter(Boolean))];
  const byFam = {}; fams.forEach((f) => { byFam[f] = []; });
  const classic = [];
  pool.forEach((t) => { (t.family && byFam[t.family] ? byFam[t.family] : classic).push(t); });
  const reps = fams.filter((f) => byFam[f].length).map((f) => familyRepCard(f, byFam[f], fav)).join('');
  // 精选：把「最好看、最常用」的 12 套提到第一屏（顺序由 theme-curation.json 定）
  const featured = pool.filter((t) => t.featured);
  const featIds = new Set(featured.map((t) => t.id));
  const head = featured.length
    ? `<div class="d-sec"><b>编辑精选</b><span>先看这 ${featured.length} 套 · 覆盖商务 / 随笔 / 行业 / 技术 / 节庆</span></div>`
      + featured.map((t) => drawerCard(t, fav)).join('')
      + `<div class="d-sec"><b>按族浏览</b><span>${fams.length} 种版式 · ${fams.reduce((n, f) => n + byFam[f].length, 0)} 套在族内，点进去换色</span></div>`
    : '';
  const ranked = [...classic].filter((t) => !featIds.has(t.id))
    .sort((a, b) => (fav.has(b.id) ? 1 : 0) - (fav.has(a.id) ? 1 : 0));
  // 精选 + 族卡之后还有几十套「单套主题」平铺在下方，不给标题的话滑到这里像到尽头了
  const rest = ranked.length
    ? `<div class="d-sec"><b>其他风格</b><span>${ranked.length} 套 · 每个都是一套独立版式</span></div>`
      + ranked.map((t) => drawerCard(t, fav)).join('')
    : '';
  $('drawer-grid').innerHTML = head + reps + rest;
}
// 族视图：版式 × 色调二维选择（2026-10-24）
// 版式条只列有色调可选的族；换版式时**保留同名色调**（素页·竹青 → 公文·竹青）。
function renderFamilyFold(fam, fav) {
  const pool = poolThemes();
  const list = pool.filter((t) => t.family === fam);
  const grid = $('drawer-grid');
  if (!list.length) { grid.innerHTML = '<div class="drawer-empty">没匹配的风格，换个词试试</div>'; return; }
  const famKeys = [...new Set(pool.map((t) => t.family).filter(Boolean))];
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
  // 族视图：版式条 + 该族全部模板（不再只放 1 张代表卡——下面大片空白、还要横向滚）
  grid.innerHTML = `<div class="d-fold">
    <div class="d-axis-row" role="group" aria-label="版式">${axis}</div>
    <div class="d-tone-strip" role="group" aria-label="色调">${tones}</div>
    <div class="d-grid">${list.map((t) => drawerCard(t, fav)).join('')}</div>
  </div>`;
}
function renderDrawer() {
  renderModeTabs();
  renderLayouts();
  renderBlockToggles();
  applyKitLock();   // 每次重渲染后重新上锁（innerHTML 重建会丢 disabled / 置灰）
  const fav = new Set(favList());
  const q = drawerQ.trim().toLowerCase();
  // 搜索优先：全量扁平（跨所有主题，不折叠）——但只在当前 tab 的池子里搜，
  // 否则在「整篇设计」里搜出一个配色主题、点了却和 view 对不上
  // tags 由构建期生成（颜色 + 用途），让「绿 / 商务 / 节庆」这类词也能命中
  const pool = poolThemes();
  if (q) {
    renderFlat(pool.filter((t) => (t.name + ' ' + t.id + ' ' + (t.desc || '') + ' '
      + (t.tags || []).join(' ')).toLowerCase().includes(q)), fav);
    return;
  }
  if (drawerFam === 'fav') { renderFlat(pool.filter((t) => fav.has(t.id)), fav); return; }
  // 整篇设计 tab：19 套平铺，不分族、不折叠
  if (drawerMode === 'kit') { renderKitPane(fav); return; }
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

  /* 复制前把外链图本地化 + 压缩（2026-11-02）。
   * 为什么必须有这步：2026-11-01 实测确认 data URI 内嵌图能粘进公众号，
   * 而外链图会被公众号过滤掉。句方便就是这么做的（19/19 张全转 data URI）。
   * 压缩是因为剪贴板装的是图片字节，原图直转能到几十 MB，粘贴会卡。
   * 证据：docs/design-paste-image-and-typography.md §3.3 / §4.1 */
  let body = lastHtml;
  let localized = 0;
  let copyFailed = [];
  let totalBytes = 0;
  const extCount = scanExternalImages(body).length;
  if (extCount) {
    toast(`正在处理 ${extCount} 张图片…`);
    try {
      const r = await localizeImages(body, { compress: true });
      body = r.html;
      localized = r.localized;
      copyFailed = r.failed;
      totalBytes = r.bytes || 0;
    } catch (e) {
      toast(`图片处理失败：${(e && e.message) || e}`, 'err');
      return;
    }
  }

  const wrapped = `<div style="background:${theme.background || '#fff'}">${body}</div>`;
  const plain = $('input').value;

  // 一级：ClipboardItem 写 text/html
  try {
    if (navigator.clipboard && window.ClipboardItem) {
      await navigator.clipboard.write([new ClipboardItem({
        'text/html': new Blob([wrapped], { type: 'text/html' }),
        'text/plain': new Blob([plain], { type: 'text/plain' }),
      })]);
      toastAfterCopy({ localized, copyFailed, totalBytes });
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
    if (ok) { toastAfterCopy({ localized, copyFailed, totalBytes }); return; }
  } catch { /* 落到下一级 */ }

  // 三级：明确告诉用户怎么办
  toast('浏览器不让自动复制，请用右键菜单：全选预览 → 复制', 'err');
}

function fmtKb(n) { return n >= 1024 * 1024 ? `${(n / 1024 / 1024).toFixed(1)}MB` : `${Math.round(n / 1024)}KB`; }

/* ── 备份 / 恢复本机数据（2026-11-01，审计 P1）─────────────────
 * 数据只在单浏览器 localStorage，清缓存即全丢 → 提供 JSON 导出/导入。
 * 键范围用 `supersu.` 前缀全量扫描（与 clearAll 同一真源，新增键自动纳入）。 */

let pendingBackup = null;   // 已解析、待恢复的备份

function openBackupDialog() {
  $('bk-dialog').hidden = false;
  $('bk-mask').hidden = false;
  refreshBackupStat();
  $('bk-preview').hidden = true;
  $('btn-bk-restore').disabled = true;
  pendingBackup = null;
  $('bk-file').value = '';
}

function closeBackupDialog() {
  $('bk-dialog').hidden = true;
  $('bk-mask').hidden = true;
  pendingBackup = null;
}

function refreshBackupStat() {
  const b = buildBackup({ includeSecrets: false });
  const s = backupSummary(b);
  const parts = [`当前本机共 ${s.keyCount} 项数据（约 ${fmtKb(s.bytes)}）`];
  if (s.hasDraft) parts.push('含草稿');
  if (s.skipped) parts.push(`${s.skipped} 项 Key 默认不导出`);
  $('bk-stat').textContent = parts.join(' · ');
}

function bindBackupDialog() {
  $('btn-bk-close').addEventListener('click', closeBackupDialog);
  $('bk-mask').addEventListener('click', closeBackupDialog);

  $('btn-bk-export').addEventListener('click', () => {
    const includeSecrets = $('bk-include-secrets').checked;
    const b = buildBackup({ includeSecrets });
    const name = downloadBackup(b);
    const s = backupSummary(b);
    toast(
      includeSecrets
        ? `已导出 ${name}（${s.keyCount} 项，含 API Key —— 请勿分享此文件）`
        : `已导出 ${name}（${s.keyCount} 项，约 ${fmtKb(s.bytes)}）`,
      'ok',
    );
  });

  // 选文件后先解析并预览，不直接覆盖 —— 恢复是不可逆操作，必须先让用户看清要写入什么
  $('bk-file').addEventListener('change', async () => {
    const f = $('bk-file').files?.[0];
    if (!f) return;
    const text = await f.text();
    const r = parseBackup(text);
    const box = $('bk-preview');
    box.hidden = false;
    if (!r.ok) {
      pendingBackup = null;
      $('btn-bk-restore').disabled = true;
      box.className = 'bk-preview err';
      box.textContent = `无法读取：${r.error}`;
      return;
    }
    pendingBackup = r.backup;
    const s = backupSummary(r.backup);
    const when = r.backup.exportedAt ? new Date(r.backup.exportedAt).toLocaleString() : '未知时间';
    box.className = 'bk-preview ok';
    box.innerHTML = `备份来自 <b>${when}</b>，共 <b>${s.keyCount}</b> 项`
      + (s.hasDraft ? '，含草稿' : '，不含草稿')
      + (s.includesSecrets ? '，<b>含 API Key</b>' : '，不含 API Key')
      + `<br>将写入 ${r.validKeys.length} 个 supersu.* 键`;
    $('btn-bk-restore').disabled = false;
  });

  $('btn-bk-restore').addEventListener('click', () => {
    if (!pendingBackup) return;
    const mode = document.querySelector('input[name="bk-mode"]:checked')?.value || 'replace';
    const confirmText = mode === 'replace'
      ? '整机恢复会先清空当前所有本机数据（草稿、收藏、偏好、Key），再用备份覆盖。继续？'
      : '合并恢复会用备份里的项覆盖同名项，其它现有数据保留。继续？';
    if (!confirm(confirmText)) return;

    const res = applyBackup(pendingBackup, { mode });
    const s = backupSummary(pendingBackup);
    closeBackupDialog();
    toast(
      mode === 'replace'
        ? `已整机恢复：清空 ${res.removed} 项，写入 ${res.written} 项，页面即将刷新`
        : `已合并恢复：写入 ${res.written} 项（未清空现有数据），页面即将刷新`,
      'ok',
    );
    if (s.includesSecrets) toast('提示：本次恢复包含 API Key，请确认是在自己的设备上操作', 'err');
    // 数据变化后必须重载：各模块的内存状态（主题/收藏/草稿）都基于旧 localStorage
    // 重载前关掉自动保存，否则 pagehide 会用当前空编辑器覆盖刚恢复的草稿
    window.__supersuSkipAutoSave = true;
    setTimeout(() => location.reload(), 1200);
  });
}

/* 复制后的如实反馈（2026-11-02 改写）。
 * 旧版说「公众号只认图床 URL，data URI 与外链都不算已完成」——已实测推翻：
 * data URI 可以粘进公众号。现在改成报告「这次复制带过去了几张图、几张失败」，
 * 失败必定给可读原因（防盗链/跨域/超限），不静默。 */
function toastAfterCopy({ localized = 0, copyFailed = [], totalBytes = 0 } = {}) {
  const left = scanExternalImages(lastHtml).length;

  // 先报失败：外链图转不进来（防盗链/跨域/超限）时，公众号里就是缺图，必须让人知道
  if (copyFailed.length) {
    toast(`已复制，${copyFailed.length} 张图没能内嵌：${failureSummary(copyFailed)}`, 'err');
    return;
  }
  if (left && !localized) {
    toast(`已复制，但还有 ${left} 张外链图，公众号里不会显示`, 'err');
    return;
  }
  if (localized) {
    const size = totalBytes ? `（${fmtKb(totalBytes)}）` : '';
    toast(`已复制，含 ${localized} 张图${size}，去公众号后台粘贴`, 'ok');
    return;
  }
  toast('已复制，去公众号后台粘贴', 'ok');
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

  /* ── 图库素材 Key（2026-10-25）：与 AI 同面板，同样只存本机 ──
     这里直接读写 localStorage，**不 import cover/search.js**：
     app.js 是主应用启动链，多一个顶层依赖就多一个离线启动失败的风险
     （实测会打断「断网仍可用」这条既有能力）。storage key 与
     cover/search.js 的 STOCK_KEY 保持一致。 */
  const STOCK_KEY = 'supersu.cover.stock.v1';
  const getStockKeys = () => {
    try {
      const d = JSON.parse(localStorage.getItem(STOCK_KEY) || '{}') || {};
      return { pexels: String(d.pexels || '') };
    } catch { return { pexels: '' }; }
  };
  const setStockKeys = ({ pexels = '' } = {}) => {
    try {
      // 只存 pexels（Pixabay 已移除，2026-10-27）
      localStorage.setItem(STOCK_KEY, JSON.stringify({ pexels: String(pexels).trim() }));
    } catch { /* 隐私模式忽略 */ }
  };
  const refreshStockState = () => {
    const k = getStockKeys();
    const el = $('stock-state');
    if (el) el.textContent = k.pexels ? '已配置：Pexels ✓' : '未配置（联网搜图需要 Pexels Key）';
  };
  const loadStock = () => {
    const k = getStockKeys();
    if ($('stock-pexels')) $('stock-pexels').value = k.pexels;
    refreshStockState();
  };
  const openTut = () => {
    if ($('tut-sheet')) $('tut-sheet').hidden = false;
    if ($('tut-mask')) $('tut-mask').hidden = false;
  };
  const closeTut = () => {
    if ($('tut-sheet')) $('tut-sheet').hidden = true;
    if ($('tut-mask')) $('tut-mask').hidden = true;
  };
  $('stock-save')?.addEventListener('click', () => {
    setStockKeys({ pexels: $('stock-pexels')?.value || '' });
    refreshStockState();
    toast('图库 Key 已保存在本机');
  });
  $('stock-help')?.addEventListener('click', openTut);
  $('tut-close')?.addEventListener('click', closeTut);
  $('tut-mask')?.addEventListener('click', closeTut);
  document.addEventListener('keydown', (e) => {
    if (e.key === 'Escape' && $('tut-sheet') && !$('tut-sheet').hidden) closeTut();
  });
  // 打开 AI 面板时顺带带出图库 Key（同一面板两块配置）
  const _openAiSheet = open;
  // 用事件委托兜住：AI 面板的 open 是内部闭包，直接在按钮上追加一次加载
  document.getElementById('btn-ai')?.addEventListener('click', loadStock);
  loadStock();
  void _openAiSheet;

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
          const info = ai.analyzeContent(text);
          say(`已按 AI 结构重排：${counts}（正文一个字没改）`
            + `\n判定：${info.label} · ${info.paraCount} 段 · ${info.chars} 字`
            + ` · 装饰上限 提示框${info.budget.callouts}/分隔线${info.budget.hrs}`
            + `/金句${info.budget.pullquotes}/表格${info.budget.tables}`);
          toast(`智能排版完成：${counts}`);
          return;
        }
        reason = 'AI 结构套用失败';
      } catch (err) {
        reason = (err && err.message) || String(err);
      }
    }

    const local = await engine.render(text, ppMode(), fontSizePx());
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

  /* 预处理模式：读档 → change 存档 + 重渲染（默认 auto 不写库，键保持空） */
  const ppSel = $('pp-mode');
  if (ppSel) {
    const saved = lsGet(LS.pp, 'auto');
    ppSel.value = ['auto', 'conservative', 'longform', 'tutorial'].includes(saved) ? saved : 'auto';
    ppSel.addEventListener('change', () => {
      lsSet(LS.pp, ppSel.value);
      lastPpEffective = null;   // 旧判定作废，等本次渲染结果
      scheduleRender();
    });
  }

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
  // ⚠️ 备份恢复后会自动 reload：此时编辑器还是空的，若照常保存会把刚恢复的草稿覆盖成空。
  //    用 __supersuSkipAutoSave 标志跳过（2026-11-01 实测发现的真缺陷）
  document.addEventListener('visibilitychange', () => {
    if (document.visibilityState === 'hidden' && !window.__supersuSkipAutoSave) {
      saveDraft(input.value);
    }
  });
  window.addEventListener('pagehide', () => {
    if (!window.__supersuSkipAutoSave) saveDraft(input.value);
  });

  // 粘贴后立刻排版，不等打字防抖
  input.addEventListener('paste', () => { setTimeout(scheduleRender, 30); });

  /* ── 编辑器图片：粘贴截图 / 「插图」上传（2026-11-02 恢复）─────────
     背景：cd0668d 曾把贴图和推送一起删掉（理由「推送太复杂」）。
     现按用户决定只恢复图片能力。粘进来的图以 data URI 存进 Markdown，
     复制到公众号时能直接带过去（2026-11-01 实测确认 data URI 可粘贴）。
     见 docs/design-paste-image-and-typography.md §3.3。 */
  const handleImageFiles = async (files) => {
    if (!files || !files.length) return;
    const imgs = [...files].filter((f) => f.type.startsWith('image/'));
    if (!imgs.length) return;
    toast(imgs.length > 1 ? `正在处理 ${imgs.length} 张图片…` : '正在处理图片…');
    const r = await insertImageFiles(imgs, input);
    updateCharCount();
    saveDraft(input.value);
    scheduleRender();
    if (r.fail) {
      toast(`已插入 ${r.ok} 张，${r.fail} 张失败（可能是格式不支持或过大）`, 'err');
    } else {
      toast(`已插入 ${r.ok} 张图片`, 'ok');
    }
  };

  // Ctrl+V 粘贴图片：只在剪贴板里真有图片文件时接管，纯文本粘贴保持原行为
  input.addEventListener('paste', (e) => {
    const items = e.clipboardData && e.clipboardData.items;
    if (!items) return;
    const files = [];
    for (const it of items) {
      if (it.kind === 'file' && it.type.startsWith('image/')) {
        const f = it.getAsFile();
        if (f) files.push(f);
      }
    }
    if (!files.length) return;      // 纯文本 → 走上面的默认处理
    e.preventDefault();             // 有图 → 不走 textarea 默认粘贴
    handleImageFiles(files);
  });

  // 「插图」按钮 → 本地文件选择
  const btnImage = $('btn-image');
  const fileImage = $('file-image');
  if (btnImage && fileImage) {
    btnImage.addEventListener('click', () => fileImage.click());
    fileImage.addEventListener('change', () => {
      handleImageFiles([...fileImage.files]);
      fileImage.value = '';         // 允许连续选同一张
    });
  }

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
  bindModeTabs();

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

  // 整篇设计：退出回「进 kit 前那套配色主题」
  const kitBack = $('btn-kit-back');
  if (kitBack) kitBack.addEventListener('click', exitKit);

  /* 版式层（B 方案）：换结构不改颜色；写本机覆盖，不动仓库主题文件 */
  $('drawer-layouts').addEventListener('click', (e) => {
    const chip = e.target.closest('.dl-chip');
    if (!chip) return;
    const lay = chip.dataset.layout;
    if (activeId === CUSTOM_ID) {
      customLayout = lay;
      themeJsonCache.delete(CUSTOM_ID);
    } else {
      const ov = lsGet(LS.layout, {});
      ov[activeId] = lay;
      lsSet(LS.layout, ov);
      themeJsonCache.delete(activeId);
    }
    renderLayouts();
    scheduleRender();
    // 2026-10-25：结构版式（目录/分栏）要靠小标题切段，文章没有小标题时
    // 引擎会原样返回 → 用户看到「点了没反应」。这里补一句轻提示，避免误以为坏了。
    if (STRUCT_LAYOUTS.has(lay) && headingCount() < 2) {
      toast(`已选「${chip.textContent}」，但这篇没有小标题，结构版式用不上`, 'ok');
    } else {
      toast(lay ? `版式：${chip.textContent}` : '已回到默认版式', 'ok');
    }
  });

  /* 段落样式开关（C 方案） */
  ['quote', 'data', 'tip'].forEach((k) => {
    const el = $('db-' + k);
    if (el) el.addEventListener('change', () => setBlockToggle(k, el.checked));
  });

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

  /* 正文字号（2026-11-03）：写 localStorage 后重渲染。
     「原样」= 清掉存储 → fontSizePx() 返回 null → 产物零变化。 */
  function syncFontUi() {
    const cur = fontSizePx();
    const range = $('df-range');
    const val = $('df-val');
    if (range) {
      // 没设过时滑块停在 16（多数套的正文原值），但显示「原样」
      range.value = String(cur == null ? 16 : cur);
      range.disabled = false;
    }
    if (val) val.textContent = cur == null ? '原样' : cur + 'px';
    const note = $('df-note');
    if (note) {
      note.textContent = cur == null
        ? '按各套设计等比缩放，标题一起缩放'
        : `已按该套原比例放大/缩小到 ${cur}px`;
    }
  }
  function setFont(next) {
    if (next == null) {
      localStorage.removeItem(LS.fontSize);
    } else {
      const v = Math.min(FONT_MAX, Math.max(FONT_MIN, next));
      localStorage.setItem(LS.fontSize, String(v));
    }
    syncFontUi();
    themeJsonCache.delete(activeId);   // 字号变了，渲染结果要重算（setTheme 指纹不含字号）
    scheduleRender();
  }
  if ($('df-range')) {
    $('df-range').addEventListener('input', (e) => setFont(parseInt(e.target.value, 10)));
  }
  if ($('df-minus')) {
    $('df-minus').addEventListener('click', () => {
      const cur = fontSizePx() == null ? 16 : fontSizePx();
      setFont(cur - 1);
    });
  }
  if ($('df-plus')) {
    $('df-plus').addEventListener('click', () => {
      const cur = fontSizePx() == null ? 16 : fontSizePx();
      setFont(cur + 1);
    });
  }
  if ($('df-reset')) {
    $('df-reset').addEventListener('click', () => setFont(null));
  }
  syncFontUi();

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
      showResultOnNarrow();
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
    // 桌面：选模板不关抽屉，可以连点几个逐个看效果（预览就在左边）。
    // 窄屏：预览在另一个页签，抽屉不关等于「选了也看不见」→ 直接送去预览。
    setActive(card.dataset.id, true);
    showResultOnNarrow();
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
    if (act === 'ai-tools') $('btn-ai')?.click();   // 窄屏 AI 按钮收进更多菜单

    if (act === 'export-menu') {                      // 窄屏「导出 ▾」藏进更多菜单后的可达路径

      $('btn-export')?.click();
    }
    if (act === 'clear-all') clearAll();
    if (act === 'backup') openBackupDialog();
    if (act === 'update') $('btn-update')?.click();   // 移动端浮动入口隐藏，从「更多」进
    if (act === 'about') openAbout();
    if (act === 'settings') openSettings();           // 低频项：配色微调 / 页尾 / 数据
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

  /* 设置弹窗（2026-11-03 P4-2）：关闭 + 页尾持久化 + 数据段两个按钮复用既有入口 */
  $('btn-settings-close').addEventListener('click', closeSettings);
  $('settings-mask').addEventListener('click', closeSettings);
  if ($('set-backup')) $('set-backup').addEventListener('click', () => { closeSettings(); openBackupDialog(); });
  if ($('set-clear')) $('set-clear').addEventListener('click', () => { closeSettings(); clearAll(); });
  /* 页尾：改动即存本机并重渲染（页尾是产物层拼接，必须重渲染才看得到） */
  const onTailChange = () => { lsSet(LS_TAIL, tailPayload()); scheduleRender(); };
  if ($('tail-on')) $('tail-on').addEventListener('change', onTailChange);
  if ($('tail-md')) $('tail-md').addEventListener('input', onTailChange);
  syncTailUi();
  /* 整页背景（2026-11-03 P4-2）：点卡片即换背景，存本机 + 重渲染 */
  const bgGrid = $('set-grid-bg');
  if (bgGrid) {
    bgGrid.addEventListener('click', (e) => {
      const btn = e.target.closest('[data-bg]');
      if (btn && !btn.disabled) setBg(btn.dataset.bg);
    });
  }

  // 移动端 tabs
  $('tabs').addEventListener('click', (e) => {
    const btn = e.target.closest('button');
    if (btn) switchTab(btn.dataset.tab);
  });


  // 快捷键
  document.addEventListener('keydown', (e) => {
    if ((e.ctrlKey || e.metaKey) && e.key === 'Enter') { e.preventDefault(); doRender(); }
    if (e.key === 'Escape') { closeDrawer(); closeAbout(); closeBackupDialog(); if (!$('menu-export').hidden) { $('menu-export').hidden = true; $('btn-export').setAttribute('aria-expanded', 'false'); } }
  });

  // 备份 / 恢复本机数据对话框
  bindBackupDialog();

  // 配图搜索（2026-11-02）
  bindPicDialog();
}

/* ── 配图搜索（2026-11-02）─────────────────────────────────────
 * 复用小红书封面那套 Pexels 源，Key 同存 supersu.cover.stock.v1，
 * 用户填过一次两个页面都能用。
 * 搜到的图直接以 Markdown 图片插入编辑器（data URI 会由 copyRich 处理）。 */
function bindPicDialog() {
  const dlg = $('pic-dialog');
  const mask = $('pic-mask');
  const grid = $('pic-grid');
  const hint = $('pic-hint');
  const q = $('pic-q');
  if (!dlg || !mask || !grid) return;

  let search = null;   // 动态加载的 search.js

  const close = () => { dlg.hidden = true; mask.hidden = true; };

  const setHint = (html) => { if (hint) hint.innerHTML = html; };

  const loadSearch = async () => {
    if (search) return search;
    try {
      search = await import('./cover/search.js');
    } catch {
      throw new Error('搜图模块加载失败');
    }
    return search;
  };

  const renderItems = (items) => {
    grid.innerHTML = '';
    if (!items || !items.length) {
      grid.innerHTML = '<div class="pic-empty">没有找到图片，换个关键词试试</div>';
      return;
    }
    for (const it of items) {
      const cell = document.createElement('div');
      cell.className = 'pic-item';
      cell.title = it.author ? `摄影：${it.author}` : '点击插入';
      const img = document.createElement('img');
      img.src = it.thumb || it.url;
      img.loading = 'lazy';
      img.alt = '';
      cell.appendChild(img);
      if (it.author) {
        const by = document.createElement('span');
        by.className = 'pic-by';
        by.textContent = it.author;
        cell.appendChild(by);
      }
      cell.addEventListener('click', () => {
        // 直接插 Markdown 外链图：copyRich 复制时会自动转 data URI + 压缩
        const piece = `\n![](${it.url})\n`;
        const ta = $('input');
        const pos = ta.selectionStart ?? ta.value.length;
        ta.setRangeText(piece, pos, ta.selectionEnd ?? pos, 'end');
        ta.focus();
        updateCharCount();
        saveDraft(ta.value);
        scheduleRender();
        toast('已插入配图', 'ok');
        close();
      });
      grid.appendChild(cell);
    }
  };

  const doSearch = async (term) => {
    const kw = String(term || q.value || '').trim();
    if (!kw) { setHint('先输入关键词，或点「按正文推荐」'); return; }
    let mod;
    try {
      mod = await loadSearch();
    } catch (e) {
      setHint(e.message);
      return;
    }
    const keys = mod.getStockKeys();
    if (!keys.pexels) {
      setHint('还没配置 Pexels Key。到「小红书标题图」页填一次即可，两处共用。');
      return;
    }
    setHint('搜索中…');
    grid.innerHTML = '<div class="pic-empty">加载中…</div>';
    try {
      const r = await mod.searchBackground(kw, { limit: 12 });
      const items = r.items || [];
      setHint(items.length
        ? `关键词「${r.query || kw}」共 ${items.length} 张${r.translated ? '（已译成英文）' : ''}`
        : `没搜到，试试别的词`);
      renderItems(items);
    } catch (e) {
      setHint(`搜索失败：${(e && e.message) || e}`);
      grid.innerHTML = '<div class="pic-empty">搜索失败</div>';
    }
  };

  const open = () => {
    dlg.hidden = false;
    mask.hidden = false;
    const mod = loadSearch();
    mod.then((m) => {
      if (!m.getStockKeys().pexels) {
        setHint('还没配置 Pexels Key。到「小红书标题图」页填一次即可，两处共用。');
      } else if (!grid.children.length) {
        setHint('输入关键词搜索，或点「按正文推荐」让 AI 读正文生成关键词');
      }
    }).catch(() => {});
    q.focus();
  };

  $('btn-pic').addEventListener('click', open);
  $('btn-pic-close').addEventListener('click', close);
  mask.addEventListener('click', close);
  $('btn-pic-go').addEventListener('click', () => doSearch());
  q.addEventListener('keydown', (e) => { if (e.key === 'Enter') doSearch(); });

  // 按正文推荐关键词（AI 可用时才有意义；不可用给明确指引）
  $('btn-pic-ai').addEventListener('click', async () => {
    let ai;
    try {
      ai = await import('./ai.js');
    } catch { setHint('AI 模块加载失败'); return; }
    if (!ai.isReady()) {
      setHint('AI 还没配置：点右上「AI」，选平台、填 Key 后再用「按正文推荐」。也可以直接手输关键词。');
      return;
    }
    const body = $('input').value.trim();
    if (!body) { setHint('正文还是空的，先写点内容'); return; }
    setHint('AI 正在读正文生成关键词…');
    try {
      const kw = await ai.suggestImageKeywords(body);
      if (!kw) { setHint('AI 没给出关键词，手动输一个吧'); return; }
      q.value = kw;
      setHint(`AI 建议关键词：<b>${kw}</b>`);
      doSearch(kw);
    } catch (e) {
      setHint(`AI 生成失败：${(e && e.message) || e}。也可以直接手输关键词。`);
    }
  });
}

function applyMode() {
  const wrap = $('preview-wrap');
  wrap.classList.toggle('web', mode === 'web');
  $('btn-mode').textContent = mode === 'web' ? '网页' : '手机';
}

function openAbout() { $('about').hidden = false; $('about-mask').hidden = false; }
function closeAbout() { $('about').hidden = true; $('about-mask').hidden = true; }

/* ── 设置弹窗（2026-11-03 P4-2，定稿 §3.2）───────────────────────
   低频项集中入口：配色微调 / 页尾 / 数据。从「⋯」菜单的「设置」进入，
   顶栏不新增控件（AGENTS.md §6：390px 下顶栏已挤满，加第 5 个会重叠 21px）。 */
function openSettings() {
  $('settings-dlg').hidden = false;
  $('settings-mask').hidden = false;
  /* ⚠️ 不能用 init() 里的局部 syncCustomInputs（作用域进不来，会抛 ReferenceError）。
     这里直接按顶层可用的 customColors() / byId 回填，逻辑与它保持一致。 */
  const base = byId.get(customBase) || themes[0] || {};
  const c = customColors() || { bg: base.background, text: base.primary, accent: base.accent };
  if ($('dc-bg')) $('dc-bg').value = c.bg || '#ffffff';
  if ($('dc-text')) $('dc-text').value = c.text || '#333333';
  if ($('dc-accent')) $('dc-accent').value = c.accent || '#888888';
  syncTailUi();
  renderBgGrid();
}
function closeSettings() {
  $('settings-dlg').hidden = true;
  $('settings-mask').hidden = true;
}

/* 页尾内容（2026-11-03 P4-2）：独立于正文，自动附在末尾。
   ⚠️ 引擎没有页尾参数，所以这里是**前端拼接** —— 在 doRender 拿到 out.html 之后追加。
   存在 LS.tail 里，复制/导出都包含（因为拼接发生在产物层，不是编辑器文本层）。 */
const LS_TAIL = 'supersu.pwa.tail';
function tailPayload() {
  const on = $('tail-on') ? $('tail-on').checked : false;
  const md = $('tail-md') ? $('tail-md').value.trim() : '';
  return { on, md };
}
function syncTailUi() {
  const t = lsGet(LS_TAIL, { on: false, md: '' });
  if ($('tail-on')) $('tail-on').checked = !!t.on;
  if ($('tail-md')) $('tail-md').value = t.md || '';
}
/** 把页尾 Markdown 渲染成 HTML 片段（用轻量渲染器，与正文同一套主题样式） */
async function tailHtml() {
  const t = tailPayload();
  if (!t.on || !t.md) return '';
  try {
    const raw = themeJsonCache.get(activeId) || await loadThemeJson(activeId);
    return renderLight(t.md, JSON.parse(raw)) || '';
  } catch { return ''; }
}

/* ── 整页背景（2026-11-03 P4-2）────────────────────────────────
   只改整页底色，不动标题/正文/列表样式，与配色自由组合（定稿 §3.3）。
   ⚠️ 实现是**在产物外面包一层带背景的 <section>**，不是改主题 JSON ——
   这样复制/导出天然包含背景，且不污染主题文件。
   plain 时**不包外层**，产物与不设背景时逐字节一致。 */
const BGS = [
  { id: 'plain', n: '纯白', bg: '#FFFFFF', css: '' },
  { id: 'warm', n: '暖纸', bg: '#F7F4EE', css: '' },
  { id: 'paper', n: '纸张纹理', bg: '#FAF7F0',
    css: 'repeating-linear-gradient(0deg,rgba(120,110,95,.035) 0 1px,transparent 1px 4px)' },
  { id: 'grid', n: '细网格', bg: '#FCFCFC',
    css: 'linear-gradient(rgba(120,110,95,.055) 1px,transparent 1px),linear-gradient(90deg,rgba(120,110,95,.055) 1px,transparent 1px)' },
];
const BG_SIZE = { grid: '18px 18px' };
const LS_BG = LS.bg;

function bgCurrent() {
  const v = lsGet(LS_BG, 'plain');
  return BGS.some((b) => b.id === v) ? v : 'plain';
}

/** 把背景包进产物。plain 或无背景时原样返回（零变化）。 */
function applyPageBg(html) {
  const id = bgCurrent();
  if (id === 'plain' || !html) return html;
  const b = BGS.find((x) => x.id === id);
  if (!b) return html;
  const size = BG_SIZE[id];
  let s = `background:${b.bg}`;
  if (b.css) s += `;background-image:${b.css}` + (size ? `;background-size:${size}` : '');
  /* padding 1px 0 防止首个子元素的 margin 穿透到外层（否则顶部会露白） */
  return `<section style="${s};padding:1px 0">${html}</section>`;
}

/** 设置弹窗里的背景选择网格。kit 态禁用（背景是整篇设计的一部分）。 */
function renderBgGrid() {
  const grid = $('set-grid-bg');
  if (!grid) return;
  const locked = (themeMeta(activeId) || {}).kind === 'kit';
  const cur = bgCurrent();
  grid.innerHTML = BGS.map((b) => {
    const on = b.id === cur;
    const prev = `background:${b.bg}` + (b.css
      ? `;background-image:${b.css};background-size:${BG_SIZE[b.id] || 'auto'}` : '');
    return `<button class="bg-card" data-bg="${b.id}" type="button"
              aria-pressed="${on}" ${locked ? 'disabled' : ''}
              style="opacity:${locked ? '.4' : '1'}">
      <span class="bg-prev" style="${prev}"></span>
      <span class="bg-name">${b.n}${on ? ' ✓' : ''}</span>
    </button>`;
  }).join('');
  const note = $('set-bg-note');
  if (note) {
    note.textContent = locked
      ? '当前用的是整篇设计，背景不可改 —— 那是设计的一部分。'
      : '只改整页底色，不动标题/正文/列表样式，与配色自由组合。';
  }
}

function setBg(id) {
  if (!BGS.some((b) => b.id === id)) return;
  lsSet(LS_BG, id);
  renderBgGrid();
  scheduleRender();
}

async function clearAll() {
  if (!confirm(
    '清除本机保存的全部数据？包括：\n'
    + '· 草稿、收藏、最近使用、风格偏好\n'
    + '· 你填过的 AI API Key 与图库（Pexels）Key\n'
    + '· 自定义配色、版式与段落样式\n'
    + '· 离线缓存\n\n'
    + '文章内容不会上传，删了就找不回。')) return;

  // 按 supersu. 前缀统一清除（不再维护手写清单，见文件头 LS_PREFIX 注释）
  const removed = clearSupersuStorage();

  // 删除后自检：还有残留就说明有模块用了别的前缀，立刻暴露出来，
  // 不要像 2026-10-30 那次一样「以为清干净了、其实 Key 还在」
  const left = supersuKeys();
  if (left.length) {
    console.warn('[clearAll] 仍有本机数据残留：', left);
    toast(`已清除 ${removed} 项，但仍有 ${left.length} 项未能删除（见控制台）`, 'err');
    return;
  }

  try {
    if (window.caches) {
      const keys = await caches.keys();
      await Promise.all(keys.map((k) => caches.delete(k)));
    }
  } catch { /* 清缓存失败不影响数据清理 */ }

  toast(`本地数据已清除（${removed} 项），刷新后回到初始状态`);
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
