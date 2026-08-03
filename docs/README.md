# Documentation index

**SoftQraft Realtime Media** — SoftQraft Labs Ltd.  
Self-hosted, app-agnostic live/realtime media (LiveKit + Egress + HTTP Gateway).

| Section | Purpose |
|---------|---------|
| [architecture/](architecture/) | System design, capability profiles, cost model |
| [api/](api/) | Gateway HTTP contract + OpenAPI |
| [integration/](integration/) | Generic plug-in + per-consumer inventories |
| [operations/](operations/) | Deploy and runbooks |
| [decisions/](decisions/) | ADRs |
| [roadmap/](roadmap/) | Phases and start-here |

**Start here:** [roadmap/00-start-here.md](roadmap/00-start-here.md)

### Key docs

| Doc | Description |
|-----|-------------|
| [architecture/system-overview.md](architecture/system-overview.md) | Active architecture |
| [architecture/capability-profiles.md](architecture/capability-profiles.md) | Situation matrix |
| [integration/generic-integration-guide.md](integration/generic-integration-guide.md) | Any-app integration |
| [integration/consumers/the-scholar-clatters-inventory.md](integration/consumers/the-scholar-clatters-inventory.md) | Clatters consumer inventory |
| [decisions/ADR-006-echo-recording-storage-aws.md](decisions/ADR-006-echo-recording-storage-aws.md) | Echo on AWS S3 (initial) |
| [decisions/ADR-007-softqraft-open-source-identity.md](decisions/ADR-007-softqraft-open-source-identity.md) | SoftQraft open-source identity |
| [operations/phase-1-runbook.md](operations/phase-1-runbook.md) | Phase 1 bring-up and smoke |
| [operations/phase-2-dual-run.md](operations/phase-2-dual-run.md) | Clatters dual-run / webhook fan-out |
| [operations/cost-improvement-analysis.md](operations/cost-improvement-analysis.md) | Cost: Cloud vs SoftQraft |
| [operations/phase-2-checklist.md](operations/phase-2-checklist.md) | Phase 2 close-out checklist |
| [operations/local-live-test.md](operations/local-live-test.md) | Local UI + commands (WebRTC, Echo, HLS, TURN) |
| [operations/public-sfu-readiness.md](operations/public-sfu-readiness.md) | Public interactive SFU + hardening ladder |
| [operations/turn-hls-cdn.md](operations/turn-hls-cdn.md) | Market-grade TURN / HLS / CDN / tenants |
| [operations/load-test-plan-10k.md](operations/load-test-plan-10k.md) | Phase 3e load-test plan |
| [architecture/market-grade-product.md](architecture/market-grade-product.md) | Product stack others would pay for |
| [decisions/ADR-008-market-grade-product-stack.md](decisions/ADR-008-market-grade-product-stack.md) | ADR: no mandatory SaaS for core layers |
| [roadmap/phased-delivery.md](roadmap/phased-delivery.md) | Phase status matrix |

