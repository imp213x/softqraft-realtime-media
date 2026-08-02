# Phased delivery

| Phase | Name | Outcome | Exit criteria |
|------:|------|---------|---------------|
| **0** | Foundation | Docs, monorepo, API contract, ADRs | Team aligned; OpenAPI v0 reviewed |
| **1** | Media plane parity | Self-hosted LiveKit + Redis + TURN + Egress | Local/single-VM smoke: publish + egress |
| **2** | Gateway product | HTTP API for shows, tokens, egress, playback | Clatters can integrate via HTTP only |
| **3** | Audience scale | HLS/LL-HLS + CDN for passive viewers | Proven path toward 10k CDN viewers |
| **4** | Production cutover | Clatters dual-run then primary on self-host | Rollback tested; cost metrics green |
| **5** | Harden & scale | Multi-node, ABR, ops maturity | Multi-show capacity targets met |

## Phase 0 — Foundation (current)

- Professional documentation tree  
- Modular monorepo skeleton  
- ADR-001 product positioning, ADR-002 hybrid delivery  
- OpenAPI v0 for Gateway  

## Phase 1 — Media plane parity

- `deploy/compose` production-shaped stack  
- LiveKit config, Redis, Egress workers, TURN  
- Secrets and env templates  
- Scripted smoke tests  

## Phase 2 — Gateway product

- `services/gateway-api` modular service  
- Auth (service keys), rate limits, audit logs  
- Token minting, room/show lifecycle, egress job control  
- Playback URL assembly (realtime + HLS)  

## Phase 3 — Audience scale

- Egress HLS to R2/Hetzner object storage (or origin)  
- CDN configuration templates  
- Audience player contract  
- Load-test harness plan  

## Phase 4 — Clatters cutover

- Feature-flagged endpoint swap  
- Migration checklist  
- Dual-write/dual-run period  
- Incident rollback procedure  

## Phase 5 — Harden

- Horizontal LiveKit + Egress pools  
- Multi-region CDN (origin stays simple longer)  
- SLO dashboards, capacity planning  
