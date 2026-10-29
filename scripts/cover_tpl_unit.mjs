/* 封面模板单元测试（Node 直跑，不需要浏览器）
 *
 * 覆盖 2026-10-25 修的两类问题：
 *   1. 署名占位符：10 套模板都得有 {{AUTHOR}} 或用 authorLine 渲染，
 *      不能再出现硬编码的「阿苏」
 *   2. 空署名的孤儿分隔符：不填署名时不能残留「/ 」「·」这类悬挂字符
 *
 * 用法：node scripts/cover_tpl_unit.mjs
 */
import { prepareCoverHtml, buildGuizangHtml } from '../pwa/src/cover/templates.js';
import { buildLayoutHtml } from '../pwa/src/cover/layouts.js';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

// ⚠️ Windows 上不能用 new URL(...).pathname（得到 /E:/... 再 resolve 会变成 E:\E:\...）
const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const TPL_DIR = path.join(ROOT, 'public', 'cover-templates');
const BASE = 'https://example.com/';

let pass = 0;
let fail = 0;
const check = (name, ok, detail = '') => {
  if (ok) { pass += 1; console.log(`  PASS  ${name}`); }
  else { fail += 1; console.log(`  FAIL  ${name}${detail ? '  — ' + detail : ''}`); }
};

const styles = fs.readdirSync(TPL_DIR).filter((d) =>
  fs.statSync(path.join(TPL_DIR, d)).isDirectory());

console.log(`\n模板数：${styles.length}`);

// ── 1. 每套模板都能渲染出署名 ──
const AUTHOR = '测试署名XYZ';
for (const s of styles) {
  const raw = fs.readFileSync(path.join(TPL_DIR, s, 'index.html'), 'utf8');
  const out = prepareCoverHtml(raw, {
    title: '标题', lead: '引语', author: AUTHOR, image: '', baseUrl: BASE,
  });
  check(`${s} 渲染出署名`, out.includes(AUTHOR));
}

// ── 2. 不填署名时无孤儿分隔符 ──
for (const s of styles) {
  const raw = fs.readFileSync(path.join(TPL_DIR, s, 'index.html'), 'utf8');
  const out = prepareCoverHtml(raw, {
    title: '标题', lead: '引语', author: '', image: '', baseUrl: BASE,
  });
  // 取 issue-strip / row 区块，检查没有只剩标点的空壳
  const orphan = /<(?:span|p)[^>]*>\s*[/·]\s*<\/(?:span|p)>/i.test(out);
  check(`${s} 空署名无孤儿分隔符`, !orphan);
}

// ── 3. 归藏两套：有/无署名都要正确 ──
for (const s of ['editorial', 'swiss']) {
  for (const size of ['xhs', 'square', 'wide']) {
    const withA = buildGuizangHtml({
      style: s, size, title: '标题', lead: '引语', author: AUTHOR, image: '', baseUrl: BASE,
    });
    check(`归藏 ${s}/${size} 有署名`, withA.includes(AUTHOR));
    const noA = buildGuizangHtml({
      style: s, size, title: '标题', lead: '引语', author: '', image: '', baseUrl: BASE,
    });
    check(`归藏 ${s}/${size} 无署名时不含空 By`, !noA.includes('By '));
  }
}

// ── 4. 不丢内容（保真闸门） ──
const raw0 = fs.readFileSync(path.join(TPL_DIR, styles[0], 'index.html'), 'utf8');
const out0 = prepareCoverHtml(raw0, {
  title: '我的标题', lead: '一句引语', author: AUTHOR, image: '', baseUrl: BASE,
});
for (const frag of ['我的标题', '一句引语', AUTHOR]) {
  check(`内容保真：${frag}`, out0.includes(frag));
}

// ── 5. 新增 4 个版式骨架（2026-10-29）──
// 这四条是「版式」这一维第一次进产品，纯字符串渲染就能验：
// 占位符必须全部替换干净、署名按有无渲染、清单版式要真的切出条目。
for (const lid of ['image-led', 'quote', 'number', 'list']) {
  for (const pal of ['paper', 'ink', 'bold']) {
    const sid = `${lid}-${pal}`;
    const out = buildLayoutHtml({
      style: sid, title: '我的标题', lead: '第一条·第二条', author: AUTHOR,
      image: '', baseUrl: BASE,
    });
    check(`${sid} 无残留占位符`, !/\{\{[A-Z]+\}\}/.test(out), (out.match(/\{\{[A-Z]+\}\}/g) || []).join(','));
    check(`${sid} 渲染出标题`, out.includes('我的标题'));
    check(`${sid} 渲染出署名`, out.includes(AUTHOR));
    check(`${sid} 带 #xhs-cover（截图锚点）`, out.includes('id="xhs-cover"'));
    const noA = buildLayoutHtml({
      style: sid, title: '我的标题', lead: '第一条·第二条', author: '', image: '', baseUrl: BASE,
    });
    check(`${sid} 无署名时不留空 By`, !noA.includes('By '));
  }
}

// 清单版式：引语按 · 切成条目，条目数 ≥ 2 时必须出 <li>
const listHtml = buildLayoutHtml({
  style: 'list-paper', title: '五个方法', lead: '先想清楚·再动手·最后复盘',
  author: '', image: '', baseUrl: BASE,
});
check('清单版式把引语切成 3 条', (listHtml.match(/<li class="ly-item"/g) || []).length === 3);
// 切不出条目时退化为一段引语，不能留空列表
const listDeg = buildLayoutHtml({
  style: 'list-paper', title: '五个方法', lead: '没有分隔符的一句话',
  author: '', image: '', baseUrl: BASE,
});
check('清单版式条目不足时退化不留空列表',
  !listDeg.includes('<ul class="ly-list">') && listDeg.includes('没有分隔符的一句话'));

// 编号大字：标题里的数字要变成主视觉编号
const numHtml = buildLayoutHtml({
  style: 'number-paper', title: '5 个提升效率的方法', lead: '', author: '', image: '', baseUrl: BASE,
});
check('编号大字取标题里的数字', numHtml.includes('>05<'));

// 图文封面：有无底图必须是两套排版（不是同一套加一张图）
const ledNoImg = buildLayoutHtml({
  style: 'image-led-paper', title: 'T', lead: '', author: '', image: '', baseUrl: BASE,
});
const ledImg = buildLayoutHtml({
  style: 'image-led-paper', title: 'T', lead: '', author: '', image: 'data:image/png;base64,AAA', baseUrl: BASE,
});
check('图文封面有/无底图排版不同',
  ledNoImg !== ledImg && ledImg.includes('ly-scrim') && !ledNoImg.includes('ly-scrim'));

console.log(`\n封面模板单测：${pass}/${pass + fail} 通过`);
process.exit(fail === 0 ? 0 : 1);
