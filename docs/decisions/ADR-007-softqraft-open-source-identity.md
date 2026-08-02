# ADR-007: SoftQraft Labs open-source product identity

| Field | Value |
|-------|--------|
| **Status** | Accepted |
| **Date** | 2026-08-02 |
| **Context** | Platform may be open-sourced; must not be branded as a single app (Clatters) |

## Decision

| Item | Value |
|------|--------|
| **Organization** | SoftQraft Labs Ltd. |
| **Product name** | **SoftQraft Realtime Media** |
| **Short name** | **SQRM** (optional in ops) |
| **npm / package scope** | `@softqraft/*` |
| **Root package** | `@softqraft/realtime-media` |
| **Gateway package** | `@softqraft/gateway-api` |
| **Shared package** | `@softqraft/shared` |
| **Compose project** | `softqraft-realtime-media` |
| **Default license** | MIT (see `LICENSE`) |

## Naming rules

1. Public docs and code use **SoftQraft** / **SoftQraft Realtime Media**, not Clatters, as the product name.  
2. Clatters / The_Scholar appear only as **consumer examples** under `docs/integration/consumers/` and `examples/`.  
3. Avoid trademarks of third-party apps in package names.  
4. LiveKit remains an upstream dependency name where technically accurate.

## Supersedes

- Temporary `@clatters-media/*` scope mentioned in ADR-005 (rename executed).
