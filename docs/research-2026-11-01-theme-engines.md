# 公众号排版主题体系 · 开源调查（2026-11-01）

> 目的：回答一个问题 —— **"很多模板只是换了个颜色"到底是普遍现象，还是我们做得差？**
> 以及：有没有成熟开源做法可以直接借鉴，让我们不必自己发明。
> 所有结论都附仓库路径与行数，可复现（§5）。

---

## 0. 结论先行

| 结论 | 证据 |
|---|---|
| **"只换颜色"是全行业通病，不是我们差** | 星数最高的三个项目（doocs/md 13.5k、md-wechat 256、MDskill-Web 165）主题引擎都**只能表达单词级 CSS 属性**，没有一家能做"章节之间怎么分隔" |
| **但有一个项目找到了正确的解法** | `laogou717/md-wechat`（MIT）给主题加了 **6 个不可见钩子**：`h1WrapOpen` / `h2WrapOpen` / `h2Index` / `hrHtml` / `bqWrapOpen` / `preHeader`。28 套主题里 **21 套用了它** —— 也就是四分之三的主题靠钩子做出了结构差异 |
| **doocs/md 的另一半解法值得抄** | 它把主题写成**真 CSS 文件**（580 行的 `default.css`），配合 `var(--md-primary-color)` 变量 + 运行时 `processCSS()` 把 `var()` 解析成字面值。主题作者能写任意 CSS，**不受 JSON 字段表限制** |
| **我们缺的正是这两样** | 我们的主题是 JSON（字段表固定）+ Python 版式函数（改版式要写 Python）—— 两头都碰不到结构 |

**一句话**：不用发明。**主题写成 CSS（doocs 的做法）+ 主题可挂结构钩子（md-wechat 的做法）**，
这两条合起来就是我们方案的骨架，而且两家都是宽松许可（WTFPL / MIT），可以直接借鉴思路。

---

## 1. doocs/md（13.5k★，WTFPL）

**定位**：公众号 Markdown 编辑器，最活跃的开源同类项目。

### 1.1 主题怎么组织

```
packages/shared/src/configs/theme-css/
  base.css        1,975 B   基础重置（容器字号/行距、emoji、表格）
  default.css    11,904 B   580 行，完整的一套"经典"主题
  grace.css       2,471 B   在 default 之上做增量覆盖
  simple.css      2,706 B   同上
```

关键点：**主题就是一段 CSS**，选择器直接写 `h1 { }` / `h2 { }` / `blockquote { }`。
不是"字段表"，作者想写 `display: table`、`box-shadow`、`text-shadow` 都可以：

```css
/* default.css —— h1 用 display:table 收缩宽度再居中，这是 JSON 字段表表达不出来的 */
h1 {
  display: table;
  padding: 0 1em;
  border-bottom: 2px solid var(--md-primary-color);
  margin: calc(2em * var(--md-block-spacing)) auto calc(1em * var(--md-block-spacing));
  font-size: calc(var(--md-font-size) * 1.2);
  text-align: center;
}
```

`grace.css` 就是在它之上改：`padding`、`border-radius: 8px`、`box-shadow`、`text-shadow`。
**"优雅"主题 = 经典主题 + 20 行覆盖**，而不是复制一份 580 行的文件。

### 1.2 变量与运行时解析（这两段可直接借鉴）

- `packages/core/src/theme/cssProcessor.ts`（84 行）：在浏览器里把 `var(--xxx)` **解析成字面值**，
  支持 fallback 与嵌套，最多迭代 10 次；然后求值 `calc()`。
  → 原因：公众号编辑器会丢弃 CSS 变量，必须展开成字面值。
- `packages/core/src/theme/cssScopeWrapper.ts`（约 60 行）：给所有选择器加 `#output` 前缀，
  顺带把旧选择器映射成新类名（`SELECTOR_MAPPING` 105 行）。
- `packages/core/src/theme/themeInjector.ts`（58 行）：只维护**一个** `<style id="md-theme">`，
  切换主题就替换 `textContent` —— 不累积、不漏删。

### 1.3 对我们的价值与边界

| | |
|---|---|
| ✅ 值得借鉴 | ① 主题 = CSS 文件，不是 JSON 字段表 ② `var()` 运行时展开 ③ 单 `<style>` 注入 ④ 主题可增量覆盖上一个 |
| ❌ 不能直接用 | 它输出的是**类选择器 + `<style>`**，而我们要**内联 style 属性**（公众号粘贴只认内联）。我们的 `core/format_engine.py` 已经在做这件事，不需要换掉 |
| 许可证 | WTFPL —— 极宽松，思路可以放心借鉴 |

