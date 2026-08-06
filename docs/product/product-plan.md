# SoftQraft Realtime Media — product plan

**Updated:** 2026-08-06  
**Product:** Self-hosted realtime media platform (LiveKit SFU + HTTP Gateway)  
**Identity:** SoftQraft Labs Ltd. · MIT · `@softqraft/*`  
**Next phase decision:** [cto-next-phase-decision.md](cto-next-phase-decision.md)

## Goal

Ship a **market-ready interactive live SFU** that apps integrate via HTTP + LiveKit SDKs — and can **cut media cost vs LiveKit Cloud** when deployed on the **economic production plane**.

## Decision for you (planes)

| Plane | Host example | Purpose |
|-------|--------------|---------|
| **Product demo** | Current GCP public SFU | Product proof, admin, SDK — **not** cost claims |
| **Economic production** | Bandwidth-cheap VPS/metal ± CDN | Real traffic ROI vs LiveKit Cloud |

See [ADR-009](../decisions/ADR-009-cost-planes-and-hosting-posture.md), [cost-posture-and-planes.md](../operations/cost-posture-and-planes.md).

## Current status (shippable beta)

| Layer | Status |
|-------|--------|
| Interactive WebRTC (host / guest / viewer) | ✅ Proven public GCP (**demo plane**) |
| Gateway sessions + tokens + ICE | ✅ |
| TLS + domain (`media` / `realtime.softqraftlabs.com`) | ✅ H2 |
| coturn TURN | ✅ H3 |
| Secrets + firewall + static IP + monitoring | ✅ H4–H6 |
| Cost posture docs + dual-plane decision | ✅ ADR-009 |
| Admin GUI + credentials + usage + plane honesty | ✅ live on GCP demo |
| Usage metering (in-process) | ✅ beta (not durable) |
| Public Node SDK `@softqraft/sdk` | ✅ scaffold |
| Hardening inventory (10 findings) | ✅ documented |
| LiveKit image pin + compose CI | ✅ |
| Cross-tenant room adopt fix | ✅ |
| Durable Postgres + Redis quotas + webhooks | ✅ demo deploy |
| Hashed multi-key credentials + audit | ✅ |
| Hetzner economic plane | ✅ live (media/realtime + admin) |
| P0.5 Admin login/logout | ✅ |
| **M1 package boundaries + SDK v0.2** | ✅ [package-boundaries.md](package-boundaries.md) |
| **M2 contract tests/lint** | ⏳ next |
| First consumer dual-run | ⏳ after package freeze |
| HLS + CDN capability | ⏳ after consumer path (not UI-first) |

**Handoff:** [next-steps-handoff.md](../roadmap/next-steps-handoff.md)
| Economic plane deploy runbook | 🔄 draft |
| Echo / MP4 recording | ⏸ deferred |
| HLS + CDN (scale cost product) | ⏸ R4 when scale |
| Session durability (DB) | ⏸ H7 later |

## Architecture (product)

```text
Integrating app
  → HTTPS Gateway (sessions, tokens, credentials admin)
  → LiveKit SFU + Redis + coturn
  → LiveKit client SDK (WebRTC)
```

## Integration model

1. Operator opens **Admin Console** → creates **tenant** → gets **API key** (once)  
2. App stores API key server-side  
3. App: `POST /v1/sessions` + `POST /v1/sessions/:id/tokens`  
4. Clients connect with token to `wss://realtime…`  

## Roadmap slices

| ID | Slice | Priority |
|----|--------|----------|
| **P0** | Admin GUI + credentials + plane/usage honesty | ✅ MVP |
| **P0.5** | Admin **login/logout** (email+password, sessions) | Before public multi-operator — [admin-auth-design.md](admin-auth-design.md) |
| **P1** | Public SDK surface + integration docs | With P0 |
| **P1b** | Economic plane ops (host + flags + dual DNS) | Parallel R2 |
| **P1c** | Usage metering (persist later) | R3 before cutover |
| **P2** | First consumer dual-run (optional; after economic plane) | Later |
| **P3** | H7 session store persistence | Multi-gateway |
| **P4** | H8 HLS + CDN as **cost product** | Scale (R4) |
| **P5** | H9 Echo / VOD | When product requires replay |

Plan detail: [cost-product-implementation-plan.md](../roadmap/cost-product-implementation-plan.md).

## Non-goals (near term)

- Full multi-region mesh  
- Replacing app UI (chat, gifts, moderation)  
- Mandatory SaaS billing inside Gateway  

## Public endpoints (operator)

| URL | Role |
|-----|------|
| `https://media.softqraftlabs.com` | Gateway API + Admin UI |
| `https://realtime.softqraftlabs.com` | LiveKit WSS (via Caddy) |
| `/health` `/ready` | Probes |

## Related ops

- [public-sfu-readiness.md](../operations/public-sfu-readiness.md) — hardening H1–H6  
- [gateway-api-v1.md](../api/gateway-api-v1.md) — public API  
- [admin-console.md](admin-console.md) — credential GUI  
