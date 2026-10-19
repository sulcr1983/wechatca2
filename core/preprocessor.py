import re

# 强句子信号 — 只有命中这些才算「短句而非标题」。
#
# 2026-10-18 修订：原词表混入了两类不该有的词，导致中文小标题几乎全被判成句子
# （20 个典型小标题实测只识别 9 个：「常见问题」「我的做法」「写在最后」「使用方法」
# 「内容清单」「效果对比」「重点在这里」全部 FAIL）：
#   ① 超高频单字虚词：是/了/在/就/都/很/不/也/我/你/他/这/那/会/能/要/把/被/让/给/对/从/到/与/及/或
#      —— 任何一句中文都含其中之一，等于恒真。
#   ② 名词：问题|方法|内容|效果|特点|功能|目的|意义|影响|过程|结果|原因|作用|优势|发展|情况
#      —— 这些恰恰是标题最常用的词。
# 现在只保留三类真信号：强句式短语 / 主语代词+谓语 / 完成体词尾。
# 另外：孤立成行的短行（前后空行）在调用处已跳过本判定，见「短行标题检测」。
_SENTENCE_WORDS = re.compile(
    r'(?:是因为|所以|但是|不过|而且|然后|如果|虽然|因为|已经|可以|应该|可能|必须|一定|'
    r'怎么样|怎么办|为什么|什么|是否|多少)'
    r'|(?:我|你|他|她|它|您|我们|你们|他们)(?:们)?(?:把|被|的|想|说|觉得|认为|要|会|能|'
    r'不|没|已经|也|都|就|还|再|又)'
    r'|[着了过]$'
)

def _looks_like_sentence(text: str) -> bool:
    """检测一个短文本是否更像完整句子而非标题"""
    return bool(_SENTENCE_WORDS.search(text))


# 孤立行（前后空行）专用的「强谓语」判定 —— 比 _SENTENCE_WORDS 更窄。
#
# 为什么需要两份：孤立成行的短行几乎必然是标题，用宽词表会把
# 「为什么要跑那么远」「住在哪里」这类疑问式小标题全杀掉；但完全不判又会让
# 「他说了一句话」「我把手机调成了飞行模式」这种正文短句漏成标题。
# 折中：孤立行只认「主语 + 谓语/情态」和「动词 + 完成体」两类硬信号。
# 刻意不收「的」——「我的做法」「出发前的准备」是名词短语，属标题。
_PROSE_PREDICATE = re.compile(
    r'(?:我|你|他|她|它|您)(?:们)?(?:把|被|说|想|觉得|认为|会|能|要|可以|应该|'
    r'不|没|已经|也|都|就|还|再|又)'
    r'|(?:说|想|做|去|来|看|听|写|读|吃|喝|坐|站|走)[着了过]'
)


def _looks_like_prose_line(text: str) -> bool:
    """孤立成行的短行是否明显是正文句子（用于放宽标题识别时的兜底）"""
    return bool(_PROSE_PREDICATE.search(text))


# 箭头并列：A → B → C（正文里孤立的并列流程/清单）
_ARROW_RE = re.compile(r'\s*(?:→|->|➔|➜|⇒)\s*')

# 行首项目符号 —— 符号后必须跟空白（中文圆点可紧贴文字，ASCII 的 -/* 必须跟空格），
# 否则 `**加粗**` 的第二个 * 会被当成项目符号，拆成「- *加粗文字**」（H03 实测踩到）。
_BULLET_RE = re.compile(r'^(?:[·•●○]\s*|[-*]\s+)')

# 阿拉伯数字有序项：`1. xxx` / `2．xxx` / `3) xxx`（用于探测「连续有序列表」）
_ARABIC_ITEM_RE = re.compile(r'^\d+[.．)]\s+\S')

# 围栏容器开标记：:::{type}[标题] / 收尾标记：:::
# 这两类行必须原样穿透，否则短标记（如 :::cta[标题] 仅 10 字）会被「短行标题」规则
# 改成 ## :::cta；同理容器**内部**的短行（stat 的数字、steps 的步骤）也会被误加 ##。
_CONTAINER_OPEN_RE = re.compile(r'^:::\w+(?:\[[^\]]*\])?\s*$')
_CONTAINER_CLOSE_RE = re.compile(r'^:::\s*$')

