# Where we are

**Product:** SoftQraft Realtime Media (SoftQraft Labs Ltd.)  
**Current phase:** **Phase 2 — dual-run readiness (in progress)**  
**Phase 1:** ✅ Complete (local publish + Echo recording verified 2026-08-02)

Full matrix: [phased-delivery.md](phased-delivery.md)

---

## Phase snapshot

| Phase | Status |
|------:|--------|
| 0 Foundation | ✅ |
| **1 Media plane** | **✅ Done** — LiveKit + Egress + local MinIO Echo |
| **2 Dual-run / Gateway** | **🔄 In progress** — code + docs ready; Clatters staging cutover pending |
| 3 HLS/CDN 10k | ⏳ |
| 4 Production cutover | ⏳ |
| 5 Harden | ⏳ |

---

## Principles

1. **Agnostic first** — sessions/rooms/egress/playback; no Nest/Echo types in core.  
2. **Profiles for situations** — interactive, creator live, HLS, recording, hybrid.  
3. **Drop-in for LiveKit apps** — same SDKs; URL + keys + optional Gateway.  
4. **Egress is core** — file recording proven locally; AWS S3 for Clatters Echo (ADR-006).  
5. **Cost path for scale** — HLS/CDN profile when audiences grow (Phase 3).

---

## What Phase 1 proved

- Self-hosted SFU + Egress without LiveKit Cloud  
- Host + viewer WebRTC (after LAN `node_ip` fix)  
- Room composite MP4 to **local MinIO** (`sqrm-recordings`)  
- Gateway orchestration (sessions, tokens, egress)

Runbooks:

- [../operations/phase-1-runbook.md](../operations/phase-1-runbook.md)  
- [../operations/local-live-test.md](../operations/local-live-test.md)  

---

## Phase 2 — what “done” means

Close Phase 2 when:

1. SoftQraft can write Echo to **AWS S3** with Clatters key template `live-echo/…`  
2. Clatters **staging** points `LIVEKIT_*` at SoftQraft  
3. Webhooks reach Clatters Echo finalize (direct or `WEBHOOK_FORWARD_URLS`)  
4. Staging checklist signed (host / stage guest / viewer / replay)

Tracking: [../operations/phase-2-checklist.md](../operations/phase-2-checklist.md)  
Runbook: [../operations/phase-2-dual-run.md](../operations/phase-2-dual-run.md)

---

## Next work (in order)

1. **AWS S3 Echo profile** for dual-run (env + compose notes)  
2. **Clatters staging** dual-run  
3. Optional: HLS profile (Phase 3) once dual-run is stable  

---

## Resolved product decisions

| Decision | Choice |
|----------|--------|
| Echo / recording object storage | **AWS S3** for consumer cutover; MinIO for local dev ([ADR-006](../decisions/ADR-006-echo-recording-storage-aws.md)) |
| Open-source identity | SoftQraft Labs Ltd. / `@softqraft/*` ([ADR-007](../decisions/ADR-007-softqraft-open-source-identity.md)) |
