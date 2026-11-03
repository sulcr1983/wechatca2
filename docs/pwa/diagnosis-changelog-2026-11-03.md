# 更新记录诊断报告（2026-11-03）

> 诊断对象：PWA「更新记录」全链路 —— 线上 `changelog.json` / `pwa/public/changelog.json` /
> `pwa/scripts/gen_changelog.py` / `pwa/scripts/changelog_milestones.json` / `pwa/src/update/changelog.js`。
> 诊断方法：**线上实测（curl 两域名）+ 本地 git 历史取证 + 生成器源码走查 + 门禁实跑**。
> 本文每条结论都带可复现的取证命令或具体数字，不凭推断。
>
> ⚠️ 本文是**诊断快照**（2026-11-03 21:30 时点），版本号/条数会变；长期口径以 `STATE.md` 为准。

---

## 0. 一句话结论

更新记录本身**不是乱的源头**，它忠实反映了 git 历史；乱的是三层：
**① 版本切点靠人手 → 三天没发版的 62 个提交全被塞进 1.17.0 卡片（卡片 77 条、跨 4 天、自相矛盾）；
② 「内部改动」判定只认 commit type 不认 scope → 26% 的用户可见条目是 E2E/夹具/.env 这类开发黑话；
③ 面板把全部条目平铺出来（一个版本能刷 23 条），而文档承诺的「每版 3 条亮点 + 全部 N 条展开」从未实现。**

线上额外落后本地 9 个提交（b414 vs b423），其中含一个真实线上 bug 修复（19 套版式在浏览器从未执行）。

---

## 1. 线上实测（服务器侧）

| 项 | 线上 | 本地 | 差异 |
|---|---|---|---|
| 版本号 | v1.17.0 | v1.17.0 | 一致 |
| 构建号 | **b414** | **b423** | 落后 9 个提交 |
| changelog `generatedAt` | 2026-11-03 **12:43** | 2026-11-03 **21:21** | 落后约 8.5 小时 |
| changelog `totalCommits` | **361** | **370** | 少 9 条 |
| 1.17.0 卡片条数 | 68 | 77 | 少 9 条 |

- 主域名 `supersu.ccwu.cc` 与备用 `supersu-pwa.pages.dev` 的 `changelog.json` **逐字节一致**（无分叉，这点是健康的）。
- 缓存头正确：`/changelog.json` → `Cache-Control: public, max-age=0, must-revalidate` + ETag，且 SW 走
  network-first。**不存在「用户拿到旧更新记录」的缓存问题**。

### 1.1 线上缺失的 9 个提交

```
3f3f417  散落的调研 HTML 归入 research/ 并同步引用
621b8d6  CLOSURE 补本轮台账 + doc_sync 新增相对链接机检（[H] 段）
532f384  文档与原型按模块归组（65 份顶层 → 3 份；36 个原型 → 6 个模块目录）
abfe0f3  sync generated outputs（文档整理后的构建与状态源）
64114e2  清理 kit-previews 的死忽略规则
9cd8582  sync generated outputs (worker py list fix)
153c8cc  新增断言 worker 必须加载 dist/py 下全部 .py（含反向验证）
a2cafc0  sync generated outputs for build 414
ffd94df  ★ PWA 漏加载 magazine_layouts.py，19 套 layout 在浏览器从未执行
```

**其中 `ffd94df` 是唯一影响用户的**：线上 `engine.worker.js` 里 `magazine_layouts` 命中 **0** 次 ——
19 套「整篇设计」在线上只换配色不换版式（与 `docs/INDEX.md` §5 的 W-2 完全吻合，本次实测二次确认）。
其余 8 条是文档/构建产物，属于开发者细节，不影响用户。

> 取证：`curl --noproxy '*' -s https://supersu.ccwu.cc/src/engine.worker.js | grep -c magazine_layouts` → `0`

---

## 2. 核心问题：1.17.0 卡片装了三天的工作

这是「乱」的最大来源，也是最该先修的一条。

