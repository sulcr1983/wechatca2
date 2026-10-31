/* 主线程 ⇄ Worker 的 Promise 化消息通道。
 *
 * Worker 是单线程队列，按顺序处理消息，所以我们用自增 id 配对请求与响应。
 * 超时兜底：引擎首次加载慢，但单次渲染不该超过 30 秒；超时后 reject，
 * 让 UI 能提示「引擎无响应，请刷新」而不是一直转圈。
 */

const DEFAULT_TIMEOUT = 30_000;
const BOOT_TIMEOUT = 180_000;   // 首次要下 11MB，给足时间

export function createEngine({ onProgress } = {}) {
  const worker = new Worker(new URL('./engine.worker.js', import.meta.url), { type: 'classic' });

  const pending = new Map();     // id → { resolve, reject, timer }
  let seq = 0;
  let bootResolve = null;
  let bootReject = null;
  let ready = false;

  worker.onmessage = (e) => {
    const { type, payload } = e.data || {};

    if (type === 'progress') {
      if (onProgress) onProgress(payload);
      return;
    }

    if (type === 'booted') {
      ready = true;
      if (bootResolve) bootResolve(payload);
      return;
    }

    if (type === 'error') {
      if (payload && payload.id != null && pending.has(payload.id)) {
        const job = pending.get(payload.id);
        pending.delete(payload.id);
        clearTimeout(job.timer);
        job.reject(new Error(payload.message));
      } else if (payload && payload.stage === 'boot') {
        if (bootReject) bootReject(new Error(payload.message));
      }
      return;
    }

    if (payload && payload.id != null && pending.has(payload.id)) {
      const job = pending.get(payload.id);
      pending.delete(payload.id);
      clearTimeout(job.timer);
      job.resolve(payload);
    }
  };

  worker.onerror = (e) => {
    const msg = (e && e.message) || 'Worker 加载失败';
    if (bootReject) bootReject(new Error(msg));
    for (const [, job] of pending) {
      clearTimeout(job.timer);
      job.reject(new Error(msg));
    }
    pending.clear();
  };

  const send = (msg) => worker.postMessage(msg);

  /** 启动引擎；重复调用幂等 */
  function boot() {
    if (ready) return Promise.resolve();
    return new Promise((resolve, reject) => {
      const timer = setTimeout(() => reject(new Error('引擎加载超时（网络太慢？）')), BOOT_TIMEOUT);
      bootResolve = (v) => { clearTimeout(timer); resolve(v); };
      bootReject = (e) => { clearTimeout(timer); reject(e); };
      send({ type: 'boot' });
    });
  }

  /** 把某套主题写进引擎的内存文件系统 */
  function setTheme(id, json) {
    return new Promise((resolve, reject) => {
      const myId = ++seq;
      // theme 的回执走 theme-ready，payload 里带 id，但我们的通用分发按 id 配对，
      // 所以这里直接把 id 塞进 payload 才能在 onmessage 里命中。
      pending.set(myId, { resolve, reject, timer: setTimeout(() => {
        pending.delete(myId);
        reject(new Error('主题写入超时'));
      }, DEFAULT_TIMEOUT) });
      send({ type: 'theme', payload: { id: myId, themeId: id, json } });
      // 注意：worker 回的是 theme-ready，其 payload.id 是 myId，能被上面的通用分发命中
    });
  }

  /** 渲染；返回 { html, markdown, ms } */
  /** mode：预处理模式 auto/conservative/longform/tutorial（缺省 auto，2026-10-31 UI 接线） */
  function render(text, mode) {
    return new Promise((resolve, reject) => {
      const myId = ++seq;
      const timer = setTimeout(() => {
        pending.delete(myId);
        reject(new Error('渲染超时（30 秒），请刷新重试'));
      }, DEFAULT_TIMEOUT);
      pending.set(myId, { resolve, reject, timer });
      send({ type: 'render', payload: { id: myId, text, mode: mode || 'auto' } });
    });
  }

  /** AI 排版：把 AI 给的结构决策套用到原文（正文不改一个字） */
  function applyStructure(text, plan) {
    return new Promise((resolve, reject) => {
      const myId = ++seq;
      const timer = setTimeout(() => {
        pending.delete(myId);
        reject(new Error('结构套用超时（30 秒）'));
      }, DEFAULT_TIMEOUT);
      pending.set(myId, { resolve, reject, timer });
      send({ type: 'structure', payload: { id: myId, text, plan } });
    });
  }

  function destroy() {
    for (const [, job] of pending) clearTimeout(job.timer);
    pending.clear();
    worker.terminate();
  }

  return { boot, setTheme, render, applyStructure, destroy, isReady: () => ready };
}
