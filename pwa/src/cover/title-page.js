/* 标题图模块（2026-10-31 模块拆分，design-module-split-ia.md §4）
 *
 * 一句话 → 配图 → 出封面。大众需求，本页首屏零长文概念（§9 验收）。
 * 从 index.js 拆出的部分：风格/字体/玩法/尺寸渲染、生成、画廊、九宫格、实时预览。
 * 署名回到「调整」抽屉（§4：模块独立后不再需要共字段 hack）。
 * 底图选择用 bg-picker 工厂实例（状态独立，与长图长文互不串台）。
 */

import { ALL_STYLES, COVER_SIZES, styleById, LAYOUTS } from './catalog.js';
import { renderCoverBlob, buildCoverHtml } from './render.js';
import { TEXT_MODES, TEXT_FONTS } from './textmode.js';
import { autoKeyword } from './search.js';
import { splitGrid, releaseTiles, zipTiles } from '../nine.js';
import { createBgPicker } from './bg-picker.js';
import { toast, openLightbox, extractStory } from './ui.js';

const $ = (id) => document.getElementById(id);
const BASE = new URL('../../', import.meta.url).href;
const PREFS = 'supersu.cover.prefs.v1';

const state = {
  style: 'editorial',
  size: 'xhs',
  mode: 'color',
  font: 'auto',
  textMode: 'stack',
  layoutPick: {},
  textPos: 'auto',
  frosted: false,
  results: [],
  busy: false,
  picker: null,           // bg-picker 实例（image/imageMeta/analysis 在它内部）
};

/* ── 偏好（本模块自己的键；长文设置在 supersu.longform.prefs.v1）── */
function savePrefs() {
  try {
    localStorage.setItem(PREFS, JSON.stringify({
      style: state.style, size: state.size, mode: state.mode,
      font: state.font, textMode: state.textMode,
      layoutPick: state.layoutPick,
      textPos: state.textPos, frosted: state.frosted,
      author: $('cv-author')?.value || '',
    }));
  } catch { /* 隐私模式不阻断 */ }
  schedulePreview();
}

function loadPrefs() {
  try {
    const p = JSON.parse(localStorage.getItem(PREFS) || '{}');
    if (p.style && ALL_STYLES.some((s) => s.id === p.style)) state.style = p.style;
    if (p.size && COVER_SIZES[p.size]) state.size = p.size;
    if (['color', 'upload', 'search'].includes(p.mode)) state.mode = p.mode;
    if (TEXT_FONTS.some((f) => f.id === p.font)) state.font = p.font;
    if (TEXT_MODES.some((m) => m.id === p.textMode)) state.textMode = p.textMode;
    if (['auto', 'top', 'center', 'bottom'].includes(p.textPos)) state.textPos = p.textPos;
    if (typeof p.frosted === 'boolean') state.frosted = p.frosted;
    if (p.layoutPick && typeof p.layoutPick === 'object') {
      // 只接受当前 catalog 里真实存在的 styleId，避免旧偏好把界面选到空气上
      for (const [k, v] of Object.entries(p.layoutPick)) {
        if (typeof v === 'string' && ALL_STYLES.some((s) => s.id === v)) state.layoutPick[k] = v;
      }
    }
    if (p.author && $('cv-author')) $('cv-author').value = p.author;
  } catch { /* 忽略损坏的偏好 */ }
}

function setStatus(msg, isErr = false) {
  const el = $('cv-status');
  if (!el) return;
  el.textContent = msg || '';
  el.classList.toggle('err', !!isErr);
}

/* ── 风格 / 字体 / 玩法 / 尺寸 ── */
function selectStyle(id) {
  if (!ALL_STYLES.some((s) => s.id === id)) return;
  const meta = styleById(id);
  const prevZone = zoneOf();
  state.style = id;
  state.layoutPick[meta.layout] = id;
  if (!meta.sizes.includes(state.size)) state.size = meta.sizes[0];
  savePrefs();
  renderStyles();
  renderSizes();
  /* 版式切换会改变文字区域（大字报居中 vs 其他贴底），
     分析结果要跟着重算，否则 scrim 会压错地方（2026-10-30）。 */
  if (state.picker && prevZone.join() !== zoneOf().join()) state.picker.reanalyze();
}

