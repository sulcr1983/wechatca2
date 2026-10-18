# 方案：借鉴开源项目优化 SuperSu 模板体系（不动手版）

> 生成日期：2026-10-18
> 更新：2026-10-18 20:24 —— 补 §2.1「许可证判定矩阵」、§11「方案 B 落地细则」；§2 增列 xiaohu-wechat-format；§5 增 R7~R9；§7 第 4 问已拍板 **B**
> 状态：**第 4 问已拍板（方案 B：只借配色/版式参数、自己生成）**；其余三问待定；本轮**只写文档，未动任何代码**
> 一句话结论：不抄别人的模板（数量上咱更多、协议上也不能抄），改学它们的"设计纪律 + 实用功能"，治咱们自己的"模板看着都一个样"这个毛病。

---

## 1. 背景与你的诉求

苏哥原话：现在模板虽然多（164 套），但很多感觉是重复的，想看看别人的模板和代码、功能设计，能不能参考过来自己用。

我的判断：
- 痛点真实 —— 已量化（见 §3）：近一半主题是"同一模子换颜色"。
- 但"再多做几百套"是错的方向。真正该做的是 **(a) 界面上把同族换色折叠成一组** + **(b) 加一层"内容智能"让同一套模板排不同文章气质不同**。
- 两个参考项目都**不该直接抄**：一个协议是 AGPL（主题/代码禁抄），一个是桌面端架构（只能学功能自己重写）。

---

## 2. 调研对象与结论

| 对象 | 是什么 | 协议 | 能否抄 | 值得学什么 |
|------|--------|------|--------|------------|
| **gzh-design-skill** | 给 AI 用的公众号排版技能，6 套精选主题 + 主题生成器 + 双关卡校验 | **AGPL-3.0** | ❌ 主题/组件库/校验脚本**禁止复制** | 5 色角色体系、按文章类型的"配方表"、智能内容排版（章节编号/关键词下划线/引言卡/目录）、双关卡质量校验的**方法论** |
| **Mars-Editor-APP** | Markdown 写稿一键推公众号的桌面软件（Tauri + React + Rust） | **MIT**（宽松） | ⚠️ 栈完全不同，只能学功能自己重写 | 复制时内嵌外链图（破防盗链）、外链转文末脚注、从链接导入、长图 PNG 导出 |
| **xiaohu-wechat-format** | Claude Code 公众号排版技能：85 套主题 JSON（6~8KB/套）+ 2 个模板 HTML（gallery/preview）+ 渲染脚本 | **README 末尾写 `MIT`，但仓库没有 LICENSE 文件**（GitHub API `license=null`） | ⚠️ 可复用，但必须按 MIT 三件套署名（见 §2.1）；"感谢一句"不等于合规 | 主题 JSON 的字段组织方式、画廊页的信息密度、主题命名与分组逻辑 |
| **咱们 SuperSu** | 网页端，164 套主题 + 小红书封面 | LICENSE 也是 **AGPL-3.0** | — | 自研 `su-*` 原创资产需保持权属干净 |

### 合规红线（重要，已核实）
- 咱们自己的 `LICENSE` 也是 AGPL-3.0。这反而让"别抄 gzh-design"更硬：把别人的 AGPL 主题混进代码树，会跟咱们自研 `su-*` 原创资产权属搅在一起；且公开上线的 PWA（supersu.ccwu.cc）既定规矩是 **AGPL 来源资产不进公开构建产物**。
- 因此本方案坚持：**只学方法论、不抄代码不抄主题、所有代码自己写、主题保持自研**。这与项目 AGENTS.md 一贯做法一致（"灵感可参照，数值/命名/文案一律自研"）。
- Mars-Editor 是 MIT，可学功能，但它是桌面端（Rust/React），与咱们 Flask + Pyodide 网页端架构不同，需用 Python/JS 自行实现，不搬源码。

---

## 2.1 许可证判定矩阵（回答"抄了声明感谢就行吗"）

### 结论先给

**不行。** "感谢 xxx" 是礼貌，不是授权。能不能复制，只看许可证要你做什么。

