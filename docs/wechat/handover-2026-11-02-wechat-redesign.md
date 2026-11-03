# 交接：排版页重做 · 当前状态与后续（2026-11-02）

> **给下一位接手的人 / AI 看**。本文只讲「现在在哪、什么是真的、什么是我搞错的、下一步怎么做」。
> 不写方案细节（那在别的文档里），不写版本号（那在 `STATE.md`）。

---

## 0. 一句话现状

**原型做了 5 轮，都被用户判定「不可用」。线上 `pwa/src` 一行未改。**
用户已明确：**放弃大而全原型，改成「一件事做完再验证」**。

---

## 1. 必须先看清的三件事（都是实测，不是转述）

### 1.1 线上已经有 4/8 的功能，不需要重做

我逐条对照了 `pwa/src/app.js`：

| 功能 | 线上状态 | 证据 |
|---|---|---|
| kit 锁定态（选中后版式变灰 + 说明条 + 退出记忆） | ✅ **已完整实现** | `applyKitLock()` L580、`exitKit()` L606、`LS.kitReturn` L24 |
| 段落三开关（金句/数据/提示） | ✅ 已实现 | `setBlockToggle()` L718 |
| 自定义配色（三取色器） | ✅ 已实现 | `customColors()` L297 |
| 抽屉搜索 / 族筛选 | ✅ 已实现 | `drawerFam` / `drawerQ` |
| **「两个 tab」（配色主题 / 整篇设计）** | ❌ 无 | 现在是一个 flat 列表 |
| **四段式编号标题 ①②③** | ❌ 无 | 纯 CSS 可加 |
| **底部版式行（32px）** | ❌ 无 | 要动 `.stage` grid |
| **15 项版式（古籍名）** | ❌ 只有 8 项 | `LAYOUT_OPTIONS` L663 |

**结论：4 项零成本（代码就在那），2 项低，2 项中。没有一项是「做不到」。**

### 1.2 15 套整篇设计的缩略图已能真实生成

`scripts/gen_kit_thumbs.py`（新增）—— **完全复用** `gen_theme_thumbs.py` 的做法：

```
preprocess(SAMPLE) → convert_markdown_to_wechat_html(md, theme_path)
                   → Playwright set_content + screenshot(clip 480×240)
                   → public/kit-thumbs/{id}.jpg
```

**已验证**：
- 15 套全部生成成功，0 失败
- 尺寸 480×240 RGB，与线上 `theme-thumbs` 同规格
- 两两差异 9.1%–99.6%（真实有差别，不是同一张图）
- 目视确认：时代周刊（红色圆点列表）、Vogue（衬线、34px 粗标题）、新粗野（紫色圆点）

### 1.3 15 套 kit 的真实名字（**用户还没定要不要改**）

```
阿迪达斯   新粗野   深度阅读   经济学人   福布斯
卫报       宜家目录 森系杂志   无印良品   国家地理
笔记纸底   星巴克   时代周刊   浮世绘     Vogue 画报
```

**注意**：`public/themes/mg-*.json` 里的 `name` 字段就是这些，**代码没改过**。

---

## 2. 我这几轮犯的错误（必须记下来，避免重犯）

### 错误 1：手填配色，没读设计真源

我在原型里手填了 15 套 kit 的配色，**10/15 是错的**（用户指出）。

设计真源是 `docs/wechat/design-kit-themes.md` §6 的固定配色表。
`public/themes/mg-*.json` 里的数据**完全正确**（逐字段核对通过）。

**教训**：配色/数据一律从真源读，不手抄。

### 错误 2：用 iframe 引 HTML 做缩略图

我在 v5 原型里用 `<iframe src="kit-previews/mg-*.html">`，
结果标题按桌面宽度渲染（h1 24–36px），塞进 227px 卡片后标题占 3–4 行、正文全被挤没。

**线上 `pwa/src/app.js:775` 用的是 `<img src="./theme-thumbs/{id}.jpg">`** —— 预渲染 JPG。

**教训**：先读线上怎么做的，不要发明。

### 错误 3：把「产品结构」和「视觉设计」混在一起做

- v3 改结构（四段式）→ 视觉是旧的
- v4 加 tab → 视觉粗糙
- v5 换视觉 → 配色被否，且是青绿版

**结果没有一版是「结构和视觉都对」的**，用户每次看到的都是半成品。

### 错误 4：原型用假数据

原型里的 164 套主题是**我手编的 17 个示例**，不是读 `themes/index.json`。
所以原型**从来没有反映过真实产品**。用户的「看起来没啥」是准确的。

### 错误 5：越界替用户做命名决定

我把 7 个古籍名写成「已定稿」推进文档，但**用户上一轮刚回滚过品牌名改名**
（理由：「英文的反而好看，我们开源免费不怕版权」）。

**教训**：命名是用户的决定，不是我的。

---

## 3. 名字的版权问题（用户要求查证，以下是查证结果）

> ⚠️ **我不是律师，以下不是法律意见，是公开资料 + 常识判断。**

### 3.1 权威原文（USPTO 官方，可直接复查）

