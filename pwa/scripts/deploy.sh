#!/usr/bin/env bash
# PWA 部署到 Cloudflare Pages（supersu-pwa）
# 凭证从 E:/test/opendoor/.env 读取 CLOUDFLARE_ACCOUNT_ID / CLOUDFLARE_API_TOKEN
# 规则：不落盘副本、不打印凭证、不提交本仓库
set -euo pipefail
cd "$(dirname "$0")/../.."   # 仓库根 E:/test/wechatca2

ENV_FILE="${CLOUDFLARE_ENV_FILE:-/e/test/opendoor/.env}"
PROJECT="supersu-pwa"

# 凭证来源（2026-10-25 改）：两种方式任选其一，不再强制 .env
#   ① 显式凭证文件（CLOUDFLARE_ENV_FILE 指定，或默认 /e/test/opendoor/.env）
#   ② wrangler 登录态（npx wrangler whoami 能看到账号即可）
# 原实现强制要求 ①，但 opendoor/.env 已不存在，而 wrangler 明明已登录，
# 导致「明明有登录态却部署不了」。现在 ① 存在就用 ①，否则走 ②。
if [[ -f "$ENV_FILE" ]]; then
  # 只把两个变量导出到本进程环境，不回显
  set -a
  # shellcheck disable=SC1090
  source "$ENV_FILE"
  set +a
  : "${CLOUDFLARE_ACCOUNT_ID:?ERROR: $ENV_FILE 缺少 CLOUDFLARE_ACCOUNT_ID}"
  : "${CLOUDFLARE_API_TOKEN:?ERROR: $ENV_FILE 缺少 CLOUDFLARE_API_TOKEN}"
  echo "==> 使用凭证文件 $ENV_FILE"
else
  # wrangler 凭证位置（2026-10-25 核实）：
  #   Windows: $APPDATA/xdg.config/.wrangler/config/default.toml
  #   Linux/macOS: ~/.config/.wrangler/config/default.toml
  # 原来用 `npx wrangler whoami` 探测，但它会因代理警告/网络抖动返回非 0
  # → 「明明有登录态却报没登录」（实测踩到）。改为直接看凭证文件，稳定可靠。
  WR_CFG_WIN="${APPDATA:-}/xdg.config/.wrangler/config/default.toml"
  WR_CFG_NIX="$HOME/.config/.wrangler/config/default.toml"
  if [[ -f "$WR_CFG_WIN" ]] || [[ -f "$WR_CFG_NIX" ]]; then
    echo "==> 使用 wrangler 登录态"
  elif npx --yes wrangler@latest whoami >/dev/null 2>&1; then
    echo "==> 使用 wrangler 登录态（whoami 探测通过）"
  else
    echo "ERROR: 既没有凭证文件 $ENV_FILE，也找不到 wrangler 登录态。" >&2
    echo "       已查：$WR_CFG_WIN" >&2
    echo "             $WR_CFG_NIX" >&2
    echo "       解决（二选一）：" >&2
    echo "         a) npx wrangler login" >&2
    echo "         b) 建 $ENV_FILE 写入 CLOUDFLARE_ACCOUNT_ID / CLOUDFLARE_API_TOKEN" >&2
    exit 1
  fi
fi

# ── 铁律（2026-10-18）：部署到服务器的一律先同步 git ─────────────────────
# 线上内容必须与仓库可对齐、可回滚：已跟踪文件必须干净，且 HEAD 必须已推送到 origin/main
# （deploy 用的就是 --branch=main）。
if [[ -n "$(git status --porcelain --untracked-files=no)" ]]; then
  echo "ERROR: 工作区有未提交改动 —— 部署前请先 commit（铁律：部署的一律同步 git）" >&2
  git status --short --untracked-files=no >&2
  exit 1
fi
if ! git merge-base --is-ancestor HEAD refs/remotes/origin/main 2>/dev/null; then
  echo "ERROR: 当前 HEAD 未推送到 origin/main —— 铁律：部署的一律同步 git（先 git push）" >&2
  exit 1
fi
untracked="$(git status --porcelain --untracked-files=all | grep '^??' || true)"
if [[ -n "$untracked" ]]; then
  echo "WARN: 有未跟踪文件（未纳入 git；若它们会进 dist 请先提交）:" >&2
  echo "$untracked" >&2
fi
echo "==> git 预检通过（工作区干净、HEAD 已推送 origin/main）"

# 确认 dist 存在（构建产物，gitignore；缺失则先 build）
if [[ ! -f pwa/dist/index.html ]]; then
  echo "ERROR: pwa/dist 不存在，先跑 node pwa/scripts/build.mjs" >&2
  exit 1
fi

# 凭证防打印：所有 wrangler 输出过一道脱敏（token 绝不外泄）
# 凭证防打印：所有 wrangler 输出过一道脱敏（token 绝不外泄）
# ⚠️ set -u 下未定义变量会报错，这里给空默认值（走登录态时没有 API_TOKEN）
redact() { sed "s/${CLOUDFLARE_API_TOKEN:-__NO_TOKEN__}/***REDACTED***/g"; }

# wrangler 4.x：项目不存在时直接 deploy 会报错，需先 create（已存在则忽略错误继续）
echo "==> 确保 Pages 项目存在"
npx --yes wrangler@latest pages project create "$PROJECT" --production-branch=main 2>&1 | redact || echo "(create 失败，可能项目已存在，继续部署)"

echo "==> 部署 pwa/dist -> Cloudflare Pages 项目 $PROJECT（生产分支 main）"
npx --yes wrangler@latest pages deploy pwa/dist --project-name="$PROJECT" --branch=main 2>&1 | redact
