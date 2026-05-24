import os
import json
import uuid
import webbrowser
import threading
import time
from pathlib import Path
from dotenv import load_dotenv

load_dotenv()

from datetime import datetime

from flask import Flask, render_template, request, jsonify, send_from_directory, Response

app = Flask(__name__)

BASE_DIR = Path(__file__).parent
THEMES_DIR = BASE_DIR / "assets" / "themes"
DATA_DIR = BASE_DIR / "data"
TEMP_COVERS_DIR = BASE_DIR / "temp_covers"

DATA_DIR.mkdir(parents=True, exist_ok=True)
TEMP_COVERS_DIR.mkdir(parents=True, exist_ok=True)

from core.format_engine import convert_markdown_to_wechat_html
from core.ai_client import call_llm
from core.token_manager import token_manager
from core.wechat_publisher import push_to_draft, upload_permanent_material, filter_html_images
from core.image_gen import generate_cover
from core.preprocessor import preprocess
from core.crypto_utils import encrypt, decrypt

# ── 后台 LLM 优化结果暂存 ──────────────────────────────────────────────
_opt_store = {}
_opt_lock = threading.Lock()
_data_lock = threading.Lock()
_OPT_MAX_AGE = 120

# ── 启动时迁移旧明文 appsecret ──────────────────────────────────────────
def _migrate_accounts():
    accounts = _read_json("accounts.json")
    changed = False
    for a in accounts:
        if a.get("appsecret") and not a["appsecret"].startswith("enc:"):
            a["appsecret"] = encrypt(a["appsecret"])
            changed = True
    if changed:
        _write_json("accounts.json", accounts)

# ── 润色风格 → 系统提示词 ──────────────────────────────────────────────
POLISH_PROMPTS = {
    "remove_ai_taste": (
        "你是文章润色助手。去除AI痕迹（如'首先、其次、总之'），"
        "用自然口语化表达，可加设问反问，保留原文结构。只输出润色后文本。"
    ),
    "formal": (
        "你是文章润色助手。转为正式专业的语言风格，逻辑严谨。只输出润色后文本。"
    ),
    "casual": (
        "你是文章润色助手。转为轻松口语化风格，像朋友聊天。只输出润色后文本。"
    ),
}

# ── 数据文件辅助 ──────────────────────────────────────────────────────
def _read_json(filename: str) -> list:
    path = DATA_DIR / filename
    with _data_lock:
        if not path.exists():
            path.write_text("[]", encoding="utf-8")
            return []
        try:
            return json.loads(path.read_text(encoding="utf-8"))
        except Exception:
            return []


def _write_json(filename: str, data: list):
    with _data_lock:
        (DATA_DIR / filename).write_text(json.dumps(data, ensure_ascii=False, indent=2), encoding="utf-8")

_migrate_accounts()


# ── 页面 ────────────────────────────────────────────────────────────────
@app.route("/")
def index():
    return render_template("index.html")


# ── 模板 ────────────────────────────────────────────────────────────────
@app.route("/api/themes")
def api_themes():
    themes = []
    for f in sorted(THEMES_DIR.glob("*.json")):
        try:
            data = json.loads(f.read_text(encoding="utf-8"))
            themes.append({
                "id": f.stem,
                "name": data.get("name", f.stem),
            })
        except Exception:
            pass
    return jsonify(themes)


# ── 排版渲染 ────────────────────────────────────────────────────────────
@app.route("/api/render", methods=["POST"])
def api_render():
    data = request.get_json()
    if not data:
        return jsonify({"error": "invalid json"}), 400

    raw_text = data.get("raw_text", "")
    theme_id = data.get("theme_id", "bold-blue")
    skip_preprocess = data.get("skip_preprocess", False)

    theme_path = THEMES_DIR / f"{theme_id}.json"
    if not theme_path.exists():
        return jsonify({"error": f"theme not found: {theme_id}"}), 404

    # 本地预处理：纯文本 → Markdown（除非跳过）
    if skip_preprocess:
        markdown = raw_text
    else:
        markdown = preprocess(raw_text)

    request_id = uuid.uuid4().hex[:12]

    try:
        html = convert_markdown_to_wechat_html(markdown, str(theme_path))
    except Exception as e:
        return jsonify({"error": str(e)}), 500

    # 后台异步 LLM 优化（仅在首次渲染时）
    if not skip_preprocess:
        _start_background_optimization(request_id, raw_text, str(theme_path))

    return jsonify({
        "html": html,
        "markdown": markdown,
        "request_id": request_id,
        "is_optimized": False,
    })


