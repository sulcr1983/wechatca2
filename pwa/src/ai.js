/* AI（纯前端 BYOK）：直接调 OpenAI 兼容接口。
 *
 * Key 只存在本机 localStorage，不上传、不经我们的服务器。
 * ⚠️ 浏览器直连受 CORS 限制：DeepSeek / Moonshot / SiliconFlow / OpenAI（预检通过）可用；
 *    智谱等不允许浏览器直连的平台会失败——这不是代码能绕过的，界面上已提示。
 */

const LS_AI = 'supersu.ai';
const LS_VERIFIED = 'supersu.ai.verified';   // 「测试连接通过」的凭证（配置一改即失效）

/** 平台预设：选中即填好接口地址 + 默认模型（模型仍可手改，Key 永远自己填）。
 *  ⚠️ 只收**允许浏览器直连**的平台（CORS 预检通过）；智谱等不能入列，加了也连不上。 */
export const AI_PLATFORMS = [
  { id: 'deepseek',    name: 'DeepSeek',            baseUrl: 'https://api.deepseek.com/v1',    model: 'deepseek-chat' },
  { id: 'moonshot',    name: 'Moonshot 月之暗面',    baseUrl: 'https://api.moonshot.cn/v1',    model: 'moonshot-v1-8k' },
  { id: 'siliconflow', name: 'SiliconFlow 硅基流动', baseUrl: 'https://api.siliconflow.cn/v1', model: 'Qwen/Qwen2.5-7B-Instruct' },
  { id: 'openai',      name: 'OpenAI',              baseUrl: 'https://api.openai.com/v1',      model: 'gpt-4o-mini' },
];

/** 按接口地址反查平台（忽略末尾斜杠）；空地址或查不到返回 null */
export function presetByBaseUrl(baseUrl) {
  const u = String(baseUrl || '').trim().replace(/\/+$/, '');
  if (!u) return null;
  return AI_PLATFORMS.find(p => p.baseUrl.replace(/\/+$/, '') === u) || null;
}

export function loadConfig() {
  try {
    return JSON.parse(localStorage.getItem(LS_AI) || '{}') || {};
  } catch {
    return {};
  }
}

export function saveConfig(cfg) {
  try {
    localStorage.setItem(LS_AI, JSON.stringify(cfg));
    localStorage.removeItem(LS_VERIFIED);   // 配置变了就要求重新测试
    return true;
  } catch {
    return false;
  }
}

/** 测试连接成功后落一个「已验证」标记（只在地址+模型匹配时有效） */
export function markVerified() {
  const c = loadConfig();
  try {
    localStorage.setItem(LS_VERIFIED, JSON.stringify(
      { baseUrl: c.baseUrl || '', model: c.model || '', ts: Date.now() }));
    return true;
  } catch {
    return false;
  }
}

/** AI 入口是否该出现：三项配置齐全 + 当前配置**测试通过过** */
export function isVerified() {
  const c = loadConfig();
  if (!c.baseUrl || !c.key || !c.model) return false;
  let v = {};
  try { v = JSON.parse(localStorage.getItem(LS_VERIFIED) || '{}') || {}; } catch { v = {}; }
  return v.baseUrl === c.baseUrl && v.model === c.model;
}


export function isReady() {
  const c = loadConfig();
  return !!(c.baseUrl && c.key && c.model);
}

async function chat(messages, { temperature = 0.4, maxTokens = 1600, json = false } = {}) {
  const c = loadConfig();
  if (!c.baseUrl || !c.key || !c.model) {
    throw new Error('还没配置 AI：点右上「AI」，选平台、填 Key');
  }
  const url = c.baseUrl.replace(/\/+$/, '') + '/chat/completions';
  const body = { model: c.model, messages, temperature, max_tokens: maxTokens };
  if (json) body.response_format = { type: 'json_object' };

  let res;
  try {
    res = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: 'Bearer ' + c.key },
      body: JSON.stringify(body),
    });
  } catch (e) {
    throw new Error('连不上接口（可能是浏览器 CORS 限制，或地址写错）');
  }
  if (!res.ok) {
    let detail = '';
    try {
      const d = await res.json();
      detail = (d.error && d.error.message) || d.message || '';
    } catch { /* 非 JSON 错误体 */ }
    // 状态码必须出现：上游只回笼统 message 时，用户仍能看出是 500 还是 401
    throw new Error(`HTTP ${res.status}` + (detail ? '：' + detail : ''));
  }
  const data = await res.json();
  const out = data && data.choices && data.choices[0] && data.choices[0].message;
  return (out && out.content) || '';
}

