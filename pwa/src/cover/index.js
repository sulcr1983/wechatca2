/* PWA 封面页：文案 / 风格 / 尺寸 / 底图 / 生成 / 画廊 / 下载长按。
 * 纯前端：不传内容、不依赖后端；底图可选纯色、上传、联网搜图（Pexels，BYOK）。
 */

import { ALL_STYLES, GUIZANG_STYLES, TEMPLATE_STYLES, COVER_SIZES, styleById } from './catalog.js';
import { renderCoverBlob, buildCoverHtml } from './render.js';
import { TEXT_MODES, TEXT_FONTS } from './textmode.js';
import { searchBackground, fetchImageDataUrl, guessQuery, getStockKeys } from './search.js';
import { splitGrid, releaseTiles, zipTiles } from '../nine.js';

const PREFS = 'supersu.cover.prefs.v1';
const $ = (id) => document.getElementById(id);

const state = {
  style: 'editorial',
  size: 'xhs',
  mode: 'color',          // color | upload | search
  tab: 'content',         // content | style | text | bg（左侧标签）
  font: 'auto',           // TEXT_FONTS 的 id
  textMode: 'stack',      // TEXT_MODES 的 id
  image: '',              // data URL
  imageMeta: null,        // {title, author, license, pageUrl} | {title, author:'本地上传'}
  candidates: [],
  searchQuery: '',
  busy: false,
  results: [],
};

let toastTimer = null;
function toast(msg, kind = '') {
  const el = $('toast');
  if (!el) return;
  el.textContent = msg;
  el.className = 'toast show' + (kind ? ' ' + kind : '');
  el.hidden = false;
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => {
    el.className = 'toast';
    setTimeout(() => { el.hidden = true; }, 220);
  }, 2800);
}

function setStatus(msg, isErr = false) {
  const el = $('cv-status');
  if (!el) return;
  el.textContent = msg || '';
  el.classList.toggle('err', !!isErr);
}

