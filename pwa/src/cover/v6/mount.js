/* 长图文 V6 试验入口 · 挂载模块（2026-11-06）
 *
 * 用户拍板：把原型分页器下沉进产品，但做「可开关的试验入口」，默认关、老路径零改动。
 *
 * 本模块的边界（严格遵守）：
 *   · 只在 #longform-root 内活动，自带 <header> 都不做——产品顶栏三 tab 保持唯一；
 *     所有 CSS 用 #v6-root 作用域前缀，绝不改 :root 或 cover.css 的全局规则。
 *   · V6 开启时 mountLongformPage() 会早退，老 DOM 不注入，所以下面挂的
 *     #cv-* 门禁 id 是文档内唯一的（不重复）。
 *   · 出图走产品 story.js::renderPageDoc（#xhs-cover / 1080×1440 / domToBlob），
 *     ZIP 走产品 nine.js::zipTiles，提示走 cover/ui.js::toast —— 不重写第二套。
 *   · 偏好沿用 supersu.longform.prefs.v1，只**追加** v6Layout/v6Swatch/v6Family 三个字段，
 *     老字段（longTpl/palKey/longPn/longSign/longBg）原样保留，切回老版不丢。
 *   · 开关键 supersu.longform.v6 默认不存在 = false；不写进产品 PREFS 之外的任何键。
 *
 * ⚠️ 文章草稿不持久化（D16）；切换版本时用模块内存 draft 传递，避免用户输入丢失。
 */

import { TEMPLATES as BASE } from './templates.js';
import { THEME_TEMPLATES, THEME_COUNT, THEME_SOURCE_COUNT } from './themes.js';
import { PALETTES } from './art-system.js';
import { buildAutoSet } from './auto.js';
import { auditSet, auditSummary } from './audit.js';
import { renderPageDoc } from '../story.js';
import { zipTiles } from '../../nine.js';
import { toast } from '../ui.js';

const V6_KEY = 'supersu.longform.v6';
const PREFS = 'supersu.longform.prefs.v1';
const ROLE_CN = { cover: '封面', opening: '开篇', dense: '正文', points: '清单', quote: '金句', closing: '结尾' };
const ALL = [...BASE, ...THEME_TEMPLATES];
const BASE_SWATCHES = Object.entries(PALETTES).map(([id, p]) => ({
  id, name: p.name, paper: p.paper, accent: p.accent, ink: p.ink,
}));

let draft = '';                 // 版本切换时保住用户正在编辑的文章（内存，不落盘）
let state = null;               // { root, set, tpl, raw, frames, selectedId, activeFamily, keyword }
let observer = null;
const thumbCache = new Map();
let timer = null, thumbTimer = null;

/* ── 开关 ──────────────────────────────────────────────────────── */
export function isV6Enabled() {
  try { return localStorage.getItem(V6_KEY) === '1'; } catch { return false; }
}
export function setV6Enabled(on) {
  try {
    if (on) localStorage.setItem(V6_KEY, '1');
    else localStorage.removeItem(V6_KEY);
  } catch { /* 隐私模式不阻断 */ }
}
export function getDraft() { return draft; }
export function setDraft(v) { draft = String(v || ''); }

function readPrefs() {
  try { return JSON.parse(localStorage.getItem(PREFS) || '{}') || {}; } catch { return {}; }
}
function saveV6Prefs(patch) {
  try { localStorage.setItem(PREFS, JSON.stringify({ ...readPrefs(), ...patch })); } catch { /* 忽略 */ }
}

/* ── 样式：全部 #v6-root 作用域，不碰产品全局 ─────────────────────
 * ⚠️ 视觉必须与产品一致（2026-11-07 用户反馈「和原来的板块格格不入」）：
 *   原型阶段用了 skill 生成的独立设计系统（学术藏蓝 #1E3A5F + 引文金 #B45309 +
 *   2px 硬直角 + 衬线面板标题），整套搬进产品后与原「朱砂红 + 暖纸 + 圆角」冲突。
 *   现全部改为**指向产品 style.css 的 :root 变量**，不再自建色值：
 *   色板 / 边框 / 阴影 / 圆角都跟随产品，产品改主题时这里自动同步。
 *   变量名保留 --v6-* 只为减少改动面，值一律是产品令牌的别名。
 */
