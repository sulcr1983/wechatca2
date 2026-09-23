import re

# 中文句式常见功能词 — 包含这些词的短行大概率是句子而非标题
# 注意：'的' 在标题中很常见（如"美丽的风景"），不作为独立判定词
_SENTENCE_WORDS = re.compile(
    r'(?:是|了|在|就|都|很|不|也|我|你|他|她|它|们|这|那|会|能|要|可以|已经|'
    r'因为|所以|但是|如果|虽然|而且|然后|之后|之|与|及|或|把|被|让|给|对|从|到|'
    r'应该|可能|必须|一定|怎么|怎样|怎么样|为什么|什么|哪|'
    r'效果|发展|问题|方法|内容|情况|原因|结果|作用|影响|过程|特点|优势|功能|目的|意义)'
)


def _looks_like_sentence(text: str) -> bool:
    """检测一个短文本是否更像完整句子而非标题"""
    return bool(_SENTENCE_WORDS.search(text))


# 箭头并列：A → B → C（正文里孤立的并列流程/清单）
_ARROW_RE = re.compile(r'\s*(?:→|->|➔|➜|⇒)\s*')

# 行首项目符号
_BULLET_RE = re.compile(r'^[·•●○\-*]\s*')


def _split_parallel_items(line: str):
    """箭头并列行 → 列表项；至少 3 项、每项都短、项内无逗号，否则不算清单"""
    parts = [p.strip() for p in _ARROW_RE.split(line) if p.strip()]
    if len(parts) < 3 or any(len(p) > 14 for p in parts):
        return None
    if any(('，' in p or ',' in p) for p in parts):
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


def preprocess(text: str) -> str:
    """将纯文本转为基础 Markdown，覆盖 90% 常见结构，无需 LLM 等待"""
    lines = text.strip().split('\n')
    md_lines = []
    in_code_block = False

    for i, line in enumerate(lines):
        stripped = line.strip()

        if not stripped:
            if in_code_block:
                md_lines.append('```')
                in_code_block = False
            md_lines.append('')
            continue

        # 已含 Markdown 标记的行原样保留（但 \d+\.\s 可能是序号标题，后面单独判断）
        if re.match(r'^(#{1,6}\s|>\s|-\s|\*\s|```|~~)', stripped):
            if in_code_block:
                md_lines.append('```')
                in_code_block = False
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

        # 有序号标题：一、/ 1. / (1) / ① 等
        if re.match(
            r'^[一二三四五六七八九十\d]+[、.．)]\s*.{1,40}$',
            stripped,
        ):
            md_lines.append(f'## {stripped}')
            continue

        # 并列清单：箭头行（掏手机 → 找 App → 等 App 打开 → 点开门）/ 项目符号行
        items = _to_list_items(stripped)
        if items:
            md_lines.extend(items)
            continue

        # 短行标题检测
        # 孤立行：前后有空行或文件边界
        prev_empty = i == 0 or not lines[i - 1].strip()
        next_empty = i == len(lines) - 1 or not lines[i + 1].strip()
        is_isolated = prev_empty and next_empty

        has_comma = ',' in stripped or '，' in stripped
        
        # 排除常见非标题词（单字、内容词等）
        common_non_title = {'内容', '简介', '说明', '备注', '注意', '提示', '参考', '来源', '链接'}

        if (
            is_isolated
            and len(stripped) <= 12
            and len(stripped) >= 2
            and not stripped.startswith('\u300c')
            and not re.search(r'[。！？，、；：\u201c\u201d…\)】》]$', stripped[-1])
            and not has_comma
            and stripped not in common_non_title
            and not _looks_like_sentence(stripped)
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

    # 将第一行非空内容自动作为大标题（如果尚未标记为标题）
    for i, line in enumerate(result):
        if line.strip():
            stripped = line.strip()
            # 如果第一行不是标题、引用、列表、代码块等结构化标记
            if not stripped.startswith(('#', '>', '-', '*', '```', '|')):
                result[i] = f'# {stripped}'
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
