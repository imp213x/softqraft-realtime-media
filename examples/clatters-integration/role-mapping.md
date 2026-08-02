# Clatters role → SoftQraft / LiveKit grant mapping

Clatters issues tokens in-app today (`livekitTokenRoute.js`).  
If you later mint via SoftQraft Gateway, map roles as follows:

| Clatters role | SoftQraft Gateway `role` | Publish | Subscribe | Notes |
|---------------|--------------------------|---------|-----------|--------|
| owner | `host` | yes | yes | `roomRecord` on host |
| admin | `host` or `cohost` | yes | yes | Match product policy |
| editor | `cohost` | yes | yes | |
| stage_guest | `guest` | yes | yes | After server stage grant |
| viewer / guest | `realtime_viewer` | no | yes | Audience WebRTC |
| public Live audience | `realtime_viewer` | no | yes | Membership optional in Clatters |

## Room naming

Clatters:

```text
workspace-{workspaceId}
```

Gateway create session:

```json
{
  "externalId": "<workspaceId>",
  "roomName": "workspace-<workspaceId>",
  "profile": "creator_live_webrtc"
}
```

## Echo filepath (AWS S3)

Clatters template:

```text
live-echo/{workspaceId}/{liveSessionId}-{time}.mp4
```

SoftQraft:

```bash
RECORDING_KEY_TEMPLATE=live-echo/{externalId}/{sessionId}-{time}.mp4
```

Pass `externalId` = workspaceId and use `sessionId` aligned with Clatters `liveSessionId` when possible (or map in metadata).
