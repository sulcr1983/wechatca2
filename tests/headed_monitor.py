#!/usr/bin/env python3
"""
Headed E2E 测试 + 实时日志监控 + 自动发现问题
==============================================
启动 Flask 服务器 → agent-browser 打开页面 → 逐步骤断言
同时捕获: 服务器日志 / 浏览器 console 错误 / 网络请求失败

用法:
    python tests/headed_monitor.py              # 全量测试
    python tests/headed_monitor.py --quick      # 快速冒烟
"""

import sys, os, time, json, subprocess, signal, threading
from pathlib import Path
from datetime import datetime

PROJ = Path(__file__).parent.parent
OUT = PROJ / "test_output"
OUT.mkdir(exist_ok=True)

BASE = "http://127.0.0.1:5000"

# ── 日志收集 ─────────────────────────────────────────────────
class LogCollector:
    """同时收集多路日志"""
    def __init__(self):
        self.server_log: list[str] = []
        self.browser_errors: list[str] = []
        self.browser_console: list[str] = []
        self.network_fails: list[dict] = []
        self.issues: list[str] = []

    def add_issue(self, severity: str, msg: str):
        self.issues.append(f"[{severity}] {msg}")

collector = LogCollector()

# ── 断言工具 ─────────────────────────────────────────────────
passed = 0
failed = 0

def check(label: str, condition: bool, detail: str = ""):
    global passed, failed
    if condition:
        passed += 1
        print(f"  PASS  {label}")
    else:
        failed += 1
        msg = f"  FAIL  {label}" + (f" — {detail}" if detail else "")
        collector.add_issue("FAIL", label + (f": {detail}" if detail else ""))
        print(msg)

# ── Agent-browser 监控 ───────────────────────────────────────
def browser_console():
    """读取浏览器控制台输出"""
    try:
        r = subprocess.run(
            ["agent-browser", "--session", "monitor", "console"],
            capture_output=True, text=True, timeout=10
        )
        if r.stdout.strip():
            collector.browser_console = r.stdout.strip().split("\n")
    except Exception:
        pass

def browser_errors():
    """读取浏览器页面错误"""
    try:
        r = subprocess.run(
            ["agent-browser", "--session", "monitor", "errors"],
            capture_output=True, text=True, timeout=10
        )
        if r.stdout.strip():
            for line in r.stdout.strip().split("\n"):
                if line.strip():
                    collector.browser_errors.append(line.strip())
                    collector.add_issue("BROWSER", line.strip()[:120])
    except Exception:
        pass

def browser_network():
    """读取网络请求，找失败请求"""
    try:
        r = subprocess.run(
            ["agent-browser", "--session", "monitor", "network", "requests"],
            capture_output=True, text=True, timeout=10
        )
        if r.stdout.strip():
            for line in r.stdout.strip().split("\n"):
                if " 4" in line or " 5" in line:  # 4xx or 5xx status
                    collector.network_fails.append({"raw": line.strip()})
                    collector.add_issue("NETWORK", line.strip()[:120])
    except Exception:
        pass

def browser_snapshot(label: str) -> str:
    """获取页面快照并保存"""
    try:
        r = subprocess.run(
            ["agent-browser", "--session", "monitor", "snapshot", "-i"],
            capture_output=True, text=True, timeout=15
        )
        snap = r.stdout
        (OUT / f"snap_{label}.txt").write_text(snap, encoding="utf-8")
        return snap
    except Exception as e:
        collector.add_issue("SNAP", f"snapshot failed: {e}")
        return ""

def browser_screenshot(label: str):
    """截图"""
    path = OUT / f"{label}.png"
    try:
        subprocess.run(
            ["agent-browser", "--session", "monitor", "screenshot", str(path)],
            capture_output=True, timeout=15
        )
    except Exception as e:
        collector.add_issue("SHOT", f"screenshot failed: {e}")

def browser_click(ref: str):
    """点击元素"""
    r = subprocess.run(
        ["agent-browser", "--session", "monitor", "click", ref],
        capture_output=True, text=True, timeout=10
    )
    return r.returncode == 0