const CSS = `
#v6-root{--v6-paper:var(--bg-canvas);--v6-panel:var(--bg-surface);--v6-surface:var(--bg-raised);
  --v6-raised:var(--bg-raised);
  --v6-ink:var(--text);--v6-soft:var(--text-soft);--v6-muted:var(--text-muted);
  --v6-accent:var(--accent);--v6-accent-soft:var(--accent-soft);--v6-accent-ink:var(--accent-dim);
  --v6-ok:var(--success);--v6-ok-soft:rgba(95,143,115,.10);
  --v6-line:var(--border);--v6-line-strong:var(--border-hi);
  --v6-sh:var(--shadow);--v6-sh-lg:var(--shadow-lg);
  --v6-t:200ms;--v6-ease:cubic-bezier(.2,.8,.2,1);
  --v6-serif:'Noto Serif SC','Songti SC',serif;
  --v6-sans:var(--font);--v6-mono:var(--font-mono);
  height:100%;display:grid;grid-template-columns:328px minmax(0,1fr) 468px;
  background:var(--v6-paper);color:var(--v6-ink);font:14px/1.6 var(--v6-sans);overflow:hidden}
#v6-root *{box-sizing:border-box}
#v6-root :where(a,button,input,textarea,[role=button]):focus-visible{
  outline:2px solid var(--v6-accent);outline-offset:2px}
#v6-root ::-webkit-scrollbar{width:8px;height:8px}
#v6-root ::-webkit-scrollbar-thumb{background:var(--v6-line-strong);border:2px solid transparent;
  background-clip:padding-box;border-radius:8px}
#v6-root .v6-col{min-width:0;display:flex;flex-direction:column;min-height:0;overflow:hidden}
#v6-root .v6-left{background:var(--v6-panel);border-right:1px solid var(--v6-line)}
#v6-root .v6-right{background:var(--v6-panel);border-left:1px solid var(--v6-line)}
#v6-root .v6-head{padding:18px 22px 14px;border-bottom:1px solid var(--v6-line);flex:none}
/* 小标签统一成产品 .cv-sec-title 的观感（无字距、无 mono、无大写）*/
#v6-root .v6-k{font-size:11.5px;font-weight:600;color:var(--v6-soft);letter-spacing:.02em;margin:0 0 6px}
#v6-root .v6-sec{font-size:12px;font-weight:600;color:var(--v6-soft);letter-spacing:.04em;
  margin:0 0 10px;display:flex;align-items:center;gap:10px}
#v6-root .v6-head h2{font:600 15px/1.4 var(--v6-sans);margin:0}
#v6-root .v6-head p{font-size:11.5px;color:var(--v6-muted);margin:5px 0 0}
#v6-root .v6-body{padding:20px 22px 0;overflow:hidden;flex:1;min-height:0;
  display:flex;flex-direction:column}
#v6-root .v6-scroll{flex:1;min-height:0;overflow-y:auto;padding-bottom:14px;scroll-padding-top:8px}
/* 主操作固定在栏底：导出 / ZIP / 返回永远在首屏，不随文章变长被顶出去 */
#v6-root .v6-actions{flex:none;border-top:1px solid var(--v6-line);
  padding:14px 0 16px;background:var(--v6-panel);position:relative;z-index:2}
#v6-root .v6-sec{font:500 10.5px/1 var(--v6-mono);letter-spacing:.20em;color:var(--v6-muted);
  text-transform:uppercase;margin:0 0 12px;display:flex;align-items:center;gap:10px}
#v6-root .v6-sec::after{content:'';flex:1;height:1px;background:var(--v6-line)}
#v6-root .v6-label{display:flex;justify-content:space-between;align-items:baseline;
  font-size:12px;font-weight:600;letter-spacing:.06em;margin:0 0 8px;color:var(--v6-soft)}
#v6-root .v6-label span{font:400 11px var(--v6-mono);color:var(--v6-muted)}
#v6-root textarea{width:100%;height:clamp(150px,22vh,240px);resize:vertical;
  border:1px solid var(--v6-line-strong);
  background:var(--v6-surface);padding:14px;font:13.5px/1.9 var(--v6-sans);color:var(--v6-ink);
  border-radius:var(--radius);outline:none;transition:border-color 140ms var(--v6-ease),box-shadow 140ms var(--v6-ease)}
#v6-root textarea:focus{border-color:var(--v6-line-strong);box-shadow:0 0 0 3px var(--v6-accent-soft)}
#v6-root .v6-syntax{margin:12px 0 0;font-size:11px;color:var(--v6-muted);line-height:1.9}
#v6-root .v6-syntax code{font:10.5px var(--v6-mono);background:var(--bg-hover);
  padding:2px 5px;border:1px solid var(--v6-line);border-radius:var(--radius-sm)}
#v6-root .v6-field{width:100%;border:1px solid var(--v6-line-strong);background:var(--v6-surface);
  padding:10px 12px;font:12.5px var(--v6-sans);color:var(--v6-ink);border-radius:var(--radius);outline:none;min-height:40px}
#v6-root .v6-field:focus{border-color:var(--v6-line-strong);box-shadow:0 0 0 3px var(--v6-accent-soft)}
#v6-root .v6-btns{display:flex;gap:8px;flex-wrap:wrap;margin:16px 0 24px}
#v6-root button{font:12.5px var(--v6-sans);border:1px solid var(--v6-line-strong);
  background:var(--v6-surface);color:var(--v6-soft);min-height:36px;padding:8px 14px;
  cursor:pointer;border-radius:var(--radius);letter-spacing:.03em;
  transition:background 140ms var(--v6-ease),border-color 140ms var(--v6-ease),
    color 140ms var(--v6-ease),box-shadow 140ms var(--v6-ease)}
#v6-root button:hover{border-color:var(--v6-accent);color:var(--v6-accent-ink);background:var(--v6-accent-soft)}
#v6-root button:active{box-shadow:var(--shadow-sm)}
#v6-root button.primary{background:var(--v6-accent);color:#FFF;border-color:var(--v6-accent);font-weight:600}
#v6-root button.primary:hover{background:var(--v6-accent-ink);border-color:var(--v6-accent-ink);color:#FFF}
#v6-root button:disabled{opacity:.42;cursor:not-allowed}
#v6-root button:disabled:hover{background:var(--v6-surface);border-color:var(--v6-line-strong);color:var(--v6-soft)}
#v6-root .v6-rule{height:1px;background:var(--v6-line);margin:24px 0}
#v6-root .v6-check{padding:12px 16px;background:var(--v6-accent-soft);border-left:3px solid var(--v6-accent);
  font-size:12px;line-height:1.75;min-height:44px;color:var(--v6-soft);border-radius:0 var(--radius) var(--radius) 0}
#v6-root .v6-check.ok{background:var(--v6-ok-soft);border-left-color:var(--v6-ok);color:var(--v6-soft)}
#v6-root .v6-stats{display:grid;grid-template-columns:1fr 1fr;gap:8px;margin:16px 0}
#v6-root .v6-stats div{background:var(--v6-raised);border:1px solid var(--v6-line);padding:12px 16px;border-radius:var(--radius)}
#v6-root .v6-stats b{display:block;font:600 22px/1.2 var(--v6-sans);font-variant-numeric:tabular-nums}
#v6-root .v6-stats span{font:10px/1 var(--v6-mono);color:var(--v6-muted);letter-spacing:.14em}
#v6-root .v6-actions .v6-btns{margin:0 0 10px}
#v6-root .v6-actions button.primary{flex:1 1 100%}
#v6-root .v6-back{margin-top:0;width:100%;border-style:dashed}

/* 中栏：看样台 */
#v6-root .v6-stage{flex-direction:column}
#v6-root .v6-stage-head{padding:16px 24px 13px;border-bottom:1px solid var(--v6-line);flex:none;
  display:flex;align-items:baseline;gap:12px;flex-wrap:wrap}
#v6-root .v6-stage-head h2{font:600 15px/1.4 var(--v6-sans);margin:0}
#v6-root .v6-stage-head .v6-meta{font:11.5px var(--v6-mono);color:var(--v6-muted)}
#v6-root .v6-stage-head .v6-meta b{color:var(--v6-soft);font-weight:600}
#v6-root .v6-deck{flex:1;min-height:0;overflow:auto;padding:26px 28px 20px;
  display:flex;flex-wrap:wrap;gap:22px 20px;
  /* ⚠️ 必须用 safe center：内容超出容器高时，普通 center 会把顶部顶出可视区
     且**无法滚动到**（实测封面页顶部被裁）。safe 在溢出时回落为 start。 */
  align-content:safe center;justify-content:center;
  background:var(--v6-paper)}
/* 两列铺排 + 末行居中：3 页时第 3 页居中，不再「靠左、右边空一大块」；
   4/6 页仍是整齐的 2×2 / 2×3。max-width 防止超宽屏把页拉得过大。 */
#v6-root .v6-pg{flex:0 0 calc(50% - 10px);max-width:430px;min-width:0}
#v6-root .v6-frame{width:100%;aspect-ratio:3/4;overflow:hidden;position:relative;background:var(--v6-surface);
  border:1px solid var(--v6-line);box-shadow:var(--v6-sh-lg);cursor:zoom-in;
  transition:box-shadow var(--v6-t) var(--v6-ease)}
#v6-root .v6-frame:hover{box-shadow:var(--shadow-xl)}
#v6-root .v6-frame iframe{position:absolute;top:0;left:0;width:1080px;height:1440px;border:0;
  transform-origin:top left;pointer-events:none}
#v6-root .v6-pl{font:11px var(--v6-mono);color:var(--v6-muted);padding-top:12px;
  display:flex;justify-content:space-between;gap:8px;border-top:1px solid var(--v6-line);margin-top:12px}
#v6-root .v6-pl i{font-style:normal;font:600 12px var(--v6-sans);color:var(--v6-ink)}
#v6-root .v6-pl a{color:var(--v6-accent-ink);cursor:pointer;text-decoration:none;min-height:24px;
  display:inline-flex;align-items:center;border-bottom:1px solid transparent}
#v6-root .v6-pl a:hover{border-bottom-color:var(--v6-accent)}
#v6-root .v6-empty{margin:auto;text-align:center;color:var(--v6-muted);font:14px var(--v6-sans)}
#v6-root .v6-empty-grid{padding:36px 18px;text-align:center;color:var(--v6-muted);
  font:13px/1.9 var(--v6-sans);border:1px dashed var(--v6-line-strong);border-radius:var(--radius-lg);
  background:var(--v6-raised)}

/* 右栏：格局卡 */
#v6-root .v6-right .v6-head{padding:13px 18px 10px}
#v6-root .v6-right .v6-head p{margin:5px 0 0;font-size:11.5px;line-height:1.45}
#v6-root .v6-search{padding:10px 18px 9px;border-bottom:1px solid var(--v6-line);flex:none;background:var(--v6-raised)}
#v6-root .v6-search-field{position:relative;display:flex;align-items:center}
#v6-root .v6-search-field svg{position:absolute;left:11px;width:15px;height:15px;stroke:var(--v6-muted);pointer-events:none}
#v6-root .v6-search input{width:100%;border:1px solid var(--v6-line-strong);background:var(--v6-surface);
  padding:10px 12px 10px 36px;font:12.5px var(--v6-sans);border-radius:var(--radius);outline:none;min-height:40px}
#v6-root .v6-search input:focus{border-color:var(--v6-line-strong);box-shadow:0 0 0 3px var(--v6-accent-soft)}
#v6-root .v6-fams{display:flex;gap:5px;flex-wrap:wrap;margin-top:7px;max-height:46px;overflow-y:auto}
#v6-root .v6-fam{border:1px solid var(--v6-line);background:transparent;color:var(--v6-muted);
  padding:3px 9px;font-size:10px;border-radius:12px;cursor:pointer;white-space:nowrap;min-height:22px}
#v6-root .v6-fam[aria-pressed="true"]{background:var(--v6-accent);color:#FFF;border-color:var(--v6-accent)}
#v6-root .v6-grid-scroll{flex:1;min-height:0;overflow-y:auto;padding:12px 18px;scroll-padding-top:12px}
#v6-root .v6-fam-title{font-size:11.5px;font-weight:600;color:var(--v6-soft);letter-spacing:.02em;
  margin:11px 0 7px;padding-bottom:5px;border-bottom:1px solid var(--v6-line);
  display:flex;justify-content:space-between}
#v6-root .v6-fam-title:first-child{margin-top:0}
#v6-root .v6-fam-title span{color:var(--v6-muted);font-size:10px;letter-spacing:.04em}
#v6-root .v6-tgrid{display:grid;grid-template-columns:repeat(3,minmax(0,1fr));gap:10px;margin-bottom:8px}
#v6-root .v6-tcard{cursor:pointer;border:0;padding:0;background:transparent;border-radius:var(--radius)}
#v6-root .v6-tcard .tf{width:100%;aspect-ratio:3/4;overflow:hidden;position:relative;background:var(--v6-surface);
  border:1px solid var(--v6-line);box-shadow:var(--shadow-sm);
  transition:box-shadow var(--v6-t) var(--v6-ease),border-color var(--v6-t) var(--v6-ease)}
#v6-root .v6-tcard:hover .tf{box-shadow:var(--v6-sh);border-color:var(--v6-line-strong)}
#v6-root .v6-tcard[aria-pressed="true"] .tf{outline:2px solid var(--v6-accent);outline-offset:2px;
  border-color:var(--v6-accent);box-shadow:var(--v6-sh)}
#v6-root .v6-tcard[aria-pressed="true"] .tf::after{content:'✓';position:absolute;top:6px;right:6px;
  width:20px;height:20px;display:grid;place-items:center;background:var(--v6-accent);color:#FFF;
  font:700 12px/1 var(--v6-sans);border-radius:50%;z-index:2}
#v6-root .v6-tcard .tf iframe{position:absolute;top:0;left:0;width:1080px;height:1440px;border:0;
  transform-origin:top left;pointer-events:none}
#v6-root .v6-tcard .ph{position:absolute;inset:0;display:flex;align-items:center;justify-content:center;
  font:10.5px var(--v6-mono);color:var(--v6-muted);background:repeating-linear-gradient(45deg,
  var(--v6-raised),var(--v6-raised) 8px,var(--bg-hover) 8px,var(--bg-hover) 16px)}
#v6-root .v6-tcard .cap{padding:5px 2px 0;font-size:10.5px;line-height:1.35}
#v6-root .v6-tcard .cap b{font-weight:600;display:block;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}
#v6-root .v6-tcard .cap span{color:var(--v6-muted);font:10px var(--v6-mono)}
#v6-root .v6-tcard .cap .vb{color:var(--v6-accent-ink)}
#v6-root .v6-tcount{font:10px var(--v6-mono);color:var(--v6-muted);padding:7px 18px;
  border-top:1px solid var(--v6-line);flex:none;background:var(--v6-raised)}
#v6-root .v6-swatches{border-top:1px solid var(--v6-line);padding:8px 18px 10px;flex:none;
  background:var(--v6-raised)}
#v6-root .v6-sw-head{display:flex;justify-content:space-between;align-items:baseline;gap:8px;margin-bottom:7px}
#v6-root .v6-sw-head b{font:600 13px var(--v6-sans);letter-spacing:0}
#v6-root .v6-sw-head span{font:10px var(--v6-mono);color:var(--v6-muted);white-space:nowrap}
#v6-root .v6-sw-list{display:flex;gap:7px;flex-wrap:wrap;max-height:58px;overflow-y:auto;padding:1px}
#v6-root .v6-sw{width:26px;height:26px;border-radius:50%;border:1px solid rgba(0,0,0,.16);
  cursor:pointer;padding:0;position:relative;flex:none;transition:box-shadow 140ms var(--v6-ease)}
#v6-root .v6-sw::before{content:'';position:absolute;inset:-8px;border-radius:50%}
#v6-root .v6-sw[aria-pressed="true"]{box-shadow:0 0 0 2px var(--v6-raised),0 0 0 4px var(--v6-accent)}
#v6-root .v6-viewer{position:fixed;inset:0;z-index:60;background:rgba(20,17,14,.88);
  display:none;align-items:center;justify-content:center;padding:24px}
#v6-root .v6-viewer.on{display:flex}
#v6-root .v6-viewer iframe{width:min(84vh*.75,92vw);height:min(84vh,92vw*4/3);border:0;
  background:var(--v6-surface);box-shadow:var(--shadow-xl)}
#v6-root .v6-viewer button{position:absolute;top:20px;right:24px;width:44px;height:44px;
  border-radius:50%;border:1px solid rgba(244,239,230,.65);background:none;color:var(--v6-paper);font-size:20px}
#v6-root .v6-busy{position:fixed;right:20px;bottom:20px;background:var(--v6-ink);color:var(--v6-paper);
  padding:12px 16px;font:12px var(--v6-mono);border-radius:var(--radius);display:none;z-index:70;
  box-shadow:var(--v6-sh-lg);border-left:3px solid var(--v6-accent)}

@media(max-width:1280px){#v6-root{grid-template-columns:280px minmax(0,1fr) 360px}}
@media(max-width:980px){#v6-root{grid-template-columns:1fr;height:auto;overflow:visible}
  #v6-root .v6-col{min-height:auto}#v6-root .v6-grid-scroll{max-height:60vh}
  #v6-root .v6-left,#v6-root .v6-right{border:0;border-top:1px solid var(--v6-line)}
  #v6-root .v6-deck{overflow-x:auto;overflow-y:hidden}}
@media(prefers-reduced-motion:reduce){#v6-root *,#v6-root *::before,#v6-root *::after{
  animation-duration:.01ms!important;transition-duration:.01ms!important}}
`;

