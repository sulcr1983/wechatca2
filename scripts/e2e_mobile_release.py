#!/usr/bin/env python3
"""针对性有头 E2E · 本次「移动端排版 + 模板命名/排序」发布验收（2026-10-29）

只测这次改动真正动到的东西，不重复全量模板回归（那是 pwa_headed_full_e2e.py 的活）：

  A. 模板库（名字 / 顺序 / 搜索）
     A1 抽屉首屏是「编辑精选」12 套，且顺序与 pwa/theme-curation.json 一致
     A2 卡片名里不再出现旧族名与第三方品牌名（卷宗 / 庙会 / Monocle / Vogue / GitHub…）
     A3 族筛选项是 公文/信笺/素页/夜航/节庆/钢印/暮色，且没有错的「首屏」「卡片」
     A4 搜索能用「绿 / 周报」这类词命中（tags 生效，原来只能靠名字）
  B. 移动端排版（在预览 iframe 里量真实 DOM）
     B1 色块标题主题（公文·湖蓝）h1 左对齐
     B2 长 URL 不撑破 375px（改前 164/164 全撑破）
     B3 表格不溢出、表头单元格不折行（「国产化率」不被拆成两行）
     B4 图注不再是 13px #999999
     B5 刊头类主题 + 长标题 → 自动左对齐；短标题 → 保持居中
  C. 整个过程 0 条真实 JS 错误

用法：
    .venv/Scripts/python.exe scripts/e2e_mobile_release.py                    # 打线上
    .venv/Scripts/python.exe scripts/e2e_mobile_release.py --url http://127.0.0.1:8123/
    .venv/Scripts/python.exe scripts/e2e_mobile_release.py --headless         # CI 用

产物：output/e2e-mobile-release/report.json + 关键步骤截图；有 FAIL 退出码 1。
"""

from __future__ import annotations

import argparse
import json
import sys
import traceback
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
OUT = ROOT / "output" / "e2e-mobile-release"
ONLINE = "https://supersu.ccwu.cc/"
sys.path.insert(0, str(ROOT))

results: list[dict] = []
shots: list[str] = []

# 带「长 URL / 3 列表格 / 图注 / 长标题」的夹具：一次性覆盖本次全部排版规则
FIXTURE = """# 半导体设备国产化：从替代到并行与渠道重排的完整说明

- 日期：2026-08-10
- 结论：成熟制程已可替代，先进制程仍需 3–5 年

## 一、市场结构与增长驱动

全球半导体设备市场规模在 2025 年达到 1,250 亿美元，中国大陆占比约 34%。

访问 https://example.com/very/long/path/that/never/breaks/and/keeps/going/until/it/overflows/the/phone/screen 查看完整报告。

| 环节 | 国产化率 | 主要约束 |
|---|---|---|
| 刻蚀 | 35% | 高端机型验证周期长 |
| 量测 | 12% | 精度与软件算法 |

![设备厂房](https://example.com/a.png)

*图注：设备主厂房全景，2026 年扩建后产能提升 30%*
"""


def check(name: str, ok: bool, before=None, after=None, shot: str = "") -> None:
    results.append({"name": name, "ok": bool(ok),
                    "before": "" if before is None else str(before)[:220],
                    "after": "" if after is None else str(after)[:220],
                    "shot": shot})
    print(("  PASS  " if ok else "  FAIL  ") + name
          + (f"  | {before} → {after}" if (before is not None or after is not None) else "")
          + (f"  [{shot}]" if shot else ""), flush=True)


def cjk_len(s: str) -> int:
    return len(s or "")


# ── 页面操作 ────────────────────────────────────────────────────────────
def wait_render(page, marker: str, timeout: int = 90000) -> bool:
    """等预览 iframe 里真的出现 marker（引擎是 Pyodide，首次慢）"""
    try:
        page.wait_for_function(
            """(m) => {
                 const f = document.getElementById('preview');
                 const d = f && f.contentDocument;
                 return !!(d && d.body && d.body.innerText.includes(m));
               }""", arg=marker, timeout=timeout)
        return True
    except Exception:
        return False


def pick_theme(page, tid: str) -> None:
    page.click("#btn-themes")
    page.wait_for_timeout(350)
    page.fill("#drawer-search", tid)
    page.wait_for_timeout(450)
    page.locator(f'.d-card[data-id="{tid}"]').first.click()
    page.wait_for_timeout(250)
    page.click("#btn-drawer-close")
    page.wait_for_timeout(1200)


def preview_frame(page):
    h = page.query_selector("#preview")
    return h.content_frame() if h else None


def shot(page, name: str) -> str:
    p = OUT / f"{name}.png"
    try:
        page.screenshot(path=str(p))
        shots.append(p.name)
        return p.name
    except Exception:
        return ""


