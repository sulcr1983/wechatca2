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

