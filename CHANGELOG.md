# 更新日志

> 本文件由 `pwa/scripts/gen_changelog.py` 从 git 历史自动生成，请勿手改。
> 格式遵循 [Keep a Changelog](https://keepachangelog.com/zh-CN/1.1.0/)，版本号遵循 [语义化版本](https://semver.org/lang/zh-CN/)。

## [1.3.0] - 2026-10-18

提速与智能更新（增量 · 静默 · AI · 轻量预览）

### 新增
- 更新列表翻修——按时刻分版本、语义化版本号、构建自动生成、视觉升级 (3c7fc05)
- 更新面板改「发布小票」（版本/日期/三条亮点/查看全部） (77523ec)
- 增量更新 + 静默更新 + 同源运行时 + 纯前端 AI；fix(web): 审计 11 项 (f2d7ea5)

### 调整
- 重写交接文档为「已完成 / 未完成」完整移交版 + 部署铁律落地 (181552e)
- 45 套早期原创主题字号对齐业界标尺（决策 B，仅改字号） (6107844)
- 新增更新模块交接文档（docs/update-handoff.md）—— 文件清单/挂载/发版流程/验证/已知坑 (2a705d2)
- 更新模块独立成 src/update/（DOM 由模块自建，页面只留 #update-root） (26ba27a)
- xiaohu 方案否决归档；清理一次性调研脚本与产物 (dbfcdbe)
- 补 §11.8 抽样验证结果（10 套反推/气质 80%/发现深色对比度缺陷）；新增 scripts/probe_oss_themes.py (095042e)
- 补 §11 方案 B 落地细则（schema 同构/反推映射表/去重/验收） (b288f60)
- plan-oss-reference 补许可证核查（xiaohu-wechat-format）+ 判定矩阵 + notices 模板 + AGPL 待办 (e0fb496)
- 性能：首访 22.6s → 2.5s 可见排版（轻量即时预览 + 引擎空闲启动） (cb733cb)

### 修复
- 压力审计修复批——解析保真 / 安全清洗 / 业界字号 / 族折叠 (1d1330f)
- 模板库缩略图被占位层遮挡 + 抽屉遮挡预览 + 版本号写死 + 移除模拟底栏 (a0a8792)

## [1.2.0] - 2026-10-18

PWA 主链路落地 · 上线 supersu.ccwu.cc

### 新增
- PWA 排版主链路完成（23 项冒烟 + 本地回归全绿） (0332b7f)

### 其他
- gitignore 忽略 .wrangler/ 缓存目录 (d13af05)
- 部署上线 Cloudflare Pages + 域名 supersu.ccwu.cc (74f1fd7)

## [1.1.0] - 2026-10-18

阶段 0：引擎跑进浏览器（可行性验证）

### 新增
- 阶段 0 可行性验证通过，两项命门实测解决 (a046ec4)

### 调整
- 新增 PWA 施工进度表，前置可行性验证阶段 (613df47)

### 修复
- 修中文小标题识别不出来（9/20 -> 20/20） (c527004)

## [1.0.0] - 2026-10-18

公众号页重做 · PWA 立项与方案定稿

### 新增
- 模板库真实缩略图 + 收藏优先 + 预览微信外框 (b4e35e4)
- 多风格纯文本自动排版增强（对齐开源权威规则） (ea7026a)
- 公众号页 P0 界面落地（暖纸朱砂设计系统 + 三段式 + 解析条 + 模板库抽屉） (cdd2261)
- 公众号页重设计设计稿与原型 + 自动编辑三模式 (c2ef90f)

### 调整
- 新增 PWA 施工图，设计文档冻结为存档 (f8b25da)
- 补运行手册，README 与实测事实对齐 (543182c)
- 三份精简开发文档替代 SRS/架构重文档 (f77f7c5)
- 新增项目审计作业指导书 v1（36 项检查，可独立执行） (b568f6d)
- 新增项目产出物与文档规范 v1（解决文档/代码/产出物混乱） (78b1386)
- 按用户决定——45 套主题全保留（不担心商标）、public/images 10 张保留 (7dbed9a)
- PWA 方案 v4 锁定——开源 AGPL + 现成 19 种封面 + 三合一底图 + 三尺寸 + 预加载 (4f8f9e0)
- PWA 方案 v3——按苏哥拍板修正范围（封面/推送/AI 都保留，45 套改名保留）+ 复用 opendoor 的 Cloudflare 账号 (f1fadef)
- PWA 方案 v2——补 Cloudflare Python 双路线对比、域名国内可访问性研究、封面 clean-room 重写与命名 (e900780)
- PWA 实施方案 v1（评审稿，未开工） (1be61d8)
- 修复被 bash 反引号污染的段落，写入合规终审（45 套旧主题风险低-中，私有构建可用；公开包仅保留 4 套通用命名改名） (eab4036)
- 核实 bold-blue 引用面与 GROUPS 影响范围（gallery 页专用，不阻塞 PWA） (f8d1575)
- 锁定场景 D（闭源免费群内使用）—— PWA 只打包 119 套自研主题 (ec1804a)
- PWA 发布方案修订（路线 D：私有仓库 + 只分发自研资产）+ 合规红线证据 (6faeff1)

### 修复
- 浏览器统一 Chrome 优先，启动页不再弹星愿 (e7383f8)
- iframe 改用 doc.write 同步写入，修测试读取时序 + blob URL 内存泄漏 (173d4dd)

### 其他
- 首次审计执行并修复 5 个缺陷（P0 清零） (d51a905)
- 项目产出物规范第一批——归档 task_closure、删废弃入口、捞回审计脚本 (3b3a9f5)

## [0.8.0] - 2026-10-13

启动链路根治与 164 套原创主题

### 新增
- 新增六族·十二色 72 套原创主题（92→164）＋暗底表格斑马纹修复 (278391e)

### 调整
- 记录「点 start 用不了」根因链修复（AGENTS/README/HANDOFF/CLOSURE） (b1e342e)
- 补全 CLOSURE/HANDOFF/TODO 任务4 回滚点哈希（278391e） (61bc522)

### 修复
- 启动链路根治——bat 纯 ASCII + 封面浏览器零下载化 (2cff76e)

### 其他
- 有头三套件适配系统浏览器 + 树杀停服 + 教程弹窗遮挡 (f89a5fb)

## [0.7.0] - 2026-09-26

模板交互收口与渲染参数清理

### 调整
- 记录 doRender 死参数清理（CLOSURE/HANDOFF） (1e54e37)
- 补全 CLOSURE 任务2 回滚点哈希（c88c4c2） (6fac000)

### 修复
- 清理 doRender 死参数（themeId/previewOnly） (9dbc6f7)
- 移除模板悬停自动切换，改为仅点击切换 (c88c4c2)

## [0.6.0] - 2026-09-25

主题体系重写、Pexels 配图与 UX 第一批

### 新增
- 高级排版落地 + 主题体系重写为纯原创 (026e683)
- Pexels 配图接入 + 按页教程 + 设置里填 token（开源导向） (5523926)
- U-2 真自适应收口（BLCaptain 渲染阶段注入 fitty） (48eacf1)
- 第二批 U-7..U-11 (ef5b241)
- P0 第一批止血 U-1..U-6 (a4c869e)

### 调整
- README 新增「真实产出」封面画廊 (70f888e)
- README 商业化重写 (b92b838)
- 封面「图文对不上」根因与升级方案调研 (409a44b)
- P0 第一批收尾（TODO打勾、AGENTS§12实施状态、HANDOFF变更12、task_closure） (e88e8b1)

### 修复
- 修 start-app.bat 双击没反应（bat 换行 + venv 激活路径双重失效） (271d951)

### 其他
- Pexels 批次收尾（补齐漏提交的功能本体 + README 同步） (32deb64)

## [0.5.0] - 2026-09-24

前端 UX 走查诊断与改造方案定稿

### 新增
- AI排版改结构决策JSON+正文原样套用，未配置/失败一律本地规则兜底 (2e17b60)

### 调整
- UX 方案阶段收尾（TODO立项U-1..U-15、AGENTS§12定稿指针、HANDOFF变更11、task_closure） (a389d60)
- 前端改造最终方案 v3（融合审计+开源选型，含改前/改后线框原型，未动代码） (67411d0)
- 开源方案选型（fitty治溢出/悬停试看抄md-wechat/satori中期去浏览器，附落地顺序） (1c4688b)
- UX 方案对抗性审计（推翻3处/修正4处+红队补充清单+修正版优先级表） (d08d169)
- 新增前端 UX 走查诊断与优化方案（有头浏览器15步截图+单文件报告） (30dcfc9)
- HANDOFF 记录本仓库 SSH 推送配置（core.sshCommand 指向 wechatca2 专用密钥） (b74adfc)

## [0.4.0] - 2026-07-26

一键启动器、自动搜图与全系统 E2E

### 新增
- 一键启动器 start-app.bat + app.py 浏览器打开守卫 (87949b7)
- 自动联网搜图作底图 + 主题去重至92套 + README图文并茂重写 (31ab4ce)

### 调整
- 新增 exe 封装调研报告（PyInstaller+Inno Setup 为最佳路线） (7ebaade)
- 收尾文档补填已推送 commit hash (31ab4ce) (5f95238)
- 合并通用 Agent 宪法工程纪律到 SuperSu 项目 (2d5f997)

### 修复
- 启动器用start命令等端口就绪后自动弹浏览器+手动app.py仍自动开 (ad80b7e)
- 启动器改由app.py自带浏览器打开+README写明从文件资源管理器双击 (66e8bc3)
- E2E 诊断闭环 P0/P1/P2 功能性断裂（A1-A4/Flag5/6/4/1/3） (98fd653)
- 闭环设计偏差 D-1/D-4/D-2/D-3/W-1（结果卡真实图/风格id/移动端可见） (4202256)

### 其他
- 清空三项残留（E2E断言/风格分组对齐/死代码） (19eda85)
- 公众号复制富文本/首主题自动选中 + 全系统前后端 E2E (bd2b323)
- gitignore 本地服务日志与 prototypes 运行时副本 (6d0cbe7)
- 根目录文件整理与分类（按模块/脚本/文档归位） (8e97252)

## [0.3.0] - 2026-07-11

小红书封面修复与集成测试重写

### 调整
- 补全 CLOSURE 回滚点提交哈希（978005f） (a004802)

### 修复
- 修复小红书封面缺失 + 关闭孤儿LLM调用 + 重写集成测试 (978005f)

## [0.2.0] - 2026-05-27

AI 智能排版、配置统一与 Nuitka 打包

### 新增
- add Nuitka build workflow (fb41aa6)

### 调整
- 统一AI配置、修复推送流程、优化手机预览 (b06c08d)

### 修复
- 删除多余label, 全名Logo, 添加favicon, 数据持久化 (435dbab)
- 默认主题改为 monocle (93eb487)

### 其他
- 更新：1. 修复模板渲染路径问题 2. 添加AI智能排版功能 3. 优化预处理逻辑 4. 修复AI配置测试API (99581f2)
- 清理项目 + 功能改进 (8f78558)

## [0.1.0] - 2026-05-25

MVP 首发：本地预处理、SSE 排版与一键推送

### 新增
- UI redesign v3 - Sage & Ivory theme (f03f21f)
- UI redesign - warm editorial design system (f765671)
- 新手引导 + AI 功能提示标记 (e0c3c4e)
- AI操作统一反馈 UI(按钮禁用+动态省略号+超时+慢网提示) (9f0218e)
- temp_covers 清理+访问控制 (ac43653)
- 推送图片警告+前端warning toast (694d203)
- restore themes from xiaohu-wechat-format, add fonts, clean up (9d1dffc)
- Step 3 完成 — SSE优化 + iPhone 17手机预览 + 项目文档更新 (5295014)
- WechatAI Formatter initial commit — local preprocessing + SSE LLM optimization + 53 themes + one-click push (f2bbb16)

### 调整
- 重写 README  场景化痛点切入+能力矩阵定位 (86266d4)
- 性能：封面图未配置API时跳过LLM调用+截断500 (756b760)
- 性能：SSE _opt_store 清理移到独立后台线程 (9041078)

### 修复
- 推送白名单错误在弹窗内显示(含IP+教程链接) (5411ab8)
- token_manager 重试+线程安全 (8e323a5)
- preprocessor 短行标题逻辑 - 孤立行判定+阈值12+逗号保护 (0464db3)
- ai_client.py api_key 加密存储(复用 crypto_utils) (a556d42)
- 密钥文件迁移到用户配置目录(platformdirs) (208be86)
- 全面评估修复 P0安全稳定5项+P1体验4项+P2质量3项 (19733e1)
- 全盘诊断修复 + Playwright e2e 测试 + README (368c84b)

### 其他
- 移除新手引导弹窗，未配置AI时直接打开设置 (b2d5e8d)
- 移除 format_engine.py 顶层未使用的 CLI import (7cc1899)
- remove test files and snapshots (52fd342)
- 清理无用代码和缓存文件 (c67ab56)
