#!/usr/bin/env node
// ─────────────────────────────────────────────────────────────────────────
// xhs_canvas_ux_check.mjs —— 原型自检（无依赖，走 CDP）
//
// 为什么需要它：原型最容易出的不是「页面打不开」，而是「点了没反应 / 点了变空白」。
// 本项目 2026-10-31 的教训是「有反应 ≠ 产物正确」——所以这里每一步都验**产物**：
//   点版式 → 画布里的字号/结构真的变了（不是只改 aria-pressed）
//   点保存 → 托盘真的出来，且缩略图里真的有内容
//   切长文 → 页数真的算出 >1，且每页正文真的落版
//
// 用法：
//   node scripts/xhs_canvas_ux_check.mjs [url]
//   默认 http://127.0.0.1:8123/docs/prototypes/xhs-canvas-ux.html
// ─────────────────────────────────────────────────────────────────────────
import { spawn } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

const URL_ = process.argv[2] || 'http://127.0.0.1:8123/docs/prototypes/xhs-canvas-ux.html';
const CHROME = process.env.CDP_CHROME || 'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe';
const port = Number(process.env.CDP_PORT || (9600 + Math.floor(Math.random() * 200)));
const ud = fs.mkdtempSync(path.join(os.tmpdir(), 'cdp-uxchk-'));

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
    } catch { /* not up yet */ }
    await new Promise((r) => setTimeout(r, 400));
  }
  throw new Error('CDP 未就绪');
}

const CASES = [];
const T = (name, code, expect) => CASES.push({ name, code, expect });

/* ── 用例：每条返回一个「产物级」的判定对象 ── */
T('首屏有画布且不是空的', `
  const a = document.getElementById('cv-art');
  const cv = a.querySelector('.cv-art');
  const t = a.querySelector('.ttl');
  return { ok: !!cv && !!t, artLen: a.innerHTML.length, title: t ? t.textContent : '', size: cv ? cv.style.width + 'x' + cv.style.height : '' };
`);

T('胶囊显示当前值（入口即状态）', `
  const caps = [...document.querySelectorAll('.cap')].map(c => ({
    id: c.id, k: c.querySelector('.k').textContent, v: c.querySelector('.v').textContent
  }));
  return { ok: caps.every(c => c.v && c.v.length), caps };
`);

T('切版式 → 画布结构真的变了', `
  document.getElementById('cap-lay').click();
  await new Promise(r => setTimeout(r, 500));
  const before = document.getElementById('cv-art').innerHTML;
  const btns = [...document.querySelectorAll('#sheet-body .lay')];
  // ⚠️ 只点「可用」的卡片：清单版式在只有 1 条小字时会被 disabled（这是设计，不是 bug）。
  //    用例若硬点最后一张，会在加了可用性门控后假失败。
  const target = btns.find(b => !b.disabled && b.getAttribute('aria-pressed') !== 'true');
  const targetId = target ? target.dataset.l : null;
  target.click();
  await new Promise(r => setTimeout(r, 500));
  const after = document.getElementById('cv-art').innerHTML;
  const lay = state.lay;
  document.getElementById('sheet-x').click();
  await new Promise(r => setTimeout(r, 300));
  return {
    ok: before !== after && after.includes('周末去了趟海边') && lay === targetId,
    layCards: btns.length,
    changed: before !== after,
    lay,
    thumbHasOwnText: [...document.querySelectorAll('#sheet-body .thumb-art')].length,
  };
`);

T('版式缩略图用用户自己的文案', `
  document.getElementById('cap-lay').click();
  await new Promise(r => setTimeout(r, 500));
  const txts = [...document.querySelectorAll('#sheet-body .thumb-art')].map(e => e.textContent.replace(/\\s+/g,''));
  document.getElementById('sheet-x').click();
  await new Promise(r => setTimeout(r, 250));
  const allHave = txts.every(t => t.includes('周末去了趟海边'));
  return { ok: allHave, count: txts.length, sample: txts[0] ? txts[0].slice(0, 40) : '' };
`);

