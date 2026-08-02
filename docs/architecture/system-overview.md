# System overview — Clatters Media Platform

**Status:** Active  
**Related:** [ADR-001](../decisions/ADR-001-self-hosted-livekit-drop-in.md), [ADR-002](../decisions/ADR-002-hybrid-webrtc-hls-delivery.md), [ADR-003](../decisions/ADR-003-gateway-api-boundary.md)

## 1. Product definition

**Clatters Media Platform** is a self-hosted, modular live-media package that Clatters (and future apps) integrate via:

1. **HTTP Gateway API** — orchestration (sessions, tokens, egress, playback)  
2. **LiveKit WebRTC** — realtime stage media (existing Clatters SDKs)  
3. **HLS/LL-HLS over CDN** — mass audience delivery  

It is designed as a **full package** you deploy once and plug into Clatters by configuration, so managed LiveKit Cloud + managed Egress can be retired.

## 2. Logical architecture

```text
┌─────────────────────────────────────────────────────────────────────────┐
│                         CLATTERS APPLICATION                             │
│   Mobile / Web clients          │          Clatters backend services     │
└───────────────┬─────────────────┴───────────────────┬───────────────────┘
                │ LiveKit SDK (WebRTC)                 │ HTTPS (Gateway)
                │                                      │
                ▼                                      ▼
┌──────────────────────────────┐         ┌────────────────────────────────┐
│   LiveKit Server (SFU)       │◄───────►│   Gateway API                  │
│   + TURN                     │  admin  │   services/gateway-api         │
└──────────────┬───────────────┘         │   tokens · sessions · egress   │
               │                         │   playback URL resolution      │
               │ Redis                   └───────────────┬────────────────┘
               ▼                                         │
┌──────────────────────────────┐                         │
│   LiveKit Egress workers     │◄────────────────────────┘
│   room / track / HLS / RTMP  │
└──────────────┬───────────────┘
               │ segments / files
               ▼
┌──────────────────────────────┐         ┌────────────────────────────────┐
│   Object storage (R2 / etc.) │────────►│   CDN (Cloudflare / Bunny)     │
└──────────────────────────────┘         │   up to 10k+ passive viewers   │
                                         └────────────────────────────────┘
```

## 3. Module map (repository)

| Path | Module | Responsibility |
|------|--------|----------------|
| `services/gateway-api` | Control plane | HTTP API, auth, LiveKit admin, egress orchestration |
| `packages/shared` | Shared contracts | Types, error codes, constants |
| `deploy/compose` | Runtime package | One-command media plane for dev/prod-like |
| `deploy/docker/*` | Image/config assets | LiveKit, Egress, edge proxy configs |
| `scripts` | Tooling | smoke tests, keygen, bootstrap |
| `examples/clatters-integration` | Reference | How Clatters backend should call the Gateway |
| `docs/*` | Product docs | Architecture, API, ops, ADRs |

## 4. Trust boundaries

| Boundary | Rule |
|----------|------|
| Mobile / Web | LiveKit **participant** tokens only; never API secret |
| Clatters backend | Gateway **service** credentials |
| Gateway | Holds LiveKit API key/secret, storage credentials, CDN signing keys |
| Public CDN | Read-only playback; signed URLs when lives are non-public |

## 5. Session model

A Clatters **Live show** maps to:

| Concept | Implementation |
|---------|----------------|
| Show / live session | Gateway `Session` resource |
| Media room | LiveKit `room` (name = session id or deterministic mapping) |
| Host publish | LiveKit token with `canPublish` |
| Co-host | LiveKit token with publish grants + Clatters role |
| Mass audience | HLS `playbackUrl` (default); optional capped WebRTC subscribe |
| Packaging | Egress job(s) attached to session |

## 6. Request flows (summary)

### 6.1 Go live (host)

1. Clatters backend → `POST /v1/sessions`  
2. Gateway creates LiveKit room metadata + returns `sessionId`, `realtimeUrl`  
3. Clatters backend → `POST /v1/sessions/{id}/tokens` (role=host)  
4. Host client connects with LiveKit SDK  
5. Clatters backend → `POST /v1/sessions/{id}/egress` (HLS and/or recording)  
6. Gateway returns `playbackUrl` when playlist is ready  

### 6.2 Watch (audience)

1. Clatters backend fetches session playback info (or Gateway public playback endpoint with authz)  
2. Audience player loads **HLS** from CDN  
3. Chat/gifts stay on existing Clatters real-time channels  

### 6.3 End live

1. `POST /v1/sessions/{id}/end`  
2. Gateway stops egress, closes room, finalizes assets  

## 7. Compatibility with current Clatters (managed)

| Today (typical Cloud) | Target (this platform) |
|-----------------------|-------------------------|
| `wss://*.livekit.cloud` | `wss://realtime.<your-domain>` (self-host LiveKit) |
| Cloud API key/secret | Same key model on self-host; held by Gateway |
| Cloud Egress | Self-host Egress workers + your storage |
| Cloud bandwidth bill | Your VPS bandwidth + CDN bill |

Client SDK code paths should remain **LiveKit**; orchestration should move to **Gateway** if not already centralized.

## 8. Non-functional targets

| Area | Target |
|------|--------|
| Stage latency | Sub-second WebRTC |
| Audience latency | ~2–8 s LL-HLS (configurable) |
| Single-show passive viewers | Design for **10,000** via CDN |
| Cutover | Feature-flag dual-run with rollback &lt; minutes |
| Deploy shape | Compose package first; K8s optional later |

## 9. Related documents

- Cost and hybrid rationale: [self-hosted-cost-optimized-live-streaming-proposal.md](self-hosted-cost-optimized-live-streaming-proposal.md)  
- API: [../api/gateway-api-v1.md](../api/gateway-api-v1.md)  
- Integration: [../integration/clatters-migration-guide.md](../integration/clatters-migration-guide.md)  
- Ops: [../operations/deployment-overview.md](../operations/deployment-overview.md)  
