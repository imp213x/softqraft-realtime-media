# Phase 2 — Dual-run & Clatters cutover

SoftQraft Realtime Media is up (Phase 1). This phase connects a **consumer app** (Clatters first) without rewriting clients.

## Architecture for dual-run

```text
Clatters clients  ──LiveKit SDK──► SoftQraft LiveKit (self-host)
Clatters server   ──mint tokens──► (unchanged code; new LIVEKIT_* env)
SoftQraft Egress  ──MP4──────────► AWS S3 (Echo, ADR-006)
LiveKit webhook   ──► Gateway /v1/webhooks/livekit
                         └──forward──► Clatters /api/livekit/egress-webhook
```

## SoftQraft side

1. Stack running (`docker compose up -d`).  
2. Production: TLS for `wss://realtime…` and `https://gateway…`.  
3. Env for Echo on AWS:

```bash
S3_BUCKET_NAME=thescholar-uploads
AWS_REGION=eu-west-2
AWS_ACCESS_KEY_ID=...
AWS_SECRET_ACCESS_KEY=...
# no S3_ENDPOINT for real AWS
RECORDING_KEY_TEMPLATE=live-echo/{externalId}/{sessionId}-{time}.mp4
WEBHOOK_FORWARD_URLS=https://<clatters-host>/api/livekit/egress-webhook
```

4. LiveKit `webhook.urls` already points at Gateway in Compose (`livekit.yaml`).

## Clatters side (minimal)

Set on Clatters process only (see `examples/clatters-integration/env.dual-run.example`):

| Variable | Self-host value |
|----------|-----------------|
| `LIVEKIT_URL` | `wss://…` SoftQraft LiveKit |
| `LIVEKIT_API_KEY` / `SECRET` | Same as SoftQraft |
| `LIVEKIT_EGRESS_AUTO` | `true` |
| AWS S3 | Unchanged (Echo) |

**No mobile SDK change** if URL/token flow stays server-driven.

## Cutover checklist

- [ ] Staging Clatters → SoftQraft  
- [ ] Host go-live + viewer join (WebRTC)  
- [ ] Stage guest publish  
- [ ] Echo: egress start after host publish; webhook finalize; playable MP4 on S3  
- [ ] Background/reconnect soak  
- [ ] Feature-flag % production traffic  
- [ ] Keep Cloud credentials for rollback window  

## Rollback

1. Restore Clatters `LIVEKIT_URL` / keys to LiveKit Cloud.  
2. Cloud Egress + Cloud webhooks as before.  
3. In-flight SoftQraft rooms may need manual end.

## Optional: Gateway as orchestration

Later, Clatters can call SoftQraft Gateway for sessions/tokens/egress instead of `livekit-server-sdk` directly. Role map: `examples/clatters-integration/role-mapping.md`.

## Local verify (no Clatters)

```powershell
cd C:\Dev\live-streaming-platform
docker compose -f deploy/compose/docker-compose.yml up -d --build gateway
docker compose -f deploy/compose/docker-compose.yml up -d livekit
.\scripts\smoke-phase1.ps1
```

Webhook path (from inside Compose network):

```text
POST http://gateway:8080/v1/webhooks/livekit
```
