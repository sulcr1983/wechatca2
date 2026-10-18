"""
有头 E2E —— 2026-10-18 审计问题修复验证（C1~C12）
==============================================================
真实启动 Flask + 系统 Chrome（headless=False），逐条验证审计报告里的 11 项修复：

  C1  「看示例」不再静默清空：载入示例 + 可撤销
  C2  「智能转换」假开关已下线（DOM 里不存在）
  C3  清空后预览恢复空态（pv-empty-state 可见、iframe 清空）
  C4  抽屉选主题后自动关闭
  C5  「导入文档」占位按钮已下线
  C6  识别结构胶囊是纯展示 span（cursor 不是 pointer）
  C7  小红书超 500 字 → 计数器变红
  C8  假「已保存」→ 真落盘：localStorage 有草稿、刷新自动恢复
  C9  「清空」可撤销
  C10 「整理格式」保留代码块/嵌套列表缩进，提示真实行数
  C11 封面生成失败不再永久 loading
  C12 复制按钮的 Ctrl+Enter 真的可用

运行：python tests/test_headed_audit_fixes.py（自起自停服务）
"""
import os
import socket
import subprocess
import sys
import time
import urllib.request

from playwright.sync_api import sync_playwright

sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
from core.browser_utils import launch_browser

try:
    if (sys.stdout.encoding or "").lower() not in ("utf-8", "utf8"):
        sys.stdout.reconfigure(encoding="utf-8", errors="replace")
        sys.stderr.reconfigure(encoding="utf-8", errors="replace")
except Exception:
    pass

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
PY = sys.executable
BASE = "http://127.0.0.1:5000"

results = []
console_errors = []


def check(name, ok, detail=""):
    results.append((name, ok, detail))
    print(f"[{'PASS' if ok else 'FAIL'}] {name}" + (f" — {detail}" if detail else ""))


