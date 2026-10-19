# ABC 改造 · 排期与测试文档（2026-10-18）

> 范围：A 增量更新 / B 更新检测与不丢数据 / C 本地版审计问题。
> 原则：手术刀式修改；每项改动都要有可执行的验收断言；不通过不算完成。

## 一、排期

| 阶段 | 内容 | 产出 | 验收 |
|---|---|---|---|
| P0 基线 | 跑一遍现有测试，确认起点 | 测试记录 | 全绿（65/35/29 + 有头） |
| A 增量更新 | sw.js 缓存分层、主题/py sha256 manifest、构建注入 BUILD_ID、precache 改 no-cache、critical/optional、`_headers` | 改动 2 个文件 | 构建通过；缓存条目仍 200；离线 8/8 |
| B 更新检测 | version.json 放行、sw.js 字节随构建变、hadController、节流、flush 草稿 | 改动 2 个文件 | 单元断言 + 有头实测 |
| C 审计问题 | 本地版 11 项 | 改动 1 个文件 | 有头 E2E 逐项断言 |
| T1 回归 | E2E / API / 集成 / 有头三套 / PWA 离线 | 测试输出 | 全绿 |
| T2 增量实测 | 两阶段部署对比 | `scripts/pwa_incremental_test.py` | runtime 缓存不丢、themes 请求≈0 |
| T3 对抗审计 | 3 个 agent 交叉审 diff + 修复 | 审计结论 | 高危项清零 |
| D 收尾 | 文档 + 记忆 + 提交 | commit | 工作区干净 |

## 二、A 增量更新的验收标准

| 编号 | 断言 | 方法 |
|---|---|---|
| A-1 | `supersu-runtime-v1` 跨版本保留（Pyodide 5 条不被删） | 两阶段实测：第二阶段 `caches.keys()` 含 runtime，且 entries ≥5 |
| A-2 | 主题只下变化的：164 个 JSON 在第二轮 install 中请求数 ≤2 | Playwright 记录 `request` URL 含 `/themes/` 的数量 |
| A-3 | `themes/manifest.json` 每个 id 有 sha256，改一个主题只有该条 hash 变 | 构建两次（改一个 JSON）对比 manifest diff |
| A-4 | 预缓存不再强制 `reload`，未变文件走 304 | 代码断言：`cache: 'reload'` 在 sw.js 中出现次数 = 0 |
| A-5 | `SHELL` 不含不存在的 `src/cover.js` | 构建后 `dist/src/cover.js` 不存在 → 断言清单不含 |
| A-6 | critical 资源缺失时 install 失败（不静默装半套） | 代码断言：critical 分支 `throw`；有单测脚本模拟 |
| A-7 | 产物含 `_headers`，`sw.js`/`version.json`/`index.html` 为 must-revalidate | 构建后读文件断言 |
| A-8 | `sw.js` 的 VERSION 由构建注入，两次不同构建字节不同 | 连续两次 build，比较 `dist/sw.js` sha256 |

## 三、B 更新检测的验收标准

| 编号 | 断言 | 方法 |
|---|---|---|
| B-1 | `/version.json` 不经过 SWR（fetch handler 直接放行） | 代码断言 + 浏览器：请求 `version.json` 时响应头无 SW 缓存痕迹（`caches.match` 为 null） |
| B-2 | 只改 JS 也触发 SW 更新（sw.js 字节变化） | 两次构建 `dist/sw.js` sha256 不同（同 A-8） |
| B-3 | 首次安装不额外 reload 一次 | 代码断言 `hadController` 守卫存在；有头：首访 `controllerchange` 不触发 reload |
| B-4 | 点「立即更新」前草稿已落盘 | 有头：输入后立即点更新，reload 后文字仍在 |
| B-5 | 可见性检查节流 5 分钟 | 代码断言常量 + 时间戳判断 |

## 四、C 审计问题的验收标准（本地版）

| 编号 | 断言 | 方法 |
|---|---|---|
| C-1 「看示例」 | 编辑器有内容时点击：内容变为示例、出现「撤销」；点撤销恢复原文 | 有头 |
| C-2 「智能转换」 | DOM 中不存在 `#sw-chip`（假控件已下线） | 有头断言 count=0 |
| C-3 清空后空态 | 清空后 `#pv-empty-state` 可见、iframe 内容为空、字数清空 | 有头 |
| C-4 抽屉选主题 | 选卡后 drawer 无 `.open` | 有头 |
| C-5 导入文档 | DOM 中不存在 `#btn-import` | 有头 |
| C-6 识别结构胶囊 | `.parse-chip` 标签名是 `span`，CSS 无 `cursor:pointer` | 有头 + 静态 |
| C-7 小红书字数 | 520 字时计数器带 `over` 类（红色）且出现提示 | 有头 |
| C-8 假「已保存」 | 输入 → 500ms 后写入 localStorage；刷新 → 自动恢复；失败时文案为「本地保存失败」 | 有头 + JS 断言 |
| C-9 清空可撤销 | 点清空出现「撤销」，点后内容恢复 | 有头 |
| C-10 整理格式 | 代码块缩进不变、嵌套列表缩进不变；提示数字与实际修改行数一致 | 有头 |
| C-11 生成失败 | 断网/500 后不再停留在「正在生成封面」 | 有头（拦截路由注入 500） |

## 五、执行命令

```bash
# 后端 / 单元
python tests/test_e2e.py                  # 期望 74/74（含新增断言）
python tests/test_api_e2e.py              # 期望 29/29
python tests/test_integration.py          # 需先起服务，期望 35/35

# 有头
python tests/test_headed_full_e2e.py      # 双页全按钮
python tests/test_headed_userflow.py      # 用户流程
python tests/test_headed_wechat_copy.py   # 复制/推送/封面

# PWA
node pwa/scripts/build.mjs
python scripts/pwa_offline_test.py        # 期望 8/8
python scripts/pwa_incremental_test.py --phase 1   # 部署前快照
# （部署 v4）
python scripts/pwa_incremental_test.py --phase 2   # 增量断言
```

## 六、回归风险与对策

| 风险 | 影响 | 对策 |
|---|---|---|
| 缓存分层改了 activate 删除规则 | 旧用户首次升级可能重复下载 | activate 里迁移旧 `supersu-cdn-*` / `supersu-data-*` 条目到稳定缓存再删 |
| 主题键改成 `?h=` | 运行时命中率下降 → 每次渲染回源 | fetch handler 用 manifest 映射；manifest 失败时回退普通键 + 网络 |
| 删了 `#sw-chip` / `#btn-import` | 有头套件按 id 断言会失败 | 同步更新测试，删掉对应步骤 |
| 草稿自动恢复 | 用户以为「打开就是新稿」，实际恢复旧稿 | 恢复时 toast 明示「已恢复上次草稿」+ 撤销 |
| 整理格式跳过代码块 | 原本期待被 trim 的行不变 | 提示只报实际修改行数，0 时提示「已经很整齐」 |

## 七、对抗性审计清单（T3）

- 增量：缓存键冲突、manifest 404/损坏回退、activate 迁移失败是否安全
- 更新：skipWaiting 时机、reload 循环、多标签同时更新
- 数据：localStorage 写失败、schema 变更、恢复覆盖用户新输入
- 回归：删除元素后残留的 CSS/JS 引用、测试死链
- 安全：`_headers` 是否误伤、manifest 是否泄露不该公开的文件
