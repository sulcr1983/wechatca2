"""
前端有头全按钮 E2E（双页全量）
==============================================================
真实启动 Flask + Playwright Chromium（headless=False，可见窗口），
按真实用户顺序驱动前端，逐个点击公众号页 + 小红书页的【每一个按钮/交互】，
并验证对应输出真实可用；全程断言 0 控制台报错 / 0 未捕获异常。

公众号页覆盖：
  设置 / 模板筛选 / 模板收展 / 输入渲染 / 预览HTML⇄手机 / 切主题 / AI面板 /
  AI智能排版 / AI润色(开始+应用到编辑区) / AI摘要 / AI封面 / 复制(富文本硬验证) /
  历史 / 一键推送 / 账号管理(打开+UI新增+UI删除) / 推送(不真推，见下)
小红书页覆盖：
  切页 / 平台(xhs⇄wx) / 填文案(字数统计) / 引擎(归藏⇄BC) / 选风格(预览卡) /
  生成封面(结果卡真实图+底图署名) / 点击结果卡开Lightbox(大图真实) / 关闭Lightbox

安全策略（刻意避开的真实副作用）：
  - `确认推送`(confirmPush) 不点：会真的打微信公众号接口
  - `保存AI配置`(saveAiConfig) / `测试连接`(testAiConfig) 不点：会覆盖 data/ai_config.json
  - 这几个按钮的后端路径由 tests/test_api_e2e.py 覆盖
  - 本套件会通过 UI 建/删账号 → 测试前快照 data/*.json，退出时(含崩溃)还原

运行：python tests/test_headed_full_e2e.py
（脚本自起/自停服务；需 playwright + chromium）
"""
import atexit
import sys
import time
import subprocess
import os
import pathlib
import urllib.request
from playwright.sync_api import sync_playwright

# Windows 管道/重定向默认 GBK，✓/✗ 等字符会 UnicodeEncodeError；强制 UTF-8
try:
    if (sys.stdout.encoding or "").lower() not in ("utf-8", "utf8"):
        sys.stdout.reconfigure(encoding="utf-8", errors="replace")
        sys.stderr.reconfigure(encoding="utf-8", errors="replace")
except Exception:
    pass

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
PY = sys.executable
BASE = "http://127.0.0.1:5000"
DATA_DIR = pathlib.Path(ROOT) / "data"

# 本套件会通过 UI 建/删账号（写 data/accounts.json）——测试前快照，退出时还原（含中途崩溃）
_DATA_SNAPSHOT = {p.name: p.read_text(encoding="utf-8") for p in DATA_DIR.glob("*.json")}


def _restore_data():
    for f in DATA_DIR.glob("*.json"):
        if f.name in _DATA_SNAPSHOT:
            f.write_text(_DATA_SNAPSHOT[f.name], encoding="utf-8")
        else:
            f.unlink(missing_ok=True)


atexit.register(_restore_data)

results = []
console_errors = []


def check(name, ok, detail=""):
    results.append((name, ok, detail))
    print(f"[{'PASS' if ok else 'FAIL'}] {name}" + (f" — {detail}" if detail else ""))


def wait_server(timeout=45):
    t0 = time.time()
    while time.time() - t0 < timeout:
        try:
            urllib.request.urlopen(BASE, timeout=2)
            return True
        except Exception:
            time.sleep(0.5)
    return False


def _port_busy(port=5000):
    import socket
    with socket.socket(socket.AF_INET, socket.SOCK_STREAM) as s:
        s.settimeout(0.5)
        return s.connect_ex(("127.0.0.1", port)) == 0


