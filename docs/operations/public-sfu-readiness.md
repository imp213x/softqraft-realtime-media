# Public SFU readiness (no Echo / no HLS)

**Status:** Interactive WebRTC live proven on GCP (2026-08-03)  
**Product slice:** Self-host LiveKit + Gateway — not LiveKit Cloud  
**Deferred:** Echo (MP4), HLS/CDN audience scale  

## Proven

| Check | Result |
|-------|--------|
| Compose on GCP VM | Up (LiveKit, Redis, MinIO, Egress, Gateway) |
| `GET /health` public | OK (`http://EXTERNAL_IP:8080`) |
| Host + `realtime_viewer` | Join works when both use **same** Gateway URL |
| Echo | Not required for this slice |
| HLS | Not required for interactive-only |

## Product claim (honest)

- **Ready:** Interactive live SFU for apps using LiveKit clients + Gateway HTTP API  
- **Not yet:** Market-hard production (TLS, TURN, secrets, HA)  
- **Not yet:** Large passive audience (needs HLS + CDN)  
- **First use case:** any app (e.g. Clatters) as consumer — product stays app-agnostic  

## Required architecture (current)

```text
App → Gateway :8080 → LiveKit :7880 + media UDP
     → LiveKit client SDK (WebRTC)
```

## Hardening ladder (do in order)

| # | Step | Status |
|---|------|--------|
| H1 | LiveKit `node_ip` + `LIVEKIT_REALTIME_URL` = public IP | ✅ 2026-08-03 |
| H2 | TLS + domain (`https` / `wss`) | ⬜ |
| H3 | Public coturn + `iceServers` | ⬜ |
| H4 | Rotate API keys / secrets | ⬜ |
| H5 | Firewall lockdown (not wide open) | ⬜ |
| H6 | Static IP + basic monitoring | ⬜ |
| H7 | Session durability (optional Redis/DB) | ⬜ later |
| H8 | HLS + R2/CDN | ⬜ when scale needed |
| H9 | Echo / recording | ⬜ deferred |

## Ops facts

- Gateway sessions are **in-memory** — restart loses session ids  
- Host and all viewers must use the **same** Gateway base URL  
- Local MinIO on VM ≠ R2; R2 is for later HLS origin  
- Repo: `https://github.com/imp213x/softqraft-realtime-media` (or org remote)  

## Related

- [local-live-test.md](local-live-test.md)  
- [turn-hls-cdn.md](turn-hls-cdn.md)  
- [load-test-plan-10k.md](load-test-plan-10k.md)  
- [phased-delivery.md](../roadmap/phased-delivery.md)  
