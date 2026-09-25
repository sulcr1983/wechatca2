#!/usr/bin/env python3
"""47 套原创排版主题的「设计意图」规格（供 scripts/build_themes.py 展开成主题 JSON）。

只描述四件事：底色 / 墨色 / 强调色 / 字体气质 + 排版原型 + 页面布局。
字号、间距、圆角、描边、阴影、暗色模式、色带全部由生成器的设计系统推导，
因此 47 套的每个数值都是本项目自己标尺的产物。

命名与文案亦为本项目自拟。id 统一 `su-` 前缀（SuperSu），与 45 套既有原创主题不冲突。
"""


def T(**kw):
    return kw


SPECS = [
    # ── 素排 / 文档类 ───────────────────────────────────────────────────
    T(id="su-academic", name="学术素笺", font="serif", arch="magazine",
      bg="#FFFFFF", ink="#1C1C1C", accent="#7A2E2E",
      desc="纯白底配宋体衬线，细线分隔，像期刊内页。适合论文解读、长文分析。"),
    T(id="su-quietdoc", name="静文", font="sans", arch="plain",
      bg="#FFFFFF", ink="#37352F", accent="#C0392B",
      desc="灰阶文字只留一处红色强调，几乎无装饰。适合文档、笔记、教程。"),
    T(id="su-glacier", name="冷白", font="sans", arch="plain",
      bg="#F5F7FA", ink="#1F2937", accent="#0B7FA8",
      desc="冷灰白底配清透蓝，留白多、干扰少。适合效率、工具、清单类。"),
    T(id="su-gridline", name="网格", font="mono", arch="technical",
      bg="#FFFFFF", ink="#0F0F0F", accent="#D0201C",
      desc="极左对齐、强网格、红色只做定位。适合设计、排版、理性话题。"),

    # ── 卡纸 / 分层类 ───────────────────────────────────────────────────
    T(id="su-frost-card", name="霜卡", font="sans", arch="card", layout="card",
      bg="#FBFBFD", ink="#1D1D1F", accent="#4A6CF7",
      desc="浅银底上浮起大圆角白卡，卡片之间分节清楚。适合产品发布、功能盘点。"),
    T(id="su-frostedglass", name="琉璃", font="sans", arch="card",
      bg="#EFF1FA", ink="#2A2E45", accent="#6A5ACD",
      desc="浅靛底配大圆角与克制留白，清爽的界面感。适合设计稿点评、界面说明。"),

    # ── 杂志 / 编辑部 ───────────────────────────────────────────────────
    T(id="su-broadsheet", name="大刊", font="serif", arch="magazine",
      bg="#FFFFFF", ink="#14161A", accent="#C0322B",
      desc="印刷级大字标题配红色强调，有杂志开篇的气场。适合特稿、人物、深度。"),
    T(id="su-classicmuse", name="典藏", font="serif", arch="magazine",
      bg="#FCFAF5", ink="#2A2622", accent="#9A7B2F",
      desc="米色引用块配金色强调，克制地贵气。适合观点文、深度报道。"),
    T(id="su-studio", name="工室", font="serif", arch="magazine",
      bg="#FAF7F2", ink="#26221E", accent="#B8532B",
      desc="暖白底配赭橙点缀，大号衬线标题拉开气势。适合品牌叙事、产品理念。"),
    T(id="su-gilded", name="鎏金", font="serif", arch="magazine",
      bg="#F5ECD7", ink="#3A2A22", accent="#7A1F33",
      desc="米金纸底配深酒红，饰线收边，有点旧印刷品的排场。适合品牌故事、文化专栏。"),
    T(id="su-roundtable", name="圆桌", font="serif", arch="magazine",
      bg="#FAF4EA", ink="#2E2622", accent="#8A3A3A",
      desc="奶油纸底配勃艮第红，居中衬线标题。适合访谈、对谈、多人观点。"),

    # ── 纸感 / 手记 ─────────────────────────────────────────────────────
    T(id="su-scrollwork", name="书卷", font="serif", arch="paper",
      bg="#FBF7F0", ink="#3B2F26", accent="#B4552A",
      desc="橘棕衬线配米白纸底，读起来像摊开的旧书。适合散文、随笔、书评。"),
    T(id="su-notebook", name="手记", font="kai", arch="paper",
      bg="#FDF9F0", ink="#2B2620", accent="#6B7A52",
      desc="米白纸底配楷体，像在笔记本上写字。适合日记、随笔、读书笔记。"),
    T(id="su-claypaper", name="陶纸", font="serif", arch="paper",
      bg="#FAF6F0", ink="#2F2A24", accent="#B65B2E",
      desc="浅暖白底配陶橙，宋体收得干净。适合器物、手艺、生活类内容。"),
    T(id="su-indigopaper", name="墨纸", font="serif", arch="paper",
      bg="#F9F8F5", ink="#23262B", accent="#2A5B86",
      desc="极浅暖白底配墨蓝，宋体衬线为主。适合知识整理、方法论。"),
    T(id="su-pinepaper", name="松纸", font="serif", arch="paper",
      bg="#F8F8F4", ink="#242824", accent="#3F6B4F",
      desc="浅暖白底配松绿，安静耐读。适合自然、健康、生活方式。"),
    T(id="su-oldpaper", name="旧纸", font="sans", arch="paper",
      bg="#FCF6E6", ink="#2A2A24", accent="#2E8B7A",
      desc="泛黄老纸底配薄荷绿，旧书摊的松弛感。适合随笔、旅行、回忆。"),
    T(id="su-xuanink", name="宣墨", font="kai", arch="paper",
      bg="#F8F4E8", ink="#1E1B16", accent="#A8322A",
      desc="宣纸米底配墨黑与印章红，仿宋落款感。适合国学、书法、传统文化。"),
    T(id="su-typograph", name="铅字", font="serif", arch="paper",
      bg="#F4E7C8", ink="#2C2416", accent="#8A5A2B",
      desc="羊皮纸底配墨棕铅字，老式打字机的手感。适合信件、旧事、怀旧。"),
    T(id="su-crimsonwashi", name="朱纸", font="serif", arch="paper",
      bg="#FBF6E7", ink="#2A2420", accent="#C0392B",
      desc="和纸米底配朱红，克制里有一点暖。适合日式题材、器物、旅行。"),
    T(id="su-brushink", name="墨笔", font="kai", arch="plain",
      bg="#FFFFFF", ink="#121212", accent="#A82A24",
      desc="纯白底配大号楷体墨黑，印章红只点一下。适合短句、题记、东方题材。"),

    # ── 暗底 / 沉浸 ─────────────────────────────────────────────────────
    T(id="su-nightsky", name="夜空", font="sans", arch="dark", dark=True,
      bg="#0C0417", ink="#E8E2F2", accent="#D8B24A",
      desc="深空紫黑底配金色强调，安静而贵气。适合夜间阅读、深度长文。"),
    T(id="su-lamplight", name="夜灯", font="serif", arch="dark", dark=True,
      bg="#1B1714", ink="#E4DCD2", accent="#D98A5C",
      desc="暖暗底配暖橘字，睡前读不刺眼。适合夜读、长文、情感类。"),
    T(id="su-hazard", name="警示条", font="sans", arch="brutal", dark=True,
      bg="#1E1E1E", ink="#F0F0F0", accent="#F08A1E",
      desc="深灰底配警示橙，粗体短句像现场标语。适合安全须知、规范提醒。"),
    T(id="su-console", name="终端", font="mono", arch="brutal", dark=True,
      bg="#0A0A0A", ink="#C8FACC", accent="#2BE07A",
      desc="纯黑底配荧光绿等宽字，命令行味道。适合开发日志、技术排错。"),
    T(id="su-neonwave", name="霓虹", font="sans", arch="playful", dark=True,
      bg="#1A0D2E", ink="#EFE6FF", accent="#FF5FA2", accent2="#5FE0FF",
      desc="深紫底配霓粉青蓝，八零年代电子梦。适合音乐、潮流、亚文化。"),
    T(id="su-drafting", name="蓝图", font="mono", arch="technical", dark=True,
      bg="#0C3A63", ink="#DCE9F5", accent="#7FB6E8",
      desc="深钴蓝底配白色细线，像工程图纸。适合技术方案、架构说明。"),

    # ── 数据 / 技术 ─────────────────────────────────────────────────────
    T(id="su-gauges", name="数据简报", font="sans", arch="technical",
      bg="#FFFFFF", ink="#1B2733", accent="#12507F", accent2="#C77A12",
      desc="报告蓝配琥珀点缀，表头深底反白，为数据而排。适合周报、月报、复盘。"),
    T(id="su-hardedge", name="硬边", font="sans", arch="brutal",
      bg="#FFFFFF", ink="#111111", accent="#111111",
      desc="纯白底配直角排版和超粗标题，字距拉开，故意不修边幅。适合观点输出、锐评。"),

    # ── 明快 / 活泼 ─────────────────────────────────────────────────────
    T(id="su-confetti", name="彩纸", font="sans", arch="playful",
      bg="#FFFFFF", ink="#1A1A1A", accent="#E8467C", accent2="#2C6BD8",
      desc="白底配明快双色强调，大圆角活泼。适合活动预告、团队文化。"),
    T(id="su-macaron", name="马卡龙", font="sans", arch="playful",
      bg="#FFF6F3", ink="#3A2F35", accent="#A98BC4", accent2="#E8909B",
      desc="奶油粉配雾紫，甜而不腻。适合生活、美妆、探店。"),
    T(id="su-stickynote", name="便签", font="sans", arch="playful",
      bg="#FFF9C4", ink="#2B2B1F", accent="#E2622E",
      desc="鸭黄便签底配橙红记号，像贴在墙上。适合要点清单、灵感记录。"),
    T(id="su-picturebook", name="绘本", font="sans", arch="playful",
      bg="#FFFDF4", ink="#2A2620", accent="#E86A8A", accent2="#4D8FD1",
      desc="奶白底配四种明快点缀色，软糯圆角。适合亲子、科普、故事。"),

    # ── 交替色带（不做深色首屏，只靠色带分节）────────────────────────────
    T(id="su-ribbon", name="色带", font="sans", arch="editorial", layout="hero",
      bg="#FFFFFF", ink="#23262B", accent="#D2622A",
      hero_flags={"dark_header": False, "numbered": False, "pull_quotes": False,
                  "alt_bg_enabled": True},
      desc="浅色带一格一格把正文分开，橙色只做克制的强调。适合产品动态、版本更新。"),

    # ── 大序号（章节序号撑结构，无色带）──────────────────────────────────
    T(id="su-countdown", name="序号", font="sans", arch="editorial", layout="hero",
      bg="#FFFFFF", ink="#24292F", accent="#1F5FA8",
      hero_flags={"dark_header": False, "numbered": True, "pull_quotes": False,
                  "alt_bg_enabled": False},
      desc="章节前压一个大序号，结构一眼看清。适合教程、指南、清单。"),

    # ── 深色沉浸首尾屏 ──────────────────────────────────────────────────
    T(id="su-deepwater", name="深水区", font="sans", arch="dark", dark=True, layout="hero",
      bg="#0E1726", ink="#DDE6F2", accent="#4FA3D8",
      hero_dark="#0A121F",
      hero_flags={"dark_header": True, "dark_footer": True, "numbered": True,
                  "pull_quotes": True, "alt_bg_enabled": True, "cards": True},
      desc="全暗色沉浸阅读，深色首尾屏包住正文，大序号带章节。适合技术长文、夜间阅读。"),

    # ── 时间线 ──────────────────────────────────────────────────────────
    T(id="su-milestone", name="里程碑", font="sans", arch="editorial", layout="timeline",
      bg="#FFFFFF", ink="#22302A", accent="#1F8A5C",
      desc="左侧一条竖线串起各节点，适合版本迭代、事件回顾。"),

    # ── 首屏家族 · 十色（深色首屏 + 大序号 + 交替色带 + 引文穿插）──────────
    T(id="su-dusk-slate", name="暮色·雾蓝", font="sans", arch="editorial", layout="hero",
      bg="#FFFFFF", ink="#2A3140", accent="#5B6B84", hero_dark="#232C38",
      desc="深蓝灰首屏压住开场，正文走浅色带，序号带章节。适合长文、深度解读。"),
    T(id="su-dusk-amber", name="暮色·琥珀", font="sans", arch="editorial", layout="hero",
      bg="#FFFFFF", ink="#2A2118", accent="#D98A1F", hero_dark="#33261A",
      desc="深棕首屏配琥珀强调，暖而不腻。适合人物访谈、创业故事、年终总结。"),
    T(id="su-dusk-azure", name="暮色·晴空", font="sans", arch="editorial", layout="hero",
      bg="#FFFFFF", ink="#1F2A36", accent="#2F7FD1", hero_dark="#10283D",
      desc="深蓝首屏配晴空蓝，清透利落。适合行业观察、产品分析。"),
    T(id="su-dusk-coral", name="暮色·珊瑚", font="sans", arch="editorial", layout="hero",
      bg="#FFFFFF", ink="#2E2523", accent="#DE5B4A", hero_dark="#3A211E",
      desc="深褐首屏配珊瑚红，热度适中。适合活动复盘、品牌故事。"),
    T(id="su-dusk-mauve", name="暮色·藕紫", font="sans", arch="editorial", layout="hero",
      bg="#FFFFFF", ink="#2A2630", accent="#8B7BA8", hero_dark="#2B2536",
      desc="深紫首屏配藕紫，温柔克制。适合情感、文化、生活美学。"),
    T(id="su-dusk-mint", name="暮色·薄荷", font="sans", arch="editorial", layout="hero",
      bg="#FFFFFF", ink="#202C29", accent="#2E9E86", hero_dark="#16302C",
      desc="墨绿首屏配薄荷，清冷干净。适合健康、自然、方法论。"),
    T(id="su-dusk-ochre", name="暮色·赭石", font="sans", arch="editorial", layout="hero",
      bg="#FFFFFF", ink="#2C2618", accent="#B4762A", hero_dark="#332C1B",
      desc="深褐首屏配赭石金，旧书味。适合历史、文化、读书笔记。"),
    T(id="su-dusk-indigo", name="暮色·靛紫", font="sans", arch="editorial", layout="hero",
      bg="#FFFFFF", ink="#232438", accent="#4C4FA8", hero_dark="#1E2044",
      desc="深靛首屏配靛紫，安静专注。适合思考类、评论类长文。"),
    T(id="su-dusk-sage", name="暮色·苔绿", font="sans", arch="editorial", layout="hero",
      bg="#FFFFFF", ink="#262C26", accent="#6D8B6A", hero_dark="#232C24",
      desc="深绿首屏配苔绿，呼吸感强。适合生活方式、户外、植物。"),
    T(id="su-dusk-taupe", name="暮色·卡其", font="sans", arch="editorial", layout="hero",
      bg="#FFFFFF", ink="#2B2823", accent="#8A7A68", hero_dark="#2E2A25",
      desc="深褐首屏配卡其，中性好搭。适合职场、效率、经验分享。"),
]
