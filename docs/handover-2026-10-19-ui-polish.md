# 交接：PWA 首页体验优化（2026-10-19）

> 写给下一位接手的人 / AI。**先看 §0 现状和 §1 接手步骤**，再看细节。
> 关联：`HANDOVER.md`（PWA 总交接）、`CLOSURE.md`、`AGENTS.md`、`docs/update-handoff.md`。

---

## 0. 一句话现状

| 项 | 状态 |
|---|---|
| 线上主站 | **https://supersu.ccwu.cc**（Cloudflare Pages 项目 `supersu-pwa`） |
| 线上版本 | **1.4.0 / build 119**（已含小红书封面、入口「小红书」、草稿落盘修复） |
| 仓库 HEAD | `5c6eca3`（已 push `origin/main`），含**首页体验优化** |
| 首页优化是否上线 | **否。部署失败，线上还没有这份改动** |
| 失败原因 | 2026-10-19 执行 `deploy.sh` 时 wrangler 报 `fetch failed`（网络/代理问题），**不是代码或构建错误** |
| 本地构建产物 | `pwa/dist`：version 1.4.0 / build 121 / `BUILD_ID=8021b9873b1f7f26` |

⚠️ **不要误以为首页优化已经上线**。线上现在还是 build 119 的旧界面。

---

## 1. 接手第一件事（按顺序做）

### 1.1 确认状态

```bash
cd /e/test/wechatca2
git status --short          # 只应有 4 个未跟踪的旧文件（见 §8），不应有已跟踪改动
git log --oneline -3        # HEAD 应为 5c6eca3 或其后
git log --oneline -1 origin/main
```

### 1.2 重新部署（必须用 Git Bash）

```bash
"C:/Program Files/Git/bin/bash.exe" pwa/scripts/deploy.sh
```

- **不要用**默认 `bash`（本机是 WSL `C:\Windows\system32\bash.exe`），会误报找不到 `/e/test/opendoor/.env`。
- 凭证从 `E:/test/opendoor/.env` 读取，不要复制进仓库、不要打印。
- 脚本预检：已跟踪文件必须干净、HEAD 必须已推送 `origin/main`；未跟踪文件只 warn。
- 失败重试即可；若持续 `fetch failed`，先检查网络/Clash 代理，再重试 `npx wrangler@latest`。

### 1.3 部署成功核对

```bash
curl -s --noproxy '*' https://supersu.ccwu.cc/version.json
# 期望 build 变成 121（或部署时的提交数），version 仍 1.4.0

curl -s --noproxy '*' https://supersu.ccwu.cc/ | grep -o 'id="btn-cover"[^>]*>[^<]*'
# 期望：id="btn-cover" ... >小红书

curl -s --noproxy '*' https://supersu.ccwu.cc/src/update/update.css | grep -n "display: none"
# 期望能看到移动端/抽屉下 .upd-btn 的 display:none
```

> 普通浏览器可能被旧 Service Worker 缓存住，先硬刷新（Ctrl+F5）或用无痕窗口核对。

### 1.4 跑线上全量有头 E2E（**部署后必跑**）

```bash
.venv/Scripts/python.exe scripts/pwa_online_e2e.py
```

- **有头**、系统 Chrome、打到线上 `https://supersu.ccwu.cc/`，不是本地 dist。
- 期望：**85 项左右通过**（原 80 项 + 本轮新增 7 项；以脚本输出为准），2 项预期 SKIP：
  - 桌面端抽屉遮罩（桌面是让位布局，遮罩只在移动端显示）
  - 「立即更新」（线上没有 waiting worker 时按钮不显示）
- 输出：`output/e2e-online/report.json` + 截图 `output/e2e-online/*.png`。
- 本轮新增断言：
  - 空态「看示例」按钮可用
  - 空态「复制到公众号」是灰色禁用态
  - 抽屉桌面宽度 ≥ 480 / 缩略图高度 ≥ 96
  - 「更多」菜单 →「更新记录」能打开面板
  - 移动端隐藏浮动更新按钮
  - 移动端从「更多」菜单打开更新记录

### 1.5 本地回归（部署后也建议跑）

```bash
CODEBUDDY_SAFE_DELETE_ENABLED=0 node pwa/scripts/build.mjs   # 构建 + 断言
.venv/Scripts/python.exe pwa/scripts/smoke.py                # 24/24
.venv/Scripts/python.exe scripts/pwa_cover_test.py           # 16/16（含断网）
.venv/Scripts/python.exe tests/test_e2e.py                   # 65/65
```