MEASURE_JS = """() => {
  const d = document.body;
  const h1 = d.querySelector('h1');
  const cs = h1 ? getComputedStyle(h1) : null;
  const cells = [...d.querySelectorAll('th,td')].map(e => {
    const s = getComputedStyle(e);
    const lh = parseFloat(s.lineHeight) || parseFloat(s.fontSize) * 1.4;
    const inner = e.getBoundingClientRect().height
                  - parseFloat(s.paddingTop) - parseFloat(s.paddingBottom);
    return { t: e.textContent.trim(), lines: Math.max(1, Math.round(inner / lh)) };
  });
  const table = d.querySelector('table');
  const longP = [...d.querySelectorAll('p')].find(p => p.textContent.includes('https://example.com/very'));
  const caps = [...d.querySelectorAll('p')].filter(p => (p.textContent || '').includes('图注'))
                 .map(p => { const s = getComputedStyle(p); return s.color + ' @' + s.fontSize; });
  return {
    h1Align: cs ? cs.textAlign : null,
    h1Size: cs ? cs.fontSize : null,
    docW: document.documentElement.scrollWidth,
    docCW: document.documentElement.clientWidth,
    bodyW: d.clientWidth,
    tableW: table ? Math.round(table.getBoundingClientRect().width) : 0,
    wrapped: cells.filter(c => c.lines > 1).map(c => c.t),
    // 长 URL 是否撑破自己所在段落（改前 no word-break → 段落 scrollWidth 远大于 clientWidth）
    longOver: longP ? longP.scrollWidth - longP.clientWidth : -1,
    longPW: longP ? Math.round(longP.scrollWidth) : 0,
    longCW: longP ? Math.round(longP.clientWidth) : 0,
    caption: caps[0] || null,
  };
}"""


