"""批量恢复主题字体设置"""
import json
from pathlib import Path

themes_dir = Path(__file__).parent.parent / "assets" / "themes"

FONT_MAP = {
    "serif": "Georgia, 'Times New Roman', 'PingFang SC', serif",
    "mono": "'Courier New', 'PingFang SC', monospace",
    "chinese": "'STSong', 'SimSun', 'PingFang SC', serif",
    "modern": "-apple-system, BlinkMacSystemFont, 'Segoe UI', 'PingFang SC', 'Microsoft YaHei', sans-serif",
    "default": "-apple-system, BlinkMacSystemFont, 'Segoe UI', 'PingFang SC', 'Microsoft YaHei', sans-serif",
}

CLASSIFICATION = {
    "serif": ["vogue", "newspaper", "magazine", "editorial", "broadsheet", "monocle",
              "coffee-house", "craft-paper", "soft-paper", "terracotta", "ink",
              "contract", "wechat-native", "sspai"],
    "mono": ["terminal-green", "dot-grid"],
    "chinese": ["chinese"],
    "modern": ["cyber-neon", "bauhaus", "bytedance", "cubic", "aurora",
               "executive", "github", "midnight", "sports"],
    "default": ["bold-blue", "bold-green", "bold-navy", "bullet-journal",
                "elegant-blue", "elegant-green", "elegant-navy",
                "focus-blue", "focus-gold", "focus-red",
                "fresh-card", "ocean-card", "warm-card",
                "lavender-dream", "mint-fresh", "morning-dew", "pure-white",
                "sakura", "sunset-amber", "sunset-blend", "sunset-gold",
                "minimal-blue", "minimal-gold", "minimal-gray", "minimal-navy", "minimal-red",
                "autumn-leaf"],
}

updated = 0
skipped = 0

for f in sorted(themes_dir.glob("*.json")):
    data = json.loads(f.read_text(encoding="utf-8"))
    styles = data.get("styles", {})
    p_style = styles.get("p", {})

    # 如果已有 font_family，跳过
    if "font_family" in p_style:
        skipped += 1
        continue

    # 确定分类
    category = "default"
    for cat, items in CLASSIFICATION.items():
        if f.stem in items:
            category = cat
            break

    # 根据描述微调
    desc = data.get("description", "").lower()
    if "衬线" in desc or "georgia" in desc or "times" in desc or "宋体" in desc:
        category = "serif"
    elif "等宽" in desc or "courier" in desc or "终端" in desc or "monospace" in desc:
        category = "mono"
    elif "楷体" in desc or "书法" in desc or ("传统" in desc and "中文" in desc):
        category = "chinese"

    font = FONT_MAP.get(category, FONT_MAP["default"])

    # 添加 font_family 到 p 样式
    p_style["font_family"] = font
    styles["p"] = p_style
    data["styles"] = styles

    # 写回文件
    f.write_text(json.dumps(data, ensure_ascii=False, indent=2), encoding="utf-8")
    updated += 1
    print(f"  ✓ {f.stem}: 添加 {category} 字体")

print(f"\n完成: 更新了 {updated} 个主题, 跳过了 {skipped} 个已有字体的主题")
