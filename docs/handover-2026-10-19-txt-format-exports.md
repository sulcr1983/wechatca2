# 交接：TXT 格式兼容 + 出口三件套（2026-10-19 第二轮）

> 写给下一位接手的人 / AI。**先看 §0 现状和 §1 接手步骤**，再看细节。
> 关联：`HANDOVER.md`（PWA 总交接）、`CLOSURE.md`、`AGENTS.md`、上一份 `docs/handover-2026-10-19-ui-polish.md`（首页优化，**已部署成功，其 §0 的「未部署」已作废**）。

---

## 0. 一句话现状

| 项 | 状态 |
|---|---|
| 线上主站 | **https://supersu.ccwu.cc**（Cloudflare Pages 项目 `supersu-pwa`） |
| 线上版本 | **1.4.0 / build 128**（`version.json` 已实测核对） |
| 最近部署 | Deployment `4e95e361`（2026-10-19） |
| 仓库 HEAD | `9828cfc`，**与 `origin/main` 一致**（已 push） |
| `pwa/dist` BUILD_ID | `039b2dd71df70463`（与线上一致） |
| 工作区 | 干净；只有 4 个**约定不入库**的未跟踪旧文件（见 §6） |
| 线上有头 E2E | **88/88 通过（2 项 SKIP）**，连跑两次稳定 |

✅ **上一轮的「部署失败」已解决**：重试 `deploy.sh` 成功，首页优化已在线（第一次那个 wrangler `fetch failed` 是瞬时网络问题）。

---

## 1. 接手第一件事（按顺序做）

### 1.1 确认状态

```bash
cd /e/test/wechatca2
git status --short          # 只应有 4 个未跟踪旧文件（§6），不应有已跟踪改动
git log --oneline -1        # 应为 9828cfc 或其后
git log --oneline -1 origin/main   # 应与 HEAD 一致
curl -s --noproxy '*' https://supersu.ccwu.cc/version.json   # 期望 build 128
```

### 1.2 本地跑起来（PWA 为主打版）

```bash
node pwa/scripts/build.mjs                                   # 改过 pwa/src、core/、public/ 后必须重跑
.venv/Scripts/python.exe -m http.server 8080 --directory pwa/dist
# 浏览 http://127.0.0.1:8080
```

⚠️ **`pwa/dist` 是构建产物**：改了 `pwa/src/*`、`core/*.py`、`public/themes` / `public/cover-templates` 后**必须重跑 `build.mjs`**，否则看到的还是旧代码。

### 1.3 部署（必须用 Git Bash）

```bash
"C:/Program Files/Git/bin/bash.exe" pwa/scripts/deploy.sh
```

- **不要用**默认 `bash`（本机是 WSL `C:\Windows\system32\bash.exe`），会误报找不到 `/e/test/opendoor/.env`。
- 凭证从 `E:/test/opendoor/.env` 读取，不要复制进仓库、不要打印。
- 脚本硬预检：**已跟踪文件必须干净 + HEAD 必须已在 `origin/main`**，否则直接中止。
- ⚠️ **重建产物会让预检失败**：`build.mjs` 会重新生成 `CHANGELOG.md` 和 `pwa/public/changelog.json`（受版本控制、跟着 git 历史走）。所以顺序是：
  **改代码 → 跑测 → `git add` 含这两个生成物 → commit → push → 再 `deploy.sh`**。

### 1.4 部署后必跑线上全量有头 E2E

```bash
.venv/Scripts/python.exe scripts/pwa_online_e2e.py
# 期望：88/88 通过（2 项 SKIP）
```

2 项 SKIP 是**预期**：桌面端抽屉遮罩（桌面是让位布局，遮罩只在移动端显示）、「立即更新」（线上没有 waiting worker 时按钮不显示）。
输出：`output/e2e-online/report.json` + 截图。

> 普通浏览器可能被旧 Service Worker 缓存住，核对时先硬刷新（Ctrl+F5）或用无痕窗口。

---

## 2. 本轮改了什么（5 块，全部已提交 / 已部署）

| # | 提交 | 内容 |
|---|---|---|
| 1 | `16c7f17` | **TXT 格式兼容扩展**（`core/preprocessor.py`）+ 测试夹具入库 + 抽屉缩略图修复 |
| 2 | `ea6499a` | **功能扩展方案 + 可点击原型**（`docs/feature-expansion-plan.html`、`docs/prototypes/feature-expansion.html`） |
| 3 | `c9e6c9d` | **出口三件套**（PWA）：长图 PNG / HTML 文件 / Markdown 导出 |
| 4 | `30b59cf` `9828cfc` | 线上 E2E 的**固定等待改轮询**，修掉「每跑一次偶发一项」 |
| 5 | `89e9898` | 重建更新记录生成物（部署预检所需） |

### 2.1 格式兼容扩展（引擎）

`core/preprocessor.py` 新增 9 条**确定性识别**规则：

