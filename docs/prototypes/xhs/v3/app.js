/* ══════════════════════════════════════════════════════════════════════
   v3/app.js —— 两版骨架共用的行为层
   ─────────────────────────────────────────────────────────────────────
   依赖：../v2/xhs-ux-core.js（渲染内核）→ ./shared.js（资源与取色修正）
        → ../v2/v2-data.js（20 套配色 / 可见性规则 / withFrame）

   MODE 由 <body data-mode> 决定：
     three  = 方案 1 · 三栏常驻（版式 26 套全在右侧栏）
     canvas = 方案 2 · 单画布（版式 12 套常驻底部横条，其余进「全部版式」）

   两版**共用一份 paint()**，所以画出来的封面逐像素一致；
   本轮对比的只有骨架、版式数量与入口位置。
   ══════════════════════════════════════════════════════════════════════ */
'use strict';

const $ = (id) => document.getElementById(id);
const MODE = document.body.dataset.mode || 'three';

/* 方案 2 的横条固定放 12 套（C-2 的「12 强调一看就懂」那一档）；
   方案 1 的右栏一次铺全量（C-2 的「26 强调够用」那一档）。 */
const BAR_N = 12;

const SAMPLE = '周末去了趟海边\n海风 · 日落 · 一部没电的手机';
const ST = { size: 'xhs', densAuto: true, dens: 5 };
const PIC = { src: '', name: '', from: '' };
const RECENT = [];
const HISTORY = [];
const ART = { W: 1080, H: 1440, k: 1 };

/* 启动态：没图 → 纯文字版式。
   ⚠️ 不能只写 `if (!state.lay)`：core 的默认值是 image-led（要图），
   直接沿用会得到「没图却选了图文封面」的空白态。 */
if (!PIC.src) {
  if (layOf(state.lay).needImg) state.lay = 'bigtype';
}
state.pal = palFor(state.lay);

/* ── 基础 ── */
function toast(m) {
  const t = $('toast'); if (!t) return;
  t.textContent = m; t.className = 'on';
  clearTimeout(toast._t); toast._t = setTimeout(() => (t.className = ''), 2200);
}
const hasPic = () => ST.mode !== 'color' && !!PIC.src;
const txtValue = () => ($('txt') ? $('txt').value : '');

/* ── 画布缩放 ── */
function fit() {
  const r = $('stage').getBoundingClientRect();
  const k = Math.min((r.width - 36) / ART.W, (r.height - 20) / ART.H);
  ART.k = Math.max(0.05, k);
  $('cv-art').style.transform = `scale(${ART.k})`;
  $('cv-wrap').style.width = Math.round(ART.W * ART.k) + 'px';
  $('cv-wrap').style.height = Math.round(ART.H * ART.k) + 'px';
}

/* ── 主画布 ── */
function paint() {
  const dim = SIZES[ST.size];
  ART.W = dim.w; ART.H = dim.h;
  const { title, sub, items } = extract(txtValue());
  const src = ST.mode === 'color' ? '' : PIC.src;
  const an = src ? analysisCache.get(src) || null : null;

  if (!title) {
    $('cv-art').innerHTML =
      `<div class="cv-art" style="width:${dim.w}px;height:${dim.h}px;--paper:${palOf(state.pal).paper};display:grid;place-items:center">`
      + `<div style="text-align:center;color:#9A9384;font-size:26px;line-height:1.9">左边写一句话<br>`
      + `<span style="font-size:20px">画布立刻就有内容</span></div></div>`;
    window.__v = null;
  } else {
    const opt = {
      lay: state.lay, title, sub, items, auth: ($('sign') ? $('sign').value.trim() : ''),
      photo: src, an, kick: src ? 'NOTES' : '',
    };
    $('cv-art').innerHTML = coverHtml(dim.w, dim.h, opt);
    window.__v = opt._verdict;
  }
  if ($('dim')) $('dim').textContent = `${dim.w} × ${dim.h}`;
  if ($('layname')) $('layname').textContent = layOf(state.lay).name;
  const v = window.__v;
  if ($('vd')) {
    $('vd').textContent = src && v && v.verdict ? `${v.verdict}${v.cr ? ' ' + v.cr.toFixed(1) + ':1' : ''}`
      : (src ? '底图判定中' : '纯文字');
  }
  if ($('bar-info')) $('bar-info').textContent = src ? '底图已就绪' : '没有问题，直接存';
  fit();
  renderJudge();
  syncDrawerCounts();
}

