# Gateway API v1 (design)

**Product:** SoftQraft Realtime Media (SoftQraft Labs Ltd.)  
**Base path:** `/v1`  
**Style:** JSON over HTTPS  
**Auth:** `Authorization: Bearer <service_api_key>` (consumer backends only)  
**Source of truth (machine):** [openapi/openapi-v1.yaml](openapi/openapi-v1.yaml)

This is the **plug surface** for any consumer app. Media clients use LiveKit SDKs with tokens issued here.

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

App-agnostic: pass your own ids in `externalId` / `metadata`. Optionally set `roomName` to match an existing LiveKit naming scheme (e.g. Clatters `workspace-{id}`).

```http
POST /v1/sessions
Content-Type: application/json
Authorization: Bearer <service_key>

{
  "idempotencyKey": "app-event-abc123",
  "externalId": "workspace-or-event-id",
  "roomName": "workspace-abc123",
  "metadata": {
    "hostUserId": "user_9",
    "product": "any-string-your-app-needs"
  },
  "profile": "creator_live_webrtc",
  "realtime": {
    "emptyTimeoutSeconds": 300,
    "maxParticipants": 50
  },
  "audience": {
    "mode": "realtime",
    "visibility": "public"
  },
  "recording": {
    "file": {
      "enabled": true,
      "keyTemplate": "{externalId}/{sessionId}-{time}.mp4"
    }
  }
}
```

```json
{
  "sessionId": "sess_01H...",
  "externalId": "workspace-or-event-id",
  "roomName": "workspace-abc123",
  "status": "ready",
  "profile": "creator_live_webrtc",
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

### Start egress

**File recording** (Clatters Echo-compatible pattern: room composite → MP4 → object storage):

```http
POST /v1/sessions/sess_01H.../egress

{
  "type": "room_composite_file",
  "options": {
    "fileType": "mp4",
    "filepath": "live-echo/{externalId}/{sessionId}-{time}.mp4"
  }
}
```

**HLS audience / archive** (large-scale profile):

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

Supported types (schema): `room_composite_file`, `room_composite_hls`, `room_composite_rtmp`, `track`, `participant`.

**Implemented now:** `room_composite_file`, `room_composite_hls`. Others return **`501`**.

**Profiles are labels today:** `profile` is stored on the session but does **not** auto-start HLS, Echo, or hybrid audience paths. Callers must invoke egress (and later orchestration) explicitly. See [platform-maturity-assessment.md](../operations/platform-maturity-assessment.md) §10.

**HLS playback status:** After start, `playback.status` may become `ready` when the Egress API accepts the job — **before** the playlist object exists. Treat early URLs as provisional until an active egress webhook / object probe (hardening backlog §7).

HLS response includes `playback.hlsUrl` when `HLS_PUBLIC_BASE_URL` or `CDN_PUBLIC_BASE_URL` is configured.

### Tokens include ICE servers

```http
POST /v1/sessions/{sessionId}/tokens
```

```json
{
  "token": "eyJ...",
  "identity": "host-1",
  "role": "host",
  "expiresAt": "2026-08-02T12:00:00.000Z",
  "realtimeUrl": "ws://localhost:7880",
  "iceServers": [
    { "urls": ["stun:stun.l.google.com:19302"] },
    {
      "urls": ["turn:192.168.1.1:3478?transport=udp"],
      "username": "softqraft",
      "credential": "..."
    }
  ]
}
```

Pass `iceServers` into the client `Room.connect` `rtcConfig` for NAT traversal (coturn).

### Multi-tenant auth

```bash
# Legacy single product
Authorization: Bearer dev-local-key

# Multi-tenant (GATEWAY_TENANTS=tenantId:apiKey:maxSessions:maxEgress)
Authorization: Bearer <tenant-api-key>
```

Sessions are scoped to the tenant that created them. Concurrent session/egress over-quota returns `429` with `code: quota_exceeded`.

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

| code | Typical HTTP |
|------|--------------|
| `unauthorized` | 401 |
| `session_not_found` | 404 |
| `egress_not_found` | 404 |
| `validation_error` | 400 / 501 |
| `quota_exceeded` | 429 |
| `dependency_unavailable` | 502 / 503 |
| `internal_error` | 500 |

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
