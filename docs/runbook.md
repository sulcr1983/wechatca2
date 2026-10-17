# 运行手册

装、起、停、清、坏了自己修。合上这份还能跑起来，就不用看别的了。

## 1. 环境要求

| 项 | 要求 | 说明 |
|---|---|---|
| Python | 3.10+（实测 3.13.12） | `start-app.bat` 会自己建 `.venv` |
| Node.js | 18+ | **只有 BLCaptain 封面引擎要**，纯排版不需要 |
| 浏览器 | Chrome 或 Edge 任一 | 封面渲染用系统浏览器，不下载 bundled Chromium |
| 磁盘 | ~50MB（不含 `output/`） | `output/` 是产物，可随时删 |

## 2. 启动

**方式 A：双击（日常用）**

```
文件资源管理器里双击 start-app.bat
```

- 自动用 `.venv` 跑，首次缺依赖自动补装
- 起完自动用 **Chrome** 打开 `http://127.0.0.1:5000`（Chrome 没装才退回系统默认）
- 关掉黑窗口 = 停服务

⚠️ 必须在**文件资源管理器**里双击。在 VS Code 的资源树里双击只会当文本打开，不执行。
⚠️ 不要双击 `app.py`——它需要 venv 环境，系统 Python 直接跑会秒退。

**方式 B：命令行（开发用）**

```bash
.venv/Scripts/python.exe app.py
```

用 venv 里的解释器，**不要用 activate**——`activate` 硬编码了建 venv 时的绝对路径，项目换目录后会静默失效（表现为 `No module named 'flask'`）。

**方式 C：只想验证能不能起**

```bash
.venv/Scripts/python.exe -c "import app; print('ok')"
```

## 3. 端口与环境变量

| 变量 | 默认 | 作用 |
|---|---|---|
| `PORT` | 5000 | 服务端口 |
| `SUPERSU_NO_AUTOBROWSER` | 未设 | 设了就不自动开浏览器（CI / 后台跑用） |
| `LLM_BASE_URL` / `LLM_API_KEY` / `LLM_MODEL` | 空 | AI 功能，不配也能用核心排版 |
| `PEXELS_API_KEY` | 空 | 封面配图中文搜索，也可在「设置」弹窗里填 |
| `CHROMIUM_PATH` | 自动探测 | 覆盖 BLCaptain 用的浏览器路径 |

`.env` 里也可以写，但含密钥，已被 `.gitignore` 排除。

## 4. 数据放哪 / 什么能删

| 路径 | 内容 | 能删吗 |
|---|---|---|
| `data/*.json` | 账号、AI 配置、推送历史（AppSecret 加密） | ❌ 删了要重配 |
| `data/bg_cache/` | 搜图结果缓存 | ✅ 删了重新搜 |
| `output/` | 渲染产物、封面图、测试截图 | ✅ 随时删 |
| `temp_covers/` | 临时封面 | ✅ 随时删 |
| `public/themes/*.json` | 164 套主题 | ❌ 删了页面没主题 |
| `public/theme-thumbs/*.jpg` | 164 张缩略图（生成物） | ✅ 可重跑 `scripts/gen_theme_thumbs.py` |
| `test_output/` | 审计/测试临时输出 | ✅ 随时删 |

## 5. 常见故障

| 症状 | 原因 | 处置 |
|---|---|---|
| `curl 127.0.0.1:5000` 返回 **502** | 本机 Clash 系统代理拦了 localhost | `curl --noproxy '*'`；Playwright 加 `args=["--no-proxy-server"]` |
| 端口 5000 已被占用 | 上一次的进程没退干净 | `netstat -ano \| findstr :5000` 找 PID → PowerShell `Stop-Process -Id <PID> -Force`（Git-Bash 的 `kill` / `taskkill //F` 因 PID 命名空间错位会失败） |
| 封面生成 500 `No module named 'playwright'` | 没装 Playwright | `pip install playwright`（**不用** `playwright install chromium`，走系统浏览器） |
| Playwright 报 `Connection closed` / `_playwright driver` | 版本过低（1.49 实测会挂） | `.venv/Scripts/python.exe -m pip install --force-reinstall 'playwright>=1.61'` |
| 封面 500，日志里是 Node 报错 | 没装 Node / 依赖缺失 | 装 Node 18+；`cd blcaptain-style-skill && npm install` |
| 自动打开的浏览器是星愿/别的 | 系统默认浏览器被第三方抢占 | 代码已强制 Chrome（`core/browser_utils.py::open_url`）。若仍发生，检查是否从星愿书签手动打开 |
| 模型/图库 Key 改了不生效 | 写进了 `.env` 但服务没重启 | `.env` 要重启；「设置」弹窗里改的立即生效 |
| 推送报 `40001 invalid credential` | AppSecret 错了 / IP 不在白名单 | 公众号后台 → 开发 → 基本配置，把 `/api/server-ip` 返回的 IP 加进白名单 |
| `git` 报 `dubious ownership` | 仓库 owner 与当前用户不一致 | `git config --global --add safe.directory E:/test/wechatca2` |
| 测试跑完 `data/` 被清空 | 早前版本 `test_e2e.py` 会重写 `data/*.json` | 已加测试前快照+还原；仍建议跑前手动备份 `data/` |
| `pip` 装不上 / 极慢 | 没配镜像 | `-i https://pypi.tuna.tsinghua.edu.cn/simple` |

## 6. 备份与迁移

只有 `data/` 值得备份（含加密的 AppSecret）+ `.env`（如果用了）。其余全部可重建。

换机器：

```
1. 拷整个项目目录（含 .venv 也可以，但建议删掉 .venv 重建）
2. 删 .venv → 双击 start-app.bat（自动重建）
3. 确认 Chrome 或 Edge 装了
4. 需要封面的再装 Node
```

`.venv` 可以跨机器拷，但路径变了要重建——里面的 `activate` 和部分 `.pth` 写死了旧路径。

## 7. 发布 PWA

还没做。方案与里程碑见 `pwa-design.md`（路线 B：浏览器内 Pyodide 跑现有引擎），合规证据见 `pwa-cloudflare-plan.md`。

## 8. 相关文档

- 改代码前：`overview.md`（模块地图）· `api-reference.md`（28 路由）· `testing.md`（6 套件）
- 提 PR 前：`project-conventions.md`（产出物与 Git 规范）· `audit-playbook.md`（36 项检查）
