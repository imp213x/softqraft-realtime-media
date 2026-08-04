# Admin Console — API credentials

**URL (local):** `http://localhost:8080/admin/`  
**URL (prod):** `https://media.softqraftlabs.com/admin/`

## Purpose

- Generate **tenant API keys** for integrating apps  
- List / revoke credentials  
- Show public Gateway + realtime endpoints for copy-paste integration  

## Auth

- Header: `Authorization: Bearer <GATEWAY_ADMIN_TOKEN>`  
- Or paste admin token in the UI (stored in `sessionStorage` only)  
- Env: `GATEWAY_ADMIN_TOKEN` (required for admin routes; generate a long random string)

## Storage

- Dynamic credentials: JSON file (`TENANT_STORE_PATH`, default `./data/tenants.json`)  
- Env `GATEWAY_TENANTS` / `GATEWAY_SERVICE_API_KEYS` still load at boot (bootstrap)  
- File-backed keys survive Gateway restarts (same volume/path)

## API

| Method | Path | Body |
|--------|------|------|
| `GET` | `/admin/v1/meta` | — public base URLs |
| `GET` | `/admin/v1/credentials` | list (secrets masked) |
| `POST` | `/admin/v1/credentials` | `{ tenantId, maxSessions?, maxEgress?, label? }` → returns **full apiKey once** |
| `DELETE` | `/admin/v1/credentials/:tenantId` | revoke |

## Integration after create

```http
POST https://media.softqraftlabs.com/v1/sessions
Authorization: Bearer <apiKey from create response>
```

```http
POST https://media.softqraftlabs.com/v1/sessions/{sessionId}/tokens
Authorization: Bearer <apiKey>
{ "identity": "host-1", "role": "host" }
```

Client: LiveKit SDK → `realtimeUrl` + `token` (+ `iceServers` if returned).

## Security

- Never commit `GATEWAY_ADMIN_TOKEN` or `tenants.json`  
- Show full API key **only at creation**  
- Put Admin behind TLS (prod)  
- Optionally restrict `/admin` by IP later  
