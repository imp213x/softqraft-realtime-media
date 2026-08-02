# Self-Hosted Cost-Optimized Live Streaming Architecture

**Document type:** Architecture proposal  
**Status:** Proposed — pending build approval  
**Date:** 2026-08-02  
**Scope:** Instagram / TikTok–style live shows, up to **10,000 concurrent viewers** per show  
**Primary constraint:** Avoid LiveKit Cloud and AWS cost exposure (especially egress)

---

## 1. Executive summary

This proposal defines a **self-hosted, hybrid live-streaming stack** for an Instagram/TikTok-style Live product:

| Layer | Technology | Role |
|--------|------------|------|
| **Interactive stage** | Self-hosted **LiveKit Server** (SFU) | Host, co-hosts, guests — low-latency WebRTC |
| **Mass audience** | **LL-HLS / HLS + CDN** | Up to 10k+ viewers — scalable, cost-efficient fan-out |
| **Control plane** | Your app API + Redis + Postgres | Auth, rooms, tokens, show lifecycle |
| **Infrastructure** | Bandwidth-cheap VPS / bare metal (not AWS) | Origin media + SFU |
| **Distribution** | Cheap CDN (Cloudflare / Bunny) + zero-egress object storage | Viewer delivery |

**Critical design rule:** Do **not** put 10,000 passive viewers on pure WebRTC SFU connections. That multiplies bandwidth and CPU roughly with viewer count and is the path that makes LiveKit Cloud and AWS expensive. Instagram/TikTok Live products use **WebRTC (or similar) for the creator stage** and **CDN-backed adaptive streaming for the audience**.

**Egress (LiveKit Egress)** is required later for clean room-composite → HLS/RTMP packaging. Until then, a **bridge path** (lightweight restream origin) delivers the same product model without AWS.

---

## 2. Goals and non-goals

### 2.1 Goals

1. Instagram/TikTok-style **Live show**: one primary host, optional co-hosts/guests, large passive audience.
2. Hold **up to 10,000 concurrent viewers** on a single show without proportional SFU fan-out cost.
3. **Minimize OpEx**: no LiveKit Cloud; no AWS as primary compute/egress platform.
4. Reuse open-source **LiveKit** for interactive media and product velocity (SDKs, rooms, permissions).
5. Defer full **LiveKit Egress** until after core live + scale path works; keep a clear upgrade path.
6. Support mobile and web viewers with acceptable live latency (target: **2–8 s** for mass audience via LL-HLS; **&lt; 500 ms** on stage via WebRTC).

### 2.2 Non-goals (initial phases)

- Building a custom SFU from scratch.
- Global multi-region mesh on day one.
- Full LiveKit Cloud feature parity (managed agents, global WebRTC CDN).
- MCU-style server-side mixing for all viewers.
- Production recording/compliance archive (covered when Egress lands).

---

## 3. Why pure SFU fails the cost test at 10k viewers

### 3.1 SFU economics

In a Selective Forwarding Unit, each viewer typically receives a media subscription from the server. For a one-to-many broadcast:

- **Origin upload** from host: ~1× stream bitrate  
- **Server outbound**: ~N × stream bitrate for N viewers  

Example at ~1.7 Mbps video (rough 720p-class stream):

| Viewers | Approx. egress for 1 hour | Nature of cost |
|--------:|---------------------------:|----------------|
| 100 | ~0.08 TB | Manageable on cheap VPS |
| 1,000 | ~0.8 TB | Noticeable |
| **10,000** | **~7.6 TB** | Dominates bill if priced like AWS/LiveKit Cloud |

Self-hosting the SFU does **not** remove the bytes; it only removes the **per-GB premium** of managed platforms. Pushing 7+ TB/hour from a single origin is still expensive and operationally fragile without a CDN architecture.

LiveKit self-host is excellent for **interactive** rooms (host + guests, co-watch VIPs, low hundreds of WebRTC participants depending on layout and track count). It is the wrong **sole** delivery path for TikTok-scale passive audiences.

### 3.2 Industry pattern for “Live” products

| Audience type | Protocol | Latency | Scale model |
|---------------|----------|---------|-------------|
| Host / co-host / invited guest | WebRTC (LiveKit) | Sub-second | Few participants, SFU |
| Passive viewers (the crowd) | LL-HLS / HLS | ~2–8 s (LL-HLS) / ~8–20 s (HLS) | CDN edges, millions possible |
| Optional “near-real-time VIP” tier | WebRTC subscribe-only | Sub-second | Capped (e.g. first 50–200) |

