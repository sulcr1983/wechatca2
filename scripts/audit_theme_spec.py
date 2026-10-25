"""核对 10 套封面模板的配色/字体是否与归藏原版规范一致（只读，不改文件）。

规范来源：references/theme-presets.md
用法：.venv/Scripts/python.exe scripts/audit_theme_spec.py
"""
import re
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
TPL = ROOT / "public" / "cover-templates"

# 逐字取自 references/theme-presets.md
SPEC = {
    "editorial-ink-classic": {
        "paper": "#f3f0e8", "ink": "#0a0a0b", "muted": "#68625a",
        "accent": "#111111", "accent-soft": "#d8d2c6",
    },
    "editorial-indigo-porcelain": {
        "paper": "#f2f4f5", "ink": "#0a1f3d", "muted": "#5f6d78",
        "accent": "#315d93", "accent-soft": "#d7e1ec",
    },
    "editorial-forest-ink": {
        "paper": "#f5f1e8", "ink": "#16251b", "muted": "#5d665d",
        "accent": "#2e6b4f", "accent-soft": "#d4dfd2",
    },
    "editorial-kraft-paper": {
        "paper": "#eedfc7", "ink": "#2a1e13", "muted": "#755f49",
        "accent": "#9b5a2e", "accent-soft": "#d5b58f",
    },
    "editorial-dune": {
        "paper": "#f0e6d2", "ink": "#1f1a14", "muted": "#6f6557",
        "accent": "#8f7650", "accent-soft": "#d4c2a4",
    },
    "editorial-midnight-ink": {
        "paper": "#0e0d0c", "ink": "#ece2cf", "muted": "#9a8c75",
        "accent": "#d4a04a", "accent-soft": "#3a2a14",
    },
    "swiss-ikb": {
        "paper": "#fafaf8", "ink": "#0a0a0a", "muted": "#737373",
        "accent": "#002FA7", "accent-on": "#ffffff",
    },
    "swiss-lemon-yellow": {
        "paper": "#fafaf8", "ink": "#0a0a0a", "muted": "#737373",
        "accent": "#FFD500", "accent-on": "#0a0a0a",
    },
    "swiss-lemon-green": {
        "paper": "#fafaf8", "ink": "#0a0a0a", "muted": "#737373",
        "accent": "#C5E803", "accent-on": "#0a0a0a",
    },
    "swiss-safety-orange": {
        "paper": "#fafaf8", "ink": "#0a0a0a", "muted": "#737373",
        "accent": "#FF6B35", "accent-on": "#ffffff",
    },
}


# Swiss 系列规范里把小字灰叫 --grey-3（不是 --muted），做一次别名映射
ALIAS = {"muted": ("muted", "grey-3")}


def css_var(text: str, name: str):
    for cand in ALIAS.get(name, (name,)):
        m = re.search(rf"--{cand}:\s*(#[0-9a-fA-F]{{3,8}})", text)
        if m:
            return m.group(1)
    return None


def norm(v):
    # 去掉 # 并转小写，避免「值相同只是带不带 #」被误判成不一致
    return (v or "").lstrip("#").lower()


def main() -> int:
    problems = []
    print(f"{'模板':<28}{'变量':<12}{'规范':<10}{'实际':<10}")
    print("-" * 62)
    for name, spec in SPEC.items():
        f = TPL / name / "index.html"
        if not f.exists():
            problems.append(f"{name}: 模板文件缺失")
            continue
        txt = f.read_text(encoding="utf-8")
        for var, want in spec.items():
            got = css_var(txt, var)
            ok = norm(got) == norm(want)
            if not ok:
                problems.append(f"{name}.{var}: 规范 {want} / 实际 {got}")
                print(f"{name:<28}{var:<12}{want:<10}{str(got):<10}  ✗")
    print("-" * 62)

    # 第二段：catalog.js 的选择器色块必须如实反映模板真实配色。
    # 之前归藏两套就是栽在这里 —— 模板是对的，但界面上显示的色块是另一个颜色，
    # 用户点之前看到的东西和生成出来的东西对不上（2026-10-25）。
    catalog = (ROOT / "pwa" / "src" / "cover" / "catalog.js").read_text(encoding="utf-8")
    rows = re.findall(r"id: '([\w-]+)'[^}]*?swatch: '#(\w+)', accent: '#(\w+)'", catalog)
    print(f"\n{'模板':<28}{'色块实描':<12}{'模板 paper':<12}{'强调实描':<12}{'模板 accent'}")
    print("-" * 74)
    catalog_bad = 0
    for name, sw, acc in rows:
        f = TPL / name / "index.html"
        if not f.exists():
            continue
        txt = f.read_text(encoding="utf-8")
        paper = css_var(txt, "paper") or "?"
        accent = css_var(txt, "accent") or "?"
        ok = norm(sw) == norm(paper) and norm(acc) == norm(accent)
        if not ok:
            catalog_bad += 1
            problems.append(f"catalog {name}: swatch #{sw}≠{paper} 或 accent #{acc}≠{accent}")
        print(f"{name:<28}#{sw:<11}{paper:<12}#{acc:<11}{accent}{'' if ok else '  ✗'}")
    print("-" * 74)
    if catalog_bad:
        print(f"catalog.js 色块与模板不符：{catalog_bad} 套")

    print()
    if problems:
        print(f"不一致 {len(problems)} 处：")
        for p in problems:
            print("  ·", p)
    else:
        print("全部与规范一致 ✅")
    return 0 if not problems else 1


if __name__ == "__main__":
    raise SystemExit(main())