def _start_background_optimization(request_id: str, raw_text: str, theme_path: str):
    """在后台线程中调用 LLM 优化 Markdown 并重新渲染"""
    def _run():
        try:
            prompt = (
                "你是文章排版助手。用户提供了一段纯文本，可能包含标题、段落、列表等。"
                "请以Markdown格式输出，严格遵循以下规则：\n"
                "- 使用 ## 和 ### 作为标题层级，不要使用 #\n"
                "- 段落之间用空行分隔\n"
                "- 列表项使用 - 开头\n"
                "- 引用内容用 > 开头\n"
                "- 不要添加任何解释，只输出Markdown\n"
                "输入文本："
            )
            result = call_llm(prompt, raw_text)
            if not result:
                with _opt_lock:
                    _opt_store[request_id] = {"status": "failed", "_ts": time.time()}
                return
            html = convert_markdown_to_wechat_html(result, theme_path)
            with _opt_lock:
                _opt_store[request_id] = {
                    "status": "done",
                    "html": html,
                    "markdown": result,
                    "_ts": time.time(),
                }
        except Exception:
            with _opt_lock:
                _opt_store[request_id] = {"status": "failed", "_ts": time.time()}

    t = threading.Thread(target=_run, daemon=True)
    t.start()


# ── SSE: LLM 优化结果推送 ──────────────────────────────────────────────
@app.route("/api/optimize-stream")
def api_optimize_stream():
    request_id = request.args.get("request_id", "")
    if not request_id:
        return jsonify({"error": "request_id required"}), 400

    def generate():
        for _ in range(60):
            with _opt_lock:
                result = _opt_store.pop(request_id, None)
                now = time.time()
                expired = [k for k, v in _opt_store.items() if now - v.get("_ts", 0) > _OPT_MAX_AGE]
                for k in expired:
                    del _opt_store[k]
            if result is not None:
                result.pop("_ts", None)
                yield f"data: {json.dumps(result, ensure_ascii=False)}\n\n"
                return
            time.sleep(0.5)
        with _opt_lock:
            _opt_store.pop(request_id, None)
        yield f"data: {json.dumps({'status': 'timeout'}, ensure_ascii=False)}\n\n"

    return Response(generate(), mimetype="text/event-stream")


# ── AI 润色 ─────────────────────────────────────────────────────────────
@app.route("/api/polish", methods=["POST"])
def api_polish():
    data = request.get_json()
    if not data:
        return jsonify({"success": False, "error": "invalid json"}), 400

    text = data.get("text", "").strip()
    style = data.get("style", "remove_ai_taste")

    if not text:
        return jsonify({"success": False, "error": "text is empty"}), 400

    system_prompt = POLISH_PROMPTS.get(style, POLISH_PROMPTS["remove_ai_taste"])
    result = call_llm(system_prompt, text)

    if not result:
        return jsonify({"success": False, "error": "LLM call failed"}), 500

    return jsonify({"success": True, "polished_text": result})


# ── 公众号管理 ──────────────────────────────────────────────────────────
@app.route("/api/accounts")
def api_accounts():
    accounts = _read_json("accounts.json")
    safe = []
    for a in accounts:
        a_copy = dict(a)
        a_copy["appsecret"] = "***"
        safe.append(a_copy)
    return jsonify(safe)


@app.route("/api/accounts", methods=["POST"])
def api_add_account():
    data = request.get_json()
    if not data:
        return jsonify({"success": False, "error": "invalid json"}), 400

    nickname = data.get("nickname", "").strip()
    appid = data.get("appid", "").strip()
    appsecret = data.get("appsecret", "").strip()

    if not nickname or not appid or not appsecret:
        return jsonify({"success": False, "error": "nickname, appid, appsecret are required"}), 400

    accounts = _read_json("accounts.json")
    account = {
        "id": uuid.uuid4().hex[:12],
        "nickname": nickname,
        "appid": appid,
        "appsecret": encrypt(appsecret),
    }
    accounts.append(account)
    _write_json("accounts.json", accounts)
    return jsonify({"success": True, "account": account})


