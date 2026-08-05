# Environment variable inventory

**Updated:** 2026-08-05  
**Stop point:** Hardening work paused before **#7** (broader tests/lint).  
**Purpose:** Single source of truth for process env expected by SoftQraft vs deploy files.

---

## How to give the agent access (safe)

Do **not** paste real secrets into chat. Use one of:

### A — Redacted dump from the VPC host (preferred)

On the VM (or wherever the stack runs):

```bash
# Compose project dir
cd ~/softqraft-realtime-media/deploy/compose   # adjust path

# 1) List .env keys with values redacted (names + set/empty only)
if [ -f .env ]; then
  echo "=== deploy/compose/.env (redacted) ==="
  sed -E 's/^(.*(SECRET|PASSWORD|TOKEN|KEY|CREDENTIAL|DATABASE_URL|AWS_SECRET).*)=.*/\1=***REDACTED***/I; t; s/=.*/=***/' .env
fi

# 2) What Compose injects into gateway (names only + non-secret samples)
docker compose config 2>/dev/null | sed -n '/gateway:/,/volumes:/p' | head -n 120

# 3) Running container env names only
docker compose exec gateway env 2>/dev/null | cut -d= -f1 | sort
```

Or PowerShell (host-run Gateway):

```powershell
Get-ChildItem Env: | Where-Object {
  $_.Name -match '^(GATEWAY|LIVEKIT|S3|AWS|REDIS|TURN|DATABASE|QUOTA|HLS|CDN|DEPLOYMENT|HOSTING|PUBLIC|TOKEN|WEBHOOK|STUN|POSTGRES|MINIO|TENANT)'
} | ForEach-Object {
  $n = $_.Name
  $v = if ($n -match 'SECRET|PASSWORD|TOKEN|KEY|DATABASE_URL|CREDENTIAL') { '***' } else { $_.Value }
  "$n=$v"
}
```

Paste the output into chat.

### B — File path on the machine

If the redacted file is already on disk (e.g. `C:\Projects\softqraft-realtime-media\deploy\compose\.env.redacted`), say the path; the agent can read it.

### C — Do not

- Do not share `.env` with real secrets  
- Do not share LiveKit/API/S3/DB passwords unredacted  
- Do not commit live VPC env into git  

---

## Gateway code expects (`loadConfig` + related)

Source of truth: `services/gateway-api/src/config.ts`.

### Core Gateway

| Variable | Required | Default | Role |
|----------|----------|---------|------|
| `GATEWAY_HOST` | no | `0.0.0.0` | Bind host |
| `GATEWAY_PORT` | no | `8080` | Bind port |
| `GATEWAY_SERVICE_API_KEYS` | no | `dev-local-key` | Legacy unscoped service keys (comma) |
| `GATEWAY_TENANTS` | no | empty | `tenantId:apiKey:maxSessions:maxEgress` CSV |
| `GATEWAY_ADMIN_TOKEN` | for admin | empty | Admin console bearer; empty disables admin API |
| `PUBLIC_GATEWAY_URL` | prod | empty | Public HTTPS base for Admin meta/snippets |
| `TENANT_STORE_PATH` | no | `./data/tenants.json` | Hashed credential store (v2) |

### LiveKit

| Variable | Required | Default | Role |
|----------|----------|---------|------|
| `LIVEKIT_URL` | yes* | `http://localhost:7880` | Server SDK HTTP base (Compose: `http://livekit:7880`) |
| `LIVEKIT_REALTIME_URL` | clients | derived from LIVEKIT_URL | WSS/WS returned to browsers |
| `LIVEKIT_API_KEY` | yes* | `softqraft_dev_key` | Must match `livekit.yaml` keys |
| `LIVEKIT_API_SECRET` | yes* | dev secret | Must match `livekit.yaml` keys |

\*Required for real media; defaults only work for local compose.

### Redis / durable state

| Variable | Required | Default | Role |
|----------|----------|---------|------|
| `REDIS_URL` | quotas/redis | `redis://localhost:6379` | Quotas + LiveKit redis |
| `DATABASE_URL` | durable sessions | empty | Postgres; empty = memory store |
| `QUOTA_BACKEND` | no | `auto` | `memory` \| `redis` \| `auto` (auto→redis if DATABASE_URL) |

### Object storage (Egress / HLS)

| Variable | Aliases | Role |
|----------|---------|------|
| `S3_BUCKET_NAME` | `LIVEKIT_EGRESS_S3_BUCKET` | Bucket |
| `AWS_ACCESS_KEY_ID` | `LIVEKIT_EGRESS_S3_ACCESS_KEY` | Access key |
| `AWS_SECRET_ACCESS_KEY` | `LIVEKIT_EGRESS_S3_SECRET` | Secret |
| `AWS_REGION` | `LIVEKIT_EGRESS_S3_REGION` | Region (default `us-east-1`) |
| `S3_ENDPOINT` | `LIVEKIT_EGRESS_S3_ENDPOINT` | MinIO/custom endpoint |
| `S3_FORCE_PATH_STYLE` | `LIVEKIT_EGRESS_S3_FORCE_PATH_STYLE` | Path-style (true for MinIO) |
| `RECORDING_KEY_TEMPLATE` | | MP4 key template |
| `HLS_KEY_TEMPLATE` | | HLS prefix template |
| `HLS_PUBLIC_BASE_URL` | | Playlist origin base |
| `CDN_PUBLIC_BASE_URL` | | Optional CDN base |

