#!/usr/bin/env python3
"""
前后端集成测试 — 全面验证（已对齐真实前端契约）
================================================
覆盖：功能测试 + UI验证 + API集成 + 性能分析。

本文件于 2026-07-11 重写以对齐当前前端 templates/index.html 的真实结构：
- API 字段名使用真实契约：渲染用 raw_text/theme_id（原测试误用 text/theme）
- UI 断言改用真实元素 id（原测试的 btn-social-link/socialText/socialGrid/
  step-label/workflow-step/combobox/theme-select 等均为旧版残留，当前前端不存在）
- 字体断言改为容错解析（当前前端用 rem 响应式，无字面 "font-size: 24px"）

运行方式（需先启动服务）：
    python app.py                      # 默认 http://127.0.0.1:5000
    python tests/test_integration.py   # 本文件
"""

import re
import requests
import time

BASE = "http://127.0.0.1:5000"
passed, failed = 0, 0
issues = []


def check(label, condition, detail=""):
    global passed, failed
    if condition:
        passed += 1
        print(f"  PASS  {label}")
    else:
        failed += 1
        msg = f"  FAIL  {label}" + (f" — {detail}" if detail else "")
        issues.append(msg)
        print(msg)


# ============================================================
print("=" * 70)
print("前后端集成测试 — 全面验证（对齐真实前端）")
print("=" * 70)

# ── 1. 首页HTML与UI结构（真实元素 id） ────────────────
print("\n[1] 首页HTML与UI结构")
r = requests.get(f"{BASE}/")
html = r.text

check("HTTP 200", r.status_code == 200)
check("公众号页面存在 (page-wechat)", "page-wechat" in html)
check("小红书页面存在 (page-social)", "page-social" in html)
check("文本输入框 (input-area)", "input-area" in html)
check("预览 iframe (preview-frame)", "preview-frame" in html)
check("AI智能排版按钮 (btn-ai-format)", "btn-ai-format" in html)
check("AI润色按钮 (btn-polish)", "btn-polish" in html)
check("推送按钮 (btn-push)", "btn-push" in html)
check("小红书封面生成按钮 (btn-generate-cover)", "btn-generate-cover" in html)

# ── 2. 字体大小验证（响应式 rem，容错解析） ───────────
print("\n[2] 字体大小验证（放大排版，容错解析）")
sizes = re.findall(r"font-size:\s*([\d.]+)(px|rem)", html)
eff = []
for val, unit in sizes:
    v = float(val)
    eff.append(v * 16 if unit == "rem" else v)
max_px = max(eff) if eff else 0
check("输入框存在 (input-area)", "input-area" in html)
check(f"存在放大字号 (最大≈{max_px:.0f}px ≥16px)",
      max_px >= 16, f"max={max_px:.0f}px")

# ── 3. 小红书封面工作流 UI（真实 id） ─────────────────
print("\n[3] 小红书封面工作流 UI")
check("文案输入框 (social-text)", "social-text" in html)
check("模板网格 (social-tpl-grid)", "social-tpl-grid" in html)
check("生成按钮 (btn-generate-cover)", "btn-generate-cover" in html)
check("字数统计 (social-char-count)", "social-char-count" in html)
check("模板列表 (tpl-list)", "tpl-list" in html)

# ── 4. 主题API ─────────────────────────────────────────
print("\n[4] 主题API")
r = requests.get(f"{BASE}/api/themes")
check("HTTP 200", r.status_code == 200)
themes = r.json()
check(f"返回{len(themes)}个主题", len(themes) > 0)
# 取一个真实存在的主题 id 用于后续渲染（避免硬编码不存在的 "default"）
THEME_ID = themes[0]["id"] if isinstance(themes[0], dict) else themes[0]

# ── 5. 渲染API（真实字段名 raw_text / theme_id） ──────
print("\n[5] 渲染API（纯本地，无外部调用）")
r = requests.post(f"{BASE}/api/render",
    json={"raw_text": "我今天完成了一个非常厉害的阳光星盘系统", "theme_id": THEME_ID})
check("HTTP 200", r.status_code == 200)
data = r.json()
check("返回HTML", "html" in data and len(data.get("html", "")) > 0)
check("返回request_id", "request_id" in data)

# ── 6. 封面生成API（Playwright 已安装，需运行服务） ──
print("\n[6] 封面生成API（editorial/swiss=归藏, mist=BLCaptain）")
for style in ("editorial", "swiss", "mist"):
    t0 = time.time()
    r = requests.post(f"{BASE}/api/social/generate",
        json={"text": "阳光星盘系统：用AI点亮内容创作", "style": style},
        timeout=120)
    dt = time.time() - t0
    ok = r.status_code == 200
    check(f"[{style}] HTTP 200 ({dt:.1f}s)", ok,
          f"status={r.status_code} body={r.text[:120]}")
    if ok:
        result = r.json()
        imgs = result.get("images", [])
        check(f"[{style}] 生成封面图 (engine={result.get('engine')})",
              len(imgs) > 0, f"images={len(imgs)}")

# ── 7. 缩略图API ────────────────────────────────────────
print("\n[7] 缩略图API")
r = requests.get(f"{BASE}/api/social/thumbnails")
check("HTTP 200", r.status_code == 200)
thumbs = r.json()
check(f"返回{len(thumbs)}个模板缩略图", len(thumbs) > 0)

# ── 8. 润色API（依赖外部 LLM，限流时 429 属正常） ──
print("\n[8] 润色API（外部 LLM，尽力而为）")
r = requests.post(f"{BASE}/api/polish",
    json={"text": "我今天完成了一个非常厉害的阳光星盘系统", "style": "去AI味"},
    timeout=120)
check("API 可达 (200 或限流429)", r.status_code in (200, 429),
      f"status={r.status_code}")

# ── 9. 错误处理 ─────────────────────────────────────────
print("\n[9] 错误处理")
r = requests.post(f"{BASE}/api/render",
    json={"raw_text": "", "theme_id": "nonexistent"})
check("空文本/无效主题处理", r.status_code in [200, 404])

r = requests.post(f"{BASE}/api/polish", json={"text": ""})
check("润色空文本返回400", r.status_code == 400)

r = requests.post(f"{BASE}/api/render", data="invalid json",
    headers={"Content-Type": "application/json"})
check("无效JSON返回400", r.status_code == 400)

# ── 10. 性能指标 ────────────────────────────────────────
print("\n[10] 性能指标")
start = time.time()
r = requests.get(f"{BASE}/api/themes")
elapsed = time.time() - start
check(f"主题API响应{elapsed*1000:.0f}ms", elapsed < 2)

start = time.time()
r = requests.post(f"{BASE}/api/render",
    json={"raw_text": "测试性能", "theme_id": THEME_ID})
list(r.iter_lines())
elapsed = time.time() - start
check(f"渲染API响应{elapsed*1000:.0f}ms", elapsed < 5)

# ============================================================
print("\n" + "=" * 70)
print(f"结果: {passed}/{passed+failed} 通过", end="")
if failed == 0:
    print(" [OK] 全部通过!")
else:
    print(f" [FAIL] {failed}个失败")
    for issue in issues:
        print(f"  - {issue}")
print("=" * 70)
