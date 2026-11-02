# 19 套「整篇设计」为何与 164 套配色主题看不出区别 · 诊断与改造方案

> 状态：**诊断完成，方案待实施**。`core/` 与 `public/themes/` 本轮未改版式逻辑。
> 触发：用户 2026-11-03 反馈「新增的 19 套，和前面的 164 套没啥不同」
> 「希望你重视一下这个原本的样式设计是怎么样的，要尽量做到和其他人网站一致」

---

## 0. 一句话结论

**19 套的 `layout_*` 函数绝大多数只在「改样式」，几乎没有「造结构」。**
剥掉全部 CSS 属性后，19 套只剩 **8 种标签骨架**，其中 **8 套完全同构、5 套完全同构**。
用户看到的「没区别」是事实，不是错觉。

---

## 1. 实测证据

### 1.1 剥掉属性后的标签骨架去重（`$TMPDIR/probe_kit_skeleton.py`）

| 骨架 | 套数 | 主题 |
|---|---|---|
| **A** | **8 套** ⚠️ 完全同构 | brutal · forbes · m2w-light · m2w-swiss · m2w-tech · mori · time · ukiyoe |
| **B** | **5 套** ⚠️ 完全同构 | ikea · m2w-rational · muji · note · starbucks |
| C | 1 套 | adidas（三条纹 `<span>`×3） |
| D | 1 套 | deepread（微标「深度阅读」） |
| E | 1 套 | economist（`<section></section>` 色条 + `01` 序号） |
| F | 1 套 | guardian（眉题「观点」） |
| G | 1 套 | natgeo（`01` 序号） |
| H | 1 套 | vogue（双层 `<section>` 装饰） |

**19 套 → 8 种骨架。有 13 套和别的套长得一模一样。**

### 1.2 「造结构」vs「只改样式」的调用统计（`$TMPDIR/probe_struct_calls.py`）

| 函数 | 造结构调用 | 只改样式 |
|---|---|---|
| `layout_mori` | `style_quotes×1` | `style_all×3` |
| `layout_ukiyoe` | `style_quotes×1` | `style_all×4` |
| `layout_forbes` | `style_quotes×1, re.sub×1` | `style_all×3` |
| `layout_brutal` | `style_quotes×1, re.sub×1` | `style_all×5` |
| `layout_adidas` | `style_quotes×1, re.sub×1` | `style_all×2, style_tag×1` |
| … | … | … |

`style_all(out, "p", {...})` 这类调用**只往已有标签上贴 style 属性**，标签结构一个不变。
真正会新增/包裹标签的只有 `decorate_sections`、`re.sub`、`style_quotes` 等少数几种，
且多数只作用在一两个标签上。

### 1.3 与 su-* 的 JSON 结构对比（`$TMPDIR/probe_json_shape.py`）

| | `top_keys` | `styles` 标签数 | `layout` |
|---|---|---|---|
| `mg-*`（19 套） | `name/description/colors/styles/kind/locked_layout` | 33 | 空（靠 `locked_layout` 回填） |
| `su-*`（164 套） | `name/description/colors/styles`（部分带 `blocks`） | 36 | 空 |

**两者 styles 覆盖的标签几乎是同一套。**
`mg-*` 只比 `su-*` 少了 `h4` / `h5` / `h6`，多出的只有 `kind` 与 `locked_layout` 两个元字段。
也就是说：**kit 主题在数据层就已经和配色主题同构了**，唯一能拉开差距的就是 `layout_*` 函数，
而那个函数的产出又只差样式。

---

## 2. 根因

`mg-*` 的 `locked_layout` 会在引擎第 8 步被回填成 `theme["layout"]`：

```python
# core/format_engine.py:3559
if not theme.get("layout") and theme.get("locked_layout"):
    theme = {**theme, "layout": theme["locked_layout"]}
```

然后走 `layout_*` 函数。但 `layout_*` 的实现方式是：
**读主题配色 → 用 `style_all` 把字号/行距/颜色/边框贴到已有标签上 → 返回**。

「整篇设计」本该有**版面结构**上的差异（分栏、图文区、侧栏、卡片组、区块编号、
引文独立成块、目录、首屏区……），现在这些都没有，所以：
**换一套 kit ≈ 换一套配色 + 改几个字号**，用户当然看不出区别。

---

## 3. 与「同行网站」的差距（用户要求对齐的部分）

用户提到要看齐的同类产品（md2wechat 等）与成熟杂志排版，共性结构能力：

