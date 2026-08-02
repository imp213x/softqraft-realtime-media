# SoftQraft Realtime Media

**SoftQraft Labs Ltd.** — self-hosted, **application-agnostic** realtime and live media platform.

| Layer | What it is |
|-------|------------|
| Media plane | LiveKit Server, Redis, TURN, Egress |
| Control plane | HTTP Gateway (sessions, tokens, egress, playback) |
| Profiles | Interactive, creator live (WebRTC/HLS), recording, hybrid |

Replace managed LiveKit Cloud for realtime cost control. Keep client LiveKit SDKs.  
**Clatters** and other apps integrate as consumers — they are not the product name.

**License:** MIT · **Packages:** `@softqraft/*`

---

## Start here

| Doc | Purpose |
|-----|---------|
| **[docs/roadmap/00-start-here.md](docs/roadmap/00-start-here.md)** | Build order |
| [docs/architecture/system-overview.md](docs/architecture/system-overview.md) | System design |
| [docs/architecture/capability-profiles.md](docs/architecture/capability-profiles.md) | Situations covered |
| [docs/api/gateway-api-v1.md](docs/api/gateway-api-v1.md) | HTTP contract |
| [docs/integration/generic-integration-guide.md](docs/integration/generic-integration-guide.md) | Plug in any app |
| [docs/integration/consumers/the-scholar-clatters-inventory.md](docs/integration/consumers/the-scholar-clatters-inventory.md) | Clatters inventory |
| [docs/decisions/ADR-006-echo-recording-storage-aws.md](docs/decisions/ADR-006-echo-recording-storage-aws.md) | Echo stays on AWS S3 (for now) |
| [docs/decisions/ADR-007-softqraft-open-source-identity.md](docs/decisions/ADR-007-softqraft-open-source-identity.md) | Branding & open-source identity |
| [docs/README.md](docs/README.md) | Full index |

---

## Capability profiles

| Profile | Use when |
|---------|----------|
| `interactive` | Meetings / small rooms |
| `creator_live_webrtc` | Creator live, audience on WebRTC |
| `creator_live_hls` / `hybrid_live` | Large audience via HLS + CDN |
| `recording_only` / `live_plus_recording` | File/VOD capture (e.g. Echo-style) |

---

## Storage posture (current)

| Traffic | Where |
|---------|--------|
| WebRTC realtime | Self-hosted SFU (not LiveKit Cloud; not AWS as primary media egress) |
| Recording / Echo MP4 | **AWS S3** (existing consumer buckets) — move later if desired |
| Future HLS audience | CDN + S3-compatible segment storage (pluggable) |

---

## Repository layout

```text
live-streaming-platform/   # working directory name; product = SoftQraft Realtime Media
├── docs/
├── services/gateway-api/  # @softqraft/gateway-api
├── packages/shared/       # @softqraft/shared
├── deploy/
├── scripts/
├── examples/              # consumer adapters only
└── LICENSE                # MIT © SoftQraft Labs Ltd.
```

---

## Quick start (foundation)

```bash
pnpm install
pnpm --filter @softqraft/shared build
pnpm dev:gateway
```

```powershell
.\scripts\smoke-gateway.ps1
```

```bash
cd deploy/compose
docker compose up -d
```

---

## Copyright

Copyright (c) 2026 SoftQraft Labs Ltd. Licensed under the [MIT License](LICENSE).
