/* 更新管理 —— 版本检测 + 检查/一键更新 + Service Worker 更新 + 右下角入口
 *
 * 用的是业界成熟做法（Workbox 官方文档 / web.dev 的 PWA 更新指南同一套）：
 *   1. sw.js 里**不**自动 skipWaiting —— 新版本装好后停在 waiting，
 *      否则可能半新半旧；由页面在合适的时机发 SKIP_WAITING 再激活。
 *   2. 更新策略（2026-10-29 用户拍板，方案 A）：
 *      **后台自动下载，前台只提示「点一下重启」。**
 *      只有页面已切走（hidden）或「可见但空闲 ≥10 分钟」才静默重启。
 *      旧策略（检测到就 30s 内强刷）对编辑类工具太急 —— 滚动读文、切去看素材
 *      都会被判空闲而整页重载，滚动位置/预览状态全丢。
 *   3. 升级完成后右下角弹「已升级到 vX · bN」，点它打开更新记录并高亮**本次**条目
 *      （用 prevVersion 当 since；旧实现在 reload 后把新版本记成已读 → 永远显示 0 条）。
 *   4. sw.js 用 updateViaCache:'none' 注册，避免被 HTTP 缓存住导致永远查不到更新。
 *   5. 每小时 + 回到前台时主动 registration.update()，不靠用户刷新。
 *
 * 另一条独立线索：静态版本文件 version.json（no-cache）比对。
 * 两条都要：SW 更新保证资源一致，version.json 用来回答「服务器上有没有更新包」，
 * 并区分「需要重启的更新」与「只是数据变了（主题/更新记录），无需重启」。
 */

import { mountUpdateUI } from './ui.js';

const LS_SEEN = 'supersu.pwa.seenVersion';
const LS_DISMISSED = 'supersu.pwa.dismissedVersion';
const LS_UPGRADED = 'supersu.pwa.upgradedAt';   // 升级完成的时间戳：reload 后用它弹右下角「已升级」小提示
const LS_PREV = 'supersu.pwa.prevVersion';      // 升级前的版本：更新记录用它当 since，才看得见「本次更新」
const LS_LAST = 'supersu.pwa.lastUpdate';       // 最近几次更新的诊断记录（字节/文件数/耗时/结果）
const LS_PENDING = 'supersu.pwa.pendingUpdate'; // SW 安装期间记下的统计，reload 后补进诊断

const CHECK_MS = 60 * 60 * 1000;         // 每小时查一次
const VISIBLE_CHECK_MS = 5 * 60 * 1000;  // 回到前台也查，但 5 分钟内不重复打请求
const CHECK_REUSE_MS = 60 * 1000;        // 手动「检查更新」60s 内复用上次结果
const IDLE_POLL_MS = 5 * 1000;           // 待重启时，每 5s 看一次能不能静默重启
const AUTO_RESTART_IDLE_MS = 10 * 60 * 1000;  // 可见状态下，空闲满 10 分钟才静默重启
const MANUAL_SUPPRESS_MS = 60 * 1000;    // 用户刚手动检查/看面板时，1 分钟内别自动重启
const DONE_MS = 8000;                    // 「已升级」小提示自动消失
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

function readLS(key) {
  try { return localStorage.getItem(key) || ''; } catch { return ''; }
}

function writeLS(key, value) {
  try { localStorage.setItem(key, value); } catch { /* 隐私模式 */ }
}