# ── 2026-10-18 自动排版增强：多风格纯文本 → Markdown ─────────────────────
# 分节标题：第X部分 / 第X章 / 第X节 / 第X篇（中文长文最强信号）
_SECTION_RE = re.compile(r'^第[一二三四五六七八九十百零\d]+[部章节篇]')
# 数字小节：3.1 / 3.2.1（点分多层编号）
_NUMBERED_SUB_RE = re.compile(r'^\d+(?:\.\d+){1,3}[、.．]?\s*\S')
# 提示 / 警示行 → 引用块
_NOTICE_RE = re.compile(
    r'^(注意|提示|警告|严重警告|核心提示|特别提醒|重要提示|重要说明|说明|备注|免责声明|声明|注)\s*[：:]'
)
# 序数词列表：首先，/ 其次，/ 第一，/ 步骤一：
_ORDINAL_WORD_RE = re.compile(
    r'^(首先|其次|再次|然后|最后|接着|另外|此外|同时|其一|其二|其三)\s*[，,、]\s*'
)
_CN_ORDINAL_LIST_RE = re.compile(r'^第[一二三四五六七八九十\d]+\s*[，,、]\s*')
_STEP_RE = re.compile(r'^(步骤[一二三四五六七八九十\d]+)\s*[：:、.]?\s*')
# 中文公文四级层级（对齐 Word-Formatter-Pro）：（一）→ 二级 / (1) → 四级
_PAREN_CN_RE = re.compile(r'^[（(][一二三四五六七八九十百]+[）)]\s*\S')
_PAREN_NUM_RE = re.compile(r'^[（(]\d+[）)]\s*\S')
# setext / 装饰标题（对齐 docling）：==== 标题 ====、或文本下一行 ===/--- 下划线
_DECORATED_TITLE_RE = re.compile(r'^[=＝]{3,}\s*(.+?)\s*[=＝]{3,}$')
_UNDERLINE_RE = re.compile(r'^(?:={3,}|[-—]{3,})$')
# 命令行 → 围栏代码块
_CMD_RE = re.compile(
    r'^(?:git|cd|npm|npx|yarn|pnpm|pip|pip3|python|python3|node|curl|wget|docker|sudo|'
    r'mkdir|rm|cp|mv|ls|cat|echo|export|source|brew|apt|apt-get|chmod|ssh|scp|tar|unzip|'
    r'make|go|cargo|java|mvn|gradle)\s+\S'
)


# ── 2026-10-19 格式兼容扩展（方案 B · txt-format-lab 夹具）─────────────────
# 章节标记：01｜标题（**全角竖线**，刻意不收半角 | —— 否则会把 Markdown 表格的
# 数字首列行「1 | 苹果 | 5 元」误判成标题）
_SECTION_MARK_RE = re.compile(r'^\d{1,2}\s*｜\s*\S')
# GFM 任务清单：- [ ] / - [x] / - [X]
_TASK_RE = re.compile(r'^[-*+]\s+\[([ xX])\]\s*(.*)$')
# admonition 别名（VitePress `::: tip` / Docusaurus `:::note`）→ 复用现有容器
_ADMONITION_ALIAS_RE = re.compile(
    r'^:::\s*(tip|note|info|warning|caution|danger|important|details)\b\s*(.*)$'
)
_ADMONITION_MAP = {
    'tip': ('summary', '小贴士'), 'note': ('summary', '提示'),
    'info': ('summary', '说明'), 'warning': ('summary', '警告'),
    'caution': ('summary', '注意'), 'danger': ('summary', '危险'),
    'important': ('summary', '重要'), 'details': ('summary', '详情'),
}
# GFM Alerts：> [!NOTE] / [!TIP] / [!IMPORTANT] / [!WARNING] / [!CAUTION]
_ALERT_RE = re.compile(r'^>\s*\[!(NOTE|TIP|IMPORTANT|WARNING|CAUTION)\]\s*(.*)$')
_ALERT_LABEL = {'NOTE': '提示', 'TIP': '小贴士', 'IMPORTANT': '重要',
                'WARNING': '警告', 'CAUTION': '注意风险'}
# 方括号提示标签：【提示】【注意】…… → 引用块
# 刻意不含【教程型】【评测型】【清单型】【通知型】【问答型】这类体裁标签（夹具 §12）
_NOTICE_BRACKET_RE = re.compile(r'^【(提示|注意|警告|风险|说明|备注|重要|小贴士)】')
# 管道表分隔行（用于判断「已有表头分隔、无需补」）
_TABLE_SEP_RE = re.compile(r'^\|?\s*:?-{2,}')
# 空格对齐表：列间以 ≥2 个空白分隔
_SPACE_SPLIT_RE = re.compile(r'[ \t\u3000]{2,}')


