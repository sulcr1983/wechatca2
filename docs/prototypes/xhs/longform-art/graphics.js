/* 静态 SVG 设计稿图案库（每套模板的图案不同，且参与版式而不只是背景）
 *
 * 设计意图：把 SVG 从「共用背景层」升级为「版式主体」——
 *   几何图形决定文字往哪放、占多大、怎么分栏。
 *   全部静态，导出即 PNG，可发小红书。
 *
 * 每个函数返回一段 <svg>，viewBox 统一 1080×1440，
 * 由调用方决定它是全幅背景、局部插图、还是分隔结构。
 */

const esc = (s) => String(s == null ? '' : s)
  .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');

/* ── 1. 墨晕圆相：同心圆 + 偏移，文字绕圆排 ── */
export function gEnso(p, id) {
  const a = p.accent, s = p.accentSoft;
  return `<svg class="art" viewBox="0 0 1080 1440" aria-hidden="true">
    <defs><radialGradient id="g${id}" cx="50%" cy="50%" r="50%">
      <stop offset="0%" stop-color="${s}" stop-opacity=".20"/>
      <stop offset="100%" stop-color="${s}" stop-opacity="0"/></radialGradient></defs>
    <circle cx="760" cy="420" r="300" fill="url(#g${id})"/>
    <circle cx="760" cy="420" r="232" fill="none" stroke="${a}" stroke-opacity=".42" stroke-width="14"
      stroke-dasharray="1320 90" stroke-linecap="round" transform="rotate(-28 760 420)"/>
    <circle cx="760" cy="420" r="252" fill="none" stroke="${a}" stroke-opacity=".14" stroke-width="1"/>
    <circle cx="760" cy="420" r="188" fill="none" stroke="${a}" stroke-opacity=".10" stroke-width="1"/>
  </svg>`;
}

/* ── 2. 山水层叠：三层波浪 + 远山，文字压在山腰 ── */
export function gMountain(p, id) {
  const a = p.accent, s = p.accentSoft;
  const ridge = (y, o, fill) => `<path d="M-20,${y} Q200,${y-150} 420,${y-40} T800,${y-90} T1100,${y-20} L1100,1460 L-20,1460 Z"
    fill="${fill}" opacity="${o}"/>`;
  return `<svg class="art" viewBox="0 0 1080 1440" aria-hidden="true">
    ${ridge(980, '.10', a)}${ridge(1080, '.13', s)}${ridge(1190, '.16', a)}
    <circle cx="800" cy="250" r="86" fill="${a}" opacity=".22"/>
    <g stroke="${a}" stroke-opacity=".12" fill="none" stroke-width="1">
      ${Array.from({length:7},(_,i)=>`<path d="M0,${1240+i*30} Q540,${1120+i*30} 1080,${1260+i*30}"/>`).join('')}
    </g>
  </svg>`;
}

/* ── 3. 折枝花：程序化枝干 + 花点，做边角构图 ── */
export function gBranch(p, id) {
  const a = p.accent;
  const dots = [[860,180],[900,240],[820,300],[940,330],[860,400],[790,380],[960,220],[750,250]]
    .map(([x,y],i)=>`<circle cx="${x}" cy="${y}" r="${8+(i%3)*4}" fill="${a}" opacity="${.22+(i%4)*.08}"/>`).join('');
  return `<svg class="art" viewBox="0 0 1080 1440" aria-hidden="true">
    <g fill="none" stroke="${a}" stroke-opacity=".28" stroke-linecap="round">
      <path d="M1080,120 Q900,220 860,420 Q830,560 700,700" stroke-width="3"/>
      <path d="M900,220 Q960,240 1000,320" stroke-width="1.6"/>
      <path d="M860,420 Q780,400 740,450" stroke-width="1.6"/>
      <path d="M800,560 Q860,600 900,580" stroke-width="1.4"/>
    </g>
    ${dots}
    <circle cx="120" cy="1280" r="150" fill="none" stroke="${a}" stroke-opacity=".12" stroke-width="1"/>
  </svg>`;
}

