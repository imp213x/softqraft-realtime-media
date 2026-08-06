# Next steps handoff (2026-08-06)

**Audience:** Continue work from any machine after `git pull`.  
**Branch:** `main`  
**Stop / resume:** Hardening **#7** (tests/lint) after optional product polish; **Hetzner economic plane** is the main infra track.

---

## 1. Current production demo (GCP) — working

| Item | Status |
|------|--------|
| Host | GCP VM (ephemeral external IP — **use static IP** when possible) |
| Last known public IP | Check live: instance metadata / DNS (was `35.224.17.127`; **do not assume forever**) |
| Gateway | Prebuilt image `softqraft-realtime-media-gateway:prebuilt` (host `pnpm` build — Docker DNS to npm often fails) |
| `/health` `/ready` | OK (LiveKit, Redis, Postgres, S3/R2) |
| Admin | `https://media.softqraftlabs.com/admin/` |
| Realtime | `wss://realtime.softqraftlabs.com` |
| Plane | `DEPLOYMENT_PLANE=demo` · `HOSTING_COST_CLASS=hyperscaler_list_egress` |
| Cost banner | Correct: **do not market Cloud savings on GCP** (ADR-009) |
| Credentials | v2 hashed store on volume `/data/tenants.json`; rotate/add/revoke work |
| Webhooks | LiveKit → `http://gateway:8080/v1/webhooks/livekit` in `livekit.yaml` |
| Build path | `./deploy/scripts/build-gateway-host.sh` then compose **without** monorepo npm-in-Docker |

### GCP ops notes (learned the hard way)

1. **Do not** `docker compose build` gateway with full Dockerfile (npm `EAI_AGAIN` inside BuildKit).  
2. **Do** host build + `Dockerfile.prebuilt`.  
3. **Postgres password:** only applied on empty volume; change `.env` requires volume reset or matching old password.  
4. **Ephemeral IP changes** break DNS/TURN/`node_ip` — reserve **static** external IP.  
5. DNS: `media` + `realtime` A records must match current IP (Namecheap + flush local DNS).  
6. Firewall: allow **tcp 80, 443** to the VM (Console admin; VM SA often cannot create rules).  
7. Caddy on host: `media` → `127.0.0.1:8080`, `realtime` → LiveKit `7880`.  
8. Credential store: `/data` must be writable by gateway process.

### Sensitive files on GCP (not in git)

| Path | Content |
|------|---------|
| `deploy/compose/.env` | All secrets |
| `deploy/docker/livekit/livekit.yaml` | keys, `node_ip`, webhook |
| `deploy/docker/egress/egress.yaml` | LiveKit key/secret |
| Docker volume `gateway_data` | `tenants.json` (hashes + audit) |
| Docker volume `postgres_data` | sessions |

Before destroying the GCP VM: **backup** `.env`, yaml, and export/copy tenants if needed.

---

## 2. Hetzner economic production plane (next infra)

**Server:** Ubuntu 24.04, CX33-class (~£12/mo, 8 GB RAM / 20 GB disk) — suitable for **`economic_production` + `bandwidth_cheap`**.

### Why this justifies cost claims (ADR-009)

| | GCP (demo) | Hetzner CX33 |
|--|------------|--------------|
| Plane | `demo` | `economic_production` |
| Cost class | `hyperscaler_list_egress` | `bandwidth_cheap` |
| Market vs LiveKit Cloud $/GB | No | Yes for moderate WebRTC (included/cheap traffic) |
| 1k–10k passive audience | Still need hybrid HLS+CDN | Same |

Do **not** flip plane flags until **media + TURN + DNS** actually serve from Hetzner.

### Hetzner bring-up checklist

1. **Static (or reserved) IPv4** on Hetzner; note IP.  
2. **DNS** (Namecheap): `media` + `realtime` A → Hetzner IP (or dual-run with temporary hostnames first).  
3. **Firewall** (Hetzner Cloud Firewall + ufw):  
   - tcp 22, 80, 443  
   - tcp 7880–7881, udp 7882 (LiveKit)  
   - tcp/udp 3478, udp TURN relay range (coturn)  
4. Install: Docker, Docker Compose, Caddy (or Traefik), git.  
5. Clone repo, copy env from template:  
   - `deploy/env/vpc-gcp-demo.env.example` as baseline  
   - Or `docs/operations/env-inventory.md` full matrix  
6. Set:
   ```bash
   DEPLOYMENT_PLANE=economic_production
   HOSTING_COST_CLASS=bandwidth_cheap
   PUBLIC_GATEWAY_URL=https://media.softqraftlabs.com
   LIVEKIT_REALTIME_URL=wss://realtime.softqraftlabs.com
   TURN_HOST=<hetzner-ip>
   TURN_EXTERNAL_IP=<hetzner-ip>
   # LIVEKIT node_ip in livekit.yaml = same IP
   ```
7. **Host gateway build** (if Docker npm DNS fails, same as GCP):  
   `./deploy/scripts/build-gateway-host.sh`  
