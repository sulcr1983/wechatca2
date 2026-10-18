#!/usr/bin/env bash
# PWA 部署到 Cloudflare Pages（supersu-pwa）
# 凭证从 E:/test/opendoor/.env 读取 CLOUDFLARE_ACCOUNT_ID / CLOUDFLARE_API_TOKEN
# 规则：不落盘副本、不打印凭证、不提交本仓库
set -euo pipefail
cd "$(dirname "$0")/../.."   # 仓库根 E:/test/wechatca2

ENV_FILE="${CLOUDFLARE_ENV_FILE:-/e/test/opendoor/.env}"
PROJECT="supersu-pwa"

if [[ ! -f "$ENV_FILE" ]]; then
  echo "ERROR: 找不到凭证文件 $ENV_FILE" >&2
  exit 1
fi

# 只把两个变量导出到本进程环境，不回显
set -a
# shellcheck disable=SC1090
source "$ENV_FILE"
set +a

: "${CLOUDFLARE_ACCOUNT_ID:?ERROR: .env 缺少 CLOUDFLARE_ACCOUNT_ID}"
: "${CLOUDFLARE_API_TOKEN:?ERROR: .env 缺少 CLOUDFLARE_API_TOKEN}"

# 确认 dist 存在（构建产物，gitignore；缺失则先 build）
if [[ ! -f pwa/dist/index.html ]]; then
  echo "ERROR: pwa/dist 不存在，先跑 node pwa/scripts/build.mjs" >&2
  exit 1
fi

# 凭证防打印：所有 wrangler 输出过一道脱敏（token 绝不外泄）
redact() { sed "s/${CLOUDFLARE_API_TOKEN}/***REDACTED***/g"; }

# wrangler 4.x：项目不存在时直接 deploy 会报错，需先 create（已存在则忽略错误继续）
echo "==> 确保 Pages 项目存在"
npx --yes wrangler@latest pages project create "$PROJECT" --production-branch=main 2>&1 | redact || echo "(create 失败，可能项目已存在，继续部署)"

echo "==> 部署 pwa/dist -> Cloudflare Pages 项目 $PROJECT（生产分支 main）"
npx --yes wrangler@latest pages deploy pwa/dist --project-name="$PROJECT" --branch=main 2>&1 | redact
