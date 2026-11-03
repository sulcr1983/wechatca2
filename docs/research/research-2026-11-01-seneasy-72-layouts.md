# 句方便 72 套版式 · 实证研究（2026-11-01）

> 方法：登录后在 dashboard 打开「选择排版主题」弹窗，用 CDP 逐个滚动到 72 张卡片，
> 读取每张卡片 `getComputedStyle` 的真实值 + 内联 HTML 结构，并对代表性主题截图。
> **不是看图猜，是读真值。** 复现步骤见 §6。

---

## 0. 先纠正我上一轮的错

上一轮我只看了句方便**首页**的 8 个主题展示区，就下了结论。这是错的 —— 首页只展示了
「默认/优雅简约/汝窑天青/杏仁奶油/北欧冰原/工程蓝图/蒸汽波复古/手账笔记」这 8 个，
**恰好是最平淡的一批**。真正的风格库有 **72 套**，而且在弹窗里是完整可读的内联 HTML。

同样是「主题」，句方便和我方（SuperSu）的差距不在数量（72 vs 164），在**手法**：

| | 句方便 72 套 | 我们 164 套 |
|---|---|---|
| 标题内嵌装饰子元素（SVG/图片/小徽标） | **20 套**（28%） | **0 套** |
| `h1` 字号跨度 | 20 – **56px** | 22px（全仓统一） |
| 正文行高跨度 | 1.58 – **2.5** | 1.75–1.9 |
| 正文对齐 | 左对齐 38 / 两端对齐 33 | 两端对齐 123 / 左 40 |
| 有独立装饰元素的「版式感」主题 | 至少 8 套（孟菲斯/新粗野/蒸汽波/黑金/悬疑档案/时尚画报/高迪/绿柳） | 0 |

---

## 1. 72 套的手法分布（真实统计）

### 1.1 `h1` 主标题

| 手法 | 套数 | 说明 |
|---|---|---|
| 左对齐 + 下边线 | 11 | 最常见的「财经/商务」底子 |
| 左对齐·纯文字 | 9 | 靠字号与字重撑场 |
| **居中 + 装饰子元素** | **8** | ★ 我们的 0 套 |
| 居中 + 下边线 | 6 | |
| 居中·纯文字 | 6 | |
| 左对齐 + 左边线 | 4 | |
| **左对齐 + 装饰子元素** | **4** | ★ |
| 居中 + 左/上/下三边线 | 3+3 | 「三边框」式标题 |
| 左/居中 + 上边线 | 2+2 | |
| 左对齐 + 阴影 | 2 | ★ 新粗野/孟菲斯的硬投影 |
| 居中 + 下边线 + 渐变 | 2 | |
| 底色 / 渐变 / 圆角 / 阴影组合 | 7 | 黑金、蒸汽波、悬疑档案 |

**关键**：`border-left` 在句方便只有 13/72 套用，且多数是 8px 粗条（瑞士国际主义）或配底色用。
**我们 164 套里 69 套 h2 用左竖条** —— 手法比人家单一得多。

### 1.2 `h2` 小标题

| 手法 | 套数 |
|---|---|
| 纯文字 | 14 |
| 左线 | 10 |
| **底块 + 圆角** | **8** |
| **★ 装饰子元素** | **7** |
| 下线 | 7 |
| 底块 | 6 |
| 下线 + ★子元素 | 4 |
| 上线 + 下线 | 4 |

### 1.3 引用块 / 正文

- 引用：**52/72 有底色**，56/72 有左线（两者常叠加）
- 正文：字体 14–21px、行高 **1.58–2.5**（跨度极大，我们锁死在 1.75–1.9）
- 只有 4 套用首行缩进（说明「不缩进」是主流）

---

## 2. 20 套「装饰子元素」到底长什么样（这是必须抄的东西）

真正把「版式感」拉开的，是**在标题文字里插入一个小装饰块**。它们全部是纯内联 HTML，
微信能接受。逐类举例（原文内联样式，可直接对照实现）：

### 2.1 眉标（kicker）—— 标题上方一行小字

