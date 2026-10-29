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
import { execSync, execFileSync, spawnSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { TEMPLATE_STYLES, ALL_STYLES } from '../src/cover/catalog.js';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const PWA = path.resolve(HERE, '..');
const ROOT = path.resolve(PWA, '..');
const DIST = path.join(PWA, 'dist');

const log = (...a) => console.log(...a);
const rel = (p) => path.relative(ROOT, p).replace(/\\/g, '/');

/** 内容指纹（16 位十六进制足够；用来做增量缓存键与 BUILD_ID） */
const sha256 = (buf) => createHash('sha256').update(buf).digest('hex').slice(0, 16);

// Shell 清单不再手写白名单：buildShellManifest() 直接扫描 dist/src/** + index.html +
// manifest + fonts/*.css。手写列表必然漏（2026-10-29 就漏了 src/cover/textmode.js），
// 漏一个文件的后果是「更新后该文件仍是旧的」，很难查。
// CRITICAL 子集（失败即 install 失败）由 sw.js 自己定义。

/** Shell 清单：随版本变的代码/HTML/样式 → sha256
 *  SW 用「稳定缓存 + ?h= 键」，改一行 app.js 只下 app.js，而不是整包 390KB。 */
function buildShellManifest() {
  const manifest = {};
  const add = (relPath) => {
    const abs = path.join(DIST, relPath);
    if (fs.existsSync(abs)) manifest[relPath] = sha256(fs.readFileSync(abs));
  };
  add('index.html');
  add('manifest.webmanifest');
  const walk = (relDir) => {
    const abs = path.join(DIST, relDir);
    if (!fs.existsSync(abs)) return;
    for (const ent of fs.readdirSync(abs, { withFileTypes: true })) {
      const relPath = `${relDir}/${ent.name}`;
      if (ent.isDirectory()) { walk(relPath); continue; }
      if (/\.(js|css)$/.test(ent.name)) add(relPath);
    }
  };
  walk('src');
  add('fonts/fonts.css');
  add('fonts/cover-fonts.css');
  return manifest;
}

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
const FAMILIES = ['biz', 'feast', 'letter', 'minimal', 'night', 'stamp', 'dusk'];

function familyOf(id) {
  const m = /^su-([a-z]+)-/.exec(id);
  return m && FAMILIES.includes(m[1]) ? m[1] : '';
}

/* ── 名字里的颜色 / 场景 → 可搜索标签 ──────────────────────────────────────
   为什么需要：色名是「竹青 / 朱砂 / 麦金 / 粉黛」这类意象词，用户按「绿 / 红 / 金 /
   粉」搜不到；族名也不等于用途。主题名保持不变（好看），另外挂一层标签兜住搜索。 */
const HUE_STOPS = [[16, '红'], [42, '橙'], [66, '黄'], [160, '绿'],
                   [200, '青'], [255, '蓝'], [292, '紫'], [336, '粉'], [361, '红']];

function hexToHsl(hex) {
  const m = /^#?([0-9a-f]{6})$/i.exec(String(hex || '').trim());
  if (!m) return null;
  const n = parseInt(m[1], 16);
  const r = ((n >> 16) & 255) / 255, g = ((n >> 8) & 255) / 255, b = (n & 255) / 255;
  const max = Math.max(r, g, b), min = Math.min(r, g, b);
  const l = (max + min) / 2, d = max - min;
  if (!d) return { h: 0, s: 0, l };
  const s = l > 0.5 ? d / (2 - max - min) : d / (max + min);
  let h;
  if (max === r) h = ((g - b) / d + (g < b ? 6 : 0));
  else if (max === g) h = (b - r) / d + 2;
  else h = (r - g) / d + 4;
  return { h: h * 60, s, l };
}

function colorTagOf(hex) {
  const hsl = hexToHsl(hex);
  if (!hsl) return [];
  const out = [];
  if (hsl.s < 0.1) out.push(hsl.l > 0.7 ? '白' : hsl.l < 0.3 ? '黑' : '灰');
  else {
    out.push(HUE_STOPS.find(([limit]) => hsl.h < limit)[1]);
    if (hsl.s < 0.28) out.push('灰');
  }
  return out;
}

// 族 → 用途标签（用户真会用来描述文章的词）
const FAMILY_TAGS = {
  // 末尾是**旧族名**：2026-10-29 卷宗→公文、庙会→节庆，老用户仍按旧词搜，别让他搜不到
  biz: ['商务', '周报', '复盘', '方案', '汇报', '正式', '公文', '卷宗'],
  letter: ['散文', '随笔', '读书', '文艺', '书信', '情感'],
  minimal: ['极简', '观点', '清单', '留白', '简约', '干净'],
  night: ['技术', '科技', '前沿', '暗色', '暗黑', '深色'],
  feast: ['节庆', '活动', '节日', '喜事', '热闹', '暖色', '庙会'],
  stamp: ['态度', '强对比', '海报', '粗野', '醒目'],
  dusk: ['行业', '观察', '分析', '深色', '首屏', '沉稳'],
};

/* 旧名别名：2026-10-29 把 6 套沿用第三方品牌名的主题改成自研名（id 与版式都没动）。
   改名的代价是「老用户按记忆里的名字搜，一条都搜不到」——看起来就像主题丢了。
   这里把旧名挂进可搜索字段，搜 Monocle / Vogue / 字节 仍能命中现名。 */
const LEGACY_ALIAS = {
  monocle: ['Monocle', '生活'],
  vogue: ['Vogue', '时尚杂志'],
  github: ['GitHub'],
  sspai: ['少数派'],
  bytedance: ['字节蓝', '字节跳动', '飞书'],
  'wechat-native': ['微信原生'],
};

/* 色调词 → 语义色。
   色调名是本项目自造的（茶青 / 栗棕 / 青莲 / 靛紫 …），用户搜「绿」不会想到写「青」，
   只按 accent 色相算色相标签会让 27 套搜不到（2026-10-29 实测：搜「绿」漏掉所有「茶青」）。
   这里按**整词**映射而不是按单字：单字会把「青莲」的「青」判成绿、「藏青」判成绿。
   新增色调名时在这里补一行（未收录的词不猜，宁可不加标签）。 */
const TONE_HUE = {
  湖蓝: '蓝', 藏蓝: '蓝', 雾蓝: '蓝', 钴蓝: '蓝', 天蓝: '蓝', 晴空: '蓝', 藏青: '蓝', 蓝: '蓝',
  茶青: '绿', 竹青: '绿', 苔绿: '绿', 薄荷: '绿', 青绿: '绿', 墨绿: '绿', 青: '绿', 绿: '绿',
  青莲: '紫', 紫藤: '紫', 靛紫: '紫', 藕紫: '紫', 紫: '紫',
  朱砂: '红', 朱红: '红', 珊瑚: '红', 红: '红',
  柿橙: '橙', 橙: '橙',
  麦金: '黄', 琥珀: '黄', 米: '黄', 金: '黄', 黄: '黄',
  粉黛: '粉', 粉: '粉',
  栗棕: '褐', 卡其: '褐', 赭石: '褐', 褐: '褐', 棕: '褐',
  铁灰: '灰', 灰: '灰', 银: '灰',
  玄黑: '黑', 黑: '黑',
};

// 主题名去掉族前缀后的色调词（「公文·茶青」→「茶青」）
function toneOf(name) {
  const s = String(name || '');
  return s.includes('·') ? s.split('·').pop().trim() : '';
}

function tagsFor(entry, family) {
  const tags = new Set();
  colorTagOf(entry.accent).forEach((t) => tags.add(t));
  const bg = colorTagOf(entry.background);
  // 底色只取明暗语义：白/黑/灰 比色相更有用
  if (bg.includes('白')) tags.add('浅色');
  if (bg.includes('黑')) { tags.add('深色'); tags.add('暗色'); }
  // 名字里的色调词（整词匹配，见 TONE_HUE 注释）
  const hue = TONE_HUE[toneOf(entry.name)];
  if (hue) tags.add(hue);
  (FAMILY_TAGS[family] || []).forEach((t) => tags.add(t));
  // 旧名别名只进搜索索引，不在 UI 展示（app.js 里 tags 仅参与 includes 匹配）
  (LEGACY_ALIAS[entry.id] || []).forEach((t) => tags.add(t));
  // 描述里的「适合 …」本身就是最准的用途标签
  const m = /适合([^。]{2,60})/.exec(entry.desc || '');
  if (m) m[1].split(/[、，,；;与和]/).forEach((w) => {
    const w2 = w.trim().replace(/等$/, '');
    if (w2.length >= 2 && w2.length <= 8) tags.add(w2);
  });
  return [...tags];
}

function loadCuration() {
  const p = path.join(PWA, 'theme-curation.json');
  if (!fs.existsSync(p)) return { featured: [], order: [] };
  const d = JSON.parse(fs.readFileSync(p, 'utf8'));
  return { featured: d.featured || [], order: d.order || [] };
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
    const family = familyOf(id);
    const entry = {
      id,
      name: theme.name || id,
      desc: theme.description || '',
      primary: c.primary || '#191713',
      accent: c.accent || '#AF3E2B',
      background: c.background || '#FFFFFF',
      family,
    };
    entry.tags = tagsFor(entry, family);
    index.push(entry);
  }

  /* 排序 = 编辑策展顺序（pwa/theme-curation.json）
     featured 12 套排最前（跨场景覆盖的「先看这几套」），其余按策展 order；
     不在 order 里的（新增主题还没策展）按 id 兜底排最后，不会消失。 */
  const { featured, order } = loadCuration();
  const featPos = new Map(featured.map((id, i) => [id, i]));
  const orderPos = new Map(order.map((id, i) => [id, i + featured.length]));
  const rank = (t) => (featPos.has(t.id) ? featPos.get(t.id)
    : (orderPos.has(t.id) ? orderPos.get(t.id) : 1e6));
  index.sort((a, b) => (rank(a) - rank(b)) || a.id.localeCompare(b.id));
  index.forEach((t) => { t.featured = featPos.has(t.id); });
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
  // 缩略图（2026-10-25）：原来只拷 10 套模板的，归藏两套（editorial / swiss）
  // 补了真实预览图后也被漏掉 → 界面上是破图。改为按 ALL_STYLES 全量拷贝。
  const coverThumbSrc = path.join(ROOT, 'public', 'social-thumb');
  mkdirp(path.join(DIST, 'cover-thumbs'));
  let coverThumbN = 0;
  for (const t of ALL_STYLES) {
    const p = path.join(coverThumbSrc, `${t.id}.png`);
    if (fs.existsSync(p)) {
      copyFile(p, path.join(DIST, 'cover-thumbs', `${t.id}.png`));
      coverThumbN += 1;
    }
  }
  log(`  ✓ 封面模板 ${coverN} 套 + 缩略图 ${coverThumbN} 张`);

  // 封面页空态示例成品（U-9）：由 scripts/gen_cover_samples.py 用 PWA 管线生成
  const sampleSrc = path.join(PWA, 'public', 'samples');
  let sampleN = 0;
  if (fs.existsSync(sampleSrc)) {
    sampleN = copyDir(sampleSrc, path.join(DIST, 'samples'), { include: /\.jpg$/ });
  }
  log(`  ✓ 封面示例图 ${sampleN} 张`);

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
  const assetManifest = buildAssetManifest();
  const shellManifest = buildShellManifest();
  const buildId = computeBuildId(shellManifest, assetManifest);
  stampSw(buildId, manifest, assetManifest, shellManifest);
  log(`  ✓ SW 指纹 BUILD_ID=${buildId} + 清单 shell ${Object.keys(shellManifest).length} / data ${Object.keys(manifest).length} / assets ${Object.keys(assetManifest).length} + _headers`);

  /* 8. 断言 */
  if (!process.argv.includes('--skip-assert')) assertDist(index.length);

  const total = dirSize(DIST);
  log(`\n完成：${(total / 1024 / 1024).toFixed(2)}MB，用时 ${((Date.now() - t0) / 1000).toFixed(1)}s`);

  /* 9. 同步 STATE.md（2026-10-25）
     每次 build 都会改 dist/version.json 的 build 号 → STATE.md 必然过期。
     这里自动重生成，省得每次 build 完还要手动跑一遍（否则门禁 doc_sync 会红）。 */
  try {
    const py = process.platform === 'win32'
      ? path.join(ROOT, '.venv', 'Scripts', 'python.exe')
      : path.join(ROOT, '.venv', 'bin', 'python');
    if (fs.existsSync(py) && fs.existsSync(path.join(ROOT, 'scripts', 'gen_state.py'))) {
      const r = spawnSync(py, ['scripts/gen_state.py', '--no-online'], { cwd: ROOT, encoding: 'utf8' });
      if (r.status === 0) log('  · STATE.md 已同步');
      else log('  ! STATE.md 同步失败（可手动跑 python scripts/gen_state.py）');
    }
  } catch { /* 同步失败不阻断构建 */ }
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

/** BUILD_ID = shell 清单 + 资产清单的摘要。
 *  任何文件变化都会让它变 → sw.js 字节变 → 浏览器触发更新；
 *  但 install 时按 ?h= 键逐文件比对，用户只下真变了的那几个。 */
function computeBuildId(shellManifest, assetManifest) {
  return sha256(JSON.stringify(shellManifest) + '|' + JSON.stringify(assetManifest || {}));
}

/** 把 sw.js 里的占位符替换成本次构建指纹 + 三份内联清单 */
function stampSw(buildId, dataManifest, assetManifest, shellManifest) {
  const p = path.join(DIST, 'sw.js');
  let src = fs.readFileSync(p, 'utf8');
  for (const [token, name] of [['__BUILD_ID__', 'BUILD_ID'],
                               ['/*__DATA_MANIFEST__*/', 'DATA_MANIFEST'],
                               ['/*__ASSETS_MANIFEST__*/', 'ASSETS_MANIFEST'],
                               ['/*__SHELL_MANIFEST__*/', 'SHELL_MANIFEST']]) {
    if (!src.includes(token)) {
      throw new Error(`sw.js 缺少 ${token} 占位符（${name} 无法注入）`);
    }
  }
  // 内联而不是运行时 fetch：SW 被回收后离线重启时，manifest 请求必然失败，
  // 拿不到清单就会退回普通键 → 与 ?h= 键不匹配 → 离线主题/引擎全废
  src = src.replace('/*__DATA_MANIFEST__*/', `DATA_MANIFEST = ${JSON.stringify(dataManifest)};`);
  src = src.replace('/*__ASSETS_MANIFEST__*/', `ASSETS_MANIFEST = ${JSON.stringify(assetManifest || {})};`);
  src = src.replace('/*__SHELL_MANIFEST__*/', `SHELL_MANIFEST = ${JSON.stringify(shellManifest || {})};`);
  src = src.replace(/__BUILD_ID__/g, buildId);
  fs.writeFileSync(p, src, 'utf8');
}

/** 静态资产清单：图标 / 品牌 / 示例图 / 封面模板 / vendor / 字体 → sha256
 *  这些文件不随版本变，SW 用稳定缓存 + ?h= 键跨版本复用，改一行 JS 时 0 下载。 */
function buildAssetManifest() {
  const manifest = {};
  const addDir = (relDir, accept) => {
    const abs = path.join(DIST, relDir);
    if (!fs.existsSync(abs)) return;
    for (const ent of fs.readdirSync(abs, { withFileTypes: true })) {
      if (ent.isDirectory()) continue;
      if (accept && !accept(ent.name)) continue;
      const relPath = `${relDir}/${ent.name}`;
      manifest[relPath] = sha256(fs.readFileSync(path.join(DIST, relPath)));
    }
  };
  addDir('icons', (f) => f.endsWith('.png'));
  addDir('brand', (f) => f.endsWith('.png'));
  addDir('samples', (f) => f.endsWith('.jpg'));
  addDir('cover-templates', (f) => f.endsWith('.html'));
  addDir('vendor', (f) => /\.(js|css)$/.test(f));
  // 只收 fonts 根目录的 woff2（主界面字体，160KB）；
  // fonts/cover/* 有 3.6MB，封面页才用，保持按需下载、不进预缓存。
  addDir('fonts', (f) => f.endsWith('.woff2'));
  fs.writeFileSync(path.join(DIST, 'assets-manifest.json'), JSON.stringify(manifest), 'utf8');
  return manifest;
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
  if (swSrc.includes('__ASSETS_MANIFEST__')) problems.push('sw.js 的资产清单未内联（静态资产会退化成全量重下）');
  if (swSrc.includes('__SHELL_MANIFEST__')) problems.push('sw.js 的 shell 清单未内联（改一行 JS 仍要重下整包）');
  if (!/SHELL_MANIFEST = \{[^}]*"src\/app\.js"/.test(swSrc)) {
    problems.push('sw.js 里的 SHELL_MANIFEST 不含 src/app.js（清单不完整）');
  }
  if (/SHELL_OPTIONAL/.test(swSrc)) problems.push('sw.js 仍在用硬编码 SHELL_OPTIONAL 清单');

  // 6.5 静态资产清单：图标/品牌/示例/封面模板/vendor/字体都该在里面
  const amPath = path.join(DIST, 'assets-manifest.json');
  if (!fs.existsSync(amPath)) {
    problems.push('缺文件：assets-manifest.json（静态资产无法增量）');
  } else {
    const am = JSON.parse(fs.readFileSync(amPath, 'utf8'));
    const keys = Object.keys(am);
    if (keys.length < 20) problems.push(`资产清单只有 ${keys.length} 项，明显不全`);
    for (const need of ['icons/icon-192.png', 'brand/logo-64.png', 'vendor/fflate.min.js']) {
      if (!am[need]) problems.push(`资产清单缺：${need}`);
    }
  }
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