---

## 2. laogou717/md-wechat（256★，MIT）★ 最有价值的发现

### 2.1 它解决的问题和我们一模一样

`src/lib/themes.js`（1,277 行）开头自己写着：

> 主题系统：少而精，每套主题对应一种内容定位（tag），**结构与气质完全不同**。

28 套主题（纸上散文 / 瑞士索引 / 夜航胶片 / 白盒展签 / 像素任务 / 疾速赛报 / 墨白 / 克莱因蓝 / 宣纸 / 莫兰迪绿 / 午夜蓝金 …）。

### 2.2 它的主题数据结构：**样式属性 + 结构钩子**

每套主题是一个函数，返回一个**样式字典**，除了常规的 `h1/h2/p/blockquote`，还多出这些：

| 钩子 | 作用 | 28 套里的使用率 |
|---|---|---|
| `h1WrapOpen` / `h1WrapClose` | 在 h1 文字**前后**插入任意 HTML | **17 套** |
| `h2WrapOpen` / `h2WrapClose` | 同上，h2 | **21 套** |
| `h2Index` | h2 开头的数字独立成视觉组件（大编号） | 3 套 |
| `hrHtml` | 用任意 HTML 替换 `<hr>`（如 `· · ·` 居中分隔） | **15 套** |
| `bqWrapOpen/Close` | 引用卡首尾注入装饰（如 `❝` / `❞`） | — |
| `preHeader` / `preLabel` / `preBody` / `preCode` | 代码块拆成四段分别上样式 | — |
| `extractH2Index` | 开关：是否把「01 标题」拆成编号 + 标题 | 3 套 |

**渲染器怎么落地**（`src/lib/renderer.js`，988 行）：

```js
// L811–826 —— 一行代码，把「结构」从主题里接出来
md.renderer.rules.heading_open = (tokens, idx) => {
  const level = Number(tokens[idx].tag.slice(1))
  const style = { 1: styles.h1, 2: styles.h2, ... }[level] || styles.h4
  const wrap = styles[`h${level}WrapOpen`] || ''          // ← 结构钩子
  const sectionIndex = level === 2 && tokens[idx].meta?.sectionIndex && styles.h2Index
    ? `<span style="${...}">${tokens[idx].meta.sectionIndex}</span>`   // ← 编号组件
    : ''
  return `<h${level} style="${style}">${sectionIndex}${wrap}`
}
```

```js
// L464–479 —— 「01 标题」拆成编号 + 标题（正则只认主题主动开启的）
if (theme.extractH2Index) {
  const match = firstText.content.match(/^(\d{1,2})[.、]?\s+(.+)$/)
  open.meta = { sectionIndex: match[1].padStart(2, '0') }
  firstText.content = match[2]
}
```

**这就是"结构层"最小的可行形态**：主题仍然是一个样式字典，但字典里**留了几个插 HTML 的口子**。

### 2.3 它还记录了公众号的硬约束（可直接抄进我们的文档）

`src/lib/themes.js` 顶部注释：

> 公众号安全区（已实测 + 资料验证）：内联样式、渐变（配纯色兜底）、box-shadow、
> border-radius、letter-spacing、flex。**禁区：position 定位、`<style>`、动画、百分比偏移。**

`src/lib/renderer.js` L477–486（**这条我们踩过但没写进规则**）：

> 微信公众号编辑器粘贴时会识别 `ul/ol/li` 并执行自己的"列表化"转换：嵌套列表会被提升为顶层列表、
> 顺序倒挂、层级全部丢失。所以改用 `section + 内联样式` 模拟列表。

（我们的 `convert_lists_to_sections` 已经这么做了，但 `AGENTS.md` 里没写"为什么"。
建议把这句补进文档，否则以后有人会"优化"回原生 `<ul>`。）

### 2.4 对我们的价值

| | |
|---|---|
| ✅ 直接借鉴 | **结构钩子模式** —— 主题里留 `xxxWrapOpen/Close` + `hrHtml`，渲染器一行接出来。这正是我们要的"结构层"，且**改动量极小** |
| ⚠️ 注意 | 它的钩子是"注入 HTML 片段"，能力有上限：做得出「编号 + 标题」，做不出「双栏并排」。所以我们还需要第二层：**版式（layout）函数** |
| 许可证 | MIT —— 思路可用；我们按"纯灵感派生"处理，不复制其 CSS 数值与文案 |

---

## 3. AIPMAndy/MDskill-Web（165★，Apache-2.0）—— 反面例证

