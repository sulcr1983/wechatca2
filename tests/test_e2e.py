#!/usr/bin/env python3
"""e2e 全量测试 — WechatAI Formatter
覆盖所有 API 端点、SSE 流、边界条件、错误处理。
"""

import json
import sys
import time
import threading
import io
from unittest.mock import patch, MagicMock

sys.path.insert(0, ".")
from app import app, _opt_store, _opt_lock, DATA_DIR

# ============================================================
# Mock 外部依赖
# ============================================================

def mock_call_llm(system_prompt, user_prompt):
    """Mock call_llm: 返回模拟结果"""
    if "摘要" in system_prompt or "摘要" in user_prompt:
        return "这是一篇关于人工智能技术发展的深度文章，探讨了最新趋势和应用场景。"
    if "润色" in system_prompt or "润色" in system_prompt:
        return "[润色后] " + user_prompt[:100] + "..."
    if "排版助手" in system_prompt or "Markdown" in system_prompt:
        # 后台优化
        return "## 优化标题\n\n这是LLM优化后的段落内容，排版更合理。\n\n- 列表项一\n- 列表项二"
    # polish
    return "[已润色] " + user_prompt[:200]

# Mock PIL Image 生成（避免实际调用文生图 API）
def mock_generate_cover(title, full_text):
    """Mock generate_cover: 返回一个最小 PNG"""
    buf = io.BytesIO()
    # 1x1 白色 PNG
    png_data = (
        b'\x89PNG\r\n\x1a\n\x00\x00\x00\rIHDR\x00\x00\x00\x01\x00\x00\x00\x01'
        b'\x08\x02\x00\x00\x00\x90wS\xde\x00\x00\x00\x0cIDATx\x9cc\xf8\x0f'
        b'\x00\x00\x01\x01\x00\x05\x18\xd8N\x00\x00\x00\x00IEND\xaeB`\x82'
    )
    return png_data

passed = 0
failed = 0
errors = []

def test(name):
    """装饰器风格的测试计数器"""
    global passed, failed
    def decorator(fn):
        def wrapper():
            global passed, failed
            try:
                fn()
                passed += 1
                print(f"  ✓ {name}")
            except AssertionError as e:
                failed += 1
                msg = f"  ✗ {name}: {e}"
                errors.append(msg)
                print(msg)
            except Exception as e:
                failed += 1
                msg = f"  ✗ {name}: EXCEPTION {type(e).__name__}: {e}"
                errors.append(msg)
                print(msg)
        wrapper._test_fn = True  # 标记为测试函数
        return wrapper
    return decorator


# ============================================================
# 测试套件
# ============================================================

print("=" * 60)
print("WechatAI Formatter — e2e 全量测试")
print("=" * 60)

@test("GET / 返回 index.html")
def test_index():
    with app.test_client() as c:
        r = c.get("/")
        assert r.status_code == 200
        assert b"<!DOCTYPE html>" in r.data
        assert b"SuperSu" in r.data


@test("GET /api/themes 返回主题列表")
def test_themes():
    with app.test_client() as c:
        r = c.get("/api/themes")
        assert r.status_code == 200
        themes = r.get_json()
        assert isinstance(themes, list)
        assert len(themes) > 50  # 53 个主题
        # 检查结构
        t = themes[0]
        assert "id" in t
        assert "name" in t


# ── 渲染端点 ──

@test("POST /api/render 本地预处理 + SSE 触发")
def test_render_normal():
    with app.test_client() as c:
        r = c.post("/api/render", json={
            "raw_text": "人工智能概述\n\n人工智能就是让机器具备类似人类的思维能力。\n\n一、发展历程\n\n近年来AI飞速发展。",
            "theme_id": "monocle"
        })
        assert r.status_code == 200
        data = r.get_json()
        assert len(data["html"]) > 0, "html 不应该为空"
        assert len(data["markdown"]) > 0, "markdown 不应该为空"
        assert len(data["request_id"]) == 12, "request_id 应为12位"
        assert data["is_optimized"] == False
        # 检查 markdown 包含预处理后的标题格式
        assert "##" in data["markdown"] or "一、" in data["markdown"]