| 项 | 数字 |
|---|---|
| 1.17.0 卡片头部显示 | **77 条** |
| 真正属于 1.17.0 的（≤ 2026-11-01 12:20 切点） | **15 条** |
| 属于「1.17 之后未发版」被误并进来的 | **62 条（80%）** |
| 卡片 `date` 字段 | 2026-11-**01** |
| 卡片实际内容时间跨度 | 2026-10-31 22:26 → 2026-11-**03 20:02** |

按天分布：`10-31: 2 条 / 11-01: 25 条 / 11-02: 6 条 / 11-03: 44 条`。

**后果（用户视角）**：线上跑的是 1.17.0（b414，11-03 12:43 的构建），用户打开更新记录，
看到「v1.17.0 · 2026-11-01」这张卡里写着 19 套整篇设计、字号调节、抽屉两 tab 等 11-02/11-03 的改动 ——
**这些要么还没上线（ffd94df 未部署），要么上线了但归在错误的版本名下**。而真正的「下一次发版」
在更新记录里**没有位置**：一旦你 bump 到 1.18.0，切点只能接在 11-03 之后，那 62 条已经被 1.17.0
「吃掉」的提交不会迁移过去 —— 1.18.0 会是一张近乎空白的卡。

### 2.1 同一张卡片内自相矛盾

1.17.0 卡里同时躺着：

| 组 | 提交 | 文案 | 日期 |
|---|---|---|---|
| 新增 | `ffee888` | 恢复编辑器贴图与搜图，复制到公众号自动内嵌图片 | 11-02 |
| 其他 | `cd0668d` | 彻底移除公众号推送与编辑器贴图功能 | 11-01 |

而 `highlights` 第 4 条正是「**按用户要求移除公众号推送与编辑器贴图**」。
用户在同一个屏幕里看到「恢复贴图」+「移除贴图」+「按用户要求移除贴图」三句话。

### 2.2 根因链（为什么这次没被门禁拦住）

```
release.py 只 bump version.json，切点靠人手加
   → 11-01 之后三天没发版（无「未发版堆积」检查）
   → gen_changelog 把 until 覆盖不到的提交全兜到最新切点（assign_release 末尾 return milestones[-1]）
   → 1.17.0 卡片持续膨胀
   → 所有门禁都只查「最新版本 == version.json」，不查「卡片内容是否越界」
   → 全绿
```

`gen_changelog.py` 的 `assign_release()` 兜底逻辑是**设计如此**（宁可塞进旧卡也不丢条目），
它本身没错；缺的是**上游**（切点及时加）和**下游**（越界检测）。

> 取证：`python -c "..."` 比对卡片 `date` 与条目 `date` 最大值 → 只有 v1.17.0 一条命中
> （`date=2026-11-01`，内容到 `2026-11-03`）。这说明**历史版本没有这个病，是 11-01 之后新得的**。

---

## 3. 数据质量：五类具体脏点

### 3.1 版本序列断裂（1.15.0 从未存在）

更新记录里的序列：

```
… 1.12.0 → 1.13.0 → 1.14.0 → 1.17.0
```

`version.json` 的真实经历：

```
1.13.0 → 1.16.0 → 1.16.1 → 1.17.0
```

**1.14.0 / 1.15.0 从未作为 `version.json` 出现过**：
- `1.14.0` 是事后**手工回填**的切点（提交 `82375f7`「1.13.0 until 收口至 21:10 + 1.14.0 切点」），
  内容是「推送高级功能」—— 那次实际发的版本号是 **1.16.0**。
- `1.15.0` 全仓库**零命中**（`grep -rn "1\.15\.0"` 无结果），是纯粹的空号。

所以现在用户看到的版本线是 `1.13 → 1.14 → 1.17`，跳了三个号；
而 CLOSURE.md 里记的「1.14.0 之后连续三次发版漏加切点（1.16.0/1.16.1/1.17.0）」，
在更新记录里表现为**两张卡（1.14.0、1.17.0）承载四次发版的内容**。

### 3.2 条数口径不一致（虚高 3.3 倍）

