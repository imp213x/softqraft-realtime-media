# Platform maturity assessment

**Date:** 2026-08-04  
**Product:** SoftQraft Realtime Media  
**Status:** Accepted inventory — drives hardening order  

## What it really is today

A **well-structured control-plane prototype** around self-hosted LiveKit that has demonstrated:

- public single-node WebRTC (demo plane / GCP);
- local HLS egress and playback URLs;
- Gateway sessions, tokens, multi-tenant keys (beta), admin console, usage meter stubs.

It is **not** fake engineering and the central idea is **commercially usable after hardening**.

It is **not yet** an operational alternative to LiveKit Cloud in the broad sense. LiveKit Cloud supplies managed global routing, autoscaling, observability, availability engineering, and ops support. Self-hosting removes the managed-media bill and **transfers those responsibilities to SoftQraft**. Official LiveKit guidance recommends distributed nodes with Redis for redundancy and notes that each room still fits on one node.

| Claim | Accurate? |
|-------|-----------|
| Control-plane prototype + self-host SFU | Yes |
| Public interactive WebRTC proven (demo plane) | Yes |
| Local HLS prototype | Yes |
| Production multi-tenant platform | **No** |
| Proven 10k-viewer capacity | **No** (architecture plausible; tests pending) |
| Cost win vs LiveKit Cloud | Only on **economic production plane** — [ADR-009](../decisions/ADR-009-cost-planes-and-hosting-posture.md) |

---

## Finding inventory (double-checked)

Items already partially noted in-repo are marked **Partial**. New or under-documented: **Documented here**.

| # | Finding | Prior coverage | Severity |
|---|---------|----------------|----------|
| 1 | Compose LiveKit image tag may not pull (`v1.13.5`) | **None** (compose pin only) | **P0** |
| 2 | Cross-tenant room adoption + metadata overwrite | **None** | **P0** |
| 3 | In-memory sessions / idempotency / quotas | Partial (session store comment “Phase 1–3”) | **P0** platform |
| 4 | Quota leaks (emptyTimeout / egress webhook) | **None** | **P0** |
| 5 | Credential system beta (plaintext JSON, no volume) | Partial (admin-console beta tone) | **P1** |
| 6 | Lint/test placeholders | **None** as risk doc | **P1** |
| 7 | HLS `ready` too early; single 720p; 10k unproven | Partial (load-test plan, API 501 note) | **P1** |
| 8 | TURN static creds; no TURN/TLS | Partial (turn-hls-cdn pilot notes) | **P1** |
| 9 | `/ready` is LiveKit-list only | Partial (health route code) | **P1** |
| 10 | Profiles / egress types as labels | Partial (gateway-api-v1: 501 for some egress) | **P2** |

---

## 1. Compose LiveKit image tag (P0)

**Issue:** `deploy/compose/docker-compose.yml` pins `livekit/livekit-server:v1.13.5`. Registry snapshots often list **v1.13.4** (or floating `v1.13`) without a visible `v1.13.5`. Clean machines fail `docker pull` unless the tag exists or was cached.

**Fix:** Pin a verified-pullable tag (currently target **v1.13.4**). Guard with CI: `docker compose config` + image existence check.

**Status (2026-08-04):** Compose pin moved to `livekit/livekit-server:v1.13.4`. CI workflow `.github/workflows/compose-images.yml` runs `docker compose config` and `docker manifest inspect` on referenced images.

---

## 2. Cross-tenant room-adoption vulnerability (P0)

**Issue:** Callers may supply `roomName`. On LiveKit “already exists”, Gateway **adopts** without verifying tenant ownership. Tenant B can bind a session to Tenant A’s room and mint tokens.

**Related:** Caller `metadata` was spread **after** reserved keys, allowing overwrite of `sessionId` / `tenantId` / `externalId` in LiveKit room metadata.

**Fix requirements:**

1. Reserved metadata fields always win (write last).  
2. On adopt: load room metadata; require matching `tenantId` (when tenant isolation is on); else **409**.  
3. Prefer Gateway-generated namespaced rooms for greenfield; allow caller `roomName` only with ownership checks.

**Status (2026-08-04):** Reserved metadata written last (`buildRoomMetadata`). On LiveKit “already exists”, Gateway lists the room and **refuses adopt** unless `canAdoptRoom` allows same-tenant ownership. Unit tests: `services/gateway-api/src/lib/room-metadata.test.ts`.

---

## 3. State not durable / not horizontally safe (P0 platform)

**Issue:** Sessions, idempotency, egress jobs, quotas are **in-process memory**.

| Failure mode | Effect |
|--------------|--------|
| Gateway restart | Session IDs 404; idempotency lost; quotas reset; playback/egress records gone |
| Two replicas | Split-brain quotas and session views |
| Race | Check quota → await LiveKit → increment allows oversubscription |

**Target architecture:**

| Data | Store |
|------|--------|
| Sessions, idempotency, egress lifecycle | PostgreSQL |
| Quotas, short locks | Redis atomic scripts / transactions |
| LiveKit rooms | LiveKit (SoT for media) |

**Status (2026-08-05):** Implemented. See [durable-state.md](durable-state.md).  
`DATABASE_URL` → Postgres store; `QUOTA_BACKEND=redis` → atomic Lua quotas.  
Reserve-before-LiveKit; memory fallback when env unset.