**33 套主题**，`src/templates/index.ts`（2,010 行）。每套是一个 `TemplateStyles` 对象，字段多达 40+ 个：

```ts
export interface TemplateStyles {
  backgroundColor; maxWidth; padding;
  titleFont; titleSize; titleWeight; titleColor; titleAlign; titleMarginBottom; titleExtra?;
  h2Font; h2Size; h2Weight; h2Color; h2BorderColor?; h2MarginTop; h2MarginBottom; h2Extra?;
  ...
}
```

**关键实测**：它声明了 `titleExtra? / h2Extra? / h3Extra? / blockquoteExtra?` 四个结构钩子 ——
但 2,010 行里**一个都没被赋值**（`grep` 命中 0 处非空值）。

所以它的 33 套主题，实际差异只有：字体、字号、颜色、粗细、对齐、边距、圆角、阴影。
**这正是我们现在的问题**：钩子留了，但没人用 —— 因为留了也不知道该往里填什么。

> 反过来也说明一件事：**光有钩子不够，必须有一批"示范主题"真的用它。**
> md-wechat 之所以成，是 21/28 套都在用；MDskill-Web 之所以不成，是 0/33 在用。

---

## 4. 把三家拼起来 = 我们的方案

```
                 doocs/md              md-wechat            MDskill-Web
主题表达方式      真 CSS 文件       样式字典 + 结构钩子      40 字段的对象
结构能力          任意 CSS          钩子插 HTML（有限）      无
改版式成本        写一个 .css        给字典加一个钩子         改不了
学习门槛          要高（会 CSS）      低                      —

我们的方案：
  第 1 层  皮肤 Skin    = 今天的主题 JSON（保留 164 套，不动）
  第 2 层  钩子 Hooks   = 抄 md-wechat（h2Index / hrHtml / xxxWrapOpen）
  第 3 层  版式 Layout  = 抄 doocs 的"主题是代码"思路，但落到 Python 函数（能双栏/分节）
```

三层各管一段，**都不需要发明新东西**：

| 层 | 解决什么 | 复杂度 | 谁用 |
|---|---|---|---|
| 皮肤 | 颜色 / 字体 / 行距 | 已有 | 全部 164 套 |
| 钩子 | 「标题带编号」「分隔线是 `· · ·`」「引用带引号」这类**单点结构** | 极低（一个字符串字段 + 渲染器一行） | 大部分主题 |
| 版式 | 「章节怎么分隔」「段落是否并排」「首屏放什么」这类**整篇结构** | 中（一个函数） | 用户主动选 |

**为什么不是只做钩子？** 钩子做不出双栏（`h2WrapOpen` 没法把两个 `<p>` 并排）。
**为什么不是只做版式？** 版式做不出"这条下划线换成 `· · ·`"这种细节，而那恰恰是最多人想要的。

---

## 5. 复现命令

```bash
# 三家的许可证与星数
curl -s "https://api.github.com/repos/doocs/md"                 # WTFPL, 13497★
curl -s "https://api.github.com/repos/laogou717/md-wechat"      # MIT,   256★
curl -s "https://api.github.com/repos/AIPMAndy/MDskill-Web"     # Apache-2.0, 165★

# doocs 的主题就是 CSS
curl -s https://raw.githubusercontent.com/doocs/md/main/packages/shared/src/configs/theme-css/default.css | wc -l   # 580

# md-wechat 的结构钩子使用率
curl -s https://raw.githubusercontent.com/laogou717/md-wechat/main/src/lib/themes.js -o t.js
grep -c "h2WrapOpen:" t.js    # 21
grep -c "h1WrapOpen:" t.js    # 17
grep -c "hrHtml:"     t.js    # 15
grep -c "h2Index:"    t.js    # 3

# MDskill-Web 的钩子留了没人用
curl -s https://raw.githubusercontent.com/AIPMAndy/MDskill-Web/main/src/templates/index.ts -o t.ts
grep -c "Extra: *\`" t.ts     # 0
```

---

## 6. 没找到的（如实记录）

- 没有找到任何**开源项目**做出了「同一套主题 × 多种整篇版式（双栏 / 侧边栏 / 大编号）」的二维模型。
  doocs 有 3 套主题（各自一套 CSS），md-wechat 28 套（各自一套钩子），都是**一维**。
  → 我们的「皮肤 × 版式」二维是**新增能力**，没有现成实现可抄，需要自己写（方案 §4）。
- 没有找到公众号版式的**自动化验收**做法。三家的测试都停在"渲染出 HTML 不报错"。
  → 方案 §7 的两条产物级断言必须自己设计。