8. Compose: postgres, redis, livekit, coturn, gateway (prebuilt), egress as needed.  
9. Caddy TLS for media + realtime.  
10. Point LiveKit webhook → `http://gateway:8080/v1/webhooks/livekit`.  
11. Smoke: `/health`, `/ready`, Admin unlock, create key, one session.  
12. **Cutover:** DNS TTL low → switch A records → verify → decommission or demote GCP to pure lab.  
13. Only then treat cost marketing as valid.

### Dual-run (recommended)

| Phase | media/realtime DNS | Plane flags on that host |
|-------|--------------------|---------------------------|
| Now | GCP | `demo` / `hyperscaler_list_egress` |
| Parallel | Optional `media-hetzner…` test hostnames | economic on Hetzner only |
| Cutover | Namecheap → Hetzner IP | economic on Hetzner; GCP off or demo-only |

---

## 3. Product / engineering backlog

### P0 / soon (product)

| Item | Notes |
|------|--------|
| **Delete API key** in Admin UI | Soft-delete already via revoke; add explicit **Delete** control + hard delete (`?hard=1` exists for tenant). Prefer: delete single key row + confirm. |
| Admin UX polish | Surface API errors (400 persist/permission) in UI banner, not only Network 500. |
| Document public integration snippets | Already in Admin; keep env copy-paste accurate. |

### Hardening order (resume)

| # | Work | Status |
|--:|------|--------|
| 1–6 | Image pin, room isolation, Postgres, Redis quotas, webhooks, hashed creds | ✅ Done (code + demo deploy) |
| **7** | Real unit/integration tests + lint (not placeholders) | ⏸ **Next code track** |
| 8 | Full `/ready` (S3 R/W probe) + Prometheus/OTel | ⏳ |
| 9 | TURN/TLS + time-limited TURN credentials | ⏳ |
| 10 | Load/soak before any 10k claim | ⏳ |

### Hetzner / cost track (parallel)

| Item | Status |
|------|--------|
| Hetzner account + CX33 provisioned | ✅ Operator |
| SoftQraft install on Hetzner | ⏳ Next infra |
| DNS + static IP + cutover | ⏳ |
| Flip plane flags / cost banner | ⏳ After cutover |

### Deferred

- Clatters dual-run (not rushed)  
- Full `@softqraft/sdk` publish to npm  
- Echo-heavy product (optional)  
- Multi-region  

---

## 4. Continue on laptop (Grok / local clone)

```bash
cd /path/to/softqraft-realtime-media   # e.g. C:\Projects\softqraft-realtime-media
git pull origin main
git log -1 --oneline
# should be at least 83079b7 / 20a5070 / handoff commit

pnpm install
pnpm --filter @softqraft/shared build
pnpm --filter @softqraft/gateway-api test
```

### Suggested first coding tasks (pick one)

1. **Admin: delete API key** — UI button → `DELETE /admin/v1/credentials/:tenantId/keys/:keyId` (exists) + hard-delete option; confirm dialog.  
2. **Hardening #7** — expand tests (Fastify inject, auth, webhooks mocks); real `lint` script.  
3. **Hetzner runbook** — flesh `docs/operations/economic-plane-runbook.md` with Ubuntu 24.04 + CX33 copy-paste.  
4. **S3 ready probe** — HEAD/PUT test object when S3 configured (`/ready`).

### Do not commit

- Real `.env`, live keys, `tenants.json`, production `livekit.yaml` secrets  
- `deploy/docker/gateway/out/` (build artifact)

### Secrets if rotating after chat leaks

Any `sqk_…` pasted in chat → **Rotate** in Admin even if “unused.”

---

## 5. Key doc index

| Doc | Purpose |
|-----|---------|
| [ADR-009](../decisions/ADR-009-cost-planes-and-hosting-posture.md) | Demo vs economic plane |
| [cost-posture-and-planes.md](../operations/cost-posture-and-planes.md) | Cost thesis |
| [env-inventory.md](../operations/env-inventory.md) | All process env |
| [vpc-env-audit.md](../operations/vpc-env-audit.md) | GCP env lessons |
| [durable-state.md](../operations/durable-state.md) | Postgres/Redis/webhooks |
| [economic-plane-runbook.md](../operations/economic-plane-runbook.md) | Cheap-host deploy |
| [hardening-engineering-order.md](hardening-engineering-order.md) | #1–10 status |
| [platform-maturity-assessment.md](../operations/platform-maturity-assessment.md) | Honest maturity |
| [admin-console.md](../product/admin-console.md) | Admin API |

---

## 6. One-page “what good looks like” after Hetzner

- [ ] `curl https://media.softqraftlabs.com/ready` → ready from laptop  
- [ ] Admin plane chip: **economic production** + cost claims allowed  
- [ ] TURN/`node_ip` = Hetzner IP  
- [ ] Session create + browser LiveKit join  
- [ ] GCP either powered down or labeled demo-only  
- [ ] Static IP + documented rebuild path  

---

**Handoff complete.** Pull `main`, then either ship **delete-key UI** / **#7 tests**, or **Hetzner install** per checklist above.
