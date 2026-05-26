import os
import json
import logging
from pathlib import Path

from dotenv import load_dotenv

load_dotenv()

import requests

from core.crypto_utils import encrypt, decrypt

logger = logging.getLogger(__name__)

# 内置平台配置模板
PLATFORM_TEMPLATES = {
    "aliyun_bailian": {
        "name": "阿里云百炼",
        "base_url": "https://dashscope.aliyuncs.com/compatible-mode/v1",
        "model": "qwen-max",
        "auth_type": "bearer",
    },
    "openai": {
        "name": "OpenAI (GPT)",
        "base_url": "https://api.openai.com/v1",
        "model": "gpt-4o-mini",
        "auth_type": "bearer",
    },
    "claude": {
        "name": "Claude (Anthropic)",
        "base_url": "https://api.anthropic.com/v1",
        "model": "claude-3-sonnet-20240229",
        "auth_type": "bearer",
    },
    "gemini": {
        "name": "Google Gemini",
        "base_url": "https://generativelanguage.googleapis.com/v1beta",
        "model": "gemini-1.5-flash",
        "auth_type": "query",
        "auth_key": "key",
    },
    "deepseek": {
        "name": "DeepSeek",
        "base_url": "https://api.deepseek.com/v1",
        "model": "deepseek-chat",
        "auth_type": "bearer",
    },
    "zhipu": {
        "name": "智谱 AI (GLM)",
        "base_url": "https://open.bigmodel.cn/api/paas/v4",
        "model": "glm-4",
        "auth_type": "bearer",
    },
    "moonshot": {
        "name": "Moonshot (Kimi)",
        "base_url": "https://api.moonshot.cn/v1",
        "model": "moonshot-v1-8k",
        "auth_type": "bearer",
    },
    "siliconflow": {
        "name": "SiliconFlow",
        "base_url": "https://api.siliconflow.cn/v1",
        "model": "Qwen/Qwen2.5-72B-Instruct",
        "auth_type": "bearer",
    },
    "tokenpool": {
        "name": "TokenPool",
        "base_url": "https://api.tokenpool.co/v1",
        "model": "gpt-4o-mini",
        "auth_type": "bearer",
    },
    "custom": {
        "name": "自定义 OpenAI 兼容",
        "base_url": "",
        "model": "",
        "auth_type": "bearer",
    },
}

# 配置文件路径
CONFIG_PATH = Path(__file__).parent.parent / "data" / "ai_config.json"


def _load_config():
    """加载 AI 配置（api_key 自动解密 + 明文迁移）"""
    if CONFIG_PATH.exists():
        try:
            with open(CONFIG_PATH, "r", encoding="utf-8") as f:
                config = json.load(f)
            raw_key = config.get("api_key", "")
            if raw_key.startswith("enc:"):
                config["api_key"] = decrypt(raw_key)
            elif raw_key:
                encrypted = encrypt(raw_key)
                config["api_key"] = encrypted
                CONFIG_PATH.parent.mkdir(parents=True, exist_ok=True)
                with open(CONFIG_PATH, "w", encoding="utf-8") as f:
                    json.dump(config, f, ensure_ascii=False, indent=2)
                config["api_key"] = decrypt(encrypted)
            return config
        except Exception:
            pass
    # 默认从环境变量读取
    return {
        "platform": "aliyun_bailian",
        "base_url": os.getenv("LLM_BASE_URL") or os.getenv("AI_URL", ""),
        "api_key": os.getenv("LLM_API_KEY") or os.getenv("AI_API_KEY", ""),
        "model": os.getenv("LLM_MODEL") or os.getenv("AI_MODEL", "qwen-max"),
    }


def _save_config(config: dict):
    """保存 AI 配置（api_key 加密存储）"""
    saved = dict(config)
    if saved.get("api_key"):
        saved["api_key"] = encrypt(saved["api_key"])
    CONFIG_PATH.parent.mkdir(parents=True, exist_ok=True)
    with open(CONFIG_PATH, "w", encoding="utf-8") as f:
        json.dump(saved, f, ensure_ascii=False, indent=2)


def get_current_config():
    """获取当前配置（供前端调用）"""
    config = _load_config()
    # 脱敏 api_key
    if config.get("api_key"):
        key = config["api_key"]
        config["api_key_masked"] = key[:8] + "****" + key[-4:] if len(key) > 12 else "****"
    return config