/* 底图可读性显性化：这套产品真正的差异点是「它知道字压在图上清不清楚」 */
function renderJudge() {
  const blk = $('judge-blk');
  if (!blk) return;
  const v = window.__v;
  if (!hasPic() || !v || !v.verdict) { blk.hidden = true; return; }
  blk.hidden = false;
  const cr = v.cr || 0;
  const ok = v.verdict === '免压暗';
  $('judge-v').textContent = v.verdict + (cr ? ` ${cr.toFixed(1)}:1` : '');
  $('judge-fill').style.width = Math.min(100, (cr / 7) * 100) + '%';
  $('judge-fill').className = ok ? 'ok' : '';
  $('judge-note').textContent = ok
    ? '当前文字压在底图上也够清楚，不需要加暗角。'
    : `已加 ${Math.round((v.alpha || 0) * 100)}% 暗角保证可读。想更干净就换一张更暗的图。`;
}

/* ── 配图状态 ── */
function syncPic() {
  const on = hasPic();
  if ($('pic-cur')) $('pic-cur').hidden = !on;
  if ($('pic-empty')) $('pic-empty').hidden = on;
  if (on) {
    if ($('pic-img')) $('pic-img').src = PIC.src;
    if ($('pic-nm')) $('pic-nm').textContent = PIC.name;
    if ($('pic-src')) $('pic-src').textContent = PIC.from;
  }
  const segs = document.querySelectorAll('#seg button');
  segs.forEach((b) => b.classList.toggle('on', b.dataset.m === ST.mode));
  document.querySelectorAll('[data-pic-hint]').forEach((el) => {
    el.textContent = on ? '已选 1 张' : '纯文字版式';
  });
  if ($('recent')) {
    $('recent').innerHTML = RECENT.slice(0, 8).map((p) =>
      `<button data-src="${p.src}" data-nm="${p.name}" title="${p.name}"><img src="${p.src}" alt=""></button>`).join('');
  }
  syncDrawerCounts();
}

/* 先用一张图才会去分析它；分析没完成就挂上去，renderReal 会按「白字+暗角」兜底，
   压在浅色画面上等于字消失。 */
function usePic(src, name, from) {
  ST.mode = 'search';
  const img = new Image();
  img.onload = () => {
    PIC.src = src; PIC.name = name; PIC.from = from;
    if (!RECENT.some((r) => r.src === src)) RECENT.unshift({ src, name });
    syncPic(); renderAll();
    analyze(src).then((a) => { analysisCache.set(src, a); renderAll(); }).catch(() => {});
  };
  img.onerror = () => { toast('这张图打不开，换一张试试'); setNoPic(); };
  img.src = src;
}
function setNoPic() { ST.mode = 'color'; PIC.src = ''; PIC.name = ''; syncPic(); renderAll(); }

/* ── 示例图库（原型阶段：本地 6 张，落地接 search.js / Pexels） ── */
function guessKw(t) {
  const map = { '海': 'beach', '咖啡': 'coffee', '山': 'mountain', '街': 'street', '书': 'book', '花': 'flower', '夜': 'night' };
  for (const k in map) if (t.includes(k)) return map[k];
  return '';
}
function runSearch() {
  const kw = ($('kw').value || '').trim().toLowerCase();
  const hit = PHOTOS.filter((p) => kw && p.name.includes(kw));
  const pool = hit.length ? hit : PHOTOS;
  $('sgrid').innerHTML = pool.map((p) =>
    `<button class="sr" data-p="${p.id}" aria-pressed="${PIC.src === p.src}"><img src="${p.src}" alt="${p.name}"><span>${p.name}</span></button>`).join('');
  $('snote').textContent = kw
    ? `「${kw}」· ${pool.length} 张${hit.length ? '' : '（示例库按名字匹配，没命中就全给你）'}`
    : `示例图库 · ${PHOTOS.length} 张（落地接 Pexels，需用户自己填免费 Key）`;
}
function openSearch() {
  const { title } = extract(txtValue());
  $('kw').value = guessKw(title);
  $('search').hidden = false;
  runSearch();
  setTimeout(() => $('kw').select(), 60);
}

/* ── 版式卡 ── */
function layCard(l, opts) {
  const has = hasPic();
  const { sub } = extract(txtValue());
  const listCount = sub ? sub.split(/[·、\n]/).filter(Boolean).length : 0;
  const blocked = (l.needImg && !has) || (l.id === 'list' && listCount < 2);
  const why = l.needImg && !has ? '这套要一张图 · 点一下去选图'
    : l.id === 'list' && listCount < 2 ? '清单要 2 条以上小字' : l.desc;
  const { title } = extract(txtValue());
  const html = withFrame({ pal: palFor(l.id), font: 'auto', tmode: 'stack', vpos: 'auto' }, () =>
    coverHtml(300, 400, {
      lay: l.id,
      title: title || '你的标题',
      sub: sub || '第二行当小字',
      photo: l.needImg ? (PIC.src || '') : '',
      an: l.needImg ? analysisCache.get(PIC.src) || null : null,
      kick: l.needImg ? 'NOTES' : '',
    }));
  const cls = opts && opts.flat ? 'lay flat' : 'lay';
  return `<button class="${cls}" data-l="${l.id}" aria-pressed="${state.lay === l.id}"`
    + `${blocked ? ' aria-disabled="true"' : ''} title="${why}">`
    + `<div class="lay-th"><div class="art" style="width:300px;height:400px">${html}</div>`
    + (l.needImg ? '<span class="lay-tag">图</span>' : '')
    + (l.code && l.code !== '—' ? `<span class="lay-code">${l.code}</span>` : '')
    + (state.lay === l.id ? '<span class="lay-ok">✓</span>' : '')
    + `</div><div class="lay-nm">${l.name}</div></button>`;
}