### 三种常见情况怎么判

| 仓库状态 | 法律性质 | 能不能复制 | 要做的事 |
|---|---|---|---|
| **有 LICENSE 文件**（MIT / Apache-2.0） | 明示授权 | ✅ 可以 | 保留版权声明 + 附许可全文 + 注明改动 |
| **只有 README 写 "MIT"**（本仓库即此情况） | 有授权意思，但形式不完整（缺版权人、年份、全文） | ⚠️ 实务上可用，但要补证据 | 同上三项 + 留存证据（commit SHA / 抓取日期 / README 截图）+ 建议向作者确认 |
| **完全没有任何许可声明** | 默认「保留所有权利」（著作权法：作品完成即受保护） | ❌ 不能复制 | 只能看思路、自己重写 |

### MIT 到底要求什么（三件套，缺一不可）

1. **保留版权声明**——写上来源仓库 + 作者/组织 + 年份（作者没署名就写仓库组织名，并注明"据 README 声明 MIT"）
2. **附许可全文**——把 MIT 文本放进 `THIRD_PARTY_NOTICES.md`（不能只写"MIT"两个字）
3. **注明修改**——"adapted from … / modified by …"，并说明改了哪里

MIT 不要求你开源自己的项目，也不要求你付钱；它只要求"别抹掉我的名字、别拿我背书"。

### 兼容性：MIT 能进 AGPL 项目吗？

**能。** 方向是单向的：

- MIT → AGPL：✅ 允许。MIT 代码可以并入 AGPL 项目，**但 MIT 那部分仍要保留原声明**；整体分发按 AGPL 走（我们项目本来就是 AGPL-3.0，README + LICENSE 一致）。
- AGPL → MIT：❌ 不允许。AGPL 的传染性会让整个项目必须按 AGPL 开源。
- 所以：**gzh-design-skill（AGPL）一个字节都不能进我们代码树**（§2 已定），而 xiaohu 这类 MIT 的可以进、只要署名。

### 什么叫"抄"？边界说清楚（决定选 A 还是 B）

| 类型 | 例子 | 是否受版权保护 | 判定 |
|---|---|---|---|
| **思想 / 事实 / 参数** | 配色十六进制值、字号比例、行高、间距规律、版式思路、功能交互流程 | ❌ 不受保护 | 可自由使用，无需署名 |
| **具体表达** | 主题 JSON 文件本身、CSS/HTML 文件、变量命名与注释、文案、画廊页结构 | ✅ 受保护 | 复制即需按许可署名 |

**推论**：把别人的主题 JSON 整个拷进来 = 复制表达（要署名）；只读它的配色/字号参数、用我们自己的 `scripts/theme_specs.py` + `build_themes.py` 重新生成 = 使用思想（不需署名、权属最干净）。这就是下面 A/B 方案的分界。

---


---

## 3. 重复到底有多少（量化证据）

164 套构成：
- **45 套** 早期原创（独立设计）
- **47 套** 第一批 `su-*`（有独立"设计意图"，不重复）
- **72 套** 第二批"六族 × 十二色" —— 即 **6 个模板骨架 × 12 种颜色**批量生成

→ **约 44%（72/164）是"同一个模子、换个颜色"**。例如 `su-dusk-*` 一族 10 个、`su-stamp-*` 一族 12 个，结构完全一致、仅色相不同。这就是"看着都一个样"的来源。

结论：治本不是加套数，而是 **折叠同族 + 加内容智能**。

---

## 4. 方案三块（均"借鉴思路、自己实现"）

### 第 1 块：学 gzh-design 的"设计纪律"（只学方法，不抄主题）
1. **5 色角色体系**：现在每套主题只有 底色 / 墨色 / 强调色 3 个值；补上 **浅底、浅边框、点睛高亮、灰阶层级、下划线色** 5 个角色。让每套内部更协调，套与套之间靠"角色分工"区分而非只靠颜色。
   - 落点：`scripts/theme_specs.py` 的 `T()` 规格 + `scripts/build_themes.py` 生成器推导逻辑（手术刀式扩展字段，不重写现有主题）。
