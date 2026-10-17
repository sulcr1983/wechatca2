# SuperSu 发布为 Web / PWA 方案（2026-10-18）

> 两条独立调研线：`pwa-architect`（架构可行性）+ `compliance-auditor`（开源合规，含 git blob SHA 字节级比对）
>
> 🔴 **结论先行：技术上可以发布，但当前代码状态「不能公开部署」——存在 AGPL 传染事实与 BLCaptain 闭源服务条款，必须先定许可证路线。**

---

## 零、合规红线（必须先决策，否则不要公开发布）

### 红线 1：AGPL-3.0 衍生（最严重，会传染全站）

上游 `op7418/guizang-social-card-skill` 的许可证元数据为 **AGPL-3.0**。本项目以下资产为其衍生：

| 资产 | 证据 | 数量 |
|---|---|---|
| `references/*.md` | **11 个文件 git blob SHA 与上游完全一致**；其余 6 个为改写版（文本相似度 0.82–0.96） | 17/17 全部衍生 |
| `public/cover-templates/*` | 10 套主题目录名与上游完全相同；`[data-theme="dune"]` 的 10 个 CSS 变量取值**逐字相同**（`#f0e6d2 / #ded0b7 / #1f1a14 …`） | 10 套 |
| `public/screenshot-backgrounds/style-b/*.webp` | **4 个文件 blob SHA 与上游完全一致**，且经 `/assets/<path>` 对外公开可访问 | 4 张 |

**后果**：AGPL-3.0 要求整个组合作品以 AGPL 发布；§13 网络条款还要求对通过网络交互的用户提供完整对应源码。当前 README 声称 MIT、仓库**无 LICENSE 文件**——这既不能免除 AGPL 义务，反而构成「拿 AGPL 代码改标 MIT」的侵权事实。

**三条出路（必须选一条）**

| 路线 | 做法 | 代价 |
|---|---|---|
| **A（推荐）** | 整仓改为 **AGPL-3.0** + 补 LICENSE + NOTICE 署名上游 + 页面页脚「源码」链接（履行 §13） | 项目必须开源、衍生作品同样 AGPL；但顺带满足 BLCaptain §1.3 免费条件 |
| **B** | 删净 `references/`、`public/cover-templates/`、`public/screenshot-backgrounds/style-b/`，重写封面引擎 | 砍掉「归藏」2 风格；git 历史需清史 |
| **C** | 联系 op7418 取得商业/例外授权（其 `COMMERCIAL_LICENSING.md` 面向平台合作） | 需商务谈判 |

### 红线 2：BLCaptain 是「双许可」，不等于可自由公开部署

`blcaptain-style-skill/LICENSE`：
- **§1.3 免费条件**：仅在「采用 OSI 认可开源许可证、并公开完整源代码」的开源项目中使用/集成；
- **§2.1 付费条件**：**闭源软件、闭源服务、SaaS 或任何不公开源码的产品**，须事先取得书面商业授权（blteam2026@outlook.com）；
- **§2.2**：以营利为直接目的的产品/服务，须授权。

→ 公开站点若不公开源码（哪怕免费），即落入 §2.1，必须买授权。走路线 A（整仓 AGPL + 公开源码）可主张 §1.3 免费，但「是否营利」仍需与作者书面确认。

⚠️ **部署陷阱**：`blcaptain-style-skill/` 被根 `.gitignore` 排除（`git ls-files` = 0），但它是**运行时必需**（`core/blcaptain_bridge.py` 调 Node CLI）。别人 clone 后 9 种封面风格直接不可用；打部署包漏了会 500 或静默回退。目录内 `node_modules/` 约 17MB。

### 红线 3：根 LICENSE 缺失 + README 声明 MIT

`README.md` 有 MIT 徽章、写「MIT License — 自由使用、修改、分发」，但仓库**没有 LICENSE 文件**。在含 AGPL 衍生件的前提下贴 MIT 是错误声明，必须与最终路线一致，并补 `THIRD_PARTY_NOTICES.md`。

### 红线 4：`public/images/` 10 张库存图来源不可追溯

10 张 1080×1440 照片（`01-old-photos … 10-power-pole`）无 EXIF、无 CREDITS、无下载记录，却经 `/assets/images/*` 公开分发。公开部署 = 再分发，必须补出处或整批替换。

### 红线 5：Pexels API 署名不合规

