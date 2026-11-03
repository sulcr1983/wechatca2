# 现成更新模块调研（2026-11-03）

> 问题：**有没有现成好用的更新模块代码可以直接用，不要自己折腾？**  
> 方法：npm registry 实查维护状态 + 下载二进制**在本仓库真实 git 历史里实跑** + 现有代码耦合度拆解。  
> 结论先行：**没有能直接套的。** 但原因不是"没好库"，而是**你痛的那一层，业界没有库可解**。



---

## 0. 一句话结论

更新模块可以拆成三层，**只有第一层有现成库，而那层你本来就写得比库更贴合**：

| 层                   | 现有代码                     | 有现成库吗                                                  | 换库收益                 |
| ------------------- | ------------------------ | ------------------------------------------------------ | -------------------- |
| ① SW 检测 + 提示用户更新    | `initSW()` **89 行**      | ✅ workbox-window / vite-plugin-pwa / 若干 npm 包          | **低**（你的自定义 SW 反而更配） |
| ② 更新记录生成（changelog） | `gen_changelog.py` 434 行 | ⚠️ git-cliff / conventional-changelog / release-please | **负**（见 §3 实测）       |
| ③ 更新记录面板 UI         | `changelog.js` **887 行** | ❌ 无                                                    | —                    |

**你昨天诊断出的「乱」，100% 在第②层。而第②层的病根是「版本边界靠人手」——这是流程问题，换任何库都不解决。**

量化：现有更新模块 **3612 行**（含 sw.js 616 + gen_changelog 434），其中**真正通用、可被库替代的只有 89 行 = 2.5%**。

---

## 1. 先排除一个常见误解

很多人以为「更新模块」= 「检测到新版本弹个提示」，所以去找库。但你的更新模块里：

- 检测 + 提示：`initSW()` 89 行 —— 有库
- 更新记录面板（亮点/分组/折叠/搜索/反馈入口/诊断）：`changelog.js` **887 行** —— 没库
- 记录生成（commit 解析 → 分组 → 版本分桶）：`gen_changelog.py` 434 行 —— 有库但**不适用**

**887 行面板 UI 没有任何现成方案**。这是产品定制（你的「发布小票」「开发者细节折叠」「反馈入口预填版本」都是自创交互），业界库最多给你一个 toast。

---

## 2. 候选库实查（npm registry，2026-11-03 实测）

| 包                                      | 最新版     | 最后发布           | 许可证        | 判断                 |
| -------------------------------------- | ------- | -------------- | ---------- | ------------------ |
| `workbox-window`                       | 7.4.1   | **2026-05-04** | MIT        | ✅ 活跃，Google 官方     |
| `vite-plugin-pwa`                      | 2.0.0   | **2026-10-03** | MIT        | ⚠️ 活跃，但**要 Vite**  |
| `git-cliff`                            | 2.14.2  | **2026-09-18** | MIT/Apache | ✅ 活跃，单二进制          |
| `conventional-changelog`               | 8.1.3   | 2026-08-12     | MIT        | ✅ 活跃               |
| `release-please`                       | 17.11.2 | 2026-08-24     | Apache-2.0 | ⚠️ **绑 GitHub CI** |
| `semantic-release`                     | 25.0.9  | 2026-08-05     | MIT        | ⚠️ **绑 CI + 自动发版** |
| `@plugin-web-update-notification/vite` | 2.1.3   | 2026-07-31     | MIT        | ⚠️ **要 Vite**      |
| `sw-update-manager`                    | 1.0.0   | **2018-09-23** | MIT        | ❌ **8 年没更新**       |
| `service-worker-updater`               | 0.0.3   | **2020-03-27** | —          | ❌ 6 年没更新           |
| `ember-service-worker-update-notify`   | 3.0.0   | **2019-10-30** | MIT        | ❌ Ember 专用，已弃      |

> 那些"搜出来很像个答案"的（sw-update-manager 等）全是 2018~2020 年的僵尸包。**别用。**

---

## 3. 决定性实测：git-cliff 在**你这个仓库**上跑的结果

我没有只看文档，把 `git-cliff 2.14.2` Windows 二进制下下来，在**本仓库真实历史**上实跑：

```bash
git-cliff --repository . --unreleased --tag 1.18.0 --strip header
```

**结果（原文摘录）**：

```
WARN  "cliff.toml" is not found, using the default configuration
WARN  1 commit(s) were skipped due to parse error(s)
## [1.18.0] - 2026-11-03

### 🚀 Features
- WechatAI Formatter initial commit — … + 53 themes + one-click push
- Step 3 完成 — SSE优化 + iPhone 17手机预览 + 项目文档更新
- …（423 个提交，从 2026-05-22 一直到今天，全部塞进 1.18.0 一个版本）
```

