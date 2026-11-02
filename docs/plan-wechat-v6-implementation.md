# 公众号排版页 v6 · 实现计划（2026-11-03）

> **本文回答一个问题：把 `wechat-v7.html` 原型和 `design-wechat-v6-final.md` 落到生产代码，要动哪些文件、按什么顺序、每步怎么验证。**
>
> 前置：
> - 方案定稿 [`design-wechat-v6-final.md`](design-wechat-v6-final.md)
> - 交互原型 [`prototypes/wechat-v7.html`](prototypes/wechat-v7.html)
> - 本次技术预研（§二，全部实测，不是推断）
>
> **状态：只做计划，不写产品代码。** 生产侧本轮零改动。

---

## 一、这份计划要解决的核心疑问

用户提的原话：

> 「尤其是新增的 19 套整篇设计，是否可以完整的实现我们的文字自动对齐排版？这个需要做技术预研，
> 反正涉及到的技术部分，先要测试，然后做计划，保证文档可以在技术上全部实现。」

> 「在技术预研中，必须经过我们的夹具测试，尤其是新增的 19 套。不然放上去就是摆设。
> 记得原来的 19 套里面每一套设计规范。」

所以本文分两半：

| 半 | 内容 | 结论 |
|---|---|---|
| **§二 技术预研** | 中文对齐到底能不能做、19 套能不能全都做 | **能做，19/19 全部验证通过**；但有 4 类"看起来能做、实际是摆设"的属性必须禁写 |
| **§三–§六 实现计划** | 文件 / 改动 / 顺序 / 验证 | 分 7 个阶段，每阶段有可变红的门禁 |

---

## 二、技术预研结论（实测）

### 2.1 先说最重要的一条：**对齐方式不能一刀切**

用户强调「记得原来的 19 套里面每一套设计规范」。我逐套核对了
[`design-magazine-recipes.md`](design-magazine-recipes.md) 与 `core/magazine_layouts.py` 的 docstring，
发现规范对"对齐"的表述并不一致：

| # | kit | 规范原话 | 出处 | 对齐契约 |
|---|---|---|---|---|
| 9 | `mg-ukiyoe` 浮世绘 | 「正文 17px / 行距 1.8 / 段间距 20px，衬线宋体，不用纯黑，选深青灰，**两端对齐**」 | recipes 2.7 | **justify**（唯一明写两端对齐的） |
| 2 | `mg-guardian` 卫报 | 规范无对齐要求；排版特征是「引用放大、线只用 1px」 | recipes 2.2 | left |
| 4 | `mg-economist` 经济学人 | 「小标题**左对齐**、无图标、18px」 | recipes 2.4 | left |
| 10 | `mg-ikea` 宜家 | 「大标题**左对齐**、24px 特粗蓝字」 | recipes 2.14 | left |
| 15 | `mg-deepread` 深度阅读 | 「主标题 26px，深褐色，**左对齐**」 | recipes 2.15 | left |
| 其余 14 套 | — | 规范未涉及对齐方式（只规定字号/颜色/装饰） | — | 引擎默认 left |

**结论：19 套里只有 1 套（浮世绘）规范要求两端对齐。**
把 19 套统一改成 justify，就是**违背另外 18 套的设计意图**；而且 Vogue 画报、新粗野这类
靠"大开大合"吃饭的版式，两端对齐会把标题区的节奏感抹平。

**因此实现原则是：对齐方式 = 每套设计自己的属性，不是全局开关。**
这一条直接决定了数据模型（§4.1）和门禁断言（§5）的写法。

> ⚠️ 这里有一个**需要用户拍板**的产品分歧，见 §7：是"严格按规范逐套固定"，还是"按规范给默认值 + 允许用户覆盖"。

### 2.2 中文两端对齐：真实有效，且不会把字撑散

这是本轮最关键的实测。方法：同一段中英混排 + 标点密集的中文，在 375px 微信阅读环境（内容区 343px）下，
用 `Range.getClientRects()` 逐行量**非末行的右缘空隙**（左对齐时这个值 > 0，两端对齐时 ≈ 0）。

| 变体 | 非末行右缘 max | 非末行右缘均值 | 行数 |
|---|---|---|---|
| A 现状 `left` | **15.0px** | 8.41px | 9 |
| B 仅 `text-align:justify` | **0px** | **0px** | 9 |
| C justify + `text-justify:inter-ideograph` | 0px | 0px | 9 |
| D justify + `line-break:strict` | 0px | 0px | 9 |
| E justify + `hanging-punctuation:allow-end` | 0px | 0px | 9 |
| F justify + `text-autospace:normal` | 0px | 0px | 9 |

**B 组就够，C–F 全无增量**（原因见 2.3）。也就是说：**只要一行 `text-align:justify`。**

再验"会不会撑散"。把段落逐字拆成 `span`，量每行内相邻两字的间距：

| 变体 | gapMin | gapAvg | gapP95 | gapMax |
|---|---|---|---|---|
| left | 0 | 0 | 0 | 0 |
| **justify** | **0** | **0** | **0** | **0** |
| justify + `letter-spacing:0` | 0 | 0 | 0 | 0 |

**中文 justify 不会产生英文那种"河"**——等宽方块字，行末拉平靠的是字间微调，
9 行 × 每行 30+ 字的样本里，逐字间距最大仍是 0px。

顺带确认 `letter-spacing` 与 `justify` **不冲突**：`letter-spacing:0.5px` 在 justify 下回读仍是 `0.5px`。

### 2.3 四类"看起来能做、实际是摆设"的属性 —— 必须禁写

对上面 C–F 四组做 computed style 回读，判断浏览器到底认不认：

| CSS 属性 | 回读结果 | 判定 |
|---|---|---|
| `text-align:justify` | `justify` | ✅ **有效，就用这个** |
| `line-break:strict` | `strict` | ⚠️ 被解析，但**无增量**（见下） |
| `text-justify:inter-ideograph` | 空 / `auto` | ❌ **Chromium 已移除，写了不生效** |
| `hanging-punctuation:allow-end` | 空 | ❌ **未实现，写了不生效** |
| `text-autospace:normal` | `no-autospace` | ❌ 被强制回落，`normal` 不生效 |

**`line-break:strict` 为什么"无增量"**——专门做了归因实验（160px 窄容器，逼标点落行首）：

