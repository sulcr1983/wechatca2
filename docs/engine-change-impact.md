# 引擎三处改动：影响面与回归风险（实施方案）

> 状态：**方案文档**，`core/`、`pwa/src/`、`public/themes/` 一个字未改。
> 目标：给用户三项「运行时」能力，同时保证**不传参数时 164 套主题产物逐字节不变**。
>
> 三项：
> 1. **背景独立** —— 单独覆盖整页背景色 / 纹理，不改主题 JSON
> 2. **正文字号覆盖** —— 运行时把正文调到 14–18px，存本机
> 3. **首段导语** —— 给第一个 `<p>` 加浅色底
>
> 配套：[`design-engine-optimization.md`](design-engine-optimization.md)（引擎改造方法论）、
> [`design-kit-themes.md`](design-kit-themes.md)（kit 锁定语义）、
> [`mobile-typography.md`](mobile-typography.md)（375px 判据）

---

## 0. 一页纸结论

| 项 | 决定 | 为什么 |
|---|---|---|
| 参数怎么传 | **写进 theme JSON 顶层字段**，不改 `convert_markdown_to_wechat_html` 签名 | `layout` / `blocks` 已经是这条路（见 §1.1），零新增管线、零改 `engine.worker.js` |
| 落点（背景） | `inject_inline_styles` 第 8.1 步（L2406-2418）+ **card 分支同步**（L2408-2416） | card 布局**重写** wrapper，不处理就「改了没反应」 |
| 落点（字号） | style_map 构建处（L2211-2216）**改 props**，不是在产物上做字符串替换 | 深色模式靠 `style="{完整样式串}"` 精确 replace（L1180），动产物必打掉 `data-darkmode-*` |
| 落点（导语） | 第 7.9 步之后、第 8 步之前（L2385 与 L2387 之间） | 要赶在布局分发前，否则被 card/hero 包进卡片或深色区 |
| kit（`mg-*`） | **三项全部跳过**，靠 `theme["kind"] == "kit"` | kit 的承诺是「版式与配色锁死」，见 `design-kit-themes.md` §3.1 |
| 硬底线 | 三项都不传 → `theme_render_dump.py --diff` **零差异** | 这是唯一能证明「没碰坏 164 套」的机检 |

---

## 1. 公共前提（三项都依赖，先定死）

### 1.1 唯一入口与调用链

```
PWA:  app.js doRender() → engine.setTheme(id, json) → worker 写 /home/pyodide/active-theme.json
      → engine.render(text, mode) → format_engine.convert_markdown_to_wechat_html(md, theme_path)
```

- `core/format_engine.py:3416-3440` —— `convert_markdown_to_wechat_html(markdown_text, theme_path)`
- `pwa/src/engine.worker.js:134-142` —— `_render(raw_text, theme_path, mode)` 就一行转调用
- `pwa/src/bridge.js:94-104` —— `render(text, mode)` 只发 `{ id, text, mode }`

**结论：改函数签名要连改 3 个文件（含 Worker 里的 Python 字符串），且要处理 Pyodide 侧的 JSON 化参数。**
收益很低 —— 现有 `layout` / `blocks` 两个运行时覆盖就是**塞进主题 JSON** 做的：

```js
// pwa/src/app.js:269-281（loadThemeJson，普通主题分支）
const layoutOv = lsGet(LS.layout, {});
if (layoutOv[id] !== undefined) { ... json.layout = layoutOv[id]; }
const blocksOv = lsGet(LS.blocks, {});
if (blocksOv[id]) { ... json.blocks = blocksOv[id]; }
```

新三项照抄这个模式即可（localStorage 键沿用 `supersu.` 前缀，`clearSupersuStorage()` 自动覆盖，
见 `pwa/src/app.js:44-66`）。

### 1.2 「不传 = 字节不变」的唯一正确写法

三条铁律，缺一条就会破功：

1. **默认路径必须提前 return，且返回同一个对象**（不 deepcopy、不重建 dict）。
   `build_style_string()`（L839-848）是按 `props.items()` 顺序拼字符串，
   dict 一旦重建、键序变了，`style="..."` 就变，产物就不再逐字节一致。
2. **改 props，不改已拼好的 style 字符串**。原因见 §3.3（深色模式精确匹配）。
3. **不要给 theme 加默认值**。`theme.get("type_opts")` 取不到时走原分支，
   绝不能写成 `theme.setdefault("type_opts", {...})` —— 那样所有主题都会多一个字段，
   `applyCustomColors`（`app.js:305-327`）的 walk 会在未来某天扫到它。

### 1.3 kit 的判定真源

`public/themes/mg-time.json:4-5`：

```json
"kind": "kit",
"locked_layout": "time",
```

- 引擎侧判 `theme.get("kind") == "kit"` —— **不要按 id 前缀 `mg-` 判**，引擎拿不到 id
  （只有 `theme_path`，而 Pyodide 里路径恒为 `/home/pyodide/active-theme.json`）。
- `pwa/src/app.js:492-497` 的 `themeMeta()` 已有 kit 分支，UI 侧判定沿用那里。
- kit 列表的单一真源是 `public/themes/mg-*.json`（15 套，见 `design-kit-themes.md` §6）。

---

## 2. 改动一：背景独立（整页背景色 / 纹理）

### 2.1 现状代码位置

