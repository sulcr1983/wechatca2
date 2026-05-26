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

        # 短行标题检测
        # 孤立行：前后有空行或文件边界
        prev_empty = i == 0 or not lines[i - 1].strip()
        next_empty = i == len(lines) - 1 or not lines[i + 1].strip()
        is_isolated = prev_empty and next_empty

        has_comma = ',' in stripped or '，' in stripped

        if (
            is_isolated
            and len(stripped) <= 12
            and not stripped.startswith('\u300c')
            and not re.search(r'[。！？，、；：\u201c\u201d…\)】》！？，、；：\u201c\u201d…\)】》]$', stripped[-1])
            and not has_comma
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