/* 把 300×400 的缩略图缩到卡宽 */
function scaleArt(root) {
  if (!root) return;
  root.querySelectorAll('.lay-th, .hc-th').forEach((box) => {
    const art = box.querySelector('.art'); if (!art) return;
    const w = box.clientWidth || 89;
    art.style.transform = `scale(${w / 300})`;
  });
}

/* 一屏放下 n 套所需的最少列数（5 列优先，放不下才升 6 列） */
function bestCols(n) {
  const box = $('lay-scroll');
  if (!box) return 5;
  const avail = box.clientHeight - 14;
  const width = box.clientWidth - 24;
  for (const c of [5, 6]) {
    const w = (width - (c - 1) * 6) / c;
    const cardH = w * 4 / 3 + 22 + (c === 6 ? 2 : 3);
    const gapY = c === 6 ? 9 : 12;
    const rows = Math.ceil(n / c);
    if (rows * cardH + (rows - 1) * gapY <= avail) return c;
  }
  return 6;
}

function renderLays() {
  const has = hasPic();
  const all = orderedLays(has);
  const keep = { font: state.font, tmode: state.tmode, vpos: state.vpos, pal: state.pal };
  const hid = hiddenImgCount(has);

  if (MODE === 'three' || MODE === 'hybrid') {
    /* 方案 1 / 方案 3：全量铺在右栏。
       方案 3 换位后右栏只有 360px（方案 1 是 520px），同一套 bestCols 会算出
       6 列 × 60px 的碎卡片 —— 所以按栏宽单独限一下列数上限。 */
    $('lays').innerHTML = all.map((l) => layCard(l)).join('');
    let cols = ST.densAuto ? bestCols(all.length) : ST.dens;
    if (MODE === 'hybrid' && ST.densAuto) cols = Math.min(cols, 4);
    $('lays').className = 'lay-grid d' + cols;
    $('lay-n').textContent = `${all.length} 套`;
    const need = $('lay-need');
    need.hidden = !hid;
    if (hid) need.textContent = `另有 ${hid} 套要图 →`;
    $('dens').querySelectorAll('button').forEach((b) => b.classList.toggle('on', Number(b.dataset.d) === cols));
    scaleArt($('lays'));
  } else {
    /* 方案 2：底部横条只放 12 套；方案 3：横条铺全量（右栏不再放版式）。
       当前选中的若不在横条内，插到最前面，
       否则用户点了「全部版式」里的第 20 套，横条上看不到自己选了什么。 */
    const n = MODE === 'hybrid' ? all.length : BAR_N;
    let bar = all.slice(0, n);
    const cur = all.find((l) => l.id === state.lay);
    if (cur && !bar.some((l) => l.id === cur.id)) bar = [cur, ...bar.slice(0, n - 1)];
    $('laybar').innerHTML = bar.map((l) => layCard(l, { flat: true })).join('');
    $('laybar-n').textContent = `${all.length} 套`;
    $('laybar-more').textContent = `全部\n${all.length}`;
    if ($('lay-need')) { $('lay-need').hidden = !hid; if (hid) $('lay-need').textContent = `另有 ${hid} 套要图`; }
    scaleArt($('laybar'));
    const on = $('laybar').querySelector('[aria-pressed="true"]');
    if (on && on.scrollIntoView) on.scrollIntoView({ block: 'nearest', inline: 'center' });
  }
  for (const k in keep) state[k] = keep[k];
}

/* ── 配色 / 字体 / 玩法 / 位置 / 尺寸 ── */
function renderPals() {
  const keys = (layOf(state.lay).pals || ['warm']).slice(0, 10);
  if (!keys.includes(state.pal)) state.pal = keys[0];
  document.querySelectorAll('[data-pals]').forEach((box) => {
    box.innerHTML = keys.map((k) => {
      const p = palOf(k);
      return `<button class="pchip" data-pal="${k}" aria-pressed="${state.pal === k}" title="${p.name}">`
        + `<span class="sw" style="background:${p.paper}"><i style="background:${p.accent}"></i></span>${p.name}</button>`;
    }).join('');
  });
}
function setPal(k) { state.pal = k; PAL_MAP[state.lay] = k; renderPals(); paint(); renderLays(); }

