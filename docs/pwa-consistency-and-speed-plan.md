# PWA 功能对齐 + 加载提速 + 静默更新 · 方案（2026-10-18）

> 苏哥四条需求的落地方案。先给实测事实，再给方案与决策点。
>
> ## 落地进度（2026-10-18 收尾）
> - ✅ **S1 静默更新 + 不阻塞首屏 + 真实文案**：启动提示改成底部小条（40px，pointer-events:none）；引擎未就绪也能输入；`update.js` 打开 3s 主动查、空闲（不可见 / 编辑器空 / 30s 无输入且失焦）自动应用、`BroadcastChannel` 多标签只刷一个、`?reset-sw` 自救。
> - ✅ **S2 Pyodide 同源自托管**：5 个文件放 `pwa/public/runtime/pyodide/0.28.3/`，`_headers` immutable + wasm MIME，SW 走 `supersu-store-runtime-v1`；实测 runtime 缓存 11.69MB 跨版本保留，离线 10/10。
> - ✅ **S3 AI（纯前端 BYOK）**：`pwa/src/ai.js` + 右上「AI」面板，支持润色 / 智能排版 / 摘要；智能排版 = LLM 只出结构 JSON → Pyodide `apply_structure` 套用（正文一字不改）。
> - ⏳ **S4 小红书封面**：未开工。需 2~3 天（10 套模板 + modern-screenshot + 下载/长按保存），下一步单独做。

## 七、首访提速（2026-10-18 二次改造，已上线）

### 实测：首访到底慢在哪

`scripts/pwa_timeline_probe.py`（空 profile，系统 Chrome）：

| 里程碑 | 耗时 |
|---|---|
| FCP 首屏绘制 | 2.5s |
| DOMContentLoaded | 2.4s |
| 主题就绪 | 3.2s |
| **引擎就绪（能精确排版）** | **22.6s** |

分项传输（页面侧）：字体 94KB + 应用代码 41KB + 外壳 22KB + 主题 10KB；**真正的大头是 Worker 里的 12.1MB 运行时**（约 530KB/s ≈ 22 秒）。

### 业界怎么做（调研结论）

| 做法 | 代表 | 说明 |
|---|---|---|
| 首屏只给「可交互壳」 | Figma / Notion / StackBlitz | 先出 UI + 骨架，数据/运行时后到 |
| 重运行时**离开首屏** | 各家 | 不进 `install`、不 `preload`、`load` 后 idle 启动 |
| **轻量层先出近似结果** | VSCode Markdown 预览 / GitHub | 轻渲染器先给结果，重引擎好后替换 |
| 关键动作后置 | 各家 | 精确结果就绪前禁用「复制/导出」 |
| 拆包 + 按需 | Notion / Figma | 只拉当前页/当前主题，不一次全拉 |

结论：**没有把 5MB 变没的银弹**，正解是「别让用户等它」。

### 本次落地

1. **轻量即时预览**（`pwa/src/light.js` + `vendor/marked.min.js` 39.9KB / br 约 12KB）：
   引擎没就绪时用 marked + 主题 `styles` 直接出一版近似排版，badge 显示「快速预览 · 精确排版准备中」，**复制按钮保持禁用**；精确结果到达后原地替换并解锁复制。
   极简预处理：首行短标题 → h1、孤立短行 → h2、列表/引用/表格/围栏原样交给 marked。
2. **引擎改为空闲时启动**：`requestIdleCallback(timeout 2500)`，先让外壳/主题/轻量预览拿到带宽。
3. 结果：**首访 2.5 秒就能看到排版**（原先 22.6 秒才有东西），精确版随后静默替换。

### 还没做（可选，按需再上）

- 把 `precacheData()`（168 个主题 1.55MB）移出 `install`，改为「引擎就绪后空闲预取」——进一步减少与引擎抢带宽。
- 主题合并成 4~8 个 pack（164 个小请求 → 少量大请求）。
- `saveData` / 2G/3G 时默认不自动下引擎，改成用户点「精确排版」再下。

### 验收

```bash
python scripts/pwa_timeline_probe.py      # 首访里程碑
python scripts/pwa_light_preview_test.py  # 6/6：2.5s 出近似预览、复制锁、精确后替换
python scripts/pwa_offline_test.py        # 10/10（回归）
python scripts/pwa_s1s3_test.py           # 9/9（回归）
```


## 一、实测：现在还重下 11MB 吗？

用系统 Chrome（有头）在 `https://supersu.ccwu.cc` 实测（`scripts/pwa_payload_probe.py`）：