@app.route("/api/accounts/<account_id>", methods=["DELETE"])
def api_delete_account(account_id):
    accounts = _read_json("accounts.json")
    accounts = [a for a in accounts if a.get("id") != account_id]
    _write_json("accounts.json", accounts)
    return jsonify({"success": True})


# ── AI 摘要 ─────────────────────────────────────────────────────────────
@app.route("/api/summary", methods=["POST"])
def api_summary():
    data = request.get_json()
    if not data:
        return jsonify({"success": False, "error": "invalid json"}), 400

    article_text = data.get("article_text", "").strip()
    if not article_text:
        return jsonify({"success": False, "error": "article_text is empty"}), 400

    prompt = (
        "请为以下文章生成80-100字的人性化摘要。"
        "用自然的口吻总结文章核心内容，让读者有阅读欲望。"
        "不要使用'本文'、'作者'等生硬开头。只输出摘要文本。"
    )
    result = call_llm(prompt, article_text[:3000])

    if not result:
        return jsonify({"success": False, "error": "LLM call failed"}), 500

    return jsonify({"success": True, "summary": result})


# ── 标题图生成 ──────────────────────────────────────────────────────────
@app.route("/api/cover-image", methods=["POST"])
def api_cover_image():
    data = request.get_json()
    if not data:
        return jsonify({"success": False, "error": "invalid json"}), 400

    title = data.get("title", "").strip()
    full_text = data.get("full_text", "").strip()

    if not title:
        return jsonify({"success": False, "error": "title is required"}), 400

    try:
        img_bytes = generate_cover(title, full_text)
    except Exception as e:
        return jsonify({"success": False, "error": str(e)}), 500

    filename = f"{uuid.uuid4().hex}.png"
    filepath = TEMP_COVERS_DIR / filename
    filepath.write_bytes(img_bytes)

    image_url = f"/temp_covers/{filename}"
    return jsonify({"success": True, "image_url": image_url})


@app.route("/temp_covers/<filename>")
def serve_cover(filename):
    return send_from_directory(str(TEMP_COVERS_DIR), filename)


# ── 推送草稿箱 ──────────────────────────────────────────────────────────
@app.route("/api/push", methods=["POST"])
def api_push():
    data = request.get_json()
    if not data:
        return jsonify({"success": False, "error": "invalid json"}), 400

    account_id = data.get("account_id", "")
    title = data.get("title", "").strip()
    html_content = data.get("html", "")
    summary = data.get("summary", "").strip()
    cover_temp_filename = data.get("cover_temp_filename", "")

    if not account_id or not title or not html_content:
        return jsonify({"success": False, "error": "account_id, title, html are required"}), 400

    # 查找公众号配置
    accounts = _read_json("accounts.json")
    account = next((a for a in accounts if a.get("id") == account_id), None)
    if not account:
        return jsonify({"success": False, "error": "account not found"}), 404

    # 获取 Access Token
    try:
        token = token_manager.get_token(account["appid"], decrypt(account["appsecret"]))
    except Exception as e:
        return jsonify({"success": False, "error": f"token error: {str(e)}"}), 500

    # 上传封面图
    thumb_media_id = ""
    if cover_temp_filename:
        cover_path = TEMP_COVERS_DIR / cover_temp_filename
        if cover_path.exists():
            thumb_media_id = upload_permanent_material(token, cover_path.read_bytes(), cover_temp_filename) or ""

    # 过滤正文图片
    html_content = filter_html_images(html_content)

    # 推送
    media_id = push_to_draft(token, title, html_content, summary, thumb_media_id)
    if not media_id:
        return jsonify({"success": False, "error": "微信推送失败，请检查公众号权限和网络"}), 500

    # 保存历史
    history = _read_json("history.json")
    history.insert(0, {
        "id": uuid.uuid4().hex[:12],
        "title": title,
        "account": account.get("nickname", ""),
        "draft_media_id": media_id,
        "time": datetime.now().isoformat(),
    })
    _write_json("history.json", history[:20])

    return jsonify({"success": True, "media_id": media_id})


# ── 启动 ────────────────────────────────────────────────────────────────
def open_browser():
    port = int(os.getenv("PORT", 5000))
    webbrowser.open(f"http://127.0.0.1:{port}")


if __name__ == "__main__":
    port = int(os.getenv("PORT", 5000))
    threading.Timer(1.5, open_browser).start()
    app.run(host="127.0.0.1", port=port, debug=False, threaded=True)
