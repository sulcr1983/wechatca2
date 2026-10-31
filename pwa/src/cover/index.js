/* PWA 封面页：文案 / 风格 / 尺寸 / 底图 / 生成 / 画廊 / 下载长按。
 * 纯前端：不传内容、不依赖后端；底图可选纯色、上传、联网搜图（Pexels，BYOK）。
 */

import { ALL_STYLES, GUIZANG_STYLES, TEMPLATE_STYLES, LAYOUTS, COVER_SIZES, styleById, layoutOfStyle } from './catalog.js';
import { renderCoverBlob, buildCoverHtml } from './render.js';
import { analyzeImage } from './analyze.js';
import { buildStorySet } from './story.js';
import { LONG_TPLS, PALETTES, tplById, paletteByKey, buildLong, cardInner, fitOverflowCards,
  ensureCardsEnv, ROLES, parseBlocks, splitLongParas, tplSupportsBg, BG_TPL_IDS } from './cards.js';
import { TEXT_MODES, TEXT_FONTS } from './textmode.js';
import { searchBackground, fetchImageDataUrl, autoKeyword, getStockKeys } from './search.js';
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
  /* 搜图翻页（2026-10-30）：Pexels 支持 page/per_page，一次 12 张 */
  searchPage: 1,
  searchHasNext: false,
  searchTotal: 0,
  busy: false,
  results: [],
  /* 每张版式卡各自记住上次选的色板（2026-10-29）：
     切走再切回来不应该把颜色丢掉，否则「换版式保留同名色调」的直觉就断了。 */
  layoutPick: {},
  /* 底图可读性（2026-10-30）：选图时算一次并缓存，预览/生成都复用，
     避免每帧都跑 canvas 分析（10 条带 × 采样，虽快但没必要反复跑）。 */
  analysis: null,
  textPos: 'auto',        // auto | top | center | bottom（用户微调）
  frosted: false,         // 文字区磨砂，默认关
  /* ── 双路径（2026-10-31 design §9）── */
  path: 'cover',          // cover 标题图 | long 长文图文
  longTpl: 'editorial',   // 长文模板（12 选 1，整套生效，design §6.0.1）
  palKey: 'dune',         // 长文色板 key（模板锁配色时忽略）
  kwTouched: false,       // 用户手改过搜图关键词 → 不再自动覆盖（ux-spec §8.9）
  /* ── §12.7 四项增强 ── */
  longPn: true,           // 显示页码（默认开 = 现状心智，design §12.5）
  longSign: '',           // 签名（空 = 关；非空则每张内页页脚追加 @签名，§12.4）
  longBg: '',             // 内页背景图 dataURL（空 = 纯色；§12.2）
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
  /* 双路径各有状态位：两个都写，哪个可见显示哪个（测试读 #cv-status） */
  for (const id of ['cv-status', 'cv-status-long']) {
    const el = $(id);
    if (!el) continue;
    el.textContent = msg || '';
    el.classList.toggle('err', !!isErr);
  }
}

/* ── 文案提取（与本地版 _extract_story 同口径） ── */
/* 从输入框文本抽出「标题 + 引语」。
   ⚠️ 2026-10-30 修（实测踩到）：原来引语取「第 2、3 行」，
   而正文里如果第 3 行是列表项「1. 早点睡」，引语就会变成
   「两天的沉默之后，我重新听见了海浪。 · 1. 早点睡，别熬到两点」——
   封面上看起来像文案串了。
   现在：引语只在**第一个列表项之前**取，遇到列表就停。 */