/* ── DOM：带门禁 id 别名（V6 开启时老 DOM 未注入，id 唯一）────────── */
const DEMO = `周末去海边，我把手机调成了飞行模式

两天的沉默之后，我重新听见了海浪。浪的声音比任何白噪音都好用，时间忽然变多了，早上不用刷消息，晚上不用回群里的表情包，一天像被拉长了三分之一。原来所谓休息，不是换个地方刷手机，而是允许自己消失一阵子，把注意力还给真实的生活。

把手机收起来之后，我重新读完了搁置半年的那本书。晚饭后的散步也不再看屏幕，路口的风、店门口的猫、修车铺的收音机，全都清楚了起来。原来不是生活没有细节，是我以前走得太快，细节全被丢在了路上。

- 出发前把手机调成飞行模式，塞进背包最底下
- 到了先别拍照，坐十分钟再说
- 回程的路上写几句话，不给点赞留位置
- 早点睡觉，别熬到两点

> 浪的声音，比任何白噪音都好用，它把「效率」两个字从耳朵里拿走了。

如果你也想试试，就从下一个周末开始。把手机调成飞行模式，找一片听得见风的地方，坐十分钟，什么也不做。`;

function html() {
  return `<div id="v6-root" class="v6-root">
  <section class="v6-col v6-left">
    <div class="v6-head"><p class="v6-k">① 整篇文章</p><h2>正文</h2>
      <p>首行作封面标题；粘贴后自动分页</p></div>
    <div class="v6-body">
      <div class="v6-scroll">
        <label class="v6-label" for="cv-long-text">正文 <span id="cv-long-count">0 字</span></label>
        <textarea id="cv-long-text" spellcheck="false"
          placeholder="把一整篇文章粘到这里，右侧会自动分页成一套图文。"></textarea>
        <p class="v6-syntax"><code>## 小标题</code> · <code>- 清单</code> · <code>&gt; 金句</code> ·
          <code>---</code> 强制分页 · 空行分段</p>
        <div class="v6-btns"><button id="v6-demo">载入示例</button><button id="v6-clear">清空</button></div>

        <div class="v6-rule"></div><p class="v6-sec">产物自检 / QA</p>
        <div class="v6-check" id="cv-selfcheck" role="status" aria-live="polite">等待输入…</div>
        <div class="v6-stats">
          <div><b id="v6-pages">—</b><span>页数 PAGES</span></div>
          <div><b id="v6-chars">—</b><span>落版字数 CHARS</span></div>
        </div>

        <div class="v6-rule"></div><p class="v6-sec">版式选项 / OPTIONS</p>
        <label class="v6-label" for="cv-long-sign">签名 <span>页脚 · 开篇 · 结尾</span></label>
        <input class="v6-field" id="cv-long-sign" maxlength="16" placeholder="不填则不显示">
        <div class="v6-btns" style="margin:12px 0 0">
          <label style="font-size:12px;display:flex;align-items:center;gap:8px;cursor:pointer">
            <input type="checkbox" id="cv-long-pn" checked>显示页码</label>
        </div>
      </div>

      <!-- 主操作固定在栏底：文章再长也不会把导出顶出首屏 -->
      <div class="v6-actions">
        <div class="v6-btns" style="margin:0 0 10px">
          <button class="primary" id="cv-gen-story">导出一整套 <small>0 张 PNG</small></button>
          <button id="cv-zip-story">打包 ZIP</button>
          <button id="v6-md">Markdown</button>
        </div>
        <div class="v6-syntax" id="cv-status-long" style="margin:0 0 10px">
          文字全程不上传。也可点每页下方「下载这一张」。</div>
        <button class="v6-back" id="v6-back">← 返回经典版长图文</button>
      </div>
    </div>
  </section>

  <section class="v6-col v6-stage">
    <div class="v6-stage-head"><h2 id="v6-set-name">—</h2><span class="v6-meta" id="v6-set-meta"></span></div>
    <div class="v6-deck" id="cv-deck"></div>
    <div id="v6-gallery" hidden></div>
  </section>

  <aside class="v6-col v6-right">
    <div class="v6-head"><p class="v6-k">② 版式格局</p><h2>选一套版式</h2>
      <p>${THEME_SOURCE_COUNT} 套主题去重为 ${THEME_COUNT} 种格局，配色不占卡位</p></div>
    <div class="v6-search">
      <div class="v6-search-field">
        <svg viewBox="0 0 24 24" fill="none" stroke-width="1.6" aria-hidden="true">
          <circle cx="11" cy="11" r="7"/><path d="M16.5 16.5 21 21"/></svg>
        <input type="search" id="v6-search" aria-label="搜索格局、族或描述"
               placeholder="搜格局 / 族，例如：双线、暗底、衬线">
      </div>
      <div class="v6-fams" id="cv-ltpls" role="group" aria-label="按族筛选"></div>
    </div>
    <div class="v6-grid-scroll" id="v6-grid-scroll"><div id="v6-tgrid"></div></div>
    <div class="v6-tcount" id="v6-tcount"></div>
    <div class="v6-swatches">
      <div class="v6-sw-head"><b id="v6-sw-name">配色</b><span id="v6-sw-info">—</span></div>
      <div class="v6-sw-list" id="cv-lpals"></div>
    </div>
  </aside>

  <div class="v6-viewer" id="v6-viewer"><button id="v6-viewer-close" aria-label="关闭">×</button>
    <iframe id="v6-viewer-frame"></iframe></div>
  <div class="v6-busy" id="v6-busy">正在出图…</div>
</div>`;
}

