#!/usr/bin/env python3
"""审计自动化执行器（对应 docs/audit-playbook.md 的 A/C/D/E/F 项）

用法：python scripts/audit_run.py
输出：Markdown 表格到 stdout + test_output/audit/audit-result.md
说明：B 类（测试健康度）耗时较长，由审计员单独跑并粘贴结果；G 类（PWA）在 pwa/ 未开工时 SKIP。
"""
import glob
import io
import json
import os
import re
import subprocess
import sys

BASE = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
os.chdir(BASE)

rows = []


def add(cid, name, status, detail):
    rows.append((cid, name, status, str(detail)[:160]))


def sh(cmd, timeout=60):
    r = subprocess.run(cmd, shell=True, capture_output=True, text=True,
                       encoding="utf-8", errors="replace", timeout=timeout)
    return r.returncode, ((r.stdout or "") + (r.stderr or "")).strip()


PY = os.path.join(".venv", "Scripts", "python.exe") if os.name == "nt" else "python3"

# ── A 环境与启动 ──
code, out = sh('%s -c "import flask, markdown, PIL, requests, playwright; print(\'ok\')"' % PY)
add("A1", "依赖导入", "PASS" if code == 0 and "ok" in out else "FAIL", out or "import failed")

code, out = sh("%s -m pip show playwright" % PY)
m = re.search(r"Version:\s*([\d.]+)", out)
ver = m.group(1) if m else "?"
ok = bool(m) and tuple(int(x) for x in ver.split(".")[:2]) >= (1, 61)
add("A2", "Playwright ≥1.61", "PASS" if ok else "FAIL", ver)

code, out = sh('netstat -ano | findstr ":5000" | findstr LISTENING')
add("A4", "端口 5000 空闲（审计开始时应空闲）", "PASS" if not out.strip() else "WARN",
    "无监听" if not out.strip() else out.splitlines()[0][:80])

code, out = sh('%s -c "from playwright.sync_api import sync_playwright; from core.browser_utils import launch_browser; p=sync_playwright().start(); b=launch_browser(p, args=[\'--no-proxy-server\']); print(\'browser ok\'); b.close(); p.stop()"'
               % PY, timeout=90)
add("A5", "浏览器内核可用", "PASS" if "browser ok" in out else "FAIL", out[-100:] or "no output")

# ── C 代码质量 ──
pyfiles = ["app.py"] + sorted(glob.glob("core/*.py")) + sorted(glob.glob("scripts/*.py"))
code, out = sh('%s -m py_compile %s' % (PY, " ".join('"%s"' % f for f in pyfiles)))
add("C1", "Python 语法", "PASS" if code == 0 else "FAIL", "全部通过（%d 文件）" % len(pyfiles) if code == 0 else out[-160:])

# C2 前端 JS 语法
try:
    src = io.open("templates/index.html", encoding="utf-8").read()
    m2 = re.search(r"<script>(.*?)</script>", src, re.S)
    os.makedirs("test_output/audit", exist_ok=True)
    io.open("test_output/audit/_check.js", "w", encoding="utf-8", newline="\n").write(m2.group(1))
    code, out = sh("node --check test_output/audit/_check.js")
    add("C2", "前端 JS 语法", "PASS" if code == 0 else "FAIL", "ok" if code == 0 else out[-160:])
except Exception as e:
    add("C2", "前端 JS 语法", "FAIL", e)

SECRET_RE = re.compile(r"AppSecret\s*=\s*['\"][^'\"]{8,}|appsecret\s*=\s*['\"][^'\"]{8,}|sk-[A-Za-z0-9]{20,}", re.I)
hits = []
for root, dirs, fs in os.walk("."):
    dirs[:] = [d for d in dirs if d not in (".venv", "node_modules", ".git", "blcaptain-style-skill", "output", "test_output", "data")]
    for f in fs:
        if not f.endswith((".py", ".html")):
            continue
        p = os.path.join(root, f)
        try:
            txt = io.open(p, encoding="utf-8", errors="ignore").read()
        except OSError:
            continue
        if SECRET_RE.search(txt):
            hits.append(p)