| 变体 | 行首标点数 |
|---|---|
| `none` | 0 |
| `word-break:break-all` | 0 |
| `break-all + line-break:strict` | 0 |
| `break-all + line-break:loose` | 0 |
| `break-all + **line-break:anywhere**` | **4**（`是明天吧。` / `据；第二，` / `长的句子，` …） |

**只有 `anywhere` 才会破坏行首禁则** → 说明 **Chromium 默认就做了 CJK 避头尾**，
`strict` 是在跟一个已经正确的东西说"请正确"，写了白写。

> 工程结论：**产物里只允许出现 `text-align:justify` 这一个对齐相关属性。**
> 写 `text-justify` / `hanging-punctuation` / `text-autospace` / `line-break` 进产物的代码，
> 一律视为无效代码，门禁会拦（§5 断言 A7）。

### 2.4 19 套 kit 逐套验证：19/19 生效

对每套 kit 的**真实引擎输出**做三态对照（375px）：

- **T0** 原样
- **T1** 给 `p` 追加 `text-align:justify`
- **T2** T1 + `line-break:strict`

| kit | T0 非末行右缘 max/avg | T1 非末行右缘 max/avg | 判定 |
|---|---|---|---|
| mg-adidas | 13 / 6.4 | **0 / 0** | ✅ |
| mg-brutal | — / — | **0 / 0** | ✅ |
| mg-deepread | — / — | **0 / 0** | ✅ |
| mg-economist | 13 / 6.9 | **0 / 0** | ✅ |
| mg-forbes | 13 / 6.9 | **0 / 0** | ✅ |
| mg-guardian | 22 / 9.2 | **0 / 0** | ✅ |
| mg-ikea | 13 / 6.7 | **0 / 0** | ✅ |
| mg-m2w-light | 13 / 6.9 | **0 / 0** | ✅ |
| mg-m2w-rational | 20 / 8.9 | **0 / 0** | ✅ |
| mg-m2w-swiss | **22.3 / 9.05** | **0 / 0** | ✅ |
| mg-m2w-tech | 13 / 6.92 | **0 / 0** | ✅ |
| mg-mori | 13 / 6.58 | **0 / 0** | ✅ |
| mg-muji | **30.5 / 18.68** | **0 / 0** | ✅ |
| mg-natgeo | 13 / 6.92 | **0 / 0** | ✅ |
| mg-note | 13 / 7.25 | **0 / 0** | ✅ |
| mg-starbucks | 13 / 6.42 | **0 / 0** | ✅ |
| mg-time | 13 / 7.25 | **0 / 0** | ✅ |
| mg-ukiyoe | 0 / 0（本来就是 justify） | **0 / 0** | ✅ |
| mg-vogue | 15 / 10 | **0 / 0** | ✅ |

**19/19 全部生效。** 其中 `mg-muji`（无印良品）原本最不齐（均值 18.68px，因为它要求"每段 2–4 行 + 明显空隙"），
`mg-m2w-swiss`（国际瑞士）次之（9.05px，它的设计就是"咬死左轴线"）——这两套收益最大。

### 2.5 一个必须记住的实现细节：注入顺序

主题 JSON 里 `styles.p.text_align` 是 `left`，引擎会把它写成 `style="…;text-align:left"`。
**内联 CSS 同名属性后写的赢**，所以追加必须放在 `style` **末尾**：

```python
# ✅ 对：追加到末尾，覆盖前面的 text-align:left
f'<p style="{cur};text-align:justify">'

# ❌ 错：前置会被原值覆盖，等于没写（首次实测踩到，表现为"改了没反应"）
f'<p style="text-align:justify;{cur}">'
```

现成的工具已经具备这个语义：`core/magazine_layouts.py:267` 的 `style_tag()`
（注释原文写的就是「同名替换、缺则追加」）。**实现阶段直接用它，不要另写正则。**

### 2.6 字号缩放的坑：只改 `p` 会有 18/19 套列表掉队

方案定稿 §3.2.1 定了字号作用于「正文一组 = p + li + blockquote」，标题按 `ratio` 等比。
但 kit 的 DOM 结构和普通主题不同——实测 19 套**没有一套有 `<li>`**：

```
mg-*.json 的列表经 convert_lists_to_sections 后变成：
<section><span>•</span><span style="font-size:16px">正文文字…</span></section>
                                                  ↑ 正文文字在 inline span 里
```

拿 `ratio = 17/15` 实测三种做法：

| 做法 | 列表字号与正文不一致的 kit 数 | 说明 |
|---|---|---|
| 只缩放 `p` | **18 / 19** | 列表字仍 16px，正文 18.13px → 同篇文章割裂 |
| `p` + 列表文字 `span` + `blockquote` + h1–h6 等比 | **2 / 19** | `mg-deepread`、`mg-guardian` 残留（这两套 blockquote 固有字号偏大，需一并纳入） |

**结论：字号功能必须覆盖 `span` 上的 `font-size`，只处理块级标签是不够的。**
且 `blockquote` 自己的 `font-size`（不是 `blockquote p`）也要覆盖，否则 `mg-guardian`（引用 19px→44px 设计）会掉队。

### 2.7 先搜现成方案：结论是「没有可复用的轮子，这件事本身不该找库」

按铁律"先搜索，再写代码"执行了调研（GitHub API + PyPI API + 本仓库代码比对）：

| 候选 | 星数 / 维护 | 许可证 | 解决我们的问题吗 |
|---|---|---|---|
| `vinta/pangu.js` | 4,857★ / 2026-10 活跃 | MIT | ❌ 它做**中英文之间插空格**（`text-autospace`），不管 `text-align` |
| `geekjourneyx/md2wechat-skill` | 3,778★ / 2026-10 活跃 | **NOASSERTION**（许可不明） | ❌ 整套 Markdown→公众号排版引擎，要替换整条管线，不是"只注入一个属性" |
| `obsidian-md2wechat` | 318★ | **AGPL-3.0** | ❌ 同上，且 AGPL 对闭源分发不友好 |
| `md2wechat-lite` | 88★ | MIT | ❌ 同上 |
| PyPI `cjkjustify` | — | — | ❌ **不存在**（PyPI API 返 404） |
| PyPI "按比例缩放内联 font-size" 类库 | — | — | ❌ 搜索无此类库 |

