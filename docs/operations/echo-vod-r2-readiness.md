# Echo / VOD readiness (R2 + economic plane)

**Scope:** SoftQraft Realtime Media only (not consumer app UI).  
**Related:** [ADR-006](../decisions/ADR-006-echo-recording-storage-aws.md) (storage pluggable), [ADR-010](../decisions/ADR-010-economical-egress-hls.md) (on-demand egress), [economic-plane-runbook.md](economic-plane-runbook.md).

## Goal

Serve **file recording (Echo/VOD)** and optional **HLS** to integrating apps using **Cloudflare R2** (S3-compatible), without always-on egress.

## What R2 already covers

| Piece | Role |
|-------|------|
| R2 bucket + API token | Object write target for LiveKit Egress |
| `S3_ENDPOINT` = `https://<accountid>.r2.cloudflarestorage.com` | S3-compatible API |
| `S3_FORCE_PATH_STYLE=true`, `AWS_REGION=auto` | R2-required style |
| `S3_BUCKET_NAME` | e.g. `sqrm-hls` (prefix VOD under `recordings/`, HLS under `hls/`) |
| `HLS_PUBLIC_BASE_URL` | Public origin for playlists (r2.dev or custom domain) |
| Gateway `s3Configured: true` on `/ready` | Credentials present |
| LiveKit Egress container | Encodes room composite → R2 |

You do **not** need a second object store for SoftQraft’s default path. AWS S3 remains optional for a specific consumer locked to legacy keys (ADR-006).

---

## Full checklist: ready to serve consumers

### A. SoftQraft platform

| # | Step | Done when |
|---|------|-----------|
| A1 | R2 credentials in Gateway `.env` | `/ready` → `s3Configured: true` |
| A2 | Egress worker running | `docker ps` shows `…-egress-1` |
| A3 | Key templates set | `RECORDING_KEY_TEMPLATE`, `HLS_KEY_TEMPLATE` |
| A4 | Public read for objects | Browser or `curl` can GET finished MP4 / `live.m3u8` (public bucket or signed URL policy) |
| A5 | CORS on R2 if browsers fetch media cross-origin | Player does not fail CORS |
| A6 | Prefer custom domain over `*.r2.dev` for production consumers | Optional but recommended |
| A7 | Cap tenant `maxEgress` (economic plane) | ADR-010; avoid always-on jobs |
| A8 | **Smoke:** one `room_composite_file` job completes and object is readable | See [file-egress-smoke.md](file-egress-smoke.md) |
| A9 | `WEBHOOK_FORWARD_URLS` + optional `WEBHOOK_FORWARD_SHARED_SECRET` | Consumer (e.g. Jari) notified on egress complete |
| A9b | **R2 lifecycle 30 days** on recording prefixes | Objects auto-expire (SoftQraft owns deletion) |
| A10 | Document public URL pattern for integrators | Base + key template → final URL |

### B. Each consumer app (Jari, Clatters, …) — not SoftQraft

| # | Step | Done when |
|---|------|-----------|
| B1 | Call `POST /v1/sessions/{id}/egress` with `type: room_composite_file` (or SDK `startFileEgress`) at the right product moment | Job created |
| B2 | Persist `sessionId` + `egressId` on the show/session record | Mapping exists |
| B3 | Webhook handler **or** poll `GET /v1/egress/{egressId}` until `complete` / `failed` | Terminal status known |
| B4 | Store final public (or signed) URL on the show | Replay link available |
| B5 | Consumer replay UI + auth | End users can watch VOD |

SoftQraft does **not** auto-start Echo and does **not** host the marketplace replay UI.

---

## Gateway env (R2)

```bash
S3_BUCKET_NAME=sqrm-hls   # or dedicated sqrm-vod
S3_ENDPOINT=https://<accountid>.r2.cloudflarestorage.com
S3_FORCE_PATH_STYLE=true
AWS_REGION=auto
AWS_ACCESS_KEY_ID=<r2_access_key>
AWS_SECRET_ACCESS_KEY=<r2_secret>

RECORDING_KEY_TEMPLATE=recordings/{externalId}/{sessionId}-{time}.mp4
HLS_KEY_TEMPLATE=hls/{externalId}/{sessionId}
HLS_PUBLIC_BASE_URL=https://pub-<id>.r2.dev   # or https://vod.example.com
# CDN_PUBLIC_BASE_URL=https://cdn.example.com   # optional scale

# Notify consumers when egress finishes (LiveKit events, verified then forwarded)
# WEBHOOK_FORWARD_URLS=https://api.jarilive.com/api/v1/streaming/softqraft/webhook
# WEBHOOK_FORWARD_SHARED_SECRET=<shared with Jari SOFTQRAFT_WEBHOOK_SHARED_SECRET>
```

