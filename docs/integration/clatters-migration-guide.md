# Clatters migration guide

Migrate production Clatters Live from **managed LiveKit Cloud + Egress** to this **self-hosted Realtime Media Platform** with minimal risk.

> Platform core is **app-agnostic**. This guide is consumer-specific.  
> Inventory: [consumers/the-scholar-clatters-inventory.md](consumers/the-scholar-clatters-inventory.md)  
> Generic plug-in: [generic-integration-guide.md](generic-integration-guide.md)

## Goals

1. No user-facing rewrite of WebRTC stack (keep LiveKit SDKs).  
2. Orchestration goes through **Gateway HTTP API**.  
3. Cost shifts to self-hosted bandwidth + CDN.  
4. Instant rollback via configuration / feature flags.

## Target integration shape

```text
Clatters backend
  ├─ HTTPS → Gateway (sessions, tokens, egress, playback)
  └─ (optional ops) LiveKit RoomService break-glass

Clatters clients
  └─ LiveKit SDK → realtimeUrl from Gateway token response
  └─ HLS player → playback.hlsUrl for mass audience
```

## Migration phases

### M0 — Inventory (do first)

Document what Clatters uses today:

| Area | Questions |
|------|-----------|
| Realtime | Room names, token grants, data channels, simulcast |
| Egress | Room composite vs track? HLS? MP4? RTMP destinations? |
| Storage | S3 bucket? Cloud-managed? Path layout? |
| Viewers | All WebRTC? Any HLS already? |
| Scale | Peak concurrent lives, peak viewers per live |
| Regions | User geography vs current Cloud region |

### M1 — Shadow environment

1. Deploy Compose/single-VM stack (non-prod domain).  
2. Point **internal** Clatters staging at Gateway + self-host realtime URL.  
3. Run host go-live + egress + playback tests.  
4. Compare quality and failure modes to Cloud.

### M2 — Dual-run (production)

1. Feature flag: `media_backend = cloud | self_host`.  
2. Route a small % of new lives (or dogfood users) to self-host.  
3. Monitor: join success, freeze rate, egress failures, origin/CDN bandwidth, cost proxies.  
4. Expand percentage.

### M3 — Primary cutover

1. Default new lives to self-host.  
2. Keep Cloud credentials for rollback window (e.g. 14–30 days).  
3. Drain remaining Cloud lives.  
4. Remove Cloud dependency from critical path.

### M4 — Audience optimization

1. Default passive viewers to HLS playback URL.  
2. Cap `realtime_viewer` WebRTC tier.  
3. Load-test CDN path toward 10k.

## Clatters backend checklist

- [ ] Centralize token minting (if not already) behind one module  
- [ ] Replace Cloud LiveKit host with Gateway-issued `realtimeUrl`  
- [ ] Replace direct Egress API calls with Gateway egress endpoints  
- [ ] Store `sessionId` / `egressId` on Clatters Live records  
- [ ] Use Gateway playback for audience stream URL in app  
- [ ] Feature flag + kill switch  
- [ ] Alerts on Gateway `/ready` and egress failure rate  

## Client checklist

- [ ] Host/co-host still use LiveKit connect(url, token)  
- [ ] Audience path uses HLS when `audience.mode` is hls/hybrid  
- [ ] Handle `playback.status = pending` (spinner / “starting…”)  
- [ ] No API secrets in app binaries  

## Rollback

1. Flip feature flag to `cloud`.  
2. Confirm Cloud keys still valid.  
3. Page on-call only if in-flight self-host sessions need force-end.  

Gateway should support `POST .../end` to clean self-host rooms during rollback of new starts; in-flight sessions may finish on self-host.

## Better idea during migration

Prefer **Gateway as the only Cloud/self-host switch** inside Clatters:

```text
if backend == self_host → Gateway base URL A
if backend == cloud     → Gateway base URL B (Gateway configured against Cloud)
```

That way Clatters application code paths stay identical and only Gateway config differs. Optional Phase 2 enhancement: multi-upstream Gateway.
