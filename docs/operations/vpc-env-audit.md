# VPC env audit (GCP demo) — 2026-08-05

**Source:** Redacted `deploy/compose/.env` + `docker compose exec gateway env` names from operator.  
**Stop point:** Hardening #7 (tests) still next; this is env alignment only.

---

## Executive findings

| Severity | Finding |
|----------|---------|
| **P0** | `.env` has **duplicate keys**; later values override earlier ones unpredictably for humans. |
| **P0** | Compose previously **hardcoded `S3_ENDPOINT=http://minio:9000`**, so R2 in `.env` never reached Gateway. **Fixed in repo** — pull + recreate gateway. |
| **P0** | Gateway container env list **missing** `DATABASE_URL`, `QUOTA_BACKEND`, `TENANT_STORE_PATH`, `GATEWAY_ADMIN_TOKEN`, `PUBLIC_GATEWAY_URL`, `DEPLOYMENT_PLANE`, `HOSTING_COST_CLASS` → image/compose on VPC is **stale** vs current monorepo. |
| **P0** | `livekit.yaml` webhook grep returned **empty** on VM → webhooks (room_finished / egress quota) **not configured** on that host. |
| **P1** | Early `LIVEKIT_REALTIME_URL=ws://IP:7880` conflicts with later `wss://realtime…` (keep only WSS). |
| **P1** | Early `REDIS_URL=redis://localhost:6379` wrong for in-container Gateway (Compose should force `redis://redis:6379`). |
| **P1** | Early `TURN_HOST=127.0.0.1` then later public IP — keep **only** public. |
| **P2** | `GATEWAY_ADMIN_TOKEN` / `PUBLIC_GATEWAY_URL` not set → Admin + snippets incomplete. |
| **P2** | Plane cost honesty not set → treat as demo + hyperscaler. |

---

## Duplicate / conflict map (your dump)

| Variable | First value | Later value | Keep |
|----------|-------------|-------------|------|
| `LIVEKIT_REALTIME_URL` | `ws://34.60.190.142:7880` | `wss://realtime.softqraftlabs.com` | **WSS domain** |
| `REDIS_URL` | `redis://redis:6379` | `redis://localhost:6379` | **redis hostname** (Compose) |
| `LIVEKIT_URL` | `http://34.60.190.142:7880` | (none later) | Compose forces `http://livekit:7880` |
| `TURN_HOST` | `127.0.0.1` | `34.60.190.142` | **Public IP** |
| S3 / HLS | MinIO localhost | R2 + r2.dev | **R2 block only** |

Rule: **one assignment per key** in `.env`.

---

## Gateway process env vs code

| Expected by `loadConfig` | In redacted `.env` | In running gateway env names | Action |
|--------------------------|--------------------|------------------------------|--------|
| `GATEWAY_*` | partial | partial | Add admin + public URL |
| `LIVEKIT_URL` | host IP (wrong for container) | present | Compose override OK if current compose |
| `LIVEKIT_REALTIME_URL` | duplicated | present | Single WSS value |
| `LIVEKIT_API_KEY/SECRET` | set | present | Match livekit.yaml |
| `REDIS_URL` | conflict | present | Compose → `redis://redis:6379` |
| `DATABASE_URL` | set in .env | **absent** | Pull compose + recreate |
| `QUOTA_BACKEND` | set | **absent** | same |
| `TENANT_STORE_PATH` | set | **absent** | same |
| `GATEWAY_ADMIN_TOKEN` | **missing** | **absent** | Set + recreate |
| `PUBLIC_GATEWAY_URL` | **missing** | **absent** | Set https://media… |
| `DEPLOYMENT_PLANE` | **missing** | **absent** | `demo` |
| `HOSTING_COST_CLASS` | **missing** | **absent** | `hyperscaler_list_egress` |
| S3 / R2 | set (last wins) | present | After compose fix, R2 applies |
| TURN public | last wins OK | present | Drop 127.0.0.1 block |
| `TOKEN_TTL_SECONDS` | missing | absent | optional |
| `STUN_URLS` | missing | absent | optional |
| `WEBHOOK_FORWARD_URLS` | empty | present empty | OK |

---

## LiveKit webhook

Repo expects (`deploy/docker/livekit/livekit.yaml`):

```yaml
webhook:
  api_key: <same as LIVEKIT_API_KEY>
  urls:
    - http://gateway:8080/v1/webhooks/livekit
```

VM grep printed **nothing** → on the server, either:

- file path differs, or  
- `webhook:` section removed/never deployed.

**Fix on VM:** restore webhook block; `api_key` must equal active LiveKit API key; recreate livekit.

Also set `rtc.node_ip` to **public IP** `34.60.190.142` (repo sample still has LAN `192.168.1.131`).

---

## Fix once (operator steps)

```bash
cd ~/softqraft-realtime-media
git pull   # get compose S3_ENDPOINT fix + env template

cd deploy/compose
cp ../../deploy/env/vpc-gcp-demo.env.example .env
# edit .env: fill secrets, single LIVEKIT_REALTIME_URL=wss://…, R2, TURN public, admin token

# livekit.yaml on VM
# - keys match LIVEKIT_API_KEY/SECRET
# - node_ip: 34.60.190.142
# - webhook.urls: [http://gateway:8080/v1/webhooks/livekit]

docker compose up -d --build gateway
docker compose up -d livekit   # if yaml changed

# verify
docker compose exec gateway env | sort
# must include: DATABASE_URL QUOTA_BACKEND TENANT_STORE_PATH GATEWAY_ADMIN_TOKEN
#               PUBLIC_GATEWAY_URL S3_ENDPOINT (r2 host) LIVEKIT_REALTIME_URL (wss)
docker compose exec gateway wget -qO- http://127.0.0.1:8080/ready || true
```

Canonical template: [vpc-gcp-demo.env.example](../../deploy/env/vpc-gcp-demo.env.example).

---

## False redactionsactions (sed)

`RECORDING_KEY_TEMPLATE` / `HLS_KEY_TEMPLATE` matched `KEY` — not secrets. Safe to leave as path templates in `.env`.
