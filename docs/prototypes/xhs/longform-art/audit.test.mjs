/* audit.js 单测：跑法 node --test docs/prototypes/xhs/longform-art/audit.test.mjs */
import test from 'node:test';
import assert from 'node:assert/strict';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { dirname, join } from 'node:path';

const here = dirname(fileURLToPath(import.meta.url));
const { auditSet, auditDom, auditSummary, DOM_AUDIT_JS, LIMITS, norm } =
  await import(pathToFileURL(join(here, 'audit.js')).href);
const { buildAutoSet } = await import(pathToFileURL(join(here, 'auto.js')).href);

const TPL = {
  id: 'classic', pal: 'xuan', motion: true,
  style: { bodyFont: 'var(--serif)', titleFont: 'var(--serif)', bodySize: 32,
    titleSize: 88, label: 'EDITORIAL', issue: 'VOL', footer: 'F', coverKicker: 'K' },
};

const STANDARD = `周末去海边，我把手机调成了飞行模式

两天的沉默之后，我重新听见了海浪。浪的声音比任何白噪音都好用，时间忽然变多了。

把手机收起来之后，我重新读完了搁置半年的那本书。晚饭后的散步也不再看屏幕，路口的风、店门口的猫、修车铺的收音机，全都清楚了起来。

- 出发前把手机调成飞行模式
- 到了先别拍照，坐十分钟再说
- 回程的路上写几句话

> 浪的声音，比任何白噪音都好用。

如果你也想试试，就从下一个周末开始。`;

test('normalize：去空白与行首标记', () => {
  assert.equal(norm(' a  b\n'), 'ab');
  assert.equal(norm(''), '');
});

test('标准夹具：auditSet 全绿、正常态摘要静默', () => {
  const set = buildAutoSet(STANDARD, TPL, null);
  const a = auditSet(set, STANDARD);
  assert.equal(a.ok, true, JSON.stringify(a.issues));
  assert.equal(a.issues.length, 0);
  assert.ok(auditSummary(a).startsWith('✓'));
  assert.equal(a.stats.totalChars, a.stats.renderedChars);
});

test('缺内页 / 空页 / 超页数 → 逐条报出，不静默', () => {
  const a = auditSet({
    report: { missing: '', truncatedChars: 0, totalChars: 10, renderedChars: 10 },
    pages: [{ role: 'cover', blocks: [] }, { role: 'dense', blocks: [] }],
  }, '标题\n\n正文一段。');
  assert.equal(a.ok, false);
  assert.ok(a.issues.some((s) => s.includes('空页')));
});

test('truncatedChars > 0 → 明确写出字数', () => {
  const a = auditSet({
    report: { missing: '', truncatedChars: 37, totalChars: 100, renderedChars: 63 },
    pages: [{ role: 'cover', blocks: [] }, { role: 'dense', blocks: [{ text: '正文' }] }],
  }, '标题\n\n' + '内容'.repeat(30));
  assert.ok(a.issues.some((s) => s.includes('37 字未出图')));
});

test('missing 非空 → 报「正文未落版」', () => {
  const a = auditSet({
    report: { missing: '(顺序不一致)', truncatedChars: 0, totalChars: 10, renderedChars: 10 },
    pages: [{ role: 'cover', blocks: [] }, { role: 'dense', blocks: [{ text: '正文' }] }],
  }, '标题\n\n正文');
  assert.ok(a.issues.some((s) => s.includes('未落版')));
});

test('auditDom：尺寸/裁切/字号/填充率四条判据', () => {
  assert.deepEqual(auditDom({ w: 1080, h: 1440, fill: 0.8, clipped: false, minFont: 28 }, 'dense'), []);
  const bad = auditDom({ w: 900, h: 1440, fill: 0.3, clipped: true, minFont: 14 }, 'dense');
  assert.ok(bad.length >= 4);
  assert.ok(bad.some((s) => s.includes('尺寸')));
  assert.ok(bad.some((s) => s.includes('裁字')));
  assert.ok(bad.some((s) => s.includes('最小字号')));
  assert.ok(bad.some((s) => s.includes('填充率')));
});

test('auditDom：引语页允许较低填充率（0.45），正文页 0.68', () => {
  assert.deepEqual(auditDom({ w: 1080, h: 1440, fill: 0.50, clipped: false, minFont: 28 }, 'quote'), []);
  assert.ok(auditDom({ w: 1080, h: 1440, fill: 0.50, clipped: false, minFont: 28 }, 'dense').length > 0);
});

test('DOM_AUDIT_JS 是合法 JS 且不含未替换模板串', () => {
  assert.ok(DOM_AUDIT_JS.includes('const avail = r.height - 192;'));
  assert.ok(!DOM_AUDIT_JS.includes('${'));
  new Function('cfg', DOM_AUDIT_JS);   // 语法可编译
});

test('LIMITS 与产品门禁口径一致', () => {
  assert.equal(LIMITS.minBodyPx, 28);
  assert.equal(LIMITS.minFillDense, 0.68);
});
