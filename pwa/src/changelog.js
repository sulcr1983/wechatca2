/* SuperSu PWA · 更新记录面板
 *
 * 纯原生 ES module，无依赖、无构建。对外只导出 createChangelog 工厂。
 *
 * 几个关键取舍：
 * 1. DOM 只在 mount 时建一次，setData 重建一次；搜索/筛选只切 hidden 与 class，
 *    几百条条目也不会因为每次输入而重排整棵树。
 * 2. 所有提交正文、scope、hash 都走 textContent（createTextNode），不拼 innerHTML，
 *    防止提交信息里的 < > & 被当成标签注入。
 * 3. 事件全部 addEventListener。预览 iframe 带 sandbox，内联 on* 会被浏览器拦。
 * 4. 版本比较按「数字段比数字、非数字段比字符串」处理，1.10.0 才会大于 1.9.0。
 */

/* 类型 → 中文标签。仅当数据里 group 没带 label 时兜底。 */
const TYPE_LABELS = {
  added: '新增',
  changed: '调整',
  deprecated: '弃用',
  removed: '移除',
  fixed: '修复',
  security: '安全',
  other: '其他',
};

/* 固定展示顺序：chip 与分组都按这个顺序，避免类型顺序随数据抖动。 */
const TYPE_ORDER = ['added', 'changed', 'deprecated', 'removed', 'fixed', 'security', 'other'];

/* 把 "v1.2.3-beta.1" 拆成 [1,2,3,'beta',1]。
 * 预发布号按字符串比较，对更新记录这种场景足够了。 */
function parseVersion(v) {
  return String(v == null ? '' : v)
    .trim()
    .replace(/^v/i, '')
    .split(/[.\-+]/)
    .filter(Boolean)
    .map((part) => {
      // 只把纯十进制（无前导零）当数字，"01" 之类保持字符串，避免 01 与 1 混淆
      const n = Number(part);
      return Number.isInteger(n) && String(n) === part ? n : part;
    });
}

function cmpVersion(a, b) {
  const pa = parseVersion(a);
  const pb = parseVersion(b);
  const len = Math.max(pa.length, pb.length);
  for (let i = 0; i < len; i += 1) {
    const x = pa[i] === undefined ? 0 : pa[i];
    const y = pb[i] === undefined ? 0 : pb[i];
    if (typeof x === 'number' && typeof y === 'number') {
      if (x !== y) return x < y ? -1 : 1;
    } else {
      const sx = String(x);
      const sy = String(y);
      if (sx !== sy) return sx < sy ? -1 : 1;
    }
  }
  return 0;
}

/* 版本总计条数：优先数 groups 里的真实 items，退回 counts 求和。 */
function countEntries(rel) {
  if (!rel) return 0;
  if (Array.isArray(rel.groups)) {
    let n = 0;
    for (const g of rel.groups) {
      if (g && Array.isArray(g.items)) n += g.items.length;
    }
    return n;
  }
  if (rel.counts && typeof rel.counts === 'object') {
    return Object.values(rel.counts).reduce((sum, n) => sum + (Number(n) || 0), 0);
  }
  return 0;
}

/* generatedAt 直接按字面量格式化，不用 new Date()：
 * 后者会按浏览器时区换算，把后端给的 +08:00 时间显示成别的钟点。 */
function fmtTime(iso) {
  if (!iso) return '—';
  const m = String(iso).match(/^(\d{4})-(\d{2})-(\d{2})[T ](\d{2}):(\d{2})/);
  return m ? `${m[1]}-${m[2]}-${m[3]} ${m[4]}:${m[5]}` : String(iso);
}

function typeRank(type) {
  const i = TYPE_ORDER.indexOf(type);
  return i === -1 ? TYPE_ORDER.length : i;
}

