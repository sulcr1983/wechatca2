/* 长图长文模块（2026-10-31 模块拆分，design-module-split-ia.md §5）
 *
 * 独立完整流程（R5 定稿顺序）：粘贴文字 → 选图 → 选版式 → 导出。
 * 整篇文章 textarea 在左栏**最顶上**（R5：主输入是文章，第一步就是它）。
 * 与标题图共用引擎（cards.js 分页 + story.js 成套生成 + bg-picker 配图），
 * 但状态完全独立：自己的模板/色板/签名/结果区/底图选择器。
 */

import { LONG_TPLS, PALETTES, tplById, paletteByKey, buildLong, cardInner,
  fitOverflowCards, ensureCardsEnv, ROLES, parseBlocks, splitLongParas,
  tplSupportsBg } from './cards.js';
import { buildStorySet } from './story.js';
import { zipTiles } from '../nine.js';
import { createBgPicker, fileToDataUrl } from './bg-picker.js';
import { toast, openLightbox, extractStory } from './ui.js';

const $ = (id) => document.getElementById(id);
const BASE = new URL('../../', import.meta.url).href;
const PREFS = 'supersu.longform.prefs.v1';
const LEGACY_PREFS = 'supersu.cover.prefs.v1';   // 迁移源：旧键里曾混装长文设置

const state = {
  longTpl: 'editorial',
  palKey: 'dune',
  longPn: true,           // 显示页码（默认开 = 现状心智，design §12.5）
  longSign: '',           // 签名（空 = 关；非空则页脚 @签名 + 开篇署名 + 结尾 CTA，§12.4）
  longBg: '',             // 内页背景图 dataURL（空 = 纯色；§12.2）
  results: [],
  busy: false,
  picker: null,           // 封面底图选择器实例（与标题图的互不串台）
};

/* ── 偏好（本模块自己的键；含 §12.7 三开关——拆分前漏持久化的 S6 修复）── */
function savePrefs() {
  try {
    localStorage.setItem(PREFS, JSON.stringify({
      longTpl: state.longTpl, palKey: state.palKey,
      longPn: state.longPn, longSign: state.longSign, longBg: state.longBg,
    }));
  } catch { /* 隐私模式不阻断 */ }
  schedulePreview();
}

function loadPrefs() {
  try {
    let p = JSON.parse(localStorage.getItem(PREFS) || 'null');
    if (!p) {
      /* 一次性迁移：长文设置曾在 supersu.cover.prefs.v1 里混装（拆分前）。
         longPn/longSign/longBg 当年没存过，无迁移值。 */
      const legacy = JSON.parse(localStorage.getItem(LEGACY_PREFS) || '{}');
      if (legacy.longTpl || legacy.palKey) p = { longTpl: legacy.longTpl, palKey: legacy.palKey };
    }
    if (!p) return;
    if (LONG_TPLS.some((t) => t.id === p.longTpl)) state.longTpl = p.longTpl;
    if (PALETTES.some((x) => x.key === p.palKey)) state.palKey = p.palKey;
    if (typeof p.longPn === 'boolean') state.longPn = p.longPn;
    if (typeof p.longSign === 'string') state.longSign = p.longSign.slice(0, 16);
    if (typeof p.longBg === 'string') state.longBg = p.longBg;
  } catch { /* 忽略损坏的偏好 */ }
}

function setStatus(msg, isErr = false) {
  const el = $('cv-status-long');
  if (!el) return;
  el.textContent = msg || '';
  el.classList.toggle('err', !!isErr);
}

function currentLongTpl() {
  return tplById(state.longTpl);
}
function currentLongPal() {
  const tpl = currentLongTpl();
  return tpl.palette || paletteByKey(state.palKey);   // 模板锁配色时忽略用户色板
}

/* ── 右栏：长文模板 12 选 1（整套生效，design §6.0.3）── */
function renderLongTpls() {
  const box = $('cv-ltpls');
  if (!box) return;
  box.textContent = '';
  for (const t of LONG_TPLS) {
    const b = document.createElement('button');
    b.type = 'button';
    b.className = 'cv-ltpl';
    b.dataset.tpl = t.id;
    b.title = t.desc;
    b.setAttribute('aria-pressed', String(state.longTpl === t.id));
    b.innerHTML = `<span class="cv-ltpl-name">${t.name}</span><span class="cv-ltpl-desc">${t.desc}</span>`;
    b.addEventListener('click', () => {
      state.longTpl = t.id;
      savePrefs();
      renderLongTpls();
      renderLongPals();
      renderLongBgUI();   // 换模板要同步背景图可用性（§12.2 六套可用/六套禁用）
    });
    box.appendChild(b);
  }
}

