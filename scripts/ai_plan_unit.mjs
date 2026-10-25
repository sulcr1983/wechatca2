/* AI 排版结构规划单元测试（Node 直跑，不需要浏览器/网络）
 *
 * 覆盖 2026-10-25 按论文重写的两件事：
 *   1. 规则化内容路由（StructRAG：结构类型不能靠 LLM 猜）
 *   2. 装饰预算强制（LaySPA：LLM 版面/空间推理弱，装饰数量必须由代码兜住）
 *
 * 用法：node scripts/ai_plan_unit.mjs
 */
import { analyzeContent, enforceBudget, extractJson } from '../pwa/src/ai.js';

let pass = 0;
let fail = 0;
const check = (name, ok, detail = '') => {
  if (ok) { pass += 1; console.log(`  PASS  ${name}`); }
  else { fail += 1; console.log(`  FAIL  ${name}${detail ? '  — ' + detail : ''}`); }
};

// ── 1. 内容路由：四类都认得出来 ──
const cases = [
  ['叙事型', '周末去海边\n\n两天的沉默之后，我重新听见了海浪。\n\n下午四点，光从侧面打过来。'],
  ['数据型', '本月数据\n\n营收 120 万\n\n增长 35%\n\n用时 18 天\n\n复购 62%'],
  ['清单型', '五个习惯\n\n早睡\n\n喝水\n\n散步\n\n读书\n\n写日记'],
  ['方法型', '第一步 先准备材料\n\n然后打开工具\n\n注意不要烫手'],
];
for (const [want, text] of cases) {
  const info = analyzeContent(text);
  check(`识别${want}`, info.label === want, `实得 ${info.label}`);
}

// ── 2. 短文预算必须收敛（否则整篇都是装饰）──
const short = analyzeContent('标题\n\n很短的一段话。');
const long = analyzeContent(
  Array.from({ length: 12 }, (_, i) => `第 ${i} 段正文内容，写得长一些以凑足字数。`).join('\n\n'));
check('短文分隔线预算 ≤1', short.budget.hrs <= 1, JSON.stringify(short.budget));
check('长文分隔线预算 ≥ 短文', long.budget.hrs >= short.budget.hrs,
  `${long.budget.hrs} vs ${short.budget.hrs}`);
check('叙事短文不给表格预算', short.budget.tables === 0, String(short.budget.tables));

// ── 3. 预算强制：模型超量必须被砍 ──
const plan = {
  callouts: [1, 2, 3, 4, 5].map((x) => ({ start: x })),
  hrs: [{ after: 1 }, { after: 2 }, { after: 3 }, { after: 4 }],
  pullquotes: [{ p: 1 }, { p: 2 }, { p: 3 }],
  tables: [{ start: 1 }, { start: 2 }],
  sections: [{ heading: 'a', start: 1, end: 2 }],
  lists: [{ start: 1, end: 2 }],
};
const capped = enforceBudget(plan, { callouts: 1, hrs: 2, pullquotes: 1, tables: 0 });
check('提示框被砍到预算内', capped.callouts.length === 1, String(capped.callouts.length));
check('分隔线被砍到预算内', capped.hrs.length === 2, String(capped.hrs.length));
check('金句被砍到预算内', capped.pullquotes.length === 1, String(capped.pullquotes.length));
check('表格被砍到 0', capped.tables.length === 0, String(capped.tables.length));
check('小节/列表属于结构，不截断',
  capped.sections.length === 1 && capped.lists.length === 1);

// ── 3.5 鲁棒 JSON 提取（模型常带前后说明/代码块）──
const jsonCases = [
  ['裸 JSON', '{"title":0}', { title: 0 }],
  ['带 ```json 围栏', '```json\n{"title":0}\n```', { title: 0 }],
  ['前面有说明', '好的，结果如下：{"title":0}', { title: 0 }],
  ['前后都有说明', '分析完成。\n{"title":0,"sections":[]}\n希望有帮助！', { title: 0, sections: [] }],
  // 字符串里出现花括号不能被当成结构层级（简单数括号的实现会在这里翻车）
  ['字符串内含花括号', '{"text":"他说{你好}","ok":1}', { text: '他说{你好}', ok: 1 }],
];
for (const [name, raw, want] of jsonCases) {
  let got = null;
  let ok = false;
  try {
    got = extractJson(raw);
    ok = JSON.stringify(got) === JSON.stringify(want);
  } catch { ok = false; }
  check(`JSON 提取：${name}`, ok, JSON.stringify(got));
}
check('JSON 提取：纯文本应失败', (() => {
  try { extractJson('这段不是 JSON'); return false; } catch { return true; }
})());

// ── 4. 空/异常输入不炸 ──
check('空文本可分析', (() => { try { analyzeContent(''); return true; } catch { return false; } })());
check('null plan 原样返回', enforceBudget(null, { callouts: 1 }) === null);

console.log(`\nAI 排版单测：${pass}/${pass + fail} 通过`);
process.exit(fail === 0 ? 0 : 1);