/* ── 挂载 ──────────────────────────────────────────────────────── */
export function disposeV6() {
  if (observer) { observer.disconnect(); observer = null; }
  clearTimeout(timer); clearTimeout(thumbTimer);
  thumbCache.clear();
  /* ⚠️ 必须移除 document 级 keydown，否则切回老版后每次 Esc 仍在操作已销毁的 V6 节点 */
  if (state && state.esc) document.removeEventListener('keydown', state.esc);
  const host = document.getElementById('auto-measure-host');
  if (host) host.remove();
  const st = document.getElementById('v6-style');
  if (st) st.remove();
  state = null;
}

/* ── 主文档 V6 字体别名（度量宿主与 srcdoc 字形一致）──────────────
 * 产品 cover-fonts.css 声明的是 'Noto Serif SC' / 'Noto Sans SC'；
 * v6/auto.js::measureBlock 与 story-system.js 用 'NotoSerifSC' 等短名。
 * 主文档若不注入短名别名，装箱按回退字体量高度、srcdoc 用真字体渲染，
 * 行数会不一致（原型实测过 4% 余量都兜不住）。这里把别名指向 dist 同一批 woff2。 */
const ASSET = new URL('../../../', import.meta.url).href;
function ensureV6Fonts() {
  if (!document.getElementById('v6-font-alias')) {
    const st = document.createElement('style');
    st.id = 'v6-font-alias';
    const F = `${ASSET}fonts/cover/`;
    st.textContent = [
      ['NotoSerifSC','noto-serif-sc-400.woff2',400],
      ['NotoSerifSC','noto-serif-sc-700.woff2',700],
      ['NotoSansSC','noto-sans-sc-400.woff2',400],
      ['NotoSansSC','noto-sans-sc-700.woff2',700],
      ['WenKai','wenkai.woff2',400],
      ['ZcoolXiaowei','zcool-xiaowei.woff2',400],
      ['LongCang','longcang.woff2',400],
    ].map(([fam, file, w]) => `@font-face{font-family:'${fam}';src:url('${F}${file}') format('woff2');font-weight:${w};font-display:block}`).join('\n');
    document.head.appendChild(st);
  }
  const loads = ['400 32px "NotoSerifSC"', '400 32px "NotoSansSC"']
    .map((f) => (document.fonts ? document.fonts.load(f).catch(() => {}) : Promise.resolve()));
  return Promise.race([Promise.all(loads), new Promise((r) => setTimeout(r, 3000))]);
}

