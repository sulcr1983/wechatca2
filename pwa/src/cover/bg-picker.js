/* 底图选择器工厂（2026-10-31 模块拆分）
 *
 * 为什么是工厂：标题图与长图长文成为两个独立页面后，**各自都要配图**
 * （标题图配封面底图；长图长文配整套的封面底图）。原来的 renderBg 系列是
 * 写死 #cv-bg-body 的单实例，拆成工厂让两个页面各持一份状态（候选图 /
 * 搜索词 / 可读性分析互不串台）。
 *
 * 与原实现的差异（迁自 index.js L377–750，行为保持）：
 *   · 内部元素 id 加前缀隔离（标题图 idp='' 保持 #cv-q 等旧契约——门禁套件认它；
 *     长图长文 idp='lf-'）
 *   · setStatus / schedulePreview / disable 主按钮 改为回调注入
 *   · zone（文字带范围）改为 zoneOf() 注入：标题图按版式（大字报居中），
 *     长图长文封面默认贴底
 */

import { searchBackground, fetchImageDataUrl, autoKeyword, getStockKeys } from './search.js';
import { analyzeImage } from './analyze.js';
import { toast } from './ui.js';

export function fileToDataUrl(file) {
  return new Promise((resolve, reject) => {
    const r = new FileReader();
    r.onload = () => resolve(r.result);
    r.onerror = () => reject(new Error('图片读取失败'));
    r.readAsDataURL(file);
  });
}