| 位置 | 作用 |
|---|---|
| `core/format_engine.py:2204-2216` | `inject_inline_styles` 开头，`style_map["wrapper"]` 由 `theme["styles"]["wrapper"]` 拼出 |
| `core/format_engine.py:2406-2418` | **第 8.1 步**：`if "wrapper" in style_map and not skip_wrapper:` → 整篇包一层 `<section>` |
| `core/format_engine.py:2408-2416` | **card 布局特例**：`wrapper` 被**重写**成 `padding:40px 10px;background-color:{card_bg};display:flex;...`，`style_map["wrapper"]` 完全不用 |
| `core/format_engine.py:3252-3254` / `3437` | 调用方；脚注二次注入带 `skip_wrapper=True` |
| 数据侧 | `styles.wrapper = {background_color, padding, font_family}`，抽查 3 套都有（`mg-time.json:16-19`、`su-biz-azure.json:14-18`、`warm-card.json:14-17`） |

⚠️ 两个必须知道的坑：

1. **`skip_wrapper=True` 时 8.1 整段跳过**（脚注）。用户的背景覆盖也会一起消失 —— 这是对的（脚注不该再包一层），但要在文档里写清，否则会有人报「脚注没背景」。
2. **card 布局压根不读 `style_map["wrapper"]`**。只在 8.1 的 `else` 分支加逻辑，会让「用户选了卡片组 + 自定义背景」表现为**完全没反应**。

### 2.2 最小改动方案（伪代码）

新增两个纯函数，只做「配置解析」，不碰 HTML：

```python
# 新增，放在 _wrap_card_sections 附近
_BG_SAFE_PATTERN = re.compile(
    r"^(linear-gradient|radial-gradient|repeating-linear-gradient|repeating-radial-gradient)\(.*\)$"
)


def _user_page_bg(theme: dict):
    """读取用户整页背景覆盖；没配或 kit 主题一律返回 None（→ 走原分支，字节不变）"""
    if theme.get("kind") == "kit":
        return None                       # kit 配色锁死，不接受单页覆盖
    cfg = theme.get("page_bg") or {}
    color = (cfg.get("color") or "").strip()
    image = (cfg.get("image") or "").strip()
    if not color and not image:
        return None                       # ← 默认路径，后续代码一行都不执行
    out = {}
    if color:
        out["background_color"] = color
    if image and _BG_SAFE_PATTERN.match(image):
        # 只认 CSS 渐变：url() 外链背景图在公众号会被过滤（图片必须进正文才可靠）；
        # 164 套里已有 background-size:100% 1px 的渐变细线先例（focus-gold / focus-red）
        out["background_image"] = image
        out["background_size"] = cfg.get("size") or "auto"
        out["background_repeat"] = cfg.get("repeat") or "repeat"
    return out or None
```

第 8.1 步改成（**两个变体，先实测再选**，见下方）：

```python
    # === 8.1 处理 wrapper（整体背景色，用于 dark/retro 等主题）===
    if "wrapper" in style_map and not skip_wrapper:
        _ubg = _user_page_bg(theme)                    # 新增：取不到就是 None
        if theme.get("layout") == "card":
            _card_cfg = theme.get("card") or {}
            card_bg = ((_ubg or {}).get("background_color")
                       or _card_cfg.get("bg")
                       or (theme.get("colors") or {}).get("bg")
                       or theme.get("background") or "#ffffff")
            wrapper_s = (f'padding:40px 10px;background-color:{card_bg};'
                         f'display:flex;flex-direction:column;align-items:center;gap:40px')
            if _ubg and _ubg.get("background_image"):  # 纹理在 card 下同样要补
                wrapper_s += (f';background-image:{_ubg["background_image"]}'
                              f';background-size:{_ubg["background_size"]}'
                              f';background-repeat:{_ubg["background_repeat"]}')
            html = f'<section style="{wrapper_s}">{html}</section>'
        else:
            html = f'<section style="{style_map["wrapper"]}">{html}</section>'   # 原样
```

而「非 card 的覆盖」有两条落法：

**变体 A（局部改产物）** —— 在 8.1 的 else 里，直接重建串：

```python
        else:
            if _ubg:
                _w = _style_dict(style_map["wrapper"])   # 复用 L917 的解析器
                _w.update(_ubg)
                html = f'<section style="{_style_str(_w)}">{html}</section>'
            else:
                html = f'<section style="{style_map["wrapper"]}">{html}</section>'
```

**变体 B（改 style_map）** —— 在**第 9 步之前**把覆盖并进 `style_map["wrapper"]`：

```python
    # 放在第 8.1 之前、第 9 步之前
    _ubg = _user_page_bg(theme) if not skip_wrapper else None
    if _ubg and theme.get("layout") != "card":
        _w = _style_dict(style_map["wrapper"])
        _w.update(_ubg)
        style_map["wrapper"] = _style_str(_w)
```

**为什么要区分这两个变体** —— 第 9 步 `inject_dark_mode_attrs`（L1180）是：

```python
html = html.replace(f'style="{style_str}"', f'style="{style_str}" {dark_attr_str}')
```

它用 `style_map[tag]` 去**精确匹配整个 style 串**。
- 主题没有 `dark_mode.wrapper` → 两种变体等价，选 A（改动更局部）。
- 主题有 `dark_mode.wrapper` → 变体 A 会让产物串 ≠ `style_map` 串，`data-darkmode-*` 注射不进 → **静默失效**；必须用变体 B。

