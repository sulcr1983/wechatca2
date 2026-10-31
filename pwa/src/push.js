/* 公众号推送（高级功能，2026-10-31）
 *
 * 定位（用户拍板）：
 *  · 默认隐藏：只有配置了公众号 AppID/AppSecret 后，导出菜单才出现「推送草稿箱」、
 *    编辑器才出现「插图」按钮；未配置时贴图只给一次性提示
 *  · 后端是用户本机跑的 scripts/push_proxy.py（无状态代理）：AppSecret 只透传给微信，
 *    不落盘；本模块把 secret 存在用户自己浏览器的 localStorage（与 AI Key 同一套 BYOK 纪律）
 *
 * 官方硬限制（2026-10-31 核对，push_proxy.py 侧也有兜底校验）：
 *  · draft/add：服务端专用；title ≤32 字、digest ≤120 字；content <2 万字符、<1MB、去 JS；
 *    正文图 url 必须来自 uploadimg（外部/data URI 图一律被过滤）
 *  · uploadimg：仅 jpg/png ≤1MB，不占素材库额度，返回 mmbiz.qpic.cn url
 *  · 封面 thumb_media_id 必须是永久素材 media_id（add_material，≤10MB）
 *  · token 调用 IP 必须在公众号白名单内，否则 40164（代理启动横幅 + 测试连接都会引导）
 */

const LS_KEY = 'supersu.mp.push.v1';
const DEFAULT_PROXY = 'http://127.0.0.1:8787';

export function loadCfg() {
  try {
    const cfg = JSON.parse(localStorage.getItem(LS_KEY) || '{}');
    return { proxyUrl: DEFAULT_PROXY, appid: '', secret: '', ...cfg };
  } catch {
    return { proxyUrl: DEFAULT_PROXY, appid: '', secret: '' };
  }
}

export function saveCfg(cfg) {
  localStorage.setItem(LS_KEY, JSON.stringify(cfg));
}

export function isConfigured() {
  const c = loadCfg();
  return !!(c.appid && c.secret);
}

async function api(path, body, proxyUrl) {
  const base = (proxyUrl || loadCfg().proxyUrl || DEFAULT_PROXY).replace(/\/+$/, '');
  const resp = await fetch(base + path, {
    method: body === undefined ? 'GET' : 'POST',
    headers: body === undefined ? undefined : { 'Content-Type': 'application/json' },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  if (!resp.ok && resp.status !== 400) {
    throw new Error(`代理不可达（HTTP ${resp.status}）。请确认已运行 scripts/push_proxy.py`);
  }
  const data = await resp.json();
  if (data.proxy_error) throw new Error(`代理：${data.proxy_error}`);
  return data;
}

/** 诊断：代理在不在 + 本机出口 IP（填白名单用）。 */
export async function getEgressIp() {
  return (await api('/diag/ip')).ip;
}

/** 测试连接：先拿出口 IP，再真实换一次 token。返回结构化结果供 UI 展示。 */
export async function testConnection() {
  const cfg = loadCfg();
  const ip = await getEgressIp();
  try {
    const r = await api('/wechat/token', { appid: cfg.appid, secret: cfg.secret });
    if (r.access_token) return { ip, ok: true, expiresIn: r.expires_in };
    // 微信错误码原样透传（40164=IP 不在白名单 / 40125=secret 错 / 40013=appid 错）
    return { ip, ok: false, errcode: r.errcode, errmsg: r.errmsg };
  } catch (e) {
    return { ip, ok: false, errcode: -1, errmsg: e.message };
  }
}

async function getToken() {
  const cfg = loadCfg();
  const r = await api('/wechat/token', { appid: cfg.appid, secret: cfg.secret });
  if (!r.access_token) {
    const err = new Error(wechatErrMsg(r));
    err.errcode = r.errcode;
    throw err;
  }
  return r.access_token;
}

export function wechatErrMsg(r) {
  if (r.errcode === 40164) {
    // errmsg 里含微信看到的实际 IP，交叉展示给用户
    const m = /invalid ip ([0-9a-f.:]+)/i.exec(r.errmsg || '');
    return `本机出口 IP ${m ? m[1] : ''} 不在公众号 IP 白名单内。请到公众号后台「设置与开发 → 基本配置 → IP白名单」添加后重试`;
  }
  if (r.errcode === 40125) return 'AppSecret 不正确（公众号后台「基本配置」里重置后重新填写）';
  if (r.errcode === 40013) return 'AppID 不正确，请核对';
  return `微信接口错误 [${r.errcode ?? '?'}]：${r.errmsg || '未知'}`;
}

/** data URI → {b64, filename}（uploadimg/add_material 都吃二进制）。 */
function dataUriToPayload(dataUri, filename) {
  const m = /^data:image\/(\w+);base64,(.+)$/.exec(dataUri);
  if (!m) throw new Error('不是合法的图片 data URI');
  return { b64: m[2], filename: filename || `img.${m[1] === 'jpeg' ? 'jpg' : m[1]}` };
}

/** 上传单张正文图（uploadimg）→ mmbiz URL。 */
async function uploadContentImage(dataUri) {
  const { b64, filename } = dataUriToPayload(dataUri);
  const token = await getToken();
  const r = await api('/wechat/uploadimg', { token, filename, dataB64: b64 });
  if (!r.url) throw new Error(wechatErrMsg(r));
  return r.url;
}

/** 上传封面（永久素材）→ thumb media_id。 */
async function uploadThumb(dataUri) {
  const { b64, filename } = dataUriToPayload(dataUri, 'cover.jpg');
  const token = await getToken();
  const r = await api('/wechat/material', { token, filename, dataB64: b64 });
  if (!r.media_id) throw new Error(wechatErrMsg(r));
  return r.media_id;
}

/**
 * 推送主流程：正文里所有 data URI 图 → uploadimg 换成微信图床 URL；
 * 第一张图同时传永久素材当封面 thumb；最后 draft/add。
 * 返回 { mediaId, images }；无图时抛错（官方要求 thumb 必填）。
 */
export async function pushDraft({ title, contentHtml, digest }) {
  const token = await getToken();

  const uris = [...contentHtml.matchAll(/data:image\/[\w+]+;base64,[A-Za-z0-9+/=]+/g)]
    .map((m) => m[0]);
  if (!uris.length) {
    throw new Error('正文没有图片：草稿箱必须有封面图，请先插入至少一张图片（截图粘贴或「插图」按钮）');
  }

  // 逐张上传替换（编辑器管线已把图压到 ≤900KB jpg，天然满足 uploadimg 限制）
  const map = new Map();
  for (const uri of uris) {
    if (!map.has(uri)) map.set(uri, await uploadContentImage(uri));
  }
  let html = contentHtml;
  for (const [uri, wxUrl] of map) html = html.split(uri).join(wxUrl);

  const thumbMediaId = await uploadThumb(uris[0]);

  // 官方截断规则：title ≤32 字、digest ≤120 字
  const r = await api('/wechat/draft', {
    token,
    articles: [{
      title: (title || '未命名文章').slice(0, 32),
      content: html,
      digest: (digest || '').slice(0, 120),
      need_open_comment: 0,
      only_fans_can_comment: 0,
      thumb_media_id: thumbMediaId,
    }],
  });
  if (!r.media_id) throw new Error(wechatErrMsg(r));
  return { mediaId: r.media_id, images: map.size };
}
