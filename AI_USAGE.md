# Agent 宪法模板 AI 使用方法

本文写给负责生成项目级 agent 宪法的 AI。用户把本仓库链接发给你时，你的目标不是复制模板，而是基于本仓库的通用 Agent 宪法、目标项目的当前事实，以及当前 AI 工具官方读取规则，生成一份适合目标项目的最佳 agent 宪法。

## 输入

你需要同时读取：

- 本仓库的 `AGENTS.md`：作为通用宪法模板和工作纪律来源。
- 本文件 `AI_USAGE.md`：作为适配流程和输出标准。
- 目标项目仓库：作为唯一项目事实来源。
- 当前目标 AI 工具的官方说明：用于确认它实际读取哪个指令文件、层级规则和作用域。

如果用户只给了本仓库链接、没有给目标项目，请先要求用户提供目标项目仓库、代码目录、压缩包或足够的项目文件。不要在没有目标项目事实的情况下生成项目级宪法。

## 总原则

- `AGENTS.md` 是模板，不是最终答案。你必须审计目标项目后再适配。
- 生成宪法前先输出“宪法设计包”，不要直接开始写 `AGENTS.md`。
- 通用工程纪律可以继承；项目名、框架、命令、目录、owner、部署面和产品边界必须来自目标项目证据。
- 带 `@@...@@` 的内容是适配标识，必须替换、细化或删除；禁止原样保留成空口号。
- 只启用目标项目真实使用的 `@@STACK@@` 和 `@@ADAPTER@@` 规则；不要因为模板里提到某技术，就把它写进目标项目宪法。
- 如果目标项目已有 `AGENTS.md`、`CLAUDE.md`、`GEMINI.md`、`.github/copilot-instructions.md`、`.github/instructions/*.instructions.md`、Cursor rules 或内部工程规则，必须先对比，不得盲目覆盖。
- 保持一个项目级宪法真源；不同 AI 工具的入口文件应导入、引用或摘要同一个真源，避免多个文件互相竞争。
- 不要把本仓库的微信群区块、技能清单、仓库宣传内容复制进目标项目，除非用户明确要求。

## 宪法设计包前置闸

默认先只读输出设计包，让用户或当前工作流确认后再写最终指令文件。除非用户明确要求“一次性直接写入”，否则不要跳过这一闸。

设计包必须包含：

- `项目证据包`：项目名、产品边界、仓库根、git 状态、主要入口、语言框架、数据库、鉴权、配置、部署、测试与运行线索；每项都标来源路径或 `未找到`。
- `真源清单`：README、docs、dev-docs、ADR、架构文档、需求文档、已有 agent 指令、贡献规则、脚本和测试入口。
- `Owner map`：每个核心概念的唯一 owner 文件、目录或文档；缺失处标 `缺口`，不要发明 owner。
- `Stack map`：目标项目真实使用的语言、框架、包管理器、构建工具、测试工具、数据库、运行时、部署平台和第三方服务。
- `非目标和拒绝方向`：当前主线、明确不做的方向、旧路线、旧字段、旧平台或不应继续兼容的残影。
- `验收命令 map`：发现的 format、lint、typecheck、test、build、preview、deploy dry-run、自定义 gate；区分“已找到”“已运行”“未运行”。
- `模板条款映射`：把通用模板的重要条款逐条标为 `keep`、`rewrite`、`delete` 或 `ask`，并说明目标项目证据和最终规则。
- `缺失证据和用户问题`：只列会改变产品可见范围、成本、停机、迁移、锁定、数据或不可逆后果的问题；纯技术判断由 AI 继续审计或基于证据推荐。

没有设计包，不输出最终宪法。

## 只读审计边界

生成或审计项目宪法时默认只读。允许：

- 读取文件。
- 列文件。
- 搜索文本。
- 检查 package scripts、配置文件、构建配置、CI 配置和脚本入口。
- 检查 git root、分支、dirty worktree、ignored 文件和 staged 状态。

默认不要运行：

- build、test、lint、typecheck、format。
- dev server、preview server。
- install、update、codegen。
- 数据库迁移、seed、写库脚本。
- deploy、release、publish。
- 任何可能写 cache、生成物、构建产物、数据库状态、外部系统状态或需要网络凭据的命令。

