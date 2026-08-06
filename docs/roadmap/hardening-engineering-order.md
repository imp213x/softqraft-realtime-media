# Hardening engineering order

**Source:** [platform-maturity-assessment.md](../operations/platform-maturity-assessment.md)  
**Updated:** 2026-08-05  

### Stop / handoff (2026-08-06)

**GCP demo plane live** (Admin, Postgres, Redis, prebuilt gateway, R2, TURN).  
**Paused code track before #7** (tests/lint).  
**Parallel infra:** Hetzner CX33 economic plane — see [next-steps-handoff.md](next-steps-handoff.md).

| # | Work | Status |
|--:|------|--------|
| 1 | LiveKit image pin + CI image/compose guard | ✅ pin `v1.13.4` + `.github/workflows/compose-images.yml` |
| 2 | Cross-tenant room adoption + reserved metadata | ✅ `room-metadata` + adopt check; unit tests |
| 3 | Sessions / egress / idempotency → PostgreSQL | ✅ `DATABASE_URL` + auto-migrate; memory fallback |
| 4 | Quotas → Redis atomic; LiveKit event reconcile | ✅ Lua reserve; webhook room_finished + egress release |
| 5 | Durable async idempotent webhooks | 🔄 sync handler + quota/session reconcile; outbox queue ⏳ |
| 6 | Credentials: hash, rotation, audit, volume | ✅ v2 store + multi-key + audit + Compose volume |
| **7** | **Real unit/integration tests + lint** | ✅ unit suite + `.github/workflows/ci.yml` (M2) |
| 8 | Full `/ready` probes + metrics | ⏳ |
| 9 | TURN/TLS + temporary credentials | ⏳ |
| 10 | L1–L3 CDN/soak/failure before 10k claims | ⏳ |

**Product parallel:** R1 public SDK + admin — [cost-product-implementation-plan.md](cost-product-implementation-plan.md).
