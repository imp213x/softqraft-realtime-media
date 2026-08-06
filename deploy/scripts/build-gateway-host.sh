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

# Prefer system pnpm; else enable corepack (may need sudo for /usr/bin links)
if command -v pnpm >/dev/null 2>&1; then
  PNPM=(pnpm)
elif corepack enable 2>/dev/null && corepack prepare pnpm@9.15.0 --activate 2>/dev/null; then
  PNPM=(pnpm)
elif sudo corepack enable && sudo corepack prepare pnpm@9.15.0 --activate; then
  PNPM=(pnpm)
else
  echo "Falling back to: npx pnpm@9.15.0"
  PNPM=(npx --yes pnpm@9.15.0)
fi

echo "==> using: ${PNPM[*]} ($(${PNPM[@]} -v))"

echo "==> pnpm install (host network / DNS)"
"${PNPM[@]}" config set fetch-retries 5 || true
"${PNPM[@]}" config set fetch-retry-mintimeout 20000 || true
"${PNPM[@]}" install --frozen-lockfile

echo "==> build shared + gateway"
"${PNPM[@]}" --filter @softqraft/shared build
"${PNPM[@]}" --filter @softqraft/gateway-api build

echo "==> deploy production bundle -> $OUT_DIR"
rm -rf "$OUT_DIR"
"${PNPM[@]}" --filter @softqraft/gateway-api deploy --prod "$OUT_DIR"
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
