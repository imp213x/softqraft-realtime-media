# `@softqraft/sdk`

Public **backend** HTTP client for SoftQraft Realtime Media Gateway.

- **Use:** Node.js / server runtimes  
- **Do not:** ship API keys to browsers or mobile apps  
- **Clients:** LiveKit SDK + `token` / `realtimeUrl` / `iceServers` from `mintToken`

## Install (workspace)

```bash
pnpm --filter @softqraft/sdk build
```

## Usage

```ts
import { SoftQraftClient } from "@softqraft/sdk";

const sq = new SoftQraftClient({
  baseUrl: process.env.SOFTQRAFT_GATEWAY_URL!,
  apiKey: process.env.SOFTQRAFT_API_KEY!,
});

const session = await sq.createSession({
  externalId: "show-1",
  profile: "interactive",
  realtime: { maxParticipants: 50 },
});

const { token, realtimeUrl, iceServers } = await sq.mintToken(
  session.sessionId,
  { identity: "host-1", role: "host" },
);

// LiveKit client: room.connect(realtimeUrl, token, { rtcConfig: { iceServers } })
await sq.endSession(session.sessionId);
```

## Cost honesty

Self-host ≠ automatic savings vs LiveKit Cloud. See repo docs:

- `docs/operations/cost-posture-and-planes.md`  
- `docs/operations/platform-maturity-assessment.md`  

## Maturity

This client targets the **Gateway HTTP API v1**. Platform multi-tenant production hardening is still in progress (see maturity assessment).