---

## 4. Quota counters can leak (P0)

| Path | Bug |
|------|-----|
| Sessions | Quota released only on Gateway `POST .../end`. LiveKit `emptyTimeout` closes rooms without ending Gateway sessions. Webhooks do not process room-finished → session end. |
| Egress | Webhook updates job status but **does not** release `QuotaTracker`. Release only on later poll of egress endpoints. Non-polling tenants can exhaust egress quota permanently. |

**Status (2026-08-05):** Mitigated when webhooks reach Gateway.  
- `room_finished` → end session + release session quota (+ held egress).  
- Egress terminal webhook → release if `quotaHeld`.  
- Poll path still releases as backup.  
**Remaining:** durable async outbox if handler fails after verify; re-hydrate Redis after flush.

---

## 5. Credentials are beta-grade (P1)

| Gap | Detail |
|-----|--------|
| Storage | ~~Full API keys in plaintext JSON~~ → **v2 SHA-256 hashes** (2026-08-05) |
| Missing | ~~Hashing, rotation, multi-key, audit, expiry~~ largely done; encryption-at-rest / KMS still open |
| Compose | **Volume** `gateway_data` → `/data/tenants.json` |
| Admin auth | Still single static bearer; no rate limit, IP allowlist, MFA, multi-user |

**Status (2026-08-05):** Hardening #6 delivered for store model. Admin IAM remains operator-token grade — not full production identity.

---

## 6. Tests and linting are placeholders (P1)

Workspace packages use:

```text
"lint": "echo \"... pending\""
"test": "echo \"... pending\""
```

Root `pnpm test` / `pnpm lint` can succeed with **zero** coverage.

**Must cover:** tenant isolation, JWT grants, webhook verify, idempotency, quotas, path templates, egress lifecycle.  
**Minimum:** unit tests + Fastify inject with mocked LiveKit + Compose smoke in CI.

---

## 7. HLS readiness and ABR (P1)

| Gap | Detail |
|-----|--------|
| Ready too early | After LiveKit accepts HLS egress, Gateway sets `playback.status = ready` before playlist exists |
| Needed states | `requested` → `starting` → `publishing` → `ready` → `ended`/`failed` |
| Ready criteria | Egress active webhook **and/or** successful playlist probe / object head |
| ABR | Single H.264 720p30 only — fine for prototype; not multi-rendition |
| 10k claim | Load doc: local ~11 min only; origin/CDN/soak/failure tests pending — **capacity unproven** |

---

## 8. TURN pilot vs production (P1)

| Gap | Detail |
|-----|--------|
| Static user/pass | Returned to every client; can be abused for relay until rotated |
| TLS | Port 5349 mapping ≠ TURN/TLS without certs + config |
| Next | LiveKit integrated authenticated TURN **or** coturn time-limited REST creds + TURN/TLS domain |

---

## 9. `/ready` is incomplete (P1)

Today: LiveKit `listRooms` only; S3 is a **config boolean**, not a probe.

**Missing probes:** Egress worker, object storage R/W, Redis, TURN, webhook path, tenant-store writability.

Service can be “ready” while recording/HLS are broken.

---

## 10. Documented capabilities vs implemented (P2)

| Surface | Reality |
|---------|---------|
| Profiles `creator_live_hls`, `hybrid_live`, `recording_*` | Stored on session; **no auto-orchestration** of egress/recording |
| Egress types RTMP / track / participant | Schema accepts; handler returns **501** except room composite file/HLS |

API and docs must label **implemented vs planned**. Not fatal if honest.

---

## Recommended engineering order

| Step | Work | Maps to |
|-----:|------|---------|
| **1** | Fix LiveKit image tag + CI (`compose config` + image verify) | #1 |
| **2** | Close cross-tenant room adoption + reserved metadata | #2 |
| **3** | Sessions / egress / idempotency → PostgreSQL | #3 |
| **4** | Quotas → atomic Redis; reconcile from LiveKit events | #3, #4 |
| **5** | Durable, async, idempotent webhooks | #4 |
| **6** | Credential hashing, rotation, audit, mounted volume | #5 |
| **7** | Real tests + lint | #6 |
| **8** | Full dependency readiness + Prometheus/OTel | #9 |
| **9** | TURN/TLS + temporary TURN credentials | #8 |
| **10** | L1–L3 origin/CDN, soak, failure tests before any 10k claim | #7 |

**Parallel product track (R1):** Admin polish + public `@softqraft/sdk` — does not replace P0 hardening.

**Cost track:** Economic production plane — [cost-posture-and-planes.md](cost-posture-and-planes.md).

---

## Related docs

| Doc | Role |
|-----|------|
| [cost-posture-and-planes.md](cost-posture-and-planes.md) | Demo vs economic plane |
| [load-test-plan-10k.md](load-test-plan-10k.md) | Scale test backlog |
| [turn-hls-cdn.md](turn-hls-cdn.md) | TURN / HLS / CDN ops |
| [public-sfu-readiness.md](public-sfu-readiness.md) | Demo plane hardening H1–H6 |
| [../roadmap/hardening-engineering-order.md](../roadmap/hardening-engineering-order.md) | Executable backlog |
| [../api/gateway-api-v1.md](../api/gateway-api-v1.md) | Implemented vs planned API notes |