def _port_busy(port=5000):
    with socket.socket(socket.AF_INET, socket.SOCK_STREAM) as s:
        s.settimeout(0.5)
        return s.connect_ex(("127.0.0.1", port)) == 0


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
    if _port_busy():
        print("[ABORT] 端口 5000 已被占用，请先停掉自己的 app.py，避免连到旧代码假通过。")
        return 2

    proc = subprocess.Popen([PY, "app.py"], cwd=ROOT)
    try:
        if not wait_server():
            check("服务启动并监听 5000", False, "端口未就绪")
            return 1
        check("服务启动并监听 5000", True)

        with sync_playwright() as p:
            browser = launch_browser(p, headless=False, slow_mo=60,
                                     args=["--disable-dev-shm-usage"])
            ctx = browser.new_context(viewport={"width": 1440, "height": 900})
            ctx.grant_permissions(["clipboard-read", "clipboard-write"], origin=BASE)
            page = ctx.new_page()
            page.on("console", lambda m: console_errors.append(m.text)
                    if m.type == "error" else None)
            page.on("pageerror", lambda e: console_errors.append(f"PAGEERROR: {e}"))

            page.goto(BASE, wait_until="networkidle", timeout=30000)
            page.wait_for_selector("#input-area", timeout=10000)

            # ---------- C2 / C5：假控件已下线 ----------
            n_sw = page.locator("#sw-chip").count()
            n_imp = page.locator("#btn-import").count()
            check("C2 「智能转换」假开关已下线", n_sw == 0, f"#sw-chip={n_sw}")
            check("C5 「导入文档」占位按钮已下线", n_imp == 0, f"#btn-import={n_imp}")

            # ---------- C6：识别结构胶囊是纯展示 ----------
            page.fill("#input-area", "审计标题\n\n这是正文第一段，用来验证结构胶囊。\n\n- 列表项一\n- 列表项二")
            page.wait_for_timeout(1600)
            chips = page.evaluate("""() => {
              const list = [...document.querySelectorAll('#parse-chips .parse-chip')];
              if (!list.length) return null;
              const c = getComputedStyle(list[0]);
              return { tag: list[0].tagName, cursor: c.cursor, text: list[0].textContent };
            }""")
            ok_c6 = bool(chips) and chips["tag"] == "SPAN" and chips["cursor"] != "pointer"
            check("C6 识别结构胶囊是纯展示（span，无手型光标）", ok_c6, str(chips))

            # ---------- C8：草稿真落盘 + 刷新恢复 ----------
            page.wait_for_timeout(900)
            draft = page.evaluate("() => { try { return JSON.parse(localStorage.getItem('supersu.draft.v1')||'null'); } catch(e) { return null; } }")
            foot = page.evaluate("() => document.getElementById('foot-status').textContent.trim()")
            ok_draft = bool(draft) and "审计标题" in (draft.get("text") or "")
            check("C8a 输入后真实写入 localStorage 草稿", ok_draft,
                  f"ts={draft and draft.get('ts')} foot={foot!r}")
            check("C8b 页脚「已保存」有时间戳（不是假文案）", foot.startswith("已保存 · "), foot)

            # 反向对照：先清空（会写入空草稿），刷新后不能把旧文复活
            page.fill("#input-area", "")
            page.wait_for_timeout(800)
            page.reload(wait_until="networkidle", timeout=30000)
            page.wait_for_timeout(900)
            empty_after = page.input_value("#input-area")
            check("C8c 清空后刷新不复活旧草稿", empty_after.strip() == "", f"{len(empty_after)} 字")

            # 正向对照：写入随机 marker 的草稿，新开页面（不是 reload，避免 pagehide 回写）
            marker = "草稿恢复标记-8f3a"
            page.evaluate("(m) => localStorage.setItem('supersu.draft.v1', JSON.stringify({text:'# '+m+'\\n\\n正文', themeId:null, ts:Date.now(), v:1}))", marker)
            page2 = ctx.new_page()
            page2.goto(BASE, wait_until="networkidle", timeout=30000)
            page2.wait_for_timeout(1200)
            restored = page2.input_value("#input-area")
            check("C8d 新页面按 localStorage 恢复草稿", marker in restored, f"{len(restored)} 字")
            page2.close()

            # ---------- C1：看示例可撤销 ----------
            page.fill("#input-area", "这是我辛苦写的内容，不能被静默清空。")
            page.wait_for_timeout(900)
            page.click("#btn-demo")
            page.wait_for_timeout(600)
            v_after = page.input_value("#input-area")
            toast1 = page.evaluate("() => document.getElementById('toast-el').textContent")
            has_undo = page.locator("#toast-el .undo").count()
            check("C1a 看示例：载入示例且给出撤销", v_after.startswith("今天分享一个有趣的项目") and has_undo > 0,
                  f"toast={toast1[:24]!r} undo={has_undo}")
            page.locator("#toast-el .undo").click(timeout=6000)
            page.wait_for_timeout(600)
            v_undo = page.input_value("#input-area")
            check("C1b 撤销恢复到用户原文", "辛苦写的内容" in v_undo, f"{len(v_undo)} 字")

            # ---------- C9 / C3：清空可撤销 + 空态恢复 ----------
            page.fill("#input-area", "清空前的正文内容。")
            page.wait_for_timeout(1400)
            page.click("#btn-clear")
            page.wait_for_timeout(700)
            empty_val = page.input_value("#input-area")
            pv_visible = page.is_visible("#pv-empty-state")
            iframe_text = page.evaluate("""() => {
              const f = document.getElementById('preview-frame');
              const d = f && f.contentDocument;
              return d && d.body ? d.body.innerText.trim() : '';
            }""")
            check("C3 清空后预览恢复空态", empty_val == "" and pv_visible and iframe_text == "",
                  f"input={len(empty_val)} pv空态={pv_visible} iframe={iframe_text[:20]!r}")
            has_undo2 = page.locator("#toast-el .undo").count()
            check("C9a 清空给出撤销入口", has_undo2 > 0, f"undo={has_undo2}")
            if has_undo2:
                page.locator("#toast-el .undo").click(timeout=6000)
                page.wait_for_timeout(900)
                check("C9b 撤销恢复清空前的文字", "清空前的正文内容" in page.input_value("#input-area"))
            else:
                check("C9b 撤销恢复清空前的文字", False, "没有撤销按钮")

            # ---------- C10：整理格式保留缩进 ----------
            code_text = (
                "格式测试标题\n\n"
                "```python\n"
                "def main():\n"
                "    x = 1\n"
                "    return x\n"
                "```\n\n"
                "- 一级\n"
                "  - 二级子项\n"
                "   \n"
            )
            page.fill("#input-area", code_text)
            page.wait_for_timeout(1200)
            page.click("#btn-format")
            page.wait_for_timeout(600)
            after_fmt = page.input_value("#input-area")
            hint = page.evaluate("() => document.getElementById('tidy-hint').textContent.trim()")
            ok_c10 = ("    x = 1" in after_fmt and "    return x" in after_fmt
                      and "  - 二级子项" in after_fmt and "def main():" in after_fmt
                      and "- 一级" in after_fmt and hint == "已整理 1 行")
            check("C10 整理格式保留代码/嵌套列表缩进，并报真实行数", ok_c10,
                  f"hint={hint!r}")

            # ---------- C12：Ctrl+Enter 复制 ----------
            page.fill("#input-area", "快捷键标题\n\n用来验证 Ctrl+Enter 真的能复制。")
            page.wait_for_timeout(1800)
            page.keyboard.press("Control+Enter")
            page.wait_for_timeout(800)
            btn_html = page.evaluate("() => document.getElementById('btn-copy').innerHTML")
            clip = page.evaluate("""async () => {
              try {
                const items = await navigator.clipboard.read();
                const out = [];
                for (const it of items) {
                  if (it.types.includes('text/html')) out.push(await (await it.getType('text/html')).text());
                }
                return out.join('');
              } catch (e) { return 'ERR:' + e.message; }
            }""")
            check("C12 Ctrl+Enter 复制了本轮正文（读剪贴板验证）",
                  "用来验证 Ctrl+Enter" in clip and "已复制" in btn_html,
                  f"clip={len(clip)} 字 btn={'已复制' in btn_html}")

            # ---------- C4：抽屉选主题后关闭 ----------
            page.click("#btn-all-tpl")
            page.wait_for_timeout(600)
            open_before = page.evaluate("() => document.getElementById('drawer-tpl').classList.contains('open')")
            page.locator("#drawer-grid .d-card").first.click()
            page.wait_for_timeout(900)
            open_after = page.evaluate("() => document.getElementById('drawer-tpl').classList.contains('open')")
            check("C4 抽屉选主题后自动关闭", open_before and not open_after,
                  f"打开前={open_before} 选中后={open_after}")

            # ---------- C7：小红书超 500 字变红 ----------
            page.click(".tab-btn[data-page='social']")
            page.wait_for_timeout(600)
            # 首次进小红书会弹使用教程，遮挡按钮：先关掉（这是产品行为，不是缺陷）
            page.evaluate("() => document.querySelectorAll('.tutorial-modal').forEach(m => m.remove())")
            page.fill("#social-text", "字" * 520)
            page.wait_for_timeout(400)
            counter = page.evaluate("""() => {
              const el = document.getElementById('social-char-count');
              return { text: el.textContent.trim(), over: el.classList.contains('over'), color: getComputedStyle(el).color };
            }""")
            check("C7 小红书超 500 字：计数器变红", counter["over"] and "520" in counter["text"],
                  str(counter))

            # ---------- C11：生成失败不再永久 loading ----------
            # 先选一个风格（不选风格生成按钮会提前 return，测不到失败分支）
            page.locator("#social-tpl-grid .tpl-mini").first.click()
            page.wait_for_timeout(500)
            page.route("**/api/social/generate", lambda route: route.fulfill(
                status=500, content_type="application/json", body='{"error":"audit injected"}'))
            page.click("#btn-generate-cover")
            try:
                page.wait_for_function("() => (document.getElementById('results-empty')?.textContent || '').includes('失败')", timeout=30000)
            except Exception:
                pass
            stage = page.evaluate("() => { const e = document.getElementById('results-empty'); return e ? e.textContent.trim() : ''; }")
            gen_state = page.evaluate("() => { const b = document.getElementById('btn-generate-cover'); return { text: b.textContent.trim(), disabled: b.disabled }; }")
            page.unroute("**/api/social/generate")
            check("C11 生成失败有失败态且按钮复位",
                  "失败" in stage and not gen_state["disabled"] and "生成" in gen_state["text"],
                  f"stage={stage[:30]!r} btn={gen_state}")

            page.screenshot(path=os.path.join(ROOT, "output", "headed_audit_fixes.png"))
            browser.close()

        print("\n" + "=" * 56)
        failed = [r for r in results if not r[1]]
        print(f"审计修复验证：{len(results) - len(failed)}/{len(results)} 通过")
        real_errors = [e for e in console_errors if "status of 500" not in e]
        if real_errors:
            print("控制台报错：", real_errors[:5])
        else:
            print("✅ 无 JS 控制台报错（已排除 C11 故意注入的 500）")
        if failed:
            for n, _, d in failed:
                print("  FAIL:", n, d)
            return 1
        return 0
    finally:
        proc.terminate()
        try:
            proc.wait(timeout=8)
        except Exception:
            proc.kill()


if __name__ == "__main__":
    sys.exit(run())