This hybrid model matches Instagram/TikTok Live UX closely enough for product needs while controlling cost.

---

## 4. Recommended architecture

### 4.1 High-level diagram

```text
┌──────────────────────────────────────────────────────────────────────────┐
│                           YOUR APPLICATION                                │
│  Mobile / Web clients · Show discovery · Chat · Gifts · Moderation        │
└───────────────┬───────────────────────────────┬──────────────────────────┘
                │ JWT / REST                     │ Chat (WS / your stack)
                ▼                                ▼
┌───────────────────────────┐         ┌─────────────────────────┐
│   Control plane (API)     │         │  Chat / social services │
│   Postgres · Auth · Shows │         │  (existing or new)      │
└─────────────┬─────────────┘         └─────────────────────────┘
              │ create room / issue tokens
              ▼
┌─────────────────────────────────────────────────────────────────────────┐
│                    INTERACTIVE MEDIA PLANE (WebRTC)                      │
│                                                                         │
│   Host / Co-hosts ──WebRTC──► LiveKit SFU ◄──WebRTC── VIP / Guests      │
│                                  │                                      │
│                               Redis                                     │
│                           (room state)                                  │
└──────────────────────────────────┬──────────────────────────────────────┘
                                   │
                    Stage media packaged for broadcast
                    (Phase 1 bridge · Phase 2 LiveKit Egress)
                                   │
                                   ▼
┌─────────────────────────────────────────────────────────────────────────┐
│                    BROADCAST ORIGIN (packaging)                          │
│                                                                         │
│   Media origin: MediaMTX and/or OvenMediaEngine (Phase 1)               │
│   Later: LiveKit Egress → HLS segments / RTMP                           │
│   Output: LL-HLS / HLS (ABR ladders when ready)                         │
└──────────────────────────────────┬──────────────────────────────────────┘
                                   │
                    Object storage (segments) + origin pull
                                   │
                                   ▼
┌─────────────────────────────────────────────────────────────────────────┐
│                    AUDIENCE DELIVERY (CDN)                               │
│                                                                         │
│   Cloudflare CDN or BunnyCDN  ──►  10k passive viewers (HLS.js / native)│
│   Optional: Cloudflare R2 / Hetzner Object Storage (near-zero egress)   │
└─────────────────────────────────────────────────────────────────────────┘
```

### 4.2 Component responsibilities

| Component | Responsibility | Notes |
|-----------|----------------|-------|
| **LiveKit Server** | Rooms, WebRTC publish/subscribe, permissions, data channels for stage | Self-hosted; single-home SFU per room |
| **Redis** | Multi-node LiveKit state, job coordination later for Egress | Required once &gt;1 LiveKit node |
| **TURN (coturn or LiveKit TURN)** | NAT traversal for mobile/corporate networks | Co-locate with SFU; avoid expensive egress paths |
| **Control API** | Show create/end, host tokens, viewer playlist URLs, moderation hooks | Your language of choice |
| **Postgres** | Users, shows, metadata, billing hooks | Not on the media path |
| **Broadcast origin** | Ingest stage output; package LL-HLS/HLS | Phase 1: MediaMTX/OME; Phase 2: LiveKit Egress |
| **Object storage** | HLS segments, VODs later | Prefer **R2** or Hetzner Object Storage over S3 |
| **CDN** | Cache and fan-out to 10k viewers | Primary cost lever for audience |
| **Chat** | Comments, likes, gifts | Separate from media plane (scale independently) |

### 4.3 Two-tier viewer model (product mapping)

| Tier | Who | Media path | Target latency | Cap |
|------|-----|------------|----------------|-----|
| **Stage** | Host, co-hosts, invited guests | LiveKit WebRTC | &lt; 500 ms | Small (e.g. 1–16 publishers, optional 50–200 WebRTC viewers) |
| **Audience** | Everyone else watching the Live | LL-HLS via CDN | 2–8 s | **10,000+** |
| **Optional VIP** | Paid / followers early access | WebRTC subscribe-only | Sub-second | Hard cap for cost control |

TikTok/Instagram Live feel for the crowd is driven by **chat + reactions + host energy**, not sub-200 ms video for every viewer. LL-HLS is the cost-effective standard for mass live.

