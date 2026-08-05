# Cost posture and deployment planes

**Status:** Accepted (2026-08-04)  
**Product purpose:** Cost cutting vs **LiveKit Cloud + Egress**  
**ADR:** [ADR-009](../decisions/ADR-009-cost-planes-and-hosting-posture.md)  
**Scenarios:** [cost-improvement-analysis.md](cost-improvement-analysis.md)  
**Implementation plan:** [../roadmap/cost-product-implementation-plan.md](../roadmap/cost-product-implementation-plan.md)

---

## 1. Decision for you

| Decision | Detail |
|----------|--------|
| **Demo plane** | Current **GCP** public SFU (`media` / `realtime.softqraftlabs.com`) is for **product proof**: Gateway, WebRTC, TLS, TURN, admin, integration. |
| **Economic production plane** | Real cost-sensitive traffic must run on a **bandwidth-cheap** media origin (multi-TB include or ~$0–5/TB class), not hyperscaler list egress. |
| **Marketing** | Do **not** claim “cheaper than LiveKit Cloud” for demo-plane traffic. |
| **Product work** | Admin polish + public SDK may proceed on the demo plane. |
| **Consumer cutover (e.g. Clatters later)** | Requires economic plane (and hybrid HLS when audiences grow). |

---

## 2. Planes

```text
┌─────────────────────────────────────────────────────────────┐
│  PRODUCT DEMO PLANE (current public GCP)                    │
│  Prove: sessions · tokens · ICE · admin · SDK               │
│  Egress $/GB ≈ LiveKit Cloud list → no cost thesis proof    │
└─────────────────────────────────────────────────────────────┘
                              │ same Gateway API / same SDK
                              ▼
┌─────────────────────────────────────────────────────────────┐
│  ECONOMIC PRODUCTION PLANE (required for ROI)               │
│  Origin: cheap-bandwidth VPS / bare metal                   │
│  Optional: HLS origin → CDN (Bunny / Cloudflare / R2 path)  │
│  Cost claims valid only when traffic lives here             │
└─────────────────────────────────────────────────────────────┘
```

| Attribute | Demo plane | Economic production plane |
|-----------|------------|---------------------------|
| Example host | GCP VM (current) | Hetzner / OVH / similar class |
| Internet egress | ~$0.08–0.12/GB | Included TB or ~$0–0.005/GB class |
| Purpose | UX, reliability, SDK | Unit-cost of delivered media |
| LiveKit Cloud parity | Control + media self-host | Control + media + **cheaper GB** |
| HLS/CDN | Optional demo | Required for 1k–10k passive |

---

## 3. LiveKit Cloud vs SoftQraft (meters)

| Meter | LiveKit Cloud (list) | SoftQraft |
|-------|----------------------|-----------|
| Downstream media (WebRTC) | **$0.10–$0.12/GB** after include | **Host egress price** |
| Connection minutes | Secondary for video | $0 (your VMs) |
| Room composite / video transcode | ~$0.015–0.02/min after include | Your Egress CPU |
| Plan base | $0 / $50 / $500 | $0 to LiveKit |
| Echo object storage | Your S3 (if Cloud writes out) | Your S3/MinIO (ADR-006 keeps AWS for Echo cutover) |

**Dominant lever for creator live (WebRTC audience):** downstream **GB**.

```text
GB ≈ N_viewers × bitrate_Mbps × hours × 3600 / 8000
```

| Scenario | Approx GB | Cloud @ $0.11/GB |
|----------|----------:|-----------------:|
| 100 viewers × 1.5 Mbps × 1 h | ~67.5 | ~$7.40 / hour |
| ~6.8 TB / month moderate live | 6.8k GB | ~$740 / month |
| 10k × 1.5 Mbps × 1 h | ~6.8 TB | ~$740 / show-hour |

---

## 4. When the cost thesis holds

| Condition | Thesis |
|-----------|--------|
| SoftQraft on **hyperscaler list egress** (GCP Premium-class) | **Fails** primary GB win; only plan base + minutes + DIY ops |
| SoftQraft on **bandwidth-cheap origin** | **Holds** for tens–low hundreds concurrent WebRTC |
| SoftQraft **hybrid** (stage WebRTC + HLS CDN) | **Required** for 1k–10k passive cost control |
| Echo-only migration | Secondary savings (composite minutes), not the main bill |

---

## 5. Cost profiles (product language)

| Profile | Audience path | Cost note |
|---------|---------------|-----------|
| `interactive` | Small WebRTC rooms | Best demo; modest GB |
| `creator_live_webrtc` | All audience WebRTC | Cheap **only** on economic plane |
| `creator_live_hls` / `hybrid_live` | Crowd on HLS/CDN | Scale cost product |
| `recording_*` | File/VOD | Echo CPU + storage; not fan-out |

Admin and SDK must surface these notes so integrators do not assume “self-host = free.”

---

## 6. Operator checklist (prove ROI)

1. Export last full month from **LiveKit Cloud**: downstream GB, plan, egress minutes.  
2. Deploy / migrate media plane to **economic production** host class.  
3. Run comparable shows; record SoftQraft **usage metrics** (Gateway) + host bandwidth bill.  
4. Compare: `Cloud_media − (VM + host_egress + ops)`.  
5. For large passive audiences: enable **hybrid HLS + CDN** before claiming scale savings.

---

## 7. Related docs

| Doc | Role |
|-----|------|
| [cost-improvement-analysis.md](cost-improvement-analysis.md) | Numeric scenarios |
| [ADR-004](../decisions/ADR-004-infrastructure-posture.md) | No Cloud / no AWS primary media |
| [ADR-009](../decisions/ADR-009-cost-planes-and-hosting-posture.md) | Dual-plane decision |
| [turn-hls-cdn.md](turn-hls-cdn.md) | TURN / HLS / CDN ops |
| [public-sfu-readiness.md](public-sfu-readiness.md) | Demo-plane hardening |