2. **按文章类型自动推荐（配方表）**：检测粘入内容是 教程 / 观点 / 随笔 / 测评 / 数据，自动推荐最合适主题 + 组件组合。解决"164 套不知选哪个、选了也差不多"。
   - 落点：新增 `core/content_classifier.py`（纯规则，按关键词/结构判定），`/api/render` 返回推荐主题。
3. **智能内容排版层（脱模关键，Python 自写）**：章节自动编号、每段标 1–3 个关键词下划线、自动生成引言卡 / 金句、目录。同一套模板排不同文章气质不同。
   - 落点：新增 `core/smart_layout.py`，接入现有 `core/format_engine.py` 的渲染管道（作为可选增强，默认开、可关）。
4. **双关卡质量校验**：学其 `validate` 思路，给产物加公众号合规检查（禁 `style/div/class`、文字节点包裹、半角标点等），跑通才交付。
   - 落点：新增 `scripts/validate_gzh_html.py`（独立脚本，CI/手动跑）。

### 第 2 块：学 Mars-Editor 的实用功能（MIT 思路，Python/JS 重写）
1. **复制时自动内嵌外链图** —— 破解图床防盗链（微信粘贴掉图最大痛点）。
   - 落点：前端复制逻辑（`templates/index.html` 复制管线）+ 后端图片抓取内嵌。
2. **外链自动转文末脚注** —— 微信正文链接点不动，转脚注才实用。
   - 落点：`core/smart_layout.py` 或 `preprocessor.py` 的链接处理。
3. **从链接导入**：网页 / 公众号文章 → Markdown 草稿。
   - 落点：新增 `core/link_import.py`（公众号走本地 `#js_content` 提取；其他网页走 r.jina.ai 类服务，网址不外发凭据）。
4. **长图 PNG 导出**：文章长图（复用现有封面渲染引擎）。
   - 落点：本地 Flask 端新路由（PWA 离线端提示"需本地后端"）。

### 第 3 块：治"重复感"的界面改造（体感最直接）
- 模板选择器里，同族 12 个换色模板 **折叠成"1 个代表 + 色相选择"**，164 套视觉变几十组，不再挤一堆。
  - 落点：`templates/index.html` 模板库抽屉（现有 `#tpl-strip` / 模板库家族 chips 已存在，扩展折叠逻辑）。
- 加"按文章类型推荐"入口。
  - 落点：渲染后展示推荐条。

---

## 5. 对抗性审查（先挑自己方案的刺）

| 风险 | 说明 | 缓解措施 |
|------|------|----------|
| R1 智能排版翻车 | 关键词/金句要判"哪段重要"，纯规则易误标（把废话标成金句） | 先做保守规则（只动标题/首句/列表项）；AI 增强做成**可选**，不强制依赖 |
| R2 内嵌图慢/失败 | 复制时下载外链图可能慢或失败 | 失败回退外链 + 提示，绝不卡住复制主流程 |
| R3 折叠找不到原套 | 老用户习惯 164 全铺开 | 搜索/筛选仍按原名；折叠只是默认视图，可一键展开全部 |
| R4 长图离线跑不了 | PWA 离线端无渲染引擎 | 长图放本地 Flask 端（封面引擎现成）；PWA 端提示需本地后端 |
| R5 协议污染 | 误把 AGPL 主题混进公开 PWA 构建 | 严守"只学方法论"；任何来自 gzh-design 的灵感都自研实现，不引入其文件 |
| R6 推荐误判文章类型 | 规则分类可能错 | 推荐仅作"建议"，用户可一键忽略/改选；不强制覆盖当前选择 |
| R7 对方仓库无 LICENSE 文件 | xiaohu 仓库只有 README 的"MIT"两字，无版权人/年份/全文；万一作者改口或删 README，我方举证困难 | 只参考参数、自研生成（方案 B）；若确需复制，先留存证据（commit SHA + 抓取日期 + README 截图）并开 issue 请作者补 LICENSE |
| R8 主题/模板内含第三方资产 | 对方的主题可能引用第三方字体/配图，这些不在它的授权范围内 | 复制前逐个检查 `themes/*.json` / 模板 HTML 是否含 `@font-face`、外链图片、base64 图；命中即排除该套 |
| R9 我方 AGPL 义务被忽略 | 项目是 AGPL-3.0，公开站点需能拿到对应源码 | 站点"关于"里保留源码与第三方许可链接（已实现）；新增素材同步进 `THIRD_PARTY_NOTICES.md` |

