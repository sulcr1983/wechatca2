#!/usr/bin/env node
// ─────────────────────────────────────────────────────────────────────────
// ux_diag.mjs —— 有头 Chrome 诊断：多状态截图 + 控制台抓错 + 布局量取
//
// 与 cdp_shot.mjs 的差别：
//   1. 有头（真实窗口、真实合成器；blend/filter/字体回退与线上一致）
//   2. 一次会话跑多个「状态」，每个状态一张图，而不是每次重启 Chrome
//   3. 收集 Console / 异常 / 失败请求 —— 原型「不报错但画错」的 bug 只能这样抓
//
// 用法：
//   node scripts/ux_diag.mjs <url> <outDir> <状态文件.json> [W] [H]
// 状态文件：[{ "name":"默认", "snippet":"...", "full":false }, ...]
// ─────────────────────────────────────────────────────────────────────────
import { spawn } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

const url = process.argv[2];
const outDir = process.argv[3] || 'out/diag';
const statesFile = process.argv[4];
const W = Number(process.argv[5] || 1440);
const H = Number(process.argv[6] || 900);
if (!url || !statesFile) { console.error('用法: node scripts/ux_diag.mjs <url> <outDir> <states.json> [W] [H]'); process.exit(2); }
const states = JSON.parse(fs.readFileSync(statesFile, 'utf8'));

const CHROME = process.env.CDP_CHROME || 'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe';
const port = Number(process.env.CDP_PORT || (9500 + Math.floor(Math.random() * 400)));
const ud = fs.mkdtempSync(path.join(os.tmpdir(), 'ux-diag-'));
const proc = spawn(CHROME, [
  '--new-window', '--disable-gpu', '--no-sandbox', '--mute-audio',
  '--hide-scrollbars', '--no-first-run', '--no-default-browser-check',
  '--disable-extensions', '--noerrdialogs',
  // ⚠️ Windows 150% 缩放会让「窗口 1440×900」变成 CSS 960×600，
  //    再叠 Emulation override 就出现「布局只填 2/3、底部一条白」的假象（已踩）。
  //    必须钉死 1:1，截图像素才和 CSS px 对得上。
  '--force-device-scale-factor=1', '--high-dpi-support=0',
  `--user-data-dir=${ud}`, `--remote-debugging-port=${port}`,
  `--window-size=${W},${Math.min(H, 1180)}`, 'about:blank',
], { stdio: 'ignore' });

async function findWs() {
  for (let i = 0; i < 60; i++) {
    try {
      const tabs = await (await fetch(`http://127.0.0.1:${port}/json/list`)).json();
      const p = tabs.find((t) => t.type === 'page');
      if (p?.webSocketDebuggerUrl) return p.webSocketDebuggerUrl;
    } catch {}
    await new Promise((r) => setTimeout(r, 400));
  }
  throw new Error('CDP 未就绪');
}

const logs = [];
let ws, send;
try {
  await new Promise((r) => setTimeout(r, 1500));
  ws = new WebSocket(await findWs());
  let id = 0; const pending = new Map();
  await new Promise((r) => ws.addEventListener('open', r));
  send = (method, params = {}) => new Promise((res) => { const i = ++id; pending.set(i, res); ws.send(JSON.stringify({ id: i, method, params })); });
  ws.addEventListener('message', (ev) => {
    const m = JSON.parse(ev.data);
    if (m.id && pending.has(m.id)) { pending.get(m.id)(m); pending.delete(m.id); return; }
    if (m.method === 'Runtime.consoleAPICalled' && ['error', 'warning'].includes(m.params.type)) {
      logs.push('[' + m.params.type + '] ' + m.params.args.map((a) => a.value ?? a.description ?? a.type).join(' ').slice(0, 220));
    }
    if (m.method === 'Runtime.exceptionThrown') {
      logs.push('[EXCEPTION] ' + (m.params.exceptionDetails?.exception?.description || '').split('\n')[0].slice(0, 220));
    }
    if (m.method === 'Log.entryAdded' && ['error', 'warning'].includes(m.params.entry.level)) {
      logs.push('[' + m.params.entry.level + '] ' + (m.params.entry.text || '').slice(0, 220));
    }
    if (m.method === 'Network.loadingFailed') logs.push('[NET-FAIL] ' + m.params.errorText + ' ' + (m.params.requestId || ''));
  });

  await send('Page.enable'); await send('Runtime.enable'); await send('Log.enable'); await send('Network.enable');
  const DSF = Number(process.env.CDP_DSF || 2);
  await send('Emulation.setDeviceMetricsOverride', { width: W, height: H, deviceScaleFactor: DSF, mobile: W < 700 });
  await send('Page.navigate', { url });
  await new Promise((r) => setTimeout(r, 4000));

  // ⚠️ 有头模式下 Emulation 与 Page.getLayoutMetrics 报的都是「窗口尺寸」，
  //    真实布局视口比它小一个「浏览器自己的 UI 高度」（标签栏+地址栏 ≈153px，实测）。
  //    裁剪高度必须减掉这块，否则截图底部多一条白。
  const CHROME_UI = Number(process.env.DIAG_CHROME_UI || 153);
  const rw = W, rh = Math.max(320, H - CHROME_UI);
  console.log(`clip = ${rw}x${rh}（窗口 ${W}x${H} − 浏览器 UI ${CHROME_UI}）`);

  fs.mkdirSync(outDir, { recursive: true });
  for (const st of states) {
    if (st.snippet) {
      const r = await send('Runtime.evaluate', { expression: `(async function(){ ${st.snippet} })()`, awaitPromise: true, returnByValue: true });
      const ex = r.result?.exceptionDetails;
      if (ex) logs.push('[SNIPPET:' + st.name + '] ' + (ex.exception?.description || '').split('\n')[0].slice(0, 220));
      else if (r.result?.result?.value) console.log('⟶ ' + st.name + ': ' + String(r.result.result.value).slice(0, 800));
      await new Promise((r2) => setTimeout(r2, st.wait || 900));
    }
    const shot = await Promise.race([
      send('Page.captureScreenshot', st.full
        ? { format: 'png', captureBeyondViewport: true, fromSurface: false }
        // 有头模式下 clip 会被忽略（实测给 900 仍出 1053），而不带 clip 的
        // 「视口截图」恰好就是真实布局视口 = 窗口高 − 浏览器 UI。所以不传 clip。
        : { format: 'png', fromSurface: false }),
      new Promise((res) => setTimeout(() => res({ __timeout: true }), 20000)),
    ]);
    if (shot.__timeout) { logs.push('[SHOT-TIMEOUT] ' + st.name); continue; }
    const data = shot.result?.data;
    if (!data) { logs.push('[SHOT-FAIL] ' + st.name); continue; }
    const f = path.join(outDir, st.name.replace(/[^\w.-]/g, '_') + '.png');
    fs.writeFileSync(f, Buffer.from(data, 'base64'));
    console.log('saved: ' + f);
  }

  console.log('\n=== 控制台/异常/网络 ===');
  const uniq = [...new Set(logs)];
  console.log(uniq.length ? uniq.join('\n') : '(干净，无报错)');
  ws.close();
} finally {
  proc.kill();
  try { fs.rmSync(ud, { recursive: true, force: true, maxRetries: 5, retryDelay: 400 }); } catch (e) { console.error('[warn] 临时目录未清: ' + e.code); }
}
process.exit(0);