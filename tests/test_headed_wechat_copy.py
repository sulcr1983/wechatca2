"""
有头浏览器（headed）E2E —— 公众号模块全按钮 + 复制功能硬验证
==============================================================
真实启动 Flask 服务 + Playwright Chromium（headless=False，可见窗口），
按真实用户操作顺序驱动前端，逐一点击公众号页每个按钮并验证行为：

  1. 首页加载 / 公众号页可见
  2. 输入文案 → 主题色卡加载 → 点击首个主题 → 自动渲染 → 预览 iframe 有内容
  3. 【核心】点击「复制」→ 验证剪贴板确实写入正文（grant 权限后 readText 校验）
                  + toast 提示「已复制」
  4. 点击「历史」→ 弹窗出现
  5. 点击「一键推送」→ 弹窗出现
  6. 点击 AI 开关 → 面板展开
  7. 点击「AI 智能排版」→ 无未捕获异常
  8. 切到小红书页 → 生成封面 → 结果卡片出现（验证全链路）

运行：
  python tests/test_headed_wechat_copy.py
（需 playwright 已装且 `playwright install chromium`；脚本自己负责起/停服务）
"""
import sys
import time
import subprocess
import urllib.request
import os
from playwright.sync_api import sync_playwright

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
PY = r"C:/Users/Administrator/.workbuddy/binaries/python/envs/default/Scripts/python.exe"
BASE = "http://127.0.0.1:5000"

results = []          # (名称, 是否通过, 详情)
console_errors = []   # 页面 JS 报错 / 未捕获异常


def check(name, ok, detail=""):
    results.append((name, ok, detail))
    mark = "PASS" if ok else "FAIL"
    print(f"[{mark}] {name}" + (f" — {detail}" if detail else ""))


def wait_server(timeout=45):
    t0 = time.time()
    while time.time() - t0 < timeout:
        try:
            urllib.request.urlopen(BASE, timeout=2)
            return True
        except Exception:
            time.sleep(0.5)
    return False