---

## 5. Phased delivery plan

### Phase 0 — Foundation (docs + local stack)

- This repository and architecture decision.
- Local LiveKit + Redis + sample token API.
- Local HLS origin smoke test (MediaMTX or OME).
- Success criteria: host publishes; local viewer plays HLS; stage guest joins WebRTC.

### Phase 1 — Cost-optimized production path (build next)

**Goal:** Real Live shows without LiveKit Cloud / AWS; audience path ready for scale tests.

| Workstream | Deliverable |
|------------|-------------|
| **Infra** | 1–2 Hetzner/OVH/equivalent nodes: LiveKit + Redis + TURN |
| **API** | Room/show lifecycle, LiveKit JWTs (host vs guest vs none for HLS viewers) |
| **Stage clients** | Host go-live via LiveKit SDK (mobile/web) |
| **Bridge / origin** | Stage → RTMP/WHIP/SRT into MediaMTX or OvenMediaEngine → **LL-HLS** |
| **CDN** | Cloudflare (or Bunny) in front of HLS origin or R2-backed segments |
| **Audience client** | HLS.js / native AVPlayer / ExoPlayer against CDN URL |
| **Observability** | Health, concurrent shows, origin bandwidth, CDN cache hit ratio |

**Bridge options until LiveKit Egress:**

| Option | Pros | Cons |
|--------|------|------|
| **A. Client dual-publish** (WebRTC to LiveKit + RTMP/WHIP to origin) | Simple server path | Host battery/CPU; two pipelines |
| **B. Server-side restream worker** (subscribe LiveKit track → FFmpeg/GStreamer → RTMP origin) | Single host publish | Extra worker CPU; you own glue |
| **C. OvenMediaEngine WebRTC ingest** for audience path only | Strong LL-HLS story | Split brain if stage still needs LiveKit guests |

**Recommendation for Phase 1:** **Option B** (small restream worker) if co-hosts matter; **Option A** only for fastest MVP if host is solo. Phase 2 replaces the bridge with **LiveKit Egress**.

### Phase 2 — LiveKit Egress (deferred, planned)

When ready:

- Deploy **LiveKit Egress** workers on the same cheap host class (not AWS if avoidable).
- Room composite or track egress → **HLS segments** to R2/Hetzner Object Storage and/or RTMP to origin.
- Remove ad-hoc bridge where Egress is more reliable (layouts, multi-guest composite).
- Optional: recording, restream to YouTube/Twitch, compliance archive.

### Phase 3 — Scale hardening (as metrics demand)

- Multiple LiveKit nodes + Redis.
- Dedicated TURN pool.
- ABR ladder (e.g. 360p / 480p / 720p) at origin for CDN efficiency.
- Multi-region CDN only (origin can stay single-region longer than SFU).
- Autoscaling restream/Egress workers per concurrent live shows.
- Load tests: **1k → 5k → 10k** synthetic viewers against CDN, not against LiveKit.

---

## 6. Infrastructure and cost strategy

### 6.1 What to avoid

| Avoid | Why |
|-------|-----|
| **LiveKit Cloud as primary** | Per-GB / minute economics hurt at large concurrent live audiences |
| **AWS as media egress plane** | Egress pricing is the usual bill shock; also NLB/EKS complexity early |
| **All 10k viewers on WebRTC SFU** | Bandwidth and node count explode; ops becomes a mesh project |
| **Transcoding every viewer stream** | CPU cost without benefit; encode once, distribute many |

### 6.2 Preferred providers (illustrative)

| Role | Preferred class | Examples | Rationale |
|------|-----------------|----------|-----------|
| SFU + origin compute | Cheap CPU + **generous/cheap bandwidth** | Hetzner Cloud/dedicated, OVH, similar EU/US metal | Media is bandwidth-bound |
| Object storage | Zero/low egress | Cloudflare R2, Hetzner Object Storage, Backblaze B2 | Segments + VOD without S3 egress tax |
| CDN | Flat/cheap bandwidth | Cloudflare, BunnyCDN | 10k viewers live here |
| DNS / TLS | Standard | Cloudflare DNS + origin certs | Simple |
| Managed DB (optional) | Small managed Postgres | Provider-neutral | Keep off media hosts |

**Do not** put LiveKit media UDP behind a traditional CDN. Signaling may be TLS-terminated carefully; **media UDP must hit your SFU/TURN**.