T('切「不要图」→ 自动落到纯文字版式', `
  document.getElementById('cap-img').click();
  await new Promise(r => setTimeout(r, 400));
  [...document.querySelectorAll('#img-tabs .tab3')].find(b => b.dataset.m === 'color').click();
  await new Promise(r => setTimeout(r, 500));
  const hasImg = !!document.querySelector('#cv-art .ph');
  const lay = state.lay;
  document.getElementById('sheet-x').click();
  await new Promise(r => setTimeout(r, 250));
  return { ok: !hasImg && ['swiss','bigtype','quote','number','list'].includes(lay), lay, hasImg };
`);

T('切回搜图 → 版式回到有图的那套', `
  document.getElementById('cap-img').click();
  await new Promise(r => setTimeout(r, 400));
  [...document.querySelectorAll('#img-tabs .tab3')].find(b => b.dataset.m === 'search').click();
  await new Promise(r => setTimeout(r, 600));
  const hasImg = !!document.querySelector('#cv-art .ph');
  document.getElementById('sheet-x').click();
  await new Promise(r => setTimeout(r, 250));
  return { ok: hasImg, lay: state.lay, hasImg };
`);

T('换底图 → 画布里的图 src 真的换了', `
  document.getElementById('cap-img').click();
  await new Promise(r => setTimeout(r, 400));
  const before = document.querySelector('#cv-art .ph')?.getAttribute('src') || '';
  document.querySelectorAll('#photo-grid .photo')[2].click();
  await new Promise(r => setTimeout(r, 900));
  const after = document.querySelector('#cv-art .ph')?.getAttribute('src') || '';
  document.getElementById('sheet-x').click();
  await new Promise(r => setTimeout(r, 250));
  return { ok: before !== after && !!after, before: before.split('/').pop(), after: after.split('/').pop() };
`);

T('换配色 → 画布纸张色真的换了', `
  document.getElementById('cap-type').click();
  await new Promise(r => setTimeout(r, 400));
  const before = document.querySelector('#cv-art .cv-art')?.style.getPropertyValue('--paper') || '';
  const palBtns = [...document.querySelectorAll('#pal-row .chip')];
  palBtns[4].click();
  await new Promise(r => setTimeout(r, 500));
  const after = document.querySelector('#cv-art .cv-art')?.style.getPropertyValue('--paper') || '';
  document.getElementById('sheet-x').click();
  await new Promise(r => setTimeout(r, 250));
  return { ok: before !== after && !!after, before, after, n: palBtns.length };
`);

T('文字玩法「竖排」→ 标题真的 writing-mode 变了', `
  document.getElementById('cap-type').click();
  await new Promise(r => setTimeout(r, 400));
  [...document.querySelectorAll('#tmode-row .chip')].find(b => b.dataset.t === 'vertical').click();
  await new Promise(r => setTimeout(r, 600));
  const t = document.querySelector('#cv-art .ttl');
  const wm = t ? getComputedStyle(t).writingMode : '';
  document.getElementById('sheet-x').click();
  await new Promise(r => setTimeout(r, 250));
  // 竖排要复位，避免影响后续用例
  const ok = wm.includes('vertical');
  document.getElementById('cap-type').click();
  await new Promise(r => setTimeout(r, 300));
  [...document.querySelectorAll('#tmode-row .chip')].find(b => b.dataset.t === 'stack').click();
  await new Promise(r => setTimeout(r, 400));
  document.getElementById('sheet-x').click();
  await new Promise(r => setTimeout(r, 200));
  return { ok, wm };
`);

T('换尺寸 1:1 → 画布真的变成 1080×1080', `
  document.getElementById('cap-size').click();
  await new Promise(r => setTimeout(r, 400));
  document.querySelector('#size-row .size[data-s="square"]').click();
  await new Promise(r => setTimeout(r, 600));
  const cv = document.querySelector('#cv-art .cv-art');
  const dim = cv ? cv.style.width + '×' + cv.style.height : '';
  document.getElementById('sheet-x').click();
  await new Promise(r => setTimeout(r, 250));
  const ok = dim.includes('1080') && dim.includes('1080') && !dim.includes('1440');
  // 复位
  document.getElementById('cap-size').click();
  await new Promise(r => setTimeout(r, 300));
  document.querySelector('#size-row .size[data-s="xhs"]').click();
  await new Promise(r => setTimeout(r, 400));
  document.getElementById('sheet-x').click();
  await new Promise(r => setTimeout(r, 200));
  return { ok, dim };
`);

