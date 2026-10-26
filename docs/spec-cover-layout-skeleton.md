# 版式骨架规范（Layout Skeleton Spec）

> 日期：2026-10-25　状态：**设计稿**，对应 `plan-cover-module-2026-10-25.md` 的 P1
> 原型验证：`docs/prototypes/cover-gallery.html` 里的 `skeleton()` 已是本规范的雏形

---

## 1. 为什么要有骨架

现在加一个版式 = 复制一份 66–177 行的 HTML，结构和视觉揉在一起。
后果：改一次视觉要改 N 个文件，加一个色板要改 N 个文件。

骨架化的目标是**把结构和视觉彻底分开**：

```
骨架（结构）   →  只回答「标题在哪、副标在哪、正文怎么排」
视觉（变量）   →  只回答「纸什么色、字多重、字距多宽」
```

两者通过一组固定的 CSS 类名 + CSS 变量相连。任何骨架都能配任何色板。

**12 个版式 × 10 套色板 = 120 种组合，但只需要维护 12 份骨架 + 10 份变量。**

---

## 2. 三层职责划分

| 层 | 由谁决定 | 存在形式 | 例子 |
|---|---|---|---|
| **版式骨架** | 版式 ID | JS 函数返回 HTML 字符串 | `<h1 class="title">…</h1>` |
| **视觉体系** | `data-system` | CSS 变量块 | `--w-title:500` / `--f-title:衬线` |
| **色板** | `data-theme` | CSS 变量块 | `--paper:#f3f0e8` / `--accent:#111` |

骨架**不允许**出现：具体颜色、具体字重、具体字距、具体字体名。
骨架**允许**出现：字号（因为要按内容自适应，见 §4）、结构间距、元素顺序。

---

## 3. 数据契约

骨架函数的输入：

```ts
type SkeletonData = {
  title: string;          // 已按语义断好行（含 <br>），字号已算好
  titleSize: number;      // px，由 planTitle 算出
  lead: string;
  byline: string;
  body: string[];         // 按空行切好的段落数组
  pageNo?: number;        // 多页时的当前页
  total?: number;
  eyebrow?: string;       // 小标签，如 NOTE / FEATURE
};
```

输出：一段 HTML 字符串（不是 DOM 节点），插入 `.poster` 内部。

> 为什么用字符串而不是 DOM：`engine.worker.js`（Pyodide）和 `render.js`（iframe srcdoc）
> 两条链路都吃字符串，用 DOM 会多一层序列化。

---

## 4. 字号为什么由骨架外决定

标题字号必须按**内容长度 + 可用宽度 + 字距**算，属于"排版计算"，
不属于"版式结构"。所以：

- 计算函数：`planTitle()`（详见 `cover-gallery.html` 的实现）
- 结果以 **inline style** 写在 `.title` 上：`<h1 class="title" style="font-size:147px">`
- 骨架只负责把 `titleSize` 填进去，不自己算

**踩过的坑（务必保留这段逻辑）**：

| 坑 | 现象 | 原因 |
|---|---|---|
| 字距没算进字宽 | 估算能放 7 字，实际换行成 3 行 | `charW` 必须 = `size × (1 + tracking)` |
| 兜底规则给了 40 分 | 任何位置都算"语义断点"，优先级失效 | 语义判定要用分数阈值（≥60） |
| 大字报和其他版式同字号 | 两个版式看起来一样 | 大字报要**优先字号**，其他版式**优先语义断行** |

---

## 5. DOM 契约

所有骨架必须遵守这套类名，CSS 才能统一接管。

### 5.1 必备容器

```html
<div class="inner">   <!-- 内容层，z-index 2，flex column，flex:1 -->
  …
</div>
```

### 5.2 元素类名

