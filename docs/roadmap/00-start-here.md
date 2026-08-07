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

**Preferred path (safe):** local Clatters + SoftQraft + **MinIO** (no production S3).

Close Phase 2 **local gate** when:

1. Clatters local `LIVEKIT_*` → SoftQraft  
2. Echo writes to **MinIO** under `live-echo/…` (Clatters template)  
3. Two local users: host + viewer  
4. Webhook finalize works (or explicit poll path)  

Guide: [../operations/local-clatters-dual-run.md](../operations/local-clatters-dual-run.md)  
Checklist: [../operations/phase-2-checklist.md](../operations/phase-2-checklist.md)

**Later (still not prod bucket first):** staging SoftQraft + non-prod object storage → then prod AWS (ADR-006).

---

## Next work (in order)

1. **Public Admin shell (S1–S2)** — login + nav + utilities on economic plane  
2. **Integrator polish** — OpenAPI/SDK as sole public contracts  
3. **HLS/egress (M4)** — only when a consumer needs scale; follow [ADR-010](../decisions/ADR-010-economical-egress-hls.md)  
4. Echo/VOD when product requires replay  

Consumer dual-run (Jari SoftQraft WebRTC) is **proven** on economic plane; Clatters remains optional later.  


---

## Resolved product decisions

| Decision | Choice |
|----------|--------|
| Echo / recording object storage | **AWS S3** for consumer cutover; MinIO for local dev ([ADR-006](../decisions/ADR-006-echo-recording-storage-aws.md)) |
| Open-source identity | SoftQraft Labs Ltd. / `@softqraft/*` ([ADR-007](../decisions/ADR-007-softqraft-open-source-identity.md)) |