这些命令应进入 `验收命令 map`，标注为 `未运行，只读体检未执行`。如果用户明确授权运行，再按风险和写入面执行。

## 必做审计

生成项目级宪法前，至少完成以下只读审计：

- 确认 git root、嵌套仓库、当前分支、dirty worktree、ignored 文件和 staged 状态。
- 阅读目标项目现有 agent 指令文件：`AGENTS.md`、`AGENTS.override.md`、`CLAUDE.md`、`GEMINI.md`、`.github/copilot-instructions.md`、`.github/instructions/*.instructions.md`、`.cursor/rules`、`.cursorrules`、`.windsurfrules`、`.clinerules`、`.devin/rules/` 或等价文件。
- 阅读项目入口文档：`README.md`、`docs/README.md`、`dev-docs/README.md`、`CONTRIBUTING.md`、ADR 或架构索引。
- 识别语言、框架、包管理器、构建系统、测试框架、代码生成器、数据库、部署平台、运行时入口和第三方 provider。
- 找到核心代码边界：UI/API/CLI/worker/runtime/SDK/contract/schema/service/repository/store 等谁拥有核心语义。
- 找到验收命令：format、lint、typecheck、unit、integration、e2e、build、preview、deploy dry-run 或项目自定义 gate。
- 查找生成物和不可手改边界：`DO NOT EDIT`、schema/codegen 输出、bundle artifact、迁移生成物、锁文件和构建产物。
- 识别产品边界和非目标：当前主线是什么，哪些旧路线、旧平台、旧字段或旧产品残影不应继续污染项目。

## Owner Map 要求

Owner map 不只是“前端/后端/数据库”三行。至少检查：

- 产品定位、用户对象、当前阶段和功能清单。
- 阶段计划、验收标准、非目标和拒绝方向。
- 前端路由、页面结构、状态管理、共享组件。
- UI token、设计系统、图标、主题、响应式规则和设计稿真源。
- API contract、SDK contract、事件 contract、CLI contract 或协议文档。
- 后端业务逻辑、service、repository、job、worker、runtime。
- 数据库 schema、迁移、seed、索引、事务、权限/RLS。
- auth、permission、tenant/user ownership、admin 边界。
- 配置、密钥、环境变量、运行基线和本地依赖服务。
- 第三方 provider、webhook、文件上传、AI/LLM、支付/订阅/权益。
- 测试、fixture、CI、质量 gate、浏览器验收和用户验收。
- 部署、发布、回滚、监控、日志、公开/私有访问面。
- 内部文档、外部用户文档、变更记录和交接文档。

找不到 owner 时，写成缺口和风险，不要把 UI、handler、prompt、脚本或 README 硬写成业务 owner。

## 适配步骤

1. 建立目标项目事实表：项目名、产品边界、技术栈、真源文档、owner 层、验收命令、风险面和已存在规则。
2. 输出宪法设计包，并让最终宪法的每条项目规则能回指到证据、owner、命令或用户确认。
3. 从模板抽取通用纪律：真源优先、推理闸、owner 边界、薄 adapter、生成物只读、严格验收、Git 边界和交接规则。
4. 替换所有适配标识：
   - `@@PROJECT:<name>@@` 替换为目标项目名或产品边界。
   - `@@TRUTH:<path>@@` 替换为目标项目真实文档入口。
   - `@@COMMAND:<command>@@` 替换为目标项目实际存在的命令；未运行的命令标 `未运行`，不要声称通过。
   - `@@OWNER:<module/layer>@@` 替换为目标项目真实 owner 模块或层。
   - `@@BOUNDARY:<goal/non-goal>@@` 替换为目标项目主线和非目标。
5. 只保留真实适用的 `@@STACK@@` 条款，并把泛称改成项目语言和工具链的具体规则。
6. 只创建真实适用的 `@@ADAPTER@@` 适配块。每个适配块必须写明 `applies_when`、`authority` 和 `verification`。
7. 删除目标项目不需要的模板残留、泛化口号、重复条款、本仓库私有内容和官方工具不读取的孤立文件。
8. 输出前做一致性检查：命令是否存在，路径是否存在，owner 是否唯一，工具入口是否会实际被读取，规则是否互相冲突，是否还有未替换的占位符。

