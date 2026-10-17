# SuperSu 审计报告 2026-10-18 —— 审计对象：docs/audit-playbook.md v1

> **审计性质**：对抗性审计（adversarial review）——假定一个"零上下文执行者"按指导书逐条执行，找出会导致假 FAIL / 假 PASS / 流程卡死 / 误判发布的缺陷。
> **验证方式**：不只用读的——所有可疑命令均在本仓库实跑，基线数字均与仓库实况核对。
> **上位规范**：本报告按 `docs/audit-playbook.md` §5.1 模板与 §4 分级框架出具。
> ⚠️ 自指警示：本报告落在 `docs/audit/`，即触发 PB-05 所述的 D5 冲突——D5 白名单需同步修订。

## 一、结论

- **总体：PASS-with-issues**（指导书骨架扎实、大部分基线数字实测准确；但存在 6 处 P1，首轮执行即会暴露）
- P0：0 项 / P1：6 项 / P2：9 项 / INFO：3 项
- 是否可发布（指导书作为可执行 SOP 交付）：**修订 P1 后可用**。不修也能跑，但执行者会撞上"假 FAIL × 2、假 PASS × 1、流程矛盾 × 1、文档打架 × 2"，与"无需额外沟通"的承诺不符。

## 二、实测核对结果（先说扎实的部分）

以下基线经实测**确认准确**（✅ 已验证）：

| 项 | 指导书声称 | 实测 | 结果 |
|---|---|---|---|
| B1 | 62/62 | `tests/test_e2e.py` 62 个 `def test_`；HANDOFF/CLOSURE 最新记录 62/62 | ✅ |
| C4 | 164 套主题 | `Get-ChildItem public\themes -Filter *.json` = 164 | ✅ |
| §2 缩略图 | 164 张 | `public\theme-thumbs\*.jpg` = 164 | ✅ |
| §2 行数 | format_engine 2349 / preprocessor 514 / app.py 909 | 实测 2349 / 514 / 909 | ✅ |
| A2 | Playwright ≥1.61 | `pip show playwright` = 1.61.0 | ✅ |
| E2 | output < 500MB（基线 45MB） | 44MB | ✅ |
| E1 | 工作区干净 | `git status --short` 无输出 | ✅ |
| C5 | 6 个关键 id 存在 | 6 行 6 次匹配，各出现一次 | ✅（今日可用） |
| D5 | docs 四个子目录 | archive / prototypes / screenshots / ux-audit 均在 | ✅ |
| C6 阈值 | 单次 < 200ms | 修正版请求实测 200（正常返回） | ✅ |

**评价**：基线数字大多真实测过，这在同类 SOP 里少见，值得肯定。问题集中在**命令正确性**与**内部自洽性**。

## 三、缺陷清单

