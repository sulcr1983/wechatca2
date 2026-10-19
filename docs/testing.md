# 测试说明

6 套件，190 个断言。四套自己起服务，两套要你先开 `app.py`。

```bash
# 环境
pip install -r requirements.txt && playwright install chromium
python app.py            # 另开一个终端，http://127.0.0.1:5000
```

## 六套件

| 套件 | 文件 | 数量 | 有头 | 覆盖 | 耗时 |
|---|---|---|---|---|---|
| 端到端 | `tests/test_e2e.py` | 74 | 否 | 页面结构、渲染、复制、主题切换、AI 降级、格式兼容 | ~40s |
| 集成 | `tests/test_integration.py` | 35 | 否 | 真实前端 DOM 契约（选择器/字体） | ~20s |
| API 全端点 | `tests/test_api_e2e.py` | 29 | 否 | 28 个路由逐个打通 | ~15s |
| 有头全按钮 | `tests/test_headed_full_e2e.py` | 33 | **是** | 双页所有按钮，0 控制台报错 | ~90s |
| 有头用户流程 | `tests/test_headed_userflow.py` | 7 | **是** | 粘贴→选风格→预览→复制 走一遍 | ~45s |
| 有头复制 | `tests/test_headed_wechat_copy.py` | 12 | **是** | 剪贴板、富文本粘贴、样式还原 | ~40s |

基线（2026-10-19 实测）：**74 / 35 / 29 / 33 / 7 / 12 = 190 全绿**。任一项掉了就是回归。

## 跑法

```bash
# 三套自起服务的（不用先开 app.py）
.venv/Scripts/python.exe tests/test_e2e.py          # Flask test client，不开端口
.venv/Scripts/python.exe tests/test_api_e2e.py      # 自己起 Flask，要求 5000 空闲
.venv/Scripts/python.exe tests/test_headed_full_e2e.py   # 自己起 Flask + 系统浏览器
.venv/Scripts/python.exe tests/test_headed_wechat_copy.py

# 两套要你有服务在跑（先 python app.py）
.venv/Scripts/python.exe tests/test_integration.py
.venv/Scripts/python.exe tests/test_headed_userflow.py
```

⚠️ 自起服务的套件发现 5000 已被占用会直接 `[ABORT]`——这是防止连到旧进程拿陈旧代码**假通过**，别绕过。

## 五个坑（都踩过）

1. **有头套件刻意不点 3 个按钮**：`confirmPush`（真打微信接口）、`saveAiConfig` / `testAiConfig`（会覆盖 `data/ai_config.json`）。这三条由 `test_api_e2e.py` 在后端覆盖，别为凑数去点。

2. **AI 按钮验收禁止固定 sleep**。LLM 慢的时候会被误判成「优雅降级」而**假通过**。必须轮询到「真实产出 or 真报错」，超时未结束判 FAIL。

3. **`test_e2e.py` 会写 `data/`**。已加测试前快照 + 结束还原，但跑之前仍建议手动备份 `data/`（里面有加密的 AppSecret）。

4. **Clash 拦 localhost**。curl 用 `--noproxy '*'`；Playwright 用 `chromium.launch(args=["--no-proxy-server"])`。

5. **字体断言用 rem 不用 px**。`test_integration.py` 断的是响应式字号（`font-size:0.875rem`），写 `24px` 会挂。

## DOM 契约

测试依赖这些选择器，改 UI 时**不能删**（可以换样式、换包裹层）：

`#page-wechat` `#page-social` `#input-area` `#preview-frame` `#tpl-strip` `#tpl-search` `#tpl-toggle` `.tpl-card` `.tname` `#btn-generate-cover` `#social-text` `#social-tpl-grid` `#social-char-count`

## 审计

不想手跑就执行审计器，A/C/D/E/F 五类自动查，输出 Markdown 报告：

```bash
.venv/Scripts/python.exe scripts/audit_run.py
# → test_output/audit/audit-result.md
```

完整人工审计清单见 `docs/audit-playbook.md`（36 项，含判定标准与处置方式）。
