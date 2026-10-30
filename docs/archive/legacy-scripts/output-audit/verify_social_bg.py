#!/usr/bin/env python3
"""有头验证：小红书封面一键生成 + 自动联网底图 + 来源署名。"""
import os, sys, json
from pathlib import Path
from playwright.sync_api import sync_playwright

OUT = Path("output/e2e_audit/social_bg_shots")
OUT.mkdir(parents=True, exist_ok=True)
URL = "http://127.0.0.1:5000"

TEXT = "周末去一家很棒的咖啡店打卡，分享手冲咖啡的仪式感"

errors = []
with sync_playwright() as p:
    browser = p.chromium.launch(headless=False)
    page = browser.new_page(viewport={"width": 1440, "height": 900})
    page.on("console", lambda m: errors.append(m.text) if m.type == "error" else None)
    page.on("pageerror", lambda e: errors.append(str(e)))

    page.goto(URL, wait_until="networkidle")

    # 1) 切到小红书页
    page.click('.tab-btn[data-page="social"]')
    # 2) 选归藏组（默认 active，保险点一下）
    page.click('.style-tab[data-group="guizang"]')
    page.wait_for_selector('#social-tpl-grid .tpl-mini', timeout=8000)
    # 3) 选第一个模板（editorial）
    page.click('#social-tpl-grid .tpl-mini')
    # 4) 填文案
    page.fill('#social-text', TEXT)
    # 5) 一键生成
    page.click('#btn-generate-cover')
    # 6) 等真实结果图出现（D-1 修复：真实 <img> 非色块）
    page.wait_for_selector('#results-list .result-card img', timeout=40000)
    page.wait_for_timeout(800)

    # 读来源署名
    credit = page.text_content('#bg-credit')
    print("[credit]", credit.strip() if credit else "(none)")

    # 截图：结果画廊区
    page.locator('.social-results').screenshot(path=str(OUT / "results_gallery.png"))
    # 截图：单张结果卡（含真实底图）
    page.locator('#results-list .result-card').first.screenshot(path=str(OUT / "result_card.png"))
    # 打开 Lightbox 看大图
    page.click('#results-list .result-card')
    page.wait_for_selector('#lightbox.show', timeout=5000)
    page.wait_for_timeout(500)
    page.locator('#lightbox').screenshot(path=str(OUT / "lightbox_full.png"))

    # 全页
    page.screenshot(path=str(OUT / "social_page.png"), full_page=False)

    browser.close()

print("[console errors]", errors)
print("DONE")