**结论：Adopt 任何一个都是在为一个 CSS 属性引入整条管线 + 许可证风险，与「零新增依赖」直接冲突。**

进一步，**本仓库里这件事已经做了一半**——不是缺库，缺的是数据：

| 实测 | 数据 |
|---|---|
| 全库主题 JSON 的 `text_align` 分布 | `left` **264** / `center` **149** / `justify` **126** |
| `build_style_string()`（`format_engine.py:839`） | 已能把 JSON 的 `text_align` 转成内联 `text-align`，**无需任何库** |
| 引擎/版式源码里 4 个"禁写属性" | **0 处**（§2.3 断言 A7 的现状基线） |
| **19 套 kit 的 `p.text_align`** | **全部 `left`，包括 `mg-ukiyoe`** ← 见下 |

最后一行是本轮最关键的事实：`mg-ukiyoe` 的"两端对齐"**完全靠 `magazine_layouts.py:757` 的硬编码**，
主题 JSON 里写的是 `left`。也就是说 19 套目前**没有任何一套**通过数据声明对齐方式，
全靠引擎默认值 + 一处硬编码。这正是 P1 要先把真源收拢到 JSON 的原因。

**做法**：仿本仓库已有的同模式先例 `_ensure_text_wrap()`（`:866`）与 `normalize_heading_align()`（`:898`）
——两者都是幂等地给特定标签补/改 CSS，只依赖 `re`，**零新增依赖**。新函数照同一形状写。

> 调研中未能验证的两项，如实记录：① `doocs/md`、`wechat-format` 的实际 CSS 取值（页面路径已变，未读到源码）；
> ② 微信 WebView 对 `hanging-punctuation` 的支持度。②不需要验证——§2.3 已实测 Chromium 本身就不支持，
> 微信内核更不可能实现，写进去必然是死代码。

### 2.8 顺手发现的既有缺陷（不在本轮修，但要记档）

`core/format_engine.py:855` 的 `_WRAP_CSS = "overflow-wrap:break-word;word-break:break-word"`
在 **183 套全部生效**。实测它会**把长英文词从中间切断**：

| 变体 | 被切断的词 |
|---|---|
| `word-break:break-word`（现状） | `segment`（3/7 字符处断） |
| `word-break:break-all` | `internationali`(19/20)、`supercalifragi`(33/34) |
| `overflow-wrap:break-word` | `segment`(3/7) 同样断 |
| `word-break:keep-all` | **0 处断裂** |

这是存量问题，与本轮对齐无关，**本轮不动**（改它会影响 183 套的产物字节，违反"164 套逐字节不变"的底线）。
但要写进 §8 风险表——因为 justify 生效后，行末拉平会让断词更显眼，届时用户可能会提。

### 2.9 边界：**我只能证明浏览器里对，不能证明公众号编辑器里对**

必须说清这条，否则就是又一轮"文档里全绿、线上是摆设"：

| 已验证 | 证据 |
|---|---|
| Chromium 渲染下 justify 生效、不撑散、不溢出 | 上面的逐行/逐字实测 |
| 产物只含内联样式，落在微信安全区（`design-engine-optimization.md` §5.1 明列 `text-align` 可用） | 代码扫描 + 文档 |
| 19 套的 `locked_layout` 全部命中 `LAYOUT_REGISTRY`（23 键 / `MAGAZINE_LAYOUTS` 19 个），不存在"静默不套版式" | 注册表断言 |

| **未验证（需真机）** | 为什么没法在本机验证 |
|---|---|
| 粘进公众号后台后 `text-align:justify` 是否被保留 | 需要人工在 mp.weixin.qq.com 粘贴并截图核对，本地无凭证 |
| 手机微信 WebView 的渲染是否与 Chromium 一致 | 微信 X5/WKWebView 排版行为不可由本机 Playwright 代表 |

**所以 §6 的最后一步是「真机粘贴验收」，不是可选项。** 这一步不过，整个对齐功能不算交付。

---

## 三、实现顺序总览

依赖关系决定顺序，不能跳：

```
P0 夹具门禁（先建，后面每一步都靠它守门）
      ↓
P1 数据层：把「对齐契约」写进 19 套 mg-*.json（真源唯一化）
      ↓
P2 对齐能力落地：engine 按契约注入 + 禁写无效属性
      ↓  ← 到这里「19 套自动对齐」就完整可交付了
P3 字号能力落地：p + 列表 span + blockquote + 标题等比（依赖 P2 的注入工具）
      ↓
P4 UI 结构改造：两 tab 抽屉 / 折叠 / 字号第 4 段 / C 案标题条 / 版式条 8 项 / 收藏接线
      ↓
P5 资源与构建：缩略图 2:1、kit-thumbs 进包、主题数活数据
      ↓
P6 文档同步与交付：doc_sync_check + 真机粘贴验收
```

**为什么 P0 在最前**：用户明确要求"必须经过夹具测试，不然放上去就是摆设"。
门禁先建，P1–P3 的每一步才有"能不能红"的判据；否则又会变成"改完没反应但没人知道"。

**为什么 P1 在 P2 前**：对齐契约要先有唯一真源。现在 `mg-ukiyoe` 的 justify 是**硬编码在 `layout_ukiyoe()` 里**的
（`magazine_layouts.py:757`），而其余 18 套依赖主题 JSON 的 `text_align`——两套来源，
门禁无法统一断言。先把真源收到 JSON，engine 才好按数据办事。

---

## 四、逐文件改动清单

### P0 · 夹具门禁（新增，不改产品代码）

| 文件 | 改什么 |
|---|---|
| **新增** `scripts/kit_alignment_fixture.py` | 19 套 × **11 条**断言的对齐夹具（原 8 条，经对抗性审查修正为 11 条，见 §5.1）。静态层（秒级，可当 `run_gates` 用）+ `--browser` 层（Playwright 375px 实测） |
| **新增** `scripts/kit_alignment_canred.py` | 反向验证：向引擎输出注入故障，断言必须变红。它是"夹具不是摆设"的证明 |