---

## 6. 落地阶段与验收（每阶段独立可验，有头浏览器测过才算完）

- **阶段0**：拍板做不做、先做哪块（当前步骤）。
- **阶段1（性价比最高，治痛点）**：智能内容排版层 + 双关卡校验。
  - 验收：本地规则产出章节编号/关键词下划线/引言卡；`validate_gzh_html.py` 对采样产物 0 ERROR；有头浏览器走查渲染结果真实呈现。
- **阶段2**：模板选择器折叠同族 + 文章类型推荐。
  - 验收：选择器同族折叠生效、可展开；推荐条按内容类型出现且可忽略；有头浏览器走查 0 控制台报错。
- **阶段3**：复制内嵌图 + 外链脚注 + 从链接导入。
  - 验收：复制富文本内嵌外链图成功（防盗链场景）；外链转脚注；链接导入产出 Markdown；有头浏览器走查。
- **阶段4**：长图 PNG 导出。
  - 验收：本地端导出文章长图；PWA 端给出"需本地后端"提示。

> 每个阶段完成后：跑现有测试套件（E2E 65/65、集成 35/35、API 29/29、有头全按钮 33/33 等）确保不回归，并做有头浏览器实测。

---

## 7. 待苏哥拍板的问题

1. **四块里先做哪块？** 我建议先 **阶段1 + 阶段2**（直接治"模子感"和"重复感"），阶段3/4 锦上添花。
2. **智能内容排版要不要接 AI？** 接了更聪明但要填 key；不接纯规则也能跑。我倾向**先不接 AI**，本地规则做扎实再说。
3. **同族折叠能接受吗？** 若你习惯 164 全铺开，第 3 块只做"按类型推荐"、不做折叠。
4. **xiaohu 那 85 套主题怎么处理？** —— ✅ **已拍板：B（只抄配方）**，细则见 §11。
   - ~~A 挑几套复制~~：省事，但要背署名义务，且与现有 164 套可能重名。
   - **B 只抄配方（已选）**：读它的 `colors` / `styles` 参数（配色、字号、行高、间距），反推成我们 `theme_specs.py` 的一条规格，用 `build_themes.py` 生成**自己的**主题。无版权尾巴，权属最干净。
   - ~~C 整包 85 套搬进来~~：重名冲突、署名面变大、还要逐套查第三方资产。

---

## 8. 收尾与文档同步（执行阶段才做，本次未动）

- 本方案经拍板落地后，每完成一个阶段：更新 `AGENTS.md` / `CHANGELOG.md` / `HANDOFF.md` 对应章节，补 `docs/` 说明，写当日工作日志。
- 遵守"手术刀式修改"：只改方案涉及的部分，不顺手重构、不删已有注释、不改风格。
- 不引入任何 AGPL 外部文件；所有借鉴均自研实现并保持 `su-*` 原创权属。

---

## 9. 附：许可证核查记录（xiaohu-wechat-format）

### 9.1 核查事实（可复现）

| 项 | 结果 |
|---|---|
| 仓库 | https://github.com/xiaohuailabs/xiaohu-wechat-format |
| 核查时间 | 2026-10-18 20:19（GMT+8） |
| 核查时 `main` HEAD | `dbddf0fd9c1189a6f3e0bec1bebb1b0e47e8ddf0`（2026-06-12） |
| **LICENSE 文件** | **不存在**（根目录只有 `.gitignore` / `README.md` / `README_CN.md` / `SKILL.md` / `config.example.json` + `cover/ docs/ scripts/ templates/ themes/`） |
| GitHub API `license` 字段 | `null` |
| 授权声明位置 | `README.md` 末尾「## License → MIT」——**无版权人姓名、无年份、无 MIT 全文** |
| 内容规模 | `themes/` 85 个 JSON（6.1~7.7KB/个）；`templates/gallery.html` 16,616B；`templates/preview.html` 7,446B |
| 社区数据 | 703 ★ / 96 fork（核查时） |

