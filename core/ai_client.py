import os
from dotenv import load_dotenv

load_dotenv()

import requests

LLM_BASE_URL = os.getenv("LLM_BASE_URL") or os.getenv("AI_URL", "")
LLM_API_KEY = os.getenv("LLM_API_KEY") or os.getenv("AI_API_KEY", "")
LLM_MODEL = os.getenv("LLM_MODEL") or os.getenv("AI_MODEL", "gpt-4o-mini")


def call_llm(system_prompt: str, user_prompt: str) -> str:
    if not LLM_BASE_URL or not LLM_API_KEY:
        return ""

    try:
        resp = requests.post(
            f"{LLM_BASE_URL}/chat/completions",
            headers={
                "Authorization": f"Bearer {LLM_API_KEY}",
                "Content-Type": "application/json",
            },
            json={
                "model": LLM_MODEL,
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
    except Exception:
        return ""
