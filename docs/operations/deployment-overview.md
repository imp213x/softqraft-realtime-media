# Deployment overview

**Product:** SoftQraft Realtime Media (SoftQraft Labs Ltd.)

## Storage note

- **Realtime:** self-hosted LiveKit (cheap-bandwidth hosts).  
- **Recording/Echo files:** **AWS S3** for initial production ([ADR-006](../decisions/ADR-006-echo-recording-storage-aws.md)).  
- Egress workers need network path and credentials to write to that bucket.

## Package form factors

| Form | Path | Use |
|------|------|-----|
| Docker Compose | `deploy/compose` | Dev, staging, single-node production |
| Config assets | `deploy/docker/*` | LiveKit, Egress, edge proxy |
| Gateway service | `services/gateway-api` | HTTP plug for Clatters |
| Scripts | `scripts/` | bootstrap, smoke, keygen |

Kubernetes/Helm is **not** required for v1.

## Reference single-node topology

```text
                  ┌─────────────┐
        HTTPS     │  Caddy/Nginx│
     ┌───────────►│  TLS edge   ├──────────────┐
     │            └──────┬──────┘              │
     │                   │                     │
     │            /gateway → Gateway API       │
     │            /rtc,/ws → LiveKit           │
     │                                         │
┌────┴─────┐   ┌─────────┐   ┌──────────────┐ │
│ Internet │   │ Redis   │   │ Egress pool  │◄┘
└────┬─────┘   └────▲────┘   └──────┬───────┘
     │              │               │
     │         ┌────┴────┐          │ object storage
     └────────►│ LiveKit │◄─────────┘
               │ + TURN  │
               └─────────┘
```

## Ports (conceptual)

| Service | Ports | Notes |
|---------|-------|-------|
| Edge HTTPS | 443 | WSS + Gateway API |
| LiveKit RTC UDP | configured range | Must be public for quality |
| TURN | 3478 / 5349 / relay range | NAT clients |
| Redis | internal only | Never public |
| Gateway | internal or via edge | Service-key auth |
| Egress | internal | Talks to LiveKit + Redis + storage |

## Environment classes

| Class | Intent |
|-------|--------|
| `local` | Developer laptop Compose |
| `staging` | Clatters staging dual-run |
| `production` | Clatters Live primary |

## Secrets

Never commit secrets. Use `.env` (gitignored) or a secret manager.

| Secret | Owner |
|--------|-------|
| `LIVEKIT_API_KEY` / `LIVEKIT_API_SECRET` | LiveKit + Gateway |
| `GATEWAY_SERVICE_API_KEYS` | Clatters backend auth to Gateway |
| Object storage keys | Egress + Gateway playback signing |
| Redis password | Internal |

## Bandwidth posture

- Prefer hosts with **included or cheap egress** for SFU + origin.  
- Put **audience** bytes on CDN.  
- Avoid hairpinning media through AWS NAT/egress gateways.

## Smoke test (minimum)

1. `GET /ready` → ready  
2. Create session via Gateway  
3. Host token → publish with LiveKit meet/client sample  
4. Start HLS egress  
5. Fetch playlist URL  
6. End session  

Automated entrypoint: `scripts/smoke-test` (to be implemented in Phase 1).
