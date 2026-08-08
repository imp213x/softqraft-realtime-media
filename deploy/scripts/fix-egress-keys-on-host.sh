#!/usr/bin/env bash
# Align egress.yaml API keys with livekit.yaml (required for room composite).
# Run on the SoftQraft host. Does not print secrets.
set -euo pipefail

ROOT="$(cd "$(dirname "$0")/../.." && pwd)"
LK="$ROOT/deploy/docker/livekit/livekit.yaml"
EG="$ROOT/deploy/docker/egress/egress.yaml"
ENVF="$ROOT/deploy/compose/.env"

if [[ ! -f "$LK" ]]; then
  echo "missing $LK" >&2
  exit 1
fi

# livekit.yaml:
# keys:
#   <api_key>: <api_secret>
line="$(awk '/^keys:/{f=1;next} f && /^[[:space:]]+[a-zA-Z0-9]/{print; exit}' "$LK")"
API_KEY="$(echo "$line" | sed -E 's/^[[:space:]]*//;s/:.*//')"
API_SECRET="$(echo "$line" | sed -E 's/^[^:]*:[[:space:]]*//')"

if [[ -z "$API_KEY" || -z "$API_SECRET" || ${#API_KEY} -lt 8 ]]; then
  echo "FAIL: could not parse LiveKit keys from $LK" >&2
  exit 1
fi

cp -a "$EG" "${EG}.bak.$(date +%Y%m%d%H%M%S)" 2>/dev/null || true
cat > "$EG" <<EOF
# SoftQraft Realtime Media — LiveKit Egress worker
# Keys aligned with livekit.yaml ($(date -u +%Y-%m-%dT%H:%MZ))
log_level: info
api_key: ${API_KEY}
api_secret: ${API_SECRET}
ws_url: ws://livekit:7880

redis:
  address: redis:6379
EOF

echo "OK: egress.yaml api_key length=${#API_KEY} secret length=${#API_SECRET}"

if [[ -f "$ENVF" ]]; then
  EP="$(grep -E '^S3_ENDPOINT=' "$ENVF" | tail -n1 | cut -d= -f2- | tr -d '\r' || true)"
  if echo "$EP" | grep -Eqi '<accountid>|your_|example\.com|CHANGE_ME'; then
    echo "WARN: S3_ENDPOINT looks like a placeholder: ${EP:0:48}..."
    echo "      Set real R2 URL: https://<accountid>.r2.cloudflarestorage.com"
  else
    echo "OK: S3_ENDPOINT set (len=${#EP})"
  fi
  AK="$(grep -E '^AWS_ACCESS_KEY_ID=' "$ENVF" | tail -n1 | cut -d= -f2- | tr -d '\r' || true)"
  if [[ -z "$AK" || "$AK" == *'<'* || "$AK" == *r2_access* ]]; then
    echo "WARN: AWS_ACCESS_KEY_ID missing or placeholder"
  else
    echo "OK: AWS_ACCESS_KEY_ID set (len=${#AK})"
  fi
fi

cd "$ROOT/deploy/compose"
if [[ -f docker-compose.prebuilt.yml ]]; then
  docker compose -f docker-compose.yml -f docker-compose.prebuilt.yml up -d --force-recreate --no-deps egress
else
  docker compose up -d --force-recreate --no-deps egress
fi
sleep 2
docker logs --tail 5 softqraft-realtime-media-egress-1 2>&1 || true
echo "egress recreated"