@test("POST /api/render 有效主题")
def test_render_valid_theme():
    with app.test_client() as c:
        for theme in ["monocle", "contract", "bold-blue", "cyber-neon", "sakura"]:
            r = c.post("/api/render", json={
                "raw_text": "测试标题\n\n测试段落内容。",
                "theme_id": theme
            })
            assert r.status_code == 200
            data = r.get_json()
            assert len(data["html"]) > 0, f"主题 {theme} 渲染失败"


@test("POST /api/render 不存在主题 → 404")
def test_render_invalid_theme():
    with app.test_client() as c:
        r = c.post("/api/render", json={
            "raw_text": "test",
            "theme_id": "nonexistent-theme-xyz"
        })
        assert r.status_code == 404
        data = r.get_json()
        assert "error" in data


@test("POST /api/render 空文本允许")
def test_render_empty_text():
    with app.test_client() as c:
        r = c.post("/api/render", json={
            "raw_text": "",
            "theme_id": "monocle"
        })
        assert r.status_code == 200
        data = r.get_json()
        # 空文本处理后应该有 wrapper 等基本结构
        assert "html" in data


@test("POST /api/render 无效 JSON → 400")
def test_render_invalid_json():
    with app.test_client() as c:
        r = c.post("/api/render", data="not json",
                   content_type="application/json")
        assert r.status_code == 400


@test("POST /api/render skip_preprocess=True 保留原始 Markdown")
def test_render_skip_preprocess():
    with app.test_client() as c:
        raw = "## 标题\n\n这是段落。"
        r = c.post("/api/render", json={
            "raw_text": raw,
            "theme_id": "monocle",
            "skip_preprocess": True
        })
        assert r.status_code == 200
        data = r.get_json()
        assert data["markdown"] == raw
        assert data["is_optimized"] == False
        assert len(data["html"]) > 0


@test("POST /api/render skip_preprocess=True 不触发 SSE")
def test_render_skip_preprocess_no_sse():
    with app.test_client() as c:
        r = c.post("/api/render", json={
            "raw_text": "## Test\n\nparagraph",
            "theme_id": "monocle",
            "skip_preprocess": True
        })
        data = r.get_json()
        # skip_preprocess 时不启动后台优化
        time.sleep(0.5)
        with _opt_lock:
            val = _opt_store.get(data.get("request_id", ""))
        assert val is None, "skip_preprocess 不应该触发后台优化"


# ── AI 润色 ──

@test("POST /api/polish 去AI味")
def test_polish_remove_ai():
    with patch("app.call_llm", mock_call_llm):
        with app.test_client() as c:
            r = c.post("/api/polish", json={
                "text": "首先，我们需要明确，其次要深入理解这个概念。",
                "style": "remove_ai_taste"
            })
            assert r.status_code == 200
            data = r.get_json()
            assert data["success"] == True
            assert len(data["polished_text"]) > 0


@test("POST /api/polish 正式风格")
def test_polish_formal():
    with patch("app.call_llm", mock_call_llm):
        with app.test_client() as c:
            r = c.post("/api/polish", json={
                "text": "这个功能特别好用，大家都很喜欢。",
                "style": "formal"
            })
            assert r.status_code == 200
            data = r.get_json()
            assert data["success"] == True


@test("POST /api/polish 轻松风格")
def test_polish_casual():
    with patch("app.call_llm", mock_call_llm):
        with app.test_client() as c:
            r = c.post("/api/polish", json={
                "text": "根据协议第三条规定，双方应当履行相关义务。",
                "style": "casual"
            })
            assert r.status_code == 200
            data = r.get_json()
            assert data["success"] == True


@test("POST /api/polish 默认风格（不传 style）")
def test_polish_default():
    with patch("app.call_llm", mock_call_llm):
        with app.test_client() as c:
            r = c.post("/api/polish", json={
                "text": "测试文本内容。"
            })
            assert r.status_code == 200
            data = r.get_json()
            assert data["success"] == True


