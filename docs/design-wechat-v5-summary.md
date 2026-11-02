# 排版页 v5 · 设计系统与配色定稿（2026-11-02）

> **本文记录**：ui-ux-pro-max Skill 的接入、配色三方案对比、用户定稿、以及一个**未解决的技术问题**。
>
> 前置文档：`design-wechat-page-v3.md`（四段式抽屉）、`design-wechat-v4-structure.md`（两个并列 tab）、`design-wechat-layout-naming.md`（古籍命名）

---

## 一、配色定稿：保留 C（暖纸朱砂）

### 1.1 三方案对比过程

用 Skill 的 `colors.csv` 出了三套真实方案，做成并排对比页（`docs/prototypes/color-compare.html`）：

| | A 冷调 | B 暖调 | C 原版 |
|---|---|---|---|
| 来源 | Skill design-system（Productivity Tool） | Skill **Book & Reading Tracker** | 项目现有 |
| 主色 | `#0D9488` teal | `#78716C` stone | `#AF3E2B` 朱砂 |
| CTA | `#EA580C` orange | `#D97706` amber | 同主色 |
| 底色 | `#F0FDFA` | `#FFFBEB` | `#F7F4EE` |

### 1.2 用户定稿

> **选 C。书卷气最足。**

以及一条补充意见：

> **「我们原来的预览有个手机外壳的边框的，不是直接展现的，有个边框，不会很难看」**

### 1.3 我当时的推荐与理由（留档）

我推荐 A（冷调），实际理由是：

> 「整篇设计」15 套里有 **8 套本身是暖调**（无印良品 `#F8F6F1`、森系 `#FAF7F0`、浮世绘 `#F3F0E8`、笔记纸底 `#F7F8FA`…）。
> 界面底色如果也暖，用户选这些设计时会和界面糊在一起。

**用户选择 C，以用户为准。** 这个风险记在这里，如果实际使用中出现「选了整套设计但看不出边界」，可以回来参考。

### 1.4 关于手机外壳（用户明确要求保留）

原产品**不是直接把 HTML 铺在预览区**，而是包了一层手机外壳。真实实现见 `pwa/src/style.css:245`：

```css
.phone-shell {
  width: 100%; max-width: 420px; height: 100%;
  display: flex; flex-direction: column;
  background: var(--bg-raised); border: 1px solid var(--border);
  border-radius: var(--radius-xl); box-shadow: var(--shadow-lg); overflow: hidden;
}
.wx-nav {
  flex: none; display: flex; align-items: center; justify-content: space-between;
  padding: 0 14px; height: 40px; font-size: 12px; color: var(--text-soft);
  background: var(--bg-surface); border-bottom: 1px solid var(--border);
}
.wx-nav-title { font-weight: 600; max-width: 70%; text-overflow: ellipsis; white-space: nowrap; }
.preview { flex: 1; width: 100%; border: 0; background: #fff; }
```

**⚠️ 我在 v5 原型里漏了这个外壳**，直接用了白底卡片。需要补回：
- 420px 宽 + 圆角 + `shadow-lg`
- 顶部 40px 微信导航条（`‹ 标题 ⋯`）
- 手机/网页两种模式（`.preview-wrap.web .phone-shell { max-width:100%; border-radius:var(--radius) }`）

---

## 二、ui-ux-pro-max Skill 接入

### 2.1 安装结果（已验证可用）

```
.claude/skills/ui-ux-pro-max/
├─ SKILL.md                        16KB
├─ references/quick-reference.md   24KB（119 条 UX 规则全文）
├─ references/pro-rules.md         11KB
├─ scripts/search.py               9.7KB
├─ scripts/core.py                 41KB（BM25 检索引擎）
├─ scripts/design_system.py        72KB
├─ scripts/reasoning_contract.py   5.8KB
└─ data/*.csv                      1.4MB（12 个文件）
```

**安装方式**（`npx skills add` 因 GitHub 克隆超时失败，改为直接抓 raw 文件）：

```bash
BASE="https://raw.githubusercontent.com/nextlevelbuilder/ui-ux-pro-max-skill/main/.claude/skills/ui-ux-pro-max"
curl -sL -o SKILL.md "$BASE/SKILL.md"
curl -sL -o references/quick-reference.md "$BASE/references/quick-reference.md"
curl -sL -o scripts/search.py "$BASE/scripts/search.py"
# ... 其余同
```

**验证命令**：
```bash
.venv/Scripts/python.exe .claude/skills/ui-ux-pro-max/scripts/search.py \
  "editorial publishing tool writing desktop" --design-system -p "SuperSu"
```

### 2.2 设计系统已生成

`design-system/supersu/MASTER.md`（Skill 的 `--persist` 产出）

| 项 | 值 |
|---|---|
| 风格 | Minimalism & Swiss Style |
| Dials | Variance 4（平衡）/ Motion 3（克制）/ Density 6（标准） |
| 主色 | `#0D9488`（**未采用**，用户选 C） |
| 字体 | Inter |
| 间距阶梯 | `--space-xs 4` / `sm 8` / `md 16` / `lg 24` / `xl 32` / `2xl 48` |
| 阴影 | `sm 0 1px 2px` / `md 0 4px 6px` / `lg 0 10px 15px` |