export function createChangelog(options = {}) {
  const container = options.container || document.body;

  const state = {
    data: null,
    currentVersion: '',       // 当前运行的版本
    since: '',                // 用户上次看过的版本
    mode: 'browse',           // browse | update
    query: '',
    type: 'all',
    totalEntries: 0,          // 全量条目数，用来区分「没数据」和「搜不到」
    view: [],                 // [{ version, node, groups: [{ type, el, entries }] }]
    mounted: false,
    lastFocus: null,
  };

  const els = {};
  let searchTimer = 0;

  /* ── DOM 小工具 ─────────────────────────────────────────────── */
  function el(tag, className, text) {
    const node = document.createElement(tag);
    if (className) node.className = className;
    if (text !== undefined && text !== null) node.textContent = String(text);
    return node;
  }

  /* ── 构建骨架（只跑一次） ───────────────────────────────────── */
  function mount() {
    if (state.mounted) return;

    const layer = el('div');
    layer.id = 'cl-layer';
    layer.hidden = true;

    const mask = el('div');
    mask.id = 'cl-mask';

    const panel = el('aside');
    panel.id = 'cl-panel';
    panel.setAttribute('role', 'dialog');
    panel.setAttribute('aria-modal', 'true');
    panel.setAttribute('aria-label', '更新记录');
    panel.tabIndex = -1;

    /* 头部 */
    const head = el('header');
    head.id = 'cl-head';

    const titleWrap = el('div');
    titleWrap.id = 'cl-title-wrap';
    const title = el('h2', null, '更新记录');
    title.id = 'cl-title';
    const pill = el('span');
    pill.id = 'cl-version-pill';
    pill.hidden = true;
    titleWrap.append(title, pill);

    const closeBtn = el('button', null, '✕');
    closeBtn.id = 'cl-close';
    closeBtn.type = 'button';
    closeBtn.setAttribute('aria-label', '关闭更新记录');
    head.append(titleWrap, closeBtn);

    /* 工具条 */
    const toolbar = el('div');
    toolbar.id = 'cl-toolbar';
    const searchRow = el('div');
    searchRow.id = 'cl-search-row';
    const search = el('input');
    search.id = 'cl-search';
    search.type = 'search';
    search.placeholder = '搜版本、改动或 hash…';
    search.autocomplete = 'off';
    search.spellcheck = false;
    search.setAttribute('aria-label', '搜索更新记录');
    const count = el('span');
    count.id = 'cl-count';
    count.textContent = '共 0 条';
    searchRow.append(search, count);

    const chips = el('div');
    chips.id = 'cl-chips';
    chips.setAttribute('role', 'group');
    chips.setAttribute('aria-label', '按类型筛选');
    toolbar.append(searchRow, chips);

    /* 更新提示条（mode=update 或带了 since 时才有内容） */
    const banner = el('div');
    banner.id = 'cl-banner';
    banner.hidden = true;

    /* 滚动主体 */
    const scroll = el('div');
    scroll.id = 'cl-scroll';
    const timeline = el('div');
    timeline.id = 'cl-timeline';
    const empty = el('div');
    empty.id = 'cl-empty';
    empty.hidden = true;
    scroll.append(timeline, empty);

    /* 页脚 */
    const foot = el('footer');
    foot.id = 'cl-foot';

    panel.append(head, toolbar, banner, scroll, foot);
    layer.append(mask, panel);
    container.append(layer);

    els.layer = layer;
    els.mask = mask;
    els.panel = panel;
    els.pill = pill;
    els.close = closeBtn;
    els.search = search;
    els.count = count;
    els.chips = chips;
    els.banner = banner;
    els.scroll = scroll;
    els.timeline = timeline;
    els.empty = empty;
    els.foot = foot;

    /* 事件：全部显式监听，不用内联属性 */
    closeBtn.addEventListener('click', close);
    mask.addEventListener('click', close);
    search.addEventListener('input', onSearchInput);
    chips.addEventListener('click', onChipClick);

    state.mounted = true;

    // setData / setCurrentVersion 可能早于 mount，补一次渲染
    if (state.data) render();
    else markCurrent();
  }

  /* ── 搜索：120ms 防抖 ──────────────────────────────────────── */
  function onSearchInput() {
    window.clearTimeout(searchTimer);
    searchTimer = window.setTimeout(() => {
      state.query = els.search.value || '';
      applyFilter();
    }, 120);
  }

  function onChipClick(event) {
    const btn = event.target && event.target.closest
      ? event.target.closest('button[data-type]')
      : null;
    if (!btn || !els.chips.contains(btn)) return;
    setType(btn.dataset.type);
  }

  function setType(type) {
    state.type = type || 'all';
    syncChips();
    applyFilter();
  }

  function syncChips() {
    for (const btn of els.chips.children) {
      btn.setAttribute('aria-pressed', btn.dataset.type === state.type ? 'true' : 'false');
    }
  }

  /* ── 渲染数据 ──────────────────────────────────────────────── */
  function setData(data) {
    state.data = data && typeof data === 'object' ? data : null;
    if (state.mounted) render();
  }

  function render() {
    const data = state.data || {};
    const releases = Array.isArray(data.releases) ? data.releases.slice() : [];

    // 数据默认应已按新→旧排好；这里再排一次，避免调用方顺序不一致导致时间线错乱。
    releases.sort((a, b) => cmpVersion(b && b.version, a && a.version));

    state.view = [];
    state.totalEntries = 0;

    /* chips：按数据里真实出现过的 type 动态生成 */
    const labels = new Map();
    for (const rel of releases) {
      for (const g of (rel && rel.groups) || []) {
        if (!g || !g.type || !Array.isArray(g.items) || !g.items.length) continue;
        if (!labels.has(g.type)) labels.set(g.type, g.label || '');
      }
    }
    const types = [...labels.keys()].sort((a, b) => typeRank(a) - typeRank(b));

    // 数据换了之后，原来选中的类型可能已不存在，退回「全部」
    if (state.type !== 'all' && !labels.has(state.type)) state.type = 'all';
    renderChips(types, labels);

    /* 版本徽标：优先用 setCurrentVersion 的值，其次 data.version */
    const current = state.currentVersion || String(data.version || '');
    els.pill.textContent = current ? `v${current.replace(/^v/i, '')}` : '';
    els.pill.hidden = !current;

    els.foot.textContent = `更新记录由 git 提交自动生成 · 最后更新 ${fmtTime(data.generatedAt)}`;

    /* 时间线：DocumentFragment 一次性插入 */
    const frag = document.createDocumentFragment();
    releases.forEach((rel) => {
      const rv = buildRelease(rel);
      state.view.push(rv);
      frag.append(rv.node);
    });
    els.timeline.replaceChildren(frag);

    markCurrent();
    applyFilter();
    applyHighlights();
    updateBanner();
  }

  function renderChips(types, labels) {
    const frag = document.createDocumentFragment();
    const add = (type, label) => {
      const btn = el('button', null, label);
      btn.type = 'button';
      btn.dataset.type = type;                  // dataset 而非 setAttribute，clip 更短
      btn.setAttribute('aria-pressed', state.type === type ? 'true' : 'false');
      frag.append(btn);
    };
    add('all', '全部');
    for (const type of types) {
      add(type, labels.get(type) || TYPE_LABELS[type] || type);
    }
    els.chips.replaceChildren(frag);
  }

  function buildRelease(rel) {
    const release = rel || {};
    const version = String(release.version || '');

    const node = el('section', 'cl-rel');
    node.dataset.version = version;

    const dot = el('span', 'cl-dot');
    dot.setAttribute('aria-hidden', 'true');

    const body = el('div', 'cl-rel-body');
    const head = el('div', 'cl-rel-head');

    const verEl = el('span', 'cl-rel-ver', version ? `v${version}` : '未标注版本');
    const dateEl = el('time', 'cl-rel-date', release.date || '—');
    if (release.date) dateEl.dateTime = release.date;
    const titleEl = el('span', 'cl-rel-title', release.title || '');
    if (release.title) titleEl.title = release.title;
    const countEl = el('span', 'cl-rel-count', `${countEntries(release)} 条`);

    head.append(verEl, dateEl, titleEl, countEl);
    body.append(head);

    const groups = [];
    for (const g of release.groups || []) {
      if (!g) continue;
      const items = Array.isArray(g.items) ? g.items.filter(Boolean) : [];
      if (!items.length) continue;             // 空分组不渲染，避免孤零零的小标题

      const type = String(g.type || 'other');
      const groupEl = el('div', 'cl-group');
      groupEl.dataset.type = type;

      const groupHead = el('div', 'cl-group-head');
      const gdot = el('i', 'cl-gdot');
      gdot.dataset.type = type;
      gdot.setAttribute('aria-hidden', 'true');
      groupHead.append(gdot, document.createTextNode(g.label || TYPE_LABELS[type] || type));

      const list = el('ul', 'cl-items');
      const entries = [];
      for (const item of items) {
        const entry = buildItem(item, type, version);
        entries.push(entry);
        list.append(entry.el);
        state.totalEntries += 1;
      }

      groupEl.append(groupHead, list);
      body.append(groupEl);
      groups.push({ type, el: groupEl, entries });
    }

    node.append(dot, body);
    return { version, node, groups, release };
  }

  function buildItem(item, type, version) {
    const li = el('li', 'cl-item');

    const text = el('div', 'cl-item-text');
    if (item.breaking) text.append(el('span', 'cl-breaking', '破坏性'));
    text.append(document.createTextNode(String(item.text == null ? '' : item.text)));
    li.append(text);

    if (item.scope) li.append(el('code', 'cl-scope', item.scope));

    const hash = item.hash ? String(item.hash) : '';
    if (hash) {
      const code = el('code', 'cl-hash', hash.slice(0, 7));
      // 展示统一 7 位；完整值放 title，鼠标悬停能看到
      if (hash.length > 7) code.title = hash;
      li.append(code);
    }

    const badge = el('span', 'cl-new', '新');
    badge.setAttribute('aria-label', '新改动');
    li.append(badge);                          // 默认 display:none，is-new 时才显示

    const hay = [item.text, item.scope, hash, item.date, version]
      .filter(Boolean)
      .join(' ')
      .toLowerCase();

    return { el: li, hay, type };
  }

  /* ── 筛选（只切显隐，不重建 DOM） ──────────────────────────── */
  function applyFilter() {
    const q = state.query.trim().toLowerCase();
    const type = state.type;
    let total = 0;

    for (const rv of state.view) {
      let relTotal = 0;
      for (const group of rv.groups) {
        let groupTotal = 0;
        for (const entry of group.entries) {
          const show = (type === 'all' || entry.type === type)
            && (!q || entry.hay.includes(q));
          entry.el.hidden = !show;
          if (show) groupTotal += 1;
        }
        group.el.hidden = groupTotal === 0;
        relTotal += groupTotal;
      }
      rv.node.hidden = relTotal === 0;
      total += relTotal;
    }

    els.count.textContent = `共 ${total} 条`;
    els.timeline.hidden = total === 0;
    els.empty.hidden = total > 0;
    els.empty.textContent = state.totalEntries === 0
      ? '还没有更新记录'
      : '没匹配到的更新，换个词试试';
  }

  /* ── 高亮新条目（可重复调用，不改 DOM 结构） ──────────────── */
  function applyHighlights() {
    const since = state.since;
    // update 模式但没有 since（首次安装后升级）：退化为高亮最新一个版本
    const onlyNewest = state.mode === 'update' && !since;

    state.view.forEach((rv, index) => {
      const isNew = since
        ? cmpVersion(rv.version, since) > 0
        : (onlyNewest && index === 0);
      rv.isNew = isNew;
      for (const group of rv.groups) {
        for (const entry of group.entries) {
          entry.el.classList.toggle('is-new', isNew);
        }
      }
    });
  }

  /* ── 顶部提示条 ────────────────────────────────────────────── */
  function updateBanner() {
    const hasHighlight = Boolean(state.since) || state.mode === 'update';
    if (!hasHighlight) {
      els.banner.hidden = true;
      els.banner.textContent = '';
      return;
    }

    const n = state.view.reduce(
      (sum, rv) => sum + (rv.isNew ? countEntries(rv.release) : 0),
      0,
    );

    let text;
    if (state.since) {
      text = n > 0
        ? `你之前用的是 v${state.since.replace(/^v/i, '')}，这次更新了 ${n} 条`
        : `你之前用的是 v${state.since.replace(/^v/i, '')}，当前已是最新版本`;
    } else {
      text = `这次更新了 ${n} 条`;
    }

    els.banner.textContent = text;
    els.banner.hidden = false;
  }

  /* ── 当前版本标记 ──────────────────────────────────────────── */
  function markCurrent() {
    const current = state.currentVersion;
    for (const rv of state.view) {
      rv.node.classList.toggle('is-current', Boolean(current) && cmpVersion(rv.version, current) === 0);
    }
  }

  function setCurrentVersion(v) {
    state.currentVersion = v == null ? '' : String(v).replace(/^v/i, '');
    if (!state.mounted) return;

    els.pill.textContent = state.currentVersion ? `v${state.currentVersion}` : '';
    els.pill.hidden = !state.currentVersion;
    markCurrent();
  }

  /* ── 打开 / 关闭 ───────────────────────────────────────────── */
  function open(opts = {}) {
    if (!state.mounted) mount();

    const since = opts && opts.since ? String(opts.since) : '';
    const mode = opts && opts.mode === 'update' ? 'update' : 'browse';

    // 只在真正从关闭态打开时记录触发器，避免连续 open 把焦点记成面板内部元素
    if (els.layer.hidden) state.lastFocus = document.activeElement;

    state.since = since;
    state.mode = mode;

    // 每次打开回到干净视图，避免上次搜到一半残留空态
    state.query = '';
    state.type = 'all';
    els.search.value = '';
    syncChips();
    applyFilter();
    applyHighlights();
    updateBanner();

    els.layer.hidden = false;
    document.addEventListener('keydown', onKeyDown, true);

    // 等一帧再聚焦：display 刚翻转时部分浏览器会忽略 focus()
    if (typeof window.requestAnimationFrame === 'function') {
      window.requestAnimationFrame(() => {
        if (!els.layer.hidden) els.search.focus({ preventScroll: true });
      });
    } else {
      els.search.focus({ preventScroll: true });
    }
  }

  function close() {
    if (!state.mounted || els.layer.hidden) return;

    els.layer.hidden = true;
    document.removeEventListener('keydown', onKeyDown, true);
    window.clearTimeout(searchTimer);

    const target = state.lastFocus;
    state.lastFocus = null;
    // 焦点还给触发按钮；触发器已被移除时就不硬塞，免得焦点掉到 <body>
    if (target && typeof target.focus === 'function' && document.contains(target)) {
      target.focus({ preventScroll: true });
    }
  }

  /* ── 键盘：Esc 关闭、/ 聚焦搜索、Tab 圈在面板内 ───────────── */
  function onKeyDown(event) {
    if (event.key === 'Escape') {
      event.preventDefault();
      event.stopPropagation();                 // 别让 Esc 继续关掉底层的抽屉/对话框
      close();
      return;
    }

    const active = document.activeElement;
    const typing = Boolean(active) && (
      active.tagName === 'INPUT'
      || active.tagName === 'TEXTAREA'
      || active.isContentEditable
    );

    if (event.key === '/' && !typing && !event.ctrlKey && !event.metaKey && !event.altKey) {
      event.preventDefault();
      els.search.focus({ preventScroll: true });
      if (typeof els.search.select === 'function') els.search.select();
      return;
    }

    if (event.key === 'Tab') trapFocus(event);
  }

  function trapFocus(event) {
    const focusables = els.panel.querySelectorAll(
      'button:not([disabled]), input:not([disabled]), [href], [tabindex]:not([tabindex="-1"])',
    );
    if (!focusables.length) return;

    const first = focusables[0];
    const last = focusables[focusables.length - 1];
    const active = document.activeElement;

    if (!event.shiftKey && active === last) {
      event.preventDefault();
      first.focus();
    } else if (event.shiftKey && (active === first || !els.panel.contains(active))) {
      event.preventDefault();
      last.focus();
    }
  }

  /* ── 对外：是否有没看过的新版本 ───────────────────────────── */
  function hasUnseen(since) {
    const releases = state.data && Array.isArray(state.data.releases)
      ? state.data.releases
      : [];
    if (!releases.length) return false;
    if (!since) return true;                   // 没记录过已读版本，视为有更新
    return releases.some((rel) => rel && cmpVersion(rel.version, since) > 0);
  }

  return {
    mount,
    setData,
    open,
    close,
    setCurrentVersion,
    hasUnseen,
  };
}
