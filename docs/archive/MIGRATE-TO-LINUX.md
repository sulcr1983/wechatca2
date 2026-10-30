# 迁移到 Linux 服务器开发


> 🛑 **2026-10-30 已归档**：本文为历史方案稿/过程记录，其中的状态、版本号、「待开工/待拍板」等描述**均已过期**。现行状态唯一真源：`STATE.md`；现行文档地图见 `AGENTS.md`。
> 迁移日期：2026-10-25　目标：把开发/测试/发版主环境从 Windows 本地迁到 Linux 服务器
> 状态数字一律以 [`STATE.md`](../STATE.md) 为准，本文不写具体版本号/构建号。

## 1. 结论先说

**代码本身是跨平台的，Linux 上不需要改任何业务代码就能跑门禁与构建。**
三个关键点已在内核里做了平台兜底：

| 风险点 | 现状 | Linux 行为 |
|---|---|---|
| `.venv/Scripts/python.exe` | `run_gates.py` / `doc_sync_check.py` / `install_git_hooks.py` 都有 `if not PY.exists(): PY = Path(sys.executable)` | 自动改用当前解释器，**正常** |
| 系统 Chrome / Edge 探测 | `core/browser_utils.py` 里候选路径是 Windows 的 | 掉到第三级保底 `p.chromium.launch()`，用 Playwright 自带 Chromium，**功能正常**（仅多两次失败尝试的耗时） |
| 部署脚本 | `pwa/scripts/deploy.sh` 已区分 `$APPDATA`(Windows) 与 `~/.config`(Linux) 两种 wrangler 凭证位置 | **正常**，Linux 是原生 bash 环境，比 Windows 更顺 |

## 2. 服务器初始化（Ubuntu / Debian）

```bash
# 基础工具
sudo apt update
sudo apt install -y git python3 python3-venv python3-pip curl

# Node 22（PWA 构建与 wrangler 需要）
curl -fsSL https://deb.nodesource.com/setup_22.x | sudo -E bash -
sudo apt install -y nodejs

# 拉代码
git clone git@github.com:sulcr1983/wechatca2.git
cd wechatca2

# 虚拟环境（Linux 是 bin/，不是 Scripts/）
python3 -m venv .venv
.venv/bin/pip install -r requirements.txt

# Playwright 浏览器 + 系统依赖库（封面渲染必需）
.venv/bin/python -m playwright install chromium
sudo .venv/bin/python -m playwright install-deps chromium
```

> `install-deps` 会装 libnss3、libatk、libgbm 等一整套共享库。**跳过它 Playwright 会报
> "Host system is missing dependencies"**，封面渲染直接失败。

## 3. 日常命令对照

| 用途 | Windows（旧） | Linux（新） |
|---|---|---|
| 跑门禁 | `.venv/Scripts/python.exe scripts/run_gates.py` | `.venv/bin/python scripts/run_gates.py` |
| 一键全测 | `python scripts/test_all.py` | `.venv/bin/python scripts/test_all.py` |
| PWA 构建 | `node pwa/scripts/build.mjs` | 同左（纯 Node 内置模块，**无需 npm install**） |
| 前置检查 | `python scripts/preflight.py` | `.venv/bin/python scripts/preflight.py` |
| 一键发版 | `python scripts/release.py --dry-run` | `.venv/bin/python scripts/release.py --dry-run` |
| 部署 | `bash pwa/scripts/deploy.sh` | 同左（原生） |

**首次部署前必须重新登录 wrangler**（凭证不随仓库迁移）：

```bash
npx wrangler login
# 凭证落在 ~/.config/.wrangler/config/default.toml
```

## 4. 在 Linux 上不能用的部分

| 项 | 原因 | 影响 |
|---|---|---|
| `start-app.bat` / `scripts/run_headed_test.bat` | Windows 批处理 | 无。本地 Flask 版已弃用，主产品是 PWA |
| `scripts/kill_test_processes.py` | 走 PowerShell `Get-CimInstance` | 无。辅助清理脚本，可用 `pkill -f python` 替代 |
| `scripts/gen_thumbnails.py` | 硬编码 `C:\Program Files\Google\Chrome\...` | 无。一次性生成脚本，产物已入库，服务器上不需重跑 |
| 有头测试（`run_gates.py --ui`） | 无图形界面 | 需 `xvfb-run` 或直接跳过。有头验收留待有桌面的环境 |

有头套件若确实要在服务器跑：

```bash
sudo apt install -y xvfb
xvfb-run -a .venv/bin/python scripts/run_gates.py --ui
```

## 5. 不在 git 里、必须手工搬的东西

`.gitignore` 已排除以下内容，`git clone` **拿不到**：

| 内容 | 说明 | 必要性 |
|---|---|---|
| `.workbuddy/memory/` | 项目工作记忆与历史教训 | **强烈建议搬**，否则 AI 助手失去历史上下文 |
| `data/` | `accounts.json` / `ai_config.json` / `history.json` / `.secret_key` | 可选。只服务已弃用的 Flask 版 |
| `.env` | DeepSeek API 三件套 | 可选。服务器上重填更快 |

⚠️ **PWA 的 AI Key 与图库 Key 存在浏览器 localStorage，不在这三者里**。
换机器后需在浏览器里重新填写，与本目录迁移无关。

⚠️ `data/.secret_key` 是 `core/crypto_utils.py` 的加密主密钥。
**丢失 → `data/ai_config.json` 里已存的 Key 永久解不开**，只能重填。

迁移方式（本机打包 → 私密传输 → 服务器解包，不要走公开渠道）：

```bash
# 本机
cd /e/test && tar -czf supersu-config.tar.gz wechatca2/.workbuddy/memory wechatca2/data

# 服务器
tar -xzf supersu-config.tar.gz -C /path/to/
```

## 6. 迁移后验收

```bash
.venv/bin/python scripts/preflight.py      # dist 是否包含最近改动
.venv/bin/python scripts/test_all.py       # 选 normal 档
.venv/bin/python scripts/gen_state.py --check   # STATE.md 是否过期
```

门禁应全绿。若有项报 `dist 陈旧`，先跑一次构建：

```bash
node pwa/scripts/build.mjs
```
