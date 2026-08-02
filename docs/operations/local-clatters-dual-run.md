# Local Clatters dual-run (SoftQraft + MinIO) — no production S3

**Goal:** Run **Clatters locally** against **self-hosted SoftQraft**, with Echo on **local MinIO**.  
**Does not** use `thescholar-uploads` or production AWS.

This is the recommended Phase 2 path before any staging/production cutover.

---

## Architecture (all local)

```text
Browser A (user 1 / host)  ──► Clatters :3000 ──► LiveKit tokens
Browser B (user 2 / viewer) ──► Clatters :3000
         │
         └── WebRTC ──► SoftQraft LiveKit :7880
                              │
                         Egress worker
                              │
                              ▼
                    MinIO :9000  bucket sqrm-recordings
                    keys: live-echo/{workspaceId}/…  (Clatters template)
```

Webhooks:

```text
LiveKit → SoftQraft Gateway :8080/v1/webhooks/livekit
       → forward → http://host.docker.internal:3000/api/livekit/egress-webhook
```

---

## Why MinIO (not “filesystem only”)

- Clatters Echo path is built around **S3 object keys** (`live-echo/…`) and AWS SDK Head/Get.
- MinIO is S3-compatible and already runs in SoftQraft Compose.
- No production bucket, no AWS bill, same code paths as production Echo.
- Pure disk without S3 would require Clatters code changes; MinIO does not.

---

## Prerequisites

| Service | How |
|---------|-----|
| Docker Desktop | Running |
| SoftQraft stack | `deploy/compose` up |
| MongoDB | Local for Clatters (`mongodb://localhost:27017/the_scholar_dev`) |
| Clatters | The_Scholar on `:3000` |
| LAN ICE | `scripts/sync-livekit-node-ip.ps1` on SoftQraft |

---

## Step 1 — SoftQraft (media)

```powershell
cd C:\Dev\live-streaming-platform
.\scripts\sync-livekit-node-ip.ps1

# Ensure webhook forward to Clatters
# In deploy/compose/.env add:
# WEBHOOK_FORWARD_URLS=http://host.docker.internal:3000/api/livekit/egress-webhook

docker compose -f deploy/compose/docker-compose.yml up -d
docker compose -f deploy/compose/docker-compose.yml up -d --force-recreate gateway

# Verify
Invoke-RestMethod http://localhost:8080/ready
```

MinIO console: http://localhost:9001 — `softqraft` / `softqraftsecret`  
Bucket: **`sqrm-recordings`**

---

## Step 2 — Clatters env (local only)

Copy from SoftQraft:

`examples/clatters-integration/env.local-minio.example`

Into The_Scholar `.env` (merge carefully; **do not** put production AWS keys in this profile).

Critical vars:

```bash
LIVEKIT_URL=ws://localhost:7880
LIVEKIT_API_KEY=softqraft_dev_key
LIVEKIT_API_SECRET=softqraft_dev_secret_change_me_before_prod
LIVEKIT_EGRESS_AUTO=true

LIVEKIT_EGRESS_S3_BUCKET=sqrm-recordings
LIVEKIT_EGRESS_S3_ACCESS_KEY=softqraft
LIVEKIT_EGRESS_S3_SECRET=softqraftsecret
LIVEKIT_EGRESS_S3_REGION=us-east-1
LIVEKIT_EGRESS_S3_ENDPOINT=http://host.docker.internal:9000
LIVEKIT_EGRESS_S3_FORCE_PATH_STYLE=true
```

**Why `host.docker.internal:9000`?**  
Egress runs in Docker and must write to MinIO. That hostname reaches the host-published MinIO port from the Egress container. Clatters on the host can also HeadObject via the same URL on Docker Desktop Windows/Mac.

---

## Step 3 — Start Clatters

```powershell
cd C:\Dev\The_Scholar
# ensure Mongo running, npm install if needed
npm run dev
# or your usual local start command
```

App: http://localhost:3000

---

## Step 4 — Two local users + Live test

1. **Browser A** (normal or profile 1): register/login **User 1**.  
2. **Browser B** (private window or profile 2): register/login **User 2**.  
3. User 1: create a **Live Nest** / Go Live (same product flow as production).  
4. User 2: open the live / join as audience.  
5. Confirm both see video (WebRTC via SoftQraft).  
6. End live (or wait for Echo auto path after host publish).  
7. Check MinIO for keys under:

```text
sqrm-recordings/live-echo/{workspaceId}/…
```

List:

```powershell
cd C:\Dev\live-streaming-platform
docker compose -f deploy/compose/docker-compose.yml run --rm --entrypoint /bin/sh minio-init -c "mc alias set local http://minio:9000 softqraft softqraftsecret >/dev/null; mc ls --recursive local/sqrm-recordings/live-echo/ || mc ls --recursive local/sqrm-recordings/"
```

8. In Clatters, open **Echo / replay** if the product surfaces it after webhook finalize.

---

## Troubleshooting

| Symptom | Check |
|---------|--------|
| Token / LiveKit 403 | Keys match SoftQraft `livekit.yaml` |
| PC connection fail | `sync-livekit-node-ip.ps1`; host+viewer on same machine |
| Echo never starts | `LIVEKIT_EGRESS_AUTO=true`; SoftQraft egress container up |
| Empty MinIO | Egress logs: `docker compose logs egress --tail 50` |
| Egress can’t write S3 | Endpoint must be `host.docker.internal:9000` (or `minio:9000` only if Clatters also ran in Compose network) |
| Webhook not finalizing | Gateway `WEBHOOK_FORWARD_URLS`; Clatters on :3000; same API key/secret for verify |
| Accidentally hit AWS | Ensure no real `AWS_ACCESS_KEY_ID` for prod account in this `.env` |

---

## What we are explicitly not doing

- Writing to **`thescholar-uploads`**  
- Pointing local Clatters at LiveKit Cloud for this test  
- Production cutover (Phase 4)  

---

## After local dual-run works

1. Tick Phase 2 checklist section **local dual-run**.  
2. Later: staging SoftQraft + **non-prod** AWS bucket (or staging prefix), never prod until intentional.  
3. Phase 3: HLS for large audience when ready.
