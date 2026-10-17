"""有头浏览器走查：验证「粘贴/打字 → 自动编辑」三种典型输入的真实表现。

与 scripts/ux_walkthrough.py 不同，本脚本只聚焦自动编辑（preprocess）在真实前端
经过 /api/render 后的预览结果，不碰社交封面等无关路径。

用法：由 shell 在同一次调用里先起 Flask 再跑本脚本（服务端口需一致）。
"""
import json
import pathlib
import sys

from playwright.sync_api import sync_playwright

CHROME = r"C:/Program Files/Google/Chrome/Application/chrome.exe"
BASE = "http://127.0.0.1:5011"
OUT = pathlib.Path("test_output/autedit_walkthrough")
OUT.mkdir(parents=True, exist_ok=True)

CASES = {
    "纯散文": (
        "今天我想聊聊一个很多人都忽略的问题。其实真正重要的是坚持做对的事，"
        "而不是追风口。我们身边有太多人一开始热情满满，后来就放弃了。\n\n"
        "后来他们发现，真正能坚持下去的人，反而是那些把目标拆得很小的人。"
        "所以与其立宏大的 flag，不如先从每天一件小事开始。"
    ),
    "半结构化": (
        "一、项目背景\n\n这是介绍部分，说明为什么要做这件事。\n\n"
        "1. 具体步骤\n\n第一步先准备环境，第二步开始写代码。\n\n"
        "• 要点一\n• 要点二"
    ),
    "长文自动分层": (
        "我们总以为努力就会有回报，但现实常常不是这样。\n\n"
        "很多人一开始热情高涨，报班买书定计划，但坚持不到一个月就放弃。\n\n"
        "核心观点：做减法比做加法更重要。\n\n"
        "很多人喜欢囤积功能和信息，结果反而更焦虑。\n\n"
        "实践建议：每天只挑一件最重要的事做完。\n\n"
        "坚持下去你会看到复利效应。"
    ),
}


def main():
    results = []
    with sync_playwright() as p:
        browser = p.chromium.launch(
            executable_path=CHROME,
            args=["--no-sandbox", "--no-proxy-server"],
        )
        page = browser.new_page(viewport={"width": 1280, "height": 900})
        page.goto(BASE, wait_until="load")
        page.wait_for_selector("#input-area", timeout=10000)

        for name, text in CASES.items():
            # 设置 textarea 并派发 input 事件，触发前端的 debounce 渲染
            page.evaluate(
                "(t) => { const el = document.getElementById('input-area'); "
                "el.value = t; "
                "el.dispatchEvent(new Event('input', { bubbles: true })); }",
                text,
            )
            page.wait_for_timeout(600)  # debounce(400) 先触发
            # 等待预览 iframe 真正渲染出输入文本（blob srcdoc 异步加载，避免读到空文档）
            try:
                page.wait_for_function(
                    "(marker) => { const f = document.getElementById('preview-frame'); "
                    "if (!f || !f.contentDocument || !f.contentDocument.body) return false; "
                    "return f.contentDocument.body.innerText.indexOf(marker) >= 0; }",
                    arg=text.split("\n")[0][:8],
                    timeout=8000,
                )
            except Exception as e:  # noqa
                print("  [warn] 预览未在预期时间内更新:", e)
            page.wait_for_timeout(200)

            preview_text = page.evaluate(
                "() => { const f = document.getElementById('preview-frame'); "
                "if (!f) return 'NO_FRAME'; const d = f.contentDocument; "
                "if (!d || !d.body) return 'NO_BODY'; return d.body.innerText; }"
            )
            h1 = page.evaluate(
                "() => { const f = document.getElementById('preview-frame'); "
                "if (!f || !f.contentDocument) return []; "
                "return Array.from(f.contentDocument.querySelectorAll('h1')).map(h => h.innerText); }"
            )
            h2 = page.evaluate(
                "() => { const f = document.getElementById('preview-frame'); "
                "if (!f || !f.contentDocument) return []; "
                "return Array.from(f.contentDocument.querySelectorAll('h2')).map(h => h.innerText); }"
            )
            h3 = page.evaluate(
                "() => { const f = document.getElementById('preview-frame'); "
                "if (!f || !f.contentDocument) return []; "
                "return Array.from(f.contentDocument.querySelectorAll('h3')).map(h => h.innerText); }"
            )

            first_sentence = text.split("\n")[0]
            became_h1 = any(first_sentence[:6] in x for x in h1)

            page.screenshot(path=str(OUT / f"{name}.png"))
            print(f"===== {name} =====")
            print(f"  H1(巨标题): {h1}")
            print(f"  H2: {h2}")
            print(f"  H3(自动小标题): {h3}")
            print(f"  首句被误当巨标题? {'⚠️ 是(异常)' if became_h1 else '✅ 否'}")
            print(f"  预览首段: {preview_text[:70].replace(chr(10), ' / ')}")
            results.append({
                "case": name,
                "h1": h1, "h2": h2, "h3": h3,
                "first_sentence_became_h1": became_h1,
                "preview_head": preview_text[:70],
            })

        page.screenshot(path=str(OUT / "page.png"))
        browser.close()

    print("\n==== WALKTHROUGH SUMMARY ====")
    print(json.dumps(results, ensure_ascii=False, indent=2))
    # 退出码：若任何用例首句被误当巨标题，判失败
    if any(r["first_sentence_became_h1"] for r in results):
        sys.exit(2)
    print("ALL GOOD")


if __name__ == "__main__":
    main()
