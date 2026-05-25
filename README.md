

# SuperSu · 公众号智能排版引擎

### 从纯文本到微信草稿箱，全流程 AI 自动化 — 3 分钟完胜传统 20 分钟

[![Python](https://img.shields.io/badge/Python-3.10+-3776AB?style=flat-square&logo=python&logoColor=white)](https://python.org)
[![Flask](https://img.shields.io/badge/Flask-3.0+-000000?style=flat-square&logo=flask&logoColor=white)](https://flask.palletsprojects.com)
[![License](https://img.shields.io/badge/License-MIT-green?style=flat-square)](LICENSE)
[![Tests](https://img.shields.io/badge/Tests-41%20passed-brightgreen?style=flat-square)](tests/)

**输入纯文本 → 智能识标题 → AI 润色摘要 → 生成封面图 → 实时预览 → 一键推送草稿箱**

[即刻开始](#-快速开始) · [核心能力](#-核心能力) · [为什么选择它](#-为什么选择它) · [主题画廊](#-主题画廊) · [技术栈](#-技术栈)



---

## 📌 这是一个为谁准备的工具？

如果你运营微信公众号并正在经历以下场景，它就是为你量身打造的：

**「排版半小时，发文一分钟」**
在那些知名编辑器里拖模板、调字号、改颜色，完成一篇普通的排版需要 15-20 分钟。如果文章里还有代码块、引用块、多级标题……噩梦加倍。

**「AI 用起来很爽，但很割裂」**
先用 ChatGPT 润色，再去其他平台生成摘要，再到另一个工具做封面图——内容在三个窗口间来回跳转，格式在复制粘贴中变形。

**「推送流程太长」**
排版完了才发现还要配封面图、写摘要、登录公众号后台手动创建草稿……一篇推文的完整流程碎片化到让人崩溃。

> **SuperSu 将这些零散的步骤全部串联成一条流水线。你只需要写内容，剩下的交给引擎。**

---

## 🚀 核心能力

### 📝 智能排版 — 粘贴即呈现

| 能力 | 说明 |
|:---|:---|
| **纯文本 → Markdown** | 本地规则引擎，零延迟识别标题、序号、引用、代码块、列表，无需等待 AI |
| **Markdown → 微信 HTML** | 53 套主题，自动注入内联 `style` 属性，完美兼容微信编辑器 |
| **LLM 后台优化** | AI 异步美化 Markdown 结构，SSE 实时推送，支持优化前后一键切换对比 |
| **实时预览** | 输入即渲染（400ms 防抖）+ iPhone Dynamic Island 手机模式模拟 |

### 🤖 AI 工具箱 — 三合一

**AI 润色** — 三种风格自由切换：「去 AI 味」让机器感消失、「正式」适配企业发布、「轻松」贴近口语化。结果可编辑，按需微调。

**AI 摘要** — 自动提取 80-100 字人性化摘要，无需手动提炼，推送弹窗中一键生成。

**AI 标题图** — 输入标题 + 正文，LLM 提取关键词 → 文生图 API 生成 900×383 封面 → PIL 叠加标题文字。API 不可用时自动降级为纯色渐变 fallback，永远不会空手而归。

### 📤 一键推送 — 30 秒到草稿箱

选择公众号 → 生成摘要 → 生成封面 → 确认推送，全程在同一个弹窗内完成，无需离开编辑器。

- **Token 自动管理**：单例缓存 + 自动刷新 + 重试机制，多线程安全
- **多公众号**：支持添加/删除多个配置，加密存储 AppSecret
- **白名单引导**：推送失败时在弹窗内显示服务器 IP + 复制按钮 + 官方设置教程链接

### 🛡️ 安全与可靠性

- **纯本地部署**：所有代码运行在你自己的服务器上，数据不出网
- **API Key 加密存储**：使用 `cryptography` 库加密，迁移到用户配置目录
- **Token 管理线程安全**：双重检查锁定 + 按 appid 粒度锁 + 3 次重试
- **定时清理**：临时封面图 2 小时自动清理，防磁盘堆积

---

## ⚖️ 为什么选择它

| 维度 | SuperSu | 传统在线编辑器 | 其他 Markdown 工具 |
|:---|:---:|:---:|:---:|
| 🤖 纯文本一键识别排版 | ✅ 粘贴即排 | ❌ 手动拖模板 | ❌ 需写 Markdown |
| 🎨 AI 润色 + 摘要 + 封面 | ✅ 三合一弹窗 | ❌ 各自为政 | ❌ 无 |
| 📤 直接推送草稿箱 | ✅ 弹窗内完成 | ❌ 复制粘贴 | ❌ 仅生成 HTML |
| 🏠 本地部署 / 数据隐私 | ✅ 完全自主可控 | ❌ 内容上传云端 | ❌ 依赖第三方 API |
| 🎭 53 套主题一键切换 | ✅ 秒切 | ✅ 但需手动+慢 | ❌ 极少 |
| 📱 iPhone 手机预览 | ✅ Dynamic Island 模拟 | ❌ 无 | ❌ 无 |
| 🔄 SSE 实时 AI 优化流 | ✅ 异步推送 | ❌ 阻塞等待 | ❌ 无 |
| 💰 费用 | ✅ 免费，仅付 API 费用 | ❌ 会员制 | ❌ 按量计费 |

> **一句话：目前市面上，没有第二个工具能让你在一个界面内完成"纯文本 → AI 润色 → 生成摘要 → 生成封面 → 推送草稿箱"的完整闭环，且全程本地可控。**

---

## 🎨 主题画廊

53 套手写主题 JSON，覆盖主流风格：

| 风格 | 主题示例 |
|:---|:---|
| 🃏 卡片系列 | warm-card, fresh-card, ocean-card |
| 📰 深度长文 | newspaper, magazine, ink, coffee-house |
| 💻 科技产品 | bytedance, github, sspai, midnight |
| 🌸 文艺随笔 | terracotta, mint-fresh, sunset-amber, lavender-dream |
| ⚡ 活力动态 | sports, bauhaus, chinese, wechat-native |
| 📐 模板布局 | minimal-gold, focus-blue, elegant-green, bold-blue |

每套主题均含完整的标题、正文、引用、代码、表格、按钮等样式的内联 CSS 定义。

---

## 🏗️ 技术栈

```
┌─────────────┐     HTTP/SSE     ┌─────────────┐
│  浏览器前端   │ ◄────────────► │  Flask 后端  │
│  (原生 JS)   │    AJAX/SSE     │  (Python)    │
└─────────────┘                 └──────┬──────┘
                                        │
                             ┌──────────┼──────────┐
                             ▼          ▼          ▼
                        LLM API    文生图 API   微信公众平台
                       (润色/摘要)  (标题图)    (草稿箱)
```

| 模块 | 职责 |
|:---|:---|
| `app.py` | Flask 主入口，路由管理，SSE 推送 |
| `format_engine.py` | Markdown → 微信兼容内联样式 HTML（53 主题） |
| `preprocessor.py` | 纯文本 → Markdown 规则引擎（零延迟） |
| `ai_client.py` | OpenAI 兼容格式 LLM 调用（多平台适配） |
| `image_gen.py` | 文生图 + PIL fallback 封面图管线 |
| `token_manager.py` | 微信 Access Token 线程安全单例 |
| `wechat_publisher.py` | 草稿箱创建 + 素材上传 + 图片过滤警告 |
| `crypto_utils.py` | AppSecret / API Key 加密存储 |
| `index.html` | 单页前端，全部交互在此文件内 |

---

## 🚀 快速开始

### 1. 克隆 & 安装

```bash
git clone https://github.com/sulcr1983/wechatca2.git
cd wechatca2
pip install -r requirements.txt
```

### 2. 配置 API

```bash
cp .env.example .env
```

编辑 `.env`，填入你的 LLM 服务信息（支持阿里云百炼、OpenAI、DeepSeek 等任何兼容接口）：

```bash
# LLM 配置（润色、摘要、关键词提取）
LLM_BASE_URL=https://dashscope.aliyuncs.com/compatible-mode/v1
LLM_API_KEY=sk-your-api-key
LLM_MODEL=qwen-plus

# 文生图配置（可选，无则自动纯色背景）
IMAGE_GEN_BASE_URL=https://dashscope.aliyuncs.com/compatible-mode/v1
IMAGE_GEN_API_KEY=sk-your-api-key
IMAGE_GEN_MODEL=wanx-v1
```

### 3. 启动

```bash
python app.py
```

浏览器打开 `http://127.0.0.1:5000` 即可使用。

> 💡 也可双击 `launcher.py`，自动安装依赖并启动。

### 4. 绑定公众号

在设置弹窗中添加公众号的 AppID 和 AppSecret（加密存储，安全无忧）。

---

## 🧪 测试覆盖

| 测试套件 | 数量 | 命令 |
|:---|:---:|:---|
| Flask API e2e | 41 项 | `python tests/test_e2e.py` |
| agent-browser 全用户流程 | 18 步交互截图 | `tests/agent_browser_full_flow.ps1` |
| 排版引擎 | 53 主题全量测试 | 内嵌于 e2e |

---

## ⚠️ 当前限制 & 近期路线

| 项目 | 状态 |
|:---|:---:|
| ✅ 正文图片自动上传微信 CDN | 计划中（当前推送时自动移除并提示） |
| ✅ 文章库（保存/编辑/删除） | 计划中 |
| ✅ 多公众号批量推送 | 计划中 |
| ✅ 自定义主题导入 | 计划中 |
| ✅ 一键发布（认证服务号） | 计划中 |

---

## 📄 开源协议

MIT License — 自由使用、修改和分发。

---


**写内容，不写排版。SuperSu 帮你处理剩下的一切。**

[立即体验](https://github.com/sulcr1983/wechatca2) · [报告问题](https://github.com/sulcr1983/wechatca2/issues) · [功能建议](https://github.com/sulcr1983/wechatca2/discussions)

⭐ 如果这个工具帮你节省了时间，Star 就是最好的反馈。

Made with ❤️ by [sulcr1983](https://github.com/sulcr1983)