def _pipe_table_rows(lines: list, i: int):
    """连续 ≥2 行含 | 且列数一致 → (规整成首尾带竖线的表格行, 列数)；否则 None。

    为什么必须带首尾竖线：python-markdown 的 tables 扩展要求表头与数据行都以 `|` 开头
    （`^ *\\|`），「功能 | 难度 | 说明」这类不带首竖线的行不会被识别成表格。
    """
    rows, ncol, j = [], None, i
    while j < len(lines):
        s = lines[j].strip()
        if '|' not in s or _TABLE_SEP_RE.match(s):
            break
        cells = [c.strip() for c in s.strip('|').split('|')]
        if len(cells) < 2:
            break
        if ncol is None:
            ncol = len(cells)
        elif len(cells) != ncol:
            break
        rows.append('| ' + ' | '.join(cells) + ' |')
        j += 1
    return (rows, ncol) if len(rows) >= 2 and ncol else None


def _space_table_rows(lines: list, i: int):
    """连续 ≥2 行「多空白分列」→ 表格行；否则 None（保守：要求列数一致、无句末标点）"""
    rows = []
    ncol = None
    j = i
    while j < len(lines):
        s = lines[j].strip()
        if not s or '|' in s:
            break
        cells = [c.strip() for c in _SPACE_SPLIT_RE.split(s) if c.strip()]
        if not (2 <= len(cells) <= 6):
            break
        if ncol is None:
            ncol = len(cells)
        elif len(cells) != ncol:
            break
        if re.search(r'[。！？；]$', s):
            break
        rows.append(cells)
        j += 1
    return rows if len(rows) >= 2 else None


def _split_parallel_items(line: str):
    """箭头并列行 → 列表项；至少 3 项、每项都短、项内无逗号，否则不算清单"""
    parts = [p.strip() for p in _ARROW_RE.split(line) if p.strip()]
    if len(parts) < 3 or any(len(p) > 14 for p in parts):
        return None
    if any(('，' in p or ',' in p) for p in parts):
        return None
    # 首段含冒号的「标签：内容 → A → B」是带箭头的散文（如「用途：测试…」），不是并列清单
    if '：' in parts[0] or ':' in parts[0]:
        return None
    return parts


def _to_list_items(body: str):
    """段落 → 列表行；可确定则返回 ['- 项', ...]，否则 None"""
    lines = []
    for line in body.split('\n'):
        line = line.strip()
        if not line:
            continue
        items = _split_parallel_items(line)
        if items:
            lines.extend(f'- {item}' for item in items)
        elif _BULLET_RE.match(line):
            lines.append('- ' + _BULLET_RE.sub('', line))
        elif re.match(r'^[-*]\s', line):
            lines.append(line)
        else:
            return None
    return lines or None


# ── 自动编辑（受 GZHcomposing 启发，clean-room 实现）──────────────────────
# 参考 YiShu5/GZHcomposing 的 js/preprocess.js（3 模式：保守整理 / 长文分层 /
# 教程步骤）。仅借鉴其算法思路，未复制其代码。
_MODES = ('auto', 'conservative', 'longform', 'tutorial')

# 教程模式：行首命中即视为小标题的标签
_TUTORIAL_LABEL_RE = re.compile(
    r'^(准备工作|操作步骤|操作说明|注意事项|常见问题|温馨提示|使用说明|'
    r'第一步|第二步|第三步|第四步|第五步|方法|原理|小结|总结|前言|引言|背景|结语)$'
)
# 教程模式：中文序数/次序词开头的行 → 列表项
_CN_ORDINAL_RE = re.compile(r'^(第[一二三四五六七八九十\d]+[、.．]|首先|其次|然后|最后|其一|其二)[：:]?\s*')
# 长文分层：段落为「短标签：内容」时把标签提升为小标题（白名单避免误判）
_AUTO_HEADING_LABEL_RE = re.compile(
    r'^(核心观点|核心|结论|问题|原因|方法|步骤|要点|建议|误区|趋势|对比|'
    r'本质|关键|原理|背景|影响|好处|风险|实践|提醒|总结|前言|引言|优势|劣势|'
    r'区别|真相|底层逻辑|底层|观点|提示|说明)\s*[：:]\s*(.+)$'
)


