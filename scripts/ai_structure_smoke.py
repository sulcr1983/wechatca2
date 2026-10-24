#!/usr/bin/env python3
"""真实 AI 结构排版冒烟（用 .env 里的 DeepSeek Key，不 mock）。

验证的是一条真链路：ai.js 的 PLAN_SYS 提示词 → DeepSeek 返回结构 JSON
→ core.preprocessor.apply_structure 套用 → 正文一字不丢。

prompt 不在这里另抄一份：直接从 pwa/src/ai.js 里抽出 `const PLAN_SYS = `...``，
保证与前端用的是同一份提示词（改前端即改这里，避免漂移）。

用法：
    .venv/Scripts/python.exe scripts/ai_structure_smoke.py
"""

from __future__ import annotations

import argparse
import json
import os
import re
import sys
import urllib.request
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
sys.path.insert(0, str(ROOT))

from dotenv import load_dotenv  # noqa: E402
from core.preprocessor import apply_structure, split_paragraphs  # noqa: E402

load_dotenv(ROOT / ".env")

ARTICLE = """周末去海边

出发前一晚我还在改稿，心里没底。这一夜我反复删了又写，窗外一直下雨，楼下便利店的灯亮到很晚，我盯着屏幕上那行标题，越看越觉得哪里不对。

第一件事是把手机调成飞行模式。第二件事是只带一本书。第三件事是不定返程时间。

预算：800 元
路线：地铁 2 号线转城际公交
住宿：海边民宿，步行 5 分钟到沙滩

最后想说的是，这两天我没有发一条朋友圈。不是刻意克制，而是真的没什么要证明的。回来之后我把标题改了，改成现在这句。
"""


def load_prompt() -> str:
    src = (ROOT / "pwa" / "src" / "ai.js").read_text(encoding="utf-8")
    m = re.search(r"const PLAN_SYS = `([\s\S]*?)`;", src)
    if not m:
        raise SystemExit("ERROR: 没在 pwa/src/ai.js 里找到 PLAN_SYS")
    return m.group(1)


def chat(prompt: str, text: str) -> dict:
    key = os.getenv("DEEPSEEK_API_KEY")
    base = (os.getenv("DEEPSEEK_BASE_URL") or "https://api.deepseek.com/v1").rstrip("/")
    model = os.getenv("DEEPSEEK_MODEL") or "deepseek-chat"
    if not key:
        raise SystemExit("ERROR: .env 里没有 DEEPSEEK_API_KEY")
    paras = split_paragraphs(text)
    numbered = "\n".join(f"[{i}] {p}" for i, p in enumerate(paras))
    body = json.dumps({
        "model": model,
        "messages": [
            {"role": "system", "content": prompt},
            {"role": "user", "content": numbered},
        ],
        "temperature": 0.1,
        "max_tokens": 1800,
        "response_format": {"type": "json_object"},
    }, ensure_ascii=False).encode("utf-8")
    req = urllib.request.Request(
        base + "/chat/completions", data=body,
        headers={"Content-Type": "application/json", "Authorization": "Bearer " + key},
    )
    with urllib.request.urlopen(req, timeout=90) as res:
        data = json.loads(res.read().decode("utf-8"))
    content = data["choices"][0]["message"]["content"]
    return json.loads(re.sub(r"^```(?:json)?|```$", "", content.strip()))


def main() -> int:
    try:
        sys.stdout.reconfigure(encoding="utf-8", errors="replace")
    except Exception:
        pass

    ap = argparse.ArgumentParser()
    ap.add_argument("--file", default="", help="用指定文本文件代替内置短文（如 tests/fixtures/txt-format-lab.txt）")
    ap.add_argument("--max-chars", type=int, default=24000, help="超长时截断，避免一次请求过大")
    ap.add_argument("--dump", default="", help="把 AI 返回的结构 JSON 落到指定文件，便于排查")
    args = ap.parse_args()

    article = ARTICLE
    if args.file:
        p = Path(args.file)
        if not p.is_absolute():
            p = ROOT / p
        if not p.exists():
            raise SystemExit(f"ERROR: 文件不存在：{p}")
        article = p.read_text(encoding="utf-8")
        if len(article) > args.max_chars:
            print(f"⚠️ 原文 {len(article)} 字符，截断到 {args.max_chars} 后测试")
            article = article[:args.max_chars]
        print(f"夹具：{p.name}（{len(article)} 字符 · {len(split_paragraphs(article))} 段）")

    prompt = load_prompt()
    print("→ 调 DeepSeek（真实 Key）…", flush=True)
    plan = chat(prompt, article)
    keys = {k: (len(v) if isinstance(v, list) else v) for k, v in plan.items()}
    print("plan:", json.dumps(keys, ensure_ascii=False))
    if args.dump:
        out = Path(args.dump)
        if not out.is_absolute():
            out = ROOT / out
        out.parent.mkdir(parents=True, exist_ok=True)
        out.write_text(json.dumps(plan, ensure_ascii=False, indent=2), encoding="utf-8")
        print(f"plan 已写入 {out}")

    md = apply_structure(split_paragraphs(article), plan)
    print("\n--- 套用后的 Markdown（前 30 行）---")
    print("\n".join(md.split("\n")[:30]))

    def norm(s: str) -> str:
        """只保留汉字/字母/数字，屏蔽标记、空格、标点差异，专查「字有没有丢」"""
        return re.sub(r"[^\u4e00-\u9fffA-Za-z0-9]", "", s)

    flat = norm(md)
    lost = [seg for seg in article.split("\n") if seg.strip() and norm(seg) and norm(seg) not in flat]
    print("\n--- 校验 ---")
    print(f"字符数：原文 {len(article)} → 结果 {len(md)}")
    print("丢失原文行：", lost[:3] if lost else "无 ✔", f"（共 {len(lost)} 行）" if lost else "")
    feats = [k for k in ("sections", "lists", "bold", "splits", "merges",
                         "tables", "callouts", "hrs", "pullquotes")
             if isinstance(plan.get(k), list) and plan[k]]
    print("AI 实际使用的能力：", feats or "（无）")
    return 0 if not lost else 1


if __name__ == "__main__":
    raise SystemExit(main())