> ⚠️ **审查修正（`docs/review-wechat-v6-adversarial.md` D-1/D-2/D-3）**：
> 原设计的 8 条断言里，**A1 对 18 套是恒真的**（19 套 JSON 全是 `left`，引擎默认也是 `left`，
> 代码删光也全绿）。这是「夹具变成摆设」的直接证据，必须在落库前修掉：
> - A1 拆成 **A1a / A1b / A1c**，其中 **A1c 是能力断言**（强制注入后测右缘），才是用户真正问的问题；
> - A7 限定在**正文元素**，否则会误伤 3 套合法的标题居中；
> - **新增 A10「改造必须真的发生」**，守住 `_guard` 静默放弃改造的坑。

**已实测通过**（预研版跑在会话临时目录，落库时按 §5 改写）：

```
19 套 × 8 条断言 = 152/152 通过（100.0%）  ← 但这 8 条里 133 条恒真，见上
反向验证 6/6 全部按预期变红：
  M0 基线 mg-ukiyoe         → 全绿（正确）
  M1 删掉 justify           → A1/A6 红
  M2 guardian 改成 justify  → A1/A6 红
  M3 破坏标签配平           → A3 红
  M4 插入 ::: 残留          → A4 红
  M5 吞掉文字               → A2 红
  M6 删掉引用块             → A5 红
```

### P1 · 对齐契约落到数据层

**先纠正一个预期**：19 套的 `styles.p.text_align` **本来就已经全部显式写着 `left`**（含 `mg-ukiyoe`）。
所以这一步不是"给 18 套补字段"，而是**只动一处真源 + 删一处硬编码**：

| 文件 | 改什么 | 注意 |
|---|---|---|
| `public/themes/mg-ukiyoe.json` | `styles.p.text_align`: `left` → **`justify`**（规范 recipes 2.7 要求两端对齐） | **唯一需要改的 JSON**；17px / 1.8 / `Songti SC` 全部保持 |
| `core/magazine_layouts.py` **:757** | **删掉** `layout_ukiyoe()` 里 `"text-align": "justify"` 的硬编码 | 删之前跑 P0 夹具记下基线；删之后必须仍全绿 |
| 其余 18 个 `mg-*.json` | **不动**（已是 `left`，与规范一致） | 只核对，不改写 |
| 其余 18 个 `layout_*` 函数（:345 起） | **不动**（都没有写 `text-align`） | 让 `styles.p.text_align` 单一说话 |

**为什么必须先删硬编码**：现状是"两套真源"——`mg-ukiyoe.json` 说 `left`，
`layout_ukiyoe()` 硬编码说 `justify`，最终产物是 `justify`（版式在注入之后覆盖）。
这种状态门禁无法判断到底哪个算准，**A1 断言会变成永远绿的空断言**。
收拢成一处后，"JSON 说 justify → 产物是 justify"才可被真正验证。

> 实测依据：`for f in public/themes/mg-*.json` 逐个读 `styles.p.text_align`，19 套**全部返回 `left`**。
> 而 `layout_ukiyoe()` 产出的 HTML 里 `text-align:justify` 出现 3 次（正文/引用/其它），
> 这正是 T0 实测时 `mg-ukiyoe` 非末行右缘就已经是 `0/0` 的原因。

### P2 · 对齐能力落地（engine）

| 文件 | 改什么 | 注意 |
|---|---|---|
| `core/format_engine.py` | 新增 `_normalize_text_align(theme)`：把 `styles.p.text_align` 归一化成白名单（`left` / `justify` / `center` / `right`），非法值回落 `left` | 放在 `inject_inline_styles()`（:2204）里、`style_map` 构建之前 |
| `core/format_engine.py` **:855 附近** | 新增 `_FORBIDDEN_TEXT_CSS` 常量，列出禁止写入产物的 4 个属性（`text-justify` / `hanging-punctuation` / `text-autospace` / `line-break`） | 仅门禁使用，不在渲染路径加运行时检查 |
| `core/magazine_layouts.py` | 确认无任何 `text-justify` / `hanging-punctuation` 写入（现状 0 处，保持） | grep 断言 |

**注意 `text_align` 与 `_WRAP_CSS` 的相互作用**：`_ensure_text_wrap()`（:2200）会给 `p` 追加
`overflow-wrap:break-word;word-break:break-word`，**它不动 `text-align`**，两者不冲突（实测确认）。

### P3 · 字号能力落地

| 文件 | 改什么 | 注意 |
|---|---|---|
| `core/format_engine.py` | 新增 `apply_font_scale(html, ratio, base)`：对 `p` / `blockquote`（自身）/ `h1`–`h6` / 正文类 `span` 缩放 | **`span` 必须白名单化**，见下方审查修正 |
| `core/format_engine.py` **:3427 附近** | `convert_markdown_to_wechat_html()` 末尾接入（layout 分发**之后**） | 必须在版式之后，否则 layout 里写死的 `font-size:16px` 会覆盖缩放 |
| `pwa/src/app.js` | 新增 `S.fontSize`（默认 = **该套正文原值**）+ `applyFontSize` 写入 theme 的运行时视图 | 走 `theme` 消息传给 worker（`engine.worker.js` 已支持"内容变了就重写"的指纹机制） |
| `pwa/index.html` | 抽屉第 4 段：滑块 + `−`/`+` + 重置 + 提示「本月正文 px · 标题 px」 | 范围 14–18；20 夹到 18 |

> ⚠️ **审查修正（review C-1 / C-2 / C-3 / C-4）—— 这三条会真的做错，必须按修正版实现**：
>
> **① 基准不能写死 15px。** 实测 19 套 `styles.p.font_size`：**14 套 16px、3 套 17px**
> （`brutal` / `deepread` / `ukiyoe`）、2 套见 ②。若 `ratio = 字号/15`，则这些套在
> 「字号=15」时会从 16/17px 缩到 15px —— **默认态就缩水，直接违反「`ratio=1` 时产物零变化」的承诺**。
> 正确做法：`base = 该套产物里 p 的实际 font-size`，`ratio = target / base`。
>
> **② 基准不能读 JSON。** 实测 `core/magazine_layouts.py` 里 **19 个 `layout_*` 全都重写了 `p` 的
> `font-size`**（19 处 `style_all(out, "p")`），且分发顺序是「注入 → 版式」，所以
> **kit 的字号真源是版式函数，不是主题 JSON**。基准必须从**版式执行后的产物**里实测。
>
> **③ `span` 不能按「有 font-size 就缩」。** 实测装饰 span 自带 `font-size`：
> **52px**（Vogue 大引号，`:586`）、**30px**（大序号，`:639`）、**22px**（强调符，`:527`）。
> 无脑缩放会让 52px 大引号在 18px 时变成 58.5px，撑破版式。
> 白名单判据：只缩「位于 `<section>` 内 且 font-size ≈ 该段正文基准（±1px）」的 span；
> 排除 `display:inline-block` 装饰、`font-size ≥ 22px`、位于 h1/h2 内的 span。
>
> **④ 同源问题**：`layout_guardian:436` 的引用块是硬编码 **19px**，JSON 写的是 15px。
> 所以 `blockquote` 的基准也必须取自产物。

