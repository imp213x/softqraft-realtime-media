# `@softqraft/sdk`

Public **backend** HTTP client for SoftQraft Realtime Media Gateway API **v1**.

| | |
|--|--|
| **Use** | Node.js / server runtimes |
| **Do not** | Ship API keys to browsers or mobile |
| **Clients** | LiveKit SDK + `token` / `realtimeUrl` / `iceServers` from `mintToken` |
| **Contract** | [Gateway API v1](../../docs/api/gateway-api-v1.md) · [package boundaries](../../docs/product/package-boundaries.md) |

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

Workspace / npm publish can replace `file:` later; **API surface stays this package**.

## Env

```bash
SOFTQRAFT_GATEWAY_URL=https://media.softqraftlabs.com
SOFTQRAFT_API_KEY=sqk_...   # Admin console tenant key
```

## Golden path

```ts
import { SoftQraftClient, SDK_VERSION, GATEWAY_API_VERSION } from "@softqraft/sdk";

const sq = new SoftQraftClient({
  baseUrl: process.env.SOFTQRAFT_GATEWAY_URL!,
  apiKey: process.env.SOFTQRAFT_API_KEY!,
});

const session = await sq.createSession({
  externalId: "show-1",
  profile: "creator_live_webrtc",
  realtime: { maxParticipants: 50 },
});

const { token, realtimeUrl, iceServers } = await sq.mintToken(session.sessionId, {
  identity: "host-1",
  role: "host",
});

// Browser / mobile: livekit-client
// await room.connect(realtimeUrl, token, { rtcConfig: { iceServers } });

await sq.endSession(session.sessionId);
```

## API surface (M1)

| Method | Gateway |
|--------|---------|
| `health` / `ready` | `GET /health` `/ready` |
| `createSession` | `POST /v1/sessions` |
| `getSession` / `listSessions` | `GET …` |
| `endSession` | `POST …/end` |
| `mintToken` | `POST …/tokens` |
| `startEgress` / `startHlsEgress` / `startFileEgress` | `POST …/egress` |
| `listEgress` / `getEgress` / `stopEgress` | egress status |
| `getPlayback` | `GET …/playback` |

Errors: `SoftQraftApiError` with `status`, `code`, `requestId`.

## Cost honesty

Self-host ≠ automatic savings vs LiveKit Cloud. See:

- `docs/operations/cost-posture-and-planes.md`  
- ADR-009  

## Version

- Package: see `package.json` / `SDK_VERSION`  
- HTTP contract: `GATEWAY_API_VERSION === "v1"`  