function renderFonts() {
  document.querySelectorAll('[data-fonts]').forEach((box) => {
    box.innerHTML = FONTS.map((f) =>
      `<button class="fchip" data-f="${f.id}" aria-pressed="${state.font === f.id}" title="${f.note}"`
      + ` style="font-family:${f.family}">${f.name}</button>`).join('');
  });
  document.querySelectorAll('[data-fonts] [data-f]').forEach((b) => {
    b.onclick = () => { state.font = b.dataset.f; ensureFont(b.dataset.f); renderFonts(); paint(); };
  });
}
const T_SHORT = { stack: '默认', poster: '大字', vertical: '竖排', offset: '错位', rainbow: '变色', outline: '描边', stagger: '错开' };
function renderTmodes() {
  document.querySelectorAll('[data-tmodes]').forEach((box) => {
    box.innerHTML = TMODES.map((m) =>
      `<button class="fchip sm" data-t="${m.id}" aria-pressed="${state.tmode === m.id}" title="${m.name} · ${m.note}">${T_SHORT[m.id] || m.name}</button>`).join('');
  });
  document.querySelectorAll('[data-tmodes] [data-t]').forEach((b) => {
    b.onclick = () => { state.tmode = b.dataset.t; renderTmodes(); paint(); };
  });
}
const VPOS = [{ id: 'auto', n: '自动' }, { id: 'top', n: '上' }, { id: 'mid', n: '中' }, { id: 'bottom', n: '下' }];
function renderVpos() {
  document.querySelectorAll('[data-vpos]').forEach((box) => {
    box.innerHTML = VPOS.map((v) =>
      `<button class="fchip sm" data-v="${v.id}" aria-pressed="${state.vpos === v.id}">${v.n}</button>`).join('');
  });
  document.querySelectorAll('[data-vpos] [data-v]').forEach((b) => {
    b.onclick = () => { state.vpos = b.dataset.v; renderVpos(); paint(); };
  });
}
function renderSizes() {
  document.querySelectorAll('[data-sizes]').forEach((box) => {
    box.innerHTML = Object.entries(SIZES).map(([k, s]) =>
      `<button class="chip" data-s="${k}" aria-pressed="${ST.size === k}">${s.label}</button>`).join('');
  });
  document.querySelectorAll('[data-sizes] [data-s]').forEach((b) => {
    b.onclick = () => { ST.size = b.dataset.s; renderSizes(); paint(); };
  });
}

function renderAll() { syncPic(); renderLays(); renderPals(); paint(); renderJudge(); }

/* ── 版式点击（两版共用） ── */
function onLayClick(e) {
  const b = e.target.closest('.lay'); if (!b) return;
  if (b.getAttribute('aria-disabled') === 'true') {
    const l = layOf(b.dataset.l);
    if (l.needImg && !hasPic()) { toast('这套要一张底图，先选张图'); return openSearch(); }
    toast('清单版式要 2 条以上小字'); return;
  }
  state.lay = b.dataset.l;
  state.pal = PAL_MAP[state.lay] || layOf(state.lay).pals[0];
  renderLays(); renderPals(); paint();
}

/* ── 全部版式 ── */
function openOverview() {
  const has = hasPic();
  const list = orderedLays(has);
  const keep = state.pal;
  $('ov-grid').innerHTML = list.map((l) => {
    const { title, sub } = extract(txtValue());
    const html = withFrame({ pal: palFor(l.id), font: 'auto', tmode: 'stack', vpos: 'auto' }, () =>
      coverHtml(300, 400, {
        lay: l.id, title: title || '你的标题', sub: sub || '',
        photo: l.needImg ? PIC.src : '',
        an: l.needImg ? analysisCache.get(PIC.src) || null : null,
      }));
    return `<button class="lay ov" data-l="${l.id}" aria-pressed="${state.lay === l.id}" title="${l.desc}">`
      + `<div class="lay-th"><div class="art" style="width:300px;height:400px">${html}</div>`
      + (l.code && l.code !== '—' ? `<span class="lay-code">${l.code}</span>` : '')
      + `</div><div class="lay-nm">${l.name}</div></button>`;
  }).join('');
  state.pal = keep;
  $('ov-sub').textContent = `${list.length} 套 · 全屏看，点一张直接换`;
  $('ov').hidden = false;
  scaleArt($('ov-grid'));
}

