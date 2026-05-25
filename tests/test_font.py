"""测试模板字体是否正确注入"""
import sys
from pathlib import Path
sys.path.insert(0, str(Path(__file__).parent.parent))

from core.format_engine import convert_markdown_to_wechat_html

test_md = """# 标题一

这是正文段落，测试字体是否正确显示。

## 标题二

**粗体文字**和*斜体文字*。"""

# 测试 vogue 主题（有 Georgia 字体）
theme_path = Path(__file__).parent.parent / "assets" / "themes" / "vogue.json"
html = convert_markdown_to_wechat_html(test_md, str(theme_path))

# 检查是否有 font-family
has_font = 'font-family' in html
print(f"Has font-family: {has_font}")

# 提取所有 font-family
import re
fonts = re.findall(r'font-family:([^;"]+)', html)
print(f"Fonts found: {fonts}")

# 打印部分 HTML
print("\nHTML snippet (first 800 chars):")
print(html[:800])
