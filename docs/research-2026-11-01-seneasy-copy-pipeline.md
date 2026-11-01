# 句方便复制链路实测 · 完整证据（2026-11-01）

> 方法：登录后进入编辑器，**真实点击**「复制到公众号」（不是只读代码），
> 用 `navigator.clipboard.write` 钩子 + `fetch` 钩子记录它实际写入的内容与网络请求。
> 本文修正上一轮的两处判断，证据全部来自这次抓到的 **752,313 字符**真实输出 HTML。

---

## 0. 三条结论（都能证伪）

| # | 上一轮我的判断 | 本次实测 | 判定 |
|---|---|---|---|
| 1 | 「句方便把图转成 data URI，所以能粘贴」 | ✅ 成立。19/19 张图全是 `data:image/...`，0 个外链 | **维持** |
| 2 | 「他们排版更细，尤其是中文标点禁则」 | ❌ **不成立**。`line-break` / `text-indent` **0 处**，`word-break` 用的也是 `break-word` | **推翻** |
| 3 | 「句方便可能有服务端转存图床」 | ❌ **不成立**。没有任何 upload/media/cos 请求 | **推翻** |

**一句话**：他们能粘图的真正原因**只是把图转成了 data URI**，不是排版更细，也不是服务端转存。

---

## 1. 图片能粘贴的证据链

### 1.1 剪贴板实际内容

```
text/html  755,367 字节
text/plain   5,305 字节
<img> 标签  19 个
data:image  19 个   ← 全部
https: 图片  0 个
```

### 1.2 网络请求

钩 `fetch` 后全程只记录到 **1 条**图片相关请求：

```
https://images.unsplash.com/photo-1507003211169-0a1dd7228f2d?w=400
```

这是**读取原图**（Unsplash 外链），不是上传。**没有任何 upload / media / cos / oss 请求**。

### 1.3 降级路径同样内嵌

我第一轮的钩子造成 `NotAllowedError: Write permission denied`，
句方便**自动降级到「兼容模式」**（`execCommand('copy')`），仍然提示：

> 「已复制（兼容模式），可粘贴到公众号编辑器。」

**降级路径产出的 HTML 同样是 19/19 data URI。** 说明内嵌发生在「组装 HTML」阶段，
不在「写剪贴板」阶段——这也是我们该学的结构。

---

## 2. 排版细节：他们其实没比我们细

### 2.1 逐项实测（扫他们 752KB 真实输出）

| 检查项 | 句方便实测 | 我们的现状 | 差 |
|---|---|---|---|
| `line-break`（行首禁则） | **0 处** | 无 | 一样 |
| `text-indent`（首行缩进） | **0 处** | 1 套主题有 | 我们略多 |
| `word-break` | `break-word !important` | `break-word` | 一样 |
| `overflow-wrap` | `break-word !important` | `break-word` | 一样 |
| `white-space` | `nowrap`（用于 span 内联） | 无 | 他们多 |
| `text-align: justify` | 有 | 123/164 套有 | 一样 |

**结论：他们没有做中文标点禁则，也没有比我们多做什么排版优化。**

上一轮我看到截图里「标点符号是否会否出现行首禁则问题」那段文字，
**误以为那是他们的功能说明**——其实那是**测试文本的内容**（用户在测试自己的排版软件）。

### 2.2 他们比我们多做的两件小事

| 差异 | 他们的做法 | 我们的做法 |
|---|---|---|
| **`!important` 兜底** | 几乎所有关键属性都带 `!important`（如 `line-height: 30.4px !important`） | 不带 |
| **`<span leaf="">` 包裹** | 每个标题/段落内层都包一层 `<span leaf="" style="line-height:...">` | 无 |

`!important` 的作用：**防止公众号编辑器自己的样式覆盖**。这是很实用的细节，
但会导致 HTML 体积变大（他们 752KB 里很大一部分是这个）。

### 2.3 图片包装方式（值得学）

```html
<section style="margin: 28px 0; padding: 0; text-align: center; line-height: 0">
  <img src="data:image/png;base64,..." style="...">
</section>
```

**用 `<section>` 包一层，加 `line-height: 0`** —— 这是消除图片下方基线空隙的标准做法。
我们目前是裸 `<img>`，底部会有 3–5px 空白。

---

## 3. 与我们的真实差距（修正版）

| 能力 | 句方便 | 我们 | 差距性质 |
|---|---|---|---|
| 复制时内嵌图片 | ✅ 19/19 data URI | ❌ 只写 `text/html`，不转图 | **我们没做**（不是平台限制） |
| 降级路径 | ✅ execCommand 也能内嵌 | ⚠️ 降级时同样不转图 | 同上 |
| 图片 `<section>` 包裹 + `line-height:0` | ✅ | ❌ 裸 `<img>` | 小差距，易补 |
| `!important` 兜底 | ✅ 全面 | ❌ 无 | 小差距 |
| 中文标点禁则 | ❌ **都没有** | ❌ 都没有 | **无差距** |
| 排版精细度 | — | — | **基本持平** |

