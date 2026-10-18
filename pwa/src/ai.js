/* AI（纯前端 BYOK）：直接调 OpenAI 兼容接口。
 *
 * Key 只存在本机 localStorage，不上传、不经我们的服务器。
 * ⚠️ 浏览器直连受 CORS 限制：DeepSeek / Moonshot / SiliconFlow / OpenAI（预检通过）可用；
 *    智谱等不允许浏览器直连的平台会失败——这不是代码能绕过的，界面上已提示。
 */

const LS_AI = 'supersu.ai';

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
    return true;
  } catch {
    return false;
  }
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
    let msg = `HTTP ${res.status}`;
    try {
      const d = await res.json();
      msg = (d.error && d.error.message) || d.message || msg;
    } catch { /* 非 JSON 错误体 */ }
    throw new Error(msg);
  }
  const data = await res.json();
  const out = data && data.choices && data.choices[0] && data.choices[0].message;
  return (out && out.content) || '';
}

const POLISH_SYS =
  '你是中文公众号编辑。在不改变事实和观点的前提下，把用户给的文字改得更通顺、更有节奏，去掉口水话与重复。只输出润色后的正文，不要解释、不要加标题。';

const SUMMARY_SYS =
  '你是中文编辑。用 60-110 字概括用户给的文章，突出结论与关键信息，不要分点、不要加标题。';

const PLAN_SYS = `你是排版结构规划器。输入是中文文章（每段前有 [序号]）。
只输出 JSON（不要任何解释），格式：
{"title": 段落号, "sections": [{"heading": "小节标题", "start": 段号, "end": 段号}], "lists": [{"start": 段号, "end": 段号}], "bold": [{"p": 段号, "words": ["原文中逐字存在的词"]}]}
段号从 0 开始。title 选最像文章大标题的一段；sections 要覆盖正文段落；lists 只圈真正的并列项；bold 的 words 必须在原文里逐字存在。`;

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
    { temperature: 0.1, maxTokens: 1200, json: true }
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