### P4 · UI 结构改造（最大的一块）

| 文件 | 改什么 | 原型对应 |
|---|---|---|
| `pwa/index.html` | 抽屉改两 tab（`配色主题 N 套` / `整篇设计 M 套`，**N/M 从 `index.json` 现算，不写死**）；②③④ 折叠区；字号段进抽屉 | v7 的 `.mode-tabs` / `.sec.is-fold`；**决策 5（E-5）** |
| `pwa/index.html` **:53 附近 `#menu`** | **设置入口并入现有「⋯」菜单**（用户 2026-11-03 定），顶栏**零新增控件** | 审查 A-4 / E-1 |
| `pwa/index.html` **新增** | 设置**弹窗**（背景 / 配色微调 / 页尾 / 内容开关 / 数据）—— 线上现在**没有**这个弹窗，是全新造，不是挪现有内容 | 审查 A-4 |
| `pwa/src/app.js` **:768 `drawerCard()`** | 卡片标题条改 C 案 | C 案深墨底白字 |
| `pwa/src/app.js` **:853 `renderAllFolded()`** | **必须先排除 `kind:'kit'`**，否则切到「整篇设计」tab 后，配色 tab 底部仍重复出现 19 套 | **决策 5（E-5）** |
| `pwa/src/app.js` **:901 `renderDrawer()`** | 拆两段渲染，各自计数；收藏筛选（复用现有 `LS.fav` / `toggleFav`，**不新造**） | 定稿 §1.2 |
| `pwa/src/app.js` **:691 `renderLayouts()`** | **kit 态不渲染 8 个胶囊**，整体替换为一行状态文字「版式：整篇设计已锁定」；顺带消掉 `:596` 漏英文 id 的问题 | **决策 4（E-7 / E-8）** |
| `pwa/src/style.css` **:398 `.d-prev`** | `height:104px` → `aspect-ratio:2/1`；kit 用 `4/3` | 定稿 §1.3 |
| `pwa/src/style.css` **`.d-card-kit`** | **单独一套尺寸预算**，不与 palette 卡共用 `min-height:140px`（否则 4:3 被挤压裁掉 39–46%） | **决策 6（E-6）** |
| `pwa/src/style.css` **:407 `.d-body` / :408 `.d-name` / :414** | C 案，**按下方修正后的变量名与选择器** | 定稿 §1.5 |
| `pwa/src/app.js` **:1640 `onColor`** | 配色微调**语义改造**：从「持久化虚拟主题」改为「临时覆盖 + 切主题清空 + kit 禁用」 | 审查 A-1 |

> ⚠️ **P4 的前置事实**：`pwa/src` 目前**没有**两 tab 抽屉，也没有设置弹窗 —— 线上仍是旧结构。
> 所以 P4 是**结构改造**，不是在旧结构上打补丁——工作量最大，建议单独一个 PR。

#### P4 的四处审查修正（review B-1 / B-2 / B-3 / B-4）

**① CSS 变量名必须映射（B-1）**。方案 §1.5 给的 `var(--color-foreground)` 在线上**未定义**
（实测 `grep -c "\-\-color-" pwa/src/style.css` → **0**；线上用的是 `--text` / `--bg-canvas`）。
照抄会让背景失效，变成**白字压白底、文字消失**：

```css
/* ✅ 线上真实变量 */
.d-body{ padding:10px 12px; background:var(--text); border-top:0; }  /* --text = #191713 */
.d-name{ font:700 15px/1.3 Georgia,'Songti SC','SimSun',serif; color:var(--bg-canvas); }
.d-fav { color:rgba(247,244,238,.55); }
.d-fav[data-on="1"]{ color:#E8A08C; }
```

**② 族代表卡会被特异性覆盖（B-2）**。线上 `pwa/src/style.css:414` 有
`.d-family-card .d-name{ color:var(--accent) }`，特异性（0,2,0）高于 `.d-name`（0,1,0）——
C 案改完后，**族代表卡标题仍是朱砂 `#AF3E2B` 压深墨底 = 3.06:1，低于 4.5:1 不可读**。必须显式覆盖：

```css
.d-name, .d-family-card .d-name{ color:var(--bg-canvas); }
```

**③ `.d-card` 的尺寸预算失效（B-3）**。线上 `.d-card{min-height:140px}` 的注释明确写着
「104(图) + 32(body) = 136，留 2px → 140」。改成 `aspect-ratio:2/1` + `.d-body` 加大内边距
+ 字号 12→15px 后，这套推导**完全失效**，且 `.d-prev` 作为 flex 子项在 `min-height` 挤压下
`aspect-ratio` 会失真（浏览器已知行为）。**必须重算 `min-height` 并更新注释**，
且在「两列 1420px / 一列 / 移动端」三种宽度各量一次 `.d-prev` 实际高度。

**④ 抽屉宽度有四个数字，必须归一（B-4）**：

| 来源 | 数值 |
|---|---|
| 线上 `style.css:313` | `min(560px, 94vw)` |
| 线上 `style.css:324` browsing 态 | **500px** |
| 原型 `wechat-v7.html:61` | `--drawer-w: 520px` |
| 方案摘要「450 → 248」 | 基数 450 **与线上 500 不符** |

改法：统一为 CSS 变量 `--drawer-w`，并让 `body.browsing .stage{ padding-right:var(--drawer-w) }`
**联动**（现在 `padding-right:500px` 是写死的）。三态真值：展开 500 / 折叠 248 / 移动端 `min(560px,94vw)`。
否则折叠到 248px 时，预览区右侧会留 252px 空白。

#### P4 的配色微调：改的是语义，不是接线（review A-1）

