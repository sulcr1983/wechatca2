/* 更新管理 —— 版本检测 + Service Worker 更新 + 右下角入口
 *
 * 用的是业界成熟做法（Workbox 官方文档 / web.dev 的 PWA 更新指南同一套）：
 *   1. sw.js 里**不**自动 skipWaiting —— 新版本装好后停在 waiting，
 *      否则可能半新半旧；由页面在合适的时机发 SKIP_WAITING 再激活。
 *   2. 页面检测到 waiting 的 worker → **静默自动应用**（2026-10-24 用户要求）：
 *      页面不可见 / 编辑器空闲 → 立即应用；用户一直在打字也最多等 30s。
 *      应用前先落盘草稿，reload 后内容不丢。
 *   3. 升级完成后只在右下角弹小提示「已升级到 vX · bN」，8 秒自动消失；
 *      点它才打开完整更新记录 —— **不再用大卡片要求用户点「立即更新」**。
 *   4. sw.js 用 updateViaCache:'none' 注册，避免被 HTTP 缓存住导致永远查不到更新。
 *   5. 每小时 + 回到前台时主动 registration.update()，不靠用户刷新。
 *
 * 另一条独立线索：静态版本文件 version.json（no-store）比对。
 * 为什么两条都要：SW 更新能保证资源一致，但「更新说明」需要知道版本号；
 * 而且用户如果一直不关标签页，靠 version.json 轮询也能发现远端已发新版
 * —— 发现后同样不弹卡片，直接 reg.update() 让 SW 下载、装好即自动应用。
 */

import { mountUpdateUI } from './ui.js';