**实施前先跑这条实测（决定用哪个）**：

```bash
.venv/Scripts/python.exe -c "import json,glob;print([p for p in glob.glob('public/themes/*.json') if 'wrapper' in (json.load(open(p,encoding='utf-8')).get('dark_mode') or {})])"
```

输出 `[]` → 用变体 A；非空 → 用变体 B。

### 2.3 kit（`mg-*`）怎么禁用

- **引擎层**：`_user_page_bg` 第一行 `if theme.get("kind") == "kit": return None` —— 这是一道硬闸，即使用户 localStorage 里残留了覆盖值也不会生效。
- **UI 层**：`pwa/src/app.js:580-608` 的 `applyKitLock()` 目前锁 4 件事（版式胶囊 / 说明条 / 色卡区 / 自定义配色）。新控件必须加**第 ⑤ 条**，把「页面背景」这一块整体置灰：

```js
  // ⑤ 页面背景（新增）
  const bg = $('drawer-pagebg');
  if (bg) bg.classList.toggle('locked', isKit);
```

否则会出现「kit 下控件可点、点了没变化」——正是 `design-kit-themes.md` §3.1 记录过的那种「用户判定坏了」的场景。

⚠️ 禁用的是**用户覆盖**，不是主题自带值：kit 主题自己也声明了 `styles.wrapper.background_color`（`mg-time.json:17` 是 `#FFFFFF`），那部分照常生效。

### 2.4 回归风险点与验证命令

| 风险 | 后果 | 阻断方式 |
|---|---|---|
| 不传覆盖时也走了新分支 | 164 套产物全变 | `_user_page_bg` 返回 None 时**不进任何新代码路径**；dump 必须零差异 |
| card 分支漏处理 | 「卡片组 + 自定义背景」静默失效 | `pwa_layout_compat_test.py` 补一条 card × page_bg 断言 |
| 深色模式精确匹配失配 | 22 套主题 `data-darkmode-*` 消失 | 按 §2.2 的实测二选一；dump 走完整 `inject_inline_styles`（含第 9 步）能覆盖 |
| `url()` 纹理被微信过滤 | 用户看到「设了没效果」 | `_BG_SAFE_PATTERN` 白名单只放渐变；UI 只给「无 / 细网格 / 纸纹 / 渐变」预设，不给自由输入 |
| 脚注也套背景 | 脚注区出现色块断层 | 8.1 已被 `skip_wrapper` 挡住，无需额外处理；但**写进文档** |

**证明「164 套不变」的命令（三项共用，改前改后各跑一次）**：

```bash
# ① 主判据：逐字节
.venv/Scripts/python.exe scripts/theme_render_dump.py --out output/rd-before.json
#   … 改代码 …
.venv/Scripts/python.exe scripts/theme_render_dump.py --out output/rd-after.json
.venv/Scripts/python.exe scripts/theme_render_dump.py --diff output/rd-before.json output/rd-after.json
#   期望输出：「对比 164 套：产物有变化 0 套」

# ② 反向验证（证明判据不是恒绿）：把 _user_page_bg 的
#    `if not color and not image: return None` 临时改成 `return {"background_color": "#FFFFFF"}`
#    → 上面 diff 必须报 164 套全变。验完立刻改回。

# ③ 渲染结构 + 对比度 + 移动端
.venv/Scripts/python.exe scripts/theme_stress_audit.py --only render
.venv/Scripts/python.exe scripts/theme_contrast_audit.py
.venv/Scripts/python.exe scripts/audit_mobile_typography.py

# ④ 版式矩阵（dump 不含 layout，card/hero 必须靠这个）
.venv/Scripts/python.exe scripts/pwa_layout_compat_test.py

# ⑤ 全量门禁 + 构建
node pwa/scripts/build.mjs
.venv/Scripts/python.exe scripts/run_gates.py --local
```

### 2.5 与其他功能的冲突

| 功能 | 冲突 | 处理 |
|---|---|---|
| **card 布局** | wrapper 被重写，覆盖会失效 | 已在 §2.2 里同步处理 |
| **hero 布局** | 不受影响（hero 不碰 wrapper） | ✅ 但 hero 的 `dark_header` 自带深底色，用户又设整页底色时可能撞色 —— 属审美，不阻断 |
| **自定义配色**（`applyCustomColors`） | 用户选「自定义配色」时 `colors.background` 被换 → `styles.wrapper.background_color` 被 walk 一起换掉 | 与本改动**同向**（都改底色）。若同时设了 page_bg，page_bg 优先（8.1 覆盖更晚）。要在文档里写清优先级 |
| **段落色块**（`apply_paragraph_blocks`） | 无（只由 `theme.blocks` 驱动） | ✅ |
| **`heading_align: design` 逃生口** | 无 | ✅ |
| **脚注** | `skip_wrapper=True` → 覆盖不生效 | 设计如此，写进文档 |
| **kit 主题** | 违反锁死承诺 | 引擎 + UI 双闸（§2.3） |
| **轻量预览**（`pwa/src/light.js`） | `cssFromStyles()` 只把 `styles.wrapper` 翻成 `body{...}`，读不到 `theme.page_bg` | 引擎就绪前的 2s 近似版不显示自定义背景 —— 按既有取舍接受（`AGENTS §10`「近似版不解锁复制」同源），**不要在 light.js 再实现一遍** |

