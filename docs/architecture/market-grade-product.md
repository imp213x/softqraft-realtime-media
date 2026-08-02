# Market-grade SoftQraft Realtime Media

**Status:** Active — Phase 3a–d implemented (3e load tests later)  
**ADR:** [ADR-008](../decisions/ADR-008-market-grade-product-stack.md)  
**Ops:** [turn-hls-cdn.md](../operations/turn-hls-cdn.md)

## Positioning

SoftQraft is a **self-hosted realtime media platform** other product teams can run and (later) pay SoftQraft Labs to support or host.

| Promise | How |
|---------|-----|
| No LiveKit Cloud bill | Self-host SFU + Egress |
| Works behind NAT / mobile | **coturn TURN** |
| Scale audience without SFU×N cost | **HLS + CDN** |
| Multiple apps / customers | **Multi-tenant API keys + quotas** |
| Sell without forking | HTTP Gateway + standard LiveKit SDKs |

## Stack map

```text
┌─────────────────────────────────────────────────────────────────┐
│  Customer apps (Clatters, white-label, SaaS tenants)             │
│  LiveKit SDKs + HLS.js / native players                         │
└────────────┬───────────────────────────────┬────────────────────┘
             │ WebRTC                        │ HLS HTTPS
             ▼                               ▼
┌────────────────────────┐         ┌─────────────────────────────┐
│ LiveKit SFU + coturn   │         │ CDN (Cloudflare / Bunny)    │
│ (interactive / stage)  │         │ edge cache of .m3u8 + segs  │
└────────────┬───────────┘         └──────────────▲──────────────┘
             │ room composite HLS                 │ origin pull
             ▼                                    │
┌────────────────────────┐         ┌──────────────┴──────────────┐
│ LiveKit Egress         │────────►│ Object storage (MinIO/R2/S3)│
└────────────────────────┘         └─────────────────────────────┘
             ▲
             │ admin
┌────────────┴───────────┐
│ Gateway API            │  tenants · keys · quotas · sessions · egress · playback
└────────────────────────┘
```

## Layer details

### TURN (coturn)

- Deploy beside LiveKit.  
- Clients use TURN when UDP/host ICE fails.  
- **Cost:** relay bandwidth on your VMs (no TURN SaaS required).  
- Local Compose: `coturn` service, credentials in env.

### HLS (LiveKit Egress)

- `room_composite_hls` → segmented files + live playlist on object storage.  
- Gateway returns `playback.hlsUrl` (origin or CDN URL).  
- Audience mode `hls` / `hybrid` uses this path; stage stays WebRTC.

### CDN

- Not self-built anycast.  
- Point Cloudflare/Bunny at origin (public MinIO/S3 or gateway/static origin).  
- Config templates under `deploy/cdn/`.  
- **Cost:** usage or free tier — not LiveKit.

### Multi-tenant

| Concept | Implementation |
|---------|----------------|
| Tenant | `tenantId` string |
| Auth | Bearer API key mapped to tenant |
| Quotas | max concurrent sessions, max egress jobs (in-memory v1; Redis later) |
| Isolation | sessions tagged with `tenantId`; keys cannot see other tenants |

Env shape:

```bash
# Simple keys (legacy): GATEWAY_SERVICE_API_KEYS=key1,key2
# Multi-tenant: GATEWAY_TENANTS=tenantA:keyA:sessions=50:egress=10,tenantB:keyB:sessions=20:egress=5
```

### Sell as SaaS later

- SoftQraft Labs runs the stack; customers get API keys.  
- Optional pass-through CDN billing.  
- Same codebase as self-host OSS.

## Build phases (market-grade)

| Slice | Status | Deliverable |
|-------|--------|-------------|
| **3a** | ✅ | coturn Compose (`turn` / `turn-bridge` / `full`) + Gateway `iceServers` on tokens |
| **3b** | ✅ | `room_composite_hls` + `HLS_*` / `CDN_*` playback URLs |
| **3c** | ✅ | `GATEWAY_TENANTS` + in-memory session/egress quotas |
| **3d** | ✅ | `deploy/cdn/*` + [turn-hls-cdn.md](../operations/turn-hls-cdn.md) |
| **3e** | ⏳ | Load tests, ABR ladders, multi-node TURN |

## Non-goals for this slice

- Full multi-region mesh  
- Paid managed TURN  
- Kubernetes-only packaging  