| 类名 | 语义 | 是否必备 |
|---|---|---|
| `.eyebrow` | 小标签（NOTE / FEATURE），元信息级 | 可选 |
| `.title` | 主标题，**必须带 inline font-size** | **必备** |
| `.lead` | 副标题 / 导语 | 可选 |
| `.byline` | 署名 | 可选 |
| `.body` | 正文段落容器（内含 `<p>`） | 按版式 |
| `.list` / `.li` / `.li .n` / `.li .tx` | 清单（衬线大号编号） | 按版式 |
| `.steps` / `.st` / `.st .k` / `.st .d` | 步骤（时间轴：竖线 + 圆点） | 按版式 |
| `.kpis` / `.kpi` | 数据塔（并列大数字） | 按版式 |
| `.mx` / `.mx .c` | 四宫格 | 按版式 |
| `.lg` / `.lg .r` / `.lg .a` / `.lg .b` | 条账（标签 / 值） | 按版式 |
| `.cmp` / `.cmp .col` | 对比（左右分栏） | 按版式 |
| `.num-mega` | 超大数字 | 按版式 |
| `.qmark` | 引号装饰 | 按版式 |
| `.accent-rule` | 强调短线 | 可选 |
| `.foot` / `.foot .pn` | 页脚（署名 + 页码） | 多页时必备 |

### 5.3 视觉由 CSS 变量接管

骨架里禁止写死这些值，全部走变量：

```
--paper --ink --muted --line --accent          （色板决定）
--f-title --f-body --f-meta                    （体系决定）
--w-title --tr-title --tr-meta                 （体系决定）
--fs-lead --fs-body --fs-meta --lh-title --lh-body
```

---

## 6. 12 个版式的骨架定义

| 版式 ID | 槽位组合 | 独有结构元素 |
|---|---|---|
| `poster` | title + lead + byline | 无（极简，靠字号和窄边距） |
| `stack` | eyebrow + title + lead(含 byline) | `.lead` 带 `border-top` |
| `image-led` | eyebrow + title + lead + byline | `.ascend` 细线 + 底图 |
| `quote` | qmark + title + lead + byline | `.qmark` 引号 |
| `number` | num-mega + title + lead | `.num-mega` 超大数字 |
| `list` | title + accent-rule + list | 衬线大号编号 |
| `compare` | title + cmp（两列） | 左右分栏 + `border-right` |
| `steps` | title + steps | 时间轴（`::before` 竖线 + 圆点） |
| `kpi` | title + kpis | 并列大数字 + `border-right` 分隔 |
| `matrix` | title + mx（2×2） | 1px 网格线 |
| `ledger` | title + lg | 行式分隔线 + 标签列 |
| `dense` | title + accent-rule + body | 可拆页（续页不重复标题） |

---

## 7. 与现有 10 套模板的关系

**不替代，先并存。**

```
现有路径：public/cover-templates/<id>/index.html   完整 HTML（结构+视觉绑死）
新增路径：skeleton(layout) + CSS 变量               结构/视觉分离
```

`render.js` 按 style 类型分流：

| style 类型 | 走哪条 |
|---|---|
| 归藏内置（editorial / swiss） | 现有 `buildGuizangHtml()` |
| 10 套 cover-templates | 现有 `prepareTemplateHtml()` |
| **新版式（12 个）** | **新路径：`skeleton()` + 变量** |

这样**现有功能零风险**，新版式走新架构。

### 迁移策略（如果要把老 10 套也收编）

分批，每批 3 个，每批都要过结构 diff：
1. `stack` / `list` / `quote`
2. `poster` / `compare` / `dense`
3. 剩余

**做不出可信的结构 diff 断言，就停止迁移**，让老模板继续走老路径。

---

## 8. 验收标准

P1 完成的判定：

1. `pwa/src/cover/layouts.js` 导出 `skeleton(layoutId, data)`，支持 12 个版式
2. 同一骨架配 10 套色板 × 2 套体系，渲染不报错、无溢出
3. `.title` 的 `font-size` 由 `planTitle()` 计算，**12 个版式全部 ≤2 行**
4. 现有 `pwa_cover_test.py` 与模板单元测试全绿（老路径不受影响）
5. 缩略图 240px 宽下，任意两个版式一眼可辨（§6.3 检查项）

---

## 9. 已知取舍

| 取舍 | 选择 | 理由 |
|---|---|---|
| 骨架返回字符串 vs DOM | 字符串 | Worker + srcdoc 两条链路都吃字符串 |
| 字号内联 vs CSS 类 | 内联 | 必须按内容长度动态算 |
| 老模板是否重构 | 先不 | 回归风险 > 收益，新版式走新路即可 |
| 是否引入模板引擎 | 不 | 手写字符串拼接足够，引入依赖反而增加构建负担 |