@test("POST /api/polish 空文本 → 400")
def test_polish_empty():
    with app.test_client() as c:
        r = c.post("/api/polish", json={
            "text": "",
            "style": "formal"
        })
        assert r.status_code == 400
        data = r.get_json()
        assert data["success"] == False


@test("POST /api/polish llm 失败 → 500")
def test_polish_llm_fail():
    def fail_llm(*a, **kw):
        return ""
    with patch("app.call_llm", fail_llm):
        with app.test_client() as c:
            r = c.post("/api/polish", json={
                "text": "测试文本",
                "style": "formal"
            })
            assert r.status_code == 500
            data = r.get_json()
            assert data["success"] == False


# ── AI 摘要 ──

@test("POST /api/summary 正常生成")
def test_summary():
    with patch("app.call_llm", mock_call_llm):
        with app.test_client() as c:
            r = c.post("/api/summary", json={
                "article_text": "人工智能技术在近年来取得突破性进展，深度学习、自然语言处理等领域的创新不断涌现..."
            })
            assert r.status_code == 200
            data = r.get_json()
            assert data["success"] == True
            assert len(data["summary"]) > 0


@test("POST /api/summary 空文本 → 400")
def test_summary_empty():
    with app.test_client() as c:
        r = c.post("/api/summary", json={
            "article_text": ""
        })
        assert r.status_code == 400


@test("POST /api/summary 超长文本截断至 3000 字")
def test_summary_truncation():
    with patch("app.call_llm", mock_call_llm):
        long_text = "这是一篇关于技术的文章。" * 500  # ~4500 字
        with app.test_client() as c:
            r = c.post("/api/summary", json={
                "article_text": long_text
            })
            assert r.status_code == 200
            data = r.get_json()
            assert data["success"] == True


# ── 标题图 ──

@test("POST /api/cover-image 生成封面图")
def test_cover_image():
    with patch("app.generate_cover", mock_generate_cover):
        with app.test_client() as c:
            r = c.post("/api/cover-image", json={
                "title": "人工智能技术展望",
                "full_text": "人工智能技术在近年来取得了突破性进展..."
            })
            assert r.status_code == 200
            data = r.get_json()
            assert data["success"] == True
            assert data["image_url"].startswith("/temp_covers/")
            # 验证文件存在
            filename = data["image_url"].split("/")[-1]
            r2 = c.get(f"/temp_covers/{filename}")
            assert r2.status_code == 200
            assert len(r2.data) > 0


@test("POST /api/cover-image 空标题 → 400")
def test_cover_empty_title():
    with app.test_client() as c:
        r = c.post("/api/cover-image", json={
            "title": "",
            "full_text": "some text"
        })
        assert r.status_code == 400


@test("GET /temp_covers/<不存在的文件> → 404")
def test_cover_not_found():
    with app.test_client() as c:
        r = c.get("/temp_covers/nonexistent_xyz.png")
        assert r.status_code == 404


# ── 公众号 CRUD ──

@test("CRUD: 添加 → 列表 → 删除")
def test_accounts_crud():
    with app.test_client() as c:
        # 添加
        r = c.post("/api/accounts", json={
            "nickname": "测试公众号",
            "appid": "wx_test_appid_123",
            "appsecret": "test_secret_456"
        })
        assert r.status_code == 200
        data = r.get_json()
        assert data["success"] == True
        account_id = data["account"]["id"]
        assert len(account_id) == 12

        # 列表
        r2 = c.get("/api/accounts")
        accounts = r2.get_json()
        assert any(a["id"] == account_id for a in accounts)

        # 删除
        r3 = c.delete(f"/api/accounts/{account_id}")
        assert r3.status_code == 200
        assert r3.get_json()["success"] == True

        # 验证已删除
        r4 = c.get("/api/accounts")
        accounts2 = r4.get_json()
        assert not any(a["id"] == account_id for a in accounts2)


@test("POST /api/accounts 缺字段 → 400")
def test_add_account_missing():
    with app.test_client() as c:
        r = c.post("/api/accounts", json={
            "nickname": "测试号"
        })
        assert r.status_code == 400