def run():
    # 端口被占（多半是你自己的 app.py 在跑）时，本脚本的子进程会 bind 失败退出，
    # 而 wait_server() 会连上那个旧进程 → 用陈旧代码静默假通过。必须先拦截。
    if _port_busy():
        print("[ABORT] 端口 5000 已被占用（可能是你自己的 app.py 正在运行）。")
        print("        请先停掉它再跑本套件，否则会连到旧进程、拿陈旧代码假通过。")
        return 2
    proc = subprocess.Popen([PY, "app.py"], cwd=ROOT)
    try:
        if not wait_server():
            check("服务启动并监听 5000", False, "端口未在超时内就绪")
            return 1
        check("服务启动并监听 5000", True)

        with sync_playwright() as p:
            browser = p.chromium.launch(headless=False, slow_mo=100,
                                        args=["--disable-dev-shm-usage"])
            context = browser.new_context(viewport={"width": 1440, "height": 900})
            context.grant_permissions(["clipboard-read", "clipboard-write"], origin=BASE)
            page = context.new_page()
            page.on("console", lambda m: console_errors.append(m.text)
                    if m.type == "error" else None)
            page.on("pageerror", lambda e: console_errors.append(f"PAGEERROR: {e}"))

            def close_modals():
                page.evaluate("document.querySelectorAll('.modal').forEach(m=>m.remove())")
                page.wait_for_timeout(150)

            # ============ 公众号页 ============
            page.goto(BASE, wait_until="networkidle", timeout=30000)
            check("首页加载 / #page-wechat 可见", page.is_visible("#page-wechat", timeout=10000))

            # 1) 设置
            page.click("#btn-settings", timeout=10000)
            try:
                page.wait_for_selector(".modal", timeout=5000)
                check("设置按钮：打开设置弹窗", True)
            except Exception as e:
                check("设置按钮：打开设置弹窗", False, str(e)[:120])
            close_modals()

            # 2) 模板筛选（取首个主题名做子串，保证命中；验证匹配 name+id+group）
            n_all = page.locator("#tpl-strip .tpl-card").count()
            first_name = ""
            try:
                first_name = page.locator("#tpl-strip .tpl-card .tname").first.text_content() or ""
            except Exception:
                first_name = ""
            kw = first_name[:2] if len(first_name) >= 2 else (first_name or "杂志")
            page.fill("#tpl-search", kw)
            page.wait_for_timeout(400)
            n_filtered = page.locator("#tpl-strip .tpl-card").count()
            check("模板筛选：输入子串后列表收敛", n_all > 0 and 0 < n_filtered <= n_all,
                  f"kw={kw!r} all={n_all} filtered={n_filtered}")
            page.fill("#tpl-search", "")
            page.wait_for_timeout(300)

            # 3) 模板收展（collapsed 类在 .tpl-bar 上）
            before = page.evaluate("document.querySelector('.tpl-bar').classList.contains('collapsed')")
            page.click("#tpl-toggle", timeout=5000)
            page.wait_for_timeout(200)
            after = page.evaluate("document.querySelector('.tpl-bar').classList.contains('collapsed')")
            check("模板收展：#tpl-toggle 切换 .tpl-bar.collapsed", before != after,
                  f"before={before} after={after}")
            if after:  # 结束后若是收起态，重新展开以保证后续步骤可见
                page.click("#tpl-toggle", timeout=5000)
                page.wait_for_timeout(200)

            # 4) 输入渲染
            page.wait_for_selector("#input-area", timeout=10000)
            page.fill("#input-area",
                      "# 苏哥测试标题\n这是一段用于 E2E 的正文，确认渲染与复制都正常。\n\n- 要点一\n- 要点二")
            try:
                page.wait_for_function(
                    """() => {
                        const f = document.getElementById('preview-frame');
                        return f && f.style.display !== 'none'
                            && f.contentDocument && f.contentDocument.body
                            && f.contentDocument.body.innerText.trim().length > 0;
                    }""", timeout=15000)
                pv = page.evaluate("document.getElementById('preview-frame').contentDocument.body.innerText.trim().length")
                check("输入渲染：预览 iframe 有内容", True, f"预览正文 {pv} 字")
            except Exception as e:
                check("输入渲染：预览 iframe 有内容", False, str(e)[:160])

            # 5) 预览 HTML ⇄ 手机
            page.click('.pv-btn[data-preview="phone"]', timeout=5000)
            page.wait_for_timeout(300)
            ph_active = page.evaluate("document.querySelector('.pv-btn[data-preview=\"phone\"]').classList.contains('active')")
            check("预览切换：手机模式激活", ph_active)
            page.click('.pv-btn[data-preview="html"]', timeout=5000)
            page.wait_for_timeout(300)
            html_active = page.evaluate("document.querySelector('.pv-btn[data-preview=\"html\"]').classList.contains('active')")
            check("预览切换：HTML 模式恢复激活", html_active)

            # 6) 切换主题（点第 2 张卡，重渲染）
            cards = page.locator("#tpl-strip .tpl-card")
            if cards.count() > 1:
                try:
                    cards.nth(1).click(timeout=5000)
                    page.wait_for_timeout(800)
                    re_ok = page.evaluate(
                        "document.getElementById('preview-frame').contentDocument.body.innerText.trim().length > 0")
                    check("切换主题：点击第 2 张色卡后预览刷新", re_ok)
                except Exception as e:
                    check("切换主题：点击第 2 张色卡后预览刷新", False, str(e)[:120])
            else:
                check("切换主题：点击第 2 张色卡后预览刷新", False, "色卡不足 2 张")

            # 7) AI 面板展开
            page.click("#ai-toggle", timeout=5000)
            ai_open = page.evaluate("document.getElementById('ai-panel').classList.contains('open')")
            check("AI 工具：面板展开", ai_open)

            # 8) AI 智能排版：有 LLM 走 LLM；无配置走本地规则兜底。真实产出或真报错
            # 换成无结构散文——原输入本身已是规范 Markdown，本地规则跑完不变，断言会失去意义
            page.fill("#input-area",
                      "苏哥测试标题\n这是一段用于 E2E 的正文，确认渲染与复制都正常。\n\n方案选型\n\n我考虑过几种方案。")
            before_ai = page.input_value("#input-area")
            page.click("#btn-ai-format", timeout=5000)
            try:
                page.wait_for_function(
                    """() => {
                        const t = document.getElementById('toast-el').textContent || '';
                        return t.indexOf('排版完成') >= 0
                            || t.indexOf('本地规则排版') >= 0
                            || t.indexOf('排版失败') >= 0;
                    }""", timeout=45000)
            except Exception:
                pass
            ai_toast = page.evaluate("document.getElementById('toast-el').textContent || ''")
            after_ai = page.input_value("#input-area")
            check("AI 智能排版：真实产出或真报错",
                  ("失败" in ai_toast)
                  or (after_ai.strip() != before_ai.strip() and after_ai.strip().startswith("#")),
                  f"toast={ai_toast[:24]!r}；{len(before_ai)} 字 → {len(after_ai)} 字")

            # 9) AI 润色（开模态 → 开始润色 → 应用结果 / 优雅降级）
            page.click("#btn-polish", timeout=5000)
            try:
                page.wait_for_selector("#polish-start", timeout=5000)
                page.click("#polish-start", timeout=5000)
                # 轮询到真正结束：成功 = apply 出现；失败 = start 按钮复位。
                # 不用固定 sleep——否则「响应慢」会被误判成「优雅降级」而假通过。
                try:
                    page.wait_for_function("""() => {
                        const a = document.getElementById('polish-apply');
                        const s = document.getElementById('polish-start');
                        return (a && a.style.display !== 'none') || (s && !s.disabled);
                    }""", timeout=45000)
                except Exception:
                    pass
                has_result = page.evaluate(
                    "!!document.getElementById('polish-result') && document.getElementById('polish-result').value.length >= 0")
                check("AI 润色：模态打开并可触发（结果区存在）", has_result)

                # 9b) 应用到编辑区：成功 → 写回编辑区；真报错 → apply 保持隐藏
                st = page.evaluate("""() => {
                    const b = document.getElementById('polish-apply');
                    const s = document.getElementById('polish-start');
                    const r = document.getElementById('polish-result');
                    return {visible: !!b && b.style.display !== 'none',
                            text: (r && r.value) ? r.value : '',
                            errored: !!s && !s.disabled};
                }""")
                if st["visible"] and st["text"].strip():
                    page.click("#polish-apply", timeout=5000)
                    page.wait_for_timeout(500)
                    after = page.input_value("#input-area")
                    check("AI 润色：应用到编辑区生效", after.strip() == st["text"].strip(),
                          f"编辑区已替换为润色结果（{len(after)} 字）")
                else:
                    check("AI 润色：应用到编辑区生效",
                          st["errored"],
                          "LLM 报错未出结果 → apply 保持隐藏（优雅降级，无未捕获异常）"
                          if st["errored"] else "45s 内未结束且未报错（疑似卡住）")
            except Exception as e:
                check("AI 润色：模态打开并可触发", False, str(e)[:120])
            close_modals()

            # 10) 复制（富文本硬验证）
            page.evaluate("""
            window.__clip = {writeCalled:false, types:[], items:0, execCalled:false};
            try {
              const _w = navigator.clipboard.write.bind(navigator.clipboard);
              navigator.clipboard.write = async function(items){
                window.__clip.writeCalled = true;
                window.__clip.items = items.length;
                for (const it of items){
                  try { window.__clip.types.push(it.types || []); } catch(e){}
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
            if probe.get("writeCalled"):
                flat = [t for grp in probe.get("types", []) for t in grp]
                ok = "text/html" in flat and "text/plain" in flat
                detail = f"clipboard.write 成功，MIME={flat}（公众号可渲染富文本）" if ok else f"MIME 异常:{flat}"
            elif probe.get("execCalled"):
                ok = True
                detail = "Clipboard API 不可用，已走 execCommand 富文本兜底"
            else:
                ok = False
                detail = "未调用 clipboard.write 也未走 execCommand（复制失败）"
            check("复制按钮：写入 text/html 富文本剪贴板（公众号可渲染）", ok, detail)

            # 11) 历史
            page.click("#btn-history", timeout=10000)
            try:
                page.wait_for_selector(".modal", timeout=5000)
                check("历史按钮：打开历史弹窗", True)
            except Exception as e:
                check("历史按钮：打开历史弹窗", False, str(e)[:120])
            close_modals()

            # 12) 一键推送：U-6 新契约 —— 未绑定公众号时先给引导，不直接开推送弹窗
            page.click("#btn-push", timeout=10000)
            page.wait_for_timeout(1300)
            guided = page.evaluate("""() => {
                const t = document.getElementById('toast-el');
                const byToast = !!t && t.innerText.includes('绑定');
                return byToast || document.querySelectorAll('.modal').length > 0;
            }""")
            check("一键推送：未配置公众号时给出绑定引导（U-6 新契约）", guided)
            close_modals()

            # 12-1) 先用 UI 建一个临时账号（后文 UI 删除，自清理），使推送弹窗可达
            tag = str(int(time.time()))
            tmp_nick = f"E2E临时账号{tag}"
            page.evaluate("() => openAccountModal()")
            page.wait_for_timeout(1200)
            page.fill("#acct-nickname", tmp_nick)
            page.fill("#acct-appid", f"wx_e2e_{tag}")
            page.fill("#acct-appsecret", "e2e_temp_secret_000000000000")
            page.click('button.primary:has-text("添加")', timeout=5000)
            page.wait_for_timeout(1500)
            rows = page.locator("#acct-list > div", has_text=tmp_nick)
            added = rows.count() == 1
            check("账号管理：UI 添加账号后出现在列表", added,
                  f"列表命中 {rows.count()} 行" if added else "添加后列表未见该账号")
            close_modals()

            # 12-2) 已有账号 → 点推送应正常打开推送弹窗
            page.click("#btn-push", timeout=10000)
            try:
                page.wait_for_selector("#push-title", timeout=6000)
                check("一键推送：已配置后打开推送弹窗", True)

                # 12a) AI 摘要（有结果则写入摘要框；LLM 降级则按钮复位且无未捕获异常）
                page.click('button:has-text("AI 生成摘要")', timeout=5000)
                try:
                    page.wait_for_function("""() => {
                        const b = [...document.querySelectorAll('button')].find(x=>x.textContent.trim()==='AI 生成摘要');
                        const s = (document.getElementById('push-summary')||{}).value || '';
                        return s.trim().length > 0 || (b && !b.disabled);
                    }""", timeout=45000)
                except Exception:
                    pass
                sm = page.evaluate("""() => {
                    const b = [...document.querySelectorAll('button')].find(x=>x.textContent.trim()==='AI 生成摘要');
                    return {sum: (document.getElementById('push-summary')||{}).value || '',
                            reset: !!b && !b.disabled};
                }""")
                if sm["sum"].strip():
                    check("AI 摘要：点击后生成并写入摘要框", sm["reset"],
                          f"摘要 {len(sm['sum'])} 字，按钮已复位")
                else:
                    check("AI 摘要：点击后生成并写入摘要框", sm["reset"],
                          "LLM 未返回摘要 → 按钮复位（优雅降级，无未捕获异常）")

                # 12b) AI 封面（有图则渲染进 #cover-preview；失败则仅改状态文案）
                page.fill("#push-title", "有头测试标题")
                page.click('button:has-text("AI 生成封面")', timeout=5000)
                try:
                    page.wait_for_function("""() => {
                        const p = document.getElementById('cover-preview');
                        const b = [...document.querySelectorAll('button')].find(x=>x.textContent.trim()==='AI 生成封面');
                        return (p && !!p.querySelector('img')) || (b && !b.disabled);
                    }""", timeout=90000)
                except Exception:
                    pass
                cv = page.evaluate("""() => {
                    const p = document.getElementById('cover-preview');
                    const b = [...document.querySelectorAll('button')].find(x=>x.textContent.trim()==='AI 生成封面');
                    return {hasImg: !!p && !!p.querySelector('img'),
                            status: (document.getElementById('cover-status')||{}).textContent || '',
                            reset: !!b && !b.disabled};
                }""")
                if cv["hasImg"]:
                    check("AI 封面：点击后渲染真实封面图", cv["reset"],
                          f"preview 内含 <img>；状态={cv['status']}")
                else:
                    check("AI 封面：点击后渲染真实封面图", cv["reset"],
                          f"未出图 → 按钮复位（优雅降级）；状态={cv['status']}")

                # 13) 账号管理：删除 12-1) 建的临时账号（自清理，不留残留）
                page.click("text=管理", timeout=5000)
                page.wait_for_timeout(900)
                nmod = page.evaluate("document.querySelectorAll('.modal').length")
                check("推送弹窗内：打开账号管理弹窗", nmod >= 1, f"modal 数={nmod}")

                rows = page.locator("#acct-list > div", has_text=tmp_nick)
                if rows.count() >= 1:
                    rows.first.locator("button").first.click(timeout=5000)
                    page.wait_for_timeout(1500)
                    left = page.locator("#acct-list > div", has_text=tmp_nick).count()
                    check("账号管理：UI 删除账号后从列表消失", left == 0,
                          f"删除后仍剩 {left} 行" if left else "已清除")
                else:
                    check("账号管理：UI 删除账号后从列表消失", False, "列表中未见临时账号")
            except Exception as e:
                check("一键推送：已配置后打开推送弹窗", False, str(e)[:120])
            close_modals()

            # ============ 小红书页 ============
            page.click('.tab-btn[data-page="social"]', timeout=10000)
            try:
                page.wait_for_selector("#page-social.active", timeout=10000)
                check("切换到小红书页 #page-social", True)
            except Exception as e:
                check("切换到小红书页 #page-social", False, str(e)[:120])

            # 14) 平台切换
            page.click('.plt-btn[data-platform="wx"]', timeout=5000)
            wx_active = page.evaluate("document.querySelector('.plt-btn[data-platform=\"wx\"]').classList.contains('active')")
            page.click('.plt-btn[data-platform="xhs"]', timeout=5000)
            xhs_active = page.evaluate("document.querySelector('.plt-btn[data-platform=\"xhs\"]').classList.contains('active')")
            check("平台切换：wx ⇄ xhs 激活态切换", wx_active and xhs_active)

            # 15) 填文案 + 字数统计
            page.fill("#social-text", "周末去海边旅行放空，拍一组氛围感照片，配文案发小红书。")
            page.wait_for_timeout(300)
            cnt = page.evaluate("document.getElementById('social-char-count').textContent")
            check("填文案：字数统计更新", "/ 500" in cnt and cnt.split("/")[0].strip().isdigit() and int(cnt.split("/")[0]) > 0,
                  f"计数={cnt}")

            # 16) 风格分组切换（动态 tab，按 API group 渲染，不依赖具体组名）
            tabs = page.locator(".style-tab")
            n_tabs = tabs.count()
            check("风格分组：tab 数 ≥ 2（归藏/静纸/实证 等）", n_tabs >= 2, f"tab 数={n_tabs}")
            tabs.nth(0).click(timeout=5000)
            page.wait_for_selector("#social-tpl-grid .tpl-mini", timeout=8000)
            g0 = page.locator("#social-tpl-grid .tpl-mini").count()
            check("风格分组：第 1 组（归藏）风格卡加载", g0 > 0, f"第1组风格数={g0}")
            tabs.nth(1).click(timeout=5000)
            page.wait_for_selector("#social-tpl-grid .tpl-mini", timeout=8000)
            g1 = page.locator("#social-tpl-grid .tpl-mini").count()
            check("风格分组：第 2 组（BLCaptain 子类）风格卡加载", g1 > 0, f"第2组风格数={g1}")

            # 切回第 1 组并选首个风格（归藏渲染更快、稳定）
            tabs.nth(0).click(timeout=5000)
            page.wait_for_selector("#social-tpl-grid .tpl-mini", timeout=8000)
            page.locator("#social-tpl-grid .tpl-mini").first.click(timeout=5000)
            page.wait_for_timeout(400)
            spv_visible = page.evaluate(
                "(() => { const c=document.getElementById('spv-card'); return c && c.style.display!=='none' && c.innerText.trim().length>0; })()")
            check("选风格：预览卡 #spv-card 显示内容", spv_visible)

            # 18) 生成封面
            page.click("#btn-generate-cover", timeout=10000)
            try:
                page.wait_for_selector("#results-list .result-card", timeout=60000)
                n = page.locator("#results-list .result-card").count()
                # 确定性校验：逐张结果图做 HTTP GET，验证 200 + 有效 PNG 字节
                # （不依赖浏览器解码——2MB+ 大图在开发服务器下解码偏慢，属测试时序非产品缺陷）
                srcs = page.evaluate(
                    "() => [...document.querySelectorAll('#results-list .result-card img')].map(i=>i.src)")
                real = 0
                bad = []
                for s in srcs:
                    try:
                        resp = urllib.request.urlopen(s, timeout=30)
                        data = resp.read()
                        if resp.status == 200 and len(data) > 100 and s.endswith(".png"):
                            real += 1
                        else:
                            bad.append((s.split("/")[-1], resp.status, len(data)))
                    except Exception as e:
                        bad.append((s.split("/")[-1], "ERR", str(e)[:40]))
                check("生成封面：结果卡片出现且为真实渲染图（HTTP 校验）", n > 0 and real == n,
                      f"卡片={n} 真实图={real} bad={bad}")
            except Exception as e:
                check("生成封面：结果卡片出现且为真实渲染图（HTTP 校验）", False, str(e)[:160])

            # 19) 底图署名
            try:
                credit = page.evaluate("""() => {
                    const c=document.getElementById('bg-credit');
                    return (c && c.style.display!=='none') ? c.innerText.trim() : '';
                }""")
                # U-4 新契约：联网命中→"底图来源：X"；降级本地→"联网没找到…已用本地底图"；
                # 两种情况都必须如实，且不得再出现旧的写死文案"自动联网搜索"
                ok = (("底图来源" in credit) or ("没找到" in credit and "本地底图" in credit)) \
                    and ("自动联网搜索" not in credit)
                check("底图署名：如实说明来源（U-4 新契约）", ok, f"署名={credit[:60]}")
            except Exception as e:
                check("底图署名：如实说明来源（U-4 新契约）", False, str(e)[:120])

            # 20) 点击结果卡开 Lightbox + 21) 关闭
            page.locator("#results-list .result-card").first.click(timeout=8000)
            page.wait_for_timeout(500)
            lb = page.evaluate("""() => {
                const l=document.getElementById('lightbox');
                const img=document.getElementById('lb-img');
                return {show: l.classList.contains('show'),
                        src: img.src,
                        w: img.naturalWidth};
            }""")
            ok = lb["show"] and "/output/" in lb["src"] and lb["w"] > 0
            check("点击结果卡：Lightbox 打开且大图为真实渲染图", ok,
                  f"show={lb['show']} w={lb['w']}")
            page.click("#lb-close", timeout=5000)
            page.wait_for_timeout(300)
            lb_hidden = page.evaluate("!document.getElementById('lightbox').classList.contains('show')")
            check("关闭 Lightbox：#lb-close 生效", lb_hidden)

            page.screenshot(path=os.path.join(ROOT, "output", "headed_full_e2e.png"))
            print("  -> 截图 output/headed_full_e2e.png")
            browser.close()
    finally:
        try:
            proc.terminate()
            proc.wait(timeout=5)
        except Exception:
            proc.kill()

    print("\n" + "=" * 56)
    passed = sum(1 for _, ok, _ in results if ok)
    total = len(results)
    print(f"前端有头全按钮 E2E：{passed}/{total} 通过")
    if console_errors:
        print(f"\n⚠️ 页面 JS 报错 {len(console_errors)} 条：")
        for e in console_errors[:12]:
            print("   -", e[:160])
    else:
        print("✅ 页面无 JS 控制台报错 / 未捕获异常")
    print("=" * 56)
    return 0 if (passed == total and not console_errors) else 1


if __name__ == "__main__":
    sys.exit(run())
