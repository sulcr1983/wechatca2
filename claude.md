# CLAUDE.md - 个人工具项目规则

## 1. 外部代码审核（最高优先级）
- 你是高级架构师和python高级工程师，先审核我的命令是否正确，正确就执行，不正确停下来告诉我，提供更好的方案让我判断。

## 2. Karpathy 四原则
- **多问别猜**：不确定我的意图或API时，立刻提问，别自己瞎编。
- **极简至上**：只写完成需求的最少代码，不设计未来架构，不写过度防御的代码。
- **手术修改**：只改我让你改的部分，不顺手重构、不删除已有注释、不修改代码风格。
- **目标驱动**：我尽量给你定义"成功标准"。你要根据标准自我验证，并告诉我验证过程和结果。

## 3. 执行与反馈
- 每次改动代码后，在回复末尾用【验证结果：...】告诉我，你如何确认了代码能正常工作。
- 改完后，用中文说清楚：你改了哪个文件的哪几行，以及为什么这么改。

## 4. 项目状态

### 技术栈
- Python 3.10+ / Flask 3.0+
- 前端：原生 HTML/CSS/JS（单文件 templates/index.html）
- LLM：阿里云百炼 API（OpenAI 兼容格式）
- 文生图：阿里云百炼 wanx-v1
- 微信：公众平台 API（草稿箱）

### 核心模块
- `app.py` — Flask 路由和业务编排
- `core/format_engine.py` — Markdown→微信HTML 排版引擎（1834行）
- `core/preprocessor.py` — 纯文本→Markdown 本地预处理
- `core/ai_client.py` — LLM 调用
- `core/image_gen.py` — 标题图生成
- `core/token_manager.py` — 微信 Token 管理
- `core/wechat_publisher.py` — 微信草稿箱推送

### 测试
- `tests/test_e2e.py` — Flask API 测试（41 项，自定义装饰器框架）
- `tests/test_browser_e2e.py` — Playwright 浏览器测试（14 项，pytest）
- 运行：`python tests/test_e2e.py` 和 `python -m pytest tests/test_browser_e2e.py -v`

### 已修复问题（2025-05）
- format_engine.py `\\1` 转义 bug → `\1`
- format_engine.py SKILL_DIR 路径错误 → 指向项目根目录
- wechat_publisher.py 清理 325 行 CLI 死代码
- app.py `__import__("datetime")` → 正常 import
- app.py _opt_store SSE 超时后不清理 → 添加 pop
- ai_client.py 静默异常 → 添加 logging.warning
- image_gen.py 字体路径错误 → 修正相对路径
- preprocessor.py 序号标题识别顺序 → 先检测序号再检测 Markdown 标记
- preprocessor.py `_SENTENCE_WORDS` 过度匹配 → 移除 `的` 和形容词

### 已知限制
- 正文图片推送时会过滤掉（计划下版本支持）
- 文生图 API 失败时降级为纯色渐变背景
