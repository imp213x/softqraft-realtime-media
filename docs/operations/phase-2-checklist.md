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

## B. AWS S3 Echo path (Clatters production shape)

| # | Item | Status |
|---|------|--------|
| B1 | Gateway/Egress env for real AWS (no MinIO endpoint) | ⬜ |
| B2 | Key template `live-echo/{externalId}/{sessionId}-{time}.mp4` | ⬜ |
| B3 | IAM write to `live-echo/*` on Clatters bucket | ⬜ |
| B4 | One staging MP4 lands in AWS under `live-echo/` | ⬜ |

Env template: [../../deploy/env/aws-echo.env.example](../../deploy/env/aws-echo.env.example)

---

## C. Clatters staging dual-run

| # | Item | Status |
|---|------|--------|
| C1 | Staging SoftQraft reachable (`wss` + UDP/TCP media) | ⬜ |
| C2 | Clatters staging `LIVEKIT_URL` / key / secret → SoftQraft | ⬜ |
| C3 | `LIVEKIT_EGRESS_AUTO=true` + S3 unchanged (AWS) | ⬜ |
| C4 | Webhooks: SoftQraft → Clatters `/api/livekit/egress-webhook` | ⬜ |
| C5 | Host Go Live + publish | ⬜ |
| C6 | Audience watch (WebRTC) | ⬜ |
| C7 | Stage guest (if used) | ⬜ |
| C8 | Echo finalize + playable replay in Clatters | ⬜ |
| C9 | Rollback drill: restore Cloud `LIVEKIT_*` | ⬜ |

Env: [../../examples/clatters-integration/env.dual-run.example](../../examples/clatters-integration/env.dual-run.example)

---

## D. Sign-off

| Role | Name | Date | Notes |
|------|------|------|-------|
| SoftQraft | | | |
| Clatters | | | |

**Phase 2 complete when:** B4 + C5–C8 + C9 are checked.

Then proceed to **Phase 3** (HLS/CDN) and/or **Phase 4** (production % cutover).