function extractStory(text) {
  const lines = String(text).split(/\r?\n/).map((l) => l.trim()).filter(Boolean);
  const title = (lines[0] || '').replace(/^#{1,6}\s*/, '').slice(0, 64).trim();
  const rest = lines.slice(1);
  // 遇到列表项就停（列表项归内页，不进封面副标）
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
  /* 长文路径首次打开也带一次正文（不截 500：长文本就为一整篇而生） */
  if (!$('cv-long-text').value.trim()) {
    const main = $('input').value.trim();
    if (main) { $('cv-long-text').value = main; updateLongCount(); }
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
  if (!ALL_STYLES.some((s) => s.id === id)) return;
  const meta = styleById(id);
  const prevZone = JSON.stringify(zoneForStyle(state.style));
  state.style = id;
  state.layoutPick[meta.layout] = id;
  if (!meta.sizes.includes(state.size)) state.size = meta.sizes[0];
  savePrefs();
  renderStyles();
  renderSizes();
  /* 版式切换会改变文字区域（大字报居中 vs 其他贴底），
     分析结果要跟着重算，否则 scrim 会压错地方（2026-10-30）。 */
  if (state.image && prevZone !== JSON.stringify(zoneForStyle(id))) {
    refreshAnalysis(state.image).then(() => {
      renderBgPreview();
      schedulePreview(0);
    });
  }
}

/** 当前 styleId 是否为 3:4 专属（只用于给卡片打角标） */
function onlyXhs(meta) {
  return meta.sizes.length === 1;
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

/* 版式卡（2026-10-29 改版）
 *
 * 改版原因：原来是「一个色板一张卡」，13 张里 10 张同结构换色，
 * 用户在 130px 宽的卡上根本看不出差别，判定「模板都一样/都丢了」。
 *
 * 现在：卡片身份 = 版式（结构不同），卡内一排小圆点 = 色板。
 *   - 点缩略图 → 选中该卡当前色
 *   - 点色点   → 在同一版式内换色（换 styleId），不重建 DOM 之外的东西
 *   - 每张卡各自记住上次选的色（state.layoutPick），切走再切回来不丢
 */
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

    // 缩略图 = 按钮（点它 = 选中这张卡的当前色）
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

    // 名称 + 当前色名
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

    // 色点（只有多色的卡才显示）
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
    /* 2026-10-30：此前上传区只有一个「选择图片」按钮，没有任何说明。
       用户很自然会上传「已经排好版的成品封面 / 截图 / 海报」，
       那些图本身带文字，叠上标题后会严重重叠、出现糊字（实测踩到）。
       封面引擎的设计前提是「底图是一张照片」，这个前提必须写在界面上。 */
    const tip = document.createElement('p');
    tip.className = 'cv-hint';
    tip.textContent = '建议用不带文字的纯照片；带文字的成品图（截图 / 海报）会和标题叠在一起。';
    body.appendChild(tip);
  } else {
    const row = document.createElement('div');
    row.className = 'cv-search-row';
    const q = document.createElement('input');
    q.className = 'cv-field';
    q.id = 'cv-q';
    q.placeholder = '关键词，如 beach / 咖啡';
    q.value = state.searchQuery || autoKeyword($('cv-text').value).query;
    const btn = document.createElement('button');
    btn.className = 'cv-search-btn';
    btn.id = 'cv-search';
    btn.textContent = '搜索';
    /* ⚠️ 必须包一层：doSearch 现在第一个参数是 page（翻页用），
       直接 addEventListener('click', doSearch) 会把 PointerEvent 当 page 传进去，
       实测页码变成「第 [object PointerEvent] 页」。 */
    btn.addEventListener('click', () => doSearch(1));
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
    await refreshAnalysis(data);        // 2026-10-30：上传图同样分析，不只搜图
    renderBgPreview();
    /* ⚠️ 2026-10-30 修（用户实测反馈）：这里原来只调 renderBgPreview()，
       那是「左栏那张小缩略图」，**主预览 iframe 不会刷新**。
       结果：先选版式再上传图 → 预览里根本没有图，用户以为「图没跟上」；
       而之后随便切一下版式图又出现了（因为切版式走 savePrefs → schedulePreview）。
       凡是改 state.image 的地方都必须显式刷新主预览。 */
    schedulePreview(0);
    const a = state.analysis;
    setStatus(a
      ? `底图已选（本地上传）· 文字对比度 ${a.worstContrast.toFixed(1)}:1${a.unfit ? '（遮罩救不回来，建议换图）' : (a.needsTint ? '（已补淡遮罩）' : '')}`
      : '底图已选（本地上传）');
  } catch (err) {
    toast(String(err.message || err), 'err');
  }
}

/* 搜图 + 翻页（2026-10-30 加翻页，用户反馈「只有几张、没有上一页下一页」）
   每页 12 张（3 列 × 4 行），底部给「上一页 / 第 N 页 / 下一页」。 */
async function doSearch(page = 1) {
  /* 防御：page 必须是正整数。上面 btn 的 click 已包一层传 1，
     但万一别处再直接挂 doSearch，事件对象会混进来（实测出现过
     「第 [object PointerEvent] 页」）。这里统一归一化。 */
  const pageNo = Number.isFinite(+page) && +page > 0 ? Math.floor(+page) : 1;
  const q = ($('cv-q')?.value || '').trim();
  if (!q) { toast('先填一个关键词', 'err'); return; }
  const btn = $('cv-search');
  if (btn) btn.disabled = true;
  state.searchQuery = q;
  if (pageNo === 1) {
    state.candidates = [];
    state.searchPage = 1;
    state.searchHasNext = false;
    renderCandidates();
  }
  setStatus(pageNo > 1 ? `正在翻到第 ${pageNo} 页…` : '正在搜图…（Pexels）');
  try {
    const r = await searchBackground(q, { limit: 12, page: pageNo });
    state.candidates = r.items;
    state.searchPage = r.page || pageNo;
    state.searchHasNext = !!r.hasNext;
    state.searchTotal = r.total || 0;
    renderCandidates();
    const total = r.total ? `（共 ${r.total} 张）` : '';
    setStatus(r.items.length
      ? `第 ${state.searchPage} 页 · ${r.items.length} 张${total}，点一张作底图`
      : '没有找到合适的图，换个关键词或改用上传');
  } catch (err) {
    if (pageNo === 1) state.candidates = [];
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
  renderPager();
}

/* 翻页控件（2026-10-30）：只在搜到结果时出现。
   用户反馈「只有几张图、没有上一页下一页」——Pexels 官方支持 page 参数，
   一次 12 张（3×4），底部给上一页/下一页 + 当前页与总数。 */
function renderPager() {
  const host = $('cv-cands');
  if (!host) return;
  const old = $('cv-pager');
  if (old) old.remove();
  if (!state.candidates.length) return;

  const bar = document.createElement('div');
  bar.className = 'cv-pager';
  bar.id = 'cv-pager';

  const prev = document.createElement('button');
  prev.type = 'button';
  prev.className = 'cv-pager-btn';
  prev.textContent = '上一页';
  prev.disabled = state.searchPage <= 1;
  prev.addEventListener('click', () => doSearch(state.searchPage - 1));

  const label = document.createElement('span');
  label.className = 'cv-pager-label';
  const total = state.searchTotal ? ` / 共 ${state.searchTotal} 张` : '';
  label.textContent = `第 ${state.searchPage} 页${total}`;

  const next = document.createElement('button');
  next.type = 'button';
  next.className = 'cv-pager-btn';
  next.textContent = '下一页';
  next.disabled = !state.searchHasNext;
  next.addEventListener('click', () => doSearch(state.searchPage + 1));

  bar.append(prev, label, next);
  host.after(bar);
}

async function pickCandidate(it) {
  const btn = $('cv-gen');
  if (btn) btn.disabled = true;
  // 先清掉旧底图，避免下载还没完成用户就点生成、误用上一张图
  state.image = '';
  state.imageMeta = null;
  state.analysis = null;
  renderBgPreview();
  setStatus('正在下载底图…');
  try {
    const data = await fetchImageDataUrl(it.url);
    state.image = data;
    state.imageMeta = it;
    await refreshAnalysis(data);        // 2026-10-30：选图即分析，预览立刻用上
    renderCandidates();
    renderBgPreview();
    schedulePreview(0);                 // 同上：必须显式刷新主预览
    const a = state.analysis;
    setStatus(a
      ? `底图已选（Pexels）· 文字对比度 ${a.worstContrast.toFixed(1)}:1${a.unfit ? '（遮罩救不回来，建议换图）' : (a.needsTint ? '（已补淡遮罩）' : '')}`
      : '底图已选（Pexels）');
  } catch (err) {
    setStatus(String(err.message || err), true);
    toast(String(err.message || err), 'err');
  } finally {
    if (btn) btn.disabled = false;
  }
}

/* 底图可读性分析（2026-10-30）：把 analyze.js 的结论存进 state，
   预览和生成都会用它决定字色与 scrim。分析失败不阻断出图，只是退回原行为。

   zone = 文字真实占据的纵向范围，**按版式给**（2026-10-30 修）：
   · 大多数版式是「贴底排版」→ 底部 45%
   · 大字报是「垂直居中」→ 中间 50%（原来一律用 0.55–1.0，遮罩会压错地方） */
const ZONE_BY_STYLE = {
  bigtype: [0.28, 0.82],
};

function zoneForStyle(styleId) {
  return ZONE_BY_STYLE[styleId] || [0.55, 1.0];
}

async function refreshAnalysis(dataUrl) {
  state.analysis = null;
  if (!dataUrl) return;
  try {
    state.analysis = await analyzeImage(dataUrl, { zone: zoneForStyle(state.style) });
  } catch {
    state.analysis = null;
  }
}

/* 文字位置/磨砂 UI 同步（2026-10-30） */
function syncTextPosUI() {
  document.querySelectorAll('#cv-textpos-row .cv-chip').forEach((b) => {
    b.setAttribute('aria-pressed', String(b.dataset.pos === state.textPos));
  });
  const hint = $('cv-textpos-hint');
  if (hint) {
    const a = state.analysis;
    if (state.textPos !== 'auto') {
      hint.textContent = '手动';
    } else if (a) {
      // 说清「自动」到底把文字放哪了，别让用户以为它没生效
      const z = a.zone || [0.55, 1];
      hint.textContent = `自动 · ${Math.round(z[0] * 100)}–${Math.round(z[1] * 100)}%`;
    } else {
      hint.textContent = '自动';
    }
  }
  const cb = $('cv-frosted');
  if (cb) cb.checked = !!state.frosted;
}

function renderBgPreview() {
  const box = $('cv-bg-preview');
  if (!box) return;
  box.textContent = '';
  /* 文字位置/磨砂面板只在有底图时出现（2026-10-30）：
     纯色模式下没有图可压字，这两项没有意义，露出来只会让人困惑。 */
  const posPanel = $('cv-textpos');
  if (posPanel) posPanel.hidden = !state.image;
  if (posPanel && state.image) syncTextPosUI();
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
  /* 可读性标记（2026-10-30）：选中的图才分析（不分析 12 张候选，成本太高）。
     达标绿 / 勉强黄 / 不达标红，并说清「文字会糊」还是「已自动补淡遮罩」。 */
  const a = state.analysis;
  if (a) {
    const tag = document.createElement('span');
    const c = a.worstContrast;
    const level = c >= 4.5 ? 'ok' : (c >= 3.0 ? 'warn' : 'bad');
    tag.className = `cv-read cv-read-${level}`;
    tag.textContent = a.unfit
      ? `文字压不住 ${c.toFixed(1)}:1`
      : (c >= 4.5
        ? `文字清晰 ${c.toFixed(1)}:1`
        : (c >= 3.0 ? `文字偏弱 ${c.toFixed(1)}:1` : `文字会糊 ${c.toFixed(1)}:1`));
    tag.title = a.unfit
      ? '这张图文字区太亮或太花，遮罩救不回来（强压会把照片变成灰雾）——建议换一张图'
      : a.needsTint
        ? '这张图文字区反差偏大，已自动在文字带补一层淡遮罩（峰值不超过规范上限）'
        : '这张图文字区本来就安静，没有加任何遮罩，照片保持原样';
    meta.appendChild(tag);
  }
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
    state.analysis = null;              // 2026-10-30：清了图就别留着旧分析
    renderBgPreview();
    schedulePreview(0);                 // 清了图预览也要回到纯色，别留着旧图
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
        analysis: state.analysis, textPos: state.textPos, frosted: state.frosted,
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

/* ── 整套图文（2026-10-31 按 design §9 重做，归入「长文图文」路径）──────
   分页与渲染走 cards.js（buildLong + 7 角色渲染器），一套模板管整套；
   旧的「封面版式 + 内页骨架轮换」模型已被竞品实证否定（research 文档 §5）。 */
async function generateStory() {
  if (state.busy) return;
  const full = $('cv-long-text').value.trim();
  if (full.length < 2) { toast('先把文章粘到左边（第一行作封面标题）', 'err'); return; }
  const { title, lead } = extractStory(full);
  if (!title) { toast('第一行要有一个标题', 'err'); return; }

  /* 正文 = 去掉标题行之后的全部内容（与旧口径一致：第一行作标题） */
  const body = full.split(/\r?\n/).slice(1).join('\n').trim();

  state.busy = true;
  const btn = $('cv-gen-story');
  if (btn) btn.disabled = true;
  // 整套生成前清空旧结果：否则会和上一次的单张封面混在一起，分不清哪套是哪套
  state.results = [];
  setStatus('正在生成整套图文…');
  try {
    const set = await buildStorySet({
      title,
      lead,
      body,
      author: $('cv-author').value.trim(),
      image: state.image || '',
      longTpl: state.longTpl,
      palKey: state.palKey,
      pn: state.longPn,
      sign: state.longSign,
      bg: state.longBg,
    });

    // 结果进同一个结果区，标记 role 以便卡片显示「封面/内页 N」
    for (const r of set) {
      const url = URL.createObjectURL(r.blob);
      state.results.push({
        ...r, url, size: 'xhs',
        style: 'story-' + state.longTpl,
      });
    }
    renderGallery();
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
  const set = state.results.filter((r) => r.role === 'cover' || r.role === 'inner');
  if (!set.length) { toast('先点「整套图文」生成', 'err'); return; }
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
    /* 整套图文的结果要标清「封面 / 内页 N」（2026-10-30），
       否则一屏 5 张卡片分不清哪张是封面。
       2026-10-31：整套改走长文模板（cards.js），标签带模板名；
       r.style 是 'story-<tplId>'，不在 catalog 里，不能再喂给 styleById。 */
    label.textContent = r.role
      ? `${r.label} · ${tplById(state.longTpl).name}`
      : `${COVER_SIZES[r.size].hint} · ${styleById(r.style).name}`;
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

/** 防抖调度一次预览。任何设置变化都应该走这里。
 *  双路径（2026-10-31）：长文路径调度整套卡片预览，标题图路径调度单张预览。 */
export function schedulePreview(delay = 300) {
  clearTimeout(pvTimer);
  pvTimer = setTimeout(() => {
    if (state.path === 'long') updateLongPreview(); else updatePreview();
  }, delay);
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
      analysis: state.analysis,
      textPos: state.textPos,
      frosted: state.frosted,
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
      layoutPick: state.layoutPick,
      textPos: state.textPos, frosted: state.frosted,
      author: $('cv-author')?.value || '',
      path: state.path, longTpl: state.longTpl, palKey: state.palKey,
    }));
  } catch { /* 隐私模式不阻断 */ }
  // 偏好一变（风格/尺寸/字体/玩法/署名都在这里收口）就刷新预览，
  // 这样任何选择都立刻可见，不用点生成（2026-10-27 三栏改版配套）
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
    if (p.path === 'cover' || p.path === 'long') state.path = p.path;
    if (LONG_TPLS.some((t) => t.id === p.longTpl)) state.longTpl = p.longTpl;
    if (PALETTES.some((x) => x.key === p.palKey)) state.palKey = p.palKey;
  } catch { /* 忽略损坏的偏好 */ }
}

