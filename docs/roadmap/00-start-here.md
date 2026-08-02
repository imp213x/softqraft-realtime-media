# Where we start

**Audience:** Engineering building the self-hosted media package for **Clatters** (already live in production on managed LiveKit + Egress).  
**Outcome:** A modular, HTTP/API-pluggable media platform you can deploy and point Clatters at with minimal client change.

---

## Context that drives the order

| Fact | Implication |
|------|-------------|
| Clatters is **already production** on LiveKit + Egress | This is a **migration**, not a greenfield experiment |
| Managed cost is already painful | Ship a **deployable media plane** first; optimize second |
| Clients already speak LiveKit SDKs | Keep **LiveKit wire + token model**; do not invent a new WebRTC protocol |
| Product is Instagram/TikTok Live + scale to **10k viewers** | Hybrid: WebRTC stage + **HLS/LL-HLS CDN** for mass audience |
| Must be **pluggable via API / HTTP** | First-class **Gateway API** + packaged Compose/Helm deploy |

**Better idea (locked in):** Do **not** defer Egress. Clatters already depends on it. Phase 1 includes self-hosted **LiveKit Server + Redis + TURN + Egress**. The HLS/CDN fan-out is the cost win for large audiences; the Gateway is the integration surface for Clatters.

---

## Recommended start order (do not skip)

### Step 0 — Align (this week, docs only) ✅ in progress

1. Read architecture + ADR-001 / ADR-002.  
2. Confirm Clatters integration points (see open questions below).  
3. Freeze **Gateway API v0** shapes in OpenAPI before coding business logic.

### Step 1 — Media plane parity (local → single VM)

**Goal:** Same capabilities Clatters uses today, self-hosted.

| Deliverable | Why first |
|-------------|-----------|
| `deploy/compose` — LiveKit Server + Redis + Egress + TURN | Drop-in media backend |
| Config templates + secrets model | API key/secret swap from Cloud |
| Smoke tests: publish, subscribe, start egress (room/track/HLS) | Prove parity before Clatters cutover |

**Success:** Host joins via LiveKit SDK against `wss://media.yourdomain`, Egress produces HLS or file output **without LiveKit Cloud**.

### Step 2 — Gateway API (the plug)

**Goal:** Clatters talks to **one HTTP service**, not raw LiveKit admin sprawl.

| Deliverable | Why |
|-------------|-----|
| `services/gateway-api` — shows, tokens, egress jobs, playback URLs | Clean integration boundary |
| OpenAPI + auth (service API keys) | Professional, versioned contract |
| LiveKit Server SDK only **inside** gateway | Secrets never in mobile apps |

**Success:** Clatters backend can create a live, mint host/viewer tokens, start egress, fetch playback URL via HTTP only.

### Step 3 — Audience cost path (10k viewers)

**Goal:** Passive viewers leave pure WebRTC fan-out.

| Deliverable | Why |
|-------------|-----|
| Egress → HLS (segments to object storage or origin) | Reuse existing Egress skill in Clatters |
| CDN in front (Cloudflare / Bunny) | Cheap 10k fan-out |
| Gateway returns `playback` (HLS) vs `realtime` (LiveKit) endpoints | Product can route audience vs stage |

**Success:** Load test path to 10k **CDN** viewers; SFU bandwidth stays stage-sized.

### Step 4 — Clatters cutover

| Deliverable | Why |
|-------------|-----|
| Integration guide + dual-run (Cloud + self-host) | Safe migration |
| Feature flags in Clatters | Instant rollback |
| Cost and QoS dashboards | Prove the hurt is gone |

### Step 5 — Harden

Multi-node LiveKit, dedicated Egress pool, ABR ladders, runbooks, multi-show capacity.

---

## What we are **not** starting with

| Avoid first | Reason |
|-------------|--------|
| Custom SFU | You already invested in LiveKit clients |
| Rewriting Clatters mobile video stack | Point URL + tokens; gateway for orchestration |
| Kubernetes / multi-region mesh | Premature until single-node + CDN path works |
| AWS as primary media egress | Cost is the problem statement |
| “Bridge-only, Egress later” | Clatters already needs Egress in prod |

---

## This repository’s first engineering slice

After docs freeze, the **first code merge** should be:

1. Monorepo layout (`services/`, `packages/`, `deploy/`)  
2. Docker Compose media plane (LiveKit + Redis + Egress)  
3. Gateway skeleton: health + `POST /v1/tokens` + OpenAPI stub  
4. Example Clatters-oriented integration notes  

No production DNS cutover until smoke tests pass.

---

## Open questions (answer before deep Clatters wiring)

1. Which LiveKit Cloud features does Clatters use today? (Room service, Egress types: room composite / track / participant, Ingress, SIP, Agents?)  
2. Where do Egress outputs go today? (S3? LiveKit Cloud storage? RTMP?)  
3. Are passive viewers on **WebRTC subscribe** today, or already HLS?  
4. Preferred language for Clatters backend integration samples (Node, Go, Python)?  
5. Primary audience geography for first origin DC?  
6. Hard requirement for audience latency (is 2–8 s LL-HLS OK for the crowd)?

---

## Immediate next action

**You:** Confirm open questions (even partial).  
**We:** Proceed Step 1 — media plane Compose + Gateway skeleton + API contract freeze.

See also: [roadmap/phased-delivery.md](phased-delivery.md)
