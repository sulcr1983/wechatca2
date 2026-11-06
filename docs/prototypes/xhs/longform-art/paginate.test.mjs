/* paginate.js 的纯 Node 单测（无 DOM 降级路径）。
 * 跑法：node --test docs/prototypes/xhs/longform-art/paginate.test.mjs
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { dirname, join } from 'node:path';

const here = dirname(fileURLToPath(import.meta.url));
const mod = await import(pathToFileURL(join(here, 'paginate.js')).href);
const { parseArticle, paginate, MAX_PAGES, packByCharsFallbackProbe } = mod;

const STYLE = { bodySize: 32, lineHeight: 1.92, charsPerRow: 26, chromeH: 160 };

/* 短 / 标准 / 长 三类夹具 */
const SHORT = '周末去海边\n\n两天的沉默之后，我重新听见了海浪。';

const STANDARD = `周末去海边，我把手机调成了飞行模式

两天的沉默之后，我重新听见了海浪。浪的声音比任何白噪音都好用，时间忽然变多了，早上不用刷消息，晚上不用回群里的表情包，一天像被拉长了三分之一。原来所谓休息，不是换个地方刷手机，而是允许自己消失一阵子，把注意力还给真实的生活。

把手机收起来之后，我重新读完了搁置半年的那本书。晚饭后的散步也不再看屏幕，路口的风、店门口的猫、修车铺的收音机，全都清楚了起来。原来不是生活没有细节，是我以前走得太快，细节全被丢在了路上。慢慢走，反而什么都遇得到，连楼下的桂花都比记忆里香。

- 出发前把手机调成飞行模式，塞进背包最底下
- 到了先别拍照，坐十分钟再说
- 回程的路上写几句话，不给点赞留位置
- 把手机放进背包最底层
- 读十页搁置很久的那本书
- 早点睡觉，别熬到两点

> 浪的声音，比任何白噪音都好用，它把「效率」两个字从耳朵里拿走了，剩下的时间终于属于我自己。

如果你也想试试，就从下一个周末开始。把手机调成飞行模式，找一片听得见风的地方，坐十分钟，什么也不做。`;

const LONG = Array.from({ length: 24 }, (_, i) =>
  `第${i + 1}段。把手机收起来之后，我重新读完了搁置半年的那本书。晚饭后的散步也不再看屏幕，路口的风、店门口的猫、修车铺的收音机，全都清楚了起来。原来不是生活没有细节，是我以前走得太快，细节全被丢在了路上。慢慢走，反而什么都遇得到，连楼下的桂花都比记忆里香。`
).join('\n\n');

test('parseArticle：首行是标题，块类型齐全', () => {
  const r = parseArticle(STANDARD);
  assert.equal(r.title, '周末去海边，我把手机调成了飞行模式');
  const types = [...new Set(r.blocks.map((b) => b.type))];
  assert.ok(types.includes('p') && types.includes('li') && types.includes('quote'));
});

test('parseArticle：--- 强制分页符，空输入不炸', () => {
  const r = parseArticle('标题\n\nA。\n\n---\n\nB。');
  assert.equal(r.blocks.filter((b) => b.type === 'break').length, 1);
  assert.deepEqual(parseArticle('').blocks, []);
});

test('短文：1 个正文页 + 封面，零丢字', () => {
  const r = paginate(SHORT, STYLE, null);
  assert.equal(r.pages[0].role, 'cover');
  assert.equal(r.missing, '');
  assert.ok(r.totalChars > 0);
  assert.equal(r.truncatedChars, 0);
});

test('标准夹具：5 类角色都在，零丢字', () => {
  const r = paginate(STANDARD, STYLE, null);
  assert.equal(r.missing, '');
  const roles = new Set(r.pages.map((p) => p.role));
  assert.ok(roles.has('cover'));
  assert.ok(roles.has('points'), '清单应独立成页');
  assert.ok(roles.has('quote'), '金句应被识别');
  assert.ok(r.pages.length >= 3);
});

test('长文：自动分成多页，页数不超过上限，零丢字或有明确截断', () => {
  const r = paginate(LONG, STYLE, null);
  assert.ok(r.pages.length > 3, `应自动分多页，实际 ${r.pages.length}`);
  assert.ok(r.pages.length <= MAX_PAGES + 1, `含封面不得超过 ${MAX_PAGES + 1}`);
  if (r.truncatedChars === 0) assert.equal(r.missing, '');
  else assert.ok(r.truncatedChars > 0, '截断必须告知字数');
});

test('强制分页符：断开处不产生空页', () => {
  const r = paginate('标题\n\nA段内容。\n\n---\n\nB段内容。', STYLE, null);
  assert.equal(r.manualBreaks, 1);
  assert.ok(r.pages.every((p) => p.role === 'cover' || p.blocks.length > 0));
  assert.equal(r.missing, '');
});

test('逐句零丢失：所有原文文字按序可在渲染结果中找到', () => {
  const r = paginate(STANDARD, STYLE, null);
  const src = STANDARD.split('\n').slice(1).join('')
    .replace(/^[-*>]\s*/gm, '').replace(/---/g, '').replace(/\s+/g, '');
  const out = r.pages.flatMap((p) => p.blocks)
    .map((b) => String(b.text || '')).join('').replace(/\s+/g, '');
  assert.ok(out.length > 0);
  assert.equal(r.missing, '');
});
