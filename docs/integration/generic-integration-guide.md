# Generic integration guide

How **any application** plugs into **SoftQraft Realtime Media** without adopting Clatters domain models.

## Integration surfaces

| Surface | Who uses it | Purpose |
|---------|-------------|---------|
| **Gateway HTTP API** | Your backend | Sessions, tokens, egress, playback, webhooks config |
| **LiveKit WebRTC** | Your clients (SDKs) | Publish / subscribe realtime media |
| **HLS/CDN URLs** | Your players (optional profile) | Mass audience / VOD |
| **Webhooks** | Platform → your backend | Egress lifecycle, session events |

```text
Your backend ──HTTPS──► Gateway ──► LiveKit + Egress
Your clients ──WebRTC─► LiveKit (URL + token from your backend)
Your players ──HLS────► CDN (URL from Gateway playback)
```

## Minimal backend flow (any app)

1. Authenticate **your** user (your auth system).  
2. `POST /v1/sessions` with `externalId` + `metadata` + desired `audience.mode`.  
3. `POST /v1/sessions/{id}/tokens` with `identity` + `role`.  
4. Client: `Room.connect(realtimeUrl, token)`.  
5. Optional: `POST .../egress` for file recording and/or HLS.  
6. Optional: `GET .../playback` for audience URLs.  
7. `POST .../end` on teardown.  
8. Handle webhooks for durable completion (recordings).

## Choosing a profile

| If you need… | Enable |
|--------------|--------|
| Small interactive rooms only | `interactive` |
| Creator live, all viewers on WebRTC | `creator_live_webrtc` |
| Large audience, control bandwidth cost | `creator_live_hls` or `hybrid_live` |
| Post-session MP4/VOD | `recording_only` or combine with a live profile |
| Clatters-like Live + Echo | `creator_live_webrtc` + file recording (see consumer inventory) |

### Cost honesty (planes)

Self-host ≠ automatic savings vs LiveKit Cloud. See [ADR-009](../decisions/ADR-009-cost-planes-and-hosting-posture.md).

| Plane | When |
|-------|------|
| **Demo** | Product integration on any host (incl. GCP) — do not claim Cloud $ savings |
| **Economic production** | Bandwidth-cheap origin; only then claim transfer savings |
| **Scale** | Use `hybrid_live` / HLS + CDN for large passive audiences |

Admin meta exposes `deploymentPlane`, `hostingCostClass`, `costClaimsAllowed`.

## Room naming strategies

| Strategy | When |
|----------|------|
| Gateway-generated `sessionId` as room name | Greenfield apps |
| Caller-supplied `roomName` | Migrating from existing LiveKit apps (e.g. `workspace-{id}`) |
| Deterministic hash of `externalId` | Multi-region idempotency |

## Storage templates

Configure path templates per deployment:

```text
{externalId}/{sessionId}-{time}.mp4
events/{externalId}/replays/{sessionId}.mp4
live-echo/{externalId}/{sessionId}-{time}.mp4   # Clatters-compatible
```

## Webhooks

Your backend exposes an HTTPS endpoint. Gateway (or LiveKit) delivers signed events:

- `egress.started` / `egress.updated` / `egress.ended`  
- Optionally `session.ended`

Verify signatures with the platform webhook secret or LiveKit API key pair (deployment choice documented in ops).

## Multi-app / multi-tenant (later)

Gateway service keys can be scoped:

- Per-app API key  
- Optional `tenantId` on sessions  
- Quotas per key (rooms, egress minutes)

v1 may run single-tenant (one consumer deployment) while keeping the model multi-tenant-ready.

## What stays in your app

- User identity, social graph, chat, payments, moderation policy UX  
- Authorization **before** calling Gateway (Gateway trusts your service key)  
- Product UI (live lobby, gifts, etc.)

## Consumer-specific docs

| Consumer | Doc |
|----------|-----|
| Clatters / The_Scholar | [consumers/the-scholar-clatters-inventory.md](consumers/the-scholar-clatters-inventory.md) |
| Generic example | [../../examples/generic-backend/](../../examples/generic-backend/) (planned) |
