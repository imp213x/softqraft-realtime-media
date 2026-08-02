# Self-hosted cost-optimized live streaming (proposal)

**Document type:** Architecture proposal (historical + strategic)  
**Status:** Superseded in part by active system design — see [system-overview.md](system-overview.md)  
**Date:** 2026-08-02 (updated for Clatters production context)

> **Update for Clatters:** The app is already live on **managed LiveKit + Egress**. This platform is a **full drop-in package** (API/HTTP + deployable media plane), not a greenfield experiment. **Egress is in scope for Phase 1** (not deferred). Mass audience still uses **HLS/CDN** for cost at ~10k viewers.

For the active engineering source of truth, use:

| Doc | Role |
|-----|------|
| [system-overview.md](system-overview.md) | Current architecture |
| [../roadmap/00-start-here.md](../roadmap/00-start-here.md) | Build order |
| [../decisions/](../decisions/) | ADRs |
| [../api/gateway-api-v1.md](../api/gateway-api-v1.md) | Integration contract |

---

## Executive summary

Self-host **LiveKit Server + Egress + Redis + TURN**, expose orchestration via a **Gateway HTTP API**, and deliver passive viewers via **LL-HLS/HLS + CDN**. Deploy on **bandwidth-cheap infrastructure**, not LiveKit Cloud and not AWS as the primary media egress plane.

### Critical design rule

Do **not** put 10,000 passive viewers on pure WebRTC SFU subscriptions. Use WebRTC for the **stage**; use CDN HLS for the **crowd**.

---

## Goals

1. Drop-in replacement path for Clatters managed LiveKit + Egress.  
2. Pluggable via **HTTP Gateway API**.  
3. Instagram/TikTok-style Live with co-hosts.  
4. Up to **10k** concurrent viewers per show on a cost-efficient path.  
5. Modular, professional codebase suitable for production ops.  

## Non-goals (v1)

- Custom SFU  
- Global mesh parity with LiveKit Cloud day one  
- Rewriting Clatters chat/gifts  
- Kubernetes-only deployment model  

---

## Cost rationale (unchanged)

At ~1.7 Mbps, 10k viewers for 1 hour is on the order of **~7+ TB** downstream. Managed per-GB and SFU fan-out pricing is where bills explode. CDN + self-hosted origin/SFU on cheap bandwidth is the structural fix.

---

## Phasing (aligned to Clatters)

| Phase | Focus |
|------:|-------|
| 0 | Docs, monorepo, OpenAPI, ADRs |
| 1 | Self-host LiveKit + Redis + TURN + **Egress** |
| 2 | Gateway API productization |
| 3 | HLS + CDN audience path at scale |
| 4 | Clatters dual-run and cutover |
| 5 | Multi-node harden |

See [../roadmap/phased-delivery.md](../roadmap/phased-delivery.md).