def update_config(platform: str, base_url: str, api_key: str, model: str = ""):
    """更新配置"""
    template = PLATFORM_TEMPLATES.get(platform, PLATFORM_TEMPLATES["custom"])
    config = {
        "platform": platform,
        "base_url": base_url.strip(),
        "api_key": api_key.strip(),
        "model": model.strip() or template.get("model", ""),
    }
    _save_config(config)
    return config


def test_connection(platform: str, base_url: str, api_key: str, model: str = ""):
    """测试 API 连接"""
    if not base_url or not api_key:
        return {"success": False, "error": "请填写 Base URL 和 API Key"}

    template = PLATFORM_TEMPLATES.get(platform, PLATFORM_TEMPLATES["custom"])
    test_model = model or template.get("model", "")

    try:
        if platform == "gemini":
            # Gemini 使用 query 参数
            url = f"{base_url}/models?key={api_key}"
            resp = requests.get(url, timeout=10)
        else:
            headers = {
                "Authorization": f"Bearer {api_key}",
                "Content-Type": "application/json",
            }
            # 尝试一个简单的 models 列表请求
            resp = requests.get(f"{base_url}/models", headers=headers, timeout=10)

        if resp.status_code == 200:
            return {"success": True, "message": "连接成功"}
        else:
            # 有些平台不支持 /models，尝试发一个简单请求
            return _test_with_chat(platform, base_url, api_key, test_model)
    except Exception as e:
        return {"success": False, "error": str(e)}


def _test_with_chat(platform, base_url, api_key, model):
    """用简单 chat 请求测试连接"""
    try:
        if platform == "gemini":
            url = f"{base_url}/models/{model}:generateContent?key={api_key}"
            resp = requests.post(
                url,
                json={"contents": [{"parts": [{"text": "Hi"}]}]},
                timeout=15,
            )
        else:
            headers = {
                "Authorization": f"Bearer {api_key}",
                "Content-Type": "application/json",
            }
            resp = requests.post(
                f"{base_url}/chat/completions",
                headers=headers,
                json={
                    "model": model,
                    "messages": [{"role": "user", "content": "Hi"}],
                    "max_tokens": 5,
                },
                timeout=15,
            )

        if resp.status_code in (200, 201):
            return {"success": True, "message": "连接成功"}
        else:
            return {"success": False, "error": f"HTTP {resp.status_code}: {resp.text[:200]}"}
    except Exception as e:
        return {"success": False, "error": str(e)}


def call_llm(system_prompt: str, user_prompt: str) -> str:
    """调用 LLM"""
    config = _load_config()
    base_url = config.get("base_url", "")
    api_key = config.get("api_key", "")
    model = config.get("model", "")
    platform = config.get("platform", "custom")

    if not base_url or not api_key:
        logger.warning("LLM 未配置")
        return ""

    try:
        if platform == "gemini":
            return _call_gemini(base_url, api_key, model, system_prompt, user_prompt)
        else:
            return _call_openai_compatible(base_url, api_key, model, system_prompt, user_prompt)
    except Exception as e:
        logger.warning("LLM 调用失败: %s", e)
        return ""


def _call_openai_compatible(base_url, api_key, model, system_prompt, user_prompt):
    """调用 OpenAI 兼容接口"""
    resp = requests.post(
        f"{base_url}/chat/completions",
        headers={
            "Authorization": f"Bearer {api_key}",
            "Content-Type": "application/json",
        },
        json={
            "model": model,
            "messages": [
                {"role": "system", "content": system_prompt},
                {"role": "user", "content": user_prompt},
            ],
        },
        timeout=30,
    )
    resp.raise_for_status()
    data = resp.json()
    return data["choices"][0]["message"]["content"].strip()


def _call_gemini(base_url, api_key, model, system_prompt, user_prompt):
    """调用 Gemini API"""
    url = f"{base_url}/models/{model}:generateContent?key={api_key}"
    resp = requests.post(
        url,
        json={
            "contents": [
                {"role": "user", "parts": [{"text": system_prompt + "\n\n" + user_prompt}]}
            ]
        },
        timeout=30,
    )
    resp.raise_for_status()
    data = resp.json()
    return data["candidates"][0]["content"]["parts"][0]["text"].strip()
