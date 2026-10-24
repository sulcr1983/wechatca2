/* Pyodide 引擎 Worker —— 在 Web Worker 里跑项目现有的 Python 排版引擎。
 *
 * 为什么这样：本地版是 Flask + Python，PWA 没有后端。用 Pyodide（CPython 编译到
 * WebAssembly）把 core/preprocessor.py 与 core/format_engine.py 原样搬进来跑，
 * 引擎零改动、输出与本地版逐字节一致（阶段 0 已验证：436 字样本 html 完全相同）。
 *
 * 代价：首次要下载约 11MB 运行时，之后由 Service Worker 缓存，秒开。
 * 跑在 Worker 里，下载与渲染都不阻塞 UI 线程。
 */

// 运行时改为同源自托管（原先走 cdn.jsdelivr.net：国内不稳，且换源就整包重下）
const PYODIDE_VERSION = '0.28.3';
const PYODIDE_BASE = new URL(`../runtime/pyodide/${PYODIDE_VERSION}/`, self.location.href).href;
const FS_ROOT = '/home/pyodide';
const THEME_PATH = `${FS_ROOT}/active-theme.json`;

let pyodide = null;
let renderFn = null;
let structureFn = null;    // AI 排版：把结构决策套用到原文（正文一字不改）
let booting = null;
let themeWritten = null;   // 已写进 FS 的主题指纹（id + 内容哈希），避免重复写

/** 32 位字符串哈希（FNV-1a）：只用来判断「主题内容是否变了」，不做安全用途 */
function hash32(str) {
  let h = 0x811c9dc5;
  for (let i = 0; i < str.length; i++) {
    h ^= str.charCodeAt(i);
    h = (h * 0x01000193) >>> 0;
  }
  return h.toString(16);
}

const post = (type, payload) => self.postMessage({ type, payload });

const errtext = (err) => (err ? String(err.message || err) : '未知错误');

/* ── 消息协议 ─────────────────────────────────────────────────────
 * boot    → { }                          加载运行时 + 引擎
 * theme   → { id, json }                 把主题 JSON 写进内存 FS
 * render  → { id, text }                 用当前主题渲染
 * 回传：progress / booted / theme-ready / rendered / error
 */
self.onmessage = async (e) => {
  const { type, payload } = e.data || {};

  try {
    if (type === 'boot') {
      await boot();
    } else if (type === 'theme') {
      if (!pyodide) throw new Error('引擎未就绪，无法写入主题');
      // payload.id 是消息序号（每次不同），去重不能只看 themeId——
      // 同一个主题 id 的内容可能变（自定义配色、版式覆盖、段落样式开关），
      // 只比 id 会导致「改了设置但渲染没变」（2026-10-24 实测踩到）。
      // 改为 id + 内容哈希：内容变了就重写。
      const fp = payload.themeId + '#' + payload.json.length + '#' + hash32(payload.json);
      if (themeWritten !== fp) {
        pyodide.FS.writeFile(THEME_PATH, payload.json);
        themeWritten = fp;
      }
      post('theme-ready', { id: payload.id });
    } else if (type === 'structure') {
      if (!structureFn) throw new Error('引擎尚未就绪');
      const md = structureFn(payload.text, JSON.stringify(payload.plan));
      post('structured', { id: payload.id, markdown: md });
    } else if (type === 'render') {
      if (!renderFn) throw new Error('引擎尚未就绪');
      const t0 = performance.now();
      const out = JSON.parse(renderFn(payload.text, THEME_PATH));
      post('rendered', {
        id: payload.id,
        html: out.html,
        markdown: out.markdown,
        ms: Math.round(performance.now() - t0),
      });
    }
  } catch (err) {
    post('error', {
      stage: type,
      id: payload && payload.id,
      message: errtext(err),
    });
  }
};

async function boot() {
  if (pyodide) return;
  if (booting) return booting;

  booting = (async () => {
    post('progress', { pct: 4, label: '准备排版引擎（首次约 5MB，之后用本地缓存）' });
    importScripts(PYODIDE_BASE + 'pyodide.js');

    post('progress', { pct: 12, label: '初始化 WebAssembly' });
    pyodide = await loadPyodide({
      indexURL: PYODIDE_BASE,
      stdout: () => {},
      stderr: () => {},
    });
    post('progress', { pct: 62, label: 'Python 运行时就绪' });

    // markdown 打成单个 zip 走 zipimport，避免往内存 FS 写 51 个文件。
    // zip 里必须带 markdown-<ver>.dist-info/，见下方 Python 注释。
    const files = [
      ['../py/preprocessor.py', 'preprocessor.py'],
      ['../py/format_engine.py', 'format_engine.py'],
      ['../py/markdown.zip', 'markdown.zip'],
    ];
    let done = 0;
    for (const [rel, name] of files) {
      // 相对路径要基于 worker 自己的位置解析：worker 在 /src/ 下，py/ 在站点根
      const url = new URL(rel, self.location.href).href;
      const res = await fetch(url);
      if (!res.ok) throw new Error(`下载 ${rel} 失败（HTTP ${res.status}）`);
      pyodide.FS.writeFile(`${FS_ROOT}/${name}`, new Uint8Array(await res.arrayBuffer()));
      done += 1;
      post('progress', { pct: 62 + done * 6, label: `载入 ${name}` });
    }

    post('progress', { pct: 86, label: '导入排版引擎' });
    renderFn = pyodide.runPython(`
import sys, json

# markdown 3.10 优先用 entry points 解析扩展名（tables / fenced_code / nl2br），
# 而 entry points 依赖 dist-info 元数据 —— 所以 markdown.zip 必须打包
# markdown-<ver>.dist-info/，否则会退化成 import_module('tables') 报 ModuleNotFoundError。
sys.path.insert(0, '${FS_ROOT}/markdown.zip')
sys.path.insert(0, '${FS_ROOT}')

import preprocessor
import format_engine


def _render(raw_text, theme_path):
    """纯文本 → Markdown → 微信内联 HTML。与本地 app.py 的调用链一致。"""
    md = preprocessor.preprocess(raw_text, 'auto')
    html = format_engine.convert_markdown_to_wechat_html(md, theme_path)
    return json.dumps({'html': html, 'markdown': md}, ensure_ascii=False)


_render
`);

    // AI 排版：只套用结构（段号 → 标题/小节/列表/加粗），正文原样拼接
    structureFn = pyodide.runPython(`
import json as _json
import preprocessor as _pp

def _structure(raw_text, plan_json):
    paras = _pp.split_paragraphs(raw_text)
    return _pp.apply_structure(paras, _json.loads(plan_json))

_structure
`);

    post('progress', { pct: 100, label: '就绪' });
    post('booted', { pyodide: pyodide.version });
  })();

  return booting;
}