| 新增支持 | 说明 |
|---|---|
| `- [ ]` / `- [x]` | → ☐ / ☑ |
| `06｜表格：…` 章节标记 | → 二级标题（此前含 `：` 的行被标题检测排除，06/12 两节漏判） |
| `（1）（2）` 中文括号编号 | **不再误判成四级标题**，保持原文 |
| 无分隔行的竖线表 | 整表规整 → 真表格 |
| 空格对齐表 | → 真表格 |
| `~~~` 围栏 | 等价 ` ``` ` |
| `> [!NOTE]`（GitHub Alerts） | → `> 【提示】` |
| `::: tip / warning / details` | → 复用现有 `:::summary` 卡片 |
| `【提示】【注意】【风险】` | → 提示块 |

**刻意不做**（理由写在 `docs/txt-format-support.md` §5）：Setext 下划线标题（会和 `====` 分隔线打架）、pangu/全角清理（违反「不改写原文」）、KaTeX 公式渲染、TSV/CSV、高亮、脚注渲染。

### 2.2 测试夹具入库

- 苏哥起草的《TXT 自动排版全格式测试文档》→ `tests/fixtures/txt-format-lab.txt`
- `scripts/theme_stress_audit.py` 原来读的是**仓库外写死的绝对路径**（`E:/personal/Downloads/…`，换机器就跑不了）→ 改为仓库内相对路径
- 断言 **34 → 40 条**（新增 S29–S34 盯新规则）

### 2.3 抽屉缩略图修复（线上真 bug，本轮查出）

- **现象**：模板库缩略图渲染 82px，设计意图 104px。E2E 断言抓到。
- **根因**：`5c6eca3` 把缩略图 84→104px，却没同步抬高 `.d-card` 的 `min-height`（仍 118）。84+32=116 原本刚好，改 104 后内容 136 超 118 → flex 把子项压回 82。
- **修法**：`pwa/src/style.css` `.d-card` `min-height: 118px → 140px`。线上实测恢复 **104px**。

### 2.4 出口三件套（新功能）

顶栏新增「**导出 ▾**」，三项都能真下载：

| 项 | 实现 | 实测 |
|---|---|---|
| 长图 PNG | 离屏 iframe 定宽 1080 → `modern-screenshot`（复用封面同一套库，**零新依赖**） | 真 PNG 1080×708 / 84 KB |
| HTML 文件 | 自包含单文件（样式已内联 + 页面底色 + 字体） | 4134 B，双击可看 |
| Markdown | 引擎识别后的源码原样下载 | 849 B |

- 新文件 `pwa/src/export.js`；`export.js` 首次点击才动态加载。
- **已同步**：`sw.js` 的 `SHELL_OPTIONAL` += `./src/export.js`、`build.mjs` 的 `SHELL_FILES` + 关键文件存在性断言（AGENTS 明令：新增前端模块必须同步这两处）。
- **不静默**：超长（>20000px）明确报错并建议改用 HTML 导出；外链图**提前告知数量**（本地化是 B2 的事）。
- 新测试 `scripts/pwa_export_test.py`（**8/8**）：真下载 + 校验内容/尺寸 + 移动端不溢出。

### 2.5 线上 E2E 偶发假失败

- **现象**：部署后反复出现「每跑一次偶发一项」——先「风格条右/左滚」互为镜像，后「空态复制按钮为灰色禁用态」读到朱砂色；复跑又全过。
- **根因**：两处都用**固定等待**（`sleep 900ms` / `500ms`）后读值。平滑滚动在无头下被 rAF 节流、清空后按钮转灰依赖异步 `doRender`——固定等待是碰运气。
- **修法**：抽 `wait_until(pred)` 轮询到断言条件成立再取最终值（6s 兜底）。与 AGENTS 里「不用固定 sleep 判优雅降级」同一条教训。
- **验证**：连跑两次均 88/88。

---

## 3. 已验证 / 未验证（务必分清）

### 已验证（本轮真实执行）

| 套件 | 结果 |
|---|---|
| `tests/test_e2e.py` | 74/74（原 65，新增 9 条格式兼容断言） |
| `tests/test_integration.py` | 35/35 |
| `tests/test_api_e2e.py` | 29/29 |
| `tests/test_headed_full_e2e.py` | 33/33（0 控制台报错） |
| `tests/test_headed_userflow.py` / `_wechat_copy.py` | 7/7 · 12/12 |
| `scripts/theme_stress_audit.py` | 40 条断言，夹具实测 |
| 164 套主题渲染审计 | 164/164 |
| `pwa/scripts/smoke.py` | 24/24 |
| `scripts/pwa_cover_test.py` | 16/16（含断网生成） |
| `scripts/pwa_export_test.py` | **8/8**（新） |
| `scripts/pwa_online_e2e.py` | **88/88**（连跑两次，2 SKIP） |

### 未验证

- **本地 Flask 版**没有跟这轮改动（AGENTS 2026-10-18 已把本地版标记弃用、主打 PWA；本轮新功能**只落 PWA**）。
  引擎（`core/preprocessor.py`）是两版共用的，本地版跑起来也会拿到新识别规则（未实测）。
- 真机（安卓 / iOS）验收、离线包、群友试用 —— 仍未做（见 §4）。

---

## 4. 下一步（按方案批次）

方案真源：`docs/feature-expansion-plan.html`（30 项 · 6 批次）。B1 已完成；B2 的 #6 已完成（2026-10-24，见 `docs/handover-2026-10-24-image-localize.md`），**下一项是 #7 九宫格切图**：

| 批次 | 内容 | 状态 |
|---|---|---|
| B1 出口 | #1 长图 · #2 HTML · #5 Markdown | ✅ **已完成** |
| **B2 保真** | **#6 外链图本地化** · #7 九宫格切图 · #20 批量导出图片 | 🟡 **#6 已完成（2026-10-24）**：#7 / #20 待做 |
| B3 交付 | #3 PDF · #4 Word · #17 二维码 | ⬜ |
| B4 掌控 | #8 我的主题 · #9 主题导入导出 · #15 多主题对比 | ⬜ |
| B5 效率 | #13 草稿箱 · #11 大纲 · #10 标点自检 · #12 加序号 · #16 字数 | ⬜ |
| B6 扩展 | #14 图片处理 · #18 表格优化 · #19 图注 · #21–#30 | ⬜ |

PWA 侧的**旧待办**（与方案并行，来自 `HANDOVER.md` §3）：
- 「更多」菜单补**推送探测本机 5000** + **AI 配置入口**
- 离线验证（DevTools Offline 刷新）、离线包 zip、真机验收

---

## 5. 已知坑 / 风险

1. **部署前必须 push**（铁律）。`deploy.sh` 有硬预检；重建产物会产生 `CHANGELOG.md` / `changelog.json` 两个生成物，**忘了加就会卡预检**。
2. **改引擎必须重跑构建**：`core/preprocessor.py` 随 `build.mjs` 进 `dist/py/`，且它在 SW 增量清单里（`?h=<sha256>`）——不重建用户端拿不到。
3. **`build.mjs` 版本号是生成物**（`1.0.<git 提交数>` 形式，当前 `1.4.0` / build 128），别手写死。
4. **`public/themes`、`public/cover-templates` 是配置真源**；`su-*.json` 是 `scripts/build_themes.py` 的生成物，勿手改（AGENTS §10）。
5. **有头套件的「0 控制台报错」依赖上游 LLM 可达**：上游 5xx 时浏览器必记 1~2 条 500，套件退出码会是 1——先修上游，**不得为凑绿放宽判据**。
6. **别用 `sleep` 判时序**（本轮刚踩过）：滚动 / 异步渲染一律用轮询（`wait_until`）。
7. **本地版标记弃用**：新功能只落 PWA；引擎仍两版共用。
8. **公众号不认 data URI（#6 的硬边界）**：微信编辑器粘贴富文本只接受公众号图床 URL，拒绝 `data:` URI。所以 #6 只承诺「导出 HTML / 长图 / 留档可用」；复制链路必须由用户到素材库手动上传，UI 已如实提示，**不要再改文案承诺直贴可显示**。

---

## 6. 工作区 / 回滚

- 工作区只应有 **4 个未跟踪旧文件**（**约定不纳入 git，别 stage**）：
  `.trae-html-share-packages/`、`docs/brand/logo-64.png`、`docs/brand/logo.png`、`docs/brand/logo-prototype.html`
- 回滚：
  - 本轮全部：`git revert 16c7f17 ea6499a c9e6c9d 30b59cf 9828cfc 89e9898`（顺序反着来更省事）
  - 单点：
    - 格式兼容 → 还原 `core/preprocessor.py` + `tests/fixtures/`
    - 抽屉缩略图 → `.d-card` min-height 改回 118
    - 导出 → 删 `pwa/src/export.js` + 还原 `pwa/index.html` / `app.js` / `sw.js` / `build.mjs` 四处清单
- `git revert` 后要**重跑 `build.mjs`** 再部署，否则线上仍是新代码。

---

## 7. 环境速查

| 项 | 值 |
|---|---|
| 仓库 / 分支 | `E:\test\wechatca2` / `main`（`pwa` 分支与 main 同点，`local-legacy` 为本地版快照） |
| Python | `.venv\Scripts\python.exe`（**别用系统 python**） |
| Node | v22.22.2（只有构建脚本用，无 npm 依赖） |
| 浏览器 | 系统 Chrome 优先、缺失回退 Edge（`core/browser_utils.py`） |
| 部署凭证 | `E:/test/opendoor/.env`（不落盘副本、不回显） |
| 测试产物 | `output/e2e-online/`、`output/export-check/`、`output/prototype-check/`（均 gitignore） |

---

*本文档基于 2026-10-19 的实测状态（线上 build 128、HEAD `9828cfc`）。若与代码冲突，以代码与实测为准，并回来更新本文。*
