"""微信公众号草稿箱发布工具（Web 模式）

提供微信 API 调用函数，供 Flask 后端使用：
- upload_permanent_material: 上传永久素材
- filter_html_images: 过滤正文图片
- push_to_draft: 推送到草稿箱
"""

import json
import re
from pathlib import Path

import requests


def upload_permanent_material(token: str, image_bytes: bytes, filename: str = "cover.png") -> str | None:
    """上传图片到永久素材库，返回 media_id"""
    url = f"https://api.weixin.qq.com/cgi-bin/material/add_material?access_token={token}&type=image"
    ext = Path(filename).suffix.lower()
    content_type = {
        ".jpg": "image/jpeg",
        ".jpeg": "image/jpeg",
        ".png": "image/png",
        ".gif": "image/gif",
    }.get(ext, "image/png")
    try:
        files = {"media": (filename, image_bytes, content_type)}
        resp = requests.post(url, files=files, timeout=30)
        resp.raise_for_status()
        data = resp.json()
        return data.get("media_id")
    except Exception:
        return None


def filter_html_images(html: str) -> tuple[str, int]:
    """移除 HTML 中的 <img> 标签。返回 (清洗后的HTML, 移除图片数量)"""
    count = len(re.findall(r"<img[^>]*/?>", html))
    cleaned = re.sub(r"<img[^>]*/?>", "", html)
    return cleaned, count


def _truncate_to_bytes(text: str, max_bytes: int = 64) -> str:
    """按 UTF-8 字节数截断，不截断多字节字符"""
    if not text:
        return text
    encoded = text.encode("utf-8")
    if len(encoded) <= max_bytes:
        return text
    while len(encoded) > max_bytes:
        text = text[:-1]
        encoded = text.encode("utf-8")
    return text


def push_to_draft(token: str, title: str, html_content: str, digest: str = "", thumb_media_id: str = "") -> str | dict:
    """推送到草稿箱。成功返回 media_id 字符串，失败返回 dict 包含 errcode 和 errmsg"""
    url = f"https://api.weixin.qq.com/cgi-bin/draft/add?access_token={token}"
    title = title[:64]
    digest = _truncate_to_bytes(digest, 64)
    article = {
        "title": title,
        "content": html_content,
        "digest": digest,
        "need_open_comment": 0,
        "only_fans_can_comment": 0,
    }
    if thumb_media_id:
        article["thumb_media_id"] = thumb_media_id
    data = {"articles": [article]}
    print(f"[PUSH BODY] {json.dumps(data, ensure_ascii=False)}")
    body = json.dumps(data, ensure_ascii=False).encode("utf-8")
    resp = requests.post(url, data=body, headers={"Content-Type": "application/json"}, timeout=30)
    resp.raise_for_status()
    result = resp.json()
    if "media_id" in result:
        return result["media_id"]
    return result
