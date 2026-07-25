#!/usr/bin/env python3
"""
联网搜图模块 — 小红书封面底图自动获取（零 AI 调用）
================================================

双轨策略（按用户选择「双轨（推荐）」）：
- 配置了环境变量 PEXELS_API_KEY → 走 Pexels（画质/相关度最佳，200 次/小时）
- 否则 → Wikimedia Commons（免 key，真·联网搜图）
- 两者都失败 / 离线 → 本地 public/images/ 智能兜底（按关键词命中文件名）

关键词提取：纯规则式（标题 + 中文话题词典映射英文搜索词），
不调用任何 LLM，符合本项目「不用 AI 就不开 AI」原则。

返回结构：
{
  "path":   "<本地缓存图片绝对路径>",
  "source": "Pexels" | "Wikimedia Commons" | "local",
  "author": "<摄影者/贡献者>",
  "license":"<许可简称>",
  "query":  "<实际用于搜索的关键词>",
}
"""

import os
import re
import json
import logging
import hashlib
from pathlib import Path
from urllib.parse import quote

import requests

logger = logging.getLogger(__name__)

# Wikimedia API 强制要求自定义 User-Agent，否则返回 403
UA = "SuperSu/1.0 (local wechat/xhs typesetting tool; +https://github.com/local/supersu)"

BASE_DIR = Path(__file__).resolve().parent.parent
CACHE_DIR = BASE_DIR / "data" / "bg_cache"
STOCK_DIR = BASE_DIR / "public" / "images"

# 中文话题 → 英文搜索词（提升 Wikimedia/Pexels 相关度，零 AI）
TOPIC_MAP = {
    "旅行": "travel", "旅游": "travel", "风景": "landscape", "山水": "mountain lake",
    "美食": "food", "咖啡": "coffee", "茶": "tea", "烘焙": "bakery", "甜点": "dessert",
    "读书": "reading", "写作": "writing", "笔记": "notebook", "手账": "journal",
    "科技": "technology", "编程": "coding", "代码": "computer", "AI": "technology",
    "健身": "fitness", "运动": "sport", "跑步": "running", "瑜伽": "yoga",
    "穿搭": "fashion", "时尚": "fashion", "美妆": "makeup",
    "职场": "office", "工作": "workspace", "效率": "productivity",
    "理财": "finance", "投资": "investment", "省钱": "saving",
    "家居": "interior", "装修": "home decor", "收纳": "organization",
    "植物": "plant", "花": "flower", "园艺": "gardening",
    "宠物": "pet", "猫": "cat", "狗": "dog",
    "亲子": "parenting", "宝宝": "baby",
    "情感": "relationship", "治愈": "cozy", "治愈系": "cozy",
    "学习": "study", "考试": "exam", "考研": "study",
    "摄影": "photography", "胶片": "film camera",
    "音乐": "music", "电影": "movie", "动漫": "anime",
    "健康": "health", "养生": "wellness", "睡眠": "sleep",
    "城市": "city", "街拍": "street", "夜景": "night city",
    "海边": "beach", "海岛": "island", "日落": "sunset", "日出": "sunrise",
    "创业": "startup", "商业": "business",
    "设计": "design", "插画": "illustration",
    "减脂": "fitness", "减肥": "diet",
    "婚礼": "wedding", "极简": "minimal",
}


# ── 关键词提取（规则式，零 AI）───────────────────────────

def extract_query(text: str) -> str:
    """从文案提取搜索关键词。优先命中中文话题词典映射到英文；否则清洗标题兜底。"""
    lines = [l.strip() for l in (text or "").splitlines() if l.strip()]
    if not lines:
        return "minimal"
    title = lines[0]

    # 1) 标题命中词典
    for cn, en in TOPIC_MAP.items():
        if cn in title:
            return en
    # 2) 全文前四句命中词典
    full = " ".join(lines[:4])
    for cn, en in TOPIC_MAP.items():
        if cn in full:
            return en
    # 3) 兜底：清洗标题作查询（去标点、截断）
    q = re.sub(r"[^\w\u4e00-\u9fff ]", " ", title).strip()
    q = re.sub(r"\s+", " ", q)
    if len(q) > 24:
        q = q[:24]
    return q or "minimal"


# ── 下载 + 缓存 ─────────────────────────────────────────

