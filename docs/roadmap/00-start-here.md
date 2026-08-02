# Where we start

**Product:** **SoftQraft Realtime Media** (SoftQraft Labs Ltd.) — app-agnostic self-hosted LiveKit + Egress + HTTP Gateway.  
**First consumer:** Clatters / The_Scholar — inventory only; platform APIs stay generic.  
**Recording:** Echo/file output remains on **AWS S3** initially ([ADR-006](../decisions/ADR-006-echo-recording-storage-aws.md)).

---

## Principles

1. **Agnostic first** — sessions/rooms/egress/playback; no Nest/Echo types in core.  
2. **Profiles for situations** — interactive, creator live WebRTC, HLS broadcast, recording, hybrid.  
3. **Drop-in for LiveKit apps** — same SDKs; URL + keys + optional Gateway.  
4. **Egress is core** — file recording and later HLS; not an afterthought.  
5. **Cost path for scale** — HLS/CDN profile when audiences grow (Clatters 10k goal).

---

## What we learned from The_Scholar (summary)

Full detail: [../integration/consumers/the-scholar-clatters-inventory.md](../integration/consumers/the-scholar-clatters-inventory.md)

| Area | Production today |
|------|------------------|
| Realtime | LiveKit **Cloud**, rooms `workspace-{id}` |
| Audience | **WebRTC** subscribe (not HLS) |
| Egress | **Room composite → MP4 → AWS S3** `live-echo/…` (Echo replay) |
| Webhooks | App `/api/livekit/egress-webhook`, verify with API key/secret |
| Stack | Node backend, Next.js + RN LiveKit clients |
| S3 region | eu-west-2 (affinity hint for EU origin) |

So the **fastest relief** for Clatters is self-host realtime + egress with **file output compatibility**, while the **scale/cost** win for 10k is a separate **HLS profile** any consumer can enable.

---

## Start order

### Step 0 — Foundation ✅

Docs, ADRs, OpenAPI, monorepo skeleton, SoftQraft branding.

### Step 1 — Media plane parity ✅ (implemented; operator smoke pending)

Self-host **LiveKit + Redis + Egress** + Gateway:

- Tokens via Gateway (`livekit-server-sdk`)  
- `room_composite_file` egress → S3-compatible (MinIO local; **AWS S3 for Echo**)  
- Compose package + `scripts/smoke-phase1.ps1`  
- Runbook: [../operations/phase-1-runbook.md](../operations/phase-1-runbook.md)  

**Success:** Operator runs smoke with Docker Desktop up; optional publish → MP4 in bucket.

### Step 2 — Dual-run readiness ✅ (in progress / implemented)

- LiveKit → Gateway webhook verify (`POST /v1/webhooks/livekit`)  
- Optional `WEBHOOK_FORWARD_URLS` fan-out to consumer apps (Clatters Echo)  
- Clatters dual-run env + role mapping examples  
- Runbook: [../operations/phase-2-dual-run.md](../operations/phase-2-dual-run.md)  

### Step 3 — HLS / CDN profile

Optional mass-audience path; does not break file-recording consumers.

### Step 4 — Consumer cutover

- Clatters staging dual-run → % production  
- Keep Cloud rollback window  

### Step 5 — Harden

Multi-node, quotas, multi-tenant keys, load tests, TURN for mobile NAT.

---

## Immediate next engineering slice

1. Wire LiveKit access token signing in Gateway (agnostic roles).  
2. Enable Egress in Compose with S3-compatible output (MinIO locally).  
3. Implement `room_composite_file` egress via Gateway.  
4. Smoke: session → publish → egress → object exists.  
5. Document Clatters env mapping (`LIVEKIT_URL` → self-host) without forking core.

---

## Resolved product decisions

| Decision | Choice |
|----------|--------|
| Echo / recording object storage | **AWS S3** for first cutover; migrate later ([ADR-006](../decisions/ADR-006-echo-recording-storage-aws.md)) |
| Open-source identity | **SoftQraft Labs Ltd.** / `@softqraft/*` ([ADR-007](../decisions/ADR-007-softqraft-open-source-identity.md)) |

## Remaining deployment choices

1. First production origin region (suggest **EU** near `eu-west-2` for S3 affinity)?  
2. Single-node vs small multi-node for first staging dual-run?
