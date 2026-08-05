# ADR-009: Cost planes and hosting posture

| Field | Value |
|-------|--------|
| **Status** | Accepted |
| **Date** | 2026-08-04 |
| **Supersedes** | Clarifies [ADR-004](ADR-004-infrastructure-posture.md) in light of GCP demo deploy |
| **Related** | [cost-posture-and-planes.md](../operations/cost-posture-and-planes.md), [cost-product-implementation-plan.md](../roadmap/cost-product-implementation-plan.md) |

## Context

SoftQraft Realtime Media exists primarily to **cut cost vs LiveKit Cloud + Cloud Egress**.  
A public interactive SFU was proven on **GCP**. GCP/AWS **list internet egress** is the same order as LiveKit Cloud (**~$0.10–0.12/GB**). Self-hosting on that class of network does **not** deliver the product’s economic purpose.

## Decision for you (accepted)

| Plane | Role | Hosting class | Cost claim |
|-------|------|---------------|------------|
| **Product demo plane** | Prove Gateway + LiveKit UX, TLS, TURN, admin, SDK integration | May run on **GCP** (current public SFU) | **Do not** market as cost win |
| **Economic production plane** | Carry real audience traffic for cost-sensitive consumers | **Bandwidth-cheap** origin (VPS/bare metal with included or ~$0–5/TB egress) ± later CDN | Cost claims **only** on this plane |

**Decision (operator):**

- Treat **GCP public SFU** as the **product demo plane**.  
- Treat **bandwidth-cheap origin (+ later HLS/CDN)** as the **economic production plane**.  
- Admin/SDK polish may proceed on either plane.  
- **Do not market cost win** until traffic runs on the economic production plane (and/or hybrid HLS for large passive audiences).

## Cost thesis (normative)

| Lever | Effect |
|-------|--------|
| Self-host SFU on cheap egress | Primary win vs LiveKit Cloud **downstream GB** |
| Self-host Egress workers | Win vs Cloud composite/transcode minutes |
| Drop Cloud plan base | Secondary ($0 / $50 / $500) |
| Pure WebRTC at 1k–10k viewers | Expensive on **any** plane; need **hybrid HLS + CDN** |
| Echo on AWS S3 | Storage bill unchanged if kept ([ADR-006](ADR-006-echo-recording-storage-aws.md)) |

## Consequences

1. Docs, Admin UI, and SDK must label **cost profiles** and **planes** honestly.  
2. Economic production deploy runbook is required before consumer cutover claims ROI.  
3. Gateway should expose **usage metering** so operators can compare their curve to LiveKit Cloud.  
4. Hybrid HLS remains part of the **cost product**, not an optional afterthought at scale.

## Alternatives considered

| Alternative | Why rejected |
|-------------|--------------|
| Claim savings on GCP SoftQraft alone | Transfer unit cost ≈ LiveKit Cloud |
| Delay all product polish until cheap host exists | Blocks public SDK; demo plane is still valuable |
| Pure WebRTC forever for 10k | Structurally fails cost and capacity |