T('保存 → 出片托盘出现且缩略图有内容', `
  document.getElementById('btn-save').click();
  await new Promise(r => setTimeout(r, 1000));
  const tray = document.getElementById('tray');
  const on = tray.classList.contains('on');
  const thumbLen = document.getElementById('tray-thumb').innerHTML.length;
  const sub = document.getElementById('tray-sub').textContent;
  const acts = document.getElementById('tray-acts').children.length;
  const cover = document.getElementById('cv-wrap').getBoundingClientRect();
  const tr = tray.getBoundingClientRect();
  const overlap = Math.max(0, Math.round(cover.bottom - tr.top));
  return { ok: on && thumbLen > 200 && acts >= 2 && overlap === 0, on, thumbLen, sub, acts, overlap };
`);

T('关托盘 → 画布回到原位', `
  document.getElementById('tray-x').click();
  await new Promise(r => setTimeout(r, 600));
  const app = document.querySelector('.app');
  return { ok: !app.classList.contains('tray-open'), cls: app.className };
`);

T('长文：示例文章分页 > 1 页且每页有角色', `
  document.getElementById('tab-long').click();
  await new Promise(r => setTimeout(r, 400));
  document.getElementById('btn-sample').click();
  await new Promise(r => setTimeout(r, 1000));
  const ps = state.pages.map(p => p.role);
  const ok = state.pages.length > 2 && ps[0] === 'cover' && ps.includes('opening') && ps[ps.length-1] !== 'dense';
  return { ok, pages: state.pages.length, roles: ps };
`);

T('长文：每页正文真的落版（逐句比对）', `
  const body = state.longText.split(/\\r?\\n/).slice(1).join('\\n').trim();
  const bl = parseBlocks(body);
  const norm = s => String(s||'').replace(/\\s+/g,'');
  const all = bl.filter(b => b.type !== 'pagebreak').map(b => norm(b.text || (b.items||[]).join('')));
  const out = [];
  const tmp = document.createElement('div');
  state.pages.forEach((p, i) => {
    tmp.innerHTML = longPageHtml(1080, 1440, p, i+1, state.pages.length, p.role === 'cover');
    out.push(norm(tmp.textContent));
  });
  const joined = out.join('');
  const missing = all.filter(s => s && !joined.includes(s));
  return { ok: missing.length === 0, blocks: all.length, missing: missing.slice(0, 3) };
`);

T('长文：翻页箭头与胶片条同步', `
  const before = state.page;
  document.getElementById('pg-next').click();
  await new Promise(r => setTimeout(r, 500));
  const sel = [...document.querySelectorAll('.film-item')].findIndex(b => b.getAttribute('aria-pressed') === 'true');
  const meta = document.getElementById('cv-meta-txt').textContent;
  return { ok: sel === state.page && state.page === before + 1, page: state.page, filmSel: sel, meta };
`);

T('长文：末页不空（填充率 ≥ 40% 或已是结尾页）', `
  state.page = state.pages.length - 1;
  paint();
  await new Promise(r => setTimeout(r, 500));
  const last = state.pages[state.pages.length - 1];
  const fill = pageH(last) / PAGE_H;
  return { ok: fill >= 0.4 || last.role === 'closing', role: last.role, fill: Math.round(fill * 100) + '%' };
`);

T('长文：换模板 → 内页配色/骨架真的变了', `
  const before = longPageHtml(1080, 1440, state.pages[2] || { role:'dense', blocks:[] }, 3, state.pages.length, false);
  document.getElementById('cap-lay').click();
  await new Promise(r => setTimeout(r, 500));
  const btns = [...document.querySelectorAll('[data-tpl]')];
  btns[5].click();
  await new Promise(r => setTimeout(r, 600));
  const after = longPageHtml(1080, 1440, state.pages[2] || { role:'dense', blocks:[] }, 3, state.pages.length, false);
  document.getElementById('sheet-x').click();
  await new Promise(r => setTimeout(r, 250));
  return { ok: before !== after, tpl: state.tpl, n: btns.length };
`);

T('长文：锁色模板 → 色板置灰并给理由', `
  document.getElementById('cap-type').click();
  await new Promise(r => setTimeout(r, 500));
  const tpl = tplOf(state.tpl);
  const locked = !!tpl.lock;
  const chips = [...document.querySelectorAll('#sheet-body [data-p]')];
  const allDisabled = chips.length ? chips.every(c => c.disabled) : false;
  const note = document.getElementById('sheet-body').textContent.includes('自带配色');
  document.getElementById('sheet-x').click();
  await new Promise(r => setTimeout(r, 250));
  return { ok: locked ? (allDisabled && note) : true, tpl: tpl.name, locked, allDisabled, note };
`);

