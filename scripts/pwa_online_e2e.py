#!/usr/bin/env python3
"""线上 PWA 全量有头 E2E（服务器端）。

设计原则：
- **有头**：系统 Chrome（core.browser_utils.launch_browser，headless=False），不用无头。
- **打到服务器端**：默认 https://supersu.ccwu.cc/，不是本地 dist。
- **每个按钮都点**：顶栏 / 编辑 / 预览 / 风格条 / 抽屉 / 更多菜单 / AI / 更新 / 封面 / 移动端 tabs。
- **记录点击前后**：每项输出 before → after，并截图到 output/e2e-online/。
- 报告：output/e2e-online/report.json；有 FAIL 退出码 1。

用法：
    .venv/Scripts/python.exe scripts/pwa_online_e2e.py
    .venv/Scripts/python.exe scripts/pwa_online_e2e.py --url https://supersu.ccwu.cc/
"""

from __future__ import annotations

import argparse
import json
import shutil
import sys
import time
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
OUT = ROOT / "output" / "e2e-online"
sys.path.insert(0, str(ROOT))

TEXT = "周末去海边，我把手机调成了飞行模式\n两天的沉默之后，我重新听见了海浪、风声，还有自己。"

results: list[dict] = []
shot_no = 0


def check(name: str, ok: bool, before=None, after=None, shot: str = "") -> None:
    results.append({
        "name": name,
        "ok": bool(ok),
        "before": "" if before is None else str(before)[:240],
        "after": "" if after is None else str(after)[:240],
        "shot": shot,
    })
    print(("  PASS  " if ok else "  FAIL  ") + name
          + (f"  | {str(before)[:90]} → {str(after)[:90]}" if before is not None or after is not None else "")
          + (f"  [{shot}]" if shot else ""), flush=True)


def skip(name: str, detail: str = "") -> None:
    results.append({"name": name, "ok": None, "before": "", "after": detail, "shot": ""})
    print("  SKIP  " + name + (f"  — {detail}" if detail else ""), flush=True)


