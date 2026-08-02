# Load-test plan — ~10k passive viewers (Phase 3e)

**Status:** Plan only (not automated yet)  
**Goal:** Prove hybrid WebRTC stage + HLS/CDN audience can serve ~10k passive viewers without LiveKit Cloud.

## Architecture under test

```text
Hosts/guests (≤ tens) ──WebRTC──► LiveKit SFU + coturn
                                      │
                                      │ room_composite_hls
                                      ▼
                              Object storage origin
                                      │
                                      ▼
                              CDN (Cloudflare / Bunny)
                                      │
                                      ▼
                         ~10k HLS players (no SFU seats)
```

## Non-goals

- 10k **interactive WebRTC** participants (not the product shape)  
- Measuring LiveKit Cloud  
- Full multi-region mesh

## Phases

### L0 — Lab baseline (local / single VM)

| Metric | Target |
|--------|--------|
| 1 host publish | Stable 720p30 |
| 1 HLS egress | `live.m3u8` updates ≤ ~segment duration |
| 5–20 local hls.js players | Continuous play ≥ 10 min |
| SFU CPU | Headroom for stage only |

**Commands:** [local-live-test.md](local-live-test.md), `smoke-phase3.ps1`.

### L1 — Origin capacity (no CDN)

| Metric | Target |
|--------|--------|
| Concurrent playlist/segment pulls | Find origin knee (MinIO/S3/nginx) |
| Origin bandwidth | Record peak Gbps |
| Error rate | &lt; 1% 5xx on segments |

Tooling options: `k6`, `vegeta`, or many headless hls.js instances.

### L2 — CDN cache (production-like)

| Metric | Target |
|--------|--------|
| Edge HIT ratio on `.ts`/`.m4s` | &gt; 95% after warm-up |
| Playlist freshness | Stale &lt; 2× segment duration |
| 1k → 5k → 10k synthetic viewers | Step ramp; watch origin egress stay flat |

Use Cloudflare/Bunny analytics + origin logs.

### L3 — Soak + failure

| Scenario | Expectation |
|----------|-------------|
| Host disconnect 30s | HLS may freeze/stall; recovery after republish or new egress |
| Egress worker restart | Document recovery (new egress job) |
| Origin brief outage | CDN may serve cached segments; playlist 5xx until origin returns |
| TURN-only clients (stage) | Hosts behind symmetric NAT still publish |

## Suggested k6 sketch (playlist poll)

```javascript
// conceptual — point at CDN playlist, not SFU
import http from "k6/http";
import { sleep } from "k6";

export const options = {
  stages: [
    { duration: "2m", target: 200 },
    { duration: "5m", target: 2000 },
    { duration: "5m", target: 10000 },
    { duration: "2m", target: 0 },
  ],
};

export default function () {
  http.get(__ENV.HLS_PLAYLIST_URL);
  sleep(2); // ~segment duration
}
```

Segment fetches should use real player behavior (or multiply playlist poll by average segments/s) for bandwidth estimates.

## Pass / fail (10k claim)

| Gate | Pass |
|------|------|
| Passive player QoE | Startup &lt; 5s; rebuffer ratio low on good network |
| Origin | Not linear with viewer count (CDN absorbs) |
| SFU | Viewer count does **not** increase SFU bandwidth materially |
| Cost model | Matches [cost-improvement-analysis.md](cost-improvement-analysis.md) (CDN GB, not participant minutes) |

## Deliverables when 3e is executed

1. Recorded ramp results (viewers × time × origin egress × edge HIT%)  
2. Recommended segment duration / playlist window  
3. Capacity sheet: VMs for SFU+Egress vs CDN plan  

Until then, local hybrid path (WebRTC + HLS egress) is implemented; scale is proven in L1–L3 on real infra.