| 能力 | 我们现状 | 同行典型做法 |
|---|---|---|
| 首屏区（大标题+导语+栏目名） | 只有 `economist`/`deepread`/`guardian` 有微标 | 独立首屏块，明显留白带 |
| 正文分栏 | 无 | 双栏/三栏（`column-count`） |
| 图文混排区 | 无（图片按流内 `<img>`） | 图片出血、图文左右分栏、图注侧栏 |
| 区块编号 | 只有 `economist`/`natgeo` 的 `01` | 全篇统一编号系统（01/02/03 大号） |
| 引文独立块 | 都有 `style_quotes`（只改样式） | 引文拉出边界、超大引号、独立色块 |
| 卡片/区块分隔 | 无 | 卡片组、色带交替、细线分区 |
| 目录 | 无 | 自动生成目录 |

**这些正是「版面」而不是「配色」的差异来源。** 我们只做了后者。

---

## 4. 改造方案（分三步，风险递增）

### 第一步：先把「同构的 13 套」拉开（低风险，纯增量）

8 套骨架 A + 5 套骨架 B 各自内部完全同构。给每套至少加**一种独有的结构特征**：

| 主题 | 加什么结构 | 依据（recipes 文档） |
|---|---|---|
| `time` | 重点结论外包**细红框**（`<section>` 包裹） | 2.1「重点结论外面加一圈细红框 ← 最出效果的一条」 |
| `guardian` | 引用块**放大 3px** + 一像素浅灰分隔线 | 2.2「引用要放大」 |
| `natgeo` | 分隔线只画 **52px** 短横线 | 2.3「分隔线只画 52px 更自然」 |
| `economist` | 重点句**放大**而非变小 | 2.4 |
| `muji` | 强调只用于**序号与小方块** | 2.5 |
| `mori` | 标题做成**白字压豆绿圆角块**（书签感） | 2.6 |
| `ukiyoe` | 印章感靠**硬阴影**（无模糊偏移） | 2.7 |
| `vogue` | 重点**不上色**，只在下面垫一道细线 | 2.8 |
| `forbes` | 数字放大到 28–32px 当主视觉（已有）→ 补**数字独立成行** | 2.9 |
| `starbucks` | 米白做**分区**（区块底色交替） | 2.10 |
| `adidas` | 三条纹**固定识别符号**（已有）→ 补全篇三处出现 | 2.11 |
| `brutal` | **硬阴影 8px 无模糊**（是否已实现待核） | 2.12 |
| `ikea` | 黄色**只画线垫底**，一个字不写 | 2.14 |

⚠️ **关键判据**：改完后重跑骨架探针，**19 套必须得到 19 种不同骨架**。
只要还有两套同构，就还没做完。

### 第二步：引入真正的「版面」能力（中风险，需要引擎改造）

| 能力 | 落点 | 说明 |
|---|---|---|
| 首屏区 | `layout_*` 新增 `wrap_hero()` | 大标题 + 导语 + 栏目名独立成块 |
| 正文分栏 | `style_all(out, "p")` 加 `column-count` | ⚠️ 微信不支持多栏，需**实测**再定 |
| 引文拉出 | `style_quotes` 加负 margin | 需测微信编辑器兼容性 |
| 区块编号 | `decorate_sections` 扩展成统一编号器 | 已有基础 |

⚠️ **微信编辑器的 CSS 支持是硬约束**。上面每一项都必须先做兼容性实测，
不能想当然（本项目已有先例：`text-justify` / `hanging-punctuation` 等四类属性全是摆设）。

### 第三步：对齐同行（高风险，需产品决策）

目录自动生成、图文分栏、长图文卡片化等——这些会改变产物结构，
需要先确认用户是否接受「排版产物不再是纯流式 HTML」。

---

## 5. 验收标准（可执行、可回归）

1. **骨架唯一性**：`$TMPDIR/probe_kit_skeleton.py` 输出 `19 套 → 19 种骨架`。
2. **162 套配色主题零回归**：`scripts/theme_render_dump.py --diff` 应只有 `mg-*` 变化。
3. **有头夹具**：`scripts/kit_alignment_fixture.py --browser` 全绿。
4. **E2E**：`scripts/pwa_headed_full_e2e.py` 保持全绿。

---

## 6. 本轮实际完成 vs 未做

**已完成（已上线 build 400）**
- 抽屉拆「配色主题 / 整篇设计」两 tab（已定案的产品结构）
- 字号调节接线（14–18px 等比缩放，实测 p 17→15、h1 26→22.9）
- 4 套漏提交的 `mg-m2w-*` 主题补入库（此前干净 clone 会丢）
- `deploy.sh` 凭证默认路径修正（原指向别的项目）
- E2E 五处过时断言修正 → **51/51**

**未做（本方案的范围）**
- 19 套版式的结构级改造——**需要逐套改 `layout_*` 函数，属大工程**
- 首屏/分栏/图文混排等版面能力
