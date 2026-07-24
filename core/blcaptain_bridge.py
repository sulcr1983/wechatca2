#!/usr/bin/env python3
"""
BLCaptain Bridge — blcaptain-style-skill 集成适配层
=====================================================
职责：将用户文本通过 blcaptain CLI 生成小红书封面图。

工作流（纯本地，零 AI 调用）：
  文本 → plan.mjs(正则规则) → brief.json → 注入本地图片 → engine.mjs → Playwright截图 → PNG
"""

import json
import os
import subprocess
import tempfile
import logging
from pathlib import Path

logger = logging.getLogger(__name__)

STYLE_MAP = {
    "sp-mist": "sp-mist",
    "sp-warm": "sp-warm",
    "sp-coastal": "sp-coastal",
    "sp-night": "sp-night",
    "sp-hearth": "sp-hearth",
    "sl-blue": "sl-blue",
    "sl-mint": "sl-mint",
    "sl-coral": "sl-coral",
    "sl-lime": "sl-lime",
    "mist": "sp-mist",
    "warm": "sp-warm",
    "blue": "sl-blue",
    "mint": "sl-mint",
}


class BLCaptainBridge:
    def __init__(self, blcaptain_dir: str | None = None, node_bin: str = "node"):
        if blcaptain_dir is None:
            blcaptain_dir = Path(__file__).resolve().parent.parent / "blcaptain-style-skill"
        self.blcaptain_dir = Path(blcaptain_dir)
        self.cli = self.blcaptain_dir / "bin" / "blcaptain-style.mjs"
        self.node_bin = node_bin

        if not self.cli.exists():
            raise FileNotFoundError(f"BLCaptain CLI not found: {self.cli}")

    def _run(self, args: list, timeout: int = 120, cwd: str | None = None) -> subprocess.CompletedProcess:
        cmd = [self.node_bin, str(self.cli)] + args
        logger.debug("BLCaptain: %s", " ".join(cmd))
        result = subprocess.run(
            cmd, capture_output=True, text=True, timeout=timeout,
            cwd=cwd or str(self.blcaptain_dir),
            encoding="utf-8",
            env={**os.environ, "PYTHONIOENCODING": "utf-8"},
        )
        if result.returncode != 0:
            stderr = (result.stderr or "").strip()
            stdout = (result.stdout or "").strip()
            raise RuntimeError(f"BLCaptain failed: {stderr or stdout}")
        return result

    def _pick_stock_image(self) -> str:
        """从项目 public/images/ 获取库存图"""
        stock_dir = Path(__file__).resolve().parent.parent / "public" / "images"
        images = sorted(stock_dir.glob("*.jpg")) + sorted(stock_dir.glob("*.png"))
        if images:
            return str(images[0])
        raise FileNotFoundError(f"No stock images found in {stock_dir}")

    def generate(self, text: str, style: str = "sp-mist", output_dir: str | None = None) -> dict:
        style_id = STYLE_MAP.get(style, style)

        if output_dir is None:
            output_dir = tempfile.mkdtemp(prefix="blcaptain_")
        os.makedirs(output_dir, exist_ok=True)

        brief_path = os.path.join(output_dir, "brief.json")

        # Step 1: plan — 文本 → brief.json
        with tempfile.NamedTemporaryFile(
            mode="w", suffix=".md", delete=False, encoding="utf-8"
        ) as f:
            f.write(text)
            source_path = f.name

        try:
            self._run(
                ["plan", source_path, "--out", brief_path, "--style", style_id, "--format", "xhs"],
                timeout=30,
            )
        finally:
            os.unlink(source_path)

        # Step 2: 注入本地图片（BLCaptain 封面必须有图）
        with open(brief_path, "r", encoding="utf-8") as f:
            brief = json.load(f)

        stock = ""
        for card in brief.get("cards", []):
            if card.get("imageRequest"):
                if not stock:
                    stock = self._pick_stock_image()
                card["image"] = {
                    "src": stock.replace("\\", "/"),
                    "position": "center 30%",
                    "provenance": "[local-stock-image]",
                }

        with open(brief_path, "w", encoding="utf-8") as f:
            json.dump(brief, f, ensure_ascii=False, indent=2)

        # Step 3: build — brief.json → index.html
        self._run(
            ["build", brief_path, "--out", output_dir],
            timeout=60,
        )

        # Step 4: render — index.html → PNGs
        result = self._run(
            ["render", output_dir],
            timeout=120,
        )

        # blcaptain 把 PNG 输出到 output_dir/output/ 子目录
        png_dir = os.path.join(output_dir, "output")
        images = []
        if os.path.isdir(png_dir):
            for fname in sorted(os.listdir(png_dir)):
                if fname.lower().endswith(".png"):
                    images.append({
                        "file": fname,
                        "path": os.path.join(png_dir, fname),
                        "type": "xhs",
                    })

        return {
            "images": images,
            "output_dir": png_dir if images else output_dir,
        }

    @staticmethod
    def list_styles() -> list[dict]:
        return [
            {"id": "sp-mist", "name": "SP-01 雾野", "group": "静纸 · Still Paper"},
            {"id": "sp-warm", "name": "SP-02 暖书房", "group": "静纸 · Still Paper"},
            {"id": "sp-coastal", "name": "SP-03 海岸", "group": "静纸 · Still Paper"},
            {"id": "sp-night", "name": "SP-04 夜纹", "group": "静纸 · Still Paper"},
            {"id": "sp-hearth", "name": "SP-05 炉台", "group": "静纸 · Still Paper"},
            {"id": "sl-blue", "name": "SL-01 电蓝", "group": "实证 · Signal Proof"},
            {"id": "sl-mint", "name": "SL-02 石墨薄荷", "group": "实证 · Signal Proof"},
            {"id": "sl-coral", "name": "SL-03 安全珊瑚", "group": "实证 · Signal Proof"},
            {"id": "sl-lime", "name": "SL-04 酸性青柠", "group": "实证 · Signal Proof"},
        ]
