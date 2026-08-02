# ADR-003: HTTP Gateway as the Clatters integration boundary

| Field | Value |
|-------|--------|
| **Status** | Accepted |
| **Date** | 2026-08-02 |
| **Context** | Platform must be pluggable via API / HTTP; Clatters must be able to drop managed stack cleanly |

## Decision

Expose a versioned **Gateway HTTP API** (`services/gateway-api`) as the **only** surface Clatters application servers need for orchestration:

- Create / end live sessions (maps to LiveKit rooms)  
- Mint participant tokens (publish / subscribe grants)  
- Start / stop / query Egress jobs  
- Resolve playback URLs (HLS) and realtime URLs (LiveKit)  
- Health and readiness for cutover  

Media clients continue to use **LiveKit SDKs** against the self-hosted SFU WebSocket URL returned by the Gateway (or config). Clatters must **not** embed LiveKit API secrets in mobile apps.

## Rationale

- Clean swap: Clatters points at Gateway base URL + service credentials.  
- Hides Redis, Egress internals, storage credentials, CDN signing.  
- Allows future origin changes (MediaMTX, multi-region) without rewriting Clatters.  
- Professional multi-tenant-ready shape even if Clatters is the first tenant.

## API design principles

1. **Versioned** (`/v1/...`)  
2. **Idempotent** where practical (create show with client `idempotency_key`)  
3. **Least privilege tokens** (host vs co-host vs audience-realtime vs none for pure HLS)  
4. **Observable** (request IDs, structured logs, job status resources)  
5. **LiveKit-shaped concepts** where they reduce migration friction (`room`, `identity`, `grants`) without leaking Cloud-only features  

## Consequences

- Gateway is a critical production service (HA later).  
- OpenAPI is the contract source of truth.  
- Direct LiveKit RoomService access from Clatters is discouraged except break-glass ops.