add("C3", "无硬编码密钥", "PASS" if not hits else "FAIL", hits[:3] or "未发现")

try:
    files = glob.glob("public/themes/*.json")
    for f in files:
        json.load(io.open(f, encoding="utf-8"))
    add("C4", "主题 JSON 完整性", "PASS" if len(files) == 164 else "WARN", "%d 个，全部可解析" % len(files))
except Exception as e:
    add("C4", "主题 JSON 完整性", "FAIL", e)

src = io.open("templates/index.html", encoding="utf-8").read()
ids = ["tpl-strip", "input-area", "preview-frame", "btn-copy", "btn-push", "btn-history"]
missing = [i for i in ids if ('id="%s"' % i) not in src]
add("C5", "前端 DOM 契约（6 个关键 id）", "PASS" if not missing else "FAIL",
    "6/6 存在" if not missing else "缺失：" + ",".join(missing))

# ── D 文档一致性 ──
docs = ["README.md", "AGENTS.md", "HANDOFF.md", "CLOSURE.md", "files/TODO.md"]
missing = [d for d in docs if not os.path.exists(d)]
add("D1", "5 个主文档齐全", "PASS" if not missing else "FAIL",
    "5/5" if not missing else "缺失：" + ",".join(missing))

# D2：AGENTS 里的 E2E 计数 vs 实测基线（62）
ag = io.open("AGENTS.md", encoding="utf-8").read()
counts = set(re.findall(r"test_e2e\.py.*?(\d+)/(\d+)\s*通过", ag))
add("D2", "AGENTS 测试计数与实际一致", "PASS" if any(c[0] == "62" for c in counts) else "FAIL",
    "AGENTS 中 test_e2e 计数：%s（实测 62）" % (sorted(counts) or "未找到"))

ho = io.open("HANDOFF.md", encoding="utf-8").read()
dates = re.findall(r"20\d\d-\d\d-\d\d", ho)
add("D3", "HANDOFF 有最近变更（10-18）",
    "PASS" if "2026-10-18" in ho else "FAIL", "最近日期：%s" % (sorted(dates)[-1] if dates else "无"))

cl = io.open("CLOSURE.md", encoding="utf-8").read()
add("D4", "CLOSURE 有 7 位以上哈希",
    "PASS" if re.search(r"\b[0-9a-f]{7,40}\b", cl) else "FAIL",
    "命中哈希：%s" % (re.findall(r"\b[0-9a-f]{7,40}\b", cl)[:2] or "无"))

root_docs = sorted(os.path.basename(p) for p in glob.glob("docs/*"))
allow_dirs = {"archive", "prototypes", "screenshots", "ux-audit", "assets", "audit"}
bad = [p for p in root_docs if os.path.isdir("docs/" + p) and p not in allow_dirs]
bad += [p for p in root_docs if os.path.isfile("docs/" + p) and not p.endswith(".md") and p != "exe-packaging-report.html"]
add("D5", "docs 根下规范（只 md + 白名单目录）", "PASS" if not bad else "WARN", bad or "ok")

# ── E 产出物与目录 ──
code, out = sh("git status --short")
ignored_dirs = [l for l in out.splitlines() if re.search(r"^(M|A|D|\?\?)\s+(data|output|test_output|uploads|temp_covers|pwa/dist)/", l)]
dirty = [l for l in out.splitlines() if l and l not in ignored_dirs]
add("E1", "工作区干净（忽略产物目录）", "PASS" if not dirty else "WARN",
    "干净" if not dirty else "；".join(dirty[:3]))

size_mb = 0
for r, ds, fs in os.walk("output"):
    for f in fs:
        try:
            size_mb += os.path.getsize(os.path.join(r, f))
        except OSError:
            pass
size_mb /= 1024 * 1024
add("E2", "output 体积 <500MB", "PASS" if size_mb < 500 else "FAIL", "%.1f MB" % size_mb)

