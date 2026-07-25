#!/usr/bin/env python3
"""将 xiaohu-wechat-format 的开源主题适配进本项目 public/themes/。

做法：
- 从本地已解压的源目录读取上游主题 JSON（默认 output/ext_xh_themes/xiaohu-wechat-format*/themes）。
- 命名空间：文件 id 加前缀 xh-，展示名加「XH·」，避免与现有 53 套重名（上游也有 bauhaus/bold-blue 等同名）。
- 保留/写入 source 溯源字段（上游仓库地址），尊重作者归属。
- 校验必备键 styles/colors，缺失则跳过并报告。
- 不改动上游的设计 DNA（粗野主义黑边、瑞士网格、孟菲斯、蒸汽波渐变、楷体期刊等）。

⚠️ 许可说明：上游仓库（xiaohu-wechat-format）目前没有 LICENSE 文件，
默认“保留所有权利”。本脚本仅做本地适配 + 溯源标注，不宣称原创；
若用于公开发布/商用，请先确认授权，或改用“纯灵感派生”方式重写而非复制。
"""
import json
import pathlib
import sys

ROOT = pathlib.Path(__file__).resolve().parent.parent
SRC_BASE = ROOT / "output" / "ext_xh_themes"
THEMES_DIR = ROOT / "public" / "themes"
PREFIX_ID = "xh-"
PREFIX_NAME = "XH·"
SOURCE_BASE = "https://github.com/xiaohuailabs/xiaohu-wechat-format"


def find_src_dir() -> pathlib.Path:
    cands = sorted(SRC_BASE.glob("xiaohu-wechat-format*/themes"))
    if cands:
        return cands[0]
    return SRC_BASE / "themes"


def main():
    src = find_src_dir()
    if not src.exists():
        print(f"源目录不存在: {src}\n请先下载并解压上游仓库 tarball 到 output/ext_xh_themes/")
        sys.exit(1)

    files = sorted(src.glob("*.json"))
    print(f"源主题文件: {len(files)}  (来自 {src})")

    ok = 0
    skipped = 0
    for f in files:
        name = f.stem
        try:
            data = json.loads(f.read_text(encoding="utf-8"))
        except Exception as e:
            print(f"  ! 解析失败 {name}: {e}")
            skipped += 1
            continue
        if not isinstance(data, dict) or "styles" not in data or "colors" not in data:
            print(f"  ! 缺少必备键(styles/colors)，跳过 {name}")
            skipped += 1
            continue

        # 溯源 + 命名空间
        data["source"] = data.get("source") or f"{SOURCE_BASE}/blob/main/themes/{name}.json"
        orig_name = data.get("name") or name
        data["name"] = PREFIX_NAME + orig_name
        if not data.get("description"):
            data["description"] = f"源自 xiaohu-wechat-format 开源设计（{orig_name}）"

        out = THEMES_DIR / f"{PREFIX_ID}{name}.json"
        out.write_text(json.dumps(data, ensure_ascii=False, indent=2), encoding="utf-8")
        ok += 1

    print(f"适配完成：成功 {ok} 套，跳过 {skipped} 套")
    print(f"新主题 id 前缀：{PREFIX_ID}（展示名前缀：{PREFIX_NAME}）")


if __name__ == "__main__":
    main()