Pexels API 条款明确：每次使用都必须**显著展示 Pexels 链接**（文字链接或 logo），并尽量标注摄影师、链接照片页。当前 `#bg-credit` 只渲染纯文本「底图来源：Pexels · 作者（Pexels License）」，**无任何链接** → 可直接判定的条款违反。

### 字体专项（OFL，可自托管）

| 字体 | 许可证 | 版权行 |
|---|---|---|
| DM Sans | SIL OFL 1.1 | `Copyright 2014 The DM Sans Project Authors` |
| Noto Sans SC | SIL OFL 1.1 | `Copyright 2014-2021 Adobe, with Reserved Font Name 'Source'` |
| JetBrains Mono | SIL OFL 1.1 | `Copyright 2020 The JetBrains Mono Project Authors` |
| 封面模板另用 Playfair Display / Noto Serif SC / Inter / IBM Plex Mono | OFL 1.1 | 同族 |

义务：随字体分发 **OFL.txt 全文**、保留版权行、不得单独售卖字体、子集化后不得使用保留字体名（Noto 的 RFN 是 `Source`）、不得用字体名为产品背书。

现状问题（合规 + 可用性）：前端与 10 套封面模板均直连 `fonts.googleapis.com` → 国内可达性差、无网渲染会字体回退导致封面溢出、欧盟法院已判 Google Fonts CDN 违反 GDPR。**建议自托管 woff2（中文按 unicode-range 分片）+ `public/fonts/OFL.txt`**。

### Wikimedia 图片（CC BY-SA 硬要求）

- 每张图许可不同，以文件页为准；
- **CC BY-SA**：必须署名原创作者（不是上传者）+ 标明许可名称 + 许可链接；修改（裁切/叠字/滤镜）后须以**相同许可**发布；
- 当前实现只取 `LicenseShortName` + `Artist`，**没取 `LicenseUrl` / `DescriptionUrl`**，且署名不烘进生成图 → 用户下载发布即无署名再分发。
- 建议：默认只筛 `CC0 / Public domain`；CC BY-SA 需用户勾选「可署名」并给全链接。

### 最小整改清单

**P0（不做完不要公开）**
1. 定许可证路线（A/B/C）
2. BLCaptain：闭源部署先买授权；走 A 则保留 LICENSE 并在部署脚本显式打包该目录
3. 补根 LICENSE + `THIRD_PARTY_NOTICES.md`，README 声明与路线一致

**P1（公开当天就会被挑出）**
4. `public/images/` 补 `CREDITS.md` 或换图
5. Pexels 署名补链接（含摄影师照片页）；Wikimedia 补 `LicenseUrl` + 文件页链接
6. 字体自托管 + `OFL.txt`，去掉前端与封面模板的 Google Fonts 外链

**P2（长期）**
7. 45 套旧主题里的第三方品牌名（github / vogue / sspai / bytedance / monocle / bauhaus）商用前改名
8. 保留 `AGENTS.md §10` 关于 TypeZen（AGPL + 非商用）「只做灵感参照、未复制 CSS 数值/命名/文案」的书面记录作为抗辩材料；后续不再引入其数值

---

## 一、技术结论（一句话）

现有 Flask **不能直接**部署到 Cloudflare（WASM 环境没有 WSGI 服务器）。但 `format_engine.py` + `preprocessor.py` + 164 套主题 JSON 是**纯 Python**，最优路径是：

> **纯静态 PWA + 浏览器内 Pyodide 运行现有引擎**——引擎零改动、输出与本地版 100% 一致、数据不出浏览器、服务器只下发文件。**3-5 人日上线，托管零成本。**

---

## 二、Cloudflare 上的三条路径对比

| 路径 | 能跑现有 format_engine | 代价与限制 |
|---|---|---|
| **Workers Python（Pyodide）** | ✅ 能（`markdown` 包可装） | 免费版 CPU 仅 **10ms/请求**（必超）→ 需 **$5/月** Workers Paid；不能跑 Flask / Playwright |
| **Containers** | ✅ 能（Flask 镜像原样跑） | 仅 Paid；冷启动 **2–3s**；按 10ms 计费；违背「服务器只下发」诉求 |
| **纯静态前端** | ⚠️ 需移植 JS 或浏览器内跑 Python | 无后端；**静态资源请求免费无限**；唯一满足「数据全本地」 |

---

## 三、纯前端 PWA 能力映射

