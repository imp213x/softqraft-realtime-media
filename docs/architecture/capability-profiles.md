# Capability profiles

The platform is **situation-agnostic**. Deployments enable one or more profiles; the Gateway exposes the same resource model with profile-gated features.

## Profile matrix

| Profile | Realtime SFU | Audience path | Egress file (MP4/etc.) | Egress HLS / CDN | Typical scale |
|---------|--------------|---------------|------------------------|------------------|---------------|
| `interactive` | yes | WebRTC peers | optional | no | tens–low hundreds |
| `creator_live_webrtc` | yes | WebRTC subscribe | optional | no | hundreds (cost grows fast) |
| `creator_live_hls` | yes (stage) | **HLS/CDN** | optional | **yes** | thousands–10k+ |
| `hybrid_live` | yes | HLS default + capped WebRTC VIP | optional | yes | thousands–10k+ |
| `recording_only` | yes (source room) | n/a | **yes** | no | per-room capture |
| `live_plus_recording` | yes | WebRTC and/or HLS | **yes** | optional | product-dependent |

## Mapping known situations

| Situation | Recommended profile(s) |
|-----------|------------------------|
| Clatters Live today | `creator_live_webrtc` + `recording_only` (room composite MP4) |
| Clatters Live cost-optimized 10k | `hybrid_live` or `creator_live_hls` + `recording_only` |
| Team meeting / CoLAB-style | `interactive` |
| Webinar 5k viewers | `creator_live_hls` |
| Record meeting to VOD only | `interactive` + `recording_only` |
| Restream to YouTube/Twitch | live profile + RTMP egress output |

## Config sketch (deployment)

```yaml
profiles:
  enabled:
    - interactive
    - creator_live_webrtc
    - recording_only
    - creator_live_hls   # enable when CDN + segment storage ready
  defaults:
    audienceMode: realtime   # or hls | hybrid
  recording:
    file:
      enabled: true
      storage: s3_compatible
      keyTemplate: "{externalId}/{sessionId}-{time}.mp4"
    hls:
      enabled: false
      keyTemplate: "live/{sessionId}/{segment}"
  realtime:
    maxParticipantsDefault: 50
    tokenTtlSecondsDefault: 600
```

Clatters-compatible template example:

```text
keyTemplate: "live-echo/{externalId}/{sessionId}-{time}.mp4"
```

## Feature gates in Gateway

| API area | Required profiles |
|----------|-------------------|
| `POST /v1/sessions` + tokens | any with realtime |
| `POST .../egress` type `room_composite_file` | `recording_only` or `live_plus_recording` |
| `POST .../egress` type `room_composite_hls` | `creator_live_hls` or `hybrid_live` |
| `GET .../playback` hlsUrl | HLS profiles when job ready |
| Webhooks to consumer | any egress-enabled profile |

## Design rule

**Profiles change defaults and enabled operations — not resource nouns.**  
All apps still use sessions, tokens, egress jobs, and playback documents.
