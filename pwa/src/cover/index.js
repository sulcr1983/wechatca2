/* PWA 封面页：文案 / 风格 / 尺寸 / 底图 / 生成 / 画廊 / 下载长按。
 * 纯前端：不传内容、不依赖后端；底图可选纯色、上传、Wikimedia 免 key 搜图。
 */

import { ALL_STYLES, GUIZANG_STYLES, TEMPLATE_STYLES, COVER_SIZES, styleById } from './catalog.js';
import { renderCoverBlob } from './render.js';
import { searchBackground, fetchImageDataUrl, guessQuery } from './search.js';

const PREFS = 'supersu.cover.prefs.v1';
const $ = (id) => document.getElementById(id);

const state = {
  style: 'editorial',
  size: 'xhs',
  mode: 'color',          // color | upload | search
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
  if (btn) { btn.textContent = '排版'; btn.setAttribute('aria-pressed', 'true'); }
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
  if (btn) { btn.textContent = '小红书'; btn.setAttribute('aria-pressed', 'false'); }
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
    const hint = document.createElement('p');
    hint.className = 'cv-hint';
    hint.style.marginTop = '8px';
    hint.textContent = 'Wikimedia Commons 免 key，图库以纪实照片为主；国内网络不可达时请改用上传。';
    body.append(row, grid, hint);
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
  setStatus('正在搜索 Wikimedia Commons…');
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
    setStatus('底图已选（Wikimedia Commons）');
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
    a.textContent = 'Wikimedia Commons';
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
      setStatus(`正在生成 ${COVER_SIZES[size].label}…`);
      const r = await renderCoverBlob({
        style: state.style, size, title, lead, author, image: state.image,
      });
      const url = URL.createObjectURL(r.blob);
      state.results.push({ ...r, url });
      renderGallery();
    }
    setStatus(`完成：${state.results.length} 张`);
    toast('封面已生成', 'ok');
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
    const dl = document.createElement('a');
    dl.className = 'cv-dl';
    dl.href = r.url;
    dl.download = `supersu-cover-${r.style}-${r.size}.png`;
    dl.textContent = '下载';
    foot.append(label, dl);
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

/* ── 偏好 ── */
function savePrefs() {
  try {
    localStorage.setItem(PREFS, JSON.stringify({
      style: state.style, size: state.size, mode: state.mode,
      author: $('cv-author')?.value || '',
    }));
  } catch { /* 隐私模式不阻断 */ }
}

function loadPrefs() {
  try {
    const p = JSON.parse(localStorage.getItem(PREFS) || '{}');
    if (p.style && styleById(p.style)) state.style = p.style;
    if (p.size && COVER_SIZES[p.size]) state.size = p.size;
    if (['color', 'upload', 'search'].includes(p.mode)) state.mode = p.mode;
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
      <aside class="cv-panel">
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
        <button class="cv-gen" id="cv-gen" type="button">生成封面</button>
        <div class="cv-status" id="cv-status"></div>
      </aside>
      <section class="cv-output">
        <div class="cv-out-head">
          <span class="cv-out-title">封面结果</span>
          <span class="cv-out-sub">纯前端生成 · 内容不上传</span>
        </div>
        <div id="cv-gallery" class="cv-gallery" hidden></div>
        <div id="cv-empty" class="cv-empty">
          <b>文案 + 风格 = 封面</b>
          <span>左边写文案、选风格和底图，点「生成封面」。<br>归藏两套一次出 3 个尺寸，10 套模板出 3:4。</span>
        </div>
        <p class="cv-tip">手机上生成后长按图片即可保存到相册；桌面端点「下载」。</p>
      </section>
    </main>
    <div class="cv-lightbox" id="cv-lightbox" hidden>
      <button class="cv-lightbox-close" id="cv-lightbox-close" type="button" aria-label="关闭">✕</button>
      <img alt="封面大图">
    </div>
  `;

  loadPrefs();
  renderStyles();
  renderSizes();
  renderBg();
  updateCount();
  if ($('cv-author')) $('cv-author').addEventListener('input', savePrefs);
  $('cv-text').addEventListener('input', updateCount);
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
  document.querySelectorAll('.cv-mode').forEach((b) => {
    b.addEventListener('click', () => setMode(b.dataset.mode));
  });
  $('cv-lightbox').addEventListener('click', (e) => {
    if (e.target.id === 'cv-lightbox') closeLightbox();
  });
  $('cv-lightbox-close').addEventListener('click', closeLightbox);

  const coverBtn = $('btn-cover');
  if (coverBtn) coverBtn.addEventListener('click', () => {
    if ($('cover-root').hidden) openCover(); else closeCover();
  });
  document.addEventListener('keydown', (e) => {
    if (e.key !== 'Escape') return;
    if (!$('cv-lightbox').hidden) { closeLightbox(); return; }
    if (!$('cover-root').hidden) closeCover();
  });
}

mount();
