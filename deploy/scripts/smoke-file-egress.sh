#!/usr/bin/env bash
# SoftQraft — single room_composite_file smoke (economic plane / local).
# Docs: docs/operations/file-egress-smoke.md
set -euo pipefail

ROOT="$(cd "$(dirname "$0")/../.." && pwd)"
ENV_FILE="${SMOKE_ENV_FILE:-$ROOT/deploy/compose/.env}"
GW="${SMOKE_GATEWAY_URL:-http://127.0.0.1:8080}"
GW="${GW%/}"

# Parse KEY=value lines without sourcing (avoids <accountid> shell redirects in comments).
env_get() {
  local key="$1"
  local line
  line="$(grep -E "^${key}=" "$ENV_FILE" 2>/dev/null | tail -n1 || true)"
  if [[ -z "$line" ]]; then
    echo ""
    return
  fi
  echo "${line#*=}" | sed -e 's/\r$//' -e 's/^"//' -e 's/"$//' -e "s/^'//" -e "s/'$//"
}

if [[ -z "${SMOKE_API_KEY:-}" ]]; then
  SMOKE_API_KEY="$(env_get GATEWAY_SERVICE_API_KEYS)"
  # first key if comma-separated
  SMOKE_API_KEY="${SMOKE_API_KEY%%,*}"
fi

PUBLIC_BASE="${SMOKE_PUBLIC_BASE:-$(env_get HLS_PUBLIC_BASE_URL)}"
PUBLIC_BASE="${PUBLIC_BASE:-$(env_get CDN_PUBLIC_BASE_URL)}"
PUBLIC_BASE="${PUBLIC_BASE%/}"

if [[ -z "${SMOKE_API_KEY}" ]]; then
  echo "FAIL: set SMOKE_API_KEY or GATEWAY_SERVICE_API_KEYS in $ENV_FILE" >&2
  exit 1
fi

auth=(-H "Authorization: Bearer ${SMOKE_API_KEY}" -H "Content-Type: application/json" -H "Accept: application/json")

echo "==> Gateway $GW"
curl -sS -f "$GW/ready" | head -c 400
echo

echo "==> Create session"
SESSION_JSON="$(curl -sS -f -X POST "$GW/v1/sessions" "${auth[@]}" \
  -d '{"externalId":"smoke-file-egress","profile":"creator_live_webrtc","realtime":{"maxParticipants":5}}')"
echo "$SESSION_JSON" | head -c 600
echo
SESSION_ID="$(echo "$SESSION_JSON" | sed -n 's/.*"sessionId"[[:space:]]*:[[:space:]]*"\([^"]*\)".*/\1/p' | head -1)"
if [[ -z "$SESSION_ID" ]]; then
  echo "FAIL: no sessionId" >&2
  exit 1
fi
echo "sessionId=$SESSION_ID"

echo "==> Start room_composite_file egress"
EGRESS_JSON="$(curl -sS -X POST "$GW/v1/sessions/${SESSION_ID}/egress" "${auth[@]}" \
  -d '{"type":"room_composite_file"}' -w "\n%{http_code}")"
HTTP_BODY="$(echo "$EGRESS_JSON" | sed '$d')"
HTTP_CODE="$(echo "$EGRESS_JSON" | tail -n1)"
echo "HTTP $HTTP_CODE"
echo "$HTTP_BODY" | head -c 800
echo
if [[ "$HTTP_CODE" != "202" && "$HTTP_CODE" != "200" ]]; then
  echo "FAIL: egress start expected 202, got $HTTP_CODE" >&2
  curl -sS -X POST "$GW/v1/sessions/${SESSION_ID}/end" "${auth[@]}" -d '{}' >/dev/null || true
  exit 1
fi

EGRESS_ID="$(echo "$HTTP_BODY" | sed -n 's/.*"egressId"[[:space:]]*:[[:space:]]*"\([^"]*\)".*/\1/p' | head -1)"
FILEPATH="$(echo "$HTTP_BODY" | sed -n 's/.*"filepath"[[:space:]]*:[[:space:]]*"\([^"]*\)".*/\1/p' | head -1)"
STATUS="$(echo "$HTTP_BODY" | sed -n 's/.*"status"[[:space:]]*:[[:space:]]*"\([^"]*\)".*/\1/p' | head -1)"
echo "egressId=$EGRESS_ID status=$STATUS filepath=${FILEPATH:-"(see poll)"}"

if [[ -z "$EGRESS_ID" ]]; then
  echo "FAIL: no egressId" >&2
  exit 1
fi

echo "==> Poll egress (max ~180s)"
FINAL="unknown"
for i in $(seq 1 36); do
  POLL="$(curl -sS -f "$GW/v1/egress/${EGRESS_ID}" "${auth[@]}")"
  FINAL="$(echo "$POLL" | sed -n 's/.*"status"[[:space:]]*:[[:space:]]*"\([^"]*\)".*/\1/p' | head -1)"
  FP="$(echo "$POLL" | sed -n 's/.*"filepath"[[:space:]]*:[[:space:]]*"\([^"]*\)".*/\1/p' | head -1)"
  ERR="$(echo "$POLL" | sed -n 's/.*"error"[[:space:]]*:[[:space:]]*"\([^"]*\)".*/\1/p' | head -1)"
  echo "  [$i] status=$FINAL filepath=${FP:-—} err=${ERR:-—}"
  case "$FINAL" in
    complete|failed)
      break
      ;;
  esac
  sleep 5
done

echo "==> End session"
curl -sS -X POST "$GW/v1/sessions/${SESSION_ID}/end" "${auth[@]}" -d '{}' | head -c 300
echo

echo "==> Result"
echo "sessionId=$SESSION_ID"
echo "egressId=$EGRESS_ID"
echo "finalStatus=$FINAL"
echo "filepath=${FP:-$FILEPATH}"
if [[ -n "${PUBLIC_BASE}" && -n "${FP:-$FILEPATH}" ]]; then
  # {time} may remain or be expanded by LiveKit; print best-effort URL
  KEY="${FP:-$FILEPATH}"
  KEY="${KEY#/}"
  echo "publicUrlGuess=${PUBLIC_BASE}/${KEY}"
fi

if [[ "$FINAL" == "complete" ]]; then
  echo "PASS: file egress reached complete"
  exit 0
fi
if [[ "$FINAL" == "active" || "$FINAL" == "starting" ]]; then
  echo "PARTIAL: egress still $FINAL — pipeline accepted job; check R2 / egress logs; may need publisher or more time"
  exit 2
fi
if [[ "$FINAL" == "failed" ]]; then
  echo "FAIL: egress failed — check egress container logs and R2 credentials"
  exit 1
fi
echo "FAIL: unexpected final status=$FINAL"
exit 1
