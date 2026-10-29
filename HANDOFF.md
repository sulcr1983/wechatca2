# 交接说明 — SuperSu PWA

> 这份文件只回答一件事：**接手的人 30 分钟内怎么跑起来、别踩哪些坑、去哪儿找细节。**
> 具体数字（版本号、构建号、主题套数、门禁用例数）**一律不写在这里**——它们在
> [`STATE.md`](STATE.md) 里，由 `scripts/gen_state.py` 从真实门禁日志与 `version.json` 生成。
> 写死数字的文档必然漂移，这个坑 2026-10-25 已经踩过一次（同一时刻 6 份文档写着 6 个不同版本号）。

---

## 1. 现状（看完这三行就够了）

- 主产品：**PWA 版** https://supersu.ccwu.cc（Cloudflare Pages 项目 `supersu-pwa`，生产分支 `main`），源码在 `pwa/`
- 排版引擎：`core/preprocessor.py` + `core/format_engine.py` + `public/themes/`
  （引擎**没有**封存，封存的只是 Flask 外壳；`core/` 只有 4 个模块，构建时拷进 `pwa/dist/py/`）
- 本地 Flask 版（`app.py` + `templates/index.html`）**已封存**，取回方式见 [`ARCHIVE.md`](ARCHIVE.md)

要**当前**的版本 / 构建号 / 线上状态 / 门禁结果 → 看 [`STATE.md`](STATE.md)。

## 2. 30 秒上手

```bash
.venv/Scripts/python.exe -V                                  # 需要 Python 3.12+
node pwa/scripts/build.mjs                                   # 构建 dist（不入库，别手改）
python -m http.server 8899 --directory pwa/dist               # 本地预览
.venv/Scripts/python.exe scripts/run_gates.py                 # 门禁（默认测本地 dist / 进程内）
```

首次打开要下 Pyodide（约 11MB），进度条走完才算就绪。**引擎就绪的可观测信号是 `#boot` 加上 `gone` class**，
`window.__engineReady` 这种变量是模块内的、拿不到（写 E2E 时踩过）。

## 3. 发版（两件事缺一不可，顺序也别换）

1. bump `pwa/version.json` 的语义化版本（**只在发版时改**）
2. 在 `pwa/scripts/changelog_milestones.json` 加一条里程碑（`until` 是右闭边界）

然后：`build` → 提交 → `push` → 部署。想跳过任何一步都会出现「点了更新没反应」或「更新记录空白」。

```bash
& "C:\Program Files\Git\bin\bash.exe" pwa/scripts/deploy.sh
# deploy.sh 需要 E:/test/opendoor/.env；没有凭证时用设备码 OAuth：
#   npx --yes wrangler@latest login --device
#   npx --yes wrangler@latest pages deploy pwa/dist --project-name=supersu-pwa --branch=main
```

## 4. 接手必读的坑（每条都真踩过）

**工程纪律类**（完整版在 [`AGENTS.md`](AGENTS.md)，这里只列最容易犯的）

- `pwa/dist/` 是构建产物（已 gitignore）：**永远不要手改**，改源码后必须重新 build，否则门禁测的是旧产物（`preflight` 会拦）。
- 新增前端模块 / 改 `SHELL_FILES` / `SHELL_OPTIONAL`：`pwa/public/sw.js` 与 `pwa/scripts/build.mjs` **两处清单必须同步**，漏一处就是「离线缺文件」或「更新拿不到新文件」。
- 真实 AI Key 只放本地 `.env`（已 gitignore），不进部署产物；线上由用户自己填。
- 浏览器统一用系统 Chrome（`core/browser_utils.py` 的回退链），**不 `playwright install chromium`**（国内 183MB 会卡死）。
- **不要全局杀浏览器**（`taskkill /IM chrome.exe` 之类）——会连带关掉用户正在用的窗口，用户已明确制止过一次。自动化一律用独立 profile。

**测量/测试类**（这几条是「测试绿了但功能坏的」元凶）

- 改过 `pwa/src` / `core` / 主题后**先 build 再测**，否则测的是旧 dist。
- 线上渲染有约 1 秒滞后，**固定 `sleep` 会误判**；要等具体信号（`#boot.gone`、元素出现、文本变化）。
- 量对比度这类指标时，**测量口径必须和渲染口径一致**：底色要看祖先链（`body` 常常是透明的）、渐变色标要按 alpha 合成、`background-size: … 1px` 的装饰细线不算文字底色。口径不对会批量造出「1.29 的假失败」，比不测更容易误导。
- Python 脚本改 `*.md` **会破坏换行符**（仓库里这些文件是 CRLF）：`git diff` 会显示整文件重写。改完用 `git diff --numstat` 确认规模正常。
- bash heredoc 里的 `\n` 会变字面量，写多行内容用 `python - <<'EOF'` 而不是 `echo -e`。

## 5. 文档地图

| 文档 | 管什么 |
|:--|:--|
| [`AGENTS.md`](AGENTS.md) | **工程规则唯一真源**：架构、门禁、命名、纪律、踩过的坑 |
| [`STATE.md`](STATE.md) | 当前状态（自动生成，别手改） |
| [`README.md`](README.md) | 对外说明、使用方式、功能清单 |
| [`CLOSURE.md`](CLOSURE.md) | 收尾台账（每轮任务一行，历史全文在 `docs/archive/`） |
| [`ARCHIVE.md`](ARCHIVE.md) | 封存记录：什么东西移出了工作区、怎么取回 |
| `docs/testing.md` | 怎么测：门禁分层、三档判据、探针 |
| `files/TODO.md` | 待办与排期 |

**历史去哪找**：`docs/archive/` 里是本轮清理归档的四份大文档（Flask 时代系统说明、2026-10-18 的 PWA 交接说明、2026-10-25 那一轮交接、任务 1–23 收尾全文）。它们写的版本号和文件名都过期了，**只有追溯价值**。
