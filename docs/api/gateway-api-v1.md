# Gateway API v1 (design)

**Base path:** `/v1`  
**Style:** JSON over HTTPS  
**Auth:** `Authorization: Bearer <service_api_key>` (Clatters backend only)  
**Source of truth (machine):** [openapi/openapi-v1.yaml](openapi/openapi-v1.yaml)

This is the **plug surface** for Clatters. Media clients use LiveKit SDKs with tokens issued here.

---

## Resources

### Health

| Method | Path | Description |
|--------|------|-------------|
| `GET` | `/health` | Liveness |
| `GET` | `/ready` | Readiness (LiveKit + Redis reachable) |

### Sessions (Live shows)

| Method | Path | Description |
|--------|------|-------------|
| `POST` | `/v1/sessions` | Create a live session / room |
| `GET` | `/v1/sessions/{sessionId}` | Get session status + endpoints |
| `POST` | `/v1/sessions/{sessionId}/end` | End live; stop egress; close room |
| `GET` | `/v1/sessions` | List active sessions (ops / Clatters admin) |

### Tokens

| Method | Path | Description |
|--------|------|-------------|
| `POST` | `/v1/sessions/{sessionId}/tokens` | Mint LiveKit participant JWT |

### Egress

| Method | Path | Description |
|--------|------|-------------|
| `POST` | `/v1/sessions/{sessionId}/egress` | Start egress job (HLS / room composite / track / RTMP) |
| `GET` | `/v1/sessions/{sessionId}/egress` | List egress jobs for session |
| `GET` | `/v1/egress/{egressId}` | Job status |
| `POST` | `/v1/egress/{egressId}/stop` | Stop job |

### Playback

| Method | Path | Description |
|--------|------|-------------|
| `GET` | `/v1/sessions/{sessionId}/playback` | Resolve audience playback URLs |

---

## Core shapes (illustrative)

### Create session

```http
POST /v1/sessions
Content-Type: application/json
Authorization: Bearer <service_key>

{
  "idempotencyKey": "clatters-live-abc123",
  "metadata": {
    "clattersLiveId": "abc123",
    "hostUserId": "user_9"
  },
  "realtime": {
    "emptyTimeoutSeconds": 300,
    "maxParticipants": 50
  },
  "audience": {
    "mode": "hls",
    "visibility": "public"
  }
}
```

```json
{
  "sessionId": "sess_01H...",
  "roomName": "sess_01H...",
  "status": "ready",
  "realtime": {
    "url": "wss://realtime.media.example.com"
  },
  "playback": {
    "status": "pending",
    "hlsUrl": null
  },
  "createdAt": "2026-08-02T12:00:00Z"
}
```

### Mint token

```http
POST /v1/sessions/sess_01H.../tokens

{
  "identity": "user_9",
  "name": "Host Display",
  "role": "host",
  "ttlSeconds": 3600
}
```

Roles (Gateway-normalized):

| Role | LiveKit grants (typical) |
|------|---------------------------|
| `host` | publish + subscribe + data |
| `cohost` | publish + subscribe + data |
| `guest` | publish + subscribe (policy-limited) |
| `realtime_viewer` | subscribe only (capped tier) |
| `agent` | as needed for bots/moderation |

```json
{
  "token": "<jwt>",
  "identity": "user_9",
  "role": "host",
  "expiresAt": "2026-08-02T13:00:00Z",
  "realtimeUrl": "wss://realtime.media.example.com"
}
```

### Start egress (HLS audience path)

```http
POST /v1/sessions/sess_01H.../egress

{
  "type": "room_composite_hls",
  "options": {
    "layout": "speaker",
    "preset": "H264_720P_30",
    "segmentDurationSeconds": 2
  }
}
```

```json
{
  "egressId": "eg_01H...",
  "status": "starting",
  "playback": {
    "hlsUrl": "https://cdn.example.com/live/sess_01H.../index.m3u8"
  }
}
```

Exact egress type names will align with what Clatters uses today (room composite, track, participant) during migration discovery.

---

## Error model

```json
{
  "error": {
    "code": "session_not_found",
    "message": "Session does not exist or has ended",
    "requestId": "req_..."
  }
}
```

Stable `code` values for Clatters mapping; human `message` may change.

---

## Versioning

- Breaking changes → `/v2`  
- Additive fields are non-breaking  
- Deprecations announced in docs/changelog with minimum dual-support window  

---

## Out of scope for v1 Gateway

- Chat, gifts, moderation policy engines (stay in Clatters)  
- Billing  
- End-user authentication (Clatters authenticates users; Gateway trusts Clatters service key)  
