# SuperSu · 公众号排版 + 小红书封面工具

粘贴纯文本，自动排版。不需要 AI 的时候，一步都不用点。

[![Python](https://img.shields.io/badge/Python-3.10+-3776AB?style=flat-square&logo=python&logoColor=white)](https://python.org)
[![Flask](https://img.shields.io/badge/Flask-3.0+-000000?style=flat-square&logo=flask&logoColor=white)](https://flask.palletsprojects.com)
[![Tests](https://img.shields.io/badge/Tests-E2E%2040%2F41%20%7C%20Int%2035%2F35-blue?style=flat-square)](tests/)

---

## 做什么

| 功能 | 说明 |
|------|------|
| **自动排版** | 粘贴纯文本 → 自动识别标题/列表/引用 → Markdown → 53 套主题任选（纯本地规则，零延迟零费用） |
| **小红书封面** | 输入文案 → 选模板 → 一键生成 3:4 / 1:1 / 21:9 封面图（归藏设计系统） |
| **AI 润色** | 折叠在弹窗里，需要时展开。去 AI 味 / 正式 / 轻松三种风格 |
| **AI 摘要** | 自动提取 80-100 字摘要 |
| **公众号推送** | 选择账号 → 生成封面 → 一键推送到微信草稿箱 |
| **数据本地** | 全部运行在本地，API Key 加密存储，不上传任何内容到第三方 |

核心理念：**不做不需要的事。** 默认就是输入→排版，AI 功能全部折叠，点了才展开。

---

## 快速开始

```bash
pip install -r requirements.txt
python app.py
# 浏览器打开 http://127.0.0.1:5000
```

如需封面生成功能：
```bash
playwright install chromium
```

配置 `.env`（可选，不配也能用核心排版；AI 功能才需要）：
```bash
LLM_BASE_URL=https://dashscope.aliyuncs.com/compatible-mode/v1
LLM_API_KEY=sk-your-key
LLM_MODEL=qwen-plus
```

---

## 主题一览

53 套手写主题，覆盖主流风格：

**卡片系列** warm-card / fresh-card / ocean-card
**深度长文** newspaper / magazine / ink / coffee-house
**科技产品** bytedance / github / sspai / midnight
**文艺随笔** terracotta / mint-fresh / sunset-amber / lavender-dream
**活力动态** sports / bauhaus / chinese / wechat-native
**模板布局** minimal-gold / focus-blue / elegant-green / bold-blue
……等更多

---

## 架构

```
app.py                  Flask 主应用
core/
  format_engine.py      排版引擎（53 主题 Markdown → 微信 HTML）
  preprocessor.py       纯文本 → Markdown 规则引擎
  ai_client.py          多平台 LLM 客户端
  image_gen.py          封面图生成管线
  token_manager.py      微信 Token 管理
  wechat_publisher.py   公众号草稿推送
  crypto_utils.py       API Key 加密
  blcaptain_bridge.py   BLCaptain 封面引擎适配层（Node.js）
  guizang_renderer.py   归藏封面渲染器（备用）
scripts/
  render_worker.py      归藏封面渲染器
  gen_thumbnails.py     用 Playwright 生成封面缩略图
  gen_thumbnails_pil.py 用 PIL 生成占位缩略图
templates/index.html    单页前端
public/themes/          53 套主题 JSON
public/cover-templates/ 10 套封面模板
docs/prototypes/        早期 HTML 原型
```

---

## 测试

```bash
python tests/test_e2e.py         # E2E 40/41（1 项陈旧 UI 断言待清，目标 41/41）
python tests/test_integration.py # 集成测试 35/35（需先起服务）
python tests/test_headed_userflow.py # 有头 E2E 7/7（Playwright，需 chromium）
```

---

## 项目文档

- [claude.md](claude.md) — 给 AI Agent 读的项目规则（路由表、架构、注意事项）
- [references/SKILL.md](references/SKILL.md) — 归藏封面设计系统规范
