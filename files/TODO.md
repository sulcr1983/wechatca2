# SuperSu 任务清单

> 本文件为项目级任务跟踪。每项完成后打 ✅ 并标注完成日期。

## 已完成 ✅

| # | 任务 | 完成日期 | 说明 |
|---|------|----------|------|
| F1 | 小红书封面引擎可用（Playwright + Chromium） | 2026-07-11 | venv 安装 playwright，requirements.txt 标记必需 |
| F2 | 关闭孤儿 LLM 调用 | 2026-07-11 | 默认关闭 _start_background_optimization |
| F3 | 集成测试重写对齐真实前端 | 2026-07-11 | 35/35 全绿 |
| D-1 | 结果卡显示真实封面图（非色块占位） | 2026-07-24 | `<img src="${r.url}">` |
| D-2 | 归藏渲染配色对齐设计铁律 | 2026-07-24 | 局部 tint 替代全画布暗渐变 |
| D-3 | 社交页移动端可见性修复 | 2026-07-24 | 堆叠替代 display:none |
| D-4 | 风格选择器消费 API 规范 id | 2026-07-24 | loadSocialStyles() + data-style |
| W-1 | 公众号移动端主题可访问 | 2026-07-24 | max-height:42vh 可滚动 |
| PM-1 | 公众号页布局重排（模板条+双区） | 2026-07-25 | tpl-bar + wechat-body grid 2-col |
| T1 | 批量生成 84 套颜色克隆主题 | 2026-07-25 | → 后续被删除（用户否决） |
| T2 | 适配 85 套开源外部主题 | 2026-07-25 | xh-* 前缀，from xiaohu-wechat-format |
| T3 | 去重：删除 84 颜色克隆 + 38 xh 重复 | 2026-07-25 | 安全门限批准后分批删除 |
| T4 | 去重：原创撞色 8 套删除 | 2026-07-25 | 每组留代表，92 套最终 |
| S1 | 小红书页布局重排（2列+画廊+Lightbox） | 2026-07-25 | .social-ctrl/.social-right/.results-grid |
| **S2** | **自动联网搜真图作底图** | **2026-07-25** | **core/image_search.py 双轨 Wikimedia/Pexels** |
| S3 | Playwright file:// → data: URI 修复 | 2026-07-25 | guizang_renderer 底图内嵌 |
| DOC | README 重写（图文并茂+表情丰富） | 2026-07-25 | 4 张截图 + mermaid 架构图 |
| CLEAN | 文档洁癖同步（AGENTS/HANDOFF/design-audit） | 2026-07-25 | 53→92、DOM 结构、搜图模块、偏差标已解决 |

## 进行中 / 待办

| # | 任务 | 优先级 | 说明 |
|---|------|--------|------|
| E2E-1 | 清理 E2E 中 1 项陈旧 UI 断言 | P2 | 目标 41/41（当前 40/41） |
| D5-FIX | 风格分组对齐 API group 字段 | P2 | 功能无碍，语义精确化 |
| DEADCODE | 删除 scripts/render_worker.py 死代码 | P3 | 与 guizang_renderer.py 双份 |

---
*最后更新：2026-07-25*