| 位置 | 用的口径 | 1.17.0 显示 |
|---|---|---|
| 版本卡头部「N 条」(`countEntries`) | **全量**（含折叠的 dev 条目） | **77 条** |
| 顶部提示条「这次更新了 N 条」(`updateBanner`) | **全量** | **77 条** |
| 用户实际能看到的（主视图） | 排除 `dev` | **23 条** |
| 折叠进「开发者细节」 | `dev=true` | **54 条** |

用户看到「77 条」，展开主视图数一遍只有 23 条 —— 剩下 54 条藏在「开发者细节 54 条」里。
**这是「乱」最直观的来源：数字和眼睛对不上。**

### 3.3 `dev` 判定只认 type 不认 scope → 开发黑话进主视图

`DEV_TYPES = {test, chore, docs, style, build, ci}`。
问题：`fix(test)` / `feat(gate)` / `fix(release)` / `fix(deploy)` 的 **type 是 fix/feat**，
一律判为「用户可见」。实测 1.17.0「修复」组 7 条里有 4 条是这种：

```
977b905  E2E 补齐两处 10-31 拆分后的过时断言（51/51）        fix(test)
dde292b  E2E「切回排版页」用 #btn-editor，修正过时断言        fix(test)
6a3ee5d  凭证默认路径从其他项目改为仓库根 .env                fix(deploy)
6123617  更新记录闸 + 发版/门禁提速 + 去掉全量 E2E 默认        fix(release)
```

量化：**用户可见 172 条里 44 条（26%）含开发术语**
（正则 `E2E|断言|夹具|门禁|dist|构建|凭证|\.env|契约|白名单|worker|pyodide|台账|切点`）。
「新增」组里还有 `8231add 对齐契约白名单归一化 + 禁写属性常量`、`160cc88 19 套整篇设计对齐夹具 + 反向验证`。

### 3.4 分组能力浪费：`移除 / 弃用 / 安全` 三组永远是空的

`TYPE_TO_GROUP` 只映射了 `feat→added`、`fix→fixed`、`perf/docs/refactor/style→changed`、
`test/chore/other→other`。`removed` / `deprecated` / `security` **没有任何 type 能映射进去**，
所以这三组在 33 个版本里出现 0 次。

后果：`cd0668d 彻底移除公众号推送与编辑器贴图功能` 落在「**其他**」组 ——
一次明确的**功能移除**，用户看不到「移除」这个分类，只看到一个叫「其他」的筐。
`b878d7b 审计 P0 安全响应头 + P1 本机数据备份/恢复` 同理，落在「新增」。

### 3.5 噪音过滤漏网 + 重复条目

`NOISE_RE = ^(chore\(release\)|Merge |Revert )` 只抓三种。实测漏了：

- `7ce5cc3  release: v1.8.1 —— 只改数据也要能感知到更新`
  → 前缀是 `release:`（无 scope、非 `chore(release)`），**没被过滤，进了 1.8.1 卡片主视图**
- `cd0668d  revert(push): …` → 小写 `revert` + 带 scope，`^Revert ` 不匹配（虽然这条内容本身该保留）

重复：1.12.0 有两条**完全相同文案**的修复条目（`eb0549c` / `055535f`，间隔 6 秒的两次提交），
面板会连着显示两遍。

---

## 4. 亮点（highlights）机制失效

| 项 | 文档要求 | 实际 |
|---|---|---|
| 条数 | 3 条人话 | **11 个版本超过 3 条**（1.13.0 / 1.9.0 各 6 条，4/5/6 条都有） |
| 覆盖率 | 每版都有 | **15/33 个版本无亮点**（1.6.0 及更早全空） |
| 与卡片内容一致性 | 应概括本版改动 | 1.17.0 的 4 条亮点里，**没有一条提到 19 套整篇设计 / 字号调节 / 抽屉两 tab** |

1.17.0 的亮点是「备份恢复 / CSP / 标题左对齐 / 移除推送」—— 全是 11-01 当天的内容；
而卡片里 62 条（80%）是 11-02~11-03 的改动，**一个都没进亮点**。亮点与卡片讲的不是同一件事。

另：发布小票（`highlightsSince`）只取**前 3 条**，面板 `cl-highlights` 却**全量渲染** ——
同一版本在小票里 3 条、在面板里 6 条，两个入口对不上。

