#!/usr/bin/env node
// ─────────────────────────────────────────────────────────────────────────
// cdp_measure.mjs —— 零依赖 CDP 实测（Node ≥22，用内置 WebSocket，不用装 playwright）
//
// 为什么需要它：Windows 版 headless Chrome **最小窗宽 512px**。
// 用 --window-size=375,812 截出来的「移动端」其实 innerWidth=512，
// 窄屏溢出/重叠会被掩盖（本项目已踩过：拿着 512 的截图说 375 没问题）。
// 本脚本走 Emulation.setDeviceMetricsOverride，拿到真正的 375 CSS px 布局。
//
// 用法：
//   node scripts/cdp_measure.mjs <url> [width] [height] <snippet.js>
//   node scripts/cdp_measure.mjs file:///E:/test/wechatca2/docs/prototypes/xhs-studio-redesign.html 375 812 scripts/snippets/nav-375.js
//   node scripts/cdp_measure.mjs http://127.0.0.1:8123/index.html 375 812 scripts/snippets/nav-375.js
//
// snippet.js 是一段**带 return、返回字符串**的 IIFE 函数体（不是整个 script），例：
//   const L=[]; L.push('scrollWidth='+document.documentElement.scrollWidth); return L.join('\n');
// 针本无害：脚本只连本地起的 Chrome，结束后 kill 自己起的进程，不动用户的浏览器。
// ─────────────────────────────────────────────────────────────────────────
import { spawn } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

const url = process.argv[2];
const W = Number(process.argv[3] || 375);
const H = Number(process.argv[4] || 812);
const snippetFile = process.argv[5];
if (!url || !snippetFile) {
  console.error('用法: node scripts/cdp_measure.mjs <url> [width=375] [height=812] <snippet.js>');
  process.exit(2);
}
const snippet = fs.readFileSync(snippetFile, 'utf8');

const CHROME = process.env.CDP_CHROME || 'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe';
const port = Number(process.env.CDP_PORT || (9300 + Math.floor(Math.random() * 300)));
const ud = fs.mkdtempSync(path.join(os.tmpdir(), 'cdp-measure-'));
const proc = spawn(CHROME, [
  '--headless=new', '--disable-gpu', '--no-sandbox', '--mute-audio',
  '--hide-scrollbars', '--no-first-run', '--no-default-browser-check',
  '--disable-extensions', `--user-data-dir=${ud}`, `--remote-debugging-port=${port}`,
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
  await send('Emulation.setDeviceMetricsOverride', { width: W, height: H, deviceScaleFactor: 2, mobile: true });
  await send('Page.navigate', { url });
  await new Promise((r) => setTimeout(r, 3500));
  const r = await send('Runtime.evaluate', { expression: `(function(){ ${snippet} })()`, awaitPromise: true, returnByValue: true });
  const ex = r.result?.exceptionDetails;
  console.log(ex ? 'EXCEPTION: ' + (ex.exception?.description || JSON.stringify(ex)) : (r.result?.result?.value ?? '(no value)'));
  ws.close();
} finally {
  proc.kill();
  // 清理 user-data-dir 是「尽力而为」：Chrome 退出有延迟，马上 rm 会 EBUSY。
  // 重试几次仍删不掉就放弃（只是临时目录，留着无害）。
  try { fs.rmSync(ud, { recursive: true, force: true, maxRetries: 5, retryDelay: 400 }); }
  catch (e) { console.error('[warn] 临时 user-data-dir 未清理干净: ' + ud + ' (' + e.code + ')'); }
}
process.exit(0);