/* ── 文案提取（与本地版 _extract_story 同口径） ── */
function extractStory(text) {
  const lines = String(text).split(/\r?\n/).map((l) => l.trim()).filter(Boolean);
  const title = (lines[0] || '').replace(/^#{1,6}\s*/, '').slice(0, 64).trim();
  const lead = lines.slice(1, 3)
    .map((l) => l.replace(/^[-*•>\s]+/, '').trim())
    .filter(Boolean)
    .join(' · ')
    .slice(0, 96);
  return { title, lead };
}

function fileToDataUrl(file) {
  return new Promise((resolve, reject) => {
    const fr = new FileReader();
    fr.onload = () => resolve(String(fr.result || ''));
    fr.onerror = () => reject(new Error('图片读取失败'));
    fr.readAsDataURL(file);
  });
}

/* ── 页面切换 ── */
function openCover() {
  if (!$('cover-root').hidden) return;
  $('cover-root').hidden = false;
  $('stage').hidden = true;
  $('tabs').hidden = true;
  document.body.classList.add('cover-open');
  const btn = $('btn-cover');
  if (btn) { btn.textContent = '公众号排版'; btn.setAttribute('aria-pressed', 'true'); }
  if (!$('cv-text').value.trim()) {
    const main = $('input').value.trim();
    if (main) { $('cv-text').value = main.slice(0, 500); updateCount(); }
  }
}

function closeCover() {
  if ($('cover-root').hidden) return;
  $('cover-root').hidden = true;
  $('stage').hidden = false;
  $('tabs').hidden = false;
  document.body.classList.remove('cover-open');
  const btn = $('btn-cover');
  if (btn) { btn.textContent = '小红书标题图生成'; btn.setAttribute('aria-pressed', 'false'); }
}

/* ── 风格 / 尺寸 ── */
function selectStyle(id) {
  if (!styleById(id)) return;
  state.style = id;
  const meta = styleById(id);
  if (!meta.sizes.includes(state.size)) state.size = meta.sizes[0];
  savePrefs();
  renderStyles();
  renderSizes();
}

function renderFonts() {
  const box = $('cv-fonts');
  if (!box) return;
  box.textContent = '';
  for (const f of TEXT_FONTS) {
    const b = document.createElement('button');
    b.className = 'cv-chip';
    b.type = 'button';
    b.dataset.font = f.id;
    b.title = f.desc;
    b.setAttribute('aria-pressed', String(state.font === f.id));
    b.textContent = f.name;
    // 可选字体（得意黑）：不在这里用该字体渲染按钮自身，
    // 否则「一进页面就为了渲染按钮而下 1.1MB」，违背按需加载初衷。
    b.addEventListener('click', () => selectFont(f.id));
    box.appendChild(b);
  }
  const hint = $('cv-font-hint');
  if (hint) {
    const cur = TEXT_FONTS.find((f) => f.id === state.font);
    hint.textContent = cur && cur.optional ? `${cur.desc} · 首次使用会下载约 1.1MB` : (cur?.desc || '');
  }
}

function selectFont(id) {
  if (!TEXT_FONTS.some((f) => f.id === id)) return;
  state.font = id;
  savePrefs();
  renderFonts();
  // 选中可选字体时先预热一次，让用户点「生成」时不用等下载
  const meta = TEXT_FONTS.find((f) => f.id === id);
  if (meta && meta.optional) {
    const url = new URL(meta.file, new URL('../../', import.meta.url).href).href;
    // ⚠️ 预热必须用 meta.family（'Smiley Sans'），不是中文显示名 —— 用错名字
    //    等于预热了一个不存在的字体，白下一次（2026-10-25 修正）。
    const fam = (meta.family || '').replace(/^['"]|['"]$/g, '');
    if (fam && document.fonts && document.fonts.load) {
      document.fonts.load(`1em "${fam}"`).catch(() => {});
    }
    // 主文档里不一定用到该字体，用 FontFace 显式拉一次写进缓存（失败不阻断）
    try {
      const ff = new FontFace(fam, `url(${url})`, { style: 'normal' });
      ff.load().then((f) => document.fonts.add(f)).catch(() => {});
    } catch { /* 老浏览器忽略 */ }
  }
}

function renderTextModes() {
  const box = $('cv-textmodes');
  if (!box) return;
  box.textContent = '';
  for (const m of TEXT_MODES) {
    const b = document.createElement('button');
    b.className = 'cv-chip';
    b.type = 'button';
    b.dataset.textmode = m.id;
    b.title = m.desc;
    b.setAttribute('aria-pressed', String(state.textMode === m.id));
    b.textContent = m.name;
    b.addEventListener('click', () => {
      state.textMode = m.id;
      savePrefs();
      renderTextModes();
      const hint = $('cv-textmode-hint');
      if (hint) hint.textContent = m.desc;
    });
    box.appendChild(b);
  }
  const hint = $('cv-textmode-hint');
  if (hint) {
    const cur = TEXT_MODES.find((m) => m.id === state.textMode);
    hint.textContent = cur?.desc || '';
  }
}

function renderStyles() {
  const box = $('cv-styles');
  if (!box) return;
  box.textContent = '';
  const groups = [
    { label: '归藏 · 支持 3 尺寸', items: GUIZANG_STYLES },
    { label: '模板 · 仅 3:4', items: TEMPLATE_STYLES },
  ];
  for (const g of groups) {
    const lab = document.createElement('div');
    lab.className = 'cv-group-label';
    lab.textContent = g.label;
    box.appendChild(lab);
    const grid = document.createElement('div');
    grid.className = 'cv-style-grid';
    for (const s of g.items) {
      const b = document.createElement('button');
      b.className = 'cv-style';
      b.dataset.style = s.id;
      b.setAttribute('aria-pressed', String(s.id === state.style));
      b.title = s.desc || s.name;
      if (s.thumb) {
        const img = document.createElement('img');
        img.className = 'cv-style-thumb';
        img.src = s.thumb;
        img.alt = '';
        img.loading = 'lazy';
        b.appendChild(img);
      } else {
        const sw = document.createElement('span');
        sw.className = 'cv-style-swatch';
        sw.style.background = `linear-gradient(135deg, ${s.swatch} 0 56%, ${s.accent} 56% 100%)`;
        b.appendChild(sw);
      }
      const nm = document.createElement('span');
      nm.className = 'cv-style-name';
      nm.textContent = s.name;
      b.appendChild(nm);
      if (s.sizes.length === 1) {
        const bd = document.createElement('span');
        bd.className = 'cv-style-badge';
        bd.textContent = '3:4';
        b.appendChild(bd);
      }
      b.addEventListener('click', () => selectStyle(s.id));
      grid.appendChild(b);
    }
    box.appendChild(grid);
  }
}

function renderSizes() {
  const meta = styleById(state.style);
  if (!meta.sizes.includes(state.size)) state.size = meta.sizes[0];
  const box = $('cv-sizes');
  if (!box) return;
  box.textContent = '';
  for (const dim of Object.values(COVER_SIZES)) {
    const b = document.createElement('button');
    b.className = 'cv-size';
    b.dataset.size = dim.id;
    b.textContent = dim.label;
    b.title = dim.hint;
    b.disabled = !meta.sizes.includes(dim.id);
    b.setAttribute('aria-pressed', String(dim.id === state.size));
    b.addEventListener('click', () => {
      if (b.disabled) return;
      state.size = dim.id;
      savePrefs();
      renderSizes();
    });
    box.appendChild(b);
  }
  const hint = $('cv-style-hint');
  if (hint) hint.textContent = meta.sizes.length === 1 ? '此模板仅 3:4' : '支持 3 种尺寸';
}

/* ── 底图 ── */
function setMode(mode) {
  state.mode = mode;
  savePrefs();
  renderBg();
}

function renderBg() {
  document.querySelectorAll('.cv-mode').forEach((b) => {
    b.setAttribute('aria-pressed', String(b.dataset.mode === state.mode));
  });
  const body = $('cv-bg-body');
  if (!body) return;
  body.textContent = '';
  if (state.mode === 'color') {
    const p = document.createElement('p');
    p.className = 'cv-hint';
    p.textContent = '用模板纸色 / 归藏深色作底，不依赖网络与图片，最稳。';
    body.appendChild(p);
  } else if (state.mode === 'upload') {
    const label = document.createElement('label');
    label.className = 'cv-upload';
    label.textContent = '选择图片';
    const input = document.createElement('input');
    input.type = 'file';
    input.accept = 'image/*';
    input.id = 'cv-file';
    input.addEventListener('change', onFile);
    label.appendChild(input);
    body.appendChild(label);
  } else {
    const row = document.createElement('div');
    row.className = 'cv-search-row';
    const q = document.createElement('input');
    q.className = 'cv-field';
    q.id = 'cv-q';
    q.placeholder = '关键词，如 beach / 咖啡';
    q.value = state.searchQuery || guessQuery($('cv-text').value).query;
    const btn = document.createElement('button');
    btn.className = 'cv-search-btn';
    btn.id = 'cv-search';
    btn.textContent = '搜索';
    btn.addEventListener('click', doSearch);
    row.append(q, btn);
    const grid = document.createElement('div');
    grid.className = 'cv-search-grid';
    grid.id = 'cv-cands';
    /* 图源状态条（2026-10-27 修）：
       原来这里写死「Wikimedia 免 key…国内网络不可达时请改用上传」——
       那是只有 Commons 时代的文案，等于在劝退用户。
       现只保留 Pexels 一家（Pixabay 不吃中文关键词，已移除），这里如实显示配置状态。 */
    const keys = getStockKeys();
    // ⚠️ 千万别叫 state —— 本文件有模块级 state 对象，同名 const 会遮蔽它，
    //    而上面几行刚读过 state.searchQuery，同块作用域下直接 TDZ 报错，
    //    整个 renderBgBody 抛出 → 搜图面板空白（2026-10-27 踩过）。
    const stateRow = document.createElement('div');
    stateRow.className = 'cv-stock-state';
    // 只剩 Pexels 一家（Pixabay 不吃中文、Wikimedia 国内超时，都已移除）
    const items = [['Pexels', !!keys.pexels]];
    stateRow.innerHTML = items.map(([n, ok]) =>
      `<span class="cv-stock-pill ${ok ? 'ok' : 'no'}">${n}${ok ? ' ✓' : ' 需 Key'}</span>`).join('');
    const setBtn = document.createElement('button');
    setBtn.type = 'button';
    setBtn.className = 'cv-stock-set';
    setBtn.textContent = keys.pexels ? '图库设置' : '填 Pexels Key（免费·2分钟）';
    // 直达配置：打开 AI 面板（图库 Key 就在面板底部）并滚到那一块；
    // 没填过 Key 时再顺手把「怎么获取」教程弹出来，省得用户去找。
    setBtn.addEventListener('click', () => {
      document.getElementById('btn-ai')?.click();
      setTimeout(() => {
        const pex = document.getElementById('stock-pexels');
        pex?.scrollIntoView({ block: 'center', behavior: 'smooth' });
        pex?.focus();
        if (!keys.pexels) {
          document.getElementById('stock-help')?.click();
        }
      }, 260);
    });
    stateRow.appendChild(setBtn);

    const hint = document.createElement('p');
    hint.className = 'cv-hint';
    hint.style.marginTop = '8px';
    hint.textContent = keys.pexels
      ? '支持中文关键词（海边 / 咖啡 都行）；图片可商用、免署名。'
      : '联网搜图需要 Pexels Key（免费）。填一个就能用，支持中文关键词。';
    body.append(row, stateRow, grid, hint);
    renderCandidates();
  }
  renderBgPreview();
}

async function onFile(e) {
  const file = e.target.files?.[0];
  if (!file) return;
  if (file.size > 12 * 1024 * 1024) { toast('图片太大（上限 12MB）', 'err'); return; }
  try {
    const data = await fileToDataUrl(file);
    state.image = data;
    state.imageMeta = { title: file.name, author: '本地上传', license: '' };
    renderBgPreview();
    setStatus('底图已选（本地上传）');
  } catch (err) {
    toast(String(err.message || err), 'err');
  }
}

async function doSearch() {
  const q = ($('cv-q')?.value || '').trim();
  if (!q) { toast('先填一个关键词', 'err'); return; }
  const btn = $('cv-search');
  if (btn) btn.disabled = true;
  state.searchQuery = q;
  state.candidates = [];
  renderCandidates();
  setStatus('正在搜图…（Pexels）');
  try {
    const r = await searchBackground(q, { limit: 6 });
    state.candidates = r.items;
    renderCandidates();
    setStatus(r.items.length ? `找到 ${r.items.length} 张，点一张作底图` : '没有找到合适的图，换个关键词或改用上传');
  } catch (err) {
    state.candidates = [];
    renderCandidates();
    setStatus(String(err.message || err), true);
    toast(String(err.message || err), 'err');
  } finally {
    if (btn) btn.disabled = false;
  }
}

function renderCandidates() {
  const box = $('cv-cands');
  if (!box) return;
  box.textContent = '';
  for (const it of state.candidates) {
    const b = document.createElement('button');
    b.className = 'cv-cand';
    b.title = `${it.title}\n${it.author || ''}${it.license ? ' · ' + it.license : ''}`;
    b.setAttribute('aria-pressed', String(!!state.imageMeta && state.imageMeta.pageUrl === it.pageUrl));
    const img = document.createElement('img');
    img.src = it.thumb || it.url;
    img.alt = it.title;
    img.loading = 'lazy';
    img.addEventListener('error', () => { if (img.src !== it.url) img.src = it.url; });
    // 加载完就撤掉骨架闪烁，否则已显示的图还在闪
    img.addEventListener('load', () => b.classList.add('loaded'), { once: true });
    b.appendChild(img);
    b.addEventListener('click', () => pickCandidate(it));
    box.appendChild(b);
  }
}

async function pickCandidate(it) {
  const btn = $('cv-gen');
  if (btn) btn.disabled = true;
  // 先清掉旧底图，避免下载还没完成用户就点生成、误用上一张图
  state.image = '';
  state.imageMeta = null;
  renderBgPreview();
  setStatus('正在下载底图…');
  try {
    const data = await fetchImageDataUrl(it.url);
    state.image = data;
    state.imageMeta = it;
    renderCandidates();
    renderBgPreview();
    setStatus('底图已选（Pexels）');
  } catch (err) {
    setStatus(String(err.message || err), true);
    toast(String(err.message || err), 'err');
  } finally {
    if (btn) btn.disabled = false;
  }
}

function renderBgPreview() {
  const box = $('cv-bg-preview');
  if (!box) return;
  box.textContent = '';
  if (!state.image) return;
  const wrap = document.createElement('div');
  wrap.className = 'cv-bg-preview';
  const img = document.createElement('img');
  img.src = state.image;
  img.alt = '当前底图';
  const meta = document.createElement('div');
  meta.className = 'cv-bg-meta';
  const title = document.createElement('b');
  const m = state.imageMeta || {};
  title.textContent = (m.title || '自定义底图').slice(0, 28);
  meta.appendChild(title);
  const by = [m.author, m.license].filter(Boolean).join(' · ');
  if (by) meta.appendChild(document.createTextNode(by));
  if (m.pageUrl) {
    const a = document.createElement('a');
    a.href = m.pageUrl;
    a.target = '_blank';
    a.rel = 'noopener';
    // 链接文字用「原图 ↗」而不是图源名：license 已经是「Pexels License」，
    // 再写一遍来源就成了「… Pexels License Pexels」（2026-10-27 修）
    a.textContent = '原图 ↗';
    meta.appendChild(document.createTextNode(' '));
    meta.appendChild(a);
  }
  const clr = document.createElement('button');
  clr.className = 'cv-clear';
  clr.type = 'button';
  clr.title = '清除底图';
  clr.textContent = '×';
  clr.addEventListener('click', () => {
    state.image = '';
    state.imageMeta = null;
    renderBgPreview();
    setStatus('已清除底图');
  });
  wrap.append(img, meta, clr);
  box.appendChild(wrap);
}

/* ── 生成 ── */
function clearResults() {
  for (const r of state.results) {
    if (r.url) URL.revokeObjectURL(r.url);
  }
  state.results = [];
  const gal = $('cv-gallery');
  if (gal) { gal.textContent = ''; gal.hidden = true; }
  const empty = $('cv-empty');
  if (empty) empty.hidden = false;
}

async function generate() {
  if (state.busy) return;
  const text = $('cv-text').value.trim();
  if (text.length < 2) { toast('先写点文案（第一行会作大标题）', 'err'); return; }
  const { title, lead } = extractStory(text);
  if (!title) { toast('第一行要有一个标题', 'err'); return; }
  const author = $('cv-author').value.trim();
  const meta = styleById(state.style);
  const sizes = meta.sizes;

  state.busy = true;
  const btn = $('cv-gen');
  if (btn) btn.disabled = true;
  clearResults();
  try {
    for (const size of sizes) {
      setStatus(`正在保存 ${COVER_SIZES[size].label}…`);
      const r = await renderCoverBlob({
        style: state.style, size, title, lead, author, image: state.image,
        textMode: state.textMode, font: state.font,
      });
      const url = URL.createObjectURL(r.blob);
      state.results.push({ ...r, url });
      renderGallery();
    }
    /* 「保存大图」要真的是「存下来」——生成完直接落盘，别让用户再点一次卡片上的「下载」。
       归藏会出 3 个尺寸，只自动存当前选中的那个；其余尺寸仍在卡片上手动下载。 */
    const want = document.querySelector(`.cv-card a.cv-dl[download$="-${state.size}.png"]`);
    let saved = false;
    if (want) { want.click(); saved = true; }
    setStatus(saved ? `已保存到下载文件夹（${COVER_SIZES[state.size].label}）` : `已生成 ${state.results.length} 张`);
    toast(saved ? '大图已保存' : '大图已生成，点卡片上的「下载」保存', 'ok');
  } catch (err) {
    setStatus(String(err.message || err), true);
    toast(String(err.message || err), 'err');
  } finally {
    state.busy = false;
    if (btn) btn.disabled = false;
  }
}

function renderGallery() {
  const gal = $('cv-gallery');
  const empty = $('cv-empty');
  if (!gal) return;
  gal.textContent = '';
  if (!state.results.length) { gal.hidden = true; if (empty) empty.hidden = false; return; }
  gal.hidden = false;
  if (empty) empty.hidden = true;
  for (const r of state.results) {
    const fig = document.createElement('figure');
    fig.className = 'cv-card';
    const img = document.createElement('img');
    img.className = 'cv-card-img';
    img.src = r.url;
    img.alt = `${styleById(r.style).name} 封面`;
    img.addEventListener('click', () => openLightbox(r.url));
    const foot = document.createElement('figcaption');
    foot.className = 'cv-card-foot';
    const label = document.createElement('span');
    label.className = 'cv-card-label';
    label.textContent = `${COVER_SIZES[r.size].hint} · ${styleById(r.style).name}`;
    label.title = label.textContent;
    // 按钮包一层容器（2026-10-25）：避免长标签把两个按钮挤到换行
    const acts = document.createElement('div');
    acts.className = 'cv-card-acts';
    const nine = document.createElement('button');
    nine.type = 'button';
    nine.className = 'cv-dl';
    nine.textContent = '九宫格';
    nine.addEventListener('click', () => openNine(r.url));
    const dl = document.createElement('a');
    dl.className = 'cv-dl';
    dl.href = r.url;
    dl.download = `supersu-cover-${r.style}-${r.size}.png`;
    dl.textContent = '下载';
    acts.append(nine, dl);
    foot.append(label, acts);
    fig.append(img, foot);
    gal.appendChild(fig);
  }
}

function openLightbox(src) {
  const lb = $('cv-lightbox');
  if (!lb) return;
  lb.querySelector('img').src = src;
  lb.hidden = false;
}
function closeLightbox() {
  const lb = $('cv-lightbox');
  if (lb) lb.hidden = true;
}

/* ── 九宫格切图（B2 #7）── */
const nineState = { tiles: [], src: null, gap: 6, order: 'row', seq: 0 };
let nineTimer = null;

function setNineStatus(msg, isErr = false) {
  const el = $('cv-nine-status');
  if (!el) return;
  el.textContent = msg || '';
  el.classList.toggle('err', !!isErr);
}

function renderNineGrid() {
  const grid = $('cv-nine-grid');
  if (!grid) return;
  grid.textContent = '';
  for (const t of nineState.tiles) {
    const img = document.createElement('img');
    img.src = t.url;
    img.alt = `第 ${t.seq} 张`;
    img.title = `第 ${t.seq} 张 · ${t.name}`;
    grid.appendChild(img);
  }
}

async function regenerateNine() {
  if (!nineState.src) return;
  const seq = ++nineState.seq;
  setNineStatus('正在切图…');
  try {
    const r = await splitGrid(nineState.src, { gap: nineState.gap, order: nineState.order });
    if (seq !== nineState.seq) { releaseTiles(r.tiles); return; }
    releaseTiles(nineState.tiles);
    nineState.tiles = r.tiles;
    renderNineGrid();
    setNineStatus(`${r.tiles.length} 张 · 每张 ${r.cell}×${r.cell}px（按 ${r.side}×${r.side} 居中裁剪）`);
  } catch (err) {
    releaseTiles(nineState.tiles);
    nineState.tiles = [];
    renderNineGrid();
    setNineStatus(String(err.message || err), true);
  }
}

function openNine(src) {
  const box = $('cv-nine');
  if (!box) return;
  releaseTiles(nineState.tiles);
  nineState.tiles = [];
  nineState.src = src;
  box.hidden = false;
  regenerateNine();
}

function closeNine() {
  const box = $('cv-nine');
  if (box) box.hidden = true;
  nineState.seq += 1;              // 让在途的切图结果作废
  releaseTiles(nineState.tiles);
  nineState.tiles = [];
  nineState.src = null;
  const grid = $('cv-nine-grid');
  if (grid) grid.textContent = '';
  setNineStatus('');
}

async function downloadNineZip() {
  if (!nineState.tiles.length) { toast('还没有切好的图', 'err'); return; }
  try {
    const r = await zipTiles(nineState.tiles, 'supersu-九宫格');
    toast(`已下载 ${r.filename}（${Math.round(r.bytes / 1024)} KB）`, 'ok');
  } catch (err) {
    toast('打包失败：' + ((err && err.message) || err), 'err');
  }
}

/* ── 实时预览（2026-10-27 三栏改版的核心）──────────────────────────
 *
 * 为什么不用 renderCoverBlob：
 *   那条路是「离屏 iframe → 等字体 → modern-screenshot 截图」，一次 1~2 秒。
 *   拿它做预览，用户点一个风格要等两秒，所谓「实时」就是假的。
 *
 * 这里改用 buildCoverHtml 拿到 HTML，直接塞进一个 **缩放的 iframe**：
 *   - 不截图、不合成，浏览器自己排版，通常 50~150ms 就画出来了
 *   - iframe 保持真实尺寸（1080×1440），只用 CSS transform 缩放，
 *     所以模板里的 px/fitty 计算完全不受影响，视觉效果与最终图一致
 *   - 打字时用 300ms 防抖 + 序号丢弃过期结果，避免连打十几个字时
 *     排队渲染把主线程拖住
 */

let pvTimer = 0;
let pvSeq = 0;
let pvRO = null;

/** 防抖调度一次预览。任何设置变化都应该走这里。 */
export function schedulePreview(delay = 300) {
  clearTimeout(pvTimer);
  pvTimer = setTimeout(() => { updatePreview(); }, delay);
}

async function updatePreview() {
  const scaler = $('cv-preview');
  if (!scaler) return;
  if ($('cover-root') && $('cover-root').hidden) return;   // 页不可见时不做无用功

  const seq = ++pvSeq;
  const { title, lead } = extractStory($('cv-text').value);
  try {
    const { html, size, meta } = await buildCoverHtml({
      style: state.style,
      size: state.size,
      title,
      lead,
      author: ($('cv-author')?.value || '').trim(),
      image: state.image || '',
      textMode: state.textMode,
      font: state.font,
    });
    if (seq !== pvSeq) return;        // 期间又改了，这版丢掉
    paintPreview(scaler, html, size);

    const dim = COVER_SIZES[size] || COVER_SIZES.xhs;
    const pvMeta = $('cv-pv-meta');
    if (pvMeta) pvMeta.textContent = `${meta.name} · ${dim.w}×${dim.h}`;
  } catch (e) {
    // 预览失败不影响生成（比如模板还没下载完），静默降级
    const pvMeta = $('cv-pv-meta');
    if (pvMeta) pvMeta.textContent = '预览暂不可用';
  }
}

function paintPreview(scaler, html, size) {
  const dim = COVER_SIZES[size] || COVER_SIZES.xhs;
  let fr = scaler.querySelector('iframe');
  if (!fr) {
    fr = document.createElement('iframe');
    fr.setAttribute('aria-hidden', 'true');
    fr.setAttribute('tabindex', '-1');
    fr.style.cssText = 'position:absolute;left:0;top:0;border:0;transform-origin:top left;';
    scaler.appendChild(fr);
  }
  fr.style.width = `${dim.w}px`;
  fr.style.height = `${dim.h}px`;
  fr.srcdoc = html;
  fitPreview(scaler, dim);
}

/** 让真实尺寸的 iframe 缩放后正好装进预览框。 */
function fitPreview(scaler, dim) {
  if (!scaler) return;
  const box = scaler.parentElement;
  if (!box) return;
  const w = box.clientWidth;
  const h = box.clientHeight;
  if (!w || !h) return;
  const k = Math.min(w / dim.w, h / dim.h);
  const fr = scaler.querySelector('iframe');
  if (fr) fr.style.transform = `scale(${k})`;
  scaler.style.width = `${Math.round(dim.w * k)}px`;
  scaler.style.height = `${Math.round(dim.h * k)}px`;
}

/** 首次挂载：观察预览框尺寸变化，窗口缩放/侧栏折叠时重新贴合。 */
function initPreview() {
  const scaler = $('cv-preview');
  if (!scaler) return;
  const box = scaler.parentElement;
  if (box && 'ResizeObserver' in window && !pvRO) {
    pvRO = new ResizeObserver(() => {
      const fr = scaler.querySelector('iframe');
      if (!fr) return;
      const w = parseFloat(fr.style.width);
      const h = parseFloat(fr.style.height);
      if (w && h) fitPreview(scaler, { w, h });
    });
    pvRO.observe(box);
  }
  schedulePreview(0);
}

/* ── 偏好 ── */
function savePrefs() {
  try {
    localStorage.setItem(PREFS, JSON.stringify({
      style: state.style, size: state.size, mode: state.mode,
      font: state.font, textMode: state.textMode,
      author: $('cv-author')?.value || '',
    }));
  } catch { /* 隐私模式不阻断 */ }
  // 偏好一变（风格/尺寸/字体/玩法/署名都在这里收口）就刷新预览，
  // 这样任何选择都立刻可见，不用点生成（2026-10-27 三栏改版配套）
  schedulePreview();
}

function loadPrefs() {
  try {
    const p = JSON.parse(localStorage.getItem(PREFS) || '{}');
    if (p.style && styleById(p.style)) state.style = p.style;
    if (p.size && COVER_SIZES[p.size]) state.size = p.size;
    if (['color', 'upload', 'search'].includes(p.mode)) state.mode = p.mode;
    if (TEXT_FONTS.some((f) => f.id === p.font)) state.font = p.font;
    if (TEXT_MODES.some((m) => m.id === p.textMode)) state.textMode = p.textMode;
    if (p.author && $('cv-author')) $('cv-author').value = p.author;
  } catch { /* 忽略损坏的偏好 */ }
}

function updateCount() {
  const t = $('cv-text');
  const c = $('cv-count');
  if (t && c) c.textContent = `${t.value.length} / 500`;
}

/* ── 挂载 ── */
function mount() {
  const root = $('cover-root');
  if (!root) return;
  root.innerHTML = `
    <main class="cv-stage">
      <!-- ── 三栏布局（原型 A，2026-10-27）────────────────────────────
           改版原因：原来是「4 个标签 + 结果区」，写文案、选风格、看效果
           分散在三个标签里，用户要先点「生成」才知道长什么样 ——
           试 12 个风格就要出 36 张废图、等 12 次。
           现在：左边写 → 中间实时看 → 右边挑，全程不点生成也能看到效果。 -->
      <aside class="cv-col cv-col-left">
        <section class="cv-sec">
          <div class="cv-sec-head"><span class="cv-sec-title">文案</span><button class="cv-mini-btn" id="cv-use-main" type="button">用正文</button></div>
          <textarea class="cv-text" id="cv-text" maxlength="500" placeholder="第一行作大标题，接下来两行作引语。&#10;&#10;也可以点右上「用正文」带入排版页的内容。"></textarea>
          <span class="cv-count" id="cv-count">0 / 500</span>
        </section>
        <section class="cv-sec">
          <div class="cv-sec-head"><span class="cv-sec-title">署名（可选）</span></div>
          <input class="cv-field" id="cv-author" maxlength="20" placeholder="例如：阿苏" autocomplete="off">
        </section>
        <section class="cv-sec">
          <div class="cv-sec-head"><span class="cv-sec-title">字体</span><span class="cv-hint" id="cv-font-hint"></span></div>
          <div class="cv-chip-row" id="cv-fonts"></div>
        </section>
        <section class="cv-sec">
          <div class="cv-sec-head"><span class="cv-sec-title">文字玩法</span><span class="cv-hint" id="cv-textmode-hint"></span></div>
          <div class="cv-chip-row cv-mode-row" id="cv-textmodes"></div>
        </section>
      </aside>

      <section class="cv-col cv-col-mid">
        <div class="cv-pv-head">
          <span class="cv-pv-title"><i class="cv-pv-dot"></i>实时预览</span>
          <span class="cv-pv-meta" id="cv-pv-meta"></span>
          <!-- 九宫格是独立工具（切任意图），与「有没有生成结果」无关，
               所以放在预览条常驻可见，而不是埋在结果区（2026-10-27） -->
          <button class="cv-mini-btn cv-nine-entry" id="cv-nine-pick" type="button"
                  title="把任意图片切成 3×3 九张">九宫格</button>
          <input type="file" id="cv-nine-file" accept="image/*" hidden>
        </div>
        <div class="cv-preview-box">
          <div class="cv-preview-scaler" id="cv-preview"></div>
        </div>
        <div class="cv-pv-actions">
          <!-- 语义修正（2026-10-27）：实时预览已经是成品，用户要的是「把它存下来」。
               按钮文字按「动词+对象」写，并按次要按钮处理（预览才是主角）。 -->
          <button class="cv-gen cv-gen--soft" id="cv-gen" type="button">保存大图</button>
          <div class="cv-status" id="cv-status"></div>
        </div>
        <div class="cv-out-head">
          <span class="cv-out-title">标题图结果</span>
          <span class="cv-out-sub">纯前端生成 · 内容不上传</span>
        </div>
        <div id="cv-gallery" class="cv-gallery" hidden></div>
        <div id="cv-empty" class="cv-empty">
          <b>文案 + 风格 = 标题图</b>
          <span>左边写文案、右边选风格和底图，预览就是成品。<br>点「保存大图」存成 PNG：归藏两套一次出 3 个尺寸，模板出 3:4。</span>
          <div class="cv-samples" id="cv-samples">
            <span class="cv-samples-label">示例成品 · 点一张直接选该风格</span>
            <div class="cv-samples-row">
              <button class="cv-sample" type="button" data-style="editorial"
                      title="Editorial 杂志风"><img src="./samples/cover-sample-editorial.jpg" alt="Editorial 杂志风示例封面"></button>
              <button class="cv-sample" type="button" data-style="editorial-dune"
                      title="沙丘暖纸"><img src="./samples/cover-sample-editorial-dune.jpg" alt="沙丘暖纸示例封面"></button>
              <button class="cv-sample" type="button" data-style="editorial-midnight-ink"
                      title="午夜墨金"><img src="./samples/cover-sample-editorial-midnight-ink.jpg" alt="午夜墨金示例封面"></button>
            </div>
          </div>
        </div>
        <p class="cv-tip">手机上生成后长按图片即可保存到相册；桌面端点「下载」。</p>
      </section>

      <aside class="cv-col cv-col-right">
        <section class="cv-sec">
          <div class="cv-sec-head"><span class="cv-sec-title">风格</span><span class="cv-hint" id="cv-style-hint"></span></div>
          <div id="cv-styles"></div>
        </section>
        <section class="cv-sec">
          <div class="cv-sec-head"><span class="cv-sec-title">尺寸</span></div>
          <div class="cv-size-row" id="cv-sizes"></div>
        </section>
        <section class="cv-sec">
          <div class="cv-sec-head"><span class="cv-sec-title">底图</span></div>
          <div class="cv-modes" id="cv-modes">
            <button class="cv-mode" type="button" data-mode="color">纯色</button>
            <button class="cv-mode" type="button" data-mode="upload">上传</button>
            <button class="cv-mode" type="button" data-mode="search">联网搜图</button>
          </div>
          <div class="cv-bg-body" id="cv-bg-body"></div>
          <div id="cv-bg-preview"></div>
        </section>
      </aside>
    </main>
    <div class="cv-nine" id="cv-nine" hidden>
      <div class="cv-nine-panel" role="dialog" aria-label="九宫格切图">
        <div class="cv-nine-head">
          <span>九宫格切图</span>
          <button class="cv-nine-x" id="cv-nine-x" type="button" aria-label="关闭">✕</button>
        </div>
        <div class="cv-nine-grid" id="cv-nine-grid"></div>
        <div class="cv-nine-row">
          <label for="cv-nine-gap">切图间距</label>
          <input id="cv-nine-gap" type="range" min="0" max="20" step="2" value="6">
          <span class="cv-nine-val" id="cv-nine-gapv">6px</span>
        </div>
        <div class="cv-nine-row">
          <label for="cv-nine-order">顺序</label>
          <select id="cv-nine-order">
            <option value="row">逐行（左→右）</option>
            <option value="snake">蛇形（S 形）</option>
          </select>
        </div>
        <div class="cv-nine-foot">
          <span class="cv-nine-status" id="cv-nine-status"></span>
          <button class="cv-gen" id="cv-nine-zip" type="button">下载 9 张（ZIP）</button>
        </div>
        <p class="cv-nine-tip">非正方形图片会先居中裁成方形；发朋友圈或小红书时按 nine-01 → nine-09 顺序上传。</p>
      </div>
    </div>
    <div class="cv-lightbox" id="cv-lightbox" hidden>
      <button class="cv-lightbox-close" id="cv-lightbox-close" type="button" aria-label="关闭">✕</button>
      <img alt="封面大图">
    </div>
  `;

  loadPrefs();
  renderStyles();
  renderSizes();
  renderFonts();
  renderTextModes();
  renderBg();
  initPreview();
  updateCount();
  if ($('cv-author')) $('cv-author').addEventListener('input', savePrefs);
  $('cv-text').addEventListener('input', () => { updateCount(); schedulePreview(); });
  $('cv-text').addEventListener('input', () => {
    if (state.mode === 'search' && $('cv-q') && !state.searchQuery) {
      $('cv-q').value = guessQuery($('cv-text').value).query;
    }
  });
  $('cv-use-main').addEventListener('click', () => {
    const v = $('input').value.trim();
    if (!v) { toast('排版页还没有内容', 'err'); return; }
    $('cv-text').value = v.slice(0, 500);
    updateCount();
  });
  $('cv-gen').addEventListener('click', generate);
  // 空态示例成品（U-9）：点一张 = 选中该风格 + 焦点落文案框，首屏即知道成品长什么样
  $('cv-samples').addEventListener('click', (e) => {
    const b = e.target.closest('.cv-sample');
    if (!b) return;
    const card = document.querySelector(`.cv-style[data-style='${b.dataset.style}']`);
    if (card) card.click();
    $('cv-text').focus();
    toast('已选好风格，写句文案试试');
  });
  document.querySelectorAll('.cv-mode').forEach((b) => {
    b.addEventListener('click', () => setMode(b.dataset.mode));
  });
  $('cv-lightbox').addEventListener('click', (e) => {
    if (e.target.id === 'cv-lightbox') closeLightbox();
  });
  $('cv-lightbox-close').addEventListener('click', closeLightbox);

  // 九宫格切图：封面结果卡入口 + 上传任意图片入口
  $('cv-nine-pick').addEventListener('click', () => $('cv-nine-file').click());
  $('cv-nine-file').addEventListener('change', () => {
    const f = $('cv-nine-file').files && $('cv-nine-file').files[0];
    $('cv-nine-file').value = '';
    if (f) openNine(f);
  });
  $('cv-nine-x').addEventListener('click', closeNine);
  $('cv-nine').addEventListener('click', (e) => {
    if (e.target.id === 'cv-nine') closeNine();
  });
  $('cv-nine-gap').addEventListener('input', () => {
    nineState.gap = Number($('cv-nine-gap').value) || 0;
    $('cv-nine-gapv').textContent = `${nineState.gap}px`;
    clearTimeout(nineTimer);
    nineTimer = setTimeout(regenerateNine, 150);
  });
  $('cv-nine-order').addEventListener('change', () => {
    nineState.order = $('cv-nine-order').value === 'snake' ? 'snake' : 'row';
    regenerateNine();
  });
  $('cv-nine-zip').addEventListener('click', downloadNineZip);

  const coverBtn = $('btn-cover');
  if (coverBtn) coverBtn.addEventListener('click', () => {
    if ($('cover-root').hidden) openCover(); else closeCover();
  });
  document.addEventListener('keydown', (e) => {
    if (e.key !== 'Escape') return;
    if (!$('cv-nine').hidden) { closeNine(); return; }
    if (!$('cv-lightbox').hidden) { closeLightbox(); return; }
    if (!$('cover-root').hidden) closeCover();
  });
}

mount();