```html
<!-- 无印良品风格 -->
<h1>
  <span style="display:block; margin:0 0 14px; font-size:11px; line-height:1.4;
               font-weight:700; letter-spacing:3px; color:#7F0019;">NOTES · 生活笔记</span>
  标题示例
  <span style="display:block; width:28px; height:3px; margin:16px 0 0; background-color:#7F0019;"></span>
</h1>
```
```html
<!-- 金融时报 -->
<span style="display:block; margin:0 0 14px; font-size:12px; line-height:1;
             letter-spacing:3px; font-weight:700; color:#0d7680;
             font-family:Georgia,serif;">FT · ANALYSIS</span>标题示例
```
```html
<!-- Guardian 卫报 -->
<span style="display:block; margin:0 0 10px; font-family:-apple-system,...;
             font-size:14px; line-height:1.4; font-weight:700; color:#C70000;">观点 / Opinion</span>
```
```html
<!-- 时尚画报（眉标 + 细横线 + 斜体副标，一行内三联） -->
<span style="display:block; margin:0 0 16px; font-family:Georgia,serif; font-size:13px;
             line-height:1; font-weight:700; letter-spacing:5px; color:#000;">THE EDIT
  <span style="display:inline-block; width:32px; height:1px; margin:0 12px;
               background-color:#000; vertical-align:middle;"></span>
  <span style="font-weight:400; font-style:italic; letter-spacing:1px;">...</span>
</span>
```

### 2.2 标题下装饰线（不是 border，是独立色块）

```html
<!-- 高迪·有机：6 色渐变圆头短条，居中 -->
<span style="display:block; width:120px; height:5px; margin:16px auto 0;
             border-radius:5px;
             background:linear-gradient(90deg,#ff6b6b,#ffd93d,#6bcf7f,#4ecdc4,#5b86e5,#a55eea);"></span>
```
```html
<!-- 绿柳：三个圆点由小到大排列，居中 -->
<span style="display:block; margin:14px auto 0; text-align:center; line-height:1;">
  <span style="display:inline-block; width:6px; height:6px; margin-right:6px; border-radius:50%;
               background-color:#c8e0d6; vertical-align:middle;"></span>
  <span style="display:inline-block; width:8px; height:8px; ... background-color:#77af9c; ..."></span>
  ...
</span>
```
```html
<!-- 默认公众号风格 / 北欧冰原：短粗下划条（3–4px） -->
<span style="display:block; width:60px; height:4px; margin-top:14px; background:#0057B8;"></span>
```

### 2.3 章节编号徽标（h2 前面挂一个 01/02）

```html
<!-- 知序蓝图：实心圆角方徽标 -->
<span style="display:inline-block; min-width:46px; margin:0 10px 4px 0; padding:5px 8px;
             box-sizing:border-box; color:#FFF; background-color:#2457B8;
             border-radius:7px; font-family:monospace;">01</span>
```
```html
<!-- 国家地理风：左右双线夹着的金色数字 -->
<span style="display:inline-block; margin:0 10px 0 0; padding:0 10px 0 8px;
             font-family:Georgia,serif; font-size:22px; line-height:1.15; font-weight:700;
             color:#F5B800; border-left:4px solid #F5B800; border-right:1px solid #F5B800;">01</span>
```
```html
<!-- 经济学人风：只一个红色数字，无框 -->
<span style="display:inline-block; margin:0 8px 0 0; font-family:Arial,sans-serif;
             font-size:13px; line-height:1; font-weight:800; letter-spacing:.5px;
             color:#E3120B; vertical-align:2px;">01</span>
```
```html
<!-- 无印良品：数字 + 右侧细竖线分隔 -->
<span style="display:inline-block; margin:0 10px 0 0; padding:0 10px 0 0;
             border-right:1px solid #CFC6B8; font-size:15px; font-weight:700; color:#7F0019;">01</span>
```
```html
<!-- 时尚画报：52px 斜体衬线巨号，压在小标题左侧 -->
<span style="display:inline-block; font-family:Georgia,serif; font-size:52px; line-height:1;
             font-style:italic; font-weight:400; letter-spacing:-1px; color:#000;
             vertical-align:bottom;">01</span>
```
```html
<!-- Guardian 卫报：一个小方块 -->
<span style="display:inline-block; width:10px; height:10px; margin:0 10px 0 0;
             background-color:#C70000; vertical-align:1px;"></span>
```

### 2.4 结论

**这四类装饰（眉标 / 装饰线 / 编号徽标 / 方块）都能用内联 `<span>` + `display:inline-block` + 尺寸 + 背景色实现，
全部落在微信公众号安全区（内联样式、无 position、无 `<style>`）。**

它们的共同点：**不是靠 border 画线，而是靠「一个独立的小块元素」**。
这正是我们 164 套主题的盲区 —— 我们的标题只有 `font/border/background` 三个维度，没有「插一个子元素」的能力。

---

## 3. 八个「版式感」代表（我们完全没有的类型）

| 主题 | `h1` 做法 | `h2` 做法 | 我们有无 |
|---|---|---|---|
| **新粗野主义** | 紫底色块 + **黑色硬投影**（不是柔和阴影） | 黄底色块 + 硬投影 | ❌ |
| **孟菲斯波普** | 白底 + 2px 粗黑边 + 硬投影 | 黑底色块 | ❌ |