### R2 lifecycle (30 days — SoftQraft owns)

In Cloudflare R2 → bucket → **Settings → Object lifecycle rules**:

- Expire objects after **30 days** for prefixes SoftQraft writes (`recordings/`, `jari-vod/`, `hls/`).  
- Jari owns product UX (“available 30 days”); SoftQraft owns actual object deletion.

Compose injects the same vars into the Gateway service. Egress receives S3 settings **per start request** from the Gateway (LiveKit SDK `S3Upload`), not only from `egress.yaml`.

---

## Public URL pattern (integrators)

| Asset | Pattern |
|-------|---------|
| **MP4 VOD** | `{publicBase}/{filepath}` where `filepath` is the rendered `RECORDING_KEY_TEMPLATE` (LiveKit may expand `{time}`) |
| **HLS live playlist** | `{HLS_PUBLIC_BASE_URL or CDN}/{hlsPrefix}/live.m3u8` (see Gateway playback after HLS egress) |

Example (illustrative):

```text
HLS_PUBLIC_BASE_URL / public base: https://pub-af20….r2.dev
File key: recordings/smoke-show/sess_abc-2026-08-08T120000.mp4
Public GET: https://pub-af20….r2.dev/recordings/smoke-show/sess_abc-….mp4
```

Confirm bucket **public access** (or use Cloudflare Worker / signed URLs for private VOD).

---

## API surface (backend only)

```http
POST /v1/sessions
Authorization: Bearer <tenant_api_key>

POST /v1/sessions/{sessionId}/egress
{ "type": "room_composite_file" }

GET /v1/egress/{egressId}
POST /v1/egress/{egressId}/stop

GET /v1/sessions/{sessionId}/playback   # stronger for HLS; file path via egress job
```

SDK: `startFileEgress`, `getEgress`, `stopEgress` — [`@softqraft/sdk`](../../packages/sdk/README.md).

---

## Operational notes

- **Empty room:** room composite may still start; quality is meaningless without a publisher. Smoke can prove write path; product QA needs a live publisher.  
- **CPU:** few concurrent composites on a small VPS.  
- **Cost:** R2 has no egress fees to Cloudflare; always-on HLS still burns **encode** CPU (ADR-010).  
- **Clatters legacy:** if still on AWS `live-echo/` keys, either dual-write or migrate templates deliberately (ADR-006).

## Smoke procedure

See **[file-egress-smoke.md](file-egress-smoke.md)** (economic plane / Hetzner).

Scripts:

| Script | Purpose |
|--------|---------|
| `deploy/scripts/smoke-file-egress-with-publisher.sh` | **Preferred** — demo publisher + file egress → `complete` |
| `deploy/scripts/smoke-file-egress.sh` | Empty-room only (often hangs without publisher) |
| `deploy/scripts/fix-egress-host-network.sh` | Egress `network_mode: host` (Hetzner WebRTC/ICE) |
| `deploy/scripts/fix-egress-keys-on-host.sh` | Align `egress.yaml` keys with `livekit.yaml` |
| `deploy/scripts/check-livekit-key-alignment.sh` | Verify gateway / livekit / egress keys match |

## Host config pitfalls (2026-08-08)

| Issue | Symptom | Fix |
|-------|---------|-----|
| `egress.yaml` keys ≠ `livekit.yaml` | Fast `Start signal not received` / auth fail | Run `fix-egress-keys-on-host.sh` |
| `S3_ENDPOINT` still `https://<accountid>.r2…` | Upload fails or misleading `s3Configured: true` | Set real R2 S3 API URL from Cloudflare dashboard |
| `HLS_PUBLIC_BASE_URL` placeholder / truncated | Public GET fails | Set `https://pub-….r2.dev` or custom domain |
| Empty room composite | Chrome may hang on start signal | Smoke with publisher (local-live-test or consumer host) |