线上**已经完整实现**了自定义配色（`CUSTOM_ID` / `LS_CUSTOM` / `customColors()` /
`syncCustomInputs()` / `onColor()` / 缓存失效 / kit 下 `toggle('locked')`），
**不是**方案说的「零监听、零读取的假控件」。

要改的是**语义**：线上是「一套持久化的虚拟主题 `__custom__`」，方案要「临时覆盖、切主题清空」。

> **用户 2026-11-03 定：已存 `LS_CUSTOM` 老数据保留，首次切换主题时才清空。**
> 实现要点：读到时**不主动删除**；`setActive()` 里发现 `activeId === CUSTOM_ID` 且发生了主题切换，
> 才 `localStorage.removeItem(LS_CUSTOM)` 并清 `customBase`。老用户打开仍看到自己的配色，
> 不突然变样。


### P5 · 资源与构建

| 文件 | 改什么 | 注意 |
|---|---|---|
| `pwa/theme-curation.json` | **给 19 套整篇设计显式分组/排序**（不能靠 `family` 为空兜底 —— 现状 19 套 `featured=false`、`family=''`，全部落进「其他风格」） | **决策 5（E-5）** |
| `pwa/scripts/build.mjs` **:317** | 确认 `kind: theme.kind === 'kit' ? 'kit' : 'palette'`、`lockedLayout` 已进 index（现状已有，核对） | 不改逻辑 |
| `pwa/scripts/build.mjs` **:377** | 确认 `kit-thumbs/*.jpg` 进包（现状已有，核对） | 19 张 480×360 |
| `scripts/gen_kit_thumbs.py` | 跑 `--force` 重生成 19 套缩略图（若 P1/P3 改了产物，缩略图必须同步） | 规格 480×360 / Q82 |
| `pwa/index.html` | 套数从 `themes/index.json` **现算**，不手写 | 定稿 §2.3 的教训（曾写死 179，实际 183） |

### P6 · 文档同步

| 文件 | 改什么 |
|---|---|
| `docs/design-wechat-v6-final.md` | §四 实现落点表更新为实际函数名；§二 补本次预研数据 |
| `STATE.md` / `README.md` / `docs/overview.md` | 套数、门禁清单 |
| `AGENTS.md` | 若新增门禁脚本，登记到"验证命令"一节 |
| `CHANGELOG.md` | 本轮记录 |

---

## 五、夹具设计：19 套 × 12 条断言

> ✅ **已实现**（2026-11-03）：`scripts/kit_alignment_fixture.py`（228/228 通过）+
> `scripts/kit_alignment_canred.py`（11 个故障注入全部变红）。
> 本节数字口径修正：原写「11 条 × 19 = 209」，实际断言行是 **12 条**（A1a/A1b/A1c/A2–A10），
> 浏览器层全开时 **12 × 19 = 228**；静态层 8 条 × 19 = 152。

### 5.1 断言表（每条都要能红）

> ⚠️ **本节经对抗性审查重写**（`docs/review-wechat-v6-adversarial.md` D-1/D-2/D-3）。
> 原设计的 8 条里，**A1 对 18 套恒真**——19 套 JSON 全是 `text_align:"left"`，
> 而引擎默认也是 left，**代码全删掉这 18 条断言依然全绿**。
> 这正是用户担心的「放上去就是摆设」，只不过摆设的是测试本身。修正如下。

**状态说明**（✅ **全部已实现并通过反向验证**，2026-11-03）：

- **228/228 通过**（12 条 × 19 套，含 `--browser`）；静态层单独跑 152/152；
- **反向验证 11/11 全部变红**：删除 justify / 强加 justify / 破配平 / 插残留 / 吞字 /
  删引用 / 写禁写属性 / 注入失效（A10 静态）/ 基线 / 注入失效（A1c 浏览器）。
- 三条曾标 ⏳ 的（A1c / A7 / A10）**全部落地**，A9 已并入 19 套循环。

| id | 断言 | 判据 | 反向验证方式 | 状态 |
|---|---|---|---|---|
| **A1a** | 浮世绘必须有 justify | `mg-ukiyoe` 产物含 `text-align:justify` | 删掉 justify → 红 | ✅ 19 套实测 |
| **A1b** | 其余 18 套不得有 justify | 产物不含 `text-align:justify` | 给 guardian 加上 → 红 | ✅ 19 套实测 |
| **A1c** | **能力断言（新增）** | 对每套**强制注入** justify 后，`--browser` 非末行右缘 ≤ 1.5px | 去掉注入 → 红 | ✅ 已实现（canred B1 验证） |
| **A2** | 不丢字 | 纯文字长度 ≥ 原输入 95% | 删 2 个 `<p>` → 红 | ✅ 19 套实测 |
| **A3** | 标签配平 | `section`/`p`/`blockquote`/`span`/`div` 开闭相等 | 删一个 `</section>` → 红 | ✅ 19 套实测 |
| **A4** | 无残留 | 输出不含 `:::` / `~~` / ` ``` ` / `None` | 插入 `:::` → 红 | ✅ 19 套实测 |
| **A5** | 结构齐全 | 夹具含 h1、h2、blockquote，输出里都还在 | 删 blockquote → 红 | ✅ 19 套实测 |
| **A6** | 对齐契约一致 | 契约与产物 `text-align` 逐套相符 | 改一套契约 → 红 | ✅ 19 套实测 |
| **A7** | 禁写属性（**限定正文**） | **仅 `<p>` 开标签**不含 `text-justify` / `hanging-punctuation` / `text-autospace` / `line-break` | 手写一个 `text-justify` → 红 | ✅ 已实现（canred M7 验证） |
| **A8** | 浏览器生效 | justify 套右缘 ≤ 1.5px；**left 套必须 > 0**；`overflowX == 0` | 删掉 justify → 红 | ✅ 19 套实测 |
| **A9** | 逐字不撑散 | 行内相邻字间距 max ≤ 1px | 加 `letter-spacing:20px` → 红 | ✅ 已并入 19 套循环 |
| **A10** | **改造必须真的发生（新增）** | 注入探针后，产物 **≠** 未注入产物 | 让 `_guard` 返回原文 → 红 | ✅ 已实现（canred M8 验证） |

**三条新增断言的用意**：

- **A1c** 测的是「19 套的 DOM 结构**能不能**两端对齐」——这才是用户问的「是否可以完整实现自动对齐」。
  A1a/A1b 测的是「当前配置对不对」，两者完全不同。
- **A7 必须限定在 `<p>`**：实测 `magazine_layouts.py:213/367/814` 有 **3 处合法的
  `text-align:center`**（数字徽标 / 时代 h1 / 某套 h2 徽标）。若按「产物不含 center」写，
  这 3 套会**误报红**，而它们的居中是完全正确的设计。
- **A10 守的是所有其他断言的前提**：`_guard`（`magazine_layouts.py:262`）在「文字变少」时会
  **静默返回原文**。一旦触发，A2–A9 全部在「没改过的产物」上跑、全绿，
  **而实际什么都没发生**——这是最难发现、也最需要防的失败模式。

> 实现 P0 时三件必做：① 把 A9 并入 19 套循环；② 给 A7 补反向验证；③ **实现 A1c 与 A10**。
> 这三件不做完，夹具就还是"部分摆设"。


### 5.2 夹具内容（一份，覆盖 4 类结构）

```markdown
# 周末去了趟海边，这次终于什么也没做

