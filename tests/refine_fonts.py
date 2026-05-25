"""基于行业最佳实践优化主题字体设置"""
import json
from pathlib import Path

themes_dir = Path(__file__).parent.parent / "assets" / "themes"

# 更精致的字体映射，参考 doocs/md、wechat-format 等优秀项目
FONT_MAP = {
    "serif": "'Noto Serif SC', 'Source Han Serif SC', 'STSong', 'SimSun', 'Georgia', 'Times New Roman', serif",
    "serif_elegant": "'Noto Serif SC', 'Source Han Serif SC', 'STSong', 'SimSun', 'Georgia', serif",
    "mono": "'JetBrains Mono', 'Fira Code', 'Courier New', 'Noto Sans SC', monospace",
    "mono_retro": "'Courier New', 'SimSun', monospace",
    "chinese": "'Noto Serif SC', 'Source Han Serif SC', 'STSong', 'SimSun', 'FangSong', serif",
    "modern": "-apple-system, BlinkMacSystemFont, 'Segoe UI', 'PingFang SC', 'Hiragino Sans GB', 'Microsoft YaHei', 'Noto Sans SC', sans-serif",
    "modern_clean": "-apple-system, 'PingFang SC', 'Microsoft YaHei', 'Noto Sans SC', sans-serif",
    "default": "-apple-system, BlinkMacSystemFont, 'Segoe UI', 'PingFang SC', 'Hiragino Sans GB', 'Microsoft YaHei', 'Noto Sans SC', sans-serif",
}

# 更细致的分类
CLASSIFICATION = {
    # 高端衬线体 - 杂志/报纸/文艺
    "serif": ["vogue", "newspaper", "magazine", "editorial", "broadsheet", "monocle",
              "coffee-house", "craft-paper", "soft-paper", "ink", "contract",
              "wechat-native", "sspai", "executive"],
    # 中文传统 - 古风/书法
    "chinese": ["chinese", "terracotta"],
    # 等宽字体 - 终端/代码/复古
    "mono": ["terminal-green", "dot-grid"],
    # 现代无衬线 - 科技/商务/极简
    "modern": ["cyber-neon", "bauhaus", "bytedance", "cubic", "aurora",
               "github", "midnight", "sports", "cubic"],
    # 清新无衬线 - 生活/自然/文艺
    "modern_clean": ["bold-blue", "bold-green", "bold-navy",
                     "elegant-blue", "elegant-green", "elegant-navy",
                     "focus-blue", "focus-gold", "focus-red",
                     "fresh-card", "ocean-card", "warm-card",
                     "lavender-dream", "mint-fresh", "morning-dew", "pure-white",
                     "sakura", "sunset-amber", "sunset-blend", "sunset-gold",
                     "minimal-blue", "minimal-gold", "minimal-gray", "minimal-navy", "minimal-red",
                     "autumn-leaf", "bullet-journal"],
}

updated = 0

for f in sorted(themes_dir.glob("*.json")):
    data = json.loads(f.read_text(encoding="utf-8"))
    styles = data.get("styles", {})
    p_style = styles.get("p", {})

    # 确定分类
    category = "default"
    for cat, items in CLASSIFICATION.items():
        if f.stem in items:
            category = cat
            break

    # 根据描述微调
    desc = data.get("description", "").lower()
    if "衬线" in desc or "georgia" in desc or "times" in desc or "宋体" in desc or "报纸" in desc or "杂志" in desc:
        category = "serif"
    elif "等宽" in desc or "courier" in desc or "终端" in desc or "monospace" in desc or "代码" in desc:
        category = "mono"
    elif "楷体" in desc or "书法" in desc or ("传统" in desc and "中文" in desc) or "古风" in desc:
        category = "chinese"
    elif "科技" in desc or "未来" in desc or "极客" in desc or "赛博" in desc:
        category = "modern"

    font = FONT_MAP.get(category, FONT_MAP["default"])

    # 更新 font_family
    old_font = p_style.get("font_family", "")
    if old_font != font:
        p_style["font_family"] = font
        styles["p"] = p_style
        data["styles"] = styles
        f.write_text(json.dumps(data, ensure_ascii=False, indent=2), encoding="utf-8")
        updated += 1
        print(f"  ✓ {f.stem}: {old_font[:40] if old_font else '(无)'} → {font[:40]}...")

print(f"\n完成: 更新了 {updated} 个主题的字体设置")