/* 右栏：8 套色板。模板锁配色时置灰 + 提示（design §12.1 方案 C 的交互内核）。
   ⚠️ 不能复用 .cv-dot —— 门禁「配色数」按 .cv-dot 全量计数，混进去会翻车（实测踩过）。 */
function renderLongPals() {
  const box = $('cv-lpals');
  if (!box) return;
  const tpl = currentLongTpl();
  const locked = !!tpl.palette;
  box.textContent = '';
  for (const p of PALETTES) {
    const d = document.createElement('button');
    d.type = 'button';
    d.className = 'cv-lpal';
    d.dataset.pal = p.key;
    d.title = `${p.name} · ${p.ds}`;
    d.setAttribute('aria-label', `长文色板 ${p.name}`);
    d.setAttribute('aria-pressed', String(!locked && state.palKey === p.key));
    d.disabled = locked;
    d.style.background = `linear-gradient(135deg, ${p.paper} 0 52%, ${p.accent} 52% 100%)`;
    d.addEventListener('click', () => {
      if (d.disabled) return;
      state.palKey = p.key;
      savePrefs();
      renderLongPals();
    });
    box.appendChild(d);
  }
  const hint = $('cv-lpal-hint');
  const lock = $('cv-lpal-lock');
  if (hint) hint.hidden = locked;
  if (lock) {
    lock.hidden = !locked;
    if (locked) lock.textContent = `${tpl.name} · 自带配色，色板不参与`;
  }
}

function updateLongCount() {
  const t = $('cv-long-text');
  const c = $('cv-long-count');
  if (t && c) c.textContent = `${t.value.length} 字`;
}

/* 内页背景图 UI 状态（§12.2）：可用/禁用模板 + 是否已选图 */
function renderLongBgUI() {
  const tpl = currentLongTpl();
  const ok = tplSupportsBg(tpl.id);
  const pick = $('cv-longbg-pick');
  const hint = $('cv-longbg-hint');
  const lock = $('cv-longbg-lock');
  const clear = $('cv-longbg-clear');
  const cover = $('cv-longbg-cover');
  if (pick) {
    pick.classList.toggle('cv-disabled', !ok);
    const inp = $('cv-longbg-file');
    if (inp) inp.disabled = !ok;
  }
  if (hint) {
    hint.textContent = ok
      ? (state.longBg ? '已开启 · 85% 纸色蒙层' : '默认关')
      : '这套模板自带背景';
  }
  if (lock) {
    lock.hidden = ok;
    if (!ok) lock.textContent = `${tpl.name} 自带完整背景体系（照片框/光晕/遮幅等），铺图会毁掉模板语义`;
  }
  if (clear) clear.hidden = !ok || !state.longBg;
  /* 「复用封面那张」= 复用本模块 ②里刚配的封面底图（同源更整，少一次上传） */
  if (cover) cover.hidden = !ok || !state.longImage || !!state.longBg;
}

/* ── 整套生成（2026-10-31 按 design §9 重做：cards.js 分页，一套模板管整套）── */
async function generateStory() {
  if (state.busy) return;
  const full = $('cv-long-text').value.trim();
  if (full.length < 2) { toast('先把文章粘到上面（第一行作封面标题）', 'err'); return; }
  const { title, lead } = extractStory(full);
  if (!title) { toast('第一行要有一个标题', 'err'); return; }

  /* 正文 = 去掉标题行之后的全部内容（与旧口径一致：第一行作标题） */
  const body = full.split(/\r?\n/).slice(1).join('\n').trim();

  state.busy = true;
  const btn = $('cv-gen-story');
  if (btn) btn.disabled = true;
  // 整套生成前清空旧结果：否则会和上一次的混在一起，分不清哪套是哪套
  state.results = [];
  setStatus('正在生成整套图文…');
  try {
    const set = await buildStorySet({
      title,
      lead,
      body,
      author: state.longSign,          // 开篇署名 + 结尾 CTA 用「签名」（模块内一个概念贯通）
      image: state.longImage || '',
      longTpl: state.longTpl,
      palKey: state.palKey,
      pn: state.longPn,
      sign: state.longSign,
      bg: state.longBg,
    });

    for (const r of set) {
      const url = URL.createObjectURL(r.blob);
      state.results.push({
        ...r, url, size: 'xhs',
        style: 'story-' + state.longTpl,
      });
    }
    renderStoryResults();
    // 生成过整套才显示「打包整套」
    const zipBtn = $('cv-zip-story');
    if (zipBtn) zipBtn.hidden = false;
    const truncated = set.truncated || 0;
    setStatus(`整套 ${set.length} 张已生成（1 封面 + ${set.length - 1} 内页）`
      + (truncated ? ` · 已截断 ${truncated} 字` : ''));
    toast(`整套 ${set.length} 张已生成`, 'ok');
  } catch (err) {
    setStatus(String(err.message || err), true);
    toast(String(err.message || err), 'err');
  } finally {
    state.busy = false;
    if (btn) btn.disabled = false;
  }
}

