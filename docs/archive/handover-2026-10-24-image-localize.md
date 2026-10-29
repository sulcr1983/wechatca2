# 交接：B2 #6 外链图本地化（2026-10-24）

> 🛑 **2026-10-24 审计声明**：本文为**历史快照/方案稿**，其中的版本号、构建号、「未提交/未部署」等状态**均已过期**。现行状态唯一真源：`HANDOFF.md` §0 + `AGENTS.md` + `CLOSURE.md`。

> 写给下一位接手的人 / AI。**先看 §0 现状与 §1 接手步骤**。
> 关联：`HANDOVER.md`、`docs/feature-expansion-plan.html`（方案真源）、`CLOSURE.md §13`、`files/TODO.md`（IMG-LOC）、上一份 `docs/handover-2026-10-19-txt-format-exports.md`。

---

## 0. 一句话现状

| 项 | 状态 |
|---|---|
| 功能 | **B2 #6 外链图本地化（务实最小版）已完成** |
| 代码 | 工作区有 10 个已跟踪文件改动 + 2 个新文件，**尚未 commit、尚未 push** |
| 构建 | `pwa/dist` 已按最新代码重建（19.35 MB，BUILD_ID `9d9ba88e8cfb74dc`） |
| 本地版本 | `1.4.0 / build 131`（按 git 提交数生成；**线上仍是 build 128**） |
| 专项测试 | `scripts/pwa_image_localize_test.py` **11/11**（最终代码实跑） |
| 回归 | 导出 **8/8**、PWA 冒烟 **24/24**（在最后一次 tip 文案微调前跑的；两者不经过该分支，但建议接手后复跑一次） |
| 部署 | **未部署**。线上无变化，用户端拿不到这个功能 |

---

## 1. 接手第一件事（按顺序）

```bash
cd /e/test/wechatca2
git status --short        # 应看到 §2 的 12 项改动（未提交）
git log --oneline -1      # 应为 cefae73 或其后
```

```bash
# 构建（改过 pwa/src、core、public 后必须重跑）
node pwa/scripts/build.mjs

# 专项（外链图：抓取/内嵌/失败原因/移动端）
.venv/Scripts/python.exe scripts/pwa_image_localize_test.py     # 期望 11/11

# 回归（建议补跑，最后一轮被中断）
.venv/Scripts/python.exe scripts/pwa_export_test.py             # 期望 8/8
.venv/Scripts/python.exe pwa/scripts/smoke.py                   # 期望 24/24
```

本地预览：`.venv/Scripts/python.exe -m http.server 8080 -d pwa/dist` → http://127.0.0.1:8080

---

## 2. 本轮改了什么

| 文件 | 改动 |
|---|---|
| `pwa/src/images.js` | **新增**。`scanExternalImages`（按出现次数统计外链 `<img>`）；`localizeImages`（DOMParser 替换 src、移除 srcset、并发 3、单图 8MB、单次 40 张、超时 12 秒）；失败原因分类；会话内成功缓存 |
| `pwa/src/app.js` | 渲染后扫描并显示提示条；**点击「本地化图片」才联网抓图**；导出 HTML / 长图前自动内嵌；复制后用 `toastAfterCopy()` 如实提示 |
| `pwa/index.html` | 预览区新增 `#img-tip` 提示条 + `#btn-localize` |
| `pwa/src/style.css` | `.img-tip` 样式（移动端不溢出） |
| `pwa/public/sw.js` | `SHELL_OPTIONAL` += `./src/images.js`（离线可用） |
| `pwa/scripts/build.mjs` | `SHELL_FILES` += `src/images.js`；关键文件存在性断言 += `src/images.js` |
| `scripts/pwa_image_localize_test.py` | **新增**。同源真图 + 同源 404，确定性、不依赖外网 |
| `CLOSURE.md` | 新增「任务 13」收尾记录 |
| `files/TODO.md` | 已完成表新增 `IMG-LOC` |
| `docs/handover-2026-10-19-txt-format-exports.md` | B2 状态更新 + 新增「公众号不认 data URI」硬边界 |
| `HANDOVER.md` | 顶部指向本文件 |
| `CHANGELOG.md` / `pwa/public/changelog.json` | **构建生成物**（build.mjs 重写），提交时必须一起带上，否则 `deploy.sh` 预检会卡 |

---

## 3. 为什么是「务实最小版」

查证事实（写代码前已确认）：

