# Phase 2 — Dual-run & Clatters cutover

**Phase status:** 🔄 In progress (platform ready for staging; Clatters dual-run pending)  
**Checklist:** [phase-2-checklist.md](phase-2-checklist.md)

SoftQraft Realtime Media Phase 1 is verified locally (live + Echo to MinIO).  
Phase 2 connects a **consumer app** (Clatters first) without rewriting clients.

## Architecture for dual-run

```text
Clatters clients  ──LiveKit SDK──► SoftQraft LiveKit (self-host)
Clatters server   ──mint tokens──► (unchanged code; new LIVEKIT_* env)
SoftQraft Egress  ──MP4──────────► AWS S3 (Echo, ADR-006)
LiveKit webhook   ──► Gateway /v1/webhooks/livekit
                         └──forward──► Clatters /api/livekit/egress-webhook
```

## SoftQraft side

1. Stack running (Compose or VMs) with public `wss` + media ports.  
2. Use **AWS Echo env** (not MinIO) for staging dual-run:  
   [../../deploy/env/aws-echo.env.example](../../deploy/env/aws-echo.env.example)  
3. `RECORDING_KEY_TEMPLATE=live-echo/{externalId}/{sessionId}-{time}.mp4`  
4. `WEBHOOK_FORWARD_URLS=https://<clatters-host>/api/livekit/egress-webhook`  
5. LiveKit webhooks → Gateway (`livekit.yaml`).

### Local vs staging storage

| Environment | Object storage |
|-------------|----------------|
| Local dev | MinIO `sqrm-recordings` / `recordings/…` |
| Clatters dual-run / prod cutover | **AWS S3** `live-echo/…` (ADR-006) |

## Clatters side (minimal)

See [../../examples/clatters-integration/env.dual-run.example](../../examples/clatters-integration/env.dual-run.example).

| Variable | Self-host value |
|----------|-----------------|
| `LIVEKIT_URL` | `wss://…` SoftQraft LiveKit |
| `LIVEKIT_API_KEY` / `SECRET` | Same as SoftQraft |
| `LIVEKIT_EGRESS_AUTO` | `true` |
| AWS S3 | Unchanged (Echo) |

**No mobile SDK change** if URL/token flow stays server-driven.

## Cutover checklist (summary)

Use the full [phase-2-checklist.md](phase-2-checklist.md). Minimum path:

1. Staging SoftQraft + AWS Echo write test  
2. Clatters staging `LIVEKIT_*` → SoftQraft  
3. Host live + viewer + Echo replay  
4. Rollback drill to Cloud  

## Rollback

1. Restore Clatters `LIVEKIT_URL` / keys to LiveKit Cloud.  
2. Cloud Egress + Cloud webhooks as before.  
3. In-flight SoftQraft rooms may need manual end.

## Local verify (no Clatters)

```powershell
cd C:\Dev\live-streaming-platform
.\scripts\sync-livekit-node-ip.ps1
docker compose -f deploy/compose/docker-compose.yml up -d
.\scripts\start-local-live.ps1
.\scripts\list-local-recordings.ps1
```
