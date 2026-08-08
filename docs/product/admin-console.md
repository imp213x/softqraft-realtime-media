# Admin Console — public operator UI

**URL (local):** `http://localhost:8080/admin/`  
**URL (economic / public):** `https://media.softqraftlabs.com/admin/`  
**Credential store:** v2 hashed (hardening #6)  
**Phase:** S1–S2 public shell — [cto-next-phase-decision.md](cto-next-phase-decision.md)

## Purpose

Operator product for SoftQraft Realtime Media (not a consumer live-show UI):

- Sign in (email/password session) · break-glass token secondary  
- **Navigate:** Overview · Credentials · Usage · Audit · Integrate  
- Generate **tenant API keys** for integrating apps  
- Multi-key, rotate, revoke · audit trail  
- Public Gateway + realtime endpoints · plane honesty (ADR-009)  
- Health/ready utility

## Auth (P0.5)

| Mode | How |
|------|-----|
| **Password (preferred)** | Email + password → HttpOnly cookie `sq_admin_session` |
| **Bootstrap (first owner)** | No operators yet → bootstrap token + email + password |
| **Break-glass** | `Authorization: Bearer GATEWAY_ADMIN_TOKEN` (env; optional in UI) |

- `POST /admin/v1/auth/login` · `logout` · `me` · `bootstrap` · `GET /auth/status`  
- Design: [admin-auth-design.md](admin-auth-design.md)
## Storage (v2)

| Concern | Behavior |
|---------|----------|
| Path | `TENANT_STORE_PATH` (default `./data/tenants.json`; Compose `/data/tenants.json` **volume**) |
| Secrets | **SHA-256 hash only** — plaintext shown **once** at create/rotate |
| Key format | `sqk_{keyId}.{secret}` (O(1) lookup by `keyId`) |
| Multi-key | Multiple active keys per tenant supported |
| Rotation | New key + revoke previous active keys |
| Expiry | Optional `expiresAt` ISO timestamp |
| Audit | Last 500 events in the same file |
| Env bootstrap | `GATEWAY_TENANTS` / `GATEWAY_SERVICE_API_KEYS` still work (in-memory; not file-managed) |
| Migration | v1 plaintext files auto-migrate to v2 hashes on load (old plaintext still validates until rotated) |

Atomic write: temp file + rename.

## Plane env

| Env | Values |
|-----|--------|
| `DEPLOYMENT_PLANE` | `demo` · `economic_production` |
| `HOSTING_COST_CLASS` | `unknown` · `hyperscaler_list_egress` · `bandwidth_cheap` |

## API

| Method | Path | Description |
|--------|------|-------------|
| `GET` | `/admin/v1/meta` | URLs, plane, credential store meta |
| `GET` | `/admin/v1/usage` | Usage since process start |
| `GET` | `/admin/v1/audit` | Audit events (`?limit=50`) |
| `GET` | `/admin/v1/credentials` | `items` (flat) + `tenants` (keys + status) |
| `POST` | `/admin/v1/credentials` | Create tenant + first key → **apiKey once** |
| `PATCH` | `/admin/v1/credentials/:tenantId` | Update label / quotas |
| `POST` | `/admin/v1/credentials/:tenantId/keys` | Add key (no revoke) |
| `POST` | `/admin/v1/credentials/:tenantId/rotate` | New key + revoke previous |
| `DELETE` | `/admin/v1/credentials/:tenantId/keys/:keyId` | Soft-revoke one key (row stays as revoked) |
| `DELETE` | `/admin/v1/credentials/:tenantId/keys/:keyId?hard=1` | **Delete one key** from store |
| `DELETE` | `/admin/v1/credentials/:tenantId` | Soft-revoke all keys (tenant row remains) |
| `DELETE` | `/admin/v1/credentials/:tenantId?hard=1` | Delete tenant + all keys — **does not clear Usage** |

**UI (Credentials):** each key has **Delete key**; tenant Actions show **Rotate · Add key · Delete tenant** (no dual Revoke buttons). Env-bootstrap tenants: edit `GATEWAY_TENANTS` / `GATEWAY_SERVICE_API_KEYS`. Usage is **file-persisted** (`USAGE_STORE_PATH`, default `/data/usage.json`) and can rebuild from Postgres sessions after a wipe.

### Create response (once)

```json
{
  "tenantId": "my-app",
  "keyId": "key_…",
  "apiKey": "sqk_key_….secret",
  "maxSessions": 50,
  "maxEgress": 10,
  "warning": "Store apiKey now — it is shown once and stored as SHA-256 only"
}
```

## Integration

```http
POST https://media.softqraftlabs.com/v1/sessions
Authorization: Bearer sqk_key_….secret
```

## Credential hygiene (UI)

| Control | Behaviour |
|---------|-----------|
| **Rotate** | Mints new key; **revokes previous active keys** (preferred daily hygiene) |
| **Add key** | Extra active key (multi-key) without revoking others |
| **Revoke key** | Soft-revoke one `keyId` (API `DELETE …/keys/:keyId`) |
| **Revoke all** | Soft-revoke every key on the tenant |
| **Delete tenant** | Hard-delete tenant + keys from store (`?hard=1`) — irreversible |

Prefer **Rotate** over Delete for production tenants that still need a working key.

## Security posture (after #6)

| Done | Still not production-IAM |
|------|---------------------------|
| Hashed keys on disk | No MFA / multi-admin users |
| Multi-key + rotation + per-key revoke + hard delete UI | No rate limit / IP allowlist on `/admin` |
| Audit log (file) | No external SIEM export |
| Compose volume for data | Prefer KMS / secret manager later |
| Atomic file write | |

## Related

- [durable-state.md](../operations/durable-state.md)  
- [platform-maturity-assessment.md](../operations/platform-maturity-assessment.md) §5  
- [hardening-engineering-order.md](../roadmap/hardening-engineering-order.md)  