/* ── 九宫格：先量「每一格到底有没有内容」再让用户下载 ── */
function nineCoverage() {
  const root = $('cv-art');
  const prev = root.style.transform;
  root.style.transform = 'none';
  const R = root.getBoundingClientRect();
  const area = 1080 * 1440;
  const acc = new Array(9).fill(0);
  const push = (r) => {
    const w = r.width, h = r.height;
    if (w * h > area * 0.55) return;
    for (let i = 0; i < 9; i++) {
      const tx = (i % 3) * 360, ty = Math.floor(i / 3) * 480;
      const ox = Math.max(0, Math.min(r.right - R.left, tx + 360) - Math.max(r.left - R.left, tx));
      const oy = Math.max(0, Math.min(r.bottom - R.top, ty + 480) - Math.max(r.top - R.top, ty));
      acc[i] += ox * oy;
    }
  };
  root.querySelectorAll('*').forEach((el) => {
    if (el.tagName === 'IMG') { push(el.getBoundingClientRect()); return; }
    const direct = [...el.childNodes].some((n) => n.nodeType === 3 && n.textContent.trim().length > 0);
    if (direct) {
      const rg = document.createRange();
      rg.selectNodeContents(el);
      [...rg.getClientRects()].forEach(push);
    }
    const bg = getComputedStyle(el).backgroundColor;
    if (bg && bg !== 'rgba(0, 0, 0, 0)' && bg !== 'transparent') push(el.getBoundingClientRect());
  });
  root.style.transform = prev;
  return acc.map((a) => a / (360 * 480));
}

function openNine() {
  const box = $('cv-art').querySelector('.cv-art');
  if (!box) return toast('画布还是空的');
  const cov = nineCoverage();
  const clone = box.cloneNode(true);
  clone.style.transform = 'none';
  const src = clone.outerHTML;
  $('ngrid').innerHTML = Array.from({ length: 9 }, (_, i) =>
    `<div class="ncell${cov[i] < 0.02 ? ' blank' : ''}">`
    + `<div class="nlayer" style="transform:translate(${-360 * (i % 3)}px,${-480 * Math.floor(i / 3)}px)">${src}</div>`
    + `<span class="nno">${i + 1}</span></div>`).join('');
  $('ngrid').querySelectorAll('.ncell').forEach((cell, i) => {
    const k = cell.clientWidth / 1080;
    cell.querySelector('.nlayer').style.transform =
      `scale(${k}) translate(${-360 * (i % 3)}px,${-480 * Math.floor(i / 3)}px)`;
  });
  $('nine').hidden = false;
  const blanks = cov.filter((c) => c < 0.02).length;
  $('nine-warn').hidden = blanks < 3;
  $('nine-warn-t').textContent = `这套版式只有 ${9 - blanks} / 9 格有内容，其余 ${blanks} 张会是空白图`;
  $('nine-sub').textContent = `把这张切成 3 × 3 · ${9 - blanks}/9 格有内容`;
}

/* ── 出片 ── */
function save() {
  const { title } = extract(txtValue());
  if (!title) return toast('先写一句话');
  $('cv-wrap').classList.add('fixing');
  setTimeout(() => $('cv-wrap').classList.remove('fixing'), 520);
  const box = $('cv-art').querySelector('.cv-art');
  $('tray-th').innerHTML = box
    ? `<div class="art" style="width:1080px;height:1440px;transform:scale(0.035)">${box.outerHTML}</div>`
    : '';
  $('tray-s').textContent = `${ART.W} × ${ART.H} · PNG · 约 ${title.length > 8 ? '1.2' : '0.9'} MB · 纯前端生成`;
  $('tray').classList.add('on');
  /* C-8：出片即入历史（原型里只存内存，落地写 supersu.cover.history.v1） */
  HISTORY.unshift({
    lay: state.lay, layName: layOf(state.lay).name, pal: state.pal,
    size: ST.size, title, at: Date.now(), art: box ? box.outerHTML : '',
  });
  if (HISTORY.length > 24) HISTORY.length = 24;
  /* 命令栏的「历史 N」要当场 +1：只在抽屉开关时刷是错的 ——
     用户出完片回看命令栏还是旧的 0，会以为没存上。 */
  syncDrawerCounts();
}

/* ── 历史（C-8：入口位置是两版的差异点之一） ── */
function openHistory() {
  const box = $('hist');
  if (!HISTORY.length) {
    box.innerHTML = '<div class="hist-empty">还没有出过片。<br>点「保存大图」之后，这里按时间倒序留最近 24 张，'
      + '点一张就能把当时的版式 / 配色 / 尺寸整套还原回来。</div>';
  } else {
    box.innerHTML = HISTORY.map((h, i) =>
      `<button class="hcard" data-h="${i}">`
      + `<div class="hc-th"><div class="art" style="width:1080px;height:1440px">${h.art}</div></div>`
      + `<div class="hc-nm">${h.title}</div>`
      + `<div class="hc-s">${h.layName} · ${SIZES[h.size].label}</div></button>`).join('');
  }
  const sz = SIZES.xhs;
  $('hist-sub').textContent = `${HISTORY.length} 张 · 只是原型，刷新即清空`;
  $('history').hidden = false;
  box.querySelectorAll('.hc-th').forEach((th) => {
    const art = th.querySelector('.art'); if (!art) return;
    art.style.transform = `scale(${(th.clientWidth || 120) / 1080})`;
  });
  void sz;
}
function restoreHistory(i) {
  const h = HISTORY[i]; if (!h) return;
  state.lay = h.lay;
  state.pal = h.pal;
  ST.size = h.size;
  $('history').hidden = true;
  renderLays(); renderPals(); renderSizes(); paint();
  toast(`已还原「${h.layName}」`);
}

