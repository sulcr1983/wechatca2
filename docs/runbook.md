# 运行手册

> ⚠️ **适用范围（2026-10-24 审计补）**：本文以**本地 Flask 版**运维为主（该版已弃用、保留回退）。
> **PWA 主产品的运维只有两步**：`node pwa/scripts/build.mjs` 构建 → `pwa/scripts/deploy.sh` 部署（见 §7）。

装、起、停、清、坏了自己修。合上这份还能跑起来，就不用看别的了。

## 1. 环境要求

| 项 | 要求 | 说明 |
|---|---|---|
| Python | 3.10+（仓库 `.venv` 实测 3.12.1） | `start-app.bat` 会自己建 `.venv` |
| Node.js | 18+ | **PWA 构建/部署 + BLCaptain 封面引擎要**，纯排版不需要 |
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
| `curl 127.0.0.1:5000` 返回 **502** | 本机 Clash 系统代理拦了 localhost | `curl --noproxy '*'`；Playwright 侧当前测试实际传 `args=["--disable-dev-shm-usage"]`（`--no-proxy-server` 是可选加固，非既有事实） |
| 端口 5000 已被占用 | 上一次的进程没退干净 | `netstat -ano \| findstr :5000` 找 PID → PowerShell `Stop-Process -Id <PID> -Force`（Git-Bash 的 `kill` / `taskkill //F` 因 PID 命名空间错位会失败） |
| 封面生成 500 `No module named 'playwright'` | 没装 Playwright | `pip install playwright`（**不用** `playwright install chromium`，走系统浏览器） |
| Playwright 报 `Connection closed` / `_playwright driver` | 版本过低（1.49 实测会挂） | `.venv/Scripts/python.exe -m pip install --force-reinstall 'playwright>=1.61'` |
| 封面 500，日志里是 Node 报错 | 没装 Node / 依赖缺失 | 装 Node 18+；BLCaptain 子项目 `blcaptain-style-skill` **不在本仓库**（gitignore，需单独获取）后 `npm install` |
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

## 7. 发布 PWA（已上线，日常操作为「构建 → 部署」）

线上站：<https://supersu.ccwu.cc>（Cloudflare Pages 项目 `supersu-pwa`，生产分支 main，当前 v1.5.0）。

```bash
# 1) 构建 dist（gitignore；含引擎拷贝、清单、SW 指纹、断言，约 3s）
node pwa/scripts/build.mjs

# 2) 部署（铁律：已跟踪文件必须干净、HEAD 必须先 push 到 origin/main）
& "C:\Program Files\Git\bin\bash.exe" pwa/scripts/deploy.sh
```

- `deploy.sh` 从 `E:/test/opendoor/.env` 读 `CLOUDFLARE_ACCOUNT_ID` / `CLOUDFLARE_API_TOKEN`；
  该文件缺失时可用环境变量直跑：
  `npx wrangler pages deploy pwa/dist --project-name=supersu-pwa --branch=main`
  （token 在 Cloudflare 控制台自建，**勿入库、勿写进文档**）
- **发版两件事缺一不可**：① bump `pwa/version.json` 语义化版本；② 在 `pwa/scripts/changelog_milestones.json` 加一条（`until` 右闭边界）。`build` 字段 = git 提交数，由构建自动注入
- 部署后本地预检 / 线上复核：`python scripts/pwa_release_card_test.py`（发布小票 9/9）· `python scripts/pwa_online_e2e.py`（线上全量 E2E）
- 用户侧更新是**静默自动**的：检测到新版本即自动应用，右下角弹「已升级到 vX · bN」小提示；卡住时用户可访问 `?reset-sw` 自救
- 回滚：`git revert` 对应提交 → push → 重新 build + deploy（线上内容必须与 git 可对齐）

> 历史方案稿（路线对比 / 合规证据）见 `pwa-design.md` / `pwa-cloudflare-plan.md`；文件级施工记录见 `pwa-build-plan.md`（D1–D10 已全部完成）。

## 8. 相关文档

- 改代码前：`overview.md`（模块地图）· `api-reference.md`（28 路由，仅本地版）· `testing.md`（测试怎么跑）
- 提 PR 前：`project-conventions.md`（产出物与 Git 规范）· `audit-playbook.md`（36 项检查）