---

## 3. 改动二：正文字号覆盖（14–18px，存本机）

### 3.1 现状代码位置

| 位置 | 作用 |
|---|---|
| `scripts/build_themes.py:75-78` | `SCALE = {"h1":22,"h2":18,"h3":16,"h4":15,"h5":14,"h6":13,"p":15,"small":13,"code":13.5}` —— **生成期**全局标尺，只影响 119 套 `su-*` |
| `scripts/build_themes.py:538-540` | `styles.p.font_size = f"{SCALE['p']}px"` |
| `scripts/build_themes.py:604-605` | `styles.list_item_text.font_size = f"{SCALE['p']}px"`（与 p 同源） |
| `scripts/build_themes.py:547-556` | `blockquote.font_size = "15px"` 字面量、`blockquote_p.font_size = "15px"` 字面量（**不跟 SCALE 走**） |
| `core/format_engine.py:2211-2216` | `style_map` 由 `theme["styles"]` 逐键 `build_style_string` 拼出 |
| `core/format_engine.py:2220` + `866-895` | `_ensure_text_wrap(style_map)` 给 p 等补 `overflow-wrap`（**在 style_map 之后**） |
| `core/format_engine.py:2433-2494` | `convert_lists_to_sections` 读 `style_map["list_item_text"]`（L2438） |
| `core/format_engine.py:2228-2241` | blockquote 内 `<p>` 用 `style_map["blockquote_p"]` |
| `core/format_engine.py:2298-2323` | `simple_tags` 循环注入 `<p style="{style_map['p']}">` |
| `core/format_engine.py:1160-1184` | `inject_dark_mode_attrs` 用 `html.replace(f'style="{style_str}"', ...)` 定位 |

⚠️ **45 套早期原创主题不在 `build_themes.py` 里**（`AGENTS §10` 明示：非 spec 驱动、以后再调要看 JSON）。
但它们同样有 `styles.p.font_size`，所以运行时覆盖对 164 套**一视同仁** —— 这正是「运行时覆盖」比「改 SCALE 重生成」更合适的原因。

### 3.2 只改 p，还是连带 list_item_text / blockquote_p？

**建议：连带 `list_item_text` 和 `blockquote_p`，就这三个。**

理由（可验证）：这三者构成「正文层级」，同屏出现的机会最高：

| 键 | 是否联动 | 依据 |
|---|---|---|
| `p` | ✅ 必改 | 用户诉求本体 |
| `list_item_text` | ✅ 改 | 列表正文与段落正文**同一段落流**，只改一个会出现「段落 18px / 列表 15px」的断档。且 `build_themes.py:604` 本就与 p 同源 |
| `blockquote_p` | ✅ 改 | 引用内正文同上；但**引用块外框（`blockquote`）不动**，保留「引用小一档」的设计意图 |
| `callout_content` / `td` / `th` / `footnote_item` / `code` | ❌ 不改 | 附属层级。`td/th` 是 14px 密排，放大到 18px 会让 5 列表格在 375px 下溢出（`mobile-typography.md` R6 就是为治这个把内边距压到 ≤16px 的） |

**联动方式：按差值平移，不按比例。**

```
delta = 新字号 - 原 p.font_size
list_item_text.new = 原值 + delta    （仅当原值可解析为 px）
blockquote_p.new   = 原值 + delta    （同上）
```

为什么不按比例：`blockquote_p` 常比 `p` 小一档（`mg-time.json` p=16 / blockquote_p=15），
按比例放大（×1.2）会把 15px 抬到 18px，**丢掉「引用小一档」**；差值平移则保持 16/15 的关系。
解析不到 px（如 `90%`）就**跳过不改**，避免破坏百分比语义。`p` 本身则直接设为用户值。

区间夹一次：`14 <= size <= 18` 之外一律拒绝（UI 滑杆已限，引擎侧再夹一道）。

### 3.3 最小改动方案（伪代码）

```python
_BODY_SIZE_TAGS = ("p", "list_item_text", "blockquote_p")
_PX_RE = re.compile(r"^(-?[\d.]+)px$")


def _apply_body_font_size(styles: dict, theme: dict) -> dict:
    """按用户设置平移正文字号。不设时**原对象返回**（零拷贝 → 字节不变）"""
    size = (theme.get("type_opts") or {}).get("body_font_size")
    if not size:
        return styles                       # ← 默认路径，下面一行都不跑
    try:
        new_px = float(size)
    except (TypeError, ValueError):
        return styles
    if not (14.0 <= new_px <= 18.0):
        return styles

    m = _PX_RE.match(str((styles.get("p") or {}).get("font_size") or ""))
    if not m:
        return styles                       # p 没声明 px 字号 → 不敢猜，放弃
    delta = new_px - float(m.group(1))

    out = dict(styles)                      # 浅拷贝：只换值，不动键序
    for tag in _BODY_SIZE_TAGS:
        props = styles.get(tag)
        if not isinstance(props, dict):
            continue
        cur_m = _PX_RE.match(str(props.get("font_size") or ""))
        if tag == "p":
            new_props = dict(props)         # 保序：font_size 已存在 → 原位替换
            new_props["font_size"] = f"{new_px:g}px"
        elif cur_m:
            new_props = dict(props)
            new_props["font_size"] = f"{float(cur_m.group(1)) + delta:g}px"
        else:
            continue                        # 非 px（百分比等）→ 跳过，别破坏语义
        out[tag] = new_props
    return out
```

