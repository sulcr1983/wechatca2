from playwright.sync_api import sync_playwright
import json

BASE = "http://127.0.0.1:5000/assets/prototypes"

def run():
    out = {}
    with sync_playwright() as p:
        b = p.chromium.launch(headless=True)

        # ---- SOCIAL ----
        errs_s = []
        pg = b.new_page(viewport={"width": 1440, "height": 900})
        pg.on("console", lambda m: errs_s.append(m.text) if m.type == "error" else None)
        pg.on("pageerror", lambda e: errs_s.append(str(e)))
        pg.goto(f"{BASE}/social-studio-target.html", wait_until="load")
        pg.wait_for_timeout(900)
        swiss_count = pg.eval_on_selector_all("#social-tpl-grid .tpl-mini", "e=>e.length")
        pg.click('#mode-switch .mode-btn[data-mode="editorial"]')
        pg.wait_for_timeout(300)
        ed_count = pg.eval_on_selector_all("#social-tpl-grid .tpl-mini", "e=>e.length")
        pg.click('#mode-switch .mode-btn[data-mode="swiss"]')
        pg.wait_for_timeout(200)
        pg.click('#social-tpl-grid .tpl-mini')
        pg.wait_for_timeout(200)
        pg.click('#btn-generate-cover')
        pg.wait_for_timeout(400)
        res = pg.evaluate("""() => {
            const img = document.getElementById('result-img');
            const meta = document.getElementById('result-meta');
            return {
              naturalW: img.naturalWidth,
              srcPrefix: img.src.slice(0, 34),
              meta: meta.textContent,
              spvSrc: document.getElementById('spv-cover').src.slice(0, 34)
            };
        }""")
        out['social'] = {
            'swiss_count': swiss_count,
            'editorial_count': ed_count,
            'result_naturalW': res['naturalW'],
            'result_src_prefix': res['srcPrefix'],
            'result_meta': res['meta'],
            'spv_src_prefix': res['spvSrc'],
            'console_errors': errs_s,
        }
        pg.close()

        # ---- WECHAT ----
        errs_w = []
        pg2 = b.new_page(viewport={"width": 1440, "height": 900})
        pg2.on("console", lambda m: errs_w.append(m.text) if m.type == "error" else None)
        pg2.on("pageerror", lambda e: errs_w.append(str(e)))
        pg2.goto(f"{BASE}/wechat-studio-target.html", wait_until="load")
        pg2.wait_for_timeout(1100)
        tpl_count = pg2.eval_on_selector_all("#tpl-list .tpl-item", "e=>e.length")
        mobile_opts = pg2.eval_on_selector_all("#mobile-tpl-select option", "e=>e.length")
        pg2.click('#tpl-list .tpl-item')
        pg2.wait_for_timeout(700)
        preview_visible = pg2.evaluate(
            "() => { const f=document.getElementById('preview-frame'); return getComputedStyle(f).display!=='none'; }"
        )
        pg2.set_viewport_size({"width": 390, "height": 844})
        pg2.wait_for_timeout(300)
        mobile_bar_visible = pg2.evaluate(
            "() => { const b=document.querySelector('.mobile-theme-bar'); return b && getComputedStyle(b).display!=='none'; }"
        )
        out['wechat'] = {
            'tpl_count': tpl_count,
            'mobile_opts': mobile_opts,
            'preview_visible': preview_visible,
            'mobile_bar_visible': mobile_bar_visible,
            'console_errors': errs_w,
        }
        pg2.close()
        b.close()

    print(json.dumps(out, ensure_ascii=False, indent=2))

run()
