#!/usr/bin/env python
"""通过 CDP 连接系统 Chrome（端口 9222），读取/操作 dnshe 控制台。
用法：
  python scripts/dnshe_cdp.py text              # 打印当前 dnshe 页可见文本
  python scripts/dnshe_cdp.py snapshot          # 无障碍树（带元素 ref）
  python scripts/dnshe_cdp.py eval "<js>"       # 执行 JS
  python scripts/dnshe_cdp.py shot <path.png>   # 截图
注意：connect_over_cdp 不会 owns 浏览器，退出时不断开连接即可，Chrome 保持运行。
"""
import sys
from playwright.sync_api import sync_playwright

CDP = "http://127.0.0.1:9222"


def find_page(ctx):
    for pg in ctx.pages:
        if "dnshe.com" in (pg.url or ""):
            return pg
    return ctx.pages[0] if ctx.pages else ctx.new_page()


def main():
    mode = sys.argv[1] if len(sys.argv) > 1 else "text"
    with sync_playwright() as p:
        browser = p.chromium.connect_over_cdp(CDP)
        ctx = browser.contexts[0]
        page = find_page(ctx)
        if mode == "text":
            print("URL:", page.url)
            print(page.inner_text("body")[:5000])
        elif mode == "goto":
            page.goto(sys.argv[2], wait_until="domcontentloaded")
            page.wait_for_timeout(2500)
            print("URL:", page.url)
            print(page.inner_text("body")[:5000])
        elif mode == "snapshot":
            import json
            print(json.dumps(page.accessibility.snapshot(interesting_only=True), ensure_ascii=False, indent=1)[:8000])
        elif mode == "eval":
            print(page.evaluate(sys.argv[2]))
        elif mode == "shot":
            page.screenshot(path=sys.argv[2], full_page=True)
            print("saved:", sys.argv[2])
        elif mode == "click":
            page.click(sys.argv[2], timeout=15000)
            page.wait_for_timeout(1500)
            print("clicked:", sys.argv[2], "| URL:", page.url)
            print(page.inner_text("body")[:2500])
        elif mode == "fill":
            page.fill(sys.argv[2], sys.argv[3], timeout=15000)
            print("filled:", sys.argv[2])
        elif mode == "elements":
            # 列出可交互元素（按钮/输入/下拉），带推荐选择器
            js = """Array.from(document.querySelectorAll('button, input, select, textarea, a'))
              .map(e => ({tag: e.tagName, type: e.type || '', text: (e.innerText||e.value||'').trim().slice(0,30),
                          ph: e.placeholder || '', name: e.name || '', id: e.id || ''}))
              .filter(o => o.text || o.ph || o.name || o.id).slice(0, 60)"""
            import json
            print(json.dumps(page.evaluate(js), ensure_ascii=False, indent=0))
        browser  # 故意不 close：Chrome 是用户会话，保持运行


if __name__ == "__main__":
    main()