在 `inject_inline_styles` 里接一行（**必须在 `_ensure_text_wrap` 之前**）：

```python
def inject_inline_styles(html: str, theme: dict, skip_wrapper: bool = False) -> str:
    styles = theme["styles"]
    if theme.get("kind") != "kit":                  # ← kit 跳过
        styles = _apply_body_font_size(styles, theme)
    ...
    style_map = {}
    for tag_key, props in styles.items():           # ← 这里起，后续全用新字号
        ...
    _ensure_text_wrap(style_map)                    # ← 断行规则仍追加在最后，顺序不变
```

**为什么必须在 style_map 构建之前改 props，而不是在注入完的 HTML 上 `re.sub`？**

`inject_dark_mode_attrs`（L1180）是

```python
html = html.replace(f'style="{style_str}"', f'style="{style_str}" {dark_attr_str}')
```

它拿 `style_map[tag]` 去**精确匹配整个 style 串**。若先注入再替换字号，产物里的串 ≠ `style_map[tag]`，
`data-darkmode-color` / `data-darkmode-bgcolor` 就再也注射不进 —— 22 套依赖它的主题深色模式**静默失效**。
这条坑在 `AGENTS §10`（`normalize_heading_align` 必须排第 9 步之后那段）已记过一次，同一个机制。

同理 `_ensure_text_wrap` 也不能被挪到我们前面，否则 `word-break` 的追加顺序会变 → 字节变。

### 3.4 回归风险点与验证命令

| 风险 | 后果 | 阻断 |
|---|---|---|
| 传参时 `font_size` 键不存在被追加到 dict 末尾 | 字符串顺序变化（属预期变化，可接受）；不传时不会发生 | 不传路径已提前 return |
| 直接改 `theme["styles"]` 原地 | 同一 theme 二次注入会**二次平移**（字号一路涨到 18+） | 必须 `dict(styles)` 浅拷贝；`theme_render_dump` 单次调用测不出来，要补幂等断言（见下） |
| 深色模式匹配失配 | 见 §3.3 | 落点必须在 style_map 之前 |
| kit 主题被改字号 | 违反锁死 | `theme.get("kind") != "kit"` 才进入 |
| 表格溢出 | 放大正文时用户以为表格也变 | 明确不改 `td/th`；`audit_mobile_typography.py --browser` 兜底 |
| 行高 | `line-height` 是倍数（1.75/1.9），字号放大后行高跟着涨，属正常；**不要顺手改 line-height** | 不改 |

**证明 164 套不变**：与 §2.4 完全同一套命令。`theme_render_dump.py` 的 `MD` 夹具里既有 `<p>`
也有列表和引用，三类标签全被覆盖，所以这一个 dump 就够判。

额外两条：

```bash
# 反向验证（专治「判据恒绿」）：
#   把 _apply_body_font_size 的 `if not size: return styles` 临时改成 `size = 16`（等于强制开）。
#   期望：dump --diff 报「产物有变化 164 套」，且变化集中在
#        p / list_item_text / blockquote_p 的 font-size。
#   若只变了 3 套或 0 套 → 覆盖没真正落到 style_map，是假实现。
```

```python
# 幂等断言（手写小脚本跑一次即可，不进仓）
import json
from core.format_engine import inject_inline_styles, md_to_html
t = json.load(open("public/themes/su-biz-azure.json", encoding="utf-8"))
t["type_opts"] = {"body_font_size": 17}
h = md_to_html("# 标题\n\n正文一段。")
a = inject_inline_styles(h, t)
b = inject_inline_styles(h, t)
assert a == b, "同 theme 重复注入产物不一致 → 原地改了 theme['styles']"
```

### 3.5 与其他功能的冲突

| 功能 | 冲突 | 处理 |
|---|---|---|
| **`normalize_heading_align` R2/R3** | 它按 `font-size` + `letter-spacing` 估算标题放不放得下一行（L1094-1110） | 只对 `h1-h6` 生效，**p 的字号不参与** → 无影响。但**将来若也让人调标题字号，必须重排到第 9 步之前**，否则两者互相踩 |
| **深色模式** | 见 §3.3（致命） | 落点强制在 style_map 之前 |
| **`mobile-typography` R5/R6b** | `_ensure_text_wrap` 追加 `overflow-wrap` | 顺序不能动 |
| **各版式函数里的硬编码字号**（最坑） | `core/magazine_layouts.py` 的 `layout_time` 用 `style_all(out, "p", {"font-size": "16px", ...})` **覆盖**了主题字号；`layout_guardian` / `layout_economist` / `layout_natgeo` / `layout_vogue` / `layout_forbes` / `layout_muji` 同理 | 版式分发（第 8 步 L2390-2404）在 style_map **之后**，会把用户字号**改回去**。两条路：① 版式函数改成读 `theme.get("type_opts")`（15 套各一处）；② 产品上明确「整篇设计类版式下字号固定」并在 UI 置灰滑杆。**推荐 ②**（改动面小、语义清楚） |
| **kit 主题** | 锁死 | 引擎 + UI 双闸 |
| **轻量预览** | `light.js` 直接照抄 `theme.styles.p`，读不到 `type_opts` | 同 §2.5：近似版按既有取舍接受，不在 light.js 复刻 |

