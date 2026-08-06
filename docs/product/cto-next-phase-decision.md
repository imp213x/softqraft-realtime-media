# CTO decision: next phase after economic plane MVP

**Date:** 2026-08-06  
**Context:** Hetzner economic plane live (~£12/mo); interactive SFU + Admin + P0.5 auth; GCP gone.  
**Constraint (hard):** packaging / modularization first — avoid future decoupling.

## Options considered

| # | Option | Verdict |
|---|--------|---------|
| 1 | Continue tightening Admin UI/UX | **Support only** — polish that serves integration, not a quarter of design |
| 2 | Broaden scope (new product lines, multi-app features) | **Reject for now** — expands surface before contracts freeze |
| 3 | Full Egress + HLS for “complete” consumption | **Next major capability**, but **after** modular boundaries and one real consumer |

## Decision

**Phase name: Productize the modular core (then scale path)**

### Order (strict)

1. **Package boundary lock** (this sprint)  
2. **Integration surface** (SDK + OpenAPI + one golden path)  
3. **Contract tests / lint** (hardening #7) — cheap insurance  
4. **One consumer integration** (e.g. Clatters live-only) via packages only  
5. **Capability modules:** HLS audience, then Echo — behind clear APIs  

Do **not** lead with UI cosmetics or with HLS/Echo feature sprawl inside `gateway-api` alone.

## Why (architecture)

| Product truth | Implication |
|---------------|-------------|
| Economic win is **WebRTC self-host on cheap egress** (ADR-009) | Interactive plane is already the sellable core |
| 10k passive needs **HLS+CDN**, not more SFU polish | HLS is a **second delivery plane**, not “finish the admin UI” |
| Echo is optional cost/complexity | Keep deferred until a consumer requires replay |
| Future multi-consumer SaaS | **Contracts and packages** matter more than new screens |

## Modular packaging (non-negotiable)

Freeze (or introduce) clear packages so features never glue into one ball:

```text
@softqraft/shared          # types, error codes, cost plane enums
@softqraft/sdk             # only public app client (sessions/tokens/…)
@softqraft/gateway-api     # HTTP control plane (thin; no app business logic)
@softqraft/admin-ui        # optional extract later; OK as gateway/public for now
deploy/*                   # ops only — no product logic
```

### Rules

| Rule | Meaning |
|------|---------|
| **Apps never import gateway internals** | Only `@softqraft/sdk` or raw HTTP OpenAPI |
| **New capabilities = capability profile** | e.g. `hybrid_live`, `room_composite_hls` — not one-off flags |
| **Egress/HLS behind Gateway API** | Same session model; optional egress types — no second control plane |
| **No Clatters types in shared** | Consumer-specific code stays in consumer repos |
| **Admin is operator product** | Tenant API keys for apps; admin auth separate from LiveKit keys |

### When HLS/Egress ships

Add without splitting the monorepo into a mess:

| Module | Responsibility |
|--------|----------------|
| Gateway egress routes | Already: start/stop/list — extend types only |
| `@softqraft/sdk` | `startHlsEgress()`, `getPlayback()` |
| `deploy/cdn/*` + env | Origin/CDN — ops package, not app |
| Docs capability profile | `creator_live_hls` / `hybrid_live` |

Echo later: same pattern (`room_composite_file`), not a new service name.

## Explicit non-goals (this phase)

- Multi-region mesh  
- Billing engine inside Gateway  
- Replacing consumer app UX (chat, gifts, moderation)  
- Marketing “10k ready” without L1–L3 on CDN  
- Large Admin redesign for aesthetics alone  

## Success criteria (next 2–4 weeks)

| Gate | Done when |
|------|-----------|
| **M1 Packages** | ✅ SDK v0.2 + package-boundaries.md (2026-08-06) |
| **M2 Contract** | CI: unit tests for auth/credentials/sessions critical paths + lint |
| **M3 Consumer** | One external app creates session + tokens + live via **SDK or documented HTTP only** |
| **M4 Optional HLS** | Only if M3 needs audience scale; HLS start + playback URL via Gateway/SDK |

## Immediate engineering backlog (mapped)

| Priority | Work |
|----------|------|
| P1 | Harden `@softqraft/sdk` + publish/docs (integration product) |
| P1 | Freeze OpenAPI / gateway-api-v1 as source of truth |
| P1 | Hardening #7 tests/lint on gateway + shared + sdk |
| P2 | Light Admin UX: delete key, error banners (only if it unblocks integrators) |
| P2 | First consumer dual-run (live-only) |
| P3 | HLS + R2/CDN as capability (modular) |
| P4 | Echo when product requires |

## One-line CTO call

**Productize the modular interactive core and one clean integration path; ship HLS/Egress as the next capability module after that — not UI sprawl and not unscoped expansion.**