| # | 等级 | 位置 | 现象 | 证据 | 建议修复 |
|---|---|---|---|---|---|
| PB-01 | **P1** | §3.C6 | 渲染性能检查命令原文实测返回 **400**（假 FAIL 必现） | 按原文实跑 = 400；修正 payload = 200 | 见 §四.1 |
| PB-02 | **P1** | §6.1 ↔ §3.B | 时间盒"起服务不关"与 B 段执行顺序矛盾，照做则 B3/B5/B6 全部 ABORT | 自起套件预检 5000 端口（§3.B 原文自述） | 见 §四.2 |
| PB-03 | **P1** | §3.E4 | `git check-ignore` 实测只报 4/5，`data/` 不出现 → 按"全部被忽略"判据误判 FAIL | 实测输出缺 data/（`!data/.gitkeep` 反选所致） | 见 §四.3 |
| PB-04 | **P1** | §3.F4 | 正则在 `grep -E` 下**永不命中** → 敏感文件即使入库也永远"无输出"，安全项假 PASS | WSL GNU grep 实测：原文 exit=1（0 命中），修正版命中 3 行 | 见 §四.4 |
| PB-05 | **P1** | §5.1/§9 ↔ §3.D5 | 报告目录 `docs/audit/` 不在 D5 白名单内；按 §5.1 存报告后再跑 D5 必 FAIL；且该目录当前不存在 | `Test-Path docs\audit` = False | D5 白名单加 `audit/` |
| PB-06 | **P1** | §0 承诺 ↔ 仓库现状 | "无需额外沟通即可执行"被三处现状打破：① AGENTS.md 计数 56/56（§10 还有 52/52）vs 指导书 62/62 → 首轮 D2 必 FAIL；② LICENSE / THIRD_PARTY_NOTICES.md 实测不存在，F1 当天即 P0，但指导书未声明；③ `pwa/` 已存在（含 scripts/fetch_fonts.py）→ G 段生效，但 G1 引用的 `pwa/scripts/build.mjs` 不存在，命令必报 file not found | 见 §二 与下文 | 见 §四.6 |
| PB-07 | P2 | §3.B | 通过率百分比判据在小套件失真：7 项套件挂 1 项 = 85.7% → 直接 P0 阻断；62 项套件挂 1 项 = 98.4% → 仅 P1。同为"挂 1 项"却差两级 | 算术 | 任何套件失败一律 P1 限期修；P0 只留给核心链路全挂（B1/B3 整体失败、服务起不来） |
| PB-08 | P2 | §4/§5.1 | 报告结论三选一（PASS / PASS-with-issues / FAIL），但全文无判定定义 | 全文检索无定义 | 补一行：有 P0 = FAIL；无 P0 有 P1 = PASS-with-issues；否则 PASS |
| PB-09 | P2 | §3.C1 | `py_compile app.py core/*.py scripts/*.py` 依赖 shell 展开 glob，PowerShell 不展开原生命令参数 → 报"找不到文件"；指导书明确面向 Windows | PowerShell 通配符语义 | 改 `python -m compileall -q app.py core scripts`（跨 shell 稳定） |
| PB-10 | P2 | §3.B7 | "data/*.json 与原值一致"无从比对——data/ 不入库，git status 看不到变化，指导书只在 §8.3"建议"备份，未把快照定为 B7 前置步骤 | §3.B7 原文 | B7 增加第 0 步：跑测前复制 `data/` 或记录哈希，跑后比对 |
| PB-11 | P2 | §4 原则 3 | "拿不准的一律降级 P2"对合规项不安全：F 段（密钥/许可）拿不准的降 P2 可能溜过发布门 | 与 §4 F1/F4=P0 的分级逻辑冲突 | 合规/密钥类拿不准维持 P1，其余可降 P2 |
| PB-12 | P2 | §3.E1 | 工作区干净检查排在第 3 小时（E 段），但脏工作树会让 B 段测试结果无法归因于仓库状态 | 流程顺序 | "git status 干净"前移到 §0 快速开始第 1 步 |
| PB-13 | P2 | §3.F | 开源发布两个盲区：① 不扫 **git 历史**（F4 只查当前跟踪文件；data/.secret_key 注明"旧位置"，若曾入库则历史泄露）；② 不扫**依赖 CVE** | F 段清单 | 增 F6：发布前 gitleaks/trufflehog 扫全历史 + `pip-audit`；最低限度 `git log -p -- data/ .env` 人工抽查 |
| PB-14 | P2 | 多处 | 小缺陷打包：① C4 未落实 §2 自述的"主题↔缩略图一一对应"（应加两组文件名 diff）；② C5 用 `grep -c` 计行数，多 id 同行会少计、单 id 重复会多计（今日 6/6 通过，逻辑脆弱）；③ A4 `findstr :5000` 会误匹配 :50001 等（无词边界）；④ §8.2 提取脚本对 `<script >` 带属性或无匹配会 AttributeError（实测 index.html 仅 1 个 script 块，今日可用）；⑤ §7.3"同模块 3 个 P1 → 不建议使用"无操作语义，建议并入 P0 或删除 | 代码/命令审读 | 逐条小修 |
| PB-15 | INFO | §2 | `templates/index.html` 行数 2100 vs 实测 2403（约 14% 漂移）；requirements 描述漏 python-dotenv / platformdirs；A1 导入清单同样缺这两项（若 dotenv 缺失，A1 过但 A3 起不来，多绕一步）；`tests/` 实为 6 套件 + `headed_monitor.py` 辅助脚本，执行者 ls 会数出 7 个 | 实测 | 行数类"约数"要么删掉要么注明"以实际为准"；A1 补 `import dotenv, platformdirs` |
| PB-16 | INFO | 全文 | 基线数字（62/62、164、行数…）以硬编码散落全文，主题再增即腐烂 | 结构性 | 收敛到 §开头的"基线速查表"一处，或改为互检断言（如 C4 改为"主题数 == 缩略图数"而非硬编码 164） |
| PB-17 | INFO | §3 各表 | A/B 表有"不通过处置"列，C–G 表没有，FAIL 后处置路径不一致 | 表结构 | C–G 表补处置列，或在表头统一声明"FAIL 一律登记缺陷清单" |

## 四、关键修复建议（P1 逐条）

### 1. C6 命令（PB-01）—— 已实测复现

原文（单引号内带 `\"`，bash/PowerShell 均按字面发送）：

```
curl ... -d '{\"raw_text\":\"# 标题\\n\\n正文\",\"theme_id\":\"su-biz-azure\"}'   → 400
```

实测：原文 **400**，修正版 **200**。建议改为 payload 文件或 Python 单行（跨 shell 稳定）：

