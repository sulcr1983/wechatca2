/* AI（纯前端 BYOK）：直接调 OpenAI 兼容接口。
 *
 * Key 只存在本机 localStorage，不上传、不经我们的服务器。
 * ⚠️ 浏览器直连受 CORS 限制：DeepSeek / Moonshot / SiliconFlow / OpenAI（预检通过）可用；
 *    智谱等不允许浏览器直连的平台会失败——这不是代码能绕过的，界面上已提示。
 */

const LS_AI = 'supersu.ai';
const LS_VERIFIED = 'supersu.ai.verified';   // 「测试连接通过」的凭证（配置一改即失效）

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
    throw new Error('还没配置 AI：点右上「AI」填接口地址 / 模型 / Key');
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

const PLAN_SYS = `你是中文公众号排版结构规划器。输入是中文文章（每段前有 [序号]）。
你只做「结构决策」，**不许改写、删减、添加正文文字**（sections.heading 例外，它是新起的小节标题）。
只输出 JSON（不要任何解释），字段全部可选，没把握就不要输出：
{"title": 段号,
 "sections": [{"heading": "新起的小节标题", "start": 段号, "end": 段号}],
 "lists": [{"start": 段号, "end": 段号}],
 "bold": [{"p": 段号, "words": ["原文中逐字存在的词"]}],
 "splits": [{"p": 段号, "cuts": ["该段里逐字存在、且只出现一次的句首片段"]}],
 "merges": [{"from": 段号, "to": 段号}],
 "tables": [{"start": 段号, "end": 段号, "delim": "："}],
 "callouts": [{"start": 段号, "end": 段号, "type": "summary|cta|quote", "title": "短标题"}],
 "hrs": [{"after": 段号}],
 "pullquotes": [{"p": 段号, "text": "原文中逐字存在的整句"}]}

规则：
- 段号从 0 开始；title 选最像文章大标题的一段。
- cuts / text / words 必须逐字来自原文，找不到就别写（引擎会忽略非法项）。
- splits 只用来拆过长的段落（超过 4 行）；merges 只合过碎的短句。
- tables 只用于「标签：值」型的并列段落，delim 默认「：」。
- callouts 只包结论 / 警告 / 行动建议；hrs 只放在话题转折处；pullquotes 最多 2 条。`;

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
export async function planStructure(text) {
  const paras = text.split(/\n\s*\n/).map((s) => s.trim()).filter(Boolean);
  const numbered = paras.map((p, i) => `[${i}] ${p}`).join('\n');
  const raw = await chat(
    [{ role: 'system', content: PLAN_SYS }, { role: 'user', content: numbered }],
    { temperature: 0.1, maxTokens: 1800, json: true }
  );
  const cleaned = String(raw).replace(/^```(?:json)?/i, '').replace(/```$/, '').trim();
  try {
    return JSON.parse(cleaned);
  } catch {
    throw new Error('AI 返回的结构不是合法 JSON');
  }
}

/** 测试连接：发一条最小请求 */
export async function testConnection() {
  const out = await chat([{ role: 'user', content: '回复"ok"两个字' }], { maxTokens: 8, temperature: 0 });
  return out.trim();
}
