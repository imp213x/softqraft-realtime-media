# SoftQraft Realtime Media — product plan

**Updated:** 2026-08-04  
**Product:** Self-hosted realtime media platform (LiveKit SFU + HTTP Gateway)  
**Identity:** SoftQraft Labs Ltd. · MIT · `@softqraft/*`

## Goal

Ship a **market-ready interactive live SFU** that apps integrate via HTTP + LiveKit SDKs — without LiveKit Cloud billing for media.

## Current status (shippable beta)

| Layer | Status |
|-------|--------|
| Interactive WebRTC (host / guest / viewer) | ✅ Proven public GCP |
| Gateway sessions + tokens + ICE | ✅ |
| TLS + domain (`media` / `realtime.softqraftlabs.com`) | ✅ H2 |
| coturn TURN | ✅ H3 |
| Secrets + firewall + static IP + monitoring | ✅ H4–H6 |
| Admin GUI + API credential generation | 🔄 building |
| Echo / MP4 recording | ⏸ deferred (cost/complexity) |
| HLS + R2/CDN (large audience) | ⏸ when scale needed |
| Session durability (DB) | ⏸ H7 later |

## Architecture (product)

```text
Integrating app
  → HTTPS Gateway (sessions, tokens, credentials admin)
  → LiveKit SFU + Redis + coturn
  → LiveKit client SDK (WebRTC)
```

## Integration model

1. Operator opens **Admin Console** → creates **tenant** → gets **API key** (once)  
2. App stores API key server-side  
3. App: `POST /v1/sessions` + `POST /v1/sessions/:id/tokens`  
4. Clients connect with token to `wss://realtime…`  

## Roadmap slices

| ID | Slice | Priority |
|----|--------|----------|
| **P0** | Admin GUI + credential generate/revoke | Now |
| **P1** | Integration docs + copy-paste snippets | With P0 |
| **P2** | First consumer dual-run (e.g. Clatters live-only) | Next |
| **P3** | H7 session store persistence | When multi-gateway / restarts hurt |
| **P4** | H8 HLS + R2/CDN | Large passive audiences |
| **P5** | H9 Echo / VOD | When product requires replay |

## Non-goals (near term)

- Full multi-region mesh  
- Replacing app UI (chat, gifts, moderation)  
- Mandatory SaaS billing inside Gateway  

## Public endpoints (operator)

| URL | Role |
|-----|------|
| `https://media.softqraftlabs.com` | Gateway API + Admin UI |
| `https://realtime.softqraftlabs.com` | LiveKit WSS (via Caddy) |
| `/health` `/ready` | Probes |

## Related ops

- [public-sfu-readiness.md](../operations/public-sfu-readiness.md) — hardening H1–H6  
- [gateway-api-v1.md](../api/gateway-api-v1.md) — public API  
- [admin-console.md](admin-console.md) — credential GUI  