**虽然配色没采用，但间距 / 阴影 / 字号 / 对齐规则仍然有价值** —— 见 §4。

### 2.3 Skill 规则里命中问题说明的几条

用户提了两个具体问题，Skill 的 119 条规则里正好有对应的：

| 用户原话 | Skill 规则 | 具体建议 |
|---|---|---|
| **左右不对齐** | `Layout / Container Width` | 「Limit max-width for text content (65-75ch)」 |
| **都是一片颜色** | `Style Selection` | 「Mixing flat & skeuomorphic randomly」 |
| 整体观感 | `Typography` | 「Base 16px, Line-height 1.5」「Text < 12px body」是反模式 |

---

## 三、15 套整篇设计的真实渲染（已完成）

### 3.1 新增脚本

`scripts/render_kit_previews.py` —— 用**和产品完全相同的引擎路径**渲染 15 套：

```python
md = preprocess(SAMPLE, 'auto')
html = convert_markdown_to_wechat_html(md, str(theme_path))
```

产物：`docs/prototypes/kit-previews/mg-*.html`（15 个自包含 HTML）+ `index.json`

### 3.2 验证：样式差异是真的

| 套 | 真实 h1 字号 | 真实配色 |
|---|---|---|
| 时代周刊 | **24px** | `#111111` + 红 `#E3120B` |
| Vogue 画报 | **34px** | 纯黑白 |
| 新粗野 | **36px** | 紫 `#7C3AED` |
| 无印良品 | 22px | 酒红 `#7F0019` |
| 浮世绘 | 26px | 靛青 `#1B3A5C` + 赭红 `#8C3A2E` |

### 3.3 ⚠️ 未解决：缩略图缩放不对

**实测现象**：15 个 iframe 全部加载成功（227×132，`contentDocument` 可读），但**看不出差异** ——
标题按桌面宽度渲染（h1 24–36px），塞进 227px 宽的卡片后标题占 3–4 行，正文全被挤没。

**根因**：渲染宽度 ≠ 展示宽度。`render_kit_previews.py` 用默认正文宽度渲染，
但卡片只有 227px。

**三个修法**（未实施）：

| 方案 | 做法 | 代价 |
|---|---|---|
| **A** 渲染时缩窄 | 给 HTML 加 `max-width: 380px` + 缩小字号 | 与真实效果有偏差 |
| **B** iframe + transform | iframe 宽设 760px，再 `transform:scale(0.3)` | 最真实，但 iframe 需要 `pointer-events:none` |
| **C** 预渲染成 PNG | 用 Playwright 截图，直接引 `<img>` | 最快最好看，但多一步构建 |

**我倾向 B**：真实、不需要额外构建步骤、且项目已有 Playwright。

---

## 四、仍然有效的设计规则（配色虽换回 C，但这些该应用）

| 规则 | 现状 | 应改成 |
|---|---|---|
| 正文 ≥ 12px | 原型里用过 5.5px / 6.5px 小字 | 最小 11px，正文 13–14px |
| 行高 ≥ 1.5 | 部分 1.35 | 正文 1.75、标题 1.35 |
| 文本限宽 65–75ch | 编辑区全宽平铺 | `max-width: 68ch` 居中 |
| 卡片网格对齐 | 三段标题与内容左缘不一致 | 统一 `padding: 0 var(--space-lg)` |
| 可见 focus ring | 无 | `:focus-visible { outline: 2px solid }` |
| 不用 emoji 当图标 | 用了 `ⓘ` `☆` | 换成 SVG（Lucide/Heroicons） |

---

## 五、原型文件清单

| 文件 | 是什么 | 状态 |
|---|---|---|
| `wechat-v3.html` | 方案 B 四段式（暖纸朱砂） | 已被 v4 取代 |
| `wechat-v4.html` | 两个并列 tab（暖纸朱砂） | 结构正确，视觉粗糙 |
| `wechat-v5.html` | 按 MASTER.md 重做（青绿） | 视觉好，但**配色要换回 C** |
| `color-compare.html` | 三配色并排对比 | 决策留档 |
| `wechat-abc.html` | A/B/C 三方案对比 | 决策留档 |
| `wechat-discovery.html` | 可发现性三方案 | 决策留档 |
| `kit-previews/` | 15 套真实引擎渲染 | HTML 已生成，**缩放未解决** |

---

## 六、下一步（按优先级）

| # | 事项 | 阻断原因 |
|---|---|---|
| **1** | 修缩略图缩放（方案 B：iframe + transform） | 无 |
| **2** | v5 换回 C 配色（暖纸朱砂）+ 补回手机外壳 | 无 |
| **3** | 抽屉三段对齐 + 间距按 §4 的表改 | 依赖 2 |
| **4** | 落地到 `pwa/src`（两个 tab + 古籍命名 + 三个预设决策） | 依赖 1–3 |

### 已定的三个功能决策（待落地）

| 项 | 用户选择 |
|---|---|
| 预设类型 | 开头 / 结尾 / 通用块 |
| 触发方式 | 两者都要（自动带出 + 手动按钮） |
| 三段式编辑 | 一起做（接受草稿格式变更） |

---

*本文基于 2026-11-02 实测。配色定稿：C 暖纸朱砂。*