---

## 4. 改动三：首段导语（给第一个 `<p>` 加浅色底）

### 4.1 现状代码位置（注入点候选）

| 位置 | 是什么 | 能不能插 |
|---|---|---|
| 第 5 步 `2297-2323` | 给 `p` 注入样式 | ❌ 此时正文结构未定，且与「跳过已带 style 的元素」逻辑纠缠 |
| 第 7.9 步 `2385` | `apply_paragraph_blocks(html, theme)` | ✅ **推荐插在它之后**（L2386 与 L2387 之间） |
| 第 8 步 `2387-2404` | 布局分发（card/hero/timeline/registry） | ❌ 插在它之后，段落已被卡片/深色区包走 |
| 第 10 步 `2425-2428` | `normalize_heading_align` | ❌ 只处理标题 |

参考 `apply_paragraph_blocks`（L2755-2909）的成熟做法，直接复用它的三件套：
- `is_top_level_p(match_start, html)`（L2788-2817）—— 判「这个 p 是否在 blockquote / 色块 / 列表容器内」
- `plain_text()`（L2785-2786）
- **幂等标记**：`data-block="..."`（L2802-2811「已在色块容器内不重复包」）

⚠️ 但 `is_top_level_p` 的注释已点明一个坑（L2790-2795）：
> `inject_inline_styles` 会把整篇包进一个外层 `<section>`（wrapper），所以不能用「section 深度为 0」判断。

——第 7.9 步时 wrapper 还没包（wrapper 是 8.1 才加的），所以那里 section 深度反而更简单。这是选 7.9 之后的另一个理由。

### 4.2 与 hero / card 版式的冲突（**这是本项的核心风险**）

先看 hero 干了什么（`_split_hero_head`，L2041-2067）：

```python
m = re.match(r'\s*<h1[^>]*>.*?</h1>', html, re.DOTALL)       # 找 h1
tail = re.match(r'(?:\s*<p[^>]*>.*?</p>)+', html[end:], ...)  # ← h1 之后**紧随的段落**并入 head
```

**「首段导语」在定义上就是 hero 的 head 成员。** 而 head 在 `dark_header` 下会被
`_recolor_block(head, _DARK_TEXT)`（L2132-2137）把**所有 p 的字色强制改成 `#ffffff`**，
再包进 `background-color:{dark_bg}`。

于是：用户设的「浅色底导语」+ hero 强制的白字 = **浅底白字，几乎读不出来**。
这不是审美问题，是可用性事故。

| 布局 | 冲突 | 判定 |
|---|---|---|
| `hero` | 导语进 head → 被染成白字 + 深底 | **必须跳过**（或降级为「只加左侧 3px 竖线」） |
| `card` | `_wrap_card_sections`（L1926 起按 h1/h2 切分）把第一片段（含导语）包成**卡片**；卡片里再套浅底色块 = 双重卡片 | **必须跳过**（`_strip_heading_block` 的病史就是为治「卡片里套色块」，L1935-1937） |
| `cardflow` | 同上，每节成卡（L3122-3123） | **跳过** |
| `magazine` | `si == 0` 时把 body 第一段单独整宽输出当导语（L3013-3020） | ⚠️ **可共存**，但要防同一段被包两次（见 4.3 第 3 条） |
| `timeline` / `outline` / `rhythm` | 每节包 section | ✅ 可共存 |
| kit（`mg-*`） | 15 套全是「整篇设计」，`locked_layout` 各不相同（time/guardian/…） | **跳过**（锁死承诺） |

### 4.3 最小改动方案（伪代码）

```python
_LEDE_MIN_CHARS = 15       # 太短（「本文共 3 节」）加底块会被误当色块标题
_LEDE_MAX_CHARS = 120      # 太长浅底占满首屏，且「导语」本义是引导而非正文
_LEDE_SKIP_LAYOUTS = {"hero", "card", "cardflow"}
_P_RE = re.compile(r"<p(?![^>]*data-block)([^>]*)>(?!<p)(.*?)</p>", re.DOTALL)


def inject_lede_block(html: str, theme: dict) -> str:
    """给文章第一个顶层 <p> 加浅色底（导语）。

    设计约束（与 apply_paragraph_blocks 同源，别另造一套）：
      1. **默认关**：theme["lede"]["on"] 未显式为 True 时直接返回（→ 164 套字节不变）
      2. 只处理第一个顶层 p，命中即走；不合格整体放弃（不扫描全文，误伤最小）
      3. 幂等：已带 data-role="lede" 直接返回
      4. kit / hero / card / cardflow 一律跳过
    """
    if theme.get("kind") == "kit":
        return html
    if (theme.get("layout") or "") in _LEDE_SKIP_LAYOUTS:
        return html
    if not (theme.get("lede") or {}).get("on"):
        return html                     # ← 默认路径，下面一行都不跑

    colors = theme.get("colors") or {}
    accent = colors.get("accent") or colors.get("primary") or "#333333"
    ink = colors.get("primary") or "#333333"
    soft = _derive_block_color(ink, accent, 0.05)      # 复用 L2702 的取色函数

    for m in _P_RE.finditer(html):
        if not is_top_level_p(m.start(), html):        # 抽成模块级函数，见下
            continue
        inner = m.group(2)
        text = plain_text(inner)
        if "data-role=\"lede\"" in m.group(0):
            return html                                # 幂等
        if not (_LEDE_MIN_CHARS <= len(text) <= _LEDE_MAX_CHARS):
            return html                                # 只看第一个，不合格就放弃
        if re.search(r"<(?:img|table|blockquote|section|pre)\b", inner):
            return html                                # 含块级元素 → 不是纯文字导语
        # 样式必须「追加」不是「替换」：p 已带 style_map["p"]（color/line-height/margin）
        d = _style_dict(_attr_style(m.group(1)))        # 取原 style="..." 的内容
        d.update({"background": soft, "padding": "14px 16px",
                  "border-radius": "8px", "border-left": f"3px solid {accent}"})
        new_tag = f'<p data-role="lede" style="{_style_str(d)}">'
        return html[:m.start()] + new_tag + inner + "</p>" + html[m.end():]
    return html
```