export function mountV6(rootEl, { onBack } = {}) {
  if (!rootEl) return;
  disposeV6();
  if (!document.getElementById('v6-style')) {
    const st = document.createElement('style');
    st.id = 'v6-style';
    st.textContent = CSS;
    document.head.appendChild(st);
  }
  rootEl.innerHTML = html();
  const $ = (id) => document.getElementById(id);
  const prefs = readPrefs();
  state = {
    root: $('v6-root'), set: null, tpl: null, raw: '', frames: [],
    selectedId: (prefs.v6Layout && ALL.some((t) => t.id === prefs.v6Layout))
      ? prefs.v6Layout : ALL[0].id,
    activeFamily: prefs.v6Family || '全部', keyword: '', onBack,
    recent: Array.isArray(prefs.v6Recent) ? prefs.v6Recent : [],
  };
  if (prefs.v6Swatch) {
    const t = ALL.find((x) => x.id === state.selectedId);
    if (t && t.setSwatch) t.setSwatch(prefs.v6Swatch);
    else if (t && !t.setSwatch) t.pal = prefs.v6Swatch;
  }
  /* 文章草稿：优先产品排版页正文（与老版 onShow 同口径），其次内存 draft */
  const mainInput = $('input');
  $('cv-long-text').value = draft || (mainInput ? mainInput.value.trim() : '') || DEMO;
  $('cv-long-sign').value = prefs.longSign || '';
  $('cv-long-pn').checked = prefs.longPn !== false;

  /* 接线 */
  $('cv-long-text').addEventListener('input', schedule);
  $('v6-search').addEventListener('input', (e) => { state.keyword = e.target.value; renderGrid(); });
  $('v6-demo').onclick = () => { $('cv-long-text').value = DEMO; schedule(); rebuild(); };
  $('v6-clear').onclick = () => { $('cv-long-text').value = ''; rebuild(); };
  $('cv-gen-story').onclick = exportOneSet;
  $('cv-zip-story').onclick = exportZip;
  $('v6-md').onclick = exportMarkdown;
  $('v6-back').onclick = () => {
    draft = $('cv-long-text').value;
    saveV6Prefs({ longSign: $('cv-long-sign').value, longPn: $('cv-long-pn').checked });
    setV6Enabled(false);
    disposeV6();
    if (typeof onBack === 'function') onBack();
  };
  $('v6-viewer-close').onclick = closeViewer;
  $('v6-viewer').onclick = (e) => { if (e.target.id === 'v6-viewer') closeViewer(); };
  const esc = (e) => { if (e.key === 'Escape' && $('v6-viewer').classList.contains('on')) closeViewer(); };
  document.addEventListener('keydown', esc);
  state.esc = esc;
  $('cv-long-sign').addEventListener('input', () => {
    saveV6Prefs({ longSign: $('cv-long-sign').value });
    schedule();
  });
  $('cv-long-pn').addEventListener('change', () => {
    saveV6Prefs({ longPn: $('cv-long-pn').checked });
    schedule();
  });

  renderFamilies();
  renderGrid();
  renderSwatches();
  /* 先等主文档字体别名就绪，再按真字体装箱 */
  ensureV6Fonts().finally(() => rebuild());
}

