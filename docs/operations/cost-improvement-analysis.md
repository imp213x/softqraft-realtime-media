# Cost improvement analysis — LiveKit Cloud vs SoftQraft self-host

**Date:** 2026-08-02  
**Product:** SoftQraft Realtime Media  
**Context:** Clatters currently pays LiveKit Cloud for realtime + Cloud Egress; Echo files already go to AWS S3.

**Status of savings today**

| Environment | Media bill impact |
|-------------|-------------------|
| Local dual-run (MinIO) | **$0** LiveKit Cloud for those sessions (dev only) |
| Production cutover (not done yet) | Savings **start only after** prod points at SoftQraft |
| Echo object storage | **Unchanged** if still AWS S3 (ADR-006) |

This document estimates **production** savings once SoftQraft carries realtime traffic. Numbers use public LiveKit Cloud list rates (Ship/Scale-class: **~$0.10–$0.12/GB** downstream after included allowance; connection minutes are secondary). Hosting examples use **cheap-bandwidth EU VPS/bare metal** (order-of-magnitude; not a quote).

---

## 1. What you stop paying LiveKit Cloud for

When Clatters uses SoftQraft instead of LiveKit Cloud:

| Meter | LiveKit Cloud (typical) | SoftQraft self-host |
|-------|-------------------------|---------------------|
| Downstream media to viewers (WebRTC) | **$0.10–$0.12 / GB** overage (after plan include) | Host bandwidth (often **included TB** or **~$0–1/TB** class on EU metal) |
| Connection minutes | Plan include then **~$0.0004–0.0005 / min** | **$0** (your VMs) |
| Cloud Egress (room composite CPU) | Transcode/composite minutes + path to S3 | **Your** Egress CPU on your VMs |
| Platform fee | Build $0 / Ship **$50** / Scale **$500** / mo base | **$0** to LiveKit |

What you **still** pay elsewhere:

| Cost | Notes |
|------|--------|
| AWS S3 for Echo (if kept) | Storage + **PUT** (small vs live fan-out) |
| SoftQraft VMs | 24/7 compute for SFU + Redis + Egress workers |
| Ops time | You own uptime, upgrades, capacity |
| CDN (Phase 3) | Required for market-grade 10k; **cheaper than WebRTC-to-all** |

---

## 2. Bandwidth is the main lever

### Rule of thumb

Rough downstream GB for one live (average bitrate \(B\) Mbps, \(N\) viewers, \(H\) hours):

\[
\text{GB} \approx N \times B \times H \times 3600 / 8 / 1000
\]

Example: **1.5 Mbps** average receive, **100 viewers**, **1 hour**:

\[
100 \times 1.5 \times 3600 / 8000 \approx \mathbf{67.5\ GB}
\]

### LiveKit Cloud cost of that hour (overage rate only)

| Rate | Cost for 67.5 GB |
|------|------------------|
| $0.12 / GB | **~$8.10** |
| $0.10 / GB | **~$6.75** |

### Same hour self-hosted on generous EU bandwidth

Often **~$0 incremental** if within included transfer (e.g. multi‑TB include on cloud VMs / “unlimited” class dedicated).  
If overage at ~€1/TB: **~$0.07** for 67.5 GB.

**Order-of-magnitude improvement on pure media GB:** often **~10×–100×+** vs LiveKit Cloud overage pricing, depending on host plan.

---

## 3. Scenario models (illustrative)

Assumptions for “current Clatters-like” WebRTC-to-all audience (what you run today):

- Average **1.5 Mbps** downstream per viewer  
- LiveKit Cloud overage **$0.11 / GB** blended (mid of 0.10–0.12)  
- Self-host fixed: **$80–150 / mo** for a serious single region (SFU + Redis + 1–2 Egress workers on cheap EU host) — tune to real quotes  
- Self-host bandwidth: **$0** extra until multi-TB (included)

### A — Small production month

| Metric | Value |
|--------|------:|
| Concurrent peak | 50 viewers / show |
| Shows | 200 hours of “viewer·hours” equivalent* |

\* e.g. 200 hours with 50 average concurrent ≈ same as 10,000 viewer-hours.

Bandwidth ≈ \(50 \times 1.5 \times 200 \times 3600 / 8000 \approx \mathbf{6{,}750\ GB} \approx 6.6\ TB\)

| Bill | Estimate |
|------|----------|
| LiveKit Cloud overage @ $0.11/GB | **~$740** (+ plan base if any) |
| SoftQraft VMs | **~$80–150** |
| **Indicative saving** | **~$600–650 / mo** at this volume |

### B — Growth month (still pure WebRTC)

| Metric | Value |
|--------|------:|
| Viewer-hours | 50,000 (e.g. 100 concurrent × 500 h) |

Bandwidth ≈ \(100 \times 1.5 \times 500 \times 3600 / 8000 \approx \mathbf{33{,}750\ GB} \approx 33\ TB\)

