# 字体能落地多少 · 实测（2026-11-01）

> **状态**：只做实测与结论，**未改动任何代码 / 主题 / 字体文件**。
> 起因：用户问「15 套版式的字体能不能配免费可商用的字体」。
> 结论先行：**公众号正文用不了自定义字体，但预览与导出能。** 依据在 §2。

---

## 0. 一句话结论

| 场景 | 自定义字体能否生效 | 依据 |
|---|---|---|
| **复制到公众号后读者看到** | ❌ **不能** | 公众号剥离 `@font-face` / `<style>`，正文只认内联 `font-family` |
| PWA 内**实时预览** | ✅ 能 | 页面可自行 `@font-face`（现在预览用 iframe srcdoc，也是系统字体栈，**需改才生效**） |
| 导出**长图 PNG** | ❌ **不能**（现状实测） | `export.js` 长图走同一个 `buildStandaloneHtml`，系统字体栈 |
| 导出**自包含 HTML** | ❌ **不能**（现状实测） | `export.js` 的 `buildStandaloneHtml` 写的是系统字体栈，不含 `@font-face` |
| 导出 **Markdown** | ❌ 无关 | 纯文本，无字体概念 |
| 小红书封面 / 长图文 | ✅ 已有 6 款 | 走 `fonts/cover-fonts.css`，是**唯一**已接字体的链路 |

**所以「给 15 套版式配字体」的真实收益是：预览更好看、导出图更好看。公众号正文一个字都不会变。**

---

## 1. 实测：引擎产物里到底有什么

```python
# 实测命令（venv 内）
t = ink.json
o = inject_inline_styles(md_to_html('## A\n\np1'), dict(t, layout=None))
```

| 检查项 | 结果 |
|---|---|
| 产物里有 `@font-face` | **False** |
| 产物里有 `<style>` | **False** |
| 产物里有 `<link>` | **False** |
| 产物里有 `font-family` | **True（2 处）** |
| `font-family` 的值 | `'Noto Serif SC', 'STSong', 'SimSun', serif` |

**关键区别**：

```
font-family: 'Noto Serif SC'    ← 只是一个「名字」。读者设备上有这个字体才显示，没有就退到 'STSong' / 'SimSun' / serif
@font-face { src: url(x.woff2) } ← 真正的「字体文件加载」。公众号会剥离它，写了也没用
```

我们引擎输出的是**前者**，从来没有、也不应该输出后者（对公众号链路而言）。

---

## 2. 为什么公众号不行（三条硬约束）

### 2.1 公众号编辑器剥离 `<style>` 与 `@font-face`

这是与「不认 `data:` URI 图片」同源的平台限制（`pwa/src/images.js:6` 记录过同类事实）。
粘贴富文本时，公众号只保留**内联 `style` 属性**里的内容。

### 2.2 内联 `style` 里的 `font-family` 只能写「名字」

CSS 规范如此：`font-family` 是「字体族名」，不是「字体文件地址」。
想真正加载文件必须靠 `@font-face`，而它只能写在 `<style>` 或外部 CSS 里 —— 两者都被剥离。

### 2.3 微信自带字体有哪些

> ⚠️ **本节标注为「未实测推断」**：我在本机（Windows + Chrome）无法验证 iOS / Android 微信内置字体表。
> 下面的列表是业界常见认知，**不是本项目实测结论**。落地前应在真机上验证一次。

据常见认知：
- iOS：`PingFang SC`（黑体）自带；`Songti SC`（宋体）也自带
- Android：`sans-serif` 落到各家 ROM 的黑体；**宋体通常没有**（此处需真机验证）

**如果这条成立**，则意味着一件重要的事：
今天主题里写的 `'Noto Serif SC'` 在读者手机上是**不存在**的，会一路回退：

```
'Noto Serif SC'  → 不存在
'STSong'         → 手机上不存在
'SimSun'         → Windows 字体，手机上不存在
serif            → 多数 Android 落到黑体
```

> ⚠️ 也就是说：**若上述推断成立，我们 164 套里所有「宋体主题」在安卓读者眼里其实是黑体。**
> 这不是新问题，是一直存在、且**无法通过加字体文件解决**的（原因见 §2.1）。
> **验证方式**：用 Android 真机打开线上站点，取 `getComputedStyle(p).fontFamily`
> 与 `document.fonts.check("15px 'Songti SC'")` 两项结果。

