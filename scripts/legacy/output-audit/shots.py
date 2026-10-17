#!/usr/bin/env python3
"""审查台截图（一次性验收工具）：钢印全族 + 每族 茶青 完整卡片"""
import pathlib
import sys

ROOT = pathlib.Path(__file__).resolve().parents[2]
sys.path.insert(0, str(ROOT))

from playwright.sync_api import sync_playwright  # noqa: E402
from core.browser_utils import launch_browser  # noqa: E402

OUT = pathlib.Path(__file__).resolve().parent
url = (OUT / "six-families.html").resolve().as_uri()

with sync_playwright() as p:
    b = launch_browser(p, headless=True)
    pg = b.new_page(viewport={"width": 1520, "height": 1000})
    pg.goto(url)
    pg.wait_for_timeout(600)
    secs = pg.query_selector_all("section.fam")
    secs[0].screenshot(path=str(OUT / "shot-r1-stamp.png"))
    for fam in ["stamp", "minimal", "biz", "letter", "night", "feast"]:
        card = pg.query_selector(f'.card:has(.cid:text-is("su-{fam}-teal"))')
        card.screenshot(path=str(OUT / f"card-{fam}-teal.png"))
    print("done")
    b.close()
