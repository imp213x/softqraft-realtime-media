# Implementation plan — cost product recommendations 1–4

**Date:** 2026-08-04  
**Source decisions:** [ADR-009](../decisions/ADR-009-cost-planes-and-hosting-posture.md), [cost-posture-and-planes.md](../operations/cost-posture-and-planes.md)  
**Status:** Active — implementation started

---

## Decision for you (fixed)

| Plane | Use |
|-------|-----|
| **Product demo plane** | GCP public SFU — integration, admin, SDK, quality |
| **Economic production plane** | Bandwidth-cheap origin ± HLS/CDN — **only** plane for cost claims |

Admin + public SDK work continues; **ROI claims require economic plane**.

---

## Recommendations → workstreams

### R1 — Admin polish + public SDK surface (now)

| Item | Deliverable | Status |
|------|-------------|--------|
| Admin credentials UX | Copy key, copy endpoints, revoke confirm, presets | ✅ started |
| Cost / plane honesty in Admin | Demo vs economic plane + profile notes | ✅ started |
| Integration snippets | curl · env · cost profiles | ✅ started |
| Shared types | Cost plane / profile notes in `@softqraft/shared` | ✅ |
| Docs | ADR-009, posture, plan, admin-console, product-plan | ✅ |
| Public SDK package | `@softqraft/sdk` thin HTTP client (Node) | ✅ scaffold |

### R2 — Hosting profile + economic plane ops (parallel)

| Item | Deliverable | Status |
|------|-------------|--------|
| Mandatory hosting profile doc | Cost class matrix, provider guidance | ✅ |
| Economic plane runbook | Deploy SoftQraft on cheap-bandwidth host | ✅ draft |
| Demo → economic migration notes | DNS, secrets, dual-run checklist | ✅ in runbook |
| Infra inventory | Document current GCP as **demo only** | ✅ public-sfu-readiness |

### R3 — Usage metering (before paid/consumer cutover)

| Item | Deliverable | Status |
|------|-------------|--------|
| In-process usage meter | Session minutes, tokens, egress jobs | ✅ |
| Admin API | `GET /admin/v1/usage` + meta plane fields | ✅ |
| Estimated GB proxy | maxParticipants × bitrate × time | ✅ |
| Persist meter (later) | Redis/file when multi-instance | ⏳ |

### R4 — Hybrid HLS as cost product (when scale)

| Item | Deliverable | Status |
|------|-------------|--------|
| Profile productization | `hybrid_live` / `creator_live_hls` as cost path | Partial (egress exists) |
| CDN templates + runbook | Already draft; bind to economic plane | ⏳ |
| Admin copy | Cost profiles tab + hybrid note | ✅ |
| Load test 3e | [load-test-plan-10k.md](../operations/load-test-plan-10k.md) | ⏳ |

---

## Implementation order (execution)

```text
Phase A (this sprint)
  A1 Docs: ADR-009, cost posture, this plan
  A2 Shared: cost plane constants + profile cost notes
  A3 Gateway: usage meter + /admin/v1/usage + meta.plane fields
  A4 Admin UI: polish credentials + plane/cost/snippets
  A5 Update product-plan + admin-console + README index

Phase B (next)
  B1 packages/sdk — thin public HTTP client
  B2 Economic plane runbook + sample compose/host notes
  B3 Persist usage when multi-node needed

Phase C (scale)
  C1 HLS/CDN economic packaging
  C2 Consumer dual-run only after B2 for ROI
```

---

## Exit criteria

| Gate | Criteria |
|------|----------|
| **Public usable SDK (MVP)** | Admin issues keys; docs + snippets; Gateway contract stable; optional Node client |
| **Cost thesis provable** | Economic plane deployed; usage API + host bill comparable to Cloud GB |
| **Scale cost product** | Hybrid profile documented and operable with CDN |
| **Consumer ready** | R1 + R2 + R3 green; Clatters dual-run optional after that |

---

## Non-goals this plan

- Immediate Clatters code integration  
- Replacing LiveKit client SDKs  
- Multi-region mesh day one  
