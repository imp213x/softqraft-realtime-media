# Economic production plane — runbook

**Status:** Active · Hetzner CX33 provisioned (operator, 2026-08-06)  
**Plane:** Economic production (cost-claimable)  
**Related:** [cost-posture-and-planes.md](cost-posture-and-planes.md), [ADR-009](../decisions/ADR-009-cost-planes-and-hosting-posture.md), [next-steps-handoff.md](../roadmap/next-steps-handoff.md)

## Goal

Run SoftQraft media egress on a host whose **$/GB ≪ LiveKit Cloud** (~$0.10–0.12/GB).

## Host selection

| Prefer | Avoid for media origin |
|--------|------------------------|
| EU/US VPS/bare metal with multi-TB include (e.g. **Hetzner CX33** ~£12/mo, 8 GB) | GCP/AWS **Premium** list egress as primary media path |
| ~$0–5/TB overage class | “Unlimited” fair-use without checking ToS |
| **Static** IP + open UDP for WebRTC/TURN | Ephemeral IPs (DNS/TURN break on recreate) |

**Current plan:** Migrate from GCP **demo** → Hetzner **economic** when install complete.

## Env flags (Gateway)

```bash
DEPLOYMENT_PLANE=economic_production
HOSTING_COST_CLASS=bandwidth_cheap
PUBLIC_GATEWAY_URL=https://media.softqraftlabs.com
LIVEKIT_REALTIME_URL=wss://realtime.softqraftlabs.com
TURN_HOST=<hetzner-ipv4>
TURN_EXTERNAL_IP=<hetzner-ipv4>
```

Demo plane (GCP until cutover):

```bash
DEPLOYMENT_PLANE=demo
HOSTING_COST_CLASS=hyperscaler_list_egress
```

## Hetzner Ubuntu 24.04 CX33 (checklist)

1. Static IPv4; open firewall: 22, 80, 443, LiveKit 7880–7882, coturn 3478 + relay UDP.  
2. Docker + Compose + Caddy + git.  
3. Clone repo; host-build gateway if Docker npm DNS fails: `./deploy/scripts/build-gateway-host.sh`.  
4. Compose stack + Caddy TLS (media → :8080, realtime → :7880).  
5. `livekit.yaml`: `node_ip` = Hetzner IP; webhook → `http://gateway:8080/v1/webhooks/livekit`.  
6. Plane flags as above; smoke Admin + session.  
7. DNS cutover (low TTL); verify laptop `curl https://media…/ready`.  
8. Demote/stop GCP demo or leave as lab only.

Full narrative: [next-steps-handoff.md](../roadmap/next-steps-handoff.md) §2.

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
Policy: [ADR-010](../decisions/ADR-010-economical-egress-hls.md) (on-demand egress only).  
Ops: [turn-hls-cdn.md](turn-hls-cdn.md).

## Redeploy Gateway (Admin UI / API)

Host keeps `deploy/docker/livekit/livekit.yaml` host-specific (`node_ip`). After git update:

```bash
cd /root/softqraft-realtime-media
cp -a deploy/docker/livekit/livekit.yaml /root/livekit.yaml.hetzner.bak
git fetch origin && git reset --hard origin/main
cp -a /root/livekit.yaml.hetzner.bak deploy/docker/livekit/livekit.yaml
bash deploy/scripts/build-gateway-host.sh
cd deploy/compose
docker compose -f docker-compose.yml -f docker-compose.prebuilt.yml --profile turn \
  up -d --force-recreate --no-deps gateway
curl -sS http://127.0.0.1:8080/ready
curl -sS -o /dev/null -w "%{http_code}\n" http://127.0.0.1:8080/admin/
```
