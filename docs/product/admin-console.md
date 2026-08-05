# Admin Console — API credentials

**URL (local):** `http://localhost:8080/admin/`  
**URL (prod demo):** `https://media.softqraftlabs.com/admin/`  
**Credential store:** v2 hashed (hardening #6)

## Purpose

- Generate **tenant API keys** for integrating apps  
- Multi-key, rotate, revoke  
- Audit trail of credential events  
- Public Gateway + realtime endpoints  
- Deployment plane + usage (ADR-009)

## Auth

- Header: `Authorization: Bearer <GATEWAY_ADMIN_TOKEN>`  
- UI stores token in `sessionStorage` only  
- Env: `GATEWAY_ADMIN_TOKEN` (required; long random string)

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
| `DELETE` | `/admin/v1/credentials/:tenantId/keys/:keyId` | Revoke one key |
| `DELETE` | `/admin/v1/credentials/:tenantId` | Revoke all keys |
| `DELETE` | `/admin/v1/credentials/:tenantId?hard=1` | Delete tenant + keys from store |

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

## Security posture (after #6)

| Done | Still not production-IAM |
|------|---------------------------|
| Hashed keys on disk | No MFA / multi-admin users |
| Multi-key + rotation | No rate limit / IP allowlist on `/admin` |
| Audit log (file) | No external SIEM export |
| Compose volume for data | Admin is still one static bearer |
| Atomic file write | Prefer KMS / secret manager later |

## Related

- [durable-state.md](../operations/durable-state.md)  
- [platform-maturity-assessment.md](../operations/platform-maturity-assessment.md) §5  
- [hardening-engineering-order.md](../roadmap/hardening-engineering-order.md)  