调用点（`inject_inline_styles` 内）：

```python
    # === 7.9 段落级色块强调（C 方案）===
    html = apply_paragraph_blocks(html, theme)

    # === 7.95 首段导语（新增）===
    # ⚠️ 必须在第 8 步布局分发之前：hero/card 一包，段落就进了卡片或深色区，
    #    再包浅底会变成「卡片里套色块」或「浅底白字」。同时显式跳过这三类版式。
    html = inject_lede_block(html, theme)

    # === 8. 布局分发 ===
```

**三条实现细节，都是撞过的坑**：

1. **`is_top_level_p` 抽成模块级**。现在它是 `apply_paragraph_blocks` 里的**闭包**（L2788），`inject_lede_block` 用不到。抽出去时**两处调用改成同一函数**，不要复制一份 —— 复制出来的两份必然漂移。
2. **样式必须「追加」**。`<p>` 已带 `style_map["p"]`（含 color / line-height / margin）。重建整串会丢字色，还会打掉第 9 步深色模式的精确匹配（§3.3 同一机制）。写法：`_style_dict` 解析原串 → `update` → `_style_str` 拼回，**且必须在第 9 步之前完成**。
3. **`magazine` 的双包**：`_layout_magazine`（L3013-3020）会把 body 第一段单独拎出来整宽输出。此时该段已是 `<p data-role="lede" style="...">`，仍会被 `re.findall(r"<p[^>]*>.*?</p>")` 命中并整宽输出 → 结果正确、不破版。但仍要一条断言兜：`pwa_layout_compat_test.py` 的「不丢字 ≥95%」判据已够用。

### 4.4 要不要长度门槛？要，四条

| 门槛 | 值 | 依据 |
|---|---|---|
| 最短 | **15 字** | 短于 15 字（「本文共三节」「先说结论」）加浅底会被误读成**色块标题**，与 h2 抢语义 |
| 最长 | **120 字** | 375px 下 18px 正文一行约 19 字，120 字 ≈ 6 行；再长浅底占满首屏 |
| 纯度 | 不含 `img / table / blockquote / section / pre` | 含块级元素时 `plain_text` 长度失真，且浅底会包住整张图 |
| 位置 | 必须是**第一个顶层 p**，且不在 `data-block` / `data-container` 内 | 直接复用 `is_top_level_p` |

**不做语义判断**（「这段是不是真的导语」）：`AGENTS §10` 的本地规则边界明写「不做规则发明」。
第一个段落就是导语，这是排版惯例，不是猜测。

### 4.5 回归风险点与验证命令

| 风险 | 后果 | 阻断 |
|---|---|---|
| 默认就开 | 164 套全变 | `theme["lede"]["on"]` 必须显式 True；未声明 = 关 |
| hero 浅底白字 | 可用性事故 | `_LEDE_SKIP_LAYOUTS` |
| card 双重卡片 | 用户以为版式坏了 | 同上跳过 |
| 打掉深色模式 | 22 套失效 | 只在第 9 步之前、且用 `_style_dict`/`_style_str` 追加 |
| 误伤引用/列表内的 p | 嵌套破版 | 复用 `is_top_level_p` |
| 幂等 | 二次渲染叠加两层底 | `data-role="lede"` 标记 + 命中即 return |

**证明 164 套不变**：同 §2.4 的 ① ② ③。

⚠️ 注意 `theme_render_dump.py` 的 `MD` 夹具首段正是「本文说明这一版要解决的问题…」（约 30 字，落在 15–120 区间），
所以「默认开」的话 dump **必然**报 164 套全变。这条天然就是反向验证用例：

```bash
# 反向验证：把 `if not (theme.get("lede") or {}).get("on"): return html`
#          临时改成放行（等于默认开）。
# 期望：dump --diff 报「产物有变化 164 套」（首段为纯文字的文章）。
# 若报 0 套 → 门槛逻辑把触发条件写死成永不成立，是假实现。
```

追加**版式矩阵**验证（必须 —— 164 套默认 `layout` 全空，dump 覆盖不到 hero/card）：

```bash
.venv/Scripts/python.exe scripts/pwa_layout_compat_test.py        # 10 夹具 × 5 版式 × 2 态
.venv/Scripts/python.exe scripts/pwa_headed_full_e2e.py --local   # 164 套 × 3 夹具 + 8 版式
```

### 4.6 与其他功能的冲突

