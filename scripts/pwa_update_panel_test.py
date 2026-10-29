#!/usr/bin/env python
"""PWA「更新记录里检查更新 + 一键更新」专项验证（本地 dist，有头）

验证 2026-10-29 的更新模块改造：
  1. 打开更新记录 → **自动**检查服务器版本（状态条先「正在检查」后「已是最新」）；
  2. 服务器发了新版本 → 状态条变「新版本已就绪」，并给出「立即重启」；
  3. 点「立即重启」→ 自动完成（落盘 → 接管 → reload），右下角出现「已升级」小提示；
  4. 点小提示 → 更新记录里能看见**本次**更新（banner 有 N 条，条目高亮，N > 0）——
     旧实现在这里恒为 0 条；
  5. 反馈入口指向 sulcr@qq.com，且邮件里带上版本信息；
  6. 全程零 JS 未捕获异常。

探针手法与 pwa_auto_update_test.py 一致：拷一份 dist 到系统临时目录，改写里面的
version.json / sw.js / changelog.json 来模拟「服务器发版」，不 mock Service Worker。
"""
import functools
import http.server
import json
import re
import shutil
import socketserver
import sys
import tempfile
import threading
import time
from pathlib import Path

from playwright.sync_api import sync_playwright

try:
    sys.stdout.reconfigure(encoding="utf-8", errors="replace")
except Exception:
    pass

ROOT = Path(__file__).resolve().parents[1]
DIST = ROOT / "pwa" / "dist"
PROBE = Path(tempfile.gettempdir()) / "supersu-update-panel-probe"
SHOTS = ROOT / "output" / "update-panel"
results = []


def check(name, ok, detail=""):
    results.append((name, ok, detail))
    print(f"[{'PASS' if ok else 'FAIL'}] {name}" + (f" — {detail}" if detail else ""))


class Quiet(http.server.SimpleHTTPRequestHandler):
    def log_message(self, *args):
        pass


def start_server(directory):
    handler = functools.partial(Quiet, directory=str(directory))
    srv = socketserver.ThreadingTCPServer(("127.0.0.1", 0), handler)
    srv.daemon_threads = True
    threading.Thread(target=srv.serve_forever, daemon=True).start()
    return srv, srv.server_address[1]


def bump_probe(version: str | None = None):
    """模拟一次发布：版本号 patch +1、BUILD_ID 改写、更新记录里补一条新版本。

    ⚠️ 版本号**必须从当前 version.json 现算**，不能写死。第一版写死成 "1.8.1"，
    真实版本涨到 1.8.3 之后这段就变成了「模拟降级」：探针的 1.8.1 比运行中的 1.8.3
    还旧，`本次更新` 按 since=1.8.3 去数新条目自然是 0 条 → 两条断言假失败。
    """
    ver_path = PROBE / "version.json"
    ver = json.loads(ver_path.read_text(encoding="utf-8"))
    old_version = ver.get("version", "")
    if version is None:
        m = re.fullmatch(r"(\d+)\.(\d+)\.(\d+)", old_version)
        version = f"{m.group(1)}.{m.group(2)}.{int(m.group(3)) + 1}" if m else "9.9.9"
    ver["version"] = version
    ver["build"] = int(ver.get("build") or 0) + 1
    ver_path.write_text(json.dumps(ver, ensure_ascii=False, indent=2), encoding="utf-8")

    sw = PROBE / "sw.js"
    src = sw.read_text(encoding="utf-8")
    m = re.search(r"const BUILD_ID = '([0-9a-zA-Z]+)';", src)
    if m:
        src = src.replace(f"const BUILD_ID = '{m.group(1)}';",
                          f"const BUILD_ID = 'probe{int(time.time())}';", 1)
        sw.write_text(src, encoding="utf-8")

    # 更新记录里加一条新版本（否则「本次更新」确实没有条目可高亮，测不出闭环）
    cl_path = PROBE / "changelog.json"
    cl = json.loads(cl_path.read_text(encoding="utf-8"))
    top = dict(cl["releases"][0])
    top["version"] = version
    top["date"] = time.strftime("%Y-%m-%d")
    top["title"] = "探针版本：验证更新面板"
    top["highlights"] = ["这条是探针造的亮点，用来验证本次更新可见"]
    top["groups"] = [{"type": "added", "label": "新增",
                      "items": [{"text": "探针新增条目", "scope": "probe", "hash": "abcdef1",
                                 "date": time.strftime("%Y-%m-%dT%H:%M:%S+08:00"), "dev": False}]}]
    cl["releases"].insert(0, top)
    cl["version"] = version
    cl_path.write_text(json.dumps(cl, ensure_ascii=False, indent=2), encoding="utf-8")
    return old_version