---

## 2. 本轮首页优化改了什么（已提交，未部署）

| 文件 | 改动 |
|---|---|
| `pwa/index.html` | 空态预览区加「看示例」按钮 `#btn-empty-demo`；「更多」菜单加「更新记录」`data-act="update"` |
| `pwa/src/app.js` | 空态按钮触发 `#btn-demo`；更多菜单 `update` 触发 `#btn-update.click()` |
| `pwa/src/style.css` | 复制按钮禁用态改灰；解析条 chips 字号/对比度；空态按钮间距；风格条右留白 96→128；滚动箭头 24→28 圆角；抽屉 460→500、缩略图 84→104；移动端输入/解析条左右 16px；移动端图标 32px；≤560px 隐藏引擎文字 |
| `pwa/src/cover/cover.css` | 顶栏「小红书」入口改浅朱砂主按钮 + 状态圆点，高度 32px |
| `pwa/src/update/update.css` | 抽屉打开时（`body.browsing`）隐藏浮动更新按钮；移动端隐藏浮动更新按钮，改从「更多」菜单进 |
| `scripts/pwa_online_e2e.py` | 新增上述 7 项断言 |

### 为什么要改

- 手机端浮动「更新记录」按钮原来会压住解析条/风格条；
- 手机上编辑文字贴边；
- 「小红书」入口太像普通工具按钮，用户曾反馈“没看到小红书”；
- 空态右侧太空白，新用户不知道点哪里；
- 桌面风格条和更新按钮挤在一起；抽屉打开时更新按钮浮在卡片上；
- 抽屉缩略图偏小。

---

## 3. 已验证 / 未验证（务必分清）

**已验证：**

- `node pwa/scripts/build.mjs` 构建 + 断言通过（2026-10-19，BUILD_ID `8021b9873b1f7f26`）。
- 首页优化**之前**的线上全量有头 E2E：**80/80 通过**（2 项 SKIP），对应提交 `aded807`。
- `README.md` 已写线上地址、备用地址、本地回退地址。

**未验证（接手后必须补）：**

- 首页优化**线上效果**（因为还没部署成功）。
- 首页优化后的本地 `smoke.py` / `pwa_cover_test.py` / `test_e2e.py`（本轮未跑）。
- 移动端「更多 → 更新记录」是否真的能打开面板（依赖隐藏的 `#btn-update.click()`；见 §5 坑 1）。

---

## 4. 重点看什么（验收清单）

### 桌面

- 顶栏「小红书」是浅朱砂底 + 圆点，和 AI/更多有区分。
- 空态右侧有「看示例」按钮，点击后输入 297 字示例并渲染。
- 空态「复制到公众号」是灰色禁用态，不是醒目的红色。
- 风格条右侧箭头清楚可见；「全部风格」与右下角更新入口不再挤在一起。
- 打开风格库（全部风格）：
  - 抽屉宽度约 500px；
  - 缩略图高度约 104px；
  - 右下角浮动「更新记录」按钮消失（`body.browsing`）。

### 手机（390×844）

- 底部只有「内容 / 预览」tabs，**不再有浮动更新记录按钮**压住解析条/风格条。
- 编辑区左右有 16px 留白，文字不贴边。
- 预览页风格条能显示更多胶囊（不再被更新按钮挤成两个半）。
- 顶栏「小红书」可见；引擎徽章只显示状态点（≤560px 时文字隐藏）。
- 「更多」→「更新记录」能打开更新面板（这是移动端唯一入口）。

### 线上 E2E 失败时优先查

1. 移动端「更多 → 更新记录」：`#btn-update` 是 `display:none`，代码里用 `$('btn-update')?.click()` 触发。若无效，见 §5 坑 1。
2. 移动端浮动按钮仍可见：检查 `pwa/src/update/update.css` 的媒体查询是否被后面的规则覆盖。
3. 抽屉宽度/缩略图断言失败：确认新 CSS 已部署（线上 CSS 可能是旧缓存）。
4. 空态「看示例」失败：确认 `#btn-empty-demo` 在 `#preview-empty` 内，且 `app.js` 已绑定。

---

## 5. 已知坑 / 风险

1. **移动端更新入口依赖隐藏按钮的 click**
   - 现在：`app.js` 菜单 `act === 'update'` 时执行 `$('btn-update')?.click()`。
   - `#btn-update` 在移动端是 `display:none`；浏览器 `HTMLElement.click()` 通常会触发监听器，但**尚未线上验证**。
   - 如果 E2E 的「移动端从更多打开更新记录」失败，改法：
     - 在 `pwa/src/update/index.js` 的 `start()` 里暴露 `window.__supersuOpenChangelog = openChangelog`；
     - `app.js` 改为调用 `window.__supersuOpenChangelog?.()`。
     - 重新构建/提交/部署。
