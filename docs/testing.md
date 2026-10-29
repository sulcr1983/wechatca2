# 测试说明（PWA 主产品）

> 本文只讲**现在怎么测**。本地 Flask 版（`app.py` / `tests/*.py` 六套件）已于 2026-10-28 封存，
> 那份基线归档在 [`archive/testing-flask-2026-10-24.md`](archive/testing-flask-2026-10-24.md)。
> **用例数与最近一次结果不写在这里**——见 [`../STATE.md`](../STATE.md)（由 `scripts/gen_state.py` 从门禁日志生成）。

## 一条命令：`run_gates.py`

```bash
python scripts/run_gates.py            # 本地层（默认）：本地 dist / 进程内直调 core，断网可跑
python scripts/run_gates.py --quick    # 最快核心（约 2 分钟）
python scripts/run_gates.py --online   # 加上线上层：打 https://supersu.ccwu.cc/
python scripts/run_gates.py --ui       # 加上有头层（约 20 分钟，用本地 dist）
python scripts/run_gates.py --full     # 加上扩展层（依赖外部条件）
```

要点：

- **分层、失败即停**，汇总表带 `target` 列（`local` / `in-process` / `online`），日志落 `output/gate-run/`。
- `run_gates.py` 是**唯一真源**：新增门禁只在这个文件里加一行，不再往文档里抄清单。

## 三档判据（别混）

| 档位 | 是什么 | 能不能当门禁 |
|---|---|---|
| **门禁**（gate） | 有明确 PASS/FAIL，退出码非 0 就阻断发版 | ✅ 必须全绿 |
| **审计**（audit） | 「发现的问题」就是产出（如对比度体检、移动端排版体检） | ⚠️ 有 FAIL 时先看是不是已知问题，不直接阻断 |
| **探针**（probe） | 一次性量数据（传输量、时间线、改前改后 diff） | ❌ 只作证据 |

## 各门禁挡什么

| 套件 | 挡住什么 | target |
|:--|:--|:--|
| `theme_contrast_audit.py` | 164 套主题标题/正文对比度（标题 ≥3.0、正文 ≥4.5，直接调引擎同一个护栏函数） | in-process |
| `pwa_theme_drawer_test.py` | 模板库：7 族 × 82 色调、164 套逐个应用、版式×色调二维、移动端不溢出 | local |
| `pwa_layout_compat_test.py` | 版式兼容矩阵：10 夹具 × 5 版式 × 无 AI / AI 两态 | in-process |
| `pwa_ai_format_test.py` / `pwa_ai_preset_test.py` | AI 排版门控与降级兜底 / 平台预设（全 mock，不联网） | local |
| `pwa_export_test.py` / `pwa_nine_test.py` / `pwa_cover_test.py` | 导出四件套 / 九宫格切图 / 封面 12 风格 | local |
| `pwa_update_panel_test.py` | 更新面板闭环：检查更新 → 一键重启 → 本次更新条数 → 反馈入口 | local |
| `pwa_release_card_test.py` | 更新「发布小票」 | online |
| `pwa_auto_update_test.py` | 静默自动更新（真 SW + 探针发版） | local（`--full` 层） |
| `pwa_headed_full_e2e.py` | 有头全量：164 套 × 3 类夹具 + 8 版式 + 段落开关 + 按钮 + AI（mock） | local（`--ui` 层）/ `--url` 线上 |
| `pwa_online_e2e.py` | 线上真环境全量 E2E | online |
| `doc_sync_check.py` | 文档与代码一致（版本号、族名、主题套数） | in-process |

> 这张表只列「挡用户可见问题」的那几条。完整清单（含 `theme_spec` / `clean_output` / `real_ai` /
> `offline` / `s1s3` / `light_preview` / `template_ux` / `image_localize`）见 `run_gates.py` 的
> `SUITES_*` 常量，那才是唯一真源。

## 线上对比度实测（探针，不进门禁）

```bash
python scripts/theme_contrast_online.py            # 默认跑 v1.8.4 改过色的 15 套
python scripts/theme_contrast_online.py aurora     # 指定几套
python scripts/theme_contrast_online.py --all      # 全量 164 套（约 11 分钟）
```

`theme_contrast_audit.py` 量的是**引擎产出的样式**（解析层），这个脚本量的是**浏览器算出来的颜色**（合成层）。
两者必须同时绿，否则就是「测试一套标准、渲染另一套」。它不进 `run_gates`：要联网打线上、要有头 Chrome。

⚠️ **这个脚本第一版量错过，而且错得很像真失败**——三个坑写在它 docstring 里，改之前先看：

1. 主题把底色画在包一层的容器上，`body` 是透明的 → 当纯黑算，正文全报 1.2~1.8；
2. 渐变色标不按 alpha 合成 → `rgba(200,160,98,0.35)` 被当成 `(200,160,98)`，focus-gold 的金字报 1.29；
3. `background-size: 100% 1px` 这种只画上下两条装饰细线的，文字根本不压在线上，不能当底色。

实测口径（v1.8.4 部署后）：15 套标题 3.00~15.58、正文 7.10~17.40，0 JS 错误。

## 三个坑（评审时反复解释过）

1. **浏览器永远用系统 Chrome，不 `playwright install chromium`**：183MB 下载在国内会卡死（历史事故）。
   回退链单真源 `core/browser_utils.py`（Chrome → Edge → bundled）。
2. **不要全局杀浏览器进程**。Playwright 自带临时 profile，不会碰你自己开着的窗口；
   手工排查要清残留时**先问用户**，别 `taskkill /IM chrome.exe`（会连用户窗口一起关掉）。
3. **有头 E2E 不是必选项**。功能先做完、先部署，用 `curl` / 无头 / 单测验证；
   只有在用户明确要求或部署后要留证据时才跑有头全量。

## 写文档时

改完代码顺手跑 `python scripts/doc_sync_check.py`：它检查「活文档不许手写当前数字」「族名/套数必须与代码一致」。
文档里出现退役族名（如 `卷宗` / `庙会`）或与 `public/themes/` 实际套数不符，会直接报错并给出行号。