**所以我们真正落后的只有一件事：复制时没把图转成 data URI。**

---

## 4. 落地建议（按性价比排序）

| 顺序 | 做什么 | 收益 | 风险 |
|---|---|---|---|
| **1** | `copyRich()` 前扫描外链图 → 压缩 → 转 data URI → 再写剪贴板 | **补齐唯一的实质差距** | 中（要处理体积与超时） |
| 2 | 图片用 `<section style="line-height:0">` 包裹 | 消除底部空隙 | 低 |
| 3 | 关键属性加 `!important`（只加 `line-height` / `font-size`） | 防公众号覆盖 | 低，但会增体积 |
| ~~4~~ | ~~中文标点禁则~~ | — | **不做**：对方也没做，且微信支持度不明 |

### 4.1 压缩规格（沿用实测推算）

句方便：755 KB / 19 张 ≈ **40 KB/张**。

| 参数 | 建议值 |
|---|---|
| 最大宽度 | 1080px |
| 格式 | JPEG q=0.82（带透明的走 PNG） |
| 单张目标 | ≤ 150 KB |
| 单次总量 | ≤ 8 MB，超出提示「图太多，建议用长图导出」 |
| 并发 | 3（沿用 `images.js` 现值） |
| 超时 | 12s（沿用） |

### 4.2 代码落点

```
pwa/src/app.js:845  copyRich()
  ├─ 现在：wrapped = lastHtml → 直接写剪贴板
  └─ 改成：
       1. const imgs = scanExternalImages(lastHtml)
       2. if (imgs.length) { 显示进度 → localizeAndCompress() → 拿到新 html }
       3. 写剪贴板
       4. toast：`已复制，含 N 张图`

pwa/src/images.js:118  localizeImages()
  └─ 新增一个 compress 参数（现在是原图直转，不压缩）
```

### 4.3 需要修正的旧注释（3 处）

这三处都写着「公众号拒绝 data URI」，与实测不符，必须改：

| 文件 | 行 | 现文 |
|---|---|---|
| `pwa/src/images.js` | 5–8 | 「只认公众号图床 URL，**拒绝 data: URI**…对『直接粘贴到公众号』无效」 |
| `pwa/src/app.js` | 350 | 「事实：公众号编辑器粘贴富文本只认公众号图床，**拒绝 data: URI**」 |
| `pwa/src/app.js` | 986 | 「公众号只认图床 URL，data URI 与外链都不算『已完成』」 |

改成：「**data URI 可以随富文本粘贴**（实测句方便 19/19 内嵌图可直接粘贴）；
但体积会显著变大，所以复制前必须压缩，并对超限情况如实提示。」

---

## 5. 一处仍需你确认的事

我没法验证「**我们自己的** data URI HTML 粘进公众号后台后的最终效果」——
句方便能这么做并提示「可粘贴」，是很强的旁证，但**它不是我们的实测**。

**你验一次就够**：把我们导出的 HTML（含 data URI）粘进公众号编辑器，看图片是否出现。
如果出现 → 按 §4 实施；如果不出现 → 说明公众号对粘贴来源有额外限制，需要另想办法。

---

## 6. 复现

在 seneasy.cloud 编辑器页控制台：

```js
window.__SS_LOG__ = []; window.__SS_HTML__ = '';
const of = window.fetch;
window.fetch = function(...a){
  const u = typeof a[0] === 'string' ? a[0] : (a[0] && a[0].url) || '';
  if (/upload|media|cos|oss/i.test(u)) window.__SS_LOG__.push({ type: 'fetch', url: u });
  return of.apply(this, a);
};
const ow = navigator.clipboard.write.bind(navigator.clipboard);
navigator.clipboard.write = async function(items){
  for (const it of items) {
    const b = await it.getType('text/html');
    const s = await b.text();
    window.__SS_HTML__ = s;
    window.__SS_LOG__.push({
      size: b.size,
      imgTags: (s.match(/<img[^>]*>/g) || []).length,
      dataUri: (s.match(/src="data:image/g) || []).length,
      httpImg: (s.match(/src="https?:/g) || []).length,
    });
  }
  return ow(items);
};
// 然后点「复制到公众号」
```

本次实测输出：

```
size: 755367
imgTags: 19  dataUri: 19  httpImg: 0
line-break: 0 处   text-indent: 0 处
fetch 图片相关请求: 1 条（读原图，非上传）
```
