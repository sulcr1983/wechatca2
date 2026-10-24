#!/usr/bin/env node
/* PWA 白名单构建：仓库 → pwa/dist/
 *
 * 为什么是白名单而不是 `cp -r`：仓库里同时存在本地版专属资产（截图、原型、
 * screenshot-backgrounds 等）。PWA 只该发「渲染内核 + 主题 + 字体 + 封面模板」，
 * 漏拷一个目录就会把不该公开的东西带上线。所以这里逐项列出，且构建末尾跑断言。
 *
 * 用法：node pwa/scripts/build.mjs [--skip-assert]
 */

import { createHash } from 'node:crypto';
import { deflateRawSync } from 'node:zlib';
import { execSync, execFileSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { TEMPLATE_STYLES } from '../src/cover/catalog.js';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const PWA = path.resolve(HERE, '..');
const ROOT = path.resolve(PWA, '..');
const DIST = path.join(PWA, 'dist');

const log = (...a) => console.log(...a);
const rel = (p) => path.relative(ROOT, p).replace(/\\/g, '/');

/** 内容指纹（16 位十六进制足够；用来做增量缓存键与 BUILD_ID） */
const sha256 = (buf) => createHash('sha256').update(buf).digest('hex').slice(0, 16);

// 与 sw.js 的 SHELL_CRITICAL + SHELL_OPTIONAL 保持一致：
// 这些文件决定 BUILD_ID，任何变化都应该让浏览器认为 sw.js 是新的
const SHELL_FILES = [
  'index.html',
  'src/app.js',
  'src/style.css',
  'src/bridge.js',
  'src/engine.worker.js',
  'src/update/index.js',
  'src/update/ui.js',
  'src/ai.js',
  'src/export.js',
  'src/images.js',
  'src/nine.js',
  'src/light.js',
  'src/cover/index.js',
  'src/cover/catalog.js',
  'src/cover/templates.js',
  'src/cover/render.js',
  'src/cover/search.js',
  'src/cover/cover.css',
  'vendor/modern-screenshot.js',
  'vendor/fflate.min.js',
  'src/update/changelog.js',
  'src/update/update.css',
  'manifest.webmanifest',
  'fonts/fonts.css',
  'fonts/cover-fonts.css',
  // 图标也算：只换图标像素时 sw.js 必须变，否则永远不触发更新
  'icons/favicon-32.png',
  'icons/apple-touch-icon.png',
  'icons/icon-192.png',
  'icons/icon-512.png',
  'icons/icon-512-maskable.png',
  // 品牌徽标（顶栏 / 启动条 / 更新区用）：公共源在 public/brand，构建时拷进 dist/brand
  'brand/logo-64.png',
  'brand/logo-256.png',
];

/* ── 文件操作 ─────────────────────────────────────────────────── */
function rmrf(p) { fs.rmSync(p, { recursive: true, force: true }); }

function mkdirp(p) { fs.mkdirSync(p, { recursive: true }); }

function copyFile(from, to) {
  mkdirp(path.dirname(to));
  fs.copyFileSync(from, to);
}

/** 目录白名单拷贝：include 是相对路径正则，exclude 优先 */
function copyDir(fromDir, toDir, { include, exclude } = {}) {
  let n = 0;
  const walk = (dir) => {
    for (const ent of fs.readdirSync(dir, { withFileTypes: true })) {
      const src = path.join(dir, ent.name);
      const relPath = path.relative(fromDir, src).replace(/\\/g, '/');
      if (exclude && exclude.test(relPath)) continue;
      if (ent.isDirectory()) { walk(src); continue; }
      if (include && !include.test(relPath)) continue;
      copyFile(src, path.join(toDir, relPath));
      n += 1;
    }
  };
  walk(fromDir);
  return n;
}

/* ── 极简 zip 写入器（zlib 内置，无第三方依赖）───────────────────
 * 用来把 markdown 包打成一个 zip：浏览器里靠 Python 的 zipimport 直接 import，
 * 避免往 Pyodide 内存 FS 写 51 个文件。
 * 注意：必须带上 markdown-<ver>.dist-info/，否则 markdown 的 entry points
 * 解析会退化成 import_module('tables') 并报 ModuleNotFoundError。
 */
const CRC_TABLE = (() => {
  const t = new Int32Array(256);
  for (let i = 0; i < 256; i++) {
    let c = i;
    for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    t[i] = c;
  }
  return t;
})();

function crc32(buf) {
  let c = 0 ^ -1;
  for (let i = 0; i < buf.length; i++) c = (c >>> 8) ^ CRC_TABLE[(c ^ buf[i]) & 0xff];
  return (c ^ -1) >>> 0;
}

function writeZip(zipPath, entries) {
  // entries: [{ name, data }]
  const chunks = [];
  const central = [];
  let offset = 0;

  for (const { name, data } of entries) {
    const nameBuf = Buffer.from(name, 'utf8');
    const comp = deflateRawSync(data, { level: 9 });
    const crc = crc32(data);

    const local = Buffer.alloc(30);
    local.writeUInt32LE(0x04034b50, 0);
    local.writeUInt16LE(20, 4);            // version needed
    local.writeUInt16LE(0x0800, 6);        // UTF-8 flag
    local.writeUInt16LE(8, 8);             // deflate
    local.writeUInt32LE(0, 10);            // mtime/date 置零 → 可复现
    local.writeUInt32LE(crc, 14);
    local.writeUInt32LE(comp.length, 18);
    local.writeUInt32LE(data.length, 22);
    local.writeUInt16LE(nameBuf.length, 26);
    local.writeUInt16LE(0, 28);

    chunks.push(local, nameBuf, comp);

    const cen = Buffer.alloc(46);
    cen.writeUInt32LE(0x02014b50, 0);
    cen.writeUInt16LE(20, 4);
    cen.writeUInt16LE(20, 6);
    cen.writeUInt16LE(0x0800, 8);
    cen.writeUInt16LE(8, 10);
    cen.writeUInt32LE(0, 12);
    cen.writeUInt32LE(crc, 16);
    cen.writeUInt32LE(comp.length, 20);
    cen.writeUInt32LE(data.length, 24);
    cen.writeUInt16LE(nameBuf.length, 28);
    cen.writeUInt32LE(offset, 42);
    central.push(Buffer.concat([cen, nameBuf]));

    offset += local.length + nameBuf.length + comp.length;
  }

  const cenBuf = Buffer.concat(central);
  const end = Buffer.alloc(22);
  end.writeUInt32LE(0x06054b50, 0);
  end.writeUInt16LE(entries.length, 8);
  end.writeUInt16LE(entries.length, 10);
  end.writeUInt32LE(cenBuf.length, 12);
  end.writeUInt32LE(offset, 16);

  mkdirp(path.dirname(zipPath));
  fs.writeFileSync(zipPath, Buffer.concat([...chunks, cenBuf, end]));
  return fs.statSync(zipPath).size;
}

/* ── 主题索引 ─────────────────────────────────────────────────── */
const FAMILIES = ['biz', 'feast', 'letter', 'minimal', 'night', 'stamp', 'dusk', 'frost'];

function familyOf(id) {
  const m = /^su-([a-z]+)-/.exec(id);
  return m && FAMILIES.includes(m[1]) ? m[1] : '';
}

function buildThemeIndex() {
  const dir = path.join(ROOT, 'public', 'themes');
  const files = fs.readdirSync(dir).filter((f) => f.endsWith('.json'));
  const index = [];

  for (const f of files) {
    const id = f.replace(/\.json$/, '');
    let theme;
    try {
      theme = JSON.parse(fs.readFileSync(path.join(dir, f), 'utf8'));
    } catch (e) {
      throw new Error(`主题 JSON 解析失败：${f} — ${e.message}`);
    }
    const c = theme.colors || {};
    index.push({
      id,
      name: theme.name || id,
      desc: theme.description || '',
      primary: c.primary || '#191713',
      accent: c.accent || '#AF3E2B',
      background: c.background || '#FFFFFF',
      family: familyOf(id),
    });
  }

  index.sort((a, b) => a.id.localeCompare(b.id));
  return index;
}

/* ── 主流程 ───────────────────────────────────────────────────── */
function main() {
  const t0 = Date.now();
  log('构建 PWA → ' + rel(DIST));
  rmrf(DIST);
  mkdirp(DIST);

  /* 1. app shell */
  copyFile(path.join(PWA, 'index.html'), path.join(DIST, 'index.html'));
  copyDir(path.join(PWA, 'src'), path.join(DIST, 'src'), { include: /\.(js|css)$/ });
  copyFile(path.join(PWA, 'public', 'manifest.webmanifest'), path.join(DIST, 'manifest.webmanifest'));
  copyDir(path.join(PWA, 'public', 'icons'), path.join(DIST, 'icons'), { include: /\.png$/ });
  // 品牌徽标：与本地版共用同一份源（public/brand），避免两版 logo 各存一份漂移
  copyDir(path.join(ROOT, 'public', 'brand'), path.join(DIST, 'brand'), { include: /\.png$/ });
  copyFile(path.join(PWA, 'public', 'sw.js'), path.join(DIST, 'sw.js'));
  log('  ✓ app shell');

  /* 2. 字体（自托管，禁 Google Fonts） */
  const fontN = copyDir(path.join(PWA, 'public', 'fonts'), path.join(DIST, 'fonts'),
    { include: /\.(woff2|css|txt)$/ });
  log(`  ✓ 字体 ${fontN} 个文件`);

  /* 2.5 Pyodide 运行时（同源自托管：一次下载永久命中，去掉 jsdelivr 单点） */
  const runtimeSrc = path.join(PWA, 'public', 'runtime');
  if (!fs.existsSync(runtimeSrc)) {
    throw new Error('缺 pwa/public/runtime/pyodide/0.28.3（引擎无法启动）');
  }
  const runtimeN = copyDir(runtimeSrc, path.join(DIST, 'runtime'), { include: /\.(js|wasm|zip|json)$/ });
  log(`  ✓ Pyodide 运行时 ${runtimeN} 个文件（同源）`);

  /* 3. 主题 JSON + 索引 */
  const index = buildThemeIndex();
  mkdirp(path.join(DIST, 'themes'));
  for (const t of index) {
    copyFile(path.join(ROOT, 'public', 'themes', `${t.id}.json`), path.join(DIST, 'themes', `${t.id}.json`));
  }
  fs.writeFileSync(path.join(DIST, 'themes', 'index.json'), JSON.stringify(index), 'utf8');
  log(`  ✓ 主题 ${index.length} 套（索引 ${(fs.statSync(path.join(DIST, 'themes', 'index.json')).size / 1024).toFixed(1)}KB）`);

  /* 4. 缩略图 */
  const thumbDir = path.join(ROOT, 'public', 'theme-thumbs');
  let thumbN = 0;
  if (fs.existsSync(thumbDir)) {
    thumbN = copyDir(thumbDir, path.join(DIST, 'theme-thumbs'), { include: /\.jpg$/ });
  }
  log(`  ✓ 缩略图 ${thumbN} 张`);

  /* 5. Python 引擎 + markdown.zip */
  mkdirp(path.join(DIST, 'py'));
  for (const name of ['format_engine.py', 'preprocessor.py']) {
    copyFile(path.join(ROOT, 'core', name), path.join(DIST, 'py', name));
  }

  const mdDir = path.join(ROOT, '.venv', 'Lib', 'site-packages');
  const mdPkg = path.join(mdDir, 'markdown');
  if (!fs.existsSync(mdPkg)) throw new Error('找不到 markdown 包，请先 pip install -r requirements.txt');

  const entries = [];
  const walkAdd = (dir, prefix) => {
    for (const ent of fs.readdirSync(dir, { withFileTypes: true })) {
      if (ent.name === '__pycache__') continue;
      const p = path.join(dir, ent.name);
      if (ent.isDirectory()) { walkAdd(p, `${prefix}${ent.name}/`); continue; }
      entries.push({ name: `${prefix}${ent.name}`, data: fs.readFileSync(p) });
    }
  };
  walkAdd(mdPkg, 'markdown/');

  // dist-info 是必需的：markdown 3.10 用 entry points 解析扩展名
  const distInfo = fs.readdirSync(mdDir).find((n) => /^markdown-.*\.dist-info$/.test(n));
  if (!distInfo) throw new Error('找不到 markdown 的 dist-info，zipimport 下扩展会加载失败');
  for (const f of ['METADATA', 'entry_points.txt', 'top_level.txt', 'WHEEL']) {
    const p = path.join(mdDir, distInfo, f);
    if (fs.existsSync(p)) entries.push({ name: `${distInfo}/${f}`, data: fs.readFileSync(p) });
  }

  const zipSize = writeZip(path.join(DIST, 'py', 'markdown.zip'), entries);
  log(`  ✓ 引擎 py/ + markdown.zip（${entries.length} 项，${(zipSize / 1024).toFixed(0)}KB）`);

  /* 5.5 增量清单：每个数据文件的 sha256（SW 用它判断「这个文件变没变」） */
  const manifest = buildDataManifest();
  log(`  ✓ 增量清单 themes/manifest.json（${Object.keys(manifest).length} 项）`);

  /* 6. 封面模板（默认包含）：清洗 Google Fonts / WCAG 强制白字段 / 本地底图路径，
   *    输出单文件 HTML；缩略图改放 cover-thumbs（social-thumb 仍属本地版专属目录）。 */
  const coverSrc = path.join(ROOT, 'public', 'cover-templates');
  mkdirp(path.join(DIST, 'cover-templates'));
  let coverN = 0;
  for (const t of TEMPLATE_STYLES) {
    const srcFile = path.join(coverSrc, t.id, 'index.html');
    if (!fs.existsSync(srcFile)) throw new Error(`缺封面模板：${t.id}`);
    let html = fs.readFileSync(srcFile, 'utf8');
    // 去 Google Fonts（外链既违反构建断言，国内也不可达）
    html = html.replace(/<link[^>]+fonts\.(?:googleapis|gstatic)\.com[^>]*>\s*/gi, '');
    // 去「把所有文字强制白色」的补丁：纯色纸底会白字不可读；有底图时由运行时覆盖 CSS 重新加白
    html = html.replace(/\s*\/\* WCAG contrast fix \*\/[\s\S]*?(?=<\/style>)/i, '\n');
    // 底图 src 置空：模板引用的是本地版 images/，PWA 运行时会注入用户底图或移除
    html = html.replace(/(<img[^>]*class="[^"]*\bcover-img\b[^"]*"[^>]*?)\ssrc="[^"]*"/i, '$1');
    // Swiss 四套的 lead 是硬编码示例文案 → 统一成占位符
    html = html.replace(/(<p[^>]*class="[^"]*\blead\b[^"]*"[^>]*>)[\s\S]*?(<\/p>)/i, '$1{{LEAD}}$2');
    // 清掉模板自带的示例文案：kicker / t-cat 统一成「封面 · COVER」，副标题 h-sub 移除
    html = html.replace(/(<p[^>]*class="[^"]*\bkicker\b[^"]*"[^>]*>)[\s\S]*?(<\/p>)/i, '$1封面 · COVER$2');
    html = html.replace(/(<p[^>]*class="[^"]*\bt-cat\b[^"]*"[^>]*>)[\s\S]*?(<\/p>)/i, '$1封面 · COVER$2');
    html = html.replace(/<p[^>]*class="[^"]*\bh-sub\b[^"]*"[^>]*>[\s\S]*?<\/p>/i, '');
    // 示例署名与日期 → 占位符（运行时替换成用户署名 / 当前年月）
    html = html.replace(/(<p[^>]*class="[^"]*\bt-meta\b[^"]*"[^>]*>)\/\s*阿苏(<\/p>)/i, '$1/ {{AUTHOR}}$2');
    html = html.replace(/2026\.05/g, '{{DATE}}');
    html = html.replace(/<title>[\s\S]*?<\/title>/i, '<title>封面</title>');
    fs.writeFileSync(path.join(DIST, 'cover-templates', `${t.id}.html`), html, 'utf8');
    coverN += 1;
  }
  const coverThumbSrc = path.join(ROOT, 'public', 'social-thumb');
  mkdirp(path.join(DIST, 'cover-thumbs'));
  let coverThumbN = 0;
  for (const t of TEMPLATE_STYLES) {
    const p = path.join(coverThumbSrc, `${t.id}.png`);
    if (fs.existsSync(p)) {
      copyFile(p, path.join(DIST, 'cover-thumbs', `${t.id}.png`));
      coverThumbN += 1;
    }
  }
  log(`  ✓ 封面模板 ${coverN} 套 + 缩略图 ${coverThumbN} 张`);

  /* 6.5 版本与更新记录（前端更新检测靠这两个文件） */
  const ver = buildVersion();
  fs.writeFileSync(path.join(DIST, 'version.json'), JSON.stringify(ver, null, 2), 'utf8');
  log(`  ✓ 版本 v${ver.version}（git ${ver.build} 次提交，${ver.releasedAt}）`);

  // 更新记录：构建前用最新 git 历史重新生成 —— 这是「列表永远含最新内容」的保证。
  // 失败不阻断构建，沿用现有 changelog.json（保证线上不会因为生成失败而空白）。
  const genScript = path.join(PWA, 'scripts', 'gen_changelog.py');
  if (fs.existsSync(genScript)) {
    try {
      execFileSync(pickPython(), [genScript], { cwd: ROOT, stdio: 'pipe' });
      log('  ✓ 更新记录已按最新 git 历史重新生成');
    } catch (e) {
      log('  ! 重新生成更新记录失败，沿用现有 changelog.json：' + String((e && e.message) || e).split('\n')[0]);
    }
  }

  const clSrc = path.join(PWA, 'public', 'changelog.json');
  if (fs.existsSync(clSrc)) {
    copyFile(clSrc, path.join(DIST, 'changelog.json'));
    const cl = JSON.parse(fs.readFileSync(clSrc, 'utf8'));
    log(`  ✓ 更新记录 v${cl.version}（${cl.releases.length} 个版本 / ${cl.totalCommits} 次提交）`);
  } else {
    log('  ! 没有 changelog.json，跑 python pwa/scripts/gen_changelog.py 生成');
  }

  /* 7. vendor（fitty / html-to-image 等，存在才拷） */
  const vendorSrc = path.join(ROOT, 'public', 'vendor');
  if (fs.existsSync(vendorSrc)) {
    const n = copyDir(vendorSrc, path.join(DIST, 'vendor'), { include: /\.(js|css)$/ });
    if (n) log(`  ✓ vendor ${n} 个文件`);
  }

  /* 7.5 响应头 + Service Worker 指纹注入（增量更新的两个前提） */
  writeHeaders();
  const buildId = computeBuildId();
  stampSw(buildId, manifest);
  log(`  ✓ SW 构建指纹 BUILD_ID=${buildId} + 内联清单 ${Object.keys(manifest).length} 项 + _headers`);

  /* 8. 断言 */
  if (!process.argv.includes('--skip-assert')) assertDist(index.length);

  const total = dirSize(DIST);
  log(`\n完成：${(total / 1024 / 1024).toFixed(2)}MB，用时 ${((Date.now() - t0) / 1000).toFixed(1)}s`);
}

function dirSize(dir) {
  let s = 0;
  for (const ent of fs.readdirSync(dir, { withFileTypes: true })) {
    const p = path.join(dir, ent.name);
    s += ent.isDirectory() ? dirSize(p) : fs.statSync(p).size;
  }
  return s;
}

/** 当前 .venv 里的 python（重新生成更新记录用）；找不到就回退系统 python */
function pickPython() {
  for (const p of [path.join(ROOT, '.venv', 'Scripts', 'python.exe'), path.join(ROOT, '.venv', 'bin', 'python')]) {
    if (fs.existsSync(p)) return p;
  }
  return process.platform === 'win32' ? 'python' : 'python3';
}

/** 版本号：直接取 version.json 的语义化版本（主.次.修订）。
 *
 *  为什么不在这里拼提交数：更新记录里的版本号（1.3.0 / 1.2.0 …）是语义化版本，
 *  若运行版本是 1.0.<提交数>，两者对不上 → 「当前版本」高亮错位、"这次更新了 N 条"判断全乱。
 *  提交数单独放 build 字段，只做展示。发版时改 version.json 的 version 即可。
 */
function buildVersion() {
  let base = { name: 'SuperSu PWA', version: '1.0.0' };
  try {
    base = JSON.parse(fs.readFileSync(path.join(PWA, 'version.json'), 'utf8'));
  } catch { /* 缺文件就用默认 */ }
  let commits = 0;
  try {
    commits = parseInt(execSync('git rev-list --count HEAD', { cwd: ROOT }).toString().trim(), 10) || 0;
  } catch { /* 非 git 环境 */ }
  return {
    ...base,
    version: String(base.version || '1.0.0'),
    // 用本地日期：toISOString() 在东八区凌晨会退回前一天，发布小票日期会错
    releasedAt: (() => {
      const d = new Date();
      return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
    })(),
    build: commits,
  };
}

/* ── 增量清单 / 构建指纹 / 响应头 ─────────────────────────────── */

/** 生成 themes/manifest.json：{ "themes/xxx.json": "<sha256>", "py/xxx": "<sha256>" } */
function buildDataManifest() {
  const manifest = {};
  const addDir = (relDir, accept) => {
    const abs = path.join(DIST, relDir);
    if (!fs.existsSync(abs)) return;
    for (const f of fs.readdirSync(abs)) {
      if (!accept(f)) continue;
      const relPath = `${relDir}/${f}`;
      manifest[relPath] = sha256(fs.readFileSync(path.join(DIST, relPath)));
    }
  };
  addDir('themes', (f) => f.endsWith('.json') && f !== 'manifest.json');
  addDir('py', () => true);
  fs.writeFileSync(path.join(DIST, 'themes', 'manifest.json'), JSON.stringify(manifest), 'utf8');
  return manifest;
}

/** BUILD_ID = shell 文件内容哈希；文件不变 → sw.js 字节不变 → 不触发无谓更新 */
function computeBuildId() {
  const parts = [];
  for (const f of SHELL_FILES) {
    const p = path.join(DIST, f);
    if (fs.existsSync(p)) parts.push(f + ':' + sha256(fs.readFileSync(p)));
  }
  return sha256(parts.join('|'));
}

/** 把 sw.js 里的占位符替换成本次构建指纹 + 内联数据清单 */
function stampSw(buildId, manifest) {
  const p = path.join(DIST, 'sw.js');
  let src = fs.readFileSync(p, 'utf8');
  if (!src.includes('__BUILD_ID__')) {
    throw new Error('sw.js 缺少 __BUILD_ID__ 占位符，无法注入构建指纹');
  }
  if (!src.includes('/*__DATA_MANIFEST__*/')) {
    throw new Error('sw.js 缺少 /*__DATA_MANIFEST__*/ 占位符，无法内联数据清单');
  }
  // 内联而不是运行时 fetch：SW 被回收后离线重启时，manifest 请求必然失败，
  // 拿不到清单就会退回普通键 → 与 ?h= 键不匹配 → 离线主题/引擎全废
  src = src.replace('/*__DATA_MANIFEST__*/', `DATA_MANIFEST = ${JSON.stringify(manifest)};`);
  src = src.replace(/__BUILD_ID__/g, buildId);
  fs.writeFileSync(p, src, 'utf8');
}

/* ── Cloudflare Pages 响应头 ──────────────────────────────────── */
const HEADERS_TXT = `# 由 pwa/scripts/build.mjs 生成（2026-10-18 增量更新）
# 只有「URL 随内容变」的资源才配长缓存；HTML / SW / 版本文件必须每次校验。
# themes、py 走 ?h=<sha256> 缓存键，由 Service Worker 命中，这里用默认策略。

/index.html
  Cache-Control: public, max-age=0, must-revalidate

/sw.js
  Cache-Control: public, max-age=0, must-revalidate

/version.json
  Cache-Control: public, max-age=0, must-revalidate

/changelog.json
  Cache-Control: public, max-age=0, must-revalidate

/themes/manifest.json
  Cache-Control: public, max-age=0, must-revalidate

/fonts/*.woff2
  Cache-Control: public, max-age=31536000, immutable

/fonts/fonts.css
  Cache-Control: public, max-age=0, must-revalidate

/runtime/*
  Cache-Control: public, max-age=31536000, immutable

/runtime/pyodide/0.28.3/pyodide.asm.wasm
  Content-Type: application/wasm

/theme-thumbs/*
  Cache-Control: public, max-age=86400
`;

function writeHeaders() {
  fs.writeFileSync(path.join(DIST, '_headers'), HEADERS_TXT, 'utf8');
}

/* ── 构建断言：漏拷或误拷都让构建失败 ───────────────────────────── */
function assertDist(themeCount) {
  const problems = [];
  const walk = (dir) => {
    for (const ent of fs.readdirSync(dir, { withFileTypes: true })) {
      const p = path.join(dir, ent.name);
      const r = path.relative(DIST, p).replace(/\\/g, '/');
      if (ent.isDirectory()) { walk(p); continue; }
      // 1) 本地版专属目录不得出现
      if (/^(screenshot-backgrounds|prototypes|social-thumb|node_modules)\//.test(r)) {
        problems.push(`不该进包：${r}`);
      }
      // 2) 任何文本文件里不得残留 Google Fonts 外链
      if (/\.(html|css|js|json|webmanifest)$/.test(r)) {
        const txt = fs.readFileSync(p, 'utf8');
        if (txt.includes('fonts.googleapis.com')) problems.push(`残留 Google Fonts 外链：${r}`);
      }
    }
  };
  walk(DIST);

  // 3) 主题数量与索引一致
  const themeFiles = fs.readdirSync(path.join(DIST, 'themes'))
    .filter((f) => f.endsWith('.json') && f !== 'index.json' && f !== 'manifest.json');
  if (themeFiles.length !== themeCount) {
    problems.push(`主题文件数 ${themeFiles.length} ≠ 索引 ${themeCount}`);
  }

  // 4) 封面模板齐全（10 套，清洗后的单文件）
  for (const t of TEMPLATE_STYLES) {
    if (!fs.existsSync(path.join(DIST, 'cover-templates', `${t.id}.html`))) {
      problems.push(`缺封面模板：${t.id}`);
    }
  }

  // 5) 关键文件存在
  for (const need of ['index.html', 'sw.js', 'manifest.webmanifest', 'src/app.js', 'src/engine.worker.js',
                     'src/update/index.js', 'src/update/ui.js', 'src/update/changelog.js',
                     'src/update/update.css',
                     'version.json', 'py/markdown.zip', 'themes/index.json', '_headers',
                     'brand/logo-64.png', 'brand/logo-256.png',
                     'fonts/cover-fonts.css', 'fonts/cover/noto-serif-sc-400.woff2',
                     'fonts/cover/noto-sans-sc-400.woff2',
                     'src/cover/index.js', 'src/cover/catalog.js', 'src/cover/templates.js',
                     'src/cover/render.js', 'src/cover/search.js', 'src/cover/cover.css',
                     'src/export.js', 'src/images.js', 'src/nine.js',
                     'vendor/modern-screenshot.js', 'vendor/fflate.min.js']) {
    if (!fs.existsSync(path.join(DIST, need))) problems.push(`缺文件：${need}`);
  }

  // 6) 增量更新的前置条件（少一条就退化成全量更新）
  const swSrc = fs.readFileSync(path.join(DIST, 'sw.js'), 'utf8');
  if (swSrc.includes('__BUILD_ID__')) problems.push('sw.js 的 __BUILD_ID__ 未注入（BUILD_ID 不生效）');
  if (swSrc.includes('__DATA_MANIFEST__')) problems.push('sw.js 的数据清单未内联（离线重启会拿不到 manifest）');
  if (/cache:\s*'reload'/.test(swSrc)) problems.push("sw.js 仍在使用 cache:'reload'（会绕过 ETag 304）");
  if (swSrc.includes('cover.js')) problems.push('sw.js 仍在预缓存不存在的 src/cover.js');

  const mfPath = path.join(DIST, 'themes', 'manifest.json');
  if (!fs.existsSync(mfPath)) {
    problems.push('缺文件：themes/manifest.json');
  } else {
    const mf = JSON.parse(fs.readFileSync(mfPath, 'utf8'));
    const n = Object.keys(mf).length;
    if (n < themeCount + 1) problems.push(`增量清单条目 ${n} 少于主题数 ${themeCount}+1`);
  }

  if (problems.length) {
    console.error('\n构建断言失败：');
    for (const p of problems) console.error('  ✗ ' + p);
    process.exit(1);
  }
  log(`  ✓ 断言通过（无本地版专属目录、无 Google Fonts 外链、主题数一致、关键文件齐、增量前置齐）`);
}

main();