复现命令：

```bash
curl -s https://api.github.com/repos/xiaohuailabs/xiaohu-wechat-format | jq '.license,.stargazers_count'
curl -s https://raw.githubusercontent.com/xiaohuailabs/xiaohu-wechat-format/main/README.md | tail -20
curl -s https://api.github.com/repos/xiaohuailabs/xiaohu-wechat-format/contents/
curl -s https://api.github.com/repos/xiaohuailabs/xiaohu-wechat-format/commits/main | jq '.sha'
```

**判定**：有授权意思、缺授权形式。可按 MIT 使用，但必须自己补齐署名与许可文本，并保留上述证据；**不要**把它当成"无版权、随便用"。

### 9.2 MIT 许可全文（照抄进 `THIRD_PARTY_NOTICES.md`，版权行按实际填）

```
MIT License

Copyright (c) 2026 xiaohuailabs (xiaohu-wechat-format)

Permission is hereby granted, free of charge, to any person obtaining a copy
of this software and associated documentation files (the "Software"), to deal
in the Software without restriction, including without limitation the rights
to use, copy, modify, merge, publish, distribute, sublicense, and/or sell
copies of the Software, and to permit persons to whom the Software is
furnished to do so, subject to the following conditions:

The above copyright notice and this permission notice shall be included in all
copies or substantial portions of the Software.

THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR
IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY,
FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN NO EVENT SHALL THE
AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER
LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING FROM,
OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS IN THE
SOFTWARE.
```

### 9.3 `THIRD_PARTY_NOTICES.md` 条目模板

**情况一：只学参数、自己生成（方案 B，推荐）**

```md
### xiaohu-wechat-format（仅参考设计参数）
- 来源：https://github.com/xiaohuailabs/xiaohu-wechat-format
- 参考版本：dbddf0f（2026-06-12），核查于 2026-10-18
- 许可：MIT（据该仓库 README 的「## License / MIT」；该仓库未附 LICENSE 文件）
- 使用方式：**未复制任何文件**。仅阅读其主题 JSON 中的颜色/字号/行高/间距参数，
  转写为本项目 `scripts/theme_specs.py` 的规格条目，由 `scripts/build_themes.py` 重新生成主题。
- 因此本项目产出的主题文件为独立生成物，不构成对其文件的复制。
```

**情况二：确实复制了文件（方案 A）**

```md
### xiaohu-wechat-format（复制了主题文件）
- 来源：https://github.com/xiaohuailabs/xiaohu-wechat-format
- 取用版本：dbddf0f（2026-06-12）
- 复制清单：themes/<name>.json（共 N 个），见本仓库 <路径>
- 许可：MIT（版权人未在仓库署名，此处按仓库组织名标注）
- 修改：重命名为主题 id `su-xhs-*`；调整了 <具体改动>；未改变整体版式结构。
- 完整 MIT 许可文本见本文件末尾。
```

### 9.4 上线前检查清单（复制/借鉴后逐项打勾）

- [ ] 仓库里**没有**对方原始文件；若有，文件头已加署名注释
- [ ] `THIRD_PARTY_NOTICES.md` 有条目（来源 / 版本 SHA / 许可 / 改动说明）
- [ ] MIT 全文已附（不是只写"MIT"两个字）
- [ ] 若素材进了 `pwa/dist`（公开站点），站点能访问到该 notices（已挂"关于→第三方许可"链接）
- [ ] 证据留存：commit SHA + 核查日期 + README「License」段截图（放 `docs/compliance/`）
- [ ] 已向作者开 issue / 邮件请求补 LICENSE 文件（附链接记录）
- [ ] 逐套检查是否含第三方字体（`@font-face`）、外链图、base64 大图；命中则剔除该套