def main() -> int:
    ap = argparse.ArgumentParser()
    ap.add_argument("--url", default="https://supersu.ccwu.cc/")
    args = ap.parse_args()
    url = args.url
    origin = "/".join(url.split("/")[:3])

    if OUT.exists():
        shutil.rmtree(OUT)
    OUT.mkdir(parents=True, exist_ok=True)

    from playwright.sync_api import sync_playwright
    from core.browser_utils import launch_browser

    def snap(page, name: str) -> str:
        global shot_no
        shot_no += 1
        p = OUT / f"{shot_no:02d}-{name}.png"
        page.screenshot(path=str(p), full_page=False)
        return str(p.relative_to(ROOT))

    def toast(page) -> str:
        try:
            return page.inner_text("#toast") if page.is_visible("#toast") else ""
        except Exception:
            return ""

    def active_theme(page) -> str:
        return page.evaluate("document.querySelector('.cap[aria-pressed=\"true\"]')?.dataset.id || ''")

    def preview_h1(page) -> str:
        return page.evaluate(
            "(() => { const d=document.getElementById('preview'); "
            "return d && d.contentDocument ? (d.contentDocument.querySelector('h1')?.textContent || '') : ''; })()"
        )

    def input_len(page) -> int:
        return page.evaluate("document.getElementById('input').value.length")

    def drawer_count(page) -> int:
        return page.locator(".d-card").count()

    def local_keys(page) -> list[str]:
        return page.evaluate("Object.keys(localStorage).sort()")

    with sync_playwright() as p:
        browser = launch_browser(p, headless=False, args=["--no-proxy-server", "--window-size=1440,960"])
        page = browser.new_page(viewport={"width": 1440, "height": 960})
        try:
            page.context.grant_permissions(["clipboard-read", "clipboard-write"], origin=origin)
        except Exception:
            pass

        errors: list[str] = []
        page.on("console", lambda m: errors.append("console:" + m.text) if m.type == "error" else None)
        page.on("pageerror", lambda e: errors.append("pageerror:" + str(e)))

        dialogs: list[dict] = []
        dlg = {"accept": False}

        def on_dialog(d):
            dialogs.append({"type": d.type, "message": d.message})
            d.accept() if dlg["accept"] else d.dismiss()

        page.on("dialog", on_dialog)

        # ── 0. 打开线上站 ───────────────────────────────────────
        t0 = time.time()
        page.goto(url, wait_until="domcontentloaded", timeout=60000)
        page.wait_for_selector("#btn-cover", timeout=45000)
        ver = page.evaluate("fetch('./version.json', {cache:'no-store'}).then(r => r.json())")
        check("线上版本可读取", bool(ver.get("version")), "", json.dumps(ver, ensure_ascii=False))
        check("页面标题正确", page.title().startswith("SuperSu"), "", page.title())
        try:
            page.wait_for_function(
                "document.getElementById('engine-badge').dataset.state === 'ready'", timeout=180000
            )
            check("排版引擎就绪（服务器端首访）", True, "loading", f"ready · {round(time.time()-t0,1)}s",
                  snap(page, "home"))
        except Exception as e:
            check("排版引擎就绪（服务器端首访）", False, "loading", "timeout", snap(page, "home-error"))
            print("    ", str(e)[:200])

        page.wait_for_selector("#btn-update:not([hidden])", timeout=30000)
        check("右下角更新入口可见", page.is_visible("#btn-update"), "hidden", "visible")
        check("顶栏入口写着「小红书」", page.inner_text("#btn-cover").strip() == "小红书", "", page.inner_text("#btn-cover"))

        # ── 1. 更多菜单 + 草稿/清数据/关于 ─────────────────────
        page.click("#btn-more")
        check("更多菜单展开", page.is_visible("#menu"), "hidden", "visible", snap(page, "menu"))
        page.click("#btn-more")
        check("更多菜单收起", page.is_hidden("#menu"), "visible", "hidden")

        before = input_len(page)
        page.click("#btn-more"); page.click('[data-act="draft"]'); page.wait_for_timeout(300)
        check("恢复草稿（空态不报错）", input_len(page) == before, before, input_len(page))

        page.click("#btn-more"); page.click('[data-act="clear-draft"]'); page.wait_for_timeout(300)
        check("清空草稿提示", "草稿已清除" in toast(page), "", toast(page))

        dlg["accept"] = False
        page.click("#btn-more"); page.click('[data-act="clear-all"]'); page.wait_for_timeout(400)
        check("清除本地数据弹确认框", bool(dialogs), "", dialogs[-1]["message"] if dialogs else "")
        check("取消清数据后页面可用", page.is_visible("#btn-cover"), "", "true")

        dlg["accept"] = True
        page.click("#btn-more"); page.click('[data-act="clear-all"]'); page.wait_for_timeout(1000)
        check("确认清数据后提示", "本地数据已清除" in toast(page), "", toast(page))

        page.click("#btn-more"); page.click('[data-act="about"]')
        check("关于弹窗打开", page.is_visible("#about"), "hidden", "visible", snap(page, "about"))
        href = page.get_attribute(".about-links a", "href") or ""
        check("关于里有源码链接", href.startswith("http"), "", href)
        page.click("#btn-about-close")
        check("关于弹窗关闭（X）", page.is_hidden("#about"), "visible", "hidden")
        page.click("#btn-more"); page.click('[data-act="about"]'); page.click("#about-mask", position={"x": 8, "y": 8}); page.wait_for_timeout(250)
        check("关于弹窗关闭（遮罩）", page.is_hidden("#about"), "visible", "hidden")

        # ── 2. 编辑 / 预览 / 风格条 / 复制 ─────────────────────
        before = input_len(page)
        page.click("#btn-demo")
        page.wait_for_function("document.getElementById('input').value.length > 100", timeout=10000)
        page.wait_for_timeout(1400)
        after = input_len(page)
        h1 = preview_h1(page)
        parse = page.inner_text("#parse-bar")
        check("看示例写入内容", after > 100, before, after, snap(page, "demo"))
        check("看示例渲染预览", bool(h1), "", h1)
        check("解析条显示结构", ("大标题" in parse or "小节" in parse), "", parse.replace("\n", " ")[:120])
        check("复制按钮启用", page.is_enabled("#btn-copy"), "disabled", "enabled")

        b = page.inner_text("#btn-mode"); cls_b = page.eval_on_selector("#preview-wrap", "e => e.className")
        page.click("#btn-mode"); page.wait_for_timeout(200)
        a = page.inner_text("#btn-mode"); cls_a = page.eval_on_selector("#preview-wrap", "e => e.className")
        check("切到网页视图", a == "网页" and "web" in cls_a, f"{b}/{cls_b}", f"{a}/{cls_a}")
        page.click("#btn-mode"); page.wait_for_timeout(200)
        check("切回手机视图", page.inner_text("#btn-mode") == "手机", "网页", page.inner_text("#btn-mode"))

        caps = page.locator(".cap").count()
        before_theme = active_theme(page)
        page.locator(".cap").nth(1).click()
        page.wait_for_timeout(900)
        check("点击风格胶囊切换", caps > 1 and active_theme(page) != before_theme,
              f"{before_theme}（{caps} 个）", active_theme(page), snap(page, "theme"))

        cap_metrics = page.eval_on_selector("#style-caps", "e => [e.scrollLeft, e.scrollWidth, e.clientWidth]")
        sl_b = cap_metrics[0]
        page.click('.style-scroll[data-dir="1"]')
        try:
            page.wait_for_function(f"document.getElementById('style-caps').scrollLeft > {sl_b}", timeout=5000)
        except Exception:
            pass
        sl_a = page.eval_on_selector("#style-caps", "e => e.scrollLeft")
        check("风格条右滚", sl_a > sl_b, f"{cap_metrics}", f"scrollLeft={sl_a}")
        page.click('.style-scroll[data-dir="-1"]')
        try:
            page.wait_for_function(f"document.getElementById('style-caps').scrollLeft < {sl_a}", timeout=5000)
        except Exception:
            pass
        sl_c = page.eval_on_selector("#style-caps", "e => e.scrollLeft")
        check("风格条左滚", sl_c < sl_a, f"scrollLeft={sl_a}", f"scrollLeft={sl_c}")

        page.click("#btn-copy"); page.wait_for_timeout(900)
        t = toast(page)
        clip = page.evaluate("navigator.clipboard.readText().catch(e => 'ERR:' + e.message)")
        check("复制到公众号有反馈", ("复制" in t) or (isinstance(clip, str) and len(clip) > 20),
              "", f"toast={t} / clipboard={str(clip)[:60]}", snap(page, "copy"))

        page.click("#btn-clear"); page.wait_for_timeout(600)
        check("清空编辑器", input_len(page) == 0 and page.is_visible("#preview-empty")
              and page.is_disabled("#btn-copy"), "", f"len=0 empty={page.is_visible('#preview-empty')}",
              snap(page, "clear"))

        page.click("#btn-demo"); page.wait_for_timeout(1200)
        page.evaluate("document.getElementById('input').value = ''")   # 模拟输入框空、草稿还在
        page.click("#btn-more"); page.click('[data-act="draft"]'); page.wait_for_timeout(500)
        check("恢复草稿（有内容时）", input_len(page) > 100, 0, input_len(page), snap(page, "restore"))

        # ── 3. 风格抽屉 ─────────────────────────────────────────
        page.click("#btn-themes"); page.wait_for_timeout(500)
        check("风格抽屉打开", page.is_visible("#drawer"), "hidden", "visible", snap(page, "drawer"))
        n0 = drawer_count(page)
        check("抽屉卡片已渲染", n0 > 0, "", f"{n0} 张")

        page.fill("#drawer-search", "商务"); page.wait_for_timeout(500)
        n1 = drawer_count(page)
        check("抽屉搜索过滤", 0 < n1 < n0, f"{n0}", f"{n1}")
        page.fill("#drawer-search", ""); page.wait_for_timeout(500)

        chips = page.locator(".fchip").count()
        n2 = drawer_count(page)
        page.locator(".fchip").nth(2).click(); page.wait_for_timeout(500)
        n3 = drawer_count(page)
        check("抽屉族筛选", chips > 2 and n3 != n2, f"{chips} chips / {n2}", f"{n3}")
        page.locator('.fchip[data-fam="all"]').click(); page.wait_for_timeout(400)

        before_theme = active_theme(page)
        page.locator(".d-card:not(.d-family-card)").first.click(); page.wait_for_timeout(800)
        check("选模板生效且抽屉不关", active_theme(page) != before_theme and page.is_visible("#drawer"),
              before_theme, active_theme(page), snap(page, "drawer-selected"))

        fav = page.locator(".d-fav").first
        f0 = fav.get_attribute("data-on")
        fav.click(); page.wait_for_timeout(400)
        f1 = page.locator(".d-fav").first.get_attribute("data-on")
        check("收藏按钮切换", f0 != f1, f0, f1)

        page.click("#btn-drawer-close")
        check("抽屉关闭（X）", page.is_hidden("#drawer"), "visible", "hidden")
        page.click("#btn-themes"); page.wait_for_timeout(400)
        if page.is_visible("#drawer-mask"):
            page.click("#drawer-mask", position={"x": 8, "y": 8}); page.wait_for_timeout(250)
            check("抽屉关闭（遮罩）", page.is_hidden("#drawer"), "visible", "hidden")
        else:
            skip("抽屉关闭（遮罩）", "桌面端为让位布局，遮罩仅移动端显示")
            page.click("#btn-drawer-close")

        # ── 4. AI 面板 ──────────────────────────────────────────
        page.click("#btn-clear"); page.wait_for_timeout(300)
        page.click("#btn-ai"); page.wait_for_timeout(300)
        check("AI 面板打开", page.is_visible("#ai-sheet"), "hidden", "visible", snap(page, "ai"))
        page.click("#ai-save"); page.wait_for_timeout(300)
        check("保存空 AI 配置有提示", "三项" in toast(page), "", toast(page))
        page.click("#ai-test"); page.wait_for_timeout(1800)
        out = page.inner_text("#ai-out") if page.is_visible("#ai-out") else ""
        check("测试连接有真实反馈", bool(out) or bool(toast(page)), "", (out or toast(page))[:120])
        for btn, name in [("#ai-polish", "润色"), ("#ai-format", "智能排版"), ("#ai-summary", "摘要")]:
            page.click(btn); page.wait_for_timeout(300)
            check(f"AI {name}（空输入）有提示", "先" in toast(page), "", toast(page))
        page.click("#ai-close")
        check("AI 面板关闭（X）", page.is_hidden("#ai-sheet"), "visible", "hidden")
        page.click("#btn-ai"); page.click("#ai-mask", position={"x": 8, "y": 8}); page.wait_for_timeout(250)
        check("AI 面板关闭（遮罩）", page.is_hidden("#ai-sheet"), "visible", "hidden")

        # ── 5. 更新记录面板 ────────────────────────────────────
        page.click("#btn-update"); page.wait_for_timeout(600)
        check("更新记录面板打开", page.is_visible("#cl-panel"), "hidden", "visible", snap(page, "update"))
        c0 = page.inner_text("#cl-count")
        page.fill("#cl-search", "封面"); page.wait_for_timeout(500)
        c1 = page.inner_text("#cl-count")
        check("更新记录搜索过滤", c0 != c1, c0, c1)
        page.fill("#cl-search", ""); page.wait_for_timeout(400)
        type_chips = page.locator("#cl-chips button[data-type]").count()
        if type_chips:
            c2 = page.inner_text("#cl-count")
            page.locator("#cl-chips button[data-type]").first.click(); page.wait_for_timeout(400)
            c3 = page.inner_text("#cl-count")
            check("更新记录类型筛选", c2 != c3, f"{type_chips} 类 / {c2}", c3)
        else:
            skip("更新记录类型筛选", "当前面板无类型按钮")
        page.click("#cl-close")
        check("更新面板关闭（X）", page.is_hidden("#cl-panel"), "visible", "hidden")
        page.click("#btn-update"); page.wait_for_timeout(400); page.click("#cl-mask", position={"x": 8, "y": 8}); page.wait_for_timeout(250)
        check("更新面板关闭（遮罩）", page.is_hidden("#cl-panel"), "visible", "hidden")

        # ── 6. 封面页 ──────────────────────────────────────────
        page.click("#btn-cover"); page.wait_for_timeout(500)
        check("封面页打开 / 排版页隐藏", page.is_visible("#cover-root") and page.is_hidden("#stage"),
              "排版", "封面", snap(page, "cover"))
        check("进入封面后按钮变「排版」", page.inner_text("#btn-cover").strip() == "排版", "", page.inner_text("#btn-cover"))
        check("12 种风格全部渲染", page.locator(".cv-style").count() == 12,
              "", page.locator(".cv-style").count())

        page.click('[data-style="editorial-dune"]')
        check("模板仅 3:4（其余尺寸禁用）", page.locator(".cv-size:not([disabled])").count() == 1,
              "3 尺寸", "1 尺寸")
        page.click('[data-style="editorial"]')
        check("归藏支持 3 尺寸", page.locator(".cv-size:not([disabled])").count() == 3,
              "1 尺寸", "3 尺寸")

        for size in ["square", "wide", "xhs"]:
            page.click(f'.cv-size[data-size="{size}"]')
            check(f"尺寸按钮 {size}", page.get_attribute(f'.cv-size[data-size="{size}"]', "aria-pressed") == "true",
                  "", "true")

        for mode, label in [("color", "纯色"), ("upload", "上传"), ("search", "联网搜图")]:
            page.click(f'.cv-mode[data-mode="{mode}"]'); page.wait_for_timeout(250)
            check(f"底图模式 {label}", page.get_attribute(f'.cv-mode[data-mode="{mode}"]', "aria-pressed") == "true",
                  "", "true")

        page.click('.cv-mode[data-mode="color"]')
        page.evaluate("document.getElementById('input').value = '正文带入测试内容'")
        page.click("#cv-use-main"); page.wait_for_timeout(300)
        check("用正文带入封面文案", page.input_value("#cv-text") == "正文带入测试内容",
              "", page.input_value("#cv-text")[:40])

        page.fill("#cv-text", TEXT)
        page.fill("#cv-author", "阿苏")

        page.click('.cv-mode[data-mode="upload"]')
        page.set_input_files("#cv-file", str(ROOT / "docs" / "brand" / "logo.png"))
        page.wait_for_selector(".cv-bg-preview img", timeout=15000)
        check("上传底图", page.is_visible(".cv-bg-preview img"), "", page.inner_text(".cv-bg-meta").replace("\n", " | ")[:100],
              snap(page, "cover-upload"))

        page.click('.cv-mode[data-mode="search"]')
        page.fill("#cv-q", "coffee")
        page.click("#cv-search")
        try:
            page.wait_for_function("document.querySelectorAll('.cv-cand').length > 0", timeout=45000)
            cands = page.locator(".cv-cand").count()
            page.locator(".cv-cand").first.click()
            page.wait_for_function(
                "document.querySelector('.cv-bg-meta') && document.querySelector('.cv-bg-meta').textContent.includes('Wikimedia')",
                timeout=60000,
            )
            check("Wikimedia 搜图并选中", True, "", f"{cands} 个候选 / " + page.inner_text(".cv-bg-meta").replace("\n", " | ")[:100],
                  snap(page, "cover-search"))
        except Exception as e:
            skip("Wikimedia 搜图并选中", f"网络不可达或超时：{str(e)[:100]}")

        page.click("#cv-gen")
        page.wait_for_function("document.querySelectorAll('.cv-card').length === 3", timeout=180000)
        page.wait_for_function("[...document.querySelectorAll('.cv-card img')].every(i => i.naturalWidth > 0)", timeout=60000)
        dims = page.eval_on_selector_all(".cv-card img", "els => els.map(e => [e.naturalWidth, e.naturalHeight])")
        check("生成归藏 3 尺寸", dims == [[1080, 1440], [1080, 1080], [2100, 900]], "", str(dims),
              snap(page, "cover-result"))
        check("每张都有下载链接", page.locator("a.cv-dl").count() == 3, "", page.locator("a.cv-dl").count())

        page.locator(".cv-card img").first.click()
        check("灯箱打开", page.is_visible("#cv-lightbox"), "hidden", "visible", snap(page, "lightbox"))
        page.click("#cv-lightbox-close")
        check("灯箱关闭（X）", page.is_hidden("#cv-lightbox"), "visible", "hidden")
        page.locator(".cv-card img").first.click(); page.wait_for_timeout(200)
        page.click("#cv-lightbox", position={"x": 8, "y": 8}); page.wait_for_timeout(250)
        check("灯箱关闭（点背景）", page.is_hidden("#cv-lightbox"), "visible", "hidden")

        try:
            with page.expect_download(timeout=30000) as dl_info:
                page.locator("a.cv-dl").first.click()
            dl = dl_info.value
            check("下载封面 PNG", dl.suggested_filename.endswith(".png"), "", dl.suggested_filename)
        except Exception as e:
            check("下载封面 PNG", False, "", str(e)[:120])

        page.click("#btn-cover"); page.wait_for_timeout(500)
        check("返回排版页", page.is_visible("#stage") and page.is_hidden("#cover-root"), "封面", "排版")
        check("返回后按钮变「小红书」", page.inner_text("#btn-cover").strip() == "小红书", "", page.inner_text("#btn-cover"))

        # ── 7. 发布小票（#upd-demo 的三个按钮）──────────────────
        try:
            page.goto(url + "#upd-demo", wait_until="domcontentloaded", timeout=60000)
            page.wait_for_selector("#upd-card:not([hidden])", timeout=30000)
            check("发布小票可打开", page.is_visible("#upd-card"), "hidden", "visible", snap(page, "upd-card"))
            page.click("#upd-later")
            check("小票「稍后」关闭", page.is_hidden("#upd-card"), "visible", "hidden")

            page.goto(url + "#upd-demo", wait_until="domcontentloaded", timeout=60000)
            page.wait_for_selector("#upd-card:not([hidden])", timeout=30000)
            page.click("#upd-all"); page.wait_for_timeout(600)
            check("小票「查看全部」打开面板", page.is_visible("#cl-panel"), "hidden", "visible")
            page.click("#cl-close")

            page.goto(url + "#upd-demo", wait_until="domcontentloaded", timeout=60000)
            page.wait_for_selector("#upd-card:not([hidden])", timeout=30000)
            if page.is_visible("#upd-now"):
                page.click("#upd-now"); page.wait_for_timeout(700)
                check("小票「立即更新」有反馈", bool(toast(page)), "", toast(page), snap(page, "upd-now"))
            else:
                skip("小票「立即更新」", "无 waiting worker 时按钮不显示（预期）")
        except Exception as e:
            check("发布小票流程", False, "", str(e)[:160])

        # ── 8. 移动端 tabs / 封面 ──────────────────────────────
        page.goto(url, wait_until="domcontentloaded", timeout=60000)
        page.wait_for_selector("#btn-cover", timeout=30000)
        page.set_viewport_size({"width": 390, "height": 844})
        page.wait_for_timeout(600)
        check("移动端底部 tabs 可见", page.is_visible("#tabs"), "hidden", "visible", snap(page, "mobile-edit"))
        page.click('#tabs button[data-tab="preview"]'); page.wait_for_timeout(400)
        check("移动端切到预览", page.get_attribute("#stage", "data-tab") == "preview",
              "edit", page.get_attribute("#stage", "data-tab"), snap(page, "mobile-preview"))
        page.click('#tabs button[data-tab="edit"]'); page.wait_for_timeout(300)
        check("移动端切回内容", page.get_attribute("#stage", "data-tab") == "edit",
              "preview", page.get_attribute("#stage", "data-tab"))
        page.click("#btn-cover"); page.wait_for_timeout(500)
        check("移动端封面页可用", page.is_visible("#cover-root") and page.is_visible("#cv-gen"),
              "", "true", snap(page, "mobile-cover"))
        page.click("#btn-cover"); page.wait_for_timeout(300)
        page.click("#btn-themes"); page.wait_for_timeout(400)
        if page.is_visible("#drawer-mask"):
            page.click("#drawer-mask", position={"x": 8, "y": 8}); page.wait_for_timeout(250)
            check("移动端抽屉遮罩关闭", page.is_hidden("#drawer"), "visible", "hidden", snap(page, "mobile-drawer"))
        else:
            skip("移动端抽屉遮罩关闭", "遮罩不可见")
            page.click("#btn-drawer-close")
        page.set_viewport_size({"width": 1440, "height": 960})

        # ── 9. 控制台错误 ──────────────────────────────────────
        expected = ("Failed to fetch", "ERR_INTERNET_DISCONNECTED", "ERR_NAME_NOT_RESOLVED",
                    "NotAllowedError", "clipboard")
        real = [e for e in errors if not any(x.lower() in e.lower() for x in expected)]
        check("无 JS 控制台报错", not real, "", "; ".join(real[:4]))

        browser.close()

    (OUT / "report.json").write_text(json.dumps(results, ensure_ascii=False, indent=2), encoding="utf-8")
    passed = sum(1 for r in results if r["ok"] is True)
    failed = [r for r in results if r["ok"] is False]
    skipped = sum(1 for r in results if r["ok"] is None)
    print("\n" + "=" * 60)
    print(f"线上全量有头 E2E：{passed}/{passed + len(failed)} 通过"
          + (f"（{skipped} 项 SKIP）" if skipped else ""))
    print(f"截图与报告：{OUT}")
    print("=" * 60)
    for r in failed:
        print(f"  ✗ {r['name']}  {r['before']} → {r['after']}")
    return 0 if not failed else 1


if __name__ == "__main__":
    raise SystemExit(main())