/* ── 4. 印章矩阵：九宫格朱印 + 细网格，网格就是版式骨架 ── */
export function gSeals(p, id) {
  const a = p.accent;
  const cells = Array.from({length:9},(_,i)=>{
    const x = 120 + (i%3)*300, y = 300 + Math.floor(i/3)*300;
    return `<rect x="${x}" y="${y}" width="220" height="220" fill="none" stroke="${a}"
      stroke-opacity="${i===4?'.42':'.14'}" stroke-width="${i===4?3:1}"/>
      <circle cx="${x+110}" cy="${y+110}" r="${i===4?54:22}" fill="none" stroke="${a}"
      stroke-opacity="${i===4?'.4':'.12'}" stroke-width="1"/>`;
  }).join('');
  return `<svg class="art" viewBox="0 0 1080 1440" aria-hidden="true">
    ${cells}<path d="M96,270 H984 M96,1240 H984" stroke="${a}" stroke-opacity=".22" stroke-width="2"/>
  </svg>`;
}

/* ── 5. 等高线地形：密集曲线，文字沿曲线走向分区 ── */
export function gContour(p, id) {
  const a = p.accent;
  return `<svg class="art" viewBox="0 0 1080 1440" aria-hidden="true">
    <defs><clipPath id="c${id}"><rect width="1080" height="1440"/></clipPath></defs>
    <g clip-path="url(#c${id})" fill="none" stroke="${a}" stroke-opacity=".20" stroke-width="1.2">
      ${Array.from({length:22},(_,i)=>{
        const y=180+i*54, c=420+Math.sin(i*.6)*260;
        return `<path d="M-40,${y} Q${c},${y-190-i*4} 1120,${y+60}"/>`;
      }).join('')}
    </g>
    <circle cx="200" cy="1120" r="120" fill="none" stroke="${a}" stroke-opacity=".28" stroke-width="1"/>
  </svg>`;
}

/* ── 6. 拱形窗：建筑拱券 + 竖长格，文字在拱内 ── */
export function gArch(p, id) {
  const a = p.accent, s = p.accentSoft;
  return `<svg class="art" viewBox="0 0 1080 1440" aria-hidden="true">
    <path d="M150,1300 V560 A390,390 0 0 1 930,560 V1300 Z"
      fill="${s}" fill-opacity=".10" stroke="${a}" stroke-opacity=".30" stroke-width="2"/>
    <path d="M210,1300 V570 A330,330 0 0 1 870,570 V1300 Z"
      fill="none" stroke="${a}" stroke-opacity=".16" stroke-width="1"/>
    <path d="M540,240 V1300 M150,760 H930" stroke="${a}" stroke-opacity=".12" stroke-width="1"/>
    <circle cx="540" cy="560" r="120" fill="none" stroke="${a}" stroke-opacity=".18" stroke-width="1"/>
    <path d="M60,1300 H1020" stroke="${a}" stroke-opacity=".32" stroke-width="3"/>
  </svg>`;
}

/* ── 7. 星轨：极坐标射线 + 散点，做夜航感 ── */
export function gOrbit(p, id) {
  const a = p.accent, s = p.accentSoft;
  const rays = Array.from({length:28},(_,i)=>{
    const ang = i*Math.PI/14, x=760+Math.cos(ang)*520, y=420+Math.sin(ang)*520;
    return `<line x1="760" y1="420" x2="${x.toFixed(0)}" y2="${y.toFixed(0)}"
      stroke="${a}" stroke-opacity=".10" stroke-width="1"/>`;
  }).join('');
  const stars = [[300,180],[980,560],[420,900],[860,1120],[180,700],[700,260],[620,1200]]
    .map(([x,y],i)=>`<circle cx="${x}" cy="${y}" r="${2+i%3}" fill="${s}" opacity=".55"/>`).join('');
  return `<svg class="art" viewBox="0 0 1080 1440" aria-hidden="true">
    ${rays}
    <circle cx="760" cy="420" r="120" fill="none" stroke="${a}" stroke-opacity=".24" stroke-width="1"/>
    <circle cx="760" cy="420" r="230" fill="none" stroke="${a}" stroke-opacity=".14" stroke-width="1"/>
    <circle cx="760" cy="420" r="340" fill="none" stroke="${a}" stroke-opacity=".09" stroke-width="1"/>
    <circle cx="760" cy="420" r="26" fill="${a}" opacity=".28"/>
    ${stars}
  </svg>`;
}