---

## 10. 我方 AGPL 现状与待办（与本文档配套）

**已执行**（对应 `docs/pwa-cloudflare-plan.md` 红线 1 的路线 A）：

- 仓库已有 `LICENSE`（AGPL-3.0 全文），`README.md` 与站点「关于」口径一致（AGPL-3.0）
- 站点「关于」提供**源码链接**与**第三方许可链接**，满足 AGPL §13「网络交互用户可获取源码」
- PWA 公开构建（`pwa/dist`）只收自研资产 + 已授权素材，AGPL 来源资产不进产物

**待办**（同样出自红线 1~5，做公开分发前应逐项确认）：

| 项 | 事 | 出处 |
|---|---|---|
| 上游署名 | `references/*.md`、`public/screenshot-backgrounds/style-b/*.webp` 为上游 AGPL 衍生，需在 NOTICE 署名并保留 AGPL 声明 | `pwa-cloudflare-plan.md` 红线 1 |
| BLCaptain | 双许可，「免费」条件需与作者书面确认（是否营利） | 同上 红线 2 |
| Pexels | 图片署名需带链接 | 同上 红线 5 |
| 字体 | 自托管 woff2 需随附 OFL 文本（`pwa/dist/fonts/`） | 同上 |
| 来源不明图 | `public/images/` 若干图片出处待核 | 同上 |

> 原则不变：**AGPL 来源资产不进公开构建产物；MIT 素材可进，但必须署名。**

---

## 11. 方案 B 落地细则（已拍板，待执行）

> 前提：**不复制对方的任何文件**。只读它的参数，用我们自己的生成器产出主题。

### 11.1 好消息：两套主题 JSON 结构同构（已实测）

| 字段 | 对方（xiaohu） | 我们（su-*） | 说明 |
|---|---|---|---|
| `name` / `description` | ✅ | ✅ | 文案自写，不照抄 |
| `colors` | 7 个键 | **完全相同的 7 个键** | primary / accent / background / blockquote_bg / code_bg / hr_color / footnote_bg |
| `styles` | 36 个键 | **完全相同的 36 个键** | wrapper / h1..h6 / p / strong / em / a / blockquote / code / pre / table / list_* … |
| `layout` | `card` / `hero` / `timeline` … | 引擎**已支持**（`core/format_engine.py:1820`、`:1830`） | 无需改造 |
| `card` | 7 个键（bg / card_bg / card_texture / card_texture_size / card_border / card_shadow / card_radius） | 引擎**已读取**（`:1365-1367`、`:1832`） | 无需改造 |

**结论**：不用改引擎、不用改 schema，只需要一个"参数反推"环节。

### 11.2 两条路线（推荐 B1）

| 路线 | 做法 | 产出物性质 | 视觉还原度 | 权属干净度 |
|---|---|---|---|---|
| **B1 反推配方（推荐）** | 从对方 36 个样式里反推 6 个语义参数 → 写一条 `T()` 规格 → `build_themes.py` 算出全部样式 | 100% 由我们的生成器计算 | 约 80~90%（骨架/细节由我们的算法决定） | **最干净**：与对方文件无逐字对应 |
| B2 参数映射（备选） | 把对方 36 个样式数值映射进同构的我们的 JSON | 参数逐值相同、结构同构 | 约 95~100% | 参数不受版权保护（见 §2.1），但观感上像"搬"，建议仍在 notices 注明 |

**建议**：整体走 B1；只有个别你特别喜欢的套（比如渐变标题条）单独特批走 B2，并在 notices 里写明"样式参数参考"。

### 11.3 B1 反推映射表（实施时按这张表写脚本）