**这就是你昨天那个 bug 的翻版**：一个版本卡片装了 5 个月、423 个提交。

|                                             |                  |
| ------------------------------------------- | ---------------- |
| 原因：git-cliff **靠 git tag 切版本**，而你 \`git tag | wc -l\` = **0**。 |

再做一个对照实验（新建仓库，手动打两个 tag）：

```bash
## [1.1.0]   ← 只有 Bug 4 / Bug 5（tag 之后的 2 条）
## [1.0.0]   ← 只有 Feature 1/2/3（tag 之前的 3 条）
```

**打 tag 就正常切分**。

### 所以 git-cliff 的真实含义

它不是"替代 gen_changelog.py"，而是**把「手写 JSON 切点」换成「打 git tag」**。  
两者都是**人工动作**——你昨天漏加切点导致 62 条挤进 1.17.0，换成 tag 就是"忘了打 tag"导致同样塌。  
**病根没动，只是换了个手滑的地方。**

---

## 4. 逐层能不能换：具体分析

### ① 更新检测层（89 行）—— 能换，但不划算

**workbox-window 7.4.1 实测**：有 ESM 构建，**6.0KB**，导出 `{Workbox, WorkboxEvent, messageSW}`，  
协议**正好匹配**你的 sw.js（它发 `{type:'SKIP_WAITING'}`，你 `sw.js:383` 监听的就是这个）。

```js
// 换掉 initSW 的核心，约 25 行
import { Workbox } from '../vendor/workbox-window.prod.mjs';
const wb = new Workbox('./sw.js');
wb.addEventListener('waiting', () => onReady());
wb.addEventListener('controlling', () => location.reload());
wb.register();
```

**但净收益是负的**，因为你会丢掉三样自己写的东西：

| 你的实现                                  | 换库后                                    |
| ------------------------------------- | -------------------------------------- |
| `PRECACHE_PROGRESS` 真实下载进度（文件数/字节/耗时） | 库不管，仍要自己监听 message                     |
| `version.json` 独立轮询（双通道，防 SW 卡住）      | 库不管，仍要自己写                              |
| 「页面不可见 / 空闲 10 分钟才自动应用」策略             | 库只给 `autoUpdate`（立刻刷，可能打断输入）或 `prompt` |
| 首次安装不 reload 的判断（`hadController`）     | 库用 `isExternalInstallation` 近似，语义不同    |

**结论：省 ~60 行，丢 4 个已有特性，多 6KB 依赖 + 一层抽象。不值。**  
真要简化，直接删 `version.json` 双通道那条线更省事（那是 2026-10-24 为「版本不 bump」加的补丁，现在 release.py 每次必 bump，已经冗余）。

### ② 更新记录生成层 —— 现成库**全部依赖人工版本边界**

| 方案                       | 版本边界靠什么                       | 对你的适配度                 |
| ------------------------ | ----------------------------- | ---------------------- |
| `git-cliff`              | **git tag**                   | 🔴 你 0 tag，实测 423 条挤一版 |
| `conventional-changelog` | **git tag**                   | 🔴 同上                  |
| `release-please`         | **git tag + GitHub CI**       | 🔴 同上 + 你无 CI          |
| `semantic-release`       | **git tag + CI + 自动 publish** | 🔴 同上 + 会真发版           |
| 你现在的 `gen_changelog.py`  | **手写 JSON 切点**                | 🟡 至少能兜底自动补            |

**四个库没有一个是「按 commit 时间/内容自动切版本」的——因为语义化版本号本质是人的决策，机器猜不出来。**

你昨天诊断出的三个真问题（卡片越界 62 条、条数口径 77vs23、dev scope 漏判），**换 git-cliff 一个都解决不了**，  
反而会把「手写 JSON」的兜底能力（`ensure_milestone` 自动补切点）丢掉——git-cliff 忘了打 tag 就直接没救。

### ③ 面板 UI（887 行）—— 无库

`changelog.js` 里这些全是自创，没有库会给你：

- 版本卡 + 「最新」标签 + 高亮「本次更新」
- 亮点列表（`highlights`）与开发者细节折叠（`dev`）
- 类型 chips 过滤 + 搜索（命中折叠区自动展开）
- 反馈入口（`mailto:` 预填版本+浏览器）
- 最近 5 次更新诊断

---

## 5. 唯一值得抄的「现成代码」：`@plugin-web-update-notification` 的检测时机

这个库（2.1.3 / 2026-07-31 / MIT）**整体不能用**（绑 Vite），但它的**检测时机设计**值得对照——  
你的 `initSW` 已经覆盖了大部分，它多两个：

```js
// 它的检测时机（可从源码抄逻辑，不装包）
checkImmediately: true      // 首次加载 ✅ 你已有（延迟 3s）
checkInterval: 0.5 * 60e3   // 轮询 ✅ 你已有（CHECK_MS）
checkOnWindowFocus: true    // 窗口聚焦 ✅ 你已有（visibilitychange，还更细）
checkOnLoadFileError: true  // ★ 资源 404 时也查一次 ← 你没有
```

**`checkOnLoadFileError` 是你缺的一个低成本改进**：用户开着旧页面，某个 `?h=` 资源 404 时立刻查一次更新。  
约 8 行代码，比换库划算得多。

---

## 6. 那到底怎么"不折腾"？

**真正的省力方案不是换库，是把现成的 `gen_changelog.py` 补三个洞**（昨天报告里的 C-1/C-4/C-6）。  
理由：你现在 3612 行代码里，**要改的只有约 60 行**，而换库要动 89 行 + 6KB 依赖 + 重跑 11 项回归 + 丢 4 个特性。

| 方案                            | 改动量                               | 风险                   | 能解决「乱」吗  |
| ----------------------------- | --------------------------------- | -------------------- | -------- |
| **A. 补 3 个洞（推荐）**             | ~60 行，2 个文件                       | 低（纯生成器+前端）           | ✅ 全部     |
| B. 换 workbox-window           | 89 行重写 + 6KB + 11 项回归             | 中（丢进度/双通道）           | ❌ 一层都不解决 |
| C. 换 git-cliff                | 重写 gen_changelog + 给 33 个版本补打 tag | **高**（历史 tag 无法准确还原） | ❌ 反而更差   |
| D. 全套换 Vite + vite-plugin-pwa | 引入打包器，推翻 build.mjs 46707 字节       | **极高**               | ❌ 不解决    |

### 特别提醒 C 方案的硬伤

给 33 个历史版本补打 tag，需要知道**每个版本对应哪个 commit**——`milestones` 里只有 `until` 时刻，  
`version.json` 历史里 1.14.0/1.15.0 根本不存在（昨天已查实）。**这段历史无法准确还原成 tag。**  
一旦 tag 打错，git-cliff 的输出比现在更乱，且**不可回滚**（tag 是 git 引用）。

---

## 7. 建议（等你拍板）

**推荐 A**：保留现有代码，只补三个洞。

1. **C-1 越界检测**（~15 行，`gen_changelog.py` + `preflight.py`）—— 立刻拦住「62 条挤一版」复发
2. **C-4 条数口径统一**（~10 行，`changelog.js`）—— 修「77 vs 23」
3. **C-6 dev scope 白名单**（~10 行，`gen_changelog.py`）—— 26% 开发黑话降下来
4. 顺手抄 `checkOnLoadFileError`（~8 行）—— 资源 404 时补一次更新检查

**如果你坚持想"用现成的"**，唯一站得住的组合是：  
`workbox-window`（检测层，6KB）+ **保留自己的 gen_changelog 和面板**。  
但这只省 60 行、丢 4 个特性，我不推荐——**投入产出比是负的**。

---

## 8. 一句话给苏哥

**没有现成好用的。** 不是业界没库，是**你痛的那层（更新记录内容乱）业界没库**——  
所有 changelog 库都把「版本边界」甩给人（tag 或切点），因为版本号本来就是人的决策。  
你现在这套虽然 3612 行，但**要修的只有 60 行**；换任何库都是"为了不折腾而折腾得更狠"。

---

## 附：复现命令

```bash
# 候选库维护状态
curl --noproxy '*' -s https://registry.npmjs.org/workbox-window | python -c "import json,sys;d=json.load(sys.stdin);lv=d['dist-tags']['latest'];print(lv,d['time'][lv][:10])"

# workbox-window ESM 产物（6.0KB，导出 Workbox/messageSW）
curl --noproxy '*' -s https://unpkg.com/workbox-window@7.4.1/build/workbox-window.prod.mjs -o wbw.mjs
grep -o "export{[^}]*}" wbw.mjs

# git-cliff 在本仓库实测（关键证据）
npm i git-cliff-windows-x64 --no-save
./node_modules/git-cliff-windows-x64/bin/git-cliff.exe --repository . --unreleased --tag 1.18.0 --strip header

# 确认 0 tag
git tag | wc -l    # → 0
```
