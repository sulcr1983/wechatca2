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
const VISIBLE_CHECK_MS = 5 * 60 * 1000; // 回到前台也查，但 5 分钟内不重复打请求
const IDLE_POLL_MS = 10 * 1000;        // 有待应用更新时，每 10s 看一次用户是否空闲
const RELOAD_FLAG = 'supersu.pwa.reloading';
const TAB_ID = Math.random().toString(36).slice(2);

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
    skipReload: false,   // 别的标签正在接管时，本标签不跟着刷（避免多标签齐刷）
  };

  // 多标签协调：一个标签应用更新，其余只改文案、下次打开生效
  let bc = null;
  try { bc = new BroadcastChannel('supersu-update'); } catch { /* 老浏览器忽略 */ }
  if (bc) {
    bc.onmessage = (e) => {
      const d = e.data || {};
      if (!d || d.tab === TAB_ID) return;
      if (d.type === 'APPLYING') {
        state.skipReload = true;
        hideCard();
      } else if (d.type === 'APPLIED') {
        showCard('已在其他标签页更新，下次打开本页生效', { canUpdate: false });
      }
    };
  }

  /* ── 数据加载 ─────────────────────────────────────────── */
  async function fetchJSON(url) {
    // no-cache：允许浏览器带 If-None-Match，未变时 CF Pages 回 304（省流量）
    const res = await fetch(url, { cache: 'no-cache' });
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
    // 离线启动时 running 为空：别用空串覆盖 seen，否则 changelog 基线丢失
    if (state.running) remember(state.running);
  }

  function remember(v) {
    try { localStorage.setItem(LS_SEEN, v); } catch { /* 忽略 */ }
  }

  /* ── 提示卡 ───────────────────────────────────────────── */
  function showCard(text, { canUpdate = true } = {}) {
    if (!el.card) return;
    el.cardText.textContent = text;
    // 每次显示都重置按钮：否则上一次卡在「更新中…」后，本次提示点不了
    if (el.now) {
      el.now.disabled = false;
      el.now.textContent = '立即更新';
    }
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

    // 首次安装时 clients.claim() 也会触发 controllerchange，
    // 但那一刻页面本来就在跑新版本 —— 再 reload 一次纯属多余（还会打断正在输入的用户）
    const hadController = !!navigator.serviceWorker.controller;

    navigator.serviceWorker.register('./sw.js', { updateViaCache: 'none' }).then((reg) => {
      state.reg = reg;

      // 已有 waiting 的（上次没更新就关了页面）→ 直接视为「更新已就绪」
      if (reg.waiting && navigator.serviceWorker.controller) {
        state.waiting = reg.waiting;
        onReady();
      }

      reg.addEventListener('updatefound', () => {
        const installing = reg.installing;
        if (!installing) return;
        installing.addEventListener('statechange', () => {
          if (installing.state !== 'installed') return;
          if (!navigator.serviceWorker.controller) return;   // 首次安装，不算更新
          state.waiting = installing;
          onReady();
        });
      });

      // 打开就查一次（延迟 3s，别抢首屏）
      setTimeout(() => reg.update().catch(() => {}), 3000);

      // 定时 + 回前台时主动查（回前台 5 分钟节流，避免频繁 focus 打请求）
      setInterval(() => reg.update().catch(() => {}), CHECK_MS);
      let lastVisibleCheck = 0;
      document.addEventListener('visibilitychange', () => {
        // 有待应用更新时，切走就是最佳更新时机
        if (document.visibilityState === 'hidden') { tryAutoApply(); return; }
        const now = Date.now();
        if (now - lastVisibleCheck < VISIBLE_CHECK_MS) return;
        lastVisibleCheck = now;
        reg.update().catch(() => {});
        checkRemoteVersion();
      });
      window.addEventListener('blur', () => tryAutoApply());
      setInterval(tryAutoApply, IDLE_POLL_MS);
    }).catch(() => { /* 注册失败不影响使用 */ });

    // 新 worker 接管后只 reload 一次（首次安装不 reload；别的标签已接管时不重复刷）
    let reloading = false;
    navigator.serviceWorker.addEventListener('controllerchange', () => {
      if (!hadController) return;
      if (state.skipReload) return;
      if (reloading) return;
      reloading = true;
      if (bc) bc.postMessage({ type: 'APPLIED', tab: TAB_ID });
      location.reload();
    });
  }

  /* ── 更新就绪：不弹大卡片，安静地「下载好 + 空闲时自动应用」 ── */
  function onReady() {
    if (el.dot) el.dot.hidden = false;
    if (!isDismissed()) {
      const since = localStorage.getItem(LS_SEEN) || '';
      let text = '有新版本，已下载完成；空闲时会自动更新（也可点「立即更新」）';
      if (state.data && since) {
        const newer = state.data.releases.filter((r) => cmpVersion(r.version, since) > 0);
        const n = newer.reduce((s, r) => s + r.groups.reduce((m, g) => m + g.items.length, 0), 0);
        if (n > 0) text = `有 ${n} 条更新，已下载完成；空闲时会自动更新`;
      }
      showCard(text, { canUpdate: true });
    }
    tryAutoApply();
  }

  /**
   * 空闲才自动应用：
   *   · 页面不可见（切走了）→ 最安全
   *   · 或 编辑器为空 / 30 秒没动过且焦点不在输入框（app.js 的 __supersuIsIdle）
   * 绝不因为「有更新」就打断正在写字的人。
   */
  function tryAutoApply() {
    if (!state.waiting || isDismissed()) return;
    const idle = document.visibilityState === 'hidden'
      || (typeof window.__supersuIsIdle === 'function' && window.__supersuIsIdle());
    if (!idle) return;
    applyUpdate();
  }

  /** 用户点过「稍后」：本次运行不再提示、也不自动应用（下次版本再来） */
  function isDismissed() {
    let dismissed = '';
    try { dismissed = localStorage.getItem(LS_DISMISSED) || ''; } catch { /* 忽略 */ }
    const key = state.running || state.remote;
    return !!(dismissed && key && dismissed === key);
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

  /** 让页面把当前编辑内容同步落盘（app.js 暴露的钩子；不存在也不影响更新） */
  async function flushDraft() {
    try {
      const fn = window.__supersuFlushDraft;
      if (typeof fn === 'function') await fn();
    } catch { /* 落盘失败也要允许更新 */ }
  }

  /* ── 应用更新 ─────────────────────────────────────────── */
  async function applyUpdate() {
    el.now.disabled = true;
    el.now.textContent = '更新中…';

    let handedOff = false;
    // 兜底：15 秒还没等到 controllerchange 就恢复按钮，避免永远卡在「更新中…」
    const resetTimer = setTimeout(() => {
      if (handedOff) return;
      el.now.disabled = false;
      el.now.textContent = '立即更新';
      showCard('更新好像没成功，请刷新页面后再试一次。', { canUpdate: false });
    }, 15000);

    try {
      // 关键：先让页面把编辑器内容落盘，再让新 SW 接管。
      // 否则 reload 这一刻「正在输入、还没触发渲染」的几百毫秒内容会丢。
      await flushDraft();

      if (state.waiting) {
        handedOff = true;
        if (bc) bc.postMessage({ type: 'APPLYING', tab: TAB_ID });
        state.waiting.postMessage({ type: 'SKIP_WAITING' });
        // 新 worker 激活会触发 controllerchange → 那里统一 reload
        return;
      }

      // 没有 waiting 的 worker（可能是 version.json 先变了）→ 拉一次 SW 再试
      if (state.reg) {
        try { await state.reg.update(); } catch { /* 忽略 */ }

        // update() resolve 时新 worker 往往还在 installing，要等它到 installed
        const worker = state.reg.installing || state.reg.waiting;
        if (worker && worker.state !== 'installed') {
          await new Promise((resolve) => {
            const t = setTimeout(resolve, 8000);
            worker.addEventListener('statechange', () => {
              if (worker.state === 'installed' || worker.state === 'redundant') {
                clearTimeout(t);
                resolve();
              }
            });
          });
        }
        const ready = state.reg.waiting || (worker && worker.state === 'installed' ? worker : null);
        if (ready) {
          state.waiting = ready;
          handedOff = true;
          if (bc) bc.postMessage({ type: 'APPLYING', tab: TAB_ID });
          ready.postMessage({ type: 'SKIP_WAITING' });
          return;
        }
      }

      el.now.disabled = false;
      el.now.textContent = '立即更新';
      showCard('暂时没拉到更新包，请检查网络后重试。', { canUpdate: false });
    } finally {
      if (!handedOff) clearTimeout(resetTimer);
    }
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
        // 与 maybePrompt 用同一个 key（运行版本优先），否则「稍后」记不住
        const key = state.running || state.remote;
        if (key) {
          try { localStorage.setItem(LS_DISMISSED, key); } catch { /* 忽略 */ }
        }
        hideCard();
      });
    }
    if (el.now) el.now.addEventListener('click', applyUpdate);
  }

  /* ── 启动 ─────────────────────────────────────────────── */
  async function start() {
    // 自救开关：地址加 ?reset-sw → 注销 SW、清本站缓存后重载（更新出毛病时用）
    if (new URLSearchParams(location.search).has('reset-sw')) {
      try {
        const regs = await navigator.serviceWorker.getRegistrations();
        await Promise.all(regs.map((r) => r.unregister()));
        const keys = await caches.keys();
        await Promise.all(keys.filter((k) => k.startsWith('supersu-')).map((k) => caches.delete(k)));
      } catch { /* 忽略 */ }
      location.replace(location.pathname);
      return;
    }

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