| 能力 | 能否 100% 复刻 | 方案 |
|---|---|---|
| Markdown → 微信内联 HTML | ✅ **可以** | marked + 自定义 renderer；主题 JSON 直接拼 `style`（**无需 juice**，比 doocs/md 更简单） |
| 纯文本 → Markdown（约 514 行规则） | ✅ **可以** | `re` → `RegExp` 逐条搬；用现有 62 项 E2E 做回归基准 |
| 小红书封面（Playwright 三引擎） | ✅ **可以（更准）** | DOM 模板 + **snapdom**（约 20KB，浏览器原生光栅化） |
| 微信推送（草稿箱） | ❌ **不可能** | 微信强制 **IP 白名单 + AppSecret**，必须保留本地后端 |

> 即：**排版/复制/封面 → 纯前端；推送 → 本地 Flask（可选装）**。这正是 doocs/md 的形态（MIT，Vue3 纯前端，marked + 11 扩展 → DOMPurify → 主题 CSS → 复制时 juice 内联 → ClipboardItem）。

---

## 四、推荐分阶段路线

| 阶段 | 内容 | 工作量 | 风险 |
|---|---|---|---|
| **阶段 1（推荐先做）** | Vite 静态站 + **Web Worker 内 Pyodide** 跑现有 Python 引擎；复制/草稿/离线全本地 | **3–5 人日** | 首访约 10MB（Pyodide）、iOS 内存；用 PWA 缓存 + 预加载缓解 |
| 阶段 2（可选） | marked + JS 主题引擎替换 Pyodide；首屏降到 ~200KB | 18–25 人日 | hero/card 包裹逻辑需像素级对齐，回归成本高 |
| 阶段 3 | 小红书封面搬前端（snapdom）；微信推送保持本地 Flask | 2–4 人日 | 低 |

**部署**：`Workers Static Assets`（官方已从 Pages 转向）+ `wrangler deploy`；自定义域名需域名托管在 Cloudflare zone。静态资源免费、请求无限。

---

## 五、关键参考链接

- Workers Python 原理：https://developers.cloudflare.com/workers/languages/python/how-python-workers-work/
- Workers 限制（10ms CPU / 128MB）：https://developers.cloudflare.com/workers/platform/limits/
- 静态资源计费（免费无限）：https://developers.cloudflare.com/workers/static-assets/billing-and-limitations/
- doocs/md 渲染管线：https://deepwiki.com/doocs/md/2.2-markdown-rendering-system
- 微信 IP 白名单：https://developers.weixin.qq.com/doc/subscription/guide/dev/api
- 上游 AGPL 项目：https://github.com/op7418/guizang-social-card-skill

---

## 五之二、方案修订（架构侧，因合规约束）

- ❌ **撤回「封面前端化」**：`cover-templates` / `screenshot-backgrounds` 是 AGPL 衍生，**在浏览器渲染封面 = 向访客分发 AGPL 代码**。封面只在本地 Flask 渲染，PWA 里做成「检测到 127.0.0.1 服务才显示」。
- ✅ **新增路线 D（推荐组合）：私有仓库 + PWA 只分发自研资产**
  公开站点只含 164 套主题 JSON（自研）+ 排版引擎 + 自托管字体，**不含任何封面资产**。既不分发 AGPL 资产（不触发传染），也不涉及 BLCaptain 双许可（封面功能仅本地）。
- **静态包白名单**
  - 进包：`public/themes/*.json`（1.7MB）、`public/vendor`、app shell、自托管字体（woff2 + OFL.txt）、`public/theme-thumbs`（自研渲染产物 2.8MB，可选）
  - 不进包：`cover-templates`、`screenshot-backgrounds`、`images`（3.2MB 来源不明）、`social-thumb`、`prototypes`、`uploads/`、`output/`、`temp_covers/`、`data/`、`.env`
  - 效果：包体 ~8MB → **~2MB**
- **字体自托管是必做项（不是优化）**：直连 Google Fonts 在离线 PWA 下必然回退、标题宽度变化（封面溢出的同类根因），且有 GDPR 风险。做法：`public/fonts/` 放 woff2 + `@font-face` + `font-display:swap` + 同目录 OFL.txt。
- **工作量修订**：阶段 1 **4–6 人日**（+字体自托管 +白名单 +本地服务探测）；阶段 2 18–25 人日；~~阶段 3 封面搬前端~~ **取消**；总账：只上 PWA 4–6 人日，「秒开」再叠加阶段 2 合计 22–31 人日。
- **新增风险**：`blcaptain-style-skill/` 不在 git（.gitignore 排除 + 17MB node_modules）→ 任何从仓库构建的 CI 都拿不到；若改走 Workers/Pages Functions，Node + Playwright 跑不了，9 种封面全废 —— 反过来印证「封面必须留本地」。