| Bill | Estimate |
|------|----------|
| LiveKit Cloud @ $0.11/GB | **~$3,700** |
| SoftQraft (scale VMs) | **~$200–400** (more CPU/nodes) |
| **Indicative saving** | **~$3,000+ / mo** |

### C — One “10k viewer” show (1 hour, pure WebRTC) — **why Phase 3 exists**

Bandwidth ≈ \(10{,}000 \times 1.5 \times 1 \times 3600 / 8000 \approx \mathbf{6{,}750\ GB}\) **per hour**

| Path | Cost sense |
|------|------------|
| LiveKit Cloud WebRTC CDN-like | **~$675–810 / hour** @ $0.10–0.12/GB |
| SoftQraft pure WebRTC self-host | Still **~6.7 TB outbound** — need huge uplink; not “free” |
| SoftQraft **stage WebRTC + HLS CDN** (Phase 3) | Origin ~1 stream encode; **CDN** ~$1–5/TB class → **orders of magnitude** cheaper than WebRTC×10k |

**Confirmed product rule:** cost improvement at Instagram-scale audience is **not complete** until HLS/CDN (Phase 3). Self-host alone helps **a lot** for tens–low hundreds concurrent WebRTC; 10k needs hybrid.

---

## 4. Egress (Echo) cost

| Item | LiveKit Cloud | SoftQraft |
|------|---------------|-----------|
| Room composite CPU | Metered composite/transcode minutes | Your CPU (already sized for workers) |
| Write recording to S3 | Cloud may charge transfer **to** storage | Path is **Egress → S3** from your host (or free path to MinIO locally) |
| S3 storage | Your AWS bill | Same if Echo stays on AWS |

**Net:** Echo is usually **smaller** than live fan-out unless you record every session at high bitrate. Moving Echo off AWS later is optional; **realtime** is the big LiveKit Cloud line item.

Local MinIO: **$0** for storage/API during dual-run tests.

---

## 5. What you have “gotten” **right now**

| Gain | Confirmed? |
|------|------------|
| Working self-host SFU + Egress + Gateway | **Yes** (local) |
| Clatters local Live without LiveKit Cloud | **Yes** (when pointed at SoftQraft) |
| Echo to MinIO (no prod bucket) | **Yes** (~254 MiB sample under `live-echo/…`) |
| Production $ savings | **Not yet** — prod still on Cloud until cutover |
| Path to 10k-cheap | **Designed**, not built (Phase 3 HLS/CDN) |

**Improvement realized today:** technical risk reduced + **$0 Cloud media for local/dev traffic** + proven architecture.  
**Improvement available after cutover:** remove LiveKit Cloud **GB + minutes + plan base** for that traffic, replace with fixed/cheap host bandwidth.

---

## 6. Formula to compute *your* Cloud bill improvement

From LiveKit Cloud dashboard (last full month):

1. **Downstream GB** × $0.10–0.12 (minus included GB)  
2. **Connection minutes** overage (if any)  
3. **Egress/composite minutes** charges  
4. Plan base (Ship/Scale)

**SoftQraft replacement cost (monthly):**

\[
\text{VMs} + \text{bandwidth overage} + \text{ops} + \text{(optional CDN later)}
\]

\[
\text{Monthly savings} \approx (1)+(2)+(3)+(4) - \text{SoftQraft ops}
\]

Without your dashboard numbers we use scenarios above; plug in real GB for a firm figure.

---

## 7. Market-grade product (CDN, HLS, NAT) — cost angle

| Capability | Cost role |
|------------|-----------|
| **TURN / NAT hardening** | More relay GB on *your* network (still usually &lt; Cloud rates); needed for mobile reliability |
| **HLS + CDN** | Moves mass audience off SFU fan-out; **largest** unit-cost drop at 1k–10k viewers |
| **Multi-region** | Higher fixed cost; lower latency / better conversion |
| **Observability / SLA** | Soft cost (time) or SaaS tools |

Positioning SoftQraft as something **other teams pay for** = sell the **ops package + cost curve** (self-host media + optional managed CDN origin), not only “LiveKit in Docker.”

---

## 8. Bottom line

| Question | Answer |
|----------|--------|
| Cost improvement **so far**? | **Architecture + local $0 Cloud media**; **not** full prod savings until cutover |
| Biggest $ win after cutover (current product shape)? | **Eliminate LiveKit Cloud downstream GB** on WebRTC lives |
| Biggest $ win at 10k viewers? | **Phase 3 hybrid** (WebRTC stage + HLS CDN), not pure SFU |
| Echo AWS | Small vs live; can keep S3; local MinIO already $0 for tests |

**Honest range after production SoftQraft cutover (WebRTC audience, no HLS yet):**  
often **~70–95% reduction** of the **LiveKit Cloud media transfer** line vs list rates, at moderate concurrent users, if hosted on bandwidth-cheap infra — **provided** you accept owning ops.  
**10k pure WebRTC** remains expensive everywhere; market-grade requires CDN/HLS.
