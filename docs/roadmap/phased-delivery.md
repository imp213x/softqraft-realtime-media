# Phased delivery

**Last updated:** 2026-08-04  
**Current phase:** **Admin console + credentials (product integration UX)**  
**Phase 1:** ✅ Complete · **Hardening H1–H6:** ✅ · Public interactive SFU

| Phase | Name | Status | Exit criteria |
|------:|------|--------|---------------|
| **0** | Foundation | ✅ Done | Docs, monorepo, ADRs, OpenAPI |
| **1** | Media plane parity | ✅ Done | Self-host LiveKit + Egress; publish + MP4 recording |
| **2** | Gateway product + dual-run | 🔄 In progress | Consumer can dual-run / integrate via Gateway; staging path ready |
| **3** | Audience scale / market-grade | 🔄 3a–d done | TURN + HLS egress + multi-tenant + CDN templates; 3e load tests later |
| **4** | Production cutover | ⏳ Not started | Clatters primary on self-host; rollback tested |
| **5** | Harden & scale | ⏳ Not started | Multi-node, SLOs, multi-show capacity |

---

## Phase 0 — Foundation ✅

- Professional documentation tree  
- Modular monorepo (`@softqraft/*`)  
- ADR-001 … ADR-007  
- OpenAPI Gateway contract  
- SoftQraft Labs Ltd. MIT identity  

---

## Phase 1 — Media plane parity ✅

**Verified 2026-08-02 (local Docker Desktop):**

| Check | Result |
|-------|--------|
| Compose: LiveKit, Redis, Egress, MinIO, Gateway | Up |
| Host publish + viewer subscribe | Worked |
| WebRTC ICE (LAN `node_ip`) | Worked |
| Room composite Echo → MinIO | Worked (~42 MiB MP4) |
| Example object | `recordings/local-dev/sess_…-2026-08-02T164804.mp4` |

Deliverables:

- `deploy/compose` stack  
- Gateway tokens + `room_composite_file` egress  
- Local live test UI (`examples/local-live-test`)  
- Smoke scripts + Phase 1 runbook  

---

## Phase 2 — Gateway product + dual-run 🔄

### Done

- Gateway sessions / tokens / egress / playback stub  
- Service API key auth  
- LiveKit webhook receive + optional `WEBHOOK_FORWARD_URLS`  
- Clatters inventory + dual-run env / role-mapping examples  
- Phase 2 dual-run runbook  

### Remaining to close Phase 2

- [ ] Clatters **staging** dual-run (env → SoftQraft; Echo → AWS S3)  
- [ ] SoftQraft Egress/Gateway env for **AWS S3** Echo path (not only MinIO)  
- [ ] Staging soak: host / guest / viewer / Echo finalize webhook  
- [ ] Lightweight ops: egress status poll UX, dual-run checklist sign-off  
- [ ] (Optional) Gateway rate limit + request audit log  

---

## Phase 3 — Audience scale / market-grade 🔄

**ADR-008 stack (no mandatory SaaS subs):**

| Slice | Status | Deliverable |
|-------|--------|-------------|
| **3a** | ✅ | coturn Compose profiles + Gateway `iceServers` on tokens |
| **3b** | ✅ | `room_composite_hls` → S3/MinIO + `playback.hlsUrl` |
| **3c** | ✅ | `GATEWAY_TENANTS` keys + concurrent session/egress quotas |
| **3d** | ✅ | Cloudflare / Bunny templates + [turn-hls-cdn.md](../operations/turn-hls-cdn.md) |
| **3e** | ⏳ | Load tests, ABR ladders, multi-node TURN |

Remaining Phase 3:

- [x] Audience player (hls.js) in `examples/local-live-test`  
- [x] Load-test plan doc ([load-test-plan-10k.md](../operations/load-test-plan-10k.md))  
- [x] **L0 lab baseline** — host + HLS + `hls_viewer` stable **11+ min** (2026-08-02)  
- [ ] **L1** origin capacity (public S3/R2/MinIO, no CDN)  
- [ ] **L2** CDN ramp (1k→10k, edge HIT%)  
- [ ] **L3** soak + failure drills  
- [ ] Production origin + CDN cutover for a real show  

---

## Public SFU hardening (no Echo / no HLS first) 🔄

See [public-sfu-readiness.md](../operations/public-sfu-readiness.md).

| # | Step | Status |
|---|------|--------|
| **H1** | `node_ip` = public VM IP | ⬜ next |
| H2 | TLS + domain (`wss`) | ⬜ |
| H3 | Public coturn | ⬜ |
| H4 | Rotate secrets | ⬜ |
| H5 | Firewall lockdown | ⬜ |
| H6 | Static IP + monitoring | ⬜ |

Echo / HLS / CDN remain deferred. Interactive path hardened.

## Product: Admin console 🔄

- Docs: [product-plan.md](../product/product-plan.md), [admin-console.md](../product/admin-console.md)  
- Gateway: `/admin/` UI + `/admin/v1/credentials` generate/list/revoke  
- File-backed tenant keys (`TENANT_STORE_PATH`) + `GATEWAY_ADMIN_TOKEN`  

## Phase 4 — Production cutover ⏳

- Feature-flagged consumer cutover (first app e.g. Clatters)  
- Rollback to LiveKit Cloud  
- Cost / QoS metrics  

---

## Phase 5 — Harden ⏳

- Multi-node LiveKit + Egress pool  
- Multi-region TURN / Redis-backed quotas  
- SLOs, capacity planning  