const LS_SEEN = 'supersu.pwa.seenVersion';
const LS_DISMISSED = 'supersu.pwa.dismissedVersion';
const LS_UPGRADED = 'supersu.pwa.upgradedAt';   // 升级完成的时间戳：reload 后用它弹右下角「已升级」小提示
const CHECK_MS = 60 * 60 * 1000;      // 每小时查一次
const VISIBLE_CHECK_MS = 5 * 60 * 1000; // 回到前台也查，但 5 分钟内不重复打请求
const IDLE_POLL_MS = 5 * 1000;         // 有待应用更新时，每 5s 看一次能不能应用
const AUTO_APPLY_MS = 30 * 1000;       // 检测到更新后最多等 30s：用户一直在打字也应用（草稿已落盘）
const DONE_MS = 8000;                  // 「已升级」小提示自动消失
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
  // 更新 UI 由模块自建（页面只留 #update-root），必须在取 DOM 之前挂载
  mountUpdateUI();

  const el = {
    btn: document.getElementById('btn-update'),
    dot: document.getElementById('upd-dot'),
    card: document.getElementById('upd-card'),
    cardText: document.getElementById('upd-card-text'),
    badge: document.getElementById('upd-badge'),
    date: document.getElementById('upd-date'),
    list: document.getElementById('upd-list'),
    later: document.getElementById('upd-later'),
    all: document.getElementById('upd-all'),
    now: document.getElementById('upd-now'),
    done: document.getElementById('upd-done'),
    doneText: document.getElementById('upd-done-text'),
  };

  const state = {
    running: '',
    remote: '',
    data: null,
    reg: null,
    waiting: null,
    detectedAt: 0,       // 发现更新的时刻：超过 AUTO_APPLY_MS 就不再等空闲
    applying: false,     // 防止自动应用被重复触发
    doneTimer: 0,
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
        showDone('其他标签页已升级，下次打开本页生效');
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
      state.runningBuild = Number(v.build) || 0;
      // 入口按钮文案固定为「更新记录」（版本号放在更新记录面板里展示），
      // 所以这里只负责把按钮亮出来，不再改文案
      if (state.running) el.btn.hidden = false;
    } catch {
      // 版本文件拉不到：入口不出现即可，不影响排版与复制
    }
  }

  async function loadChangelog() {
    try {
      state.data = await fetchJSON('./changelog.json');
      if (changelog) {
        changelog.setData(state.data);
        changelog.setCurrentVersion(state.running, state.runningBuild);
      }
    } catch { /* 没有更新记录不影响主功能 */ }
  }

  /* ── 冷启动：记录「这次看到的版本」─────────────────────── */
  function reconcileSeenVersion() {
    // 只记录基线，**不再自动摊开更新面板**：升级完成由右下角「已升级」小提示告知
    //（2026-10-24 用户要求：后台检查到更新就静默自动更新，完成后小弹窗告知）
    if (state.running) remember(state.running);
  }

  function remember(v) {
    try { localStorage.setItem(LS_SEEN, v); } catch { /* 忽略 */ }
  }

  /* ── 提示卡 ───────────────────────────────────────────── */
  const escHtml = (s) => String(s == null ? '' : s)
    .replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));

  /** 按文案猜分类，给「发布小票」打标签 */
  function kindOf(text) {
    if (/修复|修正|解决|bug|报错/i.test(text)) return { kind: 'fix', label: '修复' };
    if (/优化|提速|加快|减少|更快|静默|缓存|不丢/.test(text)) return { kind: 'opt', label: '优化' };
    return { kind: 'new', label: '新功能' };
  }

  /** 取「上次看到之后」的更新条目（最多 3 条亮点 + 总数）
   *  注意：changelog 的版本号可能落后于运行版本（历史数据），取不到就回退到最近一批，
   *  避免「发布小票」永远只有一句占位文案。 */
  function highlightsSince(since) {
    if (!state.data || !Array.isArray(state.data.releases) || !state.data.releases.length) {
      return { items: [], total: 0, scope: 'none' };
    }
    let list = state.data.releases.filter((r) => cmpVersion(r.version, since) > 0);
    let scope = 'newer';
    if (!list.length) {
      list = state.data.releases.slice(0, 1);
      scope = 'latest';
    }
    const items = [];
    let total = 0;
    for (const r of list) {
      for (const g of r.groups || []) {
        for (const it of g.items || []) {
          total += 1;
          if (items.length < 3 && it && it.text) {
            items.push({ ...kindOf(it.text), text: it.text });
          }
        }
      }
    }
    return { items, total, scope };
  }

  function showCard(text, { canUpdate = true, badge = '', date = '', items = [] } = {}) {
    if (!el.card) return;
    el.cardText.textContent = text;
    if (el.badge) {
      el.badge.textContent = badge;
      el.badge.hidden = !badge;
    }
    if (el.date) {
      el.date.textContent = date;
      el.date.hidden = !date;
    }
    if (el.list) {
      el.list.innerHTML = items.map((it) =>
        `<li><span class="upd-tag ${it.kind}">${it.label}</span><span>${escHtml(it.text)}</span></li>`
      ).join('');
    }
    // 每次显示都重置按钮：否则上一次卡在「更新中…」后，本次提示点不了
    if (el.now) {
      el.now.disabled = false;
      el.now.textContent = '立即更新';
    }
    el.now.hidden = !canUpdate;
    el.card.hidden = false;
    el.dot.hidden = false;
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
      // 记下「刚升级完」：新页面加载后据此弹右下角小提示（10 分钟内有效）
      try { localStorage.setItem(LS_UPGRADED, String(Date.now())); } catch { /* 忽略 */ }
      if (bc) bc.postMessage({ type: 'APPLIED', tab: TAB_ID });
      location.reload();
    });
  }

  /* ── 更新就绪：不弹卡片、不要点击 —— 直接自动应用 ──────────── */
  function onReady() {
    if (el.dot) el.dot.hidden = false;
    if (!state.detectedAt) state.detectedAt = Date.now();

    // 预览入口（#upd-demo）：只展示「发布小票」，不自动更新
    if (location.hash === '#upd-demo') { showReadyCard(); return; }

    // 正常流程：新版本已装好 → 空闲立即应用；用户一直在打字也最多等 AUTO_APPLY_MS
    tryAutoApply();
  }

  /** 「发布小票」（仅 #upd-demo 预览用；正常流程只弹右下角小提示） */
  function showReadyCard() {
    if (isDismissed()) return;
    const since = (() => {
      try { return localStorage.getItem(LS_SEEN) || ''; } catch { return ''; }
    })();
    const ver = state.remote || state.running || '';
    const build = state.remoteBuild || state.runningBuild || 0;
    const { items, total, scope } = highlightsSince(since);
    const date = state.data && state.data.generatedAt
      ? String(state.data.generatedAt).slice(0, 10) : '';
    const title = total > 0
      ? (scope === 'latest' ? `最近 ${total} 条更新，已下载完成` : `本次共 ${total} 条更新，已下载完成`)
      : '界面与排版体验优化，已下载完成';
    showCard(title, {
      // 只有真有待应用的 worker 才给「立即更新」；预览时没有 waiting 就不给
      canUpdate: Boolean(state.waiting),
      badge: ver ? (build ? `v${ver} · b${build}` : 'v' + ver) : '新版',
      date,
      items: items.length ? items : [{ kind: 'opt', label: '优化', text: '界面与排版体验优化' }],
    });
  }

  /**
   * 自动应用更新（用户要求：不点按钮、静默升级）：
   *   · 页面不可见（切走了）→ 立即应用，最安全
   *   · 或 编辑器为空 / 30 秒没动过且焦点不在输入框（app.js 的 __supersuIsIdle）
   *   · 或 已经等了 AUTO_APPLY_MS → 直接应用（草稿在 reload 前已落盘，不丢内容）
   */
  function tryAutoApply() {
    if (!state.waiting || isDismissed() || state.applying) return;
    const idle = document.visibilityState === 'hidden'
      || (typeof window.__supersuIsIdle === 'function' && window.__supersuIsIdle());
    const waited = state.detectedAt && Date.now() - state.detectedAt >= AUTO_APPLY_MS;
    if (!idle && !waited) return;
    applyUpdate();
  }

  /** 「稍后」的 key：运行版本 + 构建号（同一次运行里构建号不变，视为同一版本） */
  function dismissKey() {
    return state.running
      ? `${state.running}#${state.runningBuild || 0}`
      : (state.remote ? `${state.remote}#${state.remoteBuild || 0}` : '');
  }

  /** 用户点过「稍后」：本次运行不再提示、也不自动应用（下次版本再来） */
  function isDismissed() {
    let dismissed = '';
    try { dismissed = localStorage.getItem(LS_DISMISSED) || ''; } catch { /* 忽略 */ }
    const key = dismissKey();
    return !!(dismissed && key && dismissed === key);
  }

  /* ── 远端版本轮询（不依赖 SW）───────────────────────────── */
  async function checkRemoteVersion() {
    try {
      const v = await fetchJSON('./version.json');
      state.remote = v.version || '';
      state.remoteBuild = Number(v.build) || 0;
      // 版本号只在发版时 bump，build（git 提交数）每次部署都变：
      // 两者任一变大即视为有更新，否则用户永远收不到提示（2026-10-24 用户报障）
      const sameVer = cmpVersion(state.remote, state.running) === 0;
      const newer = Boolean(state.remote && state.running)
        && (cmpVersion(state.remote, state.running) > 0
          || (sameVer && state.remoteBuild > state.runningBuild));
      if (!newer) return;
      // 不弹卡片、不等用户确认：直接让 SW 去下载新 shell；装好后 onReady → 自动应用
      if (state.reg) {
        try { await state.reg.update(); } catch { /* 离线/被限流，下一轮再试 */ }
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
    if (state.applying) return;
    state.applying = true;
    el.now.disabled = true;
    el.now.textContent = '更新中…';

    let handedOff = false;
    // 兜底：15 秒还没等到 controllerchange 就恢复按钮，避免永远卡在「更新中…」
    const resetTimer = setTimeout(() => {
      if (handedOff) return;
      state.applying = false;
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
      showCard('当前已是最新版本。', { canUpdate: false });
    } finally {
      if (!handedOff) {
        clearTimeout(resetTimer);
        state.applying = false;   // 没交棒就允许下次再试（交棒后页面即将 reload，不用复位）
      }
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
        // #upd-demo 只是预览：不落「稍后」，否则会挡住真正的自动更新
        if (location.hash !== '#upd-demo') {
          // 与 isDismissed 用同一个 key（含构建号），否则「稍后」记不住
          const key = dismissKey();
          if (key) {
            try { localStorage.setItem(LS_DISMISSED, key); } catch { /* 忽略 */ }
          }
        }
        hideCard();
      });
    }
    if (el.now) el.now.addEventListener('click', applyUpdate);
    if (el.all) el.all.addEventListener('click', () => openChangelog());
    if (el.done) {
      el.done.addEventListener('click', () => {
        el.done.hidden = true;
        openChangelog();   // 点小提示 → 看这次更新了什么
      });
    }
  }

  /* ── 升级完成小提示（右下角，自动消失）────────────────── */
  function showDone(text) {
    if (!el.done) return;
    if (el.doneText) el.doneText.textContent = text;
    el.done.hidden = false;
    window.clearTimeout(state.doneTimer);
    state.doneTimer = window.setTimeout(() => { el.done.hidden = true; }, DONE_MS);
  }

  function showUpgradedIfAny() {
    let at = 0;
    try {
      at = Number(localStorage.getItem(LS_UPGRADED) || 0) || 0;
      if (at) localStorage.removeItem(LS_UPGRADED);
    } catch { /* 隐私模式 */ }
    // 只认刚发生（10 分钟内）的升级；更早的标记视为过期，不打扰
    if (!at || Date.now() - at > 10 * 60 * 1000) return;
    if (!el.done || !state.running) return;

    const build = state.runningBuild || 0;
    const text = build ? `已升级到 v${state.running} · b${build}` : `已升级到 v${state.running}`;
    // 等首屏稳定后再弹，避免和启动动画抢眼
    setTimeout(() => showDone(text), 700);
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
    showUpgradedIfAny();

    // 预览入口：地址加 #upd-demo 直接展示「发布小票」（不影响正常更新流程）
    if (location.hash === '#upd-demo') {
      setTimeout(() => { onReady(); }, 800);
    }
  }

  return { start, openChangelog, applyUpdate, get version() { return state.running; } };
}