/** 页面重新可见时（index.js showPage）刷新预览。 */
export function onShowV6() {
  if (!state || !state.root) return;
  if (!$('cv-long-text').value.trim()) {
    const main = $('input');
    if (main && main.value.trim()) $('cv-long-text').value = main.value.trim();
  }
  rebuild();
}

/* ── 模板与色板 ────────────────────────────────────────────────── */
const $ = (id) => document.getElementById(id);
function swatchesOf(t) { return (t.swatches && t.swatches.length) ? t.swatches : BASE_SWATCHES; }
function activeSwatchId(t) { return t.palette ? t.palette.id : t.pal; }
function applySwatch(t, id) { if (t.setSwatch) t.setSwatch(id); else t.pal = id; }

function buildSet(raw, t) {
  return (typeof t.buildSet === 'function') ? t.buildSet(raw, document)
    : buildAutoSet(raw, t, document);
}
function thumbText() { return ($('cv-long-text').value.trim() || DEMO).slice(0, 240); }
function thumbKey(t) { return `${t.id}|${activeSwatchId(t)}|${thumbText().slice(0, 120)}`; }
function thumbHtml(t) {
  const k = thumbKey(t);
  if (thumbCache.has(k)) return thumbCache.get(k);
  const h = buildSet(thumbText(), t).htmls[0];
  thumbCache.set(k, h);
  return h;
}

function renderDeck(set, t) {
  const deck = $('cv-deck');
  deck.textContent = '';
  state.frames = [];
  $('v6-set-name').textContent = t.name;
  const bs = t.style.bodySize || 32, lh = t.style.lineHeight || 1.92;
  $('v6-set-meta').innerHTML = `<b>${t.family}</b> · ${set.pages.length} 页 · `
    + `${set.report.renderedChars} 字 · ${bs}px/${lh}`;
  const gen = $('cv-gen-story');
  if (gen) gen.innerHTML = `导出一整套 <small>${set.pages.length} 张 PNG</small>`;
  set.htmls.forEach((doc, i) => {
    const pg = document.createElement('div'); pg.className = 'v6-pg';
    const role = set.pages[i].roleCn || ROLE_CN[set.pages[i].role] || set.pages[i].role;
    pg.innerHTML = `<div class="v6-frame"><iframe scrolling="no"></iframe></div>
      <div class="v6-pl"><span><i>${String(i + 1).padStart(2, '0')}</i> / ${set.pages.length} · ${role}</span>
        <span><a data-i="${i}">放大</a> · <a data-dl="${i}">下载这一张</a></span></div>`;
    const ifr = pg.querySelector('iframe');
    deck.appendChild(pg);                    // 先入 DOM，再量宽度（避免 scale(0)）
    ifr.style.transform = `scale(${pg.querySelector('.v6-frame').clientWidth / 1080})`;
    ifr.srcdoc = doc;
    state.frames.push(ifr);
    pg.querySelector('[data-i]').onclick = () => openViewer(ifr.srcdoc);
    pg.querySelector('[data-dl]').onclick = () => saveOne(i);
  });
  requestAnimationFrame(() => deck.querySelectorAll('.v6-pg').forEach((pg) => {
    const f = pg.querySelector('.v6-frame');
    if (f && f.clientWidth > 0)
      f.querySelector('iframe').style.transform = `scale(${f.clientWidth / 1080})`;
  }));
}

function openViewer(srcdoc) {
  $('v6-viewer-frame').srcdoc = srcdoc;
  $('v6-viewer').classList.add('on');
}
function closeViewer() {
  $('v6-viewer').classList.remove('on');
  $('v6-viewer-frame').srcdoc = '';
}