const POLISH_SYS =
  '你是中文公众号编辑。在不改变事实和观点的前提下，把用户给的文字改得更通顺、更有节奏，去掉口水话与重复。只输出润色后的正文，不要解释、不要加标题。';

const SUMMARY_SYS =
  '你是中文编辑。用 60-110 字概括用户给的文章，突出结论与关键信息，不要分点、不要加标题。';

/* ── 内容分析路由器（规则，不交给 LLM）─────────────────────────────
 *
 * 依据（2026-10-25 调研）：
 *  - StructRAG (ICLR 2025)：**「选对结构类型」是整个链路最关键的一步**，
 *    专用路由模型准确率 94% vs 通用大模型零样本 50%；去掉路由器，
 *    总分从 60.4 掉到 45.3。→ 结构类型不该让 LLM 猜。
 *  - LaySPA (arXiv:2509.16891)：**LLM 的空间/版面推理能力很弱**，
 *    内容感知版面设计需要额外的空间推理增强。→ 版面元素由规则定，
 *    LLM 只做它擅长的语义判断（哪段是标题、哪句是重点）。
 *  - Dolphin (ACL 2025)：analyze-then-parse 两阶段，先全局结构再局部内容。
 *
 * 所以这里用**确定性规则**先判内容类型与规模，再把结果和「预算」喂给 LLM，
 * 把 LLM 的决策面从 10 类收敛到「标题/小节/重点句」3 类。
 */
const CONTENT_RULES = [
  {
    type: 'dataly', label: '数据型',
    test: (t) => (t.match(/\d+(?:\.\d+)?\s*(?:%|万|亿|小时|分钟|天|年|倍|元|kg|km)/g) || []).length >= 3,
    budget: { callouts: 2, hrs: 2, pullquotes: 1, tables: 2 },
    note: '数字是主角：优先把并列的「标签：值」整理成表格，数字保留原样',
  },
  {
    type: 'listy', label: '清单型',
    test: (t) => {
      const shortParas = t.split(/\n\s*\n/).filter((x) => x.trim().length <= 40).length;
      const total = t.split(/\n\s*\n/).filter((x) => x.trim()).length;
      return total >= 5 && shortParas / total >= 0.5;
    },
    budget: { callouts: 1, hrs: 2, pullquotes: 1, tables: 1 },
    note: '并列短句多：优先合成有序/无序列表，少加装饰',
  },
  {
    type: 'tech', label: '方法型',
    test: (t) => /(步骤|首先|其次|然后|最后|第一步|注意|警告|前提|准备)/.test(t),
    budget: { callouts: 2, hrs: 2, pullquotes: 1, tables: 1 },
    note: '有流程/警示：步骤用列表，注意事项用提示框，其余保持朴素',
  },
  {
    type: 'narrative', label: '叙事型',
    test: () => true,          // 兜底：大多数公众号随笔属于这类
    budget: { callouts: 1, hrs: 2, pullquotes: 2, tables: 0 },
    note: '叙事为主：**少加装饰**，最多一条金句；不要硬分小节破坏语流',
  },
];

/** 规则化内容分析：返回类型、规模、预算与写作提示。 */
export function analyzeContent(text) {
  const raw = String(text || '');
  const paras = raw.split(/\n\s*\n/).map((x) => x.trim()).filter(Boolean);
  const chars = raw.replace(/\s/g, '').length;
  const hit = CONTENT_RULES.find((r) => r.test(raw)) || CONTENT_RULES[CONTENT_RULES.length - 1];
  // 规模也影响预算：短文不该有太多结构件（否则整篇都是装饰）
  const scale = chars < 300 ? 0.5 : chars < 800 ? 0.8 : 1;
  const budget = {};
  for (const [k, v] of Object.entries(hit.budget)) {
    budget[k] = k === 'tables' ? v : Math.max(1, Math.round(v * scale));
  }
  if (hit.type === 'narrative' && chars < 300) budget.tables = 0;
  return {
    type: hit.type, label: hit.label, note: hit.note,
    paraCount: paras.length, chars, budget,
  };
}