/** 整套打包下载（复用九宫格的 ZIP 实现，不重写）。 */
async function downloadStoryZip() {
  /* ⚠️ 不过滤 role：cards.js 重写后内页角色是 opening/dense/points/quote/closing，
     旧 story.js 时代的 'inner' 已不存在——原过滤条件会把内页全滤掉，
     ZIP 里只剩封面 1 张（qa_story 实测暴露）。state.results 本就只装整套结果。 */
  const set = state.results;
  if (!set.length) { toast('先点「导出一整套」生成', 'err'); return; }
  try {
    const tiles = set.map((r, i) => ({
      name: `${String(i + 1).padStart(2, '0')}-${r.role === 'cover' ? '封面' : '内页' + r.index}.png`,
      blob: r.blob,
    }));
    const r = await zipTiles(tiles, '小红书整套');
    toast(`已打包 ${tiles.length} 张：${r.filename}`, 'ok');
  } catch (err) {
    toast(String(err.message || err), 'err');
  }
}

/* 本模块自己的结果区（与标题图画廊分家；§2 S3 消除混居） */
function renderStoryResults() {
  const gal = $('lf-gallery');
  const empty = $('lf-empty');
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
    img.alt = r.label || '';
    img.addEventListener('click', () => openLightbox(r.url));
    const foot = document.createElement('figcaption');
    foot.className = 'cv-card-foot';
    const label = document.createElement('span');
    label.className = 'cv-card-label';
    /* 整套的结果标清「封面 / 内页 N」+ 模板名，一屏多张分得清 */
    label.textContent = `${r.label} · ${tplById(state.longTpl).name}`;
    label.title = label.textContent;
    const acts = document.createElement('div');
    acts.className = 'cv-card-acts';
    const dl = document.createElement('a');
    dl.className = 'cv-dl';
    dl.href = r.url;
    dl.download = `supersu-longform-${state.longTpl}-${String(r.index + 1).padStart(2, '0')}.png`;
    dl.textContent = '下载';
    acts.append(dl);
    foot.append(label, acts);
    fig.append(img, foot);
    gal.appendChild(fig);
  }
}

/* ── 整套实时预览：buildLong 分页 → 卡片 DOM → 横滑 deck ──
   正常态自检静默（ux-spec C2），只有空态（友好提示）与异常（未落版/截断）才显示。 */
let longSeq = 0;

