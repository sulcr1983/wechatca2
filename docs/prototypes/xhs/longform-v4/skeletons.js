/* 5 种版式骨架 —— 全部照 references/layout-recipes.md 的结构，不自己发挥
 *
 * ⚠️ 对照公平性约束（写死，别改）：
 *   · 所有骨架共用 @page { size: 1080px 1440px; margin: 96px }
 *     —— 页边距不是版式差异的一部分，改了就没法归因
 *   · 所有骨架共用同一份夹具（fixture.js）
 *   · 差异只允许来自：排印骨架 / 图文关系 / 序号系统 / 装饰线体系 / 密度
 *
 * ⚠️ 单页约束（2026-11-06 首轮实测后加）：
 *   M01/M08/S09/M14 在配方里都是**单页骨架**。首版实测 4 种都断成 2 页，
 *   第 2 页只剩页脚零头（最低填充率 0.017）—— 根因是「内容 + 页脚」略超
 *   1248px 可用高。现按配方口径收紧字号/间距，让每种骨架稳定落进 1 页。
 *   这不是「为凑绿缩放」，而是配方本身要求一页成立。
 *
 * 每个骨架导出 { id, name, recipe, dimension, density, css, html, anchors, note }
 *   anchors = 该骨架的必备锚点（Phase 3 的机检项就照这个列表断言）
 */

import { TITLE, BLOCKS } from './fixture.js';

