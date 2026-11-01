// 生成 v2 配色表，并强制校验：正文 ≥7 / 强调小字 ≥4.5 / 色块压字 ≥4.5 / 次要字 ≥4.5
// 不达标就自动修正（accentText 向 ink 靠；色块改用 deepen 后的 accent），最后打印结果。

const hex2rgb = (h) => [1, 3, 5].map((i) => parseInt(h.slice(i, i + 2), 16));
const rgb2hex = (a) => '#' + a.map((v) => Math.round(Math.max(0, Math.min(255, v))).toString(16).padStart(2, '0')).join('');
const lum = (h) => {
  const c = hex2rgb(h).map((v) => v / 255).map((v) => (v <= 0.03928 ? v / 12.92 : Math.pow((v + 0.055) / 1.055, 2.4)));
  return 0.2126 * c[0] + 0.7152 * c[1] + 0.0722 * c[2];
};
const cr = (a, b) => { const [x, y] = [lum(a), lum(b)].sort((p, q) => q - p); return (x + 0.05) / (y + 0.05); };
const mix = (a, b, t) => rgb2hex(hex2rgb(a).map((v, i) => v + (hex2rgb(b)[i] - v) * t));
// 在 paper 上找一个「够黑」的 accentText（保持色相，只压明度）
const fitText = (paper, accent, ink, target = 4.5) => {
  if (cr(paper, accent) >= target) return accent;
  for (let t = 0.05; t <= 1; t += 0.05) { const c = mix(accent, ink, t); if (cr(paper, c) >= target) return c; }
  return ink;
};
// 色块上的字：黑/白择优；两边都不够就压深色块
const blockPair = (accent) => {
  const w = cr(accent, '#ffffff'), k = cr(accent, '#0a0a0a');
  const fg = w >= k ? '#ffffff' : '#0a0a0a';
  if (Math.max(w, k) >= 4.5) return { bg: accent, fg, fixed: false };
  let bg = accent;
  for (let t = 0.05; t <= 0.75; t += 0.05) {
    bg = mix(accent, '#000000', t);
    if (Math.max(cr(bg, '#ffffff'), cr(bg, '#0a0a0a')) >= 4.5) break;
  }
  return { bg, fg: cr(bg, '#ffffff') >= cr(bg, '#0a0a0a') ? '#ffffff' : '#0a0a0a', fixed: true };
};

