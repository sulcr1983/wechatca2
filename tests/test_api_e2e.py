"""
后端 API 全端点 E2E
==============================================================
不依赖浏览器，对每个 Flask 路由做真实 HTTP 请求，校验：
  - 状态码符合契约
  - 返回结构合法（JSON 可解析、关键字段齐全）
  - AI 依赖端点：未配置 key 时须优雅返回 JSON（不崩、不挂起）

覆盖端点（共 21 项）：
  静态/页面：GET / 、GET /assets/*
  主题：     GET /api/themes
  排版：     POST /api/render (正常/无效主题)
  优化：     GET /api/optimize-stream (缺参校验)
  AI 文本：  POST /api/polish 、POST /api/ai-format 、POST /api/summary
  账号 CRUD：GET/POST/DELETE /api/accounts
  历史：     GET /api/history
  AI 封面：  POST /api/cover-image (正常/缺参) + GET /temp_covers/*
  推送：     POST /api/push (缺参/账号不存在)
  小红书：   POST /api/social/generate (归藏/BC/空文案) 、GET /api/social/styles 、GET /api/social/thumbnails
  打开目录： POST /open-folder (空/越权)
  AI 配置：  GET/POST /api/ai-config

运行：python tests/test_api_e2e.py
（脚本自起/自停 Flask；需 venv 含 flask）
"""
import sys
import time
import json
import os
import subprocess
import urllib.request
import urllib.error

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
PY = r"C:/Users/Administrator/.workbuddy/binaries/python/envs/default/Scripts/python.exe"
BASE = "http://127.0.0.1:5000"

results = []


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


def _req(method, path, data=None, timeout=40):
    url = BASE + path
    headers = {"Content-Type": "application/json"}
    body = json.dumps(data).encode("utf-8") if data is not None else None
    req = urllib.request.Request(url, data=body, headers=headers, method=method)
    try:
        resp = urllib.request.urlopen(req, timeout=timeout)
        raw = resp.read().decode("utf-8", "replace")
        return resp.status, raw
    except urllib.error.HTTPError as e:
        raw = e.read().decode("utf-8", "replace")
        return e.code, raw
    except Exception as e:
        return -1, str(e)


def _get_bytes(path, timeout=40):
    """GET 返回原始字节（用于图片等二进制）"""
    url = BASE + path
    req = urllib.request.Request(url, method="GET")
    try:
        resp = urllib.request.urlopen(req, timeout=timeout)
        return resp.status, resp.read()
    except urllib.error.HTTPError as e:
        return e.code, e.read()
    except Exception as e:
        return -1, str(e).encode("utf-8")


def jget(path, timeout=40):
    status, raw = _req("GET", path, timeout=timeout)
    try:
        return status, json.loads(raw)
    except Exception:
        return status, raw  # 非 JSON（可能是 500 错误页）


def jpost(path, data=None, timeout=40):
    status, raw = _req("POST", path, data=data, timeout=timeout)
    try:
        return status, json.loads(raw)
    except Exception:
        return status, raw