async function updateLongPreview() {
  if (!root || root.hidden) return;   // 页不可见时不做无用功
  const seq = ++longSeq;
  await ensureCardsEnv(BASE);
  if (seq !== longSeq) return;

  const full = $('cv-long-text').value;
  const { title, lead } = extractStory(full);
  const body = full.split(/\r?\n/).slice(1).join('\n').trim();
  const tpl = currentLongTpl();
  const pal = currentLongPal();

  let pages = [];
  try {
    pages = buildLong(body, { tpl, pal });
  } catch { pages = []; }
  if (seq !== longSeq) return;
  const truncated = pages.truncated || 0;
  const total = pages.length + 1;   // + 封面
  const scale = 255 / 1080;

  const deck = $('cv-deck');
  if (deck) {
    const cards = [{ role: 'cover', blocks: [] }, ...pages];
    deck.innerHTML = cards.map((p, i) => `
      <figure class="cv-slot">
        <div class="cv-slot-zoom" style="width:${Math.round(1080 * scale)}px;height:${Math.round(1440 * scale)}px">
          <div class="cv-slot-inner" style="transform:scale(${scale})">${cardInner({
            role: p.role, blocks: p.blocks || [], tpl, pal,
            index: i, total,
            title, sub: lead, author: state.longSign,
            image: p.role === 'cover' ? (state.longImage || '') : '',
            pn: state.longPn, sign: state.longSign, bg: state.longBg,
          })}</div>
        </div>
        <figcaption class="cv-slot-cap">
          <span class="cv-slot-role">${ROLES[p.role] ? ROLES[p.role].label : p.role}</span>
          <span class="cv-slot-pn">P${String(i + 1).padStart(2, '0')}</span>
        </figcaption>
      </figure>`).join('');
    /* 单页超高的兜底（polaroid 这类内容区矮的模板）：渲染完才能量，放这里 */
    fitOverflowCards(document.getElementById('cv-cards-root'));
  }

  const genBtn = $('cv-gen-story');
  if (genBtn && !genBtn.disabled) {
    genBtn.innerHTML = `导出一整套 <small>${total} 张 PNG</small>`;
  }

  /* ── 产物自检（逐句落版）：异常才显示，正常态静默（C2）── */
  const sc = $('cv-selfcheck');
  if (sc) {
    const blank = !body.trim();
    let missing = 0;
    let pieces = 0;
    if (!blank && deck) {
      const norm = (s) => String(s || '').replace(/\s+/g, '');
      const out = norm(deck.textContent);
      const piecesArr = [];
      splitLongParas(parseBlocks(body)).forEach((b) => {
        if (!b.text || b.type === 'pagebreak') return;
        if (b.text.length > 60) {
          b.text.split(/(?<=[。！？!?；;])/).forEach((s) => {
            if (norm(s).length > 8) piecesArr.push(s);
          });
        } else piecesArr.push(b.text);
      });
      pieces = piecesArr.length;
      missing = piecesArr.filter((s) => !out.includes(norm(s))).length;
    }
    const roles = [...new Set(['cover', ...pages.map((p) => p.role)])]
      .map((r) => (ROLES[r] ? ROLES[r].label : r)).join('·');
    if (blank) {
      sc.hidden = false;
      sc.className = 'cv-selfcheck';
      sc.innerHTML = '<b>还没有正文</b> · 把文章粘到上面，这里会自动分页成一套图文';
    } else if (missing > 0 || truncated > 0) {
      sc.hidden = false;
      sc.className = 'cv-selfcheck bad';
      sc.innerHTML = `<b>✗ 产物自检</b> · ${missing}/${pieces} 句未落版`
        + (truncated ? ` · 已截断 ${truncated} 字` : '')
        + (pages.manualBreaks ? ` · 手动分页符 ${pages.manualBreaks} 处` : '');
    } else {
      sc.hidden = true;   // 正常态静默（C2）
      console.info(`[longform] ${total} 页 · ${roles} · ${pieces} 句全部落版`
        + (truncated ? ` · 截断 ${truncated} 字` : '')
        + (pages.manualBreaks ? ` · 手动分页符 ${pages.manualBreaks} 处` : ''));
    }
  }
}

let pvTimer = 0;
function schedulePreview(delay = 300) {
  clearTimeout(pvTimer);
  pvTimer = setTimeout(() => { updateLongPreview(); }, delay);
}

/* ── 挂载 ── */
let root = null;