- 微信公众号编辑器粘贴富文本**只接受公众号图床 URL（mmbiz）**，**拒绝 `data:` URI**。
- 纯前端 PWA 没有后端，无法调用微信素材上传 API，因此**不可能**让「复制到公众号」这条链路自动带上图。
- 内嵌 data URI 对 **导出 HTML / 长图 PNG / 离线留档** 完全有效——这部分是真正可用的。

拍板结果（用户选）：

- ✅ 导出链路：抓取 → data URI 内嵌（真可用）。
- ✅ 复制链路：如实提示「公众号直贴不会显示，请在素材库手动上传」，**不做假承诺**。
- ❌ 不做：微信素材上传 / 图床 / 后端中转（属架构级改动）、#7 九宫格、#20 批量导出图片。

**⚠️ 后续不要再把文案改成「本地化后复制到公众号可显示」**——平台不支持。

---

## 4. 已验证 / 未验证

### 已验证（真实执行）

| 项 | 结果 |
|---|---|
| `scripts/pwa_image_localize_test.py` | **11/11**：提示条出现且文案如实 · HTML 导出自动内嵌 `data:image/png;base64` · 失败图保留原 URL · 提示条写明 `HTTP 404` · 重试仍给原因 · 清空/无图时提示条隐藏 · 移动端无横向溢出 · 0 未捕获异常 |
| `inspect pwa/dist` | 19.35 MB；构建断言全过（主题数、关键文件、无 Google Fonts、增量清单） |
| `scripts/pwa_export_test.py` | 8/8（最终 tip 文案微调前） |
| `pwa/scripts/smoke.py` | 24/24（同上） |

### 未验证 / 待补

- 最后一轮「导出 8/8 + 冒烟 24/24」被中断，**建议提交前复跑**。
- 未部署、未做线上 E2E（`scripts/pwa_online_e2e.py`）。
- 未用真实跨域图源（防盗链站点）实测失败原因展示；失败分支已用 404 覆盖。
- 长图导出 + 外链图内嵌的联动未单独断言（`waitImages` 会等内嵌图，理论无问题）。

---

## 5. 提交与部署（尚未执行）

用户本轮只要求「写交接」，因此**没有 commit**。接手后按项目纪律逐文件 stage（禁止 `git add .`）：

```bash
git add pwa/src/images.js pwa/src/app.js pwa/index.html pwa/src/style.css \
        pwa/public/sw.js pwa/scripts/build.mjs \
        scripts/pwa_image_localize_test.py \
        CLOSURE.md files/TODO.md docs/handover-2026-10-19-txt-format-exports.md \
        docs/handover-2026-10-24-image-localize.md HANDOVER.md \
        CHANGELOG.md pwa/public/changelog.json
git commit -m "feat(pwa): 外链图本地化（B2 #6）— 导出链路内嵌，复制链路如实提示"
git push origin main
```

部署（**必须 Git Bash**，凭证从 `E:/test/opendoor/.env` 读）：

```bash
& "C:\Program Files\Git\bin\bash.exe" pwa/scripts/deploy.sh
.venv/Scripts/python.exe scripts/pwa_online_e2e.py    # 期望 88/88
```

⚠️ 顺序：**build → 测试 → commit（含两个 changelog 生成物）→ push → deploy**。`deploy.sh` 会硬预检「工作区干净 + HEAD 已在 origin/main」。

---

## 6. 回滚

- 全部：`git revert <本次提交>`，然后**重跑 `build.mjs`** 再部署。
- 单点：删 `pwa/src/images.js`，还原 `pwa/src/app.js` / `pwa/index.html` / `pwa/src/style.css` / `pwa/public/sw.js` / `pwa/scripts/build.mjs`。

---

## 7. 环境速查

| 项 | 值 |
|---|---|
| 仓库 | `E:\test\wechatca2` / `main` |
| 远端 | `origin` = `git@github-wechatca2:sulcr1983/wechatca2.git`（专用 Deploy key，443 端口，已验证可 push） |
| Python | `.venv\Scripts\python.exe` |
| Node | v24.18.1 |
| 系统代理 | `127.0.0.1:7897`（GitHub HTTPS 直连被墙；SSH 不依赖代理） |
| 已知坑 | 公众号拒绝 data URI；抓图只在点击/导出时发生；单图 8MB / 40 张上限；`CHANGELOG.md` 与 `changelog.json` 是受控生成物 |

---

*本文档基于 2026-10-24 的实测状态（HEAD `cefae73`，未提交改动）。若与代码冲突，以代码与实测为准，并回来更新本文。*