---

## 五之三、最终场景确认（2026-10-18 01:43 用户确认）

> **实际用途：闭源、免费、自己用 + 发到自己群里大家一起免费使用。不是公开商用产品。**

这个场景下**路线 D 完美适配**：

- **仓库保持私有**（不开源）→ 不产生"开源声明与 AGPL 冲突"问题
- **PWA 只分发自研资产** → 部署产物不含 AGPL 代码 → 不触发 §13 网络条款的源码提供义务
- **封面功能留本地**（AGPL 资产不出本机）→ 群里朋友用 PWA 只能用排版/复制，封面需本地版
- **不收费** → BLCaptain 的"营利目的"条款不涉及；且 PWA 不含 BLCaptain

### 静态包白名单（定稿）

| 进包 | 不进包 |
|---|---|
| `public/themes/su-*.json`（**119 套**自研） | `public/themes/*.json` 中 **45 套旧主题**（aurora / bold-blue / github / vogue / sspai / bytedance / monocle / bauhaus…，命名含第三方品牌名） |
| `public/theme-thumbs/su-*.jpg`（119 张） | 对应 45 张缩略图 |
| `public/vendor/`（4KB） | `cover-templates/`、`screenshot-backgrounds/`、`images/`、`social-thumb/`、`prototypes/` |
| app shell（HTML/JS/CSS） | `uploads/`、`output/`、`temp_covers/`、`data/`、`.env` |
| `public/fonts/*.woff2` + `OFL.txt` | — |

**效果：164 套 → 119 套，包体 ~8MB → ~1.6MB。**

### ⚠️ 必须改的坑：默认主题正好在被排除的 45 套里

`app.py` 里 `theme_id` 默认值是 `bold-blue`（属于 45 套旧主题）→ 按白名单打包后默认主题 404。改 3 处（约 0.5 人日）：
1. `app.py` 默认值改为 `su-*` 主题（建议 `su-biz-azure` 或按品牌色挑）
2. 前端 `activeTpl` 初始值同步
3. 加兜底：主题加载失败回退列表第一项

### 两套构建

| 构建 | 主题 | 用途 |
|---|---|---|
| **public（CF 托管）** | 仅 119 套 `su-*` | 对外发布（群里） |
| **private（本地 Flask）** | 全部 164 套 | 自己用，不出公网 |

CI 硬断言：
```
grep -r "guizang" dist/ && exit 1
ls dist/themes/ | grep -v "^su-" && exit 1
```

### 字体自托管（并入阶段 1）
`public/fonts/` 放 DM Sans / Noto Sans SC / JetBrains Mono 的 woff2 + `@font-face` + `font-display:swap` + `OFL.txt`；同时把 10 套 cover-templates 的 Google Fonts 外链改本地路径（顺手压掉断网字体回退导致的标题溢出）。

### 工作量定稿

| 阶段 | 人日 |
|---|---|
| 阶段 1 静态 PWA + Pyodide（含字体自托管、白名单、默认主题修正） | **4.5–6.5** |
| 阶段 2 JS 引擎替换（可选，提升首屏） | 18–25 |
| 阶段 3 封面搬前端 | **0（取消）** |
| 阶段 4 推送（留本地） | 0 |

---

## 六、待决策

场景已确认（闭源 / 免费 / 群内分享）→ **路线 D 已定，无需再选许可证**。

剩下的是一个动作：

1. **是否现在启动 PWA 阶段 1**（4.5–6.5 人日）：
   - 内容：Vite 静态站 + Web Worker 内 Pyodide 跑现有引擎；只打包 119 套 su-* 主题；字体自托管；默认主题改 su-biz-azure；本地服务探测（有 Flask 才显示封面/推送）
   - 交付：一个网址，群里打开即用，数据全在浏览器，可安装到桌面/手机（PWA）
2. 附带 0.5 人日：修默认主题兜底（`bold-blue` → `su-biz-azure`）——这个即使不做 PWA 也建议改（本地也受益）

**不需要做的**：整仓 AGPL 化、买上游授权、删归藏资产（因为都不分发）。
