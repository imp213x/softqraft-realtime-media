# Bunny.net CDN in front of HLS origin

**Goal:** Cheap edge cache for SoftQraft HLS audience delivery (alternative to Cloudflare).

## Why Bunny

- Simple Pull Zone model priced per GB
- Good defaults for video / large files
- Easy origin hostname + path rewrite

## Setup checklist

1. Create a **Pull Zone** pointing at your HLS origin:
   - Origin URL example: `https://sqrm-recordings.s3.eu-west-2.amazonaws.com`
   - Or MinIO public base: `https://media.example.com/sqrm-recordings`
2. Optional: **Edge Rules**
   - Cache `.m3u8` with short TTL (2–5 seconds)
   - Cache `.ts` / `.m4s` long TTL (immutable)
3. Enable **CORS** for browser players if needed
4. Attach custom hostname `hls.example.com` + free SSL

## SoftQraft env

```bash
CDN_PUBLIC_BASE_URL=https://hls.example.com
# or Bunny default zone URL:
# CDN_PUBLIC_BASE_URL=https://yourzone.b-cdn.net

HLS_PUBLIC_BASE_URL=https://sqrm-recordings.s3.eu-west-2.amazonaws.com
HLS_KEY_TEMPLATE=hls/{externalId}/{sessionId}
```

Playback URL shape:

```text
{CDN_PUBLIC_BASE_URL}/hls/{externalId}/{sessionId}/live.m3u8
```

## Smoke

1. Egress HLS → objects under `hls/.../` on origin.
2. `curl -I https://hls.example.com/hls/.../live.m3u8` → 200.
3. Play with hls.js; second segment request should be cached at edge.

## Cost notes

- Usage-based CDN only — no LiveKit subscription.
- Pair with cheap object storage (R2, Wasabi, Hetzner, self-host MinIO).