/* ── 方案 2：底部抽屉 ── */
function openDrawer(name) {
  /* 历史不是「常驻抽屉里的一块」——它本身就是一张清单，用弹层比塞进底部抽屉好读。
     C-8 的差异在**入口位置**（三栏版收进顶栏，单画布/混合版命令栏常驻），不在形态。
     ⚠️ 必须先判 hist 再取 drawer：方案 3 没有 drawer 节点，
        原来 `const d = $('drawer'); if (!d) return;` 写在前面 → 历史入口点了没反应。 */
  if (name === 'hist') { closeDrawer(); return openHistory(); }
  const d = $('drawer'); if (!d) return;
  if (d.classList.contains('on') && d.dataset.pane === name) return closeDrawer();
  /* 抽屉从「命令栏上沿」往上长，不盖命令栏 ——
     否则抽屉一开，「历史 / 保存 / 关掉」全被埋掉，用户只能靠 Esc（实测 2026-11-03）。 */
  const cb = document.querySelector('.cmdbar');
  d.style.bottom = (cb ? cb.getBoundingClientRect().height : 0) + 'px';
  d.dataset.pane = name;
  d.querySelectorAll('.pane').forEach((p) => p.classList.toggle('on', p.dataset.pane === name));
  d.querySelectorAll('.cmd[data-pane]').forEach((b) => b.classList.toggle('on', b.dataset.pane === name));
  d.classList.add('on');
  if (name === 'style') { renderPals(); renderFonts(); renderTmodes(); renderVpos(); renderSizes(); }
  if ($('drawer-t')) {
    $('drawer-t').textContent = {
      text: '文案', pic: '配图', style: '配色 · 字体 · 玩法', size: '尺寸与署名', hist: '历史记录',
    }[name] || '—';
  }
  if (name === 'hist') openHistory();
}
function closeDrawer() {
  const d = $('drawer'); if (!d) return;
  d.classList.remove('on');
  d.querySelectorAll('.cmd[data-pane]').forEach((b) => b.classList.remove('on'));
}
function syncDrawerCounts() {
  /* 方案 2 与方案 3 的命令栏都常驻「历史 N」，都要刷新。
     方案 3 没有抽屉，其余计数元素不存在，逐个判空即可。 */
  if (MODE !== 'canvas' && MODE !== 'hybrid') return;
  const t = txtValue();
  if ($('cmd-text-n')) $('cmd-text-n').textContent = `${t.length}`;
  if ($('cmd-pic-n')) $('cmd-pic-n').textContent = hasPic() ? '1' : '0';
  if ($('cmd-hist-n')) $('cmd-hist-n').textContent = `${HISTORY.length}`;
  if ($('cmd-style-n')) $('cmd-style-n').textContent = palOf(state.pal).name;
  if ($('drawer-cnt')) $('drawer-cnt').textContent = `${t.length} / 500`;
  if ($('style-n')) $('style-n').textContent = palOf(state.pal).name;
}

/* ── 本版取舍说明（评审用：告诉用户这一版做了什么选择） ── */
const MODE_INFO = {
  three: {
    title: '方案 1 · 三栏常驻',
    lead: '左写 · 中看 · 右换。版式和配色永远是可见的一列，切换零点击成本。',
    rows: [
      ['骨架 C-1', '三栏常驻 236 / 1fr / 520（与线上 V2 一致）'],
      ['版式 C-2', '一次铺满 26 套（有图）/ 16 套（无图），一屏放得下'],
      ['结果区 C-7', '不要结果区 —— 画布本身就是结果，出片走底部托盘'],
      ['历史 C-8', '收进顶栏 ⋯ 菜单，不占版面'],
      ['代价', '画布宽度被两侧压到 ~684px，看大图时偏小；窄屏必须折成 tab'],
    ],
  },
  canvas: {
    title: '方案 2 · 单画布',
    lead: '画布吃满整页，12 套常用版式常驻底部横条，其余控件进底部抽屉。',
    rows: [
      ['骨架 C-1', '单画布：画布占 ~70%，底部 112px 版式横条 + 46px 命令栏'],
      ['版式 C-2', '横条只留 12 套最常用，其余 14 套进「全部版式」弹层'],
      ['结果区 C-7', '不要结果区，出片仍是底部托盘（画布即结果）'],
      ['历史 C-8', '命令栏常驻入口「历史 N」，点开即弹层'],
      ['代价', '高频切换要横向滚动；配色/字体要开抽屉，多一次点击'],
    ],
  },
  hybrid: {
    title: '方案 3 · 混合骨架',
    lead: '左写 · 中看 · 右换皮 · 下版式：版式全部沉到画布下方的一条横条，右栏只留配色与字体。',
    rows: [
      ['骨架 C-1', '三栏 236 / 1fr / 320 + 画布下方 112px 版式横条 + 46px 命令栏'],
      ['版式 C-2', '横条铺满 30 套（横向滚动），右栏不再放版式 → 画布宽度回到 ~820px'],
      ['结果区 C-7', '不要结果区，出片走底部托盘（画布即结果）'],
      ['历史 C-8', '命令栏常驻「历史 N」，点开即弹层（与方案 2 同）'],
      ['代价', '看版式要横向滚；右栏只剩换皮开关，选版式时视线要往下走'],
    ],
  },
};
function openModeInfo() {
  const m = MODE_INFO[MODE];
  $('mi-t').textContent = m.title;
  $('mi-lead').textContent = m.lead;
  $('mi-rows').innerHTML = m.rows.map(([k, v]) => `<tr><th>${k}</th><td>${v}</td></tr>`).join('');
  $('modeinfo').hidden = false;
}

