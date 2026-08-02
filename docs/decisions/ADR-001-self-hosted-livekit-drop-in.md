# ADR-001: Self-hosted LiveKit as drop-in media plane for Clatters

| Field | Value |
|-------|--------|
| **Status** | Accepted |
| **Date** | 2026-08-02 |
| **Context** | Clatters is production-live on managed LiveKit + Egress; cost is unsustainable |

## Decision

Build a **self-hosted media platform** centered on **open-source LiveKit Server + LiveKit Egress**, packaged as a modular product with:

1. Deployable media plane (Compose first; orchestrators later)  
2. **HTTP Gateway API** as the integration surface for Clatters  
3. Same LiveKit client SDKs Clatters already uses (URL + API credentials change)  

We will **not** replace LiveKit with a custom SFU for Clatters v1 of this platform.

## Rationale

- Clatters already paid the integration cost of LiveKit SDKs and Egress APIs.  
- Self-hosted LiveKit is protocol-compatible with Cloud for core realtime paths.  
- Fastest path to remove LiveKit Cloud spend is **move the same stack onto cheap bandwidth hosts**, then add CDN fan-out for mass audience.  
- A thin Gateway keeps secrets server-side and gives Clatters a stable HTTP contract even if internal media topology evolves.

## Consequences

**Positive**

- Minimal mobile/web WebRTC rewrite  
- Egress skill and mental model retained  
- Clear migration: dual-run Cloud vs self-host  

**Negative / accepted tradeoffs**

- We inherit LiveKit ops (UDP, TURN, Redis, Egress CPU)  
- Self-host is single-home SFU (not LiveKit Cloud global mesh) unless we invest later  
- Team owns reliability and scaling  

## Alternatives considered

| Alternative | Why not now |
|-------------|-------------|
| Stay on LiveKit Cloud | Cost already hurting production |
| mediasoup / custom SFU | Rewrites clients; longer time-to-relief |
| Agora / Twilio only | Different SDK lock-in; not cheaper at this goal set |
| Pure HLS (no WebRTC) | Breaks co-host / guest Live UX |
