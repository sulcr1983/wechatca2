/* 更新模块的 DOM —— 由本模块自己注入到 #update-root。
 *
 * 为什么自建：更新这块要能独立迭代（改样式/改文案/加东西都不用动 index.html），
 * 页面里只保留一个挂载点。id 保持原样，方便测试脚本继续用。
 */

const TEMPLATE = `
  <button class="upd-btn" id="btn-update" hidden title="查看更新记录" aria-label="更新记录">
    <img class="brand-mark xs" src="./brand/logo-64.png" alt="">
    <span class="upd-dot" id="upd-dot" hidden></span>
    <span class="upd-ver" id="upd-ver">更新记录</span>
  </button>

  <div class="upd-card" id="upd-card" hidden role="status" aria-live="polite">
    <div class="upd-head">
      <img class="brand-mark" src="./brand/logo-64.png" alt="">
      <span class="upd-badge" id="upd-badge">新版</span>
      <span class="upd-date" id="upd-date"></span>
    </div>
    <p class="upd-title" id="upd-card-text">有新版本可用</p>
    <ul class="upd-list" id="upd-list"></ul>
    <div class="upd-actions">
      <button class="ghost-btn" id="upd-later">稍后</button>
      <button class="ghost-btn" id="upd-all">查看全部</button>
      <button class="primary-btn" id="upd-now">立即更新</button>
    </div>
  </div>

  <!-- 升级完成的小提示：正常流程自动更新后只弹这个（不打断、不需点按钮） -->
  <button class="upd-done" id="upd-done" type="button" hidden title="查看更新记录">
    <span class="upd-done-ico" aria-hidden="true">✓</span>
    <span id="upd-done-text">已升级</span>
  </button>
`;

/** 把更新 UI 挂到页面（幂等，重复调用不会重复插入） */
export function mountUpdateUI(rootId = 'update-root') {
  let root = document.getElementById(rootId);
  if (!root) {
    root = document.createElement('div');
    root.id = rootId;
    document.body.appendChild(root);
  }
  if (root.dataset.mounted !== '1') {
    root.innerHTML = TEMPLATE;
    root.dataset.mounted = '1';
  }
  return root;
}