def main():
    if not (DIST / "index.html").exists():
        print("ERROR: pwa/dist 不存在，先跑 node pwa/scripts/build.mjs")
        return 2

    # 覆盖式拷贝（不做删除：见 pwa_auto_update_test.py 里对执行环境保护的说明）
    shutil.copytree(DIST, PROBE, dirs_exist_ok=True)
    SHOTS.mkdir(parents=True, exist_ok=True)

    srv, port = start_server(PROBE)
    url = f"http://127.0.0.1:{port}/"
    print(f"探针目录 {PROBE}\n服务地址 {url}")

    try:
        with sync_playwright() as p:
            browser = p.chromium.launch(channel="chrome", headless=False,
                                        args=["--window-size=1440,900"])
            ctx = browser.new_context(viewport={"width": 1440, "height": 900})
            page = ctx.new_page()
            errors = []
            page.on("pageerror", lambda e: errors.append(str(e)[:200]))

            # ── 1. 首次加载 + 让页面被 SW 接管 ──────────────────
            page.goto(url, wait_until="domcontentloaded", timeout=60000)
            page.wait_for_function("() => !!navigator.serviceWorker.controller", timeout=40000)
            page.reload(wait_until="domcontentloaded")
            page.wait_for_selector("#btn-update:not([hidden])", timeout=30000)

            # ── 2. 打开面板 → 自动检查 ──────────────────────────
            # 「检查中」持续时间很短（本地毫秒级 + 面板要渲染几百条），
            # 轮询容易错过 → 用 MutationObserver 记录它是否出现过
            page.evaluate("""() => {
              window.__sawCheck = false;
              const el = document.getElementById('cl-status');
              if (!el) return;
              const mark = () => { if (String(el.className).includes('s-check')) window.__sawCheck = true; };
              new MutationObserver(mark).observe(el, { attributes: true, attributeFilter: ['class'] });
              mark();
            }""")
            page.click("#btn-update")
            page.wait_for_selector("#cl-panel:not([hidden])", timeout=10000)
            page.wait_for_function(
                "() => { const e = document.querySelector('#cl-status');"
                " return e && e.textContent.includes('已是最新'); }", timeout=10000)
            page.wait_for_timeout(300)
            check("打开面板即自动检查（出现过「正在检查更新」）",
                  bool(page.evaluate("() => window.__sawCheck")))
            check("检查完成显示「已是最新」", True,
                  (page.text_content("#cl-status") or "").strip().replace("\n", " ")[:40])
            page.screenshot(path=str(SHOTS / "01-latest.png"))
            page.click("#cl-close")
            page.wait_for_timeout(300)

            # ── 3. 模拟服务器发版 → 再查一次 → 已就绪 ───────────
            old_version = bump_probe()
            new_version = json.loads((PROBE / "version.json").read_text(encoding="utf-8"))["version"]
            print(f"  探针已改写为 {new_version}（原 {old_version}），重新打开面板…")

            t0 = page.evaluate("() => performance.timeOrigin")
            # 2026-10-30 修偶发超时：门禁并发跑时（前面刚跑完 164 套模板审计，
            # Chrome 还在回收进程），SW 的 updatefound → installed 链路会慢很多，
            # 60s 不够 → 日志里只有一句 wait_for_function Timeout。
            # 改成「90s 硬等 + 失败后重开面板再试一次」，避免把偶发当回归。
            ready = False
            for attempt in (1, 2):
                page.click("#btn-update")
                page.wait_for_selector("#cl-panel:not([hidden])", timeout=15000)
                try:
                    page.wait_for_function(
                        "() => document.querySelector('#cl-status')?.textContent.includes('已就绪')",
                        timeout=90000)
                    ready = True
                    break
                except Exception:
                    if attempt == 1:
                        print("  （第 1 次等 SW 就绪超时，重开面板再试）")
                        page.click("#cl-close")
                        page.wait_for_timeout(600)
            check("检测到新版本后显示「已就绪」", ready,
                  (page.text_content("#cl-status") or "").strip().replace("\n", " ")[:60])
            page.screenshot(path=str(SHOTS / "02-ready.png"))

            apply_btn = page.query_selector('#cl-status button[data-act="apply"]')
            check("状态条给出「立即重启」按钮", apply_btn is not None)

            # ── 4. 点一下 → 自动完成（reload） ──────────────────
            if apply_btn:
                apply_btn.click()
            reloaded = False
            deadline = time.time() + 40
            while time.time() < deadline:
                try:
                    if page.evaluate("() => performance.timeOrigin") != t0:
                        reloaded = True
                        break
                except Exception:
                    pass
                page.wait_for_timeout(250)
            check("点「立即重启」后自动完成并刷新", reloaded)

            # ── 5. 升级提示 + 本次更新可见（旧实现在这里恒为 0 条）──
            if reloaded:
                page.wait_for_selector("#upd-done:not([hidden])", timeout=20000)
                done_text = (page.text_content("#upd-done") or "").strip()
                check("右下角出现「已升级」小提示",
                      bool(re.search(r"已升级到 v\d+\.\d+\.\d+", done_text)), done_text)

                page.click("#upd-done")
                page.wait_for_selector("#cl-panel:not([hidden])", timeout=10000)
                page.wait_for_timeout(800)
                banner = (page.text_content("#cl-banner") or "").strip()
                fresh = page.eval_on_selector_all(
                    "#cl-panel .cl-item.is-new", "els => els.length")
                check("更新记录里显示「本次更新 N 条」", bool(re.search(r"这次更新了 \d+ 条", banner)), banner)
                check("本次更新的条目被高亮（N > 0）", fresh > 0, f"{fresh} 条")
                page.screenshot(path=str(SHOTS / "03-after-update.png"))

                # ── 6. 反馈入口 ─────────────────────────────────
                hrefs = page.eval_on_selector_all("#cl-foot a", "els => els.map(e => e.href)")
                check("反馈入口指向邮箱", all("sulcr@qq.com" in h for h in hrefs) and len(hrefs) == 2,
                      str([h[:48] for h in hrefs]))
                # 2026-10-30 修：原来写死 "v1.8"，升到 1.9.0 就误报失败。
                # 改成从 dist/version.json 读当前版本，发版后不用再改测试。
                cur_ver = json.loads((DIST / "version.json").read_text(encoding="utf-8"))["version"]
                check("邮件预填版本信息", all(f"v{cur_ver}" in h for h in hrefs),
                      f"应含 v{cur_ver}")
                page.click("#cl-close")

            check("全程无 JS 未捕获异常", not errors, str(errors[:2]))
            browser.close()
    finally:
        srv.shutdown()
        srv.server_close()

    failed = [r for r in results if not r[1]]
    print("\n" + "=" * 52)
    print(f"更新面板：{len(results) - len(failed)}/{len(results)} 通过")
    for n, _, d in failed:
        print("  FAIL:", n, d)
    return 1 if failed else 0


if __name__ == "__main__":
    sys.exit(main())