const esc = (s) => String(s == null ? '' : s)
  .replace(/&/g, '&amp;').replace(/</g, '&lt;')
  .replace(/>/g, '&gt;').replace(/"/g, '&quot;');

/* 把 body 段按句拆成 4 句 —— 证据墙用真实句子当「证据」，不编造内容 */
const SENTENCES = BLOCKS.body.split(/(?<=。)/).filter((s) => s.trim());

/* 从句子取 caption：首 7 字，作为「证据标题」 */
const captionOf = (s) => s.replace(/[，。、；：]/g, '').slice(0, 7);

/* ─────────────────────────────────────────────────────────────
   骨架 A · M01/M03 刊头 + 首字下沉
   命中维度：排印骨架（首字下沉是 12 套现有模板里 0 次出现的手法）
   ───────────────────────────────────────────────────────────── */
export const SK_MAGAZINE = {
  id: 'm01-magazine',
  name: '刊头 + 首字下沉',
  recipe: 'M01 Magazine Issue Cover + M03 Editorial Essay Split',
  dimension: '排印骨架',
  density: '密',
  anchors: ['issue-row 刊头', '首字下沉', '上下细线', '页脚条'],
  note: '首字下沉在现有 12 套长文模板里出现 0 次（审计实测），是纯新增语法',
  css: `
    body { font-family: var(--serif); font-size: 44px; line-height: 1.48; color: var(--ink); }
    .issue-row {
      display: flex; justify-content: space-between; align-items: baseline;
      border-top: 3px solid var(--ink); border-bottom: 1px solid var(--line);
      padding: 8px 0; margin-bottom: 18px;
      font: 400 22px/1 var(--mono); letter-spacing: .22em; color: var(--muted);
    }
    h1 { font-size: 66px; line-height: 1.14; margin: 0 0 20px; letter-spacing: -.01em; }
    .drop { font-size: 44px; }
    .drop::first-letter {
      float: left; font-size: 2.6em; line-height: .84; font-weight: 700;
      padding: 6px 12px 0 0; color: var(--accent);
    }
    p { margin: 0 0 14px; text-align: justify; }
    .end-rule { border-top: 1px solid var(--line); margin-top: 12px; padding-top: 10px;
      font: 400 20px/1 var(--mono); letter-spacing: .18em; color: var(--muted);
      display: flex; justify-content: space-between; }
  `,
  html: `
    <div class="issue-row"><span>EDITORIAL · 生活方式</span><span>VOL. 2026 / NO. 04</span></div>
    <h1>${esc(TITLE)}</h1>
    <p class="drop">${esc(BLOCKS.lead)}</p>
    <p>${esc(BLOCKS.body)}</p>
    <div class="end-rule"><span>— 完 —</span><span>SUPERSU</span></div>
  `,
};

/* ─────────────────────────────────────────────────────────────
   骨架 B · M08 Tall Ledger 竖排账本
   命中维度：序号系统 + 行结构（左侧序号栏，行高 ≥118px）
   ───────────────────────────────────────────────────────────── */
export const SK_LEDGER = {
  id: 'm08-ledger',
  name: '竖排账本',
  recipe: 'M08 Tall Ledger',
  dimension: '序号系统 + 行结构',
  density: '中',
  anchors: ['左侧序号栏', '行分隔细线', '页脚条'],
  note: '配方要求每行 118–170px；本页取 148px，6 行恰好把 3:4 画布填满',
  css: `
    body { font-family: var(--sans); font-size: 52px; line-height: 1.5; color: var(--ink); }
    .kicker { font: 500 22px/1 var(--mono); letter-spacing: .24em; color: var(--accent);
      margin: 0 0 14px; }
    h1 { font-family: var(--serif); font-size: 68px; line-height: 1.16; margin: 0 0 10px; }
    .sub { font-size: 30px; color: var(--muted); margin: 0 0 30px; }
    .ledger { border-top: 3px solid var(--ink); }
    .row {
      display: grid; grid-template-columns: 132px 1fr; align-items: center;
      min-height: 148px; border-bottom: 1px solid var(--line);
      padding: 14px 0;
    }
    .row .n {
      font: 700 54px/1 var(--mono); color: var(--accent); letter-spacing: -.02em;
    }
    .row .t { font-size: 42px; line-height: 1.42; }
    .foot { margin-top: 20px; font: 400 22px/1 var(--mono); letter-spacing: .16em;
      color: var(--muted); display: flex; justify-content: space-between;
      border-top: 1px solid var(--line); padding-top: 14px; }
  `,
  html: `
    <p class="kicker">CHECKLIST · 六件事</p>
    <h1>${esc(TITLE)}</h1>
    <p class="sub">把手机收起来之后，我留下的六条</p>
    <div class="ledger">
      ${BLOCKS.items.map((t, i) => `<div class="row">
        <span class="n">${String(i + 1).padStart(2, '0')}</span>
        <span class="t">${esc(t)}</span>
      </div>`).join('')}
    </div>
    <div class="foot"><span>SUPERSU · 周末实践清单</span><span>01 / 06</span></div>
  `,
};

/* ─────────────────────────────────────────────────────────────
   骨架 C · M06 Evidence Wall 证据墙 2×2
   命中维度：图文关系（网格 + caption；现有模板全是单栏线性流）
   ───────────────────────────────────────────────────────────── */
export const SK_EVIDENCE = {
  id: 'm06-evidence',
  name: '证据墙 2×2',
  recipe: 'M06 Evidence Wall',
  dimension: '图文关系（网格）',
  density: '密',
  anchors: ['2×2 网格', '每格 caption', '大标题锚点', '格间细线', '页脚条'],
  note: '无图时用「真实句子」当证据块，不塞灰框占位（配方明确反对灰框）',
  css: `
    body { font-family: var(--sans); font-size: 52px; line-height: 1.5; color: var(--ink); }
    h1 { font-family: var(--serif); font-size: 72px; line-height: 1.18; margin: 0 0 16px; }
    .lead { font-size: 34px; color: var(--muted); margin: 0 0 44px; }
    .wall {
      display: grid; grid-template-columns: 1fr 1fr;
      border-top: 3px solid var(--ink); border-left: 1px solid var(--line);
    }
    .cell {
      border-right: 1px solid var(--line); border-bottom: 1px solid var(--line);
      padding: 30px 28px; min-height: 300px;
      display: flex; flex-direction: column;
    }
    .cell .cap {
      font: 500 21px/1 var(--mono); letter-spacing: .16em; color: var(--accent);
      margin: 0 0 18px; padding-bottom: 12px; border-bottom: 1px solid var(--line);
    }
    .cell .q { font-size: 40px; line-height: 1.46; margin: 0; }
    .foot { margin-top: 30px; font: 400 21px/1 var(--mono); letter-spacing: .18em;
      color: var(--muted); display: flex; justify-content: space-between; }
  `,
  html: `
    <h1>${esc(TITLE)}</h1>
    <p class="lead">${esc(BLOCKS.lead.slice(0, 46))}……</p>
    <div class="wall">
      ${SENTENCES.map((s, i) => `<div class="cell">
        <p class="cap">EVIDENCE ${String(i + 1).padStart(2, '0')} · ${esc(captionOf(s))}</p>
        <p class="q">${esc(s)}</p>
      </div>`).join('')}
    </div>
    <div class="foot"><span>四句原文 · 各自成块</span><span>SUPERSU</span></div>
  `,
};

/* ─────────────────────────────────────────────────────────────
   骨架 D · S09 KPI Tower（内容不适配时的诚实降级）
   命中维度：数据可视化（塔高编码）
   ⚠️ 夹具无数字型内容。不编造数字：塔高编码「条目字数」，
      这是可测的真实值，并在标注条写明降级原因。
   ───────────────────────────────────────────────────────────── */
export const SK_KPI = {
  id: 's09-kpi',
  name: 'KPI 塔（降级）',
  recipe: 'S09 KPI Tower',
  dimension: '数据可视化',
  density: '中',
  anchors: ['kicker', 'h-xl', '塔状条形', '数值标签', '页脚条'],
  note: '夹具无数字 → 塔高改编码条目字数（真实可测），这是内容适配度问题，不是版式问题',
  css: `
    body { font-family: var(--sans); font-size: 52px; line-height: 1.5; color: var(--ink); }
    .kicker { font: 500 22px/1 var(--mono); letter-spacing: .24em; color: var(--accent);
      margin: 0 0 14px; }
    h1 { font-family: var(--serif); font-size: 60px; line-height: 1.16; margin: 0 0 18px; }
    .towers {
      display: grid; grid-template-columns: 1fr 1fr; gap: 14px 32px;
      border-top: 3px solid var(--ink); padding-top: 18px;
    }
    .tower { display: flex; flex-direction: column; justify-content: flex-end; }
    .tower .val { font: 700 38px/1 var(--mono); color: var(--accent); margin: 0 0 4px; }
    .tower .lbl { font-size: 23px; line-height: 1.32; color: var(--ink); margin: 0 0 10px;
      min-height: 54px; }
    .tower .bar { background: var(--accent); width: 100%; }
    .tower.muted .bar { background: var(--muted); opacity: .45; }
    .tower.muted .val { color: var(--muted); }
    .foot { margin-top: 12px; font: 400 19px/1.4 var(--mono); letter-spacing: .1em;
      color: var(--muted); border-top: 1px solid var(--line); padding-top: 10px; }
  `,
  html: (() => {
    const lens = BLOCKS.items.map((t) => t.length);
    const lo = Math.min(...lens), hi = Math.max(...lens);
    /* 线性归一化到 80–240px，视觉差异可辨，但仍是真实数据的映射 */
    const barOf = (n) => Math.round(80 + ((n - lo) / Math.max(1, hi - lo)) * 160);
    return `
      <p class="kicker">DATA · 六条清单</p>
      <h1>${esc(TITLE)}</h1>
      <div class="towers">
        ${BLOCKS.items.map((t, i) => `<div class="tower${i === BLOCKS.items.length - 1 ? ' muted' : ''}">
          <p class="val">${t.length}</p>
          <p class="lbl">${esc(t)}</p>
          <div class="bar" style="height:${barOf(t.length)}px"></div>
        </div>`).join('')}
      </div>
      <div class="foot">塔高 ∝ 条目字数（线性归一化 80–240px）· 夹具无数字，本骨架降级使用</div>
    `;
  })(),
};

/* ─────────────────────────────────────────────────────────────
   骨架 E · M14 Vertical Pipeline 竖排流程
   命中维度：顺序关系（横向流程竖过来；现有模板只有页码没有步骤语义）
   ───────────────────────────────────────────────────────────── */
export const SK_PIPELINE = {
  id: 'm14-pipeline',
  name: '竖排流程',
  recipe: 'M14 Vertical Pipeline',
  dimension: '顺序关系',
  density: '中',
  anchors: ['kicker', 'h-xl', '步骤序号', '步骤间细线', '竖引导线', '页脚条'],
  note: '与账本骨架的区别：账本是并列清单，流程有先后与引导线',
  css: `
    body { font-family: var(--sans); font-size: 52px; line-height: 1.5; color: var(--ink); }
    .kicker { font: 500 22px/1 var(--mono); letter-spacing: .24em; color: var(--accent);
      margin: 0 0 14px; }
    h1 { font-family: var(--serif); font-size: 64px; line-height: 1.16; margin: 0 0 10px; }
    .lead { font-size: 30px; color: var(--muted); margin: 0 0 28px; }
    .flow { border-left: 2px solid var(--line); margin-left: 26px; }
    .step {
      display: grid; grid-template-columns: 104px 1fr; align-items: start;
      padding: 18px 0; position: relative; min-height: 132px;
    }
    .step + .step { border-top: 1px solid var(--line); }
    .step .nb {
      font: 700 30px/1 var(--mono); color: var(--accent);
      margin-left: -26px; background: var(--paper); padding: 4px 0; width: 52px;
    }
    .step .tx { font-size: 40px; line-height: 1.42; }
    .foot { margin-top: 16px; font: 400 21px/1 var(--mono); letter-spacing: .18em;
      color: var(--muted); display: flex; justify-content: space-between; }
  `,
  html: `
    <p class="kicker">WORKFLOW · 六步</p>
    <h1>${esc(TITLE)}</h1>
    <p class="lead">从「带着手机」到「把手机留下」的六步</p>
    <div class="flow">
      ${BLOCKS.items.map((t, i) => `<div class="step">
        <span class="nb">${String(i + 1).padStart(2, '0')}</span>
        <span class="tx">${esc(t)}</span>
      </div>`).join('')}
    </div>
    <div class="foot"><span>按顺序执行</span><span>SUPERSU</span></div>
  `,
};

export const SKELETONS = [SK_MAGAZINE, SK_LEDGER, SK_EVIDENCE, SK_KPI, SK_PIPELINE];

export const skeletonById = (id) => SKELETONS.find((s) => s.id === id) || SKELETONS[0];