T('长文：导出整套 → 托盘显示张数与页数一致', `
  document.getElementById('btn-save').click();
  await new Promise(r => setTimeout(r, 1000));
  const sub = document.getElementById('tray-sub').textContent;
  const n = state.pages.length;          // 含封面
  const inner = n - 1;                    // 文案写的是「封面 + N 张内页」
  const ok = sub.includes(String(inner)) && sub.includes('内页');
  document.getElementById('tray-x').click();
  await new Promise(r => setTimeout(r, 400));
  return { ok, sub, pages: n, inner };
`);

T('切回标题图 → 布局复位（无胶片条/无箭头）', `
  document.getElementById('tab-title').click();
  await new Promise(r => setTimeout(r, 600));
  return {
    ok: document.getElementById('film').hidden && document.getElementById('pg-prev').hidden,
    filmHidden: document.getElementById('film').hidden,
    prevHidden: document.getElementById('pg-prev').hidden,
    title: document.querySelector('#cv-art .ttl')?.textContent || '',
  };
`);

T('375px 无横向溢出', `
  return { ok: document.documentElement.scrollWidth <= window.innerWidth + 1,
    scrollW: document.documentElement.scrollWidth, innerW: window.innerWidth };
`);

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
  await send('Emulation.setDeviceMetricsOverride', { width: 1440, height: 900, deviceScaleFactor: 1, mobile: false });
  await send('Page.navigate', { url: URL_ });
  await new Promise((r) => setTimeout(r, 3500));

  let pass = 0;
  const fails = [];
  for (const c of CASES) {
    const r = await send('Runtime.evaluate', {
      expression: `(async function(){ ${c.code} })()`, awaitPromise: true, returnByValue: true,
    });
    const ex = r.result?.exceptionDetails;
    if (ex) {
      fails.push({ name: c.name, err: (ex.exception?.description || '').split('\n')[0] });
      console.log(`✗ ${c.name}\n    EXCEPTION ${(ex.exception?.description || '').split('\n')[0]}`);
      continue;
    }
    const v = r.result?.result?.value || {};
    if (v.ok) { pass++; console.log(`✓ ${c.name}`); }
    else {
      fails.push({ name: c.name, v });
      console.log(`✗ ${c.name}\n    ${JSON.stringify(v).slice(0, 260)}`);
    }
  }

  // 移动端另开一轮：只验溢出
  await send('Emulation.setDeviceMetricsOverride', { width: 375, height: 812, deviceScaleFactor: 2, mobile: true });
  await send('Page.navigate', { url: URL_ });
  await new Promise((r) => setTimeout(r, 3000));
  const m = await send('Runtime.evaluate', {
    expression: `(function(){
      const o = [];
      document.querySelectorAll('*').forEach(el => {
        const r = el.getBoundingClientRect();
        if (r.width > 0 && r.right > window.innerWidth + 1) o.push((el.id||el.className||el.tagName)+' r='+Math.round(r.right));
      });
      return { scrollW: document.documentElement.scrollWidth, innerW: window.innerWidth, over: o.slice(0,6) };
    })()`, returnByValue: true,
  });
  const mv = m.result?.result?.value || {};
  const mok = mv.scrollW <= mv.innerW + 1 && (mv.over || []).length === 0;
  if (mok) { pass++; console.log('✓ 375px 元素级无溢出'); }
  else { fails.push({ name: '375px 元素级无溢出', v: mv }); console.log('✗ 375px 元素级无溢出\n    ' + JSON.stringify(mv)); }

  const total = CASES.length + 1;
  console.log(`\n${pass}/${total} 通过` + (fails.length ? `，${fails.length} 项失败` : ''));
  ws.close();
  process.exitCode = fails.length ? 1 : 0;
} finally {
  proc.kill();
  try { fs.rmSync(ud, { recursive: true, force: true, maxRetries: 5, retryDelay: 400 }); } catch { /* 忽略 */ }
}
process.exit(process.exitCode || 0);