export function createUpdater({ changelog } = {}) {
  // 更新 UI 由模块自建（页面只留 #update-root），必须在取 DOM 之前挂载
  mountUpdateUI();

  const el = {
    btn: document.getElementById('btn-update'),
    ver: document.getElementById('upd-ver'),
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
    runningBuild: 0,
    remote: '',
    remoteBuild: 0,
    data: null,
    reg: null,
    waiting: null,
    phase: 'idle',        // idle | checking | latest | available | downloading | ready | applying | data-only | offline | done
    progress: null,       // { done, total, bytes } —— 由 SW 上报，真实值
    checkedAt: 0,
    detectedAt: 0,        // 进入「已就绪」的时刻：静默重启要等它满 10 分钟
    suppressUntil: 0,     // 刚手动检查/看面板 → 这段时间内禁止自动重启
    applying: false,
    prevVersion: '',      // 本次会话启动前运行的版本（升级后才有）
    doneTimer: 0,
    skipReload: false,    // 别的标签正在接管时，本标签不跟着刷（避免多标签齐刷）
  };

  const listeners = new Set();

  /** 当前状态快照：更新记录面板的状态条就吃这个对象 */
  function snapshot() {
    return {
      phase: state.phase,
      running: state.running,
      runningBuild: state.runningBuild,
      remote: state.remote,
      remoteBuild: state.remoteBuild,
      progress: state.progress,
      checkedAt: state.checkedAt,
      canApply: Boolean(state.waiting),
      prevVersion: state.prevVersion,
    };
  }

  function emit() {
    const snap = snapshot();
    for (const fn of listeners) {
      try { fn(snap); } catch { /* 单个订阅者出错不影响其他 */ }
    }
    return snap;
  }

  function setPhase(phase) {
    state.phase = phase;
    renderEntry();
    emit();
  }

  function subscribe(fn) {
    listeners.add(fn);
    try { fn(snapshot()); } catch { /* 忽略 */ }
    return () => listeners.delete(fn);
  }

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
      // 入口按钮文案由 renderEntry() 统一管，这里只负责把入口亮出来
      if (state.running && el.btn) el.btn.hidden = false;
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
    if (state.running) remember(state.running);
  }

  function remember(v) {
    writeLS(LS_SEEN, v);
  }

  /** 远端是否比当前运行的新（版本号或构建号任一更大） */
  function isNewer() {
    if (!state.remote || !state.running) return false;
    const sameVer = cmpVersion(state.remote, state.running) === 0;
    return cmpVersion(state.remote, state.running) > 0
      || (sameVer && state.remoteBuild > state.runningBuild);
  }

  /* ── 检查更新（面板打开时自动调 / 用户点「检查更新」）──────── */
  async function checkNow({ force = false } = {}) {
    // 60s 内复用上次结果，避免反复开关面板打请求
    if (!force && state.checkedAt && Date.now() - state.checkedAt < CHECK_REUSE_MS
        && state.phase !== 'idle' && state.phase !== 'offline') {
      return emit();
    }

    // 用户正看着面板：这段时间内不要自动重启（否则一点检查就刷新，体验极差）
    state.suppressUntil = Date.now() + MANUAL_SUPPRESS_MS;
    setPhase('checking');

    let v;
    try {
      v = await fetchJSON('./version.json');
    } catch {
      setPhase('offline');
      return emit();
    }

    state.remote = v.version || '';
    state.remoteBuild = Number(v.build) || 0;

    if (!isNewer()) {
      setPhase('latest');
      return emit();
    }

    // 有新版本：已有 waiting 的直接报 ready；否则让 SW 去下载
    if (state.waiting) {
      state.detectedAt = 0;
      setPhase('ready');
      return emit();
    }

    setPhase('available');
    const ready = await ensureDownload();
    if (ready) {
      state.waiting = ready;
      state.detectedAt = 0;
      setPhase('ready');
    } else {
      // 版本号变了但壳没变（只改了主题/更新记录）→ 数据已同步，不需要重启
      setPhase('data-only');
    }
    return emit();
  }

  /** 触发 SW 检查并等新 worker 进入 installed；返回 waiting worker 或 null */
  async function ensureDownload() {
    if (!state.reg) return null;
    try { await state.reg.update(); } catch { /* 离线/被限流：下一轮再试 */ }

    const worker = state.reg.installing || state.reg.waiting;
    if (worker && worker.state !== 'installed' && worker.state !== 'redundant') {
      await new Promise((resolve) => {
        const timer = setTimeout(resolve, 20000);
        worker.addEventListener('statechange', () => {
          if (worker.state === 'installed' || worker.state === 'redundant') {
            clearTimeout(timer);
            resolve();
          }
        });
      });
    }
    return state.reg.waiting || (worker && worker.state === 'installed' ? worker : null);
  }

  /* ── 提示卡（只给 #upd-demo 预览用）────────────────────── */
  const escHtml = (s) => String(s == null ? '' : s)
    .replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));

  /** 按文案猜分类，给「发布小票」打标签 */
  function kindOf(text) {
    if (/修复|修正|解决|bug|报错/i.test(text)) return { kind: 'fix', label: '修复' };
    if (/优化|提速|加快|减少|更快|静默|缓存|不丢/.test(text)) return { kind: 'opt', label: '优化' };
    return { kind: 'new', label: '新功能' };
  }

  /** 取「上次看到之后」的更新条目（优先手写亮点，最多 3 条） */
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
      const highlights = Array.isArray(r.highlights) ? r.highlights.filter(Boolean) : [];
      if (highlights.length) {
        for (const t of highlights) {
          if (items.length < 3) items.push({ ...kindOf(t), text: t });
        }
      }
      for (const g of r.groups || []) {
        for (const it of g.items || []) {
          total += 1;
          if (items.length < 3 && it && it.text && !it.dev) {
            items.push({ ...kindOf(it.text), text: it.text });
          }
        }
      }
    }
    return { items: items.slice(0, 3), total, scope };
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
    if (el.now) {
      el.now.disabled = false;
      el.now.textContent = '立即更新';
    }
    el.now.hidden = !canUpdate;
    el.card.hidden = false;
    if (el.dot) el.dot.hidden = false;
  }

  function hideCard() {
    if (el.card) el.card.hidden = true;
  }

  /* ── 右下角入口的三种形态 ─────────────────────────────── */
  function renderEntry() {
    if (!el.btn || !el.ver) return;
    const p = state.phase;
    const hot = p === 'ready' || p === 'available' || p === 'downloading';
    el.btn.classList.toggle('hot', hot);
    if (p === 'downloading') el.ver.textContent = '更新下载中';
    else if (p === 'ready') el.ver.textContent = '有新版本';
    else el.ver.textContent = '更新记录';
    if (el.dot) el.dot.hidden = !hot;
    el.btn.title = hot ? '有新版本，点开查看' : '查看更新记录';
  }

  /* ── Service Worker ───────────────────────────────────── */
  function initSW() {
    if (!('serviceWorker' in navigator)) return;
    const okProto = location.protocol === 'https:' || ['localhost', '127.0.0.1'].includes(location.hostname);
    if (!okProto) return;   // file:// 打开时不注册，功能不受影响，只是没离线

    // 首次安装时 clients.claim() 也会触发 controllerchange，
    // 但那一刻页面本来就在跑新版本 —— 再 reload 一次纯属多余
    const hadController = !!navigator.serviceWorker.controller;

    // SW 上报的下载进度（真实文件数与字节）
    navigator.serviceWorker.addEventListener('message', (event) => {
      const d = event.data || {};
      if (d.type !== 'PRECACHE_PROGRESS') return;
      state.progress = { done: d.done || 0, total: d.total || 0, bytes: d.bytes || 0 };
      if (d.finished) {
        // 下载结束：把真实统计存起来，reload 之后补进「更新诊断」
        writeLS(LS_PENDING, JSON.stringify({
          from: state.running,
          files: d.total || 0,
          bytes: d.bytes || 0,
          ms: d.ms || 0,
        }));
      }
      if (state.phase !== 'applying') setPhase('downloading');
    });

    navigator.serviceWorker.register('./sw.js', { updateViaCache: 'none' }).then((reg) => {
      state.reg = reg;

      // 已有 waiting 的（上次没更新就关了页面）→ 视为「更新已就绪」
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

      // 定时 + 回前台时主动查（回前台 5 分钟节流）
      setInterval(() => reg.update().catch(() => {}), CHECK_MS);
      let lastVisibleCheck = 0;
      document.addEventListener('visibilitychange', () => {
        // 切走就是最佳重启时机：页面不可见，用户看不到刷新
        if (document.visibilityState === 'hidden') { tryAutoApply(true); return; }
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
      // 记下「刚升级完」＋「从哪个版本升上来的」：
      // 新页面据此弹小提示，并在打开更新记录时把 since 定成旧版本 —— 才看得见本次更新
      writeLS(LS_UPGRADED, String(Date.now()));
      if (state.running) writeLS(LS_PREV, state.running);
      if (bc) bc.postMessage({ type: 'APPLIED', tab: TAB_ID });
      location.reload();
    });
  }

  /* ── 更新就绪：后台已装好，等一个合适的重启时机 ──────────── */
  function onReady() {
    if (!state.detectedAt) state.detectedAt = Date.now();
    setPhase('ready');

    // 预览入口（#upd-demo）：只展示「发布小票」，不自动更新
    if (location.hash === '#upd-demo') { showReadyCard(); return; }

    tryAutoApply();
  }

  /** 「发布小票」（仅 #upd-demo 预览用；正常流程只弹右下角小提示） */
  function showReadyCard() {
    if (isDismissed()) return;
    const since = readLS(LS_SEEN);
    const ver = state.remote || state.running || '';
    const build = state.remoteBuild || state.runningBuild || 0;
    const { items, total, scope } = highlightsSince(since);
    const date = state.data && state.data.generatedAt
      ? String(state.data.generatedAt).slice(0, 10) : '';
    const title = total > 0
      ? (scope === 'latest' ? `最近 ${total} 条更新，已下载完成` : `本次共 ${total} 条更新，已下载完成`)
      : '界面与排版体验优化，已下载完成';
    showCard(title, {
      canUpdate: Boolean(state.waiting),
      badge: ver ? (build ? `v${ver} · b${build}` : 'v' + ver) : '新版',
      date,
      items: items.length ? items : [{ kind: 'opt', label: '优化', text: '界面与排版体验优化' }],
    });
  }

  /**
   * 静默重启（2026-10-29 用户拍板方案 A）：
   *   · 页面已切走（hidden）→ 立即重启，用户看不到
   *   · 或 可见但空闲满 AUTO_RESTART_IDLE_MS（10 分钟）且确实没在输入
   *   · 用户刚点过检查/正开着面板（suppressUntil）→ 一律不动，等他点「立即重启」
   * 其余情况只在面板里显示「新版本已就绪」，不打断。
   */
  function tryAutoApply(hiddenNow = false) {
    if (!state.waiting || state.applying || isDismissed()) return;
    if (Date.now() < state.suppressUntil) return;

    const hidden = hiddenNow || document.visibilityState === 'hidden';
    const idleLong = Boolean(state.detectedAt)
      && Date.now() - state.detectedAt >= AUTO_RESTART_IDLE_MS
      && typeof window.__supersuIsIdle === 'function'
      && window.__supersuIsIdle();

    if (!hidden && !idleLong) return;
    applyUpdate();
  }

  /** 「稍后」的 key：运行版本 + 构建号（同一次运行里构建号不变，视为同一版本） */
  function dismissKey() {
    return state.running
      ? `${state.running}#${state.runningBuild || 0}`
      : (state.remote ? `${state.remote}#${state.remoteBuild || 0}` : '');
  }

  function isDismissed() {
    const dismissed = readLS(LS_DISMISSED);
    const key = dismissKey();
    return !!(dismissed && key && dismissed === key);
  }

  /* ── 远端版本轮询（不依赖 SW，只用于自动发现）───────────── */
  async function checkRemoteVersion() {
    try {
      const v = await fetchJSON('./version.json');
      state.remote = v.version || '';
      state.remoteBuild = Number(v.build) || 0;
      if (!isNewer()) return;
      // 关键：版本号或构建号变大就拉一次 SW；装好后 onReady → 按新策略决定何时重启
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
    setPhase('applying');
    if (el.now) { el.now.disabled = true; el.now.textContent = '更新中…'; }

    let handedOff = false;
    // 兜底：15 秒还没等到 controllerchange 就恢复，避免永远卡在「更新中…」
    const resetTimer = setTimeout(() => {
      if (handedOff) return;
      state.applying = false;
      if (el.now) { el.now.disabled = false; el.now.textContent = '立即更新'; }
      setPhase(state.waiting ? 'ready' : 'idle');
      showDone('更新好像没成功，请刷新页面后再试一次');
    }, 15000);

    try {
      // 关键：先让页面把编辑器内容落盘，再让新 SW 接管
      await flushDraft();
      if (state.running) writeLS(LS_PREV, state.running);

      if (state.waiting) {
        handedOff = true;
        if (bc) bc.postMessage({ type: 'APPLYING', tab: TAB_ID });
        state.waiting.postMessage({ type: 'SKIP_WAITING' });
        // 新 worker 激活会触发 controllerchange → 那里统一 reload
        return;
      }

      // 没有 waiting 的 worker（可能是 version.json 先变了）→ 拉一次 SW 再试
      const ready = await ensureDownload();
      if (ready) {
        state.waiting = ready;
        handedOff = true;
        if (bc) bc.postMessage({ type: 'APPLYING', tab: TAB_ID });
        ready.postMessage({ type: 'SKIP_WAITING' });
        return;
      }

      state.applying = false;
      if (el.now) { el.now.disabled = false; el.now.textContent = '立即更新'; }
      setPhase('latest');
      showDone('当前已是最新版本');
    } finally {
      if (!handedOff) {
        clearTimeout(resetTimer);
        state.applying = false;   // 没交棒就允许下次再试（交棒后页面即将 reload）
      }
    }
  }

  /* ── 更新记录面板 ─────────────────────────────────────── */
  function openChangelog(opts = {}) {
    if (!changelog) return;
    // 升级后第一次打开：用「升级前的版本」当 since，才能看见本次更新
    const prev = state.prevVersion;
    let since = opts.since;
    let mode = opts.mode;
    if (since === undefined) {
      since = prev || readLS(LS_SEEN);
      if (!mode) mode = prev ? 'update' : 'browse';
    }
    // 用户主动打开面板：期间别自动重启
    state.suppressUntil = Date.now() + MANUAL_SUPPRESS_MS;
    changelog.open({ since, mode: mode || 'browse' });
    hideCard();
  }

  /* ── 事件绑定 ─────────────────────────────────────────── */
  function bind() {
    if (el.btn) el.btn.addEventListener('click', () => openChangelog());
    if (el.later) {
      el.later.addEventListener('click', () => {
        if (location.hash !== '#upd-demo') {
          const key = dismissKey();
          if (key) writeLS(LS_DISMISSED, key);
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

    // 面板里的状态条要能触发「检查更新 / 立即重启」
    if (changelog && typeof changelog.bindUpdate === 'function') {
      changelog.bindUpdate({
        check: (force) => checkNow({ force }),
        apply: () => applyUpdate(),
        subscribe,
        onSeen: () => { if (state.running) remember(state.running); },
        getDiagnostics: diagnostics,
      });
    }
  }

  /** 更新诊断：最近几次更新的真实字节/文件数/耗时，出错时可复制给人看 */
  function diagnostics() {
    try {
      const arr = JSON.parse(readLS(LS_LAST) || '[]');
      return Array.isArray(arr) ? arr.slice(0, 5) : [];
    } catch { return []; }
  }

  /** 记一条更新诊断（最多留 5 条） */
  function recordUpdate(entry) {
    try {
      const arr = JSON.parse(readLS(LS_LAST) || '[]');
      arr.unshift(entry);
      writeLS(LS_LAST, JSON.stringify(arr.slice(0, 5)));
    } catch { /* 忽略 */ }
  }

  /** 把 SW 在安装期间写的 pending 统计落成一条诊断记录（reload 后补） */
  function finishDiagnostics() {
    let pending = null;
    try { pending = JSON.parse(readLS(LS_PENDING) || 'null'); } catch { pending = null; }
    if (!pending) return;
    try { localStorage.removeItem(LS_PENDING); } catch { /* 忽略 */ }
    recordUpdate({
      at: Date.now(),
      from: pending.from || '',
      to: state.running || '',
      files: pending.files || 0,
      bytes: pending.bytes || 0,
      ms: pending.ms || 0,
      ok: true,
    });
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

    finishDiagnostics();

    // 只认刚发生（10 分钟内）的升级；更早的标记视为过期
    if (!at || Date.now() - at > 10 * 60 * 1000) return;
    if (!el.done || !state.running) return;

    const build = state.runningBuild || 0;
    const text = build ? `已升级到 v${state.running} · b${build}` : `已升级到 v${state.running}`;
    // 等首屏稳定后再弹，避免和启动动画抢眼
    setTimeout(() => {
      showDone(text);
      setPhase('done');
    }, 700);
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

    // 上一次升级留下的「旧版本」：本次会话用它当更新记录的 since
    state.prevVersion = readLS(LS_PREV);

    bind();
    await loadVersion();
    await loadChangelog();
    reconcileSeenVersion();
    initSW();
    checkRemoteVersion();
    renderEntry();

    // 预览入口：地址加 #upd-demo 直接展示「发布小票」
    if (location.hash === '#upd-demo') {
      setTimeout(() => { onReady(); }, 800);
    }

    showUpgradedIfAny();
  }

  return {
    start,
    openChangelog,
    applyUpdate,
    checkNow,
    subscribe,
    snapshot,
    get version() { return state.running; },
  };
}