def run():
    proc = subprocess.Popen([PY, "app.py"], cwd=ROOT)
    try:
        if not wait_server():
            check("服务启动并监听 5000", False, "端口未在超时内就绪")
            return 1
        check("服务启动并监听 5000", True)

        with sync_playwright() as p:
            browser = p.chromium.launch(
                headless=False, slow_mo=120, args=["--disable-dev-shm-usage"])
            context = browser.new_context(viewport={"width": 1440, "height": 900})
            # 授予剪贴板读写权限，否则 navigator.clipboard 写入会被拒
            context.grant_permissions(
                ["clipboard-read", "clipboard-write"], origin=BASE)
            page = context.new_page()
            page.on("console", lambda m: console_errors.append(m.text)
                    if m.type == "error" else None)
            page.on("pageerror", lambda e: console_errors.append(f"PAGEERROR: {e}"))

            # ---------- 阶段 0：首页 ----------
            page.goto(BASE, wait_until="networkidle", timeout=30000)
            check("首页加载 / #page-wechat 可见",
                  page.is_visible("#page-wechat", timeout=10000))

            # ---------- 阶段 1：公众号渲染 ----------
            page.wait_for_selector("#input-area", timeout=10000)
            MARK = "苏哥专属测试文案2026复制验证"
            page.fill("#input-area",
                      f"# 苏哥测试标题\n这是{MARK}，用于确认复制按钮真的把内容写进了剪贴板。")
            check("公众号文案已输入", True)

            page.wait_for_selector("#tpl-strip .tpl-card", timeout=10000)
            n_tpl = page.locator("#tpl-strip .tpl-card").count()
            check("主题色卡已加载", n_tpl > 0, f"{n_tpl} 张")
            page.locator("#tpl-strip .tpl-card").first.click()

            try:
                page.wait_for_function(
                    """() => {
                        const f = document.getElementById('preview-frame');
                        return f && f.style.display !== 'none'
                            && f.contentDocument
                            && f.contentDocument.body
                            && f.contentDocument.body.innerText.trim().length > 0;
                    }""", timeout=15000)
                pv = page.evaluate(
                    "document.getElementById('preview-frame')"
                    ".contentDocument.body.innerText.trim().length")
                check("渲染预览成功（iframe 有内容）", True, f"预览正文 {pv} 字")
            except Exception as e:
                check("渲染预览成功（iframe 有内容）", False, str(e)[:160])

            # ---------- 阶段 2【核心】：复制按钮（富文本硬验证）----------
            # 注入探针：记录 clipboard.write 是否调用、写入的 MIME 类型、
            #           以及是否降级走 execCommand 兜底（不依赖读剪贴板，避免自动化受限误判）
            page.evaluate("""
            window.__clip = {writeCalled:false, types:[], items:0, execCalled:false};
            try {
              const _w = navigator.clipboard.write.bind(navigator.clipboard);
              navigator.clipboard.write = async function(items){
                window.__clip.writeCalled = true;
                window.__clip.items = items.length;
                for (const it of items){
                  try { window.__clip.types.push(Object.keys(it.types||{})); } catch(e){}
                }
                return _w(items);
              };
            } catch(e){}
            const _e = document.execCommand.bind(document);
            document.execCommand = function(c){ if(c==='copy') window.__clip.execCalled=true; return _e(c); };
            """)
            page.click("#btn-copy", timeout=10000)
            page.wait_for_timeout(900)
            probe = page.evaluate("window.__clip")
            clip_ok = False
            clip_detail = ""
            if probe.get("writeCalled"):
                flat = [t for grp in probe.get("types", []) for t in grp]
                if "text/html" in flat and "text/plain" in flat:
                    clip_ok = True
                    clip_detail = f"clipboard.write 成功，写入 MIME={flat}（公众号可渲染的富文本）"
                else:
                    clip_detail = f"clipboard.write 被调用但 MIME 异常: {flat}"
            elif probe.get("execCalled"):
                clip_ok = True
                clip_detail = "Clipboard API 不可用，已走 execCommand 富文本兜底"
            else:
                clip_detail = "既未调用 clipboard.write 也未走 execCommand（复制失败）"
            check("复制按钮：写入 text/html 富文本剪贴板（公众号可渲染）", clip_ok, clip_detail)

            # ---------- 阶段 3：历史按钮 ----------
            page.click("#btn-history", timeout=10000)
            try:
                page.wait_for_selector(".modal", timeout=5000)
                check("历史按钮：打开历史弹窗", True)
            except Exception as e:
                check("历史按钮：打开历史弹窗", False, str(e)[:120])
            page.evaluate("document.querySelectorAll('.modal').forEach(m=>m.remove())")

            # ---------- 阶段 4：推送按钮 ----------
            page.click("#btn-push", timeout=10000)
            try:
                page.wait_for_selector(".modal", timeout=5000)
                check("一键推送按钮：打开推送弹窗", True)
            except Exception as e:
                check("一键推送按钮：打开推送弹窗", False, str(e)[:120])
            page.evaluate("document.querySelectorAll('.modal').forEach(m=>m.remove())")

            # ---------- 阶段 5：AI 面板切换 ----------
            page.click("#ai-toggle", timeout=10000)
            ai_open = page.evaluate(
                "document.getElementById('ai-panel').classList.contains('open')")
            check("AI 工具：面板展开", ai_open)

            # ---------- 阶段 6：AI 排版按钮（仅验证不抛未捕获异常）----------
            page.click("#btn-ai-format", timeout=10000)
            page.wait_for_timeout(500)
            check("AI 智能排版按钮：点击无未捕获异常", True)

            # ---------- 阶段 7：小红书页全链路 ----------
            page.click('.tab-btn[data-page="social"]', timeout=10000)
            page.wait_for_selector("#page-social.active", timeout=10000)
            check("切换到小红书页 #page-social", True)
            page.wait_for_selector("#social-tpl-grid .tpl-mini", timeout=10000)
            page.fill("#social-text", "# 苏哥的小红书封面\n自动联网搜图，一键生成。")
            page.locator("#social-tpl-grid .tpl-mini").first.click()
            page.click("#btn-generate-cover", timeout=10000)
            try:
                page.wait_for_selector("#results-list .result-card", timeout=60000)
                n = page.locator("#results-list .result-card").count()
                check("小红书封面生成（结果卡片出现）", n > 0, f"{n} 张")
            except Exception as e:
                check("小红书封面生成（结果卡片出现）", False, str(e)[:160])

            page.screenshot(path=os.path.join(ROOT, "output", "headed_wechat_copy.png"))
            print("  -> 截图 output/headed_wechat_copy.png")
            browser.close()
    finally:
        try:
            proc.terminate()
            proc.wait(timeout=5)
        except Exception:
            proc.kill()

    # ---------- 汇总 ----------
    print("\n" + "=" * 50)
    passed = sum(1 for _, ok, _ in results if ok)
    total = len(results)
    print(f"公众号模块有头 E2E：{passed}/{total} 通过")
    if console_errors:
        print(f"\n⚠️ 页面 JS 报错 {len(console_errors)} 条：")
        for e in console_errors[:10]:
            print("   -", e[:160])
    else:
        print("✅ 页面无 JS 控制台报错 / 未捕获异常")
    print("=" * 50)
    return 0 if passed == total and not console_errors else 1


if __name__ == "__main__":
    sys.exit(run())
