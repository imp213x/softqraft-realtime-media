#!/usr/bin/env bash
# File egress smoke WITH a demo publisher (required for room-composite Chrome start).
# Host: LiveKit on :7880, Gateway on :8080, egress running.
set -euo pipefail

ROOT="$(cd "$(dirname "$0")/../.." && pwd)"
ENV_FILE="${SMOKE_ENV_FILE:-$ROOT/deploy/compose/.env}"
GW="${SMOKE_GATEWAY_URL:-http://127.0.0.1:8080}"
GW="${GW%/}"
LK_URL="${SMOKE_LIVEKIT_URL:-http://127.0.0.1:7880}"

env_get() {
  local key="$1"
  local line
  line="$(grep -E "^${key}=" "$ENV_FILE" 2>/dev/null | tail -n1 || true)"
  [[ -z "$line" ]] && { echo ""; return; }
  echo "${line#*=}" | sed -e 's/\r$//' -e 's/^[[:space:]]*//' -e 's/^"//' -e 's/"$//'
}

API_KEY="${SMOKE_API_KEY:-$(env_get GATEWAY_SERVICE_API_KEYS)}"
API_KEY="${API_KEY%%,*}"
LK_KEY="${SMOKE_LIVEKIT_API_KEY:-$(env_get LIVEKIT_API_KEY)}"
LK_SEC="${SMOKE_LIVEKIT_API_SECRET:-$(env_get LIVEKIT_API_SECRET)}"
# Prefer keys from livekit.yaml if env empty
if [[ -z "$LK_KEY" || -z "$LK_SEC" ]]; then
  line=$(awk '/^keys:/{f=1;next} f && /^[[:space:]]+[a-zA-Z0-9]/{print; exit}' "$ROOT/deploy/docker/livekit/livekit.yaml")
  LK_KEY=$(echo "$line" | sed -E 's/^[[:space:]]*//;s/:.*//')
  LK_SEC=$(echo "$line" | sed -E 's/^[^:]*:[[:space:]]*//')
fi

PUBLIC_BASE="${SMOKE_PUBLIC_BASE:-$(env_get HLS_PUBLIC_BASE_URL)}"
PUBLIC_BASE="${PUBLIC_BASE%/}"

if [[ -z "$API_KEY" || -z "$LK_KEY" || -z "$LK_SEC" ]]; then
  echo "FAIL: need Gateway API key + LiveKit api key/secret" >&2
  exit 1
fi

auth=(-H "Authorization: Bearer ${API_KEY}" -H "Content-Type: application/json" -H "Accept: application/json")

echo "==> Create session"
SESSION_JSON="$(curl -sS -f -X POST "$GW/v1/sessions" "${auth[@]}" \
  -d '{"externalId":"smoke-file-egress","profile":"creator_live_webrtc","realtime":{"maxParticipants":10}}')"
SESSION_ID="$(echo "$SESSION_JSON" | sed -n 's/.*"sessionId"[[:space:]]*:[[:space:]]*"\([^"]*\)".*/\1/p' | head -1)"
ROOM="$(echo "$SESSION_JSON" | sed -n 's/.*"roomName"[[:space:]]*:[[:space:]]*"\([^"]*\)".*/\1/p' | head -1)"
echo "sessionId=$SESSION_ID room=$ROOM"

echo "==> Start demo publisher (livekit-cli)"
PUB_LOG="/tmp/lk-publish-$$.log"
docker run --rm --network host \
  -e LIVEKIT_URL="$LK_URL" \
  -e LIVEKIT_API_KEY="$LK_KEY" \
  -e LIVEKIT_API_SECRET="$LK_SEC" \
  livekit/livekit-cli:latest \
  room join --identity smoke-publisher --publish-demo "$ROOM" \
  >"$PUB_LOG" 2>&1 &
PUB_PID=$!
cleanup() {
  kill "$PUB_PID" 2>/dev/null || true
  wait "$PUB_PID" 2>/dev/null || true
  curl -sS -X POST "$GW/v1/sessions/${SESSION_ID}/end" "${auth[@]}" -d '{}' >/dev/null 2>&1 || true
}
trap cleanup EXIT

sleep 5
if ! kill -0 "$PUB_PID" 2>/dev/null; then
  echo "FAIL: publisher exited early" >&2
  cat "$PUB_LOG" | head -40 >&2
  exit 1
fi
echo "publisher running pid=$PUB_PID"
sleep 3

echo "==> Start room_composite_file egress"
EGRESS_JSON="$(curl -sS -X POST "$GW/v1/sessions/${SESSION_ID}/egress" "${auth[@]}" \
  -d '{"type":"room_composite_file"}' -w "\n%{http_code}")"
HTTP_BODY="$(echo "$EGRESS_JSON" | sed '$d')"
HTTP_CODE="$(echo "$EGRESS_JSON" | tail -n1)"
echo "HTTP $HTTP_CODE"
echo "$HTTP_BODY" | head -c 700
echo
EGRESS_ID="$(echo "$HTTP_BODY" | sed -n 's/.*"egressId"[[:space:]]*:[[:space:]]*"\([^"]*\)".*/\1/p' | head -1)"
if [[ "$HTTP_CODE" != "202" && "$HTTP_CODE" != "200" ]] || [[ -z "$EGRESS_ID" ]]; then
  echo "FAIL: egress start" >&2
  cat "$PUB_LOG" | tail -20 >&2
  exit 1
fi
echo "egressId=$EGRESS_ID"

echo "==> Poll (max ~240s)"
FINAL="unknown"
FP=""
for i in $(seq 1 48); do
  POLL="$(curl -sS -f "$GW/v1/egress/${EGRESS_ID}" "${auth[@]}")"
  FINAL="$(echo "$POLL" | sed -n 's/.*"status"[[:space:]]*:[[:space:]]*"\([^"]*\)".*/\1/p' | head -1)"
  FP="$(echo "$POLL" | sed -n 's/.*"filepath"[[:space:]]*:[[:space:]]*"\([^"]*\)".*/\1/p' | head -1)"
  ERR="$(echo "$POLL" | sed -n 's/.*"error"[[:space:]]*:[[:space:]]*"\([^"]*\)".*/\1/p' | head -1)"
  echo "  [$i] status=$FINAL filepath=${FP:-—} err=${ERR:-—}"
  case "$FINAL" in
    complete|failed) break ;;
  esac
  # stop after ~25s of active to finalize file without waiting forever
  if [[ "$FINAL" == "active" && "$i" -ge 8 ]]; then
    echo "==> Stop egress (had active for ~40s)"
    curl -sS -X POST "$GW/v1/egress/${EGRESS_ID}/stop" "${auth[@]}" -d '{}' >/dev/null || true
  fi
  sleep 5
done

echo "==> Result"
echo "sessionId=$SESSION_ID"
echo "egressId=$EGRESS_ID"
echo "finalStatus=$FINAL"
echo "filepath=${FP:-}"
if [[ -n "$PUBLIC_BASE" && -n "${FP:-}" ]]; then
  KEY="${FP#/}"
  # strip unresolved {time} for guess
  echo "publicUrlGuess=${PUBLIC_BASE}/${KEY}"
fi

if [[ "$FINAL" == "complete" ]]; then
  echo "PASS: file egress complete"
  exit 0
fi
if [[ "$FINAL" == "active" ]]; then
  echo "PARTIAL: still active — check R2 for partial object"
  exit 2
fi
echo "FAIL: finalStatus=$FINAL"
docker logs softqraft-realtime-media-egress-1 --since 5m 2>&1 | tail -25 || true
exit 1
