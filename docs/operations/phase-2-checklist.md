# Phase 2 checklist — dual-run readiness

**Status:** 🔄 In progress  
**Owner:** SoftQraft Labs + Clatters engineering  

Use this to close Phase 2. Tick items as verified.

---

## A. SoftQraft platform (local already ✅)

| # | Item | Status |
|---|------|--------|
| A1 | Compose stack healthy (LiveKit, Redis, Egress, Gateway) | ✅ Local |
| A2 | Gateway tokens (host / viewer) | ✅ Local |
| A3 | Live host + viewer WebRTC | ✅ Local |
| A4 | Room composite file egress completes | ✅ Local (MinIO) |
| A5 | Webhook endpoint `/v1/webhooks/livekit` | ✅ Implemented |
| A6 | `WEBHOOK_FORWARD_URLS` fan-out | ✅ Implemented (config) |
| A7 | LAN `node_ip` for Docker Desktop + Egress ICE | ✅ Scripted |
| A8 | Egress UI polls until `complete` | ✅ (this iteration) |

---

## B. Local Clatters dual-run (MinIO — **preferred first**)

**No production bucket.** SoftQraft + Clatters + MinIO on one machine.

Guide: [local-clatters-dual-run.md](local-clatters-dual-run.md)  
Clatters env: [../../examples/clatters-integration/env.local-minio.example](../../examples/clatters-integration/env.local-minio.example)

| # | Item | Status |
|---|------|--------|
| B1 | SoftQraft Compose up + `sync-livekit-node-ip` | ⬜ |
| B2 | `WEBHOOK_FORWARD_URLS` → `host.docker.internal:3000/.../egress-webhook` | ⬜ |
| B3 | Clatters `.env` → SoftQraft LiveKit + MinIO `LIVEKIT_EGRESS_S3_*` | ⬜ |
| B4 | Confirm **no** prod AWS keys in local Clatters env | ⬜ |
| B5 | Two local users; host Go Live + viewer watch | ⬜ |
| B6 | Echo MP4 in MinIO under `live-echo/…` | ⬜ |
| B7 | Clatters Echo/replay finalize (webhook) | ⬜ |

---

## C. Staging dual-run (optional later — still not prod bucket)

Use a **non-production** bucket or prefix. Avoid `thescholar-uploads` until intentional.

| # | Item | Status |
|---|------|--------|
| C1 | SoftQraft staging host + TLS | ⬜ |
| C2 | Staging/non-prod S3 (or MinIO remote) | ⬜ |
| C3 | Clatters staging `LIVEKIT_*` → SoftQraft | ⬜ |
| C4 | Full live + Echo soak | ⬜ |
| C5 | Rollback drill to LiveKit Cloud | ⬜ |

Prod AWS template (when ready): [../../deploy/env/aws-echo.env.example](../../deploy/env/aws-echo.env.example)

---

## D. Sign-off

| Role | Name | Date | Notes |
|------|------|------|-------|
| SoftQraft | | | |
| Clatters | | | |

**Phase 2 local gate:** B5–B7 checked.  
**Phase 2 full:** also C items if you use staging before prod.
