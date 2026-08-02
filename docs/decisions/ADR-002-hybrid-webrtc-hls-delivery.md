# ADR-002: Hybrid WebRTC stage + HLS/CDN audience

| Field | Value |
|-------|--------|
| **Status** | Accepted |
| **Date** | 2026-08-02 |
| **Context** | Clatters Live must support large passive audiences (up to ~10k) without linear SFU egress cost |

## Decision

Use a **two-tier delivery model**:

| Tier | Protocol | Users |
|------|----------|--------|
| **Stage / interactive** | WebRTC via LiveKit SFU | Host, co-hosts, guests, optional VIP |
| **Audience / broadcast** | LL-HLS or HLS via CDN | Passive viewers at scale |

LiveKit **Egress** packages stage media for the audience path (HLS segments and/or RTMP), replacing “everyone subscribes on WebRTC” for the crowd.

## Rationale

- SFU outbound bandwidth ≈ viewers × bitrate — untenable as the only path at 10k on premium networks.  
- CDN HLS/LL-HLS is the industry cost model for Instagram/TikTok-scale Live.  
- Clatters already uses Egress — lean into it for packaging instead of inventing a parallel encoder farm first.  
- Chat/gifts remain outside the media SFU (existing Clatters social stack).

## Consequences

**Positive**

- Predictable cost curve for large shows  
- Stage latency remains excellent for creators  
- Gateway can return both `realtime` and `playback` endpoints  

**Negative / accepted tradeoffs**

- Audience glass-to-glass latency typically **~2–8 s** (LL-HLS), not sub-second  
- Egress workers are CPU-heavy (composite especially) — plan horizontal workers  
- Product must route “viewer” vs “publisher” correctly in Clatters  

## Alternatives considered

| Alternative | Why not as default |
|-------------|--------------------|
| All viewers on WebRTC | Cost and node count explode |
| LiveKit Cloud WebRTC CDN | What we are leaving for cost reasons |
| Client dual-encode RTMP + WebRTC only | Host device cost; weaker multi-guest composite |