def browser_eval(js: str) -> str:
    """执行 JS"""
    r = subprocess.run(
        ["agent-browser", "--session", "monitor", "eval", js],
        capture_output=True, text=True, timeout=15
    )
    return r.stdout.strip()

def browser_nav(url: str):
    """导航"""
    r = subprocess.run(
        ["agent-browser", "--session", "monitor", "open", url],
        capture_output=True, text=True, timeout=15
    )
    return r.returncode == 0

# ── 服务器监控 ───────────────────────────────────────────────
server_process = None

def start_server():
    """启动 Flask 并捕获日志"""
    global server_process
    log_path = OUT / "server.log"
    log_f = open(log_path, "w", encoding="utf-8")
    server_process = subprocess.Popen(
        [sys.executable, str(PROJ / "app.py")],
        stdout=log_f, stderr=subprocess.STDOUT,
        cwd=str(PROJ),
        env={**os.environ, "PYTHONUNBUFFERED": "1"}
    )
    # 等待启动
    for i in range(10):
        time.sleep(0.5)
        try:
            import urllib.request
            urllib.request.urlopen(BASE, timeout=2)
            print(f"  Server started on {BASE}")
            return True
        except Exception:
            pass
    collector.add_issue("SERVER", "Failed to start")
    return False

def check_server_log():
    """检查服务器日志中的异常"""
    log_path = OUT / "server.log"
    if not log_path.exists():
        return
    lines = log_path.read_text(encoding="utf-8", errors="replace").split("\n")
    for line in lines:
        lower = line.lower()
        if any(kw in lower for kw in ["error", "exception", "traceback", "500", "fail"]):
            if "200" not in lower:  # 排除正常响应
                collector.add_issue("SERVER", line.strip()[:150])

def stop_server():
    global server_process
    if server_process:
        server_process.terminate()
        try:
            server_process.wait(timeout=5)
        except Exception:
            server_process.kill()

