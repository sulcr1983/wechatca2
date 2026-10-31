// cdp_measure.mjs 的配套探针：量顶栏在窄屏有没有「横向溢出 / 左右两簇重叠」。
// 对原型和对真实 dist/index.html **通用**（真实页面里没有的元素会显示 MISSING）。
// 用法见 scripts/cdp_measure.mjs 头部。
const W = window.innerWidth;
const L = [];
L.push('innerWidth=' + W + '  scrollWidth=' + document.documentElement.scrollWidth + '   (两者相等 = 无横向溢出)');

// 真实系统里 #btn-cover 默认是未按下态；本探针把它按下去，因为「按下态」文案更长、才是最挤的情况。
const cb = document.querySelector('#btn-cover') || document.querySelector('.cover-btn');
if (cb && cb.getAttribute('aria-pressed') !== 'true') {
  cb.setAttribute('aria-pressed', 'true');
  cb.textContent = '公众号排版';
}

const pick = ['.top', '.top-left', '.top-right', '.brand', '.brand-tail', '.brand-sub',
  '.cover-btn', '.engine-badge', '.menu-btn', '.icon-btn', '.pathbar', '#paths'];
for (const sel of pick) {
  const el = document.querySelector(sel);
  if (!el) { L.push(sel.padEnd(15) + ' MISSING'); continue; }
  const r = el.getBoundingClientRect(), cs = getComputedStyle(el);
  L.push(sel.padEnd(15) +
    ' L=' + r.left.toFixed(0).padStart(4) +
    ' R=' + r.right.toFixed(0).padStart(4) +
    ' W=' + r.width.toFixed(0).padStart(4) +
    ' H=' + r.height.toFixed(0).padStart(3) +
    ' disp=' + cs.display + ' fs=' + cs.fontSize);
}

const tl = document.querySelector('.top-left');
const tr = document.querySelector('.top-right');
const cbb = document.querySelector('.cover-btn');
if (tl && tr && cbb) {
  const a = tl.getBoundingClientRect(), b = tr.getBoundingClientRect(), c = cbb.getBoundingClientRect();
  L.push('--- 碰撞判定 ---');
  L.push('top-left.R=' + a.right.toFixed(0) + '  cover-btn.R=' + c.right.toFixed(0) + '  top-right.L=' + b.left.toFixed(0));
  L.push(c.right > b.left
    ? '!! 封面按钮压住右侧簇，重叠 ' + (c.right - b.left).toFixed(0) + 'px'
    : 'OK 不重叠，间隙 ' + (b.left - c.right).toFixed(0) + 'px');
  L.push('coverText=[' + cbb.textContent + ']');
}

let over = 0;
const shown = [];
for (const el of document.querySelectorAll('*')) {
  const r = el.getBoundingClientRect();
  if (r.right > W + 1 && r.width > 0) {
    over++;
    if (shown.length < 12) {
      shown.push('  OVERFLOW ' + el.tagName.toLowerCase() + (el.id ? '#' + el.id : '') +
        '.' + String(el.className || '').trim().split(/\s+/).join('.') + ' R=' + r.right.toFixed(0));
    }
  }
}
L.push('--- 超宽元素 ---');
L.push(over === 0 ? '  无' : shown.join('\n'));
L.push('共 ' + over + ' 个（横向滚动容器里的子元素不算故障，看 scrollWidth 是否等于 innerWidth 才是准的）');
return L.join('\n');
