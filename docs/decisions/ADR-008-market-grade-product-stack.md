# ADR-008: Market-grade product stack (no mandatory SaaS subs)

| Field | Value |
|-------|--------|
| **Status** | Accepted |
| **Date** | 2026-08-02 |
| **Context** | SoftQraft Realtime Media should be sellable to other teams; avoid LiveKit Cloud–style mandatory subscriptions for core capabilities |

## Decision

Build market-grade capabilities with **self-hosted defaults** and **optional** paid edges:

| Layer | Default choice | Subscription required? |
|-------|----------------|------------------------|
| **TURN / NAT** | **coturn** on our VMs (wired into LiveKit) | **No** |
| **HLS** | **LiveKit Egress** → object storage (segments + playlist) | **No** |
| **CDN** | **Cloudflare** or **Bunny** in front of HLS origin | **Usage / free tier** (not LiveKit) |
| **Multi-tenant** | Gateway **API keys + quotas** per tenant | **No** |
| **Sell as SaaS later** | We charge customers; still self-host or pass CDN cost | **Optional** business model |

## Rationale

- Cost story is SoftQraft’s product differentiator vs LiveKit Cloud.  
- TURN/HLS/multi-tenant are well-solved open components.  
- CDN is the only layer that usually needs a third party at scale; pay **GB**, not “participant minutes.”  
- Multi-tenant control plane is pure product software (Gateway).

## Consequences

**Build**

1. coturn in Compose + LiveKit `turn` / ICE servers for clients.  
2. `room_composite_hls` egress + public playback URL assembly.  
3. Tenant registry (API key → tenant id, session/egress quotas).  
4. CDN runbooks (Cloudflare / Bunny) for HLS origin.

**Do not**

- Require paid TURN SaaS or managed HLS platforms for MVP market-grade.  
- Block Phase 3 on multi-region mesh.

## Related

- [ADR-002 hybrid WebRTC + HLS](ADR-002-hybrid-webrtc-hls-delivery.md)  
- [ADR-004 infrastructure posture](ADR-004-infrastructure-posture.md)  
- [market-grade-product.md](../architecture/market-grade-product.md)  