# ── 测试用例 ─────────────────────────────────────────────────
def run_tests(quick: bool = False):
    print("=" * 70)
    print("  Headed E2E Monitor — 实时监控 + 测试")
    print(f"  {datetime.now().strftime('%Y-%m-%d %H:%M:%S')}")
    print("=" * 70)

    # 1. 启动服务器
    print("\n[SETUP] Starting Flask...")
    if not start_server():
        print("FAILED to start server")
        return
    time.sleep(1)

    # 2. 启动浏览器
    print("[SETUP] Opening browser...")
    browser_nav(BASE)
    time.sleep(2)

    # 3. 开始测试
    print("\n" + "=" * 50)
    print("  TEST: Homepage")
    print("=" * 50)

    browser_screenshot("00_homepage")
    snap = browser_snapshot("00_homepage")

    check("页面标题含 SuperSu", "SuperSu" in snap)
    check("主题选择器存在", "combobox" in snap)
    check("输入框存在", "textbox" in snap)
    check("预览 iframe 存在", "Iframe" in snap)
    check("AI 排版按钮", "AI 排版" in snap or "btn-ai-format" in snap)
    check("AI 润色按钮", "AI 润色" in snap or "btn-polish" in snap)
    check("推送按钮", "一键推送" in snap or "btn-push" in snap)
    check("小红书按钮", "小红书封面" in snap or "btn-social-link" in snap)

    # 浏览器错误检查
    browser_errors()
    browser_console()

    if not quick:
        # 4. API 测试
        print("\n" + "=" * 50)
        print("  TEST: API Endpoints")
        print("=" * 50)

        apis = [
            ("GET  /api/themes", "fetch('/api/themes').then(r=>r.json()).then(d=>'count:'+d.length)"),
            ("GET  /api/accounts", "fetch('/api/accounts').then(r=>r.json()).then(d=>'ok:'+Array.isArray(d))"),
            ("GET  /api/ai-platforms", "fetch('/api/ai-platforms').then(r=>r.json()).then(d=>'platforms:'+Object.keys(d).length)"),
            ("POST /api/render", "fetch('/api/render',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({raw_text:'test\\n\\ncontent',theme_id:'monocle'})}).then(r=>r.json()).then(d=>'html:'+(d.html?d.html.length:0))"),
            ("POST /api/polish", "fetch('/api/polish',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({text:'test polish'})}).then(r=>r.json()).then(d=>'polish:'+d.success)"),
            ("POST /api/ai-format", "fetch('/api/ai-format',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({text:'test format'})}).then(r=>r.json()).then(d=>'format:'+d.success)"),
            ("POST /api/cover-image", "fetch('/api/cover-image',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({title:'test',full_text:'test'})}).then(r=>r.json()).then(d=>'cover:'+d.success)"),
            ("POST /api/summary", "fetch('/api/summary',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({article_text:'AI technology is advancing rapidly.'})}).then(r=>r.json()).then(d=>'summary:'+d.success)"),
            ("GET  /api/server-ip", "fetch('/api/server-ip').then(r=>r.json()).then(d=>'ip:'+!!d.ip)"),
            ("POST /api/render (bad theme)", "fetch('/api/render',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({raw_text:'x',theme_id:'NOPE'})}).then(r=>'status:'+r.status)"),
            ("POST /api/ai-format (empty)", "fetch('/api/ai-format',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({text:''})}).then(r=>'status:'+r.status)"),
            ("POST /api/polish (empty)", "fetch('/api/polish',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({text:''})}).then(r=>'status:'+r.status)"),
        ]

        result_str = browser_eval(
            "Promise.all([" +
            ",".join(f"({js}).catch(e=>'ERROR:'+e.message)" for _, js in apis) +
            "]).then(r=>r.join('||'))"
        )

        results = result_str.strip('"').split("||")
        for (label, _), result in zip(apis, results):
            check(label, "ERROR:" not in result, f"→ {result}")

        # 验证特定值
        for label, _, expected in [
            ("themes count 53", 0, "count:53"),
            ("bad theme 404", 9, "status:404"),
            ("empty format 400", 10, "status:400"),
            ("empty polish 400", 11, "status:400"),
        ]:
            actual = results[label[0]] if label[0] < len(results) else ""
            check(label, expected in actual, f"→ {actual}")

        browser_network()

        # 5. 前端交互测试
        print("\n" + "=" * 50)
        print("  TEST: Frontend Interactions")
        print("=" * 50)

        # 填入文本
        browser_eval(
            "(function(){"
            "var ta=document.querySelector('#input-area')||document.querySelector('textarea');"
            "if(ta){ta.value='AI test\\n\\ncontent paragraph';"
            "ta.dispatchEvent(new Event('input',{bubbles:true}));"
            "ta.dispatchEvent(new Event('change',{bubbles:true}));}"
            "return 'ok';"
            "})()"
        )
        time.sleep(2)
        browser_screenshot("05_text_rendered")

        # 检查预览内容
        preview = browser_eval(
            "var f=document.querySelector('#preview-frame');"
            "f&&f.contentDocument?f.contentDocument.body.innerText.substring(0,100):'NONE'"
        )
        check("预览含渲染内容", "NONE" not in preview, f"→ {preview[:60]}")

        # 错误检查
        render_err = browser_eval(
            "var e=document.querySelector('.render-error');e?e.textContent:''"
        )
        check("无渲染错误", not render_err.strip(), f"→ {render_err}")

        # 主题切换
        themes_to_test = ["monocle", "bold-blue", "sakura", "cyber-neon"]
        for tid in themes_to_test:
            browser_eval(
                f"var s=document.querySelector('#theme-select');"
                f"if(s){{s.value='{tid}';s.dispatchEvent(new Event('change',{{bubbles:true}}));}}"
            )
            time.sleep(0.8)
        browser_screenshot("05b_themes")

        # 手机预览
        browser_eval("var b=document.querySelector('#btn-phone-preview');if(b)b.click();")
        time.sleep(1)
        phone_visible = browser_eval(
            "var p=document.querySelector('#phone-frame');p&&p.offsetParent!==null"
        )
        check("手机预览激活", phone_visible == "true")
        browser_screenshot("05c_phone_preview")

        # 回到完整预览
        browser_eval("var b=document.querySelector('#btn-full-preview');if(b)b.click();")
        time.sleep(0.5)

        # Modal 测试
        modals = [
            ("AI 排版", "#btn-ai-format", "#ai-format-modal"),
            ("AI 润色", "#btn-polish", "#polish-modal"),
            ("推送", "#btn-push", "#push-modal"),
            ("历史", "#btn-history", "#history-modal"),
        ]
        for name, btn_sel, modal_sel in modals:
            browser_eval(f"var b=document.querySelector('{btn_sel}');if(b)b.click();")
            time.sleep(1)
            visible = browser_eval(
                f"var m=document.querySelector('{modal_sel}');"
                f"!!(m&&m.offsetParent!==null)"
            )
            check(f"{name} Modal 打开", visible == "true")
            browser_screenshot(f"06_modal_{name}")
            # 关闭
            browser_eval(
                f"var m=document.querySelector('{modal_sel}');"
                f"if(m){{var c=m.querySelector('.close-modal,[class*=close]');"
                f"if(c)c.click();}}"
            )
            time.sleep(0.5)

        # 小红书页面
        print("\n" + "=" * 50)
        print("  TEST: Social Page")
        print("=" * 50)

        browser_eval("var b=document.querySelector('#btn-social-link');if(b)b.click();")
        time.sleep(2)
        browser_screenshot("07_social_page")

        social_visible = browser_eval(
            "var p=document.querySelector('#page-social');"
            "!!(p&&p.classList.contains('active'))"
        )
        check("小红书页面显示", social_visible == "true")

        # 输入和字数
        browser_eval(
            "(function(){"
            "var ta=document.querySelector('#socialText');"
            "ta.value='test social text 42 chars long ok';"
            "ta.dispatchEvent(new Event('input',{bubbles:true}));"
            "})()"
        )
        time.sleep(0.5)
        wc = browser_eval(
            "var w=document.querySelector('#socialWordCount');w?w.textContent:'NONE'"
        )
        check("字数统计工作", "NONE" not in wc, f"→ {wc}")

        # 返回公众号页面
        browser_eval("var b=document.querySelector('#btn-back-wechat');if(b)b.click();")
        time.sleep(1)
        back_ok = browser_eval(
            "var p=document.querySelector('#page-wechat');"
            "!!(p&&p.style.display!=='none')"
        )
        check("返回公众号页面", back_ok == "true")

    # 最终检查
    browser_errors()
    check_server_log()

    # 截图
    browser_screenshot("99_final")

    # ── 报告 ─────────────────────────────────────────────────
    print("\n" + "=" * 70)
    print(f"  RESULTS: {passed}/{passed+failed} passed")
    if failed:
        print(f"  {failed} FAILED:")
        for issue in collector.issues:
            print(f"    {issue}")

    print(f"\n  Browser errors: {len(collector.browser_errors)}")
    for e in collector.browser_errors[-5:]:
        print(f"    {e}")

    print(f"\n  Artifacts: {OUT}/")
    print(f"  - screenshots: {len(list(OUT.glob('*.png')))}")
    print(f"  - snapshots:  {len(list(OUT.glob('*snap*.txt')))}")
    print(f"  - server log: server.log")
    print("=" * 70)

    # 清理
    subprocess.run(["agent-browser", "--session", "monitor", "close"], capture_output=True)
    stop_server()

    return failed == 0


if __name__ == "__main__":
    import argparse
    p = argparse.ArgumentParser()
    p.add_argument("--quick", action="store_true")
    args = p.parse_args()

    try:
        ok = run_tests(quick=args.quick)
    finally:
        stop_server()

    sys.exit(0 if ok else 1)
