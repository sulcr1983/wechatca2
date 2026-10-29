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
    currentBuild: 0,          // 构建号（git 提交数）：版本号只在发版时变，构建号每次部署都变
    since: '',                // 用户上次看过的版本
    mode: 'browse',           // browse | update
    query: '',
    type: 'all',
    totalEntries: 0,          // 全量条目数，用来区分「没数据」和「搜不到」
    view: [],                 // [{ version, node, groups: [{ type, el, entries }] }]
    mounted: false,
    lastFocus: null,
    snap: null,               // 更新状态快照（来自 update/index.js）：状态条吃它
    handlers: null,           // { check, apply, subscribe, onSeen, getDiagnostics }
    unsubscribe: null,
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

    const closeBtn = el('button', 'icon-btn close-lg', '✕');
    closeBtn.id = 'cl-close';
    closeBtn.type = 'button';
    closeBtn.setAttribute('aria-label', '关闭更新记录');
    // 头部品牌徽标（与顶栏、启动条共用同一份资源）
    const mark = el('img', 'brand-mark');
    mark.src = './brand/logo-64.png';
    mark.alt = '';
    head.append(mark, titleWrap, closeBtn);

    /* 版本状态条：回答「服务器上有没有更新包」，打开面板就自动查一次。
       放在工具栏之上、头部之下 —— 永远第一眼能看到，且固定高度不跳版。 */
    const status = el('div');
    status.id = 'cl-status';
    status.setAttribute('role', 'status');
    status.setAttribute('aria-live', 'polite');

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

    /* 页脚：一行元信息 + 一行反馈入口（用户提 bug / 提需求的唯一固定入口） */
    const foot = el('footer');
    foot.id = 'cl-foot';
    const footMeta = el('div', 'cl-foot-row');
    footMeta.id = 'cl-foot-meta';
    const fb = el('div', 'cl-foot-row cl-feedback');
    const fbLabel = el('span', 'cl-fb-label', '有问题或想法？');
    const fbBug = el('a', 'cl-fb-link', '报告问题');
    fbBug.href = 'mailto:sulcr@qq.com';
    fbBug.dataset.kind = 'bug';
    const fbIdea = el('a', 'cl-fb-link', '提个需求');
    fbIdea.href = 'mailto:sulcr@qq.com';
    fbIdea.dataset.kind = 'idea';
    const fbCopy = el('button', 'cl-fb-copy', '复制邮箱');
    fbCopy.type = 'button';
    fb.append(fbLabel, fbBug, fbIdea, fbCopy);
    foot.append(footMeta, fb);

    panel.append(head, status, toolbar, banner, scroll, foot);
    layer.append(mask, panel);
    container.append(layer);

    els.layer = layer;
    els.mask = mask;
    els.panel = panel;
    els.pill = pill;
    els.close = closeBtn;
    els.status = status;
    els.search = search;
    els.count = count;
    els.chips = chips;
    els.banner = banner;
    els.scroll = scroll;
    els.timeline = timeline;
    els.empty = empty;
    els.foot = foot;
    els.footMeta = footMeta;
    els.fbBug = fbBug;
    els.fbIdea = fbIdea;
    els.fbCopy = fbCopy;

    /* 事件：全部显式监听，不用内联属性 */
    closeBtn.addEventListener('click', close);
    mask.addEventListener('click', close);
    search.addEventListener('input', onSearchInput);
    chips.addEventListener('click', onChipClick);
    status.addEventListener('click', onStatusClick);
    fbCopy.addEventListener('click', copyEmail);

    state.mounted = true;

    // setData / setCurrentVersion 可能早于 mount，补一次渲染
    if (state.data) render();
    else markCurrent();
    renderStatus();
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

  /* 版本徽标：`v1.5.0 · b132`。只显示版本号会让每次部署看起来“没变化”
   *（2026-10-24 用户报障：版本号一直一样）——构建号是 git 提交数，每次部署都会变。 */
  function renderPill(fallbackVersion) {
    const v = String(state.currentVersion || fallbackVersion || '').replace(/^v/i, '');
    const b = Number(state.currentBuild) || 0;
    els.pill.textContent = v ? `v${v}${b ? ` · b${b}` : ''}` : '';
    els.pill.hidden = !v;
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
    renderPill(data.version);

    els.footMeta.textContent = `持续更新中 · ${releases.length} 个版本 · ${Number(data.totalCommits) || state.totalEntries} 项改动 · 最近更新 ${fmtTime(data.generatedAt)}`;
    buildFeedbackLinks();

    /* 时间线：DocumentFragment 一次性插入 */
    const frag = document.createDocumentFragment();
    releases.forEach((rel, index) => {
      const rv = buildRelease(rel, index);
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

  function buildRelease(rel, index) {
    const release = rel || {};
    const version = String(release.version || '');
    const isLatest = index === 0;               // 最新一版：给「最新」标签 + 强调边框

    const node = el('section', 'cl-rel');
    node.dataset.version = version;
    if (isLatest) node.classList.add('is-latest');

    const dot = el('span', 'cl-dot');
    dot.setAttribute('aria-hidden', 'true');

    const body = el('div', 'cl-rel-body');
    const head = el('div', 'cl-rel-head');

    const verEl = el('span', 'cl-rel-ver', version ? `v${version}` : '未标注版本');
    const dateEl = el('time', 'cl-rel-date', release.date || '—');
    if (release.date) dateEl.dateTime = release.date;
    const titleEl = el('span', 'cl-rel-title', release.title || '');
    if (release.title) titleEl.title = release.title;

    const latestTag = el('span', 'cl-latest-tag', '最新');
    latestTag.hidden = !isLatest;

    const countEl = el('span', 'cl-rel-count', `${countEntries(release)} 条`);

    head.append(verEl, dateEl, titleEl, latestTag, countEl);
    body.append(head);

    // 发版时手写的亮点（3 条人话）：放在版本标题下第一屏，用户三秒能看完
    const highlights = Array.isArray(release.highlights) ? release.highlights.filter(Boolean) : [];
    if (highlights.length) {
      const hl = el('ul', 'cl-highlights');
      for (const t of highlights) hl.append(el('li', null, String(t)));
      body.append(hl);
    }

    const groups = [];
    const devPool = [];
    for (const g of release.groups || []) {
      if (!g) continue;
      const all = Array.isArray(g.items) ? g.items.filter(Boolean) : [];
      const type = String(g.type || 'other');
      // 内部改动（test/chore/docs 等）不进主视图，折叠进「开发者细节」
      const items = all.filter((it) => !it.dev);
      for (const it of all) if (it.dev) devPool.push({ type, label: g.label || TYPE_LABELS[type] || type, item: it });
      if (!items.length) continue;             // 空分组不渲染，避免孤零零的小标题

      const groupEl = el('div', 'cl-group');
      groupEl.dataset.type = type;

      const groupHead = el('div', 'cl-group-head');
      const gdot = el('i', 'cl-gdot');
      gdot.dataset.type = type;
      gdot.setAttribute('aria-hidden', 'true');
      const gLabel = el('span', 'cl-group-label', g.label || TYPE_LABELS[type] || type);
      const gCount = el('span', 'cl-group-count', String(items.length));
      groupHead.append(gdot, gLabel, gCount);

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

    /* 开发者细节：默认收起，搜索命中时自动展开（见 applyFilter） */
    if (devPool.length) {
      const det = el('details', 'cl-dev');
      const sum = el('summary', 'cl-dev-sum');
      sum.append(el('span', null, '开发者细节'), el('span', 'cl-dev-n', `${devPool.length} 条`));
      det.append(sum);
      const list = el('ul', 'cl-items cl-dev-items');
      const entries = [];
      for (const d of devPool) {
        const entry = buildItem(d.item, d.type, version);
        entry.el.classList.add('is-dev');
        entries.push(entry);
        list.append(entry.el);
        state.totalEntries += 1;
      }
      det.append(list);
      body.append(det);
      groups.push({ type: 'dev', el: det, entries, isDev: true });
    }

    node.append(dot, body);
    return { version, node, groups, release };
  }

  function buildItem(item, type, version) {
    const li = el('li', 'cl-item');
    li.dataset.type = type;                    // 左侧色条/图标随类型走

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
        // 搜到开发者细节里才临时展开，否则保持收起
        if (group.isDev) group.el.open = groupTotal > 0 && Boolean(q);
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
    // 「上次用过的版本」和当前版本相同 = 没有可回顾的更新（首次访问就是这种情况），
    // 此时不要摆一句「你之前用的是 v当前版本，已是最新」——纯噪音。
    const sameAsCurrent = Boolean(state.since && state.currentVersion)
      && cmpVersion(state.since, state.currentVersion) === 0;
    const hasHighlight = (Boolean(state.since) && !sameAsCurrent) || state.mode === 'update';

    const n = state.view.reduce(
      (sum, rv) => sum + (rv.isNew ? countEntries(rv.release) : 0),
      0,
    );

    if (!hasHighlight || n === 0) {
      els.banner.hidden = true;
      els.banner.textContent = '';
      return;
    }

    const prev = String(state.since || '').replace(/^v/i, '');
    const text = (prev && !sameAsCurrent)
      ? `你之前用的是 v${prev}，这次更新了 ${n} 条`
      : `这次更新了 ${n} 条`;

    els.banner.textContent = text;
    els.banner.hidden = false;
  }

  /* ── 版本状态条 + 反馈入口 ─────────────────────────────────── */

  const EMAIL = 'sulcr@qq.com';

  /** 反馈链接：把版本、页面、浏览器一起带进邮件正文，对方不用再问一遍 */
  function buildFeedbackLinks() {
    if (!els.fbBug) return;
    const v = state.currentVersion ? `v${state.currentVersion}` : '';
    const b = state.currentBuild ? ` b${state.currentBuild}` : '';
    const env = [
      `版本：${(v + b).trim() || '未知'}`,
      `页面：${location.href.split('#')[0]}`,
      `浏览器：${navigator.userAgent}`,
    ].join('\n');
    const mk = (subject, body) =>
      `mailto:${EMAIL}?subject=${encodeURIComponent(subject)}&body=${encodeURIComponent(body)}`;
    els.fbBug.href = mk(`[SuperSu 问题] ${v}${b}`.trim(), `发生了什么：\n\n\n你期望的结果：\n\n\n---\n${env}\n`);
    els.fbIdea.href = mk(`[SuperSu 需求] ${v}${b}`.trim(), `想要的功能：\n\n\n为什么需要它：\n\n\n---\n${env}\n`);
    els.fbBug.title = `发邮件到 ${EMAIL}`;
    els.fbIdea.title = `发邮件到 ${EMAIL}`;
  }

  async function copyEmail() {
    try {
      await navigator.clipboard.writeText(EMAIL);
      flashCopy('已复制');
    } catch {
      // 不支持剪贴板（http / 老浏览器）→ 选中让用户自己复制
      try {
        const range = document.createRange();
        range.selectNodeContents(els.fbCopy);
        const sel = window.getSelection();
        sel.removeAllRanges();
        sel.addRange(range);
        flashCopy('已选中');
      } catch { flashCopy(EMAIL); }
    }
  }

  function flashCopy(text) {
    if (!els.fbCopy) return;
    els.fbCopy.textContent = text;
    window.setTimeout(() => { els.fbCopy.textContent = '复制邮箱'; }, 1600);
  }

  /* 状态条：只认 update/index.js 给的快照，自己不猜 */
  function renderStatus() {
    if (!els.status) return;
    const s = state.snap;
    if (!s) { els.status.hidden = true; return; }

    const ver = s.remote || s.running || '';
    const build = s.remoteBuild || s.runningBuild || 0;
    const tag = ver ? `v${ver}${build ? ` · b${build}` : ''}` : '';
    const p = s.phase;
    const ago = s.checkedAt ? relTime(s.checkedAt) : '';
    let cls = 's-latest';
    let html = '';

    if (p === 'checking') {
      cls = 's-check';
      html = '<span class="cl-spin"></span><span class="cl-st-txt">正在检查更新…</span>';
    } else if (p === 'latest' || p === 'idle') {
      html = `<i class="cl-st-dot"></i><span class="cl-st-txt">已是最新</span>
        <span class="cl-st-sub">${tag}${ago ? ` · ${ago}检查` : ''}</span>
        <button class="cl-st-btn" data-act="check">再查一次</button>`;
    } else if (p === 'data-only') {
      html = `<i class="cl-st-dot"></i><span class="cl-st-txt">内容已同步</span>
        <span class="cl-st-sub">主题与更新记录已是最新，无需重启</span>
        <button class="cl-st-btn" data-act="check">再查一次</button>`;
    } else if (p === 'available' || p === 'downloading') {
      cls = 's-busy';
      const pr = s.progress;
      const doneN = pr ? pr.done : 0;
      const totalN = pr ? pr.total : 0;
      const fetched = pr ? (pr.fetched || 0) : 0;
      const kb = pr ? Math.round((pr.bytes || 0) / 1024) : 0;
      const pct = totalN ? Math.min(100, Math.round((doneN / totalN) * 100)) : 8;
      // 显示「真实下载了几个文件」而不是「检查了几个」——增量是否生效，用户一眼能看出来
      const fine = fetched
        ? `已下载 ${fetched} 个文件 · ${kb}KB`
        : (totalN ? `比对本地缓存 ${doneN}/${totalN}` : '准备中…');
      html = `<span class="cl-spin"></span>
        <span class="cl-st-txt">正在下载 ${tag || '更新'}</span>
        <span class="cl-st-sub">${fine}</span>
        <div class="cl-bar"><i style="width:${pct}%"></i></div>`;
    } else if (p === 'ready') {
      cls = 's-ready';
      const pr = s.progress;
      const download = pr && pr.bytes
        ? `已下载 ${pr.fetched || 0} 个文件 · ${Math.round(pr.bytes / 1024)}KB`
        : '点一下即可完成';
      html = `<i class="cl-st-dot"></i><span class="cl-st-txt">新版本 ${tag} 已就绪</span>
        <span class="cl-st-sub">${download}</span>
        <button class="cl-st-btn primary" data-act="apply">立即重启</button>`;
    } else if (p === 'applying') {
      cls = 's-busy';
      html = '<span class="cl-spin"></span><span class="cl-st-txt">正在切换版本…</span>';
    } else if (p === 'offline') {
      cls = 's-offline';
      html = `<i class="cl-st-dot"></i><span class="cl-st-txt">离线，暂时无法检查更新</span>
        <span class="cl-st-sub">联网后会自动重试</span>
        <button class="cl-st-btn" data-act="check">重试</button>`;
    } else if (p === 'done') {
      cls = 's-done';
      const fresh = state.since && state.currentVersion
        && cmpVersion(state.currentVersion, state.since) > 0;
      html = `<i class="cl-st-dot"></i><span class="cl-st-txt">已更新到 ${tag}</span>
        <span class="cl-st-sub">${fresh ? '本次更新见下方高亮' : '当前已是最新版本'}</span>`;
    } else {
      html = `<span class="cl-st-txt">更新记录</span><button class="cl-st-btn" data-act="check">检查更新</button>`;
    }

    els.status.className = cls;
    els.status.innerHTML = html;
    els.status.hidden = false;
  }

  function relTime(ts) {
    const d = Date.now() - ts;
    if (d < 60 * 1000) return '刚刚';
    if (d < 60 * 60 * 1000) return `${Math.floor(d / 60000)} 分钟前`;
    if (d < 24 * 60 * 60 * 1000) return `${Math.floor(d / 3600000)} 小时前`;
    return `${Math.floor(d / 86400000)} 天前`;
  }

  function onStatusClick(event) {
    const btn = event.target && event.target.closest
      ? event.target.closest('button[data-act]')
      : null;
    if (!btn || !state.handlers) return;
    const act = btn.dataset.act;
    if (act === 'check') {
      btn.disabled = true;
      Promise.resolve(state.handlers.check(true)).finally(() => { btn.disabled = false; });
    } else if (act === 'apply') {
      btn.disabled = true;
      btn.textContent = '正在重启…';
      state.handlers.apply();
    }
  }

  /** 与 update/index.js 接线：状态条由它驱动，检查/重启也由它执行 */
  function bindUpdate(handlers) {
    state.handlers = handlers || null;
    if (state.unsubscribe) { state.unsubscribe(); state.unsubscribe = null; }
    if (handlers && typeof handlers.subscribe === 'function') {
      state.unsubscribe = handlers.subscribe((snap) => {
        state.snap = snap;
        if (state.mounted) renderStatus();
      });
    }
    if (state.mounted) renderStatus();
  }

  /* ── 当前版本标记 ──────────────────────────────────────────── */
  function markCurrent() {
    const current = state.currentVersion;
    for (const rv of state.view) {
      rv.node.classList.toggle('is-current', Boolean(current) && cmpVersion(rv.version, current) === 0);
    }
  }

  function setCurrentVersion(v, build) {
    state.currentVersion = v == null ? '' : String(v).replace(/^v/i, '');
    state.currentBuild = Number(build) || 0;
    if (!state.mounted) return;

    renderPill();
    markCurrent();
    buildFeedbackLinks();
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

    buildFeedbackLinks();
    renderStatus();

    // 「点一下更新记录，就去问服务器有没有更新包」——用户诉求的核心一句
    if (state.handlers && typeof state.handlers.check === 'function') {
      Promise.resolve(state.handlers.check(false)).catch(() => { /* 离线等异常由状态条兜底 */ });
    }

    // 桌面端聚焦搜索框方便直接输入；触屏不聚焦（否则一开面板就弹键盘挡内容）
    const coarse = typeof window.matchMedia === 'function'
      && window.matchMedia('(pointer: coarse)').matches;
    if (coarse) return;

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

    // 用户至少打开看过一眼 → 记「已读到当前版本」，下次只提示更新的部分
    if (state.handlers && typeof state.handlers.onSeen === 'function') {
      try { state.handlers.onSeen(); } catch { /* 忽略 */ }
    }

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
    bindUpdate,
  };
}