export function mountLongformPage(rootEl) {
  root = rootEl;
  if (!root) return;
  root.innerHTML = `
    <main class="cv-stage">
      <aside class="cv-col cv-col-left">
        <!-- R5 定稿顺序：① 整篇文章在最顶（主输入是文章）→ ② 封面配图 → 导出 -->
        <section class="cv-sec">
          <div class="cv-sec-head"><span class="cv-sec-title">① 整篇文章</span><button class="cv-mini-btn" id="cv-use-long" type="button">用正文</button></div>
          <textarea class="cv-text cv-long-text" id="cv-long-text"
                    placeholder="把文章粘到这里，右侧会实时分页成一套图文。&#10;第一行会作封面标题；「---」单独成行可强制分页。"></textarea>
          <span class="cv-count" id="cv-long-count">0 字</span>
        </section>
        <section class="cv-sec">
          <div class="cv-sec-head"><span class="cv-sec-title">② 封面配图</span><span class="cv-hint">给整套的封面用</span></div>
          <div class="cv-modes cv-modes-big" id="cv-lf-modes">
            <button class="cv-mode cv-mode-big" type="button" data-mode="search">
              <b>搜一张好图</b><span>联网找真图 · 特色</span>
            </button>
            <button class="cv-mode cv-mode-big" type="button" data-mode="upload">
              <b>传一张</b><span>用自己的图</span>
            </button>
            <button class="cv-mode cv-mode-big" type="button" data-mode="color">
              <b>不要图</b><span>纯色封面</span>
            </button>
          </div>
          <div class="cv-bg-body" id="cv-lf-bg-body"></div>
          <div id="cv-lf-bg-preview"></div>
        </section>
        <section class="cv-sec">
          <button class="cv-gen" id="cv-gen-story" type="button"
                  title="封面 + 内页一次出齐，正文自动分页（竞品共识：一套模板管整套）">导出一整套 <small>2 张 PNG</small></button>
          <button class="cv-gen cv-gen--soft cv-zip-story-btn" id="cv-zip-story" type="button" hidden
                  title="把整套（封面+内页）打包成 ZIP">打包整套 ZIP</button>
          <div class="cv-status" id="cv-status-long"></div>
        </section>
      </aside>

      <section class="cv-col cv-col-mid">
        <div class="cv-pv-head">
          <span class="cv-pv-title"><i class="cv-pv-dot"></i>整套实时预览</span>
          <span class="cv-pv-meta" id="cv-lf-pv-meta"></span>
        </div>
        <!-- 整套卡片横滑预览（cards.js 渲染，实测高度装箱分页）。
             #cv-cards-root 同时是 cards.js 度量宿主的挂载点（同源 CSS/字体）。 -->
        <div class="cv-long-stage">
          <div class="cv-deck-scroll" id="cv-cards-root">
            <div class="cv-deck-row" id="cv-deck"></div>
          </div>
          <div class="cv-selfcheck" id="cv-selfcheck" hidden></div>
        </div>
        <div class="cv-out-head">
          <span class="cv-out-title">整套图文结果</span>
          <span class="cv-out-sub">纯前端生成 · 内容不上传</span>
        </div>
        <div id="lf-gallery" class="cv-gallery" hidden></div>
        <div id="lf-empty" class="cv-empty">
          <b>一整篇，出一套图文</b>
          <span>上面粘文章（第一行作封面标题）、这里选模板和色板，预览就是成品；点「导出一整套」存 PNG，或「打包 ZIP」一次下载。</span>
        </div>
      </section>

      <aside class="cv-col cv-col-right">
        <section class="cv-sec">
          <div class="cv-sec-head"><span class="cv-sec-title">长文模板</span><span class="cv-hint">整套生效</span></div>
          <div class="cv-ltpls" id="cv-ltpls"></div>
          <div class="cv-sec-head cv-lpal-head"><span class="cv-sec-title">色板</span><span class="cv-hint" id="cv-lpal-hint"></span></div>
          <div class="cv-dots cv-lpals" id="cv-lpals"></div>
          <p class="cv-hint cv-lpal-lock" id="cv-lpal-lock" hidden></p>

          <!-- §12.7 版式选项：页码 / 签名 / 内页背景图 -->
          <div class="cv-sec-head cv-lopt-head"><span class="cv-sec-title">版式选项</span></div>
          <label class="cv-switch-row">
            <input type="checkbox" id="cv-long-pn" checked>
            <span>显示页码（各模板页脚，默认开）</span>
          </label>
          <div class="cv-sec-head cv-lopt-sub"><span class="cv-sec-title">签名</span><span class="cv-hint">页脚 · 开篇 · 结尾共用</span></div>
          <input class="cv-field" id="cv-long-sign" maxlength="16"
                 placeholder="例如：阿苏 · 显示在内页页脚" autocomplete="off">
          <div class="cv-sec-head cv-lopt-sub">
            <span class="cv-sec-title">内页背景图</span>
            <span class="cv-hint" id="cv-longbg-hint"></span>
          </div>
          <div class="cv-longbg" id="cv-longbg">
            <label class="cv-upload cv-upload-sm" id="cv-longbg-pick">
              选一张图<input type="file" id="cv-longbg-file" accept="image/*">
            </label>
            <button class="cv-mini-btn" type="button" id="cv-longbg-cover" hidden
                    title="复用上面配的封面底图">复用封面那张</button>
            <button class="cv-mini-btn" type="button" id="cv-longbg-clear" hidden>清除</button>
          </div>
          <p class="cv-hint cv-longbg-lock" id="cv-longbg-lock" hidden></p>
        </section>
      </aside>
    </main>
  `;

  loadPrefs();
  state.picker = createBgPicker({
    idp: 'lf',
    host: $('cv-lf-bg-body'),
    preview: $('cv-lf-bg-preview'),
    modesEl: $('cv-lf-modes'),
    keywordSource: () => ($('cv-long-text').value.split(/\r?\n/)[0] || ''),
    zoneOf: () => [0.55, 1.0],
    onStatus: setStatus,
    onChange: () => {
      state.longImage = state.picker.getState().image;
      schedulePreview(0);
    },
    onBusy: (b) => { const g = $('cv-gen-story'); if (g) g.disabled = b; },
  });

  renderLongTpls();
  renderLongPals();
  renderLongBgUI();
  state.picker.mount();
  /* 控件初值（含拆分前漏持久化的三开关，S6 修复） */
  if ($('cv-long-pn')) $('cv-long-pn').checked = state.longPn;
  if ($('cv-long-sign')) $('cv-long-sign').value = state.longSign;
  updateLongCount();

  /* 文章输入：实时分页预览 + 从第一行猜封面配图关键词 */
  $('cv-long-text').addEventListener('input', () => {
    updateLongCount();
    schedulePreview();
    const firstLine = $('cv-long-text').value.split(/\r?\n/)[0] || '';
    if (state.picker) state.picker.setQueryIfUntouched(extractStory(firstLine).title || firstLine);
  });
  $('cv-use-long').addEventListener('click', () => {
    const v = $('input').value.trim();
    if (!v) { toast('排版页还没有内容', 'err'); return; }
    $('cv-long-text').value = v;
    updateLongCount();
    schedulePreview(0);
  });
  /* §12.7 版式选项接线 */
  const pnCb = $('cv-long-pn');
  if (pnCb) pnCb.addEventListener('change', () => {
    state.longPn = pnCb.checked;
    savePrefs();
    schedulePreview(0);
  });
  const signInput = $('cv-long-sign');
  if (signInput) {
    let signTimer = 0;
    signInput.addEventListener('input', () => {
      clearTimeout(signTimer);
      signTimer = setTimeout(() => {
        state.longSign = signInput.value.trim().slice(0, 16);
        schedulePreview(0);
      }, 250);
    });
  }
  /* 内页背景图（§12.2）：上传 / 复用本模块封面底图 / 清除 */
  const bgFile = $('cv-longbg-file');
  if (bgFile) bgFile.addEventListener('change', async () => {
    const f = bgFile.files && bgFile.files[0];
    bgFile.value = '';
    if (!f) return;
    if (f.size > 12 * 1024 * 1024) { toast('图片太大（上限 12MB）', 'err'); return; }
    try {
      state.longBg = await fileToDataUrl(f);
      renderLongBgUI();
      schedulePreview(0);
    } catch (err) { toast(String(err.message || err), 'err'); }
  });
  const bgCover = $('cv-longbg-cover');
  if (bgCover) bgCover.addEventListener('click', () => {
    if (!state.longImage) { toast('上面还没有配封面底图', 'err'); return; }
    state.longBg = state.longImage;   // 复用封面那张：少一次上传，两图同源更整
    renderLongBgUI();
    schedulePreview(0);
  });
  const bgClear = $('cv-longbg-clear');
  if (bgClear) bgClear.addEventListener('click', () => {
    state.longBg = '';
    renderLongBgUI();
    schedulePreview(0);
  });
  $('cv-gen-story').addEventListener('click', generateStory);
  const zipBtn = $('cv-zip-story');
  if (zipBtn) zipBtn.addEventListener('click', downloadStoryZip);
}

/** 页面可见性切换时刷新（index.js showPage 调） */
export function onShowLongformPage() {
  if (!root || root.hidden) return;
  if (!$('cv-long-text').value.trim()) {
    const main = $('input').value.trim();
    if (main) { $('cv-long-text').value = main; updateLongCount(); }
  }
  /* 度量环境（CSS + 封面字体）就绪后再出整套预览，行数才按真字体算 */
  ensureCardsEnv(BASE).then(() => schedulePreview(0));
}
