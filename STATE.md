<!-- ⚠️ 本文件由 scripts/gen_state.py 自动生成，禁止手改。
     手改会在下次生成时被覆盖；要改内容请改脚本或数据源。 -->

# STATE — 项目单一状态源

> **本文件是「当前状态」的唯一真源。** 其他文档（README / AGENTS / HANDOFF / CLOSURE …）
> 只允许**指向**本文件，不允许自己写版本号、构建号、测试计数。
>
> 生成时间：2026-10-27 18:43
> 生成命令：`python scripts/gen_state.py`

## 版本与部署

| 项 | 值 |
|---|---|
| 版本号 | **v1.6.0** |
| 本地 dist 构建号 | **b233** |
| 线上构建号 | b231  |
| 部署状态 | ⚠️ **线上落后**（线上 b231，本地 b233，尚未部署） |
| 分支 | `main` |
| HEAD | `e7578d2`（共 233 个提交）|
| 工作区 | ⚠️ 有未提交改动 |

## 产品规模

| 项 | 值 |
|---|---|
| 主题数 | 164 套 |
| 版式 | 8 种（默认 / 图文节奏 / 卡片流 / 目录导航 / 杂志分栏 / 首屏 / 卡片组 / 时间线）|
| 段落样式 | 3 种（金句 / 数据 / 提示，按内容自动识别）|
| 主产品 | PWA `https://supersu.ccwu.cc` |
| 本地 Flask 版 | 已弃用（保留参考，不进任何门禁）|

## 最近一次门禁

- 时间：2026-10-27 18:40
- 结果：**13/13**
- 日志：`output/gate-run/run-20261027-183458.log`

## 门禁套件（从 `scripts/run_gates.py` 自动读取）


**本地层（默认）**

| 套件 | 覆盖 |
|---|---|
| `ai_preset` | AI 平台预设 21 |
| `ai_format` | AI 排版 27 |
| `theme_drawer` | 模板库全量审计 59 |
| `export` | 导出四件套 12 |
| `nine` | 九宫格切图 15 |
| `cover` | 封面 18（1 SKIP 网络） |
| `cover_tpl` | 封面模板单测 35 |
| `ai_plan` | AI 排版结构单测 20 |
| `theme_spec` | 模板配色审计（对照归藏规范） |
| `layout_compat` | 版式兼容矩阵 100 |

**线上层（--online）**

| 套件 | 覆盖 |
|---|---|
| `release_card` | 发布小票 9（打线上） |
| `online_e2e` | 线上全量 97 |

**扩展层（--full）**

| 套件 | 覆盖 |
|---|---|
| `auto_update` | 静默自动更新 8（本地探针） |
| `offline` | 断网可用性 10 |
| `s1s3` | 首屏不阻塞 + AI 链路 9 |
| `light_preview` | 轻量即时预览 6 |
| `template_ux` | 模板库体验 5 |
| `image_localize` | 外链图本地化 12 |

## 怎么跑

```bash
# 改过 pwa/src / core 引擎 / themes → 必须先重建
node pwa/scripts/build.mjs

# 前置检查（dist 新鲜度 / 工作区）
python scripts/preflight.py

# 门禁
python scripts/run_gates.py              # 本地层（默认，测当前代码）
python scripts/run_gates.py --ui         # + 有头全量（164 套模板 / 8 版式）
python scripts/run_gates.py --online     # + 线上层（部署后验证）

# 一键全测（推荐日常用）
python scripts/test_all.py --list

# 发版（一条命令走完 10 步）
python scripts/release.py --dry-run      # 先演练
python scripts/release.py                # 正式发版
```

## 文档约定

- **本文件（STATE.md）是当前状态唯一真源**，由脚本生成，禁止手改
- 其他文档只允许指向本文件，不允许自己写版本号 / 构建号 / 测试计数
- 历史快照（HANDOFF.md / CLOSURE.md 等）必须带「已过期」声明条
- 校验：`python scripts/doc_sync_check.py`
