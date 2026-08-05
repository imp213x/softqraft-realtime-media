# Durable Gateway state (hardening #3–#5)

**Updated:** 2026-08-05  
**Related:** [platform-maturity-assessment.md](platform-maturity-assessment.md) §3–4, [hardening-engineering-order.md](../roadmap/hardening-engineering-order.md)

## What is durable now

| Component | Backend | Env |
|-----------|---------|-----|
| Sessions, idempotency, egress jobs | **PostgreSQL** when `DATABASE_URL` set; else memory | `DATABASE_URL` |
| Concurrent session/egress quotas | **Redis** atomic Lua when `QUOTA_BACKEND=redis` (or `auto` + DB); else memory | `REDIS_URL`, `QUOTA_BACKEND` |
| Admin API keys | JSON file | `TENANT_STORE_PATH` (Compose volume `/data`) |
| LiveKit rooms / media | LiveKit | — |

## Compose

Postgres + Redis + Gateway volume are part of `deploy/compose/docker-compose.yml`.

```bash
# gateway receives:
DATABASE_URL=postgres://softqraft:softqraft@postgres:5432/softqraft_gateway
QUOTA_BACKEND=redis
REDIS_URL=redis://redis:6379
TENANT_STORE_PATH=/data/tenants.json
```

Schema migrates automatically on Gateway boot (`CREATE TABLE IF NOT EXISTS`).

## Host-run (dev)

```bash
# Terminal A — only redis (or full compose without gateway)
docker compose up -d redis postgres

# Terminal B
export DATABASE_URL=postgres://softqraft:softqraft@localhost:5432/softqraft_gateway
export QUOTA_BACKEND=redis
export REDIS_URL=redis://localhost:6379
pnpm dev:gateway
```

Omit `DATABASE_URL` for single-process memory store (not multi-replica safe).

## Quota lifecycle

1. `tryReserveSession` / `tryReserveEgress` **before** LiveKit create (atomic).  
2. On failure after reserve → `release*`.  
3. Session end API → release session + held egress.  
4. **Webhook** `room_finished` → end session + release session quota (emptyTimeout path).  
5. **Webhook** egress terminal → release egress quota if `quotaHeld`.

LiveKit must deliver webhooks to Gateway:

```text
https://<gateway>/v1/webhooks/livekit
```

## `/ready` checks

| Check | When |
|-------|------|
| LiveKit `listRooms` | Always |
| Redis `PING` | When `quotaBackend=redis` |
| Postgres `SELECT 1` | When `storeBackend=postgres` |
| S3 | Config boolean only (still not a write probe) |

## Remaining gaps

- Credential hashing / multi-key (assessment §5)  
- Async durable webhook queue (at-least-once with outbox)  
- Full S3 R/W probe in `/ready`  
- Quota re-hydrate from DB after Redis flush  
