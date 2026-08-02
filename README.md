# Realtime Media Platform

Self-hosted, **application-agnostic** live and realtime media stack:

1. **Media plane** — LiveKit Server, Redis, TURN, Egress  
2. **HTTP Gateway** — sessions, tokens, egress, playback (any backend plugs in)  
3. **Capability profiles** — interactive calls, creator live (WebRTC or HLS), recording, hybrid  

Replace managed LiveKit Cloud (and expensive SFU fan-out) without rewriting client SDKs.  
**Clatters / The_Scholar** is a supported consumer, not the product identity.

---

## Start here

| Doc | Purpose |
|-----|---------|
| **[docs/roadmap/00-start-here.md](docs/roadmap/00-start-here.md)** | Build order |
| [docs/architecture/system-overview.md](docs/architecture/system-overview.md) | System design |
| [docs/architecture/capability-profiles.md](docs/architecture/capability-profiles.md) | Situations the platform covers |
| [docs/api/gateway-api-v1.md](docs/api/gateway-api-v1.md) | HTTP contract |
| [docs/integration/generic-integration-guide.md](docs/integration/generic-integration-guide.md) | Plug in any app |
| [docs/integration/consumers/the-scholar-clatters-inventory.md](docs/integration/consumers/the-scholar-clatters-inventory.md) | Clatters production inventory |
| [docs/README.md](docs/README.md) | Full index |

---

## Situations covered (profiles)

| Profile | Use when |
|---------|----------|
| `interactive` | Meetings / small collaborative rooms |
| `creator_live_webrtc` | Instagram-style live, audience on WebRTC |
| `creator_live_hls` | Large audience via HLS + CDN (cost control) |
| `hybrid_live` | Stage WebRTC + crowd HLS (+ optional VIP WebRTC) |
| `recording_only` | Room composite / track → object storage |
| `live_plus_recording` | Live + Echo/VOD style capture |

---

## Repository layout

```text
live-streaming-platform/
├── docs/                 # architecture, api, integration, ops, ADRs, roadmap
├── services/gateway-api/ # agnostic HTTP control plane
├── packages/shared/
├── deploy/               # compose + LiveKit/Egress configs
├── scripts/
└── examples/             # consumer-specific adapters only
```

---

## Quick start (foundation)

```bash
pnpm install
pnpm --filter @clatters-media/shared build
pnpm dev:gateway
```

```powershell
.\scripts\smoke-gateway.ps1
```

Media plane:

```bash
cd deploy/compose
docker compose up -d
```

> Package scope `@clatters-media/*` is temporary; rename to a neutral scope is tracked in ADR-005.

---

## First consumer: Clatters (summary)

From [The_Scholar](https://github.com/imp213x/The_Scholar):

- LiveKit **Cloud** today; rooms `workspace-{id}`  
- Audience: **WebRTC** subscribe  
- Egress: **room composite MP4 → S3** `live-echo/…` (Echo)  
- Webhooks to app for egress completion  

Platform goal: self-host parity + optional HLS profile for 10k-scale cost control, without baking Nest/Echo into core APIs.

---

## License

To be decided.