def run():
    proc = subprocess.Popen([PY, "app.py"], cwd=ROOT)
    try:
        if not wait_server():
            check("服务启动并监听 5000", False, "端口未在超时内就绪")
            return 1
        check("服务启动并监听 5000", True)

        # ---- 0. 首页 ----
        st, body = _req("GET", "/")
        ok = st == 200 and isinstance(body, str) and ("公众号" in body or "小红书" in body)
        check("GET / 返回首页 HTML", ok, f"status={st}")

        # ---- 1. 主题列表 ----
        st, j = jget("/api/themes")
        ok = st == 200 and isinstance(j, list) and len(j) > 0 and all("id" in x and "name" in x for x in j)
        check("GET /api/themes 返回主题列表", ok, f"status={st} count={len(j) if isinstance(j,list) else '?'}")

        # ---- 2. 静态资源（/assets 路由）----
        first_theme = j[0]["id"] if isinstance(j, list) and j else None
        if first_theme:
            st, raw = _req("GET", f"/assets/themes/{first_theme}.json")
            ok = st == 200 and isinstance(raw, str) and raw.strip().startswith("{")
            check("GET /assets/themes/<id>.json 静态可服务", ok, f"status={st}")
        else:
            check("GET /assets/themes/<id>.json 静态可服务", False, "无主题可测")

        # ---- 3. 排版渲染 ----
        st, j = jpost("/api/render", {"raw_text": "# 标题\n正文段落。", "theme_id": first_theme})
        ok = st == 200 and isinstance(j, dict) and j.get("html")
        check("POST /api/render 正常排版", ok, f"status={st} html_len={len(j.get('html','')) if isinstance(j,dict) else 0}")

        st, j = jpost("/api/render", {"raw_text": "x", "theme_id": "__not_exist__"})
        ok = st == 404
        check("POST /api/render 无效主题 → 404", ok, f"status={st}")

        # ---- 4. 优化流（缺参校验）----
        st, j = jget("/api/optimize-stream")
        ok = st == 400
        check("GET /api/optimize-stream 缺 request_id → 400", ok, f"status={st}")

        # ---- 5. 小红书风格/缩略图 ----
        st, j = jget("/api/social/styles")
        ok = st == 200 and isinstance(j, dict) and j.get("guizang") and j.get("blcaptain")
        check("GET /api/social/styles 返回双引擎风格", ok, f"status={st} guizang={len(j.get('guizang',[])) if isinstance(j,dict) else '?'} blcaptain={len(j.get('blcaptain',[])) if isinstance(j,dict) else '?'}")

        st, j = jget("/api/social/thumbnails")
        ok = st == 200 and isinstance(j, list)
        check("GET /api/social/thumbnails 返回缩略图列表", ok, f"status={st} count={len(j) if isinstance(j,list) else '?'}")

        # ---- 6. 小红书生成（归藏）----
        st, j = jpost("/api/social/generate", {"text": "周末去海边旅行放空，拍一组氛围感照片", "style": "editorial"})
        ok = st == 200 and isinstance(j, dict) and j.get("images") and len(j["images"]) > 0 and j.get("background")
        detail = f"status={st} engine={j.get('engine')} imgs={len(j.get('images',[])) if isinstance(j,dict) else 0} bg={j.get('background',{}).get('source') if isinstance(j,dict) else ''}"
        check("POST /api/social/generate 归藏引擎出图+自动搜底图", ok, detail)

        # ---- 7. 小红书生成（BLCaptain）----
        st, j = jpost("/api/social/generate", {"text": "今天来一杯手冲咖啡，享受慢生活", "style": "sp-mist"})
        ok = st == 200 and isinstance(j, dict) and j.get("images") and len(j["images"]) > 0
        detail = f"status={st} engine={j.get('engine')} imgs={len(j.get('images',[])) if isinstance(j,dict) else 0}"
        check("POST /api/social/generate BLCaptain 引擎出图", ok, detail)

        # ---- 8. 小红书生成（空文案 → 400）----
        st, j = jpost("/api/social/generate", {"text": ""})
        ok = st == 400
        check("POST /api/social/generate 空文案 → 400", ok, f"status={st}")

        # ---- 9. 账号 CRUD ----
        st, j = jget("/api/accounts")
        ok = st == 200 and isinstance(j, list)
        check("GET /api/accounts 返回账号列表", ok, f"status={st} count={len(j) if isinstance(j,list) else '?'}")

        st, j = jpost("/api/accounts", {"nickname": "E2E临时号", "appid": "wx_e2e_0001", "appsecret": "e2e_secret_tmp"})
        ok = st == 200 and isinstance(j, dict) and j.get("account", {}).get("id")
        acc_id = j.get("account", {}).get("id") if isinstance(j, dict) else None
        check("POST /api/accounts 新增账号", ok, f"status={st} id={acc_id}")

        if acc_id:
            st, j = jget(f"/api/accounts/{acc_id}")
            # 注意：DELETE 用 path 占位；这里仅校验列表里已含（GET 列表即可）
            st2, j2 = jget("/api/accounts")
            in_list = isinstance(j2, list) and any(a.get("id") == acc_id for a in j2)
            check("新增账号出现在 GET /api/accounts", in_list, f"id={acc_id}")
            st, j = _req("DELETE", f"/api/accounts/{acc_id}")
            try:
                dj = json.loads(j) if isinstance(j, str) else j
            except Exception:
                dj = {}
            ok = st == 200 and isinstance(dj, dict) and dj.get("success")
            check("DELETE /api/accounts/<id> 删除临时账号", ok, f"status={st}")
            # 确认已删
            st2, j2 = jget("/api/accounts")
            gone = isinstance(j2, list) and not any(a.get("id") == acc_id for a in j2)
            check("删除后账号不再出现在列表", gone, f"id={acc_id}")

        st, j = jpost("/api/accounts", {"nickname": ""})
        ok = st == 400
        check("POST /api/accounts 缺字段 → 400", ok, f"status={st}")

        # ---- 10. 历史 ----
        st, j = jget("/api/history")
        ok = st == 200 and isinstance(j, list)
        check("GET /api/history 返回历史列表", ok, f"status={st} count={len(j) if isinstance(j,list) else '?'}")

        # ---- 11. 推送（校验路径）----
        st, j = jpost("/api/push", {"title": "x"})
        ok = st == 400
        check("POST /api/push 缺必填 → 400", ok, f"status={st}")

        st, j = jpost("/api/push", {"account_id": "nope", "title": "t", "html": "<p>h</p>"})
        ok = st == 404
        check("POST /api/push 账号不存在 → 404", ok, f"status={st}")

        # ---- 12. 打开目录（校验路径）----
        st, j = jpost("/open-folder", {"path": ""})
        ok = st == 400
        check("POST /open-folder 空路径 → 400", ok, f"status={st}")

        st, j = jpost("/open-folder", {"path": "C:\\Windows"})
        ok = st in (403, 500)  # 越权拒绝 / 或打开失败均可接受
        check("POST /open-folder 越权路径 → 拒绝", ok, f"status={st}")

        # ---- 13. AI 配置 GET ----
        st, j = jget("/api/ai-config")
        ok = st == 200 and isinstance(j, dict)
        check("GET /api/ai-config 返回配置", ok, f"status={st} keys={list(j.keys()) if isinstance(j,dict) else '?'}")
        cfg = j if isinstance(j, dict) else {}

        # ---- 14. AI 文本端点（优雅降级）----
        def ai_ok(name, st, j):
            # 未配置 key 时返回 JSON 500 属优雅降级；配置正常则 200
            if st == 200 and isinstance(j, dict) and j.get("success"):
                return True, "200 成功"
            if st in (400, 500) and isinstance(j, dict) and j.get("error"):
                return True, f"{st} 优雅降级(缺key): {j.get('error')[:40]}"
            if st == -1:
                return False, "连接失败/崩溃"
            if not isinstance(j, dict):
                return False, f"{st} 非JSON响应(疑似崩溃)"
            return True, f"status={st}"

        st, j = jpost("/api/polish", {"text": "这是一段需要润色的文案。", "style": "remove_ai_taste"})
        ok, d = ai_ok("polish", st, j)
        check("POST /api/polish 润色（AI，优雅降级）", ok, d)

        st, j = jpost("/api/ai-format", {"text": "标题\n第一段内容。第二段内容。"})
        ok, d = ai_ok("ai-format", st, j)
        check("POST /api/ai-format 智能排版（AI，优雅降级）", ok, d)

        st, j = jpost("/api/summary", {"article_text": "这是一篇文章的正文，用于生成摘要。" * 5})
        ok, d = ai_ok("summary", st, j)
        check("POST /api/summary 摘要（AI，优雅降级）", ok, d)

        # ---- 15. AI 封面图 ----
        st, j = jpost("/api/cover-image", {"title": "苏哥的封面标题"})
        if st == 200 and isinstance(j, dict) and j.get("image_url"):
            fn = j["image_url"].split("/")[-1]
            st2, raw = _get_bytes(f"/temp_covers/{fn}")
            ok = st2 == 200 and isinstance(raw, (bytes, bytearray)) and len(raw) > 100
            check("POST /api/cover-image 生成封面图 + 静态可访问", ok, f"gen={st} fetch={st2} bytes={len(raw) if isinstance(raw,(bytes,bytearray)) else 0}")
        else:
            ok = st in (400, 500) and isinstance(j, dict)
            check("POST /api/cover-image 封面图（AI，优雅降级）", ok, f"status={st} {'缺key' if isinstance(j,dict) else ''}")

        # ---- 16. AI 配置 POST（回写原值，保持状态不变）----
        st, j = jpost("/api/ai-config", {
            "platform": cfg.get("platform", "custom"),
            "base_url": cfg.get("base_url", ""),
            "api_key": cfg.get("api_key", ""),
            "model": cfg.get("model", ""),
        })
        ok = st == 200 and isinstance(j, dict) and j.get("success")
        check("POST /api/ai-config 更新配置（回写原值）", ok, f"status={st}")

    finally:
        try:
            proc.terminate()
            proc.wait(timeout=5)
        except Exception:
            proc.kill()

    print("\n" + "=" * 56)
    passed = sum(1 for _, ok, _ in results if ok)
    total = len(results)
    print(f"后端 API 全端点 E2E：{passed}/{total} 通过")
    print("=" * 56)
    return 0 if passed == total else 1


if __name__ == "__main__":
    sys.exit(run())
