# Cloudflare CDN in front of HLS origin

**Goal:** Cache LiveKit Egress HLS (`.m3u8` + `.ts`/`.m4s`) at the edge so ~10k passive viewers never hit the SFU.

## Architecture

```text
Viewers → Cloudflare (CDN) → Origin (public S3 / R2 / MinIO / static origin)
                                  ▲
LiveKit Egress ───────────────────┘  (writes segments continuously)
```

Gateway sets `CDN_PUBLIC_BASE_URL=https://hls.yourdomain.com` so
`playback.hlsUrl` points at the CDN, not the origin bucket URL.

## Origin options

| Origin | Notes |
|--------|--------|
| **Cloudflare R2** | Best fit with Cloudflare CDN; zero egress fees R2→CF |
| **S3 / MinIO public prefix** | Use path-style or virtual-host; enable CORS for browsers |
| **Caddy/nginx reverse proxy** to MinIO | Good for single-VM demos |

## Cloudflare setup (checklist)

1. Add domain / subdomain e.g. `hls.example.com`.
2. Origin:
   - **R2 custom domain** attached to the HLS bucket/prefix, or
   - **DNS only / proxied** CNAME to S3 website endpoint or your origin IP.
3. **Cache Rules** (recommended):

| URL pattern | Cache | Edge TTL | Browser TTL | Notes |
|-------------|-------|----------|-------------|--------|
| `*.m3u8` | Eligible | 2–5s | 0–2s | Live playlist must stay fresh |
| `*.ts` / `*.m4s` | Eligible | 1 day+ | 1 hour+ | Immutable segment names |
| `*` (other) | Default | — | — | |

4. **CORS** (if player is on another origin):
   - Allow `GET`, `HEAD`, `OPTIONS`
   - `Access-Control-Allow-Origin` for your app origins (or `*` for public lives)
5. **SSL/TLS:** Full (strict) when origin has valid cert; Flexible only for lab.

## SoftQraft env

```bash
# Origin (Egress writes here)
S3_BUCKET_NAME=sqrm-hls
# ... AWS/R2 credentials ...

# Public origin base (without CDN) — fallback playback
HLS_PUBLIC_BASE_URL=https://sqrm-hls.s3.eu-west-2.amazonaws.com

# Prefer CDN in Gateway responses
CDN_PUBLIC_BASE_URL=https://hls.example.com

HLS_KEY_TEMPLATE=hls/{externalId}/{sessionId}
```

## Smoke

1. Start `room_composite_hls` egress via Gateway.
2. Poll `GET /v1/sessions/:id/playback` → `hlsUrl` under CDN host.
3. Open in VLC / hls.js; confirm response headers show `cf-cache-status: HIT` on segments after first play.

## Cost notes

- You pay **Cloudflare plan + bandwidth** (or free tier limits), **not** LiveKit participant minutes.
- R2 + Cloudflare is usually cheapest for pure HLS delivery.
