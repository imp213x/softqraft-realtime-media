# Economic production plane — runbook (draft)

**Status:** Draft · Phase B  
**Plane:** Economic production (cost-claimable)  
**Related:** [cost-posture-and-planes.md](cost-posture-and-planes.md), [ADR-009](../decisions/ADR-009-cost-planes-and-hosting-posture.md)

## Goal

Run SoftQraft media egress on a host whose **$/GB ≪ LiveKit Cloud** (~$0.10–0.12/GB).

## Host selection

| Prefer | Avoid for media origin |
|--------|------------------------|
| EU/US VPS/bare metal with multi-TB include | GCP/AWS **Premium** list egress as primary media path |
| ~$0–5/TB overage class | “Unlimited” fair-use without checking ToS |
| Static IP + open UDP for WebRTC/TURN | Shared hosts that block UDP |

## Env flags (Gateway)

```bash
DEPLOYMENT_PLANE=economic_production
HOSTING_COST_CLASS=bandwidth_cheap
PUBLIC_GATEWAY_URL=https://media.example.com
LIVEKIT_REALTIME_URL=wss://realtime.example.com
```

Demo plane (current GCP):

```bash
DEPLOYMENT_PLANE=demo
HOSTING_COST_CLASS=hyperscaler_list_egress
```

## Cutover checklist (demo → economic)

1. Provision host; Docker Compose stack (LiveKit, Redis, coturn, Gateway, optional Egress).  
2. TLS (Caddy/nginx) for Gateway + LiveKit WSS.  
3. Set plane env flags as above.  
4. Rotate secrets; point DNS or dual-run new domain.  
5. Admin → generate tenant key; smoke host/viewer.  
6. Compare host bandwidth bill to prior LiveKit Cloud GB.  
7. Only then claim cost savings.

## HLS at scale

On economic plane, large passive audiences still need **hybrid HLS + CDN**.  
See [turn-hls-cdn.md](turn-hls-cdn.md).