def _looks_like_title(text: str, is_first_line: bool = False) -> bool:
    """判断一行是否像标题（短、无句尾标点、无句子功能词、无引用/列表标记）

    Args:
        is_first_line: 是否文章首行。首行跳过「像句子」判定——产品约定是
            「第一行自动当标题」（前端输入框 placeholder 就这么写的），
            而首行标题常带逗号或主语（如「周末去海边，我把手机调成了飞行模式」），
            用句式判定会把它误杀成普通段落。
    """
    s = text.strip()
    if not s or len(s) > 24:
        return False
    if s.startswith(('#', '>', '-', '*', '```', '|', ':::')):
        return False
    if s.startswith(('「', '\u201c', '"', '\u300e')):
        return False
    if re.search(r'[。！？，、；：…）)】》」”]$', s):
        return False
    if not is_first_line and _SENTENCE_WORDS.search(s):
        return False
    return True


def _resolve_mode(text: str, mode: str) -> str:
    """auto 模式：短文或已有结构 → conservative；长散文无结构 → longform"""
    if mode != 'auto':
        return mode
    paragraphs = [p for p in re.split(r'\n\s*\n', text.strip()) if p.strip()]
    if len(paragraphs) <= 3:
        return 'conservative'
    for p in paragraphs[:4]:
        first = p.strip().split('\n')[0]
        if re.match(r'^#{1,6}\s', first):
            return 'conservative'
        if re.match(r'^[一二三四五六七八九十\d]+[、.．)]\s', first):
            return 'conservative'
        if len(first) <= 12 and not _looks_like_sentence(first) and first[-1] not in '。！？，、；：）)】》」”':
            return 'conservative'
    return 'longform'


def _insert_auto_headings(md_lines: list) -> list:
    """长散文（尚无任何标题）按「标签：内容」补至多 5 个 ### 小标题，间隔 >= 2 段。"""
    if any(l.startswith('#') for l in md_lines):
        return md_lines
    body = [l for l in md_lines if l.strip() and not l.startswith(('>', '-', '*'))]
    if len(body) < 4:
        return md_lines
    out, since, count = [], 0, 0
    for l in md_lines:
        if count >= 5 or not l.strip() or l.startswith(('#', '>', '-', '*')):
            out.append(l)
            continue
        m = _AUTO_HEADING_LABEL_RE.match(l.strip())
        if m and since >= 2:
            out.append(f'### {m.group(1)}')
            out.append(m.group(2).strip())
            count += 1
            since = 0
            continue
        since += 1
        out.append(l)
    return out


