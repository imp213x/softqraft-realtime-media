# ADR-010: Economical egress and HLS on the economic plane

| Field | Value |
|-------|--------|
| **Status** | Accepted |
| **Date** | 2026-08-07 |
| **Supersedes** | Nothing (extends [ADR-002](ADR-002-hybrid-webrtc-hls-delivery.md), [ADR-009](ADR-009-cost-planes-and-hosting-posture.md)) |
| **Scope** | SoftQraft Realtime Media only (not consumer apps) |

## Context

- Interactive WebRTC on Hetzner economic plane is **proven** (Gateway + LiveKit + coturn + Admin).  
- First consumer (Jari) uses **WebRTC only** today; passive audiences are still modest.  
- LiveKit **Egress** (room composite file / HLS) is CPU- and bandwidth-heavy. Always-on HLS per session can erase the cost advantage of a small VPS.  
- Product still needs a **clear path** to Instagram-style scale without claiming “10k ready” prematurely.

## Decision

### 1. Default delivery plane = interactive WebRTC

| Audience size | SoftQraft default |
|---------------|-------------------|
| Host + guests + small/medium WebRTC viewers | **No HLS egress required** |
| Large passive audience | **Opt-in** `room_composite_hls` (or hybrid) via Gateway |

Capability profiles stay the switch ([capability-profiles.md](../architecture/capability-profiles.md)):  
`creator_live_webrtc` (default) → `creator_live_hls` / `hybrid_live` when scale needs it.

### 2. Egress is on-demand, not ambient

| Egress type | When to start | Economic note |
|-------------|---------------|---------------|
| **None** | Default | Zero egress CPU |
| `room_composite_file` | Consumer requests VOD/Echo | Burst CPU + object storage |
| `room_composite_hls` | Consumer requests passive scale | Continuous encode + origin bandwidth until stopped |

Gateway already exposes start/stop/list; **do not** auto-start HLS for every session on economic plane.

### 3. Object storage + CDN order (cheap → scale)

| Stage | Origin | CDN | Use |
|-------|--------|-----|-----|
| **Dev / smoke** | MinIO (local or same VPS) | None | Prove pipeline |
| **Economic beta** | Cheap object store (e.g. R2 / Hetzner object / MinIO) | Optional Bunny/Cloudflare **pull** | Low list egress |
| **Scale** | Same origin | CDN mandatory for HLS | Protect origin bandwidth |

Prefer **CDN pull from origin** over pushing every segment through the SFU host NIC as the public URL.

Ops notes: [turn-hls-cdn.md](../operations/turn-hls-cdn.md), [deploy/cdn/](../../deploy/cdn/).

### 4. Economic plane resource guardrails

On a single small/medium VPS:

| Guardrail | Rule |
|-----------|------|
| Concurrent HLS egress jobs | Cap low (tenant `maxEgress`; global process limit) |
| Concurrent interactive sessions | Primary quota; protect SFU first |
| Always-on 24/7 HLS rooms | **Disallowed** as default product posture |
| Marketing | No “10k concurrent HLS” claim without L1–L3 load proof on this plane |

### 5. API / package surface (no second control plane)

| Surface | Responsibility |
|---------|----------------|
| Gateway `POST …/egress` | Start/stop jobs by type |
| `GET …/playback` | HLS URL when ready |
| `@softqraft/sdk` | Thin wrappers only |
| Admin UI | Show plane + whether cost claims allowed; **not** a full encoder farm UI in v1 |

Consumer apps (Jari, Clatters) choose when to call egress. SoftQraft does not embed auction/live show business logic.

## Consequences

**Positive**

- Keeps Hetzner economics honest for the interactive product.  
- Clear upgrade path when a consumer needs mass passive viewers.  
- Aligns with modular packaging (M1): capability profiles, not one-off flags.

**Tradeoffs accepted**

- Large passive audiences require explicit product work (egress worker sizing + CDN).  
- Glass-to-glass latency for HLS viewers is multi-second (ADR-002).  
- Small box may support **few** concurrent composite egress jobs only.

## Alternatives rejected (for now)

| Alternative | Why not |
|-------------|---------|
| Always-on HLS for every session | Kills economic plane ROI |
| All viewers stay on WebRTC forever | Cost explodes at scale (ADR-002) |
| Building a custom encoder farm before LiveKit Egress | Premature; use existing egress types first |
| SoftQraft becomes a consumer “OBS/Twitch” product | Out of scope; future consumer module with hard boundary |

## Implementation checklist (when M4 opens)

1. Confirm egress container healthy on economic plane; pin resources.  
2. Document env: `HLS_*`, object store, optional `CDN_*` public base.  
3. Smoke: one session → `room_composite_hls` → playback URL → player.  
4. Cap `maxEgress` per tenant in Admin credentials.  
5. Extend SDK helpers only after OpenAPI is accurate.  
6. Optional: Admin **Utility → Capabilities** read-only panel (egress enabled? storage configured?).

## Related

- [ADR-002](ADR-002-hybrid-webrtc-hls-delivery.md) — hybrid WebRTC + HLS model  
- [ADR-009](ADR-009-cost-planes-and-hosting-posture.md) — demo vs economic plane  
- [cto-next-phase-decision.md](../product/cto-next-phase-decision.md) — S3 order  
- [capability-profiles.md](../architecture/capability-profiles.md)  
