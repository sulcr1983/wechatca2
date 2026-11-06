/* 对照夹具（Phase 2 单一真源）
 *
 * 为什么单独一个文件：5 种骨架必须喂**同一份内容**，
 * 否则「差异」可能来自换了一篇文章，而不是骨架不同 —— 那是假差异。
 *
 * 出处：scripts/pwa_longform_test.py 的 TITLE_LINE + BODY_TEXT
 *      （产品门禁 `pwa_longform_test.py` 用的同一篇，口径一致，可直接对照）
 *
 * 结构：把原文拆成 4 类**内容块**。每种骨架自己声明消费哪几块 ——
 * 骨架本来就有内容偏好（散文骨架吃段落，账本骨架吃条目），
 * 但所有块都来自同一篇文章，且都标了原文位置。
 */

export const SOURCE = 'scripts/pwa_longform_test.py → TITLE_LINE + BODY_TEXT';

export const TITLE = '周末去海边，我把手机调成了飞行模式';

/** 块 id → 内容。每种骨架在 RECIPES 里声明用到哪些。 */
export const BLOCKS = {
  /* 原文：开篇段（~100 字） */
  lead: '两天的沉默之后，我重新听见了海浪。浪的声音比任何白噪音都好用，'
      + '时间忽然变多了，早上不用刷消息，晚上不用回群里的表情包，'
      + '一天像被拉长了三分之一。原来所谓休息，不是换个地方刷手机，'
      + '而是允许自己消失一阵子，把注意力还给真实的生活。',

  /* 原文：正文段（~150 字） */
  body: '把手机收起来之后，我重新读完了搁置半年的那本书。晚饭后的散步也不再看屏幕，'
      + '路口的风、店门口的猫、修车铺的收音机，全都清楚了起来。'
      + '原来不是生活没有细节，是我以前走得太快，细节全被丢在了路上。'
      + '慢慢走，反而什么都遇得到，连楼下的桂花都比记忆里香。',

  /* 原文：清单 6 条 */
  items: [
    '出发前把手机调成飞行模式，塞进背包最底下',
    '到了先别拍照，坐十分钟再说',
    '回程的路上写几句话，不给点赞留位置',
    '把手机放进背包最底层',
    '读十页搁置很久的那本书',
    '早点睡觉，别熬到两点',
  ],

  /* 原文：金句 */
  quote: '浪的声音，比任何白噪音都好用，它把「效率」两个字从耳朵里拿走了，'
      + '剩下的时间终于属于我自己。',
};

/** 夹具自检：字数 + 每个块的来源标注（对照标注条要显示这个）。 */
export const BLOCK_META = {
  lead:  { label: '开篇段', chars: BLOCKS.lead.length },
  body:  { label: '正文段', chars: BLOCKS.body.length },
  items: { label: '清单 6 条', chars: BLOCKS.items.join('').length },
  quote: { label: '金句', chars: BLOCKS.quote.length },
};

export const TOTAL_CHARS = TITLE.length
  + BLOCKS.lead.length + BLOCKS.body.length
  + BLOCKS.items.join('').length + BLOCKS.quote.length;