---

## 3. 现有字体资产清单（全部已合规）

`pwa/public/fonts/` 下已有 11 个 woff2 + 9 份 OFL 许可全文，**无需新增下载**：

| 字体 | 文件 | 体积 | 气质 | 许可 |
|---|---|---|---|---|
| Noto Serif SC 400/700 | `noto-serif-sc-{400,700}.woff2` | 697K + 720K | 标准宋体，衬线 | OFL 1.1 |
| Noto Sans SC 400/700 | `noto-sans-sc-{400,700}.woff2` | 539K + 553K | 标准黑体 | OFL 1.1 |
| LXGW WenKai 文楷 | `wenkai.woff2` | 887K | 手写楷体，温润书卷气 | OFL 1.1 |
| Smiley Sans 得意黑 | `smiley-sans-oblique.woff2` | 1.15M | 斜切现代，有冲击力 | OFL 1.1 |
| ZCOOL KuaiLe | `zcool-kuaile.woff2` | — | 圆润活泼 | OFL 1.1 |
| ZCOOL XiaoWei | `zcool-xiaowei.woff2` | — | 清秀细宋 | OFL 1.1 |
| Ma Shan Zheng | `mashanzheng.woff2` | 1.72M | 毛笔书法，国风 | OFL 1.1 |
| Long Cang 龙藏 | `longcang.woff2` | 1.55M | 手写随性 | OFL 1.1 |
| Zhi Mang Xing | `zhimangxing.woff2` | — | 手写自由 | OFL 1.1 |
| DM Sans / JetBrains Mono | `fonts/` 根目录 | — | 界面字体 | OFL 1.1 |

**全部是 SIL Open Font License 1.1** —— 免费商用、可嵌入、可再分发，唯一义务是**随包附上许可全文**（已经在仓库里，每款一份 `OFL-*.txt`）。

> 合规结论：**这 11 款可以直接用，不需要再找。** 若将来加新字体，同样选 OFL 1.1 即可。

---

## 4. 那 15 套版式的字体怎么配才「真有用」

**先说结论**：按 §0 的实测，字体现在**只在「小红书封面」这条链路真正生效**。
公众号排版这条链路（含预览、长图 PNG、导出 HTML）**全部是系统字体栈**。

所以给 15 套配字体，只有在这三种情况下才有意义：

| 要做的事 | 才有效果 | 工作量 |
|---|---|---|
| 只改主题 JSON 的 `font_family` | ❌ 无（仍是字体名，手机上没有就不显示） | 极小 |
| 给预览 / 导出**接上** `@font-face` | ✅ 预览和导图能看到 | 中（改 iframe 注入 + 引擎） |
| 只给**公众号**配字体 | ❌ **做不到**（平台限制，见 §2） | — |

**一句话**：想让字体真的看见，必须先给公众号排版链路接上 `@font-face`（改造 C）；
否则无论加多少字体文件，效果都只存在于「小红书封面」。

### 4.1 若要做改造 C：分两种「字体字段」

| 字段 | 用途 | 写法 | 生效范围 |
|---|---|---|---|
| `font_family`（现有） | 公众号正文的字体**名** | `'Songti SC', 'Noto Serif SC', serif` | 只有读者设备装了才生效 |
| `font_face`（新增，可选） | 预览 / 工导出时**加载**字体文件 | `noto-serif-sc`（对应 woff2） | 预览 + PNG + HTML 导出 |

**这样拆的好处**：公众号链路完全不变（继续只有名字），预览和导出才加载文件。
两条链路互不干扰，也不违反「不改现有 164 套产物」的底线。

### 4.2 15 套的气质 → 字体建议（仅预览/导出生效）

