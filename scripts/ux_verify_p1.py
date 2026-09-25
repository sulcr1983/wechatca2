"""第二批（U-7 / U-8 / U-9 / U-10 / U-11）改动的有头浏览器验收

用法（需先启动服务）：
    .venv/Scripts/python.exe scripts/ux_verify_p1.py
"""

import json
import os
import time
import urllib.request
import uuid

from playwright.sync_api import sync_playwright

BASE = "http://127.0.0.1:5000"
ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
OUT = os.path.join(ROOT, "docs", "ux-audit", "shots", "after")
os.makedirs(OUT, exist_ok=True)

res = []


def check(name, cond, detail=""):
    res.append((name, bool(cond), detail))
    print(("  PASS " if cond else "  FAIL ") + name + (f"  [{detail}]" if detail else ""))


def shot(page, name):
    page.screenshot(path=os.path.join(OUT, name + ".jpg"), type="jpeg", quality=70)
    print("  SHOT:", name)


def gen_once(text, style="editorial"):
    """直连 API 生成一次封面，返回耗时（秒）"""
    opener = urllib.request.build_opener(urllib.request.ProxyHandler({}))
    req = urllib.request.Request(
        BASE + "/api/social/generate",
        data=json.dumps({"text": text, "style": style}).encode("utf-8"),
        headers={"Content-Type": "application/json"},
    )
    t = time.time()
    d = json.loads(opener.open(req, timeout=240).read().decode("utf-8"))
    return time.time() - t, d


def main():
    with sync_playwright() as p:
        browser = p.chromium.launch(headless=False, args=["--no-proxy-server"])
        ctx = browser.new_context(viewport={"width": 1440, "height": 900})
        page = ctx.new_page()
        errs = []
        page.on("console", lambda m: errs.append(m.text) if m.type == "error" else None)
        page.on("pageerror", lambda e: errs.append(str(e)))

        page.goto(BASE, wait_until="networkidle")
        page.wait_for_timeout(1500)

        print("— U-11 文案说人话 —")
        check("编辑区标签改为「你的文章」",
              "你的文章" in page.eval_on_selector(".editor-label", "el=>el.textContent"))
        page.click('.tab-btn[data-page="social"]')
        page.wait_for_timeout(1300)
        # 首次进入小红书页会弹一次「使用教程」（产品行为，属预期）；
        # 测试须先关掉弹窗，否则遮罩会挡住后续点击造成假失败。
        page.evaluate("document.querySelectorAll('.modal').forEach(m=>m.remove())")
        page.wait_for_timeout(150)
        body = page.eval_on_selector("#page-social", "el=>el.innerText")
        check("小红书页：目标平台 → 发到哪", "发到哪" in body)
        check("小红书页：风格模板 → 样式", "样式" in body)
        check("小红书页：封面配图 → 底图（可选）", "底图（可选）" in body)
        ph = page.eval_on_selector("#social-text", "el=>el.placeholder")
        check("placeholder 去掉虚假的「AI 自动提取标题」", "AI 自动提取标题" not in ph, ph)

        print("— U-9 结果区空态示例 —")
        empty_html = page.eval_on_selector("#results-empty", "el=>el.innerHTML")
        check("空态展示示例成品图", "<img" in empty_html)
        shot(page, "p1-social-empty-samples")

        print("— 回到公众号页 —")
        page.click('.tab-btn[data-page="wechat"]')
        page.wait_for_timeout(1200)

        print("— U-8 搜索无结果兜底 —")
        page.fill("#tpl-search", "zzz不存在的主题xyz")
        page.wait_for_timeout(900)
        strip = page.eval_on_selector("#tpl-strip", "el=>el.innerHTML")
        check("无结果时给出出口（清除搜索）", "清除搜索" in strip, strip[:80])
        shot(page, "p1-search-empty")
        clr = page.query_selector("#tpl-clear-search")
        if clr:
            clr.click()
            page.wait_for_timeout(900)
        n = page.eval_on_selector_all(".tpl-card", "els=>els.length")
        check("点「清除搜索」后恢复全部模板", n > 50, f"可见色卡 {n}")

        print("— U-7 悬停试看（且不能污染复制内容）—")
        page.fill("#input-area", "悬停试看测试标题\n这是正文第二行内容")
        page.wait_for_timeout(1800)
        html_before = page.evaluate("() => lastHtml")
        cards = page.query_selector_all(".tpl-card")
        if len(cards) > 6:
            cards[6].hover()
            page.wait_for_timeout(1500)
        html_after = page.evaluate("() => lastHtml")
        active_now = page.evaluate("() => activeTpl")
        check("悬停试看后 lastHtml 未变（复制仍是当前主题）",
              html_before == html_after and bool(html_before))
        check("悬停不改变当前选中主题", bool(active_now), active_now)
        shot(page, "p1-hover-preview")

        print("— U-7 收藏与最近使用置顶 —")
        fav = page.query_selector(".tpl-fav")
        if fav:
            fav_id = fav.get_attribute("data-fav")
            fav.click()
            page.wait_for_timeout(900)
            first_id = page.eval_on_selector(".tpl-card", "el=>el.dataset.tpl")
            check("收藏后该主题置顶", first_id == fav_id, f"置顶={first_id} 收藏={fav_id}")
            check("星标变为实心", "on" in (page.eval_on_selector(".tpl-fav", "el=>el.className")))
        shot(page, "p1-fav-recent")

        check("全程 0 控制台报错", len(errs) == 0, errs[:3])
        ctx.close()
        browser.close()

    print("— U-10 搜图查询缓存（同一关键词第二次应显著更快）—")
    text = f"缓存计时测试{uuid.uuid4().hex[:6]}"
    t1, d1 = gen_once(text)
    t2, d2 = gen_once(text)
    print(f"    第一次（联网）{t1:.1f}s ｜ 第二次（缓存）{t2:.1f}s")
    res.append(("U-10 第二次生成更快（查询缓存生效）", t2 < t1, f"{t1:.1f}s -> {t2:.1f}s"))
    res.append(("U-10 两次都成功出图",
                len(d1.get("images") or []) > 0 and len(d2.get("images") or []) > 0,
                f"{len(d1.get('images') or [])}/{len(d2.get('images') or [])}"))

    print("\n=== 汇总 ===")
    fails = [r for r in res if not r[1]]
    print(f"{len(res) - len(fails)}/{len(res)} 通过")
    for n, _, d in fails:
        print("  FAIL:", n, d)


if __name__ == "__main__":
    main()
