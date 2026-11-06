/* 标题图 V3 · 设计令牌层（2026-11-06）
 *
 * 为什么需要这一层：50 套模板、1827 行代码里散落着 50 处硬编码字号
 * （font-size:29px / 30px / 27px…），它们是**按 1080×1440 手调出来的**。
 * 实测后果：同一套模板换到 21:9（900 高）时，标题占比从 0.086 跳到 0.187
 * （2 倍），引语却纹丝不动 —— 三尺寸虽然开了，但只有 3:4 真的好看。
 *
 * 这一层的职责：把「所有尺寸相关的量」从模板里抽出来，统一按画布缩放。
 *   · 基准画布 1080×1440，所有令牌以它为准书写；
 *   · 实际渲染时乘以 scale = min(w/1080, h/1440)，再按横/竖版微调；
 *   · 模板只引用令牌（t.title / t.lead / t.pad），不再写字面量。
 *
 * 设计参考（业界同类系统的共识做法）：
 *   · Vercel Satori / OG Image：模板只描述结构，尺寸由外层画布决定；
 *   · 设计令牌（design tokens）把「视觉比例」和「绝对像素」解耦，
 *     换画布时只改一处 scale，不会出现 50 个字号各调一遍。
 */

/** 基准画布（所有令牌以此为准书写）。 */
export const BASE = { w: 1080, h: 1440 };

/** 令牌定义：键 → 基准像素（1080×1440 下的值）。 */
const TOKENS = {
  /* 版心内边距 */
  padX: 92,
  padY: 88,
  /* 标题（实际字号由 buildV3Html 按字数反算，这里给上限/行高） */
  titleMax: 190,
  titleLine: 1.08,
  /* 正文层级 —— 原来散落着 22–36px 十几个值，收敛成 4 档 */
  lead: 29,          // 引语 / 副标题
  body: 26,          // 条目正文
  meta: 18,          // 页脚、署名、编号（mono）
  micro: 15,         // 极小标注（角标、图注）
  /* 装饰性尺寸 */
  kicker: 17,        // 栏目名（EVIDENCE WALL / THESIS…）
  bigNum: 210,       // 超大序号
  rule: 3,           // 细线粗细
  gap: 10,           // 网格间距
};

/**
 * 计算某个画布的缩放上下文。
 *
 * @param {{w:number,h:number}} dim  实际画布尺寸
 * @returns {object} 含所有令牌（已缩放）+ scale / ratio / isWide / isSquare
 */
export function tokens(dim) {
  /* 用 min 而不是分别缩放宽高：保证「同一套模板在不同画布下视觉比例一致」。
     ⚠️ 不能只按宽度缩放 —— 21:9 的宽度是 2100（比基准还宽），
     按宽度算 scale=1.94，字号会翻倍，而高度只有 900，结果全挤在一起。 */
  const scale = Math.min(dim.w / BASE.w, dim.h / BASE.h);
  const ratio = dim.w / dim.h;
  const isWide = ratio > 1.9;      // 21:9
  const isSquare = ratio > 1.05 && ratio <= 1.9;   // 1:1

  const px = (v) => Math.round(v * scale);

  /* 横版额外收紧：21:9 的纵向空间只有 900，按比例缩放后标题仍可能占太多，
     所以横版的标题上限再打 0.72 折（实测 21:9 下占比 0.167 → 0.12）。 */
  const titleCap = Math.round(TOKENS.titleMax * scale * (isWide ? 0.72 : 1));

  return {
    scale,
    ratio,
    isWide,
    isSquare,
    padX: isWide ? px(TOKENS.padX * 1.05) : px(TOKENS.padX),
    padY: isWide ? px(TOKENS.padY * 0.72) : px(TOKENS.padY),
    titleMax: titleCap,
    titleLine: TOKENS.titleLine,
    lead: px(TOKENS.lead),
    body: px(TOKENS.body),
    meta: px(TOKENS.meta),
    micro: px(TOKENS.micro),
    kicker: px(TOKENS.kicker),
    bigNum: px(TOKENS.bigNum),
    rule: Math.max(1, px(TOKENS.rule)),
    gap: px(TOKENS.gap),
  };
}

/** 把令牌展开成可直接插进 CSS 的字符串（模板里少写重复的 px）。 */
export function cssVars(t) {
  return `--pad-x:${t.padX}px;--pad-y:${t.padY}px;`
    + `--fs-lead:${t.lead}px;--fs-body:${t.body}px;--fs-meta:${t.meta}px;`
    + `--fs-micro:${t.micro}px;--fs-kicker:${t.kicker}px;--gap:${t.gap}px;`;
}