/* ── 8. 织纹：斜向交叉线 + 菱形，做织物/笺纸质感 ── */
export function gWeave(p, id) {
  const a = p.accent;
  const diag = Array.from({length:26},(_,i)=>{
    const o = -400 + i*70;
    return `<path d="M${o},0 L${o+1440},1440"/><path d="M${o+1440},0 L${o},1440"/>`;
  }).join('');
  return `<svg class="art" viewBox="0 0 1080 1440" aria-hidden="true">
    <defs><clipPath id="w${id}"><rect width="1080" height="1440"/></clipPath></defs>
    <g clip-path="url(#w${id})" fill="none" stroke="${a}" stroke-opacity=".075" stroke-width="1">${diag}</g>
    <rect x="96" y="96" width="888" height="1248" fill="none" stroke="${a}" stroke-opacity=".22" stroke-width="1"/>
    <rect x="120" y="120" width="840" height="1200" fill="none" stroke="${a}" stroke-opacity=".10" stroke-width="1"/>
  </svg>`;
}

/* ── 9. 水波环：同心波纹 + 落点，做「一粒投入水中」 ── */
export function gRipple(p, id) {
  const a = p.accent;
  const rings = Array.from({length:14},(_,i)=>
    `<ellipse cx="540" cy="1080" rx="${90+i*62}" ry="${26+i*17}" fill="none"
      stroke="${a}" stroke-opacity="${(.30-i*.017).toFixed(3)}" stroke-width="${i<3?2:1}"/>`).join('');
  return `<svg class="art" viewBox="0 0 1080 1440" aria-hidden="true">
    ${rings}
    <circle cx="540" cy="1080" r="12" fill="${a}" opacity=".5"/>
    <path d="M540,120 V1000" stroke="${a}" stroke-opacity=".16" stroke-width="1" stroke-dasharray="4 10"/>
  </svg>`;
}

/* ── 10. 几何切割：斜切色块 + 直角网格，做瑞士/包豪斯构成 ── */
export function gCut(p, id) {
  const a = p.accent, s = p.accentSoft;
  return `<svg class="art" viewBox="0 0 1080 1440" aria-hidden="true">
    <path d="M0,0 H1080 V420 L0,760 Z" fill="${a}" fill-opacity=".10"/>
    <path d="M0,900 L1080,560 V1440 H0 Z" fill="${s}" fill-opacity=".10"/>
    <path d="M0,760 L1080,420 M0,900 L1080,560" stroke="${a}" stroke-opacity=".32" stroke-width="2"/>
    <g stroke="${a}" stroke-opacity=".14" stroke-width="1">
      ${Array.from({length:11},(_,i)=>`<path d="M${i*108},0 V1440"/>`).join('')}
    </g>
    <rect x="700" y="980" width="260" height="260" fill="none" stroke="${a}" stroke-opacity=".38" stroke-width="3"/>
    <circle cx="250" cy="300" r="90" fill="none" stroke="${a}" stroke-opacity=".28" stroke-width="2"/>
  </svg>`;
}

export const GRAPHICS = {
  enso: { name:'墨晕圆相', fn:gEnso, layout:'circle' },
  mountain: { name:'山水层叠', fn:gMountain, layout:'band' },
  branch: { name:'折枝花', fn:gBranch, layout:'corner' },
  seals: { name:'印章矩阵', fn:gSeals, layout:'grid' },
  contour: { name:'等高线', fn:gContour, layout:'flow' },
  arch: { name:'拱形窗', fn:gArch, layout:'frame' },
  orbit: { name:'星轨', fn:gOrbit, layout:'radial' },
  weave: { name:'织纹笺', fn:gWeave, layout:'texture' },
  ripple: { name:'水波环', fn:gRipple, layout:'bottom' },
  cut: { name:'几何切割', fn:gCut, layout:'diagonal' },
};
