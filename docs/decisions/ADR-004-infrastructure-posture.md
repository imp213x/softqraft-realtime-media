# ADR-004: Infrastructure posture — no LiveKit Cloud, no AWS as primary media path

| Field | Value |
|-------|--------|
| **Status** | Accepted |
| **Date** | 2026-08-02 |
| **Context** | Managed LiveKit and AWS costs are actively hurting Clatters |

## Decision

| Concern | Posture |
|---------|---------|
| LiveKit Cloud | **Not** primary; migration target is self-host |
| AWS | **Not** primary for media compute or egress bandwidth |
| Compute / SFU / Egress | Bandwidth-cheap VPS or bare metal (e.g. Hetzner, OVH class) |
| Object storage | Prefer low/zero-egress (e.g. Cloudflare R2, Hetzner Object Storage) |
| CDN | Cloudflare or Bunny (or equivalent) for audience HLS |
| Local/dev | Docker Compose on developer machines |

AWS or other clouds may appear later only for **non-media** workloads if Clatters already depends on them; media plane design must not require AWS egress.

## Rationale

Media cost is dominated by **egress bytes** and **managed per-minute/GB pricing**. Self-host on generous-bandwidth providers + CDN is the structural fix.

## Consequences

- Ops team owns UDP, TLS, TURN, capacity.  
- Compose-first, not EKS-first.  
- CDN configuration is part of the product, not an afterthought.  

**Clarification (2026-08-04):** A **demo plane** may temporarily run on GCP for product proof.  
**Cost claims** require the **economic production plane** on bandwidth-cheap hosts.  
See [ADR-009](ADR-009-cost-planes-and-hosting-posture.md).