**关于「免费」**：USPTO 的商标保护范围与**是否收费无关**，只看是否造成来源混淆。

> "A trademark ... **Identifies the source of your goods or services.**"
> "you don't have rights to the word or phrase in general, **only to how that word or phrase is used with your specific goods or services.**"
> —— [USPTO: What is a trademark?](https://www.uspto.gov/trademarks/basics/what-trademark)

> "...a registered trademark for the name A Good Yarn™ **for a bookstore** would prevent another company from registering the name A Good Yarn™ **for another bookstore**."
> —— [USPTO: Trademark scope of protection](https://www.uspto.gov/trademarks/basics/scope-protection)

**这两句是关键**：
- 权利范围**绑定具体商品/服务类别**（bookstore ≠ 排版工具）
- 不拥有「词本身」，只拥有「该词在你的商品上的使用」

### 3.2 套到本项目的实际判断

| 用法 | 风险判断 |
|---|---|
| 用「时代周刊」当**排版风格标签**（`mg-time` 的 `name`） | **风险低**。商品类别不同（排版工具 vs 新闻刊物），不构成来源混淆 |
| 但**没有抗辩权** | 若对方发律师函，你只能改名。**诉讼成本远高于改名成本** |
| 排版**风格/技法**本身 | **不受版权保护**。版权保护「具体表达」（HTML/CSS），不保护「思想/方法」 |
| 我没有复制对方 CSS/HTML | ✅ 项目是自研 CSS 数值 → **这块无风险** |
| 字体 / 图片 | ⚠️ **这才是真正要管的** —— 已在管（OFL 字体、Pexels） |

### 3.3 「我也没收费啊」这句话的适用范围

- **版权**上：**不成立**。免费分发受版权保护的作品同样侵权。
- **商标**上：**部分成立**。不收费降低了「商业性混淆」的可能，但不消除。

### 3.4 我的结论（供用户决策，不是替他决定）

**改名的收益**：消除一个"可能要应诉"的尾部风险，成本几乎为零。
**改名的代价**：用户明确说过「英文的反而好看」。

**这是一个「低成本保险 vs 审美偏好」的取舍，该由用户定。**

---

## 4. 用户已拍板的决定（务必按这个做）

| # | 项 | 决定 | 来源 |
|---|---|---|---|
| D-1 | 两个并列 tab（配色主题 164 / 整篇设计 15） | ✅ 要 | 用户 2026-11-02 |
| D-2 | 整篇设计模式隐藏底部版式行 | ✅ 要 | 同上 |
| D-3 | **配色保留 C（暖纸朱砂）** | ✅ 定稿 | 同上，理由「书卷气最足」 |
| D-4 | **保留手机外壳预览** | ✅ 要 | 同上，理由「有个边框，不会很难看」 |
| D-5 | 预设片段：开头 / 结尾 / **通用块** | ✅ 要 | 同上 |
| D-6 | 预设触发：**两者都要**（自动带出 + 手动按钮） | ✅ 要 | 同上 |
| D-7 | 三段式编辑（开头/正文/结尾） | ✅ **一起做**（接受草稿格式变更） | 同上 |
| D-8 | 移动端 | ⏸️ **本轮不做** | 同上 |
| D-9 | 15 套名字要不要改 | ❓ **未定** | 用户要求先查法律 |

### 4.1 手机外壳的真实实现（照抄，别发明）

`pwa/src/style.css:245`：
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
```

`pwa/index.html` 的真实结构：
```html
<div class="preview-wrap" id="preview-wrap">
  <div class="phone-shell" id="phone-shell" hidden>
    <div class="wx-nav"><span>‹</span><span class="wx-nav-title" id="wx-title">未命名</span><span>⋯</span></div>
    <iframe id="preview" class="preview" title="预览" sandbox="allow-same-origin"></iframe>
  </div>
  <div class="preview-empty" id="preview-empty">…</div>
</div>
```

⚠️ **渲染用 `srcdoc` 而不是 `contentDocument.write`**（`showPreview()` L328 有注释说明原因）。

---

## 5. 原型文件清单（现状与废弃原因）

| 文件 | 内容 | 判定 |
|---|---|---|
| `wechat-abc.html` | A/B/C 三方案对比 | 🗄️ 决策留档，不改 |
| `wechat-discovery.html` | 可发现性三方案 | 🗄️ 决策留档，不改 |
| `wechat-v3.html` | 四段式抽屉（暖纸朱砂） | ❌ **废弃**（被 v4 取代） |
| `wechat-v4.html` | 两个并列 tab（暖纸朱砂） | ⚠️ 结构对，视觉粗糙 |
| `wechat-v5.html` | 按 MASTER.md 重做 | ⚠️ 已改回暖纸朱砂 + 手机外壳 + 真缩略图，但**仍是假数据** |
| `color-compare.html` | 三配色对比 | 🗄️ 决策留档 |
| `public/kit-thumbs/*.jpg` | 15 套真引擎缩略图 | ✅ **可用产物** |

**建议**：v3/v4/v5 都不要再迭代。直接改 `pwa/src`。

---

## 6. 新增的工具与目录（都是可用的）

| 路径 | 说明 |
|---|---|
| `scripts/gen_kit_thumbs.py` | 生成 15 套真实缩略图（复用 `gen_theme_thumbs.py` 的做法） |
| `public/kit-thumbs/` | 15 个 480×240 JPG + `manifest.json` |
| `.claude/skills/ui-ux-pro-max/` | ui-ux-pro-max Skill 本体（1.6MB，**已验证可用**） |
| `design-system/supersu/MASTER.md` | Skill 生成的设计系统（**配色未采用**，但间距/阴影/字号规则有价值） |

### Skill 的用法

```bash
.venv/Scripts/python.exe .claude/skills/ui-ux-pro-max/scripts/search.py \
  "editorial publishing tool writing desktop" --design-system -p "SuperSu"

# 查具体规则
.venv/Scripts/python.exe .claude/skills/ui-ux-pro-max/scripts/search.py \
  "card grid alignment visual rhythm" --domain ux
```

### Skill 里确认有效的体验规则（配色虽换回 C，这些该应用）

| 规则 | 现状 | 应改成 |
|---|---|---|
| 正文 ≥ 12px | 原型用过 5.5px / 6.5px | 最小 11px，正文 13–14px |
| 行高 ≥ 1.5 | 部分 1.35 | 正文 1.75、标题 1.35 |
| 文本限宽 65–75ch | 编辑区全宽平铺 | `max-width: 68ch` 居中 |
| 卡片网格对齐 | 三段标题与内容左缘不一致 | 统一 `padding: 0 var(--space-lg)` |
| 可见 focus ring | 无 | `:focus-visible { outline: 2px solid }` |
| 图标不用 emoji | 用了 `ⓘ` `☆` | 换 SVG |

---

## 7. 下一步（用户已同意的新做法）

> **用户原话**：「原型图看起来没啥，但是我担心实现的时候无法做到」「整套的原型图基本上不可用」

### 7.1 新做法：一件事做完再验证

**不再画大而全的原型。** 每轮只做一件事，做完立刻构建 + 起服务 + 看真产品。

### 7.2 建议顺序

| 阶段 | 内容 | 依赖 | 可验证方式 |
|---|---|---|---|
| **P1** | 抽屉加「两个 tab」（配色主题 164 / 整篇设计 15） | 无 | `node pwa/scripts/build.mjs` + 起服务看 |
| **P2** | 15 项版式（古籍名 or 品牌名，待用户定） | P1 | 点每个版式看预览变化 |
| **P3** | 底部版式行（32px，默认收起） | P2 | 看首屏 + 抽屉隐退 |
| **P4** | 预设片段（开头/结尾/通用块） | 无（独立） | 插入 → 渲染 |
| **P5** | 三段式编辑 | P4 | 草稿格式变更需回归 |

### 7.3 每轮必须给的真实证据

- `node pwa/scripts/build.mjs` 成功
- 起服务后的**真实截图**（不是原型）
- 相关门禁：`python scripts/run_gates.py`（按改动面自动选套件）

---

## 8. 命名定稿（2026-11-02 用户拍板）

### 8.1 15 套整篇设计：**保留品牌名**

| 决定 | 保留品牌名（时代周刊 / 卫报 / Vogue 画报 / 阿迪达斯…） |
|---|---|
| 决策依据 | 看过 §3 的 USPTO 查证后自行判断 |
| 已知风险 | 商品类别不同（排版工具 vs 新闻刊物），不构成来源混淆；**但收到律师函只能改名** |
| 用户取舍 | 接受该风险 |

⚠️ **不要再劝改名。** 这是用户在看过法律查证后的明确决定。

### 8.2 7 个版式入口：**未定**

`time` / `guardian` / `economist` / `natgeo` / `vogue` / `forbes` / `adidas`
这 7 个**版式**（不是 kit）的入口名，古籍名方案（朱丝栏/天头/鱼尾/乌丝栏/版心/算经/三道）
已拟好在 `design-wechat-layout-naming.md`，**但用户未拍板**。

**注意区分**：
- **15 套 kit** = 整套设计（`mg-*.json` 的 `name`）→ **保留品牌名**
- **7 个版式** = 可自由组合的结构（`LAYOUT_OPTIONS` 的 label）→ **名字待定**

两者不冲突：kit 是「买整套」，版式是「换结构」。

---

## 9. 文档索引（这一轮产生的）

| 文件 | 内容 | 状态 |
|---|---|---|
| `design-wechat-page-v3.md` | 四段式抽屉方案 | 结构部分仍有效 |
| `design-wechat-v4-structure.md` | 两个并列 tab（纠正「降为子选项」） | **核心决策，仍有效** |
| `design-wechat-layout-naming.md` | 7 个古籍命名（汉典核实） | 命名待 U-2 定 |
| `design-wechat-v5-summary.md` | Skill 接入 + 配色对比 + 未解决问题 | 部分过期（配色已定 C） |
| `requirements-three-modules.md` | 三模块需求梳理 | 仍有效 |
| **本文** | 当前状态与后续 | **接手第一份读这个** |

---

*本文基于 2026-11-02 源码与实测。若有冲突，以代码为准。*