/* ── 事件接线 ── */
function wire() {
  const txt = $('txt');
  if (txt) {
    txt.value = SAMPLE;
    txt.addEventListener('input', () => {
      if ($('cnt')) $('cnt').textContent = `${txt.value.length} / 500`;
      paint(); renderLays();
    });
    if ($('cnt')) $('cnt').textContent = `${txt.value.length} / 500`;
  }
  if ($('demo')) $('demo').onclick = () => { txt.value = SAMPLE; if ($('cnt')) $('cnt').textContent = `${SAMPLE.length} / 500`; paint(); renderLays(); };
  if ($('clear')) $('clear').onclick = () => { txt.value = ''; if ($('cnt')) $('cnt').textContent = '0 / 500'; paint(); renderLays(); };
  if ($('use-main')) $('use-main').onclick = () => toast('落地时读公众号排版页的标题与首段（supersu.article）');

  const seg = $('seg');
  if (seg) {
    seg.onclick = (e) => {
      const b = e.target.closest('button'); if (!b) return;
      const m = b.dataset.m;
      if (m === 'color') return setNoPic();
      if (m === 'upload') { ST.mode = 'upload'; syncPic(); return $('file').click(); }
      ST.mode = 'search'; syncPic(); openSearch();
    };
  }
  if ($('file')) {
    $('file').onchange = (e) => {
      const f = e.target.files && e.target.files[0]; if (!f) return;
      const r = new FileReader();
      r.onload = () => usePic(String(r.result), f.name.slice(0, 18), '本地上传');
      r.readAsDataURL(f); e.target.value = '';
    };
  }
  if ($('pic-change')) $('pic-change').onclick = () => openSearch();
  if ($('pic-none')) $('pic-none').onclick = () => setNoPic();
  if ($('pic-search')) $('pic-search').onclick = () => openSearch();
  if ($('pic-upload')) $('pic-upload').onclick = () => { ST.mode = 'upload'; $('file').click(); };
  if ($('recent')) {
    $('recent').onclick = (e) => {
      const b = e.target.closest('button'); if (!b) return;
      usePic(b.dataset.src, b.dataset.nm, '最近使用');
    };
  }

  if ($('search-x')) $('search-x').onclick = () => ($('search').hidden = true);
  if ($('search')) $('search').onclick = (e) => { if (e.target === $('search')) $('search').hidden = true; };
  if ($('search-go')) $('search-go').onclick = () => runSearch();
  if ($('kw')) $('kw').onkeydown = (e) => { if (e.key === 'Enter') runSearch(); };
  if ($('upload-here')) $('upload-here').onclick = () => { $('search').hidden = true; $('file').click(); };
  if ($('sgrid')) {
    $('sgrid').onclick = (e) => {
      const b = e.target.closest('.sr'); if (!b) return;
      const p = PHOTOS.find((x) => x.id === b.dataset.p);
      $('search').hidden = true;
      usePic(p.src, p.name, '示例图库');
    };
  }

  document.querySelectorAll('[data-pals]').forEach((box) => {
    box.onclick = (e) => { const b = e.target.closest('.pchip'); if (b) setPal(b.dataset.pal); };
  });

  if ($('lays')) $('lays').onclick = onLayClick;
  if ($('laybar')) $('laybar').onclick = onLayClick;

  if ($('dens')) {
    $('dens').onclick = (e) => {
      const b = e.target.closest('button'); if (!b) return;
      const d = Number(b.dataset.d);
      ST.densAuto = ST.densAuto ? false : (ST.dens === d);
      if (!ST.densAuto) ST.dens = d;
      renderLays();
    };
  }
  if ($('lay-need')) $('lay-need').onclick = () => openSearch();
  if ($('ov-open')) $('ov-open').onclick = openOverview;
  if ($('laybar-more')) $('laybar-more').onclick = openOverview;
  if ($('ov-x')) $('ov-x').onclick = () => ($('ov').hidden = true);
  if ($('ov')) $('ov').onclick = (e) => { if (e.target === $('ov')) $('ov').hidden = true; };
  if ($('ov-grid')) {
    $('ov-grid').onclick = (e) => {
      const b = e.target.closest('.lay'); if (!b) return;
      state.lay = b.dataset.l;
      state.pal = PAL_MAP[state.lay] || layOf(state.lay).pals[0];
      $('ov').hidden = true;
      renderLays(); renderPals(); paint();
    };
  }

  if ($('sign')) $('sign').addEventListener('input', () => paint());
  if ($('frost')) $('frost').addEventListener('change', (e) => { state.frost = e.target.checked; paint(); });

  if ($('btn-nine')) $('btn-nine').onclick = openNine;
  if ($('nine-x')) $('nine-x').onclick = () => ($('nine').hidden = true);
  if ($('nine')) $('nine').onclick = (e) => { if (e.target === $('nine')) $('nine').hidden = true; };
  if ($('nine-fix')) {
    $('nine-fix').onclick = () => {
      state.tmode = 'poster'; renderTmodes(); paint();
      setTimeout(() => { $('nine').hidden = true; openNine(); toast('已把标题放到最大，再看看每格'); }, 260);
    };
  }
  if ($('nine-dl')) $('nine-dl').onclick = () => { $('nine').hidden = true; toast('落地走 fflate 打 ZIP，9 张 360×480'); };

  ['btn-save', 'save-top', 'cmd-save'].forEach((id) => { if ($(id)) $(id).onclick = save; });
  if ($('tray-x')) $('tray-x').onclick = () => $('tray').classList.remove('on');
  if ($('tray-dl')) $('tray-dl').onclick = () => { $('tray').classList.remove('on'); toast('落地走 canvas.toBlob → a.download'); };
  if ($('tray-copy')) $('tray-copy').onclick = () => { $('tray').classList.remove('on'); toast('落地写 navigator.clipboard.write text/html'); };
  if ($('btn-copy')) $('btn-copy').onclick = () => toast('复制富文本 · 可直接粘进公众号');

  if ($('hist-open')) $('hist-open').onclick = openHistory;
  if ($('hist-x')) $('hist-x').onclick = () => ($('history').hidden = true);
  if ($('history')) $('history').onclick = (e) => { if (e.target === $('history')) $('history').hidden = true; };
  if ($('hist')) {
    $('hist').onclick = (e) => {
      const b = e.target.closest('.hcard'); if (!b) return;
      restoreHistory(Number(b.dataset.h));
    };
  }

  if ($('mi-open')) $('mi-open').onclick = openModeInfo;
  if ($('mi-x')) $('mi-x').onclick = () => ($('modeinfo').hidden = true);
  if ($('modeinfo')) $('modeinfo').onclick = (e) => { if (e.target === $('modeinfo')) $('modeinfo').hidden = true; };

  if ($('drawer')) {
    $('drawer').addEventListener('click', (e) => {
      if (e.target.closest('.cmd')) return;
      if (e.target.dataset && e.target.dataset.close === '1') closeDrawer();
    });
    if ($('drawer-x')) $('drawer-x').onclick = closeDrawer;
  }
  document.querySelectorAll('.cmd[data-pane]').forEach((b) => { b.onclick = () => openDrawer(b.dataset.pane); });

  const mnav = document.querySelector('.mnav');
  if (mnav) {
    mnav.onclick = (e) => {
      const b = e.target.closest('button'); if (!b) return;
      [...mnav.children].forEach((x) => x.classList.toggle('on', x === b));
      const w = $('col-w'), s = $('col-s');
      if (w) w.classList.toggle('on', b.dataset.p === 'w');
      if (s) s.classList.toggle('on', b.dataset.p === 's');
    };
  }

  window.addEventListener('resize', () => { fit(); renderLays(); });
  /* Esc 逐层关：先关抽屉/弹层，最后什么都不做。
     原型里没有浏览器返回键，缺这一条用户会卡在抽屉里出不来。 */
  document.addEventListener('keydown', (e) => {
    if (e.key !== 'Escape') return;
    const layers = ['modeinfo', 'history', 'ov', 'nine', 'search'];
    for (const id of layers) {
      const el = $(id);
      if (el && !el.hidden) { el.hidden = true; return; }
    }
    closeDrawer();
  });
  if (document.fonts && document.fonts.ready) {
    document.fonts.ready.then(() => { paint(); renderLays(); });
  }
}

/* ── 启动 ── */
renderFonts(); renderTmodes(); renderVpos(); renderSizes();
wire();
syncPic(); renderLays(); renderPals(); paint();
setTimeout(() => { fit(); scaleArt($('lays')); scaleArt($('laybar')); }, 60);
FONTS.forEach((f) => { if (f.file) ensureFont(f.id); });