---

## 5. 文档 vs 实现：三处明确不符

| # | 文档说什么 | 实际是什么 |
|---|---|---|
| D-1 | `plan-update-2026-10-29.md` §E：「面板：每版默认显示 3 条亮点 +『全部 N 条』展开」 | **从未实现**。`changelog.js` 全量渲染（`buildRelease` 无 slice、无展开控件），只把 `dev` 折叠进 `<details>`。1.17.0 直接铺 23 条 |
| D-2 | `update-handoff.md:38`：「`pwa/version.json` 当前版本（现为 **1.8.0**）」 | 实际 **1.17.0**。过期 9 个版本 |
| D-3 | `sw.js:25` + `plan-update` §:150：「changelog.json 约 **73KB**」 | 实测 **137KB raw / 27KB gzip**（线上 134KB）。体积口径过期近 2 倍 |

> D-1 是**最值得注意的一条**：文档描述的节制机制（每版 3 条 + 展开）根本没写进代码，
> 所以「一个版本刷 23 条」不是设计选择，是**需求漏做**。
> 而 `doc_sync_check.py` 全部通过 —— 它只查数字漂移，不查「文档承诺的功能是否存在」。

---

## 6. 为什么现有门禁全绿却仍然乱

现有 5 道闸（全部实跑通过，`python scripts/doc_sync_check.py` ✅ / `gen_changelog.py --check` ✅）：

| 闸 | 查什么 | 为什么拦不住本次问题 |
|---|---|---|
| `gen_changelog.py` 自检 | 最新版本 == `version.json`、无空版本 | 只查「最新版号对齐」，**不查卡片内容是否越界到未来日期** |
| `build.mjs` 断言 | 同上 | 同上 |
| `preflight.py check_changelog()` | `dist/changelog.json` 最新版 == `dist/version.json` | 同上 |
| `doc_sync_check.py` | 数字漂移 / 链接可达 / 族名套数 | 不碰 changelog 语义 |
| `release.py` | 自动补切点（缺就补） | 自动补切点**只保证「不漏」，不保证「不膨胀」**；且补完 `title` 为空 |

**缺口清单（4 条，都是「无人检查」而非「检查失败」）**：

1. **无「未发版堆积」检测** —— 没有任何脚本发现「卡片里有晚于卡片 `date` 的条目」。
   这正是 1.17.0 装 62 条的直接原因，也是最容易补的一条（十几行代码）。
2. **无「版本号连续性」校验** —— `release.py --version` 允许任意跳号，1.13.0→1.16.0 就是这么跳的。
3. **无「亮点质量」校验** —— 不查条数是否 ==3、不查是否覆盖本版主要改动。
   `AGENTS.md` 明确写了「正式发版前仍应补上手写 title + 3 条人话亮点」，但**没有任何机制检查补没补**。
4. **`dev` 判定未纳入 scope** —— 判定规则只看 commit type 的前缀。

---

## 7. 修复建议（按优先级，含改动面）

### P0 — 不改会继续乱

| # | 事项 | 改动面 | 说明 |
|---|---|---|---|
| **C-1** | 给 `gen_changelog.py` 加**越界检测**：条目 `date` > 所属卡片 `date` 当天 23:59 时告警（超过 N 条则失败） | `pwa/scripts/gen_changelog.py` 约 15 行 + `preflight.py` 一处调用 | 立刻能拦住「1.17.0 装 62 条」复发。**这是投入产出比最高的一条** |
| **C-2** | **补 1.18.0 切点并把 62 条迁过去**（11-03 20:02 收口），1.17.0 卡收口到 11-01 12:20 | `changelog_milestones.json` 加 1 条 + 改 1.17.0 的 `until` | 需**发版**配合。不迁的话下次发版会出现空白卡。⚠️ 涉及版本号，**需苏哥拍板** |
| **C-3** | 线上部署 b423（含 `ffd94df` 真实 bug 修复） | `bash pwa/scripts/deploy.sh` | 与更新记录无关，但这是**线上真实坏掉的功能**，优先级高于文案整理 |

### P1 — 直接影响「乱」的观感

