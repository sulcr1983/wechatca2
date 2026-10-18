/* 更新管理 —— 版本检测 + Service Worker 更新 + 右下角入口
 *
 * 用的是业界成熟做法（Workbox 官方文档 / web.dev 的 PWA 更新指南同一套）：
 *   1. sw.js 里**不**自动 skipWaiting —— 新版本装好后停在 waiting，
 *      否则会在用户正打字时突然换掉资源，甚至半新半旧。
 *   2. 页面检测到 waiting 的 worker → 显示非阻塞提示，由用户点「立即更新」。
 *   3. 用户确认后 postMessage({type:'SKIP_WAITING'}) → 新 worker 激活 →
 *      controllerchange → 只 reload 一次。
 *   4. sw.js 用 updateViaCache:'none' 注册，避免被 HTTP 缓存住导致永远查不到更新。
 *   5. 每小时 + 回到前台时主动 registration.update()，不靠用户刷新。
 *
 * 另一条独立线索：静态版本文件 version.json（no-store）比对。
 * 为什么两条都要：SW 更新能保证资源一致，但「更新说明」需要知道版本号；
 * 而且用户如果一直不关标签页，靠 version.json 轮询也能发现远端已发新版。
 */

const LS_SEEN = 'supersu.pwa.seenVersion';
const LS_DISMISSED = 'supersu.pwa.dismissedVersion';
const CHECK_MS = 60 * 60 * 1000;      // 每小时查一次
const RELOAD_FLAG = 'supersu.pwa.reloading';

/* SemVer 比较：只看主.次.修订，忽略预发布后缀（个人项目用不上） */
export function cmpVersion(a, b) {
  const pa = String(a || '0').split('.').map((n) => parseInt(n, 10) || 0);
  const pb = String(b || '0').split('.').map((n) => parseInt(n, 10) || 0);
  for (let i = 0; i < 3; i++) {
    if ((pa[i] || 0) !== (pb[i] || 0)) return (pa[i] || 0) > (pb[i] || 0) ? 1 : -1;
  }
  return 0;
}