| 目标参数 | 从对方 JSON 取值 | 兜底规则 |
|---|---|---|
| `bg` | `styles.wrapper.background_color` | 缺失 → `colors.background` |
| `ink` | `styles.p.color` | 缺失 → `colors.primary` |
| `accent` | `colors.accent` | 缺失 → `styles.h2.background_color` |
| `font` | `styles.p.font_family` 含 `Serif`/`Songti`/`宋` → `serif`，否则 `sans` | 默认 `sans` |
| `arch`（骨架族） | `layout == "card"` → `biz`；`layout == "hero"` → `feast`；深色底（bg 亮度 < 0.25）→ `night`；衬线+浅米底 → `letter`；其余按 `styles` 的装饰强度判 `plain` / `minimal` / `stamp` | 默认 `plain` |
| `name` | **自己起中文名**（不照抄对方 name） | — |
| `id` | `su-xhs-<自拟英文>` | — |
| `desc` | **自己写一句话**（说清适用文章类型） | — |

> 我方生成器的骨架族（`scripts/build_themes.py` 的 `ARCHETYPES`）：`stamp / minimal / biz / letter / night / feast` + 默认 `plain`；`T()` 只需 `id / name / font / arch / bg / ink / accent / desc` 八个参数。

### 11.4 去重：85 套里真正能用的没那么多

避免又造一批"看着都一样"（这正是 §3 的老毛病）：

1. **颜色去重**：把 `bg / ink / accent` 转 Lab，三个色的色差都 < 12 视为同一配色 → 只留一套。
2. **骨架签名**：`layout + font + 三个主色` 组成字符串做哈希，同签名只留一套。
3. **与现有 164 套去重**：同样跑一遍（我们已有 72 套是同模换色，别再叠一层）。

预期：85 套 → 去重后 **约 15~25 套**真正有辨识度的配方。

### 11.5 执行步骤（待你点头再动手，本轮 0 代码）

1. **抽样验证（0.5 天）**：取 10 套 → 按 §11.3 反推 → 生成 → 截图对比"气质是否接近"。
2. **全量反推（0.5 天）**：85 套跑一遍，输出去重后的候选清单给你挑。
3. **写入规格**：你挑中的每套，在 `scripts/theme_specs.py` 加一条 `T(...)`，注释写明「参数参考 xiaohu-wechat-format（MIT，仅参考，未复制文件）」。
4. **生成 + 缩略图**：`python scripts/build_themes.py` → `python scripts/gen_theme_thumbs.py`。
5. **视觉走查**：有头浏览器逐套看（桌面 + 手机宽度），确认无塌版、复制到公众号样式完整。
6. **补 notices**：按 §9.3「情况一」模板写进 `THIRD_PARTY_NOTICES.md`（结论是"未复制任何文件"）。

### 11.6 验收标准（达不到不算完成）

- [ ] 仓库里**没有**对方任何 `.json` / `.html` 文件
- [ ] 新增主题 id 全部 `su-xhs-*`，与现有 164 套零重名
- [ ] 每套在本地版 + PWA 都能正常渲染，控制台 0 报错
- [ ] 缩略图已重生成（`public/theme-thumbs/` 数量 = 主题数）
- [ ] `THIRD_PARTY_NOTICES.md` 有条目（含仓库地址、参考版本 `dbddf0f`、核查日期、MIT 声明）
- [ ] 跑回归：`test_e2e` 65/65、`test_api_e2e` 29/29、有头 33/33

### 11.7 明确不做

- ❌ 不复制对方 `themes/*.json`、`templates/*.html`、`scripts/*`
- ❌ 不改 `core/format_engine.py`（schema 已够用）
- ❌ 不动现有 164 套主题（只做增量）
- ❌ 不引入对方依赖（它是 Claude Code skill，架构不同）

---

## 11.8 抽样验证结果（2026-10-18，10 套）

### 方法

- 取 10 套覆盖不同 `layout` / 明暗 / 字体的主题（apple-gradient、academic-paper、bauhaus、dark-ocean、hero-azure、timeline-green、notion-doc、rice-paper-ink、swiss-grid、terminal-matrix）。
- **只读参数**（不复制文件）：按 §11.3 反推 `bg / ink / accent / font / arch`，`layout` 与 `card` 作为引擎配置参数沿用。
- 用 `build_theme()` 生成我方主题，**同一段样例文章**分别渲染，并排截图对比。
- 工具：`scripts/probe_oss_themes.py`；产物：`output/probe_oss/{report.html, params.md, row*.png}`。