function renderGrid() {
  if (!state) return;
  const kw = state.keyword.trim().toLowerCase();
  /* 「最近使用」是一个筛选视角而不是再渲染一遍：否则同一套模板会出现两次，
     且 E2E 的「61 张卡」断言会失真。 */
  const base = state.activeFamily === '最近'
    ? state.recent.map((id) => ALL.find((t) => t.id === id)).filter(Boolean)
    : ALL.filter((t) => state.activeFamily === '全部' || t.family === state.activeFamily);
  const list = base.filter((t) => !kw
    || `${t.id} ${t.name} ${t.family} ${t.layoutName || ''} ${t.desc || ''} ${t.sourceName || ''}`
      .toLowerCase().includes(kw));
  const box = $('v6-tgrid');
  box.textContent = '';
  if (observer) observer.disconnect();
  /* 空搜索结果必须有说明：实测搜索无命中时 cards=0 且文案为空，
     用户会以为界面坏了（PM 走查发现）。 */
  if (!list.length) {
    const emp = document.createElement('div');
    emp.className = 'v6-empty-grid';
    emp.textContent = `没有匹配「${state.keyword.trim()}」的格局，换个词或点「全部」`;
    box.appendChild(emp);
    $('v6-tcount').textContent = `显示 0 / ${ALL.length} 种格局`;
    return;
  }
  const groups = new Map();
  for (const t of list) {
    if (!groups.has(t.family)) groups.set(t.family, []);
    groups.get(t.family).push(t);
  }
  for (const [fam, items] of groups) {
    const h = document.createElement('div');
    h.className = 'v6-fam-title';
    h.innerHTML = `${fam}<span>${items.length} 种格局</span>`;
    box.appendChild(h);
    const grid = document.createElement('div'); grid.className = 'v6-tgrid';
    for (const t of items) {
      const card = document.createElement('div');
      card.className = 'v6-tcard'; card.dataset.id = t.id;
      card.setAttribute('role', 'button'); card.tabIndex = 0;
      card.setAttribute('aria-pressed', String(t.id === state.selectedId));
      const bs = t.style.bodySize || 32, lh = t.style.lineHeight || 1.92;
      const vb = (t.swatches && t.swatches.length > 1)
        ? `<span class="vb">· ${t.swatches.length} 配色</span>` : '';
      card.innerHTML = `<div class="tf"><div class="ph">加载中</div><iframe scrolling="no"></iframe></div>
        <div class="cap"><b>${t.name}</b><span>${bs}px / ${lh} ${vb}</span></div>`;
      card.onclick = () => selectTemplate(t.id);
      card.onkeydown = (e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); selectTemplate(t.id); } };
      grid.appendChild(card);
    }
    box.appendChild(grid);
  }
  $('v6-tcount').textContent = `显示 ${list.length} / ${ALL.length} 种格局 · `
    + `${THEME_SOURCE_COUNT} 套主题折叠为 ${THEME_COUNT} + ${BASE.length} 套手写`;
  observer = new IntersectionObserver((entries) => {
    for (const e of entries) if (e.isIntersecting) {
      const card = e.target, t = ALL.find((x) => x.id === card.dataset.id);
      const frame = card.querySelector('.tf'), ifr = frame.querySelector('iframe');
      if (t && ifr && frame.clientWidth > 0) {
        ifr.style.transform = `scale(${frame.clientWidth / 1080})`;
        const ph = frame.querySelector('.ph'); if (ph) ph.remove();
        ifr.srcdoc = thumbHtml(t);
      }
      observer.unobserve(card);
    }
  }, { root: $('v6-grid-scroll'), rootMargin: '160px' });
  box.querySelectorAll('.v6-tcard').forEach((c) => observer.observe(c));
}

function renderFamilies() {
  /* 「最近」排在最前：61 套格局下，找回上次用过的那套是最常见的动作。 */
  const fams = ['全部'];
  if (state.recent.length) fams.push('最近');
  fams.push(...new Set(ALL.map((t) => t.family)));
  const box = $('cv-ltpls'); box.textContent = '';
  for (const f of fams) {
    const b = document.createElement('button');
    b.className = 'v6-fam'; b.textContent = f;
    b.setAttribute('aria-pressed', String(f === state.activeFamily));
    b.onclick = () => {
      state.activeFamily = f;
      saveV6Prefs({ v6Family: f });
      renderFamilies(); renderGrid();
    };
    box.appendChild(b);
  }
}

function renderSwatches() {
  const t = ALL.find((x) => x.id === state.selectedId) || ALL[0];
  const sw = swatchesOf(t);
  $('v6-sw-name').textContent = t.name;
  $('v6-sw-info').textContent = `${sw.length} 套配色 · 切换不改格局`;
  const list = $('cv-lpals'); list.textContent = '';
  const activeId = activeSwatchId(t);
  for (const s of sw) {
    const b = document.createElement('button');
    b.className = 'v6-sw'; b.title = s.name;
    b.setAttribute('aria-pressed', String(s.id === activeId));
    b.style.background = `linear-gradient(135deg, ${s.paper} 0 52%, ${s.accent} 52% 100%)`;
    b.onclick = () => {
      applySwatch(t, s.id);
      saveV6Prefs({ v6Swatch: s.id });
      /* 只失效**当前模板**的缩略图缓存：其余 60 张的配色没变，缓存键不变、直接复用。
         原实现 thumbCache.clear() 全量清空 → 61 张全部重建，实测切换一次卡 1.22s（PM 走查）。 */
      for (const k of [...thumbCache.keys()]) {
        if (k.startsWith(`${t.id}|`)) thumbCache.delete(k);
      }
      renderSwatches(); renderGrid(); rebuild();
    };
    list.appendChild(b);
  }
}

function selectTemplate(id) {
  state.selectedId = id;
  /* 记录最近使用（最多 6 个）：模板 61 套时，「上次那套」靠回忆翻找成本太高。
     复用同一 prefs 键，不新增存储。 */
  state.recent = [id, ...state.recent.filter((x) => x !== id)].slice(0, 6);
  saveV6Prefs({ v6Layout: id, v6Recent: state.recent });
  renderFamilies();
  $('v6-tgrid').querySelectorAll('.v6-tcard').forEach((c) =>
    c.setAttribute('aria-pressed', String(c.dataset.id === id)));
  renderSwatches();
  rebuild();
}