| **黑金奢华** | 深色底 + **1px 金色内描边** + 衬线 | 金色 `border-bottom` | ❌ |
| **蒸汽波复古** | 深紫底 + 洋红霓虹字 | 青色霓虹字 | ❌ |
| **悬疑档案** | 米色底 + 红色**方框**（四边描边） | 同上缩小 | ❌ |
| **时尚画报** | 眉标 + 细线 + 52px 斜体巨号编号 | 大编号 | ❌ |
| **知序蓝图** | 居中 + **选中态光标图片** + 01 徽标 | 实心圆角方徽标 | ❌ |
| **国家地理风** | 居中衬线 + 金色双线夹编号 | 左线 + 金色数字 | ❌ |

> 我方的「钢印」族最接近新粗野主义，但它是 **3px 边框 + 4px 投影**，
> 句方便是 **实心色块 + 8px 无模糊硬投影**（`box-shadow: 8px 8px 0 #000`）。观感差距就在这里。

---

## 4. 对我们方案的修正

上一轮我提「三层模型（皮肤/钩子/版式）」，方向对，但**钩子清单错了**：
我只想到 `h2Index` / `hrHtml`，而句方便实际用的是更细的四类：

| 钩子 | 作用 | 句方便使用率 |
|---|---|---|
| `kicker` | 标题上方一行小字（栏目标签） | ≥5 套 |
| `titleMark` | 标题下装饰块（渐变色条 / 三圆点 / 短横条） | ≥6 套 |
| `h2Badge` | h2 前编号徽标（圆角方 / 双线夹 / 纯数字 / 方块） | ≥7 套 |
| `quoteDeco` | 引用块首尾装饰 | 52 套有底色可叠加 |

这四类都是**一个字符串字段 + 渲染器拼一次**，成本极低，效果最明显。

---

## 5. 72 套完整清单（按弹窗顺序）

```
0  瑞士国际主义      1  知序蓝图         2  金融时报          3  蓝雾星序
4  职场精英          5  宜家目录风        6  森系治愈          7  活力波普黄
8  苹果极简          9  默认公众号风格    10 经济学人风        11 精英咨询
12 纽约客编辑风      13 海盐清风         14 Medium 长文      15 包豪斯几何
16 杏仁奶油          17 国家地理风       18 盖茨比 Art Deco  19 汝窑天青
20 LatePost 深度     21 北欧冰原         22 无印良品风格     23 孟菲斯波普
24 敦煌飞天          25 水墨丹青         26 宇治抹茶         27 复古牛皮纸
28 波普孔印          29 浮世绘           30 港风复古         31 工程蓝图
32 暗夜赛博          33 新粗野主义       34 黑金奢华         35 蒸汽波复古
36 薄雾紫藤          37 悬疑档案         38 故宫红墙         39 时尚画报
40 8-Bit 游戏机      41 开源精神 GitHub  42 Solarized Dark   43 技术风格
44 优雅简约          45 深度阅读         46 纽约时报         47 Jony Ive
48 Claude            49 原研哉·空        50 Hische·编辑部    51 安藤·清水
52 高迪·有机         53 Guardian 卫报    54 Nikkei 日経      55 Le Monde 世界报
56 绿柳              57 mdnice蓝色增强   58 mdnice 红色增强  59 Markdown Nice 绿
60 Markdown Nice 紫  61 Markdown Nice 玫瑰 62 MN 蓝青        63 MN 山蕨
64 极客黑            65 科技蓝           66 MN 简            67 MN 河南山
68 MN 可爱绿         69 MN 橘心          70 MN 凝夜紫        71 MN 全栈蓝
```

---

## 6. 复现步骤

1. 登录 https://seneasy.cloud/dashboard
2. 点「排版风格：知序蓝图」按钮 → 弹出「选择排版主题」弹窗（**不要**看首页的 8 个展示）
3. 弹窗里有 72 张卡片，每张卡片是**完整渲染的 HTML**（h1/h2/p/blockquote/hr 都在），
   内联 style 直接可读
4. 提取手法：
   ```js
   const grid = dialog.querySelector('div[class*="auto-rows-[440px]"]');
   [...grid.children].forEach(card => card.scrollIntoView({block:'center'}));
   // 每张卡读 getComputedStyle(h1/h2/p/blockquote) + h1.innerHTML
   ```
5. 72 套的手法分布：本文 §1（脚本：读 h1/h2/p 的 border/bg/shadow/子元素数，按组合计数）