def _download(url: str, query: str) -> Path:
    """下载图片并按 query 缓存到 data/bg_cache/，命中缓存直接返回。"""
    CACHE_DIR.mkdir(parents=True, exist_ok=True)
    h = hashlib.md5(f"{query}|{url}".encode("utf-8")).hexdigest()[:12]
    ext = ".jpg"
    m = re.search(r"\.([a-zA-Z0-9]{3,4})(\?|$)", url)
    if m:
        ext = "." + m.group(1).lower()
    path = CACHE_DIR / f"{h}{ext}"
    if path.exists() and path.stat().st_size > 1000:
        return path
    r = requests.get(url, timeout=20, headers={"User-Agent": UA})
    r.raise_for_status()
    path.write_bytes(r.content)
    return path


# ── 各图源 ──────────────────────────────────────────────

def _pexels_search(query: str, api_key: str, n: int = 1) -> list[dict]:
    api = "https://api.pexels.com/v1/search"
    headers = {"Authorization": api_key}
    r = requests.get(
        api, headers=headers,
        params={"query": query, "per_page": n, "orientation": "portrait"},
        timeout=15,
    )
    r.raise_for_status()
    out = []
    for ph in r.json().get("photos", [])[:n]:
        src = ph.get("src", {}).get("large") or ph.get("src", {}).get("original")
        if not src:
            continue
        out.append({
            "thumb": src,
            "author": ph.get("photographer", ""),
            "license": "Pexels License",
            "source": "Pexels",
        })
    return out


def _wikimedia_search(query: str, n: int = 1) -> list[dict]:
    api = "https://commons.wikimedia.org/w/api.php"
    params = {
        "action": "query", "format": "json",
        "generator": "search", "gsrsearch": f"filetype:bitmap {query}",
        "gsrnamespace": "6", "gsrlimit": str(n * 3),
        "prop": "imageinfo", "iiprop": "url|extmetadata|size",
        "iiurlwidth": "1080",
    }
    r = requests.get(api, params=params, headers={"User-Agent": UA}, timeout=15)
    r.raise_for_status()
    pages = list(r.json().get("query", {}).get("pages", {}).values())
    out = []
    for p in pages:
        ii = (p.get("imageinfo") or [{}])[0]
        thumb = ii.get("thumburl") or ii.get("url")
        if not thumb:
            continue
        em = ii.get("extmetadata", {})
        artist = re.sub("<[^>]+>", "", em.get("Artist", {}).get("value", ""))[:60]
        out.append({
            "thumb": thumb,
            "author": artist or "Wikimedia contributor",
            "license": em.get("LicenseShortName", {}).get("value", "see Wikimedia"),
            "source": "Wikimedia Commons",
        })
        if len(out) >= n:
            break
    return out


def _local_fallback(query: str) -> dict | None:
    imgs = sorted(STOCK_DIR.glob("*.jpg")) + sorted(STOCK_DIR.glob("*.png"))
    if not imgs:
        return None
    for img in imgs:
        if query.lower() in img.stem.lower():
            return {"path": str(img), "source": "local", "author": "", "license": "", "query": query}
    return {"path": str(imgs[0]), "source": "local", "author": "", "license": "", "query": query}


# ── 对外主入口 ──────────────────────────────────────────

def search_background(text: str, provider: str | None = None) -> dict | None:
    """根据文案联网搜索一张相关底图，返回本地路径 + 署名信息。
    失败逐级降级：Pexels → Wikimedia → 本地。均失败返回 None。"""
    query = extract_query(text)
    logger.info("搜图关键词: %s", query)

    # 1) Pexels（有 key 时）
    key = os.getenv("PEXELS_API_KEY")
    if (provider in (None, "pexels")) and key:
        try:
            res = _pexels_search(query, key, 1)
            if res:
                p = _download(res[0]["thumb"], query)
                return {**res[0], "path": str(p), "query": query}
        except Exception as e:
            logger.warning("Pexels 搜图失败，降级 Wikimedia: %s", e)

    # 2) Wikimedia Commons（免 key）
    try:
        res = _wikimedia_search(query, 1)
        if res:
            p = _download(res[0]["thumb"], query)
            return {**res[0], "path": str(p), "query": query}
    except Exception as e:
        logger.warning("Wikimedia 搜图失败，降级本地: %s", e)

    # 3) 本地兜底
    fb = _local_fallback(query)
    if fb:
        logger.info("使用本地兜底底图: %s", fb["path"])
    return fb
