# System overview — Realtime Media Platform

**Status:** Active  
**Related:** [ADR-001](../decisions/ADR-001-self-hosted-livekit-drop-in.md) … [ADR-005](../decisions/ADR-005-app-agnostic-platform.md), [capability-profiles.md](capability-profiles.md)

## 1. Product definition

This repository is an **application-agnostic, self-hosted realtime media platform**:

1. **Deployable media plane** — LiveKit Server, Redis, TURN, Egress  
2. **HTTP Gateway API** — sessions, tokens, egress, playback, webhooks  
3. **Delivery options** — WebRTC stage/audience and/or HLS/CDN, selected by **capability profiles**

Any app (Clatters, white-label live, meetings, webinars) plugs in via API/HTTP + LiveKit SDKs.  
**Clatters / The_Scholar** is the first production consumer inventory, not the product identity.

See consumer inventory: [../integration/consumers/the-scholar-clatters-inventory.md](../integration/consumers/the-scholar-clatters-inventory.md).

## 2. Logical architecture

```text
┌─────────────────────────────────────────────────────────────────────────┐
│                    ANY CONSUMER APPLICATION                              │
│   (Clatters, other live apps, meetings, webinars, …)                    │
└───────────────┬─────────────────────────────────┬───────────────────────┘
                │ LiveKit SDK (WebRTC)             │ HTTPS Gateway
                ▼                                  ▼
┌──────────────────────────────┐    ┌─────────────────────────────────────┐
│ LiveKit Server + TURN        │◄──►│ Gateway API                         │
│ (SFU realtime)               │    │ sessions · tokens · egress ·        │
└──────────────┬───────────────┘    │ playback · webhooks · profiles      │
               │ Redis              └──────────────────┬──────────────────┘
               ▼                                       │
┌──────────────────────────────┐                       │
│ Egress workers               │◄──────────────────────┘
│ file MP4 · HLS · RTMP        │
└──────────────┬───────────────┘
               │
               ▼
     Object storage ──► optional CDN (HLS audience / VOD)
```

## 3. Module map

| Path | Responsibility |
|------|----------------|
| `services/gateway-api` | Agnostic HTTP control plane |
| `packages/shared` | Shared types, error codes, profile ids |
| `deploy/compose` | Packaged media plane |
| `deploy/docker/*` | LiveKit / Egress config assets |
| `examples/*` | Consumer-specific adapters (Clatters, generic) |
| `docs/integration/consumers/*` | Per-app inventories |

## 4. Agnostic session model

| Platform concept | Meaning | Consumer may map to |
|------------------|---------|---------------------|
| `sessionId` | Platform session id | Live show id, meeting id, … |
| `roomName` | LiveKit room | e.g. Clatters `workspace-{id}` |
| `externalId` | Caller’s primary entity id | workspaceId, eventId, … |
| `metadata` | Opaque JSON | product-specific fields |
| `egress job` | Capture/package job | Echo recording, HLS broadcast, RTMP |
| `playback` | Resolved viewer endpoints | hlsUrl / realtimeUrl |

## 5. Trust boundaries

| Boundary | Rule |
|----------|------|
| End-user clients | Participant tokens only |
| Consumer backend | Gateway service credentials |
| Gateway | LiveKit keys, storage, webhook signing |
| CDN | Read-only; signed URLs when private |

## 6. Profiles

See [capability-profiles.md](capability-profiles.md). Deployments enable the situations they need without forking the codebase.

## 7. First consumer snapshot (Clatters)

| Today | Platform path |
|-------|----------------|
| LiveKit Cloud URL + keys | Self-host LiveKit (same SDK) |
| Room composite → MP4 → AWS S3 `live-echo/…` | Self-host Egress + S3-compatible template |
| WebRTC audience | Profile `creator_live_webrtc` |
| Future 10k cost control | Profile `hybrid_live` / `creator_live_hls` |

## 8. Related documents

- [capability-profiles.md](capability-profiles.md)  
- [../api/gateway-api-v1.md](../api/gateway-api-v1.md)  
- [../integration/generic-integration-guide.md](../integration/generic-integration-guide.md)  
- [../roadmap/00-start-here.md](../roadmap/00-start-here.md)  