2. **更新卡片在移动端仍固定右下**
   - 只隐藏了浮动按钮；有用例触发时 `#upd-card` 仍可能出现在 tabs 上方。若遮挡，可把它改成底部居中或从菜单进面板。
3. **桌面更新按钮仍在右下角**
   - 风格条留白已加到 128px；1280 宽度下会少显示一个胶囊。如果仍觉得挤，可把桌面浮动按钮也隐藏，统一从「更多」菜单进。
4. **旧 Service Worker 缓存**
   - 线上核对必须用无痕/新 context；普通浏览器可能先显示旧版，等右下角更新提示或硬刷新。
5. **未跟踪文件**
   - `.trae-html-share-packages/`、`docs/brand/logo-64.png`、`docs/brand/logo.png`、`docs/brand/logo-prototype.html` 不是本轮内容，**不要 stage**。
6. **部署预检**
   - 已跟踪文件必须干净、HEAD 必须已推送 `origin/main`；未跟踪文件只 warn，不会中止。
7. **构建清理**
   - 本机 `fs.rm` 被 genie-trash 拦截时，构建要加 `CODEBUDDY_SAFE_DELETE_ENABLED=0`。

---

## 6. 已完成上下文（1.4.0 已有能力）

- **排版**：164 套主题、粘贴纯文本自动识别结构、复制富文本、草稿本地保存、手机/网页预览、风格库 2A 族折叠。
- **小红书封面**：12 风格（归藏 2 × 3 尺寸 + 10 套模板 × 3:4）、纯色/上传/Wikimedia 免 key 搜图、Noto 中文字体子集、modern-screenshot 出图、断网可生成。
- **AI**：纯前端 BYOK（润色/摘要/智能排版），未配置时明确提示。
- **更新**：静默更新、发布小票、更新记录面板。
- **测试**：
  - `pwa/scripts/smoke.py` 24/24
  - `scripts/pwa_cover_test.py` 16/16（含断网）
  - `tests/test_e2e.py` 65/65
  - `scripts/pwa_online_e2e.py` 本轮前线上 80/80

---

## 7. 仍未做 / 与本地版差距

PWA 是主打的重写版，目前只搬了排版 + 封面主链路；本地 Flask 版（已标记弃用、保留回退）仍有更全的功能：

- 微信公众号草稿箱推送、公众号账号配置（需要本机后端）
- Pexels 联网配图（需要 Key）
- BLCaptain 9 种封面风格（需要 Node/Playwright）
- AI 生成封面图、历史记录、内置教程
- 三模式预处理 UI 入口、离线 zip、真机验收
- 引擎遗留：诗词分层、夹具箭头行互斥等（见 `docs/handoff-stress-audit-2026-10-18.md`）

---

## 8. 工作区/回滚

- 工作区当前只应有 4 个未跟踪旧文件（见 §5 第 5 条）。
- 回滚首页优化：`git revert 5c6eca3`（该改动尚未上线，线上无影响）。
- 回滚线上：Cloudflare Pages 控制台切回上一个部署；或 revert 后重新 `deploy.sh`。
- 当前线上基线：**build 119**（提交 `aded807`，部署 ID `0fbc8f3d`）。
- 首页优化构建：BUILD_ID `8021b9873b1f7f26`，build 121。

---

## 9. 环境速查

| 项 | 值 |
|---|---|
| 仓库 | `E:\test\wechatca2` |
| Python | `.venv/Scripts/python.exe`（别用系统 python） |
| 浏览器 | 系统 Chrome（`core/browser_utils.launch_browser`，有头） |
| 构建 | `CODEBUDDY_SAFE_DELETE_ENABLED=0 node pwa/scripts/build.mjs` |
| 部署 | `"C:/Program Files/Git/bin/bash.exe" pwa/scripts/deploy.sh` |
| 线上 E2E | `.venv/Scripts/python.exe scripts/pwa_online_e2e.py` |
| 截图/报告 | `output/e2e-online/`、`output/review-home/`（优化前首页截图） |
| 版本 | `pwa/version.json`（1.4.0）；构建号自动取 git 提交数 |

---

*本文写于 2026-10-19。若与代码/线上冲突，以 `git log`、源码、`version.json` 和实测截图为真源，并回来更新本文。*
