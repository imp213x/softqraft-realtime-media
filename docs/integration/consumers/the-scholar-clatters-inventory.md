# Consumer inventory: The_Scholar / Clatters

**Source:** `https://github.com/imp213x/The_Scholar` (cloned to `C:\Dev\The_Scholar`)  
**Captured:** 2026-08-02  
**Role:** Reference **consumer profile** for the agnostic media platform — not product identity.

This document answers production questions from reverse-engineering the live app. The media platform itself remains **app-agnostic**; Clatters is the first known production consumer.

---

## 1. Product surface (what Clatters Live is)

| Concept | Implementation in The_Scholar |
|---------|--------------------------------|
| Live unit | **Nest** with `mode === 'live'` (workspace resource) |
| Host go-live | HTTP sets Nest `sessionState=live`, then host publishes |
| Stage guests | Server-issued stage grants → LiveKit publish role `stage_guest` |
| Audience | Authenticated viewers; public/unlisted Nests allow watch without membership |
| Replay (“Echo”) | Room Composite Egress → **MP4** in S3 → session-bound recording |
| Chat / social | Separate Socket.IO / app stack (not LiveKit data-only) |
| Transport flag | `video.transport = livekit` when LiveKit configured |

Related docs in consumer repo:

- `docs/product/clatters-hub/LIVEKIT_CLOUD_EGRESS.md`
- `docs/product/clatters-hub/CLATTERS_LIVE_MEDIA_DECOUPLING_ASSESSMENT.md`
- `docs/product/clatters-hub/CLATTERS_UX_SLICE_ROADMAP.md`

---

## 2. LiveKit usage (production)

| Item | Value |
|------|--------|
| Provider today | **LiveKit Cloud** (`wss://*.livekit.cloud`) |
| Config | `LIVEKIT_URL`, `LIVEKIT_API_KEY`, `LIVEKIT_API_SECRET` (all-or-nothing) |
| Room name | `workspace-{workspaceId}` (`server/lib/livekitConfig.js`) |
| Token TTL | **10 minutes** (short; clients re-mint) |
| Token issuance | App backend (e.g. `server/api/livekitTokenRoute.js`, Colab token path) |
| Client stacks | Web LiveKit transport + mobile `@livekit/react-native` |
| Simulcast | Observed host encodes VP8 ~180p / 360p / 720p (native audit) |

### Token grants by role

| App role | Publish | Subscribe | `roomRecord` |
|----------|---------|-----------|--------------|
| owner / admin | yes | yes | yes (if recording allowed) |
| editor | yes | yes | no |
| stage_guest | yes (camera/mic/screen) | yes | no |
| viewer / guest | no | yes | no |

**Important:** Passive audience today is **WebRTC subscribe-only** on LiveKit — not HLS. That is the primary cost risk at high concurrent viewers.

---

## 3. Egress usage (production)

| Item | Value |
|------|--------|
| Provider today | **LiveKit Cloud Egress** (doc: do not require local worker) |
| Enable flag | `LIVEKIT_EGRESS_AUTO=true` (never implied by S3 alone) |
| Job type | **`startRoomCompositeEgress`** → **single MP4 file** |
| Not used (today) | Segmented HLS/LL-HLS for live audience fan-out |
| Trigger | After primary host joins as publisher (CAS lease), not bare Go Live alone |
| Stop | Host End / publisher grace → `stopEgress` |
| Completion | Webhook `egress_ended` (+ optional `egress_updated`) and/or durable poll |
| Webhook URL | `https://<app-host>/api/livekit/egress-webhook` |
| Webhook verify | LiveKit `WebhookReceiver` with **API key + secret** (not a separate webhook secret) |

### Output storage

| Item | Value |
|------|--------|
| Default bucket | `S3_BUCKET_NAME` (example: `thescholar-uploads`) |
| Region | `AWS_REGION` (example: `eu-west-2`) |
| Credentials | `AWS_*` or `LIVEKIT_EGRESS_S3_*` overrides |
| Key template | `live-echo/{workspaceId}/{liveSessionId}-{time}.mp4` |
| Purpose | **Echo replay** (post-live), not CDN live distribution |
| Lifecycle | 30d retention rule for `live-echo/` prefix (merge script, not full bucket replace) |

Code: `server/services/livekitEgressService.js`.

---

## 4. Answers to prior open questions

| Question | Answer from The_Scholar |
|----------|-------------------------|
| Egress types? | **Room composite → EncodedFile MP4** (S3) |
| Output destination? | **AWS S3** (`live-echo/…`) |
| Passive viewers protocol? | **WebRTC** (LiveKit subscribe); no HLS audience path in prod docs |
| Backend language? | **Node.js** (Express-style server under `server/`) |
| Frontend? | Next.js web + React Native / Expo mobile |
| Primary geo (from S3)? | **eu-west-2** (London) — origin should prefer EU for Echo write affinity |
| Audience latency requirement? | Product is creator Live; sub-second for stage is implicit via WebRTC. HLS for crowd would be a **new** cost-optimized path, not current behavior. |
| Other media stacks? | CoLAB also has mesh + optional **mediasoup** SFU; Live public path enforces LiveKit when configured |

---

## 5. What Clatters needs from an agnostic platform (capability map)

| Capability | Clatters need | Platform mode |
|------------|---------------|---------------|
| WebRTC rooms + tokens | Required (drop-in URL/keys) | `realtime` |
| Role grants (host/guest/viewer) | Required | `realtime` + policy templates |
| Room composite → object storage file | Required (Echo) | `recording.file` |
| Egress webhooks / job status | Required | `recording` + `webhooks` |
| Live HLS + CDN for 10k | **Desired for cost/scale** (not current) | `broadcast.hls` |
| Multi-tenant SaaS | Optional later | gateway tenants |
| SIP / Agents | Not in Live path today | out of scope v1 |

**Drop-in bar for Clatters:** Point `LIVEKIT_URL` + keys at self-host, run self-host Egress that can write the **same S3 key shape** (or S3-compatible), deliver webhooks Clatters already verifies. Optional second phase: HLS audience without rewriting Nest product logic.

---

## 6. Migration notes (Clatters-specific)

1. **Minimal cutover:** Self-host LiveKit + Egress with Cloud-compatible API; keep app token/egress code; only env + webhook target change.  
2. **Storage:** Can keep AWS S3 for Echo initially (app already depends on it) while moving **realtime bandwidth** off Cloud — still a large win. Later move Echo to R2/Hetzner if desired.  
3. **Cost at 10k:** Requires product change to route audience to HLS (or hard-cap WebRTC viewers). Platform must support that without assuming Clatters naming.  
4. **Do not** force Clatters room names inside the platform — accept caller-supplied `roomName` / external ids.

---

## 7. Non-goals for the media platform derived from this inventory

- Replacing Clatters Nest/workspace domain model  
- Owning chat, gifts, billing, Echo UI ceremony  
- Requiring Clatters-specific path prefixes (templates are configurable)  
