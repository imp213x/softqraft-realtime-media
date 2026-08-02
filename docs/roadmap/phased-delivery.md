# Phased delivery

**Last updated:** 2026-08-02  
**Current phase:** **Phase 2 — dual-run readiness (in progress)**  
**Phase 1:** ✅ Complete (local operator verification)

| Phase | Name | Status | Exit criteria |
|------:|------|--------|---------------|
| **0** | Foundation | ✅ Done | Docs, monorepo, ADRs, OpenAPI |
| **1** | Media plane parity | ✅ Done | Self-host LiveKit + Egress; publish + MP4 recording |
| **2** | Gateway product + dual-run | 🔄 In progress | Consumer can dual-run / integrate via Gateway; staging path ready |
| **3** | Audience scale | ⏳ Not started | HLS/LL-HLS + CDN path toward 10k viewers |
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

## Phase 3 — Audience scale ⏳

- HLS / LL-HLS egress + CDN  
- Audience player contract  
- Load-test plan toward 10k passive viewers  

---

## Phase 4 — Production cutover ⏳

- Feature-flagged Clatters cutover  
- Rollback to LiveKit Cloud  
- Cost / QoS metrics  

---

## Phase 5 — Harden ⏳

- Multi-node LiveKit + Egress pool  
- TURN for harsh NAT  
- SLOs, capacity planning  