export function createBgPicker({
  idp = '',
  host,
  preview,
  modesEl,
  keywordSource = () => '',
  zoneOf = () => [0.55, 1.0],
  onStatus = () => {},
  onChange = () => {},
  onBusy = () => {},
  textPosPanel = null,
  onTextPosSync = () => {},
}) {
  const sid = (base) => `cv${idp ? '-' + idp : ''}-${base}`;
  const st = {
    mode: 'color',
    image: '',
    imageMeta: null,
    candidates: [],
    searchQuery: '',
    searchPage: 1,
    searchHasNext: false,
    searchTotal: 0,
    analysis: null,
    kwTouched: false,       // 用户手改过关键词 → 不再自动覆盖（ux-spec §8.9）
  };

  /* 底图可读性：zone = 文字真实占据的纵向范围，按调用方给的口径分析 */
  async function refreshAnalysis(dataUrl) {
    st.analysis = null;
    if (!dataUrl) return;
    try {
      st.analysis = await analyzeImage(dataUrl, { zone: zoneOf() });
    } catch {
      st.analysis = null;
    }
  }

  function renderBgPreview() {
    if (!preview) return;
    preview.textContent = '';
    /* 文字位置/磨砂面板只在有底图时出现（2026-10-30）：
       纯色模式下没有图可压字，这两项没有意义。 */
    if (textPosPanel) textPosPanel.hidden = !st.image;
    if (textPosPanel && st.image) onTextPosSync();
    if (!st.image) return;
    const wrap = document.createElement('div');
    wrap.className = 'cv-bg-preview';
    const img = document.createElement('img');
    img.src = st.image;
    img.alt = '当前底图';
    const meta = document.createElement('div');
    meta.className = 'cv-bg-meta';
    const title = document.createElement('b');
    const m = st.imageMeta || {};
    title.textContent = (m.title || '自定义底图').slice(0, 28);
    meta.appendChild(title);
    const by = [m.author, m.license].filter(Boolean).join(' · ');
    if (by) meta.appendChild(document.createTextNode(by));
    /* 可读性标记（2026-10-30）：达标绿 / 勉强黄 / 不达标红，说清会糊还是已补遮罩 */
    const a = st.analysis;
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
      a.textContent = '原图 ↗';   // 不写图源名：license 已含「Pexels License」，再写就重复
      meta.appendChild(document.createTextNode(' '));
      meta.appendChild(a);
    }
    const clr = document.createElement('button');
    clr.className = 'cv-clear';
    clr.type = 'button';
    clr.title = '清除底图';
    clr.textContent = '×';
    clr.addEventListener('click', () => {
      st.image = '';
      st.imageMeta = null;
      st.analysis = null;
      renderBgPreview();
      onChange();               // 清了图预览也要回到纯色
      onStatus('已清除底图');
    });
    wrap.append(img, meta, clr);
    preview.appendChild(wrap);
  }

  function renderCandidates() {
    const box = host.querySelector('#' + sid('cands'));
    if (!box) return;
    box.textContent = '';
    for (const it of st.candidates) {
      const b = document.createElement('button');
      b.className = 'cv-cand';
      b.title = `${it.title}\n${it.author || ''}${it.license ? ' · ' + it.license : ''}`;
      b.setAttribute('aria-pressed', String(!!st.imageMeta && st.imageMeta.pageUrl === it.pageUrl));
      const img = document.createElement('img');
      img.src = it.thumb || it.url;
      img.alt = it.title;
      img.loading = 'lazy';
      img.addEventListener('error', () => { if (img.src !== it.url) img.src = it.url; });
      img.addEventListener('load', () => b.classList.add('loaded'), { once: true });
      b.appendChild(img);
      b.addEventListener('click', () => pickCandidate(it));
      box.appendChild(b);
    }
    renderPager();
  }

  /* 翻页控件（2026-10-30）：只在搜到结果时出现，上一页/下一页 + 当前页与总数 */
  function renderPager() {
    const box = host.querySelector('#' + sid('cands'));
    if (!box) return;
    const old = host.querySelector('#' + sid('pager'));
    if (old) old.remove();
    if (!st.candidates.length) return;
    const bar = document.createElement('div');
    bar.className = 'cv-pager';
    bar.id = sid('pager');
    const prev = document.createElement('button');
    prev.type = 'button';
    prev.className = 'cv-pager-btn';
    prev.textContent = '上一页';
    prev.disabled = st.searchPage <= 1;
    prev.addEventListener('click', () => doSearch(st.searchPage - 1));
    const label = document.createElement('span');
    label.className = 'cv-pager-label';
    const total = st.searchTotal ? ` / 共 ${st.searchTotal} 张` : '';
    label.textContent = `第 ${st.searchPage} 页${total}`;
    const next = document.createElement('button');
    next.type = 'button';
    next.className = 'cv-pager-btn';
    next.textContent = '下一页';
    next.disabled = !st.searchHasNext;
    next.addEventListener('click', () => doSearch(st.searchPage + 1));
    bar.append(prev, label, next);
    box.after(bar);
  }

  async function doSearch(page = 1) {
    /* 防御：page 必须是正整数（click 事件对象混进来会变成「第 [object] 页」） */
    const pageNo = Number.isFinite(+page) && +page > 0 ? Math.floor(+page) : 1;
    const q = (host.querySelector('#' + sid('q'))?.value || '').trim();
    if (!q) { toast('先填一个关键词', 'err'); return; }
    const btn = host.querySelector('#' + sid('search'));
    if (btn) btn.disabled = true;
    st.searchQuery = q;
    if (pageNo === 1) {
      st.candidates = [];
      st.searchPage = 1;
      st.searchHasNext = false;
      renderCandidates();
    }
    onStatus(pageNo > 1 ? `正在翻到第 ${pageNo} 页…` : '正在搜图…（Pexels）');
    try {
      const r = await searchBackground(q, { limit: 12, page: pageNo });
      st.candidates = r.items;
      st.searchPage = r.page || pageNo;
      st.searchHasNext = !!r.hasNext;
      st.searchTotal = r.total || 0;
      renderCandidates();
      const total = r.total ? `（共 ${r.total} 张）` : '';
      onStatus(r.items.length
        ? `第 ${st.searchPage} 页 · ${r.items.length} 张${total}，点一张作底图`
        : '没有找到合适的图，换个关键词或改用上传');
    } catch (err) {
      if (pageNo === 1) st.candidates = [];
      renderCandidates();
      onStatus(String(err.message || err), true);
      toast(String(err.message || err), 'err');
    } finally {
      if (btn) btn.disabled = false;
    }
  }

  async function onFile(e) {
    const file = e.target.files?.[0];
    if (!file) return;
    if (file.size > 12 * 1024 * 1024) { toast('图片太大（上限 12MB）', 'err'); return; }
    try {
      const data = await fileToDataUrl(file);
      st.image = data;
      st.imageMeta = { title: file.name, author: '本地上传', license: '' };
      await refreshAnalysis(data);       // 上传图同样分析，不只搜图
      renderBgPreview();
      onChange();                        // ⚠️ 凡是改 image 的地方都必须显式刷主预览
      const a = st.analysis;
      onStatus(a
        ? `底图已选（本地上传）· 文字对比度 ${a.worstContrast.toFixed(1)}:1${a.unfit ? '（遮罩救不回来，建议换图）' : (a.needsTint ? '（已补淡遮罩）' : '')}`
        : '底图已选（本地上传）');
    } catch (err) {
      toast(String(err.message || err), 'err');
    }
  }

  async function pickCandidate(it) {
    onBusy(true);
    // 先清掉旧底图，避免下载还没完成用户就点生成、误用上一张图
    st.image = '';
    st.imageMeta = null;
    st.analysis = null;
    renderBgPreview();
    onStatus('正在下载底图…');
    try {
      const data = await fetchImageDataUrl(it.url);
      st.image = data;
      st.imageMeta = it;
      await refreshAnalysis(data);
      renderCandidates();
      renderBgPreview();
      onChange();
      const a = st.analysis;
      onStatus(a
        ? `底图已选（Pexels）· 文字对比度 ${a.worstContrast.toFixed(1)}:1${a.unfit ? '（遮罩救不回来，建议换图）' : (a.needsTint ? '（已补淡遮罩）' : '')}`
        : '底图已选（Pexels）');
    } catch (err) {
      onStatus(String(err.message || err), true);
      toast(String(err.message || err), 'err');
    } finally {
      onBusy(false);
    }
  }

  function renderPanel() {
    if (modesEl) {
      modesEl.querySelectorAll('.cv-mode').forEach((b) => {
        b.setAttribute('aria-pressed', String(b.dataset.mode === st.mode));
      });
    }
    if (!host) return;
    host.textContent = '';
    if (st.mode === 'color') {
      const p = document.createElement('p');
      p.className = 'cv-hint';
      p.textContent = '用模板纸色 / 归藏深色作底，不依赖网络与图片，最稳。';
      host.appendChild(p);
    } else if (st.mode === 'upload') {
      const label = document.createElement('label');
      label.className = 'cv-upload';
      label.textContent = '选择图片';
      const input = document.createElement('input');
      input.type = 'file';
      input.accept = 'image/*';
      input.id = sid('file');
      input.addEventListener('change', onFile);
      label.appendChild(input);
      host.appendChild(label);
      /* 带文字的成品图会和标题叠字（2026-10-30 实测），这个前提必须写在界面上 */
      const tip = document.createElement('p');
      tip.className = 'cv-hint';
      tip.textContent = '建议用不带文字的纯照片；带文字的成品图（截图 / 海报）会和标题叠在一起。';
      host.appendChild(tip);
    } else {
      const row = document.createElement('div');
      row.className = 'cv-search-row';
      const q = document.createElement('input');
      q.className = 'cv-field';
      q.id = sid('q');
      q.placeholder = '关键词，如 beach / 咖啡';
      q.value = st.searchQuery || autoKeyword(keywordSource()).query;
      q.addEventListener('input', () => { st.kwTouched = true; });
      const btn = document.createElement('button');
      btn.className = 'cv-search-btn';
      btn.id = sid('search');
      btn.textContent = '搜索';
      /* ⚠️ 必须包一层：doSearch 第一个参数是 page，直接挂 click 会把 PointerEvent 当页码 */
      btn.addEventListener('click', () => doSearch(1));
      row.append(q, btn);
      const grid = document.createElement('div');
      grid.className = 'cv-search-grid';
      grid.id = sid('cands');
      /* 图源状态条：只剩 Pexels 一家（Pixabay 不吃中文、Wikimedia 国内超时，均已移除） */
      const keys = getStockKeys();
      const stateRow = document.createElement('div');
      stateRow.className = 'cv-stock-state';
      const items = [['Pexels', !!keys.pexels]];
      stateRow.innerHTML = items.map(([n, ok]) =>
        `<span class="cv-stock-pill ${ok ? 'ok' : 'no'}">${n}${ok ? ' ✓' : ' 需 Key'}</span>`).join('');
      const setBtn = document.createElement('button');
      setBtn.type = 'button';
      setBtn.className = 'cv-stock-set';
      setBtn.textContent = keys.pexels ? '图库设置' : '填 Pexels Key（免费·2分钟）';
      setBtn.addEventListener('click', () => {
        document.getElementById('btn-ai')?.click();
        setTimeout(() => {
          const pex = document.getElementById('stock-pexels');
          pex?.scrollIntoView({ block: 'center', behavior: 'smooth' });
          pex?.focus();
          if (!keys.pexels) document.getElementById('stock-help')?.click();
        }, 260);
      });
      stateRow.appendChild(setBtn);
      const hint = document.createElement('p');
      hint.className = 'cv-hint';
      hint.style.marginTop = '8px';
      hint.textContent = keys.pexels
        ? '支持中文关键词（海边 / 咖啡 都行）；图片可商用、免署名。'
        : '联网搜图需要 Pexels Key（免费）。填一个就能用，支持中文关键词。';
      host.append(row, stateRow, grid, hint);
      renderCandidates();
    }
    renderBgPreview();
  }

  return {
    mount() { renderPanel(); },
    /* 版式切换会改变文字区域（大字报居中 vs 其他贴底），zone 变了要重算分析，
       否则 scrim 会压错地方（2026-10-30）。无图时静默。 */
    async reanalyze() {
      if (!st.image) return;
      await refreshAnalysis(st.image);
      renderBgPreview();
      onChange();
    },
    setMode(mode) { st.mode = mode; renderPanel(); onChange(); },
    /* 标题自动猜词：只在用户没手改过时覆盖（ux-spec C7） */
    setQueryIfUntouched(q) {
      if (st.kwTouched || !q) return;
      st.searchQuery = '';
      const input = host.querySelector('#' + sid('q'));
      if (input) input.value = q;
    },
    getState() { return { mode: st.mode, image: st.image, imageMeta: st.imageMeta, analysis: st.analysis }; },
  };
}
