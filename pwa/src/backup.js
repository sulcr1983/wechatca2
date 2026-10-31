/* 本机数据备份 / 恢复（2026-11-01，审计 P1）
 *
 * 为什么必须做：草稿、收藏、主题偏好、封面偏好、AI/Pexels Key 全部只在
 * 单个浏览器的 localStorage 里。清缓存、换浏览器、换设备 = 全部丢失，
 * 且没有任何找回路径。这是本产品最大的实际数据丢失风险点。
 *
 * 设计取舍：
 *   · 键范围 = `supersu.` 前缀全量扫描（与 clearAll 同一套真源，新增键自动纳入，
 *     不再维护手写清单 —— 见 2026-10-30「漏删 13 个键」的教训）
 *   · API Key 默认**不导出**：备份文件可能被分享/上传，明文 Key 带出去风险高。
 *     需要迁移 Key 的用户可勾选「包含 API Key」，文件里会标注并提示勿外传。
 *   · 版本号 + 时间戳写入文件头，导入时校验来源，避免误把别的应用数据灌进来
 */

export const BACKUP_VERSION = 1;
const PREFIX = 'supersu.';

// 含密钥的键：默认排除，需用户显式勾选
const SECRET_KEYS = new Set([
  'supersu.ai',
  'supersu.ai.verified',
  'supersu.cover.stock.v1',
]);

function allKeys() {
  const out = [];
  try {
    for (let i = 0; i < localStorage.length; i++) {
      const k = localStorage.key(i);
      if (k && k.startsWith(PREFIX)) out.push(k);
    }
  } catch { /* 隐私模式读不到 */ }
  return out;
}

/** 生成备份对象。includeSecrets=false 时剔除含 Key 的键。 */
export function buildBackup({ includeSecrets = false } = {}) {
  const data = {};
  const skipped = [];
  for (const k of allKeys()) {
    if (!includeSecrets && SECRET_KEYS.has(k)) { skipped.push(k); continue; }
    try {
      data[k] = localStorage.getItem(k);
    } catch { /* 单键读取失败跳过 */ }
  }
  return {
    app: 'SuperSu',
    schema: BACKUP_VERSION,
    exportedAt: new Date().toISOString(),
    includesSecrets: !!includeSecrets,
    skippedSecretKeys: skipped,
    keyCount: Object.keys(data).length,
    data,
  };
}

/** 备份摘要（给 UI 展示：备份了哪些东西、多大） */
export function backupSummary(b) {
  const bytes = new Blob([JSON.stringify(b)]).size;
  return {
    keyCount: b.keyCount,
    bytes,
    includesSecrets: b.includesSecrets,
    hasDraft: Object.prototype.hasOwnProperty.call(b.data, 'supersu.pwa.draft'),
    skipped: b.skippedSecretKeys?.length ?? 0,
  };
}

/** 触发下载。文件名带日期，方便用户自己区分多份备份。 */
export function downloadBackup(backup) {
  const d = new Date();
  const pad = (n) => String(n).padStart(2, '0');
  const name = `supersu-backup-${d.getFullYear()}${pad(d.getMonth() + 1)}${pad(d.getDate())}`
    + `-${pad(d.getHours())}${pad(d.getMinutes())}.json`;
  const blob = new Blob([JSON.stringify(backup, null, 2)], { type: 'application/json' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = name;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
  return name;
}

/** 校验并解析备份文件内容。返回 { ok, backup, error } */
export function parseBackup(text) {
  let obj;
  try {
    obj = JSON.parse(text);
  } catch {
    return { ok: false, error: '不是合法的 JSON 文件' };
  }
  if (!obj || typeof obj !== 'object') return { ok: false, error: '文件内容为空' };
  if (obj.app !== 'SuperSu') {
    return { ok: false, error: '这不是 SuperSu 的备份文件（缺少 app 标识）' };
  }
  if (!obj.data || typeof obj.data !== 'object') {
    return { ok: false, error: '备份文件缺少 data 字段' };
  }
  const keys = Object.keys(obj.data).filter((k) => k.startsWith(PREFIX));
  if (!keys.length) return { ok: false, error: '备份里没有任何 SuperSu 数据' };
  return { ok: true, backup: obj, validKeys: keys };
}

/**
 * 应用备份。mode:
 *   'replace' = 先清空现有 supersu.* 再写入（干净的整机迁移）
 *   'merge'   = 只覆盖备份里存在的键，保留备份外的新数据
 * 返回 { written, removed, mode }
 */
export function applyBackup(backup, { mode = 'replace' } = {}) {
  let removed = 0;
  if (mode === 'replace') {
    for (const k of allKeys()) {
      try { localStorage.removeItem(k); removed++; } catch { /* 忽略 */ }
    }
  }
  let written = 0;
  for (const [k, v] of Object.entries(backup.data)) {
    if (!k.startsWith(PREFIX)) continue;
    if (typeof v !== 'string') continue;
    try { localStorage.setItem(k, v); written++; } catch { /* 配额满等，跳过 */ }
  }
  return { written, removed, mode };
}