function updateCount() {
  const t = $('cv-text');
  const c = $('cv-count');
  if (t && c) c.textContent = `${t.value.length} / 500`;
}

/* ── 双路径（2026-10-31 design §9）──────────────────────────────────
   标题图（一句话 → 一张图）与长文图文（一整篇 → 封面 + 内页成套）分开。
   「整套图文」从标题图页的并排按钮变成独立路径 —— §1 诊断的「标题图和
   长文混在一起」就是指旧的中栏四个出口。 */

function setPath(p) {
  if (p !== 'cover' && p !== 'long') return;
  state.path = p;
  const stage = document.querySelector('.cv-stage');
  if (stage) stage.dataset.path = p;
  document.querySelectorAll('.cv-path').forEach((b) => {
    b.setAttribute('aria-selected', String(b.dataset.path === p));
  });
  /* ⚠️ 两层都要切：CSS 的 [data-pane] 规则（display:none!important）管布局，
     但 DOM 里的 hidden 属性是 UA 级 display:none —— 只改 CSS 不改属性，
     长文面板永远出不来（实测踩过）。 */
  document.querySelectorAll('[data-pane]').forEach((el) => {
    el.hidden = el.dataset.pane !== p;
  });
  if (p === 'long') {
    // 度量环境（CSS + 封面字体）就绪后再出整套预览，行数才按真字体算
    ensureCardsEnv(new URL('../../', import.meta.url).href).then(() => schedulePreview(0));
  } else {
    schedulePreview(0);
  }
}

