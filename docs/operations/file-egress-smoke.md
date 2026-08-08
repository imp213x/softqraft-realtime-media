# File egress smoke (economic plane)

**Purpose:** Prove SoftQraft can start `room_composite_file`, write to **R2**, and expose a terminal egress status — without consumer app UI.  
**Plane:** Hetzner economic production (`media.softqraftlabs.com`).  
**Prerequisite:** [echo-vod-r2-readiness.md](echo-vod-r2-readiness.md) A1–A3.

## When to run

- After changing R2 credentials, bucket, or Egress image  
- After Gateway redeploy that touches egress/S3 config  
- Before telling a consumer “Echo/VOD is available”

## One-shot script (on the media host)

Run as root on the SoftQraft host (stack already up):

```bash
cd /root/softqraft-realtime-media
bash deploy/scripts/smoke-file-egress.sh
```

The script:

1. Loads `deploy/compose/.env` (API key + public base URLs)  
2. `POST /v1/sessions` with `externalId=smoke-file-egress`  
3. `POST …/egress` `{ "type": "room_composite_file" }`  
4. Polls `GET /v1/egress/{id}` up to ~3 minutes  
5. Prints status, filepath, and guessed public URL  
6. Ends the session  

Optional env overrides:

```bash
SMOKE_GATEWAY_URL=http://127.0.0.1:8080 \
SMOKE_API_KEY=sqk_… \
SMOKE_PUBLIC_BASE=https://pub-….r2.dev \
bash deploy/scripts/smoke-file-egress.sh
```

## Manual curl (same contract)

```bash
GW=http://127.0.0.1:8080   # or https://media.softqraftlabs.com
KEY=<tenant or GATEWAY_SERVICE_API_KEYS entry>

# 1) Session
curl -sS -X POST "$GW/v1/sessions" \
  -H "Authorization: Bearer $KEY" -H "Content-Type: application/json" \
  -d '{"externalId":"smoke-file-egress","profile":"creator_live_webrtc"}'

# 2) Start file egress (use sessionId from step 1)
curl -sS -X POST "$GW/v1/sessions/<sessionId>/egress" \
  -H "Authorization: Bearer $KEY" -H "Content-Type: application/json" \
  -d '{"type":"room_composite_file"}'

# 3) Poll
curl -sS "$GW/v1/egress/<egressId>" -H "Authorization: Bearer $KEY"

# 4) End
curl -sS -X POST "$GW/v1/sessions/<sessionId>/end" \
  -H "Authorization: Bearer $KEY" -H "Content-Type: application/json" -d '{}'
```

## Pass criteria

| Check | Pass |
|-------|------|
| Start returns **202** with `egressId` | Yes |
| Poll reaches **`complete`** (or `active` then complete after stop) | Yes |
| No `dependency_unavailable` / S3 auth errors | Yes |
| Object visible in R2 under `recordings/…` (or template path) | Yes (console or public GET) |
| Optional: public GET on `{HLS_PUBLIC_BASE_URL or public base}/{key}` | 200 if bucket is public |

**Note:** Without a LiveKit publisher, the MP4 may be short/black — smoke is for **pipeline**, not content quality. For content QA, publish with local-live-test UI or a consumer host, then start egress.

## Failures (common)

| Symptom | Likely cause |
|---------|----------------|
| `S3 recording storage is not configured` | Missing bucket/keys on Gateway |
| `Egress start failed` + S3 signature | Wrong R2 endpoint / forcePathStyle / keys |
| Stuck `starting` | Egress worker down or cannot reach LiveKit `ws_url` |
| `complete` but no public GET | Bucket not public; need signed URL or custom domain policy |
| Quota 429 | Tenant `maxEgress` exhausted |

## After smoke

1. Log result (date, egressId, status) in ops notes or evidence below.  
2. If public GET works, integrators may implement B1–B5 in [echo-vod-r2-readiness.md](echo-vod-r2-readiness.md).  
3. Do **not** leave long-running HLS jobs on the economic box (ADR-010).

## Preferred smoke (with publisher)

Empty rooms often hang on **`Start signal not received`**. Use:

```bash
bash deploy/scripts/smoke-file-egress-with-publisher.sh
```

This joins with `livekit-cli --publish-demo`, starts file egress, stops after ~active, expects **`complete`**.

Also ensure egress can ICE to LiveKit media (on Hetzner Linux):

```bash
bash deploy/scripts/fix-egress-host-network.sh
```

## Evidence log

| Date (UTC) | Host | Result | Notes |
|------------|------|--------|-------|
| 2026-08-08 | Hetzner `2.28.61.173` | **PARTIAL** | Empty-room smoke stuck `starting` → Start signal not received. Egress keys aligned; R2 endpoint + `hls.softqraftlabs.com` configured later. |
| 2026-08-08 | Hetzner `2.28.61.173` | **PASS** | `smoke-file-egress-with-publisher.sh`: egress **active** then **complete** (`EG_WvBenLpD5wDU`). Chrome `START_RECORDING` after demo publisher. Path template `recordings/smoke-file-egress/sess_…-{time}.mp4` → R2 `sqrm-hls`. Host-network egress + real `S3_ENDPOINT` + `HLS_PUBLIC_BASE_URL=https://hls.softqraftlabs.com`. |