/** 当前 styleId 是否为 3:4 专属（只用于给卡片打角标） */
function onlyXhs(meta) {
  return meta.sizes.length === 1;
}

/* 底图可读性的 zone：文字真实占据的纵向范围，**按版式给**（2026-10-30）：
   大多数版式「贴底排版」→ 底部 45%；大字报「垂直居中」→ 中间 50%。 */
const ZONE_BY_STYLE = { bigtype: [0.28, 0.82] };
function zoneOf() {
  return ZONE_BY_STYLE[state.style] || [0.55, 1.0];
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
    // 可选字体（得意黑）：不用该字体渲染按钮自身，避免「进页面就下 1.1MB」
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
    const url = new URL(meta.file, BASE).href;
    // ⚠️ 预热必须用 meta.family（'Smiley Sans'），不是中文显示名（2026-10-25 修正）
    const fam = (meta.family || '').replace(/^['"]|['"]$/g, '');
    if (fam && document.fonts && document.fonts.load) {
      document.fonts.load(`1em "${fam}"`).catch(() => {});
    }
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

/* 版式卡（2026-10-29 改版）：卡片身份 = 版式（结构不同），卡内小圆点 = 色板。
   点缩略图选当前色；点色点同版式内换色；每张卡记住上次选的色（layoutPick）。 */
function renderStyles() {
  const box = $('cv-styles');
  if (!box) return;
  box.textContent = '';
  const grid = document.createElement('div');
  grid.className = 'cv-style-grid';

  for (const card of LAYOUTS) {
    if (!card.members.length) continue;
    const active = card.members.includes(state.style);
    const curId = active ? state.style : (state.layoutPick[card.id] || card.members[0]);
    const cur = styleById(curId);

    const wrap = document.createElement('div');
    wrap.className = 'cv-style';
    wrap.dataset.layout = card.id;
    wrap.dataset.style = curId;
    wrap.setAttribute('aria-pressed', String(active));
    wrap.title = card.note;

    const pick = document.createElement('button');
    pick.type = 'button';
    pick.className = 'cv-style-pick';
    pick.dataset.style = curId;
    pick.setAttribute('aria-label', `使用「${card.name}」${cur.paletteName || ''}`);
    const img = document.createElement('img');
    img.className = 'cv-style-thumb';
    img.src = cur.thumb;
    img.alt = '';
    img.loading = 'lazy';
    // 缩略图缺失时用色板渐变兜底，别出现破图
    img.addEventListener('error', () => {
      img.remove();
      const sw = document.createElement('span');
      sw.className = 'cv-style-swatch';
      sw.style.background = `linear-gradient(135deg, ${cur.swatch} 0 56%, ${cur.accent} 56% 100%)`;
      pick.insertBefore(sw, pick.firstChild);
    }, { once: true });
    pick.appendChild(img);
    if (onlyXhs(cur)) {
      const bd = document.createElement('span');
      bd.className = 'cv-style-badge';
      bd.textContent = '3:4';
      pick.appendChild(bd);
    }
    pick.addEventListener('click', () => {
      if (curId !== state.style) selectStyle(curId);
    });
    wrap.appendChild(pick);

    const metaRow = document.createElement('div');
    metaRow.className = 'cv-style-meta';
    const nm = document.createElement('span');
    nm.className = 'cv-style-name';
    nm.textContent = card.name;
    metaRow.appendChild(nm);
    if (card.members.length > 1) {
      const pal = document.createElement('span');
      pal.className = 'cv-style-pal';
      pal.textContent = cur.paletteName || '';
      metaRow.appendChild(pal);
    }
    wrap.appendChild(metaRow);

    if (card.members.length > 1) {
      const dots = document.createElement('div');
      dots.className = 'cv-dots';
      for (const mid of card.members) {
        const m = styleById(mid);
        const d = document.createElement('button');
        d.type = 'button';
        d.className = 'cv-dot';
        d.dataset.style = mid;
        d.title = m.paletteName || m.name;
        d.setAttribute('aria-label', m.paletteName || m.name);
        d.setAttribute('aria-pressed', String(mid === curId));
        d.style.background = `linear-gradient(135deg, ${m.swatch} 0 52%, ${m.accent} 52% 100%)`;
        d.addEventListener('click', () => selectStyle(mid));
        dots.appendChild(d);
      }
      wrap.appendChild(dots);
    }

    grid.appendChild(wrap);
  }
  box.appendChild(grid);

  const hint = $('cv-style-hint');
  if (hint) {
    const n = LAYOUTS.filter((c) => c.members.length).length;
    hint.textContent = `${n} 个版式 · ${ALL_STYLES.length} 种配色`;
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
  const hint = $('cv-size-hint');
  if (hint) hint.textContent = meta.sizes.length === 1 ? '仅 3:4' : '支持 3 种尺寸';
}

/* 文字位置/磨砂 UI 同步（2026-10-30） */
function syncTextPosUI() {
  document.querySelectorAll('#cv-textpos-row .cv-chip').forEach((b) => {
    b.setAttribute('aria-pressed', String(b.dataset.pos === state.textPos));
  });
  const hint = $('cv-textpos-hint');
  if (hint) {
    const a = state.picker?.getState().analysis;
    if (state.textPos !== 'auto') {
      hint.textContent = '手动';
    } else if (a) {
      const z = a.zone || [0.55, 1];
      hint.textContent = `自动 · ${Math.round(z[0] * 100)}–${Math.round(z[1] * 100)}%`;
    } else {
      hint.textContent = '自动';
    }
  }
  const cb = $('cv-frosted');
  if (cb) cb.checked = !!state.frosted;
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
  const bg = state.picker.getState();

  state.busy = true;
  const btn = $('cv-gen');
  if (btn) btn.disabled = true;
  clearResults();
  try {
    for (const size of sizes) {
      setStatus(`正在保存 ${COVER_SIZES[size].label}…`);
      const r = await renderCoverBlob({
        style: state.style, size, title, lead, author, image: bg.image,
        textMode: state.textMode, font: state.font,
        analysis: bg.analysis, textPos: state.textPos, frosted: state.frosted,
      });
      const url = URL.createObjectURL(r.blob);
      state.results.push({ ...r, url });
      renderGallery();
    }
    /* 「保存大图」要真的是「存下来」——生成完直接落盘（归藏 3 尺寸只自动存当前选中）*/
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

/* ── 九宫格切图（B2 #7；只归标题图模块 —— 切的是「一张图」）── */
let nineTimer = null;
const nineState = { gap: 6, order: 'row', src: '', tiles: [] };

function setNineStatus(msg, isErr = false) {
  const el = $('cv-nine-status');
  if (!el) return;
  el.textContent = msg || '';
  el.classList.toggle('err', !!isErr);
}

function renderNineGrid() {
  const grid = $('cv-nine-grid');
  if (!grid || !nineState.tiles) return;
  grid.textContent = '';
  for (const t of nineState.tiles) {
    const img = document.createElement('img');
    img.src = t.url;
    img.alt = t.name;
    grid.appendChild(img);
  }
}

async function regenerateNine() {
  if (!nineState.src) return;
  try {
    const old = nineState.tiles;
    nineState.tiles = await splitGrid(nineState.src, {
      gap: nineState.gap, order: nineState.order,
    });
    if (old) releaseTiles(old);
    renderNineGrid();
  } catch (err) {
    setNineStatus(String(err.message || err), true);
  }
}

function openNine(src) {
  const modal = $('cv-nine');
  if (!modal) return;
  nineState.src = src;
  modal.hidden = false;
  setNineStatus('切图生成中…');
  regenerateNine();
}

function closeNine() {
  const modal = $('cv-nine');
  if (modal) modal.hidden = true;
}

async function downloadNineZip() {
  if (!nineState.tiles || !nineState.tiles.length) { setNineStatus('还没有切好的图', true); return; }
  try {
    const r = await zipTiles(nineState.tiles, '九宫格');
    setNineStatus(`已打包 ${r.filename}`);
    toast(`已打包 ${r.filename}`, 'ok');
  } catch (err) {
    setNineStatus(String(err.message || err), true);
  }
}

/* ── 实时预览：buildCoverHtml → 缩放 iframe（不截图，50~150ms 出画面）── */
let pvTimer = 0;
let pvSeq = 0;
let pvRO = null;

export function schedulePreview(delay = 300) {
  clearTimeout(pvTimer);
  pvTimer = setTimeout(() => { updatePreview(); }, delay);
}

async function updatePreview() {
  const scaler = $('cv-preview');
  if (!scaler) return;
  if (root && root.hidden) return;   // 页不可见时不做无用功

  const seq = ++pvSeq;
  const text = $('cv-text').value;
  /* ⚠️ 必须走 extractStory（引语只取第一个列表项之前的两行）——
     手搓 lines.slice(1) 会把列表项混进封面引语（拆分时实测回归，门禁拦下） */
  const { title, lead } = extractStory(text);
  const bg = state.picker.getState();
  try {
    const { html, size, meta } = await buildCoverHtml({
      style: state.style,
      size: state.size,
      title,
      lead,
      author: ($('cv-author')?.value || '').trim(),
      image: bg.image || '',
      textMode: state.textMode,
      font: state.font,
      analysis: bg.analysis,
      textPos: state.textPos,
      frosted: state.frosted,
    });
    if (seq !== pvSeq) return;
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
}

function updateCount() {
  const t = $('cv-text');
  const c = $('cv-count');
  if (t && c) c.textContent = `${t.value.length} / 500`;
}

/* ── 挂载 ── */
let root = null;

export function mountTitlePage(rootEl) {
  root = rootEl;
  if (!root) return;
  root.innerHTML = `
    <main class="cv-stage">
      <aside class="cv-col cv-col-left">
        <section class="cv-sec">
          <div class="cv-sec-head"><span class="cv-sec-title">一句话，变成一张图</span><button class="cv-mini-btn" id="cv-use-main" type="button">用正文</button><span class="cv-count" id="cv-count">0 / 500</span></div>
          <textarea class="cv-text" id="cv-text" maxlength="500" placeholder="写个标题，比如「周末去了趟海边」&#10;第二行可作小字。也可以点右上「用正文」带入排版页的内容。"></textarea>
        </section>
        <section class="cv-sec">
          <div class="cv-sec-head"><span class="cv-sec-title">配图方式</span></div>
          <!-- 三按钮（design §3，不做成 chip）：搜图是特色功能必须置顶（R3 硬约束）。
               保留 .cv-mode / data-mode 契约（bg-picker 与门禁套件都认它）。 -->
          <div class="cv-modes cv-modes-big" id="cv-modes">
            <button class="cv-mode cv-mode-big" type="button" data-mode="search">
              <b>搜一张好图</b><span>联网找真图 · 特色</span>
            </button>
            <button class="cv-mode cv-mode-big" type="button" data-mode="upload">
              <b>传一张</b><span>用自己的图</span>
            </button>
            <button class="cv-mode cv-mode-big" type="button" data-mode="color">
              <b>不要图</b><span>纯文字版式</span>
            </button>
          </div>
          <div class="cv-bg-body" id="cv-bg-body"></div>
          <div id="cv-bg-preview"></div>
          <!-- 文字位置与磨砂（2026-10-30）：默认全自动，这里是「我不喜欢自动结果」的出口。
               刻意不给「遮罩浓度 0–100%」滑块 —— 用户没有亮度直方图可看，只能瞎试。 -->
          <div class="cv-textpos" id="cv-textpos" hidden>
            <div class="cv-sec-head"><span class="cv-sec-title">文字位置</span><span class="cv-hint" id="cv-textpos-hint">自动</span></div>
            <div class="cv-chip-row" id="cv-textpos-row">
              <button class="cv-chip" type="button" data-pos="auto">自动</button>
              <button class="cv-chip" type="button" data-pos="top">偏上</button>
              <button class="cv-chip" type="button" data-pos="center">居中</button>
              <button class="cv-chip" type="button" data-pos="bottom">偏下</button>
            </div>
            <label class="cv-switch-row">
              <input type="checkbox" id="cv-frosted">
              <span>文字区磨砂（人物图会糊脸，默认关）</span>
            </label>
          </div>
        </section>
        <section class="cv-sec">
          <button class="cv-gen" id="cv-gen" type="button">保存大图</button>
          <div class="cv-status" id="cv-status"></div>
        </section>
        <!-- 高级设置抽屉：默认值就能出图，这些是「想微调」才需要的 L2 项。
             署名回归抽屉（模块拆分后不再需要共字段 hack）。 -->
        <div class="cv-adv" id="cv-adv">
          <button class="cv-adv-head" id="cv-adv-head" type="button"
                  aria-expanded="true" aria-controls="cv-adv-body">⚙ 调整 · 字体 / 玩法 / 署名 / 尺寸</button>
          <div class="cv-adv-body" id="cv-adv-body">
            <section class="cv-sec">
              <div class="cv-sec-head"><span class="cv-sec-title">字体</span><span class="cv-hint" id="cv-font-hint"></span></div>
              <div class="cv-chip-row" id="cv-fonts"></div>
            </section>
            <section class="cv-sec">
              <div class="cv-sec-head"><span class="cv-sec-title">文字玩法</span><span class="cv-hint" id="cv-textmode-hint"></span></div>
              <div class="cv-chip-row cv-mode-row" id="cv-textmodes"></div>
            </section>
            <section class="cv-sec">
              <div class="cv-sec-head"><span class="cv-sec-title">署名（可选）</span><span class="cv-hint">仅本模块</span></div>
              <input class="cv-field" id="cv-author" maxlength="20" placeholder="例如：阿苏" autocomplete="off">
            </section>
            <section class="cv-sec">
              <div class="cv-sec-head"><span class="cv-sec-title">尺寸</span><span class="cv-hint" id="cv-size-hint"></span></div>
              <div class="cv-size-row" id="cv-sizes"></div>
            </section>
          </div>
        </div>
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
        <div class="cv-out-head">
          <span class="cv-out-title">标题图结果</span>
          <span class="cv-out-sub">纯前端生成 · 内容不上传</span>
        </div>
        <div id="cv-gallery" class="cv-gallery" hidden></div>
        <div id="cv-empty" class="cv-empty">
          <b>文案 + 风格 = 标题图</b>
          <span>左边写文案、右边选版式，预览就是成品；点「保存大图」存成 PNG。<br>归藏两套一次出 3 个尺寸，其余版式出 3:4。</span>
        </div>
        <!-- 示例成品墙（2026-10-29）：常驻区块，任何时候都能点一张看成品、直接套用该版式 -->
        <div class="cv-samples" id="cv-samples">
          <span class="cv-samples-label">示例成品 · 点一张直接套用该版式</span>
          <div class="cv-samples-row">
            <button class="cv-sample" type="button" data-style="editorial"
                    title="Editorial 杂志风"><img src="./samples/cover-sample-editorial.jpg" alt="Editorial 杂志风示例封面"></button>
            <button class="cv-sample" type="button" data-style="image-led-paper"
                    title="图文封面 · 暖纸"><img src="./samples/cover-sample-image-led-paper.jpg" alt="图文封面示例"></button>
            <button class="cv-sample" type="button" data-style="quote-ink"
                    title="金句 · 墨夜"><img src="./samples/cover-sample-quote-ink.jpg" alt="金句示例封面"></button>
            <button class="cv-sample" type="button" data-style="editorial-dune"
                    title="沙丘暖纸"><img src="./samples/cover-sample-editorial-dune.jpg" alt="沙丘暖纸示例封面"></button>
            <button class="cv-sample" type="button" data-style="number-bold"
                    title="编号大字 · 亮橙"><img src="./samples/cover-sample-number-bold.jpg" alt="编号大字示例封面"></button>
            <button class="cv-sample" type="button" data-style="editorial-midnight-ink"
                    title="午夜墨金"><img src="./samples/cover-sample-editorial-midnight-ink.jpg" alt="午夜墨金示例封面"></button>
          </div>
        </div>
        <p class="cv-tip">手机上生成后长按图片即可保存到相册；桌面端点「下载」。</p>
      </section>

      <aside class="cv-col cv-col-right">
        <section class="cv-sec">
          <div class="cv-sec-head"><span class="cv-sec-title">风格</span><span class="cv-hint" id="cv-style-hint"></span></div>
          <div id="cv-styles"></div>
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
  `;

  loadPrefs();
  state.picker = createBgPicker({
    host: $('cv-bg-body'),
    preview: $('cv-bg-preview'),
    modesEl: $('cv-modes'),
    keywordSource: () => $('cv-text').value,
    zoneOf,
    onStatus: setStatus,
    onChange: () => { syncTextPosUI(); schedulePreview(0); },
    onBusy: (b) => { const g = $('cv-gen'); if (g) g.disabled = b; },
    textPosPanel: $('cv-textpos'),
    onTextPosSync: syncTextPosUI,
  });

  renderStyles();
  renderSizes();
  renderFonts();
  renderTextModes();
  state.picker.mount();
  updateCount();

  if ($('cv-author')) $('cv-author').addEventListener('input', savePrefs);
  $('cv-text').addEventListener('input', () => { updateCount(); schedulePreview(); });
  /* 关键词自动提取（ux-spec C7）：标题自动填入，可改；手改过（kwTouched）不再覆盖 */
  $('cv-text').addEventListener('input', () => {
    if (state.picker) state.picker.setQueryIfUntouched(autoKeyword($('cv-text').value).query);
  });
  /* 高级设置抽屉（桌面默认展开；≤640 默认收起，展开变底部 sheet） */
  const adv = $('cv-adv');
  if (adv) {
    const mq = window.matchMedia('(max-width: 640px)');
    const applyAdv = () => {
      const open = !mq.matches;
      adv.classList.toggle('open', open);
      if ($('cv-adv-head')) $('cv-adv-head').setAttribute('aria-expanded', String(open));
    };
    applyAdv();
    if (mq.addEventListener) mq.addEventListener('change', applyAdv);
  }
  const advHead = $('cv-adv-head');
  if (advHead) advHead.addEventListener('click', () => {
    const open = adv.classList.toggle('open');
    advHead.setAttribute('aria-expanded', String(open));
  });
  $('cv-use-main').addEventListener('click', () => {
    const v = $('input').value.trim();
    if (!v) { toast('排版页还没有内容', 'err'); return; }
    $('cv-text').value = v.slice(0, 500);
    updateCount();
  });
  $('cv-gen').addEventListener('click', generate);
  // 空态示例成品（U-9）：点一张 = 选中该风格 + 焦点落文案框
  $('cv-samples').addEventListener('click', (e) => {
    const b = e.target.closest('.cv-sample');
    if (!b) return;
    if (b.dataset.style) selectStyle(b.dataset.style);
    $('cv-text').focus();
    toast('已选好风格，写句文案试试');
  });
  document.querySelectorAll('#cv-modes .cv-mode').forEach((b) => {
    b.addEventListener('click', () => state.picker.setMode(b.dataset.mode));
  });
  /* 文字位置三档 + 磨砂开关（2026-10-30）：改完立刻重绘预览 */
  document.querySelectorAll('#cv-textpos-row .cv-chip').forEach((b) => {
    b.addEventListener('click', () => {
      state.textPos = b.dataset.pos || 'auto';
      savePrefs();
      syncTextPosUI();
      schedulePreview(0);
    });
  });
  const frostCb = $('cv-frosted');
  if (frostCb) {
    frostCb.addEventListener('change', () => {
      state.frosted = frostCb.checked;
      savePrefs();
      schedulePreview(0);
    });
  }

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

  initPreview();
}

/** 页面可见性切换时刷新（index.js showPage 调） */
export function onShowTitlePage() {
  if (!root || root.hidden) return;
  if (!$('cv-text').value.trim()) {
    const main = $('input').value.trim();
    if (main) { $('cv-text').value = main.slice(0, 500); updateCount(); }
  }
  schedulePreview(0);
}

/** ESC 分发（index.js keydown 调）：九宫格开着就先关它；返回 true 表示已消费 */
export function escTitlePage() {
  const nine = $('cv-nine');
  if (nine && !nine.hidden) { closeNine(); return true; }
  return false;
}