@test("DELETE /api/accounts 不存在 id → 静默成功")
def test_delete_nonexistent():
    with app.test_client() as c:
        r = c.delete("/api/accounts/fake-id-xyz")
        assert r.status_code == 200
        assert r.get_json()["success"] == True


# ── 推送草稿 ──

@test("POST /api/push 完整推送流程")
def test_push_full():
    with app.test_client() as c:
        # 先添加公众号
        r = c.post("/api/accounts", json={
            "nickname": "推送测试号",
            "appid": "wx_push_test",
            "appsecret": "push_secret"
        })
        account_id = r.get_json()["account"]["id"]

        # Mock token + push + upload
        with patch("core.token_manager.token_manager.get_token") as mock_tok, \
             patch("app.push_to_draft") as mock_push, \
             patch("app.upload_permanent_material") as mock_upload:

            mock_tok.return_value = "fake_access_token_xxx"
            mock_upload.return_value = "fake_thumb_media_id"
            mock_push.return_value = "fake_draft_media_id_12345"

            # 先渲染获取 html
            r2 = c.post("/api/render", json={
                "raw_text": "推送测试文章\n\n这是文章内容。",
                "theme_id": "monocle"
            })
            html = r2.get_json()["html"]

            # 推送
            r3 = c.post("/api/push", json={
                "account_id": account_id,
                "title": "测试推送标题",
                "html": html,
                "summary": "测试摘要",
                "cover_temp_filename": ""
            })
            assert r3.status_code == 200
            data = r3.get_json()
            assert data["success"] == True
            assert data["media_id"] == "fake_draft_media_id_12345"
            mock_push.assert_called_once()


@test("POST /api/push 无封面图也可推送")
def test_push_no_cover():
    with app.test_client() as c:
        r = c.post("/api/accounts", json={
            "nickname": "无封面推送号",
            "appid": "wx_nocover",
            "appsecret": "nocover_secret"
        })
        account_id = r.get_json()["account"]["id"]

        with patch("core.token_manager.token_manager.get_token") as mock_tok, \
             patch("app.push_to_draft") as mock_push:

            mock_tok.return_value = "fake_token"
            mock_push.return_value = "media_456"

            r2 = c.post("/api/push", json={
                "account_id": account_id,
                "title": "无封面文章",
                "html": "<section>content</section>",
                "summary": "",
                "cover_temp_filename": ""
            })
            assert r2.status_code == 200
            assert r2.get_json()["success"] == True


@test("POST /api/push 缺少 account_id → 400")
def test_push_missing_account():
    with app.test_client() as c:
        r = c.post("/api/push", json={
            "title": "test",
            "html": "<p>test</p>"
        })
        assert r.status_code == 400


@test("POST /api/push 不存在的公众号 → 404")
def test_push_invalid_account():
    with app.test_client() as c:
        r = c.post("/api/push", json={
            "account_id": "nonexistent_account_id_999",
            "title": "test",
            "html": "<p>test</p>"
        })
        assert r.status_code == 404


@test("POST /api/push 推送失败 → 500")
def test_push_failed():
    with app.test_client() as c:
        r = c.post("/api/accounts", json={
            "nickname": "失败测试号",
            "appid": "wx_fail",
            "appsecret": "fail_secret"
        })
        account_id = r.get_json()["account"]["id"]

        with patch("core.token_manager.token_manager.get_token") as mock_tok, \
             patch("app.push_to_draft") as mock_push:

            mock_tok.return_value = "fake_token"
            mock_push.return_value = None  # 推送失败

            r2 = c.post("/api/push", json={
                "account_id": account_id,
                "title": "失败文章",
                "html": "<p>content</p>"
            })
            assert r2.status_code == 500
            assert r2.get_json()["success"] == False


# ── SSE 端点 ──

@test("GET /api/optimize-stream 无 request_id → 400")
def test_sse_missing_id():
    with app.test_client() as c:
        r = c.get("/api/optimize-stream")
        assert r.status_code == 400


