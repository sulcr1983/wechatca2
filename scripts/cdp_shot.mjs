#!/usr/bin/env node
// ─────────────────────────────────────────────────────────────────────────
// cdp_shot.mjs —— 零依赖 CDP 截图（Node ≥22，内置 WebSocket，不装 playwright）
//
// 为什么需要它：Windows headless Chrome 的 --window-size 最小 512px，
// 想拿到真实的 1440 / 375 CSS px 布局必须走 Emulation.setDeviceMetricsOverride。
// 本脚本与 cdp_measure.mjs 同一套连法，只多一步 Page.captureScreenshot。
//
// 用法：
//   node scripts/cdp_shot.mjs <url> <width> <height> <out.png> [snippet.js] [--full]
//   node scripts/cdp_shot.mjs http://127.0.0.1:8123/docs/prototypes/xhs-canvas-ux.html 1440 900 out/shot.png
//
// snippet.js 可选：截图前先在页面里跑一段「带 return 的 IIFE 函数体」，用来点按钮切状态。
// ─────────────────────────────────────────────────────────────────────────
import { spawn } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

const url = process.argv[2];
const W = Number(process.argv[3] || 1440);
const H = Number(process.argv[4] || 900);
const outFile = process.argv[5];
const snippetFile = process.argv[6] && !process.argv[6].startsWith('--') ? process.argv[6] : null;
const full = process.argv.includes('--full');

if (!url || !outFile) {
  console.error('用法: node scripts/cdp_shot.mjs <url> <width> <height> <out.png> [snippet.js] [--full]');
  process.exit(2);
}

const CHROME = process.env.CDP_CHROME || 'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe';
const port = Number(process.env.CDP_PORT || (9400 + Math.floor(Math.random() * 300)));
const ud = fs.mkdtempSync(path.join(os.tmpdir(), 'cdp-shot-'));
// CDP_HEADED=1 → 有头窗口（真实合成器，blend/filter/字体回退更准）。
// 窗口用独立 user-data-dir，绝不碰用户正在用的 Chrome。
const HEADED = process.env.CDP_HEADED === '1';
const proc = spawn(CHROME, [
  ...(HEADED ? ['--new-window'] : ['--headless=new']),
  '--disable-gpu', '--no-sandbox', '--mute-audio',
  '--hide-scrollbars', '--no-first-run', '--no-default-browser-check',
  '--disable-extensions', '--force-device-scale-factor=1', '--high-dpi-support=0',
  `--user-data-dir=${ud}`, `--remote-debugging-port=${port}`,
  `--window-size=${W},${Math.min(H, 1200)}`,
  'about:blank',
], { stdio: 'ignore' });

async function findWs() {
  for (let i = 0; i < 60; i++) {
    try {
      const tabs = await (await fetch(`http://127.0.0.1:${port}/json/list`)).json();
      const page = tabs.find((t) => t.type === 'page');
      if (page?.webSocketDebuggerUrl) return page.webSocketDebuggerUrl;
    } catch { /* 还没起来 */ }
    await new Promise((r) => setTimeout(r, 400));
  }
  throw new Error('CDP 未就绪（60 次轮询都没拿到 ws 地址）');
}

try {
  await new Promise((r) => setTimeout(r, 1200));
  const ws = new WebSocket(await findWs());
  let id = 0;
  const pending = new Map();
  ws.addEventListener('message', (ev) => {
    const m = JSON.parse(ev.data);
    if (m.id && pending.has(m.id)) { pending.get(m.id)(m); pending.delete(m.id); }
  });
  await new Promise((r) => ws.addEventListener('open', r));
  const send = (method, params = {}) =>
    new Promise((res) => { const i = ++id; pending.set(i, res); ws.send(JSON.stringify({ id: i, method, params })); });

  await send('Page.enable');
  await send('Runtime.enable');
  // 倍率可调：页面上缩放合成层多的时候，2x 会让 captureScreenshot 等不到稳定帧
  const DSF = Number(process.env.CDP_DSF || 2);
  await send('Emulation.setDeviceMetricsOverride', { width: W, height: H, deviceScaleFactor: DSF, mobile: W < 700 });
  await send('Page.navigate', { url });
  await new Promise((r) => setTimeout(r, 3500));

  if (snippetFile) {
    const snippet = fs.readFileSync(snippetFile, 'utf8');
    const r = await send('Runtime.evaluate', {
      expression: `(async function(){ ${snippet} })()`, awaitPromise: true, returnByValue: true,
    });
    const ex = r.result?.exceptionDetails;
    if (ex) console.error('SNIPPET EXCEPTION: ' + (ex.exception?.description || JSON.stringify(ex)));
    else if (r.result?.result?.value !== undefined) console.log('snippet: ' + r.result.result.value);
    await new Promise((r2) => setTimeout(r2, 700));
  }

  // clip 必须显式给：Emulation 的 height 与 window.innerHeight 会差几十 px
  // （实测 900 的 override 拿到 innerHeight=929），不裁就会把底栏截掉一截。
  //
  // ⚠️ fromSurface:true 在某些页面上会**永久挂住不返回**（实测：页面上同时存在
  //    多块 1080×1440 缩放合成层时，captureScreenshot 等不到"稳定帧"，进程一直挂着）。
  //    所以加 8s 超时 + 退回 fromSurface:false，两次都失败才报错。
  async function shotOnce(params, ms = 8000) {
    const r = await Promise.race([
      send('Page.captureScreenshot', params),
      new Promise((res) => setTimeout(() => res({ __timeout: true }), ms)),
    ]);
    return r;
  }
  let shotRes = full
    ? await shotOnce({ format: 'png', captureBeyondViewport: true, fromSurface: true })
    : await shotOnce({ format: 'png', fromSurface: true, clip: { x: 0, y: 0, width: W, height: H, scale: 1 } });
  if (shotRes.__timeout) {
    console.error('[warn] fromSurface 截图超时，退回普通合成器');
    shotRes = await shotOnce(full
      ? { format: 'png', captureBeyondViewport: true, fromSurface: false }
      : { format: 'png', fromSurface: false, clip: { x: 0, y: 0, width: W, height: H, scale: 1 } }, 15000);
  }
  const shot = shotRes;
  const data = shot.result?.data;
  if (!data) throw new Error('截图失败：' + JSON.stringify(shot).slice(0, 300));
  fs.mkdirSync(path.dirname(path.resolve(outFile)), { recursive: true });
  fs.writeFileSync(outFile, Buffer.from(data, 'base64'));
  console.log('saved: ' + outFile);
  ws.close();
} finally {
  proc.kill();
  try { fs.rmSync(ud, { recursive: true, force: true, maxRetries: 5, retryDelay: 400 }); }
  catch (e) { console.error('[warn] 临时 user-data-dir 未清理干净: ' + ud + ' (' + e.code + ')'); }
}
process.exit(0);
