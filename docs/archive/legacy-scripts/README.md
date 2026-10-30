# 历史审计脚本（已归档）

> ⚠️ **已归档，已过期**。本目录原为 `scripts/legacy/`，2026-10-30 收尾时移入 `docs/archive/`。
> 现行脚本清单见 `AGENTS.md` §3 与 `STATE.md`；这些脚本**不在任何门禁里**，不要照旧文档直接跑。

## 为什么归档

这些是**一次性验收工具**，服务于已完成的历史任务，不属于产品代码：

| 文件 | 原始用途 | 现状 |
|:--|:--|:--|
| `audit_e2e.py` | 有头浏览器全按钮 E2E 审计 | ❌ **已失效**：依赖已封存的本地 Flask 版（`127.0.0.1:5000`），该服务 2026-10-28 已移出工作区 |
| `gen_review.py` | 六族主题「生成后验证 + 审查台」 | ⚠️ 理论上仍可跑（只依赖 `core/format_engine.py`），但对应的六族主题早已验收完毕 |
| `output-audit/` | 审查台截图与逐项验证（12 个脚本：`shots.py` / `shot_layout.py` / `test_themes_full.py` / `verify_*.py` / `walkthrough_full.py`） | ⚠️ 同上，一次性产物 |

## 为什么不是删除

`gen_review.py` 仍依赖 `core/format_engine.py`，是**唯一一份能批量验证 72 套主题标签平衡的独立脚本**。
未来若主题体系大改，它的思路（用真实渲染链路跑富样本、查标签平衡/None/残渣）仍有参考价值。
按项目惯例（`ARCHIVE.md` 记录封存物、`docs/archive/` 保留历史全文），归档比删除更稳妥。

## 要用怎么办

```bash
# 需要时从归档目录直接跑（路径已按新位置调整，用前先确认相对路径）
.venv/Scripts/python.exe docs/archive/legacy-scripts/gen_review.py
```

> 注意：`audit_e2e.py` 要能跑，必须先把 Flask 版从 tag `flask-v1-archive-2026-10-28` 取回（见 `ARCHIVE.md`）。