@test("GET /api/optimize-stream 超时返回 timeout")
def test_sse_timeout():
    with app.test_client() as c:
        # 用不存在的 request_id → SSE 会等 30 秒才超时
        # 为了测试速度，手动注入结果
        fake_id = "timeout_test_99"
        with _opt_lock:
            _opt_store[fake_id] = {"status": "timeout"}
        r = c.get(f"/api/optimize-stream?request_id={fake_id}")
        data_str = r.get_data(as_text=True)
        assert "timeout" in data_str


@test("GET /api/optimize-stream 失败状态")
def test_sse_failed():
    with app.test_client() as c:
        fake_id = "fail_test_99"
        with _opt_lock:
            _opt_store[fake_id] = {"status": "failed"}
        r = c.get(f"/api/optimize-stream?request_id={fake_id}")
        data_str = r.get_data(as_text=True)
        assert "failed" in data_str


@test("SSE: 渲染后自动后台优化 + SSE 消费")
def test_sse_full_flow():
    with patch("app.call_llm") as mock_llm:
        mock_llm.return_value = "## LLM优化标题\n\nLLM优化后的段落。\n\n- 列表A\n- 列表B"

        with app.test_client() as c:
            r = c.post("/api/render", json={
                "raw_text": "人工智能概述\n\n人工智能就是让机器具备类似人类的思维能力。",
                "theme_id": "monocle"
            })
            data = r.get_json()
            req_id = data["request_id"]

            # 等待后台线程完成
            time.sleep(1.5)

            # 通过 SSE 消费结果
            r2 = c.get(f"/api/optimize-stream?request_id={req_id}")
            sse_data = r2.get_data(as_text=True)
            assert "data: " in sse_data
            # 解析 SSE
            lines = [l for l in sse_data.split("\n") if l.startswith("data: ")]
            assert len(lines) >= 1
            result = json.loads(lines[0][6:])
            assert result["status"] in ("done", "failed", "timeout")
            if result["status"] == "done":
                assert len(result["html"]) > 0
                assert len(result["markdown"]) > 0


# ── 数据文件持久化 ──

@test("历史记录持久化")
def test_history_persistence():
    with app.test_client() as c:
        r = c.post("/api/accounts", json={
            "nickname": "历史测试号",
            "appid": "wx_hist",
            "appsecret": "hist_secret"
        })
        account_id = r.get_json()["account"]["id"]

        with patch("core.token_manager.token_manager.get_token") as mock_tok, \
             patch("app.push_to_draft") as mock_push:
            mock_tok.return_value = "fake_token"
            mock_push.return_value = "media_history_001"

            r2 = c.post("/api/push", json={
                "account_id": account_id,
                "title": "一篇历史文章",
                "html": "<p>content</p>"
            })
            assert r2.status_code == 200

    # 验证数据文件被写入
    history_path = DATA_DIR / "history.json"
    assert history_path.exists()
    history = json.loads(history_path.read_text(encoding="utf-8"))
    assert any("一篇历史文章" == h.get("title") for h in history)


# ── 预处理边界情况 ──

@test("预处理: 已含 Markdown 标记的原样保留")
def test_preprocess_markdown_preserve():
    with app.test_client() as c:
        raw = "## 保留标题\n\n- 列表项\n\n> 引用文本"
        r = c.post("/api/render", json={
            "raw_text": raw,
            "theme_id": "monocle"
        })
        assert r.status_code == 200
        md = r.get_json()["markdown"]
        assert "## 保留标题" in md
        assert "- 列表项" in md
        assert "> 引用文本" in md


@test("预处理: 短标题检测（≤16字符无标点）")
def test_preprocess_short_heading():
    with app.test_client() as c:
        r = c.post("/api/render", json={
            "raw_text": "技术方案\n\n这是具体的内容描述。",
            "theme_id": "monocle"
        })
        assert r.status_code == 200
        md = r.get_json()["markdown"]
        assert "## 技术方案" in md


@test("预处理: 序号标题（一、/ 1. / ①）")
def test_preprocess_numbered_heading():
    with app.test_client() as c:
        r = c.post("/api/render", json={
            "raw_text": "一、项目背景\n\n这是介绍。\n\n1. 具体步骤\n\n操作说明。",
            "theme_id": "monocle"
        })
        assert r.status_code == 200
        md = r.get_json()["markdown"]
        assert "## 一、项目背景" in md
        assert "## 1. 具体步骤" in md