| 功能 | 冲突 | 处理 |
|---|---|---|
| **hero** | 导语进 head，被 `_recolor_block` 刷成白字 | 跳过 |
| **card / cardflow** | 导语进卡片 → 双重卡片 | 跳过 |
| **magazine** | 首段被单独整宽输出 | 可共存；靠 layout_compat 的不丢字判据兜 |
| **段落色块 `blocks.quote`** | 首段若含引号，`apply_paragraph_blocks` 会先包成 `data-block="quote"`，我们的正则 `(?![^>]*data-block)` 会跳过它 → **导语块不出现** | 行为正确（不重复上色）；**文案里要说清**。若产品要求导语优先，把判据改成「第一个未被包成 data-block 的 p」 |
| **`blocks.data` / `blocks.tip`** | 同上，首段是「3 个方法…」会被包成 data 块 | 同上 |
| **kit** | 锁死 | 跳过 |
| **第 10 步 `normalize_heading_align`** | 只处理标题，不碰 p | ✅ |
| **轻量预览** | `light.js` 不实现 lede | 近似版看不到导语块，精确版到达后出现 —— 接受 |
| **「首屏」版式 + 导语** | 两者都想美化首屏 | **明确二选一**：hero 优先、导语自动关闭，UI 给一行提示。否则就是浅底白字 |

---

## 5. 实施顺序与总体验收

### 5.1 顺序（一次一项，每项单独 commit、单独跑全量 dump）

| 顺序 | 改动 | 前置 | 为什么这个顺序 |
|---|---|---|---|
| 1 | **背景独立** | 先跑 §2.2 的 `dark_mode` 实测，决定变体 A / B | 只碰第 8.1 步，与另两项零交叉 |
| 2 | **正文字号** | 无 | 只改 style_map 构建处；做完后 §3.5 的「版式硬编码字号冲突」才会浮出来，正好一并处理 |
| 3 | **首段导语** | 依赖第 2 项抽出的模块级 `is_top_level_p` | 门槛最多、冲突最多，放最后 |

### 5.2 三项共同的总验收（每条都要能红）

| # | 判据 | 命令 | 反向验证（证明能红） |
|---|---|---|---|
| 1 | 三项都不传 → 164 套产物**逐字节不变** | `theme_render_dump.py --out` / `--diff` | 任一项默认值改成「开」→ diff 必须报变化 |
| 2 | 渲染结构无残余（标签平衡 / 无 None / 无空 style） | `theme_stress_audit.py --only render` | 故意插一个 `None` 文案 → 必须报错 |
| 3 | 标题/正文对比度不退化 | `theme_contrast_audit.py` | 把 lede 的 `soft` 写成 `#FFEE00` → 必须报错 |
| 4 | 375px 不崩 | `audit_mobile_typography.py`（+ `--browser`） | 字号调到 18 + 5 列表格 → 表格宽度断言应 FAIL |
| 5 | 版式行为不变（dump 覆盖不到 hero/card） | `pwa_layout_compat_test.py` | 把 hero 从 `_LEDE_SKIP_LAYOUTS` 去掉 → 应出现浅底白字断言失败 |
| 6 | 全量门禁 | `run_gates.py --local` | —— |
| 7 | 构建通过（改了 `core/` 必须重跑） | `node pwa/scripts/build.mjs` | `preflight.py` 会挡「dist 不含最新代码」 |
| 8 | 文档一致 | `doc_sync_check.py` | —— |

⚠️ **`build.mjs` 是硬性的**：`AGENTS §4` 明示「改过 `pwa/src` / core 引擎 / public/themes 必须重跑」，
且 `preflight.py` 是门禁第 0 步（dist 新鲜度阻断）。只改 `core/` 不重跑 → 门禁第一步就红。

### 5.3 需要用户拍板的三件事（按 `AGENTS §11`，必须用选择器，不能让用户打字）

1. **UI 入口放哪**：抽屉新增「排版微调」一段（字号滑杆 + 页面背景 4 预设 + 导语开关）／ 塞进「更多」菜单 ／ 跟着「自定义配色」放在一起
2. **正文字号联动范围**：只 p ／ p + 列表 + 引用（本方案推荐）／ 再加表格与提示框
3. **首段导语在 hero/card 下**：直接禁用（推荐）／ 降级成「只加左侧竖线」／ 允许（接受浅底白字）

---

## 6. 不做

| 不做 | 原因 |
|---|---|
| 改 `convert_markdown_to_wechat_html` 函数签名 | 要连改 `engine.worker.js` 里的 Python 字符串 + `bridge.js` 协议，而 `layout`/`blocks` 已证明「塞 theme JSON」够用 |
| 用 `url()` 做页面纹理 | 公众号会过滤外链背景图；只放 CSS 渐变（164 套里已有 `background-size:100% 1px` 先例） |
| 在 `light.js` 里复刻这三项 | `AGENTS §10`：近似版只求「看着像」，复刻必然与引擎漂移 |
| 让用户调标题字号 / 行高 | 标题字号牵动 `normalize_heading_align` 的折行估算（L1094-1110），是另一个量级的风险 |
| 顺手统一 `_split_by_headings` / `_split_head_body` 的重复 | 属 `design-engine-optimization.md` 改造 A，与本轮无关 |
| 改 `SCALE` 重生成 119 套 | 那是**生成期**、影响面是全量产物文件（要提交 119 个 JSON 变更）；用户诉求是**运行时**、存本机 |
