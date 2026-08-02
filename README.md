# Clatters Media Platform

Self-hosted, production-oriented live media stack for **Clatters** — a modular package that replaces managed **LiveKit Cloud + Egress** via:

1. **Deployable media plane** — LiveKit Server, Redis, TURN, Egress  
2. **HTTP Gateway API** — sessions, tokens, egress, playback (Clatters plugs in here)  
3. **Hybrid delivery** — WebRTC stage + HLS/CDN for up to ~10k passive viewers  

**Status:** Foundation (Phase 0) — docs, monorepo, Gateway skeleton, Compose bootstrap.

---

## Start here

| Doc | Purpose |
|-----|---------|
| **[docs/roadmap/00-start-here.md](docs/roadmap/00-start-here.md)** | **Where we start and why** |
| [docs/architecture/system-overview.md](docs/architecture/system-overview.md) | System design |
| [docs/api/gateway-api-v1.md](docs/api/gateway-api-v1.md) | HTTP API contract |
| [docs/integration/clatters-migration-guide.md](docs/integration/clatters-migration-guide.md) | Production migration |
| [docs/README.md](docs/README.md) | Full documentation index |

---

## Repository layout

```text
live-streaming-platform/
├── docs/                      # Professional documentation tree
│   ├── architecture/
│   ├── api/                   # Gateway design + OpenAPI
│   ├── integration/           # Clatters plug-in & migration
│   ├── operations/
│   ├── decisions/             # ADRs
│   └── roadmap/
├── services/
│   └── gateway-api/           # HTTP control plane (TypeScript / Fastify)
├── packages/
│   └── shared/                # Shared types / error codes
├── deploy/
│   ├── compose/               # Docker Compose media plane
│   ├── docker/                # LiveKit, Egress configs
│   └── env/
├── scripts/
└── examples/
    └── clatters-integration/
```

---

## Architecture (one glance)

```text
Clatters backend ──HTTPS──► Gateway API ──► LiveKit + Egress
Clatters host     ──WebRTC─► LiveKit SFU
Clatters audience ──HLS────► CDN ◄── Egress segments
```

---

## Quick start (foundation)

### Gateway skeleton

```bash
# From repo root (requires Node 20+ and pnpm)
pnpm install
pnpm --filter @clatters-media/shared build
pnpm dev:gateway
```

```powershell
# Smoke (PowerShell)
.\scripts\smoke-gateway.ps1
```

Default service key: `dev-local-key`  
Health: `GET http://localhost:8080/health`

### Media plane (LiveKit + Redis)

```bash
cd deploy/compose
docker compose up -d
```

Generate production keys before staging:

```bash
./scripts/generate-livekit-keys.sh
```

Update `deploy/docker/livekit/livekit.yaml` and env templates. Enable Egress service when storage is configured.

---

## Delivery phases

| Phase | Focus |
|------:|-------|
| **0** | Docs, monorepo, OpenAPI, Gateway skeleton ← **current** |
| **1** | Self-host LiveKit + Redis + TURN + **Egress** parity |
| **2** | Full Gateway (tokens, egress jobs, playback) |
| **3** | HLS + CDN audience path (10k) |
| **4** | Clatters dual-run → cutover |
| **5** | Multi-node harden |

---

## Design decisions (summary)

| ADR | Decision |
|-----|----------|
| [001](docs/decisions/ADR-001-self-hosted-livekit-drop-in.md) | Self-host LiveKit as drop-in media plane |
| [002](docs/decisions/ADR-002-hybrid-webrtc-hls-delivery.md) | WebRTC stage + HLS/CDN audience |
| [003](docs/decisions/ADR-003-gateway-api-boundary.md) | HTTP Gateway is Clatters integration boundary |
| [004](docs/decisions/ADR-004-infrastructure-posture.md) | No LiveKit Cloud / no AWS primary media path |

---

## Better ideas we will keep raising

As build proceeds, expect recommendations such as:

- **Multi-upstream Gateway** so Clatters feature-flag only switches Gateway config (Cloud vs self-host).  
- **Audience default HLS** even if today’s Clatters uses WebRTC for all viewers (largest cost lever).  
- **R2 (or zero-egress storage) + CDN** instead of AWS S3 egress for HLS.  
- **Separate Egress worker pool** early if room-composite CPU contends with SFU.  

---

## License

To be decided.