/* ── 主流程 ────────────────────────────────────────────────────── */
function schedule() {
  clearTimeout(timer); clearTimeout(thumbTimer);
  timer = setTimeout(rebuild, 300);
  thumbTimer = setTimeout(() => { thumbCache.clear(); renderGrid(); }, 650);
}

function applyOptions(set) {
  /* 版式选项落到渲染 CSS：页码（隐藏页脚编号）/ 签名。
     不改分页数据，只在 srcdoc 文本层做最小替换，保证零丢字。 */
  const pn = $('cv-long-pn').checked;
  const sign = $('cv-long-sign').value.trim();
  if (pn && !sign) return set.htmls;
  return set.htmls.map((doc) => {
    let h = doc;
    if (!pn) h = h.replace(/SUPERSU · \d+ \/ \d+/g, 'SUPERSU');
    /* 页脚实际是 <span class="caption">SUPERSU · NN / NN</span>；
       旧正则要求恰好等于 SUPERSU，永远匹配不上（实测）。改替换前缀。 */
    if (sign) h = h.replace(/SUPERSU ·/g, `@${sign.replace(/[<>&"]/g, '')} ·`);
    return h;
  });
}

async function rebuild() {
  if (!state || !state.root) return;
  const raw = $('cv-long-text').value;
  draft = raw;
  $('cv-long-count').textContent = `${raw.replace(/\s+/g, '').length} 字`;
  if (!raw.trim()) {
    state.set = null;
    $('cv-deck').innerHTML = '<div class="v6-empty">贴上文章，这里立刻出现整套图文</div>';
    const chk = $('cv-selfcheck');
    chk.className = 'v6-check'; chk.textContent = '等待输入…';
    $('v6-pages').textContent = '—'; $('v6-chars').textContent = '—';
    $('v6-set-name').textContent = '—'; $('v6-set-meta').textContent = '';
    const zip = $('cv-zip-story'); if (zip) zip.hidden = true;
    return;
  }
  const t = ALL.find((x) => x.id === state.selectedId) || ALL[0];
  await document.fonts.ready;
  const set = buildSet(raw, t);
  const a = auditSet(set, raw);
  const chk = $('cv-selfcheck');
  chk.className = 'v6-check' + (a.ok ? ' ok' : '');
  chk.textContent = auditSummary(a);
  $('v6-pages').textContent = a.stats.totalPages;
  $('v6-chars').textContent = a.stats.renderedChars;
  const out = { ...set, htmls: applyOptions(set) };
  state.set = out; state.tpl = t; state.raw = raw;
  renderDeck(out, t);
}

/* ── 导出：复用产品管线 ────────────────────────────────────────── */
function busy(on, text = '正在出图…') {
  const el = $('v6-busy'); el.style.display = on ? 'block' : 'none'; el.textContent = text;
}
function dl(blob, name) {
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url; a.download = name; document.body.appendChild(a); a.click();
  a.remove(); setTimeout(() => URL.revokeObjectURL(url), 4000);
}
async function saveOne(i) {
  if (!state || !state.set) return;
  busy(true, '正在出图…');
  try {
    const { blob } = await renderPageDoc(state.set.htmls[i]);
    dl(blob, `supersu-longform-${state.tpl.id}-${String(i + 1).padStart(2, '0')}.png`);
  } catch (e) { toast(`出图失败：${e.message}`, 'err'); }
  finally { busy(false); }
}
async function exportOneSet() {
  if (!state || !state.set) return;
  const n = state.set.htmls.length;
  busy(true, `正在出图 0/${n}…`);
  try {
    for (let i = 0; i < n; i++) {
      busy(true, `正在出图 ${i + 1}/${n}…`);
      const { blob } = await renderPageDoc(state.set.htmls[i]);
      dl(blob, `supersu-longform-${state.tpl.id}-${String(i + 1).padStart(2, '0')}.png`);
      /* 多文件连续下载会被 Chrome 拦一次（「此网站尝试下载多个文件」）。
         实测 n=2 时两张都下来了，但用户会看到拦截条却不知道为什么 —— 提前说明。 */
      if (n > 1 && i === 0) {
        toast(`将连续下载 ${n} 张，浏览器若询问「允许下载多个文件」请点允许`, 'ok');
      }
    }
    $('cv-zip-story').hidden = false;
    $('cv-status-long').textContent =
      `已导出 ${n} 张 PNG（1 封面 + ${n - 1} 内页）。想要一次下载请用「打包 ZIP」。`;
    toast(`整套 ${n} 张已导出`, 'ok');
  } catch (e) { toast(`导出失败：${e.message}`, 'err'); }
  finally { busy(false); }
}
async function exportZip() {
  if (!state || !state.set) return;
  const n = state.set.htmls.length;
  busy(true, `正在出图 0/${n}…`);
  try {
    const tiles = [];
    for (let i = 0; i < n; i++) {
      busy(true, `正在出图 ${i + 1}/${n}…`);
      const { blob } = await renderPageDoc(state.set.htmls[i]);
      const role = i === 0 ? '封面' : `内页${i}`;
      tiles.push({ name: `${String(i + 1).padStart(2, '0')}-${role}.png`, blob });
    }
    const r = await zipTiles(tiles, '小红书整套');
    toast(`已打包 ${tiles.length} 张：${r.filename}`, 'ok');
  } catch (e) { toast(`打包失败：${e.message}`, 'err'); }
  finally { busy(false); }
}
function exportMarkdown() {
  if (!state || !state.set) return;
  const txt = ['# ' + (state.set.title || '未命名'), '',
    ...state.set.pages.filter((p) => p.role !== 'cover')
      .flatMap((p) => (p.blocks || []).map((b) => String(b.text || '')))].join('\n\n');
  dl(new Blob([txt], { type: 'text/markdown;charset=utf-8' }),
    `supersu-longform-${state.tpl.id}.md`);
}