| 场景 | 主文档侧传输 | 引擎(Worker)传输 | 结论 |
|---|---|---|---|
| 首次打开（空缓存） | 0.16MB | ≈5.25MB（br 压缩后） | 首访就是慢，这是真的 |
| 第二次刷新 | 0.00MB | 0 | 走 SW 缓存 |
| 第三次刷新 | 0.00MB | 0 | 同上 |
| 断网刷新 | 0.00MB | 0 | 全离线可用 |

缓存占用实测：`shell 0.36MB + 主题 1.55MB + Pyodide 10.65MB = 12.56MB`，跨版本保留（增量测试 6/6 已验证）。

**11MB 是未压缩体积**；`pyodide.asm.wasm` 8.24MB 经 CF 的 Brotli 实际传 2.74MB，`python_stdlib.zip` 2.31MB 传 2.27MB。

### 那为什么你会觉得"每次都在重下"？

| 根因 | 证据 | 影响 |
|---|---|---|
| **文案与进度是假的** | `engine.worker.js` 无论缓存命中都显示"下载 Python 运行时（约 11MB）"，进度 4/12/62% 写死 | 每次打开都像在重下 |
| **遮罩阻塞 UI** | `app.js` 等 boot 完成才隐藏遮罩，弱网 6~40s 不能输入 | 等待被放大成"没法用" |
| **真会重下的场景** | ① 微信内置浏览器没有 SW；② iOS 未"添加到主屏幕"会被 7 天清缓存；③ 换设备/清数据；④ jsdelivr 在国内不稳 | 这些才是真重下 |

## 二、提速方案（按收益排序）

| # | 动作 | 收益 | 工作量 | 风险 |
|---|---|---|---|---|
| 1 | **Pyodide 自托管到同源**（`/runtime/pyodide/0.28.3/`，5 个文件 12.5MB，单文件最大 8.24MB < CF 25MB 限制），配 `immutable` 长缓存 + SW 专用 CacheFirst | 去掉 jsdelivr 单点；一次下载永久命中；国内失败面变小 | 1 天 | 低（MIME 要显式 `application/wasm`） |
| 2 | **撤阻塞遮罩 + 真实进度**：能输入就先给输入；进度按 `transferSize` 求和，0 字节显示"本地缓存，秒开"；文案改"约 5.3MB" | 直接消除"没法用"的感知 | 0.5 天 | 低 |
| 3 | **`navigator.storage.persist()` + 上次结果秒显**（localStorage 存上次 HTML，刷新先显示旧版再后台重算） | 首屏不空；减少被清缓存概率 | 0.5 天 | 低 |
| 4 | **boot 提前**（当前先取 1.6MB 主题再 boot，可并行）+ wasm preload | 省 0.3~1s | 0.3 天 | 低 |
| 5 | stdlib 裁剪（pyodide-pack） | 省约 1.5MB | 3~5 天 | 高，暂不做 |

**不建议**：JS 重写引擎（2~4 周、双引擎必然漂移）、MicroPython（markdown 的 zipimport/dist-info 跑不通）。

## 三、静默更新（需求 3）+ 鲁棒性（需求 4）

### 现状
- 已有：`update.js` 每 60 分钟 + 回前台查；有 waiting 就弹右下角卡片，用户点"立即更新"才 `skipWaiting`。
- 缺：**打开时不主动查**（只在注册时被动发现）；没有"空闲自动更新"；出错会卡在"更新中…"（已加 15s 兜底，但没验证过）。

### 建议的目标行为
```
打开 → 先显示缓存内容（不等网络）
     → 后台查更新（version.json + registration.update）
     → 有新版：不弹卡片，只在角标显示"有新版本 · 已后台下载"
     → 下载完（waiting）：
          · 用户空闲（无焦点/无输入/不可见）→ 自动应用（落盘草稿 → skipWaiting → reload）
          · 用户正在写 → 只显示小提示"更新已就绪，写完自动应用"
```
关键约束：
- **应用前必须落盘草稿**（已做：`applyUpdate` 调 `__supersuFlushDraft`）。
- **不在输入法组合态/有未保存变更时 reload**。
- **失败可回滚**：新 SW 安装失败 → 旧 SW 继续服务（已有）；shell 关键文件缺失 → install 直接失败（已做）。
- **多标签页只刷一个**（BroadcastChannel），其余标签显示"下次打开生效"。
- **兜底开关**：URL 加 `?reset-sw` 时注销 SW + 清缓存并 reload（用户自救）。