def preprocess(text: str, mode: str = 'auto') -> str:
    """将纯文本转为基础 Markdown（无需 LLM）。

    启发式设计受 GZHcomposing (YiShu5/GZHcomposing, js/preprocess.js) 思路启发：
    仅借鉴其 3 模式（保守整理 / 长文分层 / 教程步骤）的算法，未复制其代码。

    mode:
      - conservative: 仅识别显式结构（序号/短行标题、列表、引用、代码块），不主动加标题。
      - longform:     在 conservative 基础上，对长散文按「标签：内容」补少量小标题。
      - tutorial:     强化教程标签（准备工作/注意事项/…）与小标题、中文序数转列表。
      - auto(默认):   短文或已有结构→conservative；长散文无结构→longform。
    """
    mode = mode if mode in _MODES else 'auto'
    effective = _resolve_mode(text, mode)
    lines = text.strip().split('\n')
    md_lines = []
    in_code_block = False   # 我们为「4 空格缩进」自动开的围栏
    in_fence = False        # 用户手写的 ``` 围栏
    container_depth = 0
    in_cmd_code = False      # 命令行围栏代码块（2026-10-18）

    skip_rows = 0
    for i, line in enumerate(lines):
        if skip_rows > 0:
            skip_rows -= 1
            continue
        stripped = line.strip()

        if not stripped:
            if in_code_block:
                md_lines.append('```')
                in_code_block = False
            md_lines.append('')
            continue

        # 用户手写的 ``` 围栏：翻转入内/出外。内部一律原样保留（含缩进），
        # 否则 Python 的缩进行会命中下面的「4 空格缩进」规则、被当成新代码块，
        # 导致围栏提前闭合、代码被截成两半（实测：def 与 return 被拆开）。
        if stripped.startswith(('```', '~~~')):
            if in_code_block:
                md_lines.append('```')
                in_code_block = False
            in_fence = not in_fence
            md_lines.append(stripped)
            continue

        if in_fence:
            md_lines.append(line)
            continue

        # 【2026-10-19】GFM Alerts：> [!NOTE] / [!WARNING] … → 带标签引用块
        # （引擎无 note 类容器，不新增容器以免改动引擎；映射为带中文标签的引用块）
        _m_alert = _ALERT_RE.match(stripped)
        if _m_alert:
            if in_code_block:
                md_lines.append('```')
                in_code_block = False
            md_lines.append(f'> 【{_ALERT_LABEL[_m_alert.group(1)]}】{_m_alert.group(2).strip()}')
            continue

        # 已含 Markdown 标记的行原样保留（但 \d+\.\s 可能是序号标题，后面单独判断）
        if re.match(r'^(#{1,6}\s|>\s|-\s|\*\s|~~)', stripped):
            if in_code_block:
                md_lines.append('```')
                in_code_block = False
            # 【2026-10-19】GFM 任务清单：- [ ] / - [x] → ☐ / ☑（保留原行首缩进）
            _m_task = _TASK_RE.match(stripped)
            if _m_task:
                _box = '☑' if _m_task.group(1).lower() == 'x' else '☐'
                _ind = line[:len(line) - len(line.lstrip())]
                md_lines.append(f'{_ind}- {_box} {_m_task.group(2).strip()}')
                continue
            # 列表项保留原始行首缩进：嵌套列表的二级缩进是内容的一部分。
            # 原实现用 stripped 抹平缩进，导致嵌套层级丢失（S12 实测 0/6 保留）。
            if re.match(r'^[-*+]\s', stripped):
                md_lines.append(line.rstrip())
            else:
                md_lines.append(stripped)
            continue

        # 代码块：4 空格或 tab 缩进
        if line.startswith('    ') or line.startswith('\t'):
            if not in_code_block:
                md_lines.append('```')
                in_code_block = True
            md_lines.append(stripped)
            continue

        if in_code_block:
            md_lines.append('```')
            in_code_block = False

        # 【2026-10-19】admonition 别名（::: tip / :::note / :::details …）→ 复用现有容器
        _m_adm = _ADMONITION_ALIAS_RE.match(stripped)
        if _m_adm:
            _adm_typ, _adm_lbl = _ADMONITION_MAP[_m_adm.group(1)]
            stripped = f':::{_adm_typ}[{_m_adm.group(2).strip() or _adm_lbl}]'

        # 围栏容器：开标记进入、内部一律原样保留、收尾标记退出（按深度支持嵌套）
        if _CONTAINER_OPEN_RE.match(stripped):
            container_depth += 1
            md_lines.append(stripped)
            continue

        if container_depth > 0:
            md_lines.append(stripped)
            if _CONTAINER_CLOSE_RE.match(stripped):
                container_depth -= 1
            continue

        # 教程模式：行首标签 → 小标题
        if mode == 'tutorial' and _TUTORIAL_LABEL_RE.match(stripped):
            md_lines.append(f'## {stripped}')
            continue

        # 教程模式：中文序数/次序词开头 → 列表项
        if mode == 'tutorial':
            m = _CN_ORDINAL_RE.match(stripped)
            if m:
                md_lines.append('- ' + _CN_ORDINAL_RE.sub('', stripped))
                continue

        # 【2026-10-18】提示 / 警示行 → 引用块（强信号，先于标题判定）
        # 【2026-10-19】扩展：【提示】【注意】【风险】等方括号标签同样按提示块处理
        if _NOTICE_RE.match(stripped) or _NOTICE_BRACKET_RE.match(stripped):
            md_lines.append(f'> {stripped}')
            continue

        # 【2026-10-18】命令行 → 围栏代码块（连续行合并）
        if _CMD_RE.match(stripped):
            if not in_cmd_code:
                md_lines.append('```')
                in_cmd_code = True
            md_lines.append(stripped)
            continue
        if in_cmd_code:
            md_lines.append('```')
            in_cmd_code = False

        # 【2026-10-18】分节标题：第X部分 / 第X章 / 第X节 / 第X篇
        if _SECTION_RE.match(stripped):
            md_lines.append(f'## {stripped}')
            continue

        # 【2026-10-19】章节标记 01｜标题（全角竖线；刻意不收半角 | 以免撞 Markdown 表格）
        if _SECTION_MARK_RE.match(stripped):
            md_lines.append(f'## {stripped}')
            continue

        # 【2026-10-18】数字小节：3.1 / 3.2.1（先于普通序号判定）
        if _NUMBERED_SUB_RE.match(stripped):
            md_lines.append(f'### {stripped}')
            continue

        # 【2026-10-18】括号层级（中文公文标准）：（一）→ 二级
        # 【2026-10-19】「（1）（2）」不再一律当四级标题：夹具 §04 明确提示这类行
        # 「看起来像列表，但未必是列表」→ 改为**永不判标题**，保持原文行（渲染层按 <br> 分行）。
        if _PAREN_CN_RE.match(stripped):
            md_lines.append(f'### {stripped}')
            continue

        # 【2026-10-18】纯分隔线（整行只由 =/＝/-/— 组成）→ 一律当 <hr>，绝不产出标题。
        # 原实现被装饰标题 / setext 下划线规则判成「## =」，夹具每章 ==== 分隔共冒出 32 个假标题。
        if re.fullmatch(r'[=＝\-—]{3,}', stripped):
            md_lines.append('---')
            continue

        # 【2026-10-18】装饰标题：==== 第一章 ==== / 文本 + 下一行下划线 → 标题
        _m_dec = _DECORATED_TITLE_RE.match(stripped)
        if _m_dec:
            md_lines.append(f'## {_m_dec.group(1)}')
            continue
        if _UNDERLINE_RE.match(stripped):
            # 把上一行非空文本升级为标题（setext 风格）
            for _k in range(len(md_lines) - 1, -1, -1):
                _prev = md_lines[_k]
                if _prev.strip():
                    _text = _prev.strip().strip('=＝-— ').strip()
                    if _text and not _text.startswith(('#', '>', '-', '```', '1.')):
                        md_lines[_k] = f'## {_text}'
                    break
            continue

        # 【2026-10-18】序数词 / 步骤 → 列表项
        _m = _ORDINAL_WORD_RE.match(stripped)
        if _m:
            md_lines.append('- ' + stripped[_m.end():].strip())
            continue
        _m = _CN_ORDINAL_LIST_RE.match(stripped)
        if _m:
            md_lines.append('- ' + stripped[_m.end():].strip())
            continue
        # 步骤标签「步骤一：…」→ 列表项，但**保留原始标签文字**（原文保真；
        # 原实现只留冒号后内容，把「步骤一：」整段吞掉，夹具 4 条步骤因此缺失）。
        _m = _STEP_RE.match(stripped)
        if _m:
            md_lines.append('- ' + stripped)
            continue

        # 【2026-10-18】诗体引用：下一行是「——署名」时，本行按引用处理
        _nxt = lines[i + 1].strip() if i + 1 < len(lines) else ''
        if _nxt.startswith('——') or _nxt.startswith('-- '):
            md_lines.append(f'> {stripped}')
            continue
        # 破折号署名行
        if stripped.startswith('——'):
            md_lines.append(f'> {stripped}')
            continue

        # 【2026-10-18】短标签行（≤9 字 + 冒号结尾、冒号后为空）→ 小标题
        # ⚠️ 保留冒号：原实现吞掉结尾冒号（「风险：」→「## 风险」），使原文保真检查判为丢字
        # （夹具实测 22 个标签行因此缺失）。
        if len(stripped) <= 9 and stripped.endswith('：'):
            md_lines.append(f'## {stripped}')
            continue

        # 序号段落（2026-10-18：按内容长度分流，避免把整句列表当标题）
        #   短（≤20 字且无逗号句号冒号）→ 小标题；长 → 有序列表项
        # 2026-10-18 修订：阿拉伯数字的「连续有序列表」（相邻原始行也是数字项）一律保留原序号
        #   转成有序列表，不再重排成 1.（实测：夹具 1.~5. 教程步骤与 1.~6. 结尾清单被重排/标题化，
        #   违反「原文保真」）；单行的短数字项仍按小标题处理（既有契约，见 test_e2e）。
        m_seq = re.match(r'^([一二三四五六七八九十]+|\d+)[、.．)]\s*(.+)$', stripped)
        if m_seq:
            _marker, _content = m_seq.group(1), m_seq.group(2).strip()
            _arabic = _marker.isdigit()
            _prev_num = i > 0 and bool(_ARABIC_ITEM_RE.match(lines[i - 1].strip()))
            _next_num = i + 1 < len(lines) and bool(_ARABIC_ITEM_RE.match(lines[i + 1].strip()))
            if _arabic and (_prev_num or _next_num):
                md_lines.append(stripped)
            elif len(_content) <= 20 and not re.search(r'[，,。；;：:！!？?]', _content):
                md_lines.append(f'## {stripped}')
            elif _arabic:
                md_lines.append(stripped)
            else:
                md_lines.append(f'1. {_content}')
            continue

        # 并列清单：箭头行 / 项目符号行
        items = _to_list_items(stripped)
        if items:
            md_lines.extend(items)
            continue

        # 【2026-10-19】表格兼容 A：无分隔行的竖线表 → 整表规整（补首尾竖线 + 补表头分隔行）
        # 上一行已含 | 说明正处在表格中（既有 GFM 表的数据行），不重复转换
        if not (i > 0 and '|' in lines[i - 1]):
            _pt = _pipe_table_rows(lines, i)
            if _pt:
                _prows, _pcol = _pt
                # 表格必须自成一块：紧贴上一行文字会被 Markdown 当作同一段落，表格不成立
                if md_lines and md_lines[-1].strip():
                    md_lines.append('')
                md_lines.append(_prows[0])
                md_lines.append('|' + '|'.join(['---'] * _pcol) + '|')
                md_lines.extend(_prows[1:])
                skip_rows = len(_prows) - 1
                continue

        # 【2026-10-19】表格兼容 B：空格/全角空格对齐表（≥2 行、列数一致）→ 管道表
        _rows = _space_table_rows(lines, i)
        if _rows:
            if md_lines and md_lines[-1].strip():
                md_lines.append('')
            md_lines.append('| ' + ' | '.join(_rows[0]) + ' |')
            md_lines.append('|' + '|'.join(['---'] * len(_rows[0])) + '|')
            for _r in _rows[1:]:
                md_lines.append('| ' + ' | '.join(_r) + ' |')
            skip_rows = len(_rows) - 1
            continue

        # 短行标题检测
        # 孤立行：前后有空行或文件边界
        prev_empty = i == 0 or not lines[i - 1].strip()
        next_empty = i == len(lines) - 1 or not lines[i + 1].strip()
        is_isolated = prev_empty and next_empty

        has_comma = ',' in stripped or '，' in stripped

        # 排除常见非标题词（单字、内容词等）
        common_non_title = {'内容', '简介', '说明', '备注', '注意', '提示', '参考', '来源', '链接'}

        # 2026-10-18：真实 TXT 常无空行——除"孤立行"外，短行 + 下一行是较长正文 也视为标题
        _nxt_line = lines[i + 1].strip() if i + 1 < len(lines) else ''
        _heading_ctx = is_isolated or (len(_nxt_line) >= 15 and len(_nxt_line) > len(stripped))
        if (
            _heading_ctx
            and len(stripped) <= 22
            and len(stripped) >= 2
            # 2026-10-19：「（1）（2）」这类括号编号行永不判标题（夹具 §04 明确提示）
            and not _PAREN_NUM_RE.match(stripped)
            and not stripped.startswith(('\u300c', '\u201c', '\u201d', '——'))
            and not re.search(r'[。！？，、；：\u201c\u201d…\)】》]$', stripped[-1])
            and not has_comma
            and '：' not in stripped
            and ':' not in stripped
            # 2026-10-18：表格行（含 |）、原始 HTML 片段（<）、公式块（$$）一律不当标题
            # （S17 竖线表格误判、H06 的 <div>/<br> 被标题化、S20 的 $$ 被标题化）
            and '|' not in stripped
            and not stripped.startswith('<')
            and not stripped.startswith('$')
            and stripped not in common_non_title
            # 2026-10-18：孤立成行的短行优先当标题（跳过宽词表判定），
            # 但仍挡掉明显是正文的强谓语短句（「他说了一句话」）。
            and (not _looks_like_prose_line(stripped) if is_isolated
                 else not _looks_like_sentence(stripped))
        ):
            md_lines.append(f'## {stripped}')
            continue

        # 引号开头 → 引用块
        if stripped.startswith('\u300c') or stripped.startswith('\u201c') or stripped.startswith('\u201d'):
            md_lines.append(f'> {stripped}')
            continue

        # 普通行转为段落
        md_lines.append(stripped)

    if in_code_block:
        md_lines.append('```')
    if in_cmd_code:
        md_lines.append('```')

    # 合并连续的非空行（去掉误加的空行），保留段落间的空行
    result = []
    prev_empty = False
    for line in md_lines:
        is_empty = line == ''
        if is_empty:
            if not prev_empty:
                result.append('')
            prev_empty = True
        else:
            prev_empty = False
            result.append(line)

    # 长文分层：补自动小标题（仅 longform，且原文尚无任何标题）
    if effective == 'longform':
        result = _insert_auto_headings(result)

    # 首行 = 文章大标题（conservative 不提升；其余模式一律提升）
    #
    # 2026-10-18 修复：原实现遇到「已被规则标成 ## 的首行」会因 `s.startswith('#')` 直接跳过，
    # 于是「短标题开头」的文章全文没有 H1 —— 预览里最大标题只有 h2，层级被压平，
    # 识别结构条里的「大标题」恒为 0（用户实测反馈）。
    # 现规则：首行若是普通标题文本 → 直接加 #（各非保守模式，沿用原行为）；
    #        首行若已被规则标为 ##~###### → 升为 #（仅 auto/longform 自动分层模式——
    #        tutorial 模式首行多是「准备工作」这类小节标签，强行升为文章标题会误导层级）。
    # 例外：原文首行本身就是用户手写的 Markdown 标题（如「## 保留标题」）→ 尊重作者显式层级，不动。
    raw_first = next((l.strip() for l in lines if l.strip()), '')
    if mode != 'conservative' and not re.match(r'^#{1,6}\s', raw_first):
        for j, line in enumerate(result):
            if line.strip():
                s = line.strip()
                if s.startswith(('>', '-', '*', '```', '|')):
                    break
                m_head = re.match(r'^#{1,6}\s+(.+)$', s)
                if m_head and mode in ('auto', 'longform'):
                    result[j] = f'# {m_head.group(1).strip()}'
                elif (not m_head and '：' not in s and ':' not in s
                      and _looks_like_title(s, is_first_line=True)):
                    # 「标签：值」行（联系部门：公关部）是元信息，不是标题 —— 与
                    # 「短行标题检测」的既有判定保持一致（test_preprocess_contact_line_not_heading）
                    result[j] = f'# {s}'
                break

    return '\n'.join(result)


