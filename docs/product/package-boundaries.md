# Package boundaries (M1)

**Status:** Active — freeze for integrators  
**Date:** 2026-08-06  
**Related:** [cto-next-phase-decision.md](cto-next-phase-decision.md)

## Rule

Consumer applications integrate SoftQraft **only** through:

1. **`@softqraft/sdk`** (Node/TS backend), or  
2. **Gateway HTTP API v1** ([openapi](../api/openapi/openapi-v1.yaml) / [gateway-api-v1.md](../api/gateway-api-v1.md))

They must **not** import:

- `services/gateway-api/**`  
- LiveKit server secrets  
- Admin routes or `GATEWAY_ADMIN_TOKEN`  

Browsers use **LiveKit client SDK** + tokens from *your* backend (which calls SoftQraft).

## Packages

| Package | Role | Public? |
|---------|------|---------|
| `@softqraft/shared` | Types, error codes, cost plane enums | Internal / peer of sdk |
| `@softqraft/sdk` | **Only** app-facing HTTP client | **Yes — integrators** |
| `@softqraft/gateway-api` | Control plane service | Deploy artifact, not npm consumer |
| `deploy/*` | Compose, Caddy, env | Ops only |

```text
[Your app backend] --@softqraft/sdk--> [Gateway HTTP]
[Your app clients] --livekit-client--> [LiveKit WSS + media]
                     ^ token from your backend
```

## Install (monorepo / file)

```bash
# In SoftQraft repo
pnpm install
pnpm run build:sdk

# Consumer workspace (pnpm)
# package.json:
#   "@softqraft/sdk": "workspace:*"   # if monorepo
# or path:
#   "@softqraft/sdk": "file:../softqraft-realtime-media/packages/sdk"
```

```ts
import { SoftQraftClient, SDK_VERSION, GATEWAY_API_VERSION } from "@softqraft/sdk";
```

Env (app backend):

```bash
SOFTQRAFT_GATEWAY_URL=https://media.softqraftlabs.com
SOFTQRAFT_API_KEY=sqk_...   # from Admin console
```

## Golden path (interactive live)

```ts
const sq = new SoftQraftClient({
  baseUrl: process.env.SOFTQRAFT_GATEWAY_URL!,
  apiKey: process.env.SOFTQRAFT_API_KEY!,
});

const session = await sq.createSession({
  externalId: "event-1",
  profile: "creator_live_webrtc",
});

const { token, realtimeUrl, iceServers } = await sq.mintToken(session.sessionId, {
  identity: "user-host",
  role: "host",
});

// Client: livekit-client Room.connect(realtimeUrl, token, { rtcConfig: { iceServers } })
```

## Capability methods (optional)

| Method | When |
|--------|------|
| `createSession` / `mintToken` / `endSession` | **Required** interactive path |
| `startHlsEgress` / `getPlayback` | Large passive audience (later) |
| `startFileEgress` | Echo/VOD when product needs it |

Do not put consumer business logic in `gateway-api`.

## Versioning

| Artifact | Policy |
|----------|--------|
| `@softqraft/sdk` | Semver; breaking HTTP changes → major |
| Gateway `/v1` | Additive fields OK; breaks → `/v2` |
| `GATEWAY_API_VERSION` export | `"v1"` constant in SDK |

## Checklist (M1 done)

- [x] Documented package boundaries  
- [x] SDK covers sessions, tokens, egress, playback, health/ready  
- [x] SDK tests for auth header + errors + HLS start  
- [x] README install + golden path  
- [x] No requirement for consumers to clone gateway source  

## Next (M2)

Contract tests/lint CI on `shared` + `sdk` + critical gateway modules.