## 工具入口适配

不同 AI 工具读取不同文件。先确认用户实际使用的 IDE、CLI 或云端 agent，再生成对应入口。不要假设所有工具都自动读取 `AGENTS.md`。

- `Codex / OpenAI`：默认以 `AGENTS.md` 作为项目级入口；可用 `AGENTS.override.md` 做覆盖。Codex 会从项目根到当前目录合并指令，越靠近当前目录的文件越晚出现、优先级越高；注意默认大小限制和嵌套目录规则。
- `GitHub Copilot / VS Code`：仓库级通用指令放 `.github/copilot-instructions.md`；路径级指令放 `.github/instructions/*.instructions.md` 并用 `applyTo` 绑定路径；agent 指令可用仓库内的 `AGENTS.md`，最近目录的 `AGENTS.md` 优先。需要 Copilot、Codex 共用规则时，保持一个宪法真源，再让 Copilot 入口摘要或引用它。
- `Claude Code`：Claude Code 读取 `CLAUDE.md` 或 `.claude/CLAUDE.md`，不直接读取 `AGENTS.md`。若项目以 `AGENTS.md` 为唯一真源，创建 `CLAUDE.md` 并用 `@AGENTS.md` 导入，再追加 Claude 专属规则；不要复制两份大段正文。
- `Gemini CLI`：默认使用 `GEMINI.md` 层级上下文；可用 `@file.md` 导入拆分文件，也可在设置里配置 `context.fileName` 识别 `AGENTS.md`。若要多工具共用，优先让 `GEMINI.md` 导入或指向项目宪法真源。
- `Cursor / Windsurf / Devin / Cline / 其他 IDE agent`：先读取目标项目已有规则文件和当前官方说明，再决定入口。若工具支持导入或引用，指向同一个项目宪法真源；若只能复制摘要，摘要必须标明“主真源是哪个文件”，避免两套规则漂移。

生成多入口时，必须列出：

- 主宪法真源文件。
- 每个工具会读取的入口文件。
- 入口文件与主真源的关系：导入、引用、摘要还是独立适配。
- 冲突处理规则：同一工具层级内遵守其官方优先级；跨工具以项目主宪法真源为准。

## 官方证据和技术推荐

第一次建立项目基础、改技术栈、改框架、改 SDK、改部署形态、改数据库或改权限模型时，AI 必须查当前官方文档和项目真源后给出一个推荐主线。不要让用户从技术名词里盲选。

用户只需要确认这些产品后果：

- 可见范围是否改变。
- 成本、配额或供应商锁定是否可接受。
- 是否需要停机、迁移、数据清理或回滚窗口。
- 是否有不可逆操作。
- 是否改变用户体验、权限、公开访问面或上线节奏。

如果缺少会改变这些后果的事实，每次只问一个最高影响问题。不要用“你想用 A 还是 B”代替 AI 的技术判断。

## 输出格式

默认先输出宪法设计包，再输出一份完整的目标项目 agent 宪法草案。如果用户允许你直接改文件，先写入目标项目对应入口文件；否则输出 Markdown 内容供用户复制。

输出前必须附上简短审计摘要：

- `项目事实`：项目名、主语言/框架、主要入口、真源文档。
- `主宪法真源`：最终建议使用哪个文件作为唯一项目宪法。
- `工具入口`：Codex、Copilot、Claude、Gemini、Cursor 或其他目标工具分别读取什么文件。
- `采用的适配`：实际启用的 stack/adapter。
- `删除的模板残留`：未采用的模板块和删除原因。
- `Owner map 缺口`：缺失 owner、冲突 owner 或不能确认的层。
- `未闭合问题`：需要用户确认的冲突、缺失命令或产品后果。
- `建议验收`：生成后应该运行的命令、人工检查或目标工具 `/context`、`/memory show`、References 检查等入口验证。

## 质量门禁

最终项目宪法必须满足：