def split_paragraphs(text: str) -> list:
    """按空行切分自然段（段内换行保留）"""
    return [p.strip() for p in re.split(r'\n\s*\n', text.strip()) if p.strip()]


def apply_structure(paragraphs: list, plan: dict) -> str:
    """把 AI 的结构决策套用到原文段落上：只插入 Markdown 标记，正文一字不改。

    plan = {"title": 段号,
            "sections": [{"heading": str, "start": 段号, "end": 段号}],
            "lists":    [{"start": 段号, "end": 段号}],
            "bold":     [{"p": 段号, "words": [原文中已有的词]}]}

    LLM 输出属系统边界：越界段号 / 区间重叠 / 词不在原文中，一律忽略该项，不报错、不丢正文。
    """
    n = len(paragraphs)
    if n == 0:
        return ""

    def _idx(value):
        if isinstance(value, bool) or not isinstance(value, int):
            return None
        return value if 0 <= value < n else None

    title_idx = _idx(plan.get("title"))
    if title_idx is None:
        title_idx = 0

    headings = {}
    last_end = -1
    for item in plan.get("sections") or []:
        if not isinstance(item, dict):
            continue
        heading = str(item.get("heading") or "").strip().strip('#').strip()
        start, end = _idx(item.get("start")), _idx(item.get("end"))
        if not heading or start is None or end is None or end < start or start <= last_end:
            continue
        headings[start] = heading
        last_end = end

    list_idx = set()
    for item in plan.get("lists") or []:
        if not isinstance(item, dict):
            continue
        start, end = _idx(item.get("start")), _idx(item.get("end"))
        if start is None or end is None or end < start:
            continue
        list_idx.update(range(start, end + 1))

    # 箭头行 / 项目符号行属规则可确定的清单，恒定转换，不依赖 AI 是否标注
    for i, para in enumerate(paragraphs):
        if i != title_idx and _to_list_items(para):
            list_idx.add(i)

    bold_map = {}
    for item in plan.get("bold") or []:
        if not isinstance(item, dict):
            continue
        p = _idx(item.get("p"))
        if p is None or p == title_idx or not isinstance(item.get("words"), list):
            continue
        for word in item["words"]:
            if isinstance(word, str) and 1 < len(word) <= 20 and word in paragraphs[p]:
                bold_map.setdefault(p, []).append(word)

    parts = []
    for i, para in enumerate(paragraphs):
        body = para
        for word in bold_map.get(i, []):
            body = body.replace(word, f'**{word}**', 1)
        if i in headings:
            parts.append(f'## {headings[i]}')
        if i == title_idx:
            first, _, rest = body.partition('\n')
            parts.append(f'# {first.strip()}')
            if rest.strip():
                parts.append(rest.strip())
        elif i in list_idx:
            lines = _to_list_items(para)
            if lines:
                for word in bold_map.get(i, []):
                    for k, line in enumerate(lines):
                        if word in line:
                            lines[k] = line.replace(word, f'**{word}**', 1)
                            break
                parts.append('\n'.join(lines))
            else:
                parts.append(body)
        else:
            parts.append(body)

    return '\n\n'.join(parts)