### 6.3 Rough capacity model (order-of-magnitude)

Assumptions for planning (tune with real encodes):

- Host uplink encode: **1.5–3 Mbps** (720p30 class)  
- LL-HLS ladder average pull: **~1.5 Mbps** per viewer  
- 10,000 viewers × 1.5 Mbps ≈ **15 Gbps** peak theoretical if all uncached from origin — **unacceptable** without CDN  

With a proper CDN:

- **Origin** serves CDN edges (cache fill), not 10k clients directly.  
- Origin egress collapses to edge miss traffic (often low single-digit % of total after warm cache for a live event, depending on config and segment design).  
- **SFU** only carries stage participants (+ VIP WebRTC cap).  

**Planning targets (Phase 1 hardware class):**

| Node | Suggested starting size | Serves |
|------|-------------------------|--------|
| LiveKit + Redis + TURN | 8 vCPU / 16 GB, public UDP | Stage interactivity for concurrent shows |
| Broadcast origin (MediaMTX/OME) | 4–8 vCPU / 8–16 GB | Packaging + origin for CDN |
| Restream/Egress worker | 4–8 vCPU per few concurrent composites | CPU-heavy; scale horizontally |
| CDN | Pay-as-you-go | 10k viewers |

Exact instance sizes must be validated with **load tests**; treat the above as a budget orientation, not a guarantee.

### 6.4 Cost control levers (product + engineering)

1. **Default all passive viewers to HLS** — never auto-upgrade entire audience to WebRTC.  
2. **Hard-cap WebRTC viewers** per show (config flag).  
3. **ABR** — most mobile viewers watch mid ladder, not max bitrate.  
4. **Segment design** — short segments for LL-HLS without pathological origin load.  
5. **Co-locate** SFU, TURN, origin in same DC/region to avoid cross-cloud hairpin.  
6. **Chat off media path** — scale chat with horizontal WS/workers, not SFU.  
7. **One show = one broadcast pipeline** — don’t spawn N encoders per viewer.

---

## 7. Application / stack checklist

### 7.1 Media stack

| Piece | Choice |
|-------|--------|
| SFU | LiveKit Server (open source) |
| State | Redis |
| TURN | LiveKit embedded TURN and/or coturn |
| Phase 1 origin | MediaMTX and/or OvenMediaEngine |
| Phase 2 packaging | LiveKit Egress |
| Audience protocol | LL-HLS primary; HLS fallback |
| Stage clients | LiveKit SDKs (Web, iOS, Android, Flutter as needed) |
| Audience players | HLS.js (web), ExoPlayer / AVPlayer (mobile) |

### 7.2 Application stack (suggested; flexible)

| Piece | Suggestion |
|-------|------------|
| API | Node.js, Go, or Python — JWT minting for LiveKit |
| DB | PostgreSQL |
| Auth | Existing app auth → short-lived LiveKit tokens + signed HLS URLs if needed |
| Chat | Existing real-time stack or Redis/NATS + WS |
| Secrets | Env / sops / provider secret store (not AWS-only) |
| Deploy | Docker Compose first; Kubernetes only when multi-service ops justify it |

### 7.3 Network requirements (LiveKit)

- Public IP(s) with **UDP** open for WebRTC media ranges.  
- WSS for signaling.  
- TURN ports for relay clients.  
- Firewall allowlists documented in runbooks (Phase 1 implementation).  
- Health checks that fail closed if UDP is blocked.

---

## 8. Security and product controls

| Concern | Approach |
|---------|----------|
| **Unauthorized publish** | LiveKit grants: only host/co-host tokens can publish |
| **Unauthorized watch (paid lives)** | Signed CDN URLs or tokenized playlist endpoints; short TTL |
| **Room takeover** | Server-generated room names; admin revoke via API |
| **Chat abuse** | Existing moderation; decouple from media |
| **Secrets** | LiveKit API key/secret only on server; never in mobile apps |
| **Recording consent** | Product policy before enabling Egress archives |

---

## 9. Latency and UX expectations

| Experience | Target | Mechanism |
|------------|--------|-----------|
| Host sees self / guests | Near real-time | LiveKit WebRTC |
| Guest invite join | Near real-time | LiveKit |
| Audience sees host | **~2–8 s** | LL-HLS (acceptable Live product norm) |
| Chat vs video sync | Chat may lead video slightly | Product: don’t over-sync; optional delay chat for big shows |
| “Go live” start | &lt; 5 s to first audience frame after pipeline up | Health-check origin before announcing live |

