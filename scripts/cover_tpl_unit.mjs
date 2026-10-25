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

console.log(`\n封面模板单测：${pass}/${pass + fail} 通过`);
process.exit(fail === 0 ? 0 : 1);
