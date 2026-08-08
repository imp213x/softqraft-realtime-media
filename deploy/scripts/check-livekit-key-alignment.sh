#!/usr/bin/env bash
set -euo pipefail
ROOT="$(cd "$(dirname "$0")/../.." && pwd)"
ENVF="$ROOT/deploy/compose/.env"
LK="$ROOT/deploy/docker/livekit/livekit.yaml"
EG="$ROOT/deploy/docker/egress/egress.yaml"

GKEY=$(grep -E '^LIVEKIT_API_KEY=' "$ENVF" | tail -1 | cut -d= -f2- | tr -d '\r')
GSEC=$(grep -E '^LIVEKIT_API_SECRET=' "$ENVF" | tail -1 | cut -d= -f2- | tr -d '\r')
line=$(awk '/^keys:/{f=1;next} f && /^[[:space:]]+[a-zA-Z0-9]/{print; exit}' "$LK")
LKEY=$(echo "$line" | sed -E 's/^[[:space:]]*//;s/:.*//')
LSEC=$(echo "$line" | sed -E 's/^[^:]*:[[:space:]]*//')
EKEY=$(grep 'api_key:' "$EG" | awk '{print $2}')

echo "gateway_key_len=${#GKEY} livekit_key_len=${#LKEY} egress_key_len=${#EKEY}"
echo "gateway_vs_livekit_key=$([ "$GKEY" = "$LKEY" ] && echo MATCH || echo MISMATCH)"
echo "gateway_vs_livekit_secret=$([ "$GSEC" = "$LSEC" ] && echo MATCH || echo MISMATCH)"
echo "egress_vs_livekit_key=$([ "$EKEY" = "$LKEY" ] && echo MATCH || echo MISMATCH)"