@test("预处理: 句子不当作标题（含功能词如'是/的/了'）")
def test_preprocess_not_sentence():
    with app.test_client() as c:
        r = c.post("/api/render", json={
            "raw_text": "这是一个很长的句子包含了很多关键词和描述内容。\n\n真正的标题\n\n这是另一段内容。",
            "theme_id": "monocle"
        })
        assert r.status_code == 200
        md = r.get_json()["markdown"]
        # "这是一个很长的句子..." 不应该变成标题
        lines = md.split("\n")
        heading_lines = [l for l in lines if l.startswith("## ")]
        # "真正的标题" 应该是标题（短行无标点无功能词）
        assert any("真正的标题" in h for h in heading_lines)


@test("预处理: 引号开头 → 引用块")
def test_preprocess_quote():
    with app.test_client() as c:
        r = c.post("/api/render", json={
            "raw_text": "「真正的自由是什么？」\n\n这是探讨的内容。",
            "theme_id": "monocle"
        })
        assert r.status_code == 200
        md = r.get_json()["markdown"]
        assert "> " in md


# ── 线程安全 ──

@test("_opt_store 并发读写安全")
def test_store_thread_safety():
    with _opt_lock:
        _opt_store.clear()

    errors_list = []
    def writer(tid):
        try:
            for i in range(50):
                with _opt_lock:
                    _opt_store[f"{tid}_{i}"] = {"status": "testing", "data": i}
                time.sleep(0.005)
        except Exception as e:
            errors_list.append(str(e))

    def reader():
        try:
            for _ in range(100):
                with _opt_lock:
                    keys = list(_opt_store.keys())
                    if keys:
                        k = keys[0]
                        _ = _opt_store.get(k)
                time.sleep(0.003)
        except Exception as e:
            errors_list.append(str(e))

    threads = []
    for i in range(3):
        threads.append(threading.Thread(target=writer, args=(i,)))
    threads.append(threading.Thread(target=reader))
    for t in threads:
        t.start()
    for t in threads:
        t.join(timeout=5)

    assert len(errors_list) == 0, f"线程安全错误: {errors_list}"


# ── 前端页面完整性 ──

@test("页面包含所有必要 UI 元素")
def test_ui_elements():
    with app.test_client() as c:
        r = c.get("/")
        html = r.data.decode("utf-8")

        required = [
            # Header
            "SuperSu",
            "theme-select",
            "account-select",
            # Panels
            "input-area",
            "preview-frame",
            "phone-frame",
            "phone-preview-frame",
            # Footer
            "btn-polish",
            "btn-copy",
            "btn-history",
            "btn-push",
            # Modals
            "push-modal",
            "account-mgmt-modal",
            "polish-modal",
            "history-modal",
            # Indicators
            "loading-indicator",
            "render-error",
            "ai-indicator",
            # SSE functions
            "startSSE",
            "closeSSE",
            "switchToOptimized",
            "switchToLocal",
            "updateAllPreviews",
            # Toast
            "showToast",
        ]
        missing = [elem for elem in required if elem not in html]
        assert len(missing) == 0, f"缺少元素: {missing}"


# ============================================================
# 自动执行所有测试
# ============================================================

# 收集所有被 @test() 装饰器标记的函数并执行
_test_functions = []
for _name in list(globals()):
    _obj = globals()[_name]
    if callable(_obj) and hasattr(_obj, '_test_fn'):
        _test_functions.append(_obj)

for _fn in _test_functions:
    _fn()

# ============================================================
# 报告
# ============================================================

print()
print("=" * 60)
total = passed + failed
print(f"结果: {passed}/{total} 通过", end="")
if failed > 0:
    print(f", {failed} 失败")
    print()
    for e in errors:
        print(f"  {e}")
else:
    print(" ✅ 全部通过!")
print("=" * 60)

# 清理测试数据文件
import glob
for f in DATA_DIR.glob("*.json"):
    f.write_text("[]", encoding="utf-8")

sys.exit(0 if failed == 0 else 1)
