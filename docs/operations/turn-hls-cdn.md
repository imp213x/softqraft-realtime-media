# TURN + HLS + CDN operations (market-grade Phase 3a–d)

**ADR:** [ADR-008](../decisions/ADR-008-market-grade-product-stack.md)  
**Architecture:** [market-grade-product.md](../architecture/market-grade-product.md)

This runbook covers the four layers that make SoftQraft “market grade others would pay for” without mandatory LiveKit Cloud subscriptions.

| Layer | Default | Subscription? |
|-------|---------|---------------|
| TURN | coturn on your VMs | No |
| HLS | LiveKit Egress → object storage | No |
| CDN | Cloudflare or Bunny | Usage / free tier |
| Multi-tenant | Gateway API keys + quotas | No |

---

## 3a — coturn TURN

### Compose profiles

```powershell
cd C:\Dev\live-streaming-platform\deploy\compose

# Linux VM / native Docker (best): host network coturn
docker compose --profile turn up -d

# Docker Desktop Windows/macOS: published ports bridge
docker compose --profile turn-bridge up -d

# Full stack + host-network coturn (Linux)
docker compose --profile full up -d
```

### Env (host Gateway or Compose)

```bash
TURN_ENABLED=true
TURN_HOST=192.168.1.131          # LAN or public IP clients can reach
TURN_PORT=3478
TURN_USERNAME=softqraft
TURN_PASSWORD=softqraftturn
TURN_REALM=softqraft.local
# Optional explicit URL list (overrides TURN_HOST builder):
# TURN_URLS=turn:192.168.1.131:3478?transport=udp,turn:192.168.1.131:3478?transport=tcp
TURN_EXTERNAL_IP=                # set on public VMs for coturn --external-ip
```

### How clients get TURN

LiveKit **embedded TURN is disabled** (avoids fighting coturn for port 3478).  
Gateway returns `iceServers` on every token response:

```json
{
  "token": "...",
  "realtimeUrl": "ws://localhost:7880",
  "iceServers": [
    { "urls": ["stun:stun.l.google.com:19302"] },
    {
      "urls": [
        "turn:192.168.1.131:3478?transport=udp",
        "turn:192.168.1.131:3478?transport=tcp"
      ],
      "username": "softqraft",
      "credential": "softqraftturn"
    }
  ]
}
```

Client (livekit-client):

```js
await room.connect(realtimeUrl, token, {
  rtcConfig: { iceServers },
});
```

### Docker Desktop note

`network_mode: host` is weak on Docker Desktop. Prefer `--profile turn-bridge` and set `TURN_HOST` to the host LAN IP from `scripts/sync-livekit-node-ip.ps1`.

### Production hardening

- Long random `TURN_PASSWORD`; rotate periodically  
- TLS TURN (5349) with real certs behind public DNS  
- Firewall: 3478/udp+tcp, 5349, relay range 49160–49200/udp  
- Prefer static credentials only for lab; use time-limited REST auth for production

---

## 3b — HLS egress

### Start HLS audience stream

```http
POST /v1/sessions/{sessionId}/egress
Authorization: Bearer <tenant-api-key>
Content-Type: application/json

{
  "type": "room_composite_hls",
  "options": {
    "segmentDurationSeconds": 2,
    "livePlaylistName": "live.m3u8"
  }
}
```

Response includes `playback.hlsUrl` when `HLS_PUBLIC_BASE_URL` or `CDN_PUBLIC_BASE_URL` is set.

### Env

```bash
HLS_KEY_TEMPLATE=hls/{externalId}/{sessionId}
HLS_PUBLIC_BASE_URL=http://localhost:9000/sqrm-recordings
CDN_PUBLIC_BASE_URL=           # set in prod for edge URLs
```

### Local smoke

1. Compose up with MinIO + Egress + Gateway.  
2. Create session, host token, publish media.  
3. Start `room_composite_hls`.  
4. List MinIO prefix `hls/.../` for `live.m3u8` + segments.  
5. Play with VLC or hls.js against `HLS_PUBLIC_BASE_URL/.../live.m3u8`.  
6. For browsers, MinIO may need a public/anonymous read policy on the HLS prefix (lab only).

File recording (`room_composite_file`) remains for Echo/VOD.

---

## 3c — Multi-tenant keys + quotas

### Env

```bash
# Legacy (single product):
GATEWAY_SERVICE_API_KEYS=dev-local-key

# Multi-tenant (market-grade):
# tenantId:apiKey:maxSessions:maxEgress
GATEWAY_TENANTS=clatters:dev-local-key:50:10,demo:demo-key:20:5
# or named: clatters:dev-local-key:sessions=50:egress=10
```

### Behavior

| Rule | Detail |
|------|--------|
| Auth | Bearer key maps to tenant |
| Isolation | Sessions tagged with `tenantId`; keys cannot see other tenants’ sessions |
| Quotas | Concurrent sessions + concurrent egress jobs (in-memory v1) |
| 429 | `error.code = quota_exceeded` |

### Smoke

```powershell
# Tenant A
$h = @{ Authorization = "Bearer dev-local-key"; "Content-Type" = "application/json" }
Invoke-RestMethod http://localhost:8080/v1/sessions -Method POST -Headers $h -Body '{"externalId":"a1"}'

# Tenant B cannot read A's session
$h2 = @{ Authorization = "Bearer demo-key" }
# → 404
```

---

## 3d — CDN

Templates:

- [deploy/cdn/cloudflare-hls.md](../../deploy/cdn/cloudflare-hls.md)  
- [deploy/cdn/bunny-hls.md](../../deploy/cdn/bunny-hls.md)

Checklist:

1. Public origin for HLS prefix (R2/S3/MinIO/proxy).  
2. Pull zone / cache rules: short TTL playlists, long TTL segments.  
3. CORS for player origins.  
4. Set `CDN_PUBLIC_BASE_URL` on Gateway; restart.  
5. Confirm `playback.hlsUrl` uses CDN host.

---

## Sell as SaaS later

- SoftQraft Labs runs this stack; customers get `GATEWAY_TENANTS` keys.  
- Charge flat + usage; pass CDN GB cost or absorb.  
- No change to app integration (same Gateway HTTP API).

---

## Compose quick reference

```powershell
# Core media plane
docker compose up -d redis livekit egress minio minio-init gateway

# + TURN (Desktop)
docker compose --profile turn-bridge up -d

# Env file
Copy-Item ..\env\media.env.example .env
# edit TURN_*, GATEWAY_TENANTS, HLS_*, CDN_*
```
