# ADR-005: App-agnostic media platform (not Clatters-branded product)

| Field | Value |
|-------|--------|
| **Status** | Accepted |
| **Date** | 2026-08-02 |
| **Context** | First production consumer is Clatters (The_Scholar), but the platform must meet many live/realtime situations |

## Decision

Build this repository as an **application-agnostic realtime media platform**:

1. **No hard dependency** on Clatters domain concepts (Nest, Echo, workspace, CoLAB).  
2. **Capability profiles** describe what a deployment can do (realtime, recording, broadcast, hybrid).  
3. **Consumers** (Clatters, future apps) integrate via HTTP Gateway + LiveKit-compatible realtime, with optional adapters/examples only.  
4. Clatters appears under `docs/integration/consumers/` and `examples/` as a **reference consumer**, not as the product name of the stack.

## Product name

Superseded by **[ADR-007](ADR-007-softqraft-open-source-identity.md)**:

| Layer | Name |
|-------|------|
| Organization | SoftQraft Labs Ltd. |
| Product | **SoftQraft Realtime Media** |
| Package scope | `@softqraft/*` |
| Deployable stack | Self-hosted LiveKit plane + Gateway |
| First consumer | Clatters / The_Scholar (example only) |

## Capability profiles (meet every situation)

| Profile id | Situation | Primary protocols |
|------------|-----------|-------------------|
| `interactive` | Meetings, CoLAB-like calls, small rooms | WebRTC SFU only |
| `creator_live_webrtc` | Instagram-like live, audience on WebRTC | WebRTC publish + subscribe |
| `creator_live_hls` | Large audience, cost-sensitive | WebRTC stage + HLS/CDN audience |
| `hybrid_live` | Stage guests + large crowd | WebRTC stage + HLS + optional VIP WebRTC |
| `recording_only` | Capture room to file/VOD | Egress file → object storage |
| `live_plus_recording` | Live now + replay later | Any live profile + file and/or HLS archive |

A single deployment can enable multiple profiles via config flags.

## Gateway contract principles (agnostic)

- Resources named **sessions / rooms / participants / egress jobs / playback** — not nests/echoes.  
- Callers pass **external references** (`externalId`, metadata bag) for their domain ids.  
- **Room names** are caller-controlled or gateway-generated; both supported.  
- **Storage layouts** are templates (e.g. `{externalId}/{sessionId}-{time}.mp4`), not hard-coded `live-echo/`.  
- **Webhook delivery** is generic (signed callbacks to consumer URLs).

## Consequences

**Positive**

- Reusable across products and white-label  
- Clatters can still drop in with a thin adapter  
- Clear extension path for HLS without breaking file-recording consumers  

**Tradeoffs**

- Examples must show mapping (Clatters Nest → session metadata)  
- Slightly more config surface than a single-app sidecar  

## Alternatives rejected

| Alternative | Why not |
|-------------|---------|
| “Clatters Media Platform” as core identity | Locks naming and APIs to one app |
| Fork LiveKit only, no Gateway | Weak multi-app policy, secrets, playback aggregation |
| Build only for HLS and ignore file Echo | Breaks Clatters current Echo path |
