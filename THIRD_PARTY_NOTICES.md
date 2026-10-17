# 第三方组件与许可声明（THIRD_PARTY_NOTICES）

> 本项目整体采用 **AGPL-3.0**（见根目录 `LICENSE`）。
> 本文档列明所有第三方资产、依赖与许可，并说明本项目对其所做的修改（AGPL §5 要求）。

---

## 一、第三方代码与资产

### 1. 归藏社交卡片（Guizang Social Card Skill）

| 项 | 内容 |
|---|---|
| 上游仓库 | https://github.com/op7418/guizang-social-card-skill |
| 许可证 | **AGPL-3.0** |
| 本项目使用范围 | ① `public/cover-templates/` 10 套封面模板（editorial × 6 + swiss × 4）<br>② `public/screenshot-backgrounds/style-b/` 4 张背景图<br>③ `references/` 17 份设计参考文档（其中 11 份与上游字节级一致，6 份为改写） |
| 本项目所做修改 | ① 适配本地 Playwright 渲染管线（改字体引用为本地、调整路径）<br>② 模板参数化以支持动态标题/副标题注入<br>③ `core/guizang_renderer.py` 为独立编写的渲染适配层（非上游代码） |
| 修改日期 | 2026-07 至 2026-10 |
| 许可传递 | 本项目整体以 AGPL-3.0 发布，履行 AGPL §13（网络交互提供源码） |

### 2. BLCaptain Style Skill

| 项 | 内容 |
|---|---|
| 上游仓库 | https://github.com/dososo/blcaptain-style-skill |
| 许可证 | **BLCaptain Style Skill License（自定义双许可）** |
| 关键条款 | §1.3：在采用 OSI 认可开源许可证并公开完整源代码的项目中，可免费使用/集成<br>§2.1：闭源软件、闭源服务、SaaS 需事先取得书面商业授权 |
| 本项目定位 | **开源项目 + 公开完整源码** → 适用 §1.3 免费条款；本项目不收费、不商用 |
| 使用范围 | `blcaptain-style-skill/`（9 种封面风格：sp-mist / sp-warm / sp-coastal / sp-night / sp-hearth / sl-blue / sl-mint / sl-coral / sl-lime） |
| 安装方式 | 该目录为 vendored 依赖，含 Node.js 运行时（`npm install` 安装 playwright 后可用）；**不随本仓库 Git 提交**，使用者需自行安装并遵守其许可 |

> ⚠️ 如本项目未来改为闭源部署或商用，须先取得 BLCaptain 作者的书面商业授权（联系：blteam2026@outlook.com）。

### 3. fitty

| 项 | 内容 |
|---|---|
| 文件 | `public/vendor/fitty.min.js` |
| 上游 | https://github.com/rikschennink/fitty |
| 许可证 | **MIT** |
| 版权 | Copyright (c) Rik Schennink |

---

## 二、字体（SIL Open Font License 1.1）

| 字体 | 版权行 | 用途 |
|---|---|---|
| **DM Sans** | Copyright 2014 The DM Sans Project Authors | 前端西文正文 |
| **Noto Sans SC** | Copyright 2014-2021 Adobe, with Reserved Font Name 'Source' | 前端中文正文（PWA 版用系统字体替代，未随包分发） |
| **JetBrains Mono** | Copyright 2020 The JetBrains Mono Project Authors | 计数/代码 |
| **Playfair Display** | Copyright 2017 The Playfair Display Project Authors | 封面模板标题（归藏模板使用） |
| **Noto Serif SC** | Copyright 2014-2021 Adobe | 封面模板标题 |
| **Inter** | Copyright 2016 The Inter Project Authors | 封面模板正文 |

**OFL-1.1 义务摘要**：允许自由使用、修改、分发（含打包进产品）；须保留版权声明与本许可文本；不得单独售卖字体本身；修改后不得使用保留字体名（Noto 的 RFN 为 "Source"）；不得用作者名/字体名为产品背书。
**许可全文**：https://openfontlicense.org/open-font-license-official-text/ · 本地副本见 `pwa/public/fonts/OFL.txt`（PWA 落地后生成）。

---

## 三、Python 依赖

| 包 | 许可证 | 用途 |
|---|---|---|
| Flask / Werkzeug / Jinja2 | BSD-3-Clause | Web 框架 |
| Markdown | BSD-3-Clause | Markdown 渲染 |
| Playwright (Python) | Apache-2.0 | 封面渲染 / 有头测试 |
| Pillow | MIT-CMU | 图片处理 |
| requests | Apache-2.0 | HTTP 客户端 |
| python-dotenv | BSD-3-Clause | 环境变量 |
| platformdirs | MIT | 路径管理 |

完整依赖树见 `requirements.txt`；传递依赖（certifi MPL-2.0 / urllib3 MIT / charset-normalizer MIT / greenlet MIT）均为宽松许可。

---

## 四、图片来源

| 来源 | 许可 | 使用方式 |
|---|---|---|
| **Pexels** | Pexels License（免费商用、可修改、不强制署名；禁止转售未修改副本、禁止暗示代言） | 封面底图；**API 使用时须显著展示 Pexels 链接**（前端 `#bg-credit` 已实现） |
| **Wikimedia Commons** | 逐图许可（CC0 / PD / CC BY / CC BY-SA） | 封面底图；CC BY-SA 需署名原创作者 + 许可链接；本项目在前端署名条展示 |
| `public/images/` 10 张库存图 | 来源见目录内 `CREDITS.md`（如有）；无出处者由项目作者承担使用责任 | 封面兜底图 |

---

## 五、参考资料（非代码）

| 资料 | 来源 | 说明 |
|---|---|---|
| `docs/wechat-page-redesign.md` · `docs/pwa-design.md` | 本项目自研 | 设计方案 |
| `docs/audit-playbook.md` · `docs/project-conventions.md` | 本项目自研 | 工程规范 |
| 预处理器规则参考 | YiShu5/GZHcomposing（思路借鉴，clean-room 实现） | 未复制代码 |
| 四级标题体系参考 | cwyalpha/Word-Formatter-Pro（MIT） | 仅借鉴规则思路 |
| setext 标题识别参考 | docling（MIT） | 仅借鉴规则思路 |
| 标题判定级联参考 | Unstructured-IO/unstructured（Apache-2.0） | 仅借鉴算法思路 |

---

## 六、声明变更记录

| 日期 | 变更 |
|---|---|
| 2026-10-18 | 首次建立：补全 AGPL-3.0 主许可、归藏/BLCaptain/字体/图片/依赖声明 |