function currentLongTpl() {
  return tplById(state.longTpl);
}
function currentLongPal() {
  const tpl = currentLongTpl();
  return tpl.palette || paletteByKey(state.palKey);   // 模板锁配色时忽略用户色板
}

/** 右栏：12 套长文模板（整套生效，design §6.0.3） */
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
      renderLongBgUI();   // 换模板要同步背景图可用性（§12.2 6 套可用 / 6 套禁用）
    });
    box.appendChild(b);
  }
}

/** 右栏：8 套色板。模板锁配色时置灰 + 提示（design §12.1 方案 C 的交互内核） */
function renderLongPals() {
  const box = $('cv-lpals');
  if (!box) return;
  const tpl = currentLongTpl();
  const locked = !!tpl.palette;
  box.textContent = '';
  for (const p of PALETTES) {
    const d = document.createElement('button');
    d.type = 'button';
    /* ⚠️ 不能复用 .cv-dot —— 门禁「25 种配色 = 22 色点 + 3 单色卡」按 .cv-dot
       全量计数，长文色板混进去会变成 30 个（实测踩过）。独立类名，尺寸在 CSS 共享。 */
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

/** 内页背景图 UI 状态（§12.2）：可用/禁用模板 + 是否已选图 + 复用封面快捷项 */
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
  /* 「复用封面那张」只在有封面底图 + 模板支持时出现 */
  if (cover) cover.hidden = !ok || !state.image || !!state.longBg;
}

/** 长文路径的整套实时预览：buildLong 分页 → 卡片 DOM → 横滑 deck。
 *  正常态自检静默（ux-spec C2：产品 UI 不出现「产物自检」文案），
 *  只有空态（友好提示）与异常（未落版/截断）才显示。 */
async function updateLongPreview() {
  if (state.path !== 'long') return;
  if ($('cover-root') && $('cover-root').hidden) return;
  const seq = ++longSeq;
  await ensureCardsEnv(new URL('../../', import.meta.url).href);
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
  const author = ($('cv-author')?.value || '').trim();

  const deck = $('cv-deck');
  if (deck) {
    const cards = [{ role: 'cover', blocks: [] }, ...pages];
    deck.innerHTML = cards.map((p, i) => `
      <figure class="cv-slot">
        <div class="cv-slot-zoom" style="width:${Math.round(1080 * scale)}px;height:${Math.round(1440 * scale)}px">
          <div class="cv-slot-inner" style="transform:scale(${scale})">${cardInner({
            role: p.role, blocks: p.blocks || [], tpl, pal,
            index: i, total,
            title, sub: lead, author,
            image: p.role === 'cover' ? (state.image || '') : '',
            pn: state.longPn,
            sign: state.longSign,
            bg: state.longBg,
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

  /* ── 产物自检（逐句落版，比总字数准：渲染会加「— 署名」等装饰文字）── */
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
      sc.innerHTML = '<b>还没有正文</b> · 把文章粘到左边，这里会自动分页成一套图文';
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
let longSeq = 0;

/* ── 挂载 ── */
function mount() {
  const root = $('cover-root');
  if (!root) return;
  root.innerHTML = `
    <main class="cv-stage" data-path="cover">
      <!-- 路径切换（design §3/§9）：两条路径输入形态完全不同，选错要重来。
           tablist 语义 + aria-selected（ux-spec §5.4）。 -->
      <nav class="cv-pathbar" role="tablist" aria-label="封面路径">
        <button class="cv-path" type="button" role="tab" id="cv-path-cover" data-path="cover"
                aria-selected="true" aria-controls="cv-pane-cover">标题图</button>
        <button class="cv-path" type="button" role="tab" id="cv-path-long" data-path="long"
                aria-selected="false" aria-controls="cv-pane-long">长文图文</button>
      </nav>
      <!-- ── 三栏布局（原型 A，2026-10-27）────────────────────────────
           改版原因：原来是「4 个标签 + 结果区」，写文案、选风格、看效果
           分散在三个标签里，用户要先点「生成」才知道长什么样 ——
           试 12 个风格就要出 36 张废图、等 12 次。
           现在：左边写 → 中间实时看 → 右边挑，全程不点生成也能看到效果。 -->
      <aside class="cv-col cv-col-left">
        <!-- ── 路径 ①：标题图（一句话 → 一张图，design §3）───────────── -->
        <div class="cv-pane" id="cv-pane-cover" role="tabpanel" data-pane="cover">
          <section class="cv-sec">
            <div class="cv-sec-head"><span class="cv-sec-title">一句话，变成一张图</span><button class="cv-mini-btn" id="cv-use-main" type="button">用正文</button><span class="cv-count" id="cv-count">0 / 500</span></div>
            <textarea class="cv-text" id="cv-text" maxlength="500" placeholder="写个标题，比如「周末去了趟海边」&#10;第二行可作小字。也可以点右上「用正文」带入排版页的内容。"></textarea>
          </section>
          <section class="cv-sec">
            <div class="cv-sec-head"><span class="cv-sec-title">配图方式</span></div>
            <!-- 三按钮（design §3，不做成 chip）：搜图是特色功能必须置顶（R3 硬约束）。
                 保留 .cv-mode / data-mode 契约（renderBg 与门禁套件都认它）。 -->
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
          <!-- 高级设置抽屉（design §9「高级设置抽屉」）：默认值就能出图，
               这些是「想微调」才需要的 L2 项（ux-spec §2.2）。桌面默认展开。 -->
          <div class="cv-adv" id="cv-adv">
            <button class="cv-adv-head" id="cv-adv-head" type="button"
                    aria-expanded="true" aria-controls="cv-adv-body">⚙ 调整 · 字体 / 玩法 / 尺寸</button>
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
                <div class="cv-sec-head"><span class="cv-sec-title">尺寸</span><span class="cv-hint" id="cv-size-hint"></span></div>
                <div class="cv-size-row" id="cv-sizes"></div>
              </section>
            </div>
          </div>
        </div>

        <!-- ── 路径 ②：长文图文（一整篇 → 封面 + 内页成套，design §6）──── -->
        <div class="cv-pane" id="cv-pane-long" role="tabpanel" data-pane="long" hidden>
          <section class="cv-sec">
            <div class="cv-sec-head"><span class="cv-sec-title">整篇文章</span><button class="cv-mini-btn" id="cv-use-long" type="button">用正文</button></div>
            <textarea class="cv-text cv-long-text" id="cv-long-text"
                      placeholder="把文章粘到这里，右边会实时分页成一套图文。&#10;第一行会作封面标题；「---」单独成行当前按普通段落处理。"></textarea>
            <span class="cv-count" id="cv-long-count">0 字</span>
          </section>
          <section class="cv-sec">
            <button class="cv-gen" id="cv-gen-story" type="button"
                    title="封面 + 内页一次出齐，正文自动分页（竞品共识：一套模板管整套）">导出一整套 <small>2 张 PNG</small></button>
            <!-- 整套打包（2026-10-30）：只有生成过整套才显示 -->
            <button class="cv-gen cv-gen--soft cv-zip-story-btn" id="cv-zip-story" type="button" hidden
                    title="把整套（封面+内页）打包成 ZIP">打包整套 ZIP</button>
            <div class="cv-status" id="cv-status-long"></div>
          </section>
        </div>

        <!-- 署名：两条路径共用（封面署名 / 长文开篇签名与结尾 CTA），不放抽屉 ——
             藏在抽屉里切到长文路径就填不了（实测踩过）。 -->
        <section class="cv-sec">
          <div class="cv-sec-head"><span class="cv-sec-title">署名（可选）</span></div>
          <input class="cv-field" id="cv-author" maxlength="20" placeholder="例如：阿苏 · 两条路径共用" autocomplete="off">
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
        <!-- 路径 ①：单张实时预览 -->
        <div class="cv-preview-box" data-pane="cover">
          <div class="cv-preview-scaler" id="cv-preview"></div>
        </div>
        <!-- 路径 ②：整套卡片横滑预览（cards.js 渲染，实测高度装箱分页）。
             #cv-cards-root 同时是 cards.js 度量宿主的挂载点（同源 CSS/字体）。 -->
        <div class="cv-long-stage" id="cv-long-stage" data-pane="long" hidden>
          <div class="cv-deck-scroll" id="cv-cards-root">
            <div class="cv-deck-row" id="cv-deck"></div>
          </div>
          <div class="cv-selfcheck" id="cv-selfcheck" hidden></div>
        </div>
        <div class="cv-out-head" data-pane="cover">
          <span class="cv-out-title">标题图结果</span>
          <span class="cv-out-sub">纯前端生成 · 内容不上传</span>
        </div>
        <div class="cv-out-head" data-pane="long" hidden>
          <span class="cv-out-title">整套图文结果</span>
          <span class="cv-out-sub">纯前端生成 · 内容不上传</span>
        </div>
        <div id="cv-gallery" class="cv-gallery" hidden></div>
        <div id="cv-empty" class="cv-empty">
          <b>文案 + 风格 = 标题图</b>
          <span>左边写文案、右边选版式，预览就是成品；点「保存大图」存成 PNG。长文请切到「长文图文」路径。<br>归藏两套一次出 3 个尺寸，其余版式出 3:4。</span>
        </div>
        <!-- 示例成品墙（2026-10-29）：原来它埋在空态里，只有「一张都没生成」时才出现，
             而空态一生成就消失 → 电脑版预览下方那一大片空白永远是空的。
             现在独立成常驻区块：任何时候都能点一张看成品、直接套用该版式。 -->
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
        <!-- 路径 ①：风格卡（版式是 L1 审美选择，ux-spec §2.2 #21，不进抽屉） -->
        <section class="cv-sec" data-pane="cover">
          <div class="cv-sec-head"><span class="cv-sec-title">风格</span><span class="cv-hint" id="cv-style-hint"></span></div>
          <div id="cv-styles"></div>
        </section>
        <!-- 路径 ②：长文模板（12 选 1 整套生效）+ 色板（8 选 1） -->
        <section class="cv-sec" data-pane="long" hidden>
          <div class="cv-sec-head"><span class="cv-sec-title">长文模板</span><span class="cv-hint">整套生效</span></div>
          <div class="cv-ltpls" id="cv-ltpls"></div>
          <div class="cv-sec-head cv-lpal-head"><span class="cv-sec-title">色板</span><span class="cv-hint" id="cv-lpal-hint"></span></div>
          <div class="cv-dots cv-lpals" id="cv-lpals"></div>
          <p class="cv-hint cv-lpal-lock" id="cv-lpal-lock" hidden></p>

          <!-- §12.7 四项增强（design §12.2–§12.5）：页码 / 签名 / 内页背景图 -->
          <div class="cv-sec-head cv-lopt-head"><span class="cv-sec-title">版式选项</span></div>
          <label class="cv-switch-row">
            <input type="checkbox" id="cv-long-pn" checked>
            <span>显示页码（各模板页脚，默认开）</span>
          </label>
          <div class="cv-sec-head cv-lopt-sub"><span class="cv-sec-title">签名</span><span class="cv-hint">填了才显示</span></div>
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
                    title="复用封面已配的底图">复用封面那张</button>
            <button class="cv-mini-btn" type="button" id="cv-longbg-clear" hidden>清除</button>
          </div>
          <p class="cv-hint cv-longbg-lock" id="cv-longbg-lock" hidden></p>
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
  renderLongTpls();
  renderLongPals();
  renderLongBgUI();
  /* §12.7 控件初值：页码默认开、签名回填 */
  if ($('cv-long-pn')) $('cv-long-pn').checked = state.longPn;
  if ($('cv-long-sign')) $('cv-long-sign').value = state.longSign;
  initPreview();
  updateCount();
  updateLongCount();
  if ($('cv-author')) $('cv-author').addEventListener('input', savePrefs);
  $('cv-text').addEventListener('input', () => { updateCount(); schedulePreview(); });
  /* 关键词自动提取（design §9 / ux-spec C7）：标题自动填入，可改；
     用户手改过（kwTouched）就不再覆盖。 */
  $('cv-text').addEventListener('input', () => {
    if (state.mode === 'search' && $('cv-q') && !state.kwTouched) {
      const g = autoKeyword($('cv-text').value);
      if (g.query) $('cv-q').value = g.query;
    }
  });
  /* 双路径切换（design §9） */
  document.querySelectorAll('.cv-path').forEach((b) => {
    b.addEventListener('click', () => setPath(b.dataset.path));
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
  /* 长文路径输入：实时分页预览 */
  $('cv-long-text').addEventListener('input', () => {
    updateLongCount();
    schedulePreview();
  });
  $('cv-use-long').addEventListener('click', () => {
    const v = $('input').value.trim();
    if (!v) { toast('排版页还没有内容', 'err'); return; }
    $('cv-long-text').value = v;
    updateLongCount();
    schedulePreview(0);
  });
  /* 搜图关键词：用户手改后不再自动覆盖 */
  document.addEventListener('input', (e) => {
    if (e.target && e.target.id === 'cv-q') state.kwTouched = true;
  });

  /* ── §12.7 四项增强接线 ── */
  /* 页码开关（§12.5）：默认开；关掉只影响页脚页码，装饰数字/页眉不动 */
  const pnCb = $('cv-long-pn');
  if (pnCb) pnCb.addEventListener('change', () => {
    state.longPn = pnCb.checked;
    savePrefs();
    schedulePreview(0);
  });
  /* 签名（§12.4）：输入即渲染，沿用模板页脚色 */
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
  /* 内页背景图（§12.2）：上传 / 复用封面底图 / 清除 */
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
    if (!state.image) { toast('封面还没有底图', 'err'); return; }
    state.longBg = state.image;   // 复用封面那张：少一次上传，两图同源更整
    renderLongBgUI();
    schedulePreview(0);
  });
  const bgClear = $('cv-longbg-clear');
  if (bgClear) bgClear.addEventListener('click', () => {
    state.longBg = '';
    renderLongBgUI();
    schedulePreview(0);
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
    // 2026-10-29：卡片改成「版式卡 + 色点」后，示例图不再对应某个 .cv-style 按钮，
    // 直接按 styleId 选中（示例里的 editorial-midnight-ink 会落到「杂志模板」卡的第 6 个色点）。
    if (b.dataset.style) selectStyle(b.dataset.style);
    $('cv-text').focus();
    toast('已选好风格，写句文案试试');
  });
  document.querySelectorAll('.cv-mode').forEach((b) => {
    b.addEventListener('click', () => setMode(b.dataset.mode));
  });
  /* 整套图文（2026-10-30） */
  const storyBtn = $('cv-gen-story');
  if (storyBtn) storyBtn.addEventListener('click', generateStory);
  const zipBtn = $('cv-zip-story');
  if (zipBtn) zipBtn.addEventListener('click', downloadStoryZip);
  /* 文字位置三档 + 磨砂开关（2026-10-30）：改完立刻重绘预览，用户能马上看到差别 */
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

  /* 应用持久化的路径（loadPrefs 可能带来 'long'）；
     会同步 stage data-path、tab 高亮，并调度对应路径的预览。 */
  setPath(state.path);
}

mount();
