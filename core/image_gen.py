import io
import os
from dotenv import load_dotenv

load_dotenv()

import requests
from PIL import Image, ImageDraw, ImageFont

from core.ai_client import call_llm

IMAGE_GEN_BASE_URL = os.getenv("IMAGE_GEN_BASE_URL") or os.getenv("AI_URL", "")
IMAGE_GEN_API_KEY = os.getenv("IMAGE_GEN_API_KEY") or os.getenv("AI_API_KEY", "")
IMAGE_GEN_MODEL = os.getenv("IMAGE_GEN_MODEL") or os.getenv("AI_IMAGE_MODEL", "gpt-image-2")

FONT_PATH = os.path.join(os.path.dirname(__file__), "..", "assets", "fonts", "NotoSansSC-Regular.ttf")
COVER_WIDTH, COVER_HEIGHT = 900, 383


def _extract_keywords(title: str, full_text: str) -> list[str]:
    """用 LLM 提取 5-8 个英文视觉关键词"""
    prompt = f"""Extract 5-8 English visual keywords from this article for an image generation prompt.
Return only comma-separated keywords, no explanation.

Title: {title}
Text: {full_text[:2000]}"""

    result = call_llm("You are a visual keyword extractor. Return only comma-separated English keywords.", prompt)
    if not result:
        return ["modern", "clean", "professional", "minimal", "abstract"]
    keywords = [k.strip() for k in result.split(",") if k.strip()]
    return keywords[:8] if keywords else ["modern", "clean", "professional"]


def _generate_background(keywords: list[str]) -> Image.Image | None:
    """调用文生图 API 生成背景图，失败返回 None"""
    if not IMAGE_GEN_BASE_URL or not IMAGE_GEN_API_KEY:
        return None

    prompt = f"Clean professional background for article cover, {', '.join(keywords)}, minimalistic, modern, soft colors, no text, no letters, no words"
    try:
        resp = requests.post(
            f"{IMAGE_GEN_BASE_URL}/images/generations",
            headers={
                "Authorization": f"Bearer {IMAGE_GEN_API_KEY}",
                "Content-Type": "application/json",
            },
            json={
                "model": IMAGE_GEN_MODEL,
                "prompt": prompt,
                "n": 1,
                "size": "900x383",
            },
            timeout=30,
        )
        resp.raise_for_status()
        data = resp.json()

        img_url = None
        if "data" in data and len(data["data"]) > 0:
            img_url = data["data"][0].get("url")
        if not img_url:
            return None

        img_resp = requests.get(img_url, timeout=30)
        img_resp.raise_for_status()
        return Image.open(io.BytesIO(img_resp.content)).resize((COVER_WIDTH, COVER_HEIGHT))
    except Exception:
        return None


def _load_font(size: int) -> ImageFont.FreeTypeFont | ImageFont.ImageFont:
    try:
        return ImageFont.truetype(FONT_PATH, size)
    except Exception:
        return ImageFont.load_default()


def _draw_title_overlay(img: Image.Image, title: str) -> Image.Image:
    """在图片中央偏上叠加标题文字（白色带阴影）"""
    draw = ImageDraw.Draw(img)
    font = _load_font(42)

    max_width = COVER_WIDTH - 120
    lines = []
    current = ""
    for char in title:
        test = current + char
        if _text_width(test, font, draw) > max_width:
            lines.append(current)
            current = char
        else:
            current = test
    if current:
        lines.append(current)
    if not lines:
        lines = [title]

    line_height = 52
    total_height = len(lines) * line_height
    start_y = (COVER_HEIGHT - total_height) // 2 - 10

    for i, line in enumerate(lines):
        tw = _text_width(line, font, draw)
        x = (COVER_WIDTH - tw) // 2
        y = start_y + i * line_height
        # 阴影
        draw.text((x + 2, y + 2), line, font=font, fill=(0, 0, 0, 80))
        # 白色文字
        draw.text((x, y), line, font=font, fill=(255, 255, 255))

    return img


def _text_width(text: str, font, draw) -> int:
    bbox = draw.textbbox((0, 0), text, font=font)
    return bbox[2] - bbox[0]


def _generate_fallback(title: str) -> io.BytesIO:
    """生成纯色渐变背景 + 标题的 fallback 图片"""
    img = Image.new("RGB", (COVER_WIDTH, COVER_HEIGHT), color=(30, 115, 232))
    draw = ImageDraw.Draw(img)
    # 简单渐变效果
    for i in range(COVER_HEIGHT):
        r = 30 + int(i / COVER_HEIGHT * 30)
        g = 115 + int(i / COVER_HEIGHT * 30)
        b = 232 - int(i / COVER_HEIGHT * 40)
        draw.line([(0, i), (COVER_WIDTH, i)], fill=(min(r, 255), min(g, 255), max(b, 0)))

    img = _draw_title_overlay(img, title)
    buf = io.BytesIO()
    img.save(buf, format="PNG")
    buf.seek(0)
    return buf


def generate_cover(title: str, full_text: str) -> bytes:
    """生成标题图，返回 PNG bytes

    流程：LLM提取关键词 → 文生图API → 叠加标题 → 失败则fallback纯色背景
    """
    keywords = _extract_keywords(title, full_text)
    bg = _generate_background(keywords)

    if bg is not None:
        img = _draw_title_overlay(bg, title)
    else:
        buf = _generate_fallback(title)
        return buf.read()

    buf = io.BytesIO()
    img.save(buf, format="PNG")
    buf.seek(0)
    return buf.read()
