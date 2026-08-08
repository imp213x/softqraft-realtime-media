#!/usr/bin/env bash
# Run LiveKit Egress on host network so room-composite Chrome can ICE to node_ip.
# Linux VMs only (Hetzner). See docs/operations/file-egress-smoke.md
set -euo pipefail

ROOT="$(cd "$(dirname "$0")/../.." && pwd)"
COMPOSE="$ROOT/deploy/compose"
ENVF="$COMPOSE/.env"
EG_YAML="$ROOT/deploy/docker/egress/egress.yaml"
LK="$ROOT/deploy/docker/livekit/livekit.yaml"
OVERRIDE="$COMPOSE/docker-compose.egress-host.yml"

# Align keys with livekit.yaml
line=$(awk '/^keys:/{f=1;next} f && /^[[:space:]]+[a-zA-Z0-9]/{print; exit}' "$LK")
API_KEY=$(echo "$line" | sed -E 's/^[[:space:]]*//;s/:.*//')
API_SECRET=$(echo "$line" | sed -E 's/^[^:]*:[[:space:]]*//')
if [[ -z "$API_KEY" || -z "$API_SECRET" ]]; then
  echo "FAIL: parse livekit keys" >&2
  exit 1
fi

cp -a "$EG_YAML" "${EG_YAML}.bak.$(date +%Y%m%d%H%M%S)" 2>/dev/null || true
cat > "$EG_YAML" <<EOF
# SoftQraft — Egress (host network). Keys synced $(date -u +%Y-%m-%dT%H:%MZ)
log_level: info
api_key: ${API_KEY}
api_secret: ${API_SECRET}
# Host network: LiveKit published on localhost
ws_url: ws://127.0.0.1:7880
insecure: true

redis:
  address: 127.0.0.1:6379
EOF

cat > "$OVERRIDE" <<'EOF'
# Override: egress on host network (WebRTC/ICE to node_ip works)
services:
  egress:
    network_mode: host
    extra_hosts: []
    # host network cannot use service DNS; config uses 127.0.0.1
EOF

# Trim accidental spaces after = in S3_ENDPOINT
if [[ -f "$ENVF" ]]; then
  sed -i -E 's/^(S3_ENDPOINT)=[[:space:]]+/\1=/' "$ENVF" || true
  echo "S3_ENDPOINT=$(grep -E '^S3_ENDPOINT=' "$ENVF" | tail -1 | cut -d= -f2- | cut -c1-50)..."
fi

cd "$COMPOSE"
# Stop old bridge-network egress then start host-network one
docker compose -f docker-compose.yml -f docker-compose.prebuilt.yml stop egress 2>/dev/null || true
docker compose -f docker-compose.yml -f docker-compose.prebuilt.yml rm -f egress 2>/dev/null || true

docker compose \
  -f docker-compose.yml \
  -f docker-compose.prebuilt.yml \
  -f docker-compose.egress-host.yml \
  up -d --force-recreate --no-deps egress

sleep 3
docker ps --format 'table {{.Names}}\t{{.Status}}\t{{.Ports}}' | head -15 || true
docker logs --tail 8 softqraft-realtime-media-egress-1 2>&1 || true
echo "OK: egress host-network mode. Re-run: bash $ROOT/deploy/scripts/smoke-file-egress.sh"