### 反推结果（10 套全部成功）

| 对方主题 | 我们的 arch | font | bg / ink / accent |
|---|---|---|---|
| apple-gradient | card | sans | `#f5f5f7` / `#1d1d1f` / `#0071e3` |
| academic-paper | magazine | serif | `#FFFFFF` / `#0F0F0F` / `#1A3A6E` |
| bauhaus | plain | sans | `#ffffff` / `#1a1a1a` / `#E30613` |
| dark-ocean | night | sans | `#0f172a` / `#e2e8f0` / `#38bdf8` |
| hero-azure | plain（layout=hero 沿用） | sans | `#ffffff` / `#333333` / `#0EA5E9` |
| timeline-green | plain（layout=timeline 沿用） | sans | `#ffffff` / `#333333` / `#16a34a` |
| notion-doc | plain | sans | `#ffffff` / `#37352F` / `#2383E2` |
| rice-paper-ink | paper | serif | `#F8F4E8` / `#1F1A14` / `#8B1F1F` |
| swiss-grid | magazine | serif（**误判**，应为 sans） | `#FFFFFF` / `#111111` / `#0047AB` |
| terminal-matrix | night（深色优先于等宽） | sans | `#0A0A0A` / `#B0F5B0` / `#00FF41` |

### 目视对比（3 个代表案例）

| 案例 | 结论 | 差异点 |
|---|---|---|
| **apple-gradient**（card） | 气质接近：白卡分层、大圆角、留白、Mac 三圆点代码块都对 | 原版 h2 是**蓝色实底圆角标题条**，我们生成的是纯文字标题 |
| **rice-paper-ink**（paper） | 气质接近：米底 + 宋体 + 竖线标题 + 引用块 | 原版引用是**无底色+上下细线**、代码块是**浅米底深字**；我们是底色块 + 黑底代码 |
| **dark-ocean**（night） | 深色氛围像 | 原版 h2 带**大号半透明序号 01/02 + 交错色带**；且我们深色套的**代码块出现浅底浅字（对比度不足，属可读性缺陷）** |

### 结论

1. **方案 B1 可行**：10 套全部反推成功，生成的主题"整体气质"能到 **约 80%**，且**没有复制任何文件**。
2. **丢的是"标志性结构"**，不是颜色：实底标题条、大号序号、交错色带、细分隔线、代码块配色策略。这些是各家的"签名设计"。
3. **发现一个必须修的副作用**：反推后配色换了，但生成器的代码块底色是按骨架族写死的 → 深色套会出现**浅底浅字**。这说明反推不能只换 6 个参数，还要做**自适应校正**（代码块/引用底色按主色亮度派生）。
4. **字体判定有误判**：`swiss-grid` 因 `font_family` 里带 `serif` 兜底被误判为衬线。规则要改成"取 font-family 的**首个**字体名判断"。

### 三条可选增强（按性价比排序）

| # | 动作 | 收益 | 工作量 |
|---|---|---|---|
| 1 | **代码块/引用底色自适应**（按 ink 亮度与 accent 派生，保证对比度 ≥ 4.5:1） | 修掉可读性缺陷，所有深色套受益 | 0.5 天 |
| 2 | 生成器加 2 个特征开关：`h2_style=bar`（实底标题条）、`divider=line`（细分隔线） | 命中率 80% → 约 90%，覆盖 apple/sunset/sticky-note 一类 | 1 天 |
| 3 | 个别"签名感特别强"的套走 B2（参数直映，visual 100%） | 少量高保真 | 每套 10 分钟 |

### 建议路线

**先做增强 1（修可读性）→ 再全量反推 85 套 → 去重出候选清单 → 只对命中率高的套入库。** 增强 2 视你挑中的套再决定要不要做。

> 抽样产物（可自己看）：`output/probe_oss/report.html`（10 套并排）、`output/probe_oss/row1.png` / `row4.png` / `row8.png`。
