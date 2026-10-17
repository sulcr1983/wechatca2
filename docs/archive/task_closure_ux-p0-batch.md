# 任务收尾：UX 第一批（止血）U-1…U-6

- **日期**：2026-09-25
- **提交**：`a4c869e`（本地，未推送）
- **依据**：`docs/ux-audit/final-plan.html`（v3 定稿）「第一批 · 止血」
- **用户决策**：6 项一次做完 · 引入 fitty · 全部做完再推

---

## 1. 交付内容

| 编号 | 事项 | 落点 | 结果 |
|------|------|------|------|
| U-1 | 预览卡露出 `<br>` | `templates/index.html`（`extractSocialDesc` join + `.spv-desc` CSS） | ✅ 验收 PASS |
| U-2 | 封面标题溢出/截断/重叠 | 归藏：`core/guizang_renderer.py` 注入 fitty；BLCaptain：`core/blcaptain_bridge.py::_normalize_cover_text` | ✅ 实跑出图人工核验 |
| U-3 | 生成无进度反馈 | `app.py`（`_GEN_PROGRESS` + `/api/social/progress/<task_id>`）+ 前端轮询/置灰 | ✅ 验收 PASS |
| U-4 | 署名写死"自动联网搜索" | `templates/index.html`（按来源分支 + 转义） | ✅ 验收 PASS |
| U-5 | 输入框预置整篇示例 | 清空初始内容 + "看示例/清空"按钮 + 记住上次主题 | ✅ 验收 PASS |
| U-6 | 主次倒置 / 推送门槛无引导 | 复制与推送同级主按钮 + 未配置引导到设置 | ✅ 验收 PASS |

新增资产：`public/vendor/fitty.min.js`（MIT v2.4.2）、`scripts/ux_verify_p0.py`（P0 有头验收脚本，15 项）。

## 2. 关键发现（实施中修正了方案的一处想当然）

- **BLCaptain 溢出的真因不是"标题字数"**：实测引擎 plan 会把**输入的前两行拼成一个标题**（14 字标题 + 副标题 → 27 字），而模板字号写死（`.sp-display` 76px）、CLI 又无脚本注入口，故必溢出。
  - 首版按"钳制输入首行 ≤16 字"修复 **无效**（首行仅 14 字，未触发阈值）。
  - 有效修复：**标题后补空行**打断引擎拼接（实测标题保持 14 字、副标题落入正文卡），并保留超长钳制兜底。
  - 结论已写入代码注释与 `AGENTS.md` §12，避免后人重踩。

## 3. 验证证据（真实执行）

| 套件 | 结果 |
|------|------|
| `tests/test_e2e.py` | 52/52 ✅ |
| `tests/test_integration.py` | 35/35 ✅ |
| `tests/test_api_e2e.py` | 29/29 ✅ |
| `tests/test_headed_full_e2e.py` | **33/33 ✅**（0 控制台报错，含新契约断言） |
| `scripts/ux_verify_p0.py` | **15/15 ✅**（U-1/U-3/U-4/U-5/U-6 逐项） |
| 封面三引擎实跑 | editorial / swiss / sp-mist 均出真实 PNG；sp-mist 人工核验不再溢出 |

截图对照：`docs/ux-audit/shots/`（改前基线）vs `docs/ux-audit/shots/after/`（改后）。

## 4. 文档同步

- `files/TODO.md`：U-1…U-6 打勾并写入验收结论。
- `AGENTS.md`：§12 补"实施状态"（含落点提示：fitty 注入点、BLCaptain 兜底函数名），纪律行计数同步 33/33。
- `HANDOFF.md`：新增「变更 12」。
- 本文件：本批收尾。

## 5. 遗留与下一步

- **U-2 的 BLCaptain 侧是"兜底"而非"自适应"**：真自适应需改 vendored 子项目模板（`blcaptain-style-skill/assets/*.html` 内联 fitty），受"嵌套仓库分别提交"纪律约束，且该目录被父仓 `.gitignore` 排除。→ 建议列为独立事项，等用户决定（详见 `final-plan.html` 说明）。
- **第二批（U-7…U-11）未开始**：悬停试看 + 最近置顶 · 搜索空结果兜底 · 小红书空态示例 · 搜图缓存 · 文案说人话。
- **推送未做**：按纪律需用户明确指令才 push（当前本地领先 origin/main）。

---

*收尾状态：第一批已闭环（代码 + 回归 + 文档 + 本地提交）；第二批待启动。*