/* 排版结构规划提示词（2026-10-25 按论文结论重写）
 *
 * 改动理由：
 *  1. 决策面收敛：原来一次要 LLM 决定 10 类结构（含版面元素），噪声大、
 *     容易过度装饰 —— 用户反馈「AI 排版还不如原来的排版」。
 *  2. 预算写进提示词：装饰数量由规则算好直接告诉模型，不让它自由发挥。
 *  3. 加 few-shot：给一个「少即是多」的正例，比纯规则描述稳。
 *  4. 明确「宁缺勿滥」：缺省不输出任何字段是合法结果。
 */
const PLAN_SYS = `你是中文公众号的排版结构编辑。输入是中文文章（每段前有 [序号]），并附带一条由系统测量的内容画像。

你的职责只有三件：**找大标题、切小节、挑重点句**。版面装饰的数量已由系统给出预算，不得超过。

铁律：
- 不许改写、删减、添加正文文字（唯一例外是 sections.heading，那是新起的小节标题）。
- 宁缺勿滥：没有把握就**不输出**该字段。返回 {} 也是合法结果，并且往往比硬加装饰更好。
- 每个数组元素都必须能落到原文（段号有效、words/text/cuts 逐字来自原文），否则会被引擎丢弃。
- 不要为了「看起来有排版」而加分隔线/金句/提示框 —— 装饰超过预算就是噪音。

输出要求：只输出 JSON，不要解释、不要 markdown 代码块。

字段（全部可选）：
{"title": 段号,
 "sections": [{"heading": "小标题", "start": 段号, "end": 段号}],
 "lists": [{"start": 段号, "end": 段号}],
 "bold": [{"p": 段号, "words": ["原文中逐字存在的词"]}],
 "splits": [{"p": 段号, "cuts": ["该段里逐字存在、且只出现一次的句首片段"]}],
 "merges": [{"from": 段号, "to": 段号}],
 "tables": [{"start": 段号, "end": 段号, "delim": "："}],
 "callouts": [{"start": 段号, "end": 段号, "type": "summary|cta|quote", "title": "短标题"}],
 "hrs": [{"after": 段号}],
 "pullquotes": [{"p": 段号, "text": "原文中逐字存在的整句"}]}

决策标准：
- title：选最像「文章标题」的一段；如果第一段就是标题，就别重复设 sections。
- sections：只在**话题真的变了**的地方切。同一话题别硬切；叙事文常常整篇 0~2 个即可。
- lists：只把**结构并列**的短段合成列表（同类要点、并列步骤）。叙事段落不要列表化。
- bold：只加粗「关键结论/关键数字」，全篇 ≤ 4 处，不要给每段都加。
- splits：仅当某段超过 4 行且明显含两个话题时拆开；否则不动。
- merges：仅合并明显过碎的短句（如单句成段且与下段同一话题）。
- tables：只用于「标签：值」型的**并列**段落；叙事文不要表格。
- callouts：只包**全文结论**、**行动建议**或**重要提醒**。列表/叙事段落不要包。
- hrs：只在大的话题转折处，且不超过预算。
- pullquotes：只挑**最有力的一整句**（通常是观点句/金句），不要挑描述句。

示例（叙事短文，系统给出预算：callouts 1 / hrs 2 / pullquotes 2 / tables 0）：
输入：
[0] 周末去海边
[1] 两天的沉默之后，我重新听见了海浪、风声，还有自己。
[2] 下午四点，光从侧面打过来，沙滩是温的。我脱了鞋走了很久。
[3] 真正让人疲惫的不是工作，是那些没被允许停下来的时刻。
输出：
{"title":0,"pullquotes":[{"p":3,"text":"真正让人疲惫的不是工作，是那些没被允许停下来的时刻。"}]}
（注意：没有硬切小节、没有加分隔线、没有加提示框 —— 这篇不需要。）`;

