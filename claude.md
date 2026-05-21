# WechatAI Formatter — 项目状态

## 当前进度（2026-05-22）

### 已完成
- **Step 1**: Flask 基础框架 + Markdown 转微信 HTML 渲染引擎 (`core/format_engine.py`)
- **Step 2**: 53 个排版主题 (`assets/themes/`) + 前端主题选择器 + 实时预览
- **Step 3**: 本地预处理 (`core/preprocessor.py`) + LLM 后台优化 + SSE 流式推送
  - 前端: AI 优化指示器、本地版/优化版切换、手机预览 (iPhone Dynamic Island 风格)
- **前端功能**: AI 润色、AI 摘要、AI 标题图、一键推送草稿箱、复制到剪贴板
- **公众号管理**: CRUD + Token 管理 (`core/token_manager.py`)
- **推送历史**: localStorage 持久化

### 文件结构
```
wechatca2/
├── app.py                    # Flask 主入口（端口 5000，.env 配置）
├── launcher.py               # 启动器（自动 pip install）
├── core/
│   ├── format_engine.py      # Markdown→微信HTML 排版引擎
│   ├── preprocessor.py       # 纯文本→Markdown 本地预处理
│   ├── ai_client.py          # LLM 调用（OpenAI 兼容 API）
│   ├── image_gen.py          # 标题图生成（文生图 + PIL fallback）
│   ├── token_manager.py      # 微信 Access Token 管理（单例+缓存）
│   └── wechat_publisher.py   # 微信草稿箱推送
├── templates/index.html      # 单页前端（~34KB）
├── assets/themes/            # 53 个主题 JSON
├── data/                     # 运行时数据（accounts.json, history.json）
├── temp_covers/              # 临时封面图（不纳入版本控制）
├── requirements.txt
└── .env                      # 密钥配置（不纳入版本控制）
```

### 启动方式
```bash
pip install -r requirements.txt
python app.py
# 浏览器打开 http://127.0.0.1:5000
```

### 下次开发方向（需求文档 Step 4+）
1. 用户登录/注册系统
2. 文章库管理（保存/编辑/删除草稿）
3. 多公众号批量推送
4. 预览页面独立链接分享
5. 微信扫码登录

### 注意事项
- Flask `debug=False` 时 Jinja2 缓存模板，修改前端后需重启服务器
- 测试用 `python -c "from app import app; app.test_client()..."` 绕过端口冲突
- 端口冲突时 `taskkill //F //IM python.exe` 清理旧进程
- `.env` 中的 API Key 勿提交到 Git

---

# Trae AI Agent Behavior Guidelines

## 1\. Core Mission: Prevent Hallucinations

* NEVER assume or guess. If requirements, APIs, or context are ambiguous, STOP and ask the user for clarification.
* You are allowed and encouraged to say "I don't know" or "I cannot find the source" rather than hallucinating an answer.
* Always verify facts/APIs by cross-referencing existing codebase files or trusted documentation.

## 2\. Think Before Coding

* Before writing any code, explicitly state your understanding, assumptions, and proposed approach in 1-2 sentences.
* Outline a step-by-step plan: (Step -> Verification Method) before execution.

## 3\. Surgical Code Modifications

* Only modify what is strictly requested. Do NOT perform unrelated refactoring, formatting, or "cleanups".
* Match the existing codebase style, naming conventions, and patterns perfectly.
* Never delete existing comments, error handling, or edge cases unless explicitly told to do so.

## 4\. Simplicity \& Fact Grounding

* Write the absolute minimum code required to solve the problem. Avoid over-engineering or adding "future proof" abstractions.
* Ground your decisions in facts: Quote the relevant existing code or documentation verbatim before explaining your logic.

## 5\. Trae Execution \& Verification Loop

* After making code changes, you MUST automatically run the project's test or lint commands to verify correctness.
* Do not ask the user for permission to verify if the commands are defined below.
* 
* \## 6. 大规模重构模式
* 当用户要求「大规模重构」或「全项目分析」时：
* \- 调用 `repo-analyzer` Subagent 并行扫描模块（只分析不改代码）
* \- 分析完成后，主 Agent 根据结果制定修改计划
* \- \*\*每个修改步骤完成后立即运行测试\*\*（保持原有验证规则）
* \- 遇到不明确的先标记 `\[待确认]`，分析阶段不打断，修改前必须确认
* 
* \## 7. 自动 Git Checkpoint
* 每次测试通过后自动执行：
* \- `git add` 本次修改的文件
* \- `git commit -m "refactor(模块): 具体改动说明"`
* \- 测试失败则自动 `git reset --hard` 回滚

