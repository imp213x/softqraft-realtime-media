# Live Streaming Platform

Self-hosted, cost-optimized live streaming infrastructure for Instagram/TikTok-style Live shows.

**Status:** Architecture proposal only — implementation not started.

## Why this repo exists

- Avoid **LiveKit Cloud** and **AWS egress** cost at scale  
- Support **interactive stage** (host / co-hosts) via self-hosted LiveKit  
- Support **up to 10,000 passive viewers** per show via **LL-HLS + CDN** (not pure WebRTC fan-out)  
- Defer **LiveKit Egress**; plan a Phase 1 bridge, then Egress later  

## Documentation

| Document | Description |
|----------|-------------|
| [Architecture proposal](docs/architecture/self-hosted-cost-optimized-live-streaming-proposal.md) | Full design, phasing, cost strategy, stack, risks |

Read the proposal before any build work.

## High-level architecture

```text
Host / Co-hosts ──WebRTC──► LiveKit (self-hosted SFU)
                                │
                         package / bridge
                                │
                         LL-HLS origin
                                │
                         CDN (Cloudflare / Bunny)
                                │
                         up to 10k audience
```

## Planned phases

1. **Phase 0** — Docs + local stack (current)  
2. **Phase 1** — Production SFU + HLS origin + CDN (no AWS / no LiveKit Cloud)  
3. **Phase 2** — LiveKit Egress (replace ad-hoc bridge; recording-ready)  
4. **Phase 3** — Scale hardening and multi-show capacity  

## License

To be decided.