```bash
# 方案 A：payload 落文件（推荐，Git Bash / PowerShell / cmd 通用）
printf '{"raw_text":"# 标题\\n\\n正文","theme_id":"su-biz-azure"}' > test_output/_c6.json
curl --noproxy '*' -s -X POST http://127.0.0.1:5000/api/render \
  -H "Content-Type: application/json" -d @test_output/_c6.json -w "\n%{time_total}s"

# 方案 B：PowerShell 原生
Invoke-RestMethod -Uri http://127.0.0.1:5000/api/render -Method Post `
  -ContentType "application/json" -Body '{"raw_text":"# 标题\n\n正文","theme_id":"su-biz-azure"}'
```

### 2. 执行顺序矛盾（PB-02）

§6.1 的 A 段注明改为：

> 起服务验证 A3 后**立即停掉**（自起套件 B3/B5/B6 需 5000 空闲）；跑完 B3/B5/B6 再重启服务供 B2/B4/C6 使用。

### 3. E4 命令（PB-03）—— 已实测复现

`git check-ignore -v data/ ...` 因 `!data/.gitkeep` 反选，`data/` 不出现在结果（实测 4/5）。改为：

```bash
git ls-files data/ output/ test_output/ pwa/dist/   # 期望：空（data/ 至多 .gitkeep）
git check-ignore -v .env                            # 期望：命中 .gitignore:2
```

### 4. F4 正则（PB-04）—— 已实测复现

`-E` 模式下 `\|` 是**字面管道符**，整个模式永不命中 → 敏感文件即使入库也判 PASS。实测：原文 0 命中，修正版命中全部 3 行。改为：

```bash
git ls-files | grep -E "^\.env$|^data/|^output/"    # 期望：无输出
```

（C3/F5 用的是 BRE 的 `\|`，GNU grep 下有效，可保留；但建议全文统一为 `-E` + 裸 `|`，减少一种心智负担。）

### 5. D5 白名单（PB-05）

D5 判定改为：`根下只有 .md + archive/ prototypes/ screenshots/ ux-audit/ audit/`。

### 6. 现状对齐（PB-06）

三选一或组合：

1. **改文档**：AGENTS.md 计数统一到 62/62（52/56/62 三代数字并存是文档债）；
2. **改现实**：补建 LICENSE / THIRD_PARTY_NOTICES.md（开源路线反正必须）；
3. **改指导书**：F1/G1 加"当前状态"列，注明"已知未建 / 已知缺 build.mjs，执行时记 SKIP 并入缺陷清单"，把"预期结果"与"当前现状"分开列。

第 3 条成本最低，且能让指导书在"发布前整改"阶段也保持可执行。

## 五、结构性优化建议（不阻塞，供拍板）

1. **基线表单点化**（PB-16）：所有会腐烂的数字收敛到一节"基线速查表"，正文只引用编号（如"B1 基线见 §0.1-T1"）。加一行维护规则：任何改动测试/主题后必须同步该表并更新基线日期。
2. **命令标注适用 shell**：全文明确每条命令跑在 PowerShell 还是 Git Bash（A4 的 netstat/findstr 是 cmd 风格、§8.1 标题写"Windows / Git Bash"、C1 在 PowerShell 不可用）——三种 shell 混用是本指导书最大的隐性成本。
3. **安全扫描升级**（PB-13）：开源发布前 `gitleaks`（全历史）+ `pip-audit` 各跑一次，产物贴报告。这两个工具都是单命令、免配置，值得进 F 段。
4. **SKIP 语义显式化**：G 段"如已开工"补一句判据——`pwa/` 下无 `build.mjs` 或 `dist/` 时 G1–G4 记 SKIP（附原因），不算 FAIL。
5. **C4 补互检**（PB-14①）：`diff <(ls public/themes | sed 's/.json//') <(ls public/theme-thumbs | sed 's/.jpg//')` 期望为空——把 §2 自己声明的审计重点真正落成检查项。

## 六、证据目录

- C6 实测：起服务后按原文与修正版各跑一次 `/api/render`（400 vs 200），服务已停、端口 5000 已确认释放（监听数 0）
- F4 实测：WSL GNU grep，`/tmp/f4test.txt` 三行样例，原文 exit=1 / 修正版 exit=0+3 行
- E4/C5/A2/E1/E2 实测：见 §二 表格（PowerShell + git 原生命令）
- 计数核对：`Grep "def test_"` = 62；`Get-ChildItem public\themes` = 164；`public\theme-thumbs\*.jpg` = 164
- 缺失文件核对：LICENSE / THIRD_PARTY_NOTICES.md / docs\audit / pwa\scripts\build.mjs（Test-Path 均 False）

## 七、复测记录

（待 PB-01~06 修订后，由复核人按 §四 各命令重跑；预期全部 PASS。）