### 验收（有头）
1. 打开时检测到新版本 → 角标出现 → 空闲 10s 内自动应用 → 页面内容不丢。
2. 正在输入时检测到更新 → 不自动 reload，提示存在。
3. 注入 404 让 install 失败 → 旧版本仍可用，不白屏。
4. 断网打开 → 正常用，不弹错误。

## 四、功能对齐（需求 1）：PWA 要有 AI + 小红书封面

### 4.1 AI（润色 / 智能排版 / 摘要 / 封面图）

纯静态站没有后端，两个选项：

| 方案 | key 安全 | 平台兼容 | 改动 |
|---|---|---|---|
| **A. Cloudflare Pages Functions 做 `/api/*` 代理**（推荐） | key 存 Pages Secret，前端不接触 | 全部平台（同源无 CORS） | 新建 `pwa/functions/api/[[path]].js`（约 150 行）+ 构建写 `_routes.json` |
| B. 浏览器直连（BYOK） | key 在 localStorage，XSS/CDN 劫持可读；OpenAI/阿里官方明确不建议 | 智谱预检就失败；错误常被吞成 Failed to fetch | 约 120 行，零后端 |

实测：DeepSeek / 阿里百炼 / Moonshot / SiliconFlow 预检通过；OpenAI 预检通过但 401 无 CORS 头；智谱预检即失败。

**推荐 A**：与现有 Flask 的 `/api/polish` 路径同名，前端一套调用约定两端通用；免费额度 10 万请求/天，个人用不完。
⚠️ 部署坑：`wrangler pages deploy` 只认**当前工作目录**的 `functions/`，`deploy.sh` 必须先 `cd pwa`；并且必须写 `_routes.json` 只让 `/api/*` 进 Functions，否则静态请求也计费。

### 4.2 小红书封面

先纠正一个前提：本地版**实际只用 2 个风格 × 3 尺寸**（`guizang_renderer.py` 内联拼 HTML），`public/cover-templates/` 那 10 套是**没被调用的孤儿资产**；BLCaptain 9 风格依赖 Node+Playwright，纯静态做不了。

| 阶段 | 范围 | 技术 | 工作量 |
|---|---|---|---|
| P0 | editorial × 1080×1440 | `modern-screenshot`（29KB）+ 离屏 iframe + 系统字体 | 0.5~1 天 |
| P1 | 2 风格 × 3 尺寸（= 本地真实基线） | 同上 + fitty 自适应 | 2~3 天 |
| P2 | 加 10 套模板做额外风格 | 同上；注意 AGPL（模板是上游资产，放公开 dist 会触发分发义务） | +4~5 天 |

不做：BLCaptain（需要 Node 端渲染）。

**中文字体**：PWA 现在只有 156KB 拉丁字体，没有中文。方案：
- A（推荐）：用系统字体栈（苹方/微软雅黑），0 字节，跨平台字形略有差异；
- B：加 1.5MB 单一宋体常用字子集，仅标题用；
- C：全字重约 9MB（dist 翻倍，不建议）。

微信内保存：微信里 `a[download]`/`navigator.share` 基本无效，只能显示大图 + "长按保存到相册"（用 data URL，blob 在 iOS 微信更严）。

## 五、建议排期

| 阶段 | 内容 | 是否需决策 |
|---|---|---|
| S1（1.5 天） | 静默更新 + 鲁棒性 + 真实进度/非阻塞首屏 | 否，可直接做 |
| S2（1 天） | Pyodide 自托管 + 持久化存储 + 上次结果秒显 | 需定：同源 or 加大陆镜像 |
| S3（1 天） | Pages Functions 代理 + AI 润色/摘要 | 需定：key 放哪 |
| S4（1.5 天） | AI 智能排版（Pyodide 跑 apply_structure） | 否 |
| S5（2~3 天） | 小红书封面 P0→P1 | 需定：基线范围 |

## 六、要苏哥拍板的三件事

1. **AI 的 key 放哪**：Pages Secret 代理（推荐）／纯前端自带 key／先不做 AI。
2. **小红书"一致"按哪个基线**：只做本地真用的 2 风格×3 尺寸（推荐）／连同 10 套模板（+4~5 天，且有 AGPL 风险）／还要 BLCaptain（纯静态做不到）。
3. **Pyodide 放哪**：同源 CF Pages（推荐，零新增成本）／同源 + 大陆镜像（要 ICP 域名和服务器）。
