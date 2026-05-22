<div align="center">

# ✨ WechatAI Formatter

### 🚀 30 秒完成排版，20 分钟变 30 秒的微信公众号 AI 排版神器

[![Python](https://img.shields.io/badge/Python-3.10+-3776AB?style=flat-square&logo=python&logoColor=white)](https://python.org)
[![Flask](https://img.shields.io/badge/Flask-3.0+-000000?style=flat-square&logo=flask&logoColor=white)](https://flask.palletsprojects.com)
[![License](https://img.shields.io/badge/License-MIT-green?style=flat-square)](LICENSE)
[![Tests](https://img.shields.io/badge/Tests-55%20passed-brightgreen?style=flat-square)](tests/)

**粘贴纯文本 → AI 自动排版 → 实时预览 → 一键推送到微信公众号草稿箱**

[快速开始](#-快速开始) · [功能特性](#-功能特性) · [对比优势](#-对比优势) · [截图展示](#-截图展示) · [技术架构](#-技术架构)

</div>

---

## 🎯 为什么做这个工具？

运营公众号最痛苦的不是写文章，而是**排版**。每次花 20 分钟在 135 编辑器里拖来拖去，调字号、改颜色、加引用块……写完文章还得再"装修"一遍。

WechatAI Formatter 就是来解决这个问题的：**你只管写，排版交给 AI**。

---

## 🌟 功能特性

### 📝 智能排版
- **本地预处理**：纯文本自动识别标题、列表、引用、代码块，0 延迟即时预览
- **AI 后台优化**：LLM 异步优化 Markdown 结构，SSE 实时推送优化结果
- **53 套精美主题**：从科技蓝到文艺风，从卡片布局到报纸排版，一键切换

### 🤖 AI 能力
- **AI 润色**：去 AI 味 / 正式 / 轻松三种风格，原文对比可编辑
- **AI 摘要**：自动生成 80-100 字人性化摘要
- **AI 标题图**：文生图 + PIL fallback，自动生成 900×383 封面图

### 📱 微信推送
- **一键推送草稿箱**：选择公众号 → 填摘要 → 生成封面 → 推送，全流程 30 秒
- **多公众号管理**：支持添加/删除多个公众号配置
- **Token 自动管理**：单例缓存 + 自动刷新，无需手动处理

### 🎨 预览体验
- **实时预览**：输入即渲染，400ms 防抖
- **iPhone 手机预览**：Dynamic Island 风格模拟框，所见即所得
- **AI 优化指示器**：本地版/优化版一键切换

---

## ⚡ 对比优势

| 特性 | WechatAI Formatter | 135 编辑器 | 墨滴 | 秀米 |
|:---|:---:|:---:|:---:|:---:|
| 🤖 AI 自动排版 | ✅ | ❌ | ❌ | ❌ |
| 📝 纯文本粘贴即排 | ✅ | ❌ 需手动 | ❌ | ❌ |
| 🎨 50+ 主题一键切换 | ✅ 53 套 | ✅ 但需手动 | ❌ | ✅ 但需手动 |
| 📤 一键推送草稿箱 | ✅ | ❌ 需复制粘贴 | ❌ | ❌ |
| 🤖 AI 润色/摘要/封面 | ✅ 三合一 | ❌ | ❌ | ❌ |
| 📱 手机预览 | ✅ iPhone 模拟 | ❌ | ❌ | ✅ |
| 🔒 数据隐私 | ✅ 完全本地 | ❌ 云端 | ❌ 云端 | ❌ 云端 |
| 💰 费用 | ✅ 免费（API 自备） | ❌ 会员制 | ❌ 会员制 | ❌ 会员制 |
| 🖥️ 离线使用 | ✅ 排版功能可离线 | ❌ | ❌ | ❌ |

> **核心差异**：其他工具都是"手动排版"，我们是"AI 自动排版"。你只需要写内容，格式、样式、摘要、封面图全部自动生成。

---

## 📸 截图展示

### 主界面 — 左右分栏实时预览
```
┌─────────────────────────────────────────────────────────┐
│  WechatAI Formatter    ⚙️ 设置  模板:▼  公众号:▼       │
├──────────────────────┬──────────────────────────────────┤
│                      │  完整HTML | 📱 手机预览          │
│   在此粘贴纯文本...   │                                  │
│                      │  ┌──────────────────────────┐    │
│   人工智能概述        │  │  ## 人工智能概述          │    │
│                      │  │  人工智能就是让机器...     │    │
│   一、发展历程        │  │  ## 一、发展历程          │    │
│                      │  │  近年来 AI 飞速发展...    │    │
│                      │  └──────────────────────────┘    │
├──────────────────────┴──────────────────────────────────┤
│  ✨ AI 润色   📋 复制   📁 历史   📤 一键推送           │
└─────────────────────────────────────────────────────────┘
```

### 推送弹窗 — 全流程 30 秒
```
┌─────────────────────────────────────┐
│  📤 推送到草稿箱                     │
│                                     │
│  选择公众号: [So talk ▼]             │
│                                     │
│  摘要（80-100字）                    │
│  ┌─────────────────────────────┐    │
│  │ 这是关于AI技术发展的...       │    │
│  └─────────────────────────────┘    │
│  🤖 一键生成摘要                    │
│                                     │
│  标题图                             │
│  ┌──────────────┐                   │
│  │   🖼️ 封面图   │ 🤖 一键生成标题图 │
│  └──────────────┘                   │
│                                     │
│           取消    📤 确认推送        │
└─────────────────────────────────────┘
```

---

## 🏗️ 技术架构

```
┌─────────────┐     HTTP      ┌─────────────┐
│  浏览器前端   │ ◄──────────► │  Flask 后端  │
│ (HTML/JS)   │    AJAX/SSE   │  (Python)    │
└─────────────┘               └──────┬──────┘
                                     │
                          ┌──────────┼──────────┐
                          ▼          ▼          ▼
                     LLM API    文生图 API   微信公众平台API
                    (摘要/润色)  (标题图)    (草稿箱)
```

### 核心模块

| 模块 | 文件 | 职责 |
|:---|:---|:---|
| 排版引擎 | `core/format_engine.py` | Markdown → 微信兼容内联样式 HTML |
| 文本预处理 | `core/preprocessor.py` | 纯文本 → Markdown 智能识别 |
| AI 客户端 | `core/ai_client.py` | OpenAI 兼容格式 LLM 调用 |
| 封面图生成 | `core/image_gen.py` | 文生图 + PIL fallback |
| Token 管理 | `core/token_manager.py` | 微信 Access Token 缓存单例 |
| 微信推送 | `core/wechat_publisher.py` | 草稿箱创建、素材上传 |

---

## 🚀 快速开始

### 1. 克隆项目

```bash
git clone https://github.com/sulcr1983/wechatca2.git
cd wechatca2
```

### 2. 安装依赖

```bash
pip install -r requirements.txt
```

### 3. 配置环境变量

```bash
cp .env.example .env
```

编辑 `.env` 文件，填入你的 API 密钥：

```bash
# LLM 服务（支持阿里云百炼、OpenAI、DeepSeek 等兼容 API）
LLM_BASE_URL=https://dashscope.aliyuncs.com/compatible-mode/v1
LLM_API_KEY=sk-your-api-key
LLM_MODEL=qwen-plus

# 文生图服务（可选，无则自动使用纯色背景）
IMAGE_GEN_BASE_URL=https://dashscope.aliyuncs.com/compatible-mode/v1
IMAGE_GEN_API_KEY=sk-your-api-key
IMAGE_GEN_MODEL=wanx-v1
```

### 4. 启动

```bash
python app.py
```

浏览器自动打开 `http://127.0.0.1:5000`，开始使用！

> 💡 也可以双击 `launcher.py`，自动安装依赖并启动。

### 5. 添加公众号

在 Web 界面点击「📤 一键推送」→「⚙️ 管理公众号」，填入公众号的 AppID 和 AppSecret 即可。

---

## 🧪 测试

### Flask API 测试（41 项）

```bash
python tests/test_e2e.py
```

### Playwright 浏览器测试（14 项）

```bash
pip install pytest-playwright
python -m playwright install chromium
python -m pytest tests/test_browser_e2e.py -v
```

---

## 📁 项目结构

```
wechatca2/
├── app.py                    # Flask 主入口
├── launcher.py               # 双击启动脚本
├── .env.example              # 环境变量模板
├── requirements.txt          # Python 依赖
├── core/
│   ├── __init__.py
│   ├── format_engine.py      # Markdown→微信HTML 排版引擎
│   ├── preprocessor.py       # 纯文本→Markdown 本地预处理
│   ├── ai_client.py          # LLM 调用（OpenAI 兼容 API）
│   ├── image_gen.py          # 标题图生成（文生图 + PIL fallback）
│   ├── token_manager.py      # 微信 Access Token 管理
│   └── wechat_publisher.py   # 微信草稿箱推送
├── templates/
│   └── index.html            # 单页前端
├── assets/
│   └── themes/               # 53 个排版主题 JSON
├── tests/
│   ├── test_e2e.py           # Flask API 测试
│   └── test_browser_e2e.py   # Playwright 浏览器测试
└── data/                     # 运行时数据（gitignore）
```

---

## 🎨 主题预览

53 套主题按风格分类：

| 分类 | 主题示例 |
|:---|:---|
| 🃏 卡片系列 | warm-card, fresh-card, ocean-card |
| 📰 深度长文 | newspaper, magazine, ink, coffee-house |
| 💻 科技产品 | bytedance, github, sspai, midnight |
| 🌸 文艺随笔 | terracotta, mint-fresh, sunset-amber, lavender-dream |
| ⚡ 活力动态 | sports, bauhaus, chinese, wechat-native |
| 📐 模板布局 | minimal-gold, focus-blue, elegant-green, bold-blue |

---

## ⚠️ 已知限制

- 正文图片：当前版本推送时会过滤掉所有 `<img>` 标签（计划下版本支持）
- 文生图 API 依赖外部服务，失败时自动降级为纯色渐变背景
- 微信草稿箱接口有调用频率限制（正常使用不会触及）

---

## 📋 后续计划

- [ ] 正文图片自动上传到微信 CDN
- [ ] 文章库管理（保存/编辑/删除草稿）
- [ ] 多公众号批量推送
- [ ] 自定义主题导入
- [ ] 一键发布（需认证服务号）

---

## 📄 开源协议

MIT License — 自由使用、修改和分发。

---

<div align="center">

**如果觉得有用，给个 ⭐ Star 吧！**

Made with ❤️ by [sulcr1983](https://github.com/sulcr1983)

</div>