| # | 整篇设计 | 建议字体 | 理由 |
|---|---|---|---|
| 1 | 时代周刊 | **Noto Serif SC** | 新闻杂志的衬线正文 |
| 2 | 卫报 | **Noto Serif SC** | 报纸正文即衬线 |
| 3 | 经济学人 | **Noto Serif SC** | 同上 |
| 4 | 国家地理 | **Noto Serif SC** | 图文杂志，正文衬线 |
| 5 | Vogue 画报 | **Noto Serif SC** | 时尚杂志标配衬线 |
| 6 | 福布斯 | **Noto Sans SC** | 商业杂志，无衬线更利落 |
| 7 | 无印良品 | **LXGW WenKai** | 温润手写感，贴合「生活笔记」 |
| 8 | 森系 | **LXGW WenKai** | 同上，暖米底配楷体 |
| 9 | 浮世绘 | **Ma Shan Zheng** | 毛笔书法，国风 |
| 10 | 笔记纸底 | **Noto Sans SC** | 学习笔记，清晰优先 |
| 11 | 宜家目录 | **Noto Sans SC** | 目录风，无衬线 |
| 12 | 星巴克 | **Noto Sans SC** | 现代品牌感 |
| 13 | 阿迪达斯 | **Smiley Sans** | 斜切现代，有速度感 |
| 14 | 新粗野 | **Smiley Sans** | 粗野风格配冲击力字体 |
| 15 | 深度阅读 | **ZCOOL XiaoWei** | 清秀细宋，文艺长文 |

> 注：马善政 / 龙藏 / 志莽行 是**书法体**，只适合标题，不适合正文（笔画细、可读性差）。
> 上表只在「浮世绘」用马善政，且建议**只用于大标题**。

### 4.3 体积要控制

| 方案 | 增量 | 说明 |
|---|---|---|
| 全部 6 款都加载 | **约 5.5MB** | 不可接受（首屏） |
| 只加载当前主题要的那 1 款 | **0.5–1.7MB** | 可接受，且只在该版式被选中时加载 |
| 做成更小子集（只留 GB2312 一级） | 每款 ~0.5MB | 现有字体已是子集 |

**结论**：按需加载，一次只下一款。绝不预加载全部。

---

## 5. 还有一个「不花钱的收益」：系统字体栈能马上改

既然公众号正文只能靠系统字体，那**优化系统字体栈**是唯一能让公众号读者真正看到差别的办法：

```css
/* 现在（宋体主题）*/
font-family: 'Noto Serif SC', 'STSong', 'SimSun', serif;

/* 建议（补上 iOS/Android 都有的宋体名，并按平台优先）*/
font-family: 'Songti SC', 'Noto Serif CJK SC', 'Source Han Serif SC',
             'Noto Serif SC', serif;
```

`'Songti SC'` 是 iOS 自带宋体，**确实存在**；`'Noto Serif CJK SC'` 在部分 Android ROM 上有。
现在栈里排在很后面的 `'SimSun'`（Windows 字体）在手机上从来不存在。

> ⚠️ 但这**会改变 164 套的产物字节**，属于「动现有版面」，需要你另行拍板。

---

## 6. 建议的下一步（三选一，都不必现在做）

| 选项 | 做什么 | 收益 | 风险 |
|---|---|---|---|
| **A. 只做方案**（推荐） | 把 §4 的字体分配写进 `wechat/design-kit-themes.md` 作为字段定义 | 零风险，落地时照着做 | 无 |
| B. 优化系统字体栈 | 改 164 套的 `font_family` 让 iOS 真出宋体 | 公众号读者能真看到差别 | **会改现有产物**，需重跑对比度门禁 |
| C. 加 `font_face` 字段 | 15 套预览/导出加载字体 | 预览更好看 | 要改引擎 + 增加下载体积 |

**我的建议**：先做 A（写进方案），B 和 C 等你确认后再动。

---

## 7. 复现

```bash
# 验证引擎产物里没有 @font-face / <style> / <link>
.venv/Scripts/python.exe -c "import json;from pathlib import Path;from core.format_engine import md_to_html,inject_inline_styles as inj;t=json.loads(Path('public/themes/ink.json').read_text(encoding='utf-8'));o=inj(md_to_html('## A\n\np1'),dict(t,layout=None));print('font-face:', '@font-face' in o, 'style:', '<style' in o, 'link:', '<link' in o)"

# 列出已有字体与许可
ls pwa/public/fonts/cover/*.woff2 pwa/public/fonts/cover/OFL-*.txt
```
