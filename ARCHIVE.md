# 封存记录（Archive）

> 这里记录**已从工作区移除、但仍可通过 git 取回**的东西。
> 铁律：删除前先打 tag，绝不直接 `rm` 掉历史。

---

## 2026-10-28 · 本地 Flask 版封存

**tag：`flask-v1-archive-2026-10-28`**

### 为什么封存

主产品早已是 PWA（纯静态、无后端，`https://supersu.ccwu.cc`）。Flask 版从 2026-10-18
起就标记「弃用、保留回退」，但一直留在仓库里，代价是实打实的：

1. **误导后来者（包括 AI）**：仓库根目录同时有 `app.py` 和 `pwa/`，看结构会以为
   项目是双后端。已经发生过好几次「照着 Flask 的结构改 PWA」的返工。
2. **文档里的假命令**：`AGENTS.md` 写着 `python tests/test_e2e.py`（74/74）、
   `test_integration.py`（35/35），这些**早已不在任何门禁里**，跑了才发现要起 5000 端口。
3. **占体积 + 残留数据**：`data/` 里是运行时残留（历史记录、空配置）。

### 移出了什么

| 路径 | 内容 | 说明 |
|---|---|---|
| `app.py` | Flask 主应用（路由 + SSE + API） | PWA 完全不经过它 |
| `templates/` | Flask 模板（`index.html`） | 旧前端 |
| `data/` | 运行时数据（accounts/history/ai_config/pexels） | 均为空或残留 |
| `tests/` | Flask 时代的测试（test_e2e / test_integration / test_api_e2e / test_headed_*） | 都不在门禁里 |
| `start-app.bat` | 双击启动器 | 只调 `app.py` |
| `scripts/run_headed_test.bat` | 上面那套 `tests/` 的快捷入口 | 只调 `tests/test_headed_full_e2e.py` |
| `scripts/audit_run.py` | Flask 时代审计器 | 直接读 `app.py` + `templates/index.html` |

### 保留了什么（重要）

`core/format_engine.py`、`core/preprocessor.py`、`public/themes/` **没有动** ——
它们仍是 PWA 的引擎真源，构建时会被拷进 `pwa/dist/py/` 与 `pwa/dist/themes/`。
封存的只是 **Flask 外壳**，不是排版引擎。

`tests/fixtures/txt-format-lab.txt` 挪到了 `scripts/fixtures/`（`ai_structure_smoke.py`
的示例参数用到），没有丢。

### 怎么取回

```bash
# 看完整旧版（临时分支，不污染 main）
git switch -c flask-v1 flask-v1-archive-2026-10-28

# 只取某个文件回当前分支
git checkout flask-v1-archive-2026-10-28 -- app.py
git checkout flask-v1-archive-2026-10-28 -- app.py templates data tests

# 恢复启动脚本
git checkout flask-v1-archive-2026-10-28 -- start-app.bat
```

> 取回后需要装 Flask：`pip install flask>=3.0 platformdirs>=4.0`
> （已从 `requirements.txt` 移除，因为 PWA 不需要）

### 安全备注

`data/ai_config.json` 里的 `api_key` 当时是**空值**（阿里百炼平台配置残留），
`accounts.json` / `history.json` / `pexels.json` 也均为空列表 —— 封存前已确认无凭据泄漏。
即使有，删掉的只是工作区文件，历史记录里仍可查，敏感值该轮换还是要轮换。

---

## 约定（新增封存时照抄）

1. 先 `git tag -a <名字>-<日期> -m "封存：<是什么> + 为什么 + 怎么取回"`
2. 再 `git rm`
3. 在本文件追加一节，写清「为什么 / 移出了什么 / 保留了什么 / 怎么取回」
4. 同步清理引用它的活文档（README / AGENTS / docs），**历史快照保留但加过期声明**