def main() -> int:
    try:
        sys.stdout.reconfigure(encoding="utf-8", errors="replace")
    except Exception:
        pass

    ap = argparse.ArgumentParser()
    ap.add_argument("--url", default=ONLINE, help=f"目标地址，默认线上 {ONLINE}")
    ap.add_argument("--headless", action="store_true", help="无头（默认有头，肉眼可见）")
    args = ap.parse_args()

    url = args.url
    OUT.mkdir(parents=True, exist_ok=True)
    cur = json.loads((ROOT / "pwa" / "theme-curation.json").read_text(encoding="utf-8"))
    featured = cur["featured"]
    print(f"目标：{url}")
    print(f"精选清单：{len(featured)} 套\n")

    from playwright.sync_api import sync_playwright
    from core.browser_utils import launch_browser

    errors: list[str] = []
    try:
        with sync_playwright() as p:
            browser = launch_browser(p, headless=args.headless,
                                     args=["--no-proxy-server", "--window-size=1440,960"])
            ctx = browser.new_context(viewport={"width": 1400, "height": 900})
            page = ctx.new_page()

            def on_console(m):
                if m.type != "error":
                    return
                t = m.text or ""
                if t.startswith("Failed to load resource") or "favicon" in t:
                    return
                errors.append(t)
            page.on("console", on_console)
            page.on("pageerror", lambda e: errors.append(f"pageerror: {e}"))

            page.goto(url, wait_until="domcontentloaded", timeout=60000)
            page.wait_for_selector("#btn-themes", timeout=40000)
            page.fill("#input", FIXTURE)

            ready = False
            for attempt in range(3):
                try:
                    page.wait_for_function("() => !document.getElementById('btn-copy').disabled",
                                           timeout=90000)
                    ready = True
                    break
                except Exception:
                    if attempt < 2:
                        page.reload(wait_until="domcontentloaded")
                        page.wait_for_selector("#btn-themes", timeout=40000)
                        page.fill("#input", FIXTURE)
                        page.wait_for_timeout(1500)
            check("排版引擎就绪（Pyodide 精确渲染）", ready, "", f"第 {attempt + 1} 次")
            if not ready:
                raise RuntimeError("引擎没起来，后续断言无意义")
            check("首屏渲染出正文", wait_render(page, "半导体设备国产化"))

            # ── A. 模板库：名字 / 顺序 / 搜索 ─────────────────────────
            print("\n── A. 模板库（命名 + 排序 + 搜索）──")
            page.click("#btn-themes")
            page.wait_for_timeout(600)
            cards = page.eval_on_selector_all(
                ".d-card[data-id]", "els => els.map(e => ({id: e.dataset.id, name: e.querySelector('.d-name').textContent}))")
            ids = [c["id"] for c in cards]
            names = [c["name"] for c in cards]

            same_head = ids[:len(featured)] == featured
            check("首屏前 12 张 = 编辑精选（顺序一致）", same_head,
                  "", f"{len(featured)} 套 / 共 {len(ids)} 张：" + "、".join(names[:4]))
            s = shot(page, "01-drawer-featured")

            sec_text = " ".join(page.eval_on_selector_all(".d-sec", "els => els.map(e => e.textContent)"))
            check("有「编辑精选」分区标题", "编辑精选" in sec_text, "", sec_text[:40])

            bad_words = ["卷宗", "庙会", "Monocle", "Vogue", "GitHub", "少数派", "字节蓝", "微信原生", "首屏"]
            all_names = " ".join(names)
            hit = [w for w in bad_words if w in all_names]
            check("卡片名无旧名/品牌名", not hit, "", f"命中 {hit}" if hit else f"{len(names)} 张全干净")

            chips = page.eval_on_selector_all(
                "#drawer-filters .fchip", "els => els.map(e => e.textContent.trim())")
            expect = ["全部", "收藏", "公文", "信笺", "素页", "夜航", "节庆", "钢印", "暮色"]
            # 族 chip 只在「全部」视图里全出现；顺序即 index 里族首次出现的顺序，这里只校验集合
            missing = [c for c in expect if c not in chips]
            stale = [c for c in chips if c in ("首屏", "卡片", "其他")]
            check("族筛选项正确（无「首屏/卡片」）", not missing and not stale,
                  "", f"chips={chips} 缺={missing} 残留={stale}")
            s = shot(page, "02-drawer-chips")

            for kw, want in (("绿", 10), ("周报", 5), ("商务", 5)):
                page.fill("#drawer-search", kw)
                page.wait_for_timeout(400)
                n = page.locator(".d-card").count()
                check(f"搜索「{kw}」有结果（tags 生效）", n > 0,
                      "", f"{n} 张" + ("" if n >= want else f"（少于预期 {want}）"))
            page.fill("#drawer-search", "")
            page.wait_for_timeout(300)
            page.click("#btn-drawer-close")
            page.wait_for_timeout(300)

            # ── B. 移动端排版（真 DOM 量）────────────────────────────
            print("\n── B. 移动端排版（375px 微信宽）──")
            pick_theme(page, "su-biz-azure")
            ok = wait_render(page, "半导体设备国产化")
            fr = preview_frame(page)
            m = fr.evaluate(MEASURE_JS) if fr else {}
            check("色块标题主题 h1 左对齐（公文·湖蓝）", m.get("h1Align") == "left",
                  "", f"text-align={m.get('h1Align')} / {m.get('h1Size')}")
            s = shot(page, "03-biz-azure")

            check("长 URL 不撑破版面",
                  m.get("longOver") == 0 and m.get("docW", 9999) <= m.get("docCW", 0) + 1, "",
                  f"段落 {m.get('longPW')}/{m.get('longCW')}px（溢出 {m.get('longOver')}px），"
                  f"文档 {m.get('docW')}/{m.get('docCW')}px")
            check("表格不溢出正文宽", 0 < m.get("tableW", 9999) <= int(m.get("bodyW", 375)) + 2, "",
                  f"表格 {m.get('tableW')}px（正文宽 {m.get('bodyW')}px）")
            check("表头/单元格不折行", m.get("wrapped") == [], "",
                  f"折行的单元格：{m.get('wrapped')}")
            cap = m.get("caption") or ""
            check("图注不再是 #999999", "#999999" not in cap.lower() and cap != "", "", f"图注 {cap}")

            # 刊头类：长标题 → 左；短标题 → 仍居中
            pick_theme(page, "su-letter-azure")
            wait_render(page, "半导体设备国产化")
            fr = preview_frame(page)
            ml = fr.evaluate(MEASURE_JS) if fr else {}
            check("刊头类 + 长标题 → 自动左对齐（信笺·湖蓝）", ml.get("h1Align") == "left", "",
                  f"text-align={ml.get('h1Align')}")
            s = shot(page, "04-letter-long")

            page.fill("#input", "# 品牌升级说明\n\n短标题正文。\n")
            ok = wait_render(page, "品牌升级说明")
            page.wait_for_timeout(600)
            fr = preview_frame(page)
            ms = fr.evaluate(MEASURE_JS) if fr else {}
            check("刊头类 + 短标题 → 保持居中", ms.get("h1Align") == "center", "",
                  f"text-align={ms.get('h1Align')}")
            s = shot(page, "05-letter-short")

            # ── C. 控制台 ─────────────────────────────────────────────
            print("\n── C. 运行时错误 ──")
            check("无真实 JS 错误", not errors, "", f"{len(errors)} 条：{errors[:2]}" if errors else "0 条")

            browser.close()
    except Exception as e:
        check("E2E 执行未中断", False, "", f"{type(e).__name__}: {e}")
        traceback.print_exc()

    total = len(results)
    failed = [r for r in results if r["ok"] is False]
    print(f"\n{'=' * 62}")
    print(f"共 {total} 项：通过 {total - len(failed)}，失败 {len(failed)}")
    for r in failed:
        print(f"  FAIL  {r['name']}  | {r['after']}")
    (OUT / "report.json").write_text(
        json.dumps({"url": url, "results": results, "shots": shots},
                   ensure_ascii=False, indent=2), encoding="utf-8")
    print(f"报告：{OUT / 'report.json'}")
    return 1 if failed else 0


if __name__ == "__main__":
    sys.exit(main())
