# Example: Clatters / The_Scholar consumer

This is an **adapter example**, not the platform core.  
Platform APIs remain agnostic — see [generic integration](../../docs/integration/generic-integration-guide.md).

**Inventory:** [../../docs/integration/consumers/the-scholar-clatters-inventory.md](../../docs/integration/consumers/the-scholar-clatters-inventory.md)

## What Clatters does today

| Concern | Production |
|---------|------------|
| Realtime | LiveKit Cloud, room `workspace-{workspaceId}` |
| Audience | WebRTC subscribe |
| Egress | Room composite **MP4** → S3 `live-echo/{workspaceId}/{liveSessionId}-{time}.mp4` |
| Webhook | `POST /api/livekit/egress-webhook` |

## Minimal drop-in (no Gateway required first)

1. Deploy self-host LiveKit + Egress.  
2. Set Clatters `LIVEKIT_URL` / `LIVEKIT_API_KEY` / `LIVEKIT_API_SECRET` to self-host.  
3. Configure Egress S3 to same bucket/prefix (or S3-compatible).  
4. Point LiveKit webhooks at existing Clatters webhook URL.  
5. Keep token routes in Clatters as-is.

## Gateway-mediated flow (recommended long-term)

```text
1. Auth user in Clatters
2. POST /v1/sessions { externalId: workspaceId, roomName: "workspace-"+id, profile: "creator_live_webrtc" }
3. POST .../tokens (map owner→host, stage_guest→guest, viewer→realtime_viewer)
4. Client LiveKit connect
5. POST .../egress type=room_composite_file (Echo)
6. Webhook → Clatters Echo finalize (or platform forwards to Clatters URL)
7. POST .../end
```

## Cost scale (10k)

Enable profile `hybrid_live` / `creator_live_hls` later; do not put 10k WebRTC subscribers on the SFU.

## Do not

- Bake Nest/Echo types into the platform core  
- Ship LiveKit API secrets in mobile apps  

