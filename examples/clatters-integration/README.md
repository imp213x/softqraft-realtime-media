# Example: Clatters / The_Scholar consumer

SoftQraft Realtime Media is **app-agnostic**. This folder only documents how **Clatters** plugs in.

| Doc | Purpose |
|-----|---------|
| [env.dual-run.example](./env.dual-run.example) | Clatters env for self-host dual-run |
| [role-mapping.md](./role-mapping.md) | Nest roles → Gateway roles |
| [../../docs/integration/consumers/the-scholar-clatters-inventory.md](../../docs/integration/consumers/the-scholar-clatters-inventory.md) | Production inventory |
| [../../docs/operations/phase-2-dual-run.md](../../docs/operations/phase-2-dual-run.md) | Dual-run runbook |

## Fastest path (recommended first)

1. Run SoftQraft Compose (or production VMs).  
2. Configure SoftQraft Egress/Gateway S3 → **same AWS bucket** as Clatters Echo.  
3. Set Clatters `LIVEKIT_URL` + API key/secret to SoftQraft.  
4. Forward webhooks: SoftQraft Gateway `WEBHOOK_FORWARD_URLS` → Clatters `/api/livekit/egress-webhook`.  
5. Dogfood Live on staging; then % cutover.

## Do not

- Put LiveKit API secrets in mobile apps  
- Change Nest/Echo domain models inside SoftQraft core  
- Move Echo off AWS in the same cutover as realtime (unless intentional)  