export async function polish(text) {
  const out = await chat(
    [{ role: 'system', content: POLISH_SYS }, { role: 'user', content: text }],
    { temperature: 0.5, maxTokens: 2400 }
  );
  return out.trim();
}

export async function summarize(text) {
  const out = await chat(
    [{ role: 'system', content: SUMMARY_SYS }, { role: 'user', content: text }],
    { temperature: 0.3, maxTokens: 400 }
  );
  return out.trim();
}

/** 只让 AI 出结构决策（段号 → 标题/小节/列表/加粗），正文由引擎原样套用 */
/** 从模型输出里提取第一个完整的 JSON 对象。
 *
 * 为什么不能直接 JSON.parse（2026-10-25）：
 *   实测模型常返回「```json … ```」或「好的，结果如下：{…}」这类包裹文本，
 *   只去首尾 ``` 的做法一遇到前后说明就整条失败 → 白白降级成本地规则。
 * 做法：扫一遍括号深度，找到第一个 {…} 完整片段再解析（字符串内的括号跳过）。
 */
export function extractJson(raw) {
  const text = String(raw == null ? '' : raw);
  const start = text.indexOf('{');
  if (start < 0) throw new Error('no json');
  let depth = 0;
  let inStr = false;
  let esc = false;
  for (let i = start; i < text.length; i += 1) {
    const ch = text[i];
    if (inStr) {
      if (esc) esc = false;
      else if (ch === '\\') esc = true;
      else if (ch === '"') inStr = false;
      continue;
    }
    if (ch === '"') { inStr = true; continue; }
    if (ch === '{') depth += 1;
    else if (ch === '}') {
      depth -= 1;
      if (depth === 0) {
        return JSON.parse(text.slice(start, i + 1));
      }
    }
  }
  throw new Error('unbalanced json');
}

export async function planStructure(text) {
  const paras = text.split(/\n\s*\n/).map((s) => s.trim()).filter(Boolean);
  const numbered = paras.map((p, i) => `[${i}] ${p}`).join('\n');
  // 内容画像由规则算出，随用户消息一起给模型（Dolphin 的 analyze-then-parse：
  // 先给全局结构判断，再让它做局部决策；预算也一并下发，防止过度装饰）
  const info = analyzeContent(text);
  const brief = [
    `内容画像：${info.label} · ${info.paraCount} 段 · ${info.chars} 字`,
    `装饰预算（不得超过）：提示框 ≤${info.budget.callouts} · 分隔线 ≤${info.budget.hrs}`
      + ` · 金句 ≤${info.budget.pullquotes} · 表格 ≤${info.budget.tables}`,
    `本类内容要点：${info.note}`,
    '',
    '文章：',
    numbered,
  ].join('\n');

  const raw = await chat(
    [{ role: 'system', content: PLAN_SYS }, { role: 'user', content: brief }],
    { temperature: 0.1, maxTokens: 1800, json: true }
  );
  let plan;
  try {
    plan = extractJson(raw);
  } catch {
    throw new Error('AI 返回的结构不是合法 JSON');
  }
  // 预算兜底：提示词只是「请求」，这里才是「强制」。
  // 模型偶尔无视预算 → 按顺序截断，保证不出现满屏装饰（用户反馈过「不如原来」）。
  plan = enforceBudget(plan, info.budget);
  return plan;
}

/** 按预算截断装饰类字段（lists/sections/bold 不截，它们属于结构不是装饰）。 */
export function enforceBudget(plan, budget) {
  if (!plan || typeof plan !== 'object') return plan;
  const out = { ...plan };
  for (const key of ['callouts', 'hrs', 'pullquotes', 'tables']) {
    const cap = budget[key];
    if (typeof cap === 'number' && Array.isArray(out[key]) && out[key].length > cap) {
      out[key] = out[key].slice(0, cap);
    }
  }
  return out;
}

/** 测试连接：发一条最小请求 */
export async function testConnection() {
  const out = await chat([{ role: 'user', content: '回复"ok"两个字' }], { maxTokens: 8, temperature: 0 });
  return out.trim();
}
