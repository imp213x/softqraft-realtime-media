# Local live test (dev)

Run SoftQraft with **local env** and test a real Live session in the browser.

## Prerequisites

- Docker Desktop running  
- Camera/microphone permission in the browser  

## WebRTC note (Docker Desktop)

If the UI shows **`could not establish pc connection`**, LiveKit was advertising an
unreachable Docker IP. Local config forces:

```yaml
rtc.node_ip: 127.0.0.1
rtc.udp_port: 7882
```

Recreate LiveKit after config changes:

```powershell
docker compose -f deploy/compose/docker-compose.yml up -d --force-recreate livekit
```

For a **phone on the same Wi‑Fi**, set `node_ip` to your PC’s LAN IP (e.g. `192.168.1.20`)
and open the test UI via that IP, not `localhost`.

## One command

```powershell
cd C:\Dev\live-streaming-platform
.\scripts\start-local-live.ps1
```

This will:

1. `docker compose up -d` (LiveKit, Redis, Egress, MinIO, Gateway)  
2. Serve `examples/local-live-test/index.html` on **http://localhost:5177**  
3. Open the host UI in your browser  

## Local endpoints

| Service | URL |
|---------|-----|
| Live test UI | http://localhost:5177 |
| Gateway API | http://localhost:8080 |
| LiveKit | ws://localhost:7880 |
| MinIO console | http://localhost:9001 (`softqraft` / `softqraftsecret`) |

## Local credentials (dev only)

```text
Gateway API key:     dev-local-key
LiveKit API key:     softqraft_dev_key
LiveKit API secret:  softqraft_dev_secret_change_me_before_prod
```

Env file: `deploy/compose/.env` (from `deploy/env/media.env.example`).

## Local recording storage (Echo)

Compose already uses **MinIO** as local S3 (not AWS):

| Setting | Value |
|---------|--------|
| Endpoint | `http://minio:9000` (in Docker) / `http://localhost:9000` (host) |
| Bucket | `sqrm-recordings` |
| Keys | `softqraft` / `softqraftsecret` |
| Object prefix | `recordings/local-dev/{sessionId}-{time}.mp4` |
| Console | http://localhost:9001 |

Gateway env already points at this. Production Echo on AWS is a later env swap (ADR-006).

List files:

```powershell
.\scripts\list-local-recordings.ps1
```

## How to test Live + Echo

1. **Host:** open UI as `host` → **Go live** → allow camera/mic.  
2. With **Auto-start Echo** checked (default), recording starts ~1.5s after publish.  
   Or click **Start Echo egress (MP4 → MinIO)** manually.  
3. Stay on camera **15–30 seconds** (empty rooms produce no useful file).  
4. Click **Stop Echo (finalize MP4)** (or Leave — it stops Echo first).  
5. Open MinIO → bucket `sqrm-recordings` → `recordings/local-dev/`.  
6. **Viewer (optional):** new tab, `role=realtime_viewer` + `sessionId=…` → **Join existing session**.

## If the UI cannot call the API (CORS)

Rebuild gateway (CORS is enabled in current code):

```powershell
docker compose -f deploy/compose/docker-compose.yml up -d --build gateway
```

Or run Gateway on the host:

```powershell
.\scripts\start-local-live.ps1 -SkipCompose -HostGateway
# then in another terminal run the printed pnpm dev:gateway env block
```

## Smoke without UI

```powershell
.\scripts\smoke-phase1.ps1
```
