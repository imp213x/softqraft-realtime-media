# Phase 1 runbook — SoftQraft Realtime Media

**Phase 1 status: ✅ Complete** (local verification 2026-08-02: publish + Echo MP4 to MinIO).

Bring up self-hosted **LiveKit + Redis + Egress + MinIO (local)** and the **Gateway API**.

## Prerequisites

- Docker Desktop running  
- Node 20+ and pnpm 9+  
- (Optional) AWS credentials when pointing Echo at real S3  

## 1. Start media plane

```powershell
cd C:\Dev\live-streaming-platform\deploy\compose
# .env is gitignored; create from example if missing:
Copy-Item ..\env\media.env.example .env -ErrorAction SilentlyContinue
docker compose up -d
docker compose ps
```

Services:

| Service | Port | Role |
|---------|------|------|
| livekit | 7880 | SFU + Room/Egress API |
| redis | 6379 | LiveKit + Egress coordination |
| minio | 9000 / 9001 | Local S3 (console :9001) |
| egress | — | Room composite workers |
| gateway | 8080 | SoftQraft HTTP API |

Dev keys (local only):

```text
LIVEKIT_API_KEY=softqraft_dev_key
LIVEKIT_API_SECRET=softqraft_dev_secret_change_me_before_prod
```

**Rotate before any shared host.**

## 2. Gateway on host (alternative to Compose gateway)

```powershell
cd C:\Dev\live-streaming-platform
# Point SDK at host-mapped LiveKit; S3 at host-mapped MinIO
$env:LIVEKIT_URL = "http://localhost:7880"
$env:LIVEKIT_REALTIME_URL = "ws://localhost:7880"
$env:LIVEKIT_API_KEY = "softqraft_dev_key"
$env:LIVEKIT_API_SECRET = "softqraft_dev_secret_change_me_before_prod"
$env:S3_BUCKET_NAME = "sqrm-recordings"
$env:AWS_ACCESS_KEY_ID = "softqraft"
$env:AWS_SECRET_ACCESS_KEY = "softqraftsecret"
$env:S3_ENDPOINT = "http://localhost:9000"
$env:S3_FORCE_PATH_STYLE = "true"
$env:GATEWAY_SERVICE_API_KEYS = "dev-local-key"
pnpm --filter @softqraft/shared build
pnpm dev:gateway
```

## 3. Smoke test

```powershell
cd C:\Dev\live-streaming-platform
.\scripts\smoke-phase1.ps1
```

Expect:

1. `/health` ok  
2. `/ready` livekit true  
3. Session created with `roomName`  
4. Host + viewer JWTs minted  
5. Egress accepted (may need a publisher for non-empty MP4)  
6. Session end  

## 4. Manual publish test (optional)

1. Open [LiveKit Meet](https://meet.livekit.io) or use `livekit-cli`.  
2. Server URL: `ws://localhost:7880`  
3. Token: from `POST /v1/sessions/{id}/tokens` (host).  
4. Start egress after you are publishing.  
5. Check MinIO console `http://localhost:9001` bucket `sqrm-recordings`.

## 5. Production Echo on AWS S3 (Clatters)

Do **not** use MinIO in production for Echo.

In Gateway / Egress environment:

```bash
S3_BUCKET_NAME=thescholar-uploads   # or your bucket
AWS_REGION=eu-west-2
AWS_ACCESS_KEY_ID=...
AWS_SECRET_ACCESS_KEY=...
# unset S3_ENDPOINT for real AWS
S3_FORCE_PATH_STYLE=false
RECORDING_KEY_TEMPLATE=live-echo/{externalId}/{sessionId}-{time}.mp4
```

Self-hosted Egress workers need network egress to S3 and the same key template Clatters expects.

Point consumer app:

```bash
LIVEKIT_URL=wss://realtime.your-domain
LIVEKIT_API_KEY=...
LIVEKIT_API_SECRET=...
```

Webhook: configure LiveKit to call the app’s existing egress webhook URL.

## 6. Troubleshooting

| Symptom | Check |
|---------|--------|
| `/ready` not_ready | `docker compose logs livekit` |
| createRoom 503 | LiveKit not up or wrong `LIVEKIT_URL` |
| egress fails | `docker compose logs egress`; room has publisher; S3 creds |
| empty MP4 | Start egress **after** host publishes |
| browser can’t connect | UDP ports / `use_external_ip` / firewall |

## 7. Phase 1 done criteria

- [x] Compose stack defined (LiveKit, Redis, Egress, MinIO, Gateway)  
- [x] Gateway mints LiveKit tokens  
- [x] Gateway starts/stops `room_composite_file` egress  
- [x] S3-compatible output (MinIO local; AWS for Echo cutover)  
- [x] Operator smoke + host/viewer live  
- [x] Echo MP4 in MinIO (`recordings/local-dev/…`, ~42 MiB sample)  

**Next:** [phase-2-checklist.md](phase-2-checklist.md)