| # | 事项 | 改动面 | 说明 |
|---|---|---|---|
| **C-4** | **条数口径统一**：卡头与 banner 都改报「用户可见条数」，另标「+N 条开发者细节」 | `pwa/src/update/changelog.js` `countEntries` 调用点 | 解决「77 vs 23」对不上 |
| **C-5** | **实现文档承诺的节制**：每版默认 3 条 + 「全部 N 条」展开 | `changelog.js` `buildRelease` | D-1 漏做的需求，落地后 23 条不再一屏铺开 |
| **C-6** | `dev` 判定加入 scope 白名单（`test/gate/release/deploy/build/state/plan/review/proto/handoff/tasks/tools` → 折叠） | `gen_changelog.py` `DEV_TYPES` 旁加 `DEV_SCOPES` | 26% 开发黑话直接降到个位数 |
| **C-7** | `TYPE_TO_GROUP` 补 `removed / security` 映射（`revert`→removed、`security`→security） | `gen_changelog.py` 一处 | 「彻底移除推送」终于进「移除」组 |
| **C-8** | 噪音正则补 `release:` / `revert` 小写 / `chore(release` 无右括号 三种写法 | `gen_changelog.py` `NOISE_RE` | 修 7ce5cc3 漏网 |

### P2 — 收尾与防复发

| # | 事项 | 说明 |
|---|---|---|
| **C-9** | 亮点校验：`highlights` 必须 ==3 条（多于 3 条截断并告警），缺亮点且非 `auto` 切点时告警 | 进 `gen_changelog.py --check` |
| **C-10** | 版本连续性校验：`version.json` 新版本必须 > 旧版本且**不跳号**（minor 跳号需 `--allow-gap`） | 进 `release.py` |
| **C-11** | 文档更正三处：`update-handoff.md` 的「1.8.0」、73KB 口径、`plan-update` §E 标注「未实现」 | 纯文档 |
| **C-12** | 1.12.0 的重复条目（`eb0549c`/`055535f`）—— 属历史数据，建议**不修**（改 git 历史成本远大于收益），仅记录 | 无 |

---

## 8. 需苏哥拍板的两件事

1. **1.18.0 切点怎么切**：是把 62 条整体迁到新版本 `1.18.0`（推荐，用户能看到「这次真的更新了什么」），
   还是继续挂在 1.17.0 下（不推荐，下次发版会得到一张空卡）？
   → 涉及版本号语义，我不敢自己定。
2. **修复批次怎么排**：C-1/C-4/C-5/C-6/C-7/C-8 都是**纯生成器+前端**改动，可一次做完（约半天）；
   C-3 部署是独立动作。建议**先 C-1（防复发）→ 再 C-4~C-8（一次性理顺）→ 最后 C-2 + 发版**。
   按项目铁律，改动前我会先给逐文件清单再动手。

---

## 附：取证命令（可复现）

```bash
# 线上快照
curl --noproxy '*' -s https://supersu.ccwu.cc/changelog.json -o /tmp/cl.json
curl --noproxy '*' -s https://supersu.ccwu.cc/version.json

# 线上 worker 是否含修复
curl --noproxy '*' -s https://supersu.ccwu.cc/src/engine.worker.js | grep -c magazine_layouts   # → 0

# 卡片越界检测
python -c "import json;d=json.load(open('pwa/public/changelog.json',encoding='utf-8'));
[print(r['version'],r['date'],max(i['date'][:10] for g in r['groups'] for i in g['items'])) for r in d['releases'] if any(i['date'][:10]>r['date'] for g in r['groups'] for i in g['items'])]"

# 条数口径
python -c "import json;d=json.load(open('pwa/public/changelog.json',encoding='utf-8'));r=d['releases'][0];
print(sum(len(g['items']) for g in r['groups']), len([i for g in r['groups'] for i in g['items'] if not i['dev']]))"

# 版本序列
python -c "import json;d=json.load(open('pwa/public/changelog.json',encoding='utf-8'));print([r['version'] for r in d['releases']][::-1])"
git log --format="%h %ci %s" -- pwa/version.json | head
```