两天里我没看手机，也没带相机。风很大，但很舒服。回程路上一直在想：人为什么要那么赶？

## 第一天：什么也没做

- 坐在礁石上看了很久的海，海水的颜色从浅绿变成深蓝
- 傍晚去镇上吃饭，点了三个菜，花了一百二十八元，老板笑着说 come back tomorrow
- 回民宿的路上遇到一只很胖的橘猫

## 第二天：五点起床看日出

> 后来我才发现，那天唯一拍下的照片，是手机彻底没电之前随手按的一张。

这段话里混了 English words 和中文，还有「引号」和（括号），以及 **加粗重点**。
```

覆盖：h1 / h2 / p / 列表（会被转成 section+span）/ blockquote / strong / 中英混排 / 中文标点。

### 5.3 现有夹具的缺口（必须补）

`scripts/pwa_layout_compat_test.py` 只测 5 个版式（`LAYOUTS = ["", "rhythm", "cardflow", "outline", "magazine"]`），
**完全没覆盖 `LAYOUT_REGISTRY` 里的 19 套杂志版式**——所以它现在是绿的（100/100），
但对"19 套整篇设计"零证明力。新夹具是它的**补集**，不是替代。

### 5.4 怎么跑

```bash
# 静态层（秒级，可进 run_gates --quick）
PYTHONIOENCODING=utf-8 .venv/Scripts/python.exe scripts/kit_alignment_fixture.py

# 含浏览器实测（约 1 分钟，需 Playwright）
PYTHONIOENCODING=utf-8 .venv/Scripts/python.exe scripts/kit_alignment_fixture.py --browser

