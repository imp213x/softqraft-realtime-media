# Clatters integration example

Reference notes for wiring Clatters production backends to this platform.

## Minimal backend flow

```text
1. Authenticate Clatters user (existing auth)
2. POST /v1/sessions          → sessionId, realtime.url
3. POST .../tokens role=host → token for LiveKit SDK
4. Host client: Room.connect(realtimeUrl, token)
5. POST .../egress           → start HLS packaging
6. GET  .../playback         → hlsUrl for audience clients
7. POST .../end              → teardown
```

## Configuration Clatters should hold

| Config | Example |
|--------|---------|
| `MEDIA_GATEWAY_BASE_URL` | `https://gateway.media.clatters.example` |
| `MEDIA_GATEWAY_API_KEY` | service key (server-side only) |
| Feature flag | `media_backend=self_host\|cloud` |

## Do not

- Ship LiveKit API secret in mobile apps  
- Point 10k audience clients at WebRTC by default  
- Call LiveKit Cloud and self-host for the same session without clear ownership  

Full migration: [../../docs/integration/clatters-migration-guide.md](../../docs/integration/clatters-migration-guide.md)
