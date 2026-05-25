"""分析所有主题的字体特征"""
import json
from pathlib import Path

themes_dir = Path(__file__).parent.parent / "assets" / "themes"

# 字体映射规则
FONT_MAP = {
    "serif": "Georgia, 'Times New Roman', 'PingFang SC', serif",
    "mono": "'Courier New', 'PingFang SC', monospace",
    "chinese": "'STSong', 'SimSun', 'PingFang SC', serif",
    "modern": "-apple-system, BlinkMacSystemFont, 'Segoe UI', 'PingFang SC', 'Microsoft YaHei', sans-serif",
    "default": "-apple-system, BlinkMacSystemFont, 'Segoe UI', 'PingFang SC', 'Microsoft YaHei', sans-serif",
}

CLASSIFICATION = {
    # 衬线体/杂志风
    "serif": ["vogue", "newspaper", "magazine", "editorial", "broadsheet", "monocle",
              "coffee-house", "craft-paper", "soft-paper", "terracotta", "ink",
              "contract", "wechat-native"],
    # 等宽/终端风
    "mono": ["terminal-green", "dot-grid"],
    # 中文传统风
    "chinese": ["chinese"],
    # 现代/科技风
    "modern": ["cyber-neon", "bauhaus", "bytedance", "cubic", "aurora", "sspai",
               "executive", "github", "midnight", "sports"],
    # 默认无衬线
    "default": ["bold-blue", "bold-green", "bold-navy", "bullet-journal",
                "elegant-blue", "elegant-green", "elegant-navy",
                "focus-blue", "focus-gold", "focus-red",
                "fresh-card", "ocean-card", "warm-card",
                "lavender-dream", "mint-fresh", "morning-dew", "pure-white",
                "sakura", "sunset-amber", "sunset-blend", "sunset-gold",
                "minimal-blue", "minimal-gold", "minimal-gray", "minimal-navy", "minimal-red",
                "autumn-leaf"],
}

print(f"{'文件名':<20} {'名称':<12} {'当前有字体':<8} {'推荐分类':<10} {'推荐字体'}")
print("-" * 100)

for f in sorted(themes_dir.glob("*.json")):
    data = json.loads(f.read_text(encoding="utf-8"))
    name = data.get("name", "")
    desc = data.get("description", "")
    styles = data.get("styles", {})
    p_style = styles.get("p", {})
    has_font = "font_family" in p_style

    # 确定分类
    category = "default"
    for cat, items in CLASSIFICATION.items():
        if f.stem in items:
            category = cat
            break

    # 根据描述微调
    desc_lower = desc.lower()
    if "衬线" in desc or "georgia" in desc_lower or "times" in desc_lower or "宋体" in desc:
        category = "serif"
    elif "等宽" in desc or "courier" in desc_lower or "终端" in desc or "monospace" in desc_lower:
        category = "mono"
    elif "楷体" in desc or "书法" in desc or ("传统" in desc and "中文" in desc):
        category = "chinese"

    font = FONT_MAP.get(category, FONT_MAP["default"])
    print(f"{f.stem:<20} {name:<12} {'是' if has_font else '否':<8} {category:<10} {font[:50]}...")
