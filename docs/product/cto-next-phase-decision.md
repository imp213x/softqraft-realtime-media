# CTO decision: SoftQraft public product phase

**Updated:** 2026-08-07  
**Product:** SoftQraft Realtime Media (self-hosted SFU + Gateway)  
**Plane in use:** economic production (Hetzner) — `media` / `realtime.softqraftlabs.com`  
**Repo boundary:** SoftQraft platform only. Consumer app UX (Jari sell/viewer, Clatters) lives in those repos.

---

## Where we are (gates)

| Gate | Status | Evidence |
|------|--------|----------|
| **M1 Packages** | ✅ | `@softqraft/shared` + `@softqraft/sdk` v0.2 + [package-boundaries.md](package-boundaries.md) |
| **M2 Contract** | ✅ | CI typecheck + unit tests |
| **M3 First consumer** | ✅ | Jari uses Gateway HTTP (`softqraft.client`) + livekit-client; sell publish + viewer proven on economic plane |
| **M4 HLS / scale egress** | ⏳ | **Decision locked** — see [ADR-010](../decisions/ADR-010-economical-egress-hls.md); implement when a consumer needs passive scale |

**Not SoftQraft work (deferred elsewhere):** Jari mobile OTA; Jari ICE client wiring polish; IVS/Twitch-style ingest as a future **consumer module** with hard boundary.

---

## Decision (this phase)

**Phase name: Public operator product + economical scale path**

Interactive WebRTC is the **sellable core** and is proven. Next work is **operator-facing product quality** and a **clear, cheap path to HLS** — not feature sprawl and not consumer-app work inside this monorepo.

### Strict order

| Step | Work | Why |
|------|------|-----|
| **S1** | Robust **public Admin** login + navigation + utility views | Operators must trust `/admin` as a product, not a paste-token page |
| **S2** | Operator utilities (health, plane honesty, endpoints, usage, audit, integrate snippets) | Unblocks integrators without support tickets |
| **S3** | **Egress / HLS capability** per ADR-010 (off by default on economic plane until needed) | Scale without linear SFU cost; stay economical |
| **S4** | SDK/OpenAPI freeze polish for public consumption | Integration product, not more SFU knobs |
| **S5** | Echo / file VOD | Only when a consumer requires replay |

### Explicit non-goals (this phase)

- Multi-region mesh  
- Billing engine inside Gateway  
- Consumer app UX (chat, gifts, auctions, sell studio)  
- Re-enabling IVS/OBS as SoftQraft core (Twitch-style live later = **separate consumer module**, not Gateway glue)  
- Marketing “10k ready” without L1–L3 CDN proof on economic plane  

---

## Product truths (unchanged)

| Truth | Implication |
|-------|-------------|
| Economic win is **WebRTC self-host on cheap egress** (ADR-009) | Interactive plane stays default sellable surface |
| 10k passive needs **HLS + CDN**, not more SFU polish | HLS is a **second delivery plane** (ADR-002 + ADR-010) |
| LiveKit Cloud free tier remains a **consumer failover** | SoftQraft stays primary; Cloud is optional in *apps*, not in SoftQraft Gateway |
| Multi-consumer SaaS later | Contracts/packages > new screens that mix consumer logic |

---

## Public Admin (S1–S2) — product requirements

| Requirement | Meaning |
|-------------|---------|
| **Login-first** | Email/password session (P0.5); break-glass token secondary |
| **Navigation** | Clear shell: Overview · Credentials · Usage · Audit · Integrate |
| **Plane honesty** | Always show `demo` vs `economic_production` + cost claim note |
| **Utility** | Copy gateway/realtime URLs; health/ready; usage since boot; audit |
| **No LiveKit secrets in browser** | Only operator session cookie or break-glass admin token |

UI may stay under `gateway-api/public/admin` until extract to `@softqraft/admin-ui` is justified.

---

## Egress / HLS (S3) — summary

Full decision: **[ADR-010](../decisions/ADR-010-economical-egress-hls.md)**.

| Mode | When | Cost posture |
|------|------|----------------|
| **Interactive only** (default) | Host + guests + modest WebRTC viewers | Cheapest; current Jari path |
| **Recording egress** | Consumer needs MP4/VOD | On-demand egress job; object storage |
| **HLS audience** | Passive viewers grow past SFU comfort | Egress → origin (R2/MinIO) → CDN pull |

**Do not** run always-on HLS egress for every session on a small economic box. Enable per session / per tenant capability profile.

---

## Success criteria (next 2–4 weeks)

| Gate | Done when |
|------|-----------|
| **S1 Admin shell** | Public login + nav views live on `media.softqraftlabs.com/admin/` |
| **S2 Operator utility** | Ready status, plane, endpoints, usage, audit, integrate docs usable without SSH |
| **S3 HLS path documented** | ADR-010 accepted; deploy knobs documented; no forced always-on egress |
| **S4 Integrator path** | OpenAPI 1.0.1 + SDK README + gateway-api-v1 aligned; sole public contracts; no consumer UI in SoftQraft |

---

## One-line CTO call

**Harden SoftQraft as a public operator + integrator product on the economic plane; keep interactive WebRTC default; ship HLS/egress only as an optional economical capability (ADR-010) — never as Jari/Clatters UI inside this repo.**
