# Where we start

**Product:** Application-agnostic **Realtime Media Platform** (self-hosted LiveKit + Egress + HTTP Gateway).  
**First consumer:** Clatters / The_Scholar — inventory only; platform APIs stay generic.

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

Docs, ADRs (incl. agnostic ADR-005), OpenAPI, monorepo skeleton, Compose bootstrap.

### Step 1 — Media plane parity (next)

Self-host **LiveKit + Redis + TURN + Egress** such that:

- Any client can publish/subscribe with standard LiveKit tokens  
- Room composite **file** egress writes to **S3-compatible** storage  
- Webhooks can reach a consumer URL  

**Success:** Demo app or smoke script records MP4 without LiveKit Cloud.

### Step 2 — Agnostic Gateway productization

- Caller-supplied `roomName` / `externalId`  
- Token minting with role templates  
- Egress start/stop/status  
- Profile flags  
- Generic webhook fan-out  

### Step 3 — HLS / CDN profile

Optional mass-audience path; does not break file-recording consumers.

### Step 4 — Consumer adapters

- Clatters: env swap + optional thin adapter for path templates / dual-run  
- Generic backend example  

### Step 5 — Harden

Multi-node, quotas, multi-tenant keys, load tests.

---

## Immediate next engineering slice

1. Wire LiveKit access token signing in Gateway (agnostic roles).  
2. Enable Egress in Compose with S3-compatible output (MinIO locally).  
3. Implement `room_composite_file` egress via Gateway.  
4. Smoke: session → publish → egress → object exists.  
5. Document Clatters env mapping (`LIVEKIT_URL` → self-host) without forking core.

---

## Open questions (no longer blocked on Clatters inventory)

Inventory is done. Remaining choices are **deployment**, not product discovery:

1. First production origin region (suggest **EU** near `eu-west-2` users/S3)?  
2. Keep Echo on **AWS S3** initially vs move to R2/Hetzner in the same cutover?  
3. Package scope rename now (`@clatters-media` → neutral) or after Phase 1?
