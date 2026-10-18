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
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const PWA = path.resolve(HERE, '..');
const ROOT = path.resolve(PWA, '..');
const DIST = path.join(PWA, 'dist');

const log = (...a) => console.log(...a);
const rel = (p) => path.relative(ROOT, p).replace(/\\/g, '/');

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
  copyFile(path.join(PWA, 'public', 'sw.js'), path.join(DIST, 'sw.js'));
  log('  ✓ app shell');

  /* 2. 字体（自托管，禁 Google Fonts） */
  const fontN = copyDir(path.join(PWA, 'public', 'fonts'), path.join(DIST, 'fonts'),
    { include: /\.(woff2|css|txt)$/ });
  log(`  ✓ 字体 ${fontN} 个文件`);

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

  /* 6. 封面模板（D5 起；需 --cover，且模板里的 Google Fonts 外链必须已在
   *    pwa/scripts/localize_cover_fonts.py 里换成自托管，否则断言会拦下） */
  const WITH_COVER = process.argv.includes('--cover');
  const coverSrc = path.join(ROOT, 'public', 'cover-templates');
  let coverN = 0;
  if (WITH_COVER && fs.existsSync(coverSrc)) {
    coverN = copyDir(coverSrc, path.join(DIST, 'cover-templates'), { include: /\.(html|css|js|png|jpg|jpeg|webp|svg|woff2)$/ });
    copyDir(path.join(ROOT, 'public', 'images'), path.join(DIST, 'images'), { include: /\.(jpg|jpeg|png|webp)$/ });
  }
  if (coverN) log(`  ✓ 封面模板 ${coverN} 个文件`);

  /* 6.5 版本与更新记录（前端更新检测靠这两个文件） */
  copyFile(path.join(PWA, 'version.json'), path.join(DIST, 'version.json'));
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
  const themeFiles = fs.readdirSync(path.join(DIST, 'themes')).filter((f) => f.endsWith('.json') && f !== 'index.json');
  if (themeFiles.length !== themeCount) {
    problems.push(`主题文件数 ${themeFiles.length} ≠ 索引 ${themeCount}`);
  }

  // 4) 关键文件存在
  for (const need of ['index.html', 'sw.js', 'manifest.webmanifest', 'src/app.js', 'src/engine.worker.js',
                     'src/update.js', 'src/changelog.js', 'src/changelog.css',
                     'version.json', 'py/markdown.zip', 'themes/index.json']) {
    if (!fs.existsSync(path.join(DIST, need))) problems.push(`缺文件：${need}`);
  }

  if (problems.length) {
    console.error('\n构建断言失败：');
    for (const p of problems) console.error('  ✗ ' + p);
    process.exit(1);
  }
  log(`  ✓ 断言通过（无本地版专属目录、无 Google Fonts 外链、主题数一致、关键文件齐）`);
}

main();
