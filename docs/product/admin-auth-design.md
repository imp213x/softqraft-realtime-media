# Admin authentication design (public product)

**Status:** Implemented (phase B dual-mode) — 2026-08-06  
**Auth:** Email + password sessions (HttpOnly cookie) **or** break-glass `GATEWAY_ADMIN_TOKEN`  
**Goal:** Proper sign-in / sign-out suitable for public SoftQraft operators  

## Problem

| Current | Risk for public use |
|---------|---------------------|
| Long-lived token in `.env` | Shared secret, hard to rotate per person |
| Paste into browser | Phishing / shoulder-surf / browser history |
| No sessions / logout | Token stays until tab cleared |
| No roles | One key = full admin |
| No audit of who signed in | Weak compliance |

## Design principles

1. **Never** put LiveKit keys in the browser.  
2. Admin API stays server-side; browser holds only a **short-lived session**.  
3. Bootstrap: first operator from env or one-time setup, then invite others.  
4. Works on single-node economic plane (Postgres already available).  

## Recommended model (v1)

### Operators (DB)

| Field | Notes |
|-------|--------|
| `id` | UUID |
| `email` | login id (unique) |
| `password_hash` | Argon2id / scrypt (not plaintext) |
| `role` | `owner` \| `admin` \| `viewer` (viewer = read-only creds list) |
| `disabled_at` | soft lock |
| `created_at` | |

### Sessions

| Approach | Choice |
|----------|--------|
| Cookie | **HttpOnly + Secure + SameSite=Lax** session cookie |
| Session store | Postgres (or Redis) with expiry |
| TTL | e.g. 8h idle / 24h absolute; refresh optional |
| Logout | DELETE session server-side + clear cookie |

### Login flow

```text
POST /admin/v1/auth/login  { email, password }
  → verify hash
  → create session row
  → Set-Cookie: sq_admin_session=...

GET  /admin/v1/auth/me     (cookie) → { email, role }
POST /admin/v1/auth/logout (cookie) → revoke session
```

All existing `/admin/v1/credentials*` require **valid session** (or temporary dual-mode below).

### Bootstrap (first install)

1. If **no operators** in DB and `GATEWAY_ADMIN_BOOTSTRAP_TOKEN` set:  
   - one-time `POST /admin/v1/auth/bootstrap` with bootstrap token + email + password → creates `owner`  
   - or CLI: `node dist/cli.js create-admin --email …`  
2. After first owner exists, **disable** bootstrap token.  
3. Owner can create more admins (later UI).

### Migration from today

| Phase | Behavior |
|-------|----------|
| **A (now)** | `GATEWAY_ADMIN_TOKEN` Bearer only |
| **B** | Cookie sessions **or** Bearer admin token (compat) |
| **C** | Cookie only; remove paste-token UI; env token = break-glass only |

## UI (Admin console)

- **Login page:** email + password (not “paste raw token”)  
- **Header:** signed-in email + **Log out**  
- **401** → redirect to login  
- Optional: “Forgot password” later (email provider) — not v1  

## Security checklist (public)

- [ ] HTTPS only (already via Caddy)  
- [ ] Rate-limit login (e.g. 5/min/IP)  
- [ ] Lockout after N failures  
- [ ] Password min length + breach check optional  
- [ ] CSRF: SameSite cookie + same-origin Admin SPA  
- [ ] Audit: login success/fail, credential create/revoke (extend existing audit)  
- [ ] Break-glass: `GATEWAY_ADMIN_TOKEN` offline only, not in UI copy  

## Out of scope (v1)

- OAuth / Google / GitHub SSO (v2)  
- MFA TOTP (v2 strongly recommended before large multi-tenant SaaS)  
- Multi-org RBAC beyond owner/admin/viewer  

## Implementation sketch (Gateway)

| Piece | Notes |
|-------|--------|
| Table `admin_operators`, `admin_sessions` | SQL next to `schema.sql` |
| `@fastify/cookie` + secure cookies | |
| Routes under `/admin/v1/auth/*` | |
| Replace token gate in `requireAdmin` | session first, env token fallback in phase B |
| Admin HTML | login form + logout button |

## Effort

| Slice | Rough |
|-------|--------|
| Schema + login/logout API + cookie | 0.5–1 day |
| Admin UI login/logout | 0.5 day |
| Bootstrap + rate limit + audit | 0.5 day |
| MFA / SSO | later |

## Decision

- **Ship now:** Hetzner economic plane + current admin token (operator-only).  
- **Before public multi-operator / customer self-serve admin:** implement this design (phases B→C).  
- **Tracked as:** Product **P0.5 Admin auth** after live cutover smoke.

## Related

- [admin-console.md](admin-console.md)  
- [product-plan.md](product-plan.md)  
