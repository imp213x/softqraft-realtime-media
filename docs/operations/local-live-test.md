# Local live test (dev)

Run SoftQraft with **local env** and test Live (WebRTC), Echo (MP4), and market-grade **HLS** in the browser.

## Prerequisites

- Docker Desktop running  
- Camera/microphone permission in the browser  
- Optional: Python (for static UI server) or Node (`npx serve`)

## One command (recommended)

```powershell
cd C:\Dev\live-streaming-platform

# Sync LAN IP for LiveKit ICE + start stack + open UI
.\scripts\start-local-live.ps1 -SyncNodeIp -RebuildGateway

# Optional: also start coturn (Docker Desktop bridge profile)
.\scripts\start-local-live.ps1 -SyncNodeIp -WithTurn -RebuildGateway
```

This will:

1. Optionally run `scripts/sync-livekit-node-ip.ps1`  
2. Ensure `deploy/compose/.env` exists (from `media.env.example`)  
3. `docker compose up -d` (+ optional `--profile turn-bridge`)  
4. Serve `examples/local-live-test/` on **http://localhost:5177**  
5. Open the host UI in your browser  

## Local endpoints

| Service | URL |
|---------|-----|
| Live test UI | http://localhost:5177 |
| Gateway API | http://localhost:8080 |
| LiveKit | ws://localhost:7880 |
| MinIO console | http://localhost:9001 (`softqraft` / `softqraftsecret`) |
| MinIO S3 API | http://localhost:9000 |

## Local credentials (dev only)

```text
Gateway API key:     dev-local-key
LiveKit API key:     softqraft_dev_key
LiveKit API secret:  softqraft_dev_secret_change_me_before_prod
MinIO:               softqraft / softqraftsecret
TURN (if profile):   softqraft / softqraftturn
```

Env file: `deploy/compose/.env` (from `deploy/env/media.env.example`).

## WebRTC note (Docker Desktop)

If the UI shows **`could not establish pc connection`**, LiveKit was advertising an
unreachable IP. Prefer **LAN `node_ip`** (required for Egress Chrome as well):

```powershell
.\scripts\sync-livekit-node-ip.ps1
docker compose -f deploy/compose/docker-compose.yml up -d --force-recreate livekit
```

Do **not** use `127.0.0.1` as `node_ip` when testing Echo/HLS egress — Egress runs in a container and cannot reach the host loopback as the SFU.

## How to test Live + Echo (MP4)

1. **Host:** open UI as `host` → **Go live** → allow camera/mic.  
2. With **Auto-start Echo** checked (default), recording starts ~4s after publish.  
3. Stay on camera **15–30 seconds**.  
4. Click **Stop Echo (finalize MP4)** — UI polls until **`complete`**.  
5. MinIO → bucket `sqrm-recordings` → `recordings/local-dev/`.  
6. **WebRTC viewer:** new tab → `role=realtime_viewer` → paste `sessionId` → **Join**.

## How to test HLS audience (Phase 3b)

1. Host **Go live** (or enable **Auto-start HLS**).  
2. Click **Start HLS egress** if not auto.  
3. Wait a few seconds; copy **HLS playlist URL** (or use badge log).  
4. New tab → `role=hls_viewer` → paste **same session id** → **Join**  
   (or click **Play HLS URL** on the host tab).  
5. Browser uses **hls.js** against MinIO public objects under `hls/local-dev/{sessionId}/live.m3u8`.

Expected URL shape:

```text
http://localhost:9000/sqrm-recordings/hls/local-dev/{sessionId}/live.m3u8
```

Gateway must have:

```bash
HLS_PUBLIC_BASE_URL=http://localhost:9000/sqrm-recordings
HLS_KEY_TEMPLATE=hls/{externalId}/{sessionId}
```

(Compose gateway already injects these.)

### HLS spins forever / empty video but MinIO has files

**Cause:** MinIO bucket is **private**. Egress (with credentials) can write; the browser cannot `GET` `live.m3u8` / `.ts` → hls.js hangs or loops.

**Fix (lab only):**

```powershell
.\scripts\ensure-minio-hls-public.ps1
```

Then open the playlist in a normal browser tab — you should see text starting with `#EXTM3U`.  
Retry **hls_viewer → Join** or **Play HLS URL**.

`start-local-live.ps1` now runs this helper automatically. `minio-init` also sets download policy on first boot; an existing volume created *before* that change stays private until you run the script once.

## How to test TURN (Phase 3a)

```powershell
.\scripts\start-local-live.ps1 -WithTurn -SyncNodeIp -RebuildGateway
```

Confirm token response includes `iceServers` (log line: *using N iceServer group(s)*).  
API check:

```powershell
.\scripts\smoke-phase3.ps1
```

See also [turn-hls-cdn.md](turn-hls-cdn.md).

## How to test multi-tenant (Phase 3c)

In `deploy/compose/.env`:

```bash
GATEWAY_TENANTS=clatters:dev-local-key:50:10,demo:demo-key:20:5
```

Rebuild/restart gateway, then:

```powershell
.\scripts\smoke-phase3.ps1 -OtherApiKey demo-key
# or
.\scripts\smoke-gateway.ps1 -OtherApiKey demo-key
```

## API smokes (no camera)

```powershell
# Phase 1: session + tokens + file egress type
.\scripts\smoke-phase1.ps1

# Phase 3: iceServers + room_composite_hls + optional isolation
.\scripts\smoke-phase3.ps1

# Lightweight gateway only
.\scripts\smoke-gateway.ps1
```

## List recordings

```powershell
.\scripts\list-local-recordings.ps1
```

## If the UI cannot call the API (CORS / old gateway)

```powershell
docker compose -f deploy/compose/docker-compose.yml up -d --build gateway
# or
.\scripts\start-local-live.ps1 -SkipCompose -HostGateway
```

Host gateway env block is printed by the script.

## Local recording / HLS storage

| Setting | Value |
|---------|--------|
| Endpoint | `http://localhost:9000` (host) / `http://minio:9000` (Docker) |
| Bucket | `sqrm-recordings` |
| Echo path | `recordings/local-dev/{sessionId}-{time}.mp4` |
| HLS path | `hls/local-dev/{sessionId}/live.m3u8` + segments |
| Console | http://localhost:9001 |

**Lab only:** `minio-init` sets anonymous download on the bucket so browsers can play HLS without signed URLs. Do not use that posture for production.

## Related docs

| Doc | Purpose |
|-----|---------|
| [turn-hls-cdn.md](turn-hls-cdn.md) | TURN / HLS / CDN / tenants ops |
| [market-grade-product.md](../architecture/market-grade-product.md) | Product stack |
| [phase-1-runbook.md](phase-1-runbook.md) | Phase 1 bring-up |
| [local-clatters-dual-run.md](local-clatters-dual-run.md) | Clatters + SoftQraft dual-run |
| [phase-2-checklist.md](phase-2-checklist.md) | Dual-run close-out |