export function createUpdater({ changelog } = {}) {
  const el = {
    btn: document.getElementById('btn-update'),
    ver: document.getElementById('upd-ver'),
    dot: document.getElementById('upd-dot'),
    card: document.getElementById('upd-card'),
    cardText: document.getElementById('upd-card-text'),
    later: document.getElementById('upd-later'),
    now: document.getElementById('upd-now'),
  };

  const state = {
    running: '',
    remote: '',
    data: null,
    reg: null,
    waiting: null,
    prompted: false,
  };

  /* ── 数据加载 ─────────────────────────────────────────── */
  async function fetchJSON(url) {
    const res = await fetch(url, { cache: 'no-store' });
    if (!res.ok) throw new Error(`${url} → HTTP ${res.status}`);
    return res.json();
  }

  async function loadVersion() {
    try {
      const v = await fetchJSON('./version.json');
      state.running = v.version || '';
      if (state.running) {
        el.ver.textContent = 'v' + state.running;
        el.btn.hidden = false;
      }
    } catch {
      el.ver.textContent = 'v—';
    }
  }

  async function loadChangelog() {
    try {
      state.data = await fetchJSON('./changelog.json');
      if (changelog) {
        changelog.setData(state.data);
        changelog.setCurrentVersion(state.running);
      }
    } catch { /* 没有更新记录不影响主功能 */ }
  }

  /* ── 冷启动：上次看到的版本 vs 当前运行版本 ──────────────── */
  function reconcileSeenVersion() {
    let seen = '';
    try { seen = localStorage.getItem(LS_SEEN) || ''; } catch { /* 隐私模式 */ }

    if (seen && cmpVersion(state.running, seen) > 0) {
      // 资源已经是新版（硬刷新 / 刚更新过）→ 直接把「上次到这次」的变化摊开给用户看
      try { localStorage.setItem(RELOAD_FLAG, '1'); } catch { /* 忽略 */ }
      setTimeout(() => openChangelog({ since: seen, mode: 'update' }), 900);
    }
    remember(state.running);
  }

  function remember(v) {
    try { localStorage.setItem(LS_SEEN, v); } catch { /* 忽略 */ }
  }

  /* ── 提示卡 ───────────────────────────────────────────── */
  function showCard(text, { canUpdate = true } = {}) {
    if (!el.card) return;
    el.cardText.textContent = text;
    el.now.hidden = !canUpdate;
    el.card.hidden = false;
    el.dot.hidden = false;
    state.prompted = true;
  }

  function hideCard() {
    if (el.card) el.card.hidden = true;
  }

  /* ── Service Worker ───────────────────────────────────── */
  function initSW() {
    if (!('serviceWorker' in navigator)) return;
    const okProto = location.protocol === 'https:' || ['localhost', '127.0.0.1'].includes(location.hostname);
    if (!okProto) return;   // file:// 打开时不注册，功能不受影响，只是没离线

    navigator.serviceWorker.register('./sw.js', { updateViaCache: 'none' }).then((reg) => {
      state.reg = reg;

      // 已有 waiting 的（上次没更新就关了页面）
      if (reg.waiting && navigator.serviceWorker.controller) {
        state.waiting = reg.waiting;
        maybePrompt();
      }

      reg.addEventListener('updatefound', () => {
        const installing = reg.installing;
        if (!installing) return;
        installing.addEventListener('statechange', () => {
          if (installing.state !== 'installed') return;
          if (!navigator.serviceWorker.controller) return;   // 首次安装，不算更新
          state.waiting = installing;
          maybePrompt();
        });
      });

      // 定时 + 回前台时主动查
      setInterval(() => reg.update().catch(() => {}), CHECK_MS);
      document.addEventListener('visibilitychange', () => {
        if (document.visibilityState === 'visible') {
          reg.update().catch(() => {});
          checkRemoteVersion();
        }
      });
    }).catch(() => { /* 注册失败不影响使用 */ });

    // 新 worker 接管后只 reload 一次
    let reloading = false;
    navigator.serviceWorker.addEventListener('controllerchange', () => {
      if (reloading) return;
      reloading = true;
      location.reload();
    });
  }

  function maybePrompt() {
    let dismissed = '';
    try { dismissed = localStorage.getItem(LS_DISMISSED) || ''; } catch { /* 忽略 */ }
    if (dismissed === state.remote) return;      // 用户点过「稍后」，这次别再烦

    const since = localStorage.getItem(LS_SEEN) || '';
    let text = '排版引擎和界面有更新，更新后能看到这期间改了什么。';
    if (state.data && since) {
      const newer = state.data.releases.filter((r) => cmpVersion(r.version, since) > 0);
      const n = newer.reduce((s, r) => s + r.groups.reduce((m, g) => m + g.items.length, 0), 0);
      if (n > 0) text = `有 ${n} 条更新（${since} → ${state.data.version}），更新后可以看详情。`;
    }
    showCard(text);
  }

  /* ── 远端版本轮询（不依赖 SW）───────────────────────────── */
  async function checkRemoteVersion() {
    try {
      const v = await fetchJSON('./version.json');
      state.remote = v.version || '';
      if (state.remote && state.running && cmpVersion(state.remote, state.running) > 0 && !state.prompted) {
        showCard(`线上已经是 v${state.remote}（你用的是 v${state.running}）。`, { canUpdate: true });
      }
    } catch { /* 离线或文件缺失，忽略 */ }
  }

  /* ── 应用更新 ─────────────────────────────────────────── */
  async function applyUpdate() {
    el.now.disabled = true;
    el.now.textContent = '更新中…';

    if (state.waiting) {
      state.waiting.postMessage({ type: 'SKIP_WAITING' });
      // 新 worker 激活会触发 controllerchange → 那里统一 reload
      return;
    }
    // 没有 waiting 的 worker（可能是 version.json 先变了）→ 拉一次 SW 再试
    if (state.reg) {
      try { await state.reg.update(); } catch { /* 忽略 */ }
      if (state.reg.waiting) {
        state.waiting = state.reg.waiting;
        state.waiting.postMessage({ type: 'SKIP_WAITING' });
        return;
      }
    }
    el.now.disabled = false;
    el.now.textContent = '立即更新';
    showCard('暂时没拉到更新包，请检查网络后重试。', { canUpdate: false });
  }

  /* ── 更新记录面板 ─────────────────────────────────────── */
  function openChangelog(opts = {}) {
    if (!changelog) return;
    let since = opts.since;
    if (since === undefined) {
      try { since = localStorage.getItem(LS_SEEN) || ''; } catch { since = ''; }
    }
    changelog.open({ since, mode: opts.mode || 'browse' });
    hideCard();
    if (state.running) remember(state.running);
  }

  /* ── 事件绑定 ─────────────────────────────────────────── */
  function bind() {
    if (el.btn) el.btn.addEventListener('click', () => openChangelog());
    if (el.later) {
      el.later.addEventListener('click', () => {
        try { localStorage.setItem(LS_DISMISSED, state.remote || state.running); } catch { /* 忽略 */ }
        hideCard();
      });
    }
    if (el.now) el.now.addEventListener('click', applyUpdate);
  }

  /* ── 启动 ─────────────────────────────────────────────── */
  async function start() {
    bind();
    await loadVersion();
    await loadChangelog();
    reconcileSeenVersion();
    initSW();
    checkRemoteVersion();
    // 回到前台时清掉「刚更新完」标志，避免下次再弹
    try {
      if (localStorage.getItem(RELOAD_FLAG)) localStorage.removeItem(RELOAD_FLAG);
    } catch { /* 忽略 */ }
  }

  return { start, openChangelog, applyUpdate, get version() { return state.running; } };
}
