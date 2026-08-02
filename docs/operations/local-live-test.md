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

## How to test Live

1. **Host:** page opens as `host` → click **Go live** → allow camera/mic.  
2. Copy the **session id** from the badge.  
3. **Viewer:** new tab → same UI → role `realtime_viewer` → paste session id → **Join existing session**.  
4. Optional: on host, **Start Echo egress** → after a short publish, check MinIO bucket `sqrm-recordings`.  
5. **Leave / end** on host ends the LiveKit room.

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
