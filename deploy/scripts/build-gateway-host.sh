#!/usr/bin/env bash
# Build Gateway on the host (uses host DNS), then package a Docker image
# without calling registry.npmjs.org from inside Docker BuildKit.
set -euo pipefail

ROOT="$(cd "$(dirname "$0")/../.." && pwd)"
OUT_DIR="$ROOT/deploy/docker/gateway/out"
cd "$ROOT"

echo "==> Node / pnpm"
if ! command -v node >/dev/null 2>&1; then
  echo "Node.js not found. Install Node 22, e.g.:"
  echo "  curl -fsSL https://deb.nodesource.com/setup_22.x | sudo -E bash -"
  echo "  sudo apt-get install -y nodejs"
  exit 1
fi
corepack enable
corepack prepare pnpm@9.15.0 --activate

echo "==> pnpm install (host network / DNS)"
pnpm config set fetch-retries 5
pnpm config set fetch-retry-mintimeout 20000
pnpm install --frozen-lockfile

echo "==> build shared + gateway"
pnpm --filter @softqraft/shared build
pnpm --filter @softqraft/gateway-api build

echo "==> deploy production bundle -> $OUT_DIR"
rm -rf "$OUT_DIR"
pnpm --filter @softqraft/gateway-api deploy --prod "$OUT_DIR"
mkdir -p "$OUT_DIR/public"
cp -R "$ROOT/services/gateway-api/public/." "$OUT_DIR/public/"

echo "==> docker image (local files only, no npm in build)"
docker build \
  -f "$ROOT/deploy/docker/gateway/Dockerfile.prebuilt" \
  -t softqraft-realtime-media-gateway:prebuilt \
  "$ROOT/deploy/docker/gateway"

echo "==> done. Start stack with:"
echo "  cd $ROOT/deploy/compose"
echo "  docker compose -f docker-compose.yml -f docker-compose.prebuilt.yml --profile turn up -d"