- 不包含未解释的 `@@...@@` 占位符，除非明确作为项目后续填空并标注原因。
- 不包含目标项目没有使用的框架、语言、数据库、云平台或工具链规则。
- 不把 UI、HTTP handler、CLI、prompt 或脚本写成核心业务 owner，除非目标项目事实证明它们就是 owner。
- 不保留旧产品残影、无意义兼容、双路线和“以后再补”的 TODO。
- 不包含本仓库微信群、技能清单、宣传文案或私有仓库路径。
- 不声称某命令可用或已通过，除非已在目标项目中找到或运行验证过。
- 不覆盖用户未授权的 dirty worktree 改动。
- 每条项目专属规则都能说明保护什么风险，依据来自哪个文件、owner、命令、官方文档或用户确认。
- 每个实际技术栈至少有一条具体规则和一个验证入口，或者明确说明为什么没有验证命令。
- 工具入口文件会被对应 AI 工具实际读取；无法确认时必须标 `未验证`。
- 安全、测试、部署、用户验收和 Git 边界不能因为是模板适配而被删除。

## 遇到冲突时

以下情况必须停止并询问用户，不要自行决定：

- 目标项目已有规则与通用模板冲突。
- 源码事实与文档事实冲突。
- 目标项目技术栈或主线无法从仓库判断。
- 需要删除旧 API、字段、部署流程、权限模型、数据合同或迁移历史。
- 用户要求同时保留互斥路线，或要求无意义兼容。
- 需要创建多个互相竞争的 agent 指令真源。
- 当前 AI 工具入口无法确认，且猜错会导致用户以为宪法生效但实际没有被读取。

停止时给出：冲突证据、推荐方向、可选处理方式和需要用户确认的问题。

## 官方入口参考

这些入口用于确认“当前工具到底读取什么”。使用时仍要重新打开官方文档核对，因为 IDE/agent 规则会更新。

- OpenAI Codex：`https://learn.chatgpt.com/docs/agent-configuration/agents-md`
- GitHub Copilot：`https://docs.github.com/en/copilot/how-tos/configure-custom-instructions-in-your-ide/add-repository-instructions-in-your-ide`
- Claude Code：`https://code.claude.com/docs/en/memory`
- Gemini CLI：`https://google-gemini.github.io/gemini-cli/docs/cli/gemini-md.html`

## 可直接给 AI 的提示词

```text
请读取这个仓库的 AGENTS.md 和 AI_USAGE.md，把它们当作通用 Agent 宪法模板和适配流程。

然后只读审计当前目标项目仓库，先输出一份“宪法设计包”，不要直接写最终 AGENTS.md。设计包必须包括：项目证据包、真源清单、Owner map、Stack map、非目标和拒绝方向、验收命令 map、模板条款映射、缺失证据和用户问题。

再根据目标项目的真实语言、框架、目录、文档、构建命令、测试命令、部署方式、owner 边界、产品非目标，以及当前 AI 工具官方读取规则，生成一份适合当前项目的 agent 宪法。

要求：
- 不要复制模板原文后只做少量替换。
- 必须替换或删除所有 @@...@@ 适配标识。
- 只保留目标项目真实使用的 stack/adapter 规则。
- 如果当前项目已有 AGENTS.md、CLAUDE.md、GEMINI.md、.github/copilot-instructions.md、.github/instructions/*.instructions.md、Cursor rules 或其他 agent 规则，先审计并合并，不要盲目覆盖。
- 先确认用户实际使用的 AI 工具；Codex/OpenAI、GitHub Copilot、Claude Code、Gemini CLI、Cursor、Windsurf、Devin、Cline 等入口文件按官方规则适配。
- 保持一个项目宪法真源；其他工具入口优先导入、引用或摘要这个真源，避免重复规则漂移。
- 输出前列出审计证据、主宪法真源、工具入口、采用的适配、删除的模板残留、Owner map 缺口、未闭合问题和建议验收命令。
- 默认不运行 build/test/dev server/install/codegen/migration/deploy 等可能写入状态的命令；只列入验收命令 map 并标明未运行。
- 如果事实冲突、owner 不清晰、入口无法确认或会产生多个竞争真源，先停止并提问，不要猜。
```