S3 is **optional** for interactive-only; required for Echo/HLS egress.

### TURN / ICE

| Variable | Default | Role |
|----------|---------|------|
| `STUN_URLS` | Google STUN | Comma-separated |
| `TURN_ENABLED` | false | If true or `TURN_HOST` set, build TURN iceServers |
| `TURN_HOST` | | Host clients reach |
| `TURN_PORT` | `3478` | |
| `TURN_USERNAME` / `TURN_PASSWORD` | softqraft / softqraftturn | Static creds (pilot) |
| `TURN_URLS` | | Override full TURN URL list |

Compose coturn also: `TURN_REALM`, `TURN_EXTERNAL_IP` (not read by Gateway; coturn only).

### Product / ops

| Variable | Default | Role |
|----------|---------|------|
| `DEPLOYMENT_PLANE` | `demo` | `demo` \| `economic_production` |
| `HOSTING_COST_CLASS` | `unknown` | cost honesty |
| `TOKEN_TTL_SECONDS` | `600` | Participant JWT TTL |
| `WEBHOOK_FORWARD_URLS` | empty | Comma-separated consumer webhook URLs |

### Compose-only (not Gateway `loadConfig`)

| Variable | Used by |
|----------|---------|
| `POSTGRES_USER` / `POSTGRES_PASSWORD` / `POSTGRES_DB` | postgres service |
| `MINIO_ROOT_USER` / `MINIO_ROOT_PASSWORD` | minio / minio-init |
| `EGRESS_CONFIG_FILE` | egress container (fixed in compose) |

### Consumer SDK (integrating apps, not Gateway)

| Variable | Role |
|----------|------|
| `SOFTQRAFT_GATEWAY_URL` | App → Gateway base |
| `SOFTQRAFT_API_KEY` | Tenant key from Admin |

### LiveKit server config (file, not process env)

`deploy/docker/livekit/livekit.yaml`:

- `keys:` must match `LIVEKIT_API_KEY` / `LIVEKIT_API_SECRET`
- `webhook.urls:` → `http://gateway:8080/v1/webhooks/livekit` (or public HTTPS in VPC)
- `redis.address`, `rtc.node_ip`

---

## Gap analysis: `media.env.example` vs code

| Code expects | In `media.env.example` | In Compose gateway `environment` | Notes |
|--------------|------------------------|-----------------------------------|--------|
| `GATEWAY_*` core | yes | yes | OK |
| `GATEWAY_ADMIN_TOKEN` | commented | yes (optional) | **Set on VPC** for Admin |
| `PUBLIC_GATEWAY_URL` | commented | yes | **Set on VPC** to https://media… |
| `TENANT_STORE_PATH` | commented | hard-coded `/data/tenants.json` | OK in Compose |
| `DATABASE_URL` | commented | default postgres URL | OK in Compose |
| `QUOTA_BACKEND` | commented | `redis` | OK |
| `LIVEKIT_*` | yes | yes | Keys must match yaml |
| `REDIS_URL` | yes | hard-coded redis | OK |
| S3 / AWS* | yes | yes | |
| HLS / CDN | yes | yes | |
| TURN_* | yes | yes | **TURN_HOST must be public IP/DNS on VPC** |
| `STUN_URLS` | **missing** | **missing** | Optional; has default |
| `TOKEN_TTL_SECONDS` | **missing** | **missing** | Optional; default 600 |
| `WEBHOOK_FORWARD_URLS` | commented | yes | |
| `DEPLOYMENT_PLANE` / `HOSTING_COST_CLASS` | yes | yes | VPC demo: set class honestly |
| LiveKit egress aliases | **missing** | no | Only needed if using LIVEKIT_EGRESS_S3_* names |
| `SOFTQRAFT_*` | n/a | n/a | Consumer app only |

### Gaps to fix on VPC (checklist)

1. **`LIVEKIT_REALTIME_URL`** = public `wss://realtime…` (not `ws://localhost`)  
2. **`PUBLIC_GATEWAY_URL`** = `https://media…`  
3. **`GATEWAY_ADMIN_TOKEN`** = long random (Admin)  
4. **`TURN_HOST` / `TURN_EXTERNAL_IP`** = public IP or DNS clients can reach  
5. **`LIVEKIT_API_KEY` / `SECRET`** match `livekit.yaml` (rotated secrets)  
6. **`webhook.urls`** in livekit.yaml = reachable Gateway (`https://media…/v1/webhooks/livekit` or internal)  
7. **`DATABASE_URL` / `REDIS_URL`** reachable from Gateway container  
8. **`DEPLOYMENT_PLANE=demo`** + `HOSTING_COST_CLASS=hyperscaler_list_egress` if still on GCP  
9. **`TENANT_STORE_PATH`** on persistent volume (Compose: `/data`)  
10. S3/MinIO only if Echo/HLS enabled  

---

## Stop point

| Hardening # | Status |
|-------------|--------|
| 1–6 | Done (image, room isolation, Postgres, Redis quotas, webhooks reconcile, credential hash) |
| **7** | **Stop / next** — real tests + lint expansion |
| 8–10 | Not started |

When resuming: continue from **#7**.

## Live VPC audit

See [vpc-env-audit.md](vpc-env-audit.md) (2026-08-05 operator dump).  
Clean template: [vpc-gcp-demo.env.example](../../deploy/env/vpc-gcp-demo.env.example).
