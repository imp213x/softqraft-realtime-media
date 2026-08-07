# `@softqraft/sdk`

Public **backend** HTTP client for SoftQraft Realtime Media Gateway API **v1**.

| | |
|--|--|
| **Use** | Node.js / server runtimes |
| **Do not** | Ship API keys to browsers or mobile |
| **Do not** | Import `services/gateway-api` internals |
| **Clients** | LiveKit SDK + `token` / `realtimeUrl` / `iceServers` from `mintToken` |
| **Contract** | [OpenAPI](../../docs/api/openapi/openapi-v1.yaml) · [Gateway API v1](../../docs/api/gateway-api-v1.md) |
| **Boundaries** | [package-boundaries.md](../../docs/product/package-boundaries.md) |
| **Egress / HLS** | Optional, on-demand — [ADR-010](../../docs/decisions/ADR-010-economical-egress-hls.md) |

## Install

### Inside SoftQraft monorepo

```bash
pnpm install
pnpm run build:sdk
```

### Consumer app (path dependency)

```bash
pnpm add file:../softqraft-realtime-media/packages/sdk
# after SoftQraft: pnpm run build:sdk
```

```json
{
  "dependencies": {
    "@softqraft/sdk": "file:../softqraft-realtime-media/packages/sdk"
  }
}
```

Alternatively call Gateway HTTP with any language using the OpenAPI file (no SDK required).  
Workspace / npm publish can replace `file:` later; **API surface stays this package**.

## Env

```bash
SOFTQRAFT_GATEWAY_URL=https://media.softqraftlabs.com
SOFTQRAFT_API_KEY=sqk_...   # Admin console → Credentials (tenant key)
```

Create keys at `https://media.softqraftlabs.com/admin/` (operator UI — not part of the SDK).

## Golden path (interactive WebRTC)

```ts
import { SoftQraftClient, SDK_VERSION, GATEWAY_API_VERSION } from "@softqraft/sdk";

const sq = new SoftQraftClient({
  baseUrl: process.env.SOFTQRAFT_GATEWAY_URL!,
  apiKey: process.env.SOFTQRAFT_API_KEY!,
});

// 1) Session / room
const session = await sq.createSession({
  externalId: "show-1",
  profile: "creator_live_webrtc",
  realtime: { maxParticipants: 50 },
});

// 2) Participant token for your LiveKit client
const { token, realtimeUrl, iceServers } = await sq.mintToken(session.sessionId, {
  identity: "host-1",
  role: "host",
});

// 3) Browser / mobile (your app UI — not SoftQraft Admin):
// await room.connect(realtimeUrl, token, { rtcConfig: { iceServers } });

// 4) Teardown
await sq.endSession(session.sessionId);
```

## Optional: egress (scale / VOD)

Do **not** start for every session on a small economic host (ADR-010).

```ts
// Passive audience later:
// await sq.startHlsEgress(session.sessionId);
// const playback = await sq.getPlayback(session.sessionId);

// File VOD when product needs replay:
// await sq.startFileEgress(session.sessionId, { keyTemplate: "vod/{externalId}/{sessionId}.mp4" });
```

## API surface

| Method | Gateway |
|--------|---------|
| `health` / `ready` | `GET /health` `/ready` |
| `createSession` | `POST /v1/sessions` (201; 200 on idempotent replay) |
| `getSession` / `listSessions` | `GET …` |
| `endSession` | `POST …/end` |
| `mintToken` | `POST …/tokens` → `token`, `realtimeUrl`, `iceServers` |
| `startEgress` / `startHlsEgress` / `startFileEgress` | `POST …/egress` |
| `listEgress` / `getEgress` / `stopEgress` | egress status |
| `getPlayback` | `GET …/playback` |

Errors: `SoftQraftApiError` with `status`, `code`, `requestId`.

Constants: `SDK_VERSION`, `GATEWAY_API_VERSION` (`"v1"`).

## Cost honesty

Self-host ≠ automatic savings vs LiveKit Cloud. See:

- [cost-posture-and-planes.md](../../docs/operations/cost-posture-and-planes.md)  
- [ADR-009](../../docs/decisions/ADR-009-cost-planes-and-hosting-posture.md)  
- [ADR-010](../../docs/decisions/ADR-010-economical-egress-hls.md) (HLS/egress economics)

## Version

- Package: `package.json` / `SDK_VERSION` (0.2.x)  
- HTTP contract: `GATEWAY_API_VERSION === "v1"` · OpenAPI `info.version` 1.0.1  
