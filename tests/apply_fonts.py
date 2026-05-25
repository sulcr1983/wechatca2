import json
import os

themes_dir = "assets/themes"

font_map = {
    "newspaper": {"p": "Georgia, 'Times New Roman', serif", "h1": "Georgia, 'Times New Roman', serif", "h2": "Georgia, 'Times New Roman', serif"},
    "magazine": {"p": "Georgia, 'Times New Roman', serif", "h1": "Georgia, 'Times New Roman', serif"},
    "chinese": {"p": "'STSong', 'SimSun', serif", "h1": "'KaiTi', 'STKaiti', serif", "h2": "'KaiTi', 'STKaiti', serif"},
    "ink": {"p": "'STSong', 'SimSun', serif", "h1": "'KaiTi', 'STKaiti', serif"},
    "coffee-house": {"p": "'Georgia', 'Times New Roman', serif", "h1": "'Georgia', serif"},
    "github": {"p": "-apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif", "code": "'SF Mono', Consolas, monospace"},
    "sspai": {"p": "-apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif"},
    "bytedance": {"p": "-apple-system, BlinkMacSystemFont, 'PingFang SC', sans-serif"},
    "midnight": {"p": "-apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif"},
    "bauhaus": {"p": "'Helvetica Neue', Arial, sans-serif"},
    "sports": {"p": "'Helvetica Neue', Arial, sans-serif"},
    "terracotta": {"p": "'Georgia', 'Times New Roman', serif"},
    "mint-fresh": {"p": "-apple-system, 'PingFang SC', sans-serif"},
    "lavender-dream": {"p": "-apple-system, 'PingFang SC', sans-serif"},
    "sunset-amber": {"p": "'Georgia', 'Times New Roman', serif"},
    "bold-blue": {"p": "-apple-system, 'PingFang SC', sans-serif"},
    "bold-green": {"p": "-apple-system, 'PingFang SC', sans-serif"},
    "bold-navy": {"p": "-apple-system, 'PingFang SC', sans-serif"},
    "elegant-blue": {"p": "'Georgia', 'Times New Roman', serif"},
    "elegant-green": {"p": "'Georgia', 'Times New Roman', serif"},
    "elegant-navy": {"p": "'Georgia', 'Times New Roman', serif"},
    "focus-blue": {"p": "-apple-system, 'PingFang SC', sans-serif"},
    "focus-gold": {"p": "'Georgia', 'Times New Roman', serif"},
    "focus-red": {"p": "-apple-system, 'PingFang SC', sans-serif"},
    "fresh-card": {"p": "-apple-system, 'PingFang SC', sans-serif"},
    "ocean-card": {"p": "-apple-system, 'PingFang SC', sans-serif"},
    "warm-card": {"p": "-apple-system, 'PingFang SC', sans-serif"},
    "minimal-blue": {"p": "-apple-system, 'PingFang SC', sans-serif"},
    "minimal-gold": {"p": "'Georgia', 'Times New Roman', serif"},
    "minimal-gray": {"p": "-apple-system, 'PingFang SC', sans-serif"},
    "minimal-navy": {"p": "-apple-system, 'PingFang SC', sans-serif"},
    "minimal-red": {"p": "-apple-system, 'PingFang SC', sans-serif"},
    "wechat-native": {"p": "'PingFang SC', 'Microsoft YaHei', sans-serif"},
}

for filename in os.listdir(themes_dir):
    if filename.endswith(".json"):
        name = filename[:-5]
        filepath = os.path.join(themes_dir, filename)
        
        with open(filepath, 'r', encoding='utf-8') as f:
            theme = json.load(f)
        
        fonts = font_map.get(name, {"p": "-apple-system, BlinkMacSystemFont, 'Segoe UI', 'PingFang SC', sans-serif"})
        
        if "p" in fonts and "styles" in theme and "p" in theme["styles"]:
            theme["styles"]["p"]["font_family"] = fonts["p"]
        
        if "h1" in fonts and "styles" in theme and "h1" in theme["styles"]:
            theme["styles"]["h1"]["font_family"] = fonts["h1"]
        
        if "h2" in fonts and "styles" in theme and "h2" in theme["styles"]:
            theme["styles"]["h2"]["font_family"] = fonts["h2"]
        
        if "styles" in theme and "h3" in theme["styles"]:
            theme["styles"]["h3"]["font_family"] = fonts.get("h3", fonts.get("h1", fonts.get("p", "-apple-system, sans-serif")))
        
        with open(filepath, 'w', encoding='utf-8') as f:
            json.dump(theme, f, ensure_ascii=False, indent=2)
        
        print(f"Updated {filename} with font_family")

print("\nFonts applied to all themes!")