# 反向验证（证明夹具能红，改夹具后必跑）
PYTHONIOENCODING=utf-8 .venv/Scripts/python.exe scripts/kit_alignment_canred.py
```

退出码：0 全绿 / 1 有红。可直接当门禁。

---

## 六、每阶段的验证方式

| 阶段 | 验证命令 | 通过标准 |
|---|---|---|
| **P0** | `kit_alignment_fixture.py` + `kit_alignment_canred.py` | 目标 **209/209**（11 条 × 19 套）；反向 6/6 红。⚠️ **A1c / A7 / A10 三条要先实现才有 209**——现在只有 6 条是已验证的（114 条）。**A1a「18 套仍为 left」在 P0 就是绿的，这不算成绩**，有分辨力的是 A1c |
| **P1** | `kit_alignment_fixture.py`；`core/magazine_layouts.py` 删硬编码后同上 | 仍全绿。**若删硬编码后 `mg-ukiyoe` 变红，说明 JSON 没写对，回退** |
| **P2** | `kit_alignment_fixture.py --browser`；`scripts/theme_render_dump.py --diff` | 19 套全绿（含 **A1c 能力断言**）；**164 套 palette 产物逐字节不变** |
| **P3** | `kit_alignment_fixture.py`（`ratio=1` 时须零变化）；字号断言：17 套列表 span 与 p 差 ≤ 0.6px，`mg-deepread`/`mg-guardian` 用「相对差值不变」 | 19/19 列表不掉队；**`ratio=1` 时与 P2 产物逐字节相同**；装饰 span（52/30/22px）**未被缩放** |
| **P4** | `scripts/pwa_theme_drawer_test.py`；`scripts/audit_mobile_typography.py --browser` | 两 tab 计数正确（164 / 19）；折叠摘要不陈旧；**族代表卡标题对比度 ≥ 4.5:1**；`.d-prev` 在三种宽度下比例正确；无横向溢出 |
| **P5** | `node pwa/scripts/build.mjs`；`scripts/pwa_artifact_assert_test.py` | 183 套进包；19 张 kit-thumbs 存在且尺寸 480×360 |
| **P6** | `scripts/doc_sync_check.py`；`scripts/run_gates.py --quick`；`scripts/preflight.py` | 全绿；套数一致；STATE.md 一致 |
| **真机** | 人工：复制 → 粘贴 mp.weixin.qq.com → 手机微信打开 | `mg-ukiyoe` 可见两端对齐（**若被剥离，按已定案接受左对齐并记档**）；其余 18 套仍左对齐；列表字号与正文一致 |

---

## 七、文档冲突的裁决 + 已定案的两个决定

### 7.0 先裁决：`docs/mobile-typography.md` 与本次预研的冲突

`mobile-typography.md` 第 34–37 行写着两条与本轮相关的规矩：

> - **不要首行缩进**：新媒体排版共识……手机屏一行放不下几个字，缩进纯属浪费。本项目本来就没有缩进，保持。
> - **两端对齐（justify）在中文里可接受**：124 套用 justify……只要不断词就没问题。**不改**。

**裁决（以 `mobile-typography.md` 为准，本轮不改它）**：

| 项 | `mobile-typography.md` | 本轮做法 | 是否冲突 |
|---|---|---|---|
| **首行缩进 `text-indent`** | 不要，保持无缩进 | **不引入**。§2.3 虽实测 `text-indent:2em` 可用（computed 32px），但**只证明"能用"，不证明"该用"**。且 19 套 kit 里 0 套规范要求缩进 | ❌ 不冲突（本轮不做） |
| **两端对齐 `justify`** | 中文可接受，只要不断词；124 套已在用；**不改** | **不改存量**：264+149 那部分一套不动。只在 `mg-ukiyoe` 一处**按它自己的规范**确认 justify | ❌ 不冲突 |

**关键点：这两条其实都不冲突。** 之前的疑虑来自误读——
`mobile-typography.md` 说的"不改"是指**不要为了统一而批量改存量主题**，这正是本计划 §2.1 的结论
（不许 19 套一刀切）。而"不要首行缩进"本轮完全照办，`text-indent` 不写进产物。

**所以本轮的新增动作只有一处**：`mg-ukiyoe` 的 justify 从"硬编码在版式函数里"搬进它的主题 JSON（P1）。
其余 182 套主题的 `text-align` **零改动**。

### 7.1 对齐的产品形态 —— ✅ 已定案：方案 A（严格按规范）

> **用户 2026-11-03 定案：严格按规范——只有浮世绘 justify，其余 18 套 left，用户不能改。**
> 下面三方案表保留作为决策依据，实施按 A 执行。

| 方案 | 做法 | 优点 | 代价 | 状态 |
|---|---|---|---|---|
| **A** | 严格按规范：只有浮世绘 justify，其余 18 套 left。用户不能改 | 忠于 19 套各自的设计意图；零新增 UI | 用户没法"我想全篇两端对齐" | ✅ **已采纳** |
| B | 规范做默认值 + 抽屉里加一个"对齐"三选（左/两端/居中），kit 下可覆盖 | 自由度最高 | 新增第 5 个抽屉段；与"整篇设计=成套不可拆"的锁定语义冲突 | ❌ 否决 |
| C | 19 套全部 justify | 实现最省事 | **违背 18 套规范**，Vogue/新粗野的节奏被抹平 | ❌ 否决 |

**对实现的约束（P1 必须照此执行）**：

1. **抽屉里不新增任何"对齐"控件**——A 案零 UI，P4 不因此增加工作量。
2. `mg-ukiyoe.json` 写 `text_align: "justify"`，其余 18 个 `mg-*.json` **保持 `left` 不动**。
3. `layout_ukiyoe()` 的硬编码 `text-align:justify` 删除，真源收拢到 JSON。
4. 断言 A1 **双向**校验：浮世绘**必须**有 `justify`；其余 18 套**不得**有 `justify`（A6 已覆盖此语义）。
5. 用户侧**无覆盖入口**——即使将来有人想给非浮世绘套加 justify，也应由设计规范变更驱动，而不是 UI 开关。

### 7.2 字号与 kit 的关系 —— ✅ 已定案：方案 A（允许调整）

> **用户 2026-11-03 定案：kit 下允许调字号，14–18px 浮动。**

`design-kit-themes.md` §3.1 的锁定语义是"版式与配色已固定，不能再单独改"。字号属于第三条，规范没写。

| 方案 | 做法 | 状态 |
|---|---|---|
| **A** | kit 下**允许**调字号（字号是阅读舒适度，不是设计语言；14–18 的浮动不会破坏整套设计） | ✅ **已采纳** |
| B | kit 下禁用字号，与版式/配色同一条规则 | ❌ 否决 |

**对实现的约束（P3/P4 必须照此执行）**：

1. 字号滑块在 **kit（整篇设计）下可用**，不加 `disabled`；只有版式与配色仍按 kit 锁定。
2. 范围 **14–18px**，默认 15px；输入 20 夹到 18（定稿 §3.2.1）。
3. 缩放作用于「正文一组」= `p` + 列表文字 `span` + `blockquote`（**自身**），标题按 `ratio = fontSize/15` 等比——这是 §2.6 的实测要求，只改 `p` 会 18/19 掉队。
4. **`mg-deepread` / `mg-guardian` 两套例外**：其列表 span 原始 17px、正文 12/14px，比值与全局不同。处理方式是**按各自基准等比缩放**（各自乘 `ratio`），不强行拉到同一绝对值——否则会破坏这两套既定的字号梯度。P3 的字号断言对这两套放宽为"缩放前后**相对差值不变**"，其余 17 套用"差值 ≤ 0.6px"。

---

## 八、风险与不做

| 项 | 状态 / 对策 |
|---|---|
| **真机未验证** | §2.9。P6 必须做人工粘贴验收，这是唯一能证明"不是摆设"的一步 |
| `word-break:break-word` 会切断英文词 | 存量缺陷，183 套都受影响。Justify 会让断词更显眼，但**本轮不动**（改动会使 164 套产物变化，违反底线）。记档，另开一轮 |
| `mg-muji` / `mg-m2w-swiss` 从"很不齐"变"齐" | 观感变化最大，属收益，但要在真机确认不会显得"糊"（这两套底色是暖白/纯白，两端对齐后右缘更硬） |
| 浮世绘的 `Songti SC` | 微信不保证衬线字体，安卓回落 SimSun/默认。两端对齐在非衬线下依然有效（断言不依赖字体） |
| 19 套缩略图 | P1/P3 改了产物 → 缩略图必须重生成，否则卡片预览与实际不一致 |
| 移动端设计 | **不做**。用户已定"单独设计，本轮不做" |
| 小红书两个模块 | **不做**，搁置 |
| 把 19 套杂志版式混进版式条 | **不做**。版式条永远 8 项（`design-wechat-v6-final.md` §1.4） |
| 引入 `text-justify` / `hanging-punctuation` / `text-autospace` / `line-break` | **不做**。§2.3 实测全是摆设，A7 断言会拦 |
| 重做卡片标题条 | **不做**。C 案已定稿，四版演进见 §1.5，不要再动 |

---

## 九、一句话回答用户的问题

> **「19 套能不能完整实现文字自动对齐排版？」**
>
> **能，而且已经逐套验证过 19/19 全部生效。**
> 但不是"19 套统一两端对齐"——规范里只有浮世绘一套要求两端对齐，
> 其余 18 套要么明写左对齐（卫报/经济学人/宜家/深度阅读），要么规范未提。
> 按各套自己的设计规范逐套配置，才是"完整实现"；统一改成 justify 反而是违背其中 18 套。
>
> 技术上只需一行 `text-align:justify`，另外 4 类"中文排版属性"实测是摆设，写了也白写，门禁会拦。

---

*本文是 `design-wechat-v6-final.md` 的实现侧配套。方案有冲突时以方案定稿为准；技术结论以本文 §二 的实测为准。*
