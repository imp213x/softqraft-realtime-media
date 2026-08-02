# ADR-006: Keep recording/Echo object storage on AWS initially

| Field | Value |
|-------|--------|
| **Status** | Accepted |
| **Date** | 2026-08-02 |
| **Context** | First consumer (Clatters) writes LiveKit Room Composite MP4 to AWS S3; realtime cost is the immediate pain |

## Decision

1. **Realtime media plane** (LiveKit SFU, TURN, Egress workers, Gateway) runs **self-hosted** on bandwidth-cheap infrastructure — **not** LiveKit Cloud, **not** AWS as primary WebRTC egress plane.  
2. **Recording / Echo file output** continues to use **AWS S3** (existing buckets, regions, IAM, lifecycle) for the first production cutover.  
3. Moving recordings to R2 / Hetzner Object Storage / other S3-compatible backends is a **later migration**; the platform must keep storage **pluggable** (endpoint, path template, credentials).

## Rationale

- Clatters already depends on `S3_BUCKET_NAME` + `AWS_*` for Echo and app uploads.  
- Changing storage and realtime in one cutover increases risk.  
- Self-hosting LiveKit + Egress removes the dominant **managed realtime** cost while Egress workers still write to the same S3 keys Clatters expects.  
- S3 **PUT** volume for one MP4 per session is small vs continuous WebRTC fan-out to thousands of viewers.

## Consequences

**Do**

- Configure self-hosted Egress with AWS credentials (or instance role where applicable) and existing key templates (e.g. `live-echo/{externalId}/{sessionId}-{time}.mp4`).  
- Keep Gateway storage config abstract (`s3_compatible` + endpoint).  

**Do not**

- Block Phase 1 on leaving AWS entirely.  
- Hard-code AWS-only APIs in the Gateway core (use S3-compatible SDK options).  

## Follow-up (not now)

- Optional dual-write or cutover of recording bucket to zero-egress object storage.  
- Lifecycle and cost review of `live-echo/` retention.