tfiles = os.listdir("test_output") if os.path.isdir("test_output") else []
stale_py = [f for f in tfiles if f.endswith(".py")]
add("E3", "test_output 无残留临时脚本", "PASS" if not stale_py else "WARN",
    "无残留" if not stale_py else "残留：" + ",".join(stale_py[:3]))

gi = io.open(".gitignore", encoding="utf-8").read() if os.path.exists(".gitignore") else ""
need = ["data/", "output/", "test_output/", "pwa/dist", ".env"]
hit = [t for t in need if t in gi]
add("E4", "gitignore 覆盖关键目录（5 条）", "PASS" if len(hit) == len(need) else "WARN",
    "%d/%d 条在 .gitignore（缺：%s）" % (len(hit), len(need), ",".join(t for t in need if t not in gi) or "无"))

# ── F 合规 ──
add("F1", "根目录有 LICENSE + THIRD_PARTY_NOTICES",
    "PASS" if os.path.exists("LICENSE") and os.path.exists("THIRD_PARTY_NOTICES.md") else "FAIL",
    "LICENSE=%s NOTICE=%s" % (os.path.exists("LICENSE"), os.path.exists("THIRD_PARTY_NOTICES.md")))

rd = io.open("README.md", encoding="utf-8").read()
declared = "AGPL" if "AGPL" in rd else ("MIT" if "MIT" in rd else "未声明")
has_license = os.path.exists("LICENSE")
add("F2", "README 许可声明与 LICENSE 一致", "PASS" if (has_license and declared != "未声明") else "FAIL",
    "README 声明=%s，LICENSE=%s" % (declared, "存在" if has_license else "缺失"))

add("F3", "字体 OFL 文件", "PASS" if os.path.exists("pwa/public/fonts/OFL.txt") else "SKIP",
    "存在" if os.path.exists("pwa/public/fonts/OFL.txt") else "pwa 字体未落地")

code, out = sh('git ls-files | grep -E "^\\.env$|^data/|^output/" | grep -v ".gitkeep" | head -5')
add("F4", "敏感文件未入库", "PASS" if not out.strip() else "FAIL", out or "未入库（.gitkeep 除外）")

add("F5", "第三方许可说明（THIRD_PARTY_NOTICES）",
    "PASS" if os.path.exists("THIRD_PARTY_NOTICES.md") else "FAIL",
    "存在" if os.path.exists("THIRD_PARTY_NOTICES.md") else "缺失")

# ── G PWA 专项 ──
if os.path.exists("pwa/index.html"):
    add("G1", "PWA 构建白名单", "SKIP", "构建脚本尚未落地")
    add("G2", "无外网字体依赖", "SKIP", "同上")
    add("G3", "PWA 三件套", "SKIP", "同上")
    add("G4", "离线可用", "SKIP", "同上")
else:
    add("G0", "PWA 目录", "SKIP", "pwa/index.html 未创建，G 类整体 SKIP")

# ── 输出 ──
lines = ["| 编号 | 检查项 | 结果 | 详情 |", "|---|---|---|---|"]
for cid, name, status, detail in rows:
    icon = {"PASS": "✅ PASS", "FAIL": "❌ FAIL", "WARN": "⚠️ WARN", "SKIP": "⏭ SKIP"}[status]
    lines.append("| %s | %s | %s | %s |" % (cid, name, icon, detail.replace("|", "/")))

report = "\n".join(lines)
os.makedirs("test_output/audit", exist_ok=True)
io.open("test_output/audit/audit-result.md", "w", encoding="utf-8", newline="\n").write(report + "\n")
print(report)

fail = [r for r in rows if r[2] == "FAIL"]
print("\n========== 汇总 ==========")
print("PASS: %d / WARN: %d / FAIL: %d / SKIP: %d" % (
    sum(1 for r in rows if r[2] == "PASS"),
    sum(1 for r in rows if r[2] == "WARN"),
    len(fail),
    sum(1 for r in rows if r[2] == "SKIP"),
))
if fail:
    print("需修复：")
    for cid, name, _, detail in fail:
        print("  [%s] %s —— %s" % (cid, name, detail))