If a future product requirement is **sub-second for all 10k**, costs and architecture change materially (WebRTC CDN mesh or specialized edge). That is **explicitly out of scope** for this cost-optimized proposal.

---

## 10. Risks and mitigations

| Risk | Impact | Mitigation |
|------|--------|------------|
| Bridge (pre-Egress) instability | Black frames for audience | Supervisor restarts; dual-path health; Phase 2 Egress |
| Origin overload without CDN | Outage at high concurrency | CDN mandatory before marketing 10k; load test |
| UDP blocked for hosts | Can’t go live cleanly | TURN; TCP fallback where supported; host preflight |
| Underestimating encode CPU on mobile | Host overheating / drops | Cap resolution/fps; hardware encode |
| Treating LiveKit like a CDN | Cost + outages | Enforce tiering in API (role → media path) |
| Multi-guest composite without Egress | Ugly audience layout | Phase 1: primary host only on HLS; Phase 2: room composite |
| Chat hot path coupled to media deploy | Dual outages | Separate services and scaling |

---

## 11. Success metrics

| Metric | Phase 1 target |
|--------|----------------|
| Concurrent passive viewers on one show | Load-test **10,000** via CDN (synthetic) |
| Stage WebRTC participants | Stable host + co-hosts under production-like NAT |
| Audience glass-to-glass latency | p50 within **2–8 s** (LL-HLS) |
| SFU outbound bandwidth during 10k show | Roughly **stage-only**, not 10k× bitrate |
| Monthly media infra cost | Dominated by CDN + fixed origin/SFU VMs — **not** AWS egress or LiveKit Cloud minutes |
| Time to recover pipeline | Automated restart of restream/origin &lt; 30 s for single-node faults |

---

## 12. Repository layout (planned)

```text
live-streaming-platform/
├── docs/
│   └── architecture/
│       └── self-hosted-cost-optimized-live-streaming-proposal.md  ← this document
├── deploy/                  # (to be added) compose, systemd, firewall
├── services/
│   ├── control-api/         # tokens, shows
│   ├── restream-worker/     # Phase 1 bridge (optional path)
│   └── ...
├── clients/                 # reference host/audience samples
└── README.md
```

Implementation begins only after this proposal is accepted or amended.

---

## 13. Decision summary

| Decision | Choice |
|----------|--------|
| SFU product layer | **Self-hosted LiveKit** |
| Mass audience delivery | **LL-HLS/HLS + CDN** (not pure WebRTC to 10k) |
| Cloud/provider posture | **No LiveKit Cloud; no AWS as primary media path** |
| Hosting bias | **Bandwidth-cheap VPS/bare metal + cheap CDN + low-egress object storage** |
| Egress | **Deferred**; bridge origin in Phase 1; LiveKit Egress in Phase 2 |
| Scale proof | Load-test CDN path to 10k; keep WebRTC tier capped |

### Go / no-go for build

**Recommended go** on Phase 0–1 as specified above.

**Build order after approval:**

1. Docker Compose: LiveKit + Redis + TURN config templates  
2. Minimal control API (JWT + show records)  
3. Host sample (publish) + audience sample (HLS play)  
4. Restream bridge or dual-publish into MediaMTX/OME  
5. CDN in front; 1k → 10k load test plan  
6. Later: LiveKit Egress replacement for bridge  

---

## 14. Open questions for product stakeholders

1. **Max co-hosts** per Live (affects composite/Egress layout)?  
2. Is **2–8 s** audience latency acceptable, or is there a paid sub-second tier?  
3. **Geo**: primary audience region(s) for first origin DC?  
4. Existing mobile stack (native iOS/Android vs Flutter/React Native)?  
5. Must Lives be **private/followers-only** (signed URL complexity)?  
6. Target **concurrent live shows** (not just viewers per show) for capacity planning?

---

## 15. References (internal decisions)

- Prior recommendation: self-host LiveKit rather than rebuild SFU or pay LiveKit Cloud at scale.  
- LiveKit self-host model: single-home SFU; Redis for multi-node; Egress as separate workers.  
- Industry cost pattern: broadcast-style 10k+ audiences → CDN HLS/LL-HLS primary; WebRTC for contribution/stage.

---

*End of proposal. No production services are deployed by this document alone.*