// ── 三族：纸感 / 浓郁 / 暗夜 ──
const SRC = [
  // 纸感（真实产品已有，值照抄 catalog.js / cards.js）
  { key: 'dune', name: '沙丘暖纸', fam: 'paper', paper: '#f0e6d2', ink: '#1f1a14', muted: '#6f6557', accent: '#8f7650', line: 'rgba(31,26,20,.20)' },
  { key: 'forest', name: '森林墨绿', fam: 'paper', paper: '#f5f1e8', ink: '#16211b', muted: '#5c6a60', accent: '#2e6b4f', line: 'rgba(22,33,27,.18)' },
  { key: 'indigo', name: '靛蓝瓷白', fam: 'paper', paper: '#f2f4f5', ink: '#161c26', muted: '#5b6675', accent: '#315d93', line: 'rgba(22,28,38,.16)' },
  { key: 'kraft', name: '牛皮纸', fam: 'paper', paper: '#eedfc7', ink: '#241c12', muted: '#6b5b42', accent: '#9b5a2e', line: 'rgba(36,28,18,.22)' },
  { key: 'classic', name: '经典墨色', fam: 'paper', paper: '#f3f0e8', ink: '#111111', muted: '#6b6459', accent: '#111111', line: 'rgba(17,17,17,.18)' },
  { key: 'warm', name: '暖纸', fam: 'paper', paper: '#f4efe4', ink: '#1c1a16', muted: '#6f6a5f', accent: '#b4552f', line: 'rgba(28,26,22,.18)' },
  { key: 'ikb', name: '克莱因蓝', fam: 'paper', paper: '#fafaf8', ink: '#111111', muted: '#6b6b66', accent: '#002FA7', line: 'rgba(17,17,17,.16)' },
  { key: 'lemon', name: '柠檬绿', fam: 'paper', paper: '#fafaf8', ink: '#111111', muted: '#6b6b66', accent: '#C5E803', line: 'rgba(17,17,17,.16)' },
  { key: 'safety', name: '安全橙', fam: 'paper', paper: '#fafaf8', ink: '#111111', muted: '#6b6b66', accent: '#FF6B35', line: 'rgba(17,17,17,.16)' },

  // 浓郁（纸色就是高饱和色 —— 这才是「多巴胺」，之前只改了强调色所以整片淡）
  { key: 'butter', name: '黄油', fam: 'bold', paper: '#FFE066', ink: '#191400', muted: '#6B5A00', accent: '#B23A00', line: 'rgba(25,20,0,.26)' },
  { key: 'lime', name: '青柠', fam: 'bold', paper: '#C6F432', ink: '#111700', muted: '#4E5F00', accent: '#0B5D3B', line: 'rgba(17,23,0,.28)' },
  { key: 'coral', name: '珊瑚', fam: 'bold', paper: '#FF8A75', ink: '#210703', muted: '#7A1F12', accent: '#5B1200', line: 'rgba(33,7,3,.28)' },
  { key: 'azure', name: '天蓝', fam: 'bold', paper: '#8FD0FF', ink: '#04121C', muted: '#14496B', accent: '#003C6B', line: 'rgba(4,18,28,.26)' },
  { key: 'mint', name: '薄荷', fam: 'bold', paper: '#7FE3B4', ink: '#04140C', muted: '#0F5340', accent: '#00402C', line: 'rgba(4,20,12,.26)' },
  { key: 'lilac', name: '丁香', fam: 'bold', paper: '#CDB9FF', ink: '#0E0620', muted: '#4A2FA0', accent: '#2A0E7A', line: 'rgba(14,6,32,.26)' },

  // 暗夜
  { key: 'midnight', name: '午夜墨金', fam: 'dark', paper: '#0e0d0c', ink: '#f0e9db', muted: '#9a917f', accent: '#d4a04a', line: 'rgba(240,233,219,.16)' },
  { key: 'ink', name: '墨夜', fam: 'dark', paper: '#12110f', ink: '#f0e9db', muted: '#9a917f', accent: '#d8a24a', line: 'rgba(240,233,219,.16)' },
  { key: 'neon', name: '夜霓青', fam: 'dark', paper: '#101018', ink: '#F2F4FF', muted: '#8B90A8', accent: '#22D3EE', line: 'rgba(242,244,255,.16)' },
  { key: 'magenta', name: '品红夜', fam: 'dark', paper: '#1A0E18', ink: '#FFE9F6', muted: '#A87E97', accent: '#FF2DAF', line: 'rgba(255,233,246,.16)' },
  { key: 'navy', name: '深海军', fam: 'dark', paper: '#0B1220', ink: '#E8EEFF', muted: '#8794AE', accent: '#F5C542', line: 'rgba(232,238,255,.16)' },
];

const out = SRC.map((p) => {
  const accentText = fitText(p.paper, p.accent, p.ink, 4.5);
  const bp = blockPair(p.accent);
  // 次要字也压到达标
  const muted = cr(p.paper, p.muted) >= 4.5 ? p.muted : fitText(p.paper, p.muted, p.ink, 4.5);
  return { ...p, accentText, muted, blockBg: bp.bg, blockInk: bp.fg, dark: p.fam === 'dark' };
});

const fails = [];
for (const p of out) {
  const body = cr(p.paper, p.ink), small = cr(p.paper, p.accentText), blk = cr(p.blockBg, p.blockInk), mu = cr(p.paper, p.muted);
  p._cr = [body, small, blk, mu];
  if (body < 7 || small < 4.5 || blk < 4.5 || mu < 4.5) fails.push(p.key);
}
console.log('key'.padEnd(9) + 'fam'.padEnd(7) + '正文  小字  块  次');
for (const p of out) console.log(p.key.padEnd(9) + p.fam.padEnd(7) + p._cr.map((n) => n.toFixed(2).padStart(5)).join(' '));
console.log('\n不达标: ' + (fails.length ? fails.join(',') : '无') + ' / ' + out.length);

const lines = out.map((p) =>
  `  { key:'${p.key}', name:'${p.name}', fam:'${p.fam}', dark:${p.dark}, paper:'${p.paper}', ink:'${p.ink}', muted:'${p.muted}', ` +
  `accent:'${p.accent}', accentText:'${p.accentText}', blockBg:'${p.blockBg}', blockInk:'${p.blockInk}', line:'${p.line}' },`);
console.log('\n/* ==== 生成结果，粘进数据文件 ==== */');
console.log(lines.join('\n'));
