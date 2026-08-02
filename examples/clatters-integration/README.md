# Example: Clatters / The_Scholar consumer

**Phase:** SoftQraft Phase 1 ✅ · Phase 2 dual-run 🔄 (see [phase-2-checklist.md](../../docs/operations/phase-2-checklist.md))

SoftQraft Realtime Media is **app-agnostic**. This folder only documents how **Clatters** plugs in.

| Doc | Purpose |
|-----|---------|
| [env.dual-run.example](./env.dual-run.example) | Clatters env for self-host dual-run |
| [role-mapping.md](./role-mapping.md) | Nest roles → Gateway roles |
| [../../docs/integration/consumers/the-scholar-clatters-inventory.md](../../docs/integration/consumers/the-scholar-clatters-inventory.md) | Production inventory |
| [../../docs/operations/phase-2-dual-run.md](../../docs/operations/phase-2-dual-run.md) | Dual-run runbook |

## Fastest path (recommended first) — **local MinIO, no prod S3**

1. SoftQraft Compose up (LiveKit + Egress + MinIO).  
2. Clatters local env from [env.local-minio.example](./env.local-minio.example).  
3. SoftQraft `WEBHOOK_FORWARD_URLS` → Clatters `:3000` webhook.  
4. Two local users → Go Live + watch + Echo in MinIO `live-echo/…`.  

Full guide: [../../docs/operations/local-clatters-dual-run.md](../../docs/operations/local-clatters-dual-run.md)

## Later (not first)

- Staging SoftQraft + **non-prod** bucket  
- Production AWS `thescholar-uploads` only when intentional ([env.dual-run.example](./env.dual-run.example))

## Do not

- Point local dual-run at the **production** S3 bucket  
- Put LiveKit API secrets in mobile apps  
- Change Nest/Echo domain models inside SoftQraft core
